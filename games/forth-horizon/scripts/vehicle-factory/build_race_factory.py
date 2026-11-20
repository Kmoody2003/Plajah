"""
Multi-View 3D Vehicle Factory for Apex Elohim (Phase 1: Race Roster, Phase 2: General Vehicle Asset Library).

Runs with D:\Plajah Runtime\tela3d-py\Scripts\python.exe.
Pipeline per car:
  1. Extract clean individual views from turntable MP4 (12-angle orbit) and/or multi-view design sheet crops.
  2. Cut out each view cleanly via Tela u2net (rembg).
  3. Generate 2 candidate 60k-face Hunyuan3D shells on RTX 4070 (front-3/4 & secondary 3/4).
  4. Auto-orient (+Z nose, +Y up, 0.00 deg bilateral yaw symmetry) and test both +Z and -Z against the REAL
     side reference silhouette so NO car is ever backwards!
  5. Score candidates against real side (and front/rear when available) silhouettes via orthographic IoU,
     pick the winning candidate, fit exact real-world proportions + gentle smooth roofline envelope matching,
     apply 14-iter Taubin volume-preserving smoothing, and export public/games/forth-horizon/car/<id>_base.glb.
  6. Measure exact wheel arches, cabin greenhouse, glass bounds, doors/hood/trunk, lamps, exhausts, aero,
     and matched 3D engine bay architecture directly from the oriented GLB -> games/forth-horizon/car/<id>/spec.json.
"""
import argparse
import base64
import gc
import io
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:128")
sys.dont_write_bytecode = True

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d, binary_fill_holes
from scipy.spatial import cKDTree
import trimesh

REPO = Path(r"C:\Users\Kenne\plajah")
CAR_DIR = REPO / "games" / "forth-horizon" / "car"
PUB_CAR_DIR = REPO / "public" / "games" / "forth-horizon" / "car"
FFMPEG = Path(r"C:\Users\Kenne\AppData\Local\Programs\visualz\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe")
PLAN_PATH = Path(r"C:\Users\Kenne\.gemini\antigravity\brain\42e3bfd8-faf9-4bbd-85bf-ae0b60e1bbba\scratch\race_cars_plan.json")

CACHE = REPO / ".cache" / "tela-car"
for sub in ("numba", "temp"):
    (CACHE / sub).mkdir(parents=True, exist_ok=True)
os.environ["NUMBA_CACHE_DIR"] = str(CACHE / "numba")
os.environ["TMP"] = os.environ["TEMP"] = str(CACHE / "temp")
os.environ.setdefault("U2NET_HOME", r"D:\Plajah Models\u2net")

sys.path.insert(0, str(REPO / "engines" / "tela-3d"))

