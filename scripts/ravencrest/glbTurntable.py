"""Quick textured turntable of a static GLB (front / side / back / ¾) as shaded point splats — no GPU.

  python scripts/ravencrest/glbTurntable.py model.glb out.jpg
"""
import sys

import numpy as np
import trimesh
from PIL import Image


def main(src, out, cell=360):
    m = trimesh.load(src, force='mesh')
    V = np.asarray(m.vertices, float)
    F = np.asarray(m.faces)
    # Dense surface samples carry the base colour from the texture.
    pts, fi = trimesh.sample.sample_surface_even(m, 220000) if len(F) else (V, None)
    cols = np.full((len(pts), 3), 180.0)
    try:
        uv = m.visual.uv
        img = m.visual.material.baseColorTexture or m.visual.material.image
        if uv is not None and img is not None:
            tex = np.asarray(img.convert('RGB'), float)
            tri = F[fi]
            bary = trimesh.triangles.points_to_barycentric(V[tri], pts)
            puv = (uv[tri] * bary[:, :, None]).sum(1)
            x = np.clip((puv[:, 0] % 1) * (tex.shape[1] - 1), 0, tex.shape[1] - 1).astype(int)
            y = np.clip((1 - puv[:, 1] % 1) * (tex.shape[0] - 1), 0, tex.shape[0] - 1).astype(int)
            cols = tex[y, x]
    except Exception as e:  # untextured
        print('no texture:', e)
    nrm = m.face_normals[fi] if fi is not None else np.zeros_like(pts)
    H = V[:, 1].max() - V[:, 1].min()
    tiles = []
    for ang in (0, 45, 90, 180):
        a = np.radians(ang)
        R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
        P = pts @ R.T
        Nn = nrm @ R.T
        light = np.clip(Nn @ np.array([0.35, 0.5, 0.8]), 0.15, 1)[:, None]
        img = np.full((cell, cell, 3), 28, np.uint8)
        px = (cell / 2 + P[:, 0] / H * cell * 0.85).astype(int)
        py = (cell * 0.95 - (P[:, 1] - V[:, 1].min()) / H * cell * 0.88).astype(int)
        order = np.argsort(P[:, 2])
        ok = (px[order] >= 0) & (px[order] < cell - 1) & (py[order] >= 0) & (py[order] < cell - 1)
        o = order[ok]
        c = np.clip(cols[o] * (0.35 + 0.75 * light[o]), 0, 255).astype(np.uint8)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            img[py[o] + dy, px[o] + dx] = c
        tiles.append(Image.fromarray(img))
    sheet = Image.new('RGB', (cell * 4, cell))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * cell, 0))
    sheet.save(out, quality=88)
    print('wrote', out, len(V), 'verts')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
