"""
Industrial yards and waterfront buildings, on both banks of the river.

The city infill zones the free land inside the city hull block by block and finds no industrial or waterfront blocks there, and the rural pass keeps 400 m clear of the city, so the
16 industrial and waterfront generics (N61-N76) were never placed. This pass puts them where they belong:
  WATERFRONT  boathouses, boat works, fuel dock, marina office, grill, ferry waiting room, bait shop, harbourside condos: in short rows along the shore, fronts to the water,
              near downtown's riverfront (both banks) and at Port Halcyon.
  INDUSTRIAL  machine shop, foundry, parts warehouse, distribution centre, truck depot, freight and salvage offices, chemical storage: in yards on flat ground back from the
              water, on the far bank (where the map has room and no streets yet) and by the Ironworks.
Land that is free is what is not water or shore, steep, a road or race course, forest, or an existing building. Items are flagged `shore` and replaced on every run.
Run after infill_city.py and infill_rural.py:  IRONPORT_PKG=public/games/forth-horizon/ironport python games/forth-horizon/tools/infill_waterfront.py
"""
import json
import math
import os
import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
import real_city as rc
import city_plan_real as cpr
import place_city as pc

OUT = os.path.join(rc.REPO, "public", "games", "forth-horizon", "region")
CELL = 6.0
rng = np.random.default_rng(777)
GEN = pc.GEN
W, H = rc.W_MAP * rc.MPP, rc.H_MAP * rc.MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
REQ = {"street": 10.2, "arterial": 13.2, "freeway": 12.5, "ramp": 6.5}
NEW = json.load(open(os.path.join(rc.HERE, "data", "new_generics_roster.json")))
ids = lambda lo, hi: [s for s, v in NEW.items() if v["id"][0] == "N" and lo <= int(v["id"][1:]) <= hi and s in GEN]
N_IND, N_WATER = ids(61, 68), ids(69, 76)
WATER_FRONT = [g for g in N_WATER if g not in ("harborview-condos",)]            # the condos are the one tall waterfront building: a few, not a row
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)


