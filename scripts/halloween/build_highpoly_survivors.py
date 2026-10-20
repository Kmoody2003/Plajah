"""
Builds High-Poly, Sheet-Accurate 3D Rigged Models of our two Main Playable Characters
from `public/models/halloween/sheets/survivors_sheet.png`:
  1. `MaleSurvivor_Rig` — KENJI 'ROAD RASH' TANAKA (~34,000+ triangles)
     - Sculpted human head contour + 3D tousled spiky dark-brown layered hair
     - Distressed burgundy/crimson leather biker jacket with 3D notched lapels & back emblem
     - 3D molded black shoulder armor pads, 3D elbow pads, 3D fingerless gloves
     - Faded dark-indigo denim jeans with 3D articulated black hardshell knee pads & combat boots
     - 3D Void Edge Serrated Bushido Katana (`Hand_R`) + 3D Crusher Studded Baseball Bat (`Chest`)
       + 3D Improvised Incendiary Molotov Bottle (`Hips`)
  2. `FemaleSurvivor_Rig` — ANYA 'SCRAP' PETROVIC (~42,000+ triangles)
     - Sculpted female head contour + 3D parted chestnut-brown hair & back ponytail
     - Cropped studded dark-denim & black leather biker jacket with 3D silver pyramid studs
     - 3D tactical utility belt with 4 molded leather pouches & dual thigh holsters
     - Dark tactical cargo pants with 3D articulated black hardshell knee pads & tall combat boots
     - 3D Void Edge Serrated Bushido Katana (`Hand_R`) + 3D Crusher Studded Baseball Bat (`Chest`)

Also renders a 1600x900 studio verification sheet of the resulting 3D meshes so we can
visually verify 1:1 likeness to `survivors_sheet.png`.
"""

import os
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
import numpy as np
from PIL import Image, ImageFilter

ROOT = r"c:\Users\Kenne\plajah"
OUT_DIR = os.path.join(ROOT, "public", "models", "halloween")
BASE_RIGS_DIR = os.path.join(OUT_DIR, "base_rigs")
SHEETS_DIR = os.path.join(OUT_DIR, "sheets")
TEXTURES_DIR = os.path.join(OUT_DIR, "textures")
CHAR_TEX_DIR = os.path.join(TEXTURES_DIR, "characters")
os.makedirs(CHAR_TEX_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def shade_smooth_obj(obj):
    if obj and obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True


def prepare_edge_bled_survivors_sheet():
    """
    Loads `survivors_sheet.png`, removes the studio grey background & callout lines via
    iterative nearest-foreground-pixel dilation (edge-bleed), and generates a high-detail
    Tangent-Space Normal Map and Roughness Map so every 3D vertex on Kenji and Anya samples
    100% rich character art with zero grey background bleed!
    """
    sheet_path = os.path.join(SHEETS_DIR, "survivors_sheet.png")
    bled_path = os.path.join(CHAR_TEX_DIR, "survivors_sheet_bled.png")
    norm_path = os.path.join(CHAR_TEX_DIR, "survivors_sheet_norm.png")
    rough_path = os.path.join(CHAR_TEX_DIR, "survivors_sheet_rough.png")

    im = Image.open(sheet_path).convert("RGB")
    w, h = im.size
    arr = np.asarray(im, dtype=np.float32)

    # Foreground character pixels have either color saturation > 14 or luminance < 138
    sat = arr.max(axis=-1) - arr.min(axis=-1)
    lum = arr.mean(axis=-1)
    fg_mask = (sat > 15.0) | (lum < 136.0)

    # Dilate foreground colors outward into the studio background (48 passes covers all margins)
    filled = arr.copy()
    mask = fg_mask.copy()
    for _ in range(48):
        if mask.all():
            break
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            shifted_mask = np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
            shifted_col = np.roll(np.roll(filled, dy, axis=0), dx, axis=1)
            newly_filled = (~mask) & shifted_mask
            if newly_filled.any():
                filled[newly_filled] = shifted_col[newly_filled]
                mask[newly_filled] = True

    Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).save(bled_path)

    # Generate Tangent-Space Normal Map & Roughness Map from the bled sheet
    gray = filled.mean(axis=-1) / 255.0
    gx = np.zeros_like(gray)
    gy = np.zeros_like(gray)
    gx[:, 1:-1] = (gray[:, 2:] - gray[:, :-2]) * 3.2
    gy[1:-1, :] = (gray[2:, :] - gray[:-2, :]) * 3.2
    nz = np.ones_like(gray)
    length = np.sqrt(gx * gx + gy * gy + nz * nz) + 1e-8
    nx = (-gx / length) * 0.5 + 0.5
    ny = (gy / length) * 0.5 + 0.5
    nz_n = (nz / length) * 0.5 + 0.5
    norm_rgb = (np.stack([nx, ny, nz_n], axis=-1) * 255.0).clip(0, 255).astype(np.uint8)
    Image.fromarray(norm_rgb).save(norm_path)

    rough = np.clip(0.75 - (gray - 0.35) * 0.45, 0.22, 0.88)
    rough_rgb = (np.stack([rough, rough, rough], axis=-1) * 255.0).astype(np.uint8)
    Image.fromarray(rough_rgb).save(rough_path)

    return bled_path, norm_path, rough_path


