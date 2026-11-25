"""
New neighbourhoods where the map has houses and streets in its texture but the game has no street data: the dense grids on the river's west bank (north and south of the port).

1. Streets are traced from the map texture (region/albedo.jpg): in each district box the long pale lines are the streets; they are written to region/farbank_streets.json in the same
   format as country_roads.json (the game draws and drives them).
2. Buildings go along those streets, both sides, fronts to the street, by kind: houses on the quiet streets, mixed-use, shops, flats and civic buildings on the through streets, and a
   few towers at the centre of each district. Free land is what is not water, steep, a road or race course, or an existing building.
Items are flagged `farbank` and replaced on every run.
Run after infill_city.py, infill_rural.py and infill_waterfront.py:  IRONPORT_PKG=public/games/apex/ironport python games/apex/tools/infill_farbank.py
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
rng = np.random.default_rng(4242)
GEN = pc.GEN
MPP = rc.MPP
W, H = rc.W_MAP * MPP, rc.H_MAP * MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2
REQ = {"street": 10.2, "arterial": 13.2, "freeway": 12.5, "ramp": 6.5}
cell = lambda x, z: ((x - X0) / CELL, (z - Z0) / CELL)
ok = lambda *names: [n for n in names if n in GEN]

# districts in map pixels: outline, angle of the street grid (the north bank grid is rotated about 27 degrees), block sizes in metres (along, across)
DISTRICTS = [
    ("Northbank", [(1040, 4), (1198, 4), (1196, 62), (1180, 95), (1165, 130), (1150, 170), (1125, 195), (1085, 182), (1055, 168), (1048, 120)], -27.0, 130.0, 85.0),
    ("Southbank", [(1050, 640), (1376, 640), (1376, 768), (1050, 768)], 0.0, 150.0, 95.0),
]
RES = ok("colonial-house", "craftsman-bungalow", "ranch-house", "brick-ranch-house", "cape-cod-house", "split-level-house", "tudor-house", "williamsburg-colonial", "duplex", "maple-triplex")
DENSE = ok("mixed-use-block", "townhouse-row", "rose-garden-apartments", "sibley-apartments", "monroe-residences", "brush-park-lofts", "eastern-market-flats", "milwaukee-junction-lofts", "trumbull-arms", "adams-corner-condos")
SHOPS = ok("corner-grocery", "barber-shop", "coffee-shop", "neighborhood-diner", "neighborhood-pharmacy", "neighborhood-bank-branch", "spin-cycle-laundromat", "maple-hardware-store", "corner-crust-bakery", "nail-beauty-salon", "ironport-pizza-kitchen", "corner-spirits-store", "auto-repair-shop", "gas-station", "strip-mall", "paws-claws-pet-store")
CIVIC = ok("suburban-church", "elementary-school", "fire-station", "library-branch", "little-acorns-daycare", "maple-post-office", "riverside-community-center", "eighth-precinct-substation")
TOWERS = ok("apartment-tower", "midtown-office-tower", "campus-court-tower", "cass-corridor-tower", "brick-office-block", "cass-avenue-offices")


def grid_streets(poly, theta, along, across, land_ok):
    """a rotated street grid inside a polygon (map pixels): lines every `along` and `across` metres, kept where land_ok(x, z) holds; returns (a, b, through) in world metres"""
    pts = np.array([[(p[0] - rc.W_MAP / 2) * MPP, (p[1] - rc.H_MAP / 2) * MPP] for p in poly], np.float32)
    c = pts.mean(axis=0)
    th = math.radians(theta)
    d1 = np.array([math.sin(th), -math.cos(th)])          # the main streets run roughly north-south, turned by theta
    d2 = np.array([math.cos(th), math.sin(th)])
    R = float(np.abs(pts - c).max()) * 1.5
    out = []
    for fam, (d, n, sp) in enumerate(((d1, d2, across), (d2, d1, along))):
        k0 = int(-R / sp)
        for k in range(k0, -k0 + 1):
            o = c + n * k * sp
            seg, run = [], []
            for t in np.arange(-R, R, 10.0):
                q = o + d * t
                if cv2.pointPolygonTest(pts.reshape(-1, 1, 2), (float(q[0]), float(q[1])), False) >= 0 and land_ok(q[0], q[1]):
                    run.append(q)
                else:
                    if len(run) >= 4: seg.append(run)
                    run = []
            if len(run) >= 4: seg.append(run)
            for r in seg:
                out.append((r[0].tolist(), r[-1].tolist(), (k % 3 == 0) if fam == 1 else (k % 4 == 0)))
    return out


def main():
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = [it for it in data["items"] if not it.get("farbank")]
    reg = json.load(open(os.path.join(OUT, "region.json")))
    img = cv2.imread(os.path.join(OUT, "albedo.jpg"))
    hf = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
    h = np.repeat(np.repeat(hf, 2, 0), 2, 1)[:NZ, :NX]
    gy, gx = np.gradient(hf)
    slope = np.repeat(np.repeat(np.hypot(gx, gy) / MPP, 2, 0), 2, 1)[:NZ, :NX]
    water = h < 2.0
    dist_w = ndi.distance_transform_edt(~water) * CELL
    occ = np.zeros((NZ, NX), np.uint8)
    occ[water | (slope > 0.13) | (dist_w < 14.0)] = 1

    def fill_poly(grid, pts):
        cv2.fillPoly(grid, [np.array([cell(*p) for p in pts], np.float32).astype(np.int32)], 1)

    def rect_pts(cx, cz, w, d, e1, e2, grow):
        hw, hd = w / 2 + grow, d / 2 + grow
        return [(cx + e1[0] * a + e2[0] * b, cz + e1[1] * a + e2[1] * b) for a, b in ((-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd))]

    # existing roads and buildings
    for s in rc.streets_world():
        wpx = int(math.ceil(2 * REQ[cpr.classify(s["name"])] / CELL)) + 1
        cv2.polylines(occ, [np.array([cell(*q) for q in s["pts"]], np.float32).astype(np.int32)], False, 1, wpx)
    for key, wpx in (("coastal_highway", 6), ("freeway", 8)):
        cv2.polylines(occ, [np.array([cell(*q) for q in reg[key]["xz"]], np.float32).astype(np.int32)], False, 1, wpx)
    for c in reg["circuits"].values():
        cv2.polylines(occ, [np.array([cell(*q) for q in c["xz"]], np.float32).astype(np.int32)], False, 1, 28)
    cr = os.path.join(OUT, "country_roads.json")
    if os.path.exists(cr):
        for r in json.load(open(cr))["roads"]:
            cv2.polylines(occ, [np.array([cell(*q) for q in r["xz"]], np.float32).astype(np.int32)], False, 1, 4)
    for it in items:
        phi = it["rotY"]
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        fill_poly(occ, rect_pts(it["bx"], it["bz"], it["w"], it["d"] + 2.5, e1, e2, 3.0))
    for z in json.load(open(os.path.join(OUT, "zones.json")))["zones"]:                    # the industrial yards and waterfront rows already there
        fill_poly(occ, [tuple(p) for p in z["hull"]])

    # new streets: a grid in each district, on dry land, clear of the city that already has streets
    city_pts = np.array([q for st in rc.streets_world() for q in st["pts"]], np.float32)
    city_tree = cKDTree(city_pts)
    def land_ok(x, z):
        i, j = int((x - X0) / CELL), int((z - Z0) / CELL)
        if not (0 <= i < NX and 0 <= j < NZ) or water[j, i] or dist_w[j, i] < 18.0:
            return False
        return city_tree.query([x, z])[0] > 45.0
    streets = []
    for name, poly, theta, along, across in DISTRICTS:
        segs = grid_streets(poly, theta, along, across, land_ok)
        for a_, b_, through in segs:
            streets.append({"kind": "paved", "xz": [[round(a_[0], 1), round(a_[1], 1)], [round(b_[0], 1), round(b_[1], 1)]], "district": name, "through": through, "len": math.hypot(b_[0] - a_[0], b_[1] - a_[1]) / MPP})
        print(name, "streets", len(segs))
    json.dump({"roads": [{"kind": s["kind"], "xz": s["xz"]} for s in streets]}, open(os.path.join(OUT, "farbank_streets.json"), "w"), separators=(",", ":"))
    for s in streets:
        cv2.polylines(occ, [np.array([cell(*q) for q in s["xz"]], np.float32).astype(np.int32)], False, 1, 3)

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

    def put(slug, x, z, face, scale=1.0):
        m = GEN[slug]
        phi = math.atan2(face[0], face[1])
        e1 = (math.cos(phi), -math.sin(phi)); e2 = (math.sin(phi), math.cos(phi))
        w, d = m["w"] * scale, m["d"] * scale
        if not rect_free(x, z, w, d, e1, e2):
            return False
        fill_poly(occ, rect_pts(x, z, w, d + 1.5, e1, e2, 1.5))
        bcx, bcz = m["cx"] * scale, m["cz"] * scale
        ox = x - (bcx * math.cos(phi) + bcz * math.sin(phi))
        oz = z - (-bcx * math.sin(phi) + bcz * math.cos(phi))
        placed.append({"kind": "generic", "slug": slug, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(w, 1), "d": round(d, 1), "h": round(m["h"] * scale, 1),
                       "sx": round(scale, 3), "sy": round(scale, 3), "sz": round(scale, 3), "bx": round(x, 1), "bz": round(z, 1), "infill": True, "farbank": True})
        use[slug] = use.get(slug, 0) + 1
        return True

    def pick(pool):
        w = np.array([1.0 / (1.0 + 0.3 * use.get(g, 0) / 8.0) for g in pool]); w /= w.sum()
        return pool[int(rng.choice(len(pool), p=w))]

    centres = {d[0]: np.array(d[1], np.float32).mean(axis=0) for d in DISTRICTS}
    # through streets: every street that is long, or every third one; the rest are quiet streets
    for si, s in enumerate(sorted(streets, key=lambda t: -t["len"])):
        (ax, az), (bx, bz) = s["xz"]
        L = math.hypot(bx - ax, bz - az)
        if L < 36: continue
        t = np.array([(bx - ax) / L, (bz - az) / L]); nrm = np.array([-t[1], t[0]])
        through = s["through"]
        cpx = centres[s["district"]]
        cen = ((ax + bx) / 2 / MPP + rc.W_MAP / 2, (az + bz) / 2 / MPP + rc.H_MAP / 2)
        core = np.hypot(cen[0] - cpx[0], cen[1] - cpx[1]) < 40
        for side in (-1, 1):
            pos = 8.0
            while pos < L - 8.0:
                if through:
                    r = rng.random()
                    pool = TOWERS if (core and r < 0.07) else CIVIC if r < 0.10 else SHOPS if r < 0.38 else DENSE
                else:
                    pool = RES
                slug = pick(pool)
                m = GEN[slug]
                w = m["w"]
                x = ax + t[0] * (pos + w / 2); z = az + t[1] * (pos + w / 2)
                setback = 8.0 + (6.0 if not through else 1.0) + m["d"] / 2
                px, pz = x + nrm[0] * side * setback, z + nrm[1] * side * setback
                face = -nrm * side
                if put(slug, px, pz, face, float(rng.uniform(0.95, 1.05))):
                    pos += w + 2.5
                else:
                    pos += 9.0
    print("far bank buildings", len(placed), "by model", dict(sorted(use.items(), key=lambda kv: -kv[1])[:12]))
    data["items"] = items + placed
    data["notes"]["farbank"] = len(placed)
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    print("total", len(data["items"]))


if __name__ == "__main__":
    main()
