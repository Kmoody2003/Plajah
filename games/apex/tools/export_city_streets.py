"""Export the real street centrelines (world metres) for the 3D viewer, split where they leave land."""
import json, os
import numpy as np
import real_city as rc
import city_plan_real as cpr

OUT = os.path.join(rc.REPO, "public", "games", "apex", "region")
h = np.fromfile(os.path.join(OUT, "height.f32"), dtype=np.float32).reshape(rc.H_MAP, rc.W_MAP)


def ok(x, z):
    if not rc.in_region(x, z):
        return False
    px, py = int(round(x / rc.MPP + rc.W_MAP / 2)), int(round(z / rc.MPP + rc.H_MAP / 2))
    return h[py, px] > 0.9


d = json.load(open(os.path.join(rc.HERE, "data", "detroit_streets.json")))
out = []
for s in d["streets"]:
    name = (s.get("name") or "")
    cls = cpr.classify(name)
    pts = [rc.ll_to_world(lon, lat) for lon, lat in s["geometry"]["coordinates"]]
    run = []
    for p in pts:
        if ok(*p):
            run.append([round(p[0], 1), round(p[1], 1)])
        else:
            if len(run) > 1:
                out.append({"c": cls, "n": name, "p": run})
            run = []
    if len(run) > 1:
        out.append({"c": cls, "n": name, "p": run})
json.dump(out, open(os.path.join(OUT, "city_streets.json"), "w"))
print("street runs", len(out), "arterial", sum(1 for o in out if o["c"] == "arterial"), "freeway", sum(1 for o in out if o["c"] == "freeway"))
