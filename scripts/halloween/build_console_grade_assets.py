"""
Console-Grade Headless Blender 5.0.1 (`bpy`) Character, Prop & Environment Asset Pipeline
=========================================================================================
Guided by:
  - Art Council (`BAROQUE` Rembrandt chiaroscuro, `CLASSICAL` Gothic stone/ribbed vaults, `FUTURIST` shaders)
  - Game Production Council (`REALTIME_3D_GURU` Søren Lindqvist, `GAMEPLAY_VIRTUOSO` Elena Vance-Moreau)

Key Guarantee:
  - NEVER uses 2D heightmap-inflated blobs for characters!
  - Every playable character, movie cast member, and monster is built on top of REAL Mixamo/Khronos
    anatomical 3D human & android meshes (`Soldier.glb` 7,325 verts, `Michelle.glb` 16,340 verts,
    `Xbot.glb` 28,374 verts) with factory UV unwraps, factory tangent-space normal maps, custom
    character-graded PBR textures, 3D sculpted character heads/hats/coats/weapons, and 100% factory
    Mixamo skin weights mapped to a clean 17-bone metric Armature (`Hips`, `Spine`, `Chest`, `Neck`,
    `Head`, `UpperArm_L`, `LowerArm_L`, `Hand_L`, `UpperArm_R`, `LowerArm_R`, `Hand_R`, `UpLeg_L`,
    `LowLeg_L`, `Foot_L`, `UpLeg_R`, `LowLeg_R`, `Foot_R`).
  - Prepares photographic PBR textures (`D:/Vue Library/Bitmaps/Bitmaps/*` + AI textures) along with
    generated tangent-space Normal Maps, Depth/Displacement Maps, and Roughness Maps.
"""

import os
import shutil
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Euler, Matrix
from PIL import Image, ImageFilter, ImageEnhance

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE_RIGS_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "base_rigs")
STILLS_DIR = os.path.join(ROOT_DIR, "public", "generated", "comics", "pumpkin_patch_v4")
SHEETS_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "sheets")
PLATES_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "plates")
TEXTURES_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "textures")
NORMALS_DIR = os.path.join(TEXTURES_DIR, "normals")
CHAR_TEX_DIR = os.path.join(TEXTURES_DIR, "characters")
OUT_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween")

