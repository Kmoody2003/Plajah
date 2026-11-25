"""Prepare Batch 4 Redo (Multi-View Hunyuan3D-2mv upgrade for Void Stalker & Robot Paladin) for Colab GPU.

Characters (2):
  - void_stalker   (clean hooded assassin body: front, left, back — pedestal base & back smoke-wing wisps masked so
                    body sculpt is 10/10 razor-sharp; animated BatWings cloak grafted cleanly locally!)
  - robot_paladin  (clean unarmed armored paladin: front, left [flipped from screen-right side], back — ready for
                    clean socket-mounted tech-lance, guns & heavy tower shield!)
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
    "BATCH4_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch4_redo",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch4"

SHEETS = {
    "void_stalker": os.path.join(SHOOTER, "Void_Stalker_Assassin_turnaround\u2026_75af16de.jpg"),
    "robot_paladin": os.path.join(SHOOTER, "Robot_paladin_character_design_t\u2026_3c90e266.jpg"),
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
            tile = np.full((cell, cell, 3), (34, 40, 54), dtype=np.uint8)
            y0 = 24 + (cell - 24 - nh) // 2
            x0 = (cell - nw) // 2
            al = rs[:, :, 3:4].astype(np.float32) / 255.0
            tile[y0 : y0 + nh, x0 : x0 + nw] = (
                rs[:, :, :3].astype(np.float32) * al + tile[y0 : y0 + nh, x0 : x0 + nw].astype(np.float32) * (1 - al)
            ).astype(np.uint8)
            cv2.putText(tile, f"{cid}: {vk}", (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 244, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        rows.append(np.hstack(imgs[:3]))
    Image.fromarray(np.vstack(rows)).save(out_path)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)

    print("Preparing void_stalker (clean body-only 3-view; pedestal & smoke wings masked)...")
    save_views(
        "void_stalker",
        {
            "front": ((86, 56, 424, 680), []),
            "left": ((476, 56, 682, 684), [(580, 56, 682, 130)]),
            "back": (
                (776, 66, 1106, 678),
                [(776, 66, 886, 200), (996, 66, 1106, 215)],
            ),
        },
    )

    print("Preparing robot_paladin (clean unarmed 3-view; side flipped -> left)...")
    save_views(
        "robot_paladin",
        {
            "front": ((42, 118, 394, 684), []),
            "left": ((398, 118, 608, 684), [], True),
            "back": ((614, 118, 962, 684), []),
        },
    )

    manifest = {
        "batch": "vesselbound_batch4_redo",
        "rembg_model": "isnet-general-use",
        "characters": [
            {
                "id": "void_stalker",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
            },
            {
                "id": "robot_paladin",
                "rig_type": "humanoid",
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

    check_path = os.path.join(OUT_ROOT, "batch4_redo_crops_check.png")
    make_contact_sheet(manifest, check_path)
    print("Contact sheet written:", check_path)

    zip_path = os.path.join(OUT_ROOT, "batch4_redo_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(IN_ROOT, "manifest.json"), "manifest.json")
        for item in manifest["characters"]:
            cid = item["id"]
            cdir = os.path.join(IN_ROOT, cid)
            for fname in set(item["mv_views"].values()):
                zf.write(os.path.join(cdir, fname), f"{cid}/{fname}")

    os.makedirs(TMP_UPLOAD, exist_ok=True)
    shutil.copy2(zip_path, os.path.join(TMP_UPLOAD, "batch4_redo_inputs.zip"))
    print(f"Zip written: {zip_path} ({os.path.getsize(zip_path) / 1e6:.2f} MB) -> also copied to {TMP_UPLOAD}")


if __name__ == "__main__":
    main()
