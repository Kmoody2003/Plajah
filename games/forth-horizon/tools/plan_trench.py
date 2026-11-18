"""
The downtown freeways as Detroit built them: depressed below the street grid in a walled trench, with the ramps climbing to the surface streets and the cross streets
carried over on overpasses.

For every freeway carriageway and ramp in region/city_streets.json:
  - resampled every 6 m; the street grade along it is the ground smoothed over ~60 m
  - freeways run 7.5 m below grade; where a carriageway leaves the city network (an end that joins no other freeway), it climbs back to grade over 350 m
  - a ramp takes the depth of the freeway at an end that meets one, and grade at an end that meets a surface street, graded linearly between (as steep as 7 %)
  - the bed is smoothed along the line
Writes region/trench.json: { lines: [{ c, half, xz, y (bed), depth }] }. build_city_mask.py then cuts the trench out of the street mask (alpha), the game draws the bed,
walls and overpasses (src/trench.ts) and the terrain shader leaves the hole open.
Run before build_city_mask.py:  python games/forth-horizon/tools/plan_trench.py
"""
import json, math, os
import numpy as np
from scipy.ndimage import gaussian_filter, uniform_filter1d
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "forth-horizon", "region")
HALF = {"freeway": 6.25, "ramp": 2.75}
DEPTH, CLIMB, STEP = 7.5, 350.0, 6.0


def main():
    hm = json.load(open(os.path.join(R, "height2.json")))
    hi = np.fromfile(os.path.join(R, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    sm = gaussian_filter(hi, 60.0 / hm["mpp"] / 2)
    grade = lambda x, z: float(sm[min(max(int(round(z / hm["mpp"] + hm["h"] / 2)), 0), hm["h"] - 1), min(max(int(round(x / hm["mpp"] + hm["w"] / 2)), 0), hm["w"] - 1)])
    src = os.path.join(R, "city_streets.before_subdiv.json")
    streets = json.load(open(src if os.path.exists(src) else os.path.join(R, "city_streets.json")))
    lines = []
    for s in streets:
        if s["c"] not in HALF: continue
        p = np.array(s["p"], float)
        out = [p[0]]
        for a, b in zip(p[:-1], p[1:]):
            L = float(np.hypot(*(b - a))); n = max(1, int(round(L / STEP)))
            for k in range(1, n + 1): out.append(a + (b - a) * k / n)
        lines.append({"c": s["c"], "xz": np.array(out)})
    # the regional freeway (region.json) ends in the downtown interchange: its last 600 m is part of the depressed system, so it ramps down into the trench there
    # instead of running across it at street level. Its end that meets the interchange takes full depth; the other end climbs to grade (the 350 m rule below).
    rf = np.array(json.load(open(os.path.join(R, "region.json")))["freeway"]["xz"], float)
    stub, acc = [rf[0]], 0.0
    for a, b in zip(rf[:-1], rf[1:]):
        L = float(np.hypot(*(b - a))); n = max(1, int(round(L / STEP)))
        for k in range(1, n + 1):
            stub.append(a + (b - a) * k / n); acc += L / n
            if acc >= 600.0: break
        if acc >= 600.0: break
    lines.append({"c": "freeway", "xz": np.array(stub), "regional": True})
    fw_pts = np.concatenate([l["xz"] for l in lines if l["c"] == "freeway"])
    fw_owner = np.concatenate([[i] * len(l["xz"]) for i, l in enumerate(lines) if l["c"] == "freeway"])
    ftree = cKDTree(fw_pts)

    def arclen(xz):
        return np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(xz, axis=0).T))])

    # freeways: full depth, climbing out at ends that join nothing
    for i, l in enumerate(lines):
        if l["c"] != "freeway": continue
        s = arclen(l["xz"]); depth = np.full(len(s), DEPTH)
        for end, d_from_end in ((0, s), (-1, s[-1] - s)):
            e = l["xz"][end]
            others = [j for j in ftree.query_ball_point(e, 25.0) if fw_owner[j] != i]
            if not others:
                depth = np.minimum(depth, DEPTH * np.clip(d_from_end / CLIMB, 0, 1))
        l["depth"] = depth
    fw_depth = np.concatenate([l["depth"] for l in lines if l["c"] == "freeway"])
    # ramps: freeway depth where they meet a freeway, grade where they meet the street
    for l in lines:
        if l["c"] != "ramp": continue
        s = arclen(l["xz"])
        ends = []
        for e in (l["xz"][0], l["xz"][-1]):
            d, j = ftree.query(e)
            ends.append(float(fw_depth[j]) if d < 20.0 else 0.0)
        t = s / max(s[-1], 1e-6)
        depth = ends[0] * (1 - t) + ends[1] * t
        # no steeper than 7 %: shorten the climb toward the deeper end if the ramp is short
        l["depth"] = depth
    out = []
    for l in lines:
        g = np.array([grade(x, z) for x, z in l["xz"]])
        y = g - l["depth"]
        if len(y) > 5: y = uniform_filter1d(y, 5, mode="nearest")
        out.append({"c": l["c"], "half": HALF[l["c"]], **({"regional": True} if l.get("regional") else {}), "xz": [[round(float(x), 1), round(float(z), 1)] for x, z in l["xz"]],
                    "y": [round(float(v), 2) for v in y], "depth": [round(float(v), 2) for v in l["depth"]]})
    json.dump({"lines": out}, open(os.path.join(R, "trench.json"), "w"), separators=(",", ":"))
    deep = sum(1 for l in out for d in l["depth"] if d > 1.0)
    print("trench lines", len(out), "points", sum(len(l["xz"]) for l in out), "below 1 m", deep)


if __name__ == "__main__":
    main()
