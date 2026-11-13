"""
cut_pieces.py: cut the pieces of a flat-lay (props and wardrobe on a plain ground) out as RGBA images, with numbers.

  python cut_pieces.py pieces.json out_dir

Each piece's box is cut with SAM 2.1 (box prompt; a pair's two halves prompted on their own and joined), so a white
tabi on a pale ground still comes away clean. Writes <id>.png (cropped to the piece, transparent ground), a contact
sheet, and pieces.json: size in pixels, aspect, fill, the piece's colours (k-means, by share) for every piece.
"""
import json
import os
import sys

import cv2
import numpy as np
import torch
from PIL import Image

MODELS_ROOT = os.environ.get("PLAJAH_MODELS_ROOT", r"D:\Plajah Models")
SRC_ROOT = os.environ.get("TELA3D_SRC", r"D:\Plajah Runtime\tela3d-src")
sys.path.insert(0, os.path.join(SRC_ROOT, "sam2"))
from sam2.build_sam import build_sam2  # noqa: E402
from sam2.sam2_image_predictor import SAM2ImagePredictor  # noqa: E402

spec = json.load(open(sys.argv[1], encoding="utf-8"))
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
img = np.array(Image.open(spec["image"]).convert("RGB"))
H, W = img.shape[:2]
device = "cuda" if torch.cuda.is_available() else "cpu"
pred = SAM2ImagePredictor(build_sam2("configs/sam2.1/sam2.1_hiera_s.yaml", os.path.join(MODELS_ROOT, "sam2", "sam2.1_hiera_small.pt"), device=device))
# the ground: the median of the image's border
border = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3), img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
ground = np.median(border, axis=0)


def cut(box):
    masks, scores, _ = pred.predict(box=np.array(box, dtype=np.float32), multimask_output=True)
    # the mask that is most "not ground" inside the box, among SAM's three
    x0, y0, x1, y1 = box
    off = np.abs(img.astype(np.int32) - ground).sum(2) > 30
    best, bq = None, -1
    for m, s in zip(masks, scores):
        m = m > 0
        inside = m[y0:y1, x0:x1]
        if inside.sum() == 0:
            continue
        q = float(s) * (off[y0:y1, x0:x1][inside].mean())
        if q > bq:
            best, bq = m, q
    return best


report = []
tiles = []
with torch.inference_mode():
    pred.set_image(img)
    for p in spec["pieces"]:
        x0, y0, x1, y1 = p["box"]
        if p.get("pair"):
            mid = (x0 + x1) // 2
            m = cut([x0, y0, mid, y1]) | cut([mid, y0, x1, y1])
        else:
            m = cut([x0, y0, x1, y1])
        m[:y0], m[y1:], m[:, :x0], m[:, x1:] = False, False, False, False
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
        ys, xs = np.nonzero(m)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rgba = np.dstack([img, (m * 255).astype(np.uint8)])[by0:by1, bx0:bx1]
        Image.fromarray(rgba).save(os.path.join(out_dir, f"{p['id']}.png"))
        px = img[m].astype(np.float32)
        k = 4
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        _, lab, cen = cv2.kmeans(px[:: max(1, len(px) // 20000)], k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
        share = np.bincount(lab.ravel(), minlength=k) / len(lab)
        cols = sorted([{"rgb": [int(c) for c in cen[i]], "share": round(float(share[i]), 3)} for i in range(k)], key=lambda c: -c["share"])
        report.append({**p, "bbox": [int(bx0), int(by0), int(bx1), int(by1)], "size": [int(bx1 - bx0), int(by1 - by0)],
                       "aspect": round((by1 - by0) / (bx1 - bx0), 3), "fill": round(float(m[by0:by1, bx0:bx1].mean()), 3), "colours": cols})
        tiles.append((p["id"], rgba))
        print(f"{p['id']}: {bx1 - bx0}x{by1 - by0}px, fill {m[by0:by1, bx0:bx1].mean():.2f}", flush=True)
json.dump(report, open(os.path.join(out_dir, "pieces.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
# contact sheet on a checker, so the cut edges show
cell = 300
sheet = Image.new("RGB", (cell * 5, cell * ((len(tiles) + 4) // 5)), (60, 60, 60))
for i, (pid, rgba) in enumerate(tiles):
    t = Image.fromarray(rgba)
    t.thumbnail((cell - 10, cell - 10))
    bg = Image.new("RGB", t.size, (30, 120, 60))
    bg.paste(t, (0, 0), t)
    sheet.paste(bg, ((i % 5) * cell + 5, (i // 5) * cell + 5))
sheet.save(os.path.join(out_dir, "_contact.png"))
