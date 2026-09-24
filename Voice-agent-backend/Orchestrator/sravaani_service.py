"""Standalone SraVaani-1.0 ASR inference service -- NOT part of the
orchestrator app. Runs as the `sravaani` compose service (internal
network only), or on its own host behind a reverse proxy with a
shared-secret header. Same pattern as dhvaani_service.py.

SraVaani-1.0 is a TDT (token-and-duration transducer) model, architecturally
different from the older SraVaani-0.5-live cache-aware streaming
Conformer (confirmed via its config lacking supported_att_context_sizes) -- it has no incremental
streaming API at all, only whole-utterance transcribe(). That's not a
regression in practice: the orchestrator's VAD already segments speech into
complete utterances before ASR ever sees them (transcribe_segment() in
main.py), so this model just transcribes each one in a single call instead
of via chunked push_float32() calls.

Run with: uvicorn sravaani_service:app --host 0.0.0.0 --port 8002
"""
import os

import numpy as np
import torch
from fastapi import FastAPI, Header, HTTPException, UploadFile
from transformers import AutoModel

API_KEY = os.environ.get("SRAVAANI_API_KEY", "")


class _SraVaaniEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = AutoModel.from_pretrained(
            "ARTPARK-IISc/SraVaani-1.0", trust_remote_code=True
        ).to(self.device).eval()


_engine: _SraVaaniEngine | None = None


def get_engine() -> _SraVaaniEngine:
    global _engine
    if _engine is None:
        _engine = _SraVaaniEngine()
    return _engine


app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = None,
    x_api_key: str = Header(None),
):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad or missing X-API-Key")

    engine = get_engine()
    content = await file.read()

    # Raw float32 PCM, mono, 16kHz -- exactly what the orchestrator's VAD
    # segment already is (ASR_SAMPLE_RATE). transcribe() does NOT resample
    # raw array input (only file-path input), so this must already be at
    # the model's config.sample_rate (16000) -- it is.
    wav = np.frombuffer(content, dtype=np.float32).copy()

    hyps = engine.model.transcribe([wav], return_hypotheses=False)
    return {"text": hyps[0] if hyps else ""}
