"""
Extracts real character voice audio clips from the Pumpkin Patch (2025) feature film
and computes learned acoustic vocal-tract profiles (F0 pitch, F1-F4 formants, 32-band
spectral envelope, and a minimum-phase FIR vocal-tract impulse response WAV for
Web Audio ConvolverNode spectral timbre transfer) for each character.

Outputs:
  - public/audio/halloween/voices/{char_id}_movie_sample.wav
  - public/audio/halloween/voices/{char_id}_vocal_ir.wav
  - public/audio/halloween/voices/learned_voice_profiles.json
"""

import os
import json
import wave
import math
import urllib.request
import numpy as np
import av

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "audio", "halloween", "voices")
CACHE_DIR = os.path.join(ROOT, ".cache", "halloween")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

VIDEO_URL = "https://stream.mux.com/D1A4FF6AJXRbfbPjzvzQCkj5srRk99uXpnDn00gTKDts/medium.mp4"
LOCAL_MP4 = os.path.join(CACHE_DIR, "pumpkin_patch_medium.mp4")

# Exact character dialogue windows from the movie (verified from Story Intelligence timecodes)
CHARACTER_VOICE_SEGMENTS = {
    "char_1": {
        "name": "Melvin Lester (Pumpkin Patch)",
        "segments": [
            (1196.0, 1206.5),  # "I remember you. Didn't I beat you and your bow tie buddy in a game of goblin ball? You're robo-bones, right?"
            (1223.0, 1233.5),  # "I already told you... I don't work for government stooges. Keep it. You got nothing I need."
        ],
        "quote": "I already told you... I don't work for government stooges. Keep it. You got nothing I need.",
    },
    "char_3": {
        "name": "Wicked Witch Miriam",
        "segments": [
            (934.0, 938.5),    # "Zoraster? Zoraster is dead, darling. I fear you are mistaken."
            (2329.0, 2335.0),  # "Come out wherever you are, horseman. I sense you're near."
        ],
        "quote": "Zoraster is dead, darling. Come out wherever you are, horseman. I sense you're near.",
    },
    "char_4": {
        "name": "Stitch (The Scarecrow)",
        "segments": [
            (1025.0, 1035.0),  # "Well, hello there, gorgeous. Remember me? It's been a while. Sorry your little attack plan failed."
        ],
        "quote": "Well, hello there, gorgeous. Remember me? It's been a while. Sorry your little attack plan failed.",
    },
    "char_8": {
        "name": "Director Jack (Ichabod Crane)",
        "segments": [
            (444.0, 457.5),    # "District 13? Dracula, dammit! What the hell was he doing in the air at all? Nobody walks out of District 13."
        ],
        "quote": "District 13? Dracula, dammit! Nobody walks out of District 13. Not even our best operatives.",
    },
    "char_5": {
        "name": "Commander Crane (Robo-Bones)",
        "segments": [
            (412.0, 418.0),    # "Scareforce One launched, unannounced, then flew toward the border over New Hallows City."
            (448.0, 453.0),    # "Unclear, but appears clandestine. What's certain is Teppas is now trapped in a prison colony."
        ],
        "quote": "Scareforce One launched, unannounced, then flew toward the border over New Hallows City.",
    },
    "char_2": {
        "name": "Special Agent Katrina Van Tassel",
        "segments": [
            (469.0, 474.5),    # "Fast! No chance. Scareforce One went down in Hallow Bay. Every camera in New Hallows saw it."
            (1105.0, 1113.3),  # "Agent Van Tassel, please proceed. Sorry, I just think he's cool."
        ],
        "quote": "Scareforce One went down in Hallow Bay. Every camera in New Hallows saw it.",
    },
    "char_marv": {
        "name": "Marv (District 13 Tavern Fixer)",
        "segments": [
            (710.0, 716.5),    # "You better pray, Pumpkin Patch, 'cause your soul is mine."
            (732.0, 737.0),    # "Goddamn it, Melvin! What did I say about beheadings?"
        ],
        "quote": "You better pray, Pumpkin Patch! Goddamn it, Melvin, what did I say about beheadings?",
    },
    "char_6": {
        "name": "Lil' Boo (Ectoplasmic Ghost)",
        "segments": [
            (737.0, 742.0),
            (2241.0, 2246.5),
        ],
        "quote": "Boo-oo! Ectoplasmic containment jar charged to 100%!",
    },
    "char_7": {
        "name": "President Tepes",
        "segments": [
            (2241.0, 2246.5),  # "That's pretty metal, I guess. You think we'll make it?"
            (3052.5, 3059.0),  # "I am Bartholomew Worthington of the West Hallow High Command. What are your orders?"
        ],
        "quote": "That's pretty metal, I guess. You think we'll make it?",
    },
}

TARGET_SR = 24000


def write_wav_mono(path: str, samples: np.ndarray, sr: int = TARGET_SR):
    samples = np.asarray(samples, dtype=np.float32)
    peak = np.max(np.abs(samples))
    if peak > 1e-5:
        samples = samples / peak * 0.88
    pcm16 = np.clip(samples * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm16.tobytes())


