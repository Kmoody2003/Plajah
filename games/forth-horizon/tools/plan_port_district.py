"""
The Ironworks port district: one working industrial centre on the west bank of the river, laid out the way a river port is.

  quay + piers      the north and east edges are the water: two piers run out into the river with gantry cranes on the quay and ships alongside
  container yard    the strip behind the quay: blocks of stacked containers in rows square to the quay, with the yard lane between them
  chemical plant    the south-east: a tank farm (3 x 3 tanks, each in its own bund), a pipe rack, process buildings, a flare stack, all inside a fence
  warehouse row     the west side: warehouses, depots and workshops fronting the lanes, loading docks to the street, trucks' turning room in front
The Ironworks Industrial Circuit is the road through all of it: out along the quay, down the container yard, through the tank farm lanes, back up the warehouse row.

The ground is graded to a platform (the game cuts the bluff down to it, see src/portDistrict.ts) so nothing here stands on a slope. Buildings that were generated inside the platform before are
removed; the new ones are placed square to the lane they front.
Writes region/port_district.json (props), region/port_streets.json (service lanes), region/industrial_circuit.json (the course), and updates region/city.json and region/user_streets.json.
Run:  IRONPORT_PKG=public/games/forth-horizon/ironport python games/forth-horizon/tools/plan_port_district.py
"""
import json
import math
import os
import cv2
import numpy as np
import real_city as rc
import place_city as pc

OUT = os.path.join(rc.REPO, "public", "games", "forth-horizon", "region")
GEN = pc.GEN
rng = np.random.default_rng(1969)
CELL = 4.0
X0, Z0 = 3400.0, 0.0
NX, NZ = int(900 / CELL), int(1200 / CELL)
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)

PLATFORM = [(3570, 150), (4112, 150), (4122, 520), (4118, 1010), (3570, 1010)]      # graded flat
PLATFORM_Y = 5.0
# the course: waypoints, clockwise from the start line on the quay lane
COURSE = [(3640, 215), (4050, 215), (4082, 262), (4082, 585), (4045, 628), (3880, 628), (3858, 668), (3858, 745), (4035, 765), (4072, 805), (4072, 930), (4035, 968),
          (3735, 968), (3692, 925), (3692, 395), (3652, 352), (3640, 300)]
LANES = [  # service lanes (paved, narrower), joining the course
    [(3692, 520), (3575, 520)], [(3692, 760), (3575, 760)], [(3692, 860), (3575, 860)], [(3858, 700), (3720, 700)], [(3880, 440), (3692, 440)],
    [(4082, 440), (3880, 440)], [(3765, 215), (3765, 640)],
]
PIERS = [dict(x=4112, z=330, len=240, w=34), dict(x=4118, z=700, len=200, w=34)]          # run east into the river
SHIPS = [dict(x=4260, z=330 + 44, len=210, w=30, rot=1.5708, color=0x7d1f1a), dict(x=4250, z=700 + 44, len=180, w=27, rot=1.5708, color=0x1f3b5c)]
CRANES = [dict(x=4096, z=z, rot=0.0) for z in (250, 330, 410, 560)]
CONTAINER_BLOCKS = [(3830 + 0, 245, 2, 12), (3830, 300, 2, 12), (3830, 355, 2, 12), (3830, 470, 2, 12), (3830, 525, 2, 12), (3900, 245, 2, 10)]
# tank farm: 3 x 3 grid in the south-east, tanks (x, z, r, h)
TANKS = []
for i, tx in enumerate((3915, 3985, 4045)):
    for j, tz in enumerate((820, 880, 935)):
        TANKS.append(dict(x=tx, z=tz, r=[12, 14, 11][(i + j) % 3], h=[15, 18, 13][(i * 2 + j) % 3], roof=("dome" if (i + j) % 2 else "float")))
PIPE_RACK = [(3880, 790), (4062, 790)]
FLARE = (3890, 990)
FENCE = [(3865, 780), (4085, 780), (4085, 1000), (3865, 1000)]


