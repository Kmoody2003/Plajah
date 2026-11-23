"""Rift Realm vessel shots, layered (Kenne 2026-11-22: keep the real "earth gun" punch, blend in fantasy-cyber —
laser / energy zap and magic blast). Each shot is rendered offline from:

  body    the existing sampled gun (sfx/lance|scatter|chord_N.mp3: the punch Kenne likes) + a real rifle transient
          from the Flow-video clip library for the crack
  zap     synth laser: a pitch-dropping saw/sine pair with a ring-modulated tonal ring
  magic   crystalline chime partials, a sub "whoomp", arcane crackle, and an energy texture clip from the library
  tail    per vessel: Halo Lance = beam hum, Rift Scatter = scattered sparkle, Chord Repeater = a rhythmic harmonic
          arpeggio on the 124 BPM grid

Takes vary pitch, level and grain timing; *_p takes are the PERFECT-beat bloom (brighter chime, octave shimmer,
longer ring). It also gives the reload / dry / switch / impact sounds (from weapons.py) a matching energy layer.
Writes mono 48 kHz mp3s to the game's sfx folder: shot_<gun>_<n>, shot_<gun>_p_<n>, and re-renders the handling set.
Run: "D:/Plajah Runtime/tela-py/Scripts/python.exe" -I scripts/riftrealm/sfx/shots.py   (after weapons.py)
"""
import io, os, subprocess, sys, tempfile, zlib
import numpy as np, soundfile as sf, imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
LIB = 'D:/plajah-tmp/rift-sfx/clips/'
SFX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../public/games/rift-realm/assets/audio/sfx/')
DEMO = 'D:/plajah-tmp/rrw/audio_demo/'


