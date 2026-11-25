"""Pass-2 local CPU texture polish for 5 Batch 2 models + KTX2 re-pack.

Fixes:
  1. obsidian_rhino    -> mirrors darkened front onto back + extracts clean real SIDE PROFILE from original sheet!
  2. rune_dragon       -> mirrors darkened front onto back (eliminating single-view Voronoi back fill)
  3. marsh_kraken      -> mirrors darkened front onto back (eliminating single-view Voronoi back fill)
  4. magma_titan       -> matches pale grey clay back view's black-point & contrast to dark volcanic basalt front
                          while keeping the glowing orange magma back-core vivid!
  5. fallen_archangel  -> strips detached floating cyan/gold runic blade tips outside the wing contour from front.png
                          before RGB edge-padding so the upper-left black feathered wing stays pure dark obsidian!

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/riftrealm/colab/polish_pass2.py
"""
import os
import shutil
import subprocess
import sys
import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

SHOOTER = r"D:\plajah game assets deign from promtps\Shooter\Nov 15 - 14_43"
B2A_SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2a"
B2B_OUT = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2b\outputs"
B2C_SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2c"
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")

sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm", "creatures"))
sys.path.insert(0, HERE)

import finish_batch2a as fb2a
import finish_batch2c_beasts as fb2c
import ktxPack


def pad_rgba(arr: np.ndarray, dst_png: str):
    from scipy.ndimage import distance_transform_edt

    solid = arr[:, :, 3] >= 140
    if solid.any() and (~solid).any():
        _, (ny, nx) = distance_transform_edt(~solid, return_indices=True)
        out = arr.copy()
        out[:, :, :3] = arr[ny, nx, :3]
        Image.fromarray(out).save(dst_png)
    else:
        Image.fromarray(arr).save(dst_png)


