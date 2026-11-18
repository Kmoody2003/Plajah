"""
Grow the map 10.2 km north (2026-11-18, Kenne: wine country, then foothills, then the Superior Range). Uses the movable grid origin (GRID.ox/oz):
existing coordinates never move; height2.json gets oz = -5100 (the grid centre moved north by half the growth).

Runs after build_terrain_hi.py (which writes the original 2752 x 1536 grid): idempotent, it always starts from the original files
(*.before_north backups). New land, south to north (z, world m):
  -4608 .. -7700   Wine country: rolling moraine (Holly-style), kettle lakes in the lows, the shipping channel continues as a long finger lake,
                   Lake Superior shore along the west; vineyard blocks on south-facing slopes, Holland-style tulip bands on the flats by the lake
  -7700 .. -9300   Foothills rising to the escarpment (E-W, sheer face south over the head of the finger lake)
  -9300 .. -14808  The Superior Range: coastal cliffs and fjords on the west, peaks 550-650 m with a glacier cap, canyons on the east draining to a
                   boreal plateau; the lake again along the north edge
Outputs (with --apply): height2.u16/.json, albedo_hi.jpg, albedo.jpg, landclass.png, water_flow.png grown north; region/north_lands.json
(vineyards, tulip fields, finger lake, glacier, escarpment, canyons, fjords). --preview writes docs/apex-elohim/north-lands-preview.png only.
    python games/forth-horizon/tools/grow_north.py --preview
"""
import json, math, os, shutil, sys
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter, distance_transform_edt, binary_dilation

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "forth-horizon", "region")
GROW_M = 10200.0
NORTH_Z = -4608.0


def orig(name):
    b = os.path.join(R, name.replace(".", ".before_north.", 1))
    return b if os.path.exists(b) else os.path.join(R, name)


