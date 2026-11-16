"""
Seed the riverside with working facilities, then audit every generated building against the roads, the ground and each other.

SEED   Along both banks of the river, outside the port and the towns: warehouses, grain elevators, boat works, marinas, self-storage, truck depots and chemical stores, set back 30 m or more from
       the water on flat ground, fronts to the nearest street if there is one within 120 m, otherwise square to the shore. Spaced out, a few in a row, never on a road or on top of another building.
AUDIT  Every generated building (infill, rural, shore, zone, sprawl, port) is checked:
         on a road or its verge        -> removed
         on ground steeper than 0.20 or with more than 3 m of relief under it, or in the water    -> removed
         overlapping another building  -> removed (the first one kept)
         fronting the wrong way: if a street runs within 70 m and the front is turned more than 35 degrees from it, it is turned to face the street (when it still fits)
       The city's own buildings (heroes, the plan's generics) are never touched.
Reports counts. Run last, after the infill tools:  IRONPORT_PKG=public/games/forth-horizon/ironport python games/forth-horizon/tools/audit_and_seed.py
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
GEN = pc.GEN
MPP = rc.MPP
CELL = 4.0
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)
rng = np.random.default_rng(2468)
GENERATED = ("infill", "rural", "shore", "userzone", "sprawl", "port", "farbank")
REQ = {"street": 10.2, "arterial": 13.2, "freeway": 12.5, "ramp": 6.5}


def load(fn):
    p = os.path.join(OUT, fn)
    return json.load(open(p)) if os.path.exists(p) else None


def main():
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = data["items"]
    reg = load("region.json")
    # terrain from the 6 m grid
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(OUT, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    hg = cv2.resize(hi, (NX, NZ), interpolation=cv2.INTER_AREA)
    gy, gx = np.gradient(ndi.gaussian_filter(hg, 1.0))
    slope = np.hypot(gx, gy) / CELL
    water = hg < 2.5
    dist_w = ndi.distance_transform_edt(~water) * CELL

    # ---- roads: rasterised with their half widths, and sampled for "nearest street" lookups ----
    road = np.zeros((NZ, NX), np.uint8)
    samples, dirs = [], []
    def add_road(pts, half):
        pts = np.array(pts, float)
        if len(pts) < 2: return
        cv2.polylines(road, [np.array([cell(*q) for q in pts], np.float32).astype(np.int32)], False, 1, max(1, int((2 * half + 2.0) / CELL)))
        for a, b in zip(pts[:-1], pts[1:]):
            L = float(np.hypot(*(b - a)))
            if L < 1e-3: continue
            d = (b - a) / L
            for t in np.arange(0, L, 8.0):
                samples.append(a + d * t); dirs.append(d)
    for s in rc.streets_world():
        add_road(s["pts"], REQ[cpr.classify(s["name"])])
    add_road(reg["coastal_highway"]["xz"], 6.4); add_road(reg["freeway"]["xz"], 10)
    for c in reg["circuits"].values(): add_road(c["xz"], 7.5)
    for fn, half in (("country_roads.json", 3.8), ("user_streets.json", 4.2), ("port_streets.json", 4.5)):
        j = load(fn)
        if j:
            for r in j["roads"]: add_road(r["xz"], r.get("half", half))
    for fn in ("industrial_circuit.json",):
        j = load(fn)
        if j: add_road(j["xz"] + [j["xz"][0]], 12.0)
    j = load("shoreline_highway.json")
    if j: add_road(j["xz"], 9.0)
    um = load("user_map.json")
    if um:
        for f in um["features"]:
            if f["type"] == "road" and f["kind"] != "creek":
                add_road(f["pts"], {"highway": 9.0, "avenue": 6.0, "dirt": 3.5}.get(f["kind"], 4.2))
    samples = np.array(samples); dirs = np.array(dirs)
    stree = cKDTree(samples)
    # the port platform and tank farm are not for generated buildings except the ones planned there
    print("road cells", int(road.sum()), "street samples", len(samples))

    def corners(it, grow=0.0):
        phi = it["rotY"]; e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        hw, hd = it["w"] / 2 + grow, it["d"] / 2 + grow
        return [(it["bx"] + e1[0] * a + e2[0] * b, it["bz"] + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]

    def raster(pts, val=1, grid=None):
        m = np.zeros((NZ, NX), np.uint8) if grid is None else grid
        cv2.fillPoly(m, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], val)
        return m

    def footprint_cells(it, grow=0.0):
        pts = np.array([cell(*p) for p in corners(it, grow)], np.float32)
        x0, z0 = int(max(pts[:, 0].min() - 1, 0)), int(max(pts[:, 1].min() - 1, 0))
        x1, z1 = int(min(pts[:, 0].max() + 2, NX)), int(min(pts[:, 1].max() + 2, NZ))
        if x1 <= x0 or z1 <= z0: return None
        m = np.zeros((z1 - z0, x1 - x0), np.uint8)
        cv2.fillPoly(m, [(pts - [x0, z0]).astype(np.int32)], 1)
        return z0, z1, x0, x1, m > 0

    # ---- seed the riverside ----
    ownocc = np.zeros((NZ, NX), np.uint8)
    for it in items:
        if it.get("kind") != "generic" and it.get("kind") != "hero" and "bx" not in it: continue
        if it.get("kind") == "hero" or not any(it.get(k) for k in GENERATED):
            raster(corners(it, 3.0), 1, ownocc)
    zones = load("zones.json")["zones"]
    for z in zones: raster([tuple(p) for p in z["hull"]], 1, ownocc)                # the waterfront and industrial pads from earlier passes keep their own buildings
    # the port platform
    pd = load("port_district.json")
    if pd: raster([tuple(p) for p in pd["platform"]["poly"]], 1, ownocc)
    # parkland and farmland the developer drew are left alone; so is each marked town
    if um:
        for f in um["features"]:
            if f["type"] == "zone" and f["kind"] in ("parkland", "dense", "residential", "waterfront", "industrial"):
                raster([tuple(p) for p in f["pts"]], 1, ownocc)
    riverside = (dist_w > 34) & (dist_w < 150) & (slope < 0.10) & (~water) & (ownocc == 0) & (road == 0)
    # only along the river, not the lake: the river is the water body east of x = -3000
    xs = (np.arange(NX) * CELL + X0)[None, :]
    riverside &= xs > -3000
    ys, xs_i = np.nonzero(riverside)
    order = rng.permutation(len(ys))
    FAC = [g for g in ("lakeside-parts-warehouse", "ironport-distribution-center", "ironport-self-storage", "ironport-truck-depot", "harbor-boat-works", "marina-fuel-dock", "otter-creek-grain-elevator", "riverside-chemical-storage",
                      "ironworks-machine-shop", "ironworks-salvage-office", "ironworks-freight-office", "ironport-tire-center", "harbor-boathouse", "port-halcyon-marina-office") if g in GEN]
    new = []
    taken = []
    use = {}
    dir_w = np.stack(np.gradient(ndi.gaussian_filter(dist_w, 3.0)), axis=-1)             # points away from the water
    for idx in order:
        if len(new) >= 170: break
        ci, cj = int(xs_i[idx]), int(ys[idx])
        x, z = X0 + (ci + 0.5) * CELL, Z0 + (cj + 0.5) * CELL
        if any((x - a) ** 2 + (z - b) ** 2 < 170.0 ** 2 for a, b in taken): continue
        w = np.array([1.0 / (1.0 + 0.4 * use.get(g, 0)) for g in FAC]); w /= w.sum()
        slug = FAC[int(rng.choice(len(FAC), p=w))]
        m = GEN[slug]
        # front: toward the nearest street within 120 m, else square to the shore (toward the water)
        d, k = stree.query([x, z])
        if d < 120.0:
            to = samples[k] - np.array([x, z]); face = to / (np.hypot(*to) or 1.0)
        else:
            gz, gx_ = dir_w[cj, ci]
            away = np.array([gx_, gz]); n = np.hypot(*away) or 1.0
            face = -away / n
            # snap square to the shore tangent
        phi = math.atan2(face[0], face[1])
        it = {"kind": "generic", "slug": slug, "x": 0, "z": 0, "rotY": phi, "w": m["w"], "d": m["d"], "h": m["h"], "sx": 1.0, "sy": 1.0, "sz": 1.0, "bx": x, "bz": z, "infill": True, "shore": True}
        fc = footprint_cells(it, 4.0)
        if fc is None: continue
        z0, z1, x0, x1, mk = fc
        if (ownocc[z0:z1, x0:x1][mk]).any() or (road[z0:z1, x0:x1][mk]).any() or (slope[z0:z1, x0:x1][mk] > 0.12).any() or (water[z0:z1, x0:x1][mk]).any(): continue
        it["x"] = round(x - (m["cx"] * math.cos(phi) + m["cz"] * math.sin(phi)), 1)
        it["z"] = round(z - (-m["cx"] * math.sin(phi) + m["cz"] * math.cos(phi)), 1)
        it["rotY"] = round(phi, 4); it["bx"] = round(x, 1); it["bz"] = round(z, 1)
        ownocc[z0:z1, x0:x1][mk] = 1
        new.append(it); taken.append((x, z)); use[slug] = use.get(slug, 0) + 1
    print("riverside facilities seeded", len(new), dict(sorted(use.items(), key=lambda kv: -kv[1])[:6]))
    items = [it for it in items if not (it.get("shore") and it.get("slug") in FAC and it.get("seeded"))]
    for it in new: it["seeded"] = True
    items += new

    # ---- audit ----
    occ_fixed = np.zeros((NZ, NX), np.uint8)
    for it in items:
        if it.get("kind") == "hero" or not any(it.get(k) for k in GENERATED):
            raster(corners(it, 0.5), 1, occ_fixed)
    occ_gen = np.zeros((NZ, NX), np.uint8)
    stats = {"road": 0, "slope": 0, "water": 0, "overlap": 0, "turned": 0}
    out = []
    gen = [it for it in items if it.get("kind") != "hero" and any(it.get(k) for k in GENERATED)]
    fixed = [it for it in items if not (it.get("kind") != "hero" and any(it.get(k) for k in GENERATED))]
    gen.sort(key=lambda it: -(it["w"] * it["d"]))
    kept = []
    for it in gen:
        # turn to face a street within 70 m if it fronts the wrong way
        d, k = stree.query([it["bx"], it["bz"]])
        if d < 70.0:
            to = samples[k] - np.array([it["bx"], it["bz"]]); to = to / (np.hypot(*to) or 1.0)
            front = np.array([math.sin(it["rotY"]), math.cos(it["rotY"])])
            ang = math.degrees(math.acos(float(np.clip(np.dot(front, to), -1, 1))))
            if ang > 35.0 and d > it["d"] / 2:
                m = GEN.get(it["slug"])
                if m:
                    phi = math.atan2(to[0], to[1])
                    old = (it["rotY"], it["x"], it["z"])
                    it["rotY"] = round(phi, 4)
                    it["x"] = round(it["bx"] - (m["cx"] * math.cos(phi) + m["cz"] * math.sin(phi)), 1); it["z"] = round(it["bz"] - (-m["cx"] * math.sin(phi) + m["cz"] * math.cos(phi)), 1)
                    stats["turned"] += 1
        fc = footprint_cells(it, 0.5)
        if fc is None:
            continue
        z0, z1, x0, x1, mk = fc
        if not mk.any():
            kept.append(it); continue
        if road[z0:z1, x0:x1][mk].any():
            stats["road"] += 1; continue
        if water[z0:z1, x0:x1][mk].mean() > 0.2:
            stats["water"] += 1; continue
        sl = slope[z0:z1, x0:x1][mk]; hh = hg[z0:z1, x0:x1][mk]
        if sl.max() > 0.20 or (hh.max() - hh.min()) > 3.2:
            stats["slope"] += 1; continue
        if occ_fixed[z0:z1, x0:x1][mk].any() or occ_gen[z0:z1, x0:x1][mk].any():
            stats["overlap"] += 1; continue
        occ_gen[z0:z1, x0:x1][mk] = 1
        kept.append(it)
    print("audit: removed", {k: v for k, v in stats.items() if k != "turned"}, "turned to face a street", stats["turned"], "kept", len(kept), "of", len(gen))
    data["items"] = fixed + kept
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    print("total items", len(data["items"]))


if __name__ == "__main__":
    main()
