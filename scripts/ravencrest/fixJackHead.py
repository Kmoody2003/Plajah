"""Remove the face that Tripo's multiview generation baked onto the BACK of Jack's head —
both the painted face and the face-shaped relief sculpted into the back of the skull.

Casts rays at the head from behind and from the back three-quarters (rest pose, mesh space; Jack
faces +Z) and keeps the first triangle each ray hits — exactly what you see from behind. Those
triangles are rasterised into a UV mask over the 4096² atlas and repainted with Jack's own hair:
real hair texture continued down from his crown (each texel copies the hair texel above it on the
skull), shaded darker into the nape and blended into the hood below, feathered at the edges.

Usage: python scripts/ravencrest/fixJackHead.py <original.glb> <out.glb>
"""
import io, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import read_glb, accessor, buffer_view_bytes, write_glb

NECK_Y = 1.50          # metres in mesh space (model is 1.70 m tall, Y up)


def visible_from_behind(P, I, head_y, res=70):
    hi = np.where(P[I].mean(1)[:, 1] > head_y)[0]
    tri = P[I[hi]]
    v0, e1, e2 = tri[:, 0], tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
    lo, up = tri.reshape(-1, 3).min(0), tri.reshape(-1, 3).max(0)
    ctr = (lo + up) / 2
    seen = np.zeros(len(I), bool)
    for yaw in np.radians([-50, -25, 0, 25, 50]):
        d = np.array([np.sin(yaw), 0.0, np.cos(yaw)])          # from behind (-Z side) toward +Z
        right = np.array([np.cos(yaw), 0.0, -np.sin(yaw)])
        h = np.cross(d, e2); a = (e1 * h).sum(1)
        ok = np.abs(a) > 1e-9
        f = np.where(ok, 1 / np.where(ok, a, 1), 0)
        for sy in np.linspace(lo[1], up[1], res):
            for sx in np.linspace(-0.2, 0.2, res):
                o = ctr - d * 1.0 + right * sx; o[1] = sy
                s_ = o - v0; u = f * (s_ * h).sum(1)
                q = np.cross(s_, e1); v = f * (q @ d); t = f * (e2 * q).sum(1)
                hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
                if hit.any():
                    seen[hi[np.argmin(np.where(hit, t, np.inf))]] = True
    return seen


