"""Build the Ravencrest cast locally: concept sheet → cut-out views → Hunyuan3D-2mini shape (Tela 3D runtime,
one job at a time on the 4070) → painted from the sheet views (engines/tela-3d/paint_from_views.py) → rigged onto
a Muse contract skeleton with its baked clips (autoRig.py) → pose contact sheet (posePreview.py).

  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/ravencrest/buildCast.py [name ...]

Outputs: games/ravencrest/assets-src/<name>/{front,back,…}.png, shape.glb, painted.glb;
public/games/ravencrest/assets/characters/<name>.glb; games/ravencrest/review/pose_<name>.jpg.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import cv2
import numpy as np
import rembg
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PY = sys.executable
SHEETS = os.path.join(ROOT, 'public', 'models', 'halloween', 'sheets')
RC = os.path.join(ROOT, 'public', 'models', 'halloween', 'ravencrest')
SRC = os.path.join(ROOT, 'games', 'ravencrest', 'assets-src')
OUT = os.path.join(ROOT, 'public', 'games', 'ravencrest', 'assets', 'characters')
MUSE = os.path.join(OUT, 'muse')
REVIEW = os.path.join(ROOT, 'games', 'ravencrest', 'review')
RUNTIME = 'http://127.0.0.1:51124'

# name: (sheet, {view: box}, source rig, faces, upscale[, opts])
#   opts: mirror_back — synthesise the back from the mirrored front (head blurred: no face on the back);
#         flank — the 'front' view is a side profile: its mirror is the far flank;
#         yaw — turn the mesh to face +Z before rigging; static — a prop (no rig), opts['length'] metres long.
CAST = {
    'zombie':     (os.path.join(SHEETS, 'monsters_sheet.jpg'), {'front': (40, 150, 285, 700), 'left': (290, 150, 450, 700)}, 'zombie', 26000, 1, {'mirror_back': True}),
    'werewolf':   (os.path.join(SHEETS, 'monsters_sheet.jpg'), {'front': (470, 115, 790, 700), 'left': (760, 115, 1010, 700)}, 'werewolf', 30000, 1, {'mirror_back': True}),
    'miriam':     (os.path.join(SHEETS, 'miriam_sheet.jpg'), {'front': (60, 50, 430, 750), 'back': (430, 50, 800, 750)}, 'vampire', 36000, 1),
    'melvin':     (os.path.join(SHEETS, 'pumpkin_patch_sheet.jpg'), {'front': (15, 75, 420, 735), 'back': (455, 75, 815, 735)}, 'vampire', 36000, 1),
    'stitch':     (os.path.join(SHEETS, 'stitch_and_robobones_sheet.jpg'), {'front': (30, 105, 400, 730)}, 'zombie', 30000, 1, {'mirror_back': True}),
    'crane':      (os.path.join(SHEETS, 'stitch_and_robobones_sheet.jpg'), {'front': (725, 105, 1060, 730)}, 'vampire', 32000, 1, {'mirror_back': True}),
    # The banshee: floating, translucent in-game (KINDS.ghost.ghostly); humanoid rig for its drift and reach.
    'ghost':      (os.path.join(SHEETS, 'monsters_sheet.jpg'), {'front': (995, 120, 1235, 660), 'left': (1225, 120, 1376, 660)}, 'vampire', 24000, 1, {'mirror_back': True}),
    # Quadruped from its side profile (head to the right → +X; turned to face +Z for the wolf rig).
    'wolf':       (os.path.join(RC, 'monsters_unknown.jpg'), {'front': (1021, 531, 1331, 773)}, 'wolf', 22000, 2, {'flank': True}),
    # The war-rig tank: shape from the side profile (front to the left → -X), painted from all four views.
    'war_rig_tank': (os.path.join(SHEETS, 'tank_sheet.jpg'), {'front': (470, 370, 1112, 702), 'right': (75, 370, 422, 702), 'left': (100, 85, 400, 312)}, None, 40000, 1,
                     {'flank': True, 'static': True, 'length': 6.45, 'yaw': 90}),
    'vampire':    (os.path.join(RC, 'monsters_outbreak.jpg'), {'front': (1808, 249, 2318, 840), 'back': (2150, 860, 2305, 1149)}, 'vampire', 28000, 1),
    'unknown':    (os.path.join(RC, 'monsters_unknown.jpg'), {'front': (2023, 249, 2379, 948), 'back': (2480, 558, 2574, 907), 'right': (2574, 558, 2675, 907)}, 'unknown', 30000, 2),
    # The orbs' halo angel (Muse sheet, 2026-10-23): armored, robed, folded wings, sword in the right hand.
    'halo_angel': (os.path.join(SHEETS, 'halo_angel_sheet.jpg'), {'front': (20, 10, 500, 1275), 'right': (530, 10, 990, 1275), 'back': (985, 10, 1465, 1275)}, 'vampire', 40000, 1),
    'elise':      (os.path.join(RC, 'survivors_jack_elise.jpg'), {'front': (1906, 255, 2012, 621), 'back': (2056, 255, 2164, 621)}, 'vampire', 36000, 3),
}

_sess = None


def cutout(img):
    global _sess
    if _sess is None:
        os.environ.setdefault('U2NET_HOME', r'D:\Plajah Models\u2net')
        _sess = rembg.new_session('u2net', providers=['CPUExecutionProvider'])
    a = np.array(rembg.remove(img, session=_sess).convert('RGBA'))
    m = (a[:, :, 3] > 40).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        keep = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        a[lab != keep, 3] = 0
    return Image.fromarray(a)


def synth_back(front_png, out_png):
    """Back view from the mirrored front, with the head region blurred (hair/hood/mask colour, no face)."""
    a = np.array(Image.open(front_png).convert('RGBA'))
    ys = np.nonzero(a[:, :, 3] > 40)[0]
    top, bot = ys.min(), ys.max()
    head = int(top + (bot - top) * 0.16)
    b = a[:, ::-1].copy()
    rgb = b[:, :, :3].astype(np.float32)
    blur = cv2.GaussianBlur(rgb, (0, 0), 9)
    w = np.clip((head + 6 - np.arange(b.shape[0])) / 12.0, 0, 1)[:, None, None]
    b[:, :, :3] = (rgb * (1 - w) + blur * 0.85 * w).astype(np.uint8)
    Image.fromarray(b).save(out_png)


def health():
    try:
        return json.load(urllib.request.urlopen(RUNTIME + '/health', timeout=5))
    except Exception:
        return {'busy': True, 'gpuTempC': 99}


def shape(front_png, out_glb):
    for _ in range(360):            # wait for an idle runtime and a GPU at or under 83 °C
        h = health()
        if not h.get('busy') and (h.get('gpuTempC') or 0) <= 83:
            break
        time.sleep(5)
    data = 'data:image/png;base64,' + base64.b64encode(open(front_png, 'rb').read()).decode()
    body = json.dumps({'task': {'image': data, 'backend': 'hunyuan_mini',
                                'options': {'octreeResolution': 256, 'steps': 5, 'faceLimit': 80000, 'seed': 7}}}).encode()
    req = urllib.request.Request(RUNTIME + '/tela3d/image-to-mesh', body, {'Content-Type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=900))
    if not r.get('success'):
        raise RuntimeError(r.get('error'))
    open(out_glb, 'wb').write(base64.b64decode(r['glbBase64']))
    print(f"  shape: {r['faces']} faces in {r['executionTimeMs']} ms, GPU {r.get('gpuTempC')} C", flush=True)


def keep_main_body(src, dst):
    """Hunyuan sometimes leaves floaters and a ghost partial body: keep the largest connected piece."""
    import trimesh
    m = trimesh.load(src, force='mesh')
    m.merge_vertices()
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        parts = sorted(parts, key=lambda q: q.area, reverse=True)
        print(f'  cleanup: kept 1 of {len(parts)} pieces ({parts[0].area / m.area:.0%} of the surface)', flush=True)
        m = parts[0]
    m.export(dst)


def run(args):
    p = subprocess.run([PY] + args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if p.returncode:
        raise RuntimeError(p.stderr[-1500:])
    return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ''


def build(name):
    sheet, views, rig, faces, up = CAST[name][:5]
    opts = CAST[name][5] if len(CAST[name]) > 5 else {}
    d = os.path.join(SRC, name)
    os.makedirs(d, exist_ok=True)
    im = Image.open(sheet).convert('RGB')
    paths = {}
    for v, box in views.items():
        c = im.crop(box)
        if up > 1:
            c = c.resize((c.width * up, c.height * up), Image.LANCZOS)
        p = os.path.join(d, f'{v}.png')
        cutout(c).save(p)
        paths[v] = p
    if opts.get('flank'):
        far = os.path.join(d, 'back.png')
        Image.fromarray(np.array(Image.open(paths['front']))[:, ::-1].copy()).save(far)
        paths['back'] = far
    elif opts.get('mirror_back') and 'back' not in paths:
        far = os.path.join(d, 'back.png')
        synth_back(paths['front'], far)
        paths['back'] = far
    print(f'[{name}] views: {", ".join(paths)}', flush=True)
    shp = os.path.join(d, 'shape.glb')
    if not os.path.exists(shp):
        shape(paths['front'], shp)
        time.sleep(20)                # let the GPU breathe between jobs
    clean = os.path.join(d, 'shape_clean.glb')
    keep_main_body(shp, clean)
    painted = os.path.join(d, 'painted.glb')
    vargs = sum([['--view', f'{v}={p}'] for v, p in paths.items()], [])
    print('  ' + run([os.path.join(ROOT, 'engines', 'tela-3d', 'paint_from_views.py'), '--mesh', clean, '--out', painted, '--faces', str(faces), '--res', '2048'] + vargs), flush=True)
    if opts.get('static'):
        import trimesh
        sc = trimesh.load(painted, force='mesh')
        sc.apply_transform(trimesh.transformations.rotation_matrix(np.radians(opts.get('yaw', 0)), [0, 1, 0]))
        sc.apply_scale(opts['length'] / sc.extents[2])
        sc.apply_translation([-sc.bounds[:, 0].mean(), -sc.bounds[0, 1], -sc.bounds[:, 2].mean()])
        vdir = os.path.join(os.path.dirname(OUT), 'vehicles')
        os.makedirs(vdir, exist_ok=True)
        out = os.path.join(vdir, f'{name}.glb')
        sc.export(out)
        print(f'  static prop {sc.extents.round(2)} m -> {out}', flush=True)
        return
    out = os.path.join(OUT, f'{name}.glb')
    yaw = ['--yaw', str(opts['yaw'])] if opts.get('yaw') else []
    print('  ' + run([os.path.join(ROOT, 'scripts', 'ravencrest', 'autoRig.py'), '--rig', os.path.join(MUSE, f'{rig}.glb'), '--mesh', painted, '--out', out] + yaw), flush=True)
    print('  ' + run([os.path.join(ROOT, 'scripts', 'ravencrest', 'posePreview.py'), out, os.path.join(REVIEW, f'pose_{name}.jpg'), '--clips', 'idle,walk,attack_1,death']), flush=True)


def repaint(name):
    """Re-paint and re-rig from the existing shape (new views), no GPU job."""
    build(name)


if __name__ == '__main__':
    names = sys.argv[1:] or list(CAST)
    for n in names:
        try:
            build(n)
        except Exception as e:
            print(f'[{n}] FAILED: {e}', flush=True)
