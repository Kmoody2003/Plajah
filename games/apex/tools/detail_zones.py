"""
Detail for the zones the developer drew: what makes a place read as lived in, in the order real places have it.

  residential   neighbourhood centres, one per ~60 ha: a green with trees, an elementary school, a church, a fire station or library, and a short row of shops (grocery, pharmacy, diner, coffee,
                fuel) on the collector street, each with room to park; street trees both sides of every street
  dense         a downtown core: a plaza, towers around it, hotel, department store and parking decks on the avenues, mid-rise flats and offices in a ring, low-rise toward the edge; street trees on avenues
  waterfront    a plaza on the promenade, with the harbour buildings facing it
  parkland      two trail loops (dirt) inside the edge, picnic and service huts at the trailheads, no buildings, a dense cover of trees
  farmland      left as the country passes made it
Buildings in the way of an anchor are removed first; everything is placed square to the street it fronts. Trees go to region/zone_trees.json (same layout as the verge trees), trails to
region/user_streets.json. Items are flagged `userzone` + `anchor`; re-running replaces them. Run before audit_and_seed.py:
  IRONPORT_PKG=public/games/apex/ironport python games/apex/tools/detail_zones.py
"""
import json
import math
import os
import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
import real_city as rc
import place_city as pc

OUT = os.path.join(rc.REPO, "public", "games", "apex", "region")
GEN = pc.GEN
MPP = rc.MPP
CELL = 4.0
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
rng = np.random.default_rng(55)
STAT = {}
DBG = []
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)
ok = lambda *n: [x for x in n if x in GEN]
PRIORITY = ["farmland", "parkland", "residential", "waterfront", "industrial", "dense", "commercial", "civic"]

SCHOOL = ok("elementary-school"); CHURCH = ok("suburban-church"); FIRE = ok("fire-station", "eighth-precinct-substation"); LIB = ok("library-branch", "riverside-community-center", "maple-post-office")
SHOPS = ok("corner-grocery", "neighborhood-pharmacy", "neighborhood-diner", "coffee-shop", "gas-station", "maple-hardware-store", "corner-crust-bakery", "barber-shop")
TOWERS_ALL = ok("apartment-tower", "midtown-office-tower", "campus-court-tower", "cass-corridor-tower", "washington-court-tower", "congress-court-tower", "jefferson-court-tower", "witherell-court-tower", "woodward-plaza-tower")
TOWERS = [g for g in TOWERS_ALL if GEN[g]["w"] <= 46 and GEN[g]["d"] <= 46] or TOWERS_ALL
HOTEL = ok("downtown-hotel", "congress-plaza-hotel", "larned-house-hotel"); STORE = ok("griswold-department-store", "woodward-retail-block"); DECK = ok("parking-deck", "beaubien-parking-garage")
MID = ok("brick-office-block", "sibley-apartments", "monroe-residences", "brush-park-lofts", "eastern-market-flats", "trumbull-arms", "milwaukee-junction-lofts", "mixed-use-block", "rose-garden-apartments", "modern-loft-office")
HUTS = ok("farm-stand", "maple-sugar-shack", "pump-house", "equipment-shed")
HARBOUR = ok("harbor-boathouse", "lakeshore-grill", "ferry-waiting-room", "anglers-bait-tackle", "port-halcyon-marina-office")


def load(fn):
    p = os.path.join(OUT, fn)
    return json.load(open(p)) if os.path.exists(p) else None


