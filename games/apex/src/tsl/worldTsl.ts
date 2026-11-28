// games/apex/src/tsl/worldTsl.ts
//
// Unified WebGPU / TSL ports of Apex's world environment custom shaders:
//   1. `createApexSkyTslMaterial` + `createApexCirrusTslMaterial` (`sky.ts`):
//      Equirectangular base/overcast/storm sky panoramas + animated sunlit silver-lining clouds +
//      sun disc & corona + night stars & moon + lightning flash + Rayleigh/Mie horizon haze.
//   2. `createApexWaterTslMaterial` (`water.ts`):
//      Flow-map advected dual-phase ripples + rotated open-lake swells + rain rings + Fresnel sky
//      reflection + sun glints & glitter + shoreline/rapids/whitecap foam + soft bank feathering.
//   3. `createApexTreeTslMaterial` + `createApexTreeCardLodTslMaterial` (`trees.ts`):
//      Instanced wind sway + hashed grazing leaf breakup + smooth near-radius card cross-fade.
//   4. `createApexGrassStrandTslMaterial` (`vegetation.ts` + `strandFurEngine.ts`):
//      Curved 3D multi-blade strand wind gust waves + 4-point car-wake/tire trample + chlorophyll
//      gradient + wet sheen + warm backlit SSS + Kajiya-Kay anisotropic blade highlight + Playkit SH9 GI.
//   5. `createApexIronportTerrainTslMaterial` (`region.ts` `applyTerrainDetail`):
//      Satellite albedo + `city_mask.png` asphalt/sidewalk/curb/trench-cutout + `landclass.png` +
//      Wine Country tulip rows + dark Lake Superior basalt cliffs & alpine snow + wet puddles (SSR-ready)
//      + Playkit SH9 GI bounce.

