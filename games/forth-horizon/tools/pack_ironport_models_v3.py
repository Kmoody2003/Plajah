"""
Pack the v3 Ironport models (detail pass delivered 2026-11-16: real doors, framed windows, trim, rear dressing; same 86 buildings, identical footprints and heights as before).

Source: <...>/ironport-complete/ironport-gallery-v3 (manifest.json + models/<slug>.gltf + .bin, flat; its glTFs name their textures as bare tex-*.png files).
Output: public/games/forth-horizon/ironport/models-v3/{generic,hero}/<slug>_lod0.gltf + <slug>_lod0.bin, named the way the game's loader already expects.
Textures are NOT copied here: region.ts maps every tex-*.png the models ask for onto the packed v3 texture set (pack_ironport_v3.py), or v1 when the texture switch says so.
Usage: python tools/pack_ironport_models_v3.py "<...>/ironport-gallery-v3"
"""
import json, os, shutil, sys

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "forth-horizon", "ironport", "models-v3")
man = json.load(open(os.path.join(SRC, "manifest.json")))
n = 0
for m in man["models"]:
    slug, kind = m["slug"], m["kind"]
    d = os.path.join(OUT, kind)
    os.makedirs(d, exist_ok=True)
    g = json.load(open(os.path.join(SRC, "models", slug + ".gltf"), encoding="utf8"))
    for b in g.get("buffers", []):
        shutil.copy(os.path.join(SRC, "models", b["uri"]), os.path.join(d, slug + "_lod0.bin"))
        b["uri"] = slug + "_lod0.bin"
    json.dump(g, open(os.path.join(d, slug + "_lod0.gltf"), "w", encoding="utf8"), separators=(",", ":"))
    n += 1
print("packed", n, "models into", os.path.normpath(OUT))
