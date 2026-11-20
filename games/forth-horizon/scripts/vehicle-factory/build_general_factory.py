"""
Multi-View 3D General Vehicle Asset Library Factory (Phase 2: 58 Everyday & Commercial Vehicles).

Imports the proven Class-A geometry fairing, bilateral symmetry, Taubin smoothing, and GPU runner
from build_race_factory.py, and tailors orientation, proportions, wheels, grilles, glass, lamps,
exhausts, and traffic flags for everyday cars, SUVs, pickups, vans, taxis, police cruisers,
box trucks, tow trucks, transit buses, and Class 8 semis.
"""
import argparse
import base64
import gc
import json
import math
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:128")
sys.dont_write_bytecode = True

SCRATCH = Path(r"C:\Users\Kenne\.gemini\antigravity\brain\42e3bfd8-faf9-4bbd-85bf-ae0b60e1bbba\scratch")
sys.path.insert(0, str(SCRATCH))

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d
import trimesh

from build_race_factory import (
    CAR_DIR,
    PUB_CAR_DIR,
    alpha_bbox_stats,
    clean_temp_cache,
    extract_turntable_frames,
    orient_mesh_canonical,
    rasterize_mesh_silhouette,
    silhouette_iou,
    symmetrize_mesh_bilateral,
    taubin_smooth,
)

GENERAL_PLAN_PATH = SCRATCH / "general_vehicles_plan.json"
FLIP180_IDS: set[str] = set()

# Exact hand-verified sheet crop boxes [x0, y0, x1, y1] for the 17 sheet-only vehicles
# (and optional extra orthographic side fallback for turntable vehicles)
SHEET_ONLY_CROPS: dict[str, dict[str, list[float]]] = {
    "kestrel_defender": {"front34": [0.72, 0.44, 0.99, 0.86], "side": [0.25, 0.14, 0.72, 0.46], "front": [0.02, 0.14, 0.25, 0.46]},
    "terrahual_4500": {"side": [0.22, 0.16, 0.58, 0.44], "front": [0.04, 0.16, 0.22, 0.44]},
    "kronos_v420": {"side": [0.24, 0.16, 0.74, 0.44], "front": [0.03, 0.16, 0.24, 0.44]},
    "vectis_urban12": {"front34": [0.64, 0.58, 0.98, 0.94], "side": [0.32, 0.18, 0.82, 0.44]},
    "zephyr_spark_ev": {"side": [0.22, 0.22, 0.56, 0.48], "front": [0.03, 0.22, 0.22, 0.48]},
    "zephyr_majestic_ev": {"side": [0.24, 0.18, 0.70, 0.46], "front": [0.03, 0.18, 0.24, 0.46]},
    "vanguard_tow": {"side": [0.03, 0.34, 0.52, 0.60], "front": [0.55, 0.22, 0.76, 0.59]},
    "nexis_aeroh": {"side": [0.22, 0.20, 0.74, 0.48], "front": [0.03, 0.20, 0.22, 0.48]},
    "nexis_voyager": {"side": [0.22, 0.22, 0.56, 0.50], "front": [0.03, 0.22, 0.22, 0.50]},
    "municipal_pickup": {"side": [0.22, 0.22, 0.56, 0.48], "front": [0.03, 0.22, 0.22, 0.48]},
    "vernon_police": {"side": [0.03, 0.60, 0.42, 0.88], "front": [0.44, 0.28, 0.64, 0.57]},
    "valkyrie_semi": {"side": [0.22, 0.22, 0.56, 0.48], "front": [0.03, 0.22, 0.22, 0.48]},
    "aurelia_summit": {"front34": [0.64, 0.18, 0.96, 0.48], "side": [0.24, 0.18, 0.64, 0.48]},
    "ironport_metro_suv": {"front34": [0.42, 0.22, 0.72, 0.50], "side": [0.02, 0.54, 0.36, 0.72]},
    "aurelia_monarch": {"side": [0.24, 0.20, 0.76, 0.48], "front": [0.04, 0.20, 0.24, 0.48]},
    "vanguard_pinnacle": {"side": [0.24, 0.20, 0.76, 0.48], "front": [0.04, 0.20, 0.24, 0.48]},
    "vectra_shuttle": {"front34": [0.52, 0.18, 0.98, 0.54], "side": [0.18, 0.18, 0.52, 0.38]},
    "titan_colossus": {"front34": [0.68, 0.56, 0.99, 0.88], "side": [0.02, 0.24, 0.44, 0.50]},
    "vectra_ecargo": {"front34": [0.66, 0.14, 0.98, 0.44], "side": [0.22, 0.44, 0.62, 0.72]},
}
KEEP_NATIVE_UP_IDS = {"titan_colossus", "vectra_ecargo", "terrahual_4500", "vanguard_tow", "valkyrie_semi"}

