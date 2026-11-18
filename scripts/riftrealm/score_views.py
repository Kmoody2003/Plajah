"""Score render_views.mjs output against the turnaround cut-outs (front/side/back RGBA PNGs).
  python scripts/riftrealm/score_views.py <renderDir> <refDir> <outDir>
Per view: both silhouettes are fitted to the same height, bottom-aligned and centred on their own bbox
(the model is scaled/translated only, never warped). Reports
  IoU        silhouette overlap
  colour     1 - mean |RGB delta| / 255 over the overlap, after both are blurred (sigma 4) so painted
             micro-detail doesn't dominate; and a mean-colour (hue/brightness) match of the whole figure
  colour_vs_flat  how much better than a flat fill (dark palettes make `colour` look generous)
  score      0.6 * IoU + 0.4 * colour   (the figure printed as the headline %)
and writes <view>_delta.png (ref | render | abs delta | silhouette XOR).
"""
import json, os, sys
import cv2, numpy as np
from PIL import Image

def bbox(a):
    ys, xs = np.nonzero(a > 127); return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def fit(img, H=900, W=600):
    a = np.array(img.convert('RGBA')); x0, y0, x1, y1 = bbox(a[:, :, 3]); c = a[y0:y1, x0:x1]
    s = (H * 0.92) / c.shape[0]
    c = cv2.resize(c, (max(1, int(c.shape[1] * s)), int(c.shape[0] * s)), interpolation=cv2.INTER_AREA)
    out = np.zeros((H, W, 4), np.uint8); ox = (W - c.shape[1]) // 2; oy = H - int(H * 0.04) - c.shape[0]
    xs0, xs1 = max(0, ox), min(W, ox + c.shape[1])
    out[oy:oy + c.shape[0], xs0:xs1] = c[:, xs0 - ox:xs1 - ox]
    return out

def main(rd, ref, od):
    os.makedirs(od, exist_ok=True); res = {}
    for v in ('front', 'side', 'back'):
        a = fit(Image.open(f'{ref}/{v}.png')); b = fit(Image.open(f'{rd}/{v}.png'))
        ma, mb = a[:, :, 3] > 127, b[:, :, 3] > 127
        inter, uni = (ma & mb), (ma | mb)
        iou = inter.sum() / uni.sum()
        A = cv2.GaussianBlur(a[:, :, :3], (0, 0), 4).astype(np.float32); B = cv2.GaussianBlur(b[:, :, :3], (0, 0), 4).astype(np.float32)
        d = np.abs(A - B).mean(2)
        col = 1 - d[inter].mean() / 255
        mean_a, mean_b = a[:, :, :3][ma].mean(0), b[:, :, :3][mb].mean(0)
        mc = 1 - np.abs(mean_a - mean_b).mean() / 255
        base = np.abs(A - A[ma].mean(0)).mean(2)[inter].mean()   # error of a flat fill in the figure's mean colour
        rel = max(0.0, 1 - d[inter].mean() / max(base, 1e-6))     # 1 = perfect, 0 = no better than a flat fill
        score = 0.6 * iou + 0.4 * col
        res[v] = dict(iou=round(float(iou), 3), colour=round(float(col), 3), colour_vs_flat=round(float(rel), 3), mean_colour=round(float(mc), 3), score=round(float(score), 3))
        dl = np.zeros(a.shape[:2] + (3,), np.uint8); dl[inter] = np.clip(d[inter, None] * 3, 0, 255).astype(np.uint8)
        xor = np.zeros_like(dl); xor[ma & ~mb] = (255, 60, 60); xor[mb & ~ma] = (60, 120, 255); xor[inter] = (70, 70, 70)
        bg = lambda im: (im[:, :, :3] * (im[:, :, 3:4] / 255.) + np.array([40, 40, 48]) * (1 - im[:, :, 3:4] / 255.)).astype(np.uint8)
        Image.fromarray(np.hstack([bg(a), bg(b), dl, xor])).save(f'{od}/{v}_delta.png')
    res['overall'] = round(float(np.mean([res[v]['score'] for v in ('front', 'side', 'back')])), 3)
    json.dump(res, open(f'{od}/scores.json', 'w'), indent=1); print(json.dumps(res))

if __name__ == '__main__':
    main(*sys.argv[1:4])