def main():
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = [it for it in data["items"] if not it.get("shore")]
    reg = json.load(open(os.path.join(OUT, "region.json")))
    hf = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
    h = np.repeat(np.repeat(hf, 2, 0), 2, 1)[:NZ, :NX]
    gy, gx = np.gradient(hf)
    slope = np.repeat(np.repeat(np.hypot(gx, gy) / rc.MPP, 2, 0), 2, 1)[:NZ, :NX]
    water = h < 2.0
    dist_w = ndi.distance_transform_edt(~water) * CELL                         # metres from the water, over land
    gwy, gwx = np.gradient(ndi.gaussian_filter(dist_w, 2.0))                     # points away from the water

    occ = np.zeros((NZ, NX), np.uint8)
    occ[water | (slope > 0.13) | (dist_w < 10.0)] = 1                           # not in the water, not on a steep bank, not at the very edge
    occ[:35, :] = 1; occ[-35:, :] = 1; occ[:, :35] = 1; occ[:, -35:] = 1

    def poly_to_cells(p):
        return np.array([cell(*q) for q in p], np.float32).astype(np.int32)

    # roads: the city streets by class, the highways, the race courses
    for s in rc.streets_world():
        wpx = int(math.ceil(2 * REQ[cpr.classify(s["name"])] / CELL)) + 1
        cv2.polylines(occ, [poly_to_cells(s["pts"])], False, 1, wpx)
    for key, wpx in (("coastal_highway", 7), ("freeway", 9)):
        cv2.polylines(occ, [poly_to_cells(reg[key]["xz"])], False, 1, wpx)
    for c in reg["circuits"].values():
        cv2.polylines(occ, [poly_to_cells(c["xz"])], False, 1, 28)
    trees = np.zeros((NZ, NX), np.uint8)
    for x, z, *_ in json.load(open(os.path.join(OUT, "forest.json"))):
        ci, cj = int((x - X0) / CELL), int((z - Z0) / CELL)
        if 0 <= ci < NX and 0 <= cj < NZ:
            trees[cj, ci] = 1
    occ = np.maximum(occ, cv2.dilate(trees, np.ones((5, 5), np.uint8)))

    def rect_pts(cx, cz, w, d, e1, e2, grow):
        return [(cx + e1[0] * sx * (w / 2 + grow) + e2[0] * sz * (d / 2 + grow), cz + e1[1] * sx * (w / 2 + grow) + e2[1] * sz * (d / 2 + grow)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]

    for it in items:
        phi = it["rotY"]
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        cv2.fillPoly(occ, [poly_to_cells(rect_pts(it["bx"], it["bz"], it["w"], it["d"] + 2.5, e1, e2, 3.0))], 1)

    placed, use = [], {}
    zones = []                                                                       # the named zones this pass creates: a paved outline per yard or shore row

    def zone_hull(first, name, kind, bank):
        """the outline of the buildings placed since `first`, pushed out 7 m: the paved pad of the yard or the quay strip of the row"""
        pts = []
        for it in placed[first:]:
            phi = it["rotY"]
            e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
            pts += rect_pts(it["bx"], it["bz"], it["w"], it["d"], e1, e2, 2.0)
        hull = cv2.convexHull(np.array(pts, np.float32))[:, 0, :]
        c = hull.mean(0)
        out = []
        for q in hull:
            v = q - c; n = float(np.hypot(*v)) or 1.0
            out.append([round(float(q[0] + v[0] / n * 7.0), 1), round(float(q[1] + v[1] / n * 7.0), 1)])
        zones.append({"id": f"{kind}-{len(zones) + 1}", "name": name, "kind": kind, "bank": bank, "center": [round(float(c[0]), 1), round(float(c[1]), 1)], "hull": out, "buildings": len(placed) - first})

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

    def put(slug, x, z, face, scale=1.0, jitter=0.0, zone="industrial"):
        m = GEN[slug]
        phi = math.atan2(face[0], face[1]) + jitter
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        w, d = m["w"] * scale, m["d"] * scale
        if not rect_free(x, z, w, d, e1, e2):
            return False
        cv2.fillPoly(occ, [poly_to_cells(rect_pts(x, z, w, d + 2.5, e1, e2, 3.0))], 1)
        bcx, bcz = m["cx"] * scale, m["cz"] * scale
        ox = x - (bcx * math.cos(phi) + bcz * math.sin(phi))
        oz = z - (-bcx * math.sin(phi) + bcz * math.cos(phi))
        placed.append({"kind": "generic", "slug": slug, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(w, 1), "d": round(d, 1), "h": round(m["h"] * scale, 1),
                       "sx": round(scale, 3), "sy": round(scale, 3), "sz": round(scale, 3), "bx": round(x, 1), "bz": round(z, 1), "infill": True, "shore": True, "zone": zone})
        use[slug] = use.get(slug, 0) + 1
        return True

    def pick(pool):
        w = np.array([1.0 / (1.0 + use.get(g, 0) * 0.25) for g in pool]); w /= w.sum()
        return pool[int(rng.choice(len(pool), p=w))]

    places = {p["name"]: p["xz"] for p in reg["places"]}
    ph = places.get("Port Halcyon", [-6216, 3072]); dt = places.get("Downtown Ironport", [5904, 852])

    # ------------- waterfront: short rows along the shore, fronts to the water
    def toward_water(ci, cj):
        gxv, gzv = gwx[cj, ci], gwy[cj, ci]
        n = math.hypot(gxv, gzv) or 1.0
        return (-gxv / n, -gzv / n)                                  # world x is the column direction, z the row direction

    shore = np.argwhere((dist_w > 18) & (dist_w < 45) & (occ == 0))
    rng.shuffle(shore)
    sites = []
    for cj, ci in shore:
        x, z = X0 + (ci + 0.5) * CELL, Z0 + (cj + 0.5) * CELL
        near_dt = math.hypot(x - dt[0], z - dt[1]) < 3600 and 3000 < x < 6800
        near_ph = math.hypot(x - ph[0], z - ph[1]) < 2200
        if not (near_dt or near_ph) or any((x - a) ** 2 + (z - b) ** 2 < 130.0 ** 2 for a, b in sites):
            continue
        face = toward_water(ci, cj)
        along = (-face[1], face[0])
        got = 0
        n0 = len(placed)
        pos = -26.0
        for _ in range(int(rng.integers(2, 5))):
            g = pick(WATER_FRONT if rng.random() > 0.12 else N_WATER)
            m = GEN[g]
            pos += m["w"] / 2 + 2.0
            if put(g, x + along[0] * pos, z + along[1] * pos, face, float(rng.uniform(0.95, 1.08)), 0.0, "waterfront"):
                got += 1
            pos += m["w"] / 2 + 6.0
        if got:
            sites.append((x, z))
            bank = "halcyon" if near_ph else ("far" if x < 4600 else "east")
            nm = {"halcyon": ["Port Halcyon Marina", "Halcyon Boathouse Row", "Lakeshore Landing"], "far": ["Far Bank Landing", "Westshore Boat Works", "Kettle Quay"], "east": ["Riverfront Marina Row", "Ferry Landing", "Boathouse Row"]}[bank]
            zone_hull(n0, f"{nm[len(sites) % 3]} {len([z_ for z_ in zones if z_['kind'] == 'waterfront']) + 1}", "waterfront", bank)
        if len(sites) >= 34:
            break
    print("waterfront rows", len(sites), "buildings", len(placed))

    # ------------- industrial yards on flat ground back from the water
    n_wf = len(placed)
    clear = ndi.distance_transform_edt(occ == 0) * CELL
    ironworks = next((it for it in items if it["slug"] == "ironworks-ruins"), None)
    cand = np.argwhere((clear > 34.0) & (dist_w > 60.0) & (dist_w < 520.0))
    rng.shuffle(cand)
    yards = []
    for cj, ci in cand:
        x, z = X0 + (ci + 0.5) * CELL, Z0 + (cj + 0.5) * CELL
        far_bank = 2200 < x < 4500 and -2100 < z < 2400                                   # across the river: room, and no streets yet
        by_iw = ironworks is not None and math.hypot(x - ironworks["x"], z - ironworks["z"]) < 1500
        if not (far_bank or by_iw) or any((x - a) ** 2 + (z - b) ** 2 < 330.0 ** 2 for a, b in yards):
            continue
        face = toward_water(ci, cj)
        face = (-face[0], -face[1]) if False else face
        n0 = len(placed)
        got = 0
        order = [pick(N_IND) for _ in range(int(rng.integers(3, 7)))]
        for k, g in enumerate(order):
            for _try in range(6):
                ang = float(rng.uniform(0, 2 * math.pi)); r = float(rng.uniform(16, 54)) + k * 5
                px, pz = x + math.cos(ang) * r, z + math.sin(ang) * r
                if put(g, px, pz, (-math.cos(ang), -math.sin(ang)), float(rng.uniform(0.92, 1.08)), float(rng.normal(0, 0.08)), "industrial"):
                    got += 1
                    break
        if got < 2:
            del placed[n0:]
            continue
        yards.append((x, z))
        bank = "far" if far_bank else "east"
        nm = {"far": ["Far Bank Works", "Westshore Yard", "Kettle Rail Yard"], "east": ["Ironworks Yard", "Foundry Row", "Rivergate Depot"]}[bank]
        zone_hull(n0, f"{nm[len(yards) % 3]} {len([z_ for z_ in zones if z_['kind'] == 'industrial']) + 1}", "industrial", bank)
        if len(yards) >= 28:
            break
    print("industrial yards", len(yards), "buildings", len(placed) - n_wf)

    data["items"] = items + placed
    data["notes"]["shore"] = len(placed)
    json.dump({"zones": zones}, open(os.path.join(OUT, "zones.json"), "w"))
    print("zones", len(zones), "by kind", {k: sum(1 for z_ in zones if z_["kind"] == k) for k in ("industrial", "waterfront")}, "far bank:", sum(1 for z_ in zones if z_["bank"] == "far"))
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    print("shore buildings", len(placed), "by model", dict(sorted(use.items(), key=lambda kv: -kv[1])))
    print("total", len(data["items"]))


if __name__ == "__main__":
    main()
