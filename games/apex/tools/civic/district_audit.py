"""
District audit: walks the whole map in 1 km cells and checks what a planner, a zoning board and a civil engineer would flag.

  overlap_road   a building standing on a street's carriageway
  overlap_bldg   two buildings standing in each other
  in_water       a building in the lake or river
  no_frontage    a building more than 45 m from any street (parking-lot buildings excepted)
  dead_end       a street end that joins nothing (and is not a cul-de-sac of under 60 m)
  big_block      land between streets of more than 6 ha with buildings in it (a block that should have been subdivided)

Writes region/district_audit.json and an overview image tools/civic/district_audit.png (cells coloured by problem count).
    python games/apex/tools/civic/district_audit.py
"""
import json, math, os, re
import cv2
import numpy as np
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "apex", "region")
ROAD = {"street": 8.5, "arterial": 14.0, "freeway": 12.5, "ramp": 5.5}
LOT = re.compile(r"tower|office|block|hotel|store|mall|market|bank|hospital|clinic|school|church|warehouse|depot|center|storage|grocery|plant|works|yard|foundry|factory|terminal|station|arena|stadium|hall")
load = lambda f: json.load(open(os.path.join(R, f))) if os.path.exists(os.path.join(R, f)) else None
CELL = 1000.0


def main():
    roads = []                                                            # (pts, half, kind)
    for s in load("city_streets.json") or []: roads.append((s["p"], ROAD.get(s["c"], 8.5) / 2, s["c"]))
    for f, h in (("user_streets.json", 3.4), ("port_streets.json", 4.0), ("utility_streets.json", 4.0)):
        d = load(f)
        for r in (d["roads"] if d else []):
            if not r.get("trail"): roads.append((r["xz"], r.get("half", h), "user"))
    cr = load("country_roads.json")
    for r in (cr["roads"] if cr else []):
        if r["kind"] == "paved": roads.append((r["xz"], r.get("half", 3.6), "country"))
    reg = load("region.json")
    roads += [(reg["coastal_highway"]["xz"], 6.4, "highway"), (reg["freeway"]["xz"], 10.0, "highway")]
    sh = load("shoreline_highway.json")
    if sh: roads.append((sh["xz"], 6.0, "highway"))
    for c in reg["circuits"].values(): roads.append((c["xz"], 7.0, "circuit"))
    tr = load("trench.json")
    trench_pts = np.array([p for l in (tr["lines"] if tr else []) for p, d in zip(l["xz"], l["depth"]) if d > 1.0]) if tr else np.zeros((0, 2))
    # dense samples
    P, H, I = [], [], []
    for ri, (pts, h, k) in enumerate(roads):
        for a, b in zip(pts[:-1], pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / 3.0))
            for t in range(n + 1): P.append((a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n)); H.append(h); I.append(ri)
    P = np.array(P); H = np.array(H); I = np.array(I); rt = cKDTree(P)

    hm = load("height2.json")
    hi = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    wet = lambda x, z: hi[min(max(int((z - hm.get("oz", 0)) / hm["mpp"] + hm["h"] / 2), 0), hm["h"] - 1), min(max(int((x - hm.get("ox", 0)) / hm["mpp"] + hm["w"] / 2), 0), hm["w"] - 1)] < 2.5

    items = load("city.json")["items"]
    dws = load("driveways.json")
    starts = np.array([r["xz"][0] for r in (dws["roads"] if dws else [])])
    dtree = cKDTree(starts) if len(starts) else None
    cells = {}
    def add(x, z, kind, info):
        k = (int(math.floor(x / CELL)), int(math.floor(z / CELL)))
        c = cells.setdefault(k, {"x": (k[0] + 0.5) * CELL, "z": (k[1] + 0.5) * CELL, "n": 0, "issues": {}, "examples": []})
        c["issues"][kind] = c["issues"].get(kind, 0) + 1; c["n"] += 1
        if len(c["examples"]) < 6: c["examples"].append([kind, round(x), round(z), info])
    B = np.array([[it["bx"], it["bz"]] for it in items]); bt = cKDTree(B)
    rad = np.array([0.5 * min(it["w"], it["d"]) for it in items])         # inscribed radius: a true overlap, not a corner graze
    for i, it in enumerate(items):
        x, z = it["bx"], it["bz"]
        if it.get("kind") == "hero": continue
        # on a street
        for j in rt.query_ball_point([x, z], rad[i] + 16.0):
            if math.hypot(P[j][0] - x, P[j][1] - z) < rad[i] + H[j] - 0.5 and roads[I[j]][2] != "circuit":
                add(x, z, "overlap_road", it["slug"]); break
        # in another building
        for j in bt.query_ball_point([x, z], rad[i] + 30.0):
            if j > i and math.hypot(B[j][0] - x, B[j][1] - z) < rad[i] + rad[j] - 1.0:
                add(x, z, "overlap_bldg", it["slug"] + " / " + items[j]["slug"]); break
        if wet(x, z): add(x, z, "in_water", it["slug"])
        d, j = rt.query([x, z])
        has_drive = bool(dtree.query_ball_point([x, z], 0.5 * max(it["w"], it["d"]) + 6.0)) if dtree else False     # an access drive or farm lane counts as frontage
        if d - H[j] > 45.0 + 0.5 * max(it["w"], it["d"]) and not has_drive and not LOT.search(it["slug"]) and not it.get("rural"):
            add(x, z, "no_frontage", it["slug"])
    # dead ends
    for ri, (pts, h, k) in enumerate(roads):
        if k in ("circuit", "highway") or len(pts) < 2: continue
        L = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:]))
        for e in (pts[0], pts[-1]):
            near = [j for j in rt.query_ball_point(e, h + 8.0) if I[j] != ri]
            if not near and L > 60.0 and not (len(trench_pts) and np.min(np.hypot(*(trench_pts - np.array(e)).T)) < 30):
                add(e[0], e[1], "dead_end", k)
    # big blocks (raster of the built area)
    G = 4.0
    x0, z0 = B[:, 0].min() - 200, B[:, 1].min() - 200; x1, z1 = B[:, 0].max() + 200, B[:, 1].max() + 200
    W, Hh = int((x1 - x0) / G), int((z1 - z0) / G)
    road = np.zeros((Hh, W), np.uint8)
    for pts, h, k in roads:
        arr = np.array([((p[0] - x0) / G, (p[1] - z0) / G) for p in pts], np.int32).reshape(-1, 1, 2)
        cv2.polylines(road, [arr], False, 1, max(1, int(2 * h / G)))
    n, lab, stats, cent = cv2.connectedComponentsWithStats((road == 0).astype(np.uint8), connectivity=4)
    counts = np.bincount(lab[((B[:, 1] - z0) / G).astype(int).clip(0, Hh - 1), ((B[:, 0] - x0) / G).astype(int).clip(0, W - 1)], minlength=n)
    for b in range(1, n):
        area = stats[b, cv2.CC_STAT_AREA] * G * G
        if 60000 < area < 3e6 and counts[b] >= 6:
            cx, cz = x0 + cent[b][0] * G, z0 + cent[b][1] * G
            add(cx, cz, "big_block", f"{area / 1e4:.1f} ha, {int(counts[b])} buildings")
    tot = {}
    for c in cells.values():
        for k, v in c["issues"].items(): tot[k] = tot.get(k, 0) + v
    worst = sorted(cells.values(), key=lambda c: -c["n"])[:15]
    json.dump({"totals": tot, "worst": worst}, open(os.path.join(R, "district_audit.json"), "w"), indent=1)
    print("totals", tot)
    for c in worst[:12]: print(round(c["x"]), round(c["z"]), c["n"], c["issues"], c["examples"][:2])
    # overview image
    xs = [k[0] for k in cells]; zs = [k[1] for k in cells]
    img = np.zeros(((max(zs) - min(zs) + 1) * 20, (max(xs) - min(xs) + 1) * 20, 3), np.uint8)
    for k, c in cells.items():
        v = min(255, c["n"] * 8)
        cv2.rectangle(img, ((k[0] - min(xs)) * 20, (k[1] - min(zs)) * 20), ((k[0] - min(xs)) * 20 + 18, (k[1] - min(zs)) * 20 + 18), (0, 255 - v, v), -1)
    cv2.imwrite(os.path.join(HERE, "district_audit.png"), cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))


if __name__ == "__main__":
    main()
