"""Score render_views.mjs output against the turnaround cut-outs (front/side/back RGBA PNGs).
  python scripts/riftrealm/score_views.py <renderDir> <refDir> <outDir>
Per view: both silhouettes are fitted to the same height, bottom-aligned and centred on their own bbox
(the model is scaled/translated only, never warped; the final sideways shift is the best-overlap one). Reports
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
        # translation only, chosen by best overlap: centring each figure on its own bbox let a prop (a dagger held
        # forward) shift the whole model sideways against the art
        # registration: uniform scale (±6 %, about the feet) and sideways shift chosen by best overlap — a helmet
        # crest or a held prop sizes/centres a bbox fit wrongly; the model is still never warped
        H0, W0 = b.shape[:2]; best, bdx, bs, bb = -1, 0, 1.0, b
        for sc in (0.94, 0.96, 0.98, 1.0, 1.02, 1.04, 1.06):
            bsc = cv2.resize(b, (int(W0 * sc), int(H0 * sc)), interpolation=cv2.INTER_AREA)
            c = np.zeros_like(b); ox = (W0 - bsc.shape[1]) // 2; oy = H0 - bsc.shape[0] - int((1 - sc) * H0 * 0.04)
            sx0, sy0 = max(0, -ox), max(0, -oy); dx0, dy0 = max(0, ox), max(0, oy)
            w_, h_ = min(W0 - dx0, bsc.shape[1] - sx0), min(H0 - dy0, bsc.shape[0] - sy0)
            c[dy0:dy0 + h_, dx0:dx0 + w_] = bsc[sy0:sy0 + h_, sx0:sx0 + w_]
            mc = c[:, :, 3] > 127
            for dx in range(-60, 61, 2):
                mbs = np.roll(mc, dx, axis=1); iou_ = (ma & mbs).sum() / (ma | mbs).sum()
                if iou_ > best: best, bdx, bs, bb = iou_, dx, sc, c
        b = np.roll(bb, bdx, axis=1); mb = b[:, :, 3] > 127
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



# ── wings view: the back with the cloak, sized and placed by the BODY (feet → hood top), not by the overall bbox ──
#   python scripts/riftrealm/score_views.py --wings <renderAll/back.png> <refBackWings.png> <outDir>
# The art's wing tips rise above the hood and its crop cuts the wings at the frame edges, so a bbox fit sized the
# two figures differently. Here both are scaled so feet→hood match, centred on the body, and compared only inside
# the art crop's own frame.
def body_frame(a):
    m = a[:, :, 3] > 127; ys, xs = np.nonzero(m); bot = ys.max()
    feet = xs[ys > bot - (bot - ys.min()) * 0.15]; cx = (feet.min() + feet.max()) / 2
    band = m[:, int(cx - m.shape[1] * 0.03):int(cx + m.shape[1] * 0.03) + 1]
    top = np.nonzero(band.any(1))[0].min()
    return cx, top, bot

def wings(render, ref, od):
    os.makedirs(od, exist_ok=True)
    A = np.array(Image.open(ref).convert('RGBA')); B = np.array(Image.open(render).convert('RGBA'))
    acx, atop, abot = body_frame(A); bcx, btop, bbot = body_frame(B)
    s = (abot - atop) / (bbot - btop)
    Bs = cv2.resize(B, (int(B.shape[1] * s), int(B.shape[0] * s)), interpolation=cv2.INTER_AREA)
    ox, oy = int(round(acx - bcx * s)), int(round(abot - bbot * s))
    C = np.zeros_like(A); H, W = A.shape[:2]
    y0, x0 = max(0, oy), max(0, ox); y1, x1 = min(H, oy + Bs.shape[0]), min(W, ox + Bs.shape[1])
    C[y0:y1, x0:x1] = Bs[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    best, bdx = -1, 0
    ma = A[:, :, 3] > 127
    for dx in range(-30, 31, 2):
        mb = np.roll(C[:, :, 3] > 127, dx, axis=1); i = (ma & mb).sum() / (ma | mb).sum()
        if i > best: best, bdx = i, dx
    C = np.roll(C, bdx, axis=1); mb = C[:, :, 3] > 127
    inter = ma & mb; iou = inter.sum() / (ma | mb).sum()
    Ab = cv2.GaussianBlur(A[:, :, :3], (0, 0), 4).astype(np.float32); Cb = cv2.GaussianBlur(C[:, :, :3], (0, 0), 4).astype(np.float32)
    col = 1 - np.abs(Ab - Cb).mean(2)[inter].mean() / 255
    res = dict(iou=round(float(iou), 3), colour=round(float(col), 3), score=round(float(0.6 * iou + 0.4 * col), 3))
    xor = np.zeros(A.shape[:2] + (3,), np.uint8); xor[ma & ~mb] = (255, 60, 60); xor[mb & ~ma] = (60, 120, 255); xor[inter] = (70, 70, 70)
    bg = lambda im: (im[:, :, :3] * (im[:, :, 3:4] / 255.) + np.array([40, 40, 48]) * (1 - im[:, :, 3:4] / 255.)).astype(np.uint8)
    Image.fromarray(np.hstack([bg(A), bg(C), xor])).save(f'{od}/wings_delta.png')
    json.dump(res, open(f'{od}/wings.json', 'w'), indent=1); print(json.dumps(res))


if __name__ == '__main__':
    if sys.argv[1] == '--wings': wings(*sys.argv[2:5])
    else: main(*sys.argv[1:4])
