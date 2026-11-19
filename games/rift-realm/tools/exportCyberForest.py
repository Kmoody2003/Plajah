"""Pick the Cyber Forest sprites/swatches cut by cutSheets.py and write game assets.

Usage: python exportCyberForest.py <cut-dir> <sheet-dir> <out-dir>
Sprites -> <name>.png (RGBA, longest side <= 512, trees 1024).
Canopy chunks -> canopy_<n>.png: the leafy top of each tree sprite, for 3D canopy card clusters.
Swatches -> <name>_albedo.jpg + <name>_normal.jpg (normal from luminance, mirrored so it tiles).
"""
import sys, os, numpy as np, cv2
cut, sheets, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)

SPRITES = {
  'grass_a': 'cyber_forest_glowing_grass_asset_0', 'grass_b': 'cyber_forest_glowing_grass_asset_4',
  'grass_c': 'cyber_forest_glowing_grass_asset_8', 'grass_d': 'cyber_forest_glowing_grass_asset_13',
  'fern_a': 'cybernetic_glowing_ferns_asset_s_0', 'fern_b': 'cyber_forest_asset_sheet_2', 'fern_c': 'cyber_forest_asset_sheet_8',
  'bush_a': 'cyber_forest_asset_sheet_4', 'bush_b': 'bioluminescent_foliage_leaf_asse_3',
  'shroom_a': 'neon_forest_mushrooms_orthograph_0', 'shroom_b': 'neon_forest_mushrooms_orthograph_2',
  'toadstool': 'cybernetic_toadstools_with_glowi_0', 'shroom_tall': 'bioluminescent_mushrooms_with_in_0',
  'spore_pod': 'fungi_emitting_spores_1', 'flower_a': 'cyber_forest_glowing_flower_pods_0', 'flower_b': 'cyber_forest_glowing_flower_pods_1',
  'crystal_plant': 'crystalline_plants_orthographic_0', 'carnivore': 'cybernetic_alien_carnivorous_pla_1',
  'vine_a': 'cybernetic_vine_tendrils_asset_s_0', 'vine_b': 'cybernetic_vine_tendrils_asset_s_1', 'vine_c': 'cybernetic_vine_tendrils_asset_s_2',
  'resin_stump': 'cyber_forest_glowing_resin_props_0',
}
TREES = {
  'tree_blue_a': 'cyber_forest_trees_orthographic_0', 'tree_blue_b': 'cyber_forest_trees_orthographic_1', 'tree_blue_c': 'cyber_forest_trees_orthographic_2',
  'tree_violet_a': 'bioluminescent_tree_asset_turnar_0', 'tree_violet_b': 'bioluminescent_tree_asset_turnar_1', 'tree_violet_c': 'bioluminescent_tree_asset_turnar_3',
  'tree_willow': 'cyber_forest_tree_orthographic_v_0', 'tree_mangrove': 'cybernetic_mangrove_trees_sheet_1',
}

def load(n):
    p = os.path.join(cut, n + '.png')
    if not os.path.exists(p):
        p = os.path.join(cut, n.replace('crystalline_plants_orthographic', 'crystalline_plants_orthogr') + '.png')
    a = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_UNCHANGED)
    if a is None: raise SystemExit('missing ' + n)
    return a

def fit(a, m):
    h, w = a.shape[:2]; s = min(1.0, m / max(h, w))
    return cv2.resize(a, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else a

def bleed(a):
    # spread edge colour into transparent pixels so mips/alpha-test don't show a dark halo
    rgb, al = a[..., :3].copy(), a[..., 3]
    known = al > 8
    for _ in range(12):
        dil = cv2.dilate(rgb, np.ones((3, 3), np.uint8))
        grow = cv2.dilate(known.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~known
        rgb[grow] = dil[grow]; known |= grow
    return np.dstack([rgb, al])

def save(name, a):
    cv2.imencode('.webp', bleed(a), [cv2.IMWRITE_WEBP_QUALITY, 88])[1].tofile(os.path.join(out, name + '.webp'))
    print(name, a.shape[1], a.shape[0])

for k, n in SPRITES.items(): save(k, fit(load(n), 512))
ci = 0
for k, n in TREES.items():
    a = load(n); save(k, fit(a, 1024))
    # canopy chunk: rows above where the trunk narrows (alpha row coverage drops) — take the top 55 %
    h = a.shape[0]; top = a[: int(h * 0.55)]
    cov = (top[..., 3] > 40).sum(0); xs = np.where(cov > 0)[0]
    if len(xs): top = top[:, xs[0]: xs[-1] + 1]
    # fade the bottom edge so cards blend into each other
    f = np.clip(np.linspace(1.6, -0.2, top.shape[0]) , 0, 1)[:, None]
    top = top.copy(); top[..., 3] = (top[..., 3] * np.minimum(1, f * 1.0 + 0.0)).astype(np.uint8)
    save(f'canopy_{ci}', fit(top, 512)); ci += 1

def normal_from(albedo, strength=3.0):
    g = cv2.cvtColor(albedo, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    g = cv2.GaussianBlur(g, (3, 3), 0)
    dx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) * strength
    dy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) * strength
    n = np.dstack([-dx, dy, np.ones_like(g)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    rgb = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    return rgb[..., ::-1]  # to BGR: (b=z, g=y, r=x)

def swatch(name, a, size=512, strength=3.0):
    al = a[..., 3] if a.shape[2] == 4 else None
    rgb = a[..., :3]
    if al is not None:  # the moss squares are drawn in perspective with a shadow: keep the middle 64 %
        ys, xs = np.where(al > 250)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        dy, dx = int((y1 - y0) * 0.18), int((x1 - x0) * 0.18)
        rgb = rgb[y0 + dy: y1 - dy, x0 + dx: x1 - dx]
    rgb = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    # seamless by offset-blend: the half-shifted copy covers the edges, the original covers the middle
    sh = np.roll(rgb, (size // 2, size // 2), (0, 1))
    r = np.linspace(-1, 1, size); wy = 1 - np.abs(r)
    w = np.clip(np.minimum.outer(wy, wy) * 3.0, 0, 1)[..., None]
    tile = np.clip(rgb * w + sh * (1 - w), 0, 255).astype(np.uint8)
    cv2.imencode('.jpg', tile, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tofile(os.path.join(out, name + '_albedo.jpg'))
    cv2.imencode('.jpg', normal_from(tile, strength), [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tofile(os.path.join(out, name + '_normal.jpg'))
    print(name, 'swatch')

sheet = lambda n: cv2.imdecode(np.fromfile(os.path.join(sheets, n), np.uint8), cv2.IMREAD_COLOR)
import glob
def sheet_glob(prefix):
    return cv2.imdecode(np.fromfile(glob.glob(os.path.join(sheets, prefix + '*.jpg'))[0], np.uint8), cv2.IMREAD_COLOR)
trunk = sheet_glob('Cybernetic_tree_trunk_detail')
swatch('bark', trunk[486:673, 966:1147], 512, 4.0)          # CYBER-BARK TEXTURE panel
swatch('conduit', trunk[486:673, 1157:1339], 512, 2.0)      # CONDUIT DETAIL panel
swatch('moss_glow', load('cyber_forest_bioluminescent_moss_0'), 512, 2.5)
swatch('moss_cable', load('cyber_forest_bioluminescent_moss_1'), 512, 2.5)
swatch('moss_strand', load('cyber_forest_bioluminescent_moss_2'), 512, 2.5)
