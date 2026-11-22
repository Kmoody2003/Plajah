// Plajah Vegetation — instanced fungi with their glow and spores (docs/plajah-vegetation.md §2.3, phase 4).
//
// Grown variants per species, instanced and sorted like plants (range + frustum). The material draws the cap's
// pattern from the per-vertex coord: CIRCUIT traces (grid cells → runs along and across the cap, pads at junctions,
// a pulse travelling out from the crown on the beat) or leopard SPOTS (cell noise with dark rims); jelly caps let light
// through at their edges; gills, cables and root-ball nodes glow. Spores are GPU particles: each rises from a cap,
// drifts and fades on its own clock — nothing is updated on the CPU after placement.
import * as THREE from 'three/webgpu';
import {
  abs, attribute, color, float, floor, fract, instancedBufferAttribute, length, max, min, mix, normalView, positionLocal,
  positionViewDirection, sin, smoothstep, step, time, uniform, uv, vec2, vec3, cos, dot,
} from 'three/tsl';
import type { FungusSpecies } from '../species';
import { pushAt, toLocal } from '../wind';
import { buildFungus, type FungusMesh } from './build';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface FungusSpot { x: number; y: number; z: number; yaw: number; species: number; scale: number }
export interface FungusOptions { variants?: number; range?: number; lowTier?: boolean; beat?: N; shadows?: boolean }

const h2 = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

/** Circuit traces in a (u, v) cell grid: 0…1 line mask and the cell's hash (for the pulse). */
function circuit(u: N, v: N, ku: number, kv: number): [N, N] {
  const g: N = vec2(u.mul(ku), v.mul(kv)), c: N = floor(g), f: N = fract(g).sub(0.5), h: N = h2(c);
  const along: N = float(1).sub(smoothstep(float(0.025), float(0.06), abs(f.y))).mul(step(h, float(0.42)));
  const across: N = float(1).sub(smoothstep(float(0.025), float(0.06), abs(f.x))).mul(step(float(0.42), h)).mul(step(h, float(0.72)));
  const pd: N = length(f), pad: N = smoothstep(float(0.2), float(0.14), pd).mul(smoothstep(float(0.04), float(0.09), pd)).mul(step(float(0.88), h));
  return [max(max(along, across), pad), h];
}

/** Leopard spots: distance to the nearest jittered cell point (3×3 cells), → [spot, rim]. */
function spots(u: N, v: N, ku: number, kv: number): [N, N] {
  const g: N = vec2(u.mul(ku), v.mul(kv)), c: N = floor(g), f: N = fract(g);
  let d: N = float(9);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const o: N = vec2(i, j), pc: N = c.add(o);
    const jp: N = vec2(h2(pc), h2(pc.add(17.3))).mul(0.7).add(0.15);
    d = min(d, length(o.add(jp).sub(f)));
  }
  const spot: N = smoothstep(float(0.3), float(0.24), d), rim: N = smoothstep(float(0.38), float(0.32), d).sub(spot);
  return [spot, rim];
}

