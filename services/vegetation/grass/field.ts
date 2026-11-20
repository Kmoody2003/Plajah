// Plajah Vegetation — GPU grass fields (docs/plajah-vegetation.md §2.3, phase 3).
//
// Nothing is stored per blade. Each species draws two rings around the camera as one instanced draw each: a dense near
// square of 1 m cells and a sparse far square of 2 m cells with wider, simpler blades. The vertex shader turns the
// instance number into a world cell + a blade slot, and everything else — where in the cell, how tall, which way it
// faces, whether it grows there at all — comes from a hash of that WORLD cell, so the field is fixed to the ground and
// never shimmers as the rings follow the camera. Height and cover come from the ground textures (grass/ground.ts);
// blades lean with the one wind (wind.ts), part around impulses (dashes, blasts) and lie flat where something walked
// (the trample map) then spring back. Rings cross-fade by thinning (a blade either is or isn't), so no alpha blending.
import * as THREE from 'three/webgpu';
import {
  abs, color, cos, dot, float, floor, fract, instanceIndex, length, max, min, mix, normalize, normalView, positionLocal,
  positionViewDirection, sin, smoothstep, step, texture, time, transformNormalToView, uniform, uv, vec2, vec3,
} from 'three/tsl';
import type { GrassSpecies } from '../species';
import { impulseAt, wind, windAt } from '../wind';
import type { Ground } from './ground';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface GrassOptions {
  lowTier?: boolean;
  /** Half-size (m) of the dense near square and of the sparse far square. */
  near?: number; far?: number;
  /** Scale on every species' density (near ring) and the far ring's share of it. */
  densityScale?: number; farShare?: number;
  beat?: N;
  /** Near blades cast shadows (high tier only; costly). */
  shadows?: boolean;
}

export interface GrassStats { blades: number; draws: number; triangles: number }

