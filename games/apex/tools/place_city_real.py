"""
Place the Ironport buildings on real Detroit parcels (Terra), downtown slice.

Hero buildings go on the parcels of their real-world analogs (the roster names them), generics fill
the remaining improved parcels by size and distance from Campus Martius. Fronts face the nearest street.
Run: python games/apex/tools/place_city_real.py   (after city_plan_real.py, build_region.py)
"""
import json
import math
import os
import cv2
import numpy as np
from scipy.spatial import cKDTree
import real_city as rc
import place_city as pc          # model sizes (HERO / GEN) and district pools

HERE = rc.HERE
OUT = os.path.join(rc.REPO, "public", "games", "apex", "region")
rng = np.random.default_rng(77)

# analog positions (lat, lon). Some real anchors sit outside the downtown pull; those use nearby stand-ins.
ANALOG = {
    "ironport-towers": (42.3292, -83.0397), "harborfront-expo": (42.3263, -83.0507), "founders-plaza": (42.3283, -83.0436),
    "marina-clubhouse": (42.3268, -83.0345), "riverfront-silos": (42.3293, -83.0312), "ferry-terminal": (42.3281, -83.0405),
    "the-guardian": (42.3318, -83.0465), "penobscot-tower": (42.3305, -83.0472), "kestrel-hq": (42.3330, -83.0480),
    "aurelia-hq": (42.3340, -83.0490), "meridian-hq": (42.3280, -83.0455), "halcyon-hq": (42.3287, -83.0415),
    "regent-theatre": (42.3355, -83.0517), "ironport-ballpark": (42.3390, -83.0485), "ironport-dome": (42.3400, -83.0456),
    "majestic-music-hall": (42.3361, -83.0525), "parthenon-casino": (42.3350, -83.0405), "opera-house": (42.3365, -83.0504),
    "market-hall-a": (42.3455, -83.0405), "market-hall-b": (42.3460, -83.0380), "museum-of-art": (42.3445, -83.0520),
    "central-library": (42.3455, -83.0545), "university-hall": (42.3440, -83.0600), "the-temple": (42.3412, -83.0625),
    "central-station": (42.3302, -83.0680), "ironworks-ruins": (42.3240, -83.0680), "foundry-tower": (42.3465, -83.0620),
    "ledger-tower": (42.3335, -83.0510), "old-cathedral": (42.3355, -83.0388), "railyard-roundhouse": (42.3250, -83.0650),
    "city-hall": (42.3325, -83.0450), "ironport-arena": (42.3411, -83.0553), "conservatory": (42.3272, -83.0372),
    "grand-theatre-garage": (42.3345, -83.0505), "woodward-row": (42.3420, -83.0560), "greenway-station": (42.3380, -83.0340),
}


def load_height():
    h = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
    return h


def height_at(h, x, z):
    px = x / rc.MPP + rc.W_MAP / 2
    py = z / rc.MPP + rc.H_MAP / 2
    xi, yi = int(round(px)), int(round(py))
    if xi < 1 or yi < 1 or xi >= rc.W_MAP - 1 or yi >= rc.H_MAP - 1:
        return -99.0
    return float(h[yi, xi])


