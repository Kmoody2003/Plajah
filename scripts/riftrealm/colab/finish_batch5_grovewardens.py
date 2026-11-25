"""Local CPU finishing pipeline for Batch 5 — All 12 Grovewardens (Tree Ents).

Matches the exact 12 species in games/rift-realm/src/ents/wardens.ts:
  ent_ancient_oak, ent_banyan, ent_baobab, ent_bioluminescent, ent_cherry_blossom, ent_fungal_spore,
  ent_ironwood_thorn, ent_pine_sentinel, ent_sequoia, ent_swamp_mangrove, ent_weeping_willow, ent_white_birch

Pipeline per Grovewarden:
  1. Clean largest connected mesh from Hunyuan3D-2mv shape_raw.glb.
  2. Multi-view 2048 PBR paint (70,000 faces) from front, back, left, mirrored right.
  3. Species-tuned emissive map (Banyan amber heart, Ironwood crimson core, Bioluminescent cyan-violet canopy,
     Fungal glowing caps, White Birch frost-cyan eyes, Sakura glow, sap-lit eyes).
  4. Symmetrical canopy-safe 58-joint Character Forge rig (exact Hips/Spine2/Head/LeftArm/LeftUpLeg contract!)
     + arm/torso/canopy weight isolation + world-space retargeted clips (`clips/ent_<id>.json`).
  5. Real 200k HP tangent-space normal bake + 3D multi-scale solid-angle AO + stone/bark/moss PBR + KTX2 pack.
"""
import json
import os
import shutil
import subprocess
import sys
import zipfile
import numpy as np
import trimesh
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch5_grovewardens"
OUT_ROOT = os.path.join(SCRATCH, "outputs")
WORK_ROOT = os.path.join(SCRATCH, "work")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CLIPS_DIR = os.path.join(CHAR_ASSETS, "clips")

sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))

from glbio import accessor  # noqa: E402
from bake_pbr_maps import bake_character_pbr, MATERIAL_PROFILES, BATCH_SEARCH_ORDER  # noqa: E402
from clean_skin_and_webs import clean_and_reskin_humanoid  # noqa: E402
from fix_humanoid_rigs_and_clips import (  # noqa: E402
    REF_GLB,
    REF_CLIPS,
    BULKY_IDS,
    extract_joints,
    fit_clean_humanoid_anchors,
    write_reanchored_contract_glb,
    retarget_clip_library,
)

# Register Batch 5 search folder & stone_moss/bulky profiles dynamically
if "colab_batch5_grovewardens" not in BATCH_SEARCH_ORDER:
    BATCH_SEARCH_ORDER.insert(0, "colab_batch5_grovewardens")

WARDEN_EMISSIVE = {
    "ent_ancient_oak":    {"hue": (24, 58),  "smin": 0.45, "vmin": 0.52, "gain": 1.35, "profile": "stone_moss"},
    "ent_banyan":         {"hue": (16, 52),  "smin": 0.44, "vmin": 0.42, "gain": 1.85, "profile": "stone_moss"},
    "ent_baobab":         {"hue": (26, 68),  "smin": 0.45, "vmin": 0.56, "gain": 1.25, "profile": "stone_moss"},
    "ent_bioluminescent": {"hue": (170, 298),"smin": 0.34, "vmin": 0.38, "gain": 1.85, "profile": "crystal_ice"},
    "ent_cherry_blossom": {"hue": (305, 355),"smin": 0.34, "vmin": 0.62, "gain": 0.95, "profile": "stone_moss"},
    "ent_fungal_spore":   {"hue": (10, 46),  "smin": 0.48, "vmin": 0.44, "gain": 1.70, "profile": "wet_organic"},
    "ent_ironwood_thorn": {"hue": (0, 26),   "smin": 0.48, "vmin": 0.38, "gain": 1.95, "profile": "volcanic_obsidian"},
    "ent_pine_sentinel":  {"hue": (22, 54),  "smin": 0.48, "vmin": 0.50, "gain": 1.45, "profile": "stone_moss"},
    "ent_sequoia":        {"hue": (24, 58),  "smin": 0.48, "vmin": 0.54, "gain": 1.30, "profile": "stone_moss"},
    "ent_swamp_mangrove": {"hue": (70, 145), "smin": 0.46, "vmin": 0.52, "gain": 1.35, "profile": "wet_organic"},
    "ent_weeping_willow": {"hue": (75, 135), "smin": 0.48, "vmin": 0.56, "gain": 1.20, "profile": "stone_moss"},
    "ent_white_birch":    {"hue": (175, 224),"smin": 0.32, "vmin": 0.52, "gain": 1.65, "profile": "crystal_ice"},
}


def run(cmd, cwd=ROOT, label="", shell=False):
    print(f"  -> [{label}]", flush=True)
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, shell=shell)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:], flush=True)
        raise RuntimeError(f"Step [{label}] failed with code {r.returncode}")
    return r.stdout


