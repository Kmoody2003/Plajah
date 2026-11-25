"""Prep Batch 9 — 18 Multi-View Game Structures & Biome Landmarks (Cyber Forest, Emberfall Caldera, Sunken Cathedral)
for Colab Hunyuan3D-2mv.

Writes:
  - C:/Users/Kenne/plajah/tmp/colab_batch789/batch9_structures_upload.zip
  - scratch/batch9_structures_crops.png (visual QA contact sheet!)
"""
import glob
import json
import os
import zipfile
import cv2
import numpy as np
from PIL import Image

VLA = r"D:\plajah game assets deign from promtps\Shooter\void-sanctum-level-assets\void-sanctum-level-assets"
BRAIN = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549"
SCRATCH = os.path.join(BRAIN, "scratch")
OUT_DIR = os.path.join(SCRATCH, "colab_batch9_structures")
TMP_ZIP = os.path.join(SCRATCH, "colab_uploads", "batch9_structures_inputs.zip")


def find_file(sub: str, pat: str) -> str:
    m = glob.glob(os.path.join(VLA, sub, pat))
    if not m:
        raise FileNotFoundError(f"Missing {pat} in {sub}")
    return m[0]


# (id, biome_subdir, glob_pat, views_dict {view: (x0, y0, x1, y1)})
STRUCT_SPECS = [
    # 7 Cyber Forest / Elderwood Structures
    ("struct_great_oak",         "cyber-forest", "*cf-01-great-oak*.webp", {
        "front": (0.01, 0.01, 0.33, 0.34), "left": (0.34, 0.01, 0.66, 0.34), "back": (0.67, 0.01, 0.99, 0.34),
    }),
    ("struct_central_platform",  "cyber-forest", "*cf-02-central-platform*.webp", {
        "front": (0.01, 0.01, 0.34, 0.36), "left": (0.34, 0.01, 0.67, 0.36), "back": (0.67, 0.01, 0.99, 0.36),
    }),
    ("struct_outpost_cabin",     "cyber-forest", "*cf-03-outpost-cabin*.webp", {
        "front": (0.02, 0.02, 0.33, 0.35), "left": (0.34, 0.02, 0.66, 0.35), "back": (0.67, 0.02, 0.98, 0.35),
    }),
    ("struct_ruined_chapel",     "cyber-forest", "*cf-04-ruined-chapel*.webp", {
        "front": (0.02, 0.01, 0.34, 0.35), "left": (0.34, 0.01, 0.65, 0.35), "back": (0.02, 0.36, 0.34, 0.67), "right": (0.65, 0.01, 0.98, 0.35),
    }),
    ("struct_watchtower",        "cyber-forest", "*cf-09-watchtower*.webp", {
        "front": (0.05, 0.02, 0.28, 0.40), "left": (0.30, 0.02, 0.54, 0.40), "back": (0.57, 0.02, 0.77, 0.40), "right": (0.77, 0.02, 0.98, 0.40),
    }),
    ("struct_rune_monolith",     "cyber-forest", "*cf-18-rune-monolith*.webp", {
        "front": (0.06, 0.01, 0.33, 0.37), "left": (0.34, 0.01, 0.66, 0.37), "back": (0.67, 0.01, 0.95, 0.37),
    }),
    ("struct_ruin_arch",         "cyber-forest", "*cf-23-ruin-walls*.webp", {
        "front": (0.02, 0.03, 0.33, 0.36), "left": (0.34, 0.03, 0.66, 0.36), "back": (0.02, 0.37, 0.33, 0.69),
    }),
    # 5 Emberfall Caldera Structures
    ("struct_forge_platform",    "emberfall-caldera", "*ec-02-central-forge-platform*.webp", {
        "front": (0.01, 0.04, 0.34, 0.36), "left": (0.34, 0.04, 0.66, 0.36), "back": (0.66, 0.04, 0.99, 0.36),
    }),
    ("struct_ruined_forge_hall", "emberfall-caldera", "*ec-03-ruined-forge-hall*.webp", {
        "front": (0.02, 0.03, 0.34, 0.32), "left": (0.34, 0.03, 0.66, 0.32), "back": (0.66, 0.03, 0.98, 0.32),
    }),
    ("struct_magma_vent",        "emberfall-caldera", "*ec-07-magma-vent*.webp", {
        "front": (0.01, 0.04, 0.34, 0.36), "left": (0.34, 0.04, 0.66, 0.36), "back": (0.66, 0.04, 0.99, 0.36),
    }),
    ("struct_collapsed_furnace", "emberfall-caldera", "*ec-14-collapsed-furnace*.webp", {
        "front": (0.02, 0.03, 0.34, 0.35), "left": (0.34, 0.03, 0.66, 0.35), "back": (0.66, 0.03, 0.98, 0.35),
    }),
    ("struct_obsidian_monolith", "emberfall-caldera", "*ec-18-obsidian-monolith*.webp", {
        "front": (0.02, 0.03, 0.34, 0.37), "left": (0.34, 0.03, 0.66, 0.37), "back": (0.66, 0.03, 0.98, 0.37),
    }),
    # 6 Sunken Cathedral Structures
    ("struct_sunken_nave",       "sunken-cathedral", "*sc-01-sunken-nave*.webp", {
        "front": (0.01, 0.03, 0.34, 0.31), "left": (0.34, 0.03, 0.66, 0.31), "back": (0.66, 0.03, 0.99, 0.31),
    }),
    ("struct_bell_tower",        "sunken-cathedral", "*sc-05-bell-tower*.webp", {
        "front": (0.04, 0.01, 0.22, 0.40), "left": (0.22, 0.01, 0.41, 0.40), "back": (0.57, 0.01, 0.77, 0.40),
    }),
    ("struct_collapsed_arch",    "sunken-cathedral", "*sc-15-collapsed-arch*.webp", {
        "front": (0.02, 0.02, 0.25, 0.34), "left": (0.25, 0.02, 0.50, 0.34), "back": (0.75, 0.02, 0.98, 0.34),
    }),
    ("struct_altar_relic",       "sunken-cathedral", "*sc-17-altar-relics*.webp", {
        "front": (0.02, 0.03, 0.34, 0.36), "left": (0.34, 0.03, 0.66, 0.36), "back": (0.66, 0.03, 0.98, 0.36),
    }),
    ("struct_rose_window",       "sunken-cathedral", "*sc-18-rose-window*.webp", {
        "front": (0.04, 0.01, 0.32, 0.38), "left": (0.70, 0.38, 0.96, 0.76), "back": (0.04, 0.39, 0.32, 0.76),
    }),
    ("struct_gargoyle_column",   "sunken-cathedral", "*sc-23-columns-gargoyles*.webp", {
        "front": (0.04, 0.01, 0.28, 0.42), "left": (0.28, 0.01, 0.52, 0.42), "back": (0.52, 0.01, 0.75, 0.42), "right": (0.75, 0.01, 0.98, 0.42),
    }),
]


