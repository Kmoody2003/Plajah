"""
Plajah Audio Bridge: Receives multi-stem audio intelligence via Windows Named Pipe
(\\.\\pipe\\PlajahAudioPipe) or falls back to live WASAPI system loopback audio FFT.
Protocol: 24 bytes (6 x float32 in little-endian):
    - float32 kick
    - float32 snare
    - float32 voice
    - float32 air
    - float32 sub_bass
    - float32 level
"""

import struct
import threading
import time
from dataclasses import dataclass
from typing import Optional
import numpy as np

try:
    import win32file
    import win32pipe
    import pywintypes
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

try:
    import sounddevice as sd
    SOUNDDEVICE_AVAILABLE = True
except ImportError:
    SOUNDDEVICE_AVAILABLE = False


@dataclass
class AudioStems:
    kick: float = 0.0
    snare: float = 0.0
    voice: float = 0.0
    air: float = 0.0
    sub_bass: float = 0.0
    level: float = 0.0
    timestamp: float = 0.0


class AudioBridge:
    def __init__(self, pipe_name: str = "PlajahAudioPipe", fallback_loopback: bool = True):
        self.pipe_name = f"\\\\.\\pipe\\{pipe_name}"
        self.fallback_loopback = fallback_loopback
        self.stems = AudioStems()
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self.source_mode = "Disconnected"

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)

    def get_stems(self) -> AudioStems:
        with self._lock:
            return AudioStems(
                kick=self.stems.kick,
                snare=self.stems.snare,
                voice=self.stems.voice,
                air=self.stems.air,
                sub_bass=self.stems.sub_bass,
                level=self.stems.level,
                timestamp=self.stems.timestamp
            )

    def _run_loop(self):
        while self._running:
            # First attempt: Try connecting to Plajah Desktop Named Pipe
            if WIN32_AVAILABLE:
                connected = self._connect_and_read_pipe()
                if connected:
                    continue

            # Second attempt: Fallback to WASAPI loopback audio sampling if pipe not found
            if self.fallback_loopback and SOUNDDEVICE_AVAILABLE:
                self.source_mode = "WASAPI Loopback"
                self._run_wasapi_loopback()
            else:
                self.source_mode = "Idle (Waiting for audio)"
                time.sleep(0.5)

    def _connect_and_read_pipe(self) -> bool:
        try:
            handle = win32file.CreateFile(
                self.pipe_name,
                win32file.GENERIC_READ,
                0,
                None,
                win32file.OPEN_EXISTING,
                0,
                None
            )
            self.source_mode = f"NamedPipe ({self.pipe_name})"
            print(f"[AudioBridge] Connected to Plajah Named Pipe: {self.pipe_name}")

            while self._running:
                hr, data = win32file.ReadFile(handle, 24)
                if hr == 0 and len(data) == 24:
                    kick, snare, voice, air, sub, lvl = struct.unpack("<6f", data)
                    with self._lock:
                        self.stems.kick = kick
                        self.stems.snare = snare
                        self.stems.voice = voice
                        self.stems.air = air
                        self.stems.sub_bass = sub
                        self.stems.level = lvl
                        self.stems.timestamp = time.time()
                else:
                    break
            win32file.CloseHandle(handle)
            return True
        except pywintypes.error:
            return False
        except Exception as e:
            return False

    def _run_wasapi_loopback(self):
        """Captures default Windows output audio and calculates FFT stems locally."""
        sample_rate = 44100
        block_size = 1024

        def audio_callback(indata, frames, time_info, status):
            if not self._running:
                raise sd.CallbackStop()

            # Mono downmix
            mono = np.mean(indata, axis=1) if indata.ndim > 1 else indata.flatten()
            windowed = mono * np.blackman(len(mono))
            fft_mag = np.abs(np.fft.rfft(windowed))
            freqs = np.fft.rfftfreq(len(windowed), 1.0 / sample_rate)

            # Frequency band masks
            sub_mask = (freqs >= 20) & (freqs <= 70)
            kick_mask = (freqs >= 50) & (freqs <= 130)
            voice_mask = (freqs >= 800) & (freqs <= 2500)
            snare_mask = (freqs >= 1800) & (freqs <= 4500)
            air_mask = (freqs >= 8000) & (freqs <= 16000)

            sub_val = float(np.mean(fft_mag[sub_mask])) * 8.0 if np.any(sub_mask) else 0.0
            kick_val = float(np.mean(fft_mag[kick_mask])) * 12.0 if np.any(kick_mask) else 0.0
            voice_val = float(np.mean(fft_mag[voice_mask])) * 10.0 if np.any(voice_mask) else 0.0
            snare_val = float(np.mean(fft_mag[snare_mask])) * 14.0 if np.any(snare_mask) else 0.0
            air_val = float(np.mean(fft_mag[air_mask])) * 16.0 if np.any(air_mask) else 0.0
            lvl_val = float(np.sqrt(np.mean(mono**2))) * 4.0

            with self._lock:
                # Exponential smoothing
                alpha = 0.35
                self.stems.sub_bass = (1 - alpha) * self.stems.sub_bass + alpha * min(sub_val, 2.0)
                self.stems.kick = (1 - alpha) * self.stems.kick + alpha * min(kick_val, 2.0)
                self.stems.voice = (1 - alpha) * self.stems.voice + alpha * min(voice_val, 2.0)
                self.stems.snare = (1 - alpha) * self.stems.snare + alpha * min(snare_val, 2.0)
                self.stems.air = (1 - alpha) * self.stems.air + alpha * min(air_val, 2.0)
                self.stems.level = (1 - alpha) * self.stems.level + alpha * min(lvl_val, 2.0)
                self.stems.timestamp = time.time()

        try:
            # Query WASAPI loopback device
            wasapi_device = None
            devices = sd.query_devices()
            for i, dev in enumerate(devices):
                if dev.get('hostapi') == 2 and dev.get('max_input_channels') > 0:  # WASAPI host api
                    if 'loopback' in dev.get('name', '').lower() or dev.get('is_default_output', False):
                        wasapi_device = i
                        break

            with sd.InputStream(device=wasapi_device, channels=2, samplerate=sample_rate,
                                blocksize=block_size, callback=audio_callback):
                while self._running:
                    time.sleep(0.1)
        except Exception:
            time.sleep(0.5)