def inside(poly, x, z):
    return cv2.pointPolygonTest(np.array(poly, np.float32).reshape(-1, 1, 2), (float(x), float(z)), False) >= 0


def main():
    data = json.load(open(os.path.join(OUT, "city.json")))
    # remove what was generated before inside the platform
    poly = np.array(PLATFORM, np.float32)
    keep, drop = [], 0
    for it in data["items"]:
        if (it.get("infill") or it.get("rural") or it.get("shore") or it.get("userzone") or it.get("sprawl")) and inside(PLATFORM, it["bx"], it["bz"]):
            drop += 1; continue
        keep.append(it)
    items = keep
    print("removed", drop, "generated buildings from the platform")

    # occupancy of the platform: free = inside, not on a road, tank farm, container yard or pier
    occ = np.ones((NZ, NX), np.uint8)
    cv2.fillPoly(occ, [np.array([cell(*p) for p in PLATFORM], np.float32).astype(np.int32)], 0)
    def block(pts, wm):
        cv2.polylines(occ, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], False, 1, max(1, int(wm / CELL)))
    block(COURSE + [COURSE[0]], 26.0)                                                          # lane, barriers, tyre walls and a truck's width either side
    for l in LANES: block(l, 16.0)
    for (x, z, nx, nz) in CONTAINER_BLOCKS:
        cv2.rectangle(occ, tuple(int(v) for v in cell(x - 8, z - 8)), tuple(int(v) for v in cell(x + nx * 13 + 8, z + nz * 2.7 + 8)), 1, -1)
    cv2.rectangle(occ, tuple(int(v) for v in cell(3860, 770)), tuple(int(v) for v in cell(4090, 1005)), 1, -1)       # chemical plant
    cv2.rectangle(occ, tuple(int(v) for v in cell(3830, 150)), tuple(int(v) for v in cell(4112, 620)), 1, -1)        # container yard and quay apron
    cv2.rectangle(occ, tuple(int(v) for v in cell(3830, 640)), tuple(int(v) for v in cell(4112, 765)), 1, -1)        # the apron between yard and plant

    print('free cells in west strip', int((occ[int(cell(0,380)[1]):int(cell(0,930)[1]), int(cell(3570,0)[0]):int(cell(3679,0)[0])] == 0).sum()), 'of', int(((930-380)/CELL)*((3679-3570)/CELL)))
    placed = []
    def put(slug, x, z, face):
        m = GEN[slug]
        phi = math.atan2(face[0], face[1])
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        w, d = m["w"], m["d"]
        hw, hd = w / 2 + 2.0, d / 2 + 2.0
        a = np.linspace(-hw, hw, max(int(math.ceil(hw * 2 / CELL)), 2) + 1); b = np.linspace(-hd, hd, max(int(math.ceil(hd * 2 / CELL)), 2) + 1)
        A, B = np.meshgrid(a, b)
        ci = ((x + e1[0] * A + e2[0] * B - X0) / CELL).astype(int); cj = ((z + e1[1] * A + e2[1] * B - Z0) / CELL).astype(int)
        if ci.min() < 0 or cj.min() < 0 or ci.max() >= NX or cj.max() >= NZ or occ[cj, ci].any():
            if len(placed) < 3 and rng.random() < 0.02: print('fail', slug, round(x), round(z), occ[np.clip(cj,0,NZ-1), np.clip(ci,0,NX-1)].mean())
            return False
        corners = [(x + e1[0] * s1 + e2[0] * s2, z + e1[1] * s1 + e2[1] * s2) for s1, s2 in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
        cv2.fillPoly(occ, [np.array([cell(*c) for c in corners], np.float32).astype(np.int32)], 1)
        ox = x - (m["cx"] * math.cos(phi) + m["cz"] * math.sin(phi)); oz = z - (-m["cx"] * math.sin(phi) + m["cz"] * math.cos(phi))
        placed.append({"kind": "generic", "slug": slug, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(w, 1), "d": round(d, 1), "h": round(m["h"], 1),
                       "sx": 1.0, "sy": 1.0, "sz": 1.0, "bx": round(x, 1), "bz": round(z, 1), "infill": True, "port": True, "userzone": True})
        return True

    WARE = [g for g in ("ironport-distribution-center", "lakeside-parts-warehouse", "ironport-truck-depot", "ironport-self-storage", "ironworks-machine-shop", "ironworks-freight-office", "ironworks-salvage-office", "ironport-tire-center", "auto-repair-shop") if g in GEN]
    BIG = [g for g in ("ironport-distribution-center", "lakeside-parts-warehouse", "ironport-truck-depot", "ironport-self-storage") if g in GEN]
    PLANT = [g for g in ("riverside-chemical-storage", "foundry-works-hub", "ironworks-foundry") if g in GEN]
    use = {}
    def pick(pool):
        w = np.array([1.0 / (1.0 + 0.5 * use.get(g, 0)) for g in pool]); w /= w.sum(); g = pool[int(rng.choice(len(pool), p=w))]; use[g] = use.get(g, 0) + 1; return g

    # warehouse row: both sides of the lanes and the west leg of the course, fronts to the street, set well back from the walls
    streets = [[(3692, 395), (3692, 925)], [(3640, 215), (3640, 330)], [(3765, 240), (3765, 620)], [(3660, 232), (3830, 232)], [(3575, 520), (3692, 520)], [(3575, 760), (3692, 760)], [(3575, 860), (3692, 860)]]
    for a, b in streets:
        a = np.array(a, float); b = np.array(b, float); L = float(np.hypot(*(b - a))); t = (b - a) / L; nrm = np.array([-t[1], t[0]])
        for side in (-1, 1):
            pos = 20.0
            while pos < L - 20.0:
                slug = pick(BIG if rng.random() < 0.62 else WARE)
                m = GEN[slug]
                c = a + t * (pos + m["w"] / 2)
                setback = 16.0 + m["d"] / 2
                p = c + nrm * side * setback
                if put(slug, p[0], p[1], -nrm * side):
                    pos += m["w"] + 6.0
                else:
                    pos += 12.0
    # the plant's process buildings, inside the fence along its north side
    for i, x in enumerate((3885, 3940, 3995, 4050)):
        slug = pick(PLANT)
        put(slug, x, 800, (0, -1))
    print("buildings", len(placed), dict(use))

    data["items"] = items + placed
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    # the zone streets the user zones put in this area go: the district has its own lanes
    us = json.load(open(os.path.join(OUT, "user_streets.json")))
    kept = []
    for r in us["roads"]:
        mid = r["xz"][len(r["xz"]) // 2]
        if inside(PLATFORM, mid[0], mid[1]) or (3540 < mid[0] < 4150 and 120 < mid[1] < 1040):
            continue
        kept.append(r)
    print("zone streets removed", len(us["roads"]) - len(kept))
    json.dump({"roads": kept}, open(os.path.join(OUT, "user_streets.json"), "w"), separators=(",", ":"))

    json.dump({"roads": [{"kind": "paved", "xz": [list(p) for p in l], "half": 4.0} for l in LANES]}, open(os.path.join(OUT, "port_streets.json"), "w"), separators=(",", ":"))
    json.dump({"name": "Ironworks Industrial Circuit", "kind": "road_course", "xz": [list(map(float, p)) for p in COURSE]}, open(os.path.join(OUT, "industrial_circuit.json"), "w"), separators=(",", ":"))
    json.dump({"platform": {"poly": PLATFORM, "y": PLATFORM_Y}, "piers": PIERS, "ships": SHIPS, "cranes": CRANES, "containers": CONTAINER_BLOCKS, "tanks": TANKS, "pipeRack": PIPE_RACK, "flare": FLARE, "fence": FENCE},
              open(os.path.join(OUT, "port_district.json"), "w"), separators=(",", ":"))
    print("done")


if __name__ == "__main__":
    main()
