"""Rift Realm rig upgrade: the 22-bone contract skeleton -> the combat skeleton (twist bones, five-finger hands,
weapon sockets), with the skin re-weighted to match. Existing bones, clips and the mesh are untouched, so every
clip that drives the contract bones still plays.

Adds (Mixamo-style names, so retargeting and CharacterRig keep working):
  twist   LeftArmTwist / RightArmTwist (upper arm, 1/3 from the shoulder), LeftForeArmTwist / RightForeArmTwist
          (forearm, 2/3 toward the wrist), LeftUpLegTwist / RightUpLegTwist (thigh, 1/3 from the hip).
          They are siblings of the next bone down (children of the limb bone), so turning one only rolls the skin
          it holds; CharacterRig drives them from the wrist / elbow roll every frame.
  fingers Left/RightHand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}: chains laid across the hand from the hand
          vertices' own extent (PCA: length / width / thickness; thumb on the palm's forward side in the T-pose).
  sockets hand_r_weapon, hand_l_weapon (palm centre, +Z along the fingers = blade / barrel forward, +Y toward the
          thumb), back_weapon (behind Spine2, on the back surface). Plain nodes, not skinned: attach weapons there.

Weights: forearm / upper-arm / thigh weight is shared with the twist bone by position along the bone (smooth ramp);
the fingers take the hand weight beyond the knuckle line, each vertex to its nearest finger segment. Rigid extra
parts (daggers, lance, shield, wing cloak: every connected piece except the body) keep their single bone.
Influences are re-limited to 4 and normalised.

  $PY scripts/riftrealm/rig_upgrade.py in.glb out.glb [--report out.json]
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ravencrest'))
from glbio import read_glb, accessor, write_glb, buffer_view_bytes  # noqa: E402

FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']


def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_to_quat(m):
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1) * 2; w = 0.25 * s; x = (m[2, 1] - m[1, 2]) / s; y = (m[0, 2] - m[2, 0]) / s; z = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; w = (m[2, 1] - m[1, 2]) / s; x = 0.25 * s; y = (m[0, 1] + m[1, 0]) / s; z = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; w = (m[0, 2] - m[2, 0]) / s; x = (m[0, 1] + m[1, 0]) / s; y = 0.25 * s; z = (m[1, 2] + m[2, 1]) / s
    else:
        s = np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; w = (m[1, 0] - m[0, 1]) / s; x = (m[0, 2] + m[2, 0]) / s; y = (m[1, 2] + m[2, 1]) / s; z = 0.25 * s
    q = np.array([x, y, z, w]); return q / np.linalg.norm(q)


def node_local(n):
    M = np.eye(4)
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    S = np.diag(n.get('scale', [1, 1, 1]) + [1])
    R = np.eye(4); R[:3, :3] = quat_to_mat(n.get('rotation', [0, 0, 0, 1]))
    T = np.eye(4); T[:3, 3] = n.get('translation', [0, 0, 0])
    return T @ R @ S


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def unit(v): return v / (np.linalg.norm(v) + 1e-12)


def components(F, n, V=None):
    """Connected-component label per vertex (union-find over triangle edges). With V, vertices at the same
    position (UV-seam splits) are welded first, so a seam doesn't cut the body into pieces."""
    parent = np.arange(n)
    if V is not None:
        _, first = np.unique(np.round(V / 1e-5).astype(np.int64), axis=0, return_inverse=True)
        first = first.reshape(-1)
        rep = np.full(first.max() + 1, -1)
        for i, g in enumerate(first):
            if rep[g] < 0: rep[g] = i
            else: parent[i] = rep[g]

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for a, b, c in F:
        for u, v in ((a, b), (b, c)):
            ru, rv = find(u), find(v)
            if ru != rv: parent[ru] = rv
    return np.array([find(i) for i in range(n)])


