"""Local CPU finishing pipeline for Batches 7 (Wardrobe), 8 (Flora/Mushrooms/Trees), and 9 (Biome Structures).

Produces high-detail multi-view painted PBR + emissive + real HP tangent-space normal + 3D multi-scale AO GLBs:
  - Batch 7 -> public/games/rift-realm/assets/wardrobe/<id>.glb   (21 modular Vessel armor/wardrobe pieces, 28k faces, 1024 PBR)
  - Batch 8 -> public/games/rift-realm/assets/flora/<id>.glb      (18 bioluminescent mushrooms/plants/trees, 50k faces, 2048 PBR)
  - Batch 9 -> public/games/rift-realm/assets/structures/<id>.glb (18 multi-view biome structures/ruins, 60k faces, 2048 PBR)

Usage:
  python scripts/riftrealm/colab/finish_batch789_assets.py wardrobe [id...]
  python scripts/riftrealm/colab/finish_batch789_assets.py flora [id...]
  python scripts/riftrealm/colab/finish_batch789_assets.py structures [id...]
"""
import os
import subprocess
import sys
import zipfile
import numpy as np
import trimesh
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

BRAIN = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549"
SCRATCH = os.path.join(BRAIN, "scratch")
ASSETS_ROOT = os.path.join(ROOT, "public", "games", "rift-realm", "assets")

sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))

from glbio import read_glb, accessor, write_glb  # noqa: E402
from bake_pbr_maps import (  # noqa: E402
    compute_mesh_ao,
    compute_vertex_tangents,
    compute_smart_pbr,
    pad_charts,
    get_texture_image_idx,
    decode_image,
    encode_image,
)
from uv_raster import rasterize_uv, interp  # noqa: E402

# (id, target_height_m, center_pivot, pbr_profile, hue_range, smin, vmin, gain)
WARDROBE_SPECS = {
    "aegis_helm":           (0.34, True,  "armored_metal",     (170, 215), 0.35, 0.50, 1.40),
    "aegis_chestplate":     (0.52, True,  "armored_metal",     (165, 215), 0.32, 0.45, 2.10),
    "aegis_pauldron":       (0.32, True,  "armored_metal",     (35, 58),   0.45, 0.58, 1.00),
    "aegis_belt":           (0.18, True,  "leather_metal",     (165, 215), 0.35, 0.45, 1.90),
    "aegis_gauntlet":       (0.34, True,  "armored_metal",     (35, 58),   0.48, 0.62, 0.90),
    "aegis_greave":         (0.42, True,  "armored_metal",     (35, 58),   0.48, 0.62, 0.90),
    "lumen_halo":           (0.54, True,  "armored_metal",     (24, 58),   0.35, 0.55, 2.10),
    "lumen_golden_wings":   (0.95, True,  "armored_metal",     (28, 56),   0.42, 0.58, 1.35),
    "lumen_chestplate":     (0.44, True,  "armored_metal",     (32, 56),   0.45, 0.62, 1.05),
    "lumen_pauldron":       (0.30, True,  "armored_metal",     (32, 56),   0.45, 0.62, 1.05),
    "lumen_greave":         (0.40, True,  "armored_metal",     (32, 56),   0.45, 0.62, 1.05),
    "nyx_fin_crest":        (0.56, True,  "leather_metal",     (278, 338), 0.36, 0.38, 2.20),
    "nyx_visor":            (0.16, True,  "armored_metal",     (278, 338), 0.35, 0.40, 2.20),
    "nyx_chitin_blade":     (0.68, True,  "volcanic_obsidian", (275, 335), 0.40, 0.45, 1.40),
    "pyre_molten_hammer":   (1.55, True,  "volcanic_obsidian", (4, 48),    0.42, 0.38, 2.25),
    "pyre_obsidian_chest":  (0.54, True,  "volcanic_obsidian", (4, 48),    0.45, 0.48, 1.20),
    "pyre_iron_pauldron":   (0.34, True,  "armored_metal",     (4, 48),    0.48, 0.55, 1.00),
    "pyre_smith_belt":      (0.32, True,  "leather_metal",     (15, 45),   0.52, 0.65, 0.80),
    "sylva_antler_crown":   (0.52, True,  "stone_moss",        (16, 52),   0.40, 0.45, 1.85),
    "maris_coral_crown":    (0.36, True,  "crystal_ice",       (165, 215), 0.32, 0.52, 1.40),
    "maris_shell_pauldron": (0.34, True,  "crystal_ice",       (165, 295), 0.32, 0.50, 1.35),
}

