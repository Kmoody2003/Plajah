"""
Mountain road locator: finds where a road can go between waypoints with a grade limit, the way a locating engineer walks a grade line.

Dijkstra on a coarse grid (CELL m, 16 move directions; grade and side slope judged per move). A move costs its length, plus:
  grade      steeper than the limit costs fast (squared), so the route lengthens itself into switchbacks instead
  cross      steep side-slope costs (benching a road into a cliff face is expensive and unsafe)
  water      only bridgeable narrow water; open water is forbidden
curvature is left to the smoothing here and the designer's radius check.
Prints control points (the found path smoothed and simplified) ready to paste into design_scenic_roads.py ROADS, and draws
docs/apex-elohim/route-<name>.png.
    python games/apex/tools/route_pass.py name grade "x,z x,z x,z ..." [cell_m] [fine 0|1]
"""
import json, math, os, sys
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter, zoom

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "apex", "region")


def main():
    name, grade = sys.argv[1], float(sys.argv[2])
    CELL = float(sys.argv[4]) if len(sys.argv) > 4 else 30.0                                # finer cells for a hairpin stack on a bluff
    wps = [tuple(map(float, p.split(","))) for p in sys.argv[3].split()]
    hm = json.load(open(os.path.join(R, "height2.json"))); W, H, mpp = hm["w"], hm["h"], hm["mpp"]; OX, OZ = hm.get("ox", 0), hm.get("oz", 0)
    h = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(H, W).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    pad = 900 if CELL >= 24 else 300
    X0 = min(p[0] for p in wps) - pad; X1 = max(p[0] for p in wps) + pad; Z0 = min(p[1] for p in wps) - pad; Z1 = max(p[1] for p in wps) + pad
    i0, i1 = max(0, int((X0 - OX) / mpp + W / 2)), min(W, int((X1 - OX) / mpp + W / 2)); j0, j1 = max(0, int((Z0 - OZ) / mpp + H / 2)), min(H, int((Z1 - OZ) / mpp + H / 2))
    sub = gaussian_filter(h[j0:j1, i0:i1], max(CELL, 30.0) / mpp * 0.5)            # the road sees the hill, not every boulder
    f = mpp / CELL; g = zoom(sub, f, order=1); gh, gw = g.shape
    wx = lambda c: OX + (i0 + c / f - W / 2) * mpp; wz = lambda r: OZ + (j0 + r / f - H / 2) * mpp
    cx = lambda x: int(round(((x - OX) / mpp + W / 2 - i0) * f)); rz = lambda z: int(round(((z - OZ) / mpp + H / 2 - j0) * f))
    gy, gx = np.gradient(g, CELL); slope = np.hypot(gx, gy)
    wet = g < 0.5
    # 16 headings sorted by angle; a node is (cell, heading arrived with). A step may turn at most MAXTURN headings, so the tightest
    # possible bend is about one cell of radius and every hairpin is a deliberate run of turns, each paid for.
    # FINE=1 (5th argument): 32 headings (3:1 and 3:2 moves too), so a road can traverse a steep slope at a shallow angle (a hairpin stack on
    # a ~25 % talus: across it 16 headings only offer flat or ~11 %)
    RD = 3 if len(sys.argv) > 5 and sys.argv[5] == "1" else 2
    dirs = sorted([(dx, dz) for dx in range(-RD, RD + 1) for dz in range(-RD, RD + 1) if (dx, dz) != (0, 0) and math.gcd(abs(dx), abs(dz)) == 1], key=lambda d: math.atan2(d[1], d[0]))
    MAXTURN = 2 if RD == 2 else 4                                                             # 45 deg per step: at 20 m cells no bend tighter than ~25 m radius
    ND = len(dirs); ang = [math.atan2(dz, dx) for dx, dz in dirs]
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import dijkstra
    RR, QQ = np.mgrid[0:gh, 0:gw]; cell = RR * gw + QQ; N = gh * gw
    src, dst, wgt = [], [], []
    for nd, (dx, dz) in enumerate(dirs):
        r2, q2 = RR + dz, QQ + dx; ok = (r2 >= 0) & (r2 < gh) & (q2 >= 0) & (q2 < gw)
        r0, c0, r2, q2 = RR[ok], QQ[ok], r2[ok], q2[ok]
        L = CELL * math.hypot(dx, dz); gr = np.abs(g[r2, q2] - g[r0, c0]) / L
        ux, uz = dx / math.hypot(dx, dz), dz / math.hypot(dx, dz)
        side = np.abs(-uz * gx[r2, q2] + ux * gy[r2, q2])
        base = L * (1 + 60 * np.maximum(0, gr - grade) ** 2 / grade ** 2 + 0.45 * (gr / grade) ** 2 + 40 * np.maximum(0, side - 0.35) ** 2 + 40 * wet[r2, q2])
        for d in range(ND):
            dd = (nd - d) % ND; dd = min(dd, ND - dd)
            if dd > MAXTURN: continue
            turn = abs((ang[nd] - ang[d] + math.pi) % (2 * math.pi) - math.pi)
            src.append(cell[r0, c0] * ND + d); dst.append((r2 * gw + q2) * ND + nd); wgt.append(base + 70 * turn ** 2)
    G = csr_matrix((np.concatenate(wgt), (np.concatenate(src), np.concatenate(dst))), shape=(N * ND, N * ND))
    del src, dst, wgt
    path = []; arrive = None
    for (ax, az), (bx, bz) in zip(wps[:-1], wps[1:]):
        s0 = rz(az) * gw + cx(ax); t0 = rz(bz) * gw + cx(bx)
        if arrive is None:                                                                    # leave the start heading roughly toward the next waypoint
            want = math.atan2(bz - az, bx - ax)
            starts = [s0 * ND + d for d in range(ND) if abs((ang[d] - want + math.pi) % (2 * math.pi) - math.pi) < 1.2]
        else: starts = [arrive]                                                               # through a waypoint the road keeps its heading
        D, pred = dijkstra(G, indices=starts, min_only=True, return_predecessors=True)[:2]
        k = t0 * ND + int(np.argmin(D[t0 * ND:(t0 + 1) * ND])); arrive = k; seg = []
        while k >= 0: seg.append(((k // ND) // gw, (k // ND) % gw)); k = pred[k]
        seg = seg[::-1]
        path += seg if not path else seg[1:]
    P = np.array([(wx(q), wz(r)) for r, q in path])
    # resample + smooth, then pick control points every SPACING m
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    si = np.arange(0, s[-1], 8.0); Q = np.c_[np.interp(si, s, P[:, 0]), np.interp(si, s, P[:, 1])]
    from scipy.ndimage import gaussian_filter1d
    Qs = np.c_[gaussian_filter1d(Q[:, 0], 5, mode="nearest"), gaussian_filter1d(Q[:, 1], 5, mode="nearest")]
    Qs[0] = Q[0]; Qs[-1] = Q[-1]
    # Douglas-Peucker: keep only the bends that matter (the grid's stair-steps go), then no two control points closer than 90 m
    simp = cv2.approxPolyDP(Qs.astype(np.float32).reshape(-1, 1, 2), CELL * 0.4, False).reshape(-1, 2)
    cp = [tuple(simp[0])]
    for p in simp[1:-1]:
        if math.hypot(p[0] - cp[-1][0], p[1] - cp[-1][1]) > 2.5 * CELL: cp.append(tuple(p))
    cp.append(tuple(simp[-1])); cp = [(int(round(float(x))), int(round(float(z)))) for x, z in cp]
    from scipy.ndimage import map_coordinates
    hh = [float(g[rz(z), cx(x)]) for x, z in Qs]
    print("length km", round(s[-1] / 1000, 2), "cp", len(cp), "top m", round(max(hh)), "at", [int(v) for v in Qs[int(np.argmax(hh))]])
    print(json.dumps(cp).replace("[", "(").replace("]", ")").replace("((", "[(").replace("))", ")]"))
    # picture
    S = 2; img = cv2.resize(np.clip(g / 650 * 255, 0, 255).astype(np.uint8), (gw * S, gh * S)); img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    for lv in range(0, 700, 25):
        cs, _ = cv2.findContours((cv2.resize(g, (gw * S, gh * S)) >= lv).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE); cv2.drawContours(img, cs, -1, (40, 90, 40) if lv % 100 else (0, 0, 0), 1)
    img[cv2.resize(wet.astype(np.uint8), (gw * S, gh * S)) > 0] = (200, 120, 40)
    pts = np.array([((x - wx(0)) / CELL * S, (z - wz(0)) / CELL * S) for x, z in Qs], np.int32)
    cv2.polylines(img, [pts], False, (0, 0, 255), 2, cv2.LINE_AA)
    for x, z in wps: cv2.circle(img, (int((x - wx(0)) / CELL * S), int((z - wz(0)) / CELL * S)), 6, (0, 255, 255), -1)
    cv2.imwrite(os.path.join(REPO, "docs", "apex-elohim", "route-" + name + ".png"), img)


if __name__ == "__main__":
    main()
