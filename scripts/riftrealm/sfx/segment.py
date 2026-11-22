"""Split each video's soundtrack into separate sound events and describe them (timing, loudness, brightness, shape)."""
import json, numpy as np, soundfile as sf
from scipy.signal import stft
ROOT = 'D:/plajah-tmp/rift-sfx/'
info = json.load(open(ROOT + 'info.json'))
HOP = 0.01
out = {}
for slug, i in info.items():
    x, sr = sf.read(ROOT + 'wav/' + slug + '.wav', always_2d=True)
    m = x.mean(1); h = int(sr * HOP)
    fr = len(m) // h
    env = np.sqrt(np.array([np.mean(m[k * h:(k + 1) * h] ** 2) for k in range(fr)]) + 1e-12)
    db = 20 * np.log10(env)
    sm = np.convolve(db, np.ones(5) / 5, 'same')
    floor = np.percentile(sm, 15); peak = sm.max()
    thr = max(floor + 9, peak - 30)
    on = sm > thr
    # close gaps < 80 ms, drop blips < 40 ms
    ev = []; k = 0
    while k < fr:
        if on[k]:
            s = k
            while k < fr and (on[k] or (k + 8 < fr and on[k:k + 8].any())): k += 1
            if k - s >= 4: ev.append((s, k))
        k += 1
    f, t, Z = stft(m, sr, nperseg=1024, noverlap=1024 - h)
    P = np.abs(Z) ** 2
    events = []
    for s, e in ev:
        a, b = max(0, s - 3), min(fr, e + 12)          # a little pre-roll, tail
        seg = m[a * h:b * h]
        if len(seg) < 256: continue
        ps = P[:, s:e].mean(1)
        cen = float((f * ps).sum() / (ps.sum() + 1e-12))
        low = float(ps[f < 250].sum() / (ps.sum() + 1e-12))
        att = int(np.argmax(sm[s:e]))                  # frames to peak
        crest = float(np.abs(seg).max() / (np.sqrt(np.mean(seg ** 2)) + 1e-9))
        # tonality: share of energy in the top 2 % bins (tonal sounds concentrate)
        srt = np.sort(ps)[::-1]; tonal = float(srt[:max(1, len(srt) // 50)].sum() / (srt.sum() + 1e-12))
        events.append(dict(t0=round(a * HOP, 2), t1=round(b * HOP, 2), dur=round((b - a) * HOP, 2), peak=round(float(sm[s:e].max()), 1),
                           above=round(float(sm[s:e].max() - floor), 1), centroid=int(cen), low=round(low, 2), attack=round(att * HOP, 2), crest=round(crest, 1), tonal=round(tonal, 2)))
    out[slug] = dict(floor=round(float(floor), 1), peak=round(float(peak), 1), events=events, bedShare=round(float(on.mean()), 2))
json.dump(out, open(ROOT + 'events.json', 'w'), indent=1)
tot = sum(len(v['events']) for v in out.values())
print(tot, 'events in', len(out), 'clips')
for s in sorted(out, key=lambda k: -len(out[k]['events']))[:12]: print(len(out[s]['events']), s[:60], 'bed', out[s]['bedShare'])
