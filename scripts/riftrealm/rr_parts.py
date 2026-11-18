"""Rift Realm character finishing helpers (library; used by vs_parts.py / paladin_parts.py).

Rig contract stays intact: rigid extra parts (wing cloak, daggers, lance, shield) are appended to the ONE skinned
primitive and use the ONE material. Each part is weighted 100% to a single contract bone, its texture is packed into
free space of the body's 2048 atlas (charts found by rasterising the body UVs; a part shrinks if no hole fits), and
the material switches to alphaMode MASK + doubleSided (body alpha stays 255) so membranes / blade outlines cut out.

Also: project_emissive() builds the emissive map by projecting the ART's glow-coloured pixels (hue band on the
crisp cut-outs) through the same orthographic view fit paint_from_views uses — the old add_emissive.py thresholded
the blurry painted atlas and caught ~0.5% of texels.

Textures are written as WebP (EXT_texture_webp, required; three.js GLTFLoader supports it) to keep files small.
"""
import io
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ravencrest'))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'engines', 'tela-3d'))
from glbio import read_glb, accessor, buffer_view_bytes, write_glb  # noqa: E402
from uv_raster import rasterize_uv, interp  # noqa: E402


def unit(v):
    v = np.asarray(v, float); return v / (np.linalg.norm(v) + 1e-12)


def vertex_normals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3): np.add.at(N, F[:, k], fn)
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)


def grid_sheet(mask, cell, keep_dilate=2):
    """Quad grid over a 2D mask (H,W) with `cell` px spacing; keeps quads touching the (dilated) mask.
    Returns pts (n,2) pixel coords (x, y) and faces (m,3) (two triangles per kept quad)."""
    h, w = mask.shape
    xs = np.arange(0, w + cell, cell, dtype=float); ys = np.arange(0, h + cell, cell, dtype=float)
    xs[-1] = min(xs[-1], w); ys[-1] = min(ys[-1], h)
    md = cv2.dilate(mask.astype(np.uint8), np.ones((2 * keep_dilate + 1,) * 2, np.uint8))
    nx, ny = len(xs), len(ys)
    idx = -np.ones((ny, nx), int); pts = []; F = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            x0, x1, y0, y1 = int(xs[i]), int(np.ceil(xs[i + 1])), int(ys[j]), int(np.ceil(ys[j + 1]))
            if not md[y0:y1, x0:x1].any(): continue
            q = []
            for (jj, ii) in ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)):
                if idx[jj, ii] < 0: idx[jj, ii] = len(pts); pts.append((xs[ii], ys[jj]))
                q.append(idx[jj, ii])
            F += [(q[0], q[2], q[1]), (q[0], q[3], q[2])]
    return np.array(pts, float), np.array(F, np.int64)


def lens_card(mask, cell, place, thick, uv_size):
    """Two-sided 'lens' solid from a 2D cut-out: front/back sheets at +-thick(x, y) along the card normal, meeting at
    the outline (thick -> 0 there), so it reads solid from any angle with no visible gap.
    place(px, py, t) -> (n,3) world points; thick(dt_px, px, py) -> world thickness per vertex.
    Returns V, F, UV (UV in the part's own 0..1 texture space; row 0 = top of the cut-out)."""
    pts, F = grid_sheet(mask, cell)
    dt = distance_transform_edt(mask)
    h, w = mask.shape
    px, py = pts[:, 0], pts[:, 1]
    d = dt[np.clip(py.astype(int), 0, h - 1), np.clip(px.astype(int), 0, w - 1)]
    d = cv2.GaussianBlur(dt.astype(np.float32), (0, 0), 1.5)[np.clip(py.astype(int), 0, h - 1), np.clip(px.astype(int), 0, w - 1)]
    t = thick(d, px, py)
    Vf = place(px, py, t); Vb = place(px, py, -t)
    V = np.vstack([Vf, Vb]); n = len(pts)
    FF = np.vstack([F, F[:, ::-1] + n])
    UV = np.vstack([np.stack([px / uv_size[0], py / uv_size[1]], 1)] * 2)
    return V, FF, UV