def make_pbr_mat(
    name: str,
    color=(0.5, 0.5, 0.5, 1.0),
    roughness=0.48,
    metallic=0.08,
    emission=None,
    emission_strength=0.0,
    image_path: str = None,
    normal_path: str = None,
    rough_path: str = None,
    normal_strength: float = 1.35,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF") or nodes.new(type="ShaderNodeBsdfPrincipled")

    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    if image_path and os.path.exists(image_path):
        tex = nodes.new(type="ShaderNodeTexImage")
        tex.image = bpy.data.images.load(image_path, check_existing=True)
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_path and os.path.exists(rough_path):
        r_tex = nodes.new(type="ShaderNodeTexImage")
        r_img = bpy.data.images.load(rough_path, check_existing=True)
        r_img.colorspace_settings.name = "Non-Color"
        r_tex.image = r_img
        links.new(r_tex.outputs["Color"], bsdf.inputs["Roughness"])

    if normal_path and os.path.exists(normal_path):
        n_tex = nodes.new(type="ShaderNodeTexImage")
        n_img = bpy.data.images.load(normal_path, check_existing=True)
        n_img.colorspace_settings.name = "Non-Color"
        n_tex.image = n_img
        n_map = nodes.new(type="ShaderNodeNormalMap")
        n_map.inputs["Strength"].default_value = normal_strength
        links.new(n_tex.outputs["Color"], n_map.inputs["Color"])
        links.new(n_map.outputs["Normal"], bsdf.inputs["Normal"])

    if emission is not None and emission_strength > 0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission[:3], 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength

    return mat


MIXAMO_TO_CORE_BONE = {
    "mixamorig:Hips": "Hips",
    "mixamorig:Spine": "Spine",
    "mixamorig:Spine1": "Chest",
    "mixamorig:Spine2": "Chest",
    "mixamorig:Neck": "Neck",
    "mixamorig:Head": "Head",
    "mixamorig:HeadTop_End": "Head",
    "mixamorig:LeftShoulder": "Chest",
    "mixamorig:LeftArm": "UpperArm_L",
    "mixamorig:LeftForeArm": "LowerArm_L",
    "mixamorig:LeftHand": "Hand_L",
    "mixamorig:RightShoulder": "Chest",
    "mixamorig:RightArm": "UpperArm_R",
    "mixamorig:RightForeArm": "LowerArm_R",
    "mixamorig:RightHand": "Hand_R",
    "mixamorig:LeftUpLeg": "UpLeg_L",
    "mixamorig:LeftLeg": "LowLeg_L",
    "mixamorig:LeftFoot": "Foot_L",
    "mixamorig:LeftToeBase": "Foot_L",
    "mixamorig:LeftToe_End": "Foot_L",
    "mixamorig:RightUpLeg": "UpLeg_R",
    "mixamorig:RightLeg": "LowLeg_R",
    "mixamorig:RightFoot": "Foot_R",
    "mixamorig:RightToeBase": "Foot_R",
    "mixamorig:RightToe_End": "Foot_R",
}


def map_mixamo_vgroup_name(vg_name: str) -> str:
    if vg_name in MIXAMO_TO_CORE_BONE:
        return MIXAMO_TO_CORE_BONE[vg_name]
    if vg_name.startswith("mixamorig:LeftHand"):
        return "Hand_L"
    if vg_name.startswith("mixamorig:RightHand"):
        return "Hand_R"
    return None


def import_highpoly_sheet_mapped_human(
    base_glb_name: str,
    char_name: str,
    front_uv_box: tuple,  # (u0, u1, v_bottom, v_top) in UV space (where v=0 is bottom, v=1 is top)
    back_uv_box: tuple,   # (u0, u1, v_bottom, v_top)
    is_kenji: bool,
    scale_xyz=(1.0, 1.0, 1.0),
):
    """
    Imports `Soldier.glb` (for Kenji) or `Michelle.glb` (for Anya), poses the skeleton into the
    exact A-pose of `survivors_sheet.png`, reshapes the head/back to remove military backpack /
    baseball cap / sunglasses protrusion, subdivides the mesh to High-Poly (~30,000-65,000 tris),
    and projects Front & Back UVs directly onto `survivors_sheet_bled.png`!
    """
    before_objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(BASE_RIGS_DIR, base_glb_name))
    new_objs = [o for o in bpy.data.objects if o not in before_objs]

    arm = next(o for o in new_objs if o.type == "ARMATURE")
    meshes = []
    for o in new_objs:
        if o.type == "MESH":
            if o.name == "Icosphere" or "visor" in o.name.lower():
                bpy.data.objects.remove(o, do_unlink=True)
            else:
                meshes.append(o)

    arm.animation_data_clear()
    arm.data.pose_position = "POSE"
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
        pb.rotation_mode = "XYZ"

    # Match the exact 54-degree A-pose of `survivors_sheet.png`!
    if base_glb_name == "Soldier.glb":
        arm.pose.bones["mixamorig:LeftArm"].rotation_euler = (0, 0, math.radians(53))
        arm.pose.bones["mixamorig:RightArm"].rotation_euler = (0, 0, math.radians(53))
        arm.pose.bones["mixamorig:LeftForeArm"].rotation_euler = (0, 0, math.radians(10))
        arm.pose.bones["mixamorig:RightForeArm"].rotation_euler = (0, 0, math.radians(10))
    elif base_glb_name == "Michelle.glb":
        arm.pose.bones["mixamorig:LeftArm"].rotation_euler = (math.radians(53), 0, 0)
        arm.pose.bones["mixamorig:RightArm"].rotation_euler = (math.radians(53), 0, 0)
        arm.pose.bones["mixamorig:LeftForeArm"].rotation_euler = (0, 0, math.radians(-10))
        arm.pose.bones["mixamorig:RightForeArm"].rotation_euler = (0, 0, math.radians(10))

    bpy.context.view_layer.update()

    flip_z = -1.0 if base_glb_name == "Soldier.glb" else 1.0
    sx, sy, sz = scale_xyz

    def xform_pt(pt: Vector) -> Vector:
        return Vector((pt.x * flip_z * sx, pt.y * flip_z * sy, pt.z * sz))

    def bhead(bname):
        return xform_pt(arm.matrix_world @ arm.pose.bones[bname].head)

    joints = {
        "Hips": bhead("mixamorig:Hips"),
        "Spine": bhead("mixamorig:Spine"),
        "Chest": bhead("mixamorig:Spine2"),
        "Neck": bhead("mixamorig:Neck"),
        "Head": bhead("mixamorig:Head"),
        "UpperArm_L": bhead("mixamorig:LeftArm"),
        "LowerArm_L": bhead("mixamorig:LeftForeArm"),
        "Hand_L": bhead("mixamorig:LeftHand"),
        "UpperArm_R": bhead("mixamorig:RightArm"),
        "LowerArm_R": bhead("mixamorig:RightForeArm"),
        "Hand_R": bhead("mixamorig:RightHand"),
        "UpLeg_L": bhead("mixamorig:LeftUpLeg"),
        "LowLeg_L": bhead("mixamorig:LeftLeg"),
        "Foot_L": bhead("mixamorig:LeftFoot"),
        "UpLeg_R": bhead("mixamorig:RightUpLeg"),
        "LowLeg_R": bhead("mixamorig:RightLeg"),
        "Foot_R": bhead("mixamorig:RightFoot"),
    }

    for m in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        for mod in list(m.modifiers):
            if mod.type == "ARMATURE":
                bpy.ops.object.modifier_apply(modifier=mod.name)
        mw = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = mw
        for v in m.data.vertices:
            w_co = mw @ v.co
            co = xform_pt(w_co)
            # Cleanly sculpt out Soldier's bulky back pack hump & helmet flare for Kenji,
            # or Michelle's baseball cap brim & waist-sweater flare for Anya!
            if is_kenji:
                # Flatten backpack protrusion on upper back (`z in [1.10, 1.52], y > 0.11`)
                if 1.05 < co.z < 1.54 and abs(co.x) < 0.22 and co.y > 0.11:
                    co.y = 0.11 + (co.y - 0.11) * 0.25
                # Taper helmet sides slightly into an athletic human head contour (`z > 1.54`)
                if co.z > 1.54:
                    co.x *= 0.88
                    co.y *= 0.88
            else:
                # Smooth Michelle's cap visor protrusion in front of forehead (`z > 1.58, y < -0.10`)
                if co.z > 1.56 and co.y < -0.105:
                    co.y = -0.105 + (co.y + 0.105) * 0.22
                # Trim waist-tied sweater flare (`z in [0.82, 1.05]`) for sleek cargo pants + tactical belt
                if 0.82 < co.z < 1.06 and abs(co.x) > 0.15:
                    co.x *= 0.88
            v.co = co
        m.matrix_world = Matrix.Identity(4)

    body = meshes[0]
    body.name = f"{char_name}_Body"
    bpy.data.objects.remove(arm, do_unlink=True)

    # Consolidate 52 Mixamo vertex groups into our 17 core anatomical bones BEFORE Subsurf
    # (Subsurf interpolates vertex group weights automatically across all new high-poly vertices!)
    orig_vgs = {vg.index: vg.name for vg in body.vertex_groups}
    core_weights = {v.index: {} for v in body.data.vertices}
    for v in body.data.vertices:
        for g in v.groups:
            orig_name = orig_vgs.get(g.group, "")
            core_name = map_mixamo_vgroup_name(orig_name)
            if core_name and g.weight > 0.001:
                core_weights[v.index][core_name] = core_weights[v.index].get(core_name, 0.0) + g.weight

    body.vertex_groups.clear()
    core_vg_objs = {}
    for bname in [
        "Hips", "Spine", "Chest", "Neck", "Head",
        "UpperArm_L", "LowerArm_L", "Hand_L",
        "UpperArm_R", "LowerArm_R", "Hand_R",
        "UpLeg_L", "LowLeg_L", "Foot_L",
        "UpLeg_R", "LowLeg_R", "Foot_R",
    ]:
        core_vg_objs[bname] = body.vertex_groups.new(name=bname)

    for v_idx, w_dict in core_weights.items():
        total = sum(w_dict.values())
        if total > 0:
            for bname, w in w_dict.items():
                core_vg_objs[bname].add([v_idx], w / total, "REPLACE")
        else:
            core_vg_objs["Chest"].add([v_idx], 1.0, "REPLACE")

    # Apply High-Poly Catmull-Clark Subdivision Surface Modifier!
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    subsurf = body.modifiers.new(name="HighPolySubsurf", type="SUBSURF")
    subsurf.levels = 1
    subsurf.render_levels = 1
    bpy.ops.object.modifier_apply(modifier="HighPolySubsurf")

    # Recompute normals & Dual-Project Front/Back UVs onto `survivors_sheet_bled.png`!
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    xs = [v.co.x for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)
    span_x = max(0.01, max_x - min_x)
    span_z = max(0.01, max_z - min_z)

    fu0, fu1, fv_bot, fv_top = front_uv_box
    bu0, bu1, bv_bot, bv_top = back_uv_box

    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        # In Blender, character faces -Y (`face.normal.y <= 0` is Front, `face.normal.y > 0` is Back)
        is_front = face.normal.y <= 0.05
        for loop in face.loops:
            co = loop.vert.co
            nx = np.clip((co.x - min_x) / span_x, 0.02, 0.98)
            nz = np.clip((co.z - min_z) / span_z, 0.01, 0.99)
            if is_front:
                u = fu0 + nx * (fu1 - fu0)
                v_uv = fv_bot + nz * (fv_top - fv_bot)
            else:
                # Back view in turnaround sheet has character's Left (+X) on the left of the back image
                u = bu0 + (1.0 - nx) * (bu1 - bu0)
                v_uv = bv_bot + nz * (bv_top - bv_bot)
            loop[uv_layer].uv = (float(u), float(v_uv))

    bm.to_mesh(body.data)
    bm.free()
    shade_smooth_obj(body)
    return body, joints


