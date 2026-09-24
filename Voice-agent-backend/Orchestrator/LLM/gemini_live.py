"""Gemini Live API LLM -- native audio output, no separate TTS step.

Selected per agent via LLM provider "Google-Live" -- everywhere else in
this codebase, Gemini usage (LLM/gemini.py, TTS/gemini.py) goes through the non-Live
client.aio.models.generate_content_stream() endpoint. This is the first
usage of google.genai's Live API (client.aio.live.connect(),
bidiGenerateContent) in this repo.

Opens a FRESH Live session per turn (inside generate(), closed again
before returning) rather than one persistent session held as instance
state across a whole call. This is a deliberate choice: src/main.py's
`custom_llm` is a bare module-level global, rebound only on an
agent_config_cache miss -- so two concurrent connections can share one
LLM instance. GeminiLLM/OllamaLLM are safe to share because they're
stateless per call (history passed in as an argument each time); holding
an open Live session as self-state would NOT be safe under that same
sharing, so this class stays a stateless-per-call adapter like the
others instead. Trade-off: resends full history every turn (same as
GeminiLLM already does) rather than using Live's own server-side session
memory, and doesn't use Live's native barge-in truncation (not needed --
the existing VAD-driven cancellation in main.py already happens one
layer up, before a new turn's task is even created).

Config details below were confirmed via a live smoke test against the
real API, not guessed:
- response_modalities=["AUDIO", "TEXT"] combined is REJECTED by the
  server ("not supported by the model") -- must be ["AUDIO"] only. Text
  transcript comes from the separate output_audio_transcription config
  field instead, which works fine alongside audio-only modalities.
- Audio arrives at message.server_content.model_turn.parts[i].inline_data,
  confirmed mime_type "audio/pcm;rate=24000" (matches TTS/gemini.py's
  TTS_SAMPLE_RATE -- same resample-if-it-ever-differs defensive pattern
  is mirrored here rather than assumed fixed).
- Text arrives at message.server_content.output_transcription.text.
- Turn-complete signal: message.server_content.turn_complete.
- usage_metadata is present at the top level of LiveServerMessage (not
  nested in server_content) with prompt_token_count/response_token_count/
  total_token_count -- different attribute names than the non-Live
  endpoint's usage_metadata, mapped onto the same "usage" dict shape
  GeminiLLM yields so main.py's call_token_usage accumulation needs no
  changes.
- thinking_config=ThinkingConfig(thinking_budget=0) is required --
  without it, replies routinely ended early/mid-sentence
  (generation_complete+turn_complete fired naturally at as few as 69
  response tokens, well under max_output_tokens, with usage_metadata
  confirming real tokens spent on invisible reasoning first). Disabling
  thinking fixed this consistently across repeated identical-prompt runs.

KNOWN UNRESOLVED ISSUE, not fixable from this side: even with the above,
Live's audio generation is unreliable independent of text generation --
three identical back-to-back test calls (same prompt, same full/complete
transcript each time) produced 0.00s, 0.75s, and 7.31s of actual audio
respectively, including one run with a perfect complete transcript and
*zero* audio bytes at all. output_transcription and the audio in
model_turn.parts are evidently generated somewhat independently inside
Live, and no LiveConnectConfig field found (response_modalities,
thinking_config, realtime_input_config, proactivity) controls this. This
looks like a real limitation of gemini-3.8-live in its current form, not
an integration bug -- flagging clearly rather than silently shipping
something that will sometimes go silent mid-reply or play no audio at
all despite a full, correct transcript.

No tool/RAG support in this v1 -- Live's function-calling wire shape
(a distinct message type + an explicit session.send_tool_response() back
into the *same open session*) is structurally different from
generate_content_stream's inline function_call parts and awkward under
the per-turn-session design above (a tool call would need to happen
mid-receive()-loop, inside that one open session). tool_registry/
allowed_tools are still accepted in __init__ for construction parity
with how src/main.py's get_agent_config() builds every llm_choices entry
the same way, but unused.
"""
import asyncio
import re
import time
import uuid
from collections.abc import AsyncGenerator

import numpy as np
from google import genai
from google.genai import types
from LLM.default_configs import MAX_NEW_TOKENS, SYSTEM_PROMPT, TEMPERATURE
from LLM.tools import ToolRegistry
from scipy.signal import resample

# Same 60s ceiling LLM/gemini.py uses for the non-Live endpoint -- without
# it, a stalled/never-completing Live session would hang the turn forever.
GEMINI_LIVE_TIMEOUT_S = 60

# What TTS/gemini.py's frontend-facing AudioQueue is hardcoded to expect --
# Live's audio came back at exactly this rate in testing, but resampled
# defensively (below) rather than assumed fixed, same as TTS/gemini.py.
AUDIO_SAMPLE_RATE = 24000


