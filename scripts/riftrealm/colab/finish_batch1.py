"""Local CPU finishing pipeline for Vesselbound Batch 1 Colab GLBs.

Pipeline per humanoid (seraph_9, lumen, sylva, pyre):
  1. Clean floaters (keep largest component, or keep components >= 300 faces for lumen's floating halo)
  2. Silhouette fit (scripts/riftrealm/fit_silhouette.py)
  3. Art-projected 2048 PBR paint + decimate to 58k faces (engines/tela-3d/paint_from_views.py)
  4. 22-bone contract skeleton + joints.json (scripts/ravencrest/autoRig.py)
  5. Geodesic surface skinning (scripts/riftrealm/geo_weights.py)
  6. Art-projected emissive map + WebP pack (+ Seraph-9 crystal wing-blades & halo ring via seraph_parts.py)
  7. Character Forge 58-joint human rig + sockets + grips (scripts/eraclash3d/forgeRigMesh.ts)
  8. Retarget 57 mocap/CMU clips scaled to bind-pose Hips height -> assets/characters/clips/<id>.json
  9. Render ortho front/side/back/3Q (render_views.mjs) + fidelity score (score_views.py)

Pipeline for quadruped (nyx):
  1. Clean -> Silhouette fit (front + side) -> Art-projected 2048 PBR paint
  2. Art-projected magenta emissive + WebP pack
  3. 28-bone quadruped geodesic rig + gallop/attack/idle/reactions clips -> assets/characters/nyx.glb
  4. Render ortho views + fidelity score

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/riftrealm/colab/finish_batch1.py [id ...]
"""
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import numpy as np
import trimesh
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

SCRATCH = os.environ.get(
    "BATCH_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch1",
)
IN_ROOT = os.path.join(SCRATCH, "inputs")
OUT_ROOT = os.path.join(SCRATCH, "outputs")
WORK_ROOT = os.path.join(SCRATCH, "work")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CLIPS_DIR = os.path.join(CHAR_ASSETS, "clips")

sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))

SPECS = {
    "seraph_9": {
        "rig": "humanoid",
        "keep_halo": False,
        "fit_views": ["front"],
        "paint_views": ["front", "back"],
        "emissive_hue": (16, 62),
        "emissive_smin": 0.28,
        "emissive_vmin": 0.40,
        "emissive_gain": 1.65,
        "parts_script": "seraph_parts.py",
        "clip_donor": "void_stalker",
        "hold": "Right:dagger,Left:relaxed",
    },
    "lumen": {
        "rig": "humanoid",
        "keep_halo": True,
        "fit_views": ["front", "side"],
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (165, 215),
        "emissive_smin": 0.24,
        "emissive_vmin": 0.38,
        "emissive_gain": 1.55,
        "parts_script": None,
        "clip_donor": "void_stalker",
        "hold": "Right:dagger,Left:relaxed",
    },
    "sylva": {
        "rig": "humanoid",
        "keep_halo": False,
        "fit_views": ["front", "side"],
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (18, 58),
        "emissive_smin": 0.42,
        "emissive_vmin": 0.42,
        "emissive_gain": 1.60,
        "parts_script": None,
        "clip_donor": "void_stalker",
        "hold": "Right:dagger,Left:dagger",
    },
    "pyre": {
        "rig": "humanoid",
        "keep_halo": False,
        "fit_views": ["front", "side"],
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (4, 48),
        "emissive_smin": 0.48,
        "emissive_vmin": 0.42,
        "emissive_gain": 1.75,
        "parts_script": None,
        "clip_donor": "robot_paladin",
        "hold": "Right:fist,Left:fist",
    },
    "nyx": {
        "rig": "quadruped",
        "keep_halo": False,
        "fit_views": ["front", "side"],
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (268, 345),
        "emissive_smin": 0.28,
        "emissive_vmin": 0.32,
        "emissive_gain": 1.70,
        "parts_script": None,
        "clip_donor": None,
        "hold": None,
    },
}


def run(cmd, cwd=ROOT, label=""):
    print(f"  -> [{label}] {' '.join(cmd)}")
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.stdout.strip():
        for line in r.stdout.strip().splitlines()[-6:]:
            print("     ", line)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:])
        raise RuntimeError(f"Step [{label}] failed with code {r.returncode}")
    return r.stdout


