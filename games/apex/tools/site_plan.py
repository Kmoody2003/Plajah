"""
Site plans: every lot outside downtown laid out the way it would be on a real plat, after relay_houses.py has put the houses on their lots.

HOMES (single-family, on the platted lots)
  - a 1.2 m concrete front walk from the door to the public sidewalk (or to the road edge on a country road)
  - side-yard privacy fences: a return from the back corner of the house to the side lot line, then down the side lot line to the rear fence (with a gate gap on the
    return), so each back yard is enclosed like the neighbours'; on the driveway side the fence starts behind the garage
  - foundation shrubs along the front of the house, clear of the door and the drive
  - a mailbox post at the curb beside the driveway
  - one house in eight has a low white picket fence on the front lot line (gaps for the walk and the drive)
SHOPS AND OFFICES (outside downtown, where nobody has a lot yet)
  - parking in front, between the building and the street, sized to the building (a single bay and aisle, or one or two double-loaded 18 m modules), with a driveway;
    if the strip in front is too shallow the building moves back (up to 40 m) when the ground behind it is free; otherwise beside it, otherwise behind it
  - a dumpster pad behind
INDUSTRIAL (works, depots, warehouses, yards)
  - a concrete truck apron on the side or back with dock doors on the wall it faces and trailers parked at the docks
  - an employee lot at the front if there is room
  - a 2 m chain-link fence around the whole site, open where the drive comes in

Writes region/yards.json (adds walks, sideFences, shrubs, mailboxes, pickets, chain, aprons, docks, trailers, dumpsters to garages and fences), and appends to
region/parking_lots.json, region/driveways.json, and moves buildings in region/city.json. Backups *.before_site.json are taken on the first run and every run starts
from them, so the pass can be re-run.
    python games/apex/tools/site_plan.py
"""
import json, math, os, re, shutil, random
import numpy as np
import cv2
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "apex", "region")
HOUSE = re.compile(r"house|triplex|duplex|bungalow|colonial|townhouse|ranch|cape-cod|tudor|split-level|cottage|villa|gable")
INDUSTRIAL = re.compile(r"works|foundry|machine|salvage|freight|warehouse|depot|storage|chemical|distribution|truck|parts|lumber|plant|mill|yard|fabrication|logistics|cold-store|recycling")
NEEDS = ("office", "block", "hotel", "store", "mall", "market", "bank", "hospital", "clinic", "school", "church", "warehouse", "depot", "center", "storage", "shop", "grocery", "pharmacy",
         "diner", "station", "garage", "foundry", "machine", "salvage", "freight", "tire", "repair", "hardware", "bakery", "library", "arcade", "plaza", "apartments", "residences", "condos",
         "daycare", "laundromat", "coffee", "barber", "pet", "spirits", "pizza", "salon", "vet", "wash", "works", "chemical", "distribution", "precinct", "post-office", "fitness", "restaurant", "motel")
ROAD = {"street": 8.5, "arterial": 14.0, "freeway": 12.5, "ramp": 5.5}
GRID = 2.0
rnd = random.Random(23)
load = lambda f: json.load(open(os.path.join(R, f))) if os.path.exists(os.path.join(R, f)) else None


def from_backup(f):
    b = os.path.join(R, f.replace(".json", ".before_site.json"))
    if not os.path.exists(b): shutil.copy(os.path.join(R, f), b)
    shutil.copy(b, os.path.join(R, f))
    return load(f)


