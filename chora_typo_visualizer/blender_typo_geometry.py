"""
=============================================================================
BLENDER PROCEDURAL 3D TYPOGRAPHIC SACRED GEOMETRY ENGINE (CHORA LYRIC SYNC)
=============================================================================
Author: Plajah Creative Labs / Chora Sound Engine
Purpose: Procedural 3D text generation, spherical/cubic/helical packing, 
         PBR studio lighting, and glTF / GLB real-time export for Plajah.
=============================================================================
"""

import bpy
import math
import os
from mathutils import Vector, Euler, Matrix

print("\n=======================================================")
print("  INITIALIZING CHORA 3D TYPOGRAPHY GEOMETRY GENERATOR  ")
print("=======================================================\n")

# ---------------------------------------------------------------------------
# 1. SCENE RESET & RENDER ENGINE SETUP
# ---------------------------------------------------------------------------
def reset_scene():
    """Wipes existing objects, meshes, and lights for a clean procedural generation."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    
    # Use EEVEE (or CYCLES if high-end offline rendering is desired)
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items else 'BLENDER_EEVEE'
    except Exception:
        scene.render.engine = 'BLENDER_EEVEE'

    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    # High-end color management
    scene.display_settings.display_device = 'sRGB'
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'High Contrast'

    return scene

# ---------------------------------------------------------------------------
# 2. STUDIO PBR MATERIAL FACTORY
# ---------------------------------------------------------------------------
def get_or_create_material(name, mat_type="OBSIDIAN", **kwargs):
    """Generates studio-grade PBR Principled BSDF & Glass/Emission materials."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    if mat_type == "OBSIDIAN":
        bsdf.inputs['Base Color'].default_value = (0.015, 0.015, 0.02, 1.0)
        bsdf.inputs['Metallic'].default_value = 0.95
        bsdf.inputs['Roughness'].default_value = 0.08
    elif mat_type == "CHROME_WHITE":
        bsdf.inputs['Base Color'].default_value = (0.92, 0.94, 0.98, 1.0)
        bsdf.inputs['Metallic'].default_value = 0.75
        bsdf.inputs['Roughness'].default_value = 0.12
    elif mat_type == "NEON_MAGENTA":
        bsdf.inputs['Base Color'].default_value = (1.0, 0.02, 0.45, 1.0)
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.0, 0.46, 1.0)
        bsdf.inputs['Emission Strength'].default_value = kwargs.get('emission', 12.0)
        bsdf.inputs['Roughness'].default_value = 0.2
    elif mat_type == "NEON_CYAN":
        bsdf.inputs['Base Color'].default_value = (0.0, 0.94, 1.0, 1.0)
        bsdf.inputs['Emission Color'].default_value = (0.0, 0.94, 1.0, 1.0)
        bsdf.inputs['Emission Strength'].default_value = kwargs.get('emission', 12.0)
        bsdf.inputs['Roughness'].default_value = 0.2
    elif mat_type == "CRYSTAL_GLASS":
        bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        bsdf.inputs['Transmission Weight'].default_value = 0.95
        bsdf.inputs['Roughness'].default_value = 0.04
        bsdf.inputs['IOR'].default_value = 1.52
    elif mat_type == "GOLD_BRASS":
        bsdf.inputs['Base Color'].default_value = (0.95, 0.78, 0.35, 1.0)
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.18
    elif mat_type == "BAUHAUS_RED":
        bsdf.inputs['Base Color'].default_value = (0.9, 0.1, 0.15, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.3
    elif mat_type == "BAUHAUS_BLUE":
        bsdf.inputs['Base Color'].default_value = (0.08, 0.25, 0.75, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.3
    elif mat_type == "SUMMIT_RED":
        bsdf.inputs['Base Color'].default_value = (0.92, 0.08, 0.18, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.22
    elif mat_type == "VALLEY_GREEN":
        bsdf.inputs['Base Color'].default_value = (0.05, 0.65, 0.45, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.25

    return mat

# ---------------------------------------------------------------------------
# 3. 3D STUDIO LIGHTING & CAMERA RIG
# ---------------------------------------------------------------------------
def setup_studio_rig(scene):
    """Sets up the 3-point studio lighting + center flare glint + camera."""
    # Camera
    cam_data = bpy.data.cameras.new("StudioCamera")
    cam_data.lens = 65
    cam_data.dof.use_dof = True
    cam_data.dof.aperture_fstop = 2.8
    cam_obj = bpy.data.objects.new("StudioCamera", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = (0, -13.5, 2.5)
    cam_obj.rotation_euler = (math.radians(82), 0, 0)
    scene.camera = cam_obj

    # Center Glint Point Light (Pulses on Bass)
    glint_data = bpy.data.lights.new(name="CenterGlint", type='POINT')
    glint_data.energy = 85.0
    glint_data.color = (1.0, 0.88, 0.55)
    glint_obj = bpy.data.objects.new("CenterGlint", glint_data)
    scene.collection.objects.link(glint_obj)
    glint_obj.location = (0, 0, 2.0)

    # Rim Left (Cyan)
    rim_l_data = bpy.data.lights.new(name="RimCyan", type='AREA')
    rim_l_data.energy = 160.0
    rim_l_data.color = (0.0, 0.94, 1.0)
    rim_l_data.size = 5.0
    rim_l_obj = bpy.data.objects.new("RimCyan", rim_l_data)
    scene.collection.objects.link(rim_l_obj)
    rim_l_obj.location = (-7.5, 4.0, 3.5)

    # Rim Right (Magenta)
    rim_r_data = bpy.data.lights.new(name="RimMagenta", type='AREA')
    rim_r_data.energy = 180.0
    rim_r_data.color = (1.0, 0.05, 0.6)
    rim_r_data.size = 5.0
    rim_r_obj = bpy.data.objects.new("RimMagenta", rim_r_data)
    scene.collection.objects.link(rim_r_obj)
    rim_r_obj.location = (7.5, -3.0, 3.5)

    return cam_obj, glint_obj

# ---------------------------------------------------------------------------
# 4. 3D PROCEDURAL TEXT BUILDER HELPER
# ---------------------------------------------------------------------------
def create_3d_text_glyph(char, location, rotation, scale=(1,1,1), material=None, extrude=0.15, bevel=0.03):
    """Creates a native Blender 3D Font Curve Object with bevel and extrusion."""
    curve_data = bpy.data.curves.new(name=f"Glyph_{char}", type='FONT')
    curve_data.body = str(char)
    curve_data.extrude = extrude
    curve_data.bevel_depth = bevel
    curve_data.bevel_resolution = 3
    curve_data.align_x = 'CENTER'
    curve_data.align_y = 'MIDDLE'

    text_obj = bpy.data.objects.new(name=f"Text_{char}", object_data=curve_data)
    bpy.context.scene.collection.objects.link(text_obj)
    
    text_obj.location = location
    text_obj.rotation_euler = rotation
    text_obj.scale = scale

    if material:
        text_obj.data.materials.append(material)

    return text_obj

# ---------------------------------------------------------------------------
# 5. PROCEDURAL VOLUME BUILDERS (6 MIDJOURNEY REFERENCE ARCHETYPES)
# ---------------------------------------------------------------------------

def generate_volume_1_sphere(lyrics_text="CHORA LOSSLESS SPATIAL HARMONY", radius=4.5, count=120):
    """
    VOLUME 1: DUAL-HEMISPHERE LETTER SPHERE (Ref: 3D_letters_forming_sphere)
    Half obsidian/chrome, half glowing neon magenta & cyan.
    """
    print("Building Volume 1: Dual-Hemisphere Letter Sphere...")
    mat_obsidian = get_or_create_material("Mat_Obsidian", "OBSIDIAN")
    mat_chrome = get_or_create_material("Mat_Chrome", "CHROME_WHITE")
    mat_magenta = get_or_create_material("Mat_Magenta", "NEON_MAGENTA")
    mat_cyan = get_or_create_material("Mat_Cyan", "NEON_CYAN")

    chars = [c for c in lyrics_text.replace(" ", "")]
    if not chars:
        chars = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

    phi = math.pi * (3.0 - math.sqrt(5.0)) # Golden angle
    sphere_glyphs = []

    for i in range(count):
        y = 1.0 - (i / float(count - 1)) * 2.0
        r_at_y = math.sqrt(max(0.0, 1.0 - y * y))
        theta = phi * i

        x = math.cos(theta) * r_at_y
        z = math.sin(theta) * r_at_y

        is_neon = (x > 0)
        char = chars[i % len(chars)]

        if is_neon:
            mat = mat_magenta if (i % 2 == 0) else mat_cyan
        else:
            mat = mat_obsidian if (i % 2 == 0) else mat_chrome

        pos = Vector((x * radius, z * radius, y * radius))
        
        # Calculate normal rotation to face outwards
        rot_dir = pos.normalized()
        rot_euler = rot_dir.to_track_quat('Z', 'Y').to_euler()

        glyph = create_3d_text_glyph(char, pos, rot_euler, scale=(0.55, 0.55, 0.55), material=mat, extrude=0.18, bevel=0.035)
        sphere_glyphs.append(glyph)

    print(f"Generated {len(sphere_glyphs)} 3D spherical glyphs successfully.")
    return sphere_glyphs


def generate_volume_2_cubic_glass(words=["GEOMETRY", "LIGHT", "LATTICE", "CRYSTAL", "FORM"]):
    """
    VOLUME 2: CUBIC GLASS LATTICE (Ref: Cubic_glass_letters_lattice)
    Interlocking word prisms forming a crystal cube.
    """
    print("Building Volume 2: Cubic Glass Lattice...")
    mat_glass = get_or_create_material("Mat_CrystalGlass", "CRYSTAL_GLASS")
    
    cube_glyphs = []
    size = 3
    spacing = 2.2
    offset = (size - 1) * spacing * 0.5

    w_idx = 0
    for x in range(size):
        for y in range(size):
            for z in range(size):
                # Hollow shell structure
                if 0 < x < size - 1 and 0 < y < size - 1 and 0 < z < size - 1:
                    continue

                word = words[w_idx % len(words)]
                char = word[(x + y + z) % len(word)]
                w_idx += 1

                pos = Vector((x * spacing - offset, y * spacing - offset, z * spacing - offset))
                rot = Euler((0, 0, 0))

                glyph = create_3d_text_glyph(char, pos, rot, scale=(0.85, 0.85, 0.85), material=mat_glass, extrude=0.35, bevel=0.06)
                cube_glyphs.append(glyph)

    print(f"Generated {len(cube_glyphs)} glass crystal glyphs.")
    return cube_glyphs


def generate_volume_4_dna_helix(lyrics_words=["CHORA", "LOSSLESS", "BASE", "PEAK", "ECHO", "WAVE"]):
    """
    VOLUME 4: BIOLUMINESCENT DNA HELIX (Ref: Glowing_text_forming_DNA_helix)
    Double helix with lyric-populated horizontal nucleotide rungs.
    """
    print("Building Volume 4: Bioluminescent DNA Helix...")
    mat_cyan = get_or_create_material("Mat_DNACyan", "NEON_CYAN", emission=16.0)
    mat_magenta = get_or_create_material("Mat_DNAPink", "NEON_MAGENTA", emission=16.0)
    mat_gold = get_or_create_material("Mat_DNAGold", "GOLD_BRASS")

    helix_glyphs = []
    points = 54
    height = 14.0
    radius = 3.2
    coils = 2.8

    for i in range(points):
        t = i / float(points)
        z = (t - 0.5) * height
        angle = t * math.pi * 2.0 * coils

        # Strand A
        pos_a = Vector((math.cos(angle) * radius, math.sin(angle) * radius, z))
        rot_a = Euler((0, 0, angle))
        glyph_a = create_3d_text_glyph("A", pos_a, rot_a, scale=(0.45, 0.45, 0.45), material=mat_cyan, extrude=0.1)
        helix_glyphs.append(glyph_a)

        # Strand B (180 deg offset)
        pos_b = Vector((math.cos(angle + math.pi) * radius, math.sin(angle + math.pi) * radius, z))
        rot_b = Euler((0, 0, angle + math.pi))
        glyph_b = create_3d_text_glyph("T", pos_b, rot_b, scale=(0.45, 0.45, 0.45), material=mat_magenta, extrude=0.1)
        helix_glyphs.append(glyph_b)

        # Connecting Lyric Rung (Every 3 nodes)
        if i % 3 == 0:
            rung_word = lyrics_words[(i // 3) % len(lyrics_words)]
            pos_rung = Vector((0, 0, z))
            rot_rung = Euler((0, 0, angle))
            rung_glyph = create_3d_text_glyph(rung_word, pos_rung, rot_rung, scale=(0.38, 0.38, 0.38), material=mat_gold, extrude=0.12)
            helix_glyphs.append(rung_glyph)

    print(f"Generated {len(helix_glyphs)} DNA helical nodes and lyric rungs.")
    return helix_glyphs

def generate_volume_3_sunburst(lyrics_words=["SACRED", "SUN", "HARMONY", "CHORA", "LIGHT"]):
    """VOLUME 3: CONSTRUCTIVIST SACRED SUNBURST"""
    print("Building Volume 3: Sacred Sunburst...")
    mat_red = get_or_create_material("Mat_BauhausRed", "BAUHAUS_RED")
    mat_blue = get_or_create_material("Mat_BauhausBlue", "BAUHAUS_BLUE")
    mat_gold = get_or_create_material("Mat_SunGold", "GOLD_BRASS")

    glyphs = []
    num_rays = 20
    tiers = 4
    for r in range(num_rays):
        angle = (r / float(num_rays)) * math.pi * 2.0
        for t in range(1, tiers + 1):
            dist = t * 1.4
            word = lyrics_words[r % len(lyrics_words)]
            char = word[t % len(word)]
            mat = mat_gold if (r % 4 == 0) else (mat_red if t % 2 == 0 else mat_blue)

            pos = Vector((math.cos(angle) * dist, math.sin(angle) * dist, (t % 2) * 0.15))
            rot = Euler((0, 0, angle - math.pi / 2))
            s = 0.45 + t * 0.15
            glyph = create_3d_text_glyph(char, pos, rot, scale=(s, s, s), material=mat, extrude=0.18)
            glyphs.append(glyph)
    return glyphs


def generate_volume_5_topography(lyrics_words=["SUMMIT", "RIDGE", "PEAKS", "VALLEY", "CREST", "CLIFF"]):
    """VOLUME 5: TOPOGRAPHIC LYRIC RIDGE"""
    print("Building Volume 5: Topographic Lyric Ridge...")
    mat_summit = get_or_create_material("Mat_SummitRed", "SUMMIT_RED")
    mat_valley = get_or_create_material("Mat_ValleyGreen", "VALLEY_GREEN")

    glyphs = []
    rows, cols = 8, 8
    spacing = 1.3
    offset_x = (cols - 1) * spacing * 0.5
    offset_y = (rows - 1) * spacing * 0.5

    for r in range(rows):
        for c in range(cols):
            word = lyrics_words[(r * cols + c) % len(lyrics_words)]
            char = word[c % len(word)]
            dist = math.sqrt((c - cols / 2.0)**2 + (r - rows / 2.0)**2)
            is_summit = dist < 2.2
            mat = mat_summit if is_summit else mat_valley
            h = 0.5 + (3.0 - min(3.0, dist)) * 0.9

            pos = Vector((c * spacing - offset_x, r * spacing - offset_y, h * 0.5))
            rot = Euler((0, 0, 0))
            glyph = create_3d_text_glyph(char, pos, rot, scale=(0.7, 0.7, h), material=mat, extrude=h * 0.3)
            glyphs.append(glyph)
    return glyphs


def generate_volume_7_vortex(lyrics_words=["CHAOS", "HARMONY", "VORTEX", "INFINITY", "CHORA"]):
    """VOLUME 7: COSMIC SPIRAL VORTEX (Ref: CHAOS Spiral / Swirling Galaxy)"""
    print("Building Volume 7: Spiral Vortex...")
    mat_cyan = get_or_create_material("Mat_VortexCyan", "NEON_CYAN", emission=14.0)
    mat_pink = get_or_create_material("Mat_VortexPink", "NEON_MAGENTA", emission=14.0)
    mat_gold = get_or_create_material("Mat_VortexGold", "GOLD_BRASS")

    glyphs = []
    points = 90
    num_arms = 3
    for arm in range(num_arms):
        arm_offset = (arm / float(num_arms)) * math.pi * 2.0
        mat = [mat_cyan, mat_pink, mat_gold][arm % 3]

        for i in range(points):
            t = i / float(points)
            theta = t * math.pi * 6.0 + arm_offset
            r = 0.6 + math.pow(t, 1.3) * 8.0
            z = (1.0 - t) * 4.0 - 2.0

            word = lyrics_words[(arm * points + i) % len(lyrics_words)]
            char = word[i % len(word)]

            pos = Vector((math.cos(theta) * r, math.sin(theta) * r, z))
            rot = Euler((0, 0, theta - math.pi / 2))
            s = 0.3 + t * 0.6
            glyph = create_3d_text_glyph(char, pos, rot, scale=(s, s, s), material=mat, extrude=0.15)
            glyphs.append(glyph)
    return glyphs


def generate_volume_8_skyline(lyrics_words=["BUILD", "DREAMS", "CHORA", "TOWER", "HEIGHTS", "ECHO"]):
    """VOLUME 8: METROPOLIS TYPOGRAPHIC SKYLINE"""
    print("Building Volume 8: Metropolis Typographic Skyline...")
    mat_obsidian = get_or_create_material("Mat_SkylineTower", "OBSIDIAN")
    mat_neon = get_or_create_material("Mat_SkylineBeacon", "NEON_MAGENTA", emission=18.0)

    glyphs = []
    num_towers = 15
    spacing = 1.1
    offset_x = (num_towers - 1) * spacing * 0.5

    for i in range(num_towers):
        dist = abs(i - (num_towers - 1) / 2.0) / ((num_towers - 1) / 2.0)
        floors = int(3 + (1.0 - dist * 0.7) * 8)
        px = i * spacing - offset_x

        for f in range(floors):
            word = lyrics_words[(i + f) % len(lyrics_words)]
            char = word[f % len(word)]
            is_spire = (f == floors - 1)
            mat = mat_neon if is_spire else mat_obsidian

            pos = Vector((px, (i % 2) * 0.2, f * 0.85 - 3.0))
            rot = Euler((0, 0, 0))
            glyph = create_3d_text_glyph(char, pos, rot, scale=(0.75, 0.75, 0.75), material=mat, extrude=0.25)
            glyphs.append(glyph)
    return glyphs


def generate_volume_9_butterfly(lyrics_words=["CHANGE", "GROW", "EVOLVE", "LEARN", "EXPLORE", "BELONG"]):
    """VOLUME 9: POLYHEDRAL ORIGAMI BUTTERFLY"""
    print("Building Volume 9: Polyhedral Butterfly...")
    mat_red = get_or_create_material("Mat_BflyRed", "BAUHAUS_RED")
    mat_gold = get_or_create_material("Mat_BflyGold", "GOLD_BRASS")
    mat_blue = get_or_create_material("Mat_BflyBlue", "BAUHAUS_BLUE")

    glyphs = []
    facets = 12
    for i in range(facets):
        angle = (i / float(facets)) * math.pi
        dist = 1.2 + (i % 3) * 1.1
        word = lyrics_words[i % len(lyrics_words)]
        mat = [mat_red, mat_gold, mat_blue][i % 3]

        fx = math.sin(angle) * dist
        fy = math.cos(angle) * dist * 1.3

        # Left wing
        g_l = create_3d_text_glyph(word, Vector((-fx, fy, 0)), Euler((0, math.radians(-15), angle)), scale=(0.4, 0.4, 0.4), material=mat, extrude=0.15)
        glyphs.append(g_l)

        # Right wing
        g_r = create_3d_text_glyph(word, Vector((fx, fy, 0)), Euler((0, math.radians(15), -angle)), scale=(0.4, 0.4, 0.4), material=mat, extrude=0.15)
        glyphs.append(g_r)
    return glyphs


# ---------------------------------------------------------------------------
# 6. GLTF / GLB EXPORT FUNCTIONALITY (FOR PLAJAH REAL-TIME ENGINE)
# ---------------------------------------------------------------------------
def export_gltf(output_filepath):
    """Exports all scene objects into high-performance glTF 2.0 binary (.glb)."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.convert(target='MESH')
    
    print(f"Exporting scene to glTF: {output_filepath}...")
    bpy.ops.export_scene.gltf(
        filepath=output_filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_materials='EXPORT',
        export_lights=True,
        export_cameras=True
    )
    print("glTF Export Complete!")


# ---------------------------------------------------------------------------
# 7. MAIN EXECUTION ENTRY POINT & VOLUME DISPATCHER
# ---------------------------------------------------------------------------
# Change this number to generate any of the 10 volumes:
# 1 = Sphere, 2 = Glass Cube, 3 = Sunburst, 4 = DNA Helix,
# 5 = Topography, 7 = Spiral Vortex, 8 = Skyline, 9 = Butterfly
SELECTED_VOLUME = 1

if __name__ == "__main__":
    scene = reset_scene()
    cam, glint = setup_studio_rig(scene)

    output_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in locals() else r"c:\Users\Kenne\plajah\chora_typo_visualizer"

    volume_map = {
        1: ("Sphere", lambda: generate_volume_1_sphere("CHORA LOSSLESS SPATIAL HARMONY", radius=4.5, count=120)),
        2: ("CubicGlass", lambda: generate_volume_2_cubic_glass(["GEOMETRY", "LIGHT", "LATTICE", "CRYSTAL"])),
        3: ("Sunburst", lambda: generate_volume_3_sunburst(["SACRED", "SUN", "HARMONY", "CHORA"])),
        4: ("DNAHelix", lambda: generate_volume_4_dna_helix(["CHORA", "LOSSLESS", "BASE", "PEAK"])),
        5: ("Topography", lambda: generate_volume_5_topography(["SUMMIT", "RIDGE", "PEAKS", "VALLEY"])),
        7: ("SpiralVortex", lambda: generate_volume_7_vortex(["CHAOS", "HARMONY", "VORTEX", "INFINITY"])),
        8: ("MetropolisSkyline", lambda: generate_volume_8_skyline(["BUILD", "DREAMS", "CHORA", "TOWER"])),
        9: ("Butterfly", lambda: generate_volume_9_butterfly(["CHANGE", "GROW", "EVOLVE", "LEARN"]))
    }

    vol_name, vol_fn = volume_map.get(SELECTED_VOLUME, volume_map[1])
    print(f"\n>>> Generating Volume {SELECTED_VOLUME}: {vol_name} <<<")
    glyphs = vol_fn()

    # Export .glb binary
    glb_path = os.path.join(output_dir, f"chora_vol_{SELECTED_VOLUME}_{vol_name.lower()}.glb")
    export_gltf(glb_path)

    # Optional: Render still preview
    scene.render.filepath = os.path.join(output_dir, f"preview_vol_{SELECTED_VOLUME}_{vol_name.lower()}.png")
    print(f"Preview will be rendered to: {scene.render.filepath}")

    print("\n--- Chora 3D Procedural Typography Generation Script Ready! ---")
