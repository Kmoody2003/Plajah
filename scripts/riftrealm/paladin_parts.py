"""Robot Paladin finishing pass: art-projected cyan emissive + tech-lance (RightHand) + tower shield (LeftHand),
merged into the single skinned primitive (see rr_parts.py).
  python paladin_parts.py body.glb joints.json out.glb [--no-parts]
Cut-outs of the sheet's weapon/equipment insets are made with rembg on first run (lance_raw.png, shield_f_raw.png,
shield_b_raw.png in D:/rr_work/robot_paladin)."""
import argparse, json, os, sys
import cv2, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rr_parts import Rig, lens_card, unit  # noqa: E402

D = 'D:/rr_work/robot_paladin/'
CYAN = (160, 200)
_sess = None


def rembg_cut(box, up, out, rot=0.0):
    global _sess
    if not os.path.exists(out):
        import rembg
        os.environ['U2NET_HOME'] = r'D:\Plajah Models\u2net'
        _sess = _sess or rembg.new_session('u2net', providers=['CPUExecutionProvider'])
        im = Image.open(D + 'sheet.jpg').convert('RGB').crop(box)
        im = im.resize((im.width * up, im.height * up), Image.LANCZOS)
        if rot: im = im.rotate(rot, resample=Image.BICUBIC, expand=True, fillcolor=(12, 16, 20))
        rembg.remove(im, session=_sess).convert('RGBA').save(out)
    a = np.array(Image.open(out))
    m = (a[:, :, 3] > 110).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8); k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = lab == k
    inv = (~m).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 600: m[lab == i] = True
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    ys, xs = np.nonzero(m); a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy(); m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    a[:, :, 3] = (cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8) * 255).astype(np.uint8)
    return a, m


def glow(rgb, hue=CYAN, smin=0.3, vmin=0.45, gain=1.6):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    m = ((h >= hue[0]) & (h <= hue[1]) & (s >= smin) & (v >= vmin)).astype(np.float32)
    m = np.clip(cv2.GaussianBlur(m, (0, 0), 1.0) * 1.5, 0, 1)
    return (rgb.astype(np.float32) * m[..., None] * gain).clip(0, 255).astype(np.uint8)


def build_lance(rig, P, Htop):
    # inset: lance runs from the pommel (bottom-left) to the blade tip (top-right) at ~37 deg; rotate it upright
    a, m = rembg_cut((960, 30, 1376, 345), 2, D + 'lance_raw.png', rot=52.7)
    h, w = m.shape
    if m[: h // 3].sum() < m[-h // 3:].sum():          # blade (wide) must be at the top
        a, m = a[::-1].copy(), m[::-1].copy()
    hand, fore = np.array(P['RightHand']), np.array(P['RightForeArm'])
    f = unit(hand - fore)
    ax = unit(np.array([0.2 * np.sign(hand[0]), 1.0, 0.22]))   # upright, tilted forward and out (clears the pauldron)
    wd = unit(np.cross(ax, [0, 0, 1.0])); wd = wd if wd[0] > 0 else -wd   # broad face toward the front
    nn = unit(np.cross(wd, ax))
    G = hand + f * 0.075
    rows = np.nonzero(m.any(1))[0]
    # grip on the shaft at fraction g of the length from the tip; length so tip <= Htop - 0.05 and butt >= 0.03
    g = 0.58
    L = min((Htop - 0.05 - G[1]) / (g * ax[1]), (G[1] - 0.03) / ((1 - g) * ax[1]))
    k = L / h; yc = g * h
    xc = float(np.nonzero(m[int(yc)])[0].mean())
    def place(px, py, t):
        return G + np.outer((yc - py) * k, ax) + np.outer((px - xc) * k, wd) + np.outer(t, nn)
    def thick(d, px, py):
        return np.minimum(d * k * 0.75, 0.03)
    V, F, UV = lens_card(m, 9, place, thick, (w, h))
    rig.add_part('tech-lance', V, F, UV, 'RightHand', a, glow(a[:, :, :3]), rough=0.4, metal=0.85, rot90=True)
    return len(F), L


def build_shield(rig, P):
    af, mf = rembg_cut((982, 380, 1158, 698), 2, D + 'shield_f_raw.png')
    ab, mb = rembg_cut((1167, 380, 1343, 698), 2, D + 'shield_b_raw.png')
    h, w = mf.shape
    ab = cv2.resize(ab, (w, h), interpolation=cv2.INTER_AREA)[:, ::-1]   # back face, seen from behind
    hand, fore = np.array(P['LeftHand']), np.array(P['LeftForeArm'])
    f = unit(hand - fore)
    up = -f                                                            # shield top toward the elbow
    wd = np.array([0, 0, 1.0])                                         # width runs front-back
    out = unit(np.cross(up, wd)); out = out if out[0] > 0 else -out    # face points away from the body
    wd = unit(np.cross(out, up))
    Hs = 1.0; k = Hs / h
    C = fore + (hand - fore) * 0.72 + out * 0.07
    def place(px, py, t):
        u = (px - w / 2) * k; v = (h / 2 - py) * k
        bulge = 0.05 * (1 - (2 * u / (w * k)) ** 2)                    # cylindrical curve, convex outward
        return C + np.outer(v, up) + np.outer(u, wd) + np.outer(bulge + t, out)
    def thick(d, px, py):
        return np.minimum(d * k * 0.6, 0.022)
    V, F, UV = lens_card(mf, 13, place, thick, (w, h))
    n = len(V) // 2
    # front sheet uses the front image, back sheet the back image: pack both side by side in one texture
    tex = np.concatenate([af, ab], 0)                                  # stacked: front face over back face
    em = np.concatenate([glow(af[:, :, :3], (35, 60), 0.45, 0.55), glow(ab[:, :, :3], (35, 60), 0.45, 0.55)], 0)  # golden circuit glow
    UV = UV.copy(); UV[:, 1] *= 0.5; UV[n:, 1] += 0.5
    rig.add_part('tower shield', V, F, UV, 'LeftHand', tex, em, rough=0.45, metal=0.8)
    return len(F)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('joints'); ap.add_argument('out')
    ap.add_argument('--no-parts', action='store_true'); ap.add_argument('--room', type=float, default=0.85); a = ap.parse_args()
    P = json.load(open(a.joints))
    rig = Rig(a.glb)
    print(f'atlas free: {rig.free_space() * 100:.1f}%')
    if not a.no_parts: rig.make_room(a.room)
    rig.project_emissive({'front': D + 'front.png', 'back': D + 'back.png', 'left': D + 'side_r.png', 'right': D + 'side.png'},
                         CYAN, 0.3, 0.45, gain=1.5)
    if not a.no_parts:
        Htop = rig.V[:rig.nbody, 1].max()
        st = build_shield(rig, P); lt, L = build_lance(rig, P, Htop)
        print(f'lance tris {lt} (length {L:.2f}), shield tris {st}')
    rig.save(a.out)
    print('\n'.join(rig.log))


if __name__ == '__main__':
    main()
