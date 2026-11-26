"""Prepare Lexicon's villagers for the Character Forge (scripts/eraclash3d/characters/<name>/forge.json).

Each villager's turnaround (made from Kenne's design sheet, D:/Plajah Runtime/forge/lexicon-cast/<name>_turnaround.png)
is a 2x2 grid: front, three-quarter / side, back, on a cream ground, some with a thin frame round each view. The Forge
reads three views left to right on flat white, the side view facing left, so per villager this writes
D:/Plajah Runtime/forge/<name>-ref/:
  sheet.png  front, side (mirrored to face left), back; the figures cut out onto white at the sheet's own scale,
             their soles on one line
  front.png  the portrait: the front view's head, enlarged for MediaPipe's face landmarks

  python scripts/lexicon/prep_cast_art.py [name ...]      (no names: all twelve)
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = r"D:/Plajah Runtime/forge/lexicon-cast"
CAST = ["mira", "bram", "thorne", "kaelen", "maya", "nico", "zora", "tolo", "oren", "pip", "selene", "lyra"]
SCALE = 0.6        # the turnaround's figures are ~2200 px tall; the Forge's sheets work at ~1300


def figure_mask(rgb):
    """The figure: pixels off the cream ground (darker or more saturated), without thin frame lines, the largest piece
    plus anything within 25 px of it (a staff tip, a plait end), holes filled."""
    a = rgb.astype(np.int16)
    mx, mn = a.max(axis=2), a.min(axis=2)
    ground = np.median(a[:40, :40].reshape(-1, 3), axis=0)
    dist = np.abs(a - ground).sum(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    m = (dist > 42) | ((sat > 0.2) & (dist > 20))
    m = ndimage.binary_opening(m, iterations=2)      # frame lines and specks are a few px thick
    # a frame's floor line is long and flat: drop long horizontal runs no taller than ~10 px
    flat = m & ~ndimage.binary_opening(m, structure=np.ones((11, 1), bool))
    lines = ndimage.binary_opening(flat, structure=np.ones((1, 120), bool))
    m &= ~ndimage.binary_dilation(lines, iterations=2)
    lab, n = ndimage.label(m)
    if n == 0:
        return m
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    fig = lab == (int(np.argmax(sizes)) + 1)
    near = ndimage.binary_dilation(fig, iterations=25)
    keep = np.isin(lab, np.unique(lab[near & m]))
    keep &= ~np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s < 300])
    keep |= fig
    keep = ndimage.binary_closing(keep, iterations=3)
    return ndimage.binary_fill_holes(keep)


def cut(rgb):
    m = figure_mask(rgb)
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = rgb[y0:y1, x0:x1].copy()
    crop[~m[y0:y1, x0:x1]] = 255
    return crop


def prep(name):
    path = os.path.join(SRC, f"{name}_turnaround.png")
    img = np.asarray(Image.open(path).convert("RGB"))
    H, W, _ = img.shape
    m = 30                                            # clear of the dividers between the four views
    quad = {
        "front": img[m:H // 2 - m, m:W // 2 - m],
        "side": img[H // 2 + m:H - m, m:W // 2 - m],
        "back": img[H // 2 + m:H - m, W // 2 + m:W - m],
    }
    figs = {k: cut(v) for k, v in quad.items()}
    figs["side"] = figs["side"][:, ::-1].copy()      # the Forge's side view faces left (the turnaround's faces right)
    # one line for the soles, the views' own scale kept (they were drawn together)
    hmax = max(f.shape[0] for f in figs.values())
    gap = 120
    total = sum(f.shape[1] for f in figs.values()) + gap * 4
    out = np.full((hmax + 2 * gap, total, 3), 255, np.uint8)
    x = gap
    for k in ("front", "side", "back"):
        f = figs[k]
        out[gap + hmax - f.shape[0]:gap + hmax, x:x + f.shape[1]] = f
        x += f.shape[1] + gap
    sheet = Image.fromarray(out)
    sheet = sheet.resize((int(sheet.width * SCALE), int(sheet.height * SCALE)), Image.LANCZOS)
    dst = os.path.join(r"D:/Plajah Runtime/forge", f"{name}-ref")
    os.makedirs(dst, exist_ok=True)
    sheet.save(os.path.join(dst, "sheet.png"))
    # the portrait: the front figure's head, crown to below the chin, enlarged
    f = figs["front"]
    fh, fw = f.shape[:2]
    head = f[:int(fh * 0.14)]
    cols = np.nonzero((head < 235).any(axis=2).any(axis=0))[0]
    cx = (cols.min() + cols.max()) // 2 if len(cols) else fw // 2
    side = int(fh * 0.16)
    x0 = max(0, cx - side // 2)
    face = Image.fromarray(f[:int(fh * 0.2), x0:x0 + side])      # crown to below the chin
    face = face.resize((1024, int(1024 * face.height / max(1, face.width))), Image.LANCZOS)
    face.save(os.path.join(dst, "front.png"))
    print(name, "sheet", sheet.size, "figures", {k: v.shape[:2] for k, v in figs.items()})


for n in (sys.argv[1:] or CAST):
    prep(n)
