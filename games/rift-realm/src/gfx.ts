// Graphics profiles: which render features a GPU gets, picked automatically from the WebGPU adapter.
//
//   low   — the old light path (forced with Settings → Graphics quality → Low, or ?q=low): pixel ratio 0.7, no shadow
//           map, no post, lighter vegetation.
//   intel — integrated GPUs (Intel Xe / Arc iGPU), the auto pick on Intel (?q=intel forces it): the low content set,
//           plus what the old low path had none of — the light pass (post.ts: AO, godrays, bloom, grade, vignette) at an
//           internal resolution held by dynamic resolution and FSR 1 (EASU + RCAS) to the screen, one 2048 shadow map
//           from the key light (near trees, big static meshes, characters; refreshed every 2nd frame) and godrays.
//           ?content=high gives it the high content set, ?shadows=0 drops the shadow map, ?res= the starting scale,
//           ?fps= the frame rate dynamic resolution holds (default 60).
//   high  — discrete GPUs (forced with Settings → High, or ?q=high): native pixel ratio, full post, 4k shadows.
//
// The levels still see the two content tiers (shrine.ts Tier 'low' | 'high'); a profile maps onto one of them.
import * as THREE from 'three/webgpu';
import type { Tier } from './shrine';
import { simplifyIndex } from './batching';

export type GfxProfile = 'low' | 'intel' | 'high';

export interface Gfx {
  profile: GfxProfile;
  /** Content tier handed to the level builders. */
  tier: Tier;
  shadows: boolean;
  /** Cap on shadow map size (levels ask for up to 4096). */
  shadowMapMax: number;
  post: 'full' | 'scaled' | null;
  pixelRatio: number;
  /** Dynamic resolution: internal render scale bounds and the frame time it holds (ms). */
  dynres: { min: number; max: number; start: number; targetMs: number } | null;
}

export function pickGfx(adapter: { vendor?: string; architecture?: string }, forced: string | null): Gfx {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const auto: GfxProfile = adapter.vendor === 'intel' ? 'intel' : 'high';
  const profile: GfxProfile = forced === 'low' || forced === 'high' || forced === 'intel' ? forced : auto;
  if (profile === 'low') return { profile, tier: 'low', shadows: false, shadowMapMax: 0, post: null, pixelRatio: 0.7, dynres: null };
  if (profile === 'high') return { profile, tier: 'high', shadows: true, shadowMapMax: 4096, post: 'full', pixelRatio: dpr, dynres: null };
  // intel: the canvas at native size (UI, the FSR output), the 3D at a dynamic fraction of it
  const qs = new URLSearchParams(location.search);
  const target = Number(qs.get('fps')) || 60;
  return {
    profile, tier: qs.get('content') === 'high' ? 'high' : 'low', shadows: qs.get('shadows') !== '0', shadowMapMax: 2048, post: 'scaled', pixelRatio: Math.min(dpr, 1.5),
    dynres: { min: 0.5, max: 1, start: Number(qs.get('res')) || 0.67, targetMs: 1000 / target },
  };
}

/** Caps every shadow-casting light's map at `max` (levels ask for 4096 on the high tier). */
export function capShadowMaps(root: THREE.Object3D, max: number) {
  root.traverse((o) => {
    const l = o as THREE.DirectionalLight;
    if (!(l as { isLight?: boolean }).isLight || !l.shadow) return;
    const s = l.shadow.mapSize;
    if (s.x > max || s.y > max) { s.set(Math.min(s.x, max), Math.min(s.y, max)); l.shadow.map?.dispose(); (l.shadow as { map: unknown }).map = null; }
  });
}

/**
 * Holds a frame time by moving the internal render scale. GPU time comes from timestamp queries (three's
 * trackTimestamp, switched on here after init — the device asks for every feature the adapter has): every few frames
 * the queries are resolved (three reports the most recent frame's total). Without the feature it falls
 * back to queue.onSubmittedWorkDone() after a submit, which also counts present / vsync waits and reads high.
 * The scale moves in 0.05 steps with hysteresis so the render targets aren't resized every frame.
 */
