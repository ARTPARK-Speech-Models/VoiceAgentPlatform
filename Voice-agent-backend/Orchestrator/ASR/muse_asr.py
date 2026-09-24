"""Muse (Meta) Voice Transcribe ASR for evaluation mode.

Not part of the real pipeline -- used only to compare against whichever
ASR provider the agent is actually configured with, same pattern as
gemini_asr.py/openai_asr.py/sarvam_asr.py. Runs on the user's own Muse
key from Settings.

No SDK for this one (unlike the genai/openai/sarvamai clients the other
three providers use) -- httpx (already a dependency, see src/main.py)
against the documented REST endpoint instead. Spec per
https://dev.meta.ai/docs/api-reference/voice/transcribe and
.../voice/schemas: PUSH_TO_TALK mode (whole-clip, non-streaming) is
used rather than the realtime/diarization modes, matching every other
eval provider's whole-utterance call shape -- there's no live/streaming
audio here, just one already-finalized VAD segment per call.
"""
import json

import httpx
from ASR.wav_utils import segment_to_wav_bytes

MUSE_ASR_MODEL = "muse-voice-transcribe-1.0"
MUSE_API_URL = "https://api.meta.ai/v1/asr/transcribe"


async def transcribe_muse(segment, api_key: str, sample_rate: int = 16000) -> str:
    """Whole-utterance transcription via Muse's transcribe endpoint
    (PUSH_TO_TALK mode). `segment` is the same raw float32 PCM mono
    buffer VAD hands to every other ASR path -- evaluation-mode only,
    never part of the real pipeline."""
    wav_bytes = segment_to_wav_bytes(segment, sample_rate)
    request_meta = {"model": MUSE_ASR_MODEL, "audioEncoding": "WAV", "mode": "PUSH_TO_TALK"}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            MUSE_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
            },
            files={
                "request": (None, json.dumps(request_meta), "application/json"),
                "audio": ("segment.wav", wav_bytes, "audio/wav"),
            },
        )
        response.raise_for_status()
        return (response.json().get("transcript") or "").strip()
