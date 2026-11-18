"""Re-skin a rigged GLB with GEODESIC bone weights (distance along the mesh surface, not through the air).
autoRig.py's straight-line envelopes make coat flaps near the hands follow the arms; here a vertex's weight for a bone
depends on how far along the surface it is from that bone's segment, so surfaces that merely sit next to a limb don't.
  python geo_weights.py rigged.glb joints.json out.glb [--seed 0.055 --power 3 --eps 0.03 --smooth 2]
joints.json = autoRig.py --debug output."""
import argparse, json, os, sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ravencrest'))
from glbio import read_glb, accessor, write_glb

ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('joints'); ap.add_argument('out')
ap.add_argument('--seed', type=float, default=0.055); ap.add_argument('--power', type=float, default=3.0)
ap.add_argument('--eps', type=float, default=0.03); ap.add_argument('--smooth', type=int, default=2)
a = ap.parse_args()
j, b = read_glb(a.glb); P = {k: np.array(v) for k, v in json.load(open(a.joints)).items()}
nodes = j['nodes']; joints = j['skins'][0]['joints']; names = [nodes[i]['name'] for i in joints]
parent = {c: i for i, nd in enumerate(nodes) for c in nd.get('children', [])}
prim = j['meshes'][0]['primitives'][0]; at = prim['attributes']
V = accessor(j, b, at['POSITION']).astype(float); F = accessor(j, b, prim['indices']).reshape(-1, 3).astype(int)
# weld by position so UV seams don't cut the graph
key = np.round(V / 1e-5).astype(np.int64); _, weld = np.unique(key, axis=0, return_inverse=True); weld = weld.ravel(); nw = weld.max() + 1
Vw = np.zeros((nw, 3)); Vw[weld] = V
T = weld[F]; e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]); e = e[e[:, 0] != e[:, 1]]
w = np.linalg.norm(Vw[e[:, 0]] - Vw[e[:, 1]], axis=1)
G = coo_matrix((np.concatenate([w, w]), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(nw, nw)).tocsr()
Hh = V[:, 1].max()
tips = {'Head': np.array([0, Hh - P['Head'][1], 0]), 'LeftHand': (P['LeftHand'] - P['LeftForeArm']) * 0.6, 'RightHand': (P['RightHand'] - P['RightForeArm']) * 0.6,
        'LeftToeBase': np.array([0, 0, 0.08]), 'RightToeBase': np.array([0, 0, 0.08])}
kids = {n: [names[k] for k in range(len(names)) if names[k] != n and (joints[k] in parent and nodes[parent[joints[k]]]['name'] == n)] for n in names}
D = np.full((nw, len(names)), 1e3)
for i, n in enumerate(names):
    p0 = P[n]; p1 = np.mean([P[k] for k in kids[n]], axis=0) if kids[n] else p0 + tips.get(n, np.zeros(3))
    ab = p1 - p0; t = np.clip(((Vw - p0) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    d3 = np.linalg.norm(Vw - (p0 + t[:, None] * ab), axis=1)
    side = np.sign(P[n][0]) if n.startswith(('Left', 'Right')) else 0
    ok = (d3 < a.seed) & ((np.sign(Vw[:, 0]) == side) | (np.abs(Vw[:, 0]) < 0.04) | (side == 0))
    if ok.sum() < 3: ok = d3 < np.sort(d3)[:20].max() + 1e-6
    seeds = np.nonzero(ok)[0]
    g = dijkstra(G, directed=False, indices=seeds, min_only=True)
    D[:, i] = np.where(np.isfinite(g), g, 1e3)
    # the seed band itself is distance 0: add its 3D offset so the closest of several overlapping bones wins
    D[seeds, i] = d3[seeds] * 0.5
W = 1.0 / (D + a.eps) ** a.power
W /= W.sum(1, keepdims=True)
Aj = G.copy(); Aj.data[:] = 1; deg = np.asarray(Aj.sum(1)).ravel()
for _ in range(a.smooth): W = 0.5 * W + 0.5 * (Aj @ W) / np.maximum(deg, 1)[:, None]
Wv = W[weld]
idx = np.argsort(-Wv, axis=1)[:, :4]; wt = np.take_along_axis(Wv, idx, 1); wt /= wt.sum(1, keepdims=True)
rep = {j['accessors'][at['JOINTS_0']]['bufferView']: idx.astype(np.uint16).tobytes(),
       j['accessors'][at['WEIGHTS_0']]['bufferView']: wt.astype(np.float32).tobytes()}
write_glb(a.out, j, b, rep)
print('geodesic weights written ->', a.out)