function fungusMaterial(sp: FungusSpecies, beat: N, lowTier = false) {
  const L = sp.look, g = L.glow;
  // Physical on full tier: sheen = the soft velvety scatter of mushroom flesh, clearcoat = slime / moisture film
  const m = lowTier ? new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, metalness: 0 })
    : new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide, metalness: 0 });
  const part: N = attribute('aPart', 'float'), co: N = attribute('aCoord', 'vec2'), col: N = attribute('color', 'vec3');
  const gl: N = attribute('aGlow', 'float'), sw: N = attribute('aSway', 'vec2'), inst: N = attribute('aInst', 'vec4');
  const isTop: N = float(1).sub(step(float(0.5), part)), isUnder: N = step(float(0.5), part).mul(float(1).sub(step(float(1.5), part)));
  const isRoot: N = step(float(2.5), part).mul(float(1).sub(step(float(3.5), part))), isCable: N = step(float(3.5), part);
  const isStem: N = step(float(1.5), part).mul(float(1).sub(step(float(2.5), part)));
  const pulse: N = float(1).add(beat.mul(g.beat));
  // per mushroom: its own hash → which ones are slimy, their wobble phase and rate
  const ih: N = h2(inst.xy.mul(0.173)), ih2: N = h2(inst.xy.mul(0.311).add(7.1));
  const slimy: N = step(float(0.5), ih);                                   // about half are coated in slime
  // wetness 0…1: slimy caps fully wet, the rest damp; streaks of slime run down from the crown
  const streak: N = smoothstep(float(0.55), float(0.95), sin(co.x.mul(37).add(ih.mul(40)).add(sin(co.y.mul(9).add(ih2.mul(6))).mul(1.4))).mul(0.5).add(0.5));
  const wet: N = max(slimy.mul(float(0.75).add(streak.mul(0.25))), float(0.28).add(streak.mul(0.3)).mul(isTop.add(isStem.mul(0.6))));
  let base: N = col, em: N = vec3(0, 0, 0);
  if (L.pattern === 'circuit') {
    const [mask, h] = circuit(co.x, co.y, 26, 8);
    const zone: N = smoothstep(float(0.06), float(0.14), co.y).mul(smoothstep(float(0.97), float(0.88), co.y)).mul(isTop);
    const run: N = sin(co.y.mul(14).sub(time.mul(2.2)).add(h.mul(6.28))).mul(0.35).add(0.65);
    base = mix(base, color(L.patternColor), mask.mul(zone).mul(0.55));
    em = em.add(color(L.patternColor).mul(mask.mul(zone).mul(run).mul(g.pattern)).mul(pulse));
  } else if (L.pattern === 'spots') {
    const [spot, rim] = spots(co.x, co.y, 11, 5);
    const zone: N = smoothstep(float(0.05), float(0.12), co.y).mul(smoothstep(float(0.98), float(0.9), co.y)).mul(isTop);
    base = mix(mix(base, color(L.patternColor), spot.mul(zone)), color(0x2a2a1c), rim.mul(zone).mul(0.8));
    em = em.add(color(L.patternColor).mul(spot.mul(zone).mul(g.pattern * 0.5)).mul(pulse));
  }
  // wet flesh reads darker and more saturated
  base = base.mul(float(1).sub(wet.mul(0.18)));
  // light through the flesh (sub-surface): thin cap edges glow with the cap colour, the whole body carries a soft
  // inner fill so its shadow side isn't dead; the underside picks up some of the cap's scattered light
  const edge: N = float(1).sub(abs(dot(normalView, positionViewDirection)));
  const tl = Math.max(0.25, L.translucency);
  em = em.add(color(L.capTop).mul(isTop).mul(edge.mul(edge).mul(tl * 0.9).add(tl * 0.14)));
  em = em.add(base.mul(isTop.add(isStem.mul(0.6)).add(isUnder.mul(0.8))).mul(0.07 + tl * 0.08));
  em = em.add(color(g.color).mul(isUnder.mul(gl).mul(g.gills)).mul(pulse));
  em = em.add(color(g.color).mul(isCable.mul(g.cables)).mul(pulse).mul(sin(time.mul(3).add(co.y.mul(9))).mul(0.25).add(0.75)));
  em = em.add(color(g.color).mul(isRoot.mul(gl).mul(0.7)).mul(pulse));
  m.colorNode = base;
  m.emissiveNode = em;
  // slime is glossy, dry flesh stays soft
  m.roughnessNode = mix(mix(float(0.75), float(L.roughness), isTop), float(0.16), wet.mul(isTop.add(isStem).min(1)).mul(0.85));
  if (!lowTier) {
    const pm = m as THREE.MeshPhysicalNodeMaterial;
    pm.sheenNode = mix(color(L.capTop), vec3(1, 1, 1), float(0.35)).mul(isTop.add(isStem.mul(0.6)).mul(0.55));
    pm.sheenRoughnessNode = float(0.7);
    pm.clearcoatNode = wet.mul(isTop.add(isStem.mul(0.8)).min(1));
    pm.clearcoatRoughnessNode = mix(float(0.18), float(0.04), slimy);
  }
  // gelatin motion: every cap breathes in a slow squash-and-stretch (jelly species more), bounces on the beat, and
  // lags behind its stem in a soft sway; pushing it sets it jiggling. The foot stays put (weight = sway height²).
  const k2: N = sw.x.mul(sw.x), jelly = 0.35 + sp.wobble * 0.65;
  const w: N = float(2.1).add(ih2.mul(1.6));
  const breathe: N = sin(time.mul(w).add(sw.y.mul(6.28)).add(ih.mul(6.28))).mul(0.022 * jelly).add(beat.mul(0.03 * jelly));
  const sx: N = sin(time.mul(w.mul(0.55)).add(ih.mul(9))), sz: N = cos(time.mul(w.mul(0.47)).add(ih2.mul(9)));
  const sway: N = (vec2 as N)(sx, sz).mul(0.018 * jelly);
  const push: N = toLocal(pushAt(inst.xy), inst.z), k: N = k2.mul(sp.wobble * 0.12 + 0.03);
  const jig: N = sin(time.mul(9).add(sw.y.mul(6.28))).mul(length(push).mul(0.8)).mul(k);
  const squash: N = vec3(float(1).add(breathe.mul(k2)), float(1).sub(breathe.mul(1.6).mul(k2)), float(1).add(breathe.mul(k2)));
  const lateral: N = vec3(push.x.mul(k).add(jig).add(sway.x.mul(k2)), 0, push.y.mul(k).sub(jig).add(sway.y.mul(k2)));
  m.positionNode = positionLocal.mul(squash).add(lateral);
  return m;
}

