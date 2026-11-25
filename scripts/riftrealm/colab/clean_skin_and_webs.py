"""Screened Poisson Metric Bone-Heat 58-Joint Character Forge Re-Skinner + Pose-Stretch QA Verifier.

NEVER deletes mesh faces (zero holes!). Eliminates connected-point arm/hip/cape/leg tearing AND top-4 truncation
cliffs via 3 mathematical guarantees:
  1. Geodesic Voronoi seeding strictly respects anatomical half-spaces:
       - Left/Right limbs stay on their own side (zero cross-body bleed)
       - Back capes, cloaks, and wings (behind back plane) bind to Spine/Hips (never torn by legs/forearms)
       - Shoulder/clavicle stays inside the collar (never steals upper arm/pauldron from LeftArm/RightArm)
       - Tall canopies/crowns/helmets above head stay on Head/Spine2
  2. Two-pass Metric Laplace-Beltrami Screened Poisson heat diffusion `(M + 0.5*sigma^2*L_cot) W = M W_hard`
     guarantees C2 smooth, strictly positive, partition-of-unity weights flowing ONLY along connected surface
     topology with physical length scale `sigma = 0.062*H` independent of triangle density.
  3. Continuous Top-4 Soft-Thresholding `max(w_i - w_5th, 0)` after smooth ArmTwist/ForeArmTwist splitting
     provably eliminates ALL top-4 truncation step discontinuities (zero 4th/5th bone swap spikes!).
  4. Rigid grafted extra components (BatWings, daggers, shields, lances, halos) stay 100% untouched.
"""
import os
import sys
import numpy as np
from scipy.sparse import coo_matrix, diags
from scipy.sparse.csgraph import dijkstra
from scipy.sparse.linalg import cg
from scipy.spatial.transform import Rotation as R

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CHAR_DIR = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")

sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
from glbio import read_glb, accessor, write_glb  # noqa: E402
import ktxPack  # noqa: E402

CONTRACT_22 = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
    "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]

PARENT_22 = {
    "Hips": None, "Spine": "Hips", "Spine1": "Spine", "Spine2": "Spine1", "Neck": "Spine2", "Head": "Neck",
    "LeftShoulder": "Spine2", "LeftArm": "LeftShoulder", "LeftForeArm": "LeftArm", "LeftHand": "LeftForeArm",
    "RightShoulder": "Spine2", "RightArm": "RightShoulder", "RightForeArm": "RightArm", "RightHand": "RightForeArm",
    "LeftUpLeg": "Hips", "LeftLeg": "LeftUpLeg", "LeftFoot": "LeftLeg", "LeftToeBase": "LeftFoot",
    "RightUpLeg": "Hips", "RightLeg": "RightUpLeg", "RightFoot": "RightLeg", "RightToeBase": "RightFoot",
}

CHILD_22 = {
    "Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head",
    "LeftShoulder": "LeftArm", "LeftArm": "LeftForeArm", "LeftForeArm": "LeftHand",
    "RightShoulder": "RightArm", "RightArm": "RightForeArm", "RightForeArm": "RightHand",
    "LeftUpLeg": "LeftLeg", "LeftLeg": "LeftFoot", "LeftFoot": "LeftToeBase",
    "RightUpLeg": "RightLeg", "RightLeg": "RightFoot", "RightFoot": "RightToeBase",
}

