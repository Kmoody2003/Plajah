"""Clean the routed circuit (drop out-and-back spurs, round the corners) and write it into the region data."""
import json
import math
import os
import real_city as rc
import city_route as cr

WPS = [["ATWATER ST", "ORLEANS ST"], ["ATWATER ST", "BEAUBIEN ST"], ["E JEFFERSON AVE", "BEAUBIEN ST"], ["E JEFFERSON AVE", "WOODWARD AVE"],
       ["WOODWARD AVE", "E FORT ST"], ["MONROE ST", "BRUSH ST"], ["GRATIOT AVE", "BRUSH ST"], ["E JEFFERSON AVE", "ORLEANS ST"]]
# designed elevation (m above the lake) at each waypoint: low riverfront, scarp climb, crest at Campus Martius,
# long drop, the Gratiot dip, then a gentle run home. Grades stay under about 6%.
ELEV = [3.0, 4.0, 24.0, 30.0, 46.0, 20.0, 8.0, 4.0]



WP_NAMES = {1: ["RenCen Hairpin", "Riverwalk Esses"], 2: ["Beaubien Hook", "Jefferson Kink"], 3: ["Woodward Dive"],
            4: ["Campus Martius Chicane", "Guardian Bend"], 5: ["Theatre Hairpin", "Comerica Curve"],
            6: ["Ford Field Flyer", "Gratiot Dip", "Eastern Market Sweep"], 7: ["Lafayette Return", "Penobscot Pinch", "Riverfront Final"]}


def detect_corners(sm, wp_pts):
    n = len(sm)
    step = 3                                   # points either side (about 36 m)
    def head(a, b):
        return math.atan2(b[1] - a[1], b[0] - a[0])
    turns = []
    for i in range(step, n - step):
        d = head(sm[i], sm[i + step]) - head(sm[i - step], sm[i])
        d = (d + math.pi) % (2 * math.pi) - math.pi
        turns.append((i, d))
    peaks = []
    for i, d in turns:
        if abs(d) < 0.5:
            continue
        if any(abs(i - j) < 9 for j, _ in peaks):
            k = [m for m, (j, _) in enumerate(peaks) if abs(i - j) < 9][0]
            if abs(d) > abs(peaks[k][1]):
                peaks[k] = (i, d)
        else:
            peaks.append((i, d))
    peaks.sort()
    named = []
    used = {}
    for i, d in peaks:
        q = sm[i]
        k = min(range(len(wp_pts)), key=lambda j: (wp_pts[j][0] - q[0]) ** 2 + (wp_pts[j][1] - q[1]) ** 2)
        names = WP_NAMES.get(k, [])
        u = used.get(k, 0)
        used[k] = u + 1
        nm = names[u] if u < len(names) else "Corner"
        wx, wz = rc.canvas_to_world(*q)
        named.append({"i": i, "t": i / n, "name": nm, "turn": round(d, 2), "x": round(wx, 1), "z": round(wz, 1)})
    canon = ["RenCen Hairpin", "Riverwalk Esses", "Beaubien Hook", "Jefferson Kink", "Woodward Dive", "Campus Martius Chicane", "Guardian Bend",
             "Theatre Hairpin", "Comerica Curve", "Ford Field Flyer", "Gratiot Dip", "Eastern Market Sweep", "Lafayette Return", "Penobscot Pinch", "Riverfront Final"]
    if named:
        named[-1]["name"] = "Riverfront Final"
    left = [c for c in canon if c not in {n["name"] for n in named}]
    for n in named:
        if n["name"] == "Corner" and left:
            n["name"] = left.pop(0)
    return named



def drop_backtracks(path):
    keys = [cr.nid(p) for p in path]
    out_keys = []
    pos = {}
    for k in keys:
        if k in pos:                       # came back to a node already visited: cut the loop
            del out_keys[pos[k] + 1:]
            pos = {kk: i for i, kk in enumerate(out_keys)}
        else:
            pos[k] = len(out_keys)
            out_keys.append(k)
    return [cr.NODES[k] for k in out_keys]


def fillet(pts, r, n=6):
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        l1 = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        l2 = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        rr = min(r, l1 / 2.2, l2 / 2.2)
        if rr < 0.5:
            out.append(p1)
            continue
        a = (p1[0] + (p0[0] - p1[0]) / l1 * rr, p1[1] + (p0[1] - p1[1]) / l1 * rr)
        b = (p1[0] + (p2[0] - p1[0]) / l2 * rr, p1[1] + (p2[1] - p1[1]) / l2 * rr)
        for t in range(n + 1):
            u = t / n
            out.append(((1 - u) ** 2 * a[0] + 2 * (1 - u) * u * p1[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * p1[1] + u * u * b[1]))
    out.append(pts[-1])
    return out


def resample(pts, step):
    out = [pts[0]]
    carry = 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        if seg == 0:
            continue
        t = step - carry
        while t <= seg:
            out.append((a[0] + (b[0] - a[0]) * t / seg, a[1] + (b[1] - a[1]) * t / seg))
            t += step
        carry = seg - (t - step)
    out.append(pts[-1])
    return out


if __name__ == "__main__":
    path, total, legs = cr.build(WPS)
    if cr.nid(path[0]) == cr.nid(path[-1]):
        path = path[:-1]
    clean = drop_backtracks(path)
    # close the loop on the first node
    if clean[0] != clean[-1]:
        clean.append(clean[0])
    keys_t = []
    wp_nodes = [cr.intersection(a, b) for a, b in WPS]
    cum = [0.0]
    for a, b in zip(clean[:-1], clean[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    ck = [cr.nid(p) for p in clean]
    for k in wp_nodes:
        keys_t.append(cum[ck.index(k)] / cum[-1] if k in ck else None)
    keys_t = [t for t in keys_t]
    sm = fillet(clean, 5.0)              # 5 canvas px = 15 m corner radius
    sm = resample(sm, 2.0)               # about 6 m spacing
    length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(sm[:-1], sm[1:])) * rc.MPC
    world = [rc.canvas_to_world(*p) for p in sm]
    mappx = [(x / rc.MPP + rc.W_MAP / 2, z / rc.MPP + rc.H_MAP / 2) for x, z in world]
    print("clean length %.2f km, %d points" % (length / 1000, len(sm)))
    reg_p = os.path.join(rc.DOCS, "region-v3.json")
    reg = json.load(open(reg_p))
    reg["circuits"]["ironport_grand_circuit"]["map_px"] = mappx
    reg["circuits"]["ironport_grand_circuit"]["length_km"] = round(length / 1000, 2)
    reg["circuits"]["ironport_grand_circuit"]["elev_keys"] = [[t, e] for t, e in zip(keys_t, ELEV) if t is not None] + [[1.0, ELEV[0]]]
    reg["circuits"]["ironport_grand_circuit"]["source"] = "routed on real Detroit centrelines: " + " > ".join("/".join(w) for w in WPS)
    wp_pts = [cr.NODES[k] for k in wp_nodes]
    corners = detect_corners(sm, wp_pts)
    for n_, c_ in enumerate(corners):
        c_["n"] = n_ + 1
    reg["circuits"]["ironport_grand_circuit"]["corners"] = corners
    print("corners", len(corners), [(c_["n"], c_["name"]) for c_ in corners])
    json.dump(reg, open(reg_p, "w"))
    json.dump({"canvas": sm, "world": world, "length_m": length, "waypoints": WPS}, open(os.path.join(rc.DOCS, "city-circuit-real.json"), "w"))
