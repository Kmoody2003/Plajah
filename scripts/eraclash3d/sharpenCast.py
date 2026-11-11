"""Crisper character close-ups: bake an unsharp mask and a touch of local contrast into each cast GLB's painted
colour (the paint came from ~600 px sheet crops, so it reads soft at arm's length). Only the base-colour image is
rewritten; geometry, rig, clips, roughness and normal maps are left as they are. The original is kept beside the
build intermediates (games/era-clash-3d/assets-src/<id>/<id>.orig.glb, on D: through the junction) and re-runs
always start from it, so sharpening never compounds.

  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/eraclash3d/sharpenCast.py [id ...]
"""
import io
import json
import os
import shutil
import struct
import sys

from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHARS = os.path.join(ROOT, 'public', 'games', 'era-clash', '3d', 'assets', 'characters')
SRC = os.path.join(ROOT, 'games', 'era-clash-3d', 'assets-src')
CAST = ['chieftain', 'raider', 'fisherman', 'carpenter', 'peasant', 'samurai', 'monk', 'knight', 'viking']


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, bytearray(b[o + 8:o + 8 + bl])


def write_glb(path, j, chunks):
    """chunks: list of bytes per bufferView index (rebuilt, 4-byte aligned)."""
    bin_ = bytearray()
    for i, data in enumerate(chunks):
        while len(bin_) % 4:
            bin_ += b'\0'
        bv = j['bufferViews'][i]
        bv['byteOffset'] = len(bin_)
        bv['byteLength'] = len(data)
        bin_ += data
    while len(bin_) % 4:
        bin_ += b'\0'
    j['buffers'][0]['byteLength'] = len(bin_)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    open(path, 'wb').write(out)


def sharpen(img):
    rgb = img.convert('RGB')
    # local contrast (a wide, gentle unsharp), then fine detail (a tight one)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=14, percent=28, threshold=0))
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.6, percent=135, threshold=2))
    return rgb


def process(cid):
    glb = os.path.join(CHARS, f'{cid}.glb')
    if not os.path.exists(glb):
        print(f'[{cid}] no model'); return
    keep = os.path.join(SRC, cid, f'{cid}.orig.glb')
    os.makedirs(os.path.dirname(keep), exist_ok=True)
    if not os.path.exists(keep):
        shutil.copyfile(glb, keep)
    j, bin_ = read_glb(keep)
    chunks = [bytes(bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]) for bv in j['bufferViews']]
    for m in j['materials']:
        t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if t is None:
            continue
        img = j['images'][j['textures'][t['index']]['source']]
        bvi = img['bufferView']
        src = Image.open(io.BytesIO(chunks[bvi]))
        out = io.BytesIO()
        sharpen(src).save(out, 'JPEG', quality=93, subsampling=0)
        img['mimeType'] = 'image/jpeg'
        chunks[bvi] = out.getvalue()
        print(f'[{cid}] base colour {src.size[0]}x{src.size[1]} sharpened', flush=True)
    write_glb(glb, j, chunks)


if __name__ == '__main__':
    for c in sys.argv[1:] or CAST:
        process(c)