import * as THREE from 'three/webgpu';
import {
  abs, asin, atan, attribute, cameraPosition, clamp, color as tslColor, cos, dot, exp, float, floor, fract,
  instanceIndex, length, luminance, max, min, mix, modelWorldMatrix, mx_fractal_noise_float,
  normalLocal, normalView, normalWorld, normalize, positionLocal, positionView,
  positionViewDirection, positionWorld, pow, reflect, screenCoordinate, sin, smoothstep, sqrt, step,
  texture as tslTexture, uniform, uniformArray, uv, vec2, vec3, vec4, vertexColor,
} from 'three/tsl';
import {
  enhanceMaterialWithPlaykitGi,
  type PlaykitGiUniforms,
} from '../../../../playkit/render/liveLighting';
import {
  apexHeadlightSpotTsl,
  type ApexTslSharedUniforms,
} from './apexMaterialsTsl';
import type { SkyState } from '../sky';
import type { WaterState } from '../water';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tslHash21(p: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = fract(p.mul(vec2(123.34, 456.21)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = q.add(dot(q, q.add(45.32)));
  return fract(r.x.mul(r.y));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tslHash31(p: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = fract(p.mul(0.3183099).add(0.1)).mul(17.0);
  return fract(q.x.mul(q.y).mul(q.z).mul(q.x.add(q.y).add(q.z)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tslNoise2(p: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i: any = floor(p);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any = fract(p);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u: any = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const a = tslHash21(i);
  const b = tslHash21(i.add(vec2(1.0, 0.0)));
  const c = tslHash21(i.add(vec2(0.0, 1.0)));
  const d = tslHash21(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// =============================================================================
// 1. SKY DOME + CIRRUS (TSL port of `sky.ts`)
// =============================================================================

export interface ApexSkyTslHandle {
  material: THREE.MeshBasicNodeMaterial;
  setBaseTexture(t: THREE.Texture): void;
  setNextTexture(t: THREE.Texture): void;
  setBaseBlend(blend: number): void;
  setOvercastTexture(t: THREE.Texture): void;
  setStormTexture(t: THREE.Texture): void;
  setNightOvercastTexture(t: THREE.Texture): void;
  setNightStormTexture(t: THREE.Texture): void;
  setMoonDir(v: THREE.Vector3): void;
  update(dt: number, st: SkyState): void;
}

export function createApexSkyTslMaterial(placeholder?: THREE.Texture): ApexSkyTslHandle {
  const blank = placeholder ?? (() => {
    const d = new THREE.DataTexture(new Uint8Array([120, 160, 220, 255]), 1, 1);
    d.needsUpdate = true;
    return d;
  })();

  const baseTexNode = tslTexture(blank);
  const nextTexNode = tslTexture(blank);
  const overTexNode = tslTexture(blank);
  const stormTexNode = tslTexture(blank);
  const nightOverTexNode = tslTexture(blank);
  const nightStormTexNode = tslTexture(blank);

  const uBaseBlend = uniform(0);
  const uMixOver = uniform(0);
  const uMixStorm = uniform(0);
  const uSunAmt = uniform(1);
  const uNight = uniform(0);
  const uTime = uniform(0);
  const uFogAmt = uniform(0);
  const uDark = uniform(0);
  const uFlash = uniform(0);
  const uDetail = uniform(0.9);
  const uSunDir = uniform(new THREE.Vector3(0, 1, 0));
  const uSunCol = uniform(new THREE.Color(1, 0.9, 0.7));
  const uFog = uniform(new THREE.Color(0.7, 0.8, 0.9));
  const uMoonDir = uniform(new THREE.Vector3(0.45, 0.62, -0.64).normalize());

  const dir = normalize(positionLocal);
  const eqU = atan(dir.z, dir.x).mul(0.15915494).add(0.5);
  const eqV = asin(clamp(dir.y, -1.0, 1.0)).mul(0.31830989).add(0.5);
  const eqUv = vec2(eqU, eqV);

  const nightWeatherK = smoothstep(float(0.32), float(0.82), uNight);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let col: any = baseTexNode.sample(eqUv).rgb;
  col = mix(col, nextTexNode.sample(eqUv).rgb, uBaseBlend);
  const overSample = mix(overTexNode.sample(eqUv).rgb, nightOverTexNode.sample(eqUv).rgb, nightWeatherK);
  const stormSample = mix(stormTexNode.sample(eqUv).rgb, nightStormTexNode.sample(eqUv).rgb, nightWeatherK);
  col = mix(col, overSample, uMixOver);
  col = mix(col, stormSample, uMixStorm);

  // Physical Rayleigh-Mie solar sky grounding matching true sun elevation, color temperature & exposure.
  // Preserve 88% of user's real photographic night panoramas (Milky Way, Moonlit Clouds, Aurora, Urban Night Clouds & Night Lightning)!
  const up = max(dir.y, float(0.0));
  const sunEl = clamp(uSunDir.y, -0.35, 1.0);
  const notNight = float(1.0).sub(nightWeatherK);
  const dayFactor = smoothstep(float(-0.08), float(0.24), sunEl).mul(notNight);
  const goldenFactor = smoothstep(float(-0.06), float(0.06), sunEl).mul(float(1.0).sub(smoothstep(float(0.14), float(0.42), sunEl))).mul(notNight);
  const twilightFactor = smoothstep(float(-0.22), float(-0.02), sunEl).mul(float(1.0).sub(smoothstep(float(0.02), float(0.16), sunEl))).mul(notNight);
  const sd = max(dot(dir, uSunDir), float(1e-4));

  const zenithDay = mix(vec3(0.15, 0.34, 0.68), vec3(0.10, 0.26, 0.64), smoothstep(float(0.15), float(0.7), sunEl));
  const zenithGold = vec3(0.14, 0.25, 0.52);
  const zenithNight = vec3(0.006, 0.012, 0.032);
  const physZenith = mix(mix(zenithNight, mix(zenithDay, zenithGold, goldenFactor.mul(0.65)), dayFactor), vec3(0.05, 0.09, 0.22), twilightFactor.mul(0.65));

  const horizDay = mix(vec3(0.68, 0.80, 0.94), vec3(0.58, 0.74, 0.92), smoothstep(float(0.2), float(0.7), sunEl));
  const horizGold = vec3(0.98, 0.56, 0.28);
  const horizTwil = vec3(0.42, 0.28, 0.44);
  const horizNight = vec3(0.020, 0.032, 0.064);
  const physHoriz = mix(mix(horizNight, mix(horizDay, horizGold, goldenFactor.mul(0.85)), dayFactor), horizTwil, twilightFactor.mul(0.75));
  const physSkyBase = mix(physHoriz, physZenith, pow(max(up, float(1e-4)), float(0.48)));
  const physSky = physSkyBase.add(
    uSunCol.mul(pow(sd, float(5.0))).mul(float(1.0).sub(smoothstep(float(0.0), float(0.42), up)))
      .mul(float(0.28).add(goldenFactor.mul(0.55))).mul(dayFactor).mul(float(1.0).sub(uMixOver.mul(0.82))),
  );
  const physMix = mix(float(0.30).add(goldenFactor.mul(0.16)), float(0.10), nightWeatherK).mul(float(1.0).sub(uMixOver.mul(0.65)));
  col = mix(col, physSky, physMix);
  col = col.mul(mix(float(1.0), float(1.18), dayFactor.mul(float(1.0).sub(uMixOver.mul(0.75))).mul(float(1.0).sub(uNight))));
  // Keep night sky panorama crisp & luminous (Milky Way, Aurora, Moonlit clouds & lightning)
  col = col.mul(mix(float(1.0), float(1.15), nightWeatherK));

  const lum = luminance(col);
  const cloudy = smoothstep(float(0.26), float(0.76), lum.add(float(1.0).sub(uSunAmt).mul(0.14)));

  // Daytime cloud projection micro-structure (disabled at night so photographic Milky Way / Aurora / Night clouds never get muddied!)
  const cp2 = dir.xz.div(up.add(0.18)).mul(1.7).add(vec2(uTime.mul(0.012), uTime.mul(0.006)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n1: any = tslNoise2(cp2).mul(0.65).add(tslNoise2(cp2.mul(2.4).add(3.7)).mul(0.35));
  const detailMask = smoothstep(float(-0.02), float(0.16), dir.y).mul(uDetail).mul(notNight);
  col = col.mul(float(1.0).add(detailMask.mul(n1.sub(0.5).mul(0.88)).mul(cloudy.add(0.22))));
  col = mix(col, col.mul(float(0.86).add(smoothstep(float(0.34), float(0.66), n1).mul(0.44))), detailMask.mul(0.45).mul(cloudy));

  const silver = pow(sd, float(6.0)).mul(float(0.35).add(smoothstep(float(0.38), float(0.78), n1).mul(0.65))).mul(cloudy).mul(detailMask);
  const alpenglow = goldenFactor.mul(smoothstep(float(0.35), float(0.74), n1)).mul(float(1.0).sub(smoothstep(float(0.05), float(0.55), up))).mul(detailMask);
  col = col.add(uSunCol.mul(silver.mul(0.56).add(alpenglow.mul(0.30))).mul(uSunAmt).mul(float(1.0).sub(uNight)).mul(float(1.0).sub(uMixOver.mul(0.72))));

  // Sun disc + corona glow
  const disc = smoothstep(float(0.99935), float(0.99975), sd);
  const glow = pow(sd, float(120.0)).mul(0.68).add(pow(sd, float(14.0)).mul(0.22)).add(pow(sd, float(3.0)).mul(0.07));
  const vis = uSunAmt.mul(float(1.0).sub(uMixOver.mul(0.88)));
  col = col.add(uSunCol.mul(disc.mul(10.5).add(glow.mul(2.5))).mul(vis).mul(float(1.0).sub(uNight)));

  // Subtle pinpoint twinkle overlay (restrained so real photographic Milky Way / Aurora / Moon sky domes shine cleanly!)
  const starVis = smoothstep(float(0.55), float(0.94), uNight)
    .mul(smoothstep(float(0.06), float(0.32), dir.y))
    .mul(float(1.0).sub(uMixOver))
    .mul(float(1.0).sub(uMixStorm));
  const gs = dir.mul(260.0);
  const gCell = floor(gs);
  const gf = fract(gs).sub(0.5);
  const hStar = tslHash31(gCell);
  const pt = smoothstep(float(0.14), float(0.015), length(gf));
  const star = step(float(0.992), hStar).mul(pt);
  col = col.add(vec3(0.90, 0.94, 1.0).mul(star).mul(0.45).mul(starVis));

  const md = max(dot(dir, uMoonDir), float(1e-4));
  const moonGlow = smoothstep(float(0.9994), float(0.99985), md).mul(1.8)
    .add(pow(md, float(180.0)).mul(0.28))
    .add(pow(md, float(12.0)).mul(0.05));
  col = col.add(vec3(0.88, 0.93, 1.0).mul(moonGlow).mul(uNight).mul(float(1.0).sub(uMixOver.mul(0.88))).mul(float(1.0).sub(uMixStorm)));

  // Weather darkening + lightning flash
  col = col.mul(float(1.0).sub(uDark.mul(0.30).mul(notNight)));
  col = col.add(vec3(0.62, 0.72, 1.0).mul(uFlash).mul(cloudy.mul(0.9).add(0.25)));

  // Rayleigh + Mie horizon aerial perspective
  const hzBase = clamp(float(1.0).sub(clamp(dir.y, 0.0, 1.0)), 0.0, 1.0);
  const hz2 = hzBase.mul(hzBase);
  const hz = hz2.mul(hz2);
  const sd3 = sd.mul(sd).mul(sd);
  const sd12 = sd3.mul(sd3).mul(sd3).mul(sd3);
  const mieHz = clamp(sd3.mul(0.30).add(sd12.mul(0.58)), 0.0, 0.86).mul(vis).mul(float(1.0).sub(uNight));
  const hzCol = mix(uFog, uSunCol.mul(1.22), mieHz);
  col = mix(col, hzCol, clamp(hz.mul(float(0.34).add(uFogAmt.mul(0.66))), 0.0, 1.0));
  col = mix(col, hzCol, smoothstep(float(0.0), float(-0.10), dir.y));

  const mat = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    transparent: false,
  });
  mat.colorNode = col;

  let elapsed = 0;
  return {
    material: mat,
    setBaseTexture(t: THREE.Texture) { baseTexNode.value = t; },
    setNextTexture(t: THREE.Texture) { nextTexNode.value = t; },
    setBaseBlend(blend: number) { uBaseBlend.value = Math.max(0, Math.min(1, blend)); },
    setOvercastTexture(t: THREE.Texture) { overTexNode.value = t; },
    setStormTexture(t: THREE.Texture) { stormTexNode.value = t; },
    setNightOvercastTexture(t: THREE.Texture) { nightOverTexNode.value = t; },
    setNightStormTexture(t: THREE.Texture) { nightStormTexNode.value = t; },
    setMoonDir(v: THREE.Vector3) { uMoonDir.value.copy(v).normalize(); },
    update(dt: number, st: SkyState) {
      elapsed += dt;
      uTime.value = elapsed;
      uSunDir.value.copy(st.sunDir);
      uSunCol.value.copy(st.sunCol);
      uSunAmt.value = st.sunAmt;
      uNight.value = st.night;
      uFog.value.copy(st.fog);
      uFogAmt.value = st.fogAmt;
      uMixOver.value = st.mixOver;
      uMixStorm.value = st.mixStorm;
      uDark.value = st.dark;
      uFlash.value = st.flash;
    },
  };
}

/** High wispy cirrus cloud layer with smooth radial horizon fade & dynamic day/sunset/night tinting (TSL port of `sky.ts` cirrus). */
export function createApexCirrusTslMaterial(cirrusTex: THREE.Texture): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const uTint = uniform(new THREE.Color(1, 1, 1));
  const uOp = uniform(1.0);
  mat.userData.uTint = uTint;
  mat.userData.uOp = uOp;
  const texSample = tslTexture(cirrusTex, uv());
  const radial = smoothstep(float(1.0), float(0.25), length(uv().mul(2.0).sub(1.0)));
  mat.colorNode = texSample.rgb.mul(uTint);
  mat.opacityNode = texSample.a.mul(radial).mul(uOp);
  return mat;
}

// =============================================================================
// 2. FLOW-ADVECTED LAKE & RIVER WATER (TSL port of `water.ts`)
// =============================================================================

export interface ApexWaterTslOptions {
  normalTex: THREE.Texture;
  flowTex?: THREE.Texture;
  carveTex?: THREE.Texture;
  skyTex?: THREE.Texture;
  region: THREE.Vector4; // (x0, z0, rw, rh)
  edge: THREE.Vector2;
}

export interface ApexWaterTslHandle {
  material: THREE.MeshBasicNodeMaterial;
  setFlowTexture(t: THREE.Texture): void;
  setSkyTexture(t: THREE.Texture): void;
  update(dt: number, s: WaterState): void;
}

export function createApexWaterTslMaterial(opts: ApexWaterTslOptions): ApexWaterTslHandle {
  const blankFlow = opts.flowTex ?? (() => {
    const d = new THREE.DataTexture(new Uint8Array([128, 128, 255, 0]), 1, 1);
    d.needsUpdate = true;
    return d;
  })();
  const blankCarve = opts.carveTex ?? (() => {
    const d = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    d.needsUpdate = true;
    return d;
  })();
  const blankSky = opts.skyTex ?? (() => {
    const d = new THREE.DataTexture(new Uint8Array([140, 168, 204, 255]), 1, 1);
    d.needsUpdate = true;
    return d;
  })();

  const flowTexNode = tslTexture(blankFlow);
  const carveTexNode = tslTexture(blankCarve);
  const skyTexNode = tslTexture(blankSky);

  const uTime = uniform(0);
  const uSunAmt = uniform(1);
  const uWind = uniform(0.25);
  const uRain = uniform(0);
  const uFogNear = uniform(9000);
  const uFogFar = uniform(42000);
  const uMapFade = uniform(0);
  const uSkyDim = uniform(1);
  const uHaveSky = uniform(opts.skyTex ? 1 : 0);
  const uStorm = uniform(0);
  const uGlint = uniform(0.45);
  const uSunDir = uniform(new THREE.Vector3(0, 1, 0));
  const uSunCol = uniform(new THREE.Color(1, 1, 1));
  const uFog = uniform(new THREE.Color(0.7, 0.8, 0.9));
  const uRegion = uniform(opts.region.clone());
  const uEdge = uniform(opts.edge.clone());
  const uWindDir = uniform(new THREE.Vector2(0.8, 0.25).normalize());

  const wp = positionWorld.xz;
  const fuv = wp.sub(uRegion.xy).div(uRegion.zw);
  const inside = fuv.x.greaterThan(0.0).and(fuv.x.lessThan(1.0)).and(fuv.y.greaterThan(0.0)).and(fuv.y.lessThan(1.0));
  const fuvC = clamp(fuv, 0.0, 1.0);
  const fl = inside.select(flowTexNode.sample(fuvC), vec4(0.5, 0.5, 1.0, 0.0));
  const cv = inside.select(carveTexNode.sample(fuvC), vec4(0.0, 0.0, 0.0, 0.0));
  const flow = fl.rg.sub(0.5).mul(4.4);
  const rawDep = max(fl.b, cv.b);
  const dep = rawDep.mul(rawDep).mul(12.0);
  const shore = fl.a.mul(float(1.0).sub(cv.a.mul(0.92)));
  const spd = length(flow);

  const riverFallback = vec2(-0.38, 0.92);
  const windDrift = uWindDir.mul(float(0.95).add(uWind.mul(1.45)));
  const baseCur = spd.greaterThan(0.18).select(
    flow.mul(1.35),
    mix(windDrift, riverFallback.mul(1.55), smoothstep(float(8.5), float(2.2), dep).mul(inside.select(float(1.0), float(0.0)))),
  );
  const cur = baseCur.add(uWindDir.mul(float(0.42).add(uWind.mul(0.85))).mul(float(1.0).sub(smoothstep(float(0.4), float(1.8), spd))));
  const curSpd = length(cur);
  const curDir = cur.div(max(curSpd, float(0.001)));
  const curPerp = vec2(curDir.y.negate(), curDir.x);

  const T = float(3.2);
  const ph0 = fract(uTime.div(T));
  const ph1 = fract(uTime.div(T).add(0.5));
  const wgt = abs(ph0.mul(2.0).sub(1.0));

  const flowSpace = vec2(dot(wp, curPerp).mul(1.25), dot(wp, curDir).mul(0.78));
  const a0 = flowSpace.div(9.5).sub(vec2(float(0.0), curSpd.mul(ph0).mul(T).div(9.5)));
  const a1 = flowSpace.div(9.5).sub(vec2(float(0.0), curSpd.mul(ph1).mul(T).div(9.5)));
  const b0 = wp.div(3.1).sub(cur.mul(1.45).mul(ph0).mul(T).div(3.1)).add(vec2(0.37, 0.11));
  const b1 = wp.div(3.1).sub(cur.mul(1.45).mul(ph1).mul(T).div(3.1)).add(vec2(0.37, 0.11));

  const wpR = vec2(wp.x.mul(0.8).sub(wp.y.mul(0.6)), wp.x.mul(0.6).add(wp.y.mul(0.8)));
  const wpR2 = vec2(wp.x.mul(-0.53).add(wp.y.mul(0.85)), wp.x.mul(-0.85).sub(wp.y.mul(0.53)));
  const c0 = wpR.div(26.0).sub(cur.mul(0.85).add(uWindDir.mul(1.35)).mul(uTime).div(26.0)).add(vec2(0.19, 0.63));
  const c1 = wpR2.div(64.0).sub(cur.mul(0.65).add(uWindDir.mul(1.85)).mul(uTime).div(64.0)).add(vec2(0.47, 0.29));

  const ta0 = tslTexture(opts.normalTex, a0);
  const ta1 = tslTexture(opts.normalTex, a1);
  const nA = mix(ta0.xyz, ta1.xyz, wgt).mul(2.0).sub(1.0);
  const nB = mix(tslTexture(opts.normalTex, b0).xyz, tslTexture(opts.normalTex, b1).xyz, wgt).mul(2.0).sub(1.0);
  const tc0 = tslTexture(opts.normalTex, c0);
  const tc1 = tslTexture(opts.normalTex, c1);
  const nC = tc0.xyz.mul(2.0).sub(1.0).mul(0.58).add(tc1.xyz.mul(2.0).sub(1.0).mul(0.42));

  const swell1 = dot(wp, curDir).mul(0.19).sub(uTime.mul(float(1.55).add(curSpd.mul(0.55))));
  const swell2 = dot(wp, uWindDir).mul(0.11).sub(uTime.mul(float(1.25).add(uWind.mul(1.15))));
  const dirWave = curDir.mul(cos(swell1).mul(0.11)).add(uWindDir.mul(cos(swell2).mul(0.085)));

  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  const nearFade = float(1.0).sub(smoothstep(float(140.0), float(580.0), dist));
  const midFade = float(1.0).sub(smoothstep(float(550.0), float(2800.0), dist).mul(0.68));
  const choppy = float(0.36).add(uWind.mul(1.10)).add(curSpd.mul(0.22)).add(uRain.mul(0.28));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let slope: any = nA.xy.mul(0.72).mul(nearFade).add(nB.xy.mul(0.58).mul(nearFade)).add(nC.xy.mul(0.84).mul(midFade)).mul(choppy).add(dirWave.mul(midFade));

  // Raindrop ripple rings
  const rg = wp.mul(0.55);
  const rId = floor(rg);
  const rF = fract(rg).sub(0.5);
  const rT = fract(uTime.mul(0.85).add(tslHash21(rId)));
  const rDist = length(rF);
  const ring = smoothstep(float(0.045), float(0.0), abs(rDist.sub(rT.mul(0.46))))
    .mul(float(1.0).sub(rT))
    .mul(step(tslHash21(rId.add(7.0)), uRain))
    .mul(smoothstep(float(0.01), float(0.04), uRain));
  slope = slope.add(normalize(rF.add(vec2(1e-4, 1e-4))).mul(ring).mul(0.9));

  const N = normalize(vec3(slope.x, float(1.0), slope.y));
  const V = toCam.div(max(dist, float(1e-4)));
  const ndv = clamp(dot(N, V), 0.0, 1.0);
  const omN = float(1.0).sub(ndv);
  const omN2 = omN.mul(omN);
  const F = float(0.02).add(omN2.mul(omN2).mul(omN).mul(0.98));

  const Rraw = reflect(V.negate(), N);
  const R = vec3(Rraw.x, abs(Rraw.y).mul(0.98).add(0.02), Rraw.z);
  const skyUv = vec2(atan(R.z, R.x).mul(0.15915494).add(0.5), asin(clamp(R.y, -1.0, 1.0)).mul(0.31830989).add(0.5));
  const skyCol = mix(vec3(0.55, 0.65, 0.78), skyTexNode.sample(skyUv).rgb, step(float(0.5), uHaveSky)).mul(uSkyDim);

  const tdeep = float(1.0).sub(exp(dep.mul(-0.32)));
  const shallow = mix(vec3(0.11, 0.30, 0.28), vec3(0.16, 0.22, 0.14), smoothstep(float(0.15), float(0.8), spd));
  const deep = vec3(0.012, 0.085, 0.125);
  let body = mix(shallow, deep, tdeep).mul(float(0.55).add(max(uSunAmt, float(0.15)).mul(0.6)));
  const nds = clamp(dot(N, uSunDir), 0.0, 1.0);
  body = body.add(uSunCol.mul(nds.mul(nds).mul(nds)).mul(0.05).mul(float(1.0).sub(tdeep)).mul(uSunAmt));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let col: any = mix(body, skyCol, F);
  const rs = max(dot(R, uSunDir), float(1e-4));
  const tw = tslTexture(opts.normalTex, wp.div(1.3).add(cur.mul(uTime).mul(0.12))).a
    .mul(tslTexture(opts.normalTex, wp.div(0.7).sub(cur.mul(uTime).mul(0.2)).add(0.31)).a);
  const spBase = pow(rs, mix(float(900.0), float(260.0), uGlint)).mul(mix(float(6.0), float(3.0), uGlint))
    .add(pow(rs, float(70.0)).mul(0.28).mul(float(1.0).add(uGlint.mul(0.4))))
    .add(uGlint.mul(pow(rs, float(28.0))).mul(smoothstep(float(0.3), float(0.9), tw.mul(2.2))).mul(1.6).mul(step(float(0.45), rs)));
  const sp = min(spBase, float(2.4));
  col = col.add(uSunCol.mul(sp).mul(max(uSunAmt, uGlint.mul(0.7))).mul(float(1.0).sub(uStorm.mul(0.7))));

  // Organic foam: animated shoreline lap waves + downstream current streaks + wind whitecaps
  const hSw = tc0.a.mul(0.58).add(tc1.a.mul(0.42));
  const hh = mix(ta0.a, ta1.a, wgt).mul(float(0.35).add(hSw.mul(0.85)));
  const lapWave = sin(uTime.mul(2.35).sub(shore.mul(14.0)).add(hSw.mul(6.0))).mul(0.5).add(0.5);
  const bank = smoothstep(float(0.56), float(1.0), shore).mul(smoothstep(float(0.28), float(0.76), hh.add(lapWave.mul(0.26)).add(float(1.0).sub(dep).mul(0.1))));
  const streakTex = tslTexture(opts.normalTex, vec2(dot(wp, curPerp).div(7.5), dot(wp, curDir).div(42.0).sub(uTime.mul(curSpd).div(42.0)))).a;
  const currentStreak = smoothstep(float(0.75), float(1.9), curSpd).mul(smoothstep(float(0.66), float(0.90), streakTex.mul(float(0.65).add(hSw.mul(0.55))))).mul(0.26).mul(midFade);
  const fast = smoothstep(float(0.95), float(1.55), curSpd).mul(smoothstep(float(0.48), float(0.82), hh)).mul(0.55);
  const caps = smoothstep(float(0.48), float(1.0), uWind.add(uStorm.mul(0.4))).mul(smoothstep(float(0.66), float(0.90), hh)).mul(0.78).mul(midFade);
  const foam = clamp(bank.add(fast).add(caps).add(currentStreak), 0.0, 1.0);
  col = mix(col, vec3(0.88, 0.92, 0.94).mul(float(0.5).add(max(uSunAmt, float(0.2)).mul(0.5))), foam.mul(0.85));

  const fg = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFog, fg);

  // Inland border fades (keep open lake west & northwest, zero apron sticking out behind east/south land borders)
  const eastBoundary = float(1.0).sub(smoothstep(float(0.992), float(1.003), fuv.x));
  const southBoundary = float(1.0).sub(smoothstep(float(0.992), float(1.003), fuv.y));
  const neBoundary = float(1.0).sub(smoothstep(float(0.68), float(0.78), fuv.x).mul(float(1.0).sub(smoothstep(float(-0.015), float(0.006), fuv.y))));
  const mapEdgeDist = min(
    uEdge.x.sub(abs(wp.x.sub(uRegion.x.add(uRegion.z.mul(0.5))))),
    uEdge.y.sub(abs(wp.y.sub(uRegion.y.add(uRegion.w.mul(0.5))))),
  );
  const edgeAlpha = mix(float(1.0), smoothstep(float(0.0), float(1300.0), mapEdgeDist), uMapFade);
  const alpha = clamp(float(0.30).add(tdeep.mul(0.62)).add(F.mul(0.35)).add(foam.mul(0.5)), 0.0, 0.96)
    .mul(smoothstep(float(0.02), float(0.90), dep.add(inside.select(float(0.0), float(1.0)))))
    .mul(eastBoundary).mul(southBoundary).mul(neBoundary)
    .mul(edgeAlpha);

  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  mat.colorNode = col;
  mat.opacityNode = alpha;

  let elapsed = 0;
  return {
    material: mat,
    setFlowTexture(t: THREE.Texture) { flowTexNode.value = t; },
    setSkyTexture(t: THREE.Texture) { skyTexNode.value = t; uHaveSky.value = 1; },
    update(dt: number, s: WaterState) {
      elapsed += dt;
      uTime.value = elapsed;
      uSunDir.value.copy(s.sunDir);
      uSunCol.value.copy(s.sunCol);
      uSunAmt.value = s.sunAmt;
      uWind.value = s.wind;
      uRain.value = s.rain;
      uStorm.value = s.storm;
      uFog.value.copy(s.fog);
      uFogNear.value = s.fogNear;
      uFogFar.value = s.fogFar;
      uSkyDim.value = s.skyDim;
      uGlint.value = s.glint ?? 0;
      uMapFade.value = s.mapFade;
    },
  };
}

// =============================================================================
// 3. TREES & CURVED-BLADE GRASS STRANDS (TSL ports of `trees.ts` & `vegetation.ts`)
// =============================================================================

export interface ApexFoliageUniforms {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uTime: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uWind: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uWet: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uNearR: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uSunDir: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uSunCol: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uCam: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uCarVel: any;
  trailVecs: THREE.Vector4[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uTrails: any;
}

export function createApexFoliageUniforms(nearR = 181): ApexFoliageUniforms {
  const trailVecs = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0));
  return {
    uTime: uniform(0),
    uWind: uniform(0.32),
    uWet: uniform(0),
    uNearR: uniform(nearR),
    uSunDir: uniform(new THREE.Vector3(-0.6, 0.7, -0.35).normalize()),
    uSunCol: uniform(new THREE.Color(1.0, 0.94, 0.84)),
    uCam: uniform(new THREE.Vector3()),
    uCarVel: uniform(new THREE.Vector3()),
    trailVecs,
    uTrails: uniformArray(trailVecs, 'vec4'),
  };
}

/** TSL port of `TreeField` 3D tree material (wind sway + leaf-edge hashed cutout + Playkit SH9 GI). */
export function createApexTreeTslMaterial(
  fU: ApexFoliageUniforms,
  gi?: PlaykitGiUniforms,
): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });

  // World-stable phase per tree instance using world origin column + instanceIndex fallback
  const h01 = clamp(positionLocal.y.div(17.0), 0.0, 1.0);
  const sw = fU.uWind.mul(h01).mul(h01).mul(0.9);
  const idxPhase = float(instanceIndex).mul(0.37);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dx: any = sin(fU.uTime.mul(1.5).add(idxPhase).add(positionLocal.y.mul(0.3))).mul(sw)
    .add(sin(fU.uTime.mul(3.1).add(positionLocal.z.mul(1.7)).add(idxPhase.mul(1.4))).mul(sw).mul(0.25));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dz: any = cos(fU.uTime.mul(1.2).add(idxPhase.mul(0.8))).mul(sw).mul(0.7);
  mat.positionNode = positionLocal.add(vec3(dx, float(0.0), dz));

  // Hashed foliage silhouette breakup where surface turns away from the camera
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aLeaf: any = attribute('aLeaf', 'float');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edge: any = float(1.0).sub(abs(dot(normalize(normalView), normalize(positionViewDirection))));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lh = (p: any): any => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const n = lh(floor(positionLocal.mul(3.2))).mul(0.6).add(lh(floor(positionLocal.mul(7.5)).add(3.0)).mul(0.4));
  const leafKeep = aLeaf.greaterThan(0.5).select(n.greaterThanEqual(edge.mul(edge).mul(0.9).add(0.04)).select(float(1.0), float(0.0)), float(1.0));
  mat.opacityNode = leafKeep;
  mat.colorNode = vertexColor().rgb;

  if (gi) {
    enhanceMaterialWithPlaykitGi(mat, gi, { detailStrength: 0, giBounceStrength: 0.22 });
  }
  return mat;
}

/** TSL port of `cardLod` distant tree sprite cross-fade with physical backlit SSS, wrap-diffuse & two-hemisphere indirect canopy lighting! */
export function createApexTreeCardLodTslMaterial(
  map: THREE.Texture,
  fU: ApexFoliageUniforms,
  gi?: PlaykitGiUniforms,
): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({
    map,
    roughness: 0.62,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.50,
  });
  const distXZ = length(positionWorld.xz.sub(cameraPosition.xz));
  const cardFade = smoothstep(fU.uNearR.sub(12.0), fU.uNearR.add(14.0), distXZ);
  const ign = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
  const texS = tslTexture(map, uv());
  const ditherKeep = cardFade.greaterThan(0.995).select(float(1.0), ign.greaterThanEqual(float(1.0).sub(cardFade)).select(float(1.0), float(0.0)));
  const fLum = luminance(texS.rgb);
  const cardH = clamp(uv().y, 0.0, 1.0);
  const crownDepth = mix(float(0.56), float(1.08), smoothstep(float(0.10), float(0.88), cardH));
  const col = mix(vec3(fLum, fLum, fLum), texS.rgb, 1.38).mul(vec3(0.42, 0.58, 0.34)).mul(crownDepth).mul(float(1.0).sub(fU.uWet.mul(0.22)));

  // Physical backlit canopy SSS + subtle deep foliage bounce (never washes out distant canopies grey!)
  const viewW = normalize(cameraPosition.sub(positionWorld));
  const sunDirW = fU.uSunDir;
  const backRaw = clamp(dot(viewW, sunDirW.negate()), 0.0, 1.0);
  const sss = col.mul(vec3(1.18, 1.36, 0.36)).mul(fU.uSunCol).mul(backRaw.mul(backRaw).mul(backRaw).mul(0.28)).mul(float(0.30).add(cardH.mul(0.70)));
  const indirectBounce = col.mul(mix(vec3(0.05, 0.08, 0.03), vec3(0.04, 0.07, 0.09), cardH));

  mat.colorNode = col;
  mat.roughnessNode = mix(float(0.68), float(0.46), cardH).mul(float(1.0).sub(fU.uWet.mul(0.42)));
  mat.emissiveNode = sss.add(indirectBounce);
  mat.opacityNode = step(float(0.74), texS.a).mul(ditherKeep).mul(step(float(0.005), cardFade));
  if (gi) {
    enhanceMaterialWithPlaykitGi(mat, gi, { detailStrength: 0, giBounceStrength: 0.20 });
  }
  return mat;
}

/** TSL port of `EzTreeField` (`ezforest.ts`) with physical normal-distorted SSS, wrap-diffuse, waxy leaf cuticle specular & two-hemisphere indirect lighting! */
export function createApexEzTreeTslMaterial(opts: {
  kind: 'bark' | 'leaf';
  map: THREE.Texture;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  colorHex: number;
  roughness: number;
  alphaTest?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uTime: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uWind: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uFadeStart: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uFadeEnd: any;
  fU: ApexFoliageUniforms;
  gi?: PlaykitGiUniforms;
}): THREE.MeshStandardNodeMaterial {
  const isLeaf = opts.kind === 'leaf';
  const mat = new THREE.MeshStandardNodeMaterial({
    map: opts.map,
    normalMap: opts.normalMap ?? null,
    normalScale: opts.normalMap ? new THREE.Vector2(isLeaf ? 1.35 : 1.55, isLeaf ? 1.35 : 1.55) : undefined,
    roughness: opts.roughness,
    metalness: 0,
    side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
    alphaTest: isLeaf ? (opts.alphaTest ?? 0.38) : 0.5,
  });

  const h01 = clamp(positionLocal.y, 0.0, 1.2);
  const idxPhase = float(instanceIndex).mul(0.73);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sw: any = opts.uWind.mul(h01).mul(h01).mul(0.052);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gust: any = sin(opts.uTime.mul(1.35).add(idxPhase).add(positionLocal.y.mul(2.6)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flutter: any = isLeaf
    ? sin(opts.uTime.mul(4.4).add(positionLocal.x.mul(32.0)).add(positionLocal.z.mul(38.0)).add(idxPhase)).mul(0.34)
    : float(0.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dx: any = gust.add(flutter).mul(sw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dz: any = cos(opts.uTime.mul(1.10).add(idxPhase.mul(0.8))).mul(sw).mul(0.72).add(flutter.mul(sw).mul(0.45));
  mat.positionNode = positionLocal.add(vec3(dx, float(0.0), dz));

  // Keep mat.normalMap active (do NOT override mat.normalNode when normalMap is attached!)
  if (isLeaf && !opts.normalMap) {
    const crownOut = normalize(positionLocal.sub(vec3(0.0, 0.56, 0.0)).add(vec3(0.0, 0.14, 0.0)));
    mat.normalNode = normalize(mix(normalLocal, crownOut, 0.72));
  }

  const distXZ = length(positionWorld.xz.sub(cameraPosition.xz));
  const treeFade = smoothstep(opts.uFadeEnd, opts.uFadeStart, distXZ);
  const ign = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
  const fadeKeep = treeFade.greaterThan(0.995).select(float(1.0), ign.lessThanEqual(treeFade).select(float(1.0), float(0.0)));

  const texS = tslTexture(opts.map, uv());
  const baseC = tslColor(opts.colorHex);
  const treeH = clamp(positionLocal.y, 0.0, 1.0);
  const viewW = normalize(cameraPosition.sub(positionWorld));
  const sunDirW = opts.fU.uSunDir;
  const nW = normalWorld;
  const skyUp = clamp(nW.y.mul(0.5).add(0.5), 0.0, 1.0);

  if (isLeaf) {
    // Radial 3D volumetric crown AO (deep shaded inner branches -> rich saturated chlorophyll outer foliage shell)
    const crownAO = clamp(length(positionLocal.sub(vec3(0.0, 0.56, 0.0)).mul(vec3(2.2, 1.6, 2.2))), 0.0, 1.0);
    const cavity = smoothstep(float(0.12), float(0.95), crownAO.mul(0.68).add(treeH.mul(0.32)));
    const treeRand = fract(sin(float(instanceIndex).mul(12.9898).add(78.233)).mul(43758.5453));
    const autumnAccent = smoothstep(float(0.86), float(0.98), treeRand);
    const greenTint = mix(vec3(0.68, 0.96, 0.66), vec3(0.96, 0.92, 0.58), treeRand);
    const tint = mix(greenTint, vec3(1.36, 0.80, 0.34), autumnAccent.mul(0.45));
    const leafLum = luminance(texS.rgb);
    const satLeaf = mix(vec3(leafLum, leafLum, leafLum), texS.rgb, float(1.45));
    const leafThick = clamp(leafLum.mul(1.35), 0.22, 1.0);
    const shaded = satLeaf.mul(baseC).mul(tint)
      .mul(mix(float(0.28), float(1.05), cavity))
      .mul(float(1.0).sub(opts.fU.uWet.mul(0.24)));

    // 1. Physical normal-distorted backlit Subsurface Scattering (rich transmitted chlorophyll emerald-gold glow, zero milky grey!)
    const backRaw = clamp(dot(viewW, sunDirW.negate().add(nW.mul(0.30))), 0.0, 1.0);
    const backSss = backRaw.mul(backRaw).mul(backRaw);
    const wrapDiff = clamp(dot(nW, sunDirW).add(0.35).mul(0.65), 0.0, 1.0);
    const sssGlow = shaded.mul(vec3(1.18, 1.40, 0.36)).mul(opts.fU.uSunCol)
      .mul(backSss.mul(0.46).add(wrapDiff.mul(0.05))).mul(leafThick).mul(float(0.25).add(cavity.mul(0.75)));

    // 2. Subtle chromatic two-hemisphere indirect bounce (preserves deep crown contrast!)
    const groundBounce = shaded.mul(vec3(0.08, 0.13, 0.05)).mul(float(1.0).sub(skyUp)).mul(float(0.35).add(cavity.mul(0.65)));
    const skyFill = shaded.mul(vec3(0.04, 0.07, 0.10)).mul(skyUp).mul(cavity);

    // 3. Subtle waxy leaf cuticle grazing glint (no chalky grey haze on leaves!)
    const omN = float(1.0).sub(clamp(abs(dot(nW, viewW)), 0.01, 1.0));
    const omN2 = omN.mul(omN);
    const fres = omN2.mul(omN2).mul(float(0.03).add(opts.fU.uWet.mul(0.14))).mul(cavity);
    const cutSpec = mix(shaded.mul(1.3), opts.fU.uSunCol, 0.45).mul(fres);

    mat.colorNode = shaded;
    if (opts.roughnessMap) {
      const rSamp = tslTexture(opts.roughnessMap, uv()).r;
      mat.roughnessNode = clamp(rSamp.mul(float(0.82)).mul(float(1.0).sub(opts.fU.uWet.mul(0.52))), 0.16, 0.88);
    } else {
      mat.roughnessNode = clamp(mix(float(0.62), float(0.38), leafThick).mul(float(1.0).sub(opts.fU.uWet.mul(0.52))), 0.16, 0.82);
    }
    mat.emissiveNode = sssGlow.add(groundBounce).add(skyFill).add(cutSpec);
    mat.opacityNode = texS.a.mul(fadeKeep).mul(step(float(0.005), treeFade));
  } else {
    // Rich bark with mossy damp lower trunk + north-side lichen & warm soil bounce
    const rootAO = mix(float(0.46), float(1.0), smoothstep(float(0.0), float(0.18), treeH));
    const mossMask = clamp(smoothstep(float(0.30), float(0.02), treeH).mul(0.62).add(smoothstep(float(0.45), float(0.85), nW.y).mul(0.35)), 0.0, 0.72);
    const barkCol = mix(texS.rgb.mul(baseC), vec3(0.16, 0.25, 0.11), mossMask.mul(0.55))
      .mul(rootAO).mul(float(1.0).sub(opts.fU.uWet.mul(0.30)));
    mat.colorNode = barkCol;
    mat.roughnessNode = clamp(float(opts.roughness).mul(float(1.0).sub(opts.fU.uWet.mul(0.50))), 0.24, 0.96);
    mat.emissiveNode = barkCol.mul(vec3(0.14, 0.17, 0.09)).mul(float(1.0).sub(skyUp)).mul(0.55);
    mat.opacityNode = fadeKeep.mul(step(float(0.005), treeFade));
  }

  if (opts.gi) {
    enhanceMaterialWithPlaykitGi(mat, opts.gi, { detailStrength: 0, giBounceStrength: isLeaf ? 0.26 : 0.16 });
  }
  return mat;
}

/**
 * TSL port of `Vegetation.strandMaterial` + `STRAND_WIND_TRAMPLE_GLSL`:
 * Genuine curved 3D tapered grass strands & farm crops at 100% CONSTANT HEIGHT (zero height-popping!),
 * botanical midrib blade shading, physical normal-distorted backlit SSS, two-hemisphere indirect lighting,
 * rolling wind gust waves, 4-point car wake/tire trample, and Kajiya-Kay waxy cuticle sheen!
 */
export function createApexGrassStrandTslMaterial(
  fade: [number, number, number, number],
  fU: ApexFoliageUniforms,
  gi?: PlaykitGiUniforms,
  xzSpread = 1.0,
): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.56,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aPos: any = attribute('aPos', 'vec3');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aRS: any = attribute('aRS', 'vec2');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aCol: any = attribute('aCol', 'vec3');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aBlade: any = attribute('aBlade', 'vec4');
  const uFade = uniform(new THREE.Vector4(...fade));
  const uSpread = float(xzSpread);

  const vd = length(aPos.xz.sub(fU.uCam.xz));
  const vfade = smoothstep(uFade.x, uFade.y, vd).mul(float(1.0).sub(smoothstep(uFade.z, uFade.w, vd)));
  const vr = aRS.x;
  const vc = cos(vr);
  const vs = sin(vr);

  // Keep grass 100% constant height across its ring (ZERO height sprouting/popping — pure IGN dither crossfade!)
  const alive = step(float(0.002), vfade);
  const vp = vec3(positionLocal.x.mul(uSpread), positionLocal.y, positionLocal.z.mul(uSpread)).mul(aRS.y).mul(alive);
  const rotP = vec3(vp.x.mul(vc).add(vp.z.mul(vs)), vp.y, vp.x.negate().mul(vs).add(vp.z.mul(vc)));
  const hFrac = aBlade.x;
  const phase = aBlade.y;
  const widthSide = aBlade.z;
  const leanAmt = aBlade.w;
  const h2 = hFrac.mul(hFrac);

  const macroWave = sin(fU.uTime.mul(1.65).sub(aPos.x.mul(0.11)).sub(aPos.z.mul(0.085)));
  const gustWave = sin(fU.uTime.mul(2.85).sub(aPos.x.mul(0.27)).add(aPos.z.mul(0.19)).add(phase.mul(3.14)));
  const micro = sin(fU.uTime.mul(5.8).add(phase.mul(6.2831)).add(aPos.x.mul(0.9))).mul(0.18);
  const gustAmt = float(0.45).add(macroWave.mul(0.55)).mul(fU.uWind).mul(float(0.65).add(leanAmt.mul(0.35)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bendX: any = macroWave.mul(0.62).add(gustWave.mul(0.32)).add(micro).mul(gustAmt).mul(0.34).mul(h2).mul(alive);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bendZ: any = cos(fU.uTime.mul(1.45).sub(aPos.z.mul(0.10)).sub(aPos.x.mul(0.06))).mul(0.55)
    .add(gustWave.mul(0.25)).mul(gustAmt).mul(0.24).mul(h2).mul(alive);

  // Unrolled 4-point car wake/tire trample
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let trample: any = vec2(0.0, 0.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flatten: any = float(0.0);
  for (let i = 0; i < 4; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tr: any = fU.uTrails.element(i);
    const rad = tr.w;
    const diff = aPos.xz.sub(tr.xz);
    const d = length(diff);
    const active = rad.greaterThan(0.01).and(d.lessThan(rad));
    const k = clamp(float(1.0).sub(d.div(max(rad, float(0.01)))), 0.0, 1.0);
    const k2 = k.mul(k);
    const pushDir = d.greaterThan(0.02).select(diff.div(max(d, float(0.001))), vec2(1.0, 0.0));
    const wake = normalize(pushDir.mul(0.72).add(fU.uCarVel.xz.mul(0.025)).add(vec2(1e-4, 1e-4)));
    trample = trample.add(active.select(wake.mul(k2).mul(0.85), vec2(0.0, 0.0)));
    flatten = max(flatten, active.select(k2.mul(0.78), float(0.0)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const horiz: any = length(vec2(bendX, bendZ)).add(length(trample).mul(0.45));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yDrop: any = min(float(0.32), horiz.mul(0.35).mul(hFrac));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yScale: any = max(float(0.22), float(1.0).sub(flatten.mul(0.65).mul(hFrac)).sub(yDrop));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dxPos: any = rotP.x.add(bendX).add(trample.x.mul(hFrac).mul(0.55));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dzPos: any = rotP.z.add(bendZ).add(trample.y.mul(hFrac).mul(0.55));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dyPos: any = rotP.y.mul(yScale);
  mat.positionNode = vec3(dxPos, dyPos, dzPos).add(aPos);
  mat.normalNode = vec3(
    normalLocal.x.mul(vc).add(normalLocal.z.mul(vs)),
    normalLocal.y,
    normalLocal.x.negate().mul(vs).add(normalLocal.z.mul(vc)),
  );

  // Fragment: IGN screen-door LOD + botanical midrib shading + deep soil root AO + physical SSS + indirect bounce + Kajiya-Kay cuticle sheen
  const ign = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
  const ditherKeep = vfade.greaterThan(0.995).select(float(1.0), ign.lessThanEqual(vfade).select(float(1.0), float(0.0)));
  mat.opacityNode = ditherKeep.mul(step(float(0.005), vfade));

  const h = clamp(hFrac, 0.0, 1.0);
  const dryTint = smoothstep(float(0.74), float(0.98), phase);
  // Central blade midrib ridge & subtle chlorophyll striation across blade width
  const midRib = float(1.0).sub(abs(widthSide));
  const ribShade = float(0.86).add(midRib.mul(0.22));
  const rootTone = aCol.mul(vec3(0.22, 0.28, 0.16));
  const midTone = aCol.mul(mix(vec3(0.76, 1.02, 0.56), vec3(1.04, 0.92, 0.48), dryTint.mul(0.55)));
  const tipTone = aCol.mul(mix(vec3(0.98, 1.18, 0.64), vec3(1.18, 1.02, 0.56), dryTint));
  const grad = mix(mix(rootTone, midTone, smoothstep(float(0.0), float(0.42), h)), tipTone, smoothstep(float(0.42), float(1.0), h));
  const dapple = float(0.84).add(sin(positionWorld.x.mul(0.055).add(sin(positionWorld.z.mul(0.042)).mul(2.1))).mul(0.22));
  const rootAO = float(0.26).add(smoothstep(float(0.0), float(0.68), h).mul(0.74));
  const baseCol = grad.mul(ribShade).mul(dapple).mul(rootAO).mul(float(1.0).sub(fU.uWet.mul(0.28)));

  // Physical normal-distorted backlit Subsurface Scattering + rich grounded meadow bounce (keeps lush chlorophyll contrast!)
  const viewW = normalize(cameraPosition.sub(positionWorld));
  const sunDirW = fU.uSunDir;
  const nW = normalWorld;
  const backRaw = clamp(dot(viewW, sunDirW.negate().add(nW.mul(0.28))), 0.0, 1.0);
  const back = backRaw.mul(backRaw).mul(backRaw);
  const wrapL = clamp(dot(nW, sunDirW).add(0.35).mul(0.68), 0.0, 1.0);
  const sss = baseCol.mul(vec3(1.22, 1.40, 0.38)).mul(fU.uSunCol).mul(back.mul(0.48).add(wrapL.mul(0.05))).mul(h).mul(h);
  const indirectBounce = baseCol.mul(mix(vec3(0.07, 0.10, 0.04), vec3(0.05, 0.08, 0.10), h)).mul(rootAO);

  // Kajiya-Kay waxy grass cuticle glint along blade axis (subtle when dry, glossy when wet)
  const halfW = normalize(sunDirW.add(viewW));
  const sinTH2 = max(float(1e-4), float(1.0).sub(halfW.y.mul(halfW.y)));
  const sh4 = sinTH2.mul(sinTH2);
  const sheen = sh4.mul(sh4).mul(float(0.06).add(fU.uWet.mul(0.24))).mul(h).mul(float(0.70).add(midRib.mul(0.30)));

  mat.colorNode = baseCol;
  mat.roughnessNode = clamp(mix(float(0.78), float(0.34), h).mul(float(1.0).sub(fU.uWet.mul(0.50))), 0.14, 0.88);
  mat.emissiveNode = sss.add(indirectBounce).add(fU.uSunCol.mul(sheen));

  if (gi) {
    enhanceMaterialWithPlaykitGi(mat, gi, { detailStrength: 0, giBounceStrength: 0.22 });
  }
  return mat;
}

/** TSL port of `Vegetation.material()` for instanced leafy shrubs, woodland ferns, wildflowers & mossy rocks with full SSS + indirect lighting! */
export function createApexVegClusterTslMaterial(opts: {
  fade: [number, number, number, number];
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  alphaTest?: number;
  wind: number;
  rough: number;
  isFoliage?: boolean;
  fU: ApexFoliageUniforms;
  gi?: PlaykitGiUniforms;
}): THREE.MeshStandardNodeMaterial {
  const isFoliage = opts.isFoliage ?? (opts.wind > 0.001);
  // Keep tangent-space normalMap on solid rocks; skip perturbNormal2Arb on alpha-tested DoubleSide foliage cards for fast WebGPU shader compile & crisp spherical shading
  const useNormalMap = !isFoliage && !!opts.normalMap;
  const mat = new THREE.MeshStandardNodeMaterial({
    map: opts.map ?? null,
    normalMap: useNormalMap ? opts.normalMap! : null,
    normalScale: useNormalMap ? new THREE.Vector2(1.4, 1.4) : undefined,
    alphaTest: opts.alphaTest ?? 0.45,
    side: THREE.DoubleSide,
    roughness: opts.rough,
    metalness: 0,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aPos: any = attribute('aPos', 'vec3');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aRS: any = attribute('aRS', 'vec2');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aCol: any = attribute('aCol', 'vec3');
  const uFade = uniform(new THREE.Vector4(...opts.fade));
  const uWindAmt = float(opts.wind);

  const vd = length(aPos.xz.sub(opts.fU.uCam.xz));
  const vfade = smoothstep(uFade.x, uFade.y, vd).mul(float(1.0).sub(smoothstep(uFade.z, uFade.w, vd)));
  const alive = step(float(0.002), vfade);
  const vr = aRS.x;
  const vc = cos(vr);
  const vs = sin(vr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vp0: any = positionLocal.mul(aRS.y).mul(alive);
  const vh = positionLocal.y;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vsw: any = opts.fU.uWind.mul(uWindAmt).mul(vh).mul(vh).mul(aRS.y).mul(alive);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wx: any = sin(opts.fU.uTime.mul(2.1).add(aPos.x.mul(0.9)).add(aPos.z.mul(0.6)))
    .add(sin(opts.fU.uTime.mul(5.3).add(aPos.x.mul(2.3))).mul(0.25)).mul(vsw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wz: any = cos(opts.fU.uTime.mul(1.7).add(aPos.z.mul(0.8)).add(aPos.x.mul(0.4))).mul(vsw).mul(0.6);
  const vp = vec3(vp0.x.add(wx), vp0.y, vp0.z.add(wz));
  mat.positionNode = vec3(vp.x.mul(vc).add(vp.z.mul(vs)), vp.y, vp.x.negate().mul(vs).add(vp.z.mul(vc))).add(aPos);
  if (!useNormalMap) {
    mat.normalNode = vec3(
      normalLocal.x.mul(vc).add(normalLocal.z.mul(vs)),
      normalLocal.y,
      normalLocal.x.negate().mul(vs).add(normalLocal.z.mul(vc)),
    );
  }

  const ign = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
  const ditherKeep = vfade.greaterThan(0.995).select(float(1.0), ign.lessThanEqual(vfade).select(float(1.0), float(0.0)));
  const viewW = normalize(cameraPosition.sub(positionWorld));
  const sunDirW = opts.fU.uSunDir;
  const nW = normalWorld;
  const skyUp = clamp(nW.y.mul(0.5).add(0.5), 0.0, 1.0);
  const plantH = clamp(positionLocal.y, 0.0, 1.0);

  if (opts.map) {
    const texS = tslTexture(opts.map, uv());
    if (isFoliage) {
      // Bottom-to-top plant cavity AO + natural foliage depth
      const cavity = float(0.42).add(smoothstep(float(0.0), float(0.75), plantH).mul(0.58));
      const baseCol = texS.rgb.mul(aCol).mul(cavity).mul(float(1.0).sub(opts.fU.uWet.mul(0.26)));
      const leafThick = clamp(luminance(texS.rgb).mul(1.35), 0.25, 1.0);

      // Physical normal-distorted backlit Subsurface Scattering + wrap-diffuse sun transmission (rich emerald-gold!)
      const backRaw = clamp(dot(viewW, sunDirW.negate().add(nW.mul(0.30))), 0.0, 1.0);
      const backSss = backRaw.mul(backRaw).mul(backRaw);
      const wrapDiff = clamp(dot(nW, sunDirW).add(0.36).mul(0.66), 0.0, 1.0);
      const sss = baseCol.mul(vec3(1.20, 1.38, 0.36)).mul(opts.fU.uSunCol)
        .mul(backSss.mul(0.46).add(wrapDiff.mul(0.06))).mul(leafThick);

      // Subtle two-hemisphere indirect bounce + waxy cuticle glint
      const indirect = baseCol.mul(mix(vec3(0.08, 0.12, 0.05), vec3(0.05, 0.08, 0.11), skyUp)).mul(cavity);
      const omN = float(1.0).sub(clamp(abs(dot(nW, viewW)), 0.01, 1.0));
      const omN2 = omN.mul(omN);
      const fres = omN2.mul(omN2).mul(float(0.03).add(opts.fU.uWet.mul(0.16))).mul(cavity);
      const cutSpec = mix(baseCol.mul(1.3), opts.fU.uSunCol, 0.42).mul(fres);

      mat.colorNode = baseCol;
      if (opts.roughnessMap) {
        mat.roughnessNode = clamp(tslTexture(opts.roughnessMap, uv()).r.mul(0.84).mul(float(1.0).sub(opts.fU.uWet.mul(0.52))), 0.15, 0.86);
      } else {
        mat.roughnessNode = clamp(mix(float(0.60), float(0.36), leafThick).mul(float(1.0).sub(opts.fU.uWet.mul(0.52))), 0.15, 0.84);
      }
      mat.emissiveNode = sss.add(indirect).add(cutSpec);
      mat.opacityNode = texS.a.mul(ditherKeep).mul(step(float(0.005), vfade));
    } else {
      // Field stones & coastal rocks with top-facing woodland moss cap + damp rain sheen
      const moss = smoothstep(float(0.55), float(0.86), nW.y).mul(0.52);
      const rockCol = mix(texS.rgb.mul(aCol), vec3(0.14, 0.24, 0.10), moss).mul(float(1.0).sub(opts.fU.uWet.mul(0.32)));
      mat.colorNode = rockCol;
      mat.roughnessNode = clamp(float(opts.rough).mul(float(1.0).sub(opts.fU.uWet.mul(0.58))), 0.18, 0.96);
      mat.opacityNode = texS.a.mul(ditherKeep).mul(step(float(0.005), vfade));
    }
  } else {
    mat.colorNode = aCol.mul(float(1.0).sub(opts.fU.uWet.mul(0.28)));
    mat.opacityNode = ditherKeep.mul(step(float(0.005), vfade));
  }
  if (opts.gi) {
    enhanceMaterialWithPlaykitGi(mat, opts.gi, { detailStrength: 0, giBounceStrength: isFoliage ? 0.24 : 0.14 });
  }
  return mat;
}

// =============================================================================
// 4. FULL IRONPORT TERRAIN (TSL port of `applyTerrainDetail` in `region.ts`)
// =============================================================================

export interface ApexIronportTerrainTslOptions {
  albedoMap: THREE.Texture;
  maskMap: THREE.Texture;
  classMap: THREE.Texture;
  asphaltMap: THREE.Texture;
  paveMap: THREE.Texture;
  grassMap?: THREE.Texture;
  forestMap?: THREE.Texture;
  maskVec: THREE.Vector4;
  terrSize: THREE.Vector2;
  terrOrigin: THREE.Vector2;
  edge: THREE.Vector2;
  shared?: ApexTslSharedUniforms;
  gi?: PlaykitGiUniforms;
  /** Lean iGPU shader: cuts 23 procedural noise calls -> 4 while sampling real tiled grass/forest/asphalt/pave textures! */
  leanMode?: boolean;
}

export interface ApexIronportTerrainTslHandle {
  material: THREE.MeshStandardNodeMaterial;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uniforms: { uWet: any; uPool: any; uMapFade: any };
  setMaskTexture: (tex: THREE.Texture) => void;
}

function makeFallbackMaskTex(): THREE.DataTexture {
  const dt = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  dt.flipY = false;
  dt.colorSpace = THREE.NoColorSpace;
  dt.needsUpdate = true;
  return dt;
}

/**
 * Full WebGPU/TSL Ironport terrain material preserving:
 *   - Satellite albedo + `city_mask.png` trench cutout, asphalt roads, tiled sidewalks & curbs
 *   - `landclass.png` sand/meadow/forest/farmland detail + Wine Country tulip beds
 *   - Lake Superior basalt/granite oblique cliff strata + moss ledges + alpine snow sparkle
 *   - Localized wet-road puddles (roughness 0.05) ready for `unifiedPost.ts` SSR + Playkit SH9 GI!
 */
export function createApexIronportTerrainTslMaterial(
  opts: ApexIronportTerrainTslOptions,
): ApexIronportTerrainTslHandle {
  const uWet = uniform(0);
  const uPool = uniform(0);
  const uMapFade = uniform(0);
  // Keep direct Vector references so async city_mask.json & terrain meta updates flow straight to GPU!
  const uMask = uniform(opts.maskVec);
  const uTerr = uniform(opts.terrSize);
  const uTerrO = uniform(opts.terrOrigin);
  const uEdge = uniform(opts.edge);

  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.95,
    metalness: 0.0,
    alphaTest: 0.5,
  });

  const initMask = opts.maskMap?.image ? opts.maskMap : makeFallbackMaskTex();
  const wp = positionWorld;
  const camD = length(wp.sub(cameraPosition));
  const muv = wp.xz.sub(uMask.xy).div(uMask.zw);
  const inMask = muv.x.greaterThan(0.0).and(muv.x.lessThan(1.0)).and(muv.y.greaterThan(0.0)).and(muv.y.lessThan(1.0));
  const maskTexNode = tslTexture(initMask, clamp(muv, 0.0, 1.0));
  const mk4 = inMask.select(maskTexNode, vec4(0.0, 0.0, 0.0, 1.0));
  const keepTrench = inMask.and(mk4.a.lessThan(0.5)).select(float(0.0), float(1.0));

  const road = inMask.select(smoothstep(float(0.42), float(0.58), mk4.r), float(0.0));
  const walk = inMask.select(smoothstep(float(0.42), float(0.58), mk4.g).mul(float(1.0).sub(road)), float(0.0));
  const kerb = float(1.0).sub(road).mul(inMask.select(smoothstep(float(0.08), float(0.38), mk4.r), float(0.0))).mul(walk);

  const satCol = tslTexture(opts.albedoMap, uv()).rgb;
  const smoothN = normalWorld.y.lessThan(0.0).select(normalWorld.negate(), normalWorld);
  const fade = float(1.0).sub(smoothstep(float(250.0), float(1500.0), camD));
  // Lean iGPU path: 4 cheap tslNoise2 calls + real tiled grass/forest/asphalt/pave textures -> photorealistic turf & soil with ~5x faster pixel shading!
  if (opts.leanMode) {
    const macro = tslNoise2(wp.xz.div(42.0));
    const micro = tslNoise2(wp.xz.div(3.2));
    const turfFine = tslNoise2(wp.xz.div(0.85));
    const luv = wp.xz.sub(uTerrO).div(uTerr).add(0.5);
    const lc = tslTexture(opts.classMap, clamp(luv, 0.0, 1.0)).rgb;
    const fSand = lc.r;
    const fForest = lc.g;
    const fField = lc.b;
    const pId = floor(vec2(wp.x.div(260.0), wp.z.div(210.0)));
    const pHash = tslHash21(pId);
    const cropRow = sin(mix(wp.x, wp.z, step(float(0.5), pHash)).mul(1.65)).mul(0.08).add(0.95);
    const nearDetail = float(1.0).sub(smoothstep(float(85.0), float(420.0), camD));
    // Sample real PBR meadow grass & forest floor textures so hillsides and verges show organic blades, clover & soil grain (NEVER flat solid green!)
    const grassNearTex = opts.grassMap ? tslTexture(opts.grassMap, wp.xz.div(5.6)).rgb : vec3(0.24, 0.36, 0.14);
    const grassMacroTex = opts.grassMap ? tslTexture(opts.grassMap, wp.xz.div(24.0).add(vec2(0.37, 0.61))).rgb : grassNearTex;
    const grassPbr = mix(grassMacroTex, grassNearTex, nearDetail.mul(0.76).add(0.24))
      .mul(mix(vec3(0.76, 0.84, 0.68), vec3(1.14, 1.08, 0.88), macro))
      .mul(float(0.82).add(micro.mul(0.22)).add(turfFine.sub(0.5).mul(0.26).mul(nearDetail)));
    const forestPbr = (opts.forestMap ? tslTexture(opts.forestMap, wp.xz.div(6.2)).rgb : vec3(0.15, 0.22, 0.10))
      .mul(mix(vec3(0.68, 0.78, 0.62), vec3(1.06, 1.02, 0.86), macro))
      .mul(float(0.80).add(micro.mul(0.24)).add(turfFine.sub(0.5).mul(0.22).mul(nearDetail)));
    const pastureC = grassPbr.mul(vec3(0.96, 1.02, 0.90));
    const wheatC = mix(vec3(0.42, 0.37, 0.17), vec3(0.56, 0.48, 0.23), macro).mul(float(0.84).add(turfFine.mul(0.28).mul(nearDetail)));
    const soilC = mix(vec3(0.21, 0.16, 0.11), vec3(0.31, 0.24, 0.16), micro).mul(float(0.84).add(turfFine.mul(0.28).mul(nearDetail)));
    const farmC = mix(pastureC, mix(wheatC, soilC, smoothstep(float(0.68), float(0.86), pHash)), smoothstep(float(0.38), float(0.62), pHash)).mul(cropRow);
    const forestC = mix(forestPbr, grassPbr.mul(vec3(0.66, 0.78, 0.58)), float(0.24));
    const sandC = mix(vec3(0.58, 0.50, 0.35), vec3(0.72, 0.64, 0.46), micro).mul(float(0.88).add(turfFine.mul(0.20).mul(nearDetail)));
    const meadowC = grassPbr;
    const biomeBase = mix(mix(mix(meadowC, farmC, clamp(fField.mul(1.25), 0.0, 1.0)), forestC, clamp(fForest.mul(1.25), 0.0, 1.0)), sandC, clamp(fSand.mul(1.35), 0.0, 1.0));
    const satLift = satCol.mul(float(1.0).add(macro.sub(0.5).mul(0.26).mul(fade)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let col: any = mix(biomeBase, satLift, float(0.18).add(uMapFade.mul(0.26)));

    // Steep coastal basalt cliffs + alpine snow (reusing macro/micro + 1 strata noise)
    const slopeRaw = float(1.0).sub(smoothN.y);
    const steep = smoothstep(float(0.20), float(0.46), slopeRaw);
    const lumB = luminance(col);
    const snowMask = smoothstep(float(0.68), float(0.88), lumB).mul(smoothstep(float(220.0), float(340.0), wp.y));
    const rockAmt = steep.mul(float(1.0).sub(snowMask)).mul(float(1.0).sub(road));
    const strata = tslNoise2(vec2(wp.y.mul(0.28).add(macro.mul(3.5)), wp.x.sub(wp.z).div(55.0)));
    const rockC = mix(vec3(0.09, 0.095, 0.105), vec3(0.23, 0.22, 0.20), strata.mul(0.65).add(micro.mul(0.35)))
      .mul(clamp(lumB.div(0.32), 0.65, 1.05));
    col = mix(col, rockC, rockAmt);

    // City sidewalks, curbs & asphalt roads (reusing single asphaltMap fetch + paveMap fetch)
    const paveTile = tslTexture(opts.paveMap, wp.xz.div(2.2)).rgb.mul(float(0.86).add(micro.mul(0.20)));
    col = mix(col, paveTile.mul(0.88), walk);
    col = mix(col, vec3(0.46, 0.45, 0.43).mul(float(0.84).add(micro.mul(0.26))), kerb);
    const asph = tslTexture(opts.asphaltMap, wp.xz.div(4.5)).rgb.mul(float(0.88).add(micro.mul(0.22)));
    col = mix(col, asph.mul(1.10), road);

    const gPud = smoothstep(float(0.56), float(0.72), macro).mul(uPool).mul(road);
    const gWet = uWet.mul(max(road, walk.mul(0.7)));
    col = col.mul(float(1.0).sub(gWet.mul(0.26))).mul(float(1.0).sub(gPud.mul(0.30))).mul(float(1.0).sub(uWet.mul(0.14)));

    let rough = mix(float(0.94), float(0.72), rockAmt);
    rough = mix(rough, float(0.45), snowMask);
    rough = mix(rough, float(0.84), road);
    rough = mix(rough, float(0.42), gWet);
    rough = mix(rough, float(0.05), gPud);

    const edgeFade = mix(
      float(1.0),
      smoothstep(float(0.0), float(1300.0), min(uEdge.x.sub(abs(wp.x.sub(uTerrO.x))), uEdge.y.sub(abs(wp.z.sub(uTerrO.y))))),
      uMapFade,
    );
    col = mix(vec3(0.031, 0.067, 0.110), col, edgeFade);

    void modelWorldMatrix; void positionView;
    mat.colorNode = col;
    mat.roughnessNode = clamp(rough, 0.04, 0.98);
    mat.metalnessNode = mix(float(0.0), float(0.06), gPud);
    mat.opacityNode = keepTrench;
    if (opts.gi) {
      enhanceMaterialWithPlaykitGi(mat, opts.gi, { detailStrength: 0, giBounceStrength: 0.16 });
    }
    return {
      material: mat,
      uniforms: { uWet, uPool, uMapFade },
      setMaskTexture: (tex: THREE.Texture) => { maskTexNode.value = tex; },
    };
  }
  const macro = tslNoise2(wp.xz.div(55.0)).mul(0.6).add(tslNoise2(wp.xz.div(17.0)).mul(0.4));
  const micro = tslNoise2(wp.xz.div(2.8)).mul(0.55).add(tslNoise2(wp.xz.div(0.85)).mul(0.45));

  // Biome-true procedural Michigan landscape + real tiled PBR meadow/forest textures!
  const luv = wp.xz.sub(uTerrO).div(uTerr).add(0.5);
  const lc = tslTexture(opts.classMap, clamp(luv, 0.0, 1.0)).rgb;
  const fSand = lc.r;
  const fForest = lc.g;
  const fField = lc.b;
  const pId = floor(vec2(wp.x.div(260.0), wp.z.div(210.0)));
  const pHash = tslHash21(pId);
  const cropRow = sin(mix(wp.x, wp.z, step(float(0.5), pHash)).mul(1.65)).mul(0.08).add(0.96);
  const nearDetailHi = float(1.0).sub(smoothstep(float(95.0), float(460.0), camD));
  const grassPbrHi = (opts.grassMap ? mix(tslTexture(opts.grassMap, wp.xz.div(24.0)).rgb, tslTexture(opts.grassMap, wp.xz.div(5.6)).rgb, nearDetailHi.mul(0.78).add(0.22)) : mix(vec3(0.19, 0.34, 0.14), vec3(0.29, 0.44, 0.18), macro))
    .mul(mix(vec3(0.78, 0.85, 0.70), vec3(1.12, 1.07, 0.88), macro))
    .mul(float(0.84).add(micro.mul(0.30)));
  const forestPbrHi = (opts.forestMap ? tslTexture(opts.forestMap, wp.xz.div(6.2)).rgb : mix(vec3(0.11, 0.20, 0.09), vec3(0.19, 0.28, 0.13), macro))
    .mul(float(0.82).add(micro.mul(0.30)));
  const pastureC = grassPbrHi.mul(vec3(0.96, 1.02, 0.90));
  const wheatC = mix(vec3(0.46, 0.41, 0.20), vec3(0.58, 0.50, 0.25), macro);
  const soilC = mix(vec3(0.24, 0.19, 0.13), vec3(0.32, 0.25, 0.17), micro);
  const farmC = mix(pastureC, mix(wheatC, soilC, smoothstep(float(0.68), float(0.86), pHash)), smoothstep(float(0.38), float(0.62), pHash)).mul(cropRow);
  const forestC = mix(forestPbrHi, grassPbrHi.mul(vec3(0.66, 0.78, 0.58)), float(0.24));
  const sandC = mix(vec3(0.62, 0.54, 0.38), vec3(0.74, 0.66, 0.48), micro);
  const meadowC = grassPbrHi;
  const biomeBase = mix(mix(mix(meadowC, farmC, clamp(fField.mul(1.25), 0.0, 1.0)), forestC, clamp(fForest.mul(1.25), 0.0, 1.0)), sandC, clamp(fSand.mul(1.35), 0.0, 1.0));
  const satLift = satCol.mul(float(1.0).add(macro.sub(0.5).mul(0.28).mul(fade)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let col: any = mix(biomeBase, satLift, float(0.18).add(uMapFade.mul(0.26)));

  // Wine Country tulip flower rows
  const chroma = max(satCol.r, max(satCol.g, satCol.b)).sub(min(satCol.r, min(satCol.g, satCol.b)));
  const isTulipZone = wp.z.lessThan(-4200.0).and(wp.y.lessThan(140.0))
    .and(chroma.greaterThan(0.18)).and(satCol.g.lessThan(max(satCol.r, satCol.b).mul(0.90)));
  const tNear = float(1.0).sub(smoothstep(float(120.0), float(680.0), camD)).mul(smoothstep(float(0.18), float(0.32), chroma));
  const tRow = sin(wp.x.mul(5.2).add(tslNoise2(wp.xz.div(18.0)).mul(1.6))).mul(0.5).add(0.5);
  const tBloom = smoothstep(float(0.26), float(0.72), tslNoise2(wp.xz.mul(3.1)).mul(0.65).add(tslNoise2(wp.xz.mul(9.5)).mul(0.35)));
  const tSpeck = tslNoise2(wp.xz.mul(12.0));
  const tulipCol = mix(vec3(0.05, 0.14, 0.04).mul(float(0.7).add(tSpeck.mul(0.5))), satCol.mul(float(0.78).add(tSpeck.mul(0.52))), tBloom.mul(float(0.28).add(tRow.mul(0.72))));
  col = mix(col, tulipCol, isTulipZone.select(tNear.mul(0.92), float(0.0)));

  // Dramatic dark Lake Superior basalt/granite coastal cliffs + mossy ledges
  const warpLo = tslNoise2(wp.xz.div(65.0)).mul(14.0).add(tslNoise2(wp.xz.div(19.0)).mul(4.2));
  const slopeRaw = float(1.0).sub(smoothN.y);
  const steep = smoothstep(float(0.20), float(0.46), slopeRaw.add(tslNoise2(wp.xz.div(24.0)).sub(0.5).mul(0.10)));
  const lumB = luminance(col);
  const snowMask = smoothstep(float(0.68), float(0.88), lumB).mul(smoothstep(float(220.0), float(340.0), wp.y));
  const rockAmt = steep.mul(float(1.0).sub(snowMask)).mul(float(1.0).sub(road));

  const yStrata = wp.y.mul(0.34).add(wp.x.mul(0.045)).sub(wp.z.mul(0.035)).add(warpLo);
  const strata = smoothstep(float(0.15), float(0.85), tslNoise2(vec2(yStrata.mul(0.85), wp.x.sub(wp.z).div(55.0))));
  const rockUv = vec2(wp.x.mul(0.75).add(wp.z.mul(0.66)), wp.y.mul(0.95));
  const crag = tslNoise2(rockUv.div(11.0));
  const vertCrack = tslNoise2(vec2(rockUv.x.div(3.4), rockUv.y.div(14.0).add(crag.mul(2.4))));
  const microF = tslNoise2(rockUv.div(2.2).add(4.1));
  const fissure = smoothstep(float(0.20), float(0.46), vertCrack.mul(0.62).add(microF.mul(0.38)));
  const blot = tslNoise2(vec2(wp.x.sub(wp.z), wp.y.mul(0.4)).div(28.0));
  let rockC = mix(
    vec3(0.085, 0.092, 0.102),
    mix(vec3(0.21, 0.21, 0.215), vec3(0.27, 0.21, 0.16), smoothstep(float(0.42), float(0.82), blot)),
    strata.mul(0.48).add(crag.mul(0.34)).add(microF.mul(0.18)),
  ).mul(float(0.48).add(fissure.mul(0.62))).mul(clamp(lumB.div(0.32), 0.62, 1.05));
  const mossK = smoothstep(float(0.54), float(0.78), smoothN.y.add(crag.sub(0.5).mul(0.22)))
    .mul(smoothstep(float(260.0), float(130.0), wp.y))
    .mul(float(1.0).sub(smoothstep(float(10.0), float(4.0), wp.y)));
  rockC = mix(rockC, vec3(0.07, 0.12, 0.055), mossK.mul(0.58));
  col = mix(col, rockC, rockAmt);

  // City streets, concrete sidewalks, curbs & urban parcels/plazas/lawns beyond the track
  const urbanParcelMask = inMask.select(
    float(1.0).sub(clamp(road.add(walk), 0.0, 1.0)).mul(float(1.0).sub(smoothstep(float(280.0), float(1400.0), camD))),
    float(0.0),
  );
  const satChroma = max(satCol.r, max(satCol.g, satCol.b)).sub(min(satCol.r, min(satCol.g, satCol.b)));
  const satGreen = clamp(satCol.g.sub(max(satCol.r, satCol.b)).mul(6.5), 0.0, 1.0);
  const hardLot = smoothstep(float(0.11), float(0.04), satChroma).mul(float(1.0).sub(satGreen));
  const lotGrid = fract(wp.xz.div(4.5));
  const lotSeam = float(1.0).sub(smoothstep(float(0.0), float(0.032), min(min(lotGrid.x, float(1.0).sub(lotGrid.x)), min(lotGrid.y, float(1.0).sub(lotGrid.y)))));
  const lotPave = tslTexture(opts.paveMap, wp.xz.div(3.6)).rgb
    .mul(float(0.86).add(tslNoise2(wp.xz.div(16.0)).mul(0.28)))
    .mul(float(1.0).sub(lotSeam.mul(0.22)));
  const parkStripe = sin(wp.x.mul(1.15).add(wp.z.mul(0.35))).mul(0.065).add(1.0);
  const parkGrain = float(0.84).add(tslNoise2(wp.xz.div(1.9)).mul(0.32));
  const parkCol = satCol.mul(parkStripe).mul(parkGrain);
  const urbanCol = mix(parkCol, mix(satCol.mul(0.55).add(lotPave.mul(0.45)), lotPave.mul(0.86), 0.52), hardLot);
  col = mix(col, urbanCol, urbanParcelMask.mul(0.82));

  const slabF = fract(wp.xz.div(1.7));
  const joint = float(1.0).sub(smoothstep(float(0.0), float(0.045), min(min(slabF.x, float(1.0).sub(slabF.x)), min(slabF.y, float(1.0).sub(slabF.y)))));
  const stain = float(0.84).add(tslNoise2(wp.xz.div(9.5)).mul(0.24));
  const paveTile = tslTexture(opts.paveMap, wp.xz.div(1.7)).rgb
    .mul(float(0.84).add(tslHash21(floor(wp.xz.div(1.7))).mul(0.20)))
    .mul(stain)
    .mul(float(1.0).sub(joint.mul(0.28).mul(float(1.0).sub(smoothstep(float(25.0), float(85.0), camD)))));
  col = mix(col, paveTile.mul(0.88), walk);

  const kerbCol = vec3(0.46, 0.45, 0.43)
    .mul(float(0.78).add(tslNoise2(wp.xz.div(0.85)).mul(0.34)))
    .mul(float(0.88).add(tslNoise2(wp.xz.div(3.1)).mul(0.20)));
  col = mix(col, kerbCol, kerb);

  const a1 = tslTexture(opts.asphaltMap, wp.xz.div(3.2)).rgb;
  const a2 = tslTexture(opts.asphaltMap, wp.xz.div(12.5).add(0.37)).rgb;
  const cellN = tslHash21(floor(wp.xz.div(6.0)));
  const cellM = tslHash21(floor(wp.xz.div(23.0)));
  const asph = mix(a1, a1.mul(float(0.55).add(a2.mul(0.9))), 0.55)
    .mul(float(0.86).add(cellN.mul(0.18)))
    .mul(float(0.88).add(cellM.mul(0.18)))
    .mul(float(1.0).sub(smoothstep(float(0.78), float(0.98), cellN).mul(smoothstep(float(0.3), float(0.9), a2.r)).mul(0.22)));
  col = mix(col, asph.mul(1.12), road);

  // Localized road puddles (0.05 roughness so unifiedPost SSR mirrors skyscrapers & streetlights!)
  const pudMacro = tslNoise2(wp.xz.div(14.5)).mul(0.65).add(tslNoise2(wp.xz.div(5.2).add(7.3)).mul(0.35));
  const gPud = smoothstep(float(0.54), float(0.70), pudMacro).mul(uPool).mul(road).mul(float(1.0).sub(smoothstep(float(600.0), float(1400.0), camD)));
  const gWet = uWet.mul(max(road, walk.mul(0.7)));
  col = col.mul(float(1.0).sub(gWet.mul(0.26))).mul(float(1.0).sub(gPud.mul(0.30))).mul(float(1.0).sub(uWet.mul(0.14)));

  const rockR = mix(float(0.94), float(0.56), fissure.mul(float(0.35).add(blot.mul(0.65)))).mul(float(1.0).sub(uWet.mul(0.52)));
  let rough = mix(float(0.94), rockR, rockAmt);
  rough = mix(rough, float(0.45), snowMask);
  rough = mix(rough, float(0.84), road);
  rough = mix(rough, float(0.42), gWet);
  rough = mix(rough, float(0.05), gPud);

  const edgeFade = mix(
    float(1.0),
    smoothstep(float(0.0), float(1300.0), min(uEdge.x.sub(abs(wp.x.sub(uTerrO.x))), uEdge.y.sub(abs(wp.z.sub(uTerrO.y))))),
    uMapFade,
  );
  // Blend outer region rim smoothly into mapBackdrop navy (#08111c) in Map Overview so terrain stays 100% opaque (zero depth/sorting artifacts!)
  col = mix(vec3(0.031, 0.067, 0.110), col, edgeFade);

  // Keep classMap reference ready for future biome-array extension
  void opts.classMap; void uTerr; void modelWorldMatrix; void positionView;

  mat.colorNode = col;
  mat.roughnessNode = clamp(rough, 0.04, 0.98);
  mat.metalnessNode = mix(float(0.0), float(0.06), gPud);
  mat.opacityNode = keepTrench;
  if (opts.shared) {
    mat.emissiveNode = apexHeadlightSpotTsl(opts.shared, col);
  }

  if (opts.gi) {
    enhanceMaterialWithPlaykitGi(mat, opts.gi, { detailStrength: 0.14, detailTiling: 6.5, giBounceStrength: 0.18 });
  }

  return {
    material: mat,
    uniforms: { uWet, uPool, uMapFade },
    setMaskTexture: (tex: THREE.Texture) => {
      maskTexNode.value = tex;
    },
  };
}
