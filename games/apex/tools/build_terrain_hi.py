"""
A finer, more logical terrain: 6 m height grid and a 4 m ground texture, made from the 12 m map.

Heights (region/height2.u16 + height2.json): the 12 m height map is resampled to 6 m with a cubic filter, then detail is added where the ground really has it and nowhere else:
  dunes       shore-parallel ridges (stretched noise) a few metres high on the sand
  forest      small hummocks and gullies under the trees
  farmland    a faint swell, so fields are not planar
  roads, towns, yards, the circuits, the highways, the water edge: untouched (the detail fades to nothing within 40 m of them), so every road, building and wall already placed stays on the ground
The game loads height2 in place of height.f32 (same extent, 2752 x 1536 at 6 m), so the terrain mesh, the physics and all the cut and fill follow it.
Ground texture (region/albedo_hi.jpg, 4128 x 2304): the map texture resampled 3x, sharpened, with land-cover detail (canopy speckle in forests, grain in fields, ripples on sand) so it holds up closer.
Run:  python games/apex/tools/build_terrain_hi.py
"""
import json
import math
import os
import cv2
import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, "..", "..", "..", "public", "games", "apex", "region")
meta = json.load(open(os.path.join(REG, "region.json")))
W0, H0, MPP0 = meta["width"], meta["height"], meta["mpp"]
S = 2
W, H, MPP = W0 * S, H0 * S, MPP0 / S
rng = np.random.default_rng(31337)

h0 = np.fromfile(os.path.join(REG, "height.f32"), dtype="f4").reshape(H0, W0)
alb0 = cv2.imread(os.path.join(REG, "albedo.jpg"))

# ---------- base: cubic resample, not allowed to overshoot the original range or cross the waterline ----------
h = cv2.resize(h0, (W, H), interpolation=cv2.INTER_CUBIC)
h = np.clip(h, h0.min(), h0.max())
water0 = cv2.resize((h0 < 2.5).astype(np.uint8), (W, H), interpolation=cv2.INTER_NEAREST) > 0
base = h.copy()

# ---------- land cover from the map texture ----------
alb = cv2.resize(alb0, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0
b, g, r = alb[..., 0], alb[..., 1], alb[..., 2]
lum = 0.299 * r + 0.587 * g + 0.114 * b
green = np.clip((g - np.maximum(r, b)) * 7.0, 0, 1)
sandy = np.clip((r - b) * 5.0 - 0.15, 0, 1) * (1 - green) * np.clip((lum - 0.28) / 0.22, 0, 1)
dark = 1 - np.clip((lum - 0.12) / 0.18, 0, 1)
forest = np.clip(dark * green * 1.4 + (lum < 0.22) * green, 0, 1)
field = np.clip(green * (1 - forest) + (1 - green) * (1 - sandy) * 0.6, 0, 1) * (1 - sandy)
forest = ndi.gaussian_filter(forest, 2.0); sandy = ndi.gaussian_filter(sandy, 2.5); field = ndi.gaussian_filter(field, 2.0)


def noise(sigma_x, sigma_y, seed):
    n = np.random.default_rng(seed).standard_normal((H, W)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), sigmaX=sigma_x, sigmaY=sigma_y)
    return n / (n.std() + 1e-6)


def fbm(wl_m, seed, octaves=4):
    out = np.zeros((H, W), np.float32); a = 1.0
    for o in range(octaves):
        s = max(wl_m / MPP / 2.5 / (2 ** o), 0.6)
        out += a * noise(s, s, seed + o); a *= 0.5
    return out / (out.std() + 1e-6)


# ---------- where detail must NOT go ----------
protect = np.zeros((H, W), np.uint8)
px = lambda x, z: (int(round(x / MPP + W / 2)), int(round(z / MPP + H / 2)))


def poly(pts, wm):
    cv2.polylines(protect, [np.array([px(*p) for p in pts], np.int32)], False, 1, max(1, int(wm / MPP)))


for k, wm in (("coastal_highway", 40), ("freeway", 50)):
    poly(meta[k]["xz"], wm)
for c in meta["circuits"].values():
    poly(c["xz"], 60)
for fn, wm in (("country_roads.json", 24), ("user_streets.json", 30), ("farbank_streets.json", 30)):
    p = os.path.join(REG, fn)
    if os.path.exists(p):
        for rr in json.load(open(p))["roads"]:
            poly(rr["xz"], wm)
