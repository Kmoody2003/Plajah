"""
Scenic road designer: the festival's driving roads (docs/apex-elohim/chora-fest-design.md section 3), designed the way a highway engineer lays out a scenic route.

For each road in ROADS (control points picked on the contour map):
  plan      centripetal Catmull-Rom through the control points, resampled every 4 m
  profile   follows the ground with a grade limit (cut/fill limits), then crests and sags are rounded (vertical curves) and the limit enforced again
  banking   superelevation from curvature at the road's design speed (e = v^2 / (g R) shared with side friction), capped (6 % paved, 4 % gravel), eased in over 40 m
  checks    smallest curve radius, steepest grade, cut/fill extremes, water crossings, buildings closer than the road edge + 4 m

Writes region/scenic_roads.json  { roads: [{ name, surface, half, speed, xz, y, bank }] }  (bank in radians, + = right side low)
and docs/apex-elohim/scenic-roads.png (plan over contours, profile strips).
    python games/forth-horizon/tools/design_scenic_roads.py
"""
import json, math, os
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "forth-horizon", "region")
STEP = 4.0

# name, surface, half width, design speed (km/h), grade limit, max bank, control points (x, z); the first and last points sit on the roads they join
ROADS = [
    {"name": "Finger Lake Loop", "surface": "paved", "half": 3.6, "speed": 80, "grade": 0.07, "bank": 0.06,
     "cp": [(-24, -4600), (150, -5050), (400, -5550), (580, -6100), (680, -6700), (720, -7300), (780, -7800), (900, -8120), (1150, -8240),
            (1600, -8250), (1850, -8100), (1950, -7600), (2100, -7000), (2300, -6500), (2500, -6100), (2750, -5750), (3100, -5300), (3550, -4900), (3840, -4600)]},
    {"name": "Kettle Pass", "surface": "paved", "half": 3.6, "speed": 60, "grade": 0.08, "bank": 0.06,
     "cp": [(655, 2545), (650, 2700), (600, 2870), (610, 3050), (720, 3190), (880, 3250), (1000, 3140), (1040, 2985), (1130, 2850),
            (1225, 2735), (1320, 2795), (1405, 2715), (1505, 2780), (1600, 2930), (1690, 3140), (1810, 3295), (1975, 3410), (2140, 3380), (2280, 3265)]},
]


def catmull(cp, step):
    P = np.array(cp, float)
    P = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0; t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5; t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5; t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5
        n = max(2, int(np.linalg.norm(p2 - p1) / 1.0))
        for t in np.linspace(t1, t2, n, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(P[-2])
    D = np.array(out)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(D, axis=0), axis=1))])
    si = np.arange(0, s[-1], step); si = np.append(si, s[-1])
    return np.c_[np.interp(si, s, D[:, 0]), np.interp(si, s, D[:, 1])]


