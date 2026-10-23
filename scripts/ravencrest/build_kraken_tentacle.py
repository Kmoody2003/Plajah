"""
build_kraken_tentacle.py — River Kraken tentacle base GLBs (variants A and B) for Ravencrest's bridge fight.

Geometry is built to the brief's contract (docs/ravencrest-muse-brief-troll-kraken.md), not generated: every view on
the approved sheet shows the arm curled, and the contract wants it straight up +Y in rest pose with clean, tip-dense
edge loops for a 24-bone chain — an image-to-3D mesh would bake the curl in. The SURFACE comes from the approved art:
palette sampled from the sheet's material swatches, suckers textured with the sheet's macro sucker painting.

  Y-up, metres. Origin = waterline centre of the base; the arm rises 14 m along +Y (plus a 1.2 m flared skirt below
  the waterline for the emerge). Base Ø 1.6 m → tip Ø 0.1 m. Underside (two sucker rows) faces +Z, topside -Z.
  One PBR material: 2048² base + normal + packed ORM, emissive = greyscale teal-freckle mask (also written as PNG).
  No skeleton, no clips (Omie's finish).

Run with the Tela 3D env:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/ravencrest/build_kraken_tentacle.py
"""

import os
import sys

import cv2
import numpy as np
import trimesh
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHEET = os.path.join(ROOT, "Ravencrest Assets", "kraken_tentacle_sheet.webp")
OUT_DIR = os.path.join(ROOT, "public", "games", "ravencrest", "assets", "creatures", "bases")

L, SKIRT = 14.0, 1.2              # above / below the waterline
R_BASE, R_TIP = 0.8, 0.05
RINGS, SEGS = 168, 36
TEX = 2048
BODY_U = 0.78                     # body owns u ∈ [0, 0.78]; tiles live in the right-hand strip
SUCKER_TILE = (0.80, 0.0, 0.20)   # u0, v0, size (uv units)
CHITIN_TILE = (0.80, 0.25, 0.20)
BARNACLE_TILE = (0.80, 0.50, 0.20)
rng = np.random.default_rng(1847)


# ── palette + tiles from the approved sheet ─────────────────────────────────────────────────────────────────────
sheet = np.asarray(Image.open(SHEET).convert("RGB")).astype(np.float32)
SLATE = np.array([25, 37, 48], np.float32)
SLATE_HI = np.array([37, 44, 57], np.float32)
BRUISE = np.array([99, 75, 88], np.float32)
FLESH = np.array([163, 171, 183], np.float32)
FLESH_LO = np.array([102, 110, 125], np.float32)
WEED = np.array([25, 33, 36], np.float32)
TEAL = np.array([81, 179, 181], np.float32)
sucker_art = cv2.resize(sheet[865:1025, 885:1045], (410, 410), interpolation=cv2.INTER_CUBIC)   # macro close-up, rim to rim
barnacle_art = sheet[1135:1210, 1165:1490]


def radius_a(t):
    return R_TIP + (R_BASE - R_TIP) * np.clip(1 - t, 0, 1) ** 1.35


def radius_b(t):
    # thicker arm with a bulbous club before the tip
    return 1.2 * radius_a(t) + 0.30 * np.exp(-((t - 0.9) / 0.045) ** 2)


def ring_ys():
    """Ring heights: a flared skirt below the waterline, then loops packed ever tighter toward the tip."""
    skirt = np.linspace(-SKIRT, 0.0, 7)[:-1]
    u = np.linspace(0, 1, RINGS - len(skirt))
    return np.concatenate([skirt, L * (1 - (1 - u) ** 1.6)])


def section(theta, r):
    """Cross-section: underside (+Z, θ=0) slightly flattened like an octopus arm."""
    flat = 1 - 0.14 * np.clip(np.cos(theta), 0, 1) ** 2
    return np.sin(theta) * r, np.cos(theta) * r * flat


