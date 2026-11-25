"""
Scenic road designer: the festival's driving roads (docs/apex-elohim/chora-fest-design.md section 3), designed the way a highway engineer lays out a scenic route.

For each road in ROADS (control points picked on the contour map):
  plan      centripetal Catmull-Rom through the control points, resampled every 4 m
  profile   follows the ground with a grade limit (cut/fill limits), then crests and sags are rounded (vertical curves) and the limit enforced again
  banking   superelevation from curvature at the road's design speed (e = v^2 / (g R) shared with side friction), capped (6 % paved, 4 % gravel), eased in over 40 m
  checks    smallest curve radius, steepest grade, cut/fill extremes, water crossings, buildings closer than the road edge + 4 m

Writes region/scenic_roads.json  { roads: [{ name, surface, half, speed, xz, y, bank }] }  (bank in radians, + = right side low)
and docs/apex-elohim/scenic-roads.png (plan over contours, profile strips).
    python games/apex/tools/design_scenic_roads.py
"""
import json, math, os
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
R = os.path.join(REPO, "public", "games", "apex", "region")
STEP = 4.0

# name, surface, half width, design speed (km/h), grade limit, max bank, control points (x, z); the first and last points sit on the roads they join
ROADS = [
    # located with tools/route_pass.py (grade-limited search): giant forest -> valley between the two glaciated peaks -> saddle 431 m -> north shore,
    # where it meets the coast highway's end; with the highway it closes the Superior Range circuit
    {"name": "Glacier Pass", "surface": "paved", "half": 3.4, "speed": 50, "minR": 20.0, "grade": 0.09, "bank": 0.07, "cut": 20.0,
     "cp": [(-4850, -7872), (-5133, -8165), (-5361, -8629), (-5356, -8687), (-5283, -8816), (-5274, -8930), (-5202, -9014), (-5161, -9099), (-5160, -9243), (-5108, -9319), (-5052, -9339), (-4927, -9338), (-4831, -9304), (-4778, -9318), (-4618, -9451), (-4497, -9687), (-4463, -9727), (-4416, -9745), (-4312, -9746), (-4228, -9787), (-4187, -9831), (-4129, -9957), (-4070, -10015), (-3924, -10032), (-3481, -10219), (-3346, -10348), (-3184, -10432), (-3128, -10507), (-3065, -10655), (-3081, -10732), (-3154, -10787), (-3213, -10785), (-3149, -10674), (-3187, -10601), (-3288, -10569), (-3356, -10584), (-3432, -10667), (-3427, -10794), (-3493, -10933), (-3381, -10848), (-3329, -10874), (-3342, -11029), (-3269, -11111), (-3219, -11358), (-3056, -11592), (-3043, -11850), (-3076, -11908), (-3125, -11842), (-3265, -11779), (-3317, -11788), (-3387, -11824), (-3426, -11860), (-3439, -12000), (-3368, -12083), (-3460, -12089), (-3401, -12220), (-3376, -12331), (-3302, -12459), (-3280, -12555), (-3328, -12625), (-3414, -12644), (-3303, -12682), (-3392, -12845), (-3420, -13037), (-3484, -13106), (-3577, -13138), (-3677, -13141), (-3891, -13111), (-4007, -13050), (-3864, -13276), (-3688, -13221), (-3559, -13256), (-3433, -13189), (-3346, -13198), (-3269, -13188), (-3168, -13299), (-3095, -13361), (-3166, -13443), (-3228, -13521), (-3282, -13544), (-3333, -13537), (-3430, -13490), (-3532, -13483), (-3649, -13440), (-3732, -13446), (-3816, -13490), (-3908, -13584), (-4022, -13653), (-4170, -13664), (-4298, -13720), (-4415, -13752), (-4478, -13888), (-4530, -13916), (-4595, -13869), (-4653, -13628), (-4706, -13531), (-4764, -13481), (-4930, -13403), (-5083, -13442), (-5186, -13416), (-5329, -13402), (-5342, -13469), (-5203, -13567), (-5145, -13657), (-5148, -13712), (-5215, -13810), (-5170, -13873), (-5260, -13854), (-5285, -13736), (-5320, -13688), (-5379, -13651), (-5437, -13644), (-5505, -13684), (-5515, -13742), (-5387, -13814), (-5366, -13866), (-5407, -13931), (-5467, -13935), (-5566, -13812), (-5629, -13755), (-5644, -13684), (-5708, -13731), (-5732, -13857), (-5845, -13973), (-5902, -13928), (-5886, -13808), (-5967, -13767), (-6067, -13799), (-6094, -13842), (-6053, -13946), (-6059, -14054), (-6110, -14118), (-6183, -14133), (-6218, -14066), (-6154, -14050)]},
    {"name": "Superior Coast Highway", "surface": "paved", "half": 4.2, "speed": 90, "grade": 0.065, "bank": 0.06, "cut": 16.0, "endFrom": "Glacier Pass",
     "cp": [(624, -4488), (430, -4760), (-250, -5100), (-1150, -5480), (-2150, -5980), (-3150, -6580), (-4150, -7180), (-4850, -7880), (-5300, -8400),
            (-5700, -8800), (-6000, -9000), (-6150, -9200), (-6250, -9400), (-6360, -9600), (-6370, -9800), (-6410, -10000), (-6480, -10200), (-6560, -10420),
            (-6600, -10600), (-6620, -10800), (-6630, -11000), (-6660, -11200), (-6730, -11400), (-6730, -11600), (-6630, -11800), (-6510, -12000), (-6520, -12200),
            (-6520, -12400), (-6530, -12600), (-6530, -12800), (-6500, -13000), (-6380, -13200), (-6300, -13450), (-6280, -13700), (-6260, -13900), (-6150, -14050)]},
    # Mill Road used to run alongside the coast highway for its last ~80 m and end 2.5 m above it (a merge nobody pinned); it now turns north and meets the
    # highway in a square T (~80 deg), pinned to its line and height. Listed after the highway so it can join it.
    {"name": "Mill Road", "surface": "paved", "half": 3.4, "speed": 70, "grade": 0.08, "bank": 0.05, "endOn": "Superior Coast Highway",
     "cp": [(-1116, -4600), (-1220, -4880), (-1460, -5220), (-1700, -5520), (-1790, -5640), (-1795, -5710), (-1770, -5780)]},
    {"name": "Finger Lake Loop", "surface": "paved", "half": 3.6, "speed": 80, "grade": 0.07, "bank": 0.06,
     "cp": [(-24, -4600), (150, -5050), (400, -5550), (580, -6100), (680, -6700), (720, -7300), (780, -7800), (900, -8120), (1150, -8240),
            (1600, -8250), (1850, -8100), (1950, -7600), (2100, -7000), (2300, -6500), (2500, -6100), (2750, -5750), (3100, -5300), (3550, -4900), (3840, -4600)]},
    # Orchard Lane used to stop 47 m short of Finger Lake Loop; it now ends on it (a T pinned to its line and height). Listed after the loop.
    {"name": "Orchard Lane", "surface": "paved", "half": 3.4, "speed": 70, "grade": 0.08, "bank": 0.05, "endOn": "Finger Lake Loop",
     "cp": [(1068, -4600), (980, -4820), (820, -5020), (620, -5250), (430, -5500)]},
    {"name": "Kettle Pass", "surface": "paved", "half": 3.6, "speed": 60, "grade": 0.08, "bank": 0.06,
     # both ends used to stop in the grass (65 m and 53 m from dirt tracks): the pass now starts on the east-west country road at z 2340 (a square T)
     # and ends where the two town streets meet at (2450, 3343)
     "cp": [(655, 2340), (655, 2440), (655, 2545), (650, 2700), (600, 2870), (610, 3050), (720, 3190), (880, 3250), (1000, 3140), (1040, 2985), (1130, 2850),
            (1225, 2735), (1320, 2795), (1405, 2715), (1505, 2780), (1600, 2930), (1690, 3140), (1810, 3295), (1975, 3410), (2140, 3380), (2280, 3265), (2400, 3250), (2440, 3300), (2450, 3343)]},
    # Escarpment Road: Finger Lake Loop (west shore, above the lake head) -> foothills -> the Stair (a talus apron on the sheer face, grow_north.py):
    # six legs and five hairpins up its 25 % slope (each leg gains a little more than the slope under it, paying for the flat hairpins) -> the
    # crest -> switchbacks down the back slope -> a viaduct across the stream notch -> west along the back to Glacier Pass. Approach and back-slope
    # runs located with route_pass.py; the stack is laid by hand on the ramp's plane.
    {"name": "Escarpment Road", "surface": "paved", "half": 3.4, "speed": 50, "minR": 20.0, "grade": 0.09, "bank": 0.07, "cut": 12.0,
     "startOn": "Finger Lake Loop", "endOn": "Glacier Pass",
     "cp": [(826, -7979), (742, -8039), (647, -8077), (569, -8080), (447, -8057), (402, -8122), (401, -8296), (448, -8458), (560, -8540),
            (690, -8580), (940, -8630), (968, -8660), (940, -8690), (690, -8740), (662, -8770), (690, -8800), (940, -8850), (968, -8880), (940, -8910),
            (690, -8960), (662, -8990), (690, -9020), (940, -9070), (968, -9100), (940, -9130), (720, -9180),
            (519, -9224), (336, -9229), (278, -9256), (232, -9461), (255, -9631), (280, -9685), (329, -9717), (608, -9734), (720, -9642), (805, -9602), (871, -9609),
            (827, -9750), (756, -9835), (658, -9881), (532, -9883), (333, -9847),
            (-250, -9846), (-413, -9826), (-592, -9883), (-758, -9881), (-898, -9830), (-997, -9810), (-1124, -9841), (-1250, -9850), (-1376, -9876), (-1466, -9854),
            (-1596, -9799), (-1754, -9791), (-1861, -9739), (-1970, -9662), (-2036, -9652), (-2235, -9723), (-2446, -9700), (-2720, -9820), (-2879, -9789),
            (-2980, -9796), (-3081, -9842), (-3137, -9883), (-3168, -10014), (-3215, -10060), (-3330, -10070), (-3520, -10045), (-3700, -10000), (-3820, -9955), (-3858, -9990), (-3853, -10054)]},
    # Escarpment Crest Road: from the top of the Stair (a T on the Escarpment Road) east along the back of the crest, a high viaduct over the stream notch
    # above the finger lake head, down through the eastern notch (the escarpment's lowest gap, ~195 m) and across the foothills to the lake's east
    # shore (a T on Finger Lake Loop). With the loop's lake-head bridge and the Stair it closes the Escarpment Circuit. The crest is laid by hand,
    # the notch descent located with route_pass.py.
    {"name": "Escarpment Crest Road", "surface": "paved", "half": 3.4, "speed": 60, "minR": 22.0, "grade": 0.085, "bank": 0.07, "cut": 12.0,
     "startOn": "Escarpment Road", "endOn": "Finger Lake Loop",
     "cp": [(660, -9200), (650, -9290), (760, -9330), (1000, -9310), (1300, -9310), (1450, -9300), (1750, -9300), (2000, -9330), (2304, -9342), (2394, -9356),
            (2565, -9303), (2803, -9310), (2854, -9341), (2888, -9400), (2891, -9450), (2861, -9528), (2892, -9573), (2945, -9602), (3077, -9543), (3151, -9560),
            (3216, -9619), (3277, -9602), (3313, -9552), (3439, -9327), (3434, -9234), (3363, -9076), (3385, -9015), (3471, -9027), (3441, -8934), (3229, -8823),
            (3182, -8785), (3059, -8583), (2991, -8441), (2881, -8290), (2659, -8228), (2456, -8206), (2379, -8166), (2169, -8016), (2050, -7880), (1930, -7820)]},
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


def relax_radius(xz, min_r, iters=1500, m=4):
    """Open up any bend tighter than min_r: points where the curvature is too high are pulled toward their neighbours' midpoint (a local
    Laplacian relaxation that leaves the rest of the alignment alone), then resampled to STEP again."""
    P = xz.copy()
    for _ in range(iters):
        a, b, c = P[:-2 * m], P[m:-m], P[2 * m:]                                                # 3 points m samples apart (a 32 m chord)
        ab = np.linalg.norm(b - a, axis=1); bc = np.linalg.norm(c - b, axis=1); ac = np.linalg.norm(c - a, axis=1)
        cross = np.abs((b - a)[:, 0] * (c - a)[:, 1] - (b - a)[:, 1] * (c - a)[:, 0])
        k = 2 * cross / np.maximum(1e-6, ab * bc * ac)                                          # curvature of the circle through 3 points
        bad = gaussian_filter1d((k > 1.0 / min_r).astype(float), 2) > 0.01
        if not bad.any(): break
        P[m:-m][bad] += 0.2 * ((a + c) / 2 - b)[bad]
    # the relaxation works on a 32 m chord and can leave (or make) wiggles at the 4 m sample scale (a 3.7 m-radius kink on the crest road's viaduct);
    # a light pass over immediate neighbours irons them out and moves the alignment itself by centimetres; the ends stay where the junctions pin them
    for _ in range(25): P[1:-1] += 0.3 * ((P[:-2] + P[2:]) / 2 - P[1:-1])
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]); si = np.append(np.arange(0, s[-1], STEP), s[-1])
    return np.c_[np.interp(si, s, P[:, 0]), np.interp(si, s, P[:, 1])]


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
    done = {}
    def snap(other, p):                                                                         # nearest sample of an already designed road
        oxz, oy = done[other]; k = int(np.argmin(np.hypot(oxz[:, 0] - p[0], oxz[:, 1] - p[1]))); return k, oxz[k], oy[k]
    for rd in ROADS:
        cp = list(rd["cp"]); pin0 = pin1 = None
        if "startOn" in rd: _, p, pin0 = snap(rd["startOn"], cp[0]); cp[0] = (float(p[0]), float(p[1]))   # a T junction on another road's line
        if "endOn" in rd: _, p, pin1 = snap(rd["endOn"], cp[-1]); cp[-1] = (float(p[0]), float(p[1]))
        xz = catmull(cp, STEP)
        xz = relax_radius(xz, rd.get("minR", 30.0)); n = len(xz)
        g = np.array([gnd(x, z) for x, z in xz])
        wet = g < 0.3
        # over water the road is a bridge: the ground there does not count, the profile spans bank to bank at least 4 m above the water
        g = g.copy()
        span = wet.copy()                                                                      # a bridge spans rim to rim: extend 48 m past the water over the banks' walls
        for k in range(1, 13): span[:-k] |= wet[k:]; span[k:] |= wet[:-k]
        wet = span
        for i in np.where(wet)[0]:
            a = i
            while a >= 0 and wet[a]: a -= 1
            b = i
            while b < n and wet[b]: b += 1
            ga = g[a] if a >= 0 else 4.0; gb = g[b] if b < n else 4.0
            g[i] = max(4.0, ga + (gb - ga) * (i - a) / max(1, b - a))
        gs = gaussian_filter1d(g, 3)
        if "endFrom" in rd: g[-1] = done[rd["endFrom"]][1][-1]                                  # a junction: meet the other road at its height
        if pin0 is not None: g[0] = pin0
        if pin1 is not None: g[-1] = pin1
        # at-grade crossings: where this road crosses an already designed scenic road away from its own ends, it meets that road at its height
        pins = {}
        for oname, (oxz, oy) in done.items():
            if oname in (rd.get("startOn"), rd.get("endOn"), rd.get("endFrom")): continue
            dmin = np.full(n, 1e9); jmin = np.zeros(n, int)
            for i in range(6, n - 6):
                dd = np.hypot(oxz[:, 0] - xz[i, 0], oxz[:, 1] - xz[i, 1]); j = int(np.argmin(dd)); dmin[i] = dd[j]; jmin[i] = j
            i = 6
            while i < n - 6:
                if dmin[i] < 2.5:
                    a0 = i
                    while i < n - 6 and dmin[i] < 2.5: i += 1
                    c = a0 + int(np.argmin(dmin[a0:i])); pins[c] = float(oy[jmin[c]])
                    print(f"  {rd['name']}: crosses {oname} at {xz[c].round().tolist()}, pinned to {pins[c]:.2f} m (was ground {g[c]:.2f})")
                i += 1
        # T junctions: the joining road's samples inside the other road's footprint (its half-width + shoulder + 3 m) sit at that road's height, so
        # the mouth is flush (only the end sample used to be pinned: the crest road ran up to 1 m under Finger Lake Loop's deck for its last 10 m)
        halfs = {r["name"]: r["half"] for r in ROADS}
        for key, ends in (("startOn", range(0, min(n, 8))), ("endOn", range(max(0, n - 8), n)), ("endFrom", range(max(0, n - 8), n))):
            if key not in rd: continue
            oxz, oy = done[rd[key]]; reach = halfs[rd[key]] + 1.6 + 3.0
            for i in ends:
                dd = np.hypot(oxz[:, 0] - xz[i, 0], oxz[:, 1] - xz[i, 1]); j = int(np.argmin(dd))
                if dd[j] < reach: pins[i] = float(oy[j])
        pk = np.array(sorted(pins), int); pv = np.array([pins[k] for k in sorted(pins)])
        s = rd["grade"] * STEP
        # profile: highest line at or under the ground, lowest line no more than 7 m under it; ends pinned to the roads they join
        hiL = gs.copy(); hiL[0] = g[0]; hiL[-1] = g[-1]; hiL[pk] = pv
        for i in range(1, n): hiL[i] = min(hiL[i], hiL[i - 1] + s)
        for i in range(n - 2, -1, -1): hiL[i] = min(hiL[i], hiL[i + 1] + s)
        lo = gs - rd.get("cut", 7.0); lo[0] = g[0]; lo[-1] = g[-1]; lo[pk] = pv   # how deep the road may cut (a cliff road is cut into the rock)
        for i in range(1, n): lo[i] = max(lo[i], lo[i - 1] - s)
        for i in range(n - 2, -1, -1): lo[i] = max(lo[i], lo[i + 1] - s)
        y = np.maximum(hiL, lo)
        # vertical curves: round the crests and sags over ~60 m, then hold the grade limit again
        for _ in range(3):
            y = gaussian_filter1d(y, 7); y[0] = g[0]; y[-1] = g[-1]; y[pk] = pv
            fixed = np.zeros(n, bool); fixed[pk] = True
            for i in range(1, n - 1):
                if not fixed[i]: y[i] = min(max(y[i], y[i - 1] - s), y[i - 1] + s)       # the ends (and crossings) stay pinned to the roads they meet
            for i in range(n - 2, 0, -1):
                if not fixed[i]: y[i] = min(max(y[i], y[i + 1] - s), y[i + 1] + s)
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
        done[rd["name"]] = (xz, y)
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
