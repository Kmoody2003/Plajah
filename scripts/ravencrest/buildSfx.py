"""Ravencrest sound bank: CC0 recordings → trimmed, loudness-matched MP3s + a manifest.

Sources (all CC0 / public domain, no attribution required; recorded in CREDITS.md anyway):
  fs:<id>        a Freesound sound (CC0 filter), its HQ preview MP3
  pk:<pack>/<f>  a file from a downloaded CC0 pack (Kenney Impact / RPG Audio, OpenGameArt
                 rubberduck "80 CC0 creature SFX" and "75 CC0 breaking/falling/hit")
  @start         optional start time (s) inside a long recording; otherwise the loudest moment

One-shots are mono (the game pans them), trimmed to their active part, levelled to a common
RMS and peak-limited. Loops are stereo, cut from the middle of the recording and crossfaded
end-into-start so they repeat without a seam.

  python -I scripts/ravencrest/buildSfx.py <packs dir> [--only name,name]
Output: public/games/ravencrest/audio/sfx/<bank>_<n>.mp3 + sfx.json
"""
import json, os, re, subprocess, sys, time, urllib.request
import numpy as np

FF = r'D:\ComfyUI_windows_portable\ComfyUI_windows_portable\python_embeded\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win64-v4.2.2.exe'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'games', 'ravencrest', 'audio', 'sfx')
SR = 44100
UA = {'User-Agent': 'Mozilla/5.0'}

