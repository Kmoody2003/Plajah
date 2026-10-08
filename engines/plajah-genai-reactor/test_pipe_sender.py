"""
Plajah Mock Audio Pipe Sender:
Simulates Plajah Desktop's real-time audio stem telemetry over \\\\.\\pipe\\PlajahAudioPipe.
Broadcasts 24-byte structs (kick, snare, voice, air, sub_bass, level) at 60 Hz.
"""

import math
import struct
import time
import win32file
import win32pipe


def run_mock_broadcaster(pipe_name: str = "PlajahAudioPipe", bpm: float = 124.0):
    full_pipe_name = f"\\\\.\\pipe\\{pipe_name}"
    print(f"[MockAudioSender] Creating Named Pipe server at: {full_pipe_name}")
    print(f"[MockAudioSender] Simulating BPM: {bpm} (4/4 kick & snare rhythm)")

    pipe_handle = win32pipe.CreateNamedPipe(
        full_pipe_name,
        win32pipe.PIPE_ACCESS_OUTBOUND,
        win32pipe.PIPE_TYPE_MESSAGE | win32pipe.PIPE_READMODE_MESSAGE | win32pipe.PIPE_WAIT,
        1, 65536, 65536, 0, None
    )

    print("[MockAudioSender] Waiting for client connection (Start run_reactor.py)...")
    win32pipe.ConnectNamedPipe(pipe_handle, None)
    print("[MockAudioSender] Client connected! Streaming audio telemetry at 60 Hz...")

    start_time = time.time()
    beat_interval = 60.0 / bpm

    try:
        while True:
            t = time.time() - start_time
            beat_time = (t % beat_interval) / beat_interval  # 0.0 to 1.0 within beat
            current_beat = int(t / beat_interval) % 4  # 0, 1, 2, 3 in 4/4 measure

            # Kick on beats 0, 1, 2, 3 (Four-on-the-floor)
            kick_transient = max(0.0, 1.0 - beat_time * 5.0) if beat_time < 0.2 else 0.0
            kick = float(kick_transient * 1.4)

            # Sub-bass follows kick with gentle tail
            sub_bass = float(kick_transient * 1.8 + math.sin(t * 3.0) * 0.2 + 0.3)

            # Snare on beats 1 and 3 (Backbeat)
            snare = 0.0
            if current_beat in (1, 3):
                snare_transient = max(0.0, 1.0 - beat_time * 4.5) if beat_time < 0.22 else 0.0
                snare = float(snare_transient * 1.3)

            # Voice formants: Slow melodic swell
            voice = float(0.5 + 0.5 * math.sin(t * 0.8))

            # Air: High hat tick on eighth notes
            eighth_time = ((t * 2) % beat_interval) / beat_interval
            air = float(max(0.0, 1.0 - eighth_time * 6.0) * 0.8)

            level = (kick + snare + voice + air) * 0.25

            # Pack 6 float32s (24 bytes)
            payload = struct.pack("<6f", kick, snare, voice, air, sub_bass, level)
            win32file.WriteFile(pipe_handle, payload)

            time.sleep(1.0 / 60.0)
    except Exception as e:
        print(f"[MockAudioSender] Pipe closed or disconnected: {e}")
    finally:
        win32file.CloseHandle(pipe_handle)


if __name__ == "__main__":
    run_mock_broadcaster()
