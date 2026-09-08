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
  normalizeFluxSpec, fluxYawAtTime, fluxOrbitEye, fluxSceneBuilt,
  newFluxAudioState, driveFluxAudio, SILENT_AUDIO,
  type FluxSpec, type FluxSceneId, type FluxAudio, type FluxDriven, type FluxAudioState,
} from '../../../../services/fabula/fluxNode';

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
interface CamBase { target: [number, number, number]; radius: number }
interface SceneInst {
  scene: any;
  camera: any;
  cam: CamBase;
  /** set uniforms from the driven audio + spec, at clip-local time t */
  update(t: number, a: FluxDriven, spec: FluxSpec): void;
  /** optional energy dolly — a radius multiplier so the camera pulls back on the build */
  radiusScale?(a: FluxDriven): number;
  /** bloom strength for this frame (before spec.bloom) */
  bloom(a: FluxDriven): number;
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
      const compMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uBloom: { value: 0.7 }, uExposure: { value: 1.05 } }, vertexShader: VQ,
        fragmentShader: `precision highp float;uniform sampler2D tScene,tBloom;uniform vec2 uRes;uniform float uTime,uBloom,uExposure;varying vec2 vUv;
          vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}
          void main(){vec2 uv=vUv;vec2 dir=uv-0.5;
            vec3 col=texture2D(tScene,uv).rgb+texture2D(tBloom,uv).rgb*uBloom;
            col=aces(col*uExposure);
            float vig=smoothstep(1.25,0.3,length(dir));col*=mix(0.5,1.0,vig);
            float gr=fract(sin(dot(uv*uRes+uTime,vec2(12.9898,78.233)))*43758.5453);col+=(gr-0.5)*0.022;
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
const SCENE_BUILDERS: Record<FluxSceneId, ((THREE: any) => SceneInst) | undefined> = {
  field: buildField,
  lattice: undefined,
  tunnel: undefined,
  aurora: undefined,
};

function getScene(e: Env, id: FluxSceneId): SceneInst | null {
  const cached = e.scenes.get(id); if (cached) return cached;
  const b = SCENE_BUILDERS[id]; if (!b) return null;
  const inst = b(e.THREE); e.scenes.set(id, inst); return inst;
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
    scene, camera, cam: { target: [0, -1, 0], radius: 26 },
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

  // camera: deterministic from clip-local time; energy dolly pulls back on the build
  const dolly = inst.radiusScale ? inst.radiusScale(a) : 1;
  const yawDeg = fluxYawAtTime(spec, localT);
  const eye = fluxOrbitEye({ x: inst.cam.target[0], y: inst.cam.target[1], z: inst.cam.target[2] }, yawDeg, spec.pitch, inst.cam.radius * spec.distance * dolly);
  inst.camera.aspect = w / Math.max(1, h);
  inst.camera.position.set(eye.x, eye.y, eye.z); inst.camera.up.set(0, 1, 0);
  inst.camera.lookAt(inst.cam.target[0], inst.cam.target[1], inst.cam.target[2]);
  inst.camera.updateProjectionMatrix();

  inst.update(localT, a, spec);

  const bg = new THREE.Color(spec.background);
  renderer.setClearColor(bg, 1);
  renderer.setRenderTarget(e.rtScene); renderer.clear(); renderer.render(inst.scene, inst.camera);

  e.brightMat.uniforms.tDiffuse.value = e.rtScene.texture; pass(e, e.brightMat, e.rtA);
  const tx = 1 / e.hW, ty = 1 / e.hH;
  for (let r = 1; r <= 3; r++) {
    e.blurMat.uniforms.tDiffuse.value = e.rtA.texture; e.blurMat.uniforms.uDir.value.set(tx * r * 1.2, 0); pass(e, e.blurMat, e.rtB);
    e.blurMat.uniforms.tDiffuse.value = e.rtB.texture; e.blurMat.uniforms.uDir.value.set(0, ty * r * 1.2); pass(e, e.blurMat, e.rtA);
  }
  e.compMat.uniforms.uTime.value = localT;
  e.compMat.uniforms.uBloom.value = inst.bloom(a) * spec.bloom;
  e.compMat.uniforms.uExposure.value = 1.05 * spec.exposure;
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
