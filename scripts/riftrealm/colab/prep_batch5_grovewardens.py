"""Prepare Batch 5 (All 12 Grovewardens / Tree Ents) multi-view inputs for Colab Hunyuan3D-2mv.

Matches the exact 12 Grovewarden species defined in games/rift-realm/src/ents/wardens.ts:
  1. ent_ancient_oak      (Oak_tree_guardian_character_turn…_dee6184e.jpg)
  2. ent_banyan           (Banyan_tree_guardian_turnaround_…_077270c7.jpg)
  3. ent_baobab           (Baobab_tree_guardian_character_s…_c1d2dcd4.jpg)
  4. ent_bioluminescent   (Character_turnaround_of_tree_gua…_23e2658a.jpg)
  5. ent_cherry_blossom   (Cherry_blossom_tree_guardian_tur…_1702804e.jpg)
  6. ent_fungal_spore     (Fungal_tree_guardian_turnaround_…_a67c309d.jpg)
  7. ent_ironwood_thorn   (Ironwood_thorn_guardian_characte…_2c54e818.jpg)
  8. ent_pine_sentinel    (Pine_tree_guardian_character_tur…_c2d27e6e.jpg)
  9. ent_sequoia          (Giant_sequoia_character_turnarou…_444a2e1d.jpg)
 10. ent_swamp_mangrove   (Tree_guardian_character_turnarou…_75fcbe49.jpg)
 11. ent_weeping_willow   (Willow_tree_guardian_character_s…_ff030eb9.jpg)
 12. ent_white_birch      (Tree_guardian_character_turnarou…_a8d1fb3b.jpg)

Outputs:
  - scratch/colab_batch5_grovewardens/inputs/<id>/{front,left,back}.png
  - scratch/colab_batch5_grovewardens/batch5_inputs_preview.png
  - tmp/colab_batch56/batch5_grovewardens_inputs.zip
"""
import json
import os
import shutil
import zipfile
import cv2
import numpy as np
from PIL import Image

GROVE_DIR = r"D:\plajah game assets deign from promtps\Shooter\Grovewardens"
OUT_ROOT = os.environ.get(
    "BATCH5_OUT",
    r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch5_grovewardens",
)
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch56"

# (id, filename_hash, front_spec, left_spec, back_spec)
# spec = (box_xyxy, mask_rects_in_sheet_coords, flip_x)
WARDEN_SPECS = [
    (
        "ent_ancient_oak",
        "dee6184e",
        ((10, 40, 386, 708), [(8, 575, 58, 700)], False),
        ((724, 40, 938, 708), [(724, 340, 744, 620)], True),
        ((942, 40, 1326, 708), [], False),
    ),
    (
        "ent_banyan",
        "077270c7",
        ((16, 40, 372, 708), [(324, 580, 372, 708)], False),
        ((692, 40, 954, 708), [], True),
        ((964, 40, 1326, 708), [], False),
    ),
    (
        "ent_baobab",
        "c1d2dcd4",
        ((12, 72, 372, 712), [(12, 575, 65, 712)], False),
        ((694, 72, 962, 712), [], True),
        ((968, 72, 1324, 712), [], False),
    ),
    (
        "ent_bioluminescent",
        "23e2658a",
        ((16, 40, 372, 708), [(338, 595, 372, 708)], False),
        ((692, 40, 948, 708), [], True),
        ((956, 40, 1328, 708), [], False),
    ),
    (
        "ent_cherry_blossom",
        "1702804e",
        ((16, 36, 366, 708), [(324, 595, 366, 708)], False),
        ((694, 36, 956, 708), [], False),  # already faces screen-LEFT
        ((964, 36, 1322, 708), [], False),
    ),
    (
        "ent_fungal_spore",
        "a67c309d",
        ((16, 60, 376, 708), [(176, 616, 214, 708), (358, 598, 376, 708)], False),
        ((702, 60, 956, 708), [], True),
        ((966, 60, 1324, 708), [], False),
    ),
    (
        "ent_ironwood_thorn",
        "2c54e818",
        ((14, 28, 378, 708), [(350, 595, 378, 708)], False),
        ((710, 28, 926, 708), [], True),
        ((936, 28, 1322, 708), [], False),
    ),
    (
        "ent_pine_sentinel",
        "c2d27e6e",
        ((14, 20, 380, 708), [], False),
        ((696, 20, 956, 708), [], True),
        ((962, 20, 1326, 708), [], False),
    ),
    (
        "ent_sequoia",
        "444a2e1d",
        ((14, 34, 374, 708), [(338, 595, 374, 708)], False),
        ((704, 34, 958, 708), [], False),  # already faces screen-LEFT
        ((964, 34, 1326, 708), [], False),
    ),
    (
        "ent_swamp_mangrove",
        "75fcbe49",
        ((14, 42, 374, 708), [(336, 605, 374, 708)], False),
        ((704, 42, 956, 708), [], True),
        ((964, 42, 1326, 708), [], False),
    ),
    (
        "ent_weeping_willow",
        "ff030eb9",
        ((20, 26, 362, 708), [(328, 600, 362, 708)], False),
        ((708, 26, 956, 708), [], False),  # already faces screen-LEFT
        ((972, 26, 1316, 708), [], False),
    ),
    (
        "ent_white_birch",
        "a8d1fb3b",
        ((16, 36, 368, 708), [(322, 590, 368, 708)], False),
        ((696, 36, 956, 708), [], True),
        ((964, 36, 1326, 708), [], False),
    ),
]


def find_sheet(hsh: str) -> str:
    matches = [f for f in os.listdir(GROVE_DIR) if hsh in f and f.lower().endswith(".jpg")]
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected 1 sheet for hash {hsh}, got {matches}")
    return os.path.join(GROVE_DIR, matches[0])


