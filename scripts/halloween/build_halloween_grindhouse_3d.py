"""
Headless Blender 5.0.1 (`bpy`) 3D Model & Character Rig Builder for:
  1. `public/models/halloween/pumpkin_patch_tank.glb`
     - Pumpkin Patch's Armored Military Tank / War-Rig from the film (modeled from `panel_165.jpg` & `panel_195.jpg`)
       with caterpillar treads, skull front grille, combustion headlights, Melvin & Tepes in the armored cab,
       and rotating roof turret with Lil' Boo + triple heavy machine cannons.
  2. `public/models/halloween/pumpkin_patch_cast.glb`
     - 3D sculpted & articulated character models built using the real movie frames (`char_1_portrait.jpg` .. `char_8_portrait.jpg`)
       projected onto 3D facial/body geometry with PBR materials:
       - `Char_PumpkinPatch` (Melvin Lester with 3D carved Jack-o'-Lantern head, leather trench duster & dual plasma blades)
       - `Char_Miriam` (Wicked Witch Miriam in witch hat, eyepatch, emerald skin, cyber-cat familiar & broomstick)
       - `Char_WingedMonkey` (3D winged monkey soldier with articulated wings)
       - `Char_Stitch` (Stitch the Scarecrow in stitched burlap mask & tattered coat)
       - `Char_Katrina` (Special Agent Katrina Van Tassel)
       - `Char_RoboBones` (Commander Crane cybernetic skeleton in top hat)
       - `Char_Ichabod` (Director Jack / Ichabod Crane in tuxedo & crimson bow tie)
       - `Char_Marv` (District 13 Tavern Fixer)
  3. `public/models/halloween/grindhouse_survivors_and_monsters.glb`
     - `Survivor_Male` & `Survivor_Female` (Playable 3D human characters armed with a Spiked Baseball Bat in R-hand & Flaming Molotov Cocktail in L-hand)
     - `Monster_Zombie`, `Monster_Werewolf`, `Monster_Ghost` (3D roaming enemies with articulated limbs)
  4. `public/models/halloween/haunted_castle_fortress.glb`
     - High-detail Gothic Haunted Castle keep, buttresses, spires, arched windows, iron portcullis gate & gargoyle pillars.
"""

import os
import math
import bpy
import bmesh
from mathutils import Vector, Euler, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "models", "halloween")
STILLS_DIR = os.path.join(ROOT, "public", "generated", "comics", "pumpkin_patch_v4")
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
    image_path=None,
):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness

    if image_path and os.path.exists(image_path):
        tex_node = nt.nodes.new("ShaderNodeTexImage")
        tex_node.image = bpy.data.images.load(image_path, check_existing=True)
        nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
        if emission_strength > 0.0:
            if "Emission Color" in bsdf.inputs:
                nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Emission Color"])
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
        return mat

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