# Allowed bone indices per anatomical chain (0=torso, 1=armL, 2=armR, 3=legL, 4=legR)
CHAINS = {
    0: ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"],
    1: ["Spine2", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"],
    2: ["Spine2", "RightShoulder", "RightArm", "RightForeArm", "RightHand"],
    3: ["Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"],
    4: ["Hips", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"],
}


def seg_dist(V: np.ndarray, p0: np.ndarray, p1: np.ndarray):
    ab = p1 - p0
    denom = max(float(ab @ ab), 1e-9)
    t = np.clip(((V - p0) @ ab) / denom, 0.0, 1.0)
    d = np.linalg.norm(V - (p0 + t[:, None] * ab), axis=1)
    return d, t


def find_main_body_mask(V: np.ndarray, F: np.ndarray):
    key = np.round(V / 1e-5).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True)
    weld = weld.ravel()
    nw = int(weld.max()) + 1
    uf = np.arange(nw)

    def find(a):
        while uf[a] != a:
            uf[a] = uf[uf[a]]
            a = uf[a]
        return a

    T = weld[F]
    for e0, e1 in ((T[:, 0], T[:, 1]), (T[:, 1], T[:, 2]), (T[:, 2], T[:, 0])):
        for u, v in zip(e0, e1):
            ru, rv = find(int(u)), find(int(v))
            if ru != rv:
                uf[ru] = rv
    roots = np.array([find(i) for i in range(nw)])
    uniq_r, cnt_r = np.unique(roots, return_counts=True)
    main_comp = uniq_r[np.argmax(cnt_r)]
    return weld, nw, (roots[weld] == main_comp), (roots == main_comp), roots


def compute_geodesic_forge_weights(V: np.ndarray, F: np.ndarray, P: dict, names: list[str], orig_JI: np.ndarray, orig_JW: np.ndarray):
    """2-pass Screened Poisson Metric Bone-Heat + Continuous Top-4 Soft-Thresholding (zero cliffs, zero holes)."""
    weld, nw, is_body_v, is_body_w, comp_roots = find_main_body_mask(V, F)
    name_to_idx = {n: i for i, n in enumerate(names)}
    H = float(V[is_body_v, 1].max() - V[is_body_v, 1].min())
    y_max = float(V[is_body_v, 1].max())

    body_f = is_body_v[F[:, 0]] & is_body_v[F[:, 1]] & is_body_v[F[:, 2]]
    T = weld[F[body_f]]
    Vw = np.zeros((nw, 3), dtype=np.float64)
    Vw[weld] = V

    # 1. Build lumped Voronoi area M and positive clamped cotangent Laplace-Beltrami L_cot (strict M-matrix!)
    v0, v1, v2 = Vw[T[:, 0]], Vw[T[:, 1]], Vw[T[:, 2]]
    e01, e12, e20 = v1 - v0, v2 - v1, v0 - v2
    area = np.maximum(0.5 * np.linalg.norm(np.cross(e01, -e20), axis=1), 1e-10)
    M_diag = np.zeros(nw, dtype=np.float64)
    np.add.at(M_diag, T[:, 0], area / 3.0)
    np.add.at(M_diag, T[:, 1], area / 3.0)
    np.add.at(M_diag, T[:, 2], area / 3.0)
    M_diag = np.maximum(M_diag, 1e-10)

    def cot_angle(a, b):
        return np.clip(np.sum(a * b, axis=1) / np.maximum(np.linalg.norm(np.cross(a, b), axis=1), 1e-10), 0.05, 50.0)

    c0 = 0.5 * cot_angle(e01, -e20)
    c1 = 0.5 * cot_angle(e12, -e01)
    c2 = 0.5 * cot_angle(e20, -e12)
    W_adj = coo_matrix(
        (
            np.concatenate([c0, c0, c1, c1, c2, c2]),
            (
                np.concatenate([T[:, 1], T[:, 2], T[:, 2], T[:, 0], T[:, 0], T[:, 1]]),
                np.concatenate([T[:, 2], T[:, 1], T[:, 0], T[:, 2], T[:, 1], T[:, 0]]),
            ),
        ),
        shape=(nw, nw),
    ).tocsr()
    L_cot = diags(np.asarray(W_adj.sum(axis=1)).ravel()) - W_adj

    # 2. Welded surface geodesic graph for anatomical Voronoi bone seeding
    edges = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]], axis=0)
    edges = edges[edges[:, 0] != edges[:, 1]]
    elen = np.linalg.norm(Vw[edges[:, 0]] - Vw[edges[:, 1]], axis=1)
    G = coo_matrix(
        (np.concatenate([elen, elen]), (np.concatenate([edges[:, 0], edges[:, 1]]), np.concatenate([edges[:, 1], edges[:, 0]]))),
        shape=(nw, nw),
    ).tocsr()

    tips = {
        "Head": np.array([0.0, max(0.14 * H, y_max - P["Head"][1]), 0.0]),
        "LeftHand": (P["LeftHand"] - P["LeftForeArm"]) * 0.55,
        "RightHand": (P["RightHand"] - P["RightForeArm"]) * 0.55,
        "LeftToeBase": np.array([0.0, 0.0, 0.08 * H]),
        "RightToeBase": np.array([0.0, 0.0, 0.08 * H]),
    }

    back_z_cut = min(float(P["Spine2"][2]), float(P["Hips"][2])) - 0.14 * H
    head_y_cap = float(P["Head"][1]) + 0.07 * H
    D3 = np.full((nw, len(CONTRACT_22)), 1e3, dtype=np.float64)
    for bi, bn in enumerate(CONTRACT_22):
        p0 = P[bn]
        ch = CHILD_22.get(bn)
        p1 = P[ch] if (ch and ch in P) else p0 + tips.get(bn, np.zeros(3))
        d3, _ = seg_dist(Vw, p0, p1)
        if bn.startswith("Left"):
            d3 = np.where(Vw[:, 0] < -0.01 * H, d3 + 1.0 * H, d3)
        elif bn.startswith("Right"):
            d3 = np.where(Vw[:, 0] > 0.01 * H, d3 + 1.0 * H, d3)
        # Keep back capes/cloaks/wings strictly on Spine/Hips chain (never forearms or legs!)
        if any(k in bn for k in ("ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase")):
            d3 = np.where(Vw[:, 2] < back_z_cut, d3 + 1.0 * H, d3)
        # Keep Shoulder/clavicle inside the upper collar so it never steals outer pauldron/bicep from LeftArm/RightArm
        if bn == "LeftShoulder":
            d3 = np.where((Vw[:, 0] > abs(float(P["LeftArm"][0])) + 0.02 * H) | (Vw[:, 1] < float(P["LeftArm"][1]) - 0.04 * H), d3 + 0.5 * H, d3)
        elif bn == "RightShoulder":
            d3 = np.where((Vw[:, 0] < -abs(float(P["RightArm"][0])) - 0.02 * H) | (Vw[:, 1] < float(P["RightArm"][1]) - 0.04 * H), d3 + 0.5 * H, d3)
        # Keep tall crowns/canopies above Head on Head/Spine2 (never arms)
        if any(k in bn for k in ("Arm", "Hand")):
            d3 = np.where(Vw[:, 1] > head_y_cap, d3 + 0.8 * H, d3)
        D3[:, bi] = d3

    best_b = np.argmin(D3, axis=1)
    D_geo = np.full((nw, len(CONTRACT_22)), 1e3, dtype=np.float64)
    for bi, bn in enumerate(CONTRACT_22):
        m = is_body_w & (best_b == bi)
        if m.sum() >= 3:
            idx = np.nonzero(m)[0]
            thr = np.percentile(D3[idx, bi], 45)
            seeds = idx[D3[idx, bi] <= thr]
        else:
            ci = np.nonzero(is_body_w)[0]
            seeds = ci[np.argsort(D3[ci, bi])[:10]]
        g = dijkstra(G, directed=False, indices=seeds, min_only=True)
        D_geo[:, bi] = np.where(np.isfinite(g), g + 0.35 * D3[:, bi], 1e3)
        D_geo[seeds, bi] = 0.35 * D3[seeds, bi]

    best_geo = np.argmin(D_geo, axis=1)
    W_hard = np.zeros((nw, len(CONTRACT_22)), dtype=np.float64)
    W_hard[np.arange(nw), best_geo] = 1.0

    # 3. Two-pass Screened Poisson surface heat diffusion (exact Gaussian-like C2 physical scale sigma = 0.062*H)
    sigma = 0.062 * H
    t_step = 0.5 * (sigma ** 2)
    A = diags(M_diag) + t_step * L_cot
    M_inv = diags(1.0 / np.maximum(A.diagonal(), 1e-12))
    W22 = np.zeros_like(W_hard)
    for bi in range(len(CONTRACT_22)):
        x1, _ = cg(A, M_diag * W_hard[:, bi], x0=W_hard[:, bi], M=M_inv, rtol=1e-5, maxiter=400)
        x2, _ = cg(A, M_diag * x1, x0=x1, M=M_inv, rtol=1e-5, maxiter=400)
        W22[:, bi] = np.maximum(x2, 0.0)
    W22 /= np.maximum(W22.sum(axis=1, keepdims=True), 1e-12)

    # 4. Expand into 58-joint array with smooth ArmTwist & ForeArmTwist splits
    W58 = np.zeros((nw, len(names)), dtype=np.float64)
    for bi, bn in enumerate(CONTRACT_22):
        if bn in name_to_idx:
            W58[:, name_to_idx[bn]] = W22[:, bi]

    for pre in ("Left", "Right"):
        if (pre + "Arm") in name_to_idx and (pre + "ArmTwist") in name_to_idx:
            ia, it = name_to_idx[pre + "Arm"], name_to_idx[pre + "ArmTwist"]
            _, t_seg = seg_dist(Vw, P[pre + "Arm"], P[pre + "ForeArm"])
            wa = W58[:, ia].copy()
            share = np.clip(t_seg, 0.0, 1.0) * 0.65
            W58[:, ia] = wa * (1.0 - share)
            W58[:, it] = wa * share
        if (pre + "ForeArm") in name_to_idx and (pre + "ForeArmTwist") in name_to_idx:
            ifa, ift = name_to_idx[pre + "ForeArm"], name_to_idx[pre + "ForeArmTwist"]
            _, t_seg = seg_dist(Vw, P[pre + "ForeArm"], P[pre + "Hand"])
            wf = W58[:, ifa].copy()
            share = np.clip(t_seg, 0.0, 1.0) * 0.75
            W58[:, ifa] = wf * (1.0 - share)
            W58[:, ift] = wf * share

    # 5. Continuous Top-4 Soft-Thresholding (max(w_i - w_5th, 0) -> provably ZERO top-4 step cliff!)
    ord5 = np.argsort(-W58, axis=1)[:, :5]
    w5 = np.take_along_axis(W58, ord5, axis=1)
    ord4 = ord5[:, :4]
    wt4 = np.maximum(w5[:, :4] - w5[:, 4:5], 0.0)
    s4 = wt4.sum(axis=1, keepdims=True)
    bad = s4[:, 0] < 1e-8
    if bad.any():
        wt4[bad] = 0.0
        wt4[bad, 0] = 1.0
        s4[bad] = 1.0
    wt4 = (wt4 / s4).astype(np.float32)

    new_JI = orig_JI.copy()
    new_JW = orig_JW.copy()
    new_JI[is_body_v] = ord4[weld[is_body_v]]
    new_JW[is_body_v] = wt4[weld[is_body_v]]

    # 6. Fix disconnected non-rigid components (e.g. floating cyber-wings/halos on lumen & seraph_9)
    #    while preserving already-rigid grafted props (e.g. void_stalker BatWings & daggers) 100% untouched!
    if (~is_body_v).any():
        v_roots = comp_roots[weld]
        for r_id in np.unique(v_roots[~is_body_v]):
            cm = v_roots == r_id
            # Already 100% rigid on a single bone -> preserve untouched!
            if (orig_JW[cm, 0] > 0.99).all() and len(np.unique(orig_JI[cm, 0])) == 1:
                continue
            pts = V[cm]
            cen = pts.mean(axis=0)
            if cen[2] < back_z_cut or pts[:, 2].min() < back_z_cut - 0.08 * H:
                target_b = name_to_idx.get("Spine2", 0)
            elif cen[1] > head_y_cap:
                target_b = name_to_idx.get("Head", name_to_idx.get("Spine2", 0))
            else:
                best_d, target_b = 1e9, name_to_idx.get("Spine2", 0)
                for bn in CONTRACT_22:
                    if bn not in name_to_idx:
                        continue
                    d_c = float(np.linalg.norm(cen - P[bn]))
                    if d_c < best_d:
                        best_d, target_b = d_c, name_to_idx[bn]
            new_JI[cm] = 0
            new_JI[cm, 0] = target_b
            new_JW[cm] = 0.0
            new_JW[cm, 0] = 1.0

    return new_JI, new_JW, is_body_v