class Rig:
    def __init__(self, path):
        self.j, self.b = read_glb(path)
        j, b = self.j, self.b
        self.prim = j['meshes'][0]['primitives'][0]; at = self.prim['attributes']
        self.V = accessor(j, b, at['POSITION']).astype(np.float64)
        self.N = accessor(j, b, at['NORMAL']).astype(np.float64)
        self.UV = accessor(j, b, at['TEXCOORD_0']).astype(np.float64)
        self.J = accessor(j, b, at['JOINTS_0']).astype(np.int64)
        self.W = accessor(j, b, at['WEIGHTS_0']).astype(np.float64)
        self.F = accessor(j, b, self.prim['indices']).reshape(-1, 3).astype(np.int64)
        self.names = [j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
        self.mat = j['materials'][0]
        pbr = self.mat['pbrMetallicRoughness']

        def img(t):
            src = j['textures'][t['index']].get('source')
            return np.array(Image.open(io.BytesIO(buffer_view_bytes(j, b, j['images'][src]['bufferView']))).convert('RGB'))
        self.base = img(pbr['baseColorTexture'])
        self.R = self.base.shape[0]
        self.alpha = np.full(self.base.shape[:2], 255, np.uint8)
        self.mr = img(pbr['metallicRoughnessTexture']) if 'metallicRoughnessTexture' in pbr else np.full_like(self.base, (255, 200, 0))
        self.nrm = img(self.mat['normalTexture']) if 'normalTexture' in self.mat else np.full_like(self.base, (128, 128, 255))
        self.emi = np.zeros_like(self.base)
        self.nbody, self.fbody = len(self.V), len(self.F)
        cov = rasterize_uv(self.UV, self.F, self.R)[0]
        self.body_cov = cov
        self.occ = cv2.dilate(cov.astype(np.uint8), np.ones((11, 11), np.uint8))
        self.parts = []; self.log = []

    def joint(self, name): return self.names.index(name)

    def make_room(self, s):
        """Shrink the body's whole atlas into the top-left s*R square (uniform, so texel aspect is kept), freeing an
        L-shaped strip for the parts. Call before project_emissive / add_part."""
        R = self.R; n = int(round(R * s)); s = n / R
        for k in ('base', 'mr', 'nrm', 'emi'):
            im = getattr(self, k); out = np.zeros_like(im)
            out[:n, :n] = cv2.resize(im, (n, n), interpolation=cv2.INTER_AREA)
            out[n:, :] = out[n - 1:n, :]; out[:, n:] = out[:, n - 1:n]
            setattr(self, k, out)
        self.UV[:self.nbody] *= s
        cov = rasterize_uv(self.UV, self.F, R)[0]; self.body_cov = cov
        self.occ = cv2.dilate(cov.astype(np.uint8), np.ones((11, 11), np.uint8))
        self.occ[:n + 4, :n + 4] = 1
        self.log.append(f'body atlas shrunk to {n}x{n} (x{s:.2f}) to make room for parts')

    # ---- atlas ---------------------------------------------------------------------------------
    def free_space(self):
        return 1 - self.occ.mean()

    def allocate(self, w, h):
        occ = self.occ.astype(np.int32); R = self.R
        S = np.pad(occ, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
        if w > R or h > R: return None
        y = np.arange(0, R - h + 1, 4); x = np.arange(0, R - w + 1, 4)
        Y, X = np.meshgrid(y, x, indexing='ij')
        tot = S[Y + h, X + w] - S[Y, X + w] - S[Y + h, X] + S[Y, X]
        ok = np.argwhere(tot == 0)
        if not len(ok): return None
        yy, xx = Y[ok[0][0], ok[0][1]], X[ok[0][0], ok[0][1]]
        self.occ[yy:yy + h, xx:xx + w] = 1
        return int(xx), int(yy)

    def place_texture(self, rgba, emis, rough, metal, name):
        """Pack one part texture (H,W,4) into a free atlas hole; returns (x0, y0, w, h) of the usable area."""
        h, w = rgba.shape[:2]
        for s in np.arange(1.0, 0.3, -0.03):
            ww, hh = max(8, int(w * s)), max(8, int(h * s))
            r = self.allocate(ww + 6, hh + 6)
            if r: break
        else:
            raise RuntimeError(f'no atlas space for {name}')
        x0, y0 = r[0] + 3, r[1] + 3
        rs = lambda im, interp=cv2.INTER_AREA: cv2.copyMakeBorder(cv2.resize(im, (ww, hh), interpolation=interp), 3, 3, 3, 3, cv2.BORDER_REPLICATE)
        sl = (slice(y0 - 3, y0 + hh + 3), slice(x0 - 3, x0 + ww + 3))
        self.base[sl] = rs(rgba[:, :, :3]); self.alpha[sl] = rs(rgba[:, :, 3], cv2.INTER_LINEAR)
        self.emi[sl] = rs(emis if emis is not None else np.zeros_like(rgba[:, :, :3]))
        mr = np.zeros((h, w, 3), np.uint8); mr[..., 0] = 255
        mr[..., 1] = np.clip(rough * 255, 0, 255) if np.ndim(rough) == 0 else np.clip(rough * 255, 0, 255).astype(np.uint8)
        mr[..., 2] = np.clip(metal * 255, 0, 255) if np.ndim(metal) == 0 else np.clip(metal * 255, 0, 255).astype(np.uint8)
        self.mr[sl] = rs(mr)
        lum = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
        det = lum - cv2.GaussianBlur(lum, (0, 0), 4)
        gx = cv2.Sobel(det, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(det, cv2.CV_32F, 0, 1, ksize=3)
        nn = np.dstack([-gx * 3, gy * 3, np.ones_like(gx)]); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
        self.nrm[sl] = rs(((nn * 0.5 + 0.5) * 255).astype(np.uint8))
        self.log.append(f'{name}: texture {w}x{h} -> atlas {ww}x{hh} at ({x0},{y0}) scale {s:.2f}')
        return x0, y0, ww, hh

    def add_part(self, name, V, F, UV, joint, rgba, emis=None, rough=0.6, metal=0.0, rot90=False):
        if rot90:                     # store the texture turned 90 deg CCW (a long part in a wide strip)
            w = rgba.shape[1]
            rgba = np.ascontiguousarray(np.rot90(rgba)); emis = None if emis is None else np.ascontiguousarray(np.rot90(emis))
            UV = np.stack([UV[:, 1], 1 - UV[:, 0]], 1)
        x0, y0, ww, hh = self.place_texture(rgba, emis, rough, metal, name)
        R = self.R
        uv = np.stack([(x0 + UV[:, 0] * ww) / R, (y0 + UV[:, 1] * hh) / R], 1)
        self.parts.append(dict(name=name, V=np.asarray(V, float), F=np.asarray(F, np.int64), UV=uv, joint=self.joint(joint)))
        self.log.append(f'{name}: {len(F)} tris, {len(V)} verts, bone {joint}')

    # ---- emissive ---------------------------------------------------------------------------------
    def project_emissive(self, views, hue, smin, vmin, gain=1.5, min_facing=0.2, extra=None):
        """views: {dir: cut-out path} as for paint_from_views (front/back/left/right). Glow = cut-out pixels whose hue is
        in `hue` (deg) with saturation >= smin and value >= vmin; texels take the max glow over the views that see them.
        Returns the % of body texels that glow."""
        import trimesh
        from paint_from_views import fit_view, view_axes, bilinear, pad_charts
        V, F = self.V[:self.nbody], self.F[:self.fbody]
        mesh = trimesh.Trimesh(V, F, process=False)
        cov, t, bary = rasterize_uv(self.UV, F, self.R)
        tp = interp(V, F, t, bary); tn = interp(self.N[:self.nbody], F, t, bary)
        tn /= np.linalg.norm(tn, axis=-1, keepdims=True) + 1e-8
        samples, _ = trimesh.sample.sample_surface_even(mesh, 1_200_000)
        eps = 0.012 * mesh.extents.max()
        glow = np.zeros((len(tp), 3), np.float32)
        for name, path in views.items():
            img = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
            rgb8 = img[:, :, :3].astype(np.uint8)
            hsv = cv2.cvtColor(rgb8, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
            hh, ss, vv = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
            m = ((hh >= hue[0]) & (hh <= hue[1]) & (ss >= smin) & (vv >= vmin) & (img[:, :, 3] > 127)).astype(np.float32)
            m = cv2.GaussianBlur(m, (0, 0), 1.2) * 1.4
            em = np.dstack([img[:, :, :3] * np.clip(m, 0, 1)[..., None], img[:, :, 3]])
            d, right = view_axes(name)
            project, iou = fit_view(V, d, right, img[:, :, 3])
            h, w = img.shape[:2]
            sx, sy = project(samples)
            zb = np.full((h, w), -np.inf)
            ix, iy = np.clip(sx.astype(int), 0, w - 1), np.clip(sy.astype(int), 0, h - 1)
            np.maximum.at(zb, (iy, ix), samples @ d)
            zb = cv2.dilate(np.where(np.isfinite(zb), zb, -1e9).astype(np.float32), np.ones((3, 3), np.uint8))
            px, py = project(tp)
            jx, jy = np.clip(px.astype(int), 0, w - 1), np.clip(py.astype(int), 0, h - 1)
            vis = ((tp @ d) >= zb[jy, jx] - eps) & ((tn @ d) >= min_facing)
            s = bilinear(em, px, py)[:, :3] * vis[:, None]
            glow = np.maximum(glow, s.astype(np.float32))
            self.log.append(f'emissive {name}: fit IoU {iou:.2f}, art glow px {int((m > 0.5).sum())}')
        tex = np.zeros((self.R, self.R, 3), np.float32); tex[cov] = glow
        tex = np.clip(tex * gain, 0, 255).astype(np.uint8)
        tex = pad_charts(tex, cov, iters=4)
        if extra is not None: tex = np.maximum(tex, extra)
        self.emi = np.maximum(self.emi, tex)
        pct = (glow.max(1) * gain > 40).mean() * 100
        self.log.append(f'emissive: {pct:.2f}% of body texels glow')
        return pct

    # ---- write ---------------------------------------------------------------------------------
    def save(self, path, webp_q=90):
        j, b = self.j, self.b
        V = [self.V]; N = [self.N]; UV = [self.UV]; J = [self.J]; W = [self.W]; F = [self.F]; off = self.nbody
        for p in self.parts:
            n = len(p['V'])
            V.append(p['V']); N.append(vertex_normals(p['V'], p['F'])); UV.append(p['UV'])
            jj = np.zeros((n, 4), np.int64); jj[:, 0] = p['joint']; ww = np.zeros((n, 4)); ww[:, 0] = 1
            J.append(jj); W.append(ww); F.append(p['F'] + off); off += n
        V, N, UV, J, W, F = (np.vstack(x) for x in (V, N, UV, J, W, F))
        at = self.prim['attributes']; acc = j['accessors']
        jt = {5121: np.uint8, 5123: np.uint16}[acc[at['JOINTS_0']]['componentType']]
        data = {at['POSITION']: V.astype(np.float32), at['NORMAL']: N.astype(np.float32), at['TEXCOORD_0']: UV.astype(np.float32),
                at['JOINTS_0']: J.astype(jt), at['WEIGHTS_0']: W.astype(np.float32), self.prim['indices']: F.reshape(-1).astype(np.uint32)}
        rep = {}
        for ai, arr in data.items():
            a = acc[ai]; a['count'] = len(arr); a.pop('byteOffset', None)
            j['bufferViews'][a['bufferView']].pop('byteStride', None)
            rep[a['bufferView']] = np.ascontiguousarray(arr).tobytes()
            if ai == self.prim['indices']: a['componentType'] = 5125
            if ai == at['POSITION']: a['min'] = V.min(0).tolist(); a['max'] = V.max(0).tolist()
        # textures -> WebP via EXT_texture_webp
        def enc(im, lossless=False):
            bio = io.BytesIO(); Image.fromarray(im).save(bio, format='WEBP', quality=webp_q, lossless=lossless, method=6, alpha_quality=100)
            return bio.getvalue()
        pbr = self.mat['pbrMetallicRoughness']
        imgs = {'base': np.dstack([self.base, self.alpha]), 'mr': self.mr, 'nrm': self.nrm, 'emi': self.emi}
        slots = {'base': pbr['baseColorTexture'], 'mr': pbr.get('metallicRoughnessTexture'), 'nrm': self.mat.get('normalTexture')}
        new_images, new_textures = [], []
        for k, im in imgs.items():
            new_images.append(enc(im)); new_textures.append(k)
        # rebuild images/textures from scratch (old image bufferViews get emptied)
        for im in j.get('images', []):
            if 'bufferView' in im: rep[im['bufferView']] = b''
        j['images'] = []; j['textures'] = []
        for k, data_ in zip(new_textures, new_images):
            j['bufferViews'].append({'buffer': 0, 'byteOffset': 0, 'byteLength': 0}); bvi = len(j['bufferViews']) - 1
            rep[bvi] = data_
            j['images'].append({'bufferView': bvi, 'mimeType': 'image/webp'})
            j['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(j['images']) - 1}}})
        ti = {k: i for i, k in enumerate(new_textures)}
        pbr['baseColorTexture'] = {'index': ti['base']}
        pbr['metallicRoughnessTexture'] = {'index': ti['mr']}
        self.mat['normalTexture'] = {'index': ti['nrm']}
        self.mat['emissiveTexture'] = {'index': ti['emi']}; self.mat['emissiveFactor'] = [1, 1, 1]
        self.mat.pop('occlusionTexture', None)
        self.mat['alphaMode'] = 'MASK'; self.mat['alphaCutoff'] = 0.5; self.mat['doubleSided'] = True
        for key in ('extensionsUsed', 'extensionsRequired'):
            lst = j.setdefault(key, [])
            if 'EXT_texture_webp' not in lst: lst.append('EXT_texture_webp')
        # drop the emptied (old image) bufferViews and remap references
        blobs = [rep[i] if i in rep else buffer_view_bytes(j, b, i) for i in range(len(j['bufferViews']))]
        remap, keep = {}, []
        for i, d in enumerate(blobs):
            if len(d): remap[i] = len(keep); keep.append(i)
        j['bufferViews'] = [j['bufferViews'][i] for i in keep]
        for a in j['accessors']:
            if 'bufferView' in a: a['bufferView'] = remap[a['bufferView']]
        for im in j['images']: im['bufferView'] = remap[im['bufferView']]
        write_glb(path, j, b, {remap[i]: blobs[i] for i in keep})
        tris = len(F); self.log.append(f'wrote {path}: {tris} tris, {len(V)} verts, {os.path.getsize(path) / 1e6:.2f} MB')
        return tris