def smooth_region(P, Nn, I, tris, iters=40, lam=0.6):
    """Laplacian-relax the vertices of `tris` (seam duplicates welded by position) so the
    sculpted features flatten into a plain skull; the region's border stays put."""
    key = np.round(P / 1e-5).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True)
    weld = weld.ravel()
    U = np.zeros((weld.max() + 1, 3)); np.add.at(U, weld, P); cnt = np.bincount(weld); U /= cnt[:, None]
    T = weld[I]                                     # triangles over welded vertices
    region = np.unique(T[tris].ravel())
    inside = np.zeros(len(U), bool); inside[region] = True
    # Border = region vertices that also touch a triangle outside the region.
    border = np.zeros(len(U), bool); border[np.unique(T[~tris].ravel())] = True
    move = inside & ~border
    edges = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    edges = np.concatenate([edges, edges[:, ::-1]])
    for _ in range(iters):
        acc = np.zeros_like(U); np.add.at(acc, edges[:, 0], U[edges[:, 1]])
        deg = np.bincount(edges[:, 0], minlength=len(U))[:, None]
        avg = acc / np.maximum(deg, 1)
        U[move] += lam * (avg[move] - U[move])
    # Write back positions and recompute normals for the moved vertices.
    P2 = U[weld].astype(np.float32)
    fn = np.cross(U[T[:, 1]] - U[T[:, 0]], U[T[:, 2]] - U[T[:, 0]])
    vn = np.zeros_like(U); np.add.at(vn, T[:, 0], fn); np.add.at(vn, T[:, 1], fn); np.add.at(vn, T[:, 2], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    N2 = Nn.copy(); moved = move[weld]; N2[moved] = vn[weld][moved]
    print(f'relaxed {move.sum()} skull vertices')
    return P2, N2.astype(np.float32)


def cap_skull(P, Nn, I, tris, neck_y):
    """Pull the back-of-head vertices onto an ellipsoid fitted to the skull (a smooth cranium),
    fading the move out toward the neck so the surface stays continuous."""
    key = np.round(P / 1e-5).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True); weld = weld.ravel()
    U = np.zeros((weld.max() + 1, 3)); np.add.at(U, weld, P); U /= np.bincount(weld)[:, None]
    T = weld[I]
    head = U[:, 1] > neck_y
    H = U[head]
    ctr = np.array([np.median(H[:, 0]), (H[:, 1].min() + H[:, 1].max()) / 2 + 0.01, np.median(H[:, 2])])
    rad = np.array([np.percentile(np.abs(H[:, 0] - ctr[0]), 97), (H[:, 1].max() - H[:, 1].min()) / 2, np.percentile(np.abs(H[:, 2] - ctr[2]), 97)])
    region = np.zeros(len(U), bool); region[np.unique(T[tris].ravel())] = True
    move = region & (U[:, 2] < ctr[2])                      # only the back half of the skull
    d = U[move] - ctr
    # Point on the ellipsoid along the same direction from the centre.
    k = 1 / np.sqrt(((d / rad) ** 2).sum(1))
    target = ctr + d * k[:, None] * 0.97
    w = np.clip((U[move, 1] - neck_y) / 0.06, 0, 1)[:, None]   # fade toward the neck
    U[move] = U[move] * (1 - w) + target * w
    # Normals from the new surface.
    fn = np.cross(U[T[:, 1]] - U[T[:, 0]], U[T[:, 2]] - U[T[:, 0]])
    vn = np.zeros_like(U)
    for c_ in range(3): np.add.at(vn, T[:, c_], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    N2 = Nn.copy(); moved = move[weld]; N2[moved] = vn[weld][moved]
    print(f'capped {move.sum()} skull vertices (ellipsoid radii {rad.round(3)})')
    return U[weld].astype(np.float32), N2.astype(np.float32)


HAIR_Y = 1.565          # the crown's hair ends here on the back (below it Tripo painted a face)
NAPE_Y = 1.455          # hair → hood collar


def texels(UV, I, tris, W, H):
    """Every atlas texel covered by `tris`: pixel coords, triangle id, barycentrics."""
    xs, ys, ts, bs = [], [], [], []
    for t in tris:
        uv = UV[I[t]] * [W, H]
        x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
        gx, gy = np.meshgrid(np.arange(max(x0, 0), min(x1 + 1, W)), np.arange(max(y0, 0), min(y1 + 1, H)))
        px = np.stack([gx.ravel() + 0.5, gy.ravel() + 0.5], 1)
        a, b_, c_ = uv
        m = np.array([b_ - a, c_ - a]).T
        if abs(np.linalg.det(m)) < 1e-9: continue
        l = np.linalg.solve(m, (px - a).T).T
        bary = np.c_[1 - l.sum(1), l]
        ok = (bary >= -0.02).all(1)
        xs.append(gx.ravel()[ok]); ys.append(gy.ravel()[ok]); ts.append(np.full(ok.sum(), t)); bs.append(bary[ok])
    return np.concatenate(xs), np.concatenate(ys), np.concatenate(ts), np.concatenate(bs)


def rehair(A, P, UV, I, back):
    """Paint the back of the head with his own hair: each target texel copies the hair texel found
    above it on the skull (same bearing around the head, mirrored up over the hairline)."""
    from scipy.spatial import cKDTree
    H, W = A.shape[:2]
    c = P[I].mean(1)
    head_tris = np.where(c[:, 1] > NAPE_Y - 0.05)[0]
    x, y, t, bary = texels(UV, I, head_tris, W, H)
    q = (P[I[t]] * bary[:, :, None]).sum(1)                       # texel → 3D (mesh space)
    col = A[y, x]
    lum = col.mean(1)
    axis = np.array([np.median(q[q[:, 1] > HAIR_Y, 0]), 0, np.median(q[q[:, 1] > HAIR_Y, 2])])
    sat = col.max(1) - col.min(1)
    src = (q[:, 1] > HAIR_Y + 0.004) & (lum > 2) & (lum < 28) & (sat < 14)   # the crown's dark hair, not skin
    # The back half of the head by bearing (0 = straight back), so no stray triangle keeps a scrap of face.
    rel = q - axis
    bearing_back = np.abs(np.arctan2(rel[:, 0], -rel[:, 2])) < 1.45
    hood = (q[:, 1] < NAPE_Y - 0.01) & (q[:, 1] > NAPE_Y - 0.05) & bearing_back
    tgt = bearing_back & (q[:, 1] > NAPE_Y - 0.02) & (q[:, 1] < HAIR_Y + 0.012)
    print(f'hair source {src.sum()} texels, target {tgt.sum()}, hood {hood.sum()}')

    # Where to look for each target texel's hair: same bearing, mirrored up over the hairline.
    d = q[tgt] - axis
    rad = np.hypot(d[:, 0], d[:, 2]) + 1e-6
    bearing = np.c_[d[:, 0] / rad, d[:, 2] / rad]
    up = HAIR_Y + (HAIR_Y - q[tgt, 1]) * 0.55 + 0.01
    look = np.c_[axis[0] + bearing[:, 0] * rad * 0.9, up, axis[2] + bearing[:, 1] * rad * 0.9]
    tree = cKDTree(q[src])
    _, k = tree.query(look)
    hair = col[src][k]
    # Nape shadow under the hair, then the hood collar.
    yy = q[tgt, 1]
    shade = np.clip((yy - NAPE_Y) / 0.05, 0, 1) * 0.45 + 0.55
    hair = hair * shade[:, None]
    hood_col = np.median(col[hood], axis=0) if hood.any() else np.array([14.0, 14, 14])
    to_hood = np.clip((NAPE_Y + 0.01 - yy) / 0.03, 0, 1)[:, None]
    paint = hair * (1 - to_hood) + hood_col * to_hood
    # Feather into the original at the top (real hair) edge.
    w = np.clip((HAIR_Y + 0.012 - yy) / 0.012, 0, 1)
    out = A.copy()
    acc = np.zeros((H, W, 3)); wt = np.zeros((H, W))
    np.add.at(acc, (y[tgt], x[tgt]), paint * w[:, None]); np.add.at(wt, (y[tgt], x[tgt]), w)
    has = wt > 0
    from PIL import ImageFilter as F
    filled = np.zeros_like(A); filled[has] = acc[has] / wt[has][:, None]
    # Dilate the painted colour a few px so the feather and mip levels never pull in the old face.
    for _ in range(4):
        grow = Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).filter(F.MaxFilter(3))
        g = np.asarray(grow).astype(np.float32)
        filled = np.where(has[..., None], filled, np.where(filled.sum(2, keepdims=True) > 0, filled, g))
        has = filled.sum(2) > 0
    wmix = np.zeros((H, W)); wmix[wt > 0] = np.minimum(1, wt[wt > 0])
    wm = np.asarray(Image.fromarray((wmix * 255).astype(np.uint8)).filter(F.MaxFilter(5)).filter(F.GaussianBlur(2))).astype(np.float32)[..., None] / 255
    return A * (1 - wm) + filled * wm


