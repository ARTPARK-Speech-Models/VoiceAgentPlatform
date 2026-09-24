import asyncio
import time
import uuid
from collections.abc import AsyncGenerator

from google import genai
from google.genai import types
from LLM.default_configs import (
    MAX_NEW_TOKENS,
    SYSTEM_PROMPT,
    TEMPERATURE,
    TOP_P,
)
from LLM.tools import ToolRegistry

# Total budget for one Gemini call (a tool-calling round trip's recursive
# call is bounded separately). Without this, a stalled response_stream
# (observed with gemma-4-26b-a4b-it's preview endpoint) hangs the turn
# forever -- no error, no fallback, nothing.
GEMINI_STREAM_TIMEOUT_S = 60


class GeminiLLM:
    def __init__(self, tool_registry: ToolRegistry = None, allowed_tools: set[str] = None, model_name = "gemini-2.5-flash-lite", api_key: str = None):
        # Always the user's own key (agent-level or Settings) -- never an
        # implicit GEMINI_API_KEY env read, so the server can't silently pay.
        if not api_key:
            raise ValueError("A Google API key is required -- add one in Settings.")
        self.client = genai.Client(api_key=api_key)
        self.model_id = model_name.lower()
        self.tool_registry = tool_registry
        self.allowed_tools = allowed_tools or set()
        
        # ==========================================
        # OPTIMIZATION: Build and cache tools once
        # ==========================================
    def compile_tools(self):
        """Compiles and caches the tools once they are populated in the registry."""
        if self.tool_registry:
            self.gemini_tools = self.tool_registry.as_gemini(allowed_tools=self.allowed_tools)
            if self.gemini_tools:
                for t in self.gemini_tools[0].function_declarations:
                    print(t.name, "->", repr(t.description))
                    print(t.parameters)
                    print("---")

            
    def format_history(self, history: list[dict]) -> list[types.Content]:
        formatted_contents = []
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            if "content" in msg and msg["content"]:
                formatted_contents.append(
                    types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
                )
            elif "function_calls" in msg:
                # Replay thought_signature (captured in generate() from the
                # original response part) alongside each function call --
                # Part.from_function_call() has no parameter for it, so the
                # Part is built directly instead. Thinking-capable models
                # reject the request on any later turn if it's missing.
                parts = [
                    types.Part(
                        function_call=types.FunctionCall(name=fc["name"], args=fc["args"]),
                        thought_signature=fc.get("thought_signature"),
                    )
                    for fc in msg["function_calls"]
                ]
                formatted_contents.append(types.Content(role="model", parts=parts))
            elif "function_responses" in msg:
                parts = [
                    types.Part.from_function_response(name=fr["name"], response={"result": fr["response"]})
                    for fr in msg["function_responses"]
                ]
                formatted_contents.append(types.Content(role="user", parts=parts))
        return formatted_contents

    async def generate(self, 
        text: str, 
        history: list[dict], 
        request_id=None, 
        language="en", 
        
        agent_name: str = "default",
        system_prompt: str = SYSTEM_PROMPT,
        temperature = TEMPERATURE,
        max_tokens = MAX_NEW_TOKENS
        ) -> AsyncGenerator[dict, None]:
        request_id = str(request_id or uuid.uuid4())
        
        if text:
            history.append({"role": "user", "content": text})

        # Pass the pre-computed tools directly into the config
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            top_p=TOP_P,
            max_output_tokens=max_tokens,
            tools=self.gemini_tools,
            tool_config=types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode="AUTO")
            )
        )

        t0 = time.perf_counter()
        if text: 
            yield {"event": "stream_start", "request_id": request_id}

        full_reply = ""
        function_calls_to_run = []
        # usage_metadata is cumulative for the whole call so far -- the
        # last chunk that carries one already has the final totals, no
        # need to sum per-chunk deltas (confirmed live: candidates_token_
        # count/total_token_count both keep growing chunk to chunk, same
        # object shape throughout). None if the SDK ever omits it (issue
        # #31 -- token/cost counter needs real usage, not a guess).
        last_usage = None

        try:
            async with asyncio.timeout(GEMINI_STREAM_TIMEOUT_S):
                contents_payload = self.format_history(history)
                response_stream = await self.client.aio.models.generate_content_stream(
                    model=self.model_id,
                    contents=contents_payload,
                    config=config
                )

                async for chunk in response_stream:
                    if chunk.usage_metadata:
                        last_usage = chunk.usage_metadata
                    delta = chunk.text
                    if delta:
                        full_reply += delta
                        yield {
                            "event":      "token",
                            "delta":      delta,
                            "request_id": request_id,
                            "language":   language or "en"
                        }

                    # Iterate parts directly instead of chunk.function_calls --
                    # that convenience property (see the SDK's
                    # GenerateContentResponse.function_calls) only extracts
                    # each part's bare FunctionCall, silently dropping the
                    # sibling thought_signature field on the same Part.
                    # Thinking-capable models (e.g. gemini-3.5-flash-lite)
                    # require that signature to be replayed back in history
                    # on later turns -- without it every turn after the
                    # first tool call fails with "Function call is missing a
                    # thought_signature in functionCall parts" (400).
                    parts = (chunk.candidates[0].content.parts
                             if chunk.candidates and chunk.candidates[0].content else None)
                    if parts:
                        for part in parts:
                            function_call = part.function_call
                            if function_call is None:
                                continue
                            print(f"[DEBUG] Gemini requested tool: {function_call.name} args={dict(function_call.args)}")
                            if function_call.name in self.allowed_tools:
                                function_calls_to_run.append({
                                    "name": function_call.name,
                                    "args": dict(function_call.args),
                                    "thought_signature": part.thought_signature,
                                })
                            else:
                                print(f"[DEBUG] Tool '{function_call.name}' NOT in allowed_tools={self.allowed_tools} — dropped")

        except Exception as e:
            # bare asyncio.TimeoutError/TimeoutError has an empty str(e) --
            # name it explicitly so the log/error event says what happened.
            message = f"Gemini call timed out after {GEMINI_STREAM_TIMEOUT_S}s" if isinstance(e, TimeoutError) else str(e)
            print(f"Error streaming from Gemini: {message}")
            if history and history[-1].get("role") == "user":
                history.pop()
            yield {"event": "error", "message": message, "request_id": request_id}
            return

        # Handle tool executions if Gemini requested any allowed tools
        if function_calls_to_run:
            history.append({"role": "assistant", "function_calls": function_calls_to_run})
            yield {"event": "tool_start", "request_id": request_id}
            function_responses = []
            for tool_call in function_calls_to_run:
                tool_result = await self.tool_registry.execute_tool(
                    name=tool_call["name"],
                    args=tool_call["args"],
                    agent_name=agent_name.lower()
                )
                function_responses.append({
                    "name": tool_call["name"],
                    "response": tool_result
                })
            
            history.append({"role": "user", "function_responses": function_responses})
            yield {"event": "tool_end", "request_id": request_id}

            # Recurse back into generate() to provide the context update to Gemini
            print("recursive call")
            async for event in self.generate(
                text="",
                history=history,
                request_id=request_id,
                language=language,
                agent_name=agent_name,
                temperature=temperature,
                max_tokens=max_tokens,
                system_prompt=system_prompt
            ):
                # The recursive call's own usage_metadata only covers its
                # own round-trip -- this call's tool-requesting round-trip
                # burned tokens too, so add them in rather than losing this
                # call's usage entirely (was silently dropped before #31).
                if event.get("event") == "stream_end" and last_usage is not None:
                    recursive_usage = event.get("usage")
                    if recursive_usage is not None:
                        event = {
                            **event,
                            "usage": {
                                "prompt_tokens": last_usage.prompt_token_count + recursive_usage["prompt_tokens"],
                                "completion_tokens": last_usage.candidates_token_count + recursive_usage["completion_tokens"],
                                "total_tokens": last_usage.total_token_count + recursive_usage["total_tokens"],
                            },
                        }
                yield event
            print("recursive end")
            return

        if full_reply:
            history.append({"role": "assistant", "content": full_reply})

        # Always yield a terminal event here -- previously conditional on
        # `full_reply or not text`, which meant a turn where the model
        # produced no visible content and no usable tool call (observed with
        # a "thinking" model that burns its whole max_tokens budget on
        # internal reasoning before emitting a real answer) left the caller
        # with no signal the turn ended at all -- the exact silent-hang bug
        # already fixed for OllamaLLM, missed here.
        yield {
            "event":      "stream_end",
            "full_text":  full_reply,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000),
            "request_id": request_id,
            "usage": {
                "prompt_tokens": last_usage.prompt_token_count,
                "completion_tokens": last_usage.candidates_token_count,
                "total_tokens": last_usage.total_token_count,
            } if last_usage is not None else None,
        }