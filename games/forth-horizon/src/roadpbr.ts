// Asphalt as a real material: micro normal, roughness and ambient occlusion maps (cut from the racer folder's damp-asphalt reference sheet, rebuilt by
// tools/build_road_pbr.py) tiled at two scales over the road colour, so light breaks up on the grain instead of sliding off a flat plane. Wet roads fill the pores
// (the normal flattens, the roughness drops), puddles are mirror-flat with rain rings, and the detail fades with distance so it never shimmers.
import * as THREE from 'three';
import { PUDDLE_GLSL } from './spray';

const BASE = '/games/forth-horizon/tex/';
const cache: Record<string, THREE.Texture> = {};
function tex(name: string, srgb: boolean): THREE.Texture {
  if (!cache[name]) {
    const t = new THREE.TextureLoader().load(BASE + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache[name] = t;
  }
  return cache[name];
}

export const roadUniforms = {
  tRN: { value: null as THREE.Texture | null }, tRR: { value: null as THREE.Texture | null }, tRA: { value: null as THREE.Texture | null },
  uRainR: { value: 0 }, uTimeR: { value: 0 },
};
export function loadRoadPbr(): void {
  roadUniforms.tRN.value = tex('road_n.jpg', false);
  roadUniforms.tRR.value = tex('road_r.jpg', false);
  roadUniforms.tRA.value = tex('road_ao.jpg', false);
}

const DECL = `
uniform sampler2D tRN, tRR, tRA;
uniform float uRainR, uTimeR;
vec2 rainLayer(vec2 p, float t, float amt, float seed) {
  vec2 id = floor(p), f = fract(p) - 0.5;
  vec2 h2 = fract(sin(vec2(dot(id, vec2(127.1, 311.7)) + seed, dot(id, vec2(269.5, 183.3)) + seed * 1.7)) * 43758.5453);
  vec2 d = f - (h2 - 0.5) * 0.54;
  float h = fract(h2.x * 13.7 + h2.y * 7.3);
  float ph = fract(t * (0.85 + 0.35 * h2.y) + h);
  float r = length(d);
  float rad = ph * (0.22 + 0.14 * h2.x);
  float ring = smoothstep(0.036, 0.0, abs(r - rad)) * (1.0 - ph) * (1.0 - ph) * step(h, amt * 0.85);
  return normalize(d + 1e-4) * ring;
}
vec2 rainRings(vec2 p, float t, float amt) {
  vec2 p2 = mat2(0.8, -0.6, 0.6, 0.8) * p;
  return rainLayer(p * 3.6, t, amt, 1.0) * 0.58 + rainLayer(p2 * 6.4 + 3.7, t * 1.15, amt, 19.3) * 0.42;
}`;

/**
 * Patch a standard-material fragment shader. Needs these in scope by the time its tokens run: `wp` (vec2 world xz) is taken from `wpExpr`,
 * `gRoad` (0..1 how much road is under this pixel, defined by the caller before color_fragment), `gPud` (puddle mask) and the uniform `uWet`.
 */
export function injectRoadPbr(fs: string, wpExpr: string): string {
  return fs
    .replace('#include <common>', '#include <common>\n' + DECL + (fs.includes('puddleAt') ? '' : PUDDLE_GLSL))
    .replace('#include <color_fragment>', `#include <color_fragment>
      float rpFade = 0.0;
      vec2 rwp = ${wpExpr};
      if (gRoad > 0.005) {
        rpFade = 1.0 - smoothstep(30.0, 120.0, length(vViewPosition));
        float rpAO = mix(1.0, texture2D(tRA, rwp / 2.4).r * 0.6 + texture2D(tRA, rwp / 0.62 + 0.21).r * 0.4, rpFade);
        float rpMacro = texture2D(tRA, rwp / 19.0).r;
        // High-frequency aggregate grit & patchy wear from real scanned asphalt maps (no synthetic wave contours)
        diffuseColor.rgb *= mix(1.0, (0.60 + 0.56 * rpAO) * (0.86 + 0.28 * rpMacro), gRoad);
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      if (gRoad > 0.005) {
        float rr = mix(texture2D(tRR, rwp / 2.4).r, texture2D(tRR, rwp / 0.62 + 0.21).r, 0.45 * rpFade);
        float rr2 = texture2D(tRR, rwp / 9.0).r;                        // oil, rubber and damp patches at a larger scale
        float dryRough = clamp(0.46 + 0.50 * mix(rr2, rr, 0.55), 0.42, 0.96);
        float wetRough = 0.05 + 0.23 * rr2;
        roughnessFactor = mix(roughnessFactor, mix(dryRough, wetRough, clamp(uWet * 1.2, 0.0, 1.0)), gRoad);
      }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (gRoad > 0.005 && rpFade > 0.005) {
        vec3 rn1 = texture2D(tRN, rwp / 2.4).xyz * 2.0 - 1.0, rn2 = texture2D(tRN, rwp / 0.62 + 0.21).xyz * 2.0 - 1.0;
        float pores = 1.0 - clamp(uWet * 0.88, 0.0, 1.0);
        vec2 sl = (rn1.xy * 0.95 + rn2.xy * 0.75) * gRoad * rpFade * mix(1.0, pores, 0.92) * (1.0 - gPud);
        if (uRainR > 0.02) {
          float rDist = 1.0 - smoothstep(8.0, 32.0, length(vViewPosition));
          if (rDist > 0.01) sl += rainRings(rwp, uTimeR, uRainR) * gPud * 0.34 * rDist;
        }
        normal = normalize(normal + (viewMatrix * vec4(sl.x, 0.0, sl.y, 0.0)).xyz);
      }`);
}
