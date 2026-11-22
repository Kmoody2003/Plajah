// Plajah VFX — draws the particle sim with three/webgpu (works on the WebGL fallback too).
// One instanced draw per layer: 'add' = glowing sprites (sparks streak along their screen-space velocity, soft
// glows, rings), 'alpha' = smoke and dust, 'shard' = small lit 3D chunks (ice, crystal, rock, armour). Flash lights
// come from a fixed pool so the shader set never changes mid-fight.
import * as THREE from 'three/webgpu';
import {
  atan, cameraViewMatrix, float, instancedBufferAttribute, length, mix, select, sin, smoothstep, step, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { ParticleSim, type Layer, type LayerOut, type Recipe, type SpawnOpts } from './sim';
import { RECIPES } from './recipes';
import { Slashes, Trail, type SlashOpts, type SlashSpec, type TrailOpts } from './trails';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

function attrs(o: LayerOut) {
  const mk = (a: Float32Array) => { const b = new THREE.InstancedBufferAttribute(a, 4); b.setUsage(THREE.DynamicDrawUsage); return b; };
  return { posAge: mk(o.posAge), velSize: mk(o.velSize), color: mk(o.color), misc: mk(o.misc) };
}

function spriteLayer(o: LayerOut, additive: boolean) {
  const A = attrs(o);
  const P: N = instancedBufferAttribute(A.posAge), V: N = instancedBufferAttribute(A.velSize);
  const C: N = instancedBufferAttribute(A.color), M: N = instancedBufferAttribute(A.misc);
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  mat.positionNode = P.xyz;
  // sparks: rotate the quad to the velocity as seen on screen and stretch it by speed
  const vv: N = cameraViewMatrix.mul(vec4(V.xyz, 0)).xy;
  const isStreak: N = step(0.001, M.x);
  mat.rotationNode = mix(M.z, atan(vv.y, vv.x), isStreak);
  mat.scaleNode = vec2(V.w.add(length(vv).mul(M.x)), V.w);
  // shapes: 0 soft glow, 1 spark (hot core), 2 ring, 3 smoke puff
  const c: N = uv().sub(0.5), r: N = length(c).mul(2);
  const soft: N = smoothstep(float(1), float(0), r).pow(2);
  const spark: N = smoothstep(float(1), float(0.0), r).pow(3).mul(1.6);
  const ring: N = smoothstep(float(0.8), float(0.9), r).mul(smoothstep(float(1), float(0.93), r));
  const lumps: N = sin(c.x.mul(9).add(M.w.mul(40))).mul(sin(c.y.mul(8).add(M.w.mul(23)))).mul(0.25).add(0.75);
  const smoke: N = smoothstep(float(1), float(0.15), r).mul(lumps);
  const sh: N = M.y;
  const mask: N = select(sh.lessThan(0.5), soft, select(sh.lessThan(1.5), spark, select(sh.lessThan(2.5), ring, smoke)));
  // the hot centre of glows burns toward white
  const hot: N = select(sh.lessThan(1.5), smoothstep(float(0.5), float(0), r).mul(0.6), float(0));
  mat.colorNode = mix(C.rgb, vec3(C.r.max(C.g).max(C.b)), hot);
  mat.opacityNode = mask.mul(C.a);
  const s = new THREE.Sprite(mat);
  s.count = 0; s.frustumCulled = false; s.renderOrder = additive ? 20 : 19;
  return { obj: s as THREE.Object3D, attrs: A, setCount: (n: number) => { s.count = n; } };
}

function shardLayer(o: LayerOut, cap: number) {
  const A = attrs(o);
  const C: N = instancedBufferAttribute(A.color);
  const geo = new THREE.OctahedronGeometry(0.5, 0);
  geo.scale(0.55, 1.4, 0.35); // a sliver, not a ball
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.1, transparent: true });
  mat.colorNode = C.rgb.mul(0.35);
  mat.emissiveNode = C.rgb.mul(0.8);
  mat.opacityNode = C.a;
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    obj: mesh as THREE.Object3D, attrs: A,
    setCount: (n: number) => {
      mesh.count = n;
      for (let i = 0; i < n; i++) {
        const k = i * 4, rot = o.misc[k + 2], seed = o.misc[k + 3], s = o.velSize[k + 3];
        e.set(rot + seed * 6, rot * 0.7 + seed * 11, seed * 3); q.setFromEuler(e);
        p.set(o.posAge[k], o.posAge[k + 1], o.posAge[k + 2]); sc.setScalar(s);
        mesh.setMatrixAt(i, m4.compose(p, q, sc));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export interface VfxOptions {
  caps?: Partial<Record<Layer, number>>;
  lights?: number;
  ground?: (x: number, z: number, y: number) => number | null;
  seed?: number;
}

/** The particle system a game adds to its scene: spawn(recipe, point, opts) and update(dt) once a frame. */
export class VfxSystem {
  readonly group = new THREE.Group();
  readonly sim: ParticleSim;
  private layers: { layer: Layer; attrs: ReturnType<typeof attrs>; setCount: (n: number) => void }[] = [];
  private lights: { light: THREE.PointLight; life: number; max: number; peak: number }[] = [];
  readonly stats = { live: 0, add: 0, alpha: 0, shard: 0, slashes: 0, trails: 0, ms: 0 };
  readonly slashes = new Slashes(6);
  private trails: Trail[] = [];
  /** Recipes a slash may name for its sparks (filled by the caller, e.g. with RECIPES). */
  recipes: Record<string, Recipe> = RECIPES;

  constructor(opts: VfxOptions = {}) {
    this.sim = new ParticleSim(opts.caps, opts.seed ?? 7);
    this.sim.ground = opts.ground ?? null;
    this.group.name = 'vfx';
    const add = spriteLayer(this.sim.pools.add.out, true), alpha = spriteLayer(this.sim.pools.alpha.out, false);
    const shard = shardLayer(this.sim.pools.shard.out, this.sim.pools.shard.cap);
    for (const [layer, l] of [['alpha', alpha], ['add', add], ['shard', shard]] as const) { this.group.add(l.obj); this.layers.push({ layer, attrs: l.attrs, setCount: l.setCount }); }
    this.group.add(this.slashes.group);
    this.slashes.onSparks = (id, at, dir, tint) => { const r = this.recipes[id]; if (r) this.sim.spawn(r, [at.x, at.y, at.z], { dir: [dir.x, dir.y, dir.z], tint }); };
    for (let k = 0; k < (opts.lights ?? 2); k++) {
      const light = new THREE.PointLight(0xffffff, 0, 6, 2);
      light.castShadow = false;
      this.group.add(light);
      this.lights.push({ light, life: 0, max: 1, peak: 0 });
    }
  }

  spawn(recipe: Recipe, at: THREE.Vector3 | [number, number, number], opts: SpawnOpts = {}) {
    const p: [number, number, number] = Array.isArray(at) ? at : [at.x, at.y, at.z];
    this.sim.spawn(recipe, p, opts);
  }

  /** A crescent of light for a strike, centred `at`, facing `o.forward`. */
  slash(spec: SlashSpec, at: THREE.Vector3, o: SlashOpts) { this.slashes.spawn(spec, at, o); }

  /** A ribbon trail the caller feeds each frame (trail.emitting = true; trail.push(base, tip)). */
  trail(opts: TrailOpts = {}) { const t = new Trail(opts); this.trails.push(t); this.group.add(t.mesh); return t; }

  removeTrail(t: Trail) { this.trails = this.trails.filter((x) => x !== t); t.mesh.removeFromParent(); t.mesh.geometry.dispose(); }

  /** Camera shake amount (0..1) requested by recent effects; the game decides how to apply it. */
  get shake() { return this.sim.shake; }

  update(dt: number, camera?: THREE.Camera) {
    const t0 = performance.now();
    this.sim.step(Math.min(dt, 0.05));
    this.slashes.update(Math.min(dt, 0.05));
    for (const t of this.trails) t.update(Math.min(dt, 0.05), camera);
    this.stats.slashes = this.slashes.active; this.stats.trails = this.trails.filter((t) => t.visibleSamples > 1).length;
    for (const l of this.layers) {
      const out = this.sim.pools[l.layer].out, n = out.count;
      for (const a of Object.values(l.attrs)) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(4, n * 4)); a.needsUpdate = true; }
      l.setCount(n);
      this.stats[l.layer] = n;
    }
    // flash lights: take the newest requests, fade each over its life
    for (const req of this.sim.lights.splice(0)) {
      const slot = this.lights.reduce((a, b) => (a.life <= b.life ? a : b));
      slot.light.position.set(req.p[0], req.p[1], req.p[2]);
      slot.light.color.setRGB(req.rgb[0], req.rgb[1], req.rgb[2]);
      slot.light.distance = req.range; slot.peak = req.intensity; slot.life = slot.max = req.life;
    }
    for (const s of this.lights) {
      s.life = Math.max(0, s.life - dt);
      const k = s.life / s.max;
      s.light.intensity = s.peak * k * k;
    }
    this.stats.live = this.sim.liveCount;
    this.stats.ms = performance.now() - t0;
  }

  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); });
    this.group.removeFromParent();
  }
}
