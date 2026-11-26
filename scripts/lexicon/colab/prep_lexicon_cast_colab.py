"""Prepare all 12 Lexicon villagers for Google Colab Pro+ GPU Character Forge batch processing.

Runs 100% locally on CPU in ~15 seconds (ZERO local GPU/AI load!).
Reads Kenne's 3392x5056 turnarounds from D:/Plajah Runtime/forge/lexicon-cast/<name>_turnaround.png,
crops clean high-res RGB panels with TRUE camera orientations (front, back, and unflipped right/left side so
asymmetric props like Mira's tome/pouch, Tolo's runic hammer, Thorne's staff, Oren's cane/scrolls, Lyra's lyre,
and Bram's shield stay 100% consistent across all views!), bundles Plajah's own Python tools right inside the
archive, and writes a Linux-safe ZIP onto D:/plajah-tmp/lexicon-colab/lexicon_cast_inputs.zip.

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/lexicon/colab/prep_lexicon_cast_colab.py [name ...]
"""
from __future__ import annotations

import json
import os
import sys
import zipfile
import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC_DIR = r"D:\Plajah Runtime\forge\lexicon-cast"
OUT_ROOT = os.environ.get("LEXICON_COLAB_TMP", r"D:\plajah-tmp\lexicon-colab")
IN_DIR = os.path.join(OUT_ROOT, "inputs")
ZIP_OUT = os.path.join(OUT_ROOT, "lexicon_cast_inputs.zip")
PREVIEW_OUT = os.path.join(OUT_ROOT, "lexicon_cast_inputs_preview.png")

# Verified per-villager specs from Kenne's sheets & turnarounds (Word gaem/Nov 24 - 22_56):
# - side_view: TRUE camera view of bottom-left quadrant ("right" = character facing screen-right; "left" = facing screen-left)
# - height_m: standing height in metres
# - proportions: adult | elder | youth | child (drives proportion-aware contract skeleton fitting!)
# - pbr_profile: village_cloth | village_leather | village_armor (Lexicon painted-real matte PBR)
# - has_robe: smooth skirt/robe Screened Poisson diffusion
# - has_left_pole: character holds vertical staff/cane in left hand (Thorne, Oren)
# - emissive: optional subtle glow band for magical items present in the art (Tolo runes, Kaelen herbs, Maya ink vials)
VILLAGERS = [
    dict(id="mira",   name="Elder Mira", role="Town matriarch & chronicler",   side_view="right", height_m=1.62, proportions="elder", pbr_profile="village_cloth",   has_robe=True,  has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=None),
    dict(id="pip",    name="Pip",        role="Curious young villager",        side_view="right", height_m=1.18, proportions="child", pbr_profile="village_cloth",   has_robe=False, has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=None),
    dict(id="tolo",   name="Tolo",       role="Blacksmith apprentice",         side_view="right", height_m=1.74, proportions="adult", pbr_profile="village_leather", has_robe=False, has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=dict(hue=[174, 218], smin=0.36, vmin=0.48, gain=1.35)),
    dict(id="oren",   name="Oren",       role="Archivist & historian",         side_view="left",  height_m=1.72, proportions="elder", pbr_profile="village_cloth",   has_robe=True,  has_left_pole=True,  hold="Right:relaxed,Left:katana",  emissive=None),
    dict(id="thorne", name="Thorne",     role="Village elder, council of law", side_view="right", height_m=1.78, proportions="elder", pbr_profile="village_cloth",   has_robe=True,  has_left_pole=True,  hold="Right:relaxed,Left:katana",  emissive=None),
    dict(id="bram",   name="Bram",       role="Veteran village guard",         side_view="right", height_m=1.82, proportions="adult", pbr_profile="village_armor",   has_robe=False, has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=None),
    dict(id="kaelen", name="Kaelen",     role="Herbalist & healer",            side_view="right", height_m=1.74, proportions="adult", pbr_profile="village_cloth",   has_robe=True,  has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=dict(hue=[190, 275], smin=0.38, vmin=0.46, gain=1.25)),
    dict(id="maya",   name="Maya",       role="Village alchemist",             side_view="right", height_m=1.58, proportions="adult", pbr_profile="village_leather", has_robe=False, has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=dict(hue=[172, 290], smin=0.44, vmin=0.52, gain=1.25)),
    dict(id="nico",   name="Nico",       role="Village messenger",             side_view="right", height_m=1.48, proportions="youth", pbr_profile="village_cloth",   has_robe=False, has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=None),
    dict(id="zora",   name="Zora",       role="Cartographer & astronomer",     side_view="right", height_m=1.67, proportions="adult", pbr_profile="village_leather", has_robe=False, has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=None),
    dict(id="selene", name="Selene",     role="Master village weaver",         side_view="right", height_m=1.65, proportions="adult", pbr_profile="village_cloth",   has_robe=True,  has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=None),
    dict(id="lyra",   name="Lyra",       role="Town bard",                     side_view="right", height_m=1.66, proportions="adult", pbr_profile="village_cloth",   has_robe=False, has_left_pole=False, hold="Right:relaxed,Left:relaxed", emissive=None),
]

