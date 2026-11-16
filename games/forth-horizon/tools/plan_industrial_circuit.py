"""
Plan the Ironworks Industrial Circuit: a short street course through the port's industrial centre on the west bank (the yards from infill_waterfront.py).

The loop visits the middle of each yard in a ring, finding its way between them over dry, flat land and preferring free ground to buildings (Dijkstra on a 6 m grid), then it is smoothed into
a curve with no corner tighter than about 24 m. Buildings that stand on the road or in its 11 m verge are removed from city.json (the course is cut through the works). Writes
region/industrial_circuit.json  {name, kind, xz}  (closed: the last point is the first).
Run after infill_waterfront.py:  IRONPORT_PKG=public/games/forth-horizon/ironport python games/forth-horizon/tools/plan_industrial_circuit.py
"""
import heapq
import json
import math
import os
import numpy as np
from scipy import ndimage as ndi
from scipy.interpolate import splprep, splev
import cv2
import real_city as rc

OUT = os.path.join(rc.REPO, "public", "games", "forth-horizon", "region")
CELL = 6.0
MPP = rc.MPP
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)

zones = json.load(open(os.path.join(OUT, "zones.json")))["zones"]
yards = [z for z in zones if z["kind"] == "industrial" and z["bank"] == "far" and 3000 < z["center"][0] < 4600 and -1100 < z["center"][1] < 1100]
print("yards", [(z["id"], [round(v) for v in z["center"]]) for z in yards])
cx0 = np.mean([z["center"][0] for z in yards]); cz0 = np.mean([z["center"][1] for z in yards])
order = sorted(yards, key=lambda z: math.atan2(z["center"][1] - cz0, z["center"][0] - cx0))
# a ring needs a modest size: keep the yards that are not far from the middle, roughly every other one
order = [z for z in order if z["id"] in ("industrial-54", "industrial-36", "industrial-49", "industrial-48")]       # a ring of four yards: a compact lap of about 3.5 km
way = [tuple(z["center"]) for z in order][::1]

data = json.load(open(os.path.join(OUT, "city.json")))
hf = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
h = np.repeat(np.repeat(hf, 2, 0), 2, 1)[:NZ, :NX]
gy, gx = np.gradient(hf)
slope = np.repeat(np.repeat(np.hypot(gx, gy) / MPP, 2, 0), 2, 1)[:NZ, :NX]
water = h < 3.0
dist_w = ndi.distance_transform_edt(~water) * CELL
bld = np.zeros((NZ, NX), np.uint8)
for it in data["items"]:
    phi = it["rotY"]
    e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
    hw, hd = it["w"] / 2, it["d"] / 2
    pts = [(it["bx"] + e1[0] * a + e2[0] * b, it["bz"] + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
    cv2.fillPoly(bld, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], 1)
bld = cv2.dilate(bld, np.ones((5, 5), np.uint8))
blocked = water | (slope > 0.10) | (dist_w < 30.0)
cost = np.ones((NZ, NX), np.float32); cost[bld > 0] = 7.0
cost[blocked] = 1e9


def dijkstra(a, b):
    sx, sz = int(cell(*a)[0]), int(cell(*a)[1]); gx_, gz_ = int(cell(*b)[0]), int(cell(*b)[1])
    dist = {(sx, sz): 0.0}; prev = {}; pq = [(0.0, sx, sz)]
    while pq:
        d, x, z = heapq.heappop(pq)
        if (x, z) == (gx_, gz_): break
        if d > dist.get((x, z), 1e18): continue
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, nz = x + dx, z + dz
            if not (0 <= nx < NX and 0 <= nz < NZ) or cost[nz, nx] >= 1e8: continue
            nd = d + cost[nz, nx] * (1.414 if dx and dz else 1.0)
            if nd < dist.get((nx, nz), 1e18): dist[(nx, nz)] = nd; prev[(nx, nz)] = (x, z); heapq.heappush(pq, (nd, nx, nz))
    path = [(gx_, gz_)]
    while path[-1] != (sx, sz):
        if path[-1] not in prev: return None
        path.append(prev[path[-1]])
    return [(X0 + (x + 0.5) * CELL, Z0 + (z + 0.5) * CELL) for x, z in path[::-1]]


# waypoints must be on usable cells: nudge each to the nearest free cell
def nearest_free(p):
    ci, cj = int(cell(*p)[0]), int(cell(*p)[1])
    for r in range(0, 60):
        for dj in range(-r, r + 1):
            for di in range(-r, r + 1):
                if max(abs(di), abs(dj)) != r: continue
                i, j = ci + di, cj + dj
                if 0 <= i < NX and 0 <= j < NZ and cost[j, i] < 1e8: return (X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL)
    return p
way = [nearest_free(p) for p in way]
full = []
for a, b in zip(way, way[1:] + way[:1]):
    seg = dijkstra(a, b)
    if seg is None:
        print("no route between", a, b); continue
    full += seg[:-1]
pts = np.array(full)
# simplify to a polygon of long straights: the game rounds each corner with a 26 m arc (circuitSmooth) so no corner is tighter than that
pl = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), 45.0, True).reshape(-1, 2)
loop = pl
L = float(sum(math.hypot(*(pl[(i + 1) % len(pl)] - pl[i])) for i in range(len(pl))))
print("polygon vertices", len(pl), "length m", round(L))
# cut the course through the works
road = np.zeros((NZ, NX), np.uint8)
dense = np.concatenate([np.linspace(loop[i], loop[(i + 1) % len(loop)], 40) for i in range(len(loop))])
cv2.polylines(road, [np.array([cell(*p) for p in dense], np.float32).astype(np.int32)], True, 1, int(2 * 11.0 / CELL) + 1)
keep, cut = [], 0
for it in data["items"]:
    ci, cj = int(cell(it["bx"], it["bz"])[0]), int(cell(it["bx"], it["bz"])[1])
    if 0 <= ci < NX and 0 <= cj < NZ and road[cj, ci] and (it.get("shore") or it.get("infill")):      # only the generated buildings: heroes and the city's own stay
        cut += 1
        continue
    keep.append(it)
data["items"] = keep
json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
print("buildings removed for the road", cut)
json.dump({"name": "Ironworks Industrial Circuit", "kind": "road_course", "xz": [[round(float(a), 1), round(float(b), 1)] for a, b in loop] + [[round(float(loop[0][0]), 1), round(float(loop[0][1]), 1)]]}, open(os.path.join(OUT, "industrial_circuit.json"), "w"), separators=(",", ":"))
print("wrote industrial_circuit.json")