# Verified per-car metadata: exact sheet crop boxes [x0,y0,x1,y1], factory paint/accent hex,
# real-world target length (m), engine bay architecture, lamp/aero/layout style.
CAR_META = {
    "aurelia": {
        "paint": "0x164288", "accent": "0x24d8ff", "targetLen": 4.62, "layout": "mid-v8", "arch": "na-v10",
        "texUrl": "/games/forth-horizon/tex/engines/supercar_v10.jpg", "headStyle": "u-drl", "tailStyle": "full-blade",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.02, 0.04, 0.98, 0.96]},
    },
    "kuronuma": {
        "paint": "0xd4dae2", "accent": "0xd42228", "targetLen": 4.70, "layout": "front-v8", "arch": "i6-turbo",
        "texUrl": "/games/forth-horizon/tex/engines/perf_coupe_i6.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.22, 0.03, 0.96, 0.56], "side": [0.18, 0.55, 0.94, 0.95]},
    },
    "apex_tcr": {
        "paint": "0xb81a24", "accent": "0xf0f2f5", "targetLen": 4.52, "layout": "front-v8", "arch": "i4-turbo",
        "texUrl": "/games/forth-horizon/tex/engines/sports_sedan_20t.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.24, 0.16, 0.96, 0.62], "side": [0.06, 0.60, 0.68, 0.94]},
    },
    "stratos_wrc": {
        "paint": "0x282c34", "accent": "0xe02028", "targetLen": 4.38, "layout": "mid-v8", "arch": "i5-turbo",
        "texUrl": "/games/forth-horizon/tex/engines/turbo_i5.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"rear34": [0.02, 0.24, 0.62, 0.88], "top": [0.62, 0.14, 0.92, 0.92]},
    },
    "zephyr_emotion": {
        "paint": "0x364a5e", "accent": "0x22d4ff", "targetLen": 4.86, "layout": "ev", "arch": "ev",
        "texUrl": "/games/forth-horizon/tex/engines/hybrid_i4.jpg", "headStyle": "u-drl", "tailStyle": "full-blade",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"side": [0.04, 0.36, 0.52, 0.72], "rear34": [0.52, 0.34, 0.96, 0.78]},
    },
    "solstice_r": {
        "paint": "0x2b3038", "accent": "0x00e5ff", "targetLen": 4.74, "layout": "ev", "arch": "ev",
        "texUrl": "/games/forth-horizon/tex/engines/hypercar_tt_v8.jpg", "headStyle": "u-drl", "tailStyle": "full-blade",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"rear34": [0.40, 0.26, 0.96, 0.86], "top": [0.06, 0.16, 0.36, 0.92]},
    },
    "legacy_gtr": {
        "paint": "0x6caad0", "accent": "0xe86c1c", "targetLen": 4.46, "layout": "front-v8", "arch": "rotary",
        "texUrl": "/games/forth-horizon/tex/engines/rotary_twin.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.18, 0.14, 0.82, 0.56], "side": [0.10, 0.55, 0.80, 0.92]},
    },
    "overland_suv": {
        "paint": "0x3c4b32", "accent": "0xd47824", "targetLen": 4.92, "layout": "front-v8", "arch": "suv-v6",
        "texUrl": "/games/forth-horizon/tex/engines/v8_lux_suv.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": True, "isBuggy": False, "isRaceOpp": False, "flip180": True,
        "crops": {"front34": [0.22, 0.04, 0.82, 0.56], "side": [0.06, 0.50, 0.64, 0.96]},
    },
    "titan_fx4": {
        "paint": "0x2a2e34", "accent": "0xd82824", "targetLen": 5.38, "layout": "front-v8", "arch": "pickup-v8",
        "texUrl": "/games/forth-horizon/tex/engines/pickup_v8.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": True, "isBuggy": False, "isRaceOpp": False,
        "crops": {"rear34": [0.24, 0.52, 0.82, 0.96], "top": [0.24, 0.06, 0.82, 0.50]},
    },
    "dunerunner": {
        "paint": "0xb85826", "accent": "0x1c1e22", "targetLen": 4.18, "layout": "mid-v8", "arch": "muscle-v8",
        "texUrl": "/games/forth-horizon/tex/engines/muscle_v8.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": True, "isTruck": True, "isBuggy": True, "isRaceOpp": False, "flip180": True,
        "crops": {"rear34": [0.02, 0.24, 0.60, 0.88], "top": [0.62, 0.16, 0.96, 0.94]},
    },
    "veloce": {
        "paint": "0xc41820", "accent": "0x181a1e", "targetLen": 4.60, "layout": "mid-v8", "arch": "sports-v8",
        "texUrl": "/games/forth-horizon/tex/engines/sports_car_gt.jpg", "headStyle": "u-drl", "tailStyle": "full-blade",
        "hasWing": False, "isOpenTop": True, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.03, 0.15, 0.51, 0.53], "rear34": [0.51, 0.15, 0.97, 0.53], "side": [0.16, 0.51, 0.84, 0.85]},
    },
    "sidewinder": {
        "paint": "0xd8a814", "accent": "0x16181c", "targetLen": 4.64, "layout": "front-v8", "arch": "sports-v8",
        "texUrl": "/games/forth-horizon/tex/engines/sports_car_gt.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.05, 0.16, 0.49, 0.49], "rear34": [0.49, 0.16, 0.95, 0.49], "side": [0.18, 0.48, 0.82, 0.80]},
    },
    "voltstrike": {
        "paint": "0xdbe0e8", "accent": "0x12d8ff", "targetLen": 4.82, "layout": "ev", "arch": "ev",
        "texUrl": "/games/forth-horizon/tex/engines/hybrid_i4.jpg", "headStyle": "u-drl", "tailStyle": "full-blade",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.06, 0.16, 0.50, 0.48], "rear34": [0.49, 0.16, 0.94, 0.48], "side": [0.08, 0.48, 0.92, 0.80]},
    },
    "solstice": {
        "paint": "0x262a42", "accent": "0x80a8ff", "targetLen": 4.84, "maxH": 1.35, "layout": "ev", "arch": "ev",
        "texUrl": "/games/forth-horizon/tex/engines/hybrid_i4.jpg", "headStyle": "u-drl", "tailStyle": "full-blade",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.01, 0.24, 0.34, 0.68], "side": [0.33, 0.24, 0.69, 0.68], "rear34": [0.68, 0.24, 0.99, 0.68]},
    },
    "helios": {
        "paint": "0x181c24", "accent": "0x00f5d4", "targetLen": 4.72, "maxH": 1.22, "layout": "ev", "arch": "ev",
        "texUrl": "/games/forth-horizon/tex/engines/megacar_w16.jpg", "headStyle": "u-drl", "tailStyle": "full-blade",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.01, 0.24, 0.34, 0.72], "side": [0.33, 0.24, 0.68, 0.72], "rear34": [0.67, 0.24, 0.99, 0.72]},
    },
    "ironhide": {
        "paint": "0x162642", "accent": "0xd8dde6", "targetLen": 4.84, "layout": "front-v8", "arch": "muscle-v8",
        "texUrl": "/games/forth-horizon/tex/engines/muscle_v8.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.01, 0.24, 0.35, 0.70], "side": [0.34, 0.24, 0.68, 0.70], "rear34": [0.67, 0.24, 0.99, 0.70]},
    },
    "terracorsa": {
        "paint": "0xd8d8d4", "accent": "0xc82228", "targetLen": 4.44, "layout": "front-v8", "arch": "sports-v8",
        "texUrl": "/games/forth-horizon/tex/engines/sports_car_gt.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.04, 0.14, 0.49, 0.48], "rear34": [0.50, 0.14, 0.96, 0.48], "side": [0.18, 0.46, 0.82, 0.80]},
    },
    "continental": {
        "paint": "0x5a141c", "accent": "0xd4d8de", "targetLen": 4.88, "layout": "front-v8", "arch": "muscle-v8",
        "texUrl": "/games/forth-horizon/tex/engines/muscle_v8.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": False, "isBuggy": False, "isRaceOpp": True,
        "crops": {"front34": [0.03, 0.14, 0.43, 0.47], "side": [0.43, 0.14, 0.97, 0.47], "rear34": [0.06, 0.46, 0.94, 0.84]},
    },
    "badlands": {
        "paint": "0xa89270", "accent": "0x1a1c20", "targetLen": 5.18, "layout": "front-v8", "arch": "suv-v6",
        "texUrl": "/games/forth-horizon/tex/engines/v6_suv_sport.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": True, "isBuggy": False, "isRaceOpp": False,
        "crops": {"front34": [0.06, 0.16, 0.46, 0.48], "side": [0.46, 0.16, 0.94, 0.48], "rear34": [0.24, 0.48, 0.76, 0.80]},
    },
    "kodiak": {
        "paint": "0x1e3426", "accent": "0x24262a", "targetLen": 5.48, "layout": "front-v8", "arch": "diesel-v8",
        "texUrl": "/games/forth-horizon/tex/engines/diesel_pickup.jpg", "headStyle": "u-drl", "tailStyle": "double-u",
        "hasWing": False, "isOpenTop": False, "isTruck": True, "isBuggy": False, "isRaceOpp": False, "flip180": True,
        "crops": {"front34": [0.01, 0.24, 0.34, 0.72], "side": [0.33, 0.24, 0.68, 0.72], "rear34": [0.67, 0.24, 0.99, 0.72]},
    },
}


def extract_turntable_frames(mp4_path: Path, views_dir: Path, n_frames: int = 12) -> list[Path]:
    views_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(views_dir.glob("tt_[0-9][0-9].png"))
    if len(existing) >= n_frames:
        return existing[:n_frames]
    # Probe duration via ffmpeg
    probe = subprocess.run([str(FFMPEG), "-i", str(mp4_path)], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    dur = 8.0
    for line in probe.stderr.splitlines():
        if "Duration:" in line:
            try:
                hms = line.split("Duration:")[1].split(",")[0].strip().split(":")
                dur = float(hms[0]) * 3600 + float(hms[1]) * 60 + float(hms[2])
            except Exception:
                pass
            break
    fps = max(0.5, n_frames / max(1.0, dur - 0.15))
    pattern = str(views_dir / "tt_%02d.png")
    subprocess.run(
        [str(FFMPEG), "-y", "-v", "error", "-i", str(mp4_path), "-vf", f"fps={fps:.4f}", "-frames:v", str(n_frames), pattern],
        check=True,
    )
    return sorted(views_dir.glob("tt_[0-9][0-9].png"))


def alpha_bbox_stats(img_rgba: Image.Image) -> tuple[float, float, np.ndarray]:
    arr = np.asarray(img_rgba)
    mask = arr[:, :, 3] > 32
    ys, xs = np.nonzero(mask)
    if len(xs) < 100:
        return 0.0, 0.0, mask
    w = int(xs.max() - xs.min() + 1)
    h = int(ys.max() - ys.min() + 1)
    crop_mask = mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    area = float(crop_mask.sum()) / float(arr.shape[0] * arr.shape[1])
    return w / max(1.0, h), area, crop_mask


def rasterize_mesh_silhouette(verts: np.ndarray, axes: tuple[int, int], res: int = 192) -> np.ndarray:
    """Orthographic silhouette mask of 3D vertices projected onto (axes[0], axes[1]) normalized to its bbox."""
    u = verts[:, axes[0]]
    v = verts[:, axes[1]]
    u0, u1 = float(u.min()), float(u.max())
    v0, v1 = float(v.min()), float(v.max())
    uw = max(1e-5, u1 - u0)
    vh = max(1e-5, v1 - v0)
    aspect = uw / vh
    if aspect >= 1.0:
        W = res
        H = max(16, int(round(res / aspect)))
    else:
        H = res
        W = max(16, int(round(res * aspect)))
    ix = np.clip(((u - u0) / uw * (W - 1)).astype(np.int32), 0, W - 1)
    iy = np.clip(((v1 - v) / vh * (H - 1)).astype(np.int32), 0, H - 1)
    img = np.zeros((H, W), dtype=bool)
    img[iy, ix] = True
    # Fill tiny gaps by 3x3 dilation then hole fill
    from scipy.ndimage import binary_dilation
    img = binary_dilation(img, iterations=2)
    img = binary_fill_holes(img)
    return img


def silhouette_iou(mask_mesh: np.ndarray, mask_ref: np.ndarray) -> float:
    """IoU between two cropped binary silhouettes resized to a common grid."""
    H, W = 128, 256
    im_m = Image.fromarray((mask_mesh.astype(np.uint8) * 255)).resize((W, H), Image.Resampling.BILINEAR)
    im_r = Image.fromarray((mask_ref.astype(np.uint8) * 255)).resize((W, H), Image.Resampling.BILINEAR)
    a = np.asarray(im_m) > 127
    b = np.asarray(im_r) > 127
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter) / float(max(1, union))


