"""Void Stalker back-view masks (run once; writes into D:/rr_work/void_stalker):
  back_body.png   back cut-out whose upper body comes from the mirrored, aligned FRONT silhouette (the hand polygon in
                  clean_vs.py let fog + wing roots in between the arms / beside the hood, which got painted on)
  wing_alpha.png  sheet-sized (1376x768) membrane alpha of the bat-wing cloak: darker-than-local-fog or magenta
                  pixels inside the wing zone, minus the body, minus the weapon inset
  wing_emi.png    sheet-sized magenta lightning mask (emissive)
  back_wings.png  scoring reference: back crop widened to the wings (sheet x 590..1360, y 25..700, 2x), alpha = body | wings
"""
import cv2, numpy as np
from PIL import Image
D = 'D:/rr_work/void_stalker/'
sheet = np.array(Image.open(D + 'sheet.jpg').convert('RGB'))
SH, SW = sheet.shape[:2]

# ---- back body from mirrored front --------------------------------------------------------------
fa = np.array(Image.open(D + 'front.png'))[:, :, 3] > 127
braw = np.array(Image.open(D + 'back_raw.png'))[:, :, 3] > 127
back = np.array(Image.open(D + 'back.png'))
H, W = fa.shape
fm = fa[:, ::-1].astype(np.uint8)
LOW = 760                                    # crop rows below the wing/shoulder zone (rembg is fine there)
best = (-1, 0, 0, 1)
for s in np.linspace(0.96, 1.04, 9):
    M = cv2.warpAffine(fm, np.float32([[s, 0, 0], [0, s, 0]]), (W, H), flags=cv2.INTER_NEAREST)
    for dx in range(-40, 41, 2):
        for dy in range(-60, 61, 2):
            T = np.roll(np.roll(M, dy, 0), dx, 1) > 0
            a, b = T[LOW:], braw[LOW:]
            iou = (a & b).sum() / max(1, (a | b).sum())
            if iou > best[0]: best = (iou, dx, dy, s)
iou, dx, dy, s = best
M = cv2.warpAffine(fm, np.float32([[s, 0, 0], [0, s, 0]]), (W, H), flags=cv2.INTER_NEAREST)
T = np.roll(np.roll(M, dy, 0), dx, 1) > 0
print(f'mirrored front -> back: IoU(low) {iou:.3f} dx {dx} dy {dy} s {s:.2f}')
al = np.where(np.arange(H)[:, None] < LOW, T, back[:, :, 3] > 127)
al = cv2.morphologyEx(al.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
nb = back.copy(); nb[:, :, 3] = np.where(al, 255, 0)
Image.fromarray(nb).save(D + 'back_body.png')

# body mask in sheet coords (crop origin 780,55, 2x)
body_sheet = np.zeros((SH, SW), np.uint8)
small = cv2.resize(al.astype(np.uint8), (W // 2, H // 2), interpolation=cv2.INTER_NEAREST)
body_sheet[55:55 + H // 2, 780:780 + W // 2] = small

# ---- wings -------------------------------------------------------------------------------------
L = cv2.cvtColor(sheet, cv2.COLOR_RGB2GRAY).astype(np.float32)
bg = cv2.morphologyEx(L, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
bg = cv2.GaussianBlur(np.maximum(bg, L), (0, 0), 6)
dark = np.clip((bg - L) / np.maximum(bg, 25) * 3.2, 0, 1)
hsv = cv2.cvtColor(sheet, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
h, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
mag = ((h >= 270) & (h <= 335) & (sat > 0.28) & (val > 0.32)).astype(np.float32)
zone = np.zeros((SH, SW), np.uint8)
# LEFT wing only (right wing sits on dark forest background -> unusable); the right wing is its mirror about the body
cv2.fillPoly(zone, [np.array([(612, 62), (690, 30), (790, 40), (880, 120), (912, 200), (912, 300), (840, 300),
                              (770, 262), (700, 225), (652, 200), (642, 150), (640, 90)], np.int32)], 1)
w = np.maximum(dark, mag) * zone
w = cv2.GaussianBlur(w, (0, 0), 0.8)
wa = (w > 0.30).astype(np.uint8)
wa = cv2.morphologyEx(wa, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
n, lab, st, _ = cv2.connectedComponentsWithStats(wa, 8)       # drop specks
keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] > 80
wa = keep[lab].astype(np.uint8)
inv = (1 - wa).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)   # fill pin-holes
small_h = np.zeros(n, bool); small_h[1:] = st[1:, cv2.CC_STAT_AREA] < 120
wa[small_h[lab]] = 1
body_d = cv2.dilate(body_sheet, np.ones((3, 3), np.uint8))
Image.fromarray(wa * 255).save(D + 'wing_alpha_full.png')   # roots run under the body (hidden inside it in 3D)
wa[body_d > 0] = 0
# body centre (sheet x) from the back body mask, for the mirror
ys, xs = np.nonzero(body_sheet[60:300]); cxs = float(np.median(xs))
mir = lambda im: cv2.warpAffine(im, np.float32([[-1, 0, 2 * cxs], [0, 1, 0]]), (SW, SH), flags=cv2.INTER_NEAREST)
wa_full = np.maximum(wa, mir(wa)); wa_full[body_d > 0] = 0
Image.fromarray(wa * 255).save(D + 'wing_alpha.png')
em = (mag * zone * (1 - body_d)).astype(np.float32)
Image.fromarray((np.clip(cv2.GaussianBlur(em, (0, 0), 0.7) * 1.5, 0, 1) * 255).astype(np.uint8)).save(D + 'wing_emi.png')
open(D + 'wing_mirror_x.txt', 'w').write(str(cxs))
print(f'wing alpha px {wa.sum()}, magenta px {int((em > 0).sum())}, mirror x {cxs:.1f}')
wa = wa_full

# ---- scoring reference with wings ------------------------------------------------------------------
x0, y0, x1, y1 = 590, 25, 1360, 700
crop = cv2.resize(sheet[y0:y1, x0:x1], ((x1 - x0) * 2, (y1 - y0) * 2), interpolation=cv2.INTER_LANCZOS4)
A = np.zeros(((y1 - y0) * 2, (x1 - x0) * 2), np.uint8)
A[(55 - y0) * 2:(55 - y0) * 2 + H, (780 - x0) * 2:(780 - x0) * 2 + W] = al * 255
wa2 = cv2.resize(wa[y0:y1, x0:x1] * 255, ((x1 - x0) * 2, (y1 - y0) * 2), interpolation=cv2.INTER_LINEAR)
A = np.maximum(A, (wa2 > 127) * 255).astype(np.uint8)
Image.fromarray(np.dstack([crop, A])).save(D + 'back_wings.png')
prev = (crop * (A[..., None] / 255.) + np.array([255, 0, 255]) * (1 - A[..., None] / 255.)).astype(np.uint8)
Image.fromarray(prev).resize((x1 - x0, y1 - y0)).save(D + 'back_wings_prev.png')