def crop_square(im: Image.Image, box, size: int = 1024) -> Image.Image:
    w, h = im.size
    cr = im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))).convert("RGB")
    arr = np.asarray(cr)
    bg = np.median(np.vstack([arr[:8, :8].reshape(-1, 3), arr[:8, -8:].reshape(-1, 3)]), axis=0)
    side = max(cr.width, cr.height)
    sq = Image.new("RGB", (side, side), tuple(int(round(c)) for c in bg))
    sq.paste(cr, ((side - cr.width) // 2, (side - cr.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(TMP_ZIP), exist_ok=True)
    manifest = {"batch": "batch9_structures", "rembg_model": "isnet-general-use", "characters": []}
    rows = []
    for sid, sub, pat, vmap in STRUCT_SPECS:
        src_path = find_file(sub, pat)
        src_im = Image.open(src_path).convert("RGB")
        sdir = os.path.join(OUT_DIR, sid)
        os.makedirs(sdir, exist_ok=True)
        mv_views = {}
        row_tiles = []
        for vn in ("front", "left", "back", "right"):
            if vn in vmap:
                cim = crop_square(src_im, vmap[vn], 1024)
                cim.save(os.path.join(sdir, f"{vn}.png"))
                mv_views[vn] = f"{vn}.png"
                t = cv2.resize(np.asarray(cim), (180, 180), interpolation=cv2.INTER_AREA)
                cv2.putText(t, f"{sid[7:21]}:{vn}", (4, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0, 0, 0), 2, cv2.LINE_AA)
                cv2.putText(t, f"{sid[7:21]}:{vn}", (4, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (255, 255, 255), 1, cv2.LINE_AA)
                row_tiles.append(t)
            else:
                row_tiles.append(np.full((180, 180, 3), (24, 28, 36), np.uint8))
        manifest["characters"].append({
            "id": sid,
            "rig_type": "structure",
            "biome": sub,
            "octree_resolution": 384,
            "face_limit": 200000,
            "mv_views": mv_views,
        })
        rows.append(np.hstack(row_tiles))

    man_path = os.path.join(OUT_DIR, "manifest.json")
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    half = (len(rows) + 1) // 2
    left_col = np.vstack(rows[:half])
    right_rows = rows[half:]
    while len(right_rows) < half:
        right_rows.append(np.full_like(rows[0], (24, 28, 36)))
    right_col = np.vstack(right_rows)
    qa_png = os.path.join(SCRATCH, "batch9_structures_crops.png")
    Image.fromarray(np.hstack([left_col, right_col])).save(qa_png)

    with zipfile.ZipFile(TMP_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(man_path, "manifest.json")
        for it in manifest["characters"]:
            cid = it["id"]
            for fn in it["mv_views"].values():
                zf.write(os.path.join(OUT_DIR, cid, fn), f"{cid}/{fn}")
    print(f"Prepared Batch 9 Structures ({len(STRUCT_SPECS)} structures) -> {TMP_ZIP} ({os.path.getsize(TMP_ZIP)/1e6:.2f} MB) | QA: {qa_png}")


if __name__ == "__main__":
    main()
