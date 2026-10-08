"""
rig_magnific_mascots.py -- rig the two approved Meshy 7.1 image-to-3D kaiju (Chora, Reello) into animation-ready GLBs.

    python scripts/blender/rig_magnific_mascots.py chora|reello|both [--review]

Input : docs/kaiju-fidelity/magnific/i23d/{who}_blank_meshy71.glb   (one textured mesh, sculpt + texture are NOT touched)
Output: public/models/mascots/v2/{who}.glb        skinned mesh + 10 clips + armature extras `spring_tails`
        public/models/mascots/v2/rig_report.json  bones / counts / sizes / weight checks
        docs/kaiju-fidelity/rig/*                 (--review) test sheets rendered with the real skinning

Skeleton = the OLD rig's bone names + hierarchy (public/models/mascots/chora.glb, scripts/blender/build_mascots.py) minus the
face bones, plus foot_L / foot_R.  Torso bones (root, hips, spine, chest, head) point +Z with roll 0 so their glTF rest
rotations are identity (the mocap baker relies on that).  Spring chains (fin_*, horn_*) are fitted to the plates / horns /
spikes found in the mesh (see PARTS below).
"""
import bpy, bmesh, os, sys, json, math, struct, re
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(REPO, "docs", "kaiju-fidelity", "magnific", "i23d")
OUT = os.path.join(REPO, "public", "models", "mascots", "v2")
REVIEW = os.path.join(REPO, "docs", "kaiju-fidelity", "rig")
FPS = 30
TARGET_H = 1.175          # old model: feet 0 -> horn tip 1.1746 (blender Z)


# ================================================================== scene + mesh helpers
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def verts_np(ob):
    n = len(ob.data.vertices)
    a = np.empty(n * 3, dtype=np.float64)
    ob.data.vertices.foreach_get("co", a)
    return a.reshape(n, 3)


def set_verts_np(ob, V):
    ob.data.vertices.foreach_set("co", np.asarray(V, dtype=np.float32).reshape(-1))
    ob.data.update()


def vertex_colors_from_texture(ob):
    """Per-vertex average texture colour (sRGB 0..1) sampled at the UVs."""
    me = ob.data
    mat = me.materials[0]
    img = [n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE"][0]
    W, H = img.size
    px = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(H, W, 4)[:, :, :3]
    nl = len(me.loops)
    uv = np.empty(nl * 2, dtype=np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(nl, 2)
    x = np.clip((uv[:, 0] * (W - 1)).round().astype(int), 0, W - 1)
    y = np.clip((uv[:, 1] * (H - 1)).round().astype(int), 0, H - 1)
    lc = px[y, x]                                   # (loops,3) in the image's colour space (sRGB for a colour texture)
    vi = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get("vertex_index", vi)
    n = len(me.vertices)
    acc = np.zeros((n, 3)); cnt = np.zeros(n)
    np.add.at(acc, vi, lc); np.add.at(cnt, vi, 1)
    return acc / np.maximum(cnt, 1)[:, None]


def import_and_normalise(who):
    """Import the blank-face GLB; scale/translate so the character stands on z=0 (feet), centred on x/y, total height
    (frill + crest included) = TARGET_H, facing -Y (= +Z in glTF).  Transforms are applied to the vertices."""
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f"{who}_blank_meshy71.glb"))
    ob = [o for o in bpy.data.objects if o.type == "MESH"][0]
    ob.name = f"{who}_skin"
    for c in list(ob.children): c.parent = None
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)
    col = vertex_colors_from_texture(ob)
    V = verts_np(ob)
    s = TARGET_H / (V[:, 2].max() - V[:, 2].min())
    V = V * s
    V[:, 2] -= V[:, 2].min()
    # centre x on the symmetry plane (mean of the foot extremes), y so the leg/foot centre sits at y=0 like the old rig
    low = V[:, 2] < 0.06
    cx = 0.5 * (V[low, 0].min() + V[low, 0].max())
    cy = V[low, 1].mean()
    V[:, 0] -= cx; V[:, 1] -= cy
    set_verts_np(ob, V)
    V = verts_np(ob)                    # exactly what the mesh stores (float32), so position keys match after bmesh round trips
    return ob, V, col, s


# ================================================================== analysis (welded graph, normals, spike tips)
class Geo:
    """Welded view of the skin mesh: Meshy splits vertices along UV seams, so connectivity / smoothing / spike finding
    work on the welded copy and results are mapped back to the real (split) vertices through `inv`."""
    def __init__(self, ob, V, col):
        self.ob, self.V, self.col = ob, V, col
        key = np.round(V / 1e-5).astype(np.int64)
        _, inv = np.unique(key, axis=0, return_inverse=True)
        self.inv = inv.ravel()
        self.nw = int(self.inv.max()) + 1
        W = np.zeros((self.nw, 3)); W[self.inv] = V
        self.W = W
        me = ob.data
        nt = len(me.polygons)
        tri = np.empty(nt * 3, dtype=np.int64)
        me.loops.foreach_get("vertex_index", tri)          # all polygons are triangles in a glTF import
        self.T = self.inv[tri.reshape(nt, 3)]
        E = np.concatenate([self.T[:, [0, 1]], self.T[:, [1, 2]], self.T[:, [2, 0]]])
        self.E = np.unique(np.sort(E, axis=1), axis=0)
        self.rows = np.concatenate([self.E[:, 0], self.E[:, 1]])
        self.cols = np.concatenate([self.E[:, 1], self.E[:, 0]])
        self.deg = np.bincount(self.rows, minlength=self.nw).astype(np.float64)
        nrm = np.empty(len(V) * 3, dtype=np.float64)
        me.vertices.foreach_get("normal", nrm)
        N = np.zeros((self.nw, 3)); np.add.at(N, self.inv, nrm.reshape(-1, 3))
        self.N = N / np.maximum(np.linalg.norm(N, axis=1), 1e-9)[:, None]
        C = np.zeros((self.nw, 3)); cnt = np.bincount(self.inv, minlength=self.nw)
        np.add.at(C, self.inv, col); self.C = C / np.maximum(cnt, 1)[:, None]
        kd = KDTree(self.nw)
        for i, p in enumerate(W): kd.insert(Vector(p), i)
        kd.balance(); self.kd = kd

    def smooth_field(self, F, iters, lam=0.5):
        F = F.copy()
        for _ in range(iters):
            s = np.zeros_like(F); np.add.at(s, self.rows, F[self.cols]); s /= np.maximum(self.deg, 1)[:, None] if F.ndim > 1 else np.maximum(self.deg, 1)
            F += lam * (s - F)
        return F

    def within(self, p, rad):
        return np.array([j for (_, j, _) in self.kd.find_range(Vector(p), rad)], dtype=np.int64)

    def snap_tip(self, anchor, hint, rad=0.05):
        """vertex within `rad` of the anchor that sticks out furthest along `hint`."""
        ids = self.within(anchor, rad)
        if len(ids) == 0: raise RuntimeError(f"no vertices near anchor {anchor}")
        h = np.asarray(hint, float); h /= np.linalg.norm(h)
        return int(ids[np.argmax(self.W[ids] @ h)])

    def axis_at(self, tip, rad=0.035):
        """spike axis = mean of the welded vertex normals around the tip (a cone's ring normals cancel radially)."""
        ids = self.within(self.W[tip], rad)
        a = self.N[ids].sum(0)
        return a / np.linalg.norm(a)


# ================================================================== per-character layout (normalised metres, Blender axes, facing -Y)
# Core joints were read off orthographic views of the normalised mesh.  Spike anchors are approximate tip positions; the
# script snaps each to the real tip vertex (furthest along `hint` within 5 cm) and fits the spring chain from the mesh
# normals there.   kind: sail (2 bones) / horn / crest (2 bones) / nape (2) / spine (2) / tspike (2)
def _mirror(p): return (-p[0], p[1], p[2])

