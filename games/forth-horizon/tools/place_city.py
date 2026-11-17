"""
Apex Elohim city placement (v1).

Turns the downtown street lattice (fitted from the satellite tile) into building lots and
fills them with the Ironport hero + generic models by district rules.
Heights and footprints come from the models themselves (built from the roster docs).

Run: python games/forth-horizon/tools/place_city.py
Out: public/games/forth-horizon/region/city.json (+ city_debug.png next to it)
"""
import glob
import json
import math
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PKG = os.environ.get("IRONPORT_PKG", "D:/plajah game assets deign from promtps/racer/ironport-complete")   # any folder with models/{hero,generic}/*_lod0.gltf, e.g. public/games/forth-horizon/ironport
SRC = "D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22/Satellite_map_of_fictional_Michigan_728a143c.jpg"
OUT = os.path.join(REPO, "public", "games", "forth-horizon", "region")
rng = np.random.default_rng(2026)
SC = 4.0          # rot px per map px
RM = 12.0 / SC    # metres per rot px (3 m)
W_MAP, H_MAP = 1376, 768


def gltf_size(path):
    g = json.load(open(path, encoding="utf8"))
    mn = [1e9] * 3
    mx = [-1e9] * 3
    bn = [1e9] * 3     # body only: no detachable props (__) and no window panels (_fen_)
    bx = [-1e9] * 3

    def walk(ni, off):
        n = g["nodes"][ni]
        t = n.get("translation", [0, 0, 0])
        o = [off[i] + t[i] for i in range(3)]
        if "mesh" in n:
            name = n.get("name", "")
            is_body = "__" not in name and "_fen_" not in name
            for pr in g["meshes"][n["mesh"]]["primitives"]:
                a = g["accessors"][pr["attributes"]["POSITION"]]
                for i in range(3):
                    mn[i] = min(mn[i], a["min"][i] + o[i])
                    mx[i] = max(mx[i], a["max"][i] + o[i])
                    if is_body:
                        bn[i] = min(bn[i], a["min"][i] + o[i])
                        bx[i] = max(bx[i], a["max"][i] + o[i])
        for c in n.get("children", []):
            walk(c, o)

    for r in g["scenes"][0]["nodes"]:
        walk(r, [0, 0, 0])
    if bn[0] > bx[0]:
        bn, bx = mn, mx
    return {"w": bx[0] - bn[0], "d": bx[2] - bn[2], "h": mx[1] - mn[1], "cx": (bx[0] + bn[0]) / 2, "cz": (bx[2] + bn[2]) / 2,
            "fd": mx[2] - mn[2]}


def sizes(kind):
    out = {}
    for p in glob.glob(os.path.join(PKG, "models", kind, "*_lod0.gltf")):
        out[os.path.basename(p).rsplit("_lod0", 1)[0]] = gltf_size(p)
    return out


HERO = sizes("hero")
GEN = sizes("generic")

# hero anchors in the rotated street frame (4 px per map px; 1 px = 3 m). Circuit corners:
# T1 (78,409) hairpin, T2 (161,409), T3 (161,352), T4 (292,352), T5 (292,502), T6 (401,502), T7 (401,729)
ANCHOR = {
    "ironport-towers": (120, 350), "harborfront-expo": (130, 650), "founders-plaza": (112, 590),
    "marina-clubhouse": (52, 470), "riverfront-silos": (520, 740), "ferry-terminal": (110, 540),
    "the-guardian": (350, 690), "penobscot-tower": (250, 520), "kestrel-hq": (230, 440),
    "aurelia-hq": (260, 400), "meridian-hq": (210, 600), "halcyon-hq": (340, 600),
    "regent-theatre": (350, 430), "ironport-ballpark": (560, 330), "ironport-dome": (600, 480),
    "majestic-music-hall": (330, 300), "parthenon-casino": (450, 440), "opera-house": (300, 250),
    "market-hall-a": (540, 150), "market-hall-b": (620, 170), "museum-of-art": (230, 160),
    "central-library": (330, 150), "university-hall": (420, 150), "the-temple": (380, 230),
    "central-station": (170, 760), "ironworks-ruins": (560, 740), "foundry-tower": (360, 60),
    "ledger-tower": (240, 470), "old-cathedral": (470, 380), "railyard-roundhouse": (660, 620),
    "city-hall": (400, 580), "ironport-arena": (500, 230), "conservatory": (48, 440),
    "grand-theatre-garage": (230, 590), "woodward-row": (260, 110), "greenway-station": (690, 420),
}