def fill_rect_seamlessly(crop: np.ndarray, lx0: int, ly0: int, lx1: int, ly1: int):
    """Fill a masked rectangle using a vertical gradient sampled just above and beside the rect."""
    h, w = crop.shape[:2]
    lx0, ly0 = max(0, lx0), max(0, ly0)
    lx1, ly1 = min(w, lx1), min(h, ly1)
    if lx1 <= lx0 or ly1 <= ly0:
        return
    # Sample top strip above rect
    top_y0 = max(0, ly0 - 10)
    top_strip = crop[top_y0:max(top_y0 + 1, ly0), lx0:lx1].reshape(-1, 3)
    top_col = np.median(top_strip, axis=0) if len(top_strip) > 0 else np.array([150, 150, 150])
    # Sample bottom strip or fallback slightly brighter studio floor
    bot_strip = []
    if lx0 >= 6:
        bot_strip.append(crop[max(ly0, ly1 - 12):ly1, max(0, lx0 - 8):lx0].reshape(-1, 3))
    if lx1 + 6 <= w:
        bot_strip.append(crop[max(ly0, ly1 - 12):ly1, lx1:min(w, lx1 + 8)].reshape(-1, 3))
    if bot_strip:
        cat = np.vstack(bot_strip)
        # Keep brightest 50% (studio floor rather than dark boots)
        lum = cat.mean(axis=1)
        bright = cat[lum >= np.percentile(lum, 50)]
        bot_col = np.median(bright, axis=0) if len(bright) > 0 else top_col
    else:
        bot_col = top_col
    rows = ly1 - ly0
    t = np.linspace(0.0, 1.0, rows, dtype=np.float32)[:, None, None]
    grad = (top_col[None, None, :] * (1.0 - t) + bot_col[None, None, :] * t).astype(np.uint8)
    crop[ly0:ly1, lx0:lx1] = grad


def clean_rgb_crop(sheet: np.ndarray, box, mask_rects=None, flip_x: bool = False, up: int = 2) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = sheet[y0:y1, x0:x1].copy()
    if mask_rects:
        for (mx0, my0, mx1, my1) in mask_rects:
            fill_rect_seamlessly(crop, mx0 - x0, my0 - y0, mx1 - x0, my1 - y0)
    if flip_x:
        crop = cv2.flip(crop, 1)
    if up > 1:
        crop = cv2.resize(crop, (crop.shape[1] * up, crop.shape[0] * up), interpolation=cv2.INTER_LANCZOS4)
    return crop


def make_contact_sheet(manifest: dict, out_path: str):
    rows = []
    cell = 240
    for item in manifest["characters"]:
        cid = item["id"]
        cdir = os.path.join(IN_ROOT, cid)
        imgs = []
        for vk, fname in item["mv_views"].items():
            im = np.array(Image.open(os.path.join(cdir, fname)).convert("RGB"))
            h, w = im.shape[:2]
            sc = (cell - 26) / max(h, w)
            nw, nh = max(1, int(w * sc)), max(1, int(h * sc))
            rs = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
            tile = np.full((cell, cell, 3), (34, 40, 54), dtype=np.uint8)
            y0 = 24 + (cell - 24 - nh) // 2
            x0 = (cell - nw) // 2
            tile[y0 : y0 + nh, x0 : x0 + nw] = rs
            cv2.putText(tile, f"{cid}: {vk}", (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (240, 244, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        rows.append(np.hstack(imgs))
    # Stack 12 rows into 2 side-by-side columns of 6 so it fits neatly on screen
    left_col = np.vstack(rows[:6])
    right_col = np.vstack(rows[6:])
    sep = np.full((left_col.shape[0], 10, 3), (18, 22, 30), dtype=np.uint8)
    Image.fromarray(np.hstack([left_col, sep, right_col])).save(out_path)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)
    os.makedirs(TMP_UPLOAD, exist_ok=True)

    chars = []
    for cid, hsh, f_spec, l_spec, b_spec in WARDEN_SPECS:
        sheet_path = find_sheet(hsh)
        sheet = np.array(Image.open(sheet_path).convert("RGB"))
        cdir = os.path.join(IN_ROOT, cid)
        os.makedirs(cdir, exist_ok=True)
        for vname, spec in (("front", f_spec), ("left", l_spec), ("back", b_spec)):
            box, rects, flip_x = spec
            crop = clean_rgb_crop(sheet, box, rects, flip_x=flip_x, up=2)
            Image.fromarray(crop).save(os.path.join(cdir, f"{vname}.png"))
        chars.append(
            {
                "id": cid,
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "face_limit": 200000,
                "seed": 42,
            }
        )
        print(f"Prepped {cid:20s} <- {os.path.basename(sheet_path)}")

    manifest = {
        "batch": "batch5_grovewardens",
        "rembg_model": "isnet-general-use",
        "characters": chars,
    }
    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    preview_path = os.path.join(OUT_ROOT, "batch5_inputs_preview.png")
    make_contact_sheet(manifest, preview_path)
    print("Preview:", preview_path)

    zip_path = os.path.join(OUT_ROOT, "batch5_grovewardens_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _, files in os.walk(IN_ROOT):
            for fn in sorted(files):
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, IN_ROOT)
                zf.write(full, rel)

    upload_zip = os.path.join(TMP_UPLOAD, "batch5_grovewardens_inputs.zip")
    shutil.copy2(zip_path, upload_zip)
    print(f"Zipped {len(chars)} Grovewardens -> {upload_zip} ({os.path.getsize(upload_zip)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
