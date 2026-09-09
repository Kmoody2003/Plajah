// flux — the three.js renderer behind the Flux visual generators (Trapcode Form / Mir lineage).
//
// This is the runtime the FX suite only spec'd: a REAL 3D, audio-reactive generator — a flowing
// point-grid / fractal mesh, not a flat fullscreen fragment shader. It mirrors model3d.ts exactly:
// a lazy-imported three.js WebGLRenderer draws into ONE offscreen canvas that the compositor uploads
// as a layer element, so the live monitor at clip-local time t and the export frame at t are the
// same picture, and every Forge grade / mask / effect applies on top for free. The one thing model3d
// does not do and this must: react to audio — driven per frame by the pure envelope in fluxNode.
//
// Reused verbatim by Fabula (a clip source), the Pixels studio (a scene) and the DJ console (program
// out). All camera + audio maths that must be deterministic live in services/fabula/fluxNode.ts.
import {
  normalizeFluxSpec, fluxOrbitEye, fluxSceneBuilt,
  newFluxAudioState, driveFluxAudio, SILENT_AUDIO,
  type FluxSpec, type FluxSceneId, type FluxAudio, type FluxDriven, type FluxAudioState,
} from '../../../../services/fabula/fluxNode';
import { buildTapestryII, buildLattice, buildTunnel, buildAurora } from './fluxCouncilScenes';
import { buildPorcelainTide, buildVelvetBloom, buildPrismArchive } from './fluxAtelierScenes';

let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export function fluxStatus() { return status; }

// ── shared GLSL ──────────────────────────────────────────────────────────────────────────────────
// Rotated-octave fbm (quintic interp + domain rotation between octaves) — avoids the square-tile
// lattice artifact that plain value noise produces on a grid.
const NOISE = `
  float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),u.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x),u.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x),u.y),u.z);}
  mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,s, 0.,1.,0., -s,0.,c);}
  float fbm3(vec3 p){float s=0.,a=.5;mat3 R=rotY(0.7);for(int i=0;i<5;i++){s+=a*vnoise(p);p=R*p*2.02+vec3(1.7,9.2,3.3);a*=.5;}return s;}`;

// ── scene contract ─────────────────────────────────────────────────────────────────────────────
interface CamBase {
  target: [number, number, number];
  radius: number;
  pitch: number;   // scene's own framing pitch (deg); spec.pitch adds on top
  yaw: number;     // scene's own framing yaw (deg); spec.yaw + orbit add on top
  fov: number;     // vertical FOV (deg)
  lock?: boolean;  // static scenes (e.g. the tapestry): ignore orbit/dolly and spec pitch nudges
}
export interface SceneInst {
  scene: any;
  camera: any;
  cam: CamBase;
  /** set uniforms from the driven audio + spec, at clip-local time t */
  update(t: number, a: FluxDriven, spec: FluxSpec): void;
  /** optional energy dolly — a radius multiplier so the camera pulls back on the build */
  radiusScale?(a: FluxDriven): number;
  /** bloom strength for this frame (before spec.bloom) */
  bloom(a: FluxDriven): number;
  /** final tone-map exposure multiplier (default 1.05) */
  exposure?: number;
  /** bloom bright-pass threshold (default 0.85) */
  brightThreshold?: number;
  /** Linear-light grain amount; dark material studies need less than luminous fields. */
  grain?: number;
  dispose(): void;
}

// ── env: one renderer + bloom pipeline, shared across scenes ─────────────────────────────────────
interface Env {
  THREE: any; renderer: any; DPR: number; HTYPE: any;
  qScene: any; qCam: any; quad: any;
  brightMat: any; blurMat: any; compMat: any;
  rtScene: any; rtA: any; rtB: any; W: number; H: number; hW: number; hH: number;
  scenes: Map<FluxSceneId, SceneInst>;
  audio: FluxAudioState;
}
let env: Env | null = null;
let envLoading: Promise<Env | null> | null = null;

