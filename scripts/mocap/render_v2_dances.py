"""Render contact sheets of baked v2 dances on the REAL skinned Chora/Reello meshes (Blender bpy, EEVEE).

    python scripts/mocap/render_v2_dances.py chora 02_01,09_01 out.png [--frames 8] [--views front,side] [--cell 260]
           [--span 1] [--times t0,t1,...] [--size 0.0]

The GLB is imported for the mesh/materials only; the armature is dropped and the vertices are skinned here (linear blend
skinning, glTF maths) with the node transforms driven by the baked dances.json/bin, i.e. exactly what the three.js
runtime does. Locomotion clips get a scrolling checker floor (treadmill at the clip's `speed`) so a planted foot looks
stuck to its check. Rows = clip x view, columns = evenly spaced frames across the clip (--span 2 = two loops).
"""
import bpy, sys, os, json
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
args = sys.argv[1:]
who, clips, outp = args[0], args[1].split(","), os.path.abspath(args[2])


def opt(n, d):
    return type(d)(args[args.index(n) + 1]) if n in args else d


NF, CELL, SPAN = opt("--frames", 8), opt("--cell", 260), opt("--span", 1.0)
VIEWS = (args[args.index("--views") + 1] if "--views" in args else "front,side").split(",")
EXPLICIT_T = [float(x) for x in args[args.index("--times") + 1].split(",")] if "--times" in args else None

glb = os.path.join(ROOT, "public/models/mascots/v2", who + ".glb")
dd = os.path.join(ROOT, "public/models/mascots/v2/dances", who)
idx = json.load(open(os.path.join(dd, "dances.json")))
data = np.fromfile(os.path.join(dd, "dances.bin"), dtype=np.int16)

# ---- glTF node tree -------------------------------------------------------------------------------------------------
with open(glb, "rb") as f:
    f.seek(12); clen = int.from_bytes(f.read(4), "little"); f.seek(20); gj = json.loads(f.read(clen))
nodes = gj["nodes"]; N = len(nodes)
parent = [-1] * N
for i, n in enumerate(nodes):
    for c in n.get("children", []): parent[c] = i


def trs(n):
    t = np.array(n.get("translation", [0, 0, 0]), float); q = n.get("rotation", [0, 0, 0, 1]); s = np.array(n.get("scale", [1, 1, 1]), float)
    return t, np.array(q, float), s


def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local(i, qo=None, to=None):
    t, q, s = trs(nodes[i])
    if qo is not None: q = qo
    if to is not None: t = to
    M = np.eye(4); M[:3, :3] = qmat(q) * s; M[:3, 3] = t
    return M


order = []


def visit(i):
    order.append(i)
    for c in nodes[i].get("children", []): visit(c)


for r in gj["scenes"][0]["nodes"]: visit(r)


def world(over):
    Wm = [None] * N
    for i in order:
        M = local(i, *(over.get(i, (None, None))))
        Wm[i] = M if parent[i] < 0 else Wm[parent[i]] @ M
    return Wm


Wr = world({}); Wri = [np.linalg.inv(m) for m in Wr]
name2node = {n.get("name"): i for i, n in enumerate(nodes)}

# ---- mesh -----------------------------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
ob = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.vertices))
me = ob.data; nv = len(me.vertices)
vg = [g.name for g in ob.vertex_groups]
Jn = np.zeros((nv, 4), np.int32); Wt = np.zeros((nv, 4))
for v in me.vertices:
    gs = sorted([(g.weight, g.group) for g in v.groups], reverse=True)[:4]
    for k, (w, g) in enumerate(gs):
        Jn[v.index, k] = name2node[vg[g]]; Wt[v.index, k] = w
Wt /= np.maximum(Wt.sum(1, keepdims=True), 1e-9)
co = np.empty(nv * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
mw = np.array(ob.matrix_world); wp = co @ mw[:3, :3].T + mw[:3, 3]
rest_g = np.stack([wp[:, 0], wp[:, 2], -wp[:, 1]], 1)              # Blender Z-up -> glTF Y-up
for m in list(ob.modifiers): ob.modifiers.remove(m)
ob.parent = None; ob.matrix_world = Matrix.Identity(4)
for o in list(bpy.data.objects):
    if o is not ob and o.type != "CAMERA": bpy.data.objects.remove(o)
rest_h = np.concatenate([rest_g, np.ones((nv, 1))], 1)


def skin(mats):
    out = np.zeros((nv, 3))
    for k in range(4):
        M = np.stack([mats[j] for j in Jn[:, k]])                  # (nv,4,4)
        out += Wt[:, k:k + 1] * np.einsum("nij,nj->ni", M[:, :3, :], rest_h)
    return out


def set_pose(clip, frame):
    bones = idx["bones"]; per = idx["perFrame"]; base = clip["offset"] // 2 + frame * per
    over = {}
    for b, nm in enumerate(bones):
        q = data[base + b * 4: base + b * 4 + 4] / idx["quatScale"]
        over[name2node[nm]] = (q / np.linalg.norm(q), None)
    p = data[base + len(bones) * 4: base + len(bones) * 4 + 3] / idx["posScale"]
    over[name2node["hips"]] = (over[name2node["hips"]][0], p)
    Wa = world(over)
    mats = [Wa[i] @ Wri[i] for i in range(N)]
    P = skin(mats)
    bp = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)               # glTF -> Blender
    me.vertices.foreach_set("co", bp.reshape(-1)); me.update()


