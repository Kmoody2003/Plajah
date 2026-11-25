"""
A contour map of any part of the region for laying out roads by hand: shaded relief, contours every 10 m (bold every 50), water, existing roads,
buildings and a labelled 250 m grid. Honours the grid origin (height2.json ox/oz).
    python games/apex/tools/contour_map.py X0 X1 Z0 Z1 out.png [scale]
"""
import json, os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..", "..", "public", "games", "apex", "region")


def main():
    X0, X1, Z0, Z1 = map(float, sys.argv[1:5]); out = sys.argv[5]; S = float(sys.argv[6]) if len(sys.argv) > 6 else 1.5
    hm = json.load(open(os.path.join(R, "height2.json"))); W, H, mpp = hm["w"], hm["h"], hm["mpp"]; ox, oz = hm.get("ox", 0), hm.get("oz", 0)
    h = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(H, W).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    gi = lambda x: int((x - ox) / mpp + W / 2); gj = lambda z: int((z - oz) / mpp + H / 2)
    i0, i1, j0, j1 = max(0, gi(X0)), min(W, gi(X1)), max(0, gj(Z0)), min(H, gj(Z1))
    sub = cv2.GaussianBlur(h[j0:j1, i0:i1], (0, 0), 1.2)
    big = cv2.resize(sub, (int((i1 - i0) * S), int((j1 - j0) * S)), interpolation=cv2.INTER_LINEAR)
    gy, gx = np.gradient(big)
    t = np.clip(big / max(60.0, float(big.max())), 0, 1)
    img = np.dstack([0.32 + 0.3 * t, 0.48 + 0.32 * t, 0.3 + 0.45 * t]) * np.clip(0.75 + (gx - gy) * 0.35, 0.4, 1.2)[..., None]
    img = (np.clip(img, 0, 1) * 255).astype(np.uint8); img[big < 0.3] = (200, 120, 40)
    for lv in range(10, 800, 10):
        c, _ = cv2.findContours((big >= lv).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(img, c, -1, (0, 0, 0) if lv % 50 == 0 else (40, 70, 40), 1)
    P = lambda x, z: (int(((x - ox) / mpp + W / 2 - i0) * S), int(((z - oz) / mpp + H / 2 - j0) * S))
    def line(pts, col, w):
        for a, b in zip(pts[:-1], pts[1:]): cv2.line(img, P(*a), P(*b), col, w, cv2.LINE_AA)
    for f in ("country_roads.json", "user_streets.json", "farbank_streets.json"):
        p = os.path.join(R, f)
        if os.path.exists(p):
            for r in json.load(open(p)).get("roads", []): line(r["xz"], (40, 40, 40), 2)
    sp = os.path.join(R, "scenic_roads.json")
    if os.path.exists(sp):
        for r in json.load(open(sp))["roads"]: line(r["xz"], (0, 0, 255), 3)
    step = 250 if (X1 - X0) < 6000 else 500
    for x in range(int(X0 // step * step), int(X1) + 1, step):
        cv2.line(img, P(x, Z0), P(x, Z1), (255, 255, 255) if x % 1000 == 0 else (190, 190, 190), 1); cv2.putText(img, str(x), P(x + 6, Z0 + 40 / S * 6), 0, 0.45, (255, 255, 255), 1)
    for z in range(int(Z0 // step * step), int(Z1) + 1, step):
        cv2.line(img, P(X0, z), P(X1, z), (255, 255, 255) if z % 1000 == 0 else (190, 190, 190), 1); cv2.putText(img, str(z), P(X0 + 6, z - 6), 0, 0.45, (255, 255, 255), 1)
    cv2.imwrite(out, img); print(img.shape)


if __name__ == "__main__":
    main()