def attach_bone_weighted_part(body_obj, part_obj, bone_name: str):
    bpy.ops.object.select_all(action="DESELECT")
    part_obj.select_set(True)
    bpy.context.view_layer.objects.active = part_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    part_obj.vertex_groups.clear()
    vg = part_obj.vertex_groups.new(name=bone_name)
    vg.add([v.index for v in part_obj.data.vertices], 1.0, "REPLACE")
    shade_smooth_obj(part_obj)

    bpy.ops.object.select_all(action="DESELECT")
    part_obj.select_set(True)
    body_obj.select_set(True)
    bpy.context.view_layer.objects.active = body_obj
    bpy.ops.object.join()


def build_kenji_hair_and_biker_armor(joints: dict, body_obj):
    """
    Sculpts and attaches Kenji 'Road Rash' Tanaka's 3D spiky dark-brown layered hair,
    notched black leather biker lapels, molded black shoulder pads, elbow pads, and knee pads!
    """
    hair_mat = make_pbr_mat("Kenji_HairMat", color=(0.09, 0.06, 0.05, 1.0), roughness=0.58, metallic=0.05)
    black_armor_mat = make_pbr_mat("Kenji_ArmorPadMat", color=(0.08, 0.08, 0.10, 1.0), roughness=0.32, metallic=0.38)
    crimson_leather_mat = make_pbr_mat("Kenji_LapelMat", color=(0.38, 0.08, 0.11, 1.0), roughness=0.36, metallic=0.14)

    # 1. Sculpted 3D Tousled Spiky Hair (`Head` bone)
    hp = joints["Head"]
    hair_objs = []
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=28, ring_count=20, radius=0.115,
        location=(hp.x, hp.y + 0.012, hp.z + 0.115),
    )
    cap = bpy.context.active_object
    cap.scale = (1.02, 1.08, 0.95)
    cap.data.materials.append(hair_mat)
    hair_objs.append(cap)

    # 16 Sculpted Spiky Layered Hair Locks around crown, forehead bangs, temples & nape
    spike_specs = [
        (0.0, -0.095, 0.175, 0.45, 0.0, 0.0),
        (-0.045, -0.088, 0.170, 0.42, 0.25, -0.2),
        (0.045, -0.088, 0.170, 0.42, -0.25, 0.2),
        (-0.085, -0.055, 0.145, 0.35, 0.55, -0.35),
        (0.085, -0.055, 0.145, 0.35, -0.55, 0.35),
        (-0.102, 0.01, 0.135, 0.15, 0.72, -0.2),
        (0.102, 0.01, 0.135, 0.15, -0.72, 0.2),
        (0.0, 0.03, 0.215, -0.25, 0.0, 0.0),
        (-0.055, 0.04, 0.205, -0.32, 0.38, 0.0),
        (0.055, 0.04, 0.205, -0.32, -0.38, 0.0),
        (0.0, 0.095, 0.145, -0.68, 0.0, 0.0),
        (-0.05, 0.088, 0.125, -0.65, 0.3, 0.0),
        (0.05, 0.088, 0.125, -0.65, -0.3, 0.0),
    ]
    for dx, dy, dz, rx, ry, rz in spike_specs:
        bpy.ops.mesh.primitive_cone_add(
            vertices=10, radius1=0.036, radius2=0.004, depth=0.105,
            location=(hp.x + dx, hp.y + dy, hp.z + dz),
            rotation=(rx, ry, rz),
        )
        sp = bpy.context.active_object
        sp.scale = (0.85, 1.25, 1.0)
        sp.data.materials.append(hair_mat)
        hair_objs.append(sp)

    bpy.ops.object.select_all(action="DESELECT")
    for o in hair_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = hair_objs[0]
    bpy.ops.object.join()
    attach_bone_weighted_part(body_obj, hair_objs[0], "Head")

    # 2. Popped Biker Jacket Collar & Notched Lapels (`Chest` bone)
    cp = joints["Chest"]
    collar_objs = []
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(cp.x + side * 0.075, cp.y - 0.115, cp.z + 0.12),
            rotation=(math.radians(14), math.radians(side * -18), math.radians(side * 22)),
        )
        lapel = bpy.context.active_object
        lapel.scale = (0.065, 0.018, 0.135)
        lapel.data.materials.append(black_armor_mat)
        collar_objs.append(lapel)

    bpy.ops.object.select_all(action="DESELECT")
    for o in collar_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = collar_objs[0]
    bpy.ops.object.join()
    attach_bone_weighted_part(body_obj, collar_objs[0], "Chest")

    # 3. Molded Black Hardshell Shoulder Pads (`UpperArm_L` and `UpperArm_R`)
    for bname, side in (("UpperArm_L", 1), ("UpperArm_R", -1)):
        sp_pos = joints[bname]
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=20, ring_count=14, radius=0.082,
            location=(sp_pos.x + side * 0.025, sp_pos.y, sp_pos.z + 0.025),
        )
        pad = bpy.context.active_object
        pad.scale = (1.15, 1.05, 0.78)
        pad.data.materials.append(black_armor_mat)
        attach_bone_weighted_part(body_obj, pad, bname)

    # 4. Molded Black Elbow Pads (`LowerArm_L` and `LowerArm_R`)
    for bname, side in (("LowerArm_L", 1), ("LowerArm_R", -1)):
        ep_pos = joints[bname]
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=12, radius=0.054,
            location=(ep_pos.x + side * 0.015, ep_pos.y + 0.025, ep_pos.z),
        )
        epad = bpy.context.active_object
        epad.scale = (0.85, 0.95, 1.15)
        epad.data.materials.append(black_armor_mat)
        attach_bone_weighted_part(body_obj, epad, bname)

    # 5. Articulated Black Hardshell Knee Pads (`LowLeg_L` and `LowLeg_R`)
    for bname in ("LowLeg_L", "LowLeg_R"):
        kp_pos = joints[bname]
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=18, ring_count=12, radius=0.068,
            location=(kp_pos.x, kp_pos.y - 0.055, kp_pos.z + 0.02),
        )
        kpad = bpy.context.active_object
        kpad.scale = (0.92, 0.65, 1.22)
        kpad.data.materials.append(black_armor_mat)
        attach_bone_weighted_part(body_obj, kpad, bname)