os.makedirs(TEXTURES_DIR, exist_ok=True)
os.makedirs(NORMALS_DIR, exist_ok=True)
os.makedirs(CHAR_TEX_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def shade_smooth_obj(obj):
    if not obj or obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True


# ---------------------------------------------------------------------------
# 1. PHOTOGRAPHIC PBR TEXTURE, NORMAL, DEPTH & ROUGHNESS MAP GENERATOR
# ---------------------------------------------------------------------------
VUE_BITMAP_DIR = r"D:\Vue Library\Bitmaps\Bitmaps"
PHOTO_TEXTURE_COPIES = {
    "Wood Boards Floor MATR 01 LR.jpg": "wood_floor.jpg",
    "Wood Boards Roof MATR 01 LR.jpg": "wood_planks_roof.jpg",
    "stone_wall 2 TR.jpg": "stone_wall_photo.jpg",
    "brick-03ag.jpg": "gothic_brick.jpg",
    "marbre-02ag.jpg": "dark_marble.jpg",
    "TableCloth.jpg": "velvet_curtain.jpg",
    "leather TR 06.jpg": "dark_leather.jpg",
    "Oak.jpg": "oak_wood.jpg",
}

_PBR_CACHE = {}


def ensure_pbr_maps(img_path: str, strength: float = 2.4):
    """Generates tangent-space normal map, depth/displacement map, and roughness map."""
    if not img_path or not os.path.exists(img_path):
        return None, None, None
    if img_path in _PBR_CACHE:
        return _PBR_CACHE[img_path]

    base = os.path.splitext(os.path.basename(img_path))[0]
    norm_path = os.path.join(NORMALS_DIR, f"{base}_normal.png")
    rough_path = os.path.join(NORMALS_DIR, f"{base}_rough.png")
    depth_path = os.path.join(NORMALS_DIR, f"{base}_depth.png")

    if not (os.path.exists(norm_path) and os.path.exists(rough_path) and os.path.exists(depth_path)):
        try:
            im = Image.open(img_path).convert("RGB").resize((512, 512), Image.Resampling.BILINEAR)
            gray = np.asarray(im.convert("L"), dtype=np.float32) / 255.0

            # Smooth depth map for vertex/parallax displacement
            depth_im = im.convert("L").filter(ImageFilter.GaussianBlur(radius=1.2)).resize((512, 512))
            depth_im.save(depth_path)

            # Sobel tangent-space normal map
            gx = np.zeros_like(gray)
            gy = np.zeros_like(gray)
            gx[:, 1:-1] = (gray[:, 2:] - gray[:, :-2]) * strength
            gy[1:-1, :] = (gray[2:, :] - gray[:-2, :]) * strength
            nz = np.ones_like(gray)
            length = np.sqrt(gx * gx + gy * gy + nz * nz)
            nx = (-gx / length) * 0.5 + 0.5
            ny = (gy / length) * 0.5 + 0.5
            nz = (nz / length) * 0.5 + 0.5
            norm_rgb = np.stack([nx, ny, nz], axis=-1)
            Image.fromarray((np.clip(norm_rgb, 0, 1) * 255).astype(np.uint8)).save(norm_path)

            # Roughness map
            rough = np.clip(0.84 - (gray - 0.42) * 0.48, 0.18, 0.96)
            Image.fromarray((rough * 255).astype(np.uint8)).save(rough_path)
        except Exception as exc:
            print("Warning generating PBR maps for", img_path, exc)
            return None, None, None

    _PBR_CACHE[img_path] = (norm_path, rough_path, depth_path)
    return norm_path, rough_path, depth_path


def prepare_photographic_environment_textures():
    print("--- Preparing Photographic PBR Textures + Normal/Depth/Roughness Maps ---")
    if os.path.exists(VUE_BITMAP_DIR):
        for src_name, dst_name in PHOTO_TEXTURE_COPIES.items():
            src_p = os.path.join(VUE_BITMAP_DIR, src_name)
            dst_p = os.path.join(TEXTURES_DIR, dst_name)
            if os.path.exists(src_p):
                im = Image.open(src_p).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
                if dst_name == "velvet_curtain.jpg":
                    # Rich crimson-burgundy Gothic velvet curtain weave
                    arr = np.asarray(im, dtype=np.float32) / 255.0
                    lum = arr.mean(axis=-1, keepdims=True)
                    # Add vertical curtain fold shading waves
                    xs = np.linspace(0, 1, 1024, dtype=np.float32)[None, :, None]
                    folds = 0.72 + 0.28 * np.sin(xs * math.pi * 14.0)
                    crimson = np.concatenate(
                        [
                            np.clip(lum * 0.78 * folds + 0.12, 0.05, 0.95),
                            np.clip(lum * 0.11 * folds, 0.01, 0.25),
                            np.clip(lum * 0.22 * folds + 0.03, 0.02, 0.38),
                        ],
                        axis=-1,
                    )
                    im = Image.fromarray((crimson * 255).astype(np.uint8))
                elif dst_name == "dark_marble.jpg":
                    # Polished obsidian-emerald veined Gothic castle marble
                    arr = np.asarray(im, dtype=np.float32) / 255.0
                    lum = arr.mean(axis=-1, keepdims=True)
                    marble = np.concatenate(
                        [
                            np.clip(lum * 0.34 + 0.04, 0.03, 0.65),
                            np.clip(lum * 0.38 + 0.05, 0.03, 0.70),
                            np.clip(lum * 0.46 + 0.07, 0.05, 0.80),
                        ],
                        axis=-1,
                    )
                    im = Image.fromarray((marble * 255).astype(np.uint8))
                im.save(dst_p, quality=92)
                ensure_pbr_maps(dst_p, strength=2.6)

    for tex_fn in ["asphalt_road.png", "gothic_stone.png", "weathered_wood.png", "forest_ground.png"]:
        p = os.path.join(TEXTURES_DIR, tex_fn)
        if os.path.exists(p):
            ensure_pbr_maps(p, strength=2.8)


def make_pbr_mat(
    name: str,
    color=(0.5, 0.5, 0.5, 1.0),
    roughness=0.52,
    metallic=0.0,
    emission=None,
    emission_strength=0.0,
    alpha=1.0,
    image_path: str = None,
    normal_path: str = None,
    rough_path: str = None,
    normal_strength: float = 1.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")

    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    if image_path and os.path.exists(image_path):
        tex = nodes.new(type="ShaderNodeTexImage")
        tex.image = bpy.data.images.load(image_path, check_existing=True)
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if not normal_path or not rough_path:
            auto_norm, auto_rough, _ = ensure_pbr_maps(image_path)
            normal_path = normal_path or auto_norm
            rough_path = rough_path or auto_rough

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

    if alpha < 1.0:
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"

    return mat


# ---------------------------------------------------------------------------
# 2. EXTRACT & COLOR-GRADE REAL MIXAMO CHARACTER TEXTURES & NORMAL MAPS
# ---------------------------------------------------------------------------
def extract_and_grade_mixamo_textures():
    """
    Extracts the factory-unwrapped 1024x1024 Soldier diffuse/normal maps and 512x512 Michelle
    diffuse/normal maps from the base GLBs and generates custom character-accurate PBR textures
    matching our Art Council Character Turnaround Sheets!
    """
    soldier_diff_path = os.path.join(CHAR_TEX_DIR, "soldier_base_diff.png")
    soldier_norm_path = os.path.join(CHAR_TEX_DIR, "soldier_base_norm.png")
    michelle_diff_path = os.path.join(CHAR_TEX_DIR, "michelle_base_diff.png")
    michelle_norm_path = os.path.join(CHAR_TEX_DIR, "michelle_base_norm.png")

    if not os.path.exists(soldier_diff_path):
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=os.path.join(BASE_RIGS_DIR, "Soldier.glb"))
        for img in bpy.data.images:
            w, h = img.size[0], img.size[1]
            if w > 64 and h > 64:
                arr = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, 4))
                arr = np.flipud(arr)
                rgb = (np.clip(arr[:, :, :3], 0, 1) * 255).astype(np.uint8)
                if "diffuse" in img.name.lower():
                    Image.fromarray(rgb).save(soldier_diff_path)
                elif "file2" in img.name.lower():
                    Image.fromarray(rgb).save(soldier_norm_path)

    if not os.path.exists(michelle_diff_path):
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=os.path.join(BASE_RIGS_DIR, "Michelle.glb"))
        for img in bpy.data.images:
            w, h = img.size[0], img.size[1]
            if w > 64 and h > 64:
                arr = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, 4))
                arr = np.flipud(arr)
                rgb = (np.clip(arr[:, :, :3], 0, 1) * 255).astype(np.uint8)
                if "diffuse" in img.name.lower():
                    Image.fromarray(rgb).save(michelle_diff_path)
                elif "normal" in img.name.lower():
                    Image.fromarray(rgb).save(michelle_norm_path)

    # Generate Custom Graded Character Diffuse Maps
    s_im = Image.open(soldier_diff_path).convert("RGB")
    s_arr = np.asarray(s_im, dtype=np.float32) / 255.0
    s_lum = s_arr.mean(axis=-1, keepdims=True)

    # 1. Male Survivor: Distressed Crimson-Black Leather Biker Jacket + Dark Charcoal Jeans
    male_surv = np.concatenate(
        [
            np.clip(s_arr[:, :, 0:1] * 0.85 + s_lum * 0.28 + 0.04, 0.04, 0.92),
            np.clip(s_arr[:, :, 1:2] * 0.42 + s_lum * 0.08, 0.02, 0.65),
            np.clip(s_arr[:, :, 2:3] * 0.48 + s_lum * 0.12, 0.03, 0.72),
        ],
        axis=-1,
    )
    male_surv_path = os.path.join(CHAR_TEX_DIR, "male_survivor_diff.png")
    Image.fromarray((male_surv * 255).astype(np.uint8)).save(male_surv_path)

    # 2. Pumpkin Patch Body: Glossy Obsidian Black Leather Duster & Tactical Vest with Amber Trim
    pp_body = np.concatenate(
        [
            np.clip(s_lum * 0.28 + 0.02, 0.02, 0.45),
            np.clip(s_lum * 0.22 + 0.01, 0.01, 0.35),
            np.clip(s_lum * 0.26 + 0.03, 0.02, 0.40),
        ],
        axis=-1,
    )
    pp_body_path = os.path.join(CHAR_TEX_DIR, "pumpkin_patch_body_diff.png")
    Image.fromarray((pp_body * 255).astype(np.uint8)).save(pp_body_path)

    # 3. Stitch the Scarecrow Body: Weathered Coarse Brown Burlap & Tattered Leather
    stitch_body = np.concatenate(
        [
            np.clip(s_lum * 0.68 + 0.12, 0.08, 0.85),
            np.clip(s_lum * 0.46 + 0.07, 0.05, 0.62),
            np.clip(s_lum * 0.24 + 0.03, 0.02, 0.38),
        ],
        axis=-1,
    )
    stitch_body_path = os.path.join(CHAR_TEX_DIR, "stitch_body_diff.png")
    Image.fromarray((stitch_body * 255).astype(np.uint8)).save(stitch_body_path)

    # 4. Zombie Body: Necrotic Grey-Green Rotting Flesh & Blood-Stained Flannel
    zombie_body = np.concatenate(
        [
            np.clip(s_lum * 0.45 + (s_arr[:, :, 0:1] > 0.45) * 0.25, 0.05, 0.78),
            np.clip(s_lum * 0.62 + 0.06, 0.06, 0.75),
            np.clip(s_lum * 0.38 + 0.03, 0.03, 0.52),
        ],
        axis=-1,
    )
    zombie_body_path = os.path.join(CHAR_TEX_DIR, "zombie_body_diff.png")
    Image.fromarray((zombie_body * 255).astype(np.uint8)).save(zombie_body_path)

    # Michelle-based textures (Female Survivor & Wicked Witch Miriam)
    m_im = Image.open(michelle_diff_path).convert("RGB")
    m_arr = np.asarray(m_im, dtype=np.float32) / 255.0
    m_lum = m_arr.mean(axis=-1, keepdims=True)
    # Detect skin-tone pixels vs clothing pixels on Michelle's UV map
    r, g, b = m_arr[:, :, 0:1], m_arr[:, :, 1:2], m_arr[:, :, 2:3]
    is_skin = ((r > g * 1.12) & (g > b * 1.05) & (r > 0.32)).astype(np.float32)

    # 5. Female Survivor: Keep warm human skin + transform outfit to Grindhouse Dark Studded Leather/Denim & Crimson
    fem_cloth = np.concatenate(
        [
            np.clip(m_lum * 0.38 + 0.04, 0.03, 0.58),
            np.clip(m_lum * 0.26 + 0.03, 0.02, 0.42),
            np.clip(m_lum * 0.36 + 0.05, 0.04, 0.55),
        ],
        axis=-1,
    )
    fem_surv = is_skin * m_arr + (1.0 - is_skin) * fem_cloth
    fem_surv_path = os.path.join(CHAR_TEX_DIR, "female_survivor_diff.png")
    Image.fromarray((np.clip(fem_surv, 0, 1) * 255).astype(np.uint8)).save(fem_surv_path)

    # 6. Wicked Witch Miriam: Transform skin to Emerald Witch Green + outfit to Obsidian Victorian Velvet
    miriam_skin = np.concatenate(
        [
            np.clip(m_lum * 0.26 + 0.04, 0.04, 0.42),
            np.clip(m_lum * 0.78 + 0.14, 0.15, 0.92),
            np.clip(m_lum * 0.34 + 0.06, 0.05, 0.48),
        ],
        axis=-1,
    )
    miriam_cloth = np.concatenate(
        [
            np.clip(m_lum * 0.22 + 0.03, 0.02, 0.35),
            np.clip(m_lum * 0.15 + 0.01, 0.01, 0.25),
            np.clip(m_lum * 0.28 + 0.04, 0.03, 0.44),
        ],
        axis=-1,
    )
    miriam_arr = is_skin * miriam_skin + (1.0 - is_skin) * miriam_cloth
    miriam_path = os.path.join(CHAR_TEX_DIR, "miriam_body_diff.png")
    Image.fromarray((np.clip(miriam_arr, 0, 1) * 255).astype(np.uint8)).save(miriam_path)

    return {
        "soldier_norm": soldier_norm_path,
        "michelle_norm": michelle_norm_path,
        "male_surv_diff": male_surv_path,
        "fem_surv_diff": fem_surv_path,
        "pp_body_diff": pp_body_path,
        "stitch_body_diff": stitch_body_path,
        "zombie_body_diff": zombie_body_path,
        "miriam_body_diff": miriam_path,
    }


