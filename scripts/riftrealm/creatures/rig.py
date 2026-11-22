"""Fit a skeleton (specs.py) to an Elderwood creature mesh, skin it, and write a rigged GLB with its clips.

  python rig.py wolf [--check]         fit + weights + overlay renders (D:/rr_work/creatures/rig_<kind>_*.jpg)
  python rig.py wolf --write           also bake clips (clips.py) and write public/.../creatures/rigged/<file>.glb

Weights: geodesic (along the surface, not through the air) from seed vertices around each bone's segment, so a leg
never pulls the belly it merely sits next to; left bones only reach the left side, right bones the right. Shells with
no seed (loose spikes, fur cards) take the nearest bone segment by straight-line distance. Top 4 influences, smoothed
over the surface graph. The original mesh, its UVs, textures and materials are kept byte for byte; only the skin
(JOINTS_0 / WEIGHTS_0), the joint nodes and the animations are added.
"""
import argparse, json, os, struct
import numpy as np, cv2
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
from crlib import load, render, grid, CREATURES, FILES, VIEWS
from specs import expand, SPECS

WORK = 'D:/rr_work/creatures'


def weld(V, F):
    key = np.round(V / 1e-5).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True); w = w.ravel()
    Vw = np.zeros((w.max() + 1, 3)); Vw[w] = V
    T = w[F]; e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]); e = e[e[:, 0] != e[:, 1]]
    d = np.linalg.norm(Vw[e[:, 0]] - Vw[e[:, 1]], axis=1)
    n = len(Vw)
    G = coo_matrix((np.concatenate([d, d]), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(n, n)).tocsr()
    return w, Vw, G, e


def fit(kind, V):
    J = expand(kind)
    pos = {n: np.array(p, float) for n, _, p, _ in J}
    for n, par, p, o in J:
        if o.get('fit') != 'limb':
            continue
        side = np.sign(p[0])
        for rad in (0.02, 0.035, 0.05):
            m = (np.abs(V[:, 1] - p[1]) < rad) & (V[:, 0] * side > 0.02) & (np.abs(V[:, 2] - p[2]) < 0.12) & (np.abs(V[:, 0] - p[0]) < 0.14)
            if m.sum() >= 12:
                c = V[m].mean(0); pos[n] = np.array([c[0], p[1], c[2]]); break
    return J, pos


def segments(J, pos):
    kids = {}
    for n, par, _, _ in J:
        if par: kids.setdefault(par, []).append(n)
    seg = {}
    for n, par, _, o in J:
        if 'tip' in o: t = np.array(o['tip'], float)
        elif n in kids: t = pos[kids[n][0]]
        else: t = pos[n] + np.array([0, 0.01, 0])
        seg[n] = (pos[n], t)
    return seg


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def skin(kind, V, F, J, pos, power=3.0, smooth=3):
    w, Vw, G, e = weld(V, F)
    names = [n for n, *_ in J]
    opts = {n: o for n, _, _, o in J}
    seg = segments(J, pos)
    H = V[:, 1].max()
    eps = 0.015 * H
    nb = len(names); nw = len(Vw)
    D = np.full((nw, nb), np.inf)
    E = np.zeros((nw, nb))
    skip = {'root'}
    for i, n in enumerate(names):
        a, b = seg[n]
        d3 = seg_dist(Vw, a, b); E[:, i] = d3
        if n in skip:
            continue
        side = 1 if n.startswith('L_') else -1 if n.startswith('R_') else 0
        okside = np.ones(nw, bool) if side == 0 else (Vw[:, 0] * side > -0.01)
        r = opts[n].get('r', 0.04 * H / 2)
        seeds = np.nonzero((d3 < r) & okside)[0]
        k = 0
        while len(seeds) < 6 and k < 6:
            r *= 1.5; k += 1; seeds = np.nonzero((d3 < r) & okside)[0]
        if len(seeds) == 0:
            continue
        dd = dijkstra(G, indices=seeds, min_only=True)
        dd[~okside] = np.inf
        # a vertex sitting right on the segment but reached the long way round still belongs to it a little
        D[:, i] = np.minimum(dd + d3 * 0.25, np.where(okside, d3 * 3 + 0.1 * H, np.inf))
    D[:, names.index('root')] = np.inf
    # shells no seed reached (loose spikes, fur cards): straight-line distance to the segments
    lost = ~np.isfinite(D).any(1)
    if lost.any():
        Ei = E.copy(); Ei[:, names.index('root')] = np.inf
        D[lost] = Ei[lost] * 1.0
    W = 1.0 / (D + eps) ** power
    W[~np.isfinite(D)] = 0
    for nme, o in opts.items():
        pass
    # smooth over the surface graph (keeps left/right apart: the gate is re-applied)
    A = (G > 0).astype(float); deg = np.asarray(A.sum(1)).ravel() + 1
    gate = np.isfinite(D)
    W = W / (W.sum(1, keepdims=True) + 1e-12)
    for _ in range(smooth):
        W = (A @ W + W) / deg[:, None]
        W[~gate] = 0
        W = W / (W.sum(1, keepdims=True) + 1e-12)
    # top 4
    idx = np.argsort(-W, axis=1)[:, :4]
    top = np.take_along_axis(W, idx, 1)
    top[top < 0.02] = 0
    top = top / (top.sum(1, keepdims=True) + 1e-12)
    return idx[w].astype(np.uint16), top[w].astype(np.float32), names


# ── linear blend skinning for checks ──────────────────────────────────────────────────────────────────────────
def quat_from_euler(ex, ey, ez):
    """XYZ euler (degrees, applied X then Y then Z in the parent frame) → quaternion [x, y, z, w]."""
    hx, hy, hz = np.radians([ex, ey, ez]) / 2
    cx, sx, cy, sy, cz, sz = np.cos(hx), np.sin(hx), np.cos(hy), np.sin(hy), np.cos(hz), np.sin(hz)
    # three.js 'XYZ' order: q = qx * qy * qz
    return np.array([sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz])


def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def pose_world(J, pos, rot, trans=None):
    """rot: {bone: quat}, trans: {bone: offset}. Returns {bone: (R 3x3, t)} world transforms (rest = identity)."""
    out = {}
    for n, par, _, _ in J:
        R = qmat(rot[n]) if n in rot else np.eye(3)
        local_t = pos[n] - (pos[par] if par else 0) + (trans.get(n, 0) if trans else 0)
        if par:
            PR, Pt = out[par]; out[n] = (PR @ R, PR @ local_t + Pt)
        else:
            out[n] = (R, local_t)
    return out


def lbs(V, idx, wt, names, J, pos, world):
    out = np.zeros_like(V)
    for k in range(4):
        for i, n in enumerate(names):
            m = (idx[:, k] == i) & (wt[:, k] > 0)
            if not m.any(): continue
            R, t = world[n]
            out[m] += wt[m, k:k + 1] * ((V[m] - pos[n]) @ R.T + t)
    return out


PALETTE = np.array([[230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 240, 240],
                    [240, 50, 230], [210, 245, 60], [250, 190, 212], [0, 128, 128], [220, 190, 255], [170, 110, 40], [255, 250, 200],
                    [128, 0, 0], [170, 255, 195], [128, 128, 0], [255, 215, 180], [0, 0, 128], [128, 128, 128]], float)


def overlay(kind, V, F, J, pos, idx, wt, names, tag='rest', Vp=None, world=None):
    cols = PALETTE[idx[:, 0] % len(PALETTE)][:, ::-1] * 0.6 + 80
    ims = []
    Vr = V if Vp is None else Vp
    bounds = (np.minimum(V.min(0), Vr.min(0)), np.maximum(V.max(0), Vr.max(0)))
    for vw in ['side', 'front', 'top']:
        im, px = render(Vr, F, vw, 640, colors=cols, bounds=bounds)
        for n, par, _, _ in J:
            p = pos[n] if world is None else world[n][1]
            q = None if not par else (pos[par] if world is None else world[par][1])
            a = tuple(int(v) for v in px(p[None])[0])
            if q is not None:
                cv2.line(im, tuple(int(v) for v in px(q[None])[0]), a, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.circle(im, a, 3, (0, 255, 255), -1)
        ims.append(im)
    cv2.imwrite(f'{WORK}/rig_{kind}_{tag}.jpg', np.hstack(ims))


# ── GLB writing ─────────────────────────────────────────────────────────────────────────────────────────────
def write_rigged(kind, j, b, J, pos, idx, wt, names, clips, out_path):
    j = json.loads(json.dumps(j)); bin_ = bytearray(b)
    while len(bin_) % 4: bin_.append(0)

    def add_view(data, target=None):
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bin_.extend(data)
        bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: bv['target'] = target
        j['bufferViews'].append(bv); return len(j['bufferViews']) - 1

    def add_acc(arr, typ, ctype, target=None, minmax=False, normalized=False):
        v = add_view(arr.tobytes(), target)
        a = {'bufferView': v, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = [float(x) for x in np.atleast_1d(arr.min(0))]; a['max'] = [float(x) for x in np.atleast_1d(arr.max(0))]
        j['accessors'].append(a); return len(j['accessors']) - 1

    prim = j['meshes'][0]['primitives'][0]
    prim['attributes']['JOINTS_0'] = add_acc(np.ascontiguousarray(idx.astype(np.uint16)), 'VEC4', 5123, 34962)
    prim['attributes']['WEIGHTS_0'] = add_acc(np.ascontiguousarray(wt.astype(np.float32)), 'VEC4', 5126, 34962)
    mesh_node = 0
    base = len(j['nodes'])
    node_of = {n: base + i for i, n in enumerate(names)}
    parent = {n: p for n, p, _, _ in J}
    for n in names:
        p = parent[n]
        t = pos[n] - (pos[p] if p else 0)
        j['nodes'].append({'name': n, 'translation': [float(x) for x in t]})
    for n in names:
        p = parent[n]
        if p: j['nodes'][node_of[p]].setdefault('children', []).append(node_of[n])
    ibm = np.zeros((len(names), 16), np.float32)
    for i, n in enumerate(names):
        M = np.eye(4); M[:3, 3] = -pos[n]; ibm[i] = M.T.ravel()
    j['skins'] = [{'joints': [node_of[n] for n in names], 'inverseBindMatrices': add_acc(ibm, 'MAT4', 5126), 'skeleton': node_of['root'], 'name': kind}]
    j['nodes'][mesh_node]['skin'] = 0
    j['nodes'][mesh_node]['name'] = kind + '_mesh'
    holder = len(j['nodes'])
    j['nodes'].append({'name': kind, 'children': [mesh_node, node_of['root']]})
    j['scenes'] = [{'nodes': [holder]}]; j['scene'] = 0
    anims = []
    for cname, c in clips.items():
        samplers, channels = [], []
        times = c['times'].astype(np.float32)
        tin = add_acc(times[:, None], 'SCALAR', 5126, minmax=True)
        for bone, q in c['rot'].items():
            out = add_acc(np.ascontiguousarray(q.astype(np.float32)), 'VEC4', 5126)
            samplers.append({'input': tin, 'output': out, 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': node_of[bone], 'path': 'rotation'}})
        for bone, tr in c.get('pos', {}).items():
            out = add_acc(np.ascontiguousarray(tr.astype(np.float32)), 'VEC3', 5126)
            samplers.append({'input': tin, 'output': out, 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': node_of[bone], 'path': 'translation'}})
        anims.append({'name': cname, 'samplers': samplers, 'channels': channels})
    j['animations'] = anims
    j.setdefault('asset', {})['extras'] = {'rig': {'kind': SPECS[kind]['kind'], 'source': 'scripts/riftrealm/creatures', 'clips': {k: c.get('meta', {}) for k, c in clips.items()}}}
    j['buffers'][0]['byteLength'] = len(bin_)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(bin_) % 4: bin_.append(0)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bytes(bin_))


def build(kind):
    j, b, V, F = load(kind)
    J, pos = fit(kind, V)
    idx, wt, names = skin(kind, V, F, J, pos)
    return j, b, V, F, J, pos, idx, wt, names


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('kind', nargs='+'); ap.add_argument('--write', action='store_true')
    ap.add_argument('--pose', default='')
    a = ap.parse_args()
    for kind in a.kind:
        j, b, V, F, J, pos, idx, wt, names = build(kind)
        overlay(kind, V, F, J, pos, idx, wt, names)
        json.dump({n: [float(x) for x in pos[n]] for n in names}, open(f'{WORK}/joints_{kind}.json', 'w'), indent=1)
        if a.pose or a.write:
            import clips as CL
            cl = CL.make(kind, J, pos)
            for cname in ([a.pose] if a.pose else []):
                c = cl[cname]
                for fi in [0, len(c['times']) // 3, 2 * len(c['times']) // 3]:
                    rot = {bn: q[fi] for bn, q in c['rot'].items()}
                    tr = {bn: v[fi] - (pos[bn] - (pos[dict((n, p) for n, p, _, _ in J)[bn]] if dict((n, p) for n, p, _, _ in J)[bn] else 0)) for bn, v in c.get('pos', {}).items()}
                    wd = pose_world(J, pos, rot, tr)
                    overlay(kind, V, F, J, pos, idx, wt, names, f'{cname}_{fi}', lbs(V, idx, wt, names, J, pos, wd), wd)
            if a.write:
                out = os.path.join(CREATURES, 'rigged', FILES[kind] + '.glb')
                write_rigged(kind, j, b, J, pos, idx, wt, names, cl, out)
                print('wrote', out, os.path.getsize(out) // 1024, 'KB', 'clips', list(cl))
        print(kind, 'bones', len(names), 'verts', len(V))
