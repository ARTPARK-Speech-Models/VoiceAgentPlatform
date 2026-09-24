import json
import os
import time
import uuid
from collections.abc import AsyncGenerator

import httpx
from LLM.default_configs import MAX_NEW_TOKENS, SYSTEM_PROMPT, TEMPERATURE
from LLM.tools import ToolRegistry


class OllamaLLM:
    """Remote Ollama-backed provider (e.g. Gemma 3/4 on a separate host),
    reached through an nginx proxy that gates
    access with a static X-API-Key header -- Ollama itself is bound to
    localhost on that box. Supports tool-calling via Ollama's
    OpenAI-compatible /v1/chat/completions endpoint, mirroring
    GeminiLLM's tool_start/tool_end/history round-trip so main.py's event
    handling works unchanged regardless of provider."""

    # Models confirmed (via a live 400) not to support tool-calling in this
    # Ollama deployment -- e.g. gemma3:4b's pulled build has capabilities
    # ["completion"] only (no "tools"), unlike gemma4:e4b's
    # ["completion","tools","thinking"]. Shared across instances so once one
    # request learns this, every subsequent OllamaLLM(model_name=...) for
    # that model skips attaching tools instead of failing every turn.
    _tools_unsupported: set[str] = set()

    def __init__(self, tool_registry: ToolRegistry = None, allowed_tools: set[str] = None, model_name="gemma3:4b"):
        self.model_id = model_name
        self.tool_registry = tool_registry
        self.allowed_tools = allowed_tools or set()
        self.base_url = os.environ.get("OLLAMA_API_BASE", "").rstrip("/")
        self.api_key = os.environ.get("OLLAMA_API_KEY", "")
        self.openai_tools: list[dict] = []

    def compile_tools(self):
        """Compiles and caches the tools once they are populated in the
        registry -- same timing/purpose as GeminiLLM.compile_tools()."""
        if self.tool_registry:
            self.openai_tools = self.tool_registry.as_openai(allowed_tools=self.allowed_tools)
            for t in self.openai_tools:
                print(t["function"]["name"], "->", repr(t["function"]["description"]))

    def format_history(self, history: list[dict]) -> list[dict]:
        messages = []
        for msg in history:
            if "content" in msg and msg["content"]:
                role = "user" if msg["role"] == "user" else "assistant"
                messages.append({"role": role, "content": msg["content"]})
            elif "function_calls" in msg:
                messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": fc["id"],
                            "type": "function",
                            "function": {"name": fc["name"], "arguments": json.dumps(fc["args"])},
                        }
                        for fc in msg["function_calls"]
                    ],
                })
            elif "function_responses" in msg:
                for fr in msg["function_responses"]:
                    messages.append({"role": "tool", "tool_call_id": fr["id"], "content": fr["response"]})
        return messages

    async def generate(
        self,
        text: str,
        history: list[dict],
        request_id=None,
        language="en",
        agent_name: str = "default",
        system_prompt: str = SYSTEM_PROMPT,
        temperature=TEMPERATURE,
        max_tokens=MAX_NEW_TOKENS,
    ) -> AsyncGenerator[dict, None]:
        request_id = str(request_id or uuid.uuid4())

        if text:
            history.append({"role": "user", "content": text})

        if len(history) > 20:
            history[:] = history[-20:]
            if history and history[0]["role"] != "user":
                history.pop(0)

        t0 = time.perf_counter()
        if text:
            yield {"event": "stream_start", "request_id": request_id}

        full_reply = ""
        # index -> {"id", "name", "arguments"} -- Ollama streams tool calls
        # incrementally like OpenAI does, arguments arriving in fragments
        # across multiple chunks, keyed by a per-call index.
        tool_calls_acc: dict[int, dict] = {}

        messages = [{"role": "system", "content": system_prompt}, *self.format_history(history)]
        payload = {
            "model": self.model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if self.openai_tools and self.model_id not in OllamaLLM._tools_unsupported:
            payload["tools"] = self.openai_tools
        headers = {"X-API-Key": self.api_key, "Content-Type": "application/json"}

        # Up to 2 attempts: the second only happens if the first 400s
        # specifically because this model doesn't support tool-calling
        # (e.g. gemma3:4b's pulled build has no "tools" capability) --
        # retried once with tools stripped, and remembered for next time.
        for _attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=120) as client, client.stream(
                    "POST", f"{self.base_url}/v1/chat/completions", json=payload, headers=headers
                ) as response:
                    if response.status_code == 400 and "tools" in payload:
                        body = await response.aread()
                        if b"does not support tools" in body:
                            print(f"[OllamaLLM] {self.model_id} does not support tools -- retrying without them")
                            OllamaLLM._tools_unsupported.add(self.model_id)
                            del payload["tools"]
                            continue
                        response.raise_for_status()  # not the tools case -- raise the real 400
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[len("data: "):]
                        if data == "[DONE]":
                            break
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"]

                        content = delta.get("content")
                        if content:
                            full_reply += content
                            yield {
                                "event": "token",
                                "delta": content,
                                "request_id": request_id,
                                "language": language or "en",
                            }

                        for tc in delta.get("tool_calls") or []:
                            idx = tc.get("index", 0)
                            entry = tool_calls_acc.setdefault(idx, {"id": None, "name": None, "arguments": ""})
                            if tc.get("id"):
                                entry["id"] = tc["id"]
                            fn = tc.get("function") or {}
                            if fn.get("name"):
                                entry["name"] = fn["name"]
                            if fn.get("arguments"):
                                entry["arguments"] += fn["arguments"]
                break  # success -- don't loop again

            except Exception as e:
                print(f"Error streaming from Ollama: {str(e)}")
                if history and history[-1].get("role") == "user":
                    history.pop()
                yield {"event": "error", "message": str(e), "request_id": request_id}
                return

        # Handle tool executions if the model requested any allowed tools
        function_calls_to_run = []
        for idx in sorted(tool_calls_acc):
            entry = tool_calls_acc[idx]
            if not entry["name"]:
                continue
            try:
                args = json.loads(entry["arguments"] or "{}")
            except json.JSONDecodeError:
                print(f"[DEBUG] Ollama tool call '{entry['name']}' had unparseable arguments: {entry['arguments']!r}")
                args = {}
            if entry["name"] in self.allowed_tools:
                function_calls_to_run.append({
                    "id": entry["id"] or f"call_{idx}_{uuid.uuid4().hex[:8]}",
                    "name": entry["name"],
                    "args": args,
                })
            else:
                print(f"[DEBUG] Tool '{entry['name']}' NOT in allowed_tools={self.allowed_tools} -- dropped")

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
                    "id": tool_call["id"],
                    "name": tool_call["name"],
                    "response": tool_result,
                })

            history.append({"role": "tool", "function_responses": function_responses})
            yield {"event": "tool_end", "request_id": request_id}

            # Recurse back into generate() to provide the context update to the model
            async for event in self.generate(
                text="",
                history=history,
                request_id=request_id,
                language=language,
                agent_name=agent_name,
                temperature=temperature,
                max_tokens=max_tokens,
                system_prompt=system_prompt,
            ):
                yield event
            return

        if full_reply:
            history.append({"role": "assistant", "content": full_reply})

        # Always yield a terminal event here (previously conditional on
        # full_reply, which meant a turn where the model produced no
        # content and no usable tool call -- e.g. a bad/empty response --
        # left the caller with no signal the turn ended at all).
        yield {
            "event": "stream_end",
            "full_text": full_reply,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000),
            "request_id": request_id,
        }
