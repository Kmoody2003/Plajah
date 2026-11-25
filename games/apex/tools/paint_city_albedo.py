"""Replace the mock satellite imagery under the real street plan with a neutral urban ground tone."""
import json, os
import cv2
import numpy as np
import real_city as rc

OUT = os.path.join(rc.REPO, "public", "games", "apex", "region")
img = cv2.imread(os.path.join(OUT, "albedo.jpg"))
h = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)
streets = json.load(open(os.path.join(OUT, "city_streets.json")))
pts = np.array([[(x / rc.MPP + rc.W_MAP / 2), (z / rc.MPP + rc.H_MAP / 2)] for s in streets for x, z in s["p"]], np.float32)
hull = cv2.convexHull(pts).astype(np.int32)
mask = np.zeros(h.shape, np.uint8)
cv2.fillPoly(mask, [hull], 1)
mask = cv2.erode(mask, np.ones((3, 3), np.uint8))
mask &= (h > 0.9).astype(np.uint8)
rng = np.random.default_rng(5)
noise = cv2.GaussianBlur(rng.standard_normal(h.shape).astype(np.float32), (0, 0), 3) * 7
concrete = np.stack([128 + noise, 134 + noise, 136 + noise], -1)   # BGR
lawn_noise = cv2.GaussianBlur(rng.standard_normal(h.shape).astype(np.float32), (0, 0), 2) * 9
lawn = np.stack([66 + lawn_noise * 0.6, 108 + lawn_noise, 78 + lawn_noise * 0.7], -1)
cmx, cmz = rc.ll_to_world(rc.X["lon0"], rc.X["lat0"])
gx, gz = np.meshgrid((np.arange(rc.W_MAP) - rc.W_MAP / 2) * rc.MPP, (np.arange(rc.H_MAP) - rc.H_MAP / 2) * rc.MPP)
dcm = np.hypot(gx - cmx, gz - cmz)
t = np.clip((dcm - 600) / 900.0, 0, 1)
t = (t * t * (3 - 2 * t))[..., None]
tone = concrete * (1 - t * 0.85) + lawn * (t * 0.85)   # concrete downtown, lawns and gardens in the neighbourhoods
soft = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.5)[..., None]
img = (img * (1 - soft) + tone * soft).astype(np.uint8)
cv2.imwrite(os.path.join(OUT, "albedo.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
print("painted", int(mask.sum()), "px")
