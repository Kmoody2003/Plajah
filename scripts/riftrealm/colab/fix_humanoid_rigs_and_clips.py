"""Fix all 22 humanoid Character Forge rigs, isolate arm/torso/wing skin bleed, and world-space retarget all clips.

Fixes 3 root causes spotted in live Rig Viewer QA:
  1. Re-fits misplaced/asymmetric skeleton anchors (e.g. Lumen arms placed on wings, Android elbows at waist,
     Gorgon right arm collapsed on tail, Moss Golem knee/hand outside body, Magma Titan / Minotaur wide hands)
     strictly inside the true sculpted body torso & limbs (excluding wings/capes/tails), then re-runs forgeRigMesh.ts.
  2. Runs a spatial + cross-side + back/wing/cape skin-weight isolation pass across all 22 58-joint Forge GLBs so
     arm/forearm/hand bones never grab chest, rib, hip, coat, skirt, or wing vertices (while preserving rigid grafted
     parts like Void Stalker's BatWings & daggers 100% untouched).
  3. Performs true world-space rest-pose retargeting (matching services/mocap/retarget.ts) from the canonical solved
     source rig (backup_orig/void_stalker.glb) onto every character's exact cleaned 58-joint skeleton, preserving clip
     quality grades and enforcing quaternion hemisphere continuity.
"""
import copy
import json
import os
import subprocess
import sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.spatial.transform import Rotation as R

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CHAR_DIR = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CLIPS_DIR = os.path.join(CHAR_DIR, "clips")
BAK_DIR = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch4_redo\backup_orig"
WORK_DIR = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\rig_fix"

sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
from glbio import read_glb, accessor, write_glb  # noqa: E402
import ktxPack  # noqa: E402

REF_GLB = os.path.join(BAK_DIR, "void_stalker.glb")
REF_CLIPS = os.path.join(BAK_DIR, "void_stalker.json")
PALADIN_ORIG_CLIPS = os.path.join(BAK_DIR, "robot_paladin.json")

# Characters whose autoRig anchors had severe limb/wing/elbow/asymmetry placement bugs and must be cleanly re-anchored
REANCHOR_IDS = {
    "lumen",
    "gorgon_construct",
    "android_a",
    "android_b",
    "prism_archon",
    "shadow_assassin",
    "moss_golem",
    "magma_titan",
    "cyber_minotaur",
    "cyber_harpy",
    "fallen_archangel",
}

# Hulking/wide-arm characters get a slightly more generous forearm/deltoid capsule radius during bleed isolation
BULKY_IDS = {"magma_titan", "moss_golem", "cyber_minotaur", "pyre", "pyre_knight", "robot_paladin", "demon_warrior"}


def extract_joints(glb_path: str):
    j, b = read_glb(glb_path)
    skin = j["skins"][0]
    ibm = accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4)
    pos = {}
    for k, ni in enumerate(skin["joints"]):
        nm = j["nodes"][ni]["name"]
        m = ibm[k].T
        pos[nm] = -(m[:3, :3].T @ m[:3, 3])
    return j, b, pos


def clusters_1d(xs: np.ndarray, gap: float):
    if len(xs) == 0:
        return []
    xs = np.sort(xs)
    cuts = np.where(np.diff(xs) > gap)[0]
    return np.split(xs, cuts + 1)


