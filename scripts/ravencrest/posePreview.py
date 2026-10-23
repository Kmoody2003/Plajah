"""Contact sheet of a skinned GLB posed by its own clips (CPU linear-blend skinning, shaded point splats).

  python scripts/ravencrest/posePreview.py rig.glb out.jpg [--clips idle,walk,attack_1,death] [--frames 3]
Front and side view per frame — a quick check that an auto-rig deforms sensibly, no GPU or browser needed.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import read_glb, accessor  # noqa: E402
from autoRig import node_mat  # noqa: E402


def slerp(a, b, t):
    d = np.dot(a, b)
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        r = a + t * (b - a); return r / np.linalg.norm(r)
    th = np.arccos(d)
    return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / np.sin(th)


def sample(j, b, an, time):
    out = {}
    for ch in an['channels']:
        sm = an['samplers'][ch['sampler']]
        tin = accessor(j, b, sm['input']).ravel(); val = accessor(j, b, sm['output'])
        i = int(np.clip(np.searchsorted(tin, time) - 1, 0, len(tin) - 1))
        i2 = min(i + 1, len(tin) - 1)
        t = 0 if i2 == i else np.clip((time - tin[i]) / (tin[i2] - tin[i]), 0, 1)
        path = ch['target']['path']
        v = slerp(val[i], val[i2], t) if path == 'rotation' else val[i] * (1 - t) + val[i2] * t
        out.setdefault(ch['target']['node'], {})[path] = v.tolist()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb'); ap.add_argument('out')
    ap.add_argument('--clips', default='idle,walk,attack_1,death')
    ap.add_argument('--frames', type=int, default=3)
    a = ap.parse_args()
    j, b = read_glb(a.glb)
    nodes = j['nodes']; skin = j['skins'][0]; joints = skin['joints']
    prim = j['meshes'][0]['primitives'][0]
    V = accessor(j, b, prim['attributes']['POSITION']).astype(np.float64)
    N = accessor(j, b, prim['attributes']['NORMAL']).astype(np.float64)
    JI = accessor(j, b, prim['attributes']['JOINTS_0']).astype(int)
    JW = accessor(j, b, prim['attributes']['WEIGHTS_0']).astype(np.float64)
    IBM = accessor(j, b, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    parent = {c: i for i, nd in enumerate(nodes) for c in nd.get('children', [])}
    anims = {an['name']: an for an in j.get('animations', [])}
    cell = 240
    tiles = []
    for name in a.clips.split(','):
        an = anims.get(name)
        if not an:
            continue
        dur = max(accessor(j, b, s['input']).max() for s in an['samplers'])
        for f in range(a.frames):
            pose = sample(j, b, an, dur * f / max(1, a.frames - 1) * 0.999)
            mats = {}

            def world(i):
                if i in mats:
                    return mats[i]
                nd = dict(nodes[i]); nd.update(pose.get(i, {}))
                M = node_mat(nd)
                if i in parent:
                    M = world(parent[i]) @ M
                mats[i] = M
                return M
            S = np.array([world(i) @ IBM[k] for k, i in enumerate(joints)])
            M = np.einsum('vk,vkij->vij', JW, S[JI])
            P = np.einsum('vij,vj->vi', M[:, :3, :3], V) + M[:, :3, 3]
            Nn = np.einsum('vij,vj->vi', M[:, :3, :3], N)
            Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9
            for view in ('front', 'side'):
                img = Image.new('RGB', (cell, cell), (24, 26, 30))
                x = P[:, 0] if view == 'front' else -P[:, 2]
                z = P[:, 2] if view == 'front' else P[:, 0]
                light = np.clip(Nn @ np.array([0.4, 0.6, 0.7]) if view == 'front' else Nn @ np.array([-0.7, 0.6, 0.4]), 0.08, 1)
                H = max(V[:, 1].max(), 1e-6) * 1.15
                px = (cell / 2 + x / H * cell).astype(int); py = (cell * 0.95 - P[:, 1] / H * cell).astype(int)
                order = np.argsort(z)
                arr = np.array(img)
                ok = (px[order] >= 1) & (px[order] < cell - 1) & (py[order] >= 1) & (py[order] < cell - 1)
                o = order[ok]
                c = (light[o, None] * np.array([210, 205, 195])).astype(np.uint8)
                for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                    arr[py[o] + dy, px[o] + dx] = c
                img = Image.fromarray(arr)
                ImageDraw.Draw(img).text((4, 4), f'{name} {f}', fill=(255, 200, 120))
                tiles.append(img)
    cols = a.frames * 2
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * cell))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * cell, (i // cols) * cell))
    sheet.save(a.out, quality=85)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