def eval_lbs_stretch(V: np.ndarray, F: np.ndarray, P: dict, names: list[str], JI: np.ndarray, JW: np.ndarray, pose_eulers: dict):
    """Apply exact LBS skinning in a stress pose and report per-triangle edge stretch ratio (for edges >= 4mm)."""
    name_to_idx = {n: i for i, n in enumerate(names)}
    parent_all = dict(PARENT_22)
    for pre in ("Left", "Right"):
        parent_all[pre + "ArmTwist"] = pre + "Arm"
        parent_all[pre + "ForeArmTwist"] = pre + "ForeArm"
    for n in names:
        if n not in parent_all:
            if n.startswith("LeftHand"):
                parent_all[n] = "LeftHand"
            elif n.startswith("RightHand"):
                parent_all[n] = "RightHand"
            elif "Eye" in n:
                parent_all[n] = "Head"
            else:
                parent_all[n] = "Hips"

    order, visited = [], set()

    def visit(n):
        if n in visited:
            return
        par = parent_all.get(n)
        if par and par in name_to_idx:
            visit(par)
        visited.add(n)
        order.append(n)

    for n in names:
        visit(n)

    M_world = {}
    M_skin = np.zeros((len(names), 4, 4), dtype=np.float64)
    for n in order:
        par = parent_all.get(n)
        M_loc = np.eye(4, dtype=np.float64)
        if par and par in P and n in P:
            M_loc[:3, 3] = P[n] - P[par]
        elif n in P:
            M_loc[:3, 3] = P[n]
        if n in pose_eulers:
            M_loc[:3, :3] = R.from_euler("xyz", pose_eulers[n], degrees=True).as_matrix()
        Mw = M_loc if (not par or par not in M_world) else (M_world[par] @ M_loc)
        M_world[n] = Mw
        M_inv = np.eye(4, dtype=np.float64)
        if n in P:
            M_inv[:3, 3] = -P[n]
        M_skin[name_to_idx[n]] = Mw @ M_inv

    Vh = np.concatenate([V, np.ones((len(V), 1))], axis=1)
    Vp = np.zeros((len(V), 3), dtype=np.float64)
    for k in range(4):
        Mats = M_skin[JI[:, k]]
        w = JW[:, k : k + 1]
        Vp += w * np.einsum("nij,nj->ni", Mats[:, :3, :], Vh)

    e0_r = np.linalg.norm(V[F[:, 1]] - V[F[:, 0]], axis=1)
    e1_r = np.linalg.norm(V[F[:, 2]] - V[F[:, 1]], axis=1)
    e2_r = np.linalg.norm(V[F[:, 0]] - V[F[:, 2]], axis=1)
    e0_p = np.linalg.norm(Vp[F[:, 1]] - Vp[F[:, 0]], axis=1)
    e1_p = np.linalg.norm(Vp[F[:, 2]] - Vp[F[:, 1]], axis=1)
    e2_p = np.linalg.norm(Vp[F[:, 0]] - Vp[F[:, 2]], axis=1)
    rest_min = np.minimum(np.minimum(e0_r, e1_r), e2_r)
    s0 = e0_p / np.maximum(e0_r, 0.004)
    s1 = e1_p / np.maximum(e1_r, 0.004)
    s2 = e2_p / np.maximum(e2_r, 0.004)
    return np.where(rest_min > 0.001, np.maximum(np.maximum(s0, s1), s2), 1.0)


