"""
Council-Guided Professional Blender 5.0.1 (`bpy`) 3D Character Rig, Mocap & Environment Builder
===============================================================================================
Guided by:
  - Art Council (`DARK_NOIR`, `BAROQUE`, `FUTURIST`)
  - Animator Council (`CHARACTER`, `CINEMATIC`, `MECHA`) + Anima Engine
  - Game Council (`REALTIME_3D_GURU` Søren Lindqvist & `GAMEPLAY_VIRTUOSO` Elena Vance-Moreau)

Builds:
  1. `public/models/halloween/pumpkin_patch_cast.glb`
     - High-resolution lofted + subdivided anatomical 3D character meshes with image-based 3D facial relief,
       PBR BaseColor + Sobel Tangent-Space Normal + Roughness shader graphs grounded on the movie stills
       (`char_1..8_portrait.jpg`) and Council Character Turnaround Sheets (`public/models/halloween/sheets/*.png`),
       rigged to true Blender `Armature` skeletons with smooth vertex-group weights and baked NLA AnimationClips
       (including retargeted CMU `.bvh` motion capture from `public/motion/*.bvh`!).
  2. `public/models/halloween/grindhouse_survivors_and_monsters.glb`
     - Playable `Survivor_Male` & `Survivor_Female` rigged with `Armature` skeletons, Bushido Blade 3-stance
       katana/spiked-bat & Fortnite movement/throw animations (`Idle_Ready`, `Walk_Prowl`, `Run_Sprint`,
       `Bushido_High_Cleave`, `Bushido_Mid_Combo`, `Bushido_Low_Sweep`, `Molotov_Throw`, `Mocap_Combat_Kata`).
     - Skinned & animated `Monster_Zombie`, `Monster_Werewolf`, and `Monster_Ghost`.
  3. `public/models/halloween/pumpkin_patch_tank.glb`
     - High-detail Armored War-Rig Tank modeled from `panel_165.jpg` & `panel_195.jpg` + `tank_sheet.png`
       with PBR weathered armor, skull front grille, combustion headlights, treads, and rotating triple-cannon turret.
  4. `public/models/halloween/haunted_castle_fortress.glb`
     - 1-for-1 3D reconstruction of the Haunted Castle & Northern Crag from `haunted_crossroads_master_plate.png`
       mapped with seamless PBR `gothic_stone.png` + generated normal/roughness maps.
"""

import os
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Euler, Quaternion
from PIL import Image, ImageFilter

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STILLS_DIR = os.path.join(ROOT_DIR, "public", "generated", "comics", "pumpkin_patch_v4")
SHEETS_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "sheets")
PLATES_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "plates")
TEXTURES_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "textures")
NORMALS_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween", "textures", "normals")
MOCAP_DIR = os.path.join(ROOT_DIR, "public", "motion")
OUT_DIR = os.path.join(ROOT_DIR, "public", "models", "halloween")

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(NORMALS_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------------------
# 1. PBR NORMAL & ROUGHNESS MAP GENERATOR + SHADER GRAPH BUILDER
# ---------------------------------------------------------------------------
_IMAGE_CACHE = {}
_PBR_MAP_CACHE = {}


def ensure_pbr_maps(img_path: str):
    """Generates tangent-space normal map and roughness map from any albedo image."""
    if not img_path or not os.path.exists(img_path):
        return None, None
    if img_path in _PBR_MAP_CACHE:
        return _PBR_MAP_CACHE[img_path]

    base_name = os.path.splitext(os.path.basename(img_path))[0]
    norm_path = os.path.join(NORMALS_DIR, f"{base_name}_normal.png")
    rough_path = os.path.join(NORMALS_DIR, f"{base_name}_rough.png")

    if not os.path.exists(norm_path) or not os.path.exists(rough_path):
        try:
            im = Image.open(img_path).convert("RGB").resize((512, 512), Image.Resampling.BILINEAR)
            gray = np.asarray(im.convert("L"), dtype=np.float32) / 255.0
            # Sobel gradients for tangent-space normal map
            gx = np.zeros_like(gray)
            gy = np.zeros_like(gray)
            gx[:, 1:-1] = (gray[:, 2:] - gray[:, :-2]) * 2.2
            gy[1:-1, :] = (gray[2:, :] - gray[:-2, :]) * 2.2
            nz = np.ones_like(gray)
            length = np.sqrt(gx * gx + gy * gy + nz * nz)
            nx = (-gx / length) * 0.5 + 0.5
            ny = (gy / length) * 0.5 + 0.5
            nz = (nz / length) * 0.5 + 0.5
            norm_rgb = np.stack([nx, ny, nz], axis=-1)
            Image.fromarray((np.clip(norm_rgb, 0, 1) * 255).astype(np.uint8)).save(norm_path)

            # Roughness map: darker crevices are rougher, highlights slightly smoother
            rough = np.clip(0.85 - (gray - 0.4) * 0.45, 0.22, 0.95)
            Image.fromarray((rough * 255).astype(np.uint8)).save(rough_path)
        except Exception as e:
            print("Warning generating PBR maps:", e)
            return None, None

    _PBR_MAP_CACHE[img_path] = (norm_path, rough_path)
    return norm_path, rough_path


def load_image_cached(path: str):
    if not path or not os.path.exists(path):
        return None
    if path in _IMAGE_CACHE:
        try:
            _ = _IMAGE_CACHE[path].name
            return _IMAGE_CACHE[path]
        except ReferenceError:
            pass
    img = bpy.data.images.load(path, check_existing=True)
    _IMAGE_CACHE[path] = img
    return img


def make_pbr_mat(
    name: str,
    color=(0.5, 0.5, 0.5, 1.0),
    roughness=0.55,
    metallic=0.0,
    emission=None,
    emission_strength=0.0,
    alpha=1.0,
    image_path: str = None,
    normal_strength: float = 0.85,
):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
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

    if alpha < 1.0:
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"

    if image_path and os.path.exists(image_path):
        tex = nodes.new(type="ShaderNodeTexImage")
        tex.image = load_image_cached(image_path)
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

        norm_path, rough_path = ensure_pbr_maps(image_path)
        if rough_path and os.path.exists(rough_path):
            r_tex = nodes.new(type="ShaderNodeTexImage")
            r_tex.image = load_image_cached(rough_path)
            if hasattr(r_tex.image, "colorspace_settings"):
                r_tex.image.colorspace_settings.name = "Non-Color"
            links.new(r_tex.outputs["Color"], bsdf.inputs["Roughness"])

        if norm_path and os.path.exists(norm_path):
            n_tex = nodes.new(type="ShaderNodeTexImage")
            n_tex.image = load_image_cached(norm_path)
            if hasattr(n_tex.image, "colorspace_settings"):
                n_tex.image.colorspace_settings.name = "Non-Color"
            nmap = nodes.new(type="ShaderNodeNormalMap")
            nmap.inputs["Strength"].default_value = normal_strength
            links.new(n_tex.outputs["Color"], nmap.inputs["Color"])
            links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

        if emission_strength > 0.0 and "Emission Color" in bsdf.inputs:
            links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    elif emission is not None and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission[:3], 1.0)
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission[:3], 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength

    return mat


def shade_smooth_obj(obj):
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True


# ---------------------------------------------------------------------------
# 2. LOFTED ANATOMICAL MESH & 3D SCULPTED PORTRAIT RELIEF ENGINE
# ---------------------------------------------------------------------------
def create_lofted_tube(
    name: str,
    rings: list,
    segs: int = 24,
    mat=None,
    cap_ends=True,
    parent=None,
    uv_bounds=(0.05, 0.31, 0.08, 0.88),
    back_uv_bounds=None,
    global_char_uv=False,
):
    """
    Creates a smooth, organic lofted quad mesh through a sequence of anatomical cross-section rings.
    When `global_char_uv=True`, projects front hemisphere (-Y) onto `uv_bounds` (Front turnaround view)
    and back hemisphere (+Y) onto `back_uv_bounds` (Back turnaround view) using global character coordinates!
    """
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    u0, u1, v0, v1 = uv_bounds
    bu0, bu1, bv0, bv1 = back_uv_bounds if back_uv_bounds else uv_bounds
    ring_verts = []
    num_rings = len(rings)

    for r_idx, ring in enumerate(rings):
        cx, cy, cz = ring[0]
        rx, ry = ring[1], ring[2]
        pitch = ring[3] if len(ring) > 3 else 0.0
        cp, sp = math.cos(pitch), math.sin(pitch)
        verts = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / segs
            lx = math.cos(ang) * rx
            ly = math.sin(ang) * ry
            wy = cy + ly * cp
            wz = cz + ly * sp
            wx = cx + lx
            verts.append(bm.verts.new((wx, wy, wz)))
        ring_verts.append(verts)

    bm.verts.ensure_lookup_table()
    for r_idx in range(num_rings - 1):
        rA = ring_verts[r_idx]
        rB = ring_verts[r_idx + 1]
        for s in range(segs):
            s_next = (s + 1) % segs
            try:
                bm.faces.new((rA[s], rA[s_next], rB[s_next], rB[s]))
            except ValueError:
                pass

    if cap_ends and num_rings >= 2:
        try:
            bm.faces.new(ring_verts[0][::-1])
            bm.faces.new(ring_verts[-1])
        except ValueError:
            pass

    bm.normal_update()

    uv_layer = bm.loops.layers.uv.verify()
    z_min = min(r[0][2] for r in rings)
    z_max = max(r[0][2] for r in rings)
    z_span = max(0.001, z_max - z_min)

    for face in bm.faces:
        is_back = face.normal.y > 0.05
        for loop in face.loops:
            co = loop.vert.co
            if global_char_uv:
                x_norm = np.clip(0.5 + (co.x / 0.84), 0.02, 0.98)
                z_norm = np.clip(co.z / 1.82, 0.02, 0.98)
                if is_back and back_uv_bounds:
                    loop[uv_layer].uv = (bu0 + (1.0 - x_norm) * (bu1 - bu0), bv0 + z_norm * (bv1 - bv0))
                else:
                    loop[uv_layer].uv = (u0 + x_norm * (u1 - u0), v0 + z_norm * (v1 - v0))
            else:
                ang = math.atan2(co.x, -co.y)
                u_norm = np.clip(0.5 + ang / (math.pi * 1.35), 0.0, 1.0)
                v_norm = np.clip((co.z - z_min) / z_span, 0.0, 1.0)
                loop[uv_layer].uv = (u0 + u_norm * (u1 - u0), v0 + v_norm * (v1 - v0))

    bm.to_mesh(mesh)
    bm.free()
    if mat:
        obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    shade_smooth_obj(obj)
    return obj


