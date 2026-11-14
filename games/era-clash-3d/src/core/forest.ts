// Ravencrest's forest (games/ravencrest/src/forest.ts), ported for Era Clash 3D with the trees of the reference
// shots: the Japanese umbrella pine (kuromatsu: a high, flat, layered crown on a leaning trunk) and the
// flowering cherry, alongside the original species.
//
// The woods: real tree species from ez-tree (MIT, procedural: pine, oak, ash, aspen; bare dead oaks
// for the Halloween night) in place of the old cone silhouettes.
//   • near the road — full 3D trees, instanced per variant (bark + alpha-cut foliage, wind sway);
//   • the deep forest and the castle crag — crossed-billboard impostors baked from the same trees
//     after the renderer starts (two views per species in one material, one draw per species).
// ez-tree only supplies geometry; materials are the game's own node materials (its Phong materials
// and WebGL shader patches don't run on the WebGPU renderer).
import * as THREE from 'three/webgpu';
import { windAt, localWindDir } from './wind';
import { texture, uv, positionLocal, time, sin, cos, vec2, vec3, float, attribute, mix, color, uniform, cameraPosition, smoothstep, select } from 'three/tsl';
import { Tree } from '@dgreenheck/ez-tree';
import { rng } from './kit';
import { cutAlpha as cutAlphaBy, keep, setCoverage } from './lodFade';
import { seasonU } from './seasonLook';

const TEX = '/games/ravencrest/assets/trees/';
export type Species = 'pine' | 'oak' | 'ash' | 'aspen' | 'dead' | 'umbrella' | 'cherry';
const SPECIES: Species[] = ['pine', 'oak', 'ash', 'aspen', 'dead', 'umbrella', 'cherry'];
interface Variant { species: Species; bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null; barkType: 'pine' | 'oak' | 'birch'; leafType: string | null; tint: string; tris: number; width: number }
/** `lean`: a horizontal direction to tip the tree toward (radians in `leanAngle`), e.g. over a road. */
export interface TreeSpot { p: THREE.Vector3; h: number; species?: Species; lean?: THREE.Vector3; leanAngle?: number;
  /** The exact variant (index into the forest's variants): a near tree's impostor is baked from the same tree. */
  variant?: number }

// Night-graded foliage: deep blue-green conifers; late-October broadleaves in rust, ochre and gold.
const LEAF_TINT: Record<string, number> = { pine: 0x445e44, oak: 0x6a5634, ash: 0x7a5a2a, aspen: 0x84592a, umbrella: 0x2e4a2c, cherry: 0xe8a8b8 };
/** Daybreak: the curse lifts and the woods take back their green (0 cursed night … 1 morning). */
const LEAF_GREEN: Record<string, number> = { pine: 0x3b7a3c, oak: 0x5c9a3a, ash: 0x6aa040, aspen: 0x7fb04a, umbrella: 0x34552c, cherry: 0xf4b8c8 };
// Era Clash is lit by day (the golden hour, then the raid's dusk): the day tints.
export const uLeafDay = uniform(1);

const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
const texLoads: Promise<unknown>[] = [];
function tex(name: string, srgb: boolean) {
  if (!texCache.has(name)) {
    let done: (v?: unknown) => void = () => {};
    texLoads.push(new Promise((r) => { done = r; }));
    const t = loader.load(TEX + name, () => done(), undefined, () => done());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(name, t);
  }
  return texCache.get(name)!;
}

function copyGeo(src: { attributes: Record<string, { array: ArrayLike<number>; itemSize: number }>; index: { array: ArrayLike<number> } | null }) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = src.attributes[k];
    if (a) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(a.array as ArrayLike<number>), a.itemSize));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array as ArrayLike<number>), 1));
  return g;
}

/**
 * Wind: tops sway more than trunks; each instance on its own phase. The phase is a per-instance
 * attribute, not instanceIndex: culling repacks the visible instances every frame.
 */