CHARS = {
  "chora": dict(
    ay=-0.03,                                          # torso axis (y)
    arm=dict(sh=(0.190, -0.060, 0.465), el=(0.243, -0.125, 0.325), hd=(0.272, -0.200, 0.245)),
    leg=dict(hp=(0.150, -0.060, 0.200), an=(0.145, -0.095, 0.082), toe=(0.150, -0.195, 0.012)),
    tail=[(0, 0.12, 0.150), (0, 0.21, 0.115), (0, 0.285, 0.085), (0, 0.355, 0.062), (0, 0.436, 0.057)],
    head_top=1.05, neck=0.50,
    chains=[
      # name,   kind,   anchor,               hint,              parent
      ("fin_f00", "sail", (-0.314, 0.030, 0.601), (-1, 0, -0.3), "head"),
      ("fin_f01", "sail", (-0.358, 0.098, 0.741), (-1, 0, 0), "head"),
      ("fin_f02", "sail", (-0.353, 0.094, 0.893), (-1, 0, 0.2), "head"),
      ("fin_f03", "sail", (-0.298, 0.037, 1.086), (-0.5, 0, 1), "head"),
      ("fin_f04", "crest", (0.001, -0.104, 1.126), (0, 0, 1), "head"),
      ("fin_f05", "sail", (0.299, 0.040, 1.088), (0.5, 0, 1), "head"),
      ("fin_f06", "sail", (0.357, 0.091, 0.890), (1, 0, 0.2), "head"),
      ("fin_f07", "sail", (0.358, 0.094, 0.743), (1, 0, 0), "head"),
      ("fin_f08", "sail", (0.312, 0.030, 0.600), (1, 0, -0.3), "head"),
      ("horn_0", "horn", (-0.207, -0.310, 1.022), (-0.2, -0.3, 1), "head"),
      ("horn_1", "horn", (0.209, -0.309, 1.019), (0.2, -0.3, 1), "head"),
      ("horn_2", "horn", (0.001, 0.034, 1.175), (0, 0, 1), "head"),
      ("fin_b00", "crest", (-0.112, 0.021, 1.093), (0, 0, 1), "head"),
      ("fin_b01", "crest", (0.113, 0.021, 1.092), (0, 0, 1), "head"),
      ("fin_b02", "crest", (0.000, 0.230, 1.147), (0, 0.5, 1), "head"),
      ("fin_b03", "nape", (0.000, 0.319, 0.939), (0, 1, 0.4), "head"),
      ("fin_b04", "nape", (0.000, 0.323, 0.766), (0, 1, 0.2), "head"),
      ("fin_b05", "nape", (0.000, 0.261, 0.619), (0, 1, 0), "head"),
      ("fin_d00", "spine", (0.000, 0.209, 0.491), (0, 1, 0.2), "chest"),
      ("fin_d01", "spine", (0.000, 0.223, 0.359), (0, 1, 0.3), "spine"),
      ("fin_d02", "spine", (0.000, 0.244, 0.258), (0, 1, 0.4), "spine"),
      ("fin_d03", "spine", (0.000, 0.279, 0.194), (0, 0.8, 0.6), "hips"),
      ("fin_t00", "tspike", (0.000, 0.311, 0.146), (0, 0.6, 0.8), "tail_1"),
      ("fin_t01", "tspike", (0.000, 0.346, 0.110), (0, 0.6, 0.8), "tail_2"),
      ("fin_t02", "tspike", (0.000, 0.433, 0.059), (0, 1, 0), "tail_3"),
    ]),
  "reello": dict(
    ay=-0.015,
    arm=dict(sh=(0.200, -0.010, 0.470), el=(0.250, -0.040, 0.330), hd=(0.285, -0.075, 0.245)),
    leg=dict(hp=(0.150, -0.030, 0.200), an=(0.155, -0.035, 0.085), toe=(0.155, -0.100, 0.012)),
    tail=[(0, 0.12, 0.160), (0, 0.22, 0.130), (0, 0.31, 0.100), (0, 0.40, 0.075), (0, 0.486, 0.042)],
    head_top=1.05, neck=0.52,
    chains=[
      ("fin_f00", "sail", (-0.329, 0.109, 0.625), (-1, 0, -0.3), "head"),
      ("fin_f01", "sail", (-0.376, 0.168, 0.755), (-1, 0, 0), "head"),
      ("fin_f02", "sail", (-0.372, 0.184, 0.905), (-1, 0, 0.2), "head"),
      ("fin_f03", "sail", (-0.286, 0.244, 1.125), (-0.5, 0, 1), "head"),
      ("fin_f04", "crest", (0.001, -0.022, 1.157), (0, 0, 1), "head"),
      ("fin_f05", "sail", (0.285, 0.244, 1.126), (0.5, 0, 1), "head"),
      ("fin_f06", "sail", (0.371, 0.183, 0.905), (1, 0, 0.2), "head"),
      ("fin_f07", "sail", (0.375, 0.169, 0.754), (1, 0, 0), "head"),
      ("fin_f08", "sail", (0.329, 0.108, 0.624), (1, 0, -0.3), "head"),
      ("horn_0", "horn", (-0.201, -0.188, 1.067), (-0.2, -0.3, 1), "head"),
      ("horn_1", "horn", (0.200, -0.188, 1.067), (0.2, -0.3, 1), "head"),
      ("horn_2", "horn", (0.001, 0.323, 1.153), (0, 0.4, 1), "head"),
      ("fin_b00", "crest", (-0.062, 0.125, 1.175), (0, 0, 1), "head"),
      ("fin_b01", "crest", (0.061, 0.122, 1.174), (0, 0, 1), "head"),
      ("fin_b02", "nape", (0.000, 0.401, 0.947), (0, 1, 0.4), "head"),
      ("fin_b03", "nape", (0.000, 0.384, 0.766), (0, 1, 0.2), "head"),
      ("fin_b04", "nape", (0.000, 0.325, 0.624), (0, 1, 0), "head"),
      ("fin_b05", "none", (0.0, 0.0, 0.0), (0, 0, 1), "head"),
      ("fin_d00", "spine", (-0.002, 0.280, 0.495), (0, 1, 0.2), "chest"),
      ("fin_d01", "spine", (-0.004, 0.286, 0.362), (0, 1, 0.3), "spine"),
      ("fin_d02", "spine", (-0.002, 0.299, 0.262), (0, 1, 0.4), "spine"),
      ("fin_d03", "spine", (0.000, 0.339, 0.198), (0, 0.8, 0.6), "hips"),
      ("fin_t00", "tspike", (0.000, 0.364, 0.137), (0, 0.6, 0.8), "tail_1"),
      ("fin_t01", "tspike", (0.000, 0.407, 0.116), (0, 0.6, 0.8), "tail_2"),
      ("fin_t02", "tspike", (0.000, 0.486, 0.042), (0, 1, 0), "tail_3"),
    ]),
}
# per kind: visible+embedded length of the chain, base radius for the weight capsule, bones in the chain
KIND = {
  "sail":   dict(L=0.115, rho=0.068, bones=2, snap=0.05),
  "crest":  dict(L=0.130, rho=0.050, bones=2, snap=0.035),
  "nape":   dict(L=0.115, rho=0.046, bones=2, snap=0.04),
  "spine":  dict(L=0.095, rho=0.040, bones=2, snap=0.035),
  "tspike": dict(L=0.060, rho=0.026, bones=2, snap=0.02),
  "horn":   dict(L=0.150, rho=0.052, bones=1, snap=0.05),
}


# ================================================================== skeleton spec
def fit_chains(geo, cfg):
    """spring chains fitted to the mesh: tip snapped to the real vertex, axis from the normals around it."""
    out = {}
    for name, kind, anchor, hint, parent in cfg["chains"]:
        if kind == "none": continue
        K = KIND[kind]
        tip = geo.snap_tip(anchor, hint, K['snap'])
        P = geo.W[tip].copy()
        ax = geo.axis_at(tip)
        h = np.asarray(hint, float); h /= np.linalg.norm(h)
        d = ax + 0.35 * h; d /= np.linalg.norm(d)
        T = P - 0.010 * d
        B = P - K["L"] * d
        out[name] = dict(kind=kind, tip=P, T=T, B=B, dir=d, parent=parent, L=float(np.linalg.norm(T - B)), rho=K["rho"], nb=K["bones"])
    return out


