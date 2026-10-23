"""Recolour Elise's jacket so she reads apart from Jack (both wear dark field gear).

Every atlas texel on the torso and arms (by its 3D position on the mesh, rest pose, facing +Z) that
is jacket-like — not skin, not near-black gloves, not the backpack standing off her back — keeps
its shading but takes the new hue (default: oxblood leather).

  python scripts/ravencrest/recolorJacket.py <in.glb> <out.glb> [hex]
"""
import io, os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import read_glb, accessor, buffer_view_bytes, write_glb
from fixJackHead import texels


def main(src, dst, hexcol='4a1612'):
    j, b = read_glb(src)
    p = j['meshes'][0]['primitives'][0]
    P = accessor(j, b, p['attributes']['POSITION'])
    UV = accessor(j, b, p['attributes']['TEXCOORD_0'])
    I = accessor(j, b, p['indices']).reshape(-1, 3)
    mat = j['materials'][p['material']]
    img_i = j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    bv = j['images'][img_i]['bufferView']
    mime = j['images'][img_i].get('mimeType', 'image/jpeg')
    A = np.asarray(Image.open(io.BytesIO(buffer_view_bytes(j, b, bv))).convert('RGB')).astype(np.float32)
    H, W = A.shape[:2]
    top = P[:, 1].max()
    c = P[I].mean(1)
    # Torso + arms band: hips to the shoulders (the jacket's extent on her sheet).
    band = (c[:, 1] > top * 0.47) & (c[:, 1] < top * 0.83)
    x, y, t, bary = texels(UV, I, np.where(band)[0], W, H)
    q = (P[I[t]] * bary[:, :, None]).sum(1)
    col = A[y, x]
    lum = col.mean(1)
    sat = col.max(1) - col.min(1)
    skin = (col[:, 0] > col[:, 2] * 1.25) & (lum > 70)
    torso_back = np.percentile(q[np.abs(q[:, 0]) < 0.12, 2], 8)          # her back, under the pack
    pack = (q[:, 2] < torso_back + 0.01) & (np.abs(q[:, 0]) < 0.2) & (q[:, 1] > top * 0.55)
    # The shirt showing down the open front stays as it is.
    front = np.percentile(q[np.abs(q[:, 0]) < 0.1, 2], 92)
    shirt = (np.abs(q[:, 0]) < 0.07) & (q[:, 2] > front - 0.035) & (q[:, 1] > top * 0.58) & (q[:, 1] < top * 0.8)
    jacket = (lum > 14) & (lum < 150) & (sat < 60) & ~skin & ~pack & ~shirt
    print(f'texels {len(x)}, jacket {jacket.sum()}, pack {pack.sum()}, skin {skin.sum()}')
    tint = np.array([int(hexcol[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
    tint = tint / max(tint.mean(), 1)
    # Keep the leather's shading (luminance), take the new hue; a touch of the old colour remains.
    new = np.clip((lum[jacket, None] * 0.95) * tint, 0, 255)
    mixed = col[jacket] * 0.3 + new * 0.7
    acc = np.zeros((H, W, 3)); wt = np.zeros((H, W))
    np.add.at(acc, (y[jacket], x[jacket]), mixed); np.add.at(wt, (y[jacket], x[jacket]), 1)
    has = wt > 0
    paint = np.zeros_like(A); paint[has] = acc[has] / wt[has][:, None]
    m = Image.fromarray((has * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    a = np.asarray(m).astype(np.float32)[..., None] / 255
    # Grow the painted colour a few px so the soft edge never blends toward black.
    grown = paint.copy()
    for _ in range(3):
        g = np.asarray(Image.fromarray(np.clip(grown, 0, 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))).astype(np.float32)
        empty = grown.sum(2) == 0
        grown[empty] = g[empty]
    out = A * (1 - a) + grown * a
    out[has] = paint[has]
    buf = io.BytesIO()
    Image.fromarray(out.astype(np.uint8)).save(buf, format='PNG' if 'png' in mime else 'JPEG', quality=92)
    write_glb(dst, j, b, {bv: buf.getvalue()})
    print('wrote', dst)


if __name__ == '__main__':
    main(*sys.argv[1:4])
