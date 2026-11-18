"""
Chora Fest on the map (docs/apex-elohim/chora-fest-design.md): the festival sites and the PR stunts, placed from the real road network instead of by hand.

  sites         the Main Site and the outposts: each snapped to open, dry, gentle ground next to a paved road near its design position
  speed traps   at the far end of the longest near-straight stretches of paved road (speed builds along the straight, the gate sits where it ends)
  speed zones   the fastest sweeping sections (gentle curvature over 600 m)
  drift zones   the twistiest stretches (highest summed curvature over 400 m) on paved roads
  danger signs  the sharpest convex crests on unpaved roads and scenic roads (vertical curvature), facing the travel direction
Every stunt gets a name from the place it is in.
Writes region/festival.json.  Run after the roads exist (design_scenic_roads.py, grow_north.py).
    python games/forth-horizon/tools/plan_festival.py
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..", "..", "public", "games", "forth-horizon", "region")

SITES = [
    {"id": "main", "name": "Halcyon Shores", "kind": "main", "want": (-6650, 2950), "stage": "Main Stage on the water"},
    {"id": "dune", "name": "Dune Sea", "kind": "outpost", "want": (-5300, -600), "stage": "Sand-bowl stage"},
    {"id": "kettle", "name": "Kettle Hills", "kind": "outpost", "want": (1300, 3000), "stage": "Lakeside amphitheatre"},
    {"id": "pinewood", "name": "Pinewood", "kind": "outpost", "want": (-2100, -2900), "stage": "Clearing stage in the pines"},
    {"id": "otter", "name": "Otter Creek", "kind": "outpost", "want": (-1450, 1400), "stage": "Barn stage"},
    {"id": "ironport", "name": "Ironport Nights", "kind": "outpost", "want": (3900, 2600), "stage": "Under-bridge warehouse stage"},
    {"id": "wine", "name": "Wine Country", "kind": "outpost", "want": (300, -6200), "stage": "Vineyard terrace stage among the tulips"},
    {"id": "superior", "name": "Superior Range", "kind": "outpost", "want": (-5200, -8600), "stage": "Giant-forest clearing stage below the range"},
]
PLACES = [("Halcyon", -6600, 3000), ("Dune Sea", -5200, -400), ("Kettle Hills", 800, 3300), ("Pinewood", -1800, -2600), ("Otter Creek", -1450, 1400),
          ("Ironport", 4800, 2000), ("Southgate", 3300, 2100), ("Lakeshore", -6200, 1200), ("Finger Lake", 1500, -6800), ("Tulip Flats", -300, -5900),
          ("Escarpment", 1500, -9000), ("Giant Forest", -5000, -8200), ("Superior Coast", -6500, -11500), ("Farmland", 600, -1800), ("Harbor", 3800, -1300)]


def place_name(x, z):
    return min(PLACES, key=lambda p: math.hypot(p[1] - x, p[2] - z))[0]


def main():
    hm = json.load(open(os.path.join(R, "height2.json"))); W, H, mpp = hm["w"], hm["h"], hm["mpp"]; ox, oz = hm.get("ox", 0), hm.get("oz", 0)
    h = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(H, W).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    hat = lambda x, z: float(h[min(H - 1, max(0, int((z - oz) / mpp + H / 2))), min(W - 1, max(0, int((x - ox) / mpp + W / 2)))])
    roads = []                                                                                 # (name, kind, points)
    reg = json.load(open(os.path.join(R, "region.json")))
    roads.append(("Coastal Highway", "paved", reg["coastal_highway"]["xz"])); roads.append(("Freeway", "freeway", reg["freeway"]["xz"]))
    for f in ("country_roads.json", "user_streets.json"):
        p = os.path.join(R, f)
        if os.path.exists(p):
            for r in json.load(open(p))["roads"]:
                if r.get("driveway") or r.get("trail"): continue
                roads.append((None, r["kind"], r["xz"]))
    sc = json.load(open(os.path.join(R, "scenic_roads.json")))["roads"] if os.path.exists(os.path.join(R, "scenic_roads.json")) else []
    for r in sc: roads.append((r["name"], "scenic", r["xz"]))

    def resample(pts, step=10.0):
        out = [np.array(pts[0], float)]
        for a, b in zip(pts[:-1], pts[1:]):
            a = np.array(a, float); b = np.array(b, float); L = np.linalg.norm(b - a); n = max(1, int(L / step))
            for k in range(1, n + 1): out.append(a + (b - a) * k / n)
        return np.array(out)

    traps, zones, drifts, jumps = [], [], [], []
    for name, kind, pts in roads:
        if len(pts) < 2: continue
        P = resample(pts)
        if len(P) < 60: continue
        hd = np.unwrap(np.arctan2(np.diff(P[:, 1]), np.diff(P[:, 0])))
        turn = np.abs(np.diff(hd))                                                             # radians turned per 10 m sample
        y = np.array([hat(*p) for p in P])
        paved = kind in ("paved", "freeway", "scenic")
        # straights: windows of 600 m with tiny total turning
        if paved:
            for i in range(0, len(turn) - 60, 15):
                if turn[i:i + 60].sum() < 0.12 and np.all(y[i:i + 61] > 0.5):
                    traps.append({"score": 600 - turn[i:i + 60].sum() * 300, "pos": P[i + 60].tolist(), "dir": (P[i + 60] - P[i + 50]).tolist(), "road": name or kind})
            for i in range(0, len(turn) - 60, 20):
                s = turn[i:i + 60].sum()
                if 0.5 < s < 1.8: zones.append({"score": s, "a": P[i].tolist(), "b": P[i + 60].tolist(), "road": name or kind})
            for i in range(0, len(turn) - 40, 10):
                s = turn[i:i + 40].sum()
                if s > 2.2: drifts.append({"score": s, "a": P[i].tolist(), "b": P[i + 40].tolist(), "road": name or kind})
        # crests: convex vertical curvature on unpaved and scenic roads
        if kind in ("dirt", "scenic"):
            ys = np.convolve(y, np.ones(5) / 5, mode="same")
            vc = ys[:-2] - 2 * ys[1:-1] + ys[2:]                                                  # < 0 at a crest
            for i in range(5, len(vc) - 5):
                if vc[i] < -0.35 and vc[i] == vc[i - 5:i + 6].min():
                    jumps.append({"score": -vc[i], "pos": P[i + 1].tolist(), "dir": (P[i + 2] - P[i]).tolist(), "road": name or kind})

    def pick(lst, n, key, sep):
        out = []
        for c in sorted(lst, key=lambda c: -c["score"]):
            p = c.get("pos") or c["a"]
            if all(math.hypot(p[0] - (o.get("pos") or o["a"])[0], p[1] - (o.get("pos") or o["a"])[1]) > sep for o in out): out.append(c)
            if len(out) >= n: break
        return out
    traps = pick(traps, 10, "score", 1500); zones = pick(zones, 8, "score", 2000); drifts = pick(drifts, 8, "score", 1500); jumps = pick(jumps, 8, "score", 1200)

    # sites: nearest gentle, dry spot within 600 m of the design position that is 25-120 m from a paved road
    road_pts = np.vstack([resample(p, 15) for n, k, p in roads if k in ("paved", "scenic", "freeway", "dirt")])
    sites = []
    for s in SITES:
        wx, wz = s["want"]; best = None
        for r in range(0, 1600, 40):
            for a in np.linspace(0, 2 * math.pi, max(1, int(r / 15)) + 1, endpoint=False):
                x, z = wx + r * math.cos(a), wz + r * math.sin(a)
                hh = hat(x, z)
                if hh < 1.5: continue
                sl = max(abs(hat(x + 20, z) - hat(x - 20, z)), abs(hat(x, z + 20) - hat(x, z - 20))) / 40
                if sl > 0.06: continue
                d = np.min(np.hypot(road_pts[:, 0] - x, road_pts[:, 1] - z))
                if 25 <= d <= 220: best = (x, z); break
            if best: break
        if best: sites.append({**{k: v for k, v in s.items() if k != "want"}, "x": round(best[0], 1), "z": round(best[1], 1), "y": round(hat(*best), 1)})
        else:                                                                                   # steep everywhere (the dunes): nearest dry ground, the game grades a pad for the stage
            for r in range(0, 1600, 40):
                pt = next(((wx + r * math.cos(a), wz + r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 24, endpoint=False) if hat(wx + r * math.cos(a), wz + r * math.sin(a)) > 2), None)
                if pt: sites.append({**{k: v for k, v in s.items() if k != "want"}, "x": round(pt[0], 1), "z": round(pt[1], 1), "y": round(hat(*pt), 1), "pad": True}); break

    used = {}
    def named(c, kind):
        p = c.get("pos") or c["a"]
        base = place_name(*p); pl = next(q for q in PLACES if q[0] == base)
        if (base, kind) not in used: used[(base, kind)] = 1; return base
        dx, dz = p[0] - pl[1], p[1] - pl[2]
        comp = ("East" if dx > 0 else "West") if abs(dx) > abs(dz) else ("South" if dz > 0 else "North")
        k = (base, comp, kind); used[k] = used.get(k, 0) + 1
        return f"{base} {comp}" if used[k] == 1 else f"{base} {comp} {used[k]}"
    out = {
        "sites": sites,
        "speedTraps": [{"id": f"trap_{i}", "name": f"{named(c, 't')} Speed Trap", "x": round(c["pos"][0], 1), "z": round(c["pos"][1], 1), "dir": [round(v, 3) for v in c["dir"]], "road": c["road"], "targetMph": 120 + 10 * (i % 4)} for i, c in enumerate(traps)],
        "speedZones": [{"id": f"zone_{i}", "name": f"{named(c, 'z')} Speed Zone", "a": [round(v, 1) for v in c["a"]], "b": [round(v, 1) for v in c["b"]], "road": c["road"], "targetMph": 85 + 5 * (i % 4)} for i, c in enumerate(zones)],
        "driftZones": [{"id": f"drift_{i}", "name": f"{named(c, 'd')} Drift Zone", "a": [round(v, 1) for v in c["a"]], "b": [round(v, 1) for v in c["b"]], "road": c["road"], "targetScore": 10000 + 2000 * (i % 4)} for i, c in enumerate(drifts)],
        "dangerSigns": [{"id": f"jump_{i}", "name": f"{named(c, 'j')} Danger Sign", "x": round(c["pos"][0], 1), "z": round(c["pos"][1], 1), "dir": [round(v, 3) for v in c["dir"]], "road": c["road"], "targetM": 50 + 10 * (i % 4)} for i, c in enumerate(jumps)],
    }
    json.dump(out, open(os.path.join(R, "festival.json"), "w"), indent=1)
    print("sites", len(sites), "traps", len(out["speedTraps"]), "speed zones", len(out["speedZones"]), "drift", len(out["driftZones"]), "jumps", len(out["dangerSigns"]))
    for k in ("speedTraps", "driftZones", "dangerSigns"): print(k, [(c["name"], c["road"]) for c in out[k]])


if __name__ == "__main__":
    main()