function sway(amount: number, bow: number, flutter = 0) {
  // treeWind: (phase, x, z, yaw) per instance — the tree bows downwind as the gust bands pass (core/wind.ts) and
  // rocks on its own phase, harder in a gust; leaves add a quick flutter of their own
  const tw = attribute<'vec4'>('treeWind', 'vec4');
  const ph = tw.x, y = positionLocal.y;
  const ld = localWindDir(tw.w), push = windAt(vec2(tw.y, tw.z));
  const rock = push.add(0.35);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ox: any = sin(time.mul(1.4).add(ph).add(y.mul(2.1))).mul(amount).mul(rock).add(ld.x.mul(push).mul(bow));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oz: any = cos(time.mul(1.1).add(ph.mul(0.7)).add(y.mul(1.6))).mul(amount).mul(rock).add(ld.y.mul(push).mul(bow));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fl: any = flutter ? sin(time.mul(9.0).add(positionLocal.x.mul(37)).add(positionLocal.z.mul(29)).add(ph)).mul(flutter).mul(push.add(0.2)) : 0;
  return positionLocal.add(vec3(ox, 0, oz).mul(y.mul(y))).add(vec3(fl, fl, fl));
}

/**
 * LOD cross-fade: a near tree and its impostor overlap across ±LOD_FADE m of the switch distance and fade into each
 * other, instead of the tree snapping between the two at one line. The fade is MSAA coverage (alpha-to-coverage):
 * the resolve averages the samples into a true blend, where a screen dither printed a lattice on every tree in the
 * band. `treeLod` per instance: (switch distance, 0 = full tree | 1 = impostor).
 */
export const LOD_FADE = 8;
/** Off while the impostors are baked (whole trees, nowhere near the camera). */
const uLodOn = uniform(1);
function lodFade() {
  const tw = attribute<'vec4'>('treeWind', 'vec4'), lod = attribute<'vec2'>('treeLod', 'vec2');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = vec2(tw.y, tw.z).sub(cameraPosition.xz).length();
  const k = smoothstep(lod.x.sub(LOD_FADE), lod.x.add(LOD_FADE), d);
  return select(uLodOn.lessThan(0.5), float(1), select(lod.y.greaterThan(0.5), k, float(1).sub(k)));
}
/** Alpha-cut card alpha, sharpened to its edge, times the LOD fade (core/lodFade.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cutAlpha = (a: any, cut: number) => cutAlphaBy(a, cut, lodFade());

const EVERGREEN = new Set(['pine', 'umbrella']);
/**
 * Autumn colour for a leaf card: gold, orange or red by the tree (a hash of where it stands, so neighbours differ),
 * oaks to russet-brown; the card's own light and dark kept.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function autumnLeaf(rgb: any, kind: string): any {
  const tw = attribute<'vec4'>('treeWind', 'vec4');
  const h = sin(tw.y.mul(12.9898).add(tw.z.mul(78.233))).mul(43758.5453).fract();
  const pal = kind === 'oak' ? mix(color(0x9a5a24), color(0x7a3a1a), h) : mix(mix(color(0xe0a630), color(0xd86a1e), smoothstep(0.25, 0.6, h)), color(0xb03422), smoothstep(0.65, 0.95, h));
  return pal.mul(rgb.dot(vec3(0.3, 0.6, 0.1)).mul(2.6).add(0.15));
}

/** The ez-tree bark scans (pine | oak | birch), for things made of trees (fallen logs). */
export function barkMaps(type: 'pine' | 'oak' | 'birch') { return { color: tex(`${type}_color_1k.jpg`, true), normal: tex(`${type}_normal_1k.jpg`, false), rough: tex(`${type}_roughness_1k.jpg`, false) }; }