def main():
    um = load("user_map.json")
    zones = [f for f in um["features"] if f["type"] == "zone"]
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = [it for it in data["items"] if not it.get("anchor")]
    us = load("user_streets.json")
    us["roads"] = [r for r in us["roads"] if not r.get("trail")]
    hm = load("height2.json")
    hi = np.fromfile(os.path.join(OUT, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    hg = cv2.resize(hi, (NX, NZ), interpolation=cv2.INTER_AREA)
    gy, gx = np.gradient(ndi.gaussian_filter(hg, 1.0)); slope = np.hypot(gx, gy) / CELL
    water = hg < 2.5
    dist_w = ndi.distance_transform_edt(~water) * CELL

    kid = {k: i + 1 for i, k in enumerate(PRIORITY)}
    mask = np.zeros((NZ, NX), np.uint8)
    for k in PRIORITY:
        for f in zones:
            if f["kind"] == k:
                cv2.fillPoly(mask, [np.array([cell(*p) for p in f["pts"]], np.float32).astype(np.int32)], kid[k])
    occ = np.zeros((NZ, NX), np.uint8)
    occ[water | (slope > 0.2) | (dist_w < 20)] = 1

    def rect_pts(cx, cz, w, d, e1, e2, grow=0.0):
        hw, hd = w / 2 + grow, d / 2 + grow
        return [(cx + e1[0] * a + e2[0] * b, cz + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]
    def fill(grid, pts, v=1):
        cv2.fillPoly(grid, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], v)
    def fr(it):
        phi = it["rotY"]; return (math.cos(phi), -math.sin(phi)), (math.sin(phi), math.cos(phi))

    # roads
    road = np.zeros((NZ, NX), np.uint8)
    for r in us["roads"]:
        cv2.polylines(road, [np.array([cell(*q) for q in r["xz"]], np.float32).astype(np.int32)], False, 1, int((2 * r.get("half", 4) + 3) / CELL) + 1)
    occ |= road
    for fn in ("country_roads.json", "port_streets.json"):
        j = load(fn)
        if j:
            for r in j["roads"]: cv2.polylines(occ, [np.array([cell(*q) for q in r["xz"]], np.float32).astype(np.int32)], False, 1, 4)

    def zone_at(x, z):
        i, j = int((x - X0) / CELL), int((z - Z0) / CELL)
        return PRIORITY[mask[j, i] - 1] if 0 <= i < NX and 0 <= j < NZ and mask[j, i] else None

    # which items to keep: remove generated buildings under each anchor lot as we go
    gen_idx = [i for i, it in enumerate(items) if any(it.get(k) for k in ("userzone", "infill", "rural", "shore", "sprawl", "port")) and it.get("kind") != "hero"]
    removed = set()
    def clear_lot(cx, cz, w, d, e1, e2):
        poly = np.array(rect_pts(cx, cz, w, d, e1, e2, 2.0), np.float32).reshape(-1, 1, 2)
        n = 0
        for i in gen_idx:
            if i in removed: continue
            it = items[i]
            if cv2.pointPolygonTest(poly, (float(it["bx"]), float(it["bz"])), True) >= -(max(it["w"], it["d"]) * 0.45):
                removed.add(i); n += 1
        return n

    # occupancy of the buildings that stay
    for it in items:
        e1, e2 = fr(it); fill(occ, rect_pts(it["bx"], it["bz"], it["w"], it["d"] + 2, e1, e2, 2.0))

    placed, trees = [], []
    use = {}
    def pick(pool):
        w = np.array([1.0 / (1.0 + 0.4 * use.get(g, 0)) for g in pool]); w /= w.sum(); g = pool[int(rng.choice(len(pool), p=w))]; use[g] = use.get(g, 0) + 1; return g

    def free(x, z, w, d, e1, e2, margin=1.5):
        hw, hd = w / 2 + margin, d / 2 + margin
        a = np.linspace(-hw, hw, max(int(math.ceil(hw * 2 / CELL)), 2) + 1); b = np.linspace(-hd, hd, max(int(math.ceil(hd * 2 / CELL)), 2) + 1)
        A, B = np.meshgrid(a, b)
        ci = ((x + e1[0] * A + e2[0] * B - X0) / CELL).astype(int); cj = ((z + e1[1] * A + e2[1] * B - Z0) / CELL).astype(int)
        if ci.min() < 0 or cj.min() < 0 or ci.max() >= NX or cj.max() >= NZ: return False
        return not occ[cj, ci].any()

    def put(slug, x, z, face, tag="anchor"):
        m = GEN[slug]; phi = math.atan2(face[0], face[1])
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        STAT[slug] = STAT.get(slug, [0, 0]); STAT[slug][0] += 1
        if not free(x, z, m["w"], m["d"], e1, e2): return False
        STAT[slug][1] += 1
        fill(occ, rect_pts(x, z, m["w"], m["d"] + 1.5, e1, e2, 1.5))
        ox = x - (m["cx"] * math.cos(phi) + m["cz"] * math.sin(phi)); oz = z - (-m["cx"] * math.sin(phi) + m["cz"] * math.cos(phi))
        placed.append({"kind": "generic", "slug": slug, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(m["w"], 1), "d": round(m["d"], 1), "h": round(m["h"], 1),
                       "sx": 1.0, "sy": 1.0, "sz": 1.0, "bx": round(x, 1), "bz": round(z, 1), "infill": True, "userzone": True, tag: True})
        return True

    # clear a lot, then put the building into it (fronts to the street)
    def place_anchor(slug, p, nrm, side, setback_extra=0.0, tan=None):
        # try a few positions along the street: the first may sit on a cross street
        for sh in ((0.0, 8.0, -8.0, 16.0, -16.0, 24.0, -24.0, 32.0, -32.0, 40.0, -40.0) if tan is not None else (0.0,)):
            if place_anchor1(slug, p + (tan * sh if tan is not None else 0.0), nrm, side, setback_extra): return True
        return False

    def place_anchor1(slug, p, nrm, side, setback_extra=0.0):
        m = GEN[slug]
        c = p + nrm * side * (9.0 + m["d"] / 2 + setback_extra)
        face = -nrm * side
        phi = math.atan2(face[0], face[1]); e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        n = clear_lot(c[0], c[1], m["w"], m["d"], e1, e2)
        # the lot's footprint is free now: forget the removed buildings' cells
        if n:
            for i in removed:
                it = items[i]
                if it.get("_freed"): continue
                a1, a2 = fr(it); fill(occ, rect_pts(it["bx"], it["bz"], it["w"], it["d"] + 2, a1, a2, 2.0), 0); it["_freed"] = True
            fill(occ, rect_pts(0, 0, 0, 0, (1, 0), (0, 1)), 0)
            # re-block roads, water and steep ground over the cells just freed
            occ[:] |= road; occ[:] |= (water | (slope > 0.2) | (dist_w < 20)).astype(np.uint8)
        okp = put(slug, c[0], c[1], face)
        if not okp and slug in TOWERS and len(DBG) < 4:
            hw, hd = m['w'] / 2, m['d'] / 2
            ci0, ci1 = int((c[0] - hw - X0) / CELL), int((c[0] + hw - X0) / CELL); cj0, cj1 = int((c[1] - hd - Z0) / CELL), int((c[1] + hd - Z0) / CELL)
            sub = (slice(cj0, cj1 + 1), slice(ci0, ci1 + 1))
            DBG.append((slug, round(float(c[0])), round(float(c[1])), int(occ[sub].sum()), int(road[sub].sum()), int(water[sub].sum()), int((slope[sub] > 0.2).sum()), int((dist_w[sub] < 20).sum()), occ[sub].size))
        return okp

    # streets by zone, with their local direction
    def streets_in(kind):
        out = []
        for r in us["roads"]:
            pts = np.array(r["xz"], float)
            if len(pts) < 5: continue
            mid = pts[len(pts) // 2]
            if zone_at(*mid) == kind: out.append((pts, r.get("half", 4.0)))
        return out
    def along(pts, spacing):
        seg = np.hypot(*np.diff(pts, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
        for s in np.arange(spacing / 2, cum[-1], spacing):
            i = min(max(int(np.searchsorted(cum, s)), 1), len(pts) - 1)
            t = pts[i] - pts[i - 1]; t = t / (np.hypot(*t) or 1.0)
            yield (pts[i - 1] + pts[i]) / 2, t, np.array([-t[1], t[0]])

    # ---- street trees ----
    def add_tree(x, z, conifer=False):
        trees.append([round(float(x), 1), round(float(z), 1), 1 if conifer else 0, round(float(rng.random()), 3), round(0.55 + float(rng.random()) * 0.35, 2)])
    cnt_try = {}
    for kind, every in (("residential", 17.0), ("dense", 24.0)):
        for pts, half in streets_in(kind):
            for p, t, n in along(pts, every):
                for side in (-1, 1):
                    q = p + n * side * (half + 5.0)
                    cnt_try[kind] = cnt_try.get(kind, 0) + 1
                    if rng.random() < (0.85 if kind == "residential" else 0.7) and not occ[int((q[1] - Z0) / CELL), int((q[0] - X0) / CELL)]:
                        add_tree(q[0] + rng.normal(0, 0.7), q[1] + rng.normal(0, 0.7), kind == "residential" and rng.random() < 0.12)
    print("tries", cnt_try, "street trees", len(trees), "streets", {k: len(streets_in(k)) for k in ("residential", "dense", "waterfront")})

    # ---- residential centres ----
    anchors = 0
    for f in zones:
        if f["kind"] != "residential": continue
        poly = np.array(f["pts"], float)
        area = 0.5 * abs(np.dot(poly[:, 0], np.roll(poly[:, 1], 1)) - np.dot(poly[:, 1], np.roll(poly[:, 0], 1)))
        k = max(1, int(area / 6e5))
        sts = [(pts, half) for pts, half in streets_in("residential") if cv2.pointPolygonTest(poly.astype(np.float32).reshape(-1, 1, 2), (float(pts[len(pts) // 2][0]), float(pts[len(pts) // 2][1])), False) >= 0]
        through = [s for s in sts if s[1] >= 5.0] or sts
        if not through: continue
        # k centres spread over the zone: k-means on the through-street points
        P = np.concatenate([pts[::6] for pts, _ in through])
        if len(P) < k: k = 1
        cent = P[rng.choice(len(P), k, replace=False)]
        for _ in range(8):
            lab = np.argmin(((P[:, None] - cent[None]) ** 2).sum(-1), axis=1)
            for c in range(k):
                if (lab == c).any(): cent[c] = P[lab == c].mean(axis=0)
        tree = cKDTree(P)
        for c in cent:
            _, pi = tree.query(c); site = P[pi]
            # the street it is on, direction there
            best = None
            for pts, half in through:
                d = np.hypot(*(pts - site).T); j = int(np.argmin(d))
                if best is None or d[j] < best[0]: best = (d[j], pts, j)
            _, pts, j = best
            j = min(max(j, 1), len(pts) - 1); t = pts[j] - pts[j - 1]; t = t / (np.hypot(*t) or 1.0); n = np.array([-t[1], t[0]])
            # a green on one side, the school and church on the other, shops along the street
            green = site + n * 1.0 * (9 + 40) + t * 0
            gx_, gz_ = green; gcells = (int((gz_ - Z0) / CELL), int((gx_ - X0) / CELL))
            e1, e2 = (t[0], -t[1]), (t[1], t[0])
            e1 = (-n[0], n[1]); e2 = (n[0], n[1])
            n0 = clear_lot(site[0] + n[0] * 50, site[1] + n[1] * 50, 90, 80, (t[0], t[1]), (n[0], n[1]))
            for _t in range(26):                                                  # trees on the green
                q = site + n * (9 + 8 + rng.random() * 66) + t * (rng.random() * 80 - 40)
                add_tree(q[0], q[1], rng.random() < 0.1)
            fill(occ, [tuple(site + n * 9 + t * 45), tuple(site + n * 9 - t * 45), tuple(site + n * 90 - t * 45), tuple(site + n * 90 + t * 45)], 1)    # keep it open
            ok_cnt = 0
            for slug_pool, off in ((SCHOOL, -1), (CHURCH, 1)):
                if slug_pool and place_anchor(pick(slug_pool), site + t * (off * 85), n, -1, 0.0, t): ok_cnt += 1
            for pool, off in ((FIRE, -2), (LIB, 2)):
                if pool and place_anchor(pick(pool), site + t * (off * 85), n, -1, 0.0, t): ok_cnt += 1
            for i in range(-3, 4):
                if i == 0: continue
                if SHOPS and place_anchor(pick(SHOPS), site + t * (i * 38), n, 1, 10.0, t): ok_cnt += 1
            anchors += ok_cnt
    print("residential anchors", anchors)

    # ---- dense core ----
    for f in zones:
        if f["kind"] != "dense": continue
        poly = np.array(f["pts"], float)
        sts = streets_in("dense")
        through = [s for s in sts if s[1] >= 5.0] or sts
        if not through: continue
        c = np.array(f["pts"], float).mean(axis=0)
        P = np.concatenate([pts[::4] for pts, _ in through])
        _, pi = cKDTree(P).query(c); core = P[pi]
        # towers, civic and mid-rise on a lattice around the core, each turned to face the nearest street; a plaza stays open at the centre
        samp = np.concatenate([np.array(list(zip(pts[:, 0], pts[:, 1])))[::2] for pts, _ in sts]); stree = cKDTree(samp)
        cand = [(core[0] + dx, core[1] + dz) for dx in range(-320, 321, 22) for dz in range(-320, 321, 22)]
        cand.sort(key=lambda q: float(np.hypot(q[0] - core[0], q[1] - core[1])) + rng.normal(0, 8))
        n_t = n_c = n_m = 0
        for q in cand:
            dc = float(np.hypot(q[0] - core[0], q[1] - core[1]))
            if dc < 38 or zone_at(q[0], q[1]) != "dense": continue
            d, k = stree.query(q)
            if d < 14 or d > 60: continue
            to = samp[k] - np.array(q); face = to / (np.hypot(*to) or 1.0)
            if dc < 190 and n_t < 14: pool = TOWERS; kindc = "t"
            elif dc < 260 and n_c < 10: pool = HOTEL + STORE + DECK; kindc = "c"
            elif n_m < 60: pool = MID; kindc = "m"
            else: continue
            if not pool: continue
            slug = pick(pool); m = GEN[slug]
            phi = math.atan2(face[0], face[1]); e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
            clear_lot(q[0], q[1], m["w"], m["d"], e1, e2)
            for i in list(removed):
                it = items[i]
                if it.get("_freed"): continue
                a1, a2 = fr(it); fill(occ, rect_pts(it["bx"], it["bz"], it["w"], it["d"] + 2, a1, a2, 2.0), 0); it["_freed"] = True
            occ[:] |= road; occ[:] |= (water | (slope > 0.2) | (dist_w < 20)).astype(np.uint8)
            if put(slug, q[0], q[1], face):
                anchors += 1
                if kindc == "t": n_t += 1
                elif kindc == "c": n_c += 1
                else: n_m += 1
        print("dense core: towers", n_t, "civic/hotel/stores", n_c, "mid-rise", n_m)
        for _ in range(30):
            q = core + rng.normal(0, 28, 2); add_tree(q[0], q[1])
    print("anchors incl. dense core", anchors)

    # ---- waterfront plaza ----
    for f in zones:
        if f["kind"] != "waterfront": continue
        sts = streets_in("waterfront")
        if not sts or not HARBOUR: continue
        pts, half = max(sts, key=lambda s: len(s[0]))
        for p, t, n in along(pts, 70.0):
            for side in (-1, 1):
                if place_anchor(pick(HARBOUR), p, n, side, 4.0): anchors += 1
    # ---- parkland: trails and trees ----
    trails = []
    for f in zones:
        if f["kind"] != "parkland": continue
        poly = np.array(f["pts"], np.float32)
        # clear buildings inside, make two loops inside the edge
        for i in gen_idx:
            it = items[i]
            if i not in removed and cv2.pointPolygonTest(poly.reshape(-1, 1, 2), (float(it["bx"]), float(it["bz"])), False) >= 0 and zone_at(it["bx"], it["bz"]) == "parkland":
                removed.add(i)
        c = poly.mean(axis=0)
        for scale, ph in ((0.55, 0.0), (0.3, 1.0)):
            loop = []
            for a in np.linspace(0, 2 * math.pi, 40):
                p = c + (poly[int((a / (2 * math.pi)) * len(poly)) % len(poly)] - c) * scale * (1 + 0.15 * math.sin(3 * a + ph))
                loop.append((float(p[0]), float(p[1])))
            keep = [q for q in loop if zone_at(*q) == "parkland" and not water[int((q[1] - Z0) / CELL), int((q[0] - X0) / CELL)]]
            if len(keep) > 8: trails.append({"kind": "dirt", "xz": [[round(a, 1), round(b, 1)] for a, b in keep + [keep[0]]], "half": 1.6})
        x0_, z0_, x1_, z1_ = poly[:, 0].min(), poly[:, 1].min(), poly[:, 0].max(), poly[:, 1].max()
        for _ in range(int(area_of(poly) / 900.0)):
            q = (rng.uniform(x0_, x1_), rng.uniform(z0_, z1_))
            if cv2.pointPolygonTest(poly.reshape(-1, 1, 2), q, False) >= 0 and not water[int((q[1] - Z0) / CELL), int((q[0] - X0) / CELL)]:
                add_tree(q[0], q[1], rng.random() < 0.35)
        for tr in trails[-2:]:
            a = np.array(tr["xz"][0])
            if HUTS: put(pick(HUTS), a[0] + 14, a[1], (0, 1))
    print("trails", len(trails), "trees total", len(trees))

    items = [it for i, it in enumerate(items) if i not in removed]
    for it in items: it.pop("_freed", None)
    data["items"] = items + placed
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    roads = [r for r in us["roads"] if not r.get("trail")]
    for t in trails: t["trail"] = True
    json.dump({"roads": roads + trails}, open(os.path.join(OUT, "user_streets.json"), "w"), separators=(",", ":"))
    json.dump(trees, open(os.path.join(OUT, "zone_trees.json"), "w"), separators=(",", ":"))
    print({k: v for k, v in sorted(STAT.items(), key=lambda kv: -kv[1][0])[:8]})
    print("DBG", DBG)
    print("buildings removed", len(removed), "placed", len(placed))


def area_of(poly):
    return 0.5 * abs(np.dot(poly[:, 0], np.roll(poly[:, 1], 1)) - np.dot(poly[:, 1], np.roll(poly[:, 0], 1)))


if __name__ == "__main__":
    main()