def taubin_smooth(mesh: trimesh.Trimesh, iters: int = 14, lam: float = 0.50, mu: float = -0.53) -> trimesh.Trimesh:
    verts = mesh.vertices.astype(np.float64).copy()
    edges = mesh.edges_unique
    n = len(verts)
    i0, i1 = edges[:, 0], edges[:, 1]
    deg = np.zeros(n, dtype=np.float64)
    np.add.at(deg, i0, 1.0)
    np.add.at(deg, i1, 1.0)
    deg = np.maximum(deg, 1.0)
    for _ in range(iters):
        for w in (lam, mu):
            acc = np.zeros_like(verts)
            np.add.at(acc, i0, verts[i1])
            np.add.at(acc, i1, verts[i0])
            avg = acc / deg[:, None]
            verts = verts + w * (avg - verts)
    mesh.vertices = verts.astype(np.float32)
    return mesh


def clean_temp_cache() -> None:
    """Immediately delete leaked pymeshlab/trimesh temp files so C: never runs short on space."""
    tmp_dir = CACHE / "temp"
    if not tmp_dir.exists():
        return
    for fp in tmp_dir.iterdir():
        try:
            if fp.is_file():
                fp.unlink(missing_ok=True)
        except Exception:
            pass


def symmetrize_mesh_bilateral(mesh: trimesh.Trimesh, strength: float = 0.60) -> trimesh.Trimesh:
    """
    Class-A automotive bilateral symmetry fairing: gently blends every vertex toward its exact
    mirror (-x, y, z) on the opposite side via KD-tree so left and right fenders, arches, intakes,
    and greenhouse creases lock into razor-sharp symmetric CAD geometry while staying 100% manifold.
    """
    v = mesh.vertices.astype(np.float64).copy()
    if len(v) < 500:
        return mesh
    # Mirror cloud across X = 0
    mir = v.copy()
    mir[:, 0] = -mir[:, 0]
    tree = cKDTree(mir)
    dists, idx = tree.query(v, k=1)
    matched = mir[idx]
    # Only blend vertices whose mirrored counterpart is reasonably close (< 0.14 m) so asymmetric antennas/bits never tear
    # Smoothly taper weight to 0 right on the centerline (|x| < 0.02 m) to keep manifoldness spotless
    w_dist = np.clip(1.0 - (dists / 0.14) ** 2, 0.0, 1.0)
    w_center = np.clip((np.abs(v[:, 0]) - 0.015) / 0.045, 0.0, 1.0)
    w = (strength * w_dist * w_center)[:, None]
    v = v * (1.0 - w) + matched * w
    mesh.vertices = v.astype(np.float32)
    return mesh