def build_body(radius):
    ys = ring_ys()
    th = np.linspace(0, 2 * np.pi, SEGS + 1)           # seam at the underside centre, between the sucker rows
    V, UV = [], []
    for y in ys:
        t = max(y, 0) / L
        r = radius(t) * (1 + 0.35 * max(-y, 0) / SKIRT) ** 1.5 if y < 0 else radius(t)
        x, z = section(th, r)
        for k in range(SEGS + 1):
            V.append((x[k], y, z[k]))
            UV.append((th[k] / (2 * np.pi) * BODY_U, (y + SKIRT) / (L + SKIRT)))
    F = []
    n = SEGS + 1
    for i in range(len(ys) - 1):
        for k in range(SEGS):
            a, b, c, d = i * n + k, i * n + k + 1, (i + 1) * n + k, (i + 1) * n + k + 1
            F += [(a, b, c), (b, d, c)]                  # outward: (+θ) × (+y)
    V, UV, F = np.array(V), np.array(UV), np.array(F)
    # caps: tip point + bottom fan
    tip = len(V); V = np.vstack([V, [0, L + 0.03, 0]]); UV = np.vstack([UV, [BODY_U / 2, 1.0]])
    last = (len(ys) - 1) * n
    F = np.vstack([F, [(last + k, last + k + 1, tip) for k in range(SEGS)]])
    bot = len(V); V = np.vstack([V, [0, -SKIRT, 0]]); UV = np.vstack([UV, [BODY_U / 2, 0.0]])
    F = np.vstack([F, [(k + 1, k, bot) for k in range(SEGS)]])
    return V, UV, F


def surface_frame(radius, y, theta):
    t = y / L
    r = radius(t)
    x, z = section(np.array([theta]), r)
    p = np.array([x[0], y, z[0]])
    dth = 1e-3
    x2, z2 = section(np.array([theta + dth]), r)
    tang_t = np.array([x2[0] - x[0], 0, z2[0] - z[0]]); tang_t /= np.linalg.norm(tang_t)
    dy = 0.02
    r2 = radius(min(1, (y + dy) / L))
    x3, z3 = section(np.array([theta]), r2)
    tang_y = np.array([x3[0] - x[0], dy, z3[0] - z[0]]); tang_y /= np.linalg.norm(tang_y)
    nrm = np.cross(tang_t, tang_y); nrm /= np.linalg.norm(nrm)
    if nrm @ np.array([p[0], 0, p[2]]) < 0:
        nrm = -nrm
    return p, nrm, tang_y


def sucker_diameter(t):
    return 0.025 + 0.245 * (1 - t) ** 1.3       # coin at the tip → dinner plate at the base


def sucker_layout(radius):
    """Two staggered rows either side of the underside centre. → [(y, theta, d)]"""
    out = []
    for row, sgn in enumerate((-1, 1)):
        y = 0.35 + row * 0.12
        while y < L * 0.975:
            d = sucker_diameter(y / L)
            theta = sgn * (0.30 + 0.9 * d / max(radius(y / L), 0.05)) * 0.55
            out.append((y, theta, d))
            y += d * 1.18
    return out


# sucker cup profile (ρ relative to the rim radius, h relative to the diameter)
CUP = [(1.0, -0.12), (1.0, 0.22), (0.84, 0.34), (0.56, 0.26), (0.0, 0.04)]
CUP_SEG = 8


def build_sucker(p, nrm, ty, d, uv_tile):
    bx = np.cross(nrm, ty)
    rr = d / 2
    V, UV = [], []
    u0, v0, s = uv_tile
    for rho, h in CUP:
        for k in range(CUP_SEG):
            ph = 2 * np.pi * k / CUP_SEG
            V.append(p + (np.cos(ph) * bx + np.sin(ph) * ty) * rho * rr + nrm * h * d)
            UV.append((u0 + s * (0.5 + 0.46 * rho * np.cos(ph)), v0 + s * (0.5 + 0.46 * rho * np.sin(ph))))
    F = []
    for i in range(len(CUP) - 1):
        for k in range(CUP_SEG):
            a, b = i * CUP_SEG + k, i * CUP_SEG + (k + 1) % CUP_SEG
            c, e = a + CUP_SEG, b + CUP_SEG
            F.append((a, c, b))                          # outer wall faces out, cup faces up into the opening
            if i < len(CUP) - 2:                         # the last ring is the cup's centre point: one tri per segment
                F.append((b, c, e))
    return np.array(V), np.array(UV), np.array(F)


def build_cone(p, axis, base_r, length, bend, uv_tile, segs=6, rings=5):
    """A spike/hook: a cone swept along an arc that bends toward `bend`."""
    V, UV = [], []
    u0, v0, s = uv_tile
    side = np.cross(axis, bend)
    if np.linalg.norm(side) < 1e-6:                      # straight spike: any perpendicular will do
        side = np.cross(axis, [0.0, 0.0, 1.0] if abs(axis[2]) < 0.9 else [1.0, 0.0, 0.0])
    side /= np.linalg.norm(side)
    for i in range(rings):
        f = i / (rings - 1)
        c = p + axis * length * f + bend * length * 0.55 * f * f
        tng = axis + bend * 1.1 * f; tng /= np.linalg.norm(tng)
        a1 = np.cross(tng, side); a1 /= np.linalg.norm(a1) + 1e-9
        r = base_r * (1 - f) + 0.004
        for k in range(segs):
            ph = 2 * np.pi * k / segs
            V.append(c + (np.cos(ph) * side + np.sin(ph) * a1) * r)
            UV.append((u0 + s * (k + 0.5) / segs, v0 + s * f))
    F = []
    for i in range(rings - 1):
        for k in range(segs):
            a, b = i * segs + k, i * segs + (k + 1) % segs
            F += [(a, b, a + segs), (b, b + segs, a + segs)]
    return np.array(V), np.array(UV), np.array(F)