def fit_clean_humanoid_anchors(V: np.ndarray, existing_pos: dict) -> dict:
    """Wing/cape/tail-safe symmetrical 22-joint humanoid anchor fitter strictly inside the body mesh."""
    H = float(V[:, 1].max() - V[:, 1].min())
    y0 = float(V[:, 1].min())
    P = {}

    # 1. Estimate true torso Z-centerline using narrow central band |x| < 0.14*H across y in [0.45, 0.85]
    # Use upper percentile of Z (front/body side) if wings/cape extend far behind -Z!
    def torso_slice_z(yf: float, half_band: float = 0.03):
        y = y0 + yf * H
        s = V[(np.abs(V[:, 1] - y) < half_band * H) & (np.abs(V[:, 0]) < 0.12 * H)]
        if len(s) < 12:
            s = V[(np.abs(V[:, 1] - y) < 0.06 * H) & (np.abs(V[:, 0]) < 0.18 * H)]
        if len(s) < 6:
            return 0.0
        # If depth > 0.28*H (cape/wings/tail sticking far back), focus on front core cluster (top 65% Z)
        z_lo, z_hi = np.percentile(s[:, 2], [5, 95])
        if (z_hi - z_lo) > 0.26 * H:
            z_cut = z_hi - 0.24 * H
            core = s[s[:, 2] >= z_cut]
            if len(core) >= 8:
                return float(np.median(core[:, 2]))
        return float(np.median(s[:, 2]))

    # Canonical anatomical Y fractions (matching Character Forge / Muse proportions)
    y_hips = 0.515
    y_spine = 0.575
    y_spine1 = 0.655
    y_spine2 = 0.745
    y_neck = 0.835
    y_head = 0.885
    y_shoulder = 0.805
    y_arm = 0.785
    y_knee = 0.275
    y_foot = 0.068

    z_hips = torso_slice_z(y_hips)
    z_spine = torso_slice_z(y_spine)
    z_spine1 = torso_slice_z(y_spine1)
    z_spine2 = torso_slice_z(y_spine2)
    z_neck = torso_slice_z(y_neck)
    z_head = torso_slice_z(y_head)

    P["Hips"] = np.array([0.0, y0 + y_hips * H, z_hips])
    P["Spine"] = np.array([0.0, y0 + y_spine * H, z_spine])
    P["Spine1"] = np.array([0.0, y0 + y_spine1 * H, z_spine1])
    P["Spine2"] = np.array([0.0, y0 + y_spine2 * H, z_spine2])
    P["Neck"] = np.array([0.0, y0 + y_neck * H, z_neck])
    P["Head"] = np.array([0.0, y0 + y_head * H, z_head])

    # Restrict limb search to body Z-slab around torso centerline (excludes back wings, tails, floating capes!)
    body_z_center = 0.5 * (z_hips + z_spine2)
    V_body = V[(V[:, 2] > body_z_center - 0.20 * H) & (V[:, 2] < body_z_center + 0.24 * H)]
    if len(V_body) < 200:
        V_body = V

    # 2. Fit legs symmetrically from V_body
    def fit_leg_x_z(yf: float, default_x: float):
        y = y0 + yf * H
        xs_abs, zs = [], []
        for side in (1, -1):
            s = V_body[(np.abs(V_body[:, 1] - y) < 0.03 * H) & (V_body[:, 0] * side > 0.02 * H) & (V_body[:, 0] * side < 0.30 * H)]
            if len(s) >= 10:
                xs_abs.append(float(np.median(np.abs(s[:, 0]))))
                zs.append(float(np.median(s[:, 2])))
        if xs_abs:
            return float(np.clip(np.median(xs_abs), 0.05 * H, 0.22 * H)), float(np.median(zs))
        return default_x * H, z_hips

    hip_x, hip_lz = fit_leg_x_z(0.48, 0.075)
    knee_x, knee_z = fit_leg_x_z(y_knee, 0.09)
    foot_x, foot_z = fit_leg_x_z(y_foot, 0.105)
    # Clamp knee_x smoothly between hip_x and foot_x + slight stance tolerance so knees never jut wildly
    knee_x = float(np.clip(knee_x, min(hip_x, foot_x) - 0.03 * H, max(hip_x, foot_x) + 0.04 * H))
    knee_z = float(np.clip(knee_z, z_hips - 0.06 * H, z_hips + 0.08 * H))
    foot_z = float(np.clip(foot_z, z_hips - 0.09 * H, z_hips + 0.08 * H))

    # Measure toe forward extent
    feet_pts = V_body[(V_body[:, 1] < y0 + 0.06 * H) & (np.abs(V_body[:, 0]) < 0.28 * H)]
    toe_z = float(np.percentile(feet_pts[:, 2], 85)) if len(feet_pts) >= 10 else foot_z + 0.08 * H
    toe_z = float(np.clip(toe_z, foot_z + 0.04 * H, foot_z + 0.14 * H))

    for side, pre in ((1, "Left"), (-1, "Right")):
        P[pre + "UpLeg"] = np.array([side * hip_x, y0 + y_hips * H, 0.5 * (z_hips + hip_lz)])
        P[pre + "Leg"] = np.array([side * knee_x, y0 + y_knee * H, knee_z])
        P[pre + "Foot"] = np.array([side * foot_x, y0 + y_foot * H, foot_z])
        P[pre + "ToeBase"] = np.array([side * foot_x, y0 + 0.018 * H, toe_z])

    # 3. Fit arms symmetrically inside body Z-slab (strictly ignoring wings/weapons outside |x| > 0.44*H)
    arm_candidates = []
    for side in (1, -1):
        pts = []
        prev_x = None
        for yf in np.linspace(y_arm - 0.02, 0.44, 32):
            y = y0 + yf * H
            s = V_body[
                (np.abs(V_body[:, 1] - y) < 0.022 * H)
                & (V_body[:, 0] * side > 0.07 * H)
                & (V_body[:, 0] * side < 0.45 * H)
            ]
            if len(s) < 8:
                continue
            runs = [r for r in clusters_1d(s[:, 0] * side, 0.022 * H) if len(r) >= 6]
            if len(runs) >= 2:
                # Pick outermost body arm cluster (ignoring extreme wing tips already cut by Z-slab & 0.45*H)
                arm_r = max(runs, key=lambda r: float(r.mean()))
                cx = float(arm_r.mean())
                if prev_x is not None and abs(cx - prev_x) > 0.09 * H:
                    break
                sel = s[(s[:, 0] * side >= arm_r.min()) & (s[:, 0] * side <= arm_r.max())]
                pts.append(np.array([cx, y, float(np.median(sel[:, 2]))]))
                prev_x = cx
            elif pts:
                # Track outer edge if arm gets close to hip
                if prev_x is not None:
                    near = s[np.abs(s[:, 0] * side - prev_x) < 0.06 * H]
                    if len(near) >= 6:
                        cx = float(np.median(near[:, 0] * side))
                        pts.append(np.array([cx, y, float(np.median(near[:, 2]))]))
                        prev_x = cx
                        continue
                break
        if len(pts) >= 5:
            arm_candidates.append(np.array(pts))

    # Measure upper-torso width at shoulder height to clamp arm start cleanly
    sh_slice = V_body[(np.abs(V_body[:, 1] - (y0 + y_arm * H)) < 0.03 * H) & (np.abs(V_body[:, 0]) < 0.36 * H)]
    torso_half_w = float(np.percentile(np.abs(sh_slice[:, 0]), 88)) if len(sh_slice) >= 16 else 0.16 * H
    arm_x0 = float(np.clip(torso_half_w * 0.72, 0.09 * H, 0.22 * H))

    if arm_candidates:
        # Use the side with cleaner anatomical span (closest to ~0.30*H total drop), or average both if symmetric
        def arm_span(pts):
            return float(pts[0, 1] - pts[-1, 1])

        best_pts = min(arm_candidates, key=lambda pts: abs(arm_span(pts) - 0.29 * H))
        if len(arm_candidates) == 2 and abs(arm_span(arm_candidates[0]) - arm_span(arm_candidates[1])) < 0.08 * H:
            # Blend symmetrical top/mid/bottom
            p_top = 0.5 * (arm_candidates[0][0] + arm_candidates[1][0])
            p_mid = 0.5 * (arm_candidates[0][len(arm_candidates[0]) // 2] + arm_candidates[1][len(arm_candidates[1]) // 2])
            p_bot = 0.5 * (arm_candidates[0][-1] + arm_candidates[1][-1])
        else:
            p_top = best_pts[0]
            p_mid = best_pts[len(best_pts) // 2]
            p_bot = best_pts[-1]
        # Clamp anatomical vertical proportions cleanly: Arm ~ 0.785H, ForeArm ~ 0.645H, Hand ~ 0.515H
        ax0 = float(np.clip(p_top[0], arm_x0 * 0.85, 0.24 * H))
        ay0 = y0 + y_arm * H
        az0 = float(np.clip(p_top[2], z_spine2 - 0.05 * H, z_spine2 + 0.05 * H))

        hx = float(np.clip(p_bot[0], ax0 + 0.03 * H, 0.36 * H))
        hy = float(np.clip(p_bot[1], y0 + 0.45 * H, y0 + 0.56 * H))
        hz = float(np.clip(p_bot[2], z_spine2 - 0.06 * H, z_spine2 + 0.10 * H))

        # True anatomical elbow sits midway between shoulder and wrist
        fx = float(np.clip(p_mid[0], min(ax0, hx) - 0.02 * H, max(ax0, hx) + 0.04 * H))
        fy = 0.50 * (ay0 + hy)
        fz = float(np.clip(p_mid[2], min(az0, hz) - 0.04 * H, max(az0, hz) + 0.03 * H))
    else:
        ax0, ay0, az0 = arm_x0, y0 + y_arm * H, z_spine2
        fx, fy, fz = arm_x0 + 0.07 * H, y0 + 0.645 * H, z_spine2 - 0.01 * H
        hx, hy, hz = arm_x0 + 0.13 * H, y0 + 0.515 * H, z_spine2 + 0.01 * H

    for side, pre in ((1, "Left"), (-1, "Right")):
        P[pre + "Shoulder"] = np.array([side * (ax0 * 0.42), y0 + y_shoulder * H, z_spine2])
        P[pre + "Arm"] = np.array([side * ax0, ay0, az0])
        P[pre + "ForeArm"] = np.array([side * fx, fy, fz])
        P[pre + "Hand"] = np.array([side * hx, hy, hz])

    return P


def write_reanchored_contract_glb(src_glb: str, dst_glb: str, P: dict):
    """Update the 22 contract joints' inverseBindMatrices in a minimal contract GLB for forgeRigMesh.ts."""
    j, b = read_glb(src_glb)
    skin = j["skins"][0]
    nodes = j["nodes"]
    joints = skin["joints"]
    names = [nodes[ni]["name"] for ni in joints]

    # Build clean 22-joint contract subset or update existing IBMs in place so forgeRigMesh reads P directly!
    ibm = accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4).copy()
    for k, nm in enumerate(names):
        if nm in P:
            m = np.eye(4, dtype=np.float32)
            m[:3, 3] = -P[nm].astype(np.float32)
            ibm[k] = m.T  # glTF column-major stored transposed in row-major numpy
    bv = j["accessors"][skin["inverseBindMatrices"]]["bufferView"]
    write_glb(dst_glb, j, b, {bv: ibm.astype(np.float32).tobytes()})


def isolate_arm_weights(glb_path: str, cid: str):
    """Remove arm/forearm/hand/finger weight bleed from torso, ribs, hips, coats, capes & wings on a 58-joint Forge GLB."""
    j, b = read_glb(glb_path)
    skin = j["skins"][0]
    nodes = j["nodes"]
    joints = skin["joints"]
    names = [nodes[ni]["name"] for ni in joints]
    name_to_idx = {n: k for k, n in enumerate(names)}
    ibm = accessor(j, b, skin["inverseBindMatrices"]).reshape(-1, 4, 4)
    P = {names[k]: -(ibm[k].T[:3, :3].T @ ibm[k].T[:3, 3]) for k in range(len(names))}

    prim = j["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    V = accessor(j, b, at["POSITION"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
    JI = accessor(j, b, at["JOINTS_0"]).astype(np.int64).copy()
    JW = accessor(j, b, at["WEIGHTS_0"]).astype(np.float64).copy()
    nv = len(V)

    # Detect welded connected components so rigid grafted extra parts (BatWings, daggers, halo) are NEVER modified
    key = np.round(V / 1e-5).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True)
    weld = weld.ravel()
    nw = int(weld.max()) + 1
    parent_uf = np.arange(nw)

    def find(a):
        while parent_uf[a] != a:
            parent_uf[a] = parent_uf[parent_uf[a]]
            a = parent_uf[a]
        return a

    T = weld[F]
    for e0, e1 in ((T[:, 0], T[:, 1]), (T[:, 1], T[:, 2]), (T[:, 2], T[:, 0])):
        for u, v in zip(e0, e1):
            ru, rv = find(int(u)), find(int(v))
            if ru != rv:
                parent_uf[ru] = rv
    roots = np.array([find(i) for i in range(nw)])
    uniq_r, counts_r = np.unique(roots, return_counts=True)
    main_comp = uniq_r[np.argmax(counts_r)]
    is_body = roots[weld] == main_comp

    # Expand dense weight matrix over body vertices for clean isolation + smoothing
    def seg_dist(p0, p1):
        ab = p1 - p0
        denom = max(float(ab @ ab), 1e-9)
        t = np.clip(((V - p0) @ ab) / denom, 0.0, 1.0)
        return np.linalg.norm(V - (p0 + t[:, None] * ab), axis=1)

    H = float(V[is_body, 1].max() - V[is_body, 1].min())
    bulky = cid in BULKY_IDS
    r_mul = 1.28 if bulky else 1.0

    # Compute tight per-segment distance limits
    sp2_z = float(P["Spine2"][2])
    dropped = 0
    for side_sign, pre in ((1.0, "Left"), (-1.0, "Right")):
        sh = P[pre + "Shoulder"]
        arm = P[pre + "Arm"]
        fore = P[pre + "ForeArm"]
        hand = P[pre + "Hand"]
        hand_tip = hand + (hand - fore) * 0.45
        arm_len = max(0.18, float(np.linalg.norm(fore - arm)))
        fore_len = max(0.16, float(np.linalg.norm(hand - fore)))

        d_sh = seg_dist(sh, arm)
        d_up = seg_dist(arm, fore)
        d_fo = seg_dist(fore, hand)
        d_ha = seg_dist(hand, hand_tip)
        d_chain = np.minimum(np.minimum(d_up, d_fo), d_ha)

        r_sh = max(0.12, arm_len * 0.46) * r_mul
        r_up = max(0.10, arm_len * 0.40) * r_mul
        r_fo = max(0.085, fore_len * 0.36) * r_mul
        r_ha = max(0.095, fore_len * 0.42) * r_mul

        # Inner torso / back-cape / cross-side mask: vertices clearly on torso center, wrong side, or behind back
        wrong_side = (V[:, 0] * side_sign) < -0.02
        inner_torso = (V[:, 0] * side_sign) < (abs(float(arm[0])) * 0.58)
        behind_back = (V[:, 2] < sp2_z - 0.12 * H) & (d_chain > r_up * 0.72)

        bone_limits = [
            (pre + "Shoulder", d_sh, r_sh, False),
            (pre + "Arm", d_up, r_up, True),
            (pre + "ArmTwist", d_up, r_up, True),
            (pre + "ForeArm", d_fo, r_fo, True),
            (pre + "ForeArmTwist", d_fo, r_fo, True),
            (pre + "Hand", d_ha, r_ha, True),
        ]
        for nm in names:
            if nm.startswith(pre + "Hand") and nm != pre + "Hand":
                bone_limits.append((nm, d_ha, r_ha, True))

        for bn, d_arr, r_lim, strict_torso in bone_limits:
            if bn not in name_to_idx:
                continue
            bi = name_to_idx[bn]
            bad_v = is_body & (wrong_side | (d_arr > r_lim) | behind_back | (inner_torso if strict_torso else False))
            mask = (JI == bi) & bad_v[:, None] & (JW > 0.0)
            c = int(mask.sum())
            if c:
                dropped += c
                JW[mask] = 0.0

    # Also enforce strict Left/Right leg separation so inner-thigh / skirt vertices never drag across legs
    for side_sign, pre in ((1.0, "Left"), (-1.0, "Right")):
        wrong_leg = is_body & ((V[:, 0] * side_sign) < -0.03)
        for part in ("UpLeg", "Leg", "Foot", "ToeBase"):
            bn = pre + part
            if bn in name_to_idx:
                bi = name_to_idx[bn]
                mask = (JI == bi) & wrong_leg[:, None] & (JW > 0.0)
                if mask.any():
                    dropped += int(mask.sum())
                    JW[mask] = 0.0

    # Any body vertex left with very low remaining weight -> assign to nearest core torso/leg bone
    wsum = JW.sum(axis=1)
    dead = is_body & (wsum < 0.05)
    if dead.any():
        core_bones = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]
        core_idx = [name_to_idx[n] for n in core_bones if n in name_to_idx]
        core_pts = np.array([P[names[i]] for i in core_idx])
        vd = V[dead]
        dists = np.linalg.norm(vd[:, None, :] - core_pts[None, :, :], axis=2)
        best_c = np.argmin(dists, axis=1)
        di = np.nonzero(dead)[0]
        for k_i, vi in enumerate(di):
            JI[vi] = [core_idx[best_c[k_i]], 0, 0, 0]
            JW[vi] = [1.0, 0.0, 0.0, 0.0]

    # Renormalize & sort top-4 descending
    wsum = np.maximum(JW.sum(axis=1, keepdims=True), 1e-8)
    JW /= wsum

    # Light 2-pass Laplacian weight smoothing on body vertices ONLY around modified boundaries for silky bending
    if dropped > 0:
        edges = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]], axis=0)
        edges = edges[edges[:, 0] != edges[:, 1]]
        Aj = coo_matrix(
            (np.ones(len(edges) * 2), (np.concatenate([edges[:, 0], edges[:, 1]]), np.concatenate([edges[:, 1], edges[:, 0]]))),
            shape=(nw, nw),
        ).tocsr()
        Aj.data[:] = 1.0
        deg = np.maximum(np.asarray(Aj.sum(axis=1)).ravel(), 1.0)
        # Only smooth dense weights for the 22 main + 4 twist bones on body vertices
        W_dense = np.zeros((nw, len(names)), dtype=np.float32)
        cnt_w = np.zeros(nw, dtype=np.float32)
        for k in range(4):
            np.add.at(W_dense, (weld, JI[:, k]), JW[:, k])
        np.add.at(cnt_w, weld, 1.0)
        W_dense /= np.maximum(cnt_w[:, None], 1.0)
        W_orig = W_dense.copy()
        for _ in range(2):
            W_dense = 0.65 * W_dense + 0.35 * ((Aj @ W_dense) / deg[:, None])
        # Keep non-body welded verts untouched
        body_w = roots == main_comp
        W_dense[~body_w] = W_orig[~body_w]
        W_v = W_dense[weld]
        order = np.argsort(-W_v, axis=1)[:, :4]
        new_w = np.take_along_axis(W_v, order, axis=1)
        new_w /= np.maximum(new_w.sum(axis=1, keepdims=True), 1e-8)
        JI[is_body] = order[is_body]
        JW[is_body] = new_w[is_body]

    rep = {
        j["accessors"][at["JOINTS_0"]]["bufferView"]: JI.astype(np.uint16).tobytes(),
        j["accessors"][at["WEIGHTS_0"]]["bufferView"]: JW.astype(np.float32).tobytes(),
    }
    write_glb(glb_path, j, b, rep)
    return dropped


