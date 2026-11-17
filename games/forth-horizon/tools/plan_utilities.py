"""
Power for the map: a power plant on the river, substations at the towns, and the transmission lines that join them.

  Power plant   on the west bank south of the port (river for cooling and fuel barges, the port branch for fuel by rail): a graded platform, two turbine halls, two stacks, two cooling towers,
                fuel tanks, a switchyard of transformers and an administration building; its gate lane joins the port district's lane.
  Substations   one for each town that draws power (port district, downtown south, the north-bank neighbourhood, the south-west coast town, the airport, the east-bank city); each is a fenced yard of transformers
                beside a street.
  Lines         the plant feeds each substation by a line of lattice pylons every ~230 m, nudged off water, roads and buildings. Where a line has to cross the river it uses two tall towers on the banks.
Writes region/utilities.json (platform, plant, substations, pylons, spans) and region/utility_streets.json (the plant's gate lane), and clears generated buildings from the plant's platform.
Run after the zone tools and before audit_and_seed.py:  IRONPORT_PKG=public/games/forth-horizon/ironport python games/forth-horizon/tools/plan_utilities.py
"""
import json
import math
import os
import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
import real_city as rc

OUT = os.path.join(rc.REPO, "public", "games", "forth-horizon", "region")
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
LINES = [("plant", "port"), ("plant", "downtown-south"), ("downtown-south", "east-city"), ("downtown-south", "airport"), ("airport", "sw-coast"), ("downtown-south", "north-bank")]


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
    for a, b in LINES:
        A, B = pos[a], pos[b]
        L = float(np.hypot(*(B - A))); t = (B - A) / L; n = np.array([-t[1], t[0]])
        # river crossing: the stretch of the line over water needs tall towers on the banks
        N = max(2, int(round(L / 230.0)))
        pts = []
        for i in range(N + 1):
            q = A + (B - A) * i / N
            if 0 < i < N:
                for off in (0, 25, -25, 50, -50, 80, -80):
                    c = q + n * off
                    if ok_at(*c): q = c; break
            pts.append(q)
        # tall towers where a span would cross water
        ids = []
        for i, q in enumerate(pts):
            tall = False
            if i < len(pts) - 1:
                m = (q + pts[i + 1]) / 2
                if not ok_at(*m) and water[int((m[1] - Z0) / CELL), int((m[0] - X0) / CELL)]: tall = True
            if i > 0:
                m = (q + pts[i - 1]) / 2
                if water[int((m[1] - Z0) / CELL), int((m[0] - X0) / CELL)]: tall = True
            rot = math.atan2(t[0], t[1])
            pylons.append({"x": round(float(q[0]), 1), "z": round(float(q[1]), 1), "rot": round(rot, 4), "h": 105 if tall else 38})
            ids.append(len(pylons) - 1)
        for u, v in zip(ids[:-1], ids[1:]): spans.append([u, v])
    # substations face the nearest street: simple fixed orientation
    subs = [{"name": k, "x": v[0], "z": v[1], "rot": 0.0} for k, v in SUBSTATIONS.items()]
    json.dump({"platform": {"poly": PLATFORM, "y": PLATFORM_Y}, "plant": PLANT, "substations": subs, "pylons": pylons, "spans": spans}, open(os.path.join(OUT, "utilities.json"), "w"), separators=(",", ":"))
    json.dump({"roads": [{"kind": "paved", "xz": GATE_LANE, "half": 5.0}]}, open(os.path.join(OUT, "utility_streets.json"), "w"), separators=(",", ":"))
    print("pylons", len(pylons), "spans", len(spans), "tall", sum(1 for p in pylons if p["h"] > 50))


if __name__ == "__main__":
    main()
