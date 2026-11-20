"""Leaf-cluster atlas from a species' art (docs/plajah-vegetation.md §3, step 3).

Cuts N×N cluster cards out of the foliage in the art (crown sprites cut from the sheets): crops where the art is densely
leafy (alpha + not trunk-coloured), each given a soft, irregular alpha edge so it reads as a clump of leaves, packed into
one atlas (RGBA WebP). `--hang` takes tall narrow crops from the lower edge of the crown (willow strands).

  python leafAtlas.py out.webp art1.webp [art2.webp …] [--cells 4] [--cell 256] [--hang] [--seed 7]
"""
import argparse, io
import numpy as np, cv2
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('art', nargs='+')
ap.add_argument('--cells', type=int, default=4); ap.add_argument('--cell', type=int, default=256)
ap.add_argument('--hang', action='store_true'); ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--strands', action='store_true', help='draw hanging strands procedurally in the art palette (willow)')
a = ap.parse_args()
rng = np.random.default_rng(a.seed)

srcs = []
for f in a.art:
    im = np.asarray(Image.open(f).convert('RGBA')).astype(np.float32)
    alpha = im[..., 3] / 255
    rgb = im[..., :3]
    hsv = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    sat, val = hsv[..., 1] / 255, hsv[..., 2] / 255
    # foliage: opaque, and either saturated (green/blue/violet leaves) or bright (glowing); trunk = dark + grey
    # (the sheet's white/grey background trapped inside a crown is neither: low saturation and bright)
    white = (sat < 0.16) & (val > 0.55)
    leafy = (alpha > 0.6) & ~white & (((sat > 0.22) & (val > 0.1)) | ((val > 0.62) & (sat > 0.16)))
    srcs.append((im, leafy.astype(np.float32)))

n = a.cells * a.cells
cell = a.cell
if a.strands:
    # the art's palette: leafy pixels, sorted by brightness, sampled at quantiles
    px = np.concatenate([im[..., :3][lf > 0.5] for im, lf in srcs])
    lum = px.mean(1); order = np.argsort(lum); px = px[order]
    pal = [px[int(len(px) * q)] for q in (0.25, 0.45, 0.6, 0.75, 0.88, 0.96)]
    atlas = np.zeros((cell * a.cells, cell * a.cells, 4), np.uint8)
    for k in range(n):
        layer = np.zeros((cell, cell, 4), np.float32)
        for sidx in range(int(rng.integers(14, 24))):
            x = rng.uniform(cell * 0.1, cell * 0.9); amp = rng.uniform(1.5, 6); fr = rng.uniform(0.02, 0.05); ph = rng.uniform(0, 6.28)
            col = pal[int(rng.integers(0, len(pal)))]; length = rng.uniform(0.55, 1.0) * cell; w = rng.uniform(1.0, 2.2)
            pts = np.array([[x + amp * np.sin(y * fr + ph) + (y / cell) * rng.uniform(-6, 6), y] for y in np.linspace(0, length, 60)], np.int32)
            canvas = np.zeros((cell, cell), np.uint8); cv2.polylines(canvas, [pts], False, 255, max(1, int(round(w))), cv2.LINE_AA)
            for y in range(4, int(length), int(rng.integers(6, 11))):   # small leaves along the strand
                xx0 = int(x + amp * np.sin(y * fr + ph)); cv2.ellipse(canvas, (xx0 + int(rng.integers(-3, 4)), y), (int(rng.integers(2, 4)), int(rng.integers(4, 7))), float(rng.uniform(-30, 30)), 0, 360, 255, -1, cv2.LINE_AA)
            m = canvas.astype(np.float32) / 255 * np.clip(1 - np.linspace(0, 1, cell)[:, None] ** 3 * 0.5, 0, 1)
            for c3 in range(3): layer[..., c3] = layer[..., c3] * (1 - m) + col[c3] * m
            layer[..., 3] = np.maximum(layer[..., 3], m * 255)
        cy, cx = divmod(k, a.cells)
        atlas[cy * cell:(cy + 1) * cell, cx * cell:(cx + 1) * cell] = layer.astype(np.uint8)
    Image.fromarray(atlas, 'RGBA').save(a.out, quality=90, method=6); print(a.out, 'strands', atlas.shape); raise SystemExit
atlas = np.zeros((cell * a.cells, cell * a.cells, 4), np.uint8)
yy, xx = np.mgrid[0:cell, 0:cell].astype(np.float32)
for k in range(n):
    im, leafy = srcs[k % len(srcs)]
    H, W = leafy.shape
    best = None
    for _ in range(300):
        if a.hang:
            cw, ch = int(W * rng.uniform(0.08, 0.14)), int(H * rng.uniform(0.3, 0.45))
            x0 = int(rng.uniform(0, W - cw)); y0 = int(rng.uniform(H * 0.35, H - ch))
        else:
            s = int(min(W, H) * rng.uniform(0.18, 0.3)); cw = ch = s
            x0 = int(rng.uniform(0, W - cw)); y0 = int(rng.uniform(0, H * 0.75 - ch)) if H * 0.75 > ch else 0
        cover = leafy[y0:y0 + ch, x0:x0 + cw].mean()
        if best is None or cover > best[0]: best = (cover, x0, y0, cw, ch)
        if cover > 0.82: break
    _, x0, y0, cw, ch = best
    crop = im[y0:y0 + ch, x0:x0 + cw]
    crop = cv2.resize(crop, (cell, cell), interpolation=cv2.INTER_AREA)
    lf = cv2.resize(leafy[y0:y0 + ch, x0:x0 + cw], (cell, cell), interpolation=cv2.INTER_AREA)
    # soft irregular clump edge: noisy radial falloff (strands: a soft top and a ragged bottom)
    noise = cv2.GaussianBlur(rng.random((cell, cell)).astype(np.float32), (0, 0), cell * 0.06)
    noise = (noise - noise.min()) / (noise.max() - noise.min() + 1e-6)
    if a.hang:
        edge = np.clip(1 - np.abs(xx - cell / 2) / (cell * 0.5), 0, 1) * np.clip(yy / (cell * 0.12), 0, 1) * np.clip((cell - yy) / (cell * 0.25) + noise * 0.6, 0, 1)
    else:
        r = np.hypot(xx - cell / 2, yy - cell / 2) / (cell * 0.5)
        edge = np.clip((1 - r) * 2.2 + (noise - 0.5) * 1.4, 0, 1)
    al = np.clip(crop[..., 3] / 255 * edge * np.clip((lf - 0.25) * 2.0, 0, 1), 0, 1)
    out = np.dstack([crop[..., :3], al * 255]).astype(np.uint8)
    # bleed colour into transparent pixels so mipmaps don't fringe
    m = (al > 0.05).astype(np.uint8)
    for _ in range(6):
        dil = cv2.dilate(out[..., :3], np.ones((3, 3), np.uint8)); out[..., :3] = np.where(m[..., None] > 0, out[..., :3], dil); m = cv2.dilate(m, np.ones((3, 3), np.uint8))
    cy, cx = divmod(k, a.cells)
    atlas[cy * cell:(cy + 1) * cell, cx * cell:(cx + 1) * cell] = out
Image.fromarray(atlas, 'RGBA').save(a.out, quality=88, method=6)
print(a.out, atlas.shape)
