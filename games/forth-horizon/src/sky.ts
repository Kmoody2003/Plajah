// The sky for the region game: a dome that draws the reference sky panorama and then adds what the panorama cannot hold at this resolution, so the sky has
// depth up close: procedural cloud structure, a sun disc and glow, stars and a moon at night, horizon haze, weather (a real overcast and storm panorama blended
// in by the weather rig, darkening, lightning), a high cirrus layer and a flock of birds. region.ts feeds it every frame.
import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';

const TEX = '/games/forth-horizon/tex/';

const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }`;

const FRAG = `
  uniform sampler2D tBase, tOver, tStorm;
  uniform float uMixOver, uMixStorm, uSunAmt, uNight, uTime, uFogAmt, uDark, uFlash, uDetail;
  uniform vec3 uSunDir, uSunCol, uFog, uMoonDir;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  void main() {
    vec3 dir = normalize(vDir);
    float u = atan(dir.z, dir.x) * 0.15915494 + 0.5;
    float v = asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5;
    vec2 uv = vec2(u, v);
    vec3 col = texture2D(tBase, uv).rgb;
    col = mix(col, texture2D(tOver, uv).rgb, uMixOver);
    col = mix(col, texture2D(tStorm, uv).rgb, uMixStorm);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    // cloud structure: project the direction onto a plane (clouds foreshorten toward the horizon) and add layered noise where the panorama is cloud
    float up = max(dir.y, 0.0);
    vec3 cp = vec3(dir.xz / (up + 0.18), 0.0) * 1.7 + vec3(uTime * 0.012, 0.0, uTime * 0.006);
    float n1 = fbm(cp), n2 = fbm(cp * 3.1 + 4.0);
    float cloudy = smoothstep(0.30, 0.78, lum + (1.0 - uSunAmt) * 0.15);
    col *= 1.0 + uDetail * ((n1 - 0.5) * 0.9 + (n2 - 0.5) * 0.55) * (0.25 + cloudy);
    col = mix(col, col * (0.85 + 0.45 * smoothstep(0.35, 0.65, n1)), uDetail * 0.5 * cloudy);
    // sun
    float sd = max(dot(dir, uSunDir), 0.0);
    float disc = smoothstep(0.99935, 0.99975, sd);
    float glow = pow(sd, 120.0) * 0.55 + pow(sd, 10.0) * 0.16 + pow(sd, 3.0) * 0.05;
    float vis = uSunAmt * (1.0 - 0.9 * uMixOver);
    col += uSunCol * (disc * 9.0 + glow * 2.2) * vis * (1.0 - uNight);
    // night: stars and a moon
    if (uNight > 0.02 && dir.y > -0.05) {
      vec3 g = floor(dir * 260.0);
      float h = hash(g);
      float star = step(0.9962, h) * (0.35 + 0.65 * hash(g + 3.1)) * (0.75 + 0.25 * sin(uTime * 3.0 + h * 40.0));
      star *= smoothstep(0.0, 0.25, dir.y) * (1.0 - uMixOver) * uNight;
      col += vec3(0.85, 0.9, 1.0) * star * 1.4;
      float md = max(dot(dir, uMoonDir), 0.0);
      col += vec3(0.9, 0.93, 1.0) * (smoothstep(0.9993, 0.9998, md) * 2.2 + pow(md, 220.0) * 0.35 + pow(md, 12.0) * 0.05) * uNight * (1.0 - 0.9 * uMixOver);
    }
    // weather: darker, lightning lit from inside
    col *= 1.0 - uDark * 0.32;
    col += vec3(0.62, 0.72, 1.0) * uFlash * (0.25 + cloudy * 0.9);
    // horizon haze, and the sea level fog below it
    float hz = pow(1.0 - clamp(dir.y, 0.0, 1.0), 4.0);
    col = mix(col, uFog, clamp(hz * (0.18 + uFogAmt * 0.82), 0.0, 1.0));
    if (dir.y < 0.0) col = mix(col, uFog, smoothstep(0.0, -0.12, dir.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function cirrusTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 1024, 1024);
  let s = 12345; const r = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 520; i++) {
    const x = r() * 1024, y = r() * 1024, len = 90 + r() * 260, th = 3 + r() * 9, a = 0.05 + r() * 0.09, rot = (r() - 0.5) * 0.35;
    g.save(); g.translate(x, y); g.rotate(rot);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, len);
    grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
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
  private mat: THREE.ShaderMaterial;
  private cirrus: THREE.Mesh;
  private birds: THREE.InstancedMesh;
  private birdData: { cx: number; cz: number; r: number; h: number; a: number; w: number; ph: number }[] = [];
  private loader = new THREE.TextureLoader();
  private t = 0;
  private dummy = new THREE.Object3D();
  private tex: Record<string, THREE.Texture> = {};

  constructor(scene: THREE.Scene, atmosphere?: Atmosphere | null) {
    const placeholder = new THREE.DataTexture(new Uint8Array([120, 160, 220, 255]), 1, 1); placeholder.needsUpdate = true;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, transparent: false,
      uniforms: {
        tBase: { value: placeholder }, tOver: { value: placeholder }, tStorm: { value: placeholder },
        uMixOver: { value: 0 }, uMixStorm: { value: 0 }, uSunAmt: { value: 1 }, uNight: { value: 0 }, uTime: { value: 0 }, uFogAmt: { value: 0 }, uDark: { value: 0 }, uFlash: { value: 0 }, uDetail: { value: 0.9 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uFog: { value: new THREE.Color(0.7, 0.8, 0.9) },
        uMoonDir: { value: new THREE.Vector3(0.45, 0.62, -0.64).normalize() },
      },
    });
    atmosphere?.patchCustom(this.mat, 'sky');
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(18000, 48, 32), this.mat);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    // high cirrus streaks, a flat layer above the cumulus
    const ct = cirrusTexture(); ct.repeat.set(3, 3);
    const cg = new THREE.PlaneGeometry(60000, 60000); cg.rotateX(-Math.PI / 2);
    this.cirrus = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.3, depthWrite: false, fog: false, side: THREE.DoubleSide }));
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

  /** load the panoramas: base follows the time of day, overcast and storm are blended in by the weather */
  setBase(name: string, onLoaded?: (t: THREE.Texture) => void): void {
    this.load(name, (t) => { this.mat.uniforms.tBase.value = t; onLoaded?.(t); });
  }
  /** the panorama currently drawn (the water reflects it); null until it has loaded */
  baseTexture(): THREE.Texture | null { const t = this.mat.uniforms.tBase.value as THREE.Texture; return (t as THREE.DataTexture).isDataTexture ? null : t; }
  loadWeatherSkies(): void {
    this.load('sky2_overcast', (t) => { this.mat.uniforms.tOver.value = t; });
    this.load('sky2_storm', (t) => { this.mat.uniforms.tStorm.value = t; });
  }
  private load(name: string, cb: (t: THREE.Texture) => void): void {
    if (this.tex[name]) { cb(this.tex[name]); return; }
    this.loader.load(TEX + name + '.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 8;
      this.tex[name] = t; cb(t);
    });
  }

  update(dt: number, cam: THREE.Camera, st: SkyState): void {
    this.t += dt;
    const u = this.mat.uniforms;
    this.dome.position.copy(cam.position);
    u.uTime.value = this.t;
    u.uSunDir.value.copy(st.sunDir); u.uSunCol.value.copy(st.sunCol); u.uSunAmt.value = st.sunAmt; u.uNight.value = st.night;
    u.uFog.value.copy(st.fog); u.uFogAmt.value = st.fogAmt; u.uMixOver.value = st.mixOver; u.uMixStorm.value = st.mixStorm; u.uDark.value = st.dark; u.uFlash.value = st.flash;
    // cirrus follows the camera sideways and drifts
    this.cirrus.position.x = cam.position.x; this.cirrus.position.z = cam.position.z;
    const cm = this.cirrus.material as THREE.MeshBasicMaterial;
    cm.map!.offset.x += dt * 0.0006;
    cm.opacity = 0.34 * (1 - st.mixOver * 0.5) * (1 - st.night * 0.7);
    cm.color.setScalar(1 - st.dark * 0.7);
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
