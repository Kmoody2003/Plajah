/**
 * Plajah Anima + Living Native Animation Bridge for Academia & Elevate Games.
 *
 * Directly drives our handmade scenes using Plajah's own animation runtimes:
 *  - services/anima/physics.ts   -> HairSystem (Verlet wind vines/fronds/bunting), ParticleSystem (gravity/bounce splashes & vortices), NaturalForcesConfig
 *  - services/anima/fluids.ts    -> FluidSimulator (Jos Stam Stable Fluids for teacup steam, chimney smoke, bioluminescent mist)
 *  - services/anima/procedural.ts -> curlNoise2D & fbm2D (organic wind gusts, dappled canopy light, creek caustics)
 *  - services/living/runtime/particles.ts -> Living BurstKind particles (fireflies, sparkles, leaves, petals, bubbles, notes, embers)
 *  - services/living/runtime/anim.ts -> WAAPI AnimPreset compiler with deterministic seeding and reduced-motion twins
 */

import {
  DEFAULT_FORCES,
  HairSystem,
  ParticleSystem,
  type NaturalForcesConfig,
  type ParticleEmitterConfig,
} from '../anima/physics';
import { FluidSimulator } from '../anima/fluids';
import { curlNoise2D, fbm2D } from '../anima/procedural';
import {
  addParticles,
  drawParticle,
  spawn as spawnLivingBurst,
  step as stepLivingParticles,
  type Particle as LivingParticle,
} from '../living/runtime/particles';
import type { BurstKind } from '../living/contracts';
import type { AtmospherePreset, WorldId } from './contracts';

export interface LivingSceneRig {
  world: WorldId | 'ora';
  hair: HairSystem;
  animaParticles: ParticleSystem;
  emitter: ParticleEmitterConfig;
  forces: NaturalForcesConfig;
  fluid: FluidSimulator | null;
  livingBurst: LivingParticle[];
  /** World-specific ambient swimmers/lanterns/boats driven by curlNoise2D & fbm2D. */
  critters: Array<{ x: number; y: number; vx: number; vy: number; phase: number; size: number; hue: string }>;
  ripples: Array<{ x: number; y: number; r: number; a: number; color: string }>;
  seedCounter: number;
  wheelAngle: number;
  needleAngle: number;
  needleVel: number;
  astrolabeAngle: number;
  /** Smoothly damped pointer position in 1280x720 stage coords for interactive wind/fluid brushing. */
  pointer: { x: number; y: number; vx: number; vy: number; active: boolean };
}

