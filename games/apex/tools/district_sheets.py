"""
Kenne's district asset sheets (industrial districts, civic riverfront) hold several assets each, every one drawn as a front elevation, a side elevation
and an isometric view. Plajah 3D's build-from-sheet (services/argilla/understand/sheetBuild.ts) reads one subject per sheet (kit sheets are its
known failure, docs/plajah-3d-game-assets.md), so each asset gets a sheet of its own: its front and side cut from the kit sheet and set side by side
on the sheet's own background. scripts/apex-build-district-assets.mjs then runs buildFromSheet on each one in the Plajah 3D lab.

  python tools/district_sheets.py detect out_dir sheet.jpg ...     numbered boxes per sheet (<stem>.boxes.jpg / .json), to fill the manifest
  python tools/district_sheets.py mini out_dir                     one sheet per manifest entry (tools/data/district_assets.json) -> out_dir/<id>.png
"""
import json, os, sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = r"D:\plajah game assets deign from promtps\racer"
MANIFEST = os.path.join(HERE, "data", "district_assets.json")


def read(f):
    return cv2.imdecode(np.fromfile(f, np.uint8), cv2.IMREAD_COLOR)


def background(img):
    b = np.concatenate([img[:6].reshape(-1, 3), img[-6:].reshape(-1, 3), img[:, :6].reshape(-1, 3), img[:, -6:].reshape(-1, 3)])
    return np.median(b, axis=0)


def boxes(img):
    h, w = img.shape[:2]
    diff = np.abs(img.astype(np.int16) - background(img)).max(axis=2)
    sat = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[:, :, 1]
    m = ((diff > 26) | (sat > 60)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    n, _, st, _ = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        x, y, bw, bh, a = st[i]
        if a < 900 or bh < 28 or bw < 28 or bw > w * 0.9 or bh > h * 0.9 or (bh < 40 and bw / max(bh, 1) > 6):
            continue
        out.append([int(x), int(y), int(x + bw), int(y + bh)])
    out.sort(key=lambda b: (round(b[1] / 60), b[0]))
    return out


def trim_caption(img, b):
    """Elevations carry a caption under the ground line ([FRONT VIEW]): cut the box at the last row band that is mostly drawing."""
    x0, y0, x1, y1 = b
    crop = img[y0:y1, x0:x1]
    diff = np.abs(crop.astype(np.int16) - background(img)).max(axis=2) > 26
    rows = diff.mean(axis=1)
    # the ground line: the lowest row drawn most of the way across; the caption sits below it
    ground = [y for y in range(len(rows)) if rows[y] > 0.55 and y > len(rows) * 0.6]
    if ground:
        return [x0, y0, x1, y0 + ground[-1] + 2]
    # walk up from the bottom past sparse text rows (< 12% ink) to the drawing
    y = len(rows) - 1
    while y > len(rows) * 0.6 and rows[y] < 0.12:
        y -= 1
    return [x0, y0, x1, y0 + y + 2]


def detect(od, files):
    os.makedirs(od, exist_ok=True)
    for f in files:
        img = read(f)
        bx = boxes(img)
        stem = os.path.splitext(os.path.basename(f))[0]
        json.dump({"sheet": os.path.relpath(f, ROOT), "boxes": bx}, open(os.path.join(od, stem + ".boxes.json"), "w"))
        an = img.copy()
        for k, b in enumerate(bx):
            cv2.rectangle(an, (b[0], b[1]), (b[2], b[3]), (0, 0, 255), 2)
            cv2.putText(an, str(k), (b[0] + 3, b[1] + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        cv2.imencode(".jpg", an, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tofile(os.path.join(od, stem + ".boxes.jpg"))
        print(stem, len(bx))


def mini(od, only=()):
    os.makedirs(od, exist_ok=True)
    for a in json.load(open(MANIFEST, encoding="utf8"))["assets"]:
        if only and a["id"] not in only:
            continue
        img = read(os.path.join(ROOT, a["sheet"]))
        bx = boxes(img)
        bg = background(img)
        parts = []
        for role in ("front", "side"):
            b = a.get(role + "Box") or bx[a[role]]
            b = trim_caption(img, b)
            parts.append(img[b[1]:b[3], b[0]:b[2]])
        # same scale (they are elevations off one sheet), feet on one line, a clear gap of background between them
        pad = 60
        H = max(p.shape[0] for p in parts) + pad * 2
        W = sum(p.shape[1] for p in parts) + pad * 3
        out = np.empty((H, W, 3), np.uint8)
        out[:] = bg
        x = pad
        for p in parts:
            out[H - pad - p.shape[0]:H - pad, x:x + p.shape[1]] = p
            x += p.shape[1] + pad
        out = cv2.resize(out, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)   # the drawings are small (a tower ~150 px tall): give the cut-out and the paint more pixels
        cv2.imencode(".png", out)[1].tofile(os.path.join(od, a["id"] + ".png"))
        print(a["id"], out.shape[1], "x", out.shape[0])


if __name__ == "__main__":
    if sys.argv[1] == "detect":
        detect(sys.argv[2], sys.argv[3:])
    else:
        mini(sys.argv[2], set(sys.argv[3:]))
