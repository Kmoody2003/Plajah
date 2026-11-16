"""
Photographic colour-only textures (Flow, 1024) -> game material sets (colour, normal, roughness) and ground colour maps.

For the building materials the relief is read out of the photograph itself: the luminance with its broad lighting taken off is the height (mortar, joints and pits are
darker than the faces around them), the normal map is its gradient, ambient occlusion is the cavity signal folded into the colour, and the roughness follows a per-material
base value with the dark crevices rougher. Tiled materials get their edges cross-faded so they repeat without a seam; single-facade sheets are left alone.

Usage: python tools/build_pbr_from_albedo.py "<folder of Flow jpgs>"
Writes public/games/forth-horizon/tex/bld/<material>_{base,nrm,rgh}.jpg  and overwrites the ground colour jpgs listed in GROUND.
"""
import os, sys, glob
import cv2
import numpy as np

SRC = sys.argv[1]
TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "forth-horizon", "tex")
BLD = os.path.join(TEX, "bld")
os.makedirs(BLD, exist_ok=True)
B = 64


def rd(prefix):
    fs = sorted(f for f in glob.glob(os.path.join(SRC, "*.jpg")) if os.path.basename(f).startswith(prefix))
    if not fs:
        raise SystemExit("missing " + prefix)
    return cv2.imdecode(np.fromfile(fs[0], np.uint8), cv2.IMREAD_COLOR)


def fade(a, axis):
    n = a.shape[axis]
    wt = np.arange(B, dtype=np.float32) / B
    wt = wt * wt * (3 - 2 * wt)
    if axis == 1:
        w = wt[None, :, None]; out = a[:, : n - B].copy(); out[:, :B] = a[:, :B] * w + a[:, n - B:] * (1 - w)
    else:
        w = wt[:, None, None]; out = a[: n - B].copy(); out[:B] = a[:B] * w + a[n - B:] * (1 - w)
    return out


def tileable(im, size):
    f = fade(fade(im.astype(np.float32), 1), 0)
    return cv2.resize(f, (size, size), interpolation=cv2.INTER_CUBIC)


# material -> (flow file prefix, base roughness, relief strength, tiled)
MATERIALS = {
    "tex-shared-02-weathered-brick": ("Weathered_brick_wall_texture_9484", 0.88, 1.3, True),
    "tex-shared-03-orange-brick": ("Red_brick_wall_texture", 0.86, 1.5, True),
    "tex-shared-06-granite": ("Grey_granite_blocks_texture_02ab", 0.62, 1.4, True),
    "tex-shared-08-glass-curtain-cerulean": ("Modern_glass_curtain_wall_texture", 0.14, 0.9, True),
    "tex-shared-09-glass-curtain-bronze": ("Skyscraper_curtain_wall_facade", 0.14, 0.9, True),
    "tex-shared-10-terracotta": ("Terracotta_floor_tiles", 0.6, 1.4, True),
    "tex-shared-12-bronze-metal": ("Corten_steel_panel_facade", 0.45, 1.3, True),
    "tex-shared-13-copper-roof": ("Brushed_copper_panel_cladding", 0.38, 1.0, True),
    "tex-shared-23-slate-roof": ("Dark_slate_stone_floor_tiles", 0.55, 1.8, True),
    "tex-shared-24-stone-rubble": ("Stone_rubble_wall_texture", 0.9, 1.8, True),
    "tex-hero-31-city-hall": ("Neoclassical_bank_building_facade", 0.78, 1.8, False),
}
# ground colour maps replaced in place (the terrain and road shaders read these)
GROUND = {
    "grass.jpg": "Green_grass_lawn_surface_texture", "sand.jpg": "Sand_dune_texture_surface", "gravel.jpg": "Gravel_road_surface_texture",
    "dirt.jpg": "Compacted_dirt_racing_track_surface", "mud.jpg": "Muddy_terrain_with_tire_ruts", "cobble.jpg": "Granite_cobblestone_street_texture",
    "rumble.jpg": "Rumble_strip_texture_pattern", "wet_tarmac.jpg": "Wet_asphalt_road_surface", "asphalt_cracked.jpg": "Cracked_asphalt_surface_texture",
    "paver_plain.jpg": "Concrete_sidewalk_paving_slabs",
}

for name, (prefix, rough0, relief, tiled) in MATERIALS.items():
    im = rd(prefix)
    if tiled:
        im = tileable(im, 1024)
    else:
        im = im.astype(np.float32)
    lum = cv2.cvtColor(np.clip(im, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    h = lum - cv2.GaussianBlur(lum, (0, 0), 14)                   # take the broad lighting off: what is left is relief
    h = cv2.GaussianBlur(h, (0, 0), 0.9)
    h = h / (h.std() + 1e-5)
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    nx, ny, nz = -gx * relief, -gy * relief, np.ones_like(gx)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)
    cav = np.clip(0.5 - h * 0.18, 0.0, 1.0)
    ao = np.clip(0.72 + (cv2.GaussianBlur(h, (0, 0), 6) - h) * 0.12, 0.4, 1.0)
    rgh = np.clip(rough0 + (-h) * 0.05 * (1 if rough0 > 0.3 else 0.3) + (cav - 0.5) * 0.08, 0.04, 1.0)
    base = np.clip(im * ao[..., None], 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(BLD, name + "_base.jpg"), cv2.resize(base, (2048, 2048), interpolation=cv2.INTER_CUBIC) if False else base, [cv2.IMWRITE_JPEG_QUALITY, 93])
    cv2.imwrite(os.path.join(BLD, name + "_nrm.jpg"), (np.clip(nrm, 0, 1)[..., ::-1] * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(BLD, name + "_rgh.jpg"), (rgh * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    print("ok", name)

for out, prefix in GROUND.items():
    im = tileable(rd(prefix), 1024)
    cv2.imwrite(os.path.join(TEX, out), np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    print("ground", out)