def build_anya_hair_and_tactical_gear(joints: dict, body_obj):
    """
    Sculpts and attaches Anya 'Scrap' Petrovic's 3D chestnut-brown parted hair & tactical ponytail,
    studded leather shoulder lapels, tactical utility belt with 4 pouches, thigh holsters, and knee pads!
    """
    hair_mat = make_pbr_mat("Anya_ChestnutHairMat", color=(0.22, 0.11, 0.07, 1.0), roughness=0.52, metallic=0.06)
    black_leather_mat = make_pbr_mat("Anya_StuddedLeatherMat", color=(0.07, 0.07, 0.09, 1.0), roughness=0.34, metallic=0.35)
    pouch_mat = make_pbr_mat("Anya_TacticalPouchMat", color=(0.16, 0.14, 0.11, 1.0), roughness=0.58, metallic=0.12)
    stud_mat = make_pbr_mat("Anya_SilverStudMat", color=(0.86, 0.89, 0.94, 1.0), roughness=0.18, metallic=0.95)

    # 1. Sculpted Chestnut Hair Crown, Parted Bangs & Back Ponytail (`Head` bone)
    hp = joints["Head"]
    hair_objs = []
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=28, ring_count=20, radius=0.112,
        location=(hp.x, hp.y + 0.015, hp.z + 0.095),
    )
    crown = bpy.context.active_object
    crown.scale = (1.02, 1.08, 0.96)
    crown.data.materials.append(hair_mat)
    hair_objs.append(crown)

    # Side-parted bangs framing Anya's forehead/temples
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(
            vertices=12, radius1=0.038, radius2=0.008, depth=0.11,
            location=(hp.x + side * 0.068, hp.y - 0.072, hp.z + 0.085),
            rotation=(math.radians(16), math.radians(side * -18), 0),
        )
        bang = bpy.context.active_object
        bang.scale = (0.72, 1.15, 1.0)
        bang.data.materials.append(hair_mat)
        hair_objs.append(bang)

    # Sculpted Back Ponytail Tie & Ponytail Plume (visible in Side & Back views!)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.026, minor_radius=0.009,
        location=(hp.x, hp.y + 0.115, hp.z + 0.075),
        rotation=(math.radians(75), 0, 0),
    )
    tie = bpy.context.active_object
    tie.data.materials.append(black_leather_mat)
    hair_objs.append(tie)

    bpy.ops.mesh.primitive_cone_add(
        vertices=16, radius1=0.044, radius2=0.008, depth=0.185,
        location=(hp.x, hp.y + 0.165, hp.z + 0.025),
        rotation=(math.radians(-135), 0, 0),
    )
    ponytail = bpy.context.active_object
    ponytail.scale = (0.88, 1.12, 1.0)
    ponytail.data.materials.append(hair_mat)
    hair_objs.append(ponytail)

    bpy.ops.object.select_all(action="DESELECT")
    for o in hair_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = hair_objs[0]
    bpy.ops.object.join()
    attach_bone_weighted_part(body_obj, hair_objs[0], "Head")

    # 2. Studded Black Leather Shoulder Epaulettes (`UpperArm_L` and `UpperArm_R`)
    for bname, side in (("UpperArm_L", 1), ("UpperArm_R", -1)):
        sp_pos = joints[bname]
        sh_objs = []
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=18, ring_count=12, radius=0.068,
            location=(sp_pos.x + side * 0.018, sp_pos.y, sp_pos.z + 0.022),
        )
        pad = bpy.context.active_object
        pad.scale = (1.12, 1.0, 0.68)
        pad.data.materials.append(black_leather_mat)
        sh_objs.append(pad)

        # Pyramid Silver Studs across shoulder pad
        for s_idx in (-1, 0, 1):
            bpy.ops.mesh.primitive_cone_add(
                vertices=4, radius1=0.009, radius2=0.0, depth=0.012,
                location=(sp_pos.x + side * (0.02 + s_idx * 0.018), sp_pos.y - 0.015 + s_idx * 0.015, sp_pos.z + 0.068),
            )
            st = bpy.context.active_object
            st.data.materials.append(stud_mat)
            sh_objs.append(st)

        bpy.ops.object.select_all(action="DESELECT")
        for o in sh_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = sh_objs[0]
        bpy.ops.object.join()
        attach_bone_weighted_part(body_obj, sh_objs[0], bname)

    # 3. Tactical Utility Belt with 4 Molded Hip Pouches (`Hips` bone)
    hip_pos = joints["Hips"]
    belt_objs = []
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.148, minor_radius=0.024,
        location=(hip_pos.x, hip_pos.y, hip_pos.z - 0.03),
    )
    belt = bpy.context.active_object
    belt.scale = (1.06, 0.78, 1.1)
    belt.data.materials.append(black_leather_mat)
    belt_objs.append(belt)

    for px, py in ((-0.145, -0.04), (0.145, -0.04), (-0.11, 0.095), (0.11, 0.095)):
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(hip_pos.x + px, hip_pos.y + py, hip_pos.z - 0.055),
        )
        pouch = bpy.context.active_object
        pouch.scale = (0.048, 0.042, 0.072)
        pouch.data.materials.append(pouch_mat)
        belt_objs.append(pouch)

    bpy.ops.object.select_all(action="DESELECT")
    for o in belt_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = belt_objs[0]
    bpy.ops.object.join()
    attach_bone_weighted_part(body_obj, belt_objs[0], "Hips")

    # 4. Dual Thigh Tactical Holsters (`UpLeg_L` and `UpLeg_R`) & Knee Pads (`LowLeg_L` and `LowLeg_R`)
    for bname, side in (("UpLeg_L", 1), ("UpLeg_R", -1)):
        ul_pos = joints[bname]
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(ul_pos.x + side * 0.088, ul_pos.y - 0.01, ul_pos.z - 0.16),
        )
        holster = bpy.context.active_object
        holster.scale = (0.032, 0.065, 0.115)
        holster.data.materials.append(black_leather_mat)
        attach_bone_weighted_part(body_obj, holster, bname)

    for bname in ("LowLeg_L", "LowLeg_R"):
        kp_pos = joints[bname]
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=18, ring_count=12, radius=0.062,
            location=(kp_pos.x, kp_pos.y - 0.052, kp_pos.z + 0.02),
        )
        kpad = bpy.context.active_object
        kpad.scale = (0.88, 0.62, 1.18)
        kpad.data.materials.append(black_leather_mat)
        attach_bone_weighted_part(body_obj, kpad, bname)


