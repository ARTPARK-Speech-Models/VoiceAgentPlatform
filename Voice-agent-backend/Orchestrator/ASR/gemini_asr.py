"""Gemini-based ASR for evaluation mode (issue #71).

Not part of the real pipeline -- used only to compare against whichever
ASR provider the agent is actually configured with. Runs on the user's
own Google key from Settings (same key as the Gemini LLM/TTS).
"""
import numpy as np
from ASR.wav_utils import segment_to_wav_bytes
from google import genai
from google.genai import types

# Newest confirmed-real Gemini id in the catalog (see
# scripts/seed_catalog.py) that's actually reliable for transcription --
# gemini-3.7-flash (the latest/most capable overall) was tested live
# against 1s of pure silence and hallucinated an entire fabricated
# transcript ("If a patient says, I don't feel hungry...") instead of
# recognizing non-speech audio, which is disqualifying for an ASR
# comparison. gemini-3.5-flash-lite, tested the same way, correctly
# returned "<noise>". Also keeps eval-mode latency down (lite tier) since
# this runs alongside, not instead of, the real ASR call. Kept as the
# primary "Google" eval entry despite not being the newest model.
GEMINI_ASR_MODEL = "gemini-3.5-flash-lite"

# Added as a separate eval entry alongside GEMINI_ASR_MODEL, not a
# replacement for it -- included for direct side-by-side comparison
# even though it's the model documented above as unreliable on silence.
GEMINI_ASR_MODEL_LATEST = "gemini-3.7-flash"

_TRANSCRIBE_PROMPT = (
    "Transcribe the following audio verbatim, in the language it was "
    "spoken in. Output only the transcript text -- no commentary, no "
    "translation, no extra formatting."
)

async def transcribe_gemini(segment: np.ndarray, api_key: str, sample_rate: int = 16000, model: str = GEMINI_ASR_MODEL) -> str:
    """Whole-utterance transcription via Gemini multimodal audio input.
    `segment` is the same raw float32 PCM mono buffer VAD hands to every
    other ASR path -- evaluation-mode only, never part of the real
    pipeline. `model` defaults to GEMINI_ASR_MODEL but is overridable so
    GEMINI_ASR_MODEL_LATEST can reuse this same function as a second,
    separate eval entry."""
    wav_bytes = segment_to_wav_bytes(segment, sample_rate)
    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(
        model=model,
        contents=[
            _TRANSCRIBE_PROMPT,
            types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
        ],
    )
    return (response.text or "").strip()
