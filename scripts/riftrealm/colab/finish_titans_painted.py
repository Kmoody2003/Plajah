"""Local CPU finishing pipeline for Batch Titans 360° Hunyuan3D-Paint Overhaul (11 Massive Bosses).

Takes seamless 360° 2048x2048 painted meshes from Colab (`batch_titans_painted.zip` -> scratch/colab_titans_paint/outputs/)
and produces upgraded AAA rigged GLBs in public/games/rift-realm/assets/characters/:
  - 6 Humanoid Titans (magma_titan, moss_golem, cyber_minotaur, fallen_archangel, prism_archon, gorgon_construct):
      70k-80k 360°-painted mesh -> emissive -> clean symmetrical 58-joint Character Forge rig -> arm/torso/wing
      weight isolation -> world-space retargeted clips -> 200k HP tangent-space normal + 3D AO + smart PBR -> KTX2.
  - 5 Colossal Beast Titans (void_leviathan, rune_dragon, marsh_kraken, obsidian_rhino, cyber_dragon_mount):
      75k-85k 360°-painted mesh -> emissive -> geodesic multi-bone boss/dragon/quad rig & combat clips ->
      200k HP tangent-space normal + 3D AO + smart PBR -> KTX2.
"""
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

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch"
TITAN_ROOT = os.path.join(SCRATCH, "colab_titans_paint")
OUT_ROOT = os.path.join(TITAN_ROOT, "outputs")
WORK_ROOT = os.path.join(TITAN_ROOT, "work")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CLIPS_DIR = os.path.join(CHAR_ASSETS, "clips")

sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm", "creatures"))

from glbio import read_glb, accessor, write_glb  # noqa: E402
import ktxPack  # noqa: E402
from bake_pbr_maps import bake_character_pbr  # noqa: E402
from clean_skin_and_webs import clean_and_reskin_humanoid  # noqa: E402
from fix_humanoid_rigs_and_clips import (  # noqa: E402
    REF_GLB,
    REF_CLIPS,
    extract_joints,
    fit_clean_humanoid_anchors,
    write_reanchored_contract_glb,
    retarget_clip_library,
)
import finish_batch2c_beasts as beasts  # noqa: E402

TITAN_SPECS = {
    # 5 Colossal Beast / Mount Titans
    "void_leviathan": {"kind": "serpent_boss", "hue": (16, 62), "smin": 0.36, "vmin": 0.42, "gain": 1.85},
    "rune_dragon": {"kind": "winged_dragon", "hue": (175, 228), "smin": 0.28, "vmin": 0.42, "gain": 1.70},
    "marsh_kraken": {"kind": "kraken_boss", "hue": (95, 175), "smin": 0.34, "vmin": 0.36, "gain": 1.75},
    "obsidian_rhino": {"kind": "quad_wolf", "hue": (6, 52), "smin": 0.42, "vmin": 0.36, "gain": 1.85},
    "cyber_dragon_mount": {"kind": "winged_dragon", "hue": (18, 60), "smin": 0.36, "vmin": 0.40, "gain": 1.70},
    # 6 Humanoid Titan Bosses
    "magma_titan": {"kind": "humanoid", "hue": (5, 48), "smin": 0.42, "vmin": 0.36, "gain": 1.90},
    "moss_golem": {"kind": "humanoid", "hue": (75, 185), "smin": 0.38, "vmin": 0.40, "gain": 1.65},
    "cyber_minotaur": {"kind": "humanoid", "hue": (165, 220), "smin": 0.35, "vmin": 0.42, "gain": 1.75},
    "fallen_archangel": {"kind": "humanoid", "hue": (18, 56), "smin": 0.38, "vmin": 0.44, "gain": 1.65},
    "prism_archon": {"kind": "humanoid", "hue": (172, 230), "smin": 0.32, "vmin": 0.44, "gain": 1.80},
    "gorgon_construct": {"kind": "humanoid", "hue": (275, 345), "smin": 0.34, "vmin": 0.38, "gain": 1.75},
}


def run(cmd, cwd=ROOT, label="", shell=False):
    print(f"  -> [{label}]", flush=True)
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, shell=shell)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:], flush=True)
        raise RuntimeError(f"Step [{label}] failed with code {r.returncode}")
    return r.stdout


