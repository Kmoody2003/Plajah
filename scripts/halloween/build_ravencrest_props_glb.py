"""
Builds `public/models/halloween/ravencrest_showcase_props.glb` using Headless Blender 5.0.1 (`bpy`)
matching the exact Ravencrest Castle Interior Asset Sheets (`creation_3752891684.png`, `creation_3752891694.png`,
`creation_3752887346.png`, and `creation_3752884004.png`):
  1. `Ravencrest_KnightArmor` — Full Suit of Medieval Plate Armor on stone plinth with Raven Shield & Halberd
  2. `Ravencrest_ThroneChair` — Ornate Gothic King's Throne Chair with crimson velvet upholstery & spires
  3. `Ravencrest_CanopyBed` — Four-Poster Gothic Velvet Canopy Bed with draped curtains & wooden foot-chest
  4. `Ravencrest_Chandelier` — Double-Tiered Wrought-Iron Candle Chandelier with 16 candles & chains
  5. `Ravencrest_StandingBrazier` — Wrought-Iron Pedestal Fire Brazier with glowing coal bed & flame core
  6. `Ravencrest_Telescope` — 4th-Floor Observatory Brass & Iron Equatorial Telescope & Astrolabe
"""

import os
import math
import bpy
from mathutils import Vector

ROOT = r"c:\Users\Kenne\plajah"
OUT_DIR = os.path.join(ROOT, "public", "models", "halloween")
RAVEN_DIR = os.path.join(OUT_DIR, "ravencrest")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def shade_smooth(obj):
    if obj and obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = True


def make_mat(name, color=(0.5, 0.5, 0.5, 1.0), roughness=0.45, metallic=0.1, emission=None, emission_strength=0.0, tex_name=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF") or nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    if tex_name:
        tpath = os.path.join(RAVEN_DIR, tex_name)
        if os.path.exists(tpath):
            tex = nodes.new(type="ShaderNodeTexImage")
            tex.image = bpy.data.images.load(tpath, check_existing=True)
            links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    if emission and emission_strength > 0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission[:3], 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def join_into_named(objs, name, origin=(0, 0, 0)):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        shade_smooth(o)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    merged = objs[0]
    merged.name = name
    merged.location = origin
    return merged


def build_knight_armor(mats):
    objs = []
    # Stone pedestal plinth
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.44, depth=0.22, location=(0, 0, 0.11))
    plinth = bpy.context.active_object
    plinth.data.materials.append(mats["stone"])
    objs.append(plinth)

    # Greaves & Sabatons (legs)
    for sx in (-0.15, 0.15):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.085, depth=0.82, location=(sx, 0, 0.64))
        leg = bpy.context.active_object
        leg.data.materials.append(mats["steel"])
        objs.append(leg)

        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.095, location=(sx, -0.03, 0.65))
        knee = bpy.context.active_object
        knee.scale = (0.9, 1.1, 0.8)
        knee.data.materials.append(mats["brass"])
        objs.append(knee)

    # Tassets & Cuirass (torso)
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.24, radius2=0.31, depth=0.68, location=(0, 0, 1.34))
    cuirass = bpy.context.active_object
    cuirass.scale = (1.05, 0.72, 1.0)
    cuirass.data.materials.append(mats["steel"])
    objs.append(cuirass)

    # Pauldrons (shoulders) & Vambraces (arms)
    for sx in (-0.32, 0.32):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.14, location=(sx, 0, 1.60))
        pauldron = bpy.context.active_object
        pauldron.scale = (1.1, 0.9, 0.85)
        pauldron.data.materials.append(mats["steel"])
        objs.append(pauldron)

        bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.068, depth=0.52, location=(sx * 1.05, -0.04, 1.28))
        arm = bpy.context.active_object
        arm.data.materials.append(mats["steel"])
        objs.append(arm)

    # Visored Gothic Sallet / Great Helm
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.145, location=(0, 0, 1.84))
    helm = bpy.context.active_object
    helm.scale = (0.92, 1.08, 1.18)
    helm.data.materials.append(mats["steel"])
    objs.append(helm)

    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.14, radius2=0.02, depth=0.16, location=(0, -0.10, 1.82), rotation=(math.radians(78), 0, 0))
    visor = bpy.context.active_object
    visor.scale = (0.95, 0.65, 1.0)
    visor.data.materials.append(mats["brass"])
    objs.append(visor)

    # Ravencrest Shield on Left Arm
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.28, depth=0.03, location=(-0.36, -0.16, 1.26), rotation=(math.radians(86), 0, math.radians(-18)))
    shield = bpy.context.active_object
    shield.scale = (0.85, 1.25, 1.0)
    shield.data.materials.append(mats["raven_banner"])
    objs.append(shield)

    # Steel Halberd in Right Hand
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.022, depth=2.35, location=(0.38, -0.12, 1.18))
    shaft = bpy.context.active_object
    shaft.data.materials.append(mats["wood"])
    objs.append(shaft)

    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.045, radius2=0.003, depth=0.42, location=(0.38, -0.12, 2.45))
    spear = bpy.context.active_object
    spear.data.materials.append(mats["steel"])
    objs.append(spear)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.38, -0.22, 2.15))
    axe = bpy.context.active_object
    axe.scale = (0.015, 0.22, 0.28)
    axe.data.materials.append(mats["steel"])
    objs.append(axe)

    return join_into_named(objs, "Ravencrest_KnightArmor", (0, 0, 0))