# ---------------------------------------------------------------------------
# 3. REAL MIXAMO CHARACTER RIG BUILDER (FACTORY SKIN WEIGHTS + METRIC ARMATURE)
# ---------------------------------------------------------------------------
# Maps all 52 Mixamo vertex groups cleanly into our 17 core anatomical bones
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


def import_and_pose_mixamo_character(
    base_glb_name: str,
    char_name: str,
    scale_xyz=(1.0, 1.0, 1.0),
    keep_visor=False,
):
    """
    Imports a real Mixamo character (`Soldier.glb`, `Michelle.glb`, or `Xbot.glb`),
    lowers its arms from T-pose into a natural athletic combat-ready stance in Pose Mode,
    applies the pose to the high-resolution human mesh, normalizes orientation so ALL characters
    face `-Y` in Blender (`+Z` in glTF/Three.js), consolidates factory Mixamo skin weights into
    the 17 core anatomical vertex groups, and returns `(body_mesh, joint_positions_dict)`.
    """
    before_objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(BASE_RIGS_DIR, base_glb_name))
    new_objs = [o for o in bpy.data.objects if o not in before_objs]

    arm = next(o for o in new_objs if o.type == "ARMATURE")
    meshes = []
    for o in new_objs:
        if o.type == "MESH":
            if o.name == "Icosphere" or (not keep_visor and "visor" in o.name.lower()):
                bpy.data.objects.remove(o, do_unlink=True)
            else:
                meshes.append(o)

    arm.animation_data_clear()
    arm.data.pose_position = "POSE"
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
        pb.rotation_mode = "XYZ"

    # Lower arms from T-pose into natural athletic combat stance
    if base_glb_name == "Soldier.glb":
        arm.pose.bones["mixamorig:LeftArm"].rotation_euler = (0, 0, math.radians(56))
        arm.pose.bones["mixamorig:RightArm"].rotation_euler = (0, 0, math.radians(56))
        arm.pose.bones["mixamorig:LeftForeArm"].rotation_euler = (0, 0, math.radians(16))
        arm.pose.bones["mixamorig:RightForeArm"].rotation_euler = (0, 0, math.radians(16))
    elif base_glb_name == "Michelle.glb":
        arm.pose.bones["mixamorig:LeftArm"].rotation_euler = (math.radians(56), 0, 0)
        arm.pose.bones["mixamorig:RightArm"].rotation_euler = (math.radians(56), 0, 0)
        arm.pose.bones["mixamorig:LeftForeArm"].rotation_euler = (0, 0, math.radians(-18))
        arm.pose.bones["mixamorig:RightForeArm"].rotation_euler = (0, 0, math.radians(18))
    elif base_glb_name == "Xbot.glb":
        arm.pose.bones["mixamorig:LeftArm"].rotation_euler = (0, 0, math.radians(-56))
        arm.pose.bones["mixamorig:RightArm"].rotation_euler = (0, 0, math.radians(56))
        arm.pose.bones["mixamorig:LeftForeArm"].rotation_euler = (0, math.radians(-18), 0)
        arm.pose.bones["mixamorig:RightForeArm"].rotation_euler = (0, math.radians(18), 0)

    bpy.context.view_layer.update()

    # Soldier.glb faces +Y in Blender; rotate 180 deg around Z so ALL characters face -Y in Blender (+Z in Three.js)
    flip_z = -1.0 if base_glb_name == "Soldier.glb" else 1.0
    sx, sy, sz = scale_xyz

    def xform_pt(pt: Vector) -> Vector:
        return Vector((pt.x * flip_z * sx, pt.y * flip_z * sy, pt.z * sz))

    # Record exact world-space joint coordinates in this posed stance
    def bhead(bname):
        return xform_pt(arm.matrix_world @ arm.pose.bones[bname].head)

    joints = {
        "Hips": bhead("mixamorig:Hips"),
        "Spine": bhead("mixamorig:Spine"),
        "Chest": bhead("mixamorig:Spine2"),
        "Neck": bhead("mixamorig:Neck"),
        "Head": bhead("mixamorig:Head"),
        # Note: When facing -Y in Blender, Left is +X and Right is -X.
        # We standardize so `_R` is the character's right side and `_L` is the character's left side.
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

    # Apply the Armature modifier on each mesh so the posed human geometry is baked into vertex coordinates
    for m in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        for mod in list(m.modifiers):
            if mod.type == "ARMATURE":
                bpy.ops.object.modifier_apply(modifier=mod.name)
        # Unparent keeping world transform
        mw = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = mw
        # Transform vertices directly to clean metric world space (with flip_z and scale_xyz)
        for v in m.data.vertices:
            w_co = mw @ v.co
            v.co = xform_pt(w_co)
        m.matrix_world = Matrix.Identity(4)
        if flip_z < 0:
            # Flipping both X and Y preserves face winding! Just recalculate normals.
            bm = bmesh.new()
            bm.from_mesh(m.data)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(m.data)
            bm.free()

    # Join multiple meshes if needed (e.g. Xbot Beta_Surface + Beta_Joints)
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()

    body = meshes[0]
    body.name = f"{char_name}_Body"

    # Remove old Mixamo armature
    bpy.data.objects.remove(arm, do_unlink=True)

    # Consolidate the 52 Mixamo vertex groups into our 17 clean core bone vertex groups
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

    shade_smooth_obj(body)
    return body, joints


def attach_bone_weighted_part(body_obj, part_obj, bone_name: str):
    """
    Assigns 100% weight of `part_obj` to `bone_name` and joins it directly into `body_obj`
    so it moves with zero lag or scale issues as part of the single skinned character mesh!
    """
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


def finalize_character_armature(char_name: str, body_obj, joints: dict):
    """
    Creates the clean `(1.0, 1.0, 1.0)` metric Blender Armature named `char_name`
    matching the exact joint locations of `body_obj` and binds `body_obj` to it.
    """
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
        # Align bone roll so Local X is strictly Left-Right (+X) for all bones:
        # +rx ALWAYS pitches/swings forward, -rx ALWAYS swings backward!
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


# ---------------------------------------------------------------------------
# 4. 3D WEAPONS, SCULPTED HEADS & CHARACTER EQUIPMENT BUILDERS
# ---------------------------------------------------------------------------
def build_bushido_katana_mesh(name: str, hand_pos: Vector, is_plasma=False, plasma_color=(1.0, 0.42, 0.05)):
    """Builds a high-detail 3D Bushido Katana or Superheated Plasma Blade at `hand_pos`."""
    objs = []
    # Hilt (Tsuka)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16, radius=0.022, depth=0.28,
        location=(hand_pos.x, hand_pos.y + 0.04, hand_pos.z - 0.02),
        rotation=(math.radians(72), 0, 0),
    )
    hilt = bpy.context.active_object
    hilt.data.materials.append(make_pbr_mat(f"{name}_HiltMat", color=(0.45, 0.06, 0.08, 1.0), roughness=0.6))
    objs.append(hilt)

    # Guard (Tsuba)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=20, radius=0.055, depth=0.016,
        location=(hand_pos.x, hand_pos.y - 0.09, hand_pos.z - 0.06),
        rotation=(math.radians(72), 0, 0),
    )
    tsuba = bpy.context.active_object
    tsuba.data.materials.append(make_pbr_mat(f"{name}_TsubaMat", color=(0.85, 0.68, 0.24, 1.0), roughness=0.25, metallic=0.92))
    objs.append(tsuba)

    # Blade
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(hand_pos.x, hand_pos.y - 0.54, hand_pos.z - 0.21),
        rotation=(math.radians(72), 0, 0),
    )
    blade = bpy.context.active_object
    blade.scale = (0.012, 0.042, 0.92)
    if is_plasma:
        bmat = make_pbr_mat(
            f"{name}_PlasmaMat",
            color=(*plasma_color, 1.0),
            roughness=0.15,
            metallic=0.4,
            emission=plasma_color,
            emission_strength=6.5,
        )
    else:
        bmat = make_pbr_mat(
            f"{name}_SteelMat",
            color=(0.88, 0.91, 0.96, 1.0),
            roughness=0.14,
            metallic=0.96,
            emission=(0.25, 0.45, 0.85),
            emission_strength=0.25,
        )
    blade.data.materials.append(bmat)
    objs.append(blade)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_spiked_bat_back_prop(name: str, chest_pos: Vector):
    """Builds a 3D Nail-Spiked Hardwood Baseball Bat slung diagonally across the survivor's back."""
    objs = []
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=18, radius=0.036, depth=0.86,
        location=(chest_pos.x, chest_pos.y + 0.16, chest_pos.z + 0.05),
        rotation=(0, math.radians(38), 0),
    )
    bat = bpy.context.active_object
    wood_tex = os.path.join(TEXTURES_DIR, "oak_wood.jpg")
    bat.data.materials.append(
        make_pbr_mat(f"{name}_WoodMat", color=(0.48, 0.28, 0.14, 1.0), roughness=0.55, image_path=wood_tex if os.path.exists(wood_tex) else None)
    )
    objs.append(bat)

    spike_mat = make_pbr_mat(f"{name}_SpikeMat", color=(0.82, 0.85, 0.90, 1.0), roughness=0.22, metallic=0.95)
    for ang in (0, 90, 180, 270):
        rad = math.radians(ang)
        bpy.ops.mesh.primitive_cone_add(
            vertices=10, radius1=0.012, radius2=0.0, depth=0.09,
            location=(chest_pos.x + 0.18 + math.cos(rad) * 0.04, chest_pos.y + 0.16 + math.sin(rad) * 0.04, chest_pos.z + 0.24),
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


def build_carved_pumpkin_head(name: str, head_pos: Vector):
    """
    Builds a 3D Carved Jack-o'-Lantern Head with 12 deep vertical pumpkin ribs, curved vine stem,
    popped Gothic obsidian leather trench-coat collar, and glowing amber carved eyes and jagged grin
    for Pumpkin Patch (Melvin Lester).
    """
    objs = []
    center = (head_pos.x, head_pos.y - 0.01, head_pos.z + 0.09)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=0.195, location=center)
    pump = bpy.context.active_object

    bm = bmesh.new()
    bm.from_mesh(pump.data)
    uv_layer = bm.loops.layers.uv.verify()
    for v in bm.verts:
        ang = math.atan2(v.co.x, -v.co.y)
        rib = math.cos(ang * 12.0) * 0.095 * (1.0 - 0.25 * abs(v.co.z / 0.195))
        v.co.x *= (1.0 + rib) * 1.10
        v.co.y *= (1.0 + rib) * 1.06
        v.co.z *= 0.88
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            u = np.clip(0.5 + (co.x / 0.21) * 0.45, 0.05, 0.95)
            v_uv = np.clip(0.5 + (co.z / 0.18) * 0.45, 0.05, 0.95)
            loop[uv_layer].uv = (u, v_uv)
    bm.normal_update()
    bm.to_mesh(pump.data)
    bm.free()

    portrait_p = os.path.join(STILLS_DIR, "char_1_portrait.jpg")
    pump.data.materials.append(
        make_pbr_mat(
            f"{name}_RindMat",
            color=(0.96, 0.40, 0.04, 1.0),
            roughness=0.38,
            image_path=portrait_p if os.path.exists(portrait_p) else None,
            emission=(0.95, 0.36, 0.03),
            emission_strength=0.55,
            normal_strength=1.6,
        )
    )
    objs.append(pump)

    # High Popped Gothic Leather Trench Coat Collar around neck
    leather_tex = os.path.join(TEXTURES_DIR, "dark_leather.jpg")
    collar_mat = make_pbr_mat(
        f"{name}_CollarMat",
        color=(0.05, 0.05, 0.07, 1.0),
        roughness=0.32,
        metallic=0.18,
        image_path=leather_tex if os.path.exists(leather_tex) else None,
    )
    bpy.ops.mesh.primitive_cone_add(
        vertices=28, radius1=0.14, radius2=0.22, depth=0.16,
        location=(center[0], center[1] + 0.02, center[2] - 0.12),
    )
    collar = bpy.context.active_object
    collar.scale = (1.12, 0.92, 1.0)
    collar.data.materials.append(collar_mat)
    objs.append(collar)

    # Glowing Amber Carved Triangular Eyes & Grin
    glow_mat = make_pbr_mat(
        f"{name}_EmberGlow",
        color=(1.0, 0.80, 0.16, 1.0),
        roughness=0.08,
        emission=(1.0, 0.68, 0.08),
        emission_strength=9.5,
    )
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(
            vertices=3, radius1=0.044, radius2=0.006, depth=0.036,
            location=(center[0] + side * 0.068, center[1] - 0.188, center[2] + 0.028),
            rotation=(math.radians(90), 0, 0),
        )
        eye = bpy.context.active_object
        eye.data.materials.append(glow_mat)
        objs.append(eye)

    # Glowing Carved Triangle Nose
    bpy.ops.mesh.primitive_cone_add(
        vertices=3, radius1=0.026, radius2=0.004, depth=0.03,
        location=(center[0], center[1] - 0.198, center[2] - 0.005),
        rotation=(math.radians(90), 0, 0),
    )
    nose = bpy.context.active_object
    nose.data.materials.append(glow_mat)
    objs.append(nose)

    # Jagged Stitched Jack-o'-Lantern Grin
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.082, minor_radius=0.018,
        location=(center[0], center[1] - 0.175, center[2] - 0.045),
        rotation=(math.radians(78), 0, 0),
    )
    grin = bpy.context.active_object
    grin.scale = (1.22, 0.48, 0.68)
    grin.data.materials.append(glow_mat)
    objs.append(grin)

    # Curved Gnarled Pumpkin Stem
    bpy.ops.mesh.primitive_cone_add(
        vertices=14, radius1=0.038, radius2=0.014, depth=0.115,
        location=(center[0], center[1] + 0.01, center[2] + 0.195),
        rotation=(math.radians(-22), math.radians(14), 0),
    )
    stem = bpy.context.active_object
    stem.data.materials.append(make_pbr_mat(f"{name}_StemMat", color=(0.16, 0.28, 0.09, 1.0), roughness=0.75))
    objs.append(stem)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_leather_duster_coat_skirt(name: str, hips_pos: Vector):
    """Builds a 3D flared black leather duster trench coat skirt around the character's hips/legs."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=28, radius1=0.31, radius2=0.19, depth=0.72,
        location=(hips_pos.x, hips_pos.y + 0.02, hips_pos.z - 0.28),
    )
    skirt = bpy.context.active_object
    skirt.scale = (1.05, 0.78, 1.0)
    # Open the front (-Y) slit of the trench coat
    bm = bmesh.new()
    bm.from_mesh(skirt.data)
    to_del = [f for f in bm.faces if f.calc_center_median().y < -0.11 and f.calc_center_median().z < 0.15]
    bmesh.ops.delete(bm, geom=to_del, context="FACES")
    bm.to_mesh(skirt.data)
    bm.free()
    sol = skirt.modifiers.new(name="Solidify", type="SOLIDIFY")
    sol.thickness = 0.016
    bpy.ops.object.modifier_apply(modifier="Solidify")

    leather_tex = os.path.join(TEXTURES_DIR, "dark_leather.jpg")
    skirt.data.materials.append(
        make_pbr_mat(
            f"{name}_LeatherMat",
            color=(0.06, 0.06, 0.08, 1.0),
            roughness=0.34,
            metallic=0.15,
            image_path=leather_tex if os.path.exists(leather_tex) else None,
        )
    )
    skirt.name = name
    return skirt


def build_witch_hat_and_eyepatch(name: str, head_pos: Vector):
    """Builds Wicked Witch Miriam's wide-brimmed black leather witch hat, silver buckle, and right eyepatch."""
    objs = []
    leather_tex = os.path.join(TEXTURES_DIR, "dark_leather.jpg")
    hat_mat = make_pbr_mat(
        f"{name}_WitchHatMat",
        color=(0.05, 0.04, 0.07, 1.0),
        roughness=0.36,
        image_path=leather_tex if os.path.exists(leather_tex) else None,
    )
    silver_mat = make_pbr_mat(f"{name}_SilverBuckle", color=(0.85, 0.88, 0.94, 1.0), roughness=0.2, metallic=0.95)

    top_z = head_pos.z + 0.155
    # Wide Witch Hat Brim
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=36, radius=0.29, depth=0.014,
        location=(head_pos.x, head_pos.y + 0.01, top_z),
        rotation=(math.radians(-8), 0, 0),
    )
    brim = bpy.context.active_object
    brim.data.materials.append(hat_mat)
    objs.append(brim)

    # Pointed Witch Hat Cone
    bpy.ops.mesh.primitive_cone_add(
        vertices=28, radius1=0.125, radius2=0.008, depth=0.34,
        location=(head_pos.x, head_pos.y + 0.02, top_z + 0.17),
        rotation=(math.radians(-14), math.radians(6), 0),
    )
    cone = bpy.context.active_object
    cone.data.materials.append(hat_mat)
    objs.append(cone)

    # Silver Hat Buckle
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(head_pos.x, head_pos.y - 0.115, top_z + 0.045),
    )
    buckle = bpy.context.active_object
    buckle.scale = (0.048, 0.018, 0.042)
    buckle.data.materials.append(silver_mat)
    objs.append(buckle)

    # Black Leather Eyepatch over Miriam's right eye (-X when facing -Y)
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16, ring_count=12, radius=0.028,
        location=(head_pos.x - 0.034, head_pos.y - 0.095, head_pos.z + 0.068),
    )
    patch = bpy.context.active_object
    patch.scale = (1.1, 0.45, 0.85)
    patch.data.materials.append(hat_mat)
    objs.append(patch)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_cyber_cat_familiar(name: str, chest_pos: Vector):
    """Builds Miriam's glowing blue Cyber-Cat familiar perched on her right shoulder."""
    objs = []
    cat_mat = make_pbr_mat(
        f"{name}_CyberCatMat",
        color=(0.12, 0.45, 0.95, 1.0),
        roughness=0.25,
        metallic=0.65,
        emission=(0.18, 0.65, 1.0),
        emission_strength=2.8,
    )
    sx, sy, sz = chest_pos.x - 0.16, chest_pos.y - 0.02, chest_pos.z + 0.18
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.048, location=(sx, sy, sz))
    body = bpy.context.active_object
    body.scale = (0.85, 1.15, 1.1)
    body.data.materials.append(cat_mat)
    objs.append(body)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.036, location=(sx, sy - 0.03, sz + 0.065))
    head = bpy.context.active_object
    head.data.materials.append(cat_mat)
    objs.append(head)

    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(
            vertices=8, radius1=0.012, radius2=0.0, depth=0.028,
            location=(sx + side * 0.022, sy - 0.03, sz + 0.102),
        )
        ear = bpy.context.active_object
        ear.data.materials.append(cat_mat)
        objs.append(ear)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_scarecrow_hood_and_hat(name: str, head_pos: Vector):
    """Builds Stitch the Scarecrow's burlap sack mask, glowing button eyes, and battered brimmed hat."""
    objs = []
    portrait_p = os.path.join(STILLS_DIR, "char_4_portrait.jpg")
    burlap_mat = make_pbr_mat(
        f"{name}_BurlapMat",
        color=(0.58, 0.42, 0.24, 1.0),
        roughness=0.88,
        image_path=portrait_p if os.path.exists(portrait_p) else None,
        normal_strength=1.5,
    )
    center = (head_pos.x, head_pos.y - 0.01, head_pos.z + 0.08)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=0.135, location=center)
    sack = bpy.context.active_object
    sack.scale = (0.96, 1.02, 1.12)
    sack.data.materials.append(burlap_mat)
    objs.append(sack)

    # Battered Scarecrow Hat
    hat_mat = make_pbr_mat(f"{name}_HatMat", color=(0.18, 0.12, 0.08, 1.0), roughness=0.78)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=28, radius=0.25, depth=0.014,
        location=(center[0], center[1], center[2] + 0.11),
        rotation=(math.radians(6), math.radians(-5), 0),
    )
    brim = bpy.context.active_object
    brim.data.materials.append(hat_mat)
    objs.append(brim)

    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=0.12, radius2=0.04, depth=0.22,
        location=(center[0], center[1], center[2] + 0.21),
    )
    crown = bpy.context.active_object
    crown.data.materials.append(hat_mat)
    objs.append(crown)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_robobones_skull_and_bowler(name: str, head_pos: Vector):
    """Builds Commander Crane (Robo-Bones) chrome android skull face, glowing optical sensors, and bowler hat."""
    objs = []
    portrait_p = os.path.join(STILLS_DIR, "char_5_portrait.jpg")
    chrome_mat = make_pbr_mat(
        f"{name}_ChromeSkullMat",
        color=(0.72, 0.76, 0.82, 1.0),
        roughness=0.22,
        metallic=0.94,
        image_path=portrait_p if os.path.exists(portrait_p) else None,
        normal_strength=1.3,
    )
    center = (head_pos.x, head_pos.y - 0.01, head_pos.z + 0.08)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=24, radius=0.125, location=center)
    skull = bpy.context.active_object
    skull.scale = (0.92, 1.04, 1.12)
    skull.data.materials.append(chrome_mat)
    objs.append(skull)

    eye_mat = make_pbr_mat(
        f"{name}_OpticGlow",
        color=(0.92, 0.98, 1.0, 1.0),
        emission=(0.85, 0.95, 1.0),
        emission_strength=6.5,
    )
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=14, ring_count=10, radius=0.022,
            location=(center[0] + side * 0.042, center[1] - 0.118, center[2] + 0.015),
        )
        eye = bpy.context.active_object
        eye.data.materials.append(eye_mat)
        objs.append(eye)

    # Classic Black Bowler Hat
    bowler_mat = make_pbr_mat(f"{name}_BowlerMat", color=(0.05, 0.05, 0.07, 1.0), roughness=0.32)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.145, minor_radius=0.018,
        location=(center[0], center[1], center[2] + 0.105),
    )
    brim = bpy.context.active_object
    brim.data.materials.append(bowler_mat)
    objs.append(brim)

    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24, ring_count=16, radius=0.118,
        location=(center[0], center[1], center[2] + 0.135),
    )
    dome = bpy.context.active_object
    dome.scale = (1.0, 1.08, 0.82)
    dome.data.materials.append(bowler_mat)
    objs.append(dome)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def build_werewolf_head_and_ears(name: str, head_pos: Vector):
    """Builds a sculpted 3D Lycanthrope Werewolf head with elongated fanged snout, lupine ears, and glowing amber eyes."""
    objs = []
    fur_mat = make_pbr_mat(
        f"{name}_WolfFurMat",
        color=(0.14, 0.13, 0.16, 1.0),
        roughness=0.82,
        metallic=0.05,
        image_path=os.path.join(SHEETS_DIR, "monsters_sheet.png"),
        normal_strength=1.5,
    )
    center = (head_pos.x, head_pos.y - 0.02, head_pos.z + 0.09)
    # Lupine Cranium
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=0.145, location=center)
    cranium = bpy.context.active_object
    cranium.scale = (1.05, 1.15, 1.02)
    cranium.data.materials.append(fur_mat)
    objs.append(cranium)

    # Elongated Snarling Wolf Snout
    bpy.ops.mesh.primitive_cone_add(
        vertices=20, radius1=0.095, radius2=0.048, depth=0.22,
        location=(center[0], center[1] - 0.16, center[2] - 0.02),
        rotation=(math.radians(82), 0, 0),
    )
    snout = bpy.context.active_object
    snout.data.materials.append(fur_mat)
    objs.append(snout)

    # Pointed Wolf Ears
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(
            vertices=12, radius1=0.038, radius2=0.004, depth=0.13,
            location=(center[0] + side * 0.095, center[1] + 0.02, center[2] + 0.155),
            rotation=(math.radians(-12), math.radians(side * 18), 0),
        )
        ear = bpy.context.active_object
        ear.data.materials.append(fur_mat)
        objs.append(ear)

    # Glowing Amber Predator Eyes
    eye_mat = make_pbr_mat(
        f"{name}_WolfEyeMat",
        color=(1.0, 0.65, 0.08, 1.0),
        emission=(1.0, 0.58, 0.05),
        emission_strength=6.8,
    )
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=10, radius=0.022,
            location=(center[0] + side * 0.052, center[1] - 0.135, center[2] + 0.032),
        )
        eye = bpy.context.active_object
        eye.data.materials.append(eye_mat)
        objs.append(eye)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# ---------------------------------------------------------------------------
