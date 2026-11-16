"""
Curb lines for the city: where the carriageway meets a sidewalk in the baked street mask (city_mask.png: R carriageway, G sidewalk), traced as polylines with the
outward (sidewalk-side) normal, so the game can raise real curb stones and a raised sidewalk instead of leaving them painted flat on the street.
Output: public/games/forth-horizon/region/city_curbs.json  = [[x, z, nx, nz], ...] per polyline, flattened as [[x,z,nx,nz,x,z,nx,nz,...], ...]
Usage: python tools/build_curbs.py
"""
import json, os
import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "public", "games", "forth-horizon", "region"))
meta = json.load(open(os.path.join(OUT, "city_mask.json")))
x0, z0, MPP = meta["x0"], meta["z0"], meta["mpp"]
m = np.array(Image.open(os.path.join(OUT, "city_mask.png")))
road = (m[..., 0] > 127).astype(np.uint8)
walk = (m[..., 1] > 127) & (road == 0)
cs, _ = cv2.findContours(road, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
out = []
total = 0
for c in cs:
    if len(c) < 8: continue
    a = cv2.approxPolyDP(c, 0.7, True).reshape(-1, 2).astype(np.float32)        # about 1 m tolerance
    if len(a) < 3: continue
    n = len(a)
    run = []
    def flush():
        global run
        if len(run) >= 2:
            out.append([round(float(v), 2) for p in run for v in p])
        run = []
    for i in range(n + 1):
        p, q = a[i % n], a[(i + 1) % n]
        d = q - p
        l = float(np.hypot(*d))
        if l < 0.2: continue
        mid = (p + q) / 2
        nrm = np.array([-d[1], d[0]]) / l
        ok = 0
        for s in (1, -1):
            t = mid + nrm * s * 2.4
            tx, ty = int(t[0]), int(t[1])
            if 0 <= ty < walk.shape[0] and 0 <= tx < walk.shape[1] and walk[ty, tx]:
                ok = s; break
        if not ok:
            flush(); continue
        nn = nrm * ok
        wp = lambda pt: (x0 + (pt[0] + 0.5) * MPP, z0 + (pt[1] + 0.5) * MPP)
        if not run:
            run.append((*wp(p), nn[0], nn[1]))
        run.append((*wp(q), nn[0], nn[1]))
        total += 1
    flush()
json.dump(out, open(os.path.join(OUT, "city_curbs.json"), "w"), separators=(",", ":"))
print("polylines", len(out), "segments", total)