# name: (kind, max seconds, target RMS dBFS, [sources])
BANK = {
    # ── weather ──
    'thunder_near': ('shot', 9, -17, ['fs:242048', 'fs:74892', 'fs:646912', 'fs:434359', 'fs:399656', 'fs:446753']),
    'thunder_far': ('shot', 12, -22, ['fs:347562', 'fs:267550', 'fs:267551', 'fs:244053']),
    'rain_loop': ('loop', 24, -24, ['fs:507902']),
    'wind_loop': ('loop', 28, -24, ['fs:159509']),
    'night_loop': ('loop', 28, -28, ['fs:175020']),
    # ── wildlife ──
    'owl': ('shot', 4, -22, ['fs:465697', 'fs:398734', 'fs:69508']),
    'raven': ('shot', 3, -21, ['fs:66763', 'fs:512781', 'fs:348192', 'fs:67356']),
    'wolf_howl': ('shot', 8, -21, ['fs:398430', 'fs:378334', 'fs:500646']),
    'bats': ('shot', 5, -22, ['fs:546823', 'fs:437935']),
    # ── monsters ──
    'zombie': ('shot', 3, -18, ['fs:193759', 'fs:463721', 'fs:213509', 'fs:58626', 'pk:80-CC0-creature-SFX_0/grunt_02.ogg']),
    'zombie_hurt': ('shot', 1.5, -18, ['fs:555420', 'pk:80-CC0-creature-SFX_0/hurt_01.ogg', 'pk:80-CC0-creature-SFX_0/hurt_03.ogg']),
    'growl': ('shot', 4, -18, ['fs:481642', 'fs:444444', 'fs:170454', 'pk:80-CC0-creature-SFX_0/monster_02.ogg', 'pk:80-CC0-creature-SFX_0/monster_05.ogg']),
    'roar': ('shot', 4, -16, ['fs:398908', 'fs:489901', 'fs:476083', 'pk:80-CC0-creature-SFX_0/roar_01.ogg', 'pk:80-CC0-creature-SFX_0/roar_02.ogg']),
    'troll': ('shot', 4, -16, ['pk:80-CC0-creature-SFX_0/troll_01.ogg', 'pk:80-CC0-creature-SFX_0/troll_02.ogg', 'pk:80-CC0-creature-SFX_0/troll_03.ogg', 'fs:85568', 'fs:145729']),
    'werewolf': ('shot', 4, -17, ['fs:242057', 'fs:257631', 'fs:242195']),
    'hiss': ('shot', 3, -19, ['fs:673425', 'fs:269111', 'fs:760827']),
    'ghost': ('shot', 5, -20, ['fs:643741', 'fs:495687', 'fs:204966', 'fs:175944']),
    'ghost_scream': ('shot', 3, -18, ['fs:352508']),
    'cackle': ('shot', 4, -18, ['fs:223851', 'fs:417826', 'fs:371284']),
    'evil_laugh': ('shot', 5, -18, ['fs:169826', 'fs:478934', 'fs:646307']),
    'giant_step': ('shot', 1.6, -16, ['fs:721601', 'fs:531725', 'fs:813056']),
    # ── the fight ──
    'swing': ('shot', 0.8, -19, ['fs:268227', 'fs:268226', 'fs:367182', 'fs:547041']),
    'slash': ('shot', 0.9, -16, ['fs:420674', 'fs:442903', 'fs:370204', 'fs:323526', 'fs:504615']),
    'stab': ('shot', 1.0, -16, ['fs:176550', 'fs:323525']),
    'clash': ('shot', 1.4, -17, ['fs:275159', 'fs:334169', 'fs:326868', 'fs:364530']),
    'punch': ('shot', 0.7, -16, ['fs:104183', 'fs:118513', 'fs:390462', 'pk:kenney_impact-sounds/Audio/impactPunch_heavy_000.ogg', 'pk:kenney_impact-sounds/Audio/impactPunch_heavy_002.ogg']),
    'bone': ('shot', 1.2, -17, ['fs:134025', 'fs:144159', 'fs:87570']),
    'gore': ('shot', 1.4, -17, ['fs:414296', 'fs:55234', 'fs:269482', 'fs:641046']),
    'body_fall': ('shot', 1.4, -17, ['fs:417994', 'fs:504626', 'fs:187136']),
    'hurt_grunt': ('shot', 1.0, -18, ['pk:80-CC0-creature-SFX_0/grunt_01.ogg', 'pk:80-CC0-creature-SFX_0/grunt_04.ogg', 'pk:80-CC0-creature-SFX_0/hurt_05.ogg']),
    # ── world / magic ──
    'glass_break': ('shot', 2, -17, ['fs:212698', 'fs:233605', 'fs:371094', 'pk:sfx_breaking_and_falling/bfh1_glass_breaking_02.ogg']),
    'fire_whoosh': ('shot', 3, -18, ['fs:260554', 'fs:260555', 'fs:244926']),
    'explosion': ('shot', 4, -15, ['fs:235968']),
    'splash_big': ('shot', 2.5, -17, ['fs:442773', 'fs:9508']),
    'splash': ('shot', 1.4, -19, ['fs:398032']),
    'wood_break': ('shot', 1.6, -16, ['fs:443293', 'fs:66780', 'fs:66772', 'pk:sfx_breaking_and_falling/bfh1_wood_breaking_01.ogg', 'pk:sfx_breaking_and_falling/bfh1_wood_breaking_03.ogg']),
    'rock_break': ('shot', 3, -16, ['fs:262118', 'fs:512243', 'pk:sfx_breaking_and_falling/bfh1_rock_breaking_01.ogg', 'pk:sfx_breaking_and_falling/bfh1_rock_breaking_02.ogg', 'pk:sfx_breaking_and_falling/bfh1_rock_falling_03.ogg']),
    'gunshot': ('shot', 1.2, -16, ['fs:163460', 'fs:165390', 'fs:52357']),
    'zap': ('shot', 1.5, -18, ['fs:136542', 'fs:160421', 'fs:512471', 'fs:556717']),
    'bell': ('shot', 10, -18, ['fs:62964', 'fs:76405']),
    'door_creak': ('shot', 3, -19, ['fs:219499', 'fs:219492', 'pk:kenney_rpg-audio/Audio/creak1.ogg']),
    'chains': ('shot', 4, -21, ['fs:387240', 'fs:162156']),
    'heartbeat': ('shot', 1.0, -17, ['fs:22440']),
    'sting': ('shot', 6, -18, ['fs:846789', 'fs:320163', 'fs:513332']),
    'riser': ('shot', 4, -19, ['fs:683667']),
    # ── footsteps ──
    'step_stone': ('shot', 0.45, -22, [f'pk:kenney_impact-sounds/Audio/footstep_concrete_00{i}.ogg' for i in range(5)]),
    'step_grass': ('shot', 0.45, -22, [f'pk:kenney_impact-sounds/Audio/footstep_grass_00{i}.ogg' for i in range(5)]),
    'step_wood': ('shot', 0.45, -22, [f'pk:kenney_impact-sounds/Audio/footstep_wood_00{i}.ogg' for i in range(5)]),
    # ── title screen ──
    'ui_hover': ('shot', 0.6, -24, ['fs:220205', 'fs:237422']),
    'ui_select': ('shot', 1.5, -20, ['fs:703885', 'fs:200469']),
}

CACHE = ''   # <packs dir>/../freesound (set in main)


def fs_url(sid):
    """The HQ preview URL for a Freesound sound: read it off the sound's page."""
    page = urllib.request.urlopen(urllib.request.Request(f'https://freesound.org/s/{sid}/', headers=UA), timeout=30).read().decode('utf8', 'ignore')
    m = re.search(r'https://cdn\.freesound\.org/previews/\d+/' + sid + r'_\d+-hq\.mp3', page)
    if not m:
        m = re.search(r'https://cdn\.freesound\.org/previews/\d+/' + sid + r'_\d+-lq\.mp3', page)
        return m.group(0).replace('-lq', '-hq') if m else None
    return m.group(0)


def fetch(src, packs):
    if src.startswith('pk:'):
        return os.path.join(packs, src[3:])
    sid = src[3:]
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f'{sid}.mp3')
    if not os.path.exists(p):
        for i in range(5):
            try:
                url = fs_url(sid)
                if not url: raise RuntimeError('no preview')
                data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
                open(p, 'wb').write(data); time.sleep(1.5); break
            except Exception as e:
                print('  retry', sid, e); time.sleep(10 * (i + 1))
        else:
            return None
    return p


