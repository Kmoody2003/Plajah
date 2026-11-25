"""Local CPU finishing pipeline for Vesselbound Batch 2B (7 characters) + Batch 2C Humanoids (3 characters) = 10 models.

Batch 2B:
  - cyber_assassin, shadow_assassin, female_warrior, sorceress, demon_warrior, pyre_knight, gorgon_construct
Batch 2C Humanoids:
  - android_a, android_b, moss_golem

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/riftrealm/colab/finish_batch2b.py [id ...]
"""
import json
import os
import shutil
import subprocess
import sys
import numpy as np
import trimesh
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

B2B_SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2b"
B2C_SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2c"
WORK_ROOT = os.path.join(B2B_SCRATCH, "work")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CLIPS_DIR = os.path.join(CHAR_ASSETS, "clips")

sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))

SPECS = {
    "cyber_assassin": {
        "src_root": os.path.join(B2B_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (115, 175), "emissive_smin": 0.34, "emissive_vmin": 0.38, "emissive_gain": 1.65,
        "clip_donor": "void_stalker", "hold": "Right:dagger,Left:dagger",
    },
    "shadow_assassin": {
        "src_root": os.path.join(B2B_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (278, 342), "emissive_smin": 0.34, "emissive_vmin": 0.35, "emissive_gain": 1.75,
        "clip_donor": "void_stalker", "hold": "Right:dagger,Left:dagger",
    },
    "female_warrior": {
        "src_root": os.path.join(B2B_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (168, 215), "emissive_smin": 0.34, "emissive_vmin": 0.40, "emissive_gain": 1.65,
        "clip_donor": "void_stalker", "hold": "Right:dagger,Left:relaxed",
    },
    "sorceress": {
        "src_root": os.path.join(B2B_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (182, 232), "emissive_smin": 0.34, "emissive_vmin": 0.40, "emissive_gain": 1.60,
        "clip_donor": "void_stalker", "hold": "Right:dagger,Left:relaxed",
    },
    "demon_warrior": {
        "src_root": os.path.join(B2B_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (10, 52), "emissive_smin": 0.44, "emissive_vmin": 0.36, "emissive_gain": 1.75,
        "clip_donor": "robot_paladin", "hold": "Right:fist,Left:fist",
    },
    "pyre_knight": {
        "src_root": os.path.join(B2B_SCRATCH, "outputs"),
        "paint_views": ["front", "back"],
        "emissive_hue": (6, 48), "emissive_smin": 0.44, "emissive_vmin": 0.36, "emissive_gain": 1.75,
        "clip_donor": "robot_paladin", "hold": "Right:fist,Left:fist",
    },
    "gorgon_construct": {
        "src_root": os.path.join(B2B_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (162, 212), "emissive_smin": 0.34, "emissive_vmin": 0.38, "emissive_gain": 1.65,
        "clip_donor": "void_stalker", "hold": "Right:dagger,Left:relaxed",
    },
    "android_a": {
        "src_root": os.path.join(B2C_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (165, 218), "emissive_smin": 0.32, "emissive_vmin": 0.42, "emissive_gain": 1.60,
        "clip_donor": "void_stalker", "hold": "Right:dagger,Left:relaxed",
    },
    "android_b": {
        "src_root": os.path.join(B2C_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (170, 228), "emissive_smin": 0.32, "emissive_vmin": 0.42, "emissive_gain": 1.60,
        "clip_donor": "void_stalker", "hold": "Right:dagger,Left:relaxed",
    },
    "moss_golem": {
        "src_root": os.path.join(B2C_SCRATCH, "outputs"),
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (105, 165), "emissive_smin": 0.42, "emissive_vmin": 0.42, "emissive_gain": 1.70,
        "clip_donor": "robot_paladin", "hold": "Right:fist,Left:fist",
    },
}


def run(cmd, cwd=ROOT, label=""):
    print(f"  -> [{label}]")
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.stdout.strip():
        for line in r.stdout.strip().splitlines()[-5:]:
            print("     ", line)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:])
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
    print(f"  -> [clean] {len(parts)} parts -> {len(m.faces)} faces, extents={np.round(m.extents, 3).tolist()}")


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


def glb_hips_pos(glb_path: str) -> np.ndarray:
    from glbio import read_glb, accessor

    j, b = read_glb(glb_path)
    skin = j["skins"][0]
    ibm = accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4)
    for k, node_idx in enumerate(skin["joints"]):
        if j["nodes"][node_idx].get("name", "").endswith("Hips"):
            m = ibm[k].T
            return -(m[:3, :3].T @ m[:3, 3])
    return np.array([0.0, 1.0, 0.0])


def retarget_clips_json(donor_id: str, dst_id: str, dst_glb: str):
    donor_glb = os.path.join(CHAR_ASSETS, f"{donor_id}.glb")
    donor_clips = os.path.join(CLIPS_DIR, f"{donor_id}.json")
    dst_clips = os.path.join(CLIPS_DIR, f"{dst_id}.json")

    src_hips = glb_hips_pos(donor_glb)
    dst_hips = glb_hips_pos(dst_glb)
    scale_y = float(np.clip(dst_hips[1] / max(0.2, src_hips[1]), 0.45, 1.35))
    dz = float(dst_hips[2] - src_hips[2] * scale_y)

    with open(donor_clips, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["id"] = dst_id
    data["retargetedFrom"] = donor_id
    data["hipsScaleY"] = round(scale_y, 4)

    for clip in data.get("clips", []):
        for tr in clip.get("tracks", []):
            if tr.get("name", "").endswith("Hips.position"):
                vals = tr["values"]
                for i in range(0, len(vals), 3):
                    vals[i] = vals[i] * scale_y
                    vals[i + 1] = vals[i + 1] * scale_y
                    vals[i + 2] = vals[i + 2] * scale_y + dz

    os.makedirs(CLIPS_DIR, exist_ok=True)
    with open(dst_clips, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"  -> [clips] {len(data['clips'])} clips from {donor_id} (scale={scale_y:.3f})")


def apply_art_emissive_webp(glb_in: str, glb_out: str, view_paths: dict, hue, smin: float, vmin: float, gain: float):
    from rr_parts import Rig

    rig = Rig(glb_in)
    rig.project_emissive(view_paths, hue, smin=smin, vmin=vmin, gain=gain)
    rig.save(glb_out)
    print("  -> [emissive]", " | ".join(rig.log))


def finish_one(cid: str):
    spec = SPECS[cid]
    src_dir = os.path.join(spec["src_root"], cid)
    cut_dir = os.path.join(src_dir, "cutouts")
    raw_glb = os.path.join(src_dir, "shape_raw.glb")
    wdir = os.path.join(WORK_ROOT, cid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    print(f"\n==================== FINISHING {cid} ====================")

    for vname in ("front", "back", "left"):
        src = os.path.join(cut_dir, f"{vname}.png")
        if os.path.isfile(src):
            pad_transparent_rgb(src, os.path.join(ref_dir, f"{vname}.png"), flip_x=False)
    left_src = os.path.join(cut_dir, "left.png")
    if os.path.isfile(left_src):
        pad_transparent_rgb(left_src, os.path.join(ref_dir, "right.png"), flip_x=True)
        shutil.copy2(os.path.join(ref_dir, "left.png"), os.path.join(ref_dir, "side.png"))

    clean_glb = os.path.join(wdir, "shape_clean.glb")
    clean_shape(raw_glb, clean_glb)

    painted_glb = os.path.join(wdir, "painted.glb")
    paint_cmd = [
        PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh", clean_glb, "--out", painted_glb, "--faces", "58000", "--res", "2048",
    ]
    for vk in spec["paint_views"]:
        paint_cmd += ["--view", f"{vk}={os.path.join(ref_dir, vk + '.png')}"]
    run(paint_cmd, cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{cid} paint")

    rigged_glb = os.path.join(wdir, "rigged.glb")
    joints_json = os.path.join(wdir, "joints.json")
    run([
        PY, os.path.join(ROOT, "scripts", "ravencrest", "autoRig.py"),
        "--rig", os.path.join(ROOT, "public", "games", "ravencrest", "assets", "characters", "muse", "vampire.glb"),
        "--mesh", painted_glb, "--out", rigged_glb, "--debug", joints_json,
    ], label=f"{cid} autoRig")

    geo_glb = os.path.join(wdir, "geo.glb")
    run([PY, os.path.join(ROOT, "scripts", "riftrealm", "geo_weights.py"), rigged_glb, joints_json, geo_glb], label=f"{cid} geo_weights")

    parts_glb = os.path.join(wdir, "parts.glb")
    vpaths = {vk: os.path.join(ref_dir, f"{vk}.png") for vk in spec["paint_views"]}
    apply_art_emissive_webp(geo_glb, parts_glb, vpaths, spec["emissive_hue"], spec["emissive_smin"], spec["emissive_vmin"], spec["emissive_gain"])

    final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    os.makedirs(CHAR_ASSETS, exist_ok=True)
    run([
        "node", os.path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
        os.path.join(ROOT, "scripts", "eraclash3d", "forgeRigMesh.ts"),
        parts_glb, final_glb, "--name", cid, "--hold", spec["hold"],
    ], label=f"{cid} forgeRigMesh")

    retarget_clips_json(spec["clip_donor"], cid, final_glb)

    render_dir = os.path.join(wdir, "render_all")
    run(["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, render_dir], label=f"{cid} render")
    if not os.path.isfile(os.path.join(ref_dir, "side.png")):
        shutil.copy2(os.path.join(render_dir, "side.png"), os.path.join(ref_dir, "side.png"))
    score_dir = os.path.join(wdir, "score")
    run([PY, os.path.join(ROOT, "scripts", "riftrealm", "score_views.py"), render_dir, ref_dir, score_dir], label=f"{cid} score")
    print(f"DONE {cid} -> {final_glb} ({os.path.getsize(final_glb) / 1e6:.2f} MB)")


def main():
    targets = sys.argv[1:] or list(SPECS.keys())
    for cid in targets:
        finish_one(cid)


if __name__ == "__main__":
    main()
