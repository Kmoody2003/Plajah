"""Void Stalker finishing pass: art-projected magenta emissive + torn bat-wing cloak (Spine2) + twin curved daggers
(LeftHand / RightHand), merged into the single skinned primitive (see rr_parts.py).
  python vs_parts.py body.glb joints.json out.glb [--no-parts]
Inputs from D:/rr_work/void_stalker: sheet.jpg, front.png, back_body.png, side.png, side_r.png, wing_alpha_full.png,
wing_mirror_x.txt (vs_masks.py), dagger_raw.png (rembg of the weapon inset, made on first run)."""
import argparse, json, os, sys
import cv2, numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rr_parts import Rig, lens_card, grid_sheet, unit, vertex_normals  # noqa: E402

D = 'D:/rr_work/void_stalker/'
MAG = (268, 340)


def magenta(rgb, smin=0.3, vmin=0.3):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    return ((h >= MAG[0]) & (h <= MAG[1]) & (s >= smin) & (v >= vmin)).astype(np.float32)


def build_wings(rig, P, full=False):
    sheet = np.array(Image.open(D + 'sheet.jpg').convert('RGB'))
    wa = np.array(Image.open(D + 'wing_alpha_full.png')) > 127
    cxs = float(open(D + 'wing_mirror_x.txt').read())
    bb = np.array(Image.open(D + 'back_body.png'))[:, :, 3] > 127
    ys = np.nonzero(bb.any(1))[0]; yt, yb = 55 + ys.min() / 2, 55 + ys.max() / 2       # back body top/bottom, sheet px
    Vb = rig.V[:rig.nbody]; Hb = Vb[:, 1].max(); k = Hb / (yb - yt)                   # world units per sheet px
    yx, xx = np.nonzero(wa); x0, x1, y0, y1 = xx.min() - 2, xx.max() + 3, yx.min() - 2, yx.max() + 3
    UP = 2                                                                             # texture upsample
    crop = cv2.resize(sheet[y0:y1, x0:x1], ((x1 - x0) * UP, (y1 - y0) * UP), interpolation=cv2.INTER_LANCZOS4)
    am = cv2.resize(cv2.GaussianBlur(wa[y0:y1, x0:x1].astype(np.float32), (0, 0), 0.7), ((x1 - x0) * UP, (y1 - y0) * UP), interpolation=cv2.INTER_LINEAR)
    # membrane colour: the art's smoke, a touch darker so the alpha-cut fringe doesn't carry fog
    lum = crop.astype(np.float32).mean(2, keepdims=True)                              # smoke: drop the fog-blue cast, darken
    rgb = (0.55 * lum + 0.2 * crop.astype(np.float32) + np.array([4, 2, 8.])).clip(0, 255).astype(np.uint8)
    mg = magenta(crop, 0.25, 0.28)
    mg = np.clip(cv2.GaussianBlur(mg, (0, 0), 1.0) * 1.6, 0, 1)
    rgb = np.where(mg[..., None] > 0.3, crop, rgb)
    emis = (crop.astype(np.float32) * mg[..., None] * 1.6).clip(0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, (np.clip(am, 0, 1) * 255).astype(np.uint8)])
    # body depth maps seen from the back (1 cm cells)
    cs = 0.01; gx0, gy0 = -1.2, -0.05; GW, GH = 240, int((Hb + 0.2) / cs)
    gi = np.clip(((Vb[:, 0] - gx0) / cs).astype(int), 0, GW - 1); gj = np.clip(((Vb[:, 1] - gy0) / cs).astype(int), 0, GH - 1)
    zmin = np.full((GH, GW), np.inf); zmax = np.full((GH, GW), -np.inf)
    np.minimum.at(zmin, (gj, gi), Vb[:, 2]); np.maximum.at(zmax, (gj, gi), Vb[:, 2])
    has = np.isfinite(zmin)
    sil = cv2.morphologyEx(has.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    _, (ni, nj) = distance_transform_edt(~has, return_indices=True)
    zmin_f, zmax_f = zmin[ni, nj], zmax[ni, nj]
    dout = distance_transform_edt(~sil) * cs
    zin = np.minimum(zmin_f + 0.035, (zmin_f + zmax_f) / 2)
    zfield = np.where(sil, zin, zmin_f + 0.035 - 0.55 * dout)
    zfield = cv2.GaussianBlur(zfield.astype(np.float32), (0, 0), 2.0)
    # grid in the crop (texture px)
    pts, F = grid_sheet(am > 0.5, cell=11, keep_dilate=3)
    sx = x0 + pts[:, 0] / UP; sy = y0 + pts[:, 1] / UP                                   # sheet px
    X = -(sx - cxs) * k; Y = (yb - sy) * k
    yroot = P['Spine2'][1]; top = Hb - 0.05
    if Y.max() > top and not full:                                                     # old: stay under the head top (the game sized by bbox height; --full-wings now that it sizes by the body)
        kk = (top - yroot) / (Y.max() - yroot); Y = np.where(Y > yroot, yroot + (Y - yroot) * kk, Y)
    def zat(Xa, Ya):
        i = np.clip(((Xa - gx0) / cs).astype(int), 0, GW - 1); jj = np.clip(((Ya - gy0) / cs).astype(int), 0, GH - 1)
        return zfield[jj, i]
    VL = np.stack([X, Y, zat(X, Y)], 1)
    VR = np.stack([-X, Y, zat(-X, Y)], 1)
    UV = np.stack([pts[:, 0] / am.shape[1], pts[:, 1] / am.shape[0]], 1)
    n = len(pts)
    V = np.vstack([VL, VR]); FF = np.vstack([F, F[:, ::-1] + n]); UVV = np.vstack([UV, UV])
    rig.add_part('wing cloak', V, FF, UVV, 'Spine2', rgba, emis, rough=0.85, metal=0.0)
    return len(FF)


def dagger_cutout():
    p = D + 'dagger_raw.png'
    if not os.path.exists(p):
        import rembg
        os.environ['U2NET_HOME'] = r'D:\Plajah Models\u2net'
        sess = rembg.new_session('u2net', providers=['CPUExecutionProvider'])
        im = Image.open(D + 'sheet.jpg').convert('RGB').crop((1252, 322, 1342, 620))
        im = im.resize((im.width * 3, im.height * 3), Image.LANCZOS)
        rembg.remove(im, session=sess).convert('RGBA').save(p)
    a = np.array(Image.open(p))
    m = (a[:, :, 3] > 100).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8); kk = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = (lab == kk)
    inv = (~m).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 400: m[lab == i] = True
    ys, xs = np.nonzero(m); a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy(); m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    a[:, :, 3] = (cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8) * 255).astype(np.uint8)
    return a, m


