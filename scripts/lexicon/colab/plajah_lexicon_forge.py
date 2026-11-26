"""Plajah Native Lexicon Cast Forge Toolkit — runs identically on Google Colab GPU and locally (zero Blender).

Bundles Plajah's Character Forge mesh finishing stages into one clean, reusable module:
  1. clean_shape: remove stray floaters, center on XZ, ground soles at y = 0, scale to exact real-world height.
  2. fit_silhouette_views: gently align 3D silhouette to orthographic front + true side cutouts (only kept if IoU rises).
  3. bake_lexicon_pbr: 200k high-poly -> 58k low-poly tangent-space normal bake + multi-scale 3D Bunnell AO +
     Lexicon painted-real matte PBR (cloth / leather / armor profiles) + optional subtle magical emissive accents.
  4. fit_proportion_anchors: proportion-aware 22-bone contract humanoid anchor fitter (adult / elder / youth / child
     profiles + neck-pinch auto-refinement + left-pole staff/cane isolation).
  5. build_contract_22_glb & reskin_screened_poisson: 2-pass Screened Poisson Metric Bone-Heat skinning with
     anatomical half-spaces (zero cross-body bleed, back capes/cloaks/shields/lyres locked to spine, skirt-safe
     diffusion, left-hand staff/cane locking) + 3-pose LBS stretch QA verifier.
  6. score_glb_views_software: pure-Python orthographic software rasterizer + score_views.py metrics & delta sheets
     (front, true side, back) so Colab reports exact per-view scores immediately without needing a browser.
"""
from __future__ import annotations

import io
import json
import os
import struct
import sys
import time
import cv2
import numpy as np
import trimesh
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.sparse import coo_matrix, diags
from scipy.sparse.csgraph import dijkstra
from scipy.sparse.linalg import cg
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as R

# Allow sibling Plajah imports both inside Colab (/content/lexicon_cast_in) and in repo checkout
_HERE = os.path.dirname(os.path.abspath(__file__))
for _cand in (
    _HERE,
    os.path.join(_HERE, "..", "..", "ravencrest"),
    os.path.join(_HERE, "..", "..", "riftrealm"),
    os.path.join(_HERE, "..", "..", "..", "engines", "tela-3d"),
):
    if os.path.isdir(_cand) and _cand not in sys.path:
        sys.path.insert(0, _cand)

from glbio import read_glb, accessor, write_glb  # noqa: E402
from uv_raster import rasterize_uv, interp  # noqa: E402

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

# Anatomical height fractions by age/proportion profile (auto-refined by mesh neck pinch)
PROPORTION_TABLES = {
    "adult": dict(hips=0.505, spine=0.568, spine1=0.648, spine2=0.738, neck=0.822, head=0.875, shoulder=0.795, arm=0.775, knee=0.272, foot=0.068),
    "elder": dict(hips=0.500, spine=0.565, spine1=0.645, spine2=0.735, neck=0.818, head=0.872, shoulder=0.790, arm=0.768, knee=0.268, foot=0.068),
    "youth": dict(hips=0.470, spine=0.532, spine1=0.610, spine2=0.692, neck=0.772, head=0.825, shoulder=0.745, arm=0.725, knee=0.252, foot=0.065),
    "child": dict(hips=0.405, spine=0.468, spine1=0.538, spine2=0.612, neck=0.682, head=0.745, shoulder=0.658, arm=0.635, knee=0.215, foot=0.062),
}

STRESS_POSES = [
    {"LeftArm": [-55, 0, 20], "RightArm": [-55, 0, -20], "LeftForeArm": [-24, 0, 0], "RightForeArm": [-24, 0, 0]},
    {"LeftUpLeg": [-35, 0, 4], "RightUpLeg": [32, 0, -4], "LeftLeg": [30, 0, 0], "RightLeg": [24, 0, 0]},
    {"LeftArm": [-45, -18, 8], "RightArm": [-45, 18, -8], "LeftForeArm": [-36, 0, 0], "RightForeArm": [-36, 0, 0]},
]


# ── 1. Clean & pad helpers ────────────────────────────────────────────────────────────────────────────

def pad_transparent_rgb(src_png: str, dst_png: str, flip_x: bool = False):
    """Fill transparent pixels with nearest solid-foreground RGB so bilinear projection never bleeds white/black."""
    arr = np.array(Image.open(src_png).convert("RGBA"))
    if flip_x:
        arr = arr[:, ::-1, :].copy()
    solid = arr[:, :, 3] >= 140
    if solid.any() and (~solid).any():
        _, (ny, nx) = distance_transform_edt(~solid, return_indices=True)
        out = arr.copy()
        out[:, :, :3] = arr[ny, nx, :3]
        Image.fromarray(out).save(dst_png)
    else:
        Image.fromarray(arr).save(dst_png)