export function createLivingSceneRig(world: WorldId | 'ora'): LivingSceneRig {
  const hair = new HairSystem();
  const animaParticles = new ParticleSystem();

  const forces: NaturalForcesConfig = {
    ...DEFAULT_FORCES,
    gravity: { x: 0, y: 260, z: 0 },
    wind: { baseVelocity: { x: 34, y: -4, z: 0 }, turbulence: 0.55, frequency: 1.35 },
    dragCoefficient: 0.045,
    vortex: { enabled: false, center: { x: 430, y: 274, z: 0 }, strength: 160, inwardPull: 45 },
    attractors: [],
  };

  let emitter: ParticleEmitterConfig = {
    id: `${world}-emit`,
    name: `${world} ambient`,
    enabled: false,
    type: 'point',
    position: { x: 640, y: 360, z: 0 },
    ratePerSecond: 14,
    lifespan: 2.2,
    speed: 65,
    spreadAngle: 55,
    directionAngle: 90,
    startSize: 3.5,
    endSize: 1.2,
    color: 'rgba(224,248,255,0.75)',
    colorFade: 'rgba(224,248,255,0)',
    bounceElasticity: 0.42,
  };

  let fluid: FluidSimulator | null = null;
  const critters: LivingSceneRig['critters'] = [];

  if (world === 'reading') {
    // Verlet hanging willow tendrils along the upper canopy + hanging twine tassels
    for (let i = 0; i < 9; i++) {
      const x = 35 + i * 54 + (i % 2) * 16;
      hair.createStrand({ x, y: -4, z: 0 }, 115 + (i % 3) * 42, 7, i % 2 === 0 ? '#4B6B44' : '#6A8C58', 0.72);
    }
    for (let i = 0; i < 4; i++) {
      hair.createStrand({ x: 1090 + i * 44, y: -4, z: 0 }, 105 + (i % 2) * 38, 6, '#506E47', 0.72);
    }
    // Floating golden dandelion seeds & woodland fireflies
    for (let i = 0; i < 26; i++) {
      critters.push({
        x: (i * 97) % 1280,
        y: 80 + ((i * 53) % 520),
        vx: 14 + (i % 4) * 5,
        vy: -4,
        phase: i * 0.85,
        size: 2.2 + (i % 3) * 0.9,
        hue: i % 4 === 0 ? '#FFE8A0' : '#FFF8E4',
      });
    }
  } else if (world === 'math') {
    // Hanging wisteria clusters & fluttering valley laundry strands via Anima HairSystem
    for (let i = 0; i < 7; i++) {
      hair.createStrand({ x: 405 + i * 34, y: 74 + (i % 3) * 14, z: 0 }, 64 + (i % 2) * 24, 5, i % 2 === 0 ? '#9D82C6' : '#B89AD9', 0.65);
    }
    // Live water splash emitter pouring off the oak sluices onto the turning mossy waterwheel!
    forces.gravity = { x: 0, y: 460, z: 0 };
    forces.wind = { baseVelocity: { x: -24, y: -6, z: 0 }, turbulence: 0.4, frequency: 1.6 };
    emitter = {
      ...emitter,
      enabled: true,
      position: { x: 486, y: 468, z: 0 },
      ratePerSecond: 24,
      lifespan: 1.2,
      speed: 145,
      spreadAngle: 48,
      directionAngle: 120,
      startSize: 4.2,
      endSize: 1.6,
      color: 'rgba(218, 246, 255, 0.82)',
      bounceElasticity: 0.45,
    };
    // Chimney smoke is rendered cleanly via plateAnimator watercolor plumes (zero heavy fluid solver on math)
    fluid = null;
  } else if (world === 'science') {
    // Swaying greenhouse fern fronds near the conservatory edges
    for (let i = 0; i < 6; i++) {
      hair.createStrand({ x: 24 + i * 28, y: 185 + (i % 3) * 40, z: 0 }, 88 + (i % 2) * 28, 6, '#3D6B4E', 0.78);
    }
    forces.gravity = { x: 0, y: 120, z: 0 };
    forces.wind = { baseVelocity: { x: 14, y: -12, z: 0 }, turbulence: 0.5, frequency: 0.9 };
    // Rising bioluminescent spores & sunlit greenhouse pollen
    for (let i = 0; i < 32; i++) {
      critters.push({
        x: i < 16 ? 250 + ((i * 23) % 210) : (i * 83) % 1280,
        y: i < 16 ? 390 + ((i * 19) % 180) : 120 + ((i * 47) % 440),
        vx: 0,
        vy: -12,
        phase: i * 0.7,
        size: i < 16 ? 2.4 : 1.8,
        hue: i < 16 ? '#5EF2B8' : '#FFE099',
      });
    }
  } else if (world === 'studio') {
    // Vortex particle field orbiting inside the museum glass vitrine dome!
    forces.gravity = { x: 0, y: 0, z: 0 };
    forces.wind = { baseVelocity: { x: 0, y: 0, z: 0 }, turbulence: 0.1, frequency: 0.6 };
    forces.vortex = { enabled: true, center: { x: 428, y: 278, z: 0 }, strength: 210, inwardPull: 72 };
    emitter = {
      ...emitter,
      enabled: true,
      position: { x: 428, y: 220, z: 0 },
      ratePerSecond: 16,
      lifespan: 3.2,
      speed: 55,
      spreadAngle: 360,
      directionAngle: 0,
      startSize: 2.8,
      endSize: 0.8,
      color: 'rgba(244, 206, 114, 0.72)',
      bounceElasticity: 0.2,
    };
  } else if (world === 'history') {
    // Sailing wooden riverboats + caravan dust motes gliding along the Niger watercolor river
    for (let i = 0; i < 20; i++) {
      critters.push({
        x: 240 + ((i * 59) % 760),
        y: 120 + ((i * 37) % 430),
        vx: 10,
        vy: 3,
        phase: i * 1.1,
        size: 1.9 + (i % 2),
        hue: '#FBE5B2',
      });
    }
  } else if (world === 'elevate') {
    // Hanging olive twigs + woven courtyard wool awning tassels swaying in the Galilee sea breeze
    for (let i = 0; i < 6; i++) {
      hair.createStrand({ x: 865 + i * 64, y: 158 + (i % 3) * 14, z: 0 }, 54 + (i % 2) * 18, 5, '#C7A97C', 0.68);
    }
    for (let i = 0; i < 4; i++) {
      hair.createStrand({ x: 64 + i * 74, y: -4, z: 0 }, 96 + (i % 2) * 32, 6, '#5D7044', 0.72);
    }
    for (let i = 0; i < 24; i++) {
      critters.push({
        x: (i * 87) % 1280,
        y: 90 + ((i * 49) % 480),
        vx: 16,
        vy: -3,
        phase: i * 0.9,
        size: 2.0 + (i % 3) * 0.6,
        hue: i % 3 === 0 ? '#FFE299' : '#FFF7E0',
      });
    }
  } else if (world === 'ora') {
    // Hanging veranda wind-bell tassel (top-left timber frame!) + Jos Stam Stable Fluids teacup steam!
    hair.createStrand({ x: 156, y: 128, z: 0 }, 78, 6, '#B8A68E', 0.8);
    forces.gravity = { x: 0, y: 320, z: 0 };
    forces.wind = { baseVelocity: { x: 18, y: -4, z: 0 }, turbulence: 0.45, frequency: 0.8 };
    fluid = new FluidSimulator({ gridResolution: 22, viscosity: 0.00018, dissipation: 0.965, buoyancy: 2.0, vorticity: 3.2 });
    // Two calm golden koi gliding strictly inside the deep misty lily pond basin
    critters.push(
      { x: 430, y: 378, vx: 22, vy: 4, phase: 0.2, size: 15, hue: '#D87A46' },
      { x: 780, y: 405, vx: -18, vy: -3.5, phase: 2.4, size: 13.5, hue: '#F2E5CE' },
    );
  }

  return {
    world,
    hair,
    animaParticles,
    emitter,
    forces,
    fluid,
    livingBurst: [],
    critters,
    ripples: [],
    seedCounter: 101,
    wheelAngle: 0,
    needleAngle: -0.5,
    needleVel: 0,
    astrolabeAngle: 0,
    pointer: { x: 640, y: 360, vx: 0, vy: 0, active: false },
  };
}

