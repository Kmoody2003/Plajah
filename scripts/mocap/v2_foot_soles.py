"""Dump the sole contact points of the v2 Chora/Reello feet (glTF Y-up metres, rest pose) for bakeKaijuDancesV2.mjs.

    python scripts/mocap/v2_foot_soles.py

Imports public/models/mascots/v2/{chora,reello}.glb with Blender's glTF importer (it decodes the Draco mesh), takes the
vertices weighted >0.6 to foot_L / foot_R and writes a 4-point sole (inset heel/toe x inner/outer corners at the sole
plane) per foot to scripts/mocap/v2_foot_soles.json. The baker transforms these points with the posed foot bone and uses
the lowest one as the ground contact (feet never sink, locomotion hips ride the contact).
"""
import bpy, json, os
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
out = {}
for who in ("chora", "reello"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public/models/mascots/v2", f"{who}.glb"))
    ob = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.vertices))
    me = ob.data
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    mw = np.array(ob.matrix_world)
    Wd = co @ mw[:3, :3].T + mw[:3, 3]
    G = np.stack([Wd[:, 0], Wd[:, 2], -Wd[:, 1]], 1)           # Blender Z-up -> glTF Y-up
    names = [g.name for g in ob.vertex_groups]
    out[who] = {}
    for foot in ("foot_L", "foot_R"):
        gi = names.index(foot)
        sel = [v.index for v in me.vertices if any(g.group == gi and g.weight > 0.6 for g in v.groups)]
        P = G[sel]; lo, hi = P.min(0), P.max(0)
        w, l = hi[0] - lo[0], hi[2] - lo[2]
        x0, x1 = lo[0] + 0.2 * w, hi[0] - 0.2 * w
        z0, z1 = lo[2] + 0.15 * l, hi[2] - 0.15 * l
        out[who][foot] = dict(bbox=[lo.round(4).tolist(), hi.round(4).tolist()],
                              sole=[[round(float(x), 4), 0.0, round(float(z), 4)] for x in (x0, x1) for z in (z0, z1)])
json.dump(out, open(os.path.join(os.path.dirname(__file__), "v2_foot_soles.json"), "w"), indent=1)
print(json.dumps(out)[:400])