def main(src, dst, report_path=None):
    j, b = read_glb(src)
    skin = j['skins'][0]
    joints = list(skin['joints'])
    names = [j['nodes'][i]['name'] for i in joints]
    if 'LeftForeArmTwist' in names:
        print('already upgraded'); return
    prim = j['meshes'][0]['primitives'][0]; at = prim['attributes']
    V = accessor(j, b, at['POSITION']).astype(float)
    JI = accessor(j, b, at['JOINTS_0']).astype(int)
    W = accessor(j, b, at['WEIGHTS_0']).astype(float)
    F = accessor(j, b, prim['indices']).reshape(-1, 3).astype(int)
    IBM = accessor(j, b, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row
    bind = np.linalg.inv(IBM)                       # joint bind transforms in mesh space
    jpos = {nm: bind[k][:3, 3] for k, nm in enumerate(names)}
    n_nodes = len(j['nodes'])
    parent_of = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []): parent_of[c] = i

    def world(i):
        M = node_local(j['nodes'][i])
        while i in parent_of:
            i = parent_of[i]; M = node_local(j['nodes'][i]) @ M
        return M
    node_of = {nm: joints[k] for k, nm in enumerate(names)}
    # dense weights (verts x joints)
    nv, nj0 = len(V), len(names)
    dense = np.zeros((nv, nj0))
    for k in range(4): np.add.at(dense, (np.arange(nv), JI[:, k]), W[:, k])
    # body = largest connected piece; parts keep their bone
    lab = components(F, nv, V)
    vals, cnt = np.unique(lab, return_counts=True)
    body = lab == vals[np.argmax(cnt)]
    log = {'verts': nv, 'body_verts': int(body.sum()), 'parts_verts': int((~body).sum()), 'added': []}

    new_bones = []   # (name, parent name, world pos, world rot 3x3 or None)

    def add_bone(name, parent, pos, rot=None):
        new_bones.append((name, parent, np.asarray(pos, float), rot)); log['added'].append(name)

    cols = {}  # name -> new dense column

    def col(name):
        if name not in cols: cols[name] = np.zeros(nv)
        return cols[name]

    # ── twist bones ──
    for side in ('Left', 'Right'):
        for limb, child, frac, ramp in (('Arm', 'ForeArm', 1 / 3, 'root'), ('ForeArm', 'Hand', 2 / 3, 'tip'), ('UpLeg', 'Leg', 1 / 3, 'root')):
            a, c = jpos[side + limb], jpos[side + child]
            tw = side + limb + 'Twist'
            add_bone(tw, side + limb, a + (c - a) * frac)
            k = names.index(side + limb)
            u = np.clip((V - a) @ (c - a) / (np.dot(c - a, c - a) + 1e-12), 0, 1)
            # forearm: the skin near the wrist rolls with the wrist; upper arm / thigh: the skin near the
            # shoulder / hip un-rolls (the classic candy-wrapper fix), half of the limb's weight at most
            share = smoothstep(0.2, 0.9, u) * 0.85 if ramp == 'tip' else (1 - smoothstep(0.0, 0.65, u)) * 0.5
            share = share * body
            moved = dense[:, k] * share
            dense[:, k] -= moved; col(tw)[:] += moved

    # ── fingers + sockets ──
    sockets = []
    for side, sgn in (('Left', 1.0), ('Right', -1.0)):
        hk = names.index(side + 'Hand')
        wrist = jpos[side + 'Hand']; elbow = jpos[side + 'ForeArm']
        hv = body & (dense[:, hk] > 0.35)
        P = V[hv]
        axis = unit(wrist - elbow)
        u = (P - wrist) @ axis
        keep = u > -0.01
        P = P[keep]; u = u[keep]
        length = max(0.06, np.percentile(u, 98))
        # width: the hand's second principal direction, perpendicular to the forearm axis
        Q = P - P.mean(0); Q -= np.outer(Q @ axis, axis)
        _, _, vt = np.linalg.svd(Q, full_matrices=False)
        wdir, tdir = unit(vt[0]), unit(vt[1])
        # thumb side = forward (+Z) in the T-pose rest; thickness axis points down (palm side) for a palms-down rest
        if wdir[2] < 0: wdir = -wdir
        if tdir[1] > 0: tdir = -tdir
        wq = (P - wrist) @ wdir
        width = max(0.04, np.percentile(wq, 95) - np.percentile(wq, 5))
        wc = 0.5 * (np.percentile(wq, 95) + np.percentile(wq, 5))
        knuckle = 0.45 * length
        seg = (length - knuckle) / 3.0
        palm = wrist + axis * (0.3 * length) + wdir * wc
        # finger chains: index..pinky across the width (index on the thumb side), thumb from the palm's side
        chains = {}
        for fi, f in enumerate(FINGERS[1:]):
            off = wc + width * (0.36 - 0.24 * fi)
            base = wrist + axis * knuckle + wdir * off
            chains[f] = [base + axis * seg * s for s in range(3)]
        tbase = wrist + axis * (0.18 * length) + wdir * (wc + 0.5 * width) + tdir * 0.15 * width
        tdir2 = unit(axis * 0.6 + wdir * 0.6 + tdir * 0.3)
        chains['Thumb'] = [tbase + tdir2 * seg * 1.1 * s for s in range(3)]
        for f in FINGERS:
            prev = side + 'Hand'
            for s, p in enumerate(chains[f]):
                nm = f'{side}Hand{f}{s + 1}'
                add_bone(nm, prev, p); prev = nm
        # weights: hand weight beyond the knuckle line (thumb: beyond its base) -> nearest finger segment
        idx = np.where(body & (dense[:, hk] > 0))[0]
        X = V[idx]
        uu = (X - wrist) @ axis
        segs = []
        for f in FINGERS:
            pts = chains[f] + [chains[f][-1] + (chains[f][-1] - chains[f][-2])]
            for s in range(3): segs.append((f'{side}Hand{f}{s + 1}', pts[s], pts[s + 1]))
        D = np.zeros((len(X), len(segs)))
        for si, (_, p0, p1) in enumerate(segs):
            d = p1 - p0; t = np.clip((X - p0) @ d / (d @ d + 1e-12), 0, 1)
            D[:, si] = np.linalg.norm(X - (p0 + np.outer(t, d)), axis=1)
        best = np.argmin(D, 1)
        thumb = np.array([segs[s][0].endswith(('Thumb1', 'Thumb2', 'Thumb3')) for s in best])
        share = np.where(thumb, smoothstep(0.12 * length, 0.3 * length, uu), smoothstep(knuckle - 0.06 * length, knuckle + 0.06 * length, uu))
        share *= (D[np.arange(len(X)), best] < 0.6 * width)
        moved = dense[idx, hk] * share
        dense[idx, hk] -= moved
        for si, (nm, _, _) in enumerate(segs):
            m = best == si
            if m.any(): col(nm)[idx[m]] += moved[m]
        # socket frame (in mesh space): +Z along the fingers, +Y toward the thumb, X = Y x Z
        z = axis; y = unit(wdir - z * (wdir @ z)); x = np.cross(y, z)
        sockets.append(('hand_l_weapon' if side == 'Left' else 'hand_r_weapon', side + 'Hand', palm + tdir * 0.2 * width, np.stack([x, y, z], 1)))
        log[side + '_hand'] = {'length': round(float(length), 3), 'width': round(float(width), 3)}

    # back socket: on the back surface at chest height, +Z down the spine (weapon hangs barrel-down), +Y out of the back
    s2 = jpos['Spine2']
    near = body & (np.abs(V[:, 1] - s2[1]) < 0.06) & (np.abs(V[:, 0] - s2[0]) < 0.1)
    zback = V[near, 2].min() if near.any() else s2[2] - 0.15
    R = np.stack([np.array([1.0, 0, 0]), np.array([0, 0, -1.0]), np.array([0, -1.0, 0])], 1)  # columns x, y, z
    sockets.append(('back_weapon', 'Spine2', np.array([s2[0], s2[1], zback - 0.02]), R))

    # ── write nodes / skin ──
    world_of = {}

    def node_world(nm):
        if nm in world_of: return world_of[nm]
        world_of[nm] = world(node_of[nm]); return world_of[nm]

    for nm, par, pos, rot in new_bones:
        Pw = node_world(par)
        Wn = np.eye(4); Wn[:3, :3] = Pw[:3, :3] / np.linalg.norm(Pw[:3, :3], axis=0); Wn[:3, 3] = pos
        L = np.linalg.inv(Pw) @ Wn
        n = {'name': nm, 'translation': L[:3, 3].tolist()}
        q = mat_to_quat(L[:3, :3] / np.linalg.norm(L[:3, :3], axis=0))
        if abs(q[3]) < 0.99999: n['rotation'] = q.tolist()
        j['nodes'].append(n); ni = len(j['nodes']) - 1
        j['nodes'][node_of[par]].setdefault('children', []).append(ni)
        node_of[nm] = ni; world_of[nm] = Wn
        joints.append(ni); names.append(nm)
    for nm, par, pos, R in sockets:
        Pw = node_world(par)
        Wn = np.eye(4); Wn[:3, :3] = R; Wn[:3, 3] = pos
        L = np.linalg.inv(Pw) @ Wn
        Rl = L[:3, :3] / np.linalg.norm(L[:3, :3], axis=0)
        j['nodes'].append({'name': nm, 'translation': L[:3, 3].tolist(), 'rotation': mat_to_quat(Rl).tolist()})
        j['nodes'][node_of[par]].setdefault('children', []).append(len(j['nodes']) - 1)
    skin['joints'] = joints
    IBMn = np.concatenate([IBM, np.stack([np.linalg.inv(world_of[nm]) for nm, *_ in new_bones])]) if new_bones else IBM

    # dense -> top-4
    full = np.concatenate([dense, np.stack([cols.get(nm, np.zeros(nv)) for nm, *_ in new_bones], 1)], 1)
    top = np.argsort(-full, 1)[:, :4]
    tw = np.take_along_axis(full, top, 1); tw = np.clip(tw, 0, None)
    tw /= tw.sum(1, keepdims=True) + 1e-12
    log['joints'] = len(joints)
    log['weights_on_new'] = {nm: int((cols.get(nm, np.zeros(1)) > 0.05).sum()) for nm, *_ in new_bones}

    acc = j['accessors']
    rep = {}
    jt = np.uint16 if len(joints) > 255 or acc[at['JOINTS_0']]['componentType'] == 5123 else np.uint8
    acc[at['JOINTS_0']]['componentType'] = 5123 if jt == np.uint16 else 5121
    for ai, arr in ((at['JOINTS_0'], top.astype(jt)), (at['WEIGHTS_0'], tw.astype(np.float32)), (skin['inverseBindMatrices'], IBMn.transpose(0, 2, 1).reshape(-1, 16).astype(np.float32))):
        a = acc[ai]; a['count'] = len(arr); a.pop('byteOffset', None)
        j['bufferViews'][a['bufferView']].pop('byteStride', None)
        rep[a['bufferView']] = np.ascontiguousarray(arr).tobytes()
    write_glb(dst, j, b, rep)
    log['out'] = dst; log['bytes'] = os.path.getsize(dst)
    print(json.dumps(log, indent=1))
    if report_path: json.dump(log, open(report_path, 'w'), indent=1)


if __name__ == '__main__':
    a = sys.argv[1:]
    rep = a[a.index('--report') + 1] if '--report' in a else None
    main(a[0], a[1], rep)