for fn in ("shoreline_highway.json",):
    p = os.path.join(REG, fn)
    if os.path.exists(p):
        poly(json.load(open(p))["xz"], 160)                                  # the graded bench and its slopes
ic = os.path.join(REG, "industrial_circuit.json")
if os.path.exists(ic):
    poly(json.load(open(ic))["xz"], 60)
um = os.path.join(REG, "user_map.json")
if os.path.exists(um):
    for f in json.load(open(um))["features"]:
        if f["type"] == "road":
            poly(f["pts"], 40)
        elif f["kind"] in ("dense", "industrial", "residential", "waterfront", "civic", "commercial"):
            cv2.fillPoly(protect, [np.array([px(*p) for p in f["pts"]], np.int32)], 1)      # built zones stay as they are
# the creek and its bank, the bridges' abutments
poly([(-650, -1250), (-720, -1420), (-800, -1560), (-850, -1680), (-885, -1800), (-930, -1950), (-985, -2100)], 110)
poly([(3288, 2748), (4248, 2796)], 120); poly([(5928, -3888), (6624, -3888)], 120)
# every building footprint
city = json.load(open(os.path.join(REG, "city.json")))["items"]
for it in city:
    cv2.circle(protect, px(it["bx"], it["bz"]), max(2, int(max(it["w"], it["d"]) * 0.6 / MPP)), 1, -1)
# the baked city street mask covers the old city
cm = os.path.join(REG, "city_mask.json")
if os.path.exists(cm):
    m = json.load(open(cm)); img = cv2.imread(os.path.join(REG, "city_mask.png"))
    if img is not None:
        sx0, sz0 = px(m["x0"], m["z0"]); sw, sh = int(m["w"] / MPP), int(m["h"] / MPP)
        small = cv2.resize((img.max(axis=2) > 40).astype(np.uint8), (sw, sh), interpolation=cv2.INTER_NEAREST)
        ys, xs = max(sz0, 0), max(sx0, 0)
        ye, xe = min(sz0 + sh, H), min(sx0 + sw, W)
        protect[ys:ye, xs:xe] |= small[ys - sz0:ye - sz0, xs - sx0:xe - sx0]
dist = ndi.distance_transform_edt(protect == 0) * MPP
free = np.clip((dist - 10.0) / 35.0, 0, 1)
free = free * free * (3 - 2 * free)
shore = np.clip((base - 2.5) / 5.0, 0, 1)                                      # nothing near the waterline moves
free *= shore * (~water0)

# ---------- the detail ----------
# dunes: ridges that run along the shore (the lake is to the west, so ridges run north-south): ridged noise stretched along z
ridge = 1.0 - np.abs(noise(4.5, 16.0, 11))
ridge = (ridge - ridge.mean()) / (ridge.std() + 1e-6)
dune = (0.7 * ridge + 0.5 * fbm(300, 100, 3)) * 1.5
# forest floor: hummocks and gullies
hum = fbm(70, 200, 4) * 0.5
swell = fbm(260, 300, 3) * 0.28
detail = dune * sandy + hum * forest + swell * field
detail -= ndi.gaussian_filter(detail, 24)                                       # no change to the broad shape the map already has
detail *= free
out = base + detail
out = np.where(base >= 2.6, np.maximum(out, 2.6), out)                           # land stays land
out = np.where(water0, base, out)
print("detail range m", float(detail.min()), float(detail.max()), "dunes where sand >0.5:", int((sandy > 0.5).sum()), "protected %", round(float(protect.mean()) * 100, 1))

# ---------- grade the built zones: a town sits on gentle ground, not on the raw hillside ----------
# Inside every residential, dense, commercial, industrial, civic and waterfront zone the height is blended toward a heavily smoothed copy of itself (84 m radius), feathered over 60 m at the edge,
# so streets can run at sensible grades and buildings stand on ground that is close to level. Broad shape (the bluff, the valley) stays; water and the land next to it do not move.
if os.path.exists(um):
    zmask = np.zeros((H, W), np.uint8)
    for f in json.load(open(um))["features"]:
        if f["type"] == "zone" and f["kind"] in ("residential", "dense", "commercial", "industrial", "civic", "waterfront"):
            cv2.fillPoly(zmask, [np.array([px(*p) for p in f["pts"]], np.int32)], 1)
    zd = ndi.distance_transform_edt(zmask > 0) * MPP                       # metres inside the zone
    wz = np.clip(zd / 60.0, 0, 1); wz = wz * wz * (3 - 2 * wz)
    smooth = ndi.gaussian_filter(out, 14.0)
    smooth = ndi.gaussian_filter(smooth, 8.0)
    graded = out + (smooth - out) * wz
    graded = np.where(water0, out, graded)
    graded = np.where(out >= 2.6, np.maximum(graded, 2.6), graded)
    gy_, gx_ = np.gradient(out); gy2, gx2 = np.gradient(graded)
    sl0 = float((np.hypot(gx_, gy_)[zmask > 0] / MPP).mean()); sl1 = float((np.hypot(gx2, gy2)[zmask > 0] / MPP).mean())
    print("built zones graded: mean slope", round(sl0, 3), "->", round(sl1, 3))
    out = graded

