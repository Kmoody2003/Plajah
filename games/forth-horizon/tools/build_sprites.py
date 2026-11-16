"""
Cut individual plants out of the asset-sheet renders (foliage sheets in the racer folder) into RGBA sprites for the game.

rembg (u2net, CPU) removes the sheet background, connected components give one object each, and a manifest records the
category and a real-world height so the viewer can scale each sprite. Run with the Tela 3D env python:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" games/forth-horizon/tools/build_sprites.py
"""
import glob
import json
import os
import sys
import cv2
import numpy as np
from PIL import Image

os.environ.setdefault("U2NET_HOME", r"D:\Plajah Models\u2net")
from rembg import remove, new_session

SRC = "D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "forth-horizon", "sprites")
os.makedirs(OUT, exist_ok=True)

# prefix -> (set name, category hint, metres for the tallest object on the sheet, minimum component height in px)
SHEETS = [
    ("3D_tree_asset_sheet_render", "trees", "tree", 22.0, 90),
    ("3D_urban_foliage_asset_ren", "urban", "urbantree", 12.0, 80),
    ("Beach_grass_asset_sheet_re", "beachgrass", "grass", 1.1, 40),
    ("3D_beach_grass_asset_rende", "beachgrass2", "grass", 1.1, 40),
    ("Coastal_vegetation_3D_asse", "coastal", "shrub", 3.4, 50),
    ("3D_wetland_foliage_asset_s", "wetland", "reed", 1.9, 60),
    ("Corn_stalks_and_wheat_bundles", "crops", "crop", 2.4, 50),
    ("3D_forest_flora_asset_shee", "forestflora", "fern", 1.0, 40),
]

sess = new_session("u2net", providers=["CPUExecutionProvider"])
manifest = []
for prefix, name, cat, tall_m, min_h in SHEETS:
    files = sorted(glob.glob(os.path.join(SRC, prefix + "*.jpg")))[:2]
    for fi, f in enumerate(files):
        try:
            im = Image.open(f).convert("RGB")
        except Exception:
            continue
        cut = remove(im, session=sess)
        a = np.array(cut)
        mask = (a[..., 3] > 140).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
        comps = []
        for i in range(1, n):
            x, y, w, h, area = st[i]
            if h < min_h or w < 12 or area < 900:
                continue
            if w / h > 5.0 and cat != "grass":          # long thin shapes are captions, ground strips
                continue
            comps.append((x, y, w, h))
        if not comps:
            continue
        tallest = max(c[3] for c in comps)
        for k, (x, y, w, h) in enumerate(comps):
            pad = 3
            x0, y0 = max(x - pad, 0), max(y - pad, 0)
            x1, y1 = min(x + w + pad, a.shape[1]), min(y + h + pad, a.shape[0])
            piece = a[y0:y1, x0:x1].copy()
            m = (lab[y0:y1, x0:x1] != 0)
            piece[..., 3] = np.where(m, piece[..., 3], 0)       # only this object
            fn = f"{name}_{fi}_{k:02d}.png"
            Image.fromarray(piece).save(os.path.join(OUT, fn))
            rgb = piece[..., :3][piece[..., 3] > 140]
            hsv = cv2.cvtColor(rgb.reshape(-1, 1, 3), cv2.COLOR_RGB2HSV).reshape(-1, 3)
            hue, sat = float(np.median(hsv[:, 0])), float(np.median(hsv[:, 1]))
            conifer = cat == "tree" and h / w > 1.45
            c = ("conifer" if conifer else "broadleaf") if cat in ("tree",) else cat
            manifest.append({"file": fn, "set": name, "cat": c, "w": int(x1 - x0), "h": int(y1 - y0),
                             "hm": round(tall_m * h / tallest, 2), "hue": hue, "sat": sat, "autumn": bool(cat == "tree" and (hue < 22 or hue > 150) and sat > 90)})
        print(name, fi, len(comps), "objects")
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=0)
print("total", len(manifest))
