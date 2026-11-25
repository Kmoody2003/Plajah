"""
Pack the v3 photoreal Ironport textures for the game (the set delivered 2026-11-16: 36 hero facades + 24 shared materials, text-only photographic generations).

Source: the delivery folder, which has textures/ (desktop, 2048) and textures-quest/ (hero 1024, shared 512), same names as v1.
Output: public/games/apex/ironport/textures-v3/{shared,hero-facades}/<name>_<map>.jpg, every map at 1024 (the GPU budget the game already runs on):
  shared: from the 2048 desktop tier, downsampled   |   hero: from the 1024 quest tier as is
region.ts reads these when the texture switch is on v3 (default), and the v1 packed copy in ironport/textures when it is on v1 (?tex=v1, or Settings).
Usage: python tools/pack_ironport_v3.py "<...>/ironport-textures-v3/textures-v3-delivery"
"""
import glob, os, sys
import cv2
import numpy as np

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "apex", "ironport", "textures-v3")
n = 0
for kind, tier in (("shared", "textures"), ("hero-facades", "textures-quest")):
    os.makedirs(os.path.join(OUT, kind), exist_ok=True)
    for p in sorted(glob.glob(os.path.join(SRC, tier, kind, "*.png"))):
        name = os.path.basename(p)[:-4]
        im = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
        if im is None:
            print("unreadable", p); continue
        if im.shape[0] != 1024:
            im = cv2.resize(im, (1024, 1024), interpolation=cv2.INTER_AREA)
        base = name.endswith("_base")
        ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, 88 if base else 92])
        open(os.path.join(OUT, kind, name + ".jpg"), "wb").write(buf.tobytes())
        n += 1
print("packed", n, "maps into", os.path.normpath(OUT))
