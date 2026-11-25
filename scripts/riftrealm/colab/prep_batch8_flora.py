"""Prep Batch 8 — 18 Multi-View Cyber Forest Flora, Plants, Glowing Mushrooms, Fungi & Hero Trees for Colab Hunyuan3D-2mv.

Writes:
  - C:/Users/Kenne/plajah/tmp/colab_batch789/batch8_flora_upload.zip
  - scratch/batch8_flora_crops.png (visual QA contact sheet showing every cropped view!)
"""
import glob
import json
import os
import zipfile
import cv2
import numpy as np
from PIL import Image

CF_DIR = r"D:\plajah game assets deign from promtps\Shooter\Cyber Forest Level Assets"
VLA_CF = r"D:\plajah game assets deign from promtps\Shooter\void-sanctum-level-assets\void-sanctum-level-assets\cyber-forest"
BRAIN = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549"
SCRATCH = os.path.join(BRAIN, "scratch")
OUT_DIR = os.path.join(SCRATCH, "colab_batch8_flora")
TMP_ZIP = os.path.join(SCRATCH, "colab_uploads", "batch8_flora_inputs.zip")


def find_file(root: str, pat: str) -> str:
    m = glob.glob(os.path.join(root, pat))
    if not m:
        raise FileNotFoundError(f"Missing pattern {pat} in {root}")
    return m[0]


