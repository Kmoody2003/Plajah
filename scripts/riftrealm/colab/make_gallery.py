"""Compose a 4-view gallery contact sheet + score summary for Batch 1 finished GLBs."""
import json
import os
import cv2
import numpy as np
from PIL import Image

SCRATCH = os.environ.get(
    "BATCH_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch1",
)
WORK = os.path.join(SCRATCH, "work")
CHARS = ["seraph_9", "lumen", "sylva", "pyre", "nyx"]
CHAR_ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "games", "rift-realm", "assets", "characters"))

rows = []
cell = 340
for cid in CHARS:
    sp = os.path.join(WORK, cid, "score_body" if cid == "seraph_9" else "score", "scores.json")
    sc = json.load(open(sp))
    glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    f, s, b, o = sc["front"]["score"] * 100, sc["side"]["score"] * 100, sc["back"]["score"] * 100, sc["overall"] * 100
    print(f"{cid:10s} {os.path.getsize(glb) / 1e6:5.2f} MB | front={f:5.1f}%  side={s:5.1f}%  back={b:5.1f}% | overall={o:5.1f}%")
    imgs = []
    for v in ["front", "side", "back", "three_q"]:
        im = np.array(Image.open(os.path.join(WORK, cid, "render_all", f"{v}.png")).convert("RGBA"))
        rs = cv2.resize(im, (cell, cell), interpolation=cv2.INTER_AREA)
        bg = np.full((cell, cell, 3), (22, 24, 34), dtype=np.uint8)
        al = rs[:, :, 3:4].astype(np.float32) / 255.0
        comp = (rs[:, :, :3].astype(np.float32) * al + bg.astype(np.float32) * (1 - al)).astype(np.uint8)
        cv2.putText(comp, f"{cid} | {v}", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (235, 240, 255), 1, cv2.LINE_AA)
        imgs.append(comp)
    rows.append(np.hstack(imgs))

out = os.path.join(SCRATCH, "batch1_finished_gallery.png")
Image.fromarray(np.vstack(rows)).save(out)
print("Gallery saved:", out)
