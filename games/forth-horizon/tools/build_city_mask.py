"""
Bake the street network into a mask texture the terrain shader reads: R = carriageway, G = sidewalk, B = centre line.
Roads and sidewalks are unions of wide strokes, so intersections merge cleanly (no overlapping ribbons).
Also cuts seamless asphalt and paver tiles from the reference textures.
Run: python games/forth-horizon/tools/build_city_mask.py
"""
import json, math, os
import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(REPO, "public", "games", "forth-horizon", "region")
TEX = os.path.join(REPO, "public", "games", "forth-horizon", "tex")
MPP = 1.5
ROAD = {"street": 9.0, "arterial": 15.0, "freeway": 24.0, "ramp": 8.0}
WALK = {"street": 4.2, "arterial": 4.8}        # sidewalk width each side

streets = json.load(open(os.path.join(OUT, "city_streets.json")))
xs = [p[0] for s in streets for p in s["p"]]
zs = [p[1] for s in streets for p in s["p"]]
x0, x1, z0, z1 = min(xs) - 40, max(xs) + 40, min(zs) - 40, max(zs) + 40
W, H = int((x1 - x0) / MPP), int((z1 - z0) / MPP)
print("mask", W, H)
chan = [np.zeros((H, W), np.uint8) for _ in range(3)]


def px(p):
    return (int((p[0] - x0) / MPP), int((p[1] - z0) / MPP))


def stroke(ch, pts, width_m, val=255):
    arr = np.array([px(p) for p in pts], np.int32).reshape(-1, 1, 2)
    cv2.polylines(chan[ch], [arr], False, val, max(int(width_m / MPP), 1), cv2.LINE_AA)


# sidewalks (G) under the carriageways (R wins in the shader); freeways and ramps have none
for s in streets:
    if s["c"] in WALK:
        stroke(1, s["p"], ROAD[s["c"]] + 2 * WALK[s["c"]])
for s in streets:
    stroke(0, s["p"], ROAD[s["c"]])
# rounded kerb returns at intersections: closing the carriageway fills each concave corner with a fillet (about 6 m radius)
chan[0] = cv2.morphologyEx(chan[0], cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
# the sidewalk wraps the filleted corner: grow it from the new road edge
chan[1] = np.maximum(chan[1], cv2.dilate(chan[0], cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) * (chan[1] > 0))
# centre line on arterials and freeways; a crossing street's carriageway breaks it
cross = np.zeros((H, W), np.uint8)
for s in streets:
    if s["c"] == "street":
        arr = np.array([px(p) for p in s["p"]], np.int32).reshape(-1, 1, 2)
        cv2.polylines(cross, [arr], False, 255, int(ROAD["street"] / MPP) + 2)
chan[2] = np.where(cross > 0, 0, chan[2]).astype(np.uint8)
mask = np.dstack(chan)
Image.fromarray(mask).save(os.path.join(OUT, "city_mask.png"), compress_level=3)
json.dump({"x0": x0, "z0": z0, "w": W * MPP, "h": H * MPP, "mpp": MPP, "asph": 4.0, "pave": 1.4}, open(os.path.join(OUT, "city_mask.json"), "w"))


def seamless(im):
    a = np.array(im)
    top = np.concatenate([a, a[:, ::-1]], 1)
    return Image.fromarray(np.concatenate([top, top[::-1]], 0))


SRC = os.path.join(TEX, "..", "tex")
# asphalt: the plain lane between the painted marks of the reference road texture
ref = json.load(open(os.path.join(TEX, "sources.json")))
RACER = "D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22"
a = Image.open(os.path.join(RACER, ref["asphalt_highway"])).convert("RGB")
w, h = a.size
lane = a.crop((int(w * 0.32), int(h * 0.05), int(w * 0.66), int(h * 0.95))).resize((512, 512)).convert("L").convert("RGB")
seamless(lane).save(os.path.join(TEX, "asphalt_plain.jpg"), quality=90)
p = Image.open(os.path.join(RACER, ref["paver"])).convert("RGB")
w, h = p.size
seamless(p.crop((int(w * 0.30), int(h * 0.05), int(w * 0.98), int(h * 0.95))).resize((512, 512))).save(os.path.join(TEX, "paver_plain.jpg"), quality=90)
print("done")
