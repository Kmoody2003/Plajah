"""
Paint an untextured mesh (e.g. a Hunyuan3D-2mini shape) from the approved art's orthographic views → one PBR GLB.

The base colour comes from the art itself: every texel takes its colour from the views that see it head-on
(front / back / left / right of an asset sheet), blended by facing and occlusion-tested, so the texture IS the
approved painting rather than a model's guess. Normal and ORM maps are derived from that colour (a luminance
high-pass for pore/wrinkle detail; wet highlights → low roughness) — good starting maps, not sculpted bakes.

  python paint_from_views.py --mesh shape.glb --out painted.glb \
      --view front=front.png --view back=back.png --view right=right.png [--faces 60000] [--res 2048]

Views are RGBA cut-outs (transparent background). Directions name where the camera stands relative to the
character, which faces +Z: front (+Z), back (-Z), right (the character's right, -X), left (+X).
Mesh must be Y-up facing +Z (Hunyuan / TripoSR output after tela3d_runtime). Feet are moved to the origin,
the scale is left alone.
"""

import argparse
import os

import cv2
import numpy as np
import trimesh
import xatlas
from PIL import Image

from uv_raster import interp, rasterize_uv

DIRS = {"front": (0, 0, 1), "back": (0, 0, -1), "right": (-1, 0, 0), "left": (1, 0, 0)}
UP = np.array([0.0, 1.0, 0.0])
VIEW_WEIGHT = {"front": 1.0, "back": 0.9, "right": 0.75, "left": 0.75}


def view_axes(name):
    d = np.array(DIRS[name], float)
    right = np.cross(-d, UP)
    return d, right


def decimate(mesh, faces):
    if len(mesh.faces) <= faces:
        return mesh
    import pymeshlab
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(mesh.vertices, mesh.faces))
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=faces, preservenormal=True, preservetopology=True)
    m = ms.current_mesh()
    return trimesh.Trimesh(m.vertex_matrix(), m.face_matrix(), process=True)


def fit_view(pts, d, right, alpha):
    """Place the image over the mesh's projection: uniform scale from height, then the (scale, shift) that best
    overlaps the two silhouettes. Returns pixel coords (x, y) for any 3D points."""
    u, v = pts @ right, pts @ UP
    ys, xs = np.nonzero(alpha > 127)
    top, bot = ys.min(), ys.max()
    s0 = (bot - top) / (v.max() - v.min())          # px per unit
    h, w = alpha.shape
    G = 256
    sil_img = cv2.resize((alpha > 127).astype(np.uint8), (G, int(G * h / w)), interpolation=cv2.INTER_AREA) > 0
    gs = G / w
    best = (-1, s0, 0.0)
    cx_img = xs.mean()
    for ks in np.linspace(0.94, 1.06, 13):
        s = s0 * ks
        py = top + (v.max() - v) * s
        for shift in np.linspace(-0.12 * w, 0.12 * w, 49):
            px = cx_img + shift + (u - np.median(u)) * s
            m = np.zeros_like(sil_img)
            gx, gy = (px * gs).astype(int), (py * gs).astype(int)
            ok = (gx >= 0) & (gy >= 0) & (gx < m.shape[1]) & (gy < m.shape[0])
            m[gy[ok], gx[ok]] = True
            m = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            iou = (m & sil_img).sum() / max(1, (m | sil_img).sum())
            if iou > best[0]:
                best = (iou, s, shift)
    iou, s, shift = best
    umed, vmax = np.median(u), v.max()

    def project(p):
        return cx_img + shift + (p @ right - umed) * s, top + (vmax - p @ UP) * s
    return project, iou


def pad_charts(img, covered, iters=8):
    """Grow every UV chart outward into its gutter with its own edge colours, so bilinear filtering and mipmaps at
    chart borders never pick up a neighbouring chart (the inpaint alone blends across charts → seam lines)."""
    out = img.astype(np.float32)
    m = covered.astype(np.float32)
    k = np.ones((3, 3), np.float32)
    for _ in range(iters):
        s = cv2.filter2D(out * m[..., None], -1, k, borderType=cv2.BORDER_CONSTANT)
        c = cv2.filter2D(m, -1, k, borderType=cv2.BORDER_CONSTANT)
        grow = (c > 0) & (m == 0)
        out[grow] = s[grow] / c[grow, None]
        m[grow] = 1
    return np.clip(out, 0, 255).astype(np.uint8)