def main(src, dst):
    j, b = read_glb(src)
    p = j['meshes'][0]['primitives'][0]
    P = accessor(j, b, p['attributes']['POSITION'])
    Nn = accessor(j, b, p['attributes']['NORMAL'])
    UV = accessor(j, b, p['attributes']['TEXCOORD_0'])
    I = accessor(j, b, p['indices']).reshape(-1, 3)
    img_bv = j['images'][0]['bufferView']
    img = Image.open(io.BytesIO(buffer_view_bytes(j, b, img_bv))).convert('RGB')
    W, H = img.size
    A = np.asarray(img).astype(np.float32)

    c = P[I].mean(1)
    n = Nn[I].mean(1); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    head = c[:, 1] > NECK_Y
    back = visible_from_behind(P, I, head_y=NECK_Y - 0.08)
    top = head & (n[:, 1] > 0.6) & (n[:, 2] < 0.2)
    # Flatten the face-shaped relief on the back of the skull (above the neck only).
    sculpt = back & (c[:, 1] > NECK_Y - 0.03)
    P2, N2 = cap_skull(P, Nn, I, sculpt, NECK_Y - 0.02)
    P2, N2 = smooth_region(P2, N2, I, sculpt, iters=30, lam=0.5)
    replace_geo = {}
    for name, arr in (('POSITION', P2), ('NORMAL', N2)):
        acc = j['accessors'][p['attributes'][name]]
        bv = j['bufferViews'][acc['bufferView']]
        stride = bv.get('byteStride') or 12
        buf = bytearray(replace_geo.get(acc['bufferView'], buffer_view_bytes(j, b, acc['bufferView'])))
        o = acc.get('byteOffset', 0)
        view = np.ndarray((len(arr), 3), np.float32, buffer=buf, offset=o, strides=(stride, 4))
        view[:] = arr                                   # works for tight or interleaved layouts
        replace_geo[acc['bufferView']] = bytes(buf)
        if name == 'POSITION':
            acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
    print(f'visible from behind {back.sum()}, top-of-head {top.sum()}')

    def mask_of(sel, grow=0):
        m = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(m)
        for t in I[sel]:
            d.polygon([(UV[k][0] * W, UV[k][1] * H) for k in t], fill=255)
        return m.filter(ImageFilter.MaxFilter(grow * 2 + 1)) if grow else m

    out = rehair(A, P, UV, I, back)
    buf = io.BytesIO()
    Image.fromarray(out.astype(np.uint8)).save(buf, format='JPEG', quality=92)
    write_glb(dst, j, b, {**replace_geo, img_bv: buf.getvalue()})
    print('wrote', dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
