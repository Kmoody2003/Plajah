// games/apex/src/tsl/apexPostTsl.ts
//
// Preserves ALL of Plajah Motorsport: Apex's signature cinematic post-processing craft on top of
// the unified Playkit WebGPU post stack (`playkit/render/unifiedPost.ts`), so zero Apex features
// are lost during migration:
//   1. `createApexPostStage`: Pluggable `stylize` stage for `createPlaykitPostPipeline`:
//      - Vanishing-point radial speed blur + high-speed peripheral chromatic aberration
//      - `LensRain` spherical refractive water droplets on the camera lens (`lensRain.ts`)
//        with Snell refraction (IOR 1.333), droplet edge shading, and specular sparkle
//      - Photographic clarity micro-vibrance + fine dynamic film grain
//      - TSL film/tape lens modes (`silent`, `grindhouse`, `vhs`, `found`, `night`)
//   2. `getApexCinematicLutTexture`: Converts any LUT from Plajah's `CINEMATIC_LUTS`
//      (`services/color/cinematicLutLibrary.ts`) into a 17^3 `THREE.Data3DTexture` for WebGPU `lut3D`.

import * as THREE from 'three/webgpu';
import {
  abs, clamp, dot, exp, float, fract, length, luminance, max, min, mix, normalize,
  perspectiveDepthToViewZ, pow, refract, rtt, sin, smoothstep, sqrt, step, uniform,
  uniformArray, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { CINEMATIC_LUTS, type CinematicLut } from '../../../../services/color/cinematicLutLibrary';
import type { GameLens } from '../grade';
import type { LensRain } from '../lensRain';
import type { PlaykitStylizeContext } from '../../../../playkit/render/manuscriptLook';

const MAX_DROPS = 2;
const LENS_MODE_INDEX: Record<GameLens, number> = {
  none: 0,
  silent: 1,
  grindhouse: 2,
  vhs: 3,
  found: 4,
  night: 5,
};

const apexLutCache = new Map<string, THREE.Data3DTexture>();

/** Convert a Plajah platform `CinematicLut` (`services/color/cinematicLutLibrary.ts`) into a 17^3 Data3DTexture for WebGPU `lut3D`. */
export function getApexCinematicLutTexture(id: string): THREE.Data3DTexture | null {
  const cached = apexLutCache.get(id);
  if (cached) return cached;
  const spec: CinematicLut | undefined = CINEMATIC_LUTS.find((l) => l.id === id);
  if (!spec) return null;
  const S = 17;
  const data = new Uint8Array(S * S * S * 4);
  let i = 0;
  for (let b = 0; b < S; b++) {
    for (let g = 0; g < S; g++) {
      for (let r = 0; r < S; r++) {
        const [R, G, B] = spec.rgbTransfer(r / (S - 1), g / (S - 1), b / (S - 1));
        data[i++] = Math.round(Math.min(1, Math.max(0, R)) * 255);
        data[i++] = Math.round(Math.min(1, Math.max(0, G)) * 255);
        data[i++] = Math.round(Math.min(1, Math.max(0, B)) * 255);
        data[i++] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, S, S, S);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  apexLutCache.set(id, tex);
  return tex;
}

export interface ApexPostStageHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stylize(ctx: PlaykitStylizeContext): any;
  update(opts: {
    dt: number;
    speed01: number;
    aspect: number;
    lens?: GameLens;
    lensRain?: LensRain | null;
    vibrance?: number;
    grain?: number;
    hazeOn?: boolean;
    hazeDensity?: number;
    mistBoost?: number;
    fogColor?: THREE.Color;
    sunColor?: THREE.Color;
    sunDir?: THREE.Vector3;
    dofStrength?: number;
    dofFocus?: number;
    dofFarStart?: number;
    camNear?: number;
    camFar?: number;
    invWidth?: number;
    invHeight?: number;
    sharpness?: number;
  }): void;
}

/**
 * Create the composable Apex cinematic post-processing stage for `playkit/render/unifiedPost.ts`.
 * Plug into `createPlaykitPostPipeline(renderer, scene, camera, { stylize: apexPost.stylize })`.
 */
export function createApexPostStage(): ApexPostStageHandle {
  const uSpeed = uniform(0);
  const uTime = uniform(0);
  const uAspect = uniform(16 / 9);
  const uVibrance = uniform(0.12);
  const uGrain = uniform(0.006);
  const uLensMode = uniform(0);
  const uInvRes = uniform(new THREE.Vector2(1 / 1280, 1 / 720));
  const uSharpness = uniform(0.42);

  // Depth-based Rayleigh/Mie Aerial Haze + Valley Mist + Optical Depth of Field
  const uHazeOn = uniform(1);
  const uHazeDensity = uniform(0.00018);
  const uMistBoost = uniform(0.28);
  const uFogCol = uniform(new THREE.Color(0xbcd0e2));
  const uSunCol = uniform(new THREE.Color(1.0, 0.92, 0.78));
  const uDofStrength = uniform(0.14);
  const uDofFarStart = uniform(240);
  const uCamNear = uniform(0.5);
  const uCamFar = uniform(24000);

  const dropVecs = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4(0, 0, 0, 0));
  const uLensDrops = uniformArray(dropVecs, 'vec4');
  const uLensCount = uniform(0);

  let elapsed = 0;

  return {
    stylize(ctx: PlaykitStylizeContext) {
      // Zero-RTT fast path: when AO/SSR/bloom are off (iGPU 2-pass HD mode), sample scenePass `ctx.sourceTex`
      // directly with ZERO full-res intermediate RTT copy pass! Falls back to rtt() when upstream MRT/bloom exists.
      const isDirect = Boolean(ctx.sourceTex);
      const srcTex = ctx.sourceTex ?? rtt(vec4(ctx.color, float(1.0)) as never);
      // Use uv() (matching Three.js GTAONode/SSRNode/FXAANode) so srcTex and ctx.depth align 1:1 on WebGPU!
      const uv0 = uv();
      const center = vec2(0.5, 0.56);
      const delta = uv0.sub(center);
      const rd = length(vec2(delta.x.mul(uAspect), delta.y));

      // Linear view depth using Three's native perspectiveDepthToViewZ (handles WebGPU [0..1] & reversed-Z cleanly)
      const rawZ = ctx.depth ? ctx.depth.sample(uv0).r : float(1.0);
      const linDist = max(float(0.0), perspectiveDepthToViewZ(rawZ, uCamNear, uCamFar).negate());
      const isSky = step(float(0.99992), rawZ);

      // 0. 5-Tap AMD CAS (Contrast-Adaptive Sharpening, luma-weighted to prevent chroma ringing)
      const s0 = srcTex.sample(uv0).rgb;
      const cN = srcTex.sample(clamp(uv0.add(vec2(float(0.0), uInvRes.y)), 0.001, 0.999)).rgb;
      const cS = srcTex.sample(clamp(uv0.sub(vec2(float(0.0), uInvRes.y)), 0.001, 0.999)).rgb;
      const cE = srcTex.sample(clamp(uv0.add(vec2(uInvRes.x, float(0.0))), 0.001, 0.999)).rgb;
      const cW = srcTex.sample(clamp(uv0.sub(vec2(uInvRes.x, float(0.0))), 0.001, 0.999)).rgb;
      const mnL = min(s0.g, min(min(cN.g, cS.g), min(cE.g, cW.g)));
      const mxL = max(s0.g, max(max(cN.g, cS.g), max(cE.g, cW.g)));
      const casAmp = sqrt(clamp(min(mnL, float(2.0).sub(mxL)).div(max(mxL, float(1e-4))), 0.0, 1.0));
      const casW = casAmp.mul(uSharpness).mul(-0.20);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let sharp0: any = clamp(
        s0.add(cN.add(cS).add(cE).add(cW).mul(casW)).div(max(float(1.0).add(casW.mul(4.0)), float(0.25))),
        vec3(0.0, 0.0, 0.0),
        vec3(4.0, 4.0, 4.0),
      );
      if (isDirect) {
        // Apply Playkit's cool shadow lift + warm highlight filmic grade inline (zero extra RTT pass!)
        const sl = luminance(sharp0);
        sharp0 = mix(sharp0.mul(vec3(0.94, 0.98, 1.05)), sharp0, smoothstep(float(0.05), float(0.5), sl));
        sharp0 = mix(sharp0, sharp0.mul(vec3(1.05, 1.0, 0.88)), smoothstep(float(0.10), float(0.65), sl).mul(0.04));
      }

      // 1. Ultra-lean 1-tap radial speed blur + zero-extra-tap high-speed peripheral chromatic aberration (reuses CAS cE/cW!)
      const amt = uSpeed.mul(0.040).mul(smoothstep(float(0.16), float(0.78), rd));
      const ca = uSpeed.mul(0.0012).mul(rd);
      const s1 = srcTex.sample(clamp(uv0.sub(delta.mul(amt)), 0.001, 0.999)).rgb;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blurRgb: any = mix(sharp0, s0.mul(0.55).add(s1.mul(0.45)), smoothstep(float(0.0008), float(0.007), amt));

      const caMix = smoothstep(float(0.0004), float(0.002), ca).mul(0.28);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let col: any = vec3(mix(blurRgb.r, cE.r, caMix), blurRgb.g, mix(blurRgb.b, cW.b, caMix));

      // 1b. Zero-extra-tap Far-Horizon Optical Softening (0..240 m stays 100% CAS tack-sharp; reuses 5-tap cross beyond 240 m!)
      const farCoc = smoothstep(uDofFarStart, uDofFarStart.mul(4.0), linDist).mul(uDofStrength).mul(float(1.0).sub(isSky));
      const dofAvg = col.mul(0.36).add(cN.add(cS).add(cE).add(cW).mul(0.16));
      col = mix(col, dofAvg, clamp(farCoc.mul(0.85), 0.0, 0.42));

      // 1c. Subtle Far-Horizon Rayleigh Aerial Perspective (starts beyond 240 m so 0..240 m stays rich & contrasty, never double-fogging scene.fog!)
      const distEff = max(float(0.0), linDist.sub(240.0));
      const hazeOpt = float(1.0).sub(exp(distEff.negate().mul(uHazeDensity).mul(float(0.45).add(uMistBoost.mul(0.25)))));
      const horizonBand = float(1.0).sub(smoothstep(float(0.20), float(0.88), uv0.y));
      const mistCol = mix(uFogCol, uSunCol.mul(0.92), clamp(uMistBoost.mul(0.24).mul(horizonBand), 0.0, 0.34));
      const hazeAmt = clamp(hazeOpt.mul(0.42), 0.0, 0.44).mul(float(1.0).sub(isSky)).mul(uHazeOn);
      col = mix(col, mistCol, hazeAmt);

      // 2. LensRain: 6 unrolled spherical refractive water droplets (IOR 1.333) with rim shade & sparkle
      const lightDir = normalize(vec3(-0.45, 0.65, 1.0));
      for (let i = 0; i < MAX_DROPS; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const drop: any = uLensDrops.element(i);
        const active = uLensCount.greaterThan(i).and(drop.z.greaterThan(0.0001)).and(drop.w.greaterThan(0.001));
        const dRaw = uv0.sub(drop.xy);
        const dAsp = vec2(dRaw.x.mul(uAspect), dRaw.y);
        const p = dAsp.div(max(drop.z, float(0.0001)));
        const rr = dot(p, p);
        const inside = active.and(rr.lessThan(1.0));
        const n = normalize(vec3(p.mul(0.82), sqrt(max(float(0.001), float(1.0).sub(rr)))));
        const ray = refract(vec3(0.0, 0.0, -1.0), n, float(1.0 / 1.333));
        const refUv = clamp(uv0.add(vec2(ray.x.div(uAspect), ray.y).mul(drop.z).mul(1.45)), 0.002, 0.998);
        const dropMask = float(1.0).sub(smoothstep(float(0.86), float(1.0), rr)).mul(drop.w);
        const dropShade = float(1.0).sub(smoothstep(float(0.52), float(0.99), rr).mul(0.24));
        const sparkle = pow(max(float(0.0), dot(n, lightDir)), float(64.0)).mul(0.30);
        const refCol = srcTex.sample(refUv).rgb.mul(dropShade).add(vec3(sparkle, sparkle, sparkle));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blendDrop: any = inside.select(clamp(dropMask, 0.0, 1.0), float(0.0));
        col = mix(col, refCol, blendDrop);
      }

      // 3. Photographic clarity micro-vibrance + fine dynamic film grain
      const luma = luminance(col);
      const sat = max(col.r, max(col.g, col.b)).sub(min(col.r, min(col.g, col.b)));
      col = mix(vec3(luma, luma, luma), col, float(1.0).add(uVibrance.mul(float(1.0).sub(clamp(sat.mul(1.4), 0.0, 1.0)))));
      const grain = fract(sin(dot(uv0.mul(1000.0).add(uTime), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5);
      col = col.add(grain.mul(uGrain));

      // 4. Optional Plajah film/tape lens looks (1=silent, 2=grindhouse, 3=vhs, 4=found, 5=night vision)
      const gL = luminance(col);
      // Silent film: warm sepia monochrome + flicker + fine scratches
      const flicker = float(0.92).add(sin(uTime.mul(27.0)).mul(0.08));
      const scratch = smoothstep(float(0.996), float(1.0), fract(sin(uv0.x.mul(173.0).add(uTime.mul(13.0))).mul(43758.5)));
      const silentCol = vec3(1.12, 0.96, 0.74).mul(pow(max(gL, float(1e-4)), float(1.12))).mul(flicker).add(scratch.mul(0.18));

      // Grindhouse: warm pushed midtones, crushed teal blacks, dirty grain
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr: any = max(col.r, float(1e-4));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cg: any = max(col.g, float(1e-4));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cb: any = max(col.b, float(1e-4));
      const grindCol = vec3(
        pow(cr, float(0.92)).mul(1.10),
        pow(cg, float(1.06)).mul(0.96),
        pow(cb, float(1.18)).mul(0.84),
      ).add(grain.mul(0.045));

      // VHS camcorder: scanlines + horizontal chroma bleed + tape noise (reuses CAS neighbors -> zero extra fetches!)
      const scan = float(0.90).add(sin(uv0.y.mul(720.0)).mul(0.10));
      const vhsCol = vec3(cE.r, col.g, cW.b).mul(scan).add(grain.mul(0.03));

      // Found footage: slight handheld edge exposure + cool camcorder cast + sharp grain
      const foundCol = col.mul(vec3(0.94, 1.0, 1.04)).add(grain.mul(0.025));

      // Night vision: phosphor green luminance amplification + scanline reticle glow
      const nvAmp = clamp(pow(max(gL.mul(2.4), float(1e-4)), float(0.75)), 0.0, 1.6);
      const nvCol = vec3(0.16, 1.05, 0.30).mul(nvAmp).mul(scan).add(grain.mul(0.06));

      col = abs(uLensMode.sub(1.0)).lessThan(0.25).select(silentCol, col);
      col = abs(uLensMode.sub(2.0)).lessThan(0.25).select(grindCol, col);
      col = abs(uLensMode.sub(3.0)).lessThan(0.25).select(vhsCol, col);
      col = abs(uLensMode.sub(4.0)).lessThan(0.25).select(foundCol, col);
      col = abs(uLensMode.sub(5.0)).lessThan(0.25).select(nvCol, col);

      return vec4(col, float(1.0));
    },

    update(opts) {
      elapsed += opts.dt;
      uTime.value = elapsed;
      uSpeed.value = Math.max(0, Math.min(1, opts.speed01));
      uAspect.value = Math.max(0.3, opts.aspect);
      if (opts.vibrance !== undefined) uVibrance.value = opts.vibrance;
      if (opts.grain !== undefined) uGrain.value = opts.grain;
      if (opts.lens !== undefined) uLensMode.value = LENS_MODE_INDEX[opts.lens] ?? 0;
      if (opts.hazeOn !== undefined) uHazeOn.value = opts.hazeOn ? 1 : 0;
      if (opts.hazeDensity !== undefined) uHazeDensity.value = opts.hazeDensity;
      if (opts.mistBoost !== undefined) uMistBoost.value = opts.mistBoost;
      if (opts.fogColor) uFogCol.value.copy(opts.fogColor);
      if (opts.sunColor) uSunCol.value.copy(opts.sunColor);
      if (opts.dofStrength !== undefined) uDofStrength.value = opts.dofStrength;
      if (opts.dofFarStart !== undefined) uDofFarStart.value = opts.dofFarStart;
      if (opts.camNear !== undefined) uCamNear.value = Math.max(0.05, opts.camNear);
      if (opts.camFar !== undefined) uCamFar.value = Math.max(100, opts.camFar);
      if (opts.invWidth !== undefined && opts.invHeight !== undefined) {
        uInvRes.value.set(opts.invWidth, opts.invHeight);
      }
      if (opts.sharpness !== undefined) uSharpness.value = opts.sharpness;

      if (opts.lensRain) {
        uLensCount.value = opts.lensRain.uniforms.uLensCount.value;
        const srcDrops = opts.lensRain.uniforms.uLensDrops.value;
        for (let i = 0; i < MAX_DROPS; i++) {
          if (srcDrops[i]) dropVecs[i].copy(srcDrops[i]);
          else dropVecs[i].set(0, 0, 0, 0);
        }
      } else {
        uLensCount.value = 0;
      }
    },
  };
}
