"""Prepare Batch 1 Vesselbound character turnaround cutouts for Google Colab Pro Hunyuan3D-2mv.

Runs 100% on CPU. Outputs clean RGBA cutouts + manifest.json + visual verification contact sheet into
D:/rr_work/colab_batch1/ and packs batch1_inputs.zip.

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/riftrealm/colab/prep_batch1.py
"""
import json
import os
import zipfile
import cv2
import numpy as np
from PIL import Image

OUT_ROOT = os.environ.get("BATCH_OUT", r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch1")
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
SHOOTER = r"D:\plajah game assets deign from promtps\Shooter"

SHEETS = {
    "seraph_9": os.path.join(SHOOTER, "Nov 15 - 14_43", "Cyber_cherub_character_design_tu\u2026_56afcb91.jpg"),
    "lumen": os.path.join(SHOOTER, "void-sanctum-complete", "void-sanctum", "turnarounds", "lumen.webp"),
    "sylva": os.path.join(SHOOTER, "void-sanctum-complete", "void-sanctum", "turnarounds", "sylva.webp"),
    "pyre": os.path.join(SHOOTER, "void-sanctum-complete", "void-sanctum", "turnarounds", "pyre.webp"),
    "nyx": os.path.join(SHOOTER, "void-sanctum-complete", "void-sanctum", "turnarounds", "nyx.webp"),
}


def trim_and_pad(rgba: np.ndarray, pad_ratio: float = 0.08, min_alpha: int = 24) -> np.ndarray:
    """Tightly crop to non-transparent pixels and add uniform transparent margin."""
    ys, xs = np.nonzero(rgba[:, :, 3] >= min_alpha)
    if len(xs) == 0:
        raise RuntimeError("Empty cutout mask")
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    crop = rgba[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    pad = max(16, int(max(h, w) * pad_ratio))
    out = np.zeros((h + pad * 2, w + pad * 2, 4), dtype=np.uint8)
    out[pad : pad + h, pad : pad + w] = crop
    return out


def flat_bg_cutout(
    rgb: np.ndarray,
    bg_color: np.ndarray,
    lo_dist: float = 13.0,
    hi_dist: float = 28.0,
    keep_min_area: int = 80,
    protect_sat: float = 0.22,
    smoke_cut: bool = False,
) -> np.ndarray:
    """Cut a figure off a uniform flat-grey turnaround sheet using border flood-fill + soft edge alpha."""
    h, w = rgb.shape[:2]
    diff = np.linalg.norm(rgb.astype(np.float32) - bg_color.astype(np.float32), axis=2)

    # HSV saturation protects faint glowing cyan/magenta halos & fins near grey
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    sat = hsv[:, :, 1] / 255.0

    # Background candidate: close in RGB distance AND low saturation
    bg_cand = (diff < hi_dist) & (sat < protect_sat)
    if smoke_cut:
        # Nyx has soft dark-grey smoke wisps around paws/back: treat low-saturation dark smudges close to bg
        # (luminance > 85 and sat < 0.14) that connect to the border as background.
        lum = rgb.astype(np.float32).mean(axis=2)
        bg_cand = bg_cand | ((lum > 92.0) & (lum < bg_color.mean() + 18.0) & (sat < 0.13))

    # Flood-fill from all 4 borders so enclosed interior grey/white armor or crystal highlights are NEVER removed
    ff_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    bg_u8 = bg_cand.astype(np.uint8)
    flood = bg_u8.copy()
    for x in range(w):
        if flood[0, x] == 1:
            cv2.floodFill(flood, ff_mask, (x, 0), 2)
        if flood[h - 1, x] == 1:
            cv2.floodFill(flood, ff_mask, (x, h - 1), 2)
    for y in range(h):
        if flood[y, 0] == 1:
            cv2.floodFill(flood, ff_mask, (0, y), 2)
        if flood[y, w - 1] == 1:
            cv2.floodFill(flood, ff_mask, (w - 1, y), 2)

    is_bg = flood == 2
    # Also remove enclosed uniform flat-grey background pockets trapped inside limbs/vines/tails
    # (e.g. between Sylva's hanging vines & thighs, Pyre's armpits, Nyx's hind leg & tail).
    gray_f = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    mean_g = cv2.blur(gray_f, (5, 5))
    var_g = cv2.blur(gray_f * gray_f, (5, 5)) - mean_g * mean_g
    std_g = np.sqrt(np.maximum(var_g, 0.0))
    inner_bg = (~is_bg) & (diff < 11.5) & (sat < 0.08) & (std_g < 4.5)
    ni, labi, sti, _ = cv2.connectedComponentsWithStats(inner_bg.astype(np.uint8), 8)
    for i in range(1, ni):
        if sti[i, cv2.CC_STAT_AREA] >= 120:
            is_bg[labi == i] = True

    fg = ~is_bg

    # Remove tiny dust specs while keeping valid detached elements (e.g. Lumen's floating halo)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), 8)
    keep = np.zeros_like(fg)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= keep_min_area:
            keep[lab == i] = True

    # Soft anti-aliased alpha along the silhouette edge
    soft = np.clip((diff - lo_dist) / max(1.0, (hi_dist - lo_dist)), 0.0, 1.0)
    # If pixel is saturated glow (e.g. cyan halo), push alpha up smoothly
    soft = np.maximum(soft, np.clip((sat - 0.12) / 0.18, 0.0, 1.0))
    # Inside eroded solid core, alpha is strictly 1.0
    core = cv2.erode(keep.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    alpha = np.where(core, 1.0, np.where(keep, np.maximum(soft, 0.35), 0.0))
    # Slight feather to eliminate jagged fringes
    alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.55)
    alpha = np.where(core, 1.0, alpha)
    alpha = np.where(~cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool), 0.0, alpha)

    # Color-decontaminate semi-transparent fringe pixels away from the flat grey background
    a3 = alpha[..., None]
    out_rgb = rgb.astype(np.float32)
    fringe = (alpha > 0.05) & (alpha < 0.98)
    decon = np.clip((out_rgb - (1.0 - a3) * bg_color[None, None, :]) / np.maximum(a3, 0.2), 0, 255)
    out_rgb = np.where(fringe[..., None], decon, out_rgb)

    rgba = np.dstack([out_rgb.astype(np.uint8), np.clip(alpha * 255.0, 0, 255).astype(np.uint8)])
    return trim_and_pad(rgba)


def prep_void_sanctum_sheet(cid: str, boxes: dict, smoke_cut: bool = False, hi_dist: float = 28.0):
    sheet = np.array(Image.open(SHEETS[cid]).convert("RGB"))
    bg = np.median(np.concatenate([sheet[:16].reshape(-1, 3), sheet[-16:].reshape(-1, 3)]), axis=0)
    out_dir = os.path.join(IN_ROOT, cid)
    os.makedirs(out_dir, exist_ok=True)
    saved = {}
    for view_name, (x0, y0, x1, y1) in boxes.items():
        crop = sheet[y0:y1, x0:x1]
        rgba = flat_bg_cutout(crop, bg, lo_dist=12.0, hi_dist=hi_dist, keep_min_area=120, smoke_cut=smoke_cut)
        p = os.path.join(out_dir, f"{view_name}.png")
        Image.fromarray(rgba).save(p)
        saved[view_name] = p
    # Also save mirrored right view for symmetric view painting
    left_im = Image.open(saved["left"])
    right_p = os.path.join(out_dir, "right.png")
    left_im.transpose(Image.FLIP_LEFT_RIGHT).save(right_p)
    saved["right"] = right_p
    return saved


def prep_seraph9():
    """Cut Seraph-9 (Cyber_cherub_character_design_tu..._56afcb91.jpg) using fast pure-OpenCV dark-bg matting:
    - clean body-only front.png & back.png (matching silhouette for Hunyuan3D-2mv!)
    - full front_with_wings.png, wing_left.png, wing_right.png, halo_shield.png, beam_lance.png for articulated parts.
    """
    sheet = Image.open(SHEETS["seraph_9"]).convert("RGB")
    out_dir = os.path.join(IN_ROOT, "seraph_9")
    os.makedirs(out_dir, exist_ok=True)

    def cut_dark_bg(box, up=2, largest_only=True, lum_thresh=38.0, close_k=5):
        crop = sheet.crop(box)
        crop_up = crop.resize((crop.width * up, crop.height * up), Image.LANCZOS)
        rgb = np.array(crop_up)
        h, w = rgb.shape[:2]
        # Background is dark neutral charcoal (R,G,B ~ 10..34) with faint grey grid lines.
        mx = rgb.max(axis=2).astype(np.float32)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        sat = hsv[:, :, 1] / 255.0
        # Dark neutral pixels connected to the border are background; gold/warm highlights stay foreground
        bg_cand = (mx < lum_thresh) & (sat < 0.28)
        ff_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
        flood = bg_cand.astype(np.uint8)
        for x in range(w):
            if flood[0, x] == 1:
                cv2.floodFill(flood, ff_mask, (x, 0), 2)
            if flood[h - 1, x] == 1:
                cv2.floodFill(flood, ff_mask, (x, h - 1), 2)
        for y in range(h):
            if flood[y, 0] == 1:
                cv2.floodFill(flood, ff_mask, (0, y), 2)
            if flood[y, w - 1] == 1:
                cv2.floodFill(flood, ff_mask, (w - 1, y), 2)

        fg = flood != 2
        # Close tiny dark panel-seam notches along the outline without bridging across gaps
        if close_k > 1:
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_k, close_k))
            fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, k) > 0
        # Open 1px grid-line ticks that may poke into the mask
        fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0

        n, lab, st, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), 8)
        if n > 1:
            if largest_only:
                k_best = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
                keep = lab == k_best
            else:
                keep = np.zeros_like(fg)
                for i in range(1, n):
                    if st[i, cv2.CC_STAT_AREA] >= 180:
                        keep[lab == i] = True
            fg = keep

        # Fill small internal dark holes inside armor / crystal glass
        inv = (~fg).astype(np.uint8)
        ni, labi, sti, _ = cv2.connectedComponentsWithStats(inv, 4)
        for i in range(1, ni):
            if sti[i, cv2.CC_STAT_AREA] < 1800:
                fg[labi == i] = True

        # Soft edge alpha
        core = cv2.erode(fg.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        al = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 0.7)
        al = np.where(core, 1.0, al)
        al = np.where(~cv2.dilate(fg.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool), 0.0, al)
        return np.dstack([rgb, np.clip(al * 255.0, 0, 255).astype(np.uint8)])

    # 1. Full Front (with floating crystal wings)
    front_full = cut_dark_bg((48, 88, 498, 636), up=2, largest_only=False, lum_thresh=42.0, close_k=3)
    Image.fromarray(trim_and_pad(front_full)).save(os.path.join(out_dir, "front_with_wings.png"))

    # 2. Clean Front BODY (mask out floating wing triangles left/right of shoulders, keep main connected body)
    fh, fw = front_full.shape[:2]
    yy, xx = np.mgrid[0:fh, 0:fw]
    xo = 48.0 + xx * 0.5
    yo = 88.0 + yy * 0.5
    # Clean diagonal split clearing the wing roots that sit right behind the upper pauldrons
    wing_l_zone = (xo < 216.0) & (yo < 358.0)
    wing_l_zone |= (xo < 238.0) & (yo < 312.0)
    wing_l_zone |= (xo < 248.0) & (yo < 292.0)
    wing_r_zone = (xo > 374.0) & (yo < 358.0)
    wing_r_zone |= (xo > 352.0) & (yo < 312.0)
    wing_r_zone |= (xo > 342.0) & (yo < 292.0)

    front_body = front_full.copy()
    front_body[wing_l_zone | wing_r_zone, 3] = 0
    m = (front_body[:, :, 3] > 80).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        k_best = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        front_body[lab != k_best, 3] = 0
    Image.fromarray(trim_and_pad(front_body)).save(os.path.join(out_dir, "front.png"))

    # Save isolated left & right wing assemblies (tighter dark cutoff so shards float cleanly without dark box)
    front_wings_clean = cut_dark_bg((48, 88, 498, 636), up=2, largest_only=False, lum_thresh=54.0, close_k=1)
    wl = front_wings_clean.copy()
    wl[~wing_l_zone, 3] = 0
    Image.fromarray(trim_and_pad(wl)).save(os.path.join(out_dir, "wing_left.png"))
    wr = front_wings_clean.copy()
    wr[~wing_r_zone, 3] = 0
    Image.fromarray(trim_and_pad(wr)).save(os.path.join(out_dir, "wing_right.png"))

    # 3. Clean Back BODY (back view on sheet has NO wings; start y=152 to clear 3/4 view's wing tip)
    back_body = cut_dark_bg((845, 152, 1078, 636), up=2, largest_only=True, lum_thresh=42.0, close_k=3)
    Image.fromarray(trim_and_pad(back_body)).save(os.path.join(out_dir, "back.png"))

    # 4. Halo Energy Emitter Shield & Miniature Beam Lance insets
    halo = cut_dark_bg((1114, 130, 1344, 286), up=2, largest_only=True, lum_thresh=58.0, close_k=1)
    Image.fromarray(trim_and_pad(halo)).save(os.path.join(out_dir, "halo_shield.png"))
    lance = cut_dark_bg((1188, 430, 1296, 738), up=2, largest_only=True, lum_thresh=58.0, close_k=1)
    Image.fromarray(trim_and_pad(lance)).save(os.path.join(out_dir, "beam_lance.png"))

    return {
        "front": os.path.join(out_dir, "front.png"),
        "back": os.path.join(out_dir, "back.png"),
        "front_with_wings": os.path.join(out_dir, "front_with_wings.png"),
        "wing_left": os.path.join(out_dir, "wing_left.png"),
        "wing_right": os.path.join(out_dir, "wing_right.png"),
        "halo_shield": os.path.join(out_dir, "halo_shield.png"),
        "beam_lance": os.path.join(out_dir, "beam_lance.png"),
    }


