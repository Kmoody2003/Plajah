#!/usr/bin/env python3
"""Procedural monster SFX for Ravencrest — 100% synthesized, no samples."""
import numpy as np
from scipy import signal
from scipy.io import wavfile
import os

SR = 48000
OUT = os.path.expanduser("~/workspace/ravencrest/audio")
rng = np.random.default_rng(20261022)
PEAK = 10 ** (-1.0 / 20.0)  # -1 dBFS = 0.8913

def t_axis(dur):
    return np.arange(int(SR * dur)) / SR

def normalize(x):
    p = np.max(np.abs(x))
    if p > 0:
        x = x * (PEAK / p)
    return x

def save(name, x):
    """x: mono (N,) or stereo (N,2) float in [-1,1]. Peak-normalize, write int16 WAV."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = np.column_stack([x, x])
    x = normalize(x)
    wavfile.write(os.path.join(OUT, name), SR, (x * 32767).astype(np.int16))
    print("wrote", name, f"{len(x)/SR:.2f}s")

def stereo(mono, width=0.3, seed=1, loop=False):
    """Decorrelate a mono signal into stereo with a complementary allpass-ish trick.
    loop=True uses circular (FFT) convolution so a periodic input stays perfectly seamless."""
    r = np.random.default_rng(seed)
    k = np.exp(-np.arange(64) / 18.0) * r.standard_normal(64)
    if loop:
        K = np.fft.rfft(k, len(mono))
        ch2 = np.fft.irfft(np.fft.rfft(mono) * K, len(mono)) * 0.4
    else:
        k /= np.max(np.abs(np.convolve(mono[:4096], k))) + 1e-9
        ch2 = np.convolve(mono, k * 0.4)[: len(mono)]
    ch2 = ch2 / (np.max(np.abs(ch2)) + 1e-9) * (np.max(np.abs(mono)) + 1e-9)
    return np.column_stack([mono * (1 - width * 0.3), ch2 * width + mono * (1 - width)])

def filt(x, kind, freq, order=4, Q=None):
    if kind in ("lowpass", "highpass"):
        sos = signal.butter(order, freq, btype=kind, fs=SR, output="sos")
    else:  # bandpass
        sos = signal.butter(order, freq, btype="bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)

def periodic_filtered_noise(dur, kind, freq, order=4, seed=7):
    """Noise filtered in the FFT domain -> inherently periodic (seamless loop)."""
    n = int(SR * dur)
    r = np.random.default_rng(seed)
    white = r.standard_normal(n)
    W = np.fft.rfft(white)
    f = np.fft.rfftfreq(n, 1 / SR)
    if kind == "lowpass":
        H = 1.0 / (1.0 + (f / max(freq, 1)) ** (2 * order))
    elif kind == "highpass":
        H = (f / max(freq, 1)) ** (2 * order) / (1.0 + (f / max(freq, 1)) ** (2 * order))
    else:  # bandpass around freq, width ~ freq
        H = np.exp(-0.5 * ((np.log2((f + 1) / freq)) ** 2) / 0.8**2)
    y = np.fft.irfft(W * H, n)
    return y / (np.max(np.abs(y)) + 1e-9)

def chirp(start_f, end_f, dur, curve="exp"):
    n = int(SR * dur)
    tt = np.arange(n) / SR
    if curve == "exp":
        f = start_f * (end_f / start_f) ** (tt / dur)
    else:
        f = start_f + (end_f - start_f) * (tt / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph), tt

def env_exp(dur, tau):
    tt = t_axis(dur)
    return np.exp(-tt / tau)

def add_at(buf, sig, start_s):
    i = int(start_s * SR)
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]
    return buf

def droplets(dur_total, count, f_lo=700, f_hi=3200, seed=3, decay_rate=True):
    """Random droplet plinks: short pitch-dropping sine pings."""
    r = np.random.default_rng(seed)
    buf = np.zeros(int(SR * dur_total))
    times = np.sort(r.uniform(0, dur_total, count))
    for i, ts in enumerate(times):
        frac = i / max(count, 1)
        amp = (1 - 0.65 * frac) if decay_rate else 1.0
        f0 = r.uniform(f_lo, f_hi)
        s, _ = chirp(f0, f0 * r.uniform(0.45, 0.65), r.uniform(0.04, 0.10))
        s *= np.exp(-np.arange(len(s)) / SR / r.uniform(0.015, 0.035)) * amp * r.uniform(0.4, 1.0)
        add_at(buf, s, ts)
    return buf

def metallic_ping(f0, dur=0.12, amp=1.0):
    tt = t_axis(dur)
    ratios = [1.0, 2.76, 5.40, 8.93, 13.3]
    gains = [1.0, 0.6, 0.35, 0.2, 0.1]
    y = np.zeros_like(tt)
    for rt, g in zip(ratios, gains):
        y += g * np.sin(2 * np.pi * f0 * rt * tt) * np.exp(-tt / (0.02 + 0.10 / rt))
    return y * amp

# ============================================================ 1. TURBULENCE LOOP (20 s seamless)
def make_turbulence():
    dur = 20.0
    tt = t_axis(dur)
    base = periodic_filtered_noise(dur, "lowpass", 420, seed=11)
    mid = periodic_filtered_noise(dur, "bandpass", 300, seed=12)
    hiss = periodic_filtered_noise(dur, "bandpass", 1400, seed=13)
    sub = periodic_filtered_noise(dur, "lowpass", 90, seed=14)
    # slow periodic swells (integer cycles over 20 s = loop-safe)
    swell1 = 0.72 + 0.28 * np.sin(2 * np.pi * 3 * tt / dur + 0.7)
    swell2 = 0.80 + 0.20 * np.sin(2 * np.pi * 7 * tt / dur + 2.1)
    swell3 = 0.85 + 0.15 * np.sin(2 * np.pi * 11 * tt / dur)
    mono = (base * 0.9 * swell1 + mid * 0.45 * swell2 + hiss * 0.16 * swell3 + sub * 0.8 * swell1)
    # foam churn: slowly wandering bandpassed bursts, loop-safe via periodic source
    churn = periodic_filtered_noise(dur, "bandpass", 750, seed=15)
    gate = 0.5 + 0.5 * np.sin(2 * np.pi * 5 * tt / dur + 1.3)
    mono += churn * 0.22 * gate**2
    save("kraken_water_turbulence_loop.wav", stereo(mono, 0.45, seed=21, loop=True))

# ============================================================ 2. EMERGE SPLASH (~2.5 s)
def make_emerge():
    dur = 2.5
    tt = t_axis(dur)
    buf = np.zeros(int(SR * dur))
    # rising rush (0 -> 0.55 s): swept bandpass noise crescendo
    n1 = int(SR * 0.6)
    noise = rng.standard_normal(n1)
    # time-varying bandpass approximated by chunked filtering
    rush = np.zeros(n1)
    chunk = 2400
    for i in range(0, n1, chunk):
        seg = noise[i : i + chunk + 512]
        f = 250 + 1600 * (i / n1) ** 1.5
        segf = filt(seg, "bandpass", [max(60, f * 0.55), min(9000, f * 1.8)])
        rush[i : i + chunk] += segf[:chunk] * np.hanning(min(chunk, len(segf)))[:chunk] if False else segf[:chunk]
    rush *= np.linspace(0, 1, n1) ** 2
    add_at(buf, rush * 0.7, 0.0)
    # deep displacement boom as the mass breaks the surface
    s, _ = chirp(140, 45, 0.7)
    add_at(buf, s * env_exp(0.7, 0.22) * 0.8, 0.42)
    # main splash burst at 0.5 s
    n2 = int(SR * 1.1)
    spl = rng.standard_normal(n2)
    spl = filt(spl, "lowpass", 5200) * 0.8 + filt(spl, "highpass", 2500) * 0.5
    spl *= np.exp(-t_axis(1.1) / 0.30) * (1 - np.exp(-t_axis(1.1) / 0.012))
    add_at(buf, spl * 0.9, 0.5)
    # secondary falling-water wash
    n3 = int(SR * 1.5)
    wash = filt(rng.standard_normal(n3), "bandpass", [300, 2600])
    wash *= np.exp(-t_axis(1.5) / 0.5) * (1 - np.exp(-t_axis(1.5) / 0.05))
    add_at(buf, wash * 0.4, 0.62)
    # droplet patter tail
    add_at(buf, droplets(1.7, 90, 900, 3400, seed=31) * 0.5, 0.75)
    save("kraken_emerge_splash.wav", stereo(buf, 0.4, seed=32))

# ============================================================ 3. SWING WHOOSH (~1.2 s)
def make_whoosh():
    dur = 1.2
    n = int(SR * dur)
    tt = t_axis(dur)
    noise = rng.standard_normal(n + 8192)
    out = np.zeros(n)
    chunk = 1200
    for i in range(0, n, chunk):
        u = i / n
        # heavy sweep: 140 -> 620 -> 180 Hz, bell amplitude
        f = 140 + 480 * np.sin(np.pi * u) ** 1.4
        seg = noise[i : i + chunk + 2048]
        segf = filt(seg, "bandpass", [max(50, f * 0.5), f * 2.0])
        out[i : i + chunk] += segf[:chunk]
    amp = np.sin(np.pi * tt / dur) ** 1.6
    out *= amp
    # sub body sweep underneath
    s, _ = chirp(70, 160, dur, curve="lin")
    s *= np.sin(np.pi * tt / dur) ** 2
    # drips flying off during the swing
    fly = droplets(dur, 16, 1200, 3000, seed=41, decay_rate=False) * 0.25
    save("kraken_swing_whoosh.wav", stereo(out * 0.85 + s * 0.35 + fly, 0.35, seed=42))

# ============================================================ 4. SLAM IMPACT (~1.8 s)
def make_slam():
    dur = 1.8
    buf = np.zeros(int(SR * dur))
    # sub thud: sine 90 -> 30 Hz
    s, _ = chirp(90, 30, 1.1)
    add_at(buf, s * env_exp(1.1, 0.30) * 1.0, 0.0)
    # secondary body mass thump
    s2, _ = chirp(55, 28, 0.9)
    add_at(buf, s2 * env_exp(0.9, 0.22) * 0.6, 0.01)
    # wet flesh slap: lowpassed noise burst
    n1 = int(SR * 0.35)
    slap = filt(rng.standard_normal(n1), "lowpass", 900)
    slap *= np.exp(-t_axis(0.35) / 0.06) * (1 - np.exp(-t_axis(0.35) / 0.004))
    add_at(buf, slap * 1.1, 0.0)
    # skin/fat jiggle immediately after slap: few decaying low wobbles
    for dt_, f0 in [(0.03, 95), (0.09, 70), (0.16, 52)]:
        sj, _ = chirp(f0, f0 * 0.7, 0.25)
        add_at(buf, sj * env_exp(0.25, 0.07) * 0.35, dt_)
    # spray splash
    n2 = int(SR * 0.9)
    spray = filt(rng.standard_normal(n2), "highpass", 1800) + filt(rng.standard_normal(n2), "bandpass", [400, 2400]) * 0.7
    spray *= np.exp(-t_axis(0.9) / 0.22) * (1 - np.exp(-t_axis(0.9) / 0.008))
    add_at(buf, spray * 0.55, 0.02)
    # debris trickle: sparse grains + grit clicks 0.25 -> 1.2 s
    r = np.random.default_rng(51)
    for _ in range(46):
        ts = 0.25 + (r.random() ** 1.6) * 0.95
        g_dur = r.uniform(0.008, 0.03)
        g = rng.standard_normal(int(SR * g_dur))
        g = filt(g, "bandpass", [r.uniform(600, 4000), r.uniform(4500, 9000)])
        g *= np.hanning(len(g)) * r.uniform(0.1, 0.5) * (1 - (ts - 0.25) / 1.2)
        add_at(buf, g, ts)
    # FLESH REVERB TAIL (~0.8 s from 0.55 s): AM wobbling filtered noise, wobble rate decays 13 -> 4 Hz
    n3 = int(SR * 1.15)
    tt3 = t_axis(1.15)
    wob_phase = 2 * np.pi * np.cumsum(13 * (4 / 13) ** (tt3 / 1.15)) / SR
    tail = filt(rng.standard_normal(n3), "bandpass", [180, 750])
    tail *= (0.55 + 0.45 * np.sin(wob_phase)) * np.exp(-tt3 / 0.34)
    add_at(buf, tail * 0.5, 0.55)
    # droplets settling after the spray
    add_at(buf, droplets(1.0, 34, 800, 2800, seed=52) * 0.3, 0.7)
    save("kraken_slam_impact.wav", stereo(buf, 0.4, seed=53))

# ============================================================ 5. SUCKER SQUELCH (~0.8 s)
def make_squelch():
    dur = 0.8
    buf = np.zeros(int(SR * dur))
    r = np.random.default_rng(61)
    n_pops = 8
    for i in range(n_pops):
        ts = 0.04 + i * 0.088 + r.uniform(-0.015, 0.015)
        f0 = r.uniform(500, 950)
        s, _ = chirp(f0, f0 * r.uniform(0.22, 0.35), 0.055)
        s *= env_exp(0.055, 0.016) * r.uniform(0.6, 1.0)
        add_at(buf, s, ts)
        # suction hiss with each pop
        nh = int(SR * 0.07)
        h = filt(rng.standard_normal(nh), "bandpass", [900, 3600])
        h *= np.hanning(nh) * 0.35
        add_at(buf, h, ts + 0.01)
    # underlying wet stretch bed
    bed = filt(rng.standard_normal(int(SR * dur)), "bandpass", [250, 900])
    bed *= (0.4 + 0.6 * np.abs(np.sin(np.pi * t_axis(dur) / dur * 4))) * 0.25
    buf += bed
    save("kraken_sucker_squelch.wav", stereo(buf, 0.25, seed=62))

# ============================================================ 6. COIL CREAK (~2 s)
def make_coil():
    dur = 2.0
    buf = np.zeros(int(SR * dur))
    r = np.random.default_rng(71)
    # straining stretch tones: pitch-bent grains with rough vibrato
    events = [(0.05, 0.55, 130, 185), (0.45, 0.7, 95, 150), (0.95, 0.6, 160, 110),
              (1.35, 0.55, 80, 128), (0.7, 0.4, 210, 165), (1.6, 0.35, 118, 90)]
    for ts, gd, f0, f1 in events:
        n = int(SR * gd)
        tt = np.arange(n) / SR
        f = f0 * (f1 / f0) ** (tt / gd)
        ph = 2 * np.pi * np.cumsum(f * (1 + 0.03 * np.sin(2 * np.pi * 27 * tt))) / SR
        g = np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.15 * np.sin(3.02 * ph)
        g *= np.hanning(n) ** 1.5 * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 9 * tt)))
        add_at(buf, g * 0.4, ts)
        # wet surface noise riding the same grain
        gn = filt(rng.standard_normal(n), "bandpass", [500, 2400])
        gn *= np.hanning(n) * 0.18
        add_at(buf, gn, ts)
    # slow rubbery groan bed underneath
    bed_s, _ = chirp(58, 44, dur)
    buf += bed_s * 0.22 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.9 * t_axis(dur)))
    # sparse micro-pops as suckers shift under load
    add_at(buf, droplets(dur, 10, 350, 700, seed=72) * 0.35, 0.1)
    save("kraken_coil_creak.wav", stereo(buf, 0.3, seed=73))

# ============================================================ 7. UNDERWATER RUMBLE LOOP (6 s)
def make_rumble():
    dur = 6.0
    tt = t_axis(dur)
    sub_noise = periodic_filtered_noise(dur, "lowpass", 65, seed=81)
    tone1 = np.sin(2 * np.pi * 38 * tt)
    tone2 = np.sin(2 * np.pi * 57 * tt + 1.2)
    am = 0.7 + 0.3 * np.sin(2 * np.pi * 2 * tt / dur)          # 2 cycles / loop
    am2 = 0.85 + 0.15 * np.sin(2 * np.pi * 5 * tt / dur + 0.5)  # 5 cycles / loop
    mono = (sub_noise * 0.75 * am + tone1 * 0.4 * am + tone2 * 0.18 * am2)
    # faint distant movement swishes, periodic placement
    swish = periodic_filtered_noise(dur, "bandpass", 240, seed=82)
    mono += swish * 0.12 * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * tt / dur))
    save("kraken_underwater_rumble_loop.wav", stereo(mono, 0.3, seed=83, loop=True))

# ============================================================ 8. DRIPS (~3 s)
def make_drips():
    dur = 3.0
    buf = np.zeros(int(SR * dur))
    r = np.random.default_rng(91)
    # plinks with decaying rate & volume: schedule with growing gaps
    ts, gap = 0.05, 0.07
    i = 0
    while ts < dur - 0.15:
        amp = np.exp(-ts / 1.4)
        f0 = r.uniform(900, 2600) * (1 - 0.25 * ts / dur)
        s, _ = chirp(f0, f0 * 0.5, 0.09)
        s *= env_exp(0.09, 0.022) * amp * r.uniform(0.6, 1.0)
        add_at(buf, s, ts)
        # tiny splash tick under some plinks
        if r.random() < 0.6:
            nh = int(SR * 0.03)
            h = filt(rng.standard_normal(nh), "bandpass", [1500, 5000]) * np.hanning(nh)
            add_at(buf, h * 0.2 * amp, ts + 0.005)
        gap *= r.uniform(1.12, 1.3)
        ts += gap
        i += 1
    # faint water bed so the tail isn't dead air
    bed = filt(rng.standard_normal(int(SR * dur)), "lowpass", 500)
    buf += bed * 0.05 * np.exp(-t_axis(dur) / 1.2)
    save("kraken_drips.wav", stereo(buf, 0.35, seed=92))

# ============================================================ 9. TROLL ROAR (~2 s)
def make_roar():
    dur = 2.0
    n = int(SR * dur)
    tt = t_axis(dur)
    # pitch contour: 92 Hz attack, swell to 118, snarl falloff to 58
    f = np.piecewise(tt, [tt < 0.25, (tt >= 0.25) & (tt < 1.3), tt >= 1.3],
                     [lambda x: 92 + 26 * (x / 0.25),
                      lambda x: 118 - 8 * (x - 0.25),
                      lambda x: 110 - 52 * ((x - 1.3) / 0.7) ** 1.4])
    ph = 2 * np.pi * np.cumsum(f) / SR
    def saw(ph):
        return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    voice = np.zeros(n)
    for det, g in [(1.0, 1.0), (1.007, 0.7), (0.5, 0.55), (1.5, 0.3), (2.01, 0.22), (0.994, 0.6)]:
        voice += g * saw(ph * det)
    voice += 0.8 * np.sign(np.sin(ph)) * (0.5 + 0.5 * np.sin(ph))  # square-ish body
    # growl: rough AM at ~26 Hz (vocal-fold rattle), depth swells mid-roar
    growl_depth = 0.35 + 0.45 * np.sin(np.pi * np.clip(tt / 1.5, 0, 1))
    voice *= (1 - growl_depth) + growl_depth * np.abs(np.sin(2 * np.pi * 13 * tt + 0.3 * np.sin(ph)))
    # subharmonic rattle
    voice += 0.5 * np.sin(ph / 2) * np.abs(np.sin(2 * np.pi * 13 * tt))
    # waveshape distortion
    voice = np.tanh(voice * 1.6)
    # chest resonance bandpass + low body
    voice = filt(voice, "bandpass", [180, 2400]) * 0.9 + filt(voice, "lowpass", 300) * 0.8
    # breath noise
    breath = filt(rng.standard_normal(n), "bandpass", [500, 3000])
    breath *= 0.30
    # envelope: fast attack, chesty sustain, snarl falloff
    env = (1 - np.exp(-tt / 0.06)) * np.where(tt < 1.25, 1.0, np.exp(-(tt - 1.25) / 0.28))
    y = (voice * 0.85 + breath * (0.4 + 0.6 * np.sin(np.pi * np.clip(tt / dur, 0, 1)))) * env
    # spit/snarl ticks near the end
    add_at(y, droplets(0.5, 6, 300, 600, seed=95) * 0.2, 1.45)
    save("troll_roar.wav", stereo(y, 0.2, seed=96))

# ============================================================ 10. TROLL SLAM THUD (~1 s)
def make_troll_slam():
    dur = 1.0
    buf = np.zeros(int(SR * dur))
    s, _ = chirp(120, 34, 0.6)
    add_at(buf, s * env_exp(0.6, 0.13) * 1.0, 0.0)
    # stone crack transient: tight broadband click cluster
    r = np.random.default_rng(101)
    for _ in range(9):
        ts = r.uniform(0, 0.018)
        cd = r.uniform(0.004, 0.014)
        c = rng.standard_normal(int(SR * cd))
        c = filt(c, "highpass", 2200) * np.exp(-t_axis(cd) / 0.003) * r.uniform(0.4, 1.0)
        add_at(buf, c, ts)
    crack2 = filt(rng.standard_normal(int(SR * 0.09)), "bandpass", [800, 4500])
    add_at(buf, crack2 * np.exp(-t_axis(0.09) / 0.025) * 0.5, 0.004)
    # earth body
    n1 = int(SR * 0.3)
    earth = filt(rng.standard_normal(n1), "lowpass", 380)
    add_at(buf, earth * np.exp(-t_axis(0.3) / 0.08) * 0.8, 0.0)
    # short chain-rattle tail
    for _ in range(10):
        ts = 0.10 + (r.random() ** 1.4) * 0.55
        p = metallic_ping(r.uniform(2400, 5200), dur=r.uniform(0.05, 0.11))
        add_at(buf, p * r.uniform(0.08, 0.3) * np.exp(-(ts - 0.1) / 0.3), ts)
    # dust/earth settle grains
    for _ in range(16):
        ts = 0.08 + r.random() * 0.5
        g = filt(rng.standard_normal(int(SR * 0.02)), "bandpass", [400, 2000]) * np.hanning(int(SR * 0.02))
        add_at(buf, g * 0.15, ts)
    save("troll_slam_thud.wav", stereo(buf, 0.25, seed=102))

# ============================================================ 11. TROLL CHAIN RATTLE (~1.2 s)
def make_chain():
    dur = 1.2
    buf = np.zeros(int(SR * dur))
    r = np.random.default_rng(111)
    # drag scrape bed: rough lowpassed noise, swelling then settling
    scrape = filt(rng.standard_normal(int(SR * dur)), "lowpass", 700)
    scrape *= (np.sin(np.pi * np.clip(t_axis(dur) / dur, 0, 1)) ** 1.2) * 0.30
    scrape *= (0.7 + 0.3 * np.abs(np.sin(2 * np.pi * 17 * t_axis(dur))))  # link-by-link roughness
    buf += scrape
    # link pings: burst at start (lift), clatter through drag, sparse settle
    times = []
    times += list(r.uniform(0.0, 0.10, 12))
    times += list(r.uniform(0.10, 0.75, 22))
    times += list(r.uniform(0.75, 1.12, 6))
    for ts in times:
        amp = np.exp(-ts / 0.55) * r.uniform(0.25, 1.0)
        p = metallic_ping(r.uniform(1800, 6500), dur=r.uniform(0.05, 0.16), amp=amp)
        add_at(buf, p * 0.5, ts)
        if r.random() < 0.4:  # double-bounce link
            p2 = metallic_ping(r.uniform(2000, 6000), dur=0.06, amp=amp * 0.5)
            add_at(buf, p2 * 0.5, ts + r.uniform(0.02, 0.05))
    save("troll_chain_rattle.wav", stereo(buf, 0.3, seed=112))

# ============================================================ 12. TROLL STOMP (~0.7 s)
def make_stomp():
    dur = 0.7
    buf = np.zeros(int(SR * dur))
    s, _ = chirp(105, 36, 0.45)
    add_at(buf, s * env_exp(0.45, 0.10) * 1.0, 0.0)
    n1 = int(SR * 0.22)
    earth = filt(rng.standard_normal(n1), "lowpass", 500)
    add_at(buf, earth * np.exp(-t_axis(0.22) / 0.05) * (1 - np.exp(-t_axis(0.22) / 0.003)) * 0.8, 0.0)
    # wet ground squelch: bandpassed noise gliding down in pitch (chunked sweep)
    n2 = int(SR * 0.30)
    raw = rng.standard_normal(n2 + 4096)
    sq = np.zeros(n2)
    chunk = 1024
    for i in range(0, n2, chunk):
        u = i / n2
        f = 1500 * (500 / 1500) ** u
        segf = filt(raw[i : i + chunk + 2048], "bandpass", [max(80, f * 0.55), f * 1.9])
        m = min(chunk, n2 - i)
        sq[i : i + m] += segf[:m]
    sq *= np.exp(-t_axis(0.30) / 0.09) * (1 - np.exp(-t_axis(0.30) / 0.01))
    add_at(buf, sq * 0.55, 0.015)
    # mud release pops + a couple of drips flicked off the foot
    add_at(buf, droplets(0.3, 5, 300, 650, seed=121) * 0.3, 0.06)
    add_at(buf, droplets(0.4, 6, 1100, 2400, seed=122) * 0.2, 0.18)
    # faint chain tick as the shackle settles
    p = metallic_ping(3400, dur=0.08, amp=0.25)
    add_at(buf, p, 0.22)
    p = metallic_ping(2700, dur=0.07, amp=0.18)
    add_at(buf, p, 0.29)
    save("troll_stomp.wav", stereo(buf, 0.3, seed=123))

if __name__ == "__main__":
    make_turbulence()
    make_emerge()
    make_whoosh()
    make_slam()
    make_squelch()
    make_coil()
    make_rumble()
    make_drips()
    make_roar()
    make_troll_slam()
    make_chain()
    make_stomp()
    print("ALL DONE")
