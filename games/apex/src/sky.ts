// The sky for the region game: a dome that draws the reference sky panorama and then adds what the panorama cannot hold at this resolution, so the sky has
// depth up close: procedural cloud structure, a sun disc and glow, stars and a moon at night, horizon haze, weather (a real overcast and storm panorama blended
// in by the weather rig, darkening, lightning), a high cirrus layer and a flock of birds. region.ts feeds it every frame.
import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';
import { createApexCirrusTslMaterial, createApexSkyTslMaterial, type ApexSkyTslHandle } from './tsl/worldTsl';
import { isRegionWebGpuActive } from './tsl/webgpuRuntime';

const TEX = '/games/apex/tex/';

const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }`;

const FRAG = `
  uniform sampler2D tBase, tNext, tOver, tStorm;
  uniform float uBaseBlend, uMixOver, uMixStorm, uSunAmt, uNight, uTime, uFogAmt, uDark, uFlash, uDetail;
  uniform vec3 uSunDir, uSunCol, uFog, uMoonDir;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { float a = 0.52, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.04 + 11.7; a *= 0.5; } return s; }
  float fbm2(vec3 p) { return 0.65 * noise(p) + 0.35 * noise(p * 2.07 + 7.3); }
  void main() {
    vec3 dir = normalize(vDir);
    float u = atan(dir.z, dir.x) * 0.15915494 + 0.5;
    float v = asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5;
    vec2 uv = vec2(u, v);
    vec3 col = texture2D(tBase, uv).rgb;
    if (uBaseBlend > 0.005) col = mix(col, texture2D(tNext, uv).rgb, uBaseBlend);
    if (uMixOver > 0.005) col = mix(col, texture2D(tOver, uv).rgb, uMixOver);
    if (uMixStorm > 0.005) col = mix(col, texture2D(tStorm, uv).rgb, uMixStorm);

    // Physical Rayleigh-Mie solar sky grounding so sky panoramas ALWAYS match true sun elevation, exposure & color temperature!
    float up = max(dir.y, 0.0);
    float sunEl = clamp(uSunDir.y, -0.35, 1.0);
    float dayFactor = smoothstep(-0.08, 0.24, sunEl);
    float goldenFactor = smoothstep(-0.06, 0.06, sunEl) * (1.0 - smoothstep(0.14, 0.42, sunEl));
    float twilightFactor = smoothstep(-0.22, -0.02, sunEl) * (1.0 - smoothstep(0.02, 0.16, sunEl));
    float sd = max(dot(dir, uSunDir), 1e-4);

    vec3 zenithDay = mix(vec3(0.15, 0.34, 0.68), vec3(0.10, 0.26, 0.64), smoothstep(0.15, 0.7, sunEl));
    vec3 zenithGold = vec3(0.14, 0.25, 0.52);
    vec3 zenithNight = vec3(0.012, 0.022, 0.052);
    vec3 physZenith = mix(zenithNight, mix(zenithDay, zenithGold, goldenFactor * 0.65), dayFactor);
    physZenith = mix(physZenith, vec3(0.05, 0.09, 0.22), twilightFactor * 0.65);

    vec3 horizDay = mix(vec3(0.68, 0.80, 0.94), vec3(0.58, 0.74, 0.92), smoothstep(0.2, 0.7, sunEl));
    vec3 horizGold = vec3(0.98, 0.56, 0.28);
    vec3 horizTwil = vec3(0.42, 0.28, 0.44);
    vec3 horizNight = vec3(0.028, 0.046, 0.092);
    vec3 physHoriz = mix(horizNight, mix(horizDay, horizGold, goldenFactor * 0.85), dayFactor);
    physHoriz = mix(physHoriz, horizTwil, twilightFactor * 0.75);
    vec3 physSky = mix(physHoriz, physZenith, pow(up, 0.48));
    // Warm Mie horizon solar glow band aligned with the actual sun azimuth
    physSky += uSunCol * pow(sd, 5.0) * (1.0 - smoothstep(0.0, 0.42, up)) * (0.28 + 0.55 * goldenFactor) * dayFactor * (1.0 - 0.82 * uMixOver);
    // Re-light sky panorama toward physical radiance while preserving photographic cloud detail
    float physMix = (0.30 + 0.16 * goldenFactor + 0.22 * uNight) * (1.0 - 0.65 * uMixOver);
    col = mix(col, physSky, physMix);
    // Keep panorama bright & crisp in clear daylight (LDR sky photos tend to compress highlight energy)
    col *= mix(1.0, 1.18, dayFactor * (1.0 - uMixOver * 0.75) * (1.0 - uNight));

    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    // cloud structure: 3+2 octave projection with sunlit silver-lining & warm sunset underside alpenglow
    float cloudy = smoothstep(0.26, 0.76, lum + (1.0 - uSunAmt) * 0.14);
    if (dir.y > -0.04 && uDetail > 0.01) {
      vec3 cp = vec3(dir.xz / (up + 0.18), 0.0) * 1.7 + vec3(uTime * 0.012, 0.0, uTime * 0.006);
      float n1 = fbm3(cp), n2 = fbm2(cp * 3.1 + 4.0);
      float detailMask = smoothstep(-0.02, 0.16, dir.y);
      col *= 1.0 + uDetail * detailMask * ((n1 - 0.5) * 0.82 + (n2 - 0.5) * 0.48) * (0.22 + cloudy);
      col = mix(col, col * (0.86 + 0.44 * smoothstep(0.34, 0.66, n1)), uDetail * detailMask * 0.45 * cloudy);
      // Warm sunlit cloud rim / silver-lining scattering + sunset underside alpenglow
      float silver = pow(sd, 6.0) * (0.35 + 0.65 * smoothstep(0.38, 0.78, n1)) * cloudy * detailMask;
      float alpenglow = goldenFactor * smoothstep(0.35, 0.74, n1) * (1.0 - smoothstep(0.05, 0.55, up)) * detailMask;
      col += uSunCol * (silver * 0.56 + alpenglow * 0.30) * uSunAmt * (1.0 - uNight) * (1.0 - 0.72 * uMixOver);
    }
    // sun disc & corona
    float disc = smoothstep(0.99935, 0.99975, sd);
    float glow = pow(sd, 120.0) * 0.68 + pow(sd, 14.0) * 0.22 + pow(sd, 3.0) * 0.07;
    float vis = uSunAmt * (1.0 - 0.88 * uMixOver);
    col += uSunCol * (disc * 10.5 + glow * 2.5) * vis * (1.0 - uNight);
    // night: crisp pinpoint multi-hue stars, subtle Milky Way band & moon with cool atmospheric halo
    if (uNight > 0.02 && dir.y > -0.05) {
      float starVis = smoothstep(0.55, 0.94, uNight) * smoothstep(0.04, 0.28, dir.y) * (1.0 - uMixOver);
      if (starVis > 0.01) {
        vec3 gs = dir * 225.0;
        vec3 g = floor(gs), gf = fract(gs) - 0.5;
        float h = hash(g);
        vec3 off = (vec3(hash(g + 1.3), hash(g + 5.7), hash(g + 9.1)) - 0.5) * 0.55;
        float pt = smoothstep(0.16, 0.02, length(gf - off));
        float star = step(0.986, h) * pt * (0.35 + 0.65 * hash(g + 3.1)) * (0.80 + 0.20 * sin(uTime * 2.8 + h * 40.0));
        vec3 starHue = mix(vec3(0.80, 0.88, 1.0), vec3(1.0, 0.90, 0.76), hash(g + 7.4));
        col += starHue * star * 1.75 * starVis;
        // Subtle galactic band across high night zenith
        float mw = exp(-pow(dir.x * 1.8 + dir.z * 0.9 - 0.25, 2.0) * 5.5) * smoothstep(0.15, 0.65, dir.y);
        float mwTex = fbm2(dir * 6.5);
        col += vec3(0.032, 0.042, 0.075) * mw * (0.45 + 0.85 * mwTex) * starVis;
      }
      float md = max(dot(dir, uMoonDir), 1e-4);
      col += vec3(0.88, 0.93, 1.0) * (smoothstep(0.9993, 0.9998, md) * 2.6 + pow(md, 180.0) * 0.42 + pow(md, 12.0) * 0.07) * uNight * (1.0 - 0.88 * uMixOver);
    }
    // weather: darker, lightning lit from inside
    col *= 1.0 - uDark * 0.34;
    col += vec3(0.62, 0.72, 1.0) * uFlash * (0.25 + cloudy * 0.9);
    // clean horizon atmospheric scatter matching AoPass dual-layer Rayleigh + Mie aerial perspective
    float hzBase = clamp(1.0 - clamp(dir.y, 0.0, 1.0), 0.0, 1.0);
    float hz2 = hzBase * hzBase;
    float hz = hz2 * hz2;
    float sd2 = sd * sd, sd3 = sd2 * sd, sd6 = sd3 * sd3, sd12 = sd6 * sd6;
    float mieHz = clamp(sd3 * 0.30 + sd12 * 0.58, 0.0, 0.86) * vis * (1.0 - uNight);
    vec3 hzCol = mix(uFog, uSunCol * 1.22, mieHz);
    col = mix(col, hzCol, clamp(hz * (0.34 + uFogAmt * 0.66), 0.0, 1.0));
    if (dir.y < 0.0) col = mix(col, hzCol, smoothstep(0.0, -0.10, dir.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function cirrusTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 1024, 1024);
  let s = 12345; const r = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // Soft wide wispy cloud puffs (avoid thin parallel needle streaks at grazing coastal angles)
  for (let i = 0; i < 240; i++) {
    const x = r() * 1024, y = r() * 1024, len = 70 + r() * 170, th = 22 + r() * 44, a = 0.028 + r() * 0.055, rot = (r() - 0.5) * 0.95;
    g.save(); g.translate(x, y); g.rotate(rot);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, len);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.55, `rgba(255,255,255,${a * 0.38})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.scale(1, th / len); g.fillStyle = grd; g.beginPath(); g.arc(0, 0, len, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export interface SkyState {
  sunDir: THREE.Vector3; sunCol: THREE.Color; sunAmt: number; night: number; fog: THREE.Color; fogAmt: number;
  mixOver: number; mixStorm: number; dark: number; flash: number; birds: boolean;
}

export class Sky {
  readonly dome: THREE.Mesh;
  private mat: THREE.ShaderMaterial | null = null;
  private tslSky: ApexSkyTslHandle | null = null;
  private currentBaseTex: THREE.Texture | null = null;
  private cirrus: THREE.Mesh;
  private cirrusTex: THREE.Texture;
  private birds: THREE.InstancedMesh;
  private birdData: { cx: number; cz: number; r: number; h: number; a: number; w: number; ph: number }[] = [];
  private loader = new THREE.TextureLoader();
  private t = 0;
  private dummy = new THREE.Object3D();
  private tex: Record<string, THREE.Texture> = {};

  constructor(scene: THREE.Scene, atmosphere?: Atmosphere | null) {
    const placeholder = new THREE.DataTexture(new Uint8Array([120, 160, 220, 255]), 1, 1); placeholder.needsUpdate = true;
    const useTsl = isRegionWebGpuActive();
    let domeMat: THREE.Material;
    if (useTsl) {
      this.tslSky = createApexSkyTslMaterial(placeholder);
      domeMat = this.tslSky.material as unknown as THREE.Material;
    } else {
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, transparent: false,
        uniforms: {
          tBase: { value: placeholder }, tNext: { value: placeholder }, tOver: { value: placeholder }, tStorm: { value: placeholder },
          uBaseBlend: { value: 0 }, uMixOver: { value: 0 }, uMixStorm: { value: 0 }, uSunAmt: { value: 1 }, uNight: { value: 0 }, uTime: { value: 0 }, uFogAmt: { value: 0 }, uDark: { value: 0 }, uFlash: { value: 0 }, uDetail: { value: 0.9 },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uFog: { value: new THREE.Color(0.7, 0.8, 0.9) },
          uMoonDir: { value: new THREE.Vector3(0.45, 0.62, -0.64).normalize() },
        },
      });
      atmosphere?.patchCustom(this.mat, 'sky');
      domeMat = this.mat;
    }
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(18000, 48, 32), domeMat);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    // high cirrus streaks with smooth radial horizon fade so square edges never seam across the sky
    const ct = cirrusTexture(); ct.repeat.set(3, 3);
    this.cirrusTex = ct;
    const cg = new THREE.PlaneGeometry(60000, 60000); cg.rotateX(-Math.PI / 2);
    let cm: THREE.Material;
    if (useTsl) {
      const tslCm = createApexCirrusTslMaterial(ct);
      tslCm.opacity = 0.14;
      cm = tslCm as unknown as THREE.Material;
    } else {
      const webglCm = new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.14, depthWrite: false, fog: false, side: THREE.DoubleSide });
      webglCm.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vCirUv;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCirUv = uv;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vCirUv;')
          .replace('#include <dithering_fragment>', 'gl_FragColor.a *= smoothstep(1.0, 0.25, length(vCirUv * 2.0 - 1.0));\n#include <dithering_fragment>');
      };
      webglCm.customProgramCacheKey = () => 'cirrus-radial-fade';
      cm = webglCm;
    }
    this.cirrus = new THREE.Mesh(cg, cm);
    this.cirrus.position.y = 7200; this.cirrus.renderOrder = 4;
    scene.add(this.cirrus);
    // birds: two wing quads per bird, flapping, circling over the lake shore and the city
    const bg = new THREE.BufferGeometry();
    const w = 1.0;
    bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w, 0.4, -0.3, -w * 0.9, 0.4, 0.25, 0, 0, 0, w, 0.4, -0.3, w * 0.9, 0.4, 0.25, 0, 0, 0.3, 0, 0.02, -0.4, 0.06, 0, 0], 3));
    bg.setIndex([0, 1, 2, 3, 5, 4, 6, 7, 8].slice(0, 9));
    this.birds = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.DoubleSide, fog: false }), 46);
    this.birds.frustumCulled = false;
    for (let i = 0; i < 46; i++) {
      const flock = i % 3;
      this.birdData.push({ cx: -1800 + flock * 1700, cz: -600 + flock * 900, r: 260 + Math.random() * 300, h: 140 + Math.random() * 260, a: Math.random() * 6.28, w: 0.05 + Math.random() * 0.05, ph: Math.random() * 6 });
    }
    scene.add(this.birds);
  }

  private activeBaseName = '';
  private activeNextName = '';

  /** load the panoramas: base follows the time of day, overcast and storm are blended in by the weather */
  setBase(name: string, onLoaded?: (t: THREE.Texture) => void): void {
    this.activeBaseName = name;
    this.activeNextName = name;
    if (this.tslSky) this.tslSky.setBaseBlend(0);
    else if (this.mat) this.mat.uniforms.uBaseBlend.value = 0;
    this.load(name, (t) => {
      this.currentBaseTex = t;
      if (this.tslSky) { this.tslSky.setBaseTexture(t); this.tslSky.setNextTexture(t); }
      else if (this.mat) { this.mat.uniforms.tBase.value = t; this.mat.uniforms.tNext.value = t; }
      onLoaded?.(t);
    });
  }
  /** Smoothly crossfade two sky panoramas for continuous 24h day/night & real-time local clock cycles */
  setBlendedBase(nameA: string, nameB: string, blend: number, onDominantLoaded?: (t: THREE.Texture) => void): void {
    const clamped = Math.max(0, Math.min(1, blend));
    const bVal = nameA === nameB ? 0 : clamped;
    if (this.tslSky) this.tslSky.setBaseBlend(bVal);
    else if (this.mat) this.mat.uniforms.uBaseBlend.value = bVal;
    if (this.activeBaseName !== nameA) {
      this.activeBaseName = nameA;
      this.load(nameA, (t) => {
        if (this.activeBaseName === nameA) {
          this.currentBaseTex = t;
          if (this.tslSky) this.tslSky.setBaseTexture(t);
          else if (this.mat) this.mat.uniforms.tBase.value = t;
          if (clamped < 0.5) onDominantLoaded?.(t);
        }
      });
    }
    if (this.activeNextName !== nameB) {
      this.activeNextName = nameB;
      this.load(nameB, (t) => {
        if (this.activeNextName === nameB) {
          if (this.tslSky) this.tslSky.setNextTexture(t);
          else if (this.mat) this.mat.uniforms.tNext.value = t;
          if (clamped >= 0.5) onDominantLoaded?.(t);
        }
      });
    }
  }
  /** Update moon direction smoothly opposite the solar arc */
  setMoonDir(v: THREE.Vector3): void {
    if (this.tslSky) this.tslSky.setMoonDir(v);
    else if (this.mat) (this.mat.uniforms.uMoonDir.value as THREE.Vector3).copy(v).normalize();
  }
  /** the panorama currently drawn (the water reflects it); null until it has loaded */
  baseTexture(): THREE.Texture | null {
    if (this.tslSky) return this.currentBaseTex;
    const t = this.mat?.uniforms.tBase.value as THREE.Texture | undefined;
    return !t || (t as THREE.DataTexture).isDataTexture ? null : t;
  }
  loadWeatherSkies(): void {
    this.load('sky2_overcast', (t) => {
      if (this.tslSky) this.tslSky.setOvercastTexture(t);
      else if (this.mat) this.mat.uniforms.tOver.value = t;
    });
    this.load('sky2_storm', (t) => {
      if (this.tslSky) this.tslSky.setStormTexture(t);
      else if (this.mat) this.mat.uniforms.tStorm.value = t;
    });
  }
  private load(name: string, cb: (t: THREE.Texture) => void): void {
    if (this.tex[name]) { cb(this.tex[name]); return; }
    this.loader.load(TEX + name + '.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 4;
      this.tex[name] = t; cb(t);
    });
  }

  update(dt: number, cam: THREE.Camera, st: SkyState): void {
    this.t += dt;
    this.dome.position.copy(cam.position);
    if (this.tslSky) {
      this.tslSky.update(dt, st);
    } else if (this.mat) {
      const u = this.mat.uniforms;
      u.uTime.value = this.t;
      u.uSunDir.value.copy(st.sunDir); u.uSunCol.value.copy(st.sunCol); u.uSunAmt.value = st.sunAmt; u.uNight.value = st.night;
      u.uFog.value.copy(st.fog); u.uFogAmt.value = st.fogAmt; u.uMixOver.value = st.mixOver; u.uMixStorm.value = st.mixStorm; u.uDark.value = st.dark; u.uFlash.value = st.flash;
    }
    // cirrus follows the camera sideways and drifts
    this.cirrus.position.x = cam.position.x; this.cirrus.position.z = cam.position.z;
    const cm = this.cirrus.material as THREE.MeshBasicMaterial;
    this.cirrusTex.offset.x += dt * 0.0006;
    cm.opacity = 0.34 * (1 - st.mixOver * 0.5) * (1 - st.night * 0.7);
    cm.color?.setScalar(1 - st.dark * 0.7);
    // birds
    this.birds.visible = st.birds;
    if (st.birds) {
      for (let i = 0; i < this.birdData.length; i++) {
        const b = this.birdData[i];
        b.a += b.w * dt;
        const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r, y = b.h + Math.sin(this.t * 0.4 + b.ph) * 12;
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(0, -b.a + Math.PI, Math.sin(b.a * 2) * 0.25);
        const flap = Math.sin(this.t * (7 + (i % 5)) + b.ph);
        this.dummy.scale.set(2.2, 1 + flap * 0.9, 2.2);
        this.dummy.updateMatrix();
        this.birds.setMatrixAt(i, this.dummy.matrix);
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }
  }
  setVisible(v: boolean): void { this.dome.visible = v; this.cirrus.visible = v; if (!v) this.birds.visible = false; }
}
