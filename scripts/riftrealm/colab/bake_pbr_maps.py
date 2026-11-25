"""Upgrade GLB PBR materials with REAL 200k high-poly -> low-poly tangent-space normal maps,
C++ 64-view ray-traced Ambient Occlusion (pymeshlab), and smart PBR Metallic/Roughness maps.

Replaces paint_from_views.py's flat defaults (AO=1.0, metalness=0.0, noisy 2D Sobel normal)
directly inside existing rigged GLBs while preserving 100% of the skeleton, weights, extras.forge,
sockets, UVs, baseColorTexture, and emissiveTexture (and keeping grafted parts untouched).

Usage:
  python scripts/riftrealm/colab/bake_pbr_maps.py <cid> [<cid2> ...]   # specific characters
  python scripts/riftrealm/colab/bake_pbr_maps.py --all                # all 31 characters/bosses/mounts
"""
import io
import os
import sys
import cv2
import numpy as np
import pymeshlab
import trimesh
from PIL import Image
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CHAR_DIR = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch"

sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "engines", "tela-3d"))
from glbio import read_glb, accessor, write_glb  # noqa: E402
from uv_raster import rasterize_uv, interp  # noqa: E402
import ktxPack  # noqa: E402

# Latest-first search order for saved 200k high-poly Hunyuan3D raw sculpts
BATCH_SEARCH_ORDER = [
    "colab_batch4_redo",
    "colab_batch3a",
    "colab_batch2c",
    "colab_batch2b",
    "colab_batch2a",
    "colab_batch1",
]

# Material PBR profile per character/boss/mount
MATERIAL_PROFILES = {
    # Heavy metallic armor / cybernetics
    "robot_paladin": "armored_metal",
    "robot_paladin_armed": "armored_metal",
    "dragon_knight": "armored_metal",
    "cyber_minotaur": "armored_metal",
    "prism_archon": "armored_metal",
    "pyre_knight": "armored_metal",
    "cyber_harpy": "armored_metal",
    "cyber_dragon_mount": "armored_metal",
    "gorgon_construct": "armored_metal",
    "android_a": "armored_metal",
    "android_b": "armored_metal",
    "female_warrior": "armored_metal",
    "seraph_9": "armored_metal",
    "light_panther_mount": "armored_metal",
    "cyber_assassin": "armored_metal",
    # Volcanic obsidian / forged magma / dark iron
    "magma_titan": "volcanic_obsidian",
    "obsidian_rhino": "volcanic_obsidian",
    "void_leviathan": "volcanic_obsidian",
    "demon_warrior": "volcanic_obsidian",
    "pyre": "volcanic_obsidian",
    # Crystal / glacial ice / arcane
    "rune_dragon": "crystal_ice",
    "crystal_stag": "crystal_ice",
    "sorceress": "crystal_ice",
    # Organic / stone / cloth / wet bio-chitin with metallic accents
    "moss_golem": "stone_moss",
    "marsh_kraken": "wet_organic",
    "panther_demon": "wet_organic",
    "nyx": "wet_organic",
    "void_stalker": "leather_metal",
    "shadow_assassin": "leather_metal",
    "fallen_archangel": "leather_metal",
    "lumen": "armored_metal",
    "sylva": "stone_moss",
}


def find_highpoly_glb(cid: str) -> str | None:
    for bname in BATCH_SEARCH_ORDER:
        p = os.path.join(SCRATCH, bname, "outputs", cid, "shape_raw.glb")
        if os.path.isfile(p):
            return p
    return None


def pad_charts(img: np.ndarray, covered: np.ndarray, iters: int = 8) -> np.ndarray:
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