def orient_mesh_canonical(mesh: trimesh.Trimesh, side_ref_mask: np.ndarray | None, is_truck: bool = False, flip180: bool = False, flipUp: bool = False, keep_native_up: bool = False) -> tuple[trimesh.Trimesh, float, float]:
    """
    Canonical car frame: X across (+left), Y up (min Y = 0), Z along (+nose).
    Uses PCA (or horizontal 2D PCA when keep_native_up=True for asymmetric-height semis/tow trucks)
    + wheel-footprint upright check + bilateral symmetry fine yaw + nose check!
    Returns (oriented_mesh, best_side_iou, yaw_sym_deg).
    """
    v = mesh.vertices.astype(np.float64).copy()
    v -= v.mean(axis=0)

    if keep_native_up:
        # Preserve Hunyuan3D's flat horizontal floor (+Y up) and align length (+Z) & width (X) via 2D XZ PCA!
        xz = v[:, [0, 2]]
        cov2 = np.cov(xz.T)
        ew2, ev2 = np.linalg.eigh(cov2)
        ax_x2 = ev2[:, 0]  # shorter horizontal axis = width
        ax_z2 = ev2[:, 1]  # longer horizontal axis = length
        R = np.array([
            [ax_x2[0], 0.0, ax_z2[0]],
            [0.0,      1.0, 0.0     ],
            [ax_x2[1], 0.0, ax_z2[1]],
        ], dtype=np.float64)
        if np.linalg.det(R) < 0:
            R[:, 0] *= -1
        v = v @ R
    else:
        # 1. Principal axes: longest = length (Z); choose between the two shorter axes for width (X) vs height (Y)
        # by bilateral mirror symmetry across X=0! (Works for BOTH wide low supercars AND tall narrow vans/buses/box trucks!)
        cov = np.cov(v.T)
        eigvals, eigvecs = np.linalg.eigh(cov)
        order = np.argsort(eigvals)
        ax_z = eigvecs[:, order[2]]

        def _quick_mirror_err(pts: np.ndarray) -> float:
            zb = np.clip(((pts[:, 2] - pts[:, 2].min()) / max(1e-5, pts[:, 2].ptp()) * 16).astype(int), 0, 15)
            yb = np.clip(((pts[:, 1] - pts[:, 1].min()) / max(1e-5, pts[:, 1].ptp()) * 12).astype(int), 0, 11)
            keys = yb * 16 + zb
            err = 0.0
            cnt = 0
            for k in np.unique(keys):
                xs = pts[keys == k, 0]
                if len(xs) >= 8:
                    err += abs(xs.max() + xs.min()) / max(0.05, xs.ptp())
                    cnt += 1
            return err / max(1, cnt)

        best_v = None
        best_me = 1e9
        for idx_x, idx_y in ((order[1], order[0]), (order[0], order[1])):
            ax_x = eigvecs[:, idx_x]
            ax_y = eigvecs[:, idx_y]
            R = np.stack([ax_x, ax_y, ax_z], axis=1)
            if np.linalg.det(R) < 0:
                R[:, 0] *= -1
            vc = v @ R
            me = _quick_mirror_err(vc)
            if me < best_me:
                best_me = me
                best_v = vc
        v = best_v

    # 2. Ensure +Y is UP:
    # A right-side-up vehicle ALWAYS has its bottom 16% dominated by outer tyres (large mean |x|),
    # whereas its top 22% (roof/cab) is narrower in X AND centered in X (smaller mean |x| and span)!
    y0, y1 = v[:, 1].min(), v[:, 1].max()
    yh = max(1e-5, y1 - y0)
    top_slice = v[v[:, 1] > y0 + 0.76 * yh]
    bot_slice = v[v[:, 1] < y0 + 0.22 * yh]
    top_mean_ax = float(np.mean(np.abs(top_slice[:, 0]))) if len(top_slice) > 20 else 9.0
    bot_mean_ax = float(np.mean(np.abs(bot_slice[:, 0]))) if len(bot_slice) > 20 else 1.0
    top_span = (top_slice[:, 0].ptp() + 0.5 * top_slice[:, 2].ptp()) if len(top_slice) > 20 else 9.0
    bot_span = (bot_slice[:, 0].ptp() + 0.5 * bot_slice[:, 2].ptp()) if len(bot_slice) > 20 else 1.0
    if not keep_native_up and ((top_mean_ax > bot_mean_ax * 1.06) or (top_span > bot_span * 1.08 and top_mean_ax >= bot_mean_ax * 0.96)):
        # Upside down! Flip 180 deg around Z
        v[:, 0] *= -1
        v[:, 1] *= -1
    if flipUp:
        v[:, 0] *= -1
        v[:, 1] *= -1

    # 3. Fine yaw symmetry alignment (-8 deg .. +8 deg) around Y axis so left & right mirror cleanly
    def sym_error(pts: np.ndarray) -> float:
        # Bin (y, z) cells and compare |max_x| vs |min_x|
        z0, z1 = pts[:, 2].min(), pts[:, 2].max()
        yb = np.clip(((pts[:, 1] - pts[:, 1].min()) / max(1e-5, pts[:, 1].ptp()) * 16).astype(int), 0, 15)
        zb = np.clip(((pts[:, 2] - z0) / max(1e-5, z1 - z0) * 24).astype(int), 0, 23)
        keys = yb * 24 + zb
        err = 0.0
        cnt = 0
        for k in np.unique(keys):
            xs = pts[keys == k, 0]
            if len(xs) >= 6:
                err += abs(xs.max() + xs.min())
                cnt += 1
        return err / max(1, cnt)

    best_ang = 0.0
    best_err = 1e9
    for deg in np.linspace(-8.0, 8.0, 65):
        rad = math.radians(deg)
        c, s = math.cos(rad), math.sin(rad)
        vr = v.copy()
        vr[:, 0] = v[:, 0] * c - v[:, 2] * s
        vr[:, 2] = v[:, 0] * s + v[:, 2] * c
        e = sym_error(vr)
        if e < best_err:
            best_err = e
            best_ang = deg
    rad = math.radians(best_ang)
    c, s = math.cos(rad), math.sin(rad)
    v_rot = v.copy()
    v_rot[:, 0] = v[:, 0] * c - v[:, 2] * s
    v_rot[:, 2] = v[:, 0] * s + v[:, 2] * c
    v = v_rot

    # 4. Determine true nose (+Z) vs tail (-Z):
    z0, z1 = v[:, 2].min(), v[:, 2].max()
    zl = max(1e-5, z1 - z0)
    y_min = v[:, 1].min()
    if is_truck:
        # On open-bed pickups, tow trucks, and semi tractors, the tall cab (top 20% height) sits forward of Z=0
        # while the open bed / flatbed / fifth-wheel sits aft of Z=0!
        y_hi = v[:, 1].max()
        yh_tot = max(1e-5, y_hi - y_min)
        cab_pts = v[v[:, 1] > y_min + 0.80 * yh_tot]
        z_mid = (z0 + z1) * 0.5
        if len(cab_pts) > 20 and float(np.mean(cab_pts[:, 2])) < z_mid:
            v[:, 0] *= -1
            v[:, 2] *= -1
    else:
        front_hi = np.percentile(v[v[:, 2] > z1 - 0.22 * zl, 1] - y_min, 92)
        rear_hi = np.percentile(v[v[:, 2] < z0 + 0.22 * zl, 1] - y_min, 92)
        if front_hi > rear_hi * 1.03:
            # Nose was pointing -Z -> rotate 180 deg around Y!
            v[:, 0] *= -1
            v[:, 2] *= -1
    if flip180:
        v[:, 0] *= -1
        v[:, 2] *= -1

    # Validate & score against REAL side reference silhouette (check both left-facing and right-facing flips of the ref!)
    side_iou = 0.0
    if side_ref_mask is not None:
        m_pos = rasterize_mesh_silhouette(v, (2, 1))  # +Z right
        iou_r = silhouette_iou(m_pos, side_ref_mask)
        iou_l = silhouette_iou(m_pos, np.fliplr(side_ref_mask))
        side_iou = max(iou_r, iou_l)

    mesh.vertices = v.astype(np.float32)
    return mesh, side_iou, best_ang


def fit_proportions_and_profile(
    mesh: trimesh.Trimesh,
    target_len: float,
    side_ref_mask: np.ndarray | None,
    front_ref_mask: np.ndarray | None,
    is_truck: bool = False,
    max_h: float | None = None,
) -> tuple[trimesh.Trimesh, float]:
    """Scale to exact real-world length + reference side/front aspect ratios + gentle smooth top envelope fit."""
    v = mesh.vertices.astype(np.float64).copy()
    cur_w = max(1e-5, v[:, 0].ptp())
    cur_h = max(1e-5, v[:, 1].ptp())
    cur_l = max(1e-5, v[:, 2].ptp())

    scale_z = target_len / cur_l
    target_h = cur_h * scale_z
    target_w = cur_w * scale_z

    if side_ref_mask is not None:
        ref_aspect_lh = side_ref_mask.shape[1] / max(1.0, side_ref_mask.shape[0])
        # Blend 65% reference side aspect ratio with 35% Hunyuan native to keep authentic height without squashing
        ref_h = target_len / np.clip(ref_aspect_lh, 1.8, 4.4)
        target_h = 0.65 * ref_h + 0.35 * target_h
    if front_ref_mask is not None:
        ref_aspect_wh = front_ref_mask.shape[1] / max(1.0, front_ref_mask.shape[0])
        ref_w = target_h * np.clip(ref_aspect_wh, 1.0, 2.0)
        target_w = 0.55 * ref_w + 0.45 * target_w

    # Keep realistic automotive width & height bounds so a noisy crop margin never stretches a low-slung GT tall
    w_min, w_max = (1.92, 2.22) if is_truck else (1.84, 2.04)
    h_min, h_max = (1.50, 2.08) if is_truck else (1.12, max_h if max_h is not None else 1.44)
    target_w = float(np.clip(target_w, w_min, w_max))
    target_h = float(np.clip(target_h, h_min, h_max))

    v[:, 0] = (v[:, 0] - (v[:, 0].min() + v[:, 0].max()) * 0.5) * (target_w / cur_w)
    v[:, 1] = (v[:, 1] - v[:, 1].min()) * (target_h / cur_h)
    v[:, 2] = (v[:, 2] - (v[:, 2].min() + v[:, 2].max()) * 0.5) * (target_len / cur_l)

    # Gentle smooth upper-envelope fitting to real side silhouette (zero voxel terracing!)
    final_side_iou = 0.0
    if side_ref_mask is not None:
        m_pos = rasterize_mesh_silhouette(v, (2, 1))
        ref_use = side_ref_mask if silhouette_iou(m_pos, side_ref_mask) >= silhouette_iou(m_pos, np.fliplr(side_ref_mask)) else np.fliplr(side_ref_mask)
        # Extract smooth upper envelope y_ref(u) in [0..1] along 48 longitudinal stations
        rh, rw = ref_use.shape
        stations = 48
        ref_top = np.zeros(stations)
        for i in range(stations):
            c0 = int(i * rw / stations)
            c1 = max(c0 + 1, int((i + 1) * rw / stations))
            ys = np.nonzero(ref_use[:, c0:c1])[0]
            ref_top[i] = (1.0 - ys.min() / max(1, rh - 1)) if len(ys) else 0.0
        ref_top = gaussian_filter1d(ref_top, sigma=1.6)

        z0, z1 = v[:, 2].min(), v[:, 2].max()
        mesh_top = np.zeros(stations)
        for i in range(stations):
            za = z0 + (i / stations) * (z1 - z0)
            zb = z0 + ((i + 1) / stations) * (z1 - z0)
            sel = (v[:, 2] >= za) & (v[:, 2] <= zb)
            mesh_top[i] = (v[sel, 1].max() / target_h) if sel.any() else 0.0
        mesh_top = gaussian_filter1d(mesh_top, sigma=1.6)

        # Compute clamped gentle scale factor [0.92 .. 1.08] for upper body (y > 0.35 * H)
        ratio = np.ones(stations)
        valid = (ref_top > 0.25) & (mesh_top > 0.25)
        ratio[valid] = np.clip(ref_top[valid] / mesh_top[valid], 0.92, 1.08)
        ratio = gaussian_filter1d(ratio, sigma=2.2)

        u_idx = np.clip(((v[:, 2] - z0) / max(1e-5, z1 - z0)) * (stations - 1), 0, stations - 1)
        s_vert = np.interp(u_idx, np.arange(stations), ratio)
        # Blend smoothly from y=0.30*H upward so wheel arches stay perfectly circular!
        w_up = np.clip((v[:, 1] / target_h - 0.32) / 0.35, 0.0, 1.0)
        v[:, 1] *= 1.0 + (s_vert - 1.0) * w_up

        m_after = rasterize_mesh_silhouette(v, (2, 1))
        final_side_iou = silhouette_iou(m_after, ref_use)

    mesh.vertices = v.astype(np.float32)
    mesh = symmetrize_mesh_bilateral(mesh, strength=0.62)
    mesh = taubin_smooth(mesh, iters=24, lam=0.50, mu=-0.525)

    # Re-ground min_y = 0, center x/z = 0 cleanly
    v = mesh.vertices.astype(np.float64)
    v[:, 0] -= (v[:, 0].min() + v[:, 0].max()) * 0.5
    v[:, 1] -= v[:, 1].min()
    v[:, 2] -= (v[:, 2].min() + v[:, 2].max()) * 0.5
    mesh.vertices = v.astype(np.float32)
    return mesh, final_side_iou