/** A blade: `segments` rows narrowing to a point; x = across (−0.5…0.5, tapered), y = 0…1 up. */
export function bladeGeometry(segments: number): THREE.InstancedBufferGeometry {
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments, w = 1 - Math.pow(t, 1.5) * 0.8;
    pos.push(-0.5 * w, t, 0, 0.5 * w, t, 0); uvs.push(0, t, 1, t);
  }
  pos.push(0, 1, 0); uvs.push(0.5, 1);
  for (let i = 0; i < segments - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const l = (segments - 1) * 2; idx.push(l, l + 1, l + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** Per-blade random 0…1 from a world cell, a slot and a salt (cells wrap every 289 m: far beyond any repeat you'd see). */
function hash(ix: N, iz: N, k: N, salt: number): N {
  const p: N = vec3(ix.mod(289), iz.mod(289), k.add(salt * 17.31));
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
}

/** Smooth value noise at world (x, z) / size: the clumps. */
function clumpNoise(x: N, z: N, size: number): N {
  const gx: N = x.div(size), gz: N = z.div(size), ix: N = floor(gx), iz: N = floor(gz);
  const fx: N = fract(gx), fz: N = fract(gz);
  const sx: N = fx.mul(fx).mul(fx.mul(-2).add(3)), sz: N = fz.mul(fz).mul(fz.mul(-2).add(3));
  const h = (a: N, b: N) => hash(a, b, float(0), 91);
  return mix(mix(h(ix, iz), h(ix.add(1), iz), sx), mix(h(ix, iz.add(1)), h(ix.add(1), iz.add(1)), sx), sz);
}

interface Ring { mesh: THREE.Mesh; origin: N; cell: number; W: number; bpc: number }

export class GrassField {
  readonly group = new THREE.Group();
  readonly stats: GrassStats = { blades: 0, draws: 0, triangles: 0 };
  private rings: Ring[] = [];
  private camPos = uniform(new THREE.Vector2());
  private camFwd = uniform(new THREE.Vector2(0, -1));
  private v = new THREE.Vector3();

  constructor(species: GrassSpecies[], private ground: Ground, o: GrassOptions = {}) {
    this.group.name = 'grass';
    const lo = !!o.lowTier;
    const near = o.near ?? (lo ? 16 : 30), far = o.far ?? (lo ? 45 : 85);
    const dScale = o.densityScale ?? (lo ? 0.4 : 1), farShare = o.farShare ?? (lo ? 0.08 : 0.12);
    const beat: N = o.beat ?? uniform(0);
    species.slice(0, 4).forEach((sp, si) => {
      for (const ring of ['near', 'far'] as const) {
        const cell = ring === 'near' ? 1 : 2, half = ring === 'near' ? near : far;
        const W = Math.ceil((half * 2) / cell);
        const want = sp.density * (ring === 'near' ? dScale : dScale * farShare) * cell * cell;
        const bpc = Math.max(1, Math.ceil(want)), frac = want / bpc;
        const geo = bladeGeometry(ring === 'near' ? (lo ? 4 : 5) : 2);
        geo.instanceCount = W * W * bpc;
        const origin = uniform(new THREE.Vector2());
        const mat = this.material(sp, si, { ring, half, near, cell, W, bpc, frac, origin, beat, lo });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = ring === 'near' && !!o.shadows;
        mesh.name = `grass-${sp.id}-${ring}`;
        this.group.add(mesh);
        this.rings.push({ mesh, origin, cell, W, bpc });
        this.stats.blades += geo.instanceCount; this.stats.draws++;
        this.stats.triangles += geo.instanceCount * (geo.index!.count / 3);
      }
    });
  }

  private material(sp: GrassSpecies, channel: number, r: { ring: 'near' | 'far'; half: number; near: number; cell: number; W: number; bpc: number; frac: number; origin: N; beat: N; lo: boolean }) {
    const g = this.ground, b = g.bounds;
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    // ── which blade: instance → world cell + slot ──
    const i: N = instanceIndex.toFloat();
    const c: N = floor(i.add(0.5).div(r.bpc)), k: N = i.sub(c.mul(r.bpc));
    const cz: N = floor(c.add(0.5).div(r.W)), cx: N = c.sub(cz.mul(r.W));
    const ix: N = r.origin.x.add(cx), iz: N = r.origin.y.add(cz);
    const R = (s: number) => hash(ix, iz, k, s);
    const bx: N = ix.add(R(1)).mul(r.cell), bz: N = iz.add(R(2)).mul(r.cell);
    const bxz: N = vec2(bx, bz);
    // ── the ground: height, whether this species grows here, trample ──
    const guv: N = vec2(bx.sub(b.x0).div(b.size), bz.sub(b.z0).div(b.size));
    const inside: N = step(float(0), guv.x).mul(step(guv.x, float(1))).mul(step(float(0), guv.y)).mul(step(guv.y, float(1)));
    const gh: N = (texture(g.height, guv) as N).level(float(0) as N).r;
    const cover: N = (texture(g.cover, guv) as N).level(float(0) as N)[(['r', 'g', 'b', 'a'] as const)[channel]];
    const tr: N = texture(g.trample, guv).level(float(0) as N);
    const trDir: N = tr.xy.mul(2).sub(1), trAmt: N = tr.z;
    const cl: N = clumpNoise(bx, bz, sp.clump.size);
    // clumps: patches with gaps between them (sharpened noise), not an even carpet
    const dens: N = cover.mul(mix(float(1), smoothstep(float(0.3), float(0.72), cl).mul(1.6), sp.clump.strength)).mul(r.frac).mul(inside);
    // ── ring cross-fade (thinning) and the cull behind the camera ──
    const toCam: N = bxz.sub(this.camPos), dist: N = length(toCam);
    const fade: N = r.ring === 'near'
      ? smoothstep(float(r.half * 0.96), float(r.half * 0.72), dist)
      : smoothstep(float(r.near * 0.6), float(r.near * 0.88), dist).mul(smoothstep(float(r.half * 0.98), float(r.half * 0.7), dist));
    const ahead: N = step(float(-4), dot(toCam, this.camFwd)).max(step(dist, float(5)));
    const present: N = step(R(3), dens).mul(step(R(4), fade)).mul(ahead);
    // ── the blade's shape ──
    const h: N = float(sp.blade.height).mul(R(5).sub(0.5).mul(2 * sp.blade.heightJitter).add(1))
      .mul(mix(float(1), cl.mul(0.8).add(0.55), sp.clump.strength)).mul(fade.mul(0.35).add(0.65)).mul(present);
    const yaw: N = R(6).mul(6.2832), cy: N = cos(yaw), sy: N = sin(yaw);
    const t: N = positionLocal.y, across: N = positionLocal.x;
    const width = sp.blade.width * (r.ring === 'far' ? 1.9 : 1);
    const lean: N = R(7).mul(sp.blade.splay).add(sp.blade.curve);
    const local: N = vec3(across.mul(width), t.mul(h), t.mul(t).mul(h).mul(sin(lean)));
    const rot = (p: N) => vec3(p.x.mul(cy).add(p.z.mul(sy)), p.y, p.z.mul(cy).sub(p.x.mul(sy)));
    // ── wind, impulses, trample ──
    const w: N = windAt(bxz);
    const flutter: N = sin(time.mul(R(8).mul(3).add(4)).add(R(9).mul(6.2832))).mul(w.add(0.2)).mul(sp.wind.flutter * 0.1);
    const push: N = wind.dir.mul(w.mul(sp.wind.sway).add(flutter)).add(impulseAt(bxz).mul(0.9)).add(trDir.mul(trAmt.mul(1.6)));
    const t2: N = t.mul(t);
    let bend: N = push.mul(t2).mul(h);
    const bl: N = max(length(bend), float(1e-4)), lim: N = min(bl, h.mul(0.92));
    bend = bend.div(bl).mul(lim);
    const drop: N = lim.mul(lim).div(max(h, float(0.05))).mul(0.5).add(t.mul(h).mul(trAmt.mul(0.7)));
    const world: N = vec3(bx, gh, bz).add(rot(local)).add(vec3(bend.x, drop.negate(), bend.y));
    m.positionNode = world;
    // rounded blade: the normal turns across the width, softened toward up so a field reads as a soft surface
    const nL: N = normalize(vec3(uv().x.sub(0.5).mul(1.4), 0.35, 1));
    m.normalNode = transformNormalToView(normalize(mix(rot(nL), vec3(0, 1, 0), 0.35)));
    // ── colour: dark base → mid → tip, per-blade brightness, the art's bright streak, glow, light through ──
    const tc: N = uv().y;
    const col: N = mix(mix((color(sp.color.base) as N), (color(sp.color.mid) as N), smoothstep(float(0), float(0.5), tc)), (color(sp.color.tip) as N), smoothstep(float(0.45), float(1), tc));
    const streak: N = float(1).sub(smoothstep(float(0.05), float(0.3), abs(uv().x.sub(0.5)))).mul(sp.color.streak * 0.6).mul(tc);
    const ao: N = mix(float(0.35), float(1), tc.pow(0.6));
    m.colorNode = col.mul(R(10).sub(0.5).mul(2 * sp.color.jitter).add(1)).mul(streak.add(1)).mul(ao);
    const edge: N = float(1).sub(abs(dot(normalView, positionViewDirection)));
    let em: N = (color(sp.color.tip) as N).mul(edge.mul(sp.translucency * 0.35)).mul(tc);
    if (sp.glow) {
      const gl = sp.glow;
      em = em.add((color(gl.color) as N).mul(smoothstep(float(gl.from), float(1), tc)).mul(float(gl.strength).add(r.beat.mul(gl.beat))));
    }
    m.emissiveNode = em;
    return m;
  }

  /** Move the rings with the camera and spring the trample back (once a frame). */
  update(camera: THREE.Camera, dt: number) {
    const p = camera.getWorldPosition(this.v);
    (this.camPos.value as THREE.Vector2).set(p.x, p.z);
    camera.getWorldDirection(this.v);
    const f = this.camFwd.value as THREE.Vector2;
    f.set(this.v.x, this.v.z); if (f.lengthSq() < 1e-6) f.set(0, -1); else f.normalize();
    camera.getWorldPosition(this.v);
    for (const r of this.rings) (r.origin.value as THREE.Vector2).set(Math.floor(this.v.x / r.cell) - r.W / 2, Math.floor(this.v.z / r.cell) - r.W / 2);
    this.ground.update(dt);
  }
}
