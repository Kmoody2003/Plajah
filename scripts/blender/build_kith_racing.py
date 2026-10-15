"""
Headless Blender (bpy 5.0) asset generator for Kith Party — Kith Circuit 3D Racing.

Builds and exports:
  1. public/kith-party/models/karts.glb (All 10 Kith karts with articulated chassis + 4 wheels)
  2. public/kith-party/models/monuments.glb (GuardianMonument, SanctuaryMask, CrystalMonolith, FloatingMesa)
  3. public/kith-party/models/drivers.glb (8 vinyl-toy 3D Kith drivers; Rello & Chora use locked GLBs)
  4. Cycles GPU verification renders (when KITH_RACING_RENDER=1):
     - artifacts/kith-party/v2/blender-karts-lineup.png
     - artifacts/kith-party/v2/blender-hero-rear.png
"""
import os, sys, math, traceback
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "kith-party", "models")
ART_DIR = os.path.join(ROOT, "artifacts", "kith-party", "v2")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(ART_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Color & Math Utilities
# ---------------------------------------------------------------------------
def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=float)

def lin(c):
    c = np.asarray(c, dtype=float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def mix(a, b, t):
    t = np.clip(t, 0.0, 1.0)
    return a + (b - a) * t

def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob

def basis_to(d, up=Vector((0, 0, 1))):
    z = Vector(d).normalized()
    x = z.cross(Vector(up))
    if x.length < 1e-4:
        x = z.cross(Vector((1, 0, 0)))
    x.normalize()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed()

def verts_np(ob):
    n = len(ob.data.vertices)
    a = np.zeros(n * 3, dtype=float)
    ob.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)

def paint_np(ob, cols):
    me = ob.data
    n = len(me.vertices)
    c = np.ones((n, 4), dtype=float)
    c[:, :3] = lin(np.clip(cols, 0.0, 1.0))
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set("color", c.reshape(-1))
    me.color_attributes.active_color = attr
    try:
        me.color_attributes.render_color_index = me.color_attributes.find("Col")
    except Exception:
        pass

def paint_flat(ob, col):
    n = len(ob.data.vertices)
    paint_np(ob, np.tile(hexc(col) if isinstance(col, str) else np.asarray(col, float), (n, 1)))

