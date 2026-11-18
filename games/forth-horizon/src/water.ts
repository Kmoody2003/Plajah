// Water for the region: a river and a lake that look and move like water. Surface normals come from a tileable procedural normal map, advected along a flow map
// (tools/build_water.py: current direction and speed, depth and shoreline from the heightfield) with two cross-fading phases so the ripples visibly travel
// downstream. Depth tints the colour, the sky panorama is reflected with a Fresnel term plus sun glints, banks get foam, fast water and wind add chop and
// whitecaps, and rain adds ripple rings. Fog and the map-edge fade match the rest of the scene.
import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';

const FLOW_URL = '/games/forth-horizon/region/water_flow.png';

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
  uniform sampler2D tFlow, tNormal, tSky;
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
    vec2 flow = (fl.rg - 0.5) * 4.0;                      // metres per second
    float dep = fl.b * fl.b * 12.0;
    float shore = fl.a;
    float spd = length(flow);
    // wind drift on open water
    vec2 cur = flow + uWindDir * (0.35 + uWind * 0.8) * (1.0 - smoothstep(0.1, 0.6, spd));
    // two-phase flow advection so the ripples travel with the current without stretching
    float T = 2.4;
    float ph0 = fract(uTime / T), ph1 = fract(uTime / T + 0.5);
    float wgt = abs(ph0 * 2.0 - 1.0);
    vec2 a0 = wp / 9.0 - cur * ph0 * T / 9.0, a1 = wp / 9.0 - cur * ph1 * T / 9.0;
    vec2 b0 = wp / 2.6 - cur * 1.25 * ph0 * T / 2.6 + vec2(0.37, 0.11), b1 = wp / 2.6 - cur * 1.25 * ph1 * T / 2.6 + vec2(0.37, 0.11);
    vec4 ta0 = texture2D(tNormal, a0);
    vec4 ta1 = texture2D(tNormal, a1);
    vec3 nA = mix(ta0.xyz, ta1.xyz, wgt) * 2.0 - 1.0;
    vec3 nB = mix(nrm(tNormal, b0), nrm(tNormal, b1), wgt);
    float choppy = 0.30 + uWind * 1.1 + spd * 0.22 + uRain * 0.25;
    vec2 slope = (nA.xy * 0.9 + nB.xy * 0.6) * choppy;
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
    float ndv = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
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
    body += uSunCol * pow(max(dot(N, uSunDir), 0.0), 3.0) * 0.05 * (1.0 - tdeep) * uSunAmt;
    vec3 col = mix(body, sky, F);
    float rs = max(dot(R, uSunDir), 0.0);
    float sp = pow(rs, mix(900.0, 260.0, uGlint)) * mix(6.0, 3.0, uGlint) + pow(rs, 70.0) * 0.28 * (1.0 + uGlint * 0.4);
    // glitter: only sample when glint > 0 and sun highlight is active
    if (uGlint > 0.005 && rs > 0.45) {
      float tw = texture2D(tNormal, wp / 1.3 + cur * uTime * 0.12).a * texture2D(tNormal, wp / 0.7 - cur * uTime * 0.2 + 0.31).a;
      sp += uGlint * pow(rs, 28.0) * smoothstep(0.3, 0.9, tw * 2.2) * 1.6;
    }
    sp = min(sp, 2.4);
    col += uSunCol * sp * max(uSunAmt, uGlint * 0.7) * (1.0 - uStorm * 0.7);
    // foam: reuse alpha channel already fetched from tNormal at a0 and a1
    float hh = mix(ta0.a, ta1.a, wgt);
    float bank = smoothstep(0.62, 1.0, shore) * smoothstep(0.35, 0.8, hh + (1.0 - dep) * 0.1);
    float fast = smoothstep(1.05, 1.5, spd) * smoothstep(0.55, 0.85, hh) * 0.6;
    float caps = smoothstep(0.55, 1.0, uWind + uStorm * 0.4) * smoothstep(0.72, 0.9, hh) * 0.8;
    float foam = clamp(bank + fast + caps, 0.0, 1.0);
    col = mix(col, vec3(0.88, 0.92, 0.94) * (0.5 + 0.5 * max(uSunAmt, 0.2)), foam * 0.85);
    float alpha = clamp(0.30 + tdeep * 0.62 + F * 0.35 + foam * 0.5, 0.0, 0.96);
    alpha *= smoothstep(0.0, 0.5, dep + (inside ? 0.0 : 1.0));
    // fog and the map edge fade
    float fg = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFog, fg);
    alpha = mix(alpha, 1.0, fg * 0.0);
    alpha *= mix(1.0, smoothstep(0.0, 1300.0, min(uEdge.x - abs(wp.x), uEdge.y - abs(wp.y))), uMapFade);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export interface WaterState { sunDir: THREE.Vector3; sunCol: THREE.Color; sunAmt: number; wind: number; rain: number; storm: number; fog: THREE.Color; fogNear: number; fogFar: number; skyDim: number; mapFade: number; glint?: number }

export class WaterSurface {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t = 0;
  constructor(scene: THREE.Scene, rw: number, rh: number, ext: number, edge: THREE.Vector2, x0: number, z0: number, atmosphere?: Atmosphere | null) {
    const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 0]), 1, 1); blank.needsUpdate = true;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: {
        tFlow: { value: blank }, tNormal: { value: normalTexture() }, tSky: { value: blank },
        uTime: { value: 0 }, uSunAmt: { value: 1 }, uWind: { value: 0.1 }, uRain: { value: 0 }, uFogNear: { value: 9000 }, uFogFar: { value: 42000 }, uMapFade: { value: 0 }, uSkyDim: { value: 1 }, uHaveSky: { value: 0 }, uStorm: { value: 0 }, uGlint: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color(0.7, 0.8, 0.9) },
        uRegion: { value: new THREE.Vector4(x0, z0, rw, rh) }, uEdge: { value: edge }, uWindDir: { value: new THREE.Vector2(0.8, 0.25).normalize() },
      },
    });
    const g = new THREE.PlaneGeometry(rw + ext, rh); g.rotateX(-Math.PI / 2);
    atmosphere?.patchCustom(this.mat, 'water');
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.set(-ext / 2, -0.3, 0);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    new THREE.TextureLoader().load(FLOW_URL, (t) => {
      t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      this.mat.uniforms.tFlow.value = t;
    });
  }
  setSky(tex: THREE.Texture | null): void { if (tex) { this.mat.uniforms.tSky.value = tex; this.mat.uniforms.uHaveSky.value = 1; } }
  update(dt: number, s: WaterState): void {
    this.t += dt;
    const u = this.mat.uniforms;
    u.uTime.value = this.t;
    u.uSunDir.value.copy(s.sunDir); u.uSunCol.value.copy(s.sunCol); u.uSunAmt.value = s.sunAmt; u.uWind.value = s.wind; u.uRain.value = s.rain; u.uStorm.value = s.storm;
    u.uFog.value.copy(s.fog); u.uFogNear.value = s.fogNear; u.uFogFar.value = s.fogFar; u.uSkyDim.value = s.skyDim; u.uGlint.value = s.glint ?? 0; u.uMapFade.value = s.mapFade;
  }
}