def load(path):
    r = subprocess.run([FF, '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'wav', '-'], capture_output=True, check=True)
    a, _ = sf.read(io.BytesIO(r.stdout))
    return a.astype(np.float64)


def save(a, path, peak_db=-1.0):
    a = np.tanh(a * 1.15) / np.tanh(1.15)                  # gentle glue
    a *= 10 ** (peak_db / 20) / max(1e-9, np.abs(a).max())
    tmp = tempfile.mktemp(suffix='.wav', dir='D:/plajah-tmp')
    sf.write(tmp, a.astype(np.float32), SR)
    subprocess.run([FF, '-y', '-v', 'error', '-i', tmp, '-ac', '1', '-b:a', '160k', path], check=True)
    os.remove(tmp)


def t_(sec):
    return np.arange(int(sec * SR)) / SR


def env(n, a=0.002, d=0.3, curve=4.0):
    t = np.arange(n) / SR
    e = np.exp(-t * curve / max(1e-4, d))
    ai = int(a * SR)
    if ai > 0:
        e[:ai] *= np.linspace(0, 1, ai)
    return e


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a) * x[i] + a * s; y[i] = s
    return y


def hp(x, fc):
    return x - onepole_lp(x, fc)


def onset_crop(a, sec, pre=0.003):
    on = int(np.argmax(np.abs(a) > 0.12 * np.abs(a).max()))
    s = max(0, on - int(pre * SR))
    out = a[s:s + int(sec * SR)].copy()
    fo = int(len(out) * 0.4)
    out[-fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
    return out / max(1e-9, np.abs(out).max())


def mix(dst, src, at=0.0, gain=1.0):
    i = int(at * SR)
    if i >= len(dst):
        return dst
    n = min(len(src), len(dst) - i)
    dst[i:i + n] += src[:n] * gain
    return dst


def resample(a, rate):
    """Pitch/speed change by `rate` (1.04 = 4 % up and shorter)."""
    n = int(len(a) / rate)
    return np.interp(np.arange(n) * rate, np.arange(len(a)), a)


# ── synth layers ──────────────────────────────────────────────────────────────────────────────────────────────────

def zap(rng, f0, f1, dur, bright=1.0):
    """Laser: exponential pitch drop, saw + sine, ring-modulated tonal ring on top."""
    t = t_(dur); n = len(t)
    f = f1 + (f0 - f1) * np.exp(-t * 18 / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    sig = 0.55 * np.sin(ph) + 0.3 * onepole_lp(saw, 5000 * bright)
    ring = np.sin(ph * 1.5) * np.sin(2 * np.pi * (f0 * 0.37) * t)
    sig = sig + 0.25 * ring * bright
    return sig * env(n, 0.001, dur * 0.6, 3.5)


def chime(rng, base, dur, n_part=5, bright=1.0):
    """Crystalline chime: inharmonic bell partials, the high ones die first."""
    t = t_(dur); out = np.zeros(len(t))
    ratios = [1.0, 2.756, 5.404, 8.933, 13.34, 17.2][:n_part]
    for k, r in enumerate(ratios):
        fr = base * r * (1 + rng.uniform(-0.004, 0.004))
        if fr > 15000:
            continue
        out += np.sin(2 * np.pi * fr * t + rng.uniform(0, 6.28)) * np.exp(-t * (3 + k * 3.2) / dur * 1.2) * (0.9 ** k) * (bright if k > 1 else 1)
    return out * env(len(t), 0.0015, dur, 1.0)


def whoomp(dur=0.28, f0=95, f1=34):
    t = t_(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 14)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.004, dur, 3.2)


def crackle(rng, dur, density=220, fc=3500):
    n = int(dur * SR); x = np.zeros(n)
    k = rng.poisson(density * dur)
    for i in rng.integers(0, n, k):
        x[i] = rng.uniform(-1, 1) * (1 - i / n)
    x = hp(onepole_lp(x, fc * 2), fc * 0.4)
    return x / max(1e-9, np.abs(x).max())


def shimmer(rng, dur, count, lo, hi, grain=0.06):
    """Scattered sparkle: many tiny chime grains spread over `dur`."""
    out = np.zeros(int((dur + grain * 4) * SR))
    for _ in range(count):
        at = rng.uniform(0, dur) ** 1.4 / dur ** 0.4
        g = chime(rng, rng.uniform(lo, hi), grain * rng.uniform(1, 3), 3) * rng.uniform(0.3, 1)
        mix(out, g, at)
    return out


def beam_hum(rng, dur, f=110):
    """Halo Lance tail: a beam hum (saw at f + 2f, tremolo) under a cooling whine."""
    t = t_(dur)
    ph = 2 * np.pi * f * t
    saw = sum(np.sin(ph * h) / h for h in range(1, 9))
    hum = onepole_lp(saw, 900) * (0.75 + 0.25 * np.sin(2 * np.pi * 31 * t))
    whine = np.sin(2 * np.pi * np.cumsum(2400 - 900 * t / dur) / SR) * 0.25
    fade = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, len(t)) ** 1.0)       # dies to silence, no hard stop
    return (hum * 0.7 + whine) * env(len(t), 0.04, dur, 2.0) * fade


def arpeggio(rng, notes, step, dur_each=0.22, bright=1.0):
    """Chord Repeater tail: the vessel's chord rung out note by note on the beat grid."""
    out = np.zeros(int((step * len(notes) + dur_each * 2) * SR))
    for i, f in enumerate(notes):
        mix(out, chime(rng, f, dur_each * (1.4 if i == len(notes) - 1 else 1), 4, bright), i * step, 0.9 ** i)
    return out


# ── shot recipes ──────────────────────────────────────────────────────────────────────────────────────────────────

CRACK = onset_crop(load(LIB + 'gunshot/Soldier_firing_rifle_in_stance_02.mp3'), 0.14)
TEX = {
    'lance': onset_crop(load(LIB + 'energy/Creature_performing_electrical_t_01.mp3'), 0.5),
    'scatter': onset_crop(load(LIB + 'energy/Shadow-beast_performs_combat_reel_02.mp3'), 0.45),
    'chord': onset_crop(load(LIB + 'metal/Alien_deer_mammal_motion_study_02.mp3'), 0.6),
}
BODY = {g: [onset_crop(load(SFX + f'{g}_{i}.mp3'), {'lance': 0.5, 'scatter': 0.42, 'chord': 0.36}[g]) for i in (1, 2, 3)] for g in ('lance', 'scatter', 'chord')}
STEP = 60 / 124 / 8  # 1/32 note at 124 BPM


