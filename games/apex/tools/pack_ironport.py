"""
Pack the Ironport city for production. In development the game reads the city models and their textures straight from the artist folder (served at /ironport-assets);
a deployed site has no such folder, so this copies what the game actually loads into public/games/apex/ironport/:
  models/{generic,hero}/<slug>_lod0.gltf + .bin           (the glTF files point at ../../textures/<set>/<name>_<map>.png)
  textures/{shared,hero-facades}/<name>_<map>.jpg         (re-encoded jpg; the game rewrites the .png URLs, see region.ts)
Textures that have a photographic replacement in tex/bld (see FLOW in region.ts) are left out.
Usage: python tools/pack_ironport.py "<ironport-complete folder>"
"""
import glob, json, os, re, shutil, sys
import cv2
import numpy as np

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "apex", "ironport")
BLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "apex", "tex", "bld")
have = {os.path.basename(p)[: -len("_base.jpg")] for p in glob.glob(os.path.join(BLD, "*_base.jpg"))}
need = set()
n_models = 0
for kind in ("generic", "hero"):
    os.makedirs(os.path.join(OUT, "models", kind), exist_ok=True)
    for g in glob.glob(os.path.join(SRC, "models", kind, "*_lod0.gltf")):
        j = json.load(open(g))
        for im in j.get("images", []):
            m = re.search(r"textures/(shared|hero-facades)/([a-z0-9-]+)_(base|nrm|rgh)\.png", im["uri"])
            if m: need.add((m.group(1), m.group(2), m.group(3)))
        for b in j.get("buffers", []):
            shutil.copy(os.path.join(os.path.dirname(g), b["uri"]), os.path.join(OUT, "models", kind, b["uri"]))
        shutil.copy(g, os.path.join(OUT, "models", kind, os.path.basename(g)))
        n_models += 1
n = 0
for sset, name, kind in sorted(need):
    if name in have: continue
    # shared materials at their full 1024; the hero facade sheets from the 1024 tier (the 1600 originals are too heavy for the GPU budget)
    folder = "textures" if sset == "shared" else "textures-quest"
    p = os.path.join(SRC, folder, sset, f"{name}_{kind}.png")
    if not os.path.exists(p):
        print("missing", p); continue
    im = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
    if im.shape[0] > 1024: im = cv2.resize(im, (1024, 1024), interpolation=cv2.INTER_AREA)
    os.makedirs(os.path.join(OUT, "textures", sset), exist_ok=True)
    cv2.imwrite(os.path.join(OUT, "textures", sset, f"{name}_{kind}.jpg"), im, [cv2.IMWRITE_JPEG_QUALITY, 88 if kind == "base" else 92])
    n += 1
print("models", n_models, "textures", n)
