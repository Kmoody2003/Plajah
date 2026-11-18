"""
Re-lay the houses the way a subdivision is platted: every house on a lot that fronts a street.

The generators scattered houses through whole blocks; the ones in the middle of a block had no street in front of them, so they got long driveways across other lots
(or none). A real residential block is a ring of lots along its streets with the back yards meeting in the middle. This pass:

  1. plats lots along both sides of every local street: a lot every 18 m, the house set back 7 m from the curb, kept clear of intersections and other streets
  2. moves each house (by how close it already is to a street) onto the nearest free lot within 150 m, facing the street, without overlapping another building,
     a parking lot, water or the street behind it
  3. a house that finds no lot is removed: that ground becomes back yards
  4. gives every house a 3 m concrete driveway from beside its front to the curb (kind "drive"); the parking-lot entrances in driveways.json are kept

Writes region/city.json and region/driveways.json (backups: *.before_relay.json). Run after fix_driveways.py:
    python games/forth-horizon/tools/relay_houses.py
"""
import json, math, os, re, shutil
import numpy as np
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "forth-horizon", "region")
ROAD = {"street": 8.5, "arterial": 14.0, "freeway": 12.5, "ramp": 5.5}
HOUSE = re.compile(r"house|triplex|duplex|bungalow|colonial|townhouse|ranch|cape-cod|tudor|split-level|cottage|villa|gable")
NEIGH = re.compile(r"daycare|laundromat|bakery|coffee-shop|barber|pet-store|spirits-store|pizza|salon|diner|vet-clinic|pharmacy|corner-grocery|hardware-store")   # small neighbourhood shops and services: they front a street like the houses
SETBACK, SPACING, REACH = 7.0, 15.0, 180.0
load = lambda f: json.load(open(os.path.join(R, f))) if os.path.exists(os.path.join(R, f)) else None