async function ensureEnv(): Promise<Env | null> {
  if (env) return env;
  if (envLoading) return envLoading;
  envLoading = (async () => {
    try {
      const THREE: any = await import(/* @vite-ignore */ 'three');
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (!canvas) return null;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, premultipliedAlpha: false });
      const DPR = 1; // offscreen: caller controls pixel size via w/h
      renderer.setPixelRatio(DPR);
      renderer.toneMapping = THREE.NoToneMapping; renderer.outputEncoding = THREE.LinearEncoding;
      const gl = renderer.getContext();
      const isGL2 = renderer.capabilities.isWebGL2;
      const canHalf = isGL2 || (!!gl.getExtension('OES_texture_half_float') && !!gl.getExtension('OES_texture_half_float_linear'));
      const HTYPE = canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;

      // fullscreen triangle for the post passes
      const qScene = new THREE.Scene(), qCam = new THREE.Camera();
      const qG = new THREE.BufferGeometry();
      qG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
      const quad = new THREE.Mesh(qG, null); qScene.add(quad);
      const VQ = 'varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,0.,1.);}';
      const brightMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uThresh: { value: 0.85 } }, vertexShader: VQ,
        fragmentShader: 'uniform sampler2D tDiffuse;uniform float uThresh;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));gl_FragColor=vec4(c*smoothstep(uThresh,uThresh+0.5,l),1.);}' });
      const blurMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VQ,
        fragmentShader: 'uniform sampler2D tDiffuse;uniform vec2 uDir;varying vec2 vUv;void main(){vec4 s=texture2D(tDiffuse,vUv)*0.227027;s+=texture2D(tDiffuse,vUv+uDir*1.3846)*0.316216;s+=texture2D(tDiffuse,vUv-uDir*1.3846)*0.316216;s+=texture2D(tDiffuse,vUv+uDir*3.2307)*0.070270;s+=texture2D(tDiffuse,vUv-uDir*3.2307)*0.070270;gl_FragColor=s;}' });
      const compMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uBloom: { value: 0.7 }, uExposure: { value: 1.05 }, uGrain: { value: 0.022 } }, vertexShader: VQ,
        fragmentShader: `precision highp float;uniform sampler2D tScene,tBloom;uniform vec2 uRes;uniform float uTime,uBloom,uExposure,uGrain;varying vec2 vUv;
          vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}
          void main(){vec2 uv=vUv;vec2 dir=uv-0.5;
            vec3 col=texture2D(tScene,uv).rgb+texture2D(tBloom,uv).rgb*uBloom;
            col=aces(col*uExposure);
            float vig=smoothstep(1.25,0.3,length(dir));col*=mix(0.5,1.0,vig);
            float gr=fract(sin(dot(uv*uRes+uTime,vec2(12.9898,78.233)))*43758.5453);col+=(gr-0.5)*uGrain;
            col=pow(max(col,0.),vec3(1.0/2.2));gl_FragColor=vec4(col,1.);}` });
      const RT = (w: number, h: number) => new THREE.WebGLRenderTarget(w, h, { type: HTYPE, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
      env = {
        THREE, renderer, DPR, HTYPE, qScene, qCam, quad, brightMat, blurMat, compMat,
        rtScene: RT(2, 2), rtA: RT(2, 2), rtB: RT(2, 2), W: 2, H: 2, hW: 1, hH: 1,
        scenes: new Map(), audio: newFluxAudioState(),
      };
      status = 'ready';
      return env;
    } catch (e) { console.warn('[flux] three init failed:', (e as Error)?.message || e); status = 'failed'; return null; }
  })();
  return envLoading;
}

// ── scene builders ───────────────────────────────────────────────────────────────────────────────
const SCENE_BUILDERS: Record<FluxSceneId, ((THREE: any, renderer: any) => SceneInst) | undefined> = {
  field: buildField,
  tapestry: buildTapestry,
  'tapestry-ii': buildTapestryII,
  lattice: buildLattice,
  tunnel: buildTunnel,
  aurora: buildAurora,
  'porcelain-tide': buildPorcelainTide,
  'velvet-bloom': buildVelvetBloom,
  'prism-archive': buildPrismArchive,
};

function getScene(e: Env, id: FluxSceneId): SceneInst | null {
  const cached = e.scenes.get(id); if (cached) return cached;
  const b = SCENE_BUILDERS[id]; if (!b) return null;
  const inst = b(e.THREE, e.renderer); e.scenes.set(id, inst); return inst;
}

