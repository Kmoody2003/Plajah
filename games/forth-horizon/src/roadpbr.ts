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
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
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
vec2 rainRings(vec2 p, float t, float amt) {
  vec2 g = p * 2.3, id = floor(g), f = fract(g) - 0.5;
  float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
  float ph = fract(t * 0.95 + h);
  float r = length(f);
  float ring = smoothstep(0.07, 0.0, abs(r - ph * 0.5)) * (1.0 - ph) * step(h, amt);
  return normalize(f + 1e-4) * ring;
}`;

/**
 * Patch a standard-material fragment shader. Needs these in scope by the time its tokens run: `wp` (vec2 world xz) is taken from `wpExpr`,
 * `gRoad` (0..1 how much road is under this pixel, defined by the caller before color_fragment), `gPud` (puddle mask) and the uniform `uWet`.
 */
export function injectRoadPbr(fs: string, wpExpr: string): string {
  return fs
    .replace('#include <common>', '#include <common>\n' + DECL + (fs.includes('puddleAt') ? '' : PUDDLE_GLSL))
    .replace('#include <color_fragment>', `#include <color_fragment>
      float rpFade = 1.0 - smoothstep(30.0, 110.0, length(vViewPosition));
      vec2 rwp = ${wpExpr};
      float rpAO = mix(1.0, texture2D(tRA, rwp / 2.4).r * 0.6 + texture2D(tRA, rwp / 0.62 + 0.21).r * 0.4, rpFade);
      float rpMacro = texture2D(tRA, rwp / 19.0).r;
      diffuseColor.rgb *= mix(1.0, (0.62 + 0.55 * rpAO) * (0.9 + 0.2 * rpMacro), gRoad);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      {
        float rr = mix(texture2D(tRR, rwp / 2.4).r, texture2D(tRR, rwp / 0.62 + 0.21).r, 0.45 * rpFade);
        float rr2 = texture2D(tRR, rwp / 9.0).r;                        // oil, rubber and damp patches at a larger scale
        float dryRough = clamp(0.55 + 0.5 * mix(rr2, rr, 0.5), 0.5, 0.98);
        float wetRough = 0.1 + 0.34 * rr2;
        roughnessFactor = mix(roughnessFactor, mix(dryRough, wetRough, clamp(uWet * 1.15, 0.0, 1.0)), gRoad);
      }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 rn1 = texture2D(tRN, rwp / 2.4).xyz * 2.0 - 1.0, rn2 = texture2D(tRN, rwp / 0.62 + 0.21).xyz * 2.0 - 1.0;
        float pores = 1.0 - clamp(uWet * 0.85, 0.0, 1.0);
        vec2 sl = (rn1.xy * 0.95 + rn2.xy * 0.75) * gRoad * rpFade * mix(1.0, pores, 0.9) * (1.0 - gPud);
        if (uRainR > 0.02) sl += rainRings(rwp, uTimeR, uRainR) * gPud * 0.8;
        normal = normalize(normal + (viewMatrix * vec4(sl.x, 0.0, sl.y, 0.0)).xyz);
      }`);
}
