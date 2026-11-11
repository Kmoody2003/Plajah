"""Build Chapter I's raiders and villagers from the turnaround sheets in the reference pack.

  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/eraclash3d/buildSheetCast.py crop            # cut-outs only (CPU)
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/eraclash3d/buildSheetCast.py [id ...]        # full build

Unlike buildWarriors.py (one painted sprite and a mirrored, synthesised back), the sheets give a real front and a
real back for each figure, so the paint wraps the true back of the body: the chieftain's shield, the raider's
battered round shield, the fisherman's straw mino, the woman's carrying basket.

Per figure: front and back cropped from the sheet → background removed (u2net, largest piece kept) → padded square
at the same scale (the back mirrored to the front's frame so both line up) → Hunyuan3D-2mini shape from the front
(up to 3 seeds, the most one-piece kept) → painted from front + back (engines/tela-3d/paint_from_views.py) →
rigged onto the Ravencrest contract skeleton with its baked clips (scripts/ravencrest/autoRig.py) → pose sheet.

Outputs: games/era-clash-3d/assets-src/<id>/…, public/games/era-clash/3d/assets/characters/<id>.glb,
games/era-clash-3d/review/pose_<id>.jpg.
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ravencrest'))
import buildCast as bc  # noqa: E402
import buildWarriors as bw  # noqa: E402

PACK = os.path.join(bc.ROOT, 'public', 'games', 'era-clash', 'assets', 'Nov 11 - 02_20')
RAIDERS = os.path.join(PACK, 'Character_concept_sheet_for_sea_087f995a.jpg')
VILLAGERS = os.path.join(PACK, 'Feudal_Japanese_villagers_refere…_c26dc221.jpg')

# id: (sheet, {view: (x0, y0, x1, y1)}, rig, face budget)
CAST = {
    'chieftain':  (RAIDERS, {'front': (72, 92, 338, 712), 'back': (488, 100, 708, 712)}, 'vampire', 40000),
    'raider':     (RAIDERS, {'front': (692, 100, 968, 712), 'back': (1112, 100, 1352, 712)}, 'vampire', 38000),
    'fisherman':  (VILLAGERS, {'front': (82, 70, 290, 528), 'back': (494, 62, 676, 498)}, 'vampire', 30000),
    'carpenter':  (VILLAGERS, {'front': (776, 58, 942, 384), 'back': (1156, 58, 1316, 384)}, 'vampire', 30000),
    'peasant':    (VILLAGERS, {'front': (782, 416, 924, 750), 'back': (1166, 416, 1318, 750)}, 'vampire', 30000),
}

SIZE = 900


def cut(sheet, box):
    return bc.cutout(Image.open(sheet).convert('RGB').crop(box))


def square_pair(front, back, out_f, out_b):
    """Pad both views onto squares at one shared scale, feet on the same line, so the paint registers."""
    def bbox(im):
        a = np.array(im)
        ys, xs = np.nonzero(a[:, :, 3] > 24)
        return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    f, b = bbox(front), bbox(back)
    k = (SIZE * 0.86) / max(f.height, b.height, f.width, b.width)
    for im, path in ((f, out_f), (b, out_b)):
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
        sq = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        sq.paste(im, ((SIZE - im.width) // 2, SIZE - int(SIZE * 0.07) - im.height), im)
        sq.save(path)


def crop(cid):
    sheet, views, _, _ = CAST[cid]
    d = os.path.join(bw.SRC, cid)
    os.makedirs(d, exist_ok=True)
    f, b = cut(sheet, views['front']), cut(sheet, views['back'])
    square_pair(f, b, os.path.join(d, 'front.png'), os.path.join(d, 'back.png'))
    return d


def build(cid):
    _, _, rig, faces = CAST[cid]
    d = crop(cid)
    front, back = os.path.join(d, 'front.png'), os.path.join(d, 'back.png')
    shp = os.path.join(d, 'shape.glb')
    if not os.path.exists(shp):
        best = None
        for seed in (7, 21, 42):
            tmp = os.path.join(d, f'shape_s{seed}.glb')
            r = bw.shape_seed(front, tmp, seed)
            share = bw.one_piece_share(tmp)
            print(f'[{cid}] seed {seed}: {r["faces"]} faces, {r["executionTimeMs"]} ms, GPU {r.get("gpuTempC")} C, one piece {share:.0%}', flush=True)
            if not best or share > best[0]:
                best = (share, tmp)
            if share >= 0.92:
                break
        os.replace(best[1], shp)
    clean = os.path.join(d, 'shape_clean.glb')
    bc.keep_main_body(shp, clean)
    painted = os.path.join(d, 'painted.glb')
    print('  ' + bc.run([os.path.join(bc.ROOT, 'engines', 'tela-3d', 'paint_from_views.py'), '--mesh', clean, '--out', painted,
                         '--faces', str(faces), '--res', '2048', '--view', f'front={front}', '--view', f'back={back}']), flush=True)
    out = os.path.join(bw.OUT, f'{cid}.glb')
    print('  ' + bc.run([os.path.join(bc.ROOT, 'scripts', 'ravencrest', 'autoRig.py'), '--rig', os.path.join(bc.MUSE, f'{rig}.glb'),
                         '--mesh', painted, '--out', out]), flush=True)
    print('  ' + bc.run([os.path.join(bc.ROOT, 'scripts', 'ravencrest', 'posePreview.py'), out, os.path.join(bw.REVIEW, f'pose_{cid}.jpg'),
                         '--clips', 'idle,walk,attack_1,death']), flush=True)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['crop']:
        for c in args[1:] or CAST:
            print(c, crop(c), flush=True)
    else:
        for c in args or CAST:
            try:
                build(c)
            except Exception as e:
                print(f'[{c}] FAILED: {e}', flush=True)