def main():
    hm = json.load(open(os.path.join(R, "height2.json"))); W, H, mpp = hm["w"], hm["h"], hm["mpp"]; OX, OZ = hm.get("ox", 0), hm.get("oz", 0)
    hi = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(H, W).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    def gnd(x, z):
        fx = min(W - 1.001, max(0, (x - OX) / mpp + W / 2)); fz = min(H - 1.001, max(0, (z - OZ) / mpp + H / 2)); i, j = int(fx), int(fz); u, v = fx - i, fz - j
        return float(hi[j, i] * (1 - u) * (1 - v) + hi[j, i + 1] * u * (1 - v) + hi[j + 1, i] * (1 - u) * v + hi[j + 1, i + 1] * u * v)
    items = json.load(open(os.path.join(R, "city.json")))["items"]
    B = np.array([[it["bx"], it["bz"], 0.5 * min(it["w"], it["d"])] for it in items])
    out = []
    report = []
    for rd in ROADS:
        xz = catmull(rd["cp"], STEP); n = len(xz)
        g = np.array([gnd(x, z) for x, z in xz])
        wet = g < 0.3
        # over water the road is a bridge: the ground there does not count, the profile spans bank to bank at least 4 m above the water
        g = g.copy()
        for i in np.where(wet)[0]:
            a = i
            while a >= 0 and wet[a]: a -= 1
            b = i
            while b < n and wet[b]: b += 1
            ga = g[a] if a >= 0 else 4.0; gb = g[b] if b < n else 4.0
            g[i] = max(4.0, ga + (gb - ga) * (i - a) / max(1, b - a))
        gs = gaussian_filter1d(g, 3)
        s = rd["grade"] * STEP
        # profile: highest line at or under the ground, lowest line no more than 7 m under it; ends pinned to the roads they join
        hiL = gs.copy(); hiL[0] = g[0]; hiL[-1] = g[-1]
        for i in range(1, n): hiL[i] = min(hiL[i], hiL[i - 1] + s)
        for i in range(n - 2, -1, -1): hiL[i] = min(hiL[i], hiL[i + 1] + s)
        lo = gs - 7.0; lo[0] = g[0]; lo[-1] = g[-1]
        for i in range(1, n): lo[i] = max(lo[i], lo[i - 1] - s)
        for i in range(n - 2, -1, -1): lo[i] = max(lo[i], lo[i + 1] - s)
        y = np.maximum(hiL, lo)
        # vertical curves: round the crests and sags over ~60 m, then hold the grade limit again
        for _ in range(3):
            y = gaussian_filter1d(y, 7); y[0] = g[0]; y[-1] = g[-1]
            for i in range(1, n): y[i] = min(max(y[i], y[i - 1] - s), y[i - 1] + s)
            for i in range(n - 2, -1, -1): y[i] = min(max(y[i], y[i + 1] - s), y[i + 1] + s)
        # curvature and banking
        d1 = np.gradient(xz, axis=0) / STEP; d2 = np.gradient(d1, axis=0) / STEP
        k = (d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.maximum(1e-6, (d1 ** 2).sum(1) ** 1.5)
        k = gaussian_filter1d(k, 3)
        v = rd["speed"] / 3.6
        e = np.clip(0.5 * v * v * k / 9.81, -rd["bank"], rd["bank"])               # half the lateral demand carried by superelevation
        e = gaussian_filter1d(e, 10 / 1.0); e[:5] *= np.linspace(0, 1, 5); e[-5:] *= np.linspace(1, 0, 5)
        bank = np.arctan(e)
        # checks
        Rmin = float(1 / max(1e-6, np.abs(k[3:-3]).max()))
        grade = np.abs(np.diff(y)) / STEP
        cutfill = y - g
        near = []
        for x, z in xz[::3]:
            dd = np.hypot(B[:, 0] - x, B[:, 1] - z) - B[:, 2]
            j = int(np.argmin(dd))
            if dd[j] < rd["half"] + 4: near.append(j)
        L = float(np.sum(np.linalg.norm(np.diff(xz, axis=0), axis=1)))
        report.append({"name": rd["name"], "km": round(L / 1000, 2), "minRadius_m": round(Rmin), "maxGrade_pct": round(float(grade.max()) * 100, 1),
                       "maxCut_m": round(float(-cutfill.min()), 1), "maxFill_m": round(float(cutfill.max()), 1), "water_m": int(wet.sum() * STEP),
                       "buildingsInWay": sorted(set(near)), "maxBank_deg": round(float(np.degrees(np.abs(bank).max())), 1),
                       "climb_m": round(float(y.max() - y.min()), 1)})
        out.append({"name": rd["name"], "surface": rd["surface"], "half": rd["half"], "speed": rd["speed"],
                    "xz": [[round(float(a), 2), round(float(b), 2)] for a, b in xz], "y": [round(float(a), 2) for a in y], "bank": [round(float(a), 4) for a in bank]})
        draw(rd, xz, y, g, bank, hi, W, H, mpp, OX, OZ)
    json.dump({"roads": out}, open(os.path.join(R, "scenic_roads.json"), "w"), separators=(",", ":"))
    for r in report: print(json.dumps(r))


def draw(rd, xz, y, g, bank, hi, W, H, mpp, OX, OZ):
    pad = 250
    X0, X1 = xz[:, 0].min() - pad, xz[:, 0].max() + pad; Z0, Z1 = xz[:, 1].min() - pad, xz[:, 1].max() + pad
    i0, i1, j0, j1 = int((X0 - OX) / mpp + W / 2), int((X1 - OX) / mpp + W / 2), int((Z0 - OZ) / mpp + H / 2), int((Z1 - OZ) / mpp + H / 2)
    S = 3; sub = cv2.resize(hi[j0:j1, i0:i1], ((i1 - i0) * S, (j1 - j0) * S))
    t = np.clip(sub / 80, 0, 1); img = (np.dstack([0.3 + 0.3 * t, 0.5 + 0.35 * t, 0.3 + 0.5 * t]) * 255).astype(np.uint8); img[sub < 0.3] = (200, 120, 40)
    for lv in range(5, 160, 5):
        c, _ = cv2.findContours((sub >= lv).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE); cv2.drawContours(img, c, -1, (30, 60, 30) if lv % 25 else (0, 0, 0), 1)
    P = lambda x, z: (int((((x - OX) / mpp + W / 2) - i0) * S), int((((z - OZ) / mpp + H / 2) - j0) * S))
    for a, b, bk in zip(xz[:-1], xz[1:], bank[:-1]):
        c = (0, 0, 255) if bk > 0.02 else (255, 0, 0) if bk < -0.02 else (20, 20, 20)
        cv2.line(img, P(*a), P(*b), c, 4, cv2.LINE_AA)
    for x, z in rd["cp"]: cv2.circle(img, P(x, z), 5, (0, 255, 255), -1)
    # profile strip
    ph = 160; prof = np.full((ph, img.shape[1], 3), 245, np.uint8)
    lo, hi_ = min(g.min(), y.min()) - 2, max(g.max(), y.max()) + 2
    xs = np.linspace(0, img.shape[1] - 1, len(y)).astype(int); Y = lambda v: int(ph - 10 - (v - lo) / (hi_ - lo) * (ph - 20))
    for i in range(len(y) - 1):
        cv2.line(prof, (xs[i], Y(g[i])), (xs[i + 1], Y(g[i + 1])), (90, 140, 90), 1); cv2.line(prof, (xs[i], Y(y[i])), (xs[i + 1], Y(y[i + 1])), (0, 0, 0), 2)
    cv2.putText(prof, f"{rd['name']}: road (black) vs ground (green), {lo:.0f}-{hi_:.0f} m", (8, 18), 0, 0.5, (0, 0, 0), 1)
    cv2.imwrite(os.path.join(REPO, "docs", "apex-elohim", "scenic-" + rd["name"].lower().replace(" ", "-") + ".png"), np.vstack([img, prof]))


if __name__ == "__main__":
    main()
