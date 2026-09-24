"""Standalone DhVaani inference service -- NOT part of the orchestrator app.
Can be deployed on its own host (e.g. a separate VM), reachable only
through an nginx reverse-proxy with a shared-secret header. Measured ~4x
faster there than in-process on typical dev laptop hardware (25.2s vs
261.1s for a comparable utterance), likely because sustained CPU-bound
synthesis thermal-throttles a laptop in a way a cloud VM's vCPUs don't.

The orchestrator's TTS/dhvaani.py talks to this over HTTP instead of
loading the model itself -- same relationship as LLM/ollama.py to the
Ollama service.

Run with: uvicorn dhvaani_service:app --host 0.0.0.0 --port 8001
"""
import hashlib
import os
import tempfile

import numpy as np
import soundfile as sf
import torch
import torchaudio
from fastapi import FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from transformers import AutoModel
from TTS.cache import cache_key, get_cached, set_cached

API_KEY = os.environ.get("DHVAANI_API_KEY", "")


def _patch_torchaudio_io():
    """DhVaani's vendored zipvoice backend calls torchaudio.load()/.save()
    to read the reference clip and write its own intermediate output. This
    torchaudio version dispatches both through torchcodec by default, whose
    native decoder/encoder .so files fail to load in this environment (a
    missing libnvrtc.so.13 -- a CUDA runtime lib torchcodec pulls in even
    though nothing here uses a GPU). Route both through soundfile instead."""

    def _load(path, **kwargs):
        data, sr = sf.read(str(path), dtype="float32", always_2d=True)
        return torch.from_numpy(data.T), sr

    def _save(path, src, sample_rate, **kwargs):
        arr = src.detach().cpu().numpy()
        if arr.ndim == 2:
            arr = arr.T
        sf.write(str(path), arr, sample_rate)

    torchaudio.load = _load
    torchaudio.save = _save


_patch_torchaudio_io()


class _DhVaaniEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        model = AutoModel.from_pretrained("ARTPARK-IISc/DhVaani-0.5", trust_remote_code=True)

        # transformers' fast-init path constructs the model on a meta device
        # then fills it in from the checkpoint. DhVaani's positional-encoding
        # buffer (self.pe) isn't part of the checkpoint -- it's computed at
        # __init__ time -- so it stays a phantom meta tensor and crashes the
        # first forward pass. Resetting it to None lets the module's own
        # extend_pe() recompute it correctly on first real use.
        for module in model.modules():
            pe = getattr(module, "pe", None)
            if isinstance(pe, torch.Tensor) and pe.is_meta:
                module.pe = None

        self.model = model.to(self.device).eval()
        self.sampling_rate = 24000


_engine: _DhVaaniEngine | None = None


def get_engine() -> _DhVaaniEngine:
    global _engine
    if _engine is None:
        _engine = _DhVaaniEngine()
    return _engine


app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/synthesize")
async def synthesize(
    text: str = Form(...),
    prompt_text: str = Form(...),
    speed: float = Form(1.0),
    file: UploadFile = None,
    x_api_key: str = Header(None),
    # Flow-matching ODE steps. Default (the model's own default is 16)
    # dropped to 8 after benchmarking: ~2x faster (184s vs 396s under
    # cProfile for a comparable utterance) since nearly the entire cost is
    # per-step matmul work, at some quality cost -- worth listening to a
    # sample before trusting this blindly.
    num_step: int = Form(8),
):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad or missing X-API-Key")

    content = await file.read()

    # No stable file path here (the reference clip arrives as a fresh
    # upload each call, unlike the in-process case), so the reference
    # clip's own content hash stands in for it in the cache key.
    clip_hash = hashlib.sha256(content).hexdigest()
    key = cache_key(text, clip_hash, prompt_text, str(speed), str(num_step))
    pcm_bytes = get_cached(key)

    if pcm_bytes is None:
        engine = get_engine()
        with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
            tmp.write(content)
            tmp.flush()
            audio = engine.model.synthesize(
                text=text,
                prompt_wav=tmp.name,
                prompt_text=prompt_text,
                speed=speed,
                num_step=num_step,
            )

        arr = audio.detach().cpu().numpy() if torch.is_tensor(audio) else np.asarray(audio)
        pcm_bytes = arr.astype(np.float32).tobytes()
        set_cached(key, pcm_bytes)

    return Response(content=pcm_bytes, media_type="application/octet-stream")
