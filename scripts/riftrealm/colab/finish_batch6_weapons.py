"""Local CPU finishing pipeline for Batch 6 — 14 Standalone Socketable Weapons + Armed Paladin Boss Variant.

Outputs:
  1. 14 crisp standalone PBR+emissive weapon GLBs in `public/games/rift-realm/assets/weapons/<id>.glb`
     (normalized to realistic physical length in metres, grip pivot centered at origin (0,0,0),
     blade/tip pointing along +Y for upright display AND clean socket mounting).
  2. `public/games/rift-realm/assets/characters/robot_paladin_armed.glb` (+ `gpu/robot_paladin_armed.glb` +
     `clips/robot_paladin_armed.json`): our upgraded multi-view 58-joint `robot_paladin` with the REAL 3D sculpted
     `paladin_tech_lance` mounted cleanly as a rigid child of `RightHand` and the true 2-view 3D
     `paladin_tower_shield` mounted cleanly as a rigid child of `LeftForeArm` (zero atlas shrinkage, full 3D PBR!).
"""
import copy
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile
import numpy as np
import trimesh
from PIL import Image
from scipy.spatial.transform import Rotation as R

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch6_weapons"
OUT_ROOT = os.path.join(SCRATCH, "outputs")
WORK_ROOT = os.path.join(SCRATCH, "work")
WEAPONS_DIR = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "weapons")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CLIPS_DIR = os.path.join(CHAR_ASSETS, "clips")

sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))

from glbio import read_glb, accessor, write_glb  # noqa: E402
import ktxPack  # noqa: E402
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
from scipy.spatial import cKDTree  # noqa: E402

# (id, length_m, grip_frac_from_bottom, pbr_profile, emissive_hue, smin, vmin, gain)
WEAPON_SPECS = {
    "paladin_tech_lance":   (2.15, 0.24, "armored_metal",     (165, 215), 0.30, 0.45, 2.00),
    "paladin_tower_shield": (1.28, 0.50, "armored_metal",     (32, 58),   0.42, 0.50, 1.85),
    "cyber_greatsword":     (1.75, 0.16, "armored_metal",     (165, 210), 0.35, 0.42, 2.00),
    "void_scythe":          (2.05, 0.38, "armored_metal",     (262, 318), 0.35, 0.35, 2.10),
    "frost_longsword":      (1.45, 0.18, "crystal_ice",       (185, 232), 0.28, 0.48, 1.75),
    "shadow_dagger":        (0.58, 0.18, "armored_metal",     (175, 225), 0.30, 0.55, 1.15),
    "magma_battleaxe":      (1.38, 0.36, "volcanic_obsidian", (4, 46),    0.45, 0.38, 2.10),
    "rune_warhammer":       (1.42, 0.32, "armored_metal",     (170, 218), 0.30, 0.48, 2.10),
    "solar_shield":         (0.95, 0.50, "armored_metal",     (162, 208), 0.32, 0.45, 1.75),
    "elderwood_spear":      (2.15, 0.42, "stone_moss",        (165, 215), 0.32, 0.48, 1.40),
    "sylva_bow":            (1.48, 0.50, "stone_moss",        (162, 210), 0.32, 0.45, 1.65),
    "lumen_chakram":        (0.68, 0.50, "armored_metal",     (165, 215), 0.28, 0.52, 2.00),
    "storm_staff":          (2.10, 0.48, "crystal_ice",       (185, 235), 0.36, 0.42, 2.10),
    "coral_trident":        (2.18, 0.42, "crystal_ice",       (165, 215), 0.34, 0.45, 1.90),
}


def run(cmd, cwd=ROOT, label=""):
    print(f"  -> [{label}]", flush=True)
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:], flush=True)
        raise RuntimeError(f"Step [{label}] failed with code {r.returncode}")
    return r.stdout


