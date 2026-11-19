"""
Geometry from the art: reshape a generated mesh so it is the object the sheet draws, from every side.

An image-to-3D shape (Hunyuan3D-2mini) only ever saw ONE view, so it matches the front outline and guesses the rest:
sides too deep or too shallow, a chimney or porch the side view shows simply missing, recesses (a door set into the
wall, the space under a roof overhang) filled in, a back caved in. A house sheet draws the object from every side, so
every view is a measurement — but a GENERATED sheet isn't drawn to one exact scale (the cabin's back is 12% narrower than
its front, its side views show the roof from above), so no single drawing is trusted outright. In a voxel grid:

0. Proportions. The front fixes width and height; the side views and the plan each measure depth against them. The
   depth is stretched to the median of those estimates (clamped).
1. Outline, by vote. Views looking along the same axis (front + back, left + right) must agree before a voxel goes,
   and a group that would cut a large share of the shape is a different drawing and is skipped.
2. Missing parts (grow). Where a view's outline has pixels the shape doesn't cover (a chimney the generator dropped),
   the shape grows into the hull there, a few voxels at a time.
3. Vision model. Depth Anything V2 (local ONNX, CPU) reads each view's relief.
   a. Its broad relief, placed at the shape's outer envelope (rim, corners — what the generator got right), raises broad
      deep dents up to the drawn surface, carrying the generator's own fine grooves onto the raised part.
   b. Its fine relief (the depth minus its broad shape) is extruded / carved, ±`relief` of the object's depth, from every
      view except the one the shape was generated from — the generator already read that very picture.
4. Surface. Marching cubes, Taubin smoothing; then every vertex close to the generator's untouched surface snaps back
   to it, so its crisp detail survives where nothing changed. Decimated to the face budget.

Generated meshes are rarely watertight, so the solid fill also counts a voxel solid when surface lies on both sides of it
along all three axes.

Views and axes follow paint_from_views (front +Z, left +X, right -X, back -Z, top +Y). Only the axis views shape it;
`yaw:` views are for painting. Mesh in, Y-up facing +Z; feet are moved to the origin like the paint step does.

  python art_geometry.py --mesh shape.glb --out reshaped.glb --view front=front.png --view left=left.png ...
"""

import argparse
import sys
import os

import cv2
import numpy as np
import trimesh
from PIL import Image
from scipy import ndimage

from paint_from_views import decimate, fit_view, view_axes

DEPTH_MODEL = os.path.join(os.environ.get("PLAJAH_MODELS_ROOT", r"D:\Plajah Models"), "depth-anything-v2-small", "model.onnx")
AXIS_VIEWS = ("front", "back", "left", "right", "top")
_DEPTH = {}


def log(msg):
    print(f"[geometry] {msg}".encode("ascii", "replace").decode("ascii") if not (sys.stdout.encoding or "").lower().startswith("utf") else f"[geometry] {msg}", flush=True)


