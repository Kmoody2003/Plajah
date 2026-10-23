// The woods: real tree species from ez-tree (MIT, procedural: pine, oak, ash, aspen; bare dead oaks
// for the Halloween night) in place of the old cone silhouettes.
//   • near the road — full 3D trees, instanced per variant (bark + alpha-cut foliage, wind sway);
//   • the deep forest and the castle crag — crossed-billboard impostors baked from the same trees
//     after the renderer starts (two views per species in one material, one draw per species).
// ez-tree only supplies geometry; materials are the game's own node materials (its Phong materials
// and WebGL shader patches don't run on the WebGPU renderer).
import * as THREE from 'three/webgpu';
import { texture, uv, positionLocal, time, sin, cos, vec2, vec3, float, instanceIndex, attribute, mix, color, uniform } from 'three/tsl';
import { Tree } from '@dgreenheck/ez-tree';
import { rng } from './kit';

const TEX = '/games/ravencrest/assets/trees/';
type Species = 'pine' | 'oak' | 'ash' | 'aspen' | 'dead';
const SPECIES: Species[] = ['pine', 'oak', 'ash', 'aspen', 'dead'];
interface Variant { species: Species; bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null; barkType: 'pine' | 'oak' | 'birch'; leafType: string | null; tris: number; width: number }
/** `lean`: a horizontal direction to tip the tree toward (radians in `leanAngle`), e.g. over a road. */
export interface TreeSpot { p: THREE.Vector3; h: number; species?: Species; lean?: THREE.Vector3; leanAngle?: number }

// Night-graded foliage: deep blue-green conifers; late-October broadleaves in rust, ochre and gold.
const LEAF_TINT: Record<string, number> = { pine: 0x445e44, oak: 0x6a5634, ash: 0x7a5a2a, aspen: 0x84592a };
/** Daybreak: the curse lifts and the woods take back their green (0 cursed night … 1 morning). */
const LEAF_GREEN: Record<string, number> = { pine: 0x3b7a3c, oak: 0x5c9a3a, ash: 0x6aa040, aspen: 0x7fb04a };
export const uLeafDay = uniform(0);

const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function tex(name: string, srgb: boolean) {
  if (!texCache.has(name)) {
    const t = loader.load(TEX + name);
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

/** Wind: tops sway more than trunks; each instance on its own phase. */
function sway(amount: number) {
  const ph = float(instanceIndex).mul(1.37);
  const y = positionLocal.y;
  return positionLocal.add(vec3(sin(time.mul(1.4).add(ph).add(y.mul(2.1))).mul(amount), 0, cos(time.mul(1.1).add(ph.mul(0.7)).add(y.mul(1.6))).mul(amount)).mul(y.mul(y)));
}

const barkMats = new Map<string, THREE.MeshStandardNodeMaterial>();
function barkMaterial(type: string) {
  if (!barkMats.has(type)) {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    m.colorNode = texture(tex(`${type}_color_1k.jpg`, true), uv()).rgb.mul(color(0x9a958c));
    m.normalMap = tex(`${type}_normal_1k.jpg`, false);
    m.roughnessMap = tex(`${type}_roughness_1k.jpg`, false);
    m.positionNode = sway(0.006);
    barkMats.set(type, m);
  }
  return barkMats.get(type)!;
}
const leafMats = new Map<string, THREE.MeshStandardNodeMaterial>();
function leafMaterial(type: string) {
  if (!leafMats.has(type)) {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.45, roughness: 0.9, metalness: 0 });
    const t = texture(tex(`${type}_color.png`, true), uv());
    m.colorNode = t.rgb.mul(mix(color(LEAF_TINT[type] ?? 0x445e44), color(LEAF_GREEN[type] ?? 0x3b7a3c), uLeafDay)).mul(2.1);
    m.opacityNode = t.a;
    m.positionNode = sway(0.012);
    leafMats.set(type, m);
  }
  return leafMats.get(type)!;
}