def skeleton_spec(cfg, chains):
    """ordered list of (name, head, tail, parent, connect, roll_up) -- roll_up = world vector the bone's local Z should face."""
    ay = cfg["ay"]; A = cfg["arm"]; Lg = cfg["leg"]; tl = cfg["tail"]
    Z = np.array([0, 0, 1.0]); Yb = np.array([0, 1.0, 0])
    S = []
    def add(n, h, t, par, conn=False, up=None): S.append((n, np.array(h, float), np.array(t, float), par, conn, Z * 0 + (Yb if up is None else np.array(up, float))))
    add("root", (0, 0, 0), (0, 0, 0.08), None, up=Yb)
    add("hips", (0, ay, 0.10), (0, ay, 0.24), "root", up=Yb)
    add("spine", (0, ay, 0.24), (0, ay, 0.36), "hips", up=Yb)
    add("chest", (0, ay, 0.36), (0, ay, cfg["neck"]), "spine", up=Yb)
    add("head", (0, ay, cfg["neck"]), (0, ay, cfg["head_top"]), "chest", up=Yb)
    for side, sx in (("L", 1), ("R", -1)):
        sh = np.array(A["sh"]); el = np.array(A["el"]); hd = np.array(A["hd"])
        sh[0] *= sx; el[0] *= sx; hd[0] *= sx
        add(f"arm_{side}", sh, el, "chest", up=Yb)
        add(f"hand_{side}", el, hd, f"arm_{side}", True, up=Yb)
        hp = np.array(Lg["hp"]); an = np.array(Lg["an"]); toe = np.array(Lg["toe"])
        hp[0] *= sx; an[0] *= sx; toe[0] *= sx
        add(f"leg_{side}", hp, an, "hips", up=Yb)
        add(f"foot_{side}", an, toe, f"leg_{side}", True, up=Z)
    add("tail_1", tl[0], tl[1], "hips", up=Z)
    for k in (2, 3, 4): add(f"tail_{k}", tl[k - 1], tl[k], f"tail_{k - 1}", True, up=Z)
    add("prop", (0, ay - 0.27, 0.285), (0, ay - 0.17, 0.285), "chest", up=Z)
    for name, c in chains.items():
        par = c["parent"]
        if c["nb"] == 1:
            add(name, c["B"], c["T"], par, up=Z if abs(c["dir"][2]) < 0.9 else Yb)
        else:
            M = 0.5 * (c["B"] + c["T"])
            up = Z if abs(c["dir"][2]) < 0.9 else Yb
            add(f"{name}_0", c["B"], M, par, up=up)
            add(f"{name}_1", M, c["T"], f"{name}_0", True, up=up)
    # chains that have no plate in the mesh (cfg kind "none"): a tiny parked bone so the old name still exists
    for name, kind, anchor, hint, parent in cfg["chains"]:
        if kind == "none":
            b = np.array([0, ay + 0.20, cfg["head_top"] - 0.05])
            add(f"{name}_0", b, b + np.array([0, 0.02, 0.03]), parent, up=Z)
            add(f"{name}_1", b + np.array([0, 0.02, 0.03]), b + np.array([0, 0.04, 0.06]), f"{name}_0", True, up=Z)
    return S


