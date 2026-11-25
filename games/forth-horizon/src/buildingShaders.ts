/**
 * buildingShaders.ts — Next-Gen Architectural Photorealism Shaders for Ironport & Regional Towns.
 *
 * Engineered to make browser architecture look crisp, reflective, grounded, and layered:
 *  1. True Sky-Mirror + Cloud + Sun-Disk Specular Glass (`patchGlassInterior`):
 *     - Dielectric low-E plate glass with per-pane micro-warped normals (tempered architectural glass
 *       never reflects like a single flat CG plane — every pane catches a subtly shifted slice of sky,
 *       clouds, city-canyon dark horizon reflection, and golden sun glint).
 *     - Real-time Ray-Box 3D Interior Mapping behind every pane (lit office ceiling troffers, warm/cool
 *       office interiors, drawn Venetian blinds, deep ground-floor commercial storefronts, warm dusk/golden
 *       hour interior glow that makes skyscrapers feel genuinely alive).
 *  2. Crisp Photographic Masonry & Hero Facades (`patchFacadeMasonry`):
 *     - textureGrad steep parallax (zero D3D11 X3595 warnings), mortar/crevice micro-AO, rainwater streak
 *       weathering, curb splash patina, per-building tonal breakup, subtle architectural shadow-bounce,
 *       and smart glass/masonry separation on hero landmark facade sheets.
 *     - Exponential aerial perspective scattering (warm sun-haze toward the sun, cool blue-silver mist
 *       away from the sun) so foreground, mid-ground, and skyline towers separate with cinematic depth.
 *  3. Legacy v1 Punched Windows (`patchPunchedInterior`):
 *     - Used ONLY on windowless v1 boxes (never stacked over v3 buildings that already have real 3D windows).
 */
import * as THREE from 'three';
import {
  PK_WEBGL_GI_PARS,
  buildPlaykitGiInjectGlsl,
  type PlaykitWebGLGiUniforms,
} from '../../../playkit/render/webglLighting';