FLORA_SPECS = {
    "neon_mushroom_cluster":    (2.40, False, "wet_organic",       (175, 225), 0.48, 0.62, 0.85),
    "bio_tall_mushroom":        (3.20, False, "wet_organic",       (168, 222), 0.36, 0.50, 1.25),
    "cyber_toadstool":          (2.10, False, "stone_moss",        (155, 218), 0.34, 0.42, 1.45),
    "bio_shelf_fungi":          (1.65, False, "wet_organic",       (155, 210), 0.48, 0.64, 0.85),
    "spore_bubble_fungi":       (2.20, False, "wet_organic",       (160, 215), 0.34, 0.44, 1.40),
    "cf_blue_mushroom_cluster": (2.30, False, "wet_organic",       (182, 232), 0.50, 0.64, 0.85),
    "crystalline_flower_plant": (2.60, False, "crystal_ice",       (180, 290), 0.24, 0.48, 1.45),
    "glowing_flower_pod":       (1.85, False, "wet_organic",       (185, 325), 0.50, 0.64, 0.85),
    "carnivorous_maw_plant":    (2.80, False, "wet_organic",       (175, 250), 0.35, 0.45, 1.50),
    "cyber_glowing_fern":       (1.60, False, "stone_moss",        (145, 205), 0.34, 0.44, 1.45),
    "cyber_resin_stump":        (2.40, False, "stone_moss",        (12, 54),   0.42, 0.42, 1.85),
    "cyber_lotus_aquatic":      (1.30, False, "wet_organic",       (165, 345), 0.28, 0.48, 1.35),
    "bioluminescent_tree":      (11.5, False, "stone_moss",        (185, 300), 0.48, 0.62, 0.85),
    "cyber_willow_tree":        (12.0, False, "stone_moss",        (165, 215), 0.38, 0.56, 1.15),
    "cyber_canopy_tree":        (13.0, False, "stone_moss",        (175, 230), 0.32, 0.44, 1.45),
    "cyber_oak_tree":           (14.5, False, "stone_moss",        (165, 215), 0.34, 0.46, 1.45),
    "cyber_mangrove_tree":      (10.5, False, "stone_moss",        (145, 210), 0.35, 0.46, 1.45),
    "cyber_hollow_log":         (2.80, False, "stone_moss",        (165, 215), 0.36, 0.48, 1.40),
}