# ---------- write heights as 16-bit ----------
lo, hi = float(np.floor(out.min())), float(np.ceil(out.max()))
u16 = np.clip((out - lo) / (hi - lo) * 65535.0 + 0.5, 0, 65535).astype("<u2")
u16.tofile(os.path.join(REG, "height2.u16"))
json.dump({"w": W, "h": H, "mpp": MPP, "min": lo, "max": hi}, open(os.path.join(REG, "height2.json"), "w"))
print("height2", W, "x", H, "at", MPP, "m, range", lo, hi, "bytes", u16.nbytes)

# ---------- ground texture ----------
T = 3
tw, th = W0 * T, H0 * T
tex = cv2.resize(alb0, (tw, th), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0
blur = cv2.GaussianBlur(tex, (0, 0), 1.6)
tex = np.clip(tex + (tex - blur) * 0.9, 0, 1)                                   # sharpen field edges and tracks
def up(a): return cv2.resize(a, (tw, th), interpolation=cv2.INTER_LINEAR)
f_forest, f_sand, f_field = up(forest), up(sandy), up(field)
def tn(sx, sy, seed):
    n = np.random.default_rng(seed).standard_normal((th, tw)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), sigmaX=sx, sigmaY=sy)
    return n / (n.std() + 1e-6)
canopy = 0.6 * tn(1.1, 1.1, 1) + 0.4 * tn(3.0, 3.0, 2)
grain = 0.7 * tn(0.8, 0.8, 3) + 0.3 * tn(4.0, 4.0, 4)
ripple = tn(2.2, 0.9, 5)
mod = 1.0 + 0.16 * canopy * f_forest + 0.07 * grain * f_field + 0.05 * ripple * f_sand
tex = np.clip(tex * mod[..., None], 0, 1)
# ---------- the satellite is a guide, not the truth: inside the zones we model, the ground is repainted from land cover ----------
# The map's houses, roads, tank ponds and forest shadows under a town we have laid out ourselves look wrong, so inside each built zone (and the port platform) the ground colour comes from the
# kind of place: lawn and gardens, concrete, gravel yards. The satellite still shows everywhere else (fields, forest, dunes, water) and a little of it is kept for variety.
def tex_px(x, z):
    return int(round(x / (MPP0 / T) + tw / 2)), int(round(z / (MPP0 / T) + th / 2))
ZONE_COL = {   # RGB
    "residential": (0.30, 0.43, 0.22), "dense": (0.43, 0.42, 0.41), "industrial": (0.44, 0.42, 0.38), "waterfront": (0.50, 0.48, 0.44),
    "commercial": (0.40, 0.41, 0.36), "civic": (0.36, 0.43, 0.28),
}
paint = np.zeros((th, tw, 3), np.float32); pw = np.zeros((th, tw), np.float32)
umf = os.path.join(REG, "user_map.json")
if os.path.exists(umf):
    for f in json.load(open(umf))["features"]:
        if f["type"] == "zone" and f["kind"] in ZONE_COL:
            m = np.zeros((th, tw), np.uint8)
            cv2.fillPoly(m, [np.array([tex_px(*q) for q in f["pts"]], np.int32)], 1)
            r_, g_, b_ = ZONE_COL[f["kind"]]
            sel = m > 0
            paint[sel] = (b_, g_, r_); pw[sel] = 1.0                                           # later zones win where they overlap
pdf = os.path.join(REG, "port_district.json")
if os.path.exists(pdf):
    pd = json.load(open(pdf))
    m = np.zeros((th, tw), np.uint8); cv2.fillPoly(m, [np.array([tex_px(*q) for q in pd["platform"]["poly"]], np.int32)], 1)
    paint[m > 0] = (0.45, 0.45, 0.47); pw[m > 0] = 1.0
