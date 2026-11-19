"""Cut the Cyber Forest asset sheets (white-ground turnarounds) into alpha sprites.

Usage: python -I cutSheets.py <sheet-dir> <out-dir>
Background = near-white pixels connected to the sheet border (flood fill), so white highlights
inside a plant survive. Every blob larger than MIN_AREA becomes <sheet>_<n>.png, trimmed, with a
soft 2 px alpha edge and colour decontaminated from the white fringe.
"""
import sys, os, glob, re
import numpy as np, cv2

MIN_AREA = 9000
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def slug(p):
    n = os.path.basename(p)
    n = re.sub(r'_[0-9a-f]{8}\.jpg$', '', n).replace('\u2026', '')
    return re.sub(r'[^A-Za-z0-9]+', '_', n).strip('_').lower()[:40]

for f in sorted(glob.glob(os.path.join(src, '*.jpg'))):
    im = cv2.imdecode(np.fromfile(f, np.uint8), cv2.IMREAD_COLOR)
    h, w = im.shape[:2]
    lab = im.astype(np.int16)
    # "white-ish": bright and low chroma (sheets have a soft grey vignette + shadows)
    mx, mn = lab.max(2), lab.min(2)
    bgish = ((mn > 200) & (mx - mn < 22)).astype(np.uint8)
    # flood from the border through bg-ish pixels
    mask = np.zeros((h + 2, w + 2), np.uint8)
    fill = bgish.copy() * 255
    for (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] + [(x, 0) for x in range(0, w, 40)] + [(x, h - 1) for x in range(0, w, 40)] + [(0, y) for y in range(0, h, 40)] + [(w - 1, y) for y in range(0, h, 40)]:
        if fill[y, x] == 255:
            cv2.floodFill(fill, mask, (x, y), 128)
    bg = (fill == 128)
    fg = (~bg).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    base = slug(f)
    k = 0
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area < MIN_AREA or bw < 40 or bh < 40:
            continue
        # skip flat text/label boxes: very low fill ratio of saturated pixels is fine, but drop thin wide strips
        if bh < 60 and bw > 4 * bh:
            continue
        sub = (labels[y:y + bh, x:x + bw] == i).astype(np.float32)
        a = cv2.GaussianBlur(sub, (5, 5), 0)
        a = np.clip((a - 0.25) / 0.6, 0, 1)
        rgb = im[y:y + bh, x:x + bw].astype(np.float32)
        # de-white the fringe: c = (c - (1-a)*255)/a
        aa = np.maximum(a, 0.05)[..., None]
        rgb = np.clip((rgb - (1 - aa) * 255) / aa, 0, 255)
        rgba = np.dstack([rgb, a * 255]).astype(np.uint8)
        name = f'{base}_{k}.png'
        cv2.imencode('.png', rgba)[1].tofile(os.path.join(out, name))
        print(name, x, y, bw, bh, area)
        k += 1
