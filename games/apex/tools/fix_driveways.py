"""
Driveways the way a city lays them out. The first pass (access_and_parking.py) cut a straight 5.2 m asphalt line from a door to the nearest point of any road centre line,
up to 60 m long: through other lots and houses, across the street to its far side, drawn in the street's own asphalt with lane lines, so the neighbourhoods filled with
"streets" that went nowhere. This pass redoes every driveway in region/driveways.json:

  - from the house (or the lot) straight to the CURB of the nearest street: the foot of the perpendicular on the road's centre line, stopped at the road's edge
  - a house driveway is 3.2 m wide and at most 32 m long; a parking lot's entrance 6 m; a farm lane (dirt) up to 160 m
  - it may not cross another street or pass through another building; if it would, the next nearest street is tried, otherwise there is no driveway
  - kind "drive" (paved: concrete, no markings) or "dirt" (farm lanes)

Run after access_and_parking.py:  python games/apex/tools/fix_driveways.py
"""
import json, math, os
import numpy as np
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "apex", "region")
ROAD = {"street": 8.5, "arterial": 14.0, "freeway": 12.5, "ramp": 5.5}       # the same widths as build_city_mask.py
load = lambda f: json.load(open(os.path.join(R, f))) if os.path.exists(os.path.join(R, f)) else None


def main():
    segs = []                                                             # ax, az, bx, bz, half
    def add(pts, half):
        for a, b in zip(pts[:-1], pts[1:]):
            if math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2: segs.append((a[0], a[1], b[0], b[1], half))
    for s in load("city_streets.json") or []: add(s["p"], ROAD.get(s["c"], 8.5) / 2)
    for f, dflt in (("user_streets.json", 3.4), ("port_streets.json", 4.0), ("utility_streets.json", 4.0)):
        d = load(f)
        for r in (d["roads"] if d else []):
            if not r.get("trail"): add(r["xz"], r.get("half", dflt))
    cr = load("country_roads.json")
    for r in (cr["roads"] if cr else []):
        if r["kind"] == "paved": add(r["xz"], r.get("half", 3.6))
    reg = load("region.json")
    add(reg["coastal_highway"]["xz"], 6.4); add(reg["freeway"]["xz"], 10.0)
    sh = load("shoreline_highway.json")
    if sh: add(sh["xz"], 6.0)
    S = np.array(segs, float)
    # sample points along every segment (2 m) to find candidates fast
    pts, owner = [], []
    for i, (ax, az, bx, bz, h) in enumerate(S):
        n = max(1, int(math.hypot(bx - ax, bz - az) / 2.0))
        for k in range(n + 1): pts.append((ax + (bx - ax) * k / n, az + (bz - az) * k / n)); owner.append(i)
    pts = np.array(pts); owner = np.array(owner)
    tree = cKDTree(pts)
    halfOf = S[owner, 4]

    items = load("city.json")["items"]
    B = np.array([[it["bx"], it["bz"], 0.45 * max(it["w"], it["d"])] for it in items])
    btree = cKDTree(B[:, :2])

    def foot(i, p):
        ax, az, bx, bz, h = S[i]
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz
        t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2))
        f = np.array([ax + dx * t, az + dz * t])
        return f, float(np.hypot(*(p - f))), h

    def clear(a, c, own_b, half):
        L = float(np.hypot(*(c - a)))
        n = max(2, int(L / 2.0))
        for k in range(n):
            q = a + (c - a) * (k / n)
            if float(np.hypot(*(q - c))) < 2.0: break                      # the last 2 m meet the curb
            for j in tree.query_ball_point(q, 16.0):
                if float(np.hypot(*(pts[j] - q))) < halfOf[j] + half + 0.3: return False      # it would cross (or run along) another street
            for j in btree.query_ball_point(q, 30.0):
                if j != own_b and float(np.hypot(*(B[j, :2] - q))) < B[j, 2] + half * 0.5: return False   # through someone else's house
        return True

    old = load("driveways.json")["roads"]
    out, stats = [], {"kept": 0, "dropped_long": 0, "dropped_blocked": 0, "dropped_at_curb": 0}
    for r in old:
        a = np.array(r["xz"][0], float)
        farm = r["kind"] == "dirt"
        lot = r.get("half", 2.6) >= 3.0 and not farm
        half = 2.2 if farm else (3.0 if lot else 1.6)
        maxL = 160.0 if farm else (45.0 if lot else 32.0)
        _, bi = btree.query(a); own_b = int(bi)
        cand = {}
        for j in tree.query_ball_point(a, maxL + 15.0):
            i = int(owner[j])
            if i in cand: continue
            f, d, h = foot(i, a)
            cand[i] = (d - h, f, d, h)
        best = None
        for i, (curb, f, d, h) in sorted(cand.items(), key=lambda kv: kv[1][0])[:6]:
            if curb < 1.0: best = "at_curb"; break                           # the door is on the street already: no driveway needed
            if curb > maxL: break
            c = f + (a - f) / max(d, 1e-6) * h                                # stop at the road's edge
            if clear(a, c, own_b, half): best = (c, curb); break
            best = best or "blocked"
        if isinstance(best, tuple):
            c, L = best
            out.append({"kind": "dirt" if farm else "drive", "xz": [[round(float(a[0]), 1), round(float(a[1]), 1)], [round(float(c[0]), 1), round(float(c[1]), 1)]], "half": half, "driveway": True})
            stats["kept"] += 1
        elif best == "at_curb": stats["dropped_at_curb"] += 1
        elif best == "blocked": stats["dropped_blocked"] += 1
        else: stats["dropped_long"] += 1
    json.dump({"roads": out}, open(os.path.join(R, "driveways.json"), "w"), separators=(",", ":"))
    L = np.array([math.hypot(r["xz"][1][0] - r["xz"][0][0], r["xz"][1][1] - r["xz"][0][1]) for r in out])
    print("driveways", len(old), "->", len(out), stats, "length median", round(float(np.median(L)), 1) if len(L) else 0, "max", round(float(L.max()), 1) if len(L) else 0)


if __name__ == "__main__":
    main()
