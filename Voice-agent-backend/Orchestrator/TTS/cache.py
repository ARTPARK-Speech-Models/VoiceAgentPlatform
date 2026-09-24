"""Simple on-disk TTS cache, keyed by a hash of everything that determines
the synthesized audio (text + reference clip + reference transcript +
whatever other params affect output). Persistent across container
restarts -- unlike an in-memory cache, this actually pays off for DhVaani,
where a cache hit turns a tens-of-seconds synthesis into a file read.

The clearest win: an agent's greeting message is the exact same text,
reference clip, and transcript on every single call -- first caller pays
the real synthesis cost, everyone after gets it back near-instantly."""
import hashlib
import os
from pathlib import Path

CACHE_DIR = Path(os.environ.get("TTS_CACHE_DIR", "/app/data/tts_cache"))


def cache_key(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(str(p).encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def get_cached(key: str) -> bytes | None:
    path = CACHE_DIR / f"{key}.pcm"
    if path.exists():
        return path.read_bytes()
    return None


def set_cached(key: str, pcm_bytes: bytes) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{key}.pcm"
    # Write to a temp file then rename -- avoids a reader seeing a
    # partially-written file if two requests race on the same key.
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_bytes(pcm_bytes)
    tmp_path.replace(path)
