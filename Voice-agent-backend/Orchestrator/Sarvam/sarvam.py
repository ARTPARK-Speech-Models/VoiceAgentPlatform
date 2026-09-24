import asyncio
import base64
import json

import numpy as np
import websockets
from sarvamai import AsyncSarvamAI

LANG_CODE_MAP = {
    "English": "en-IN",
    "Hindi": "hi-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
    "Kannada": "kn-IN",
    "Malayalam": "ml-IN",
    "Bengali": "bn-IN",
    "Marathi": "mr-IN",
    "Gujarati": "gu-IN",
    "Punjabi": "pa-IN",
}

class SarvamASR:
    def __init__(self, api_key: str, model = "saaras:v3", language_code = "unknown", on_transcript = None):
        self.client = AsyncSarvamAI(api_subscription_key=api_key)
        self.language_code = language_code
        self.model = model
        self._ws = None
        self.recv_task = None
        self._connected = False
        self.on_transcript = on_transcript


    async def connect(self):
        # 1. Store the context manager so it does NOT get garbage collected!
        self._ws_context = self.client.speech_to_text_streaming.connect(
            model=self.model,
            mode="transcribe",              # Change mode as needed
            language_code=self.language_code,
            flush_signal=True,               # Enable manual control
            sample_rate=16000,
            high_vad_sensitivity=True,
            input_audio_codec="pcm_raw"
        )
        
        # 2. Enter the context manager using the stored reference
        self._ws = await self._ws_context.__aenter__()

        self._connected = True

        self.recv_task = asyncio.create_task(self._receive_loop())
        print("Connected to Sarvam ASR!!")

    async def disconnect(self):
        """Close the connection cleanly."""
        self._connected = False
        
        # Note: Your init used self.recv_task, but the disconnect used self._recv_task
        if getattr(self, "recv_task", None):
            self.recv_task.cancel()
            
        # Cleanly exit the stored context manager
        if getattr(self, "_ws_context", None):
            try:
                await self._ws_context.__aexit__(None, None, None)
            except Exception:
                pass
        print("[SarvamASR] Disconnected")


    async def send_audio(self, pcm: np.ndarray):

        if not self._connected or self._ws is None:
            return

        # Convert float32 [-1, 1] → int16
        pcm_int16 = (pcm * 32767).clip(-32768, 32767).astype(np.int16)
        raw_bytes  = pcm_int16.tobytes()
        
        # SAFETY CHECK: Don't send empty audio which triggers an EOF disconnect
        if not raw_bytes:
            return
            
        # Encode the raw bytes to a base64 string
        base64_audio = base64.b64encode(raw_bytes).decode('utf-8')

        try:
            await self._ws.transcribe(
                audio       = base64_audio, 
                sample_rate = 16000,
            )
        except Exception as e:
            print(f"[SarvamASR] send_audio error: {e}")


    async def flush(self):

        if not self._connected or self._ws is None:
            return
        try:
            await self._ws.flush()
            print("[SarvamASR] Flushed")
        except Exception as e:
            print(f"[SarvamASR] flush error: {e}")


    async def _receive_loop(self):
        try:
            async for message in self._ws:
                if not self._connected:
                    break

                print(f"[SarvamASR] Raw message: {message}")

                text = None
                lang = self.language_code

                # 1. Check if the message has a nested 'data' object (matches your logs)
                data_obj = getattr(message, "data", None)
                
                if data_obj:
                    text = getattr(data_obj, "transcript", None)
                    lang = getattr(data_obj, "language_code", self.language_code)
                
                # 2. Fallback in case the response is flat or a dictionary
                else:
                    text = getattr(message, "transcript", None) \
                        or getattr(message, "text", None) \
                        or (message.get("transcript") if isinstance(message, dict) else None)

                    lang = getattr(message, "language_code", None) \
                        or (message.get("language_code") if isinstance(message, dict) else None) \
                        or self.language_code

                # 3. Send if valid text exists
                if text and text.strip():
                    if self.on_transcript:
                        await self.on_transcript(text.strip(), lang)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[SarvamASR] receive_loop error: {e}")




