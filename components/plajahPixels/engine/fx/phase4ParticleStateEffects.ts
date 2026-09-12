// phase4ParticleStateEffects.ts — particles that REMEMBER, the Trapcode Particular model.
//
// The suite already had particle fields (phase3ParticleEffects). Those are closed form: every
// frame recomputes where a particle "would" be from a hash and the clock, so nothing that happens
// to a particle can persist. It cannot be pushed, it cannot slow down, and it cannot be born or
// die — it can only follow the formula it was always going to follow.
//
// These carry per-particle state instead. Each particle owns two texels in the effect's persistent
// buffers, and each frame integrates the forces acting on it, so a gust that pushes it is still
// visible seconds later and a particle that runs out of life is genuinely replaced.
//
// PRECISION is the whole design constraint. The buffers are 8-bit, and a position stored in one
// byte moves in visible 0.4%-of-frame steps. Position therefore takes two channels per axis (a
// 16-bit fixed point split across a high and a low byte) in state0, which is smooth; velocity is
// coarser but only feeds an integration, so its quantisation never shows directly. That split is
// why the effect declares two state buffers rather than one.
import type { FxEffect } from './effects';

const P = `
#define PCOUNT 96.0
float ph11(float x){ vec3 q = fract(vec3(x, x*1.31, x*2.17) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float pnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = ph11(i.x + i.y*57.0), b = ph11(i.x+1.0 + i.y*57.0);
  float c = ph11(i.x + (i.y+1.0)*57.0), d = ph11(i.x+1.0 + (i.y+1.0)*57.0);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
/** Curl of a scalar field: a divergence-free gust, which is what makes drift look like air. */
vec2 pcurl(vec2 p, float t){
  float e = 0.12;
  float a = pnoise(p + vec2(0.0, e) + t), b = pnoise(p - vec2(0.0, e) + t);
  float c = pnoise(p + vec2(e, 0.0) + t), d = pnoise(p - vec2(e, 0.0) + t);
  return vec2(a - b, d - c) / (2.0 * e);
}
// 16-bit fixed point across two 8-bit channels. One byte alone steps position by 0.4% of the
// frame, which reads as a stutter no amount of smoothing hides.
float dec16(vec2 c){ return (floor(c.x*255.0 + 0.5)*256.0 + floor(c.y*255.0 + 0.5)) / 65535.0; }
vec2  enc16(float v){ float f = floor(clamp(v, 0.0, 1.0)*65535.0 + 0.5); float hi = floor(f/256.0); return vec2(hi/255.0, (f - hi*256.0)/255.0); }
/** Which particle this texel belongs to, or -1 for the rest of the buffer. */
float pid(vec2 uv){
  float x = floor(uv.x * uResolution.x);
  return (uv.y * uResolution.y < 1.0 && x < PCOUNT) ? x : -1.0;
}
// Kept inside the storable range so a particle can always move away from where it is born.
vec2 emitter(){ return vec2(clamp(P6, 0.02, 0.98), clamp(P3, 0.02, 0.98)); }
/** Throw away from whichever edge the emitter sits nearest, in this y-up space. */
float launchAngle(){ return P3 > 0.5 ? -1.5708 : 1.5708; }
/**
 * Leaving the frame is a death, not a wall. The bound sits just INSIDE the frame on purpose:
 * position is stored as 16-bit fixed point over 0..1, so a particle that flies past the edge is
 * clamped back to exactly 1.0 on write and can never test as out of bounds — it just sits on the
 * edge, fully lit, until old age takes it. That is what piled every ember along the top.
 */
float offFrame(vec2 q){
  return 1.0 - step(0.004, q.x)*step(q.x, 0.996)*step(0.004, q.y)*step(q.y, 0.996);
}
`;