def prepare_painted_pbr_shell(src_glb: str, dst_glb: str, cid: str = ""):
    """Ground Hunyuan3DPaint GLB to y=0, strip studio floor/wall slabs if present, and add normal/ORM texture slots."""
    m = trimesh.load(src_glb, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)

    # Extract 2048 albedo BEFORE any submesh filtering so material reference stays rock-solid
    base_im = None
    if hasattr(m.visual, "material"):
        mat = m.visual.material
        if hasattr(mat, "baseColorTexture") and mat.baseColorTexture is not None:
            base_im = mat.baseColorTexture.convert("RGB")
        elif hasattr(mat, "image") and mat.image is not None:
            base_im = mat.image.convert("RGB")
    if base_im is None:
        raise RuntimeError(f"No albedo texture found in {src_glb}")

    # Surgical studio wall/floor card trim for the 4 Titans whose raw Hunyuan shape had baked backdrop cards
    if cid in ("void_leviathan", "moss_golem", "gorgon_construct", "obsidian_rhino"):
        b0 = m.bounds
        sz = np.maximum(b0[1] - b0[0], 1e-6)
        fc = m.vertices[m.faces].mean(axis=1)
        fn = m.face_normals
        yn = (fc[:, 1] - b0[0][1]) / sz[1]
        zn = (fc[:, 2] - b0[0][2]) / sz[2]
        keep = np.ones(len(m.faces), dtype=bool)
        if cid == "void_leviathan":
            # Strip giant flat grey/blue studio back wall (zn < 0.145) + floor pedestal (yn < 0.036),
            # while PRESERVING his radiant warm-gold wings (R - B > 32, yn > 0.44)!
            uv_f = np.asarray(m.visual.uv, dtype=np.float32)[m.faces].mean(axis=1)
            arr_im = np.asarray(base_im)
            ih, iw = arr_im.shape[:2]
            px = np.clip((uv_f[:, 0] * (iw - 1)).astype(np.int32), 0, iw - 1)
            py = np.clip(((1.0 - uv_f[:, 1]) * (ih - 1)).astype(np.int32), 0, ih - 1)
            col = arr_im[py, px].astype(np.float32)
            is_gold_wing = ((col[:, 0] - col[:, 2]) > 28) & (col[:, 0] > 110) & (yn > 0.44)
            is_back_wall = (zn < 0.155) & (~is_gold_wing)
            keep &= (yn >= 0.036) & (~is_back_wall)
        elif cid == "gorgon_construct":
            # Strip thin flat square pedestal card right beneath coiled serpent tail
            keep &= yn >= 0.022
        elif cid == "obsidian_rhino":
            # Strip thin white ground shadow puddle right beneath hooves
            keep &= yn >= 0.026
        elif cid == "moss_golem":
            # Strip floor card + thin white vertical backdrop card strips hanging behind heels/left fist
            keep &= (yn >= 0.022) & ~((zn < 0.15) & (yn < 0.55) & (np.abs(fn[:, 2]) > 0.78))
            # Also drop pure-white bright unshaded card scraps on lower perimeter (yn < 0.48)
            uv_f = np.asarray(m.visual.uv, dtype=np.float32)[m.faces].mean(axis=1)
            arr_im = np.asarray(base_im)
            ih, iw = arr_im.shape[:2]
            px = np.clip((uv_f[:, 0] * (iw - 1)).astype(np.int32), 0, iw - 1)
            py = np.clip(((1.0 - uv_f[:, 1]) * (ih - 1)).astype(np.int32), 0, ih - 1)
            col = arr_im[py, px].astype(np.float32)
            sat = col.max(axis=1) - col.min(axis=1)
            bright_white_card = (col.min(axis=1) > 205) & (sat < 22) & (yn < 0.48)
            keep &= ~bright_white_card
        # Keep largest 3D-WELDED connected component (xatlas UV seams split unwelded trimesh.split into tiny charts!)
        keep_idx = np.nonzero(keep)[0]
        F_k = m.faces[keep_idx]
        V_all = m.vertices
        key = np.round(V_all / 1e-4).astype(np.int64)
        _, weld = np.unique(key, axis=0, return_inverse=True)
        weld = weld.ravel()
        nw = int(weld.max()) + 1
        uf = np.arange(nw)

        def find(a):
            while uf[a] != a:
                uf[a] = uf[uf[a]]
                a = uf[a]
            return a

        Tw = weld[F_k]
        for u, v in zip(Tw[:, 0], Tw[:, 1]):
            ru, rv = find(int(u)), find(int(v))
            if ru != rv:
                uf[ru] = rv
        for u, v in zip(Tw[:, 1], Tw[:, 2]):
            ru, rv = find(int(u)), find(int(v))
            if ru != rv:
                uf[ru] = rv
        f_roots = np.array([find(int(u)) for u in Tw[:, 0]])
        ur, uc = np.unique(f_roots, return_counts=True)
        main_r = ur[np.argmax(uc)]
        final_idx = keep_idx[f_roots == main_r]
        m = m.submesh([final_idx], append=True)
        print(f"  -> [slab trim] {cid}: trimmed studio card/wall (welded 3D CC) -> {len(m.faces)} faces", flush=True)

    b = m.bounds
    m.apply_translation([-0.5 * (b[0][0] + b[1][0]), -b[0][1], -0.5 * (b[0][2] + b[1][2])])

    R = base_im.size[0]
    # Flat valid placeholders (immediately replaced with real 200k HP normals + 3D AO + smart PBR by bake_character_pbr!)
    norm_im = Image.new("RGB", (R, R), (128, 128, 255))
    orm_im = Image.new("RGB", (R, R), (255, 160, 0))
    uvs = np.asarray(m.visual.uv, dtype=np.float32)

    pbr_mat = trimesh.visual.material.PBRMaterial(
        baseColorTexture=base_im,
        normalTexture=norm_im,
        metallicRoughnessTexture=orm_im,
        occlusionTexture=orm_im,
        metallicFactor=1.0,
        roughnessFactor=1.0,
        name="body",
    )
    out = trimesh.Trimesh(
        vertices=m.vertices,
        faces=m.faces,
        vertex_normals=m.vertex_normals,
        process=False,
        visual=trimesh.visual.TextureVisuals(uv=uvs, material=pbr_mat),
    )
    out.export(dst_glb)
    print(f"  -> [shell] {len(out.faces)} faces, {R}x{R} 360° albedo -> {dst_glb}", flush=True)


