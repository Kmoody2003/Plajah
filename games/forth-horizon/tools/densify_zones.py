"""
Fill the empty ground inside the zones the developer drew, so blocks are built up the way their kind of place is: no big empty block interiors.

  residential  houses on a lattice behind the street fronts, each facing the nearest street (second rows, corner lots), until the blocks are full
  dense        mid-rise flats, offices and shops filling the block interiors around the core and toward the edges
  industrial   warehouses, depots, workshops and works packed in rows along every lane, big sheds first, small buildings in the gaps (a working industrial district is dense)
Candidates are placed on a lattice over the zone, nearest street first; a building needs a street within 16-75 m to face (access is finished by access_and_parking.py, which cuts the driveway and
the parking lot). Nothing goes on a road, water, steep ground or another building. Items are flagged `userzone` + `densified`; re-running replaces them.
Run after detail_zones.py:  IRONPORT_PKG=public/games/forth-horizon/ironport python games/forth-horizon/tools/densify_zones.py
"""
import json
import math
import os
import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
import real_city as rc
import place_city as pc

OUT = os.path.join(rc.REPO, "public", "games", "forth-horizon", "region")
GEN = pc.GEN
MPP = rc.MPP
CELL = 4.0
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
rng = np.random.default_rng(7777)
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)
ok = lambda *n: [x for x in n if x in GEN]
PRIORITY = ["farmland", "parkland", "residential", "waterfront", "industrial", "dense", "commercial", "civic"]

RES = ok("colonial-house", "craftsman-bungalow", "ranch-house", "brick-ranch-house", "cape-cod-house", "split-level-house", "tudor-house", "williamsburg-colonial", "duplex", "maple-triplex", "townhouse-row")
DENSE = ok("mixed-use-block", "townhouse-row", "rose-garden-apartments", "sibley-apartments", "monroe-residences", "brush-park-lofts", "eastern-market-flats", "milwaukee-junction-lofts", "trumbull-arms", "adams-corner-condos", "brick-office-block", "corner-office", "cass-avenue-offices", "larned-loft-offices")
SHOPS = ok("corner-grocery", "neighborhood-pharmacy", "coffee-shop", "neighborhood-diner", "maple-hardware-store", "corner-crust-bakery", "barber-shop", "spin-cycle-laundromat")
IND_BIG = ok("ironport-distribution-center", "lakeside-parts-warehouse", "ironport-truck-depot", "ironport-self-storage", "ironworks-foundry", "foundry-works-hub", "riverside-chemical-storage")
IND_SMALL = ok("ironworks-machine-shop", "ironworks-freight-office", "ironworks-salvage-office", "ironport-tire-center", "auto-repair-shop", "equipment-shed", "pump-house", "splash-car-wash")


def load(fn):
    p = os.path.join(OUT, fn)
    return json.load(open(p)) if os.path.exists(p) else None


