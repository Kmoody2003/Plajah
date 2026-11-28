"""Prepare the 3 Lexicon creatures (Great Forest Elk, Quarry Rune-Golem, Pale Cipher-Lurker) for Colab Pro+ GPU Forge.

Reads Kenne's concept turnarounds directly from:
  D:/plajah game assets deign from promtps/Word gaem/Fable Village Concept Shots/
Crops clean Front / True Side / Back panels, bundles Plajah's updated Forge toolkit (fixed fillConvexPoly
fit_silhouette.py, crisp paint_from_views.py, plajah_lexicon_forge.py), renders a preview contact sheet,
and writes D:/plajah-tmp/lexicon-colab/lexicon_creatures_inputs.zip ready for lexicon_cast_forge_colab.ipynb!

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/lexicon/colab/prep_creatures_colab.py
"""
from __future__ import annotations

import glob
import json
import os
import shutil
import zipfile
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC_DIR = r"D:\plajah game assets deign from promtps\Word gaem\Fable Village Concept Shots"
TMP_DIR = r"D:\plajah-tmp\lexicon-colab"
WORK_IN = os.path.join(TMP_DIR, "creatures_in")
OUT_ZIP = os.path.join(TMP_DIR, "lexicon_creatures_inputs.zip")
OUT_PREVIEW = os.path.join(TMP_DIR, "lexicon_creatures_preview.png")

