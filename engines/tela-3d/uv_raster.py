"""
UV-space rasterising for texture bakes — triangle id + barycentrics per texel.

SF3D's texture_baker is CUDA-first; its CPU kernel (the only one we can build without the CUDA toolkit) access-
violates on large atlases on Windows. This is a drop-in replacement built on OpenCV's polygon fill: fast, safe, and
used both by SF3D's bake (via patch_texture_baker) and by paint_from_views.py.
"""

import cv2
import numpy as np


def rasterize_uv(uvs, faces, R):
    """→ (covered[R,R] bool, tri[N] int, bary[N,3]) for the N covered texels in row-major order. Row = v·R."""
    ids = np.zeros((R, R, 3), np.uint8)
    pts = np.round(uvs[faces] * R * 16 - 8).astype(np.int32)       # 4 bits of sub-pixel precision
    for i, tri in enumerate(pts):
        k = i + 1
        cv2.fillPoly(ids, [tri], (k & 255, (k >> 8) & 255, (k >> 16) & 255), lineType=cv2.LINE_8, shift=4)
    tid = (ids[..., 0].astype(np.int64) | (ids[..., 1].astype(np.int64) << 8) | (ids[..., 2].astype(np.int64) << 16)) - 1
    covered = tid >= 0
    yy, xx = np.nonzero(covered)
    t = tid[yy, xx]
    a, b, c = (uvs[faces[t, j]] * R for j in range(3))
    p = np.stack([xx + 0.5, yy + 0.5], 1)
    v0, v1, v2 = b - a, c - a, p - a
    den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]
    den = np.where(np.abs(den) < 1e-12, 1e-12, den)
    w1 = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / den
    w2 = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / den
    bary = np.clip(np.stack([1 - w1 - w2, w1, w2], 1), 0, 1)
    bary /= bary.sum(1, keepdims=True) + 1e-12
    return covered, t, bary


def interp(attr, faces, t, bary):
    return (attr[faces[t]] * bary[:, :, None]).sum(1)


def patch_texture_baker():
    """Route SF3D's TextureBaker.rasterize / .interpolate through rasterize_uv, on whatever device SF3D uses.
    Same layout as texture_baker: [R,R,4] = barycentrics + triangle id (-1 = empty), image row 0 at v = 1."""
    import torch
    from texture_baker import TextureBaker
    if getattr(TextureBaker, "_tela3d", False):
        return

    def rasterize(self, uv, face_indices, bake_resolution):
        R = int(bake_resolution)
        f = face_indices.detach().cpu().numpy().astype(np.int64)
        covered, t, bary = rasterize_uv(uv.detach().float().cpu().numpy().astype(np.float64), f, R)
        out = np.zeros((R, R, 4), np.float32)
        out[..., 3] = -1
        out[covered, :3] = bary
        out[covered, 3] = t
        return torch.from_numpy(np.ascontiguousarray(out[::-1])).to(uv.device)

    def interpolate(self, attr, rast, face_indices):
        tid = rast[..., 3].long()
        mask = tid >= 0
        tri = face_indices.long().to(attr.device)[tid.clamp(min=0)]          # R,R,3
        vals = attr[tri] * rast[..., :3, None].to(attr.dtype)               # R,R,3,C
        return torch.where(mask[..., None], vals.sum(-2), torch.zeros((), dtype=attr.dtype, device=attr.device))

    TextureBaker.rasterize = rasterize
    TextureBaker.interpolate = interpolate
    TextureBaker._tela3d = True