class SarvamTTS:
    def __init__(
        self,
        api_key: str,
        model: str   = "bulbul:v2",   # or "bulbul:v3"
        speaker: str = "anushka",      # see speaker list below
        speed: float  = 1.0,
        pitch: float = 0.0,            # v2 only
        loudness: float = 1.0,         # v2 only
        min_buffer_size: int = 50,     # chars before Sarvam starts generating
        max_chunk_length: int = 150,   # max chars per chunk Sarvam will split at
        output_audio_codec: str = "pcm",  # pcm = LINEAR16, matches your pipeline
        output_audio_bitrate: str = "128k",
        sample_rate: int = 24000,
    ):
        self.api_key            = api_key
        self.model              = model.lower()
        self.speaker            = speaker.lower()
        self.speed              = speed
        self.pitch              = pitch
        self.loudness           = loudness
        self.min_buffer_size    = min_buffer_size
        self.max_chunk_length   = max_chunk_length
        self.output_audio_codec = output_audio_codec
        self.output_audio_bitrate = output_audio_bitrate
        self.sample_rate        = sample_rate

        self._ws           = None
        self._recv_task    = None
        self._connected    = False
        self._send_queue   = None     # injected per session (points to synthesizer send_queue)
        self._current_lang = "en-IN"
    

    async def connect(self, language: str = "en"):
        """
        Open a persistent WebSocket to Sarvam TTS.
        send_queue: the synthesizer's existing send_queue — audio bytes go straight in.
        language:   internal lang code ("en", "hi", etc.)
        """
        self._current_lang = LANG_CODE_MAP.get(language, "en-IN")
        self._connected    = True

        self._ws = await websockets.connect(
            f"wss://api.sarvam.ai/text-to-speech/ws?model={self.model}&send_completion_event=true",
            additional_headers={"Api-Subscription-Key": self.api_key},
        )

        # Step 1 — send config as the very first message
        await self._send_config()

        # Step 2 — start background receiver
        self._recv_task = asyncio.create_task(self._receive_loop())
        print(f"[SarvamTTS] Connected (model={self.model}, speaker={self.speaker}, lang={self._current_lang})")

    async def disconnect(self):
        self._connected = False
        if self._recv_task:              # was self.recv_task
            self._recv_task.cancel( )
        if self._ws:
            try:
                await self._ws.__aexit__(None, None, None)
            except Exception:
                pass
        print("[SarvamASR] Disconnected")

    async def reconnect(self, language: str = "en"):
        """Barge-in: close current connection and open a fresh one."""
        await self.disconnect()
        await self.connect(language)

    # ── Sending ───────────────────────────────────────────────────────────────

    async def _send_config(self):
        """Send the initial config frame — must be first message after connect."""
        config = {
            "type": "config",
            "data": {
                "target_language_code": self._current_lang,
                "speaker":              self.speaker,
                "pace":                 self.speed,
                "output_audio_codec":   "linear16",
                "speech_sample_rate":   self.sample_rate,
                # "output_audio_bitrate": "16k",
                "min_buffer_size":      self.min_buffer_size,
                "max_chunk_length":     self.max_chunk_length,
                "enable_preprocessing": True,
            }
        }
        # v2-only params    
        if self.model == "bulbul:v2":
            config["data"]["pitch"]    = self.pitch
            config["data"]["loudness"] = self.loudness

        payload = json.dumps(config)
        print(f"[SarvamTTS] Sending config: {payload}")
        await self._ws.send(json.dumps(config))

    async def stream(self, text: str, send_queue, **kwargs):
        """Send a text chunk for synthesis. Call for each sentence from LLM."""
        self._send_queue = send_queue
        if not self._connected or not self._ws:
            return
        try:
            await self._ws.send(json.dumps({
                "type": "text",
                "data": {"text": text}
            }))
        except Exception as e:
            print(f"[SarvamTTS] send_text error: {e}")

    async def flush(self):
        """
        Signal Sarvam to synthesize any buffered text immediately.
        Call after stream_end to get the final audio chunk.
        """
        if not self._connected or not self._ws:
            return
        try:
            await self._ws.send(json.dumps({"type": "flush"}))
        except Exception as e:
            print(f"[SarvamTTS] flush error: {e}")

    async def ping(self):
        """Send keepalive — call every ~30s for long-lived sessions."""
        if not self._connected or not self._ws:
            return
        try:
            await self._ws.send(json.dumps({"type": "ping"}))
        except Exception as e:
            print(f"[SarvamTTS] ping error: {e}")

    # ── Receiving ─────────────────────────────────────────────────────────────
    def _strip_wav_header(self, audio_chunk: bytes) -> bytes:
        """
        Dynamically finds the end of the WAV header and strips it.
        Returns pure PCM bytes without byte-shifting.
        """
        if audio_chunk.startswith(b'RIFF'):
            # Search for the start of the actual data chunk
            data_idx = audio_chunk.find(b'data')
            if data_idx != -1:
                # 'data' is 4 bytes, followed by 4 bytes of length = 8 bytes to skip
                return audio_chunk[data_idx + 8:]
            else:
                # Fallback if 'data' isn't found
                return audio_chunk[44:]
                
        # If no RIFF header, it's an ongoing stream
        return audio_chunk
    
    async def _receive_loop(self):
        """
        Background task — listens for audio chunks from Sarvam and
        puts them directly into the synthesizer's send_queue as bytes.
        """
        try:
            async for raw in self._ws:
                if not self._connected:
                    break

                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "audio":
                    audio_b64 = msg.get("data", {}).get("audio")
                    if audio_b64:
                        # 1. Decode base64 to raw linear16 (int16) bytes
                        raw_audio_bytes = base64.b64decode(audio_b64)
                        
                        # 2. Convert the bytes into an int16 numpy array
                        audio_int16 = np.frombuffer(raw_audio_bytes, dtype=np.int16)
                        
                        # 3. Convert int16 to float32 and scale it to [-1.0, 1.0]
                        audio_float32 = audio_int16.astype(np.float32) / 32768.0
                        
                        # 4. Convert back to bytes for the queue
                        float32_bytes = audio_float32.tobytes()
                        
                        # Put the corrected float32 bytes into the queue
                        await self._send_queue.put(("bytes", float32_bytes))

                elif msg_type == "event":
                    # Completion event — all audio for this utterance sent
                    event = msg.get("data", {}).get("event")
                    if event == "generation_complete":
                        print("[SarvamTTS] Generation complete")

                elif msg_type == "error":
                    print(f"[SarvamTTS] Error from server: {msg}")

        except asyncio.CancelledError:
            pass
        except websockets.exceptions.ConnectionClosed:
            print("[SarvamTTS] Connection closed by server")
        except Exception as e:
            print(f"[SarvamTTS] receive_loop error: {e}")

    # ── Keepalive ─────────────────────────────────────────────────────────────

    async def start_keepalive(self, interval: int = 30):
        """Start a background ping task to keep the connection alive."""
        async def _ping_loop():
            while self._connected:
                await asyncio.sleep(interval)
                await self.ping()
        asyncio.create_task(_ping_loop())
        