export class Forest {
  /** Fraction of trees actually planted (main.ts lowers it on phones). */
  static density = 1;
  readonly group = new THREE.Group();
  private variants: Variant[] = [];
  private far: { spots: TreeSpot[]; species: Species[] }[] = [];
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
    ];
    for (const [species, preset, seed, tweak] of presets) {
      try { this.variants.push(this.make(species, preset, seed, tweak)); } catch (e) { console.warn('[ravencrest] tree variant failed', preset, e); }
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
    return { species, bark, leaves, barkType: o.bark.type === 'oak' || o.bark.type === 'willow' ? 'oak' : o.bark.type === 'birch' ? 'birch' : 'pine', leafType: hasLeaves ? o.leaves.type : null, tris, width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / h };
  }

  /** Full 3D trees (near the road). `mix` weights species when a spot doesn't name one. */
  plant(spots: TreeSpot[], weights: Partial<Record<Species, number>>, seed = 1) {
    const R = rng(seed);
    const pick = (): Species => {
      const tot = SPECIES.reduce((s, k) => s + (weights[k] ?? 0), 0);
      let r = R() * tot;
      for (const k of SPECIES) { r -= weights[k] ?? 0; if (r <= 0) return k; }
      return 'pine';
    };
    const byVariant = new Map<Variant, THREE.Matrix4[]>();
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
    }
    for (const [v, ms] of byVariant) {
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
        const im = new THREE.InstancedMesh(geo, mat, ms.length);
        ms.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
      };
      add(v.bark, barkMaterial(v.barkType));
      if (v.leaves && v.leafType) add(v.leaves, leafMaterial(v.leafType));
      this.stats.nearTris += v.tris * ms.length;
      this.stats.nearInstances += ms.length;
    }
  }

  /** The deep forest: impostor trees, baked once the renderer is up (see bake()). */
  plantFar(spots: TreeSpot[], species: Species[]) {
    const R = rng(spots.length + 7);
    this.far.push({ spots: Forest.density < 1 ? spots.filter(() => R() <= Forest.density) : spots, species });
  }

  /**
   * Render each species once (front and side, unlit albedo with alpha) into small targets, then
   * stand the far forest up as crossed quads sampling those two views.
   */
  async bake(renderer: THREE.WebGPURenderer) {
    if (!this.far.length) return;
    const W = 256, H = 384;
    const views = new Map<Species, { a: THREE.Texture; b: THREE.Texture; width: number }>();
    const prevTarget = renderer.getRenderTarget();
    const prevClear = new THREE.Color(), prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(prevClear as never);
    for (const sp of SPECIES) {
      const v = this.variants.find((x) => x.species === sp);
      if (!v) continue;
      const sc = new THREE.Scene();
      sc.add(new THREE.AmbientLight(0xffffff, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(1, 2, 2); sc.add(sun);
      sc.add(new THREE.Mesh(v.bark, barkMaterial(v.barkType)));
      if (v.leaves && v.leafType) sc.add(new THREE.Mesh(v.leaves, leafMaterial(v.leafType)));
      const half = v.width * 0.55;
      const cam = new THREE.OrthographicCamera(-half, half, 1.02, -0.02, 0.01, 10);
      const shots: THREE.Texture[] = [];
      for (const [x, z] of [[0, 3], [3, 0]]) {
        const rt = new THREE.RenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
        cam.position.set(x, 0.5, z); cam.lookAt(0, 0.5, 0);
        renderer.setRenderTarget(rt);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        await renderer.renderAsync(sc, cam);
        shots.push(rt.texture);
      }
      views.set(sp, { a: shots[0], b: shots[1], width: v.width });
    }
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);

    for (const { spots, species } of this.far) {
      const R = rng(spots.length);
      const bySpecies = new Map<Species, THREE.Matrix4[]>();
      for (const s of spots) {
        const sp = s.species ?? species[Math.floor(R() * species.length)];
        const sc = s.h * (0.85 + R() * 0.3);
        const m = new THREE.Matrix4().compose(s.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), new THREE.Vector3(sc, sc, sc));
        (bySpecies.get(sp) ?? bySpecies.set(sp, []).get(sp)!).push(m);
      }
      for (const [sp, ms] of bySpecies) {
        const vw = views.get(sp);
        if (!vw) continue;
        // Two crossed quads; attribute 'view' picks which baked shot each samples.
        const w = vw.width * 1.1;
        const qa = new THREE.PlaneGeometry(w, 1.04); qa.translate(0, 0.5, 0);
        const qb = qa.clone(); qb.rotateY(Math.PI / 2);
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
        merge([qa, qb]);
        const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.95, metalness: 0 });
        // Render targets are stored top-down under WebGPU: flip V or the trees hang upside-down.
        const fuv = vec2(uv().x, float(1).sub(uv().y));
        const ta = texture(vw.a, fuv), tb = texture(vw.b, fuv);
        const sel = attribute<'float'>('view', 'float');
        const c = mix(ta, tb, sel);
        mat.colorNode = c.rgb.mul(mix(vec3(1, 1, 1), vec3(0.8, 1.3, 0.75), uLeafDay));   // far woods green up too
        mat.opacityNode = c.a;
        mat.positionNode = sway(0.008);
        const im = new THREE.InstancedMesh(geo, mat, ms.length);
        ms.forEach((m, i) => im.setMatrixAt(i, m));
        im.computeBoundingSphere();
        im.frustumCulled = false;
        this.group.add(im);
        this.stats.farInstances += ms.length;
      }
    }
    console.info('[ravencrest] forest', this.stats);
  }
}
