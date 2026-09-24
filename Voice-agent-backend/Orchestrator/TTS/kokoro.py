import asyncio
import time
from threading import Thread

import torch
from kokoro import KPipeline


class KokoroTTS:
    def __init__(self, lang_code: str = "a"):
        # 'a' = American English, 'b' = British English.
        # Model + voicepacks load once here and are reused across requests.
        self.pipeline = KPipeline(repo_id='hexgrad/Kokoro-82M', lang_code=lang_code)

        # Kokoro's documented output rate. Unlike Parler, this isn't read
        # off a model config attribute — it's a fixed property of how the
        # model was trained/exported. Keep this in sync with the frontend's
        # TTS_SAMPLE_RATE constant.
        self.sampling_rate = 24000

    async def stream(self, text: str, send_queue, voice: str = "af_heart", speed: int = 1, **kwargs):
        """
        Same signature shape as IndicParlerTTS.stream() (description is
        accepted but unused — Kokoro has no style/description conditioning
        like Parler did, so this is kept only so call sites don't need an
        if/else based on which TTS backend is active).
        """
        loop = asyncio.get_event_loop()
        chunk_queue: asyncio.Queue = asyncio.Queue()
        gen_start = time.monotonic()

        def drain_pipeline():
            # KPipeline's generator is a blocking, synchronous iterator —
            # there's no separate generation thread + streamer object like
            # Parler's API, so the whole thing runs in this worker thread.
            # Each iteration already yields one segment's audio (Kokoro
            # does its own sentence/clause splitting internally), so no
            # manual play_steps chunking is needed here.
            last_chunk_time = gen_start
            chunk_index = 0
            try:
                generator = self.pipeline(text, voice=voice, speed = speed)
                for _, _, audio in generator:
                    if audio is None or len(audio) == 0:
                        continue

                    now = time.monotonic()
                    gen_time = now - last_chunk_time
                    audio_seconds = len(audio) / self.sampling_rate
                    rtf = gen_time / audio_seconds if audio_seconds > 0 else float("inf")
                    print(f"[Kokoro timing] chunk={chunk_index} gen_time={gen_time:.3f}s "
                          f"audio={audio_seconds:.3f}s RTF={rtf:.2f}x "
                          f"(>1.0 = slower than real-time)")
                    last_chunk_time = now
                    chunk_index += 1

                    # Kokoro yields a torch.Tensor here, not a NumPy array —
                    # .astype() (NumPy-only) fails with AttributeError.
                    # Move to CPU (in case it's on GPU) and convert properly.
                    pcm_bytes = (
                        audio.detach()
                        .to("cpu")
                        .to(torch.float32)
                        .numpy()
                        .tobytes()
                    )
                    loop.call_soon_threadsafe(chunk_queue.put_nowait, pcm_bytes)
            finally:
                total = time.monotonic() - gen_start
                print(f"[Kokoro timing] total generation wall time: {total:.3f}s")
                loop.call_soon_threadsafe(chunk_queue.put_nowait, None)

        Thread(target=drain_pipeline).start()

        while True:
            pcm_bytes = await chunk_queue.get()
            if pcm_bytes is None:
                break
            await send_queue.put(("bytes", pcm_bytes))