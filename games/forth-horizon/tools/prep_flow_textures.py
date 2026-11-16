"""
Photoreal texture sets (colour, normal, roughness, ambient occlusion at 2048) -> game-ready files.
  tiled materials (tex-shared-*, ground_*): the left/right and top/bottom edges are cross-faded so they tile without a seam, then everything is brought back to 2048
  hero sheets (tex-hero-*): used once across a facade, so left as they are
  base: occlusion is multiplied in (60%) so crevices read dark, saved as 2048 jpg
  normal, roughness: 1024 jpg (the GPU budget: about 11 materials x 3 maps live at once)
Output: public/games/forth-horizon/tex/bld/<name>_base.jpg, _nrm.jpg, _rgh.jpg
Usage: python tools/prep_flow_textures.py <dir with the raw PNGs>
"""
import os, sys, glob
import cv2
import numpy as np

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "forth-horizon", "tex", "bld")
os.makedirs(OUT, exist_ok=True)
B = 96


def fade(a, axis):
    n = a.shape[axis]
    wt = np.arange(B, dtype=np.float32) / B
    wt = wt * wt * (3 - 2 * wt)
    if axis == 1:
        w = wt[None, :, None] if a.ndim == 3 else wt[None, :]
        out = a[:, : n - B].copy()
        out[:, :B] = a[:, :B] * w + a[:, n - B:] * (1 - w)
    else:
        w = wt[:, None, None] if a.ndim == 3 else wt[:, None]
        out = a[: n - B].copy()
        out[:B] = a[:B] * w + a[n - B:] * (1 - w)
    return out


def tile_ready(a):
    f = a.astype(np.float32)
    f = fade(fade(f, 1), 0)
    return cv2.resize(f, (2048, 2048), interpolation=cv2.INTER_CUBIC)


names = {os.path.basename(p)[: -len("_base.png")] for p in glob.glob(os.path.join(SRC, "*_base.png"))}
if os.path.exists(os.path.join(SRC, "ground_asphalt_dry.png")): names.add("ground_asphalt_dry")
names = sorted(names)
for n in names:
    base_p = os.path.join(SRC, n + ("_base.png" if os.path.exists(os.path.join(SRC, n + "_base.png")) else ".png"))
    maps = {"base": base_p, "normal": os.path.join(SRC, n + "_normal.png"), "roughness": os.path.join(SRC, n + "_roughness.png"), "ao": os.path.join(SRC, n + "_ao.png")}
    if not all(os.path.exists(p) for p in maps.values()):
        print("skip", n, "missing maps"); continue
    im = {k: cv2.imread(p, cv2.IMREAD_COLOR) for k, p in maps.items()}
    tiled = not n.startswith("tex-hero")
    if tiled:
        im = {k: tile_ready(v) for k, v in im.items()}
    else:
        im = {k: v.astype(np.float32) for k, v in im.items()}
    ao = im["ao"].mean(axis=2, keepdims=True) / 255.0
    base = im["base"] * (0.4 + 0.6 * ao)
    nrm = cv2.resize(im["normal"], (1024, 1024), interpolation=cv2.INTER_AREA)
    rgh = cv2.resize(im["roughness"].mean(axis=2), (1024, 1024), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(OUT, n + "_base.jpg"), np.clip(base, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(OUT, n + "_nrm.jpg"), np.clip(nrm, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, n + "_rgh.jpg"), np.clip(rgh, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    print("ok", n, "tiled" if tiled else "sheet")
