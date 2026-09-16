// phase4SimulationEffects.ts — effects that carry a simulation from frame to frame.
//
// The log filed fluid dynamics as "needs compute/WebGPU". That was not the real obstacle: stable
// fluids has run in WebGL fragment shaders for two decades. What was actually missing was
// somewhere to KEEP the velocity field. `prev()` returns an effect's previous visible output, and
// a velocity field is not something the viewer should see, so there was nowhere to put it.
//
// `effect.state` (added alongside this pack) gives an effect persistent buffers that are not the
// visible output. A pass declaring `target: 'state0'` writes the simulation; the ordinary pass
// then reads it and draws something a person actually wants to look at.
//
// Honest about what this is: velocity is self-advected, forced by curl noise and damped, and dye
// is advected by it. There is no pressure projection, so it is not an incompressible solver — the
// curl-noise forcing stands in for the swirl that projection would produce. It is also stored in
// 8-bit, so velocities are quantised; the ranges here are chosen so that reads as texture rather
// than as banding.
import type { FxEffect } from './effects';

const S = `
float s4h(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float s4noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(s4h(i), s4h(i + vec2(1,0)), f.x), mix(s4h(i + vec2(0,1)), s4h(i + vec2(1,1)), f.x), f.y); }
float s4fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * s4noise(p); p = p * 2.07 + 9.3; a *= 0.5; } return v; }
/** Curl of a scalar noise field: divergence-free by construction, which is what makes it swirl. */
vec2 s4curl(vec2 p, float t){
  float e = 0.09;
  float a = s4fbm(p + vec2(0.0, e) + t), b = s4fbm(p - vec2(0.0, e) + t);
  float c = s4fbm(p + vec2(e, 0.0) + t), d = s4fbm(p - vec2(e, 0.0) + t);
  return vec2(a - b, d - c) / (2.0 * e);
}
`;

export const PHASE4_SIMULATION_EFFECTS: FxEffect[] = [
  {
    id: 'fluidflow', name: 'Fluid Flow', category: 'distort', version: 1,
    summary: 'Dye lifted off the bright parts of the shot and carried by an evolving velocity field, so smoke and ink keep flowing after the thing that made them has gone.',
    state: 1,
    params: [
      { key: 'force', label: 'Turbulence', min: 0, max: 2, default: .8, step: .02 },
      { key: 'scale', label: 'Eddy Size', min: .5, max: 8, default: 2.5, step: .05 },
      { key: 'damp', label: 'Viscosity', min: 0, max: 1, default: .15, step: .01 },
      { key: 'inject', label: 'Emission', min: 0, max: 2, default: 1, step: .02 },
      { key: 'fade', label: 'Dissipation', min: 0, max: 1, default: .12, step: .01 },
      { key: 'speed', label: 'Flow Speed', min: 0, max: 3, default: 1, step: .02 },
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .7, step: .01 },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .55, step: .005 },
    ],
    presets: [
      { id: 'ink-water', name: 'Ink in Water', description: 'Slow, wide eddies that hold their shape.', params: { force: .5, scale: 1.4, damp: .08, inject: 1.2, fade: .06, speed: .7, amount: .8, hue: .6 } },
      { id: 'smoke-rise', name: 'Smoke', description: 'Fine turbulence, quick dissipation.', params: { force: 1.2, scale: 4.5, damp: .3, inject: .8, fade: .35, speed: 1.4, amount: .55, hue: .08 } },
      { id: 'plasma-storm', name: 'Plasma Storm', description: 'Violent flow that barely fades.', params: { force: 2, scale: 3, damp: .04, inject: 1.6, fade: .03, speed: 2.4, amount: 1, hue: .78 } },
    ],
    // The visible pass; the simulation pass below writes state0 and draws nothing.
    glsl: S + `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      {
        id: 'sim', target: 'state0',
        glsl: S + `vec4 fx(vec2 uv){
          vec4 s = st0(uv);
          float first = step(uFrame, 0.5);          // 1 on the first frame or after a time jump
          vec2 vel = mix(s.rg * 2.0 - 1.0, vec2(0.0), first);
          float dt = uDeltaT > 0.0 ? min(uDeltaT, 0.05) : 1.0 / 60.0;

          // Semi-Lagrangian advection: look BACK along the velocity and take what was there.
          vec2 back = uv - vel * dt * P5 * 0.55;
          vec4 sb = st0(back);
          vec2 velA = mix(sb.rg * 2.0 - 1.0, vec2(0.0), first);
          float dyeA = mix(sb.b, 0.0, first);

          // Curl noise stands in for the pressure projection this solver does not do.
          vec2 force = s4curl(uv * P1, uTime * 0.15) * P0;
          vec2 nv = clamp((velA + force * dt * 2.6) * (1.0 - clamp(P2 * dt * 8.0, 0.0, 0.95)), -1.0, 1.0);

          // Dye is emitted by the bright parts of the shot, then carried and dissipated.
          float lum = dot(src(uv).rgb, vec3(.2126, .7152, .0722));
          float emit = smoothstep(0.42, 0.95, lum) * P3 * dt * 4.0;
          float dye = clamp(dyeA * (1.0 - clamp(P4 * dt * 4.0, 0.0, 1.0)) + emit, 0.0, 1.0);

          return vec4(nv * 0.5 + 0.5, dye, 1.0);
        }`,
      },
      {
        id: 'main',
        glsl: S + `vec4 fx(vec2 uv){
          vec4 b = inp(uv);
          vec4 s = st0(uv);
          float dye = s.b;
          vec2 vel = s.rg * 2.0 - 1.0;
          // Faster dye shifts hue, so the flow reads as movement and not just a stain.
          vec3 col = hsv2rgb(vec3(fract(P7 + length(vel) * 0.22), 0.72, 1.0));
          float k = clamp(dye * P6, 0.0, 1.0);
          vec3 o = mix(b.rgb, max(b.rgb, col), k) + col * dye * P6 * 0.3;
          return vec4(clamp(o, 0.0, 1.0), max(b.a, k));
        }`,
      },
    ],
  },
];