ARCH_TEX_URL = {
    "commuter-i4": "/games/forth-horizon/tex/engines/i4_commuter.jpg",
    "i4-turbo": "/games/forth-horizon/tex/engines/sports_sedan_20t.jpg",
    "hybrid": "/games/forth-horizon/tex/engines/hybrid_i4.jpg",
    "v6-sedan": "/games/forth-horizon/tex/engines/v6_sedan.jpg",
    "suv-v6": "/games/forth-horizon/tex/engines/v6_suv_sport.jpg",
    "pickup-v8": "/games/forth-horizon/tex/engines/pickup_v8.jpg",
    "diesel-v8": "/games/forth-horizon/tex/engines/diesel_pickup.jpg",
    "ev": "/games/forth-horizon/tex/engines/hybrid_i4.jpg",
}


def width_bounds_for(archetype: str) -> tuple[float, float]:
    if archetype == "compact":
        return (1.68, 1.84)
    if archetype in ("sedan", "gt"):
        return (1.82, 1.94)
    if archetype == "suv":
        return (1.88, 2.08)
    if archetype == "truck":
        return (1.94, 2.14)
    if archetype == "van":
        return (1.94, 2.14)
    if archetype == "commercial":
        return (2.22, 2.52)
    return (1.82, 2.04)


def height_bounds_for(archetype: str, cid: str = "") -> tuple[float, float]:
    if archetype == "gt":
        return (1.28, 1.38)
    if archetype == "sedan":
        return (1.42, 1.52)
    if archetype == "compact":
        return (1.44, 1.56)
    if archetype == "suv":
        return (1.66, 1.90)
    if archetype == "truck":
        return (1.80, 1.98)
    if archetype == "van":
        return (1.70, 1.82) if cid == "nexis_voyager" else (2.18, 2.48)
    if archetype == "commercial":
        return (2.45, 3.35)
    return (1.42, 1.85)


def wheel_style_for(entry: dict) -> str:
    a = entry["archetype"]
    cid = entry["id"]
    if a == "commercial" or cid in ("metropost_truck", "vectra_ecargo", "vectra_workhorse"):
        return "heavy"
    if a == "truck" or cid in ("kestrel_defender", "titan_nomad", "titan_pathfinder", "titan_colossus", "ironport_vintage_suv"):
        return "offroad"
    if a == "gt":
        return "forged"
    return "street"


