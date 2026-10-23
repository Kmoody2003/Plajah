"""Rig a new character mesh with a Muse contract skeleton and keep every one of Muse's baked clips.

Muse's monsters (public/games/ravencrest/assets/characters/muse/*.glb) carry the drop-in contract skeleton
(22 joints: Hips…Head, shoulders/arms/forearms/hands, legs/feet/toes) and baked clips (idle, walk, run, chase,
attack_1..3, hit, death). This script embeds that skeleton in a different mesh — e.g. a local image-to-3D
build (Hunyuan3D-2mini shape painted from the concept sheet with engines/tela-3d/paint_from_views.py):

  1. scale the mesh to the source rig's height (Y-up, facing +Z, feet at 0);
  2. fit every joint into the new body: spine/neck/head through the torso's cross-sections, legs and arms
     through the limb clusters found in horizontal slices (so a hunched troll with knuckle-dragging arms gets
     its own bone positions, not Muse's);
  3. weight each vertex to its nearest bones (inverse-distance envelopes, left/right kept apart), smoothed
     over the mesh;
  4. write one GLB: the new mesh + its painted PBR textures, the skeleton with the fitted rest offsets, and
     Muse's clips re-pointed at those offsets (rotations kept, bone translations replaced, hip motion scaled).

  python scripts/ravencrest/autoRig.py --rig muse/werewolf.glb --mesh troll/painted.glb --out bridge_troll.glb
Run it with the Tela 3D Python (trimesh, scipy): "D:\\Plajah Runtime\\tela3d-py\\Scripts\\python.exe".
"""
import argparse
import io
import json
import os
import struct
import sys

import numpy as np
import trimesh
from scipy.sparse import coo_matrix
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import read_glb, accessor  # noqa: E402

# ── small math ──────────────────────────────────────────────────────────────────────────────────────
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def node_mat(nd):
    M = np.eye(4)
    if 'matrix' in nd:
        return np.array(nd['matrix'], float).reshape(4, 4).T
    M[:3, :3] = quat_mat(nd.get('rotation', [0, 0, 0, 1])) * np.array(nd.get('scale', [1, 1, 1]))
    M[:3, 3] = nd.get('translation', [0, 0, 0])
    return M


# ── joint fitting ───────────────────────────────────────────────────────────────────────────────────
def clusters_1d(xs, gap):
    """Split sorted 1-D samples into runs separated by more than `gap`."""
    if len(xs) == 0:
        return []
    xs = np.sort(xs)
    cuts = np.where(np.diff(xs) > gap)[0]
    return np.split(xs, cuts + 1)


def slab(V, y, h):
    return V[np.abs(V[:, 1] - y) < h]