# ================================================================== armature
def make_armature(who, cfg, spec, chains):
    ad = bpy.data.armatures.new(f"{who}_rig")
    arm = bpy.data.objects.new(who, ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = ad.edit_bones
    for name, h, t, par, conn, up in spec:
        b = eb.new(name); b.head = Vector(tuple(h)); b.tail = Vector(tuple(t)); b.roll = 0.0
        if par is not None:
            b.parent = eb[par]
            if conn: b.use_connect = True
        v = Vector(tuple(up))
        dirv = (b.tail - b.head).normalized()
        if abs(dirv.z) > 0.999 and abs(v.z) > 0.999: v = Vector((0, 1, 0))
        if abs(dirv.z) < 0.999 or True:
            # torso bones point +Z: keep roll 0 so the glTF rest rotation is exactly identity
            if not (abs(dirv.x) < 1e-6 and abs(dirv.y) < 1e-6 and dirv.z > 0.999 and name in ("root", "hips", "spine", "chest", "head")):
                b.align_roll(v)
    arm["spring_tails"] = {b.name: [round(float(c), 5) for c in b.tail] for b in eb}
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in ad.bones:
        b.use_deform = b.name not in ("root", "prop")
    return arm


LIMB_CUT = 0.16
SMOOTH_ITERS = 4
CORE = ["hips", "spine", "chest", "head", "arm_L", "hand_L", "arm_R", "hand_R", "leg_L", "foot_L", "leg_R", "foot_R",
        "tail_1", "tail_2", "tail_3", "tail_4"]


def heat_core_weights(geo, arm):
    """Blender bone-heat automatic weights for the core bones only, computed on the WELDED surface (UV-split verts would
    otherwise make every texture island a separate heat domain).  Returns (nw, len(CORE)) float array."""
    me = bpy.data.meshes.new("heat_tmp")
    me.from_pydata([tuple(p) for p in geo.W], [], [tuple(int(x) for x in t) for t in geo.T])
    me.update()
    tmp = bpy.data.objects.new("heat_tmp", me)
    bpy.context.scene.collection.objects.link(tmp)
    saved = {}
    for b in arm.data.bones:
        saved[b.name] = b.use_deform
        b.use_deform = b.name in CORE
    bpy.ops.object.select_all(action="DESELECT")
    tmp.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    for k, v in saved.items(): arm.data.bones[k].use_deform = v
    Wt = np.zeros((geo.nw, len(CORE)))
    idx = {tmp.vertex_groups[i].name: i for i in range(len(tmp.vertex_groups))}
    gi = {tmp.vertex_groups[n].index: ci for ci, n in enumerate(CORE) if n in tmp.vertex_groups}
    for v in me.vertices:
        for g in v.groups:
            if g.group in gi: Wt[v.index, gi[g.group]] = g.weight
    bpy.data.objects.remove(tmp)
    bpy.data.meshes.remove(me)
    return Wt


# ================================================================== skin weights
def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def plate_influence(geo, c):
    """0..1 influence of one spring chain on every welded vertex: a tapered capsule around the axis B->T, gated so the base
    of the plate (first ~25 %) stays on its parent and ramps in smoothly."""
    P = geo.W
    B, T = c["B"], c["T"]
    ax = T - B; L = np.linalg.norm(ax); ax /= L
    rel = P - B
    t = (rel @ ax) / L
    tc = np.clip(t, 0, 1)
    foot = B + np.outer(tc * L, ax)
    d = np.linalg.norm(P - foot, axis=1)
    rho = c["rho"] * (1.0 - 0.55 * tc) + 0.010
    fr = 1.0 - sstep(1.0 * rho, 1.7 * rho, d)
    gate = sstep(0.16, 0.46, t)
    tip_fade = 1.0 - sstep(1.15, 1.6, t)             # nothing beyond the tip
    return fr * gate * tip_fade


def chain_split(geo, c):
    """t along the chain (for the 2-bone split)"""
    B, T = c["B"], c["T"]
    ax = T - B; L = np.linalg.norm(ax)
    return ((geo.W - B) @ (ax / L)) / L


def build_weights(geo, cfg, chains, spec, heat, who):
    names = [n for n, *_ in spec]
    bidx = {n: i for i, n in enumerate(names)}
    nb = len(names)
    Wf = np.zeros((geo.nw, nb))
    z = geo.W[:, 2]
    # ---- core: heat weights, head forced rigid above the chin
    core = heat.copy()
    core /= np.maximum(core.sum(1), 1e-9)[:, None]
    # heat weights leave a wide, faint halo of limb influence over the torso (an arm lift would drag the chest and neck):
    # drop the low tail of every limb column, then let the torso bones take the freed weight
    for i, n in enumerate(CORE):
        if n.startswith(("arm", "hand", "leg", "foot")):
            core[:, i] = np.clip((core[:, i] - LIMB_CUT) / (1 - LIMB_CUT), 0, 1)
    core /= np.maximum(core.sum(1), 1e-9)[:, None]
    # soften the creases (armpits, groin, tail root) where two surface sheets of the SAME mesh touch: a few Laplacian passes
    # over the welded graph widen the blend so those thin webs stretch less when a limb moves
    core = geo.smooth_field(core, SMOOTH_ITERS, 0.5)
    core /= np.maximum(core.sum(1), 1e-9)[:, None]
    core_for_cuts = core.copy()
    hi = CORE.index("head")
    hw = sstep(cfg["neck"] + 0.005, cfg["neck"] + 0.085, z)
    e = np.zeros(len(CORE)); e[hi] = 1.0
    core = core * (1 - hw)[:, None] + hw[:, None] * e[None, :]
    # ---- Reello's camera box rides the chest rigidly
    if who == "reello":
        m = (z > 0.27) & (z < 0.47) & (np.abs(geo.W[:, 0]) < 0.18) & (geo.W[:, 1] < -0.185)
        e2 = np.zeros(len(CORE)); e2[CORE.index("chest")] = 0.55; e2[CORE.index("spine")] = 0.45
        core[m] = e2
    # ---- plates
    infl = {}
    for name, c in chains.items():
        infl[name] = plate_influence(geo, c)
    tot = np.zeros(geo.nw)
    for v in infl.values(): tot += v
    scale = np.where(tot > 1, 1.0 / np.maximum(tot, 1e-9), 1.0)
    # parent of every chain gets the remainder; non-head parents (torso spikes) fall back on the core weights
    plate_total = np.zeros(geo.nw)
    for name, c in chains.items():
        w = infl[name] * scale
        plate_total += w
        if c["nb"] == 1:
            Wf[:, bidx[name]] += w
        else:
            s = sstep(0.38, 0.78, chain_split(geo, c))
            Wf[:, bidx[f"{name}_0"]] += w * (1 - s)
            Wf[:, bidx[f"{name}_1"]] += w * s
    rem = np.clip(1 - plate_total, 0, 1)
    for i, n in enumerate(CORE):
        Wf[:, bidx[n]] += core[:, i] * rem
    return names, Wf, core_for_cuts


def finalise_weights(Wf, max_inf=4, min_w=0.004):
    """prune to the strongest `max_inf` influences per vertex, drop dust, renormalise to exactly 1."""
    W = Wf.copy()
    order = np.argsort(-W, axis=1)
    keep = np.zeros_like(W, dtype=bool)
    rows = np.arange(len(W))[:, None]
    keep[rows, order[:, :max_inf]] = True
    W[~keep] = 0
    W[W < min_w] = 0
    s = W.sum(1)
    bad = s < 1e-9
    W[bad, 0] = 1.0; s[bad] = 1.0
    return W / s[:, None]


# ================================================================== crease cuts
# Meshy fused the arms to the flanks and the hands to the thighs: where two sheets of the SAME surface meet in a closed V
# (armpit, hand-on-thigh, groin) a single row of vertices joins them, and raising a limb drags that row out into a thin web.
# Splitting the mesh along those V-creases (vertices duplicated in place, nothing moved, nothing deleted) lets each sheet
# follow its own bone while the rest pose renders bit-for-bit as before.  Smooth junctions (shoulder tops, thigh tops) have
# a small dihedral angle and are left connected.
LIMBS = (("arm_L", ("arm_L", "hand_L")), ("arm_R", ("arm_R", "hand_R")), ("leg_L", ("leg_L", "foot_L")), ("leg_R", ("leg_R", "foot_R")))
CUT_DOT = 0.25          # cut when the two faces' normals are more than ~75 degrees apart
CUT_MIN_LABEL = 0.55    # limb membership of a face (mean limb weight of its corners)


def face_labels(geo, core):
    """per welded-triangle limb label: 0 = rest, 1..4 = LIMBS"""
    tot = np.zeros((geo.nw, 5))
    for k, (_, cols) in enumerate(LIMBS):
        for c in cols: tot[:, k + 1] += core[:, CORE.index(c)]
    tot[:, 0] = np.clip(1 - tot[:, 1:].sum(1), 0, 1)
    ft = tot[geo.T].mean(1)                         # (ntri, 5)
    lab = np.argmax(ft, axis=1)
    lab[(lab > 0) & (ft.max(1) < CUT_MIN_LABEL)] = 0
    return lab, tot


def cut_creases(ob, geo, core):
    """split the skin mesh along V-creases between limb sheets and the rest.  Returns (inv_new, forced) where `forced` maps
    each real rim vertex to its limb label (0..4)."""
    lab, tot = face_labels(geo, core)
    T = geo.T
    P = geo.W
    nrm = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1), 1e-12)[:, None]
    # welded edge -> faces
    edge_faces = {}
    for fi, (a, b, c) in enumerate(T):
        for u, v in ((a, b), (b, c), (c, a)):
            edge_faces.setdefault((min(u, v), max(u, v)), []).append(fi)
    cut = set(); rim_w = set()
    for e, fs in edge_faces.items():
        if len(fs) != 2: continue
        f1, f2 = fs
        if lab[f1] == lab[f2]: continue
        if float(nrm[f1] @ nrm[f2]) < CUT_DOT:
            cut.add(e); rim_w.add(e[0]); rim_w.add(e[1])
    # apply on the real mesh
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    inv = geo.inv
    sel = [e for e in bm.edges if (min(inv[e.verts[0].index], inv[e.verts[1].index]), max(inv[e.verts[0].index], inv[e.verts[1].index])) in cut]
    bmesh.ops.split_edges(bm, edges=sel)
    bm.to_mesh(me); bm.free()
    me.update()
    # new welded map (same 1e-5 rounding as Geo): vertices that were duplicated keep their old welded id
    V = verts_np(ob)
    key = np.round(V / 1e-5).astype(np.int64)
    old_key = np.round(geo.V / 1e-5).astype(np.int64)
    table = {tuple(k): int(i) for k, i in zip(old_key, geo.inv)}
    inv_new = np.array([table[tuple(k)] for k in key], dtype=np.int64)
    # face labels on the real mesh -> per-real-vertex label set
    nl = len(me.loops); nf = len(me.polygons)
    loop_v = np.empty(nl, dtype=np.int64); me.loops.foreach_get("vertex_index", loop_v)
    # each polygon is a triangle in the same order as before the split (bmesh keeps face order)
    fv = loop_v.reshape(nf, 3)
    wf = inv_new[fv]
    # label of a real face = label of the welded triangle with the same (unordered) welded corners
    tri_lab = {}
    for fi, t in enumerate(T): tri_lab[tuple(sorted(t.tolist()))] = int(lab[fi])
    rl = np.array([tri_lab.get(tuple(sorted(w.tolist())), 0) for w in wf])
    vlabels = [set() for _ in range(len(V))]
    for fi in range(nf):
        for v in fv[fi]: vlabels[v].add(int(rl[fi]))
    forced = {}
    rim = np.zeros(geo.nw, dtype=bool); rim[list(rim_w)] = True
    for i in range(len(V)):
        if rim[inv_new[i]] and len(vlabels[i]) == 1:
            forced[i] = next(iter(vlabels[i]))
    print(f"  crease cuts: {len(cut)} welded edges split; {len(forced)} rim vertices forced; verts {len(geo.V)} -> {len(V)}")
    return inv_new, forced, lab


def forced_rows(full, forced, names):
    """rigid limb separation at the rim: a limb-labelled copy keeps only its own limb's columns, a rest-labelled copy loses
    every limb column that has a cut."""
    bidx = {n: i for i, n in enumerate(names)}
    limb_cols = {k + 1: [bidx[c] for c in cols] for k, (_, cols) in enumerate(LIMBS)}
    all_limb = [c for cs in limb_cols.values() for c in cs]
    for i, l in forced.items():
        w = full[i].copy()
        if l == 0:
            w[all_limb] = 0
        else:
            keep = limb_cols[l]
            s = w[keep].sum()
            other = np.ones(len(w), dtype=bool); other[keep] = False
            if s < 1e-6: w[:] = 0; w[keep[0]] = 1
            else:
                w[other] = 0
        full[i] = w / max(w.sum(), 1e-9)
    return full


