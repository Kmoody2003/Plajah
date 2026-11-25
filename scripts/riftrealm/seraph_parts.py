"""Seraph-9 finishing pass: art-projected warm gold/amber emissive + articulated floating crystal wing-blades
(Spine2) + floating Halo Energy Emitter ring (Spine2), merged into the single skinned primitive (see rr_parts.py).

Usage:
  python scripts/riftrealm/seraph_parts.py body.glb joints.json out.glb --in-dir <cutoutDir> [--no-parts]
"""
import argparse
import json
import os
import sys
import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rr_parts import Rig, lens_card  # noqa: E402

GOLD = (16, 62)


def gold_mask(rgb: np.ndarray, smin: float = 0.30, vmin: float = 0.42) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h, s, v = hsv[..., 0] * 360.0 / 255.0, hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
    return ((h >= GOLD[0]) & (h <= GOLD[1]) & (s >= smin) & (v >= vmin)).astype(np.float32)


def build_seraph_wings(rig: Rig, P: dict, in_dir: str):
    """Build left & right floating geometric crystal/gold wing-blade assemblies pinned to Spine2."""
    Vb = rig.V[: rig.nbody]
    Hb = float(Vb[:, 1].max())
    spine2 = np.array(P["Spine2"], float)
    head = np.array(P["Head"], float)
    # Place wing roots just behind the upper back / shoulders, sweeping out and slightly back
    z_back = float(np.percentile(Vb[(Vb[:, 1] > spine2[1] - 0.15) & (Vb[:, 1] < head[1]), 2], 12)) - 0.05
    wing_h = Hb * 0.56
    tot = 0

    for side_name, fname, sx in (("Left", "wing_right.png", 1.0), ("Right", "wing_left.png", -1.0)):
        # Note: in front view (+Z facing camera), screen-RIGHT is the character's LEFT (+X),
        # and screen-LEFT is the character's RIGHT (-X).
        p = os.path.join(in_dir, fname)
        im = np.array(Image.open(p).convert("RGBA"))
        # Cleanly strip ALL dark charcoal backdrop halo around the metallic silver/gold crystal blades
        rgb = im[:, :, :3]
        mx = rgb.max(axis=2)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        sat = hsv[:, :, 1].astype(np.float32) / 255.0
        # Keep crisp metallic silver/white blades (mx >= 78) OR saturated glowing gold edges (mx >= 58 & sat >= 0.32)
        bright_shard = (mx >= 78) | ((mx >= 58) & (sat >= 0.32))
        m = (im[:, :, 3] > 100) & bright_shard
        # Trim the narrow inner crop-boundary strip adjacent to the prism head (avoids vertical prism-corner slivers)
        h0, w0 = m.shape
        inner_cut = int(w0 * 0.21)
        if sx > 0:
            m[: int(h0 * 0.58), :inner_cut] = False
        else:
            m[: int(h0 * 0.58), w0 - inner_cut :] = False
        # Remove tiny stray dust specs while preserving every floating crystal feather shard
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
        nc, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
        clean_m = np.zeros_like(m)
        for i in range(1, nc):
            if st[i, cv2.CC_STAT_AREA] >= 140:
                clean_m[lab == i] = True
        m = clean_m

        ys, xs = np.nonzero(m)
        im = im[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].copy()
        m = m[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        h, w = m.shape
        k = wing_h / max(1, h)
        # Inner anchor edge (closest to character spine)
        x_anchor = 0.0 if sx > 0 else float(w)
        y_anchor = h * 0.72
        y_root = spine2[1] - 0.04
        x_root = sx * 0.24

        # Emissive glow on golden crystal blades
        gm = np.clip(cv2.GaussianBlur(gold_mask(im[:, :, :3], 0.25, 0.42), (0, 0), 1.2) * 1.65, 0, 1)
        emis = (im[:, :, :3].astype(np.float32) * gm[..., None] * 1.8).clip(0, 255).astype(np.uint8)
        # Crisp alpha mask with gentle 0.5px anti-alias
        al = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.55)
        al = np.where(m, np.maximum(al, 0.75), 0.0)
        im[:, :, 3] = np.clip(al * 255.0, 0, 255).astype(np.uint8)

        def place(px, py, t, sx=sx, x_anchor=x_anchor, y_anchor=y_anchor, x_root=x_root, y_root=y_root, k=k, z_back=z_back):
            dx = (px - x_anchor) * k
            dy = (y_anchor - py) * k
            out_dist = np.abs(dx)
            X = x_root + dx * 0.92
            Y = y_root + dy
            Z = z_back - out_dist * 0.36 + t
            return np.stack([X, Y, Z], axis=1)

        def thick(d, px, py, k=k):
            return np.minimum(d * k * 0.45, 0.014)

        V, F, UV = lens_card(m, 9, place, thick, (w, h))
        rig.add_part(f"{side_name} crystal wing", V, F, UV, "Spine2", im, emis, rough=0.22, metal=0.85)
        tot += len(F)
    return tot