def quat_from_unit_vectors(u: np.ndarray, v: np.ndarray) -> R:
    """Shortest rotation taking unit vector u onto unit vector v."""
    u = u / (np.linalg.norm(u) + 1e-12)
    v = v / (np.linalg.norm(v) + 1e-12)
    c = float(np.clip(np.dot(u, v), -1.0, 1.0))
    if c > 0.999999:
        return R.identity()
    if c < -0.999999:
        axis = np.cross(u, np.array([1.0, 0.0, 0.0]))
        if np.linalg.norm(axis) < 1e-4:
            axis = np.cross(u, np.array([0.0, 0.0, 1.0]))
        return R.from_rotvec(np.pi * axis / np.linalg.norm(axis))
    axis = np.cross(u, v)
    angle = np.arccos(c)
    return R.from_rotvec(angle * axis / np.linalg.norm(axis))


DIR_CHILD = {
    "Spine": "Spine2",
    "Spine2": "Neck",
    "Neck": "Head",
    "LeftShoulder": "LeftArm",
    "LeftArm": "LeftForeArm",
    "LeftForeArm": "LeftHand",
    "RightShoulder": "RightArm",
    "RightArm": "RightForeArm",
    "RightForeArm": "RightHand",
    "LeftUpLeg": "LeftLeg",
    "LeftLeg": "LeftFoot",
    "LeftFoot": "LeftToeBase",
    "RightUpLeg": "RightLeg",
    "RightLeg": "RightFoot",
    "RightFoot": "RightToeBase",
}