# ================================================================== bind: vertex groups, modifier, material
def bind_skin(ob, arm, names, full):
    """full: (n_real_vertices, nbones) final weights -> vertex groups on the (cut) skin mesh."""
    me = ob.data
    for n in names:
        if n in ob.vertex_groups: ob.vertex_groups.remove(ob.vertex_groups[n])
    groups = [ob.vertex_groups.new(name=n) for n in names]
    for j, g in enumerate(groups):
        idx = np.nonzero(full[:, j] > 0)[0]
        for i in idx.tolist(): g.add([i], float(full[i, j]), "REPLACE")
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    md = ob.modifiers.new("Armature", "ARMATURE"); md.object = arm
    ob.parent = arm
    ob.matrix_parent_inverse = Matrix.Identity(4)
    return full


def tidy_material(ob, who):
    """keep the Meshy PBR material (2048^2 base colour, content untouched) but name it `skin`, fix roughness/metal and
    re-encode the texture JPEG (q90, 4:4:4, optimised: the Meshy file is ~2.8 MB at near-lossless quality -> ~1.1 MB)."""
    m = ob.data.materials[0]
    m.name = "skin"
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Metallic"].default_value = 0.0
            n.inputs["Roughness"].default_value = 0.7
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image is not None:
            import io
            from PIL import Image
            src = n.image
            # go through the packed original bytes so no colour transform is applied twice
            if src.packed_file is not None:
                im = Image.open(io.BytesIO(src.packed_file.data)).convert("RGB")
            else:
                im = Image.open(bpy.path.abspath(src.filepath)).convert("RGB")
            buf = io.BytesIO(); im.save(buf, "JPEG", quality=90, optimize=True, subsampling=0)
            tmp = os.path.join(bpy.app.tempdir or os.environ.get("TEMP", "."), f"{who}_skin_basecolor.jpg")
            open(tmp, "wb").write(buf.getvalue())
            new = bpy.data.images.load(tmp); new.name = f"{who}_skin_basecolor"
            new.colorspace_settings.name = "sRGB"; new.pack()
            n.image = new
    m.use_backface_culling = False
    return m


# ================================================================== posing helpers (world-axis rotations, converted to bone space)
AX = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}

def wrot(arm, bname, rots):
    """rots = [(axis, degrees)...] applied in order in WORLD axes at the rest pose -> local pose quaternion of the bone."""
    q = Quaternion()
    for ax, deg in rots: q = Quaternion(AX[ax], math.radians(deg)) @ q
    B = arm.data.bones[bname].matrix_local.to_quaternion()
    return B.inverted() @ q @ B

def wloc(arm, bname, v):
    return arm.data.bones[bname].matrix_local.to_3x3().inverted() @ Vector(v)

def pose_bones(arm, spec):
    """spec: bone -> {'r': [(axis,deg)], 'l': (x,y,z) world metres, 's': scalar|(x,y,z)}.  Bones absent from spec go to rest."""
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        s = spec.get(pb.name, {})
        pb.rotation_quaternion = wrot(arm, pb.name, s.get("r", []))
        pb.location = wloc(arm, pb.name, s.get("l", (0, 0, 0)))
        sc = s.get("s", 1.0)
        pb.scale = (sc, sc, sc) if isinstance(sc, (int, float)) else sc
    bpy.context.view_layer.update()

def rest_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


# ================================================================== clips
SPRING_PREFIX = ("fin_", "horn_")
TAU = 2 * math.pi

def ease(t): return t * t * (3 - 2 * t)
def ease_out(t): return 1 - (1 - t) ** 3
def seg(t, a, b): return min(1.0, max(0.0, (t - a) / (b - a)))
def damped(t, freq, decay): return math.exp(-decay * t) * math.sin(TAU * freq * t)


def merge(*ds):
    out = {}
    for d in ds:
        if not d: continue
        for k, v in d.items():
            cur = dict(out.get(k, {}))
            for kk, vv in v.items():
                if kk == "r": cur["r"] = cur.get("r", []) + list(vv)
                elif kk == "l": cur["l"] = tuple(a + b for a, b in zip(cur.get("l", (0, 0, 0)), vv))
                else: cur[kk] = vv
            out[k] = cur
    return out


def body(bob=0.0, sway=0.0, squash=1.0, breath=1.0, lean=0.0, hx=0.0, hy=0.0, hz=0.0,
         tail=0.0, tail_phase=0.0, tail_lift=0.0,
         lu=0.0, ru=0.0, lo=0.0, ro=0.0, li=0.0, ri=0.0, lh=0.0, rh=0.0, legs=0.0, roll=0.0, twist=0.0):
    """One body pose in world-axis degrees (the character faces -Y, its left is +X).
       lean/hx = pitch forward/down, hy = turn to the character's left, hz = tilt toward its left shoulder,
       lu/ru = arm raised forward, lo/ro = arm out sideways, li/ri = arm pulled across the body, lh/rh = hand curl forward,
       legs = both legs swung forward (deg)."""
    k = 1.0 / math.sqrt(max(squash, 0.2))
    d = {"root": {"l": (sway, 0, bob)},
         "hips": {"s": (k, k, squash), "r": [("y", roll), ("z", twist)]},
         "spine": {"s": (breath, breath, 1.0 + (breath - 1) * 0.5), "r": [("z", -0.4 * twist)]},
         "chest": {"r": [("x", lean), ("y", -0.5 * roll)]},
         "head": {"r": [("x", hx), ("z", hy), ("y", hz)]},
         "arm_L": {"r": [("x", -lu), ("y", -(lo - li))]}, "arm_R": {"r": [("x", -ru), ("y", (ro - ri))]},
         "hand_L": {"r": [("x", -lh)]}, "hand_R": {"r": [("x", -rh)]},
         "leg_L": {"r": [("x", -legs)]}, "leg_R": {"r": [("x", -legs)]},
         "foot_L": {"r": [("x", legs)]}, "foot_R": {"r": [("x", legs)]}}
    for i in range(4):
        ph = tail_phase - i * 0.55
        d[f"tail_{i + 1}"] = {"r": [("z", tail * (0.45 + 0.25 * i) * math.sin(ph)), ("y", tail_lift * math.sin(ph * 2 + 0.7) * (0.5 + 0.2 * i))]}
    return d


class Clip:
    def __init__(self, arm, name, frames, bones):
        self.arm, self.name, self.frames, self.bones = arm, name, frames, bones
        act = bpy.data.actions.new(name); act.use_fake_user = True
        arm.animation_data_create(); arm.animation_data.action = act
        self.act = act

    def key(self, f, spec):
        pose_bones(self.arm, spec)
        for pb in self.bones:
            for path in ("rotation_quaternion", "location", "scale"):
                pb.keyframe_insert(path, frame=f)

    def sample(self, fn):
        """fn(t in [0,1]) -> spec; frames+1 keys, the last equals the first for the loops (fn(1) == fn(0))."""
        for f in range(self.frames + 1):
            self.key(1 + f, fn(f / self.frames))


# clip -> seconds (same lengths as the old rig's clips; 30 fps)
CLIPS = {"idle": 4.0, "listen": 4.0, "encourage": 1.6, "excited": 1.2, "think": 4.0, "hop": 1.0,
         "nod_yes": 0.8, "almost": 1.8, "cheer": 2.0, "wave": 2.0}


