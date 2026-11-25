"""Prepare Batch 6 (14 Standalone Socketable 3D Weapons & Shields + Paladin Boss Gear) for Colab Hunyuan3D-2mv.

Weapons (14 total — all aligned upright with grip/shaft at bottom and blade/head at top):
  From Robot Paladin sheet (paladin_tech_lance + 2-view paladin_tower_shield for armed Paladin & weapon sockets):
    1. paladin_tech_lance      (Massive Tech-Lance — rotated upright, cyan energy core)
    2. paladin_tower_shield    (Heavy Tower Shield — TRUE 2-view front + back with golden circuits)
  From Void Sanctum blades-and-reach.webp:
    3. cyber_greatsword        (Cyber-Arcane Greatsword — cyan circuit runes)
    4. void_scythe             (Void Energy Scythe — purple plasma crescent)
    5. frost_longsword         (Glacial Crystal Longsword — ice blade & snowflake hilt)
    6. shadow_dagger           (Runed Shadow Dagger — obsidian blade)
  From Void Sanctum heavy-and-defense.webp:
    7. magma_battleaxe         (Volcanic Magma Double-Axe — glowing lava cracks)
    8. rune_warhammer          (Aegis Stone-Gold Warhammer — cyan reactor core)
    9. solar_shield            (Celestial Golden Sun Shield — ornate gold & cyan filigree)
   10. elderwood_spear         (Living Vine Elderwood Spear — gnarled bark & leaf shaft)
  From Void Sanctum ranged-and-magic.webp:
   11. sylva_bow               (Cyber-Root Recurve Bow — gnarled branches & cyan lines)
   12. lumen_chakram           (Radiant Halo Chakram — gold spiked ring & cyan energy arc)
   13. storm_staff             (Arcane Storm Crystal Staff — crackling blue crystal & runes)
   14. coral_trident           (Abyssal Coral Trident — aqua glowing prongs & coral)

Outputs:
  - scratch/colab_batch6_weapons/inputs/<id>/{front,back}.png
  - scratch/colab_batch6_weapons/batch6_inputs_preview.png
  - tmp/colab_batch56/batch6_weapons_inputs.zip
"""
import json
import os
import shutil
import zipfile
import cv2
import numpy as np
from PIL import Image

VS_WEAPONS = r"D:\plajah game assets deign from promtps\Shooter\void-sanctum-complete\void-sanctum\weapons"
SHOOTER = r"D:\plajah game assets deign from promtps\Shooter\Nov 15 - 14_43"

SHEETS = {
    "blades": os.path.join(VS_WEAPONS, "blades-and-reach.webp"),
    "heavy": os.path.join(VS_WEAPONS, "heavy-and-defense.webp"),
    "ranged": os.path.join(VS_WEAPONS, "ranged-and-magic.webp"),
    "paladin": os.path.join(SHOOTER, "Robot_paladin_character_design_t\u2026_3c90e266.jpg"),
}

