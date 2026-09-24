"""Gemini native TTS, via google.genai -- the same SDK LLM/gemini.py
already uses for text generation. Real code against the real SDK's
confirmed API surface (types.SpeechConfig/VoiceConfig/PrebuiltVoiceConfig,
response_modalities=["AUDIO"]) and against Google's own docs
(https://ai.google.dev/gemini-api/docs/speech-generation, confirmed 24kHz
16-bit PCM output and the 30-name prebuilt voice list).

Model id: gemini-3.1-flash-tts-preview -- Google's newest TTS model
(public preview, launched ~April 2026), confirmed via Google Cloud's own
example notebook (generative-ai repo,
audio/speech/getting-started/gemini_3_1_flash_tts.ipynb), which uses the
exact same SpeechConfig/VoiceConfig/PrebuiltVoiceConfig pattern this file
already had, and confirms 24kHz int16 PCM output -- matches this file's
existing format assumptions exactly, so no structural change needed
beyond the model id itself. gemini-2.5-flash-preview-tts and
gemini-2.5-pro-preview-tts also still exist as older/fallback options.

Response audio comes back as raw PCM in inline_data.data, with the actual
sample rate embedded in inline_data.mime_type (e.g.
"audio/L16;codec=pcm;rate=24000") -- parsed at runtime rather than assumed,
and resampled to TTS_SAMPLE_RATE (24000, what the frontend's AudioQueue is
hardcoded to expect) if the real rate turns out to differ.

Streams via client.aio.models.generate_content_stream (same async
streaming entry point LLM/gemini.py already uses for text, confirmed
working there) instead of one blocking generate_content() call -- see
issue #66. Each chunk's audio is converted/resampled and pushed to
send_queue as it arrives rather than waiting for the whole utterance, so
playback can start on the first chunk instead of the full generation
time. Live-verified against a real key: a 10.1s reply streamed as 253
chunks, first chunk (ttfb) at 2.1s vs. 7.1s for the whole generation --
confirms this is a real, not just theoretical, latency win."""
import re
import time

import numpy as np
from google import genai
from google.genai import types
from scipy.signal import resample
from TTS.cache import cache_key, get_cached, set_cached

TTS_SAMPLE_RATE = 24000


