"""Prepare Batch 3A Vesselbound Elderwood & Cyber Forest Creatures (+ clean Void Leviathan redo) for Colab GPU.

13 multi-view / clean-cutout assets:
  Boss redo (1):
    - void_leviathan      (CLEAN RGBA redo — strips dark backdrop haze behind golden wings)
  Core 6 Elderwood multi-view upgrades:
    - lumen_deer          (01 Alien_deer_creature_asset_sheet_96df0601.jpg)
    - storm_bat           (05 Bat_creature_turnaround_views_87745a0e.jpg)
    - plasma_wasp         (12 Bioluminescent_wasp_character_tu…_9e711c8c.jpg)
    - glow_moth           (17 Electric_glowing_moth_flying_insect_f98e4b45.jpg)
    - electric_wolf       (18 Electric_wolf_creature_turnaroun…_7dd9753b.jpg)
    - venom_mantis        (22 Poisonous_glowing_mantis_turnaro…_d6af1be2.jpg)
  Flagship 6 Cyber Forest Apex & Fauna:
    - apex_drake          (02 Alien_reptilian_creature_turnaro…_7cb8f9c3.jpg)
    - amphibian_brute     (03 Amphibian_creature_character_sheet_fffd09d5.jpg)
    - shadow_stalker_beast(09 Bioluminescent_quadruped_mammal_…_dd8901ca.jpg)
    - bio_sloth           (10 Bioluminescent_sloth_creature_tu…_cc047c9f.jpg)
    - cryo_panther        (14 Cryo-elemental_panther_turnaroun…_bbebce15.jpg)
    - hydro_serpent       (20 Hydro-kinetic_serpent_creature_t…_da7e0323.jpg — SIDE, FRONT, BACK order!)
"""
import json
import os
import shutil
import zipfile
import cv2
import numpy as np
from PIL import Image