# ── textures ────────────────────────────────────────────────────────────────────────────────────────────────────
def fbm(h, w, octaves=5, base=8, seed=0):
    g = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        cells = base * 2 ** o
        grid = g.random((max(2, cells * h // w), cells)).astype(np.float32)
        out += cv2.resize(grid, (w, h), interpolation=cv2.INTER_CUBIC) * amp
        tot += amp; amp *= 0.5
    out /= tot
    # wrap horizontally (around the arm) so the seam between the sucker rows doesn't show
    roll = np.roll(out, w // 2, axis=1)
    wgt = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(w) / w))[None, :]
    return out * wgt + roll * (1 - wgt)


def uv_to_px(u, v):
    return u * TEX, (1 - v) * TEX


def stamp(img, cx, cy, rx, ry, tile, alpha=None, mode="over"):
    """Stamp `tile` (h,w,C) as an ellipse centred (cx,cy) with radii (rx,ry) px."""
    x0, x1 = int(cx - rx), int(cx + rx) + 1
    y0, y1 = int(cy - ry), int(cy + ry) + 1
    if x1 - x0 < 2 or y1 - y0 < 2:
        return
    t = cv2.resize(tile, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    m = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) <= 1
    yy, xx = yy % img.shape[0], xx % img.shape[1]
    if t.ndim == 2:
        t = t[..., None]
    img[yy[m], xx[m]] = t[m] if img.ndim == 3 else t[m][:, 0]


def paint(radius, layout, variant):
    H = W = TEX
    bw = int(BODY_U * TEX)
    base = np.zeros((H, W, 3), np.float32)
    height = np.zeros((H, W), np.float32)
    rough = np.full((H, W), 0.32, np.float32)
    emis = np.zeros((H, W), np.float32)

    # body: θ across, y down the image (top row = tip)
    th = (np.arange(bw) + 0.5) / bw * 2 * np.pi
    y = (1 - (np.arange(H) + 0.5) / H) * (L + SKIRT) - SKIRT
    TH, Y = np.meshgrid(th, y)
    under = np.clip((np.cos(TH) - 0.15) / 0.55, 0, 1) ** 1.2          # 1 on the sucker side
    mott = fbm(H, bw, 5, 6, seed=1)
    fine = fbm(H, bw, 4, 48, seed=2)
    bruise = np.clip((mott - 0.52) * 5, 0, 1)
    top = SLATE[None, None] + (SLATE_HI - SLATE)[None, None] * fine[..., None] * 1.6
    top = top * (1 - bruise[..., None] * 0.85) + BRUISE[None, None] * bruise[..., None] * 0.85
    # cold grey-violet between the suckers — the pale flesh tone belongs to the suckers themselves
    belly_lo = np.array([62, 64, 80], np.float32)
    belly = belly_lo[None, None] + (FLESH_LO - belly_lo)[None, None] * (0.25 + 0.75 * fine[..., None])
    belly = belly * (1 - bruise[..., None] * 0.35) + BRUISE[None, None] * bruise[..., None] * 0.35
    col = top * (1 - under[..., None]) + belly * under[..., None]
    # base: weed-dark crust + barnacle grime over the first ~2 m above the water, everything below the waterline
    grime = np.clip(1 - (Y - 0.3) / 2.2, 0, 1) * np.clip(fbm(H, bw, 4, 10, seed=3) * 1.8 - 0.35, 0, 1)
    grime = np.maximum(grime, np.clip(-Y / 0.4, 0, 1) * 0.7)
    col = col * (1 - grime[..., None]) + WEED[None, None] * grime[..., None]
    # scars: short pale/dark gouges on the topside
    for _ in range(140):
        yy = rng.uniform(0.5, L * 0.9)
        cy = (1 - (yy + SKIRT) / (L + SKIRT)) * H
        cx = rng.uniform(0.3, 0.7) * bw
        ln = rng.uniform(12, 46); ang = rng.uniform(-0.6, 0.6)
        p0 = (int(cx), int(cy)); p1 = (int(cx + ln * np.sin(ang)), int(cy + ln * np.cos(ang)))
        cv2.line(col, p0, p1, (12, 14, 20), 2, cv2.LINE_AA)
        cv2.line(col, (p0[0] + 2, p0[1]), (p1[0] + 2, p1[1]), (70, 72, 86), 1, cv2.LINE_AA)
        cv2.line(height, p0, p1, -1.0, 2, cv2.LINE_AA)
    base[:, :bw] = col
    # transverse folds (rings of muscle) + mottled relief
    height[:, :bw] += 0.35 * np.sin(Y * 2 * np.pi / np.maximum(0.06, radius(np.clip(Y / L, 0, 1)) * 0.5)) * (1 - under * 0.6)
    height[:, :bw] += (mott - 0.5) * 1.2 + (fine - 0.5) * 0.6
    rough[:, :bw] = 0.28 + 0.25 * grime + 0.08 * (1 - fine)

    # teal freckles along both side seams (between topside and suckers) + a scatter on the underside
    for side in (np.pi / 2, 3 * np.pi / 2):
        for _ in range(650):
            yy = rng.uniform(-0.2, L * 0.97)
            t = max(yy, 0) / L
            spread = rng.normal(0, 0.045)
            cx = ((side + spread) % (2 * np.pi)) / (2 * np.pi) * bw
            cy = (1 - (yy + SKIRT) / (L + SKIRT)) * H
            rr = max(1.0, 2.6 * (1 - t) + rng.uniform(0, 0.9))
            cv2.circle(emis, (int(cx), int(cy)), int(round(rr)), float(rng.uniform(0.55, 1.0)), -1, cv2.LINE_AA)
    for _ in range(500):
        yy = rng.uniform(0, L * 0.9)
        cx = (rng.normal(0, 0.35) % (2 * np.pi)) / (2 * np.pi) * bw
        cy = (1 - (yy + SKIRT) / (L + SKIRT)) * H
        cv2.circle(emis, (int(cx), int(cy)), 1, float(rng.uniform(0.3, 0.7)), -1, cv2.LINE_AA)
    emis = cv2.GaussianBlur(emis, (0, 0), 0.7)
    base = base * (1 - emis[..., None] * 0.8) + TEAL[None, None] * emis[..., None] * 0.8

    # small suckers (texture only — geometry for the big ones), stamped from the macro painting
    sucker_rgb = sucker_art
    sucker_h = cv2.cvtColor(sucker_art, cv2.COLOR_RGB2GRAY) / 255.0
    for (yy, theta, d) in layout:
        if d >= GEO_SUCKER_MIN:
            continue
        r = radius(yy / L)
        cx = (theta % (2 * np.pi)) / (2 * np.pi) * bw
        cy = (1 - (yy + SKIRT) / (L + SKIRT)) * H
        rx = (d / 2) / (2 * np.pi * r) * bw
        ry = (d / 2) / (L + SKIRT) * H
        stamp(base, cx, cy, max(rx, 1.5), max(ry, 1.0), sucker_rgb)
        stamp(height, cx, cy, max(rx, 1.5), max(ry, 1.0), (sucker_h - 0.5) * 2.0)

    # tiles: sucker cup (macro painting) and chitin (hooks/barnacles)
    u0, v0, s = SUCKER_TILE
    x0, y1 = uv_to_px(u0, v0); x1, y0 = uv_to_px(u0 + s, v0 + s)
    tile = cv2.resize(sucker_art, (int(x1) - int(x0), int(y1) - int(y0)))
    base[int(y0):int(y1), int(x0):int(x1)] = tile
    height[int(y0):int(y1), int(x0):int(x1)] = (cv2.cvtColor(tile, cv2.COLOR_RGB2GRAY) / 255.0 - 0.5) * 2.5
    rough[int(y0):int(y1), int(x0):int(x1)] = 0.3
    u0, v0, s = CHITIN_TILE
    x0, y1 = uv_to_px(u0, v0); x1, y0 = uv_to_px(u0 + s, v0 + s)
    hh, ww = int(y1) - int(y0), int(x1) - int(x0)
    grad = np.linspace(0, 1, hh)[::-1, None, None]                     # v=0 (root) bottom → tip top
    bone = FLESH[None, None] * (0.75 + 0.45 * grad) + np.array([12, 6, 0], np.float32)
    base[int(y0):int(y1), int(x0):int(x1)] = np.clip(bone, 0, 255)
    rough[int(y0):int(y1), int(x0):int(x1)] = 0.45
    # barnacles: the sheet's own barnacle swatch, lifted a little so the shells read against the slate
    u0, v0, s = BARNACLE_TILE
    x0, y1 = uv_to_px(u0, v0); x1, y0 = uv_to_px(u0 + s, v0 + s)
    barn = cv2.resize(barnacle_art, (int(x1) - int(x0), int(y1) - int(y0)))
    base[int(y0):int(y1), int(x0):int(x1)] = np.clip(barn * 1.5 + 14, 0, 255)
    height[int(y0):int(y1), int(x0):int(x1)] = (cv2.cvtColor(barn, cv2.COLOR_RGB2GRAY) / 255.0 - 0.2) * 2.0
    rough[int(y0):int(y1), int(x0):int(x1)] = 0.6
    rough[int(y0):int(y1), int(x0):int(x1)] = 0.45

    # normal from height (tangent space: +u around the arm, +v up the arm)
    hb = cv2.GaussianBlur(height, (0, 0), 1.0)
    gx = cv2.Sobel(hb, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(hb, cv2.CV_32F, 0, 1, ksize=3)
    n = np.dstack([-gx * 1.6, gy * 1.6, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    normal = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    orm = (np.dstack([np.ones_like(rough), np.clip(rough, 0.05, 1), np.zeros_like(rough)]) * 255).astype(np.uint8)
    return np.clip(base, 0, 255).astype(np.uint8), normal, orm, (np.clip(emis, 0, 1) * 255).astype(np.uint8)


GEO_SUCKER_MIN = 0.085    # suckers at least this wide get real cups; smaller ones are painted


def build(variant):
    radius = radius_a if variant == "a" else radius_b
    parts_v, parts_uv, parts_f = [], [], []

    def add(v, uv, f):
        off = sum(len(p) for p in parts_v)
        parts_v.append(v); parts_uv.append(uv); parts_f.append(f + off)

    add(*build_body(radius))
    layout = sucker_layout(radius)
    for (y, theta, d) in layout:
        if d >= GEO_SUCKER_MIN:
            p, nrm, ty = surface_frame(radius, y, theta)
            add(*build_sucker(p - nrm * 0.01, nrm, ty, d, SUCKER_TILE))
    # barnacle clusters near the base, on the topside and flanks
    for _ in range(46):
        y = rng.uniform(-0.2, 2.1)
        theta = rng.uniform(np.pi * 0.45, np.pi * 1.55)
        p, nrm, ty = surface_frame(radius, max(y, 0.01), theta)
        add(*build_cone(p - nrm * 0.02, nrm, rng.uniform(0.05, 0.11), rng.uniform(0.06, 0.12), ty * 0.0, BARNACLE_TILE, segs=6, rings=3))
    if variant == "b":
        # hooked spikes around the club, raking back toward the base like a squid's club hooks
        for i in range(12):
            y = L * rng.uniform(0.84, 0.965)
            theta = (np.pi * 0.55 + i * 2 * np.pi / 12 * 0.9 + rng.normal(0, 0.12)) % (2 * np.pi)
            p, nrm, ty = surface_frame(radius, y, theta)
            add(*build_cone(p - nrm * 0.03, nrm, rng.uniform(0.045, 0.07), rng.uniform(0.28, 0.42), -ty, CHITIN_TILE))
    V, UV, F = np.vstack(parts_v), np.vstack(parts_uv), np.vstack(parts_f)

    base, normal, orm, emis = paint(radius, layout, variant)
    mat = trimesh.visual.material.PBRMaterial(
        name="kraken_skin", baseColorTexture=Image.fromarray(base), normalTexture=Image.fromarray(normal),
        metallicRoughnessTexture=Image.fromarray(orm), occlusionTexture=Image.fromarray(orm),
        emissiveTexture=Image.fromarray(np.dstack([emis] * 3)), emissiveFactor=[0.32, 0.86, 0.84],
        metallicFactor=1.0, roughnessFactor=1.0)
    mesh = trimesh.Trimesh(V, F, process=False, visual=trimesh.visual.TextureVisuals(uv=UV, material=mat))
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"kraken_tentacle_{variant}.glb")
    mesh.export(out)
    Image.fromarray(emis).save(os.path.join(OUT_DIR, f"kraken_tentacle_{variant}_emissive_mask.png"))
    geo = sum(1 for s in layout if s[2] >= GEO_SUCKER_MIN)
    print(f"[kraken] {variant}: {len(F)} tris, {len(V)} verts, suckers {geo} modelled + {len(layout) - geo} painted, "
          f"bounds {np.round(mesh.bounds[0], 2)} to {np.round(mesh.bounds[1], 2)}, {os.path.getsize(out) / 1e6:.1f} MB")


if __name__ == "__main__":
    for v in (sys.argv[1:] or ["a", "b"]):
        build(v)
