"""
Water flow map for the region game.
Water is everything below the lake surface level (-0.3 m). The map gives each water pixel:
  R, G  flow direction (x, z) times speed, 0.5 = still   (speed up to 2 m/s)
  B     depth, sqrt scaled (0..12 m)
  A     shoreline closeness, 255 at the bank, 0 at 40 m out
The thin river (meta.river.xz runs from the lake shore inland) flows downstream toward the lake; the wide eastern channel flows along its long axis
toward the lake side; the lake itself barely moves. Everything is blurred so the current bends smoothly around the banks.
Output: public/games/apex/region/water_flow.png   Usage: python tools/build_water.py
"""
import json, os
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.abspath(os.path.join(HERE, "..", "..", "..", "public", "games", "apex", "region"))
meta = json.load(open(os.path.join(REG, "region.json")))
W, H, MPP = meta["width"], meta["height"], meta["mpp"]
h = np.fromfile(os.path.join(REG, "height.f32"), dtype=np.float32).reshape(H, W)
LEVEL = -0.3
water = (h < LEVEL).astype(np.uint8)
depth = np.clip(LEVEL - h, 0, None)

n, lab, st, cen = cv2.connectedComponentsWithStats(water, 8)
order = sorted(range(1, n), key=lambda i: -st[i, 4])
lake_id = order[0]
print("components", [(int(st[i, 4]), tuple(int(c) for c in cen[i])) for i in order[:4]])

# river polyline in pixels, downstream (toward the lake) = reversed order
pts = np.array(meta["river"]["xz"], dtype=np.float32)
px = pts[:, 0] / MPP + W / 2
py = pts[:, 1] / MPP + H / 2
poly = np.stack([px, py], 1)
down = poly[::-1] if px[0] < px[-1] else poly      # polyline from inland to lake shore
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

best_d = np.full((H, W), 1e9, np.float32)
fx = np.zeros((H, W), np.float32); fz = np.zeros((H, W), np.float32)
for i in range(len(down) - 1):
    a, b = down[i], down[i + 1]
    ab = b - a; L2 = float((ab ** 2).sum()) + 1e-6
    t = np.clip(((xx - a[0]) * ab[0] + (yy - a[1]) * ab[1]) / L2, 0, 1)
    cx = a[0] + t * ab[0]; cy = a[1] + t * ab[1]
    d = np.hypot(xx - cx, yy - cy)
    m = d < best_d
    best_d[m] = d[m]
    tl = ab / np.sqrt(L2)
    fx[m] = tl[0]; fz[m] = tl[1]
river_w = np.exp(-(best_d / 16.0) ** 2)             # about 190 m either side of the centreline

# the wide eastern channel: principal axis of the second largest water body, pointing toward the lake (smaller x)
vx = np.zeros((H, W), np.float32); vz = np.zeros((H, W), np.float32)
speed = np.zeros((H, W), np.float32)
for cid in order[1:4]:
    if st[cid, 4] < 20000: continue
    ys, xs = np.nonzero(lab == cid)
    c = np.stack([xs - xs.mean(), ys - ys.mean()], 1)
    u, s, vt = np.linalg.svd(c, full_matrices=False)
    ax = vt[0]
    if ax[0] > 0: ax = -ax
    m = lab == cid
    vx[m] = ax[0]; vz[m] = ax[1]
    speed[m] = 0.85
    print("channel", cid, "axis", ax)
# the lake: a slow drift toward the east shore from the wind
lm = lab == lake_id
vx[lm] = 0.6; vz[lm] = 0.0; speed[lm] = 0.12

river_speed = 1.5
flow_x = (river_w * fx * river_speed + (1 - river_w) * vx * speed)
flow_z = (river_w * fz * river_speed + (1 - river_w) * vz * speed)
# slow down toward the banks (friction) and deep, open water
dist = cv2.distanceTransform(water, cv2.DIST_L2, 5)
bank = np.clip(dist * MPP / 40.0, 0, 1) ** 0.6
flow_x *= bank; flow_z *= bank
flow_x = cv2.GaussianBlur(flow_x, (0, 0), 3); flow_z = cv2.GaussianBlur(flow_z, (0, 0), 3)
flow_x *= water; flow_z *= water

out = np.zeros((H, W, 4), np.uint8)
out[..., 2] = np.clip(np.clip(flow_x / 2.0, -1, 1) * 127.5 + 127.5, 0, 255)      # R (BGR order for cv2)
out[..., 1] = np.clip(np.clip(flow_z / 2.0, -1, 1) * 127.5 + 127.5, 0, 255)      # G
out[..., 0] = np.clip(np.sqrt(np.clip(depth / 12.0, 0, 1)) * 255, 0, 255)        # B
shore = np.clip(1.0 - dist * MPP / 40.0, 0, 1) * water
out[..., 3] = np.clip(shore * 255, 0, 255)
cv2.imwrite(os.path.join(REG, "water_flow.png"), out)
print("wrote water_flow.png", out.shape, "river speed max", float(np.hypot(flow_x, flow_z).max()))
# debug picture: flow arrows over the water mask
dbg = cv2.cvtColor(water * 120, cv2.COLOR_GRAY2BGR)
for y in range(8, H, 16):
    for x in range(8, W, 16):
        if water[y, x] and (abs(flow_x[y, x]) + abs(flow_z[y, x])) > 0.15:
            cv2.arrowedLine(dbg, (x, y), (int(x + flow_x[y, x] * 10), int(y + flow_z[y, x] * 10)), (0, 255, 255), 1, tipLength=0.4)
cv2.imwrite(os.path.join(HERE, "..", "..", "..", "docs", "apex-elohim", "_water_flow_debug.png"), dbg)