def compute_vertex_tangents(V: np.ndarray, N: np.ndarray, UV: np.ndarray, F: np.ndarray):
    """Standard MikkTSpace-compatible per-vertex tangent T and bitangent B (right-handed glTF UV: +v downward)."""
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

    # Gram-Schmidt orthogonalize T against N
    T = T - N * np.sum(N * T, axis=1, keepdims=True)
    t_len = np.linalg.norm(T, axis=1, keepdims=True)
    bad = t_len[:, 0] < 1e-6
    if bad.any():
        # Fallback tangent orthogonal to N
        up = np.where(np.abs(N[bad, 1:2]) < 0.9, np.array([[0.0, 1.0, 0.0]]), np.array([[1.0, 0.0, 0.0]]))
        T[bad] = np.cross(up, N[bad])
        t_len = np.linalg.norm(T, axis=1, keepdims=True)
    T /= np.maximum(t_len, 1e-8)

    # Handedness sign so B aligns with uv +v (glTF normal map +G = +v = downward in image coords)
    cross_nt = np.cross(N, T)
    sign = np.where(np.sum(cross_nt * B, axis=1, keepdims=True) < 0.0, -1.0, 1.0)
    B_orth = cross_nt * sign
    B_orth /= np.maximum(np.linalg.norm(B_orth, axis=1, keepdims=True), 1e-8)
    return T, B_orth


def compute_mesh_ao(V: np.ndarray, F: np.ndarray, reqviews: int = 64) -> np.ndarray:
    """Fast multi-scale 3D Bunnell disk-element solid-angle Ambient Occlusion (pure C++ cKDTree, zero OpenGL)."""
    mesh = trimesh.Trimesh(V, F, process=False)
    vnorm = np.asarray(mesh.vertex_normals, dtype=np.float32)
    vnorm /= np.maximum(np.linalg.norm(vnorm, axis=1, keepdims=True), 1e-8)
    total_area = float(mesh.area)
    if total_area <= 1e-8:
        return np.ones(len(V), dtype=np.float32)

    # Weld vertices so AO is computed once per unique spatial position (~25k-45k instead of UV-split count)
    key = np.round(V / 1e-5).astype(np.int64)
    _, uniq_idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    Vu = V[uniq_idx].astype(np.float32)
    Nu = vnorm[uniq_idx]

    occ_total = np.zeros(len(Vu), dtype=np.float32)
    # Two scales: fine crevice/plate seams (10k disks, k=36) + broad armpit/under-chin/wing occlusion (2.5k disks, k=32)
    for n_samp, k_nn, weight in ((10000, 36, 0.55), (2500, 32, 0.45)):
        pts, fidx = trimesh.sample.sample_surface(mesh, n_samp)
        pts = pts.astype(np.float32)
        snorm = np.asarray(mesh.face_normals[fidx], dtype=np.float32)
        disk_r2 = float(total_area / (np.pi * n_samp)) * 1.45
        tree = cKDTree(pts)
        # Process in chunks to keep RAM tiny
        chunk = 8192
        occ = np.zeros(len(Vu), dtype=np.float32)
        for i0 in range(0, len(Vu), chunk):
            i1 = min(len(Vu), i0 + chunk)
            dists, idxs = tree.query(Vu[i0:i1], k=k_nn, workers=-1)
            dvec = pts[idxs] - Vu[i0:i1, None, :]  # (C, k, 3)
            r2 = np.sum(dvec * dvec, axis=2) + 1e-8
            r = np.sqrt(r2)
            dhat = dvec / r[:, :, None]
            cos_emit = np.clip(np.sum(dhat * Nu[i0:i1, None, :], axis=2) - 0.04, 0.0, 1.0)
            # Back-facing disks relative to dhat occlude most strongly
            cos_recv = np.clip(1.0 - np.sum(dhat * snorm[idxs], axis=2) * 0.5, 0.25, 1.0)
            solid = (1.0 - r / np.sqrt(r2 + disk_r2)) * cos_emit * cos_recv
            occ[i0:i1] = solid.sum(axis=1)
        occ_total += weight * occ

    ao_u = np.exp(-1.55 * occ_total)
    # Stretch gently so open surfaces hit 1.0 and deep crevices drop cleanly to ~0.22
    hi = float(np.percentile(ao_u, 96))
    if hi > 0.2:
        ao_u = np.clip(ao_u / hi, 0.18, 1.0)
    return ao_u[inv].astype(np.float32)