def main():
    data = from_backup("city.json"); items = data["items"]
    drives = from_backup("driveways.json")
    lots = from_backup("parking_lots.json")
    yards = from_backup("yards.json")
    ytrees = from_backup("yard_trees.json")

    # ---------- roads: centre lines with their half width and whether they have a sidewalk ----------
    segs = []                                       # ax, az, bx, bz, half, walk (outer edge of the sidewalk from the centre, 0 = none)
    def add(pts, half, walk):
        for a, b in zip(pts[:-1], pts[1:]):
            if math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2: segs.append((a[0], a[1], b[0], b[1], half, walk))
    for s in load("city_streets.json") or []:
        h = ROAD.get(s["c"], 8.5) / 2; add(s["p"], h, 0 if s["c"] in ("freeway", "ramp") else h + 3.9)
    for r in (load("user_streets.json") or {"roads": []})["roads"]:
        if r.get("trail"): continue
        h = r.get("half", 3.4); add(r["xz"], h, h + 0.2 + (1.4 if h >= 4.6 else 2.2) + 1.5)
    for f, h0 in (("port_streets.json", 4.0), ("utility_streets.json", 4.0)):
        for r in (load(f) or {"roads": []})["roads"]: add(r["xz"], r.get("half", h0), 0)
    for r in (load("country_roads.json") or {"roads": []})["roads"]:
        add(r["xz"], r.get("half", 3.6 if r["kind"] == "paved" else 2.6), 0)
    reg = load("region.json")
    add(reg["coastal_highway"]["xz"], 6.4, 0); add(reg["freeway"]["xz"], 10.0, 0)
    sh = load("shoreline_highway.json")
    if sh: add(sh["xz"], 6.0, 0)
    for c in reg["circuits"].values(): add(c["xz"], 7.0, 0)
    for r in (load("scenic_roads.json") or {"roads": []}).get("roads", []):
        if r.get("xz"): add(r["xz"], r.get("half", 4.0), 0)
    S = np.array(segs, float)
    rp, ri = [], []
    for k, (ax, az, bx, bz, h, w) in enumerate(S):
        n = max(1, int(math.hypot(bx - ax, bz - az) / 2.0))
        for j in range(n + 1): rp.append((ax + (bx - ax) * j / n, az + (bz - az) * j / n)); ri.append(k)
    rp = np.array(rp); ri = np.array(ri); rtree = cKDTree(rp)
    def nearest_road(p):
        d, j = rtree.query(p); return float(d), S[ri[j]], rp[j]

    # ---------- ground ----------
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    def hgt(x, z):
        i = min(max(int((z - hm.get("oz", 0)) / hm["mpp"] + hm["h"] / 2), 0), hm["h"] - 1); j = min(max(int((x - hm.get("ox", 0)) / hm["mpp"] + hm["w"] / 2), 0), hm["w"] - 1)
        return float(hi[i, j])

    # ---------- occupancy raster (2 m) over the built area ----------
    allx = [it["bx"] for it in items]; allz = [it["bz"] for it in items]
    X0, Z0 = min(allx) - 300, min(allz) - 300
    NX, NZ = int((max(allx) + 300 - X0) / GRID), int((max(allz) + 300 - Z0) / GRID)
    occ = np.zeros((NZ, NX), np.uint8)
    cell = lambda x, z: ((x - X0) / GRID, (z - Z0) / GRID)
    def window(pts):
        p = np.array([cell(*q) for q in pts], np.float32)
        x0, z0 = int(max(p[:, 0].min() - 1, 0)), int(max(p[:, 1].min() - 1, 0)); x1, z1 = int(min(p[:, 0].max() + 2, NX)), int(min(p[:, 1].max() + 2, NZ))
        if x1 <= x0 or z1 <= z0: return None
        sub = np.zeros((z1 - z0, x1 - x0), np.uint8); cv2.fillPoly(sub, [(p - [x0, z0]).round().astype(np.int32)], 1)
        return z0, z1, x0, x1, sub > 0
    ROADB, WATERB, BLDB, HLOTB, MISCB = 1, 2, 4, 8, 16
    def poly(pts, val=1, img=None):
        lay = np.zeros((1, 1), np.uint8)
        wn = window(pts)
        if wn: occ[wn[0]:wn[1], wn[2]:wn[3]][wn[4]] |= val
    def rect(cx, cz, w, d, phi, grow=0.0):
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi)); hw, hd = w / 2 + grow, d / 2 + grow
        return [(cx + e1[0] * a + e2[0] * b, cz + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
    why = {}
    def rect_free(pts):
        wn = window(pts)
        if not wn or not wn[4].any(): return False
        v = np.bitwise_or.reduce(occ[wn[0]:wn[1], wn[2]:wn[3]][wn[4]]) if wn[4].any() else 0
        if v: why[int(v)] = why.get(int(v), 0) + 1
        return not v
    def set_area(pts, v):
        wn = window(pts)
        if wn: occ[wn[0]:wn[1], wn[2]:wn[3]][wn[4]] = v if v else 0
    lay = np.zeros_like(occ)
    for ax, az, bx, bz, h, w in S:                                                        # roads with their sidewalks and a verge
        cv2.line(lay, tuple(int(v) for v in np.round(cell(ax, az))), tuple(int(v) for v in np.round(cell(bx, bz))), 1, max(1, int(round(2 * (max(h + 2.5, w + 0.5)) / GRID))))
    occ |= lay * ROADB
    # water
    ii = np.clip(((Z0 + np.arange(NZ) * GRID) - hm.get("oz", 0)) / hm["mpp"] + hm["h"] / 2, 0, hm["h"] - 1).astype(np.int32)
    jj = np.clip(((X0 + np.arange(NX) * GRID) - hm.get("ox", 0)) / hm["mpp"] + hm["w"] / 2, 0, hm["w"] - 1).astype(np.int32)
    for r0 in range(0, NZ, 400):                                                       # in bands, to keep memory down
        occ[r0:r0 + 400] |= (hi[ii[r0:r0 + 400]][:, jj] < 2.8).astype(np.uint8) * WATERB
    sc = lambda it: (it["w"] * it.get("sx", 1), it["d"] * it.get("sz", 1))
    houses = []
    for k, it in enumerate(items):
        w, d = sc(it)
        poly(rect(it["bx"], it["bz"], w, d, it["rotY"], 1.5), BLDB)
        if it.get("kind") != "hero" and HOUSE.search(it["slug"]) and "hotel" not in it["slug"] and max(w, d) < 22: houses.append(k)
    for lot in lots: poly(rect(lot[0], lot[1], lot[2], lot[3], lot[4], 1.0), MISCB)
    for g in yards["garages"]: poly(rect(g[0], g[1], 6.2, 6.8, g[2], 1.0), MISCB)
    lay[:] = 0
    for f in yards["fences"]: cv2.line(lay, tuple(int(v) for v in np.round(cell(f[0], f[1]))), tuple(int(v) for v in np.round(cell(f[2], f[3]))), 1, 2)
    for r in drives["roads"]:
        a, b = r["xz"][0], r["xz"][-1]; cv2.line(lay, tuple(int(v) for v in np.round(cell(*a))), tuple(int(v) for v in np.round(cell(*b))), 1, max(1, int(2 * r.get("half", 1.5) / GRID) + 1))
    occ |= lay * MISCB
    del lay
    # ---------- front yards: houses stand 6.5 m behind the public walk (relay_houses.py set them 7 m from the road edge, which left a 3 m strip once the walk was in) ----------
    gtree0 = cKDTree(np.array([[g[0], g[1]] for g in yards["garages"]])) if yards["garages"] else None
    pushed = 0
    for k in houses:
        it = items[k]; w, d = sc(it); hd = d / 2
        f = np.array([math.sin(it["rotY"]), math.cos(it["rotY"])]); n = -f
        c = np.array([it["bx"], it["bz"]]); front = c + f * hd
        dr, seg, _ = nearest_road(front)
        if dr > 22: continue
        want = (seg[5] if seg[5] else seg[4] + 0.6) + 6.5
        shift = want - dr
        if shift < 0.6 or shift > 6.5: continue
        nc = c + n * shift
        own = window(rect(c[0], c[1], w, d, it["rotY"], 1.5))
        view = occ[own[0]:own[1], own[2]:own[3]]; saved = view[own[4]].copy(); view[own[4]] &= ~np.uint8(BLDB)
        wn = window(rect(nc[0], nc[1], w, d, it["rotY"], 0.5))
        blocked = (not wn) or bool(np.bitwise_or.reduce(occ[wn[0]:wn[1], wn[2]:wn[3]][wn[4]]) & (BLDB | ROADB | WATERB))
        gi = None
        if gtree0 is not None:
            dg, gi_ = gtree0.query(c + n * (hd + 4.6))
            if dg < 4.5: gi = gi_
        if blocked: view[own[4]] = saved; continue
        # move the house, its garage and the house end of its drive
        it["x"] = round(it["x"] + n[0] * shift, 1); it["z"] = round(it["z"] + n[1] * shift, 1); it["bx"] = round(float(nc[0]), 1); it["bz"] = round(float(nc[1]), 1)
        poly(rect(nc[0], nc[1], w, d, it["rotY"], 1.5), BLDB)
        if gi is not None: g = yards["garages"][gi]; g[0] = round(g[0] + n[0] * shift, 1); g[1] = round(g[1] + n[1] * shift, 1)
        for r in drives["roads"]:
            if r["kind"] != "drive" or r.get("half", 1.5) > 2: continue
            for end in (0, -1):
                pt = r["xz"][end]
                if math.hypot(pt[0] - front[0], pt[1] - front[1]) < hd + 6 and np.dot(np.array(pt) - c, n) > -hd - 1.5:
                    pt[0] = round(pt[0] + n[0] * shift, 1); pt[1] = round(pt[1] + n[1] * shift, 1)
        pushed += 1
    # yard trees that a moved house or garage now stands on go
    hp0 = np.array([[items[k]["bx"], items[k]["bz"]] for k in houses]); ht0 = cKDTree(hp0)
    before_t = len(ytrees)
    ytrees = [t_ for t_ in ytrees if not any(math.hypot(items[houses[j]]["bx"] - t_[0], items[houses[j]]["bz"] - t_[1]) < 0.5 * max(sc(items[houses[j]])) + 1.5 for j in ht0.query_ball_point(t_[:2], 15))]
    print("front yards:", pushed, "houses moved back to 6.5 m behind the walk;", before_t - len(ytrees), "yard trees under them removed")
    # house lots: from the front lot line (sidewalk) to the rear fence, so nothing commercial eats a back yard
    for k in houses:
        it = items[k]; w, d = sc(it); f = np.array([math.sin(it["rotY"]), math.cos(it["rotY"])])
        poly(rect(it["bx"] + f[0] * (d / 2 - 12), it["bz"] + f[1] * (d / 2 - 12), max(w + 4, 15), 30, it["rotY"]), HLOTB)

    def free_runs(p0, p1, bits, first_only=False, skip=0.0):
        """the parts of the line p0 -> p1 clear of the given occupancy bits (first_only: stop at the first obstacle)"""
        p0 = np.asarray(p0, float); p1 = np.asarray(p1, float)
        L = float(np.linalg.norm(p1 - p0)); n_ = max(1, int(L / 1.0)); out = []; run = None; last = None
        for q in range(n_ + 1):
            pt = p0 + (p1 - p0) * (q / n_); cx_, cz_ = cell(*pt); ix, iz = int(round(cx_)), int(round(cz_))
            ok = (q / n_) * L < skip or (0 <= ix < NX and 0 <= iz < NZ and not (occ[iz, ix] & bits))
            if ok:
                if run is None: run = pt
                last = pt
            if (not ok or q == n_) and run is not None:
                if np.linalg.norm(last - run) > 1.5: out.append((run, last))
                run = None
                if first_only: break
            if not ok and first_only and out == [] and q > 0 and (q / n_) * L >= skip: break
        return out
    # ---------- homes ----------
    walks, side_f, shrubs, mail, pickets = [], [], [], [], []
    hp = np.array([[items[k]["bx"], items[k]["bz"]] for k in houses]); htree = cKDTree(hp)
    rear_tree = cKDTree(np.array([[(f[0] + f[2]) / 2, (f[1] + f[3]) / 2] for f in yards["fences"]])) if yards["fences"] else None
    gar_tree = cKDTree(np.array([[g[0], g[1]] for g in yards["garages"]])) if yards["garages"] else None
    drv = [r for r in drives["roads"] if r["kind"] == "drive" and r.get("half", 1.5) < 2]
    dmid = cKDTree(np.array([[(r["xz"][0][0] + r["xz"][-1][0]) / 2, (r["xz"][0][1] + r["xz"][-1][1]) / 2] for r in drv]))
    seen_side = set()
    for hi_, k in enumerate(houses):
        it = items[k]; w, d = sc(it); hd = d / 2
        f = np.array([math.sin(it["rotY"]), math.cos(it["rotY"])]); n = -f; t = np.array([n[1], -n[0]])
        c = np.array([it["bx"], it["bz"]]); front = c + f * hd
        dr, seg, rpt = nearest_road(front)
        if dr > 22: continue                                                             # not on a platted frontage
        # the driveway of this house: the nearest drive whose middle is in front of the house
        dj = dmid.query_ball_point(front, 9.0)
        dlat = None
        for j in dj:
            m = (np.array(drv[j]["xz"][0]) + np.array(drv[j]["xz"][-1])) / 2
            if np.dot(m - c, f) > 0: dlat = float(np.dot(m - c, t)); break
        # front walk: door to the public walk (or the road edge)
        stop = seg[5] if seg[5] else seg[4] + 0.6
        door = front + f * 0.2
        L = dr - stop
        if L > 1.0 and not (dlat is not None and abs(dlat) < 2.2):
            e = door + f * L
            walks.append([round(door[0], 2), round(door[1], 2), round(e[0], 2), round(e[1], 2)])
        # foundation shrubs
        for a in np.arange(-w / 2 + 0.9, w / 2 - 0.6, 1.5):
            if abs(a) < 1.3 or (dlat is not None and abs(a - dlat) < 2.4) or rnd.random() < 0.2: continue
            p = front + f * 0.9 + t * a
            shrubs.append([round(p[0], 2), round(p[1], 2), round(0.55 + rnd.random() * 0.4, 2), rnd.randrange(4)])
        # mailbox at the curb, on the far side of the drive from the house's centre
        if dlat is not None:
            side = 1 if dlat >= 0 else -1
            p = rpt + (front - rpt) / max(dr, 1e-6) * (seg[4] + 0.55) + t * (dlat + side * 2.4)
            mail.append([round(p[0], 2), round(p[1], 2), round(math.atan2(-n[0], -n[1]), 3)])
        # side lot lines: halfway to the neighbour on the same frontage, else 4 m past the house
        lat_lines = {}
        for s in (-1, 1):
            best = None
            for j in htree.query_ball_point(c, 30.0):
                if houses[j] == k: continue
                o = hp[j] - c
                along = float(np.dot(o, t)) * s
                if along <= 2 or abs(float(np.dot(o, n))) > 6: continue
                if best is None or along < best: best = along
            lat_lines[s] = (best / 2) if best else (w / 2 + 4.0)
        # a low picket fence on the front lot line for one house in eight
        if rnd.random() < 0.125 and seg[5]:
            pl = front + f * (dr - seg[5] - 1.5)
            ends = sorted([-lat_lines[-1], lat_lines[1]])
            gaps = [(-0.9, 0.9)] + ([(dlat - 1.9, dlat + 1.9)] if dlat is not None else [])
            xs = [ends[0]]
            for g0, g1 in sorted(gaps): xs += [g0, g1]
            xs.append(ends[1])
            for a0, a1 in zip(xs[0::2], xs[1::2]):
                if a1 - a0 > 0.8:
                    for q0, q1 in free_runs(pl + t * a0, pl + t * a1, BLDB | WATERB):
                        pickets.append([round(q0[0], 2), round(q0[1], 2), round(q1[0], 2), round(q1[1], 2)])
        # only lots that have a rear fence get side fences
        rear = c + n * (27.0 - hd)
        if rear_tree is None or rear_tree.query(rear)[0] > 6: continue
        # back to back with a house on the next street: the rear line is halfway between them
        rear_n = 27.0 - hd
        for j in htree.query_ball_point(c, 60.0):
            if houses[j] == k: continue
            o = hp[j] - c; oj = items[houses[j]]
            if np.dot(o, n) > 6 and abs(float(np.dot(o, t))) < 12 and math.sin(oj["rotY"]) * f[0] + math.cos(oj["rotY"]) * f[1] < -0.5: rear_n = min(rear_n, float(np.dot(o, n)) / 2 - 0.3)
        has_gar = gar_tree is not None and gar_tree.query(c + n * (hd + 4.6))[0] < 4.5
        for s in (-1, 1):
            lat = s * lat_lines[s]
            if abs(lat) < w / 2 + 0.8: continue
            drive_side = dlat is not None and np.sign(dlat) == s
            start_n = hd + (10.5 if (drive_side and has_gar) else 0.6)
            if rear_n - start_n < 3: continue
            a = c + n * start_n + t * lat; b = c + n * rear_n + t * lat
            key = (round((a[0] + b[0]) / 4), round((a[1] + b[1]) / 4))
            if key in seen_side: continue
            seen_side.add(key)
            for q0, q1 in free_runs(a, b, BLDB | ROADB | WATERB, first_only=True, skip=1.0):          # stop at the first building, road or water
                side_f.append([round(q0[0], 2), round(q0[1], 2), round(q1[0], 2), round(q1[1], 2)])
            if not drive_side:
                # the return from the house's back corner to the side line, with a 1 m gate gap at the house
                r0 = c + n * (hd - 0.6) + t * s * (w / 2 + 1.0); r1 = c + n * (hd - 0.6) + t * lat
                if np.linalg.norm(r1 - r0) > 0.8: side_f.append([round(r0[0], 2), round(r0[1], 2), round(r1[0], 2), round(r1[1], 2)])
    # the rear fences laid by relay_houses.py: split wherever one runs through a house or across a road
    rear_before = len(yards["fences"])
    clipped = []
    for f_ in yards["fences"]:
        for q0, q1 in free_runs(f_[:2], f_[2:], BLDB | ROADB | WATERB):
            clipped.append([round(q0[0], 2), round(q0[1], 2), round(q1[0], 2), round(q1[1], 2)])
    yards["fences"] = clipped
    print("rear fences", rear_before, "->", len(clipped), "runs after clipping at houses and roads")
    # ---------- shops, offices and industry ----------
    tall = np.array([[it["x"], it["z"]] for it in items if it["h"] >= 30]); ttree = cKDTree(tall)
    downtown = lambda x, z: len(ttree.query_ball_point([x, z], 220.0)) >= 6
    ltree = cKDTree(np.array([[l[0], l[1]] for l in lots])) if lots else None
    new_lots, new_drives, aprons, docks, trailers, chain, dumpsters = [], [], [], [], [], [], []
    moved = 0
    cands = []
    hset = set(houses)
    for k, it in enumerate(items):
        if it.get("kind") == "hero" or k in hset: continue
        s = it["slug"]
        if not any(x in s for x in NEEDS): continue
        w, d = sc(it)
        if max(w, d) < 9 or downtown(it["bx"], it["bz"]): continue
        if ltree is not None and ltree.query([it["bx"], it["bz"]])[0] < max(w, d) / 2 + 35: continue      # it has a lot already
        cands.append((-(w * d), k))
    cands.sort()
    hset = set(houses)
    def carve(pts): poly(pts, MISCB)
    def footprint_clear(k, cx, cz, w, d, phi):
        # free once the building's own footprint is removed
        wn = window(rect(items[k]["bx"], items[k]["bz"], w, d, phi, 1.5))
        if not wn: return False
        view = occ[wn[0]:wn[1], wn[2]:wn[3]]; saved = view[wn[4]].copy(); view[wn[4]] &= ~np.uint8(BLDB)
        ok = rect_free(rect(cx, cz, w, d, phi, 1.5))
        view[wn[4]] = saved
        return ok
    def slope_ok(pts, lim):
        hs = [hgt(x, z) for x, z in pts]; return max(hs) - min(hs) < lim
    def drive_to_road(p):
        dr, seg, q = nearest_road(p)
        if dr > 45: return False
        new_drives.append({"kind": "drive", "xz": [[round(float(p[0]), 1), round(float(p[1]), 1)], [round(float(q[0]), 1), round(float(q[1]), 1)]], "half": 3.0, "driveway": True})
        return True
    def add_chain(p0, p1):
        # split the run wherever it would pass through another building or across a road
        L = float(np.linalg.norm(p1 - p0)); n_ = max(1, int(L / 2.0)); run = None
        for q in range(n_ + 1):
            pt = p0 + (p1 - p0) * (q / n_); cx_, cz_ = cell(*pt); ix, iz = int(round(cx_)), int(round(cz_))
            ok = 0 <= ix < NX and 0 <= iz < NZ and not (occ[iz, ix] & (BLDB | ROADB | WATERB))
            if ok and run is None: run = pt
            if (not ok or q == n_) and run is not None:
                end = pt if ok else p0 + (p1 - p0) * ((q - 1) / n_)
                if np.linalg.norm(end - run) > 2.0: chain.append([round(float(run[0]), 2), round(float(run[1]), 2), round(float(end[0]), 2), round(float(end[1]), 2)])
                run = None
    unserved = []
    for _, k in cands:
        it = items[k]; w, d = sc(it); phi = it["rotY"]
        f = np.array([math.sin(phi), math.cos(phi)]); t = np.array([math.cos(phi), -math.sin(phi)])
        c = np.array([it["bx"], it["bz"]]); front = c + f * d / 2
        dr, seg, rpt = nearest_road(front)
        ind = bool(INDUSTRIAL.search(it["slug"]))
        # its own footprint is not an obstacle to its own lot (the lots are laid clear of it by construction)
        own = window(rect(c[0], c[1], w, d, phi, 1.5))
        if own: occ[own[0]:own[1], own[2]:own[3]][own[4]] &= ~np.uint8(BLDB)
        # the stalls the building needs: one bay and its aisle for a small shop, a double-loaded module (18 m) for most, two for a big box
        depth = 12.5 if w < 16 else (18.0 if w < 45 else 36.0)
        if ind: depth = 12.5
        lw = min(max(w * 1.0, 16.0), 90.0)
        edge = seg[5] if seg[5] else seg[4] + 1.5                                 # back of the sidewalk / verge, from the road centre
        gap = dr - edge                                                           # building front to the back of the walk
        need = depth + 1.5 + 2.0
        placed = None
        if gap >= need:
            placed = ("front", c + f * (d / 2 + 1.5 + depth / 2), lw, depth)
        elif dr < 60 and need - gap <= 40:
            shift = need - gap + 0.5
            nc = c - f * shift
            lp = nc + f * (d / 2 + 1.5 + depth / 2)
            ok = rect_free(rect(nc[0], nc[1], w, d, phi, 1.5)) and rect_free(rect(lp[0], lp[1], lw, depth, phi, -0.6)) and slope_ok(rect(nc[0], nc[1], w, d, phi), 3.0) and slope_ok(rect(lp[0], lp[1], lw, depth, phi), 2.5)
            if ok:
                # move the building back; its old driveway end follows it
                for r in drives["roads"]:
                    for pt in r["xz"]:
                        if math.hypot(pt[0] - front[0], pt[1] - front[1]) < 5: pt[0] = round(pt[0] - f[0] * shift, 1); pt[1] = round(pt[1] - f[1] * shift, 1)
                it["x"] = round(it["x"] - f[0] * shift, 1); it["z"] = round(it["z"] - f[1] * shift, 1); it["bx"] = round(float(nc[0]), 1); it["bz"] = round(float(nc[1]), 1)
                poly(rect(nc[0], nc[1], w, d, phi, 1.5), BLDB)
                c = nc; front = c + f * d / 2; moved += 1
                placed = ("front", lp, lw, depth)
        if placed and not (rect_free(rect(placed[1][0], placed[1][1], placed[2], placed[3], phi, -0.6)) and slope_ok(rect(placed[1][0], placed[1][1], placed[2], placed[3], phi), 2.5)): placed = None
        if placed is None:
            sw = min(max(w * 0.8, 20.0), 50.0)
            for s in (1, -1):
                p = c + t * s * (w / 2 + 2.0 + sw / 2) + f * 0.0
                if rect_free(rect(p[0], p[1], sw, max(d, 18.0), phi, -0.6)) and slope_ok(rect(p[0], p[1], sw, max(d, 18.0), phi), 2.5): placed = ("side", p, sw, max(d, 18.0)); break
        if placed is None:
            p = c - f * (d / 2 + 2.0 + 9.0)
            if rect_free(rect(p[0], p[1], lw, 18.0, phi, -0.6)) and slope_ok(rect(p[0], p[1], lw, 18.0, phi), 2.5): placed = ("rear", p, lw, 18.0)
        site = [rect(c[0], c[1], w, d, phi, 1.0)]
        if placed:
            kind, p, lw_, dep = placed
            lot = [round(float(p[0]), 1), round(float(p[1]), 1), round(lw_, 1), round(dep, 1), round(phi, 4)]
            # the drive: from the lot's street-side edge straight to the road
            edge_pt = p + f * dep / 2 if kind == "front" else p + f * dep / 2
            if drive_to_road(edge_pt):
                new_lots.append(lot); carve(rect(p[0], p[1], lw_, dep, phi, 1.0)); site.append(rect(p[0], p[1], lw_, dep, phi))
            else: placed = None
        if not placed: unserved.append(k)
        if ind:
            # truck apron on the side away from the lot (or behind), docks on the wall it faces
            ad = 24.0
            opts = [("side", 1), ("side", -1), ("rear", 0)]
            for kind, s in opts:
                if kind == "side":
                    p = c + t * s * (w / 2 + ad / 2 + 0.3); aw, adp = ad, d; wall = c + t * s * (w / 2); wn = t * s; along = f; span = d
                else:
                    p = c - f * (d / 2 + ad / 2 + 0.3); aw, adp = w, ad; wall = c - f * (d / 2); wn = -f; along = t; span = w
                pts = rect(p[0], p[1], aw, adp, phi)
                if not (rect_free(rect(p[0], p[1], aw, adp, phi, -0.6)) and slope_ok(pts, 2.5)): continue
                aprons.append([round(float(p[0]), 1), round(float(p[1]), 1), round(aw, 1), round(adp, 1), round(phi, 4)])
                carve(rect(p[0], p[1], aw, adp, phi, 0.5)); site.append(pts)
                nd = max(2, min(8, int(span / 4.5) - 1))
                rot = math.atan2(wn[0], wn[1])
                for q in range(nd):
                    a = (q - (nd - 1) / 2) * 4.2
                    dp = wall + along * a
                    docks.append([round(float(dp[0]), 2), round(float(dp[1]), 2), round(rot, 4)])
                    if rnd.random() < 0.55:
                        tp = dp + wn * 7.4
                        trailers.append([round(float(tp[0]), 2), round(float(tp[1]), 2), round(rot, 4), rnd.randrange(4)])
                drive_to_road(p + (f * adp / 2 if kind == "side" else t * aw / 2))
                break
            # chain-link around the site's bounding box in the building's frame, open on the street side where the drives come in
            allp = np.array([q for r_ in site for q in r_])
            loc = np.stack([(allp - c) @ t, (allp - c) @ f], 1)
            a0, b0 = loc.min(0) - 3.0; a1, b1 = loc.max(0) + 3.0
            W = lambda a, b: c + t * a + f * b
            corners = [W(a0, b0), W(a1, b0), W(a1, b1), W(a0, b1)]
            for i in range(4):
                p0, p1 = corners[i], corners[(i + 1) % 4]
                if i == 2:                                                       # the front side (b1): a 12 m gate in the middle
                    mid = (p0 + p1) / 2; u = (p1 - p0) / max(np.linalg.norm(p1 - p0), 1e-6)
                    for q0, q1 in ((p0, mid - u * 6), (mid + u * 6, p1)):
                        if np.dot(q1 - q0, u) > 1: add_chain(q0, q1)
                    continue
                add_chain(p0, p1)
        else:
            # a dumpster pad behind the shop
            p = c - f * (d / 2 + 1.6) + t * (w / 2 - 2.5)
            if rect_free(rect(p[0], p[1], 2.2, 1.6, phi)): dumpsters.append([round(float(p[0]), 2), round(float(p[1]), 2), round(phi, 4)])
        poly(rect(c[0], c[1], w, d, phi, 1.5), BLDB)                       # the building is an obstacle again, where it now stands
    # ---------- the businesses still without parking: a lot on free ground within 60 m (a shared lot behind the block), unless one already serves them ----------
    second = 0
    for k in unserved:
        it = items[k]; w, d = sc(it); phi = it["rotY"]
        c = np.array([it["bx"], it["bz"]]); f = np.array([math.sin(phi), math.cos(phi)]); t = np.array([math.cos(phi), -math.sin(phi)])
        allp = np.array([[l[0], l[1]] for l in lots + new_lots]) if (lots or new_lots) else np.zeros((0, 2))
        if len(allp) and np.min(np.hypot(*(allp - c).T)) < max(w, d) / 2 + 40: continue          # a lot nearby already serves it
        lw = min(max(w, 16.0), 40.0); dep = 12.5 if w < 30 else 18.0
        done = False
        for rad in (10, 18, 26, 34, 42, 50, 60):
            for ang in np.linspace(0, 2 * math.pi, max(8, int(rad / 2.5)), endpoint=False):
                p = c + (t * math.cos(ang) + f * math.sin(ang)) * (rad + max(w, d) / 2)
                for ph in (phi, phi + math.pi / 2):
                    pts = rect(p[0], p[1], lw, dep, ph)
                    if not (rect_free(rect(p[0], p[1], lw, dep, ph, -0.6)) and slope_ok(pts, 2.5)): continue
                    if not drive_to_road(p): continue
                    new_lots.append([round(float(p[0]), 1), round(float(p[1]), 1), round(lw, 1), round(dep, 1), round(ph, 4)]); carve(rect(p[0], p[1], lw, dep, ph, 1.0))
                    second += 1; done = True; break
                if done: break
            if done: break
    print(f"second pass: {len(unserved)} businesses without a lot, {second} lots on free ground nearby")
    # ---------- write ----------
    lots.extend(new_lots)
    drives["roads"].extend(new_drives)
    yards.update({"walks": walks, "sideFences": side_f, "shrubs": shrubs, "mailboxes": mail, "pickets": pickets, "chain": chain, "aprons": aprons, "docks": docks, "trailers": trailers, "dumpsters": dumpsters})
    json.dump(data, open(os.path.join(R, "city.json"), "w"))
    json.dump(drives, open(os.path.join(R, "driveways.json"), "w"), separators=(",", ":"))
    json.dump(lots, open(os.path.join(R, "parking_lots.json"), "w"), separators=(",", ":"))
    json.dump(yards, open(os.path.join(R, "yards.json"), "w"), separators=(",", ":"))
    json.dump(ytrees, open(os.path.join(R, "yard_trees.json"), "w"), separators=(",", ":"))
    print(f"homes: {len(walks)} front walks, {len(side_f)} side fences, {len(shrubs)} shrubs, {len(mail)} mailboxes, {len(pickets)} picket runs")
    names = {1: 'road', 2: 'water', 4: 'building', 8: 'house lot', 16: 'lot/drive/fence'}
    tally = {}
    for v, n_ in why.items():
        for b, nm in names.items():
            if v & b: tally[nm] = tally.get(nm, 0) + n_
    print("blocked by", tally)
    print(f"businesses: {len(cands)} without a lot -> {len(new_lots)} lots ({moved} buildings moved back), {len(aprons)} truck aprons, {len(docks)} docks, {len(trailers)} trailers, {len(chain)} chain-link runs, {len(dumpsters)} dumpsters")


if __name__ == "__main__":
    main()
