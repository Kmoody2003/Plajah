"""Prep Batch 7 — 21 Modular 3D Vessel Wardrobe / Armor Pieces from outfit-props/*.webp for Colab Hunyuan3D.

Auto-tight-crops each isolated armor piece off its neutral grey background and writes:
  - C:/Users/Kenne/plajah/tmp/colab_batch789/batch7_wardrobe_upload.zip
  - scratch/batch7_wardrobe_crops.png (visual QA contact sheet)
"""
import json
import os
import zipfile
import cv2
import numpy as np
from PIL import Image

OUTFIT_DIR = r"D:\plajah game assets deign from promtps\Shooter\void-sanctum-complete\void-sanctum\outfit-props"
BRAIN = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549"
SCRATCH = os.path.join(BRAIN, "scratch")
OUT_DIR = os.path.join(SCRATCH, "colab_batch7_wardrobe")
TMP_ZIP = os.path.join(SCRATCH, "colab_uploads", "batch7_wardrobe_inputs.zip")

# (piece_id, sheet_file, (x0, y0, x1, y1), mount_bone, pbr_profile)
PIECES = [
    ("aegis_helm",           "aegis.webp", (0.765, 0.04, 0.98, 0.44), "Head",         "armored_metal"),
    ("aegis_chestplate",     "aegis.webp", (0.48, 0.23, 0.71, 0.62), "Spine2",       "armored_metal"),
    ("aegis_pauldron",       "aegis.webp", (0.34, 0.29, 0.49, 0.60), "LeftArm",      "armored_metal"),
    ("aegis_belt",           "aegis.webp", (0.70, 0.46, 0.99, 0.68), "Hips",         "leather_metal"),
    ("aegis_gauntlet",       "aegis.webp", (0.21, 0.61, 0.34, 0.98), "LeftForeArm",  "armored_metal"),
    ("aegis_greave",         "aegis.webp", (0.48, 0.61, 0.60, 0.98), "LeftLeg",      "armored_metal"),
    ("lumen_halo",           "lumen.webp", (0.01, 0.03, 0.25, 0.52), "Head",         "armored_metal"),
    ("lumen_golden_wings",   "lumen.webp", (0.52, 0.03, 0.75, 0.55), "Spine2",       "armored_metal"),
    ("lumen_chestplate",     "lumen.webp", (0.05, 0.60, 0.20, 0.92), "Spine2",       "armored_metal"),
    ("lumen_pauldron",       "lumen.webp", (0.23, 0.57, 0.38, 0.94), "LeftArm",      "armored_metal"),
    ("lumen_greave",         "lumen.webp", (0.53, 0.55, 0.63, 0.95), "LeftLeg",      "armored_metal"),
    ("nyx_fin_crest",        "nyx.webp",   (0.01, 0.02, 0.40, 0.52), "Spine2",       "leather_metal"),
    ("nyx_visor",            "nyx.webp",   (0.40, 0.11, 0.65, 0.41), "Head",         "armored_metal"),
    ("nyx_chitin_blade",     "nyx.webp",   (0.01, 0.50, 0.335, 0.98), "RightHand",    "volcanic_obsidian"),
    ("pyre_molten_hammer",   "pyre.webp",  (0.08, 0.01, 0.36, 0.64), "RightHand",    "volcanic_obsidian"),
    ("pyre_obsidian_chest",  "pyre.webp",  (0.39, 0.44, 0.60, 0.83), "Spine2",       "volcanic_obsidian"),
    ("pyre_iron_pauldron",   "pyre.webp",  (0.65, 0.10, 0.78, 0.38), "LeftArm",      "armored_metal"),
    ("pyre_smith_belt",      "pyre.webp",  (0.60, 0.45, 0.96, 0.76), "Hips",         "leather_metal"),
    ("sylva_antler_crown",   "sylva.webp", (0.01, 0.03, 0.35, 0.50), "Head",         "stone_moss"),
    ("maris_coral_crown",    "maris.webp", (0.02, 0.03, 0.39, 0.52), "Head",         "crystal_ice"),
    ("maris_shell_pauldron", "maris.webp", (0.03, 0.57, 0.53, 0.96), "Spine2",       "crystal_ice"),
]


