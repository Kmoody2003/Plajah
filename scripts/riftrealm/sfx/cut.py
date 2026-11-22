"""Cut the usable events into game-ready clips (mono 48 kHz mp3, faded, trimmed, peak -1 dBFS) sorted by category,
with a frame from the video at each event, and write catalog.json for the review page."""
import json, os, re, subprocess, numpy as np, soundfile as sf, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = 'D:/plajah-tmp/rift-sfx/'; OUT = ROOT + 'clips/'
ev = json.load(open(ROOT + 'events.json')); info = json.load(open(ROOT + 'info.json'))
os.makedirs(OUT, exist_ok=True)

def category(e, slug):
    L = [l for l, p in e['labels'][:4] if p > 0.08]; s = slug.lower(); has = lambda *ks: any(k in L for k in ks)
    if e['speech'] > 0.5: return 'announcer' if 'announcer' in s else None
    if 'reload' in s or 'switching' in s: return 'reload'
    if has('Gunshot, gunfire', 'Machine gun', 'Cap gun', 'Artillery fire'): return 'gunshot'
    if 'footstep' in s or has('Walk, footsteps', 'Run', 'Shuffle'): return 'footsteps'
    if has('Whoosh, swoosh, swish', 'Whip', 'Arrow'): return 'whoosh'
    if has('Clang', 'Sword', 'Ding', 'Chime', 'Tuning fork', 'Clink', 'Jingle, tinkle', 'Bell'): return 'metal'
    if has('Insect', 'Bee, wasp, etc.', 'Fly, housefly', 'Mosquito', 'Buzz'): return 'insect'
    if has('Roar', 'Growling', 'Howl', 'Snort', 'Animal', 'Bellow', 'Hiss', 'Screaming', 'Grunt', 'Gasp', 'Sigh', 'Groan', 'Bird vocalization, bird call, bird song', 'Hoot', 'Croak', 'Frog'):
        return 'creature' if re.search(r'creature|monster|dragon|beast|hydra|rhino|wolf|bat|stag|panther|toad|amphibian|reptile|salamander|deer|sloth|axolotl|turtle|minotaur|gorgon|leviathan', s) else 'vocal'
    if has('Zap', 'Electricity', 'Static', 'Hum', 'Sine wave', 'Sound effect', 'Laser', 'Beep, bleep', 'Synthesizer'): return 'energy'
    if has('Rain', 'Raindrop', 'Rain on surface', 'Water', 'Liquid', 'Stream', 'Wind', 'Wind noise (microphone)', 'Rustling leaves', 'Bird', 'Splash, splatter', 'Drip', 'Pour'): return 'ambience'
    if has('Explosion', 'Bang', 'Burst, pop', 'Boom', 'Thunder', 'Fireworks', 'Firecracker', 'Slam', 'Thump, thud', 'Knock', 'Smash, crash', 'Breaking'):
        return 'impact' if e['dur'] < 0.7 else 'boom'
    if e['music'] > 0.5 or (L and L[0] == 'Music'): return None
    return 'misc'

cat = []
for slug, v in ev.items():
    src = info[slug]['src']
    x, sr = sf.read(ROOT + 'wav/' + slug + '.wav', always_2d=True); m = x.mean(1)
    for k, e in enumerate(v['events']):
        if e['music'] > 0.55: continue
        c = category(e, slug)
        if not c: continue
        a, b = int(e['t0'] * sr), int(e['t1'] * sr)
        seg = m[a:b].copy()
        # trim the tail where it has decayed 40 dB under the peak
        env = np.abs(seg); pk = env.max() + 1e-9
        idx = np.where(env > pk * 0.01)[0]
        if len(idx): seg = seg[:min(len(seg), idx[-1] + int(0.04 * sr))]
        if len(seg) < int(0.05 * sr): continue
        fi, fo = int(0.003 * sr), min(int(0.03 * sr), len(seg) // 3)
        seg[:fi] *= np.linspace(0, 1, fi); seg[-fo:] *= np.linspace(1, 0, fo)
        seg *= 10 ** (-1 / 20) / (np.abs(seg).max() + 1e-9)
        name = f"{c}/{re.sub(r'_[0-9a-f]{8}$', '', slug)[:40]}_{k:02d}"
        os.makedirs(OUT + c, exist_ok=True)
        tmp = ROOT + 'tmp.wav'; sf.write(tmp, seg.astype(np.float32), sr)
        subprocess.run([FF, '-y', '-v', 'error', '-i', tmp, '-ac', '1', '-b:a', '128k', OUT + name + '.mp3'], check=True)
        mid = min((e['t0'] + e['t1']) / 2, info[slug]['dur'] - 0.15)
        subprocess.run([FF, '-y', '-v', 'error', '-ss', f'{mid:.2f}', '-i', src, '-frames:v', '1', '-vf', 'scale=200:-2', OUT + name + '.jpg'])
        cat.append(dict(file=name, cat=c, src=os.path.basename(src), t0=e['t0'], t1=e['t1'], dur=round(len(seg) / sr, 2),
                        labels=[l for l, p in e['labels'][:3]], conf=e['labels'][0][1], music=e['music']))
json.dump(cat, open(OUT + 'catalog.json', 'w'), indent=1)
import collections
print(len(cat), 'clips'); print(collections.Counter(c['cat'] for c in cat).most_common())
