"""
Game weight for the Plajah 3D district builds: assets-src/district/<id>/painted.glb (2048 PNG base colour / normal / ORM, ~16 MB) ->
public/games/forth-horizon/library/<id>.glb with each texture at 1024 as JPEG (~2-3 MB; the house budget is 1k/2k tiers, docs in game_dev_canon).
Geometry is left as built. Also writes library/index.json from tools/data/district_assets.json (the pieces that have a model and aren't rejected).

  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" games/forth-horizon/tools/district_game_glb.py [id ...]
"""
import io, json, os, sys

import pygltflib
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "assets-src", "district")
OUT = os.path.join(HERE, "..", "..", "..", "public", "games", "forth-horizon", "library")
SIZE = 2048   # hero buildings: the high tier's 2k (house budget 1k/2k)


def slim(src, dst):
    g = pygltflib.GLTF2().load(src)
    blob = bytearray(g.binary_blob())
    # rebuild the buffer: every bufferView copied in order, images re-encoded
    img_views = {im.bufferView: im for im in g.images if im.bufferView is not None}
    out = bytearray()
    for vi, bv in enumerate(g.bufferViews):
        data = bytes(blob[(bv.byteOffset or 0):(bv.byteOffset or 0) + bv.byteLength])
        if vi in img_views:
            im = Image.open(io.BytesIO(data))
            im = im.convert("RGB")
            if max(im.size) > SIZE:
                im = im.resize((SIZE, SIZE * im.height // im.width), Image.LANCZOS)
            b = io.BytesIO(); im.save(b, "JPEG", quality=88, optimize=True); data = b.getvalue()
            img_views[vi].mimeType = "image/jpeg"
        while len(out) % 4:
            out.append(0)
        bv.byteOffset = len(out); bv.byteLength = len(data)
        out += data
    g.buffers[0].byteLength = len(out)
    g.set_binary_blob(bytes(out))
    g.save_binary(dst)


def main():
    man = json.load(open(os.path.join(HERE, "data", "district_assets.json"), encoding="utf8"))
    only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    for a in man["assets"]:
        mv = os.path.join(r"D:\plajah-tmp\district", a["id"], "painted.glb")       # the multi-view build (tools/district_build_mv.py), when there is one
        src = mv if os.path.exists(mv) else os.path.join(SRC, a["id"], "painted.glb")
        if (only and a["id"] not in only) or not os.path.exists(src):
            continue
        dst = os.path.join(OUT, a["id"] + ".glb")
        slim(src, dst)
        print(a["id"], round(os.path.getsize(src) / 1e6, 1), "MB ->", round(os.path.getsize(dst) / 1e6, 1), "MB")
    pieces = [{"id": a["id"], "lib": a["lib"], "size": a["size"]} for a in man["assets"]
              if os.path.exists(os.path.join(OUT, a["id"] + ".glb")) and not a.get("rejected")]
    json.dump({"pieces": pieces}, open(os.path.join(OUT, "index.json"), "w"), indent=1)
    print("index:", len(pieces), "pieces")


if __name__ == "__main__":
    main()
