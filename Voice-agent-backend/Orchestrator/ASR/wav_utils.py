"""Shared PCM->WAV encoding for the evaluation-mode ASR providers
(gemini_asr.py, openai_asr.py, sarvam_asr.py) -- each needs to hand its
cloud API a real container format, not the headerless raw float32 PCM
VAD produces. Extracted here once a third provider needed the identical
conversion (same float32->int16 PCM steps as src/recordings.py's
_write_wav(), built in-memory instead of written to disk).
"""
import io
import wave

import numpy as np


def segment_to_wav_bytes(segment: np.ndarray, sample_rate: int) -> bytes:
    pcm_i16 = np.clip(segment * 32768.0, -32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_i16.tobytes())
    return buf.getvalue()
