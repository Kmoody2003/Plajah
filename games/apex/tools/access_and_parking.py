"""
Road access and parking: nothing in the city is an orphan.

1. STREETS  Every street we generated must be part of the one road network. Streets are grouped into connected components (streets that cross or touch each other); a component that does not
           reach the main network (the city streets, the highways, the coastal and shoreline roads, the bridges) is joined to it by a connector street to the nearest main road if that is within
           400 m and over dry land, and removed together with its buildings otherwise. A street that stops short (a dead end that is not a cul-de-sac bulb or a trail) is extended to the nearest
           road within 90 m.
2. BUILDINGS Every generated building must front a street. If its front door is within 24 m of a road it has access; if the road is 24-60 m away a driveway is cut to it (region/driveways.json);
           further than that and the building is removed (it could not be reached).
3. PARKING  Offices, towers, shops, warehouses, depots, schools, churches and the like get a parking lot between the building and the street, linked to the street by a driveway
           (region/parking_lots.json: x, z, width, depth, rotation, rows of stalls); the lot is only made where the ground is free (no building, road or water).
Run after the infill, detail and port tools and before audit_and_seed.py:  IRONPORT_PKG=public/games/apex/ironport python games/apex/tools/access_and_parking.py
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

OUT = os.path.join(rc.REPO, "public", "games", "apex", "region")
GEN = pc.GEN
MPP = rc.MPP
CELL = 4.0
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)
GENERATED = ("infill", "rural", "shore", "userzone", "sprawl", "port", "farbank")
NEEDS_LOT = ("tower", "office", "block", "hotel", "store", "mall", "market", "bank", "hospital", "clinic", "school", "church", "warehouse", "depot", "center", "storage", "shop", "grocery", "pharmacy", "diner",
             "station", "garage", "deck", "foundry", "machine", "salvage", "freight", "tire", "repair", "hardware", "bakery", "library", "arcade", "plaza", "court", "lofts", "apartments", "residences", "condos")


def load(fn):
    p = os.path.join(OUT, fn)
    return json.load(open(p)) if os.path.exists(p) else None


def seglen(p):
    p = np.asarray(p, float)
    return float(np.hypot(*np.diff(p, axis=0).T).sum()) if len(p) > 1 else 0.0


def main():
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = data["items"]
    reg = load("region.json")
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(OUT, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    hg = cv2.resize(hi, (NX, NZ), interpolation=cv2.INTER_AREA)
    water = hg < 2.5
    gy, gx = np.gradient(ndi.gaussian_filter(hg, 1.0)); slope = np.hypot(gx, gy) / CELL

    # ---------- the road set ----------
    main_lines = []          # the network everything must reach
    for s in rc.streets_world():
        main_lines.append(np.array(s["pts"], float))
    main_lines.append(np.array(reg["coastal_highway"]["xz"], float)); main_lines.append(np.array(reg["freeway"]["xz"], float))
    sh = load("shoreline_highway.json")
    if sh: main_lines.append(np.array(sh["xz"], float))
    for c in reg["circuits"].values(): main_lines.append(np.array(c["xz"], float))
    ic = load("industrial_circuit.json")
    if ic: main_lines.append(np.array(ic["xz"] + [ic["xz"][0]], float))
    cr = load("country_roads.json")
    country = [np.array(r["xz"], float) for r in (cr["roads"] if cr else []) if r["kind"] == "paved"]
    um = load("user_map.json")
    umroads = [np.array(f["pts"], float) for f in (um["features"] if um else []) if f["type"] == "road" and f["kind"] in ("highway", "avenue")]
    main_lines += country + umroads

    us = load("user_streets.json")
    ps = load("port_streets.json")
    streets = [r for r in us["roads"] if not r.get("trail") and not r.get("driveway") and not r.get("connector")]
    keep_special = [r for r in us["roads"] if r.get("trail")]
    lines_s = [np.array(r["xz"], float) for r in streets]
    port_lines = [np.array(r["xz"], float) for r in (ps["roads"] if ps else [])]
    ut = load("utility_streets.json")
    port_lines += [np.array(r["xz"], float) for r in (ut["roads"] if ut else [])]

    def sample(lines, step=8.0):
        P, idx = [], []
        for i, l in enumerate(lines):
            if len(l) < 2: continue
            for a, b in zip(l[:-1], l[1:]):
                L = float(np.hypot(*(b - a)))
                if L < 1e-3: continue
                for t in np.arange(0, L, step):
                    P.append(a + (b - a) * t / L); idx.append(i)
            P.append(l[-1]); idx.append(i)
        return np.array(P), np.array(idx)

    # components among the generated streets (they join when they come within 7 m of each other or of the main network)
    mP, _ = sample(main_lines + port_lines)
    mtree = cKDTree(mP)
    sP, sI = sample(lines_s, 6.0)
    stree = cKDTree(sP)
    parent = list(range(len(lines_s)))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for a, b in stree.query_pairs(7.0):
        ia, ib = int(sI[a]), int(sI[b])
        if ia != ib: parent[find(ia)] = find(ib)
    touches_main = np.zeros(len(lines_s), bool)
    d, _ = mtree.query(sP)
    for i in np.unique(sI[d < 7.0]): touches_main[i] = True
    comp_main = {find(i) for i in range(len(lines_s)) if touches_main[i]}
    comps = {}
    for i in range(len(lines_s)): comps.setdefault(find(i), []).append(i)
    connectors, removed_comps, joined = [], 0, 0
    drop = set()
    for c, members in comps.items():
        if c in comp_main: continue
        pts = sP[np.isin(sI, members)]
        dd, jj = mtree.query(pts)
        k = int(np.argmin(dd))
        if dd[k] < 400.0:
            a, b = pts[k], mP[jj[k]]
            mid = (a + b) / 2
            ci, cj = int((mid[0] - X0) / CELL), int((mid[1] - Z0) / CELL)
            if 0 <= ci < NX and 0 <= cj < NZ and not water[cj, ci]:
                connectors.append({"kind": "paved", "xz": [[round(float(a[0]), 1), round(float(a[1]), 1)], [round(float(b[0]), 1), round(float(b[1]), 1)]], "half": 5.0, "connector": True}); joined += 1
                continue
        for i in members: drop.add(i)
        removed_comps += 1
    print("street components joined", joined, "removed", removed_comps, "(streets dropped:", len(drop), ")")
    streets = [r for i, r in enumerate(streets) if i not in drop]
    lines_s = [l for i, l in enumerate(lines_s) if i not in drop]

    # dead ends: extend to the nearest road within 90 m
    allP, allI = sample(main_lines + port_lines + lines_s + [np.array(c["xz"], float) for c in connectors], 6.0)
    atree = cKDTree(allP)
    stubs = 0
    base = len(main_lines) + len(port_lines)
    for si, (r, l) in enumerate(zip(streets, lines_s)):
        if len(l) < 3: continue
        own = base + si
        for end in (0, -1):
            e = l[end]
            if any(allI[q] != own for q in atree.query_ball_point(e, 7.0)): continue          # it joins or crosses something
            dd, jj = atree.query(e, k=16)
            for dist_, q in zip(dd, jj):
                if 9.0 < dist_ < 90.0 and allI[q] != own:
                    tgt = allP[q]; mid = (e + tgt) / 2
                    ci, cj = int((mid[0] - X0) / CELL), int((mid[1] - Z0) / CELL)
                    if 0 <= ci < NX and 0 <= cj < NZ and not water[cj, ci]:
                        connectors.append({"kind": "paved", "xz": [[round(float(e[0]), 1), round(float(e[1]), 1)], [round(float(tgt[0]), 1), round(float(tgt[1]), 1)]], "half": r.get("half", 3.4), "connector": True}); stubs += 1
                        break
    print("dead ends extended", stubs)

    # ---------- buildings: access ----------
    roadP, roadI = sample(main_lines + port_lines + lines_s + [np.array(c["xz"], float) for c in connectors] + [np.array(r["xz"], float) for r in keep_special], 5.0)
    rtree = cKDTree(roadP)
    gen_idx = [i for i, it in enumerate(items) if it.get("kind") != "hero" and any(it.get(k) for k in GENERATED)]
    driveways, remove = [], set()
    for i in gen_idx:
        it = items[i]
        front = np.array([math.sin(it["rotY"]), math.cos(it["rotY"])])
        door = np.array([it["bx"], it["bz"]]) + front * (it["d"] / 2 + 1.0)
        d, k = rtree.query(door)
        if d <= 24.0: continue
        farm = bool(it.get("rural"))                                       # a farmstead may stand well back from the road on its own farm lane
        far_ok = 220.0 if farm else (140.0 if (it.get("shore") or it.get("seeded")) else 60.0)         # farms and riverside works stand back on their own lane
        if d <= far_ok:
            tgt = roadP[k]
            driveways.append({"kind": "dirt" if farm else "paved", "xz": [[round(float(door[0]), 1), round(float(door[1]), 1)], [round(float(tgt[0]), 1), round(float(tgt[1]), 1)]], "half": 2.6 if not farm else 2.2, "driveway": True})
            continue
        remove.add(i)
    import collections
    rc_ = collections.Counter()
    for i in remove:
        it = items[i]; rc_[",".join(sorted(f for f in ("infill", "rural", "shore", "userzone", "sprawl", "port", "densified", "anchor", "seeded") if it.get(f)))] += 1
    print("removed by kind", dict(rc_))
    print("buildings: driveways", len(driveways), "unreachable removed", len(remove))

    # ---------- parking lots ----------
    occ = np.zeros((NZ, NX), np.uint8)
    occ[water | (slope > 0.2)] = 1
    for lines in (main_lines, port_lines, lines_s, [np.array(c["xz"], float) for c in connectors]):
        for l in lines:
            if len(l) >= 2: cv2.polylines(occ, [np.array([cell(*q) for q in l], np.float32).astype(np.int32)], False, 1, 4)
    def rect_pts(cx, cz, w, d, e1, e2, grow=0.0):
        hw, hd = w / 2 + grow, d / 2 + grow
        return [(cx + e1[0] * a + e2[0] * b, cz + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
    for i, it in enumerate(items):
        if i in remove: continue
        phi = it["rotY"]; e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        cv2.fillPoly(occ, [np.array([cell(*p) for p in rect_pts(it["bx"], it["bz"], it["w"], it["d"], e1, e2, 1.0)], np.float32).astype(np.int32)], 1)
    lots = []
    for i in gen_idx:
        if i in remove: continue
        it = items[i]
        slug = it["slug"]
        if not any(k in slug for k in NEEDS_LOT) or it["w"] < 18: continue
        front = np.array([math.sin(it["rotY"]), math.cos(it["rotY"])]); side = np.array([front[1], -front[0]])
        phi = it["rotY"]; e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        depth = 16.0 if it["w"] < 45 else 22.0
        door = np.array([it["bx"], it["bz"]]) + front * (it["d"] / 2)
        d, k = rtree.query(door)
        gap = d - 3.0 - 10.0                                              # from 3 m off the door to 10 m off the street's centre line (its width and verge)
        if gap < depth: depth = gap                                       # the strip between building and street may be too narrow for a full lot
        cands = []
        if depth >= 8.0:
            cands.append((door + front * (depth / 2 + 3.0), min(it["w"] * 1.05, 70.0), depth))
        # beside or behind the building, with a driveway out to the street
        dd0 = 16.0 if it["w"] < 45 else 22.0
        wl = min(max(it["w"] * 0.9, 26.0), 56.0)
        mid0 = np.array([it["bx"], it["bz"]])
        cands.append((mid0 + side * (it["w"] / 2 + wl / 2 + 3.0), wl, dd0))
        cands.append((mid0 - side * (it["w"] / 2 + wl / 2 + 3.0), wl, dd0))
        cands.append((mid0 - front * (it["d"] / 2 + dd0 / 2 + 3.0), min(it["w"] * 1.05, 70.0), dd0))
        placed_lot = False
        for c, w, dep in cands:
            pts = np.array([cell(*p) for p in rect_pts(c[0], c[1], w, dep, e1, e2)], np.float32)
            x0_, z0_ = int(max(pts[:, 0].min() - 2, 0)), int(max(pts[:, 1].min() - 2, 0)); x1_, z1_ = int(min(pts[:, 0].max() + 3, NX)), int(min(pts[:, 1].max() + 3, NZ))
            sub = np.zeros((z1_ - z0_, x1_ - x0_), np.uint8); cv2.fillPoly(sub, [(pts - [x0_, z0_]).astype(np.int32)], 1)
            if not sub.any() or (occ[z0_:z1_, x0_:x1_][sub > 0]).any(): continue
            dl, kl = rtree.query(c)
            if dl > 70.0: continue
            occ[z0_:z1_, x0_:x1_][sub > 0] = 1
            lots.append([round(float(c[0]), 1), round(float(c[1]), 1), round(w, 1), round(dep, 1), round(phi, 4)])
            tgt = roadP[kl]
            driveways.append({"kind": "paved", "xz": [[round(float(c[0]), 1), round(float(c[1]), 1)], [round(float(tgt[0]), 1), round(float(tgt[1]), 1)]], "half": 3.0, "driveway": True})
            placed_lot = True
            break
    print("parking lots", len(lots))

    data["items"] = [it for i, it in enumerate(items) if i not in remove]
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    json.dump({"roads": streets + keep_special + connectors}, open(os.path.join(OUT, "user_streets.json"), "w"), separators=(",", ":"))
    json.dump({"roads": driveways}, open(os.path.join(OUT, "driveways.json"), "w"), separators=(",", ":"))
    json.dump(lots, open(os.path.join(OUT, "parking_lots.json"), "w"), separators=(",", ":"))
    print("done: items", len(data["items"]), "streets", len(streets) + len(connectors))


if __name__ == "__main__":
    main()