def finish_titan(cid: str, ref_pos: dict, ref_clips_data: dict):
    spec = TITAN_SPECS[cid]
    src_glb = os.path.join(OUT_ROOT, cid, "painted_360.glb")
    if not os.path.isfile(src_glb):
        print(f"  [skip] {cid}: missing {src_glb}", flush=True)
        return
    wdir = os.path.join(WORK_ROOT, cid)
    os.makedirs(wdir, exist_ok=True)
    print(f"\n==================== FINISHING 360° TITAN {cid} ({spec['kind']}) ====================", flush=True)

    shell_glb = os.path.join(wdir, "shell_pbr.glb")
    prepare_painted_pbr_shell(src_glb, shell_glb, cid=cid)

    em_glb = os.path.join(wdir, "emissive.glb")
    h0, h1 = spec["hue"]
    run([
        PY, os.path.join(ROOT, "scripts", "riftrealm", "add_emissive.py"),
        shell_glb, em_glb,
        "--hue", str(h0), str(h1),
        "--smin", str(spec["smin"]),
        "--vmin", str(spec["vmin"]),
        "--gain", str(spec["gain"]),
    ], label=f"{cid} emissive")

    final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    rk = spec["kind"]

    if rk == "humanoid":
        # AutoRig scales height cleanly to ~1.99m, then we immediately apply our clean wing/cape-safe anchor fitter
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
        print(f"  -> [humanoid rig] p99.5={qa['p99']:.2f}x max_st={qa['max_stretch']:.2f}x, retargeted {len(retargeted['clips'])} clips", flush=True)
    else:
        import specs as cr_specs
        import rig as cr_rig
        import clips as cr_clips

        j, b = read_glb(em_glb)
        prim = j["meshes"][0]["primitives"][0]
        V = accessor(j, b, prim["attributes"]["POSITION"]).astype(np.float64)
        F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
        if rk == "quad_wolf":
            cr_specs.SPECS[cid] = beasts.make_quad_spec(V, is_deer=False, with_wings=False)
            J, pos = cr_rig.fit(cid, V)
            idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
            clips_data = cr_clips.quad_clips("wolf", J, pos)
        elif rk == "winged_dragon":
            cr_specs.SPECS[cid] = beasts.make_quad_spec(V, is_deer=False, with_wings=True)
            J, pos = cr_rig.fit(cid, V)
            idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
            clips_data = cr_clips.quad_clips("wolf", J, pos)
            beasts.add_dragon_wing_motion(clips_data, J, pos)
        else:
            cr_specs.SPECS[cid] = beasts.make_boss_spec(V, rk)
            J, pos = cr_rig.fit(cid, V)
            idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
            clips_data = beasts.make_boss_clips(rk, J, pos)
        cr_rig.write_rigged(cid, j, b, J, pos, idx, wt, names, clips_data, final_glb)
        print(f"  -> [beast rig] {len(names)} bones, {len(clips_data)} clips -> {final_glb}", flush=True)

    # Bake real 200k HP tangent-space normal + 3D multi-scale AO + smart PBR metal/roughness + KTX2 pack!
    bake_character_pbr(cid, hp_override=shell_glb if cid == "void_leviathan" else None)


def main():
    # Auto-extract batch_titans_painted.zip from Downloads if present
    dl_zip = os.path.expanduser(r"~\Downloads\batch_titans_painted.zip")
    if os.path.isfile(dl_zip) and not os.path.isdir(OUT_ROOT):
        os.makedirs(OUT_ROOT, exist_ok=True)
        with zipfile.ZipFile(dl_zip, "r") as zf:
            zf.extractall(OUT_ROOT)
        print("Extracted:", dl_zip)

    _, _, ref_pos = extract_joints(REF_GLB)
    with open(REF_CLIPS, "r", encoding="utf-8") as f:
        ref_clips_data = json.load(f)

    targets = sys.argv[1:] or list(TITAN_SPECS.keys())
    for cid in targets:
        finish_titan(cid, ref_pos, ref_clips_data)


if __name__ == "__main__":
    main()