def fit_general_proportions(
    mesh: trimesh.Trimesh,
    target_len: float,
    archetype: str,
    side_ref_mask: np.ndarray | None,
    front_ref_mask: np.ndarray | None,
    cid: str = "",
) -> tuple[trimesh.Trimesh, float]:
    v = mesh.vertices.astype(np.float64).copy()
    cur_w = max(1e-5, v[:, 0].ptp())
    cur_h = max(1e-5, v[:, 1].ptp())
    cur_l = max(1e-5, v[:, 2].ptp())

    scale_z = target_len / cur_l
    target_h = cur_h * scale_z
    target_w = cur_w * scale_z

    if side_ref_mask is not None:
        ref_aspect_lh = side_ref_mask.shape[1] / max(1.0, side_ref_mask.shape[0])
        ref_h = target_len / np.clip(ref_aspect_lh, 1.5, 4.2)
        target_h = 0.65 * ref_h + 0.35 * target_h
    if front_ref_mask is not None:
        ref_aspect_wh = front_ref_mask.shape[1] / max(1.0, front_ref_mask.shape[0])
        ref_w = target_h * np.clip(ref_aspect_wh, 0.72, 1.85)
        target_w = 0.50 * ref_w + 0.50 * target_w

    w_min, w_max = width_bounds_for(archetype)
    h_min, h_max = height_bounds_for(archetype, cid)
    target_w = float(np.clip(target_w, w_min, w_max))
    target_h = float(np.clip(target_h, h_min, h_max))

    v[:, 0] = (v[:, 0] - (v[:, 0].min() + v[:, 0].max()) * 0.5) * (target_w / cur_w)
    v[:, 1] = (v[:, 1] - v[:, 1].min()) * (target_h / cur_h)
    v[:, 2] = (v[:, 2] - (v[:, 2].min() + v[:, 2].max()) * 0.5) * (target_len / cur_l)

    final_side_iou = 0.0
    if side_ref_mask is not None:
        m_pos = rasterize_mesh_silhouette(v, (2, 1))
        ref_use = side_ref_mask if silhouette_iou(m_pos, side_ref_mask) >= silhouette_iou(m_pos, np.fliplr(side_ref_mask)) else np.fliplr(side_ref_mask)
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

        ratio = np.ones(stations)
        valid = (ref_top > 0.25) & (mesh_top > 0.25)
        ratio[valid] = np.clip(ref_top[valid] / mesh_top[valid], 0.92, 1.08)
        ratio = gaussian_filter1d(ratio, sigma=2.2)

        u_idx = np.clip(((v[:, 2] - z0) / max(1e-5, z1 - z0)) * (stations - 1), 0, stations - 1)
        s_vert = np.interp(u_idx, np.arange(stations), ratio)
        w_up = np.clip((v[:, 1] / target_h - 0.34) / 0.34, 0.0, 1.0)
        v[:, 1] *= 1.0 + (s_vert - 1.0) * w_up

        m_after = rasterize_mesh_silhouette(v, (2, 1))
        final_side_iou = silhouette_iou(m_after, ref_use)

    mesh.vertices = v.astype(np.float32)
    mesh = symmetrize_mesh_bilateral(mesh, strength=0.62)
    mesh = taubin_smooth(mesh, iters=22, lam=0.50, mu=-0.525)

    v = mesh.vertices.astype(np.float64)
    v[:, 0] -= (v[:, 0].min() + v[:, 0].max()) * 0.5
    v[:, 1] -= v[:, 1].min()
    v[:, 2] -= (v[:, 2].min() + v[:, 2].max()) * 0.5
    mesh.vertices = v.astype(np.float32)
    return mesh, final_side_iou