OUT_ROOT = os.environ.get(
    "BATCH6_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch6_weapons",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch56"


def estimate_bg(crop: np.ndarray) -> np.ndarray:
    border = np.concatenate(
        [crop[:10, :].reshape(-1, 3), crop[-10:, :].reshape(-1, 3), crop[:, :10].reshape(-1, 3), crop[:, -10:].reshape(-1, 3)],
        axis=0,
    )
    return np.median(border, axis=0).astype(np.uint8)


def pad_to_square(img: np.ndarray, bg: np.ndarray, pad_frac: float = 0.08, target_max: int = 1024) -> np.ndarray:
    h, w = img.shape[:2]
    side = int(max(h, w) * (1.0 + 2.0 * pad_frac))
    canvas = np.empty((side, side, 3), dtype=np.uint8)
    canvas[:, :] = bg
    y0 = (side - h) // 2
    x0 = (side - w) // 2
    canvas[y0 : y0 + h, x0 : x0 + w] = img
    if side != target_max:
        interp = cv2.INTER_LANCZOS4 if side < target_max else cv2.INTER_AREA
        canvas = cv2.resize(canvas, (target_max, target_max), interpolation=interp)
    return canvas


def rotate_arbit(img: np.ndarray, angle_deg_ccw: float, bg: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    cx, cy = w / 2.0, h / 2.0
    M = cv2.getRotationMatrix2D((cx, cy), angle_deg_ccw, 1.0)
    cos = abs(M[0, 0])
    sin = abs(M[0, 1])
    nw = int(h * sin + w * cos)
    nh = int(h * cos + w * sin)
    M[0, 2] += (nw / 2.0) - cx
    M[1, 2] += (nh / 2.0) - cy
    return cv2.warpAffine(
        img,
        M,
        (nw, nh),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=tuple(int(c) for c in bg),
    )


def crop_weapon(sheet: np.ndarray, box, mask_rects=None, rot_deg: float = 0.0) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = sheet[y0:y1, x0:x1].copy()
    bg = estimate_bg(crop)
    if mask_rects:
        for (mx0, my0, mx1, my1) in mask_rects:
            lx0, ly0 = max(0, mx0 - x0), max(0, my0 - y0)
            lx1, ly1 = min(crop.shape[1], mx1 - x0), min(crop.shape[0], my1 - y0)
            if lx1 > lx0 and ly1 > ly0:
                crop[ly0:ly1, lx0:lx1] = bg
    if abs(rot_deg - 90.0) < 1e-3:
        crop = cv2.rotate(crop, cv2.ROTATE_90_COUNTERCLOCKWISE)
    elif abs(rot_deg + 90.0) < 1e-3:
        crop = cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)
    elif abs(rot_deg) > 1e-3:
        crop = rotate_arbit(crop, rot_deg, bg)
    return pad_to_square(crop, bg, pad_frac=0.08, target_max=1024)


def make_contact_sheet(manifest: dict, out_path: str):
    rows = []
    cell = 220
    for item in manifest["characters"]:
        cid = item["id"]
        cdir = os.path.join(IN_ROOT, cid)
        imgs = []
        for vk, fname in item["mv_views"].items():
            im = np.array(Image.open(os.path.join(cdir, fname)).convert("RGB"))
            rs = cv2.resize(im, (cell - 24, cell - 24), interpolation=cv2.INTER_AREA)
            tile = np.full((cell, cell, 3), (34, 40, 54), dtype=np.uint8)
            tile[22 : 22 + cell - 24, 12 : 12 + cell - 24] = rs
            cv2.putText(tile, f"{cid}: {vk}", (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (240, 244, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        rows.append(np.hstack(imgs))
    left_col = np.vstack(rows[:7])
    right_col = np.vstack(rows[7:])
    sep = np.full((left_col.shape[0], 10, 3), (18, 22, 30), dtype=np.uint8)
    Image.fromarray(np.hstack([left_col, sep, right_col])).save(out_path)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)
    os.makedirs(TMP_UPLOAD, exist_ok=True)

    loaded = {k: np.array(Image.open(p).convert("RGB")) for k, p in SHEETS.items()}

    # (id, sheet_key, front_box, mask_rects, rot_deg_ccw, optional_back_spec)
    # If optional_back_spec is None, back = horizontal flip of front (exact mirror symmetry!)
    SPECS = [
        (
            "paladin_tech_lance",
            "paladin",
            (964, 34, 1368, 338),
            [(964, 34, 1138, 122), (1296, 290, 1368, 338)],
            53.8,  # rotate diagonal bottom-left->top-right into upright vertical!
            None,
        ),
        (
            "paladin_tower_shield",
            "paladin",
            (980, 386, 1164, 706),
            [(980, 668, 1006, 706)],
            0.0,
            ((1166, 386, 1344, 706), [(1318, 668, 1344, 706)], 0.0),
        ),
        ("cyber_greatsword", "blades", (4, 122, 1480, 558), [], 90.0, None),
        ("void_scythe", "blades", (1485, 28, 2224, 845), [], 0.0, None),
        ("frost_longsword", "blades", (20, 702, 1430, 1062), [], -90.0, None),
        ("shadow_dagger", "blades", (1465, 848, 2210, 954), [], -90.0, None),
        ("magma_battleaxe", "heavy", (282, 20, 778, 692), [], 0.0, None),
        ("rune_warhammer", "heavy", (1120, 20, 1632, 642), [], 0.0, None),
        ("solar_shield", "heavy", (240, 702, 816, 1266), [], 0.0, None),
        ("elderwood_spear", "heavy", (1308, 638, 1456, 1276), [], 0.0, None),
        ("sylva_bow", "ranged", (0, 94, 1198, 472), [], 90.0, None),
        ("lumen_chakram", "ranged", (58, 586, 582, 1106), [], 0.0, None),
        ("storm_staff", "ranged", (1256, 0, 1528, 1120), [], 0.0, None),
        ("coral_trident", "ranged", (1678, 18, 2180, 1120), [], 0.0, None),
    ]

    chars = []
    for wid, skey, fbox, masks, rot, back_spec in SPECS:
        sheet = loaded[skey]
        cdir = os.path.join(IN_ROOT, wid)
        os.makedirs(cdir, exist_ok=True)
        front_im = crop_weapon(sheet, fbox, masks, rot_deg=rot)
        if back_spec is not None:
            bbox, bmasks, brot = back_spec
            back_im = crop_weapon(sheet, bbox, bmasks, rot_deg=brot)
        else:
            back_im = cv2.flip(front_im, 1)
        Image.fromarray(front_im).save(os.path.join(cdir, "front.png"))
        Image.fromarray(back_im).save(os.path.join(cdir, "back.png"))
        chars.append(
            {
                "id": wid,
                "mv_views": {"front": "front.png", "back": "back.png"},
                "octree_resolution": 384,
                "face_limit": 120000,
                "seed": 42,
            }
        )
        print(f"Prepped weapon {wid:22s} ({'2-view' if back_spec else 'mirror-2v'})")

    manifest = {
        "batch": "batch6_weapons",
        "rembg_model": "isnet-general-use",
        "characters": chars,
    }
    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    preview_path = os.path.join(OUT_ROOT, "batch6_inputs_preview.png")
    make_contact_sheet(manifest, preview_path)
    print("Preview:", preview_path)

    zip_path = os.path.join(OUT_ROOT, "batch6_weapons_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _, files in os.walk(IN_ROOT):
            for fn in sorted(files):
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, IN_ROOT)
                zf.write(full, rel)

    upload_zip = os.path.join(TMP_UPLOAD, "batch6_weapons_inputs.zip")
    shutil.copy2(zip_path, upload_zip)
    print(f"Zipped {len(chars)} weapons -> {upload_zip} ({os.path.getsize(upload_zip)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