def tight_square_crop(im: Image.Image, box, size: int = 1024, mask_hammer_greaves: bool = False) -> Image.Image:
    w, h = im.size
    x0, y0, x1, y1 = int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)
    cr = im.crop((x0, y0, x1, y1)).convert("RGB")
    arr = np.asarray(cr).copy()
    # Neutral grey studio background = median of 4 corners
    bg = np.median(np.vstack([arr[:8, :8].reshape(-1, 3), arr[:8, -8:].reshape(-1, 3), arr[-8:, :8].reshape(-1, 3), arr[-8:, -8:].reshape(-1, 3)]), axis=0)
    if mask_hammer_greaves:
        ch, cw = arr.shape[:2]
        bg_u8 = np.round(bg).astype(np.uint8)
        arr[int(ch * 0.72):, : int(cw * 0.36)] = bg_u8
        arr[int(ch * 0.72):, int(cw * 0.64):] = bg_u8
        cr = Image.fromarray(arr)
    diff = np.linalg.norm(arr.astype(np.float32) - bg, axis=2)
    ys, xs = np.nonzero(diff > 18)
    if len(xs) > 100:
        pad = int(0.06 * max(cr.size))
        rx0, ry0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
        rx1, ry1 = min(cr.width, int(xs.max()) + pad), min(cr.height, int(ys.max()) + pad)
        cr = cr.crop((rx0, ry0, rx1, ry1))
    # Pad cleanly onto neutral square matching bg color
    side = max(cr.width, cr.height)
    bg_col = tuple(int(round(c)) for c in bg)
    sq = Image.new("RGB", (side, side), bg_col)
    sq.paste(cr, ((side - cr.width) // 2, (side - cr.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(TMP_ZIP), exist_ok=True)
    cache = {}
    manifest = {"batch": "batch7_wardrobe", "rembg_model": "isnet-general-use", "characters": []}
    tiles = []
    for pid, sfn, box, bone, prof in PIECES:
        if sfn not in cache:
            cache[sfn] = Image.open(os.path.join(OUTFIT_DIR, sfn)).convert("RGB")
        im = tight_square_crop(cache[sfn], box, 1024, mask_hammer_greaves=(pid == "pyre_molten_hammer"))
        pdir = os.path.join(OUT_DIR, pid)
        os.makedirs(pdir, exist_ok=True)
        im.save(os.path.join(pdir, "front.png"))
        # Mirror horizontally as back view (exact Batch-6 weapon trick for full 3D front+back relief!)
        im.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(pdir, "back.png"))
        manifest["characters"].append({
            "id": pid,
            "rig_type": "wardrobe",
            "mount_bone": bone,
            "profile": prof,
            "octree_resolution": 320,
            "face_limit": 120000,
            "mv_views": {"front": "front.png", "back": "back.png"},
        })
        t = cv2.resize(np.asarray(im), (220, 220), interpolation=cv2.INTER_AREA)
        cv2.putText(t, f"{pid}", (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (20, 20, 24), 2, cv2.LINE_AA)
        cv2.putText(t, f"{pid}", (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(t)

    man_path = os.path.join(OUT_DIR, "manifest.json")
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    cols = 7
    while len(tiles) % cols:
        tiles.append(np.full((220, 220, 3), (30, 34, 42), np.uint8))
    rows = [np.hstack(tiles[i : i + cols]) for i in range(0, len(tiles), cols)]
    qa_png = os.path.join(SCRATCH, "batch7_wardrobe_crops.png")
    Image.fromarray(np.vstack(rows)).save(qa_png)

    with zipfile.ZipFile(TMP_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(man_path, "manifest.json")
        for it in manifest["characters"]:
            cid = it["id"]
            for fn in it["mv_views"].values():
                zf.write(os.path.join(OUT_DIR, cid, fn), f"{cid}/{fn}")
    print(f"Prepared Batch 7 Wardrobe ({len(PIECES)} pieces) -> {TMP_ZIP} ({os.path.getsize(TMP_ZIP)/1e6:.2f} MB) | QA: {qa_png}")


if __name__ == "__main__":
    main()