const barkMats = new Map<string, THREE.MeshStandardNodeMaterial>();
function barkMaterial(type: string) {
  if (!barkMats.has(type)) {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    m.colorNode = texture(tex(`${type}_color_1k.jpg`, true), uv()).rgb.mul(color(0x9a958c));
    m.normalMap = tex(`${type}_normal_1k.jpg`, false);
    m.roughnessMap = tex(`${type}_roughness_1k.jpg`, false);
    m.positionNode = sway(0.008, 0.016);
    m.alphaToCoverage = true;
    m.opacityNode = lodFade();
    m.maskNode = keep(m.opacityNode);
    barkMats.set(type, m);
  }
  return barkMats.get(type)!;
}
// Foliage is lit diffuse-only (Lambert): at roughness ~0.9 GGX specular adds next to nothing, and
// alpha-cut leaves are the most overdrawn surface in the scene (~3 ms on the Arc iGPU).
const leafMats = new Map<string, THREE.MeshLambertNodeMaterial>();
function leafMaterial(type: string, tintKey = type) {
  const key = type + '|' + tintKey;
  if (!leafMats.has(key)) {
    const m = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaToCoverage: true });
    const t = texture(tex(`${type}_color.png`, true), uv());
    // blossom: the leaf card's shape, its colour taken toward the tint (a pale pink, not a dark green × pink)
    const base = tintKey === 'cherry' ? t.rgb.dot(vec3(0.3, 0.6, 0.1)).mul(0.5).add(0.9) : t.rgb.mul(2.1);
    let col: any = base.mul(mix(color(LEAF_TINT[tintKey] ?? 0x445e44), color(LEAF_GREEN[tintKey] ?? 0x3b7a3c), uLeafDay));   // eslint-disable-line @typescript-eslint/no-explicit-any
    // the season (core/seasonLook.ts): out of spring a cherry is in leaf; broadleaves turn in autumn and are bare in
    // winter; the evergreens hold a little snow
    const ev = EVERGREEN.has(tintKey);
    if (tintKey === 'cherry') col = mix(t.rgb.mul(2.1).mul(color(0x5c9a3a)), col, seasonU.bloom.mul(uLodOn).add(float(1).sub(uLodOn)));
    if (!ev) col = mix(col, autumnLeaf(t.rgb, tintKey), seasonU.autumn.mul(uLodOn));
    col = mix(col, vec3(0.86, 0.88, 0.92), seasonU.snow.mul(ev ? 0.35 : 0.2).mul(uLodOn));
    m.colorNode = col;
    // blossom petals are thin and translucent: backlit, they glow pale pink instead of going dark
    if (tintKey === 'cherry') (m as unknown as { emissiveNode: unknown }).emissiveNode = color(0xf2b4c4).mul(0.42).mul(seasonU.bloom.mul(uLodOn).add(float(1).sub(uLodOn)));
    m.opacityNode = ev ? cutAlpha(t.a, 0.45) : cutAlpha(t.a, 0.45).mul(float(1).sub(seasonU.bare.mul(uLodOn)));
    m.maskNode = keep(m.opacityNode);
    m.positionNode = sway(0.016, 0.024, 0.0035);
    leafMats.set(key, m);
  }
  return leafMats.get(key)!;
}

/**
 * Depth prepass for alpha-cut foliage: an alpha-test-only clone draws first and writes depth, and
 * the lit mesh then tests without writing it. Alpha test otherwise defeats early-Z, so every
 * overlapping leaf layer was fully lit; now only the front one is (~3 ms on the Arc iGPU).
 */
function depthPrepass(im: THREE.InstancedMesh) {
  const lit = im.material as THREE.MeshLambertNodeMaterial;
  const d = new THREE.MeshBasicNodeMaterial({ side: lit.side, alphaToCoverage: lit.alphaToCoverage, colorWrite: false });
  d.opacityNode = lit.opacityNode;
  d.maskNode = lit.maskNode;
  d.positionNode = lit.positionNode;   // same sway graph → same depth, so the lit pass's LessEqual matches
  lit.depthWrite = false;
  const pre = new THREE.InstancedMesh(im.geometry, d, im.count);
  pre.instanceMatrix = im.instanceMatrix;
  pre.boundingSphere = im.boundingSphere;
  pre.frustumCulled = im.frustumCulled;
  pre.renderOrder = -1;
  return pre;
}