/** Trigger a seeded Plajah Living particle burst (fireflies, sparkles, leaves, notes, petals, bubbles, embers). */
export function triggerLivingBurst(
  rig: LivingSceneRig,
  kind: BurstKind,
  x: number,
  y: number,
  count = 20,
): void {
  rig.seedCounter += 17;
  const fresh = spawnLivingBurst(kind, x, y, count, rig.seedCounter);
  rig.livingBurst = addParticles(rig.livingBurst, fresh);
}

/** Interactive click/brush impulse: injects pointer force into Anima Hair/Fluid + ripples + Living burst. */
export function pokeLivingScene(
  rig: LivingSceneRig,
  x: number,
  y: number,
  burstKind?: BurstKind,
): void {
  rig.ripples.push({ x, y, r: 10, a: 0.88, color: rig.world === 'science' ? 'rgba(94,242,184,' : 'rgba(255,232,168,' });
  if (rig.fluid) {
    rig.fluid.addVelocity(x / 1280, y / 720, (Math.random() - 0.5) * 4, -5.5);
    rig.fluid.addDye(x / 1280, y / 720, 0.95, 0.92, 0.85, 2);
  }
  const defaultKind: Record<LivingSceneRig['world'], BurstKind> = {
    reading: 'fireflies',
    math: 'bubbles',
    science: 'sparkles',
    studio: 'sparkles',
    history: 'leaves',
    elevate: 'petals',
    ora: 'fireflies',
  };
  triggerLivingBurst(rig, burstKind ?? defaultKind[rig.world], x, y, 16);
}

