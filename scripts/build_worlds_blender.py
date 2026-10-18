"""
Headless Blender 5.0.1 (`bpy`) 3D Scene Builder for Plajah Worlds
=================================================================
Generates 3 high-detail multi-material 3D `.glb` scenes in `public/worlds/models/`:
  1. `stargate_odyssey.glb`    — Aethelgard: The Dyson Stargate & Carina-Helios System
  2. `kingdom_chronicles.glb`  — Crown of Ember & Iron: The Clockwork Realm Map
  3. `aether_archipelago.glb`  — Sora-No-Kiseki: The Living Sky-Island Archipelago

Coordinate Convention:
  Built directly in Three.js Y-up space `(x=Right, y=Up, z=TowardCamera)` and exported with
  `export_yup=False` so Blender `(x, y, z)` maps 1:1 to Three.js `(x, y, z)`.
"""

import os
import math
import random
import bpy
import bmesh
from mathutils import Vector, Euler, Matrix, noise

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "worlds", "models"))
os.makedirs(OUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(
    name: str,
    base_color=(0.8, 0.8, 0.8, 1.0),
    metallic=0.0,
    roughness=0.5,
    emission_color=None,
    emission_strength=0.0,
    alpha=1.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Alpha" in bsdf.inputs and alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    if emission_color is not None and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color[:3], 1.0)
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission_color[:3], 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def smooth_shade(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


# =============================================================================
# 1. STARGATE ODYSSEY — Dyson Stargate Megastructure & Solar System
# =============================================================================
def build_stargate_odyssey():
    clear_scene()
    random.seed(42)

    mat_titanium = make_pbr_mat("Titanium_Hull", (0.10, 0.15, 0.24, 1.0), metallic=0.92, roughness=0.24)
    mat_obsidian = make_pbr_mat("Obsidian_Armor", (0.04, 0.06, 0.11, 1.0), metallic=0.86, roughness=0.34)
    mat_gold = make_pbr_mat("Celestial_BrassGold", (0.96, 0.74, 0.26, 1.0), metallic=0.96, roughness=0.16)
    mat_cyan_glow = make_pbr_mat(
        "Aether_Cyan_Glow",
        (0.12, 0.94, 1.0, 1.0),
        metallic=0.1,
        roughness=0.1,
        emission_color=(0.08, 0.90, 1.0),
        emission_strength=6.5,
    )
    mat_amber_glow = make_pbr_mat(
        "Helios_Amber_Glow",
        (1.0, 0.70, 0.14, 1.0),
        metallic=0.1,
        roughness=0.1,
        emission_color=(1.0, 0.64, 0.10),
        emission_strength=6.0,
    )
    mat_star_core = make_pbr_mat(
        "Helios_Star_Surface",
        (1.0, 0.88, 0.48, 1.0),
        metallic=0.0,
        roughness=0.1,
        emission_color=(1.0, 0.78, 0.24),
        emission_strength=8.5,
    )
    mat_ocean_planet = make_pbr_mat("Thalassa_Ocean", (0.04, 0.38, 0.82, 1.0), metallic=0.38, roughness=0.15)
    mat_continent = make_pbr_mat("Thalassa_Land", (0.14, 0.68, 0.52, 1.0), metallic=0.15, roughness=0.52)
    mat_ring_ice = make_pbr_mat(
        "Thalassa_IceRing",
        (0.55, 0.88, 1.0, 1.0),
        metallic=0.5,
        roughness=0.22,
        emission_color=(0.25, 0.78, 1.0),
        emission_strength=1.5,
    )
    mat_lava_rock = make_pbr_mat(
        "Pyros_Volcanic",
        (0.16, 0.06, 0.05, 1.0),
        metallic=0.35,
        roughness=0.62,
        emission_color=(0.8, 0.18, 0.02),
        emission_strength=1.2,
    )
    mat_lava_core = make_pbr_mat(
        "Pyros_Magma",
        (1.0, 0.36, 0.05, 1.0),
        metallic=0.0,
        roughness=0.15,
        emission_color=(1.0, 0.32, 0.02),
        emission_strength=7.5,
    )

    gate_center = Vector((0.0, 0.35, 0.0))

    # 1A. Outer Stargate Armored Megastructure Ring (lies in X-Y plane, facing +Z)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=2.68,
        minor_radius=0.28,
        major_segments=72,
        minor_segments=20,
        location=gate_center,
        rotation=(0, 0, 0),
    )
    outer_ring = bpy.context.active_object
    outer_ring.name = "Stargate_OuterHull"
    bm = bmesh.new()
    bm.from_mesh(outer_ring.data)
    bm.faces.ensure_lookup_table()
    extrude_faces = [f for idx, f in enumerate(bm.faces) if (idx // 20) % 2 == 0 and (idx % 20) in (0, 1, 9, 10, 11, 19)]
    if extrude_faces:
        res = bmesh.ops.extrude_discrete_faces(bm, faces=extrude_faces)
        for f in res["faces"]:
            bmesh.ops.translate(bm, verts=f.verts, vec=f.normal * 0.065)
    bm.to_mesh(outer_ring.data)
    bm.free()
    assign_mat(outer_ring, mat_titanium)
    smooth_shade(outer_ring)

    # 1B. Brushed Gold Filigree Bezel Rings
    for idx, (r_maj, r_min, z_off) in enumerate([(2.92, 0.055, 0.0), (2.40, 0.05, 0.14), (2.40, 0.05, -0.14)]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_maj,
            minor_radius=r_min,
            major_segments=96,
            minor_segments=14,
            location=gate_center + Vector((0, 0, z_off)),
            rotation=(0, 0, 0),
        )
        bezel = bpy.context.active_object
        bezel.name = f"Stargate_GoldTrim_{idx}"
        assign_mat(bezel, mat_gold)
        smooth_shade(bezel)

    # 1C. Counter-Rotating Inner Constellation Ring + 36 Glowing Glyph Tablets
    bpy.ops.mesh.primitive_torus_add(
        major_radius=2.26,
        minor_radius=0.11,
        major_segments=72,
        minor_segments=16,
        location=gate_center,
        rotation=(0, 0, 0),
    )
    inner_ring = bpy.context.active_object
    inner_ring.name = "Stargate_InnerRing"
    assign_mat(inner_ring, mat_obsidian)
    smooth_shade(inner_ring)

    for i in range(36):
        ang = (i / 36.0) * math.pi * 2.0
        gx = math.cos(ang) * 2.26
        gy = gate_center.y + math.sin(ang) * 2.26
        bpy.ops.mesh.primitive_cube_add(size=0.09, location=(gx, gy, 0.12), rotation=(0, 0, ang))
        glyph = bpy.context.active_object
        glyph.name = f"Stargate_Glyph_{i}"
        glyph.scale = (0.65, 1.35, 0.35)
        assign_mat(glyph, mat_cyan_glow if i % 3 != 0 else mat_amber_glow)

    # 1D. 9 Articulated V-Shaped Chevron Assemblies around the Stargate
    for i in range(9):
        ang = (i / 9.0) * math.pi * 2.0 + math.pi / 2.0
        cx = math.cos(ang) * 2.74
        cy = gate_center.y + math.sin(ang) * 2.74

        bpy.ops.mesh.primitive_cone_add(
            vertices=4,
            radius1=0.34,
            radius2=0.14,
            depth=0.52,
            location=(cx, cy, 0.0),
            rotation=(0, 0, ang - math.pi / 2.0),
        )
        cowl = bpy.context.active_object
        cowl.name = f"Stargate_Chevron_Housing_{i}"
        cowl.scale = (1.15, 0.85, 1.25)
        assign_mat(cowl, mat_gold)

        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=2,
            radius=0.14,
            location=(math.cos(ang) * 2.58, gate_center.y + math.sin(ang) * 2.58, 0.18),
        )
        crystal = bpy.context.active_object
        crystal.name = f"Stargate_Chevron_Crystal_{i}"
        crystal.scale = (0.75, 1.35, 0.65)
        crystal.rotation_euler = (0, 0, ang)
        assign_mat(crystal, mat_cyan_glow if i % 2 == 0 else mat_amber_glow)

    # 1E. Twin Orbital Gantry Pylons & Pedestal Base
    for side_idx, sx in enumerate([-1.0, 1.0]):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=0.34,
            depth=3.5,
            location=(sx * 2.95, -0.85, -0.15),
            rotation=(math.pi / 2, 0, sx * -0.22),
        )
        pylon = bpy.context.active_object
        pylon.name = f"Stargate_Gantry_{side_idx}"
        assign_mat(pylon, mat_titanium)

    # 1F. Helios Prime Star + 3 Dyson Swarm Collector Rings (Left Background)
    star_pos = Vector((-7.8, 1.85, -4.8))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.45, location=star_pos)
    star = bpy.context.active_object
    star.name = "Helios_Star_Core"
    assign_mat(star, mat_star_core)
    smooth_shade(star)

    for d_idx, (r_dyson, tilt) in enumerate([(2.05, (0.45, 0.25, 0.1)), (2.45, (-0.35, 0.65, 0.3)), (2.85, (0.85, -0.2, 0.5))]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_dyson,
            minor_radius=0.045,
            major_segments=64,
            minor_segments=12,
            location=star_pos,
            rotation=tilt,
        )
        dring = bpy.context.active_object
        dring.name = f"Dyson_Ring_{d_idx}"
        assign_mat(dring, mat_gold if d_idx != 1 else mat_amber_glow)
        smooth_shade(dring)

    # 1G. Thalassa-IV (Displaced Ocean & Continent Super-Earth + Ring System on Right)
    thal_pos = Vector((6.6, 1.25, -3.4))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.22, location=thal_pos)
    thal_ocean = bpy.context.active_object
    thal_ocean.name = "Planet_Thalassa"
    assign_mat(thal_ocean, mat_ocean_planet)
    smooth_shade(thal_ocean)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.225, location=thal_pos)
    thal_land = bpy.context.active_object
    thal_land.name = "Planet_Thalassa_Continents"
    bm = bmesh.new()
    bm.from_mesh(thal_land.data)
    for v in bm.verts:
        n_val = noise.turbulence_vector(v.co * 1.45, 4, False)
        elev = (n_val.x + n_val.y) * 0.5
        if elev > 0.04:
            v.co += v.co.normalized() * (elev * 0.13)
        else:
            v.co *= 0.97
    bm.to_mesh(thal_land.data)
    bm.free()
    assign_mat(thal_land, mat_continent)
    smooth_shade(thal_land)

    for r_idx, (r_maj, r_min) in enumerate([(1.90, 0.14), (2.30, 0.09)]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_maj,
            minor_radius=r_min,
            major_segments=72,
            minor_segments=12,
            location=thal_pos,
            rotation=(1.15, -0.25, 0.20),
        )
        pring = bpy.context.active_object
        pring.name = f"Thalassa_Ring_{r_idx}"
        pring.scale = (1.0, 1.0, 0.08)
        assign_mat(pring, mat_ring_ice if r_idx == 0 else mat_gold)
        smooth_shade(pring)

    # 1H. Pyros-IX (Fractured Volcanic World on Lower Left)
    pyros_pos = Vector((-5.2, -1.65, -2.2))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.74, location=pyros_pos)
    pyros_core = bpy.context.active_object
    pyros_core.name = "Planet_Pyros_Core"
    assign_mat(pyros_core, mat_lava_core)
    smooth_shade(pyros_core)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.76, location=pyros_pos)
    pyros_crust = bpy.context.active_object
    pyros_crust.name = "Planet_Pyros"
    bm = bmesh.new()
    bm.from_mesh(pyros_crust.data)
    for v in bm.verts:
        nv = noise.turbulence_vector(v.co * 2.2, 4, True)
        ridge = abs(nv.x) - 0.18
        v.co += v.co.normalized() * (ridge * 0.14)
    bm.to_mesh(pyros_crust.data)
    bm.free()
    assign_mat(pyros_crust, mat_lava_rock)
    smooth_shade(pyros_crust)

    # 1I. Celestial Astrolabe Orbit Rings
    for o_idx, r_orb in enumerate([5.2, 8.2, 11.0]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_orb,
            minor_radius=0.018,
            major_segments=120,
            minor_segments=8,
            location=(0, -0.35, -2.2),
            rotation=(math.pi / 2 + (0.12 if o_idx % 2 == 0 else -0.09), 0.0, 0.06 * o_idx),
        )
        orb = bpy.context.active_object
        orb.name = f"Astrolabe_Ring_{o_idx}"
        assign_mat(orb, mat_gold if o_idx != 1 else mat_cyan_glow)

    out_path = os.path.join(OUT_DIR, "stargate_odyssey.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_yup=False, export_apply=True)
    print(f"[Blender 5.0.1] Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


# =============================================================================
# 2. KINGDOM CHRONICLES — Carved Relief Continent & Clockwork Citadel Map
# =============================================================================
def build_kingdom_chronicles():
    clear_scene()
    random.seed(108)

    mat_parchment_gold = make_pbr_mat("Continent_GoldStone", (0.76, 0.58, 0.34, 1.0), metallic=0.35, roughness=0.48)
    mat_basalt_peak = make_pbr_mat("Obsidian_Mountains", (0.15, 0.13, 0.16, 1.0), metallic=0.48, roughness=0.45)
    mat_sea_sapphire = make_pbr_mat("Astrolabe_Sea", (0.04, 0.18, 0.36, 1.0), metallic=0.68, roughness=0.14)
    mat_brass = make_pbr_mat("Royal_Clockwork_Brass", (0.95, 0.70, 0.24, 1.0), metallic=0.95, roughness=0.18)
    mat_ivory_stone = make_pbr_mat("Citadel_IvoryStone", (0.90, 0.82, 0.68, 1.0), metallic=0.18, roughness=0.38)
    mat_emerald_wood = make_pbr_mat("Sylvan_Heartwood", (0.12, 0.48, 0.28, 1.0), metallic=0.12, roughness=0.52)
    mat_magma = make_pbr_mat(
        "Dreadfire_Lava",
        (1.0, 0.34, 0.04, 1.0),
        metallic=0.0,
        roughness=0.15,
        emission_color=(1.0, 0.30, 0.02),
        emission_strength=7.5,
    )
    mat_candle_flame = make_pbr_mat(
        "Candle_Flame_Glow",
        (1.0, 0.78, 0.28, 1.0),
        metallic=0.0,
        roughness=0.1,
        emission_color=(1.0, 0.70, 0.18),
        emission_strength=8.5,
    )
    mat_cyan_beacon = make_pbr_mat(
        "Pharos_Beacon_Glow",
        (0.25, 0.92, 1.0, 1.0),
        metallic=0.1,
        roughness=0.1,
        emission_color=(0.15, 0.88, 1.0),
        emission_strength=7.0,
    )

    # 2A. Astrolabe Sea Base Disc (lies in X-Z plane at y = -1.35)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=96,
        radius=9.5,
        depth=0.24,
        location=(0, -1.35, 0),
        rotation=(math.pi / 2, 0, 0),
    )
    sea_disc = bpy.context.active_object
    sea_disc.name = "Astrolabe_Sea_Disc"
    assign_mat(sea_disc, mat_sea_sapphire)
    smooth_shade(sea_disc)

    # Engraved Brass War-Table Rim
    bpy.ops.mesh.primitive_torus_add(
        major_radius=9.55,
        minor_radius=0.22,
        major_segments=96,
        minor_segments=16,
        location=(0, -1.25, 0),
        rotation=(math.pi / 2, 0, 0),
    )
    table_rim = bpy.context.active_object
    table_rim.name = "WarTable_Brass_Rim"
    assign_mat(table_rim, mat_brass)
    smooth_shade(table_rim)

    # 2B. Sculpted 3D Relief Continent Mesh (96x72 grid in X-Z plane at y = -1.18)
    bpy.ops.mesh.primitive_grid_add(
        x_subdivisions=96,
        y_subdivisions=72,
        size=15.0,
        location=(0, -1.18, 0),
        rotation=(math.pi / 2, 0, 0),
    )
    continent = bpy.context.active_object
    continent.name = "Kingdom_Relief_Continent"
    continent.scale = (1.12, 0.82, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bm = bmesh.new()
    bm.from_mesh(continent.data)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        dist = math.sqrt((x * 0.14) ** 2 + (z * 0.18) ** 2)
        coast_mask = max(0.0, 1.0 - max(0.0, (dist - 0.55) / 0.42))
        nv = noise.turbulence_vector(Vector((x * 0.35 + 3.1, z * 0.35 + 1.7, 0.5)), 5, True)
        # Terrace steps for Game of Thrones carved tabletop relief look
        raw_h = (abs(nv.x) * 1.15 + abs(nv.y) * 0.65) * coast_mask
        terraced_h = math.floor(raw_h * 9.0) / 9.0 * 0.7 + raw_h * 0.3
        # Raise central citadel plateau
        citadel_d = math.sqrt(x * x + z * z)
        if citadel_d < 2.2:
            terraced_h = max(terraced_h, (1.0 - citadel_d / 2.2) * 0.62)
        # Raise NW Volcanic Peak (-4.4, -2.0)
        volc_d = math.sqrt((x + 4.4) ** 2 + (z + 2.0) ** 2)
        if volc_d < 2.0:
            cone = (1.0 - volc_d / 2.0) * 1.45
            if volc_d < 0.42:
                cone -= (0.42 - volc_d) * 1.8  # caldera crater
            terraced_h = max(terraced_h, cone)
        v.co.y = -1.18 + terraced_h
    bm.to_mesh(continent.data)
    bm.free()
    assign_mat(continent, mat_parchment_gold)
    smooth_shade(continent)

    # 2C. Central Sun-Crowned Imperial Citadel (Multi-Tier Gothic Keep + 8 Bastion Towers)
    citadel_y = -0.52
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=8,
        radius=1.18,
        depth=0.55,
        location=(0, citadel_y, 0),
        rotation=(math.pi / 2, 0, math.pi / 8),
    )
    keep_base = bpy.context.active_object
    keep_base.name = "Citadel_Base_Fortress"
    assign_mat(keep_base, mat_ivory_stone)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=8,
        radius=0.72,
        depth=1.05,
        location=(0, citadel_y + 0.65, 0),
        rotation=(math.pi / 2, 0, 0),
    )
    keep_upper = bpy.context.active_object
    keep_upper.name = "Citadel_Upper_Keep"
    assign_mat(keep_upper, mat_ivory_stone)

    bpy.ops.mesh.primitive_cone_add(
        vertices=8,
        radius1=0.78,
        radius2=0.04,
        depth=1.15,
        location=(0, citadel_y + 1.65, 0),
        rotation=(-math.pi / 2, 0, 0),
    )
    spire = bpy.context.active_object
    spire.name = "Citadel_Sun_Spire"
    assign_mat(spire, mat_brass)

    for t_i in range(8):
        ang = (t_i / 8.0) * math.pi * 2.0
        tx = math.cos(ang) * 1.12
        tz = math.sin(ang) * 1.12
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=0.22,
            depth=1.10,
            location=(tx, citadel_y + 0.35, tz),
            rotation=(math.pi / 2, 0, ang),
        )
        twr = bpy.context.active_object
        twr.name = f"Citadel_Bastion_Tower_{t_i}"
        assign_mat(twr, mat_ivory_stone)

        bpy.ops.mesh.primitive_cone_add(
            vertices=8,
            radius1=0.26,
            radius2=0.02,
            depth=0.48,
            location=(tx, citadel_y + 1.12, tz),
            rotation=(-math.pi / 2, 0, ang),
        )
        roof = bpy.context.active_object
        roof.name = f"Citadel_Bastion_Roof_{t_i}"
        assign_mat(roof, mat_brass)

    # 2D. 3 Interlocking Toothed Clockwork Brass Gears + Celestial Astrolabe Arches
    gear_configs = [
        ("Clockwork_Gear_Main", (0.0, -0.58, 0.0), 1.85, 24),
        ("Clockwork_Gear_NW", (-2.65, -0.62, -1.25), 1.18, 16),
        ("Clockwork_Gear_SE", (2.85, -0.62, 1.35), 1.28, 18),
    ]
    for g_name, g_pos, g_rad, g_teeth in gear_configs:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=g_teeth * 2,
            radius=g_rad,
            depth=0.14,
            location=g_pos,
            rotation=(math.pi / 2, 0, 0),
        )
        gear = bpy.context.active_object
        gear.name = g_name
        bm = bmesh.new()
        bm.from_mesh(gear.data)
        for v in bm.verts:
            ang = math.atan2(v.co.z, v.co.x)
            idx = int(round((ang + math.pi) / (2 * math.pi) * (g_teeth * 2)))
            if idx % 2 == 0:
                r = math.sqrt(v.co.x ** 2 + v.co.z ** 2)
                if r > g_rad * 0.7:
                    v.co.x *= 1.14
                    v.co.z *= 1.14
        bm.to_mesh(gear.data)
        bm.free()
        assign_mat(gear, mat_brass)

    # Overarching Celestial Astrolabe Rings above the Citadel
    for a_idx, (r_arch, rot) in enumerate([(2.15, (0.35, 0.4, 0.0)), (2.45, (-0.35, -0.4, 0.2))]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_arch,
            minor_radius=0.045,
            major_segments=72,
            minor_segments=12,
            location=(0, 0.45, 0),
            rotation=rot,
        )
        arch = bpy.context.active_object
        arch.name = f"Clockwork_Astrolabe_Arch_{a_idx}"
        assign_mat(arch, mat_brass)
        smooth_shade(arch)

    # 2E. Dreadfire Volcanic Lava Crater & Rivers (NW at (-4.4, 0.15, -2.0))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.42, location=(-4.4, 0.05, -2.0))
    lava_pool = bpy.context.active_object
    lava_pool.name = "Dreadfire_Lava_Crater"
    lava_pool.scale = (1.0, 0.35, 1.0)
    assign_mat(lava_pool, mat_magma)

    # 2F. Vaelen Coastal Pharos Lighthouse (SW at (-3.5, -0.35, 2.3))
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=0.24,
        depth=1.25,
        location=(-3.5, -0.35, 2.3),
        rotation=(math.pi / 2, 0, 0),
    )
    pharos = bpy.context.active_object
    pharos.name = "Vaelen_Pharos_Tower"
    assign_mat(pharos, mat_ivory_stone)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.20, location=(-3.5, 0.38, 2.3))
    pharos_orb = bpy.context.active_object
    pharos_orb.name = "Vaelen_Pharos_Beacon"
    assign_mat(pharos_orb, mat_cyan_beacon)

    # 2G. Sylvan Heartwood Sanctum Tree & Observatory (East at (4.4, -0.35, 0.4))
    bpy.ops.mesh.primitive_cone_add(
        vertices=12,
        radius1=0.65,
        radius2=0.22,
        depth=1.15,
        location=(4.4, -0.35, 0.4),
        rotation=(-math.pi / 2, 0, 0),
    )
    htree = bpy.context.active_object
    htree.name = "Heartwood_Trunk"
    assign_mat(htree, mat_brass)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.82, location=(4.4, 0.42, 0.4))
    hcanopy = bpy.context.active_object
    hcanopy.name = "Heartwood_Canopy"
    hcanopy.scale = (1.15, 0.65, 1.15)
    assign_mat(hcanopy, mat_emerald_wood)
    smooth_shade(hcanopy)

    # 2H. 4 Corner Brass Candelabras with Glowing Candle Flames
    for c_idx, (cx, cz) in enumerate([(-6.8, -3.6), (6.8, -3.6), (-6.8, 3.6), (6.8, 3.6)]):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=16,
            radius=0.22,
            depth=1.45,
            location=(cx, -0.45, cz),
            rotation=(math.pi / 2, 0, 0),
        )
        cstick = bpy.context.active_object
        cstick.name = f"Corner_Candelabra_{c_idx}"
        assign_mat(cstick, mat_brass)

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.16, location=(cx, 0.42, cz))
        flame = bpy.context.active_object
        flame.name = f"Corner_Candle_Flame_{c_idx}"
        flame.scale = (0.75, 1.65, 0.75)
        assign_mat(flame, mat_candle_flame)

    out_path = os.path.join(OUT_DIR, "kingdom_chronicles.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_yup=False, export_apply=True)
    print(f"[Blender 5.0.1] Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


# =============================================================================
# 3. AETHER ARCHIPELAGO — Floating Sky-Islands, Crystal World-Tree & Orrery
# =============================================================================
def build_aether_archipelago():
    clear_scene()
    random.seed(777)

    mat_cliff_rock = make_pbr_mat("SkyIsland_CliffRock", (0.28, 0.24, 0.36, 1.0), metallic=0.22, roughness=0.68)
    mat_emerald_turf = make_pbr_mat("SkyIsland_EmeraldPlateau", (0.14, 0.68, 0.46, 1.0), metallic=0.10, roughness=0.48)
    mat_gold_temple = make_pbr_mat("Astral_Gold_Sanctuary", (0.96, 0.76, 0.28, 1.0), metallic=0.94, roughness=0.18)
    mat_ivory_marble = make_pbr_mat("Sanctuary_Marble", (0.94, 0.91, 0.86, 1.0), metallic=0.12, roughness=0.32)
    mat_crystal_cyan = make_pbr_mat(
        "WorldTree_Mana_Cyan",
        (0.18, 0.95, 1.0, 1.0),
        metallic=0.15,
        roughness=0.08,
        emission_color=(0.10, 0.88, 0.96),
        emission_strength=7.5,
    )
    mat_crystal_violet = make_pbr_mat(
        "WorldTree_Mana_Violet",
        (0.75, 0.35, 1.0, 1.0),
        metallic=0.15,
        roughness=0.08,
        emission_color=(0.68, 0.28, 1.0),
        emission_strength=6.5,
    )
    mat_waterfall = make_pbr_mat(
        "Silver_Cloud_Waterfall",
        (0.65, 0.92, 1.0, 1.0),
        metallic=0.1,
        roughness=0.12,
        emission_color=(0.38, 0.82, 1.0),
        emission_strength=3.5,
    )

    islands_spec = [
        ("SkyIsland_0_Sanctuary", Vector((0.0, 0.15, 0.0)), 2.25, 2.65),
        ("SkyIsland_1_WindDock", Vector((-5.6, 1.15, -2.0)), 1.45, 1.85),
        ("SkyIsland_2_ChronoSpire", Vector((5.8, 1.35, -2.2)), 1.50, 1.95),
        ("SkyIsland_3_WaterfallReef", Vector((-3.8, -0.85, 2.2)), 1.25, 1.65),
        ("SkyIsland_4_StarForge", Vector((4.2, -0.65, 2.0)), 1.30, 1.75),
    ]

    for idx, (isl_name, pos, rad, depth) in enumerate(islands_spec):
        # Inverted noise-sculpted craggy cliff cone
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=rad, location=pos)
        rock = bpy.context.active_object
        rock.name = isl_name
        bm = bmesh.new()
        bm.from_mesh(rock.data)
        for v in bm.verts:
            local = v.co - pos
            if local.y > 0.0:
                # Flatten top into terraced plateau
                local.y *= 0.22
                local.x *= 1.08
                local.z *= 1.08
            else:
                # Taper bottom into craggy inverted spire with noise turbulence
                t = abs(local.y) / rad
                taper = max(0.08, 1.0 - (t ** 0.75) * 0.88)
                nv = noise.turbulence_vector(local * 1.35 + Vector((idx * 2.1, 0, 0)), 4, True)
                local.x = local.x * taper + nv.x * 0.22
                local.z = local.z * taper + nv.z * 0.22
                local.y = local.y * (depth / rad) - abs(nv.y) * 0.35
            v.co = pos + local
        bm.to_mesh(rock.data)
        bm.free()
        assign_mat(rock, mat_cliff_rock)
        smooth_shade(rock)

        # Emerald Plateau Cap on top of each island
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32,
            radius=rad * 0.98,
            depth=0.22,
            location=pos + Vector((0, 0.14, 0)),
            rotation=(math.pi / 2, 0, 0),
        )
        cap = bpy.context.active_object
        cap.name = f"{isl_name}_EmeraldCap"
        assign_mat(cap, mat_emerald_turf)
        smooth_shade(cap)

    # 3B. Central Sanctuary Crystal World-Tree & Golden Astronomical Orrery
    c_pos = islands_spec[0][1] + Vector((0, 0.25, 0))
    bpy.ops.mesh.primitive_cone_add(
        vertices=12,
        radius1=0.58,
        radius2=0.22,
        depth=1.85,
        location=c_pos + Vector((0, 0.85, 0)),
        rotation=(-math.pi / 2, 0, 0),
    )
    trunk = bpy.context.active_object
    trunk.name = "WorldTree_GoldenTrunk"
    assign_mat(trunk, mat_gold_temple)
    smooth_shade(trunk)

    # Cluster of 14 Faceted Bioluminescent Mana Crystals forming the World-Tree Crown
    for c_i in range(14):
        ang = (c_i / 14.0) * math.pi * 2.0
        ring_r = 0.0 if c_i == 0 else (0.55 if c_i < 7 else 0.95)
        cy = 2.15 if c_i == 0 else (1.90 if c_i < 7 else 1.65)
        cx = math.cos(ang) * ring_r
        cz = math.sin(ang) * ring_r
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=0.46 if c_i == 0 else 0.32,
            location=c_pos + Vector((cx, cy, cz)),
        )
        cryst = bpy.context.active_object
        cryst.name = f"WorldTree_Crystal_{c_i}"
        cryst.scale = (0.65, 1.65, 0.65)
        cryst.rotation_euler = (math.sin(ang) * 0.35, ang, -math.cos(ang) * 0.35)
        assign_mat(cryst, mat_crystal_cyan if c_i % 3 != 0 else mat_crystal_violet)

    # 3 Rotating Golden Astronomical Orrery Rings around the World-Tree
    for r_i, (r_maj, rot) in enumerate([(1.75, (0.55, 0.25, 0.0)), (2.15, (-0.45, 0.65, 0.3)), (2.55, (0.15, -0.35, 0.8))]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_maj,
            minor_radius=0.038,
            major_segments=72,
            minor_segments=12,
            location=c_pos + Vector((0, 1.75, 0)),
            rotation=rot,
        )
        oring = bpy.context.active_object
        oring.name = f"Orrery_Ring_{r_i}"
        assign_mat(oring, mat_gold_temple)
        smooth_shade(oring)

    # 3C. Outer Island Temples, Spires & Cascading Silver Waterfalls
    for outer_i in range(1, 5):
        p = islands_spec[outer_i][1] + Vector((0, 0.25, 0))
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=0.42,
            depth=0.95,
            location=p + Vector((0, 0.45, 0)),
            rotation=(math.pi / 2, 0, 0),
        )
        shrine = bpy.context.active_object
        shrine.name = f"Island_Shrine_{outer_i}"
        assign_mat(shrine, mat_ivory_marble)

        bpy.ops.mesh.primitive_cone_add(
            vertices=8,
            radius1=0.52,
            radius2=0.04,
            depth=0.75,
            location=p + Vector((0, 1.25, 0)),
            rotation=(-math.pi / 2, 0, 0),
        )
        s_roof = bpy.context.active_object
        s_roof.name = f"Island_Shrine_Roof_{outer_i}"
        assign_mat(s_roof, mat_gold_temple)

    # Cascading Waterfalls off Sanctuary & Waterfall Reef Islands
    for wf_i, wf_pos in enumerate([Vector((-1.55, -1.35, 0.85)), Vector((1.45, -1.35, 0.95)), Vector((-3.8, -2.25, 2.95))]):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=16,
            radius=0.18,
            depth=2.85,
            location=wf_pos,
            rotation=(math.pi / 2, 0, 0),
        )
        wf = bpy.context.active_object
        wf.name = f"Waterfall_Ribbon_{wf_i}"
        wf.scale = (1.35, 1.0, 0.35)
        assign_mat(wf, mat_waterfall)
        smooth_shade(wf)

    out_path = os.path.join(OUT_DIR, "aether_archipelago.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_yup=False, export_apply=True)
    print(f"[Blender 5.0.1] Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


if __name__ == "__main__":
    build_stargate_odyssey()
    build_kingdom_chronicles()
    build_aether_archipelago()
    print("[Blender 5.0.1] All 3 Plajah Worlds .glb assets built successfully!")
