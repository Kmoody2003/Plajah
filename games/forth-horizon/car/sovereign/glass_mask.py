"""
Sovereign GT-R: window mask from the baked scan texture.
The generated mesh carries the turntable image as its texture. The windows are the dark regions in it, but reflections punch holes
and the roof reflects dark sky, so a plain threshold is blotchy. Here the dark pixels are closed, small holes filled and small
islands dropped, and the result is saved as an atlas-space mask the car shader samples (white = glass).
Usage: python glass_mask.py   (reads public/games/forth-horizon/car/sov_painted.glb, writes ../../public/.../sov_glass_mask.png)
"""
import io, os, sys
import numpy as np
import cv2
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
GLB = os.path.join(ROOT, "..", "..", "public", "games", "forth-horizon", "car", "sov_painted.glb")
OUT = os.path.join(ROOT, "..", "..", "public", "games", "forth-horizon", "car", "sov_glass_mask.png")

scene = trimesh.load(GLB)
geom = list(scene.geometry.values())[0] if hasattr(scene, "geometry") else scene
img = geom.visual.material.baseColorTexture if hasattr(geom.visual.material, "baseColorTexture") else geom.visual.material.image
a = np.array(img.convert("RGB"))
cv2.imwrite(os.path.join(HERE, "atlas.png"), cv2.cvtColor(a, cv2.COLOR_RGB2BGR))
lum = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
blur = cv2.GaussianBlur(lum, (0, 0), 3)
dark = (blur < 0.20).astype(np.uint8)
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
m = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, k)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
keep = np.zeros_like(m)
for i in range(1, n):
    if st[i, 4] > 0.0006 * m.size:
        keep[lab == i] = 1
# fill holes inside each kept region
inv = 1 - keep
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
for i in range(1, n2):
    if st2[i, 4] < 0.004 * m.size:
        keep[lab2 == i] = 1
cv2.imwrite(OUT, keep * 255)
print("atlas", a.shape, "glass px", int(keep.sum()), "of", keep.size, "->", OUT)