def build_throne_chair(mats):
    objs = []
    # Raised dais base + seat
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.28))
    seat = bpy.context.active_object
    seat.scale = (0.86, 0.78, 0.52)
    seat.data.materials.append(mats["wood"])
    objs.append(seat)

    # Velvet Seat Cushion
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.02, 0.56))
    cushion = bpy.context.active_object
    cushion.scale = (0.76, 0.68, 0.10)
    cushion.data.materials.append(mats["velvet"])
    objs.append(cushion)

    # Tall Gothic Carved Backrest + Velvet Tufted Panel
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.34, 1.38))
    back = bpy.context.active_object
    back.scale = (0.84, 0.10, 1.65)
    back.data.materials.append(mats["wood"])
    objs.append(back)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.28, 1.32))
    back_velvet = bpy.context.active_object
    back_velvet.scale = (0.64, 0.05, 1.28)
    back_velvet.data.materials.append(mats["velvet"])
    objs.append(back_velvet)

    # 3 Gothic Finial Spires atop Throne
    for sx, h_off in ((-0.38, 2.32), (0.0, 2.48), (0.38, 2.32)):
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.065, radius2=0.005, depth=0.38, location=(sx, 0.34, h_off))
        sp = bpy.context.active_object
        sp.data.materials.append(mats["brass"])
        objs.append(sp)

    # Armrests
    for sx in (-0.40, 0.40):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0.0, 0.82))
        arm = bpy.context.active_object
        arm.scale = (0.10, 0.72, 0.09)
        arm.data.materials.append(mats["wood"])
        objs.append(arm)

    return join_into_named(objs, "Ravencrest_ThroneChair", (0, 0, 0))


def build_canopy_bed(mats):
    objs = []
    # Bed Frame & Mattress
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.32))
    frame = bpy.context.active_object
    frame.scale = (2.1, 2.5, 0.48)
    frame.data.materials.append(mats["wood"])
    objs.append(frame)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.64))
    mattress = bpy.context.active_object
    mattress.scale = (1.94, 2.34, 0.26)
    mattress.data.materials.append(mats["velvet"])
    objs.append(mattress)

    # 4 Carved Oak Corner Posts + Upper Canopy Tester
    for sx in (-0.98, 0.98):
        for sy in (-1.18, 1.18):
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.065, depth=2.45, location=(sx, sy, 1.25))
            post = bpy.context.active_object
            post.data.materials.append(mats["wood"])
            objs.append(post)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 2.46))
    canopy = bpy.context.active_object
    canopy.scale = (2.14, 2.54, 0.16)
    canopy.data.materials.append(mats["wood"])
    objs.append(canopy)

    # Headboard & Draped Velvet Curtains
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.18, 1.28))
    headboard = bpy.context.active_object
    headboard.scale = (1.96, 0.10, 1.35)
    headboard.data.materials.append(mats["wood"])
    objs.append(headboard)

    for sx in (-0.98, 0.98):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0.85, 1.52))
        drape = bpy.context.active_object
        drape.scale = (0.08, 0.65, 1.75)
        drape.data.materials.append(mats["velvet"])
        objs.append(drape)

    # Wooden Chest at Foot of Bed
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -1.52, 0.28))
    chest = bpy.context.active_object
    chest.scale = (1.15, 0.48, 0.52)
    chest.data.materials.append(mats["wood"])
    objs.append(chest)

    return join_into_named(objs, "Ravencrest_CanopyBed", (0, 0, 0))