def clip_fns():
    def idle(t):
        br = 0.5 - 0.5 * math.cos(TAU * t)
        glance = ease(seg(t, 0.40, 0.50)) * (1 - ease(seg(t, 0.72, 0.82)))
        return body(lean=0.9 * math.sin(TAU * t + 1.3), hx=1.8 * math.sin(TAU * t - 0.9) + 1.2 * glance, hz=1.2 * math.sin(TAU * t + 0.4) + 1.5 * glance,
                    hy=6.0 * glance, breath=1 + 0.03 * br, squash=1 - 0.008 * br, tail=11, tail_phase=TAU * t, tail_lift=2,
                    lo=2 + 2 * br, ro=2 + 2 * br, lu=0.5 * br, ru=0.5 * br, sway=0.004 * math.sin(TAU * t), roll=1.0 * math.sin(TAU * t))

    def listen(t):
        nod = max(0.0, math.sin(TAU * 2 * t)) ** 2
        return body(lean=7 + 1.5 * math.sin(TAU * t), hx=4 + 5 * nod, hz=10 + 2 * math.sin(TAU * t + 1), hy=-3 * math.sin(TAU * t),
                    breath=1 + 0.02 * (0.5 - 0.5 * math.cos(TAU * t)), tail=5, tail_phase=TAU * t, lo=3, ro=3, lu=4, ru=4)

    def encourage(t):
        p = (0.5 - 0.5 * math.cos(TAU * 2 * t)) ** 1.4
        pl = (0.5 - 0.5 * math.cos(TAU * 2 * t - 0.5)) ** 1.4
        return body(lean=9 + 5 * pl, hx=10 - 12 * pl, bob=0.012 * p, breath=1.02 + 0.02 * p, squash=1 - 0.02 * pl,
                    tail=16, tail_phase=TAU * 2 * t, lu=8 + 22 * p, ru=8 + 22 * p, lo=14 + 22 * p, ro=14 + 22 * p, legs=-2 * p)

    def excited(t):
        up = abs(math.sin(TAU * t)); contact = 1 - up; sw = math.sin(TAU * t)
        return body(bob=0.055 * up, squash=1 - 0.06 * contact ** 3 + 0.025 * up, hx=-4 * up + 3 * contact, hz=4.0 * sw, hy=3.0 * math.sin(TAU * t + 0.8),
                    tail=22, tail_phase=TAU * 3 * t - 0.6, tail_lift=6,
                    lu=14 + 18 * up + 12 * sw, ru=14 + 18 * up - 12 * sw, lo=30 + 22 * up + 6 * sw, ro=30 + 22 * up - 6 * sw, legs=-6 * up, roll=4 * sw, twist=3 * sw)

    def think(t):
        return body(hz=-11 - 3 * math.sin(TAU * t), hx=-4, hy=-4, breath=1 + 0.02 * (0.5 - 0.5 * math.cos(TAU * t)), tail=6, tail_phase=TAU * t,
                    ru=74 + 2 * math.sin(TAU * t), ri=26, rh=32 + 4 * math.sin(TAU * t + 1), lo=3, lean=2)

    def hop(t):
        h = math.sin(math.pi * t); contact = max(0.0, 1 - h * 3)
        return body(bob=0.13 * h, squash=1 + 0.05 * h - 0.08 * contact ** 2, hx=-5 * h + 4 * contact, lean=3 * h,
                    tail=16, tail_phase=TAU * t, lu=10 + 22 * h, ru=10 + 22 * h, lo=20 + 30 * h, ro=20 + 30 * h, legs=-10 * h)

    def nod_yes(t):
        n = max(0.0, math.sin(TAU * 2 * t)) * math.exp(-1.6 * t) * 15
        return body(hx=n, bob=-0.006 * n / 15, tail=12, tail_phase=TAU * 2 * t, lo=3 * (n / 15), ro=3 * (n / 15))

    def almost(t):
        s = damped(seg(t, 0.08, 0.8), 2.2, 3.2) * 14
        fold = ease(seg(t, 0.0, 0.15)) * (1 - ease(seg(t, 0.7, 1.0)))
        return body(hx=4 * fold, hy=s, hz=7 * fold, tail=10, tail_phase=TAU * 2 * t, lo=26 * fold, ro=26 * fold, lu=10 * fold, ru=10 * fold,
                    lh=18 * fold, rh=18 * fold, bob=0.012 * fold, breath=1 + 0.02 * fold)

    def cheer(t):
        if t < 0.12:
            a = ease(seg(t, 0, 0.12)); bob, sq, arms, hx = -0.025 * a, 1 - 0.07 * a, 8 * a, 7 * a
        elif t < 0.5:
            a = seg(t, 0.12, 0.5); h = math.sin(math.pi * a)
            bob, sq, arms, hx = 0.26 * h, 1 + 0.06 * (1 - a) * h, 8 + 64 * ease_out(min(1, a * 2)), -10 * h
        else:
            a = seg(t, 0.5, 1.0)
            bob = 0.035 * damped(a, 2.2, 5.0) - 0.02 * math.exp(-9 * a)
            sq = 1 - 0.09 * math.exp(-8 * a) * math.cos(TAU * 2.2 * a)
            arms = 72 * (1 - ease(seg(a, 0.35, 1.0))); hx = 6 * damped(a, 2.0, 4.0)
        out = max(0.0, min(1.0, arms / 45))
        return body(bob=bob, squash=sq, hx=hx, tail=24, tail_phase=TAU * 3 * t, tail_lift=6, lu=arms * 0.55, ru=arms * 0.55, lo=30 + 70 * out, ro=30 + 70 * out,
                    legs=-8 * max(0.0, bob) / 0.26)

    def wave(t):
        up = ease(seg(t, 0, 0.15)) * (1 - ease(seg(t, 0.82, 1.0)))
        w = math.sin(TAU * 3 * seg(t, 0.15, 0.82))
        d = body(hz=-7 * up, hx=-2 * up, tail=8, tail_phase=TAU * t, ro=4 + 118 * up, ru=22 * up, lo=2, hy=-6 * up)
        return merge(d, {"hand_R": {"r": [("y", 26 * w * up)]}})

    return dict(idle=idle, listen=listen, encourage=encourage, excited=excited, think=think, hop=hop,
                nod_yes=nod_yes, almost=almost, cheer=cheer, wave=wave)


def build_clips(arm):
    animated = [pb for pb in arm.pose.bones if not pb.name.startswith(SPRING_PREFIX)]
    for name, fn in clip_fns().items():
        Clip(arm, name, int(round(CLIPS[name] * FPS)), animated).sample(fn)
    arm.animation_data.action = bpy.data.actions["idle"]
    rest_pose(arm)


# ================================================================== export + verification
def export_glb(arm, ob, who):
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    path = os.path.join(OUT, f"{who}.glb")
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_animations=True,
              export_animation_mode="ACTIONS", export_apply=False, export_yup=True, export_skins=True,
              export_force_sampling=True, export_frame_step=1, export_extras=True, export_def_bones=False,
              export_optimize_animation_size=True, export_anim_slide_to_zero=True,
              export_image_format="JPEG", export_jpeg_quality=90, export_materials="EXPORT",
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
              export_draco_position_quantization=14, export_draco_normal_quantization=10,
              export_draco_texcoord_quantization=12, export_draco_generic_quantization=12)
    bpy.ops.export_scene.gltf(**kw)
    return path


def who_prefix(path):
    return os.path.splitext(os.path.basename(path))[0] + "_"


def read_glb_json(path):
    d = open(path, "rb").read()
    n = struct.unpack("<I", d[12:16])[0]
    return json.loads(d[20:20 + n])


def clear_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    for blk in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for x in list(blk): blk.remove(x)


def import_exported(path):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=path)
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    # the importer also makes a 42-vertex "Icosphere" bone-shape helper: the skin is the biggest mesh
    ob = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    return arm, ob