def build_halo_ring(rig: Rig, P: dict):
    """Build a crisp 3D concentric golden Halo Energy Emitter hovering above Seraph-9's crystal head (pinned to Spine2)."""
    Vb = rig.V[: rig.nbody]
    Hb = float(Vb[:, 1].max())
    head = np.array(P["Head"], float)
    cx = float(head[0])
    cz = float(head[2]) - 0.01
    cy = Hb + 0.09  # floats cleanly right over the top apex of the crystal prism head

    verts, faces, uvs = [], [], []
    # Two concentric chamfered metallic-gold torus rings (outer halo + inner emitter ring)
    rings = [
        (0.28, 0.016, 48, 8, 0.0),
        (0.21, 0.010, 40, 8, 0.02),
    ]
    v_off = 0
    for R, r, n_seg, n_tube, y_off in rings:
        for i in range(n_seg + 1):
            th = (i / n_seg) * 2.0 * np.pi
            ct, st = np.cos(th), np.sin(th)
            for j in range(n_tube + 1):
                ph = (j / n_tube) * 2.0 * np.pi
                cp, sp = np.cos(ph), np.sin(ph)
                rr = R + r * cp
                x = cx + rr * ct
                y = cy + y_off + r * sp * 0.55 - 0.04 * st  # slight angelic backward tilt
                z = cz + rr * st
                verts.append((x, y, z))
                uvs.append((i / n_seg, j / n_tube))
        stride = n_tube + 1
        for i in range(n_seg):
            for j in range(n_tube):
                a = v_off + i * stride + j
                b = v_off + (i + 1) * stride + j
                c = v_off + (i + 1) * stride + (j + 1)
                d = v_off + i * stride + (j + 1)
                faces.append((a, b, c))
                faces.append((a, c, d))
        v_off += (n_seg + 1) * stride

    V = np.array(verts, float)
    F = np.array(faces, np.int64)
    UV = np.array(uvs, float)
    # 64x64 luminous gold-energy strip texture
    tex = np.zeros((64, 64, 4), np.uint8)
    em = np.zeros((64, 64, 3), np.uint8)
    ys = np.linspace(-1, 1, 64)[:, None]
    glow = np.exp(-((ys * 2.2) ** 2))
    base_col = np.array([245, 198, 92], float) * (0.55 + 0.45 * glow[..., None])
    tex[:, :, :3] = np.clip(base_col, 0, 255).astype(np.uint8)
    tex[:, :, 3] = 255
    em[:, :, :] = np.clip(np.array([255, 200, 75], float) * (0.45 + 0.9 * glow[..., None]), 0, 255).astype(np.uint8)
    rig.add_part("halo emitter", V, F, UV, "Spine2", tex, em, rough=0.18, metal=0.92)
    return len(F)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb")
    ap.add_argument("joints")
    ap.add_argument("out")
    ap.add_argument("--in-dir", required=True)
    ap.add_argument("--no-parts", action="store_true")
    ap.add_argument("--room", type=float, default=0.84)
    a = ap.parse_args()

    P = json.load(open(a.joints))
    rig = Rig(a.glb)
    print(f"[seraph_parts] atlas free: {rig.free_space() * 100:.1f}%")
    if not a.no_parts:
        rig.make_room(a.room)
    rig.project_emissive(
        {"front": os.path.join(a.in_dir, "front.png"), "back": os.path.join(a.in_dir, "back.png")},
        GOLD,
        smin=0.28,
        vmin=0.40,
        gain=1.65,
    )
    if not a.no_parts:
        wt = build_seraph_wings(rig, P, a.in_dir)
        ht = build_halo_ring(rig, P)
        print(f"[seraph_parts] wing tris={wt}, halo tris={ht}")
    rig.save(a.out)
    print("\n".join(rig.log))


if __name__ == "__main__":
    main()
