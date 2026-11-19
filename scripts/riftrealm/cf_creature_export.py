"""Cyber Forest creatures: painted GLB -> game GLB. Adds an emissive map from several glow hue bands of the painted
base colour (the sheets' bio-light), re-encodes every image as JPEG (q85) to keep the files small.
  python cf_creature_export.py in.glb out.glb --band 180 215 --band 50 70 [--vmin 0.5 --smin 0.35 --gain 1.2]"""
import argparse, io, os, sys
import cv2, numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ravencrest'))
from glbio import read_glb, buffer_view_bytes, write_glb

ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('out')
ap.add_argument('--band', type=float, nargs=2, action='append', required=True)
ap.add_argument('--vmin', type=float, default=0.5); ap.add_argument('--smin', type=float, default=0.35); ap.add_argument('--gain', type=float, default=1.2)
a = ap.parse_args()
j, b = read_glb(a.glb)
imgs = [buffer_view_bytes(j, b, im['bufferView']) for im in j['images']]
mat = j['materials'][0]
base = np.array(Image.open(io.BytesIO(imgs[j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']])).convert('RGB'))
hsv = cv2.cvtColor(base, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
h = hsv[..., 0] * 360 / 255; s = hsv[..., 1] / 255; v = hsv[..., 2] / 255
m = np.zeros(h.shape, np.float32)
for lo, hi in a.band: m = np.maximum(m, ((h >= lo) & (h <= hi) & (s >= a.smin) & (v >= a.vmin)).astype(np.float32))
m = cv2.GaussianBlur(m, (0, 0), 1.0) * np.clip((v - a.vmin) / (1 - a.vmin + 1e-6) * 1.5 + 0.3, 0, 1)
em = np.clip(base.astype(np.float32) * m[..., None] * a.gain, 0, 255).astype(np.uint8)
def jpg(arr_or_bytes, q=85):
    im = Image.open(io.BytesIO(arr_or_bytes)) if isinstance(arr_or_bytes, bytes) else Image.fromarray(arr_or_bytes)
    o = io.BytesIO(); im.convert('RGB').save(o, format='JPEG', quality=q); return o.getvalue()
datas = [jpg(x) for x in imgs] + [jpg(em)]
# rebuild the binary: geometry buffer views first, then the images
geo_views = [i for i, bv in enumerate(j['bufferViews']) if i not in {im['bufferView'] for im in j['images']}]
nb = bytearray(); remap = {}
for i in geo_views:
    bv = j['bufferViews'][i]; raw = buffer_view_bytes(j, b, i)
    while len(nb) % 4: nb.append(0)
    bv['byteOffset'] = len(nb); nb += raw; bv['buffer'] = 0
for k, d in enumerate(datas):
    while len(nb) % 4: nb.append(0)
    if k < len(j['images']):
        bvi = j['images'][k]['bufferView']
    else:
        j['bufferViews'].append({'buffer': 0}); bvi = len(j['bufferViews']) - 1
        j['images'].append({'bufferView': bvi}); j['textures'].append({'source': len(j['images']) - 1, 'sampler': 0})
        mat['emissiveTexture'] = {'index': len(j['textures']) - 1}; mat['emissiveFactor'] = [1, 1, 1]
    j['bufferViews'][bvi].update({'byteOffset': len(nb), 'byteLength': len(d)}); j['bufferViews'][bvi].pop('byteStride', None)
    j['images'][k]['mimeType'] = 'image/jpeg'; nb += d
j['buffers'] = [{'byteLength': len(nb)}]
write_glb(a.out, j, nb)
print(f'{a.out}: glow {(m > 0.5).mean() * 100:.1f}% of atlas, {len(nb) / 1e6:.2f} MB')