PARENT_MAP = {
    "Hips": None,
    "Spine": "Hips",
    "Spine1": "Spine",
    "Spine2": "Spine1",
    "Neck": "Spine2",
    "Head": "Neck",
    "LeftShoulder": "Spine2",
    "LeftArm": "LeftShoulder",
    "LeftForeArm": "LeftArm",
    "LeftHand": "LeftForeArm",
    "RightShoulder": "Spine2",
    "RightArm": "RightShoulder",
    "RightForeArm": "RightArm",
    "RightHand": "RightForeArm",
    "LeftUpLeg": "Hips",
    "LeftLeg": "LeftUpLeg",
    "LeftFoot": "LeftLeg",
    "LeftToeBase": "LeftFoot",
    "RightUpLeg": "Hips",
    "RightLeg": "RightUpLeg",
    "RightFoot": "RightLeg",
    "RightToeBase": "RightFoot",
}

TOPO_ORDER = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
    "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]


def retarget_clip_library(src_pos: dict, dst_pos: dict, src_data: dict, cid: str) -> dict:
    """World-space bone-by-bone rest-pose retargeting from src_pos -> dst_pos (services/mocap/retarget.ts math)."""
    align = {}
    for bn in TOPO_ORDER:
        ch = DIR_CHILD.get(bn)
        if ch and bn in src_pos and ch in src_pos and bn in dst_pos and ch in dst_pos:
            u_src = src_pos[ch] - src_pos[bn]
            v_dst = dst_pos[ch] - dst_pos[bn]
            if np.linalg.norm(u_src) > 1e-4 and np.linalg.norm(v_dst) > 1e-4:
                align[bn] = quat_from_unit_vectors(v_dst, u_src)
                continue
        align[bn] = R.identity()

    src_hips = src_pos["Hips"]
    dst_hips = dst_pos["Hips"]
    scale_y = float(np.clip(dst_hips[1] / max(0.2, src_hips[1]), 0.65, 1.35))

    out_data = copy.deepcopy(src_data)
    out_data["character"] = cid

    for clip in out_data.get("clips", []):
        tracks = clip.get("tracks", [])
        q_tracks = {}
        pos_track = None
        for tr in tracks:
            nm = tr.get("name", "")
            if nm.endswith(".quaternion"):
                bn = nm[:-11]
                q_tracks[bn] = tr
            elif nm == "Hips.position":
                pos_track = tr

        # Determine unified keyframe count from Hips.quaternion (all tracks share exact frame times)
        if "Hips" in q_tracks:
            n_frames = len(q_tracks["Hips"]["times"])
            # Parse per-bone source local rotations across frames
            src_local = {}
            for bn, tr in q_tracks.items():
                vals = np.asarray(tr["values"], dtype=np.float64).reshape(-1, 4)
                if len(vals) == n_frames:
                    src_local[bn] = R.from_quat(vals)

            # Walk hierarchy top-down to compute world rotations on src and aligned dst
            w_src = {}
            w_dst = {}
            dst_local = {}
            id_batch = R.from_quat(np.tile([0.0, 0.0, 0.0, 1.0], (n_frames, 1)))
            for bn in TOPO_ORDER:
                par = PARENT_MAP[bn]
                loc = src_local.get(bn, id_batch)
                ws = loc if par is None else (w_src[par] * loc)
                w_src[bn] = ws
                # Align dst bind bone direction onto src bind bone direction
                wd = ws * align[bn]
                w_dst[bn] = wd
                if bn in src_local:
                    ld = wd if par is None else (w_dst[par].inv() * wd)
                    qs = ld.as_quat()
                    # Hemisphere continuity so Three.js SLERP never takes the long 360-deg arc
                    for fi in range(1, len(qs)):
                        if np.dot(qs[fi], qs[fi - 1]) < 0.0:
                            qs[fi] = -qs[fi]
                    dst_local[bn] = qs

            for bn, qs in dst_local.items():
                q_tracks[bn]["values"] = [round(float(x), 6) for x in qs.ravel()]

        if pos_track is not None:
            vals = np.asarray(pos_track["values"], dtype=np.float64).reshape(-1, 3)
            # Delta around src rest hips, scaled by hip height ratio, placed at dst rest hips
            new_p = dst_hips[None, :] + (vals - src_hips[None, :]) * scale_y
            pos_track["values"] = [round(float(x), 6) for x in new_p.ravel()]

    return out_data


