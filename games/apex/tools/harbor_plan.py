"""
Harbor plan (v1): port geometry layout authored on the satellite's harbor (north docks, finger piers, downtown frontage).

Quay lines come from the real shoreline in the satellite water mask; terminals, sheds, tank farm, rail, ship berths
and the river bridge are authored on top. Everything is exported in region world metres for the viewer.
Run: python games/apex/tools/harbor_plan.py
"""
import json, math, os
import cv2
import numpy as np
import city_plan as cp
import real_city as rc

OUT = os.path.join(rc.REPO, "public", "games", "apex", "region")


def s2w(cx, cy):
    v = rc.MINV @ np.array([cx, cy, 1.0])
    return ((float(v[0]) - rc.W_MAP / 2) * rc.MPP, (float(v[1]) - rc.H_MAP / 2) * rc.MPP)


def main():
    img, M, rot = cp.build_canvas()
    water, green, valid = cp.masks(rot)
    water = cv2.morphologyEx(water, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(water, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    box = (4, 235, 105, 1095)       # x0, x1, y0, y1 in satellite-canvas px
    quays = []
    for c in cs:
        pts = c[:, 0, :].astype(float)
        run = []
        runs = []
        for p in pts:
            if box[0] < p[0] < box[1] and box[2] < p[1] < box[3]:
                run.append(p)
            else:
                if len(run) > 30:
                    runs.append(run)
                run = []
        if len(run) > 30:
            runs.append(run)
        for r in runs:
            a = np.array(r)
            k = 5
            sm = np.stack([np.convolve(np.pad(a[:, 0], k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), "valid"),
                           np.convolve(np.pad(a[:, 1], k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), "valid")], 1)
            sm = sm[::3]
            wl = [s2w(*p) for p in sm]
            quays.append({"pts": [[round(x, 1), round(z, 1)] for x, z in wl]})
    print("quay runs", len(quays), "points", sum(len(q["pts"]) for q in quays))

    def rect(cx, cy, w, h):
        return {"c": list(s2w(cx, cy)), "w": w * rc.MPC, "d": h * rc.MPC}

    ang = rc.MINV  # heading of canvas +x in world
    hx = rc.MINV[:, 0]
    heading = math.atan2(hx[1], hx[0])
    plan = {
        "heading": heading,       # world angle of the canvas +x axis (stack and shed alignment)
        "quays": quays,
        "terminals": [
            {"name": "CT1", **rect(100, 72, 108, 134)},
            {"name": "CT2", **rect(100, 424, 190, 44)},
        ],
        "sheds": [rect(86, 290, 128, 22), rect(125, 600, 60, 30), rect(165, 560, 40, 28), rect(62, 500, 50, 40)],
        "tanks": [list(s2w(x, y)) for x in (30, 55, 80) for y in (462, 490, 518)],
        "berths": [
            {"type": "container", "c": list(s2w(72, 205)), "len": 230, "beam": 36, "along": "x"},
            {"type": "bulk", "c": list(s2w(66, 358)), "len": 190, "beam": 30, "along": "x"},
        ],
        "cranes": [{"c": list(s2w(x, 147)), "dir": 1} for x in (18, 42, 66, 90, 114, 138)] + [{"c": list(s2w(x, 393)), "dir": -1} for x in (20, 48, 76)],
        "rail": [[list(s2w(x0, 0)), list(s2w(x1, 430))] for x0, x1 in ((212, 332), (226, 338), (240, 344), (254, 350), (268, 356), (282, 362), (296, 368))],
    }
    json.dump(plan, open(os.path.join(OUT, "harbor.json"), "w"))
    print("written; heading deg", round(math.degrees(heading), 1))


if __name__ == "__main__":
    main()
