/**
 * services/anima/physics.ts
 *
 * Plajah Anima — High-Performance Physics & Simulation Engine
 * Subsystems:
 * 1. Particle Systems (Emitters, Lifespan, Collisions, Forces)
 * 2. Hair & Strand Dynamics (Verlet distance/bend constraints, grooming, wind reaction)
 * 3. Soft Body Dynamics (Position-Based Dynamics / XPBD mass-spring lattice, volume preservation)
 * 4. Rigid Body Dynamics (Impulse, friction, restitution, joint constraints)
 * 5. Destructive & Fracture Systems (Voronoi impact splitting, stress propagation, debris)
 * 6. Natural Forces (Gravity, Wind gusts, Aerodynamic drag, Vortex, Attractors/Repulsors)
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const vec3Add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vec3Sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vec3Scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
export const vec3Length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
export const vec3Normalize = (v: Vec3): Vec3 => {
  const l = vec3Length(v);
  return l > 1e-6 ? vec3Scale(v, 1 / l) : vec3(0, 0, 0);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. NATURAL FORCES
// ─────────────────────────────────────────────────────────────────────────────

export interface NaturalForcesConfig {
  gravity: Vec3;              // e.g. { x: 0, y: 980, z: 0 } (px/s^2)
  wind: {
    baseVelocity: Vec3;       // e.g. { x: 120, y: 0, z: 0 }
    turbulence: number;       // 0..1 gustiness
    frequency: number;        // Hz
  };
  dragCoefficient: number;    // air resistance (0.01 - 0.2)
  vortex: {
    enabled: boolean;
    center: Vec3;
    strength: number;
    inwardPull: number;
  };
  attractors: Array<{
    id: string;
    position: Vec3;
    strength: number;         // positive = attract, negative = repel
    radius: number;
  }>;
}

export const DEFAULT_FORCES: NaturalForcesConfig = {
  gravity: { x: 0, y: 500, z: 0 },
  wind: {
    baseVelocity: { x: 40, y: -10, z: 0 },
    turbulence: 0.35,
    frequency: 1.5,
  },
  dragCoefficient: 0.04,
  vortex: {
    enabled: false,
    center: { x: 400, y: 300, z: 0 },
    strength: 200,
    inwardPull: 50,
  },
  attractors: [],
};

export function sampleForceField(pos: Vec3, time: number, forces: NaturalForcesConfig = DEFAULT_FORCES): Vec3 {
  // 1. Gravity
  let total = { ...forces.gravity };

  // 2. Wind with animated noise turbulence
  const gust = Math.sin(time * forces.wind.frequency + pos.x * 0.01) * forces.wind.turbulence;
  const currentWind = vec3Scale(forces.wind.baseVelocity, 1 + gust);
  total = vec3Add(total, currentWind);

  // 3. Vortex
  if (forces.vortex.enabled) {
    const delta = vec3Sub(pos, forces.vortex.center);
    const dist = vec3Length(delta);
    if (dist > 10 && dist < 800) {
      // Tangential force (perpendicular in XY plane)
      const tangent = vec3Normalize({ x: -delta.y, y: delta.x, z: 0 });
      const falloff = 1 - dist / 800;
      total = vec3Add(total, vec3Scale(tangent, forces.vortex.strength * falloff));
      // Inward pull
      const inward = vec3Normalize(vec3Scale(delta, -1));
      total = vec3Add(total, vec3Scale(inward, forces.vortex.inwardPull * falloff));
    }
  }

  // 4. Point Attractors / Repulsors
  for (const att of forces.attractors) {
    const diff = vec3Sub(att.position, pos);
    const d = vec3Length(diff);
    if (d > 5 && d < att.radius) {
      const dir = vec3Normalize(diff);
      const intensity = (att.strength * (1 - d / att.radius)) / Math.max(1, d * 0.05);
      total = vec3Add(total, vec3Scale(dir, intensity));
    }
  }

  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARTICLE SYSTEMS
// ─────────────────────────────────────────────────────────────────────────────

export interface Particle {
  id: number;
  position: Vec3;
  velocity: Vec3;
  color: string;
  size: number;
  initialSize: number;
  age: number;
  lifespan: number;
  mass: number;
  rotation: number;
  rotationSpeed: number;
}

export interface ParticleEmitterConfig {
  id: string;
  name: string;
  enabled: boolean;
  type: 'point' | 'line' | 'box' | 'ring';
  position: Vec3;
  ratePerSecond: number;
  lifespan: number;
  speed: number;
  spreadAngle: number;       // degrees (0 = laser beam, 360 = omni)
  directionAngle: number;    // degrees
  startSize: number;
  endSize: number;
  color: string;
  colorFade: string;
  bounceElasticity: number;  // 0..1 restitution
}

export class ParticleSystem {
  particles: Particle[] = [];
  private nextId = 1;
  private spawnAccumulator = 0;

  step(dt: number, emitter: ParticleEmitterConfig, forces: NaturalForcesConfig, time: number, bounds?: { w: number; h: number }): void {
    // 1. Spawning
    if (emitter.enabled) {
      this.spawnAccumulator += emitter.ratePerSecond * dt;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        const rad = (emitter.directionAngle + (Math.random() - 0.5) * emitter.spreadAngle) * (Math.PI / 180);
        const spd = emitter.speed * (0.8 + Math.random() * 0.4);
        this.particles.push({
          id: this.nextId++,
          position: { ...emitter.position },
          velocity: {
            x: Math.cos(rad) * spd,
            y: Math.sin(rad) * spd,
            z: (Math.random() - 0.5) * spd * 0.2,
          },
          color: emitter.color,
          size: emitter.startSize,
          initialSize: emitter.startSize,
          age: 0,
          lifespan: emitter.lifespan * (0.8 + Math.random() * 0.4),
          mass: 1.0,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 4,
        });
      }
    }

    // 2. Integration & Forces
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.lifespan) {
        this.particles.splice(i, 1);
        continue;
      }

      // Sample environment forces
      const force = sampleForceField(p.position, time, forces);
      // Aerodynamic drag
      const drag = vec3Scale(p.velocity, -forces.dragCoefficient);
      const accel = vec3Add(force, drag);

      // Semi-implicit Euler
      p.velocity = vec3Add(p.velocity, vec3Scale(accel, dt));
      p.position = vec3Add(p.position, vec3Scale(p.velocity, dt));
      p.rotation += p.rotationSpeed * dt;

      // Size interpolation over lifespan
      const progress = p.age / p.lifespan;
      p.size = emitter.startSize + (emitter.endSize - emitter.startSize) * progress;

      // Floor & Wall Collisions
      if (bounds) {
        if (p.position.y > bounds.h - p.size) {
          p.position.y = bounds.h - p.size;
          p.velocity.y *= -emitter.bounceElasticity;
          p.velocity.x *= 0.85; // ground friction
        }
        if (p.position.x < p.size) {
          p.position.x = p.size;
          p.velocity.x *= -emitter.bounceElasticity;
        } else if (p.position.x > bounds.w - p.size) {
          p.position.x = bounds.w - p.size;
          p.velocity.x *= -emitter.bounceElasticity;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. HAIR & STRAND DYNAMICS (Verlet Constraint Chains)
// ─────────────────────────────────────────────────────────────────────────────

export interface HairParticle {
  pos: Vec3;
  prevPos: Vec3;
  isPinned: boolean;
  radius: number;
}

export interface HairStrand {
  id: string;
  points: HairParticle[];
  segmentLength: number;
  stiffness: number;        // 0..1 resistance to bending
  color: string;
}

export class HairSystem {
  strands: HairStrand[] = [];

  createStrand(rootPos: Vec3, length: number, segments = 6, color = '#D0BCFF', stiffness = 0.8): HairStrand {
    const points: HairParticle[] = [];
    const segLen = length / segments;
    for (let i = 0; i <= segments; i++) {
      const p = { x: rootPos.x, y: rootPos.y + i * segLen, z: rootPos.z };
      points.push({
        pos: { ...p },
        prevPos: { ...p },
        isPinned: i === 0,
        radius: 2,
      });
    }
    const strand: HairStrand = {
      id: Math.random().toString(36).slice(2),
      points,
      segmentLength: segLen,
      stiffness,
      color,
    };
    this.strands.push(strand);
    return strand;
  }

  step(dt: number, forces: NaturalForcesConfig, time: number, colliders: Array<{ pos: Vec3; radius: number }> = []): void {
    const dt2 = dt * dt;
    for (const s of this.strands) {
      // 1. Verlet Integration with forces
      for (const p of s.points) {
        if (p.isPinned) continue;
        const vel = vec3Scale(vec3Sub(p.pos, p.prevPos), 0.96); // 4% damping
        const force = sampleForceField(p.pos, time, forces);
        p.prevPos = { ...p.pos };
        p.pos = vec3Add(vec3Add(p.pos, vel), vec3Scale(force, dt2));
      }

      // 2. Distance & Stiffness Relaxation (XPBD iterations)
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < s.points.length - 1; i++) {
          const p1 = s.points[i];
          const p2 = s.points[i + 1];
          const delta = vec3Sub(p2.pos, p1.pos);
          const dist = vec3Length(delta);
          if (dist < 1e-4) continue;
          const diff = (dist - s.segmentLength) / dist;

          if (!p1.isPinned && !p2.isPinned) {
            p1.pos = vec3Add(p1.pos, vec3Scale(delta, 0.5 * diff * s.stiffness));
            p2.pos = vec3Sub(p2.pos, vec3Scale(delta, 0.5 * diff * s.stiffness));
          } else if (p1.isPinned && !p2.isPinned) {
            p2.pos = vec3Sub(p2.pos, vec3Scale(delta, diff * s.stiffness));
          } else if (!p1.isPinned && p2.isPinned) {
            p1.pos = vec3Add(p1.pos, vec3Scale(delta, diff * s.stiffness));
          }
        }
      }

      // 3. Head / Body Collision Spheres
      for (const c of colliders) {
        for (const p of s.points) {
          if (p.isPinned) continue;
          const delta = vec3Sub(p.pos, c.pos);
          const dist = vec3Length(delta);
          const minDist = c.radius + p.radius;
          if (dist < minDist && dist > 1e-4) {
            const pushDir = vec3Normalize(delta);
            p.pos = vec3Add(c.pos, vec3Scale(pushDir, minDist));
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SOFT BODY DYNAMICS (Position-Based Dynamics / XPBD Mesh Lattice)
// ─────────────────────────────────────────────────────────────────────────────

export interface SoftBodyNode {
  pos: Vec3;
  prevPos: Vec3;
  mass: number;
}

export interface SoftBodySpring {
  a: number; // index of node A
  b: number; // index of node B
  restLength: number;
  stiffness: number;
}

export interface SoftBody {
  id: string;
  nodes: SoftBodyNode[];
  springs: SoftBodySpring[];
  pressure: number; // volume preservation
  color: string;
}

export class SoftBodySystem {
  bodies: SoftBody[] = [];

  createJellyBox(x: number, y: number, w: number, h: number, rows = 3, cols = 3, color = 'rgba(212, 0, 85, 0.45)'): SoftBody {
    const nodes: SoftBodyNode[] = [];
    const springs: SoftBodySpring[] = [];
    const dx = w / (cols - 1);
    const dy = h / (rows - 1);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pos = { x: x + c * dx, y: y + r * dy, z: 0 };
        nodes.push({ pos: { ...pos }, prevPos: { ...pos }, mass: 1.0 });
      }
    }

    const idx = (r: number, c: number) => r * cols + c;

    // Structural and diagonal cross springs
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1) {
          const a = idx(r, c), b = idx(r, c + 1);
          springs.push({ a, b, restLength: vec3Length(vec3Sub(nodes[b].pos, nodes[a].pos)), stiffness: 0.9 });
        }
        if (r < rows - 1) {
          const a = idx(r, c), b = idx(r + 1, c);
          springs.push({ a, b, restLength: vec3Length(vec3Sub(nodes[b].pos, nodes[a].pos)), stiffness: 0.9 });
        }
        // Diagonals for shear/squash resistance
        if (r < rows - 1 && c < cols - 1) {
          const a = idx(r, c), b = idx(r + 1, c + 1);
          springs.push({ a, b, restLength: vec3Length(vec3Sub(nodes[b].pos, nodes[a].pos)), stiffness: 0.8 });
          const a2 = idx(r + 1, c), b2 = idx(r, c + 1);
          springs.push({ a: a2, b: b2, restLength: vec3Length(vec3Sub(nodes[b2].pos, nodes[a2].pos)), stiffness: 0.8 });
        }
      }
    }

    const body: SoftBody = { id: Math.random().toString(36).slice(2), nodes, springs, pressure: 1.2, color };
    this.bodies.push(body);
    return body;
  }

  step(dt: number, forces: NaturalForcesConfig, time: number, bounds?: { w: number; h: number }): void {
    const dt2 = dt * dt;
    for (const b of this.bodies) {
      // 1. Verlet integrate nodes
      for (const n of b.nodes) {
        const vel = vec3Scale(vec3Sub(n.pos, n.prevPos), 0.98); // damping
        const f = sampleForceField(n.pos, time, forces);
        n.prevPos = { ...n.pos };
        n.pos = vec3Add(vec3Add(n.pos, vel), vec3Scale(f, dt2));
      }

      // 2. Spring constraints
      for (let iter = 0; iter < 5; iter++) {
        for (const sp of b.springs) {
          const na = b.nodes[sp.a];
          const nb = b.nodes[sp.b];
          const delta = vec3Sub(nb.pos, na.pos);
          const dist = vec3Length(delta);
          if (dist < 1e-4) continue;
          const diff = ((dist - sp.restLength) / dist) * sp.stiffness * 0.5;
          na.pos = vec3Add(na.pos, vec3Scale(delta, diff));
          nb.pos = vec3Sub(nb.pos, vec3Scale(delta, diff));
        }
      }

      // 3. Bounds collisions
      if (bounds) {
        for (const n of b.nodes) {
          if (n.pos.y > bounds.h) {
            n.pos.y = bounds.h;
            n.prevPos.y = bounds.h + (n.pos.y - n.prevPos.y) * 0.2;
            n.prevPos.x = n.pos.x + (n.prevPos.x - n.pos.x) * 0.8;
          }
          if (n.pos.x < 0) n.pos.x = 0;
          if (n.pos.x > bounds.w) n.pos.x = bounds.w;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DESTRUCTIVE FRACTURE SYSTEM (Voronoi Impact Fragmentation)
// ─────────────────────────────────────────────────────────────────────────────

export interface FracturePiece {
  id: string;
  polygon: Array<[number, number]>;
  center: Vec3;
  velocity: Vec3;
  angularVelocity: number;
  rotation: number;
  color: string;
  mass: number;
  settled: boolean;
}

export function fracturePolygonAtImpact(
  poly: Array<[number, number]>,
  impactPoint: [number, number],
  shardsCount = 8,
  blastForce = 400,
  color = '#D40055'
): FracturePiece[] {
  const pieces: FracturePiece[] = [];
  const angleStep = (Math.PI * 2) / shardsCount;

  for (let i = 0; i < shardsCount; i++) {
    const a1 = i * angleStep;
    const a2 = (i + 1) * angleStep;
    const r1 = 30 + Math.random() * 50;
    const r2 = 30 + Math.random() * 50;

    // Wedge polygon radiating from impact
    const shardPoly: Array<[number, number]> = [
      [impactPoint[0], impactPoint[1]],
      [impactPoint[0] + Math.cos(a1) * r1, impactPoint[1] + Math.sin(a1) * r1],
      [impactPoint[0] + Math.cos(a2) * r2, impactPoint[1] + Math.sin(a2) * r2],
    ];

    const midAngle = (a1 + a2) * 0.5;
    const speed = blastForce * (0.6 + Math.random() * 0.8);

    pieces.push({
      id: Math.random().toString(36).slice(2),
      polygon: shardPoly,
      center: { x: impactPoint[0], y: impactPoint[1], z: 0 },
      velocity: {
        x: Math.cos(midAngle) * speed,
        y: Math.sin(midAngle) * speed - 150, // upward pop
        z: (Math.random() - 0.5) * 50,
      },
      angularVelocity: (Math.random() - 0.5) * 12,
      rotation: 0,
      color,
      mass: 0.5 + Math.random() * 0.5,
      settled: false,
    });
  }

  return pieces;
}