def make_contact_sheet(manifest: dict, out_path: str):
    """Compose all cutouts on a bright magenta checkerboard to spot any alpha holes or bleed."""
    rows = []
    cell = 280
    for item in manifest["characters"]:
        cid = item["id"]
        cdir = os.path.join(IN_ROOT, cid)
        imgs = []
        for label, fname in item["preview_files"]:
            p = os.path.join(cdir, fname)
            im = np.array(Image.open(p).convert("RGBA"))
            h, w = im.shape[:2]
            scale = (cell - 28) / max(h, w)
            nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
            rs = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
            tile = np.full((cell, cell, 3), (210, 40, 190), dtype=np.uint8)
            # Subtle checkerboard
            for cy in range(0, cell, 16):
                for cx in range(0, cell, 16):
                    if ((cx // 16) + (cy // 16)) % 2 == 0:
                        tile[cy : cy + 16, cx : cx + 16] = (175, 30, 160)
            y0 = 24 + (cell - 24 - nh) // 2
            x0 = (cell - nw) // 2
            al = rs[:, :, 3:4].astype(np.float32) / 255.0
            tile[y0 : y0 + nh, x0 : x0 + nw] = (
                rs[:, :, :3].astype(np.float32) * al + tile[y0 : y0 + nh, x0 : x0 + nw].astype(np.float32) * (1 - al)
            ).astype(np.uint8)
            cv2.putText(tile, f"{cid}: {label}", (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)
            imgs.append(tile)
        while len(imgs) < 5:
            imgs.append(np.full((cell, cell, 3), (24, 24, 30), dtype=np.uint8))
        rows.append(np.hstack(imgs[:5]))
    grid = np.vstack(rows)
    Image.fromarray(grid).save(out_path)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)
    print("Cutting Seraph-9...")
    prep_seraph9()
    print("Cutting Lumen...")
    prep_void_sanctum_sheet(
        "lumen",
        {"front": (30, 10, 775, 895), "left": (800, 10, 1355, 895), "back": (1365, 10, 2095, 895), "threeq": (2110, 10, 2720, 895)},
        hi_dist=22.0,
    )
    print("Cutting Sylva...")
    prep_void_sanctum_sheet(
        "sylva",
        {"front": (80, 10, 680, 905), "left": (870, 10, 1250, 905), "back": (1420, 10, 2030, 905), "threeq": (2160, 10, 2680, 905)},
        hi_dist=22.0,
    )
    print("Cutting Pyre...")
    prep_void_sanctum_sheet(
        "pyre",
        {"front": (10, 10, 710, 905), "left": (840, 10, 1290, 905), "back": (1370, 10, 2060, 905), "threeq": (2070, 10, 2710, 905)},
        hi_dist=22.0,
    )
    print("Cutting Nyx...")
    prep_void_sanctum_sheet(
        "nyx",
        {"front": (20, 10, 448, 905), "left": (452, 10, 1536, 905), "back": (1536, 10, 1922, 905), "threeq": (1922, 10, 2732, 905)},
        smoke_cut=True,
        hi_dist=26.0,
    )

    manifest = {
        "batch": "vesselbound_batch1",
        "characters": [
            {
                "id": "seraph_9",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
                "preview_files": [
                    ("front_body", "front.png"),
                    ("back_body", "back.png"),
                    ("wings_L", "wing_left.png"),
                    ("halo", "halo_shield.png"),
                    ("lance", "beam_lance.png"),
                ],
            },
            {
                "id": "lumen",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
                "preview_files": [("front", "front.png"), ("left", "left.png"), ("back", "back.png"), ("3/4", "threeq.png")],
            },
            {
                "id": "sylva",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
                "preview_files": [("front", "front.png"), ("left", "left.png"), ("back", "back.png"), ("3/4", "threeq.png")],
            },
            {
                "id": "pyre",
                "rig_type": "humanoid",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
                "preview_files": [("front", "front.png"), ("left", "left.png"), ("back", "back.png"), ("3/4", "threeq.png")],
            },
            {
                "id": "nyx",
                "rig_type": "quadruped",
                "mv_views": {"front": "front.png", "left": "left.png", "back": "back.png"},
                "octree_resolution": 384,
                "steps": 30,
                "face_limit": 200000,
                "seed": 42,
                "preview_files": [("front", "front.png"), ("left", "left.png"), ("back", "back.png"), ("3/4", "threeq.png")],
            },
        ],
    }

    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    check_path = os.path.join(OUT_ROOT, "batch1_cutouts_check.png")
    make_contact_sheet(manifest, check_path)
    print("Contact sheet written:", check_path)

    zip_path = os.path.join(OUT_ROOT, "batch1_inputs.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(IN_ROOT, "manifest.json"), "manifest.json")
        for item in manifest["characters"]:
            cid = item["id"]
            cdir = os.path.join(IN_ROOT, cid)
            for fname in set(item["mv_views"].values()):
                zf.write(os.path.join(cdir, fname), f"{cid}/{fname}")
    print(f"Zip written: {zip_path} ({os.path.getsize(zip_path) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
