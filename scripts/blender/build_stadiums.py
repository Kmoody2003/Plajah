"""
Procedural World Cup stadium generator — runs inside Blender (bpy).

Builds detailed, multi-tier elliptical stadiums (lower + upper bowl, concourse
fascia, mullioned facade, cantilever roof) and exports one .glb per roof
archetype into public/models/stadiums/. The seating material is named "Seats"
so the web viewer can tint each venue in its national colours at load time.

Run headless (bpy pip module):   python scripts/blender/build_stadiums.py
Or with a Blender install:        blender --background --python scripts/blender/build_stadiums.py
"""
import os, math, sys
import bpy, bmesh
from mathutils import Vector

# ---------------------------------------------------------------- output dir
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "models", "stadiums")
os.makedirs(OUT, exist_ok=True)

SEG = 168          # angular resolution of the bowl
A, B = 118.0, 82.0  # inner semi-axes (metres-ish)

# ---------------------------------------------------------------- materials
def mat(name, rgba, metal=0.0, rough=0.7, emit=None, emit_str=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        m.blend_method = 'BLEND'
    if emit is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emit
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emit_str
    return m

def materials():
    return {
        "Seats":     mat("Seats",     (0.55, 0.56, 0.60, 1), 0.05, 0.72),
        "Structure": mat("Structure", (0.16, 0.16, 0.19, 1), 0.85, 0.32),
        "Facade":    mat("Facade",    (0.72, 0.74, 0.80, 1), 0.35, 0.40),
        "Pitch":     mat("Pitch",     (0.09, 0.42, 0.16, 1), 0.00, 1.00),
        "Stripe":    mat("Stripe",    (0.13, 0.52, 0.22, 1), 0.00, 1.00),
        "Line":      mat("Line",      (0.90, 0.92, 0.95, 1), 0.00, 0.60),
        "Glass":     mat("Glass",     (0.80, 0.86, 0.96, 1), 0.10, 0.18, alpha=0.30),
        "Roof":      mat("Roof",      (0.20, 0.20, 0.24, 1), 0.70, 0.42),
        "Light":     mat("Light",     (1.0, 0.97, 0.85, 1), 0.0, 0.4,
                          emit=(1.0, 0.95, 0.80, 1), emit_str=6.0),
    }

# ---------------------------------------------------------------- mesh helper
def add_mesh(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.context.collection.objects.link(ob)
    # smooth-shade the curved bowl/roof
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob

def ellipse_pt(theta, off, a=A, b=B):
    """A point on the inner ellipse pushed radially outward by `off` metres."""
    h = Vector((math.cos(theta) * a, math.sin(theta) * b))
    n = h.normalized()
    p = h + n * off
    return p

# ---------------------------------------------------------------- bowl surface
# radial cross-section profile: (outward offset, height)
BOWL = [
    (0.0, 2.4), (5.0, 5.2), (13.0, 9.8), (24.0, 15.0),   # lower tier rake
    (26.0, 15.2), (30.0, 15.6),                          # concourse shelf
    (31.5, 21.5), (36.0, 24.5), (48.0, 33.0), (58.0, 40.5),  # upper tier rake
]

def build_bowl(mats):
    verts, faces = [], []
    rows = len(BOWL)
    for i in range(SEG):
        th = 2 * math.pi * i / SEG
        for (off, hgt) in BOWL:
            p = ellipse_pt(th, off)
            verts.append((p.x, hgt, p.y))
    def idx(i, s):
        return (i % SEG) * rows + s
    for i in range(SEG):
        for s in range(rows - 1):
            a = idx(i, s); b = idx(i + 1, s); c = idx(i + 1, s + 1); d = idx(i, s + 1)
            faces.append((a, b, c, d))
    return add_mesh("Bowl", verts, faces, mats["Seats"])

def build_shell(mats):
    """Outer structural shell behind the seats (back of the stand)."""
    verts, faces = [], []
    prof = [(58.0, 0.0), (60.0, 20.0), (61.0, 40.5)]
    rows = len(prof)
    for i in range(SEG):
        th = 2 * math.pi * i / SEG
        for (off, hgt) in prof:
            p = ellipse_pt(th, off)
            verts.append((p.x, hgt, p.y))
    def idx(i, s): return (i % SEG) * rows + s
    for i in range(SEG):
        for s in range(rows - 1):
            faces.append((idx(i, s), idx(i + 1, s), idx(i + 1, s + 1), idx(i, s + 1)))
    return add_mesh("Shell", verts, faces, mats["Structure"])

def build_facade(mats):
    """Vertical mullioned facade panels wrapping the exterior."""
    verts, faces = [], []
    panels = 96
    for k in range(panels):
        th = 2 * math.pi * k / panels
        w = (2 * math.pi / panels) * 0.62
        for dt in (-w / 2, w / 2):
            p = ellipse_pt(th + dt, 61.5)
            verts.append((p.x, 0.0, p.y))
            verts.append((p.x, 39.0, p.y))
    for k in range(panels):
        base = k * 4
        faces.append((base, base + 2, base + 3, base + 1))
    return add_mesh("Facade", verts, faces, mats["Facade"])

def build_fascia(mats):
    """Bright ring band at the concourse (advertising fascia)."""
    verts, faces = [], []
    for i in range(SEG):
        th = 2 * math.pi * i / SEG
        p = ellipse_pt(th, 29.0)
        verts.append((p.x, 15.4, p.y))
        verts.append((p.x, 17.4, p.y))
    for i in range(SEG):
        a = (i % SEG) * 2; b = ((i + 1) % SEG) * 2
        faces.append((a, b, b + 1, a + 1))
    return add_mesh("Fascia", verts, faces, mats["Structure"])

# ---------------------------------------------------------------- pitch
def build_pitch(mats):
    hw, hh, y = 52.5, 34.0, 0.15
    # mown stripes
    stripes = 10
    for s in range(stripes):
        x0 = -hw + (2 * hw) * s / stripes
        x1 = -hw + (2 * hw) * (s + 1) / stripes
        verts = [(x0, y, -hh), (x1, y, -hh), (x1, y, hh), (x0, y, hh)]
        add_mesh("Stripe", verts, [(0, 1, 2, 3)], mats["Pitch"] if s % 2 else mats["Stripe"])
    # surround
    verts = [(-hw - 6, 0.05, -hh - 6), (hw + 6, 0.05, -hh - 6),
             (hw + 6, 0.05, hh + 6), (-hw - 6, 0.05, hh + 6)]
    add_mesh("Surround", verts, [(0, 1, 2, 3)], mats["Structure"])

# ---------------------------------------------------------------- roofs
def roof_ring(mats, inner=30.0, outer=74.0, y=44.0, drop=1.5, a0=0.0, a1=2 * math.pi, glass=False):
    verts, faces = [], []
    span = a1 - a0
    n = max(8, int(SEG * span / (2 * math.pi)))
    rows = [(inner, y), (outer, y - drop)]
    for i in range(n + 1):
        th = a0 + span * i / n
        for (off, hgt) in rows:
            p = ellipse_pt(th, off)
            verts.append((p.x, hgt, p.y))
    for i in range(n):
        a = i * 2; b = (i + 1) * 2
        faces.append((a, b, b + 1, a + 1))
    return add_mesh("Roof", verts, faces, mats["Glass"] if glass else mats["Roof"])

def roof_trusses(mats, inner=30.0, outer=74.0, y=44.0, count=48, a0=0.0, a1=2 * math.pi):
    span = a1 - a0
    for k in range(count + 1):
        th = a0 + span * k / count
        pi_ = ellipse_pt(th, inner); po = ellipse_pt(th, outer)
        verts = [
            (pi_.x, y + 0.6, pi_.y), (po.x, y - 0.9, po.y),
            (po.x, y - 2.2, po.y), (pi_.x, y - 0.7, pi_.y),
        ]
        add_mesh("Truss", verts, [(0, 1, 2, 3)], mats["Structure"])

def floodlights(mats):
    for th in (math.pi * 0.25, math.pi * 0.75, math.pi * 1.25, math.pi * 1.75):
        p = ellipse_pt(th, 66.0)
        # mast
        add_mesh("Mast", [
            (p.x - 0.8, 0, p.y - 0.8), (p.x + 0.8, 0, p.y - 0.8),
            (p.x + 0.8, 0, p.y + 0.8), (p.x - 0.8, 0, p.y + 0.8),
            (p.x - 0.4, 52, p.y - 0.4), (p.x + 0.4, 52, p.y - 0.4),
            (p.x + 0.4, 52, p.y + 0.4), (p.x - 0.4, 52, p.y + 0.4),
        ], [(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mats["Structure"])
        # light bank
        add_mesh("Bank", [
            (p.x - 6, 50, p.y - 1.5), (p.x + 6, 50, p.y - 1.5),
            (p.x + 6, 56, p.y - 1.5), (p.x - 6, 56, p.y - 1.5),
        ], [(0, 1, 2, 3)], mats["Light"])

def build_roof(kind, mats):
    if kind == "open":
        floodlights(mats)
        return
    if kind == "retractable":
        gap = math.radians(26)
        roof_ring(mats, a0=gap, a1=math.pi - gap)
        roof_ring(mats, a0=math.pi + gap, a1=2 * math.pi - gap)
        roof_trusses(mats, a0=gap, a1=math.pi - gap, count=22)
        roof_trusses(mats, a0=math.pi + gap, a1=2 * math.pi - gap, count=22)
        return
    glass = (kind == "canopy")
    roof_ring(mats, glass=glass)
    roof_trusses(mats)

# ---------------------------------------------------------------- assemble
def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for c in (bpy.data.meshes, bpy.data.materials):
        for b in list(c):
            c.remove(b)

def build_and_export(kind):
    clear()
    mats = materials()
    build_pitch(mats)
    build_bowl(mats)
    build_shell(mats)
    build_fascia(mats)
    build_facade(mats)
    build_roof(kind, mats)
    # join everything into a single object for a tidy GLB
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = f"stadium_{kind}"
    path = os.path.join(OUT, f"stadium_{kind}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
    )
    size = os.path.getsize(path)
    print(f"  exported {kind:11s} -> {path}  ({size//1024} KB)")

def main():
    print("Building Blender stadium archetypes ...")
    for kind in ("fixed", "canopy", "retractable", "open"):
        build_and_export(kind)
    print("Done.")

if __name__ == "__main__":
    main()