def decode(path, ch):
    raw = subprocess.run([FF, '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def env(x, win=0.02):
    n = max(1, int(SR * win))
    m = np.abs(x).max(axis=1)
    k = np.ones(n) / n
    return np.convolve(m, k, 'same')


def shot(x, maxlen, start=None):
    e = env(x)
    peak = e.max() + 1e-9
    if start is None:
        # The event: from just before its loudest moment's attack.
        ip = int(np.argmax(e))
        th = peak * 10 ** (-30 / 20)
        i0 = ip
        while i0 > 0 and e[i0] > th and ip - i0 < SR * 1.5: i0 -= 1
        i0 = max(0, i0 - int(SR * 0.01))
    else:
        i0 = int(start * SR)
    y = x[i0:i0 + int(maxlen * SR)]
    ey = env(y)
    # Trim the tail once it's 45 dB under the peak.
    above = np.where(ey > ey.max() * 10 ** (-45 / 20))[0]
    if len(above): y = y[:min(len(y), above[-1] + int(SR * 0.05))]
    f = min(len(y), int(SR * 0.25))
    y[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
    a = min(len(y), int(SR * 0.004))
    y[:a] *= np.linspace(0, 1, a)[:, None]
    return y


def loop(x, length, xf=2.0):
    n = int(length * SR); f = int(xf * SR)
    mid = max(0, (len(x) - n - f) // 2)
    y = x[mid:mid + n + f].copy()
    if len(y) < n + f: n = len(y) - f
    t = np.linspace(0, np.pi / 2, f)[:, None]
    head = y[:f] * np.sin(t) + y[n:n + f] * np.cos(t)   # the tail fades into the head
    return np.concatenate([head, y[f:n]])


def level(y, rms_db, active=True):
    e = env(y)
    sel = e > e.max() * 0.1 if active else slice(None)
    rms = np.sqrt(np.mean(y[sel] ** 2)) + 1e-9
    g = 10 ** (rms_db / 20) / rms
    g = min(g, 10 ** (-1 / 20) / (np.abs(y).max() + 1e-9))
    return y * g


def encode(y, path, ch):
    br = '64k' if ch == 1 else '112k'
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-i', '-', '-c:a', 'libmp3lame', '-b:a', br, path], input=y.astype(np.float32).tobytes(), check=True)


def main():
    global CACHE
    packs = sys.argv[1]
    CACHE = os.path.join(os.path.dirname(os.path.abspath(packs)), 'freesound')
    only = None
    if '--only' in sys.argv: only = set(sys.argv[sys.argv.index('--only') + 1].split(','))
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, 'sfx.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    credits = {}
    for name, (kind, maxlen, rms, srcs) in BANK.items():
        if only and name not in only: continue
        files = []
        for f in os.listdir(OUT):
            if re.fullmatch(re.escape(name) + r'_\d+\.mp3', f): os.remove(os.path.join(OUT, f))
        for src in srcs:
            s, _, st = src.partition('@')
            p = fetch(s, packs)
            if not p: print('  missing', src); continue
            ch = 2 if kind == 'loop' else 1
            x = decode(p, ch)
            if len(x) < SR * 0.05: print('  empty', src); continue
            y = loop(x, maxlen) if kind == 'loop' else shot(x, maxlen, float(st) if st else None)
            y = level(y, rms, active=kind != 'loop')
            fn = f'{name}_{len(files)}.mp3'
            encode(y, os.path.join(OUT, fn), ch)
            files.append(fn)
            credits[fn] = s
        manifest[name] = {'kind': kind, 'files': files}
        print(f'{name:14} {len(files)} files')
    json.dump(manifest, open(mpath, 'w'), indent=1)
    cpath = os.path.join(OUT, 'CREDITS.md')
    old = {}
    if os.path.exists(cpath):
        for ln in open(cpath, encoding='utf8'):
            m = re.match(r'- `([^`]+)` ← (.+)', ln.strip())
            if m: old[m.group(1)] = m.group(2)
    for fn, s in credits.items():
        old[fn] = f'https://freesound.org/s/{s[3:]}/ (CC0)' if s.startswith('fs:') else f'{s[3:]} (CC0 pack)'
    with open(cpath, 'w', encoding='utf8') as f:
        f.write('# Ravencrest sound bank — sources\n\nAll CC0 (public domain). Built by scripts/ravencrest/buildSfx.py.\n'
                'Packs: Kenney "Impact Sounds" + "RPG Audio" (kenney.nl), rubberduck "80 CC0 creature SFX" and\n'
                '"75 CC0 breaking/falling/hit sfx" (opengameart.org).\n\n')
        for fn in sorted(old): f.write(f'- `{fn}` ← {old[fn]}\n')


main()
