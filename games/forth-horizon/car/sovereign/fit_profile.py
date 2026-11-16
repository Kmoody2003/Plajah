"""
Sovereign GT-R: fit the body profile to the turntable silhouettes.

side view  -> roofline / hood / deck height along the car, wheel centres and radius, ride height
front/rear -> body width at each height
Output: fit.json, consumed by src/car.ts. Silhouettes come from cut*.png (rembg cut-outs of the turntable video).
Car frame: z forward (nose +), x left, y up, metres. Length / width / height from the roster-class dimensions below.
"""
import json, os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.join(HERE, "views")
LEN, WID, HGT = 4.78, 1.98, 1.37      # overall, from the render proportions (roster gives class, not dimensions)


def mask(k):
    a = cv2.imread(os.path.join(V, f"cut{k}.png"), cv2.IMREAD_UNCHANGED)[..., 3]
    m = (a > 128).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    i = 1 + int(np.argmax(st[1:, 4]))
    return (lab == i).astype(np.uint8)


def crop(m):
    ys, xs = np.nonzero(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


side_a = crop(mask(3))                 # nose to the left
side_b = crop(mask(6))[:, ::-1]        # nose to the right in the image: mirror so the nose is left
H0 = 400
def norm(m, w, h):
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA)
W0 = 1200
a = norm(side_a, W0, H0).astype(np.float32)
b = norm(side_b, W0, H0).astype(np.float32)
side = ((a + b) / 2 > 0.5).astype(np.uint8)
cv2.imwrite(os.path.join(HERE, "fit_side.png"), side * 255)

# top profile and ride height per column (rows count from the top)
cols = np.arange(W0)
top = np.array([np.argmax(side[:, c] > 0) if side[:, c].any() else H0 for c in cols], float)
bot = np.array([H0 - np.argmax(side[::-1, c] > 0) if side[:, c].any() else H0 for c in cols], float)
# silhouette height (m) above the lowest point, and the lowest points are the tyres
scale = HGT / H0
top_h = (H0 - top) * scale
bot_h = (H0 - bot) * scale
# wheel detection: the two lowest bumps of the bottom profile
low = bot_h.copy()
wheel_cols = np.where(low < 0.06)[0]
groups = np.split(wheel_cols, np.where(np.diff(wheel_cols) > 8)[0] + 1) if len(wheel_cols) else []
groups = [g for g in groups if len(g) > 40]
print("wheel groups (columns):", [(int(g[0]), int(g[-1])) for g in groups])
zs = (0.5 - cols / W0) * LEN            # nose (left, col 0) is +z
wheels = []
for g in groups[:2]:
    c0, c1 = g[0], g[-1]
    # the tyre silhouette is wider than its contact patch: estimate the radius from the arch gap in the top profile of the tyre region
    wheels.append({"z": float((zs[c0] + zs[c1]) / 2), "contact_half_width": float(abs(zs[c0] - zs[c1]) / 2)})
profile = []
step = 10
for c in range(0, W0, step):
    profile.append({"z": float(zs[c]), "top": float(np.mean(top_h[c:c + step])), "bot": float(np.mean(bot_h[c:c + step]))})

# front and rear views: body width (m) against height
def widths(k, flip=False):
    m = crop(mask(k))
    h, w = m.shape
    mm = norm(m, 800, int(800 * h / w)).astype(np.uint8)
    hh = mm.shape[0]
    rows = []
    for r in range(hh):
        xs = np.nonzero(mm[r])[0]
        rows.append((xs.max() - xs.min() + 1) / mm.shape[1] if len(xs) else 0.0)
    rows = np.array(rows)
    # image width is the car width, image height is the car height (perspective is mild at these focal lengths)
    return {"aspect": h / w, "rows": rows[::max(1, hh // 40)].tolist()}

front = widths(1)
rear = widths(4)
print("front aspect h/w", round(front["aspect"], 3), "rear", round(rear["aspect"], 3))
json.dump({"length": LEN, "width": WID, "height": HGT, "wheels": wheels, "profile": profile, "front": front, "rear": rear}, open(os.path.join(HERE, "fit.json"), "w"))
print("profile points", len(profile), "wheels", wheels)
