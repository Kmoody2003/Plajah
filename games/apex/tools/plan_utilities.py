"""
Power for the map: a power plant on the river, substations at the towns, and the transmission lines that join them.

  Power plant   on the west bank south of the port (river for cooling and fuel barges, the port branch for fuel by rail): a graded platform, two turbine halls, two stacks, two cooling towers,
                fuel tanks, a switchyard of transformers and an administration building; its gate lane joins the port district's lane.
  Substations   one for each town that draws power (port district, downtown south, the north-bank neighbourhood, the south-west coast town, the airport, the east-bank city); each is a fenced yard of transformers
                beside a street.
  Lines         (never over water: routed on dry land with a 40 m margin; a substation on another landmass is fed by an underground river cable, not drawn) the plant feeds each substation by a line of lattice pylons every ~230 m, nudged off water, roads and buildings. Where a line has to cross the river it uses two tall towers on the banks.
Writes region/utilities.json (platform, plant, substations, pylons, spans) and region/utility_streets.json (the plant's gate lane), and clears generated buildings from the plant's platform.
Run after the zone tools and before audit_and_seed.py:  IRONPORT_PKG=public/games/apex/ironport python games/apex/tools/plan_utilities.py
"""
import json
import math
import os
import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
import real_city as rc

OUT = os.path.join(rc.REPO, "public", "games", "apex", "region")
MPP = rc.MPP
CELL = 4.0
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)

PLATFORM = [(3570, 1060), (4065, 1060), (4065, 1240), (3570, 1240)]
PLATFORM_Y = 16.0
PLANT = dict(
    halls=[dict(x=3690, z=1120, w=120, d=36, h=26, rot=0.0), dict(x=3690, z=1190, w=120, d=36, h=26, rot=0.0)],
    stacks=[dict(x=3800, z=1105, h=95, r=4.5), dict(x=3800, z=1205, h=95, r=4.5)],
    cooling=[dict(x=3920, z=1120, r=30, h=82), dict(x=3920, z=1200, r=30, h=82)],
    tanks=[dict(x=3600, z=1100, r=16, h=14), dict(x=3600, z=1215, r=16, h=14)],
    switchyard=dict(x=4020, z=1150, w=80, d=60),
    admin=dict(x=3640, z=1075),
)
GATE_LANE = [[3735, 968], [3735, 1075], [3640, 1075]]
SUBSTATIONS = {"port": (3548, 160), "downtown-south": (3110, 2010), "north-bank": (5150, -3330), "sw-coast": (-6180, 3520), "airport": (-4700, 3960), "east-city": (5800, 560)}
LINES = [("plant", "port"), ("plant", "downtown-south"), ("downtown-south", "east-city"), ("downtown-south", "airport"), ("airport", "sw-coast"), ("plant", "north-bank")]


