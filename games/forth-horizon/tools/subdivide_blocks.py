"""
Split oversized residential blocks with new local streets, the way a subdivision is laid out.

A city block of houses is two rows of lots back to back: about 70-90 m between the streets, and 150-250 m along them. The street data left many residential blocks
200-400 m across, so after the houses were moved onto lots facing the streets (relay_houses.py) the middle of each block was a huge empty lawn. This pass:

  1. rasterises every road and the water at 2 m and finds the blocks (the land between roads)
  2. for each block that held houses: if it is more than 110 m across, new streets run along its length to cut it into strips of about 80 m;
     if it is more than 280 m long, cross streets cut it about every 200 m
  3. each new street joins the streets at both ends (it runs from road to road), never passes through a non-house building, and is dropped if shorter than 60 m
  4. new streets are local streets ("street", 8.5 m) added to region/city_streets.json (original kept as city_streets.before_subdiv.json; re-running starts from it)

Then run build_city_mask.py, build_curbs.py and relay_houses.py (the houses re-plat onto the new frontages).
"""
import json, math, os, re, shutil
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "forth-horizon", "region")
ROAD = {"street": 8.5, "arterial": 14.0, "freeway": 12.5, "ramp": 5.5}
HOUSE = re.compile(r"house|triplex|duplex|bungalow|colonial|townhouse|ranch|cape-cod|tudor|split-level|cottage|villa|gable")
NEIGH = re.compile(r"daycare|laundromat|bakery|coffee-shop|barber|pet-store|spirits-store|pizza|salon|diner|vet-clinic|pharmacy|corner-grocery|hardware-store")   # small neighbourhood shops and services: they front a street like the houses
G = 2.0                                  # raster metres per pixel
STRIP, MAX_W, CROSS, MAX_L = 70.0, 92.0, 200.0, 280.0      # two rows of lots back to back ~70 m (Detroit blocks run 60-75 m deep); blocks longer than ~280 m get a cross street
load = lambda f: json.load(open(os.path.join(R, f))) if os.path.exists(os.path.join(R, f)) else None