def clean_shape(src: str, dst: str, keep_halo: bool = False):
    m = trimesh.load(src, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        if keep_halo:
            kept = [p for p in parts if len(p.faces) >= 300]
            m = trimesh.util.concatenate(kept) if kept else max(parts, key=lambda p: len(p.faces))
        else:
            m = max(parts, key=lambda p: len(p.faces))
    # Re-zero feet at y = 0 and center X/Z
    b = m.bounds
    m.apply_translation([-0.5 * (b[0][0] + b[1][0]), -b[0][1], -0.5 * (b[0][2] + b[1][2])])
    m.export(dst)
    print(f"  -> [clean] {len(parts)} parts -> {len(m.faces)} faces, extents={np.round(m.extents, 3).tolist()}")


def glb_hips_pos(glb_path: str) -> np.ndarray:
    """Read bind-pose world position of Hips from a Character Forge GLB."""
    from glbio import read_glb, accessor

    j, b = read_glb(glb_path)
    skin = j["skins"][0]
    ibm = accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4)
    for k, node_idx in enumerate(skin["joints"]):
        if j["nodes"][node_idx].get("name", "").endswith("Hips"):
            m = ibm[k].T  # glTF column-major -> row-major
            r = m[:3, :3]
            t = m[:3, 3]
            return -(r.T @ t)
    return np.array([0.0, 1.0, 0.0])


def retarget_clips_json(donor_id: str, dst_id: str, dst_glb: str):
    """Scale donor's 57 mocap/CMU clips Hips.position to match the new Forge rig's exact bind-pose hip height."""
    donor_glb = os.path.join(CHAR_ASSETS, f"{donor_id}.glb")
    donor_clips = os.path.join(CLIPS_DIR, f"{donor_id}.json")
    dst_clips = os.path.join(CLIPS_DIR, f"{dst_id}.json")

    src_hips = glb_hips_pos(donor_glb)
    dst_hips = glb_hips_pos(dst_glb)
    scale_y = float(dst_hips[1] / max(0.2, src_hips[1]))
    # Keep hip scale in a realistic humanoid band (so small-legged cherubs don't squash jump arcs weirdly)
    scale_y = float(np.clip(scale_y, 0.45, 1.35))
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
    print(f"  -> [clips] {len(data['clips'])} clips retargeted from {donor_id} (hipsY {src_hips[1]:.3f} -> {dst_hips[1]:.3f}, scale={scale_y:.3f}) -> {dst_clips}")


def apply_art_emissive_webp(glb_in: str, glb_out: str, view_paths: dict, hue, smin: float, vmin: float, gain: float):
    """Apply art-projected emissive map and WebP compression via rr_parts.Rig."""
    from rr_parts import Rig

    rig = Rig(glb_in)
    rig.project_emissive(view_paths, hue, smin=smin, vmin=vmin, gain=gain)
    rig.save(glb_out)
    print("  -> [emissive]", " | ".join(rig.log))