def main():
    # ---- streets: local ones get lots; every road blocks lots ----
    segs, front = [], []
    citylocal = []
    def add(pts, half, lots, cl=False):
        for a, b in zip(pts[:-1], pts[1:]):
            if math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2: segs.append((a[0], a[1], b[0], b[1], half)); front.append(lots); citylocal.append(cl)
    for s in load("city_streets.json") or []: add(s["p"], ROAD.get(s["c"], 8.5) / 2, s["c"] == "street", s["c"] == "street")
    us = load("user_streets.json")
    for r in (us["roads"] if us else []):
        if not r.get("trail"): add(r["xz"], r.get("half", 3.4), r.get("half", 3.4) <= 5.0, r.get("half", 3.4) <= 3.5 and not r.get("connector") and not r.get("link"))   # residential zone streets can be platted too
    for f, h in (("port_streets.json", 4.0), ("utility_streets.json", 4.0)):
        d = load(f)
        for r in (d["roads"] if d else []): add(r["xz"], r.get("half", h), False)
    cr = load("country_roads.json")
    for r in (cr["roads"] if cr else []):
        if r["kind"] == "paved": add(r["xz"], r.get("half", 3.6), True)                 # houses front the county roads too (the sprawl along them)
    reg = load("region.json")
    add(reg["coastal_highway"]["xz"], 6.4, True); add(reg["freeway"]["xz"], 10.0, False)
    sh = load("shoreline_highway.json")
    if sh: add(sh["xz"], 6.0, True)
    for c in reg["circuits"].values(): add(c["xz"], 7.0, False)
    S = np.array(segs, float)
    rp, rh = [], []
    for ax, az, bx, bz, h in S:
        n = max(1, int(math.hypot(bx - ax, bz - az) / 2.0))
        for k in range(n + 1): rp.append((ax + (bx - ax) * k / n, az + (bz - az) * k / n)); rh.append(h)
    rp = np.array(rp); rh = np.array(rh); rtree = cKDTree(rp)
    def road_clear(p, need):
        """is every road edge at least `need` metres from p?"""
        for j in rtree.query_ball_point(p, need + 8.0):
            if float(np.hypot(*(rp[j] - p))) - rh[j] < need: return False
        return True

    # ---- water ----
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    wet = lambda x, z: hi[min(max(int((z - hm.get("oz", 0)) / hm["mpp"] + hm["h"] / 2), 0), hm["h"] - 1), min(max(int((x - hm.get("ox", 0)) / hm["mpp"] + hm["w"] / 2), 0), hm["w"] - 1)] < 2.8

    # ---- lots along the local streets ----
    slots = []                                                            # x, z (front line point), nx, nz (away from the street)
    slot_city = []
    for (ax, az, bx, bz, h), lots, cl in zip(S, front, citylocal):
        if not lots: continue
        L = math.hypot(bx - ax, bz - az)
        if L < 30.0: continue
        tx, tz = (bx - ax) / L, (bz - az) / L
        for side in (-1, 1):
            nx, nz = -tz * side, tx * side
            s = 12.0
            while s <= L - 12.0:
                px, pz = ax + tx * s + nx * (h + SETBACK), az + tz * s + nz * (h + SETBACK)
                if road_clear(np.array([px, pz]), 6.0): slots.append((px, pz, nx, nz)); slot_city.append(cl)
                s += SPACING
    slots = np.array(slots, float)
    stree = cKDTree(slots[:, :2])
    taken = np.zeros(len(slots), bool)
    print("lots platted", len(slots))

    # ---- buildings ----
    for f in ("city.json", "driveways.json"):
        b = os.path.join(R, f.replace(".json", ".before_relay.json"))
        if not os.path.exists(b): shutil.copy(os.path.join(R, f), b)            # keep the first original; re-running starts from it
        shutil.copy(b, os.path.join(R, f))
    data = load("city.json"); items = data["items"]
    orig_tree = cKDTree(np.array([[it["bx"], it["bz"]] for it in items]))           # where buildings stood before anything moved
    # houses, and the other small neighbourhood buildings (daycare, corner shop, small church), all go onto lots that front a street; big buildings stay
    is_house = [it.get("kind") != "hero" and max(it["w"], it["d"]) < 22 and ((bool(HOUSE.search(it["slug"])) and "hotel" not in it["slug"]) or bool(NEIGH.search(it["slug"]))) for it in items]
    # occupancy: everything that is not a house stays where it is; parking lots too
    occ = []                                                              # x, z, r
    for it, h in zip(items, is_house):
        if not h: occ.append((it["bx"], it["bz"], 0.5 * math.hypot(it["w"], it["d"])))
    pl = load("parking_lots.json") or []
    for lot in pl:                                                        # [x, z, width, depth, rotation]
        occ.append((float(lot[0]), float(lot[1]), 0.5 * math.hypot(lot[2], lot[3])))
    occ_list = list(occ)
    grid = {}
    C = 40.0
    def occ_add(x, z, r):
        occ_list.append((x, z, r)); k = (int(x // C), int(z // C)); grid.setdefault(k, []).append(len(occ_list) - 1)
    for i, (x, z, r) in enumerate(occ_list): grid.setdefault((int(x // C), int(z // C)), []).append(i)
    def free(x, z, r):
        cx, cz = int(x // C), int(z // C)
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for j in grid.get((cx + a, cz + b), []):
                    ox, oz, orr = occ_list[j]
                    if math.hypot(ox - x, oz - z) < 0.85 * (orr + r) + 0.5: return False      # footprints are boxes: the bounding circles may overlap a little at the corners
        return True

    # ---- back yards: a detached garage at the end of the drive (narrow houses, the drive runs past the house), a rear fence on the lot line, a tree or two ----
    import random as _r
    yr = _r.Random(11)
    yards = {"garages": [], "fences": [], "trees": []}
    def yard(cx, cz, nx, nz, it, half_d, side, j):
        w = it["w"] * it.get("sx", 1)
        tx, tz = nz, -nx
        if w <= 10.5 and yr.random() < 0.75:
            lat = side * (w / 2 + 1.9)
            gx, gz = cx + nx * (half_d + 4.6) + tx * lat, cz + nz * (half_d + 4.6) + tz * lat
            if free(gx, gz, 3.6) and not wet(gx, gz):
                occ_add(gx, gz, 3.6)
                yards["garages"].append([round(gx, 1), round(gz, 1), round(math.atan2(-nx, -nz), 4)])
                # the drive now runs from the curb past the side of the house to the garage door
                fx, fz = cx - nx * half_d + tx * lat, cz - nz * half_d + tz * lat
                drives[-1] = {"kind": "drive", "xz": [[round(gx - nx * 3.6, 1), round(gz - nz * 3.6, 1)], [round(fx - nx * (SETBACK + 0.3), 1), round(fz - nz * (SETBACK + 0.3), 1)]], "half": 1.5, "driveway": True}
        # rear lot line ~34 m from the curb: a fence the width of the lot
        rx, rz = cx - nx * half_d + nx * (34.0 - SETBACK), cz - nz * half_d + nz * (34.0 - SETBACK)
        if road_clear(np.array([rx, rz]), 3.0) and not wet(rx, rz):
            yards["fences"].append([round(rx - tx * SPACING / 2, 1), round(rz - tz * SPACING / 2, 1), round(rx + tx * SPACING / 2, 1), round(rz + tz * SPACING / 2, 1)])
        for _ in range(2):
            if yr.random() < 0.6:
                d = 16.0 + yr.random() * 14.0; a = (yr.random() - 0.5) * SPACING * 0.8
                qx, qz = cx - nx * half_d + nx * d + tx * a, cz - nz * half_d + nz * d + tz * a
                if free(qx, qz, 2.5) and road_clear(np.array([qx, qz]), 3.0) and not wet(qx, qz):
                    yards["trees"].append([round(qx, 1), round(qz, 1), 1 if yr.random() < 0.2 else 0, round(yr.random(), 3), round(0.7 + yr.random() * 0.4, 2)])
    # houses closest to a street choose first
    order = []
    for i, (it, h) in enumerate(zip(items, is_house)):
        if not h: continue
        d, _ = rtree.query([it["bx"], it["bz"]])
        order.append((d, i))
    order.sort()
    keep = [not h for h in is_house]
    drives = []
    moved = 0
    for _, i in order:
        it = items[i]
        r = 0.5 * math.hypot(it["w"] * it.get("sx", 1), it["d"] * it.get("sz", 1))
        half_d = 0.5 * it["d"] * it.get("sz", 1)
        best = None
        for j in sorted(stree.query_ball_point([it["bx"], it["bz"]], REACH), key=lambda j: math.hypot(slots[j, 0] - it["bx"], slots[j, 1] - it["bz"])):
            if taken[j]: continue
            px, pz, nx, nz = slots[j]
            cx, cz = px + nx * half_d, pz + nz * half_d
            if wet(cx, cz) or not free(cx, cz, r) or not road_clear(np.array([px + nx * 2 * half_d, pz + nz * 2 * half_d]), 3.0): continue
            best = (j, cx, cz, nx, nz); break
        if not best: continue
        j, cx, cz, nx, nz = best
        taken[j] = True
        for k in stree.query_ball_point(slots[j, :2], SPACING * 0.75): taken[k] = True     # the neighbouring lot on the same frontage is part of this one
        # face the street: the model's front is (sin rotY, cos rotY)
        rot = math.atan2(-nx, -nz)
        moved += int(math.hypot(cx - it["bx"], cz - it["bz"]) > 1.0)
        it["x"] += cx - it["bx"]; it["z"] += cz - it["bz"]; it["bx"] = round(cx, 1); it["bz"] = round(cz, 1); it["x"] = round(it["x"], 1); it["z"] = round(it["z"], 1); it["rotY"] = round(rot, 4)
        occ_add(cx, cz, r)
        keep[i] = True
        # driveway: from beside the front of the house to the curb, on the side away from the next lot's drive
        side = 1 if (j % 2) else -1
        tx, tz = nz, -nx
        off = 0.5 * it["w"] * it.get("sx", 1) - 1.6
        sx_, sz_ = cx - nx * half_d + tx * off * side, cz - nz * half_d + tz * off * side
        drives.append({"kind": "drive", "xz": [[round(sx_ - nx * 0.5, 1), round(sz_ - nz * 0.5, 1)], [round(sx_ - nx * (SETBACK + 0.3), 1), round(sz_ - nz * (SETBACK + 0.3), 1)]], "half": 1.5, "driveway": True})
        yard(cx, cz, nx, nz, it, half_d, side, j)
    # ---- empty street grids: the street data has whole neighbourhoods of streets with no buildings (ghost subdivisions). Plat them with houses like
    # their neighbours: only lots on local city streets, only where no building stood within 110 m, never in an industrial or park zone ----
    import random
    rnd = random.Random(7)
    tpl = [it for it, k, h in zip(items, keep, is_house) if h and k and HOUSE.search(it["slug"]) and "hotel" not in it["slug"] and it["h"] * it.get("sy", 1) <= 11.0]      # single-family scale only: no three-storey blocks dropped into a street of houses
    zz = load("zones.json")
    hulls = [np.array(z["hull"], np.float32).reshape(-1, 1, 2) for z in (zz["zones"] if zz else []) if z["kind"] in ("industrial",)]
    um = load("user_map.json")
    hulls += [np.array(f["pts"], np.float32).reshape(-1, 1, 2) for f in (um["features"] if um else []) if f["type"] == "zone" and f.get("kind") in ("industrial", "parkland")]
    import cv2
    order_s = list(range(len(slots))); rnd.shuffle(order_s)
    filled = []
    for j in order_s:
        if len(filled) >= 4000 or taken[j] or not slot_city[j] or not tpl: continue
        px, pz, nx, nz = slots[j]
        if orig_tree.query_ball_point([px, pz], 110.0): continue
        if any(cv2.pointPolygonTest(h_, (float(px), float(pz)), False) >= 0 for h_ in hulls): continue
        t = tpl[rnd.randrange(len(tpl))]
        half_d = 0.5 * t["d"] * t.get("sz", 1); r = 0.5 * math.hypot(t["w"] * t.get("sx", 1), t["d"] * t.get("sz", 1))
        cx, cz = px + nx * half_d, pz + nz * half_d
        if wet(cx, cz) or not free(cx, cz, r) or not road_clear(np.array([px + nx * 2 * half_d, pz + nz * 2 * half_d]), 3.0): continue
        it = dict(t); it["x"] = round(cx + (t["x"] - t["bx"]), 1); it["z"] = round(cz + (t["z"] - t["bz"]), 1); it["bx"] = round(cx, 1); it["bz"] = round(cz, 1); it["rotY"] = round(math.atan2(-nx, -nz), 4); it["fill"] = True
        taken[j] = True
        for k in stree.query_ball_point(slots[j, :2], SPACING * 0.75): taken[k] = True
        occ_add(cx, cz, r); filled.append(it)
        side = 1 if (j % 2) else -1; tx, tz = nz, -nx; off = 0.5 * it["w"] * it.get("sx", 1) - 1.6
        sx_, sz_ = cx - nx * half_d + tx * off * side, cz - nz * half_d + tz * off * side
        drives.append({"kind": "drive", "xz": [[round(sx_ - nx * 0.5, 1), round(sz_ - nz * 0.5, 1)], [round(sx_ - nx * (SETBACK + 0.3), 1), round(sz_ - nz * (SETBACK + 0.3), 1)]], "half": 1.5, "driveway": True})
        yard(cx, cz, nx, nz, it, half_d, side, j)
    print("empty street grids platted with", len(filled), "houses")
    removed = sum(1 for k, h in zip(keep, is_house) if h and not k)
    data["items"] = [it for it, k in zip(items, keep) if k] + filled
    json.dump(data, open(os.path.join(R, "city.json"), "w"))
    old = load("driveways.json")["roads"]
    lots_drives = [r for r in old if r.get("half", 0) >= 3.0 or r["kind"] == "dirt"]      # parking-lot entrances and farm lanes stay
    json.dump({"roads": lots_drives + drives}, open(os.path.join(R, "driveways.json"), "w"), separators=(",", ":"))
    json.dump({"garages": yards["garages"], "fences": yards["fences"]}, open(os.path.join(R, "yards.json"), "w"), separators=(",", ":"))
    json.dump(yards["trees"], open(os.path.join(R, "yard_trees.json"), "w"), separators=(",", ":"))
    print("back yards: garages", len(yards["garages"]), "fences", len(yards["fences"]), "trees", len(yards["trees"]))
    print("houses", sum(is_house), "on lots", sum(is_house) - removed, "(moved", moved, ") removed", removed, "| driveways", len(drives), "+ lot/farm", len(lots_drives))


if __name__ == "__main__":
    main()