def main():
    src = os.path.join(R, "city_streets.json"), os.path.join(R, "city_streets.before_subdiv.json")
    if not os.path.exists(src[1]): shutil.copy(src[0], src[1])
    streets = json.load(open(src[1]))
    usrc = os.path.join(R, "user_streets.json"), os.path.join(R, "user_streets.before_subdiv.json")
    if not os.path.exists(usrc[1]): shutil.copy(usrc[0], usrc[1])
    ustreets = json.load(open(usrc[1]))
    ustreets["roads"] = [r for r in ustreets["roads"] if not r.get("subdiv")]
    roads = [(s["p"], ROAD.get(s["c"], 8.5)) for s in streets]
    for r in ustreets["roads"]:
        if not r.get("trail"): roads.append((r["xz"], 2 * r.get("half", 3.4)))
    for f, h in (("port_streets.json", 4.0), ("utility_streets.json", 4.0)):
        d = load(f)
        for r in (d["roads"] if d else []):
            if not r.get("trail"): roads.append((r["xz"], 2 * r.get("half", h)))
    cr = load("country_roads.json")
    for r in (cr["roads"] if cr else []):
        if r["kind"] == "paved": roads.append((r["xz"], 2 * r.get("half", 3.6)))
    reg = load("region.json")
    roads += [(reg["coastal_highway"]["xz"], 12.8), (reg["freeway"]["xz"], 20.0)]
    for c in reg["circuits"].values(): roads.append((c["xz"], 14.0))

    # the area the city streets cover
    xs = [p[0] for s in streets for p in s["p"]]; zs = [p[1] for s in streets for p in s["p"]]
    x0, z0, x1, z1 = min(xs) - 50, min(zs) - 50, max(xs) + 50, max(zs) + 50
    W, H = int((x1 - x0) / G), int((z1 - z0) / G)
    px = lambda p: (int((p[0] - x0) / G), int((p[1] - z0) / G))
    road = np.zeros((H, W), np.uint8)
    for pts, w in roads:
        arr = np.array([px(p) for p in pts], np.int32).reshape(-1, 1, 2)
        cv2.polylines(road, [arr], False, 1, max(1, int(round(w / G))))
    # water
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    gx = ((np.arange(W) * G + x0 - hm.get("ox", 0)) / hm["mpp"] + hm["w"] / 2).astype(int).clip(0, hm["w"] - 1)
    gz = ((np.arange(H) * G + z0 - hm.get("oz", 0)) / hm["mpp"] + hm["h"] / 2).astype(int).clip(0, hm["h"] - 1)
    water = hi[np.ix_(gz, gx)] < 2.8
    land = ((road == 0) & ~water).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(land, connectivity=4)

    # which blocks held houses (before the relay moved them), and where the other buildings stand
    base = load("city.json")                                               # the current houses (moved onto lots, and the empty grids platted)
    hb = np.zeros(n, int)
    other = []
    for it in base["items"]:
        i, j = px((it["bx"], it["bz"]))
        if not (0 <= i < W and 0 <= j < H): continue
        small = it.get("kind") != "hero" and max(it["w"], it["d"]) < 22 and (bool(HOUSE.search(it["slug"])) or bool(NEIGH.search(it["slug"])))   # these move onto lots: they do not block a new street
        if small and HOUSE.search(it["slug"]) and "hotel" not in it["slug"]: hb[lab[j, i]] += 1
        if not small: other.append((it["bx"], it["bz"], 0.55 * math.hypot(it["w"], it["d"])))
    blocked = np.zeros((H, W), np.uint8)                                  # a new street may not pass through these
    for x, z, r in other: cv2.circle(blocked, px((x, z)), int(r / G) + 3, 1, -1)

    new, cut = [], 0
    def run_lines(ys, o, d, along, blk):
        """streets through block `blk`: lines through o + d*along_axis*t, offset by ys along the other axis; when a building stands in the way the line
        slides sideways (up to 24 m) to the nearest position where it runs clear from road to road"""
        made = []
        nrm = np.array([-d[1], d[0]])
        for off in ys:
            for slide in (0.0, 8.0, -8.0, 16.0, -16.0, 24.0, -24.0):
                got = one_line(o + off + nrm * slide, d, along, blk)
                if got and sum(math.hypot(l[1][0] - l[0][0], l[1][1] - l[0][1]) for l in got) >= 0.7 * along: made += got; break
        return made
    def one_line(base_p, d, along, blk):
        made = []
        if True:
            t = np.arange(-along / 2 - 30, along / 2 + 30, G)
            P = base_p[None, :] + t[:, None] * d[None, :]
            ii = ((P[:, 0] - x0) / G).astype(int); jj = ((P[:, 1] - z0) / G).astype(int)
            ok = (ii >= 0) & (ii < W) & (jj >= 0) & (jj < H)
            inb = np.zeros(len(t), bool); onroad = np.zeros(len(t), bool); hit = np.zeros(len(t), bool)
            inb[ok] = lab[jj[ok], ii[ok]] == blk; onroad[ok] = road[jj[ok], ii[ok]] > 0; hit[ok] = blocked[jj[ok], ii[ok]] > 0
            k = 0
            while k < len(t):
                if not inb[k]: k += 1; continue
                s = k
                while k < len(t) and inb[k] and not hit[k]: k += 1
                e = k - 1
                L = (e - s) * G
                # it must reach a road at both ends (a street that stops in a field is not a street)
                start_ok = s > 0 and onroad[max(0, s - 4):s].any()
                end_ok = k < len(t) and onroad[k:min(len(t), k + 4)].any()
                if L >= 60.0 and start_ok and end_ok:
                    a = P[max(0, s - 3)]; b = P[min(len(t) - 1, e + 3)]
                    made.append([[round(float(a[0]), 1), round(float(a[1]), 1)], [round(float(b[0]), 1), round(float(b[1]), 1)]])
                while k < len(t) and inb[k] and hit[k]: k += 1
        return made

    for blk in range(1, n):
        if hb[blk] < 4: continue
        ys_, xs_ = np.nonzero(lab == blk)
        pts = np.stack([xs_ * G + x0, ys_ * G + z0], 1).astype(np.float32)
        (cx, cz), (rw, rh), ang = cv2.minAreaRect(pts)
        a = math.radians(ang)
        u = np.array([math.cos(a), math.sin(a)]); v = np.array([-math.sin(a), math.cos(a)])
        if rw < rh: u, v, rw, rh = v, u, rh, rw                         # u along the long side (rw), v across (rh)
        o = np.array([cx, cz])
        lines = []
        if rh > MAX_W:
            m = max(2, int(round(rh / STRIP)))
            lines += run_lines([v * (-rh / 2 + rh * k / m) for k in range(1, m)], o, u, rw, blk)
        if rw > MAX_L:
            m = max(2, int(round(rw / CROSS)))
            lines += run_lines([u * (-rw / 2 + rw * k / m) for k in range(1, m)], o, v, rh, blk)
        if lines: cut += 1
        for l in lines: new.append({"c": "street", "n": "", "p": l, "gen": "subdiv"})
    # ---- second pass: parallel streets too far apart. A block that is open at one end (its streets run out into a field) leaks into the countryside in the
    # raster and is never found as a block; so also look at every pair of neighbouring parallel local streets: if they are more than 110 m apart along a stretch
    # of at least 120 m, lay new streets between them every ~80 m over that stretch ----
    import cv2 as _cv
    # the street data stores a street as many short pieces (one per block): gather collinear pieces into lines (same heading within 5 degrees, same offset within 6 m)
    lines = []
    srcs = [(st["p"], "city") for st in streets + new if st["c"] == "street"]
    srcs += [(r["xz"], "user") for r in ustreets["roads"] if r.get("half", 3.4) <= 5.0 and not r.get("trail") and not r.get("driveway")]
    for pts_, origin in srcs:
        for a_, b_ in zip(pts_[:-1], pts_[1:]):
            a_ = np.array(a_, float); b_ = np.array(b_, float); L = float(np.linalg.norm(b_ - a_))
            if L < 15.0: continue
            u = (b_ - a_) / L
            if u[0] < 0 or (u[0] == 0 and u[1] < 0): u = -u
            nrm = np.array([-u[1], u[0]]); c = float(a_ @ nrm); ta, tb = sorted((float(a_ @ u), float(b_ @ u)))
            for ln in lines:
                if float(ln["u"] @ u) > 0.996 and abs(ln["c"] - c) < 6.0 and ta < ln["t1"] + 40 and tb > ln["t0"] - 40:
                    ln["t0"] = min(ln["t0"], ta); ln["t1"] = max(ln["t1"], tb); ln["user"] = ln["user"] and origin == "user"; break
            else:
                lines.append({"u": u, "nrm": nrm, "c": c, "t0": ta, "t1": tb, "user": origin == "user"})
    zz = load("zones.json"); um = load("user_map.json")
    hulls = [np.array(z["hull"], np.float32).reshape(-1, 1, 2) for z in (zz["zones"] if zz else []) if z["kind"] == "industrial"]
    hulls += [np.array(f["pts"], np.float32).reshape(-1, 1, 2) for f in (um["features"] if um else []) if f["type"] == "zone" and f.get("kind") in ("industrial", "parkland")]
    in_hull = lambda q: any(_cv.pointPolygonTest(h_, (float(q[0]), float(q[1])), False) >= 0 for h_ in hulls)
    par = []
    for i, li in enumerate(lines):
        for j, lj in enumerate(lines):
            if j <= i or float(li["u"] @ lj["u"]) < 0.985: continue
            cj = float((lj["u"] * ((lj["t0"] + lj["t1"]) / 2) + lj["nrm"] * lj["c"]) @ li["nrm"])     # lj's offset in li's frame
            off = cj - li["c"]
            if not (MAX_W < abs(off) < 420.0): continue
            # lj's extent projected onto li's direction
            pa = lj["u"] * lj["t0"] + lj["nrm"] * lj["c"]; pb = lj["u"] * lj["t1"] + lj["nrm"] * lj["c"]
            s0, s1 = sorted((float(pa @ li["u"]), float(pb @ li["u"])))
            t0, t1 = max(li["t0"], s0), min(li["t1"], s1)
            if t1 - t0 < 120.0: continue
            between = False
            for k, lk in enumerate(lines):
                if k in (i, j) or float(li["u"] @ lk["u"]) < 0.985: continue
                ck = float((lk["u"] * ((lk["t0"] + lk["t1"]) / 2) + lk["nrm"] * lk["c"]) @ li["nrm"]) - li["c"]
                if 20 < ck * np.sign(off) < abs(off) - 20:
                    qa = lk["u"] * lk["t0"] + lk["nrm"] * lk["c"]; qb = lk["u"] * lk["t1"] + lk["nrm"] * lk["c"]
                    r0, r1 = sorted((float(qa @ li["u"]), float(qb @ li["u"])))
                    if r1 > t0 + 30 and r0 < t1 - 30: between = True; break
            if between: continue
            a1 = li["u"] * 0 + li["nrm"] * li["c"]
            par.append((a1, li["u"], li["nrm"], off, t0, t1, li["user"] or lj["user"]))
    made2 = 0
    unew = []
    for a1, u, nrm, off, t0, t1, isuser in par:
        k = max(1, int(round(abs(off) / STRIP)) - 1)
        for m in range(1, k + 1):
            o = off * m / (k + 1)
            p0 = a1 + u * (t0 + 4.0) + nrm * o; p1 = a1 + u * (t1 - 4.0) + nrm * o
            mid = (p0 + p1) / 2
            if in_hull(mid): continue
            # cut the line where it would pass through a large building
            n_ = max(2, int(np.hypot(*(p1 - p0)) / 2.0)); run = []; out_runs = []
            for q in range(n_ + 1):
                pt = p0 + (p1 - p0) * q / n_
                ii, jj = int((pt[0] - x0) / G), int((pt[1] - z0) / G)
                ok = 0 <= ii < W and 0 <= jj < H and not blocked[jj, ii] and not water[jj, ii] and not road[jj, ii]     # stops at every street it meets (a junction), never runs along a freeway
                if ok: run.append(pt)
                else:
                    if len(run) * 2.0 >= 60.0: out_runs.append(run)
                    run = []
            if len(run) * 2.0 >= 60.0: out_runs.append(run)
            for r_ in out_runs:
                seg = [[round(float(r_[0][0]), 1), round(float(r_[0][1]), 1)], [round(float(r_[-1][0]), 1), round(float(r_[-1][1]), 1)]]
                if isuser: unew.append({"kind": "paved", "xz": seg, "half": 3.4, "subdiv": True})       # zone streets are drawn as road ribbons: the new one too
                else: new.append({"c": "street", "n": "", "p": seg, "gen": "subdiv"})
                made2 += 1
    json.dump({**ustreets, "roads": ustreets["roads"] + unew}, open(usrc[0], "w"), separators=(",", ":"))
    print("parallel-pair infill streets", made2, "from", len(par), "wide pairs")
    json.dump(streets + new, open(src[0], "w"), separators=(",", ":"))
    print("residential blocks", int((hb >= 4).sum()), "split", cut, "new streets", len(new), "total km", round(sum(math.hypot(s["p"][1][0] - s["p"][0][0], s["p"][1][1] - s["p"][0][1]) for s in new) / 1000, 1))


if __name__ == "__main__":
    main()
