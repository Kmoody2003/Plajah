"""Cut the subject out of a photo with rembg (u2net), the same way the Tela 3D runtime does, so the loop's
photo mask and the scan engine's input agree. Run with the tela3d env's python:

  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/gamestudio/photo3d_cutout.py in.jpg out.png
"""
import os
import sys

import numpy as np
from PIL import Image

os.environ.setdefault("U2NET_HOME", "D:/Plajah Models/u2net")
import rembg  # noqa: E402

src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGBA")
session = rembg.new_session("u2net", providers=["CPUExecutionProvider"])
cut = np.asarray(rembg.remove(img, session=session).convert("RGBA")).copy()
# Same haze rule as tela3d_runtime.cut_out: faint alpha is background.
k = np.clip((cut[:, :, 3].astype(np.float32) / 255 - 0.35) / 0.3, 0, 1)
cut[:, :, 3] = (k * k * (3 - 2 * k) * 255).astype(np.uint8)
Image.fromarray(cut, "RGBA").save(dst)
print(f"cut {img.size[0]}x{img.size[1]} -> {dst} ({(cut[:, :, 3] > 127).mean() * 100:.1f}% subject)")