# Plajah native Python tools bundled into the Colab archive (zero Blender!)
BUNDLED_TOOLS = [
    ("plajah_lexicon_forge.py", os.path.join(HERE, "plajah_lexicon_forge.py")),
    ("paint_from_views.py", os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py")),
    ("uv_raster.py", os.path.join(ROOT, "engines", "tela-3d", "uv_raster.py")),
    ("fit_silhouette.py", os.path.join(ROOT, "scripts", "riftrealm", "fit_silhouette.py")),
    ("glbio.py", os.path.join(ROOT, "scripts", "ravencrest", "glbio.py")),
    ("score_views.py", os.path.join(ROOT, "scripts", "riftrealm", "score_views.py")),
]


def strip_panel_frame(q: np.ndarray) -> np.ndarray:
    """Erase thin rectangular picture-frame border lines inside a turnaround panel (e.g. Pip, Thorne, Selene)."""
    out = q.copy()
    h, w = out.shape[:2]
    # Estimate clean cream/white paper background from top-center/inner-corner margin strips
    corners = np.concatenate([
        out[4:20, 4:20].reshape(-1, 3),
        out[4:20, w - 20 : w - 4].reshape(-1, 3),
        out[h - 20 : h - 4, 4:20].reshape(-1, 3),
        out[h - 20 : h - 4, w - 20 : w - 4].reshape(-1, 3),
    ], axis=0)
    bg = np.median(corners, axis=0).astype(np.uint8)
    dist = np.abs(out.astype(np.int16) - bg.astype(np.int16)).sum(axis=2)
    ink = dist > 28

    # Detect long straight horizontal frame lines in top/bottom 10% margins (>50% of panel width)
    ym = max(12, int(h * 0.10))
    row_frac = ink.mean(axis=1)
    top_lines = np.where(row_frac[:ym] > 0.45)[0]
    bot_lines = np.where(row_frac[h - ym :] > 0.45)[0] + (h - ym)
    if len(top_lines):
        out[: int(top_lines.max()) + 8, :] = bg
    if len(bot_lines):
        out[max(0, int(bot_lines.min()) - 8) :, :] = bg

    # Detect long straight vertical frame lines in left/right 12% margins (>45% of panel height)
    xm = max(12, int(w * 0.12))
    col_frac = ink.mean(axis=0)
    left_lines = np.where(col_frac[:xm] > 0.45)[0]
    right_lines = np.where(col_frac[w - xm :] > 0.45)[0] + (w - xm)
    if len(left_lines):
        out[:, : int(left_lines.max()) + 8] = bg
    if len(right_lines):
        out[:, max(0, int(right_lines.min()) - 8) :] = bg
    return out


def crop_turnaround_quads(src_path: str, side_view: str, target_h: int = 1536) -> dict[str, np.ndarray]:
    """Crop front (top-left), true side (bottom-left), and back (bottom-right), clear of grid dividers & inner frames."""
    rgb = np.asarray(Image.open(src_path).convert("RGB"))
    H, W = rgb.shape[:2]
    m = 48  # safely inside the dark border dividers on 3392x5056 sheets
    raw_quads = {
        "front": rgb[m : H // 2 - m, m : W // 2 - m],
        side_view: rgb[H // 2 + m : H - m, m : W // 2 - m],
        "back": rgb[H // 2 + m : H - m, W // 2 + m : W - m],
    }
    out = {}
    for k, q in raw_quads.items():
        q = strip_panel_frame(q)
        qh, qw = q.shape[:2]
        sc = target_h / float(qh)
        nw = max(1, int(round(qw * sc)))
        out[k] = cv2.resize(q, (nw, target_h), interpolation=cv2.INTER_AREA)
    return out


def make_contact_sheet(manifest: dict, out_path: str):
    rows = []
    cell = 260
    for item in manifest["characters"]:
        cid = item["id"]
        cdir = os.path.join(IN_DIR, cid)
        tiles = []
        for vk, fn in item["mv_views"].items():
            im = np.asarray(Image.open(os.path.join(cdir, fn)).convert("RGB"))
            h, w = im.shape[:2]
            sc = (cell - 26) / float(max(h, w))
            nw, nh = max(1, int(w * sc)), max(1, int(h * sc))
            rs = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
            tile = np.full((cell, cell, 3), (242, 240, 234), dtype=np.uint8)
            y0 = 24 + (cell - 24 - nh) // 2
            x0 = (cell - nw) // 2
            tile[y0 : y0 + nh, x0 : x0 + nw] = rs
            cv2.rectangle(tile, (0, 0), (cell, 22), (32, 36, 48), -1)
            cv2.putText(tile, f"{cid}: {vk} ({item['proportions']})", (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (240, 244, 255), 1, cv2.LINE_AA)
            tiles.append(tile)
        rows.append(np.hstack(tiles))
    # 2-column layout (6 rows x 2 characters) for crisp visual inspection
    half = (len(rows) + 1) // 2
    left_col = np.vstack(rows[:half])
    right_rows = rows[half:]
    while len(right_rows) < half:
        right_rows.append(np.full_like(rows[0], (24, 26, 34)))
    right_col = np.vstack(right_rows)
    sep = np.full((left_col.shape[0], 12, 3), (24, 26, 34), dtype=np.uint8)
    Image.fromarray(np.hstack([left_col, sep, right_col])).save(out_path)


def main():
    wanted = set(sys.argv[1:])
    items = [v for v in VILLAGERS if not wanted or v["id"] in wanted]
    if not items:
        raise SystemExit(f"No matching villagers for {sys.argv[1:]}")

    os.makedirs(IN_DIR, exist_ok=True)
    manifest_chars = []
    for spec in items:
        cid = spec["id"]
        src_path = os.path.join(SRC_DIR, f"{cid}_turnaround.png")
        if not os.path.isfile(src_path):
            raise FileNotFoundError(f"Missing turnaround: {src_path}")
        quads = crop_turnaround_quads(src_path, spec["side_view"], target_h=1536)
        cdir = os.path.join(IN_DIR, cid)
        os.makedirs(cdir, exist_ok=True)
        mv_views = {}
        for vk, arr in quads.items():
            fn = f"{vk}.jpg"
            Image.fromarray(arr).save(os.path.join(cdir, fn), quality=95, optimize=True)
            mv_views[vk] = fn
        entry = {
            **spec,
            "mv_views": mv_views,
            "octree_resolution": 384,
            "steps": 30,
            "face_limit": 200000,
            "game_faces": 56000,
            "tex_res": 2048,
            "seed": 42,
        }
        manifest_chars.append(entry)
        print(f"  [prep] {cid:8s} | side={spec['side_view']:5s} | h={spec['height_m']:.2f}m | {spec['proportions']:5s} | {spec['pbr_profile']}")

    manifest = {
        "batch": "lexicon_cast_v1",
        "game": "Lexicon: The Unwriting",
        "pipeline": "Plajah Character Forge + Colab GPU (Zero Blender)",
        "rembg_model": "isnet-general-use",
        "characters": manifest_chars,
    }
    manifest_path = os.path.join(IN_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    make_contact_sheet(manifest, PREVIEW_OUT)
    print(f"Preview contact sheet: {PREVIEW_OUT}")

    # Pack Linux-safe forward-slash ZIP (crops + manifest + Plajah native Python tools)
    os.makedirs(os.path.dirname(ZIP_OUT), exist_ok=True)
    with zipfile.ZipFile(ZIP_OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.write(manifest_path, "manifest.json")
        for arcname, disk_path in BUNDLED_TOOLS:
            if not os.path.isfile(disk_path):
                raise FileNotFoundError(f"Missing Plajah tool: {disk_path}")
            zf.write(disk_path, arcname)
        for item in manifest_chars:
            cid = item["id"]
            for fn in item["mv_views"].values():
                full = os.path.join(IN_DIR, cid, fn)
                zf.write(full, f"{cid}/{fn}")

    mb = os.path.getsize(ZIP_OUT) / 1e6
    print(f"\nPACKED: {ZIP_OUT} ({mb:.2f} MB) -> {len(manifest_chars)} villagers + {len(BUNDLED_TOOLS)} Plajah tools")


if __name__ == "__main__":
    main()
