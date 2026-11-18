"""Bake shooter clips into a rigged GLB (Muse contract skeleton, from autoRig.py).

The Muse clips already there (idle, walk, run, hit, death, attack_1..3) are kept. This adds, authored by
forward kinematics in WORLD axes (Y up, character faces +Z, Left = +X):
  aim_idle     weapon arms raised forward, breathing
  shoot        aim pose + recoil kick (0.30 s, plays once, then returns to aim)
  strafe_left  side-step cycle toward +X (the character's left), arms in aim pose, 0.8 s loop
  strafe_right side-step cycle toward -X, 0.8 s loop
  reload       0.9 s: arms drop and cross, then come back up
  python author_clips.py in.glb out.glb
"""
import json, os, sys
import numpy as np
from scipy.spatial.transform import Rotation as R

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ravencrest'))
from glbio import read_glb, accessor, write_glb  # noqa: E402

FPS = 30


def main(src, dst):
    j, b = read_glb(src)
    nodes = j['nodes']; joints = j['skins'][0]['joints']
    name = {i: nodes[i]['name'] for i in joints}
    idx = {n: i for i, n in name.items()}
    parent = {c: i for i, nd in enumerate(nodes) for c in nd.get('children', [])}
    rest_q = {i: R.from_quat(nodes[i].get('rotation', [0, 0, 0, 1])) for i in joints}
    rest_t = {i: np.array(nodes[i].get('translation', [0, 0, 0]), float) for i in joints}

    def depth(i):
        d = 0
        while i in parent: i = parent[i]; d += 1
        return d
    order = sorted(joints, key=depth)
    # world rotation at rest, for converting world-axis deltas to local ones
    def pose(deltas):
        """deltas: {boneName: Rotation in WORLD axes applied on top of the inherited pose}. Returns local quats."""
        wr = {}; local = {}
        for i in order:
            pw = wr[parent[i]] if i in parent and parent[i] in wr else R.identity()
            d = deltas.get(name[i])
            ql = rest_q[i] if d is None else (pw.inv() * d * pw) * rest_q[i]
            local[i] = ql; wr[i] = pw * ql
        return local

    def rx(d): return R.from_euler('x', d, degrees=True)
    def ry(d): return R.from_euler('y', d, degrees=True)
    def rz(d): return R.from_euler('z', d, degrees=True)

    def arms(raise_deg=62, elbow=28, cross=10, kick=0.0):
        # raise forward = rotate about -X; kick tips the arms up
        up = raise_deg - kick
        return {'LeftArm': rx(-up) * rz(-cross), 'RightArm': rx(-up) * rz(cross),
                'LeftForeArm': rx(-elbow), 'RightForeArm': rx(-elbow)}

    clips = {}

    def add(nm, dur, fn, loop=True, extra_root=True):
        n = max(2, int(round(dur * FPS)) + 1)
        ts = np.linspace(0, dur, n).astype(np.float32)
        rots = {i: [] for i in joints}; hips = []
        for t in ts:
            d, hp = fn(t / dur)
            loc = pose(d)
            for i in joints: rots[i].append(loc[i].as_quat())
            hips.append(rest_t[idx['Hips']] + np.array(hp, float))
        clips[nm] = (ts, rots, np.array(hips, np.float32))

    s = lambda p: np.sin(2 * np.pi * p)
    c = lambda p: np.cos(2 * np.pi * p)

    def aim_idle(p):
        d = arms(kick=0); br = 1.2 * s(p)
        d['Spine2'] = rx(br * 0.5); d['Head'] = rx(-br * 0.3)
        d['Spine'] = ry(-14)   # slight bladed stance
        return d, [0, 0.004 * s(p), 0]

    def shoot(p):
        k = np.exp(-p * 7) * (1 if p > 0 else 0)
        d = arms(kick=14 * k)
        d['LeftForeArm'] = rx(-28 - 12 * k); d['RightForeArm'] = rx(-28 - 12 * k)
        d['Spine2'] = rx(-4 * k); d['Head'] = rx(3 * k); d['Spine'] = ry(-14)
        return d, [0, 0, -0.03 * k]

    def strafe(sign):
        def f(p):
            d = arms()
            a = 20 * sign
            lift = lambda ph: max(0.0, s(ph))
            # legs scissor laterally in sync with alternate lifts; feet stay ~under the body
            d['LeftUpLeg'] = rz(a * 0.6 * c(p)) * rx(-18 * lift(p))
            d['RightUpLeg'] = rz(a * 0.6 * c(p + 0.5)) * rx(-18 * lift(p + 0.5))
            d['LeftLeg'] = rx(40 * lift(p)); d['RightLeg'] = rx(40 * lift(p + 0.5))
            d['LeftFoot'] = rx(-14 * lift(p)); d['RightFoot'] = rx(-14 * lift(p + 0.5))
            d['Spine'] = ry(-14) * rz(-4 * sign * s(p * 2))
            return d, [0.012 * sign * c(p), -0.025 * abs(s(p * 2 if False else p)), 0]
        return f

    def reload(p):
        e = np.sin(np.pi * p)  # 0 -> 1 -> 0
        d = arms(raise_deg=82 - 55 * e, elbow=28 + 50 * e, cross=10 + 25 * e)
        d['Head'] = rx(10 * e); d['Spine'] = ry(-14)
        return d, [0, -0.02 * e, 0]

    add('aim_idle', 2.0, aim_idle)
    add('shoot', 0.30, shoot)
    add('strafe_left', 0.8, strafe(+1))
    add('strafe_right', 0.8, strafe(-1))
    add('reload', 0.9, reload)

    # write new animation data
    bin_ = b
    def push(arr):
        nonlocal bin_
        arr = np.ascontiguousarray(arr, np.float32)
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bin_ += arr.tobytes()
        j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes})
        a = {'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': int(arr.shape[0]),
             'type': {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}[arr.shape[1] if arr.ndim > 1 else 1]}
        if arr.ndim == 1 or arr.shape[1] == 1:
            a['min'] = [float(arr.min())]; a['max'] = [float(arr.max())]
        j['accessors'].append(a); return len(j['accessors']) - 1
    for nm, (ts, rots, hips) in clips.items():
        samplers, chans = [], []
        tin = push(ts.reshape(-1, 1))
        for i in joints:
            samplers.append({'input': tin, 'output': push(np.array(rots[i], np.float32)), 'interpolation': 'LINEAR'})
            chans.append({'sampler': len(samplers) - 1, 'target': {'node': i, 'path': 'rotation'}})
        samplers.append({'input': tin, 'output': push(hips), 'interpolation': 'LINEAR'})
        chans.append({'sampler': len(samplers) - 1, 'target': {'node': idx['Hips'], 'path': 'translation'}})
        j['animations'].append({'name': nm, 'samplers': samplers, 'channels': chans})
    j['buffers'][0]['byteLength'] = len(bin_)
    write_glb(dst, j, bin_)
    print('clips:', [a['name'] for a in j['animations']])


if __name__ == '__main__':
    main(*sys.argv[1:3])