def verify_export(path, spec_names):
    """re-import the exported GLB and measure what a runtime would see."""
    j = read_glb_json(path)
    arm, ob = import_exported(path)
    me = ob.data
    gname = {g.index: g.name for g in ob.vertex_groups}
    nv = len(me.vertices)
    sums = np.zeros(nv); ninf = np.zeros(nv, dtype=int); used = set()
    for v in me.vertices:
        for g in v.groups:
            if g.weight > 1e-6:
                sums[v.index] += g.weight; ninf[v.index] += 1; used.add(gname[g.group])
    node_names = {n.get("name") for n in j["nodes"]}
    extras = [n for n in j["nodes"] if "extras" in n and "spring_tails" in n["extras"]]
    anims = {a["name"]: len(a["channels"]) for a in j.get("animations", [])}
    dur = {}
    for a in j.get("animations", []):
        acc = j["accessors"][a["samplers"][0]["input"]]
        dur[a["name"]] = round(acc["max"][0], 4)
    mats = [(m.get("name"), m["pbrMetallicRoughness"].get("roughnessFactor"), m["pbrMetallicRoughness"].get("metallicFactor")) for m in j["materials"]]
    # hierarchy vs the OLD rig (face bones excluded)
    def parents(jj):
        par = {}
        for i, n in enumerate(jj["nodes"]):
            for c in n.get("children", []): par[jj["nodes"][c]["name"]] = n["name"]
        return par
    new_par = parents(j)
    try:
        old_par = parents(read_glb_json(os.path.join(REPO, "public", "models", "mascots", "chora.glb")))
        skip = re.compile(r"^(h?eye_|brow_|mouth_|blush_|tear|sweat|chora_)")
        old_names = [n for n in old_par if not skip.match(n) and n != "chora"]
        hier_bad = [n for n in old_names if new_par.get(n) != old_par[n]]
        hier = dict(old_bones_checked=len(old_names), mismatches=hier_bad, new_bones=sorted(n for n in new_par if n not in old_par and not n.startswith(who_prefix(path))))
    except Exception as ex:
        hier = dict(error=str(ex))
    ident = {}
    for n in j["nodes"]:
        if n.get("name") in ("root", "hips", "spine", "chest", "head"):
            r = n.get("rotation", [0, 0, 0, 1])
            ident[n["name"]] = round(float(max(abs(r[0]), abs(r[1]), abs(r[2]), abs(1 - abs(r[3])))), 7)
    return dict(hierarchy_vs_old=hier, torso_rest_rotation_deviation=ident, verts=nv, tris=len(me.polygons), unweighted=int((ninf == 0).sum()), max_influences=int(ninf.max()),
                weight_sum_min=float(sums.min()), weight_sum_max=float(sums.max()),
                influence_hist={int(k): int(v) for k, v in zip(*np.unique(ninf, return_counts=True))},
                bones_in_gltf=sorted(n for n in spec_names if n in node_names), bones_missing=sorted(n for n in spec_names if n not in node_names),
                groups_used=len(used), extras_spring_tails=(len(extras[0]["extras"]["spring_tails"]) if extras else 0),
                clips=anims, clip_seconds=dur, materials=mats, draco="KHR_draco_mesh_compression" in j.get("extensionsUsed", []),
                scene_root=j["nodes"][j["scenes"][0]["nodes"][0]].get("name"), size_bytes=os.path.getsize(path))


# ================================================================== review renders (re-imports the EXPORTED glb)
def _rv_scene(res):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    try: sc.eevee.taa_render_samples = 24
    except Exception: pass
    sc.render.resolution_x = res; sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("rvw"); w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.80, 0.80, 0.84, 1); bg.inputs[1].default_value = 0.9
    sc.world = w
    for nm, rot, en in (("key", (0.9, 0.2, 0.6), 3.0), ("fill", (1.1, -0.3, -2.2), 1.2), ("rim", (2.2, 0.1, 3.4), 1.4)):
        ld = bpy.data.lights.new(nm, "SUN"); ld.energy = en
        lo = bpy.data.objects.new(nm, ld); sc.collection.objects.link(lo); lo.rotation_euler = rot
    cd = bpy.data.cameras.new("rvcam"); cd.lens = 70
    cam = bpy.data.objects.new("rvcam", cd); sc.collection.objects.link(cam); sc.camera = cam
    return cam


def _rv_cam(cam, view, centre=(0, 0, 0.58), dist=3.3):
    dirs = {"front": (0, -1, 0), "back": (0, 1, 0), "side": (1, 0, 0), "sideR": (-1, 0, 0),
            "q3": (0.62, -0.74, 0.26), "q3b": (0.62, 0.74, 0.30), "q3R": (-0.62, -0.74, 0.26), "top": (0, -0.25, 1)}
    d = Vector(dirs[view]).normalized()
    cam.location = Vector(centre) + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()


def _rv_shot(cam, view, path, centre=(0, 0, 0.58), dist=3.3):
    _rv_cam(cam, view, centre, dist)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    return Image.open(path).convert("RGB")


def _wrot_ext(arm, bname, rots):
    """like wrot, but axes 'lx','ly','lz' rotate about the bone's OWN axes (used for the fin bend tests)."""
    q = Quaternion(); loc = Quaternion()
    for ax, deg in rots:
        if ax[0] == "l": loc = loc @ Quaternion(AX[ax[1]], math.radians(deg))
        else: q = Quaternion(AX[ax], math.radians(deg)) @ q
    B = arm.data.bones[bname].matrix_local.to_quaternion()
    return B.inverted() @ q @ B @ loc


def _rv_pose(arm, spec):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        s = spec.get(pb.name, {})
        pb.rotation_quaternion = _wrot_ext(arm, pb.name, s.get("r", []))
        pb.location = wloc(arm, pb.name, s.get("l", (0, 0, 0)))
        sc = s.get("s", 1.0)
        pb.scale = (sc, sc, sc) if isinstance(sc, (int, float)) else sc
    bpy.context.view_layer.update()


def _rv_positions(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    a = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", a)
    ev.to_mesh_clear()
    return a.reshape(-1, 3)


def _rv_label(im, text, sub=None):
    from PIL import ImageDraw
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, im.width, 15], fill=(255, 255, 255))
    d.text((4, 2), text + (f"   {sub}" if sub else ""), fill=(0, 0, 0))
    return im


