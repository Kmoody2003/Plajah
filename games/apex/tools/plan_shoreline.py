"""
Plan the Great Lake shoreline highway: a two-lane road winding down the whole west coast just inland of the beach, graded onto the hillside (the game cuts and fills the height map
along it), with one open gallery tunnel where the hill is steepest: a roof slab, a solid wall on the hill side and arched openings looking out on the lake.
Writes region/shoreline_highway.json  {xz, y, gallery:{from,to}}.
"""
import json, os
import numpy as np
from scipy.ndimage import gaussian_filter1d, map_coordinates

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, "..", "..", "..", "public", "games", "apex", "region")
meta = json.load(open(os.path.join(REG, "region.json")))
W, H, MPP = meta["width"], meta["height"], meta["mpp"]
h = np.fromfile(os.path.join(REG, "height.f32"), dtype="f4").reshape(H, W)
def hat(x, z):
    return map_coordinates(h, [[z / MPP + H / 2], [x / MPP + W / 2]], order=1, mode="nearest")[0]
cliff = np.array(meta["circuits"]["great_lakes_cliff_raceway"]["xz"])

STEP = 40.0
zs = np.arange(-4300, 4300, STEP)
coast = []
for z in zs:
    row = h[int(np.clip(z / MPP + H / 2, 0, H - 1))]
    x = int(np.argmax(row > 2.5))
    coast.append((x - W / 2) * MPP)
coast = np.array(coast)
coast = gaussian_filter1d(np.median(np.stack([np.roll(coast, k) for k in range(-8, 9)]), axis=0), 5)   # the shore without its small bays
xs = coast + 110.0
# keep the road on land, and off the cliff raceway
for i, z in enumerate(zs):
    x = xs[i]
    for _ in range(40):
        near = np.min(np.hypot(cliff[:, 0] - x, cliff[:, 1] - z))
        if hat(x, z) >= 6.0 and near > 75:
            break
        x += 20.0
    xs[i] = x
xs = gaussian_filter1d(xs, 3)
# a road is smoother than a shore: take the lateral wiggle out of slopes steeper than they need
g = np.array([hat(x, z) for x, z in zip(xs, zs)])
y = gaussian_filter1d(g, 7) + 0.6
for _ in range(4):                                                                                       # at most 7 % grade, both ways
    for i in range(1, len(y)): y[i] = np.clip(y[i], y[i - 1] - 0.07 * STEP, y[i - 1] + 0.07 * STEP)
    for i in range(len(y) - 2, -1, -1): y[i] = np.clip(y[i], y[i + 1] - 0.07 * STEP, y[i + 1] + 0.07 * STEP)
# the gallery: 560 m where the hill rises most steeply on the inland side and the road is not turning hard
rise = np.array([hat(x + 55, z) - yy for x, z, yy in zip(xs, zs, y)])
n = int(560 / STEP)
score = np.array([rise[i:i + n].mean() - 8.0 * abs(np.diff(xs[i:i + n]).sum()) / (n * STEP) for i in range(len(zs) - n)])
a = int(np.argmax(score)); b = a + n
print("road", len(zs), "pts, length km", round(len(zs) * STEP / 1000, 1), "gallery z", zs[a], zs[b], "mean inland rise", round(float(rise[a:b].mean()), 1), "min dist to raceway", round(float(min(np.min(np.hypot(cliff[:, 0] - x, cliff[:, 1] - z)) for x, z in zip(xs, zs))), 1))
json.dump({"xz": [[round(float(x), 1), round(float(z), 1)] for x, z in zip(xs, zs)], "y": [round(float(v), 2) for v in y], "gallery": {"from": int(a), "to": int(b)}}, open(os.path.join(REG, "shoreline_highway.json"), "w"), separators=(",", ":"))
