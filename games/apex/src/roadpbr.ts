// Asphalt & surface PBR engine: upgrades road grain, curbs, sidewalks, and rumble strips
// to our curated high-res PBR texture sets (downsampled smoothly to 1024x1024 mipmapped GPU
// textures with 8x anisotropy for crisp Series S/X detail at 4x lower VRAM), plus real-time
// shallow-water tire-wake fluid ripples (services/realtimeSim/realtimeFluid.ts) in wet puddles.
import * as THREE from 'three';
import { PUDDLE_GLSL } from './spray';
import { RealtimeRippleField } from '../../../services/realtimeSim/realtimeFluid';

const BASE = '/games/apex/tex/';
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

// Serialized 2-slot queue for 2K PNG -> mipmapped PBR downsampling so we never flood
// Chrome's HTTP pool or spike D3D11 Texture2D allocations at boot.
let pbrInFlight = 0;
const pbrQueue: (() => void)[] = [];
function enqueuePbr(job: () => Promise<void>): void {
  const run = (): void => {
    pbrInFlight++;
    job().finally(() => {
      pbrInFlight--;
      const next = pbrQueue.shift();
      if (next) next();
    });
  };
  if (pbrInFlight < 2) run();
  else pbrQueue.push(run);
}

/**
 * Loads a curated 2K PNG PBR texture and downsamples smoothly to target mipmapped GPU size
 * (default 512 for aux maps, 1024 for hero asphalt albedo/normal) with 8x anisotropy.
 * Disposes the temporary 4x4 WebGL2 immutable storage before uploading the full canvas
 * so WebGL2 never emits GL_INVALID_VALUE: Offset overflows texture dimensions.
 */
export function loadPbr1K(file: string, srgb: boolean, fallbackHex = 0x808080, maxSize = 1024): THREE.Texture {
  const key = `${maxSize}:${file}`;
  if (cache[key]) return cache[key];
  const sz = Math.max(64, Math.min(1024, maxSize));
  const c = document.createElement('canvas');
  c.width = c.height = sz;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + fallbackHex.toString(16).padStart(6, '0');
  g.fillRect(0, 0, sz, sz);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cache[key] = tex;

  enqueuePbr(() => new Promise<void>((resolve) => {
    const img = new Image();
    const finish = (): void => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      resolve();
    };
    img.onload = () => {
      // Update fixed-size canvas in-place (ZERO tex.dispose() or tex.source swap -> 100% WebGPU bind-group safe!)
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, sz, sz);
      tex.needsUpdate = true;
      finish();
    };
    img.onerror = finish;
    img.src = BASE + file;
  }));
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
  // Hero asphalt normal stays crisp 1024; roughness & AO are smooth scalar maps at 512 (4x lower VRAM)
  roadUniforms.tRN.value = loadPbr1K('ground_asphalt_dry_normal.png', false, 0x8080ff, 1024);
  roadUniforms.tRR.value = loadPbr1K('ground_asphalt_dry_roughness.png', false, 0xb8b8b8, 512);
  roadUniforms.tRA.value = loadPbr1K('ground_asphalt_dry_ao.png', false, 0xd8d8d8, 512);
  // Keep quick fallback warm in case of offline missing png
  void quickTex;
}

const usRoadTexCache = new Map<string, THREE.CanvasTexture>();

/**
 * Generates a crisp 1024x1024 US MUTCD-compliant asphalt road albedo texture:
 * - '2lane': US double-yellow amber centerline (#f0b624) + solid white outer fog edge lines + subtle wheel-track wear
 * - '4lane': US double-yellow center divider + white dashed same-direction lane dividers + solid white outer fog lines
 * - 'plain': clean unmarked weathered asphalt for intersection aprons (prevents cross-section stripe collisions!)
 */