def _rv_sheet(cells, cols, path, cell):
    from PIL import Image
    rows = (len(cells) + cols - 1) // cols
    sh = Image.new("RGB", (cols * cell, rows * cell), (205, 205, 214))
    for i, im in enumerate(cells):
        sh.paste(im.resize((cell, cell)), ((i % cols) * cell, (i // cols) * cell))
    sh.save(path)


def review(who, glb, info):
    from PIL import Image
    os.makedirs(REVIEW, exist_ok=True)
    arm, ob = import_exported(glb)
    arm.animation_data_create()
    for t in list(arm.animation_data.nla_tracks): t.mute = True
    arm.animation_data.action = None
    cell = 400
    cam = _rv_scene(cell)
    tmp = os.path.join(REVIEW, f"_tmp_{who}.png")
    rest_pose(arm)
    P0 = _rv_positions(ob)
    me = ob.data
    E = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", E); E = E.reshape(-1, 2)
    L0 = np.linalg.norm(P0[E[:, 0]] - P0[E[:, 1]], axis=1)
    okE = L0 > 1e-4
    stats = {}

    def measure(label):
        P = _rv_positions(ob)
        r = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1)[okE] / L0[okE]
        stats[label] = dict(max_stretch=round(float(r.max()), 3), p999_stretch=round(float(np.percentile(r, 99.9)), 3),
                            min_compress=round(float(r.min()), 3), edges_over_1p5=int((r > 1.5).sum()),
                            max_vertex_move=round(float(np.linalg.norm(P - P0, axis=1).max()), 3))
        s = stats[label]
        return f"stretch max {s['max_stretch']:.2f}  >1.5x: {s['edges_over_1p5']}"

    # ---- rest turnaround
    cells = [_rv_label(_rv_shot(cam, v, tmp), f"{who} rest {v}") for v in ("front", "side", "q3", "q3b", "back")]
    _rv_sheet(cells, 5, os.path.join(REVIEW, f"{who}_rest.png"), cell)

    # ---- test poses ------------------------------------------------------------------------------------------------
    def fins_local(axis, deg, both=True):
        d = {}
        for b in arm.pose.bones:
            if b.name.startswith("fin_") and (b.name.endswith("_0") or (both and b.name.endswith("_1"))) and not b.name.startswith(("fin_b05",)):
                d[b.name] = {"r": [(axis, deg)]}
        return d
    def horns_local(axis, deg):
        return {b.name: {"r": [(axis, deg)]} for b in arm.pose.bones if b.name.startswith("horn_")}
    def tails(deg):
        return {f"tail_{i + 1}": {"r": [("z", deg * (0.7 + 0.2 * i))]} for i in range(4)}
    groups = {
        "limbs": [
            ("arm_L raised 90", {"arm_L": {"r": [("y", -90)]}}, ("front", "q3")),
            ("arm_L raised 150", {"arm_L": {"r": [("y", -150)]}}, ("front", "q3")),
            ("both arms overhead", {"arm_L": {"r": [("y", -165)]}, "arm_R": {"r": [("y", 165)]}}, ("front", "back")),
            ("hand_R wave", {"arm_R": {"r": [("y", 100)]}, "hand_R": {"r": [("y", 40)]}}, ("front", "q3R")),
            ("arms forward 90", {"arm_L": {"r": [("x", -90)]}, "arm_R": {"r": [("x", -90)]}}, ("front", "side")),
            ("leg_L fwd 40, leg_R back 30", {"leg_L": {"r": [("x", -40)]}, "leg_R": {"r": [("x", 30)]}}, ("front", "side")),
            ("deep squat", {"root": {"l": (0, 0, -0.07)}, "hips": {"r": [("x", 12)]}, "leg_L": {"r": [("x", -42)]}, "leg_R": {"r": [("x", -42)]},
                            "foot_L": {"r": [("x", 42)]}, "foot_R": {"r": [("x", 42)]}, "chest": {"r": [("x", 10)]}}, ("front", "side")),
        ],
        "torso": [
            ("head tilt 25", {"head": {"r": [("y", 25)]}}, ("front", "q3")),
            ("head turn 30", {"head": {"r": [("z", 30)]}}, ("front", "q3")),
            ("head nod 20", {"head": {"r": [("x", 20)]}}, ("side", "q3")),
            ("head back 20", {"head": {"r": [("x", -20)]}}, ("side", "q3")),
            ("hips yaw 40 + spine twist", {"hips": {"r": [("z", 40)]}, "spine": {"r": [("z", -15)]}, "chest": {"r": [("z", -10)]}}, ("front", "q3")),
            ("chest lean 30", {"chest": {"r": [("x", 30)]}, "spine": {"r": [("x", 10)]}}, ("side", "q3")),
        ],
        "tail_fins": [
            ("tail +35", tails(35), ("back", "q3b")),
            ("tail -35", tails(-35), ("back", "q3b")),
            ("fins bend +25 (local X)", merge(fins_local("lx", 25)), ("front", "q3b")),
            ("fins bend -25 (local X)", merge(fins_local("lx", -25)), ("front", "q3b")),
            ("fins bend +25 (local Z)", merge(fins_local("lz", 25)), ("front", "q3b")),
            ("fins bend -25 (local Z)", merge(fins_local("lz", -25)), ("front", "q3b")),
            ("horns tilt +20 / -20 (X, Z)", merge(horns_local("lx", 20), horns_local("lz", -20)), ("front", "side")),
            ("head chain (_0 only) +25 X", merge(fins_local("lx", 25, False)), ("side", "q3b")),
        ],
    }
    for gname, poses in groups.items():
        cells = []
        for label, spec, views in poses:
            _rv_pose(arm, spec)
            sub = measure(label)
            for v in views:
                cells.append(_rv_label(_rv_shot(cam, v, tmp), f"{label} [{v}]", sub if v == views[0] else None))
        _rv_sheet(cells, 4, os.path.join(REVIEW, f"{who}_poses_{gname}.png"), cell)
    rest_pose(arm)

    # ---- clips: five samples through each, plus loop-closure measurement ------------------------------------------
    sc = bpy.context.scene
    acts = {a.name.split("|")[-1]: a for a in bpy.data.actions}
    clip_cells = []
    loop_gap = {}
    for name, sec in CLIPS.items():
        a = acts.get(name)
        if a is None: continue
        arm.animation_data_create(); arm.animation_data.action = a
        n = int(round(sec * FPS))
        f0 = int(round(a.frame_range[0]))
        sc.frame_set(f0); Pa = _rv_positions(ob)
        sc.frame_set(f0 + n); Pb = _rv_positions(ob)
        loop_gap[name] = round(float(np.linalg.norm(Pa - Pb, axis=1).max()), 4)
        row = []
        for fr in (0.0, 0.2, 0.4, 0.6, 0.8):
            sc.frame_set(f0 + int(round(fr * n)))
            row.append(_rv_label(_rv_shot(cam, "q3", tmp), f"{name} {int(fr * 100)}%"))
        clip_cells.append(row)
    for k, grp in enumerate((clip_cells[:5], clip_cells[5:])):
        cells = [im for row in grp for im in row]
        _rv_sheet(cells, 5, os.path.join(REVIEW, f"{who}_clips_{k + 1}.png"), 300)
    os.remove(tmp)
    info["review_stats"] = stats
    info["loop_gap"] = loop_gap
    json.dump(dict(pose_edge_stretch=stats, clip_first_last_frame_max_vertex_gap_m=loop_gap),
              open(os.path.join(REVIEW, f"{who}_numeric_checks.json"), "w"), indent=1)
    print(who, "review: worst edge stretch", max(v["max_stretch"] for v in stats.values()), "loop gaps", loop_gap)


# ================================================================== build one character
def build(who):
    cfg = CHARS[who]
    reset()
    ob, V, col, scale = import_and_normalise(who)
    geo = Geo(ob, V, col)
    chains = fit_chains(geo, cfg)
    spec = skeleton_spec(cfg, chains)
    arm = make_armature(who, cfg, spec, chains)
    heat = heat_core_weights(geo, arm)
    names, Wf, core = build_weights(geo, cfg, chains, spec, heat, who)
    inv_new, forced, _lab = cut_creases(ob, geo, core)
    full = forced_rows(Wf[inv_new], forced, names)
    Wv = finalise_weights(full)
    bind_skin(ob, arm, names, Wv)
    tidy_material(ob, who)
    build_clips(arm)
    path = export_glb(arm, ob, who)
    info = dict(who=who, scale_applied=round(scale, 6), spec=spec, chains=chains, names=names, Wv=Wv, geo_nw=geo.nw)
    return path, info


def report_entry(who, info, check):
    spec = info["spec"]
    return dict(
        source=f"docs/kaiju-fidelity/magnific/i23d/{who}_blank_meshy71.glb", scale_applied=info["scale_applied"],
        height_m=TARGET_H, vertex_count=check["verts"], triangle_count=check["tris"], max_influences=check["max_influences"],
        unweighted_vertices=check["unweighted"], weight_sum_range=[round(check["weight_sum_min"], 6), round(check["weight_sum_max"], 6)],
        influence_histogram=check["influence_hist"], glb_bytes=check["size_bytes"], draco=check["draco"], materials=check["materials"],
        clips=check["clip_seconds"], clip_channels=check["clips"], spring_tails_entries=check["extras_spring_tails"],
        hierarchy_vs_old=check["hierarchy_vs_old"], torso_rest_rotation_deviation=check["torso_rest_rotation_deviation"],
        bones=[dict(name=n, parent=p, head=[round(float(c), 5) for c in h], tail=[round(float(c), 5) for c in t]) for n, h, t, p, _c, _u in spec],
        bones_missing_in_gltf=check["bones_missing"])


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    who_list = ["chora", "reello"] if (not args or args[0] == "both") else [args[0]]
    do_review = "--review" in argv or "--review-only" in argv
    review_only = "--review-only" in argv
    rpt_path = os.path.join(OUT, "rig_report.json")
    try: report = json.load(open(rpt_path))
    except Exception: report = {}
    for who in who_list:
        if review_only:
            review(who, os.path.join(OUT, f"{who}.glb"), {})
            continue
        path, info = build(who)
        check = verify_export(path, [n for n, *_ in info["spec"]])
        print(who, "->", path, check["size_bytes"], "bytes;", check["verts"], "verts; max influences", check["max_influences"],
              "; unweighted", check["unweighted"], "; weight sums", check["weight_sum_min"], check["weight_sum_max"])
        report[who] = report_entry(who, info, check)
        if do_review:
            review(who, path, info)
    if not review_only:
        os.makedirs(OUT, exist_ok=True)
        json.dump(report, open(rpt_path, "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1:])