class GeminiLiveLLM:
    def __init__(self, tool_registry: ToolRegistry = None, allowed_tools: set[str] = None, model_name="gemini-3.8-live", api_key: str = None):
        if not api_key:
            raise ValueError("A Google API key is required -- add one in Settings.")
        self.client = genai.Client(api_key=api_key)
        self.model_id = model_name.lower()
        # Accepted for llm_choices construction parity with GeminiLLM/
        # OllamaLLM -- unused, see module docstring.
        self.tool_registry = tool_registry
        self.allowed_tools = allowed_tools or set()

    def compile_tools(self):
        """No-op -- v1 has no tool/RAG support, see module docstring."""
        pass

    def format_history(self, history: list[dict]) -> list[types.Content]:
        # Same shape/logic as GeminiLLM.format_history (LLM/gemini.py) --
        # duplicated rather than shared so this class stays self-contained;
        # this bot has no tools in v1 so the function_calls/function_responses
        # branches never actually fire here, but kept for shape-compatibility
        # with the same `history` list every other LLM class reads/writes.
        formatted_contents = []
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            if "content" in msg and msg["content"]:
                formatted_contents.append(
                    types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
                )
            elif "function_calls" in msg:
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

        config = types.LiveConnectConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_modalities=["AUDIO"],
            output_audio_transcription=types.AudioTranscriptionConfig(),
            # Confirmed via live testing: without this, replies routinely
            # ended early/mid-sentence -- generation_complete+turn_complete
            # fired naturally at as few as 69 response tokens even though
            # max_output_tokens allowed far more, with usage_metadata
            # showing real thoughts_token_count spent on invisible
            # reasoning first. Disabling thinking (budget=0) consistently
            # produced full, grammatically complete, multi-sentence replies
            # across repeated identical-prompt runs where it had previously
            # cut off unpredictably.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        t0 = time.perf_counter()
        if text:
            yield {"event": "stream_start", "request_id": request_id}

        full_reply = ""
        last_usage = None

        try:
            async with asyncio.timeout(GEMINI_LIVE_TIMEOUT_S):
                async with self.client.aio.live.connect(model=self.model_id, config=config) as session:
                    contents_payload = self.format_history(history)
                    await session.send_client_content(
                        turns=contents_payload,
                        turn_complete=True,
                    )

                    async for message in session.receive():
                        if message.usage_metadata:
                            last_usage = message.usage_metadata

                        sc = message.server_content
                        if sc is None:
                            continue

                        if sc.model_turn:
                            for part in sc.model_turn.parts or []:
                                blob = part.inline_data
                                if blob is None or not blob.data:
                                    continue
                                pcm_i16 = np.frombuffer(blob.data, dtype=np.int16)
                                arr = pcm_i16.astype(np.float32) / 32768.0

                                mime_type = blob.mime_type or ""
                                match = re.search(r"rate=(\d+)", mime_type)
                                source_rate = int(match.group(1)) if match else AUDIO_SAMPLE_RATE
                                if source_rate != AUDIO_SAMPLE_RATE:
                                    arr = resample(arr, int(len(arr) * AUDIO_SAMPLE_RATE / source_rate)).astype(np.float32)

                                yield {
                                    "event": "audio_chunk",
                                    "pcm": arr.tobytes(),
                                    "request_id": request_id,
                                }

                        if sc.output_transcription and sc.output_transcription.text:
                            delta = sc.output_transcription.text
                            full_reply += delta
                            yield {
                                "event": "token",
                                "delta": delta,
                                "request_id": request_id,
                                "language": language or "en",
                            }

                        if sc.turn_complete:
                            break

        except Exception as e:
            message = f"Gemini Live call timed out after {GEMINI_LIVE_TIMEOUT_S}s" if isinstance(e, TimeoutError) else str(e)
            print(f"Error streaming from Gemini Live: {message}")
            if history and history[-1].get("role") == "user":
                history.pop()
            yield {"event": "error", "message": message, "request_id": request_id}
            return

        if full_reply:
            history.append({"role": "assistant", "content": full_reply})

        # Always yield a terminal event, same fix GeminiLLM needed (a turn
        # producing no visible content would otherwise leave the caller
        # with no signal the turn ended at all).
        yield {
            "event": "stream_end",
            "full_text": full_reply,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000),
            "request_id": request_id,
            "usage": {
                "prompt_tokens": last_usage.prompt_token_count,
                "completion_tokens": last_usage.response_token_count,
                "total_tokens": last_usage.total_token_count,
            } if last_usage is not None else None,
        }
