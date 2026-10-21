import json
import math
import os
import subprocess
import numpy as np
import wave

ROOT = os.getcwd()
OUT_DIR = os.path.join(ROOT, "public", "promo", "chora")
AUDIO_DIR = os.path.join(OUT_DIR, "audio")
FFMPEG = r"C:\Users\Kenne\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"
FFPROBE = r"C:\Users\Kenne\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffprobe.exe"

SR = 44100
DURATION = 30.0
FPS = 30
NUM_FRAMES = int(DURATION * FPS)  # 900 frames


def decode_to_mono_float(mp3_path: str, sr: int = SR) -> np.ndarray:
    tmp_wav = mp3_path + ".tmp.wav"
    subprocess.run(
        [FFMPEG, "-y", "-i", mp3_path, "-ac", "1", "-ar", str(sr), "-f", "wav", tmp_wav],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    with wave.open(tmp_wav, "rb") as wf:
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
    os.remove(tmp_wav)
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return samples


def decode_to_stereo_float(mp3_path: str, sr: int = SR) -> np.ndarray:
    tmp_wav = mp3_path + ".tmp_st.wav"
    subprocess.run(
        [FFMPEG, "-y", "-i", mp3_path, "-ac", "2", "-ar", str(sr), "-f", "wav", tmp_wav],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    with wave.open(tmp_wav, "rb") as wf:
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
    os.remove(tmp_wav)
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return samples.reshape(-1, 2)


def save_stereo_wav_and_mp3(stereo: np.ndarray, wav_path: str, mp3_path: str, sr: int = SR):
    clipped = np.clip(stereo, -0.99, 0.99)
    pcm = (clipped * 32767.0).astype(np.int16)
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())
    subprocess.run(
        [FFMPEG, "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "256k", mp3_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def find_best_30s_window(stereo: np.ndarray, sr: int = SR) -> float:
    # Look for a high-energy 30s window starting near the chorus/drop (around 12s - 55s)
    mono = stereo.mean(axis=1)
    hop = sr // 10  # 0.1s steps
    win = int(30.0 * sr)
    best_score = -1.0
    best_start_sec = 14.0
    max_start = min(len(mono) - win, int(65 * sr))
    for start in range(int(8 * sr), max(int(9 * sr), max_start), hop):
        seg = mono[start : start + win]
        # Score combines RMS energy + dynamic contrast between first 4s and peak drop
        rms_total = float(np.sqrt(np.mean(seg**2)))
        rms_intro = float(np.sqrt(np.mean(seg[: int(4 * sr)] ** 2)))
        rms_drop = float(np.sqrt(np.mean(seg[int(4.5 * sr) : int(25 * sr)] ** 2)))
        score = rms_drop * 1.4 + (rms_drop - rms_intro * 0.4) + rms_total
        if score > best_score:
            best_score = score
            best_start_sec = start / sr
    return round(best_start_sec, 2)


def analyze_30s_audio(stereo: np.ndarray, sr: int = SR):
    mono = stereo.mean(axis=1)
    win_size = 2048
    hann = np.hanning(win_size)
    freqs = np.fft.rfftfreq(win_size, d=1.0 / sr)

    # 32 logarithmic frequency bands from 30Hz to 15000Hz
    band_edges = np.geomspace(30.0, 15000.0, 33)

    frames_data = []
    bass_curve = []
    mid_curve = []
    high_curve = []
    rms_curve = []

    for f_idx in range(NUM_FRAMES):
        center = int((f_idx / FPS) * sr)
        start = max(0, center - win_size // 2)
        end = start + win_size
        if end > len(mono):
            chunk = np.pad(mono[start:], (0, end - len(mono)))
        else:
            chunk = mono[start:end]

        rms = float(np.sqrt(np.mean(chunk**2)))
        spec = np.abs(np.fft.rfft(chunk * hann))

        # Sub/bass (30-160Hz), Mid (160-2500Hz), High (2500-14000Hz)
        bass = float(np.mean(spec[(freqs >= 30) & (freqs < 160)])) if np.any((freqs >= 30) & (freqs < 160)) else 0.0
        mid = float(np.mean(spec[(freqs >= 160) & (freqs < 2500)])) if np.any((freqs >= 160) & (freqs < 2500)) else 0.0
        high = float(np.mean(spec[(freqs >= 2500) & (freqs < 14000)])) if np.any((freqs >= 2500) & (freqs < 14000)) else 0.0

        bands_32 = []
        for b in range(32):
            mask = (freqs >= band_edges[b]) & (freqs < band_edges[b + 1])
            if np.any(mask):
                val = float(np.mean(spec[mask]))
            else:
                idx = np.argmin(np.abs(freqs - band_edges[b]))
                val = float(spec[idx])
            bands_32.append(val)

        bass_curve.append(bass)
        mid_curve.append(mid)
        high_curve.append(high)
        rms_curve.append(rms)
        frames_data.append(bands_32)

    # Normalize curves to 0..1
    def norm_arr(arr):
        a = np.array(arr, dtype=np.float32)
        p98 = float(np.percentile(a, 98)) or 1.0
        return np.clip(a / p98, 0.0, 1.0)

    bass_n = norm_arr(bass_curve)
    mid_n = norm_arr(mid_curve)
    high_n = norm_arr(high_curve)
    rms_n = norm_arr(rms_curve)

    frames_np = np.array(frames_data, dtype=np.float32)
    for b in range(32):
        col = frames_np[:, b]
        p97 = float(np.percentile(col, 97)) or 1.0
        frames_np[:, b] = np.clip((col / p97) ** 0.78, 0.04, 1.0)

    # Detect beat peaks using positive flux of bass + mid
    onset_env = np.maximum(0.0, np.diff(bass_n * 0.7 + mid_n * 0.3, prepend=0.0))
    beat_frames = []
    min_gap_frames = int(0.36 * FPS)  # at most ~165 BPM
    thresh = float(np.percentile(onset_env, 76))
    for i in range(2, NUM_FRAMES - 2):
        if onset_env[i] > thresh and onset_env[i] >= onset_env[i - 1] and onset_env[i] >= onset_env[i + 1]:
            if not beat_frames or (i - beat_frames[-1]) >= min_gap_frames:
                beat_frames.append(i)

    beat_times = [round(f / FPS, 3) for f in beat_frames]

    # Estimate BPM from median inter-beat interval
    if len(beat_times) > 4:
        ibis = np.diff(beat_times)
        median_ibi = float(np.median(ibis))
        bpm = round(60.0 / median_ibi, 1) if median_ibi > 0 else 128.0
        while bpm < 85:
            bpm *= 2
        while bpm > 175:
            bpm /= 2
    else:
        bpm = 130.0

    return {
        "bpm": bpm,
        "beat_times": beat_times,
        "bass": [round(float(x), 4) for x in bass_n],
        "mid": [round(float(x), 4) for x in mid_n],
        "high": [round(float(x), 4) for x in high_n],
        "rms": [round(float(x), 4) for x in rms_n],
        "bands32": [[round(float(v), 3) for v in row] for row in frames_np],
    }


def synthesize_dramatic_sfx(cut_times: list[float], sr: int = SR) -> np.ndarray:
    """Synthesize cinematic sub-booms on scene cuts + dramatic riser (23.2s-26.4s) + massive CTA impact at 26.4s."""
    total_samples = int(DURATION * sr)
    sfx = np.zeros((total_samples, 2), dtype=np.float32)

    def add_sub_hit(t_sec: float, amp: float = 0.55, dur: float = 0.65, f_start: float = 115.0, f_end: float = 34.0):
        idx0 = int(t_sec * sr)
        n = min(int(dur * sr), total_samples - idx0)
        if n <= 0 or idx0 < 0:
            return
        t = np.linspace(0.0, dur, n, endpoint=False)
        # Exponential frequency sweep
        freq = f_start * ((f_end / f_start) ** (t / dur))
        phase = 2.0 * np.pi * np.cumsum(freq) / sr
        env = np.exp(-t * 5.2) * np.minimum(1.0, t / 0.008)
        # Add subtle transient click/whoosh
        noise = np.random.RandomState(int(t_sec * 100)).randn(n) * np.exp(-t * 28.0) * 0.22
        wave_mono = (np.sin(phase) + 0.25 * np.tanh(2.5 * np.sin(phase)) + noise) * env * amp
        sfx[idx0 : idx0 + n, 0] += wave_mono
        sfx[idx0 : idx0 + n, 1] += wave_mono

    # Add sub hits on major scene transitions
    for ct in cut_times:
        add_sub_hit(ct, amp=0.45, dur=0.55, f_start=110.0, f_end=36.0)

    # Dramatic tension riser from 22.8s to 26.4s
    r_start = int(22.8 * sr)
    r_end = int(26.4 * sr)
    r_n = r_end - r_start
    t_r = np.linspace(0.0, 1.0, r_n, endpoint=False)
    riser_freq = 90.0 * (8.0 ** (t_r**1.7))
    riser_phase = 2.0 * np.pi * np.cumsum(riser_freq) / sr
    riser_env = (t_r**2.2) * 0.38
    # Stereo shimmer detune
    sfx[r_start:r_end, 0] += np.sin(riser_phase) * riser_env
    sfx[r_start:r_end, 1] += np.sin(riser_phase * 1.006 + 0.5) * riser_env

    # Massive Finale CTA Impact at 26.4s (Sub-drop + Crystalline Chord Swell)
    add_sub_hit(26.40, amp=0.82, dur=1.8, f_start=140.0, f_end=28.0)
    c_start = int(26.40 * sr)
    c_n = total_samples - c_start
    t_c = np.linspace(0.0, c_n / sr, c_n, endpoint=False)
    # D-minor 9th cinematic synth brass/pad chord (D2, A2, D3, F3, A3, E4)
    chord_freqs = [73.42, 110.0, 146.83, 174.61, 220.0, 329.63]
    chord_L = np.zeros(c_n, dtype=np.float32)
    chord_R = np.zeros(c_n, dtype=np.float32)
    c_env = np.minimum(1.0, t_c / 0.04) * np.exp(-t_c * 0.85) * 0.32
    for i, cf in enumerate(chord_freqs):
        det = 1.0 + (i - 2.5) * 0.0018
        chord_L += np.sin(2.0 * np.pi * cf * t_c) * (0.8 / len(chord_freqs))
        chord_R += np.sin(2.0 * np.pi * cf * det * t_c + 0.3 * i) * (0.8 / len(chord_freqs))
    sfx[c_start:, 0] += chord_L * c_env
    sfx[c_start:, 1] += chord_R * c_env

    return np.clip(sfx, -0.95, 0.95)


def main():
    vo_manifest_path = os.path.join(OUT_DIR, "vo_manifest.json")
    with open(vo_manifest_path, "r", encoding="utf-8") as f:
        vo_manifest = json.load(f)

    vo_segments = vo_manifest["voSegments"]
    # Adjust VO start times cleanly across the 30.0s timeline so every VO phrase lands on a section cut
    # and finishes before 29.5s!
    total_vo_dur = sum(s["duration"] for s in vo_segments)
    print(f"Total Aria VO spoken duration across 5 segments: {total_vo_dur:.2f}s")

    # Load Track 1: K-Moody - GOLIATH LIONESS
    track1_path = os.path.join(AUDIO_DIR, "kmoody_goliath_lioness_full.mp3")
    stereo_full = decode_to_stereo_float(track1_path, SR)
    best_start = find_best_30s_window(stereo_full, SR)
    print(f"Selected best 30.0s window of K-Moody 'GOLIATH LIONESS' starting at {best_start:.2f}s")

    start_sample = int(best_start * SR)
    total_samples = int(DURATION * SR)
    music_30s = stereo_full[start_sample : start_sample + total_samples].copy()

    # Apply smooth 0.35s fade-in and 1.1s fade-out on the 30s music bed
    fi_n = int(0.35 * SR)
    fo_n = int(1.10 * SR)
    music_30s[:fi_n] *= np.linspace(0.0, 1.0, fi_n)[:, None]
    music_30s[-fo_n:] *= np.linspace(1.0, 0.0, fo_n)[:, None]

    # Save standalone 30s music bed for Fabula track A2
    music_30s_wav = os.path.join(AUDIO_DIR, "kmoody_goliath_lioness_30s.wav")
    music_30s_mp3 = os.path.join(AUDIO_DIR, "kmoody_goliath_lioness_30s.mp3")
    save_stereo_wav_and_mp3(music_30s, music_30s_wav, music_30s_mp3, SR)
    print(f"Saved 30s music bed: {music_30s_mp3}")

    # Analyze beat grid and 32-band FFT
    analysis = analyze_30s_audio(music_30s, SR)
    print(f"Detected BPM: {analysis['bpm']} | Beat count: {len(analysis['beat_times'])}")

    # Snap 8 high-impact visual scene cuts to the nearest beat timestamps!
    # Target cut structure across 30.0s:
    # Seg 1 (0.0 - 3.8s): Opening Hook + K-Moody Goliath EP Vinyl/Orrery Ignition
    # Seg 2 (3.8 - 7.5s): Chora 7-Engine FX Stage (Milkdrop + Flux + Shader Reactive Visualizer)
    # Seg 3 (7.5 - 11.2s): Kinetic 3D Lyrics ("GOLIATH LIONESS") + Gatefold Planetary Orrery Stage
    # Seg 4 (11.2 - 14.8s): Audience Immersion I — 24-Bit/192kHz Lossless FLAC + Sky Tonight Observatory
    # Seg 5 (14.8 - 18.4s): Audience Immersion II — Live Synced Listening Parties + The Cultural Vault
    # Seg 6 (18.4 - 22.4s): Creator Command I — Chora Studio AI Stem Mixer, Mackie Faders & Melos DAW
    # Seg 7 (22.4 - 26.4s): Creator Command II — Chora Artist Manager (Tours, Sync, Payroll) + Auto-Promo Suite
    # Seg 8 (26.4 - 30.0s): Dramatic Shockwave Climax + Call To Action ("EXPERIENCE PLAJAH CHORA")
    target_cuts = [0.0, 3.8, 7.5, 11.2, 14.8, 18.4, 22.4, 26.4, 30.0]
    snapped_cuts = [0.0]
    beats = analysis["beat_times"]
    for tc in target_cuts[1:-1]:
        if beats:
            nearest = min(beats, key=lambda b: abs(b - tc))
            if abs(nearest - tc) <= 0.45:
                snapped_cuts.append(round(nearest, 2))
            else:
                snapped_cuts.append(tc)
        else:
            snapped_cuts.append(tc)
    snapped_cuts.append(30.0)
    print("Beat-snapped scene cuts (sec):", snapped_cuts)

    # Position the 5 Aria VO segments cleanly inside the 30.0s timeline
    # Apply broadcast promo cadence tightening (trim dead air + subtle 1.18x tempo with pitch preserved)
    vo_track = np.zeros((total_samples, 2), dtype=np.float32)
    duck_env = np.ones(total_samples, dtype=np.float32)

    # Target windows for the 5 VO segments across the 8 beat-snapped cuts:
    # VO 1 (Hook): starts ~0.25s (over Seg 1)
    # VO 2 (Visualizer & Orrery): starts at Seg 2 (~4.9s)
    # VO 3 (Audience Immersion): starts at Seg 4 (~10.8s)
    # VO 4 (Creator Command): starts at Seg 6 (~16.8s)
    # VO 5 (Dramatic CTA): starts at ~24.2s so "Experience Plajah Chora today" lands right on the 26.4s climax drop!
    desired_starts = [
        0.25,
        max(4.75, snapped_cuts[1] + 0.15),
        max(10.60, snapped_cuts[3] - 0.10),
        max(16.60, snapped_cuts[5] - 0.80),
        24.20,
    ]
    max_allowed_durs = [4.20, 5.20, 5.30, 6.60, 4.70]

    cursor_sec = 0.20
    for i, seg in enumerate(vo_segments):
        raw_mp3 = seg["path"]
        raw_backup = raw_mp3.replace(".mp3", "_raw.mp3")
        if not os.path.exists(raw_backup):
            import shutil
            shutil.copyfile(raw_mp3, raw_backup)

        # First pass: trim silence + tighten internal pauses + 1.18x commercial promo cadence
        tight_wav = raw_mp3.replace(".mp3", "_tight.wav")
        af_chain = (
            "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-40dB:"
            "stop_periods=-1:stop_duration=0.16:stop_threshold=-38dB,"
            "atempo=1.18"
        )
        subprocess.run(
            [FFMPEG, "-y", "-i", raw_backup, "-af", af_chain, "-ac", "2", "-ar", str(SR), tight_wav],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with wave.open(tight_wav, "rb") as wf:
            vo_audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, 2) / 32768.0

        # If still slightly longer than max_allowed_durs[i], apply fine tempo adjustment
        cur_dur = len(vo_audio) / SR
        if cur_dur > max_allowed_durs[i]:
            extra_tempo = min(1.32, (cur_dur / max_allowed_durs[i]) * 1.18)
            af_chain2 = (
                "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-40dB:"
                "stop_periods=-1:stop_duration=0.14:stop_threshold=-38dB,"
                f"atempo={extra_tempo:.3f}"
            )
            subprocess.run(
                [FFMPEG, "-y", "-i", raw_backup, "-af", af_chain2, "-ac", "2", "-ar", str(SR), tight_wav],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            with wave.open(tight_wav, "rb") as wf:
                vo_audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, 2) / 32768.0
        os.remove(tight_wav)

        # Save the tightened broadcast VO MP3 & WAV so Fabula track A1 clips match 1:1
        save_stereo_wav_and_mp3(vo_audio, raw_mp3.replace(".mp3", ".wav"), raw_mp3, SR)

        dur_sec = round(len(vo_audio) / SR, 3)
        seg["duration"] = dur_sec
        start_sec = max(cursor_sec, desired_starts[i])
        if i == len(vo_segments) - 1 and start_sec + dur_sec > 29.45:
            start_sec = max(cursor_sec, round(29.45 - dur_sec, 2))
        seg["startSec"] = round(start_sec, 2)
        cursor_sec = seg["startSec"] + dur_sec + 0.45

        idx0 = int(seg["startSec"] * SR)
        idx1 = min(total_samples, idx0 + len(vo_audio))
        n_copy = idx1 - idx0
        if n_copy > 0:
            vo_track[idx0:idx1] += vo_audio[:n_copy] * 1.22
            # Duck music to 0.34 during VO with smooth 180ms attack/release ramps
            pad = int(0.18 * SR)
            d0 = max(0, idx0 - pad)
            d1 = min(total_samples, idx1 + pad)
            duck_env[idx0:idx1] = np.minimum(duck_env[idx0:idx1], 0.34)
            if idx0 > d0:
                ramp_down = np.linspace(1.0, 0.34, idx0 - d0)
                duck_env[d0:idx0] = np.minimum(duck_env[d0:idx0], ramp_down)
            if d1 > idx1:
                ramp_up = np.linspace(0.34, 1.0, d1 - idx1)
                duck_env[idx1:d1] = np.minimum(duck_env[idx1:d1], ramp_up)

        print(f"Placed {seg['id']} at {seg['startSec']:.2f}s -> {seg['startSec'] + dur_sec:.2f}s (dur={dur_sec:.2f}s)")

    # Synthesize dramatic SFX track (sub hits on cuts + tension riser + finale boom)
    sfx_track = synthesize_dramatic_sfx(snapped_cuts[1:-1], SR)
    sfx_wav = os.path.join(AUDIO_DIR, "sfx_dramatic_impacts.wav")
    sfx_mp3 = os.path.join(AUDIO_DIR, "sfx_dramatic_impacts.mp3")
    save_stereo_wav_and_mp3(sfx_track, sfx_wav, sfx_mp3, SR)
    print(f"Saved dramatic SFX track: {sfx_mp3}")

    # Master Mix: Ducked K-Moody Goliath Lioness + Aria VO + Dramatic SFX
    master_mix = music_30s * duck_env[:, None] * 0.92 + vo_track + sfx_track * 0.78
    # Soft broadcast limiter
    master_mix = np.tanh(master_mix * 1.12) * 0.94
    mix_wav = os.path.join(AUDIO_DIR, "chora_promo_30s_mix.wav")
    mix_mp3 = os.path.join(AUDIO_DIR, "chora_promo_30s_mix.mp3")
    save_stereo_wav_and_mp3(master_mix, mix_wav, mix_mp3, SR)
    print(f"Saved master 30.0s audio mix: {mix_mp3}")

    # Save complete beat & audio analysis + VO manifest
    out_meta = {
        "trackTitle": "GOLIATH LIONESS",
        "artist": "K-Moody",
        "albumTitle": "Goliath EP",
        "albumId": "album_1777220736355_b8z8r",
        "trackId": "6qarqkzyv",
        "windowStartSec": best_start,
        "durationSec": DURATION,
        "fps": FPS,
        "bpm": analysis["bpm"],
        "sceneCutsSec": snapped_cuts,
        "beatTimesSec": analysis["beat_times"],
        "voSegments": vo_segments,
        "bass": analysis["bass"],
        "mid": analysis["mid"],
        "high": analysis["high"],
        "rms": analysis["rms"],
        "bands32": analysis["bands32"],
    }
    analysis_path = os.path.join(OUT_DIR, "promo_analysis.json")
    with open(analysis_path, "w", encoding="utf-8") as f:
        json.dump(out_meta, f, indent=2)
    print(f"Wrote {analysis_path}")


if __name__ == "__main__":
    main()
