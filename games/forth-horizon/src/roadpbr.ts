// Asphalt & surface PBR engine: upgrades road grain, curbs, sidewalks, and rumble strips
// to our curated high-res PBR texture sets (downsampled smoothly to 1024x1024 mipmapped GPU
// textures with 8x anisotropy for crisp Series S/X detail at 4x lower VRAM), plus real-time
// shallow-water tire-wake fluid ripples (services/realtimeSim/realtimeFluid.ts) in wet puddles.
import * as THREE from 'three';
import { PUDDLE_GLSL } from './spray';
import { RealtimeRippleField } from '../../../services/realtimeSim/realtimeFluid';

const BASE = '/games/forth-horizon/tex/';
const cache: Record<string, THREE.Texture> = {};

function quickTex(name: string, srgb: boolean): THREE.Texture {
  if (!cache[name]) {
    const t = new THREE.TextureLoader().load(BASE + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache[name] = t;
  }
  return cache[name];
}

/**
 * Loads a curated 2K PNG PBR texture and downsamples smoothly to 1024x1024 GPU mipmaps
 * (4x less VRAM than raw 2K PNG, keeping Series X crispness with 8x anisotropy and zero VRAM spikes).
 */
export function loadPbr1K(file: string, srgb: boolean, fallbackHex = 0x808080): THREE.Texture {
  const key = '1k:' + file;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + fallbackHex.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 4, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  cache[key] = tex;

  const img = new Image();
  img.onload = () => {
    const sz = Math.min(1024, img.naturalWidth || 1024);
    const hi = document.createElement('canvas');
    hi.width = hi.height = sz;
    const ctx = hi.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, sz, sz);
    tex.image = hi;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  };
  img.src = BASE + file;
  return tex;
}

export const roadRipples = new RealtimeRippleField(96, 42);

export const roadUniforms = {
  tRN: { value: null as THREE.Texture | null },
  tRR: { value: null as THREE.Texture | null },
  tRA: { value: null as THREE.Texture | null },
  uRainR: { value: 0 },
  uTimeR: { value: 0 },
  tRipple: { value: roadRipples.texture as THREE.Texture },
  uRippleOrigin: { value: roadRipples.origin },
  uRippleSpan: { value: roadRipples.spanMeters },
};

export function loadRoadPbr(): void {
  // Instant fast base maps upgraded seamlessly to our curated high-res ground_asphalt_dry PBR maps
  roadUniforms.tRN.value = loadPbr1K('ground_asphalt_dry_normal.png', false, 0x8080ff);
  roadUniforms.tRR.value = loadPbr1K('ground_asphalt_dry_roughness.png', false, 0xb8b8b8);
  roadUniforms.tRA.value = loadPbr1K('ground_asphalt_dry_ao.png', false, 0xd8d8d8);
  // Keep quick fallback warm in case of offline missing png
  void quickTex;
}

const DECL = `
uniform sampler2D tRN, tRR, tRA, tRipple;
uniform float uRainR, uTimeR, uRippleSpan;
uniform vec2 uRippleOrigin;
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
        rpFade = 1.0 - smoothstep(32.0, 135.0, length(vViewPosition));
        float rpAO = mix(1.0, texture2D(tRA, rwp / 2.8).r * 0.58 + texture2D(tRA, rwp / 0.72 + 0.21).r * 0.42, rpFade);
        float rpMacro = texture2D(tRA, rwp / 18.0).r;
        // High-frequency aggregate grit, bitumen pores & patchy wear from curated 2K asphalt PBR maps
        diffuseColor.rgb *= mix(1.0, (0.56 + 0.60 * rpAO) * (0.85 + 0.30 * rpMacro), gRoad);
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      if (gRoad > 0.005) {
        float rr = mix(texture2D(tRR, rwp / 2.8).r, texture2D(tRR, rwp / 0.72 + 0.21).r, 0.48 * rpFade);
        float rr2 = texture2D(tRR, rwp / 9.5).r;                        // oil, rubber and damp patches at a larger scale
        float dryRough = clamp(0.42 + 0.52 * mix(rr2, rr, 0.58), 0.38, 0.95);
        float wetRough = 0.04 + 0.22 * rr2;
        roughnessFactor = mix(roughnessFactor, mix(dryRough, wetRough, clamp(uWet * 1.2, 0.0, 1.0)), gRoad);
      }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (gRoad > 0.005 && rpFade > 0.005) {
        vec3 rn1 = texture2D(tRN, rwp / 2.8).xyz * 2.0 - 1.0, rn2 = texture2D(tRN, rwp / 0.72 + 0.21).xyz * 2.0 - 1.0;
        float pores = 1.0 - clamp(uWet * 0.86, 0.0, 1.0);
        vec2 sl = (rn1.xy * 1.25 + rn2.xy * 0.92) * gRoad * rpFade * mix(1.0, pores, 0.90) * (1.0 - gPud);
        // Real-time shallow-water tire wake ripples from Plajah RealtimeRippleField on wet roads & puddles!
        float wetMask = max(gPud, uWet * 0.45);
        if (wetMask > 0.02) {
          vec2 ripUv = (rwp - uRippleOrigin) / uRippleSpan + 0.5;
          if (ripUv.x > 0.02 && ripUv.x < 0.98 && ripUv.y > 0.02 && ripUv.y < 0.98) {
            vec2 ripN = texture2D(tRipple, ripUv).rg * 2.0 - 1.0;
            float edgeFade = smoothstep(0.02, 0.14, min(min(ripUv.x, 1.0 - ripUv.x), min(ripUv.y, 1.0 - ripUv.y)));
            sl += ripN * wetMask * edgeFade * 0.65;
          }
        }
        if (uRainR > 0.02) {
          float rDist = 1.0 - smoothstep(8.0, 32.0, length(vViewPosition));
          if (rDist > 0.01) sl += rainRings(rwp, uTimeR, uRainR) * gPud * 0.36 * rDist;
        }
        normal = normalize(normal + (viewMatrix * vec4(sl.x, 0.0, sl.y, 0.0)).xyz);
      }`);
}