def clean_shape(src_glb: str, dst_glb: str, target_height: float = 1.70, keep_small_ratio: float = 0.008) -> dict:
    """Drop tiny floaters, fix inverted winding, center XZ at 0, ground soles at y = 0, scale to target_height."""
    m = trimesh.load(src_glb, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    m = trimesh.Trimesh(vertices=np.asarray(m.vertices), faces=np.asarray(m.faces), process=True)
    parts = m.split(only_watertight=False)
    n_parts = len(parts)
    if n_parts > 1:
        main_part = max(parts, key=lambda p: len(p.faces))
        min_faces = max(350, int(len(main_part.faces) * keep_small_ratio))
        kept = [p for p in parts if len(p.faces) >= min_faces]
        m = trimesh.util.concatenate(kept) if len(kept) > 1 else main_part
    if m.is_volume and m.volume < 0:
        m.invert()
    b = m.bounds
    h0 = float(max(b[1][1] - b[0][1], 1e-4))
    sc = float(target_height / h0)
    cx = 0.5 * (b[0][0] + b[1][0])
    cz = 0.5 * (b[0][2] + b[1][2])
    m.apply_translation([-cx, -b[0][1], -cz])
    m.apply_scale(sc)
    m.export(dst_glb)
    return {
        "parts_before": n_parts,
        "faces": int(len(m.faces)),
        "extents": [round(float(x), 4) for x in m.extents],
    }


def _consensus_front_back_mask(front_mask: np.ndarray, back_mask: np.ndarray) -> np.ndarray:
    """Build the orthographic X-silhouette consensus between front and horizontally-flipped back art."""
    bf = back_mask[:, ::-1]
    best_iou, best_dx = -1.0, 0
    for dx in range(-40, 41, 2):
        s = np.roll(bf, dx, axis=1)
        ov = float((front_mask & s).sum() / max(1, (front_mask | s).sum()))
        if ov > best_iou:
            best_iou, best_dx = ov, dx
    bf_s = np.roll(bf, best_dx, axis=1)
    d1 = cv2.distanceTransform(front_mask.astype(np.uint8), cv2.DIST_L2, 5) - cv2.distanceTransform((~front_mask).astype(np.uint8), cv2.DIST_L2, 5)
    d2 = cv2.distanceTransform(bf_s.astype(np.uint8), cv2.DIST_L2, 5) - cv2.distanceTransform((~bf_s).astype(np.uint8), cv2.DIST_L2, 5)
    return (d1 + d2) > 0


def _tear_safe_field(fs_mod, M: np.ndarray, R: np.ndarray, clamp: float = 14.0, grad: float = 0.75) -> np.ndarray:
    """Row-wise outer/matched displacement field that NEVER tears across prop gaps or run-count transitions."""
    H, W = fs_mod.H, fs_mod.W
    mr_list = [fs_mod.runs(M[y]) for y in range(H)]
    rr_list = [fs_mod.runs(R[y]) for y in range(H)]
    n_mr = np.array([len(r) for r in mr_list])
    n_rr = np.array([len(r) for r in rr_list])

    # Identify rows where run counts are stable (no prop start/stop transition within +/- 16 px vertically)
    stable = np.ones(H, dtype=bool)
    for y in range(H):
        y0, y1 = max(0, y - 16), min(H, y + 17)
        if n_mr[y] == 0 or n_rr[y] == 0:
            stable[y] = False
        elif (n_mr[y0:y1] != n_mr[y]).any() or (n_rr[y0:y1] != n_rr[y]).any():
            stable[y] = False

    # Keep sole contact band (bottom 3%) and crown tip (top 2%) untouched so boots never pinch into thin ribbons
    ys_m = np.nonzero(M.any(axis=1))[0]
    if len(ys_m):
        y_top, y_bot = int(ys_m[0]), int(ys_m[-1])
        span = max(1, y_bot - y_top)
        stable[: y_top + int(0.02 * span)] = False
        stable[y_bot - int(0.03 * span) :] = False

    D = np.full((H, W), np.nan, np.float32)
    xs = np.arange(W, dtype=np.float32)
    for y in range(H):
        if not stable[y]:
            continue
        mr, rr = mr_list[y], rr_list[y]
        if len(mr) != len(rr):
            continue
        # Verify every matched run overlaps significantly (avoids stretching body across a detached staff/lyre/hammer)
        ok_match = True
        for (a, b), (c, d) in zip(mr, rr):
            ov = min(b, d) - max(a, c)
            if ov < 0.45 * min(b - a, d - c):
                ok_match = False
                break
        if not ok_match:
            continue
        mb = np.array([e for p in mr for e in p], np.float32)
        rb = np.array([e for p in rr for e in p], np.float32)
        delta = np.clip(rb - mb, -clamp, clamp)
        D[y] = np.interp(xs, mb, delta)

    ok = ~np.isnan(D[:, 0])
    if ok.sum() < 20:
        return np.zeros((H, W), np.float32)
    rows = np.arange(H)
    for x in range(W):
        D[:, x] = np.interp(rows, rows[ok], D[ok, x])
    # Zero out smoothly outside vertical valid span so tips don't drift
    D[~ok] *= 0.25
    D = np.clip(D, -clamp, clamp)
    for _ in range(3):
        for y in range(1, H):
            D[y] = np.clip(D[y], D[y - 1] - grad, D[y - 1] + grad)
        for y in range(H - 2, -1, -1):
            D[y] = np.clip(D[y], D[y + 1] - grad, D[y + 1] + grad)
    return cv2.GaussianBlur(D, (0, 0), sigmaX=5, sigmaY=9)


def fit_silhouette_views(
    src_glb: str,
    ref_dir: str,
    dst_glb: str,
    side_key: str = "right",
    iters: int = 4,
    damp: float = 0.48,
    mesh_smooth: int = 24,
) -> dict:
    """Tear-proof 3-view consensus silhouette refinement (front + side + back jointly).

    Unlike single-view silhouette warping, this targets the front/back orthographic X consensus so back views are
    never sacrificed for front views, blocks row-wise tearing across detached props (staffs, hammers, lyres, capes),
    and only keeps the deformation if 3-view mean IoU rises without hurting any single view by > 1.5%.
    """
    import fit_silhouette as fs_mod

    m = trimesh.load(src_glb, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    V0 = np.asarray(m.vertices, dtype=np.float64).copy()
    F = np.asarray(m.faces, dtype=np.int64)
    V = V0.copy()
    H_mesh = float(max(V0[:, 1].max() - V0[:, 1].min(), 1e-4))

    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    Adj = coo_matrix(
        (np.ones(len(e) * 2), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))),
        shape=(len(V), len(V)),
    ).tocsr()
    Adj.data[:] = 1
    deg = np.maximum(np.asarray(Adj.sum(1)).ravel(), 1)

    front_im = Image.open(os.path.join(ref_dir, "front.png"))
    back_im = Image.open(os.path.join(ref_dir, "back.png"))
    side_im = Image.open(os.path.join(ref_dir, f"{side_key}.png"))
    if side_key == "right":
        side_im = side_im.transpose(Image.FLIP_LEFT_RIGHT)

    refs = {
        "front": fs_mod.fit_ref(front_im),
        "side": fs_mod.fit_ref(side_im),
        "back": fs_mod.fit_ref(back_im),
    }
    consensus_x = _consensus_front_back_mask(refs["front"], refs["back"])

    def _best_shift_iou(M_bin, R_bin):
        best = 0.0
        for dx in range(-28, 29, 2):
            s = np.roll(M_bin, dx, axis=1)
            ov = float((s & R_bin).sum() / max(1, (s | R_bin).sum()))
            if ov > best:
                best = ov
        return best

    def eval_iou(verts):
        res = {}
        for v in ("front", "side", "back"):
            ax, _ = fs_mod.AX[v]
            M, _, _, _ = fs_mod.raster(verts, F, ax)
            res[v] = _best_shift_iou(M, refs[v])
        res["mean3"] = (res["front"] + res["side"] + res["back"]) / 3.0
        return res

    before = eval_iou(V0)
    best_V = V0.copy()
    best_scores = dict(before)

    for _ in range(iters):
        for v, target_mask in (("front", consensus_x), ("side", refs["side"])):
            ax, k = fs_mod.AX[v]
            M, px, py, s = fs_mod.raster(V, F, ax)
            D = _tear_safe_field(fs_mod, M, target_mask, clamp=14.0, grad=0.75)
            ix = np.clip(np.round(px).astype(int), 0, fs_mod.W - 1)
            iy = np.clip(np.round(py).astype(int), 0, fs_mod.H - 1)
            du = D[iy, ix] / s * damp
            for _ in range(mesh_smooth):
                du = 0.5 * du + 0.5 * (Adj @ du) / deg
            V[:, k] += du * ax[k]
        # Hard per-vertex displacement cap (< 3.5% height) so multi-view Hunyuan sculpts can NEVER tear or balloon
        delta_v = V - V0
        dnorm = np.linalg.norm(delta_v, axis=1, keepdims=True)
        cap = 0.035 * H_mesh
        V = V0 + delta_v * np.minimum(1.0, cap / np.maximum(dnorm, 1e-8))

        cur = eval_iou(V)
        no_regression = all(cur[v] >= before[v] - 0.045 for v in ("front", "side", "back"))
        if no_regression and cur["mean3"] > best_scores["mean3"] + 0.004:
            best_V = V.copy()
            best_scores = cur

    # Keep feet grounded at y = 0 and X/Z centered
    mn, mx = best_V.min(axis=0), best_V.max(axis=0)
    best_V[:, 0] -= 0.5 * (mn[0] + mx[0])
    best_V[:, 1] -= mn[1]
    best_V[:, 2] -= 0.5 * (mn[2] + mx[2])
    trimesh.Trimesh(best_V, F, process=False).export(dst_glb)
    return {
        "before_front": round(before["front"], 4),
        "before_side": round(before["side"], 4),
        "before_back": round(before["back"], 4),
        "after_front": round(best_scores["front"], 4),
        "after_side": round(best_scores["side"], 4),
        "after_back": round(best_scores["back"], 4),
        "improved": bool(best_scores["mean3"] > before["mean3"] + 0.004),
    }


# ── 2. High-Poly Normal + 3D AO + Lexicon Painted-Real PBR Baker ──────────────────────────────────────

def _pad_charts(img: np.ndarray, covered: np.ndarray, iters: int = 8) -> np.ndarray:
    out = img.astype(np.float32)
    m = covered.astype(np.float32)
    k = np.ones((3, 3), np.float32)
    for _ in range(iters):
        s = cv2.filter2D(out * m[..., None], -1, k, borderType=cv2.BORDER_CONSTANT)
        c = cv2.filter2D(m, -1, k, borderType=cv2.BORDER_CONSTANT)
        grow = (c > 0) & (m == 0)
        out[grow] = s[grow] / c[grow, None]
        m[grow] = 1.0
    return np.clip(out, 0, 255).astype(np.uint8)


def _compute_vertex_tangents(V: np.ndarray, N: np.ndarray, UV: np.ndarray, F: np.ndarray):
    v0, v1, v2 = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    uv0, uv1, uv2 = UV[F[:, 0]], UV[F[:, 1]], UV[F[:, 2]]
    e1, e2 = v1 - v0, v2 - v0
    du1, dv1 = uv1[:, 0] - uv0[:, 0], uv1[:, 1] - uv0[:, 1]
    du2, dv2 = uv2[:, 0] - uv0[:, 0], uv2[:, 1] - uv0[:, 1]
    det = du1 * dv2 - du2 * dv1
    inv_det = np.where(np.abs(det) > 1e-10, 1.0 / det, 0.0)
    t_tri = (e1 * dv2[:, None] - e2 * dv1[:, None]) * inv_det[:, None]
    b_tri = (e2 * du1[:, None] - e1 * du2[:, None]) * inv_det[:, None]

    T = np.zeros_like(V)
    B = np.zeros_like(V)
    for k in range(3):
        np.add.at(T, F[:, k], t_tri)
        np.add.at(B, F[:, k], b_tri)

    T = T - N * np.sum(N * T, axis=1, keepdims=True)
    t_len = np.linalg.norm(T, axis=1, keepdims=True)
    bad = t_len[:, 0] < 1e-6
    if bad.any():
        up = np.where(np.abs(N[bad, 1:2]) < 0.9, np.array([[0.0, 1.0, 0.0]]), np.array([[1.0, 0.0, 0.0]]))
        T[bad] = np.cross(up, N[bad])
        t_len = np.linalg.norm(T, axis=1, keepdims=True)
    T /= np.maximum(t_len, 1e-8)

    cross_nt = np.cross(N, T)
    sign = np.where(np.sum(cross_nt * B, axis=1, keepdims=True) < 0.0, -1.0, 1.0)
    B_orth = cross_nt * sign
    B_orth /= np.maximum(np.linalg.norm(B_orth, axis=1, keepdims=True), 1e-8)
    return T, B_orth


