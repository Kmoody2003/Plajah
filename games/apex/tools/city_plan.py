"""
Ironport city plan (v1): a hand-authored street plan, informed by the satellite tile.

Frame "canvas": the satellite rotated 30.5 degrees so the downtown grid is axis aligned,
3 m per canvas px, river on the left. Everything is exported in metres in that frame
(u east/inland, v south) plus the transform back to the region (world metres).

What is inferred from the satellite: shoreline, harbor slips and piers (water mask),
parks and greenbelts (green mask), the rail corridor and yard, the freeway diagonal and
interchange, the street lattice pitch and phase (fitted on the downtown core), district
extents. What is authored: street classes and names, circuit, block use, harbor zones.

Run: python games/apex/tools/city_plan.py
"""
import json
import math
import os
import cv2
import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = "D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22/Satellite_map_of_fictional_Michigan_728a143c.jpg"
OUT = os.path.join(REPO, "public", "games", "apex", "region")
DOCS = os.path.join(REPO, "docs", "apex-elohim")
MPC = 3.0                      # metres per canvas px
W, H = 1200, 1560              # canvas size
OX, OY = 480, 780              # where map point (1195,455) lands in the canvas
CX, CY = 1195.0, 455.0
D = 1 / 0.6                    # display px (0.6 scale preview) -> canvas px


def dpt(x, y):
    return (x * D, y * D)


def build_canvas():
    img = cv2.imread(SRC)
    M = cv2.getRotationMatrix2D((CX, CY), 30.5, 4.0)
    M[0, 2] += OX - CX
    M[1, 2] += OY - CY
    rot = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    return img, M, rot