CF = r"D:\plajah game assets deign from promtps\Shooter\Cyber Forest Level Assets"
B2C_OUT = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2c\outputs"
OUT_ROOT = os.environ.get(
    "BATCH3A_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch3a",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch3a"

SHEETS = {
    "lumen_deer": os.path.join(CF, "Alien_deer_creature_asset_sheet_96df0601.jpg"),
    "apex_drake": os.path.join(CF, "Alien_reptilian_creature_turnaro\u2026_7cb8f9c3.jpg"),
    "amphibian_brute": os.path.join(CF, "Amphibian_creature_character_sheet_fffd09d5.jpg"),
    "storm_bat": os.path.join(CF, "Bat_creature_turnaround_views_87745a0e.jpg"),
    "shadow_stalker_beast": os.path.join(CF, "Bioluminescent_quadruped_mammal_\u2026_dd8901ca.jpg"),
    "bio_sloth": os.path.join(CF, "Bioluminescent_sloth_creature_tu\u2026_cc047c9f.jpg"),
    "plasma_wasp": os.path.join(CF, "Bioluminescent_wasp_character_tu\u2026_9e711c8c.jpg"),
    "cryo_panther": os.path.join(CF, "Cryo-elemental_panther_turnaroun\u2026_bbebce15.jpg"),
    "glow_moth": os.path.join(CF, "Electric_glowing_moth_flying_insect_f98e4b45.jpg"),
    "electric_wolf": os.path.join(CF, "Electric_wolf_creature_turnaroun\u2026_7dd9753b.jpg"),
    "hydro_serpent": os.path.join(CF, "Hydro-kinetic_serpent_creature_t\u2026_da7e0323.jpg"),
    "venom_mantis": os.path.join(CF, "Poisonous_glowing_mantis_turnaro\u2026_d6af1be2.jpg"),
}


def estimate_white_bg(crop: np.ndarray) -> np.ndarray:
    border = np.concatenate(
        [crop[:8, :].reshape(-1, 3), crop[-8:, :].reshape(-1, 3), crop[:, :8].reshape(-1, 3), crop[:, -8:].reshape(-1, 3)],
        axis=0,
    )
    lum = border.mean(axis=1)
    bright = border[lum >= np.percentile(lum, 65)]
    return np.median(bright, axis=0).astype(np.uint8)


B2C_IN = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2c\inputs"


def clean_white_crop(sheet: np.ndarray, box, mask_rects=None, flip_x: bool = False, up: int = 2) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = sheet[y0:y1, x0:x1].copy()
    bg_col = estimate_white_bg(crop)
    if mask_rects:
        for (mx0, my0, mx1, my1) in mask_rects:
            lx0, ly0 = max(0, mx0 - x0), max(0, my0 - y0)
            lx1, ly1 = min(crop.shape[1], mx1 - x0), min(crop.shape[0], my1 - y0)
            if lx1 > lx0 and ly1 > ly0:
                crop[ly0:ly1, lx0:lx1] = bg_col
    if flip_x:
        crop = cv2.flip(crop, 1)
    if up > 1:
        crop = cv2.resize(crop, (crop.shape[1] * up, crop.shape[0] * up), interpolation=cv2.INTER_LANCZOS4)
    return crop


def prep_void_leviathan_clean_rgba():
    """Combine crisp obsidian body from Batch 2C cutout + blazing golden wings directly from raw input RGB (zero haze!)."""
    dst_dir = os.path.join(IN_ROOT, "void_leviathan")
    os.makedirs(dst_dir, exist_ok=True)
    # Use the clean masked RGB crop from batch2c/inputs/void_leviathan/front.png directly!
    rgb_in = np.array(Image.open(os.path.join(B2C_IN, "void_leviathan", "front.png")).convert("RGB"))
    # Re-project the clean solid obsidian body mask from batch2c/outputs/void_leviathan/cutouts/front.png
    # OR build a crisp clean mask directly from rgb_in (dark uniform navy backdrop lum<42, sat<22) + edge-flood!
    h, w = rgb_in.shape[:2]
    rf = rgb_in.astype(np.float32)
    lum = rf.mean(axis=2)
    sat = rf.max(axis=2) - rf.min(axis=2)
    # Border median dark studio navy
    border = np.concatenate([rf[:12, :].reshape(-1, 3), rf[-12:, :].reshape(-1, 3), rf[:, :12].reshape(-1, 3), rf[:, -12:].reshape(-1, 3)], axis=0)
    bg = np.median(border[border.mean(axis=1) <= np.percentile(border.mean(axis=1), 40)], axis=0)
    dist = np.linalg.norm(rf - bg[None, None, :], axis=2)

    # Flood-fill background from image border across pixels very close to dark backdrop (dist < 22 & sat < 24)
    bg_cand = ((dist < 22) & (sat < 24)).astype(np.uint8)
    bg_cand = cv2.morphologyEx(bg_cand, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    ff = bg_cand.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for sx, sy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)]:
        if ff[sy, sx] == 1:
            cv2.floodFill(ff, mask, (sx, sy), 2)
    fg = (ff != 2).astype(np.uint8)
    # Guarantee every bright golden flame wing pixel (sat>=44 & lum>=60) is foreground
    fg[(sat >= 44) & (lum >= 60)] = 1
    # Close small internal gaps inside dark obsidian scales
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    # Keep largest connected component (+ any large wing tips >= 0.4% main area)
    num_l, labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    if num_l > 1:
        max_area = int(stats[1:, cv2.CC_STAT_AREA].max())
        keep = np.zeros_like(fg, dtype=bool)
        for lid in range(1, num_l):
            if stats[lid, cv2.CC_STAT_AREA] >= max(120, int(max_area * 0.004)):
                keep |= (labels == lid)
        fg = keep.astype(np.uint8)
    alpha = cv2.GaussianBlur((fg * 255).astype(np.uint8), (3, 3), 0.7)
    arr = np.dstack([rgb_in, alpha])
    ys, xs = np.where(alpha >= 40)
    if len(xs) > 0:
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        crop = arr[y0:y1, x0:x1]
        ch, cw = crop.shape[:2]
        pad = max(16, int(max(ch, cw) * 0.06))
        canvas = np.zeros((ch + 2 * pad, cw + 2 * pad, 4), dtype=np.uint8)
        canvas[pad : pad + ch, pad : pad + cw] = crop
        arr = canvas
    Image.fromarray(arr, mode="RGBA").save(os.path.join(dst_dir, "front.png"))


def save_views(cid: str, views: dict):
    out_dir = os.path.join(IN_ROOT, cid)
    os.makedirs(out_dir, exist_ok=True)
    sheet = np.array(Image.open(SHEETS[cid]).convert("RGB"))
    for vname, spec in views.items():
        box, rects = spec[0], spec[1]
        flip_x = spec[2] if len(spec) > 2 else False
        crop = clean_white_crop(sheet, box, rects, flip_x=flip_x, up=2)
        Image.fromarray(crop).save(os.path.join(out_dir, f"{vname}.png"))