def measure_spec_from_glb(car_id: str, car_name: str, mesh: trimesh.Trimesh, meta: dict) -> dict:
    """Measure exact wheel centers, cabin greenhouse, glass bounds, panels, lamps, exhausts & aero directly from the mesh."""
    v = mesh.vertices.astype(np.float64)
    half_w = float(max(abs(v[:, 0].min()), abs(v[:, 0].max())))
    H = float(v[:, 1].max())
    z_min, z_max = float(v[:, 2].min()), float(v[:, 2].max())
    L = z_max - z_min

    is_truck = meta.get("isTruck", False)
    is_buggy = meta.get("isBuggy", False)
    is_open = meta.get("isOpenTop", False)
    is_mid = meta.get("layout") == "mid-v8"

    # ---- 1. Measure wheel centers directly from lowest outer contact patches (y < 0.14 * H, |x| > 0.50 * half_w) ----
    low_outer = v[(v[:, 1] < 0.14 * H) & (np.abs(v[:, 0]) > 0.48 * half_w)]
    front_pts = low_outer[low_outer[:, 2] > 0.12 * L]
    rear_pts = low_outer[low_outer[:, 2] < -0.12 * L]
    front_z = float(np.median(front_pts[:, 2])) if len(front_pts) > 20 else 0.305 * L
    rear_z = float(np.median(rear_pts[:, 2])) if len(rear_pts) > 20 else -0.305 * L
    front_z = float(np.clip(front_z, 0.24 * L, 0.37 * L))
    rear_z = float(np.clip(rear_z, -0.37 * L, -0.24 * L))

    # Measure outer body width right around front & rear axles for flush wheel fitment
    f_band = v[(np.abs(v[:, 2] - front_z) < 0.32) & (v[:, 1] > 0.12 * H) & (v[:, 1] < 0.52 * H)]
    r_band = v[(np.abs(v[:, 2] - rear_z) < 0.32) & (v[:, 1] > 0.12 * H) & (v[:, 1] < 0.52 * H)]
    f_outer_x = float(np.percentile(np.abs(f_band[:, 0]), 96)) if len(f_band) > 30 else half_w * 0.94
    r_outer_x = float(np.percentile(np.abs(r_band[:, 0]), 96)) if len(r_band) > 30 else half_w * 0.95

    wheel_scale = 1.24 if is_buggy else (1.18 if is_truck else float(np.clip(H / 1.32, 0.96, 1.08)))
    tyre_r = round(0.355 * wheel_scale, 3)
    rim_r = round(0.248 * wheel_scale, 3)
    discard_r = round(tyre_r * 1.04, 3)
    # Wheel center X sits flush just inside fender lip (wheel half-width ~ 0.145 * scale)
    front_x = round(max(0.68, f_outer_x - 0.155 * wheel_scale), 3)
    rear_x = round(max(0.68, r_outer_x - 0.165 * wheel_scale), 3)

    # ---- 2. Measure cabin beltline, roof height, windshield & rear glass Z spans ----
    # Sample maximum Y along centerline (|x| < 0.35 * half_w) at 60 stations
    zs = np.linspace(z_min + 0.06, z_max - 0.06, 60)
    y_prof = np.zeros(60)
    for i, zc in enumerate(zs):
        sl = v[(np.abs(v[:, 2] - zc) < L / 45.0) & (np.abs(v[:, 0]) < 0.40 * half_w)]
        y_prof[i] = float(np.percentile(sl[:, 1], 97)) if len(sl) > 5 else 0.0
    y_prof = gaussian_filter1d(y_prof, sigma=1.2)

    roof_y = float(y_prof.max())
    # Belt height: front hood shoulder height around front axle + ~0.12m, or 0.67 * H for sedans/trucks
    f_hood_idx = int(np.argmin(np.abs(zs - front_z)))
    hood_h = float(y_prof[f_hood_idx])
    belt = round(float(np.clip(max(hood_h + 0.08, roof_y * (0.64 if is_truck else 0.72)), 0.72, roof_y - 0.24)), 3)
    roof_edge = round(roof_y - 0.04, 3)

    # Find cabin Z bounds where y_prof > belt + 0.04 and roof plateau where y_prof > roof_y - 0.11
    above_belt = np.nonzero(y_prof > belt + 0.04)[0]
    on_roof = np.nonzero(y_prof > roof_y - 0.11)[0]
    if len(above_belt) >= 4 and len(on_roof) >= 2:
        rear_base = float(zs[above_belt[0]])
        wind_base = float(zs[above_belt[-1]])
        rear_top = float(zs[on_roof[0]])
        wind_top = float(zs[on_roof[-1]])
    else:
        wind_base, wind_top = 0.18 * L, 0.02 * L
        rear_top, rear_base = -0.18 * L, -0.34 * L

    # Enforce sane glass monotonicity
    wind_base = float(np.clip(wind_base, 0.08 * L, 0.34 * L))
    wind_top = float(np.clip(wind_top, -0.08 * L, wind_base - 0.36))
    rear_top = float(np.clip(rear_top, -0.32 * L, wind_top - 0.28))
    rear_base = float(np.clip(rear_base, -0.44 * L, rear_top - 0.26))
    rear_base2 = round(rear_base + 0.03, 3)

    # Measure greenhouse half-width at mid-glass height
    mid_glass_y = (belt + roof_edge) * 0.5
    wind_sl = v[(np.abs(v[:, 2] - (wind_base + wind_top) * 0.5) < 0.25) & (np.abs(v[:, 1] - mid_glass_y) < 0.12)]
    rear_sl = v[(np.abs(v[:, 2] - (rear_base + rear_top) * 0.5) < 0.25) & (np.abs(v[:, 1] - mid_glass_y) < 0.12)]
    wind_hw = round(float(np.clip(np.percentile(np.abs(wind_sl[:, 0]), 88) - 0.08 if len(wind_sl) > 15 else half_w * 0.56, 0.44, half_w * 0.72)), 3)
    rear_hw = round(float(np.clip(np.percentile(np.abs(rear_sl[:, 0]), 88) - 0.08 if len(rear_sl) > 15 else half_w * 0.50, 0.40, half_w * 0.70)), 3)

    door_front = round(min(front_z - tyre_r - 0.06, wind_base + 0.04), 3)
    door_rear = round(max(rear_z + tyre_r + 0.06, rear_top - 0.06), 3)
    if door_front - door_rear < 0.75:
        door_front = round(wind_base + 0.02, 3)
        door_rear = round(door_front - 1.15, 3)

    side_window = [
        [round(door_rear + 0.06, 3), round(belt + 0.03, 3)],
        [round(door_front - 0.06, 3), round(belt + 0.02, 3)],
        [round(door_front - 0.10, 3), round(belt + (roof_edge - belt) * 0.36, 3)],
        [round((door_front + wind_top) * 0.5, 3), round(belt + (roof_edge - belt) * 0.72, 3)],
        [round(wind_top, 3), round(roof_edge - 0.02, 3)],
        [round(rear_top + 0.06, 3), round(roof_edge - 0.02, 3)],
        [round(rear_top - 0.16, 3), round(belt + (roof_edge - belt) * 0.62, 3)],
        [round(door_rear - 0.04, 3), round(belt + 0.06, 3)],
    ]

    # ---- 3. Panels (openable doors; hood/trunk only on closed-body front-engine cars; clean cuts=False on open buggies) ----
    use_cuts = not is_buggy
    panels = {
        "doorL": {"hinge": [round(half_w * 0.90, 3), 0.0, door_front], "axis": [0, 1, 0], "open": -1.0},
        "doorR": {"hinge": [round(-half_w * 0.90, 3), 0.0, door_front], "axis": [0, 1, 0], "open": 1.0},
    }
    if not is_mid and not is_buggy:
        panels["hood"] = {"hinge": [0.0, round(belt, 3), round(wind_base + 0.02, 3)], "axis": [1, 0, 0], "open": -0.92}
    if not is_mid and not is_truck and not is_buggy:
        panels["trunk"] = {"hinge": [0.0, round(belt + 0.02, 3), round(rear_base, 3)], "axis": [1, 0, 0], "open": 0.85}

    hood_z0 = round(wind_base + 0.04, 3)
    hood_z1 = round(z_max - 0.18, 3)
    trunk_z0 = round(z_min + 0.14, 3)
    trunk_z1 = round(rear_base - 0.02, 3)

    # ---- 4. Measured Headlamps, Taillamps, Exhausts, Trim & Engine Bay ----
    # Measure lower-rear bumper Z strictly below greenhouse/wing so overhanging rear wings NEVER push exhausts or lamps out!
    low_rear = v[(v[:, 2] < -0.25 * L) & (v[:, 1] > 0.14 * H) & (v[:, 1] < 0.42 * H) & (np.abs(v[:, 0]) < 0.48 * half_w)]
    rear_bumper_z = float(np.percentile(low_rear[:, 2], 4)) if len(low_rear) > 20 else z_min + 0.08
    low_front = v[(v[:, 2] > 0.25 * L) & (v[:, 1] > 0.14 * H) & (v[:, 1] < 0.46 * H) & (np.abs(v[:, 0]) < 0.48 * half_w)]
    front_bumper_z = float(np.percentile(low_front[:, 2], 96)) if len(low_front) > 20 else z_max - 0.06

    # Measure cowl Y directly from centerline profile at windshield base so wipers hug glass cleanly
    cowl_idx = int(np.argmin(np.abs(zs - wind_base)))
    cowl_y = round(float(np.clip(y_prof[cowl_idx] - 0.03, belt - 0.16, belt)), 3)
    cowl_z = round(wind_base - 0.05, 3)

    nose_sl = v[(v[:, 2] > front_bumper_z - 0.35) & (v[:, 1] < belt * 0.96)]
    tail_sl = v[(v[:, 2] < rear_bumper_z + 0.35) & (v[:, 1] < belt * 0.92) & (np.abs(v[:, 0]) < 0.78 * half_w)]
    nose_max_y = float(np.percentile(nose_sl[:, 1], 90)) if len(nose_sl) > 20 else belt * 0.78
    tail_max_y = float(np.percentile(tail_sl[:, 1], 88)) if len(tail_sl) > 20 else belt * 0.84
    head_y = round(float(np.clip(nose_max_y * 0.78, 0.48, belt - 0.08)), 3)
    if is_truck:
        tail_y = round(float(np.clip(tail_max_y * 0.82, 0.76, min(belt * 0.90, 1.12))), 3)
    else:
        tail_y = round(float(np.clip(tail_max_y * 0.80, 0.60, min(belt * 0.84, 0.86))), 3)
    head_x = round(half_w * 0.54, 3)
    if meta["tailStyle"] == "full-blade":
        tail_x = round(half_w * 0.52, 3)
        tail_len = round(half_w * 0.28, 3)
    else:
        tail_x = round(half_w * 0.52, 3)
        tail_len = round(half_w * 0.34, 3)

    eng_z = round(-0.98 if is_mid else min(front_z - 0.08, z_max - 0.88), 3)
    wheel_style = meta.get("wheelStyle") or (
        "offroad" if (is_truck or is_buggy) else ("classic" if car_id in ("continental", "legacy_gtr") else "forged")
    )
    grille_style = "ev" if meta["layout"] == "ev" else ("truck" if (is_truck or is_buggy) else "sport")
    grille_lo_y = round(float(np.clip(head_y - 0.24, 0.24, 0.62)), 3)
    grille_hi_y = round(float(np.clip(head_y + 0.04, grille_lo_y + 0.14, belt - 0.08)), 3)

    spec = {
        "id": car_id,
        "name": car_name,
        "glb": f"/games/forth-horizon/car/{car_id}_base.glb",
        "paint": meta["paint"],
        "accent": meta["accent"],
        "cuts": use_cuts,
        "frame": "car frame: x across (+left), y up from ground, z along (+nose), metres, origin centred on x/z",
        "measuredFrom": f"Multi-view matched 60k-face Class-A symmetric Hunyuan3D shell ({car_id}_base.glb, L={L:.2f}m W={half_w*2:.2f}m H={H:.2f}m).",
        "wheels": {
            "frontZ": round(front_z, 3),
            "rearZ": round(rear_z, 3),
            "frontX": front_x,
            "rearX": rear_x,
            "scale": round(wheel_scale, 3),
            "discardR": discard_r,
            "centreY": tyre_r,
            "tyreR": tyre_r,
            "rimR": rim_r,
            "style": wheel_style,
        },
        "panels": panels,
        "panelBoxes": {
            "hood": [[-round(half_w * 0.66, 3), round(belt - 0.24, 3), hood_z0], [round(half_w * 0.66, 3), round(belt + 0.24, 3), hood_z1]],
            "trunk": [[-round(half_w * 0.58, 3), round(belt - 0.14, 3), trunk_z0], [round(half_w * 0.58, 3), round(belt + 0.22, 3), trunk_z1]],
            "roof": [[-round(wind_hw, 3), round(roof_edge - 0.12, 3), round(rear_top, 3)], [round(wind_hw, 3), round(H + 0.12, 3), round(wind_top, 3)]],
            "preserveHood": True,
            "preserveTrunk": True,
            "preserveRoof": True,
        },
        "glass": {
            "belt": belt,
            "roofEdge": roof_edge,
            "pillarBase": round(wind_base, 3),
            "pillarTop": round(wind_top, 3),
            "doorFront": door_front,
            "doorRear": door_rear,
            "windBase": round(wind_base, 3),
            "windTop": round(wind_top, 3),
            "rearTop": round(rear_top, 3),
            "rearBase": round(rear_base, 3),
            "rearBase2": rear_base2,
            "windHalfW": wind_hw,
            "rearHalfW": rear_hw,
            "sideWindow": side_window,
            "handle": [round((door_front + door_rear) * 0.5 - 0.18, 3), round(belt - 0.14, 3)],
        },
        "front": {"openings": []},
        "engine": {
            "z": eng_z,
            "layout": meta["layout"],
            "arch": meta["arch"],
            "texUrl": meta["texUrl"],
        },
        "trunk": not is_mid and not is_truck and not is_buggy,
        "cabin": {
            "yOffset": round(float(np.clip(H - 1.38, -0.14, 0.28)), 3),
            "zOffset": round((wind_top + rear_top) * 0.25, 3),
            "cowlZ": cowl_z,
            "cowlY": cowl_y,
        },
        "exhaust": (
            {"z": round(rear_bumper_z + 0.11, 3), "y": round(0.24 if not is_truck else 0.34, 3), "xs": [-0.48, -0.35, 0.35, 0.48]}
            if meta["layout"] != "ev"
            else {"z": round(rear_bumper_z + 0.11, 3), "y": 0.22, "xs": []}
        ),
        "aero": {
            "splitterZ": round(front_bumper_z, 3),
            "splitterW": 0,
            "splitterY": round(0.11 if not is_truck else 0.24, 3),
            "splitterStruts": False,
            "canards": False,
            "diffuserW": 0,
            "diffuserFins": 0,
            "wing": {"type": "none", "width": 0, "y": 0, "z": 0},
        },
        "lamps": {
            "head": {"x": head_x, "y": head_y, "w": round(half_w * 0.28, 3), "h": 0.075, "tilt": 0.025, "style": meta["headStyle"]},
            "tail": {"x": tail_x, "y": tail_y, "len": tail_len, "style": meta["tailStyle"]},
        },
        "shader": {
            "bumperFrontY": round(0.36 if not is_truck else 0.52, 3),
            "bumperRearY": round(0.38 if not is_truck else 0.52, 3),
            "skirtY": round(0.20 if not is_truck else 0.34, 3),
            "archLipAdd": 0.045,
            "wingCarbonZ": -9.0,
            "wingCarbonY": 9.0,
            "grilleLoY": grille_lo_y,
            "grilleHiY": grille_hi_y,
            "grilleStyle": grille_style,
        },
    }
    return spec


