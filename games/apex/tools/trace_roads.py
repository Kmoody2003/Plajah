"""
Trace the country roads that are visible in the map texture (region/albedo.jpg) into world-space polylines (region/country_roads.json).
Straight section roads are found from row/column ridges of the thin pale road lines; curved lanes from a skeleton of the remaining road pixels.
Only the rural land west of the shipping river and outside the baked city blob is traced; the highway and freeway already exist in region.json.
Usage: python tools/trace_roads.py [debug.png]
"""
import json, os, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, "..", "..", "..", "public", "games", "apex", "region")
meta = json.load(open(os.path.join(REG, "region.json")))
W, H, MPP = meta["width"], meta["height"], meta["mpp"]
img = cv2.imread(os.path.join(REG, "albedo.jpg"))
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
sat = hsv[..., 1] / 255.0
ridge = gray - cv2.GaussianBlur(gray, (0, 0), 2.5)
cand = ((ridge > 9) & (sat < 0.24) & (gray > 105)).astype(np.uint8)
# keep to the rural land: west of the river (x < 1000 px at this latitude varies) and away from the baked city blob and water
height = np.fromfile(os.path.join(REG, "height.f32"), dtype="f4").reshape(H, W)
valid = (height > 2.0).astype(np.uint8)
valid[:, 1010:] = 0
valid[:, :95] = 0
# beach sand and dunes (pale tan) throw false ridges: mask them with a wide margin
sand = ((hsv[..., 0] > 10) & (hsv[..., 0] < 30) & (sat > 0.12) & (gray > 140)).astype(np.uint8)
sand = cv2.dilate(cv2.morphologyEx(sand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((15, 15), np.uint8))
valid &= (1 - sand)
valid = cv2.erode(valid, np.ones((5, 5), np.uint8))
cand &= valid
cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((1, 1), np.uint8))

roads = []
# ---- straight section roads: columns and rows whose candidate pixels line up over a long run ----
def runs(v, gap=6, minlen=70):
    out, start, last = [], None, None
    for i, on in enumerate(v):
        if on:
            if start is None: start = i
            last = i
        elif start is not None and i - last > gap:
            if last - start >= minlen: out.append((start, last))
            start = None
    if start is not None and last - start >= minlen: out.append((start, last))
    return out

def axis(mat, vertical):
    m = mat if vertical else mat.T
    colsum = m.sum(axis=0).astype(np.float32)
    sm = cv2.GaussianBlur(colsum.reshape(1, -1), (0, 0), 1.0).ravel()
    found = []
    i = 2
    while i < len(sm) - 2:
        if sm[i] > 55 and sm[i] >= sm[i - 1] and sm[i] >= sm[i + 1]:
            # the road may sit on one of the three neighbouring columns: take the union
            band = (m[:, max(0, i - 1):i + 2].max(axis=1) > 0)
            for a, b in runs(band):
                found.append((i, a, b))
            i += 3
        else:
            i += 1
    return found

def long_lines(mask, vertical, minlen=60):
    k = (1, 13) if not vertical else (13, 1)
    m = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones(k, np.uint8))
    k2 = (1, minlen) if not vertical else (minlen, 1)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones(k2, np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    for i in range(1, n):
        ys, xs = np.nonzero(lab == i)
        if vertical:
            if st[i, cv2.CC_STAT_WIDTH] > 7: continue
            x = int(np.median(xs)); roads.append({"kind": "paved", "px": [[x, int(ys.min())], [x, int(ys.max())]]})
        else:
            if st[i, cv2.CC_STAT_HEIGHT] > 7: continue
            y = int(np.median(ys)); roads.append({"kind": "paved", "px": [[int(xs.min()), y], [int(xs.max()), y]]})
# the section-road grid, read off the map and snapped to the strongest pale line within 5 px of where it was read
GRID_V = [(598, 0, 767), (686, 0, 767), (962, 18, 283), (412, 480, 767), (778, 0, 130), (1008, 0, 120)]
GRID_H = [(18, 686, 1030), (283, 548, 962), (480, 345, 686), (579, 270, 910), (678, 215, 686), (85, 596, 690)]
def snap(coord, a, b, vertical):
    best, bv = coord, -1e9
    for c in range(coord - 5, coord + 6):
        if vertical: v = ridge[a:b, c].mean() if 0 <= c < W else -1e9
        else: v = ridge[c, a:b].mean() if 0 <= c < H else -1e9
        if v > bv: best, bv = c, v
    return best
for x, a, b in GRID_V:
    x = snap(x, a, b, True); roads.append({"kind": "paved", "px": [[x, a], [x, b]]})
for y, a, b in GRID_H:
    y = snap(y, a, b, False); roads.append({"kind": "paved", "px": [[a, y], [b, y]]})
straight_mask = np.zeros_like(cand)
for r in roads:
    (x0, y0), (x1, y1) = r["px"]
    cv2.line(straight_mask, (x0, y0), (x1, y1), 1, 5)

# ---- curved and short lanes: what is left, thinned to a centre line and followed ----
rest = cand & (1 - straight_mask)
rest = cv2.morphologyEx(rest, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(rest, connectivity=8)
keep = np.zeros_like(rest)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= 40 and max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) >= 30:
        keep[lab == i] = 1
if hasattr(cv2, "ximgproc"):
    skel = cv2.ximgproc.thinning(keep * 255) > 0
else:
    skel = keep > 0
    # Zhang-Suen free fallback: erode-based skeleton
    el = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3)); sk = np.zeros_like(keep); t = keep.copy()
    while t.any():
        er = cv2.erode(t, el); op = cv2.dilate(er, el); sk |= (t - np.minimum(t, op)).astype(np.uint8); t = er
    skel = sk > 0
ys, xs = np.nonzero(skel)
pts = set(zip(xs.tolist(), ys.tolist()))
def nbrs(p):
    x, y = p
    return [(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and (x + dx, y + dy) in pts]
seen = set()
def follow(start):
    path, cur = [start], start
    seen.add(start)
    while True:
        nx = [q for q in nbrs(cur) if q not in seen]
        if not nx: break
        cur = nx[0]; seen.add(cur); path.append(cur)
    return path
ends = [p for p in pts if len(nbrs(p)) == 1]
for p in ends + sorted(pts):
    if p in seen: continue
    path = follow(p)
    if len(path) >= 40 and not (path[0][0] < 270 and path[0][1] > 440):
        # thin the path to every 4th pixel and simplify
        pl = np.array(path[::3] + [path[-1]], np.int32).reshape(-1, 1, 2)
        pl = cv2.approxPolyDP(pl, 1.4, False).reshape(-1, 2).tolist()
        if len(pl) >= 2:
            length = sum(np.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]) for i in range(len(pl) - 1))
            roads.append({"kind": "dirt" if length < 140 else "paved", "px": pl})

def world(p): return [round((p[0] - W / 2) * MPP, 1), round((p[1] - H / 2) * MPP, 1)]
out = {"roads": [{"kind": r["kind"], "xz": [world(p) for p in r["px"]]} for r in roads]}
json.dump(out, open(os.path.join(REG, "country_roads.json"), "w"), separators=(",", ":"))
print("roads", len(roads), "paved", sum(r["kind"] == "paved" for r in roads), "dirt", sum(r["kind"] == "dirt" for r in roads))
if len(sys.argv) > 1:
    dbg = img.copy()
    for r in roads:
        col = (0, 0, 255) if r["kind"] == "paved" else (0, 200, 255)
        cv2.polylines(dbg, [np.array(r["px"], np.int32).reshape(-1, 1, 2)], False, col, 1)
    cv2.imwrite(sys.argv[1], dbg)