class GeminiTTS:
    def __init__(self, model_name: str = "gemini-3.1-flash-tts-preview", api_key: str = None):
        # Always the user's own key (agent-level or Settings) -- never an
        # implicit GEMINI_API_KEY env read, so the server can't silently pay.
        if not api_key:
            raise ValueError("A Google API key is required -- add one in Settings.")
        self.client = genai.Client(api_key=api_key)
        self.model_id = model_name
        self.sampling_rate = TTS_SAMPLE_RATE
        # Real token usage from the most recent stream() call (issue: TTS
        # cost tracking) -- {"prompt_tokens", "output_tokens"} or None for
        # a cache hit (no real API call, nothing new billed) or if the SDK
        # ever omits usage_metadata. Same "don't guess a cost" rule as
        # LLM/pricing.py: the caller reads this right after awaiting
        # stream() rather than this returning it directly, so the existing
        # ttfb-only return contract (other callers rely on it) stays
        # unchanged.
        self.last_usage = None

    async def stream(
        self,
        text: str,
        send_queue,
        voice: str = "Kore",
        **kwargs,
    ):
        """Same send_queue contract as KokoroTTS.stream() (pushes
        ("bytes", pcm_bytes) items). `voice` is one of Gemini's prebuilt
        voice names (e.g. "Kore", "Puck", "Zephyr") -- unlike
        DhVaani/SraVaani this has no zero-shot cloning, just named presets,
        same shape as Kokoro's `voice` param.

        Cached on disk by (text, voice) -- identical inputs skip the real
        API call entirely, same rationale as DhVaani's cache (an agent's
        greeting is the same text/voice on every call). A cache hit is
        pushed as one buffer (already instantaneous, nothing to stream);
        a cache miss uses the real streaming API and pushes each chunk to
        send_queue as it arrives instead of waiting for the whole
        utterance to finish generating before any of it plays.

        Streaming is only confirmed supported on gemini-3.1-flash-tts-preview
        or newer per Google's docs
        (https://ai.google.dev/gemini-api/docs/speech-generation#streaming).
        Untested against an older model like gemini-2.5-flash-preview-tts --
        it may still work (just as one big chunk) or may error; not
        live-verified either way.

        Returns time-to-first-byte in seconds (gen_time for a cache hit,
        since that's already effectively instant) -- used by callers that
        persist per-turn latency (issue #27)."""
        start = time.monotonic()

        key = cache_key(text, voice, self.model_id)
        cached = get_cached(key)
        if cached is not None:
            # A cache hit replays already-generated audio -- no new API
            # call, nothing new billed.
            self.last_usage = None
            await send_queue.put(("bytes", cached))
            gen_time = time.monotonic() - start
            audio_seconds = (len(cached) // 4) / self.sampling_rate
            rtf = gen_time / audio_seconds if audio_seconds > 0 else float("inf")
            print(f"[GeminiTTS timing] cache_hit=True gen_time={gen_time:.3f}s "
                  f"audio={audio_seconds:.3f}s RTF={rtf:.2f}x")
            return gen_time

        config = types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
        )

        response_stream = await self.client.aio.models.generate_content_stream(
            model=self.model_id,
            contents=text,
            config=config,
        )

        chunks: list[bytes] = []
        first_chunk_time = None
        # Cumulative for the whole call so far, same confirmed behavior as
        # LLM/gemini.py's usage_metadata handling -- the last chunk that
        # carries one already has the final totals.
        last_usage = None

        async for chunk in response_stream:
            if chunk.usage_metadata:
                last_usage = chunk.usage_metadata
            parts = (chunk.candidates[0].content.parts
                     if chunk.candidates and chunk.candidates[0].content else None)
            if not parts:
                continue
            blob = parts[0].inline_data
            if blob is None or not blob.data:
                continue

            # Response audio is raw PCM (int16, per the "audio/L16" mime
            # type), not float32 -- the rest of this pipeline (Kokoro,
            # DhVaani) outputs float32, and the frontend's AudioQueue
            # interprets received bytes as a Float32Array directly, so
            # this must be converted per chunk, not just relabeled.
            pcm_i16 = np.frombuffer(blob.data, dtype=np.int16)
            arr = pcm_i16.astype(np.float32) / 32768.0

            # Parse the real sample rate out of the mime type instead of
            # assuming it matches TTS_SAMPLE_RATE -- per chunk rather than
            # once, in case it ever varies chunk to chunk (unconfirmed
            # either way, cheap enough to just always check).
            mime_type = blob.mime_type or ""
            match = re.search(r"rate=(\d+)", mime_type)
            source_rate = int(match.group(1)) if match else TTS_SAMPLE_RATE
            if source_rate != TTS_SAMPLE_RATE:
                arr = resample(arr, int(len(arr) * TTS_SAMPLE_RATE / source_rate)).astype(np.float32)

            pcm_bytes = arr.tobytes()
            if first_chunk_time is None:
                first_chunk_time = time.monotonic()
            chunks.append(pcm_bytes)
            await send_queue.put(("bytes", pcm_bytes))

        self.last_usage = (
            {"prompt_tokens": last_usage.prompt_token_count, "output_tokens": last_usage.candidates_token_count}
            if last_usage is not None else None
        )

        full_bytes = b"".join(chunks)
        if full_bytes:
            # Cache the reassembled full buffer, not individual chunks --
            # a cache hit replays as one buffer (see above), so the
            # cached format must match what a cache hit expects.
            set_cached(key, full_bytes)

        gen_time = time.monotonic() - start
        ttfb = (first_chunk_time - start) if first_chunk_time is not None else gen_time
        audio_seconds = (len(full_bytes) // 4) / self.sampling_rate
        rtf = gen_time / audio_seconds if audio_seconds > 0 else float("inf")
        print(f"[GeminiTTS timing] cache_hit=False gen_time={gen_time:.3f}s "
              f"ttfb={ttfb:.3f}s audio={audio_seconds:.3f}s RTF={rtf:.2f}x")
        return ttfb