export interface SceneDynamicInputs {
  atmosphere: AtmospherePreset;
  reducedMotion: boolean;
  /** 0..1 progress or celebration boost */
  intensity: number;
  /** Math wheel RPM multiplier (0.2..1.1) or Science voltage (0..1) */
  rpmOrVoltage?: number;
  /** Science soil moisture / mycorrhizal glow 0..1 */
  bioFlux?: number;
  /** Studio Flux (p, q) parameters */
  fluxP?: number;
  fluxQ?: number;
}

/** Advance all Plajah Anima + Living simulations by dtSec (clamped for tab-switch safety). */
export function stepLivingSceneRig(
  rig: LivingSceneRig,
  dtSec: number,
  timeSec: number,
  inputs: SceneDynamicInputs,
): void {
  const dt = Math.min(0.033, Math.max(0.004, dtSec));
  if (inputs.reducedMotion) return;

  // Modulate Anima wind force smoothly with Ora atmosphere
  const windBoost = inputs.atmosphere === 'rain' ? 1.55 : inputs.atmosphere === 'dusk' ? 0.72 : 1.0;
  rig.forces.wind.turbulence = 0.42 * windBoost;

  // Interactive pointer collider lets learners literally brush willow vines, wisteria, and wind-bells!
  const colliders = rig.pointer.active ? [{ pos: { x: rig.pointer.x, y: rig.pointer.y, z: 0 }, radius: 74 }] : [];
  if (rig.hair.strands.length > 0) {
    rig.hair.step(dt, rig.forces, timeSec, colliders);
  }

  // Step Anima ParticleSystem (Math water splashes / Studio dome vortex)
  if (rig.emitter.enabled) {
    if (rig.world === 'math') {
      const rpm = inputs.rpmOrVoltage ?? 0.6;
      rig.emitter.ratePerSecond = 16 + rpm * 34;
      rig.emitter.speed = 90 + rpm * 95;
      rig.wheelAngle += dt * (0.45 + rpm * 1.9);
    }
    rig.animaParticles.step(dt, rig.emitter, rig.forces, timeSec, { w: 1280, h: 720 });
  }

  // Step Anima Stable Fluids (Ora teacup steam / Math hillside cottage chimney smoke)
  if (rig.fluid) {
    if (rig.world === 'ora') {
      // Teacup position on veranda (~31.5%, 67%)
      const gust = (fbm2D(timeSec * 0.4, 1.3) - 0.5) * 1.8;
      rig.fluid.addDye(0.315, 0.67, 0.96, 0.93, 0.87, 1);
      rig.fluid.addVelocity(0.315, 0.67, gust, -2.6);
      if (rig.pointer.active) {
        rig.fluid.addVelocity(rig.pointer.x / 1280, rig.pointer.y / 720, rig.pointer.vx * 0.08, rig.pointer.vy * 0.08);
      }
    } else if (rig.world === 'math') {
      // Two cottage terracotta chimneys on left hillside
      const gust = 0.9 + fbm2D(timeSec * 0.35, 2.7) * 1.2;
      rig.fluid.addDye(0.055, 0.66, 0.92, 0.90, 0.86, 1);
      rig.fluid.addVelocity(0.055, 0.66, gust, -2.3);
      rig.fluid.addDye(0.195, 0.52, 0.92, 0.90, 0.86, 1);
      rig.fluid.addVelocity(0.195, 0.52, gust * 0.8, -2.1);
    }
    rig.fluid.step(dt);
  }

  // Step Living Burst particles (sparkles, fireflies, leaves, petals, notes, bubbles)
  if (rig.livingBurst.length > 0) {
    rig.livingBurst = stepLivingParticles(rig.livingBurst, dt * 1000);
  }

  // Step curl-noise driven ambient critters (dandelion seeds, bioluminescent spores, koi fish, river motes)
  for (const c of rig.critters) {
    if (rig.world === 'ora') {
      c.x += c.vx * dt;
      c.y += (c.vy + Math.sin(timeSec * 1.4 + c.phase) * 7) * dt;
      if (c.x < 240 || c.x > 1000) c.vx = -c.vx;
      if (c.y < 346 || c.y > 432) c.vy = -c.vy;
    } else if (rig.world === 'science' && c.hue === '#5EF2B8') {
      // Bioluminescent root spores rise gently through the oak terrarium
      const [cx, cy] = curlNoise2D(c.x * 0.012, c.y * 0.012, timeSec * 0.25);
      c.x += cx * 14 * dt;
      c.y += (-16 - (inputs.bioFlux ?? 0.5) * 24 + cy * 8) * dt;
      if (c.y < 365 || c.x < 225 || c.x > 465) {
        c.x = 245 + Math.random() * 200;
        c.y = 555 + Math.random() * 25;
      }
    } else {
      const [cx, cy] = curlNoise2D(c.x * 0.005, c.y * 0.005, timeSec * 0.14);
      c.x = (c.x + (c.vx * windBoost + cx * 26) * dt + 1280) % 1280;
      c.y = (c.y + (c.vy + cy * 22) * dt + 720) % 720;
    }
  }

  // Spring-damped galvanometer needle for Science Bench
  if (rig.world === 'science') {
    const targetAng = -0.85 + (inputs.rpmOrVoltage ?? 0.5) * 1.7;
    const force = (targetAng - rig.needleAngle) * 28 - rig.needleVel * 5.2;
    rig.needleVel += force * dt;
    rig.needleAngle += rig.needleVel * dt;
  }

  // Astrolabe slow celestial rotation for History Atlas
  if (rig.world === 'history') {
    rig.astrolabeAngle += dt * 0.16;
  }

  // Expanding ripples
  rig.ripples = rig.ripples.filter(rp => rp.a > 0.02);
  for (const rp of rig.ripples) {
    rp.r += 95 * dt;
    rp.a *= Math.pow(0.18, dt);
  }
}

