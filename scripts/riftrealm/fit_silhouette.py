"""Silhouette-driven fit of a raw shape to the turnaround art (run on shape_clean.glb BEFORE paint/rig).
The Hunyuan shape is built from the front cut-out only, so its depth (side view) and limb thickness drift from the
art. Per view a smooth 2D displacement field is solved in the scoring frame (score_views.fit: height-normalised,
bottom-aligned, bbox-centred): for each image row the model's silhouette run edges are mapped onto the art's run
edges (piecewise-linear when the run counts agree — arms vs torso — else outer edges only), blurred, clamped and
applied to every vertex at that (u, v) along the view's horizontal axis. front -> X, side -> Z. Iterated with damping.
  python fit_silhouette.py shape_clean.glb refDir out.glb [--side-flip] [--iters 3] [--damp 0.8] [--views front side]
refDir holds front.png / side.png RGBA cut-outs. --side-flip: the sheet's side view faces right (screen) -> mirror it,
since the camera at +X sees the model (facing +Z) facing screen-left."""
import argparse
import cv2, numpy as np, trimesh
from PIL import Image

H, W = 900, 600
AX = {'front': (np.array([1., 0, 0]), 0), 'side': (np.array([0, 0, -1.]), 2), 'back': (np.array([-1., 0, 0]), 0)}


def fit_ref(img):
    a = np.array(img.convert('RGBA')); ys, xs = np.nonzero(a[:, :, 3] > 127)
    c = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; s = (H * 0.92) / c.shape[0]
    c = cv2.resize(c, (max(1, int(c.shape[1] * s)), int(c.shape[0] * s)), interpolation=cv2.INTER_AREA)
    out = np.zeros((H, W, 4), np.uint8); ox = (W - c.shape[1]) // 2; oy = H - int(H * 0.04) - c.shape[0]
    x0, x1 = max(0, ox), min(W, ox + c.shape[1]); out[oy:oy + c.shape[0], x0:x1] = c[:, x0 - ox:x1 - ox]
    return out[:, :, 3] > 127


def frame(V, ax):
    u = V @ ax; v = V[:, 1]; s = (H * 0.92) / (v.max() - v.min())
    px = (W - (u.max() - u.min()) * s) / 2 + (u - u.min()) * s; py = (H - int(H * 0.04)) - (v - v.min()) * s
    return px, py, s


def raster(V, F, ax):
    px, py, s = frame(V, ax); P = np.stack([px, py], 1)
    m = np.zeros((H, W), np.uint8)
    tri = np.round(P[F] * 4).astype(np.int32)   # 2 bits sub-pixel
    cv2.fillPoly(m, list(tri), 1, lineType=cv2.LINE_8, shift=2)
    return m > 0, px, py, s


def runs(row, minlen=8):
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    st, en = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
    r = [(a, b) for a, b in zip(st, en) if b - a >= minlen]
    out = []                                   # merge tiny gaps
    for a, b in r:
        if out and a - out[-1][1] < 3: out[-1] = (out[-1][0], b)
        else: out.append((a, b))
    return out


def row_breaks(mr, rr, reach=25):
    """Edge correspondences for one row: every model run is matched to the art run it overlaps most (or the nearest
    within `reach` px). Model runs sharing one art run map as a group (outer edges -> the art run's edges, inner
    edges stay); model runs with no art counterpart (a hand hanging lower than in the art) stay put."""
    owner = []
    for a, b in mr:
        best, bi = -1e9, -1
        for k, (c, d) in enumerate(rr):
            ov = min(b, d) - max(a, c)
            if ov > best: best, bi = ov, k
        owner.append(bi if best > -reach else -1)
    mb, rb = [], []
    i = 0
    while i < len(mr):
        k = owner[i]; j = i
        while j + 1 < len(mr) and owner[j + 1] == k and k >= 0: j += 1
        if k < 0:
            for e in mr[i]: mb.append(e); rb.append(e)
        else:
            mb += [mr[i][0]]; rb += [rr[k][0]]
            for t in range(i, j):
                mb += [mr[t][1], mr[t + 1][0]]; rb += [mr[t][1], mr[t + 1][0]]
            mb += [mr[j][1]]; rb += [rr[k][1]]
        i = j + 1
    return np.array(mb, np.float32), np.array(rb, np.float32)