# ---- scene ----------------------------------------------------------------------------------------------------------
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
try: sc.eevee.taa_render_samples = 16
except Exception: pass
sc.render.resolution_x = CELL; sc.render.resolution_y = CELL
sc.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w"); w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.80, 0.82, 0.86, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9; sc.world = w
for nm, rot, en in (("key", (0.9, 0.2, 0.6), 3.0), ("fill", (1.1, -0.3, -2.2), 1.2), ("rim", (2.2, 0.1, 3.4), 1.4)):
    ld = bpy.data.lights.new(nm, "SUN"); ld.energy = en; lo = bpy.data.objects.new(nm, ld); sc.collection.objects.link(lo); lo.rotation_euler = rot
cd = bpy.data.cameras.new("c"); cd.lens = 70; cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
# checker floor 6 m square, 10 checks per side => 0.6 m cells (scrolls for the treadmill)
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, -0.003)); fl = bpy.context.object
mat = bpy.data.materials.new("floor"); mat.use_nodes = True; nt = mat.node_tree
for n in list(nt.nodes):
    if n.type != "OUTPUT_MATERIAL": nt.nodes.remove(n)
out_n = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
bsdf = nt.nodes.new("ShaderNodeBsdfDiffuse"); chk = nt.nodes.new("ShaderNodeTexChecker"); tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
chk.inputs["Color1"].default_value = (0.42, 0.45, 0.52, 1); chk.inputs["Color2"].default_value = (0.62, 0.65, 0.72, 1); chk.inputs["Scale"].default_value = 12
nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], chk.inputs["Vector"])
nt.links.new(chk.outputs["Color"], bsdf.inputs["Color"]); nt.links.new(bsdf.outputs["BSDF"], out_n.inputs["Surface"])
fl.data.materials.append(mat)


def scroll(d):
    # object-space coords of the 6 m plane span [-3,3]; the ground moves toward -Z(glTF) == +Y(Blender): shift the sample point by -d
    mp.inputs["Location"].default_value = (0, -d, 0)


VCLOSE = {"feet": ("side", (0, 0, 0.14), 1.9), "feetf": ("q3", (0, 0, 0.14), 1.9), "upper": ("front", (0, 0, 0.5), 2.2)}
VD = {"front": (0, -1, 0.12), "side": (1, 0, 0.12), "q3": (0.62, -0.74, 0.26), "back": (0, 1, 0.12), "top": (0, -0.3, 1)}


def shot(view, path, centre=(0, 0, 0.52), dist=3.5):
    if view in VCLOSE: view, centre, dist = VCLOSE[view]
    d = Vector(VD[view]).normalized(); cam.location = Vector(centre) + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)


from PIL import Image, ImageDraw
rows = []
tmp = outp + "._tmp.png"
byid = {c["id"]: c for c in idx["clips"]}
for cid in clips:
    c = byid[cid]; n = c["frames"]
    speed = c.get("speed", 0.0) if c.get("kind", "dance") != "dance" else 0.0
    if EXPLICIT_T: fs = [int(round(t * idx["fps"])) for t in EXPLICIT_T]
    else: fs = [int(round(i * (n * SPAN) / NF)) for i in range(NF)]
    for view in VIEWS:
        row = []
        for fr in fs:
            set_pose(c, fr % n)
            scroll(speed * (fr / idx["fps"]))
            shot(view, tmp)
            im = Image.open(tmp).convert("RGB"); d = ImageDraw.Draw(im); d.rectangle([0, 0, CELL, 13], fill=(255, 255, 255))
            nm_ = c['name'][:18].encode('ascii', 'replace').decode(); d.text((3, 1), f'{cid} {nm_} f{fr} {view}', fill=(0, 0, 0)); row.append(im)
        rows.append(row)
W = max(len(r) for r in rows)
sheet = Image.new("RGB", (W * CELL, len(rows) * CELL), (200, 200, 208))
for ri, r in enumerate(rows):
    for ci, im in enumerate(r): sheet.paste(im, (ci * CELL, ri * CELL))
os.makedirs(os.path.dirname(os.path.abspath(outp)), exist_ok=True); sheet.save(outp); os.remove(tmp)
print("saved", outp, sheet.size)