/** Render the Anima Stable Fluid dye buffer (soft painterly translucent smoke/steam wisps). */
export function drawAnimaFluid(ctx: CanvasRenderingContext2D, fluid: FluidSimulator, opacity = 0.52): void {
  const N = fluid.N;
  const cellW = 1280 / N;
  const cellH = 720 / N;
  ctx.save();
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      const idx = i + (N + 2) * j;
      const d = (fluid.densityR[idx] + fluid.densityG[idx] + fluid.densityB[idx]) / 3;
      if (d < 0.03) continue;
      const a = Math.min(opacity, d * opacity * 0.72);
      const r = Math.min(255, Math.round(fluid.densityR[idx] * 255));
      const g = Math.min(255, Math.round(fluid.densityG[idx] * 255));
      const b = Math.min(255, Math.round(fluid.densityB[idx] * 255));
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc((i - 0.5) * cellW, (j - 0.5) * cellH, cellW * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Render Verlet HairSystem strands with painterly tapered botanical / cloth strokes. */
export function drawAnimaStrands(ctx: CanvasRenderingContext2D, hair: HairSystem, lineWidth = 4): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of hair.strands) {
    if (s.points.length < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(s.points[0].pos.x, s.points[0].pos.y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].pos.x, s.points[i].pos.y);
    }
    ctx.stroke();

    // Small painted leaf/tassel nodes along each strand
    for (let i = 2; i < s.points.length; i += 2) {
      const p = s.points[i].pos;
      const prev = s.points[i - 1].pos;
      const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang + 0.5);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.ellipse(4, 0, 5.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Render all active Plajah Living burst particles onto the stage canvas. */
export function drawLivingBursts(ctx: CanvasRenderingContext2D, rig: LivingSceneRig): void {
  for (const p of rig.livingBurst) {
    drawParticle(ctx, p);
  }
}
