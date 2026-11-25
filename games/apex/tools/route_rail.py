"""
Find railway alignments over the height map: A* on a 40 m grid where grade, water, towns and the airfield cost extra, so lines follow the terraces and valleys
instead of ploughing through the moraine. Writes tools/data/rail_routes.json (waypoints every ~300 m) for plan_rail_airport.py.
Usage: python tools/route_rail.py
"""
import heapq, json, math, os
import numpy as np
from scipy.ndimage import gaussian_filter, gaussian_filter1d, map_coordinates

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, "..", "..", "..", "public", "games", "apex", "region")
meta = json.load(open(os.path.join(REG, "region.json")))
W, H, MPP = meta["width"], meta["height"], meta["mpp"]
h = np.fromfile(os.path.join(REG, "height.f32"), dtype="f4").reshape(H, W)
CELL = 40.0
GW, GH = int(W * MPP / CELL), int(H * MPP / CELL)
xs = (np.arange(GW) + 0.5) * CELL - W * MPP / 2
zs = (np.arange(GH) + 0.5) * CELL - H * MPP / 2
X, Z = np.meshgrid(xs, zs)
g = map_coordinates(h, [Z / MPP + H / 2, X / MPP + W / 2], order=1, mode="nearest")
gs = gaussian_filter(g, 2.0)
water = g < 0.8
um = json.load(open(os.path.join(REG, "user_map.json")))

def poly_mask(pts):
    from matplotlib.path import Path
    return Path(pts).contains_points(np.c_[X.ravel(), Z.ravel()]).reshape(X.shape)

# extra cost per metre
extra = np.ones_like(g)
river = (X > 2600) & (X < 5000)
extra += np.where(water & river, 11.0, 0.0) + np.where(water & ~river, 40.0, 0.0)
for f in um["features"]:
    if f["type"] == "zone" and f["pts"] and not f["id"].startswith("gen-"):
        k = {"dense": 5.0, "residential": 3.0, "commercial": 3.0, "waterfront": 1.5, "industrial": 0.8, "parkland": 0.5}.get(f["kind"], 0.0)
        if k: extra += np.where(poly_mask(f["pts"]), k, 0.0)
# rail likes a corridor that is already graded: beside the highways the user drew
from scipy.ndimage import distance_transform_edt
hwmask = np.ones_like(g, dtype=bool)
for f in um["features"]:
    if f["type"] == "road" and f["kind"] == "highway" and not f["id"].startswith("gen-"):
        for a, b in zip(f["pts"][:-1], f["pts"][1:]):
            n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 20))
            for k in range(n + 1):
                x = a[0] + (b[0] - a[0]) * k / n; z = a[1] + (b[1] - a[1]) * k / n
                i, j = int((x + W * MPP / 2) / CELL), int((z + H * MPP / 2) / CELL)
                if 0 <= i < GW and 0 <= j < GH: hwmask[j, i] = False
dcorr = distance_transform_edt(hwmask) * CELL
extra *= np.where((dcorr > 70) & (dcorr < 220), 0.45, 1.0)
# the two high river bridges (src/riverBridges.ts) and their approaches are in the way
for (ax, az), (bx, bz) in [((3288, 2748), (4248, 2796)), ((5928, -3888), (6624, -3888))]:
    for k in range(0, 101):
        px, pz = ax + (bx - ax) * k / 100, az + (bz - az) * k / 100
        extra += np.where(np.hypot(X - px, Z - pz) < 260, 60.0, 0.0)
# keep off the airfield (runway strip) except at the station
extra += np.where((abs(Z - 4380) < 230) & (X > -6800) & (X < -3600), 60.0, 0.0)
# keep off the lake shore and the very edge of the map
extra += np.where((X < -6500) | (np.abs(Z) > 4450), 30.0, 0.0)

DIRS = [(dx, dz) for dx in range(-2, 3) for dz in range(-2, 3) if (dx, dz) != (0, 0) and math.gcd(abs(dx), abs(dz)) == 1]

def route(a, b, penal=None):
    ia = (int((a[0] + W * MPP / 2) / CELL), int((a[1] + H * MPP / 2) / CELL))
    ib = (int((b[0] + W * MPP / 2) / CELL), int((b[1] + H * MPP / 2) / CELL))
    best = {ia: 0.0}; prev = {}; pq = [(0.0, 0.0, ia)]
    while pq:
        _, c, n = heapq.heappop(pq)
        if n == ib: break
        if c > best.get(n, 1e18): continue
        for dx, dz in DIRS:
            m = (n[0] + dx, n[1] + dz)
            if not (0 <= m[0] < GW and 0 <= m[1] < GH): continue
            l = math.hypot(dx, dz) * CELL
            grade = abs(gs[m[1], m[0]] - gs[n[1], n[0]]) / l
            cost = l * (extra[n[1], n[0]] + extra[m[1], m[0]]) / 2 * (1 + 7 * (grade / 0.03) ** 2)
            if penal: cost += penal(m, (dx, dz), prev.get(n))
            nc = c + cost
            if nc < best.get(m, 1e18):
                best[m] = nc; prev[m] = n; heapq.heappush(pq, (nc + math.hypot(m[0] - ib[0], m[1] - ib[1]) * CELL, nc, m))
    path = [ib]
    while path[-1] != ia: path.append(prev[path[-1]])
    path.reverse()
    return np.array([[xs[i], zs[j]] for i, j in path])

def simplify(pts, sigma=3.0, every=300.0):
    sm = np.c_[gaussian_filter1d(pts[:, 0], sigma, mode="nearest"), gaussian_filter1d(pts[:, 1], sigma, mode="nearest")]
    sm[0], sm[-1] = pts[0], pts[-1]
    out = [sm[0]]; acc = 0.0
    for p, q in zip(sm[:-1], sm[1:]):
        acc += math.hypot(*(q - p))
        if acc >= every: out.append(q); acc = 0.0
    if math.hypot(*(out[-1] - sm[-1])) > 80: out.append(sm[-1])
    else: out[-1] = sm[-1]
    return [[round(float(x)), round(float(z))] for x, z in out]

def chain(points):
    path = []
    for a, b in zip(points[:-1], points[1:]):
        seg = route(a, b)
        path.extend(seg.tolist() if not path else seg.tolist()[1:])
    return simplify(np.array(path))

AIRPORT_ST = (-4560, 3865)
SOUTHGATE = (3150, 2330)          # west bank terrace beside the river and the highway
PORTAL_E = (4470, 2420)           # east bank
CENTRAL = (4950, 2850)
routes = {
    "main": chain([AIRPORT_ST, SOUTHGATE, PORTAL_E, CENTRAL]),
    "port": chain([SOUTHGATE, (3450, 100), (3800, -1350)]),
    "coast": chain([AIRPORT_ST, (-6420, 3600)]),
}
out = os.path.join(HERE, "data", "rail_routes.json")
json.dump(routes, open(out, "w"))
for k, v in routes.items():
    d = sum(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(v[:-1], v[1:]))
    print(k, len(v), "points", round(d / 1000, 1), "km")
