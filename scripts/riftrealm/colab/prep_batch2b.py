"""Prepare Batch 2B Vesselbound Humanoid Heroes & Villains (+ clean Fallen Archangel redo) for Colab GPU.

Characters (8):
  - fallen_archangel  (CLEAN RGBA redo: strips faint backdrop haze from Batch 2A front cutout -> zero backplane!)
  - cyber_assassin    (front, left [flipped], back)
  - shadow_assassin   (front, left, back)
  - female_warrior    (front, left, back)
  - sorceress         (front, left [flipped], back)
  - demon_warrior     (front, left [flipped], back)
  - pyre_knight       (front, back — middle view on sheet is 3/4)
  - gorgon_construct  (front, left, back)
"""
import json
import os
import shutil
import zipfile
import cv2
import numpy as np
from PIL import Image

SHOOTER = r"D:\plajah game assets deign from promtps\Shooter\Nov 15 - 14_43"
B2A_OUT = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2a\outputs"
OUT_ROOT = os.environ.get(
    "BATCH2B_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2b",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch2b"

SHEETS = {
    "cyber_assassin": os.path.join(SHOOTER, "Cyber_assassin_character_design_\u2026_2a4ac2fe.jpg"),
    "shadow_assassin": os.path.join(SHOOTER, "Shadow_assassin_character_turnar\u2026_b3ef9d3a.jpg"),
    "female_warrior": os.path.join(SHOOTER, "Female_warrior_armor_turnaround_\u2026_551ee640.jpg"),
    "sorceress": os.path.join(SHOOTER, "Sorceress_character_design_turna\u2026_546a77ac.jpg"),
    "demon_warrior": os.path.join(SHOOTER, "Demon_warrior_character_design_s\u2026_d98ca809.jpg"),
    "pyre_knight": os.path.join(SHOOTER, "Pyre-Knight_Berserker_character_\u2026_26b55fc8.jpg"),
    "gorgon_construct": os.path.join(SHOOTER, "Cyber-Arcane_Gorgon_Construct_ch\u2026_03215113.jpg"),
}


def estimate_backdrop_color(crop: np.ndarray) -> np.ndarray:
    border = np.concatenate(
        [crop[:10, :].reshape(-1, 3), crop[-10:, :].reshape(-1, 3), crop[:, :10].reshape(-1, 3), crop[:, -10:].reshape(-1, 3)],
        axis=0,
    )
    lum = border.mean(axis=1)
    dark = border[lum <= np.percentile(lum, 25)]
    return np.median(dark, axis=0).astype(np.uint8)


def clean_rgb_crop(sheet: np.ndarray, box, mask_rects=None, flip_x: bool = False, up: int = 2) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = sheet[y0:y1, x0:x1].copy()
    bg_col = estimate_backdrop_color(crop)
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


def prep_fallen_archangel_clean_rgba():
    """Harden soft backdrop haze on Batch 2A fallen_archangel cutouts so Hunyuan3D-2mv generates zero backplane."""
    dst_dir = os.path.join(IN_ROOT, "fallen_archangel")
    os.makedirs(dst_dir, exist_ok=True)
    src_dir = os.path.join(B2A_OUT, "fallen_archangel", "cutouts")

    for vname in ("front", "left", "back"):
        im = Image.open(os.path.join(src_dir, f"{vname}.png")).convert("RGBA")
        arr = np.array(im)
        rgb = arr[:, :, :3].astype(np.float32)
        a = arr[:, :, 3].copy()
        lum = rgb.mean(axis=2)
        sat = rgb.max(axis=2) - rgb.min(axis=2)

        if vname == "front":
            # Keep solid armor/feathers (alpha >= 72) OR glowing halo/runic blades (bright/saturated with alpha >= 14)
            solid = (a >= 72) | ((a >= 14) & ((lum >= 72) | (sat >= 40)))
            a[~solid] = 0
            # Remove isolated stray haze specks, keep body+wings+halo+runic blades (>= 0.10% of main component)
            num_l, labels, stats, _ = cv2.connectedComponentsWithStats((a >= 14).astype(np.uint8), connectivity=8)
            if num_l > 1:
                max_area = int(stats[1:, cv2.CC_STAT_AREA].max())
                keep = np.zeros_like(a, dtype=bool)
                for lid in range(1, num_l):
                    if stats[lid, cv2.CC_STAT_AREA] >= max(50, int(max_area * 0.0010)):
                        keep |= (labels == lid)
                a[~keep] = 0
            # Boost kept solid pixels cleanly so feathers and glowing halo stay vivid
            a = np.where(a >= 72, np.clip((a.astype(np.float32) - 55) * (255.0 / 200.0), 0, 255).astype(np.uint8), np.where(a >= 14, 210, 0).astype(np.uint8))
        else:
            # Left & back were already clean; just strip any ultra-faint alpha < 60 dark haze
            a[(a < 60) & (lum < 55)] = 0

        arr[:, :, 3] = a
        ys, xs = np.where(a >= 40)
        if len(xs) > 0:
            y0, y1 = int(ys.min()), int(ys.max()) + 1
            x0, x1 = int(xs.min()), int(xs.max()) + 1
            crop = arr[y0:y1, x0:x1]
            ch, cw = crop.shape[:2]
            pad = max(16, int(max(ch, cw) * 0.06))
            canvas = np.zeros((ch + 2 * pad, cw + 2 * pad, 4), dtype=np.uint8)
            canvas[pad : pad + ch, pad : pad + cw] = crop
            arr = canvas
        Image.fromarray(arr, mode="RGBA").save(os.path.join(dst_dir, f"{vname}.png"))


def save_views(cid: str, views: dict):
    out_dir = os.path.join(IN_ROOT, cid)
    os.makedirs(out_dir, exist_ok=True)
    sheet = np.array(Image.open(SHEETS[cid]).convert("RGB"))
    for vname, spec in views.items():
        box, rects = spec[0], spec[1]
        flip_x = spec[2] if len(spec) > 2 else False
        crop = clean_rgb_crop(sheet, box, rects, flip_x=flip_x, up=2)
        Image.fromarray(crop).save(os.path.join(out_dir, f"{vname}.png"))


def make_contact_sheet(manifest: dict, out_path: str):
    rows = []
    cell = 260
    for item in manifest["characters"]:
        cid = item["id"]
        cdir = os.path.join(IN_ROOT, cid)
        imgs = []
        for vk, fname in item["mv_views"].items():
            im = np.array(Image.open(os.path.join(cdir, fname)).convert("RGBA"))
            h, w = im.shape[:2]
            sc = (cell - 28) / max(h, w)
            nw, nh = max(1, int(w * sc)), max(1, int(h * sc))
            rs = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
            tile = np.full((cell, cell, 3), (36, 42, 56), dtype=np.uint8)
            y0 = 24 + (cell - 24 - nh) // 2
            x0 = (cell - nw) // 2
            al = rs[:, :, 3:4].astype(np.float32) / 255.0
            tile[y0 : y0 + nh, x0 : x0 + nw] = (
                rs[:, :, :3].astype(np.float32) * al + tile[y0 : y0 + nh, x0 : x0 + nw].astype(np.float32) * (1 - al)
            ).astype(np.uint8)
            cv2.putText(tile, f"{cid}: {vk}", (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (240, 244, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        while len(imgs) < 3:
            imgs.append(np.full((cell, cell, 3), (18, 20, 26), dtype=np.uint8))
        rows.append(np.hstack(imgs[:3]))
    Image.fromarray(np.vstack(rows)).save(out_path)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)

    print("Preparing fallen_archangel (clean RGBA redo)...")
    prep_fallen_archangel_clean_rgba()

    print("Preparing cyber_assassin (side flipped -> left)...")
    save_views(
        "cyber_assassin",
        {
            "front": ((84, 70, 412, 712), [(305, 90, 412, 230), (320, 430, 412, 500)]),
            "left": ((428, 70, 646, 712), [(428, 120, 495, 225)], True),
            "back": ((678, 70, 996, 712), [(678, 90, 760, 220), (900, 120, 996, 220), (678, 500, 745, 580)]),
        },
    )

    print("Preparing shadow_assassin...")
    save_views(
        "shadow_assassin",
        {
            "front": ((180, 56, 682, 725), [(180, 445, 315, 725), (538, 445, 682, 725), (180, 270, 250, 340)]),
            "left": ((708, 56, 868, 725), []),
            "back": ((912, 56, 1320, 725), [(912, 445, 1020, 635)]),
        },
    )

    print("Preparing female_warrior...")
    save_views(
        "female_warrior",
        {
            "front": ((42, 56, 448, 712), []),
            "left": ((480, 48, 672, 712), []),
            "back": ((680, 48, 1062, 712), [(1010, 50, 1062, 165)]),
        },
    )

    print("Preparing sorceress (side flipped -> left)...")
    save_views(
        "sorceress",
        {
            "front": ((92, 62, 386, 712), []),
            "left": ((418, 62, 626, 712), [], True),
            "back": ((692, 62, 976, 712), []),
        },
    )

    print("Preparing demon_warrior (side flipped -> left)...")
    save_views(
        "demon_warrior",
        {
            "front": ((62, 68, 448, 720), []),
            "left": ((496, 68, 678, 720), [], True),
            "back": ((718, 68, 1082, 720), [(1058, 505, 1082, 720)]),
        },
    )

    print("Preparing pyre_knight (2-view: front + back)...")
    # Mask the battleaxe top handle stub and lower glowing blade head on left of front view for clean rigging
    save_views(
        "pyre_knight",
        {
            "front": ((36, 76, 430, 700), [(36, 300, 96, 415), (68, 460, 195, 622)]),
            "back": ((756, 98, 1104, 700), []),
        },
    )

    print("Preparing gorgon_construct...")
    save_views(
        "gorgon_construct",
        {
            "front": ((86, 66, 376, 702), [(315, 170, 376, 260), (315, 440, 376, 510)]),
            "left": ((420, 66, 716, 702), [(615, 340, 716, 440)]),
            "back": ((736, 66, 1044, 702), [(736, 330, 775, 440)]),
        },
    )

    manifest = {
        "batch": "vesselbound_batch2b",
        "rembg_model": "isnet-general-use",
        "characters": [
            {
                "id": "fallen_archangel",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "cyber_assassin",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "shadow_assassin",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "female_warrior",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "sorceress",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "demon_warrior",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "pyre_knight",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "gorgon_construct",
                "rig_type": "serpent_humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
        ],
    }

    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    check_path = os.path.join(OUT_ROOT, "batch2b_crops_check.png")
    make_contact_sheet(manifest, check_path)
    print("Contact sheet written:", check_path)

    zip_path = os.path.join(OUT_ROOT, "batch2b_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(IN_ROOT, "manifest.json"), "manifest.json")
        for item in manifest["characters"]:
            cid = item["id"]
            cdir = os.path.join(IN_ROOT, cid)
            for fname in set(item["mv_views"].values()):
                zf.write(os.path.join(cdir, fname), f"{cid}/{fname}")

    os.makedirs(TMP_UPLOAD, exist_ok=True)
    shutil.copy2(zip_path, os.path.join(TMP_UPLOAD, "batch2b_inputs.zip"))
    print(f"Zip written: {zip_path} ({os.path.getsize(zip_path) / 1e6:.2f} MB) -> also copied to {TMP_UPLOAD}")


if __name__ == "__main__":
    main()
