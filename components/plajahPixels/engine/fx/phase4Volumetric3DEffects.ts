// phase4Volumetric3DEffects.ts — the Trapcode Form / Mir / Tao class: 3D generators with a real
// camera, depth and perspective.
//
// W3c originally scoped these as a three.js layer node. That would mean a second renderer feeding
// the compositor, and every feature since (masks, track bindings, keyframes, the offline export)
// would need teaching about it. These are instead RAYMARCHED inside the existing registry, so they
// are ordinary effects: they mask, keyframe, bind to tracks and export with no new plumbing.
//
// The tradeoff is honest and worth writing down: raymarching covers the LOOK of a particle field,
// a displaced terrain and an extruded path, but not arbitrary imported geometry. A model-loading
// 3D node remains genuinely out of reach here, and stays on the backlog.
import type { FxEffect } from './effects';

const V = `
float v3h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float v3h31(vec3 p){ vec3 q = fract(p * 0.1031); q += dot(q, q.zyx + 31.32); return fract((q.x + q.y) * q.z); }
float v3noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(v3h21(i), v3h21(i + vec2(1,0)), f.x), mix(v3h21(i + vec2(0,1)), v3h21(i + vec2(1,1)), f.x), f.y); }
float v3fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * v3noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
vec3 v3rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 v3rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
/** Orbit + tilt + push down the z axis, with the trig hoisted out of the caller's loop. */
vec3 v3cam(vec3 p, float ca, float sa, float cx, float sx){
  vec3 q = vec3(ca * p.x + sa * p.z, p.y, -sa * p.x + ca * p.z);
  q = vec3(q.x, cx * q.y - sx * q.z, sx * q.y + cx * q.z);
  return vec3(q.x, q.y, q.z + 3.0);
}
`;

const g = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'generator' });