interface Bucket { mesh: THREE.InstancedMesh; spots: FungusSpot[]; radius: number; fm: FungusMesh }

export class FungusField {
  readonly group = new THREE.Group();
  readonly stats = { drawn: 0, culled: 0, triangles: 0, spores: 0 };
  private buckets: Bucket[] = [];
  private range: number;
  private t = 1;
  private frustum = new THREE.Frustum(); private pv = new THREE.Matrix4(); private sph = new THREE.Sphere();

  constructor(species: FungusSpecies[], spots: FungusSpot[], o: FungusOptions = {}) {
    this.group.name = 'fungi';
    const variants = o.variants ?? 3, beat: N = o.beat ?? uniform(0), lo = !!o.lowTier;
    this.range = o.range ?? (lo ? 45 : 80);
    species.forEach((sp, si) => {
      const mat = fungusMaterial(sp, beat, lo);
      const sporeAt: number[] = [];
      for (let vi = 0; vi < variants; vi++) {
        const mine = spots.filter((p, k) => p.species === si && k % variants === vi);
        if (!mine.length) continue;
        const fm = buildFungus(sp, si * 53 + vi * 11 + 5, lo ? 0.6 : 1);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(fm.position, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(fm.normal, 3));
        g.setAttribute('color', new THREE.BufferAttribute(fm.color, 3));
        g.setAttribute('aPart', new THREE.BufferAttribute(fm.part, 1));
        g.setAttribute('aCoord', new THREE.BufferAttribute(fm.coord, 2));
        g.setAttribute('aGlow', new THREE.BufferAttribute(fm.glow, 1));
        g.setAttribute('aSway', new THREE.BufferAttribute(fm.sway, 2));
        g.setIndex(new THREE.BufferAttribute(fm.index, 1));
        g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 4), 4));
        g.computeBoundingSphere();
        const mesh = new THREE.InstancedMesh(g, mat, mine.length);
        mesh.frustumCulled = false; mesh.castShadow = !!o.shadows; mesh.receiveShadow = true; mesh.count = 0;
        mesh.name = `fungus-${sp.id}-${vi}`;
        this.group.add(mesh);
        this.buckets.push({ mesh, spots: mine, radius: g.boundingSphere!.radius, fm });
        if (sp.spores) for (const p of mine) for (const [cx, cy, cz, cr] of fm.caps) {
          const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
          const n = Math.max(1, Math.round(sp.spores.count * (lo ? 0.5 : 1) * Math.min(1.5, cr / sp.cap.radius)));
          for (let k = 0; k < n; k++) {
            const lx = cx * p.scale, lz = cz * p.scale;
            sporeAt.push(p.x + lx * c + lz * s, p.y + cy * p.scale, p.z - lx * s + lz * c, Math.random(), cr * p.scale);
          }
        }
      }
      if (sp.spores && sporeAt.length) this.group.add(this.sporeCloud(sp, sporeAt, beat));
    });
  }

  /** GPU spores: each particle rises from its cap on its own clock, drifting and fading; additive. */
  private sporeCloud(sp: FungusSpecies, at: number[], beat: N) {
    const n = at.length / 5, a = new Float32Array(n * 4), r = new Float32Array(n);
    for (let k = 0; k < n; k++) { a.set(at.slice(k * 5, k * 5 + 4), k * 4); r[k] = at[k * 5 + 4]; }
    const P: N = instancedBufferAttribute(new THREE.InstancedBufferAttribute(a, 4));
    const Rr: N = instancedBufferAttribute(new THREE.InstancedBufferAttribute(r, 1));
    const seed: N = P.w, life: N = fract(time.mul(0.12 + 0.1 * (sp.spores!.rise / 3)).add(seed));
    const ang: N = seed.mul(40), spread: N = Rr.mul(life.mul(0.8).add(0.3));
    const pos: N = vec3(P.x.add(cos(ang).mul(spread)).add(sin(time.mul(0.7).add(seed.mul(9))).mul(0.25).mul(life)), P.y.add(life.mul(sp.spores!.rise)), P.z.add(sin(ang).mul(spread)).add(cos(time.mul(0.6).add(seed.mul(7))).mul(0.25).mul(life)));
    const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.positionNode = pos;
    mat.scaleNode = float(0.045).add(seed.mul(0.04));
    const disc: N = smoothstep(float(0.5), float(0.0), length(uv().sub(0.5)));
    const fade: N = sin(life.mul(Math.PI));
    mat.colorNode = color(sp.spores!.color).mul(float(1.6).add(beat.mul(1.2)));
    mat.opacityNode = disc.mul(disc).mul(fade);
    const s = new THREE.Sprite(mat);
    s.count = n; s.frustumCulled = false; s.name = `spores-${sp.id}`;
    this.stats.spores += n;
    return s;
  }

  update(camera: THREE.Camera, dt: number) {
    this.t += dt;
    if (this.t < 0.2) return;
    this.t = 0;
    const pos = camera.getWorldPosition(new THREE.Vector3());
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pv);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const r2 = this.range ** 2, st = this.stats; st.drawn = st.culled = st.triangles = 0;
    for (const b of this.buckets) {
      let n = 0;
      const a = b.mesh.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
      for (const p of b.spots) {
        const d2 = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
        this.sph.center.set(p.x, p.y + b.fm.height * 0.5 * p.scale, p.z); this.sph.radius = b.radius * p.scale;
        if (d2 > r2 || !this.frustum.intersectsSphere(this.sph)) { st.culled++; continue; }
        m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), s3.set(p.scale, p.scale, p.scale));
        b.mesh.setMatrixAt(n, m4); a.setXYZW(n, p.x, p.z, p.yaw, p.scale); n++;
      }
      b.mesh.count = n; b.mesh.instanceMatrix.needsUpdate = true; a.needsUpdate = true;
      st.drawn += n; st.triangles += n * (b.mesh.geometry.index!.count / 3);
    }
  }
}
