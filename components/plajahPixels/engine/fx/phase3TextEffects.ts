// phase3TextEffects.ts — effects whose picture IS text: a camcorder status burn-in, a HUD
// readout, a CRT terminal. None of them draw glyphs; they read the AUX input, which the host
// rasterises from a TextOverlaySpec (services/fabula/textOverlay.ts). That keeps glyph layout in
// canvas, where fonts and shaping already work, and leaves the shader to do what it is good at.
//
// The aux slot declares kind 'text' so the host knows to feed a rasterised string, and to hand
// over a fully transparent texture when there is nothing to draw — the renderer's fallback is the
// SOURCE frame, which would otherwise read as 100% coverage and flood the picture.
import type { FxEffect } from './effects';

const T = `
float th21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
/** Coverage of the text texture, blurred by radius r (px) — the basis of every glow here. */
float tglow(vec2 uv, float r){
  float sum = 0.0;
  for (int i = 0; i < 8; i++){
    float a = float(i) * 0.7853981634;
    sum += aux(uv + vec2(cos(a), sin(a)) * r / uResolution.xy).a;
  }
  return sum * 0.125;
}
float tluma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
`;

const s = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'stylize' });

export const PHASE3_TEXT_EFFECTS: FxEffect[] = [
  s({
    id: 'vhsstatus', name: 'VHS Status Text', version: 1,
    summary: 'Camcorder burn-in: the tape wobbles the text, chroma smears it and dropouts chew holes in it. Use tokens like {tc} or {date} for a running stamp.',
    auxInput: { label: 'Overlay Text', kind: 'text' },
    params: [
      { key: 'glow', label: 'Bloom', min: 0, max: 1, default: .35, step: .01 },
      { key: 'jitter', label: 'Line Jitter', min: 0, max: 1, default: .25, step: .01 },
      { key: 'chroma', label: 'Chroma Smear', min: 0, max: 1, default: .4, step: .01 },
      { key: 'wobble', label: 'Tape Wobble', min: 0, max: 1, default: .2, step: .01 },
      { key: 'wear', label: 'Dropouts', min: 0, max: 1, default: .25, step: .01 },
      { key: 'level', label: 'Level', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'camcorder', name: 'Camcorder Stamp', description: 'Steady consumer burn-in with a little smear.', params: { glow: .3, jitter: .15, chroma: .35, wobble: .12, wear: .12, level: 1 } },
      { id: 'worn-tape', name: 'Worn Tape', description: 'Unstable, dropping out, heavily smeared.', params: { glow: .5, jitter: .7, chroma: .8, wobble: .6, wear: .7, level: 1 } },
      { id: 'clean-burnin', name: 'Clean Burn-in', description: 'Legible timecode with no tape damage.', params: { glow: .2, jitter: 0, chroma: .08, wobble: 0, wear: 0, level: 1 } },
    ],
    glsl: T + `vec4 fx(vec2 uv){
      vec4 b = inp(uv);
      float line = floor(uv.y * uResolution.y);
      float jit = (th21(vec2(line, floor(uTime * 12.0))) - 0.5) * P1 * 0.014;
      float wob = sin(uTime * 1.7 + uv.y * 6.0) * P3 * 0.007;
      vec2 tuv = uv + vec2(jit + wob, 0.0);
      float cs = P2 * 0.005;
      vec3 cov = vec3(aux(tuv + vec2(cs, 0.0)).a, aux(tuv).a, aux(tuv - vec2(cs, 0.0)).a);
      float drop = 1.0 - step(1.0 - P4 * 0.28, th21(vec2(line, floor(uTime * 8.0) + 7.0)));
      cov *= drop;
      vec3 tint = aux(tuv).rgb;
      vec3 lit = tint * cov + tint * tglow(tuv, 2.5) * P0 * drop;
      vec3 o = b.rgb + lit * P5;
      return vec4(clamp(o, 0.0, 1.0), max(b.a, clamp(tluma(lit) * P5, 0.0, 1.0)));
    }`,
  }),
  s({
    id: 'hudreadout', name: 'HUD Readout', version: 1,
    summary: 'Tinted heads-up text with scanlines, flicker, glow and a darkened plate that keeps it legible over a busy shot.',
    auxInput: { label: 'Readout Text', kind: 'text' },
    params: [
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .52, step: .005 },
      { key: 'scan', label: 'Scanlines', min: 0, max: 1, default: .35, step: .01 },
      { key: 'flicker', label: 'Flicker', min: 0, max: 1, default: .18, step: .01 },
      { key: 'glow', label: 'Glow', min: 0, max: 1, default: .5, step: .01 },
      { key: 'plate', label: 'Backing Plate', min: 0, max: 1, default: .35, step: .01 },
      { key: 'level', label: 'Level', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'targeting', name: 'Targeting', description: 'Hot cyan, tight scanlines, strong plate.', params: { hue: .52, scan: .5, flicker: .22, glow: .6, plate: .5, level: 1 } },
      { id: 'amber-avionics', name: 'Amber Avionics', description: 'Warm cockpit readout, steady.', params: { hue: .1, scan: .28, flicker: .06, glow: .4, plate: .3, level: 1 } },
      { id: 'clean-telemetry', name: 'Clean Telemetry', description: 'No flicker, minimal plate — for legible data.', params: { hue: .45, scan: .12, flicker: 0, glow: .3, plate: .18, level: 1 } },
    ],
    glsl: T + `vec4 fx(vec2 uv){
      vec4 b = inp(uv);
      float cov = aux(uv).a;
      float halo = tglow(uv, 3.0);
      vec3 col = hsv2rgb(vec3(fract(P0), 0.75, 1.0));
      float scan = 1.0 - P1 * 0.6 * (0.5 + 0.5 * sin(uv.y * uResolution.y * 3.14159));
      float flick = 1.0 - P2 * 0.5 * th21(vec2(floor(uTime * 20.0), 3.0));
      float plate = smoothstep(0.02, 0.65, halo) * P4;
      vec3 o = b.rgb * (1.0 - plate * 0.75);
      vec3 lit = col * (cov * scan + halo * P3 * 0.9) * flick;
      o += lit * P5;
      return vec4(clamp(o, 0.0, 1.0), max(b.a, clamp((plate + tluma(lit)) * P5, 0.0, 1.0)));
    }`,
  }),
  s({
    id: 'terminaltext', name: 'CRT Terminal', version: 1,
    summary: 'Phosphor terminal type: glowing monospace with scanlines, bloom, noise and a decaying trail that smears the text as it changes.',
    auxInput: { label: 'Terminal Text', kind: 'text' },
    temporal: true,
    params: [
      { key: 'phosphor', label: 'Phosphor', min: 0, max: 1, default: .33, step: .005 },
      { key: 'scan', label: 'Scanlines', min: 0, max: 1, default: .45, step: .01 },
      { key: 'bloom', label: 'Bloom', min: 0, max: 1, default: .5, step: .01 },
      { key: 'noise', label: 'Noise', min: 0, max: 1, default: .12, step: .01 },
      { key: 'persist', label: 'Persistence', min: 0, max: .95, default: .3, step: .01 },
      { key: 'level', label: 'Level', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'green-crt', name: 'Green CRT', description: 'Classic P1 phosphor with a long trail.', params: { phosphor: .33, scan: .5, bloom: .55, noise: .12, persist: .55, level: 1 } },
      { id: 'amber-crt', name: 'Amber CRT', description: 'Warmer tube, tighter scanlines.', params: { phosphor: .09, scan: .38, bloom: .45, noise: .08, persist: .35, level: 1 } },
      { id: 'cold-console', name: 'Cold Console', description: 'Blue-white, crisp, barely any trail.', params: { phosphor: .58, scan: .22, bloom: .3, noise: .04, persist: .08, level: 1 } },
    ],
    glsl: T + `vec4 fx(vec2 uv){
      vec4 b = inp(uv);
      float cov = aux(uv).a;
      float halo = tglow(uv, 3.5);
      vec3 col = hsv2rgb(vec3(fract(P0), 0.7, 1.0));
      float scan = 1.0 - P1 * 0.65 * (0.5 + 0.5 * sin(uv.y * uResolution.y * 3.14159));
      float grain = 1.0 + (th21(uv * uResolution.xy + uTime) - 0.5) * P3;
      vec3 lit = col * (cov * scan + halo * P2 * 0.85) * grain;
      // Phosphor persistence: the previous OUTPUT decays instead of cutting, so changing text smears.
      vec3 trail = max(vec3(0.0), prev(uv).rgb - b.rgb) * P4;
      vec3 glowing = max(lit, trail);
      vec3 o = b.rgb + glowing * P5;
      return vec4(clamp(o, 0.0, 1.0), max(b.a, clamp(tluma(glowing) * P5, 0.0, 1.0)));
    }`,
  }),
];