export const PHASE4_VOLUMETRIC_EFFECTS: FxEffect[] = [
  g({
    id: 'particlefield3d', name: 'Particle Field 3D', version: 1,
    summary: 'A three-dimensional grid of glowing particles with a real camera orbit, depth falloff and audio displacement — the Trapcode Form idea, raymarched.',
    params: [
      { key: 'density', label: 'Density', min: 1, max: 14, default: 5, step: .1 },
      { key: 'size', label: 'Particle Size', min: .1, max: 3, default: 1, step: .02 },
      { key: 'disperse', label: 'Dispersion', min: 0, max: 1, default: .35, step: .01 },
      { key: 'speed', label: 'Motion', min: 0, max: 3, default: .6, step: .02 },
      { key: 'reactivity', label: 'Audio Displace', min: 0, max: 1, default: 0, step: .01 },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .58, step: .005 },
      { key: 'depth', label: 'Depth Falloff', min: 0, max: 2, default: .8, step: .02 },
      { key: 'level', label: 'Level', min: 0, max: 2, default: 1, step: .02 },
    ],
    presets: [
      { id: 'nebula', name: 'Nebula', description: 'Wide, soft, slowly drifting cloud.', params: { density: 3.5, size: 1.6, disperse: .7, speed: .3, reactivity: 0, hue: .72, depth: .5, level: 1 } },
      { id: 'data-lattice', name: 'Data Lattice', description: 'Sparse crisp points receding into depth.', params: { density: 9, size: .5, disperse: .08, speed: .4, reactivity: 0, hue: .52, depth: 1.1, level: 1 } },
      { id: 'audio-swarm', name: 'Audio Swarm', description: 'Bass pushes the particles around.', params: { density: 6, size: 1.1, disperse: .5, speed: 1.2, reactivity: .85, hue: .05, depth: .7, level: 1.2 } },
    ],
    glsl: V + `vec4 fx(vec2 uv){
      vec4 b = inp(uv);
      float asp = uResolution.x / uResolution.y;
      vec2 p = (uv - 0.5) * vec2(asp, 1.0);
      float ang = uTime * P3 * 0.2;
      vec3 ro = v3rotY(vec3(0.0, 0.35, -3.2), ang);
      vec3 rd = normalize(v3rotY(vec3(p, 1.35), ang));
      float gap = 1.0 / max(1.0, P0);
      float grow = 1.0 + iLevel * P4 * 2.0;
      float r = gap * 0.075 * P1 * grow;
      vec3 acc = vec3(0.0);
      // One march per lattice cell, and each cell is measured by the ray's CLOSEST APPROACH to
      // its centre rather than by the distance at the sample point. Sampling at fixed steps misses
      // any particle smaller than the step, which leaves a dense field looking empty.
      float tStep = max(gap, 0.07);
      float t = 0.5;
      for (int i = 0; i < 36; i++){
        vec3 pos = ro + rd * t;
        vec3 id = floor(pos / gap);
        t += tStep;
        // Only some cells hold a particle. A fully populated lattice streaks badly wherever the
        // ray runs near a lattice axis, because every cell along it then reads as a near hit.
        if (v3h31(id + 5.71) > 0.45) continue;
        vec3 centre = (id + 0.5) * gap;
        vec3 jit = vec3(v3h31(id), v3h31(id + 7.13), v3h31(id + 13.77)) - 0.5;
        centre += jit * gap * P2;
        // Each particle breathes on its own phase; bass pushes the whole field.
        centre.y += sin(uTime * P3 + v3h31(id) * 6.2831) * gap * 0.35 * (1.0 + iBass * P4 * 3.0);
        vec3 toC = centre - ro;
        float proj = dot(toC, rd);
        if (proj > 0.1) {
          float perp = length(toC - rd * proj);
          float glow = exp(-(perp * perp) / (r * r + 1e-7));
          float spark = 0.5 + 0.5 * v3h31(id + 3.3);
          acc += hsv2rgb(vec3(fract(P5 + id.z * 0.03 + v3h31(id) * 0.06), 0.72, 1.0)) * glow * spark * exp(-proj * (P6 + 0.4) * 0.55);
        }
      }
      vec3 o = b.rgb + acc * P7;
      return vec4(clamp(o, 0.0, 1.0), max(b.a, clamp(dot(acc, vec3(.2126,.7152,.0722)) * P7, 0.0, 1.0)));
    }`,
  }),
  g({
    id: 'terrain3d', name: 'Terrain 3D', version: 1,
    summary: 'A flying camera over an endless fractal landscape, with a wireframe blend and distance fog — the Trapcode Mir idea, raymarched as a heightfield.',
    params: [
      { key: 'scale', label: 'Terrain Scale', min: .1, max: 3, default: .8, step: .01 },
      { key: 'height', label: 'Relief', min: 0, max: 3, default: 1, step: .02 },
      { key: 'speed', label: 'Fly Speed', min: -4, max: 4, default: 1.2, step: .05 },
      { key: 'wire', label: 'Wireframe', min: 0, max: 1, default: .25, step: .01 },
      { key: 'fog', label: 'Distance Fog', min: 0, max: 2, default: .7, step: .02 },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .55, step: .005 },
      { key: 'altitude', label: 'Camera Height', min: .1, max: 3, default: 1, step: .02 },
      { key: 'level', label: 'Level', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'wire-canyon', name: 'Wire Canyon', description: 'Hard wireframe over deep relief.', params: { scale: .7, height: 1.8, speed: 1.6, wire: .9, fog: .6, hue: .52, altitude: 1.2, level: 1 } },
      { id: 'soft-dunes', name: 'Soft Dunes', description: 'Low rolling terrain, warm, almost no wire.', params: { scale: .4, height: .6, speed: .7, wire: .05, fog: .9, hue: .08, altitude: .8, level: 1 } },
      { id: 'alien-ridge', name: 'Alien Ridge', description: 'Sharp violet ridges in heavy fog.', params: { scale: 1.4, height: 2.2, speed: 2.2, wire: .45, fog: 1.3, hue: .78, altitude: 1.5, level: 1 } },
    ],
    glsl: V + `float v3ter(vec2 q){ return v3fbm(q * P0) * P1; }
    vec4 fx(vec2 uv){
      vec4 b = inp(uv);
      float asp = uResolution.x / uResolution.y;
      vec2 p = (uv - 0.5) * vec2(asp, 1.0);
      vec3 ro = vec3(0.0, P6 + 0.6, uTime * P2);
      vec3 rd = normalize(vec3(p, 1.2));
      float t = 0.2;
      float tPrev = 0.2;
      float hit = -1.0;
      vec3 pos = ro;
      for (int i = 0; i < 48; i++){
        pos = ro + rd * t;
        if (pos.y < v3ter(pos.xz)) { hit = t; break; }
        tPrev = t;
        t += 0.075 + t * 0.055;
        if (t > 34.0) break;
      }
      if (hit < 0.0) return b;
      // A coarse march overshoots thin ridges and punches through to whatever is behind them,
      // which shows up as vertical spikes. Five bisections between the last step above the
      // surface and the first below it cost far less than marching finely everywhere.
      float lo = tPrev, hi = hit;
      for (int i = 0; i < 5; i++){
        float mid = (lo + hi) * 0.5;
        vec3 q = ro + rd * mid;
        if (q.y < v3ter(q.xz)) hi = mid; else lo = mid;
      }
      hit = hi;
      pos = ro + rd * hit;
      float hc = v3ter(pos.xz);
      float e = 0.035;
      vec3 n = normalize(vec3(hc - v3ter(pos.xz + vec2(e, 0.0)), e, hc - v3ter(pos.xz + vec2(0.0, e))));
      float lam = clamp(dot(n, normalize(vec3(0.45, 0.8, -0.35))), 0.0, 1.0);
      vec3 col = hsv2rgb(vec3(fract(P5 + hc * 0.08), 0.6, 1.0)) * (0.22 + 0.78 * lam);
      vec2 gg = fract(pos.xz * P0 * 2.0);
      float edge = min(min(gg.x, 1.0 - gg.x), min(gg.y, 1.0 - gg.y));
      col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.045, edge)) * P3);
      float fog = exp(-hit * P4 * 0.11);
      vec3 o = mix(b.rgb, col, clamp(P7 * fog, 0.0, 1.0));
      return vec4(clamp(o, 0.0, 1.0), max(b.a, clamp(P7 * fog, 0.0, 1.0)));
    }`,
  }),
  g({
    id: 'pathextrude3d', name: 'Path Extrude 3D', version: 1,
    summary: 'A glowing ribbon extruded along a 3D curve that orbits the camera, tapering as it runs — the Trapcode Tao idea, drawn by projecting the path rather than meshing it.',
    params: [
      { key: 'thickness', label: 'Thickness', min: .1, max: 4, default: 1, step: .02 },
      { key: 'twist', label: 'Twist', min: 0, max: 1, default: .3, step: .01 },
      { key: 'winds', label: 'Winds', min: .5, max: 8, default: 2.5, step: .1 },
      { key: 'speed', label: 'Orbit', min: -3, max: 3, default: .8, step: .02 },
      { key: 'glow', label: 'Glow', min: 0, max: 2, default: .6, step: .02 },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .12, step: .005 },
      { key: 'taper', label: 'Taper', min: 0, max: 1, default: .4, step: .01 },
      { key: 'level', label: 'Level', min: 0, max: 2, default: 1, step: .02 },
    ],
    presets: [
      { id: 'ribbon-helix', name: 'Ribbon Helix', description: 'A clean tapering helix.', params: { thickness: .8, twist: .2, winds: 3, speed: .8, glow: .5, hue: .12, taper: .6, level: 1 } },
      { id: 'neon-knot', name: 'Neon Knot', description: 'Tight twisted loops, hot glow.', params: { thickness: 1.4, twist: .85, winds: 5.5, speed: 1.5, glow: 1.4, hue: .85, taper: .15, level: 1.3 } },
      { id: 'slow-arc', name: 'Slow Arc', description: 'One broad cyan sweep, barely moving.', params: { thickness: 2.2, twist: .05, winds: 1, speed: .2, glow: .8, hue: .5, taper: .8, level: 1 } },
    ],
    glsl: V + `vec3 v3path(float s, float tw, float wn){
      float a = s * wn * 6.28318;
      float rr = 0.62 + 0.34 * sin(s * 6.28318 + tw * 6.28318);
      return vec3(cos(a) * rr, sin(a) * rr * 0.75 + (s - 0.5) * tw * 1.4, (s - 0.5) * 3.4);
    }
    vec4 fx(vec2 uv){
      vec4 b = inp(uv);
      float asp = uResolution.x / uResolution.y;
      vec2 p = (uv - 0.5) * vec2(asp, 1.0);
      float ang = uTime * P3 * 0.35;
      // The curve is drawn by projecting samples along it, so there is no mesh to build and the
      // cost is fixed regardless of how tangled the path gets. Each step shades the SEGMENT
      // between consecutive samples: shading the samples alone renders a dotted line, because
      // they sit further apart on screen than the ribbon is wide.
      float best = 0.0;
      float halo = 0.0;
      float hueAcc = 0.0;
      float wsum = 0.0;
      float ca = cos(ang), sa = sin(ang);
      float cx = cos(0.35), sx = sin(0.35);
      vec3 qPrev = v3cam(v3path(0.0, P1, P2), ca, sa, cx, sx);
      for (int i = 1; i < 48; i++){
        float s = float(i) / 47.0;
        vec3 q = v3cam(v3path(s, P1, P2), ca, sa, cx, sx);
        vec3 qa = qPrev; qPrev = q;
        if (qa.z < 0.3 || q.z < 0.3) continue;
        vec2 sa = qa.xy / (qa.z * 0.62);
        vec2 sb = q.xy / (q.z * 0.62);
        vec2 pa = p - sa, ba = sb - sa;
        float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
        float d = length(pa - ba * h);
        float zMid = mix(qa.z, q.z, h);
        float taper = mix(1.0, max(0.06, 1.0 - s), P6);
        float r = P0 * 0.030 * taper / max(0.35, zMid * 0.42);
        float fade = exp(-zMid * 0.16);
        float core = exp(-(d * d) / (r * r + 1e-6)) * fade;
        best = max(best, core);
        // Uniform-driven branch: coherent across the whole draw, and skips an exp per segment
        // whenever the glow is off.
        if (P4 > 0.002) halo += exp(-(d * d) / (r * r * 8.0 + 1e-6)) * fade * 0.02 * P4;
        hueAcc += (P5 + s * 0.35) * core;
        wsum += core;
      }
      vec3 col = wsum > 1e-4 ? hsv2rgb(vec3(fract(hueAcc / wsum), 0.78, 1.0)) : vec3(0.0);
      vec3 acc = col * (best + min(halo, 1.1));
      vec3 o = b.rgb + acc * P7;
      return vec4(clamp(o, 0.0, 1.0), max(b.a, clamp(dot(acc, vec3(.2126,.7152,.0722)) * P7, 0.0, 1.0)));
    }`,
  }),
];
