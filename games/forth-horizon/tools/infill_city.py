"""
Infill the city: after the parcel pass, fill the free land with buildings.

Free land is whatever is not road or sidewalk (plus a margin), not an existing building, not water, harbor or a steep
slope, and inside the city hull. Candidates go frontage first (closest to a street), each building snaps to a
setback line from its street and faces it. Fictional infill: sizes vary, types follow the district.
Run after place_city_real.py:  python games/forth-horizon/tools/infill_city.py
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

HERE = rc.HERE
OUT = os.path.join(rc.REPO, "public", "games", "forth-horizon", "region")
rng = np.random.default_rng(404)
CELL = 3.0
REQ = {"street": 10.2, "arterial": 13.2, "freeway": 12.5, "ramp": 6.5}


def main():
    data = json.load(open(os.path.join(OUT, "city.json")))
    items = [it for it in data["items"] if not it.get("infill")]
    hf = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
    harbor = json.load(open(os.path.join(OUT, "harbor.json")))

    # street samples with tangent and clearance
    st = rc.streets_world()
    pts, req, tans = [], [], []
    for s in st:
        r = REQ[cpr.classify(s["name"])]
        for a, b in zip(s["pts"][:-1], s["pts"][1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
            n = max(int(L / 3), 1)
            for t in range(n + 1):
                pts.append((a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n))
                req.append(r)
                tans.append(((b[0] - a[0]) / L, (b[1] - a[1]) / L))
    pts = np.array(pts)
    req = np.array(req)
    tans = np.array(tans)
    tree = cKDTree(pts)
    art_pts = np.array([pts[i] for i in range(len(pts)) if req[i] == 13.2]) if (req == 13.2).any() else pts
    art_tree = cKDTree(art_pts)

    # city hull: the parcel extent
    cm = rc.ll_to_world(rc.X["lon0"], rc.X["lat0"])
    P = json.load(open(os.path.join(HERE, "data", "detroit_parcels.json")))["parcels"]
    cen = np.array([rc.ll_to_world(*p["c"]) for p in P if p.get("c") and p["c"][0] is not None], np.float32)
    hull = cv2.convexHull(cen)[:, 0, :]
    x0, z0 = hull[:, 0].min() - 60, hull[:, 1].min() - 60
    x1, z1 = hull[:, 0].max() + 60, hull[:, 1].max() + 60
    nx, nz = int((x1 - x0) / CELL) + 1, int((z1 - z0) / CELL) + 1
    print("grid", nx, nz)

    def to_cell(x, z):
        return ((x - x0) / CELL, (z - z0) / CELL)

    occ = np.zeros((nz, nx), np.uint8)
    # inside the hull only
    inhull = np.zeros((nz, nx), np.uint8)
    hc = np.array([to_cell(x, z) for x, z in hull], np.float32)
    cv2.fillPoly(inhull, [hc.astype(np.int32)], 1)
    inhull = cv2.dilate(inhull, np.ones((9, 9), np.uint8))
    occ[inhull == 0] = 1

    gx, gz = np.meshgrid(np.arange(nx), np.arange(nz))
    cx = x0 + (gx + 0.5) * CELL
    cz = z0 + (gz + 0.5) * CELL
    flat = np.stack([cx.ravel(), cz.ravel()], 1)
    dist, idx = tree.query(flat, workers=-1)
    dist = dist.reshape(nz, nx)
    idx = idx.reshape(nz, nx)
    occ[dist < req[idx] + 0.5] = 1

    # terrain: water, shoreline, steep slopes
    px = cx / rc.MPP + rc.W_MAP / 2
    pz = cz / rc.MPP + rc.H_MAP / 2
    h = ndi.map_coordinates(hf, [pz, px], order=1, mode="nearest")
    gyy, gxx = np.gradient(hf)
    slope = np.hypot(ndi.map_coordinates(gxx, [pz, px], order=1, mode="nearest"), ndi.map_coordinates(gyy, [pz, px], order=1, mode="nearest")) / rc.MPP
    occ[(h < 1.0) | (slope > 0.30)] = 1
    occ = np.maximum(occ, cv2.dilate((h < 1.0).astype(np.uint8), np.ones((9, 9), np.uint8)))   # 12 m off the water

    # harbor: quay buffer, terminals, sheds, tanks
    for q in harbor["quays"]:
        for a, b in zip(q["pts"][:-1], q["pts"][1:]):
            cv2.line(occ, tuple(int(v) for v in to_cell(*a)), tuple(int(v) for v in to_cell(*b)), 1, 15)
    hd = harbor["heading"]
    ex = (math.cos(hd), math.sin(hd))
    ey = (-ex[1], ex[0])
    def fill_rect(cx_, cz_, w, d, ax, az, grow=3.0, grid=occ):
        a1 = (ax[0], ax[1])
        b1 = (az[0], az[1])
        poly = []
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            poly.append(to_cell(cx_ + a1[0] * sx * (w / 2 + grow) + b1[0] * sz * (d / 2 + grow), cz_ + a1[1] * sx * (w / 2 + grow) + b1[1] * sz * (d / 2 + grow)))
        cv2.fillPoly(grid, [np.array(poly, np.float32).astype(np.int32)], 1)
    for t in harbor["terminals"] + harbor["sheds"]:
        fill_rect(t["c"][0], t["c"][1], t["w"], t["d"], ex, ey, 6.0)
    for t in harbor["tanks"]:
        cv2.circle(occ, tuple(int(v) for v in to_cell(*t)), 6, 1, -1)

    # existing buildings
    for it in items:
        phi = it["rotY"]
        e1 = (math.cos(phi), -math.sin(phi))
        e2 = (math.sin(phi), math.cos(phi))
        fill_rect(it["bx"], it["bz"], it["w"], it["d"] + 2.5, e1, e2, 1.5)

    free0 = int((occ == 0).sum())
    print("free cells", free0)

    GEN = pc.GEN
    CORE_SET = [g for g in pc.CORE + pc.MID if g in GEN]
    MID_SET = [g for g in pc.MID + ["townhouse-row", "mixed-use-block"] if g in GEN]
    EDGE_SET = [g for g in pc.EDGE if g in GEN]
    HOUSES = [g for g in ("craftsman-bungalow", "colonial-house", "tudor-house", "duplex", "townhouse-row", "ranch-house", "split-level-house", "corner-grocery") if g in GEN]
    SHOPS = [g for g in ("coffee-shop", "barber-shop", "neighborhood-diner", "neighborhood-pharmacy", "gas-station", "strip-mall", "auto-repair-shop") if g in GEN]
    TALL = [g for g in ("midtown-office-tower", "brick-office-block", "modern-loft-office", "downtown-hotel", "apartment-tower", "civic-office-annex", "tech-campus", "corner-office", "mixed-use-block", "parking-deck") if g in GEN]
    circ = json.load(open(os.path.join(rc.DOCS, "city-circuit-real.json")))["world"]
    circ_tree = cKDTree(np.array(circ))
    SMALL_COMM = [g for g in ("coffee-shop", "neighborhood-pharmacy", "neighborhood-diner", "corner-grocery") if g in GEN]
    SMALL = sorted(HOUSES, key=lambda g: GEN[g]["w"] * GEN[g]["d"])[:6]

    # candidate cells, frontage first
    stride = 2
    cand = np.argwhere(occ[::stride, ::stride] == 0) * stride
    order = np.argsort(dist[cand[:, 0], cand[:, 1]] + rng.random(len(cand)) * 4.0)
    cand = cand[order]
    print("candidates", len(cand))

    def rect_free(x, z, w, d, ex_, ez_, margin=0.8):
        hw, hd_ = w / 2 + margin, d / 2 + margin
        ns = max(int(math.ceil(hw * 2 / CELL)), 2)
        nd = max(int(math.ceil(hd_ * 2 / CELL)), 2)
        a = np.linspace(-hw, hw, ns + 1)
        b = np.linspace(-hd_, hd_, nd + 1)
        A, B = np.meshgrid(a, b)
        X = x + ex_[0] * A + ez_[0] * B
        Z = z + ex_[1] * A + ez_[1] * B
        ci = ((X - x0) / CELL).astype(int)
        cj = ((Z - z0) / CELL).astype(int)
        if ci.min() < 0 or cj.min() < 0 or ci.max() >= nx or cj.max() >= nz:
            return False
        return not occ[cj, ci].any()

    # ================= zoning plan (block level) =================
    # A block is a connected patch of free land between streets. Each block gets ONE land use, chosen the way a planner would:
    #   CBD        within 200 m of the Grand Circuit or 650 m of Campus Martius: office towers, hotels, apartment towers, civic, parking decks
    #   MID        the transition ring (to 420 m of the circuit, 1.1 km of the core): mid-rise offices, mixed use, hotels, apartments, parking
    #   STRIP      blocks fronting an arterial between 1.1 and 2.6 km: low neighbourhood retail and services, never next to towers
    #   INDUSTRIAL within 450 m of the harbor quays: light industrial and service buildings
    #   RESIDENTIAL everything else: townhouses and duplexes near the core, detached houses farther out
    # Heights fall off smoothly with distance from the core, with one base height per block so a block reads as a block.
    free = (occ == 0).astype(np.uint8)
    nlab, lab = cv2.connectedComponents(free, connectivity=4)
    quay_pts = np.array([p_ for q in harbor["quays"] for p_ in q["pts"]]) if harbor["quays"] else np.zeros((1, 2)) + 1e9
    quay_tree = cKDTree(quay_pts)
    zone_of = {}
    base_h = {}
    zrng = np.random.default_rng(909)
    cell_x = x0 + (np.arange(nx) + 0.5) * CELL
    cell_z = z0 + (np.arange(nz) + 0.5) * CELL
    counts = np.bincount(lab.ravel(), minlength=nlab)
    sum_i = np.bincount(lab.ravel(), weights=np.tile(np.arange(nx), nz), minlength=nlab)
    sum_j = np.bincount(lab.ravel(), weights=np.repeat(np.arange(nz), nx), minlength=nlab)
    zone_count = {}
    for L in range(1, nlab):
        if counts[L] < 30:
            continue
        bx_ = x0 + (sum_i[L] / counts[L] + 0.5) * CELL
        bz_ = z0 + (sum_j[L] / counts[L] + 0.5) * CELL
        dcm_ = math.hypot(bx_ - cm[0], bz_ - cm[1])
        dc_ = float(circ_tree.query([bx_, bz_])[0])
        arterial = float(art_tree.query([bx_, bz_])[0]) < 70.0
        dq_ = float(quay_tree.query([bx_, bz_])[0])
        if dc_ < 200.0 or dcm_ < 650.0:
            z_ = "CBD"; h_ = float(np.clip(125.0 - dcm_ * 0.045, 55.0, 125.0))
        elif dc_ < 420.0 or dcm_ < 1100.0:
            z_ = "MID"; h_ = float(np.clip(58.0 - dcm_ * 0.018, 20.0, 55.0))
        elif dq_ < 450.0:
            z_ = "INDUSTRIAL"; h_ = 9.0
        elif arterial and dcm_ < 2600.0:
            z_ = "STRIP"; h_ = 9.0
        else:
            z_ = "RESIDENTIAL"; h_ = 7.0
        zone_of[L] = z_
        base_h[L] = h_ * float(zrng.uniform(0.82, 1.2))
        zone_count[z_] = zone_count.get(z_, 0) + 1
    print("zoned blocks", zone_count)
    POOLS = {
        "CBD": [g for g in ("midtown-office-tower", "midtown-office-tower", "apartment-tower", "downtown-hotel", "civic-office-annex", "tech-campus", "brick-office-block", "parking-deck") if g in GEN],
        "MID": [g for g in ("brick-office-block", "mixed-use-block", "apartment-tower", "modern-loft-office", "downtown-hotel", "civic-office-annex", "corner-office", "parking-deck") if g in GEN],
        "STRIP": [g for g in ("strip-mall", "mixed-use-block", "corner-grocery", "neighborhood-pharmacy", "neighborhood-diner", "auto-repair-shop", "gas-station", "barber-shop", "coffee-shop") if g in GEN],
        "INDUSTRIAL": [g for g in ("auto-repair-shop", "modern-loft-office", "strip-mall", "gas-station") if g in GEN],
    }
    # retail mix for STRIP blocks: mostly strip malls and mixed-use frontage, single-tenant buildings are rare and capped per block
    STRIP_W = {"strip-mall": 5.0, "mixed-use-block": 5.0, "auto-repair-shop": 1.2, "corner-grocery": 1.0, "neighborhood-pharmacy": 0.8, "neighborhood-diner": 0.8, "gas-station": 0.25, "barber-shop": 0.15, "coffee-shop": 0.9}
    STRIP_CAP = {"strip-mall": 99, "mixed-use-block": 99, "auto-repair-shop": 2, "corner-grocery": 1, "neighborhood-pharmacy": 1, "neighborhood-diner": 1, "gas-station": 1, "barber-shop": 1, "coffee-shop": 1}
    block_type_count = {}
    DENSE_RES = [g for g in ("townhouse-row", "duplex", "craftsman-bungalow", "tudor-house") if g in GEN]
    OUTER_RES = [g for g in ("ranch-house", "colonial-house", "split-level-house", "craftsman-bungalow", "tudor-house") if g in GEN]

    # Neighbourhood civic buildings sit in residential blocks: rare, at most one per block, and a fixed number across the city so they stay landmarks.
    # (Downtown zones are unchanged: new downtown models are on their way.)
    CIVIC = [g for g in ("suburban-church", "elementary-school", "library-branch", "fire-station") if g in GEN]
    n_res = max(zone_count.get("RESIDENTIAL", 0), 1)
    civic_quota = {"suburban-church": max(2, n_res // 9), "elementary-school": max(2, n_res // 13), "library-branch": max(1, n_res // 28), "fire-station": max(1, n_res // 20)}
    civic_left = {g: civic_quota.get(g, 1) for g in CIVIC}
    civic_block = set()
    recent = {}                                             # block -> the last few models placed there, so one block does not read as one house copied

    new = []

    def try_place(sg, scale, x, z, di, k, sx_, sz_, nrm, phi, e1, e2, est, in_corr, tall_pass):
        m = GEN[sg]
        w, d = m["w"] * scale, m["d"] * scale
        cxs, czs = x, z
        if di < req[k] + d + 4.0:                       # first row: snap to the setback line
            off = req[k] + 0.8 + d / 2 + 1.25
            cxs, czs = sx_ + nrm[0] * off, sz_ + nrm[1] * off
        shifts = [(0.0, 0.0)]
        if tall_pass:                                   # towers may slide sideways and inward to find room
            shifts += [(w * 0.35, 0.0), (-w * 0.35, 0.0), (0.0, d * 0.5), (w * 0.35, d * 0.5), (-w * 0.35, d * 0.5), (w * 0.7, 0.0), (-w * 0.7, 0.0), (0.0, d), (w * 0.5, d), (-w * 0.5, d)]
        for sh_x, sh_z in shifts:
            qx = cxs + e1[0] * sh_x + e2[0] * sh_z
            qz = czs + e1[1] * sh_x + e2[1] * sh_z
            if rect_free(qx, qz, w, d + 2.5, e1, e2):
                fill_rect(qx, qz, w, d + 2.5, e1, e2, 1.2)
                bcx, bcz = m["cx"] * scale, m["cz"] * scale
                ox = qx - (bcx * math.cos(phi) + bcz * math.sin(phi))
                oz = qz - (-bcx * math.sin(phi) + bcz * math.cos(phi))
                sy_ = float(np.clip(est / m["h"], 0.7, 2.3)) if in_corr and m["h"] > 20 else 1.0
                new.append({"kind": "generic", "slug": sg, "x": round(ox, 1), "z": round(oz, 1), "rotY": round(phi, 4), "w": round(w, 1), "d": round(d, 1),
                            "h": round(m["h"] * sy_, 1), "sx": round(scale, 3), "sy": round(sy_, 3), "sz": round(scale, 3), "bx": round(qx, 1), "bz": round(qz, 1), "infill": True})
                return True
        return False

    for cj, ci in cand:
        if occ[cj, ci]:
            continue
        L = lab[cj, ci]
        zone = zone_of.get(L)
        if zone is None:
            continue
        x = x0 + (ci + 0.5) * CELL
        z = z0 + (cj + 0.5) * CELL
        di, k = tree.query([x, z])
        if di > 90:
            continue
        cmd = math.hypot(x - cm[0], z - cm[1])
        sx_, sz_ = pts[k]
        tx, tz = tans[k]
        nrm = (-tz, tx)
        if (x - sx_) * nrm[0] + (z - sz_) * nrm[1] < 0:
            nrm = (tz, -tx)
        phi = math.atan2(-nrm[0], -nrm[1])               # the front looks at the street
        e1 = (math.cos(phi), -math.sin(phi))
        e2 = (math.sin(phi), math.cos(phi))
        tall_zone = zone in ("CBD", "MID")
        if tall_zone:
            pool = POOLS[zone]
            est = base_h[L] * float(rng.uniform(0.85, 1.15))
            opts = sorted(pool, key=lambda g: abs(GEN[g]["h"] * (1.5 if zone == "CBD" else 1.2) - est) + rng.random() * 8)[:5]
            scales = (1.0, 0.8, 0.62, 0.5)
        elif zone == "STRIP":
            est = base_h[L]
            avail = [g for g in POOLS["STRIP"] if block_type_count.get((L, g), 0) < STRIP_CAP[g]]
            # weighted draw without replacement: key = random ** (1 / weight)
            opts = sorted(avail, key=lambda g: -(rng.random() ** (1.0 / STRIP_W[g])))[:4]
            scales = (1.0, 0.8, 0.62)
        elif zone == "INDUSTRIAL":
            pool = POOLS[zone]
            est = base_h[L]
            opts = sorted(pool, key=lambda g: rng.random())[:4]
            scales = (1.0, 0.8, 0.62)
        else:
            pool = DENSE_RES if cmd < 1900 else OUTER_RES
            est = base_h[L]
            last = recent.get(L, [])
            opts = sorted(pool, key=lambda g: rng.random() + 1.6 * last[-4:].count(g))[:3]      # a model used in the last four placements goes to the back
            if CIVIC and L not in civic_block and rng.random() < 0.22:
                open_ = [g for g in CIVIC if civic_left[g] > 0]
                if open_:
                    pick = open_[int(rng.integers(len(open_)))]
                    opts = [pick] + opts
            scales = (1.0, 0.8, 0.62)
        done = False
        for sg in opts:
            for scale in scales:
                if try_place(sg, scale, x, z, di, k, sx_, sz_, nrm, phi, e1, e2, est, tall_zone, tall_zone):
                    done = True
                    block_type_count[(L, sg)] = block_type_count.get((L, sg), 0) + 1
                    recent.setdefault(L, []).append(sg)
                    if sg in civic_left:
                        civic_left[sg] -= 1
                        civic_block.add(L)
                    break
            if done:
                break
    print("infill buildings", len(new), "civic placed", {g: civic_quota[g] - civic_left[g] for g in civic_quota})
    data["items"] = items + new
    data["notes"]["infill"] = len(new)
    json.dump(data, open(os.path.join(OUT, "city.json"), "w"))
    print("total", len(data["items"]))


if __name__ == "__main__":
    main()