def fbm(shape, seed, octaves, base, persistence=0.5):
    rng = np.random.default_rng(seed); out = np.zeros(shape, np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        n = rng.standard_normal(shape).astype(np.float32); n = gaussian_filter(n, max(0.7, base / (2 ** o))); n /= (n.std() + 1e-6)
        out += amp * n; tot += amp; amp *= persistence
    return out / tot


def ss(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def poly_dist(px, pz, line):
    d = np.full(px.shape, 1e9, np.float32); tt = np.zeros(px.shape, np.float32)
    L = [0.0]
    for a, b in zip(line[:-1], line[1:]): L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    for k, (a, b) in enumerate(zip(line[:-1], line[1:])):
        dx, dz = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dz * dz
        t = np.clip(((px - a[0]) * dx + (pz - a[1]) * dz) / l2, 0, 1)
        dd = np.hypot(a[0] + dx * t - px, a[1] + dz * t - pz)
        m = dd < d; d[m] = dd[m]; tt[m] = (L[k] + t[m] * math.sqrt(l2)) / L[-1]
    return d, np.clip(tt, 0.0, 1.0)            # float error can push the end a hair past 1 (a negative base under a fractional power is NaN)


def main():
    apply = "--apply" in sys.argv
    hm = json.load(open(orig("height2.json"))); W, H, mpp = hm["w"], hm["h"], hm["mpp"]
    assert hm.get("oz", 0) == 0, "start from the original grid"
    h0 = np.fromfile(orig("height2.u16"), dtype="<u2").reshape(H, W).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    N = int(round(GROW_M / mpp))
    jj, ii = np.mgrid[0:N, 0:W].astype(np.float32)
    px = (ii - W / 2) * mpp                                           # world x (ox stays 0)
    pz = NORTH_Z - (N - jj) * mpp                                     # row N-1 sits just north of the old row 0
    depth = NORTH_Z - pz                                              # metres north of the old edge
    wx = 260 * fbm(px.shape, 61, 4, 70); wz = 260 * fbm(px.shape, 62, 4, 70)  # domain warp: lines wander like nature, not rulers
    qx, qz = px + wx, pz + wz
    dn = depth + 450 * fbm(px.shape, 63, 3, 90)                       # wandering depth for the zone transitions
    edge = gaussian_filter(h0[0:6].mean(0), 3)                        # the old north rows (smoothed), to continue from

    # ---- the shores ----
    # Lake Superior: west coast from the old edge (x -3726) bending west to the range (x -6900), then the north shore near the top
    coast_z = [-4608, -6000, -7700, -9300, -11500, -13500, -14808]
    coast_x = [-3726, -4300, -5100, -6200, -6900, -6700, -6400]
    cx = np.interp(-pz, [-z for z in coast_z], coast_x)
    cx = cx + 140 * fbm(px.shape, 21, 4, 60)
    north_shore = -14300 + 220 * fbm(px.shape, 22, 4, 80)
    inland = np.minimum(px - cx, north_shore - pz) if False else np.minimum(px - cx, pz - north_shore)   # + on land
    # finger lake: the shipping channel (x 1302..2328 at the old edge) continues north, narrowing, to its head under the escarpment
    lake_line = [(1815, -4608), (1700, -5600), (1450, -6600), (1300, -7600), (1380, -8600)]
    ld, lt = poly_dist(px, pz, lake_line)
    lake_half = 520 - 260 * lt
    # the three smaller channels continue as rivers that end in marsh where the land rises
    rivers = [([(2673, -4608), (2750, -5200), (2600, -5900)], 115), ([(6495, -4608), (6300, -5300), (6550, -6200), (6400, -6900)], 190),
              ([(7629, -4608), (7800, -5400), (7700, -6100)], 200)]

    # ---- landforms ----
    wine = 1 - ss(2500, 3900, dn)                                      # wine country weight
    foot = ss(2500, 3900, dn) * (1 - ss(4300, 5200, dn))               # foothills
    rng_w = ss(4300, 5200, dn)                                         # the range and plateau
    # wine country: rolling moraine 8-45 m, sloping toward the lakes, kettles in the lows
    moraine = 26 + 16 * fbm(px.shape, 1, 5, 70) + 8 * fbm(px.shape, 2, 3, 18)
    near_water = np.minimum(np.maximum(ld - lake_half, 0), np.maximum(inland, 0))
    moraine = moraine * ss(0, 700, near_water) + 3.0 * (1 - ss(0, 700, near_water))
    rngk = np.random.default_rng(5); kettle = np.zeros(px.shape, np.float32); kettles = []
    for _ in range(26):
        kx, kz = rngk.uniform(-3600, 8000), rngk.uniform(-7300, -5000)
        r = rngk.uniform(70, 210)
        if abs(kx - 1600) < 900: continue
        d = np.hypot(px - kx, pz - kz); kettle = np.minimum(kettle, -34 * np.exp(-(d / r) ** 2)); kettles.append((round(kx), round(kz), round(r)))
    moraine = moraine + kettle
    plains = [(-300, -5900, 1200, 700), (3300, -5600, 1000, 650), (2900, -6700, 800, 500)]   # outwash flats: x, z, half-length, half-width
    flat_w = np.zeros(px.shape, np.float32)
    for (fx, fz, fl, fw) in plains: flat_w = np.maximum(flat_w, np.exp(-(((qx - fx) / fl) ** 2 + ((qz - fz) / fw) ** 2) ** 2))
    moraine = moraine * (1 - flat_w) + (9 + 2 * fbm(px.shape, 6, 2, 60)) * flat_w
    # foothills rising to the escarpment crest (z ~ -9300): gentle back slope north, sheer face south
    esc_line = [(-3000, -9350), (-500, -9250), (1800, -9150), (4200, -9300), (6800, -9450)]
    ed, et = poly_dist(px, pz, esc_line)
    ez = np.interp(px, [p[0] for p in esc_line], [p[1] for p in esc_line])
    south_of = pz - ez                                                 # + south of the crest (toward the wine country)
    taper = ss(0.0, 0.22, et) * (1 - ss(0.78, 1.0, et))                                   # the ridge rises out of the hills and sinks back at its ends
    notch = np.ones(px.shape, np.float32)
    for nt in (0.31, 0.47, 0.66, 0.83): notch = np.minimum(notch, 1 - 0.45 * np.exp(-((et - nt) / 0.012) ** 2))   # stream notches cut through the crest
    crest = (290 + 45 * np.sin(et * math.pi * 3) ** 2 + 40 * fbm(px.shape, 64, 3, 90)) * taper * notch
    face_w = 210 * (0.7 + 0.6 * (fbm(px.shape, 65, 3, 60) * 0.5 + 0.5))                  # buttresses and bays along the face
    face = crest * np.exp(-(np.maximum(south_of, 0) / face_w) ** 2)                        # sheer face to the south, over the head of the finger lake
    back = crest * np.exp(-(np.maximum(-south_of, 0) / 1500.0) ** 1.4) + 45 * fbm(px.shape, 5, 5, 35) * ss(0, 300, -south_of) * np.exp(-(np.maximum(-south_of, 0) / 1500.0))   # falls gently to the land around (no table)
    esc = np.where(south_of > 0, face, back)
    hills = 40 + 110 * ss(2300, 4800, dn) + 35 * fbm(px.shape, 3, 5, 45)
    foothills = np.maximum(hills, esc + 25 * fbm(px.shape, 4, 4, 30))
    # the range: massif in the west-centre, peaks 550-650 m, ridged
    peaks = [(-4400, -12100, 640, 1900), (-2300, -12900, 590, 1600), (-5600, -10600, 470, 1300), (-500, -11600, 430, 1500)]
    massif = np.zeros(px.shape, np.float32)
    for (mx, mz, mh, mr) in peaks: massif = np.maximum(massif, mh * np.exp(-(np.hypot(px - mx, pz - mz) / mr) ** 1.6))
    ridged = 1 - np.abs(fbm(px.shape, 7, 6, 55, 0.55))
    mountains = massif * (0.78 + 0.32 * ridged) + 30 * fbm(px.shape, 8, 4, 20)
    plateau = 180 + 70 * fbm(px.shape, 9, 5, 60)                       # boreal plateau east of the range
    highland = np.maximum(mountains, plateau * ss(-1500, 1500, px) + (1 - ss(-1500, 1500, px)) * np.maximum(mountains, 120 + 60 * fbm(px.shape, 10, 4, 40)))
    highland = np.maximum(highland, foothills * (1 - ss(5200, 6200, depth)))
    h = wine * moraine + foot * foothills + rng_w * highland
    h = np.maximum(h, esc + 25 * fbm(px.shape, 4, 4, 30) * (esc > 30))
    # canyons on the range's east side, floors falling east to the plateau
    canyons = [[(-2600, -12300), (-1400, -11900), (200, -11400), (1700, -11000), (3200, -10700)],
               [(-3300, -13300), (-1700, -13400), (0, -13100), (1800, -12900), (3600, -12700)],
               [(-1200, -10500), (300, -10300), (1600, -10100)]]
    floor_mask = np.zeros(px.shape, bool)
    base = gaussian_filter(h, 300.0 / mpp)                                                # the land around, smoothed over ~300 m
    for ci, c in enumerate(canyons):
        cd, ct = poly_dist(qx, qz, c)
        head = ss(0.0, 0.14, ct)                                                           # the canyon starts as a notch at its head
        wob = fbm(px.shape, 40 + ci, 3, 25)
        depth_c = (120 + 130 * ct) * head
        width = (28 + 95 * ct) * (0.85 + 0.3 * (wob * 0.5 + 0.5)) * head + 6
        wall = 120 + 60 * (1 - ct) + 30 * wob
        floor = np.maximum(base - depth_c, 28.0 + 40 * (1 - ct))                       # dry floors: forest, grass and cold rock desert, never a lake
        prof = np.clip((cd - width) / wall, 0, 1) ** np.where(ct < 0.35, 1.8, 0.6)         # U-shaped up high, V and slot lower down
        carved = floor + (h - floor) * prof
        carved = np.where(prof < 1, 0.74 * carved + 0.26 * (np.round(carved / 14) * 14), carved)   # benches in the walls: the strata
        h = np.where(cd < width + wall, np.minimum(h, carved), h)
        floor_mask |= (cd < width) & (head > 0.5)
    # fjords from the lake into the range's west side (below the water line, U-shaped, steep walls)
    fjords = [[(-7400, -10400), (-6300, -10500), (-5500, -10800)], [(-7300, -12000), (-6200, -11900), (-5300, -12200)], [(-7000, -13600), (-6000, -13500)]]
    for f in fjords:
        fd, ft = poly_dist(qx, qz, f)
        w = 300 * (1 - 0.4 * ft)
        u = np.clip(1 - (fd / w) ** 2, 0, 1)
        h = h * (1 - u) + (-28 + 14 * ft) * u
    # ---- water: lake shore, finger lake, rivers, beaches ----
    land = ss(-60, 160, inland)
    h = h * land + (-22 + 8 * ss(-400, 0, inland)) * (1 - land)
    lk = np.clip(1 - (ld / lake_half) ** 2, 0, 1)
    h = np.where(ld < lake_half * 1.25, np.minimum(h, h * (1 - ss(0, 1, lk * 3)) + (-14) * ss(0, 1, lk * 3)), h)
    for line, half in rivers:
        rd, rt = poly_dist(px, pz, line)
        hw = half * (1 - 0.6 * rt)
        u = np.clip(1 - (rd / hw) ** 2, 0, 1) * (1 - ss(0.75, 1.0, rt))
        h = h * (1 - u) + (-4) * u
    # continue from the old edge: blend the first 900 m toward the old north row
    cont = 1 - ss(0, 450, depth)
    h = h * (1 - cont) + np.broadcast_to(edge, h.shape) * cont
    # glacier: high, gentle ground
    gy, gx = np.gradient(h, mpp); slope = np.hypot(gx, gy)
    glacier = (h > 470) & (slope < 0.75)
    glacier = binary_dilation(glacier, iterations=2) & (h > 440)
    # ---- land use ----
    wet = h < 0.3
    wine_p = 1 - ss(2600, 3500, depth + 320 * fbm(px.shape, 16, 3, 60))                   # wine country edge, wandering (no straight seam)
    # Holland-style tulip farms: parcels ~150 x 320 m on the flats near the finger lake, long single-colour bands, grass lanes between parcels
    PW, PL = 150.0, 320.0
    pid = (np.floor((px + 9000) / PW).astype(np.int64) * 100000 + np.floor((pz + 20000) / PL).astype(np.int64))
    uq, inv = np.unique(pid, return_inverse=True); inv = inv.reshape(px.shape)
    cnt = np.bincount(inv.ravel())
    def per_parcel(v): return (np.bincount(inv.ravel(), weights=v.ravel().astype(np.float64)) / cnt)[inv]
    flat = per_parcel(slope) < 0.045; dry = per_parcel(wet.astype(np.float32)) < 0.02; low = per_parcel(h) < 24
    near_lake = per_parcel(np.minimum(ld - lake_half, 4000)) < 2600
    lx = np.mod(px + 9000, PW); lz = np.mod(pz + 20000, PL)
    lane = (lx < 5) | (lz < 5)
    TULIP = [(220, 30, 40), (250, 210, 30), (240, 120, 170), (150, 60, 170), (250, 250, 245), (245, 120, 30)]
    pr = ((uq * 2654435761) % 4294967296)[inv]                                               # a per-parcel random number
    tulip_zone = (wine_p > 0.7) & flat & dry & low & near_lake & (pr % 5 != 0) & ~wet
    band_w = 18.0                                                                          # wider than 2 cells of the 6 m grid, or the bands alias to one colour
    bands = ((np.floor(lz / band_w).astype(np.int64) % 2) * 3 + (pr // 7)) % 6                # each parcel alternates two of the six colours
    # vineyards: parcels ~180 x 240 m on south-facing slopes, rows running downhill
    VW, VL = 180.0, 240.0
    vid = (np.floor((px + 9100) / VW).astype(np.int64) * 100000 + np.floor((pz + 20100) / VL).astype(np.int64))
    vq, vinv = np.unique(vid, return_inverse=True); vinv = vinv.reshape(px.shape)
    vcnt = np.bincount(vinv.ravel())
    def per_v(v): return (np.bincount(vinv.ravel(), weights=v.ravel().astype(np.float64)) / vcnt)[vinv]
    vine = (wine_p > 0.7) & (per_v(gy) > 0.012) & (per_v(slope) < 0.13) & (per_v(wet.astype(np.float32)) < 0.01) & (per_v(h) > 8) & ~tulip_zone & ~wet
    vine &= ~((np.mod(px + 9100, VW) < 4) | (np.mod(pz + 20100, VL) < 4))                 # farm tracks between blocks
    # the giant forest: sequoia and redwood old growth on the coastal side, leading from the wine country up into the range
    giant = (~wet) & (inland > 120) & (inland < 2700 + 400 * fbm(px.shape, 17, 3, 60)) & (depth > 2300 + 300 * fbm(px.shape, 18, 3, 50)) & (depth < 6600) & (slope < 0.7) & (h < 430)
    forest = (~wet) & (~vine) & (~tulip_zone) & (~giant) & (h < 430) & (slope < 0.9) & (fbm(px.shape, 13, 4, 50) > np.where(wine_p > 0.5, 0.35, -0.5))
    glacier &= ~wet
    rock = (~wet) & ((slope > 0.75) | (h > 430)) & ~glacier
    tundra = floor_mask & (fbm(px.shape, 14, 3, 30) > 0.15) & ~wet
    meadow = (~wet) & ~(vine | tulip_zone | forest | rock | glacier | tundra | giant)
    # ---- albedo (4 m/px for albedo_hi: 1.5x the height grid) ----
    col = np.zeros(px.shape + (3,), np.float32)
    def paint(mask, rgb, jitter=10): col[mask] = np.array(rgb, np.float32)
    paint(meadow, (112, 136, 72)); paint(forest, (46, 76, 41)); paint(giant, (34, 54, 30)); paint(rock, (120, 116, 110)); paint(glacier, (232, 238, 244)); paint(tundra, (152, 140, 112))
    paint(wet, (30, 60, 80)); paint(vine, (96, 116, 62))
    for k, c in enumerate(TULIP): paint(tulip_zone & (bands == k) & ~lane, c)
    paint(tulip_zone & lane, (120, 140, 80))
    rows = (np.floor(np.mod(px + 9100, VW) / 3.0).astype(int) % 2 == 0)                    # vine rows (north-south, downhill) read as stripes from the air
    col[vine & rows] *= 0.8
    col[giant & (fbm(px.shape, 19, 2, 2) > 0.6)] = (70, 52, 38)                             # red-brown crowns and trunks breaking through
    beach = (~wet) & (h < 1.2) & (wine + rng_w > 0) & (slope < 0.08) & (distance_transform_edt(~wet) * mpp < 60)   # a strip at the water's edge, not whole lowlands
    paint(beach & ~tulip_zone, (190, 175, 140))
    col *= (0.88 + 0.24 * (fbm(px.shape, 15, 4, 8) * 0.5 + 0.5))[..., None]
    shade = np.clip(0.75 + (gx - gy) * 1.2, 0.45, 1.15)
    albedo_new = np.clip(col * shade[..., None], 0, 255).astype(np.uint8)
    cls = np.zeros(px.shape + (3,), np.uint8)
    cls[..., 0] = (beach * 255).astype(np.uint8); cls[..., 1] = ((forest | giant) * 255).astype(np.uint8); cls[..., 2] = ((vine | tulip_zone | meadow) * 160).astype(np.uint8)
    # ---- trees: points for the game's tree system ([x, z, conifer, size]; conifer height = 15 + 9 * size) ----
    rngt = np.random.default_rng(77); trees = []
    def scatter(mask, spacing, keep, conifer_p, size_lo, size_hi):
        step = max(1, int(round(spacing / mpp)))
        js, is_ = np.mgrid[0:N:step, 0:W:step]
        js = (js + rngt.integers(0, step, js.shape)).clip(0, N - 1); is_ = (is_ + rngt.integers(0, step, is_.shape)).clip(0, W - 1)
        m = mask[js, is_] & (rngt.random(js.shape) < keep)
        for j, i in zip(js[m], is_[m]):
            cp = conifer_p if np.isscalar(conifer_p) else conifer_p[j, i]
            trees.append([round(float(px[j, i] + rngt.uniform(-2, 2)), 1), round(float(pz[j, i] + rngt.uniform(-2, 2)), 1), int(rngt.random() < cp), round(float(rngt.uniform(size_lo, size_hi)), 2)])
    alt_conifer = np.clip(0.25 + h / 260.0, 0.25, 0.97)                                    # broadleaf woodlots low in the wine country, conifers up the range
    scatter(forest, 24, 0.75, alt_conifer, 0.7, 1.4)
    scatter(giant, 30, 0.85, 1.0, 4.0, 6.6)                                                 # sequoia / redwood old growth: 51-74 m
    scatter(giant, 22, 0.35, 0.6, 0.9, 1.6)                                                 # the understorey between the giants
    print("grow rows", N, "peak", round(float(h.max())), "glacier km2", round(float(glacier.sum() * mpp * mpp / 1e6), 2),
          "vineyard km2", round(float(vine.sum() * mpp * mpp / 1e6), 2), "tulip km2", round(float(tulip_zone.sum() * mpp * mpp / 1e6), 2),
          "forest km2", round(float(forest.sum() * mpp * mpp / 1e6), 1), "giant km2", round(float(giant.sum() * mpp * mpp / 1e6), 1), "water km2", round(float(wet.sum() * mpp * mpp / 1e6), 1))
    # ---- preview ----
    prev = np.vstack([albedo_new, np.zeros((40, W, 3), np.uint8)])
    for lv in range(100, 700, 100):
        cs, _ = cv2.findContours((h >= lv).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE); cv2.drawContours(prev, cs, -1, (30, 30, 30), 1)
    for x in range(-8000, 8001, 2000): cv2.putText(prev, str(x), (int(x / mpp + W / 2), N + 28), 0, 0.8, (255, 255, 255), 2)
    for z in range(-14000, -4000, 2000): cv2.putText(prev, str(z), (8, int((z - NORTH_Z) / mpp + N)), 0, 0.8, (255, 255, 255), 2)
    small = cv2.resize(prev, (W // 2, prev.shape[0] // 2), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(REPO, "docs", "apex-elohim", "north-lands-preview.png"), cv2.cvtColor(small, cv2.COLOR_RGB2BGR))
    hs = np.clip(0.5 + (gx * -0.7 + gy * -0.7) * 2.2, 0, 1); t = np.clip(h / 650, 0, 1)
    rel = np.dstack([0.35 + 0.5 * t, 0.45 + 0.4 * t, 0.3 + 0.55 * t]) * hs[..., None]; rel[wet] = (0.2, 0.35, 0.55)
    cv2.imwrite(os.path.join(REPO, "docs", "apex-elohim", "north-lands-relief.png"), cv2.cvtColor(cv2.resize((rel * 255).astype(np.uint8), (W // 2, N // 2), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2BGR))
    if not apply: return
    # ---- apply ----
    for f in ("height2.u16", "height2.json", "albedo_hi.jpg", "albedo.jpg", "landclass.png", "water_flow.png"):
        src = os.path.join(R, f); bk = os.path.join(R, f.replace(".", ".before_north.", 1))
        if not os.path.exists(bk): shutil.copy2(src, bk)
    full = np.vstack([h, h0])
    lo, hi_ = float(full.min()), float(full.max())
    ((np.clip((full - lo) / (hi_ - lo), 0, 1) * 65535).astype("<u2")).tofile(os.path.join(R, "height2.u16"))
    hm2 = dict(hm); hm2.update({"h": H + N, "min": lo, "max": hi_, "ox": 0, "oz": -N * mpp / 2}); json.dump(hm2, open(os.path.join(R, "height2.json"), "w"))
    def grow_img(name, new_rgb, flags=cv2.IMREAD_UNCHANGED):
        im = cv2.imread(orig(name), flags); ih, iw = im.shape[:2]; s = ih / H
        add = cv2.resize(new_rgb, (iw, int(round(N * s))), interpolation=cv2.INTER_AREA)
        if im.ndim == 3 and im.shape[2] == 4 and add.shape[2] == 3: add = np.dstack([add, np.full(add.shape[:2], 255, np.uint8)])
        out = np.vstack([add, im]); cv2.imwrite(os.path.join(R, name), out, [cv2.IMWRITE_JPEG_QUALITY, 90]); print(name, out.shape)
    grow_img("albedo_hi.jpg", cv2.cvtColor(albedo_new, cv2.COLOR_RGB2BGR), cv2.IMREAD_COLOR)
    grow_img("albedo.jpg", cv2.cvtColor(albedo_new, cv2.COLOR_RGB2BGR), cv2.IMREAD_COLOR)
    grow_img("landclass.png", cv2.cvtColor(cls, cv2.COLOR_RGB2BGR), cv2.IMREAD_COLOR)
    wf = cv2.imread(orig("water_flow.png"), cv2.IMREAD_UNCHANGED); still = np.zeros((1, 1, wf.shape[2]), np.uint8); still[..., :] = wf[0:1, 0:1, :] * 0 + 128
    if wf.shape[2] == 4: still[..., 3] = 0
    grow_img("water_flow.png", np.broadcast_to(still, (N // 2, W // 2, wf.shape[2])).copy() if wf.shape[2] == 3 else np.broadcast_to(still, (N // 2, W // 2, wf.shape[2]))[..., :3].copy())
    json.dump(trees, open(os.path.join(R, "north_trees.json"), "w"), separators=(",", ":")); print("north trees", len(trees))
    lands = {"giantForestKm2": float(giant.sum() * mpp * mpp / 1e6), "vineyardKm2": float(vine.sum() * mpp * mpp / 1e6), "tulipKm2": float(tulip_zone.sum() * mpp * mpp / 1e6), "fingerLake": lake_line,
             "escarpment": esc_line, "canyons": canyons, "fjords": fjords, "peaks": peaks, "kettles": kettles, "tulipColours": TULIP,
             "glacierY": 470, "rows": N}
    json.dump(lands, open(os.path.join(R, "north_lands.json"), "w"))
    print("applied: height2", W, "x", H + N, "oz", -N * mpp / 2)


if __name__ == "__main__":
    main()