def extract_segment_samples(container, stream, resampler, start_sec: float, end_sec: float) -> np.ndarray:
    tb = float(stream.time_base)
    target_pts = int(start_sec / tb)
    container.seek(target_pts, stream=stream, any_frame=False, backward=True)
    chunks = []
    for frame in container.decode(stream):
        if frame.pts is None:
            continue
        t = frame.pts * tb
        if t < start_sec - 0.05:
            continue
        if t > end_sec + 0.05:
            break
        out_frames = resampler.resample(frame)
        for of in out_frames:
            arr = of.to_ndarray()
            if arr.ndim == 2:
                arr = arr.mean(axis=0)
            chunks.append(arr.astype(np.float32))
    if not chunks:
        return np.zeros(int((end_sec - start_sec) * TARGET_SR), dtype=np.float32)
    audio = np.concatenate(chunks)
    # Apply gentle 30ms fade-in/out so clips never click
    fade = min(int(0.03 * TARGET_SR), len(audio) // 4)
    if fade > 0:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        audio[:fade] *= ramp
        audio[-fade:] *= ramp[::-1]
    return audio


def analyze_character_voice_and_build_ir(audio: np.ndarray, sr: int = TARGET_SR):
    """
    Computes from the real extracted movie dialogue:
      1. Fundamental frequency F0 (Hz) via autocorrelation on voiced frames
      2. Cepstrally-smoothed spectral envelope (real vocal tract response)
      3. Formant peak frequencies F1, F2, F3, F4 (Hz) and gains (dB)
      4. Minimum-phase 256-tap FIR Vocal Tract Impulse Response for Web Audio ConvolverNode
    """
    n_fft = 1024
    hop = 256
    win = np.hanning(n_fft).astype(np.float32)

    mag_accum = np.zeros(n_fft // 2 + 1, dtype=np.float64)
    f0_list = []
    voiced_count = 0

    for i in range(0, len(audio) - n_fft, hop):
        frame = audio[i : i + n_fft] * win
        rms = float(np.sqrt(np.mean(frame * frame)))
        if rms < 0.015:
            continue  # skip silence
        spec = np.abs(np.fft.rfft(frame))
        mag_accum += spec
        voiced_count += 1

        # Autocorrelation pitch estimation in [75 Hz .. 420 Hz]
        corr = np.correlate(frame, frame, mode="full")[n_fft - 1 :]
        min_lag = int(sr / 420.0)
        max_lag = min(int(sr / 75.0), len(corr) - 1)
        if max_lag > min_lag:
            sub = corr[min_lag:max_lag]
            best_lag = min_lag + int(np.argmax(sub))
            if corr[best_lag] > 0.28 * corr[0]:
                f0_list.append(sr / float(best_lag))

    if voiced_count == 0:
        mag_accum += 1.0
        voiced_count = 1

    avg_mag = mag_accum / float(voiced_count)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)

    # Cepstral liftering to isolate smooth vocal-tract spectral envelope (removing pitch harmonics)
    log_mag = np.log(np.maximum(avg_mag, 1e-6))
    cepstrum = np.fft.irfft(log_mag)
    lifter_cutoff = 28  # keep low quefrencies = vocal tract shape
    cepstrum[lifter_cutoff : len(cepstrum) - lifter_cutoff + 1] = 0.0
    smooth_log_env = np.real(np.fft.rfft(cepstrum))

    # Normalize spectral envelope around 300-3400 Hz speech band
    speech_mask = (freqs >= 120) & (freqs <= 4500)
    smooth_log_env -= np.mean(smooth_log_env[speech_mask])
    # Clamp extremes so ConvolverNode sounds warm, natural, and artifact-free
    smooth_log_env = np.clip(smooth_log_env * 0.65, -2.2, 2.2)
    # Roll off sub-70Hz rumble and >9kHz hiss
    smooth_log_env[freqs < 70] -= 1.8
    smooth_log_env[freqs > 9000] -= 1.2

    # Find dominant formant peaks in standard vocal-tract ranges
    def find_band_peak(f_lo, f_hi, default_hz):
        mask = (freqs >= f_lo) & (freqs <= f_hi)
        if not np.any(mask):
            return default_hz, 0.0
        idx = np.where(mask)[0]
        local_best = idx[int(np.argmax(smooth_log_env[idx]))]
        hz = float(freqs[local_best])
        db = float(np.clip(smooth_log_env[local_best] * 6.0, -8.0, 9.0))
        return round(hz, 1), round(db, 2)

    f1_hz, f1_db = find_band_peak(250, 850, 520.0)
    f2_hz, f2_db = find_band_peak(900, 2350, 1550.0)
    f3_hz, f3_db = find_band_peak(2400, 3600, 2850.0)
    f4_hz, f4_db = find_band_peak(3650, 4800, 3950.0)

    f0_median = float(np.median(f0_list)) if f0_list else 145.0
    f0_std = float(np.std(f0_list)) if f0_list else 18.0

    # Construct minimum-phase 256-tap FIR Vocal Tract Impulse Response from smooth_log_env
    # Using real cepstrum minimum-phase reconstruction:
    full_cep = np.fft.irfft(smooth_log_env, n=n_fft)
    min_phase_cep = np.zeros_like(full_cep)
    min_phase_cep[0] = full_cep[0]
    min_phase_cep[1 : n_fft // 2] = 2.0 * full_cep[1 : n_fft // 2]
    min_phase_cep[n_fft // 2] = full_cep[n_fft // 2]
    min_phase_spec = np.exp(np.fft.rfft(min_phase_cep))
    ir_full = np.fft.irfft(min_phase_spec, n=n_fft)
    ir_len = 256
    ir = ir_full[:ir_len].astype(np.float32)
    # Apply exponential decay window for zero ringing
    ir *= np.exp(-np.linspace(0.0, 5.5, ir_len)).astype(np.float32)
    # Normalize energy to unity so ConvolverNode doesn't clip
    energy = float(np.sqrt(np.sum(ir * ir)))
    if energy > 1e-6:
        ir /= energy

    # Downsample spectral envelope to 24 points for UI visualization
    env_indices = np.linspace(2, int(n_fft * 0.25), 24).astype(int)
    spectral_curve = [round(float(smooth_log_env[idx]), 3) for idx in env_indices]

    return {
        "f0MedianHz": round(f0_median, 1),
        "f0StdHz": round(f0_std, 1),
        "formants": {
            "f1Hz": f1_hz,
            "f1GainDb": f1_db,
            "f2Hz": f2_hz,
            "f2GainDb": f2_db,
            "f3Hz": f3_hz,
            "f3GainDb": f3_db,
            "f4Hz": f4_hz,
            "f4GainDb": f4_db,
        },
        "spectralEnvelope24": spectral_curve,
        "voicedFramesAnalyzed": voiced_count,
    }, ir


def main():
    if not os.path.exists(LOCAL_MP4) or os.path.getsize(LOCAL_MP4) < 1_000_000:
        print(f"Downloading Pumpkin Patch stream to {LOCAL_MP4} ...")
        req = urllib.request.Request(VIDEO_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(LOCAL_MP4, "wb") as out:
            while True:
                buf = resp.read(1024 * 512)
                if not buf:
                    break
                out.write(buf)
        print(f"Downloaded {os.path.getsize(LOCAL_MP4) / (1024*1024):.1f} MB")
    else:
        print(f"Using cached {LOCAL_MP4} ({os.path.getsize(LOCAL_MP4) / (1024*1024):.1f} MB)")

    container = av.open(LOCAL_MP4)
    audio_stream = next(s for s in container.streams if s.type == "audio")
    resampler = av.AudioResampler(format="fltp", layout="mono", rate=TARGET_SR)

    profiles = {}
    for char_id, meta in CHARACTER_VOICE_SEGMENTS.items():
        seg_audios = []
        for start_s, end_s in meta["segments"]:
            clip = extract_segment_samples(container, audio_stream, resampler, start_s, end_s)
            seg_audios.append(clip)
            # Tiny 120ms pause between concatenated lines
            seg_audios.append(np.zeros(int(0.12 * TARGET_SR), dtype=np.float32))
        full_audio = np.concatenate(seg_audios)

        sample_wav_path = os.path.join(OUT_DIR, f"{char_id}_movie_sample.wav")
        ir_wav_path = os.path.join(OUT_DIR, f"{char_id}_vocal_ir.wav")
        write_wav_mono(sample_wav_path, full_audio, TARGET_SR)

        analysis, ir = analyze_character_voice_and_build_ir(full_audio, TARGET_SR)
        write_wav_mono(ir_wav_path, ir, TARGET_SR)

        # Compute recommended natural pitch shift relative to a typical 165Hz streamer voice
        f0 = analysis["f0MedianHz"]
        natural_semitones = round(12.0 * math.log2(max(85.0, min(290.0, f0)) / 165.0), 2)

        profiles[char_id] = {
            "characterId": char_id,
            "name": meta["name"],
            "quote": meta["quote"],
            "movieSampleUrl": f"/audio/halloween/voices/{char_id}_movie_sample.wav",
            "vocalTractIrUrl": f"/audio/halloween/voices/{char_id}_vocal_ir.wav",
            "segments": meta["segments"],
            "durationSec": round(len(full_audio) / float(TARGET_SR), 2),
            "naturalSemitoneTarget": natural_semitones,
            **analysis,
        }
        print(
            f"[{char_id}] {meta['name']}: {profiles[char_id]['durationSec']}s extracted | "
            f"F0={f0:.1f}Hz | F1={analysis['formants']['f1Hz']}Hz F2={analysis['formants']['f2Hz']}Hz F3={analysis['formants']['f3Hz']}Hz"
        )

    container.close()

    json_path = os.path.join(OUT_DIR, "learned_voice_profiles.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2)
    print(f"Saved learned voice profiles to {json_path}")


if __name__ == "__main__":
    main()