def fit_joints(names, src_pos, V):
    """Move each source joint (already mapped into the target's bounding box) into the target's body."""
    P = {n: src_pos[n].copy() for n in names}
    H = V[:, 1].max()
    h = H * 0.025
    width = V[:, 0].max() - V[:, 0].min()

    def centre_of(y, xpred, side=0, outer=False):
        s = slab(V, y, h)
        if side:
            s = s[np.sign(s[:, 0]) == side]
        if len(s) < 8:
            return None
        runs = clusters_1d(s[:, 0], width * 0.02)
        runs = [r for r in runs if len(r) >= 6]
        if not runs:
            return None
        if outer:
            r = max(runs, key=lambda r: abs(r.mean())) if side else runs[0]
        else:
            r = min(runs, key=lambda r: abs(r.mean() - xpred))
        sel = s[(s[:, 0] >= r.min()) & (s[:, 0] <= r.max())]
        return sel.mean(0)

    # Spine, neck, head: through the torso's cross-section (centre stays on x = 0).
    for n in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'):
        s = slab(V, P[n][1], h)
        s = s[np.abs(s[:, 0]) < width * 0.18]
        if len(s) > 8:
            P[n][2] = s[:, 2].mean()
        P[n][0] = 0.0
    # Legs: the inner clusters of each slice.
    for side, pre in ((1, 'Left'), (-1, 'Right')):
        for n in ('UpLeg', 'Leg', 'Foot'):
            c = centre_of(P[pre + n][1], P[pre + n][0], side)
            if c is not None:
                P[pre + n][0] = c[0]
                P[pre + n][2] = c[2]
        P[pre + 'UpLeg'][1] = P['Hips'][1]
        P[pre + 'ToeBase'][0] = P[pre + 'Foot'][0]
        foot = V[(np.sign(V[:, 0]) == side) & (V[:, 1] < H * 0.06)]
        if len(foot):
            P[pre + 'ToeBase'][2] = np.percentile(foot[:, 2], 85)
            P[pre + 'Foot'][1] = max(P[pre + 'Foot'][1], H * 0.07)
    # Arms: walk down from the shoulder following the arm as its own cluster (the outermost of two or
    # more on that side). The hand ends where that separate limb disappears — merged into the thigh or
    # simply ended — never following on down the leg.
    for side, pre in ((1, 'Left'), (-1, 'Right')):
        sh = P[pre + 'Arm']
        top = sh[1]
        pts, seen2, prev = [], False, None
        for y in np.linspace(top - h * 2, H * 0.12, 70):
            s_ = slab(V, y, h)
            s_ = s_[np.sign(s_[:, 0]) == side]
            runs = [r for r in clusters_1d(s_[:, 0], width * 0.02) if len(r) >= 6] if len(s_) else []
            if len(runs) >= 2:
                seen2 = True
                arm = max(runs, key=lambda r: abs(r.mean()))
                # Continuity: the arm can't jump more than a hand-width sideways between slices.
                if prev is not None and abs(arm.mean() - prev) > width * 0.12:
                    break
                sel = s_[(s_[:, 0] >= arm.min()) & (s_[:, 0] <= arm.max())]
                pts.append(sel.mean(0))
                prev = arm.mean()
            elif seen2:
                break                       # the separate limb ended: that was the hand
            elif len(runs) == 1 and y < top - (top - P['Hips'][1]) * 0.5:
                break                       # arm never separated from the body (fallback below)
        if len(pts) >= 6:
            pts = np.array(pts)
            hand = pts[-1].copy()
            hand[1] += (top - hand[1]) * 0.05
            P[pre + 'Hand'] = hand
            P[pre + 'ForeArm'] = pts[int(len(pts) * 0.5)]
            P[pre + 'Arm'] = np.array([pts[0][0] * 0.9, top, pts[0][2]])
        else:
            # Arms against the body: keep the mapped joints but never lower than a third of the way
            # from the hips to the floor.
            for n in ('ForeArm', 'Hand'):
                P[pre + n][1] = max(P[pre + n][1], P['Hips'][1] * 0.6)
        P[pre + 'Shoulder'] = np.array([P[pre + 'Arm'][0] * 0.4, P[pre + 'Arm'][1] + h, P['Spine2'][2]])
    return P


def fit_joints_quad(names, src_pos, V):
    """Quadruped: legs through the paw/elbow/hock cross-sections of their own quadrant; spine, neck and
    head stay where the body box puts them (it is a side-standing animal either way)."""
    P = {n: src_pos[n].copy() for n in names}
    H = V[:, 1].max()
    h = H * 0.04
    zs = V[:, 2].max() - V[:, 2].min()
    for leg in ('FL', 'FR', 'BL', 'BR'):
        side = np.sign(src_pos[f'{leg}_Upper'][0]) or (1 if leg[1] == 'L' else -1)
        for part in ('Upper', 'Lower', 'Paw'):
            j = P[f'{leg}_{part}']
            s_ = V[(np.abs(V[:, 1] - j[1]) < h) & (np.sign(V[:, 0]) == side) & (np.abs(V[:, 2] - j[2]) < zs * 0.14)]
            if len(s_) > 8:
                j[0], j[2] = s_[:, 0].mean(), s_[:, 2].mean()
        if leg.startswith('B'):
            P[f'{leg}_Upper'][2] = P['Pelvis'][2]
    for n in ('Pelvis', 'SpineQ', 'Chest', 'NeckQ', 'HeadQ', 'Tail1', 'Tail2', 'Tail3'):
        P[n][0] = 0.0
    return P