export const PHASE4_PARTICLE_STATE_EFFECTS: FxEffect[] = [
  {
    id: 'particleforge', name: 'Particle Forge', version: 1, category: 'generator',
    summary: 'Particles with memory: each one carries its own position, velocity and life, so wind pushes it and the push is still there a second later. Emits, ages and replaces particles rather than recomputing a formula.',
    state: 2,
    params: [
      { key: 'spread', label: 'Emission Spread', min: 0, max: 1, default: .35, step: .01 },
      { key: 'gravity', label: 'Gravity', min: -2, max: 2, default: -.55, step: .02 },
      { key: 'turbulence', label: 'Turbulence', min: 0, max: 2, default: .7, step: .02 },
      { key: 'originY', label: 'Origin Y', min: 0, max: 1, default: .08, step: .005 },
      { key: 'life', label: 'Life', min: .2, max: 6, default: 2.6, step: .05 },
      { key: 'size', label: 'Size', min: .2, max: 3, default: 1, step: .02 },
      { key: 'originX', label: 'Origin X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'level', label: 'Level', min: 0, max: 2, default: 1, step: .02 },
    ],
    presets: [
      { id: 'embers', name: 'Embers', description: 'Sparks lifting off a fire, wandering as they rise.', params: { spread: .30, gravity: -.35, turbulence: .85, originY: .06, life: 3.2, size: .8, originX: .5, level: 1 } },
      { id: 'fountain', name: 'Fountain', description: 'Thrown up hard from below, pulled back down.', params: { spread: .45, gravity: 1.4, turbulence: .20, originY: .08, life: 2.6, size: 1.1, originX: .5, level: 1 } },
      { id: 'snowfall', name: 'Snowfall', description: 'Falling from above, drifting wide on the way down.', params: { spread: 1, gravity: .45, turbulence: 1.2, originY: .96, life: 6, size: .7, originX: .5, level: .9 } },
    ],
    // Visible pass; the two simulation passes below write the state and draw nothing.
    glsl: P + `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      {
        id: 'pos', target: 'state0',
        glsl: P + `vec4 fx(vec2 uv){
          float id = pid(uv);
          if (id < 0.0) return st0(uv);                 // the rest of the buffer is not ours
          float first = step(uFrame, 0.5);
          float dt = uDeltaT > 0.0 ? min(uDeltaT, 0.05) : 1.0/60.0;

          vec4 sp = st0(uv), sv = st1(uv);
          vec2 pos = vec2(dec16(sp.rg), dec16(sp.ba));
          vec2 vel = (sv.rg - 0.5) * 2.0 * 0.6;
          float age = sv.b;

          // Stagger the first generation across its whole life, or every particle would be born
          // on the same frame and the emitter would pulse once a second forever.
          float seed = ph11(id * 1.37);
          if (first > 0.5){ pos = emitter(); age = seed; }

          // A particle dies of old age OR by leaving the frame. Both passes compute this the
          // same way from the same previous state, so position and velocity never disagree.
          vec2 next = pos + vel * dt;
          float dead = max(step(1.0, age), offFrame(next));
          pos = mix(next, emitter(), dead);

          return vec4(enc16(clamp(pos.x, 0.0, 1.0)), enc16(clamp(pos.y, 0.0, 1.0)));
        }`,
      },
      {
        id: 'vel', target: 'state1',
        glsl: P + `vec4 fx(vec2 uv){
          float id = pid(uv);
          if (id < 0.0) return st1(uv);
          float first = step(uFrame, 0.5);
          float dt = uDeltaT > 0.0 ? min(uDeltaT, 0.05) : 1.0/60.0;

          vec4 sp = st0(uv), sv = st1(uv);
          vec2 pos = vec2(dec16(sp.rg), dec16(sp.ba));
          vec2 vel = (sv.rg - 0.5) * 2.0 * 0.6;
          float age = sv.b;
          float seed = ph11(id * 1.37);

          float speed = 0.20 + seed * 0.30;
          float a = launchAngle() + (ph11(id * 3.1 + floor(uTime * 1.7)) - 0.5) * 3.14159 * (0.15 + P0 * 1.7);
          vec2 fresh = vec2(cos(a), sin(a)) * speed;
          if (first > 0.5){ vel = fresh; age = seed; }

          // Forces integrate into the velocity, which is the whole point: a gust that pushes a
          // particle is still in its motion long after the gust has gone.
          vec2 gust = pcurl(pos * 3.4 + seed * 7.0, uTime * 0.25) * P2 * 0.55;
          vel += (gust + vec2(0.0, -P1 * 0.55)) * dt;
          vel *= (1.0 - clamp(0.18 * dt * 4.0, 0.0, 0.9));   // a little drag, always

          age += dt / max(0.2, P4);
          float dead = max(step(1.0, age), offFrame(pos + vel * dt));
          vel = mix(vel, fresh, dead);
          age = mix(age, 0.0, dead);

          return vec4(clamp(vel / 0.6 * 0.5 + 0.5, 0.0, 1.0), clamp(age, 0.0, 1.0), seed);
        }`,
      },
      {
        id: 'main',
        glsl: P + `vec4 fx(vec2 uv){
          vec4 b = inp(uv);
          float asp = uResolution.x / uResolution.y;
          vec2 p = vec2(uv.x * asp, uv.y);
          vec3 acc = vec3(0.0);
          vec2 texel = 1.0 / uResolution.xy;

          for (int i = 0; i < 96; i++){
            vec2 st = vec2((float(i) + 0.5) * texel.x, 0.5 * texel.y);
            vec4 sp = st0(st), sv = st1(st);
            vec2 pos = vec2(dec16(sp.rg), dec16(sp.ba));
            float age = sv.b, seed = sv.a;
            vec2 q = vec2(pos.x * asp, pos.y);

            // Born small, fade out at the end of life; a spark should not simply vanish.
            float fade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
            float r = (0.006 + seed * 0.008) * P5 * (0.55 + 0.45 * fade);
            float d = length(p - q);
            if (d > r * 7.0) continue;                  // most particles are nowhere near this pixel
            float core = exp(-(d*d) / (r*r + 1e-7));
            float halo = r * 0.55 / (d + r * 0.6);
            vec3 col = hsv2rgb(vec3(fract(0.06 + seed * 0.12 + age * 0.10), 0.72, 1.0));
            acc += col * (core + halo * 0.35) * fade;
          }

          vec3 o = b.rgb + acc * P7;
          return vec4(clamp(o, 0.0, 1.0), max(b.a, clamp(dot(acc, vec3(.2126,.7152,.0722)) * P7, 0.0, 1.0)));
        }`,
      },
    ],
  },
];