def polish_single_view_beast(cid: str, extra_side_cutout: np.ndarray | None = None):
    """Repaint a single-view Batch 2C beast with darkened mirrored back (+ optional real side cutout), re-rig & KTX2."""
    spec = dict(fb2c.SPECS[cid])
    src_dir = os.path.join(B2C_SCRATCH, "outputs", cid)
    cut_dir = os.path.join(src_dir, "cutouts")
    wdir = os.path.join(B2C_SCRATCH, "work_beasts", cid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    print(f"\n==================== PASS-2 POLISH {cid} ====================")

    front_arr = np.array(Image.open(os.path.join(cut_dir, "front.png")).convert("RGBA"))
    pad_rgba(front_arr, os.path.join(ref_dir, "front.png"))

    # Create darkened horizontally-mirrored back view so back wings/scales/carapace get crisp art texture
    back_arr = front_arr[:, ::-1, :].copy()
    back_arr[:, :, :3] = np.clip(back_arr[:, :, :3].astype(np.float32) * 0.86, 0, 255).astype(np.uint8)
    pad_rgba(back_arr, os.path.join(ref_dir, "back.png"))

    views = ["front", "back"]
    if extra_side_cutout is not None:
        pad_rgba(extra_side_cutout, os.path.join(ref_dir, "left.png"))
        pad_rgba(extra_side_cutout[:, ::-1, :].copy(), os.path.join(ref_dir, "right.png"))
        views = ["front", "back", "left", "right"]

    clean_glb = os.path.join(wdir, "shape_clean.glb")
    if not os.path.isfile(clean_glb):
        fb2c.clean_shape(os.path.join(src_dir, "shape_raw.glb"), clean_glb)

    painted_glb = os.path.join(wdir, "painted.glb")
    paint_cmd = [
        PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh", clean_glb, "--out", painted_glb, "--faces", str(spec["faces"]), "--res", "2048",
    ]
    for vk in views:
        paint_cmd += ["--view", f"{vk}={os.path.join(ref_dir, vk + '.png')}"]
    fb2c.run(paint_cmd, cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{cid} pass2 paint")

    em_glb = os.path.join(wdir, "emissive.glb")
    h0, h1 = spec["emissive_hue"]
    fb2c.run([
        PY, os.path.join(ROOT, "scripts", "riftrealm", "add_emissive.py"),
        painted_glb, em_glb,
        "--hue", str(h0), str(h1),
        "--smin", str(spec["smin"]), "--vmin", str(spec["vmin"]), "--gain", str(spec["gain"]),
    ], label=f"{cid} pass2 emissive")

    from glbio import read_glb, accessor
    import specs as cr_specs
    import rig as cr_rig
    import clips as cr_clips

    j, b = read_glb(em_glb)
    prim = j["meshes"][0]["primitives"][0]
    V = accessor(j, b, prim["attributes"]["POSITION"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)

    rk = spec["rig_kind"]
    if rk == "quad_wolf":
        cr_specs.SPECS[cid] = fb2c.make_quad_spec(V, is_deer=False, with_wings=False)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = cr_clips.quad_clips("wolf", J, pos)
    elif rk == "winged_dragon":
        cr_specs.SPECS[cid] = fb2c.make_quad_spec(V, is_deer=False, with_wings=True)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = cr_clips.quad_clips("wolf", J, pos)
        fb2c.add_dragon_wing_motion(clips_data, J, pos)
    else:
        cr_specs.SPECS[cid] = fb2c.make_boss_spec(V, rk)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = fb2c.make_boss_clips(rk, J, pos)

    final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    cr_rig.write_rigged(cid, j, b, J, pos, idx, wt, names, clips_data, final_glb)
    fb2c.run(["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, os.path.join(wdir, "render_all")], label=f"{cid} render")
    ktxPack.pack_glb(final_glb)


def cut_rhino_side_profile() -> np.ndarray:
    """Cut clean side profile of obsidian_rhino directly from its concept sheet (bottom-left SIDE PROFILE VIEW)."""
    sheet = np.array(Image.open(os.path.join(SHOOTER, "Volcanic_obsidian_light_rhino_de\u2026_0f5dafb3.jpg")).convert("RGB"))
    crop = sheet[298:698, 20:678].copy()
    rf = crop.astype(np.float32)
    sat = rf.max(axis=2) - rf.min(axis=2)
    border = np.concatenate([rf[:10, :].reshape(-1, 3), rf[-10:, :].reshape(-1, 3), rf[:, :10].reshape(-1, 3), rf[:, -10:].reshape(-1, 3)], axis=0)
    bg = np.median(border[border.mean(axis=1) <= np.percentile(border.mean(axis=1), 40)], axis=0)
    dist = np.linalg.norm(rf - bg[None, None, :], axis=2)
    # Dark studio background flood fill
    bg_cand = ((dist < 24) & (sat < 22)).astype(np.uint8)
    bg_cand = cv2.morphologyEx(bg_cand, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    h, w = bg_cand.shape
    ff = bg_cand.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0)]:
        if ff[sy, sx] == 1:
            cv2.floodFill(ff, mask, (sx, sy), 2)
    fg = (ff != 2).astype(np.uint8)
    # Strip faint flame dust trails far behind hind hooves (x > 615, y > 320)
    fg[320:, 600:] = 0
    num_l, labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    if num_l > 1:
        best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = (labels == best).astype(np.uint8)
    alpha = cv2.GaussianBlur((fg * 255).astype(np.uint8), (3, 3), 0.7)
    arr = np.dstack([crop, alpha])
    ys, xs = np.where(alpha >= 40)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    c = arr[y0:y1, x0:x1]
    pad = max(16, int(max(c.shape[:2]) * 0.06))
    canvas = np.zeros((c.shape[0] + 2 * pad, c.shape[1] + 2 * pad, 4), dtype=np.uint8)
    canvas[pad : pad + c.shape[0], pad : pad + c.shape[1]] = c
    return cv2.resize(canvas, (canvas.shape[1] * 2, canvas.shape[0] * 2), interpolation=cv2.INTER_LANCZOS4)


def polish_magma_titan():
    """Contrast-match magma_titan's pale grey clay back view to his dark volcanic basalt front + re-run finishing."""
    print("\n==================== PASS-2 POLISH magma_titan ====================")
    cut_dir = os.path.join(B2A_SCRATCH, "outputs", "magma_titan", "cutouts")
    back_src = os.path.join(cut_dir, "back.png")
    back_bak = os.path.join(cut_dir, "back_orig.png")
    if not os.path.isfile(back_bak):
        shutil.copy2(back_src, back_bak)

    arr = np.array(Image.open(back_bak).convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.float32) / 255.0
    a = arr[:, :, 3]
    # Separate glowing magma orange/red pixels (high warmth R-B) from pale grey clay rock
    warm = np.clip((rgb[:, :, 0] - rgb[:, :, 2]) * 2.4, 0.0, 1.0)
    # Darken & add dramatic S-curve contrast to pale clay rock so it matches the dark volcanic front
    rock = np.clip((rgb - 0.16) / 0.84, 0.0, 1.0) ** 1.85 * 0.68
    # Boost glowing lava fissures and central back furnace brightly
    glow = np.clip(rgb * np.array([1.45, 1.05, 0.55], dtype=np.float32), 0.0, 1.0)
    blended = rock * (1.0 - warm[:, :, None]) + glow * warm[:, :, None]
    out = arr.copy()
    out[:, :, :3] = np.clip(blended * 255.0, 0, 255).astype(np.uint8)
    out[:, :, 3] = a
    Image.fromarray(out, mode="RGBA").save(back_src)

    fb2a.finish_one("magma_titan")
    ktxPack.pack_glb(os.path.join(CHAR_ASSETS, "magma_titan.glb"))


def polish_fallen_archangel():
    """Keep ONLY main connected body+wings component on fallen_archangel front cutout (dropping detached glowing
    blade shards that bled bright patches onto his black upper-left feathered wing), then re-run finishing."""
    print("\n==================== PASS-2 POLISH fallen_archangel ====================")
    cut_dir = os.path.join(B2B_OUT, "fallen_archangel", "cutouts")
    front_src = os.path.join(cut_dir, "front.png")
    front_bak = os.path.join(cut_dir, "front_orig.png")
    if not os.path.isfile(front_bak):
        shutil.copy2(front_src, front_bak)

    arr = np.array(Image.open(front_bak).convert("RGBA"))
    a = arr[:, :, 3].copy()
    # Keep ONLY the single largest connected component (body + all 4 feathered wings), removing floating detached
    # blade islands to the far upper-left/right so RGB padding never stretches cyan/tan blade patches onto dark wings!
    num_l, labels, stats, _ = cv2.connectedComponentsWithStats((a >= 40).astype(np.uint8), connectivity=8)
    if num_l > 1:
        best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = (labels == best)
        a[~keep] = 0
    # Also darken any bright cyan/gold runic blade tips fused right on the far upper-left wing border (x < 22%, y < 48%)
    h, w = a.shape
    rgb = arr[:, :, :3].astype(np.float32)
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    far_wing = np.zeros_like(a, dtype=bool)
    far_wing[: int(h * 0.52), : int(w * 0.25)] = True
    far_wing[: int(h * 0.52), int(w * 0.75) :] = True
    blade_bleed = far_wing & ((lum > 95) | (sat > 40)) & (a > 0)
    a[blade_bleed] = 0
    arr[:, :, 3] = a
    Image.fromarray(arr, mode="RGBA").save(front_src)

    fb2a.finish_one("fallen_archangel")
    ktxPack.pack_glb(os.path.join(CHAR_ASSETS, "fallen_archangel.glb"))


def main():
    rhino_side = cut_rhino_side_profile()
    polish_single_view_beast("obsidian_rhino", extra_side_cutout=rhino_side)
    polish_single_view_beast("rune_dragon", extra_side_cutout=None)
    polish_single_view_beast("marsh_kraken", extra_side_cutout=None)
    polish_magma_titan()
    polish_fallen_archangel()
    print("\nALL 5 PASS-2 POLISHES + KTX2 PACKS COMPLETE!")


if __name__ == "__main__":
    main()
