// Dynamic physics for Ravencrest: a global wind field, verlet cloth (banners,
// curtains), verlet rope chains (hair, ropes, tassels) and a small rigid-body
// world for loose props (barrels, crates, debris) with bounce and friction.
//
// Everything collides against the level's existing CollisionWorld (BVH capsule
// resolve + ground rays), so props rest on the same floors the player walks on.
// Fixed-substep integration keeps it stable and frame-rate independent.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';

// ── Wind ─────────────────────────────────────────────────────────────────────
/** Gusting wind shared by cloth, hair, foliage shaders, water and flames. */
export class Wind {
  /** Horizontal unit direction the wind blows TOWARD. */
  readonly dir = new THREE.Vector3(0.83, 0, 0.55).normalize();
  /** Base strength (m/s at full gust). */
  base = 2.2;
  /** Current gust factor 0..1 (slow weather rhythm). */
  gust = 0.5;
  /** Current strength = base × gust curve. */
  strength = 1.5;
  private t = 0;
  private angle = Math.atan2(0.55, 0.83);

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const g = 0.5 + 0.28 * Math.sin(t * 0.45) + 0.22 * Math.sin(t * 0.13 + 1.7) + 0.12 * Math.sin(t * 1.9);
    this.gust = THREE.MathUtils.clamp(g, 0.05, 1);
    this.strength = this.base * (0.35 + this.gust * 0.95);
    const a = this.angle + Math.sin(t * 0.045) * 0.45; // slow veer ±26°
    this.dir.set(Math.cos(a), 0, Math.sin(a));
  }

  private ph = 0;
  /** Wind vector at a world point — gusts travel across the map, so flags near
   *  each other ripple together and distant ones are out of phase. */
  at(pos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.ph = pos.x * 0.055 + pos.z * 0.04 - this.t * 1.15;
    const s = this.strength * (0.7 + 0.5 * Math.sin(this.ph) + 0.25 * Math.sin(this.ph * 2.7 + 1.3));
    out.copy(this.dir).multiplyScalar(Math.max(0, s));
    out.y = Math.sin(this.ph * 1.6) * 0.14 * this.strength;
    return out;
  }
}

/** Shared singleton — every system reads the same weather. */
export const wind = new Wind();

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// ── Verlet cloth ─────────────────────────────────────────────────────────────
export interface ClothColliders {
  world?: CollisionWorld | null;
  /** Extra sphere colliders (the player, dynamic props): centre + radius. */
  spheres?: { c: THREE.Vector3; r: number }[];
}

/**
 * A rectangular cloth simulated in world space. The top row is pinned.
 * Build the mesh, position/rotate it where it hangs, then call update().
 */
export class VerletCloth {
  readonly mesh: THREE.Mesh;
  private pos: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private pinned: boolean[] = [];
  private constraints: { a: number; b: number; rest: number }[] = [];
  private idx: number[][] = [];
  private cols = 0;
  private rows = 0;
  private acc = 0;

