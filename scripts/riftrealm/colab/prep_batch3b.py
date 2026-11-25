"""Prepare Batch 3B (remaining 12 Cyber Forest Level Assets creatures) for Google Colab GPU.

12 white-studio 3-view orthographic turnarounds:
  - bio_axolotl       (04 Axolotl_glowing_bio-light_turnar…_2bab57ba.jpg)
  - cyan_bat          (06 Bat_creature_turnaround_views_acb6e842.jpg — side flipped -> left!)
  - glow_beetle       (07 Beetle_creature_turnaround_views_e53f5e7e.jpg)
  - blue_axolotl      (08 Bioluminescent_amphibian_charact…_afb60dfa.jpg)
  - bio_turtle        (11 Bioluminescent_turtle_amphibian_…_f8f48e28.jpg — top row)
  - sky_jelly         (13 Creature_turnaround_views_white_…_35e170ea.jpg — SIDE, FRONT, BACK order!)
  - cyber_dragonfly   (15 Dragonfly_character_model_sheet_0cb19e69.jpg)
  - electric_newt     (16 Electric_amphibian_creature_turn…_f6e6e79d.jpg)
  - acid_hornet       (19 Flying_insect_creature_design_sheet_712b6be3.jpg)
  - venom_caterpillar (21 Poisonous_caterpillar_character_…_d550e356.jpg)
  - poison_salamander (23 Poisonous_salamander_3D_turnarou…_980e7f7d.jpg)
  - venom_toad        (24 Venomous_toad_character_turnarou…_9e90921e.jpg)
"""
import json
import os
import shutil
import zipfile
import cv2
import numpy as np
from PIL import Image

