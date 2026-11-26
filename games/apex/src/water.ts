// Water for the region: a river and a lake that look and move like water. Surface normals come from a tileable procedural normal map, advected along a flow map
// (tools/build_water.py: current direction and speed, depth and shoreline from the heightfield) with two cross-fading phases so the ripples visibly travel
// downstream. Depth tints the colour, the sky panorama is reflected with a Fresnel term plus sun glints, banks get foam, fast water and wind add chop and
// whitecaps, and rain adds ripple rings. Fog and the map-edge fade match the rest of the scene.
import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';
import { createApexWaterTslMaterial, type ApexWaterTslHandle } from './tsl/worldTsl';
import { isRegionWebGpuActive } from './tsl/webgpuRuntime';

const FLOW_URL = '/games/apex/region/water_flow.png';

function normalTexture(size = 512): THREE.DataTexture {
  // periodic value noise, several octaves, turned into a tangent-space normal map that tiles
  const h = new Float32Array(size * size);
  const lat = (n: number, seed: number): Float32Array => {
    const a = new Float32Array(n * n);
    let s = seed;
    for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s / 2147483647; }
    return a;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const octaves: [number, number, number][] = [[4, 1.0, 11], [8, 0.55, 23], [16, 0.3, 37], [32, 0.16, 53], [64, 0.08, 71]];
  for (const [n, amp, seed] of octaves) {
    const L = lat(n, seed);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * n, fy = (y / size) * n;
      const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
      const v = (L[y0 * n + x0] * (1 - tx) + L[y0 * n + x1] * tx) * (1 - ty) + (L[y1 * n + x0] * (1 - tx) + L[y1 * n + x1] * tx) * ty;
      h[y * size + x] += v * amp;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 3.2, dy = (at(x, y + 1) - at(x, y - 1)) * 3.2;
    const l = Math.hypot(dx, dy, 1);
    const o = (y * size + x) * 4;
    data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    data[o + 3] = Math.round(Math.min(1, Math.max(0, at(x, y) / 2)) * 255);        // height, used for foam breakup
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const VERT = `
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const FRAG = `
  uniform sampler2D tFlow, tCarve, tNormal, tSky;
  uniform float uTime, uSunAmt, uWind, uRain, uFogNear, uFogFar, uMapFade, uSkyDim, uHaveSky, uStorm, uGlint;
  uniform vec3 uSunDir, uSunCol, uFog;
  uniform vec4 uRegion;
  uniform vec2 uEdge, uWindDir;
  varying vec3 vW;
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  vec3 nrm(sampler2D t, vec2 uv) { return texture2D(t, uv).xyz * 2.0 - 1.0; }
  void main() {
    vec2 wp = vW.xz;
    vec2 fuv = (wp - uRegion.xy) / uRegion.zw;
    bool inside = fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0;
    vec4 fl = inside ? texture2D(tFlow, fuv) : vec4(0.5, 0.5, 1.0, 0.0);
    vec4 cv = inside ? texture2D(tCarve, fuv) : vec4(0.0);
    vec2 flow = (fl.rg - 0.5) * 4.4;                      // metres per second
    float rawDep = max(fl.b, cv.b);
    float dep = rawDep * rawDep * 12.0;
    float shore = fl.a * (1.0 - cv.a * 0.92);
    float spd = length(flow);
    // Realistic living current: strong downstream river drift + lively wind-driven lake current (never static!)
    vec2 riverFallback = vec2(-0.38, 0.92);
    vec2 windDrift = uWindDir * (0.95 + uWind * 1.45);
    vec2 baseCur = spd > 0.18 ? flow * 1.35 : mix(windDrift, riverFallback * 1.55, smoothstep(8.5, 2.2, dep) * (inside ? 1.0 : 0.0));
    vec2 cur = baseCur + uWindDir * (0.42 + uWind * 0.85) * (1.0 - smoothstep(0.4, 1.8, spd));
    float curSpd = length(cur);
    vec2 curDir = cur / max(curSpd, 0.001);
    vec2 curPerp = vec2(-curDir.y, curDir.x);

    // Four-scale continuous current & swell advection (clearly animated from street level, bridges, replays & aerials!)
    float T = 3.2;
    float ph0 = fract(uTime / T), ph1 = fract(uTime / T + 0.5);
    float wgt = abs(ph0 * 2.0 - 1.0);
    // Elongate ripples slightly along current direction so downstream river flow reads unmistakably
    vec2 flowSpace = vec2(dot(wp, curPerp) * 1.25, dot(wp, curDir) * 0.78);
    vec2 a0 = flowSpace / 9.5 - vec2(0.0, curSpd * ph0 * T / 9.5);
    vec2 a1 = flowSpace / 9.5 - vec2(0.0, curSpd * ph1 * T / 9.5);
    vec2 b0 = wp / 3.1 - cur * 1.45 * ph0 * T / 3.1 + vec2(0.37, 0.11);
    vec2 b1 = wp / 3.1 - cur * 1.45 * ph1 * T / 3.1 + vec2(0.37, 0.11);
    vec2 wpR = mat2(0.8, -0.6, 0.6, 0.8) * wp;
    vec2 wpR2 = mat2(-0.53, 0.85, -0.85, -0.53) * wp;
    vec2 c0 = wpR / 26.0 - (cur * 0.85 + uWindDir * 1.35) * uTime / 26.0 + vec2(0.19, 0.63);
    vec2 c1 = wpR2 / 64.0 - (cur * 0.65 + uWindDir * 1.85) * uTime / 64.0 + vec2(0.47, 0.29);
    vec4 ta0 = texture2D(tNormal, a0);
    vec4 ta1 = texture2D(tNormal, a1);
    vec3 nA = mix(ta0.xyz, ta1.xyz, wgt) * 2.0 - 1.0;
    vec3 nB = mix(nrm(tNormal, b0), nrm(tNormal, b1), wgt);
    vec3 nC = nrm(tNormal, c0) * 0.58 + nrm(tNormal, c1) * 0.42;
    // Travelling directional swell wave crests so wide bridge/aerial/Hero Showcase shots show continuous flowing motion
    float swellPhase1 = dot(wp, curDir) * 0.19 - uTime * (1.55 + curSpd * 0.55);
    float swellPhase2 = dot(wp, uWindDir) * 0.11 - uTime * (1.25 + uWind * 1.15);
    vec2 dirWave = curDir * cos(swellPhase1) * 0.11 + uWindDir * cos(swellPhase2) * 0.085;

    float d3 = length(cameraPosition - vW);
    float nearFade = 1.0 - smoothstep(140.0, 580.0, d3);
    float midFade = 1.0 - smoothstep(550.0, 2800.0, d3) * 0.68;
    float choppy = 0.36 + uWind * 1.10 + curSpd * 0.22 + uRain * 0.28;
    vec2 slope = (nA.xy * 0.72 * nearFade + nB.xy * 0.58 * nearFade + nC.xy * 0.84 * midFade) * choppy + dirWave * midFade;
    // rain rings
    if (uRain > 0.02) {
      vec2 g = wp * 0.55, id = floor(g), f = fract(g) - 0.5;
      float t = fract(uTime * 0.85 + hash21(id));
      float r = length(f);
      float ring = smoothstep(0.045, 0.0, abs(r - t * 0.46)) * (1.0 - t) * step(hash21(id + 7.0), uRain);
      slope += normalize(f + 1e-4) * ring * 0.9;
    }
    vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
    vec3 toCam = cameraPosition - vW;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float omN = 1.0 - ndv; float omN2 = omN * omN;
    float F = 0.02 + 0.98 * (omN2 * omN2 * omN);
    // sky reflection from the same panorama the sky dome draws
    vec3 R = reflect(-V, N); R.y = abs(R.y) * 0.98 + 0.02;
    vec3 sky = vec3(0.55, 0.65, 0.78);
    if (uHaveSky > 0.5) sky = texture2D(tSky, vec2(atan(R.z, R.x) * 0.15915494 + 0.5, asin(clamp(R.y, -1.0, 1.0)) * 0.31830989 + 0.5)).rgb;
    sky *= uSkyDim;
    // colour from depth: shallow teal / murky river, deep blue-green lake
    float tdeep = 1.0 - exp(-dep * 0.32);
    vec3 shallow = mix(vec3(0.11, 0.30, 0.28), vec3(0.16, 0.22, 0.14), smoothstep(0.15, 0.8, spd));
    vec3 deep = vec3(0.012, 0.085, 0.125);
    vec3 body = mix(shallow, deep, tdeep);
    body *= 0.55 + 0.6 * max(uSunAmt, 0.15);
    float nds = clamp(dot(N, uSunDir), 0.0, 1.0);
    body += uSunCol * (nds * nds * nds) * 0.05 * (1.0 - tdeep) * uSunAmt;
    vec3 col = mix(body, sky, F);
    float rs = max(dot(R, uSunDir), 1e-4);
    float sp = pow(rs, mix(900.0, 260.0, uGlint)) * mix(6.0, 3.0, uGlint) + pow(rs, 70.0) * 0.28 * (1.0 + uGlint * 0.4);
    // glitter: only sample when glint > 0 and sun highlight is active
    if (uGlint > 0.005 && rs > 0.45) {
      float tw = texture2D(tNormal, wp / 1.3 + cur * uTime * 0.12).a * texture2D(tNormal, wp / 0.7 - cur * uTime * 0.2 + 0.31).a;
      sp += uGlint * pow(rs, 28.0) * smoothstep(0.3, 0.9, tw * 2.2) * 1.6;
    }
    sp = min(sp, 2.4);
    col += uSunCol * sp * max(uSunAmt, uGlint * 0.7) * (1.0 - uStorm * 0.7);
    // foam: animated shoreline lap waves + elongated downstream current foam streaks + wind whitecaps
    float hSw = texture2D(tNormal, c0).a * 0.58 + texture2D(tNormal, c1).a * 0.42;
    float hh = mix(ta0.a, ta1.a, wgt) * (0.35 + 0.85 * hSw);
    float lapWave = 0.5 + 0.5 * sin(uTime * 2.35 - shore * 14.0 + hSw * 6.0);
    float bank = smoothstep(0.56, 1.0, shore) * smoothstep(0.28, 0.76, hh + lapWave * 0.26 + (1.0 - dep) * 0.1);
    float streakTex = texture2D(tNormal, vec2(dot(wp, curPerp) / 7.5, dot(wp, curDir) / 42.0 - uTime * curSpd / 42.0)).a;
    float currentStreak = smoothstep(0.75, 1.9, curSpd) * smoothstep(0.66, 0.90, streakTex * (0.65 + 0.55 * hSw)) * 0.26 * midFade;
    float fast = smoothstep(0.95, 1.55, curSpd) * smoothstep(0.48, 0.82, hh) * 0.55;
    float caps = smoothstep(0.48, 1.0, uWind + uStorm * 0.4) * smoothstep(0.66, 0.90, hh) * 0.78 * midFade;
    float foam = clamp(bank + fast + caps + currentStreak, 0.0, 1.0);
    col = mix(col, vec3(0.88, 0.92, 0.94) * (0.5 + 0.5 * max(uSunAmt, 0.2)), foam * 0.85);
    float alpha = clamp(0.30 + tdeep * 0.62 + F * 0.35 + foam * 0.5, 0.0, 0.96);
    // Smooth wide shoreline feather eliminates harsh depth-fighting shimmer along shallow river/lake edges
    alpha *= smoothstep(0.02, 0.90, dep + (inside ? 0.0 : 1.0));
    // Only extend open Great Lake water apron to the WEST & NORTHWEST (never stick out behind inland east/south terrain borders!)
    float eastBoundary = 1.0 - smoothstep(0.992, 1.003, fuv.x);
    float southBoundary = 1.0 - smoothstep(0.992, 1.003, fuv.y);
    float neBoundary = 1.0 - smoothstep(0.68, 0.78, fuv.x) * (1.0 - smoothstep(-0.015, 0.006, fuv.y));
    alpha *= eastBoundary * southBoundary * neBoundary;
    // fog and the map edge fade
    float fg = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFog, fg);
    alpha = mix(alpha, 1.0, fg * 0.0);
    alpha *= mix(1.0, smoothstep(0.0, 1300.0, min(uEdge.x - abs(wp.x - (uRegion.x + uRegion.z * 0.5)), uEdge.y - abs(wp.y - (uRegion.y + uRegion.w * 0.5)))), uMapFade);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export interface WaterState { sunDir: THREE.Vector3; sunCol: THREE.Color; sunAmt: number; wind: number; rain: number; storm: number; fog: THREE.Color; fogNear: number; fogFar: number; skyDim: number; mapFade: number; glint?: number }

export class WaterSurface {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial | null = null;
  private tslWater: ApexWaterTslHandle | null = null;
  private t = 0;
  constructor(scene: THREE.Scene, rw: number, rh: number, ext: number, edge: THREE.Vector2, x0: number, z0: number, atmosphere?: Atmosphere | null, carvedHeightAt?: (x: number, z: number) => number) {
    const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 0]), 1, 1); blank.needsUpdate = true;
    const carveTex = (() => {
      if (!carvedHeightAt) {
        const z = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); z.needsUpdate = true; return z;
      }
      // Build a 512x512 lossless RGBA DataTexture from the LIVE carved heightfield so channels carved
      // beneath Halcyon Gateway Bridge (and all river reaches) get true depth & clear fake satellite
      // mid-channel shoreline without ever passing water_flow.png through premultiplied Canvas2D.
      const sz = 512;
      const data = new Uint8Array(sz * sz * 4);
      for (let py = 0; py < sz; py++) {
        const wz = z0 + ((py + 0.5) / sz) * rh;
        for (let px = 0; px < sz; px++) {
          const wx = x0 + ((px + 0.5) / sz) * rw;
          const gh = carvedHeightAt(wx, wz);
          if (gh < -0.35) {
            const o = (py * sz + px) * 4;
            const carvedDep = Math.min(12, -0.3 - gh);
            data[o + 2] = Math.min(255, Math.round(Math.sqrt(carvedDep / 12) * 255));
            if (carvedDep > 1.2) data[o + 3] = Math.min(255, Math.round(Math.min(1, (carvedDep - 1.2) / 1.8) * 255));
          }
        }
      }
      const ct = new THREE.DataTexture(data, sz, sz, THREE.RGBAFormat);
      ct.colorSpace = THREE.NoColorSpace; ct.flipY = false; ct.wrapS = ct.wrapT = THREE.ClampToEdgeWrapping;
      ct.minFilter = THREE.LinearFilter; ct.magFilter = THREE.LinearFilter; ct.generateMipmaps = false;
      ct.needsUpdate = true;
      return ct;
    })();
    let meshMat: THREE.Material;
    if (isRegionWebGpuActive()) {
      this.tslWater = createApexWaterTslMaterial({
        normalTex: normalTexture(),
        flowTex: blank,
        carveTex,
        region: new THREE.Vector4(x0, z0, rw, rh),
        edge,
      });
      meshMat = this.tslWater.material as unknown as THREE.Material;
    } else {
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
        uniforms: {
          tFlow: { value: blank }, tCarve: { value: carveTex }, tNormal: { value: normalTexture() }, tSky: { value: blank },
          uTime: { value: 0 }, uSunAmt: { value: 1 }, uWind: { value: 0.25 }, uRain: { value: 0 }, uFogNear: { value: 9000 }, uFogFar: { value: 42000 }, uMapFade: { value: 0 }, uSkyDim: { value: 1 }, uHaveSky: { value: 0 }, uStorm: { value: 0 }, uGlint: { value: 0.45 },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color(0.7, 0.8, 0.9) },
          uRegion: { value: new THREE.Vector4(x0, z0, rw, rh) }, uEdge: { value: edge }, uWindDir: { value: new THREE.Vector2(0.8, 0.25).normalize() },
        },
      });
      atmosphere?.patchCustom(this.mat, 'water');
      meshMat = this.mat;
    }
    // Cover the entire region plus a wide ocean apron west, north and south so coastal highways never see a straight water cutoff seam
    const g = new THREE.PlaneGeometry(rw + ext * 1.6, rh + ext * 1.6); g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, meshMat);
    this.mesh.position.set(x0 + rw * 0.5 - ext * 0.35, -0.3, z0 + rh * 0.5 - ext * 0.25);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    new THREE.TextureLoader().load(FLOW_URL, (t) => {
      t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      if (this.tslWater) this.tslWater.setFlowTexture(t);
      else if (this.mat) this.mat.uniforms.tFlow.value = t;
    });
  }
  setSky(tex: THREE.Texture | null): void {
    if (!tex) return;
    if (this.tslWater) this.tslWater.setSkyTexture(tex);
    else if (this.mat) { this.mat.uniforms.tSky.value = tex; this.mat.uniforms.uHaveSky.value = 1; }
  }
  update(dt: number, s: WaterState): void {
    this.t += dt;
    if (this.tslWater) {
      this.tslWater.update(dt, s);
      return;
    }
    if (!this.mat) return;
    const u = this.mat.uniforms;
    u.uTime.value = this.t;
    u.uSunDir.value.copy(s.sunDir); u.uSunCol.value.copy(s.sunCol); u.uSunAmt.value = s.sunAmt; u.uWind.value = s.wind; u.uRain.value = s.rain; u.uStorm.value = s.storm;
    u.uFog.value.copy(s.fog); u.uFogNear.value = s.fogNear; u.uFogFar.value = s.fogFar; u.uSkyDim.value = s.skyDim; u.uGlint.value = s.glint ?? 0; u.uMapFade.value = s.mapFade;
  }
}
