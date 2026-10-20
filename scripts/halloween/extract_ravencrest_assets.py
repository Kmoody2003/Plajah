import os
import math
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageOps, ImageDraw

SRC_DIR = r"C:\Users\Kenne\plajah\halloween interactiv elayou\extracted"
OUT_DIR = r"C:\Users\Kenne\plajah\public\models\halloween\ravencrest"
os.makedirs(OUT_DIR, exist_ok=True)


def make_tileable(img: Image.Image, blend_ratio: float = 0.22) -> Image.Image:
    """Create a seamless 4-way tileable texture using cosine edge cross-blending."""
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, c = arr.shape
    shifted_x = np.roll(arr, w // 2, axis=1)
    # Cosine weight mask along X seam (around w//2 and edges)
    x = np.linspace(0, 1, w, endpoint=False)
    wx = 0.5 - 0.5 * np.cos(2.0 * np.pi * x)
    wx = np.clip((wx - 0.15) / 0.7, 0.0, 1.0)[:, None]
    blend_x = arr * wx[None, :, :] + shifted_x * (1.0 - wx[None, :, :])

    shifted_y = np.roll(blend_x, h // 2, axis=0)
    y = np.linspace(0, 1, h, endpoint=False)
    wy = 0.5 - 0.5 * np.cos(2.0 * np.pi * y)
    wy = np.clip((wy - 0.15) / 0.7, 0.0, 1.0)[:, None]
    blend_xy = blend_x * wy[:, None, :] + shifted_y * (1.0 - wy[:, None, :])
    return Image.fromarray(np.clip(blend_xy, 0, 255).astype(np.uint8))


def generate_normal_and_roughness(albedo: Image.Image, base_name: str, strength: float = 3.2, invert_rough: bool = False):
    """Generate tangent-space normal map and roughness map from an albedo image."""
    gray = np.asarray(albedo.convert("L"), dtype=np.float32) / 255.0
    # Sobel gradients
    gx = np.roll(gray, -1, axis=1) - np.roll(gray, 1, axis=1)
    gy = np.roll(gray, -1, axis=0) - np.roll(gray, 1, axis=0)
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(gray)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    nx /= norm
    ny /= norm
    nz /= norm
    normal_rgb = np.stack([
        np.clip((nx * 0.5 + 0.5) * 255.0, 0, 255),
        np.clip((ny * 0.5 + 0.5) * 255.0, 0, 255),
        np.clip((nz * 0.5 + 0.5) * 255.0, 0, 255),
    ], axis=-1).astype(np.uint8)
    Image.fromarray(normal_rgb).save(os.path.join(OUT_DIR, f"{base_name}_normal.png"))

    rough = 1.0 - gray if invert_rough else gray
    rough = np.clip((rough - rough.min()) / (rough.max() - rough.min() + 1e-6) * 0.7 + 0.18, 0.08, 0.96)
    Image.fromarray((rough * 255.0).astype(np.uint8)).save(os.path.join(OUT_DIR, f"{base_name}_roughness.png"))


def build_ravencrest_medallion(raven_banner_crop: Image.Image) -> Image.Image:
    """Create the 1024x1024 circular Ravencrest Raven Floor Medallion matching Grand Hall 3752887346."""
    size = 1024
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # Base dark polished slate disc
    draw.ellipse((16, 16, size - 16, size - 16), fill=(22, 26, 33, 255), outline=(148, 128, 86, 255), width=10)
    draw.ellipse((46, 46, size - 46, size - 46), fill=(16, 19, 25, 255), outline=(182, 156, 102, 255), width=6)
    draw.ellipse((110, 110, size - 110, size - 110), fill=(20, 24, 32, 255), outline=(145, 124, 82, 255), width=8)

    # Geometric Gothic radial ribs between outer ring (46..110)
    for i in range(24):
        ang = (i / 24.0) * math.tau
        x0 = cx + math.cos(ang) * (size // 2 - 110)
        y0 = cy + math.sin(ang) * (size // 2 - 110)
        x1 = cx + math.cos(ang) * (size // 2 - 46)
        y1 = cy + math.sin(ang) * (size // 2 - 46)
        draw.line([(x0, y0), (x1, y1)], fill=(156, 134, 88, 220), width=4)

    # Extract the emblem from the center of raven_banner_crop and composite into the center of the medallion
    bw, bh = raven_banner_crop.size
    emblem = raven_banner_crop.crop((int(bw * 0.08), int(bh * 0.16), int(bw * 0.92), int(bh * 0.68))).resize((580, 580), Image.Resampling.LANCZOS)
    emblem_gray = np.asarray(emblem.convert("L"), dtype=np.float32) / 255.0
    # Boost contrast to isolate the heraldic spread-wing raven
    mask = np.clip((emblem_gray - 0.24) * 2.6, 0.0, 1.0)
    # Circular fade on emblem mask
    yy, xx = np.mgrid[0:580, 0:580]
    dist = np.sqrt((xx - 290) ** 2 + (yy - 290) ** 2) / 280.0
    radial = np.clip(1.0 - dist ** 3, 0.0, 1.0)
    mask *= radial

    med_arr = np.asarray(img, dtype=np.float32)
    y0, x0 = cy - 290, cx - 290
    sub = med_arr[y0:y0 + 580, x0:x0 + 580]
    gold_color = np.array([196.0, 174.0, 126.0, 255.0], dtype=np.float32)
    for c in range(3):
        sub[:, :, c] = sub[:, :, c] * (1.0 - mask * 0.85) + gold_color[c] * (mask * 0.85)
    med_arr[y0:y0 + 580, x0:x0 + 580] = sub
    out = Image.fromarray(np.clip(med_arr, 0, 255).astype(np.uint8))

    # Inner ornate ring
    draw2 = ImageDraw.Draw(out)
    draw2.ellipse((195, 195, size - 195, size - 195), outline=(172, 148, 96, 220), width=5)
    return out


def main():
    print("Extracting Ravencrest master textures, billboards, banners, portraits & plates...")

    # 1. Load 3752891694 (Interior Asset Sheet 4)
    im_891694 = Image.open(os.path.join(SRC_DIR, "creation_3752891694.png")).convert("RGB")
    swatches_891694 = {
        "stone_wall": (34, 1098, 156, 1216),
        "stone_floor": (186, 1098, 308, 1216),
        "wood_planks": (338, 1098, 460, 1216),
        "wood_beam": (490, 1098, 612, 1216),
        "carpet_rug": (642, 1098, 764, 1216),
        "iron_metal": (34, 1300, 156, 1422),
        "brass_metal": (186, 1300, 308, 1422),
        "velvet_fabric": (338, 1300, 460, 1422),
        "dark_leather": (490, 1300, 612, 1422),
        "stained_glass_rose": (642, 1300, 764, 1422),
    }

    for name, box in swatches_891694.items():
        crop = im_891694.crop(box).resize((512, 512), Image.Resampling.LANCZOS)
        if name not in ("carpet_rug", "stained_glass_rose"):
            crop = make_tileable(crop)
        crop.save(os.path.join(OUT_DIR, f"{name}.png"))
        generate_normal_and_roughness(crop, name, strength=3.5 if "stone" in name or "wood" in name else 2.0)

    # Extract banners and Gothic window from 891694
    banner_navy = im_891694.crop((1660, 738, 1732, 955)).resize((512, 1024), Image.Resampling.LANCZOS)
    banner_navy.save(os.path.join(OUT_DIR, "banner_raven_navy.png"))

    banner_red = im_891694.crop((1782, 738, 1854, 955)).resize((512, 1024), Image.Resampling.LANCZOS)
    banner_red.save(os.path.join(OUT_DIR, "banner_raven_red.png"))

    banner_lion = im_891694.crop((1902, 738, 1974, 955)).resize((512, 1024), Image.Resampling.LANCZOS)
    banner_lion.save(os.path.join(OUT_DIR, "banner_lion_navy.png"))

    window_arch = im_891694.crop((448, 292, 558, 558)).resize((512, 1024), Image.Resampling.LANCZOS)
    window_arch.save(os.path.join(OUT_DIR, "gothic_window_arch.png"))

    # Build Ravencrest Floor Medallion using the heraldic raven crest
    medallion = build_ravencrest_medallion(banner_navy)
    medallion.save(os.path.join(OUT_DIR, "ravencrest_medallion.png"))

    # 2. Load 3752891684 (Interior Asset Sheet 3) for House Crest Banner, Castle Tapestry, and Lord Portrait
    im_891684 = Image.open(os.path.join(SRC_DIR, "creation_3752891684.png")).convert("RGB")
    im_891684.crop((872, 382, 964, 612)).resize((512, 1024), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "banner_house_crest.png")
    )
    im_891684.crop((1016, 394, 1176, 612)).resize((768, 1024), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "tapestry_castle.png")
    )
    im_891684.crop((1220, 394, 1346, 610)).resize((768, 1024), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "portrait_lord.png")
    )
    im_891684.crop((686, 374, 794, 620)).resize((512, 1024), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "gothic_window_lancet2.png")
    )

    # 3. Load Billboard Sheets (926830, 926837, 926851)
    im_926830 = Image.open(os.path.join(SRC_DIR, "creation_3752926830.png")).convert("RGB")
    im_926830.crop((1548, 1194, 2212, 1440)).resize((1024, 512), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "billboard_history_mist.png")
    )
    im_926830.crop((956, 1064, 1436, 1246)).resize((1024, 512), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "billboard_back_wood.png")
    )

    im_926837 = Image.open(os.path.join(SRC_DIR, "creation_3752926837.png")).convert("RGB")
    im_926837.crop((108, 1048, 484, 1224)).resize((1024, 512), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "billboard_directional_12mi.png")
    )
    im_926837.crop((654, 1036, 1148, 1226)).resize((1024, 512), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "billboard_legacy_remains.png")
    )

    im_926851 = Image.open(os.path.join(SRC_DIR, "creation_3752926851.png")).convert("RGB")
    im_926851.crop((556, 942, 924, 1134)).resize((1024, 512), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "billboard_history_awaits.png")
    )
    im_926851.crop((1018, 952, 1354, 1134)).resize((1024, 512), Image.Resampling.LANCZOS).save(
        os.path.join(OUT_DIR, "billboard_welcome.png")
    )

    # 4. Copy high-res reference plates, blueprints, and character/monster sheets for in-game Sky, UI & Blender UV mapping
    plates_map = {
        "road_approach_plate.jpg": "creation_3752878158.png",
        "floorplan_blueprint.jpg": "creation_3752884004.png",
        "floorplan_blueprint_2.jpg": "creation_3752884032.png",
        "grand_hall_plate.jpg": "creation_3752887346.png",
        "grand_hall_plate_2.jpg": "creation_3752887369.png",
        "interior_assets_sheet.jpg": "creation_3752891694.png",
        "bedrooms_sheet.jpg": "creation_3752894391.png",
        "road_assets_sheet.jpg": "creation_3752899931.png",
        "monsters_outbreak.jpg": "creation_3752917287.png",
        "monsters_unknown.jpg": "creation_3752917275.png",
        "survivors_jack_elise.jpg": "creation_3752922019.png",
        "survivors_action_sheet.jpg": "creation_3752922038.png",
        "castle_moat_bridge.jpg": "creation_3752929161.png",
        "castle_drawbridge_up.jpg": "creation_3752929185.png",
        "castle_exterior_moon.jpg": "creation_3752931199.png",
        "castle_architecture_callouts.jpg": "creation_3752931231.png",
        "forest_fork_bridge.jpg": "creation_3752940067.png",
    }
    for out_name, src_name in plates_map.items():
        im = Image.open(os.path.join(SRC_DIR, src_name)).convert("RGB")
        im.save(os.path.join(OUT_DIR, out_name), quality=92)
        if src_name in ("creation_3752922019.png", "creation_3752917287.png"):
            im.save(os.path.join(OUT_DIR, out_name.replace(".jpg", ".png")))

    print(f"Successfully generated {len(os.listdir(OUT_DIR))} files in {OUT_DIR}")


if __name__ == "__main__":
    main()