  constructor(width: number, height: number, segX: number, segY: number, material: THREE.Material) {
    this.cols = segX + 1;
    this.rows = segY + 1;
    const geo = new THREE.PlaneGeometry(width, height, segX, segY);
    geo.translate(0, -height / 2, 0); // top edge at the mesh origin
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(new THREE.Vector3().fromBufferAttribute(p, i));
      this.prev.push(new THREE.Vector3().fromBufferAttribute(p, i));
      this.pinned.push(false);
    }
    for (let y = 0; y < this.rows; y++) {
      this.idx.push([]);
      for (let x = 0; x < this.cols; x++) this.idx[y].push(y * this.cols + x);
    }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = this.idx[y][x];
        if (x < segX) this.link(i, this.idx[y][x + 1]);
        if (y < segY) this.link(i, this.idx[y + 1][x]);
        if (x < segX && y < segY) { this.link(i, this.idx[y + 1][x + 1]); this.link(this.idx[y][x + 1], this.idx[y + 1][x]); }
      }
    }
    for (let x = 0; x < this.cols; x++) this.pinned[this.idx[0][x]] = true;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  private link(a: number, b: number) {
    this.constraints.push({ a, b, rest: this.pos[a].distanceTo(this.pos[b]) });
  }

  /** Call once after the mesh is placed in the scene: bake world positions. */
  init() {
    this.mesh.updateMatrixWorld(true);
    for (let i = 0; i < this.pos.length; i++) {
      this.pos[i].applyMatrix4(this.mesh.matrixWorld);
      this.prev[i].copy(this.pos[i]);
    }
    // Rest lengths must be world-space too.
    for (const c of this.constraints) c.rest = this.pos[c.a].distanceTo(this.pos[c.b]);
  }

  /** @param windScale 1 outdoors; ~0.1 for indoor hangings (air currents only). */
  update(dt: number, w: Wind, col: ClothColliders = {}, windScale = 1) {
    this.acc = Math.min(this.acc + dt, 0.06);
    const step = 1 / 60;
    while (this.acc >= step) { this.simulate(step, w, col, windScale); this.acc -= step; }
    // Write back into the mesh's local space.
    const m = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const p = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.pos.length; i++) {
      _v1.copy(this.pos[i]).applyMatrix4(m);
      p.setXYZ(i, _v1.x, _v1.y, _v1.z);
    }
    p.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  private simulate(dt: number, w: Wind, col: ClothColliders, windScale = 1) {
    const drag = 0.985;
    // Integrate.
    for (let i = 0; i < this.pos.length; i++) {
      if (this.pinned[i]) continue;
      const p = this.pos[i], pr = this.prev[i];
      _v1.copy(p).sub(pr).multiplyScalar(drag);
      pr.copy(p);
      p.add(_v1);
      p.y -= 9.8 * dt * dt;
      // Wind: stronger when the particle's row hangs free (top rows barely move).
      w.at(p, _v2);
      const rowF = 1 - Math.floor(i / this.cols) / this.rows;
      p.addScaledVector(_v2, dt * dt * (2.2 - rowF * 1.2) * windScale);
    }
    // Constraints.
    for (let it = 0; it < 3; it++) {
      for (const c of this.constraints) {
        const a = this.pos[c.a], b = this.pos[c.b];
        _v1.copy(b).sub(a);
        const d = _v1.length() || 1e-6;
        const diff = (d - c.rest) / d;
        const pa = this.pinned[c.a], pb = this.pinned[c.b];
        if (!pa && !pb) { a.addScaledVector(_v1, diff * 0.5); b.addScaledVector(_v1, -diff * 0.5); }
        else if (!pa && pb) a.addScaledVector(_v1, diff);
        else if (pa && !pb) b.addScaledVector(_v1, -diff);
      }
      // Re-pin (mesh may be static, but keep exact).
      this.mesh.updateMatrixWorld(true);
      const top = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let x = 0; x < this.cols; x++) {
        const i = this.idx[0][x];
        _v1.fromBufferAttribute(top, i).applyMatrix4(this.mesh.matrixWorld);
        this.pos[i].copy(_v1); this.prev[i].copy(_v1);
      }
    }
    // Collisions: ground + spheres.
    if (col.world || col.spheres?.length) {
      for (let i = 0; i < this.pos.length; i++) {
        if (this.pinned[i]) continue;
        const p = this.pos[i];
        if (col.world) {
          const g = col.world.groundAt(p.x, p.z, p.y + 0.4, 1.2);
          if (g !== null && p.y < g + 0.02) p.y = g + 0.02;
        }
        if (col.spheres) {
          for (const s of col.spheres) {
            _v1.copy(p).sub(s.c);
            const d = _v1.length();
            if (d < s.r && d > 1e-5) p.copy(s.c).addScaledVector(_v1.normalize(), s.r);
          }
        }
      }
    }
  }
}

// ── Verlet rope / hair chains ────────────────────────────────────────────────
export interface RopeOpts {
  segments?: number;
  length?: number;
  radius?: number;
  material: THREE.Material;
  /** Direction the chain hangs at rest, in anchor-local space. */
  hang?: THREE.Vector3;
  stiffness?: number; // 0..1 extra constraint passes feel
}

/**
 * A verlet rope rendered as a tapered tube. The first point is pinned to an
 * anchor object each step — attach it to a character bone and it behaves as a
 * ponytail / hair lock; attach it to a beam and it's a hanging rope.
 */
export class RopeChain {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private anchor: THREE.Object3D;
  private offset: THREE.Vector3;
  private segLen: number;
  private radius: number;
  private acc = 0;