# ── weights ─────────────────────────────────────────────────────────────────────────────────────────
def bone_weights(V, F, names, parent_of, P, tips, sides=None):
    """Inverse-distance envelopes to bone segments, left/right separated, smoothed over the mesh."""
    J = len(names)
    segs = []
    for i, n in enumerate(names):
        kids = [k for k, p in parent_of.items() if p == i]
        a = P[n]
        if kids:
            b = np.mean([P[names[k]] for k in kids], axis=0)
        else:
            b = a + tips.get(n, np.zeros(3))
        segs.append((a, b))
    D = np.zeros((len(V), J))
    for i, (a, b) in enumerate(segs):
        ab = b - a
        t = np.clip(((V - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        D[:, i] = np.linalg.norm(V - (a + t[:, None] * ab), axis=1)
    side = np.array(sides if sides is not None else [1 if n.startswith('Left') else -1 if n.startswith('Right') else 0 for n in names])
    vs = np.sign(V[:, 0])
    wrong = (side[None, :] != 0) & (side[None, :] != vs[:, None]) & (np.abs(V[:, 0])[:, None] > 0.04)
    D[wrong] = 1e3
    D[:, [names.index('Hips' if 'Hips' in names else 'Pelvis')]] *= 1.15   # let legs and spine claim their own regions
    W = 1.0 / np.maximum(D, 1e-4) ** 4
    # Smooth over the surface (welded by position) so neighbouring vertices agree.
    key = np.round(V / 1e-5).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True)
    weld = weld.ravel()
    T = weld[F]
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    n = weld.max() + 1
    A = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    deg = np.asarray(A.sum(1)).ravel()
    Wu = np.zeros((n, J)); np.add.at(Wu, weld, W / W.sum(1, keepdims=True))
    Wu /= np.bincount(weld, minlength=n)[:, None]
    for _ in range(6):
        Wu = 0.5 * Wu + 0.5 * (A @ Wu) / np.maximum(deg, 1)[:, None]
    W = Wu[weld]
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, 1)
    w /= w.sum(1, keepdims=True)
    return idx.astype(np.uint16), w.astype(np.float32)


# ── GLB writer ──────────────────────────────────────────────────────────────────────────────────────
class Glb:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.accs = []

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def acc(self, arr, kind, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        ct = {np.float32: 5126, np.uint32: 5125, np.uint16: 5123, np.uint8: 5121}[arr.dtype.type]
        a = {'bufferView': self.view(arr.tobytes(), target), 'componentType': ct,
             'count': int(arr.shape[0]), 'type': kind}
        if minmax:
            flat = arr.reshape(arr.shape[0], -1)
            a['min'] = flat.min(0).tolist(); a['max'] = flat.max(0).tolist()
        self.accs.append(a)
        return len(self.accs) - 1

    def write(self, path, j):
        j['accessors'] = self.accs; j['bufferViews'] = self.views
        while len(self.bin) % 4:
            self.bin.append(0)
        j['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(j, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942)); f.write(self.bin)


def png_bytes(img):
    b = io.BytesIO(); img.save(b, format='PNG'); return b.getvalue()


def jpg_bytes(img):
    b = io.BytesIO(); img.convert('RGB').save(b, format='JPEG', quality=90); return b.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rig', required=True)
    ap.add_argument('--mesh', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--yaw', type=float, default=0.0, help='degrees to turn the mesh so it faces +Z')
    ap.add_argument('--debug', help='write fitted joints as JSON here')
    a = ap.parse_args()

    j, b = read_glb(a.rig)
    nodes = j['nodes']
    skin = j['skins'][0]
    joints = skin['joints']
    names = [nodes[i]['name'] for i in joints]
    parent = {}
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []):
            parent[c] = i

    def world(i):
        M = node_mat(nodes[i])
        while i in parent:
            i = parent[i]; M = node_mat(nodes[i]) @ M
        return M
    Wsrc = {n: world(i) for n, i in zip(names, joints)}
    src_pos = {n: Wsrc[n][:3, 3].copy() for n in names}
    Psrc = accessor(j, b, j['meshes'][0]['primitives'][0]['attributes']['POSITION'])
    s_lo, s_hi = Psrc.min(0), Psrc.max(0)

    # Target mesh: one textured mesh, Y-up, scaled to the source height, feet on 0, centred.
    scene = trimesh.load(a.mesh, force='scene')
    geom = list(scene.dump()) if hasattr(scene, 'dump') else [scene]
    m = geom[0] if len(geom) == 1 else trimesh.util.concatenate(geom)
    V = np.asarray(m.vertices, float).copy()
    if a.yaw:
        r = np.radians(a.yaw); c, s = np.cos(r), np.sin(r)
        V = V @ np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])
    V -= [(V[:, 0].max() + V[:, 0].min()) / 2, V[:, 1].min(), (V[:, 2].max() + V[:, 2].min()) / 2]
    k = (s_hi[1] - s_lo[1]) / V[:, 1].max()
    V *= k
    F = np.asarray(m.faces, np.int64)
    t_lo, t_hi = V.min(0), V.max(0)
    # Map the source joints into the target's box, then fit them into its body.
    mapped = {n: t_lo + (p - s_lo) / np.maximum(s_hi - s_lo, 1e-6) * (t_hi - t_lo) for n, p in src_pos.items()}
    for n in mapped:
        mapped[n][0] = src_pos[n][0] / max(s_hi[0], 1e-6) * t_hi[0]
    quad = 'Pelvis' in names
    P = fit_joints_quad(names, mapped, V) if quad else fit_joints(names, mapped, V)
    if a.debug:
        json.dump({n: P[n].round(4).tolist() for n in names}, open(a.debug, 'w'), indent=1)

    jidx = {i: k for k, i in enumerate(joints)}
    parent_of = {jidx[c]: jidx[p] for c, p in parent.items() if c in jidx and p in jidx}
    if quad:
        tips = {n: (P[n] - P[names[parent_of[i]]]) * 0.6 for i, n in enumerate(names)
                if i in parent_of and not any(p == i for p in parent_of.values())}
    else:
        tips = {'Head': np.array([0, (V[:, 1].max() - P['Head'][1]) * 0.8, 0]),
                'LeftHand': (P['LeftHand'] - P['LeftForeArm']) * 0.6, 'RightHand': (P['RightHand'] - P['RightForeArm']) * 0.6,
                'LeftToeBase': np.array([0, 0, 0.08]), 'RightToeBase': np.array([0, 0, 0.08])}
    sides = [int(np.sign(src_pos[n][0])) if abs(src_pos[n][0]) > 0.03 else 0 for n in names]
    JI, JW = bone_weights(V, F, names, parent_of, P, tips, sides)

    # New rest pose: Muse's rest rotations, translations re-derived from the fitted joint positions.
    new_world = {}

    def depth(i):
        d = 0
        while i in parent:
            i = parent[i]; d += 1
        return d
    for i in sorted(range(len(nodes)), key=depth):
        nd = nodes[i]
        pw = new_world[parent[i]] if i in parent else np.eye(4)
        if i in jidx:
            n = names[jidx[i]]
            local_t = np.linalg.inv(pw) @ np.append(P[n], 1.0)
            nd['translation'] = local_t[:3].tolist()
        new_world[i] = pw @ node_mat(nd)
    ibm = np.array([np.linalg.inv(new_world[i]).T.reshape(-1) for i in joints], np.float32)

    # Mesh attributes.
    uv = np.asarray(m.visual.uv, np.float32).copy() if hasattr(m.visual, 'uv') and m.visual.uv is not None else None
    tm = trimesh.Trimesh(V, F, process=False)
    N = np.asarray(tm.vertex_normals, np.float32)
    g = Glb()
    attrs = {'POSITION': g.acc(V.astype(np.float32), 'VEC3', 34962, minmax=True),
             'NORMAL': g.acc(N, 'VEC3', 34962),
             'JOINTS_0': g.acc(JI, 'VEC4', 34962), 'WEIGHTS_0': g.acc(JW, 'VEC4', 34962)}
    if uv is not None:
        uv[:, 1] = 1 - uv[:, 1]                     # trimesh stores GL-style UVs
        attrs['TEXCOORD_0'] = g.acc(uv, 'VEC2', 34962)
    ind = g.acc(F.astype(np.uint32).reshape(-1), 'SCALAR', 34963)

    # Material: the painted PBR maps.
    mat = {'name': 'painted', 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 1.0}}
    images, textures = [], []

    def tex(img, mime):
        data = png_bytes(img) if mime == 'image/png' else jpg_bytes(img)
        images.append({'bufferView': g.view(data), 'mimeType': mime})
        textures.append({'source': len(images) - 1, 'sampler': 0})
        return {'index': len(textures) - 1}
    pm = getattr(m.visual, 'material', None)
    if pm is not None:
        base = getattr(pm, 'baseColorTexture', None) or getattr(pm, 'image', None)
        if base is not None:
            mat['pbrMetallicRoughness']['baseColorTexture'] = tex(base, 'image/jpeg')
        if getattr(pm, 'metallicRoughnessTexture', None) is not None:
            mat['pbrMetallicRoughness']['metallicRoughnessTexture'] = tex(pm.metallicRoughnessTexture, 'image/jpeg')
        if getattr(pm, 'normalTexture', None) is not None:
            mat['normalTexture'] = tex(pm.normalTexture, 'image/png')

    # Skeleton + clips: rotations kept; joint translations -> the new rest offsets; hip motion scaled.
    root = 'Hips' if 'Hips' in names else 'Pelvis'
    hips_node = joints[names.index(root)]
    hip_k = new_world[hips_node][1, 3] / max(Wsrc[root][1, 3], 1e-6)
    anims = []
    for an in j.get('animations', []):
        samplers, chans = [], []
        for ch in an['channels']:
            sm = an['samplers'][ch['sampler']]
            tin = accessor(j, b, sm['input']).astype(np.float32)
            out = accessor(j, b, sm['output']).astype(np.float32)
            node, path = ch['target']['node'], ch['target']['path']
            if path == 'translation' and node in jidx:
                out = out * hip_k if node == hips_node else np.tile(np.array(nodes[node]['translation'], np.float32), (len(out), 1))
            if path == 'scale' and node in jidx:
                continue
            kind = {'translation': 'VEC3', 'rotation': 'VEC4', 'scale': 'VEC3'}[path]
            samplers.append({'input': g.acc(tin.reshape(-1), 'SCALAR', minmax=True), 'output': g.acc(out, kind),
                             'interpolation': sm.get('interpolation', 'LINEAR')})
            chans.append({'sampler': len(samplers) - 1, 'target': ch['target']})
        anims.append({'name': an['name'], 'samplers': samplers, 'channels': chans})

    mesh_node = next(i for i, nd in enumerate(nodes) if 'mesh' in nd)
    out = {
        'asset': {'version': '2.0', 'generator': 'Plajah autoRig (Muse contract skeleton)'},
        'scene': j.get('scene', 0), 'scenes': j['scenes'], 'nodes': nodes,
        'meshes': [{'name': os.path.splitext(os.path.basename(a.out))[0], 'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}],
        'materials': [mat], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
        'skins': [{'joints': joints, 'inverseBindMatrices': g.acc(ibm.reshape(-1, 16), 'MAT4'), **({'skeleton': skin['skeleton']} if 'skeleton' in skin else {})}],
        'animations': anims,
    }
    if images:
        out['images'] = images; out['textures'] = textures
    nodes[mesh_node]['mesh'] = 0
    g.write(a.out, out)
    print(f'[autoRig] {len(V)} verts, {len(F)} faces, {len(anims)} clips, height {V[:, 1].max():.2f} -> {a.out}')


if __name__ == '__main__':
    main()
