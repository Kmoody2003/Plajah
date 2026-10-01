"""
Chora + Reello 3D mascots — v2 high-fidelity base models, rig, animation library and props (Blender / bpy).

Built to match the turnaround sheet:
  * ONE continuous "vinyl toy" skin (head + body + legs + tail) sculpted as a signed-distance field with
    smooth unions, meshed with surface nets, relaxed and decimated. Arms are separate (toy-style shoulder seam).
  * The head is a HOOD: coloured cap + a slightly recessed white face, a V that drops to a navy forehead gem,
    bandit-mask eye patches under thick angry brows, features sitting low on a big forehead.
  * Fins (spike fan, dorsal row, tail) are thick soft-edged petals, each on its own 2-bone chain so the
    runtime can drive them with spring physics (firm like a shark/dolphin fin). Horns are separate, stiffer.
  * Shading data for the web shader: vertex colour = base paint, `_fx` = (spot density, light-spot density,
    fur amount). Grain, speckle and fur are procedural in the fragment shader (mascotRuntime.ts).
  * NO props in the character. Props export separately to public/models/mascots/props/*.glb and attach to
    the `prop` socket bone (two-handed hold, keyed to the lap in clips where both hands are busy) or `hand_R`.

Clips (every non-physics bone keyed on every key; fin/horn bones are left to the runtime springs):
  loops  : idle, listen, encourage, excited, think, hop
  one-shots: nod_yes, almost, cheer, wave

Run:  python scripts/blender/build_mascots.py        (pip bpy module)
Env:  MASCOT_PREVIEW=<dir>  → also save .blend + Cycles review renders there.
      MASCOT_ONLY=chora|reello|props → build just one.
"""
import os, sys, math, random, traceback
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "models", "mascots")
OUT_PROPS = os.path.join(OUT, "props")
os.makedirs(OUT_PROPS, exist_ok=True)
PREVIEW = os.environ.get("MASCOT_PREVIEW")
FPS = 30
VOX = float(os.environ.get("MASCOT_VOXEL", "0.0045"))

# ================================================================== colour
def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])

def lin(c):
    c = np.asarray(c, dtype=float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def mix(a, b, t):
    t = np.clip(t, 0.0, 1.0); return a + (b - a) * t

def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3 - 2 * t)

PAL = {
    'chora': dict(
        hood=hexc('#5b49aa'), hood_top=hexc('#2a2c6a'), hood_edge=hexc('#a81c84'),
        face=hexc('#eae9f0'), face_shade=hexc('#c4c0d6'), chin=hexc('#f3c09a'),
        patch=hexc('#7a66c8'), patch_in=hexc('#8876d2'),
        body=hexc('#5847a4'), body_low=hexc('#ab1b80'), foot=hexc('#b82486'), hand=hexc('#bb1f84'),
        belly=hexc('#c8187f'), belly_ridge=hexc('#9d0f69'), mark=hexc('#f39a45'), mark2=hexc('#f8b860'),
        claw=hexc('#f4f1f7'), blush=hexc('#b3aee4'), gem=hexc('#1c2a4c'),
        shard_dark=hexc('#1d2850'), shard_lite=hexc('#9285d3'), spine=hexc('#d33595'),
        dorsal_base=hexc('#b3187f'), dorsal_tip=hexc('#e2489a')),
    'reello': dict(
        hood=hexc('#2c3f86'), hood_top=hexc('#15234a'), hood_edge=hexc('#8f1f70'),
        face=hexc('#eceaf0'), face_shade=hexc('#c8c4d6'), chin=hexc('#f59a5e'),
        patch=hexc('#f2621c'), patch_in=hexc('#f7803a'),
        body=hexc('#19274c'), body_low=hexc('#b82467'), foot=hexc('#ea7a32'), hand=hexc('#c63068'),
        belly=hexc('#ef7426'), belly_ridge=hexc('#f6a04c'), mark=hexc('#fff4e6'), mark2=hexc('#f59a3a'),
        claw=hexc('#f8d2b4'), blush=hexc('#f0a0b4'), gem=hexc('#131f3f'),
        shard_dark=hexc('#0e1733'), shard_lite=hexc('#5570b8'), spine=hexc('#f07a2c'),
        dorsal_base=hexc('#e35d25'), dorsal_tip=hexc('#f7a55a')),
}
FAN_ORANGE, FAN_MAGENTA, FAN_TIP_O, FAN_TIP_M = hexc('#ef7532'), hexc('#c4177f'), hexc('#f79a55'), hexc('#e0479b')
HORN_TIP, HORN_BASE = hexc('#141d38'), hexc('#2a3c70')
INK, WHITE = hexc('#0b0a10'), hexc('#ffffff')
MOUTH_IN, TONGUE = hexc('#4a0f22'), hexc('#ef6f8f')

# ================================================================== SDF toolkit (numpy)
def sd_ellipsoid(X, Y, Z, c, r):
    px, py, pz = (X - c[0]) / r[0], (Y - c[1]) / r[1], (Z - c[2]) / r[2]
    k0 = np.sqrt(px * px + py * py + pz * pz)
    k1 = np.sqrt((px / r[0]) ** 2 + (py / r[1]) ** 2 + (pz / r[2]) ** 2)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)