def main():
    um = load("user_map.json")
    zones = [f for f in um["features"] if f["type"] == "zone"]
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = [it for it in data["items"] if not it.get("densified")]
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(OUT, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    hg = cv2.resize(hi, (NX, NZ), interpolation=cv2.INTER_AREA)
    gy, gx = np.gradient(ndi.gaussian_filter(hg, 1.0)); slope = np.hypot(gx, gy) / CELL
    water = hg < 2.5
    dist_w = ndi.distance_transform_edt(~water) * CELL

    kid = {k: i + 1 for i, k in enumerate(PRIORITY)}
    mask = np.zeros((NZ, NX), np.uint8)
    for k in PRIORITY:
        for f in zones:
            if f["kind"] == k:
                cv2.fillPoly(mask, [np.array([cell(*p) for p in f["pts"]], np.float32).astype(np.int32)], kid[k])
    occ = np.zeros((NZ, NX), np.uint8)
    occ[water | (slope > 0.2) | (dist_w < 18)] = 1

    # roads (every road set), as streets to face and as blocked ground
    lines = []
    def add(pts, half):
        pts = np.array(pts, float)
        if len(pts) < 2: return
        cv2.polylines(occ, [np.array([cell(*q) for q in pts], np.float32).astype(np.int32)], False, 1, max(1, int((2 * half + 3) / CELL) + 1))
        lines.append((pts, half))
    for s in rc.streets_world(): add(s["pts"], 9)
    reg = load("region.json")
    add(reg["coastal_highway"]["xz"], 8); add(reg["freeway"]["xz"], 11)
    for c in reg["circuits"].values(): add(c["xz"], 9)
    for fn in ("country_roads.json", "user_streets.json", "port_streets.json", "utility_streets.json"):
        j = load(fn)
        if j:
            for r in j["roads"]: add(r["xz"], r.get("half", 3.8))
    ic = load("industrial_circuit.json")
    if ic: add(ic["xz"] + [ic["xz"][0]], 12)
    pd = load("port_district.json")
    def fillpoly(pts, v=1): cv2.fillPoly(occ, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], v)
    if pd: fillpoly([tuple(p) for p in pd["platform"]["poly"]])                       # the port district is planned, not densified
    pk = load("parking_lots.json") or []
    for x, z, w, d, rot in pk:
        e1 = (math.cos(rot), -math.sin(rot)); e2 = (math.sin(rot), math.cos(rot))
        fillpoly([(x + e1[0] * a + e2[0] * b, z + e1[1] * a + e2[1] * b) for a, b in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))])

    def rect_pts(cx, cz, w, d, e1, e2, grow=0.0):
        hw, hd = w / 2 + grow, d / 2 + grow
        return [(cx + e1[0] * a + e2[0] * b, cz + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
    for it in items:
        phi = it["rotY"]; e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        fillpoly(rect_pts(it["bx"], it["bz"], it["w"], it["d"], e1, e2, 2.0))
    P, PI = [], []
    for i, (pts, half) in enumerate(lines):
        for a, b in zip(pts[:-1], pts[1:]):
            L = float(np.hypot(*(b - a)))
            for t in np.arange(0, L, 8.0): P.append(a + (b - a) * t / max(L, 1e-6)); PI.append(i)
    P = np.array(P); tree = cKDTree(P)

    placed, use = [], {}
    def pick(pool):
        w = np.array([1.0 / (1.0 + 0.25 * use.get(g, 0) / 8.0) for g in pool]); w /= w.sum(); g = pool[int(rng.choice(len(pool), p=w))]; use[g] = use.get(g, 0) + 1; return g
    def free(x, z, w, d, e1, e2, margin=1.0):
        hw, hd = w / 2 + margin, d / 2 + margin
        a = np.linspace(-hw, hw, max(int(math.ceil(hw * 2 / CELL)), 2) + 1); b = np.linspace(-hd, hd, max(int(math.ceil(hd * 2 / CELL)), 2) + 1)
        A, B = np.meshgrid(a, b)
        ci = ((x + e1[0] * A + e2[0] * B - X0) / CELL).astype(int); cj = ((z + e1[1] * A + e2[1] * B - Z0) / CELL).astype(int)
        if ci.min() < 0 or cj.min() < 0 or ci.max() >= NX or cj.max() >= NZ: return False
        return not occ[cj, ci].any()
    def put(slug, x, z, face):
        m = GEN[slug]; phi = math.atan2(face[0], face[1])
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        if not free(x, z, m["w"], m["d"], e1, e2): return False
        fillpoly(rect_pts(x, z, m["w"], m["d"], e1, e2, 2.0))
        ox = x - (m["cx"] * math.cos(phi) + m["cz"] * math.sin(phi)); oz = z - (-m["cx"] * math.sin(phi) + m["cz"] * math.cos(phi))
        placed.append({"kind": "generic", "slug": slug, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(m["w"], 1), "d": round(m["d"], 1), "h": round(m["h"], 1),
                       "sx": 1.0, "sy": 1.0, "sz": 1.0, "bx": round(x, 1), "bz": round(z, 1), "infill": True, "userzone": True, "densified": True})
        return True

    counts = {}
    for f in zones:
        k = f["kind"]
        if k not in ("residential", "dense", "industrial"): continue
        poly = np.array(f["pts"], np.float32)
        x0, z0 = poly.min(axis=0); x1, z1 = poly.max(axis=0)
        step = {"residential": 17.0, "dense": 20.0, "industrial": 22.0}[k]
        cand = [(x, z) for x in np.arange(x0, x1, step) for z in np.arange(z0, z1, step)]
        rng.shuffle(cand)
        n = 0
        for x, z in cand:
            x += rng.uniform(-step / 3, step / 3); z += rng.uniform(-step / 3, step / 3)
            ci, cj = int((x - X0) / CELL), int((z - Z0) / CELL)
            if not (0 <= ci < NX and 0 <= cj < NZ) or mask[cj, ci] != kid[k] or occ[cj, ci]: continue
            d, j = tree.query([x, z])
            if d < 14.0 or d > {"residential": 42.0, "dense": 48.0, "industrial": 58.0}[k]: continue
            to = P[j] - np.array([x, z]); face = to / (np.hypot(*to) or 1.0)
            if k == "residential": slug = pick(RES)
            elif k == "dense": slug = pick(DENSE + (SHOPS if rng.random() < 0.15 else []))
            else: slug = pick(IND_BIG if rng.random() < 0.55 else IND_SMALL)
            if put(slug, x, z, face): n += 1
        counts[k] = counts.get(k, 0) + n
    print("densified", counts, "total", len(placed))
    data["items"] = items + placed
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    print("items", len(data["items"]))


if __name__ == "__main__":
    main()
