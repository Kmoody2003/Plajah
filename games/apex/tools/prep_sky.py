"""
Sky panoramas for the region game.
The reference panoramas are only 1376x768 and the first pass shrank them to 1024x571, which is about 2.8 pixels per degree: soft and blocky in a
360 degree dome. This script takes the originals, upsamples them 2x (Lanczos, then a gentle unsharp and a touch of grain so the extra pixels are not
mush) and writes sky2_*.jpg at 2752x1536. The sky shader (src/sky.ts) adds procedural cloud detail, sun, moon, stars and haze on top, which is where
the real sharpness comes from.
Adds the overcast and stormy panoramas so bad weather uses a real overcast sky and not a darkened clear one.
Usage: python tools/prep_sky.py
"""
import os
import cv2
import numpy as np

SRC = r"D:\plajah game assets deign from promtps\racer\Nov 15 - 14_22"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "apex", "tex")
PICK = {
    "sky2_clear": "Clear_blue_sky_texture_map_57b804a0.jpg",
    "sky2_golden": "Sky_map_during_golden_hour_40b4c40b.jpg",
    "sky2_sunset": "Sunset_sky_map_panorama_e067bd62.jpg",
    "sky2_dusk": "Dusk_skydome_map_with_gradient_f28edae6.jpg",
    "sky2_night": "Starry_night_sky_map_488c6f71.jpg",
    "sky2_sunrise": "Sunrise_skydome_map_rendering_abadab67.jpg",
    "sky2_overcast": "Overcast_sky_skydome_panorama_add8aa6f.jpg",
    "sky2_storm": "Stormy_overcast_sky_with_sunbeams_121a1b6f.jpg",
}
rng = np.random.default_rng(7)
for name, f in PICK.items():
    p = os.path.join(SRC, f)
    img = cv2.imread(p)
    if img is None:
        print("missing", f)
        continue
    h, w = img.shape[:2]
    # equirect panoramas wrap horizontally: pad with the opposite edge so the resize and sharpen do not leave a seam
    pad = 24
    wrapped = np.concatenate([img[:, -pad:], img, img[:, :pad]], axis=1)
    big = cv2.resize(wrapped, (wrapped.shape[1] * 2, h * 2), interpolation=cv2.INTER_LANCZOS4)
    big = big[:, pad * 2: pad * 2 + w * 2]
    blur = cv2.GaussianBlur(big, (0, 0), 2.2)
    sharp = cv2.addWeighted(big, 1.55, blur, -0.55, 0)
    grain = rng.normal(0, 2.2, sharp.shape).astype(np.float32)
    out = np.clip(sharp.astype(np.float32) + grain, 0, 255).astype(np.uint8)
    out = cv2.resize(out, (2752, 1536), interpolation=cv2.INTER_AREA) if out.shape[1] != 2752 else out
    cv2.imwrite(os.path.join(OUT, name + ".jpg"), out, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(name, f, (w, h), "->", out.shape[1::-1])