def make_contact_sheet(manifest: dict, out_path: str):
    rows = []
    cell = 220
    for item in manifest["characters"]:
        cid = item["id"]
        cdir = os.path.join(IN_ROOT, cid)
        imgs = []
        for vk, fname in item["mv_views"].items():
            im = np.array(Image.open(os.path.join(cdir, fname)).convert("RGBA"))
            h, w = im.shape[:2]
            sc = (cell - 26) / max(h, w)
            nw, nh = max(1, int(w * sc)), max(1, int(h * sc))
            rs = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
            tile = np.full((cell, cell, 3), (38, 44, 58), dtype=np.uint8)
            y0 = 22 + (cell - 22 - nh) // 2
            x0 = (cell - nw) // 2
            al = rs[:, :, 3:4].astype(np.float32) / 255.0
            tile[y0 : y0 + nh, x0 : x0 + nw] = (
                rs[:, :, :3].astype(np.float32) * al + tile[y0 : y0 + nh, x0 : x0 + nw].astype(np.float32) * (1 - al)
            ).astype(np.uint8)
            cv2.putText(tile, f"{cid}: {vk}", (5, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (240, 244, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        while len(imgs) < 3:
            imgs.append(np.full((cell, cell, 3), (18, 20, 26), dtype=np.uint8))
        rows.append(np.hstack(imgs[:3]))
    Image.fromarray(np.vstack(rows)).save(out_path)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)

    print("Preparing void_leviathan (clean RGBA redo)...")
    prep_void_leviathan_clean_rgba()

    print("Preparing lumen_deer...")
    save_views("lumen_deer", {
        "front": ((20, 14, 445, 706), []),
        "left": ((455, 14, 992, 706), [(955, 14, 992, 410)]),
        "back": ((960, 14, 1365, 706), [(960, 500, 992, 660)]),
    })

    print("Preparing apex_drake (front + left)...")
    save_views("apex_drake", {
        "front": ((44, 72, 495, 368), []),
        "left": ((505, 58, 1362, 376), []),
    })

    print("Preparing amphibian_brute (side flipped -> left)...")
    save_views("amphibian_brute", {
        "front": ((8, 36, 480, 718), []),
        "left": ((470, 36, 945, 718), [], True),
        "back": ((925, 36, 1372, 718), []),
    })

    print("Preparing storm_bat...")
    save_views("storm_bat", {
        "front": ((22, 48, 490, 714), []),
        "left": ((500, 48, 868, 714), []),
        "back": ((912, 48, 1358, 714), []),
    })

    print("Preparing shadow_stalker_beast...")
    save_views("shadow_stalker_beast", {
        "front": ((48, 164, 240, 650), []),
        "left": ((242, 164, 782, 650), []),
        "back": ((784, 164, 976, 650), []),
    })

    print("Preparing bio_sloth...")
    save_views("bio_sloth", {
        "front": ((18, 60, 490, 728), []),
        "left": ((518, 60, 916, 728), []),
        "back": ((912, 60, 1362, 728), []),
    })

    print("Preparing plasma_wasp...")
    save_views("plasma_wasp", {
        "front": ((22, 170, 385, 675), []),
        "left": ((375, 170, 705, 675), [(450, 200, 620, 315)]),
        "back": ((698, 170, 1020, 675), []),
    })

    print("Preparing cryo_panther...")
    save_views("cryo_panther", {
        "front": ((62, 136, 372, 695), []),
        "left": ((376, 136, 1054, 695), []),
        "back": ((1058, 136, 1326, 695), []),
    })

    print("Preparing glow_moth...")
    save_views("glow_moth", {
        "front": ((26, 102, 540, 622), []),
        "left": ((542, 102, 862, 622), []),
        "back": ((866, 102, 1352, 622), [(866, 102, 912, 360)]),
    })

    print("Preparing electric_wolf...")
    save_views("electric_wolf", {
        "front": ((32, 92, 360, 720), []),
        "left": ((364, 92, 1030, 720), []),
        "back": ((1034, 92, 1344, 720), []),
    })

    print("Preparing hydro_serpent (sheet order: SIDE, FRONT, BACK)...")
    save_views("hydro_serpent", {
        "front": ((598, 76, 945, 706), []),
        "left": ((24, 76, 595, 706), []),
        "back": ((950, 76, 1335, 706), []),
    })

    print("Preparing venom_mantis...")
    save_views("venom_mantis", {
        "front": ((14, 24, 492, 744), []),
        "left": ((496, 24, 934, 744), []),
        "back": ((936, 24, 1366, 744), []),
    })

    manifest = {
        "batch": "vesselbound_batch3a",
        "rembg_model": "isnet-general-use",
        "characters": [
            {"id": "void_leviathan", "rig_type": "boss_serpent", "mv_views": {"front": "front.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "lumen_deer", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "storm_bat", "rig_type": "winged", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "plasma_wasp", "rig_type": "insect", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "glow_moth", "rig_type": "insect", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "electric_wolf", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "venom_mantis", "rig_type": "mantis", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "apex_drake", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "amphibian_brute", "rig_type": "humanoid", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "shadow_stalker_beast", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "bio_sloth", "rig_type": "humanoid", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "cryo_panther", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "hydro_serpent", "rig_type": "serpent", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
        ],
    }

    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    check_path = os.path.join(OUT_ROOT, "batch3a_crops_check.png")
    make_contact_sheet(manifest, check_path)
    print("Contact sheet written:", check_path)

    zip_path = os.path.join(OUT_ROOT, "batch3a_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(IN_ROOT, "manifest.json"), "manifest.json")
        for item in manifest["characters"]:
            cid = item["id"]
            cdir = os.path.join(IN_ROOT, cid)
            for fname in set(item["mv_views"].values()):
                zf.write(os.path.join(cdir, fname), f"{cid}/{fname}")

    os.makedirs(TMP_UPLOAD, exist_ok=True)
    shutil.copy2(zip_path, os.path.join(TMP_UPLOAD, "batch3a_inputs.zip"))
    print(f"Zip written: {zip_path} ({os.path.getsize(zip_path) / 1e6:.2f} MB) -> also copied to {TMP_UPLOAD}")


if __name__ == "__main__":
    main()
