// playkit/render/unifiedPost.ts
//
// Unified Plajah WebGPU Post-Processing Stack (combining Era Clash 3D & Vesselbound):
//   Scene Pass (with minimal required MRT: normals / metalrough / velocity)
//   → Forest-Scale GTAO (aoRadius / aoScale / thickness + 4x4 noise blur)
//   → Optional SSR (Additive Screen-Space Reflections for rivers, puddles, wet stone & armor)
//   → Shadow-Map Godrays (canopy sun/moon shafts)
//   → Bloom (full UnrealBloom or lean iGPU Gaussian)
//   → Mild cool shadow lift + Level Look Contrast / Toe Curve + Vignette
//   → Optional TRAA (eliminates foliage/cable/rope shimmer) or FXAA
//   → Optional FSR1 + RCAS Upscaling (60 fps on iGPUs & mobile)
//   → Display-referred Tone Mapping (`renderOutput`) + 33^3 Filmic 3D LUT (`lut3D`)
//
// Creator-available across all 1st-party & 3rd-party Plajah games with automatic graceful
// fallback if any optional pass is unsupported on a specific GPU driver.

import * as THREE from 'three/webgpu';
import {
  colorToDirection, directionToColor, float, length, luminance, max, metalness, mix, mrt,
  normalView, output, pass, reference, renderOutput, roughness, rtt, sample, screenUV,
  smoothstep, texture3D, uniform, vec2, vec3, vec4, velocity,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

export type PlaykitLutPreset = 'elderwood-still' | 'fable-warm' | 'era-clash-cinema' | 'cyber-neon' | 'neutral';

export interface PlaykitPostLook {
  aoRadius?: number;
  aoScale?: number;
  contrast?: number;
  toe?: number;
  warm?: number;
  rays?: number;
  lutPreset?: PlaykitLutPreset;
  lutStrength?: number;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
}

export interface PlaykitPostOptions {
  /** Enable GTAO ambient occlusion (default true). */
  ao?: boolean;
  /** Enable additive Screen-Space Reflections on rivers, puddles & wet stone (default false unless high/opt-in). */
  ssr?: boolean;
  ssrScale?: number;
  /** Enable Temporal Reprojection Anti-Aliasing for crisp foliage/cables (default false unless opted in). */
  traa?: boolean;
  /** Enable lightweight FXAA edge smoothing when TRAA is off (default true on high tier). */
  fxaa?: boolean;
  /** Enable FSR1 + RCAS upscaling pass (default false unless opted in or internalScale < 1). */
  fsr1?: boolean;
  /** Internal render scale relative to drawing buffer (e.g. 0.85 with fsr1=true). */
  internalScale?: number;
  /** Bloom quality: 'full' (5-mip UnrealBloom), 'lean' (quarter-res Gaussian), or false. */
  bloom?: 'full' | 'lean' | false;
  /** Enable display-referred 3D LUT filmic color grading (default true). */
  lut?: boolean;
  lutPreset?: PlaykitLutPreset;
  lutStrength?: number;
  /** Override query-string debug flags (e.g. 'noao,norays,ssr,traa,fsr,nolut,nograde,nostylize'). */
  debugFlags?: string;
  /**
   * Optional stylize stage, run on the graded colour before vignette/AA (e.g. playkit/render/manuscriptLook:
   * ink contour, paper, erasure field). Gets the colour, the depth texture, a normal sampler (when AO or SSR
   * made one) and the scene camera; returns the new colour node.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stylize?: (ctx: { color: any; depth: any; normal: any; camera: THREE.Camera }) => any;
}

export interface PlaykitPostHandle {
  render(): void;
  setBloom(strength: number): void;
  setLut(preset: PlaykitLutPreset, strength?: number): void;
  setInternalScale(scale: number): void;
  readonly activePasses: ReadonlyArray<string>;
}

const LUT_SIZE = 33;
const lutCache = new Map<PlaykitLutPreset, THREE.Data3DTexture>();

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Generate a smooth, artifact-free 33x33x33 3D LUT texture calibrated for Plajah biomes.
 * `'elderwood-still'` matches the concept stills: lush emerald-teal shadows, luminous
 * cyan bioluminescence, warm amber lantern highlights, and clean cool-neutral stone (no orange cast).
 */
export function buildPlaykitLutData(preset: PlaykitLutPreset, size = LUT_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const inv = 1 / Math.max(1, size - 1);

  for (let bi = 0; bi < size; bi++) {
    const b0 = bi * inv;
    for (let gi = 0; gi < size; gi++) {
      const g0 = gi * inv;
      for (let ri = 0; ri < size; ri++) {
        const r0 = ri * inv;
        let r = r0, g = g0, b = b0;

        if (preset !== 'neutral') {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const shadowW = clamp01(1 - lum / 0.42);
          const midW = Math.sin(clamp01(lum) * Math.PI);
          const hiW = clamp01((lum - 0.52) / 0.48);

          if (preset === 'elderwood-still') {
            // Deep cool emerald-teal shadows + clean mossy mids + warm amber lantern highlights
            r = r * (1 - shadowW * 0.09) + hiW * 0.035;
            g = g * (1 + shadowW * 0.03 + midW * 0.035) + hiW * 0.015;
            b = b * (1 + shadowW * 0.11) - hiW * 0.018;
            // Gentle filmic S-curve without crushing deep canopy detail
            const sCurve = (x: number) => clamp01(x + 0.045 * Math.sin(Math.PI * (2 * x - 1)) * 0.5);
            r = sCurve(r); g = sCurve(g); b = sCurve(b);
          } else if (preset === 'fable-warm') {
            r = r * (1 + hiW * 0.07 + midW * 0.03) - shadowW * 0.02;
            g = g * (1 + midW * 0.04);
            b = b * (1 + shadowW * 0.08 - hiW * 0.04);
          } else if (preset === 'era-clash-cinema') {
            r = r * (1 - shadowW * 0.07 + hiW * 0.06);
            g = g * (1 + midW * 0.02);
            b = b * (1 + shadowW * 0.09 - hiW * 0.035);
          } else if (preset === 'cyber-neon') {
            r = r * (1 - shadowW * 0.05 + hiW * 0.04);
            g = g * (1 + midW * 0.05);
            b = b * (1 + shadowW * 0.14 + hiW * 0.03);
          }
        }

        const idx = ((bi * size + gi) * size + ri) * 4;
        data[idx] = Math.round(clamp01(r) * 255);
        data[idx + 1] = Math.round(clamp01(g) * 255);
        data[idx + 2] = Math.round(clamp01(b) * 255);
        data[idx + 3] = 255;
      }
    }
  }
  return data;
}

export function getPlaykitLutTexture(preset: PlaykitLutPreset): THREE.Data3DTexture {
  let tex = lutCache.get(preset);
  if (!tex) {
    const data = buildPlaykitLutData(preset, LUT_SIZE);
    tex = new THREE.Data3DTexture(data, LUT_SIZE, LUT_SIZE, LUT_SIZE);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    lutCache.set(preset, tex);
  }
  return tex;
}

/**
 * Create the unified Plajah WebGPU RenderPipeline for any live game scene.
 * Preserves `scene.userData.look` (forest-scale GTAO radius/scale & contrast/toe)
 * and `scene.userData.godrays`, while adding blurred GTAO, additive SSR, TRAA/FXAA,
 * FSR1 + RCAS, and display-referred 3D LUT grading!
 */
export function createPlaykitPostPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: PlaykitPostOptions = {},
): PlaykitPostHandle | null {
  try {
    const dbg = opts.debugFlags
      ?? (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('post') ?? '' : '');

    const look = (scene.userData.look ?? {}) as PlaykitPostLook;
    const useAo = (opts.ao ?? true) && !dbg.includes('noao');
    const useSsr = (opts.ssr || dbg.includes('ssr')) && !dbg.includes('nossr');
    const useTraa = (opts.traa || dbg.includes('traa')) && !dbg.includes('notraa');
    const useFxaa = !useTraa && (opts.fxaa ?? true) && !dbg.includes('nofxaa');
    const useFsr = (opts.fsr1 || dbg.includes('fsr') || (opts.internalScale != null && opts.internalScale < 0.99)) && !dbg.includes('nofsr');
    const useLut = (opts.lut ?? true) && !dbg.includes('nolut') && !dbg.includes('nograde');
    const bloomMode = dbg.includes('nobloom') ? false : (opts.bloom ?? 'full');

    const activePasses: string[] = ['scene'];
    const pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    if (opts.internalScale != null && opts.internalScale > 0.3 && opts.internalScale <= 1) {
      scenePass.setResolutionScale(opts.internalScale);
    }

    // Build MRT targets strictly for enabled passes to keep GPU bandwidth lean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mrtSpec: Record<string, any> = { output };
    if (useAo || useSsr) mrtSpec.normal = directionToColor(normalView);
    if (useSsr) mrtSpec.metalrough = vec2(metalness, roughness);
    if (useTraa) mrtSpec.velocity = velocity;
    if (Object.keys(mrtSpec).length > 1) {
      scenePass.setMRT(mrt(mrtSpec));
    }

    // Sprites (snow, embers, fireflies, dust) have no geometric normal: give them a flat MRT output
    if (Object.keys(mrtSpec).length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flatSpec: Record<string, any> = { output };
      if (useAo || useSsr) flatSpec.normal = vec4(0.5, 0.5, 1.0, 1.0);
      if (useSsr) flatSpec.metalrough = vec2(0.0, 1.0);
      if (useTraa) flatSpec.velocity = vec2(0.0, 0.0);
      const flat = mrt(flatSpec);
      scene.traverse((o) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = (o as THREE.Points).material as any;
        if ((o as THREE.Points).isPoints && m?.isNodeMaterial) m.mrtNode = flat;
      });
    }

    const colorTex = scenePass.getTextureNode('output');
    const depthTex = scenePass.getTextureNode('depth');
    const normalTex = (useAo || useSsr) ? scenePass.getTextureNode('normal') : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sceneNormal = normalTex ? sample((u: any) => colorToDirection(normalTex.sample(u))) : null;

    // Helper: bake non-texture intermediate nodes into an internal-res RTT (required by FXAA/TRAA/FSR1)
    const sceneRT = scenePass.renderTarget;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toInternalRtt = (node: any, scale = 1) => {
      const t = rtt(node as never);
      const origUpdate = t.updateBefore.bind(t);
      t.updateBefore = (frame) => {
        const w = Math.max(1, Math.round(sceneRT.width * scale));
        const h = Math.max(1, Math.round(sceneRT.height * scale));
        if (t.width !== w || t.height !== h) t.setSize(w, h);
        return origUpdate(frame);
      };
      return t;
    };

    // 1. Forest-Scale GTAO + soft denoise blur (resolves 4x4 Bayer noise grid on stone & distant hills)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lit: any = colorTex.rgb;
    if (useAo && sceneNormal) {
      const aoPass = ao(depthTex, sceneNormal, camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = look.aoRadius ?? 1.25;
      aoPass.thickness.value = Math.max(1, (look.aoRadius ?? 1.25) * 2);
      aoPass.scale.value = look.aoScale ?? 1.2;
      aoPass.distanceFallOff.value = 0.6;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const occl = (gaussianBlur((aoPass as any).getTextureNode(), float(1) as never, 2) as any).r;
      lit = colorTex.rgb.mul(mix(float(1), occl, 0.85));
      activePasses.push('gtao');
    }

    // 2. Optional Additive Screen-Space Reflections (era-clash-3d rule: additive so reflections never punch dark blobs!)
    if (useSsr && sceneNormal) {
      try {
        const mrTex = scenePass.getTextureNode('metalrough');
        const ssrPass = ssr(colorTex, depthTex, sceneNormal, mrTex.r, mrTex.g, camera);
        ssrPass.resolutionScale = opts.ssrScale ?? 0.5;
        ssrPass.maxDistance.value = 96;
        ssrPass.thickness.value = 0.25;
        ssrPass.opacity.value = 0.65;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sr = ssrPass as any;
        lit = lit.add(sr.rgb.mul(sr.a).mul(0.68));
        activePasses.push('ssr');
      } catch (err) {
        console.warn('[playkit-post] SSR skipped:', err);
      }
    }

    // 3. Shadow-Map Canopy Godrays (honoring Claude's tuned density/cap, look.rays, and night godraysGain fade)
    const sun = scene.userData.godrays as THREE.DirectionalLight | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rays: any = null;
    if (sun && sun.castShadow && !dbg.includes('norays')) {
      const g = godrays(depthTex, camera, sun);
      g.resolutionScale = 0.5;
      g.density.value = 0.4;
      g.maxDensity.value = 0.45;
      g.distanceAttenuation.value = 2.0;
      const k = reference('intensity', 'float', sun);
      rays = g.getTextureNode().r.mul(uniform(sun.color)).mul(k.mul(1.2 / 5.2).min(1.0)).mul(look.rays ?? 1);
      const gain = scene.userData.godraysGain as { value: number } | undefined;
      if (gain) rays = rays.mul(reference('value', 'float', gain));
      activePasses.push('godrays');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let c: any = rays ? lit.add(rays) : lit;

    // 4. Bloom (Full 5-mip UnrealBloom or Lean quarter-res iGPU Gaussian)
    let bloomStrengthControl: { value: number } | null = null;
    if (bloomMode === 'full') {
      const glow = bloom(c, look.bloomStrength ?? 0.45, look.bloomRadius ?? 0.5, look.bloomThreshold ?? 0.82);
      bloomStrengthControl = glow.strength;
      c = c.add(glow);
      activePasses.push('bloom:full');
    } else if (bloomMode === 'lean') {
      const uLean = uniform(look.bloomStrength ?? 0.36);
      bloomStrengthControl = uLean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bright = vec4((max as any)(c.sub(float(look.bloomThreshold ?? 0.9)), float(0)), 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blurred = gaussianBlur(toInternalRtt(bright, 0.25) as never, float(2.0) as never, 4) as any;
      c = c.add(blurred.rgb.mul(uLean));
      activePasses.push('bloom:lean');
    }

    // 5. Mild cool shadow lift + level contrast/toe/warm curve (exact parity with Vesselbound Wilds light pass 1)
    const l = luminance(c);
    if (!dbg.includes('nograde')) {
      c = mix(c.mul(vec3(0.94, 0.98, 1.05)), c, smoothstep(float(0.05), float(0.5), l));
      if (look.contrast || look.toe || look.warm) {
        const k = float(look.contrast ?? 1), mid = float(0.18);
        c = c.max(1e-4).div(mid).pow(k).mul(mid);
        if (look.toe) c = c.mul(smoothstep(float(0), float(look.toe), luminance(c)).mul(0.35).add(0.65));
        if (look.warm) c = mix(c, c.mul(vec3(1.07, 1.0, 0.84)), smoothstep(float(0.08), float(0.6), luminance(c)).mul(look.warm));
      }
      activePasses.push('grade');
    }

    // 5b. Optional stylize stage (drawn looks: ink, paper, erasure fields)
    if (opts.stylize && !dbg.includes('nostylize')) {
      try {
        c = opts.stylize({ color: c, depth: depthTex, normal: sceneNormal, camera }).rgb;
        activePasses.push('stylize');
      } catch (err) {
        console.warn('[playkit-post] stylize skipped:', err);
      }
    }

    // 6. Gentle optical vignette
    const vig = smoothstep(float(0.95), float(0.35), length(screenUV.sub(vec2(0.5, 0.5))).mul(1.25)).mul(0.35).add(0.65);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let composed: any = vec4(c.mul(vig), float(1.0));

    // 7. Optional TRAA (shimmer-free foliage/cables) or FXAA + Optional FSR1/RCAS upscale
    if (useTraa) {
      try {
        const t = traa(toInternalRtt(composed) as never, depthTex, scenePass.getTextureNode('velocity'), camera);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        composed = (t as any).getTextureNode();
        activePasses.push('traa');
      } catch (err) {
        console.warn('[playkit-post] TRAA skipped:', err);
      }
    } else if (useFxaa) {
      try {
        composed = toInternalRtt(fxaa(toInternalRtt(composed) as never));
        activePasses.push('fxaa');
      } catch (err) {
        console.warn('[playkit-post] FXAA skipped:', err);
      }
    }

    if (useFsr) {
      try {
        composed = fsr1(toInternalRtt(composed) as never, 0.35, true);
        activePasses.push('fsr1');
      } catch (err) {
        console.warn('[playkit-post] FSR1 skipped:', err);
      }
    }

    // 8. Display-referred Tone Mapping + 33^3 Filmic 3D LUT (exact Era Clash order so HDR never clips in LUT!)
    const initialPreset = look.lutPreset ?? opts.lutPreset ?? 'elderwood-still';
    const lutTexNode = texture3D(getPlaykitLutTexture(initialPreset));
    const lutAmount = uniform(useLut ? (look.lutStrength ?? opts.lutStrength ?? 0.52) : 0);
    if (useLut) {
      pipeline.outputColorTransform = false;
      composed = renderOutput(composed);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      composed = lut3D(composed as any, lutTexNode as any, LUT_SIZE, lutAmount as any);
      activePasses.push(`lut:${initialPreset}`);
    }

    pipeline.outputNode = composed;
    return {
      render: () => pipeline.render(),
      setBloom: (s: number) => {
        if (bloomStrengthControl) bloomStrengthControl.value = s;
      },
      setLut: (preset: PlaykitLutPreset, strength = 0.52) => {
        lutTexNode.value = getPlaykitLutTexture(preset);
        lutAmount.value = preset === 'neutral' ? 0 : strength;
      },
      setInternalScale: (scale: number) => {
        scenePass.setResolutionScale(Math.max(0.4, Math.min(1, scale)));
      },
      activePasses,
    };
  } catch (err) {
    console.warn('[playkit-post] pipeline unavailable, rendering direct:', err);
    return null;
  }
}