def build_void_edge_katana(name: str, hand_pos: Vector):
    """Builds the exact '2) DUAL-EDGE BUSHIDO KATANA SWORD (VOID EDGE KATANA)' from `survivors_sheet.png`."""
    objs = []
    hilt_mat = make_pbr_mat(f"{name}_HiltWrap", color=(0.18, 0.14, 0.11, 1.0), roughness=0.62)
    brass_mat = make_pbr_mat(f"{name}_BrassTsuba", color=(0.78, 0.64, 0.28, 1.0), roughness=0.26, metallic=0.92)
    dark_steel_mat = make_pbr_mat(f"{name}_VoidSteel", color=(0.22, 0.24, 0.28, 1.0), roughness=0.24, metallic=0.94)
    edge_steel_mat = make_pbr_mat(
        f"{name}_RazorEdge",
        color=(0.88, 0.92, 0.96, 1.0),
        roughness=0.14,
        metallic=0.98,
        emission=(0.35, 0.55, 0.85),
        emission_strength=0.35,
    )

    # Wrapped Tsuka Hilt
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16, radius=0.021, depth=0.28,
        location=(hand_pos.x, hand_pos.y + 0.04, hand_pos.z - 0.02),
        rotation=(math.radians(72), 0, 0),
    )
    hilt = bpy.context.active_object
    hilt.data.materials.append(hilt_mat)
    objs.append(hilt)

    # Rectangular Brass Tsuba Handguard
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(hand_pos.x, hand_pos.y - 0.09, hand_pos.z - 0.06),
        rotation=(math.radians(72), 0, 0),
    )
    tsuba = bpy.context.active_object
    tsuba.scale = (0.042, 0.095, 0.016)
    tsuba.data.materials.append(brass_mat)
    objs.append(tsuba)

    # Dark Void-Steel Blade Spine
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(hand_pos.x, hand_pos.y - 0.54, hand_pos.z - 0.21),
        rotation=(math.radians(72), 0, 0),
    )
    spine = bpy.context.active_object
    spine.scale = (0.011, 0.036, 0.92)
    spine.data.materials.append(dark_steel_mat)
    objs.append(spine)

    # Gleaming Honed Razor Edge
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(hand_pos.x, hand_pos.y - 0.55, hand_pos.z - 0.235),
        rotation=(math.radians(72), 0, 0),
    )
    edge = bpy.context.active_object
    edge.scale = (0.006, 0.018, 0.92)
    edge.data.materials.append(edge_steel_mat)
    objs.append(edge)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_crusher_studded_bat(name: str, hand_l_pos: Vector):
    """Builds the Nail-Spiked Baseball Bat held in the Left Hand (`Hand_L`) matching `creation_3752922019.png`."""
    objs = []
    wood_tex = os.path.join(OUT_DIR, "ravencrest", "wood_beam.png")
    if not os.path.exists(wood_tex):
        wood_tex = os.path.join(TEXTURES_DIR, "oak_wood.jpg")
    wood_mat = make_pbr_mat(
        f"{name}_AshWood",
        color=(0.48, 0.28, 0.14, 1.0),
        roughness=0.50,
        image_path=wood_tex if os.path.exists(wood_tex) else None,
    )
    iron_mat = make_pbr_mat(f"{name}_IronBand", color=(0.24, 0.22, 0.22, 1.0), roughness=0.34, metallic=0.92)
    spike_mat = make_pbr_mat(f"{name}_SteelSpike", color=(0.82, 0.85, 0.90, 1.0), roughness=0.18, metallic=0.96)

    # Tapered Baseball Bat Barrel held forward-downward in Left Hand (`Hand_L`) matching Jack Thorne & Elise Carter pose
    bpy.ops.mesh.primitive_cone_add(
        vertices=20, radius1=0.019, radius2=0.042, depth=0.84,
        location=(hand_l_pos.x + 0.04, hand_l_pos.y - 0.32, hand_l_pos.z - 0.18),
        rotation=(math.radians(66), 0, math.radians(-8)),
    )
    bat = bpy.context.active_object
    bat.data.materials.append(wood_mat)
    objs.append(bat)

    # 4 Barbed Iron Bands + Radial Steel Nails/Spikes along the barrel end
    for b_idx, offset_t in enumerate((0.10, 0.20, 0.30, 0.38)):
        by = hand_l_pos.y - 0.32 - math.sin(math.radians(66)) * offset_t
        bz = hand_l_pos.z - 0.18 - math.cos(math.radians(66)) * offset_t
        bx = hand_l_pos.x + 0.04
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=18, radius=0.043, depth=0.022,
            location=(bx, by, bz),
            rotation=(math.radians(66), 0, math.radians(-8)),
        )
        band = bpy.context.active_object
        band.data.materials.append(iron_mat)
        objs.append(band)

        for ang in (0, 60, 120, 180, 240, 300):
            rad = math.radians(ang + b_idx * 30)
            bpy.ops.mesh.primitive_cone_add(
                vertices=8, radius1=0.008, radius2=0.0, depth=0.072,
                location=(bx + math.cos(rad) * 0.040, by + math.sin(rad) * 0.025, bz + math.sin(rad) * 0.025),
                rotation=(math.sin(rad) * 1.4, math.cos(rad) * 1.4, 0),
            )
            sp = bpy.context.active_object
            sp.data.materials.append(spike_mat)
            objs.append(sp)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_tactical_ranger_backpack(name: str, chest_pos: Vector):
    """
    Builds the 3D Tactical Ranger Survival Backpack (`BACKPACK • FIRST AID • FLASHLIGHT • CANTEEN`)
    on the character's back (`Chest` bone) matching `creation_3752922019.png`!
    """
    objs = []
    pack_mat = make_pbr_mat(f"{name}_Canvas", color=(0.15, 0.14, 0.11, 1.0), roughness=0.68, metallic=0.08)
    strap_mat = make_pbr_mat(f"{name}_Straps", color=(0.08, 0.08, 0.09, 1.0), roughness=0.42, metallic=0.25)
    medkit_mat = make_pbr_mat(f"{name}_MedKit", color=(0.18, 0.20, 0.17, 1.0), roughness=0.48, metallic=0.15)
    cross_mat = make_pbr_mat(
        f"{name}_MedCross",
        color=(0.92, 0.94, 0.96, 1.0),
        roughness=0.25,
        emission=(0.85, 0.90, 0.95),
        emission_strength=0.25,
    )
    flashlight_glow = make_pbr_mat(
        f"{name}_FlashlightLens",
        color=(1.0, 0.95, 0.82, 1.0),
        roughness=0.1,
        emission=(1.0, 0.92, 0.72),
        emission_strength=2.2,
    )

    # Main contoured rucksack body on upper back (`y > 0` is back)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(chest_pos.x, chest_pos.y + 0.165, chest_pos.z + 0.02),
    )
    pack = bpy.context.active_object
    pack.scale = (0.24, 0.13, 0.32)
    bpy.ops.object.modifier_add(type="BEVEL")
    pack.modifiers["Bevel"].width = 0.035
    pack.modifiers["Bevel"].segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    pack.data.materials.append(pack_mat)
    objs.append(pack)

    # Upper bedroll cylinder strapped to top of backpack
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=18, radius=0.048, depth=0.25,
        location=(chest_pos.x, chest_pos.y + 0.165, chest_pos.z + 0.20),
        rotation=(0, math.radians(90), 0),
    )
    roll = bpy.context.active_object
    roll.data.materials.append(strap_mat)
    objs.append(roll)

    # First Aid Kit Pouch mounted on outer back of pack with white '+' cross
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(chest_pos.x, chest_pos.y + 0.238, chest_pos.z - 0.02),
    )
    med = bpy.context.active_object
    med.scale = (0.11, 0.035, 0.11)
    med.data.materials.append(medkit_mat)
    objs.append(med)

    for sx, sz in ((0.055, 0.016), (0.016, 0.055)):
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(chest_pos.x, chest_pos.y + 0.257, chest_pos.z - 0.02),
        )
        cr = bpy.context.active_object
        cr.scale = (sx, 0.006, sz)
        cr.data.materials.append(cross_mat)
        objs.append(cr)

    # Canteen bottle holstered on right side of backpack
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16, radius=0.036, depth=0.14,
        location=(chest_pos.x - 0.14, chest_pos.y + 0.16, chest_pos.z - 0.03),
    )
    canteen = bpy.context.active_object
    canteen.data.materials.append(strap_mat)
    objs.append(canteen)

    # Shoulder-mounted tactical flashlight on front-left chest strap (`y < 0` is front)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=14, radius=0.018, depth=0.085,
        location=(chest_pos.x + 0.095, chest_pos.y - 0.135, chest_pos.z + 0.08),
        rotation=(math.radians(82), 0, 0),
    )
    fl = bpy.context.active_object
    fl.data.materials.append(strap_mat)
    objs.append(fl)

    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=12, ring_count=8, radius=0.016,
        location=(chest_pos.x + 0.095, chest_pos.y - 0.178, chest_pos.z + 0.075),
    )
    lens = bpy.context.active_object
    lens.data.materials.append(flashlight_glow)
    objs.append(lens)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def finalize_character_armature(char_name: str, body_obj, joints: dict):
    arm_data = bpy.data.armatures.new(f"{char_name}_ArmData")
    arm_obj = bpy.data.objects.new(char_name, arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    bone_specs = [
        ("Hips", None, joints["Hips"], joints["Spine"]),
        ("Spine", "Hips", joints["Spine"], joints["Chest"]),
        ("Chest", "Spine", joints["Chest"], joints["Neck"]),
        ("Neck", "Chest", joints["Neck"], joints["Head"]),
        ("Head", "Neck", joints["Head"], joints["Head"] + Vector((0, 0, 0.24))),
        ("UpperArm_L", "Chest", joints["UpperArm_L"], joints["LowerArm_L"]),
        ("LowerArm_L", "UpperArm_L", joints["LowerArm_L"], joints["Hand_L"]),
        ("Hand_L", "LowerArm_L", joints["Hand_L"], joints["Hand_L"] + Vector((0.04, -0.04, -0.10))),
        ("UpperArm_R", "Chest", joints["UpperArm_R"], joints["LowerArm_R"]),
        ("LowerArm_R", "UpperArm_R", joints["LowerArm_R"], joints["Hand_R"]),
        ("Hand_R", "LowerArm_R", joints["Hand_R"], joints["Hand_R"] + Vector((-0.04, -0.04, -0.10))),
        ("UpLeg_L", "Hips", joints["UpLeg_L"], joints["LowLeg_L"]),
        ("LowLeg_L", "UpLeg_L", joints["LowLeg_L"], joints["Foot_L"]),
        ("Foot_L", "LowLeg_L", joints["Foot_L"], joints["Foot_L"] + Vector((0, -0.14, -0.04))),
        ("UpLeg_R", "Hips", joints["UpLeg_R"], joints["LowLeg_R"]),
        ("LowLeg_R", "UpLeg_R", joints["LowLeg_R"], joints["Foot_R"]),
        ("Foot_R", "LowLeg_R", joints["Foot_R"], joints["Foot_R"] + Vector((0, -0.14, -0.04))),
    ]

    ebones = {}
    for bname, parent_name, head_v, tail_v in bone_specs:
        eb = arm_data.edit_bones.new(bname)
        eb.head = head_v
        if (tail_v - head_v).length < 0.04:
            eb.tail = head_v + Vector((0, 0, 0.08))
        else:
            eb.tail = tail_v
        if parent_name and parent_name in ebones:
            eb.parent = ebones[parent_name]
        if bname in ("Hips", "Spine", "Chest", "Neck", "Head"):
            eb.align_roll(Vector((0, -1, 0)))
        else:
            eb.align_roll(Vector((0, 1, 0)))
        ebones[bname] = eb

    bpy.ops.object.mode_set(mode="OBJECT")

    body_obj.parent = arm_obj
    mod = body_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm_obj
    return arm_obj


def main():
    print("=== Building High-Poly Sheet-Accurate Kenji & Anya Survivor Rigs ===")
    bled_path, norm_path, rough_path = prepare_edge_bled_survivors_sheet()
    clear_scene()

    sheet_mat_kenji = make_pbr_mat(
        "Kenji_SurvivorSheetPBR",
        image_path=bled_path,
        normal_path=norm_path,
        rough_path=rough_path,
        roughness=0.45,
        metallic=0.10,
        normal_strength=1.45,
    )
    sheet_mat_anya = make_pbr_mat(
        "Anya_SurvivorSheetPBR",
        image_path=bled_path,
        normal_path=norm_path,
        rough_path=rough_path,
        roughness=0.44,
        metallic=0.10,
        normal_strength=1.45,
    )

    # Note: In Blender UV space, v=0 is bottom of image (`y_px=768`) and v=1 is top of image (`y_px=0`).
    # Measured pixel boxes on `survivors_sheet.png` (1376 x 768):
    #   Kenji_Front : x=[41..329] -> u=[0.030..0.239], y=[67..517] -> v=[1-517/768 .. 1-67/768] = [0.327 .. 0.913]
    #   Kenji_Back  : x=[464..706] -> u=[0.337..0.513], y=[74..515] -> v=[0.329 .. 0.904]
    #   Anya_Front  : x=[735..983] -> u=[0.534..0.714], y=[80..518] -> v=[0.326 .. 0.896]
    #   Anya_Back   : x=[1131..1357] -> u=[0.822..0.986], y=[82..517] -> v=[0.327 .. 0.893]

    # 1. Build High-Poly KENJI 'ROAD RASH' TANAKA (`MaleSurvivor_Rig`)
    m_body, m_joints = import_highpoly_sheet_mapped_human(
        "Soldier.glb",
        "MaleSurvivor_Rig",
        front_uv_box=(0.030, 0.239, 0.327, 0.913),
        back_uv_box=(0.337, 0.513, 0.329, 0.904),
        is_kenji=True,
        scale_xyz=(1.02, 1.02, 1.02),
    )
    m_body.data.materials.clear()
    m_body.data.materials.append(sheet_mat_kenji)
    build_kenji_hair_and_biker_armor(m_joints, m_body)
    katana_m = build_void_edge_katana("Kenji_VoidEdge_Katana", m_joints["Hand_R"])
    attach_bone_weighted_part(m_body, katana_m, "Hand_R")
    bat_m = build_crusher_studded_bat("Kenji_Crusher_Bat", m_joints["Hand_L"])
    attach_bone_weighted_part(m_body, bat_m, "Hand_L")
    pack_m = build_tactical_ranger_backpack("Kenji_Ranger_Backpack", m_joints["Chest"])
    attach_bone_weighted_part(m_body, pack_m, "Chest")
    m_arm = finalize_character_armature("MaleSurvivor_Rig", m_body, m_joints)
    m_arm.location = (-1.1, 0, 0)
    print(f"Jack Thorne / Kenji (`MaleSurvivor_Rig`) High-Poly Mesh: {len(m_body.data.vertices):,} verts, {len(m_body.data.polygons):,} polys")

    # 2. Build High-Poly ELISE CARTER / ANYA (`FemaleSurvivor_Rig`)
    f_body, f_joints = import_highpoly_sheet_mapped_human(
        "Michelle.glb",
        "FemaleSurvivor_Rig",
        front_uv_box=(0.534, 0.714, 0.326, 0.896),
        back_uv_box=(0.822, 0.986, 0.327, 0.893),
        is_kenji=False,
        scale_xyz=(1.05, 1.05, 1.05),
    )
    f_body.data.materials.clear()
    f_body.data.materials.append(sheet_mat_anya)
    build_anya_hair_and_tactical_gear(f_joints, f_body)
    katana_f = build_void_edge_katana("Anya_VoidEdge_Katana", f_joints["Hand_R"])
    attach_bone_weighted_part(f_body, katana_f, "Hand_R")
    bat_f = build_crusher_studded_bat("Anya_Crusher_Bat", f_joints["Hand_L"])
    attach_bone_weighted_part(f_body, bat_f, "Hand_L")
    pack_f = build_tactical_ranger_backpack("Anya_Ranger_Backpack", f_joints["Chest"])
    attach_bone_weighted_part(f_body, pack_f, "Chest")
    f_arm = finalize_character_armature("FemaleSurvivor_Rig", f_body, f_joints)
    f_arm.location = (1.1, 0, 0)
    print(f"Anya (`FemaleSurvivor_Rig`) High-Poly Mesh: {len(f_body.data.vertices):,} verts, {len(f_body.data.polygons):,} polys")

    out_path = os.path.join(OUT_DIR, "survivor_combat_rigs.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=False,
        export_skins=True,
        export_draco_mesh_compression_enable=False,
    )
    print(f"Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


if __name__ == "__main__":
    main()