const SHARED_GLSL = `
float bh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float bvn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh3(i), bh3(i + vec3(1, 0, 0)), f.x), mix(bh3(i + vec3(0, 1, 0)), bh3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bh3(i + vec3(0, 0, 1)), bh3(i + vec3(1, 0, 1)), f.x), mix(bh3(i + vec3(0, 1, 1)), bh3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Procedural sky + wispy cloud + city-canyon reflection + warm sun-disk glint for architectural glass
vec3 archSkyReflection(vec3 refl, vec3 sunDir, float nightK, vec2 paneRand) {
  float ry = refl.y;
  // Below horizon: reflected dark urban canyon & warm sunlit street bounce (never empty void!)
  vec3 canyon = mix(vec3(0.06, 0.075, 0.095), vec3(0.24, 0.22, 0.20), smoothstep(-0.45, 0.0, ry));
  // Above horizon: vivid architectural sky dome (warm luminous horizon -> rich cerulean/cobalt zenith)
  vec3 horizDay = mix(vec3(0.86, 0.80, 0.72), vec3(0.76, 0.84, 0.94), clamp(sunDir.y * 1.4, 0.0, 1.0));
  vec3 zenithDay = mix(vec3(0.22, 0.42, 0.72), vec3(0.18, 0.38, 0.74), clamp(sunDir.y * 1.3, 0.0, 1.0));
  vec3 skyCol = mix(horizDay, zenithDay, smoothstep(0.0, 0.62, ry));
  // Soft sunlit cloud bands mirrored across tall glass facades
  if (ry > 0.02) {
    vec2 clUv = refl.xz / (ry + 0.22) * 0.65 + paneRand * 0.05;
    float cl = bvn(vec3(clUv * 1.8, 1.7)) * 0.62 + bvn(vec3(clUv * 4.3, 4.1)) * 0.38;
    float clMask = smoothstep(0.46, 0.78, cl) * smoothstep(0.02, 0.24, ry);
    vec3 clCol = mix(vec3(0.95, 0.90, 0.84), vec3(1.0, 0.97, 0.92), clamp(sunDir.y * 1.4, 0.0, 1.0));
    skyCol = mix(skyCol, clCol, clMask * 0.58);
  }
  vec3 envDay = mix(canyon, skyCol, smoothstep(-0.04, 0.06, ry));
  // Crisp golden/white sun specular glint across angled panes
  float sDot = max(dot(refl, normalize(sunDir)), 0.0);
  vec3 sunTint = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.96, 0.88), clamp(sunDir.y * 1.8, 0.0, 1.0));
  vec3 sunGlint = sunTint * (pow(sDot, 42.0) * 1.45 + pow(sDot, 6.0) * 0.24);
  vec3 envNight = mix(vec3(0.03, 0.04, 0.07), vec3(0.07, 0.10, 0.18), smoothstep(-0.1, 0.6, ry));
  return mix(envDay + sunGlint, envNight, nightK);
}
// Exponential aerial perspective scattering to separate foreground, mid-ground, and skyline layers
vec3 applyAerialDepth(vec3 col, vec3 fw, vec3 sunDir, float dist, float nightK) {
  float hFade = smoothstep(140.0, 1450.0, dist);
  if (hFade <= 0.001) return col;
  vec3 viewDir = normalize(fw - cameraPosition);
  float sunAlign = pow(max(dot(viewDir, normalize(sunDir)), 0.0), 4.0);
  vec3 coolMist = mix(vec3(0.54, 0.65, 0.78), vec3(0.50, 0.64, 0.82), clamp(sunDir.y * 1.3, 0.0, 1.0));
  vec3 warmHaze = mix(vec3(0.86, 0.72, 0.56), vec3(0.76, 0.82, 0.90), clamp(sunDir.y * 1.6, 0.0, 1.0));
  vec3 hazeDay = mix(coolMist, warmHaze, sunAlign * 0.65);
  vec3 hazeNight = vec3(0.05, 0.075, 0.13);
  vec3 hazeCol = mix(hazeDay, hazeNight, nightK);
  // Subtle height-aware mist (denser near river/street level, crisper near spire tops)
  float heightMod = 1.0 - 0.28 * smoothstep(35.0, 180.0, fw.y);
  float k = clamp(hFade * 0.42 * heightMod, 0.0, 0.48);
  return mix(col, hazeCol, k);
}
// Ray-box 3D interior room projection behind a window pane (uv01 in [0,1]^2, viewT = view ray going INTO room)
void interiorRoom(vec2 uv01, vec2 roomId, vec3 viewT, float nightK, float isStore, out vec3 roomCol, out vec3 roomEmis) {
  float r1 = bh2(roomId), r2 = bh2(roomId + 13.7), r3 = bh2(roomId + 29.3);
  float depth = mix(0.76, 1.25, isStore);
  vec3 rd = vec3(viewT.x, viewT.y, max(0.09, viewT.z));
  float tz = depth / rd.z;
  float tx = ((rd.x > 0.0 ? 1.0 : 0.0) - uv01.x) / (rd.x + (rd.x >= 0.0 ? 1e-4 : -1e-4));
  float ty = ((rd.y > 0.0 ? 1.0 : 0.0) - uv01.y) / (rd.y + (rd.y >= 0.0 ? 1e-4 : -1e-4));
  float t = min(tz, min(tx, ty));
  vec3 hit = vec3(uv01.x + rd.x * t, uv01.y + rd.y * t, rd.z * t);
  bool isBack = (tz <= tx && tz <= ty);
  bool isCeil = (!isBack && ty <= tx && rd.y > 0.0);
  bool isFloor = (!isBack && ty <= tx && rd.y <= 0.0);

  // Authentic architectural interior palette (warm plaster, wood loft, cool concrete office, warm retail)
  vec3 wallA = mix(vec3(0.32, 0.29, 0.25), vec3(0.20, 0.23, 0.27), r1);
  vec3 wallB = mix(vec3(0.36, 0.28, 0.21), vec3(0.16, 0.18, 0.21), r2);
  vec3 wallBase = mix(wallA, wallB, step(0.5, r3));
  if (isStore > 0.5) wallBase = mix(vec3(0.42, 0.34, 0.24), vec3(0.28, 0.31, 0.35), r1);

  float shade = 1.0;
  float lightPanel = 0.0;
  vec3 surf = wallBase;
  if (isCeil) {
    surf = vec3(0.34, 0.34, 0.35);
    vec2 cg = fract(vec2(hit.x * 2.0, hit.z / depth * 2.0));
    lightPanel = smoothstep(0.16, 0.25, cg.x) * (1.0 - smoothstep(0.75, 0.84, cg.x))
               * smoothstep(0.20, 0.29, cg.y) * (1.0 - smoothstep(0.71, 0.80, cg.y));
    shade = 0.88;
  } else if (isFloor) {
    surf = mix(vec3(0.10, 0.09, 0.08), vec3(0.16, 0.13, 0.10), r2);
    shade = 0.58;
  } else if (isBack) {
    float desk = smoothstep(0.30, 0.35, hit.y);
    float frame = step(0.14, abs(hit.x - (0.28 + 0.44 * r2)));
    surf *= (0.64 + 0.36 * desk) * (0.82 + 0.18 * frame);
    shade = 0.78 + 0.22 * smoothstep(0.0, 0.72, hit.y);
  } else {
    shade = 0.48 + 0.44 * (1.0 - hit.z / depth);
  }
  float edgeAO = smoothstep(0.0, 0.14, min(hit.x, 1.0 - hit.x)) * smoothstep(0.0, 0.14, min(hit.y, 1.0 - hit.y));
  surf *= shade * (0.56 + 0.44 * edgeAO);

  // Daytime + golden-hour interior lights: real offices have ~36% warm/neutral lights visible even in daylight!
  float occProb = mix(0.36 + nightK * 0.38, 0.72 + nightK * 0.24, isStore);
  float isLit = step(1.0 - occProb, bh2(roomId + 41.3));
  vec3 lampTint = mix(vec3(1.0, 0.80, 0.50), vec3(0.88, 0.94, 1.0), step(0.68, r3) * (1.0 - isStore * 0.72));
  float dayDepth = mix(0.38, 0.68, isStore) * (0.45 + 0.55 * isLit);
  float nightBoost = isLit * (nightK * mix(1.55, 2.35, isStore) + mix(0.34, 0.55, isStore) * (1.0 - nightK));

  // Venetian blinds / roller shades drawn to random heights on upper windows
  float hasBlind = step(0.56, r2) * (1.0 - isStore);
  float blindDrop = 0.18 + 0.44 * r1;
  float inBlind = hasBlind * step(1.0 - blindDrop, uv01.y);
  float slats = 0.78 + 0.22 * sin(uv01.y * 58.0);
  vec3 blindCol = mix(vec3(0.24, 0.23, 0.22), vec3(0.46, 0.42, 0.36), r3) * slats;

  vec3 litRoom = surf * (dayDepth + nightBoost * lampTint * (0.78 + 0.48 * r1)) + lampTint * lightPanel * (0.28 + nightBoost * 1.25);
  roomCol = mix(litRoom, blindCol * (0.68 + 0.32 * nightBoost * lampTint), inBlind * 0.85);
  roomEmis = mix(
    (surf * 0.36 + vec3(lightPanel * 0.92)) * lampTint * nightBoost * (0.26 + 0.74 * nightK),
    lampTint * nightBoost * 0.16 * nightK,
    inBlind * 0.82
  );
}
vec3 facadeWeatherAAA(vec3 col, vec3 fw, vec3 wn, float dist, float wet, out float microGrain) {
  float nearK = 1.0 - smoothstep(32.0, 145.0, dist);
  // Per-building block tonal & warm/cool age variation so neighbouring towers feel hand-crafted
  vec2 bId = floor(fw.xz / 24.0);
  float bVar = bh2(bId);
  float bWarm = bh2(bId + 19.3);
  col *= (0.91 + 0.19 * bVar) * mix(vec3(0.96, 0.98, 1.03), vec3(1.04, 1.00, 0.95), bWarm);

  // Subtle grounded street-canyon ambient occlusion (bottom 0..16m darker, upper stories sunlit & crisp)
  float canyonAO = mix(0.72, 1.06, smoothstep(0.0, 18.0, fw.y));
  // Architectural curb splash grime (0..3.0m) + subtle rainwater streaks under ledges
  float lowN = 0.5;
  float runoff = 0.0;
  if (dist < 240.0) {
    lowN = bvn(fw * vec3(0.32, 0.14, 0.32));
    float streak = bvn(vec3((fw.x + fw.z) * 0.48, fw.y * 0.05, 3.1));
    runoff = smoothstep(0.58, 0.92, streak) * 0.18 * smoothstep(2.8, 18.0, fw.y) * (1.0 - abs(wn.y));
  }
  float splash = (1.0 - smoothstep(0.0, 3.2, fw.y)) * (0.45 + 0.55 * lowN);
  float dirt = clamp(splash * 0.52 + runoff, 0.0, 0.65);

  // Crisp photographic tonal curve: deepen dark mortar crevices & preserve rich brick/stone/terracotta hue
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float mortarAO = smoothstep(0.06, 0.48, lum);
  col = mix(vec3(lum), col, 0.94) * (0.76 + 0.36 * mortarAO);
  col *= canyonAO * (1.0 - 0.34 * dirt);
  col = mix(col, col * vec3(0.78, 0.77, 0.74), dirt * 0.42);

  microGrain = 0.5;
  if (nearK > 0.01) {
    microGrain = bvn(fw * 5.2) * 0.55 + bvn(fw * 19.0) * 0.45;
    col *= 1.0 + (microGrain - 0.5) * 0.32 * nearK;
  }
  col *= 1.0 - 0.26 * wet * (0.55 + 0.45 * lowN);
  return col;
}
`;