def sd_round_cone(X, Y, Z, a, b, r1, r2):
    """iq's round cone between points a,b with radii r1,r2."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a; l2 = ba @ ba; rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1.0 / l2
    pax, pay, paz = X - a[0], Y - a[1], Z - a[2]
    y = pax * ba[0] + pay * ba[1] + paz * ba[2]
    z = y - l2
    xx = (pax * l2 - ba[0] * y) ** 2 + (pay * l2 - ba[1] * y) ** 2 + (paz * l2 - ba[2] * y) ** 2
    y2 = y * y * l2; z2 = z * z * l2
    k = np.sign(rr) * rr * rr * xx
    d1 = np.sqrt(xx + z2) * il2 - r2
    d2 = np.sqrt(xx + y2) * il2 - r1
    d3 = (np.sqrt(xx * a2 * il2) + y * rr) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)

def smax(a, b, k):
    return -smin(-a, -b, k)

def grid(lo, hi, h):
    xs = np.arange(lo[0], hi[0] + h, h, dtype=np.float32)
    ys = np.arange(lo[1], hi[1] + h, h, dtype=np.float32)
    zs = np.arange(lo[2], hi[2] + h, h, dtype=np.float32)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
    return X, Y, Z, np.array([xs[0], ys[0], zs[0]], dtype=np.float64)

def surface_nets(F, origin, h):
    """Naive surface nets → (verts Nx3, quads Mx4). Fully vectorised."""
    F = F.astype(np.float32); inside = F < 0
    cs = tuple(n - 1 for n in F.shape); N = cs[0] * cs[1] * cs[2]
    sx = np.zeros(N); sy = np.zeros(N); sz = np.zeros(N); cnt = np.zeros(N)
    edges = []
    for axis in range(3):
        sl_a = [slice(None)] * 3; sl_b = [slice(None)] * 3
        sl_a[axis] = slice(0, -1); sl_b[axis] = slice(1, None)
        A = F[tuple(sl_a)]; B = F[tuple(sl_b)]
        idx = np.nonzero(inside[tuple(sl_a)] != inside[tuple(sl_b)])
        a, b = A[idx], B[idx]
        t = a / (a - b)
        P = np.stack(idx, 1).astype(np.float64); P[:, axis] += t
        others = [d for d in range(3) if d != axis]
        cells = []
        for d1 in (0, 1):
            for d2 in (0, 1):
                c = [idx[0].copy(), idx[1].copy(), idx[2].copy()]
                c[others[0]] -= d1; c[others[1]] -= d2
                ok = (c[0] >= 0) & (c[1] >= 0) & (c[2] >= 0) & (c[0] < cs[0]) & (c[1] < cs[1]) & (c[2] < cs[2])
                flat = np.full(len(a), -1, dtype=np.int64)
                flat[ok] = np.ravel_multi_index((c[0][ok], c[1][ok], c[2][ok]), cs)
                cells.append(flat)
                f = flat[ok]
                sx += np.bincount(f, weights=P[ok, 0], minlength=N); sy += np.bincount(f, weights=P[ok, 1], minlength=N)
                sz += np.bincount(f, weights=P[ok, 2], minlength=N); cnt += np.bincount(f, minlength=N)
        edges.append((cells, a < 0))
    used = cnt > 0
    vid = np.full(N, -1, dtype=np.int64); vid[used] = np.arange(used.sum())
    verts = np.stack([sx[used], sy[used], sz[used]], 1) / cnt[used][:, None] * h + origin
    quads = []
    for cells, flip in edges:
        c00, c01, c10, c11 = cells     # (d1,d2) = (0,0),(0,1),(1,0),(1,1)
        ok = (c00 >= 0) & (c01 >= 0) & (c10 >= 0) & (c11 >= 0)
        q = np.stack([vid[c00[ok]], vid[c10[ok]], vid[c11[ok]], vid[c01[ok]]], 1)
        fl = flip[ok]; q[fl] = q[fl][:, ::-1]
        quads.append(q)
    return verts, np.concatenate(quads, 0)

# ================================================================== blender helpers
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS

def link(ob):
    bpy.context.scene.collection.objects.link(ob); return ob

def mesh_obj(name, verts, faces, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(int(i) for i in f) for f in faces])
    me.validate(); me.update()
    ob = link(bpy.data.objects.new(name, me))
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    if smooth: me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.update()
    return ob

def relax(ob, iters=3, lam=0.6):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for _ in range(iters):
        bmesh.ops.smooth_laplacian_vert(bm, verts=bm.verts[:], lambda_factor=lam, lambda_border=0.0,
                                        use_x=True, use_y=True, use_z=True, preserve_volume=True)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()

def decimate(ob, target_faces):
    n = len(ob.data.polygons)
    if n <= target_faces: return
    m = ob.modifiers.new("dec", 'DECIMATE'); m.ratio = target_faces / n; m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)
    ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))

def sdf_mesh(name, sdf_fn, lo, hi, h, faces_target, relax_iters=3):
    X, Y, Z, origin = grid(lo, hi, h)
    F = sdf_fn(X, Y, Z)
    v, q = surface_nets(F, origin, h)
    del X, Y, Z, F
    ob = mesh_obj(name, v, q)
    relax(ob, relax_iters)
    decimate(ob, faces_target)
    return ob

def basis_to(d, up):
    z = Vector(d).normalized(); x = z.cross(Vector(up))
    if x.length < 1e-4: x = z.cross(Vector((1, 0, 0)))
    x.normalize(); y = z.cross(x)
    return Matrix((x, y, z)).transposed()

def world_bvh(obs):
    vs, fs, off = [], [], 0
    for ob in obs:
        mw = ob.matrix_world
        vs += [mw @ v.co for v in ob.data.vertices]
        fs += [tuple(i + off for i in p.vertices) for p in ob.data.polygons]
        off += len(ob.data.vertices)
    return BVHTree.FromPolygons(vs, fs)

def verts_np(ob):
    a = np.zeros(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)

def normals_np(ob):
    a = np.zeros(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("normal", a)
    return a.reshape(-1, 3)

def set_verts_np(ob, V):
    ob.data.vertices.foreach_set("co", V.reshape(-1)); ob.data.update()

def paint_np(ob, cols, fx=None):
    """cols: Nx3 sRGB → FLOAT_COLOR 'Col' (linear). fx: Nx3 → '_fx' FLOAT_VECTOR for the web shader."""
    me = ob.data; n = len(me.vertices)
    c = np.ones((n, 4)); c[:, :3] = lin(np.clip(cols, 0, 1))
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set("color", c.reshape(-1))
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find("Col")
    except Exception: pass
    fxa = me.attributes.get("_fx") or me.attributes.new("_fx", 'FLOAT_VECTOR', 'POINT')
    f = np.zeros((n, 3)) if fx is None else np.asarray(fx, float)
    fxa.data.foreach_set("vector", f.reshape(-1))

def paint_flat(ob, col, fx=(0, 0, 0)):
    n = len(ob.data.vertices)
    paint_np(ob, np.tile(col, (n, 1)), np.tile(np.asarray(fx, float), (n, 1)))

def make_mat(name, rough, coat=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = "Col"
    nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    for key, val in (('Coat Weight', coat), ('Sheen Weight', sheen)):
        if key in bsdf.inputs: bsdf.inputs[key].default_value = val
    return m

def set_mat(ob, m):
    ob.data.materials.clear(); ob.data.materials.append(m)

def join(obs, name):
    obs = [o for o in obs if o is not None]
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name
    return o

# ---- decals: 2D outline in a surface tangent plane, projected onto the surface
def decal(name, outline, bvh, origin, direction, lift=0.003, depth=0.006, up=Vector((0, 0, 1)), rot=0.0, fill_rings=2):
    """outline: (a,b) metres in the plane ⟂ direction; a → right (= direction × up), b → up.
    Filled with concentric rings so it conforms to curved surfaces."""
    d = Vector(direction).normalized()
    right = d.cross(Vector(up)); right = right.normalized() if right.length > 1e-4 else Vector((1, 0, 0))
    upv = right.cross(d).normalized()
    c, s = math.cos(rot), math.sin(rot)
    cx = sum(p[0] for p in outline) / len(outline); cy = sum(p[1] for p in outline) / len(outline)
    rings = []
    for r in range(fill_rings + 1):
        k = 1.0 - r / (fill_rings + 1)
        rings.append([(cx + (a - cx) * k, cy + (b - cy) * k) for a, b in outline])
    def project(a, b):
        a2, b2 = a * c - b * s, a * s + b * c
        o = Vector(origin) + right * a2 + upv * b2 - d * 1.5
        hit, nrm, _, _ = bvh.ray_cast(o, d)
        if hit is None: return o + d * 1.5, -d
        return hit, nrm.normalized()
    bm = bmesh.new(); top_rings, bot_rings = [], []
    for ring in rings:
        tr, br = [], []
        for a, b in ring:
            hit, n = project(a, b)
            tr.append(bm.verts.new(hit + n * (lift + depth * 0.5)))
            br.append(bm.verts.new(hit - n * depth))
        top_rings.append(tr); bot_rings.append(br)
    hit, n = project(cx, cy)
    ct = bm.verts.new(hit + n * (lift + depth * 0.5)); cb = bm.verts.new(hit - n * depth)
    k = len(outline)
    for R, rev in ((top_rings, False), (bot_rings, True)):
        for i in range(len(R) - 1):
            for j in range(k):
                q = (R[i][j], R[i][(j + 1) % k], R[i + 1][(j + 1) % k], R[i + 1][j])
                bm.faces.new(q[::-1] if rev else q)
        cen = ct if not rev else cb
        for j in range(k):
            t = (R[-1][j], R[-1][(j + 1) % k], cen)
            bm.faces.new(t[::-1] if rev else t)
    for j in range(k):
        bm.faces.new((top_rings[0][j], bot_rings[0][j], bot_rings[0][(j + 1) % k], top_rings[0][(j + 1) % k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return link(bpy.data.objects.new(name, me))

def ellipse(rx, ry, n=32, cx=0.0, cy=0.0, rot=0.0):
    c, s = math.cos(rot), math.sin(rot); out = []
    for i in range(n):
        a = 2 * math.pi * i / n; x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cx + x * c - y * s, cy + x * s + y * c))
    return out

def stroke(poly, w0, w1=None):
    w1 = w0 if w1 is None else w1; L, R = [], []; n = len(poly)
    for i, (x, y) in enumerate(poly):
        a = poly[max(i - 1, 0)]; b = poly[min(i + 1, n - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, ty) or 1
        nx, ny = -ty / l, tx / l; w = (w0 + (w1 - w0) * i / (n - 1)) / 2
        L.append((x + nx * w, y + ny * w)); R.append((x - nx * w, y - ny * w))
    return L + R[::-1]

def arc(cx, cy, rx, ry, a0, a1, n=16):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / (n - 1)), cy + ry * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]

# ---- fins / horns: thick soft petal SDF on a local grid, bent, placed in the world
def petal(name, base, direction, length, width, thick, up, bend=0.0, sweep=0.0, tip=0.12, h=0.0028, faces=900, sharp=1.0, profile='tri', flat=False):
    """Petal along local +Z. Cross-section = rounded lens (width × thick) tapering to a soft tip.
    bend curls the tip toward local +Y (thickness axis); sweep curls it sideways (local +X)."""
    M = basis_to(direction, up)
    def f(X, Y, Z):
        v = np.clip(Z / length, 0.0, 1.0)
        Xb = X - sweep * length * v * v
        Yb = Y - bend * length * v * v
        if profile == 'leaf':      # broad petal: full most of its length, rounding off to a soft tip
            a = width * 0.5 * np.maximum(1.0 - v ** 1.35, 0.0) ** 0.72 + width * 0.5 * tip * 0.3
            b = thick * 0.5 * np.maximum(1.0 - v ** 1.6, 0.0) ** 0.6 + thick * 0.5 * tip * 0.4
        elif profile == 'blade':   # kaiju plate: broad convex blade, firm but softened tip
            a = width * 0.5 * np.maximum(1.0 - v, 0.0) ** 0.62 * (1.0 + 0.18 * np.sin(np.pi * v)) + width * 0.5 * tip * 0.3
            b = thick * 0.5 * np.maximum(1.0 - v ** 1.3, 0.0) ** 0.6 + thick * 0.5 * tip * 0.4
        else:                      # shark-tooth: convex sides to a firm point
            a = width * 0.5 * (1.0 - v) ** (0.85 * sharp) + width * 0.5 * tip * 0.35
            b = thick * 0.5 * (1.0 - v) ** 0.6 + thick * 0.5 * tip * 0.4
        e = np.sqrt((Xb / a) ** 2 + (Yb / b) ** 2) - 1.0
        d = e * np.minimum(a, b)
        return smax(smax(d, -Z, 0.01), Z - length, 0.012 * (1 + tip))
    pad = max(width, thick) * 0.6 + abs(bend) * length + abs(sweep) * length + 0.02
    X, Y, Z, origin = grid((-pad, -pad, -0.02), (pad, pad, length + 0.02), h)
    v, q = surface_nets(f(X, Y, Z), origin, h)
    del X, Y, Z
    Mn = np.array(M); B = np.array(base, dtype=float)
    ob = mesh_obj(name, v @ Mn.T + B, q)
    relax(ob, 2, 0.5)
    decimate(ob, faces)
    if flat: ob.data.polygons.foreach_set("use_smooth", [False] * len(ob.data.polygons))
    pts = []
    for t in (0.0, 0.5, 1.0):
        lp = Vector((sweep * length * t * t, bend * length * t * t, length * t))
        pts.append(Vector(base) + M @ lp)
    return ob, pts, M

# ================================================================== the character
HEAD_C = np.array([0.0, 0.02, 0.70]); HEAD_R = np.array([0.335, 0.28, 0.29])
GEM_V = -0.12                                   # chevron tip / forehead gem (head-normalised v)
CHEV = 0.8                                      # chevron slope: white runs up the temples toward the horns
EYE = (0.116, 0.584); EYE_R = (0.046, 0.057)

def head_uvw(P):
    return (P[:, 0] - HEAD_C[0]) / HEAD_R[0], (P[:, 2] - HEAD_C[2]) / HEAD_R[2], (P[:, 1] - HEAD_C[1]) / HEAD_R[1]

def face_masks(P):
    """(face, patch, cap) in [0,1]. The cap covers the top/back of the head and comes down the front as a big
    chevron whose tip is the forehead gem; the white face wraps the whole front and the cheeks."""
    u, v, w = head_uvw(P); au = np.abs(u)
    front = sstep(0.38, 0.05, w)
    cap_line = GEM_V + CHEV * au
    face = sstep(0.018, -0.018, v - cap_line) * front
    # goggle patches: top edge runs parallel under the chevron; rounded below and outside
    top = GEM_V - 0.075 + CHEV * np.maximum(au - 0.07, 0.0)
    pu, pv = (au - 0.47) / 0.4, (v + 0.3) / 0.42
    patch = sstep(1.06, 0.94, pu * pu + pv * pv) * sstep(0.014, -0.014, v - top) * sstep(0.075, 0.115, au)
    return face, patch * face, 1.0 - face

def build_character(who):
    P = PAL[who]; random.seed(3 if who == 'chora' else 5)
    SKIN = make_mat("skin", 0.7, sheen=0.3); FIN = make_mat("fin", 0.45, coat=0.15); HORN = make_mat("horn", 0.5)
    INKM = make_mat("ink", 0.2, coat=0.6); PAINT = make_mat("paint", 0.55); CLAW = make_mat("claw", 0.35)
    groups = {}
    def rigid(bone, ob, m):
        set_mat(ob, m); groups.setdefault(bone, []).append(ob); return ob

    # ------------------------------------------------------------ skin SDF
    FOOT = {s: np.array([s * 0.168, -0.15, 0.066]) for s in (1, -1)}
    THIGH = {s: np.array([s * 0.158, -0.03, 0.135]) for s in (1, -1)}
    TAIL = [np.array(p) for p in ((0.0, 0.17, 0.13), (0.07, 0.31, 0.085), (0.19, 0.41, 0.055), (0.33, 0.45, 0.04), (0.45, 0.43, 0.035))]
    TAIL_R = [0.11, 0.082, 0.056, 0.034, 0.013]
    def skin_sdf(X, Y, Z):
        head = sd_ellipsoid(X, Y, Z, HEAD_C, HEAD_R)
        for s in (1, -1):   # big round jowls: the head is widest at the lower cheeks
            head = smin(head, sd_ellipsoid(X, Y, Z, (s * 0.175, -0.085, 0.55), (0.185, 0.175, 0.15)), 0.08)
        head = smax(head, (-0.255 - Y), 0.07)       # flat-ish face plane
        head = smax(head, Z - 0.965, 0.09)          # flatter crown
        body = sd_ellipsoid(X, Y, Z, (0.0, 0.03, 0.25), (0.245, 0.225, 0.25))
        body = smin(body, sd_ellipsoid(X, Y, Z, (0.0, 0.025, 0.13), (0.27, 0.245, 0.15)), 0.08)
        d = smin(head, body, 0.09)
        for s in (1, -1):
            d = smin(d, sd_ellipsoid(X, Y, Z, THIGH[s], (0.118, 0.14, 0.108)), 0.05)
            foot = sd_ellipsoid(X, Y, Z, FOOT[s], (0.104, 0.135, 0.072))
            for dx in (-0.045, 0.0, 0.045):
                foot = smin(foot, sd_ellipsoid(X, Y, Z, FOOT[s] + np.array([dx, -0.105, -0.008]), (0.034, 0.04, 0.038)), 0.025)
            d = smin(d, foot, 0.035)
        tail = None
        for i in range(len(TAIL) - 1):
            seg = sd_round_cone(X, Y, Z, TAIL[i], TAIL[i + 1], TAIL_R[i], TAIL_R[i + 1])
            tail = seg if tail is None else smin(tail, seg, 0.02)
        return smin(d, tail, 0.06)
    skin = sdf_mesh("skin", skin_sdf, (-0.44, -0.40, -0.03), (0.52, 0.52, 1.03), VOX, 21000)

    # hood lip: recess the white face; raise the belly plate (+ ridges for Chora)
    V = verts_np(skin); Nn = normals_np(skin)
    head_zone = sstep(0.44, 0.52, V[:, 2])
    face, patch, vmask = face_masks(V)
    disp = -0.0075 * face * head_zone
    bx, bz = V[:, 0] / 0.155, (V[:, 2] - 0.22) / 0.2
    belly = sstep(1.08, 0.92, bx * bx + bz * bz) * sstep(-0.12, -0.18, V[:, 1]) * (1 - head_zone)
    disp += 0.009 * belly
    if who == 'chora':
        ridge = 0.5 + 0.5 * np.cos((V[:, 2] - 0.05) * 2 * math.pi / 0.042)
        disp -= 0.0035 * belly * sstep(0.7, 1.0, ridge)
    set_verts_np(skin, V + Nn * disp[:, None])

    # skin paint + shader fx
    V = verts_np(skin)
    face, patch, vmask = face_masks(V)
    u, v, w = head_uvw(V)
    hood = mix(P['hood'], P['hood_top'], sstep(0.05, 0.7, v)[:, None])
    hood = mix(hood, P['hood_edge'], (sstep(0.6, 1.0, np.abs(u)) * sstep(0.3, -0.4, v) * 0.6 + sstep(0.25, 0.85, w) * sstep(0.35, -0.5, v) * 0.55)[:, None])
    fcol = mix(P['face'], P['face_shade'], (sstep(0.5, 1.0, np.abs(u)) * 0.7 + sstep(-0.3, 0.1, w) * 0.3)[:, None])
    fcol = mix(fcol, P['chin'], (sstep(-0.5, -0.98, v) * 0.72)[:, None])
    pcol = mix(P['patch'], P['patch_in'], (sstep(0.3, 0.0, np.hypot((np.abs(u) - 0.44) / 0.37, (v + 0.3) / 0.4)) * 0.5)[:, None])
    head_col = mix(hood, fcol, face[:, None]); head_col = mix(head_col, pcol, patch[:, None])
    bodyc = mix(P['body'], P['body_low'], (sstep(0.36, 0.06, V[:, 2]) * 0.9)[:, None])
    feet = np.zeros(len(V))
    for s in (1, -1):
        feet = np.maximum(feet, sstep(0.14, 0.07, np.linalg.norm(V - FOOT[s], axis=1)))
    bodyc = mix(bodyc, P['foot'], (feet * sstep(-0.05, -0.2, V[:, 1]))[:, None])
    if who == 'chora':
        ridge = 0.5 + 0.5 * np.cos((V[:, 2] - 0.05) * 2 * math.pi / 0.042)
        bellyc = mix(np.tile(P['belly'], (len(V), 1)), P['belly_ridge'], (sstep(0.8, 1.0, ridge) * 0.55)[:, None])
    else:
        rr = np.hypot(V[:, 0] / 0.155, (V[:, 2] - 0.22) / 0.2)
        bellyc = mix(np.tile(P['belly_ridge'], (len(V), 1)), P['belly'], sstep(0.0, 0.9, rr)[:, None])
    bodyc = mix(bodyc, bellyc, belly[:, None])
    tailz = sstep(0.18, 0.3, V[:, 1]) * (1 - head_zone)
    tailc = mix(np.tile(P['body'], (len(V), 1)), P['body_low'], (0.45 + 0.4 * sstep(0.3, 0.45, V[:, 1]))[:, None])
    bodyc = mix(bodyc, tailc, (tailz * 0.6)[:, None])
    cols = mix(bodyc, head_col, head_zone[:, None])
    spot = (1 - face) * (1 - belly)
    spot_body = spot * (1 - head_zone) * (1 - feet * 0.5)
    spot_hood = spot * head_zone * 0.55
    fx = np.stack([spot_body + spot_hood, spot * 0.8, 1.0 - 0.35 * face * head_zone], 1)
    paint_np(skin, cols, fx)
    set_mat(skin, SKIN)
    skin_bvh = world_bvh([skin])

    # ------------------------------------------------------------ arms (toy seam at the shoulder)
    SH = {1: np.array([0.19, -0.035, 0.395]), -1: np.array([-0.19, -0.035, 0.395])}
    HD = {1: np.array([0.175, -0.215, 0.255]), -1: np.array([-0.175, -0.215, 0.255])}
    for s, side in ((1, 'L'), (-1, 'R')):
        def arm_sdf(X, Y, Z, s=s):
            d = sd_round_cone(X, Y, Z, SH[s], HD[s], 0.07, 0.058)
            return smin(d, sd_ellipsoid(X, Y, Z, HD[s] + np.array([0, -0.01, -0.005]), (0.066, 0.064, 0.06)), 0.03)
        lo = np.minimum(SH[s], HD[s]) - 0.1; hi = np.maximum(SH[s], HD[s]) + 0.1
        arm = sdf_mesh(f"arm_{side}", arm_sdf, lo, hi, VOX * 0.8, 2400, 2)
        A = verts_np(arm)
        t = np.clip(((A - SH[s]) @ (HD[s] - SH[s])) / np.dot(HD[s] - SH[s], HD[s] - SH[s]), 0, 1)
        c = mix(np.tile(P['body'], (len(A), 1)), P['hand'], sstep(0.35, 0.95, t)[:, None])
        paint_np(arm, c, np.stack([sstep(0.8, 0.4, t), 0.6 + 0 * t, 1.0 + 0 * t], 1))
        rigid(f'arm_{side}', arm, SKIN)
        for k, dz in enumerate((-0.028, 0.0, 0.028)):
            base = HD[s] + np.array([-s * 0.02, -0.048, dz])
            cl, _, _ = petal(f"hclaw{k}{side}", base, (-s * 0.2, -1.0, dz * 4), 0.042, 0.032, 0.026, (0, 0, 1), tip=0.4, h=0.0016, faces=200)
            paint_flat(cl, P['claw']); rigid(f'arm_{side}', cl, CLAW)
    for s, side in ((1, 'L'), (-1, 'R')):
        for k, dx in enumerate((-0.045, 0.0, 0.045)):
            base = FOOT[s] + np.array([dx, -0.125, -0.02])
            cl, _, _ = petal(f"fclaw{k}{side}", base, (dx * 2, -1.0, -0.35), 0.05, 0.044, 0.032, (0, 0, 1), tip=0.45, h=0.0016, faces=220)
            paint_flat(cl, P['claw']); rigid(f'leg_{side}', cl, CLAW)

    # ------------------------------------------------------------ face decals (projected along +Y; outline = (x, z))
    FWD = Vector((0, 1, 0)); up = Vector((0, 0, 1))
    def fdecal(name, outline, bone, col, mat, lift=0.002, depth=0.008, rings=2):
        # right = +Y × +Z = +X, up = +Z, origin (0,-1,0): outline coords map straight to world (x, z)
        ob = decal(name, outline, skin_bvh, (0, -1.0, 0), FWD, lift=lift, depth=depth, up=up, fill_rings=rings)
        paint_flat(ob, col); return rigid(bone, ob, mat)
    ex, ez = EYE
    for s, side in ((1, 'L'), (-1, 'R')):
        fdecal(f"eye_{side}", ellipse(EYE_R[0], EYE_R[1], 40, s * ex, ez, s * -0.05), f'eye_{side}', INK, INKM, lift=0.001, depth=0.01)
        fdecal(f"heye_{side}", stroke(arc(s * ex, ez - 0.024, 0.046, 0.042, math.pi * 0.95, math.pi * 0.05), 0.018), f'heye_{side}', INK, INKM, lift=0.002, depth=0.008)
        # brow: thick tapered stroke along the patch's top edge, rising steeply outward (the angry look)
        pts = []
        for k in range(9):
            t = k / 8; uu = 0.1 + 0.52 * t
            vv = GEM_V - 0.075 + CHEV * max(uu - 0.07, 0.0) + 0.018 * math.sin(math.pi * t)
            pts.append((s * uu * HEAD_R[0], HEAD_C[2] + vv * HEAD_R[2]))
        w_ = [0.02, 0.038, 0.05, 0.054, 0.052, 0.046, 0.038, 0.028, 0.014]
        L, Rr = [], []
        for k, (x, z) in enumerate(pts):
            a = pts[max(k - 1, 0)]; b = pts[min(k + 1, 8)]; tx, tz = b[0] - a[0], b[1] - a[1]; l = math.hypot(tx, tz) or 1
            nx, nz = -tz / l, tx / l; hw = w_[k] / 2
            L.append((x + nx * hw, z + nz * hw)); Rr.append((x - nx * hw, z - nz * hw))
        fdecal(f"brow_{side}", L + Rr[::-1], f'brow_{side}', INK, INKM, lift=0.003, depth=0.01)
        fdecal(f"blush_{side}", ellipse(0.032, 0.017, 28, s * 0.205, 0.522), 'head', P['blush'], PAINT, lift=0.0005, depth=0.005)
    fdecal("nose", [(-0.02, 0.545), (0.02, 0.545), (0.015, 0.534), (0.0, 0.527), (-0.015, 0.534)], 'head', INK, INKM, lift=0.003, depth=0.008, rings=1)
    fdecal("philtrum", stroke([(0.0, 0.528), (0.0, 0.516)], 0.006), 'head', INK, INKM, lift=0.002, depth=0.006, rings=1)
    fdecal("mouth_frown", stroke([(-0.042, 0.494), (-0.022, 0.508), (0.0, 0.512), (0.022, 0.508), (0.04, 0.496), (0.046, 0.49)], 0.01, 0.008), 'mouth_frown', INK, INKM, lift=0.002, depth=0.008)
    grin = [(-0.062, 0.492), (0.062, 0.492)] + arc(0, 0.492, 0.062, 0.058, 0, -math.pi, 22)[1:-1]
    fdecal("mouth_grin", grin, 'mouth_grin', MOUTH_IN, INKM, lift=0.002, depth=0.01)
    fdecal("tongue", ellipse(0.03, 0.016, 24, 0, 0.452), 'mouth_grin', TONGUE, INKM, lift=0.011, depth=0.003, rings=1)
    fdecal("fang", [(-0.046, 0.491), (-0.028, 0.491), (-0.037, 0.472)], 'mouth_grin', WHITE, INKM, lift=0.012, depth=0.003, rings=1)
    fdecal("mouth_o", ellipse(0.022, 0.027, 28, 0, 0.475), 'mouth_o', MOUTH_IN, INKM, lift=0.002, depth=0.01)
    # forehead gem: a raised faceted pyramid at the chevron tip (flat-shaded so the facets catch light)
    gz = HEAD_C[2] + GEM_V * HEAD_R[2]
    base_pts = [(-0.052, gz + 0.026), (0.052, gz + 0.026), (0.0, gz - 0.062)]
    bm = bmesh.new(); bv = []
    for (x, z) in base_pts:
        hit, nrm, _, _ = skin_bvh.ray_cast(Vector((x, -1.0, z)), FWD)
        bv.append(bm.verts.new(hit - nrm * 0.004))
    cx_ = sum((vv.co for vv in bv), Vector()) / 3
    hit, nrm, _, _ = skin_bvh.ray_cast(Vector((cx_.x, -1.0, cx_.z)), FWD)
    apex = bm.verts.new(hit + nrm * 0.04 + Vector((0, 0, 0.006)))
    for a_, b_ in ((0, 1), (1, 2), (2, 0)): bm.faces.new((bv[a_], bv[b_], apex))
    bm.faces.new((bv[2], bv[1], bv[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("gem"); bm.to_mesh(me); bm.free(); gem = link(bpy.data.objects.new("gem", me))
    paint_flat(gem, P['gem']); rigid('head', gem, HORN)

    # hood scale shards: teardrops scattered over the cap, projected along the surface normal
    shards = []; rnd = random.Random(21)
    for i in range(10):
        for _ in range(60):
            uu, vv = rnd.uniform(-0.5, 0.5), rnd.uniform(-0.05, 0.62)
            if uu * uu + vv * vv >= 1: continue
            ww = -math.sqrt(1 - uu * uu - vv * vv)
            p = HEAD_C + np.array([uu, ww * 0.9, vv]) * HEAD_R
            fm = face_masks(p[None])[0][0]
            if fm < 0.05 and ww < -0.3 and all(np.linalg.norm(p - q) > 0.065 for q in shards) and np.linalg.norm(p - (HEAD_C + np.array([0, -0.26, GEM_V * HEAD_R[2]]))) > 0.06: break
        else: continue
        shards.append(p)
        n = (p - HEAD_C) / HEAD_R ** 2; n = n / np.linalg.norm(n)
        lite = rnd.random() < 0.25 and vv < 0.35
        size = rnd.uniform(0.03, 0.045)
        # angular chip: a kite pointing down toward the face, slightly lopsided
        sk = rnd.uniform(-0.25, 0.25)
        tear = [(0.0 + sk * size, -size * 1.5), (size * 0.62, size * 0.1), (size * 0.18, size * 0.8), (-size * 0.45, size * 0.55), (-size * 0.6, -size * 0.05)]
        ob = decal(f"shard{i}", tear, skin_bvh, tuple(p), Vector(tuple(-n)), lift=0.0015, depth=0.006, up=Vector((0, 0, 1)), rot=rnd.uniform(-0.5, 0.5), fill_rings=1)
        paint_flat(ob, P['shard_lite'] if lite else P['shard_dark']); rigid('head', ob, PAINT)

    # belly mark + spine diamonds (spine bone)
    def bdecal(name, outline, col, origin=(0, -1.0, 0), direction=FWD, lift=0.002, depth=0.006):
        ob = decal(name, outline, skin_bvh, origin, direction, lift=lift, depth=depth, up=up)
        paint_flat(ob, col); return rigid('spine', ob, PAINT)
    if who == 'chora':
        for i, (x, z) in enumerate(((-0.05, 0.19), (0.05, 0.21))):
            bdecal(f"note_head{i}", ellipse(0.036, 0.026, 28, x, z, 0.35), P['mark'])
        for i, (x, z0, z1) in enumerate(((-0.018, 0.195, 0.315), (0.082, 0.215, 0.335))):
            bdecal(f"note_stem{i}", [(x - 0.009, z0), (x + 0.009, z0), (x + 0.009, z1), (x - 0.009, z1)], P['mark2'])
        bdecal("note_beam", [(-0.027, 0.295), (0.091, 0.315), (0.091, 0.345), (-0.027, 0.325)], P['mark2'])
    else:
        def flame(cx, cz, sc):
            pts = [(0, -0.9), (0.55, -0.62), (0.7, -0.1), (0.52, 0.35), (0.62, 0.8), (0.28, 0.45), (0.14, 1.0),
                   (-0.08, 0.5), (-0.38, 0.85), (-0.42, 0.3), (-0.72, 0.05), (-0.6, -0.55)]
            return [(cx + x * sc, cz + y * sc) for x, y in pts]
        bdecal("flame_out", flame(0.0, 0.135, 0.1), P['mark'])
        bdecal("flame_in", flame(0.0, 0.12, 0.055), P['mark2'], lift=0.006, depth=0.004)
    for i, (z, sz) in enumerate(((0.47, 0.034), (0.40, 0.04), (0.33, 0.042), (0.26, 0.038), (0.19, 0.032), (0.13, 0.026))):
        diamond = [(0, sz * 1.25), (sz * 0.8, 0), (0, -sz * 1.25), (-sz * 0.8, 0)]
        bdecal(f"spine{i}", [(a, z + b) for a, b in diamond], P['spine'], origin=(0, 1.0, 0), direction=Vector((0, -1, 0)))

    # ------------------------------------------------------------ fins (spring chains) + horns
    chains = []; fin_objs = []
    def fin(prefix, parent, base, direction, length, width, thick, col_base, col_tip, up=(0, 1, 0), bend=0.0, sweep=0.0, faces=1100, profile='leaf', tip=0.12, flat=False, sharp=1.0):
        ob, pts, M = petal(prefix, base, direction, length, width, thick, up, bend=bend, sweep=sweep, faces=faces, profile=profile, tip=tip, flat=flat, sharp=sharp)
        A = verts_np(ob)
        t = np.clip(((A - np.array(pts[0])) @ np.array(pts[2] - pts[0])) / (pts[2] - pts[0]).length_squared, 0, 1)
        col = mix(np.tile(col_base, (len(A), 1)), col_tip, sstep(0.05, 0.95, t)[:, None])
        paint_np(ob, col, np.stack([0 * t, 0 * t, 0.15 + 0 * t], 1))
        set_mat(ob, FIN)
        vg0 = ob.vertex_groups.new(name=f"{prefix}_0"); vg1 = ob.vertex_groups.new(name=f"{prefix}_1")
        for i, tt in enumerate(t):
            w1 = float(sstep(0.35, 0.75, tt)); vg0.add([i], 1.0 - w1, 'REPLACE'); vg1.add([i], w1, 'REPLACE')
        chains.append((prefix, parent, pts)); fin_objs.append(ob)
    HC = Vector(tuple(HEAD_C))
    # the ruff: chunky faceted plates hugging the head outline. Magenta over the top, orange on the upper
    # sides, magenta again low by the cheeks (a touch more orange on the character's right, as on the sheet).
    for i, (ang, lk, wk) in enumerate(((-128, 0.85, 0.95), (-100, 1.1, 1.1), (-70, 1.2, 1.15), (-38, 1.05, 1.05), (-8, 0.9, 1.0),
                                       (24, 1.0, 1.05), (56, 1.2, 1.15), (88, 1.12, 1.1), (118, 0.9, 1.0))):
        a = math.radians(ang); d = Vector((math.sin(a), 0.0, math.cos(a)))
        base = HC + Vector((math.sin(a) * 0.25, 0.11, math.cos(a) * 0.22))
        dirv = (d + Vector((0, 0.22, 0))).normalized()
        aa = abs(ang)
        o = float(sstep(14, 40, aa) * (1 - sstep(96, 124, aa))) * (1.0 if ang < 0 else 0.88)
        L = (0.2 + 0.09 * float(sstep(15, 60, aa) * (1 - sstep(95, 130, aa)))) * lk
        cb = mix(FAN_MAGENTA, FAN_ORANGE, o); ct = mix(FAN_TIP_M, FAN_TIP_O, o)
        fin(f"fin_f{i:02d}", 'head', base, dirv, L * 1.05, 0.3 * wk, 0.1, mix(cb, np.array([0.55, 0.05, 0.35]), 0.2), ct,
            bend=0.06, faces=170, profile='tri', tip=0.07, flat=True, sharp=0.95)
    for i, ang in enumerate((-100, -60, -20, 20, 60, 100)):
        a = math.radians(ang); d = Vector((math.sin(a), 0.0, math.cos(a)))
        base = HC + Vector((math.sin(a) * 0.19, 0.18, math.cos(a) * 0.17))
        dirv = (d + Vector((0, 0.7, 0))).normalized()
        fin(f"fin_b{i:02d}", 'head', base, dirv, 0.24, 0.28, 0.085, FAN_MAGENTA * 0.85, FAN_TIP_M, bend=0.06, faces=150, profile='tri', tip=0.07, flat=True, sharp=0.95)
    for i, (z, L) in enumerate(((0.43, 0.17), (0.34, 0.18), (0.25, 0.16), (0.16, 0.13))):
        hit, nrm, _, _ = skin_bvh.ray_cast(Vector((0, 1.5, z)), Vector((0, -1, 0)))
        if hit is None: continue
        dirv = (nrm + Vector((0, 0.35, 0.55))).normalized()
        fin(f"fin_d{i:02d}", 'chest' if z > 0.36 else 'spine', hit - nrm * 0.03, dirv, L, 0.17, 0.055, P['dorsal_base'], P['dorsal_tip'], up=(1, 0, 0), faces=420, profile='tri', tip=0.06)
    def tail_at(t):
        seg = min(int(t * (len(TAIL) - 1)), len(TAIL) - 2); u_ = t * (len(TAIL) - 1) - seg
        p = TAIL[seg] * (1 - u_) + TAIL[seg + 1] * u_; r = TAIL_R[seg] * (1 - u_) + TAIL_R[seg + 1] * u_
        d = TAIL[seg + 1] - TAIL[seg]; return p, r, d / np.linalg.norm(d), seg
    for i, t in enumerate((0.18, 0.42, 0.66)):
        p, r, d, seg = tail_at(t)
        base = Vector(tuple(p)) + Vector((0, 0, r * 0.7))
        dirv = (Vector((0, 0, 1)) + Vector(tuple(d)) * 0.55).normalized()
        fin(f"fin_t{i:02d}", f'tail_{min(seg, 3) + 1}', base, dirv, 0.13 * (1.05 - t * 0.6), 0.13 * (1.05 - t * 0.5), 0.045,
            P['dorsal_base'], P['dorsal_tip'], up=tuple(Vector(tuple(d)).cross(Vector((0, 0, 1)))), faces=320, profile='tri', tip=0.06)
    horns = [((-0.175, 0.0, 0.195), (-0.42, 0.08, 1.0), 0.29, 0.24), ((0.175, 0.0, 0.195), (0.42, 0.08, 1.0), 0.3, 0.24),
             ((0.0, 0.11, 0.235), (0.0, 0.55, 1.0), 0.19, 0.13)]
    for k in range(6):   # mohawk tufts between the horns (rigid, small, jagged)
        t = k / 5
        base = HC + Vector((0.0, -0.02 + 0.2 * t, 0.285 - 0.05 * t * t))
        ob, _, _ = petal(f"tuft{k}", base, Vector((0, 0.25 + 0.6 * t, 1.0)), 0.06 - 0.015 * abs(t - 0.4), 0.035, 0.02, (1, 0, 0), tip=0.05, faces=60, profile='tri', h=0.002)
        paint_flat(ob, HORN_TIP); rigid('head', ob, HORN)
    horn_objs = []
    for i, (o, d, L, W) in enumerate(horns):
        ob, pts, M = petal(f"horn_{i}", HC + Vector(o), Vector(d), L, W, W * 0.7, (1, 0, 0), bend=0.05, tip=0.02, faces=260, sharp=0.8, profile='tri', flat=True)
        A = verts_np(ob)
        t = np.clip(((A - np.array(pts[0])) @ np.array(pts[2] - pts[0])) / (pts[2] - pts[0]).length_squared, 0, 1)
        paint_np(ob, mix(np.tile(HORN_BASE, (len(A), 1)), HORN_TIP, sstep(0.0, 0.7, t)[:, None]), np.zeros((len(A), 3)))
        set_mat(ob, HORN)
        vg = ob.vertex_groups.new(name=f"horn_{i}"); vg.add(list(range(len(A))), 1.0, 'REPLACE')
        chains.append((f"horn_{i}", 'head', [pts[0], pts[2]])); horn_objs.append(ob)

    # ------------------------------------------------------------ armature
    bpy.context.view_layer.update()
    arm_data = bpy.data.armatures.new(f"{who}_rig")
    arm = link(bpy.data.objects.new(who, arm_data))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    def bone(name, h, t, parent=None, connect=False):
        b = eb.new(name); b.head = Vector(tuple(h)); b.tail = Vector(tuple(t)); b.roll = 0.0
        if parent: b.parent = eb[parent]; b.use_connect = connect
        return b
    bone('root', (0, 0, 0), (0, 0, 0.08))
    bone('hips', (0, 0.03, 0.08), (0, 0.03, 0.24), 'root')
    bone('spine', (0, 0.03, 0.24), (0, 0.03, 0.38), 'hips')
    bone('chest', (0, 0.03, 0.38), (0, 0.03, 0.48), 'spine')
    bone('head', (0, 0.02, 0.48), (0, 0.02, 0.92), 'chest')
    def centre(obs):
        return np.concatenate([verts_np(o) for o in obs]).mean(0)
    for nm in ('eye_L', 'eye_R', 'heye_L', 'heye_R', 'brow_L', 'brow_R', 'mouth_frown', 'mouth_grin', 'mouth_o'):
        c = centre(groups[nm]); bone(nm, c, c + np.array([0, 0, 0.04]), 'head')
    for s, side in ((1, 'L'), (-1, 'R')):
        bone(f'arm_{side}', SH[s], HD[s], 'chest')
        bone(f'hand_{side}', HD[s], HD[s] + np.array([0, -0.08, 0]), f'arm_{side}', True)
        bone(f'leg_{side}', THIGH[s] + np.array([0, 0, -0.01]), FOOT[s] + np.array([0, -0.06, 0]), 'hips')
    bone('tail_1', TAIL[0], TAIL[1], 'hips')
    for k in (2, 3, 4): bone(f'tail_{k}', TAIL[k - 1], TAIL[k], f'tail_{k - 1}', True)
    bone('prop', (0, -0.30, 0.285), (0, -0.20, 0.285), 'chest')        # two-handed hold socket (points +Y)
    for prefix, parent, pts in chains:
        if len(pts) == 3:
            bone(f"{prefix}_0", pts[0], pts[1], parent)
            bone(f"{prefix}_1", pts[1], pts[2], f"{prefix}_0", True)
        else:
            bone(prefix, pts[0], pts[1], parent)
    # rest tails for the runtime spring joints (glTF has no bone tails) → armature extras
    arm["spring_tails"] = {b.name: [round(c, 5) for c in b.tail] for b in eb}
    bpy.ops.object.mode_set(mode='OBJECT')

    for bname, obs in groups.items():
        o = join(obs, f"{who}_{bname}")
        mw = o.matrix_world.copy()
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bname
        bpy.context.view_layer.update(); o.matrix_world = mw
    for obs, nm in ((fin_objs, 'fins'), (horn_objs, 'horns')):
        o = join(obs, f"{who}_{nm}")
        o.parent = arm; md = o.modifiers.new("Armature", 'ARMATURE'); md.object = arm

    # skin weights: head / chest / spine / hips / legs / tail with smooth blends
    skin.name = f"{who}_skin"; skin.parent = arm
    md = skin.modifiers.new("Armature", 'ARMATURE'); md.object = arm
    V = verts_np(skin); n = len(V)
    def seg_dist(a, b):
        a, b = np.asarray(a), np.asarray(b); ab = b - a
        t = np.clip(((V - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(V - (a + t[:, None] * ab), axis=1), t
    head_w = sstep(0.445, 0.53, V[:, 2])
    tail_d = np.full(n, 9.0); tail_t = np.zeros(n)
    for k in range(len(TAIL) - 1):
        d, t = seg_dist(TAIL[k], TAIL[k + 1]); better = d < tail_d
        tail_d[better] = d[better]; tail_t[better] = (k + t[better]) / (len(TAIL) - 1)
    tail_w = sstep(0.16, 0.10, tail_d) * sstep(0.12, 0.22, V[:, 1]) * (1 - head_w)
    legs = {}
    for s, side in ((1, 'L'), (-1, 'R')):
        d, _ = seg_dist(THIGH[s], FOOT[s] + np.array([0, -0.08, 0]))
        legs[side] = sstep(0.15, 0.09, d) * sstep(0.26, 0.14, V[:, 2]) * (1 - tail_w)
    rest = np.clip(1 - head_w - tail_w - legs['L'] - legs['R'], 0, 1)
    z = V[:, 2]
    hips_w = rest * sstep(0.26, 0.14, z); chest_w = rest * sstep(0.34, 0.44, z)
    spine_w = np.clip(rest - hips_w - chest_w, 0, 1)
    W = {'head': head_w, 'hips': hips_w, 'spine': spine_w, 'chest': chest_w, 'leg_L': legs['L'], 'leg_R': legs['R']}
    for k in range(4):
        W[f'tail_{k + 1}'] = tail_w * np.clip(1 - np.abs(tail_t * 4 - (k + 0.5)), 0, 1)
    tot = sum(W.values()) + 1e-6
    for name, w in W.items():
        vg = skin.vertex_groups.new(name=name); w = w / tot
        for i in np.nonzero(w > 0.002)[0]: vg.add([int(i)], float(w[i]), 'REPLACE')
    return arm

# ================================================================== props (separate files)
def build_props():
    for name in ('book', 'camera'):
        reset()
        PROP = make_mat("prop", 0.5); GL = make_mat("prop_gloss", 0.2, coat=0.5)
        obs = []
        if name == 'book':
            bm = bmesh.new()
            for sign in (1, -1):
                vs = bmesh.ops.create_cube(bm, size=1.0)['verts']
                for v in vs:
                    v.co = Vector((v.co.x * 0.15 + sign * 0.075, v.co.y * 0.012, v.co.z * 0.2))
                    v.co = Matrix.Rotation(sign * math.radians(-28), 3, 'Z') @ v.co
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.003, segments=2, affect='EDGES')
            me = bpy.data.meshes.new("cover"); bm.to_mesh(me); bm.free(); cover = link(bpy.data.objects.new("cover", me))
            paint_flat(cover, hexc('#14233c')); set_mat(cover, PROP); obs.append(cover)
            bm = bmesh.new()
            for sign in (1, -1):
                vs = bmesh.ops.create_cube(bm, size=1.0)['verts']
                for v in vs:
                    v.co = Vector((v.co.x * 0.14 + sign * 0.072, v.co.y * 0.02 + 0.016, v.co.z * 0.185))
                    v.co = Matrix.Rotation(sign * math.radians(-28), 3, 'Z') @ v.co
            me = bpy.data.meshes.new("pages"); bm.to_mesh(me); bm.free(); pages = link(bpy.data.objects.new("pages", me))
            paint_flat(pages, hexc('#f3efe6')); set_mat(pages, PROP); obs.append(pages)
            cb = world_bvh([cover])
            for i, (x, z, col) in enumerate(((-0.075, 0.02, hexc('#d4147c')), (0.08, 0.03, hexc('#f28b3c')))):
                for j, pts in enumerate((ellipse(0.02, 0.014, 20, x, z - 0.03, 0.35),
                                         [(x + 0.012, z - 0.03), (x + 0.02, z - 0.03), (x + 0.02, z + 0.05), (x + 0.012, z + 0.05)],
                                         [(x + 0.02, z + 0.05), (x + 0.05, z + 0.03), (x + 0.045, z + 0.018), (x + 0.02, z + 0.032)])):
                    o = decal(f"bn{i}{j}", pts, cb, (0, -1, 0), Vector((0, 1, 0)), lift=0.001, depth=0.003, fill_rings=1)
                    paint_flat(o, col); set_mat(o, PROP); obs.append(o)
            for o in obs: o.rotation_euler = (math.radians(-8), 0, 0)
        else:
            bm = bmesh.new()
            for sc, off in (((0.19, 0.075, 0.115), (0, 0, 0)), ((0.06, 0.06, 0.035), (0, 0, 0.07)), ((0.035, 0.035, 0.1), (0.075, -0.045, 0))):
                vs = bmesh.ops.create_cube(bm, size=1.0)['verts']
                for v in vs: v.co = Vector((v.co.x * sc[0] + off[0], v.co.y * sc[1] + off[1], v.co.z * sc[2] + off[2]))
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.008, segments=3, affect='EDGES')
            me = bpy.data.meshes.new("body"); bm.to_mesh(me); bm.free(); body = link(bpy.data.objects.new("camera_body", me))
            paint_flat(body, hexc('#2b2d34')); set_mat(body, PROP); obs.append(body)
            for nm, r1, r2, dp, y, col, mat in (("lens", 0.05, 0.047, 0.07, -0.07, hexc('#1b1c21'), GL), ("glass", 0.036, 0.036, 0.012, -0.107, hexc('#10233a'), GL)):
                bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=36, radius1=r1, radius2=r2, depth=dp)
                for v in bm.verts: v.co = Matrix.Rotation(math.radians(90), 3, 'X') @ v.co + Vector((0.0, y, -0.005))
                me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new(nm, me))
                me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
                paint_flat(o, col); set_mat(o, mat); obs.append(o)
        o = join(obs, name)
        o["socket"] = "prop"
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        path = os.path.join(OUT_PROPS, f"{name}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True,
                                  export_vertex_color='ACTIVE', export_attributes=True, export_yup=True)
        print("prop", path, os.path.getsize(path))

# ================================================================== animation
AX = {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}
HIDE = 0.001
SPRING_PREFIX = ('fin_', 'horn_')

def wrot(arm, bname, rots):
    q = Quaternion()
    for ax, deg in rots: q = Quaternion(AX[ax], math.radians(deg)) @ q
    B = arm.data.bones[bname].matrix_local.to_quaternion()
    return B.inverted() @ q @ B

def wloc(arm, bname, v):
    return arm.data.bones[bname].matrix_local.to_3x3().inverted() @ Vector(v)

FACE = {
    'grump': {'heye_L': {'s': HIDE}, 'heye_R': {'s': HIDE}, 'mouth_grin': {'s': HIDE}, 'mouth_o': {'s': HIDE}},
    'attent': {'heye_L': {'s': HIDE}, 'heye_R': {'s': HIDE}, 'mouth_grin': {'s': HIDE}, 'mouth_o': {'s': HIDE},
               'brow_L': {'r': [('y', 5)], 'l': (0, 0, 0.008)}, 'brow_R': {'r': [('y', -5)], 'l': (0, 0, 0.008)},
               'eye_L': {'s': 1.06}, 'eye_R': {'s': 1.06}},
    'grin': {'heye_L': {'s': HIDE}, 'heye_R': {'s': HIDE}, 'mouth_frown': {'s': HIDE}, 'mouth_o': {'s': HIDE},
             'brow_L': {'r': [('y', 10)], 'l': (0, 0, 0.012)}, 'brow_R': {'r': [('y', -10)], 'l': (0, 0, 0.012)},
             'eye_L': {'s': 1.1}, 'eye_R': {'s': 1.1}},
    'happy': {'eye_L': {'s': HIDE}, 'eye_R': {'s': HIDE}, 'mouth_frown': {'s': HIDE}, 'mouth_o': {'s': HIDE},
              'brow_L': {'r': [('y', 14)], 'l': (0, 0, 0.018)}, 'brow_R': {'r': [('y', -14)], 'l': (0, 0, 0.018)}},
    'oh': {'heye_L': {'s': HIDE}, 'heye_R': {'s': HIDE}, 'mouth_grin': {'s': HIDE}, 'mouth_frown': {'s': HIDE},
           'brow_L': {'r': [('y', 8)], 'l': (0, 0, 0.01)}, 'brow_R': {'r': [('y', -8)], 'l': (0, 0, 0.01)}},
    'mad': {'heye_L': {'s': HIDE}, 'heye_R': {'s': HIDE}, 'mouth_grin': {'s': HIDE}, 'mouth_o': {'s': HIDE},
            'brow_L': {'r': [('y', -8)], 'l': (0, 0, -0.008)}, 'brow_R': {'r': [('y', 8)], 'l': (0, 0, -0.008)},
            'eye_L': {'s': (1, 0.8, 1)}, 'eye_R': {'s': (1, 0.8, 1)}},
}

def merge(*ds):
    out = {}
    for d in ds:
        if not d: continue
        for k, v in d.items():
            cur = dict(out.get(k, {}))
            for kk, vv in v.items():
                if kk == 'r': cur['r'] = cur.get('r', []) + list(vv)
                elif kk == 'l': cur['l'] = tuple(a + b for a, b in zip(cur.get('l', (0, 0, 0)), vv))
                else: cur[kk] = vv
            out[k] = cur
    return out

def blink(k):
    y = max(0.08, 1 - k)
    if y >= 0.999: return {}
    return {'eye_L': {'s': (1, y, 1)}, 'eye_R': {'s': (1, y, 1)}}

def pose(lean=0, hx=0, hy=0, hz=0, bob=0, breath=1.0, squash=1.0, tail=0.0, tail_phase=0.0,
         lu=0, ru=0, lo=0, ro=0, li=0, ri=0, lap=0.0, legs=0.0):
    """One body pose. Tail sway travels down the chain with a phase lag (overlapping action)."""
    d = {'root': {'l': (0, 0, bob)},
         'hips': {'s': (1.0 / math.sqrt(squash), 1.0 / math.sqrt(squash), squash)},
         'spine': {'s': (breath, breath, 1.0 + (breath - 1) * 0.5)},
         'chest': {'r': [('x', lean)]},
         'head': {'r': [('x', hx), ('z', hy), ('y', hz)]},
         'arm_L': {'r': [('x', -lu), ('z', lo - li)]}, 'arm_R': {'r': [('x', -ru), ('z', -(ro - ri))]},
         'leg_L': {'r': [('x', legs)]}, 'leg_R': {'r': [('x', legs)]},
         'prop': {'l': (0, 0.05 * lap, -0.12 * lap), 'r': [('x', -22 * lap)]}}
    for k in range(4):
        ph = tail_phase - k * 0.55
        d[f'tail_{k + 1}'] = {'r': [('z', tail * (0.45 + 0.25 * k) * math.sin(ph))]}
    return d

class Clip:
    def __init__(self, arm, name, frames):
        self.arm, self.name, self.frames = arm, name, frames
        act = bpy.data.actions.new(name); act.use_fake_user = True
        arm.animation_data_create(); arm.animation_data.action = act
        for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
        self.bones = [pb for pb in arm.pose.bones if not pb.name.startswith(SPRING_PREFIX)]

    def key(self, f, spec):
        arm = self.arm
        for pb in self.bones:
            s = spec.get(pb.name, {})
            pb.rotation_quaternion = wrot(arm, pb.name, s.get('r', []))
            pb.location = wloc(arm, pb.name, s.get('l', (0, 0, 0)))
            sc = s.get('s', 1.0); pb.scale = (sc, sc, sc) if isinstance(sc, (int, float)) else sc
            for path in ('rotation_quaternion', 'location', 'scale'):
                pb.keyframe_insert(path, frame=f)

    def sample(self, fn, step=2):
        """fn(t in [0,1]) → spec. Dense procedural sampling gives smooth curves; the last key closes the loop."""
        f = 1
        while f <= self.frames + 1:
            self.key(f, fn((f - 1) / self.frames)); f += step
        if f - step != self.frames + 1: self.key(self.frames + 1, fn(1.0))

def ease(t): return t * t * (3 - 2 * t)
def ease_out(t): return 1 - (1 - t) ** 3
def seg(t, a, b): return min(1.0, max(0.0, (t - a) / (b - a)))
def damped(t, freq, decay): return math.exp(-decay * t) * math.sin(2 * math.pi * freq * t)
TAU = 2 * math.pi

def build_clips(arm):
    F = FACE
    def idle(t):
        br = 0.5 - 0.5 * math.cos(TAU * t)
        k = max(0.0, 1 - abs(t - 0.62) / 0.025) + 0.6 * max(0.0, 1 - abs(t - 0.2) / 0.02)
        return merge(pose(hx=1.8 * math.sin(TAU * t - 0.9), hz=1.2 * math.sin(TAU * t + 0.4), breath=1 + 0.035 * br,
                          squash=1 - 0.01 * br, tail=9, tail_phase=TAU * t, lu=2 * br, ru=2 * br), F['grump'], blink(min(1, k)))
    Clip(arm, 'idle', 120).sample(idle)
    def listen(t):
        nod = max(0.0, math.sin(TAU * 2 * t)) ** 2
        k = max(0.0, 1 - abs(t - 0.8) / 0.025)
        return merge(pose(lean=7 + 1.5 * math.sin(TAU * t), hx=4 + 5 * nod, hz=10 + 2 * math.sin(TAU * t + 1),
                          breath=1 + 0.02 * (0.5 - 0.5 * math.cos(TAU * t)), tail=5, tail_phase=TAU * t), F['attent'], blink(min(1, k)))
    Clip(arm, 'listen', 120).sample(listen)
    def encourage(t):
        p = (0.5 - 0.5 * math.cos(TAU * 2 * t)) ** 1.4
        pl = (0.5 - 0.5 * math.cos(TAU * 2 * t - 0.5)) ** 1.4
        return merge(pose(lean=9 + 5 * pl, hx=10 - 12 * pl, bob=0.012 * p, breath=1.02 + 0.02 * p, squash=1 - 0.02 * pl,
                          tail=16, tail_phase=TAU * 2 * t, lu=-5 + 62 * p, ru=-5 + 62 * p, lo=10 * p, ro=10 * p, lap=1), F['grin'])
    Clip(arm, 'encourage', 48).sample(encourage)
    def excited(t):
        up = abs(math.sin(TAU * t)); contact = 1 - up
        return merge(pose(bob=0.055 * up, squash=1 - 0.06 * contact ** 3 + 0.025 * up, hx=-4 * up + 3 * contact, tail=22, tail_phase=TAU * 3 * t,
                          lu=18 + 22 * up, ru=18 + 22 * up, lo=22, ro=22, lap=1, legs=-6 * up), F['happy'])
    Clip(arm, 'excited', 36).sample(excited)
    def cheer(t):
        if t < 0.12:
            a = ease(seg(t, 0, 0.12)); bob, sq, arms, hx, face = -0.025 * a, 1 - 0.07 * a, 8 * a, 7 * a, F['oh']
        elif t < 0.5:
            a = seg(t, 0.12, 0.5); h = math.sin(math.pi * a)
            bob, sq, arms, hx, face = 0.26 * h, 1 + 0.06 * (1 - a) * h, 8 + 64 * ease_out(min(1, a * 2)), -10 * h, F['happy']
        else:
            a = seg(t, 0.5, 1.0)
            bob = 0.035 * damped(a, 2.2, 5.0) - 0.02 * math.exp(-9 * a)
            sq = 1 - 0.09 * math.exp(-8 * a) * math.cos(TAU * 2.2 * a)
            arms = 72 * (1 - ease(seg(a, 0.35, 1.0))); hx = 6 * damped(a, 2.0, 4.0)
            face = F['happy'] if a < 0.55 else F['grin']
        out = max(0.0, min(1.0, arms / 45))
        return merge(pose(bob=bob, squash=sq, hx=hx, tail=24, tail_phase=TAU * 3 * t, lu=arms * 0.75, ru=arms * 0.75, lo=78 * out, ro=78 * out,
                          lap=min(1, t * 6) * (1 - ease(seg(t, 0.85, 1.0))), legs=-8 * max(0.0, bob) / 0.26), face)
    Clip(arm, 'cheer', 60).sample(cheer)
    def almost(t):
        s = damped(seg(t, 0.08, 0.8), 2.2, 3.2) * 14
        fold = ease(seg(t, 0.0, 0.15)) * (1 - ease(seg(t, 0.7, 1.0)))
        return merge(pose(hx=4 * fold, hy=s, tail=10, tail_phase=TAU * 2 * t, li=24 * fold, ri=24 * fold, lu=-6 * fold, ru=-6 * fold),
                     F['mad'] if t < 0.72 else F['grump'])
    Clip(arm, 'almost', 54).sample(almost)
    def wave(t):
        up = ease(seg(t, 0, 0.15)) * (1 - ease(seg(t, 0.82, 1.0)))
        w = math.sin(TAU * 3 * seg(t, 0.15, 0.82))
        return merge(pose(hz=-7 * up, hx=-2 * up, tail=8, tail_phase=TAU * t, ru=70 * up + 8 * w * up, ro=78 * up + 16 * w * up),
                     F['grin'] if up > 0.3 else F['grump'])
    Clip(arm, 'wave', 60).sample(wave)
    def think(t):
        return merge(pose(hz=-11 - 3 * math.sin(TAU * t), hx=-4, breath=1 + 0.02 * (0.5 - 0.5 * math.cos(TAU * t)), tail=6, tail_phase=TAU * t, ru=52, ri=30),
                     F['oh'], {'eye_L': {'l': (0.004, 0, 0.012)}, 'eye_R': {'l': (0.004, 0, 0.012)}})
    Clip(arm, 'think', 120).sample(think)
    def nod(t):
        n = max(0.0, math.sin(TAU * 2 * t)) * math.exp(-1.6 * t) * 15
        return merge(pose(hx=n, bob=-0.006 * n / 15, tail=12, tail_phase=TAU * 2 * t), F['grin'] if 0.05 < t < 0.85 else F['grump'])
    Clip(arm, 'nod_yes', 24).sample(nod, step=1)
    def hop(t):
        h = math.sin(math.pi * t); contact = max(0.0, 1 - h * 3)
        return merge(pose(bob=0.13 * h, squash=1 + 0.05 * h - 0.08 * contact ** 2, hx=-5 * h + 4 * contact, lean=3 * h,
                          tail=16, tail_phase=TAU * t, lu=12 + 22 * h, ru=12 + 22 * h, lo=30 * h, ro=30 * h, lap=1, legs=-10 * h), F['grump'])
    Clip(arm, 'hop', 30).sample(hop)
    arm.animation_data.action = bpy.data.actions['idle']

# ================================================================== export + preview
def export(arm, who):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o == arm or o.parent == arm: o.select_set(True)
    kw = dict(export_format='GLB', use_selection=True, export_animations=True,
              export_animation_mode='ACTIONS', export_apply=False, export_yup=True, export_skins=True,
              export_force_sampling=True, export_frame_step=1, export_vertex_color='ACTIVE',
              export_attributes=True, export_extras=True, export_def_bones=False, export_optimize_animation_size=True)
    # app copy: Draco-compressed (decoder ships at /draco/). Preview copy: uncompressed, for sandboxes
    # that can't fetch a decoder (the published viewer artifact).
    path = os.path.join(OUT, f"{who}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
                              export_draco_normal_quantization=10, export_draco_color_quantization=10,
                              export_draco_generic_quantization=10, **kw)
    print("exported", path, os.path.getsize(path))
    if PREVIEW:
        raw = os.path.join(PREVIEW, f"{who}.raw.glb")
        bpy.ops.export_scene.gltf(filepath=raw, **kw)
        print("exported raw", raw, os.path.getsize(raw))

def setup_render():
    s = bpy.context.scene; s.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for t in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = t; prefs.get_devices()
                if any(d.type == t for d in prefs.devices):
                    for d in prefs.devices: d.use = True
                    s.cycles.device = 'GPU'; break
            except Exception: pass
    except Exception: pass
    s.cycles.samples = 48; s.cycles.use_denoising = True
    s.render.resolution_x = s.render.resolution_y = 720; s.render.film_transparent = True
    s.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new("w"); s.world = w
    if w.node_tree is None: w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.8, 0.8, 0.82, 1); bg.inputs['Strength'].default_value = 0.3
    for name, loc, en, size in (("key", (-1.6, -2.2, 2.6), 190, 2.2), ("fill", (2.2, -1.6, 1.0), 55, 2.5), ("rim", (0.4, 2.6, 2.2), 160, 1.5)):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = en; L.size = size
        o = link(bpy.data.objects.new(name, L)); o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.55)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new("cam"); cam.lens = 55
    co = link(bpy.data.objects.new("cam", cam)); s.camera = co
    return co

def shoot(co, loc, target, path):
    co.location = loc
    co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

def preview(arm, who):
    co = setup_render(); tgt = (0, 0, 0.56)
    arm.animation_data.action = bpy.data.actions['idle']; bpy.context.scene.frame_set(1)
    for tag, loc in (("front", (0, -3.4, 0.7)), ("q34", (-1.15, -3.2, 0.95)), ("side", (3.4, 0.0, 0.7)), ("back", (0, 3.4, 0.85))):
        shoot(co, loc, tgt, os.path.join(PREVIEW, f"{who}_{tag}.png"))
    for clip, f in (("listen", 30), ("encourage", 12), ("cheer", 26), ("almost", 20)):
        a = arm.animation_data; a.action = bpy.data.actions[clip]
        try:
            if a.action.slots: a.action_slot = a.action.slots[0]
        except Exception: pass
        bpy.context.scene.frame_set(f)
        shoot(co, (-1.0, -3.2, 0.9), (0, 0, 0.6), os.path.join(PREVIEW, f"{who}_clip_{clip}.png"))

def main():
    only = os.environ.get("MASCOT_ONLY")
    for who in ('chora', 'reello'):
        if only and only != who: continue
        reset()
        arm = build_character(who)
        build_clips(arm)
        export(arm, who)
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PREVIEW, f"{who}.blend"))
            preview(arm, who)
    if not only or only == 'props':
        build_props()

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc(); sys.exit(1)