TOOLS = [
    (os.path.join(HERE, "plajah_lexicon_forge.py"), "plajah_lexicon_forge.py"),
    (os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"), "paint_from_views.py"),
    (os.path.join(ROOT, "engines", "tela-3d", "uv_raster.py"), "uv_raster.py"),
    (os.path.join(ROOT, "scripts", "riftrealm", "fit_silhouette.py"), "fit_silhouette.py"),
    (os.path.join(ROOT, "scripts", "ravencrest", "glbio.py"), "glbio.py"),
    (os.path.join(ROOT, "scripts", "riftrealm", "score_views.py"), "score_views.py"),
]

# Fractional crop boxes (x0, y0, x1, y1) carefully verified against each turnaround sheet
CREATURES = [
    {
        "id": "elk",
        "name": "Great Forest Elk",
        "role": "Antlered Word-Keeper (Companion Mount)",
        "pattern": "Elk_character_design_sheet_*.jpg",
        "height_m": 4.60,          # heroically scaled for 3rd-person riding (matches wilds.ts!)
        "proportions": "adult",
        "rig_mode": "quadruped",   # preserves clean PBR GLB without forcing bipedal humanoid bones
        "pbr_profile": "village_cloth",
        "side_view": "left",       # Side profile faces screen-left (camera at +X = left)
        "crops": {
            "front": (0.020, 0.12, 0.282, 0.92),
            "left": (0.315, 0.12, 0.690, 0.92),
            "back": (0.680, 0.12, 0.970, 0.92),
        },
        "masks": {
            "front": [(0.87, 0.76, 1.0, 1.0)],  # erase tiny human scale silhouette at bottom-right
            "left": [(0.0, 0.85, 0.08, 0.97)],  # erase tiny "5 m" scale note in corner
        },
        "emissive": {"hue": [145, 200], "smin": 0.34, "vmin": 0.50, "gain": 1.35},
    },
    {
        "id": "golem",
        "name": "Quarry Rune-Golem",
        "role": "Subterranean Masonry Guardian",
        "pattern": "Rock_elemental_character_design_*.jpg",
        "height_m": 2.65,
        "proportions": "adult",
        "rig_mode": "humanoid",
        "pbr_profile": "village_armor",
        "side_view": "right",      # Profile faces screen-right (camera at -X = right)
        "crops": {
            "right": (0.02, 0.175, 0.222, 0.92),
            "front": (0.222, 0.175, 0.515, 0.92),
            "back": (0.515, 0.175, 0.790, 0.92),
        },
        "emissive": {"hue": [14, 48], "smin": 0.55, "vmin": 0.58, "gain": 1.45},
    },
    {
        "id": "lurker",
        "name": "Pale Cipher-Lurker",
        "role": "Bioluminescent Crystal Cave Stalker",
        "pattern": "Bioluminescent_cave_creature_cha*.jpg",
        "height_m": 1.95,
        "proportions": "adult",
        "rig_mode": "humanoid",
        "pbr_profile": "village_cloth",
        "side_view": "left",
        "crops": {
            "front": (0.05, 0.02, 0.375, 0.97),
            "back": (0.375, 0.02, 0.705, 0.97),
        },
        "masks": {
            "back": [(0.76, 0.02, 1.0, 0.54)],  # remove stray headshot inset while keeping curling tail intact
        },
        "emissive": {"hue": [165, 210], "smin": 0.38, "vmin": 0.52, "gain": 1.40},
    },
]


def crop_panel(
    im: Image.Image,
    box: tuple[float, float, float, float],
    masks: list[tuple[float, float, float, float]] | None = None,
    target_h: int = 1400,
) -> Image.Image:
    w, h = im.size
    c = im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    if masks:
        arr = np.array(c, dtype=np.uint8)
        ch, cw = arr.shape[:2]
        for mx0, my0, mx1, my1 in masks:
            y0i, y1i = int(my0 * ch), int(my1 * ch)
            x0i, x1i = int(mx0 * cw), int(mx1 * cw)
            # Sample local background just above or beside the masked corner for seamless fill
            sy0 = max(0, y0i - 20)
            sy1 = max(sy0 + 4, y0i)
            bg = np.median(arr[sy0:sy1, x0i:x1i].reshape(-1, 3), axis=0).astype(np.uint8)
            arr[y0i:y1i, x0i:x1i] = bg
        c = Image.fromarray(arr)
    sc = target_h / max(c.height, 1)
    return c.resize((max(1, int(round(c.width * sc))), target_h), Image.Resampling.LANCZOS)


def main():
    os.makedirs(TMP_DIR, exist_ok=True)
    if os.path.isdir(WORK_IN):
        shutil.rmtree(WORK_IN)
    os.makedirs(WORK_IN, exist_ok=True)

    manifest = {
        "batch": "lexicon_creatures_v1",
        "rembg_model": "isnet-general-use",
        "characters": [],
    }
    preview_rows = []

    for spec in CREATURES:
        matches = glob.glob(os.path.join(SRC_DIR, spec["pattern"]))
        if not matches:
            raise FileNotFoundError(f"Missing creature sheet for {spec['id']}: {spec['pattern']}")
        src_img = Image.open(matches[0]).convert("RGB")
        cdir = os.path.join(WORK_IN, spec["id"])
        os.makedirs(cdir, exist_ok=True)

        mv_views = {}
        row_imgs = []
        for vk, box in spec["crops"].items():
            panel = crop_panel(src_img, box, spec.get("masks", {}).get(vk))
            fn = f"{vk}.jpg"
            panel.save(os.path.join(cdir, fn), quality=95, optimize=True)
            mv_views[vk] = fn
            row_imgs.append((vk, panel))

        preview_rows.append((spec["id"], row_imgs))
        manifest["characters"].append({
            "id": spec["id"],
            "name": spec["name"],
            "role": spec["role"],
            "height_m": spec["height_m"],
            "proportions": spec["proportions"],
            "rig_mode": spec["rig_mode"],
            "pbr_profile": spec["pbr_profile"],
            "side_view": spec["side_view"],
            "has_robe": False,
            "has_left_pole": False,
            "steps": 30,
            "octree_resolution": 384,
            "face_limit": 200000,
            "game_faces": 48000,
            "tex_res": 2048,
            "seed": 42,
            "emissive": spec["emissive"],
            "mv_views": mv_views,
        })
        print(f"  [prep] {spec['id']:8s} | rig={spec['rig_mode']:9s} | h={spec['height_m']:.2f}m | views={list(mv_views.keys())}")

    with open(os.path.join(WORK_IN, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # Preview contact sheet
    tw, th = 420, 440
    canvas = Image.new("RGB", (tw * 3, th * len(preview_rows)), (24, 26, 34))
    draw = ImageDraw.Draw(canvas)
    for r, (cid, rimgs) in enumerate(preview_rows):
        for c, (vk, pim) in enumerate(rimgs):
            cp = pim.copy()
            cp.thumbnail((tw - 16, th - 40))
            canvas.paste(cp, (c * tw + (tw - cp.width) // 2, r * th + 30 + (th - 40 - cp.height) // 2))
            draw.text((c * tw + 10, r * th + 8), f"{cid}: {vk}", fill=(240, 232, 200))
    canvas.save(OUT_PREVIEW, quality=90)
    print(f"Preview contact sheet: {OUT_PREVIEW}")

    # Pack zip with forward slashes
    with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.write(os.path.join(WORK_IN, "manifest.json"), "manifest.json")
        for src_p, arc_p in TOOLS:
            zf.write(src_p, arc_p)
        for item in manifest["characters"]:
            cid = item["id"]
            for fn in item["mv_views"].values():
                zf.write(os.path.join(WORK_IN, cid, fn), f"{cid}/{fn}")

    print(f"\nPACKED: {OUT_ZIP} ({os.path.getsize(OUT_ZIP) / 1e6:.2f} MB) -> {len(CREATURES)} Lexicon creatures + 6 Plajah tools")


if __name__ == "__main__":
    main()