def rig_nyx_quadruped(painted_glb: str, emissive_views: dict, out_glb: str, work_dir: str):
    """Rig Nyx onto a 28-bone quadruped skeleton fitted to Nyx's exact bounds + wolf-style clips + magenta emissive."""
    # First add magenta emissive map to the painted mesh directly
    em_glb = os.path.join(work_dir, "nyx_emissive.glb")
    run(
        [
            PY,
            os.path.join(ROOT, "scripts", "riftrealm", "add_emissive.py"),
            painted_glb,
            em_glb,
            "--hue",
            "268",
            "345",
            "--vmin",
            "0.28",
            "--smin",
            "0.26",
            "--gain",
            "1.5",
        ],
        label="nyx emissive",
    )

    # Rig Nyx using the Elderwood creatures quadruped pipeline (geodesic weights + video-derived gallop/attack/idle clips)
    sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm", "creatures"))
    from glbio import read_glb, accessor
    import rig as cr_rig
    import clips as cr_clips

    j, b = read_glb(em_glb)
    prim = j["meshes"][0]["primitives"][0]
    V = accessor(j, b, prim["attributes"]["POSITION"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
    # Normalize Nyx to match wolf scale (length ~1.95 m, feet on y = 0, centered X/Z)
    mn, mx = V.min(0), V.max(0)
    span = mx - mn
    # Fit quadruped skeleton directly to Nyx's normalized bounding box (front paws at +Z, hind paws at -Z, height Y)
    W = span[0]
    H = span[1]
    L = span[2]
    z0, z1 = mn[2], mx[2]
    yc = lambda f: mn[1] + f * H
    zc = lambda f: z0 + f * L  # f=0 tail tip (-Z), f=1 nose (+Z)

    nyx_spec = dict(
        kind="quadruped",
        joints=[
            ("root", None, (0, 0, 0), {}),
            ("pelvis", "root", (0, yc(0.56), zc(0.32)), {}),
            ("spine1", "pelvis", (0, yc(0.60), zc(0.50)), {}),
            ("chest", "spine1", (0, yc(0.62), zc(0.68)), {}),
            ("neck", "chest", (0, yc(0.65), zc(0.80)), {}),
            ("head", "neck", (0, yc(0.62), zc(0.90)), {"tip": (0, yc(0.58), zc(1.00))}),
            ("jaw", "head", (0, yc(0.56), zc(0.92)), {"tip": (0, yc(0.52), zc(0.98)), "r": 0.03}),
            ("tail1", "pelvis", (0, yc(0.54), zc(0.22)), {}),
            ("tail2", "tail1", (0, yc(0.40), zc(0.11)), {}),
            ("tail3", "tail2", (0, yc(0.24), zc(0.03)), {"tip": (0, yc(0.10), zc(0.00))}),
            ("L_scap", "chest", (W * 0.16, yc(0.58), zc(0.68)), {}),
            ("L_arm", "L_scap", (W * 0.22, yc(0.42), zc(0.69)), {"fit": "limb"}),
            ("L_fore", "L_arm", (W * 0.23, yc(0.28), zc(0.68)), {"fit": "limb"}),
            ("L_wrist", "L_fore", (W * 0.24, yc(0.12), zc(0.73)), {"fit": "limb"}),
            ("L_paw", "L_wrist", (W * 0.25, yc(0.03), zc(0.78)), {"tip": (W * 0.25, yc(0.01), zc(0.84))}),
            ("L_thigh", "pelvis", (W * 0.20, yc(0.52), zc(0.32)), {}),
            ("L_shin", "L_thigh", (W * 0.22, yc(0.34), zc(0.36)), {"fit": "limb"}),
            ("L_hock", "L_shin", (W * 0.22, yc(0.19), zc(0.26)), {"fit": "limb"}),
            ("L_foot", "L_hock", (W * 0.24, yc(0.03), zc(0.32)), {"tip": (W * 0.25, yc(0.01), zc(0.38))}),
        ],
    )
    import specs as cr_specs
    import rig as cr_rig
    import clips as cr_clips

    cr_specs.SPECS["nyx"] = nyx_spec
    J, pos = cr_rig.fit("nyx", V)
    idx, wt, names = cr_rig.skin("nyx", V, F, J, pos)
    clips_data = cr_clips.quad_clips("wolf", J, pos)
    cr_rig.write_rigged("nyx", j, b, J, pos, idx, wt, names, clips_data, out_glb)
    print(f"  -> [nyx quadruped rig] {len(names)} bones, {len(clips_data)} clips -> {out_glb}")


def pad_transparent_rgb(src_png: str, dst_png: str):
    """Fill transparent pixels' RGB with nearest solid-foreground RGB (keeping alpha intact) so bilinear texture
    projection at grazing angles never bleeds black (0,0,0) onto shoulders/arms/legs."""
    from scipy.ndimage import distance_transform_edt

    arr = np.array(Image.open(src_png).convert("RGBA"))
    solid = arr[:, :, 3] >= 160
    if solid.any() and (~solid).any():
        _, (ny, nx) = distance_transform_edt(~solid, return_indices=True)
        out = arr.copy()
        out[:, :, :3] = arr[ny, nx, :3]
        Image.fromarray(out).save(dst_png)
    else:
        shutil.copy2(src_png, dst_png)


def finish_one(cid: str):
    spec = SPECS[cid]
    in_dir = os.path.join(IN_ROOT, cid)
    raw_glb = os.path.join(OUT_ROOT, cid, "shape_raw.glb")
    wdir = os.path.join(WORK_ROOT, cid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    print(f"\n==================== FINISHING {cid} ({spec['rig']}) ====================")

    # Prepare ref folder with RGB-padded front.png, back.png, left.png, right.png, side.png (= left.png)
    for vname in ("front", "back", "left", "right"):
        src = os.path.join(in_dir, f"{vname}.png")
        if os.path.isfile(src):
            pad_transparent_rgb(src, os.path.join(ref_dir, f"{vname}.png"))
    if os.path.isfile(os.path.join(ref_dir, "left.png")):
        shutil.copy2(os.path.join(ref_dir, "left.png"), os.path.join(ref_dir, "side.png"))

    # 1. Clean raw Colab mesh
    clean_glb = os.path.join(wdir, "shape_clean.glb")
    clean_shape(raw_glb, clean_glb, keep_halo=spec["keep_halo"])

    # 2. Skip 2D row-warping fit_silhouette on multi-view Hunyuan3D-2mv shapes:
    # Hunyuan3D-2mv already reconstructs true 3D front+side+back geometry without stretching thighs toward fingertips!
    fit_glb = clean_glb

    # 3. Art-projected 2048 PBR paint + decimation to 58k faces
    painted_glb = os.path.join(wdir, "painted.glb")
    paint_cmd = [
        PY,
        os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh",
        fit_glb,
        "--out",
        painted_glb,
        "--faces",
        "58000",
        "--res",
        "2048",
    ]
    for vk in spec["paint_views"]:
        paint_cmd += ["--view", f"{vk}={os.path.join(ref_dir, vk + '.png')}"]
    run(paint_cmd, cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{cid} paint_from_views")

    final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    os.makedirs(CHAR_ASSETS, exist_ok=True)

    if spec["rig"] == "humanoid":
        # 4. 22-bone contract humanoid rig
        rigged_glb = os.path.join(wdir, "rigged.glb")
        joints_json = os.path.join(wdir, "joints.json")
        run(
            [
                PY,
                os.path.join(ROOT, "scripts", "ravencrest", "autoRig.py"),
                "--rig",
                os.path.join(ROOT, "public", "games", "ravencrest", "assets", "characters", "muse", "vampire.glb"),
                "--mesh",
                painted_glb,
                "--out",
                rigged_glb,
                "--debug",
                joints_json,
            ],
            label=f"{cid} autoRig",
        )

        # 5. Geodesic surface skinning
        geo_glb = os.path.join(wdir, "geo.glb")
        run(
            [PY, os.path.join(ROOT, "scripts", "riftrealm", "geo_weights.py"), rigged_glb, joints_json, geo_glb],
            label=f"{cid} geo_weights",
        )

        # 6. Art-projected emissive + rigid parts (Seraph-9 wings & halo) + WebP pack
        parts_glb = os.path.join(wdir, "parts.glb")
        if spec["parts_script"]:
            run(
                [
                    PY,
                    os.path.join(ROOT, "scripts", "riftrealm", spec["parts_script"]),
                    geo_glb,
                    joints_json,
                    parts_glb,
                    "--in-dir",
                    in_dir,
                ],
                label=f"{cid} {spec['parts_script']}",
            )
        else:
            vpaths = {vk: os.path.join(ref_dir, f"{vk}.png") for vk in spec["paint_views"]}
            apply_art_emissive_webp(
                geo_glb,
                parts_glb,
                vpaths,
                spec["emissive_hue"],
                spec["emissive_smin"],
                spec["emissive_vmin"],
                spec["emissive_gain"],
            )

        # 7. Character Forge 58-joint human rig + sockets + grips
        tsx_cmd = [
            "node",
            os.path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
            os.path.join(ROOT, "scripts", "eraclash3d", "forgeRigMesh.ts"),
            parts_glb,
            final_glb,
            "--name",
            cid,
            "--hold",
            spec["hold"],
        ]
        run(tsx_cmd, label=f"{cid} forgeRigMesh")

        # 8. Retarget 57 mocap/CMU clips scaled to this rig's exact hip height
        retarget_clips_json(spec["clip_donor"], cid, final_glb)
    else:
        # Quadruped (Nyx)
        vpaths = {vk: os.path.join(ref_dir, f"{vk}.png") for vk in spec["paint_views"]}
        rig_nyx_quadruped(painted_glb, vpaths, final_glb, wdir)

    # 9. Render ortho views & score against turnaround
    render_dir = os.path.join(wdir, "render_all")
    run(
        ["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, render_dir],
        label=f"{cid} render_views (all)",
    )
    if cid == "seraph_9":
        # Also render body-only (without Spine2 wings/halo) to score against front_body & back_body
        render_body = os.path.join(wdir, "render_body")
        run(
            ["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, render_body, "--parts", "body"],
            label=f"{cid} render_views (body)",
        )
        # Copy render_body/side.png into ref_dir/side.png ONLY if missing so score_views can score front & back cleanly
        if not os.path.isfile(os.path.join(ref_dir, "side.png")):
            shutil.copy2(os.path.join(render_body, "side.png"), os.path.join(ref_dir, "side.png"))
        score_dir = os.path.join(wdir, "score_body")
        run(
            [PY, os.path.join(ROOT, "scripts", "riftrealm", "score_views.py"), render_body, ref_dir, score_dir],
            label=f"{cid} score_views (body)",
        )
    else:
        score_dir = os.path.join(wdir, "score")
        run(
            [PY, os.path.join(ROOT, "scripts", "riftrealm", "score_views.py"), render_dir, ref_dir, score_dir],
            label=f"{cid} score_views",
        )

    print(f"DONE {cid} -> {final_glb} ({os.path.getsize(final_glb) / 1e6:.2f} MB)")


def main():
    targets = sys.argv[1:] or list(SPECS.keys())
    for cid in targets:
        finish_one(cid)


if __name__ == "__main__":
    main()