def masks(rot):
    hsv = cv2.cvtColor(rot, cv2.COLOR_BGR2HSV).astype(int)
    b, g, r = [rot[..., i].astype(int) for i in range(3)]
    valid = rot.sum(2) > 0
    water = (((b > r + 15) & (b >= g - 10) & (hsv[..., 2] < 200)) | ((hsv[..., 0] >= 80) & (hsv[..., 0] <= 125) & (hsv[..., 1] > 70))).astype(np.uint8)
    water = cv2.morphologyEx(water, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(water, 8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        # the river/harbor is the big component on the left; tower shadows downtown are small blobs
        if st[i, cv2.CC_STAT_AREA] > 4000 and (st[i, cv2.CC_STAT_LEFT] <= 3 or st[i, cv2.CC_STAT_AREA] > 60000):
            keep[i] = True
    water = keep[lab].astype(np.uint8)
    water = cv2.morphologyEx(water, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    green = ((g > r + 8) & (g > b + 8) & (hsv[..., 1] > 60)).astype(np.uint8)
    green = cv2.morphologyEx(green, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return water, green, valid


def contours(mask, min_area, eps=2.0):
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cs:
        if cv2.contourArea(c) < min_area:
            continue
        a = cv2.approxPolyDP(c, eps, True)[:, 0, :]
        out.append(a.astype(float))
    return out


def poly_from_d(pts):
    return np.array([dpt(*p) for p in pts], np.float32)


def main():
    img, M, rot = build_canvas()
    water, green, valid = masks(rot)
    land = valid & (water == 0)

    # ---------- districts (authored from the satellite; display coords of the 0.6 preview) ----------
    Z = {
        "rail_yard": poly_from_d([(115, 0), (230, 0), (230, 235), (205, 330), (168, 330), (150, 240)]),
        "port": poly_from_d([(0, 0), (120, 0), (132, 300), (130, 400), (0, 400)]),
        "interchange": poly_from_d([(545, 560), (720, 520), (720, 800), (560, 770)]),
        "freeway_band": None,
    }
    # urban grid area: east of the shore/rail, west of the map edge cut, excluding the above
    urban = np.zeros((H, W), np.uint8)
    cv2.fillPoly(urban, [poly_from_d([(100, 232), (230, 232), (230, 110), (400, 100), (560, 215), (720, 300), (720, 936), (100, 936)]).astype(np.int32)], 1)
    for k in ("rail_yard", "port", "interchange"):
        cv2.fillPoly(urban, [Z[k].astype(np.int32)], 0)
    urban &= land.astype(np.uint8)
    # keep a coast road gap: no grid within 8 px (24 m) of the water
    near_water = ndi.distance_transform_edt(1 - water) < 9
    urban[near_water] = 0

    freeway = [dpt(*p) for p in [(290, 0), (330, 80), (390, 200), (450, 300), (520, 430), (575, 560), (625, 660), (690, 770), (770, 900)]]
    freeway2 = [dpt(*p) for p in [(740, 585), (660, 625), (600, 700), (540, 780), (470, 880), (430, 936)]]
    band = np.zeros((H, W), np.uint8)
    for fw in (freeway, freeway2):
        cv2.polylines(band, [np.array(fw, np.int32)], False, 1, 24)
    urban[band > 0] = 0
    # ---------- street lattice ----------
    cols0 = [45, 78, 108, 134, 161, 191, 226, 255, 292, 317, 348, 373, 401, 426, 452, 479, 509]
    rows0 = [3, 28, 64, 92, 126, 184, 209, 242, 298, 352, 409, 448, 502, 563, 609, 666, 695, 729, 775]
    cols = [c + 100 for c in cols0]
    rows = [r + 380 for r in rows0]

    def extend(lst, pitch, lo, hi):
        lst = sorted(lst)
        while lst[0] - pitch > lo:
            lst.insert(0, lst[0] - pitch)
        while lst[-1] + pitch < hi:
            lst.append(lst[-1] + pitch)
        return lst
    cols = extend(cols, 29, 100, W - 20)
    rows = extend(rows, 38, 20, H - 20)

    # arterial classes
    jeff_col = cols[min(range(len(cols)), key=lambda i: abs(cols[i] - 205))]
    wood_row = rows[min(range(len(rows)), key=lambda i: abs(rows[i] - 1000))]
    art_cols = {jeff_col: "Jefferson Ave"}
    for k, nm in ((4, "Brush St"), (8, "Griswold St"), (12, "Cass Ave")):
        art_cols[cols[min(range(len(cols)), key=lambda i: abs(cols[i] - (jeff_col + k * 29)))]] = nm
    art_rows = {wood_row: "Woodward Ave"}
    for dv, nm in ((-114, "Fort St"), (-228, "Lafayette Blvd"), (190, "Gratiot Link"), (380, "Michigan Ave Link")):
        art_rows[rows[min(range(len(rows)), key=lambda i: abs(rows[i] - (wood_row + dv)))]] = nm

    def inside(x, y):
        xi, yi = int(round(x)), int(round(y))
        return 0 <= xi < W and 0 <= yi < H and urban[yi, xi] > 0

    streets = []
    # split each lattice line into runs where the line is inside the urban area
    for c in cols:
        run = []
        for y in range(0, H, 2):
            if inside(c, y):
                run.append((float(c), float(y)))
            else:
                if len(run) > 6:
                    streets.append({"name": art_cols.get(c, ""), "cls": "arterial" if c in art_cols else "street", "pts": [run[0], run[-1]]})
                run = []
        if len(run) > 6:
            streets.append({"name": art_cols.get(c, ""), "cls": "arterial" if c in art_cols else "street", "pts": [run[0], run[-1]]})
    for r in rows:
        run = []
        for x in range(0, W, 2):
            if inside(x, r):
                run.append((float(x), float(r)))
            else:
                if len(run) > 6:
                    streets.append({"name": art_rows.get(r, ""), "cls": "arterial" if r in art_rows else "street", "pts": [run[0], run[-1]]})
                run = []
        if len(run) > 6:
            streets.append({"name": art_rows.get(r, ""), "cls": "arterial" if r in art_rows else "street", "pts": [run[0], run[-1]]})

    # ---------- riverfront road (Atwater): offset contour of the shoreline ----------
    bank = cv2.morphologyEx(water, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (71, 71)))
    bank = cv2.GaussianBlur(bank.astype(np.float32), (0, 0), 14) > 0.5
    dist = ndi.distance_transform_edt(1 - bank.astype(np.uint8))
    shore = ((dist > 11.5) & (dist < 12.5) & (valid)).astype(np.uint8)
    cs, _ = cv2.findContours(shore, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    atw = []
    for c in cs:
        pts = c[:, 0, :].astype(float)
        if len(pts) < 120:
            continue
        # keep only the stretch beside the downtown grid (display y 400..740)
        sel = pts[(pts[:, 1] > 400 * D) & (pts[:, 1] < 740 * D) & (pts[:, 0] < 260)]
        if len(sel) > 60:
            order = np.argsort(sel[:, 1])
            sel = sel[order]
            atw.append(sel[::6])
    atwater = max(atw, key=len) if atw else np.zeros((0, 2))
    if len(atwater):
        sm = np.stack([ndi.gaussian_filter1d(atwater[:, 0], 3.0, mode="nearest"), atwater[:, 1]], 1)
        streets.append({"name": "Atwater St", "cls": "arterial", "pts": [tuple(p) for p in sm]})

    # ---------- freeway, ramps, rail ----------
    ramps = [{"c": dpt(600, 615), "r": 30 * D}, {"c": dpt(655, 660), "r": 26 * D}]
    rail = [dpt(*p) for p in [(165, 0), (178, 200), (186, 330), (194, 420), (205, 560), (215, 700), (240, 936)]]
    gratiot = [dpt(*p) for p in [(300, 232), (360, 240), (430, 330)]]

    # Campus Martius analog: plaza ring + three radial avenues (authored; the satellite shows a plain grid here)
    cm = dpt(470, 560)
    radials = []
    for nm, ang, ln in (("Michigan Ave", 215, 620), ("Gratiot Ave", 325, 780), ("Monroe St", 60, 360)):
        a = math.radians(ang)
        pts = [(cm[0] + math.cos(a) * t, cm[1] - math.sin(a) * t) for t in np.linspace(20, ln / 3.0 * 1.0 * 3, 14)]
        radials.append({"name": nm, "cls": "arterial", "pts": [tuple(p) for p in pts]})
    streets.extend(radials)
    # ---------- parks ----------
    parks = []
    for c in contours(green * (urban | (1 - (valid & True)) | 1), 900 / 1.0, 2.0):
        cx, cy = c.mean(0)
        if cx < 100 or cv2.contourArea(np.array(c, np.float32)) < 1500:
            continue
        parks.append(c.tolist())

    # ---------- harbor / water ----------
    water_polys = [c.tolist() for c in contours(water, 3000, 1.6)]

    # ---------- blocks ----------
    blocks = []
    half = {"arterial": 9.0, "street": 5.0}
    colset = sorted(cols)
    rowset = sorted(rows)
    for i in range(len(colset) - 1):
        for j in range(len(rowset) - 1):
            x0, x1 = colset[i], colset[i + 1]
            y0, y1 = rowset[j], rowset[j + 1]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if not inside(cx, cy) or not (inside(x0 + 4, cy) and inside(x1 - 4, cy) and inside(cx, y0 + 4) and inside(cx, y1 - 4)):
                continue
            hx0 = half["arterial" if x0 in art_cols else "street"]
            hx1 = half["arterial" if x1 in art_cols else "street"]
            hy0 = half["arterial" if y0 in art_rows else "street"]
            hy1 = half["arterial" if y1 in art_rows else "street"]
            bx0, bx1, by0, by1 = x0 + hx0, x1 - hx1, y0 + hy0, y1 - hy1
            if bx1 - bx0 < 8 or by1 - by0 < 8:
                continue
            gr = green[int(by0):int(by1), int(bx0):int(bx1)].mean()
            blocks.append({"rect": [bx0, by0, bx1, by1], "green": round(float(gr), 2)})

    plan = {
        "mpc": MPC, "W": W, "H": H,
        "M": M.tolist(), "Minv": cv2.invertAffineTransform(M).tolist(),
        "streets": streets,
        "cm": list(cm), "cm_r": 14.0,
        "freeway": [list(p) for p in freeway], "freeway2": [list(p) for p in freeway2],
        "ramps": [{"c": list(r["c"]), "r": r["r"]} for r in ramps],
        "rail": [list(p) for p in rail], "rail_yard": Z["rail_yard"].tolist(), "port": Z["port"].tolist(),
        "water": water_polys, "parks": parks, "blocks": blocks, "art_cols": {str(k): v for k, v in art_cols.items()}, "art_rows": {str(k): v for k, v in art_rows.items()},
        "cols": cols, "rows": rows,
    }
    os.makedirs(DOCS, exist_ok=True)
    json.dump(plan, open(os.path.join(DOCS, "city-plan.json"), "w"))
    print("streets", len(streets), "blocks", len(blocks), "parks", len(parks), "water polys", len(water_polys))
    cv2.imwrite(os.path.join(DOCS, "_canvas.png"), rot)


if __name__ == "__main__":
    main()
