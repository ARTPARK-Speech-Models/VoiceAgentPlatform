import numpy as np
import torch
from silero_vad import load_silero_vad
from src.constants import ASR_SAMPLE_RATE


class StreamingVAD:
    def __init__(
        self,
        sample_rate: int = ASR_SAMPLE_RATE,
        speech_threshold: float = 0.5,
        min_silence_ms: int = 500,    #pause length that ends an utterance
        min_speech_ms: int = 250,
        max_segment_s: float = 15.0,
        energy_margin: float = 2.5,       # NEW: how much louder than noise floor to count as speech
        noise_floor_alpha: float = 0.05,  # NEW: smoothing factor for adaptive floor
        min_energy_threshold: float = 0.01,  # NEW: absolute floor, avoids near-zero thresholds in dead silence
    ):
        self.model = load_silero_vad(onnx=True)
        self.sample_rate = sample_rate
        self.speech_threshold = speech_threshold
        self.min_silence_samples = int(sample_rate * min_silence_ms / 1000)
        self.min_speech_samples = int(sample_rate * min_speech_ms / 1000)
        self.max_segment_samples = int(sample_rate * max_segment_s)

        self.frame_size = 512

        self._frame_buffer = np.array([], dtype=np.float32)
        self._speech_buffer = np.array([], dtype=np.float32)
        self._silence_run = 0
        self._in_speech = False
        self._post_silence_samples = 0

        # --- NEW: adaptive noise floor state ---
        self.energy_margin = energy_margin
        self.noise_floor_alpha = noise_floor_alpha
        self.min_energy_threshold = min_energy_threshold
        self._noise_floor = min_energy_threshold  # starts conservative, adapts down/up over time

    def _is_speech_frame(self, frame: np.ndarray) -> float:
        tensor = torch.from_numpy(frame)
        with torch.no_grad():
            prob = self.model(tensor, self.sample_rate).item()
        return prob

    def _frame_energy(self, frame: np.ndarray) -> float:
        """RMS energy of a frame."""
        return float(np.sqrt(np.mean(frame.astype(np.float64) ** 2)))

    def _update_noise_floor(self, energy: float):
        """Slowly track ambient noise level during non-speech frames."""
        self._noise_floor = (
            (1 - self.noise_floor_alpha) * self._noise_floor
            + self.noise_floor_alpha * energy
        )

    def _current_energy_threshold(self) -> float:
        return max(self._noise_floor * self.energy_margin, self.min_energy_threshold)

    def feed(self, pcm_chunk: np.ndarray) -> np.ndarray | None:
        self._frame_buffer = np.concatenate([self._frame_buffer, pcm_chunk])

        result = None

        while len(self._frame_buffer) >= self.frame_size:
            frame = self._frame_buffer[: self.frame_size]
            self._frame_buffer = self._frame_buffer[self.frame_size :]

            prob = self._is_speech_frame(frame)
            energy = self._frame_energy(frame)

            model_says_speech = prob >= self.speech_threshold
            loud_enough = energy >= self._current_energy_threshold()

            # NEW: require BOTH model confidence AND sufficient loudness
            is_speech = model_says_speech and loud_enough

            if is_speech:
                self._in_speech = True
                self._silence_run = 0
                self._post_silence_samples = 0
                self._speech_buffer = np.concatenate([self._speech_buffer, frame])
            else:
                self._post_silence_samples += len(frame)

                # Only adapt the noise floor when we're NOT mid-utterance,
                # so a quiet trailing word doesn't get learned as "noise"
                if not self._in_speech:
                    self._update_noise_floor(energy)

                if self._in_speech:
                    self._speech_buffer = np.concatenate([self._speech_buffer, frame])
                    self._silence_run += len(frame)

                    if self._silence_run >= self.min_silence_samples:
                        if len(self._speech_buffer) >= self.min_speech_samples:
                            result = self._speech_buffer.copy()
                        self._reset()

            if self._in_speech and len(self._speech_buffer) >= self.max_segment_samples:
                result = self._speech_buffer.copy()
                self._reset()

        return result

    def modify_thresholds(self, **kwargs):
        self.speech_threshold = kwargs.get("speech_threshold", 0.5)
        self.min_silence_samples = int(self.sample_rate * kwargs.get("min_silence_ms", 500) / 1000)
        self.min_speech_samples = int(self.sample_rate * kwargs.get("min_speech_ms", 250) / 1000)
        self.energy_margin = kwargs.get("energy_margin", self.energy_margin)
        self.min_energy_threshold = kwargs.get("min_energy_threshold", self.min_energy_threshold)

    @property
    def is_speaking(self) -> bool:
        return self._in_speech

    def silence_duration_ms(self) -> float:
        return (self._post_silence_samples / self.sample_rate) * 1000.0

    def is_silent_for(self, ms: float) -> bool:
        return self.silence_duration_ms() >= ms

    def flush(self) -> np.ndarray | None:
        if self._in_speech and len(self._speech_buffer) >= self.min_speech_samples:
            segment = self._speech_buffer.copy()
            self._reset()
            return segment
        self._reset()
        return None

    def _reset(self):
        self._speech_buffer = np.array([], dtype=np.float32)
        self._silence_run = 0
        self._in_speech = False