def measure_general_spec(entry: dict, mesh: trimesh.Trimesh) -> dict:
    cid = entry["id"]
    cname = f"{entry['make']} {entry['name']}"
    archetype = entry["archetype"]
    is_ev = entry["powertrain"] == "ev"
    is_comm = archetype == "commercial"
    is_van = archetype == "van"
    is_truck = archetype in ("truck", "suv")
    is_boxy = is_comm or is_van

    v = mesh.vertices.astype(np.float64)
    half_w = float(max(abs(v[:, 0].min()), abs(v[:, 0].max())))
    H = float(v[:, 1].max())
    z_min, z_max = float(v[:, 2].min()), float(v[:, 2].max())
    L = z_max - z_min

    low_outer = v[(v[:, 1] < 0.15 * H) & (np.abs(v[:, 0]) > 0.45 * half_w)]
    front_pts = low_outer[low_outer[:, 2] > 0.12 * L]
    rear_pts = low_outer[low_outer[:, 2] < -0.12 * L]
    front_z = float(np.median(front_pts[:, 2])) if len(front_pts) > 20 else 0.305 * L
    rear_z = float(np.median(rear_pts[:, 2])) if len(rear_pts) > 20 else -0.305 * L
    front_z = float(np.clip(front_z, 0.24 * L, 0.38 * L))
    rear_z = float(np.clip(rear_z, -0.38 * L, -0.22 * L))

    f_band = v[(np.abs(v[:, 2] - front_z) < 0.35) & (v[:, 1] > 0.10 * H) & (v[:, 1] < 0.48 * H)]
    r_band = v[(np.abs(v[:, 2] - rear_z) < 0.35) & (v[:, 1] > 0.10 * H) & (v[:, 1] < 0.48 * H)]
    f_outer_x = float(np.percentile(np.abs(f_band[:, 0]), 95)) if len(f_band) > 30 else half_w * 0.94
    r_outer_x = float(np.percentile(np.abs(r_band[:, 0]), 95)) if len(r_band) > 30 else half_w * 0.95

    if is_comm:
        wheel_scale = float(np.clip(H / 2.25, 1.18, 1.38))
    elif is_truck or is_van:
        wheel_scale = float(np.clip(H / 1.68, 1.02, 1.22))
    elif archetype == "compact":
        wheel_scale = float(np.clip(H / 1.56, 0.88, 0.96))
    else:
        wheel_scale = float(np.clip(H / 1.48, 0.94, 1.04))

    tyre_r = round(0.355 * wheel_scale, 3)
    rim_r = round(0.228 * wheel_scale, 3)
    discard_r = round(tyre_r * 1.04, 3)
    front_x = round(max(0.64, f_outer_x - 0.145 * wheel_scale), 3)
    rear_x = round(max(0.64, r_outer_x - 0.155 * wheel_scale), 3)

    zs = np.linspace(z_min + 0.06, z_max - 0.06, 60)
    y_prof = np.zeros(60)
    for i, zc in enumerate(zs):
        sl = v[(np.abs(v[:, 2] - zc) < L / 45.0) & (np.abs(v[:, 0]) < 0.42 * half_w)]
        y_prof[i] = float(np.percentile(sl[:, 1], 97)) if len(sl) > 5 else 0.0
    y_prof = gaussian_filter1d(y_prof, sigma=1.2)

    roof_y = float(y_prof.max())
    f_hood_idx = int(np.argmin(np.abs(zs - front_z)))
    hood_h = float(y_prof[f_hood_idx])
    if is_comm:
        belt = round(float(np.clip(roof_y * 0.56, 1.18, roof_y - 0.55)), 3)
    elif is_van:
        belt = round(float(np.clip(roof_y * 0.58, 1.02, roof_y - 0.45)), 3)
    elif is_truck:
        belt = round(float(np.clip(max(hood_h + 0.05, roof_y * 0.62), 0.96, roof_y - 0.36)), 3)
    else:
        belt = round(float(np.clip(max(hood_h + 0.06, roof_y * 0.64), 0.82, roof_y - 0.30)), 3)
    roof_edge = round(roof_y - 0.05, 3)

    above_belt = np.nonzero(y_prof > belt + 0.05)[0]
    on_roof = np.nonzero(y_prof > roof_y - 0.12)[0]
    if len(above_belt) >= 4 and len(on_roof) >= 2:
        rear_base = float(zs[above_belt[0]])
        wind_base = float(zs[above_belt[-1]])
        rear_top = float(zs[on_roof[0]])
        wind_top = float(zs[on_roof[-1]])
    else:
        wind_base, wind_top = 0.24 * L, 0.08 * L
        rear_top, rear_base = -0.26 * L, -0.40 * L

    wind_base = float(np.clip(wind_base, 0.12 * L, 0.46 * L))
    wind_top = float(np.clip(wind_top, -0.04 * L, wind_base - 0.28))
    rear_top = float(np.clip(rear_top, -0.44 * L, wind_top - 0.28))
    rear_base = float(np.clip(rear_base, -0.48 * L, rear_top - 0.12))
    rear_base2 = round(rear_base + 0.02, 3)

    mid_glass_y = (belt + roof_edge) * 0.5
    wind_sl = v[(np.abs(v[:, 2] - (wind_base + wind_top) * 0.5) < 0.28) & (np.abs(v[:, 1] - mid_glass_y) < 0.15)]
    rear_sl = v[(np.abs(v[:, 2] - (rear_base + rear_top) * 0.5) < 0.28) & (np.abs(v[:, 1] - mid_glass_y) < 0.15)]
    wind_hw = round(float(np.clip(np.percentile(np.abs(wind_sl[:, 0]), 88) - 0.07 if len(wind_sl) > 15 else half_w * 0.72, 0.50, half_w * 0.84)), 3)
    rear_hw = round(float(np.clip(np.percentile(np.abs(rear_sl[:, 0]), 88) - 0.07 if len(rear_sl) > 15 else half_w * 0.68, 0.46, half_w * 0.82)), 3)

    door_front = round(min(front_z - tyre_r - 0.04, wind_base + 0.04), 3)
    door_rear = round(max(rear_z + tyre_r + 0.04, door_front - 1.35), 3)
    if door_front - door_rear < 0.75:
        door_front = round(wind_base + 0.02, 3)
        door_rear = round(door_front - 1.10, 3)

    side_window = [
        [round(rear_top - 0.04, 3), round(belt + 0.03, 3)],
        [round(door_front - 0.04, 3), round(belt + 0.02, 3)],
        [round(door_front - 0.08, 3), round(belt + (roof_edge - belt) * 0.42, 3)],
        [round((door_front + wind_top) * 0.5, 3), round(belt + (roof_edge - belt) * 0.78, 3)],
        [round(wind_top, 3), round(roof_edge - 0.03, 3)],
        [round(rear_top + 0.04, 3), round(roof_edge - 0.03, 3)],
        [round(rear_top - 0.08, 3), round(belt + (roof_edge - belt) * 0.68, 3)],
        [round(rear_top - 0.10, 3), round(belt + 0.05, 3)],
    ]

    # Commercial buses/box trucks/semis/cargo vans use clean shader glass (`cuts: false`) so tall metal cargo flanks stay crisp
    use_cuts = not (is_comm or (is_van and cid != "nexis_voyager"))
    panels = {}
    if use_cuts:
        panels["doorL"] = {"hinge": [round(half_w * 0.90, 3), 0.0, door_front], "axis": [0, 1, 0], "open": -1.0}
        panels["doorR"] = {"hinge": [round(-half_w * 0.90, 3), 0.0, door_front], "axis": [0, 1, 0], "open": 1.0}
        if not is_van:
            panels["hood"] = {"hinge": [0.0, round(belt, 3), round(wind_base + 0.02, 3)], "axis": [1, 0, 0], "open": -0.92}
        if archetype in ("sedan", "gt"):
            panels["trunk"] = {"hinge": [0.0, round(belt + 0.02, 3), round(rear_base, 3)], "axis": [1, 0, 0], "open": 0.85}

    hood_z0 = round(wind_base + 0.04, 3)
    hood_z1 = round(z_max - 0.16, 3)
    trunk_z0 = round(z_min + 0.12, 3)
    trunk_z1 = round(rear_base - 0.02, 3)

    low_rear = v[(v[:, 2] < -0.25 * L) & (v[:, 1] > 0.12 * H) & (v[:, 1] < 0.42 * H) & (np.abs(v[:, 0]) < 0.48 * half_w)]
    rear_bumper_z = float(np.percentile(low_rear[:, 2], 4)) if len(low_rear) > 20 else z_min + 0.08
    low_front = v[(v[:, 2] > 0.25 * L) & (v[:, 1] > 0.12 * H) & (v[:, 1] < 0.46 * H) & (np.abs(v[:, 0]) < 0.48 * half_w)]
    front_bumper_z = float(np.percentile(low_front[:, 2], 96)) if len(low_front) > 20 else z_max - 0.06

    cowl_idx = int(np.argmin(np.abs(zs - wind_base)))
    cowl_y = round(float(np.clip(y_prof[cowl_idx] - 0.03, belt - 0.14, belt + 0.02)), 3)
    cowl_z = round(wind_base - 0.05, 3)

    nose_sl = v[(v[:, 2] > front_bumper_z - 0.35) & (v[:, 1] < belt * 0.96)]
    tail_sl = v[(v[:, 2] < rear_bumper_z + 0.35) & (v[:, 1] < belt * 0.94) & (np.abs(v[:, 0]) < 0.82 * half_w)]
    nose_max_y = float(np.percentile(nose_sl[:, 1], 90)) if len(nose_sl) > 20 else belt * 0.78
    tail_max_y = float(np.percentile(tail_sl[:, 1], 88)) if len(tail_sl) > 20 else belt * 0.84

    head_y = round(float(np.clip(nose_max_y * 0.74, 0.54, min(belt - 0.12, 1.18))), 3)
    tail_y = round(float(np.clip(tail_max_y * 0.78, 0.64, min(belt * 0.90, 1.24))), 3)
    head_x = round(half_w * 0.56, 3)
    tail_x = round(half_w * 0.58, 3)
    tail_len = round(half_w * 0.30, 3)

    # Realistic understated exhaust tips for everyday cars (none on EVs)
    if is_ev:
        ex_xs = []
    elif archetype in ("compact", "sedan", "van"):
        ex_xs = [-0.46]  # single realistic everyday tailpipe
    elif archetype == "commercial":
        ex_xs = [-0.62]
    else:
        ex_xs = [-0.46, 0.46]  # clean dual tips for SUVs/pickups/sport coupe

    grille_style = "ev" if is_ev else ("truck" if (is_truck or is_boxy) else "sport")
    grille_lo_y = round(float(np.clip(head_y - 0.24, 0.26, 0.76)), 3)
    grille_hi_y = round(float(np.clip(head_y + 0.05, grille_lo_y + 0.16, belt - 0.08)), 3)

    eng_z = round(min(front_z - 0.35, z_max - 1.25) if is_boxy else min(front_z - 0.08, z_max - 0.88), 3)
    w_style = wheel_style_for(entry)
    arch = entry.get("arch", "commuter-i4")

    return {
        "id": cid,
        "name": cname,
        "glb": f"/games/forth-horizon/car/{cid}_base.glb",
        "paint": entry["paint"],
        "accent": entry["accent"],
        "cuts": use_cuts,
        "traffic": True,
        "frame": "car frame: x across (+left), y up from ground, z along (+nose), metres, origin centred on x/z",
        "measuredFrom": f"Multi-view matched 60k-face Class-A symmetric Hunyuan3D shell ({cid}_base.glb, L={L:.2f}m W={half_w*2:.2f}m H={H:.2f}m).",
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
            "style": w_style,
        },
        "panels": panels,
        "panelBoxes": {
            "hood": [[-round(half_w * 0.68, 3), round(belt - 0.24, 3), hood_z0], [round(half_w * 0.68, 3), round(belt + 0.24, 3), hood_z1]],
            "trunk": [[-round(half_w * 0.60, 3), round(belt - 0.16, 3), trunk_z0], [round(half_w * 0.60, 3), round(belt + 0.22, 3), trunk_z1]],
            "roof": [[-round(wind_hw, 3), round(roof_edge - 0.14, 3), round(rear_top, 3)], [round(wind_hw, 3), round(H + 0.14, 3), round(wind_top, 3)]],
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
            "handle": [round((door_front + door_rear) * 0.5 - 0.16, 3), round(belt - 0.14, 3)],
        },
        "front": {"openings": []},
        "engine": {
            "z": eng_z,
            "layout": "ev" if is_ev else "front-v8",
            "arch": arch,
            "texUrl": ARCH_TEX_URL.get(arch, "/games/forth-horizon/tex/engines/i4_commuter.jpg"),
        },
        "trunk": archetype in ("sedan", "gt"),
        "cabin": {
            "yOffset": round(float(np.clip(H - 1.42, -0.08, 0.55)), 3),
            "zOffset": round((wind_top + rear_top) * 0.22, 3),
            "cowlZ": cowl_z,
            "cowlY": cowl_y,
        },
        "exhaust": {
            "z": round(rear_bumper_z + 0.11, 3),
            "y": round(0.26 if not (is_truck or is_boxy) else 0.36, 3),
            "xs": ex_xs,
        },
        "aero": {
            "splitterZ": round(front_bumper_z, 3),
            "splitterW": 0,
            "splitterY": 0.20,
            "splitterStruts": False,
            "canards": False,
            "diffuserW": 0,
            "diffuserFins": 0,
            "wing": {"type": "none", "width": 0, "y": 0, "z": 0},
        },
        "lamps": {
            "head": {"x": head_x, "y": head_y, "w": round(half_w * 0.26, 3), "h": 0.082, "tilt": 0.015, "style": "swept"},
            "tail": {"x": tail_x, "y": tail_y, "len": tail_len, "style": "twin-bar"},
        },
        "shader": {
            "bumperFrontY": round(0.32 if not (is_truck or is_boxy) else 0.46, 3),
            "bumperRearY": round(0.34 if not (is_truck or is_boxy) else 0.46, 3),
            "skirtY": round(0.20 if not (is_truck or is_boxy) else 0.32, 3),
            "archLipAdd": 0.042,
            "wingCarbonZ": -9.0,
            "wingCarbonY": 9.0,
            "grilleLoY": grille_lo_y,
            "grilleHiY": grille_hi_y,
            "grilleStyle": grille_style,
        },
    }