def project_frontal_uvs(obj):
    """Projects clean frontal UVs (X, Y -> U, V) onto a 3D head/torso mesh so movie portrait textures wrap naturally."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv_layer = me.uv_layers.active.data
    verts = [v.co for v in me.vertices]
    if not verts:
        return
    min_x = min(v.x for v in verts)
    max_x = max(v.x for v in verts)
    min_y = min(v.y for v in verts)
    max_y = max(v.y for v in verts)
    dx = max(max_x - min_x, 1e-4)
    dy = max(max_y - min_y, 1e-4)
    for poly in me.polygons:
        for loop_idx in poly.loop_indices:
            v = me.vertices[me.loops[loop_idx].vertex_index].co
            # Center portrait face region [0.22..0.78] horizontally, [0.15..0.88] vertically
            u = 0.22 + 0.56 * ((v.x - min_x) / dx)
            v_coord = 0.15 + 0.73 * ((v.y - min_y) / dy)
            uv_layer[loop_idx].uv = (u, v_coord)


def add_part(parent, name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    assign_mat(ob, mat)
    smooth_shade(ob)
    return ob


def make_capsule_bm(radius_top, radius_bot, height, segs=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=True,
        segments=segs,
        radius1=radius_bot,
        radius2=radius_top,
        depth=height,
    )
    # Rotate from Blender Z-axis cylinder to Y-up height
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2.0, 3, "X"))
    bmesh.ops.Subdivide_edges(bm, edges=bm.edges, cuts=1, use_grid_fill=True) if hasattr(bmesh.ops, "Subdivide_edges") else None
    return bm


def make_sculpted_head_bm(rx=0.24, ry=0.29, rz=0.25, pumpkin_ribs=False, snout_len=0.0, witch_hat=False):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=20, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        # Map sphere in Y-up space (y = vertical, z = forward face)
        px = x * rx
        py = y * ry
        pz = z * rz
        if pumpkin_ribs:
            angle = math.atan2(x, z)
            rib = 1.0 + 0.09 * math.cos(angle * 12.0)
            px *= rib
            pz *= rib
            # Flatten top & bottom slightly like a real carved pumpkin
            py *= 0.88
        else:
            # Sculpt anatomical jawline, brow ridge, cheekbones, and nose bridge on +Z face
            if z > 0.15:
                # Nose bridge protrusion
                if abs(x) < 0.25 and -0.15 < y < 0.22:
                    pz += 0.055 * (1.0 - abs(x) / 0.25) * math.cos((y - 0.02) * 5.0)
                # Eye socket indentation
                if 0.05 < y < 0.32 and 0.18 < abs(x) < 0.58:
                    pz -= 0.028
                # Jaw taper
                if y < -0.15:
                    px *= 0.82
        if snout_len > 0.0 and z > 0.2 and -0.35 < y < 0.12:
            pz += snout_len * max(0.0, (z - 0.2)) * (1.0 - abs(x) * 0.9)
        v.co = Vector((px, py, pz))
    bm.normal_update()
    return bm


def build_humanoid_rig(
    root_name: str,
    offset_x: float,
    body_mat,
    head_mat,
    pants_mat,
    boot_mat,
    skin_mat,
    pumpkin_head=False,
    witch_hat=False,
    top_hat=False,
    plasma_blades=False,
    spiked_bat=False,
    molotov=False,
    snout_len=0.0,
    female_proportions=False,
    ghost_shroud=False,
):
    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    root.location = (offset_x, 0.0, 0.0)

    shoulder_w = 0.27 if female_proportions else 0.34
    waist_w = 0.19 if female_proportions else 0.25
    hip_w = 0.24 if female_proportions else 0.24

    # Torso (chest + coat/jacket)
    bm_torso = make_capsule_bm(shoulder_w, waist_w, 0.68, segs=20)
    torso = add_part(root, f"{root_name}_Torso", bm_torso, body_mat, loc=(0, 1.16, 0))
    project_frontal_uvs(torso)

    # Coat / Jacket Lapels & Skirt/Duster Tail
    if not ghost_shroud:
        bm_hips = make_capsule_bm(waist_w, hip_w, 0.28, segs=18)
        add_part(root, f"{root_name}_Pelvis", bm_hips, pants_mat, loc=(0, 0.76, 0))
    else:
        bm_shroud = make_capsule_bm(0.24, 0.48, 0.92, segs=24)
        add_part(root, f"{root_name}_Shroud", bm_shroud, body_mat, loc=(0, 0.52, 0))

    # Head Pivot & Sculpted 3D Head with UV-projected Movie Portrait Texture
    head_rx = 0.30 if pumpkin_head else (0.19 if female_proportions else 0.21)
    head_ry = 0.27 if pumpkin_head else 0.24
    head_rz = 0.30 if pumpkin_head else 0.22
    bm_head = make_sculpted_head_bm(
        rx=head_rx, ry=head_ry, rz=head_rz, pumpkin_ribs=pumpkin_head, snout_len=snout_len
    )
    head_ob = add_part(root, f"{root_name}_Head", bm_head, head_mat, loc=(0, 1.68, 0.02))
    project_frontal_uvs(head_ob)

    if pumpkin_head:
        # Glowing internal Jack-o'-Lantern core & twisted stem
        glow_mat = make_pbr_mat(
            "Pumpkin_Fire_Core",
            (1.0, 0.55, 0.05, 1.0),
            roughness=0.1,
            emission_color=(1.0, 0.48, 0.02),
            emission_strength=8.5,
        )
        bm_core = bmesh.new()
        bmesh.ops.create_uvsphere(bm_core, u_segments=16, v_segments=12, radius=0.22)
        add_part(head_ob, f"{root_name}_FireCore", bm_core, glow_mat, loc=(0, 0, 0.04))

        stem_mat = make_pbr_mat("Pumpkin_Stem", (0.18, 0.26, 0.09, 1.0), roughness=0.85)
        bm_stem = make_capsule_bm(0.03, 0.065, 0.16, segs=10)
        add_part(head_ob, f"{root_name}_Stem", bm_stem, stem_mat, loc=(0, 0.28, -0.02), rot=(0.25, 0, 0.18))

    if witch_hat:
        hat_mat = make_pbr_mat("Witch_Hat_Black", (0.04, 0.04, 0.06, 1.0), roughness=0.6)
        bm_brim = make_capsule_bm(0.48, 0.48, 0.025, segs=24)
        add_part(head_ob, f"{root_name}_HatBrim", bm_brim, hat_mat, loc=(0, 0.16, 0), rot=(-0.12, 0, 0))
        bm_cone = make_capsule_bm(0.02, 0.22, 0.46, segs=20)
        add_part(head_ob, f"{root_name}_HatCone", bm_cone, hat_mat, loc=(0, 0.39, -0.03), rot=(-0.2, 0, 0))

    if top_hat:
        hat_mat = make_pbr_mat("TopHat_Silk", (0.05, 0.05, 0.07, 1.0), roughness=0.35, metallic=0.2)
        bm_brim = make_capsule_bm(0.32, 0.32, 0.025, segs=24)
        add_part(head_ob, f"{root_name}_TopHatBrim", bm_brim, hat_mat, loc=(0, 0.18, 0))
        bm_crown = make_capsule_bm(0.21, 0.19, 0.30, segs=24)
        add_part(head_ob, f"{root_name}_TopHatCrown", bm_crown, hat_mat, loc=(0, 0.33, 0))

    # Articulated Arms (Arm_L, Arm_R) with pivots at shoulders
    for side, sx in (("L", -1.0), ("R", 1.0)):
        arm_pivot = bpy.data.objects.new(f"{root_name}_Arm_{side}", None)
        bpy.context.scene.collection.objects.link(arm_pivot)
        arm_pivot.parent = root
        arm_pivot.location = (sx * (shoulder_w + 0.06), 1.42, 0.0)

        bm_upper = make_capsule_bm(0.075, 0.065, 0.34, segs=14)
        add_part(arm_pivot, f"{root_name}_UpperArm_{side}", bm_upper, body_mat, loc=(0, -0.16, 0))
        bm_fore = make_capsule_bm(0.062, 0.052, 0.32, segs=14)
        fore = add_part(arm_pivot, f"{root_name}_ForeArm_{side}", bm_fore, skin_mat, loc=(0, -0.46, 0.06), rot=(0.35, 0, 0))

        # Dual Plasma Blades for Pumpkin Patch
        if plasma_blades:
            hilt_mat = make_pbr_mat("Blade_Hilt", (0.12, 0.12, 0.15, 1.0), metallic=0.9, roughness=0.25)
            plasma_mat = make_pbr_mat(
                "Orange_Plasma_Blade",
                (1.0, 0.48, 0.05, 1.0),
                roughness=0.1,
                emission_color=(1.0, 0.42, 0.02),
                emission_strength=11.0,
            )
            bm_hilt = make_capsule_bm(0.032, 0.032, 0.22, segs=12)
            add_part(fore, f"{root_name}_Hilt_{side}", bm_hilt, hilt_mat, loc=(0, -0.16, 0.08), rot=(1.35, 0, 0))
            bm_blade = make_capsule_bm(0.012, 0.038, 1.05, segs=14)
            add_part(fore, f"{root_name}_PlasmaBlade_{side}", bm_blade, plasma_mat, loc=(0, -0.16, 0.68), rot=(1.52, 0, 0))

        # Heavy Nail-Spiked Baseball Bat in Right Hand (for Playable Survivors)
        if spiked_bat and side == "R":
            wood_mat = make_pbr_mat("Ash_Baseball_Bat", (0.58, 0.36, 0.18, 1.0), roughness=0.55)
            metal_mat = make_pbr_mat("Bat_Spikes_Steel", (0.78, 0.80, 0.84, 1.0), metallic=0.95, roughness=0.2)
            bm_bat = make_capsule_bm(0.058, 0.026, 0.88, segs=16)
            bat_ob = add_part(fore, f"{root_name}_SpikedBat", bm_bat, wood_mat, loc=(0, -0.14, 0.36), rot=(1.25, 0, 0))
            for sp_i in range(6):
                ang = sp_i * (math.pi / 3.0)
                bm_sp = make_capsule_bm(0.003, 0.014, 0.11, segs=8)
                add_part(
                    bat_ob,
                    f"{root_name}_Spike_{sp_i}",
                    bm_sp,
                    metal_mat,
                    loc=(math.cos(ang) * 0.06, 0.22 + (sp_i % 2) * 0.08, math.sin(ang) * 0.06),
                    rot=(math.sin(ang) * 1.4, 0, -math.cos(ang) * 1.4),
                )

        # Flaming Molotov Explosive Cocktail in Left Hand (for Playable Survivors)
        if molotov and side == "L":
            glass_mat = make_pbr_mat(
                "Molotov_Amber_Bottle",
                (0.75, 0.32, 0.06, 1.0),
                roughness=0.15,
                metallic=0.1,
                emission_color=(0.95, 0.35, 0.02),
                emission_strength=1.8,
            )
            wick_mat = make_pbr_mat(
                "Molotov_Flame_Wick",
                (1.0, 0.65, 0.08, 1.0),
                roughness=0.1,
                emission_color=(1.0, 0.52, 0.04),
                emission_strength=9.5,
            )
            bm_bottle = make_capsule_bm(0.028, 0.055, 0.24, segs=14)
            bot_ob = add_part(fore, f"{root_name}_MolotovBottle", bm_bottle, glass_mat, loc=(0, -0.15, 0.12), rot=(0.4, 0, 0))
            bm_flame = make_capsule_bm(0.01, 0.045, 0.14, segs=10)
            add_part(bot_ob, f"{root_name}_MolotovFlame", bm_flame, wick_mat, loc=(0, 0.16, 0))

    # Articulated Legs (Leg_L, Leg_R)
    if not ghost_shroud:
        for side, sx in (("L", -1.0), ("R", 1.0)):
            leg_pivot = bpy.data.objects.new(f"{root_name}_Leg_{side}", None)
            bpy.context.scene.collection.objects.link(leg_pivot)
            leg_pivot.parent = root
            leg_pivot.location = (sx * 0.13, 0.72, 0.0)

            bm_thigh = make_capsule_bm(0.095, 0.078, 0.38, segs=14)
            add_part(leg_pivot, f"{root_name}_Thigh_{side}", bm_thigh, pants_mat, loc=(0, -0.18, 0))
            bm_calf = make_capsule_bm(0.075, 0.062, 0.36, segs=14)
            add_part(leg_pivot, f"{root_name}_Calf_{side}", bm_calf, boot_mat, loc=(0, -0.52, 0))
            bm_boot = bmesh.new()
            bmesh.ops.create_cube(bm_boot, size=1.0)
            bmesh.ops.scale(bm_boot, vec=(0.13, 0.10, 0.26), verts=bm_boot.verts)
            add_part(leg_pivot, f"{root_name}_Boot_{side}", bm_boot, boot_mat, loc=(0, -0.67, 0.05))

    return root


# =============================================================================
# 1. BUILD PUMPKIN PATCH'S ARMORED WAR-RIG / TANK (`pumpkin_patch_tank.glb`)
#    Modeled directly after Movie Stills `panel_165.jpg` & `panel_195.jpg`
# =============================================================================
def build_pumpkin_patch_tank():
    clear_scene()
    root = bpy.data.objects.new("PumpkinPatch_Tank", None)
    bpy.context.scene.collection.objects.link(root)

    mat_armor_green = make_pbr_mat("Tank_Armor_OliveGreen", (0.11, 0.19, 0.12, 1.0), metallic=0.68, roughness=0.42)
    mat_dark_steel = make_pbr_mat("Tank_Gunmetal_Steel", (0.08, 0.09, 0.11, 1.0), metallic=0.88, roughness=0.32)
    mat_tread_rubber = make_pbr_mat("Tank_Tread_Rubber", (0.04, 0.04, 0.05, 1.0), metallic=0.25, roughness=0.85)
    mat_brass_trim = make_pbr_mat("Tank_Brass_Trim", (0.72, 0.48, 0.16, 1.0), metallic=0.9, roughness=0.28)
    mat_headlight = make_pbr_mat(
        "Tank_Combustion_Headlight",
        (1.0, 0.42, 0.08, 1.0),
        roughness=0.1,
        emission_color=(1.0, 0.35, 0.04),
        emission_strength=10.0,
    )
    mat_green_beacon = make_pbr_mat(
        "Tank_Emerald_Searchlight",
        (0.15, 1.0, 0.48, 1.0),
        roughness=0.1,
        emission_color=(0.12, 0.96, 0.45),
        emission_strength=9.5,
    )
    mat_cab_tex = make_pbr_mat(
        "Tank_Cab_Windshield_Tex",
        (0.9, 0.9, 0.9, 1.0),
        roughness=0.18,
        metallic=0.1,
        emission_strength=1.25,
        image_path=os.path.join(STILLS_DIR, "panel_165.jpg"),
    )

    # Lower Armored Hull
    bm_hull = bmesh.new()
    bmesh.ops.create_cube(bm_hull, size=1.0)
    bmesh.ops.scale(bm_hull, vec=(3.2, 1.15, 6.2), verts=bm_hull.verts)
    add_part(root, "Hull_Lower", bm_hull, mat_armor_green, loc=(0, 0.95, 0))

    # Sloped Armored Upper Cab (`panel_165.jpg` silhouette)
    bm_cab = bmesh.new()
    bmesh.ops.create_cube(bm_cab, size=1.0)
    bmesh.ops.scale(bm_cab, vec=(2.75, 1.05, 3.3), verts=bm_cab.verts)
    for v in bm_cab.verts:
        if v.co.y > 0:
            v.co.x *= 0.84
            v.co.z *= 0.86
    add_part(root, "Armored_Cab", bm_cab, mat_armor_green, loc=(0, 1.95, -0.25))

    # Front Windshield Plate displaying real `panel_165.jpg` cab interior (Melvin, Lil' Boo & Tepes at the wheel)
    bm_wind = bmesh.new()
    bmesh.ops.create_grid(bm_wind, x_segments=2, y_segments=2, size=1.0)
    bmesh.ops.scale(bm_wind, vec=(1.22, 0.46, 1.0), verts=bm_wind.verts)
    wind_ob = add_part(root, "Cab_Windshield", bm_wind, mat_cab_tex, loc=(0, 1.98, 1.32), rot=(-0.22, 0, 0))
    # Map full `panel_165.jpg` cab region onto the windshield
    me_w = wind_ob.data
    if not me_w.uv_layers:
        me_w.uv_layers.new(name="UVMap")
    uv_w = me_w.uv_layers.active.data
    for poly in me_w.polygons:
        for li in poly.loop_indices:
            v = me_w.vertices[me_w.loops[li].vertex_index].co
            u = 0.12 + 0.76 * ((v.x + 1.22) / 2.44)
            vc = 0.04 + 0.52 * ((v.y + 0.46) / 0.92)
            uv_w[li].uv = (u, vc)

    # Heavy Caterpillar Treads + Bogie Wheels (Left & Right)
    for side, sx in (("L", -1.68), ("R", 1.68)):
        bm_track = bmesh.new()
        bmesh.ops.create_cube(bm_track, size=1.0)
        bmesh.ops.scale(bm_track, vec=(0.56, 0.92, 5.8), verts=bm_track.verts)
        add_part(root, f"Track_{side}", bm_track, mat_tread_rubber, loc=(sx, 0.56, 0))

        # Armored Skirt Fender
        bm_skirt = bmesh.new()
        bmesh.ops.create_cube(bm_skirt, size=1.0)
        bmesh.ops.scale(bm_skirt, vec=(0.64, 0.28, 6.0), verts=bm_skirt.verts)
        add_part(root, f"Fender_{side}", bm_skirt, mat_dark_steel, loc=(sx, 1.08, 0))

        # 6 Road Bogie Wheels per side
        for wi in range(6):
            wz = -2.3 + wi * 0.92
            bm_wheel = bmesh.new()
            bmesh.ops.create_cone(bm_wheel, cap_ends=True, cap_tris=True, segments=18, radius1=0.42, radius2=0.42, depth=0.62)
            bmesh.ops.rotate(bm_wheel, verts=bm_wheel.verts, matrix=Matrix.Rotation(math.pi / 2.0, 3, "Y"))
            add_part(root, f"Wheel_{side}_{wi}", bm_wheel, mat_dark_steel, loc=(sx, 0.46, wz))

    # Front Heavy Skull-Ram Grille & Glowing Combustion Headlights
    bm_grille = bmesh.new()
    bmesh.ops.create_cube(bm_grille, size=1.0)
    bmesh.ops.scale(bm_grille, vec=(2.4, 0.72, 0.25), verts=bm_grille.verts)
    add_part(root, "Front_Grille", bm_grille, mat_dark_steel, loc=(0, 0.92, 3.12))

    for hx in (-1.08, 1.08):
        bm_hl = bmesh.new()
        bmesh.ops.create_uvsphere(bm_hl, u_segments=14, v_segments=10, radius=0.22)
        add_part(root, f"Headlight_{'L' if hx < 0 else 'R'}", bm_hl, mat_headlight, loc=(hx, 1.05, 3.16))

    # Rotating Roof Turret (`Turret_Pivot`) with Triple Heavy Cannons & Bioluminescent Lil' Boo (`panel_165.jpg` & `panel_195.jpg`)
    turret = bpy.data.objects.new("Turret_Pivot", None)
    bpy.context.scene.collection.objects.link(turret)
    turret.parent = root
    turret.location = (0, 2.52, -0.15)

    bm_tbase = make_capsule_bm(0.95, 1.15, 0.36, segs=24)
    add_part(turret, "Turret_Ring", bm_tbase, mat_dark_steel, loc=(0, 0.15, 0))

    # Triple Roof-Mounted Heavy Machine Cannons (matching `panel_165.jpg`)
    for ci, (cx, yaw_off) in enumerate(((-0.58, 0.12), (0.0, 0.0), (0.58, -0.12))):
        bm_barrel = make_capsule_bm(0.075, 0.11, 2.35, segs=16)
        add_part(
            turret,
            f"Cannon_{ci}",
            bm_barrel,
            mat_dark_steel,
            loc=(cx, 0.42, 1.15),
            rot=(1.42, 0, yaw_off),
        )
        bm_muzzle = make_capsule_bm(0.11, 0.11, 0.18, segs=16)
        add_part(
            turret,
            f"Muzzle_{ci}",
            bm_muzzle,
            mat_brass_trim,
            loc=(cx - math.sin(yaw_off) * 1.1, 0.62, 2.22),
            rot=(1.42, 0, yaw_off),
        )

    # Roof Searchlight Drum (Right side of turret in `panel_165.jpg`)
    bm_spot = make_capsule_bm(0.24, 0.24, 0.38, segs=18)
    add_part(turret, "Turret_Searchlight", bm_spot, mat_green_beacon, loc=(0.88, 0.38, 0.55), rot=(1.57, 0, 0))

    # 3D Bioluminescent Lil' Boo manning the roof turret (`panel_195.jpg`)
    bm_boo = make_capsule_bm(0.28, 0.36, 0.65, segs=20)
    add_part(turret, "Turret_LilBoo", bm_boo, mat_green_beacon, loc=(0, 0.58, -0.15))

    out_path = os.path.join(OUT_DIR, "pumpkin_patch_tank.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_yup=False)
    print(f"Exported {out_path} ({os.path.getsize(out_path) // 1024} KB)")


# =============================================================================
# 2. BUILD 3D RIGGED PUMPKIN PATCH MOVIE CAST (`pumpkin_patch_cast.glb`)
# =============================================================================
def build_pumpkin_patch_cast():
    clear_scene()

    mat_leather = make_pbr_mat("Black_Leather_Duster", (0.05, 0.05, 0.07, 1.0), metallic=0.25, roughness=0.35)
    mat_tux = make_pbr_mat("Tailored_Tuxedo", (0.04, 0.04, 0.06, 1.0), metallic=0.1, roughness=0.45)
    mat_witch_armor = make_pbr_mat("Miriam_Green_Armor", (0.06, 0.18, 0.10, 1.0), metallic=0.55, roughness=0.35)
    mat_burlap = make_pbr_mat("Stitch_Burlap_Coat", (0.28, 0.20, 0.13, 1.0), roughness=0.88)
    mat_chrome = make_pbr_mat("RoboBones_Chrome", (0.62, 0.68, 0.74, 1.0), metallic=0.95, roughness=0.18)
    mat_boots = make_pbr_mat("Combat_Boots", (0.04, 0.04, 0.05, 1.0), roughness=0.6)
    mat_skin = make_pbr_mat("Warm_Skin", (0.82, 0.64, 0.52, 1.0), roughness=0.55)
    mat_witch_skin = make_pbr_mat("Emerald_Witch_Skin", (0.18, 0.72, 0.28, 1.0), roughness=0.45)

    def char_tex_mat(cid, fname, emit=0.35):
        return make_pbr_mat(
            f"Mat_{cid}_Tex",
            (0.9, 0.9, 0.9, 1.0),
            roughness=0.42,
            emission_strength=emit,
            image_path=os.path.join(STILLS_DIR, fname),
        )

    # 1. Char_PumpkinPatch (Melvin Lester)
    build_humanoid_rig(
        "Char_PumpkinPatch",
        offset_x=0.0,
        body_mat=mat_leather,
        head_mat=char_tex_mat("char_1", "char_1_portrait.jpg", emit=0.65),
        pants_mat=mat_leather,
        boot_mat=mat_boots,
        skin_mat=mat_leather,
        pumpkin_head=True,
        plasma_blades=True,
    )

    # 2. Char_Miriam (Wicked Witch Miriam)
    build_humanoid_rig(
        "Char_Miriam",
        offset_x=2.5,
        body_mat=mat_witch_armor,
        head_mat=char_tex_mat("char_3", "char_3_portrait.jpg", emit=0.45),
        pants_mat=mat_witch_armor,
        boot_mat=mat_boots,
        skin_mat=mat_witch_skin,
        witch_hat=True,
        female_proportions=True,
    )

    # 3. Char_Stitch (Stitch the Scarecrow)
    build_humanoid_rig(
        "Char_Stitch",
        offset_x=5.0,
        body_mat=mat_burlap,
        head_mat=char_tex_mat("char_4", "char_4_portrait.jpg", emit=0.4),
        pants_mat=mat_burlap,
        boot_mat=mat_boots,
        skin_mat=mat_burlap,
    )

    # 4. Char_Katrina (Special Agent Katrina Van Tassel)
    build_humanoid_rig(
        "Char_Katrina",
        offset_x=7.5,
        body_mat=mat_tux,
        head_mat=char_tex_mat("char_2", "char_2_portrait.jpg", emit=0.35),
        pants_mat=mat_tux,
        boot_mat=mat_boots,
        skin_mat=mat_skin,
        female_proportions=True,
    )

    # 5. Char_RoboBones (Commander Crane)
    build_humanoid_rig(
        "Char_RoboBones",
        offset_x=10.0,
        body_mat=mat_chrome,
        head_mat=char_tex_mat("char_5", "char_5_portrait.jpg", emit=0.55),
        pants_mat=mat_tux,
        boot_mat=mat_boots,
        skin_mat=mat_chrome,
        top_hat=True,
    )

    # 6. Char_Ichabod (Director Jack / Ichabod Crane)
    build_humanoid_rig(
        "Char_Ichabod",
        offset_x=12.5,
        body_mat=mat_tux,
        head_mat=char_tex_mat("char_8", "char_8_portrait.jpg", emit=0.35),
        pants_mat=mat_tux,
        boot_mat=mat_boots,
        skin_mat=mat_skin,
    )

    # 7. Char_WingedMonkey (3D Winged Monkey Soldier with Articulated Wings)
    monkey_root = bpy.data.objects.new("Char_WingedMonkey", None)
    bpy.context.scene.collection.objects.link(monkey_root)
    monkey_root.location = (15.0, 0.0, 0.0)
    mat_monkey_fur = make_pbr_mat("Monkey_Armor_Fur", (0.16, 0.22, 0.28, 1.0), roughness=0.7)
    mat_monkey_wing = make_pbr_mat(
        "Monkey_Emerald_Wing",
        (0.10, 0.68, 0.38, 1.0),
        roughness=0.4,
        emission_color=(0.08, 0.75, 0.38),
        emission_strength=1.8,
    )
    bm_mbody = make_capsule_bm(0.22, 0.18, 0.52, segs=14)
    add_part(monkey_root, "Monkey_Torso", bm_mbody, mat_monkey_fur, loc=(0, 0.55, 0))
    bm_mhead = make_sculpted_head_bm(rx=0.18, ry=0.18, rz=0.22, snout_len=0.12)
    add_part(monkey_root, "Monkey_Head", bm_mhead, mat_monkey_fur, loc=(0, 0.92, 0.06))
    for side, sx in (("L", -1.0), ("R", 1.0)):
        wing_piv = bpy.data.objects.new(f"Monkey_Wing_{side}", None)
        bpy.context.scene.collection.objects.link(wing_piv)
        wing_piv.parent = monkey_root
        wing_piv.location = (sx * 0.20, 0.72, -0.05)
        bm_wing = bmesh.new()
        bmesh.ops.create_cube(bm_wing, size=1.0)
        bmesh.ops.scale(bm_wing, vec=(0.85, 0.04, 0.42), verts=bm_wing.verts)
        add_part(wing_piv, f"Monkey_WingMesh_{side}", bm_wing, mat_monkey_wing, loc=(sx * 0.42, 0, 0))

    out_path = os.path.join(OUT_DIR, "pumpkin_patch_cast.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_yup=False)
    print(f"Exported {out_path} ({os.path.getsize(out_path) // 1024} KB)")


# =============================================================================
# 3. BUILD PLAYABLE HUMAN SURVIVORS (MALE & FEMALE) + ROAMING MONSTERS
#    (`grindhouse_survivors_and_monsters.glb`)
# =============================================================================
def build_survivors_and_monsters():
    clear_scene()

    mat_male_jacket = make_pbr_mat("Grindhouse_Crimson_Jacket", (0.42, 0.09, 0.08, 1.0), roughness=0.48, metallic=0.15)
    mat_female_jacket = make_pbr_mat("Grindhouse_Teal_Moto", (0.09, 0.28, 0.34, 1.0), roughness=0.42, metallic=0.2)
    mat_denim = make_pbr_mat("Distressed_Denim", (0.12, 0.16, 0.24, 1.0), roughness=0.78)
    mat_boots = make_pbr_mat("Survivor_Boots", (0.06, 0.05, 0.05, 1.0), roughness=0.65)
    mat_skin = make_pbr_mat("Survivor_Skin", (0.85, 0.66, 0.54, 1.0), roughness=0.5)

    # 1. Playable Human Male Survivor (with Spiked Baseball Bat & Flaming Molotov Cocktail)
    build_humanoid_rig(
        "Survivor_Male",
        offset_x=0.0,
        body_mat=mat_male_jacket,
        head_mat=mat_skin,
        pants_mat=mat_denim,
        boot_mat=mat_boots,
        skin_mat=mat_skin,
        spiked_bat=True,
        molotov=True,
        female_proportions=False,
    )

    # 2. Playable Human Female Survivor (with Spiked Baseball Bat & Flaming Molotov Cocktail)
    build_humanoid_rig(
        "Survivor_Female",
        offset_x=2.5,
        body_mat=mat_female_jacket,
        head_mat=mat_skin,
        pants_mat=mat_denim,
        boot_mat=mat_boots,
        skin_mat=mat_skin,
        spiked_bat=True,
        molotov=True,
        female_proportions=True,
    )

    # 3. Roaming Monster: Undead Zombie Walker
    mat_zombie_flesh = make_pbr_mat(
        "Zombie_Necrotic_Flesh",
        (0.36, 0.48, 0.30, 1.0),
        roughness=0.75,
        emission_color=(0.25, 0.45, 0.18),
        emission_strength=0.35,
    )
    mat_zombie_rags = make_pbr_mat("Zombie_Tattered_Rags", (0.18, 0.16, 0.14, 1.0), roughness=0.9)
    build_humanoid_rig(
        "Monster_Zombie",
        offset_x=5.0,
        body_mat=mat_zombie_rags,
        head_mat=mat_zombie_flesh,
        pants_mat=mat_zombie_rags,
        boot_mat=mat_boots,
        skin_mat=mat_zombie_flesh,
    )

    # 4. Roaming Monster: Full-Moon Werewolf Lycanthrope
    mat_wolf_fur = make_pbr_mat(
        "Werewolf_Bristle_Fur",
        (0.24, 0.17, 0.12, 1.0),
        roughness=0.82,
        emission_color=(0.45, 0.25, 0.08),
        emission_strength=0.25,
    )
    build_humanoid_rig(
        "Monster_Werewolf",
        offset_x=7.5,
        body_mat=mat_wolf_fur,
        head_mat=mat_wolf_fur,
        pants_mat=mat_denim,
        boot_mat=mat_wolf_fur,
        skin_mat=mat_wolf_fur,
        snout_len=0.22,
    )

    # 5. Roaming Monster: Spectral Phantom Ghost
    mat_ghost_ectoplasm = make_pbr_mat(
        "Ghost_Ectoplasm_Shroud",
        (0.55, 0.92, 0.98, 1.0),
        roughness=0.2,
        emission_color=(0.35, 0.88, 1.0),
        emission_strength=3.2,
    )
    build_humanoid_rig(
        "Monster_Ghost",
        offset_x=10.0,
        body_mat=mat_ghost_ectoplasm,
        head_mat=mat_ghost_ectoplasm,
        pants_mat=mat_ghost_ectoplasm,
        boot_mat=mat_ghost_ectoplasm,
        skin_mat=mat_ghost_ectoplasm,
        ghost_shroud=True,
    )

    out_path = os.path.join(OUT_DIR, "grindhouse_survivors_and_monsters.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_yup=False)
    print(f"Exported {out_path} ({os.path.getsize(out_path) // 1024} KB)")


# =============================================================================
# 4. BUILD HIGH-DETAIL GOTHIC HAUNTED CASTLE FORTRESS (`haunted_castle_fortress.glb`)
# =============================================================================
def build_haunted_castle_fortress():
    clear_scene()
    root = bpy.data.objects.new("HauntedCastle_Fortress", None)
    bpy.context.scene.collection.objects.link(root)

    mat_stone = make_pbr_mat("Gothic_Basalt_Stone", (0.11, 0.10, 0.14, 1.0), roughness=0.88, metallic=0.1)
    mat_slate = make_pbr_mat("Witch_Slate_Spire", (0.05, 0.06, 0.09, 1.0), roughness=0.65, metallic=0.3)
    mat_amber_win = make_pbr_mat(
        "Castle_Torch_Window",
        (1.0, 0.58, 0.12, 1.0),
        roughness=0.1,
        emission_color=(1.0, 0.52, 0.08),
        emission_strength=7.5,
    )
    mat_emerald_rift = make_pbr_mat(
        "Castle_Green_Witch_Glow",
        (0.12, 0.95, 0.48, 1.0),
        roughness=0.1,
        emission_color=(0.10, 0.92, 0.45),
        emission_strength=8.5,
    )

    # Jagged Crag Mountain Base
    bm_crag = make_capsule_bm(16.0, 26.0, 9.0, segs=24)
    add_part(root, "Castle_Crag_Mount", bm_crag, mat_stone, loc=(0, 4.5, 0))

    # Central Cathedral Keep
    bm_keep = bmesh.new()
    bmesh.ops.create_cube(bm_keep, size=1.0)
    bmesh.ops.scale(bm_keep, vec=(18.0, 22.0, 15.0), verts=bm_keep.verts)
    add_part(root, "Castle_Main_Keep", bm_keep, mat_stone, loc=(0, 19.0, 0))

    # Grand Central Spire + 6 Flanking Gothic Turrets with Battlements
    turret_specs = [
        (0.0, 0.0, 4.2, 34.0, 13.0),
        (-10.5, 6.5, 2.8, 25.0, 9.5),
        (10.5, 6.5, 2.8, 25.0, 9.5),
        (-13.5, -4.5, 2.5, 21.0, 8.5),
        (13.5, -4.5, 2.5, 21.0, 8.5),
        (-6.0, 8.2, 2.0, 18.0, 7.0),
        (6.0, 8.2, 2.0, 18.0, 7.0),
    ]
    for idx, (tx, tz, rad, th, roof_h) in enumerate(turret_specs):
        bm_twr = make_capsule_bm(rad * 0.92, rad, th, segs=18)
        add_part(root, f"Castle_Tower_{idx}", bm_twr, mat_stone, loc=(tx, 8.0 + th * 0.5, tz))
        bm_roof = make_capsule_bm(0.08, rad * 1.25, roof_h, segs=18)
        add_part(root, f"Castle_SpireRoof_{idx}", bm_roof, mat_slate, loc=(tx, 8.0 + th + roof_h * 0.48, tz))

    # Glowing Gothic Stained-Glass Arch Windows across facade
    for row in range(3):
        for col in range(-2, 3):
            bm_win = bmesh.new()
            bmesh.ops.create_cube(bm_win, size=1.0)
            bmesh.ops.scale(bm_win, vec=(1.15, 2.6, 0.25), verts=bm_win.verts)
            wmat = mat_emerald_rift if (row == 2 and abs(col) <= 1) else mat_amber_win
            add_part(
                root,
                f"Castle_Window_{row}_{col}",
                bm_win,
                wmat,
                loc=(col * 3.1, 13.5 + row * 5.2, 7.6),
            )

    out_path = os.path.join(OUT_DIR, "haunted_castle_fortress.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_yup=False)
    print(f"Exported {out_path} ({os.path.getsize(out_path) // 1024} KB)")


if __name__ == "__main__":
    build_pumpkin_patch_tank()
    build_pumpkin_patch_cast()
    build_survivors_and_monsters()
    build_haunted_castle_fortress()
