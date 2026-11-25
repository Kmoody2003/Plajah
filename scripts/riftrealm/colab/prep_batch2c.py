"""Prepare Batch 2C Vesselbound Androids, Golem, Mounts & Colossal Bosses for Colab GPU (rembg + Hunyuan3D-2mv).

Completes 100% of remaining character/mount/boss sheets in Shooter/Nov 15 - 14_43/ (11 assets):
  Humanoids (3):
    - android_a          (front, left, back)
    - android_b          (front, left, back)
    - moss_golem         (front, left, back)
  Quadrupeds & Mounts (5):
    - panther_demon      (front, left, back)
    - light_panther_mount(front, left, back — light-trail ribbon masked cleanly)
    - cyber_dragon_mount (front, left, back — jet ribbons masked cleanly)
    - crystal_stag       (front, left)
    - obsidian_rhino     (front 3/4 — single view)
  Colossal World Bosses (3):
    - rune_dragon        (front — Glacial Rune-Dragon Archon)
    - void_leviathan     (front — Colossal Obsidian Void Leviathan)
    - marsh_kraken       (front — Bio-Cybernetic Marshland Kraken / Hydra)
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
    "BATCH2C_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2c",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch2c"

SHEETS = {
    "android_a": os.path.join(SHOOTER, "Cybernetic_android_character_tur\u2026_c1040700.jpg"),
    "android_b": os.path.join(SHOOTER, "Cybernetic_android_character_tur\u2026_c4eac077.jpg"),
    "moss_golem": os.path.join(SHOOTER, "Moss-covered_golem_turnaround_view_511afd36.jpg"),
    "panther_demon": os.path.join(SHOOTER, "Cybernetic_panther_demon_turnaro\u2026_8b7b8af1.jpg"),
    "light_panther_mount": os.path.join(SHOOTER, "Cybernetic_panther_mount_concept\u2026_e27769ab.jpg"),
    "cyber_dragon_mount": os.path.join(SHOOTER, "Mechanical_cyber_dragon_concept_\u2026_ee95bffc.jpg"),
    "crystal_stag": os.path.join(SHOOTER, "Crystal_antlered_light_stag_turn\u2026_45867abd.jpg"),
    "obsidian_rhino": os.path.join(SHOOTER, "Volcanic_obsidian_light_rhino_de\u2026_0f5dafb3.jpg"),
    "rune_dragon": os.path.join(SHOOTER, "Glacial_Rune-Dragon_Archon_boss_\u2026_003092b4.jpg"),
    "void_leviathan": os.path.join(SHOOTER, "Obsidian_void_leviathan_boss_con\u2026_821c3aa9.jpg"),
    "marsh_kraken": os.path.join(SHOOTER, "Bio-Cybernetic_Marshland_Kraken_\u2026_21cf9ac9.jpg"),
}


def estimate_backdrop_color(crop: np.ndarray) -> np.ndarray:
    border = np.concatenate(
        [crop[:10, :].reshape(-1, 3), crop[-10:, :].reshape(-1, 3), crop[:, :10].reshape(-1, 3), crop[:, -10:].reshape(-1, 3)],
        axis=0,
    )
    lum = border.mean(axis=1)
    dark = border[lum <= np.percentile(lum, 25)]
    return np.median(dark, axis=0).astype(np.uint8)


def clean_rgb_crop(sheet: np.ndarray, box, mask_rects=None, mask_polys=None, flip_x: bool = False, up: int = 2) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = sheet[y0:y1, x0:x1].copy()
    bg_col = estimate_backdrop_color(crop)
    if mask_rects:
        for (mx0, my0, mx1, my1) in mask_rects:
            lx0, ly0 = max(0, mx0 - x0), max(0, my0 - y0)
            lx1, ly1 = min(crop.shape[1], mx1 - x0), min(crop.shape[0], my1 - y0)
            if lx1 > lx0 and ly1 > ly0:
                crop[ly0:ly1, lx0:lx1] = bg_col
    if mask_polys:
        for poly in mask_polys:
            pts = np.array([[px - x0, py - y0] for (px, py) in poly], dtype=np.int32)
            cv2.fillPoly(crop, [pts], [int(c) for c in bg_col])
    if flip_x:
        crop = cv2.flip(crop, 1)
    if up > 1:
        crop = cv2.resize(crop, (crop.shape[1] * up, crop.shape[0] * up), interpolation=cv2.INTER_LANCZOS4)
    return crop


def save_views(cid: str, views: dict, up: int = 2):
    out_dir = os.path.join(IN_ROOT, cid)
    os.makedirs(out_dir, exist_ok=True)
    sheet = np.array(Image.open(SHEETS[cid]).convert("RGB"))
    for vname, spec in views.items():
        box, rects = spec[0], spec[1]
        polys = spec[2] if len(spec) > 2 else None
        flip_x = spec[3] if len(spec) > 3 else False
        crop = clean_rgb_crop(sheet, box, rects, mask_polys=polys, flip_x=flip_x, up=up)
        Image.fromarray(crop).save(os.path.join(out_dir, f"{vname}.png"))


def make_contact_sheet(manifest: dict, out_path: str):
    rows = []
    cell = 230
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
            tile = np.full((cell, cell, 3), (34, 40, 54), dtype=np.uint8)
            y0 = 22 + (cell - 22 - nh) // 2
            x0 = (cell - nw) // 2
            al = rs[:, :, 3:4].astype(np.float32) / 255.0
            tile[y0 : y0 + nh, x0 : x0 + nw] = (
                rs[:, :, :3].astype(np.float32) * al + tile[y0 : y0 + nh, x0 : x0 + nw].astype(np.float32) * (1 - al)
            ).astype(np.uint8)
            cv2.putText(tile, f"{cid}: {vk}", (5, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.43, (240, 244, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        while len(imgs) < 3:
            imgs.append(np.full((cell, cell, 3), (18, 20, 26), dtype=np.uint8))
        rows.append(np.hstack(imgs[:3]))
    Image.fromarray(np.vstack(rows)).save(out_path)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)

    print("Preparing android_a...")
    save_views(
        "android_a",
        {
            "front": ((62, 46, 422, 722), [(62, 46, 130, 86)]),
            "left": ((496, 46, 706, 722), [(496, 46, 520, 86)]),
            "back": ((722, 46, 1052, 722), [(722, 46, 795, 86)]),
        },
    )

    print("Preparing android_b...")
    save_views(
        "android_b",
        {
            "front": ((72, 48, 424, 722), [(72, 48, 165, 220), (330, 48, 424, 215), (345, 440, 424, 520)]),
            "left": ((466, 48, 636, 722), []),
            "back": ((660, 48, 992, 722), [(910, 48, 992, 175)]),
        },
    )

    print("Preparing moss_golem...")
    save_views(
        "moss_golem",
        {
            "front": (
                (52, 146, 574, 700),
                [(52, 146, 118, 320), (52, 540, 108, 700), (470, 146, 574, 245), (510, 575, 574, 700)],
            ),
            "left": (
                (576, 146, 845, 700),
                [(576, 575, 635, 700), (825, 146, 845, 245)],
            ),
            "back": (
                (872, 146, 1356, 700),
                [(872, 146, 960, 240), (872, 575, 955, 700)],
            ),
        },
    )

    print("Preparing panther_demon...")
    save_views(
        "panther_demon",
        {
            "front": ((68, 108, 355, 420), []),
            "left": ((362, 108, 1048, 420), []),
            "back": ((112, 476, 360, 706), []),
        },
    )

    print("Preparing light_panther_mount...")
    # Mask out cyan light-wall ribbons so the quadruped body + tail stay clean
    save_views(
        "light_panther_mount",
        {
            "front": ((778, 412, 995, 722), [(932, 505, 995, 622)]),
            "left": ((672, 110, 1285, 372), [(1112, 180, 1285, 285), (1142, 280, 1285, 318)]),
            "back": ((1072, 412, 1272, 722), [(1225, 530, 1272, 722)]),
        },
    )

    print("Preparing cyber_dragon_mount...")
    # Top-right side view (mask text labels & trailing jet ribbons past tail thrusters), bottom front & back
    save_views(
        "cyber_dragon_mount",
        {
            "front": ((746, 434, 1005, 730), []),
            "left": (
                (696, 18, 1246, 404),
                [(696, 18, 975, 175), (696, 280, 810, 350), (1120, 190, 1246, 260), (1165, 260, 1246, 360)],
            ),
            "back": ((1070, 444, 1326, 730), []),
        },
    )

    print("Preparing crystal_stag...")
    save_views(
        "crystal_stag",
        {
            "front": ((32, 106, 386, 712), []),
            "left": ((364, 112, 756, 712), [(364, 112, 396, 255), (718, 125, 756, 295), (625, 330, 756, 420)]),
        },
    )

    print("Preparing obsidian_rhino (single clean front 3/4 view)...")
    save_views(
        "obsidian_rhino",
        {
            "front": ((544, 110, 956, 488), [(544, 110, 675, 136), (544, 395, 625, 488)]),
        },
    )

    print("Preparing rune_dragon (single boss view, labels/inset masked)...")
    save_views(
        "rune_dragon",
        {
            "front": (
                (0, 62, 1365, 732),
                [
                    (375, 102, 575, 210),
                    (65, 405, 365, 455),
                    (195, 640, 378, 732),
                    (1065, 275, 1295, 360),
                    (935, 392, 1365, 732),
                    (788, 498, 935, 550),
                ],
            ),
        },
        up=1,
    )

    print("Preparing void_leviathan (single boss view, labels/scale masked)...")
    save_views(
        "void_leviathan",
        {
            "front": (
                (382, 10, 1348, 742),
                [
                    (382, 10, 560, 78),
                    (785, 50, 995, 112),
                    (1045, 415, 1255, 465),
                    (1285, 495, 1348, 742),
                    (895, 665, 965, 742),
                    (382, 540, 565, 742),
                    (382, 345, 500, 425),
                ],
            ),
        },
        up=1,
    )

    print("Preparing marsh_kraken (single boss view, human scale masked)...")
    save_views(
        "marsh_kraken",
        {
            "front": (
                (26, 56, 1002, 742),
                [(775, 608, 965, 742), (760, 140, 1002, 230), (770, 390, 1002, 430)],
            ),
        },
        up=1,
    )

    manifest = {
        "batch": "vesselbound_batch2c",
        "rembg_model": "isnet-general-use",
        "characters": [
            {"id": "android_a", "rig_type": "humanoid", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "android_b", "rig_type": "humanoid", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "moss_golem", "rig_type": "humanoid", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "panther_demon", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "light_panther_mount", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "cyber_dragon_mount", "rig_type": "dragon", "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "crystal_stag", "rig_type": "quadruped", "mv_views": {"front": "front.png", "left": "left.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "obsidian_rhino", "rig_type": "quadruped", "mv_views": {"front": "front.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "rune_dragon", "rig_type": "boss_dragon", "mv_views": {"front": "front.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "void_leviathan", "rig_type": "boss_serpent", "mv_views": {"front": "front.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
            {"id": "marsh_kraken", "rig_type": "boss_kraken", "mv_views": {"front": "front.png"}, "octree_resolution": 384, "steps": 30, "face_limit": 200000, "seed": 42},
        ],
    }

    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    check_path = os.path.join(OUT_ROOT, "batch2c_crops_check.png")
    make_contact_sheet(manifest, check_path)
    print("Contact sheet written:", check_path)

    zip_path = os.path.join(OUT_ROOT, "batch2c_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(IN_ROOT, "manifest.json"), "manifest.json")
        for item in manifest["characters"]:
            cid = item["id"]
            cdir = os.path.join(IN_ROOT, cid)
            for fname in set(item["mv_views"].values()):
                zf.write(os.path.join(cdir, fname), f"{cid}/{fname}")

    os.makedirs(TMP_UPLOAD, exist_ok=True)
    shutil.copy2(zip_path, os.path.join(TMP_UPLOAD, "batch2c_inputs.zip"))
    print(f"Zip written: {zip_path} ({os.path.getsize(zip_path) / 1e6:.2f} MB) -> also copied to {TMP_UPLOAD}")


if __name__ == "__main__":
    main()