def build_one_general(tela, entry: dict, force: bool = False, cleanup: bool = True) -> dict:
    cid = entry["id"]
    folder = CAR_DIR / cid
    views_dir = folder / "views"
    views_dir.mkdir(parents=True, exist_ok=True)
    pub_glb = PUB_CAR_DIR / f"{cid}_base.glb"
    spec_path = folder / "spec.json"

    if pub_glb.exists() and spec_path.exists() and not force:
        print(f"[SKIP] {cid} already built", flush=True)
        return {"id": cid, "status": "skipped"}

    t_start = time.time()
    print(f"\n================ BUILDING GENERAL: {cid.upper()} ({entry['make']} {entry['name']}) ================", flush=True)

    candidate_imgs: list[tuple[str, Path]] = []
    side_ref_mask: np.ndarray | None = None
    front_ref_mask: np.ndarray | None = None

    # 1A. Turntable 12-frame orbit (skip turntable for vehicles with explicit clean sheet beauty overrides)
    if entry.get("turntableExists") and entry.get("turntablePath") and cid not in KEEP_NATIVE_UP_IDS:
        tt_frames = extract_turntable_frames(Path(entry["turntablePath"]), views_dir, n_frames=12)
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
        scored_valid = [s for s in scored if s[2] > 0.04]
        if scored_valid:
            side_best = max(scored_valid, key=lambda s: s[1])
            side_ref_mask = side_best[4]
            front_best = min(scored_valid, key=lambda s: s[1])
            if front_best[1] < 1.65:
                front_ref_mask = front_best[4]
            # Pick crisp 3/4 beauty angle (aspect ~ 1.75..2.05 with strong frame fill)
            hero34 = max(scored_valid, key=lambda s: s[2] - abs(s[1] - 1.80) * 0.14)
            candidate_imgs.append((f"tt_{hero34[0]:02d}", hero34[3]))
            opp_idx = (hero34[0] + 5) % len(scored)
            if scored[opp_idx][2] > 0.04:
                candidate_imgs.append((f"tt_{opp_idx:02d}", scored[opp_idx][3]))
            print(f"  Turntable 12 views: side=tt_{side_best[0]:02d} (asp={side_best[1]:.2f}), hero34=tt_{hero34[0]:02d} (asp={hero34[1]:.2f})", flush=True)

    # 1B. Sheet-only exact crops (17/58 vehicles!)
    if cid in SHEET_ONLY_CROPS or not candidate_imgs:
        crops = SHEET_ONLY_CROPS.get(cid, {"side": [0.22, 0.18, 0.70, 0.48], "front": [0.03, 0.18, 0.24, 0.48]})
        sheet_im = Image.open(entry["sheetPath"]).convert("RGB")
        sw, sh = sheet_im.size
        for view_name, box in crops.items():
            x0, y0, x1, y1 = int(box[0] * sw), int(box[1] * sh), int(box[2] * sw), int(box[3] * sh)
            crop = sheet_im.crop((x0, y0, x1, y1))
            cut_p = views_dir / f"sheet_cut_{view_name}.png"
            if cut_p.exists():
                cut_im = Image.open(cut_p).convert("RGBA")
            else:
                cut_im, _ = tela.cut_out(crop.convert("RGBA"))
                cut_im.save(cut_p)
            asp, area, mask = alpha_bbox_stats(cut_im)
            if view_name == "side" and area > 0.03:
                side_ref_mask = mask
                if len(candidate_imgs) < 2:
                    candidate_imgs.append(("sheet_side", cut_p))
            elif view_name == "front" and area > 0.03:
                front_ref_mask = mask
                # Never generate 3D solely from flat orthographic front-on elevation (Hunyuan cannot see vehicle length);
                # use front elevation purely for authentic front_ref_mask width proportions!
            elif view_name == "front34" and area > 0.03:
                candidate_imgs.insert(0, ("sheet_front34", cut_p))

    candidates = candidate_imgs[:2]
    if not candidates:
        raise RuntimeError(f"No valid views extracted for {cid}")

    best_mesh = None
    best_score = -1.0
    best_name = ""
    best_sym = 0.0
    cand_reports = []
    is_truck_orient = entry["archetype"] == "truck" or cid in ("vanguard_tow", "valkyrie_semi")
    flip180_flag = cid in FLIP180_IDS

    # Free rembg u2net CPU session (~750 MB) before Hunyuan3D marching cubes runs!
    if tela is not None and hasattr(tela, "_REMBG"):
        tela._REMBG["session"] = None
    gc.collect()

    for cname, cpath in candidates:
        raw_glb = folder / f"hunyuan_{cname}.glb"
        if not raw_glb.exists():
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
                print(f"    [WARN] Skipping failed candidate {cid}/{cname}", flush=True)
                continue
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
            loaded.copy(), side_ref_mask, is_truck=is_truck_orient, flip180=flip180_flag,
            keep_native_up=(cid in KEEP_NATIVE_UP_IDS),
        )
        cand_reports.append({"candidate": cname, "sideIoU": round(side_iou, 4), "yawSymDeg": round(sym_deg, 2)})
        print(f"    Candidate {cname}: sideIoU={side_iou:.3f}, symYaw={sym_deg:+.2f} deg", flush=True)
        if side_iou > best_score:
            best_score = side_iou
            best_mesh = oriented
            best_name = cname
            best_sym = sym_deg

    fitted_mesh, final_iou = fit_general_proportions(best_mesh, entry["targetLen"], entry["archetype"], side_ref_mask, front_ref_mask, cid=cid)
    PUB_CAR_DIR.mkdir(parents=True, exist_ok=True)
    fitted_mesh.export(str(pub_glb))

    spec = measure_general_spec(entry, fitted_mesh)
    spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")

    intake = {
        "id": cid,
        "status": f"built (multi-view matched: winner={best_name}, sideIoU={final_iou:.3f}, Class-A symmetry + 22-iter Taubin + measured spec.json)",
        "sourceSheet": entry["sheetPath"],
        "sourceVideo": entry.get("turntablePath"),
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

    # Free raw views & intermediate hunyuan candidate GLBs immediately so C: stays rich in free space across all 58 vehicles!
    if cleanup:
        import shutil
        shutil.rmtree(views_dir, ignore_errors=True)
        for glbf in folder.glob("hunyuan_*.glb"):
            glbf.unlink(missing_ok=True)
        clean_temp_cache()

    print(f"[DONE] {cid}: winner={best_name}, sideIoU={final_iou:.3f}, dims={intake['boundsM']}, {intake['elapsedSec']}s", flush=True)
    gc.collect()
    return intake


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cars", nargs="+", required=True, help="General vehicle IDs or 'all'")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--keep-raw", action="store_true")
    parser.add_argument("--flip180", action="store_true", help="Flip finished GLB 180 deg around Y and re-measure spec.json")
    parser.add_argument("--flipup", action="store_true", help="Flip finished GLB 180 deg around Z (upside down) and re-measure spec.json")
    parser.add_argument("--roll90", action="store_true", help="Roll finished GLB 90 deg around Z (swap X/Y) and re-measure spec.json")
    parser.add_argument("--reheight", action="store_true", help="Clamp finished GLB height to authentic archetype bounds and re-measure spec.json")
    args = parser.parse_args()

    plan = json.loads(GENERAL_PLAN_PATH.read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in plan}
    targets = [p["id"] for p in plan] if args.cars == ["all"] else args.cars

    if args.flip180 or args.flipup or args.roll90 or args.reheight:
        for cid in targets:
            entry = by_id[cid]
            pub_glb = PUB_CAR_DIR / f"{cid}_base.glb"
            mesh = trimesh.load(str(pub_glb), force="mesh")
            if isinstance(mesh, trimesh.Scene):
                mesh = mesh.dump(concatenate=True)
            v = mesh.vertices.astype(np.float64).copy()
            if args.roll90:
                vx, vy = v[:, 0].copy(), v[:, 1].copy()
                v[:, 0] = vy
                v[:, 1] = -vx
            if args.flipup:
                v[:, 0] *= -1
                v[:, 1] *= -1
            if args.flip180:
                v[:, 0] *= -1
                v[:, 2] *= -1
            v[:, 1] -= v[:, 1].min()
            if args.reheight:
                h_min, h_max = height_bounds_for(entry["archetype"], cid)
                cur_h = max(1e-5, float(v[:, 1].max()))
                new_h = float(np.clip(cur_h, h_min, h_max))
                if abs(new_h - cur_h) > 0.01:
                    v[:, 1] *= new_h / cur_h
            v[:, 0] -= (v[:, 0].min() + v[:, 0].max()) * 0.5
            v[:, 1] -= v[:, 1].min()
            v[:, 2] -= (v[:, 2].min() + v[:, 2].max()) * 0.5
            mesh.vertices = v.astype(np.float32)
            mesh.export(str(pub_glb))
            spec = measure_general_spec(entry, mesh)
            (CAR_DIR / cid / "spec.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
            print(f"[UPDATED] {cid} H={float(v[:, 1].max()):.2f}m", flush=True)
        return

    clean_temp_cache()
    print("Booting Tela 3D runtime (single resident Hunyuan3D CUDA worker)...", flush=True)
    import tela3d_runtime as tela
    if tela.DEVICE != "cuda" or not tela.backend_available("hunyuan_mini"):
        raise RuntimeError("CUDA Hunyuan3D backend not available!")
    free_mb = tela.torch.cuda.mem_get_info()[0] // 2**20
    print(f"GPU Ready: {tela.torch.cuda.get_device_name(0)}, free VRAM = {free_mb} MiB", flush=True)

    results = []
    for cid in targets:
        if cid not in by_id:
            print(f"[WARN] Unknown general vehicle id: {cid}", flush=True)
            continue
        results.append(build_one_general(tela, by_id[cid], force=args.force, cleanup=not args.keep_raw))

    tela.release({})
    clean_temp_cache()
    print("\n=== GENERAL BATCH SUMMARY ===", flush=True)
    print(json.dumps(results, indent=2), flush=True)


if __name__ == "__main__":
    main()
