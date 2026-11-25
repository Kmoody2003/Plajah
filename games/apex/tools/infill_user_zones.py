"""
Streets and buildings for the zones the developer drew in the map editor (region/user_map.json), and sprawl along the highways.

What is not drawn stays country: forest, farmland and the dunes keep their land, with no town laid on them. Inside a drawn zone the streets are laid the way that kind of place has them:
  residential  a collector street down the long axis, curving side streets off it on alternate sides, most ending in a cul-de-sac bulb; houses on both sides
  dense        a tight grid of 85 m blocks, every third street an avenue; mixed-use, flats and shops along them, towers at the middle, civic buildings now and then
  industrial   a wide grid of 200 x 150 m blocks; works, warehouses and depots in each block, fronts to the nearest street
  waterfront   a promenade along the long axis with short streets off it; boathouses, boat works, grills and condos
  parkland     nothing built (generated buildings inside are removed)
  farmland     nothing added: the farms and lanes of the country pass already stand
Where zones overlap the most specific wins (dense > industrial > waterfront > residential > parkland > farmland).
Highways get roadside sprawl: fuel, tyres, storage, diners, motels and strip malls near the towns, thinning to farm stands and the odd house and shed in the country.
Items are flagged `userzone` and replaced on every run; streets go to region/user_streets.json (the game draws them).
Run:  IRONPORT_PKG=public/games/apex/ironport python games/apex/tools/infill_user_zones.py
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
CELL = 6.0
rng = np.random.default_rng(909)
GEN = pc.GEN
MPP = rc.MPP
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
REQ = {"street": 10.2, "arterial": 13.2, "freeway": 12.5, "ramp": 6.5}
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)
ok = lambda *n: [x for x in n if x in GEN]

PRIORITY = ["farmland", "parkland", "residential", "waterfront", "industrial", "dense", "commercial", "civic"]
RES = ok("colonial-house", "craftsman-bungalow", "ranch-house", "brick-ranch-house", "cape-cod-house", "split-level-house", "tudor-house", "williamsburg-colonial", "duplex", "maple-triplex")
DENSE = ok("mixed-use-block", "townhouse-row", "rose-garden-apartments", "sibley-apartments", "monroe-residences", "brush-park-lofts", "eastern-market-flats", "milwaukee-junction-lofts", "trumbull-arms", "adams-corner-condos", "brick-office-block", "corner-office")
SHOPS = ok("corner-grocery", "barber-shop", "coffee-shop", "neighborhood-diner", "neighborhood-pharmacy", "neighborhood-bank-branch", "spin-cycle-laundromat", "maple-hardware-store", "corner-crust-bakery", "nail-beauty-salon", "ironport-pizza-kitchen", "corner-spirits-store", "paws-claws-pet-store", "woodward-retail-block")
CIVIC = ok("suburban-church", "elementary-school", "fire-station", "library-branch", "little-acorns-daycare", "maple-post-office", "riverside-community-center", "eighth-precinct-substation")
TOWERS = ok("apartment-tower", "midtown-office-tower", "campus-court-tower", "cass-corridor-tower", "washington-court-tower", "congress-court-tower", "jefferson-court-tower", "witherell-court-tower")
IND = ok("ironworks-machine-shop", "ironworks-foundry", "lakeside-parts-warehouse", "ironport-distribution-center", "ironport-truck-depot", "ironworks-freight-office", "ironworks-salvage-office", "riverside-chemical-storage", "ironport-self-storage", "foundry-works-hub")
WATERF = ok("harbor-boathouse", "harbor-boat-works", "marina-fuel-dock", "port-halcyon-marina-office", "lakeshore-grill", "ferry-waiting-room", "anglers-bait-tackle", "harborview-condos")
ROADSIDE = ok("gas-station", "strip-mall", "auto-repair-shop", "ironport-tire-center", "ironport-self-storage", "splash-car-wash", "crossroads-diner", "maple-hardware-store", "larned-house-hotel", "ironport-pizza-kitchen", "lakeside-parts-warehouse", "ironport-truck-depot", "green-thumb-garden-center")
COUNTRY = ok("farm-stand", "equipment-shed", "hay-barn", "tobacco-barn", "tractor-shed", "rural-general-store", "cider-mill", "farmhouse", "tenant-cottage", "ranch-house")
POOL = {"residential": RES, "dense": DENSE, "industrial": IND, "waterfront": WATERF}


def pca(poly):
    c = poly.mean(axis=0)
    w, v = np.linalg.eigh(np.cov((poly - c).T))
    u = v[:, 1]; vv = v[:, 0]
    return c, u / np.linalg.norm(u), vv / np.linalg.norm(vv)


def main():
    um = json.load(open(os.path.join(OUT, "user_map.json")))
    zones = [f for f in um["features"] if f["type"] == "zone"]
    uroads = [f for f in um["features"] if f["type"] == "road" and f["kind"] != "creek"]
    data = json.load(open(os.path.join(OUT, "city.json")))
    reg = json.load(open(os.path.join(OUT, "region.json")))
    hf = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
    h = np.repeat(np.repeat(hf, 2, 0), 2, 1)[:NZ, :NX]
    gy, gx = np.gradient(hf)
    slope = np.repeat(np.repeat(np.hypot(gx, gy) / MPP, 2, 0), 2, 1)[:NZ, :NX]
    water = h < 2.5
    dist_w = ndi.distance_transform_edt(~water) * CELL

    # ---- zone mask by priority ----
    kind_id = {k: i + 1 for i, k in enumerate(PRIORITY)}
    mask = np.zeros((NZ, NX), np.uint8)
    for k in PRIORITY:
        for f in zones:
            if f["kind"] == k:
                cv2.fillPoly(mask, [np.array([cell(*p) for p in f["pts"]], np.float32).astype(np.int32)], kind_id[k])
    built_kinds = [kind_id[k] for k in ("residential", "waterfront", "industrial", "dense", "commercial", "civic", "parkland")]
    in_built = np.isin(mask, built_kinds)

    # ---- existing items: drop the old far-bank grids, my previous output, and generated buildings inside drawn built zones ----
    keep, dropped = [], 0
    for it in data["items"]:
        ci, cj = int((it["bx"] - X0) / CELL), int((it["bz"] - Z0) / CELL)
        inside = 0 <= ci < NX and 0 <= cj < NZ and in_built[cj, ci]
        gen = it.get("infill") or it.get("rural") or it.get("shore")
        if it.get("farbank") or it.get("userzone") or (inside and gen):
            dropped += 1
            continue
        keep.append(it)
    items = keep
    print("removed", dropped, "old generated buildings")

    occ = np.zeros((NZ, NX), np.uint8)
    occ[water | (slope > 0.20) | (dist_w < 14.0)] = 1

    def fill_poly(grid, pts, v=1):
        cv2.fillPoly(grid, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], v)

    def rect_pts(cx, cz, w, d, e1, e2, grow):
        hw, hd = w / 2 + grow, d / 2 + grow
        return [(cx + e1[0] * a + e2[0] * b, cz + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]

    for s in rc.streets_world():
        wpx = int(math.ceil(2 * REQ[cpr.classify(s["name"])] / CELL)) + 1
        cv2.polylines(occ, [np.array([cell(*q) for q in s["pts"]], np.float32).astype(np.int32)], False, 1, wpx)
    for key, wpx in (("coastal_highway", 6), ("freeway", 8)):
        cv2.polylines(occ, [np.array([cell(*q) for q in reg[key]["xz"]], np.float32).astype(np.int32)], False, 1, wpx)
    for c in reg["circuits"].values():
        cv2.polylines(occ, [np.array([cell(*q) for q in c["xz"]], np.float32).astype(np.int32)], False, 1, 28)
    for fn in ("country_roads.json",):
        p = os.path.join(OUT, fn)
        if os.path.exists(p):
            for r in json.load(open(p))["roads"]:
                cv2.polylines(occ, [np.array([cell(*q) for q in r["xz"]], np.float32).astype(np.int32)], False, 1, 4)
    for f in uroads:
        cv2.polylines(occ, [np.array([cell(*q) for q in f["pts"]], np.float32).astype(np.int32)], False, 1, 6 if f["kind"] == "highway" else 4)
    hw_path = os.path.join(OUT, "shoreline_highway.json")
    if os.path.exists(hw_path):
        cv2.polylines(occ, [np.array([cell(*q) for q in json.load(open(hw_path))["xz"]], np.float32).astype(np.int32)], False, 1, 14)
    for it in items:
        phi = it["rotY"]
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        fill_poly(occ, rect_pts(it["bx"], it["bz"], it["w"], it["d"] + 2.5, e1, e2, 3.0))
    for fn in ("zones.json",):
        pass
    occ_base = occ.copy()

    def land_ok(x, z, kid):
        i, j = int((x - X0) / CELL), int((z - Z0) / CELL)
        return 0 <= i < NX and 0 <= j < NZ and not water[j, i] and dist_w[j, i] >= 14.0 and slope[j, i] < 0.22 and (kid is None or mask[j, i] == kid)

    streets = []

    def add_line(pts, kid, kind, through, curved=False):
        """clip a polyline (list of (x, z)) to land inside the zone kind; each dry run of at least 5 points becomes a street"""
        run = []
        for p in pts:
            if land_ok(p[0], p[1], kid): run.append(p)
            else:
                if len(run) >= 5: streets.append({"kind": "paved", "xz": [[round(a, 1), round(b, 1)] for a, b in run], "zone": kind, "through": through})
                run = []
        if len(run) >= 5: streets.append({"kind": "paved", "xz": [[round(a, 1), round(b, 1)] for a, b in run], "zone": kind, "through": through})

    def line(a, b, step=12.0, wob=0.0, ph=0.0):
        n = max(int(math.hypot(b[0] - a[0], b[1] - a[1]) / step), 2)
        tx, tz = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / L, tx / L
        return [(a[0] + tx * t / n + nx * wob * math.sin(t / n * math.pi * 2.0 + ph), a[1] + tz * t / n + nz * wob * math.sin(t / n * math.pi * 2.0 + ph)) for t in range(n + 1)]

    def bulb(c, d, r=15.0):
        return [(c[0] + math.cos(a) * r + d[0] * r, c[1] + math.sin(a) * r + d[1] * r) for a in np.linspace(0, 2 * math.pi, 14)]

    for f in zones:
        k = f["kind"]
        if k in ("farmland", "parkland"): continue
        kid = kind_id[k]
        poly = np.array(f["pts"], float)
        c, u, v = pca(poly)
        P = (poly - c)
        us, vs = P @ u, P @ v
        u0, u1, v0, v1 = us.min(), us.max(), vs.min(), vs.max()
        pt = lambda a, b: (c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b)
        if k == "residential":
            add_line([pt(a, 0.0) for a in np.arange(u0, u1, 12.0)], kid, k, True)                                    # the collector
            idx = 0
            for a in np.arange(u0 + 70, u1 - 40, 112.0):
                for side in ((-1, 1) if idx % 3 == 0 else ((1,) if idx % 2 else (-1,))):
                    L = (v1 if side > 0 else -v0) * float(rng.uniform(0.55, 0.95))
                    add_line([pt(a + math.sin(b / 90.0) * 7.0, b * side) for b in np.arange(8.0, L, 12.0)], kid, k, False)
                    end = pt(a + math.sin(L / 90.0) * 7.0, L * side)
                    if idx % 3 != 0: add_line(bulb(end, (v[0] * side, v[1] * side)), kid, k, False)                  # a cul-de-sac bulb
                idx += 1
        elif k == "dense":
            nu, nv = int((u1 - u0) / 85.0) + 1, int((v1 - v0) / 85.0) + 1
            for i in range(nu + 1):
                a = u0 + i * 85.0
                add_line([pt(a, b) for b in np.arange(v0, v1, 12.0)], kid, k, i % 3 == 0)
            for j in range(nv + 1):
                b = v0 + j * 85.0
                add_line([pt(a, b) for a in np.arange(u0, u1, 12.0)], kid, k, j % 3 == 0)
        elif k == "industrial":
            for i in range(int((u1 - u0) / 200.0) + 1):
                a = u0 + i * 200.0
                add_line([pt(a, b) for b in np.arange(v0, v1, 12.0)], kid, k, i % 2 == 0)
            for j in range(int((v1 - v0) / 150.0) + 1):
                b = v0 + j * 150.0
                add_line([pt(a, b) for a in np.arange(u0, u1, 12.0)], kid, k, j % 2 == 0)
        elif k == "waterfront":
            # the promenade runs along the long axis on the land side of the middle; short streets go inland from it
            add_line([pt(a, 0.0) for a in np.arange(u0, u1, 12.0)], kid, k, True)
            for a in np.arange(u0 + 40, u1 - 20, 100.0):
                add_line([pt(a, b) for b in np.arange(v0, v1, 12.0)], kid, k, False)
    print("streets", len(streets))
    for s in streets:
        cv2.polylines(occ, [np.array([cell(*q) for q in s["xz"]], np.float32).astype(np.int32)], False, 1, 3 if s["through"] else 2)

    placed, use = [], {}

    def rect_free(x, z, w, d, e1, e2, margin=1.0):
        hw, hd = w / 2 + margin, d / 2 + margin
        a = np.linspace(-hw, hw, max(int(math.ceil(hw * 2 / CELL)), 2) + 1)
        b = np.linspace(-hd, hd, max(int(math.ceil(hd * 2 / CELL)), 2) + 1)
        A, B = np.meshgrid(a, b)
        ci = ((x + e1[0] * A + e2[0] * B - X0) / CELL).astype(int)
        cj = ((z + e1[1] * A + e2[1] * B - Z0) / CELL).astype(int)
        if ci.min() < 0 or cj.min() < 0 or ci.max() >= NX or cj.max() >= NZ:
            return False
        return not occ[cj, ci].any()

    def put(slug, x, z, face, scale=1.0, tag="userzone"):
        m = GEN[slug]
        phi = math.atan2(face[0], face[1])
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        w, d = m["w"] * scale, m["d"] * scale
        if not rect_free(x, z, w, d, e1, e2):
            return False
        fill_poly(occ, rect_pts(x, z, w, d + 1.5, e1, e2, 1.5))
        ox = x - (m["cx"] * scale * math.cos(phi) + m["cz"] * scale * math.sin(phi))
        oz = z - (-m["cx"] * scale * math.sin(phi) + m["cz"] * scale * math.cos(phi))
        placed.append({"kind": "generic", "slug": slug, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(w, 1), "d": round(d, 1), "h": round(m["h"] * scale, 1),
                       "sx": round(scale, 3), "sy": round(scale, 3), "sz": round(scale, 3), "bx": round(x, 1), "bz": round(z, 1), "infill": True, tag: True, "userzone": True})
        use[slug] = use.get(slug, 0) + 1
        return True

    def pick(pool):
        w = np.array([1.0 / (1.0 + 0.3 * use.get(g, 0) / 8.0) for g in pool]); w /= w.sum()
        return pool[int(rng.choice(len(pool), p=w))]

    centres = {id(f): np.array(f["pts"], float).mean(axis=0) for f in zones}
    # ---- buildings along the zone streets ----
    for s in sorted(streets, key=lambda q: -len(q["xz"])):
        pts = np.array(s["xz"], float)
        if len(pts) < 5: continue
        zk = s["zone"]
        # walk the street: stations every few metres, normal from the local direction
        seg = np.hypot(*np.diff(pts, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
        L = cum[-1]
        for side in (-1, 1):
            pos = 6.0
            while pos < L - 6.0:
                i = int(np.searchsorted(cum, pos)); i = min(max(i, 1), len(pts) - 1)
                t = pts[i] - pts[i - 1]; t = t / (np.hypot(*t) or 1.0); nrm = np.array([-t[1], t[0]])
                cen = (pts[i - 1] + pts[i]) / 2
                if zk == "residential": pool = RES if rng.random() > 0.04 else CIVIC
                elif zk == "dense":
                    dcen = min(np.hypot(*(cen - centres[id(f)])) for f in zones if f["kind"] == "dense")
                    r = rng.random()
                    pool = TOWERS if (dcen < 500 and r < 0.12) else CIVIC if r < 0.15 else SHOPS if (s["through"] and r < 0.45) else DENSE
                elif zk == "industrial": pool = IND
                else: pool = WATERF
                slug = pick(pool or RES)
                m = GEN[slug]
                setback = {"residential": 13.0, "dense": 11.0, "industrial": 14.0, "waterfront": 12.0}[zk] + m["d"] / 2 + (4.0 if s["through"] else 0.0)
                px, pz = cen[0] + nrm[0] * side * setback, cen[1] + nrm[1] * side * setback
                if put(slug, px + t[0] * m["w"] / 2, pz + t[1] * m["w"] / 2, -nrm * side, float(rng.uniform(0.95, 1.05))):
                    pos += m["w"] + (3.5 if zk != "dense" else 1.5)
                else:
                    pos += 10.0
    print("zone buildings", len(placed))

    # ---- highway sprawl ----
    n_zone = len(placed)
    built_pts = np.array([np.array(f["pts"], float).mean(axis=0) for f in zones if f["kind"] in ("residential", "dense", "industrial", "waterfront")])
    btree = cKDTree(built_pts) if len(built_pts) else None
    highways = [[tuple(q) for q in f["pts"]] for f in uroads if f["kind"] == "highway"]
    highways.append([tuple(q) for q in reg["coastal_highway"]["xz"]])
    if os.path.exists(hw_path):
        highways.append([tuple(q) for q in json.load(open(hw_path))["xz"]])
    for hwp in highways:
        pts = []
        for a, b in zip(hwp[:-1], hwp[1:]):
            n = max(int(math.hypot(b[0] - a[0], b[1] - a[1]) / 20.0), 1)
            pts += [(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n) for t in range(n)]
        pts = np.array(pts)
        if len(pts) < 4: continue
        for i in range(1, len(pts) - 1):
            t = pts[i + 1] - pts[i - 1]; t = t / (np.hypot(*t) or 1.0); nrm = np.array([-t[1], t[0]])
            dnear = btree.query(pts[i])[0] if btree is not None else 1e9
            density = 0.7 * math.exp(-dnear / 1800.0) + 0.08                            # thick near the towns, thin in the country
            if rng.random() > density: continue
            ci, cj = int((pts[i][0] - X0) / CELL), int((pts[i][1] - Z0) / CELL)
            if not (0 <= ci < NX and 0 <= cj < NZ) or mask[cj, ci] in (kind_id["parkland"],): continue
            urban = dnear < 900
            pool = ROADSIDE if urban or rng.random() < 0.25 else COUNTRY
            slug = pick(pool)
            m = GEN[slug]
            side = 1 if rng.random() < 0.5 else -1
            setback = 22.0 + m["d"] / 2 + float(rng.uniform(0, 20 if urban else 45))
            px, pz = pts[i][0] + nrm[0] * side * setback, pts[i][1] + nrm[1] * side * setback
            put(slug, px, pz, -nrm * side, float(rng.uniform(0.95, 1.08)), tag="sprawl")
    print("sprawl buildings", len(placed) - n_zone, "by model", dict(sorted(use.items(), key=lambda kv: -kv[1])[:10]))

    data["items"] = items + placed
    data["notes"]["userzone"] = len(placed)
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    json.dump({"roads": [{"kind": s["kind"], "xz": s["xz"], "half": 5.0 if s["through"] else 3.4} for s in streets]}, open(os.path.join(OUT, "user_streets.json"), "w"), separators=(",", ":"))
    json.dump({"roads": []}, open(os.path.join(OUT, "farbank_streets.json"), "w"))
    print("total items", len(data["items"]))


if __name__ == "__main__":
    main()
