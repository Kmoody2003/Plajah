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
import bpy, bmesh, os, sys, json, math, struct
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