def main():
    os.makedirs(WORK_DIR, exist_ok=True)
    _, _, ref_pos = extract_joints(REF_GLB)
    with open(REF_CLIPS, "r", encoding="utf-8") as f:
        ref_clips_data = json.load(f)

    # List all 22 humanoid character IDs (those with clips/<id>.json)
    cids = sorted(
        os.path.splitext(fn)[0]
        for fn in os.listdir(CLIPS_DIR)
        if fn.endswith(".json") and os.path.isfile(os.path.join(CHAR_DIR, f"{os.path.splitext(fn)[0]}.glb"))
    )
    print(f"Fixing {len(cids)} humanoid rigs & retargeting clips...")

    for cid in cids:
        glb_path = os.path.join(CHAR_DIR, f"{cid}.glb")
        j, b, cur_pos = extract_joints(glb_path)

        # 1. Re-anchor broken skeletons cleanly inside body mesh & re-run forgeRigMesh.ts
        if cid in REANCHOR_IDS:
            prim = j["meshes"][0]["primitives"][0]
            V = accessor(j, b, prim["attributes"]["POSITION"]).astype(np.float64)
            clean_P = fit_clean_humanoid_anchors(V, cur_pos)
            tmp_in = os.path.join(WORK_DIR, f"{cid}_reanchored.glb")
            write_reanchored_contract_glb(glb_path, tmp_in, clean_P)
            tmp_out = os.path.join(WORK_DIR, f"{cid}_forge.glb")
            hold = "Right:dagger,Left:dagger" if cid in ("void_stalker", "cyber_assassin", "shadow_assassin") else "Right:relaxed,Left:relaxed"
            cmd = ["npx", "tsx", os.path.join(ROOT, "scripts", "eraclash3d", "forgeRigMesh.ts"), tmp_in, tmp_out, "--name", cid, "--hold", hold]
            r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, shell=True)
            if r.returncode != 0:
                print(f"  [WARN] forgeRigMesh failed for {cid}: {r.stderr[-400:]}")
            else:
                # Replace character GLB with cleanly re-anchored 58-joint Forge GLB
                import shutil
                shutil.copy2(tmp_out, glb_path)
                print(f"  [reanchor] {cid:20s} -> LA={np.round(clean_P['LeftArm'],2).tolist()} LH={np.round(clean_P['LeftHand'],2).tolist()} LK={np.round(clean_P['LeftLeg'],2).tolist()}")

        # 2. Isolate arm/torso/wing/cape skin bleed on all 22 humanoids
        dropped = isolate_arm_weights(glb_path, cid)

        # 3. True world-space rest-pose retargeting of clip library
        _, _, dst_pos = extract_joints(glb_path)
        retargeted = retarget_clip_library(ref_pos, dst_pos, ref_clips_data, cid)
        clip_out = os.path.join(CLIPS_DIR, f"{cid}.json")
        with open(clip_out, "w", encoding="utf-8") as f:
            json.dump(retargeted, f)

        # 4. Re-pack GPU KTX2 twin
        ktxPack.pack_glb(glb_path)
        print(f"  [done] {cid:20s} | isolated={dropped:5d} weights | retargeted {len(retargeted['clips'])} clips + KTX2")


if __name__ == "__main__":
    main()