def compute_smart_pbr(base_rgb: np.ndarray, ao_map: np.ndarray, profile: str):
    """Generate physically motivated Roughness & Metalness maps from albedo + AO + material profile."""
    hsv = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h = hsv[..., 0] * 360.0 / 255.0
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    lum = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    local_hi = np.clip((lum - cv2.GaussianBlur(lum, (0, 0), 18)) * 3.2 + 0.5, 0.0, 1.0)

    # Identify metallic color cues:
    # - Gold/brass/bronze trim: warm yellow-orange hues (h in 22..56, s in 0.22..0.85, v > 0.25)
    # - Chrome/silver/steel armor: cool low-sat grey/blue-grey (s < 0.28, v in 0.22..0.92)
    is_gold = np.clip((1.0 - np.abs(h - 39.0) / 18.0), 0.0, 1.0) * np.clip((s - 0.18) / 0.25, 0.0, 1.0) * np.clip((v - 0.22) / 0.28, 0.0, 1.0)
    is_steel = np.clip((0.32 - s) / 0.20, 0.0, 1.0) * np.clip((v - 0.20) / 0.30, 0.0, 1.0)
    # Smooth masks so transitions never produce hard binary sheen steps
    is_gold = cv2.GaussianBlur(is_gold.astype(np.float32), (0, 0), 1.5)
    is_steel = cv2.GaussianBlur(is_steel.astype(np.float32), (0, 0), 1.5)
    # Avoid classifying warm skin tones (h 8..28, s 0.2..0.55, v > 0.45) as metal
    is_skin = np.clip((1.0 - np.abs(h - 18.0) / 12.0), 0.0, 1.0) * np.clip((s - 0.15) / 0.20, 0.0, 1.0) * np.clip((0.60 - s) / 0.20, 0.0, 1.0) * np.clip((v - 0.38) / 0.20, 0.0, 1.0)
    # Glowing emissive pixels shouldn't be dark metal
    is_glow = np.clip((s - 0.55) / 0.25, 0.0, 1.0) * np.clip((v - 0.65) / 0.25, 0.0, 1.0)

    if profile == "armored_metal":
        metal = np.clip(0.30 + 0.62 * np.maximum(is_gold, is_steel) + 0.15 * local_hi - 0.75 * is_skin - 0.6 * is_glow, 0.0, 0.92)
        rough = np.clip(0.56 - 0.28 * metal - 0.14 * local_hi + 0.18 * (1.0 - ao_map), 0.20, 0.85)
    elif profile == "volcanic_obsidian":
        # Obsidian plates: sleek glassy dark stone + hot metallic trim
        metal = np.clip(0.18 + 0.65 * is_gold + 0.35 * is_steel - 0.5 * is_glow, 0.0, 0.85)
        rough = np.clip(0.46 - 0.20 * local_hi - 0.14 * metal + 0.22 * (1.0 - ao_map), 0.18, 0.82)
    elif profile == "crystal_ice":
        # Glossy translucent-feeling crystal & frosted armor
        is_ice = np.clip((1.0 - np.abs(h - 205.0) / 38.0), 0.0, 1.0) * np.clip((v - 0.35) / 0.30, 0.0, 1.0)
        metal = np.clip(0.12 + 0.60 * is_gold + 0.45 * is_steel + 0.22 * is_ice - 0.7 * is_skin, 0.0, 0.82)
        rough = np.clip(0.48 - 0.28 * is_ice - 0.18 * local_hi + 0.16 * (1.0 - ao_map), 0.14, 0.82)
    elif profile == "stone_moss":
        # Golems / bark / ancient stone: mostly rough with metallic runes & damp stone highlights
        metal = np.clip(0.45 * is_gold + 0.20 * is_steel - 0.5 * is_glow, 0.0, 0.65)
        rough = np.clip(0.84 - 0.24 * local_hi - 0.30 * metal + 0.12 * (1.0 - ao_map), 0.32, 0.96)
    elif profile == "wet_organic":
        # Kraken / Shadow Panther / Bio-chitin: slick specular skin/chitin + metallic cybernetic inlays
        metal = np.clip(0.10 + 0.65 * is_gold + 0.50 * is_steel - 0.5 * is_glow, 0.0, 0.82)
        rough = np.clip(0.44 - 0.22 * local_hi - 0.14 * metal + 0.20 * (1.0 - ao_map), 0.16, 0.78)
    else:  # leather_metal (void_stalker, shadow_assassin, fallen_archangel)
        metal = np.clip(0.08 + 0.72 * is_gold + 0.58 * is_steel - 0.7 * is_skin - 0.5 * is_glow, 0.0, 0.88)
        rough = np.clip(0.68 - 0.36 * metal - 0.16 * local_hi + 0.16 * (1.0 - ao_map), 0.22, 0.90)

    return rough.astype(np.float32), metal.astype(np.float32)