CF = r"D:\plajah game assets deign from promtps\Shooter\Cyber Forest Level Assets"
OUT_ROOT = os.environ.get(
    "BATCH3B_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch3b",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch3b"

SHEETS = {
    "bio_axolotl": os.path.join(CF, "Axolotl_glowing_bio-light_turnar\u2026_2bab57ba.jpg"),
    "cyan_bat": os.path.join(CF, "Bat_creature_turnaround_views_acb6e842.jpg"),
    "glow_beetle": os.path.join(CF, "Beetle_creature_turnaround_views_e53f5e7e.jpg"),
    "blue_axolotl": os.path.join(CF, "Bioluminescent_amphibian_charact\u2026_afb60dfa.jpg"),
    "bio_turtle": os.path.join(CF, "Bioluminescent_turtle_amphibian_\u2026_f8f48e28.jpg"),
    "sky_jelly": os.path.join(CF, "Creature_turnaround_views_white_\u2026_35e170ea.jpg"),
    "cyber_dragonfly": os.path.join(CF, "Dragonfly_character_model_sheet_0cb19e69.jpg"),
    "electric_newt": os.path.join(CF, "Electric_amphibian_creature_turn\u2026_f6e6e79d.jpg"),
    "acid_hornet": os.path.join(CF, "Flying_insect_creature_design_sheet_712b6be3.jpg"),
    "venom_caterpillar": os.path.join(CF, "Poisonous_caterpillar_character_\u2026_d550e356.jpg"),
    "poison_salamander": os.path.join(CF, "Poisonous_salamander_3D_turnarou\u2026_980e7f7d.jpg"),
    "venom_toad": os.path.join(CF, "Venomous_toad_character_turnarou\u2026_9e90921e.jpg"),
}


def estimate_white_bg(crop: np.ndarray) -> np.ndarray:
    border = np.concatenate(
        [crop[:8, :].reshape(-1, 3), crop[-8:, :].reshape(-1, 3), crop[:, :8].reshape(-1, 3), crop[:, -8:].reshape(-1, 3)],
        axis=0,
    )
    lum = border.mean(axis=1)
    bright = border[lum >= np.percentile(lum, 65)]
    return np.median(bright, axis=0).astype(np.uint8)


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

    print("Preparing bio_axolotl...")
    save_views("bio_axolotl", {
        "front": ((44, 108, 455, 650), []),
        "left": ((455, 108, 990, 650), []),
        "back": ((992, 108, 1345, 650), []),
    })

    print("Preparing cyan_bat (side flipped -> left)...")
    save_views("cyan_bat", {
        "front": ((32, 34, 498, 725), []),
        "left": ((505, 34, 922, 725), [], True),
        "back": ((925, 34, 1358, 725), []),
    })

    print("Preparing glow_beetle...")
    save_views("glow_beetle", {
        "front": ((18, 136, 368, 635), []),
        "left": ((350, 136, 735, 635), []),
        "back": ((735, 136, 1042, 635), []),
    })

    print("Preparing blue_axolotl...")
    save_views("blue_axolotl", {
        "front": ((22, 72, 412, 686), []),
        "left": ((414, 72, 1005, 686), []),
        "back": ((1005, 72, 1358, 686), []),
    })

    print("Preparing bio_turtle (top row)...")
    save_views("bio_turtle", {
        "front": ((28, 118, 306, 382), []),
        "left": ((308, 118, 720, 382), []),
        "back": ((722, 118, 996, 382), []),
    })

    print("Preparing sky_jelly (sheet order: SIDE, FRONT, BACK)...")
    save_views("sky_jelly", {
        "front": ((380, 126, 686, 608), []),
        "left": ((34, 126, 378, 608), []),
        "back": ((688, 126, 1014, 608), []),
    })

    print("Preparing cyber_dragonfly...")
    save_views("cyber_dragonfly", {
        "front": ((20, 146, 520, 620), []),
        "left": ((522, 146, 868, 620), []),
        "back": ((870, 146, 1365, 620), []),
    })

    print("Preparing electric_newt...")
    save_views("electric_newt", {
        "front": ((32, 76, 326, 678), []),
        "left": ((328, 76, 1066, 678), []),
        "back": ((1068, 76, 1338, 678), []),
    })

    print("Preparing acid_hornet...")
    save_views("acid_hornet", {
        "front": ((18, 56, 480, 718), []),
        "left": ((482, 56, 926, 718), []),
        "back": ((928, 56, 1362, 718), []),
    })

    print("Preparing venom_caterpillar...")
    save_views("venom_caterpillar", {
        "front": ((34, 212, 345, 545), []),
        "left": ((346, 212, 1030, 545), []),
        "back": ((1032, 212, 1344, 545), []),
    })

    print("Preparing poison_salamander...")
    save_views("poison_salamander", {
        "front": ((62, 224, 385, 592), []),
        "left": ((386, 224, 1034, 592), []),
        "back": ((1036, 224, 1342, 592), []),
    })

    print("Preparing venom_toad...")
    save_views("venom_toad", {
        "front": ((18, 136, 464, 706), []),
        "left": ((466, 136, 944, 706), []),
        "back": ((946, 136, 1362, 706), []),
    })

    manifest = {
        "batch": "vesselbound_batch3b",
        "rembg_model": "isnet-general-use",
        "characters": [
            {"id": "bio_axolotl", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "cyan_bat", "rig_type": "winged", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "glow_beetle", "rig_type": "insect", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "blue_axolotl", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "bio_turtle", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "sky_jelly", "rig_type": "floater", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "cyber_dragonfly", "rig_type": "insect", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "electric_newt", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "acid_hornet", "rig_type": "insect", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "venom_caterpillar", "rig_type": "serpent", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "poison_salamander", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "venom_toad", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
        ],
    }

    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    check_path = os.path.join(OUT_ROOT, "batch3b_crops_check.png")
    make_contact_sheet(manifest, check_path)
    print("Contact sheet written:", check_path)

    zip_path = os.path.join(OUT_ROOT, "batch3b_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(IN_ROOT, "manifest.json"), "manifest.json")
        for item in manifest["characters"]:
            cid = item["id"]
            cdir = os.path.join(IN_ROOT, cid)
            for fname in set(item["mv_views"].values()):
                zf.write(os.path.join(cdir, fname), f"{cid}/{fname}")

    os.makedirs(TMP_UPLOAD, exist_ok=True)
    shutil.copy2(zip_path, os.path.join(TMP_UPLOAD, "batch3b_inputs.zip"))
    print(f"Zip written: {zip_path} ({os.path.getsize(zip_path) / 1e6:.2f} MB) -> also copied to {TMP_UPLOAD}")


if __name__ == "__main__":
    main()