  constructor(anchor: THREE.Object3D, offset: THREE.Vector3, opts: RopeOpts) {
    this.anchor = anchor;
    this.offset = offset.clone();
    const n = opts.segments ?? 9;
    const len = opts.length ?? 0.45;
    this.segLen = len / n;
    this.radius = opts.radius ?? 0.03;
    const hang = (opts.hang ?? new THREE.Vector3(0, -1, 0.15)).clone().normalize();
    const start = anchor.localToWorld(offset.clone());
    for (let i = 0; i <= n; i++) {
      const p = start.clone().addScaledVector(hang, this.segLen * i);
      this.pts.push(p); this.prev.push(p.clone());
    }
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), opts.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.rebuildTube();
  }

  private rebuildTube() {
    const curve = new THREE.CatmullRomCurve3(this.pts);
    const geo = new THREE.TubeGeometry(curve, Math.max(8, this.pts.length * 2), this.radius, 6, false);
    // Taper toward the tip by pulling rings toward the curve.
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const rings = Math.max(8, this.pts.length * 2) + 1;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / 7);
      const t = Math.min(1, ring / (rings - 1));
      const c = curve.getPointAt(t);
      _v1.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - t * 0.55).add(c);
      pos.setXYZ(i, _v1.x, _v1.y, _v1.z);
    }
    // Tube is built in world space; the mesh itself stays at the origin.
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  /** Current world position of the free end. */
  tip(): THREE.Vector3 {
    return this.pts[this.pts.length - 1];
  }

  update(dt: number, w: Wind) {
    this.acc = Math.min(this.acc + dt, 0.06);
    const step = 1 / 60;
    let moved = false;
    while (this.acc >= step) { this.simulate(step, w); this.acc -= step; moved = true; }
    if (moved) this.rebuildTube();
  }

  private simulate(dt: number, w: Wind) {
    const anchorPos = this.anchor.localToWorld(this.offset.clone());
    this.pts[0].copy(anchorPos); this.prev[0].copy(anchorPos);
    for (let i = 1; i < this.pts.length; i++) {
      const p = this.pts[i], pr = this.prev[i];
      _v1.copy(p).sub(pr).multiplyScalar(0.96); // air drag
      pr.copy(p);
      p.add(_v1);
      p.y -= 9.8 * dt * dt;
      w.at(p, _v2);
      p.addScaledVector(_v2, dt * dt * 1.4 * (i / this.pts.length)); // tips catch more wind
    }
    for (let it = 0; it < 4; it++) {
      this.pts[0].copy(anchorPos);
      for (let i = 0; i < this.pts.length - 1; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        _v1.copy(b).sub(a);
        const d = _v1.length() || 1e-6;
        const diff = (d - this.segLen) / d;
        if (i === 0) b.addScaledVector(_v1, -diff);
        else { a.addScaledVector(_v1, diff * 0.5); b.addScaledVector(_v1, -diff * 0.5); }
      }
    }
  }
}

/** Hair is a rope chain with hair-like tuning. Anchor it to a Head bone. */
export class HairChain extends RopeChain {
  constructor(anchor: THREE.Object3D, offset: THREE.Vector3, opts: RopeOpts) {
    super(anchor, offset, { segments: 10, length: 0.38, radius: 0.022, ...opts });
  }
}

// ── Dynamic props (rigid bodies with bounce) ─────────────────────────────────
export interface DynOpts {
  radius: number;
  restitution?: number; // 0..1 bounciness (wood ≈ 0.25, barrel ≈ 0.35)
  friction?: number;    // ground friction (1/s exponential damping)
  roll?: boolean;       // round things roll; crates mostly slide
  mass?: number;
}

/**
 * Loose-prop world. Bodies are spheres for collision (resolved through the
 * level BVH exactly like the player capsule), with gravity, restitution on
 * impact, friction, rolling for round props, player pushing and body-body
 * separation. Sleeping bodies cost nothing until touched.
 */
export class DynWorld {
  private bodies: {
    mesh: THREE.Object3D; r: number; vel: THREE.Vector3; rest: number; fric: number;
    roll: boolean; asleep: boolean; still: number; spin: THREE.Vector3;
  }[] = [];
  /** Impact callback (splashes, clatter): world pos + impact speed. */
  onImpact: ((pos: THREE.Vector3, speed: number) => void) | null = null;
  private acc = 0;

  constructor(private world: CollisionWorld) {}