STRUCT_SPECS = {
    "struct_great_oak":         (24.0, False, "stone_moss",        (165, 215), 0.42, 0.56, 1.30),
    "struct_central_platform":  (12.0, False, "stone_moss",        (165, 215), 0.40, 0.54, 1.40),
    "struct_outpost_cabin":     (6.50, False, "stone_moss",        (24, 54),   0.52, 0.68, 1.05),
    "struct_ruined_chapel":     (9.50, False, "stone_moss",        (170, 215), 0.42, 0.56, 1.45),
    "struct_watchtower":        (13.0, False, "stone_moss",        (24, 54),   0.52, 0.68, 1.05),
    "struct_rune_monolith":     (7.50, False, "stone_moss",        (165, 215), 0.38, 0.52, 1.55),
    "struct_ruin_arch":         (6.80, False, "stone_moss",        (165, 215), 0.44, 0.58, 1.35),
    "struct_forge_platform":    (6.00, False, "volcanic_obsidian", (4, 46),    0.48, 0.46, 1.65),
    "struct_ruined_forge_hall": (10.0, False, "volcanic_obsidian", (4, 46),    0.48, 0.46, 1.55),
    "struct_magma_vent":        (5.50, False, "volcanic_obsidian", (4, 46),    0.48, 0.44, 1.65),
    "struct_collapsed_furnace": (8.50, False, "volcanic_obsidian", (4, 46),    0.48, 0.46, 1.60),
    "struct_obsidian_monolith": (8.50, False, "volcanic_obsidian", (4, 46),    0.48, 0.44, 1.65),
    "struct_sunken_nave":       (14.0, False, "stone_moss",        (168, 215), 0.42, 0.54, 1.50),
    "struct_bell_tower":        (18.0, False, "stone_moss",        (168, 215), 0.46, 0.60, 1.30),
    "struct_collapsed_arch":    (8.00, False, "stone_moss",        (168, 215), 0.46, 0.60, 1.25),
    "struct_altar_relic":       (3.60, False, "stone_moss",        (28, 56),   0.48, 0.62, 1.30),
    "struct_rose_window":       (9.50, False, "crystal_ice",       (175, 260), 0.42, 0.56, 1.35),
    "struct_gargoyle_column":   (7.50, False, "stone_moss",        (168, 215), 0.46, 0.60, 1.25),
}

BATCH_CFG = {
    "wardrobe":   ("batch7_wardrobe",   WARDROBE_SPECS, "wardrobe",   28000, 1024),
    "flora":      ("batch8_flora",      FLORA_SPECS,    "flora",      52000, 2048),
    "structures": ("batch9_structures", STRUCT_SPECS,   "structures", 62000, 2048),
}


def run(cmd, cwd=ROOT, label=""):
    print(f"  -> [{label}]", flush=True)
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:], flush=True)
        raise RuntimeError(f"Step [{label}] failed with code {r.returncode}")
    return r.stdout


def pad_transparent_rgb(src_png: str, dst_png: str, flip_x: bool = False):
    arr = np.array(Image.open(src_png).convert("RGBA"))
    if flip_x:
        arr = arr[:, ::-1, :].copy()
    solid = arr[:, :, 3] >= 140
    if solid.any() and (~solid).any():
        _, (ny, nx) = distance_transform_edt(~solid, return_indices=True)
        out = arr.copy()
        out[:, :, :3] = arr[ny, nx, :3]
        Image.fromarray(out).save(dst_png)
    else:
        Image.fromarray(arr).save(dst_png)