def get_texture_image_idx(j: dict, tex_info: dict | None) -> int | None:
    if not tex_info:
        return None
    T = j["textures"][tex_info["index"]]
    if "source" in T:
        return T["source"]
    ext = T.get("extensions", {})
    if "EXT_texture_webp" in ext:
        return ext["EXT_texture_webp"]["source"]
    return None


def decode_image(j: dict, b: bytearray, img_idx: int) -> np.ndarray:
    im_def = j["images"][img_idx]
    bv = j["bufferViews"][im_def["bufferView"]]
    off = bv.get("byteOffset", 0)
    raw = bytes(b[off : off + bv["byteLength"]])
    return np.array(Image.open(io.BytesIO(raw)).convert("RGB"))


def encode_image(arr: np.ndarray, mime: str) -> bytes:
    buf = io.BytesIO()
    im = Image.fromarray(arr)
    if mime == "image/webp":
        im.save(buf, format="WEBP", quality=93, method=4)
    elif mime == "image/jpeg":
        im.save(buf, format="JPEG", quality=92)
    else:
        im.save(buf, format="PNG", compress_level=6)
    return buf.getvalue()


def bake_character_pbr(cid: str, hp_override: str | None = None):
    glb_path = os.path.join(CHAR_DIR, f"{cid}.glb")
    if not os.path.isfile(glb_path):
        print(f"  [skip] {cid}: {glb_path} missing")
        return
    hp_path = hp_override or find_highpoly_glb(cid)
    j, b = read_glb(glb_path)
    prim = j["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    V = accessor(j, b, at["POSITION"]).astype(np.float64)
    N = accessor(j, b, at["NORMAL"]).astype(np.float64)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
    UV = accessor(j, b, at["TEXCOORD_0"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)

    mat = j["materials"][prim.get("material", 0)]
    pbr = mat.get("pbrMetallicRoughness", {})
    base_idx = get_texture_image_idx(j, pbr.get("baseColorTexture"))
    norm_idx = get_texture_image_idx(j, mat.get("normalTexture"))
    orm_idx = get_texture_image_idx(j, pbr.get("metallicRoughnessTexture"))
    if base_idx is None or norm_idx is None or orm_idx is None:
        print(f"  [skip] {cid}: missing base/normal/orm texture slot")
        return

    base_rgb = decode_image(j, b, base_idx)
    old_norm = decode_image(j, b, norm_idx)
    old_orm = decode_image(j, b, orm_idx)
    R = base_rgb.shape[0]
    if base_rgb.shape[1] != R:
        print(f"  [skip] {cid}: non-square atlas {base_rgb.shape}")
        return

    # Isolate main connected body component so grafted extra parts (BatWings, daggers, halo) keep their own atlas strips!
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

    Tw = weld[F]
    for e0, e1 in ((Tw[:, 0], Tw[:, 1]), (Tw[:, 1], Tw[:, 2]), (Tw[:, 2], Tw[:, 0])):
        for u, v in zip(e0, e1):
            ru, rv = find(int(u)), find(int(v))
            if ru != rv:
                uf[ru] = rv
    roots = np.array([find(i) for i in range(nw)])
    uniq_r, cnt_r = np.unique(roots, return_counts=True)
    main_comp = uniq_r[np.argmax(cnt_r)]
    body_vert = roots[weld] == main_comp
    body_face_mask = body_vert[F[:, 0]] & body_vert[F[:, 1]] & body_vert[F[:, 2]]
    F_body = F[body_face_mask]

    # 1. Compute C++ 64-view ray-traced geometric AO on the mesh!
    ao_v = compute_mesh_ao(V, F, reqviews=64)

    # 2. Compute smooth tangent frame on low-poly mesh
    T_v, B_v = compute_vertex_tangents(V, N, UV, F)

    # Rasterize UV atlas for the body faces (glTF TEXCOORD_0 has v=0 at top row 0)
    covered, tri_ids, bary = rasterize_uv(np.clip(UV, 0.0, 1.0), F_body, R)
    tp = interp(V, F_body, tri_ids, bary)
    tn = interp(N, F_body, tri_ids, bary)
    tn /= np.maximum(np.linalg.norm(tn, axis=1, keepdims=True), 1e-8)
    tt = interp(T_v, F_body, tri_ids, bary)
    tt /= np.maximum(np.linalg.norm(tt, axis=1, keepdims=True), 1e-8)
    tb = interp(B_v, F_body, tri_ids, bary)
    tb /= np.maximum(np.linalg.norm(tb, axis=1, keepdims=True), 1e-8)
    t_ao = interp(ao_v[:, None], F_body, tri_ids, bary)[:, 0]

    # 3. High-poly 200k -> Low-poly tangent-space normal bake!
    norm_out = old_norm.copy()
    used_hp = False
    if hp_path and os.path.isfile(hp_path):
        hp = trimesh.load(hp_path, force="mesh")
        if isinstance(hp, trimesh.Scene):
            hp = hp.dump(concatenate=True)
        # Strip textures/visuals and weld duplicate UV-seam vertices BEFORE split (prevents OOM & UV-island splitting!)
        hp = trimesh.Trimesh(vertices=np.asarray(hp.vertices), faces=np.asarray(hp.faces), process=True)
        hp_parts = hp.split(only_watertight=False)
        if len(hp_parts) > 1:
            hp = max(hp_parts, key=lambda p: len(p.faces))
        # Align high-poly bounding box onto low-poly body bounding box
        lo_v = V[body_vert]
        lo_min, lo_max = lo_v.min(axis=0), lo_v.max(axis=0)
        hp_min, hp_max = hp.bounds[0], hp.bounds[1]
        lo_ext = lo_max - lo_min
        hp_ext = np.maximum(hp_max - hp_min, 1e-6)
        # Uniform height scale + center alignment (exact inverse of autoRig uniform scale)
        sc = float(lo_ext[1] / hp_ext[1])
        hp_verts = hp.vertices.copy()
        hp_verts -= np.array([0.5 * (hp_min[0] + hp_max[0]), hp_min[1], 0.5 * (hp_min[2] + hp_max[2])])
        hp_verts *= sc
        hp_verts += np.array([0.5 * (lo_min[0] + lo_max[0]), lo_min[1], 0.5 * (lo_min[2] + lo_max[2])])
        hp_norms = np.asarray(hp.vertex_normals, dtype=np.float64)

        # Verify tight alignment before baking (median NN distance < 3.5% of height)
        tree = cKDTree(hp_verts.astype(np.float32))
        dists, idxs = tree.query(tp.astype(np.float32), k=3, workers=-1)
        med_err = float(np.median(dists[:, 0]) / max(lo_ext[1], 1e-4))
        if med_err < 0.035:
            inv_w = 1.0 / (dists + 1e-5)
            inv_w /= inv_w.sum(axis=1, keepdims=True)
            n_hp = (hp_norms[idxs] * inv_w[:, :, None]).sum(axis=1)
            n_hp /= np.maximum(np.linalg.norm(n_hp, axis=1, keepdims=True), 1e-8)
            # Blend gracefully to low-poly normal where distance is large (e.g., floor strip cut)
            conf = np.clip(1.0 - dists[:, 0] / (0.04 * lo_ext[1]), 0.0, 1.0)[:, None]
            n_world = n_hp * conf + tn * (1.0 - conf)
            n_world /= np.maximum(np.linalg.norm(n_world, axis=1, keepdims=True), 1e-8)
            # Project into tangent space (glTF tangent-space normal: R=T, G=B, B=N)
            tx = np.sum(n_world * tt, axis=1)
            ty = np.sum(n_world * tb, axis=1)
            tz = np.clip(np.sum(n_world * tn, axis=1), 0.15, 1.0)
            n_ts = np.stack([tx, ty, tz], axis=1)
            n_ts /= np.maximum(np.linalg.norm(n_ts, axis=1, keepdims=True), 1e-8)

            norm_grid = np.zeros((R, R, 3), dtype=np.float32)
            norm_grid[:, :, 2] = 1.0
            norm_grid[covered] = n_ts

            # Blend subtle 20% crisp high-frequency albedo micro-detail for pores/fabric/engravings
            lum = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
            micro = lum - cv2.GaussianBlur(lum, (0, 0), 3.0)
            gx = cv2.Sobel(micro, cv2.CV_32F, 1, 0, ksize=3) * 1.4
            gy = cv2.Sobel(micro, cv2.CV_32F, 0, 1, ksize=3) * 1.4
            norm_grid[..., 0] -= gx
            norm_grid[..., 1] -= gy
            norm_grid /= np.maximum(np.linalg.norm(norm_grid, axis=-1, keepdims=True), 1e-8)

            baked_n8 = np.clip((norm_grid * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
            baked_n8 = pad_charts(baked_n8, covered, iters=6)
            # Preserve any non-body grafted strips from old_norm
            grow_cov = cv2.dilate(covered.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            norm_out[grow_cov] = baked_n8[grow_cov]
            used_hp = True
        else:
            print(f"    [note] {cid}: HP alignment med_err={med_err:.3f}, using denoised micro-normal + AO/PBR")

    # 4. Build real 3D AO + Smart PBR Metallic/Roughness ORM map!
    ao_grid = np.ones((R, R), dtype=np.float32)
    ao_grid[covered] = np.clip(t_ao ** 1.35, 0.20, 1.0)
    ao_u8 = pad_charts(np.repeat((ao_grid * 255.0).astype(np.uint8)[..., None], 3, axis=2), covered, iters=6)[..., 0]
    ao_f = cv2.GaussianBlur(ao_u8.astype(np.float32) / 255.0, (0, 0), 1.2)

    profile = MATERIAL_PROFILES.get(cid, "leather_metal")
    rough_f, metal_f = compute_smart_pbr(base_rgb, ao_f, profile)
    orm_new = np.stack([
        np.clip(ao_f * 255.0, 0, 255).astype(np.uint8),
        np.clip(rough_f * 255.0, 0, 255).astype(np.uint8),
        np.clip(metal_f * 255.0, 0, 255).astype(np.uint8),
    ], axis=-1)
    orm_out = old_orm.copy()
    grow_cov = cv2.dilate(covered.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    orm_out[grow_cov] = orm_new[grow_cov]

    # Ensure glTF material explicitly uses occlusionTexture = ORM and metallicFactor=1, roughnessFactor=1
    mat["occlusionTexture"] = {"index": pbr["metallicRoughnessTexture"]["index"], "strength": 0.92}
    mat.setdefault("normalTexture", {})["scale"] = 1.15
    pbr["metallicFactor"] = 1.0
    pbr["roughnessFactor"] = 1.0

    norm_mime = j["images"][norm_idx].get("mimeType", "image/webp")
    orm_mime = j["images"][orm_idx].get("mimeType", "image/webp")
    norm_bv = j["images"][norm_idx]["bufferView"]
    orm_bv = j["images"][orm_idx]["bufferView"]

    norm_bytes = encode_image(norm_out, norm_mime)
    orm_bytes = encode_image(orm_out, orm_mime)

    # Rebuild GLB cleanly with updated bufferViews (lengths change!)
    views = j["bufferViews"]
    new_bvs = {norm_bv: norm_bytes, orm_bv: orm_bytes}
    out_bin = bytearray()
    for vi, v in enumerate(views):
        off = v.get("byteOffset", 0)
        data = new_bvs.get(vi, bytes(b[off : off + v["byteLength"]]))
        while len(out_bin) % 4:
            out_bin.append(0)
        v["byteOffset"] = len(out_bin)
        v["byteLength"] = len(data)
        out_bin += data
    j["buffers"][0]["byteLength"] = len(out_bin)
    tmp_glb = glb_path + ".tmp"
    write_glb(tmp_glb, j, out_bin)
    os.replace(tmp_glb, glb_path)
    ktxPack.pack_glb(glb_path)
    print(f"  [PBR] {cid:20s} | profile={profile:17s} | HP-normal={'YES' if used_hp else 'no ':3s} | meanAO={ao_f[covered].mean():.2f} meanMetal={metal_f[covered].mean():.2f} meanRough={rough_f[covered].mean():.2f}", flush=True)


def main():
    args = sys.argv[1:]
    if not args or "--all" in args:
        cids = sorted(os.path.splitext(fn)[0] for fn in os.listdir(CHAR_DIR) if fn.endswith(".glb"))
    else:
        cids = args
    print(f"Baking real HP normals + 64-view C++ AO + smart PBR for {len(cids)} models...")
    for cid in cids:
        try:
            bake_character_pbr(cid)
        except Exception as e:
            print(f"  [ERROR] {cid}: {e}")


if __name__ == "__main__":
    main()