def main():
    hf = load_height()
    P = json.load(open(os.path.join(HERE, "data", "detroit_parcels.json")))["parcels"]
    st = rc.streets_world()
    seg_pts = []
    for s in st:
        if any(k in s["name"] for k in ("RAMP", "FWY", " I 75", " I 375", " M 10", "CONN")):
            continue
        for a, b in zip(s["pts"][:-1], s["pts"][1:]):
            n = max(int(math.hypot(b[0] - a[0], b[1] - a[1]) / 6), 1)
            for t in range(n + 1):
                seg_pts.append((a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n))
    tree = cKDTree(np.array(seg_pts))
    cm = rc.ll_to_world(rc.X["lon0"], rc.X["lat0"])

    cands = []
    for p in P:
        ring = [rc.ll_to_world(lon, lat) for lon, lat in p["ring"]]
        arr = np.array(ring, np.float32)
        if len(arr) < 3:
            continue
        cx, cz = arr.mean(0)
        if not rc.in_region(cx, cz) or height_at(hf, cx, cz) < 0.8:
            continue
        (rx, rz), (w, h), ang = cv2.minAreaRect(arr)
        if w < 3 or h < 3:
            continue
        # front: toward the nearest street
        dist, idx = tree.query([cx, cz])
        sx, sz = seg_pts[idx]
        vx, vz = sx - cx, sz - cz
        l = math.hypot(vx, vz) or 1
        vx, vz = vx / l, vz / l
        a = math.radians(ang)
        ex = (math.cos(a), math.sin(a))
        ey = (-math.sin(a), math.cos(a))
        axes = [(ex[0], ex[1]), (-ex[0], -ex[1]), (ey[0], ey[1]), (-ey[0], -ey[1])]
        f = max(axes, key=lambda v: v[0] * vx + v[1] * vz)
        # width of the rect measured across the facing direction
        along_e = abs(f[0] * ex[0] + f[1] * ex[1]) > 0.5      # facing along rect x -> frontage is rect height
        front_w, depth = (h, w) if along_e else (w, h)
        cands.append({"id": p["id"], "x": float(rx), "z": float(rz), "f": f, "fw": front_w, "dp": depth, "area": float(w * h),
                      "imp": bool(p.get("imp")), "fa": p.get("fa") or 0, "lot": p.get("lot") or 0, "cmd": math.hypot(rx - cm[0], rz - cm[1])})
    print("candidate parcels", len(cands))
    placed, used = [], set()
    # the Grand Circuit corridor: downtown commercial (office towers, hotels, retail), no houses
    circ = json.load(open(os.path.join(rc.DOCS, "city-circuit-real.json")))["world"]
    circ_tree = cKDTree(np.array(circ))
    CORRIDOR = 240.0

    def emit(kind, slug, size, c, sx=1.0, sz=1.0, sy=1.0):
        fx, fz = c["f"]
        phi = math.atan2(fx, fz)
        x, z = c["x"], c["z"]
        bcx, bcz = size["cx"] * sx, size["cz"] * sz          # body centre in the scaled model
        x -= bcx * math.cos(phi) + bcz * math.sin(phi)
        z -= -bcx * math.sin(phi) + bcz * math.cos(phi)
        placed.append({"kind": kind, "slug": slug, "x": round(x, 1), "z": round(z, 1), "rotY": round(phi, 4),
                       "w": round(size["w"] * sx, 1), "d": round(size["d"] * sz, 1), "h": round(size["h"] * sy, 1),
                       "sx": round(sx, 3), "sy": round(sy, 3), "sz": round(sz, 3), "bx": round(c["x"], 1), "bz": round(c["z"], 1)})

    # ---- street clearance: the drawn road + sidewalk edge plus a margin, per class ----
    import city_plan_real as cpr
    REQ = {"street": 10.2, "arterial": 13.2, "freeway": 12.5, "ramp": 6.5}
    cpts, creq = [], []
    for s in st:
        req = REQ[cpr.classify(s["name"])]
        for a, b in zip(s["pts"][:-1], s["pts"][1:]):
            n = max(int(math.hypot(b[0] - a[0], b[1] - a[1]) / 3), 1)
            for t in range(n + 1):
                cpts.append((a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n))
                creq.append(req)
    cpts_arr = np.array(cpts)
    ctree = cKDTree(cpts_arr)

    def violation(cx, cz, phi, w, d):
        ex = (math.cos(phi), -math.sin(phi))     # local x in world
        ez = (math.sin(phi), math.cos(phi))      # local z, the front
        idxs = ctree.query_ball_point([cx, cz], math.hypot(w, d) / 2 + 32)
        worst, px, pz = 0.0, 0.0, 0.0
        for i in idxs:
            sx, sz = cpts[i]
            dx, dz = sx - cx, sz - cz
            lx = dx * ex[0] + dz * ex[1]
            lz = dx * ez[0] + dz * ez[1] - 1.25                  # the front reaches 2.5 m further (awnings, steps)
            hx, hz = w / 2, d / 2 + 1.25
            qx, qz = max(abs(lx) - hx, 0.0), max(abs(lz) - hz, 0.0)
            inside = abs(lx) < hx and abs(lz) < hz
            viol = creq[i] + min(hx - abs(lx), hz - abs(lz)) if inside else creq[i] - math.hypot(qx, qz)
            if viol > 0.2:
                worst = max(worst, viol)
                l = math.hypot(dx, dz) or 1.0
                px += -dx / l * viol
                pz += -dz / l * viol
        return worst, px, pz

    def clear_fit(c, w, d, max_push):
        phi = math.atan2(c["f"][0], c["f"][1])
        cx, cz = c["x"], c["z"]
        ox, oz = cx, cz
        for _ in range(10):
            worst, px, pz = violation(cx, cz, phi, w, d)
            if worst <= 0.5:
                return dict(c, x=cx, z=cz)
            norm = math.hypot(px, pz) or 1.0
            step = min(worst + 0.5, 4.0)
            cx += px / norm * step
            cz += pz / norm * step
            if math.hypot(cx - ox, cz - oz) > max_push:
                return None
        return None

    # ---- heroes ----
    hero_rects = []
    for slug in sorted(pc.HERO, key=lambda s: -(pc.HERO[s]["w"] * pc.HERO[s]["d"])):
        s = pc.HERO[slug]
        lat, lon = ANALOG.get(slug, (rc.X["lat0"], rc.X["lon0"]))
        ax, az = rc.ll_to_world(lon, lat)
        need = s["w"] * s["d"] * 0.35
        pool = [c for c in cands if c["id"] not in used and c["area"] >= need]
        if not pool:
            pool = [c for c in cands if c["id"] not in used]
        pool.sort(key=lambda c: math.hypot(c["x"] - ax, c["z"] - az))
        chosen = None
        for c in pool[:12]:                          # nearest parcels first, take the first that can be cleared of the street
            f = clear_fit(c, s["w"], s["d"], 45.0)
            if f is not None:
                chosen = (c, f)
                break
        if chosen is None:
            chosen = (pool[0], pool[0])
        c, f = chosen
        used.add(c["id"])
        emit("hero", slug, s, f)
        hero_rects.append((f["x"], f["z"], max(s["w"], s["d"]) / 2 + 6))
    # parcels swallowed by a hero footprint are not built on
    for c in cands:
        if c["id"] in used:
            continue
        for hx, hz, r in hero_rects:
            if math.hypot(c["x"] - hx, c["z"] - hz) < r:
                used.add(c["id"])
                break

    # ---- generics: every parcel gets a building if one fits clear of the street ----
    GEN = pc.GEN
    CORE_SET = [g for g in pc.CORE + pc.MID if g in GEN]
    MID_SET = [g for g in pc.MID + ["townhouse-row", "mixed-use-block"] if g in GEN]
    EDGE_SET = [g for g in pc.EDGE if g in GEN]
    TALL_SET = [g for g in ("midtown-office-tower", "brick-office-block", "modern-loft-office", "downtown-hotel", "apartment-tower", "civic-office-annex", "tech-campus", "corner-office", "mixed-use-block", "parking-deck") if g in GEN]
    COMMERCIAL_SMALL = [g for g in ("coffee-shop", "neighborhood-pharmacy", "neighborhood-diner", "corner-grocery", "strip-mall", "gas-station", "barber-shop") if g in GEN]
    n_gen = n_skipped = 0
    HEROES_ONLY = os.environ.get("HEROES_ONLY", "1") == "1"     # generic buildings come from infill_city.py's zoning plan
    for c in ([] if HEROES_ONLY else cands):
        if c["id"] in used or c["area"] < 90:
            continue
        d = c["cmd"]
        dcirc = float(circ_tree.query([c["x"], c["z"]])[0])
        in_corr = dcirc < CORRIDOR
        if in_corr:
            pool, lo, hi = TALL_SET, 45.0, 130.0
        elif d < 600:
            pool, lo, hi = CORE_SET, 22.0, 85.0
        elif d < 1300:
            pool, lo, hi = MID_SET, 10.0, 40.0
        else:
            pool, lo, hi = EDGE_SET, 5.0, 16.0
        floors = (c["fa"] / (max(c["lot"], 1) * 0.85)) if c["fa"] and c["lot"] else 0
        est = float(np.clip(floors * 3.8, lo, hi)) if c["imp"] and floors and not in_corr else float(rng.uniform(lo, hi))
        options = []
        for sg in set(pool + ([] if in_corr else EDGE_SET)):
            m = GEN[sg]
            sx = min(1.0, (c["fw"] - 1.0) / m["w"])
            sz = min(1.0, (c["dp"] - 1.0) / m["d"])
            if sx < 0.5 or sz < 0.5:
                continue
            bias = 0 if sg in pool else 25                       # the district's own types come first
            options.append((abs(m["h"] * (1.4 if in_corr and sg in pool else 1.0) - est) + rng.random() * 6 + (1.0 - min(sx, sz)) * 30 + bias, sg, sx, sz))
        options.sort()
        done = False
        for _, sg, sx, sz in options[:6]:
            m = GEN[sg]
            f = clear_fit(c, m["w"] * sx, m["d"] * sz, 7.0)
            if f is not None:
                sy = float(np.clip(est / m["h"], 0.85, 2.3)) if in_corr and sg in TALL_SET else 1.0
                emit("generic", sg, m, f, sx, sz, sy)
                n_gen += 1
                done = True
                break
        if not done:
            n_skipped += 1
    print("generic parcels left empty (no model clears the street):", n_skipped)

    # ---- remove building-on-building overlaps (heroes win, then the larger footprint) ----
    def corners(it):
        cx, cz, phi = it["bx"], it["bz"], it["rotY"]
        ex = (math.cos(phi), -math.sin(phi))
        ez = (math.sin(phi), math.cos(phi))
        hw, hd = it["w"] / 2, it["d"] / 2
        return [(cx + ex[0] * sx * hw + ez[0] * sz * hd, cz + ex[1] * sx * hw + ez[1] * sz * hd) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))], (ex, ez)

    def overlap(a, b, margin=3.0):
        ca, axa = corners(a)
        cb, axb = corners(b)
        for ax in (axa[0], axa[1], axb[0], axb[1]):
            pa = [p[0] * ax[0] + p[1] * ax[1] for p in ca]
            pb = [p[0] * ax[0] + p[1] * ax[1] for p in cb]
            if max(pa) < min(pb) + margin or max(pb) < min(pa) + margin:
                return False
        return True

    CELL = 60.0
    grid = {}
    for i, it in enumerate(placed):
        r = math.hypot(it["w"], it["d"]) / 2
        for gx in range(int((it["bx"] - r) // CELL), int((it["bx"] + r) // CELL) + 1):
            for gz in range(int((it["bz"] - r) // CELL), int((it["bz"] + r) // CELL) + 1):
                grid.setdefault((gx, gz), []).append(i)
    dead = set()
    order = sorted(range(len(placed)), key=lambda i: (placed[i]["kind"] != "hero", -(placed[i]["w"] * placed[i]["d"])))
    for i in order:
        if i in dead:
            continue
        a = placed[i]
        r = math.hypot(a["w"], a["d"]) / 2
        near = set()
        for gx in range(int((a["bx"] - r) // CELL), int((a["bx"] + r) // CELL) + 1):
            for gz in range(int((a["bz"] - r) // CELL), int((a["bz"] + r) // CELL) + 1):
                near.update(grid.get((gx, gz), []))
        for j in near:
            if j == i or j in dead or j in order[: order.index(i) + 1]:
                continue
            if overlap(a, placed[j]):
                dead.add(j)                       # the later (smaller, or generic) one goes
    placed = [it for k, it in enumerate(placed) if k not in dead]
    print("removed overlapping buildings:", len(dead))
    n_gen = sum(1 for it in placed if it["kind"] == "generic")
    os.makedirs(OUT, exist_ok=True)
    json.dump({"items": placed, "notes": {"source": "Terra parcels", "heroes": len(hero_rects), "generics": n_gen}}, open(os.path.join(OUT, "city.json"), "w"))
    print("placed", len(placed), "heroes", len(hero_rects), "generics", n_gen)


if __name__ == "__main__":
    main()