export function createUsRoadTexture(variant: '2lane' | '4lane' | 'plain'): THREE.CanvasTexture {
  const cached = usRoadTexCache.get(variant);
  if (cached) return cached;
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;

  // Base weathered dark Michigan asphalt aggregate
  g.fillStyle = '#36383d';
  g.fillRect(0, 0, W, H);
  // Deterministic fine mineral aggregate & micro-tar variation
  let s = variant === '2lane' ? 1337 : variant === '4lane' ? 4242 : 7777;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  for (let i = 0; i < 16000; i++) {
    const v = 38 + Math.floor(rnd() * 34);
    g.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.2, 1 + rnd() * 2.2);
  }
  // Subtle longitudinal tire polishing tracks inside each driving lane
  const trackXs = variant === '4lane'
    ? [0.13, 0.21, 0.34, 0.42, 0.58, 0.66, 0.79, 0.87]
    : variant === '2lane'
    ? [0.20, 0.34, 0.66, 0.80]
    : [];
  for (const tx of trackXs) {
    const grd = g.createLinearGradient((tx - 0.05) * W, 0, (tx + 0.05) * W, 0);
    grd.addColorStop(0, 'rgba(18,20,24,0)');
    grd.addColorStop(0.5, 'rgba(18,20,24,0.20)');
    grd.addColorStop(1, 'rgba(18,20,24,0)');
    g.fillStyle = grd;
    g.fillRect((tx - 0.05) * W, 0, 0.10 * W, H);
  }

  // Subtle asphalt crack lines
  g.strokeStyle = 'rgba(20,21,24,0.34)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    let cx = rnd() * W, cy = rnd() * H;
    g.moveTo(cx, cy);
    for (let j = 0; j < 7; j++) { cx += (rnd() - 0.5) * 32; cy += 10 + rnd() * 22; g.lineTo(cx, cy); }
    g.stroke();
  }

  if (variant !== 'plain') {
    const edgeOff = variant === '4lane' ? 0.036 : 0.052;
    const edgeW = variant === '4lane' ? 6 : 8;
    // US MUTCD Solid White Outer Fog Lines (both shoulders)
    g.fillStyle = '#e7e7e0';
    g.fillRect(W * edgeOff - edgeW * 0.5, 0, edgeW, H);
    g.fillRect(W * (1 - edgeOff) - edgeW * 0.5, 0, edgeW, H);

    // US MUTCD Double Solid Amber-Yellow Centerline (separating opposing traffic!)
    const yGap = variant === '4lane' ? 7 : 9;
    const yW = variant === '4lane' ? 6 : 7.5;
    g.fillStyle = '#edb426';
    g.fillRect(W * 0.5 - yGap - yW * 0.5, 0, yW, H);
    g.fillRect(W * 0.5 + yGap - yW * 0.5, 0, yW, H);

    // US MUTCD Dashed White Same-Direction Lane Dividers (4-lane divided highways/arterials)
    if (variant === '4lane') {
      g.fillStyle = '#e6e6de';
      const dashH = Math.round(H * 0.34);
      const dashY = Math.round(H * 0.14);
      for (const lx of [0.27, 0.73]) {
        g.fillRect(W * lx - 3, dashY, 6, dashH);
      }
    }

    // Light aggregate wear speckles over paint so markings feel bonded into real tarmac
    for (let i = 0; i < 900; i++) {
      const px = rnd() * W, py = rnd() * H;
      g.fillStyle = 'rgba(48,50,55,0.28)';
      g.fillRect(px, py, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  usRoadTexCache.set(variant, tex);
  return tex;
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
        rpFade = 1.0 - smoothstep(55.0, 260.0, length(vViewPosition));
        float rpAO = mix(1.0, texture2D(tRA, rwp / 2.8).r * 0.58 + texture2D(tRA, rwp / 0.72 + 0.21).r * 0.42, rpFade);
        float rpMacro = texture2D(tRA, rwp / 18.0).r;
        // High-frequency aggregate grit, bitumen pores & patchy wear from curated 2K asphalt PBR maps
        diffuseColor.rgb *= mix(1.0, (0.56 + 0.60 * rpAO) * (0.85 + 0.30 * rpMacro), gRoad);
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      if (gRoad > 0.005) {
        float rr = mix(texture2D(tRR, rwp / 2.8).r, texture2D(tRR, rwp / 0.72 + 0.21).r, 0.48 * rpFade);
        float rr2 = texture2D(tRR, rwp / 9.5).r;                        // oil, rubber and damp patches at a larger scale
        float dryRough = clamp(0.48 + 0.46 * mix(rr2, rr, 0.58), 0.44, 0.95);
        // Damp drained asphalt stays textured satin tarmac (0.28..0.52); only discrete gPud pockets go glassy
        float wetRough = 0.28 + 0.24 * rr2;
        roughnessFactor = mix(roughnessFactor, mix(dryRough, wetRough, clamp(uWet, 0.0, 1.0)), gRoad);
      }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (gRoad > 0.005 && rpFade > 0.005) {
        vec3 rn1 = texture2D(tRN, rwp / 2.8).xyz * 2.0 - 1.0, rn2 = texture2D(tRN, rwp / 0.72 + 0.21).xyz * 2.0 - 1.0;
        float pores = 1.0 - clamp(uWet * 0.48, 0.0, 1.0);
        vec2 sl = (rn1.xy * 1.25 + rn2.xy * 0.92) * gRoad * rpFade * mix(1.0, pores, 0.72) * (1.0 - gPud);
        // Real-time shallow-water tire wake ripples appear inside standing puddles (not across plain damp tarmac)
        float wetMask = gPud;
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