def build_chandelier(mats):
    objs = []
    # Two concentric wrought-iron rings
    for radius, z_ht, count in ((1.15, 0.0, 12), (0.68, 0.45, 6)):
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.045, location=(0, 0, z_ht))
        ring = bpy.context.active_object
        ring.data.materials.append(mats["iron"])
        objs.append(ring)

        for i in range(count):
            ang = (i / count) * math.tau
            cx = math.cos(ang) * radius
            cy = math.sin(ang) * radius
            bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.024, depth=0.22, location=(cx, cy, z_ht + 0.14))
            candle = bpy.context.active_object
            candle.data.materials.append(mats["candle"])
            objs.append(candle)

            bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.022, radius2=0.002, depth=0.075, location=(cx, cy, z_ht + 0.28))
            flame = bpy.context.active_object
            flame.data.materials.append(mats["flame"])
            objs.append(flame)

    # Central iron stem
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.038, depth=1.35, location=(0, 0, 0.62))
    stem = bpy.context.active_object
    stem.data.materials.append(mats["iron"])
    objs.append(stem)

    return join_into_named(objs, "Ravencrest_Chandelier", (0, 0, 0))


def build_standing_brazier(mats):
    objs = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.34, depth=0.14, location=(0, 0, 0.07))
    base = bpy.context.active_object
    base.data.materials.append(mats["iron"])
    objs.append(base)

    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.085, depth=0.92, location=(0, 0, 0.56))
    shaft = bpy.context.active_object
    shaft.data.materials.append(mats["iron"])
    objs.append(shaft)

    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.14, radius2=0.44, depth=0.32, location=(0, 0, 1.12))
    bowl = bpy.context.active_object
    bowl.data.materials.append(mats["iron"])
    objs.append(bowl)

    bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.28, radius2=0.03, depth=0.48, location=(0, 0, 1.44))
    fire = bpy.context.active_object
    fire.data.materials.append(mats["flame"])
    objs.append(fire)

    return join_into_named(objs, "Ravencrest_StandingBrazier", (0, 0, 0))


def build_observatory_telescope(mats):
    objs = []
    # Stone & Iron Pier Base
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.58, radius2=0.28, depth=1.45, location=(0, 0, 0.72))
    pier = bpy.context.active_object
    pier.data.materials.append(mats["iron"])
    objs.append(pier)

    # Brass Equatorial Astrolabe Rings
    for rot in ((math.radians(35), 0, 0), (0, math.radians(55), math.radians(40))):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.46, minor_radius=0.025, location=(0, 0, 1.62), rotation=rot)
        ring = bpy.context.active_object
        ring.data.materials.append(mats["brass"])
        objs.append(ring)

    # Main Brass Refractor Telescope Tube angled toward the Moon
    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=0.19, radius2=0.11, depth=2.45,
        location=(0, -0.15, 1.78),
        rotation=(math.radians(52), 0, 0),
    )
    tube = bpy.context.active_object
    tube.data.materials.append(mats["brass"])
    objs.append(tube)

    return join_into_named(objs, "Ravencrest_Telescope", (0, 0, 0))


def main():
    clear_scene()
    mats = {
        "stone": make_mat("RC_Stone", (0.28, 0.30, 0.33, 1.0), 0.75, 0.05, tex_name="stone_wall.png"),
        "steel": make_mat("RC_PlateSteel", (0.64, 0.68, 0.73, 1.0), 0.24, 0.92, tex_name="iron_metal.png"),
        "iron": make_mat("RC_WroughtIron", (0.16, 0.17, 0.19, 1.0), 0.38, 0.88, tex_name="iron_metal.png"),
        "brass": make_mat("RC_GoldBrass", (0.78, 0.62, 0.30, 1.0), 0.25, 0.90, tex_name="brass_metal.png"),
        "wood": make_mat("RC_DarkOak", (0.26, 0.16, 0.10, 1.0), 0.56, 0.06, tex_name="wood_planks.png"),
        "velvet": make_mat("RC_CrimsonVelvet", (0.48, 0.08, 0.11, 1.0), 0.68, 0.04, tex_name="velvet_fabric.png"),
        "raven_banner": make_mat("RC_RavenShield", (0.14, 0.20, 0.32, 1.0), 0.52, 0.15, tex_name="banner_raven_navy.png"),
        "candle": make_mat("RC_WaxCandle", (0.94, 0.89, 0.76, 1.0), 0.42, 0.0, emission=(0.95, 0.80, 0.50), emission_strength=0.35),
        "flame": make_mat("RC_FireFlame", (1.0, 0.58, 0.14, 1.0), 0.15, 0.0, emission=(1.0, 0.52, 0.10), emission_strength=4.5),
    }

    build_knight_armor(mats)
    build_throne_chair(mats)
    build_canopy_bed(mats)
    build_chandelier(mats)
    build_standing_brazier(mats)
    build_observatory_telescope(mats)

    out_glb = os.path.join(OUT_DIR, "ravencrest_showcase_props.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        export_apply=True,
        export_draco_mesh_compression_enable=False,
    )
    print(f"Exported {out_glb} ({os.path.getsize(out_glb):,} bytes)")


if __name__ == "__main__":
    main()