def shot(gun, take, perfect):
    rng = np.random.default_rng(zlib.crc32(f'{gun}/{take}/{perfect}'.encode()))
    p = rng.uniform(0.97, 1.03) * (1.03 if perfect else 1)      # take pitch
    b = 1.6 if perfect else 1.0                                   # bloom
    out = np.zeros(int(1.6 * SR))
    body = resample(BODY[gun][take % 3], rng.uniform(0.98, 1.02))
    if gun == 'lance':
        mix(out, body, 0, 0.9); mix(out, CRACK, 0, 0.45)
        mix(out, zap(rng, 2600 * p, 180 * p, 0.32, b), 0.004, 0.75)
        mix(out, whoomp(0.32, 90, 32), 0, 0.7)
        mix(out, chime(rng, 1320 * p, 0.55 + 0.3 * (b - 1), 5, b), 0.01, 0.38 * b)
        mix(out, hp(TEX['lance'], 300), 0.02, 0.22)
        mix(out, crackle(rng, 0.25, 260), 0.015, 0.12 * b)
        mix(out, beam_hum(rng, 1.1 + 0.3 * (b - 1), 110 * p), 0.05, 0.42)
        if perfect:
            mix(out, chime(rng, 2640 * p, 0.9, 4, 1.3), 0.03, 0.22)
    elif gun == 'scatter':
        mix(out, body, 0, 1.0); mix(out, CRACK, 0, 0.35)
        for k in range(3):                                         # pellets: three short zaps spread a few ms apart
            mix(out, zap(rng, rng.uniform(1700, 2300) * p, 140, 0.16, b), 0.003 + k * rng.uniform(0.006, 0.012), 0.4)
        mix(out, whoomp(0.26, 110, 38), 0, 0.85)
        mix(out, hp(TEX['scatter'], 250), 0.0, 0.3)
        mix(out, crackle(rng, 0.35, 420, 4200), 0.01, 0.25 * b)
        mix(out, shimmer(rng, 0.55 + 0.25 * (b - 1), int(22 * b), 2400, 7200), 0.03, 0.32 * b)
    else:  # chord
        mix(out, body, 0, 0.85); mix(out, CRACK, 0, 0.3)
        mix(out, zap(rng, 3400 * p, 420 * p, 0.18, b), 0.002, 0.6)
        mix(out, whoomp(0.2, 120, 50), 0, 0.45)
        mix(out, hp(TEX['chord'], 500), 0.01, 0.18)
        notes = [880, 1108.7, 1318.5] if take % 2 == 0 else [880, 1318.5, 1760]
        notes = [n * p for n in notes] + ([1760 * p, 2217.5 * p] if perfect else [])
        mix(out, arpeggio(rng, notes, STEP, 0.26, b), 0.02, 0.42 * b)
        mix(out, crackle(rng, 0.12, 200, 5000), 0.0, 0.08)
    # trim the silence at the end, then a raised-cosine release over the last 30 % (no hard stop)
    nz = np.nonzero(np.abs(out) > 1e-3 * np.abs(out).max())[0]
    out = out[: (nz[-1] + 1) if len(nz) else len(out)]
    fo = int(len(out) * 0.3)
    out[-fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
    return out


# ── handling sounds: the same energy family over the real clicks ──────────────────────────────────────────────────

def futurize(name, a):
    rng = np.random.default_rng(zlib.crc32(name.encode()))
    out = np.zeros(len(a) + int(0.35 * SR)); mix(out, a, 0, 1.0)
    if name.startswith('magout'):
        mix(out, zap(rng, 1400, 500, 0.16, 0.6), 0.01, 0.18)          # cell released: a falling servo
        mix(out, crackle(rng, 0.1, 300), 0.0, 0.1)
    elif name.startswith('magin'):
        t = t_(0.22); f = 300 + 900 * (t / t[-1]) ** 0.6                   # cell seated: a rising charge + a lock ring
        mix(out, np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.02, 0.22, 2) * 0.22, 0)
        mix(out, chime(rng, 1980, 0.25, 4), 0.02, 0.2)
    elif name.startswith('charge'):
        t = t_(0.42); f = 180 + 1500 * (t / t[-1]) ** 1.6                  # power-up whine into a shimmer
        mix(out, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.3) * env(len(t), 0.0, 0.6, 1.5) * 0.25, 0)
        mix(out, shimmer(rng, 0.2, 8, 3000, 6500), 0.25, 0.18)
    elif name.startswith('dry'):
        mix(out, hp(crackle(rng, 0.07, 600, 3000), 800), 0.0, 0.25)       # empty cell: a weak fizzle and a low blip
        t = t_(0.08); mix(out, np.sin(2 * np.pi * 220 * t) * env(len(t), 0.001, 0.08, 4) * 0.25, 0.005)
    elif name.startswith('switch'):
        n = int(0.3 * SR); noise = rng.uniform(-1, 1, n)
        sweep = onepole_lp(noise, 2500) * np.sin(np.linspace(0, np.pi, n)) * 0.25
        mix(out, sweep, 0.0); mix(out, chime(rng, 1568, 0.3, 4), 0.12, 0.15)
    elif name.startswith('imp_lance'):
        mix(out, chime(rng, 1320, 0.35, 5), 0.0, 0.3); mix(out, zap(rng, 1800, 300, 0.12), 0, 0.2)
    elif name.startswith('imp_scatter'):
        mix(out, crackle(rng, 0.2, 500, 4500), 0.0, 0.3); mix(out, shimmer(rng, 0.15, 6, 3000, 7000), 0.01, 0.2)
    elif name.startswith('imp_chord'):
        mix(out, arpeggio(rng, [1318.5, 1760], STEP, 0.2), 0.0, 0.3)
    nz = np.nonzero(np.abs(out) > 1e-3)[0]
    return out[: nz[-1] + 1]


