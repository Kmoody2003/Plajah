"""Shared helpers for the Elderwood creature rigs: load a creature GLB, render orthographic guide views."""
import os, sys, json
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'ravencrest'))
from glbio import read_glb, accessor, write_glb  # noqa
CREATURES = os.path.join(ROOT, 'public', 'games', 'rift-realm', 'assets', 'creatures')
FILES = {'wolf': 'electric_wolf', 'mantis': 'venom_mantis', 'wasp': 'plasma_wasp', 'bat': 'storm_bat', 'deer': 'lumen_deer', 'moth': 'glow_moth'}

def src_path(kind):
    """The unrigged source mesh: kept next to the work dir so re-rigging never reads its own output."""
    keep = os.path.join('D:/rr_work/creatures/src', FILES[kind] + '.glb')
    if not os.path.exists(keep):
        os.makedirs(os.path.dirname(keep), exist_ok=True)
        import shutil; shutil.copy(os.path.join(CREATURES, FILES[kind] + '.glb'), keep)
    return keep

def load(kind):
    j, b = read_glb(src_path(kind))
    p = j['meshes'][0]['primitives'][0]
    V = accessor(j, b, p['attributes']['POSITION']).astype(np.float64)
    F = accessor(j, b, p['indices']).reshape(-1, 3).astype(np.int64)
    return j, b, V, F

# view: name -> (horizontal axis, sign, vertical axis, depth axis, depth sign toward camera)
VIEWS = {'side': (2, 1, 1, 0, 1), 'front': (0, -1, 1, 2, 1), 'back': (0, 1, 1, 2, -1), 'top': (0, -1, 2, 1, 1), 'sideL': (2, -1, 1, 0, -1)}

def render(V, F, view, size=900, pad=0.06, colors=None, bounds=None):
    h, hs, v, d, ds = VIEWS[view]
    lo = V.min(0) if bounds is None else bounds[0]; hi = V.max(0) if bounds is None else bounds[1]
    span = max(hi[h] - lo[h], hi[v] - lo[v]) * (1 + 2 * pad)
    k = size / span; ch = (lo[h] + hi[h]) / 2; cv = (lo[v] + hi[v]) / 2
    def px(P):
        return np.stack([size / 2 + (P[..., h] - ch) * hs * k, size / 2 - (P[..., v] - cv) * k], -1)
    img = np.full((size, size, 3), 30, np.uint8)
    T = V[F]; n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    light = np.array([0.3, 0.8, 0.5]); light /= np.linalg.norm(light)
    sh = np.clip(np.abs(n @ light), 0.15, 1)
    order = np.argsort(T[:, :, d].mean(1) * ds)
    P2 = px(T)
    for i in order:
        c = (colors[F[i]].mean(0) if colors is not None else np.array([200, 200, 200])) * sh[i]
        cv2.fillConvexPoly(img, np.round(P2[i] * 4).astype(np.int32), tuple(int(x) for x in c), lineType=cv2.LINE_AA, shift=2)
    return img, px

def grid(img, px, V, view, step=0.1):
    h, hs, v, d, ds = VIEWS[view]
    lo, hi = V.min(0), V.max(0)
    for val in np.arange(np.floor(lo[h] / step) * step, hi[h] + step, step):
        P = np.zeros((1, 3)); P[0, h] = val; x = int(px(P)[0, 0])
        cv2.line(img, (x, 0), (x, img.shape[0]), (70, 70, 120) if abs(val) > 1e-6 else (60, 60, 220), 1)
        cv2.putText(img, f'{val:.1f}', (x + 2, 12), 0, 0.35, (150, 150, 255), 1)
    for val in np.arange(np.floor(lo[v] / step) * step, hi[v] + step, step):
        P = np.zeros((1, 3)); P[0, v] = val; y = int(px(P)[0, 1])
        cv2.line(img, (0, y), (img.shape[1], y), (70, 120, 70), 1)
        cv2.putText(img, f'{val:.1f}', (2, y - 2), 0, 0.35, (150, 255, 150), 1)
    return img