export interface FacadeV4Maps {
  /** Neural Depth Anything V2 architectural height map (white = proud / extruded, black = recessed) */
  heightMap?: THREE.Texture | null;
  /** Neural calibrated ORM map: R = Cavity/Micro-AO, G = Toksvig-filtered Physical Roughness, B = Metalness */
  ormMap?: THREE.Texture | null;
  /** Parallax relief depth in metres (default 0.28 for hero facades, 0.16 for shared masonry) */
  parallaxDepth?: number;
}

/**
 * Masonry, brick, concrete, steel, wood, and hero landmark facades:
 * - textureGrad steep parallax occlusion mapping (true neural height map on v4; luminance fallback on v1/v3; zero D3D11 X3595 warnings)
 * - directional parallax self-shadowing + neural ORM (cavity AO, Toksvig-filtered roughness, physical metalness)
 * - mortar/stone crevice contrast, street-canyon AO, rainwater streaks, per-building tonal breakup
 * - hero landmark sheets separate reflective sky-mirror windows + warm office glow from matte masonry
 * - exponential aerial perspective depth scattering
 */
export function patchFacadeMasonry(
  mat: THREE.MeshStandardMaterial,
  isHero: boolean,
  wetU: { value: number },
  nightU: { value: number },
  sunDirU?: { value: THREE.Vector3 },
  v4?: FacadeV4Maps,
  gi?: PlaykitWebGLGiUniforms
): void {
  if (isHero) mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 1.0, 2.6);
  const sDirU = sunDirU ?? { value: new THREE.Vector3(-0.7, 0.45, -0.2).normalize() };
  const hMap = v4?.heightMap ?? null;
  const oMap = v4?.ormMap ?? null;
  const hasH = !!hMap;
  const hasO = !!oMap;
  const hasGi = !!gi;
  const pomDepth = v4?.parallaxDepth ?? (isHero ? 0.28 : 0.16);
  mat.userData.v4HeightKey = hMap ? String(hMap.userData?.srcKey ?? hMap.uuid) : '';
  mat.userData.v4OrmKey = oMap ? String(oMap.userData?.srcKey ?? oMap.uuid) : '';
  if (hasGi) mat.userData.__playkitWebglGi = true;

  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uWetF = wetU;
    sh.uniforms.uNightF = nightU;
    sh.uniforms.uSunF = sDirU;
    if (gi) Object.assign(sh.uniforms, gi);
    if (hasH) {
      sh.uniforms.uHeightMap = { value: hMap };
      sh.uniforms.uPomDepth = { value: pomDepth };
    }
    if (hasO) {
      sh.uniforms.uOrmMap = { value: oMap };
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;\nvarying vec3 vFWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 fwp = vec4(position, 1.0);
        mat3 fnm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
        fwp = instanceMatrix * fwp;
        fnm = fnm * mat3(instanceMatrix);
        #endif
        #ifdef USE_BATCHING
        fwp = batchingMatrix * fwp;
        fnm = fnm * mat3(batchingMatrix);
        #endif
        vFW = (modelMatrix * fwp).xyz;
        vFWN = fnm * normal;`);

    const v4UniformDecls = (hasH ? 'uniform sampler2D uHeightMap;\nuniform float uPomDepth;\n' : '') + (hasO ? 'uniform sampler2D uOrmMap;\n' : '');
    const pomBlock = hasH ? `
        vec2 pUv = vMapUv;
        vec2 pDUx = dFdx(vMapUv), pDUy = dFdy(vMapUv);
        float fMicro = 0.5;
        float heroGlass = 0.0;
        float pomShadow = 1.0;
        {
          float pDist = length(vViewPosition);
          float pFade = 1.0 - smoothstep(${isHero ? '42.0, 108.0' : '20.0, 68.0'}, pDist);
          if (pFade > 0.02) {
            vec3 pN = normalize(vNormal);
            mat3 pT = getTangentFrame(-vViewPosition, pN, vMapUv);
            vec3 pV = normalize(vViewPosition);
            vec3 pt = vec3(dot(pV, pT[0]), dot(pV, pT[1]), dot(pV, pT[2]));
            float uvA = dot(pDUx, pDUx) + dot(pDUy, pDUy);
            float pA = dot(dFdx(vViewPosition), dFdx(vViewPosition)) + dot(dFdy(vViewPosition), dFdy(vViewPosition));
            float upm = sqrt(uvA / max(pA, 1e-8));
            vec2 pDir = pt.xy / max(pt.z, 0.38) * (uPomDepth * upm) * pFade;
            const float LAY = ${isHero ? '4.0' : '3.0'};
            vec2 pStep = pDir / LAY;
            float cur = 0.0, prevCur = 0.0;
            vec2 uvc = vMapUv, prevUv = vMapUv;
            float hmap = 1.0 - textureGrad(uHeightMap, uvc, pDUx, pDUy).r;
            float prevH = hmap;
            for (int i = 0; i < ${isHero ? '4' : '3'}; i++) {
              if (cur >= hmap) break;
              prevUv = uvc; prevCur = cur; prevH = hmap;
              uvc -= pStep;
              cur += 1.0 / LAY;
              hmap = 1.0 - textureGrad(uHeightMap, uvc, pDUx, pDUy).r;
            }
            // Linear secant refinement between last two steps eliminates grazing-angle stair-stepping
            float afterD = hmap - cur;
            float beforeD = prevH - prevCur;
            float wt = clamp(afterD / min(-1e-4, afterD - beforeD), 0.0, 1.0);
            pUv = mix(uvc, prevUv, wt);
            // 1-tap directional micro-shadow along sun vector in tangent space (near camera only)
            if (pFade > 0.18) {
              vec3 sV = normalize((viewMatrix * vec4(normalize(uSunF), 0.0)).xyz);
              vec3 st = vec3(dot(sV, pT[0]), dot(sV, pT[1]), dot(sV, pT[2]));
              if (st.z > 0.08) {
                vec2 sStep = st.xy / max(st.z, 0.42) * (uPomDepth * 0.55 * upm) * pFade;
                float hHere = textureGrad(uHeightMap, pUv, pDUx, pDUy).r;
                float hSun = textureGrad(uHeightMap, pUv + sStep, pDUx, pDUy).r;
                pomShadow = 1.0 - clamp((hSun - hHere) * 1.95 * pFade, 0.0, 0.36);
              }
            }
          }
        }` : `
        vec2 pUv = vMapUv;
        vec2 pDUx = dFdx(vMapUv), pDUy = dFdy(vMapUv);
        float fMicro = 0.5;
        float heroGlass = 0.0;
        float pomShadow = 1.0;
        {
          float pDist = length(vViewPosition);
          float pFade = 1.0 - smoothstep(42.0, 132.0, pDist);
          if (pFade > 0.02) {
            vec3 pN = normalize(vNormal);
            mat3 pT = getTangentFrame(-vViewPosition, pN, vMapUv);
            vec3 pV = normalize(vViewPosition);
            vec3 pt = vec3(dot(pV, pT[0]), dot(pV, pT[1]), dot(pV, pT[2]));
            float uvA = dot(pDUx, pDUx) + dot(pDUy, pDUy);
            float pA = dot(dFdx(vViewPosition), dFdx(vViewPosition)) + dot(dFdy(vViewPosition), dFdy(vViewPosition));
            float upm = sqrt(uvA / max(pA, 1e-8));
            vec2 pDir = pt.xy / max(pt.z, 0.35) * (0.22 * upm) * pFade;
            const float LAY = 4.0;
            vec2 pStep = pDir / LAY;
            float cur = 0.0;
            vec2 uvc = vMapUv;
            float hmap = 1.0 - smoothstep(0.08, 0.62, dot(textureGrad(map, uvc, pDUx, pDUy).rgb, vec3(0.299, 0.587, 0.114)));
            for (int i = 0; i < 4; i++) {
              if (cur >= hmap) break;
              uvc -= pStep;
              cur += 1.0 / LAY;
              hmap = 1.0 - smoothstep(0.08, 0.62, dot(textureGrad(map, uvc, pDUx, pDUy).rgb, vec3(0.299, 0.587, 0.114)));
            }
            pUv = uvc;
          }
        }`;

    const ormSample = hasO ? `
        vec3 v4Orm = textureGrad(uOrmMap, pUv, pDUx, pDUy).rgb;
        float v4Ao = clamp(v4Orm.r, 0.25, 1.0);
        float v4Rgh = clamp(v4Orm.g, 0.03, 0.98);
        float v4Mtl = clamp(v4Orm.b, 0.0, 1.0);` : '';

    const giPars = hasGi ? PK_WEBGL_GI_PARS : '';
    let fs = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFW;\nvarying vec3 vFWN;\nuniform float uWetF, uNightF;\nuniform vec3 uSunF;\n${giPars}${v4UniformDecls}${SHARED_GLSL}`)
      .replace('#include <logdepthbuf_fragment>', `#include <logdepthbuf_fragment>\n${pomBlock}`);

    const heroDetect = isHero ? `
        // Separate window glass on hero architectural facade sheets into true sky-mirror + lit office rooms
        vec3 heroGlassCol = vec3(0.18, 0.26, 0.36);
        {
          vec3 wnH = normalize(vFWN);
          float isWallH = 1.0 - smoothstep(0.35, 0.6, abs(wnH.y));
          vec3 rawC = diffuseColor.rgb;
          float maxC = max(rawC.r, max(rawC.g, rawC.b)), minC = min(rawC.r, min(rawC.g, rawC.b));
          float satH = (maxC - minC) / max(maxC, 0.05);
          float coolTint = smoothstep(rawC.r - 0.03, rawC.r + 0.06, rawC.b);
          float darkPane = 1.0 - smoothstep(0.20, 0.52, dot(rawC, vec3(0.299, 0.587, 0.114)));
          float heurGlass = clamp((1.0 - smoothstep(0.15, 0.34, satH)) * (0.42 * coolTint + 0.58 * darkPane), 0.0, 1.0);
          ${hasO
            ? 'float neuralGlass = smoothstep(0.24, 0.10, v4Rgh) * (1.0 - smoothstep(0.28, 0.50, v4Mtl));\n          heroGlass = isWallH * clamp(max(neuralGlass, heurGlass * smoothstep(0.55, 0.22, v4Rgh)), 0.0, 1.0);'
            : 'heroGlass = isWallH * heurGlass;'}
          if (heroGlass > 0.04) {
            vec3 rdH = normalize(vFW - cameraPosition);
            vec3 gNH = normalize(vec3(wnH.x, 0.0, wnH.z) + vec3(1e-5, 0.0, 0.0));
            vec2 tdH = normalize(vec2(-wnH.z, wnH.x) + vec2(1e-4));
            vec2 bIdH = floor(vec2(dot(vFW.xz, tdH) / 2.2, vFW.y / 3.6));
            vec2 pRand = vec2(bh2(bIdH + 4.3), bh2(bIdH + 11.7));
            vec3 warpNH = normalize(gNH + vec3((pRand.x - 0.5) * 0.08, (pRand.y - 0.5) * 0.06, (0.5 - pRand.x) * 0.08));
            float ndvH = clamp(dot(warpNH, -rdH), 0.0, 1.0);
            float fresH = 0.24 + 0.76 * pow(1.0 - ndvH, 2.5);
            vec3 skyReflH = archSkyReflection(reflect(rdH, warpNH), uSunF, uNightF, pRand);
            float warmLitH = step(0.64, bh2(bIdH + 17.3));
            vec3 deepRoom = mix(vec3(0.06, 0.08, 0.11), vec3(0.32, 0.25, 0.17), warmLitH * (0.45 + 0.55 * uNightF));
            heroGlassCol = mix(deepRoom, skyReflH, clamp(fresH * 0.88, 0.30, 0.92));
          }
        }` : '';

    fs = fs
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace(/vMapUv/g, 'pUv') + ormSample + heroDetect + `
        float bldDist = length(vViewPosition);
        vec3 weathered = facadeWeatherAAA(diffuseColor.rgb, vFW, normalize(vFWN), bldDist, uWetF, fMicro);
        ${hasO ? 'weathered *= mix(0.58, 1.06, v4Ao);' : ''}
        weathered *= pomShadow;
        diffuseColor.rgb = mix(
          weathered,
          ${isHero ? 'heroGlassCol' : 'diffuseColor.rgb * vec3(0.32, 0.39, 0.48)'},
          heroGlass * 0.88
        );
        /*__BLD_COL__*/`)
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace(/vRoughnessMapUv/g, 'pUv') + `
        ${hasO
          ? 'roughnessFactor = clamp(v4Rgh * (0.90 + 0.20 * fMicro), 0.03, 0.97);'
          : 'roughnessFactor = clamp(roughnessFactor * (0.82 + 0.34 * fMicro), 0.30, 0.96);'}
        roughnessFactor = mix(roughnessFactor, 0.032, heroGlass);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.44, uWetF);
        /*__BLD_RGH__*/`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        ${hasO ? 'metalnessFactor = max(metalnessFactor, v4Mtl);' : ''}
        metalnessFactor = mix(metalnessFactor, 0.16, heroGlass);
        /*__BLD_MTL__*/`)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(/vNormalMapUv/g, 'pUv') + `
        if (heroGlass > 0.05) normal = normalize(mix(normal, nonPerturbedNormal, heroGlass * 0.94));
        /*__BLD_NRM__*/`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        ${hasGi ? buildPlaykitGiInjectGlsl('1.0 - heroGlass * 0.72') : ''}`)
      .replace('#include <dithering_fragment>', `
        gl_FragColor.rgb = applyAerialDepth(gl_FragColor.rgb, vFW, uSunF, length(vViewPosition), uNightF);
        #include <dithering_fragment>`);

    if (isHero) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (heroGlass > 0.12) {
          vec3 wnE = normalize(vFWN);
          vec2 tdE = normalize(vec2(-wnE.z, wnE.x) + vec2(1e-4));
          vec2 bayId = floor(vec2(dot(vFW.xz, tdE) / 2.4, vFW.y / 3.7));
          float litH = step(1.0 - (0.28 + uNightF * 0.46), bh2(bayId + 17.3));
          vec3 warmH = mix(vec3(1.0, 0.80, 0.48), vec3(0.88, 0.94, 1.0), step(0.74, bh2(bayId + 5.1)));
          totalEmissiveRadiance += warmH * litH * heroGlass * (0.14 + uNightF * 1.15) * (0.65 + 0.70 * bh2(bayId + 9.2));
        }`);
    }

    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `${isHero ? 'hero-facade' : 'facade-masonry'}-aaa-v6-${hasH ? 'h' : '0'}${hasO ? 'o' : '0'}${hasGi ? '-gi' : ''}`;
}

/**
 * Architectural Glass Curtain-Walls & v3 Recessed 3D Windows:
 * - True dielectric low-E mirror glass reflecting sky dome, clouds, city canyon, and golden sun glints
 * - Subtle per-pane tempered-glass normal warpage so skyscrapers shimmer realistically pane-by-pane
 * - Bright, deeply parallaxed 3D Interior Mapping behind every pane (visible offices, troffers, blinds, storefronts)
 * - Clean fine mullions WITHOUT slicing thick opaque black spandrels across small v3 3D framed windows
 */
export function patchGlassInterior(
  mat: THREE.MeshStandardMaterial,
  nightU: { value: number },
  curtainU: { value: number },
  sunDirU?: { value: THREE.Vector3 },
  isV3Model = true,
  gi?: PlaykitWebGLGiUniforms
): void {
  mat.metalness = 0.14;
  mat.roughness = 0.032;
  mat.envMapIntensity = 4.2;
  mat.color.setHex(0xffffff);
  const sDirU = sunDirU ?? { value: new THREE.Vector3(-0.7, 0.45, -0.2).normalize() };
  const hasGi = !!gi;
  if (hasGi) mat.userData.__playkitWebglGi = true;
  const tintKey = /bronze/i.test(mat.name) ? 'bronze' : /cerulean/i.test(mat.name) ? 'cerulean' : 'blue';
  const tintVec = tintKey === 'bronze'
    ? 'vec3(0.92, 0.80, 0.68)'
    : tintKey === 'cerulean'
      ? 'vec3(0.76, 0.92, 1.00)'
      : 'vec3(0.78, 0.88, 0.98)';

  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNightG = nightU;
    sh.uniforms.uCurtain = curtainU;
    sh.uniforms.uSunG = sDirU;
    sh.uniforms.uIsV3 = { value: isV3Model ? 1.0 : 0.0 };
    if (gi) Object.assign(sh.uniforms, gi);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 gwp = vec4(position, 1.0);
        mat3 gnm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
        gwp = instanceMatrix * gwp;
        gnm = gnm * mat3(instanceMatrix);
        #endif
        #ifdef USE_BATCHING
        gwp = batchingMatrix * gwp;
        gnm = gnm * mat3(batchingMatrix);
        #endif
        vGW = (modelMatrix * gwp).xyz;
        vGN = gnm * normal;`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; varying vec3 vGN;
        uniform float uNightG, uCurtain, uIsV3;
        uniform vec3 uSunG;
        ${hasGi ? PK_WEBGL_GI_PARS : ''}
        ${SHARED_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 gNorm = normalize(vGN);
        float gWall = (1.0 - smoothstep(0.35, 0.6, abs(gNorm.y))) * uCurtain;
        float gGlass = 0.0, gRough = 0.032, gMetal = 0.14;
        vec3 gEmis = vec3(0.0);
        vec2 gPaneJitter = vec2(0.0);
        if (gWall > 0.01) {
          vec3 gT = normalize(vec3(-gNorm.z, 0.0, gNorm.x) + vec3(1e-5, 0.0, 0.0));
          vec3 gN = normalize(vec3(gNorm.x, 0.0, gNorm.z) + vec3(1e-5, 0.0, 0.0));
          float isGround = 1.0 - smoothstep(4.4, 5.4, vGW.y);
          vec2 baySize = mix(vec2(1.85, 3.65), vec2(3.0, 4.6), isGround);
          vec2 uvC = vec2(dot(vGW.xz, gT.xz) / baySize.x, vGW.y / baySize.y);
          vec2 f = fract(uvC), paneId = floor(uvC);
          vec2 roomId = floor(vec2(dot(vGW.xz, gT.xz) / (baySize.x * 2.0), vGW.y / baySize.y));
          float camDist = length(cameraPosition - vGW);
          float px = 1.0 / max(1.0, camDist * 0.9);
          // Slim refined architectural mullions (on v3, real 3D frames already exist, so keep shader lines razor-thin!)
          float mwBase = mix(0.032, 0.018, uIsV3);
          float mw = clamp(mwBase + px * 0.12, mwBase, 0.24);
          float mull = max(step(f.x, mw), step(1.0 - mw, f.x));
          float trans = max(step(0.96, f.y), step(f.y, 0.035));
          // Slim reflective spandrel band on high-rise curtain walls only (never heavy black bars on small v3 windows)
          float spandH = mix(0.18, 0.09, uIsV3);
          float spand = (1.0 - isGround) * smoothstep(14.0, 22.0, vGW.y) * step(f.y, spandH);
          float bars = clamp(mull + trans, 0.0, 1.0);
          gGlass = (1.0 - spand) * (1.0 - bars);

          // Per-pane tempered glass micro-warpage (creates authentic architectural sky-mirror shimmer!)
          vec2 pRand = vec2(bh2(paneId + 7.1), bh2(paneId + 19.7));
          vec3 warpN = normalize(gN + gT * ((pRand.x - 0.5) * 0.075) + vec3(0.0, (pRand.y - 0.5) * 0.055, 0.0));

          // 3D Interior Mapping raycast within 280m; vivid analytical skyline windows beyond 280m
          vec3 rdW = normalize(vGW - cameraPosition);
          vec3 rCol = vec3(0.09, 0.12, 0.16);
          vec3 rEmis = vec3(0.0);
          vec2 winUv = vec2((f.x - mw) / max(1.0 - 2.0 * mw, 0.1), clamp((f.y - spand * spandH) / max(1.0 - spand * spandH, 0.1), 0.0, 1.0));
          if (camDist < 280.0) {
            vec3 viewT = vec3(dot(rdW, gT), rdW.y, -dot(rdW, gN));
            interiorRoom(winUv, roomId, viewT, uNightG, isGround, rCol, rEmis);
          } else {
            float litD = step(1.0 - (0.32 + uNightG * 0.42), bh2(roomId + 41.3));
            vec3 lampD = mix(vec3(1.0, 0.80, 0.50), vec3(0.88, 0.94, 1.0), step(0.70, bh2(roomId + 29.3)));
            rEmis = lampD * litD * (0.12 + uNightG * 0.95) * (0.50 + 0.50 * bh2(roomId));
            rCol = mix(vec3(0.08, 0.11, 0.15), rEmis * 0.65 + vec3(0.18, 0.16, 0.14), litD);
          }

          // Physical Schlick Fresnel + luminous sky/cloud/sun-glint mirror reflection
          float ndv = clamp(dot(warpN, -rdW), 0.0, 1.0);
          float fres = 0.22 + 0.78 * pow(1.0 - ndv, 2.6);
          float topShade = 0.72 + 0.28 * smoothstep(0.0, 0.14, 1.0 - winUv.y);
          vec3 reflSky = archSkyReflection(reflect(rdW, warpN), uSunG, uNightG, pRand) * ${tintVec} * (0.86 + 0.28 * pRand.x);
          vec3 glassCol = mix(rCol * topShade, reflSky, clamp(fres * 0.92, 0.28, 0.94));

          // Polished spandrel glass (reflective dark back-painted glass, not flat matte charcoal!)
          vec3 spandCol = mix(vec3(0.10, 0.12, 0.15) * ${tintVec}, reflSky * 0.52, clamp(fres * 0.65, 0.18, 0.62));
          vec3 aluCol = vec3(0.22, 0.24, 0.27);
          vec3 cwFinal = mix(glassCol, spandCol, spand);
          cwFinal = mix(cwFinal, aluCol, bars);

          diffuseColor.rgb = mix(diffuseColor.rgb, cwFinal, gWall);
          gRough = mix(mix(0.028, 0.14, spand), 0.26, bars);
          gMetal = mix(mix(0.16, 0.28, spand), 0.82, bars);
          gEmis = (rEmis * (0.85 + 0.45 * (1.0 - fres)) + reflSky * (0.28 * fres * (1.0 - uNightG))) * gGlass * gWall;
          gPaneJitter = (pRand - 0.5) * 0.055 * gGlass * gWall;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, gRough, gWall);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, gMetal, gWall);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gWall > 0.01) {
          vec3 warpV = (viewMatrix * vec4(gPaneJitter.x, gPaneJitter.y, -gPaneJitter.x, 0.0)).xyz;
          normal = normalize(mix(normal, normalize(nonPerturbedNormal + warpV), gWall * (0.60 + 0.40 * gGlass)));
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        ${hasGi ? buildPlaykitGiInjectGlsl('0.35 * (1.0 - gGlass * 0.65)') : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmis;`)
      .replace('#include <dithering_fragment>', `
        gl_FragColor.rgb = applyAerialDepth(gl_FragColor.rgb, vGW, uSunG, length(vViewPosition), uNightG);
        #include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => 'glass-interior-v4-' + tintKey + (isV3Model ? '-v3' : '-v1') + (hasGi ? '-gi' : '');
}

/**
 * Legacy v1 Punched Windows (ONLY for v1 windowless boxes — never used on v3 buildings with real 3D windows!):
 */
export function patchPunchedInterior(
  mat: THREE.MeshStandardMaterial,
  nightU: { value: number },
  curtainU: { value: number },
  sunDirU?: { value: THREE.Vector3 }
): void {
  const sDirU = sunDirU ?? { value: new THREE.Vector3(-0.7, 0.45, -0.2).normalize() };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uNightG = nightU;
    sh.uniforms.uCurtain = curtainU;
    sh.uniforms.uSunP = sDirU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPW;\nvarying vec3 vPN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 pwp = vec4(position, 1.0);
        mat3 pnm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
        pwp = instanceMatrix * pwp;
        pnm = pnm * mat3(instanceMatrix);
        #endif
        #ifdef USE_BATCHING
        pwp = batchingMatrix * pwp;
        pnm = pnm * mat3(batchingMatrix);
        #endif
        vPW = (modelMatrix * pwp).xyz;
        vPN = pnm * normal;`);

    const needShared = !sh.fragmentShader.includes('void interiorRoom(');
    const colHook = sh.fragmentShader.includes('/*__BLD_COL__*/') ? '/*__BLD_COL__*/' : '#include <map_fragment>';
    const rghHook = sh.fragmentShader.includes('/*__BLD_RGH__*/') ? '/*__BLD_RGH__*/' : '#include <roughnessmap_fragment>';
    const mtlHook = sh.fragmentShader.includes('/*__BLD_MTL__*/') ? '/*__BLD_MTL__*/' : '#include <metalnessmap_fragment>';
    const nrmHook = sh.fragmentShader.includes('/*__BLD_NRM__*/') ? '/*__BLD_NRM__*/' : '#include <normal_fragment_maps>';

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPW; varying vec3 vPN;
        uniform float uNightG, uCurtain;
        uniform vec3 uSunP;
        ${needShared ? SHARED_GLSL : ''}`)
      .replace(colHook, `${colHook}
        float pwGlass = 0.0, pwWinAny = 0.0, pwMetal = 0.0, pwRough = 0.85;
        vec3 pwEmis = vec3(0.0);
        vec3 pwNormOff = vec3(0.0);
        {
          vec3 gn = normalize(vPN);
          float wall = (1.0 - smoothstep(0.35, 0.6, abs(gn.y))) * uCurtain;
          if (wall > 0.01) {
            vec3 gT = normalize(vec3(-gn.z, 0.0, gn.x) + vec3(1e-5, 0.0, 0.0));
            vec3 gN = normalize(vec3(gn.x, 0.0, gn.z) + vec3(1e-5, 0.0, 0.0));
            float camD = length(cameraPosition - vPW);
            float aa = 0.018 + 0.28 / max(1.0, camD * 0.55);

            float upper = smoothstep(4.9, 5.5, vPW.y);
            float groundBand = smoothstep(0.35, 0.65, vPW.y) * (1.0 - smoothstep(4.4, 4.9, vPW.y));
            float floorSeam = upper * (1.0 - smoothstep(0.0, 0.045, abs(fract(vPW.y / 3.9) - 0.03)));
            diffuseColor.rgb *= 1.0 - 0.24 * floorSeam * wall;
            pwNormOff += vec3(0.0, -0.35 * floorSeam * wall, 0.0);

            vec2 uvU = vec2(dot(vPW.xz, gT.xz) / 3.2, vPW.y / 3.9);
            vec2 fU = fract(uvU), idU = floor(uvU);
            vec2 loU = vec2(0.18, 0.20), hiU = vec2(0.82, 0.80);
            float inU = smoothstep(loU.x - aa, loU.x, fU.x) * (1.0 - smoothstep(hiU.x, hiU.x + aa, fU.x))
                      * smoothstep(loU.y - aa, loU.y, fU.y) * (1.0 - smoothstep(hiU.y, hiU.y + aa, fU.y)) * upper * wall;
            float sillU = upper * wall * smoothstep(loU.x - 0.05, loU.x, fU.x) * (1.0 - smoothstep(hiU.x, hiU.x + 0.05, fU.x))
                        * smoothstep(0.11, 0.14, fU.y) * (1.0 - smoothstep(0.19, 0.21, fU.y));
            float lintelShadU = upper * wall * smoothstep(loU.x - 0.02, loU.x, fU.x) * (1.0 - smoothstep(hiU.x, hiU.x + 0.02, fU.x))
                              * smoothstep(0.79, 0.82, fU.y) * (1.0 - smoothstep(0.87, 0.90, fU.y));

            vec2 uvG = vec2(dot(vPW.xz, gT.xz) / 4.4, clamp((vPW.y - 0.55) / 3.7, 0.0, 1.0));
            vec2 fG = vec2(fract(uvG.x), uvG.y), idG = vec2(floor(uvG.x), -1.0);
            float inG = smoothstep(0.10 - aa, 0.10, fG.x) * (1.0 - smoothstep(0.90, 0.90 + aa, fG.x))
                      * smoothstep(0.06, 0.10, fG.y) * (1.0 - smoothstep(0.86, 0.90, fG.y)) * groundBand * wall;
            float awningG = groundBand * wall * smoothstep(0.05, 0.09, fG.x) * (1.0 - smoothstep(0.91, 0.95, fG.x))
                          * smoothstep(0.86, 0.90, fG.y) * (1.0 - smoothstep(0.97, 1.0, fG.y));

            diffuseColor.rgb *= 1.0 + 0.18 * sillU - 0.34 * lintelShadU - 0.45 * awningG;
            pwNormOff += vec3(0.0, 0.55 * sillU - 0.55 * lintelShadU - 0.45 * awningG, 0.0);

            float winMask = max(inU, inG);
            if (winMask > 0.01) {
              float isSt = step(inU, inG);
              vec2 wUv = mix((fU - loU) / (hiU - loU), vec2((fG.x - 0.10) / 0.80, (fG.y - 0.08) / 0.80), isSt);
              wUv = clamp(wUv, 0.0, 1.0);
              vec2 rId = mix(idU, idG, isSt);

              float barW = clamp(0.028 + aa * 0.5, 0.028, 0.18);
              float frameEdge = max(max(step(wUv.x, barW * 1.4), step(1.0 - barW * 1.4, wUv.x)), max(step(wUv.y, barW * 1.4), step(1.0 - barW * 1.4, wUv.y)));
              float muntin = max(step(abs(wUv.x - 0.5), barW * 0.65), (1.0 - isSt) * step(abs(wUv.y - 0.52), barW * 0.7));
              float metalBar = clamp(frameEdge + muntin, 0.0, 1.0);

              vec3 rdW = normalize(vPW - cameraPosition);
              vec3 rCol = vec3(0.08, 0.10, 0.13);
              vec3 rEmis = vec3(0.0);
              if (camD < 240.0) {
                vec3 viewT = vec3(dot(rdW, gT), rdW.y, -dot(rdW, gN));
                interiorRoom(wUv, rId, viewT, uNightG, isSt, rCol, rEmis);
              } else if (uNightG > 0.02) {
                float litD = step(1.0 - (0.24 + uNightG * 0.42), bh2(rId + 41.3));
                vec3 lampD = mix(vec3(1.0, 0.78, 0.48), vec3(0.86, 0.92, 1.0), step(0.72, bh2(rId + 29.3)));
                rEmis = lampD * litD * uNightG * (0.45 + 0.55 * bh2(rId));
                rCol += rEmis * 0.35;
              }

              float topRecess = 0.28 + 0.72 * smoothstep(0.0, 0.22, 1.0 - wUv.y);
              float sideRecess = 0.72 + 0.28 * smoothstep(0.0, 0.14, min(wUv.x, 1.0 - wUv.x));
              float ndv = clamp(dot(gN, -rdW), 0.0, 1.0);
              float fres = 0.22 + 0.78 * pow(1.0 - ndv, 2.6);
              vec2 pRand = vec2(bh2(rId + 7.1), bh2(rId + 19.7));
              vec3 skyGlass = archSkyReflection(reflect(rdW, gN), uSunP, uNightG, pRand);
              vec3 paneCol = mix(rCol * topRecess * sideRecess, skyGlass, clamp(fres * 0.86, 0.26, 0.90));
              vec3 sashCol = vec3(0.075, 0.08, 0.09);
              vec3 finalWin = mix(paneCol, sashCol, metalBar);

              diffuseColor.rgb = mix(diffuseColor.rgb, finalWin, winMask);
              pwWinAny = winMask;
              pwGlass = winMask * (1.0 - metalBar);
              pwRough = mix(0.032, 0.30, metalBar);
              pwMetal = mix(0.18, 0.78, metalBar);
              pwEmis = rEmis * pwGlass * topRecess * (1.0 - fres * 0.35);
            }
          }
        }`)
      .replace(mtlHook, `${mtlHook}
        if (pwWinAny > 0.01) metalnessFactor = mix(metalnessFactor, pwMetal, pwWinAny);`)
      .replace(rghHook, `${rghHook}
        if (pwWinAny > 0.01) roughnessFactor = mix(roughnessFactor, pwRough, pwWinAny);`)
      .replace(nrmHook, `${nrmHook}
        if (pwWinAny > 0.01) normal = normalize(mix(normal, nonPerturbedNormal, pwWinAny * 0.94));
        else if (dot(pwNormOff, pwNormOff) > 1e-4) normal = normalize(normal + (viewMatrix * vec4(pwNormOff, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += pwEmis;`);
  };
  mat.customProgramCacheKey = () => 'punched-interior-v6-' + (mat.map ? 'm' : 'p');
}