if __name__ == '__main__':
    os.makedirs(DEMO, exist_ok=True)
    for gun in ('lance', 'scatter', 'chord'):
        takes = [shot(gun, i, False) for i in range(3)]
        perf = [shot(gun, i, True) for i in range(2)]
        for i, a in enumerate(takes):
            save(a, SFX + f'shot_{gun}_{i + 1}.mp3')
        for i, a in enumerate(perf):
            save(a, SFX + f'shot_{gun}_p_{i + 1}.mp3')
        # before / after demo: three old shots, a beat of silence, three new shots, then a PERFECT one
        gap = np.zeros(int(0.35 * SR)); beat = 60 / 124
        demo = np.zeros(int(9 * SR)); at = 0.2
        for i in range(3):
            mix(demo, load(SFX + f'{gun}_{i + 1}.mp3') * 0.85, at); at += beat * 2
        at += 1.2
        for a in takes:
            mix(demo, a / np.abs(a).max() * 0.85, at); at += beat * 2
        mix(demo, perf[0] / np.abs(perf[0]).max() * 0.9, at)
        save(demo, DEMO + f'{gun}_before_after.mp3', -1.5)
        print(gun, 'takes', [f'{len(a) / SR:.2f}s' for a in takes], 'perfect', [f'{len(a) / SR:.2f}s' for a in perf])
    # handling set: the clean cuts weapons.py picks, with the energy layer on top
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from weapons import PICKS
    for name, (clip, maxs, peak) in PICKS.items():
        a = onset_crop(load(LIB + clip + '.mp3'), maxs)
        save(futurize(name, a), SFX + name + '.mp3', peak)
        print('handling', name)