export class DynamicResolution {
  scale: number;
  gpuMs = 0;
  private busy = false; private frames = 0;
  private acc = 0; private n = 0; private hold = 0;
  private stamps: boolean;
  constructor(private o: NonNullable<Gfx['dynres']>, private renderer: THREE.WebGPURenderer, private apply: (s: number) => void) {
    this.scale = o.start;
    apply(this.scale);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const be = renderer.backend as any;
    this.stamps = !!be?.hasFeature?.('timestamp-query');
    if (this.stamps) be.trackTimestamp = true;
  }
  /** Call right after the frame's render (its commands are submitted). */
  afterRender(dt: number) {
    this.frames++;
    if (!this.busy && this.frames >= 4) {
      this.busy = true;
      const t0 = performance.now();
      this.frames = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (this.renderer.backend as any)?.device?.queue as GPUQueue | undefined;
      const read: Promise<number | undefined> = this.stamps ? this.renderer.resolveTimestampsAsync('render').then((ms) => ms ?? 0) // three returns the LAST frame's GPU time
        : q ? q.onSubmittedWorkDone().then(() => performance.now() - t0) : Promise.resolve(undefined);
      read.then((ms) => { if (ms !== undefined && ms > 0) { this.acc += ms; this.n++; } }).finally(() => { this.busy = false; });
    }
    this.hold -= dt;
    if (this.n < 3 || this.hold > 0) return;
    const ms = this.acc / this.n; this.acc = 0; this.n = 0;
    this.gpuMs = ms;
    const budget = this.o.targetMs * 0.85; // leave room for the compositor and the frame-to-frame jitter
    let s = this.scale;
    // GPU time scales roughly with the pixel count (scale²): aim straight at the budget, a step or two at a time
    const want = s * Math.sqrt(budget / Math.max(1, ms));
    if (ms > budget * 1.05) s -= Math.min(0.15, Math.max(0.05, s - want));
    else if (ms < budget * 0.75) s += Math.min(0.1, Math.max(0.05, want - s));
    s = Math.round(Math.min(this.o.max, Math.max(this.o.min, s)) * 20) / 20;
    if (s !== this.scale) { this.scale = s; this.apply(s); this.hold = 0.5; }
    else this.hold = 0.25;
  }
}

/**
 * The intel profile's shadow rig on the low content set (where nothing casts): the strongest directional light (the
 * sun / moon the level and skyCycle use) casts into a map of `mapSize`; the casters are the characters (already on),
 * the near trees (Forest instances tagged userData.lod 'near') and big opaque static meshes (≥ `minRadius` m), never
 * terrain, water, grass, small props or particles. The map updates every `every` frames (tick()), characters included.
 * Call after the level is built and before its shaders compile (prepare): castShadow changes pipelines.
 */
export function intelShadows(root: THREE.Object3D, o: { mapSize?: number; minRadius?: number; every?: number } = {}) {
  let key: THREE.DirectionalLight | null = null;
  root.traverse((x) => { const l = x as THREE.DirectionalLight; if (l.isDirectionalLight && (!key || l.intensity > key.intensity)) key = l; });
  const light = key as THREE.DirectionalLight | null;
  if (!light) return null;
  const size = o.mapSize ?? 2048, minR = o.minRadius ?? 1.2;
  light.castShadow = true;
  if (light.shadow.mapSize.x !== size) { light.shadow.mapSize.set(size, size); light.shadow.map?.dispose(); (light.shadow as { map: unknown }).map = null; }
  const skip = /terrain|water|river|creek|swamp|falls|grass|vfx|forage|hazard|sky|cloud|aurora|decal|rain|snow/i;
  let casters = 0;
  const walk = (x: THREE.Object3D, banned: boolean) => {
    const b = banned || skip.test(x.name);
    const m = x as THREE.Mesh;
    if (m.isMesh && !b) {
      if ((m as THREE.InstancedMesh).isInstancedMesh) {
        if (m.userData.lod === 'near') { m.castShadow = true; casters++; }
      } else if (!(m as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(m.material) && !m.material.transparent && m.material.visible !== false) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const s = m.getWorldScale(_ws), r = (m.geometry.boundingSphere?.radius ?? 0) * Math.max(s.x, s.y, s.z);
        if (r >= minR && !m.castShadow) { m.castShadow = true; m.receiveShadow = true; casters++; }
      }
    }
    for (const c of x.children) walk(c, b);
  };
  root.updateMatrixWorld(true);
  walk(root, false);
  const every = Math.max(1, o.every ?? 2);
  let n = 0;
  if (every > 1) { light.shadow.autoUpdate = false; light.shadow.needsUpdate = true; }
  return {
    light, casters,
    /** Once per rendered frame: refresh the map every `every` frames. */
    tick() { if (every > 1 && ++n % every === 0) light.shadow.needsUpdate = true; },
  };
}
const _ws = new THREE.Vector3();

/**
 * three r184 runs the whole per-object path (node uniforms, bindings) for an InstancedMesh whose count is 0 and only
 * drops the draw at the very end; the forest LOD buckets, plant and fungus fields leave dozens empty every frame (295
 * of 1317 render calls over two Elderwood frames). An empty layer mask makes three cull them before any of that.
 * tick() before each render; the scene is rescanned every second for new instanced meshes.
 */
