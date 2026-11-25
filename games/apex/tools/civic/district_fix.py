"""
Fixes what district_audit.py flags, the way the planner would:

  dead_end      a street that stops short of the network is joined to the nearest street within 70 m (a straight link that crosses no building);
                links for city streets go into city_streets.json, the rest into user_streets.json (marked "link")
  no_frontage   a farm building (barn, shed, silo, mill, elevator) gets a dirt farm lane to the nearest road (up to 260 m); any other building a paved
                access drive (6 m, up to 90 m), as long as neither crosses another building or street
  overlap_road  a building standing on a carriageway is removed

Run after district_audit.py; then build_city_mask.py and build_curbs.py, and the audit again.
    python games/apex/tools/civic/district_fix.py
"""
import json, math, os, re
import numpy as np
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "apex", "region")
ROAD = {"street": 8.5, "arterial": 14.0, "freeway": 12.5, "ramp": 5.5}
FARM = re.compile(r"barn|shed|silo|mill|elevator|farm|stable|coop|greenhouse|grain")
load = lambda f: json.load(open(os.path.join(R, f)))
save = lambda f, d: json.dump(d, open(os.path.join(R, f), "w"), separators=(",", ":"))


def main():
    city = load("city_streets.json"); us = load("user_streets.json")
    roads = [(s["p"], ROAD.get(s["c"], 8.5) / 2, "city", i) for i, s in enumerate(city)]
    roads += [(r["xz"], r.get("half", 3.4), "user", i) for i, r in enumerate(us["roads"]) if not r.get("trail")]
    for f in ("port_streets.json", "utility_streets.json"):
        if os.path.exists(os.path.join(R, f)):
            for r in load(f)["roads"]: roads.append((r["xz"], r.get("half", 4.0), "other", -1))
    cr = load("country_roads.json")
    roads += [(r["xz"], r.get("half", 3.6), "other", -1) for r in cr["roads"] if r["kind"] == "paved"]
    reg = load("region.json")
    roads += [(reg["coastal_highway"]["xz"], 6.4, "hw", -1), (reg["freeway"]["xz"], 10.0, "hw", -1)]
    P, H, I = [], [], []
    for ri, (pts, h, k, _) in enumerate(roads):
        for a, b in zip(pts[:-1], pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / 3.0))
            for t in range(n + 1): P.append((a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n)); H.append(h); I.append(ri)
    P = np.array(P); H = np.array(H); I = np.array(I); rt = cKDTree(P)
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    hgt = lambda x, z: float(hi[min(max(int((z - hm.get("oz", 0)) / hm["mpp"] + hm["h"] / 2), 0), hm["h"] - 1), min(max(int((x - hm.get("ox", 0)) / hm["mpp"] + hm["w"] / 2), 0), hm["w"] - 1)])
    items = load("city.json"); B = np.array([[it["bx"], it["bz"], 0.5 * math.hypot(it["w"], it["d"])] for it in items["items"]]); bt = cKDTree(B[:, :2])

    def clear(a, b, skip_road, skip_b=-1, margin=1.0):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(2, int(L / 2.0))
        for k in range(1, n):
            q = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
            if k > n - 3: break
            for j in bt.query_ball_point(q, 40.0):
                if j != skip_b and math.hypot(B[j, 0] - q[0], B[j, 1] - q[1]) < 0.8 * B[j, 2] + margin: return False
            for j in rt.query_ball_point(q, 20.0):
                if I[j] != skip_road and math.hypot(P[j][0] - q[0], P[j][1] - q[1]) < H[j] + 0.5 and k < n - 3: return False
        return True

    # ---- dead ends ----
    links_c, links_u, joined, left = [], [], 0, 0
    for ri, (pts, h, k, src) in enumerate(roads):
        if k not in ("city", "user") or len(pts) < 2: continue
        L = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:]))
        if L <= 60.0: continue
        for e in (pts[0], pts[-1]):
            if [j for j in rt.query_ball_point(e, h + 8.0) if I[j] != ri]: continue
            best = None
            for j in sorted(rt.query_ball_point(e, 70.0), key=lambda j: math.hypot(P[j][0] - e[0], P[j][1] - e[1])):
                if I[j] == ri: continue
                if clear(e, P[j], ri): best = P[j]; break
            if best is None: left += 1; continue
            seg = [[round(e[0], 1), round(e[1], 1)], [round(float(best[0]), 1), round(float(best[1]), 1)]]
            (links_c if k == "city" else links_u).append(seg); joined += 1
    city += [{"c": "street", "n": "", "p": s, "gen": "link"} for s in links_c]
    us["roads"] += [{"kind": "paved", "xz": s, "half": 3.4, "link": True} for s in links_u]
    save("city_streets.json", city); save("user_streets.json", us)
    print("dead ends joined", joined, "(city", len(links_c), "user", len(links_u), ") left", left)

    # ---- frontage ----
    dw = load("driveways.json"); added = 0; nofix = 0; drop = set()
    for bi, it in enumerate(items["items"]):
        if it.get("kind") == "hero": continue
        x, z = it["bx"], it["bz"]
        r_in = 0.5 * min(it["w"], it["d"])
        # on a carriageway
        if any(math.hypot(P[j][0] - x, P[j][1] - z) < r_in + H[j] - 0.5 and roads[I[j]][2] != "hw" for j in rt.query_ball_point([x, z], r_in + 16.0)):
            drop.add(bi); continue
        d, j = rt.query([x, z])
        if d - H[j] <= 45.0 + 0.5 * max(it["w"], it["d"]): continue
        farm = bool(FARM.search(it["slug"]))
        maxL = 260.0 if farm else 45.0                                   # a paved access drive longer than this means the building is in the wrong place: leave it flagged
        done = False
        for j in sorted(rt.query_ball_point([x, z], maxL + 20.0), key=lambda j: math.hypot(P[j][0] - x, P[j][1] - z))[:40]:
            ux, uz = P[j][0] - x, P[j][1] - z; L = math.hypot(ux, uz)
            start = (x + ux / L * (0.5 * max(it["w"], it["d"]) + 1.0), z + uz / L * (0.5 * max(it["w"], it["d"]) + 1.0))
            end = (P[j][0] - ux / L * H[j], P[j][1] - uz / L * H[j])
            grade = abs(hgt(*end) - hgt(*start)) / max(1.0, math.hypot(end[0] - start[0], end[1] - start[1]))
            if grade > (0.15 if farm else 0.10): continue                       # no drive steeper than 10 % (farm lanes 15 %)
            if clear(start, end, I[j], bi):
                dw["roads"].append({"kind": "dirt" if farm else "drive", "xz": [[round(start[0], 1), round(start[1], 1)], [round(end[0], 1), round(end[1], 1)]], "half": 2.2 if farm else 3.0, "driveway": True})
                added += 1; done = True; break
        if not done: nofix += 1
    items["items"] = [it for i, it in enumerate(items["items"]) if i not in drop]
    save("driveways.json", dw); json.dump(items, open(os.path.join(R, "city.json"), "w"))
    print("access drives added", added, "unfixed", nofix, "| buildings on carriageways removed", len(drop))


if __name__ == "__main__":
    main()