if pw.any():
    wsoft = cv2.GaussianBlur(pw, (0, 0), 6.0)                                                      # a feathered edge (about 24 m)
    macro = 1.0 + 0.10 * (tn(40, 40, 21) * 0.6 + tn(12, 12, 22) * 0.4)
    micro = 1.0 + 0.06 * tn(1.0, 1.0, 23)
    base_ = np.clip(paint * (macro * micro)[..., None], 0, 1)
    # keep a hint of the satellite's own brightness so the repaint is not flat
    lum_s = (0.114 * tex[..., 0] + 0.587 * tex[..., 1] + 0.299 * tex[..., 2])
    base_ = np.clip(base_ * (0.85 + 0.3 * np.clip(lum_s / 0.45, 0.4, 1.4))[..., None], 0, 1)
    tex = tex * (1 - wsoft[..., None]) + base_ * wsoft[..., None]
    print("repainted built zones:", round(float((wsoft > 0.5).mean()) * 100, 1), "% of the map")
# ---------- the satellite's bridges are painted on the river bed: take them out ----------
# The map's real crossing shows as a pale strip on the bed, visible through the water, right under the bridge we build. Inside the river reaches we cut (src/riverBridges.ts RIVER_REACHES) the bed is repainted
# with the river's own colour (the median of the clear water around it), with a feathered edge.
REACHES = [([[3830, 2700], [3825, 2790], [3700, 2860], [3560, 2930], [3500, 3020]], 215.0, False), ([[3300, 2745], [3800, 2760], [4250, 2800]], 120.0, True)]
water_px = np.zeros((th, tw), np.uint8)
water_full = cv2.resize((h0 < 2.5).astype(np.uint8), (tw, th), interpolation=cv2.INTER_NEAREST) > 0
reach = np.zeros((th, tw), np.uint8)
for line, half, only_water in REACHES:
    one = np.zeros((th, tw), np.uint8)
    cv2.polylines(one, [np.array([tex_px(*q) for q in line], np.int32)], False, 1, int(2 * half / (MPP0 / T)))
    if only_water: one &= water_full.astype(np.uint8)
    reach |= one
ref = tex[(reach == 0) & water_full & (cv2.dilate(reach, np.ones((60, 60), np.uint8)) > 0)]
if len(ref):
    col = np.median(ref, axis=0)
    wsoft = cv2.GaussianBlur(reach.astype(np.float32), (0, 0), 7.0)
    wsoft = np.clip(wsoft, 0, 1)[..., None]
    nz = 1.0 + 0.05 * tn(6, 6, 31)[..., None]
    tex = tex * (1 - wsoft) + np.clip(col[None, None, :] * nz, 0, 1) * wsoft
    print("river reaches repainted with", np.round(col * 255).astype(int).tolist())
cv2.imwrite(os.path.join(REG, "albedo_hi.jpg"), (tex * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
print("albedo_hi", tw, "x", th, "bytes", os.path.getsize(os.path.join(REG, "albedo_hi.jpg")))

# ---------- land class map for the shader: sand only where sand really is (the lake shore and dunes), forest, open field ----------
lake = ndi.label(water0)[0]
edge_labels = set(np.unique(lake[:, 0])) - {0}
lake_mask = np.isin(lake, list(edge_labels))
dist_lake = ndi.distance_transform_edt(~lake_mask) * MPP
near_shore = np.clip(1.0 - (dist_lake - 900.0) / 700.0, 0, 1)                    # full within 900 m of the lake, gone by 1600 m
sand_true = np.clip(sandy * near_shore * 1.2, 0, 1)
forest_true = np.clip(forest * 1.1, 0, 1) * (1 - sand_true)
field_true = np.clip(1.0 - forest_true - sand_true, 0, 1) * (~water0)
cls = np.stack([sand_true, forest_true, field_true], axis=-1)
if "zmask" in globals():                                                          # inside the zones we model the ground is lawn and yard, not the satellite's forest or sand
    inz = zmask > 0
    cls[inz] = (0.0, 0.0, 1.0)
cls = cv2.GaussianBlur(cls.astype(np.float32), (0, 0), 1.2)
cv2.imwrite(os.path.join(REG, "landclass.png"), cv2.cvtColor((np.clip(cls, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
print("landclass: sand", round(float(sand_true.mean()) * 100, 1), "% forest", round(float(forest_true.mean()) * 100, 1), "% field", round(float(field_true.mean()) * 100, 1), "%")