def make_vcol_mat(name, rough=0.26, metal=0.22, coat=0.85, emit_strength=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = "Col"
    nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
    if emit_strength > 0 and 'Emission Color' in bsdf.inputs:
        nt.links.new(ca.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return m

def assign_mat(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob

def join_objects(obs, name):
    obs = [o for o in obs if o is not None]
    if not obs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    res = bpy.context.view_layer.objects.active
    res.name = name
    return res

def set_smooth(ob, smooth=True):
    ob.data.polygons.foreach_set("use_smooth", [smooth] * len(ob.data.polygons))
    ob.data.update()
    return ob

# ---------------------------------------------------------------------------
# Procedural Geometry Primitives (BMesh)
# ---------------------------------------------------------------------------
LIGHT_DIR = Vector((-0.42, -0.52, 0.74)).normalized()

def make_crystal_blade(name, base, direction, length, width, thick, col_base, col_mid, col_tip,
                       up=Vector((0, 0, 1)), bend=0.0, sweep=0.0, sharp=0.82, facet_boost=0.25, speckle=False):
    """Creates a faceted 6-sided crystal blade / wing with baked facet lighting, rim highlights, and 3-stop gradient."""
    M = basis_to(direction, up)
    rings = (-0.04, 0.0, 0.18, 0.42, 0.68, 0.88, 0.97)
    sec = [(1.0, 0.0), (0.48, 1.0), (-0.48, 1.0), (-1.0, 0.0), (-0.48, -1.0), (0.48, -1.0)]
    bm = bmesh.new()
    R = []
    a0, b0 = width * 0.5, thick * 0.5
    for v in rings:
        vv = max(v, 0.0)
        prof = max(1.0 - vv, 0.0) ** sharp * (1.0 + 0.24 * math.sin(math.pi * vv))
        a = max(a0 * prof, a0 * 0.07)
        b = max(b0 * (max(1.0 - vv ** 1.3, 0.0) ** 0.65), b0 * 0.14)
        cx = sweep * length * vv * vv
        cy = bend * length * vv * vv
        R.append(([M @ Vector((cx + sx * a, cy + sy * b, length * v)) + Vector(base) for sx, sy in sec], vv))
    apex = M @ Vector((sweep * length, bend * length, length * 1.03)) + Vector(base)

    cb = hexc(col_base) if isinstance(col_base, str) else np.asarray(col_base, float)
    cm = hexc(col_mid) if isinstance(col_mid, str) else np.asarray(col_mid, float)
    ct = hexc(col_tip) if isinstance(col_tip, str) else np.asarray(col_tip, float)

    def grad(vv):
        if vv < 0.48:
            return mix(cb, cm, vv / 0.48)
        return mix(cm, ct, (vv - 0.48) / 0.52)

    face_VertCols = []
    def add_tri(p0, p1, p2, v0, v1, v2, edge_mask=(0.0, 0.0, 0.0)):
        verts = [bm.verts.new(p0), bm.verts.new(p1), bm.verts.new(p2)]
        f = bm.faces.new(verts)
        f.normal_update()
        nrm = f.normal.normalized()
        tone = 1.0 + facet_boost * (nrm.dot(LIGHT_DIR) * 1.6 - 0.08)
        for p_co, vv, em in zip((p0, p1, p2), (v0, v1, v2), edge_mask):
            c = grad(vv) * tone + hexc('#fff6e0') * (em * 0.22)
            if speckle and vv < 0.65:
                hv = math.sin(p_co.x * 61.3 + p_co.y * 83.7 + p_co.z * 53.1) * 43758.54
                if (hv - math.floor(hv)) > 0.72:
                    c = mix(c, ct, 0.85)
            face_VertCols.append(np.clip(c, 0.0, 1.0))

    for i in range(len(R) - 1):
        pts0, v0 = R[i]
        pts1, v1 = R[i + 1]
        for k in range(6):
            k2 = (k + 1) % 6
            em0 = 1.0 if k in (0, 3) else 0.35
            em1 = 1.0 if k2 in (0, 3) else 0.35
            add_tri(pts0[k], pts0[k2], pts1[k2], v0, v0, v1, (em0, em1, em1))
            add_tri(pts0[k], pts1[k2], pts1[k], v0, v1, v1, (em0, em1, em0))
    pts_last, v_last = R[-1]
    for k in range(6):
        k2 = (k + 1) % 6
        add_tri(pts_last[k], pts_last[k2], apex, v_last, v_last, 1.0, (0.5, 0.5, 1.0))

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    set_smooth(ob, False)
    paint_np(ob, np.array(face_VertCols))
    return ob

def make_rounded_box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel_width=0.05, segments=1, col='#222538', smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if bevel_width > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel_width, segments=segments, profile=0.5, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    R = Euler(rot, 'XYZ').to_matrix()
    T = Vector(loc)
    for v in bm.verts:
        v.co = R @ v.co + T
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    set_smooth(ob, smooth)
    paint_flat(ob, col)
    return ob

def make_cylinder(name, r1, r2, depth, segs=18, loc=(0, 0, 0), rot=(0, 0, 0), col='#222538', smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    R = Euler(rot, 'XYZ').to_matrix()
    T = Vector(loc)
    for v in bm.verts:
        v.co = R @ v.co + T
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    set_smooth(ob, smooth)
    paint_flat(ob, col)
    return ob

def make_torus(name, major_r, minor_r, maj_seg=20, min_seg=8, loc=(0, 0, 0), rot=(0, 0, 0), col='#ff7700', arc=math.pi * 2):
    bm = bmesh.new()
    rings = []
    closed = abs(arc - math.pi * 2) < 1e-3
    steps = maj_seg if closed else maj_seg + 1
    for i in range(steps):
        a = arc * i / maj_seg
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for j in range(min_seg):
            b = 2.0 * math.pi * j / min_seg
            cb, sb = math.cos(b), math.sin(b)
            r = major_r + minor_r * cb
            ring.append(bm.verts.new((r * ca, r * sa, minor_r * sb)))
        rings.append(ring)
    n_rings = len(rings)
    for i in range(maj_seg):
        r0 = rings[i]
        r1 = rings[(i + 1) % n_rings]
        for j in range(min_seg):
            j2 = (j + 1) % min_seg
            bm.faces.new((r0[j], r1[j], r1[j2], r0[j2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    R = Euler(rot, 'XYZ').to_matrix()
    T = Vector(loc)
    for v in bm.verts:
        v.co = R @ v.co + T
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    set_smooth(ob, True)
    paint_flat(ob, col)
    return ob

def make_tube_curve(name, pts, radius, segs=7, col='#5c3d26', taper=1.0):
    bm = bmesh.new()
    pts_v = [Vector(p) for p in pts]
    dense = []
    for i in range(len(pts_v) - 1):
        p0 = pts_v[max(0, i - 1)]
        p1 = pts_v[i]
        p2 = pts_v[i + 1]
        p3 = pts_v[min(len(pts_v) - 1, i + 2)]
        for s in range(5):
            t = s / 5.0
            t2, t3 = t * t, t * t * t
            pos = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            dense.append(pos)
    dense.append(pts_v[-1])
    rings = []
    for idx, p in enumerate(dense):
        u = idx / max(1, len(dense) - 1)
        tang = (dense[min(len(dense) - 1, idx + 1)] - dense[max(0, idx - 1)]).normalized()
        M = basis_to(tang)
        r = radius * (1.0 - (1.0 - taper) * u)
        ring = []
        for j in range(segs):
            a = 2.0 * math.pi * j / segs
            off = M @ Vector((math.cos(a) * r, math.sin(a) * r, 0.0))
            ring.append(bm.verts.new(p + off))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][j2], rings[i + 1][j2] if False else rings[i][j2]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    set_smooth(ob, True)
    paint_flat(ob, col)
    return ob

# ---------------------------------------------------------------------------
# Sculpted Kart Builder (All 10 Kith Karts)
# ---------------------------------------------------------------------------
KART_SPECS = {
    'rello': dict(
        body='#141833', body_hi='#243166', accent='#ff6a00', fin_base='#181d42', fin_mid='#ff5e00', fin_tip='#ffc426',
        bumper='#f2eadc', rim='#ff7300', spring='#ff6a00', stitch='#ff7b00', style='ember', rugged=False, sleek=False
    ),
    'chora': dict(
        body='#631c6b', body_hi='#ad2485', accent='#ff2e93', fin_base='#69155b', fin_mid='#e8258b', fin_tip='#ff9cd6',
        bumper='#f5e9f7', rim='#ff389c', spring='#ff4da6', stitch='#ff85c2', style='petal', rugged=False, sleek=False
    ),
    'moki': dict(
        body='#2a5e4e', body_hi='#4d8c62', accent='#9ee34f', fin_base='#2e6339', fin_mid='#6ec24a', fin_tip='#d4ff70',
        bumper='#e8dfc5', rim='#a8eb52', spring='#78ba5e', stitch='#bee16f', style='grove', rugged=True, sleek=False
    ),
    'fenn': dict(
        body='#d8eefc', body_hi='#ffffff', accent='#29b6ff', fin_base='#2484d6', fin_mid='#4fd2ff', fin_tip='#f2fcff',
        bumper='#f7fbff', rim='#38d4ff', spring='#38c8ff', stitch='#54e1ff', style='frost', rugged=False, sleek=True
    ),
    'zippi': dict(
        body='#d99b1e', body_hi='#ffd24c', accent='#fff08a', fin_base='#c74328', fin_mid='#ff7338', fin_tip='#ffee82',
        bumper='#fff8e6', rim='#ffdd38', spring='#ff8833', stitch='#fff08a', style='volt', rugged=False, sleek=True
    ),
    'nori': dict(
        body='#1f6d8c', body_hi='#3aaed8', accent='#7cf5df', fin_base='#267899', fin_mid='#ff7d88', fin_tip='#ffb8b0',
        bumper='#ebfaf8', rim='#6ef2dc', spring='#ff858d', stitch='#7cf5df', style='tide', rugged=False, sleek=True
    ),
    'pippa': dict(
        body='#b84b82', body_hi='#e67cb2', accent='#ffe0a3', fin_base='#7d52ab', fin_mid='#c96bb8', fin_tip='#ffe3b8',
        bumper='#fff3eb', rim='#ff94c8', spring='#b382d6', stitch='#ffe0a3', style='bloom', rugged=False, sleek=False
    ),
    'bram': dict(
        body='#7d523c', body_hi='#a87458', accent='#f0c486', fin_base='#4a614d', fin_mid='#749c75', fin_tip='#c2e6b8',
        bumper='#e6dac8', rim='#ebb875', spring='#749c75', stitch='#f0c486', style='terra', rugged=True, sleek=False
    ),
    'luma': dict(
        body='#3e3f85', body_hi='#686ab8', accent='#f2e699', fin_base='#46549c', fin_mid='#8fa8f2', fin_tip='#fff5b8',
        bumper='#f0f0ff', rim='#f2e699', spring='#98b0f5', stitch='#f2e699', style='astral', rugged=False, sleek=True
    ),
    'tavi': dict(
        body='#9c4a28', body_hi='#c96b3b', accent='#ffc266', fin_base='#2b6e6c', fin_mid='#4aa8a4', fin_tip='#9ff2ec',
        bumper='#f2e4d0', rim='#ffb84d', spring='#4aa8a4', stitch='#ffc266', style='alloy', rugged=True, sleek=False
    ),
}

def make_sculpted_shell(kid, spec):
    """Creates a low-slung wedge-nosed aerodynamic kart body matching the concept art."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=6, use_grid_fill=True)
    sleek = 1.08 if spec['sleek'] else 1.0
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z  # in [-0.5, 0.5]
        u_f = 0.5 - y  # 0 at rear (+0.5), 1 at front (-0.5)
        # Taper sharply at the nose tip into a sleek V-wedge, wide muscular waist & rear quarters
        nose_taper = (1.0 - 0.52 * (max(0.0, u_f - 0.45) / 0.55) ** 1.5)
        waist_pinch = 1.0 - 0.12 * math.exp(-((u_f - 0.52) / 0.22) ** 2)
        px = x * 1.66 * nose_taper * waist_pinch
        # V-pointed nose extension at center front
        v_nose = 0.18 * (1.0 - min(1.0, abs(x) * 2.2)) * sstep(0.65, 1.0, u_f)
        py = y * 2.68 * sleek - v_nose
        # Low wedge slope at front nose (drops down to z=0.52 at the nose tip!), arched cowl before cockpit, muscular rear deck
        nose_drop = sstep(0.45, 0.98, u_f)
        cockpit_well = math.exp(-((py + 0.05) / 0.52) ** 2) * math.exp(-(px / 0.48) ** 2)
        cowl_arch = math.exp(-((py + 0.72) / 0.42) ** 2) * (1.0 - 0.35 * (px / 0.75) ** 2)
        rear_deck = math.exp(-((py - 0.88) / 0.56) ** 2)
        fender_arch = math.exp(-((abs(px) - 0.58) / 0.24) ** 2) * (
            math.exp(-((py + 0.85) / 0.42) ** 2) * 0.18 + math.exp(-((py - 0.82) / 0.48) ** 2) * 0.28
        )
        if z > 0:
            top_h = 0.84 * (1.0 - 0.36 * nose_drop) + 0.18 * cowl_arch + 0.24 * rear_deck + fender_arch - 0.25 * cockpit_well
            # Crisp center spine ridge along the sloped hood
            if py < -0.35:
                top_h += max(0.0, 0.08 * (1.0 - abs(px) / 0.26)) * sstep(-0.35, -1.0, py)
            pz = 0.46 + (top_h - 0.46) * (z + 0.5)
        else:
            pz = 0.38 + (z + 0.5) * 0.16
        v.co = Vector((px, py, pz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(f"{kid}_shell")
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(f"{kid}_shell", me))
    set_smooth(ob, True)

    # Vertex color painting: deep gloss gradient + cosmic starfield speckles + glowing orange/accent trim
    V = verts_np(ob)
    c_base = hexc(spec['body'])
    c_hi = hexc(spec['body_hi'])
    c_acc = hexc(spec['accent'])
    t_h = sstep(0.45, 0.92, V[:, 2])
    cols = mix(c_base[:, None], c_hi[:, None], t_h).T
    # Glowing side sill & fender rim accent
    outer_rim = sstep(0.58, 0.78, np.abs(V[:, 0])) * sstep(0.68, 0.48, V[:, 2])
    cols = mix(cols, np.tile(c_acc, (len(V), 1)), (outer_rim * 0.85)[:, None])
    # Cosmic starfield speckles across hood & flanks (signature Rello Ember Fang look!)
    hash_v = np.sin(V[:, 0] * 79.3 + V[:, 1] * 97.1 + V[:, 2] * 53.7) * 43758.5453
    frac = hash_v - np.floor(hash_v)
    thresh = 0.78 if kid == 'rello' else 0.91
    speckle_mask = (frac > thresh).astype(float) * sstep(0.48, 0.65, V[:, 2])
    cols = mix(cols, np.tile(hexc('#ff9d2e') if kid == 'rello' else c_acc, (len(V), 1)), (speckle_mask * 0.85)[:, None])
    paint_np(ob, cols)
    return ob

def make_fanged_bumper(name, y_pos, is_rear, col_bumper, col_dark, col_accent):
    """Builds the sculpted ivory/cream fanged bumper/splitter (front or rear) with V-notch and dark triangular cutouts."""
    parts = []
    sign_y = 1.0 if is_rear else -1.0
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=5, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        px = x * (1.42 if is_rear else 1.54)
        # V-swept wrap around nose/tail
        curve_y = (abs(px) ** 1.5) * 0.22 * (-sign_y)
        py = y_pos + y * 0.22 + curve_y
        wing_lift = (abs(px) ** 1.4) * 0.14
        # Center V-dip on top edge (matching the rear diffuser in the concept art!)
        v_dip = 0.08 * (1.0 - min(1.0, abs(px) / 0.35)) if z > 0 else 0.0
        pz = (0.43 if is_rear else 0.42) + z * 0.23 + wing_lift - v_dip
        v.co = Vector((px, py, pz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    main_b = link(bpy.data.objects.new(name, me))
    set_smooth(main_b, True)
    V = verts_np(main_b)
    cb = hexc(col_bumper)
    cols = mix((cb * 0.84)[:, None], cb[:, None], sstep(0.32, 0.56, V[:, 2])).T
    paint_np(main_b, cols)
    parts.append(main_b)

    # Recessed dark triangular fang vents on left & right
    for side in (-1.0, 1.0):
        for idx, (vx, vz, sx, sz, tilt) in enumerate(((0.42, 0.44, 0.20, 0.095, 0.38), (0.20, 0.41, 0.13, 0.075, -0.30))):
            wy = y_pos + sign_y * 0.10 - (abs(vx) ** 1.5) * 0.20 * sign_y
            tooth = make_rounded_box(
                f"{name}_vent_{side}_{idx}",
                (sx, 0.07, sz),
                loc=(side * vx, wy, vz),
                rot=(0.0, side * tilt, -side * 0.28 * sign_y),
                bevel_width=0.012, segments=1, col=col_dark, smooth=False
            )
            parts.append(tooth)
    return parts

def make_wheel_assembly(kid, spec, wheel_name, side, y_pos, is_rear, mat_body):
    """Builds a smooth bevelled wide racing slick (or chunky offroad mud tire for Moki/Bram/Tavi) with glowing rim ring & crown hub."""
    # Hot-rod rake: rear wheels are taller & wider than front wheels (matching concept art!)
    radius = (0.49 if is_rear else 0.42) if not spec['rugged'] else (0.50 if is_rear else 0.45)
    width = (0.48 if is_rear else 0.38)
    parts = []

    # 1. Wide bevelled racing slick tire with rounded shoulders
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=radius, radius2=radius, depth=width)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4],
                    offset=0.075, segments=3, profile=0.65, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    R = Euler((0, math.pi / 2, 0), 'XYZ').to_matrix()
    for v in bm.verts:
        v.co = R @ v.co
    me = bpy.data.meshes.new(f"{wheel_name}_tire")
    bm.to_mesh(me)
    bm.free()
    tire = link(bpy.data.objects.new(f"{wheel_name}_tire", me))
    set_smooth(tire, True)
    # Subtle tread band shading in vertex colors
    V = verts_np(tire)
    r_dist = np.hypot(V[:, 1], V[:, 2])
    c_tire = hexc('#171824')
    c_shoulder = hexc('#232536')
    groove = np.sin(np.arctan2(V[:, 2], V[:, 1]) * 18.0) * sstep(radius * 0.85, radius * 0.98, r_dist)
    cols = mix(c_tire[:, None], c_shoulder[:, None], np.clip(groove * 0.35 + 0.25, 0.0, 1.0)).T
    paint_np(tire, cols)
    parts.append(tire)

    # Low-profile tangential mud lugs ONLY on rugged karts (Moki, Bram, Tavi)
    if spec['rugged']:
        for j in range(12):
            a = 2.0 * math.pi * j / 12
            cy, cz = math.cos(a) * (radius - 0.005), math.sin(a) * (radius - 0.005)
            lug_col = '#48733c' if (kid == 'moki' and j % 3 == 0) else '#222433'
            # rot=(a, 0, 0): local Z is radial, local Y is tangential!
            lug = make_rounded_box(
                f"{wheel_name}_lug_{j}",
                (width * 0.76, 0.11, 0.028),
                loc=(0, cy, cz), rot=(a, 0, 0), bevel_width=0.008, segments=1, col=lug_col, smooth=True
            )
            parts.append(lug)

    # 2. Deep-dish dark alloy barrel + glowing colored outer rim ring
    parts.append(make_cylinder(f"{wheel_name}_dish", radius * 0.65, radius * 0.58, width * 0.90, segs=22,
                               loc=(0, 0, 0), rot=(0, math.pi / 2, 0), col='#11121c'))
    parts.append(make_torus(f"{wheel_name}_ring", radius * 0.68, 0.036, maj_seg=24, min_seg=8,
                            loc=(side * (width * 0.42), 0, 0), rot=(0, math.pi / 2, 0), col=spec['rim']))
    # Inner rim ring (visible on inside of rear tires in rear-3/4 view!)
    parts.append(make_torus(f"{wheel_name}_inner_ring", radius * 0.68, 0.028, maj_seg=20, min_seg=6,
                            loc=(-side * (width * 0.40), 0, 0), rot=(0, math.pi / 2, 0), col='#983878' if kid == 'rello' else spec['rim']))

    # 3. Sculpted 3-Flame Crown / Swirl Wheel Hub Emblem inside the wheel dish (matching concept art!)
    parts.append(make_cylinder(f"{wheel_name}_hub", radius * 0.28, radius * 0.22, 0.06, segs=16,
                               loc=(side * (width * 0.36), 0, 0), rot=(0, math.pi / 2, 0), col=spec['rim']))
    n_prongs = 3 if kid in ('rello', 'fenn', 'zippi') else 5
    for p_idx in range(n_prongs):
        pa = 2.0 * math.pi * p_idx / n_prongs
        parts.append(make_rounded_box(
            f"{wheel_name}_prong_{p_idx}",
            (0.045, radius * 0.48, 0.11),
            loc=(side * (width * 0.37), math.cos(pa) * radius * 0.24, math.sin(pa) * radius * 0.24),
            rot=(pa + (0.38 if kid == 'chora' else 0.0), 0, 0),
            bevel_width=0.012, segments=1, col=spec['rim'], smooth=True
        ))

    wheel_mesh = join_objects(parts, wheel_name)
    assign_mat(wheel_mesh, mat_body)
    wheel_mesh.location = Vector((side * (1.05 if is_rear else 0.98), y_pos, radius))
    return wheel_mesh

def build_kart(kid, spec, mat_body, mat_glow):
    """Builds a complete hero kart parented under Empty `kart_<kid>`."""
    root = link(bpy.data.objects.new(f"kart_{kid}", None))
    root.empty_display_size = 0.5

    body_parts = []
    glow_parts = []

    # 1. Sculpted wedge-nosed aerodynamic shell + undertray
    body_parts.append(make_sculpted_shell(kid, spec))
    body_parts.append(make_rounded_box(f"{kid}_undertray", (1.36, 2.42, 0.18), loc=(0, 0.0, 0.36), bevel_width=0.04, col='#10121c'))

    # 2. Front Fanged Bumper & Large Angled Teardrop Headlamps (-Y is forward)
    body_parts.extend(make_fanged_bumper(f"{kid}_front_bumper", -1.36, False, spec['bumper'], '#141524', spec['accent']))
    for side in (-1.0, 1.0):
        # Angled glowing headlamp lenses set into the front fender slopes
        hl = make_crystal_blade(
            f"{kid}_headlamp_{side}",
            base=(side * 0.32, -1.24, 0.58),
            direction=(side * 0.55, 0.72, 0.42),
            length=0.42, width=0.16, thick=0.08,
            col_base=spec['accent'], col_mid='#ffbe3b' if kid != 'fenn' else '#6ef2ff', col_tip='#ffffff'
        )
        glow_parts.append(hl)

    # 3. Rear Fanged Diffuser + Dual Jet Exhausts (O  O) + Central Orange Trapezoid Core (+Y is rear)
    body_parts.extend(make_fanged_bumper(f"{kid}_rear_bumper", +1.36, True, spec['bumper'], '#141524', spec['accent']))
    # Dark mechanical rear block & central divider rib
    body_parts.append(make_rounded_box(f"{kid}_rear_housing", (1.08, 0.34, 0.32), loc=(0, 1.24, 0.58), bevel_width=0.04, col='#171926'))
    body_parts.append(make_rounded_box(f"{kid}_rear_divider", (0.14, 0.22, 0.28), loc=(0, 1.36, 0.56), rot=(-0.15, 0, 0), bevel_width=0.02, col='#222538'))
    # Central glowing orange trapezoidal reactor taillight above the exhausts (exact concept art detail!)
    rear_core = make_rounded_box(f"{kid}_rear_core", (0.24, 0.10, 0.17), loc=(0, 1.34, 0.74), rot=(-0.22, 0, 0), bevel_width=0.02, col=spec['accent'])
    glow_parts.append(rear_core)
    # Sculpted dark-navy cowl arch framing the central rear taillight
    body_parts.append(make_rounded_box(f"{kid}_rear_cowl", (0.58, 0.28, 0.14), loc=(0, 1.22, 0.85), rot=(-0.18, 0, 0), bevel_width=0.03, col=spec['body_hi']))

    for side in (-1.0, 1.0):
        ex_x, ex_y, ex_z = side * 0.27, 1.34, 0.56
        body_parts.append(make_cylinder(f"{kid}_ex_barrel_{side}", 0.15, 0.17, 0.36, segs=20, loc=(ex_x, ex_y - 0.04, ex_z), rot=(math.pi / 2, 0, 0), col='#1f2233'))
        glow_parts.append(make_torus(f"{kid}_ex_ring_{side}", 0.135, 0.036, maj_seg=20, min_seg=10, loc=(ex_x, ex_y + 0.12, ex_z), rot=(math.pi / 2, 0, 0), col=spec['accent']))
        glow_parts.append(make_cylinder(f"{kid}_ex_core_{side}", 0.095, 0.095, 0.14, segs=16, loc=(ex_x, ex_y + 0.06, ex_z), rot=(math.pi / 2, 0, 0), col='#ffd670'))

    # 4. Bolstered Racing Bucket Seat with Contrast Stitching Ribs & Sport Steering Wheel
    body_parts.append(make_rounded_box(f"{kid}_seat_base", (0.76, 0.72, 0.16), loc=(0, 0.18, 0.58), bevel_width=0.04, col='#141624'))
    body_parts.append(make_rounded_box(f"{kid}_seat_back", (0.72, 0.20, 0.82), loc=(0, 0.58, 1.02), rot=(-0.16, 0, 0), bevel_width=0.05, col='#141624'))
    for side in (-1.0, 1.0):
        body_parts.append(make_rounded_box(f"{kid}_bolster_{side}", (0.13, 0.26, 0.72), loc=(side * 0.34, 0.50, 0.98), rot=(-0.16, 0, side * 0.10), bevel_width=0.03, col='#1b1e30'))
        glow_parts.append(make_tube_curve(f"{kid}_stitch_{side}", [
            (side * 0.33, 0.36, 0.66), (side * 0.35, 0.44, 1.02), (side * 0.25, 0.52, 1.38), (0.0, 0.54, 1.41)
        ], 0.015, segs=6, col=spec['stitch']))
    body_parts.append(make_cylinder(f"{kid}_steer_col", 0.04, 0.04, 0.42, segs=12, loc=(0, -0.44, 0.78), rot=(0.55, 0, 0), col='#6d7691'))
    body_parts.append(make_torus(f"{kid}_steer_wheel", 0.20, 0.032, maj_seg=18, min_seg=8, loc=(0, -0.36, 0.96), rot=(0.55, 0, 0), col='#161826'))

    # 5. Exposed Helical Coilover Suspension Springs (vivid and clearly visible in both front & rear-3/4 views!)
    for side in (-1.0, 1.0):
        for y_pos, sx_pos in ((-0.88, 0.66), (0.86, 0.68)):
            body_parts.append(make_cylinder(f"{kid}_shock_{side}_{y_pos}", 0.042, 0.042, 0.42, segs=10,
                                            loc=(side * sx_pos, y_pos, 0.55), rot=(0, -side * 0.18, 0), col='#2a2e45'))
            coil_pts = []
            for k in range(34):
                u = k / 33.0
                ang = u * 5.5 * 2.0 * math.pi
                cx = side * (sx_pos + (u - 0.5) * 0.07) + math.cos(ang) * 0.082
                cy = y_pos + math.sin(ang) * 0.082
                cz = 0.38 + u * 0.34
                coil_pts.append((cx, cy, cz))
            glow_parts.append(make_tube_curve(f"{kid}_coil_{side}_{y_pos}", coil_pts, 0.025, segs=7, col=spec['spring']))

    # 6. Signature Faceted Crystal Wings, Rear Quarter Fenders, & Hero Customizations
    is_rello = (kid == 'rello')
    for side in (-1.0, 1.0):
        # Chunky faceted rear quarter fender wing sweeping over the rear tire (speckled navy base -> fiery orange tip!)
        glow_parts.append(make_crystal_blade(
            f"{kid}_rear_wing_{side}",
            base=(side * 0.46, 0.58, 0.72),
            direction=(side * 0.52, 0.64, 0.56),
            length=1.18, width=0.68, thick=0.28,
            col_base=spec['fin_base'], col_mid=spec['fin_mid'], col_tip=spec['fin_tip'],
            bend=0.12, sweep=side * 0.14, speckle=is_rello
        ))
        # Tall dorsal shark-fin blade rising behind cockpit (dark navy outer spine + glowing orange/magenta edge)
        glow_parts.append(make_crystal_blade(
            f"{kid}_dorsal_fin_{side}",
            base=(side * 0.44, 0.62, 0.78),
            direction=(side * 0.18, 0.42, 0.88),
            length=1.16, width=0.48, thick=0.18,
            col_base=spec['fin_base'], col_mid=spec['fin_mid'], col_tip='#ff2e93' if is_rello else spec['fin_tip'],
            bend=-0.10, sweep=side * 0.06, speckle=is_rello
        ))
        # Front fender swept wing blade
        glow_parts.append(make_crystal_blade(
            f"{kid}_front_wing_{side}",
            base=(side * 0.54, -0.62, 0.62),
            direction=(side * 0.48, 0.74, 0.46),
            length=0.92, width=0.46, thick=0.18,
            col_base=spec['fin_base'], col_mid=spec['fin_mid'], col_tip=spec['fin_tip'],
            bend=0.08, sweep=side * 0.14, speckle=is_rello
        ))
        # Hood brow spikes
        glow_parts.append(make_crystal_blade(
            f"{kid}_nose_horn_{side}",
            base=(side * 0.24, -0.92, 0.66),
            direction=(side * 0.26, 0.68, 0.68),
            length=0.52, width=0.24, thick=0.12,
            col_base=spec['fin_base'], col_mid=spec['fin_mid'], col_tip=spec['fin_tip']
        ))

    if kid == 'rello':
        # Center dorsal nose horn + mid-flank Ember Fang crystal blades
        glow_parts.append(make_crystal_blade(
            "rello_nose_center", base=(0.0, -1.16, 0.58), direction=(0.0, 0.52, 0.85),
            length=0.52, width=0.24, thick=0.14, col_base='#141833', col_mid='#28356e', col_tip='#ff7300'
        ))
        for side in (-1.0, 1.0):
            glow_parts.append(make_crystal_blade(
                f"rello_mid_blade_{side}", base=(side * 0.64, -0.02, 0.66), direction=(side * 0.56, 0.65, 0.50),
                length=0.86, width=0.42, thick=0.16, col_base='#181d42', col_mid='#ff6a00', col_tip='#ffc426', speckle=True
            ))
    elif kid == 'chora':
        # Petal Pulse: Large, prominent 3D Golden Eighth-Note '♫' sitting PROUD on top of the sloped magenta hood!
        for nx in (-0.11, 0.11):
            glow_parts.append(make_cylinder(f"chora_note_head_{nx}", 0.065, 0.065, 0.05, segs=14,
                                            loc=(nx, -0.88, 0.73), rot=(0.42, 0, 0), col='#ffd24d'))
            glow_parts.append(make_rounded_box(f"chora_note_stem_{nx}", (0.036, 0.22, 0.045),
                                               loc=(nx + 0.04, -1.00, 0.80), rot=(0.42, 0, 0), bevel_width=0.008, col='#ffd24d'))
        glow_parts.append(make_rounded_box("chora_note_beam", (0.26, 0.06, 0.045),
                                           loc=(0.04, -1.10, 0.85), rot=(0.42, 0, -0.08), bevel_width=0.008, col='#ffd24d'))
        # Extra swept petal wings & dual rear sonic woofers
        for side in (-1.0, 1.0):
            glow_parts.append(make_crystal_blade(
                f"chora_mid_petal_{side}", base=(side * 0.64, 0.0, 0.68), direction=(side * 0.58, 0.62, 0.52),
                length=0.92, width=0.48, thick=0.16, col_base='#69155b', col_mid='#e8258b', col_tip='#ffb3e0'
            ))
            body_parts.append(make_cylinder(f"chora_woofer_{side}", 0.20, 0.16, 0.22, segs=18, loc=(side * 0.52, 0.92, 0.96), rot=(math.pi / 2, 0, 0), col='#22142b'))
            glow_parts.append(make_torus(f"chora_woofer_rim_{side}", 0.17, 0.035, maj_seg=18, min_seg=8, loc=(side * 0.52, 1.03, 0.96), rot=(math.pi / 2, 0, 0), col='#ffd24d'))
    elif kid == 'moki':
        # Grove Runner: Carved ivory-and-green leaf mask shield on nose + twisted wooden branch roll-cage + hanging amber lantern!
        glow_parts.append(make_crystal_blade(
            "moki_nose_crest", base=(0.0, -1.25, 0.55), direction=(0.0, 0.65, 0.75),
            length=0.65, width=0.52, thick=0.16, col_base='#2e6339', col_mid='#78ba5e', col_tip='#d4ff70'
        ))
        for side in (-1.0, 1.0):
            body_parts.append(make_tube_curve(f"moki_branch_arch_{side}", [
                (side * 0.58, -0.52, 0.70), (side * 0.64, -0.18, 1.38), (side * 0.50, 0.32, 1.72),
                (side * 0.58, 0.78, 1.32), (side * 0.56, 0.88, 0.76)
            ], 0.062, segs=8, col='#5c3d26', taper=0.85))
            for l_idx, (ly, lz) in enumerate(((-0.22, 1.40), (0.22, 1.72), (0.66, 1.38))):
                glow_parts.append(make_crystal_blade(
                    f"moki_cage_leaf_{side}_{l_idx}", base=(side * 0.58, ly, lz),
                    direction=(side * 0.65, 0.35, 0.65), length=0.36, width=0.20, thick=0.08,
                    col_base='#2e6339', col_mid='#78ba5e', col_tip='#d4ff70'
                ))
        body_parts.append(make_tube_curve("moki_branch_cross1", [(-0.50, 0.32, 1.72), (0.0, 0.38, 1.80), (0.50, 0.32, 1.72)], 0.052, segs=8, col='#5c3d26'))
        body_parts.append(make_tube_curve("moki_branch_cross2", [(-0.60, -0.16, 1.38), (0.0, -0.22, 1.46), (0.60, -0.16, 1.38)], 0.048, segs=8, col='#5c3d26'))
        body_parts.append(make_tube_curve("moki_lantern_twig", [(-0.58, -0.20, 1.38), (-0.78, -0.30, 1.48), (-0.82, -0.30, 1.34)], 0.025, segs=6, col='#5c3d26'))
        glow_parts.append(make_crystal_blade("moki_lantern_gem", base=(-0.82, -0.30, 1.34), direction=(0, 0, -1), length=0.32, width=0.20, thick=0.20, col_base='#ff8800', col_mid='#ffbb33', col_tip='#fff6cc'))
    elif kid == 'fenn':
        # Frostwing: Sweeping 3-tier translucent ice-crystal feather wings + origami ice nose crest
        glow_parts.append(make_crystal_blade(
            "fenn_nose_ice", base=(0.0, -1.22, 0.56), direction=(0.0, 0.68, 0.72),
            length=0.62, width=0.36, thick=0.14, col_base='#2484d6', col_mid='#4fd2ff', col_tip='#ffffff'
        ))
        for side in (-1.0, 1.0):
            for tier in range(3):
                glow_parts.append(make_crystal_blade(
                    f"fenn_feather_{side}_{tier}",
                    base=(side * (0.56 + tier * 0.11), 0.10 + tier * 0.26, 0.70 + tier * 0.07),
                    direction=(side * 0.54, 0.72, 0.44 - tier * 0.07),
                    length=1.22 - tier * 0.10, width=0.40, thick=0.13,
                    col_base='#2484d6', col_mid='#54e1ff', col_tip='#ffffff',
                    bend=0.08, sweep=side * 0.20
                ))

    chassis_body = join_objects(body_parts, f"{kid}_chassis_body")
    assign_mat(chassis_body, mat_body)
    chassis_glow = join_objects(glow_parts, f"{kid}_chassis_glow")
    assign_mat(chassis_glow, mat_glow)
    chassis = join_objects([chassis_body, chassis_glow], f"{kid}_chassis")
    chassis.parent = root

    # 4 Articulated Wheels: RL, RR, FL, FR
    w_rl = make_wheel_assembly(kid, spec, f"{kid}_wheel_rl", -1.0, +0.86, True, mat_body)
    w_rr = make_wheel_assembly(kid, spec, f"{kid}_wheel_rr", +1.0, +0.86, True, mat_body)
    w_fl = make_wheel_assembly(kid, spec, f"{kid}_wheel_fl", -1.0, -0.90, False, mat_body)
    w_fr = make_wheel_assembly(kid, spec, f"{kid}_wheel_fr", +1.0, -0.90, False, mat_body)
    for w in (w_rl, w_rr, w_fl, w_fr):
        w.parent = root

    return root

# ---------------------------------------------------------------------------
# World Monuments Builder (Colossal Kith Guardian, Cliff Sanctuary Mask, Crystal Monolith, Floating Mesa)
# ---------------------------------------------------------------------------
def build_monuments(mat_stone, mat_crystal):
    roots = []

    # 1. GuardianMonument: Colossal Carved Stone Kitsune/Kith Guardian Head + Giant Crystal Crown Blades
    g_root = link(bpy.data.objects.new("GuardianMonument", None))
    stone_parts = []
    crys_parts = []

    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        cheek_flare = 1.0 + 0.34 * math.exp(-((z + 0.12) / 0.38) ** 2) * (abs(x) ** 0.8)
        muzzle_protrude = 0.30 * math.exp(-((x / 0.42) ** 2 + ((z + 0.28) / 0.32) ** 2)) * max(0.0, -y)
        px = x * 12.0 * cheek_flare
        py = y * 8.5 - muzzle_protrude * 8.2
        pz = z * 10.5 + 10.8
        v.co = Vector((px, py, pz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("guardian_head_stone")
    bm.to_mesh(me)
    bm.free()
    head_ob = link(bpy.data.objects.new("guardian_head_stone", me))
    set_smooth(head_ob, True)
    V = verts_np(head_ob)
    front_mask = sstep(-2.2, -6.8, V[:, 1]) * sstep(19.0, 13.5, V[:, 2])
    c_cliff = hexc('#9884ab')
    c_face = hexc('#f2e6d8')
    cols = mix(c_cliff[:, None], c_face[:, None], front_mask).T
    paint_np(head_ob, cols)
    stone_parts.append(head_ob)

    for side in (-1.0, 1.0):
        # Serene curved closed crescent eye slit (︶  ︶)
        eye_pts = [
            (side * 1.6, -8.2, 10.0),
            (side * 3.4, -8.5, 9.2),
            (side * 5.2, -7.9, 9.8),
            (side * 6.8, -6.8, 11.0),
        ]
        stone_parts.append(make_tube_curve(f"guardian_eye_{side}", eye_pts, 0.46, segs=8, col='#2a1e38', taper=0.6))
        brow_pts = [
            (side * 1.2, -7.9, 11.5),
            (side * 4.0, -8.2, 12.2),
            (side * 7.2, -6.9, 13.4),
        ]
        stone_parts.append(make_tube_curve(f"guardian_brow_{side}", brow_pts, 0.58, segs=8, col='#746087', taper=0.7))
        stone_parts.append(make_tube_curve(f"guardian_cheek_{side}", [
            (side * 6.5, -6.5, 7.4), (side * 9.2, -4.8, 7.8), (side * 11.0, -2.8, 8.8)
        ], 0.38, segs=6, col='#cbbba8', taper=0.5))

    stone_parts.append(make_rounded_box("guardian_nose", (1.9, 1.3, 1.2), loc=(0, -9.0, 7.5), rot=(0.2, 0, 0), bevel_width=0.25, col='#2a1e38'))
    crys_parts.append(make_crystal_blade(
        "guardian_forehead_gem", base=(0, -7.8, 12.4), direction=(0, -0.22, 0.97),
        length=4.5, width=2.4, thick=1.0, col_base='#59226b', col_mid='#ff7b00', col_tip='#ffd966'
    ))

    crown_specs = [
        (0.0, 2.0, 18.8, (0.0, 0.12, 0.99), 15.5, 7.2, '#8a1c68', '#ff6a00', '#ffd24d'),
        (-6.0, 1.5, 16.8, (-0.38, 0.08, 0.92), 17.5, 7.8, '#6e1658', '#ff5500', '#ffc83b'),
        (+6.0, 1.5, 16.8, (+0.38, 0.08, 0.92), 17.5, 7.8, '#6e1658', '#ff5500', '#ffc83b'),
        (-10.6, 2.2, 12.8, (-0.68, 0.12, 0.72), 15.0, 6.5, '#5c1452', '#e8258b', '#ff944d'),
        (+10.6, 2.2, 12.8, (+0.68, 0.12, 0.72), 15.0, 6.5, '#5c1452', '#e8258b', '#ff944d'),
        (-13.2, 3.0, 7.8, (-0.86, 0.15, 0.48), 12.5, 5.5, '#4a1248', '#d41c7a', '#ff7733'),
        (+13.2, 3.0, 7.8, (+0.86, 0.15, 0.48), 12.5, 5.5, '#4a1248', '#d41c7a', '#ff7733'),
    ]
    for idx, (bx, by, bz, bdir, blen, bwid, c0, c1, c2) in enumerate(crown_specs):
        crys_parts.append(make_crystal_blade(
            f"guardian_crown_{idx}", base=(bx, by, bz), direction=bdir,
            length=blen, width=bwid, thick=3.0, col_base=c0, col_mid=c1, col_tip=c2, facet_boost=0.28, speckle=True
        ))

    g_stone = join_objects(stone_parts, "GuardianMonument_Stone")
    assign_mat(g_stone, mat_stone)
    g_stone.parent = g_root
    g_crys = join_objects(crys_parts, "GuardianMonument_Crystal")
    assign_mat(g_crys, mat_crystal)
    g_crys.parent = g_root
    roots.append(g_root)

    # 2. SanctuaryMask: Cliffside White Stone Cat/Kith Mask Sanctuary
    s_root = link(bpy.data.objects.new("SanctuaryMask", None))
    s_parts = []
    s_head = make_rounded_box("sanctuary_face", (9.5, 5.8, 7.8), loc=(0, 0, 4.5), bevel_width=1.8, segments=3, col='#eee6dc', smooth=True)
    s_parts.append(s_head)
    for side in (-1.0, 1.0):
        s_parts.append(make_crystal_blade(
            f"sanctuary_ear_{side}", base=(side * 3.3, 0.2, 7.6), direction=(side * 0.28, 0.0, 0.96),
            length=5.5, width=3.6, thick=2.3, col_base='#b8a9c4', col_mid='#dfd5c8', col_tip='#f7f2eb'
        ))
        s_parts.append(make_rounded_box(
            f"sanctuary_eye_{side}", (2.3, 1.2, 2.9), loc=(side * 2.2, -2.6, 4.2),
            rot=(0, side * 0.25, 0), bevel_width=0.5, segments=2, col='#261d36', smooth=True
        ))
    s_parts.append(make_crystal_blade(
        "sanctuary_mark", base=(0, -2.7, 5.9), direction=(0, -0.1, 0.99),
        length=2.3, width=1.4, thick=0.6, col_base='#36284a', col_mid='#523d6e', col_tip='#785e96'
    ))
    s_mesh = join_objects(s_parts, "SanctuaryMask_Mesh")
    assign_mat(s_mesh, mat_stone)
    s_mesh.parent = s_root
    roots.append(s_root)

    # 3. CrystalMonolith: Giant Swept Curved Flame-Crystal Monolith Fin with Stone Base Arch
    m_root = link(bpy.data.objects.new("CrystalMonolith", None))
    m_stone = []
    m_stone.append(make_torus("monolith_arch", 3.8, 1.2, maj_seg=18, min_seg=8, loc=(0, 0, 0.5), rot=(math.pi / 2, 0, 0), col='#96839e', arc=math.pi))
    m_stone.append(make_rounded_box("monolith_plinth", (9.6, 3.8, 1.8), loc=(0, 0, 0.4), bevel_width=0.25, col='#84728c'))
    m_stone_ob = join_objects(m_stone, "CrystalMonolith_Base")
    assign_mat(m_stone_ob, mat_stone)
    m_stone_ob.parent = m_root

    m_blade = make_crystal_blade(
        "CrystalMonolith_Blade", base=(0, 0, 0.8), direction=(-0.18, 0.0, 0.98),
        length=24.0, width=8.2, thick=2.8, col_base='#7d1866', col_mid='#ff6200', col_tip='#ffd44d',
        bend=0.0, sweep=0.24, sharp=0.78, facet_boost=0.30, speckle=True
    )
    assign_mat(m_blade, mat_crystal)
    m_blade.parent = m_root
    roots.append(m_root)

    # 4. FloatingMesa: Craggy Layered Floating Rock Island with Tapered Roots & Moss Cap
    f_root = link(bpy.data.objects.new("FloatingMesa", None))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=26, radius1=0.15, radius2=1.0, depth=1.8)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        a = math.atan2(y, x)
        u = (z + 0.9) / 1.8
        crag = 1.0 + 0.15 * math.sin(a * 7.0 + z * 3.0) + 0.10 * math.cos(a * 11.0 - z * 5.0)
        rad_prof = (u ** 0.56) * crag
        px = x * 10.0 * rad_prof
        py = y * 10.0 * rad_prof
        pz = (z - 0.9) * 8.8 + (0.45 * math.sin(a * 5.0) * (1.0 - u))
        v.co = Vector((px, py, pz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("FloatingMesa_Rock")
    bm.to_mesh(me)
    bm.free()
    rock_ob = link(bpy.data.objects.new("FloatingMesa_Rock", me))
    set_smooth(rock_ob, False)
    V = verts_np(rock_ob)
    top_grass = sstep(-1.2, -0.15, V[:, 2])
    c_rock_lo = hexc('#685678')
    c_rock_hi = hexc('#a894ba')
    c_grass = hexc('#78a65e')
    rock_col = mix(c_rock_lo[:, None], c_rock_hi[:, None], sstep(-15.0, -1.5, V[:, 2])).T
    cols = mix(rock_col, np.tile(c_grass, (len(V), 1)), top_grass[:, None])
    paint_np(rock_ob, cols)
    assign_mat(rock_ob, mat_stone)
    rock_ob.parent = f_root
    roots.append(f_root)

    # 5. AbyssalLeviathan: Bioluminescent Deep-Sea Whale-Dragon for Abyssal Glass Trench
    lev_root = link(bpy.data.objects.new("AbyssalLeviathan", None))
    lev_body = []
    lev_glow = []
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        # Streamlined undulating leviathan body along Y axis
        taper = max(0.12, 1.0 - 0.55 * max(0.0, y))
        wave = 0.25 * math.sin(y * 3.5)
        v.co = Vector((x * 4.5 * taper + wave, y * 16.0, z * 3.2 * taper))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("Leviathan_Body")
    bm.to_mesh(me)
    bm.free()
    lev_ob = link(bpy.data.objects.new("Leviathan_Body", me))
    set_smooth(lev_ob, True)
    V = verts_np(lev_ob)
    belly = sstep(0.8, -1.5, V[:, 2])
    stripes = 0.5 + 0.5 * np.sin(V[:, 1] * 1.4 + np.abs(V[:, 0]) * 0.8)
    c_deep = hexc('#091c3a')
    c_cyan = hexc('#00f0ff')
    c_mag = hexc('#ff2a9d')
    cols = mix(c_deep[:, None], c_cyan[:, None], (belly * 0.7 + stripes * 0.35)).T
    paint_np(lev_ob, cols)
    lev_body.append(lev_ob)
    for side in (-1.0, 1.0):
        # Sweeping pectoral wing-fins & tail flukes + glowing eyes
        lev_glow.append(make_crystal_blade(
            f"lev_pec_{side}", base=(side * 3.2, -3.5, -0.4), direction=(side * 0.88, 0.38, -0.22),
            length=11.5, width=4.6, thick=0.8, col_base='#0b2b5c', col_mid='#00e5ff', col_tip='#ff38a8', sweep=side * 0.28
        ))
        lev_glow.append(make_crystal_blade(
            f"lev_fluke_{side}", base=(side * 0.6, 14.2, 0.0), direction=(side * 0.76, 0.62, 0.15),
            length=7.2, width=3.2, thick=0.6, col_base='#0b2b5c', col_mid='#00f2ff', col_tip='#9dffea'
        ))
        lev_glow.append(make_crystal_blade(
            f"lev_eye_{side}", base=(side * 3.4, -10.5, 0.6), direction=(side * 0.85, -0.45, 0.25),
            length=1.8, width=1.1, thick=0.7, col_base='#00ffff', col_mid='#80ffff', col_tip='#ffffff'
        ))
    for d_idx in range(4):
        lev_glow.append(make_crystal_blade(
            f"lev_dorsal_{d_idx}", base=(0.0, -5.0 + d_idx * 4.5, 2.5 - d_idx * 0.35),
            direction=(0.0, 0.55, 0.83), length=5.2 - d_idx * 0.7, width=2.2, thick=0.6,
            col_base='#142864', col_mid='#ff2e93', col_tip='#00f2ff'
        ))
    lb_mesh = join_objects(lev_body, "AbyssalLeviathan_Stone")
    assign_mat(lb_mesh, mat_stone)
    lb_mesh.parent = lev_root
    lg_mesh = join_objects(lev_glow, "AbyssalLeviathan_Crystal")
    assign_mat(lg_mesh, mat_crystal)
    lg_mesh.parent = lev_root
    roots.append(lev_root)

    # 6. BiolumManta: Neon-Cyan & Violet Glowing Sea Manta Ray
    manta_root = link(bpy.data.objects.new("BiolumManta", None))
    manta_parts = []
    manta_parts.append(make_rounded_box("manta_core", (3.2, 5.4, 0.9), loc=(0, 0, 0), bevel_width=0.4, col='#102a52', smooth=True))
    for side in (-1.0, 1.0):
        manta_parts.append(make_crystal_blade(
            f"manta_wing_{side}", base=(side * 1.1, -0.5, 0.0), direction=(side * 0.92, 0.35, 0.12),
            length=7.5, width=4.2, thick=0.45, col_base='#12285e', col_mid='#00e5ff', col_tip='#ff42b0', sweep=side * 0.25
        ))
        manta_parts.append(make_crystal_blade(
            f"manta_horn_{side}", base=(side * 0.9, -2.5, 0.0), direction=(side * 0.2, -0.96, 0.1),
            length=2.2, width=0.8, thick=0.4, col_base='#00d0ff', col_mid='#70ffff', col_tip='#ffffff'
        ))
    manta_parts.append(make_crystal_blade(
        "manta_tail", base=(0, 2.5, 0), direction=(0, 0.99, 0.08),
        length=6.8, width=0.6, thick=0.35, col_base='#00e5ff', col_mid='#b34dff', col_tip='#ff66cc'
    ))
    manta_mesh = join_objects(manta_parts, "BiolumManta_Crystal")
    assign_mat(manta_mesh, mat_crystal)
    manta_mesh.parent = manta_root
    roots.append(manta_root)

    # 7. ColossalSandworm: Armored Desert Sandworm Maw with Ringed Crystalline Teeth
    worm_root = link(bpy.data.objects.new("ColossalSandworm", None))
    w_stone = []
    w_crys = []
    for seg in range(5):
        r_seg = 6.8 - seg * 0.55
        y_seg = seg * 4.2
        w_stone.append(make_torus(
            f"worm_ring_{seg}", r_seg, 1.65, maj_seg=22, min_seg=10,
            loc=(0, y_seg, 0), rot=(math.pi / 2, 0, 0),
            col='#c97a3e' if seg % 2 == 0 else '#9e5627'
        ))
        for side in (-1.0, 1.0):
            w_crys.append(make_crystal_blade(
                f"worm_spine_{seg}_{side}", base=(side * (r_seg + 0.5), y_seg, 1.2),
                direction=(side * 0.65, 0.35, 0.65), length=3.6, width=1.6, thick=0.8,
                col_base='#592812', col_mid='#ff6a00', col_tip='#ffd24d'
            ))
    # Dark interior gullet + 12 ringed crystalline teeth inside open mouth
    w_stone.append(make_cylinder("worm_gullet", 5.6, 3.2, 6.0, segs=20, loc=(0, 2.2, 0), rot=(math.pi / 2, 0, 0), col='#2b0e11'))
    for t_i in range(12):
        ang = t_i * math.pi * 2.0 / 12.0
        tx, tz = math.cos(ang) * 5.8, math.sin(ang) * 5.8
        w_crys.append(make_crystal_blade(
            f"worm_tooth_{t_i}", base=(tx, -0.6, tz),
            direction=(-math.cos(ang) * 0.45, -0.88, -math.sin(ang) * 0.45),
            length=3.4, width=1.1, thick=0.65, col_base='#d4a373', col_mid='#fff1d6', col_tip='#ff9d00'
        ))
    ws_mesh = join_objects(w_stone, "ColossalSandworm_Stone")
    assign_mat(ws_mesh, mat_stone)
    ws_mesh.parent = worm_root
    wc_mesh = join_objects(w_crys, "ColossalSandworm_Crystal")
    assign_mat(wc_mesh, mat_crystal)
    wc_mesh.parent = worm_root
    roots.append(worm_root)

    # 8. PolarIceCitadel: Towering North Pole Crystalline Vortex Spire & Glacier Arch
    ice_root = link(bpy.data.objects.new("PolarIceCitadel", None))
    ice_stone = []
    ice_crys = []
    ice_stone.append(make_torus("ice_arch", 9.5, 2.2, maj_seg=22, min_seg=10, loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), col='#b8e2f8', arc=math.pi))
    ice_crys.append(make_crystal_blade(
        "ice_central_spire", base=(0, 0, 6.5), direction=(0, 0, 1),
        length=28.0, width=7.5, thick=5.5, col_base='#164c82', col_mid='#00e1ff', col_tip='#ffffff', facet_boost=0.32, speckle=True
    ))
    for i in range(6):
        ang = i * math.pi / 3.0
        bx, by = math.cos(ang) * 7.2, math.sin(ang) * 4.5
        ice_crys.append(make_crystal_blade(
            f"ice_crown_shard_{i}", base=(bx, by, 3.5),
            direction=(math.cos(ang) * 0.38, math.sin(ang) * 0.38, 0.90),
            length=18.5 + (i % 2) * 4.5, width=4.8, thick=3.2,
            col_base='#1b5896', col_mid='#3df5ff', col_tip='#f2ffff', facet_boost=0.28
        ))
    is_mesh = join_objects(ice_stone, "PolarIceCitadel_Stone")
    assign_mat(is_mesh, mat_stone)
    is_mesh.parent = ice_root
    ic_mesh = join_objects(ice_crys, "PolarIceCitadel_Crystal")
    assign_mat(ic_mesh, mat_crystal)
    ic_mesh.parent = ice_root
    roots.append(ice_root)

    # 9. AmazonTempleGate: Overgrown Jungle Stone Temple Tunnel Arch with Carved Totems & Sun Gems
    amz_root = link(bpy.data.objects.new("AmazonTempleGate", None))
    amz_stone = []
    amz_crys = []
    for side in (-1.0, 1.0):
        amz_stone.append(make_rounded_box(f"amz_pillar_{side}", (3.4, 5.2, 12.5), loc=(side * 9.2, 0, 6.0), bevel_width=0.35, col='#6e7858'))
        amz_stone.append(make_rounded_box(f"amz_moss_cap_{side}", (3.8, 5.6, 2.2), loc=(side * 9.2, 0, 11.8), bevel_width=0.45, col='#3f8a42'))
        amz_crys.append(make_crystal_blade(
            f"amz_torch_gem_{side}", base=(side * 9.2, -2.6, 7.5), direction=(0, -0.85, 0.52),
            length=3.2, width=1.8, thick=1.2, col_base='#2b7a38', col_mid='#a8ff3e', col_tip='#ffe84d'
        ))
    amz_stone.append(make_rounded_box("amz_lintel", (23.5, 5.8, 3.4), loc=(0, 0, 13.5), bevel_width=0.45, col='#7d8562'))
    amz_stone.append(make_rounded_box("amz_step_top", (17.5, 5.2, 2.4), loc=(0, 0, 16.0), bevel_width=0.35, col='#489446'))
    amz_crys.append(make_crystal_blade(
        "amz_sun_crest", base=(0, -2.5, 14.5), direction=(0, -0.15, 0.98),
        length=6.5, width=4.8, thick=1.6, col_base='#d45b12', col_mid='#ffae00', col_tip='#fff799'
    ))
    as_mesh = join_objects(amz_stone, "AmazonTempleGate_Stone")
    assign_mat(as_mesh, mat_stone)
    as_mesh.parent = amz_root
    ac_mesh = join_objects(amz_crys, "AmazonTempleGate_Crystal")
    assign_mat(ac_mesh, mat_crystal)
    ac_mesh.parent = amz_root
    roots.append(amz_root)

    return roots

# ---------------------------------------------------------------------------
# Vinyl-Toy 3D Creature Drivers Builder (for the 8 non-locked Kith characters)
# ---------------------------------------------------------------------------
DRIVER_SPECS = {
    'moki':  dict(skin='#32867b', accent='#bee16f', fin='#78ba5e', face='#f4efde'),
    'zippi': dict(skin='#eab742', accent='#fff0a1', fin='#ec7356', face='#fff4dd'),
    'nori':  dict(skin='#388fb3', accent='#9fe9da', fin='#f49094', face='#e6fff3'),
    'pippa': dict(skin='#d2709f', accent='#ffe0af', fin='#ac87cd', face='#fff0df'),
    'bram':  dict(skin='#a87458', accent='#edc490', fin='#748d75', face='#ede9d3'),
    'luma':  dict(skin='#686ab5', accent='#e9dfa2', fin='#a6b8e6', face='#eeedff'),
    'tavi':  dict(skin='#bd653e', accent='#ffc36f', fin='#4c9e9b', face='#f7ead5'),
    'fenn':  dict(skin='#80a7b0', accent='#eef1da', fin='#7792cc', face='#f5f9fc'),
}

def make_ellipsoid(name, radii, loc, rot=(0, 0, 0), col='#32867b'):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    R = Euler(rot, 'XYZ').to_matrix()
    T = Vector(loc)
    for v in bm.verts:
        p = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        v.co = R @ p + T
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    set_smooth(ob, True)
    paint_flat(ob, col)
    return ob

def build_driver(cid, dspec, mat_driver):
    root = link(bpy.data.objects.new(f"driver_{cid}", None))
    parts = []
    parts.append(make_ellipsoid(f"{cid}_torso", (0.34, 0.30, 0.38), (0, 0.04, 0.42), col=dspec['skin']))
    parts.append(make_ellipsoid(f"{cid}_belly", (0.22, 0.12, 0.25), (0, -0.20, 0.40), col=dspec['accent']))
    for side in (-1.0, 1.0):
        parts.append(make_ellipsoid(f"{cid}_arm_{side}", (0.11, 0.24, 0.11), (side * 0.30, -0.18, 0.48), rot=(0.4, 0, side * 0.25), col=dspec['skin']))

    head = make_ellipsoid(f"{cid}_head", (0.44, 0.38, 0.40), (0, -0.02, 0.94), col=dspec['skin'])
    V = verts_np(head)
    u = V[:, 0] / 0.44
    v = (V[:, 2] - 0.94) / 0.40
    w = (V[:, 1] + 0.02) / 0.38
    front = sstep(0.15, -0.35, w) * sstep(-0.85, -0.55, v)
    chevron = sstep(-0.08 + 0.75 * np.abs(u), -0.18 + 0.75 * np.abs(u), v)
    face_m = front * chevron
    patch_m = front * sstep(0.28, 0.10, np.abs(np.abs(u) - 0.42)) * sstep(0.22, -0.05, np.abs(v + 0.04))
    cols = mix(np.tile(hexc(dspec['skin']), (len(V), 1)), np.tile(hexc(dspec['face']), (len(V), 1)), face_m[:, None])
    cols = mix(cols, np.tile(hexc(dspec['accent']), (len(V), 1)), patch_m[:, None])
    paint_np(head, cols)
    parts.append(head)

    for side in (-1.0, 1.0):
        parts.append(make_ellipsoid(f"{cid}_eye_{side}", (0.055, 0.03, 0.095), (side * 0.16, -0.38, 0.92), col='#161324'))
        parts.append(make_ellipsoid(f"{cid}_catch_{side}", (0.022, 0.02, 0.032), (side * 0.145, -0.40, 0.955), col='#ffffff'))
    parts.append(make_ellipsoid(f"{cid}_nose", (0.048, 0.035, 0.032), (0, -0.39, 0.83), col='#161324'))

    for side in (-1.0, 1.0):
        if cid == 'moki':
            parts.append(make_crystal_blade(f"moki_antler_{side}", (side * 0.24, 0.0, 1.24), (side * 0.45, 0.1, 0.88), 0.58, 0.24, 0.12, dspec['skin'], dspec['fin'], dspec['accent']))
            parts.append(make_crystal_blade(f"moki_leaf_{side}", (side * 0.36, 0.05, 1.12), (side * 0.78, 0.15, 0.58), 0.46, 0.26, 0.10, dspec['fin'], dspec['accent'], '#ffffff'))
        elif cid == 'zippi':
            parts.append(make_crystal_blade(f"zippi_ear_{side}", (side * 0.20, 0.0, 1.25), (side * 0.18, 0.05, 0.98), 0.72, 0.22, 0.11, dspec['skin'], dspec['accent'], dspec['fin']))
        elif cid == 'nori':
            parts.append(make_crystal_blade(f"nori_wing_{side}", (side * 0.28, 0.08, 0.55), (side * 0.92, 0.22, 0.28), 0.68, 0.42, 0.12, dspec['skin'], dspec['accent'], dspec['fin']))
            parts.append(make_crystal_blade(f"nori_feeler_{side}", (side * 0.20, 0.0, 1.24), (side * 0.35, 0.1, 0.92), 0.48, 0.18, 0.10, dspec['fin'], dspec['accent'], '#ffffff'))
        elif cid == 'pippa':
            parts.append(make_crystal_blade(f"pippa_wing_hi_{side}", (side * 0.22, 0.22, 0.68), (side * 0.85, 0.25, 0.45), 0.65, 0.44, 0.10, dspec['fin'], dspec['skin'], dspec['accent']))
            parts.append(make_crystal_blade(f"pippa_wing_lo_{side}", (side * 0.20, 0.22, 0.45), (side * 0.82, 0.25, -0.25), 0.48, 0.34, 0.10, dspec['accent'], dspec['skin'], dspec['fin']))
        elif cid == 'bram':
            for r_idx in range(3):
                parts.append(make_crystal_blade(f"bram_plate_{side}_{r_idx}", (side * 0.20, 0.22, 0.45 + r_idx * 0.22), (side * 0.45, 0.78, 0.35), 0.38, 0.28, 0.18, dspec['skin'], dspec['fin'], dspec['accent']))
        elif cid == 'luma':
            parts.append(make_crystal_blade(f"luma_horn_{side}", (side * 0.24, 0.0, 1.22), (side * 0.32, 0.08, 0.94), 0.56, 0.24, 0.12, dspec['skin'], dspec['fin'], dspec['accent'], sweep=-side * 0.25))
        elif cid == 'tavi':
            parts.append(make_torus(f"tavi_goggle_{side}", 0.13, 0.028, maj_seg=16, min_seg=8, loc=(side * 0.16, -0.37, 0.92), rot=(math.pi / 2, 0, 0), col='#ffc36f'))
            parts.append(make_crystal_blade(f"tavi_ear_{side}", (side * 0.24, 0.04, 1.22), (side * 0.35, 0.2, 0.9), 0.42, 0.22, 0.10, dspec['skin'], dspec['fin'], dspec['accent']))
        elif cid == 'fenn':
            parts.append(make_crystal_blade(f"fenn_ear_{side}", (side * 0.24, 0.02, 1.22), (side * 0.32, 0.12, 0.94), 0.68, 0.26, 0.12, dspec['skin'], dspec['fin'], dspec['accent']))
            parts.append(make_crystal_blade(f"fenn_ruff_{side}", (side * 0.36, -0.05, 0.88), (side * 0.92, 0.15, 0.15), 0.36, 0.24, 0.10, dspec['skin'], dspec['accent'], '#ffffff'))

    driver_mesh = join_objects(parts, f"driver_{cid}_mesh")
    assign_mat(driver_mesh, mat_driver)
    driver_mesh.parent = root
    return root

# ---------------------------------------------------------------------------
# Export & Optional Cycles Preview Renders
# ---------------------------------------------------------------------------
def export_glb(filepath):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_vertex_color='ACTIVE',
        export_attributes=True,
        export_draco_mesh_compression_enable=False
    )
    print(f"Exported {filepath} ({os.path.getsize(filepath):,} bytes)")

def setup_cycles_gpu(res_x, res_y, samples=36):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for dev_type in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = dev_type
                prefs.get_devices()
                if any(d.type == dev_type for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    s.cycles.device = 'GPU'
                    break
            except Exception:
                pass
    except Exception:
        pass
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.render.resolution_x = res_x
    s.render.resolution_y = res_y
    return s

def render_lineup_preview():
    """Renders all 4 Hero Karts (Rello, Chora, Moki, Fenn) in full frame matching the concept art bottom strip."""
    s = setup_cycles_gpu(1600, 440, samples=36)
    hero_ids = ['rello', 'chora', 'moki', 'fenn']
    xs = [-5.2, -1.75, 1.75, 5.2]
    for o in list(s.objects):
        if o.parent is None and o.name.startswith("kart_"):
            kid = o.name.replace("kart_", "")
            if kid in hero_ids:
                idx = hero_ids.index(kid)
                o.location = Vector((xs[idx], 0.0, 0.0))
                # Angle all 4 karts in front-3/4 view matching concept art bottom strip
                o.rotation_euler = Euler((0, 0, -0.46 if idx < 3 else -0.42), 'XYZ')
            else:
                o.hide_render = True
                for ch in o.children_recursive:
                    ch.hide_render = True

    floor = make_rounded_box("studio_floor", (32.0, 18.0, 0.2), loc=(0, 0, -0.1), bevel_width=0.01, col='#181929')
    mat_floor = make_vcol_mat("mat_floor", rough=0.12, metal=0.45, coat=0.95)
    assign_mat(floor, mat_floor)

    w = bpy.data.worlds.new("studio_world")
    s.world = w
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.11, 0.12, 0.21, 1.0)
    bg.inputs['Strength'].default_value = 0.9

    for lname, loc, energy, size, col in (
        ("key", (-4.5, -8.5, 6.0), 520, 5.0, (1.0, 0.92, 0.82)),
        ("fill", (6.0, -7.5, 4.5), 320, 5.5, (0.75, 0.86, 1.0)),
        ("rim", (0.0, 6.0, 5.0), 420, 4.5, (1.0, 0.65, 0.88)),
    ):
        L = bpy.data.lights.new(lname, 'AREA')
        L.energy = energy
        L.size = size
        L.color = col
        lo = link(bpy.data.objects.new(lname, L))
        lo.location = Vector(loc)
        lo.rotation_euler = (Vector((0, 0, 0.65)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    cam = bpy.data.cameras.new("lineup_cam")
    cam.lens = 35
    co = link(bpy.data.objects.new("lineup_cam", cam))
    co.location = Vector((0.0, -11.8, 1.55))
    co.rotation_euler = (Vector((0.0, 0.0, 0.68)) - co.location).to_track_quat('-Z', 'Y').to_euler()
    s.camera = co

    out_png = os.path.join(ART_DIR, "blender-karts-lineup.png")
    s.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    print(f"Rendered Blender Cycles lineup preview: {out_png}")

    # Also render Rear-3/4 Hero Shot of Rello's Ember Fang Kart matching top of concept art!
    s.render.resolution_x = 1280
    s.render.resolution_y = 720
    for o in list(s.objects):
        if o.parent is None and o.name.startswith("kart_"):
            kid = o.name.replace("kart_", "")
            if kid == 'rello':
                o.location = Vector((0.0, 0.0, 0.0))
                o.rotation_euler = Euler((0, -0.06, 2.62), 'XYZ')
            else:
                o.hide_render = True
                for ch in o.children_recursive:
                    ch.hide_render = True
    cam.lens = 42
    co.location = Vector((0.0, -4.4, 1.18))
    co.rotation_euler = (Vector((0.0, 0.0, 0.72)) - co.location).to_track_quat('-Z', 'Y').to_euler()
    out_rear = os.path.join(ART_DIR, "blender-hero-rear.png")
    s.render.filepath = out_rear
    bpy.ops.render.render(write_still=True)
    print(f"Rendered Blender Cycles hero rear-3/4 preview: {out_rear}")

def main():
    # 1. Build & Export all 10 Karts
    reset_scene()
    mat_kart_body = make_vcol_mat("KartBodyPBR", rough=0.22, metal=0.38, coat=1.0, emit_strength=0.0)
    mat_kart_glow = make_vcol_mat("KartGlowPBR", rough=0.16, metal=0.15, coat=1.0, emit_strength=0.55)
    for kid, spec in KART_SPECS.items():
        build_kart(kid, spec, mat_kart_body, mat_kart_glow)
    export_glb(os.path.join(OUT_DIR, "karts.glb"))

    if os.environ.get("KITH_RACING_RENDER") == "1":
        render_lineup_preview()

    # 2. Build & Export World Monuments
    reset_scene()
    mat_stone = make_vcol_mat("MonumentStonePBR", rough=0.68, metal=0.05, coat=0.15, emit_strength=0.0)
    mat_crystal = make_vcol_mat("MonumentCrystalPBR", rough=0.12, metal=0.18, coat=1.0, emit_strength=0.75)
    build_monuments(mat_stone, mat_crystal)
    export_glb(os.path.join(OUT_DIR, "monuments.glb"))

    # 3. Build & Export 3D Creature Drivers
    reset_scene()
    mat_driver = make_vcol_mat("DriverVinylPBR", rough=0.35, metal=0.05, coat=0.45, emit_strength=0.0)
    for cid, dspec in DRIVER_SPECS.items():
        build_driver(cid, dspec, mat_driver)
    export_glb(os.path.join(OUT_DIR, "drivers.glb"))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
