"""Local CPU finishing pipeline for Batch 4 Redo (Multi-View Hunyuan3D-2mv Void Stalker & Robot Paladin).

Upgrades:
  - void_stalker:   2048 multi-view PBR + geodesic 58-joint Forge rig + magenta emissive + animated BatWings cloak
                    (Spine2) + twin curved daggers (LeftHand/RightHand) via vs_parts.py + KTX2 pack.
  - robot_paladin:  2048 multi-view PBR + geodesic 58-joint Forge rig + cyan visor/thruster emissive (clean unarmed
                    body so Aegis weapon sockets never collide with baked weapons!) + KTX2 pack.

Backs up original GLBs & clip JSONs to scratch/colab_batch4_redo/backup_orig/ first.
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

SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch4_redo"
OUT_ROOT = os.path.join(SCRATCH, "outputs")
WORK_ROOT = os.path.join(SCRATCH, "work")
BAK_ROOT = os.path.join(SCRATCH, "backup_orig")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CLIPS_DIR = os.path.join(CHAR_ASSETS, "clips")

sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
import ktxPack


def run(cmd, cwd=ROOT, label=""):
    print(f"  -> [{label}]")
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.stdout.strip():
        for line in r.stdout.strip().splitlines()[-6:]:
            print("     ", line)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:])
        raise RuntimeError(f"Step [{label}] failed with code {r.returncode}")
    return r.stdout


def clean_shape_strip_floor(src: str, dst: str, floor_cut: float = 0.026):
    """Remove thin floor-ring/pedestal slivers at y < floor_cut and keep largest connected character body."""
    m = trimesh.load(src, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    tri_y = m.vertices[m.faces][:, :, 1].mean(axis=1)
    keep_f = tri_y >= (m.bounds[0][1] + floor_cut)
    m = m.submesh([np.nonzero(keep_f)[0]], append=True)
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        m = max(parts, key=lambda p: len(p.faces))
    b = m.bounds
    m.apply_translation([-0.5 * (b[0][0] + b[1][0]), -b[0][1], -0.5 * (b[0][2] + b[1][2])])
    m.export(dst)
    print(f"  -> [clean] stripped floor<{floor_cut}m, {len(parts)} parts -> {len(m.faces)} faces, extents={np.round(m.extents, 3).tolist()}")


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


def rescale_own_clips(cid: str, orig_glb: str, orig_clips: str, new_glb: str):
    src_hips = glb_hips_pos(orig_glb)
    dst_hips = glb_hips_pos(new_glb)
    scale_y = float(np.clip(dst_hips[1] / max(0.2, src_hips[1]), 0.75, 1.25))
    dz = float(dst_hips[2] - src_hips[2] * scale_y)
    with open(orig_clips, "r", encoding="utf-8") as f:
        data = json.load(f)
    for clip in data.get("clips", []):
        for tr in clip.get("tracks", []):
            if tr.get("name", "").endswith("Hips.position"):
                vals = tr["values"]
                for i in range(0, len(vals), 3):
                    vals[i] = vals[i] * scale_y
                    vals[i + 1] = vals[i + 1] * scale_y
                    vals[i + 2] = vals[i + 2] * scale_y + dz
    dst_clips = os.path.join(CLIPS_DIR, f"{cid}.json")
    with open(dst_clips, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"  -> [clips] rescaled {len(data['clips'])} clips for {cid} (hipsY {src_hips[1]:.3f} -> {dst_hips[1]:.3f}, scale={scale_y:.3f})")


def finish_hero(cid: str):
    os.makedirs(BAK_ROOT, exist_ok=True)
    orig_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    bak_glb = os.path.join(BAK_ROOT, f"{cid}.glb")
    orig_clips = os.path.join(CLIPS_DIR, f"{cid}.json")
    bak_clips = os.path.join(BAK_ROOT, f"{cid}.json")
    if os.path.isfile(orig_glb) and not os.path.isfile(bak_glb):
        shutil.copy2(orig_glb, bak_glb)
    if os.path.isfile(orig_clips) and not os.path.isfile(bak_clips):
        shutil.copy2(orig_clips, bak_clips)

    cut_dir = os.path.join(OUT_ROOT, cid, "cutouts")
    raw_glb = os.path.join(OUT_ROOT, cid, "shape_raw.glb")
    wdir = os.path.join(WORK_ROOT, cid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    print(f"\n==================== REDO FINISHING {cid} ====================")

    for vname in ("front", "back", "left"):
        pad_transparent_rgb(os.path.join(cut_dir, f"{vname}.png"), os.path.join(ref_dir, f"{vname}.png"), flip_x=False)
    pad_transparent_rgb(os.path.join(cut_dir, "left.png"), os.path.join(ref_dir, "right.png"), flip_x=True)
    shutil.copy2(os.path.join(ref_dir, "left.png"), os.path.join(ref_dir, "side.png"))

    clean_glb = os.path.join(wdir, "shape_clean.glb")
    clean_shape_strip_floor(raw_glb, clean_glb, floor_cut=0.026)

    painted_glb = os.path.join(wdir, "painted.glb")
    run([
        PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh", clean_glb, "--out", painted_glb, "--faces", "58000", "--res", "2048",
        "--view", f"front={os.path.join(ref_dir, 'front.png')}",
        "--view", f"back={os.path.join(ref_dir, 'back.png')}",
        "--view", f"left={os.path.join(ref_dir, 'left.png')}",
        "--view", f"right={os.path.join(ref_dir, 'right.png')}",
    ], cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{cid} paint")

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
    vpaths = {vk: os.path.join(ref_dir, f"{vk}.png") for vk in ("front", "back", "left", "right")}
    from rr_parts import Rig
    rig = Rig(geo_glb)

    if cid == "void_stalker":
        # Project magenta emissive from crisp new Colab cutouts + mount animated BatWings cloak & twin daggers!
        import vs_parts
        P = json.load(open(joints_json))
        rig.make_room(0.85)
        rig.project_emissive(vpaths, (268, 342), smin=0.28, vmin=0.28, gain=1.65)
        if os.path.isfile(vs_parts.D + "wing_alpha_full.png") and os.path.isfile(vs_parts.D + "dagger_raw.png"):
            wt = vs_parts.build_wings(rig, P, full=True)
            dt = vs_parts.build_daggers(rig, P)
            print(f"  -> [vs_parts] grafted animated BatWings ({wt} tris) + twin daggers ({dt} tris)")
        rig.save(parts_glb)
        print("  -> [parts]", " | ".join(rig.log))
        hold = "Right:dagger,Left:dagger"
    else:
        # Clean unarmed Robot Paladin (Aegis): crisp cyan visor, chest runes, shin vents & quad back jet-thrusters!
        rig.project_emissive(vpaths, (160, 212), smin=0.30, vmin=0.40, gain=1.65)
        rig.save(parts_glb)
        print("  -> [emissive]", " | ".join(rig.log))
        hold = "Right:fist,Left:fist"

    final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    run([
        "node", os.path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
        os.path.join(ROOT, "scripts", "eraclash3d", "forgeRigMesh.ts"),
        parts_glb, final_glb, "--name", cid, "--hold", hold,
    ], label=f"{cid} forgeRigMesh")

    if os.path.isfile(bak_glb) and os.path.isfile(bak_clips):
        rescale_own_clips(cid, bak_glb, bak_clips, final_glb)

    render_dir = os.path.join(wdir, "render_all")
    run(["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, render_dir], label=f"{cid} render_all")
    if cid == "void_stalker":
        render_body = os.path.join(wdir, "render_body")
        run(["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, render_body, "--parts", "body"], label=f"{cid} render_body")
        run([PY, os.path.join(ROOT, "scripts", "riftrealm", "score_views.py"), render_body, ref_dir, os.path.join(wdir, "score")], label=f"{cid} score_body")
    else:
        run([PY, os.path.join(ROOT, "scripts", "riftrealm", "score_views.py"), render_dir, ref_dir, os.path.join(wdir, "score")], label=f"{cid} score")

    ktxPack.pack_glb(final_glb)
    print(f"DONE {cid} -> {final_glb} ({os.path.getsize(final_glb) / 1e6:.2f} MB)")


if __name__ == "__main__":
    finish_hero("void_stalker")
    finish_hero("robot_paladin")
    print("\nBOTH VOID STALKER & ROBOT PALADIN MULTI-VIEW REDOS + KTX2 PACKS COMPLETE!")