def clean_mesh(src: str, dst: str, target_h: float, center_pivot: bool, aid: str = ""):
    m = trimesh.load(src, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    m = trimesh.Trimesh(vertices=np.asarray(m.vertices), faces=np.asarray(m.faces), process=True)
    # Punch out any thin solid center membrane inside lumen_halo ring (true hollow ring!)
    if aid == "lumen_halo":
        b0 = m.bounds
        cx0, cy0 = 0.5 * (b0[0][0] + b0[1][0]), 0.5 * (b0[0][1] + b0[1][1])
        rad = 0.5 * max(b0[1][0] - b0[0][0], b0[1][1] - b0[0][1])
        fc = m.vertices[m.faces].mean(axis=1)
        r_f = np.hypot(fc[:, 0] - cx0, fc[:, 1] - cy0)
        keep_f = r_f >= (rad * 0.68)
        if keep_f.sum() > 2000:
            m = m.submesh([np.nonzero(keep_f)[0]], append=True)
    elif aid == "cyber_willow_tree":
        b0 = m.bounds
        fc = m.vertices[m.faces].mean(axis=1)
        yn = (fc[:, 1] - b0[0][1]) / max(b0[1][1] - b0[0][1], 1e-6)
        m = m.submesh([np.nonzero(yn >= 0.028)[0]], append=True)
    elif aid == "bio_shelf_fungi":
        b0 = m.bounds
        fc = m.vertices[m.faces].mean(axis=1)
        zn = (fc[:, 2] - b0[0][2]) / max(b0[1][2] - b0[0][2], 1e-6)
        m = m.submesh([np.nonzero(zn >= 0.14)[0]], append=True)
    elif aid == "bioluminescent_tree":
        # Strip vertical flat white ruler/label card sticking out on right (+X) and back (-Z) edges
        b0 = m.bounds
        sz = np.maximum(b0[1] - b0[0], 1e-6)
        fc = m.vertices[m.faces].mean(axis=1)
        fn = m.face_normals
        xn = (fc[:, 0] - b0[0][0]) / sz[0]
        zn = (fc[:, 2] - b0[0][2]) / sz[2]
        # Vertical planar slab at far right/left of tree sheet
        is_card = ((xn > 0.72) & (np.abs(fn[:, 0]) > 0.75)) | ((zn < 0.16) & (np.abs(fn[:, 2]) > 0.85)) | ((zn > 0.84) & (np.abs(fn[:, 2]) > 0.85))
        m = m.submesh([np.nonzero(~is_card)[0]], append=True)
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        # Keep main piece + any secondary substantial parts >= 4% main face count (drops tiny floating text/ruler specs!)
        max_f = max(len(p.faces) for p in parts)
        keep_parts = [p for p in parts if len(p.faces) >= max(800, int(max_f * 0.04))]
        m = trimesh.util.concatenate(keep_parts) if len(keep_parts) > 1 else keep_parts[0]
    b = m.bounds
    h = max(float(b[1][1] - b[0][1]), 1e-6)
    m.apply_scale(target_h / h)
    b = m.bounds
    cx = 0.5 * (b[0][0] + b[1][0])
    cz = 0.5 * (b[0][2] + b[1][2])
    cy = 0.5 * (b[0][1] + b[1][1]) if center_pivot else b[0][1]
    m.apply_translation([-cx, -cy, -cz])
    m.export(dst)
    return len(m.faces)


def bake_prop_pbr(glb_path: str, hp_path: str, profile: str):
    j, b = read_glb(glb_path)
    prim = j["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    V = accessor(j, b, at["POSITION"]).astype(np.float64)
    N = accessor(j, b, at["NORMAL"]).astype(np.float64)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
    UV = accessor(j, b, at["TEXCOORD_0"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)

    mat = j["materials"][prim.get("material", 0)]
    pbr = mat.get("pbrMetallicRoughness", {})
    base_idx = get_texture_image_idx(j, pbr.get("baseColorTexture"))
    norm_idx = get_texture_image_idx(j, mat.get("normalTexture"))
    orm_idx = get_texture_image_idx(j, pbr.get("metallicRoughnessTexture"))
    base_rgb = decode_image(j, b, base_idx)
    R_sz = base_rgb.shape[0]

    ao_v = compute_mesh_ao(V, F)
    T_v, B_v = compute_vertex_tangents(V, N, UV, F)
    covered, tri_ids, bary = rasterize_uv(np.clip(UV, 0.0, 1.0), F, R_sz)
    tp = interp(V, F, tri_ids, bary)
    tn = interp(N, F, tri_ids, bary)
    tn /= np.maximum(np.linalg.norm(tn, axis=1, keepdims=True), 1e-8)
    tt = interp(T_v, F, tri_ids, bary)
    tt /= np.maximum(np.linalg.norm(tt, axis=1, keepdims=True), 1e-8)
    tb = interp(B_v, F, tri_ids, bary)
    tb /= np.maximum(np.linalg.norm(tb, axis=1, keepdims=True), 1e-8)
    t_ao = interp(ao_v[:, None], F, tri_ids, bary)[:, 0]

    hp = trimesh.load(hp_path, force="mesh")
    if isinstance(hp, trimesh.Scene):
        hp = hp.dump(concatenate=True)
    hp = trimesh.Trimesh(vertices=np.asarray(hp.vertices), faces=np.asarray(hp.faces), process=True)
    lo_min, lo_max = V.min(axis=0), V.max(axis=0)
    hp_min, hp_max = hp.bounds[0], hp.bounds[1]
    sc = float((lo_max[1] - lo_min[1]) / max(hp_max[1] - hp_min[1], 1e-6))
    hp_v = hp.vertices.copy()
    hp_v -= np.array([0.5 * (hp_min[0] + hp_max[0]), hp_min[1], 0.5 * (hp_min[2] + hp_max[2])])
    hp_v *= sc
    hp_v += np.array([0.5 * (lo_min[0] + lo_max[0]), lo_min[1], 0.5 * (lo_min[2] + lo_max[2])])
    hp_n = np.asarray(hp.vertex_normals, dtype=np.float64)

    tree = cKDTree(hp_v.astype(np.float32))
    dists, idxs = tree.query(tp.astype(np.float32), k=3, workers=-1)
    inv_w = 1.0 / (dists + 1e-5)
    inv_w /= inv_w.sum(axis=1, keepdims=True)
    n_hp = (hp_n[idxs] * inv_w[:, :, None]).sum(axis=1)
    n_hp /= np.maximum(np.linalg.norm(n_hp, axis=1, keepdims=True), 1e-8)
    tx = np.sum(n_hp * tt, axis=1)
    ty = np.sum(n_hp * tb, axis=1)
    tz = np.clip(np.sum(n_hp * tn, axis=1), 0.15, 1.0)
    n_ts = np.stack([tx, ty, tz], axis=1)
    n_ts /= np.maximum(np.linalg.norm(n_ts, axis=1, keepdims=True), 1e-8)
    norm_grid = np.zeros((R_sz, R_sz, 3), dtype=np.float32)
    norm_grid[:, :, 2] = 1.0
    norm_grid[covered] = n_ts
    norm_out = pad_charts(np.clip((norm_grid * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8), covered, iters=6)

    ao_grid = np.ones((R_sz, R_sz), dtype=np.float32)
    ao_grid[covered] = np.clip(t_ao ** 1.35, 0.20, 1.0)
    ao_u8 = pad_charts(np.repeat((ao_grid * 255.0).astype(np.uint8)[..., None], 3, axis=2), covered, iters=6)[..., 0]
    ao_f = ao_u8.astype(np.float32) / 255.0
    rough_f, metal_f = compute_smart_pbr(base_rgb, ao_f, profile)
    orm_out = np.stack([
        np.clip(ao_f * 255.0, 0, 255).astype(np.uint8),
        np.clip(rough_f * 255.0, 0, 255).astype(np.uint8),
        np.clip(metal_f * 255.0, 0, 255).astype(np.uint8),
    ], axis=-1)

    mat["occlusionTexture"] = {"index": pbr["metallicRoughnessTexture"]["index"], "strength": 0.90}
    mat.setdefault("normalTexture", {})["scale"] = 1.15
    pbr["metallicFactor"] = 1.0
    pbr["roughnessFactor"] = 1.0

    norm_bv = j["images"][norm_idx]["bufferView"]
    orm_bv = j["images"][orm_idx]["bufferView"]
    new_bvs = {
        norm_bv: encode_image(norm_out, j["images"][norm_idx].get("mimeType", "image/png")),
        orm_bv: encode_image(orm_out, j["images"][orm_idx].get("mimeType", "image/png")),
    }
    out_bin = bytearray()
    for vi, v in enumerate(j["bufferViews"]):
        off = v.get("byteOffset", 0)
        data = new_bvs.get(vi, bytes(b[off : off + v["byteLength"]]))
        while len(out_bin) % 4:
            out_bin.append(0)
        v["byteOffset"] = len(out_bin)
        v["byteLength"] = len(data)
        out_bin += data
    j["buffers"][0]["byteLength"] = len(out_bin)
    write_glb(glb_path + ".tmp", j, out_bin)
    os.replace(glb_path + ".tmp", glb_path)


def finish_group(kind: str, only_ids: list[str]):
    tag, specs, asset_sub, faces_n, tex_res = BATCH_CFG[kind]
    base_dir = os.path.join(SCRATCH, f"colab_{tag}")
    out_root = os.path.join(base_dir, "outputs")
    work_root = os.path.join(base_dir, "work")
    dst_dir = os.path.join(ASSETS_ROOT, asset_sub)
    os.makedirs(dst_dir, exist_ok=True)

    # Auto-extract zip from Downloads if present
    dl_zip = os.path.expanduser(rf"~\Downloads\{tag}_shapes.zip")
    if os.path.isfile(dl_zip) and not os.path.isdir(out_root):
        os.makedirs(out_root, exist_ok=True)
        with zipfile.ZipFile(dl_zip, "r") as zf:
            zf.extractall(out_root)
        print("Extracted:", dl_zip, flush=True)

    targets = only_ids or list(specs.keys())
    for aid in targets:
        target_h, center_piv, prof, (h0, h1), smin, vmin, gain = specs[aid]
        raw_glb = os.path.join(out_root, aid, "shape_raw.glb")
        cut_dir = os.path.join(out_root, aid, "cutouts")
        if not os.path.isfile(raw_glb):
            print(f"  [skip] {aid}: missing {raw_glb}", flush=True)
            continue

        wdir = os.path.join(work_root, aid)
        ref_dir = os.path.join(wdir, "ref")
        os.makedirs(ref_dir, exist_ok=True)
        print(f"\n==================== FINISHING {kind.upper()} {aid} ({target_h:.2f}m) ====================", flush=True)

        view_args = []
        for vn in ("front", "back", "left", "right"):
            sp = os.path.join(cut_dir, f"{vn}.png")
            if os.path.isfile(sp):
                dp = os.path.join(ref_dir, f"{vn}.png")
                pad_transparent_rgb(sp, dp, flip_x=False)
                view_args += ["--view", f"{vn}={dp}"]
        # Mirror left -> right if only left exists (clean full 4-view projection!)
        if os.path.isfile(os.path.join(cut_dir, "left.png")) and not os.path.isfile(os.path.join(cut_dir, "right.png")):
            dp = os.path.join(ref_dir, "right.png")
            pad_transparent_rgb(os.path.join(cut_dir, "left.png"), dp, flip_x=True)
            view_args += ["--view", f"right={dp}"]
        if not os.path.isfile(os.path.join(cut_dir, "back.png")) and os.path.isfile(os.path.join(cut_dir, "front.png")):
            dp = os.path.join(ref_dir, "back.png")
            pad_transparent_rgb(os.path.join(cut_dir, "front.png"), dp, flip_x=True)
            view_args += ["--view", f"back={dp}"]

        clean_glb = os.path.join(wdir, "shape_clean.glb")
        nf = clean_mesh(raw_glb, clean_glb, target_h, center_piv, aid=aid)
        print(f"  -> [clean] {nf} faces", flush=True)

        painted_glb = os.path.join(wdir, "painted.glb")
        run([
            PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
            "--mesh", clean_glb, "--out", painted_glb, "--faces", str(faces_n), "--res", str(tex_res), "--no-recenter",
            *view_args,
        ], cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{aid} paint")

        final_glb = os.path.join(dst_dir, f"{aid}.glb")
        em_tmp = os.path.join(wdir, "emissive.glb")
        run([
            PY, os.path.join(ROOT, "scripts", "riftrealm", "add_emissive.py"),
            painted_glb, em_tmp,
            "--hue", str(h0), str(h1),
            "--smin", str(smin),
            "--vmin", str(vmin),
            "--gain", str(gain),
        ], label=f"{aid} emissive")

        os.replace(em_tmp, final_glb)
        bake_prop_pbr(final_glb, clean_glb, prof)
        print(f"  -> [{kind} ready] {final_glb} ({os.path.getsize(final_glb)/1e6:.2f} MB)", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in BATCH_CFG:
        print("Usage: python finish_batch789_assets.py <wardrobe|flora|structures> [id...]")
        sys.exit(1)
    finish_group(sys.argv[1], sys.argv[2:])