def clean_shape(src: str, dst: str):
    m = trimesh.load(src, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        m = max(parts, key=lambda p: len(p.faces))
    b = m.bounds
    m.apply_translation([-0.5 * (b[0][0] + b[1][0]), -b[0][1], -0.5 * (b[0][2] + b[1][2])])
    m.export(dst)
    print(f"  -> [clean] {len(parts)} parts -> {len(m.faces)} faces", flush=True)


def pad_transparent_rgb(src_png: str, dst_png: str, flip_x: bool = False):
    from scipy.ndimage import distance_transform_edt

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


def finish_warden(cid: str, ref_pos: dict, ref_clips_data: dict):
    spec = WARDEN_EMISSIVE[cid]
    MATERIAL_PROFILES[cid] = spec["profile"]
    BULKY_IDS.add(cid)

    cut_dir = os.path.join(OUT_ROOT, cid, "cutouts")
    raw_glb = os.path.join(OUT_ROOT, cid, "shape_raw.glb")
    if not os.path.isfile(raw_glb):
        print(f"  [skip] {cid}: missing {raw_glb}", flush=True)
        return

    wdir = os.path.join(WORK_ROOT, cid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    print(f"\n==================== FINISHING GROVEWARDEN {cid} ====================", flush=True)

    for vname in ("front", "back", "left"):
        pad_transparent_rgb(os.path.join(cut_dir, f"{vname}.png"), os.path.join(ref_dir, f"{vname}.png"), flip_x=False)
    pad_transparent_rgb(os.path.join(cut_dir, "left.png"), os.path.join(ref_dir, "right.png"), flip_x=True)

    clean_glb = os.path.join(wdir, "shape_clean.glb")
    clean_shape(raw_glb, clean_glb)

    painted_glb = os.path.join(wdir, "painted.glb")
    run([
        PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh", clean_glb, "--out", painted_glb, "--faces", "70000", "--res", "2048",
        "--view", f"front={os.path.join(ref_dir, 'front.png')}",
        "--view", f"back={os.path.join(ref_dir, 'back.png')}",
        "--view", f"left={os.path.join(ref_dir, 'left.png')}",
        "--view", f"right={os.path.join(ref_dir, 'right.png')}",
    ], cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{cid} paint")

    em_glb = os.path.join(wdir, "emissive.glb")
    h0, h1 = spec["hue"]
    run([
        PY, os.path.join(ROOT, "scripts", "riftrealm", "add_emissive.py"),
        painted_glb, em_glb,
        "--hue", str(h0), str(h1),
        "--smin", str(spec["smin"]),
        "--vmin", str(spec["vmin"]),
        "--gain", str(spec["gain"]),
    ], label=f"{cid} emissive")

    rigged_glb = os.path.join(wdir, "rigged.glb")
    joints_json = os.path.join(wdir, "joints.json")
    run([
        PY, os.path.join(ROOT, "scripts", "ravencrest", "autoRig.py"),
        "--rig", os.path.join(ROOT, "public", "games", "ravencrest", "assets", "characters", "muse", "vampire.glb"),
        "--mesh", em_glb, "--out", rigged_glb, "--debug", joints_json,
    ], label=f"{cid} autoRig")

    j, b, cur_pos = extract_joints(rigged_glb)
    V = accessor(j, b, j["meshes"][0]["primitives"][0]["attributes"]["POSITION"]).astype(np.float64)
    clean_P = fit_clean_humanoid_anchors(V, cur_pos)
    reanch_glb = os.path.join(wdir, "reanchored.glb")
    write_reanchored_contract_glb(rigged_glb, reanch_glb, clean_P)

    final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    forged_glb = os.path.join(wdir, "forged.glb")
    run(
        ["npx", "tsx", os.path.join(ROOT, "scripts", "eraclash3d", "forgeRigMesh.ts"), reanch_glb, forged_glb, "--name", cid, "--hold", "Right:relaxed,Left:relaxed"],
        label=f"{cid} forgeRig58",
        shell=True,
    )
    shutil.copy2(forged_glb, final_glb + ".tmp")
    os.replace(final_glb + ".tmp", final_glb)

    qa = clean_and_reskin_humanoid(final_glb, repack_ktx2=False)
    _, _, dst_pos = extract_joints(final_glb)
    retargeted = retarget_clip_library(ref_pos, dst_pos, ref_clips_data, cid)
    with open(os.path.join(CLIPS_DIR, f"{cid}.json"), "w", encoding="utf-8") as f:
        json.dump(retargeted, f)
    print(f"  -> [rig] p99.5={qa['p99']:.2f}x max_st={qa['max_stretch']:.2f}x, retargeted {len(retargeted['clips'])} clips", flush=True)

    # Real 200k HP tangent-space normal + 3D multi-scale solid-angle AO + PBR + KTX2 pack!
    bake_character_pbr(cid, hp_override=raw_glb)


def main():
    dl_zip = os.path.expanduser(r"~\Downloads\batch5_grovewardens_shapes.zip")
    if os.path.isfile(dl_zip) and not os.path.isdir(OUT_ROOT):
        os.makedirs(OUT_ROOT, exist_ok=True)
        with zipfile.ZipFile(dl_zip, "r") as zf:
            zf.extractall(OUT_ROOT)
        print("Extracted:", dl_zip)

    _, _, ref_pos = extract_joints(REF_GLB)
    with open(REF_CLIPS, "r", encoding="utf-8") as f:
        ref_clips_data = json.load(f)

    targets = sys.argv[1:] or list(WARDEN_EMISSIVE.keys())
    for cid in targets:
        finish_warden(cid, ref_pos, ref_clips_data)


if __name__ == "__main__":
    main()
