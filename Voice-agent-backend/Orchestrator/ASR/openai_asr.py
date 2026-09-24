"""OpenAI (gpt-4o-transcribe) ASR for evaluation mode.

Not part of the real pipeline -- used only to compare against whichever
ASR provider the agent is actually configured with, same pattern as
gemini_asr.py. Runs on the user's own OpenAI key from Settings.
"""
from ASR.wav_utils import segment_to_wav_bytes
from openai import AsyncOpenAI

OPENAI_ASR_MODEL = "gpt-4o-transcribe"

async def transcribe_openai(segment, api_key: str, sample_rate: int = 16000) -> str:
    """Whole-utterance transcription via OpenAI's gpt-4o-transcribe. `segment` is the
    same raw float32 PCM mono buffer VAD hands to every other ASR path --
    evaluation-mode only, never part of the real pipeline."""
    wav_bytes = segment_to_wav_bytes(segment, sample_rate)
    client = AsyncOpenAI(api_key=api_key)
    response = await client.audio.transcriptions.create(
        model=OPENAI_ASR_MODEL,
        file=("segment.wav", wav_bytes),
    )
    return (response.text or "").strip()
