"""Cut-out for subjects with pale / translucent parts (moth wings, bat membranes) on a white sheet.
U2-Net (rembg) leaves pale wings as haze and the shape generator then builds a sheet or a loose wing
(docs/argilla-3d-stack.md, "Why generated shapes came apart"). Here the alpha is the UNION of rembg and a
distance-from-background mask, holes filled, largest piece kept, so thin pale parts stay solid and attached.
  python cut_pale.py <sheet.jpg> <out.png> x0 y0 x1 y1 [--up 2] [--thr 14]"""
import argparse, os
import cv2, numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('sheet'); ap.add_argument('out'); ap.add_argument('box', type=int, nargs=4)
ap.add_argument('--up', type=int, default=2); ap.add_argument('--thr', type=float, default=14)
a = ap.parse_args()
os.environ['U2NET_HOME'] = r'D:\Plajah Models\u2net'
import rembg
im = Image.open(a.sheet).convert('RGB').crop(tuple(a.box))
im = im.resize((im.width * a.up, im.height * a.up), Image.LANCZOS)
rgb = np.array(im).astype(np.float32)
# background = the crop's border colour
border = np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3), rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)])
bg = np.median(border, 0)
dist = np.linalg.norm(rgb - bg, axis=2)
pale = (dist > a.thr).astype(np.uint8)
pale = cv2.morphologyEx(pale, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
sess = rembg.new_session('u2net', providers=['CPUExecutionProvider'])
ra = np.array(rembg.remove(im, session=sess).convert('RGBA'))[:, :, 3]
m = ((ra > 40) | (pale > 0)).astype(np.uint8)
# drop the floor shadow: soft grey blobs below the subject with low saturation and low contrast to the background
sat = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2HSV)[..., 1]
shadow = (dist < 45) & (sat < 18) & (ra < 40)
m[shadow] = 0
# fill holes, keep the largest connected piece
ff = m.copy(); h, w = ff.shape; mask = np.zeros((h + 2, w + 2), np.uint8); cv2.floodFill(ff, mask, (0, 0), 1)
m = m | (1 - ff)
n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
if n > 1: m = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
alpha = cv2.GaussianBlur(m.astype(np.float32) * 255, (3, 3), 0).astype(np.uint8)
Image.fromarray(np.dstack([np.array(im), alpha])).save(a.out)
prev = (np.array(im) * (alpha[..., None] / 255.) + np.array([255, 0, 255]) * (1 - alpha[..., None] / 255.)).astype(np.uint8)
Image.fromarray(prev).save(a.out.replace('.png', '_prev.png'))
print(a.out, im.size, 'subject %.1f%%' % (m.mean() * 100))
