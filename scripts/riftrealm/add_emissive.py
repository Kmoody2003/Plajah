"""Add an emissive map derived from the painted base colour: pixels whose hue falls in a glow band and are bright+saturated
(Void Stalker magenta runes: --hue 270-340; Paladin cyan: --hue 165-200). Everything else is black.
  python add_emissive.py in.glb out.glb --hue 270 340 [--vmin 0.45 --smin 0.35 --gain 1.0]"""
import argparse, io, os, sys
import cv2, numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ravencrest'))
from glbio import read_glb, buffer_view_bytes, write_glb

ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('out')
ap.add_argument('--hue', type=float, nargs=2, required=True); ap.add_argument('--vmin', type=float, default=0.45)
ap.add_argument('--smin', type=float, default=0.35); ap.add_argument('--gain', type=float, default=1.0)
a = ap.parse_args()
j, b = read_glb(a.glb)
mat = j['materials'][0]
bi = j['images'][j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]['bufferView']
img = np.array(Image.open(io.BytesIO(buffer_view_bytes(j, b, bi))).convert('RGB'))
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
h = hsv[..., 0] * 360 / 255; s = hsv[..., 1] / 255; v = hsv[..., 2] / 255
m = ((h >= a.hue[0]) & (h <= a.hue[1]) & (s >= a.smin) & (v >= a.vmin)).astype(np.float32)
m = cv2.GaussianBlur(m, (0, 0), 1.0)
em = np.clip(img.astype(np.float32) * m[..., None] * a.gain * 1.3, 0, 255).astype(np.uint8)
buf = io.BytesIO(); Image.fromarray(em).save(buf, format='JPEG', quality=90)
data = buf.getvalue(); off = len(b)
while len(b) % 4: b.append(0)
off = len(b); b += data
j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
j['images'].append({'bufferView': len(j['bufferViews']) - 1, 'mimeType': 'image/jpeg'})
j['textures'].append({'source': len(j['images']) - 1, 'sampler': 0})
mat['emissiveTexture'] = {'index': len(j['textures']) - 1}; mat['emissiveFactor'] = [1, 1, 1]
write_glb(a.out, j, b)
print(f'emissive: {(m > 0.5).mean() * 100:.2f}% of the atlas glows -> {a.out}')