// Flux Field — a structured Trapcode-Form dot-grid terrain over a faint Mir surface.
function buildField(THREE: any): SceneInst {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x04060a, 0.02);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
  const N = 174, SPAN = 46, CNT = N * N;
  const pos = new Float32Array(CNT * 3);
  let k = 0; for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { pos[k * 3] = (x / (N - 1) - 0.5) * SPAN; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = (z / (N - 1) - 0.5) * SPAN; k++; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uTre: { value: 0 }, uBeat: { value: 0 }, uKick: { value: 0 }, uSnare: { value: 0 }, uEnergy: { value: 0 }, uPix: { value: 1 }, uHue: { value: 0 } },
    vertexShader: NOISE + `
      uniform float uTime,uBass,uMid,uTre,uBeat,uKick,uSnare,uEnergy,uPix,uHue; varying vec3 vCol; varying float vG;
      float height(vec3 pw){float t=uTime*0.12*(1.0+uMid*0.8+smoothstep(0.3,1.0,uEnergy)*1.1);
        vec3 q=vec3(pw.x*0.10,t,pw.z*0.10);
        float h=fbm3(q)*1.0+fbm3(q*2.3+11.0)*0.4;
        h+=(fbm3(q*5.0+vec3(0.,uTime*2.0,0.))-0.5)*(smoothstep(0.3,1.0,uEnergy)*0.7+uSnare*0.7);
        float d=length(pw.xz); h+=sin(d*0.4-uTime*4.0)*0.14*uKick;
        return h;}
      void main(){vec3 pw=position;
        float h=height(pw);
        float y=(h-0.5)*(5.0+uBass*4.0)*(0.85+smoothstep(0.25,1.0,uEnergy)*0.9);
        vec3 p=vec3(pw.x,y,pw.z);
        float hn=clamp((h-0.35)*1.6,0.0,1.0);
        vec3 lo=vec3(0.02,0.08,0.28), midc=vec3(0.10,0.62,0.92), hi=vec3(0.75,0.98,1.0);
        vec3 c=mix(lo,midc,smoothstep(0.0,0.6,hn)); c=mix(c,hi,smoothstep(0.62,1.0,hn));
        c=mix(c, c.bgr, uHue*0.25);
        c+=(uKick*0.3+uSnare*0.25)*hn;
        vCol=c; vG=hn;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mv;
        float sz=(0.9+hn*2.2)*(1.0+uKick*0.5+uEnergy*0.4);
        gl_PointSize=sz*uPix*(90.0/max(0.1,-mv.z));
      }`,
    fragmentShader: `precision highp float;varying vec3 vCol;varying float vG;
      void main(){vec2 d=gl_PointCoord-0.5;float r=length(d);if(r>0.5)discard;
        float a=smoothstep(0.5,0.12,r);
        vec3 col=vCol*(0.4+vG*0.8);
        gl_FragColor=vec4(col,a*(0.5+vG*0.45));}`,
  });
  const field = new THREE.Points(g, mat); scene.add(field);

  const surfMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uBeat: { value: 0 }, uKick: { value: 0 }, uSnare: { value: 0 }, uEnergy: { value: 0 } },
    vertexShader: NOISE + `uniform float uTime,uBass,uMid,uBeat,uKick,uSnare,uEnergy;varying float vH;varying vec3 vN;varying vec3 vV;
      float height(vec3 pw){float t=uTime*0.12*(1.0+uMid*0.8+smoothstep(0.3,1.0,uEnergy)*1.1);vec3 q=vec3(pw.x*0.10,t,pw.z*0.10);float h=fbm3(q)*1.0+fbm3(q*2.3+11.0)*0.4;h+=(fbm3(q*5.0+vec3(0.,uTime*2.0,0.))-0.5)*(smoothstep(0.3,1.0,uEnergy)*0.7+uSnare*0.7);float d=length(pw.xz);h+=sin(d*0.4-uTime*4.0)*0.14*uKick;return h;}
      void main(){float AMP=(5.0+uBass*4.0)*(0.85+smoothstep(0.25,1.0,uEnergy)*0.9);vec3 pw=position;float h=height(pw);float y=(h-0.5)*AMP-0.25;
        float e=0.5;float hx=height(pw+vec3(e,0.,0.)),hz=height(pw+vec3(0.,0.,e));
        vec3 dx=vec3(e,(hx-h)*AMP,0.),dz=vec3(0.,(hz-h)*AMP,e);
        vN=normalize(cross(dz,dx));vH=h;
        vec4 mv=modelViewMatrix*vec4(pw.x,y,pw.z,1.0);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `precision highp float;varying float vH;varying vec3 vN;varying vec3 vV;
      void main(){float fres=pow(1.0-abs(dot(normalize(vN),normalize(vV))),3.0);
        float hn=clamp((vH-0.35)*1.6,0.,1.);
        vec3 base=mix(vec3(0.01,0.03,0.09),vec3(0.03,0.16,0.28),hn);
        vec3 col=base+vec3(0.2,0.8,1.0)*fres*0.6;
        gl_FragColor=vec4(col,0.55+fres*0.4);}`,
  });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN, N - 1, N - 1), surfMat);
  surf.rotation.x = -Math.PI / 2; scene.add(surf);

  return {
    scene, camera, cam: { target: [0, -1, 0], radius: 26, pitch: 16, yaw: 0, fov: 50 },
    update(t, a, spec) {
      const U = mat.uniforms;
      U.uTime.value = t; U.uBass.value = a.bass; U.uMid.value = a.mid; U.uTre.value = a.tre;
      U.uBeat.value = a.beat; U.uKick.value = a.kick; U.uSnare.value = a.snare; U.uEnergy.value = a.energy;
      U.uHue.value = 0.5 + 0.5 * Math.sin(t * 0.12) + (spec.hue - 0.5);
      const S = surfMat.uniforms;
      S.uTime.value = t; S.uBass.value = a.bass; S.uMid.value = a.mid; S.uBeat.value = a.beat;
      S.uKick.value = a.kick; S.uSnare.value = a.snare; S.uEnergy.value = a.energy;
    },
    radiusScale(a) { return 1 + Math.pow(Math.max(0, (a.energy - 0.3) / 0.7), 1.5) * 0.15; },
    bloom(a) { return 0.45 + a.kick * 0.35 + a.energy * 0.3; },
    dispose() {
      g.dispose(); mat.dispose(); surf.geometry.dispose(); surfMat.dispose();
    },
  };
}

// Deco Tapestry — an embroidered Art Deco tapestry on a marble gallery wall; the gilt motifs
// shape-shift, kaleidoscope and brighten to the music. A static (locked-camera) shot.
function buildTapestry(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x0a0806, 0.016);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 140);

  // JS value noise for the procedural marble
  const h2 = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const vn = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v; };
  const fbm = (x: number, y: number) => { let s = 0, a = .5, f = 1; for (let i = 0; i < 5; i++) { s += a * vn(x * f, y * f); f *= 2; a *= .5; } return s; };
  function marbleTex(sz: number, warm: boolean, lvl: number) {
    const c = document.createElement('canvas'); c.width = c.height = sz; const g = c.getContext('2d')!; const img = g.createImageData(sz, sz), d = img.data;
    for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
      const nx = x / sz, ny = y / sz; const turb = fbm(nx * 4.0, ny * 4.0) * 1.2;
      let vein = Math.abs(Math.sin((nx * 6.0 + turb * 3.0) * 3.14159)); vein = Math.pow(vein, 0.35);
      let v2 = Math.abs(Math.sin((ny * 3.0 - turb * 2.0) * 3.14159 + 2.0)); v2 = Math.pow(v2, 0.6);
      const base = lvl + 0.18 * fbm(nx * 8.0 + 9.0, ny * 8.0); const shade = base * (0.5 + 0.5 * vein) * (0.7 + 0.3 * v2);
      const i = (y * sz + x) * 4; d[i] = Math.min(255, shade * 255); d[i + 1] = Math.min(255, shade * (warm ? 0.92 : 0.99) * 255); d[i + 2] = Math.min(255, shade * (warm ? 0.82 : 1.06) * 255); d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  const marbleWall = marbleTex(512, true, 0.16), marbleFloor = marbleTex(512, false, 0.18), marbleStone = marbleTex(512, true, 0.19);
  marbleFloor.repeat.set(3, 3);

  function envTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#07080e'); grd.addColorStop(.46, '#12131a'); grd.addColorStop(.5, '#22212a'); grd.addColorStop(.55, '#0e0e14'); grd.addColorStop(1, '#040406'); g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,232,196,0.4)'; g.fillRect(120 + i * 180, 72, 70, 14); }
    const blob = (x: number, y: number, rx: number, ry: number, col: string) => { g.save(); g.translate(x, y); g.scale(rx, ry); const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(-1, -1, 2, 2); g.restore(); };
    blob(360, 140, 220, 110, 'rgba(255,224,180,0.22)'); blob(720, 300, 240, 120, 'rgba(255,150,70,0.12)');
    const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; return tex;
  }
  const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(envTexture()).texture; scene.environment = envMap;
  scene.background = new THREE.Color(0x060507);

  const wallMat = new THREE.MeshStandardMaterial({ map: marbleWall, roughness: 0.35, metalness: 0.12, envMap, envMapIntensity: 0.3 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: marbleStone, roughness: 0.4, metalness: 0.15, envMap, envMapIntensity: 0.45 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xb98f3c, metalness: 1, roughness: 0.3, envMap, envMapIntensity: 0.9, emissive: 0x241705, emissiveIntensity: 0.3 });
  const disposables: any[] = [marbleWall, marbleFloor, marbleStone, wallMat, stoneMat, goldMat];
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(50, 34), wallMat); wall.position.z = -2.9; scene.add(wall);
  const box = (w: number, h: number, d: number, mat: any, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); scene.add(m); disposables.push(m.geometry); return m; };
  [-5.2, 5.2].forEach(px => {
    box(1.5, 13.4, 1.1, stoneMat, px, 0, -1.8);
    for (let i = -1; i <= 1; i++) box(0.12, 11.5, 0.16, goldMat, px + i * 0.36, 0, -1.22);
    box(2.0, 0.7, 1.35, goldMat, px, 6.55, -1.75); box(1.85, 0.55, 1.3, stoneMat, px, 6.05, -1.75);
    box(2.1, 0.95, 1.4, stoneMat, px, -6.3, -1.75); box(2.35, 0.4, 1.5, goldMat, px, -6.85, -1.7);
  });
  box(12.8, 0.95, 1.4, stoneMat, 0, 7.35, -1.7); box(11.6, 0.6, 1.2, stoneMat, 0, 7.95, -1.6);
  box(10.4, 0.5, 1.0, goldMat, 0, 8.45, -1.5);
  for (let i = -4; i <= 4; i++) box(0.5, 0.5, 1.05, i % 2 ? goldMat : stoneMat, i * 1.1, 8.95, -1.5);
  box(12.8, 1.3, 1.35, stoneMat, 0, -5.7, -1.7); box(11.2, 0.45, 1.5, goldMat, 0, -4.95, -1.6);
  const FLOORY = -7.4;
  const floorMat = new THREE.MeshStandardMaterial({ map: marbleFloor, roughness: 0.08, metalness: 0.3, envMap, envMapIntensity: 0.9, transparent: true, opacity: 0.85 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOORY; scene.add(floor); disposables.push(floorMat, floor.geometry);

  // drifting passers-by, reflected in the floor
  const softSprite = (col: string) => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!; const rg = g.createRadialGradient(32, 64, 4, 32, 64, 60); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(32, 64, 20, 60, 0, 0, 7); g.fill(); return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); };
  const reflGroup = new THREE.Group(); reflGroup.scale.set(1, -1, 1); reflGroup.position.y = 2 * FLOORY; scene.add(reflGroup);
  const people: { s: any; baseX: number; sp: number; ph: number }[] = [];
  const cols = ['rgba(20,22,30,0.9)', 'rgba(40,30,25,0.85)', 'rgba(25,30,45,0.85)', 'rgba(50,40,30,0.8)'];
  for (let i = 0; i < 5; i++) { const s = softSprite(cols[i % cols.length]); s.scale.set(1.6, 4.4, 1); const baseX = -9 + i * 4.5; s.position.set(baseX, FLOORY + 2.2, -1.0 + (i % 2) * 0.8); reflGroup.add(s); people.push({ s, baseX, sp: 0.5 + (i * 0.37 % 1) * 0.6, ph: (i * 2.13) % 10 }); }
  for (let i = 0; i < 3; i++) { const s = softSprite('rgba(255,225,170,0.7)'); s.scale.set(2.2, 2.2, 1); s.position.set(-6 + i * 6, FLOORY + 3.6, -1.5); reflGroup.add(s); }

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9.2, 24), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.28, envMap, envMapIntensity: 0.9 }));
  rod.rotation.z = Math.PI / 2; rod.position.set(0, 4.5, 0.35); scene.add(rod);
  [-4.65, 4.65].forEach(x => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), new THREE.MeshStandardMaterial({ color: 0xcaa14a, metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.0 })); m.position.set(x, 4.5, 0.35); scene.add(m); });

  // authentic Art Deco motifs drawn crisply on canvas (gold linework as alpha)
  function decoCanvas(draw: (g: CanvasRenderingContext2D, s: number) => void) { const s = 512; const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d')!; g.clearRect(0, 0, s, s); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; draw(g, s); const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; return t; }
  const texFan = decoCanvas((g, s) => { const cx = s / 2, cy = s * 0.66, R = s * 0.52; g.lineWidth = s * 0.009; for (let i = 0; i <= 22; i++) { const a = Math.PI * (0.06 + i / 22 * 0.88); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - Math.cos(a) * R, cy - Math.sin(a) * R); g.stroke(); } for (let r = 1; r <= 5; r++) { g.lineWidth = s * 0.012; g.beginPath(); g.arc(cx, cy, R * r / 6, Math.PI, 2 * Math.PI); g.stroke(); } g.beginPath(); g.arc(cx, cy, s * 0.045, 0, 7); g.fill(); });
  const texRose = decoCanvas((g, s) => { const cx = s / 2, cy = s / 2; g.lineWidth = s * 0.011; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283, r1 = s * 0.11, r2 = s * 0.35; const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1, x2 = cx + Math.cos(a) * r2, y2 = cy + Math.sin(a) * r2; g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx + Math.cos(a + 0.27) * r2 * 0.72, cy + Math.sin(a + 0.27) * r2 * 0.72, x2, y2); g.quadraticCurveTo(cx + Math.cos(a - 0.27) * r2 * 0.72, cy + Math.sin(a - 0.27) * r2 * 0.72, x1, y1); g.stroke(); } g.beginPath(); g.arc(cx, cy, s * 0.085, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, s * 0.03, 0, 7); g.fill(); });
  const texMid = decoCanvas((g, s) => { const cx = s / 2, cy = s / 2; for (let r = 3; r <= 6; r++) { g.lineWidth = s * 0.011; g.beginPath(); g.arc(cx, cy, s * 0.062 * r, 0, 7); g.stroke(); } for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283; g.lineWidth = s * 0.006; g.beginPath(); g.moveTo(cx + Math.cos(a) * s * 0.40, cy + Math.sin(a) * s * 0.40); g.lineTo(cx + Math.cos(a) * s * 0.475, cy + Math.sin(a) * s * 0.475); g.stroke(); } });
  const texBorder = decoCanvas((g, s) => { g.lineWidth = s * 0.016; const m = s * 0.045; g.strokeRect(m, m, s - 2 * m, s - 2 * m); const m2 = s * 0.085; g.lineWidth = s * 0.009; g.strokeRect(m2, m2, s - 2 * m2, s - 2 * m2); ([[m, m, 1, 1], [s - m, m, -1, 1], [m, s - m, 1, -1], [s - m, s - m, -1, -1]] as number[][]).forEach(([x, y, sx, sy]) => { g.lineWidth = s * 0.012; for (let k = 1; k <= 3; k++) { const o = k * s * 0.03; g.beginPath(); g.moveTo(x + sx * o, y); g.lineTo(x, y + sy * o); g.stroke(); } }); });
  const texField = decoCanvas((g, s) => { const cx = s / 2, cy = s / 2, d = s * 0.34; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy); g.closePath(); g.stroke(); g.beginPath(); g.arc(cx, cy, s * 0.05, 0, 7); g.fill(); });
  texField.wrapS = texField.wrapT = THREE.RepeatWrapping;

  const TW = 8.4, TH = 8.5;
  const tapMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLowMid: { value: 0 }, uKick: { value: 0 }, uSnare: { value: 0 }, uEnergy: { value: 0 }, uLight: { value: new THREE.Vector3(0.3, 0.55, 0.8) }, uFan: { value: texFan }, uRose: { value: texRose }, uMid: { value: texMid }, uBorder: { value: texBorder }, uField: { value: texField } },
    vertexShader: NOISE + `
      uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float drape(vec2 u){ float sag=-(1.0-u.y)*(1.0-u.y)*0.12;
        return sag + (vnoise(vec3(u*7.0,3.0))-0.5)*0.045 + (vnoise(vec3(u*17.0,7.0))-0.5)*0.02; }
      void main(){vUv=uv; vec3 p=position; float e=0.02;
        float z0=drape(uv),zx=drape(uv+vec2(e,0.)),zy=drape(uv+vec2(0.,e)); p.z+=z0;
        vec3 dx=vec3(e*TW_,0.0,zx-z0), dy=vec3(0.0,e*TH_,zy-z0); vN=normalize(cross(dx,dy));
        vec4 mv=modelViewMatrix*vec4(p,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`
      .replace('TW_', TW.toFixed(1)).replace('TH_', TH.toFixed(1)),
    fragmentShader: NOISE + `precision highp float;
      uniform float uTime,uKick,uSnare,uEnergy; uniform vec3 uLight;
      uniform sampler2D uFan,uRose,uMid,uBorder,uField;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
      #define TAU 6.28318530718
      float kal(sampler2D tex,vec2 c,float folds,float sp,float rad){
        float a=atan(c.y,c.x)+sp, r=length(c), seg=TAU/folds;
        a=abs(mod(a,seg)-seg*0.5);
        vec2 p=vec2(cos(a),sin(a))*r*rad+0.5;
        return texture2D(tex,p).a;}
      float morph(vec2 c,float folds,float sp,float en){
        float p=fract(uTime*(0.04+en*0.17));
        float seq=p*3.0, fr=fract(seq); int i=int(floor(seq));
        float melt=sin(fr*3.14159265)*(0.018+en*0.035);
        c+=normalize(c+1e-4)*sin(length(c)*13.0-uTime*1.8)*melt;
        float A,B;
        if(i==0){A=kal(uFan,c,folds,sp,1.0);          B=kal(uRose,c,folds,sp*0.7,1.0);}
        else if(i==1){A=kal(uRose,c,folds,sp*0.7,1.0); B=kal(uMid,c,folds*0.8,-sp*0.6,1.1);}
        else {A=kal(uMid,c,folds*0.8,-sp*0.6,1.1);    B=kal(uFan,c,folds,sp,1.0);}
        float tn=vnoise(vec3(c*5.0,uTime*0.2))*0.55;
        return mix(A,B,smoothstep(tn,tn+0.5,fr));}
      vec3 decoPal(float x){x=fract(x);
        vec3 gold=vec3(0.92,0.72,0.30), jade=vec3(0.13,0.60,0.48), coral=vec3(0.86,0.37,0.33),
             teal=vec3(0.09,0.42,0.52), cream=vec3(0.93,0.87,0.70);
        float t=x*5.0, f=smoothstep(0.0,1.0,fract(t)); int i=int(floor(t));
        if(i==0)return mix(gold,jade,f);
        if(i==1)return mix(jade,coral,f);
        if(i==2)return mix(coral,teal,f);
        if(i==3)return mix(teal,cream,f);
        return mix(cream,gold,f);}
      float pat(vec2 uv){
        float en=uEnergy, cx=smoothstep(0.10,0.85,en);
        vec2 c=uv-0.5; float r0=length(c);
        c*=1.0-uKick*0.05;
        c=rot(uSnare*0.20)*c;
        float wa=cx*0.018+uKick*0.018;
        c+=normalize(c+1e-4)*sin(r0*(10.0+cx*13.0)-uTime*(1.3+cx*2.0))*wa;
        c+=(vec2(vnoise(vec3(c*3.0,uTime*0.20)),vnoise(vec3(c*3.0+9.0,uTime*0.20)))-0.5)*cx*0.030;
        float f1=mix(8.0,18.0,cx), f2=mix(5.0,11.0,cx), sp=uTime*0.10+en*0.60;
        float core=morph(c,f1,sp,en);
        float twin=kal(uMid,c,f2,-sp*0.8,1.15)*mix(0.12,0.95,cx);
        float fine=kal(uRose,c,mix(16.0,44.0,cx),sp*1.7,1.75)*smoothstep(0.55,1.0,en)*0.85;
        vec2 mr=rot(-uTime*0.10)*c+0.5;
        float midring=texture2D(uMid,mr).a*smoothstep(0.2,0.7,en);
        float border=texture2D(uBorder,uv).a;
        float field=texture2D(uField,uv*mix(3.0,6.0,cx)).a*smoothstep(0.5,1.0,en)*0.7;
        float g=max(max(core,twin),max(fine,midring));
        return clamp(max(max(g,border),field),0.0,1.0);}
      void main(){vec2 uv=vUv; float e=0.003;
        float m=pat(uv);
        float mx=pat(uv+vec2(e,0.))-m, my=pat(uv+vec2(0.,e))-m;
        vec3 N=normalize(vN - vec3(mx,my,0.0)*6.0);
        float warp=0.5+0.5*sin(uv.x*520.0), weft=0.5+0.5*sin(uv.y*580.0);
        float basket=mix(warp,weft, mod(floor(uv.x*130.0)+floor(uv.y*150.0),2.0));
        float slub=0.85+0.3*vnoise(vec3(uv*40.0,0.0));
        vec3 clothCol=mix(vec3(0.028,0.095,0.105),vec3(0.05,0.155,0.17),0.4+0.6*basket)*slub;
        vec3 gold=mix(vec3(0.85,0.64,0.27),vec3(1.12,0.92,0.56),0.5+0.5*sin(uTime*0.25));
        float rr=length(vUv-0.5);
        vec3 decoShift=decoPal(uTime*0.025+rr*0.35+uEnergy*0.35);
        vec3 emb=mix(gold, decoShift, smoothstep(0.30,0.9,uEnergy)*0.55 + uKick*0.15);
        float stitch=0.72+0.28*sin((uv.x+uv.y)*280.0);
        float goldMask=clamp(m,0.,1.)*stitch;
        vec3 base=mix(clothCol, emb, goldMask);
        vec3 L=normalize(uLight); float wrap=clamp((dot(N,L)+0.45)/1.45,0.0,1.0);
        float dif=0.32+0.68*wrap;
        float sheen=pow(1.0-max(0.,dot(N,normalize(vV))),4.0)*0.10;
        float goldSpec=pow(max(0.,dot(reflect(-L,N),normalize(vV))),26.0)*goldMask*0.4;
        vec3 col=base*dif + vec3(0.6,0.72,0.8)*sheen + vec3(1.0,0.9,0.7)*goldSpec;
        col += emb*goldMask*(0.30 + uEnergy*0.85 + uKick*0.55 + uSnare*0.8);
        gl_FragColor=vec4(col,1.0);}`,
  });
  const tapGeo = new THREE.PlaneGeometry(TW, TH, 120, 140);
  const tap = new THREE.Mesh(tapGeo, tapMat); tap.position.y = 0.2; scene.add(tap);
  const tapRefl = new THREE.Mesh(tapGeo, tapMat); tapRefl.position.y = 0.2; reflGroup.add(tapRefl);
  disposables.push(tapGeo, tapMat, texFan, texRose, texMid, texBorder, texField);

  scene.add(new THREE.AmbientLight(0x0a0c14, 0.2));
  const spot = new THREE.SpotLight(0xfff0d6, 6.0, 44, 0.62, 0.5, 1.0); spot.position.set(2, 7, 10); spot.target.position.set(0, 0.2, 0); scene.add(spot); scene.add(spot.target);
  const key = new THREE.DirectionalLight(0xffe6c0, 1.1); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffcf8a, 0.9); rim.position.set(-5, 2, 2); scene.add(rim);

  return {
    scene, camera,
    cam: { target: [0, 0.2, 0], radius: 14.6, pitch: 1.96, yaw: 0, fov: 43, lock: true },
    exposure: 0.88, brightThreshold: 0.92,
    update(t, a) {
      const U = tapMat.uniforms;
      U.uTime.value = t;
      U.uLowMid.value = Math.min(1, a.bass * 0.6 + a.mid * 0.6);
      U.uKick.value = a.kick; U.uSnare.value = a.snare; U.uEnergy.value = a.energy;
      spot.intensity = 5.5 + a.kick * 3.0; key.intensity = 0.9 + a.kick * 0.6;
      for (const p of people) {
        p.s.position.x = ((p.baseX + 14 + t * p.sp * 1.0 * (1 + a.energy)) % 28) - 14;
        p.s.material.opacity = 0.5 + 0.3 * Math.sin(t * 0.5 + p.ph);
      }
    },
    bloom(a) { return 0.45 + a.kick * 0.35 + a.energy * 0.25; },
    dispose() { for (const d of disposables) { try { d.dispose?.(); } catch { /* */ } } envMap?.dispose?.(); pmrem?.dispose?.(); },
  };
}

// ── render ───────────────────────────────────────────────────────────────────────────────────────
function ensureSize(e: Env, w: number, h: number) {
  const W = Math.max(2, Math.floor(w)), H = Math.max(2, Math.floor(h));
  if (W === e.W && H === e.H) return;
  e.W = W; e.H = H; e.hW = Math.max(2, W >> 1); e.hH = Math.max(2, H >> 1);
  e.renderer.setSize(W, H, false);
  e.rtScene.setSize(W, H); e.rtA.setSize(e.hW, e.hH); e.rtB.setSize(e.hW, e.hH);
  e.compMat.uniforms.uRes.value.set(W, H);
}

function pass(e: Env, m: any, target: any) { e.quad.material = m; e.renderer.setRenderTarget(target || null); e.renderer.render(e.qScene, e.qCam); }

function renderFrame(e: Env, inst: SceneInst, spec: FluxSpec, w: number, h: number, localT: number, audio: FluxAudio): HTMLCanvasElement {
  const { THREE, renderer } = e;
  ensureSize(e, w, h);
  const a = driveFluxAudio(e.audio, audio || SILENT_AUDIO, localT, spec.sensitivity);

  // camera: the scene's own framing + spec offsets; deterministic from clip-local time.
  // Locked scenes (e.g. the tapestry, a static wall shot) ignore orbit/dolly and pitch nudges.
  const locked = !!inst.cam.lock;
  const dolly = (!locked && inst.radiusScale) ? inst.radiusScale(a) : 1;
  const orbit = (!locked && spec.camera === 'orbit') ? spec.orbitSpeed * Math.max(0, localT) : 0;
  const yawDeg = inst.cam.yaw + spec.yaw + orbit;
  const pitchDeg = inst.cam.pitch + (locked ? 0 : spec.pitch);
  const eye = fluxOrbitEye({ x: inst.cam.target[0], y: inst.cam.target[1], z: inst.cam.target[2] }, yawDeg, pitchDeg, inst.cam.radius * spec.distance * dolly);
  inst.camera.fov = inst.cam.fov;
  inst.camera.aspect = w / Math.max(1, h);
  inst.camera.position.set(eye.x, eye.y, eye.z); inst.camera.up.set(0, 1, 0);
  inst.camera.lookAt(inst.cam.target[0], inst.cam.target[1], inst.cam.target[2]);
  inst.camera.updateProjectionMatrix();

  inst.update(localT, a, spec);

  const bg = new THREE.Color(spec.background);
  renderer.setClearColor(bg, 1);
  renderer.setRenderTarget(e.rtScene); renderer.clear(); renderer.render(inst.scene, inst.camera);

  e.brightMat.uniforms.uThresh.value = inst.brightThreshold ?? 0.85;
  e.brightMat.uniforms.tDiffuse.value = e.rtScene.texture; pass(e, e.brightMat, e.rtA);
  const tx = 1 / e.hW, ty = 1 / e.hH;
  for (let r = 1; r <= 3; r++) {
    e.blurMat.uniforms.tDiffuse.value = e.rtA.texture; e.blurMat.uniforms.uDir.value.set(tx * r * 1.2, 0); pass(e, e.blurMat, e.rtB);
    e.blurMat.uniforms.tDiffuse.value = e.rtB.texture; e.blurMat.uniforms.uDir.value.set(0, ty * r * 1.2); pass(e, e.blurMat, e.rtA);
  }
  e.compMat.uniforms.uTime.value = localT;
  e.compMat.uniforms.uGrain.value = inst.grain ?? 0.022;
  e.compMat.uniforms.uBloom.value = inst.bloom(a) * spec.bloom;
  e.compMat.uniforms.uExposure.value = (inst.exposure ?? 1.05) * spec.exposure;
  e.compMat.uniforms.tScene.value = e.rtScene.texture; e.compMat.uniforms.tBloom.value = e.rtA.texture;
  pass(e, e.compMat, null);
  renderer.setRenderTarget(null);
  return renderer.domElement as HTMLCanvasElement;
}

/** Exact per-frame render (offline export). Awaits three init; returns null if unavailable. */
export async function renderFlux(specIn: Partial<FluxSpec>, w: number, h: number, localT: number, audio?: FluxAudio): Promise<HTMLCanvasElement | null> {
  const spec = normalizeFluxSpec(specIn);
  if (!fluxSceneBuilt(spec.scene)) return null;
  const e = await ensureEnv(); if (!e) return null;
  const inst = getScene(e, spec.scene); if (!inst) return null;
  try { return renderFrame(e, inst, spec, w, h, localT, audio || SILENT_AUDIO); }
  catch (err) { console.warn('[flux] render failed:', (err as Error)?.message || err); return null; }
}

/** Live per-rAF render. Returns null until three is ready (kicking off the init). */
export function renderFluxLatest(specIn: Partial<FluxSpec>, w: number, h: number, localT: number, audio?: FluxAudio): HTMLCanvasElement | null {
  const spec = normalizeFluxSpec(specIn);
  if (!fluxSceneBuilt(spec.scene)) { ensureEnv(); return null; }
  if (!env) { ensureEnv(); return null; }
  const inst = getScene(env, spec.scene); if (!inst) return null;
  try { return renderFrame(env, inst, spec, w, h, localT, audio || SILENT_AUDIO); }
  catch (err) { console.warn('[flux] live render failed:', (err as Error)?.message || err); return null; }
}

export type { FluxSpec, FluxSceneId, FluxAudio };