# import torch
# import numpy as np

# from silero_vad import load_silero_vad, get_speech_timestamps
# from src.constants import ASR_SAMPLE_RATE

# class StreamingVAD():
#     def __init__(
#         self,
#         sample_rate: int = ASR_SAMPLE_RATE,
#         speech_threshold: float = 0.5,      # confidence cutoff for "is speech"
#         min_silence_ms: int = 500,          # pause length that ends an utterance
#         min_speech_ms: int = 250,           # ignore blips shorter than this
#         max_segment_s: float = 15.0,        # force-flush very long utterances
#     ):
#         self.model = load_silero_vad(onnx=True)  # ONNX is faster on CPU than the JIT model
#         self.sample_rate = sample_rate
#         self.speech_threshold = speech_threshold
#         self.min_silence_samples = int(sample_rate * min_silence_ms / 1000)
#         self.min_speech_samples = int(sample_rate * min_speech_ms / 1000)
#         self.max_segment_samples = int(sample_rate * max_segment_s)

#         # Silero's model expects fixed-size frames (512 samples at 16kHz)
#         self.frame_size = 512

#         self._frame_buffer = np.array([], dtype=np.float32)  # holds partial frames
#         self._speech_buffer = np.array([], dtype=np.float32)  # accumulates current utterance
#         self._silence_run = 0           # consecutive silent samples since last speech
#         self._in_speech = False

#         self._post_silence_samples = 0


#     def _is_speech_frame(self, frame: np.ndarray) -> float:
#         tensor = torch.from_numpy(frame)
#         with torch.no_grad():
#             prob = self.model(tensor, self.sample_rate).item()
#         return prob
    
#     def feed(self, pcm_chunk: np.ndarray) -> np.ndarray | None:
#         """
#         Feed raw PCM. Returns a complete speech segment (np.ndarray) once
#         speech-then-silence is detected, or None if still accumulating.
#         """
#         self._frame_buffer = np.concatenate([self._frame_buffer, pcm_chunk])

#         result = None

#         while len(self._frame_buffer) >= self.frame_size:
#             frame = self._frame_buffer[: self.frame_size]
#             self._frame_buffer = self._frame_buffer[self.frame_size :]

#             prob = self._is_speech_frame(frame)
#             is_speech = prob >= self.speech_threshold

#             if is_speech:
#                 self._in_speech = True
#                 self._silence_run = 0
#                 self._post_silence_samples = 0   # ADD: speech resets persistent timer
#                 self._speech_buffer = np.concatenate([self._speech_buffer, frame])
#             else:
#                 self._post_silence_samples += len(frame)   # ADD: count this silent frame

#                 if self._in_speech: 
#                     # We were in speech, now in silence — still append a bit
#                     # of trailing silence so words don't get clipped abruptly
#                     self._speech_buffer = np.concatenate([self._speech_buffer, frame])
#                     self._silence_run += len(frame)

#                     if self._silence_run >= self.min_silence_samples:
#                         # Long enough pause — utterance is complete
#                         if len(self._speech_buffer) >= self.min_speech_samples:
#                             result = self._speech_buffer.copy()
#                         self._reset()
#                 # else: pure silence, not in speech — discard, nothing to do

#             # Safety valve: force-flush if someone talks for too long without pausing
#             if self._in_speech and len(self._speech_buffer) >= self.max_segment_samples:
#                 result = self._speech_buffer.copy()
#                 self._reset()

#         return result

#     def modify_thresholds(self, **kwargs):
#         self.speech_threshold = kwargs.get("speech_threshold", 0.5)
#         self.min_silence_samples = int(self.sample_rate * kwargs.get("min_silence_ms", 500) / 1000)
#         self.min_speech_samples = int(self.sample_rate * kwargs.get("min_speech_ms", 250) / 1000)

#     @property
#     def is_speaking(self) -> bool:
#         """True if currently inside a detected speech segment."""
#         return self._in_speech

#     def silence_duration_ms(self) -> float:
#         """Milliseconds since speech was last detected (mid- or between-utterance)."""
#         return (self._post_silence_samples / self.sample_rate) * 1000.0

#     def is_silent_for(self, ms: float) -> bool:
#         """Convenience check: has silence persisted for at least `ms`?"""
#         return self.silence_duration_ms() >= ms
    

#     def flush(self) -> np.ndarray | None:
#         """Call on disconnect — return any in-progress speech segment."""
#         if self._in_speech and len(self._speech_buffer) >= self.min_speech_samples:
#             segment = self._speech_buffer.copy()
#             self._reset()
#             return segment
#         self._reset()
#         return None

#     def _reset(self):
#         self._speech_buffer = np.array([], dtype=np.float32)
#         self._silence_run = 0
#         self._in_speech = False