  add(mesh: THREE.Object3D, opts: DynOpts) {
    this.bodies.push({
      mesh, r: opts.radius, vel: new THREE.Vector3(),
      rest: opts.restitution ?? 0.3, fric: opts.friction ?? 5,
      roll: opts.roll ?? false, asleep: true, still: 0, spin: new THREE.Vector3(),
    });
    return mesh;
  }

  /** Wake everything near a point (explosions, door slams, boss stomps). */
  wake(pos: THREE.Vector3, radius: number, impulse?: THREE.Vector3) {
    for (const b of this.bodies) {
      if (b.mesh.position.distanceTo(pos) < radius + b.r) {
        b.asleep = false;
        if (impulse) b.vel.add(impulse);
      }
    }
  }

  update(dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector3) {
    this.acc = Math.min(this.acc + dt, 0.05);
    const step = 1 / 60;
    while (this.acc >= step) { this.simulate(step, playerPos, playerVel); this.acc -= step; }
  }

  private simulate(dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector3) {
    const GRAV = 22;
    // Body–body separation first (cheap broadphase: few dozen bodies).
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i], b = this.bodies[j];
        _v1.copy(b.mesh.position).sub(a.mesh.position); _v1.y = 0;
        const rr = a.r + b.r, d = _v1.length();
        if (d > 1e-4 && d < rr && Math.abs(a.mesh.position.y - b.mesh.position.y) < rr) {
          const push = (rr - d) / 2;
          _v1.normalize();
          a.mesh.position.addScaledVector(_v1, -push); b.mesh.position.addScaledVector(_v1, push);
          a.asleep = b.asleep = false;
          a.vel.addScaledVector(_v1, -0.4); b.vel.addScaledVector(_v1, 0.4);
        }
      }
    }
    for (const b of this.bodies) {
      if (b.asleep) continue;
      const p = b.mesh.position;
      b.vel.y -= GRAV * dt;
      // Player shove: capsule (r 0.32) vs body sphere.
      _v1.copy(p).sub(playerPos); _v1.y = 0;
      const pd = _v1.length();
      if (pd < b.r + 0.36 && p.y < playerPos.y + 1.7 && p.y > playerPos.y - 0.6) {
        _v1.normalize();
        const push = (b.r + 0.36 - pd);
        p.addScaledVector(_v1, push);
        b.vel.addScaledVector(_v1, Math.max(0.8, playerVel.length() * 0.7));
        b.vel.y = Math.max(b.vel.y, 0.6);
      }
      // Body origin is its base; a capsule of height 2r is a sphere at base + r.
      const feet = p.clone().addScaledVector(b.vel, dt);
      const res = this.world.resolve(feet, b.r * 0.92, b.r * 2);
      const impact = -b.vel.y;
      // Wall scrape: if the world pushed us well short of the intended step,
      // bleed off the horizontal velocity that's pressing into the wall.
      const intended = Math.hypot(b.vel.x, b.vel.z) * dt;
      const got = Math.hypot(res.pos.x - p.x, res.pos.z - p.z);
      if (intended > 1e-4 && got < intended * 0.6) { b.vel.x *= 0.5; b.vel.z *= 0.5; }
      p.copy(res.pos);
      if (res.onGround) {
        if (impact > 1.1) {
          b.vel.y = impact * b.rest; // bounce
          if (this.onImpact) this.onImpact(p.clone(), impact);
        } else b.vel.y = 0;
        // Friction + rolling resistance.
        const f = Math.exp(-b.fric * dt);
        b.vel.x *= f; b.vel.z *= f;
        if (b.roll) {
          // Rolling: spin around the horizontal axis perpendicular to travel.
          _v1.set(b.vel.z, 0, -b.vel.x);
          const sp = _v1.length();
          if (sp > 0.01) {
            _v1.normalize();
            b.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(_v1, (sp / b.r) * dt));
          }
        } else if (b.vel.lengthSq() > 0.002) {
          // Crates yaw slightly as they slide and settle.
          b.mesh.rotation.y += b.spin.y * dt;
          b.spin.y *= Math.exp(-3 * dt);
        }
        // Sleep when calm and grounded.
        if (b.vel.lengthSq() < 0.004) { b.still += dt; if (b.still > 0.5) { b.asleep = true; b.vel.set(0, 0, 0); } }
        else b.still = 0;
      } else {
        b.still = 0;
        // Air drag.
        b.vel.x *= Math.exp(-0.1 * dt); b.vel.z *= Math.exp(-0.1 * dt);
      }
    }
  }
}
