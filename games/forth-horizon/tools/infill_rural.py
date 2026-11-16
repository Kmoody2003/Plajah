"""
Fill the countryside with farms and hamlets, with the same kind of zoning the city infill uses.

The city infill (infill_city.py) zones the free land inside the city hull block by block. This does the same for the land outside it:
  FARMLAND   flat, open land (not water, shore, slope, forest, road, race course, or the city hull): a farmstead per site, spaced apart. A farmstead is a farmhouse, one or two
             barns, a silo, and a few outbuildings around a yard, all facing the yard, no two neighbouring farms the same.
  HAMLET     now and then beside a road: a country church, a general store, a one-room school, a farm stand or cider mill, and a few houses in a row facing the road.
Models come from the generic set (the farm and rural models); downtown models are not used here.
Run after infill_city.py:  IRONPORT_PKG=public/games/forth-horizon/ironport python games/forth-horizon/tools/infill_rural.py
Items are appended to city.json flagged rural, and replaced on every run, so it is safe to rerun.
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
CELL = 6.0
rng = np.random.default_rng(2026)
GEN = pc.GEN
W, H = rc.W_MAP * rc.MPP, rc.H_MAP * rc.MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2

HOUSES = [g for g in ("farmhouse", "farmhouse", "farmhouse", "modern-farmhouse") if g in GEN]
BARNS = [g for g in ("classic-red-barn", "dairy-barn", "hay-barn", "horse-stable") if g in GEN]
OUTB = {g: w for g, w in (("equipment-shed", 3.0), ("tractor-shed", 2.5), ("farm-workshop", 1.5), ("corn-crib", 1.5), ("chicken-coop", 1.2), ("greenhouse", 0.9), ("farm-stand", 0.5)) if g in GEN}
TALL = {g: p for g, p in (("grain-silo-twin", 0.55), ("water-tower-rural", 0.2), ("windmill", 0.28)) if g in GEN}
HAMLET_CORE = [g for g in ("country-church", "rural-general-store", "one-room-schoolhouse", "cider-mill", "farm-stand") if g in GEN]
HAMLET_HOMES = [g for g in ("colonial-house", "craftsman-bungalow", "farmhouse", "ranch-house", "tudor-house") if g in GEN]


def cell(x, z):
    return ((x - X0) / CELL, (z - Z0) / CELL)


def main():
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = [it for it in data["items"] if not it.get("rural")]
    reg = json.load(open(os.path.join(OUT, "region.json")))
    hf = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
    h = np.repeat(np.repeat(hf, 2, 0), 2, 1)[:NZ, :NX]
    gy, gx = np.gradient(hf)
    slope = np.repeat(np.repeat(np.hypot(gx, gy) / rc.MPP, 2, 0), 2, 1)[:NZ, :NX]

    occ = np.zeros((NZ, NX), np.uint8)
    occ[(h < 2.0) | (slope > 0.14)] = 1
    occ = np.maximum(occ, cv2.dilate((h < 2.0).astype(np.uint8), np.ones((11, 11), np.uint8)))        # 30 m off the water
    occ[:35, :] = 1; occ[-35:, :] = 1; occ[:, :35] = 1; occ[:, -35:] = 1                                # the region's edge

    def fill_poly(grid, pts, val=1):
        cv2.fillPoly(grid, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], val)

    def rect_pts(cx, cz, w, d, e1, e2, grow):
        out = []
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            out.append((cx + e1[0] * sx * (w / 2 + grow) + e2[0] * sz * (d / 2 + grow), cz + e1[1] * sx * (w / 2 + grow) + e2[1] * sz * (d / 2 + grow)))
        return out

    # the city: its hull, plus a 400 m margin, belongs to the city infill
    base = [it for it in items if not it.get("infill")]
    pts = np.array([(it.get("bx", it["x"]), it.get("bz", it["z"])) for it in items], np.float32)
    hull = cv2.convexHull(pts)[:, 0, :]
    hull_m = np.zeros((NZ, NX), np.uint8)
    cv2.fillPoly(hull_m, [np.array([cell(*p) for p in hull], np.float32).astype(np.int32)], 1)
    occ = np.maximum(occ, cv2.dilate(hull_m, np.ones((133, 133), np.uint8)))                            # 400 m margin

    # race courses and roads
    roads = []
    for key in ("coastal_highway", "freeway"):
        roads.append(np.array(reg[key]["xz"], np.float32))
    for key, wpx in (("coastal_highway", 3), ("freeway", 4)):                                  # a 36 to 48 m corridor: buildings keep off the carriageway
        p = np.array([cell(*q) for q in reg[key]["xz"]], np.float32).astype(np.int32)
        cv2.polylines(occ, [p], False, 1, wpx * 2)
    for cn, c in reg["circuits"].items():
        p = np.array([cell(*q) for q in c["xz"]], np.float32).astype(np.int32)
        cv2.polylines(occ, [p], False, 1, 28)                                                               # 80 m either side
    # trees: the forest is not farmland
    for x, z, *_ in json.load(open(os.path.join(OUT, "forest.json"))):
        ci, cj = int((x - X0) / CELL), int((z - Z0) / CELL)
        if 0 <= ci < NX and 0 <= cj < NZ:
            occ[cj, ci] = 2
    trees = (occ == 2).astype(np.uint8)
    occ = np.maximum((occ > 0).astype(np.uint8), cv2.dilate(trees, np.ones((5, 5), np.uint8)))
    # existing buildings
    for it in items:
        phi = it["rotY"]
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        fill_poly(occ, rect_pts(it["bx"], it["bz"], it["w"], it["d"] + 2.5, e1, e2, 4.0))
    print("free fraction", round(float((occ == 0).mean()), 3))

    # road finder for orientation and hamlets
    rp = []
    for r in roads:
        for a, b in zip(r[:-1], r[1:]):
            L = float(np.hypot(*(b - a))) or 1.0
            n = max(int(L / 20), 1)
            for t in range(n + 1):
                rp.append(a + (b - a) * t / n)
    rp = np.array(rp)
    rtree = cKDTree(rp)

    placed = []
    use = {}

    def rect_free(x, z, w, d, e1, e2, margin=1.5):
        hw, hd = w / 2 + margin, d / 2 + margin
        a = np.linspace(-hw, hw, max(int(math.ceil(hw * 2 / CELL)), 2) + 1)
        b = np.linspace(-hd, hd, max(int(math.ceil(hd * 2 / CELL)), 2) + 1)
        A, B = np.meshgrid(a, b)
        ci = ((x + e1[0] * A + e2[0] * B - X0) / CELL).astype(int)
        cj = ((z + e1[1] * A + e2[1] * B - Z0) / CELL).astype(int)
        if ci.min() < 0 or cj.min() < 0 or ci.max() >= NX or cj.max() >= NZ:
            return False
        return not occ[cj, ci].any()

    def put(slug, x, z, face, scale=1.0, jitter=0.0):
        """place a model with its centre at x,z and its front towards `face` (a unit vector); False if it does not fit"""
        m = GEN[slug]
        phi = math.atan2(face[0], face[1]) + jitter
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        w, d = m["w"] * scale, m["d"] * scale
        if not rect_free(x, z, w, d, e1, e2):
            return False
        fill_poly(occ, rect_pts(x, z, w, d + 2.5, e1, e2, 3.0))
        bcx, bcz = m["cx"] * scale, m["cz"] * scale
        ox = x - (bcx * math.cos(phi) + bcz * math.sin(phi))
        oz = z - (-bcx * math.sin(phi) + bcz * math.cos(phi))
        placed.append({"kind": "generic", "slug": slug, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(w, 1), "d": round(d, 1), "h": round(m["h"] * scale, 1),
                       "sx": round(scale, 3), "sy": round(scale, 3), "sz": round(scale, 3), "bx": round(x, 1), "bz": round(z, 1), "infill": True, "rural": True})
        use[slug] = use.get(slug, 0) + 1
        return True

    def wpick(table, avoid=()):
        keys = list(table)
        wts = np.array([table[k] / (1.0 + 0.35 * use.get(k, 0) / 12.0) for k in keys])        # the more a model is already used, the less likely
        wts = wts / wts.sum()
        return keys[int(rng.choice(len(keys), p=wts))]

    # ---------------- farmsteads ----------------
    clear = ndi.distance_transform_edt(occ == 0) * CELL                                     # metres to the nearest blocked cell
    free_idx = np.argwhere(clear > 30.0)
    rng.shuffle(free_idx)
    farms = []
    for cj, ci in free_idx:
        x, z = X0 + (ci + 0.5) * CELL, Z0 + (cj + 0.5) * CELL
        if any((x - fx) ** 2 + (z - fz) ** 2 < 520.0 ** 2 for fx, fz in farms):
            continue
        dr, k = rtree.query([x, z])
        if dr > 1400.0:
            continue
        front = rp[k] - np.array([x, z])
        front = front / (np.hypot(*front) or 1.0)
        side = np.array([-front[1], front[0]])
        n0 = len(placed)
        house = wpick({g: 1.0 for g in HOUSES}) if HOUSES else None
        # house nearest the lane, the yard behind it, the barn across the yard
        ok = house and put(house, x + front[0] * 14, z + front[1] * 14, front, float(rng.uniform(0.95, 1.12)))
        if not ok:
            del placed[n0:]
            continue
        yard = (x - front[0] * 6, z - front[1] * 6)
        nb = 1 if rng.random() < 0.65 else 2
        for b in range(nb):
            slug = wpick({g: 1.0 for g in BARNS})
            sgn = -1 if b == 0 else 1
            for dist in (30, 38, 46):
                bx, bz = yard[0] + side[0] * sgn * (dist + 4 * b) - front[0] * 8, yard[1] + side[1] * sgn * (dist + 4 * b) - front[1] * 8
                if put(slug, bx, bz, -side * sgn, float(rng.uniform(0.95, 1.15)), float(rng.normal(0, 0.05))):
                    break
        for g, p in TALL.items():
            if rng.random() < p:
                ang = float(rng.uniform(0, 2 * math.pi)); r = float(rng.uniform(26, 44))
                put(g, yard[0] + math.cos(ang) * r, yard[1] + math.sin(ang) * r, (-math.cos(ang), -math.sin(ang)), float(rng.uniform(0.95, 1.1)))
        for _ in range(int(rng.integers(2, 6))):
            g = wpick(OUTB)
            for _try in range(4):
                ang = float(rng.uniform(0, 2 * math.pi)); r = float(rng.uniform(20, 42))
                if put(g, yard[0] + math.cos(ang) * r, yard[1] + math.sin(ang) * r, (-math.cos(ang), -math.sin(ang)), float(rng.uniform(0.9, 1.15)), float(rng.normal(0, 0.1))):
                    break
        farms.append((x, z))
        if len(farms) >= 95:
            break
    print("farmsteads", len(farms), "buildings", len(placed))

    # ---------------- hamlets ----------------
    n_farm_items = len(placed)
    hamlets = 0
    clear2 = ndi.distance_transform_edt(occ == 0) * CELL
    cand = np.argwhere(clear2 > 22.0)
    rng.shuffle(cand)
    hx = []
    for cj, ci in cand:
        if hamlets >= 9:
            break
        x, z = X0 + (ci + 0.5) * CELL, Z0 + (cj + 0.5) * CELL
        dr, k = rtree.query([x, z])
        if not (22.0 < dr < 70.0) or any((x - a) ** 2 + (z - b) ** 2 < 1800.0 ** 2 for a, b in hx):
            continue
        # the road's direction here: the hamlet is a row of buildings facing it
        j0, j1 = max(k - 2, 0), min(k + 2, len(rp) - 1)
        t = rp[j1] - rp[j0]; t = t / (np.hypot(*t) or 1.0)
        nrm = np.array([-t[1], t[0]])
        if np.dot(np.array([x, z]) - rp[k], nrm) < 0:
            nrm = -nrm
        front = -nrm
        n0 = len(placed)
        order = list(HAMLET_CORE); rng.shuffle(order)
        row = [g for g in order[:4]] + [wpick({g: 1.0 for g in HAMLET_HOMES}) for _ in range(int(rng.integers(3, 6)))]
        rng.shuffle(row)
        pos = -len(row) * 11.0
        got = 0
        for g in row:
            m = GEN[g]
            pos += m["w"] / 2 + 3.0
            px, pz = x + t[0] * pos, z + t[1] * pos
            if put(g, px, pz, front, float(rng.uniform(0.95, 1.1))):
                got += 1
            pos += m["w"] / 2 + 5.0
        if got < 4:
            del placed[n0:]
            continue
        hx.append((x, z)); hamlets += 1
    print("hamlets", hamlets, "buildings", len(placed) - n_farm_items)

    data["items"] = items + placed
    data["notes"]["rural"] = len(placed)
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    print("rural buildings", len(placed), "by model", dict(sorted(use.items(), key=lambda kv: -kv[1])))
    print("total", len(data["items"]))


if __name__ == "__main__":
    main()