def depth_of(rgba):
    """Relative inverse depth (bigger = nearer) for a cut-out, at the image's own size, 0 outside the figure."""
    import onnxruntime as ort
    if "s" not in _DEPTH:
        _DEPTH["s"] = ort.InferenceSession(DEPTH_MODEL, providers=["CPUExecutionProvider"])
    h, w = rgba.shape[:2]
    a = rgba[:, :, 3:4] / 255.0
    rgb = rgba[:, :, :3] * a + 128 * (1 - a)            # neutral grey behind the figure, as on the sheet
    side = 518
    k = side / max(h, w)
    nh, nw = max(14, int(round(h * k / 14)) * 14), max(14, int(round(w * k / 14)) * 14)
    x = cv2.resize(rgb.astype(np.float32), (nw, nh), interpolation=cv2.INTER_AREA) / 255.0
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    out = _DEPTH["s"].run(None, {"pixel_values": x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    out = cv2.resize(out.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.bilateralFilter(out, 7, float(np.ptp(out) * 0.05 + 1e-6), 5)


def occupancy(mesh, lo, pitch, shape):
    """Solid voxels of a (near-)closed mesh: dense surface samples marked, closed, holes filled."""
    n = int(min(12_000_000, max(400_000, mesh.area / (pitch * 0.45) ** 2)))
    pts, _ = trimesh.sample.sample_surface(mesh, n)
    idx = np.clip(((pts - lo) / pitch).astype(int), 0, np.array(shape) - 1)
    occ = np.zeros(shape, bool)
    occ[idx[:, 0], idx[:, 1], idx[:, 2]] = True
    # thicken so the shell has no pinholes the outside can leak through, fill, then take the thickening back off
    shell = ndimage.binary_dilation(occ, iterations=1)
    filled = ndimage.binary_fill_holes(shell)
    # Generated meshes are rarely watertight: one hole and the fill leaks, leaving only a shell. A hole-tolerant
    # fill as well: a voxel is solid when the surface lies on both sides of it along all three axes (two would fill
    # a recess between a roof eave and a lintel).
    votes = np.zeros(shape, np.uint8)
    for ax in range(3):
        before = np.maximum.accumulate(shell, axis=ax)
        after = np.flip(np.maximum.accumulate(np.flip(shell, ax), axis=ax), ax)
        votes += before & after
    solid = filled | (votes >= 3) | shell
    return ndimage.binary_erosion(ndimage.binary_opening(solid, iterations=1), iterations=1) | occ


def view_frame(name, axes_coords, project):
    """For an axis view: which grid axes map to the picture, the depth axis and its sign toward the camera, and the
    picture coordinates of every (a, b) cell of the 2D grid seen from that side."""
    d, right, up = view_axes(name)
    depth_axis = int(np.argmax(np.abs(d)))
    sign = float(np.sign(d[depth_axis]))
    plane = [i for i in range(3) if i != depth_axis]          # grid axes in index order
    A, B = np.meshgrid(axes_coords[plane[0]], axes_coords[plane[1]], indexing="ij")
    pts = np.zeros(A.shape + (3,))
    pts[..., plane[0]] = A
    pts[..., plane[1]] = B
    px, py = project(pts.reshape(-1, 3))
    return depth_axis, sign, plane, px.reshape(A.shape), py.reshape(A.shape)


def sample(img, px, py):
    h, w = img.shape[:2]
    return img[np.clip(np.round(py).astype(int), 0, h - 1), np.clip(np.round(px).astype(int), 0, w - 1)]


def inside(img_mask, px, py):
    h, w = img_mask.shape
    ok = (px >= 0) & (py >= 0) & (px < w) & (py < h)
    return ok & sample(img_mask, px, py)


def surface_height(occ, depth_axis, sign, coords):
    """Per 2D cell, the coordinate (toward the camera) of the nearest solid voxel; -inf where the column is empty."""
    o = np.moveaxis(occ, depth_axis, -1)
    c = coords[depth_axis] * sign
    order = np.argsort(-c)                                        # nearest to the camera first
    first = np.argmax(o[..., order], axis=-1)
    any_ = o.any(axis=-1)
    return np.where(any_, c[order][first], -np.inf)


def column_values(depth_axis, sign, coords, shape2d):
    """The toward-camera coordinate of every voxel, laid out like the grid (broadcastable)."""
    c = coords[depth_axis] * sign
    s = [1, 1, 1]
    s[depth_axis] = len(c)
    return c.reshape(s)


def expand(arr2d, depth_axis):
    return np.expand_dims(arr2d, depth_axis)


GROUPS = {"front": "z", "back": "z", "left": "x", "right": "x", "top": "y"}


def aspect(alpha):
    ys, xs = np.nonzero(alpha > 127)
    return (np.ptp(xs) + 1) / (np.ptp(ys) + 1)


def proportions(mesh, views, min_overlap):
    """How deep the object really is. The generator saw only the front, so its width and height are right and its depth
    is a guess; the side views and the plan each measure depth against a dimension the front fixes. Generated sheets
    don't keep every view to one scale, so the estimates are combined by median and clamped."""
    ext = mesh.extents
    est = {}
    for name in ("left", "right", "top"):
        if name not in views:
            continue
        a = aspect(np.asarray(Image.open(views[name]).convert("RGBA"))[:, :, 3])
        est[name] = (a * ext[1] / ext[2]) if name != "top" else ((ext[0] / a) / ext[2])
    if not est:
        return 1.0, est
    k = float(np.clip(np.median(list(est.values())), 0.6, 1.6))
    return k, est


def reshape(mesh_path, views, out, res=288, faces=200_000, grow=0.04, relief=0.02, tol=0.015, min_overlap=0.6,
            max_group_cut=0.22, use_depth=True, outline_only=(), shape_from="front", fill_to_art=0.3):
    """outline_only: views that count for the outline but not the relief (a mirrored front standing in for a missing
    back has the right outline but the front's relief)."""
    mesh = trimesh.load(mesh_path, force="mesh")
    mesh = trimesh.Trimesh(mesh.vertices, mesh.faces, process=True)
    mesh.apply_translation([-mesh.bounds[:, 0].mean(), -mesh.bounds[0, 1], -mesh.bounds[:, 2].mean()])
    report = {"views": {}}

    # 0. Proportions: stretch the generator's guessed depth to what the side views and the plan measure.
    kz, est = proportions(mesh, views, min_overlap)
    report["depthScale"] = round(kz, 3)
    report["depthEstimates"] = {k: round(float(v), 3) for k, v in est.items()}
    if abs(kz - 1) > 0.03:
        mesh.apply_scale([1, 1, kz])
    log(f"proportions: depth ×{kz:.2f} (estimates {report['depthEstimates']})")

    ext = mesh.extents
    pitch = float(ext.max() * 1.12 / res)
    lo = mesh.bounds[0] - ext.max() * 0.06
    shape = tuple(int(np.ceil((ext[i] + ext.max() * 0.12) / pitch)) for i in range(3))
    coords = [lo[i] + (np.arange(shape[i]) + 0.5) * pitch for i in range(3)]
    report["voxel"] = pitch
    log(f"grid {shape[0]}×{shape[1]}×{shape[2]}, voxel {pitch:.4f}")
    occ = occupancy(mesh, lo, pitch, shape)
    start = int(occ.sum())

    # Fit every view to the (re-proportioned) shape — the same fit the paint step uses.
    frames = {}
    dense, _ = trimesh.sample.sample_surface(mesh, 300_000)
    for name, path in views.items():
        if name not in AXIS_VIEWS:
            continue
        rgba = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
        d, right, up = view_axes(name)
        project, iou = fit_view(dense, d, right, rgba[:, :, 3], up)
        report["views"][name] = {"overlapBefore": round(float(iou), 3)}
        if iou < min_overlap:
            log(f"{name}: overlap {iou:.2f} — not this side of the object, skipped")
            report["views"][name]["skipped"] = True
            continue
        sil = rgba[:, :, 3] > 127
        ys, _ = np.nonzero(sil)
        k = max(1, int(round(tol * np.ptp(ys))))
        loose = cv2.dilate(sil.astype(np.uint8), np.ones((2 * k + 1, 2 * k + 1), np.uint8)) > 0
        tight = cv2.erode(sil.astype(np.uint8), np.ones((2 * k + 1, 2 * k + 1), np.uint8)) > 0
        depth_axis, sign, plane, px, py = view_frame(name, coords, project)
        frames[name] = dict(rgba=rgba, sil=sil, loose=inside(loose, px, py), tight=inside(tight, px, py),
                            cell=inside(sil, px, py), px=px, py=py, depth_axis=depth_axis, sign=sign,
                            height=float(np.ptp(ys)))

    # 1. Outline, by vote. Views that look along the same axis (front + back, left + right) must agree before a voxel
    #    goes: one view drawn a little off-scale can't cut the model. A group that would remove a big share of the
    #    shape disagrees with the others — it's a different drawing (a perspective side, a floor plan), so it's skipped.
    hull = np.ones(shape, bool)
    report["groups"] = {}
    for g in ("z", "x", "y"):
        members = [n for n in frames if GROUPS[n] == g]
        if not members:
            continue
        outside = np.ones(shape, bool)
        for n in members:
            outside &= ~expand(frames[n]["loose"], frames[n]["depth_axis"])
        cut = (occ & outside).sum() / max(1, start)
        if cut > max_group_cut:
            log(f"outline {'+'.join(members)}: would cut {cut * 100:.0f}% — inconsistent with the other views, skipped")
            report["groups"][g] = {"views": members, "cut": round(float(cut), 4), "skipped": True}
            for n in members:
                frames[n]["unused"] = True
            continue
        hull &= ~outside
        report["groups"][g] = {"views": members, "cut": round(float(cut), 4)}
    before = int(occ.sum())
    occ &= hull
    report["outlineCut"] = round(1 - occ.sum() / max(1, before), 4)
    log(f"outline: {report['outlineCut'] * 100:.1f}% of the shape was outside the outlines")

    # 2. Grow into outline pixels the shape leaves uncovered (dropped parts), staying inside the hull.
    steps = max(1, int(round(grow * res)))
    added = 0
    for _ in range(steps):
        missing = np.zeros(shape, bool)
        for f in frames.values():
            if f.get("unused"):
                continue
            gap = f["tight"] & ~occ.any(axis=f["depth_axis"])
            if gap.any():
                missing |= expand(gap, f["depth_axis"])
        if not missing.any():
            break
        new = ndimage.binary_dilation(occ) & hull & missing & ~occ
        if not new.any():
            break
        occ |= new
        added += int(new.sum())
    report["grown"] = round(added / max(1, start), 4)
    log(f"grow: +{report['grown'] * 100:.1f}% into parts the outlines show")

    # 3. Relief from the vision model. Depth Anything reads what stands proud and what is set back in each drawing
    #    (logs, door frames, beams, window recesses). Its fine structure — the depth minus its own broad shape — is
    #    applied to the surface seen from that side as extrusion (proud) and carving (set back), scaled to `relief` of
    #    the object's depth so a misread can never bore through or balloon.
    if use_depth and relief > 0 and os.path.isfile(DEPTH_MODEL):
        for name, f in frames.items():
            if name in outline_only or name == "top" or f.get("unused"):
                continue
            disp = depth_of(f["rgba"])
            m = f["sil"]
            sig = max(2.0, 0.04 * f["height"])
            w = cv2.GaussianBlur(m.astype(np.float32), (0, 0), sig)
            broad = cv2.GaussianBlur(disp * m, (0, 0), sig) / np.maximum(w, 1e-3)
            ax, sg = f["depth_axis"], f["sign"]
            c = column_values(ax, sg, coords, None)
            info = report["views"][name]

            # 3a. Fill to the drawn surface: the art's broad relief (a wall, a roof plane), calibrated to the shape's
            #     own surface by a trimmed fit, raises what the generator left sunken behind it (a caved-in back).
            h_occ = surface_height(occ, ax, sg, coords)
            ok = f["tight"] & np.isfinite(h_occ)
            filled = 0
            if fill_to_art > 0 and name != shape_from and ok.sum() > 200:
                bx, by = sample(broad, f["px"], f["py"])[ok], h_occ[ok]
                keep = np.ones(len(bx), bool)
                for _ in range(4):                                # least trimmed squares: fit the dominant surface
                    A = np.stack([bx[keep], np.ones(keep.sum())], 1)
                    (a, b), *_ = np.linalg.lstsq(A, by[keep], rcond=None)
                    r = np.abs(by - (a * bx + b))
                    keep = r <= np.quantile(r, 0.6)
                if a <= 0:
                    a = 0.0
                # The drawn surface sits at the shape's OUTER envelope (rim, corner logs — what the generator got right),
                # not at the dented majority: shift the fit so only the top 15% of the shape stands proud of it.
                bc = sample(broad, f["px"], f["py"])
                b = float(np.percentile(by - a * bx, 85))
                # carry the generator's own fine structure (log ridges and grooves) onto the raised surface
                hf = np.where(ok, h_occ, 0.0)
                wv = ndimage.gaussian_filter(ok.astype(np.float32), 3.0)
                hp_occ = np.clip(hf - ndimage.gaussian_filter(hf, 3.0) / np.maximum(wv, 1e-3), -relief * ext[ax], relief * ext[ax])
                h_art = a * bc + b + np.where(ok, hp_occ, 0.0)
                gap = (a * bc + b) - ndimage.gaussian_filter(hf, 3.0) / np.maximum(wv, 1e-3)
                # only real dents: deeper than a log groove or a trim, and broad (a groove between logs is neither)
                cells = ok & (gap > max(3 * pitch, 0.03 * ext[ax])) & (gap < fill_to_art * ext[ax])
                rad = max(2, int(0.03 * max(cells.shape)))
                cells = ndimage.binary_opening(cells, structure=np.ones((2 * rad + 1, 2 * rad + 1), bool))
                ha, ho = expand(np.where(cells, h_art, -1e9), ax), expand(np.where(cells, h_occ, 1e9), ax)
                add = ~occ & hull & (c > ho) & (c <= ha)
                occ |= add
                filled = int(add.sum())
            info["filledToArt"] = round(filled / max(1, start), 4)

            if name == shape_from:                                # the generator already read this very picture
                log(f"{name}: filled {info['filledToArt'] * 100:.2f}% to the drawn surface; relief kept from the generator")
                continue
            hp = (disp - broad) * m
            scale = np.percentile(np.abs(hp[m]), 98) + 1e-9
            hp = np.clip(hp / scale, -1, 1)
            amp = relief * ext[ax]
            delta = sample(hp, f["px"], f["py"]) * amp
            h_occ = surface_height(occ, ax, sg, coords)
            ok = f["tight"] & np.isfinite(h_occ)
            delta = np.where(ok, delta, 0.0)
            ho = expand(np.where(ok, h_occ, -1e9), ax)
            dl = expand(delta, ax)
            cut = occ & (dl < -pitch * 0.5) & (c > ho + dl) & (c <= ho + pitch * 0.5)
            fill = ~occ & hull & (dl > pitch * 0.5) & (c > ho) & (c <= ho + dl)
            occ &= ~cut
            occ |= fill
            info.update(carved=round(cut.sum() / max(1, start), 4), extruded=round(fill.sum() / max(1, start), 4),
                        reliefMm=round(float(amp) * 1000, 1))
            log(f"{name}: filled {info['filledToArt'] * 100:.2f}% to the drawn surface; relief ±{amp:.3f} — carved {info['carved'] * 100:.2f}%, extruded {info['extruded'] * 100:.2f}%")
    else:
        log("relief off")

    # keep the main piece, then surface it
    lab, n = ndimage.label(occ)
    if n > 1:
        occ = lab == (1 + np.argmax(ndimage.sum(occ, lab, range(1, n + 1))))
    from skimage.measure import marching_cubes
    field = ndimage.gaussian_filter(occ.astype(np.float32), 0.8)
    v, fc, _, _ = marching_cubes(field, 0.5, spacing=(pitch, pitch, pitch))
    out_mesh = trimesh.Trimesh(v + lo + pitch * 0.5, fc[:, ::-1], process=True)
    trimesh.smoothing.filter_taubin(out_mesh, iterations=8)
    # Where the shape wasn't changed, take the generator's own surface back (its fine detail, not the voxel blur).
    from scipy.spatial import cKDTree
    orig, _ = trimesh.sample.sample_surface(mesh, 4_000_000)
    dist, j = cKDTree(orig).query(out_mesh.vertices, k=1, workers=-1)
    near = dist < 1.5 * pitch
    out_mesh.vertices[near] = orig[j[near]]
    report["snapped"] = round(float(near.mean()), 3)
    log(f"surface: {near.mean() * 100:.0f}% of it is the generator's own surface")
    out_mesh = decimate(out_mesh, faces)
    if out_mesh.is_volume and out_mesh.volume < 0:
        out_mesh.invert()
    out_mesh.apply_translation([0, -out_mesh.bounds[0, 1], 0])
    for name, path in views.items():
        if name in frames:
            rgba = frames[name]["rgba"]
            d, right, up = view_axes(name)
            _, iou = fit_view(trimesh.sample.sample_surface(out_mesh, 300_000)[0], d, right, rgba[:, :, 3], up)
            report["views"][name]["overlapAfter"] = round(float(iou), 3)
            log(f"{name}: overlap {report['views'][name]['overlapBefore']:.2f} → {iou:.2f}")
    out_mesh.export(out)
    report["faces"] = int(len(out_mesh.faces))
    report["volumeChange"] = round(float(occ.sum()) / max(1, start) - 1, 4)
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mesh", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--view", action="append", required=True)
    ap.add_argument("--res", type=int, default=288)
    ap.add_argument("--faces", type=int, default=200_000)
    ap.add_argument("--no-depth", action="store_true")
    a = ap.parse_args()
    views = dict(s.split("=", 1) for s in a.view)
    print(reshape(a.mesh, views, a.out, res=a.res, faces=a.faces, use_depth=not a.no_depth))


if __name__ == "__main__":
    main()