CORE = ["midtown-office-tower", "brick-office-block", "modern-loft-office", "downtown-hotel", "parking-deck",
        "apartment-tower", "mixed-use-block", "civic-office-annex", "tech-campus", "corner-office"]
MID = ["mixed-use-block", "brick-office-block", "corner-office", "apartment-tower", "parking-deck", "townhouse-row",
       "civic-office-annex", "modern-loft-office", "coffee-shop", "neighborhood-pharmacy"]
EDGE = ["townhouse-row", "duplex", "mixed-use-block", "corner-grocery", "strip-mall", "neighborhood-diner",
        "gas-station", "auto-repair-shop", "barber-shop", "neighborhood-pharmacy", "parking-deck", "coffee-shop"]
DOWNTOWN = np.array([260.0, 470.0])


def main():
    lat = json.load(open(os.path.join(HERE, "data", "city_lattice.json")))
    circ = json.load(open(os.path.join(HERE, "data", "city_circuit_rot.json")))
    M = np.array(lat["M"])
    Minv = np.array(lat["Minv"])
    cols = sorted(lat["cols"])
    rows = sorted(lat["rows"])
    img = cv2.imread(SRC)
    HW, HH = 95, 100
    rot = cv2.warpAffine(img, M, (2 * HW * 4, 2 * HH * 4), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    hsv = cv2.cvtColor(rot, cv2.COLOR_BGR2HSV).astype(int)
    b, g, r = [rot[..., i].astype(int) for i in range(3)]
    water = (((b > r + 15) & (b >= g - 10) & (hsv[..., 2] < 200)) | ((hsv[..., 0] >= 80) & (hsv[..., 0] <= 125) & (hsv[..., 1] > 70)))
    green = (g > r + 8) & (g > b + 8) & (hsv[..., 1] > 60)
    RW, RH = rot.shape[1], rot.shape[0]

    loop = np.array(circ["loop_rot"], float)
    segs = [(loop[i], loop[(i + 1) % len(loop)]) for i in range(len(loop))]

    def seg_hits_rect(a, b, x0, y0, x1, y1):
        # sampled test is enough here (segments are axis aligned streets)
        for t in np.linspace(0, 1, 40):
            p = a + (b - a) * t
            if x0 < p[0] < x1 and y0 < p[1] < y1:
                return True
        return False

    # ---- blocks ----
    PAD = 5
    blocks = []
    for i in range(len(cols) - 1):
        for j in range(len(rows) - 1):
            x0, x1 = cols[i] + PAD, cols[i + 1] - PAD
            y0, y1 = rows[j] + PAD, rows[j + 1] - PAD
            if x1 - x0 < 12 or y1 - y0 < 12 or x1 > RW - 4 or y1 > RH - 4:
                continue
            sub = (slice(int(y0), int(y1)), slice(int(x0), int(x1)))
            wf = water[sub].mean()
            gf = green[sub].mean()
            blocks.append({"i": i, "j": j, "x0": x0, "x1": x1, "y0": y0, "y1": y1, "water": wf, "green": gf, "used": False})

    def valid(bk):
        # tower shadows in the core pass the colour test for water, so only trust it near the waterfront
        near_shore = bk["x0"] < 130
        return (bk["water"] < 0.12 or not near_shore) and bk["green"] < 0.5

    placed = []
    notes = {"heroes_placed": [], "heroes_skipped": []}

    def world_xy(px, py):
        v = Minv @ np.array([px, py, 1.0])
        return (float(v[0] - W_MAP / 2) * 12.0, float(v[1] - H_MAP / 2) * 12.0)

    def face_world(dx, dy):
        v = Minv[:, :2] @ np.array([dx, dy], float)
        n = np.linalg.norm(v)
        v = v / n
        return float(math.atan2(v[0], v[1]))  # rotation.y so that local +z points along v

    def emit(kind, slug, size, cx, cy, face):
        # face: facing direction in the rot frame: (0,1) means local +z along rot +y (width along rot x)
        phi = face_world(*face)
        x, z = world_xy(cx, cy)
        # local +x -> (cos phi, -sin phi), local +z (the front) -> (sin phi, cos phi)
        x -= size["cx"] * math.cos(phi) + size["cz"] * math.sin(phi)
        z -= -size["cx"] * math.sin(phi) + size["cz"] * math.cos(phi)
        placed.append({"kind": kind, "slug": slug, "x": round(x, 1), "z": round(z, 1), "rotY": round(phi, 4),
                       "w": round(size["w"], 1), "d": round(size["d"], 1), "h": round(size["h"], 1),
                       "rot": [round(cx, 1), round(cy, 1), list(face)]})

    # ---- heroes ----
    order = sorted(HERO, key=lambda s: -(HERO[s]["w"] * HERO[s]["d"]))  # big ones first
    for slug in order:
        s = HERO[slug]
        ax, ay = ANCHOR.get(slug, (300, 400))
        need_w, need_d = s["w"] / RM + 2, s["d"] / RM + 2          # rot px incl. margin
        best = None
        for bk in blocks:
            if bk["used"] or not valid(bk):
                continue
            # grow a rectangle of free blocks from bk until it covers the footprint (either orientation)
            for gi in range(1, 5):
                for gj in range(1, 5):
                    if bk["i"] + gi - 1 >= len(cols) - 1 or bk["j"] + gj - 1 >= len(rows) - 1:
                        continue
                    grp = [c for c in blocks if bk["i"] <= c["i"] < bk["i"] + gi and bk["j"] <= c["j"] < bk["j"] + gj]
                    if len(grp) != gi * gj or any(c["used"] or not valid(c) for c in grp):
                        continue
                    gx0, gx1 = min(c["x0"] for c in grp), max(c["x1"] for c in grp)
                    gy0, gy1 = min(c["y0"] for c in grp), max(c["y1"] for c in grp)
                    # merged rect spans the streets inside it: widen to include them
                    gw, gd = gx1 - gx0, gy1 - gy0
                    if any(seg_hits_rect(a, bb, gx0 + 2, gy0 + 2, gx1 - 2, gy1 - 2) for a, bb in segs):
                        continue
                    ok_a = gw >= need_w and gd >= need_d     # width along rot x
                    ok_b = gw >= need_d and gd >= need_w     # width along rot y
                    if not (ok_a or ok_b):
                        continue
                    cx, cy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
                    dist = math.hypot(cx - ax, cy - ay) + 8 * (gi * gj - 1)
                    if best is None or dist < best[0]:
                        best = (dist, grp, cx, cy, ok_a)
                    break
        if best is None:
            notes["heroes_skipped"].append(slug)
            continue
        _, grp, cx, cy, ok_a = best
        for c in grp:
            c["used"] = True
        # face the nearest circuit street if close, otherwise the downtown centre
        cand = []
        for a, bb in segs:
            ab = bb - a
            t = np.clip(np.dot(np.array([cx, cy]) - a, ab) / (np.dot(ab, ab) + 1e-9), 0, 1)
            cand.append(np.linalg.norm(a + ab * t - np.array([cx, cy])))
        near = min(cand)
        tgt = np.array([ax, ay]) if near > 60 else None
        if near <= 60:
            k = int(np.argmin(cand))
            a, bb = segs[k]
            ab = bb - a
            t = np.clip(np.dot(np.array([cx, cy]) - a, ab) / (np.dot(ab, ab) + 1e-9), 0, 1)
            tgt = a + ab * t
        else:
            tgt = DOWNTOWN
        dvec = tgt - np.array([cx, cy])
        if ok_a:      # width along rot x -> facing along rot y
            face = (0, 1 if dvec[1] >= 0 else -1)
        else:
            face = (1 if dvec[0] >= 0 else -1, 0)
        emit("hero", slug, s, cx, cy, face)
        notes["heroes_placed"].append(slug)

    # ---- generics: pack along each free block's long axis ----
    def pick(zone, fit_w, fit_d):
        pool = CORE if zone == "core" else MID if zone == "mid" else EDGE
        cands = []
        for slug in pool:
            if slug not in GEN:
                continue
            s = GEN[slug]
            if s["d"] <= fit_d and s["w"] <= fit_w:
                cands.append(slug)
        return cands

    for bk in blocks:
        if bk["used"] or not valid(bk):
            continue
        bw, bd = (bk["x1"] - bk["x0"]) * RM, (bk["y1"] - bk["y0"]) * RM   # metres
        cx0, cy0 = (bk["x0"] + bk["x1"]) / 2, (bk["y0"] + bk["y1"]) / 2
        dist = math.hypot(cx0 - DOWNTOWN[0], cy0 - DOWNTOWN[1])
        zone = "core" if dist < 190 else "mid" if dist < 360 else "edge"
        long_x = bw >= bd
        L, S_ = (bw, bd) if long_x else (bd, bw)
        pos = 0.0
        # fronts face the circuit street when the block is beside it, otherwise the downtown centre
        cp = np.array([cx0, cy0])
        best_pt, best_d = DOWNTOWN, 1e9
        for a_, b_ in segs:
            ab_ = b_ - a_
            t_ = np.clip(np.dot(cp - a_, ab_) / (np.dot(ab_, ab_) + 1e-9), 0, 1)
            q_ = a_ + ab_ * t_
            if np.linalg.norm(q_ - cp) < best_d:
                best_d, best_pt = np.linalg.norm(q_ - cp), q_
        tgt_ = best_pt if best_d < 45 else DOWNTOWN
        dv_ = tgt_ - cp
        row_face = (1 if dv_[1] >= 0 else -1) if long_x else (1 if dv_[0] >= 0 else -1)
        guard = 0
        while pos < L - 14 and guard < 8:
            guard += 1
            cands = pick(zone, L - pos - 2, S_ - 2)
            if not cands:
                break
            slug = cands[int(rng.integers(len(cands)))]
            s = GEN[slug]
            along = s["w"]
            # centre of this lot along the long axis
            c_along = pos + along / 2 + 1
            off = (c_along - L / 2) / RM
            if long_x:
                cx, cy, face = cx0 + off, cy0, (0, row_face)
            else:
                cx, cy, face = cx0, cy0 + off, (row_face, 0)
            emit("generic", slug, s, cx, cy, face)
            pos += along + 4

    os.makedirs(OUT, exist_ok=True)
    json.dump({"items": placed, "notes": notes}, open(os.path.join(OUT, "city.json"), "w"))
    print("placed", len(placed), "heroes", len(notes["heroes_placed"]), "skipped", notes["heroes_skipped"])

    # debug picture in the rotated frame
    dbg = rot.copy()
    for bk in blocks:
        c_ = (0, 160, 0) if valid(bk) else (0, 0, 255)
        cv2.rectangle(dbg, (int(bk["x0"]), int(bk["y0"])), (int(bk["x1"]), int(bk["y1"])), c_, 1)
    print("blocks", len(blocks), "valid", sum(valid(b_) for b_ in blocks), "used", sum(b_["used"] for b_ in blocks))
    for it in placed:
        cx, cy, face = it["rot"]
        along_x = face[1] != 0
        wpx = (it["w"] if along_x else it["d"]) / RM
        dpx = (it["d"] if along_x else it["w"]) / RM
        col = (0, 200, 255) if it["kind"] == "hero" else (255, 160, 60)
        cv2.rectangle(dbg, (int(cx - wpx / 2), int(cy - dpx / 2)), (int(cx + wpx / 2), int(cy + dpx / 2)), col, 2)
        if it["kind"] == "hero":
            cv2.putText(dbg, it["slug"][:14], (int(cx - wpx / 2), int(cy)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    cv2.imwrite(os.path.join(OUT, "city_debug.png"), dbg)


if __name__ == "__main__":
    main()