def field(M, R, clamp=40, grad=1.5):
    """Per row: piecewise edge mapping when the model and art have the same number of runs, else outer edges.
    Then rows are filled, the field's change from one row to the next is limited to `grad` px (row-to-row flips
    between the two mappings otherwise tear thin sheets out of the mesh) and it is blurred."""
    D = np.full((H, W), np.nan, np.float32); xs = np.arange(W, dtype=np.float32)
    for y in range(H):
        mr, rr = runs(M[y]), runs(R[y])
        if not mr or not rr: continue
        lo, hi = [], []
        if len(mr) != len(rr):
            # outer model runs that overlap no art run (a hand hanging lower than the art's) stay where they are
            ov = lambda r: any(min(r[1], d) > max(r[0], c) for c, d in rr)
            while len(mr) > 1 and not ov(mr[0]): lo += list(mr[0]); mr = mr[1:]
            while len(mr) > 1 and not ov(mr[-1]): hi = list(mr[-1]) + hi; mr = mr[:-1]
        if len(mr) == len(rr):
            mb = [e for p in mr for e in p]; rb = [e for p in rr for e in p]
        else:
            mb = [mr[0][0], mr[-1][1]]; rb = [rr[0][0], rr[-1][1]]
        mb = np.array(lo + mb + hi, np.float32); rb = np.array(lo + rb + hi, np.float32)
        D[y] = np.interp(xs, mb, rb - mb)
    ok = ~np.isnan(D[:, 0])
    if ok.sum() < 2: return np.zeros((H, W), np.float32)
    rows = np.arange(H)
    for x in range(W): D[:, x] = np.interp(rows, rows[ok], D[ok, x])
    D = np.clip(D, -clamp, clamp)
    for _ in range(2):                                   # slope limit, both directions, toward zero
        for y in range(1, H): D[y] = np.clip(D[y], D[y - 1] - grad, D[y - 1] + grad)
        for y in range(H - 2, -1, -1): D[y] = np.clip(D[y], D[y + 1] - grad, D[y + 1] + grad)
    D = cv2.GaussianBlur(D, (0, 0), sigmaX=3, sigmaY=5)
    return D


def iou(a, b): return (a & b).sum() / max(1, (a | b).sum())


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('mesh'); ap.add_argument('ref'); ap.add_argument('out')
    ap.add_argument('--side-flip', action='store_true'); ap.add_argument('--iters', type=int, default=3)
    ap.add_argument('--damp', type=float, default=0.8); ap.add_argument('--mesh-smooth', type=int, default=12)
    ap.add_argument('--views', nargs='+', default=['front', 'side'])
    a = ap.parse_args()
    m = trimesh.load(a.mesh, force='mesh'); V = m.vertices.copy(); F = m.faces
    from scipy.sparse import coo_matrix
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    Adj = coo_matrix((np.ones(len(e) * 2), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))),
                     shape=(len(V), len(V))).tocsr(); Adj.data[:] = 1
    deg = np.maximum(np.asarray(Adj.sum(1)).ravel(), 1)
    refs = {}
    for v in a.views:
        img = Image.open(f'{a.ref}/{v}.png')
        if v == 'side' and a.side_flip: img = img.transpose(Image.FLIP_LEFT_RIGHT)
        refs[v] = fit_ref(img)
    for it in range(a.iters + 1):
        msg = []
        for v in a.views:
            ax, k = AX[v]; M, px, py, s = raster(V, F, ax)
            msg.append(f'{v} IoU {iou(M, refs[v]):.3f}')
            if it == a.iters: continue
            D = field(M, refs[v])
            ix = np.clip(np.round(px).astype(int), 0, W - 1); iy = np.clip(np.round(py).astype(int), 0, H - 1)
            du = D[iy, ix] / s * a.damp            # px -> world units along the view's horizontal axis
            for _ in range(a.mesh_smooth):         # neighbour-average on the mesh: no spikes where run counts flip
                du = 0.5 * du + 0.5 * (Adj @ du) / deg
            V[:, k] += du * ax[k]
        print(f'[fit] iter {it}: ' + ', '.join(msg), flush=True)
    trimesh.Trimesh(V, F, process=False).export(a.out)
    print('[fit] wrote', a.out)


if __name__ == '__main__':
    main()