# 5. BUILD ALL 4 CONSOLE-GRADE GLB BUNDLES (DRACO=FALSE)
# ---------------------------------------------------------------------------
def build_survivor_combat_rigs_glb(tex_map: dict):
    print("--- Building `survivor_combat_rigs.glb` (Real Mixamo Soldier + Michelle Rigs) ---")
    clear_scene()

    # 1. Male Survivor (`MaleSurvivor_Rig`) based on 7,325-vert Mixamo Soldier
    m_body, m_joints = import_and_pose_mixamo_character("Soldier.glb", "MaleSurvivor_Rig", scale_xyz=(1.0, 1.0, 1.0))
    m_body.data.materials.clear()
    m_body.data.materials.append(
        make_pbr_mat(
            "MaleSurvivorBodyPBR",
            image_path=tex_map["male_surv_diff"],
            normal_path=tex_map["soldier_norm"],
            roughness=0.48,
            metallic=0.12,
            normal_strength=1.25,
        )
    )
    katana_m = build_bushido_katana_mesh("Male_Bushido_Katana", m_joints["Hand_R"], is_plasma=False)
    attach_bone_weighted_part(m_body, katana_m, "Hand_R")
    bat_m = build_spiked_bat_back_prop("Male_Spiked_Bat", m_joints["Chest"])
    attach_bone_weighted_part(m_body, bat_m, "Chest")
    m_arm = finalize_character_armature("MaleSurvivor_Rig", m_body, m_joints)
    m_arm.location = (-1.5, 0, 0)

    # 2. Female Survivor (`FemaleSurvivor_Rig`) based on 16,340-vert Mixamo Michelle
    f_body, f_joints = import_and_pose_mixamo_character("Michelle.glb", "FemaleSurvivor_Rig", scale_xyz=(1.05, 1.05, 1.05))
    f_body.data.materials.clear()
    f_body.data.materials.append(
        make_pbr_mat(
            "FemaleSurvivorBodyPBR",
            image_path=tex_map["fem_surv_diff"],
            normal_path=tex_map["michelle_norm"],
            roughness=0.46,
            metallic=0.10,
            normal_strength=1.20,
        )
    )
    katana_f = build_bushido_katana_mesh("Female_Bushido_Katana", f_joints["Hand_R"], is_plasma=False)
    attach_bone_weighted_part(f_body, katana_f, "Hand_R")
    f_arm = finalize_character_armature("FemaleSurvivor_Rig", f_body, f_joints)
    f_arm.location = (1.5, 0, 0)

    out_path = os.path.join(OUT_DIR, "survivor_combat_rigs.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=False,
        export_skins=True,
        export_draco_mesh_compression_enable=False,
    )
    print(f"Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


def build_pumpkin_patch_cast_rigs_glb(tex_map: dict):
    print("--- Building `pumpkin_patch_cast_rigs.glb` (Real Mixamo Cast Rigs + Sculpted Heads & Gear) ---")
    clear_scene()

    # 1. Pumpkin Patch (`PumpkinPatch_Rig`) — Melvin Lester
    pp_body, pp_joints = import_and_pose_mixamo_character("Soldier.glb", "PumpkinPatch_Rig", scale_xyz=(1.04, 1.04, 1.04))
    pp_body.data.materials.clear()
    pp_body.data.materials.append(
        make_pbr_mat(
            "PumpkinPatchCoatPBR",
            image_path=tex_map["pp_body_diff"],
            normal_path=tex_map["soldier_norm"],
            roughness=0.36,
            metallic=0.18,
            normal_strength=1.3,
        )
    )
    pp_head = build_carved_pumpkin_head("PumpkinPatch_JackHead", pp_joints["Head"])
    attach_bone_weighted_part(pp_body, pp_head, "Head")
    pp_skirt = build_leather_duster_coat_skirt("PumpkinPatch_DusterSkirt", pp_joints["Hips"])
    attach_bone_weighted_part(pp_body, pp_skirt, "Hips")
    blade_r = build_bushido_katana_mesh("PP_PlasmaBlade_R", pp_joints["Hand_R"], is_plasma=True, plasma_color=(1.0, 0.45, 0.05))
    attach_bone_weighted_part(pp_body, blade_r, "Hand_R")
    blade_l = build_bushido_katana_mesh("PP_PlasmaBlade_L", pp_joints["Hand_L"], is_plasma=True, plasma_color=(1.0, 0.45, 0.05))
    attach_bone_weighted_part(pp_body, blade_l, "Hand_L")
    pp_arm = finalize_character_armature("PumpkinPatch_Rig", pp_body, pp_joints)
    pp_arm.location = (-4.5, 0, 0)

    # 2. Wicked Witch Miriam (`Miriam_Rig`)
    mir_body, mir_joints = import_and_pose_mixamo_character("Michelle.glb", "Miriam_Rig", scale_xyz=(1.05, 1.05, 1.05))
    mir_body.data.materials.clear()
    mir_body.data.materials.append(
        make_pbr_mat(
            "MiriamWitchPBR",
            image_path=tex_map["miriam_body_diff"],
            normal_path=tex_map["michelle_norm"],
            roughness=0.42,
            metallic=0.12,
            normal_strength=1.2,
        )
    )
    mir_hat = build_witch_hat_and_eyepatch("Miriam_WitchHat", mir_joints["Head"])
    attach_bone_weighted_part(mir_body, mir_hat, "Head")
    mir_cat = build_cyber_cat_familiar("Miriam_CyberCat", mir_joints["Chest"])
    attach_bone_weighted_part(mir_body, mir_cat, "Chest")
    mir_skirt = build_leather_duster_coat_skirt("Miriam_CoatSkirt", mir_joints["Hips"])
    attach_bone_weighted_part(mir_body, mir_skirt, "Hips")
    mir_arm = finalize_character_armature("Miriam_Rig", mir_body, mir_joints)
    mir_arm.location = (-1.5, 0, 0)

    # 3. Stitch the Scarecrow (`Stitch_Rig`)
    st_body, st_joints = import_and_pose_mixamo_character("Soldier.glb", "Stitch_Rig", scale_xyz=(1.02, 1.02, 1.03))
    st_body.data.materials.clear()
    st_body.data.materials.append(
        make_pbr_mat(
            "StitchScarecrowPBR",
            image_path=tex_map["stitch_body_diff"],
            normal_path=tex_map["soldier_norm"],
            roughness=0.78,
            metallic=0.05,
            normal_strength=1.4,
        )
    )
    st_head = build_scarecrow_hood_and_hat("Stitch_BurlapHead", st_joints["Head"])
    attach_bone_weighted_part(st_body, st_head, "Head")
    st_skirt = build_leather_duster_coat_skirt("Stitch_DusterSkirt", st_joints["Hips"])
    attach_bone_weighted_part(st_body, st_skirt, "Hips")
    st_blade = build_bushido_katana_mesh("Stitch_HarvestCleaver", st_joints["Hand_R"], is_plasma=False)
    attach_bone_weighted_part(st_body, st_blade, "Hand_R")
    st_arm = finalize_character_armature("Stitch_Rig", st_body, st_joints)
    st_arm.location = (1.5, 0, 0)

    # 4. Commander Crane / Robo-Bones (`RoboBones_Rig`) based on 28,374-vert Xbot Android
    rb_body, rb_joints = import_and_pose_mixamo_character("Xbot.glb", "RoboBones_Rig", scale_xyz=(1.02, 1.02, 1.02))
    rb_body.data.materials.clear()
    rb_body.data.materials.append(
        make_pbr_mat("RoboBonesJointsPBR", color=(0.12, 0.14, 0.18, 1.0), roughness=0.35, metallic=0.88)
    )
    rb_body.data.materials.append(
        make_pbr_mat(
            "RoboBonesChromeArmorPBR",
            color=(0.52, 0.56, 0.64, 1.0),
            roughness=0.24,
            metallic=0.92,
            image_path=os.path.join(TEXTURES_DIR, "dark_leather.jpg"),
        )
    )
    rb_head = build_robobones_skull_and_bowler("RoboBones_SkullHead", rb_joints["Head"])
    attach_bone_weighted_part(rb_body, rb_head, "Head")
    rb_skirt = build_leather_duster_coat_skirt("RoboBones_TrenchSkirt", rb_joints["Hips"])
    attach_bone_weighted_part(rb_body, rb_skirt, "Hips")
    rb_arm = finalize_character_armature("RoboBones_Rig", rb_body, rb_joints)
    rb_arm.location = (4.5, 0, 0)

    out_path = os.path.join(OUT_DIR, "pumpkin_patch_cast_rigs.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=False,
        export_skins=True,
        export_draco_mesh_compression_enable=False,
    )
    print(f"Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


def build_monsters_enemy_rigs_glb(tex_map: dict):
    print("--- Building `monsters_enemy_rigs.glb` (Zombie, Werewolf, Spectral Banshee Ghost) ---")
    clear_scene()

    # 1. Rotting Grindhouse Zombie (`Zombie_Rig`)
    z_body, z_joints = import_and_pose_mixamo_character("Soldier.glb", "Zombie_Rig", scale_xyz=(1.0, 1.0, 0.98))
    z_body.data.materials.clear()
    z_body.data.materials.append(
        make_pbr_mat(
            "ZombieDecayPBR",
            image_path=tex_map["zombie_body_diff"],
            normal_path=tex_map["soldier_norm"],
            roughness=0.76,
            metallic=0.05,
            normal_strength=1.45,
        )
    )
    z_arm = finalize_character_armature("Zombie_Rig", z_body, z_joints)
    z_arm.location = (-3.5, 0, 0)

    # 2. Hulking Lycanthrope Werewolf (`Werewolf_Rig`)
    w_body, w_joints = import_and_pose_mixamo_character("Xbot.glb", "Werewolf_Rig", scale_xyz=(1.24, 1.22, 1.15))
    w_body.data.materials.clear()
    fur_mat = make_pbr_mat(
        "WerewolfFurPBR",
        color=(0.15, 0.14, 0.17, 1.0),
        roughness=0.82,
        metallic=0.08,
        image_path=os.path.join(SHEETS_DIR, "monsters_sheet.png"),
        normal_strength=1.5,
    )
    w_body.data.materials.append(fur_mat)
    w_body.data.materials.append(fur_mat)
    w_head = build_werewolf_head_and_ears("Werewolf_SnoutHead", w_joints["Head"])
    attach_bone_weighted_part(w_body, w_head, "Head")
    w_arm = finalize_character_armature("Werewolf_Rig", w_body, w_joints)
    w_arm.location = (0.0, 0, 0)

    # 3. Spectral Banshee Ghost (`Ghost_Rig`)
    g_body, g_joints = import_and_pose_mixamo_character("Michelle.glb", "Ghost_Rig", scale_xyz=(1.04, 1.04, 1.06))
    g_body.data.materials.clear()
    ghost_mat = make_pbr_mat(
        "SpectralBansheePBR",
        color=(0.45, 0.96, 0.92, 0.78),
        roughness=0.18,
        metallic=0.1,
        emission=(0.24, 0.92, 0.88),
        emission_strength=2.6,
        alpha=0.78,
        normal_path=tex_map["michelle_norm"],
        normal_strength=1.1,
    )
    g_body.data.materials.append(ghost_mat)
    # Flowing spectral shroud around lower body
    bpy.ops.mesh.primitive_cone_add(
        vertices=28, radius1=0.38, radius2=0.16, depth=0.92,
        location=(g_joints["Hips"].x, g_joints["Hips"].y, g_joints["Hips"].z - 0.42),
    )
    shroud = bpy.context.active_object
    shroud.data.materials.append(ghost_mat)
    attach_bone_weighted_part(g_body, shroud, "Hips")
    g_arm = finalize_character_armature("Ghost_Rig", g_body, g_joints)
    g_arm.location = (3.5, 0, 0)

    out_path = os.path.join(OUT_DIR, "monsters_enemy_rigs.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=False,
        export_skins=True,
        export_draco_mesh_compression_enable=False,
    )
    print(f"Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


def build_haunted_castle_fortress_and_tank_glb():
    print("--- Building `haunted_castle_fortress.glb` (Armored War-Rig Tank + Gothic Bastions) ---")
    clear_scene()

    # 1. PumpkinPatch_Tank (High-detail Beveled Armored War-Rig Tank with 12 Road Wheels, Skull Grille & Rotary Turret)
    tank_root = bpy.data.objects.new("PumpkinPatch_Tank", None)
    bpy.context.collection.objects.link(tank_root)

    tank_tex = os.path.join(SHEETS_DIR, "tank_sheet.png")
    mat_armor = make_pbr_mat(
        "TankArmorPBR",
        color=(0.16, 0.18, 0.15, 1.0),
        roughness=0.44,
        metallic=0.78,
        image_path=tank_tex if os.path.exists(tank_tex) else None,
        normal_strength=1.2,
    )
    mat_dark_steel = make_pbr_mat("TankDarkSteelPBR", color=(0.08, 0.09, 0.11, 1.0), roughness=0.35, metallic=0.88)
    mat_tread = make_pbr_mat("TankTreadPBR", color=(0.05, 0.05, 0.06, 1.0), roughness=0.82, metallic=0.45)
    mat_brass = make_pbr_mat("TankBrassSkullPBR", color=(0.78, 0.58, 0.24, 1.0), roughness=0.26, metallic=0.92)
    mat_headlight = make_pbr_mat("TankHeadlightPBR", color=(1.0, 0.65, 0.15, 1.0), emission=(1.0, 0.58, 0.12), emission_strength=7.5)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.15))
    hull = bpy.context.active_object
    hull.scale = (3.4, 5.8, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    bev = hull.modifiers.new(name="Bevel", type="BEVEL")
    bev.width = 0.18
    bev.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    hull.data.materials.append(mat_armor)
    hull.parent = tank_root
    shade_smooth_obj(hull)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.35, 2.05))
    cab = bpy.context.active_object
    cab.scale = (2.85, 3.3, 0.85)
    bpy.ops.object.transform_apply(scale=True)
    bev2 = cab.modifiers.new(name="Bevel", type="BEVEL")
    bev2.width = 0.14
    bev2.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    cab.data.materials.append(mat_armor)
    cab.parent = tank_root
    shade_smooth_obj(cab)

    for side, s_lbl in ((-1, "L"), (1, "R")):
        tx = side * 1.92
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(tx, 0, 0.68))
        track = bpy.context.active_object
        track.scale = (0.72, 6.2, 1.12)
        bpy.ops.object.transform_apply(scale=True)
        b_tr = track.modifiers.new(name="Bevel", type="BEVEL")
        b_tr.width = 0.28
        b_tr.segments = 4
        bpy.ops.object.modifier_apply(modifier="Bevel")
        track.data.materials.append(mat_tread)
        track.parent = tank_root
        shade_smooth_obj(track)

        for w_idx in range(6):
            wy = -2.25 + w_idx * 0.90
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=24, radius=0.46, depth=0.78,
                location=(tx, wy, 0.52),
                rotation=(0, math.radians(90), 0),
            )
            wh = bpy.context.active_object
            wh.data.materials.append(mat_dark_steel)
            wh.parent = tank_root
            shade_smooth_obj(wh)

    # Skull Front Grille & Headlights
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=20, radius=0.52, location=(0, -3.02, 1.18))
    skull_grille = bpy.context.active_object
    skull_grille.scale = (0.95, 0.55, 0.92)
    skull_grille.data.materials.append(mat_brass)
    skull_grille.parent = tank_root
    shade_smooth_obj(skull_grille)

    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.22, location=(side * 1.18, -2.98, 1.48))
        hl = bpy.context.active_object
        hl.data.materials.append(mat_headlight)
        hl.parent = tank_root

    # Rotating Roof Turret with Triple Heavy Rotary Cannons
    turret_pivot = bpy.data.objects.new("Tank_Turret_Pivot", None)
    turret_pivot.location = (0, 0.25, 2.55)
    turret_pivot.parent = tank_root
    bpy.context.collection.objects.link(turret_pivot)

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.18, depth=0.68, location=(0, 0, 0.32))
    t_dome = bpy.context.active_object
    t_dome.data.materials.append(mat_armor)
    t_dome.parent = turret_pivot
    shade_smooth_obj(t_dome)

    for bx in (-0.38, 0.0, 0.38):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=20, radius=0.095, depth=3.2,
            location=(bx, -1.85, 0.38),
            rotation=(math.radians(90), 0, 0),
        )
        barrel = bpy.context.active_object
        barrel.data.materials.append(mat_dark_steel)
        barrel.parent = turret_pivot
        shade_smooth_obj(barrel)

    # 2. GothicCastle_Fortress (Corner Bastion Towers & Wrought-Iron Spire Roofs)
    castle_root = bpy.data.objects.new("GothicCastle_Fortress", None)
    bpy.context.collection.objects.link(castle_root)
    castle_root.location = (25.0, 0, 0)

    stone_tex = os.path.join(TEXTURES_DIR, "stone_wall_photo.jpg")
    if not os.path.exists(stone_tex):
        stone_tex = os.path.join(TEXTURES_DIR, "gothic_stone.png")
    roof_tex = os.path.join(TEXTURES_DIR, "wood_planks_roof.jpg")

    mat_stone = make_pbr_mat(
        "CastleStonePhotoPBR",
        color=(0.24, 0.22, 0.28, 1.0),
        roughness=0.78,
        image_path=stone_tex if os.path.exists(stone_tex) else None,
        normal_strength=1.5,
    )
    mat_roof = make_pbr_mat(
        "CastleSpireRoofPBR",
        color=(0.10, 0.09, 0.15, 1.0),
        roughness=0.52,
        metallic=0.25,
        image_path=roof_tex if os.path.exists(roof_tex) else None,
    )
    mat_win = make_pbr_mat(
        "CastleLancetGlowPBR",
        color=(1.0, 0.48, 0.14, 1.0),
        emission=(1.0, 0.42, 0.10),
        emission_strength=5.5,
    )

    bastion_coords = [(-22.5, -23.5), (22.5, -23.5), (-22.5, 23.5), (22.5, 23.5)]
    for idx, (bx, by) in enumerate(bastion_coords):
        bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=3.8, depth=26.0, location=(bx, by, 13.0))
        tw = bpy.context.active_object
        tw.name = f"Bastion_Tower_{idx}"
        tw.data.materials.append(mat_stone)
        tw.parent = castle_root
        shade_smooth_obj(tw)

        bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=4.5, radius2=0.12, depth=12.0, location=(bx, by, 32.0))
        sp = bpy.context.active_object
        sp.name = f"Bastion_Spire_{idx}"
        sp.data.materials.append(mat_roof)
        sp.parent = castle_root
        shade_smooth_obj(sp)

        for wz in (8.0, 16.0, 22.0):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by - 3.75 if by < 0 else by + 3.75, wz))
            w_obj = bpy.context.active_object
            w_obj.scale = (1.1, 0.3, 2.6)
            w_obj.data.materials.append(mat_win)
            w_obj.parent = castle_root

    out_path = os.path.join(OUT_DIR, "haunted_castle_fortress.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=False,
        export_draco_mesh_compression_enable=False,
    )
    print(f"Exported {out_path} ({os.path.getsize(out_path):,} bytes)")


if __name__ == "__main__":
    print("=== Starting Console-Grade Headless Blender 5.0.1 Asset Pipeline ===")
    prepare_photographic_environment_textures()
    tex_map = extract_and_grade_mixamo_textures()
    build_survivor_combat_rigs_glb(tex_map)
    build_pumpkin_patch_cast_rigs_glb(tex_map)
    build_monsters_enemy_rigs_glb(tex_map)
    build_haunted_castle_fortress_and_tank_glb()
    print("=== All Console-Grade GLBs & Photographic PBR Maps Generated Successfully! ===")