export class EmptyInstanceSkip {
  private list: THREE.InstancedMesh[] = [];
  private scanT = 1e9;
  constructor(private scene: THREE.Object3D) {}
  tick(dt: number) {
    if ((this.scanT += dt) > 1) {
      this.scanT = 0; this.list.length = 0;
      this.scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) this.list.push(o as THREE.InstancedMesh); });
    }
    for (const m of this.list) {
      const empty = m.count === 0, ud = m.userData;
      if (empty && ud.emptySkip === undefined) { ud.emptySkip = m.layers.mask; m.layers.mask = 0; }
      else if (!empty && ud.emptySkip !== undefined) { if (m.layers.mask === 0) m.layers.mask = ud.emptySkip; delete ud.emptySkip; }
    }
  }
}

/**
 * Distance LOD for heavy static meshes (the sheet-built place models are ~60k triangles each and were drawn whole even
 * 650 m away). Every mesh over `minTris` gets two simplified index buffers over the same vertices (batching.ts
 * simplifyIndex: 25 % and 6 %), as geometries sharing its attributes. tick() picks one by the mesh's projected radius
 * in pixels (full under `near` px … smallest). Every other plain mesh (not instanced / skinned / always-drawn) is
 * tracked too, and any of them under 1.5 px is culled (empty layer mask, like EmptyInstanceSkip): props a pixel wide.
 * New meshes (models that stream in) are picked up by a rescan every 2 s. Shadows use the same choice.
 */
export class HeavyMeshLod {
  private list: { m: THREE.Mesh; lods: THREE.BufferGeometry[]; r: number; c: THREE.Vector3 }[] = [];
  private seen = new WeakSet<THREE.Object3D>();
  private scanT = 1e9; private t = 0;
  private v = new THREE.Vector3(); private cp = new THREE.Vector3();
  constructor(private root: THREE.Object3D, private camera: THREE.PerspectiveCamera, private o: { minTris?: number; near?: number; mid?: number } = {}) {}
  tick(dt: number, viewHeight: number) {
    if ((this.scanT += dt) > 2) { this.scanT = 0; this.scan(); }
    if ((this.t += dt) < 0.1) return;
    this.t = 0;
    const k = (viewHeight / 2) / Math.tan((this.camera.fov * Math.PI) / 360), near = this.o.near ?? 140, mid = this.o.mid ?? 36;
    this.camera.getWorldPosition(this.cp);
    for (const e of this.list) {
      const m = e.m;
      this.v.copy(e.c).applyMatrix4(m.matrixWorld);
      const s = m.matrixWorld.getMaxScaleOnAxis(), r = e.r * s, d = Math.max(0.1, this.v.distanceTo(this.cp) - r);
      const px = (r / d) * k;
      if (e.lods.length > 1) { const g = px > near ? e.lods[0] : px > mid ? e.lods[1] : e.lods[2] ?? e.lods[1]; if (m.geometry !== g) m.geometry = g; }
      const ud = m.userData;
      if (px < 1.5 && ud.lodCull === undefined) { ud.lodCull = m.layers.mask; m.layers.mask = 0; }
      else if (px >= 1.5 && ud.lodCull !== undefined) { if (m.layers.mask === 0) m.layers.mask = ud.lodCull; delete ud.lodCull; }
    }
  }
  private scan() {
    const min = this.o.minTris ?? 20000;
    // meshes that left the scene: restore what we changed, forget them (they're tracked again if they come back)
    this.list = this.list.filter((e) => {
      let p: THREE.Object3D | null = e.m; while (p && p !== this.root) p = p.parent;
      if (p) return true;
      const ud = e.m.userData; if (ud.lodCull !== undefined) { if (e.m.layers.mask === 0) e.m.layers.mask = ud.lodCull; delete ud.lodCull; }
      if (e.lods.length) e.m.geometry = e.lods[0];
      this.seen.delete(e.m);
      return false;
    });
    this.root.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh || this.seen.has(m)) return;
      this.seen.add(m);
      if ((m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.frustumCulled === false || !m.geometry?.attributes.position || /terrain/.test(m.name)) return;
      const g = m.geometry, tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const e = { m, lods: [] as THREE.BufferGeometry[], r: g.boundingSphere!.radius, c: g.boundingSphere!.center.clone() };
      this.list.push(e);
      if (tris < min || g.groups.length > 1 || Array.isArray(m.material) || m.morphTargetInfluences) return;
      void (async () => {
        const lods = [g];
        for (const ratio of [0.25, 0.06]) {
          const idx = await simplifyIndex(g, ratio, ratio < 0.1 ? 0.05 : 0.02).catch(() => null);
          if (!idx) break;
          const l = new THREE.BufferGeometry();
          for (const [name, a] of Object.entries(g.attributes)) l.setAttribute(name, a);
          l.setIndex(idx); l.boundingSphere = g.boundingSphere; l.boundingBox = g.boundingBox;
          lods.push(l);
        }
        e.lods = lods;
      })();
    });
  }
  stats() { return { meshes: this.list.length, withLods: this.list.filter((e) => e.lods.length > 1).length, culled: this.list.filter((e) => e.m.userData.lodCull !== undefined).length }; }
}
