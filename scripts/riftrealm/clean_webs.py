"""Clean two generated-mesh flaws that cost silhouette score against the turnaround art:
  - webbing between the legs: a membrane the shape model stretches from the crotch down (the art shows a gap);
  - shards: tiny disconnected fragments floating off the body.
  python scripts/riftrealm/clean_webs.py in.glb out.glb [--gap 0.35] [--top 0.18] [--shard 0]
Faces are dropped only below the crotch and inside the gap between the two thighs (a fraction --gap of the hip
joints' spacing either side of the centre line); components with fewer than --shard faces are dropped. The kept
geometry, UVs, weights and textures are unchanged (unused vertices stay, harmlessly)."""
import argparse, os, sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rr_parts import Rig, accessor  # noqa: E402


def joint_pos(rig, name):
    j, b = rig.j, rig.b
    ibm = accessor(j, b, j['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4)
    m = np.linalg.inv(ibm[rig.joint(name)].T)          # glTF matrices are column-major
    return m[:3, 3]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--gap', type=float, default=0.35); ap.add_argument('--shard', type=int, default=0)
    ap.add_argument('--top', type=float, default=0.18, help='start the web cut this far below the hip joints (m): the art keeps the hip armour')
    a = ap.parse_args()
    rig = Rig(a.src)
    V, F = rig.V, rig.F
    hips = joint_pos(rig, 'Hips'); lu, ru = joint_pos(rig, 'LeftUpLeg'), joint_pos(rig, 'RightUpLeg')
    lk, rk = joint_pos(rig, 'LeftLeg'), joint_pos(rig, 'RightLeg')
    cx, half = (lu[0] + ru[0]) / 2, abs(lu[0] - ru[0]) / 2 * a.gap
    crotch, knee = min(lu[1], ru[1]) - a.top, (lk[1] + rk[1]) / 2 - 0.08
    C = V[F].mean(1)
    web = (np.abs(C[:, 0] - cx) < half) & (C[:, 1] < crotch) & (C[:, 1] > knee)
    # a membrane face has vertices on BOTH sides of the centre line (a leg's own inner skin doesn't)
    xs = V[F][:, :, 0] - cx
    web &= (xs.min(1) < -half * 0.2) & (xs.max(1) > half * 0.2) | (web & (np.abs(xs).max(1) < half))
    keep = ~web
    n = len(V); Fk = F[keep]
    e = np.concatenate([Fk[:, [0, 1]], Fk[:, [1, 2]], Fk[:, [2, 0]]])
    g = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
    _, lab = connected_components(g, directed=False)
    fl = lab[Fk[:, 0]]; cnt = np.bincount(fl)
    small = cnt[fl] < a.shard   # off by default: a generated mesh is a soup of small pieces, real armour included
    idx = np.nonzero(keep)[0]; keep[idx[small]] = False
    print(f'hips {hips.round(3)}, crotch {crotch:.3f}, knee {knee:.3f}, gap ±{half:.3f}: web faces {int(web.sum())}, shard faces {int(small.sum())} of {len(F)}')
    rig.F = F[keep]; rig.fbody = len(rig.F)
    rig.save(a.out)


if __name__ == '__main__':
    main()