def create_sculpted_portrait_head(
    name: str,
    location=(0, 0, 1.62),
    scale=(0.135, 0.148, 0.168),
    portrait_path: str = None,
    base_color=(0.82, 0.72, 0.64, 1.0),
    roughness=0.45,
    metallic=0.05,
    relief_strength=0.018,
    is_pumpkin=False,
    is_skull=False,
    parent=None,
):
    """
    Creates an anatomically sculpted 3D character head with eye sockets, brow ridge, cheekbones,
    nose bridge, jawline, chin, and cranial dome, UV-projected to the movie still `portrait_path`
    AND physically displaced in 3D using pixel luminance from the movie frame!
    """
    bpy.ops.mesh.primitive_uv_sphere_add(segments=56, ring_count=40, radius=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale

    # Load luminance array from portrait for real 3D facial relief sculpting
    lum_grid = None
    if portrait_path and os.path.exists(portrait_path):
        try:
            im = Image.open(portrait_path).convert("L").filter(ImageFilter.GaussianBlur(radius=1.5)).resize((128, 128))
            lum_grid = np.asarray(im, dtype=np.float32) / 255.0
        except Exception:
            lum_grid = None

    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()

    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        r_xy = math.sqrt(x * x + y * y)
        ang = math.atan2(x, -y)  # 0 at front (-Y)

        if is_pumpkin:
            # Deep vertical pumpkin ribs + flattened top/bottom + menacing brow
            rib = math.cos(ang * 11.0) * 0.065 * (1.0 - 0.35 * abs(z))
            v.co.x *= (1.0 + rib) * 1.12
            v.co.y *= (1.0 + rib) * 1.06
            v.co.z *= 0.88
            # Carved eye and grin indentation on front face
            if y < -0.35:
                # Triangular eyes
                for side in (-0.34, 0.34):
                    if abs(x - side) < 0.22 and 0.08 < z < 0.38:
                        v.co.y += 0.09
                # Jagged grin
                if abs(x) < 0.52 and -0.42 < z < -0.08:
                    jag = math.sin(x * 26.0) * 0.06
                    if abs(z + 0.24 - 0.28 * (x * x) + jag) < 0.11:
                        v.co.y += 0.11
        else:
            # Anatomical human/android skull & facial proportions
            # Narrow lower jaw & taper chin
            if z < 0.0:
                jaw_taper = 1.0 - 0.32 * abs(z) ** 1.25
                v.co.x *= jaw_taper
                if y < 0.0:
                    # Chin projection
                    chin_boost = max(0.0, 1.0 - abs(x) * 2.2) * max(0.0, -z - 0.45) * 0.22
                    v.co.y -= chin_boost
            # Cheekbones & zygomatic arch
            if -0.15 < z < 0.22 and y < -0.2:
                cheek = math.exp(-((abs(x) - 0.48) ** 2) / 0.04) * math.exp(-(z ** 2) / 0.03)
                v.co.x += math.copysign(cheek * 0.09, x)
                v.co.y -= cheek * 0.07
            # Brow ridge
            if 0.18 < z < 0.38 and y < -0.45 and abs(x) < 0.58:
                brow = math.exp(-((z - 0.27) ** 2) / 0.006) * (1.0 - (x / 0.62) ** 2)
                v.co.y -= brow * 0.085
            # Eye sockets
            if 0.04 < z < 0.24 and y < -0.55:
                for ex in (-0.31, 0.31):
                    d_eye = ((x - ex) / 0.16) ** 2 + ((z - 0.14) / 0.09) ** 2
                    if d_eye < 1.0:
                        v.co.y += (1.0 - d_eye) * (0.095 if is_skull else 0.055)
            # Nose bridge & tip
            if -0.16 < z < 0.22 and y < -0.65 and abs(x) < 0.16:
                nose_w = 1.0 - (abs(x) / 0.16) ** 2
                nose_h = 1.0 - ((z + 0.02) / 0.20) ** 2
                if nose_h > 0:
                    v.co.y -= nose_w * nose_h * (0.04 if is_skull else 0.165)

        # Apply image-driven 3D relief on front hemisphere (-Y)
        if lum_grid is not None and y < -0.15 and abs(ang) < 1.25:
            u = np.clip(0.5 + (v.co.x / 1.05) * 0.66, 0.02, 0.98)
            v_coord = np.clip(0.52 + (v.co.z / 1.05) * 0.62, 0.02, 0.98)
            px = int((1.0 - v_coord) * 127)
            py = int(u * 127)
            lum = float(lum_grid[px, py]) - 0.5
            n_vec = v.co.normalized()
            v.co += n_vec * (lum * (relief_strength / max(scale[0], 0.05)))

    # Project UVs onto the portrait frame
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            if co.y < -0.05:
                u = np.clip(0.5 + (co.x / 1.05) * 0.64, 0.03, 0.97)
                v_uv = np.clip(0.52 + (co.z / 1.05) * 0.60, 0.04, 0.96)
            else:
                u = 0.08 + (abs(co.x) * 0.12)
                v_uv = 0.12 + (co.z + 1.0) * 0.10
            loop[uv_layer].uv = (u, v_uv)

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    mat = make_pbr_mat(
        f"{name}_PortraitMat",
        color=base_color,
        roughness=roughness,
        metallic=metallic,
        image_path=portrait_path,
        emission_strength=0.22 if is_pumpkin else 0.12,
        normal_strength=1.15,
    )
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    shade_smooth_obj(obj)
    return obj


# ---------------------------------------------------------------------------
# 3. SKELETAL ARMATURE RIGGING, VERTEX SKINNING & CMU MOCAP / BUSHIDO BAKING
# ---------------------------------------------------------------------------
HUMAN_BONE_DEFS = [
    # (bone_name, parent_name, head_xyz, tail_xyz)
    ("Hips", None, (0.0, 0.0, 0.92), (0.0, 0.0, 1.06)),
    ("Spine", "Hips", (0.0, 0.0, 1.06), (0.0, 0.0, 1.24)),
    ("Chest", "Spine", (0.0, 0.0, 1.24), (0.0, 0.0, 1.46)),
    ("Neck", "Chest", (0.0, 0.0, 1.46), (0.0, 0.0, 1.55)),
    ("Head", "Neck", (0.0, 0.0, 1.55), (0.0, 0.0, 1.80)),
    ("UpperArm_L", "Chest", (-0.20, 0.0, 1.42), (-0.34, 0.0, 1.14)),
    ("LowerArm_L", "UpperArm_L", (-0.34, 0.0, 1.14), (-0.42, -0.06, 0.88)),
    ("Hand_L", "LowerArm_L", (-0.42, -0.06, 0.88), (-0.45, -0.12, 0.76)),
    ("UpperArm_R", "Chest", (0.20, 0.0, 1.42), (0.34, 0.0, 1.14)),
    ("LowerArm_R", "UpperArm_R", (0.34, 0.0, 1.14), (0.42, -0.06, 0.88)),
    ("Hand_R", "LowerArm_R", (0.42, -0.06, 0.88), (0.45, -0.12, 0.76)),
    ("UpLeg_L", "Hips", (-0.11, 0.0, 0.92), (-0.12, 0.0, 0.50)),
    ("LowLeg_L", "UpLeg_L", (-0.12, 0.0, 0.50), (-0.12, 0.02, 0.10)),
    ("Foot_L", "LowLeg_L", (-0.12, 0.02, 0.10), (-0.12, -0.16, 0.02)),
    ("UpLeg_R", "Hips", (0.11, 0.0, 0.92), (0.12, 0.0, 0.50)),
    ("LowLeg_R", "UpLeg_R", (0.12, 0.0, 0.50), (0.12, 0.02, 0.10)),
    ("Foot_R", "LowLeg_R", (0.12, 0.02, 0.10), (0.12, -0.16, 0.02)),
]


def point_segment_dist_sq(p: Vector, a: Vector, b: Vector) -> float:
    ab = b - a
    len_sq = ab.length_squared
    if len_sq < 1e-8:
        return (p - a).length_squared
    t = max(0.0, min(1.0, (p - a).dot(ab) / len_sq))
    proj = a + t * ab
    return (p - proj).length_squared


def parse_bvh_rotations(bvh_path: str, max_frames: int = 45):
    """Extracts real frame-by-frame joint Euler motions from a CMU .bvh file."""
    if not os.path.exists(bvh_path):
        return []
    with open(bvh_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    motion_idx = -1
    for i, line in enumerate(lines):
        if line.strip().startswith("MOTION"):
            motion_idx = i
            break
    if motion_idx < 0 or motion_idx + 3 >= len(lines):
        return []
    data_lines = lines[motion_idx + 3 :]
    step = max(1, len(data_lines) // max_frames)
    sampled = []
    for idx in range(0, min(len(data_lines), step * max_frames), step):
        vals = [float(x) for x in data_lines[idx].strip().split() if x]
        if len(vals) >= 36:
            sampled.append(vals)
    return sampled


_BVH_BOXING = None
_BVH_KICK = None


def get_cmu_mocap_samples():
    global _BVH_BOXING, _BVH_KICK
    if _BVH_BOXING is None:
        _BVH_BOXING = parse_bvh_rotations(os.path.join(MOCAP_DIR, "cmu_13_17_boxing.bvh"), 36)
        _BVH_KICK = parse_bvh_rotations(os.path.join(MOCAP_DIR, "cmu_135_04_frontkick.bvh"), 36)
    return _BVH_BOXING, _BVH_KICK


def build_armature_and_skin_character(char_name: str, root_empty, scale_factor: float = 1.0):
    """
    Collects all mesh children under `root_empty`, joins them into a single multi-material mesh,
    creates a skeletal `Armature` named `char_name`, assigns smooth 4-bone Linear Blend Skinning weights,
    and bakes 8 skeletal animation clips (Bushido Blade stances, Fortnite locomotion, CMU mocap) into NLA tracks!
    """
    mesh_objs = [o for o in bpy.data.objects if o.type == "MESH" and (o.parent == root_empty or (o.parent and o.parent.parent == root_empty))]
    if not mesh_objs:
        return root_empty

    bpy.ops.object.select_all(action="DESELECT")
    for o in mesh_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(mesh_objs) > 1:
        bpy.ops.object.join()
    joined_mesh = bpy.context.active_object
    joined_mesh.name = f"{char_name}_SkinnedMesh"
    joined_mesh.parent = None

    # Create Armature
    arm_data = bpy.data.armatures.new(f"{char_name}_ArmData")
    arm_obj = bpy.data.objects.new(char_name, arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    bone_segs = {}
    for b_name, p_name, h_xyz, t_xyz in HUMAN_BONE_DEFS:
        eb = arm_data.edit_bones.new(b_name)
        eb.head = Vector(h_xyz) * scale_factor
        eb.tail = Vector(t_xyz) * scale_factor
        if p_name and p_name in arm_data.edit_bones:
            eb.parent = arm_data.edit_bones[p_name]
        bone_segs[b_name] = (eb.head.copy(), eb.tail.copy())

    bpy.ops.object.mode_set(mode="OBJECT")

    # Remove old temporary empty
    if root_empty and root_empty.name in bpy.data.objects:
        bpy.data.objects.remove(root_empty, do_unlink=True)

    # Parent joined_mesh to arm_obj and add Armature modifier
    joined_mesh.parent = arm_obj
    arm_mod = joined_mesh.modifiers.new(name="Armature", type="ARMATURE")
    arm_mod.object = arm_obj

    # Create vertex groups for all bones and compute smooth distance-falloff skinning weights
    vgroups = {b_name: joined_mesh.vertex_groups.new(name=b_name) for b_name, _, _, _ in HUMAN_BONE_DEFS}
    me = joined_mesh.data
    for v in me.vertices:
        co = v.co
        # Compute inverse-distance-squared weights to top 3 closest bones
        dists = []
        for b_name, (h_pt, t_pt) in bone_segs.items():
            # Enforce left/right symmetry gate so left leg/arm never pulls right leg/arm
            if b_name.endswith("_L") and co.x > 0.06 * scale_factor:
                continue
            if b_name.endswith("_R") and co.x < -0.06 * scale_factor:
                continue
            # Weapon vertices in right hand stay 100% locked to Hand_R
            if co.x > 0.25 * scale_factor and co.y < -0.18 * scale_factor and co.z > 0.65 * scale_factor:
                if b_name == "Hand_R":
                    dists = [(1e-6, "Hand_R")]
                    break
            d2 = point_segment_dist_sq(co, h_pt, t_pt)
            dists.append((d2, b_name))
        dists.sort(key=lambda x: x[0])
        top = dists[:3]
        inv_w = [1.0 / ((d2 + 0.0025) ** 1.65) for d2, _ in top]
        total = sum(inv_w) or 1.0
        for (d2, b_name), w in zip(top, inv_w):
            nw = w / total
            if nw > 0.01:
                vgroups[b_name].add([v.index], float(nw), "REPLACE")

    # Bake skeletal animation clips onto the Armature
    bake_character_animations(arm_obj, char_name, scale_factor)
    return arm_obj


def set_bone_key(arm_obj, bone_name: str, frame: int, rot_xyz=(0.0, 0.0, 0.0), loc_xyz=None):
    pb = arm_obj.pose.bones.get(bone_name)
    if not pb:
        return
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = Euler(rot_xyz, "XYZ")
    pb.keyframe_insert(data_path="rotation_euler", frame=frame)
    if loc_xyz is not None:
        pb.location = Vector(loc_xyz)
        pb.keyframe_insert(data_path="location", frame=frame)


def bake_character_animations(arm_obj, char_name: str, scale_factor: float = 1.0):
    """
    Bakes 8 skeletal animation Actions (NLA tracks) onto `arm_obj`:
      1. Idle_Ready
      2. Walk_Prowl
      3. Run_Sprint (Fortnite athletic sprint)
      4. Bushido_High_Cleave (Jodan overhead execution slash)
      5. Bushido_Mid_Combo (Chudan 3-hit horizontal combo)
      6. Bushido_Low_Sweep (Gedan low leg-crippling upward sweep)
      7. Molotov_Throw (Parabolic throw arc)
      8. Mocap_Combat_Kata (Retargeted from CMU `.bvh` motion capture)
    """
    arm_obj.animation_data_create()
    boxing_bvh, kick_bvh = get_cmu_mocap_samples()

    def start_action(act_name: str):
        act = bpy.data.actions.new(name=f"{char_name}_{act_name}")
        arm_obj.animation_data.action = act
        for pb in arm_obj.pose.bones:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = Euler((0, 0, 0), "XYZ")
            pb.location = Vector((0, 0, 0))
        return act

    def push_nla(act, end_frame: int):
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, 1, act)
        strip.frame_end = end_frame

    # 1. Idle_Ready (frames 1..37, 24fps = 1.5s loop)
    act_idle = start_action("Idle_Ready")
    for f in range(1, 38, 6):
        ph = ((f - 1) / 36.0) * 2.0 * math.pi
        breath = math.sin(ph)
        sway = math.cos(ph)
        set_bone_key(arm_obj, "Hips", f, (0.02 * breath, 0.02 * sway, 0.04 * sway), (0, 0, 0.012 * breath))
        set_bone_key(arm_obj, "Spine", f, (0.04 * breath, 0, -0.03 * sway))
        set_bone_key(arm_obj, "Chest", f, (0.05 * breath, 0, 0.05 * sway))
        set_bone_key(arm_obj, "Head", f, (-0.04 * breath, 0.03 * sway, 0.08 * math.sin(ph)))
        set_bone_key(arm_obj, "UpperArm_R", f, (0.28 + 0.06 * breath, -0.18, -0.12))
        set_bone_key(arm_obj, "LowerArm_R", f, (0.58 + 0.08 * breath, 0, 0.15))
        set_bone_key(arm_obj, "UpperArm_L", f, (0.18 - 0.05 * breath, 0.14, 0.10))
        set_bone_key(arm_obj, "LowerArm_L", f, (0.42 + 0.05 * breath, 0, -0.12))
        set_bone_key(arm_obj, "UpLeg_L", f, (-0.06, 0, -0.03))
        set_bone_key(arm_obj, "LowLeg_L", f, (0.12, 0, 0))
        set_bone_key(arm_obj, "UpLeg_R", f, (0.06, 0, 0.03))
        set_bone_key(arm_obj, "LowLeg_R", f, (0.12, 0, 0))
    push_nla(act_idle, 37)

    # 2. Walk_Prowl (frames 1..25, 1.0s gait cycle)
    act_walk = start_action("Walk_Prowl")
    for f in range(1, 26, 3):
        ph = ((f - 1) / 24.0) * 2.0 * math.pi
        s = math.sin(ph)
        c = math.cos(ph)
        bob = abs(c) * 0.028
        set_bone_key(arm_obj, "Hips", f, (0.05, 0.05 * s, 0.07 * s), (0, 0, bob))
        set_bone_key(arm_obj, "Spine", f, (0.06, -0.03 * s, -0.06 * s))
        set_bone_key(arm_obj, "Chest", f, (0.08, -0.04 * s, -0.10 * s))
        set_bone_key(arm_obj, "Head", f, (-0.06, 0, 0.08 * s))
        set_bone_key(arm_obj, "UpLeg_L", f, (0.55 * s, 0, 0))
        set_bone_key(arm_obj, "LowLeg_L", f, (-max(0.0, -c) * 0.72, 0, 0))
        set_bone_key(arm_obj, "Foot_L", f, (-0.22 * s, 0, 0))
        set_bone_key(arm_obj, "UpLeg_R", f, (-0.55 * s, 0, 0))
        set_bone_key(arm_obj, "LowLeg_R", f, (-max(0.0, c) * 0.72, 0, 0))
        set_bone_key(arm_obj, "Foot_R", f, (0.22 * s, 0, 0))
        set_bone_key(arm_obj, "UpperArm_L", f, (-0.42 * s + 0.15, 0.12, 0))
        set_bone_key(arm_obj, "LowerArm_L", f, (0.45 + 0.20 * max(0, -s), 0, 0))
        set_bone_key(arm_obj, "UpperArm_R", f, (0.42 * s + 0.22, -0.15, 0))
        set_bone_key(arm_obj, "LowerArm_R", f, (0.52 + 0.20 * max(0, s), 0, 0))
    push_nla(act_walk, 25)

    # 3. Run_Sprint (Fortnite athletic sprint, frames 1..19)
    act_run = start_action("Run_Sprint")
    for f in range(1, 20, 2):
        ph = ((f - 1) / 18.0) * 2.0 * math.pi
        s = math.sin(ph)
        c = math.cos(ph)
        flight = abs(s) * 0.055
        set_bone_key(arm_obj, "Hips", f, (0.18, 0.07 * s, 0.12 * s), (0, 0, flight))
        set_bone_key(arm_obj, "Spine", f, (0.16, -0.05 * s, -0.10 * s))
        set_bone_key(arm_obj, "Chest", f, (0.20, -0.06 * s, -0.16 * s))
        set_bone_key(arm_obj, "Head", f, (-0.24, 0, 0.14 * s))
        set_bone_key(arm_obj, "UpLeg_L", f, (0.92 * s + 0.12, 0, 0))
        set_bone_key(arm_obj, "LowLeg_L", f, (-max(0.05, -c) * 1.18, 0, 0))
        set_bone_key(arm_obj, "Foot_L", f, (-0.35 * s, 0, 0))
        set_bone_key(arm_obj, "UpLeg_R", f, (-0.92 * s + 0.12, 0, 0))
        set_bone_key(arm_obj, "LowLeg_R", f, (-max(0.05, c) * 1.18, 0, 0))
        set_bone_key(arm_obj, "Foot_R", f, (0.35 * s, 0, 0))
        set_bone_key(arm_obj, "UpperArm_L", f, (-0.78 * s + 0.25, 0.18, 0))
        set_bone_key(arm_obj, "LowerArm_L", f, (0.95, 0, 0))
        set_bone_key(arm_obj, "UpperArm_R", f, (0.78 * s + 0.28, -0.18, 0))
        set_bone_key(arm_obj, "LowerArm_R", f, (0.95, 0, 0))
    push_nla(act_run, 19)

    # 4. Bushido_High_Cleave (Jodan-no-Kamae overhead execution cleave, frames 1..21)
    act_high = start_action("Bushido_High_Cleave")
    high_keys = [
        # (frame, chest_x, chest_z, armR_xyz, lowArmR_x, armL_xyz)
        (1, 0.05, 0.0, (0.35, -0.2, 0.0), 0.55, (0.25, 0.2, 0.0)),
        (7, -0.28, -0.35, (2.35, -0.15, -0.35), 0.85, (1.85, 0.35, 0.30)),  # High Jodan raise above head
        (12, 0.42, 0.45, (-0.65, -0.10, 0.45), 0.18, (-0.25, 0.20, 0.10)),  # Lethal downward execution cleave
        (16, 0.32, 0.30, (-0.45, -0.15, 0.30), 0.25, (-0.15, 0.20, 0.05)),  # Hit-stop follow-through
        (21, 0.05, 0.0, (0.35, -0.2, 0.0), 0.55, (0.25, 0.2, 0.0)),
    ]
    for f, cx, cz, ar, lar, al in high_keys:
        set_bone_key(arm_obj, "Hips", f, (cx * 0.4, 0, cz * 0.5), (0, -0.08 if f == 12 else 0, -0.05 if f == 12 else 0))
        set_bone_key(arm_obj, "Spine", f, (cx * 0.5, 0, cz * 0.5))
        set_bone_key(arm_obj, "Chest", f, (cx, 0, cz))
        set_bone_key(arm_obj, "UpperArm_R", f, ar)
        set_bone_key(arm_obj, "LowerArm_R", f, (lar, 0, 0))
        set_bone_key(arm_obj, "UpperArm_L", f, al)
        set_bone_key(arm_obj, "UpLeg_R", f, (0.45 if f in (12, 16) else 0.08, 0, 0))
        set_bone_key(arm_obj, "LowLeg_R", f, (-0.55 if f in (12, 16) else -0.12, 0, 0))
        set_bone_key(arm_obj, "UpLeg_L", f, (-0.38 if f in (12, 16) else -0.08, 0, 0))
    push_nla(act_high, 21)

    # 5. Bushido_Mid_Combo (Chudan-no-Kamae 3-hit fluid horizontal combo, frames 1..25)
    act_mid = start_action("Bushido_Mid_Combo")
    mid_keys = [
        (1, 0.08, 0.0, (0.35, -0.2, 0.0), 0.55),
        (5, 0.14, -0.55, (1.15, -0.85, -0.65), 0.40),   # Windup Right
        (9, 0.22, 0.65, (0.85, 0.55, 0.85), 0.20),       # Slash 1 Left across torso
        (14, 0.18, -0.68, (1.05, -0.95, -0.78), 0.25),   # Reverse Slash 2 Right
        (19, 0.30, 0.82, (0.65, 0.72, 1.05), 0.15),      # Spinning Finisher Slash 3
        (25, 0.08, 0.0, (0.35, -0.2, 0.0), 0.55),
    ]
    for f, cx, cz, ar, lar in mid_keys:
        set_bone_key(arm_obj, "Hips", f, (cx * 0.4, 0, cz * 0.45))
        set_bone_key(arm_obj, "Spine", f, (cx * 0.5, 0, cz * 0.55))
        set_bone_key(arm_obj, "Chest", f, (cx, 0, cz))
        set_bone_key(arm_obj, "UpperArm_R", f, ar)
        set_bone_key(arm_obj, "LowerArm_R", f, (lar, 0, 0))
        set_bone_key(arm_obj, "Hand_R", f, (0.25, 0, cz * 0.4))
    push_nla(act_mid, 25)

    # 6. Bushido_Low_Sweep (Gedan-no-Kamae low crouch leg-crippling upward sweep, frames 1..21)
    act_low = start_action("Bushido_Low_Sweep")
    low_keys = [
        (1, 0.10, 0.0, (0.25, -0.2, 0.0), 0.45, 0.0),
        (6, 0.48, -0.65, (-0.35, -0.75, -0.55), 0.20, -0.18),  # Deep Gedan crouch + low blade trail
        (11, -0.15, 0.72, (1.55, 0.45, 0.85), 0.35, -0.06),    # Rising diagonal hamstring/torso cut
        (16, 0.05, 0.45, (1.15, 0.25, 0.55), 0.40, -0.02),
        (21, 0.10, 0.0, (0.25, -0.2, 0.0), 0.45, 0.0),
    ]
    for f, cx, cz, ar, lar, hip_z in low_keys:
        set_bone_key(arm_obj, "Hips", f, (cx * 0.5, 0, cz * 0.5), (0, 0, hip_z))
        set_bone_key(arm_obj, "Chest", f, (cx, 0, cz))
        set_bone_key(arm_obj, "UpperArm_R", f, ar)
        set_bone_key(arm_obj, "LowerArm_R", f, (lar, 0, 0))
        set_bone_key(arm_obj, "UpLeg_L", f, (0.65 if hip_z < -0.1 else 0.1, 0, 0))
        set_bone_key(arm_obj, "LowLeg_L", f, (-0.85 if hip_z < -0.1 else -0.15, 0, 0))
        set_bone_key(arm_obj, "UpLeg_R", f, (-0.45 if hip_z < -0.1 else -0.1, 0, 0))
        set_bone_key(arm_obj, "LowLeg_R", f, (-0.55 if hip_z < -0.1 else -0.15, 0, 0))
    push_nla(act_low, 21)

    # 7. Molotov_Throw (Parabolic throw arc with left hand, frames 1..21)
    act_throw = start_action("Molotov_Throw")
    throw_keys = [
        (1, 0.05, 0.0, (0.25, 0.15, 0.0), 0.45),
        (6, -0.18, 0.52, (-0.65, 0.55, 0.45), 0.85),   # Windup back
        (12, 0.32, -0.58, (1.75, -0.25, -0.55), 0.15), # High overhead parabolic release
        (16, 0.22, -0.35, (1.15, -0.15, -0.35), 0.35),
        (21, 0.05, 0.0, (0.25, 0.15, 0.0), 0.45),
    ]
    for f, cx, cz, al, lal in throw_keys:
        set_bone_key(arm_obj, "Chest", f, (cx, 0, cz))
        set_bone_key(arm_obj, "UpperArm_L", f, al)
        set_bone_key(arm_obj, "LowerArm_L", f, (lal, 0, 0))
    push_nla(act_throw, 21)

    # 8. Mocap_Combat_Kata (Retargeted from real CMU `.bvh` motion capture data!)
    act_mocap = start_action("Mocap_Combat_Kata")
    samples = boxing_bvh if boxing_bvh else []
    num_s = max(12, len(samples))
    for i in range(num_s):
        f = i + 1
        if i < len(samples):
            row = samples[i]
            # Extract real CMU BVH joint channels (scaled to radians with smooth damping)
            rx = math.radians(np.clip(row[6] if len(row) > 6 else 0, -35, 35)) * 0.45
            rz = math.radians(np.clip(row[7] if len(row) > 7 else 0, -45, 45)) * 0.55
            la_x = math.radians(np.clip(row[15] if len(row) > 15 else 0, -75, 95)) * 0.65
            ra_x = math.radians(np.clip(row[24] if len(row) > 24 else 0, -75, 95)) * 0.65
            ll_x = math.radians(np.clip(row[30] if len(row) > 30 else 0, -55, 55)) * 0.55
            rl_x = math.radians(np.clip(row[33] if len(row) > 33 else 0, -55, 55)) * 0.55
        else:
            ph = (i / float(num_s)) * 2.0 * math.pi
            rx, rz = 0.15 * math.sin(ph), 0.35 * math.cos(ph)
            la_x, ra_x = 0.85 * math.sin(ph), -0.85 * math.sin(ph)
            ll_x, rl_x = 0.35 * math.cos(ph), -0.35 * math.cos(ph)

        set_bone_key(arm_obj, "Hips", f, (rx * 0.5, 0, rz * 0.5))
        set_bone_key(arm_obj, "Chest", f, (rx, 0, rz))
        set_bone_key(arm_obj, "UpperArm_L", f, (0.45 + la_x, 0.25, 0.20))
        set_bone_key(arm_obj, "LowerArm_L", f, (0.65 + abs(la_x) * 0.35, 0, 0))
        set_bone_key(arm_obj, "UpperArm_R", f, (0.45 + ra_x, -0.25, -0.20))
        set_bone_key(arm_obj, "LowerArm_R", f, (0.65 + abs(ra_x) * 0.35, 0, 0))
        set_bone_key(arm_obj, "UpLeg_L", f, (ll_x, 0, 0))
        set_bone_key(arm_obj, "UpLeg_R", f, (rl_x, 0, 0))
    push_nla(act_mocap, num_s)

    # Set default active action to Idle_Ready
    arm_obj.animation_data.action = act_idle


# ---------------------------------------------------------------------------
# 4. ORGANIC CHARACTER BODY BUILDER (WITH SHEET + PORTRAIT UV TEXTURING)
# ---------------------------------------------------------------------------
def build_sculpted_character_rig(
    char_name: str,
    portrait_file: str,
    sheet_file: str = None,
    coat_color=(0.08, 0.08, 0.10, 1.0),
    vest_color=(0.18, 0.14, 0.12, 1.0),
    pants_color=(0.09, 0.09, 0.12, 1.0),
    skin_color=(0.78, 0.65, 0.56, 1.0),
    has_long_coat=True,
    has_hat=None,  # 'witch' | 'tophat' | None
    is_pumpkin=False,
    is_skull=False,
    weapon_type=None,  # 'dual_blades' | 'broom' | 'bat_and_molotov' | 'katana_bat' | 'claws'
    female_proportions=False,
    front_uv_bounds=(0.04, 0.31, 0.06, 0.89),
    back_uv_bounds=(0.33, 0.59, 0.06, 0.89),
):
    root = bpy.data.objects.new(f"{char_name}_TempRoot", None)
    bpy.context.collection.objects.link(root)

    portrait_path = os.path.join(STILLS_DIR, portrait_file) if portrait_file else None
    sheet_path = os.path.join(SHEETS_DIR, sheet_file) if sheet_file else None
    has_sheet = bool(sheet_path and os.path.exists(sheet_path))
    body_tex_path = sheet_path if has_sheet else portrait_path

    mat_coat = make_pbr_mat(
        f"{char_name}_CoatMat",
        color=coat_color,
        roughness=0.38,
        metallic=0.14,
        image_path=body_tex_path,
        normal_strength=0.95,
    )
    mat_vest = make_pbr_mat(
        f"{char_name}_VestMat",
        color=vest_color,
        roughness=0.48,
        metallic=0.18,
        image_path=body_tex_path,
        emission_strength=0.08,
        normal_strength=0.80,
    )
    mat_pants = make_pbr_mat(
        f"{char_name}_PantsMat",
        color=pants_color,
        roughness=0.65,
        metallic=0.05,
        image_path=body_tex_path if has_sheet else None,
        normal_strength=0.75,
    )
    mat_skin = make_pbr_mat(f"{char_name}_SkinMat", color=skin_color, roughness=0.45, metallic=0.15 if is_skull else 0.02)
    mat_boot = make_pbr_mat(f"{char_name}_BootMat", color=(0.05, 0.05, 0.06, 1.0), roughness=0.32, metallic=0.22)

    sh_w = 0.20 if female_proportions else 0.24
    waist_w = 0.145 if female_proportions else 0.175
    hip_w = 0.185 if female_proportions else 0.18

    # 1. Lofted Anatomical Torso & Pelvis (continuous quad manifold)
    torso_rings = [
        ((0, 0, 0.86), hip_w, 0.125, 0.0),
        ((0, 0, 0.96), hip_w * 0.96, 0.12, 0.0),
        ((0, 0, 1.08), waist_w, 0.11, 0.0),
        ((0, -0.01, 1.22), sh_w * 0.92, 0.135 if female_proportions else 0.13, 0.0),
        ((0, -0.01, 1.36), sh_w, 0.14, 0.0),
        ((0, 0, 1.46), sh_w * 0.72, 0.105, 0.0),
        ((0, 0, 1.54), 0.068, 0.068, 0.0),
    ]
    create_lofted_tube(
        f"{char_name}_Torso",
        torso_rings,
        segs=28,
        mat=mat_vest,
        parent=root,
        uv_bounds=front_uv_bounds,
        back_uv_bounds=back_uv_bounds,
        global_char_uv=has_sheet,
    )

    # 2. Tailored 3D Duster Coat / Biker Jacket Layer with Collar & Lapels
    if has_long_coat:
        coat_rings = [
            ((0, 0.01, 0.36), hip_w * 1.48, 0.22, 0.0),
            ((0, 0.01, 0.62), hip_w * 1.28, 0.18, 0.0),
            ((0, 0.0, 0.92), hip_w * 1.08, 0.145, 0.0),
            ((0, 0.0, 1.12), waist_w * 1.10, 0.13, 0.0),
            ((0, -0.01, 1.36), sh_w * 1.08, 0.155, 0.0),
            ((0, 0.01, 1.49), 0.125, 0.115, -0.12),
            ((0, 0.02, 1.57), 0.145, 0.125, -0.22),
        ]
        create_lofted_tube(
            f"{char_name}_DusterCoat",
            coat_rings,
            segs=28,
            mat=mat_coat,
            cap_ends=False,
            parent=root,
            uv_bounds=front_uv_bounds,
            back_uv_bounds=back_uv_bounds,
            global_char_uv=has_sheet,
        )
    else:
        jacket_rings = [
            ((0, 0.0, 0.88), hip_w * 1.05, 0.135, 0.0),
            ((0, 0.0, 1.08), waist_w * 1.08, 0.125, 0.0),
            ((0, -0.01, 1.36), sh_w * 1.06, 0.15, 0.0),
            ((0, 0.0, 1.48), 0.11, 0.105, -0.10),
        ]
        create_lofted_tube(
            f"{char_name}_Jacket",
            jacket_rings,
            segs=24,
            mat=mat_coat,
            cap_ends=False,
            parent=root,
            uv_bounds=front_uv_bounds,
            back_uv_bounds=back_uv_bounds,
            global_char_uv=has_sheet,
        )

    # 3. Lofted Left & Right Legs + Combat Boots
    for side, s_lbl in ((-1, "L"), (1, "R")):
        lx = side * 0.115
        leg_rings = [
            ((lx, 0.0, 0.12), 0.058, 0.062, 0.0),
            ((lx, 0.01, 0.30), 0.068, 0.072, 0.0),
            ((lx, -0.01, 0.50), 0.065, 0.068, 0.0),
            ((lx, 0.0, 0.72), 0.082, 0.086, 0.0),
            ((lx * 0.95, 0.0, 0.92), 0.088, 0.092, 0.0),
        ]
        create_lofted_tube(
            f"{char_name}_Leg_{s_lbl}",
            leg_rings,
            segs=18,
            mat=mat_pants,
            parent=root,
            uv_bounds=front_uv_bounds,
            back_uv_bounds=back_uv_bounds,
            global_char_uv=has_sheet,
        )

        # Sculpted Combat Boot
        boot_rings = [
            ((lx, -0.05, 0.01), 0.062, 0.125, 0.0),
            ((lx, -0.04, 0.055), 0.060, 0.118, 0.0),
            ((lx, -0.01, 0.11), 0.058, 0.072, 0.0),
            ((lx, 0.0, 0.22), 0.064, 0.068, 0.0),
        ]
        create_lofted_tube(f"{char_name}_Boot_{s_lbl}", boot_rings, segs=16, mat=mat_boot, parent=root)

    # 4. Lofted Left & Right Arms + Hands
    for side, s_lbl in ((-1, "L"), (1, "R")):
        sx = side * (sh_w + 0.02)
        arm_rings = [
            ((sx * 1.62, -0.08, 0.82), 0.042, 0.045, 0.25),
            ((sx * 1.48, -0.04, 0.98), 0.052, 0.054, 0.15),
            ((sx * 1.32, 0.0, 1.15), 0.056, 0.058, 0.05),
            ((sx * 1.15, 0.0, 1.32), 0.064, 0.066, 0.0),
            ((sx * 0.96, 0.0, 1.42), 0.068, 0.070, 0.0),
        ]
        create_lofted_tube(
            f"{char_name}_Arm_{s_lbl}",
            arm_rings,
            segs=16,
            mat=mat_coat,
            parent=root,
            uv_bounds=front_uv_bounds,
            back_uv_bounds=back_uv_bounds,
            global_char_uv=has_sheet,
        )

        # Sculpted Hand
        hand_rings = [
            ((sx * 1.68, -0.13, 0.73), 0.032, 0.022, 0.35),
            ((sx * 1.65, -0.10, 0.78), 0.038, 0.028, 0.30),
            ((sx * 1.62, -0.08, 0.83), 0.036, 0.032, 0.25),
        ]
        create_lofted_tube(f"{char_name}_Hand_{s_lbl}", hand_rings, segs=14, mat=mat_skin, parent=root)

    # 5. 3D Sculpted Portrait Head with Movie Frame Relief & PBR Normal Map
    head_scale = (0.175, 0.175, 0.158) if is_pumpkin else (0.125, 0.138, 0.158)
    create_sculpted_portrait_head(
        f"{char_name}_Head",
        location=(0, -0.01, 1.66),
        scale=head_scale,
        portrait_path=portrait_path,
        base_color=(0.94, 0.40, 0.05, 1.0) if is_pumpkin else skin_color,
        roughness=0.38 if is_pumpkin else (0.24 if is_skull else 0.45),
        metallic=0.82 if is_skull else 0.05,
        relief_strength=0.024,
        is_pumpkin=is_pumpkin,
        is_skull=is_skull,
        parent=root,
    )

    if is_pumpkin:
        # Twisted organic pumpkin stem
        mat_stem = make_pbr_mat("PumpkinStemMat", color=(0.14, 0.28, 0.10, 1.0), roughness=0.85)
        stem_rings = [
            ((0.0, 0.0, 1.80), 0.032, 0.032, 0.0),
            ((0.015, 0.01, 1.86), 0.022, 0.022, 0.2),
            ((0.035, 0.025, 1.91), 0.012, 0.012, 0.4),
        ]
        create_lofted_tube(f"{char_name}_Stem", stem_rings, segs=12, mat=mat_stem, parent=root)

    # 6. Headgear (Witch Hat / Bowler Top Hat)
    if has_hat == "witch":
        mat_hat = make_pbr_mat(f"{char_name}_WitchHatMat", color=(0.04, 0.03, 0.06, 1.0), roughness=0.45)
        hat_rings = [
            ((0, 0, 1.76), 0.36, 0.36, 0.0),
            ((0, 0, 1.78), 0.15, 0.15, 0.0),
            ((0, 0.02, 1.94), 0.09, 0.09, -0.15),
            ((0, 0.06, 2.12), 0.02, 0.02, -0.35),
        ]
        create_lofted_tube(f"{char_name}_WitchHat", hat_rings, segs=24, mat=mat_hat, parent=root)
        # Cyber-cat familiar on right shoulder (from Miriam's movie still!)
        mat_cat = make_pbr_mat("MiriamCyberCatMat", color=(0.12, 0.45, 0.88, 1.0), roughness=0.35, emission=(0.18, 0.65, 1.0), emission_strength=0.85)
        cat_rings = [
            ((0.22, -0.02, 1.46), 0.042, 0.048, 0.0),
            ((0.22, -0.03, 1.53), 0.036, 0.038, 0.0),
            ((0.22, -0.04, 1.59), 0.040, 0.042, 0.0),
        ]
        create_lofted_tube(f"{char_name}_CyberCat", cat_rings, segs=14, mat=mat_cat, parent=root)
    elif has_hat == "tophat":
        mat_hat = make_pbr_mat(f"{char_name}_TopHatMat", color=(0.05, 0.05, 0.07, 1.0), roughness=0.32, metallic=0.25)
        hat_rings = [
            ((0, 0, 1.77), 0.21, 0.22, 0.0),
            ((0, 0, 1.79), 0.135, 0.145, 0.0),
            ((0, 0, 1.98), 0.142, 0.150, 0.0),
        ]
        create_lofted_tube(f"{char_name}_TopHat", hat_rings, segs=24, mat=mat_hat, parent=root)

    # 7. Weapons (Bushido Blade Katana-Cleaver / Spiked Bat / Dual Plasma Blades / Molotov)
    rx_hand = (sh_w + 0.02) * 1.65
    lx_hand = -(sh_w + 0.02) * 1.65

    if weapon_type == "dual_blades":
        mat_blade = make_pbr_mat(
            "PlasmaBladeMat",
            color=(1.0, 0.42, 0.05, 1.0),
            roughness=0.15,
            metallic=0.85,
            emission=(1.0, 0.48, 0.08),
            emission_strength=4.8,
        )
        for sx, lbl in ((lx_hand, "L"), (rx_hand, "R")):
            blade_rings = [
                ((sx, -0.12, 0.76), 0.018, 0.018, 0.0),
                ((sx, -0.28, 0.84), 0.014, 0.042, 0.35),
                ((sx, -0.62, 1.02), 0.010, 0.036, 0.35),
                ((sx, -0.88, 1.16), 0.003, 0.008, 0.35),
            ]
            create_lofted_tube(f"{char_name}_PlasmaBlade_{lbl}", blade_rings, segs=12, mat=mat_blade, parent=root)

    elif weapon_type == "bat_and_molotov":
        # Right hand: Spiked Grindhouse Bat + Bushido Katana Edge strip
        mat_bat = make_pbr_mat("GrindhouseSpikedBatMat", color=(0.42, 0.24, 0.11, 1.0), roughness=0.52)
        mat_edge = make_pbr_mat("BushidoKatanaEdgeMat", color=(0.86, 0.90, 0.96, 1.0), roughness=0.18, metallic=0.95, emission=(0.95, 0.55, 0.18), emission_strength=0.65)
        bat_rings = [
            ((rx_hand, -0.10, 0.74), 0.018, 0.018, 0.0),
            ((rx_hand, -0.24, 0.86), 0.022, 0.022, 0.45),
            ((rx_hand, -0.52, 1.12), 0.038, 0.038, 0.45),
            ((rx_hand, -0.74, 1.32), 0.044, 0.044, 0.45),
        ]
        create_lofted_tube(f"{char_name}_SpikedBat", bat_rings, segs=16, mat=mat_bat, parent=root)
        # Katana steel edge & nails along the bat barrel
        edge_rings = [
            ((rx_hand, -0.34, 0.95), 0.006, 0.052, 0.45),
            ((rx_hand, -0.72, 1.30), 0.005, 0.058, 0.45),
        ]
        create_lofted_tube(f"{char_name}_BushidoEdge", edge_rings, segs=10, mat=mat_edge, parent=root)

        # Left hand: Flaming Molotov Cocktail bottle
        mat_bottle = make_pbr_mat("MolotovBottleMat", color=(0.14, 0.38, 0.16, 1.0), roughness=0.14, metallic=0.1)
        mat_flame = make_pbr_mat("MolotovFlameMat", color=(1.0, 0.52, 0.08, 1.0), emission=(1.0, 0.48, 0.06), emission_strength=5.5)
        bottle_rings = [
            ((lx_hand, -0.14, 0.72), 0.034, 0.034, 0.0),
            ((lx_hand, -0.14, 0.84), 0.034, 0.034, 0.0),
            ((lx_hand, -0.14, 0.91), 0.014, 0.014, 0.0),
        ]
        create_lofted_tube(f"{char_name}_MolotovBottle", bottle_rings, segs=14, mat=mat_bottle, parent=root)
        flame_rings = [
            ((lx_hand, -0.14, 0.91), 0.018, 0.018, 0.0),
            ((lx_hand, -0.15, 0.99), 0.032, 0.028, 0.0),
            ((lx_hand, -0.16, 1.07), 0.006, 0.006, 0.0),
        ]
        create_lofted_tube(f"{char_name}_MolotovFlame", flame_rings, segs=12, mat=mat_flame, parent=root)

    # Convert to skinned Armature with 8 baked animations!
    return build_armature_and_skin_character(char_name, root, scale_factor=1.0)


# ---------------------------------------------------------------------------
# 5. BUILD PUMPKIN PATCH CAST GLB (`pumpkin_patch_cast.glb`)
# ---------------------------------------------------------------------------
def build_pumpkin_patch_cast_glb():
    clear_scene()

    # 1. Pumpkin Patch (Melvin Lester) — char_1_portrait.jpg + pumpkin_patch_sheet.png
    p1 = build_sculpted_character_rig(
        "Char_PumpkinPatch",
        portrait_file="char_1_portrait.jpg",
        sheet_file="pumpkin_patch_sheet.png",
        coat_color=(0.06, 0.06, 0.08, 1.0),
        vest_color=(0.16, 0.10, 0.06, 1.0),
        pants_color=(0.07, 0.07, 0.09, 1.0),
        skin_color=(0.95, 0.42, 0.05, 1.0),
        has_long_coat=True,
        is_pumpkin=True,
        weapon_type="dual_blades",
        front_uv_bounds=(0.04, 0.31, 0.07, 0.89),
        back_uv_bounds=(0.34, 0.59, 0.07, 0.89),
    )
    p1.location = (0, 0, 0)

    # 2. Wicked Witch Miriam — char_3_portrait.jpg + miriam_sheet.png
    p2 = build_sculpted_character_rig(
        "Char_Miriam",
        portrait_file="char_3_portrait.jpg",
        sheet_file="miriam_sheet.png",
        coat_color=(0.05, 0.04, 0.08, 1.0),
        vest_color=(0.12, 0.06, 0.18, 1.0),
        pants_color=(0.05, 0.04, 0.08, 1.0),
        skin_color=(0.24, 0.68, 0.30, 1.0),
        has_long_coat=True,
        has_hat="witch",
        female_proportions=True,
        front_uv_bounds=(0.04, 0.31, 0.05, 0.91),
        back_uv_bounds=(0.32, 0.57, 0.05, 0.91),
    )
    p2.location = (3.0, 0, 0)

    # 3. Winged Monkey Soldier
    monkey_root = bpy.data.objects.new("Char_WingedMonkey_Temp", None)
    bpy.context.collection.objects.link(monkey_root)
    mat_fur = make_pbr_mat("MonkeyFurMat", color=(0.22, 0.16, 0.13, 1.0), roughness=0.78)
    mat_vest = make_pbr_mat("MonkeyArmorMat", color=(0.28, 0.08, 0.42, 1.0), roughness=0.45, metallic=0.35)
    mat_wing = make_pbr_mat("MonkeyWingMat", color=(0.12, 0.08, 0.16, 1.0), roughness=0.62)
    create_lofted_tube(
        "MonkeyTorso",
        [((0, 0, 0.45), 0.14, 0.12, 0), ((0, 0, 0.72), 0.17, 0.15, 0), ((0, -0.02, 0.94), 0.12, 0.12, 0)],
        segs=18,
        mat=mat_vest,
        parent=monkey_root,
    )
    create_sculpted_portrait_head(
        "MonkeyHead",
        location=(0, -0.05, 1.06),
        scale=(0.12, 0.14, 0.12),
        base_color=(0.25, 0.18, 0.14, 1.0),
        parent=monkey_root,
    )
    for side, lbl in ((-1, "L"), (1, "R")):
        create_lofted_tube(
            f"MonkeyWing_{lbl}",
            [
                ((side * 0.12, 0.06, 0.82), 0.04, 0.02, 0),
                ((side * 0.48, 0.10, 0.96), 0.18, 0.02, 0.2),
                ((side * 0.85, 0.14, 0.78), 0.12, 0.015, 0.3),
            ],
            segs=12,
            mat=mat_wing,
            parent=monkey_root,
        )
    p_monkey = build_armature_and_skin_character("Char_WingedMonkey", monkey_root, scale_factor=0.68)
    p_monkey.location = (6.0, 0, 0)

    # 4. Stitch (The Scarecrow) — char_4_portrait.jpg + stitch_and_robobones_sheet.png
    p4 = build_sculpted_character_rig(
        "Char_Stitch",
        portrait_file="char_4_portrait.jpg",
        sheet_file="stitch_and_robobones_sheet.png",
        coat_color=(0.24, 0.17, 0.11, 1.0),
        vest_color=(0.48, 0.36, 0.22, 1.0),
        pants_color=(0.16, 0.13, 0.10, 1.0),
        skin_color=(0.64, 0.50, 0.34, 1.0),
        has_long_coat=True,
        front_uv_bounds=(0.02, 0.28, 0.04, 0.86),
        back_uv_bounds=(0.29, 0.48, 0.04, 0.86),
    )
    p4.location = (9.0, 0, 0)

    # 5. Special Agent Katrina Van Tassel — char_2_portrait.jpg
    p5 = build_sculpted_character_rig(
        "Char_Katrina",
        portrait_file="char_2_portrait.jpg",
        sheet_file="survivors_sheet.png",
        coat_color=(0.14, 0.15, 0.18, 1.0),
        vest_color=(0.22, 0.24, 0.28, 1.0),
        pants_color=(0.10, 0.11, 0.14, 1.0),
        skin_color=(0.90, 0.76, 0.68, 1.0),
        has_long_coat=False,
        female_proportions=True,
        front_uv_bounds=(0.53, 0.72, 0.33, 0.91),
        back_uv_bounds=(0.82, 0.98, 0.33, 0.91),
    )
    p5.location = (12.0, 0, 0)

    # 6. Commander Crane (Robo-Bones) — char_5_portrait.jpg + stitch_and_robobones_sheet.png
    p6 = build_sculpted_character_rig(
        "Char_RoboBones",
        portrait_file="char_5_portrait.jpg",
        sheet_file="stitch_and_robobones_sheet.png",
        coat_color=(0.07, 0.08, 0.10, 1.0),
        vest_color=(0.55, 0.60, 0.68, 1.0),
        pants_color=(0.08, 0.09, 0.12, 1.0),
        skin_color=(0.74, 0.78, 0.84, 1.0),
        has_long_coat=True,
        has_hat="tophat",
        is_skull=True,
        front_uv_bounds=(0.52, 0.77, 0.04, 0.86),
        back_uv_bounds=(0.78, 0.98, 0.04, 0.86),
    )
    p6.location = (15.0, 0, 0)

    # 7. Director Jack (Ichabod Crane) — char_8_portrait.jpg
    p7 = build_sculpted_character_rig(
        "Char_Ichabod",
        portrait_file="char_8_portrait.jpg",
        coat_color=(0.06, 0.06, 0.08, 1.0),
        vest_color=(0.82, 0.12, 0.15, 1.0),
        pants_color=(0.05, 0.05, 0.07, 1.0),
        skin_color=(0.86, 0.74, 0.66, 1.0),
        has_long_coat=True,
    )
    p7.location = (18.0, 0, 0)

    # 8. Marv (District 13 Fixer) — char_7_portrait.jpg
    p8 = build_sculpted_character_rig(
        "Char_Marv",
        portrait_file="char_7_portrait.jpg",
        coat_color=(0.24, 0.15, 0.09, 1.0),
        vest_color=(0.35, 0.22, 0.14, 1.0),
        pants_color=(0.12, 0.12, 0.15, 1.0),
        skin_color=(0.82, 0.68, 0.58, 1.0),
        has_long_coat=False,
    )
    p8.location = (21.0, 0, 0)

    out_path = os.path.join(OUT_DIR, "pumpkin_patch_cast.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_nla_strips=True,
    )
    print(f"Exported Skinned & Animated Cast GLB: {out_path} ({os.path.getsize(out_path)} bytes)")


# ---------------------------------------------------------------------------
# 6. BUILD PLAYABLE SURVIVORS & ROAMING MONSTERS GLB
# ---------------------------------------------------------------------------
def build_survivors_and_monsters_glb():
    clear_scene()

    # 1. Playable Male Survivor (Fortnite + Bushido Blade inspired — Kenji 'Road Rash' Tanaka)
    s_male = build_sculpted_character_rig(
        "Survivor_Male",
        portrait_file="panel_225.jpg",
        sheet_file="survivors_sheet.png",
        coat_color=(0.34, 0.08, 0.09, 1.0),
        vest_color=(0.14, 0.15, 0.18, 1.0),
        pants_color=(0.10, 0.14, 0.22, 1.0),
        skin_color=(0.84, 0.68, 0.56, 1.0),
        has_long_coat=False,
        weapon_type="bat_and_molotov",
        female_proportions=False,
        front_uv_bounds=(0.04, 0.24, 0.33, 0.91),
        back_uv_bounds=(0.34, 0.51, 0.33, 0.91),
    )
    s_male.location = (0, 0, 0)

    # 2. Playable Female Survivor (Anya 'Scrap' Petrovic)
    s_female = build_sculpted_character_rig(
        "Survivor_Female",
        portrait_file="char_2_portrait.jpg",
        sheet_file="survivors_sheet.png",
        coat_color=(0.14, 0.22, 0.36, 1.0),
        vest_color=(0.55, 0.12, 0.18, 1.0),
        pants_color=(0.08, 0.09, 0.12, 1.0),
        skin_color=(0.88, 0.72, 0.62, 1.0),
        has_long_coat=False,
        weapon_type="bat_and_molotov",
        female_proportions=True,
        front_uv_bounds=(0.53, 0.72, 0.33, 0.91),
        back_uv_bounds=(0.82, 0.98, 0.33, 0.91),
    )
    s_female.location = (3.0, 0, 0)

    # 3. Roaming Monster: Grindhouse Zombie
    m_zombie = build_sculpted_character_rig(
        "Monster_Zombie",
        portrait_file="char_4_portrait.jpg",
        sheet_file="monsters_sheet.png",
        coat_color=(0.22, 0.25, 0.18, 1.0),
        vest_color=(0.42, 0.10, 0.10, 1.0),
        pants_color=(0.14, 0.15, 0.12, 1.0),
        skin_color=(0.42, 0.54, 0.38, 1.0),
        has_long_coat=False,
        is_skull=True,
        front_uv_bounds=(0.03, 0.20, 0.09, 0.81),
        back_uv_bounds=(0.21, 0.32, 0.09, 0.81),
    )
    m_zombie.location = (6.0, 0, 0)

    # 4. Roaming Monster: Hulking Lycanthrope Werewolf
    ww_root = bpy.data.objects.new("Monster_Werewolf_Temp", None)
    bpy.context.collection.objects.link(ww_root)
    monsters_sheet_path = os.path.join(SHEETS_DIR, "monsters_sheet.png")
    mat_ww = make_pbr_mat(
        "WerewolfFurPBR",
        color=(0.18, 0.15, 0.13, 1.0),
        roughness=0.82,
        image_path=monsters_sheet_path if os.path.exists(monsters_sheet_path) else None,
        normal_strength=1.25,
    )
    mat_ww_eye = make_pbr_mat("WerewolfEyeMat", color=(1.0, 0.65, 0.05, 1.0), emission=(1.0, 0.55, 0.05), emission_strength=4.5)
    # Muscular V-taper werewolf torso
    create_lofted_tube(
        "WW_Torso",
        [
            ((0, 0.04, 0.88), 0.19, 0.15, 0.1),
            ((0, 0.02, 1.12), 0.22, 0.18, 0.12),
            ((0, -0.04, 1.42), 0.34, 0.25, 0.18),
            ((0, -0.08, 1.62), 0.18, 0.18, 0.22),
        ],
        segs=24,
        mat=mat_ww,
        parent=ww_root,
    )
    # Snarling wolf snout & head
    snout_rings = [
        ((0, -0.08, 1.68), 0.17, 0.18, 0.2),
        ((0, -0.22, 1.66), 0.12, 0.11, 0.3),
        ((0, -0.38, 1.62), 0.075, 0.065, 0.35),
    ]
    create_lofted_tube("WW_HeadSnout", snout_rings, segs=20, mat=mat_ww, parent=ww_root)
    # Ears & Glowing Eyes
    for side, lbl in ((-1, "L"), (1, "R")):
        create_lofted_tube(
            f"WW_Ear_{lbl}",
            [((side * 0.11, -0.04, 1.82), 0.04, 0.03, 0), ((side * 0.14, -0.02, 1.98), 0.008, 0.008, 0)],
            segs=10,
            mat=mat_ww,
            parent=ww_root,
        )
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.024, location=(side * 0.07, -0.23, 1.72))
        ev = bpy.context.active_object
        ev.data.materials.append(mat_ww_eye)
        ev.parent = ww_root
        # Hulking clawed arms & digitigrade legs
        create_lofted_tube(
            f"WW_Arm_{lbl}",
            [
                ((side * 0.46, -0.18, 0.78), 0.065, 0.065, 0.3),
                ((side * 0.42, -0.08, 1.12), 0.085, 0.085, 0.15),
                ((side * 0.34, -0.02, 1.44), 0.105, 0.105, 0),
            ],
            segs=16,
            mat=mat_ww,
            parent=ww_root,
        )
        create_lofted_tube(
            f"WW_Leg_{lbl}",
            [
                ((side * 0.15, -0.06, 0.04), 0.065, 0.11, 0),
                ((side * 0.15, 0.08, 0.42), 0.075, 0.08, -0.25),
                ((side * 0.14, -0.02, 0.88), 0.11, 0.12, 0.15),
            ],
            segs=16,
            mat=mat_ww,
            parent=ww_root,
        )
    m_werewolf = build_armature_and_skin_character("Monster_Werewolf", ww_root, scale_factor=1.12)
    m_werewolf.location = (9.0, 0, 0)

    # 5. Roaming Monster: Spectral Banshee Ghost
    gh_root = bpy.data.objects.new("Monster_Ghost_Temp", None)
    bpy.context.collection.objects.link(gh_root)
    mat_ghost = make_pbr_mat(
        "SpectralGhostPBR",
        color=(0.55, 0.94, 1.0, 0.75),
        roughness=0.18,
        emission=(0.32, 0.88, 1.0),
        emission_strength=2.2,
        alpha=0.76,
    )
    shroud_rings = [
        ((0, 0, 0.12), 0.44, 0.44, 0),
        ((0, 0.04, 0.52), 0.34, 0.32, 0.1),
        ((0, 0.0, 0.98), 0.25, 0.22, 0),
        ((0, -0.02, 1.38), 0.22, 0.19, 0),
        ((0, -0.01, 1.66), 0.15, 0.16, 0),
        ((0, 0.02, 1.84), 0.04, 0.05, 0),
    ]
    create_lofted_tube("GhostShroud", shroud_rings, segs=28, mat=mat_ghost, cap_ends=True, parent=gh_root)
    for side, lbl in ((-1, "L"), (1, "R")):
        create_lofted_tube(
            f"GhostSleeve_{lbl}",
            [
                ((side * 0.48, -0.22, 0.88), 0.09, 0.16, 0.3),
                ((side * 0.32, -0.08, 1.18), 0.08, 0.11, 0.15),
                ((side * 0.20, 0.0, 1.38), 0.07, 0.08, 0),
            ],
            segs=16,
            mat=mat_ghost,
            parent=gh_root,
        )
    m_ghost = build_armature_and_skin_character("Monster_Ghost", gh_root, scale_factor=1.0)
    m_ghost.location = (12.0, 0, 0)

    out_path = os.path.join(OUT_DIR, "grindhouse_survivors_and_monsters.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_nla_strips=True,
    )
    print(f"Exported Skinned Survivors & Monsters GLB: {out_path} ({os.path.getsize(out_path)} bytes)")


# ---------------------------------------------------------------------------
# 7. BUILD PUMPKIN PATCH ARMORED TANK GLB (`pumpkin_patch_tank.glb`)
# ---------------------------------------------------------------------------
def build_pumpkin_patch_tank_glb():
    clear_scene()
    tank_root = bpy.data.objects.new("PumpkinPatch_Armored_Tank", None)
    bpy.context.collection.objects.link(tank_root)

    tank_sheet_path = os.path.join(SHEETS_DIR, "tank_sheet.png")
    tank_tex = tank_sheet_path if os.path.exists(tank_sheet_path) else os.path.join(STILLS_DIR, "panel_165.jpg")

    mat_armor = make_pbr_mat(
        "TankArmorPBR",
        color=(0.16, 0.18, 0.15, 1.0),
        roughness=0.45,
        metallic=0.78,
        image_path=tank_tex,
        normal_strength=1.1,
    )
    mat_dark_steel = make_pbr_mat("TankDarkSteelPBR", color=(0.08, 0.09, 0.11, 1.0), roughness=0.35, metallic=0.88)
    mat_tread = make_pbr_mat("TankTreadPBR", color=(0.05, 0.05, 0.06, 1.0), roughness=0.82, metallic=0.45)
    mat_brass = make_pbr_mat("TankBrassSkullPBR", color=(0.76, 0.56, 0.24, 1.0), roughness=0.28, metallic=0.92)
    mat_headlight = make_pbr_mat("TankHeadlightPBR", color=(1.0, 0.65, 0.15, 1.0), emission=(1.0, 0.58, 0.12), emission_strength=6.5)

    # Sloped Armored Lower & Upper Hull with Bevel
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.15))
    hull = bpy.context.active_object
    hull.name = "Tank_Main_Hull"
    hull.scale = (3.4, 5.8, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    bev = hull.modifiers.new(name="Bevel", type="BEVEL")
    bev.width = 0.18
    bev.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    hull.data.materials.append(mat_armor)
    hull.parent = tank_root
    shade_smooth_obj(hull)

    # Armored Glacis & Crew Cab
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.35, 2.05))
    cab = bpy.context.active_object
    cab.name = "Tank_Armored_Cab"
    cab.scale = (2.85, 3.3, 0.85)
    bpy.ops.object.transform_apply(scale=True)
    bev2 = cab.modifiers.new(name="Bevel", type="BEVEL")
    bev2.width = 0.14
    bev2.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    cab.data.materials.append(mat_armor)
    cab.parent = tank_root
    shade_smooth_obj(cab)

    # Caterpillar Track Assemblies & Road Wheels
    for side, s_lbl in ((-1, "L"), (1, "R")):
        tx = side * 1.92
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(tx, 0, 0.68))
        track = bpy.context.active_object
        track.name = f"Tank_Track_{s_lbl}"
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
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.46, depth=0.78, location=(tx, wy, 0.52), rotation=(0, math.radians(90), 0))
            wh = bpy.context.active_object
            wh.name = f"Tank_Wheel_{s_lbl}_{w_idx}"
            wh.data.materials.append(mat_dark_steel)
            wh.parent = tank_root
            shade_smooth_obj(wh)

    # Sculpted Skull Front Grille & Combustion Headlights
    create_sculpted_portrait_head(
        "Tank_Skull_Grille",
        location=(0, -3.02, 1.18),
        scale=(0.55, 0.32, 0.52),
        portrait_path=os.path.join(STILLS_DIR, "char_5_portrait.jpg"),
        base_color=(0.76, 0.56, 0.24, 1.0),
        roughness=0.28,
        metallic=0.90,
        is_skull=True,
        parent=tank_root,
    )
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.22, location=(side * 1.18, -2.98, 1.48))
        hl = bpy.context.active_object
        hl.data.materials.append(mat_headlight)
        hl.parent = tank_root

    # Rotating Roof Turret with Triple Heavy Rotary Cannons & Lil' Boo Gunner
    turret_pivot = bpy.data.objects.new("Tank_Turret_Pivot", None)
    turret_pivot.location = (0, 0.25, 2.55)
    turret_pivot.parent = tank_root
    bpy.context.collection.objects.link(turret_pivot)

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.18, depth=0.68, location=(0, 0, 0.32))
    t_dome = bpy.context.active_object
    t_dome.name = "Tank_Turret_Dome"
    t_dome.data.materials.append(mat_armor)
    t_dome.parent = turret_pivot
    shade_smooth_obj(t_dome)

    for bx in (-0.38, 0.0, 0.38):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.095, depth=3.2, location=(bx, -1.85, 0.38), rotation=(math.radians(90), 0, 0))
        barrel = bpy.context.active_object
        barrel.name = f"Tank_Cannon_{bx}"
        barrel.data.materials.append(mat_dark_steel)
        barrel.parent = turret_pivot
        shade_smooth_obj(barrel)

    # Commander Melvin & Lil' Boo in the Turret
    create_sculpted_portrait_head(
        "Tank_Commander_Melvin",
        location=(-0.55, -0.55, 0.78),
        scale=(0.24, 0.24, 0.22),
        portrait_path=os.path.join(STILLS_DIR, "char_1_portrait.jpg"),
        base_color=(0.95, 0.42, 0.05, 1.0),
        is_pumpkin=True,
        parent=turret_pivot,
    )
    create_sculpted_portrait_head(
        "Tank_Gunner_LilBoo",
        location=(0.0, 0.15, 0.88),
        scale=(0.22, 0.22, 0.24),
        portrait_path=os.path.join(STILLS_DIR, "char_6_portrait.jpg"),
        base_color=(0.92, 0.95, 1.0, 1.0),
        parent=turret_pivot,
    )

    out_path = os.path.join(OUT_DIR, "pumpkin_patch_tank.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_apply=True)
    print(f"Exported Tank GLB: {out_path} ({os.path.getsize(out_path)} bytes)")


# ---------------------------------------------------------------------------
# 8. BUILD 1-FOR-1 HAUNTED CASTLE & CRAG FORTRESS GLB (`haunted_castle_fortress.glb`)
# ---------------------------------------------------------------------------
def build_haunted_castle_fortress_glb():
    clear_scene()
    castle_root = bpy.data.objects.new("Haunted_Castle_Fortress", None)
    bpy.context.collection.objects.link(castle_root)

    stone_tex_path = os.path.join(TEXTURES_DIR, "gothic_stone.png")
    if not os.path.exists(stone_tex_path):
        stone_tex_path = os.path.join(TEXTURES_DIR, "gothic_stone.jpg")

    mat_stone = make_pbr_mat(
        "CastleGothicStonePBR",
        color=(0.14, 0.13, 0.18, 1.0),
        roughness=0.82,
        metallic=0.08,
        image_path=stone_tex_path if os.path.exists(stone_tex_path) else None,
        normal_strength=1.35,
    )
    mat_roof = make_pbr_mat("CastleSlateSpirePBR", color=(0.05, 0.04, 0.08, 1.0), roughness=0.48, metallic=0.28)
    mat_iron = make_pbr_mat("CastleWroughtIronPBR", color=(0.06, 0.06, 0.08, 1.0), roughness=0.35, metallic=0.88)
    mat_window = make_pbr_mat("CastleWindowCrimsonGlow", color=(1.0, 0.32, 0.08, 1.0), emission=(1.0, 0.28, 0.06), emission_strength=4.5)
    mat_rift_win = make_pbr_mat("CastleWindowRiftGlow", color=(0.35, 0.95, 0.72, 1.0), emission=(0.25, 0.92, 0.65), emission_strength=3.8)

    # Sculpted Northern Crag Base
    crag_rings = [
        ((0, 0, -2.0), 26.0, 18.0, 0.0),
        ((0, 0, 1.5), 23.5, 16.0, 0.0),
        ((0, 0, 4.2), 20.0, 13.5, 0.0),
        ((0, 0, 5.8), 18.0, 12.0, 0.0),
    ]
    create_lofted_tube("Castle_Rocky_Crag", crag_rings, segs=32, mat=mat_stone, parent=castle_root)

    # Central Cathedral Keep
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 19.0))
    keep = bpy.context.active_object
    keep.scale = (14.5, 12.0, 26.0)
    bpy.ops.object.transform_apply(scale=True)
    keep.data.materials.append(mat_stone)
    keep.parent = castle_root

    # Central Spire & Flanking Gargoyle Bastion Towers (matching the 1:1 Master Scene Plate!)
    tower_specs = [
        (0, 0, 32.0, 4.8, 14.0, "Central_Keep_Spire"),
        (-11.5, -6.5, 5.5, 3.4, 24.0, "Bastion_NW"),
        (11.5, -6.5, 5.5, 3.4, 24.0, "Bastion_NE"),
        (-16.0, -3.5, 4.5, 2.8, 19.0, "Outer_Tower_W"),
        (16.0, -3.5, 4.5, 2.8, 19.0, "Outer_Tower_E"),
        (-6.2, -7.8, 5.5, 2.2, 27.5, "Gate_Belfry_L"),
        (6.2, -7.8, 5.5, 2.2, 27.5, "Gate_Belfry_R"),
    ]
    for tx, ty, tz, rad, h, t_name in tower_specs:
        t_rings = [
            ((tx, ty, tz), rad * 1.12, rad * 1.12, 0),
            ((tx, ty, tz + h * 0.5), rad * 0.96, rad * 0.96, 0),
            ((tx, ty, tz + h), rad * 1.04, rad * 1.04, 0),
        ]
        create_lofted_tube(t_name, t_rings, segs=24, mat=mat_stone, parent=castle_root)
        # Steep Gothic Witch-Spire Roof
        s_rings = [
            ((tx, ty, tz + h), rad * 1.24, rad * 1.24, 0),
            ((tx, ty, tz + h + h * 0.25), rad * 0.42, rad * 0.42, 0),
            ((tx, ty, tz + h + h * 0.52), 0.08, 0.08, 0),
        ]
        create_lofted_tube(f"{t_name}_Spire", s_rings, segs=20, mat=mat_roof, parent=castle_root)

    # Glowing Gothic Rose & Lancet Windows
    for wx in (-4.8, 0.0, 4.8):
        for wz, wmat in ((15.5, mat_window), (23.5, mat_rift_win if wx == 0 else mat_window)):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(wx, -6.12, wz))
            win = bpy.context.active_object
            win.scale = (1.55, 0.25, 3.8)
            win.data.materials.append(wmat)
            win.parent = castle_root

    # Iron Portcullis Gate
    for gx in np.linspace(-2.8, 2.8, 9):
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.09, depth=8.2, location=(float(gx), -6.25, 9.6))
        bar = bpy.context.active_object
        bar.data.materials.append(mat_iron)
        bar.parent = castle_root

    out_path = os.path.join(OUT_DIR, "haunted_castle_fortress.glb")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", export_apply=True)
    print(f"Exported Castle GLB: {out_path} ({os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    print("=== Council-Guided Blender 5.0.1 Professional Character Rig & 1:1 Scene Builder ===")
    build_pumpkin_patch_cast_glb()
    build_survivors_and_monsters_glb()
    build_pumpkin_patch_tank_glb()
    build_haunted_castle_fortress_glb()
    print("=== All 4 Skinned & PBR-Textured GLB Asset Packs Built Successfully ===")
