"""Civic audit: checks a generated map against the rule pack (rules.json) and writes region/civic_audit.json.

    IRONPORT_PKG=public/games/apex/ironport python games/apex/tools/civic/civic_audit.py

Checks today (utilities + siting): every power span stays dry and within the span limit; pylon clearance to buildings; buildings kept back from water; every substation is powered
(through pylon lines or underground cables). More rules go into rules.json plus a check here: the same numbers the generators use.
"""
import json, math, os, sys
import numpy as np, cv2
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import real_city as rc

REGION = os.path.join(rc.REPO, "public", "games", "apex", "region")
RULES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules.json")))
CELL = 4.0
W, H = rc.W_MAP * rc.MPP, rc.H_MAP * rc.MPP
NX, NZ = int(W / CELL), int(H / CELL)
X0, Z0 = -W / 2, -H / 2


def main():
    hm = json.load(open(os.path.join(REGION, "height2.json")))
    hi = np.fromfile(os.path.join(REGION, "height2.u16"), dtype="<u2").reshape(hm["h"], hm["w"]).astype(np.float32) * (hm["max"] - hm["min"]) / 65535.0 + hm["min"]
    water = cv2.resize(hi, (NX, NZ), interpolation=cv2.INTER_AREA) < 2.5
    cx = lambda x: min(max(int((x - X0) / CELL), 0), NX - 1)
    cz = lambda z: min(max(int((z - Z0) / CELL), 0), NZ - 1)
    wet = lambda x, z: bool(water[cz(z), cx(x)])
    city = json.load(open(os.path.join(REGION, "city.json")))["items"]
    U = json.load(open(os.path.join(REGION, "utilities.json")))
    pw = RULES["civil"]["utilities"]["power"]
    sev = RULES["severity"]
    out = {"pack": RULES["pack"], "checks": []}

    def rec(rule, severity, bad, total, examples):
        out["checks"].append({"rule": rule, "severity": severity, "violations": bad, "of": total, "examples": examples[:5]})
        print(("OK   " if not bad else "FAIL ") + f"[{severity}] {rule}: {bad}/{total}  {examples[:3] if bad else ''}")

    P = U["pylons"]
    # 1. spans stay dry and short enough
    wet_spans, long_spans = [], []
    for u, v in U["spans"]:
        a, b = P[u], P[v]
        L = math.hypot(b["x"] - a["x"], b["z"] - a["z"]); n = max(2, int(L / 6))
        if any(wet(a["x"] + (b["x"] - a["x"]) * k / n, a["z"] + (b["z"] - a["z"]) * k / n) for k in range(n + 1)): wet_spans.append([u, v])
        if L > pw["transmission_span_max_m"] * 1.05: long_spans.append([u, v, round(L)])
    rec("power.over_water_allowed=false", sev["over_water_allowed"], len(wet_spans), len(U["spans"]), wet_spans)
    rec("power.transmission_span_max_m", sev["span_length"], len(long_spans), len(U["spans"]), long_spans)

    # 2. clearance of pylons to buildings
    pts = np.array([[b["bx"], b["bz"]] for b in city]); rad = np.array([max(b["w"], b["d"]) * 0.5 for b in city])
    close = []
    for i, p in enumerate(P):
        d = np.hypot(pts[:, 0] - p["x"], pts[:, 1] - p["z"]) - rad
        j = int(np.argmin(d))
        if d[j] < pw["min_clearance_to_building_m"]: close.append([i, round(float(d[j]), 1)])
    rec("power.min_clearance_to_building_m", sev["clearance"], len(close), len(P), close)

    # 3. buildings kept back from water
    k = int(math.ceil(RULES["civil"]["min_building_to_water_m"] / CELL))
    wd = cv2.dilate(water.astype(np.uint8), np.ones((2 * k + 1, 2 * k + 1), np.uint8)) > 0
    inw = [i for i, b in enumerate(city) if b.get("kind") != "hero" and wd[cz(b["bz"]), cx(b["bx"])]]
    rec("civil.min_building_to_water_m", "warn", len(inw), len(city), inw)

    # 4. every substation is powered: reachable from the plant through pylon lines or underground cables
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b): parent[find(a)] = find(b)
    for u, v in U["spans"]: union(("p", u), ("p", v))
    for s in U["substations"]:
        for q in range(len(P)):                                                 # several lines can leave one substation
            if math.hypot(P[q]["x"] - s["x"], P[q]["z"] - s["z"]) < 40: union(("s", s["name"]), ("p", q))
    for c in U.get("cables", []):
        ta, tb = "cable terminal (" + c["from"] + ")", "cable terminal (" + c["to"] + ")"
        union(("s", ta), ("s", tb))
    if P:
        ip = min(range(len(P)), key=lambda q: math.hypot(P[q]["x"] - U["plant"]["switchyard"]["x"], P[q]["z"] - U["plant"]["switchyard"]["z"]))
        sw = U["plant"]["switchyard"]
        for q in range(len(P)):
            if math.hypot(P[q]["x"] - sw["x"], P[q]["z"] - sw["z"]) < 80: union(("s", "plant"), ("p", q))                                       # the plant's switchyard feeds the nearest line
    root = find(("s", "plant"))
    subs = [s["name"] for s in U["substations"] if not s["name"].startswith("cable terminal")]
    dead = [n for n in subs if find(("s", n)) != root]
    rec("civil.every_substation_powered", "error", len(dead), len(subs), dead)

    out["cables"] = U.get("cables", [])
    json.dump(out, open(os.path.join(REGION, "civic_audit.json"), "w"), indent=1)
    errs = sum(c["violations"] for c in out["checks"] if c["severity"] == "error")
    print("errors:", errs)
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