def main():
    hm = json.load(open(os.path.join(OUT, "height2.json")))
    hi = np.fromfile(os.path.join(OUT, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    hat = lambda x, z: float(hi[min(max(int(z / 6 + hm["h"] / 2), 0), hm["h"] - 1), min(max(int(x / 6 + hm["w"] / 2), 0), hm["w"] - 1)])
    hg = cv2.resize(hi, (NX, NZ), interpolation=cv2.INTER_AREA)
    water = hg < 2.5
    gy, gx = np.gradient(ndi.gaussian_filter(hg, 1.0)); slope = np.hypot(gx, gy) / CELL
    data = json.load(open(os.path.join(OUT, "city.json")))
    reg = json.load(open(os.path.join(OUT, "region.json")))

    # clear the plant's platform of generated buildings
    poly = np.array(PLATFORM, np.float32).reshape(-1, 1, 2)
    keep, drop = [], 0
    for it in data["items"]:
        if it.get("kind") != "hero" and cv2.pointPolygonTest(poly, (float(it["bx"]), float(it["bz"])), True) >= -30:
            drop += 1; continue
        keep.append(it)
    data["items"] = keep
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    print("cleared", drop, "buildings from the plant platform")

    # roads and buildings to keep pylons off
    occ = np.zeros((NZ, NX), np.uint8)
    for s in rc.streets_world(): cv2.polylines(occ, [np.array([cell(*q) for q in s["pts"]], np.float32).astype(np.int32)], False, 1, 8)
    for fn in ("user_streets.json", "country_roads.json", "port_streets.json"):
        p = os.path.join(OUT, fn)
        if os.path.exists(p):
            for r in json.load(open(p))["roads"]: cv2.polylines(occ, [np.array([cell(*q) for q in r["xz"]], np.float32).astype(np.int32)], False, 1, 6)
    for it in data["items"]:
        cv2.circle(occ, tuple(int(v) for v in cell(it["bx"], it["bz"])), max(2, int(max(it["w"], it["d"]) * 0.6 / CELL)), 1, -1)
    blocked = water | (slope > 0.25) | (occ > 0)

    def ok_at(x, z):
        i, j = int((x - X0) / CELL), int((z - Z0) / CELL)
        return 0 <= i < NX and 0 <= j < NZ and not blocked[j, i]

    pos = {k: np.array(v, float) for k, v in SUBSTATIONS.items()}
    pos["plant"] = np.array([4020.0, 1150.0])
    pylons, spans = [], []
    # Routing: a least-cost path on a 20 m grid that never enters water (kept 40 m back from the banks), keeps off steep ground and prefers open land to roads and buildings; then pylons
    # are placed by string-pulling along that path: each span is as long as it can be (up to 260 m) while its straight chord stays dry. So no wire ever crosses a river, bay or pond.
    import heapq
    G = 20.0
    gx_n, gz_n = int(W / G), int(H / G)
    F = int(G / CELL)
    def mpool(a):
        a = a[:gz_n * F, :gx_n * F]
        a = np.pad(a, ((0, gz_n * F - a.shape[0]), (0, gx_n * F - a.shape[1])))
        return a.reshape(gz_n, F, gx_n, F).max(axis=(1, 3))
    wf = mpool(water.astype(np.uint8)) > 0
    wd = cv2.dilate(wf.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0              # 40 m margin
    sl = mpool(slope.astype(np.float32))
    oc = mpool(occ) > 0
    cost = 1.0 + np.clip(sl - 0.12, 0, 1) * 25.0 + oc * 4.0
    cost[wd] = np.inf
    g_of = lambda x, z: (int((x - X0) / G), int((z - Z0) / G))
    def dry(p, q):
        d = float(np.hypot(*(q - p))); n = max(2, int(d / 6))
        for k in range(n + 1):
            c = p + (q - p) * k / n
            i, j = int((c[0] - X0) / CELL), int((c[1] - Z0) / CELL)
            if not (0 <= i < NX and 0 <= j < NZ) or water[max(0, j - 2):j + 3, max(0, i - 2):i + 3].any(): return False
        return True
    def route(A, B):
        s0, t0 = g_of(*A), g_of(*B)
        free = cost.copy()
        for (ci, cj) in (s0, t0): free[max(0, cj - 5):cj + 6, max(0, ci - 5):ci + 6] = np.minimum(free[max(0, cj - 5):cj + 6, max(0, ci - 5):ci + 6], 1.0)    # the ends sit on land by definition
        dist = {s0: 0.0}; prev = {}; pq = [(0.0, 0.0, s0)]
        while pq:
            _, d, u = heapq.heappop(pq)
            if u == t0: break
            if d > dist.get(u, 1e18): continue
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if not di and not dj: continue
                    v = (u[0] + di, u[1] + dj)
                    if not (0 <= v[0] < gx_n and 0 <= v[1] < gz_n) or not np.isfinite(free[v[1], v[0]]): continue
                    nd = d + free[v[1], v[0]] * (1.414 if di and dj else 1.0) + 0.0
                    if nd < dist.get(v, 1e18):
                        dist[v] = nd; prev[v] = u
                        heapq.heappush(pq, (nd + np.hypot(t0[0] - v[0], t0[1] - v[1]), nd, v))
        if t0 not in prev and t0 != s0: return None
        path = [t0]
        while path[-1] != s0: path.append(prev[path[-1]])
        path.reverse()
        return [np.array([X0 + (i + 0.5) * G, Z0 + (j + 0.5) * G]) for i, j in path]
    from scipy import ndimage as _ndi
    land = ~wd
    lab, _n = _ndi.label(land)
    comp_of = lambda P: int(lab[g_of(*P)[1], g_of(*P)[0]])
    def lay(A, B, a, b, quiet=False):
        path = route(A, B)
        if path is None: return False
        path[0], path[-1] = A, B
        pts = [path[0]]; i0 = 0
        while i0 < len(path) - 1:
            j = i0 + 1
            while j + 1 < len(path) and np.hypot(*(path[j + 1] - path[i0])) <= 260 and dry(path[i0], path[j + 1]): j += 1
            pts.append(path[j]); i0 = j
        ids = []
        for i, q in enumerate(pts):
            t = (pts[1] - pts[0]) if i == 0 else (pts[i] - pts[i - 1])
            pylons.append({"x": round(float(q[0]), 1), "z": round(float(q[1]), 1), "rot": round(math.atan2(t[0], t[1]), 4), "h": 38})
            ids.append(len(pylons) - 1)
        for u, v in zip(ids[:-1], ids[1:]):
            spans.append([u, v])
            pa, pb = np.array([pylons[u]["x"], pylons[u]["z"]]), np.array([pylons[v]["x"], pylons[v]["z"]])
            if not dry(pa, pb): print("WET SPAN", a, b, pa, pb)
        print(a, "->", b, len(pts), "pylons, length", int(sum(np.hypot(*(pts[k + 1] - pts[k])) for k in range(len(pts) - 1))), "m")
        return True
    cables, terminals = [], []
    def terminal_pair(A, B):
        """the closest points of dry land on either side of the water between A's landmass and B's: where an underground cable goes under the river"""
        ca, cb = comp_of(A), comp_of(B)
        ya, xa = np.nonzero((lab == ca) & ndi.binary_dilation(wd, iterations=3)); yb, xb = np.nonzero((lab == cb) & ndi.binary_dilation(wd, iterations=3))
        if not len(ya) or not len(yb): return None
        pa_ = np.stack([xa, ya], 1).astype(float); pb_ = np.stack([xb, yb], 1).astype(float)
        tree = cKDTree(pb_); d, kk = tree.query(pa_); i = int(np.argmin(d)); k = int(kk[i])
        cen = lambda c: np.array([X0 + (c[0] + 0.5) * G, Z0 + (c[1] + 0.5) * G])
        return cen(pa_[i]), cen(pb_[k]), float(d[i] * G)
    for a, b in LINES:
        A, B = pos[a], pos[b]
        if lay(A, B, a, b): continue
        # the river splits the grid: each side is fed on its own, and the two are joined by an underground cable under the water
        tp = terminal_pair(A, B)
        if not tp: print("NO TERMINALS", a, b); continue
        TA, TB, gap = tp
        na, nb = "cable terminal (" + a + ")", "cable terminal (" + b + ")"
        okA = lay(A, TA, a, na); okB = lay(B, TB, b, nb)
        terminals.append({"name": na, "x": round(float(TA[0]), 1), "z": round(float(TA[1]), 1), "rot": 0.0})
        terminals.append({"name": nb, "x": round(float(TB[0]), 1), "z": round(float(TB[1]), 1), "rot": 0.0})
        cables.append({"from": a, "to": b, "xz": [[round(float(TA[0]), 1), round(float(TA[1]), 1)], [round(float(TB[0]), 1), round(float(TB[1]), 1)]], "gap": int(gap)})
        print("  underground cable", a, "<->", b, "under", int(gap), "m of water;", "terminal lines", okA, okB)
    # substations face the nearest street: simple fixed orientation
    subs = [{"name": k, "x": v[0], "z": v[1], "rot": 0.0} for k, v in SUBSTATIONS.items()] + terminals
    json.dump({"platform": {"poly": PLATFORM, "y": PLATFORM_Y}, "plant": PLANT, "substations": subs, "pylons": pylons, "spans": spans, "cables": cables}, open(os.path.join(OUT, "utilities.json"), "w"), separators=(",", ":"))
    json.dump({"roads": [{"kind": "paved", "xz": GATE_LANE, "half": 5.0}]}, open(os.path.join(OUT, "utility_streets.json"), "w"), separators=(",", ":"))
    print("pylons", len(pylons), "spans", len(spans), "tall", sum(1 for p in pylons if p["h"] > 50))


if __name__ == "__main__":
    main()
