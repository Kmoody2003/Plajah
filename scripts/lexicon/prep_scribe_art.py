"""Prepare the Scribe's art for the Character Forge (scripts/eraclash3d/characters/scribe/forge.json).

Kenne's Scribe sheets (Word gaem/Nov 24 - 22_56) -> D:/Plajah Runtime/forge/scribe-ref/
  sheet.png  the turnaround's front, side and back views (the Forge reads three; the 3/4 view, the guide lines,
             title, labels and palette are dropped), on a flat white ground, left to right
  front.png  the portrait: the design sheet's head close-up, enlarged for MediaPipe's face landmarks

  python scripts/lexicon/prep_scribe_art.py
"""
import os
import sys
import numpy as np
from PIL import Image

ART = r"D:/plajah game assets deign from promtps/Word gaem/Nov 24 - 22_56"
OUT = r"D:/Plajah Runtime/forge/scribe-ref"
os.makedirs(OUT, exist_ok=True)


def find(prefix):
    for f in os.listdir(ART):
        if f.startswith(prefix):
            return os.path.join(ART, f)
    sys.exit(f"missing art: {prefix}")


def ink_mask(rgb):
    """Pixels that belong to a figure: not paper white and not the pale grey guide lines."""
    a = rgb.astype(np.int16)
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    return (mx < 200) | (sat > 0.18)


def drop_rules(m, k=3):
    """Remove thin ruled lines: an ink pixel with no ink k px above and below is part of a horizontal rule; with no
    ink k px left and right, a vertical rule. Figures are thicker than the sheet's 1-2 px guide lines."""
    up = np.zeros_like(m); up[k:] = m[:-k]
    dn = np.zeros_like(m); dn[:-k] = m[k:]
    lf = np.zeros_like(m); lf[:, k:] = m[:, :-k]
    rt = np.zeros_like(m); rt[:, :-k] = m[:, k:]
    return m & (up | dn) & (lf | rt)


def runs(occ, min_len):
    out, start = [], None
    for i, v in enumerate(occ):
        if v and start is None:
            start = i
        if not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    if start is not None and len(occ) - start >= min_len:
        out.append((start, len(occ)))
    return out


# ---- turnaround: four views, keep front / side / back ----
sheet = np.asarray(Image.open(find("Scholar_standing_for_character_r")).convert("RGB"))
H, W, _ = sheet.shape
y0, y1 = int(H * 0.19), int(H * 0.845)          # below the title, above the view labels and palette
band = sheet[y0:y1]
m = drop_rules(ink_mask(band))
# The four views' cloaks and staffs touch at mid-height (the side view's staff runs into the back view's cloak), so
# column occupancy can't split them on this sheet. Their columns, measured once from its heads and boots (1024 px wide):
VIEWS_1024 = {"front": (41, 280), "three_quarter": (303, 507), "side": (569, 746), "back": (772, 981)}
merged = [tuple(int(v * W / 1024) for v in VIEWS_1024[k]) for k in ("front", "three_quarter", "side", "back")]
print("view columns:", merged)
keep = [merged[0], merged[2], merged[3]]       # front, side, back (the 3/4 view is merged[1])
pad, gap = 10, 80
pieces = []
for a, b in keep:
    crop = band[:, max(0, a - pad):min(W, b + pad)].copy()
    cm = drop_rules(ink_mask(crop))              # the guide lines go with the ground
    # keep only the figure: the widest run of inked columns (the staff is held, so it joins the body); slivers of a
    # neighbouring view's cloak caught at the crop's edge are separate runs and go
    cr = runs(cm.sum(axis=0) > 2, 1)
    if cr:
        ka, kb = max(cr, key=lambda t: t[1] - t[0])
        cm[:, :ka] = False; cm[:, kb:] = False
    crop[~cm] = 255                              # flat white ground (the intake samples the corner colour)
    if (a, b) == keep[1]:
        crop = crop[:, ::-1].copy()              # the Forge's side view faces left (the sheet's faces right)
    pieces.append(crop)
h = band.shape[0]
total = sum(p.shape[1] for p in pieces) + gap * (len(pieces) + 1)
out = np.full((h + 2 * gap, total, 3), 255, np.uint8)
x = gap
for p in pieces:
    out[gap:gap + h, x:x + p.shape[1]] = p
    x += p.shape[1] + gap
# enlarge: the intake reads the face off the front figure's head, so give it pixels
img = Image.fromarray(out)
img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
img.save(os.path.join(OUT, "sheet.png"))
print("sheet.png", img.size)

# ---- portrait: the design sheet's head close-up ----
design = Image.open(find("Scholar_adventurer_character_des")).convert("RGB")  # the navy-cloak sheet (10b0c662 sorts first)
dw, dh = design.size
box = (int(dw * 0.765), int(dh * 0.12), int(dw * 0.965), int(dh * 0.345))
face = design.crop(box)
face = face.resize((face.width * 4, face.height * 4), Image.LANCZOS)
face.save(os.path.join(OUT, "front.png"))
print("front.png", face.size, "from", box)
