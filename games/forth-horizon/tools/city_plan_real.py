"""
City plan from real Detroit centrelines (Terra's street layer), rotated so the river is on the
west, in the same canvas frame as city_plan.py (3 m per canvas px).
Run: python games/forth-horizon/tools/city_plan_real.py
"""
import json, math, os
import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DOCS = os.path.join(REPO, "docs", "apex-elohim")
MPC = 3.0
LAT0, LON0 = 42.3314, -83.0466          # Campus Martius analog
ARTERIAL = ("WOODWARD", "JEFFERSON", "GRATIOT", "MICHIGAN AVE", "FORT ST", "GRAND RIVER", "ATWATER", "LAFAYETTE", "CASS AVE",
            "ROSA PARKS", "MARTIN LUTHER KING", "CAMPUS MARTIUS", "BEAUBIEN", "BRUSH", "RANDOLPH", "BAGLEY", "MONROE", "CHENE", "MACK AVE")
FWY = ("FWY", " I 75", " M 10", "FISHER", "LODGE")


def classify(name):
    n = (name or "").upper()
    if any(k in n for k in ("RAMP", "CONN", "TURNAROUND")):
        return "ramp"
    if any(k in n for k in FWY) and "SERVICE" not in n:
        return "freeway"
    if any(k in n for k in ARTERIAL):
        return "arterial"
    return "street"


def main():
    d = json.load(open(os.path.join(HERE, "data", "detroit_streets.json")))
    kx = math.cos(math.radians(LAT0)) * 111320.0
    ky = 110540.0
    segs = []
    for s in d["streets"]:
        pts = []
        for lon, lat in s["geometry"]["coordinates"]:
            e, n = (lon - LON0) * kx, (lat - LAT0) * ky
            pts.append((n, e))                     # u = north (inland), v = east (down the river)
        segs.append({"name": s.get("name") or "", "pts": pts})
    allu = np.array([p[0] for s in segs for p in s["pts"]])
    allv = np.array([p[1] for s in segs for p in s["pts"]])
    # first pass bank to measure the river's tilt, then rotate everything so the bank runs straight down the page
    b0 = np.arange(allv.min(), allv.max() + 60, 60)
    bu = []
    bv = []
    for i in range(len(b0) - 1):
        m = (allv >= b0[i]) & (allv < b0[i + 1])
        if m.any():
            bu.append(allu[m].min()); bv.append(b0[i] + 30)
    slope = np.polyfit(bv, bu, 1)[0]
    phi = math.atan(slope)
    c_, s_ = math.cos(phi), math.sin(phi)
    for sg in segs:
        sg["pts"] = [(u * c_ - v * s_, u * s_ + v * c_) for u, v in sg["pts"]]
    allu = np.array([p[0] for s in segs for p in s["pts"]])
    allv = np.array([p[1] for s in segs for p in s["pts"]])
    print("river tilt corrected by %.1f deg" % math.degrees(phi))
    # riverbank: south-most street per 40 m bin along the river, smoothed
    bins = np.arange(allv.min(), allv.max() + 40, 40)
    bank = []
    for i in range(len(bins) - 1):
        m = (allv >= bins[i]) & (allv < bins[i + 1])
        bank.append(allu[m].min() if m.any() else np.nan)
    bank = np.array(bank)
    idx = np.arange(len(bank))
    bank = np.interp(idx, idx[~np.isnan(bank)], bank[~np.isnan(bank)])
    bank = ndi.gaussian_filter1d(bank, 2.0, mode="nearest") - 25.0
    # canvas: shore at x=110 on average, CM row at y=940
    u0 = bank.mean() - 110 * MPC
    def cv(u, v):
        return ((u - u0) / MPC, (v - allv.min()) / MPC + 20.0)
    streets, freeways = [], []
    for s in segs:
        pts = [cv(u, v) for u, v in s["pts"]]
        cls = classify(s["name"])
        rec = {"name": s["name"].title() if cls in ("arterial", "freeway") else "", "cls": cls, "pts": pts}
        (freeways if cls == "freeway" else streets).append(rec)
    vc = bins[:-1] + 20
    water = [(0.0, cv(0, vc[0])[1])] + [cv(b, v) for b, v in zip(bank, vc)] + [(0.0, cv(0, vc[-1])[1])]
    water = [(0.0, water[0][1])] + water[1:-1] + [(0.0, water[-1][1])]
    land = [cv(b, v) for b, v in zip(bank, vc)] + [(1200.0, cv(0, vc[-1])[1]), (1200.0, cv(0, vc[0])[1])]
    plan = {"mpc": MPC, "W": 1200, "H": 1560, "streets": streets, "freeways": freeways, "water": [water], "land": land,
            "cm": list(cv(0 * c_ - 0 * s_, 0 * s_ + 0 * c_)), "xform": {"lat0": LAT0, "lon0": LON0, "phi": phi, "u0": float(u0), "vmin": float(allv.min())}, "u0": u0, "source": "Detroit_Street_Centerline via Terra"}
    json.dump(plan, open(os.path.join(DOCS, "city-plan-real.json"), "w"))
    print("streets", len(streets), "freeways", len(freeways), "canvas extent x", min(p[0] for s in streets for p in s["pts"]), max(p[0] for s in streets for p in s["pts"]),
          "y", min(p[1] for s in streets for p in s["pts"]), max(p[1] for s in streets for p in s["pts"]))


if __name__ == "__main__":
    main()