def build_daggers(rig, P):
    a, m = dagger_cutout()
    h, w = m.shape
    mg = np.clip(cv2.GaussianBlur(magenta(a[:, :, :3], 0.25, 0.3), (0, 0), 1.2) * 1.5, 0, 1)
    emis = (a[:, :, :3].astype(np.float32) * mg[..., None] * 1.7).clip(0, 255).astype(np.uint8)
    rgba = a.copy()
    L = 0.40; k = L / h                                       # dagger length (wielding art: blade ~ hand-length)
    rows = np.nonzero(m.any(1))[0]
    yc = int(h * 0.80); xc = float(np.nonzero(m[yc])[0].mean())   # handle centre (grip)
    widths = m.sum(1); guard = int(np.argmax(widths[int(h * 0.45):int(h * 0.75)]) + int(h * 0.45))
    tot = 0
    for side in ('Left', 'Right'):
        hand, fore = np.array(P[side + 'Hand']), np.array(P[side + 'ForeArm'])
        f = unit(hand - fore)
        a_ax = unit(np.array([0, 0, 1.0]) - np.dot([0, 0, 1.0], f) * f)   # forward grip: blade out of the fist, forward
        n_ax = unit(np.cross(a_ax, f))
        G = hand + f * 0.075
        def place(px, py, t, G=G, f=f, a_ax=a_ax, n_ax=n_ax):
            return G + np.outer((yc - py) * k, a_ax) + np.outer((px - xc) * k, f) + np.outer(t, n_ax)
        def thick(d, px, py):
            cap = np.where(py > guard, 0.012, 0.0055)            # handle rounder than the blade
            return np.minimum(d * k * 0.9, cap)
        V, F, UV = lens_card(m, 10, place, thick, (w, h))
        rig.add_part(f'{side} dagger', V, F, UV, side + 'Hand', rgba, emis, rough=0.35, metal=0.85)
        tot += len(F)
    return tot


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('joints'); ap.add_argument('out')
    ap.add_argument('--no-parts', action='store_true'); ap.add_argument('--room', type=float, default=0.85)
    ap.add_argument('--full-wings', action='store_true', help='wings as high as the art (the game sizes characters by the body)'); a = ap.parse_args()
    P = json.load(open(a.joints))
    rig = Rig(a.glb)
    print(f'atlas free: {rig.free_space() * 100:.1f}%')
    if not a.no_parts: rig.make_room(a.room)
    rig.project_emissive({'front': D + 'front.png', 'back': D + 'back_body.png', 'left': D + 'side.png', 'right': D + 'side_r.png'},
                         MAG, 0.28, 0.28, gain=1.6)
    if not a.no_parts:
        wt = build_wings(rig, P, a.full_wings); dt = build_daggers(rig, P)
        print(f'wing tris {wt}, dagger tris {dt}')
    rig.save(a.out)
    print('\n'.join(rig.log))


if __name__ == '__main__':
    main()