# (id, root_dir, glob_pattern, views_dict {view: (x0,y0,x1,y1)})
FLORA_SPECS = [
    # 6 Glowing Mushrooms & Fungi
    ("neon_mushroom_cluster",    CF_DIR, "*Neon_forest_mushrooms*3369c035.jpg", {
        "front": (0.01, 0.08, 0.28, 0.89), "left": (0.28, 0.08, 0.50, 0.89), "right": (0.51, 0.08, 0.72, 0.89), "back": (0.72, 0.08, 0.99, 0.89),
    }),
    ("bio_tall_mushroom",        CF_DIR, "*Bioluminescent_mushrooms*efd6139a.jpg", {
        "front": (0.35, 0.04, 0.55, 0.91), "left": (0.56, 0.04, 0.75, 0.91), "back": (0.02, 0.04, 0.34, 0.91),
    }),
    ("cyber_toadstool",          CF_DIR, "*Cybernetic_toadstools*16da139c.jpg", {
        "front": (0.54, 0.12, 0.75, 0.56), "left": (0.76, 0.12, 0.97, 0.56),
    }),
    ("bio_shelf_fungi",          CF_DIR, "*Bioluminescent_fungi*c7ef803d.jpg", {
        "front": (0.03, 0.09, 0.48, 0.92), "left": (0.74, 0.10, 0.94, 0.42),
    }),
    ("spore_bubble_fungi",       CF_DIR, "*Fungi_emitting_spores*e88da0aa.jpg", {
        "front": (0.05, 0.09, 0.33, 0.90), "left": (0.35, 0.09, 0.58, 0.90),
    }),
    ("cf_blue_mushroom_cluster", VLA_CF, "*cf-19-mushroom-cluster*.webp", {
        "front": (0.04, 0.02, 0.31, 0.41), "left": (0.35, 0.02, 0.65, 0.41), "back": (0.68, 0.02, 0.96, 0.41),
    }),
    # 6 Alien Plants, Crystals, Flowers, Ferns & Resin Stump
    ("crystalline_flower_plant", CF_DIR, "*Crystalline_plants*4085b876.jpg", {
        "front": (0.04, 0.04, 0.34, 0.92), "left": (0.36, 0.04, 0.64, 0.92), "back": (0.66, 0.04, 0.96, 0.92),
    }),
    ("glowing_flower_pod",       CF_DIR, "*glowing_flower_pods*a45b24c6.jpg", {
        "front": (0.03, 0.06, 0.43, 0.93), "left": (0.45, 0.06, 0.72, 0.93),
    }),
    ("carnivorous_maw_plant",    CF_DIR, "*carnivorous*bdc735f2.jpg", {
        "front": (0.37, 0.05, 0.64, 0.93), "left": (0.03, 0.05, 0.37, 0.93),
    }),
    ("cyber_glowing_fern",       CF_DIR, "*glowing_ferns*e7daa812.jpg", {
        "front": (0.04, 0.15, 0.36, 0.65), "left": (0.37, 0.13, 0.58, 0.65),
    }),
    ("cyber_resin_stump",        CF_DIR, "*glowing_resin_props*f123e792.jpg", {
        "front": (0.24, 0.06, 0.48, 0.56), "left": (0.48, 0.06, 0.67, 0.56),
    }),
    ("cyber_lotus_aquatic",      CF_DIR, "*aquatic_plants*69e3b7bb.jpg", {
        "front": (0.30, 0.06, 0.55, 0.48),
    }),
    # 6 Hero Cyber Forest Trees & Hollow Log
    ("bioluminescent_tree",      CF_DIR, "*Bioluminescent_tree*7bd4b7fe.jpg", {
        "front": (0.01, 0.12, 0.25, 0.90), "left": (0.26, 0.12, 0.50, 0.90), "back": (0.50, 0.12, 0.75, 0.90), "right": (0.75, 0.12, 0.99, 0.90),
    }),
    ("cyber_willow_tree",        CF_DIR, "*Cyber_forest_tree*68ef49dd.jpg", {
        "front": (0.01, 0.04, 0.34, 0.91), "left": (0.37, 0.04, 0.65, 0.91), "back": (0.66, 0.04, 0.99, 0.91),
    }),
    ("cyber_canopy_tree",        CF_DIR, "*Cyber_forest_trees*2dad727f.jpg", {
        "front": (0.01, 0.04, 0.34, 0.92), "left": (0.34, 0.04, 0.66, 0.92), "back": (0.66, 0.04, 0.99, 0.92),
    }),
    ("cyber_oak_tree",           CF_DIR, "*Cybernetic_tree_orthographic*e6645e9c.jpg", {
        "front": (0.01, 0.04, 0.34, 0.91), "left": (0.34, 0.04, 0.66, 0.91), "back": (0.66, 0.04, 0.99, 0.91),
    }),
    ("cyber_mangrove_tree",      CF_DIR, "*mangrove_trees*baece39d.jpg", {
        "front": (0.02, 0.06, 0.26, 0.90), "left": (0.26, 0.06, 0.50, 0.90), "back": (0.50, 0.06, 0.75, 0.90),
    }),
    ("cyber_hollow_log",         CF_DIR, "*hollow_log*e28ec7da.jpg", {
        "front": (0.02, 0.12, 0.47, 0.54), "left": (0.48, 0.12, 0.73, 0.54),
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
    manifest = {"batch": "batch8_flora", "rembg_model": "isnet-general-use", "characters": []}
    rows = []
    for fid, rdir, pat, vmap in FLORA_SPECS:
        src_path = find_file(rdir, pat)
        src_im = Image.open(src_path).convert("RGB")
        fdir = os.path.join(OUT_DIR, fid)
        os.makedirs(fdir, exist_ok=True)
        mv_views = {}
        row_tiles = []
        front_im = None
        for vn in ("front", "left", "back", "right"):
            if vn in vmap:
                cim = crop_square(src_im, vmap[vn], 1024)
                if vn == "front":
                    front_im = cim
                cim.save(os.path.join(fdir, f"{vn}.png"))
                mv_views[vn] = f"{vn}.png"
                t = cv2.resize(np.asarray(cim), (180, 180), interpolation=cv2.INTER_AREA)
                cv2.putText(t, f"{fid[:18]}:{vn}", (4, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 2, cv2.LINE_AA)
                cv2.putText(t, f"{fid[:18]}:{vn}", (4, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1, cv2.LINE_AA)
                row_tiles.append(t)
            else:
                row_tiles.append(np.full((180, 180, 3), (24, 28, 36), np.uint8))
        # Ensure at least 2 views for Hunyuan3D-2mv (mirror front -> back if single-view like cyber_lotus_aquatic)
        if len(mv_views) == 1 and front_im is not None:
            front_im.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(fdir, "back.png"))
            mv_views["back"] = "back.png"
        manifest["characters"].append({
            "id": fid,
            "rig_type": "flora",
            "octree_resolution": 384,
            "face_limit": 180000,
            "mv_views": mv_views,
        })
        rows.append(np.hstack(row_tiles))

    man_path = os.path.join(OUT_DIR, "manifest.json")
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # 2 side-by-side columns of 9 rows each so contact sheet is compact and crisp
    half = (len(rows) + 1) // 2
    left_col = np.vstack(rows[:half])
    right_rows = rows[half:]
    while len(right_rows) < half:
        right_rows.append(np.full_like(rows[0], (24, 28, 36)))
    right_col = np.vstack(right_rows)
    qa_png = os.path.join(SCRATCH, "batch8_flora_crops.png")
    Image.fromarray(np.hstack([left_col, right_col])).save(qa_png)

    with zipfile.ZipFile(TMP_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(man_path, "manifest.json")
        for it in manifest["characters"]:
            cid = it["id"]
            for fn in it["mv_views"].values():
                zf.write(os.path.join(OUT_DIR, cid, fn), f"{cid}/{fn}")
    print(f"Prepared Batch 8 Flora ({len(FLORA_SPECS)} species) -> {TMP_ZIP} ({os.path.getsize(TMP_ZIP)/1e6:.2f} MB) | QA: {qa_png}")


if __name__ == "__main__":
    main()