def bilinear(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001); y = np.clip(y, 0, h - 1.001)
    x0, y0 = x.astype(int), y.astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, e = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mesh", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--view", action="append", required=True, help="dir=path.png (front/back/left/right)")
    ap.add_argument("--faces", type=int, default=60000)
    ap.add_argument("--res", type=int, default=2048)
    a = ap.parse_args()

    mesh = trimesh.load(a.mesh, force="mesh")
    mesh = decimate(trimesh.Trimesh(mesh.vertices, mesh.faces, process=True), a.faces)
    mesh.apply_translation([-mesh.bounds[:, 0].mean(), -mesh.bounds[0, 1], -mesh.bounds[:, 2].mean()])
    print(f"[paint] {len(mesh.faces)} faces, height {mesh.extents[1]:.3f} units", flush=True)

    atlas = xatlas.Atlas()
    atlas.add_mesh(mesh.vertices, mesh.faces)
    pack = xatlas.PackOptions()
    pack.padding = 4                 # texel gutter between charts, filled with each chart's own edge colour below
    pack.resolution = a.res
    atlas.generate(pack_options=pack)
    vmap, idx, uvs = atlas[0]
    verts, vnorm = mesh.vertices[vmap], mesh.vertex_normals[vmap]
    print(f"[paint] UV atlas: {len(verts)} verts", flush=True)

    R = a.res
    faces = idx.astype(np.int64)
    covered, t, bary = rasterize_uv(uvs.astype(np.float64), faces, R)
    tp = interp(verts, faces, t, bary)
    tn = interp(vnorm, faces, t, bary)
    tn /= np.linalg.norm(tn, axis=-1, keepdims=True) + 1e-8
    print(f"[paint] {covered.mean() * 100:.0f}% of the {R}² atlas is surface", flush=True)

    # dense surface samples for per-view depth buffers (occlusion)
    samples, _ = trimesh.sample.sample_surface_even(mesh, 1_500_000)
    acc = np.zeros((len(tp), 3)); wsum = np.zeros(len(tp))
    eps = 0.012 * mesh.extents.max()
    for spec in a.view:
        name, path = spec.split("=", 1)
        img = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
        d, right = view_axes(name)
        project, iou = fit_view(mesh.vertices, d, right, img[:, :, 3])
        print(f"[paint] {name}: silhouette overlap {iou:.2f}", flush=True)
        h, w = img.shape[:2]
        sx, sy = project(samples)
        zb = np.full((h, w), -np.inf)
        ix, iy = np.clip(sx.astype(int), 0, w - 1), np.clip(sy.astype(int), 0, h - 1)
        np.maximum.at(zb, (iy, ix), samples @ d)
        zb = cv2.dilate(np.where(np.isfinite(zb), zb, -1e9).astype(np.float32), np.ones((3, 3), np.uint8))
        px, py = project(tp)
        jx, jy = np.clip(px.astype(int), 0, w - 1), np.clip(py.astype(int), 0, h - 1)
        visible = (tp @ d) >= zb[jy, jx] - eps
        rgba = bilinear(img, px, py)
        facing = np.clip(tn @ d, 0, 1) ** 3
        wv = facing * visible * (rgba[:, 3] / 255.0 > 0.5) * VIEW_WEIGHT[name]
        acc += rgba[:, :3] * wv[:, None]; wsum += wv

    base = np.zeros((R, R, 3), np.float32)
    have = wsum > 1e-3
    colours = np.zeros((len(tp), 3), np.float32)
    colours[have] = acc[have] / wsum[have, None]
    base[covered] = colours
    hole = np.zeros((R, R), np.uint8)
    hole[covered] = (~have).astype(np.uint8)
    hole[~covered] = 1
    print(f"[paint] painted {have.mean() * 100:.1f}% of the surface from the art; filling the rest", flush=True)
    base8 = cv2.inpaint(np.clip(base, 0, 255).astype(np.uint8), hole, 6, cv2.INPAINT_TELEA)
    base8 = pad_charts(base8, covered)

    # derived maps: detail normal from a luminance high-pass, ORM (occlusion 1, roughness from wet highlights)
    lum = cv2.cvtColor(base8, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    detail = lum - cv2.GaussianBlur(lum, (0, 0), 6)
    gx = cv2.Sobel(detail, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(detail, cv2.CV_32F, 0, 1, ksize=3)
    n = np.dstack([-gx * 4.0, gy * 4.0, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    normal8 = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    spec = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 24)) * 4 + 0.5, 0, 1)
    rough = np.clip(0.78 - 0.45 * spec, 0.25, 0.95)
    orm8 = (np.dstack([np.ones_like(rough), rough, np.zeros_like(rough)]) * 255).astype(np.uint8)

    # atlas rows run with +v; trimesh expects the image top row at v = 1
    flip = lambda im: Image.fromarray(np.ascontiguousarray(im[::-1]))
    mat = trimesh.visual.material.PBRMaterial(
        baseColorTexture=flip(base8), normalTexture=flip(normal8), metallicRoughnessTexture=flip(orm8),
        occlusionTexture=flip(orm8), metallicFactor=1.0, roughnessFactor=1.0, name="body")
    out = trimesh.Trimesh(verts, idx, vertex_normals=vnorm, process=False,
                          visual=trimesh.visual.TextureVisuals(uv=uvs, material=mat))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    out.export(a.out)
    print(f"[paint] wrote {a.out} ({os.path.getsize(a.out) / 1e6:.1f} MB)", flush=True)


if __name__ == "__main__":
    main()