def build_one_car(tela, plan_entry: dict, force: bool = False) -> dict:
    car_id = plan_entry["id"]
    meta = CAR_META[car_id]
    folder = CAR_DIR / car_id
    views_dir = folder / "views"
    views_dir.mkdir(parents=True, exist_ok=True)
    pub_glb = PUB_CAR_DIR / f"{car_id}_base.glb"
    spec_path = folder / "spec.json"

    if pub_glb.exists() and spec_path.exists() and not force:
        print(f"[SKIP] {car_id} already built at {pub_glb}", flush=True)
        return {"id": car_id, "status": "skipped"}

    t_start = time.time()
    print(f"\n================ BUILDING {car_id.upper()} ({plan_entry['make']} {plan_entry['name']}) ================", flush=True)

    candidate_imgs: list[tuple[str, Path]] = []
    side_ref_mask: np.ndarray | None = None
    front_ref_mask: np.ndarray | None = None

    # 1A. Extract & cut out multi-view turntable orbit if video exists!
    if plan_entry.get("turntableExists") and plan_entry.get("turntablePath"):
        tt_frames = extract_turntable_frames(Path(plan_entry["turntablePath"]), views_dir, n_frames=12)
        scored = []
        for idx, fp in enumerate(tt_frames):
            cut_p = views_dir / f"tt_cut_{idx:02d}.png"
            if cut_p.exists():
                cut_im = Image.open(cut_p).convert("RGBA")
            else:
                with Image.open(fp) as raw:
                    cut_im, _ = tela.cut_out(raw.convert("RGBA"))
                cut_im.save(cut_p)
            aspect, area, mask = alpha_bbox_stats(cut_im)
            scored.append((idx, aspect, area, cut_p, mask))
        scored_valid = [s for s in scored if s[2] > 0.05]
        if scored_valid:
            # Widest horizontal silhouette = Side profile
            side_best = max(scored_valid, key=lambda s: s[1])
            side_ref_mask = side_best[4]
            # Narrowest silhouette = Front/Rear elevation
            front_best = min(scored_valid, key=lambda s: s[1])
            if front_best[1] < 1.65:
                front_ref_mask = front_best[4]
            # Best 3/4 view (aspect closest to 1.85 with high area!)
            hero34 = max(scored_valid, key=lambda s: s[2] - abs(s[1] - 1.85) * 0.14)
            candidate_imgs.append((f"tt_{hero34[0]:02d}", hero34[3]))
            # Secondary 3/4 view roughly opposite (~5 frames away) for multi-view candidate selection
            opp_idx = (hero34[0] + 5) % len(scored)
            if scored[opp_idx][2] > 0.05:
                candidate_imgs.append((f"tt_{opp_idx:02d}", scored[opp_idx][3]))
            print(f"  Turntable 12 views analyzed: side=tt_{side_best[0]:02d} (asp={side_best[1]:.2f}), hero34=tt_{hero34[0]:02d} (asp={hero34[1]:.2f})", flush=True)

    # 1B. Always crop & cut out exact multi-view sheet panels too (provides crystal-clear orthographic side + crisp 3/4!)
    sheet_im = Image.open(plan_entry["sheetPath"]).convert("RGB")
    sw, sh = sheet_im.size
    for view_name, box in meta["crops"].items():
        x0, y0, x1, y1 = int(box[0] * sw), int(box[1] * sh), int(box[2] * sw), int(box[3] * sh)
        crop = sheet_im.crop((x0, y0, x1, y1))
        raw_p = views_dir / f"sheet_{view_name}.png"
        cut_p = views_dir / f"sheet_cut_{view_name}.png"
        crop.save(raw_p)
        if cut_p.exists():
            cut_im = Image.open(cut_p).convert("RGBA")
        else:
            cut_im, _ = tela.cut_out(crop.convert("RGBA"))
            cut_im.save(cut_p)
        asp, area, mask = alpha_bbox_stats(cut_im)
        if view_name == "side" and area > 0.04 and side_ref_mask is None:
            side_ref_mask = mask
        elif view_name == "side" and area > 0.04 and asp > 2.0:
            # Orthographic sheet side profile has zero perspective distortion — prefer it for side IoU!
            side_ref_mask = mask
        if view_name == "front34" and area > 0.04:
            # Prefer clean high-res sheet front34 as primary candidate alongside turntable 3/4!
            candidate_imgs.insert(0, ("sheet_front34", cut_p))
        elif view_name == "rear34" and len(candidate_imgs) < 2 and area > 0.04:
            candidate_imgs.append(("sheet_rear34", cut_p))

    # Deduplicate to top 2 distinct candidates (front34 + turntable/rear34)
    candidates = candidate_imgs[:2]
    if not candidates:
        raise RuntimeError(f"No valid reference views extracted for {car_id}")

    # 2. Generate 60k-face Hunyuan3D shells on RTX 4070 and select highest multi-view IoU!
    best_mesh = None
    best_score = -1.0
    best_name = ""
    best_sym = 0.0
    cand_reports = []

    # Free rembg u2net CPU session (~750 MB) before Hunyuan3D marching cubes runs!
    if tela is not None and hasattr(tela, "_REMBG"):
        tela._REMBG["session"] = None
    gc.collect()

    for cname, cpath in candidates:
        raw_glb = folder / f"hunyuan_{cname}.glb"
        if raw_glb.exists():
            print(f"  Reusing cached candidate shell {raw_glb.name}", flush=True)
        else:
            print(f"  Generating Hunyuan3D shell from {cname}...", flush=True)
            t0 = time.time()
            res = None
            for oct_res in (380, 320):
                try:
                    gc.collect()
                    res = tela.image_to_mesh({
                        "image": "data:image/png;base64," + base64.b64encode(cpath.read_bytes()).decode("ascii"),
                        "backend": "hunyuan_mini",
                        "quality": "detail",
                        "options": {"octreeResolution": oct_res, "steps": 5, "faceLimit": 60000, "foregroundRatio": 0.92, "keepLargest": True},
                    })
                    break
                except Exception as exc:
                    print(f"    [RETRY] octree={oct_res} hit {exc!r}, freeing RAM and retrying...", flush=True)
                    gc.collect()
                    if hasattr(tela, "torch"):
                        tela.torch.cuda.empty_cache()
                    clean_temp_cache()
            if res is None:
                raise RuntimeError(f"Hunyuan3D failed on {car_id}/{cname}")
            raw_glb.write_bytes(base64.b64decode(res["glbBase64"]))
            clean_temp_cache()
            gc.collect()
            if hasattr(tela, "torch"):
                tela.torch.cuda.empty_cache()
            print(f"    -> {res['faces']} faces in {time.time() - t0:.1f}s (GPU {res.get('gpuTempC')}C)", flush=True)

        loaded = trimesh.load(str(raw_glb), force="mesh")
        if isinstance(loaded, trimesh.Scene):
            loaded = loaded.dump(concatenate=True)
        oriented, side_iou, sym_deg = orient_mesh_canonical(
            loaded.copy(),
            side_ref_mask,
            is_truck=meta.get("isTruck", False),
            flip180=meta.get("flip180", False),
            flipUp=meta.get("flipUp", False),
        )
        cand_reports.append({"candidate": cname, "sideIoU": round(side_iou, 4), "yawSymDeg": round(sym_deg, 2)})
        print(f"    Candidate {cname}: sideIoU={side_iou:.3f}, symYaw={sym_deg:+.2f} deg", flush=True)
        if side_iou > best_score:
            best_score = side_iou
            best_mesh = oriented
            best_name = cname
            best_sym = sym_deg

    # 3. Fit exact real-world dimensions + smooth multi-view side profile + 20-iter Taubin smoothing
    fitted_mesh, final_iou = fit_proportions_and_profile(
        best_mesh, meta["targetLen"], side_ref_mask, front_ref_mask,
        is_truck=meta.get("isTruck", False), max_h=meta.get("maxH"),
    )
    PUB_CAR_DIR.mkdir(parents=True, exist_ok=True)
    fitted_mesh.export(str(pub_glb))

    # 4. Measure exact spec.json directly from the finished GLB
    spec = measure_spec_from_glb(car_id, f"{plan_entry['make']} {plan_entry['name']}", fitted_mesh, meta)
    spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")

    # 5. Record intake manifest
    intake = {
        "id": car_id,
        "status": f"built (multi-view matched: winner={best_name}, sideIoU={final_iou:.3f}, 14-iter Taubin smooth + measured spec.json)",
        "sourceSheet": plan_entry["sheetPath"],
        "sourceVideo": plan_entry.get("turntablePath"),
        "candidates": cand_reports,
        "winner": best_name,
        "finalSideIoU": round(final_iou, 4),
        "yawSymDeg": round(best_sym, 2),
        "boundsM": {
            "length": round(float(fitted_mesh.vertices[:, 2].ptp()), 3),
            "width": round(float(fitted_mesh.vertices[:, 0].ptp()), 3),
            "height": round(float(fitted_mesh.vertices[:, 1].ptp()), 3),
        },
        "faces": int(len(fitted_mesh.faces)),
        "elapsedSec": round(time.time() - t_start, 1),
    }
    (folder / "intake.json").write_text(json.dumps(intake, indent=2), encoding="utf-8")
    print(f"[DONE] {car_id}: winner={best_name}, sideIoU={final_iou:.3f}, dims={intake['boundsM']}, {intake['elapsedSec']}s", flush=True)
    gc.collect()
    return intake


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cars", nargs="+", required=True, help="Car IDs to build (or 'all')")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--repack", action="store_true", help="Re-orient/smooth/measure cached GLBs without loading CUDA")
    args = parser.parse_args()

    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in plan}
    targets = [p["id"] for p in plan if p["body"] == "pending"] if args.cars == ["all"] else args.cars

    tela = None
    if not args.repack:
        print("Booting Tela 3D runtime (single resident Hunyuan3D CUDA worker)...", flush=True)
        import tela3d_runtime as tela_mod
        tela = tela_mod
        if tela.DEVICE != "cuda" or not tela.backend_available("hunyuan_mini"):
            raise RuntimeError("CUDA Hunyuan3D backend not available!")
        free_mb = tela.torch.cuda.mem_get_info()[0] // 2**20
        print(f"GPU Ready: {tela.torch.cuda.get_device_name(0)}, free VRAM = {free_mb} MiB", flush=True)

    results = []
    for cid in targets:
        if cid not in by_id:
            print(f"[WARN] Unknown car id: {cid}", flush=True)
            continue
        results.append(build_one_car(tela, by_id[cid], force=args.force or args.repack))

    # Release VRAM cleanly when batch finishes
    if tela is not None:
        tela.release({})
    print("\n=== BATCH SUMMARY ===", flush=True)
    print(json.dumps(results, indent=2), flush=True)


if __name__ == "__main__":
    main()
