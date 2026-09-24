"""Call recording storage (issue #29) -- writes each side of a call's raw
PCM audio to a WAV file under a volume-mounted directory, so it survives
container restarts/rebuilds (see docker-compose.yaml's `volumes:` entry
on the orchestrator service). Retrieval is a plain file read in
src/crud.py, gated by the same agent-ownership check every other
call-history endpoint uses -- these are real audio recordings of what a
user said, not something to leave world-readable.

Folder structure: RECORDINGS_DIR/{agent_id}/{call_uuid}/{user,agent}.wav
-- call_uuid rather than the CallHistory row's id, since that id doesn't
exist until the row is inserted (this write happens in the same
`finally` block, right alongside it) and grouping by agent_id keeps one
agent's recordings together for e.g. bulk cleanup later.
"""
import os
import wave

import numpy as np

RECORDINGS_DIR = os.environ.get("CALL_RECORDINGS_DIR", "/app/call_recordings")


def _write_wav(path: str, chunks: list[bytes], sample_rate: int) -> bool:
    """False (and no file written) if there was nothing to write --
    matches the codebase's "an absent number beats a fabricated one"
    principle: a call recording that never got any agent audio (e.g. it
    errored before the first reply) shouldn't produce an empty stub file
    someone might mistake for a real, silent recording."""
    if not chunks:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # The whole pipeline standardizes on float32 PCM (see the top-level
    # CLAUDE.md's "Audio format" note) -- WAV needs 16-bit int PCM for
    # broad player compatibility (IEEE-float WAVs don't play everywhere),
    # so this is the same float32->int16 conversion TTS/gemini.py already
    # does in the other direction.
    pcm_f32 = np.frombuffer(b"".join(chunks), dtype=np.float32)
    pcm_i16 = np.clip(pcm_f32 * 32768.0, -32768, 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_i16.tobytes())
    return True


def save_call_recording(
    agent_id: int, call_uuid: str, user_chunks: list[bytes], agent_chunks: list[bytes]
) -> str | None:
    """Writes user.wav (16kHz -- mic input, ASR_SAMPLE_RATE) and
    agent.wav (24kHz -- TTS output, TTS_SAMPLE_RATE) for one call.
    Returns the relative "{agent_id}/{call_uuid}" path to store on the
    CallHistory row, or None if neither side captured any audio at all
    (nothing written to disk in that case)."""
    folder = os.path.join(RECORDINGS_DIR, str(agent_id), call_uuid)
    wrote_user = _write_wav(os.path.join(folder, "user.wav"), user_chunks, 16000)
    wrote_agent = _write_wav(os.path.join(folder, "agent.wav"), agent_chunks, 24000)
    if not (wrote_user or wrote_agent):
        return None
    return f"{agent_id}/{call_uuid}"


def recording_file_path(recording_path: str, side: str) -> str | None:
    """side: "user" or "agent". Returns the absolute path if that file
    actually exists on disk, else None -- recording_path being set on the
    CallHistory row only means *something* was recorded, not necessarily
    both sides (e.g. a call that errored before any agent audio still has
    a user.wav but no agent.wav)."""
    if side not in ("user", "agent"):
        return None
    path = os.path.join(RECORDINGS_DIR, recording_path, f"{side}.wav")
    return path if os.path.isfile(path) else None
