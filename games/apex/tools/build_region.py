"""
Apex Elohim region terrain builder (v1).

Reads the satellite reference tile + docs/apex-elohim/region-v3.json (circuits, river, highways)
and writes a height field, water masks and world-space road data for the region viewer.

Datum: lake surface = 0 m. 1 map px = 12 m.
Run:  python games/apex/tools/build_region.py
"""
import json
import math
import os
import shutil
import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = "D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22/Satellite_map_of_fictional_Michigan_728a143c.jpg"
REGION = os.path.join(REPO, "docs", "apex-elohim", "region-v3.json")
OUT = os.path.join(REPO, "public", "games", "apex", "region")
MPP = 12.0
rng = np.random.default_rng(1131)


def smooth01(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def fbm(h, w, wavelength_px, octaves=4, gain=0.5):
    out = np.zeros((h, w), np.float32)
    amp, tot, wl = 1.0, 0.0, float(wavelength_px)
    for _ in range(octaves):
        n = rng.standard_normal((h, w)).astype(np.float32)
        n = ndi.gaussian_filter(n, wl / 2.2)
        n /= (n.std() + 1e-6)
        out += n * amp
        tot += amp
        amp *= gain
        wl = max(wl / 2.0, 2.0)
    return out / tot


def poly_mask(pts, h, w):
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(np.float32)


def path_arc(path):
    a = np.array(path, float)
    seg = np.hypot(*(a[1:] - a[:-1]).T)
    return np.concatenate([[0], np.cumsum(seg)])


def resample(path, step=0.7):
    a = np.array(path, float)
    arc = path_arc(a)
    n = max(int(arc[-1] / step), 2)
    t = np.linspace(0, arc[-1], n)
    return np.stack([np.interp(t, arc, a[:, 0]), np.interp(t, arc, a[:, 1])], 1)


def main():
    os.makedirs(OUT, exist_ok=True)
    img = cv2.imread(SRC)
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h_, s_, v_ = [hsv[..., i].astype(int) for i in range(3)]
    b, g, r = [img[..., i].astype(int) for i in range(3)]
    reg = json.load(open(REGION))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    # ---------- water ----------
    water = (((b > r + 15) & (b >= g - 10) & (v_ < 200)) | ((h_ >= 80) & (h_ <= 125) & (s_ > 70))).astype(np.uint8)
    water = cv2.morphologyEx(water, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    water = cv2.morphologyEx(water, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(water, 8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 60:
            keep[i] = True
    water = keep[lab].astype(np.uint8)
    # tower shadows in the downtown core read as water to the colour test: it is all land east of the waterfront
    water[330:600, 1110:1345] = 0
    # lake = component touching the left edge
    left_labels = set(np.unique(lab[:, 0])) - {0}
    lake = np.isin(lab, list(left_labels)).astype(np.uint8)
    # designed river channel (lake mouth -> harbor)
    river_pts = np.array(reg["river_px"], np.float32)
    rivm = np.zeros((H, W), np.uint8)
    cv2.polylines(rivm, [np.round(river_pts).astype(np.int32)], False, 1, 4, cv2.LINE_AA)
    water_all = np.maximum(water, rivm)

    dist_shore = ndi.distance_transform_edt(1 - lake) * MPP      # land distance to lake (m)
    dist_off = ndi.distance_transform_edt(lake) * MPP            # offshore distance (m)

    # ---------- base land ----------
    land = 5.0 + 3.0 * fbm(H, W, 90, 3)
    land += 1.5 * fbm(H, W, 14, 2)

    # countryside relief: rolling moraine across the farmland, long ridges, and wooded hills
    inland = smooth01(1500, 3600, dist_shore) * (1 - smooth01(990, 1060, xx))
    land += inland * (24.0 * fbm(H, W, 150, 3) + 9.0 * fbm(H, W, 55, 3) + 14.0)
    # Cathedral Ridge: a long ridge through the farmland with an overlook, running north-south
    ridge_line = np.array([(690, 150), (760, 250), (820, 360), (860, 480), (900, 560)], np.float32)
    rtree = cKDTree(ridge_line)
    rd, _ = rtree.query(np.stack([xx.ravel(), yy.ravel()], 1), workers=-1)
    rd = rd.reshape(H, W)
    land += 38.0 * np.exp(-(rd / 26.0) ** 2) * inland
    # a second, lower ridge in the north
    land += 20.0 * np.exp(-(np.hypot(xx - 560, yy - 60) / 60.0) ** 2)

    # lake bluff ramp along the coast, strongest at the cliff raceway
    ys = np.array([0, 140, 230, 330, 440, 520, 600, 700, 767], np.float32)
    hm = np.array([55, 62, 40, 36, 120, 80, 55, 38, 28], np.float32)
    Hmax = np.interp(yy, ys, hm)
    steep = np.interp(yy, [0, 380, 430, 520, 600, 767], [700, 700, 300, 300, 650, 700])
    prof = smooth01(0, 1, dist_shore / steep) * (1 - 0.88 * smooth01(1400, 5200, dist_shore))
    land = land + (Hmax - 5.0) * prof
    land += 5.0 * fbm(H, W, 30, 3) * smooth01(0, 600, dist_shore) * (1 - smooth01(2500, 5000, dist_shore))

    # dune sea: sand colour mask inside the dune polygon
    sand = ((r > 150) & (g > 130) & (b > 90) & (r > b + 30) & (s_ < 120)).astype(np.float32)
    dune_poly = poly_mask([(245, 235), (330, 225), (470, 255), (480, 340), (430, 470), (300, 470), (230, 400)], H, W)
    dune_poly = cv2.GaussianBlur(dune_poly, (0, 0), 14)
    sand_s = cv2.GaussianBlur(sand, (0, 0), 5) * dune_poly
    ridge = 1.0 - np.abs(fbm(H, W, 22, 3))
    dunes = (ridge ** 2) * 44.0 + 14.0 * fbm(H, W, 40, 2)
    land = land + dunes * np.clip(sand_s * 1.6 + dune_poly * 0.3, 0, 1)

    # kettle hills
    kpoly = cv2.GaussianBlur(poly_mask([(560, 545), (900, 545), (900, 768), (560, 768)], H, W), (0, 0), 28)
    kett = 44.0 * fbm(H, W, 38, 4) + 18.0
    land = land + kett * kpoly
    pond = ndi.binary_dilation(water.astype(bool) & (kpoly > 0.3), iterations=3)
    land = np.where(pond, land - 4.0, land)

    # pinewood gentle relief
    ppoly = cv2.GaussianBlur(poly_mask([(430, 0), (700, 0), (700, 150), (540, 215), (430, 215)], H, W), (0, 0), 24)
    land = land + 24.0 * fbm(H, W, 30, 3) * ppoly + 16.0 * ppoly

    # city: not flat. Rises gently from the waterfront (about 2 m) inland (about 4 m per km), with low relief
    city = smooth01(1000, 1080, xx)
    dwat = ndi.distance_transform_edt(1 - np.maximum(water, rivm)) * MPP
    # waterfront terrace: the harbor floor at about 2 m, a 7 m scarp up to the downtown plateau
    city_h = 2.0 + 7.0 * smooth01(70.0, 300.0, dwat) + np.minimum(dwat, 3600.0) * 0.0035 + 0.9 * fbm(H, W, 24, 2) + 1.4 * fbm(H, W, 90, 2)
    # Highland Heights: a terraced hill district in the north-east, streets climb about 45 m
    city_h += 46.0 * np.exp(-(np.hypot(xx - 1292, yy - 335) / 70.0) ** 2)
    # Midtown knoll with a park summit
    city_h += 19.0 * np.exp(-(np.hypot(xx - 1190, yy - 345) / 34.0) ** 2)
    # Lodge Ridge: a raised spine under the freeway diagonal
    lodge = np.array([(1230, 255), (1262, 330), (1296, 420), (1328, 520)], np.float32)
    ld, _ = cKDTree(lodge).query(np.stack([xx.ravel(), yy.ravel()], 1), workers=-1)
    city_h += 15.0 * np.exp(-(ld.reshape(H, W) / 24.0) ** 2)
    # the Gratiot dip: a shallow hollow east of Campus Martius (the canon's one place the suspension unloads)
    city_h -= 6.0 * np.exp(-(np.hypot(xx - 1218, yy - 500) / 22.0) ** 2)
    # quarry pond and bluff south of downtown
    city_h += 12.0 * np.exp(-(np.hypot(xx - 1250, yy - 610) / 40.0) ** 2)
    land = land * (1 - city) + city_h * city

    # river valley carved along the designed river + its natural creek
    rs = resample(river_pts, 0.8)
    tree_r = cKDTree(rs)
    dr, _ = tree_r.query(np.stack([xx.ravel(), yy.ravel()], 1), workers=-1)
    dr = dr.reshape(H, W) * MPP
    valley_floor = -1.5 + 0.0 * land
    land = np.where(dr < 280, valley_floor + (land - valley_floor) * smooth01(30, 280, dr), land)

    # ---------- water surfaces ----------
    lake_bed = -np.minimum(72.0, 3.0 + dist_off * 0.045)
    beach = smooth01(0, 90, dist_shore)
    land = np.where(lake > 0, lake_bed, land)
    land = land * np.where(lake > 0, 1.0, np.clip(0.25 + 0.75 * beach, 0, 1)) + np.where(lake > 0, 0, 0.0)
    wsoft = cv2.GaussianBlur(np.maximum(water, rivm).astype(np.float32) * (1 - lake), (0, 0), 1.6)
    land = land * (1 - np.clip(wsoft * 1.4, 0, 1)) + (-4.0) * np.clip(wsoft * 1.4, 0, 1)
    land = cv2.GaussianBlur(land.astype(np.float32), (0, 0), 0.9)

    # ---------- circuits: grading ----------
    circuits = reg["circuits"]
    allpix = np.stack([xx.ravel(), yy.ravel()], 1)

    def corridor(path, target, r_in, r_out, protect=None):
        nonlocal land
        P = resample(path, 0.6)
        tgt = np.interp(np.linspace(0, 1, len(P)), np.linspace(0, 1, len(target)), target) if len(target) != len(P) else target
        tr = cKDTree(P)
        d, idx = tr.query(allpix, workers=-1)
        d = d.reshape(H, W)
        idx = idx.reshape(H, W)
        wgt = 1 - smooth01(r_in, r_out, d)
        t = tgt[idx]
        if protect is not None:
            wgt = wgt * (1 - protect)
        land = land * (1 - wgt) + t * wgt
        return P

    # circuit 1: city streets, graded to the smoothed terrain so the carriageway is smooth
    c1 = np.array(circuits["ironport_grand_circuit"]["map_px"], float)
    P1r = resample(c1, 0.6)
    h1 = ndi.map_coordinates(land, [P1r[:, 1], P1r[:, 0]], order=1)
    h1 = ndi.gaussian_filter1d(h1, 18, mode="wrap")
    ek = circuits["ironport_grand_circuit"].get("elev_keys")
    if ek:
        # designed profile: the road follows it and the blocks around the street are graded up to meet it
        arc1 = path_arc(P1r)
        t1 = arc1 / arc1[-1]
        kt = np.array([k[0] for k in ek]); kv = np.array([k[1] for k in ek])
        design = np.interp(t1, kt, kv)
        design = ndi.gaussian_filter1d(design, 14, mode="nearest")
        h1 = design
        P1 = corridor(c1, h1, 1.0, 7.0)
    else:
        P1 = corridor(c1, h1, 0.9, 2.2)

    # circuit 3: cliff raceway with designed elevation profile
    c3 = circuits["great_lakes_cliff_raceway"]
    wps = np.array(c3["waypoints_px"], float)
    path3 = np.array(c3["map_px"], float)
    P3 = resample(path3, 0.6)
    arc = path_arc(P3)
    el = [2, 0, 0, 0, 0, 0, 3, 10, 38, 50, 56, 72, 78, 84, 100, 108, 128, 132, 134, 136, 132, 122, 104, 78, 40, 14, 8, 5, 3]
    vpos = []
    for w_ in wps:
        vpos.append(arc[np.argmin(np.hypot(*(P3 - w_).T))])
    vpos = np.maximum.accumulate(np.array(vpos))
    vpos[0] = 0.0
    vpos = np.append(vpos, arc[-1])
    els = np.array(el + [el[0]], float)
    prof3 = np.interp(arc, vpos, els)
    prof3 = ndi.gaussian_filter1d(prof3, 14, mode="wrap")
    tun_a, tun_b = vpos[15], vpos[16]
    in_tun = (arc >= tun_a) & (arc <= tun_b)
    land_before = land.copy()
    # grade open road only; tunnel pixels get a ridge instead
    wgt_mask = np.ones(len(P3))
    wgt_mask[in_tun] = 0
    tr3 = cKDTree(P3)
    d3, i3 = tr3.query(allpix, workers=-1)
    d3 = d3.reshape(H, W)
    i3 = i3.reshape(H, W)
    openw = 1 - smooth01(1.2, 11.0, d3)
    openw = openw * wgt_mask[i3]
    land = land * (1 - openw) + prof3[i3] * openw
    ridge_w = (1 - smooth01(5.0, 11.0, d3)) * (in_tun[i3]).astype(np.float32)
    ridge_h = prof3[i3] + 26.0
    land = np.maximum(land, land * (1 - ridge_w) + ridge_h * ridge_w)
    # paddock apron (beach level)
    pad = cv2.GaussianBlur(poly_mask([(194, 594), (214, 594), (214, 620), (194, 620)], H, W), (0, 0), 2.0)
    land = land * (1 - pad) + 1.6 * pad

    # circuit 2: rally, graded to smoothed existing terrain
    c2 = np.array(circuits["pinewood_rally_stage"]["map_px"], float)
    P2 = resample(c2, 0.6)
    hs = ndi.map_coordinates(land, [P2[:, 1], P2[:, 0]], order=1)
    hs = ndi.gaussian_filter1d(hs, 30, mode="nearest")
    tr2 = cKDTree(P2)
    d2, i2 = tr2.query(allpix, workers=-1)
    d2 = d2.reshape(H, W)
    i2 = i2.reshape(H, W)
    w2 = 1 - smooth01(0.8, 2.4, d2)
    land = land * (1 - w2) + hs[i2] * w2

    # ---------- circuit stats from final field ----------
    def stats_for(P, name):
        z = ndi.map_coordinates(land, [P[:, 1], P[:, 0]], order=1)
        zs = ndi.gaussian_filter1d(z, 8, mode="wrap")
        ds = np.hypot(*(np.diff(P, axis=0).T)) * MPP
        gr = np.abs(np.diff(zs)) / np.maximum(ds, 1e-6) * 100
        wi=np.argsort(gr)[-3:]
        print("  worst grades at path idx", wi.tolist(), gr[wi].round(1).tolist())
        print("%s: length %.2f km, elev %.0f..%.0f m, max grade %.1f%%" % (name, ds.sum() / 1000, z.min(), z.max(), np.percentile(gr, 99.5)))
        return z

    z1 = stats_for(P1, "city")
    z2 = stats_for(P2, "rally")
    stats_for(P3, "cliff (terrain under road, tunnel shows ridge)")
    z3 = prof3.copy()  # the road itself runs at its design elevation, including inside the tunnel
    gd = np.abs(np.diff(z3)) / (np.hypot(*(np.diff(P3, axis=0).T)) * MPP) * 100
    print("cliff road design grade: max %.1f%%, p95 %.1f%%" % (gd.max(), np.percentile(gd, 95)))

    # ---------- write ----------
    land.astype(np.float32).tofile(os.path.join(OUT, "height.f32"))
    shutil.copyfile(SRC, os.path.join(OUT, "albedo.jpg"))
    cv2.imwrite(os.path.join(OUT, "lake.png"), lake * 255)

    def world(P):
        return [[float((p[0] - W / 2) * MPP), float((p[1] - H / 2) * MPP)] for p in P]

    def pl(P, z=None, step=4):
        pts = world(P)
        return {"xz": pts[::step], **({"y": [round(float(v), 2) for v in z[::step]]} if z is not None else {})}

    meta = {
        "width": W, "height": H, "mpp": MPP, "datum": "lake surface = 0 m",
        "circuits": {
            "ironport_grand_circuit": {"name": "Ironport Grand Circuit", "kind": "city", "corners": circuits["ironport_grand_circuit"].get("corners", []), **pl(P1, z1 + 0.25, 3)},
            "pinewood_rally_stage": {"name": "Pinewood Rally Stage", "kind": "rally", **pl(P2, z2 + 0.2, 3)},
            "great_lakes_cliff_raceway": {
                "name": "Great Lakes Cliff Raceway", "kind": "road_course", **pl(P3, z3 + 0.25, 3),
                "tunnel": {"from": int(np.searchsorted(arc, tun_a) // 3), "to": int(np.searchsorted(arc, tun_b) // 3)},
            },
        },
        "river": {"xz": world(river_pts)[::3]},
        "coastal_highway": {"xz": world(np.array(reg["coastal_highway_px"], float))[::2]},
        "freeway": {"xz": world(np.array(reg["freeway_px"], float))[::2]},
        "places": [
            {"name": "Port Halcyon", "xz": world([(170, 640)])[0]},
            {"name": "Otter Creek", "xz": world([(555, 283)])[0]},
            {"name": "Lighthouse point", "xz": world([(400, 126)])[0]},
            {"name": "Downtown Ironport", "xz": world([(1180, 455)])[0]},
        ],
    }
    json.dump(meta, open(os.path.join(OUT, "region.json"), "w"))
    print("height range %.1f .. %.1f m" % (land.min(), land.max()))
    prev = np.clip((land + 10) / 150, 0, 1)
    cv2.imwrite(os.path.join(OUT, "height_preview.png"), (prev * 255).astype(np.uint8))


if __name__ == "__main__":
    main()