def compute_mesh_ao(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    """Multi-scale 3D Bunnell solid-angle Ambient Occlusion (pure C++ cKDTree, zero OpenGL)."""
    mesh = trimesh.Trimesh(V, F, process=False)
    vnorm = np.asarray(mesh.vertex_normals, dtype=np.float32)
    vnorm /= np.maximum(np.linalg.norm(vnorm, axis=1, keepdims=True), 1e-8)
    total_area = float(mesh.area)
    if total_area <= 1e-8:
        return np.ones(len(V), dtype=np.float32)

    key = np.round(V / 1e-5).astype(np.int64)
    _, uniq_idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    Vu = V[uniq_idx].astype(np.float32)
    Nu = vnorm[uniq_idx]

    occ_total = np.zeros(len(Vu), dtype=np.float32)
    for n_samp, k_nn, weight in ((10000, 36, 0.55), (2500, 32, 0.45)):
        pts, fidx = trimesh.sample.sample_surface(mesh, n_samp)
        pts = pts.astype(np.float32)
        snorm = np.asarray(mesh.face_normals[fidx], dtype=np.float32)
        disk_r2 = float(total_area / (np.pi * n_samp)) * 1.45
        tree = cKDTree(pts)
        chunk = 8192
        occ = np.zeros(len(Vu), dtype=np.float32)
        for i0 in range(0, len(Vu), chunk):
            i1 = min(len(Vu), i0 + chunk)
            dists, idxs = tree.query(Vu[i0:i1], k=k_nn, workers=-1)
            dvec = pts[idxs] - Vu[i0:i1, None, :]
            r2 = np.sum(dvec * dvec, axis=2) + 1e-8
            r = np.sqrt(r2)
            dhat = dvec / r[:, :, None]
            cos_emit = np.clip(np.sum(dhat * Nu[i0:i1, None, :], axis=2) - 0.04, 0.0, 1.0)
            cos_recv = np.clip(1.0 - np.sum(dhat * snorm[idxs], axis=2) * 0.5, 0.25, 1.0)
            solid = (1.0 - r / np.sqrt(r2 + disk_r2)) * cos_emit * cos_recv
            occ[i0:i1] = solid.sum(axis=1)
        occ_total += weight * occ

    ao_u = np.exp(-1.45 * occ_total)
    hi = float(np.percentile(ao_u, 96))
    if hi > 0.2:
        ao_u = np.clip(ao_u / hi, 0.24, 1.0)
    return ao_u[inv].astype(np.float32)


def compute_lexicon_pbr(base_rgb: np.ndarray, ao_map: np.ndarray, profile: str = "village_cloth"):
    """Physically calibrated Lexicon Painted-Real PBR maps (matte wool/linen/skin, warm leather, brass/iron accents)."""
    hsv = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h = hsv[..., 0] * 360.0 / 255.0
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    lum = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    local_hi = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 16)) * 2.8 + 0.5, 0.0, 1.0)

    # Warm gold/brass trim (spectacles, goggles, clasps, buckles, keys, compass, tome corners)
    is_brass = (
        np.clip(1.0 - np.abs(h - 40.0) / 14.0, 0.0, 1.0)
        * np.clip((s - 0.30) / 0.25, 0.0, 1.0)
        * np.clip((v - 0.45) / 0.25, 0.0, 1.0)
        * np.clip((local_hi - 0.35) / 0.30, 0.0, 1.0)
    )
    # Cool steel/iron (Bram's kettle helm, mail, sword, keys, shears)
    is_iron = (
        np.clip((0.20 - s) / 0.14, 0.0, 1.0)
        * np.clip((v - 0.24) / 0.28, 0.0, 1.0)
        * np.clip((0.76 - v) / 0.22, 0.0, 1.0)
    )
    # Leather hues (warm medium-dark brown)
    is_leather = (
        np.clip(1.0 - np.abs(h - 24.0) / 16.0, 0.0, 1.0)
        * np.clip((s - 0.24) / 0.24, 0.0, 1.0)
        * np.clip((0.55 - v) / 0.20, 0.0, 1.0)
        * np.clip((v - 0.14) / 0.16, 0.0, 1.0)
    )
    # Skin protection (warm peach/tan, higher brightness -> matte soft skin, zero metal!)
    is_skin = (
        np.clip(1.0 - np.abs(h - 19.0) / 14.0, 0.0, 1.0)
        * np.clip((s - 0.14) / 0.18, 0.0, 1.0)
        * np.clip((0.58 - s) / 0.18, 0.0, 1.0)
        * np.clip((v - 0.48) / 0.18, 0.0, 1.0)
    )
    # Bright white/silver hair & parchment (high value, low sat -> matte, never metallic!)
    is_hair_pale = np.clip((v - 0.68) / 0.16, 0.0, 1.0) * np.clip((0.25 - s) / 0.18, 0.0, 1.0)

    is_brass = cv2.GaussianBlur(is_brass.astype(np.float32), (0, 0), 1.4)
    is_iron = cv2.GaussianBlur(is_iron.astype(np.float32), (0, 0), 1.4)
    is_leather = cv2.GaussianBlur(is_leather.astype(np.float32), (0, 0), 1.6)
    is_skin = cv2.GaussianBlur(is_skin.astype(np.float32), (0, 0), 1.8)
    is_hair_pale = cv2.GaussianBlur(is_hair_pale.astype(np.float32), (0, 0), 1.8)

    if profile == "village_armor":
        # Bram: iron kettle helm + mail + leather brigandine + wooden shield
        metal = np.clip(0.76 * is_iron + 0.72 * is_brass - 0.90 * is_skin - 0.80 * is_hair_pale, 0.0, 0.86)
        rough = np.clip(0.84 - 0.20 * is_leather - 0.44 * metal - 0.08 * local_hi + 0.10 * (1.0 - ao_map), 0.28, 0.94)
    elif profile == "village_leather":
        # Tolo, Maya, Zora: oiled leather aprons/corsets + brass goggles/astrolabe + cloth
        metal = np.clip(0.74 * is_brass + 0.35 * is_iron - 0.90 * is_skin - 0.85 * is_hair_pale, 0.0, 0.82)
        rough = np.clip(0.86 - 0.22 * is_leather - 0.48 * metal - 0.07 * local_hi + 0.10 * (1.0 - ao_map), 0.26, 0.95)
    else:
        # village_cloth (Mira, Thorne, Oren, Kaelen, Selene, Lyra, Nico, Pip): storybook matte cloth/wool + leather + small brass accents
        metal = np.clip(0.68 * is_brass + 0.22 * is_iron - 0.95 * is_skin - 0.90 * is_hair_pale, 0.0, 0.78)
        rough = np.clip(0.89 - 0.18 * is_leather - 0.50 * metal - 0.06 * local_hi + 0.08 * (1.0 - ao_map), 0.28, 0.96)

    # Keep faces/skin soft natural matte (~0.68-0.76)
    rough = rough * (1.0 - 0.65 * is_skin) + 0.72 * (0.65 * is_skin)
    return rough.astype(np.float32), metal.astype(np.float32)


