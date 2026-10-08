"""
Original procedural underscore for a dossier entrance (no samples, no licensing).

  python scripts/dossier/synth_score.py public/dossier/douglass/score.mp3 [seed]

Voices: bowed cello solo (vibrato, formant-filtered saw), string-pad chords, low bass, sparse piano-like
bells, all through a synthesized hall reverb. D minor, hymn-like progression that resolves to major.
"""
import os, subprocess, sys, wave
import numpy as np

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else "score.mp3"
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 1818)
FFMPEG = os.environ.get("FFMPEG", r"C:\Users\Kenne\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe")

mid = lambda m: 440.0 * 2 ** ((m - 69) / 12)
BEAT = 60 / 54  # slow
CHORD = 8 * BEAT  # two bars of 4
# progression (root, third, fifth) as MIDI, D minor -> D major ending
PROG = [
    (50, 53, 57),  # Dm
    (46, 50, 53),  # Bb
    (53, 57, 60),  # F
    (48, 52, 55),  # C
    (50, 53, 57),  # Dm
    (43, 46, 50),  # Gm
    (45, 49, 52),  # A (major dominant)
    (50, 54, 57),  # D major (resolution)
]
N = int(len(PROG) * CHORD * SR)
T = np.arange(N) / SR


def env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 1.6
    e[-nr:] *= np.linspace(1, 0, nr) ** 1.4
    return e


def string_tone(f, dur, detune=0.0, vib=0.0, harm=10, bright=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    vibr = 1 + vib * np.sin(2 * np.pi * 5.1 * t) * np.minimum(1, t / 1.2)
    ph = 2 * np.pi * np.cumsum(f * 2 ** (detune / 1200) * vibr) / SR
    y = np.zeros(n)
    for h in range(1, harm + 1):
        y += np.sin(h * ph + h * 0.3) / h ** bright
    return y


def place(buf, y, start, gain, pan=0.5):
    s = int(start * SR)
    e = min(len(buf[0]), s + len(y))
    if s >= len(buf[0]):
        return
    seg = y[: e - s]
    buf[0][s:e] += seg * gain * (1 - pan) * 2 * 0.5
    buf[1][s:e] += seg * gain * pan * 2 * 0.5


L = [np.zeros(N), np.zeros(N)]

for i, chord in enumerate(PROG):
    start = i * CHORD
    dur = CHORD + 4.0  # overlap into the next chord
    # string pad: three detuned layers per note
    for m in chord:
        for d, pan in ((-7, 0.35), (0, 0.5), (7, 0.65)):
            y = string_tone(mid(m + 12), dur, d, vib=0.0015, harm=8, bright=1.4) * env(int(dur * SR), 3.2, 4.0)
            place(L, y, start, 0.055, pan)
    # bass: root two octaves down, soft
    yb = string_tone(mid(chord[0] - 12), dur, 0, harm=3, bright=1.0) * env(int(dur * SR), 2.0, 3.5)
    place(L, yb, start, 0.16, 0.5)

# bowed cello melody (enters on chord 3). (beat offset within the progression, midi, beats long)
MEL = [
    (2, 62, 6), (2.0 + 8 * 2, 65, 4), (2.0 + 8 * 2 + 5, 64, 3),
    (8 * 3, 62, 8), (8 * 4 + 1, 69, 5), (8 * 4 + 6, 67, 2),
    (8 * 5, 65, 4), (8 * 5 + 4, 62, 4), (8 * 6, 61, 5), (8 * 6 + 5, 64, 3),
    (8 * 7, 62, 12),
]
for b, m, nb in MEL:
    dur = nb * BEAT
    f = mid(m)
    y = string_tone(f, dur + 1.5, 0, vib=0.006, harm=14, bright=0.95)
    # formant-ish rolloff: weight toward a warm cello body
    y = y * env(len(y), 0.45, 1.3)
    place(L, y, b * BEAT, 0.075, 0.55)

# sparse piano-like bells: pluck on the first beat of each chord (root + fifth, octave up)
for i, chord in enumerate(PROG):
    for k, m in enumerate((chord[0] + 24, chord[2] + 12)):
        t0 = i * CHORD + (0.0 if k == 0 else 3.0 * BEAT)
        n = int(5.0 * SR)
        t = np.arange(n) / SR
        f = mid(m)
        y = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 2.0) + 0.12 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 3.0)) * np.exp(-t / 1.7)
        y[:200] *= np.linspace(0, 1, 200)
        place(L, y, t0, 0.05, 0.4 + 0.2 * k)

# hall reverb: decorrelated decaying noise impulse, FFT convolution
def reverb(x, secs=4.2, wet=0.42):
    n = int(secs * SR)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 2.4)
        ir[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
        # darken the tail
        spec = np.fft.rfft(ir)
        freqs = np.fft.rfftfreq(n, 1 / SR)
        spec *= 1 / (1 + (freqs / 3500) ** 2)
        ir = np.fft.irfft(spec, n)
        ir /= np.sqrt(np.sum(ir ** 2))
        size = len(x[ch]) + n
        nfft = 1 << (size - 1).bit_length()
        y = np.fft.irfft(np.fft.rfft(x[ch], nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x[ch])]
        out.append(x[ch] * (1 - wet) + y * wet)
    return out


L = reverb(L)

# gentle master: high-pass rumble, fade in/out, normalize
fade_in, fade_out = int(4 * SR), int(7 * SR)
for c in range(2):
    x = L[c]
    x = x - np.convolve(x, np.ones(2200) / 2200, mode="same")  # crude high-pass (~20 Hz)
    x[:fade_in] *= np.linspace(0, 1, fade_in) ** 1.5
    x[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.3
    L[c] = x
peak = max(np.abs(L[0]).max(), np.abs(L[1]).max())
scale = 0.62 / peak
pcm = (np.stack(L, axis=1) * scale * 32767).astype(np.int16)

wav = OUT.rsplit(".", 1)[0] + ".tmp.wav"
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
with wave.open(wav, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "192k", OUT], check=True)
os.remove(wav)
print(f"wrote {OUT}: {N / SR:.1f}s, {os.path.getsize(OUT) / 1e6:.1f} MB")
