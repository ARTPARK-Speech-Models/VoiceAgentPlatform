"""Sarvam Saaras ASR for evaluation mode.

Not part of the real pipeline -- used only to compare against whichever
ASR provider the agent is actually configured with, same pattern as
gemini_asr.py/openai_asr.py. Runs on the user's own Sarvam key from
Settings.
"""
from ASR.wav_utils import segment_to_wav_bytes
from sarvamai import AsyncSarvamAI

SARVAM_ASR_MODEL = "saaras:v4"

async def transcribe_sarvam(segment, api_key: str, sample_rate: int = 16000) -> str:
    """Whole-utterance transcription via Sarvam's batch Speech-to-Text
    endpoint -- not the streaming websocket SarvamASR uses in the real
    pipeline, since eval mode hands over one complete segment at a time
    and a single request/response call fits that better than holding a
    streaming connection open. `segment` is the same raw float32 PCM
    mono buffer VAD hands to every other ASR path -- evaluation-mode
    only, never part of the real pipeline."""
    wav_bytes = segment_to_wav_bytes(segment, sample_rate)
    client = AsyncSarvamAI(api_subscription_key=api_key)
    response = await client.speech_to_text.transcribe(
        file=("segment.wav", wav_bytes, "audio/wav"),
        model=SARVAM_ASR_MODEL,
        language_code="unknown",
    )
    return (response.transcript or "").strip()
