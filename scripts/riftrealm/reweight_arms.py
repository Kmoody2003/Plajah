"""Stop coat/torso vertices from riding the arms: autoRig's envelopes weight any vertex near an arm bone to it, so
with the arms raised the coat flaps stretch into spikes. Here an arm-chain weight is dropped when the vertex lies
farther than a limb radius from that bone segment; the freed weight goes to the remaining influences (or Spine/Hips).
  python reweight_arms.py rigged.glb joints.json out.glb [--r-upper 0.11 --r-fore 0.085 --r-hand 0.10]
joints.json = autoRig.py --debug output (fitted joint positions)."""
import argparse, json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ravencrest'))
from glbio import read_glb, accessor, write_glb

ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('joints'); ap.add_argument('out')
ap.add_argument('--r-upper', type=float, default=0.11); ap.add_argument('--r-fore', type=float, default=0.085); ap.add_argument('--r-hand', type=float, default=0.10)
a = ap.parse_args()
j, b = read_glb(a.glb); P = {k: np.array(v) for k, v in json.load(open(a.joints)).items()}
nodes = j['nodes']; joints = j['skins'][0]['joints']; names = [nodes[i]['name'] for i in joints]
prim = j['meshes'][0]['primitives'][0]['attributes']
V = accessor(j, b, prim['POSITION']).astype(float); JI = accessor(j, b, prim['JOINTS_0']).astype(int); JW = accessor(j, b, prim['WEIGHTS_0']).astype(float)

def seg_dist(p0, p1):
    ab = p1 - p0; t = np.clip(((V - p0) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(V - (p0 + t[:, None] * ab), axis=1)
lim = {}
for s in ('Left', 'Right'):
    hand_tip = P[s + 'Hand'] + (P[s + 'Hand'] - P[s + 'ForeArm']) * 0.35
    lim[s + 'Shoulder'] = (seg_dist(P[s + 'Shoulder'], P[s + 'Arm']), 0.12)
    lim[s + 'Arm'] = (seg_dist(P[s + 'Arm'], P[s + 'ForeArm']), a.r_upper)
    lim[s + 'ForeArm'] = (seg_dist(P[s + 'ForeArm'], P[s + 'Hand']), a.r_fore)
    lim[s + 'Hand'] = (seg_dist(P[s + 'Hand'], hand_tip), a.r_hand)
dropped = 0
for n, (d, r) in lim.items():
    k = names.index(n); bad = (JI == k) & (d[:, None] > r) & (JW > 0)
    dropped += bad.sum(); JW[bad] = 0
# vertices left with no weight -> nearest of Spine2 / Hips
dead = JW.sum(1) < 1e-6
JI[dead, 0] = names.index('Spine1'); JW[dead, 0] = 1
JW /= JW.sum(1, keepdims=True)
order = np.argsort(-JW, axis=1); JI = np.take_along_axis(JI, order, 1); JW = np.take_along_axis(JW, order, 1)
rep = {j['accessors'][prim['JOINTS_0']]['bufferView']: JI.astype(np.uint16).tobytes(),
       j['accessors'][prim['WEIGHTS_0']]['bufferView']: JW.astype(np.float32).tobytes()}
write_glb(a.out, j, b, rep)
print(f'reweight: dropped {dropped} arm weights, {dead.sum()} verts reassigned')