/** A still, whole tree for the impostor bake: the variant's geometry with zero wind and no LOD band. */
function bakeView(src: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry();
  g.setIndex(src.index);
  for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
  const n = src.attributes.position.count;
  g.setAttribute('treeWind', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('treeLod', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

const _frustum = new THREE.Frustum(), _vp = new THREE.Matrix4(), _sphere = new THREE.Sphere();

/** One set of instanced meshes sharing instance order (bark + leaves + prepass of a variant). */
interface CullSet { meshes: THREE.InstancedMesh[]; attrs: THREE.InstancedBufferAttribute[]; phaseAttrs: THREE.InstancedBufferAttribute[]; mats: THREE.Matrix4[]; phases: Float32Array; sphere: THREE.Sphere;
  /** Distance band (m) from the camera where this set draws: full trees near, their impostors beyond (LOD). */
  minD: number; maxD: number }

export class Forest {
  /** Fraction of trees actually planted (main.ts lowers it on phones). */
  static density = 1;
  /**
   * Per-instance frustum culling (main.ts turns it off when shadow maps are on: off-screen trees
   * still cast shadows into view). Each variant/species is one InstancedMesh spread along the whole
   * road, so without it every tree — behind the camera too — was drawn every frame.
   */
  static cull = true;
  /** LOD: full 3D trees inside this distance from the camera, their baked impostors beyond it (Era Clash). */
  static nearDist = 60;
  /** MSAA is on (main.ts): LOD bands blend by coverage; off, they hand over at the midpoint. */
  static set coverage(on: boolean) { setCoverage(on); }
  private cullSets: CullSet[] = [];
  readonly group = new THREE.Group();
  private variants: Variant[] = [];
  private far: { spots: TreeSpot[]; species: Species[]; minD: number }[] = [];
  readonly stats = { variants: 0, nearTris: 0, nearInstances: 0, farInstances: 0 };

  constructor() {
    this.group.name = 'forest';
    const presets: [Species, string, number, ((o: Record<string, any>) => void)?][] = [
      ['pine', 'Pine Large', 11], ['pine', 'Pine Large', 23], ['pine', 'Pine Medium', 37], ['pine', 'Pine Medium', 41], ['pine', 'Pine Small', 53],
      ['oak', 'Oak Medium', 61], ['oak', 'Oak Large', 67],
      ['ash', 'Ash Medium', 71],
      ['aspen', 'Aspen Medium', 83],
      // Bare dead oaks and ashes — the Halloween woods.
      ['dead', 'Oak Medium', 97, (o) => { o.leaves.count = 0; }], ['dead', 'Ash Large', 101, (o) => { o.leaves.count = 0; }],
      // Japanese umbrella pine: pine bark and needles on the broadleaf branching model (no cone), the crown
      // starting high and spreading near-flat in tiers, a gnarled leaning trunk.
      ...([131, 137, 149] as const).map((seed, i) => ['umbrella', 'Oak Medium', seed, (o: Record<string, any>) => {
        o.bark.type = 'pine'; o.leaves.type = 'pine'; o.leaves.billboard = 'double';
        o.branch.levels = 2;
        o.branch.angle = { 1: 74 + i * 4, 2: 50, 3: 40 };
        o.branch.children = { 0: 8 + i, 1: 5, 2: 3 };
        o.branch.start = { 1: 0.5 + i * 0.04, 2: 0.25, 3: 0.3 };
        o.branch.length = { 0: 34, 1: 15 + i * 2, 2: 7, 3: 2 };
        o.branch.radius = { 0: 1.0, 1: 0.45, 2: 0.6, 3: 0.6 };
        o.branch.gnarliness = { 0: 0.16, 1: 0.18, 2: 0.1, 3: 0 };
        o.branch.force = { direction: { x: 0.3, y: 1, z: 0 }, strength: -0.012 };
        o.leaves.count = 46; o.leaves.size = 3.8; o.leaves.start = 0.45; o.leaves.angle = 60;
      }] as [Species, string, number, (o: Record<string, any>) => void]),
      // Flowering cherry: a broad, open, low-branching crown dense with blossom.
      ['cherry', 'Ash Medium', 163, (o) => { o.bark.type = 'oak'; o.branch.angle = { ...o.branch.angle, 1: 52 }; o.branch.start = { ...o.branch.start, 1: 0.32 }; o.leaves.count = Math.round(o.leaves.count * 2.6); o.leaves.size *= 2.3; }],
      ['cherry', 'Oak Medium', 167, (o) => { o.leaves.type = 'ash'; o.leaves.count = Math.round(o.leaves.count * 2.4); o.leaves.size *= 2.1; }],
    ];
    for (const [species, preset, seed, tweak] of presets) {
      try { this.variants.push(this.make(species, preset, seed, tweak)); } catch (e) { console.warn('[eraclash3d] tree variant failed', preset, e); }
    }
    this.stats.variants = this.variants.length;
  }

  private make(species: Species, preset: string, seed: number, tweak?: (o: Record<string, any>) => void): Variant {
    const t = new Tree();
    t.loadPreset(preset);
    t.options.seed = seed;
    // Lighter geometry for a dense forest (the presets are showcase-detailed).
    const o = t.options as unknown as Record<string, any>;
    for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(3, Math.round(o.branch.sections[k] * 0.6));
    for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * 0.6));
    if (o.leaves) o.leaves.count = Math.round(o.leaves.count * 0.55);
    tweak?.(o);
    if (species === 'umbrella' || species === 'cherry') o.type = 'deciduous';
    t.generate();
    const bark = copyGeo(t.branchesMesh.geometry as never);
    const hasLeaves = (t.leavesMesh.geometry as THREE.BufferGeometry).attributes.position?.count > 0;
    const leaves = hasLeaves ? copyGeo(t.leavesMesh.geometry as never) : null;
    // Normalise: base at y = 0, height 1, centred.
    const box = new THREE.Box3().setFromBufferAttribute(bark.attributes.position as THREE.BufferAttribute);
    if (leaves) box.union(new THREE.Box3().setFromBufferAttribute(leaves.attributes.position as THREE.BufferAttribute));
    const h = box.max.y - box.min.y;
    for (const g of [bark, leaves]) {
      if (!g) continue;
      g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      g.scale(1 / h, 1 / h, 1 / h);
      g.computeBoundingSphere();
    }
    t.branchesMesh.geometry.dispose(); t.leavesMesh.geometry.dispose();
    const tris = ((bark.index?.count ?? 0) + (leaves?.index?.count ?? 0)) / 3;
    return { species, tint: species === 'umbrella' || species === 'cherry' ? species : (hasLeaves ? o.leaves.type : 'pine'), bark, leaves, barkType: o.bark.type === 'oak' || o.bark.type === 'willow' ? 'oak' : o.bark.type === 'birch' ? 'birch' : 'pine', leafType: hasLeaves ? o.leaves.type : null, tris, width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / h };
  }

  /** Full 3D trees (near the road). `mix` weights species when a spot doesn't name one. */
  /** `near`: full 3D inside this distance (default Forest.nearDist); a dense wood uses less (its impostors take over). */
  plant(spots: TreeSpot[], weights: Partial<Record<Species, number>>, seed = 1, near = Forest.nearDist) {
    const R = rng(seed);
    const pick = (): Species => {
      const tot = SPECIES.reduce((s, k) => s + (weights[k] ?? 0), 0);
      let r = R() * tot;
      for (const k of SPECIES) { r -= weights[k] ?? 0; if (r <= 0) return k; }
      return 'pine';
    };
    const byVariant = new Map<Variant, THREE.Matrix4[]>();
    const lod: TreeSpot[] = [];
    for (const s of spots) {
      if (R() > Forest.density && !s.lean) continue;   // the trees arching the road always stay
      const sp = s.species ?? pick();
      const pool = this.variants.filter((v) => v.species === sp);
      if (!pool.length) continue;
      const v = pool[Math.floor(R() * pool.length)];
      const sc = s.h * (0.85 + R() * 0.3);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
      if (s.lean && s.leanAngle) {
        const axis = new THREE.Vector3(0, 1, 0).cross(s.lean).normalize();
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, s.leanAngle));
      }
      const m = new THREE.Matrix4().compose(s.p, q, new THREE.Vector3(sc, sc, sc));
      (byVariant.get(v) ?? byVariant.set(v, []).get(v)!).push(m);
      lod.push({ p: s.p, h: sc / 1.0, species: sp, variant: this.variants.indexOf(v) });
    }
    if (near < Infinity && lod.length) this.far.push({ spots: lod, species: ['pine'], minD: near });
    for (const [v, ms] of byVariant) {
      const add = (src: THREE.BufferGeometry, mat: THREE.Material) => {
        // a view of the variant's geometry (shared vertex data, its own instance attributes): the same variant is
        // planted by several plant() calls, and each set needs its own wind phases and LOD band
        const geo = new THREE.BufferGeometry();
        geo.setIndex(src.index);
        for (const [k, a] of Object.entries(src.attributes)) geo.setAttribute(k, a);
        geo.boundingSphere = src.boundingSphere; geo.boundingBox = src.boundingBox;
        const im = new THREE.InstancedMesh(geo, mat, ms.length);
        ms.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
        return im;
      };
      const set = [add(v.bark, barkMaterial(v.barkType))];
      if (v.leaves && v.leafType) {
        const leaves = add(v.leaves, leafMaterial(v.leafType, v.tint)), pre = depthPrepass(leaves);
        this.group.add(pre);
        set.push(leaves, pre);
      }
      this.track(set, ms, 0, near < Infinity ? near + LOD_FADE : Infinity, { band: near < Infinity ? near : 1e6, far: 0 });
      this.stats.nearTris += v.tris * ms.length;
      this.stats.nearInstances += ms.length;
    }
  }

  /** The deep forest: impostor trees, baked once the renderer is up (see bake()). */
  plantFar(spots: TreeSpot[], species: Species[]) {
    const R = rng(spots.length + 7);
    this.far.push({ spots: Forest.density < 1 ? spots.filter(() => R() <= Forest.density) : spots, species, minD: 0 });
  }

  /**
   * Render each species once (front and side, unlit albedo with alpha) into small targets, then
   * stand the far forest up as crossed quads sampling those two views.
   */
  async bake(renderer: THREE.WebGPURenderer) {
    if (!this.far.length) return;
    // the bark and leaf textures must be in before the shots are taken (blank leaves bake to nothing)
    for (const v of this.variants) { barkMaterial(v.barkType); if (v.leafType) leafMaterial(v.leafType, v.tint); }
    await Promise.all(texLoads);
    const isWebGL = !!(renderer.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend;
    const W = 384, H = 576;
    const views = new Map<number, { shots: THREE.Texture[]; width: number }>();
    const prevTarget = renderer.getRenderTarget();
    const prevClear = new THREE.Color(), prevAlpha = renderer.getClearAlpha();
    const prevXR = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.getClearColor(prevClear as never);
    // The bake has no prepass: leaves must write their own depth or back leaves cover front ones.
    leafMats.forEach((m) => { m.depthWrite = true; });
    uLodOn.value = 0;
    try {
      for (const [vi, v] of this.variants.entries()) {
        if (v.species === 'dead') continue;
        const sc = new THREE.Scene();
        sc.add(new THREE.AmbientLight(0xffffff, 1.6));
        const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(1, 2, 2); sc.add(sun);
        sc.add(new THREE.Mesh(bakeView(v.bark), barkMaterial(v.barkType)));
        if (v.leaves && v.leafType) sc.add(new THREE.Mesh(bakeView(v.leaves), leafMaterial(v.leafType, v.tint)));
        const half = v.width * 0.55;
        const cam = new THREE.OrthographicCamera(-half, half, 1.02, -0.02, 0.01, 10);
        const shots: THREE.Texture[] = [];
        for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
          const x = Math.sin(a) * 3, z = Math.cos(a) * 3;
          const rt = new THREE.RenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
          cam.position.set(x, 0.5, z); cam.lookAt(0, 0.5, 0);
          renderer.setRenderTarget(rt);
          renderer.setClearColor(0x000000, 0);
          renderer.clear();
          await renderer.renderAsync(sc, cam);
          shots.push(rt.texture);
        }
        views.set(vi, { shots, width: v.width });
      }
    } finally {
      renderer.xr.enabled = prevXR;
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevClear, prevAlpha);
      leafMats.forEach((m) => { m.depthWrite = false; });
      uLodOn.value = 1;
    }

    for (const { spots, species, minD } of this.far) {
      const R = rng(spots.length);
      const bySpecies = new Map<number, THREE.Matrix4[]>();
      for (const s of spots) {
        const sp0 = s.species ?? species[Math.floor(R() * species.length)];
        const pool = this.variants.map((v, i) => (v.species === sp0 ? i : -1)).filter((i) => i >= 0);
        if (!pool.length) continue;
        const sp = s.variant !== undefined && s.variant >= 0 ? s.variant : pool[Math.floor(R() * pool.length)];
        const sc = minD > 0 ? s.h : s.h * (0.85 + R() * 0.3);
        const m = new THREE.Matrix4().compose(s.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), new THREE.Vector3(sc, sc, sc));
        (bySpecies.get(sp) ?? bySpecies.set(sp, []).get(sp)!).push(m);
      }
      for (const [sp, ms] of bySpecies) {
        const vw = views.get(sp);
        if (!vw) continue;
        const spName = this.variants[sp].species;
        // Three quads 60° apart (rounder than a cross); attribute 'view' picks which baked shot each samples.
        const w = vw.width * 1.1;
        const qa = new THREE.PlaneGeometry(w, 1.04); qa.translate(0, 0.5, 0);
        const qb = qa.clone(); qb.rotateY(-Math.PI / 3);
        const qc = qa.clone(); qc.rotateY((-2 * Math.PI) / 3);
        const geo = new THREE.BufferGeometry();
        const merge = (gs: THREE.BufferGeometry[]) => {
          const pos: number[] = [], nor: number[] = [], uvs: number[] = [], view: number[] = [], idx: number[] = [];
          gs.forEach((g, gi) => {
            const off = pos.length / 3;
            pos.push(...(g.attributes.position.array as Float32Array)); nor.push(...(g.attributes.normal.array as Float32Array)); uvs.push(...(g.attributes.uv.array as Float32Array));
            for (let i = 0; i < g.attributes.position.count; i++) view.push(gi);
            idx.push(...Array.from(g.index!.array, (i) => i + off));
          });
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
          geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
          geo.setAttribute('view', new THREE.Float32BufferAttribute(view, 1));
          geo.setIndex(idx);
        };
        merge([qa, qb, qc]);
        const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaToCoverage: true });
        // Render targets are stored top-down under WebGPU (flip V), bottom-up under WebGL.
        const fuv = isWebGL ? uv() : vec2(uv().x, float(1).sub(uv().y));
        const [ta, tb, tc] = vw.shots.map((t) => texture(t, fuv));
        const sel = attribute<'float'>('view', 'float');
        const c = mix(mix(ta, tb, sel.min(1)), tc, sel.sub(1).max(0));
        // baked with the spring tints; the season turns them here (the bake itself is season-neutral)
        const evI = spName === 'pine' || spName === 'umbrella';
        let ic: any = c.rgb;   // eslint-disable-line @typescript-eslint/no-explicit-any
        if (spName === 'cherry') ic = mix(c.rgb.dot(vec3(0.3, 0.6, 0.1)).mul(vec3(0.42, 0.62, 0.3)), ic, seasonU.bloom);
        if (!evI) ic = mix(ic, autumnLeaf(c.rgb.mul(0.9), spName), seasonU.autumn);
        if (!evI) ic = mix(ic, c.rgb.dot(vec3(0.3, 0.6, 0.1)).mul(vec3(0.62, 0.52, 0.44)), seasonU.bare);   // bare crowns: grey-brown twigs
        mat.colorNode = mix(ic, vec3(0.86, 0.88, 0.92), seasonU.snow.mul(evI ? 0.35 : 0.2));
        mat.opacityNode = cutAlpha(c.a, 0.5).mul(evI ? float(1) : float(1).sub(seasonU.bare.mul(0.55)));
        // a flat card goes dark when the low sun is behind it: a little of its own colour back (blossom glows more)
        (mat as unknown as { emissiveNode: unknown }).emissiveNode = (mat.colorNode as any).mul(spName === 'cherry' ? seasonU.bloom.mul(0.31).add(0.14) : float(0.14));   // eslint-disable-line @typescript-eslint/no-explicit-any
        mat.positionNode = sway(0.012, 0.02);
        mat.maskNode = keep(mat.opacityNode);
        const im = new THREE.InstancedMesh(geo, mat, ms.length);
        ms.forEach((m, i) => im.setMatrixAt(i, m));
        im.computeBoundingSphere();
        const pre = depthPrepass(im);
        this.group.add(im, pre);
        this.track([im, pre], ms, minD > 0 ? Math.max(0, minD - LOD_FADE) : 0, Infinity, { band: minD, far: 1 });
        this.stats.farInstances += ms.length;
      }
    }
    console.info('[eraclash3d] forest', this.stats);
  }

  /** Give meshes (same instance order) a stable sway phase per tree and register them for culling. */
  private track(meshes: THREE.InstancedMesh[], mats: THREE.Matrix4[], minD = 0, maxD = Infinity, lod = { band: 1e6, far: 0 }) {
    // per instance: sway phase, ground position and facing (for the wind's direction in the tree's own frame)
    const phases = new Float32Array(mats.length * 4);
    mats.forEach((m, i) => { const e = m.elements; phases.set([i * 1.37, e[12], e[14], Math.atan2(e[8], e[10])], i * 4); });
    const attrs = [...new Set(meshes.map((m) => m.instanceMatrix))];
    const phaseAttrs: THREE.InstancedBufferAttribute[] = [];
    for (const geo of new Set(meshes.map((m) => m.geometry))) {
      const a = new THREE.InstancedBufferAttribute(phases.slice(), 4);
      geo.setAttribute('treeWind', a);
      phaseAttrs.push(a);
      // the LOD band is the same for every instance of a set, so it never needs repacking
      const band = new Float32Array(mats.length * 2);
      for (let i = 0; i < mats.length; i++) { band[i * 2] = lod.band; band[i * 2 + 1] = lod.far; }
      geo.setAttribute('treeLod', new THREE.InstancedBufferAttribute(band, 2));
    }
    const geo = meshes[0].geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    for (const m of meshes) m.frustumCulled = false;   // culled per instance in cull()
    this.cullSets.push({ meshes, attrs, phaseAttrs, mats, phases, sphere: geo.boundingSphere!.clone(), minD, maxD });
  }

  private packed = false;
  private frame = 0;
  /** Every instance back in its original slot (culling switched off at runtime). */
  unpack() {
    this.packed = false;
    for (const s of this.cullSets) {
      s.mats.forEach((m, i) => { for (const a of s.attrs) (a.array as Float32Array).set(m.elements, i * 16); });
      for (const a of s.phaseAttrs) (a.array as Float32Array).set(s.phases);
      for (const a of [...s.attrs, ...s.phaseAttrs]) a.needsUpdate = true;
      for (const m of s.meshes) { m.count = s.mats.length; m.visible = true; }
    }
  }

  /** Pack only the instances inside the camera frustum to the front; call once per frame before rendering. */
  cull(camera: THREE.Camera) {
    if (!Forest.cull) { if (this.packed) this.unpack(); return; }
    this.packed = true;
    camera.updateMatrixWorld();
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_vp, camera.coordinateSystem, camera.reversedDepth);
    this.frame++;
    for (const s of this.cullSets) {
      // the big impostor sets (thousands of far trees) only need a fresh pick every third frame
      if (s.mats.length > 1500 && this.frame % 3 !== 0 && s.meshes[0].count > 0) continue;
      let n = 0;
      const lo = s.minD * s.minD, hi = s.maxD * s.maxD, cp = camera.position;
      for (let i = 0; i < s.mats.length; i++) {
        const e = s.mats[i].elements, dx = e[12] - cp.x, dz = e[14] - cp.z, d2 = dx * dx + dz * dz;
        if (d2 < lo || d2 >= hi) continue;
        if (!_frustum.intersectsSphere(_sphere.copy(s.sphere).applyMatrix4(s.mats[i]))) continue;
        for (const a of s.attrs) (a.array as Float32Array).set(s.mats[i].elements, n * 16);
        for (const a of s.phaseAttrs) (a.array as Float32Array).set(s.phases.subarray(i * 4, i * 4 + 4), n * 4);
        n++;
      }
      for (const a of s.attrs) a.needsUpdate = true;
      for (const a of s.phaseAttrs) a.needsUpdate = true;
      for (const m of s.meshes) { m.count = n; m.visible = n > 0; }
    }
  }
}
