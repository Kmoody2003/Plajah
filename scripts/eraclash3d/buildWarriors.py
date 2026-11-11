"""Build Era Clash's 3D warriors locally from their painted sprites (the same engine Plajah 3D's Build uses).

  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/eraclash3d/buildWarriors.py [id ...]

Per warrior: the sprite (already cut out, facing right) is padded square → Hunyuan3D-2mini shape on the Tela 3D
runtime (one job at a time, waits for the GPU to be idle and at or under 83 °C), up to 3 seeds keeping the most
one-piece result (Plajah 3D's rule: a clean single body beats a hazy one) → largest piece kept → painted from the
sprite and a synthesised back (mirrored, head blurred) with engines/tela-3d/paint_from_views.py → rigged onto the
Ravencrest contract skeleton with its baked clips (scripts/ravencrest/autoRig.py) → pose sheet for review.

Outputs: games/era-clash-3d/assets-src/<id>/…, public/games/era-clash/3d/assets/characters/<id>.glb,
games/era-clash-3d/review/pose_<id>.jpg.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ravencrest'))
import buildCast as bc  # noqa: E402  (shared helpers: health, keep_main_body, synth_back, run)

ROOT = bc.ROOT
SPRITES = os.path.join(ROOT, 'public', 'games', 'era-clash', 'assets')
SRC = os.path.join(ROOT, 'games', 'era-clash-3d', 'assets-src')
OUT = os.path.join(ROOT, 'public', 'games', 'era-clash', '3d', 'assets', 'characters')
REVIEW = os.path.join(ROOT, 'games', 'era-clash-3d', 'review')
MUSE = bc.MUSE

# id: (sprite id, rig, face budget)
WARRIORS = {
    'samurai': ('samurai', 'vampire', 36000),   # Haru; also the rōnin and hired blades
    'monk':    ('monk', 'vampire', 34000),      # Chen; also the sōhei
    'knight':  ('knight', 'vampire', 38000),    # Roland; also the Southern Captain
    'viking':  ('viking', 'vampire', 38000),    # the wakō raiders
    'gladiator': ('gladiator', 'vampire', 36000),
}


def square_front(sprite_png, out_png, size=900):
    """Pad the cut-out sprite onto a transparent square, figure centred with a margin."""
    im = Image.open(sprite_png).convert('RGBA')
    a = np.array(im)
    ys, xs = np.nonzero(a[:, :, 3] > 24)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    k = (size * 0.86) / max(im.width, im.height)
    im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    sq = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sq.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    sq.save(out_png)


def synth_back_hair(front_png, out_png):
    """The back the camera sees most: the mirrored front, with the head filled from the crown's own colour
    (hair, helmet or a bald head) instead of a blurred face, fading into the shoulders."""
    a = np.array(Image.open(front_png).convert('RGBA'))
    ys = np.nonzero(a[:, :, 3] > 40)[0]
    top, bot = ys.min(), ys.max()
    h = bot - top
    b = a[:, ::-1].copy()
    band = b[top:int(top + h * 0.045)]
    m = band[:, :, 3] > 40
    hair = np.median(band[:, :, :3][m], axis=0) if m.any() else np.array([30, 24, 20])
    head_end = int(top + h * 0.155)
    rows = np.arange(b.shape[0])
    w = np.clip((head_end + 10 - rows) / 20.0, 0, 1)[:, None, None]
    rgb = b[:, :, :3].astype(np.float32)
    shade = rgb.mean(axis=2, keepdims=True) / max(1.0, rgb[top:head_end].mean())
    fill = np.clip(hair[None, None, :] * (0.75 + 0.25 * shade), 0, 255)
    b[:, :, :3] = (rgb * (1 - w) + fill * w).astype(np.uint8)
    Image.fromarray(b).save(out_png)


HIRES = '--hires' in sys.argv   # the playable heroes: finer shape, twice the painted faces, softer skinning


def shape_seed(front_png, out_glb, seed):
    for _ in range(360):
        h = bc.health()
        if not h.get('busy') and (h.get('gpuTempC') or 0) <= 83:
            break
        time.sleep(5)
    data = 'data:image/png;base64,' + base64.b64encode(open(front_png, 'rb').read()).decode()
    body = json.dumps({'task': {'image': data, 'backend': 'hunyuan_mini',
                                'options': {'octreeResolution': 384 if HIRES else 256, 'steps': 5, 'faceLimit': 200000 if HIRES else 80000, 'seed': seed}}}).encode()
    req = urllib.request.Request(bc.RUNTIME + '/tela3d/image-to-mesh', body, {'Content-Type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=900))
    if not r.get('success'):
        raise RuntimeError(r.get('error'))
    open(out_glb, 'wb').write(base64.b64decode(r['glbBase64']))
    return r


def one_piece_share(glb):
    import trimesh
    m = trimesh.load(glb, force='mesh')
    m.merge_vertices()
    parts = m.split(only_watertight=False)
    if len(parts) <= 1:
        return 1.0
    return max(p.area for p in parts) / m.area


def build(wid):
    sprite, rig, faces = WARRIORS[wid]
    d = os.path.join(SRC, wid)
    os.makedirs(d, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(REVIEW, exist_ok=True)
    front = os.path.join(d, 'front.png')
    square_front(os.path.join(SPRITES, f'sprite-{sprite}.png'), front)
    back = os.path.join(d, 'back.png')
    synth_back_hair(front, back)
    shp = os.path.join(d, 'shape_hi.glb' if HIRES else 'shape.glb')
    if HIRES:
        faces = int(faces * 2.1)
    if not os.path.exists(shp):
        best = None
        for seed in (7, 21, 42):
            tmp = os.path.join(d, f'shape{"_hi" if HIRES else ""}_s{seed}.glb')
            r = shape_seed(front, tmp, seed)
            share = one_piece_share(tmp)
            print(f'[{wid}] seed {seed}: {r["faces"]} faces, {r["executionTimeMs"]} ms, GPU {r.get("gpuTempC")} C, one piece {share:.0%}', flush=True)
            if not best or share > best[0]:
                best = (share, tmp)
            if share >= 0.92:
                break
            time.sleep(12)
        os.replace(best[1], shp)
    clean = os.path.join(d, 'shape_clean.glb')
    bc.keep_main_body(shp, clean)
    painted = os.path.join(d, 'painted.glb')
    print('  ' + bc.run([os.path.join(ROOT, 'engines', 'tela-3d', 'paint_from_views.py'), '--mesh', clean, '--out', painted,
                         '--faces', str(faces), '--res', '2048', '--view', f'front={front}', '--view', f'back={back}']), flush=True)
    out = os.path.join(OUT, f'{wid}.glb')
    print('  ' + bc.run([os.path.join(ROOT, 'scripts', 'ravencrest', 'autoRig.py'), '--rig', os.path.join(MUSE, f'{rig}.glb'),
                         '--mesh', painted, '--out', out] + (['--falloff', '3', '--smooth', 'auto'] if HIRES else [])), flush=True)
    print('  ' + bc.run([os.path.join(ROOT, 'scripts', 'ravencrest', 'posePreview.py'), out, os.path.join(REVIEW, f'pose_{wid}.jpg'),
                         '--clips', 'idle,walk,attack_1,death']), flush=True)


if __name__ == '__main__':
    for n in [x for x in sys.argv[1:] if not x.startswith('--')] or ['samurai', 'monk', 'knight', 'viking']:
        try:
            build(n)
        except Exception as e:
            print(f'[{n}] FAILED: {e}', flush=True)