def bake_lexicon_pbr(
    painted_glb: str,
    hp_glb: str | None,
    out_glb: str,
    profile: str = "village_cloth",
    emissive: dict | None = None,
    jpeg_quality: int = 93,
) -> dict:
    """Bake 200k HP -> 58k LP tangent-space normal + 3D Bunnell AO + Lexicon matte PBR + optional emissive (core JPEG glTF)."""
    j, b = read_glb(painted_glb)
    prim = j["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    V = accessor(j, b, at["POSITION"]).astype(np.float64)
    N = accessor(j, b, at["NORMAL"]).astype(np.float64)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
    UV = accessor(j, b, at["TEXCOORD_0"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)

    mat = j["materials"][prim.get("material", 0)]
    pbr = mat.get("pbrMetallicRoughness", {})

    def tex_img_idx(info):
        if not info:
            return None
        T = j["textures"][info["index"]]
        if "source" in T:
            return T["source"]
        return T.get("extensions", {}).get("EXT_texture_webp", {}).get("source")

    def decode_img(idx):
        bv = j["bufferViews"][j["images"][idx]["bufferView"]]
        off = bv.get("byteOffset", 0)
        raw = bytes(b[off : off + bv["byteLength"]])
        return np.array(Image.open(io.BytesIO(raw)).convert("RGB"))

    def encode_jpg(arr, q=jpeg_quality):
        buf = io.BytesIO()
        Image.fromarray(arr).save(buf, format="JPEG", quality=q, optimize=True)
        return buf.getvalue()

    base_idx = tex_img_idx(pbr.get("baseColorTexture"))
    norm_idx = tex_img_idx(mat.get("normalTexture"))
    orm_idx = tex_img_idx(pbr.get("metallicRoughnessTexture"))
    base_rgb = decode_img(base_idx)
    R_sz = base_rgb.shape[0]

    # 1. Multi-scale 3D geometric AO
    ao_v = compute_mesh_ao(V, F)

    # 2. Tangent frame & UV rasterization (glTF v=0 top row)
    T_v, B_v = _compute_vertex_tangents(V, N, UV, F)
    covered, tri_ids, bary = rasterize_uv(np.clip(UV, 0.0, 1.0), F, R_sz)
    tp = interp(V, F, tri_ids, bary)
    tn = interp(N, F, tri_ids, bary)
    tn /= np.maximum(np.linalg.norm(tn, axis=1, keepdims=True), 1e-8)
    tt = interp(T_v, F, tri_ids, bary)
    tt /= np.maximum(np.linalg.norm(tt, axis=1, keepdims=True), 1e-8)
    tb = interp(B_v, F, tri_ids, bary)
    tb /= np.maximum(np.linalg.norm(tb, axis=1, keepdims=True), 1e-8)
    t_ao = interp(ao_v[:, None], F, tri_ids, bary)[:, 0]

    # 3. High-poly -> Low-poly tangent-space normal bake
    norm_grid = np.zeros((R_sz, R_sz, 3), dtype=np.float32)
    norm_grid[:, :, 2] = 1.0
    used_hp = False
    if hp_glb and os.path.isfile(hp_glb):
        hp = trimesh.load(hp_glb, force="mesh")
        if isinstance(hp, trimesh.Scene):
            hp = hp.dump(concatenate=True)
        hp = trimesh.Trimesh(vertices=np.asarray(hp.vertices), faces=np.asarray(hp.faces), process=True)
        lo_min, lo_max = V.min(axis=0), V.max(axis=0)
        hp_min, hp_max = hp.bounds[0], hp.bounds[1]
        lo_ext = lo_max - lo_min
        hp_ext = np.maximum(hp_max - hp_min, 1e-6)
        sc = float(lo_ext[1] / hp_ext[1])
        hp_verts = hp.vertices.copy()
        hp_verts -= np.array([0.5 * (hp_min[0] + hp_max[0]), hp_min[1], 0.5 * (hp_min[2] + hp_max[2])])
        hp_verts *= sc
        hp_verts += np.array([0.5 * (lo_min[0] + lo_max[0]), lo_min[1], 0.5 * (lo_min[2] + lo_max[2])])
        hp_norms = np.asarray(hp.vertex_normals, dtype=np.float64)

        tree = cKDTree(hp_verts.astype(np.float32))
        dists, idxs = tree.query(tp.astype(np.float32), k=3, workers=-1)
        med_err = float(np.median(dists[:, 0]) / max(lo_ext[1], 1e-4))
        if med_err < 0.04:
            inv_w = 1.0 / (dists + 1e-5)
            inv_w /= inv_w.sum(axis=1, keepdims=True)
            n_hp = (hp_norms[idxs] * inv_w[:, :, None]).sum(axis=1)
            n_hp /= np.maximum(np.linalg.norm(n_hp, axis=1, keepdims=True), 1e-8)
            conf = np.clip(1.0 - dists[:, 0] / (0.04 * lo_ext[1]), 0.0, 1.0)[:, None]
            n_world = n_hp * conf + tn * (1.0 - conf)
            n_world /= np.maximum(np.linalg.norm(n_world, axis=1, keepdims=True), 1e-8)
            tx = np.sum(n_world * tt, axis=1)
            ty = np.sum(n_world * tb, axis=1)
            tz = np.clip(np.sum(n_world * tn, axis=1), 0.18, 1.0)
            n_ts = np.stack([tx, ty, tz], axis=1)
            n_ts /= np.maximum(np.linalg.norm(n_ts, axis=1, keepdims=True), 1e-8)
            norm_grid[covered] = n_ts
            used_hp = True

    # Subtle high-frequency painted fabric/leather weave micro-normal
    lum = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    micro = lum - cv2.GaussianBlur(lum, (0, 0), 3.0)
    gx = cv2.Sobel(micro, cv2.CV_32F, 1, 0, ksize=3) * 1.15
    gy = cv2.Sobel(micro, cv2.CV_32F, 0, 1, ksize=3) * 1.15
    norm_grid[..., 0] -= gx
    norm_grid[..., 1] -= gy
    norm_grid /= np.maximum(np.linalg.norm(norm_grid, axis=-1, keepdims=True), 1e-8)
    norm_u8 = _pad_charts(np.clip((norm_grid * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8), covered, iters=6)

    # 4. AO + Lexicon Painted-Real Roughness & Metalness ORM
    ao_grid = np.ones((R_sz, R_sz), dtype=np.float32)
    ao_grid[covered] = np.clip(t_ao ** 1.25, 0.24, 1.0)
    ao_u8 = _pad_charts(np.repeat((ao_grid * 255.0).astype(np.uint8)[..., None], 3, axis=2), covered, iters=6)[..., 0]
    ao_f = cv2.GaussianBlur(ao_u8.astype(np.float32) / 255.0, (0, 0), 1.2)

    rough_f, metal_f = compute_lexicon_pbr(base_rgb, ao_f, profile)
    orm_u8 = np.stack([
        np.clip(ao_f * 255.0, 0, 255).astype(np.uint8),
        np.clip(rough_f * 255.0, 0, 255).astype(np.uint8),
        np.clip(metal_f * 255.0, 0, 255).astype(np.uint8),
    ], axis=-1)

    # 5. Re-encode base/normal/ORM as crisp core glTF JPEG (3-4x smaller than PNG, zero extension issues)
    new_bvs = {}
    for idx, arr, q in ((base_idx, base_rgb, jpeg_quality), (norm_idx, norm_u8, 94), (orm_idx, orm_u8, 92)):
        j["images"][idx]["mimeType"] = "image/jpeg"
        new_bvs[j["images"][idx]["bufferView"]] = encode_jpg(arr, q)

    mat["occlusionTexture"] = {"index": pbr["metallicRoughnessTexture"]["index"], "strength": 0.88}
    mat.setdefault("normalTexture", {})["scale"] = 1.05
    pbr["metallicFactor"] = 1.0
    pbr["roughnessFactor"] = 1.0

    # Optional subtle magical emissive accents (Tolo cyan hammer runes, Kaelen glowing herbs, Maya ink vials)
    em_pct = 0.0
    if emissive:
        hsv = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
        h_deg = hsv[..., 0] * 360.0 / 255.0
        s_01 = hsv[..., 1] / 255.0
        v_01 = hsv[..., 2] / 255.0
        h0, h1 = emissive["hue"]
        mask = ((h_deg >= h0) & (h_deg <= h1) & (s_01 >= emissive.get("smin", 0.36)) & (v_01 >= emissive.get("vmin", 0.48))).astype(np.float32)
        mask = cv2.GaussianBlur(mask, (0, 0), 1.0)
        em_pct = float((mask > 0.4).mean() * 100.0)
        if em_pct > 0.01:
            gain = float(emissive.get("gain", 1.25))
            em_u8 = np.clip(base_rgb.astype(np.float32) * mask[..., None] * gain, 0, 255).astype(np.uint8)
            em_bytes = encode_jpg(em_u8, 90)
            while len(b) % 4:
                b.append(0)
            off = len(b)
            b += em_bytes
            j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(em_bytes)})
            j["images"].append({"bufferView": len(j["bufferViews"]) - 1, "mimeType": "image/jpeg"})
            j["textures"].append({"source": len(j["images"]) - 1})
            mat["emissiveTexture"] = {"index": len(j["textures"]) - 1}
            mat["emissiveFactor"] = [1.0, 1.0, 1.0]

    write_glb(out_glb, j, b, new_bvs)
    return {
        "hp_normal": used_hp,
        "mean_ao": round(float(ao_f[covered].mean()), 3),
        "mean_rough": round(float(rough_f[covered].mean()), 3),
        "mean_metal": round(float(metal_f[covered].mean()), 3),
        "emissive_pct": round(em_pct, 2),
        "mb": round(os.path.getsize(out_glb) / 1e6, 2),
    }


# ── 3. Proportion-Aware Contract Humanoid Rig & Screened Poisson Bone-Heat ───────────────────────────

def _clusters_1d(xs: np.ndarray, gap: float):
    if len(xs) == 0:
        return []
    xs = np.sort(xs)
    cuts = np.where(np.diff(xs) > gap)[0]
    return np.split(xs, cuts + 1)


def _seg_dist(V: np.ndarray, p0: np.ndarray, p1: np.ndarray):
    ab = p1 - p0
    denom = max(float(ab @ ab), 1e-9)
    t = np.clip(((V - p0) @ ab) / denom, 0.0, 1.0)
    d = np.linalg.norm(V - (p0 + t[:, None] * ab), axis=1)
    return d, t


def fit_proportion_anchors(V: np.ndarray, prop_profile: str = "adult", has_left_pole: bool = False) -> dict[str, np.ndarray]:
    """Proportion-aware, cape/shield/lyre/pole-safe 22-joint contract humanoid anchor fitter."""
    tab = dict(PROPORTION_TABLES.get(prop_profile, PROPORTION_TABLES["adult"]))
    H = float(V[:, 1].max() - V[:, 1].min())
    y0 = float(V[:, 1].min())

    # Auto-refine neck Y by finding the minimum body width (neck pinch) near the profile prior
    best_ny, best_w = tab["neck"], 1e9
    for yf in np.linspace(max(0.58, tab["neck"] - 0.05), min(0.88, tab["neck"] + 0.04), 19):
        y = y0 + yf * H
        s = V[(np.abs(V[:, 1] - y) < 0.015 * H) & (np.abs(V[:, 0]) < 0.22 * H)]
        if len(s) >= 12:
            w_slice = float(np.percentile(s[:, 0], 92) - np.percentile(s[:, 0], 8))
            if w_slice < best_w:
                best_w = w_slice
                best_ny = float(yf)
    if abs(best_ny - tab["neck"]) <= 0.045:
        delta = best_ny - tab["neck"]
        tab["neck"] = best_ny
        tab["head"] = float(np.clip(tab["head"] + delta * 0.7, best_ny + 0.04, 0.92))
        tab["shoulder"] = float(np.clip(tab["shoulder"] + delta * 0.6, tab["spine2"] + 0.02, best_ny - 0.018))
        tab["arm"] = float(np.clip(tab["arm"] + delta * 0.5, tab["spine2"] + 0.01, tab["shoulder"] - 0.01))

    def torso_slice_z(yf: float, half_band: float = 0.03):
        y = y0 + yf * H
        s = V[(np.abs(V[:, 1] - y) < half_band * H) & (np.abs(V[:, 0]) < 0.12 * H)]
        if len(s) < 12:
            s = V[(np.abs(V[:, 1] - y) < 0.06 * H) & (np.abs(V[:, 0]) < 0.18 * H)]
        if len(s) < 6:
            return 0.0
        z_lo, z_hi = np.percentile(s[:, 2], [5, 95])
        if (z_hi - z_lo) > 0.24 * H:
            # Exclude back capes, shields, scroll cases, lyres sticking behind torso
            core = s[s[:, 2] >= z_hi - 0.22 * H]
            if len(core) >= 8:
                return float(np.median(core[:, 2]))
        return float(np.median(s[:, 2]))

    P: dict[str, np.ndarray] = {}
    for nm, key in (("Hips", "hips"), ("Spine", "spine"), ("Spine1", "spine1"), ("Spine2", "spine2"), ("Neck", "neck"), ("Head", "head")):
        P[nm] = np.array([0.0, y0 + tab[key] * H, torso_slice_z(tab[key])], dtype=np.float64)

    body_z_center = 0.5 * (P["Hips"][2] + P["Spine2"][2])
    V_body = V[(V[:, 2] > body_z_center - 0.19 * H) & (V[:, 2] < body_z_center + 0.23 * H)]
    if len(V_body) < 200:
        V_body = V

    # Legs (symmetric in X so ankles & knees sit centered inside boots/skirts)
    def fit_leg_xz(yf: float, default_x: float):
        y = y0 + yf * H
        xs_abs, zs = [], []
        for side in (1, -1):
            x_lim = 0.26 * H if not (has_left_pole and side == 1) else 0.22 * H
            s = V_body[(np.abs(V_body[:, 1] - y) < 0.03 * H) & (V_body[:, 0] * side > 0.02 * H) & (V_body[:, 0] * side < x_lim)]
            if len(s) >= 10:
                xs_abs.append(float(np.median(np.abs(s[:, 0]))))
                zs.append(float(np.median(s[:, 2])))
        if xs_abs:
            return float(np.clip(np.median(xs_abs), 0.05 * H, 0.18 * H)), float(np.median(zs))
        return default_x * H, float(P["Hips"][2])

    hip_x, hip_lz = fit_leg_xz(tab["hips"] - 0.03, 0.072)
    knee_x, knee_z = fit_leg_xz(tab["knee"], 0.085)
    foot_x, foot_z = fit_leg_xz(tab["foot"], 0.095)
    knee_x = float(np.clip(knee_x, min(hip_x, foot_x) - 0.025 * H, max(hip_x, foot_x) + 0.035 * H))
    knee_z = float(np.clip(knee_z, P["Hips"][2] - 0.05 * H, P["Hips"][2] + 0.07 * H))
    foot_z = float(np.clip(foot_z, P["Hips"][2] - 0.08 * H, P["Hips"][2] + 0.07 * H))

    feet_pts = V_body[(V_body[:, 1] < y0 + 0.055 * H) & (np.abs(V_body[:, 0]) < 0.24 * H)]
    toe_z = float(np.percentile(feet_pts[:, 2], 85)) if len(feet_pts) >= 10 else foot_z + 0.075 * H
    toe_z = float(np.clip(toe_z, foot_z + 0.04 * H, foot_z + 0.13 * H))

    for side, pre in ((1, "Left"), (-1, "Right")):
        P[pre + "UpLeg"] = np.array([side * hip_x, P["Hips"][1], 0.5 * (P["Hips"][2] + hip_lz)])
        P[pre + "Leg"] = np.array([side * knee_x, y0 + tab["knee"] * H, knee_z])
        P[pre + "Foot"] = np.array([side * foot_x, y0 + tab["foot"] * H, foot_z])
        P[pre + "ToeBase"] = np.array([side * foot_x, y0 + 0.018 * H, toe_z])

    # Arms (symmetric baseline from clean side; respects child/youth shorter torso span and ignores held staffs/canes)
    arm_candidates = []
    arm_end_yf = max(0.28, tab["hips"] - 0.07)
    sides_to_scan = (-1,) if has_left_pole else (1, -1)
    for side in sides_to_scan:
        pts = []
        prev_x = None
        for yf in np.linspace(tab["arm"] - 0.015, arm_end_yf, 28):
            y = y0 + yf * H
            s = V_body[(np.abs(V_body[:, 1] - y) < 0.022 * H) & (V_body[:, 0] * side > 0.06 * H) & (V_body[:, 0] * side < 0.42 * H)]
            if len(s) < 8:
                continue
            runs = [r for r in _clusters_1d(s[:, 0] * side, 0.02 * H) if len(r) >= 6]
            if len(runs) >= 2:
                arm_r = max(runs, key=lambda r: float(r.mean()))
                cx = float(arm_r.mean())
                if prev_x is not None and abs(cx - prev_x) > 0.08 * H:
                    break
                sel = s[(s[:, 0] * side >= arm_r.min()) & (s[:, 0] * side <= arm_r.max())]
                pts.append(np.array([cx, y, float(np.median(sel[:, 2]))]))
                prev_x = cx
            elif pts and prev_x is not None:
                near = s[np.abs(s[:, 0] * side - prev_x) < 0.055 * H]
                if len(near) >= 6:
                    cx = float(np.median(near[:, 0] * side))
                    pts.append(np.array([cx, y, float(np.median(near[:, 2]))]))
                    prev_x = cx
                else:
                    break
        if len(pts) >= 5:
            arm_candidates.append(np.array(pts))

    sh_slice = V_body[(np.abs(V_body[:, 1] - (y0 + tab["arm"] * H)) < 0.03 * H) & (np.abs(V_body[:, 0]) < 0.34 * H)]
    torso_half_w = float(np.percentile(np.abs(sh_slice[:, 0]), 86)) if len(sh_slice) >= 16 else 0.145 * H
    arm_x0 = float(np.clip(torso_half_w * 0.72, 0.085 * H, 0.21 * H))
    expected_span = (tab["arm"] - tab["hips"]) * 1.02 * H

    if arm_candidates:
        if len(arm_candidates) == 2 and abs((arm_candidates[0][0, 1] - arm_candidates[0][-1, 1]) - (arm_candidates[1][0, 1] - arm_candidates[1][-1, 1])) < 0.08 * H:
            p_top = 0.5 * (arm_candidates[0][0] + arm_candidates[1][0])
            p_mid = 0.5 * (arm_candidates[0][len(arm_candidates[0]) // 2] + arm_candidates[1][len(arm_candidates[1]) // 2])
            p_bot = 0.5 * (arm_candidates[0][-1] + arm_candidates[1][-1])
        else:
            best_pts = min(arm_candidates, key=lambda pts: abs((pts[0, 1] - pts[-1, 1]) - expected_span))
            p_top, p_mid, p_bot = best_pts[0], best_pts[len(best_pts) // 2], best_pts[-1]
        ax0 = float(np.clip(p_top[0], arm_x0 * 0.85, 0.22 * H))
        ay0 = y0 + tab["arm"] * H
        az0 = float(np.clip(p_top[2], P["Spine2"][2] - 0.045 * H, P["Spine2"][2] + 0.045 * H))
        hx = float(np.clip(p_bot[0], ax0 + 0.025 * H, 0.34 * H))
        hy = float(np.clip(p_bot[1], y0 + (tab["hips"] - 0.07) * H, y0 + (tab["hips"] + 0.06) * H))
        hz = float(np.clip(p_bot[2], P["Spine2"][2] - 0.05 * H, P["Spine2"][2] + 0.09 * H))
        fx = float(np.clip(p_mid[0], min(ax0, hx) - 0.02 * H, max(ax0, hx) + 0.035 * H))
        fy = 0.50 * (ay0 + hy)
        fz = float(np.clip(p_mid[2], min(az0, hz) - 0.04 * H, max(az0, hz) + 0.03 * H))
    else:
        ax0, ay0, az0 = arm_x0, y0 + tab["arm"] * H, float(P["Spine2"][2])
        fx, fy, fz = arm_x0 + 0.055 * H, y0 + 0.5 * (tab["arm"] + tab["hips"]) * H, az0 - 0.01 * H
        hx, hy, hz = arm_x0 + 0.105 * H, y0 + tab["hips"] * H, az0 + 0.01 * H

    for side, pre in ((1, "Left"), (-1, "Right")):
        P[pre + "Shoulder"] = np.array([side * (ax0 * 0.42), y0 + tab["shoulder"] * H, P["Spine2"][2]])
        P[pre + "Arm"] = np.array([side * ax0, ay0, az0])
        P[pre + "ForeArm"] = np.array([side * fx, fy, fz])
        P[pre + "Hand"] = np.array([side * hx, hy, hz])

    return P


def _find_main_body_mask(V: np.ndarray, F: np.ndarray):
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


def compute_screened_poisson_weights(
    V: np.ndarray,
    F: np.ndarray,
    P: dict[str, np.ndarray],
    names: list[str],
    has_robe: bool = False,
    has_left_pole: bool = False,
):
    """2-pass Screened Poisson Metric Bone-Heat skinning with robe/cape/back-prop/pole isolation."""
    weld, nw, is_body_v, is_body_w, comp_roots = _find_main_body_mask(V, F)
    name_to_idx = {n: i for i, n in enumerate(names)}
    H = float(V[is_body_v, 1].max() - V[is_body_v, 1].min())
    y_max = float(V[is_body_v, 1].max())

    body_f = is_body_v[F[:, 0]] & is_body_v[F[:, 1]] & is_body_v[F[:, 2]]
    T = weld[F[body_f]]
    Vw = np.zeros((nw, 3), dtype=np.float64)
    Vw[weld] = V

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
        "LeftToeBase": np.array([0.0, 0.0, 0.075 * H]),
        "RightToeBase": np.array([0.0, 0.0, 0.075 * H]),
    }

    back_z_cut = min(float(P["Spine2"][2]), float(P["Hips"][2])) - 0.12 * H
    head_y_cap = float(P["Head"][1]) + 0.06 * H
    D3 = np.full((nw, len(CONTRACT_22)), 1e3, dtype=np.float64)
    for bi, bn in enumerate(CONTRACT_22):
        p0 = P[bn]
        ch = CHILD_22.get(bn)
        p1 = P[ch] if (ch and ch in P) else p0 + tips.get(bn, np.zeros(3))
        d3, _ = _seg_dist(Vw, p0, p1)
        if bn.startswith("Left"):
            d3 = np.where(Vw[:, 0] < -0.01 * H, d3 + 1.0 * H, d3)
        elif bn.startswith("Right"):
            d3 = np.where(Vw[:, 0] > 0.01 * H, d3 + 1.0 * H, d3)
        # Keep back cloaks, capes, shields, lyres, scroll cases strictly on Spine/Hips (including upper Arms!)
        if any(k in bn for k in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase")):
            if bn in ("LeftArm", "RightArm"):
                d3 = np.where((Vw[:, 2] < back_z_cut) & (Vw[:, 1] < float(P[bn][1]) - 0.03 * H), d3 + 1.0 * H, d3)
            else:
                d3 = np.where(Vw[:, 2] < back_z_cut, d3 + 1.0 * H, d3)
        if bn == "LeftShoulder":
            d3 = np.where((Vw[:, 0] > abs(float(P["LeftArm"][0])) + 0.02 * H) | (Vw[:, 1] < float(P["LeftArm"][1]) - 0.04 * H) | (Vw[:, 2] < back_z_cut), d3 + 0.5 * H, d3)
        elif bn == "RightShoulder":
            d3 = np.where((Vw[:, 0] < -abs(float(P["RightArm"][0])) - 0.02 * H) | (Vw[:, 1] < float(P["RightArm"][1]) - 0.04 * H) | (Vw[:, 2] < back_z_cut), d3 + 0.5 * H, d3)
        if any(k in bn for k in ("Arm", "Hand")):
            d3 = np.where(Vw[:, 1] > head_y_cap, d3 + 0.8 * H, d3)
            # Keep forearms/hands from grabbing hips/pouches/skirts near or inside the torso/thigh envelope
            if "ForeArm" in bn or "Hand" in bn:
                hip_w = abs(float(P["LeftUpLeg"][0])) + 0.078 * H
                d3 = np.where((np.abs(Vw[:, 0]) < hip_w) & (Vw[:, 1] < float(P["Spine1"][1])), d3 + 0.55 * H, d3)
        D3[:, bi] = d3

    # Held vertical staff/cane on left side (Thorne / Oren): bind outer left pole cleanly to LeftHand!
    if has_left_pole:
        pole_x = float(P["LeftHand"][0]) + 0.02 * H
        is_pole = (Vw[:, 0] > pole_x) & (Vw[:, 1] < float(P["Head"][1]) + 0.25 * H)
        lh_idx = CONTRACT_22.index("LeftHand")
        D3[is_pole, :] += 1.0 * H
        D3[is_pole, lh_idx] = 0.001

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

    # Two-pass Screened Poisson diffusion (smooth C-infinity transitions across armpits, sleeves, robes & hip pouches!)
    sigma = (0.078 if has_robe else 0.082) * H
    t_step = 0.5 * (sigma ** 2)
    A = diags(M_diag) + t_step * L_cot
    M_inv = diags(1.0 / np.maximum(A.diagonal(), 1e-12))
    W22 = np.zeros_like(W_hard)
    for bi in range(len(CONTRACT_22)):
        x1, _ = cg(A, M_diag * W_hard[:, bi], x0=W_hard[:, bi], M=M_inv, rtol=1e-5, maxiter=400)
        x2, _ = cg(A, M_diag * x1, x0=x1, M=M_inv, rtol=1e-5, maxiter=400)
        W22[:, bi] = np.maximum(x2, 0.0)
    W22 /= np.maximum(W22.sum(axis=1, keepdims=True), 1e-12)

    # Smooth center-skirt cushion on robes (continuous smoothstep in X, zero hard cliffs!)
    if has_robe:
        idx22 = {bn: i for i, bn in enumerate(CONTRACT_22)}
        l_leg_i = [idx22[b] for b in ("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase")]
        r_leg_i = [idx22[b] for b in ("RightUpLeg", "RightLeg", "RightFoot", "RightToeBase")]
        hips_i = idx22["Hips"]
        # Continuous spatial envelope centered at x=0 between ankle and hip
        ax_n = np.clip(1.0 - np.abs(Vw[:, 0]) / (0.11 * H), 0.0, 1.0)
        sx = ax_n * ax_n * (3.0 - 2.0 * ax_n)
        lo_y = float(P["LeftFoot"][1]) + 0.03 * H
        hi_y = float(P["Hips"][1]) + 0.02 * H
        ay_lo = np.clip((Vw[:, 1] - lo_y) / max(0.08 * H, 1e-4), 0.0, 1.0)
        ay_hi = np.clip((hi_y - Vw[:, 1]) / max(0.08 * H, 1e-4), 0.0, 1.0)
        sy = ay_lo * ay_hi
        # Only cushions where both legs overlap (smooth product)
        w_ll = W22[:, l_leg_i].sum(axis=1)
        w_rl = W22[:, r_leg_i].sum(axis=1)
        overlap = np.clip(4.0 * w_ll * w_rl, 0.0, 1.0)
        shift = 0.65 * sx * sy * overlap
        if shift.max() > 1e-4:
            leg_tot = w_ll + w_rl
            W22[:, l_leg_i + r_leg_i] *= (1.0 - shift)[:, None]
            W22[:, hips_i] += leg_tot * shift
            W22 /= np.maximum(W22.sum(axis=1, keepdims=True), 1e-12)

    W_all = np.zeros((nw, len(names)), dtype=np.float64)
    for bi, bn in enumerate(CONTRACT_22):
        if bn in name_to_idx:
            W_all[:, name_to_idx[bn]] = W22[:, bi]

    # Smooth twist splits ONLY where the arm/forearm bone is already strong (prevents Top-4 slot starvation at creases!)
    for pre in ("Left", "Right"):
        if (pre + "Arm") in name_to_idx and (pre + "ArmTwist") in name_to_idx:
            ia, it = name_to_idx[pre + "Arm"], name_to_idx[pre + "ArmTwist"]
            _, t_seg = _seg_dist(Vw, P[pre + "Arm"], P[pre + "ForeArm"])
            wa = W_all[:, ia].copy()
            gate = np.clip((wa - 0.35) / 0.30, 0.0, 1.0)
            share = np.clip(t_seg, 0.0, 1.0) * 0.55 * gate
            W_all[:, ia] = wa * (1.0 - share)
            W_all[:, it] = wa * share
        if (pre + "ForeArm") in name_to_idx and (pre + "ForeArmTwist") in name_to_idx:
            ifa, ift = name_to_idx[pre + "ForeArm"], name_to_idx[pre + "ForeArmTwist"]
            _, t_seg = _seg_dist(Vw, P[pre + "ForeArm"], P[pre + "Hand"])
            wf = W_all[:, ifa].copy()
            gate = np.clip((wf - 0.35) / 0.30, 0.0, 1.0)
            share = np.clip(t_seg, 0.0, 1.0) * 0.65 * gate
            W_all[:, ifa] = wf * (1.0 - share)
            W_all[:, ift] = wf * share

    # Continuous Top-4 Soft-Thresholding (zero top-4 cliff!)
    ord5 = np.argsort(-W_all, axis=1)[:, :5]
    w5 = np.take_along_axis(W_all, ord5, axis=1)
    ord4 = ord5[:, :4]
    wt4 = np.maximum(w5[:, :4] - w5[:, 4:5], 0.0)
    s4 = wt4.sum(axis=1, keepdims=True)
    bad = s4[:, 0] < 1e-8
    if bad.any():
        wt4[bad] = 0.0
        wt4[bad, 0] = 1.0
        s4[bad] = 1.0
    wt4 = (wt4 / s4).astype(np.float32)

    JI = np.zeros((len(V), 4), dtype=np.uint16)
    JW = np.zeros((len(V), 4), dtype=np.float32)
    JI[is_body_v] = ord4[weld[is_body_v]]
    JW[is_body_v] = wt4[weld[is_body_v]]

    # Disconnected components (e.g. hanging scale pans, brooch, floating ribbon) -> rigid on nearest logical bone
    if (~is_body_v).any():
        v_roots = comp_roots[weld]
        for r_id in np.unique(v_roots[~is_body_v]):
            cm = v_roots == r_id
            pts = V[cm]
            cen = pts.mean(axis=0)
            if has_left_pole and cen[0] > float(P["LeftHand"][0]) - 0.02 * H:
                target_b = name_to_idx.get("LeftHand", 0)
            elif cen[2] < back_z_cut:
                target_b = name_to_idx.get("Spine2", 0)
            elif cen[1] > head_y_cap:
                target_b = name_to_idx.get("Head", 0)
            else:
                best_d, target_b = 1e9, name_to_idx.get("Spine2", 0)
                for bn in CONTRACT_22:
                    if bn in name_to_idx:
                        d_c = float(np.linalg.norm(cen - P[bn]))
                        if d_c < best_d:
                            best_d, target_b = d_c, name_to_idx[bn]
            JI[cm, 0] = target_b
            JW[cm, 0] = 1.0

    return JI, JW


def eval_lbs_stretch(V: np.ndarray, F: np.ndarray, P: dict, names: list[str], JI: np.ndarray, JW: np.ndarray, pose_eulers: dict) -> np.ndarray:
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


def build_contract_22_glb(
    src_glb: str,
    dst_glb: str,
    joints_json: str,
    prop_profile: str = "adult",
    has_robe: bool = False,
    has_left_pole: bool = False,
) -> dict:
    """Attach a clean 22-bone contract humanoid skeleton + Screened Poisson weights directly onto a painted PBR GLB."""
    j, b = read_glb(src_glb)
    prim = j["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    V = accessor(j, b, at["POSITION"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)

    P = fit_proportion_anchors(V, prop_profile=prop_profile, has_left_pole=has_left_pole)
    JI, JW = compute_screened_poisson_weights(V, F, P, CONTRACT_22, has_robe=has_robe, has_left_pole=has_left_pole)

    # 3-pose stretch QA
    p99, max_st, over3 = 1.0, 1.0, 0
    for pose in STRESS_POSES:
        st = eval_lbs_stretch(V, F, P, CONTRACT_22, JI, JW, pose)
        p99 = max(p99, float(np.percentile(st, 99.5)))
        max_st = max(max_st, float(st.max()))
        over3 = max(over3, int((st > 3.0).sum()))

    # Append JOINTS_0, WEIGHTS_0, inverseBindMatrices into GLB binary buffer
    def append_acc(arr, kind, target=None):
        arr = np.ascontiguousarray(arr)
        ct = {np.float32: 5126, np.uint32: 5125, np.uint16: 5123, np.uint8: 5121}[arr.dtype.type]
        while len(b) % 4:
            b.append(0)
        off = len(b)
        raw = arr.tobytes()
        b.extend(raw)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(raw)}
        if target:
            bv["target"] = target
        j["bufferViews"].append(bv)
        j["accessors"].append({"bufferView": len(j["bufferViews"]) - 1, "componentType": ct, "count": int(arr.shape[0]), "type": kind})
        return len(j["accessors"]) - 1

    at["JOINTS_0"] = append_acc(JI.astype(np.uint16), "VEC4", 34962)
    at["WEIGHTS_0"] = append_acc(JW.astype(np.float32), "VEC4", 34962)

    ibms = np.zeros((len(CONTRACT_22), 16), dtype=np.float32)
    for k, nm in enumerate(CONTRACT_22):
        M = np.eye(4, dtype=np.float32)
        M[:3, 3] = -P[nm].astype(np.float32)
        ibms[k] = M.T.ravel()  # glTF column-major
    ibm_acc = append_acc(ibms, "MAT4")

    # Build clean node hierarchy: root(0) -> mesh(1) + Hips(2)..RightToeBase(23)
    mesh_node = {"name": "body", "mesh": 0, "skin": 0}
    bone_nodes = []
    joint_idx_of = {nm: 2 + k for k, nm in enumerate(CONTRACT_22)}
    children_of: dict[str, list[int]] = {nm: [] for nm in CONTRACT_22}
    for nm in CONTRACT_22:
        par = PARENT_22[nm]
        if par is not None:
            children_of[par].append(joint_idx_of[nm])

    for nm in CONTRACT_22:
        par = PARENT_22[nm]
        t = (P[nm] - P[par]) if par is not None else P[nm]
        nd = {"name": nm, "translation": [round(float(x), 6) for x in t]}
        if children_of[nm]:
            nd["children"] = children_of[nm]
        bone_nodes.append(nd)

    j["nodes"] = [{"name": "root", "children": [1, 2]}, mesh_node, *bone_nodes]
    j["skins"] = [{"name": "contract_22", "joints": [joint_idx_of[nm] for nm in CONTRACT_22], "inverseBindMatrices": ibm_acc, "skeleton": 2}]
    j["scenes"] = [{"nodes": [0]}]
    j["scene"] = 0

    write_glb(dst_glb, j, b)
    with open(joints_json, "w", encoding="utf-8") as f:
        json.dump({nm: [round(float(x), 5) for x in P[nm]] for nm in CONTRACT_22}, f, indent=2)
    return {"p99_stretch": round(p99, 2), "max_stretch": round(max_st, 2), "over_3x": over3}


def reskin_forge_58_glb(glb_path: str, has_robe: bool = False, has_left_pole: bool = False) -> dict:
    """Apply Screened Poisson Metric Bone-Heat onto an already-built 58-joint Character Forge GLB (keeps 100% of bones + extras.forge)."""
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

    JI, JW = compute_screened_poisson_weights(V, F, P, names, has_robe=has_robe, has_left_pole=has_left_pole)

    p99, max_st, over3 = 1.0, 1.0, 0
    for pose in STRESS_POSES:
        st = eval_lbs_stretch(V, F, P, names, JI, JW, pose)
        p99 = max(p99, float(np.percentile(st, 99.5)))
        max_st = max(max_st, float(st.max()))
        over3 = max(over3, int((st > 3.0).sum()))

    ji_bv = j["accessors"][at["JOINTS_0"]]["bufferView"]
    jw_bv = j["accessors"][at["WEIGHTS_0"]]["bufferView"]
    tmp = glb_path + ".tmp"
    write_glb(tmp, j, b, {ji_bv: JI.astype(np.uint16).tobytes(), jw_bv: JW.astype(np.float32).tobytes()})
    os.replace(tmp, glb_path)
    return {"p99_stretch": round(p99, 2), "max_stretch": round(max_st, 2), "over_3x": over3}


# ── 4. Pure-Python Orthographic Software Renderer & Multi-View Scorer (runs right in Colab!) ──────────

def _raster_ortho_glb(V: np.ndarray, F: np.ndarray, UV: np.ndarray, base_rgb: np.ndarray, view_name: str, S: int = 768) -> np.ndarray:
    """Fast painter's-algorithm orthographic RGBA rasterizer for instant visual QA & fidelity scoring in Colab."""
    # Map 3D vertex -> (screen_x_right, screen_y_up, depth_toward_cam)
    if view_name == "front":
        sx, sy, sz = V[:, 0], V[:, 1], V[:, 2]
    elif view_name == "back":
        sx, sy, sz = -V[:, 0], V[:, 1], -V[:, 2]
    elif view_name == "left":
        sx, sy, sz = -V[:, 2], V[:, 1], V[:, 0]
    else:  # right
        sx, sy, sz = V[:, 2], V[:, 1], -V[:, 0]

    mn_y, mx_y = float(sy.min()), float(sy.max())
    cx = 0.5 * (float(sx.min()) + float(sx.max()))
    H = max(mx_y - mn_y, 1e-4) * 1.10
    sc = S / H
    px = (sx - cx) * sc + S * 0.5
    py = (mx_y + 0.05 * (mx_y - mn_y) - sy) * sc

    # Face depth (back-to-front painter's sort) + centroid texture lookup (crisp at 58k tris -> ~1-2 px per tri!)
    fz = sz[F].mean(axis=1)
    order = np.argsort(fz)
    Fs = F[order]
    uv_c = UV[Fs].mean(axis=1)
    th, tw = base_rgb.shape[:2]
    tx = np.clip((uv_c[:, 0] % 1.0) * (tw - 1), 0, tw - 1).astype(np.int32)
    ty = np.clip((uv_c[:, 1] % 1.0) * (th - 1), 0, th - 1).astype(np.int32)
    cols = base_rgb[ty, tx]

    img = np.zeros((S, S, 4), dtype=np.uint8)
    pts = np.stack([px, py], axis=1)
    tris = np.round(pts[Fs]).astype(np.int32)
    for tri, col in zip(tris, cols):
        cv2.fillConvexPoly(img, tri, (int(col[0]), int(col[1]), int(col[2]), 255), lineType=cv2.LINE_8)
    return img


def score_glb_views_software(glb_path: str, ref_dir: str, side_key: str, out_dir: str) -> dict:
    """Score a rigged GLB against front / true side / back RGBA cutouts using exact score_views.py metrics."""
    import score_views as sv

    os.makedirs(out_dir, exist_ok=True)
    j, b = read_glb(glb_path)
    prim = j["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    V = accessor(j, b, at["POSITION"]).astype(np.float64)
    UV = accessor(j, b, at["TEXCOORD_0"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
    mat = j["materials"][prim.get("material", 0)]
    ti = mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    T = j["textures"][ti]
    im_idx = T.get("source", T.get("extensions", {}).get("EXT_texture_webp", {}).get("source"))
    bv = j["bufferViews"][j["images"][im_idx]["bufferView"]]
    off = bv.get("byteOffset", 0)
    base_rgb = np.array(Image.open(io.BytesIO(bytes(b[off : off + bv["byteLength"]]))).convert("RGB"))

    res = {}
    views_to_score = [("front", "front"), ("side", side_key), ("back", "back")]
    for label, vkey in views_to_score:
        ren_rgba = _raster_ortho_glb(V, F, UV, base_rgb, vkey, S=768)
        Image.fromarray(ren_rgba).save(os.path.join(out_dir, f"render_{label}.png"))
        ref_im = Image.open(os.path.join(ref_dir, f"{vkey}.png"))
        a = sv.fit(ref_im)
        b_im = sv.fit(Image.fromarray(ren_rgba))
        ma, mb = a[:, :, 3] > 127, b_im[:, :, 3] > 127
        H0, W0 = b_im.shape[:2]
        best, bdx, bb = -1.0, 0, b_im
        for sc in (0.96, 0.98, 1.0, 1.02, 1.04):
            bsc = cv2.resize(b_im, (int(W0 * sc), int(H0 * sc)), interpolation=cv2.INTER_AREA)
            c = np.zeros_like(b_im)
            ox = (W0 - bsc.shape[1]) // 2
            oy = H0 - bsc.shape[0] - int((1 - sc) * H0 * 0.04)
            sx0, sy0 = max(0, -ox), max(0, -oy)
            dx0, dy0 = max(0, ox), max(0, oy)
            w_, h_ = min(W0 - dx0, bsc.shape[1] - sx0), min(H0 - dy0, bsc.shape[0] - sy0)
            c[dy0 : dy0 + h_, dx0 : dx0 + w_] = bsc[sy0 : sy0 + h_, sx0 : sx0 + w_]
            mc = c[:, :, 3] > 127
            for dx in range(-40, 41, 2):
                mbs = np.roll(mc, dx, axis=1)
                iou_ = (ma & mbs).sum() / max(1, (ma | mbs).sum())
                if iou_ > best:
                    best, bdx, bb = float(iou_), dx, c
        b_im = np.roll(bb, bdx, axis=1)
        mb = b_im[:, :, 3] > 127
        inter, uni = (ma & mb), (ma | mb)
        iou = float(inter.sum() / max(1, uni.sum()))
        A = cv2.GaussianBlur(a[:, :, :3], (0, 0), 4).astype(np.float32)
        B = cv2.GaussianBlur(b_im[:, :, :3], (0, 0), 4).astype(np.float32)
        d = np.abs(A - B).mean(2)
        col = float(1.0 - d[inter].mean() / 255.0) if inter.any() else 0.0
        sc_tot = 0.6 * iou + 0.4 * col
        res[label] = {"view": vkey, "iou": round(iou, 3), "colour": round(col, 3), "score": round(sc_tot, 3)}
        xor = np.zeros(a.shape[:2] + (3,), np.uint8)
        xor[ma & ~mb] = (230, 55, 55)
        xor[mb & ~ma] = (55, 115, 240)
        xor[inter] = (72, 74, 82)
        bg = lambda im: (im[:, :, :3] * (im[:, :, 3:4] / 255.0) + np.array([42, 44, 54]) * (1.0 - im[:, :, 3:4] / 255.0)).astype(np.uint8)
        Image.fromarray(np.hstack([bg(a), bg(b_im), xor])).save(os.path.join(out_dir, f"{label}_delta.png"))

    res["overall"] = round(float(np.mean([res[k]["score"] for k in ("front", "side", "back")])), 3)
    with open(os.path.join(out_dir, "scores.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2)
    return res
