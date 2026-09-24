import os
import time

import httpx


class DhVaaniTTS:
    """Zero-shot voice-cloning TTS (ARTPARK-IISc/DhVaani-0.5). Proxies to a
    standalone inference service (dhvaani_service.py, deployed on its own
    host) over HTTP instead of loading the model
    in-process -- measured ~4x faster there than in-process on typical dev
    laptop hardware (25.2s vs 261.1s for a comparable utterance), most
    likely because sustained CPU-bound synthesis thermal-throttles a laptop
    in a way a cloud VM's vCPUs don't. Same relationship as LLM/ollama.py
    has to the Ollama service.

    Unlike Kokoro, this needs a reference audio clip + its transcript per
    call (not a named voice preset), and has no internal streaming -- it
    returns one full audio array per call. That's pushed as a single chunk
    onto the same send_queue Kokoro uses, so call sites don't need to
    branch on it."""

    def __init__(self):
        self.base_url = os.environ.get("DHVAANI_API_BASE", "").rstrip("/")
        self.api_key = os.environ.get("DHVAANI_API_KEY", "")
        # Per the model card -- not read off a config attribute, it's a
        # fixed property of how the model was trained/exported. Keep in
        # sync with the frontend's TTS_SAMPLE_RATE constant, same as Kokoro.
        self.sampling_rate = 24000

    async def stream(
        self,
        text: str,
        send_queue,
        reference_audio_path: str,
        reference_transcript: str,
        speed: float = 1,
        num_step: int = 8,
        **kwargs,
    ):
        """Same send_queue contract as KokoroTTS.stream() (pushes
        ("bytes", pcm_bytes) items) so call sites work unmodified --
        `reference_audio_path`/`reference_transcript` replace Kokoro's
        `voice` since this model clones from a reference clip rather than
        picking a named preset. `num_step` (flow-matching ODE steps, model
        default 16) is dropped to 8 here -- ~2x faster since nearly all
        cost is per-step matmul work, at some quality cost."""
        start = time.monotonic()

        async with httpx.AsyncClient(timeout=180) as client:
            with open(reference_audio_path, "rb") as f:
                response = await client.post(
                    f"{self.base_url}/synthesize",
                    data={
                        "text": text,
                        "prompt_text": reference_transcript,
                        "speed": speed,
                        "num_step": num_step,
                    },
                    files={"file": (os.path.basename(reference_audio_path), f, "audio/wav")},
                    headers={"X-API-Key": self.api_key},
                )
        response.raise_for_status()
        pcm_bytes = response.content

        gen_time = time.monotonic() - start
        audio_seconds = (len(pcm_bytes) // 4) / self.sampling_rate
        rtf = gen_time / audio_seconds if audio_seconds > 0 else float("inf")
        print(f"[DhVaani timing] gen_time={gen_time:.3f}s audio={audio_seconds:.3f}s "
              f"RTF={rtf:.2f}x (>1.0 = slower than real-time)")

        await send_queue.put(("bytes", pcm_bytes))
