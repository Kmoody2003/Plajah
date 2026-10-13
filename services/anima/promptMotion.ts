/**
 * services/anima/promptMotion.ts
 *
 * Plajah Anima — Natural Language Prompt-to-Motion Compiler
 * Translates natural language directives into Keyframes, Expressions, Behaviors,
 * Physics setups, or Cel exposure cadences.
 */

import type { AnimaChannel, BehaviorConfig, Keyframe } from './types';

export interface MotionRecipe {
  summary: string;
  channels: Record<string, Partial<AnimaChannel<number>>>;
  suggestedStepRate?: 1 | 2 | 3 | 4; // Cel timing: on 1s, 2s, 3s
  physicsPreset?: 'particles' | 'hair' | 'soft_body' | 'fluid' | 'fracture';
}

export function compileMotionPrompt(prompt: string, durationSec = 2.0): MotionRecipe {
  const p = prompt.toLowerCase();

  // 0. SPECIFIC PHYSICS & SIMULATION PROMPTS
  if (p.includes('hair') || p.includes('strand')) {
    return {
      summary: 'Dynamic hair strand physics with wind flutter and spring damping',
      physicsPreset: 'hair',
      channels: {},
    };
  }
  if (p.includes('jelly') || p.includes('soft body')) {
    return {
      summary: 'Soft body mass-spring lattice simulation with pressure preservation',
      physicsPreset: 'soft_body',
      channels: {},
    };
  }
  if (p.includes('fluid') || p.includes('smoke') || p.includes('water') || p.includes('ink')) {
    return {
      summary: 'Navier-Stokes fluid dynamic simulation with vorticity swirl',
      physicsPreset: 'fluid',
      channels: {},
    };
  }
  if (p.includes('fracture') || p.includes('shatter') || p.includes('destruct') || p.includes('break')) {
    return {
      summary: 'Voronoi impact fracture with dynamic debris shards',
      physicsPreset: 'fracture',
      channels: {},
    };
  }
  if (p.includes('particle') || p.includes('spark') || p.includes('dust') || p.includes('ember')) {
    return {
      summary: 'Particle emitter with gravity and turbulent aerodynamic drag',
      physicsPreset: 'particles',
      channels: {},
    };
  }

  // 1. BOUNCE IN / POP IN
  if (p.includes('bounce') || p.includes('pop in') || p.includes('elastic')) {
    const kfScaleX: Keyframe<number>[] = [
      { id: 'k1', t: 0, v: 0, ease: 'out' },
      { id: 'k2', t: 0.4, v: 1.25, ease: 'smooth' },
      { id: 'k3', t: 0.65, v: 0.9, ease: 'smooth' },
      { id: 'k4', t: 0.9, v: 1.05, ease: 'smooth' },
      { id: 'k5', t: 1.1, v: 1.0, ease: 'smooth' },
    ];
    const kfScaleY: Keyframe<number>[] = [
      { id: 'k1y', t: 0, v: 0, ease: 'out' },
      { id: 'k2y', t: 0.4, v: 0.85, ease: 'smooth' }, // squash & stretch
      { id: 'k3y', t: 0.65, v: 1.15, ease: 'smooth' },
      { id: 'k4y', t: 0.9, v: 0.95, ease: 'smooth' },
      { id: 'k5y', t: 1.1, v: 1.0, ease: 'smooth' },
    ];
    return {
      summary: 'Elastic squash-and-stretch pop in with damped overshoot',
      channels: {
        'transform.scaleX': {
          name: 'Scale X',
          path: 'transform.scaleX',
          defaultValue: 1,
          keyframes: kfScaleX,
        },
        'transform.scaleY': {
          name: 'Scale Y',
          path: 'transform.scaleY',
          defaultValue: 1,
          keyframes: kfScaleY,
        },
      },
    };
  }

  // 2. WIGGLE / JIGGLE / SHAKE
  if (p.includes('wiggle') || p.includes('shake') || p.includes('flutter')) {
    return {
      summary: 'Procedural rotation & position wiggle with smooth interpolation',
      channels: {
        'transform.rotationZ': {
          name: 'Rotation Z',
          path: 'transform.rotationZ',
          defaultValue: 0,
          keyframes: [],
          expression: {
            enabled: true,
            code: 'wiggle(4, 12)',
          },
        },
        'transform.y': {
          name: 'Position Y',
          path: 'transform.y',
          defaultValue: 0,
          keyframes: [],
          expression: {
            enabled: true,
            code: 'wiggle(2.5, 8)',
          },
        },
      },
    };
  }

  // 3. ANIME WALK CYCLE / ON 2s
  if (p.includes('walk') || p.includes('anime') || p.includes('run') || p.includes('2s')) {
    return {
      summary: 'Anime rhythmic walk cycle timed on 2s with hip sway',
      suggestedStepRate: 2,
      channels: {
        'transform.y': {
          name: 'Position Y (Bob)',
          path: 'transform.y',
          defaultValue: 0,
          keyframes: [
            { id: 'w1', t: 0, v: 0, ease: 'smooth' },
            { id: 'w2', t: 0.25, v: -14, ease: 'smooth' },
            { id: 'w3', t: 0.5, v: 0, ease: 'smooth' },
            { id: 'w4', t: 0.75, v: -14, ease: 'smooth' },
            { id: 'w5', t: 1.0, v: 0, ease: 'smooth' },
          ],
          expression: {
            enabled: true,
            code: "loopOut('cycle')",
          },
        },
        'transform.rotationZ': {
          name: 'Rotation Z (Sway)',
          path: 'transform.rotationZ',
          defaultValue: 0,
          keyframes: [
            { id: 'r1', t: 0, v: -3, ease: 'smooth' },
            { id: 'r2', t: 0.5, v: 3, ease: 'smooth' },
            { id: 'r3', t: 1.0, v: -3, ease: 'smooth' },
          ],
          expression: {
            enabled: true,
            code: "loopOut('cycle')",
          },
        },
      },
    };
  }

  // 4. LOWER THIRD REVEAL / SLIDE IN & OUT
  if (p.includes('lower third') || p.includes('slide') || p.includes('reveal')) {
    const kfX: Keyframe<number>[] = [
      { id: 'lx1', t: 0, v: -350, ease: 'out' },
      { id: 'lx2', t: 0.45, v: 0, ease: 'smooth' },
      { id: 'lx3', t: durationSec - 0.4, v: 0, ease: 'in' },
      { id: 'lx4', t: durationSec, v: -350, ease: 'smooth' },
    ];
    const kfOp: Keyframe<number>[] = [
      { id: 'lo1', t: 0, v: 0, ease: 'out' },
      { id: 'lo2', t: 0.3, v: 1, ease: 'smooth' },
      { id: 'lo3', t: durationSec - 0.25, v: 1, ease: 'in' },
      { id: 'lo4', t: durationSec, v: 0, ease: 'smooth' },
    ];
    return {
      summary: 'Broadcast lower-third reveal with smooth entrance hold and exit wipe',
      channels: {
        'transform.x': {
          name: 'Position X',
          path: 'transform.x',
          defaultValue: 0,
          keyframes: kfX,
        },
        'opacity': {
          name: 'Opacity',
          path: 'opacity',
          defaultValue: 1,
          keyframes: kfOp,
        },
      },
    };
  }

  // 5. PHYSICS & SIMULATION PROMPTS
  if (p.includes('hair') || p.includes('strand')) {
    return {
      summary: 'Dynamic hair strand physics with wind flutter and spring damping',
      physicsPreset: 'hair',
      channels: {},
    };
  }
  if (p.includes('jelly') || p.includes('soft body') || p.includes('squash')) {
    return {
      summary: 'Soft body mass-spring lattice simulation with pressure preservation',
      physicsPreset: 'soft_body',
      channels: {},
    };
  }
  if (p.includes('fluid') || p.includes('smoke') || p.includes('water') || p.includes('ink')) {
    return {
      summary: 'Navier-Stokes fluid dynamic simulation with vorticity swirl',
      physicsPreset: 'fluid',
      channels: {},
    };
  }
  if (p.includes('fracture') || p.includes('shatter') || p.includes('destruct') || p.includes('break')) {
    return {
      summary: 'Voronoi impact fracture with dynamic debris shards',
      physicsPreset: 'fracture',
      channels: {},
    };
  }
  if (p.includes('particle') || p.includes('spark') || p.includes('dust') || p.includes('ember')) {
    return {
      summary: 'Particle emitter with gravity and turbulent aerodynamic drag',
      physicsPreset: 'particles',
      channels: {},
    };
  }

  // DEFAULT SPRING BEHAVIOR
  const springConfig: BehaviorConfig = {
    kind: 'spring',
    enabled: true,
    frequency: 3.0,
    amplitude: 15.0,
    decay: 0.88,
  };

  return {
    summary: 'Spring harmonic behavior on position and rotation',
    channels: {
      'transform.y': {
        name: 'Position Y',
        path: 'transform.y',
        defaultValue: 0,
        keyframes: [],
        behavior: springConfig,
      },
    },
  };
}