def clean_weapon_shape(src: str, dst: str, target_len: float, grip_frac: float, wid: str = ""):
    m = trimesh.load(src, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        m = max(parts, key=lambda p: len(p.faces))
    # Trim rotated schematic frame off paladin_tech_lance using handle-centered symmetrical silhouette envelope
    if wid == "paladin_tech_lance":
        b0 = m.bounds
        h0 = max(float(b0[1][1] - b0[0][1]), 1e-6)
        fc = m.vertices[m.faces].mean(axis=1)
        yn = (fc[:, 1] - b0[0][1]) / h0
        # True lance symmetry axis = median X of upper handle/crossguard core (narrowest central band)
        v_yn = (m.vertices[:, 1] - b0[0][1]) / h0
        handle_v = m.vertices[(v_yn >= 0.05) & (v_yn <= 0.30) & (np.abs(m.vertices[:, 0]) < 0.12 * h0)]
        cx0 = float(np.median(handle_v[:, 0])) if len(handle_v) > 20 else 0.5 * (b0[0][0] + b0[1][0])
        taper = np.clip(1.0 - (yn - 0.84) / 0.17, 0.18, 1.0)
        xlim = np.where(
            yn < 0.33,
            0.064 * h0,
            np.where(yn < 0.56, 0.118 * h0, 0.076 * h0 * taper),
        )
        keep_f = np.abs(fc[:, 0] - cx0) <= xlim
        m = m.submesh([np.nonzero(keep_f)[0]], append=True)
        parts2 = m.split(only_watertight=False)
        if len(parts2) > 1:
            m = max(parts2, key=lambda p: len(p.faces))
        print(f"  -> [lance trim] cx={cx0:.4f}, trimmed schematic frame -> {len(m.faces)} faces", flush=True)
    b = m.bounds
    h = max(float(b[1][1] - b[0][1]), 1e-6)
    sc = target_len / h
    m.apply_scale(sc)
    b = m.bounds
    cx = 0.5 * (b[0][0] + b[1][0])
    cz = 0.5 * (b[0][2] + b[1][2])
    grip_y = b[0][1] + grip_frac * (b[1][1] - b[0][1])
    m.apply_translation([-cx, -grip_y, -cz])
    m.export(dst)
    return len(m.faces)


def pad_transparent_rgb(src_png: str, dst_png: str, clean_lance_frame: bool = False):
    from scipy.ndimage import distance_transform_edt

    arr = np.array(Image.open(src_png).convert("RGBA"))
    if clean_lance_frame:
        # Remove rotated grey schematic card around the vertical gold/cyan paladin_tech_lance
        h_im, w_im = arr.shape[:2]
        ys = np.arange(h_im)[:, None]
        xs = np.arange(w_im)[None, :]
        # Find lance center X from the saturated/dark handle+guard pixels in the central strip
        r, g, b_ch, a_ch = arr[:, :, 0].astype(np.float32), arr[:, :, 1].astype(np.float32), arr[:, :, 2].astype(np.float32), arr[:, :, 3]
        sat = np.maximum(np.maximum(r, g), b_ch) - np.minimum(np.minimum(r, g), b_ch)
        is_lance_px = (a_ch > 180) & ((sat > 22) | (np.maximum(np.maximum(r, g), b_ch) < 95))
        _, lx = np.nonzero(is_lance_px & (ys > int(h_im * 0.25)) & (ys < int(h_im * 0.85)))
        cx = float(np.median(lx)) if len(lx) > 50 else w_im * 0.5
        # Vertical silhouette envelope (y=0 top -> y=h_im bottom; yn_bot=0 bottom -> 1 top)
        yn_bot = 1.0 - (ys / max(h_im - 1, 1))
        taper = np.clip(1.0 - (yn_bot - 0.82) / 0.19, 0.16, 1.0)
        xlim_px = np.where(
            yn_bot < 0.34,
            0.085 * h_im,
            np.where(yn_bot < 0.57, 0.145 * h_im, 0.095 * h_im * taper),
        )
        # Keep inside envelope AND reject bright low-saturation white/grey card pixels on outer margin
        bright_grey = (sat < 18) & (np.minimum(np.minimum(r, g), b_ch) > 150)
        outside = (np.abs(xs - cx) > xlim_px) | (bright_grey & (np.abs(xs - cx) > 0.045 * h_im))
        arr[outside, 3] = 0
    solid = arr[:, :, 3] >= 140
    if solid.any() and (~solid).any():
        _, (ny, nx) = distance_transform_edt(~solid, return_indices=True)
        out = arr.copy()
        out[:, :, :3] = arr[ny, nx, :3]
        Image.fromarray(out).save(dst_png)
    else:
        Image.fromarray(arr).save(dst_png)


def bake_weapon_pbr(glb_path: str, hp_path: str, profile: str):
    """Bake real HP tangent-space normal + 3D solid-angle AO + smart metallic/roughness PBR onto weapon GLB."""
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
    parts = hp.split(only_watertight=False)
    if len(parts) > 1:
        hp = max(parts, key=lambda p: len(p.faces))
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
    write_glb(glb_path, j, out_bin)


def finish_weapon(wid: str):
    length_m, grip_frac, profile, (h0, h1), smin, vmin, gain = WEAPON_SPECS[wid]
    raw_glb = os.path.join(OUT_ROOT, wid, "shape_raw.glb")
    cut_dir = os.path.join(OUT_ROOT, wid, "cutouts")
    if not os.path.isfile(raw_glb):
        print(f"  [skip] {wid}: missing {raw_glb}", flush=True)
        return
    wdir = os.path.join(WORK_ROOT, wid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    os.makedirs(WEAPONS_DIR, exist_ok=True)
    print(f"\n==================== FINISHING WEAPON {wid} ({length_m:.2f}m) ====================", flush=True)

    is_lance = wid == "paladin_tech_lance"
    pad_transparent_rgb(os.path.join(cut_dir, "front.png"), os.path.join(ref_dir, "front.png"), clean_lance_frame=is_lance)
    pad_transparent_rgb(os.path.join(cut_dir, "back.png"), os.path.join(ref_dir, "back.png"), clean_lance_frame=is_lance)

    clean_glb = os.path.join(wdir, "shape_clean.glb")
    clean_weapon_shape(raw_glb, clean_glb, length_m, grip_frac, wid=wid)

    painted_glb = os.path.join(wdir, "painted.glb")
    run([
        PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh", clean_glb, "--out", painted_glb, "--faces", "32000", "--res", "1024", "--no-recenter",
        "--view", f"front={os.path.join(ref_dir, 'front.png')}",
        "--view", f"back={os.path.join(ref_dir, 'back.png')}",
    ], cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{wid} paint")

    final_glb = os.path.join(WEAPONS_DIR, f"{wid}.glb")
    run([
        PY, os.path.join(ROOT, "scripts", "riftrealm", "add_emissive.py"),
        painted_glb, final_glb,
        "--hue", str(h0), str(h1),
        "--smin", str(smin),
        "--vmin", str(vmin),
        "--gain", str(gain),
    ], label=f"{wid} emissive")

    bake_weapon_pbr(final_glb, clean_glb if is_lance else raw_glb, profile)
    print(f"  -> [weapon ready] {final_glb} ({os.path.getsize(final_glb)/1e6:.2f} MB)", flush=True)


def append_glb_prop_to_bone(host_j: dict, host_bin: bytearray, prop_glb: str, bone_name: str, prop_name: str, trans, euler_deg, scale: float = 1.0):
    """Attach a complete textured 3D prop GLB cleanly as a rigid child node of a named skeleton bone."""
    pj, pb = read_glb(prop_glb)
    bv_off = len(host_j["bufferViews"])
    acc_off = len(host_j["accessors"])
    img_off = len(host_j.get("images", []))
    tex_off = len(host_j.get("textures", []))
    mat_off = len(host_j.get("materials", []))
    mesh_off = len(host_j.get("meshes", []))
    samp_off = len(host_j.get("samplers", []))

    host_j.setdefault("images", [])
    host_j.setdefault("textures", [])
    host_j.setdefault("materials", [])
    host_j.setdefault("samplers", [])

    # Copy bufferViews
    for bv in pj.get("bufferViews", []):
        o = bv.get("byteOffset", 0)
        chunk = bytes(pb[o : o + bv["byteLength"]])
        while len(host_bin) % 4:
            host_bin.append(0)
        nbv = copy.deepcopy(bv)
        nbv["buffer"] = 0
        nbv["byteOffset"] = len(host_bin)
        host_bin += chunk
        host_j["bufferViews"].append(nbv)

    for acc in pj.get("accessors", []):
        na = copy.deepcopy(acc)
        if "bufferView" in na:
            na["bufferView"] += bv_off
        host_j["accessors"].append(na)

    for s in pj.get("samplers", []):
        host_j["samplers"].append(copy.deepcopy(s))

    for im in pj.get("images", []):
        ni = copy.deepcopy(im)
        if "bufferView" in ni:
            ni["bufferView"] += bv_off
        host_j["images"].append(ni)

    for tx in pj.get("textures", []):
        nt = copy.deepcopy(tx)
        if "source" in nt:
            nt["source"] += img_off
        if "sampler" in nt:
            nt["sampler"] += samp_off
        if "extensions" in nt and "EXT_texture_webp" in nt["extensions"]:
            nt["extensions"]["EXT_texture_webp"]["source"] += img_off
        host_j["textures"].append(nt)

    def remap_tex_ref(d):
        if isinstance(d, dict) and "index" in d:
            d["index"] += tex_off

    for mt in pj.get("materials", []):
        nm = copy.deepcopy(mt)
        nm["name"] = f"{prop_name}_{nm.get('name', 'mat')}"
        pbr = nm.get("pbrMetallicRoughness", {})
        remap_tex_ref(pbr.get("baseColorTexture"))
        remap_tex_ref(pbr.get("metallicRoughnessTexture"))
        remap_tex_ref(nm.get("normalTexture"))
        remap_tex_ref(nm.get("occlusionTexture"))
        remap_tex_ref(nm.get("emissiveTexture"))
        host_j["materials"].append(nm)

    # Remap mesh primitives
    pm = copy.deepcopy(pj["meshes"][0])
    pm["name"] = f"{prop_name}_mesh"
    for pr in pm["primitives"]:
        if "indices" in pr:
            pr["indices"] += acc_off
        for k in list(pr["attributes"].keys()):
            pr["attributes"][k] += acc_off
        if "material" in pr:
            pr["material"] += mat_off
    host_j["meshes"].append(pm)

    # Find bone node and attach child rigid prop node
    bone_idx = next((i for i, nd in enumerate(host_j["nodes"]) if nd.get("name") == bone_name), None)
    if bone_idx is None:
        raise RuntimeError(f"Bone {bone_name} not found in host GLB")
    q = R.from_euler("xyz", euler_deg, degrees=True).as_quat().tolist()
    node_idx = len(host_j["nodes"])
    host_j["nodes"].append({
        "name": prop_name,
        "mesh": mesh_off,
        "translation": [float(x) for x in trans],
        "rotation": [float(x) for x in q],
        "scale": [float(scale), float(scale), float(scale)],
    })
    host_j["nodes"][bone_idx].setdefault("children", []).append(node_idx)

    # Merge extensionsUsed
    if pj.get("extensionsUsed"):
        host_j["extensionsUsed"] = sorted(set(host_j.get("extensionsUsed", [])) | set(pj["extensionsUsed"]))


def build_armed_paladin():
    """Assemble `robot_paladin_armed.glb` by mounting 3D Tech-Lance (RightHand) & Tower Shield (LeftForeArm)."""
    base_glb = os.path.join(CHAR_ASSETS, "robot_paladin.glb")
    lance_glb = os.path.join(WEAPONS_DIR, "paladin_tech_lance.glb")
    shield_glb = os.path.join(WEAPONS_DIR, "paladin_tower_shield.glb")
    if not (os.path.isfile(base_glb) and os.path.isfile(lance_glb) and os.path.isfile(shield_glb)):
        print("  [skip] armed paladin: missing base/lance/shield GLB", flush=True)
        return

    print("\n==================== ASSEMBLING ROBOT PALADIN ARMED (BOSS VARIANT) ====================", flush=True)
    j, b = read_glb(base_glb)
    # RightHand holds Massive Tech-Lance angled slightly forward-outward clearing the pauldron cleanly
    append_glb_prop_to_bone(j, b, lance_glb, "RightHand", "paladin_tech_lance", trans=[-0.02, -0.04, 0.05], euler_deg=[14.0, 0.0, -14.0], scale=0.88)
    # LeftForeArm mounts Heavy Tower Shield on outer-left forearm (+X outward, broad face toward +X/+Z)
    append_glb_prop_to_bone(j, b, shield_glb, "LeftForeArm", "paladin_tower_shield", trans=[0.14, -0.14, 0.05], euler_deg=[0.0, 82.0, -12.0], scale=0.82)
    j["buffers"][0]["byteLength"] = len(b)

    out_glb = os.path.join(CHAR_ASSETS, "robot_paladin_armed.glb")
    write_glb(out_glb + ".tmp", j, b)
    os.replace(out_glb + ".tmp", out_glb)
    shutil.copy2(os.path.join(CLIPS_DIR, "robot_paladin.json"), os.path.join(CLIPS_DIR, "robot_paladin_armed.json"))
    ktxPack.pack_glb(out_glb)
    print(f"  -> [armed paladin] {out_glb} ({os.path.getsize(out_glb)/1e6:.2f} MB) + KTX2 + clips", flush=True)


def main():
    dl_zip = os.path.expanduser(r"~\Downloads\batch6_weapons_shapes.zip")
    if os.path.isfile(dl_zip) and not os.path.isdir(OUT_ROOT):
        os.makedirs(OUT_ROOT, exist_ok=True)
        with zipfile.ZipFile(dl_zip, "r") as zf:
            zf.extractall(OUT_ROOT)
        print("Extracted:", dl_zip)

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    weapons_only = "--weapons-only" in sys.argv[1:]
    targets = args or list(WEAPON_SPECS.keys())
    for wid in targets:
        finish_weapon(wid)
    if not weapons_only:
        build_armed_paladin()


if __name__ == "__main__":
    main()
