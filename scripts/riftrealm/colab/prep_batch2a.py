"""Prepare Batch 2A Vesselbound Boss & Hero turnaround panels for Google Colab Pro+ GPU (rembg + Hunyuan3D-2mv).

Characters (6):
  - fallen_archangel  (front, left, back -> Colab GPU rembg isnet-general-use)
  - prism_archon      (front, left, back -> crisp local RGBA cutout)
  - cyber_minotaur    (front, left, back -> Colab GPU rembg isnet-general-use)
  - dragon_knight     (front, left, back -> Colab GPU rembg isnet-general-use)
  - cyber_harpy       (front, left, back -> Colab GPU rembg isnet-general-use)
  - magma_titan       (front, back       -> Colab GPU rembg isnet-general-use)

Dark gunmetal/obsidian armor sheets on dark studio backdrops get clean label-masked RGB crops so Colab GPU's
neural background remover (isnet-general-use / u2net) cuts every dark armor plate and feather razor-sharp,
then saves the resulting RGBA cutouts right back into batch2a_shapes.zip for local 2048 PBR art projection.
"""
import json
import os
import shutil
import zipfile
import cv2
import numpy as np
from PIL import Image

SHOOTER = r"D:\plajah game assets deign from promtps\Shooter\Nov 15 - 14_43"
OUT_ROOT = os.environ.get(
    "BATCH2A_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2a",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch2a"

SHEETS = {
    "fallen_archangel": os.path.join(SHOOTER, "Fallen_angel_character_design_sheet_88b41504.jpg"),
    "prism_archon": os.path.join(SHOOTER, "Floating_prism_archon_character_\u2026_dbb79c20.jpg"),
    "cyber_minotaur": os.path.join(SHOOTER, "Cyber-Minotaur_character_turnaro\u2026_e2a20604.jpg"),
    "dragon_knight": os.path.join(SHOOTER, "Celestial_Dragon_Knight_characte\u2026_6d318661.jpg"),
    "cyber_harpy": os.path.join(SHOOTER, "Cyber_harpy_character_design_tur\u2026_8c13c994.jpg"),
    "magma_titan": os.path.join(SHOOTER, "Magma-Core_Cyber-Titan_with_warh\u2026_ec558385.jpg"),
}


def estimate_backdrop_color(crop: np.ndarray) -> np.ndarray:
    """Estimate clean dark studio backdrop RGB from the darkest 25% of border pixels."""
    border = np.concatenate(
        [crop[:10, :].reshape(-1, 3), crop[-10:, :].reshape(-1, 3), crop[:, :10].reshape(-1, 3), crop[:, -10:].reshape(-1, 3)],
        axis=0,
    )
    lum = border.mean(axis=1)
    dark = border[lum <= np.percentile(lum, 25)]
    return np.median(dark, axis=0).astype(np.uint8)


def clean_rgb_crop(sheet: np.ndarray, box, mask_rects=None, mask_polys=None, up: int = 2) -> np.ndarray:
    """Crop (x0,y0,x1,y1), fill UI label/inset rects & polys with clean studio backdrop color, and upscale 2x for crisp rembg."""
    x0, y0, x1, y1 = box
    crop = sheet[y0:y1, x0:x1].copy()
    bg_col = estimate_backdrop_color(crop)
    if mask_rects:
        for (mx0, my0, mx1, my1) in mask_rects:
            # Coords given in original sheet pixels -> convert to crop-local
            lx0, ly0 = max(0, mx0 - x0), max(0, my0 - y0)
            lx1, ly1 = min(crop.shape[1], mx1 - x0), min(crop.shape[0], my1 - y0)
            if lx1 > lx0 and ly1 > ly0:
                crop[ly0:ly1, lx0:lx1] = bg_col
    if mask_polys:
        for poly in mask_polys:
            pts = np.array([[px - x0, py - y0] for (px, py) in poly], dtype=np.int32)
            cv2.fillPoly(crop, [pts], [int(c) for c in bg_col])
    if up > 1:
        crop = cv2.resize(crop, (crop.shape[1] * up, crop.shape[0] * up), interpolation=cv2.INTER_LANCZOS4)
    return crop


def make_contact_sheet(manifest: dict, out_path: str):
    rows = []
    cell = 280
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
            tile = np.full((cell, cell, 3), (30, 34, 46), dtype=np.uint8)
            y0 = 24 + (cell - 24 - nh) // 2
            x0 = (cell - nw) // 2
            al = rs[:, :, 3:4].astype(np.float32) / 255.0
            tile[y0 : y0 + nh, x0 : x0 + nw] = (
                rs[:, :, :3].astype(np.float32) * al + tile[y0 : y0 + nh, x0 : x0 + nw].astype(np.float32) * (1 - al)
            ).astype(np.uint8)
            cv2.putText(tile, f"{cid}: {vk}", (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 244, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        while len(imgs) < 3:
            imgs.append(np.full((cell, cell, 3), (18, 20, 26), dtype=np.uint8))
        rows.append(np.hstack(imgs[:3]))
    Image.fromarray(np.vstack(rows)).save(out_path)


def save_views(cid: str, views: dict):
    out_dir = os.path.join(IN_ROOT, cid)
    os.makedirs(out_dir, exist_ok=True)
    sheet = np.array(Image.open(SHEETS[cid]).convert("RGB"))
    for vname, spec in views.items():
        box, rects = spec[0], spec[1]
        polys = spec[2] if len(spec) > 2 else None
        crop = clean_rgb_crop(sheet, box, rects, mask_polys=polys, up=2)
        Image.fromarray(crop).save(os.path.join(out_dir, f"{vname}.png"))


def main():
    os.makedirs(IN_ROOT, exist_ok=True)

    print("Preparing fallen_archangel...")
    save_views(
        "fallen_archangel",
        {
            "front": (
                (4, 34, 662, 696),
                [(280, 34, 385, 86), (12, 34, 100, 72), (10, 340, 82, 375), (630, 122, 662, 696)],
            ),
            "left": (
                (616, 40, 845, 696),
                [(655, 40, 735, 86), (616, 70, 665, 130), (616, 130, 636, 200), (822, 395, 845, 575)],
            ),
            "back": (
                (820, 76, 1228, 696),
                [(980, 76, 1070, 118), (820, 76, 845, 290)],
            ),
        },
    )

    print("Preparing prism_archon...")
    # Clean RGB crops too so Colab GPU isnet-general-use keeps every crisp translucent blue-energy edge!
    save_views(
        "prism_archon",
        {
            "front": ((72, 68, 446, 698), [(355, 130, 446, 250), (72, 460, 175, 560), (350, 435, 446, 560)]),
            "left": ((480, 68, 706, 698), []),
            "back": ((736, 68, 1086, 698), [(736, 120, 825, 255), (960, 480, 1086, 698)]),
        },
    )

    print("Preparing cyber_minotaur...")
    save_views(
        "cyber_minotaur",
        {
            "front": ((62, 62, 444, 702), [(62, 62, 165, 118)]),
            "left": ((428, 72, 702, 702), []),
            "back": ((726, 98, 1088, 702), [(1008, 98, 1088, 172)]),
        },
    )

    print("Preparing dragon_knight...")
    save_views(
        "dragon_knight",
        {
            "front": ((74, 34, 442, 646), [(365, 95, 442, 145)]),
            "left": ((562, 28, 976, 646), [(765, 95, 890, 145)]),
            "back": ((970, 32, 1348, 646), [(1220, 95, 1348, 145)]),
        },
    )

    print("Preparing cyber_harpy...")
    save_views(
        "cyber_harpy",
        {
            "front": (
                (32, 70, 624, 738),
                [(312, 70, 428, 96), (32, 505, 275, 738), (452, 510, 624, 738), (550, 125, 624, 195), (32, 70, 125, 225)],
            ),
            "left": ((638, 68, 882, 738), [(675, 68, 765, 96), (638, 68, 685, 125)]),
            "back": ((894, 72, 1348, 508), [(1068, 72, 1175, 98), (1170, 385, 1348, 508)]),
        },
    )

    print("Preparing magma_titan...")
    # Clean unarmed body crop matching back view (warhammer excluded so 58-joint rig bends cleanly)
    save_views(
        "magma_titan",
        {
            "front": (
                (245, 84, 745, 742),
                [
                    (245, 84, 300, 102),
                    (545, 84, 745, 102),
                    (245, 385, 260, 470),
                    (245, 470, 295, 645),
                    (680, 600, 745, 648),
                    (702, 600, 745, 742),
                ],
                [[(318, 425), (386, 386), (398, 412), (326, 452)]],
            ),
            "back": ((862, 134, 1078, 378), []),
        },
    )

    manifest = {
        "batch": "vesselbound_batch2a",
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
                "id": "prism_archon",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "cyber_minotaur",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "dragon_knight",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "cyber_harpy",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "magma_titan",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
        ],
    }

    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    check_path = os.path.join(OUT_ROOT, "batch2a_crops_check.png")
    make_contact_sheet(manifest, check_path)
    print("Contact sheet written:", check_path)

    zip_path = os.path.join(OUT_ROOT, "batch2a_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(IN_ROOT, "manifest.json"), "manifest.json")
        for item in manifest["characters"]:
            cid = item["id"]
            cdir = os.path.join(IN_ROOT, cid)
            for fname in set(item["mv_views"].values()):
                zf.write(os.path.join(cdir, fname), f"{cid}/{fname}")

    os.makedirs(TMP_UPLOAD, exist_ok=True)
    shutil.copy2(zip_path, os.path.join(TMP_UPLOAD, "batch2a_inputs.zip"))
    print(f"Zip written: {zip_path} ({os.path.getsize(zip_path) / 1e6:.2f} MB) -> also copied to {TMP_UPLOAD}")


if __name__ == "__main__":
    main()