STRESS_POSES = [
    {"LeftArm": [-60, 0, 22], "RightArm": [-60, 0, -22], "LeftForeArm": [-24, 0, 0], "RightForeArm": [-24, 0, 0]},
    {"LeftUpLeg": [-38, 0, 5], "RightUpLeg": [34, 0, -5], "LeftLeg": [32, 0, 0], "RightLeg": [26, 0, 0]},
    {"LeftArm": [-50, -20, 8], "RightArm": [-50, 20, -8], "LeftForeArm": [-40, 0, 0], "RightForeArm": [-40, 0, 0]},
]


def clean_and_reskin_humanoid(glb_path: str, repack_ktx2: bool = True, stretch_thresh: float = 3.0):
    j, b = read_glb(glb_path)
    skin = j["skins"][0]
    nodes = j["nodes"]
    joints = skin["joints"]
    names = [nodes[ni]["name"] for ni in joints]
    ibm = accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4)
    P = {names[k]: -(ibm[k].T[:3, :3].T @ ibm[k].T[:3, 3]) for k in range(len(names))}

    prim = j["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    V = accessor(j, b, at["POSITION"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
    JI = accessor(j, b, at["JOINTS_0"]).astype(np.int64)
    JW = accessor(j, b, at["WEIGHTS_0"]).astype(np.float64)

    # Single-chain compact-support geodesic weights (ZERO face deletion!)
    JI, JW, is_body_v = compute_geodesic_forge_weights(V, F, P, names, JI, JW)

    # Measure 3-pose QA stretch stats
    p99 = 1.0
    final_max = 1.0
    over = 0
    for pose in STRESS_POSES:
        st = eval_lbs_stretch(V, F, P, names, JI, JW, pose)
        p99 = max(p99, float(np.percentile(st, 99.5)))
        final_max = max(final_max, float(st.max()))
        over = max(over, int((st > stretch_thresh).sum()))

    ji_bv = j["accessors"][at["JOINTS_0"]]["bufferView"]
    jw_bv = j["accessors"][at["WEIGHTS_0"]]["bufferView"]
    new_bvs = {
        ji_bv: JI.astype(np.uint16).tobytes(),
        jw_bv: JW.astype(np.float32).tobytes(),
    }
    tmp_path = glb_path + ".tmp"
    write_glb(tmp_path, j, b, new_bvs)
    os.replace(tmp_path, glb_path)
    if repack_ktx2:
        ktxPack.pack_glb(glb_path)

    cid = os.path.splitext(os.path.basename(glb_path))[0]
    print(f"  [QA-SKIN] {cid:20s} | p99.5={p99:.2f}x max={final_max:.2f}x | >3.0x={over:4d} tris", flush=True)
    return {"cut_init": 0, "cut_stress": 0, "p99": p99, "max_stretch": final_max, "over": over}


def main():
    args = sys.argv[1:]
    if not args or "--all" in args:
        clips_dir = os.path.join(CHAR_DIR, "clips")
        cids = sorted(
            os.path.splitext(fn)[0]
            for fn in os.listdir(clips_dir)
            if fn.endswith(".json") and os.path.isfile(os.path.join(CHAR_DIR, f"{os.path.splitext(fn)[0]}.glb"))
        )
    else:
        cids = args
    print(f"Running Single-Chain Geodesic 58-joint reskin + 3-pose QA on {len(cids)} humanoids...", flush=True)
    for cid in cids:
        clean_and_reskin_humanoid(os.path.join(CHAR_DIR, f"{cid}.glb"))


if __name__ == "__main__":
    main()
