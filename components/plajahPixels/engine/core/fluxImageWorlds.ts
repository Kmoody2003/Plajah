// fluxImageWorlds — FLUX CANVAS: still images brought to life as Flux scenes that play the song.
// The image list and ids live in services/fabula/fluxCanvasCatalog.ts; how to add one: docs/FLUX_CANVAS.md.
//
//  A · LIVING PLATE  ("img-plate:<id>")  The picture as a Mir-style relief (Depth Anything V2 depth)
//      whose materials stream along their own contours, glows on its brightest materials, and a
//      Trapcode-Form point layer. The director frames it; the frame never shows the picture's edge.
//  B · IMAGE WORLD   ("img-world:<id>")  The picture rebuilt as a 3D place at real scale: near, mid and
//      far layers of Form point-clouds, Tao ribbons, Mir terrain, instanced crystals/glass/bubbles,
//      embers, volumetric mist, cloth and a moving-light rig — every colour taken from the image.
//  SHOW              ("img-show:<id>")   Both, cut together by the song: the plate for intimate
//      sections, the world for the drops, as the councils directed.
//
// Hearing: the platform's split — kick / snare / hat onsets, a flywheel beat clock, bass wobble,
// drops, builds and breakdowns (imageWorldAudio.ts on StageAudio), plus the Music Intelligence song map
// when the host knows the track. Direction: the beat-locked director (imageWorldDirector.ts) reading
// the councils' per-image direction (imageWorldDirection*.ts); the Lighting Director's looks drive the
// rig and the colour wash. Efficiency: counts scale with the device tier and a frame governor trims
// instances/points live (never during export), points are shuffled so trimming thins evenly.
import type { SceneInst } from './flux';
import type { FluxAudio, FluxDriven } from '../../../../services/fabula/fluxNode';
import { WorldEars, type WorldAudioIn, type WorldCues } from './imageWorldAudio';
import { ImageDirector, type PlateRig, type Pose, type WorldRig } from './imageWorldDirector';
import { resolveDirection, type SectionKind, type WorldDirection } from './imageWorldDirection';
import { IMAGE_WORLD_DIRECTION } from './imageWorldDirection.data';
import { LOOK_PRESETS } from '../../../../services/lighting/looks';

// ── catalog (shared with pickers; no three.js) ──
import { FLUX_CANVAS_IMAGES, canvasShowId, canvasPlateId, canvasWorldId, type CanvasImage } from '../../../../services/fabula/fluxCanvasCatalog';
export type ImageWorldInfo = CanvasImage;
export const IMAGE_WORLDS = FLUX_CANVAS_IMAGES;
export const imagePlateId = canvasPlateId;
export const imageWorldId = canvasWorldId;
export const imageShowId = canvasShowId;
/** Where plates/<id>.jpg and depth/<id>.png are served (public/visualizers/canvas in the app). */
export const fluxCanvasBase = () => ((globalThis as any).__PLAJAH_ASSET_BASE ?? '/visualizers/') + 'canvas/';
export const imageWorldDirection = (id: string): WorldDirection => resolveDirection(IMAGE_WORLD_DIRECTION[id]);

// ── device tier + count scaling ────────────────────────────────────────────────────────────────────
/** 1 desktop GPU · 0.6 modest laptop/tablet · 0.35 phone. Override: localStorage 'plajah.flux.tier'. */
export function imageWorldTier(): number {
  try { const o = Number(localStorage.getItem('plajah.flux.tier')); if (o > 0) return Math.min(1, o); } catch { /* no storage */ }
  if (typeof navigator === 'undefined') return 1;
  const mobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4, mem = (navigator as any).deviceMemory || 8;
  if (mobile) return 0.35;
  return cores <= 4 || mem <= 4 ? 0.6 : 1;
}
let Q = 1;
const cnt = (n: number) => Math.max(1, Math.round(n * Q));
const seg = (n: number) => Math.max(8, Math.round(n * Math.sqrt(Q)));

// ── shared GLSL ────────────────────────────────────────────────────────────────────────────────────
const LIB = `
  float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float h21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
  float h11(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
  float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),u.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x),u.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x),u.y),u.z);}
  float fbm3(vec3 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*vnoise(p);p=p*2.03+vec3(1.7,9.2,3.3);a*=.5;}return s;}
  vec3 curl3(vec3 p){const float e=.12;vec3 o2=vec3(31.4,-7.1,12.9),o3=vec3(-17.9,47.2,9.3);
    float a1y=vnoise(p+vec3(0,e,0))-vnoise(p-vec3(0,e,0)),a1z=vnoise(p+vec3(0,0,e))-vnoise(p-vec3(0,0,e));
    float a2x=vnoise(p+o2+vec3(e,0,0))-vnoise(p+o2-vec3(e,0,0)),a2z=vnoise(p+o2+vec3(0,0,e))-vnoise(p+o2-vec3(0,0,e));
    float a3x=vnoise(p+o3+vec3(e,0,0))-vnoise(p+o3-vec3(e,0,0)),a3y=vnoise(p+o3+vec3(0,e,0))-vnoise(p+o3-vec3(0,e,0));
    return vec3(a3y-a2z,a1z-a3x,a2x-a1y)/(2.*e);}
  vec3 swirl(vec3 p){return vec3(sin(p.y*1.7+p.z*.6),sin(p.z*1.3+p.x*.8),sin(p.x*1.5+p.y*.7))+.5*vec3(sin(p.z*3.1),sin(p.x*2.9),sin(p.y*3.3));}
  vec3 lin(vec3 c){return pow(max(c,vec3(0.)),vec3(2.2));}
  float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
  vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
    vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x);}
  vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
  vec3 film(float x){return .5+.5*cos(6.2831*(x+vec3(0.,.33,.67)));}
  mat3 rot3(vec3 a){float cx=cos(a.x),sx=sin(a.x),cy=cos(a.y),sy=sin(a.y),cz=cos(a.z),sz=sin(a.z);
    return mat3(cy*cz,cy*sz,-sy, sx*sy*cz-cx*sz,sx*sy*sz+cx*cz,sx*cy, cx*sy*cz+sx*sz,cx*sy*sz-sx*cz,cx*cy);}
`;
// Uniforms every material shares (the same {value} objects, driven once per frame from the cues).
// uGDrop = (explode, shockwave, flash, spin) · uGBuild = (gather, tremble, rise, brighten) · uGBreak = (slow, desaturate, flatten, sparse)
const SHARED_DECL = `
  uniform float uTime,uFlow,uBass,uMid,uTre,uKick,uSnare,uHat,uEnergy,uCurve,uMorph,uPix,uDrop,uBuild,uBreak,uWob,uPump,uBeat,uGlowI,uLookAmt,uJig,uMorphOn;
  uniform float uSpec[16];
  uniform vec4 uGDrop,uGBuild,uGBreak;
  uniform vec3 uLightDir,uFogCol,uLookA,uLookB; uniform float uFogDen;
  float eq(float x){int i=int(clamp(x,0.,.999)*16.);return uSpec[i];}
  vec3 grade(vec3 c,vec3 w){
    c=mix(c,vec3(luma(c)),clamp(uBreak*uGBreak.y*.6,0.,.8));
    c*=1.+uBuild*uGBuild.w*.25+uDrop*uDrop*uGDrop.z*.3;
    vec3 wash=mix(uLookA,uLookB,.5+.5*sin(w.x*.04+w.z*.03+uBeat*.785));
    return c*mix(vec3(1.),.35+wash*1.3,uLookAmt*.3);}
  vec3 fogged(vec3 c,vec3 w){c=grade(c,w);return mix(uFogCol,c,exp(-length(cameraPosition-w)*uFogDen));}
`;
const LIVING = `
  uniform sampler2D uMap,uFlowTex; uniform vec2 uTexel; uniform vec2 uFlowDir; uniform float uFlowAmt,uFlowRate,uLod;
  uniform vec4 uGlowA,uGlowB; uniform vec3 uGlowColA,uGlowColB; uniform float uGlowDA,uGlowDB;
  vec3 plate(vec2 uv){return lin(textureLod(uMap,uv,uLod).rgb);}
  // The image's own contour directions are baked once per image (flowTexture): one lookup per pixel.
  vec3 living(vec2 uv){
    if(uFlowAmt<=0.)return plate(uv);
    vec4 fl=texture2D(uFlowTex,uv);vec2 tn=fl.xy*2.-1.;if(dot(tn,uFlowDir)<0.)tn=-tn;
    float ra=uFlow*.07;vec2 nz=mat2(cos(ra),-sin(ra),sin(ra),cos(ra))*(fl.zw-.5);
    vec2 d=(tn+nz+uFlowDir*.3)*uFlowAmt*(1.+uWob*.35+uDrop*.6)*vec2(uTexel.x/uTexel.y,1.);
    float ph=uFlow*uFlowRate+fl.z*.9;float p0=fract(ph),p1=fract(ph+.5),w=1.-abs(2.*p0-1.);
    return mix(plate(uv+d*(p1-.5)),plate(uv+d*(p0-.5)),w);}
  float hueMask(vec3 s,vec4 g){if(g.y<=0.)return 0.;vec3 h=rgb2hsv(s);float dh=abs(fract(h.x-g.x+.5)-.5);
    return smoothstep(g.y,g.y*.35,dh)*smoothstep(g.z,g.z+.15,h.y)*smoothstep(g.w,g.w+.2,h.z);}
  vec3 glow(vec2 uv,vec3 c){vec3 s=textureLod(uMap,uv,1.).rgb;float n=.6+1.4*vnoise(vec3(uv*7.,uFlow*.25));
    return c*(hueMask(s,uGlowA)*uGlowDA*uGlowColA+hueMask(s,uGlowB)*uGlowDB*uGlowColB)*n*uGlowI;}
`;

// ── per-frame drive: the ears → shared uniforms ────────────────────────────────────────────────────
type U = Record<string, { value: any }>;
interface GlowCfg { hue: number; width: number; sat: number; val: number; color: [number, number, number]; band: [number, number, number]; kick?: number; base?: number }
const v3 = (T: any, x: number, y: number, z: number) => new T.Vector3(x, y, z);
const col = (T: any, hex: number | string) => { const c = new T.Color(hex); return v3(T, Math.pow(c.r, 2.2), Math.pow(c.g, 2.2), Math.pow(c.b, 2.2)); };

// Lighting Director: a look's pose → beam aim (toward-centre, crossing, vertical flip); effects → (chase, sweep, pulse, strobe).
const POSE_AIM: Record<string, [number, number, number]> = { down: [0.15, 0, 0], fan: [-0.35, 0.25, 0], cross: [0.4, 0.6, 0], audience: [0.95, 0, 0], center: [0.75, 0, 0], wide: [-0.6, 0.1, 0], up: [-0.2, 0.15, 1] };
function lookOf(name: string) { return LOOK_PRESETS.find(l => l.name === name) || LOOK_PRESETS.find(l => l.name === 'Arena Blue') || LOOK_PRESETS[0]; }
function lookFx(l: ReturnType<typeof lookOf>): [number, number, number, number] {
  const has = (k: string) => l.effects.some(e => (e.kind as string).includes(k)) ? 1 : 0;
  return [has('chase'), has('sweep') || has('circle') ? 1 : 0, has('pulse') || has('breath') ? 1 : 0, has('strobe') || has('flicker') ? 1 : 0];
}

function makeDrive(T: any, renderer: any, dir: WorldDirection, plateMode: boolean) {
  const U: U = {
    uTime: { value: 0 }, uFlow: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uTre: { value: 0 }, uKick: { value: 0 }, uSnare: { value: 0 }, uHat: { value: 0 },
    uEnergy: { value: 0 }, uCurve: { value: 0 }, uMorph: { value: 0 }, uPix: { value: 1 }, uDrop: { value: 0 }, uBuild: { value: 0 }, uBreak: { value: 0 },
    uWob: { value: 0 }, uPump: { value: 0 }, uBeat: { value: 0 }, uJig: { value: 0 }, uMorphOn: { value: 1 }, uGlowI: { value: dir.intensity.glow }, uLookAmt: { value: 0 },
    uSpec: { value: new Array(16).fill(0) },
    uGDrop: { value: new T.Vector4(...(['explode', 'shockwave', 'flash', 'spin'] as const).map(g => dir.gestures.drop.includes(g) ? 1 : 0)) },
    uGBuild: { value: new T.Vector4(...(['gather', 'tremble', 'rise', 'brighten'] as const).map(g => dir.gestures.build.includes(g) ? 1 : 0)) },
    uGBreak: { value: new T.Vector4(...(['slow', 'desaturate', 'flatten', 'sparse'] as const).map(g => dir.gestures.breakdown.includes(g) ? 1 : 0)) },
    uLightDir: { value: v3(T, .4, .8, .6).normalize() }, uFogCol: { value: v3(T, 0, 0, 0) }, uFogDen: { value: 0 },
    uLookA: { value: v3(T, 1, 1, 1) }, uLookB: { value: v3(T, 1, 1, 1) },
    // light rig (beams)
    uPose: { value: v3(T, 0.15, 0, 0) }, uLookFx: { value: new T.Vector4(0, 0, 0, 0) }, uLookLevel: { value: 1 },
  };
  const ears = new WorldEars();
  const accent = dir.lightPalette.map(h => new T.Color(h));
  const tA = new T.Color(), tB = new T.Color(), cur = { a: new T.Color(1, 1, 1), b: new T.Color(1, 1, 1) };
  let lastT = Number.NaN, flow = 0, morph = 0, section: SectionKind | '' = '', kickAt = -10, kickAmp = 0;
  return {
    U, ears, cues: ears.c as WorldCues, dir, plate: plateMode,
    step(this: { plate: boolean }, t: number, raw: WorldAudioIn, flowSpeed: number): WorldCues {
      if (t === lastT) return ears.c;
      lastT = t;
      const c = ears.update(t, raw), r = dir.intensity.reactivity;
      if (c.t < 0.05) { flow = 0; morph = 0; }
      const slow = 1 - 0.55 * c.breakdown * U.uGBreak.value.x;
      flow += c.dt * flowSpeed * (0.3 + c.curve * 1.0 + c.energy * 0.4 + c.bass * 0.3 + c.wobDepth * 0.4) * slow * (1 + c.build * 0.8) * (1 + c.drop * 0.6);
      const mTarget = Math.max(0, Math.min(1, (c.curve - 0.35) * 1.7 + c.drop * 0.6 - c.breakdown * 0.8));
      morph += (mTarget - morph) * (1 - Math.exp(-c.dt / (c.dropHit ? 0.05 : 1.6)));
      U.uTime.value = t; U.uFlow.value = flow; U.uMorph.value = morph;
      U.uBass.value = c.bass * r; U.uMid.value = c.mid * r; U.uTre.value = c.tre * r;
      U.uKick.value = c.kick * r; U.uSnare.value = c.snare * r; U.uHat.value = c.hat * r;
      U.uEnergy.value = c.energy; U.uCurve.value = c.curve; U.uDrop.value = Math.min(1, c.drop * (0.6 + 0.4 * r)); U.uBuild.value = c.build; U.uBreak.value = c.breakdown;
      U.uWob.value = c.wob * c.wobDepth * r; U.uPump.value = c.pump; U.uBeat.value = c.beat;
      // goo / tissue settling: a damped oscillation after each kick
      if (c.kickHit) { kickAt = t; kickAmp = Math.min(1.2, 0.6 + c.bass); }
      const tk = Math.max(0, t - kickAt); U.uJig.value = Math.sin(tk * 26) * Math.exp(-tk * 6.5) * kickAmp * r;
      U.uGlowI.value = dir.intensity.glow;
      const sp = raw.spectrum; for (let i = 0; i < 16; i++) U.uSpec.value[i] = sp?.[i] ?? (i < 5 ? c.bass : i < 11 ? c.mid : c.tre);
      U.uPix.value = Math.max(0.4, (renderer?.domElement?.height || 1080) / 1080);
      U.uLightDir.value.set(Math.sin(flow * 0.06) * 0.7, 0.8, Math.cos(flow * 0.06) * 0.7 + 0.3).normalize();
      // Lighting Director: the section's look, its palette mixed with the image's accents; snap on the drop.
      if (c.section !== section || c.dropHit) {
        section = c.section;
        const l = lookOf(dir.looks[c.section]);
        tA.set(l.palette[0] || '#ffffff').lerp(accent[0] || tA, 0.5);
        tB.set(l.palette[1] || l.palette[0] || '#ffffff').lerp(accent[1] || accent[0] || tB, 0.5);
        const aim = POSE_AIM[l.pose] || POSE_AIM.down; U.uPose.value.set(...aim);
        U.uLookFx.value.set(...lookFx(l)); U.uLookLevel.value = l.level;
        if (c.dropHit) { cur.a.copy(tA); cur.b.copy(tB); }
      }
      const e = 1 - Math.exp(-c.dt / 0.5); cur.a.lerp(tA, e); cur.b.lerp(tB, e);
      U.uLookA.value.set(Math.pow(cur.a.r, 2.2), Math.pow(cur.a.g, 2.2), Math.pow(cur.a.b, 2.2));
      U.uLookB.value.set(Math.pow(cur.b.r, 2.2), Math.pow(cur.b.g, 2.2), Math.pow(cur.b.b, 2.2));
      U.uLookAmt.value = (0.35 + 0.45 * c.curve + c.drop * 0.4) * dir.intensity.glow * (this.plate ? 0.5 : 1);
      return c;
    },
  };
}
const glowDrive = (g: GlowCfg | undefined, c: WorldCues) => !g ? 0 :
  (g.base ?? 0.25) + g.band[0] * c.bass + g.band[1] * c.mid + g.band[2] * c.tre + (g.kick ?? 0) * c.kick + c.drop * c.drop * 0.4 + c.wobDepth * g.band[0] * 0.4;
function livingUniforms(T: any, map: any, o: { flowDir?: [number, number]; flowAmt?: number; flowRate?: number; lod?: number; glowA?: GlowCfg; glowB?: GlowCfg }) {
  const g = (c?: GlowCfg) => c ? new T.Vector4(c.hue, c.width, c.sat, c.val) : new T.Vector4(0, 0, 0, 0);
  return {
    uMap: { value: map }, uFlowTex: { value: map.userData.flow ?? map }, uTexel: { value: new T.Vector2(1 / 1376, 1 / 768) }, uFlowDir: { value: new T.Vector2(...(o.flowDir ?? [1, 0])).normalize() },
    uFlowAmt: { value: o.flowAmt ?? 0.035 }, uFlowRate: { value: o.flowRate ?? 0.35 }, uLod: { value: o.lod ?? 0 },
    uGlowA: { value: g(o.glowA) }, uGlowB: { value: g(o.glowB) },
    uGlowColA: { value: o.glowA ? v3(T, ...o.glowA.color) : v3(T, 0, 0, 0) }, uGlowColB: { value: o.glowB ? v3(T, ...o.glowB.color) : v3(T, 0, 0, 0) },
    uGlowDA: { value: 0 }, uGlowDB: { value: 0 },
  };
}

// ── textures (shared by every way of the same image) ───────────────────────────────────────────────
const texCache = new Map<string, any>();
function loadTex(T: any, renderer: any, url: string) {
  let t = texCache.get(url); if (t) return t;
  t = new T.TextureLoader().load(url);
  t.wrapS = t.wrapT = T.MirroredRepeatWrapping; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  texCache.set(url, t); return t;
}

/** Bake the image's contour field once: RG = flow along the contours (luminance gradient turned 90°),
 *  BA = static noise for phase jitter. 172×96, so it costs nothing to make or to sample. */
function flowTexture(T: any, url: string) {
  const W = 172, H = 96, data = new Uint8Array(W * H * 4).fill(128);
  const tex = new T.DataTexture(data, W, H, T.RGBAFormat);
  tex.wrapS = tex.wrapT = T.MirroredRepeatWrapping; tex.minFilter = tex.magFilter = T.LinearFilter; tex.needsUpdate = true;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return tex;
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }); if (!g) return;
    g.filter = 'blur(2px)'; g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = ((H - 1 - j) * W + i) * 4; lum[j * W + i] = (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255; }   // flip: v up, like the texture
    const L = (i: number, j: number) => lum[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
    const nz = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    const smooth = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return (nz(xi, yi) * (1 - u) + nz(xi + 1, yi) * u) * (1 - v) + (nz(xi, yi + 1) * (1 - u) + nz(xi + 1, yi + 1) * u) * v; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const gx = L(i + 2, j) - L(i - 2, j), gy = L(i, j + 2) - L(i, j - 2);
      let tx = -gy, ty = gx; const len = Math.hypot(tx, ty) + 0.04; tx /= len; ty /= len;
      const k = (j * W + i) * 4;
      data[k] = Math.round((tx * 0.5 + 0.5) * 255); data[k + 1] = Math.round((ty * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round(smooth(i / W * 3 * 8, j / H * 3 * 4.5) * 255); data[k + 3] = Math.round(smooth(i / W * 3 * 8 + 7.3, j / H * 3 * 4.5 + 2.1) * 255);
    }
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}

// ── building blocks ────────────────────────────────────────────────────────────────────────────────
interface Part { obj: any; update?(c: WorldCues): void; load?(f: number): void }
const shuffle = (n: number) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function sky(T: any, U: U, map: any, o: { dim?: number; blur?: number; tint?: [number, number, number]; radius?: number } = {}): Part {
  const m = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false,
    uniforms: { ...U, uMap: { value: map }, uDim: { value: o.dim ?? 0.4 }, uBlur: { value: o.blur ?? 6 }, uTint: { value: v3(T, ...(o.tint ?? [1, 1, 1])) } },
    vertexShader: `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: LIB + SHARED_DECL + `uniform sampler2D uMap;uniform float uDim,uBlur;uniform vec3 uTint;varying vec3 vDir;
      void main(){vec3 d=normalize(vDir);float u=atan(d.z,d.x)/6.2831853+.5;u=abs(fract(u*2.)*2.-1.);
        float sw=vnoise(vec3(d*2.5+vec3(0.,uFlow*.03,0.)))-.5;
        vec2 uv=vec2(u+sw*.08,clamp(d.y*.5+.5+sw*.06,.04,.96));
        vec3 c=lin(textureLod(uMap,uv,uBlur).rgb)*uTint*uDim*(1.+uCurve*.3+uDrop*uDrop*uGDrop.z*.3+uPump*uCurve*.06);
        c=mix(c,vec3(luma(c)),clamp(uBreak*uGBreak.y*.5,0.,.7));
        vec3 wash=mix(uLookA,uLookB,.5+.5*d.y);c*=mix(vec3(1.),.4+wash*1.2,uLookAmt*.35);
        gl_FragColor=vec4(c,1.);}`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(o.radius ?? 450, 48, 24), m); mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { obj: mesh };
}

interface ReliefOpts {
  w: number; h: number; segX?: number; segY?: number; relief: number; swell?: number; ripple?: number; floor?: boolean;
  uvMin?: [number, number]; uvMax?: [number, number]; cut?: number; shade?: number; gloss?: number; bright?: number;
  spark?: number; eq?: number; pos?: [number, number, number]; living: Parameters<typeof livingUniforms>[2]; glossMask?: GlowCfg; satin?: number; morph?: number;
}
function relief(T: any, U: U, map: any, depth: any, o: ReliefOpts): Part {
  const geo = new T.PlaneGeometry(o.w, o.h, seg(o.segX ?? 320), seg(o.segY ?? 180));
  const L = livingUniforms(T, map, o.living);
  const m = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { ...U, ...L, uDepth: { value: depth }, uRelief: { value: o.relief }, uSwell: { value: o.swell ?? 0.25 }, uRipple: { value: o.ripple ?? 0.1 },
      uUvMin: { value: new T.Vector2(...(o.uvMin ?? [0, 0])) }, uUvMax: { value: new T.Vector2(...(o.uvMax ?? [1, 1])) }, uCut: { value: o.cut ?? 0 },
      uShade: { value: o.shade ?? 0.5 }, uGloss: { value: o.gloss ?? 0 }, uBright: { value: o.bright ?? 1 }, uSpark: { value: o.spark ?? 0.6 }, uEq: { value: o.eq ?? 0.35 },
      uSatin: { value: o.satin ?? 0 }, uMorphW: { value: o.morph ?? 0 },
      uGlossA: { value: o.glossMask ? new T.Vector4(o.glossMask.hue, o.glossMask.width, o.glossMask.sat, o.glossMask.val) : new T.Vector4(0, 0, 0, 0) } },
    vertexShader: LIB + SHARED_DECL + `uniform float uMorphW;
      vec2 morphUv(vec2 uv){if(uMorphW*uMorphOn<=0.)return uv;
        float k=uMorphW*uMorphOn*(.55+uMid*.8+uWob*.9+uDrop*uGDrop.x*2.)*(1.-uBreak*uGBreak.x*.6);
        vec2 c=uv-.5;float r=length(c*vec2(1.79,1.));
        float sw=sin(uFlow*.18+r*4.)*.22*k+uDrop*uGDrop.w*1.2*exp(-r*2.)+uPump*.03*k;          // slow sweep of the arcs; the drop swirls
        c=mat2(cos(sw),-sin(sw),sin(sw),cos(sw))*c;
        vec3 q=vec3(uv*1.7,uFlow*.22);
        vec2 w=vec2(vnoise(q),vnoise(q+vec3(5.2,1.3,0.)))-.5;w+=.5*(vec2(vnoise(q*2.1+2.),vnoise(q*2.1+7.))-.5);
        c+=w*.14*k;
        c*=1.-uPump*.025*k-uKick*.02*k;                                                         // each beat pushes the shapes out
        return c+.5;}
uniform sampler2D uDepth;uniform float uRelief,uSwell,uRipple,uSatin;uniform vec2 uUvMin,uUvMax,uTexel;
      varying vec2 vUv;varying float vEdge,vRing;varying vec3 vW;
      float dep(vec2 uv){return textureLod(uDepth,uv,1.).r;}
      void main(){vec2 uv=mix(uUvMin,uUvMax,uv);float d=dep(morphUv(uv));
        vec2 e=uTexel*4.;vEdge=length(vec2(dep(uv+vec2(e.x,0.))-dep(uv-vec2(e.x,0.)),dep(uv+vec2(0.,e.y))-dep(uv-vec2(0.,e.y))));
        float r=length((uv-.5)*vec2(1.8,1.)),rs=(1.-uDrop)*1.5;vRing=exp(-abs(r-rs)*12.)*uDrop*uGDrop.y;
        float shape=(1.+uBass*uSwell+uWob*.25)*(1.+uBuild*uGBuild.z*.55)*(1.-uBreak*uGBreak.z*.55)*(1.+uDrop*uGDrop.x*.7);
        float z=d*uRelief*shape+sin(r*22.-uTime*7.)*uKick*uRipple*uRelief*exp(-r*1.5)+vRing*uRelief*.45
          +sin(uTime*55.+uv.x*37.+uv.y*23.)*uBuild*uGBuild.y*uRelief*.02
          +(vnoise(vec3(uv*3.,uFlow*.08))-.5)*uRelief*.15*(.3+uMid)
          +uSatin*uRelief*.16*sin(dot(uv,vec2(3.,5.))*6.-uFlow*2.4+d*7.)*(.35+uMid+uWob*.9+uBass*.4+uJig*.5);   // satin: ripples run across the folds
        vUv=uv;vec4 w=modelMatrix*vec4(position.xy,z,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + LIVING + `uniform float uMorphW;
      vec2 morphUv(vec2 uv){if(uMorphW*uMorphOn<=0.)return uv;
        float k=uMorphW*uMorphOn*(.55+uMid*.8+uWob*.9+uDrop*uGDrop.x*2.)*(1.-uBreak*uGBreak.x*.6);
        vec2 c=uv-.5;float r=length(c*vec2(1.79,1.));
        float sw=sin(uFlow*.18+r*4.)*.22*k+uDrop*uGDrop.w*1.2*exp(-r*2.)+uPump*.03*k;          // slow sweep of the arcs; the drop swirls
        c=mat2(cos(sw),-sin(sw),sin(sw),cos(sw))*c;
        vec3 q=vec3(uv*1.7,uFlow*.22);
        vec2 w=vec2(vnoise(q),vnoise(q+vec3(5.2,1.3,0.)))-.5;w+=.5*(vec2(vnoise(q*2.1+2.),vnoise(q*2.1+7.))-.5);
        c+=w*.14*k;
        c*=1.-uPump*.025*k-uKick*.02*k;                                                         // each beat pushes the shapes out
        return c+.5;}
uniform float uCut,uShade,uGloss,uBright,uSpark,uEq,uSatin;uniform vec4 uGlossA;
      varying vec2 vUv;varying float vEdge,vRing;varying vec3 vW;
      void main(){if(uCut>0.&&vEdge>uCut)discard;
        vec2 mu=morphUv(vUv);vec3 c=living(mu);vec3 s=textureLod(uMap,mu,1.).rgb;
        c*=1.+uEq*(eq(fract(vUv.x))-.3);
        c+=glow(vUv,c);
        vec3 N=normalize(cross(dFdx(vW),dFdy(vW)));vec3 V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;
        vec3 L=normalize(uLightDir);c*=mix(1.,.65+.5*max(dot(N,L),0.),uShade);
        float gm=uGlossA.y>0.?hueMask(s,uGlossA):1.;
        c+=pow(max(dot(reflect(-L,N),V),0.),48.)*uGloss*gm*(1.+uMid*2.+uKick)*vec3(1.);
        float hi=smoothstep(.55,.92,luma(s));
        c+=step(.988,h21(floor(vUv*vec2(560.,312.))+floor(uFlow*9.)))*hi*(uTre+uHat)*uSpark*4.;
        c+=c*vRing*1.5;
        if(uSatin>0.){float band=pow(.5+.5*sin(dot(vUv,vec2(2.,3.))*5.-uFlow*1.6+luma(s)*5.),14.)*uSatin*(.45+uMid*.9+uPump*.2);
          c+=c*band*1.1+vec3(1.,.93,.86)*band*.22;}   // a satin highlight gliding along the fabric
        gl_FragColor=vec4(fogged(c*uBright,vW),1.);}`,
  });
  const mesh = new T.Mesh(geo, m); mesh.frustumCulled = false;
  if (o.floor) mesh.rotation.x = -Math.PI / 2;
  if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, update(c) { L.uGlowDA.value = glowDrive(o.living.glowA, c); L.uGlowDB.value = glowDrive(o.living.glowB, c); } };
}

/** Trapcode-Form point cloud from the image. shape: 0 vortex · 1 sphere · 2 galaxy · 3 plane-only. */
interface FormOpts { nx: number; ny: number; plane: [number, number, number]; planeOff?: [number, number, number]; shape: number; shapeR: number;
  morphMax?: number; morphBase?: number; size: number; alpha: number; disperse?: number; burst?: number; bright?: number; twinkle?: number; floor?: boolean }
function form(T: any, U: U, map: any, depth: any, o: FormOpts): Part {
  const nx = Math.max(16, Math.round(o.nx * Math.sqrt(Q))), ny = Math.max(9, Math.round(o.ny * Math.sqrt(Q))), N = nx * ny;
  const uvs = new Float32Array(N * 2), rnd = new Float32Array(N * 4), order = shuffle(N);
  for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
    const o2 = order[k]; uvs[o2 * 2] = (i + 0.5) / nx; uvs[o2 * 2 + 1] = (j + 0.5) / ny;
    for (let c = 0; c < 4; c++) rnd[o2 * 4 + c] = Math.random();
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aUv', new T.BufferAttribute(uvs, 2)); geo.setAttribute('aRnd', new T.BufferAttribute(rnd, 4));
  const own = { uMap: { value: map }, uDepth: { value: depth }, uPlane: { value: v3(T, ...o.plane) }, uPlaneOff: { value: v3(T, ...(o.planeOff ?? [0, 0, 0])) },
    uShape: { value: o.shape }, uShapeR: { value: o.shapeR }, uK: { value: 0 }, uSize: { value: o.size }, uAlpha: { value: o.alpha },
    uDisp: { value: 0 }, uBurst: { value: o.burst ?? 0 }, uBright: { value: o.bright ?? 1 }, uTwinkle: { value: o.twinkle ?? 1 }, uFloor: { value: o.floor ? 1 : 0 } };
  const m = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { ...U, ...own },
    vertexShader: LIB + SHARED_DECL + `uniform sampler2D uMap,uDepth;uniform vec3 uPlane,uPlaneOff;uniform float uShape,uShapeR,uK,uSize,uAlpha,uDisp,uBurst,uBright,uTwinkle,uFloor;
      attribute vec2 aUv;attribute vec4 aRnd;varying vec3 vCol;
      vec3 shapePos(vec2 uv,vec4 r){
        if(uShape<.5){float ang=uv.x*6.2831+uFlow*.15+r.x*.3;float rad=mix(.8,uShapeR,pow(uv.y,.8));
          return vec3(cos(ang)*rad,(r.y-.5)*uShapeR*.25+sin(ang*3.+uFlow*.3)*uShapeR*.06,sin(ang)*rad);}
        if(uShape<1.5){float th=uv.x*6.2831+uFlow*.1,ph=acos(1.-2.*uv.y);return uShapeR*(1.+(r.z-.5)*.1)*vec3(sin(ph)*cos(th),cos(ph),sin(ph)*sin(th));}
        float rad=pow(uv.y,1.3)*uShapeR+.5;float ang=uv.x*6.2831+rad*1.2/max(1.,uShapeR*.1)-uFlow*.12+floor(r.x*3.)*2.094;
        return vec3(cos(ang)*rad,(r.y-.5)*(.5+.12*rad),sin(ang)*rad);}
      void main(){vec2 uv=aUv;float d=textureLod(uDepth,uv,2.).r;
        vec3 pp=vec3((uv.x-.5)*uPlane.x,(uv.y-.5)*uPlane.y,d*uPlane.z);
        if(uFloor>.5)pp=vec3(pp.x,pp.z,-pp.y);
        pp+=uPlaneOff;
        float k=uShape>2.5?0.:clamp(uK*1.25-aRnd.w*.25,0.,1.);k=k*k*(3.-2.*k);
        vec3 p=mix(pp,shapePos(uv,aRnd)+uPlaneOff*vec3(1.,0.,1.),k);
        p=mix(p,uPlaneOff,uBuild*uGBuild.x*.3);
        float sp=uDrop*uGDrop.w*2.5*(.5+aRnd.y);vec2 q=p.xz-uPlaneOff.xz;p.xz=mat2(cos(sp),-sin(sp),sin(sp),cos(sp))*q+uPlaneOff.xz;
        float sc=max(uPlane.x,uShapeR)*.06;
        float da=uDisp+uDrop*uGDrop.x*2.5;if(da>.001)p+=swirl(p/sc*.3+vec3(uFlow*.12,0.,uFlow*.09))*sc*da*(.3+aRnd.z)*.6;
        p+=normalize(p-uPlaneOff+vec3(1e-4))*sc*(uKick*uBurst+uDrop*uGDrop.x*uBurst*3.)*(.2+aRnd.x);
        float sparse=step(aRnd.y,uBreak*uGBreak.w*.75);
        vCol=lin(textureLod(uMap,uv,0.).rgb)*uBright*(1.+(uTre+uHat)*aRnd.y*1.5*uTwinkle+uKick*.5+uDrop*uDrop*uGDrop.z*.5)*uAlpha;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_PointSize=(1.-sparse)*clamp(uSize*uPix*(.6+aRnd.x*.8)*(1.+uBass*.4+uPump*.25)/max(.5,-mv.z),1.,64.);
        gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vCol;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(vCol*smoothstep(.5,.0,r),1.);}`,
  });
  const pts = new T.Points(geo, m); pts.frustumCulled = false;
  return { obj: pts, load: f => geo.setDrawRange(0, Math.round(N * f)), update(c) {
    own.uK.value = (o.morphBase ?? 0) + (o.morphMax ?? 0) * U.uMorph.value;
    own.uDisp.value = (o.disperse ?? 0) * (0.15 + c.kick * 1.2 + c.energy * 0.4 + c.wobDepth * 0.5);
  } };
}

/** Tao ribbons. kind 0 flowing silk · 1 orbit light trails · 2 spiral fronds (leaf profile). */
interface RibbonOpts { n: number; seg?: number; kind: number; len: number; width: number; amp: number; spread: number; rise?: number; twist?: number; speed?: number;
  uvA: [number, number]; uvB: [number, number]; sat?: number; irid?: number; shine?: number; emit?: number; dash?: number; alpha?: number; additive?: boolean;
  bright?: number; cells?: number; widthPulse?: number; kickRip?: number; flutter?: number; pos?: [number, number, number] }
function ribbons(T: any, U: U, map: any, o: RibbonOpts): Part {
  const S = seg(o.seg ?? 160), N = cnt(o.n), vc = N * S * 2;
  const aT = new Float32Array(vc), aSide = new Float32Array(vc), aId = new Float32Array(vc), idx: number[] = [];
  for (let r = 0; r < N; r++) for (let s = 0; s < S; s++) for (let k = 0; k < 2; k++) {
    const v = (r * S + s) * 2 + k; aT[v] = s / (S - 1); aSide[v] = k ? 1 : -1; aId[v] = r;
    if (s < S - 1 && k === 0) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(vc * 3), 3));
  geo.setAttribute('aT', new T.BufferAttribute(aT, 1)); geo.setAttribute('aSide', new T.BufferAttribute(aSide, 1)); geo.setAttribute('aId', new T.BufferAttribute(aId, 1));
  geo.setIndex(idx);
  const m = new T.ShaderMaterial({
    side: T.DoubleSide, transparent: true, depthWrite: !o.additive && (o.alpha ?? 1) >= 0.99,
    blending: o.additive ? T.AdditiveBlending : T.NormalBlending,
    uniforms: { ...U, uMap: { value: map }, uKind: { value: o.kind }, uLen: { value: o.len }, uWidth: { value: o.width }, uAmp: { value: o.amp }, uSpread: { value: o.spread },
      uRise: { value: o.rise ?? 0 }, uTwist: { value: o.twist ?? 2 }, uSpeed: { value: o.speed ?? 0.5 },
      uUvA: { value: new T.Vector2(...o.uvA) }, uUvB: { value: new T.Vector2(...o.uvB) }, uSat: { value: o.sat ?? 0 }, uIrid: { value: o.irid ?? 0 },
      uShine: { value: o.shine ?? 0.6 }, uEmit: { value: o.emit ?? 0 }, uDash: { value: o.dash ?? 0 }, uAlpha: { value: o.alpha ?? 1 }, uAdd: { value: o.additive ? 1 : 0 },
      uBright: { value: o.bright ?? 1 }, uCells: { value: o.cells ?? 0 }, uWidthPulse: { value: o.widthPulse ?? 0.3 }, uKickRip: { value: o.kickRip ?? 0.3 }, uFlutter: { value: o.flutter ?? 0 } },
    vertexShader: LIB + SHARED_DECL + `uniform float uKind,uLen,uWidth,uAmp,uSpread,uRise,uTwist,uSpeed,uWidthPulse,uKickRip,uFlutter;
      attribute float aT,aSide,aId;varying float vT,vS;varying vec4 vR;varying vec3 vN,vW;
      float gAmp(){return (1.+uDrop*uGDrop.x*1.2+uWob*.4+uBuild*uGBuild.z*.4)*(1.-uBreak*uGBreak.z*.4);}
      vec3 curve(float t,vec4 r){float A=uAmp*gAmp();
        if(uKind<.5){float x=(t-.5)*uLen;
          float y=(r.x-.5)*uSpread*.6+sin(t*5.+r.y*6.+uFlow*.5)*A*(.6+uMid*.8)+sin(t*13.+uFlow*1.1+r.z*4.)*A*.25+(t-.5)*uLen*uRise;
          float z=(r.z-.5)*uSpread+cos(t*4.+r.x*5.+uFlow*.4)*A*.7;
          if(uFlutter>0.){
            // fabric in moving air: waves run down the ribbon; their height along the length is the music's
            // spectrum (bass at the root, highs at the tail), the wobble billows it, the hats shimmer it.
            float ph=uFlow*6.+uTime*1.2;float sp=eq(t);
            float wv=sin(t*18.-ph*1.4+r.y*6.)*(.35+sp*1.4+uWob*.8)+sin(t*41.-ph*2.6+r.z*9.)*(.12+(uTre+uHat)*.5)+sin(t*7.-ph*.6+r.w*4.)*(.5+uBass*.8);
            float bill=sin(t*3.1-uFlow*1.3+r.x*5.)*(1.+uWob*1.5+uKick*.6);
            y+=wv*uFlutter*uWidth*.9+bill*uFlutter*A*.35;
            z+=cos(t*15.-ph*1.2+r.x*7.)*(.3+sp)*uFlutter*uWidth*.7;
          }
          return vec3(x,y,z);}
        if(uKind<1.5){float a=t*6.2831*(.5+r.w*.5)+uFlow*uSpeed*(.5+r.x)+r.y*6.2831;float R=uSpread*(.35+.65*r.z)*(1.+uDrop*uGDrop.x*.35-uBuild*uGBuild.x*.15);
          vec3 p=vec3(cos(a)*R,sin(a*(2.+floor(r.w*3.)))*R*.3,sin(a)*R);
          float tx=r.x*3.1,ty=r.y*6.2;p.yz=mat2(cos(tx),-sin(tx),sin(tx),cos(tx))*p.yz;p.xz=mat2(cos(ty),-sin(ty),sin(ty),cos(ty))*p.xz;return p;}
        float ang=r.x*6.2831+t*(1.+r.y)*uTwist+uFlow*.06*(r.z-.5)+uDrop*uGDrop.w*1.5*t;float R=t*uLen*(.55+.45*r.z);
        float lift=(r.y-.5)*uSpread+sin(t*3.+uFlow*.6+r.w*6.)*A*(.5+uBass)+t*t*uRise*uLen;
        return vec3(cos(ang)*R,lift,sin(ang)*R);}
      void main(){vec4 r=vec4(h11(aId*1.7),h11(aId*3.1+.2),h11(aId*5.3+.7),h11(aId*7.9+.3));
        vec3 p=curve(aT,r),p2=curve(aT+.003,r);vec3 tg=normalize(p2-p+1e-6);
        float ruff=uFlutter*sin(aT*11.-uFlow*5.-uTime*1.5+r.y*8.)*(.6+eq(aT)*1.2+uWob*.5);
        vec3 up=normalize(vec3(sin(aT*uTwist+r.w*6.+uFlow*.3+ruff)*.7,1.,cos(aT*uTwist+r.x*6.+ruff)*.7));
        vec3 side=normalize(cross(tg,up));
        float prof=uKind>1.5?sin(3.1416*pow(aT,.7)):(uKind>.5?1.:smoothstep(0.,.06,aT)*smoothstep(1.,.94,aT));
        float w=uWidth*prof*(.55+r.z*.9)*(1.+uBass*uWidthPulse+uPump*.2);
        vec3 pos=p+side*aSide*w*.5+up*sin(aT*20.-uTime*10.)*uKick*uKickRip*max(1.,uWidth);
        vT=aT;vS=aSide;vR=r;vN=normalize(mat3(modelMatrix)*normalize(cross(tg,side)));
        vec4 wp=modelMatrix*vec4(pos,1.);vW=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: LIB + SHARED_DECL + `uniform sampler2D uMap;uniform vec2 uUvA,uUvB;uniform float uKind,uSat,uIrid,uShine,uEmit,uDash,uAlpha,uAdd,uBright,uCells,uSpeed;
      varying float vT,vS;varying vec4 vR;varying vec3 vN,vW;
      void main(){vec2 uv=vec2(mix(uUvA.x,uUvB.x,vT),mix(uUvA.y,uUvB.y,fract(vR.y+vS*.015)));
        vec3 s=textureLod(uMap,uv,1.).rgb;if(uSat>0.){vec3 h=rgb2hsv(s);h.y=min(1.,h.y*(1.+uSat));h.z=max(h.z,.55);s=hsv2rgb(h);}
        vec3 c=lin(s);
        vec3 N=normalize(vN),V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;float ndv=max(dot(N,V),0.),fr=pow(1.-ndv,3.);
        vec3 L=normalize(uLightDir),H=normalize(L+V);float sp=pow(max(dot(N,H),0.),70.);
        vec3 ir=mix(vec3(1.),film(ndv*1.6+vT*.7+uFlow*.05),uIrid);
        vec3 o=c*(.45+.55*max(dot(N,L),0.))*uBright+min(sp*1.2+fr*.45,1.2)*mix(ir,ir*(c*1.6+.25),.5)*uShine*(1.+uMid*.6);
        if(uCells>0.){vec2 q=vec2(vT*uCells*3.,vS*uCells*.35+vR.x*9.);vec2 g=fract(q)-.5;float cell=smoothstep(.05,.0,abs(min(abs(g.x),abs(g.y)))-.03);
          o+=c*cell*(1.2+uBass*4.+uDrop*uDrop*2.)*vec3(1.,1.2,.5)*uGlowI;}
        float dash=uDash>0.?pow(fract(vT*uDash-uBeat*.5+vR.w),6.):0.;
        o+=c*uEmit*uGlowI*(1.+uBass*1.6+uDrop*uDrop*uGDrop.z+dash*3.*(1.+uHat*3.));
        float a=uAlpha;if(uKind>.5&&uKind<1.5)a*=smoothstep(0.,.25,vT)*smoothstep(1.,.85,vT);
        if(uAdd>.5)a*=smoothstep(1.,.2,abs(vS));
        o=fogged(o,vW);gl_FragColor=uAdd>.5?vec4(o*a,1.):vec4(o,a);}`,
  });
  const mesh = new T.Mesh(geo, m); mesh.frustumCulled = false; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh };
}

/** Instanced solids. dist: 0 galaxy band · 1 shell · 2 rising column · 3 drifting field.
 *  mat: 0 crystal (emissive core) · 1 glass · 2 bubble · 3 stone · 4 pearl. */
interface ShardOpts { n: number; geo: 'octa' | 'tetra' | 'pane' | 'sphere' | 'disc' | 'slab' | 'ico'; dist: number; r0: number; r1: number; thick: number; orbit?: number;
  s0: number; s1: number; stretch?: [number, number, number]; spin?: number; spinKick?: number; burst?: number; pulse?: number; wobble?: number; mat: number;
  uvA?: [number, number]; uvB?: [number, number]; emit?: number; irid?: number; bright?: number; alpha?: number; texScale?: number; pos?: [number, number, number] }
function shards(T: any, U: U, map: any, o: ShardOpts): Part {
  let base: any;
  switch (o.geo) {
    case 'octa': base = new T.OctahedronGeometry(1, 0).toNonIndexed(); break;
    case 'tetra': base = new T.TetrahedronGeometry(1, 0); break;
    case 'ico': base = new T.IcosahedronGeometry(1, 0); break;
    case 'pane': base = new T.BoxGeometry(1, 1.6, 0.025); break;
    case 'sphere': base = new T.SphereGeometry(1, Q < 0.5 ? 16 : 24, Q < 0.5 ? 10 : 14); break;
    case 'disc': base = new T.CylinderGeometry(1, 1, 0.05, Q < 0.5 ? 32 : 56).rotateX(Math.PI / 2); break;
    case 'slab': base = new T.DodecahedronGeometry(1, 0).scale(1.3, 0.55, 0.35); break;
  }
  base.computeVertexNormals();
  const n = cnt(o.n);
  const g = new T.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('normal', base.getAttribute('normal'));
  const s1 = new Float32Array(n * 4), s2 = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) { s1[i] = Math.random(); s2[i] = Math.random(); }
  g.setAttribute('aSeed', new T.InstancedBufferAttribute(s1, 4)); g.setAttribute('aSeed2', new T.InstancedBufferAttribute(s2, 4));
  g.instanceCount = n;
  const transparent = o.mat === 1 || o.mat === 2;
  const m = new T.ShaderMaterial({
    side: transparent ? T.DoubleSide : T.FrontSide, transparent, depthWrite: !transparent,
    uniforms: { ...U, uMap: { value: map }, uDist: { value: o.dist }, uR0: { value: o.r0 }, uR1: { value: o.r1 }, uThick: { value: o.thick }, uOrbit: { value: o.orbit ?? 0.3 },
      uS0: { value: o.s0 }, uS1: { value: o.s1 }, uStretch: { value: v3(T, ...(o.stretch ?? [1, 1, 1])) }, uSpin: { value: o.spin ?? 0.3 }, uSpinKick: { value: o.spinKick ?? 0.5 },
      uBurst: { value: o.burst ?? 0 }, uPulse: { value: o.pulse ?? 0.15 }, uWobble: { value: o.wobble ?? 0 }, uMat: { value: o.mat },
      uUvA: { value: new T.Vector2(...(o.uvA ?? [0, 0])) }, uUvB: { value: new T.Vector2(...(o.uvB ?? [1, 1])) }, uEmit: { value: o.emit ?? 0 }, uIrid: { value: o.irid ?? 0.5 },
      uBright: { value: o.bright ?? 1 }, uAlpha: { value: o.alpha ?? 1 }, uTexScale: { value: o.texScale ?? 0.08 } },
    vertexShader: LIB + SHARED_DECL + `uniform float uDist,uR0,uR1,uThick,uOrbit,uS0,uS1,uSpin,uSpinKick,uBurst,uPulse,uWobble;uniform vec3 uStretch;uniform vec2 uUvA,uUvB;
      attribute vec4 aSeed,aSeed2;varying vec3 vN,vW,vLocal;varying vec2 vUvS;varying vec4 vSeed;
      vec3 place(vec4 s){
        if(uDist<.5){float rad=mix(uR0,uR1,pow(s.x,.7));float ang=s.y*6.2831+uFlow*uOrbit/(.5+rad*.2)+floor(s.w*2.)*3.14;
          return vec3(cos(ang)*rad,(s.z-.5)*uThick*(1.+rad*.08),sin(ang)*rad);}
        if(uDist<1.5){float th=s.x*6.2831+uFlow*uOrbit*.3,ph=acos(2.*s.y-1.);return mix(uR0,uR1,s.z)*vec3(sin(ph)*cos(th),cos(ph),sin(ph)*sin(th));}
        if(uDist<2.5){float y=fract(s.y+uFlow*uOrbit*(.4+s.w*.6))*uThick-uThick*.5;
          return vec3((s.x-.5)*uR1*2.+sin(uFlow*.8+s.w*20.)*.4,y,(s.z-.5)*uR0*2.+cos(uFlow*.6+s.x*20.)*.3);}
        return vec3((fract(s.x+uFlow*uOrbit*.05*(.5+s.w))-.5)*uR1*2.,(s.y-.5)*uThick+sin(uFlow*.3+s.z*12.)*.3,(s.z-.5)*uR0*2.);}
      void main(){vec3 c0=place(aSeed);
        c0*=1.-uBuild*uGBuild.x*.28;
        float sc0=uR1*.04+.3;
        c0+=normalize(c0+vec3(1e-3))*sc0*(uKick*uBurst*(.3+aSeed2.x)+uDrop*uGDrop.x*uBurst*2.*(.4+aSeed2.y));
        c0+=vec3(sin(uTime*47.+aSeed.x*90.),sin(uTime*53.+aSeed.y*90.),sin(uTime*41.+aSeed.z*90.))*uBuild*uGBuild.y*.06*sc0;
        vec3 ang=aSeed2.yzw*6.2831+uFlow*uSpin*(aSeed2.xyz-.5)*2.+uKick*uSpinKick*aSeed2.zxy+uDrop*uGDrop.w*6.*aSeed2.zxy;mat3 R=rot3(ang);
        float sc=mix(uS0,uS1,aSeed.w*aSeed.w)*(1.+uBass*uPulse+uPump*.1)*step(uBreak*uGBreak.w*.6,aSeed.x);
        vec3 lp=position*uStretch*sc*(1.+sin(uTime*9.+aSeed.x*30.)*uWobble*(uKick+uWob*.6+.15));
        vLocal=position;vN=R*normalize(normal/uStretch);vSeed=aSeed2;
        vUvS=mix(uUvA,uUvB,fract(aSeed.xz*1.7+aSeed.yw));
        vec4 wp=modelMatrix*vec4(c0+R*lp,1.);vW=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: LIB + SHARED_DECL + `uniform sampler2D uMap;uniform float uMat,uEmit,uIrid,uBright,uAlpha,uTexScale;
      varying vec3 vN,vW,vLocal;varying vec2 vUvS;varying vec4 vSeed;
      void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;
        float ndv=max(dot(N,V),0.),fr=pow(1.-ndv,4.);vec3 L=normalize(uLightDir),H=normalize(L+V);
        float lam=max(dot(N,L),0.),sp=pow(max(dot(N,H),0.),90.);
        vec3 base=lin(textureLod(uMap,vUvS+vLocal.xy*uTexScale,0.).rgb);
        vec3 o;float a=1.;
        if(uMat<.5){o=base*(.3+.7*lam)*uBright+base*uEmit*uGlowI*(.35+uBass*1.8+uKick*1.2+uDrop*uDrop*uGDrop.z)*(.4+.6*vSeed.x)+film(ndv*1.4+vSeed.y)*fr*uIrid+sp*1.5;}
        else if(uMat<1.5){vec3 th=film(ndv*2.2+vSeed.y+uFlow*.04);
          o=(th*.85+.15)*fr*1.8*uIrid+base*.18*uBright+sp*2.*(1.+uTre*2.);a=clamp((.08+.85*fr)*uAlpha+sp,0.,1.);}
        else if(uMat<2.5){
          // soap film: thickness swirls over the surface (draining down, flowing faster with the music),
          // the kick sends a ripple across it; interference colours come from that thickness and the view angle
          vec3 q=normalize(vLocal);float ang=uFlow*.35*(.5+vSeed.x);
          vec3 qs=vec3(q.x*cos(ang)-q.z*sin(ang),q.y,q.x*sin(ang)+q.z*cos(ang));
          vec3 fq=qs*2.2+vec3(0.,uFlow*.25,vSeed.z*9.);float thick=(vnoise(fq)*.66+vnoise(fq*2.03+3.1)*.34)*1.4+(1.-q.y)*.35+sin(q.y*18.-uTime*8.)*uKick*.12+uWob*.15*sin(q.x*9.+uFlow);
          vec3 th=film(thick*2.+ndv*1.3+vSeed.y);
          float rim=pow(1.-ndv,2.4);
          // the world through and around it: refracted (flipped) inside, reflected at the rim
          vec3 Rr=refract(-V,N,.82),Rf=reflect(-V,N);
          vec2 ur=vec2(atan(Rr.z,Rr.x)/6.2831853+.5,clamp(.5-Rr.y*.5,.05,.95)),uf=vec2(atan(Rf.z,Rf.x)/6.2831853+.5,clamp(Rf.y*.5+.5,.05,.95));
          ur.x=abs(fract(ur.x*2.)*2.-1.);uf.x=abs(fract(uf.x*2.)*2.-1.);
          vec3 through=lin(textureLod(uMap,ur,2.5).rgb),around=lin(textureLod(uMap,uf,2.).rgb);
          float win=smoothstep(.93,.98,dot(Rf,normalize(vec3(-.4,.7,.6))));            // a soft window in the reflection
          float caustic=pow(max(dot(-N,L),0.),6.)*.8;                                    // light focused on the far wall
          o=through*(1.-rim)*.22+around*rim*.55+th*(.25+rim*1.4)*uIrid*(.6+uMid*.5)
            +vec3(1.)*(sp*5.+win*1.2)*(1.+uHat*1.5)+caustic*th*.5;
          o*=uBright;
          a=clamp(.1+rim*.8+sp+win*.6+caustic*.2,0.,1.)*uAlpha;}
        else if(uMat<3.5){o=base*(.35+.75*lam)*uBright+sp*.25;}
        else{o=mix(base,vec3(1.),.45)*(.45+.6*lam)*uBright+film(ndv+vSeed.z)*fr*.6+sp*2.;}
        o=fogged(o,vW);gl_FragColor=vec4(o,a);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, load: f => { g.instanceCount = Math.max(1, Math.round(n * f)); } };
}

/** Particles: mode 0 rising embers · 1 swirling storm · 2 star shell · 3 drifting motes · 4 kick spray. */
interface SparkOpts { n: number; mode: number; r: number; h: number; speed?: number; size: number; colA: number; colB: number; bright?: number; treK?: number; kickK?: number; pos?: [number, number, number] }
function sparks(T: any, U: U, o: SparkOpts): Part {
  const n = cnt(o.n), seeds = new Float32Array(n * 4); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  const m = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { ...U, uMode: { value: o.mode }, uR: { value: o.r }, uH: { value: o.h }, uSpeed: { value: o.speed ?? 0.3 }, uSize: { value: o.size },
      uColA: { value: col(T, o.colA) }, uColB: { value: col(T, o.colB) }, uBright: { value: o.bright ?? 1 }, uTreK: { value: o.treK ?? 1 }, uKickK: { value: o.kickK ?? 0.5 } },
    vertexShader: LIB + SHARED_DECL + `uniform float uMode,uR,uH,uSpeed,uSize,uBright,uTreK,uKickK;uniform vec3 uColA,uColB;attribute vec4 aSeed;varying vec3 vCol;
      void main(){vec4 s=aSeed;vec3 p;float life=1.;float sc=uR*.06;
        if(uMode<.5){float f=fract(s.y+uFlow*uSpeed*(.4+s.w));p=vec3((s.x-.5)*uR*2.,f*uH-uH*.3,(s.z-.5)*uR*2.);p+=swirl(p/sc*.25+vec3(uFlow*.1))*sc*.5;life=sin(3.1416*f);}
        else if(uMode<1.5){float rad=uR*(.12+s.x*.88)*(1.+uDrop*uGDrop.x*.8);float ang=s.y*6.2831+uFlow*uSpeed/(.3+rad/uR*1.8);
          p=vec3(cos(ang)*rad,(s.z-.5)*uH*(.15+rad/uR*.5)+sin(ang*2.+s.w*9.)*sc*.4,sin(ang)*rad);}
        else if(uMode<2.5){float th=s.x*6.2831,ph=acos(2.*s.y-1.);p=uR*(.75+.25*s.z)*vec3(sin(ph)*cos(th),cos(ph),sin(ph)*sin(th));}
        else if(uMode<3.5){p=vec3((s.x-.5)*uR*2.,(s.y-.5)*uH,(s.z-.5)*uR*2.)+swirl(s.xyz*8.+vec3(uFlow*.05))*sc*.9;}
        else{float f=fract(s.y+uFlow*uSpeed*(.6+s.w));float ang=s.x*6.2831;float rr=s.z*uR;
          p=vec3(cos(ang)*rr,0.,sin(ang)*rr)+vec3(0.,f*uH*(.3+uKick*1.5+uDrop)-f*f*uH*.6,0.);life=sin(3.1416*f)*(.15+uKick*1.2+uDrop);}
        life*=step(uBreak*uGBreak.w*.7,s.w);
        float fl=.5+.5*sin(uTime*(6.+s.x*10.)+s.y*40.);
        vCol=mix(uColA,uColB,s.w)*uBright*life*(.35+(uTre+uHat)*uTreK*1.2+fl*.35+uKick*uKickK+uDrop*uDrop*uGDrop.z+uBuild*uGBuild.w*.5);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(uSize*uPix*(.4+s.z)/max(.4,-mv.z),1.,40.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vCol;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(vCol*pow(smoothstep(.5,.0,r),1.6),1.);}`,
  });
  const pts = new T.Points(geo, m); pts.frustumCulled = false; if (o.pos) pts.position.set(...o.pos);
  return { obj: pts, load: f => geo.setDrawRange(0, Math.round(n * f)) };
}

/** Volumetric mist: camera-facing noise billboards drifting with the wind, tinted from the image. */
interface MistOpts { n: number; r: number; h: number; size: [number, number]; density: number; speed?: number; bright?: number; uvA?: [number, number]; uvB?: [number, number]; pos?: [number, number, number] }
function mist(T: any, U: U, map: any, o: MistOpts): Part {
  const base = new T.PlaneGeometry(1, 1); const g = new T.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
  const n = Math.max(1, Math.round(o.n * Q * Q)), s = new Float32Array(n * 4); for (let i = 0; i < s.length; i++) s[i] = Math.random();
  g.setAttribute('aSeed', new T.InstancedBufferAttribute(s, 4)); g.instanceCount = n;
  const m = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...U, uMap: { value: map }, uR: { value: o.r }, uH: { value: o.h }, uSz: { value: new T.Vector2(...o.size) }, uDens: { value: Math.min(0.9, o.density / Math.max(0.5, Q)) },
      uSpeed: { value: o.speed ?? 0.4 }, uBright: { value: o.bright ?? 1 }, uUvA: { value: new T.Vector2(...(o.uvA ?? [0, 0])) }, uUvB: { value: new T.Vector2(...(o.uvB ?? [1, 1])) } },
    vertexShader: LIB + SHARED_DECL + `uniform float uR,uH,uSpeed;uniform vec2 uSz,uUvA,uUvB;attribute vec4 aSeed;varying vec2 vUv,vUvS;varying vec4 vS;varying float vZ;
      void main(){vec4 s=aSeed;vec3 c=vec3((fract(s.x+uFlow*uSpeed*(.5+s.w)*.02)-.5)*uR*2.,(s.y-.5)*uH,(s.z-.5)*uR*2.);
        vec4 mv=modelViewMatrix*vec4(c,1.);float a=s.w*6.2831+uFlow*.03*(s.x-.5);
        vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*position.xy*mix(uSz.x,uSz.y,s.z)*(1.+uBass*.08+uWob*.05);mv.xy+=q;
        vUv=position.xy+.5;vS=s;vZ=-mv.z;vUvS=mix(uUvA,uUvB,s.xy);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: LIB + SHARED_DECL + `uniform sampler2D uMap;uniform float uDens,uBright;varying vec2 vUv,vUvS;varying vec4 vS;varying float vZ;
      void main(){float d=length(vUv-.5)*2.;if(d>1.)discard;vec3 nq=vec3(vUv*2.2+vS.xy*10.,uFlow*.05+vS.z*5.);float n=vnoise(nq)*.65+vnoise(nq*2.03+3.7)*.35;
        float a=smoothstep(1.,.15,d)*smoothstep(.3,.75,n)*uDens*(1.+uMid*.9)*(1.+uBreak*.6)*(1.-uDrop*.45)*smoothstep(1.,6.,vZ);
        vec3 c=lin(textureLod(uMap,vUvS,3.).rgb)*uBright*(1.+uBass*.35)*mix(.72,1.06,smoothstep(.35,.8,n));
        vec3 wash=mix(uLookA,uLookB,vS.w);c*=mix(vec3(1.),.4+wash*1.2,uLookAmt*.35);gl_FragColor=vec4(c,a);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, load: f => { g.instanceCount = Math.max(1, Math.round(n * f)); } };
}

/** Cloth / ocean surface: layered waves + noise, satin sheen or glass-ocean shading with the image as env. */
interface ClothOpts { w: number; h: number; seg?: [number, number]; amp: number; freq: number; swell?: number; ocean?: boolean; floor?: boolean; sheen?: number; glass?: number;
  alpha?: number; bright?: number; uvA?: [number, number]; uvB?: [number, number]; living: Parameters<typeof livingUniforms>[2]; pos?: [number, number, number]; rot?: [number, number, number] }
function cloth(T: any, U: U, map: any, o: ClothOpts): Part {
  const [sx, sy] = o.seg ?? [220, 140];
  const geo = new T.PlaneGeometry(o.w, o.h, seg(sx), seg(sy));
  const L = livingUniforms(T, map, o.living);
  const alpha = o.alpha ?? 1;
  const m = new T.ShaderMaterial({
    side: T.DoubleSide, transparent: true, depthWrite: alpha >= 0.95,
    uniforms: { ...U, ...L, uAmp: { value: o.amp }, uFreq: { value: o.freq }, uSwell: { value: o.swell ?? 0.4 }, uOcean: { value: o.ocean ? 1 : 0 }, uHalf: { value: Math.max(o.w, o.h) / 2 },
      uSheen: { value: o.sheen ?? 0.6 }, uGlass: { value: o.glass ?? 0 }, uAlpha: { value: alpha }, uBright: { value: o.bright ?? 1 }, uEdgeFade: { value: o.ocean ? 0 : 1 },
      uUvA: { value: new T.Vector2(...(o.uvA ?? [0, 0])) }, uUvB: { value: new T.Vector2(...(o.uvB ?? [1, 1])) } },
    vertexShader: LIB + SHARED_DECL + `uniform float uAmp,uFreq,uSwell,uOcean,uHalf;varying vec2 vUv;varying vec3 vW,vN;
      float disp(vec2 q){float t=uFlow;float z;
        if(uOcean>.5){z=0.;vec2 d1=normalize(vec2(1.,.3)),d2=normalize(vec2(-.4,1.)),d3=normalize(vec2(.7,-.8));
          z+=pow(.5+.5*sin(dot(q,d1)*uFreq-t*1.2),2.2)*uAmp;z+=pow(.5+.5*sin(dot(q,d2)*uFreq*1.7-t*1.5),2.)*uAmp*.45;
          z+=sin(dot(q,d3)*uFreq*3.1-t*2.)*uAmp*.12+(vnoise(vec3(q*uFreq*.6,t*.15))-.5)*uAmp*.8;
          // turbulence: churning chop (mids, wobble), a fast surface shimmer (hats), kick bursts, the drop's churn
          float churn=.25+uMid*1.1+uWob*.9+uDrop*uGDrop.x*1.8+uBuild*uGBuild.y*.5;
          z+=(vnoise(vec3(q*uFreq*1.7,t*.9))-.5)*uAmp*.32*churn+(vnoise(vec3(q*uFreq*3.4+7.,t*1.7))-.5)*uAmp*.09*churn;
          z+=sin(dot(q,d1)*uFreq*4.-uTime*7.)*sin(dot(q,d2)*uFreq*3.5-uTime*6.)*uAmp*.07*(uHat+uTre);
          z+=smoothstep(.55,1.,vnoise(vec3(q*uFreq*.9,floor(uBeat)*1.7)))*uAmp*.9*uKick;}
        else{z=sin(q.x*uFreq+t*.6+sin(q.y*uFreq*.7+t*.3)*1.5)*uAmp+sin(q.y*uFreq*1.3-t*.5+q.x*uFreq*.3)*uAmp*.6+(vnoise(vec3(q*uFreq*.6,t*.1))-.5)*uAmp*1.5;}
        float rr=length(q)/uHalf;
        z+=sin(rr*14.-uTime*6.)*uKick*uAmp*.4*exp(-rr*2.);
        z+=exp(-abs(rr-(1.-uDrop)*1.3)*9.)*uDrop*uGDrop.y*uAmp*2.;
        return z*(1.+uBass*uSwell+uWob*.35)*(1.+uDrop*uGDrop.x*.9)*(1.+uBuild*uGBuild.z*.5)*(1.-uBreak*uGBreak.z*.5);}
      void main(){vec2 q=position.xy;float e=.06/max(uFreq,.05);float z=disp(q);
        vec3 n=normalize(vec3(-(disp(q+vec2(e,0.))-z)/e,-(disp(q+vec2(0.,e))-z)/e,1.));
        vUv=uv;vN=normalize(mat3(modelMatrix)*n);vec4 w=modelMatrix*vec4(q,z,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + LIVING + `uniform float uSheen,uGlass,uAlpha,uBright,uEdgeFade;uniform vec2 uUvA,uUvB;varying vec2 vUv;varying vec3 vW,vN;
      void main(){vec2 uv=mix(uUvA,uUvB,vUv);vec3 c=living(uv);c+=glow(uv,c);
        vec3 N=normalize(vN),V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;float ndv=max(dot(N,V),0.);
        vec3 L=normalize(uLightDir),H=normalize(L+V);float lam=max(dot(N,L),0.);
        vec3 o=c*(.5+.6*lam)*uBright;
        o+=c*pow(1.-ndv,2.)*uSheen*(1.+uMid*1.5)+pow(max(dot(N,H),0.),30.)*uSheen*.5*vec3(1.,.95,.9);
        if(uGlass>0.){vec3 R=reflect(-V,N);float u=atan(R.z,R.x)/6.2831853+.5;u=abs(fract(u*2.)*2.-1.);
          vec3 env=lin(textureLod(uMap,vec2(u,clamp(R.y*.5+.5,.05,.95)),3.).rgb);float fr=pow(1.-ndv,3.);
          o=mix(o,env*1.2+film(ndv*2.+uFlow*.04)*.25,fr*uGlass)+pow(max(dot(N,H),0.),160.)*3.*uGlass*(1.+uTre*2.);
          // whitewater where the turbulence breaks the crests
          float foam=smoothstep(.82,.5,abs(normalize(vN).y))*clamp(uKick*.8+uMid*.5+uWob*.5+uDrop*1.2,0.,1.)*smoothstep(.45,.7,vnoise(vec3(vW.xz*.6,uFlow*.8)));
          o=mix(o,vec3(.92,.97,1.)*(1.1+uHat*.4),foam*.65*uGlass);}
        vec2 eg=min(vUv,1.-vUv);float a=clamp(uAlpha+pow(1.-ndv,2.)*.3,0.,1.)*mix(1.,smoothstep(0.,.14,min(eg.x,eg.y)),uEdgeFade);
        gl_FragColor=vec4(fogged(o,vW),a);}`,
  });
  const mesh = new T.Mesh(geo, m); mesh.frustumCulled = false;
  if (o.floor) mesh.rotation.x = -Math.PI / 2;
  if (o.rot) mesh.rotation.set(...o.rot);
  if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, update(c) { L.uGlowDA.value = glowDrive(o.living.glowA, c); L.uGlowDB.value = glowDrive(o.living.glowB, c); } };
}

/** The image cut into depth bands, each extruded into a solid slab; the slabs breathe apart with the music. */
function slabs(T: any, U: U, map: any, depth: any, o: { w: number; h: number; bands: number; copies: number; gap: number; thick: number; spread: number; living: Parameters<typeof livingUniforms>[2]; pos?: [number, number, number] }): Part {
  const base = new T.PlaneGeometry(o.w, o.h, 1, 1); const g = new T.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  const copies = Q < 0.5 ? Math.max(3, Math.round(o.copies / 2)) : o.copies;
  const n = o.bands * copies, lay = new Float32Array(n * 2);
  for (let b = 0, k = 0; b < o.bands; b++) for (let c = 0; c < copies; c++, k++) { lay[k * 2] = b; lay[k * 2 + 1] = c; }
  g.setAttribute('aLay', new T.InstancedBufferAttribute(lay, 2)); g.instanceCount = n;
  const L = livingUniforms(T, map, o.living);
  const m = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { ...U, ...L, uDepth: { value: depth }, uBands: { value: o.bands }, uCopies: { value: copies }, uGap: { value: o.gap }, uThick: { value: o.thick }, uSpread: { value: o.spread } },
    vertexShader: LIB + SHARED_DECL + `uniform float uBands,uCopies,uGap,uThick,uSpread;attribute vec2 aLay;varying vec2 vUv;varying vec2 vLay;varying vec3 vW;
      void main(){float b=aLay.x,c=aLay.y;float open=1.+uEnergy*uSpread+uKick*uSpread*.5+uDrop*uGDrop.x*2.5-uBuild*uGBuild.x*.4+uWob*.2;
        float z=(b-(uBands-1.)*.5)*uGap*open-c/uCopies*uThick;
        vec2 sway=vec2(sin(uFlow*.2+b*1.7),cos(uFlow*.17+b*2.3))*uGap*.15*(b/uBands)*(1.+uMid);
        vUv=uv;vLay=aLay;vec4 w=modelMatrix*vec4(position.xy+sway,z,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + LIVING + `uniform sampler2D uDepth;uniform float uBands,uCopies;varying vec2 vUv;varying vec2 vLay;varying vec3 vW;
      void main(){float d=textureLod(uDepth,vUv,2.).r;float band=floor(clamp(d,0.,.999)*uBands);if(abs(band-vLay.x)>.5)discard;
        vec3 c=living(vUv);c+=glow(vUv,c);c*=1.+.45*(eq(vLay.x/uBands)-.3);
        float face=vLay.y<.5?1.:.42-.12*vLay.y/uCopies;
        gl_FragColor=vec4(fogged(c*face,vW),1.);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, update(c) { L.uGlowDA.value = glowDrive(o.living.glowA, c); L.uGlowDB.value = glowDrive(o.living.glowB, c); } };
}

/** Solid fronds and strata: thick, cupped, twisted blades swept along a vortex, from ONE instanced template
 *  grid (top, bottom, edges, caps) shaped in the vertex shader. Each blade samples the image along its own
 *  spiral position (so cells, marble and rock sit where they sit in the picture) and pushes its surface out
 *  by the image's brightness. ORGANIC blades are living tissue: they swell with the bass, a contraction runs
 *  down them once per beat, they writhe with the mids and jiggle like goo after each kick. ROCK blades stay
 *  rigid and polished, and only crack-shift on the drop: the contrast is the point. */
interface FrondOpts { n: number; rock?: boolean; segL?: number; segW?: number; r0: [number, number]; len: [number, number]; width: [number, number]; thick: [number, number];
  sweep: [number, number]; rise: [number, number]; y: [number, number]; cup: number; twist: number; bump: number; center: [number, number]; uvR: number; extent: number;
  living: Parameters<typeof livingUniforms>[2]; pos?: [number, number, number] }
function fronds(T: any, U: U, map: any, o: FrondOpts): Part {
  const L = seg(o.segL ?? 56), W = Math.max(4, Math.round((o.segW ?? 10) * Math.sqrt(Q)));
  const p: number[] = [], idx: number[] = [];
  const grid = (side: number) => {
    const base = p.length / 3;
    for (let j = 0; j <= L; j++) for (let i = 0; i <= W; i++) p.push(j / L, -1 + 2 * i / W, side);
    for (let j = 0; j < L; j++) for (let i = 0; i < W; i++) { const a = base + j * (W + 1) + i, b = a + 1, c = a + W + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    return base;
  };
  const top = grid(1), bot = grid(-1);
  for (const i of [0, W]) for (let j = 0; j < L; j++) { const a = top + j * (W + 1) + i, b = top + (j + 1) * (W + 1) + i, c = bot + j * (W + 1) + i, d = bot + (j + 1) * (W + 1) + i; idx.push(a, b, c, b, d, c); }
  for (const j of [0, L]) for (let i = 0; i < W; i++) { const a = top + j * (W + 1) + i, b = a + 1, c = bot + j * (W + 1) + i, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new T.InstancedBufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(p.length), 3));
  g.setAttribute('aP', new T.BufferAttribute(new Float32Array(p), 3)); g.setIndex(idx);
  const n = cnt(o.n), A = new Float32Array(n * 4), B2 = new Float32Array(n * 4), C = new Float32Array(n * 4);
  const rr = (a: [number, number]) => a[0] + Math.random() * (a[1] - a[0]);
  for (let i = 0; i < n; i++) {
    A.set([Math.random() * Math.PI * 2, rr(o.r0), rr(o.len), rr(o.width)], i * 4);
    B2.set([rr(o.thick), rr(o.sweep) * (Math.random() < 0.85 ? 1 : -1), rr(o.rise), rr(o.y)], i * 4);
    C.set([o.cup * (0.6 + Math.random() * 0.8), o.twist * (Math.random() - 0.5) * 2, Math.random(), o.rock ? 1 : 0], i * 4);
  }
  g.setAttribute('aA', new T.InstancedBufferAttribute(A, 4)); g.setAttribute('aB', new T.InstancedBufferAttribute(B2, 4)); g.setAttribute('aC', new T.InstancedBufferAttribute(C, 4));
  g.instanceCount = n;
  const Lv = livingUniforms(T, map, o.living);
  const m = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { ...U, ...Lv, uBump: { value: o.bump }, uCenter: { value: new T.Vector2(...o.center) }, uUvR: { value: o.uvR }, uExtent: { value: o.extent } },
    vertexShader: LIB + SHARED_DECL + `uniform sampler2D uMap;uniform float uBump,uUvR,uExtent;uniform vec2 uCenter;
      attribute vec3 aP;attribute vec4 aA,aB,aC;varying vec2 vUv;varying vec3 vW,vN;varying float vKind,vBulge,vSide;
      vec2 imgUv(float th,float R,float s,float w){vec2 dir=vec2(cos(th),sin(th));
        vec2 q=dir*(R/uExtent)*uUvR+vec2(-dir.y,dir.x)*s*w/uExtent*uUvR*.5;return uCenter+q*vec2(768./1376.,1.);}
      vec3 surf(float t,float s,float side,out vec2 uv,out float bl){
        float organic=1.-aC.w;
        float R0=aA.y*(1.-uBuild*uGBuild.x*.2*organic),len=aA.z,W=aA.w,thick=aB.x,sweep=aB.y,rise=aB.z,y0=aB.w;
        float R=R0+len*t*(1.+uDrop*uGDrop.x*.35*t*organic);
        float th=aA.x+sweep*t+uFlow*.06/(.4+R*.04)*(organic>.5?1.:.6)+uDrop*uGDrop.w*.5*t*organic;
        float t2=t+.01,R2=R0+len*t2,th2=aA.x+sweep*t2+uFlow*.06/(.4+R2*.04)*(organic>.5?1.:.6);
        vec3 C=vec3(cos(th)*R,y0+rise*t*t,sin(th)*R),C2=vec3(cos(th2)*R2,y0+rise*t2*t2,sin(th2)*R2);
        vec3 Tg=normalize(C2-C+1e-5),Bn=normalize(cross(Tg,vec3(0.,1.,0.))+1e-5),Nn=normalize(cross(Bn,Tg));
        float tw=aC.y*t+organic*sin(t*11.-uFlow*4.+aC.z*9.)*.25*(.4+uMid+uWob*.6);
        vec3 b2=Bn*cos(tw)+Nn*sin(tw),n2=Nn*cos(tw)-Bn*sin(tw);Bn=b2;Nn=n2;
        float prof=organic>.5?pow(sin(3.1416*pow(clamp(t,0.,1.),.7)),.8):(.7+.3*sin(3.1416*t));
        // peristalsis: a contraction runs down the tissue once per beat
        bl=organic*pow(.5+.5*sin(t*9.-uBeat*6.2831+aC.z*6.2831),6.)*(.35+uKick*1.1+uWob*.8+uBass*.4);
        float swell=organic*(uBass*.45+uJig*.35+uWob*.3+bl*1.2-uBreak*uGBreak.z*.3);
        float w=W*prof*(1.+swell*.3);
        C+=Nn*organic*sin(t*6.-uFlow*3.+aC.z*9.)*W*.35*(.3+uMid+uWob*.8);            // writhing
        C+=Nn*organic*t*t*uJig*W*.6;                                               // goo jiggle at the tips
        C+=vec3(sin(uTime*47.+aC.z*80.),sin(uTime*53.+aC.z*60.),0.)*uBuild*uGBuild.y*.08*W;
        C+=(1.-organic)*Nn*uDrop*uGDrop.y*.4*sin(aC.z*40.);                          // rock crack-shift on the drop
        uv=imgUv(th,R,s,w);
        float lum=luma(textureLod(uMap,uv,2.).rgb);
        float h=thick*sqrt(max(0.,1.-s*s))*prof*(1.+swell)*.5;
        vec3 P=C+Bn*s*w*.5+Nn*aC.x*w*.5*s*s+Nn*side*h;
        if(side>0.)P+=Nn*lum*uBump*(1.+bl*.8);
        return P;}
      void main(){vec2 uv,u1;float bl,b1;float t=aP.x,s=aP.y,side=aP.z;
        vec3 P=surf(t,s,side,uv,bl);
        vec3 Pt=surf(min(t+.02,1.),s,side,u1,b1),Ps=surf(t,clamp(s+.1,-1.,1.),side,u1,b1);
        vec3 N=normalize(cross(Pt-P+1e-5,Ps-P+1e-5))*side;
        P*=1.-step(aC.w,.5)*step(aC.z,uBreak*uGBreak.w*.5);                         // sparse breakdown thins the tissue
        vUv=uv;vKind=aC.w;vBulge=bl;vSide=side;
        vec4 w=modelMatrix*vec4(P,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*N);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + LIVING + `varying vec2 vUv;varying vec3 vW,vN;varying float vKind,vBulge,vSide;
      void main(){vec3 base=lin(textureLod(uMap,vUv,.5).rgb);
        vec3 N=normalize(vN),V=normalize(cameraPosition-vW),L=normalize(uLightDir);if(dot(N,V)<0.)N=-N;
        float ndv=max(dot(N,V),0.),fr=pow(1.-ndv,4.);vec3 H=normalize(L+V);
        vec3 o;
        if(vKind<.5){
          float wrap=(dot(N,L)+.45)/1.45;
          vec3 sss=base*vec3(1.1,1.,.55)*pow(max(dot(V,-L),0.),2.)*.7+base*fr*.5;     // light through the tissue
          o=base*max(wrap,.08)*.95+sss;
          o+=pow(max(dot(N,H),0.),70.)*vec3(1.)*(.5+uBass*.5+vBulge*.4)+fr*.15;       // wet clearcoat
          o+=glow(vUv,base)*(1.+vBulge*2.)+base*vBulge*vec3(.5,.8,.2)*.5;              // veins light as it contracts
          o*=mix(vec3(1.),vec3(1.12,.92,.86),clamp(abs(uJig),0.,1.)*.35);              // a flush of tissue on the kick
        }else{
          float lam=max(dot(N,L),0.);float pol=smoothstep(.45,.85,luma(base))*(1.-rgb2hsv(pow(base,vec3(1./2.2))).y);
          o=base*(.28+.8*lam)+pow(max(dot(N,H),0.),120.)*vec3(1.)*(.15+pol*1.1);          // polished marble, matte rock
          o*=vSide<0.?.6:1.;
        }
        gl_FragColor=vec4(fogged(o,vW),1.);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, load: f => { g.instanceCount = Math.max(1, Math.round(n * f)); }, update(c) { Lv.uGlowDA.value = glowDrive(o.living.glowA, c); } };
}

/** Sheer veils in the wind: fabric panels anchored on one edge, flag waves running out to the free edge.
 *  The wind is the music: the energy curve sets how hard it blows, every kick is a gust, the drop is a big
 *  one, the ripple along each veil is the spectrum (bass at the anchor, highs at the tip), the wobble billows. */
interface VeilOpts { n: number; len: [number, number]; width: [number, number]; r: number; h: number; wind: number; alpha: number; bright?: number;
  uvA?: [number, number]; uvB?: [number, number]; pos?: [number, number, number] }
function veils(T: any, U: U, map: any, o: VeilOpts): Part {
  const base = new T.PlaneGeometry(1, 1, seg(44), Math.max(6, seg(14)));
  const g = new T.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  const n = cnt(o.n), S1 = new Float32Array(n * 4), S2 = new Float32Array(n * 4);
  const rr = (a: [number, number]) => a[0] + Math.random() * (a[1] - a[0]);
  for (let i = 0; i < n; i++) {
    S1.set([(Math.random() - 0.5) * o.r * 2, (Math.random() - 0.5) * o.h, (Math.random() - 0.5) * o.r * 2, Math.random()], i * 4);
    S2.set([rr(o.len), rr(o.width), (Math.random() - 0.5) * 1.2, Math.random()], i * 4);
  }
  g.setAttribute('aS1', new T.InstancedBufferAttribute(S1, 4)); g.setAttribute('aS2', new T.InstancedBufferAttribute(S2, 4)); g.instanceCount = n;
  const m = new T.ShaderMaterial({
    side: T.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { ...U, uMap: { value: map }, uWind: { value: o.wind }, uAlpha: { value: o.alpha }, uBright: { value: o.bright ?? 1 },
      uUvA: { value: new T.Vector2(...(o.uvA ?? [0, 0])) }, uUvB: { value: new T.Vector2(...(o.uvB ?? [1, 1])) } },
    vertexShader: LIB + SHARED_DECL + `uniform float uWind;attribute vec4 aS1,aS2;varying vec2 vUv;varying vec3 vW,vN;varying float vU;
      vec3 sheet(float u,float v){
        float L=aS2.x,Wd=aS2.y,ph=uFlow*4.+aS2.w*20.;
        float wnd=uWind*(.45+uCurve*.8+uKick*.5+uJig*.3+uDrop*1.6+uWob*.5);
        float amp=Wd*.5*pow(u,1.15)*(.35+wnd);
        float wave=sin(u*7.-ph+v*1.3)*amp+sin(u*3.-ph*.5+v*.7)*amp*.6
                  +sin(u*17.-ph*2.3+v*3.1)*amp*.22*(.4+eq(u)*1.8)+sin(u*31.-ph*3.7+v*5.)*amp*.08*(uTre+uHat);
        float edge=pow(abs(v-.5)*2.,3.)*sin(u*9.-ph*1.6+v*2.)*Wd*.18*(.5+wnd);       // free edges flap harder
        float droop=u*u*L*.14*(1.-min(1.,wnd*.8));
        return vec3(u*L*(1.-.05*wnd),(v-.5)*Wd-droop+sin(u*4.-ph*.7)*Wd*.12*wnd,wave+edge);}
      void main(){float u=position.x+.5,v=position.y+.5;
        vec3 p=sheet(u,v),pu=sheet(u+.01,v),pv=sheet(u,v+.02);
        vec3 nl=normalize(cross(pu-p,pv-p));
        float a=aS2.z+sin(uFlow*.15+aS2.w*6.)*.25;mat3 R=mat3(cos(a),0.,-sin(a),0.,1.,0.,sin(a),0.,cos(a));
        vec3 wp=aS1.xyz+R*p;
        vUv=uv;vU=u;vN=normalize(mat3(modelMatrix)*(R*nl));vec4 w=modelMatrix*vec4(wp,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + `uniform sampler2D uMap;uniform float uAlpha,uBright;uniform vec2 uUvA,uUvB;varying vec2 vUv;varying vec3 vW,vN;varying float vU;
      void main(){vec3 base=lin(textureLod(uMap,mix(uUvA,uUvB,vUv),1.5).rgb)*uBright;
        vec3 N=normalize(vN),V=normalize(cameraPosition-vW),L=normalize(uLightDir);
        float facing=abs(dot(N,V)),through=pow(max(dot(-V,L),0.),2.);
        float fold=.38+.62*abs(dot(N,L));                                              // folds shade the sheer
        vec3 c=base*fold+base*through*.5+pow(1.-facing,2.)*.25*vec3(.95,.97,1.);
        c*=1.+.035*sin(vUv.x*620.)*sin(vUv.y*380.);                                     // weave
        float a=uAlpha*(.45+.55*(1.-facing))*smoothstep(1.,.82,vU)*smoothstep(0.,.04,vUv.y)*smoothstep(1.,.96,vUv.y);
        gl_FragColor=vec4(fogged(c,vW),a);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, load: f => { g.instanceCount = Math.max(1, Math.round(n * f)); } };
}

/** A river of resin you're swept down: a winding channel (wood-grain banks from the image) carrying a glossy,
 *  translucent resin surface whose marbling streams downstream. Waves run down the river, it swells with the
 *  bass and wobble, ripples on the kick, surges on the drop; resin droplets splash up on the kicks. */
export interface RiverShape { len: number; width: number; bankW: number; bankH: number; depth: number; bend: number; waterY: number }
export const riverX = (z: number, bend: number) => Math.sin(z * 0.03) * bend + Math.sin(z * 0.011 + 1) * bend * 1.6;
const RIVER_GLSL = `float riverX(float z,float bend){return sin(z*.03)*bend+sin(z*.011+1.)*bend*1.6;}`;
function river(T: any, U: U, map: any, o: RiverShape & { living: Parameters<typeof livingUniforms>[2]; resinUv: [number, number, number, number]; woodUv: [number, number, number, number]; splash: number }): Part {
  const shape = { uLen: { value: o.len }, uWidth: { value: o.width }, uBankW: { value: o.bankW }, uBankH: { value: o.bankH }, uDepth: { value: o.depth }, uBend: { value: o.bend }, uWaterY: { value: o.waterY } };
  const grp = new T.Group();
  const Lv = livingUniforms(T, map, o.living);
  const decl = `uniform float uLen,uWidth,uBankW,uBankH,uDepth,uBend,uWaterY;` + RIVER_GLSL;
  // banks + bed: a valley across x in [-1,1]; the wood texture streams past (the treadmill sells the ride)
  const bed = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { ...U, ...Lv, ...shape, uWood: { value: new T.Vector4(...o.woodUv) } },
    vertexShader: LIB + SHARED_DECL + decl + `uniform sampler2D uMap;uniform vec4 uWood;varying vec2 vUv;varying vec3 vW;
      vec3 bedAt(vec2 q){float x=q.x,z=q.y*uLen;float ax=abs(x);
        float y=-uDepth*(1.-smoothstep(0.,.42,ax))+uBankH*smoothstep(.38,1.,ax)+sin(z*.05+x*3.)*1.2;
        vec2 uv=vec2(mix(uWood.x,uWood.z,fract(x*.5+.5)),mix(uWood.y,uWood.w,fract(q.y*3.-uFlow*.06)));
        y+=luma(textureLod(uMap,uv,2.).rgb)*2.2*smoothstep(.3,.6,ax);
        float wx=x<0.?-1.:1.;float px=ax<.42?x*uWidth/.42*.5:wx*(uWidth*.5+(ax-.42)/.58*uBankW);
        return vec3(riverX(z,uBend)+px,y,z);}
      void main(){vec2 q=position.xy;vec3 p=bedAt(q);
        vUv=vec2(mix(uWood.x,uWood.z,fract(q.x*.5+.5)),mix(uWood.y,uWood.w,fract(q.y*3.-uFlow*.06)));
        vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + LIVING + `varying vec2 vUv;varying vec3 vW;
      void main(){vec3 c=plate(vUv);vec3 N=normalize(cross(dFdx(vW),dFdy(vW)));vec3 V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;
        vec3 L=normalize(uLightDir);c*=(.45+.85*max(dot(N,L),0.))*1.25;
        c+=pow(max(dot(reflect(-L,N),V),0.),40.)*.15;
        gl_FragColor=vec4(fogged(c,vW),1.);}`,
  });
  const bedGeo = new T.PlaneGeometry(2, 1, seg(90), seg(260));
  const bedMesh = new T.Mesh(bedGeo, bed); bedMesh.frustumCulled = false; grp.add(bedMesh);
  // the resin: glossy, translucent, marbled, flowing downstream
  const surf = new T.ShaderMaterial({
    side: T.DoubleSide, transparent: true, depthWrite: true,
    uniforms: { ...U, ...Lv, ...shape, uResin: { value: new T.Vector4(...o.resinUv) } },
    vertexShader: LIB + SHARED_DECL + decl + `varying vec2 vQ;varying vec3 vW,vN;
      float waveAt(vec2 q){float x=q.x,z=q.y*uLen,t=uFlow;
        float sw=(1.+uBass*.8+uWob*.9+uDrop*uGDrop.x*1.6+uBuild*uGBuild.z*.6)*(1.-uBreak*uGBreak.z*.5);
        float w=sin(z*.35-t*7.+x*1.5)*.45+sin(z*.9-t*12.+x*4.)*.18*(.5+eq(fract(q.y*2.))*1.5)+sin(z*.12-t*3.)*.6;
        w+=sin(length(vec2(x*uWidth,mod(z-t*14.,40.)-20.))*1.6-uTime*9.)*uKick*.35;    // kick rings travelling downstream
        w+=exp(-abs(mod(z-uTime*30.,uLen)-uLen*.5)*.08)*uDrop*uGDrop.y*1.6;            // the drop's surge
        return w*sw*(1.-smoothstep(.85,1.,abs(x)));}
      vec3 at(vec2 q){float z=q.y*uLen;return vec3(riverX(z,uBend)+q.x*uWidth*.5,uWaterY+waveAt(q),z);}
      void main(){vec2 q=position.xy;vec3 p=at(q),pu=at(q+vec2(.02,0.)),pv=at(q+vec2(0.,.002));
        vN=normalize(cross(pv-p,pu-p));vQ=q;vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + LIVING + `uniform vec4 uResin;varying vec2 vQ;varying vec3 vW,vN;
      void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vW),L=normalize(uLightDir);if(dot(N,V)<0.)N=-N;
        float ndv=max(dot(N,V),0.),fr=.04+.96*pow(1.-ndv,5.);
        // marbling: the image's resin, swirled and streaming downstream
        float sw=vnoise(vec3(vQ*vec2(3.,40.),uFlow*.3))*1.4;
        vec2 uv=vec2(mix(uResin.x,uResin.z,fract(vQ.x*.35+.5+sin(vQ.y*30.+sw)*.12)),mix(uResin.y,uResin.w,fract(vQ.y*2.2-uFlow*.22+sw*.05)));
        vec3 body=living(uv);
        float deep=1.-abs(vQ.x);
        vec3 c=body*mix(1.1,.55,deep)*(1.+uBass*.35+uDrop*uDrop*.3);                     // darker, deeper mid-channel
        c+=body*pow(max(dot(-V,L),0.),3.)*.5;                                             // light through the resin
        vec3 R=reflect(-V,N);float u=atan(R.z,R.x)/6.2831853+.5;u=abs(fract(u*2.)*2.-1.);
        vec3 env=lin(textureLod(uMap,vec2(u,clamp(R.y*.5+.5,.05,.95)),3.).rgb);
        c=mix(c,env*.9,fr*.4);
        vec3 H=normalize(L+V);c+=pow(max(dot(N,H),0.),260.)*vec3(2.2)*(1.+uHat*1.5)+pow(max(dot(N,H),0.),40.)*.1;
        gl_FragColor=vec4(fogged(c,vW),.92+fr*.08);}`,
  });
  const surfMesh = new T.Mesh(new T.PlaneGeometry(2, 1, seg(60), seg(320)), surf); surfMesh.frustumCulled = false; grp.add(surfMesh);
  // splashes: glossy resin droplets thrown up along the river, height and density with the kick and the drop
  const n = cnt(o.splash), seeds = new Float32Array(n * 4); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); sg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  const sm = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...U, ...shape, uMap: { value: map }, uResin: { value: new T.Vector4(...o.resinUv) } },
    vertexShader: LIB + SHARED_DECL + decl + `uniform sampler2D uMap;uniform vec4 uResin;attribute vec4 aSeed;varying vec3 vCol;varying float vA;
      void main(){vec4 s=aSeed;float cyc=fract(s.w+uTime*(.9+s.x*.6));
        float z=(fract(s.y+uFlow*.02)-.5)*uLen;float x=(s.z-.5)*uWidth*.8;
        float force=(.25+uKick*1.6+uDrop*2.5+uWob*.5)*(.5+s.x);
        vec3 p=vec3(riverX(z,uBend)+x+(s.x-.5)*cyc*3.*force,uWaterY+force*(cyc*6.-cyc*cyc*6.)*1.4,z+cyc*force*3.);
        vA=(1.-cyc)*smoothstep(0.,.08,cyc)*clamp(force-.3,0.,1.);
        vCol=lin(textureLod(uMap,mix(uResin.xy,uResin.zw,s.xz),1.).rgb);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(28.*uPix*(.4+s.z)/max(.4,-mv.z),1.,30.)*step(.01,vA);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vCol;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=length(d);if(r>.5)discard;
      float hl=smoothstep(.18,.0,length(d-vec2(-.15,-.15)));gl_FragColor=vec4(vCol*(.7+.6*(1.-r*2.))+vec3(2.5)*hl,vA*smoothstep(.5,.35,r));}`,
  });
  const sp = new T.Points(sg, sm); sp.frustumCulled = false; grp.add(sp);
  return { obj: grp, load: f => sg.setDrawRange(0, Math.round(n * f)), update(c) { Lv.uGlowDA.value = glowDrive(o.living.glowA, c); Lv.uGlowDB.value = glowDrive(o.living.glowB, c); } };
}

/** Morphing crystals: each one is a solid cut by planes, generated by math in the vertex shader from a sphere
 *  template: quartz prisms with pyramid terminations, bipyramids, blocky cuboids and twisted scalenohedra, with
 *  3–8 sides, varying facet angles and lengths. On the beat each crystal re-forms into a new procedural form on
 *  its OWN schedule (every beat, every 2, or every bar), listening to its OWN part of the music (kick, snare,
 *  hats, bass or mids) for its pop, spin and inner fire. The drop re-forms them all at once; breakdowns slow it.
 *  Faceted normals from screen derivatives; refraction split per colour like a gem; fresnel; a burning core.
 *  layout: 0 galaxy band · 1 druse clusters growing outward · 2 far shell. */
interface CrystalOpts { n: number; layout: number; r0: number; r1: number; thick: number; s0: number; s1: number; detail?: number; nodes?: number; orbit?: number;
  uvA?: [number, number]; uvB?: [number, number]; fire?: number; burst?: number; pos?: [number, number, number] }
function crystals(T: any, U: U, map: any, o: CrystalOpts): Part {
  const base = new T.IcosahedronGeometry(1, Q < 0.5 ? Math.min(2, o.detail ?? 2) : (o.detail ?? 2)).toNonIndexed();
  const g = new T.InstancedBufferGeometry(); g.setAttribute('position', base.getAttribute('position'));
  const n = cnt(o.n), s1 = new Float32Array(n * 4), s2 = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) { s1[i] = Math.random(); s2[i] = Math.random(); }
  g.setAttribute('aSeed', new T.InstancedBufferAttribute(s1, 4)); g.setAttribute('aSeed2', new T.InstancedBufferAttribute(s2, 4)); g.instanceCount = n;
  const m = new T.ShaderMaterial({
    uniforms: { ...U, uMap: { value: map }, uLayout: { value: o.layout }, uR0: { value: o.r0 }, uR1: { value: o.r1 }, uThick: { value: o.thick }, uS0: { value: o.s0 }, uS1: { value: o.s1 },
      uNodes: { value: o.nodes ?? 7 }, uOrbit: { value: o.orbit ?? 0.3 }, uFire: { value: o.fire ?? 1 }, uBurst: { value: o.burst ?? 1.5 },
      uUvA: { value: new T.Vector2(...(o.uvA ?? [0.2, 0.3])) }, uUvB: { value: new T.Vector2(...(o.uvB ?? [0.9, 0.8])) } },
    vertexShader: LIB + SHARED_DECL + `uniform float uLayout,uR0,uR1,uThick,uS0,uS1,uNodes,uOrbit,uFire,uBurst;uniform vec2 uUvA,uUvB;uniform sampler2D uMap;
      attribute vec4 aSeed,aSeed2;varying vec3 vW,vTint;varying float vCore,vReact;
      // distance from the centre to the surface of a plane-cut solid, along direction d; f picks the family + its numbers
      float crystalR(vec3 d,float f){
        float k=3.+floor(h11(f*13.1)*6.),tilt=mix(.38,1.25,h11(f*7.3)),elong=mix(.5,2.6,h11(f*5.7)),twist=h11(f*11.9)*3.1416;
        float type=floor(h11(f*17.3)*4.);
        float r=3.;
        for(int i=0;i<8;i++){if(float(i)>=k)break;
          float a=6.2831853*float(i)/k;
          if(type<.5||(type>1.5&&type<2.5)){float dd=dot(d,vec3(cos(a),0.,sin(a)));if(dd>0.)r=min(r,1./dd);}
          float ct=cos(tilt),st=sin(tilt);
          float hTop=type<.5?ct+st*elong:(type<1.5||type>2.5?ct*.9+st*elong*.25:elong);
          vec3 nt=type>1.5&&type<2.5?vec3(0.,1.,0.):vec3(cos(a)*ct,st,sin(a)*ct);
          float ab=a+(type>2.5?twist/k+3.1416/k:0.);
          vec3 nb=type>1.5&&type<2.5?vec3(0.,-1.,0.):vec3(cos(ab)*ct,-st,sin(ab)*ct);
          float dt=dot(d,nt),db=dot(d,nb);
          if(dt>0.)r=min(r,hTop/dt);
          if(db>0.)r=min(r,hTop*(type>2.5?.8:1.)/db);
        }
        return r;}
      mat3 basisFrom(vec3 ax){vec3 y=normalize(ax),x=normalize(abs(y.y)<.95?cross(y,vec3(0.,1.,0.)):vec3(1.,0.,0.)),z=cross(x,y);return mat3(x,y,z);}
      void main(){vec4 s=aSeed,s2=aSeed2;
        // each crystal's own part of the music
        float band=floor(s2.w*5.);
        float react=band<.5?uKick:band<1.5?uSnare:band<2.5?uHat:band<3.5?uBass:uMid;
        // its own re-forming schedule: every beat, 2 beats or a bar (slower in a breakdown); the drop re-forms everything
        float rate=s2.z<.4?1.:s2.z<.75?2.:4.;rate*=1.+uBreak*uGBreak.x*3.;
        float beat=uBeat/rate+s.w*.999*step(.5,s2.x);
        float idx=floor(beat),ph=fract(beat);
        float mo=smoothstep(0.,.32,ph);                                  // snap into the new form just after the beat
        float fA=h11(idx*1.37+s.x*91.7),fB=h11((idx+1.)*1.37+s.x*91.7);
        vec3 d=normalize(position);
        float r=mix(crystalR(d,fA),crystalR(d,fB),mo);
        float sc=mix(uS0,uS1,s.y*s.y)*(1.+react*.35+uPump*.06)*(1.+uDrop*uGDrop.x*.4);
        sc*=step(uBreak*uGBreak.w*.6,s.z);
        vec3 lp=d*r*sc;
        // placement
        vec3 c0;mat3 B;
        if(uLayout<.5){float rad=mix(uR0,uR1,pow(s.x,.7));float ang=s.y*6.2831+uFlow*uOrbit/(.5+rad*.04)+floor(s.w*2.)*3.14;
          c0=vec3(cos(ang)*rad,(s.z-.5)*uThick*(1.+rad*.03),sin(ang)*rad);
          B=rot3(s2.xyz*6.2831+uFlow*.2*(s2.yzx-.5)+react*.6*s2.zxy+uDrop*uGDrop.w*5.*s2.zxy);}
        else if(uLayout<1.5){float node=floor(s.x*uNodes);vec3 nc=vec3(h11(node*3.1)-.5,h11(node*5.3)-.5,h11(node*7.7)-.5)*vec3(uR1*2.,uThick,uR1*2.);
          float th=s.y*6.2831,phv=acos(1.-s.z*1.2);vec3 ax=vec3(sin(phv)*cos(th),cos(phv),sin(phv)*sin(th));
          float spin=uFlow*.05*(h11(node)-.5);ax=vec3(ax.x*cos(spin)-ax.z*sin(spin),ax.y,ax.x*sin(spin)+ax.z*cos(spin));
          B=basisFrom(ax);c0=nc+ax*(sc*.9+uR0*s.w*.3);}
        else{float th=s.x*6.2831+uFlow*uOrbit*.1,phv=acos(2.*s.y-1.);vec3 dir=vec3(sin(phv)*cos(th),cos(phv),sin(phv)*sin(th));c0=dir*mix(uR0,uR1,s.z);B=rot3(s2.xyz*6.2831);}
        c0*=1.-uBuild*uGBuild.x*.22;
        c0+=normalize(c0+vec3(1e-3))*(uKick*.3+uDrop*uGDrop.x*uBurst)*(.2+s2.y)*(uR1*.04+.3);
        c0+=vec3(sin(uTime*47.+s.x*90.),sin(uTime*53.+s.y*90.),sin(uTime*41.+s.z*90.))*uBuild*uGBuild.y*.05*(uR1*.04+.3);
        vCore=1.-clamp(length(d*r)/1.6,0.,1.);vReact=react;
        vTint=lin(textureLod(uMap,mix(uUvA,uUvB,fract(s.xz*1.7+s.yw)),1.).rgb);
        vec4 w=modelMatrix*vec4(c0+B*lp,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + `uniform sampler2D uMap;uniform float uFire;varying vec3 vW,vTint;varying float vCore,vReact;
      vec3 env(vec3 r){vec2 u=vec2(atan(r.z,r.x)/6.2831853+.5,clamp(r.y*.5+.5,.05,.95));u.x=abs(fract(u.x*2.)*2.-1.);return lin(textureLod(uMap,u,1.5).rgb);}
      void main(){vec3 N=normalize(cross(dFdx(vW),dFdy(vW))),V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;
        vec3 L=normalize(uLightDir),H=normalize(L+V);float ndv=max(dot(N,V),0.),fr=.05+.95*pow(1.-ndv,5.);
        // dispersion: each colour refracts a little differently
        vec3 refr=vec3(env(refract(-V,N,.69)).r,env(refract(-V,N,.675)).g,env(refract(-V,N,.66)).b);
        vec3 tint=mix(vTint,vec3(1.),.15);
        vec3 o=refr*tint*.85+env(reflect(-V,N))*fr*.9;
        o+=tint*pow(vCore,1.5)*uFire*uGlowI*(.25+uBass*.9+vReact*1.6+uDrop*uDrop*uGDrop.z);    // the fire inside
        o+=vec3(1.)*pow(max(dot(N,H),0.),240.)*(3.+uHat*4.)+tint*pow(max(dot(N,H),0.),40.)*.3;  // facet glints
        gl_FragColor=vec4(fogged(o,vW),1.);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, load: f => { g.instanceCount = Math.max(1, Math.round(n * f)); } };
}

/** Kinetic mosaic: the picture rebuilt from thick tiles that together reproduce its shapes, each tile moving
 *  on its OWN axis — pushing out in depth, sliding across or up, or flipping about x, y or z. Columns listen to
 *  their part of the spectrum (bass at the left, highs at the right), the kick sends a ripple out from the
 *  centre, the wobble shakes, a build pulls everything into line, a breakdown stills and thins it, the drop
 *  throws the wall apart into 3D. One instanced box; thousands of tiles cost almost nothing. */
interface KineticOpts { nx: number; ny: number; w: number; h: number; thick: number; relief: number; amp: number; gap?: number; uvA?: [number, number]; uvB?: [number, number];
  pos?: [number, number, number]; rot?: [number, number, number]; living: Parameters<typeof livingUniforms>[2] }
function kinetic(T: any, U: U, map: any, depth: any, o: KineticOpts): Part {
  const nx = Math.max(8, Math.round(o.nx * Math.sqrt(Q))), ny = Math.max(5, Math.round(o.ny * Math.sqrt(Q))), n = nx * ny;
  const base = new T.BoxGeometry(1, 1, 1);
  const g = new T.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('normal', base.getAttribute('normal')); g.setAttribute('uv', base.getAttribute('uv'));
  const cell = new Float32Array(n * 4), order = shuffle(n);
  for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) cell.set([(i + 0.5) / nx, (j + 0.5) / ny, Math.random(), Math.random()], order[k] * 4);
  g.setAttribute('aCell', new T.InstancedBufferAttribute(cell, 4)); g.instanceCount = n;
  const Lv = livingUniforms(T, map, o.living);
  const m = new T.ShaderMaterial({
    uniforms: { ...U, ...Lv, uDepth: { value: depth }, uN: { value: new T.Vector2(nx, ny) }, uSize: { value: new T.Vector3(o.w, o.h, o.thick) }, uRelief: { value: o.relief },
      uAmp: { value: o.amp }, uGap: { value: o.gap ?? 0.06 }, uUvA: { value: new T.Vector2(...(o.uvA ?? [0, 0])) }, uUvB: { value: new T.Vector2(...(o.uvB ?? [1, 1])) } },
    vertexShader: LIB + SHARED_DECL + `uniform sampler2D uDepth;uniform vec2 uN,uUvA,uUvB;uniform vec3 uSize;uniform float uRelief,uAmp,uGap;
      attribute vec4 aCell;varying vec2 vUv;varying vec3 vW,vN;varying float vFront;
      mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
      mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
      mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
      void main(){vec2 cuv=aCell.xy;vec2 iuv=mix(uUvA,uUvB,cuv);
        float d=textureLod(uDepth,iuv,2.).r;
        float axis=floor(aCell.z*6.);
        float ring=exp(-abs(length((cuv-.5)*vec2(1.6,1.))-fract(uBeat*.5)*1.4)*7.)*uKick;     // the kick's ripple
        float react=(eq(cuv.x)*.9+ring*1.3+uWob*.6*(aCell.w-.5)*2.+uPump*.12)*uAmp;
        react*=1.-uBuild*uGBuild.x*.7;
        float still=1.-uBreak*uGBreak.x*.75;react*=still;
        vec2 tile=uSize.xy/uN;
        vec3 off=vec3(0.,0.,d*uRelief*(1.+uBass*.25));
        mat3 R=mat3(1.);
        if(axis<.5)off.z+=react*uSize.z*5.;
        else if(axis<1.5)off.x+=react*tile.x*.7;
        else if(axis<2.5)off.y+=react*tile.y*.7;
        else if(axis<3.5)R=rx(react*1.4);
        else if(axis<4.5)R=ry(react*1.4);
        else R=rz(react*1.1);
        // the drop throws the wall apart; a build trembles it; a breakdown thins it
        off+=vec3((aCell.w-.5)*tile.x*8.,(aCell.z-.5)*tile.y*8.,(aCell.w+.2)*uSize.z*30.)*uDrop*uGDrop.x;
        R=R*rx(uDrop*uGDrop.w*(aCell.z-.5)*6.)*ry(uDrop*uGDrop.w*(aCell.w-.5)*6.);
        off+=vec3(sin(uTime*51.+aCell.z*90.),sin(uTime*47.+aCell.w*90.),0.)*uBuild*uGBuild.y*tile.x*.04;
        float hide=step(aCell.w,uBreak*uGBreak.w*.45);
        vec3 center=vec3((cuv.x-.5)*uSize.x,(cuv.y-.5)*uSize.y,0.)+off;
        vec3 lp=R*(position*vec3(tile*(1.-uGap),uSize.z))*(1.-hide);
        vFront=step(.5,normal.z);
        vUv=iuv+position.xy*(uUvB-uUvA)/uN;
        vN=normalize(mat3(modelMatrix)*(R*normal));
        vec4 w=modelMatrix*vec4(center+lp,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: LIB + SHARED_DECL + LIVING + `varying vec2 vUv;varying vec3 vW,vN;varying float vFront;
      void main(){vec3 c=living(vUv);c+=glow(vUv,c);
        vec3 N=normalize(vN),L=normalize(uLightDir),V=normalize(cameraPosition-vW);
        float lam=.35+.75*max(dot(N,L),0.);
        c*=lam*(vFront>.5?1.:.55);
        c+=pow(max(dot(reflect(-L,N),V),0.),60.)*.18;
        gl_FragColor=vec4(fogged(c,vW),1.);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false;
  if (o.rot) mesh.rotation.set(...o.rot);
  if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, load: f => { g.instanceCount = Math.max(1, Math.round(n * f)); }, update(c) { Lv.uGlowDA.value = glowDrive(o.living.glowA, c); } };
}

/** The Lighting Director's rig: moving-light beams on a ring, aimed, chased, swept, pulsed and strobed
 *  by the section's look (services/lighting/looks.ts), coloured from the look + the image's accents. */
function beams(T: any, U: U, o: { n: number; r: number; y: number; len: number; width: number; vertical: -1 | 1; alpha: number; pos?: [number, number, number] }): Part {
  const base = new T.CylinderGeometry(0.02, 1, 1, 18, 1, true).translate(0, -0.5, 0);
  const g = new T.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('normal', base.getAttribute('normal'));
  const n = cnt(o.n), I = new Float32Array(n * 2); for (let i = 0; i < n; i++) { I[i * 2] = i / n; I[i * 2 + 1] = Math.random(); }
  g.setAttribute('aI', new T.InstancedBufferAttribute(I, 2)); g.instanceCount = n;
  const m = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { ...U, uR: { value: o.r }, uY: { value: o.y }, uLen: { value: o.len }, uWidth: { value: o.width }, uVert: { value: o.vertical }, uN: { value: n }, uA: { value: o.alpha } },
    vertexShader: LIB + SHARED_DECL + `uniform vec3 uPose;uniform vec4 uLookFx;uniform float uLookLevel,uR,uY,uLen,uWidth,uVert,uN;attribute vec2 aI;varying float vT,vI;varying vec3 vCol,vNw,vW;
      void main(){float a=aI.x*6.2831;vec3 base=vec3(cos(a)*uR,uY,sin(a)*uR);
        vec3 toC=normalize(vec3(-base.x,0.,-base.z)),tan=vec3(-toC.z,0.,toC.x);float side=mod(floor(aI.x*uN+.5),2.)<.5?1.:-1.;
        float vert=uVert*(uPose.z>.5?-1.:1.);
        float sweep=uLookFx.y*sin(uBeat*.785+a)*.7+sin(uFlow*.2+a*3.)*.15;
        vec3 dir=normalize(vec3(0.,vert,0.)+toC*uPose.x+tan*(uPose.y*side+sweep));
        vec3 yA=-dir,xA=normalize(abs(yA.y)<.99?cross(yA,vec3(0.,1.,0.)):vec3(1.,0.,0.)),zA=cross(xA,yA);
        vec3 lp=position*vec3(uWidth*uLen,uLen,uWidth*uLen);
        vT=-position.y;vNw=normalize(mat3(xA,yA,zA)*normal);
        float chase=mix(1.,step(.5,fract(uBeat*.5+aI.x*4.)),uLookFx.x);
        float pulse=mix(1.,.3+.7*uPump,uLookFx.z);
        float strobe=mix(1.,step(.55,fract(uTime*11.+aI.y*7.)),uLookFx.w*clamp(uDrop+uEnergy-.55,0.,1.));
        vI=uLookLevel*chase*pulse*strobe*(.2+.8*uCurve)*(1.-uBreak*.5)+uKick*.3+uDrop*uDrop*.4;
        vCol=side>0.?uLookA:uLookB;
        vec4 w=modelMatrix*vec4(base+mat3(xA,yA,zA)*lp,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float uA;varying float vT,vI;varying vec3 vCol,vNw,vW;
      void main(){vec3 V=normalize(cameraPosition-vW);float edge=pow(abs(dot(normalize(vNw),V)),1.6);
        float a=pow(clamp(1.-vT,0.,1.),1.4)*edge*vI*uA;gl_FragColor=vec4(vCol*a,1.);}`,
  });
  const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; if (o.pos) mesh.position.set(...o.pos);
  return { obj: mesh, load: f => { g.instanceCount = Math.max(1, Math.round(n * Math.max(0.5, f))); } };
}

// ── recipes ────────────────────────────────────────────────────────────────────────────────────────
interface Look { fog: number; fogDen: number; bloom: [number, number]; exposure?: number; threshold?: number; grain?: number; flowSpeed?: number }
type Blocks = { sky: typeof sky; relief: typeof relief; form: typeof form; ribbons: typeof ribbons; shards: typeof shards; sparks: typeof sparks; mist: typeof mist; cloth: typeof cloth; slabs: typeof slabs; beams: typeof beams;
  fronds: typeof fronds; veils: typeof veils; river: typeof river; crystals: typeof crystals; kinetic: typeof kinetic };
const BLOCKS: Blocks = { sky, relief, form, ribbons, shards, sparks, mist, cloth, slabs, beams, fronds, veils, river, crystals, kinetic };
type Recipe = (T: any, U: U, map: any, depth: any, B: Blocks) => Part[];

const PW = 18.4, PH = PW * 768 / 1376;
const PLATE_RIG: PlateRig = { radius: 13, fov: 34, halfW: PW / 2, halfH: PH / 2 };
const OVER: { uvMin: [number, number]; uvMax: [number, number] } = { uvMin: [-0.075, -0.075], uvMax: [1.075, 1.075] };

interface PlateRecipe { look: Look; relief: number; living: Parameters<typeof livingUniforms>[2]; gloss?: number; glossMask?: GlowCfg; spark?: number; eq?: number; shade?: number; satin?: number; morph?: number;
  form?: Partial<FormOpts>; extras?: (T: any, U: U, map: any, B: Blocks) => Part[] }
function plateRecipe(r: PlateRecipe): Recipe {
  return (T, U, map, depth, B) => {
    const parts: Part[] = [
      B.sky(T, U, map, { dim: 0.5, blur: 6, radius: 90 }),
      B.relief(T, U, map, depth, { w: PW * 1.25, h: PH * 1.25, segX: 96, segY: 54, relief: r.relief * 0.3, ...OVER, shade: 0, bright: 0.8, spark: 0, eq: 0, pos: [0, 0, -1.6], living: { ...r.living, flowAmt: 0, lod: 3, glowA: undefined, glowB: undefined } }),
      B.relief(T, U, map, depth, { w: PW, h: PH, relief: r.relief, ...OVER, cut: 0.06, gloss: r.gloss, glossMask: r.glossMask, satin: r.satin, morph: r.morph ?? 0.7, spark: r.spark, eq: r.eq, shade: r.shade ?? 0.45, swell: 0.35, ripple: 0.12, living: r.living }),
      B.form(T, U, map, depth, { nx: 230, ny: 128, plane: [PW, PH, r.relief], planeOff: [0, 0, 0.12], shape: 3, shapeR: 6, size: 9, alpha: 0.16, disperse: 1.1, burst: 0.6, ...(r.form || {}) }),
    ];
    if (r.extras) parts.push(...r.extras(T, U, map, B));
    return parts;
  };
}
const glowGold: GlowCfg = { hue: 0.11, width: 0.06, sat: 0.35, val: 0.45, color: [1.2, 0.65, 0.18], band: [1.1, 0.15, 0], kick: 0.6, base: 0.12 };
const PLATES: Record<string, PlateRecipe> = {
  'ember-bark': { look: { fog: 0x1a0d06, fogDen: 0, bloom: [0.4, 0.5], threshold: 1.0 }, relief: 2.6, gloss: 0.35, glossMask: { hue: 0.11, width: 0.08, sat: 0.3, val: 0.4, color: [1, 1, 1], band: [0, 0, 0] },
    living: { flowDir: [1, -0.4], flowAmt: 0.03, flowRate: 0.3, glowA: glowGold, glowB: { hue: 0.47, width: 0.06, sat: 0.2, val: 0.3, color: [0.2, 1.2, 1.0], band: [0, 0, 1.2] } },
    form: { alpha: 0.12, size: 7 },
    extras: (T, U, _m, B) => [B.sparks(T, U, { n: 1400, mode: 0, r: 9, h: 9, speed: 0.12, size: 22, colA: 0xff8a2a, colB: 0xffd27a, bright: 3, pos: [0, -2, 2.5] })] },
  'prism-silk': { look: { fog: 0x05070f, fogDen: 0, bloom: [0.45, 0.5], threshold: 1.0 }, relief: 2.8, gloss: 0.45,
    living: { flowDir: [1, 0.35], flowAmt: 0.032, flowRate: 0.4, glowA: { hue: 0.8, width: 0.12, sat: 0.4, val: 0.5, color: [0.7, 0.35, 0.9], band: [0, 1.0, 0.3], base: 0.1 } },
    form: { alpha: 0.14 } },
  'neon-orbit': { look: { fog: 0x02030a, fogDen: 0, bloom: [0.55, 0.6], threshold: 0.95 }, relief: 2.2, spark: 1.4,
    living: { flowDir: [0.3, 1], flowAmt: 0.05, flowRate: 0.55,
      glowA: { hue: 0.6, width: 0.1, sat: 0.4, val: 0.55, color: [0.35, 0.7, 1.5], band: [0.4, 0.8, 1.1], kick: 0.8, base: 0.1 }, glowB: { hue: 0.88, width: 0.08, sat: 0.4, val: 0.5, color: [1.4, 0.35, 0.9], band: [1.0, 0.3, 0.6], kick: 0.8, base: 0.1 } },
    form: { alpha: 0.25, disperse: 1.6, burst: 1.0 },
    extras: (T, U, _m, B) => [B.sparks(T, U, { n: 1200, mode: 3, r: 8, h: 5, size: 14, colA: 0x9fd7ff, colB: 0xff7be8, bright: 2.5, treK: 2, pos: [0, 0, 2] })] },
  'pastel-veil': { look: { fog: 0xf1e6ee, fogDen: 0, bloom: [0.25, 0.3], exposure: 1.0, threshold: 1.5 }, relief: 2.2, gloss: 0.4, spark: 0.4,
    living: { flowDir: [1, 0.1], flowAmt: 0.045, flowRate: 0.22 }, extras: (T, U, _m, B) => [B.sparks(T, U, { n: 600, mode: 3, r: 8, h: 5, size: 10, colA: 0xffffff, colB: 0xffe2f3, bright: 0.6, pos: [0, 0, 2] })] },
  'verdant-cells': { look: { fog: 0x0b1408, fogDen: 0, bloom: [0.45, 0.6] }, relief: 2.6, gloss: 0.3,
    living: { flowDir: [0.6, 1], flowAmt: 0.035, flowRate: 0.28, glowA: { hue: 0.2, width: 0.07, sat: 0.35, val: 0.5, color: [1.0, 1.7, 0.3], band: [1.4, 0.2, 0], kick: 1.0, base: 0.1 } },
    form: { alpha: 0.12 }, extras: (T, U, _m, B) => [B.sparks(T, U, { n: 900, mode: 3, r: 8, h: 5, size: 12, colA: 0xc8ff6a, colB: 0xfff3a0, bright: 1.6, pos: [0, 0, 2] })] },
  'white-mist': { look: { fog: 0xe9eef3, fogDen: 0, bloom: [0.2, 0.25], exposure: 1.0, threshold: 1.6 }, relief: 1.6, spark: 0.5,
    living: { flowDir: [1, 0.05], flowAmt: 0.09, flowRate: 0.3, glowA: { hue: 0.58, width: 0.08, sat: 0.12, val: 0.4, color: [0.4, 0.7, 1.4], band: [0, 0.2, 1.0], base: 0.1 } },
    extras: (T, U, map, B) => [B.mist(T, U, map, { n: 26, r: 8, h: 4, size: [5, 9], density: 0.22, speed: 0.6, bright: 1.0, pos: [0, 0, 1.5] })] },
  'bubble-drift': { look: { fog: 0xe9f1f6, fogDen: 0, bloom: [0.3, 0.3], exposure: 1.0, threshold: 1.5 }, relief: 2.0, spark: 0.5,
    living: { flowDir: [1, 0.2], flowAmt: 0.04, flowRate: 0.25 },
    extras: (T, U, map, B) => [B.shards(T, U, map, { n: 40, geo: 'sphere', dist: 2, r0: 1.2, r1: 8, thick: 13, orbit: 0.18, s0: 0.08, s1: 0.6, mat: 2, wobble: 0.08, irid: 1, alpha: 0.9, pos: [0, 0, 2.6] })] },
  'resin-river': { look: { fog: 0x140804, fogDen: 0, bloom: [0.45, 0.55] }, relief: 2.4, gloss: 0.6, glossMask: { hue: 0.5, width: 0.5, sat: 0.45, val: 0.25, color: [1, 1, 1], band: [0, 0, 0] },
    living: { flowDir: [1, -0.6], flowAmt: 0.05, flowRate: 0.32,
      glowA: { hue: 0.48, width: 0.06, sat: 0.45, val: 0.25, color: [0.3, 1.3, 1.1], band: [0, 1.1, 0.3] }, glowB: { hue: 0.97, width: 0.05, sat: 0.5, val: 0.3, color: [1.4, 0.25, 0.5], band: [1.0, 0, 0], kick: 0.5 } } },
  'fire-crystals': { look: { fog: 0x14030c, fogDen: 0, bloom: [0.5, 0.6], threshold: 0.95 }, relief: 2.6, spark: 1.2,
    living: { flowDir: [1, 0.25], flowAmt: 0.05, flowRate: 0.5, glowA: { hue: 0.07, width: 0.06, sat: 0.5, val: 0.55, color: [1.3, 0.55, 0.1], band: [1.2, 0.15, 0.4], kick: 1.0, base: 0.08 } },
    form: { alpha: 0.18, disperse: 1.8, burst: 1.2 },
    extras: (T, U, _m, B) => [B.sparks(T, U, { n: 2200, mode: 0, r: 9, h: 10, speed: 0.18, size: 18, colA: 0xff7a1a, colB: 0xffe08a, bright: 3.2, treK: 2, kickK: 1, pos: [0, -3, 2.5] })] },
  'tidal-glass': { look: { fog: 0x0a3d6b, fogDen: 0, bloom: [0.35, 0.45], exposure: 1.05, threshold: 1.2 }, relief: 2.2, gloss: 0.6, spark: 1.0,
    living: { flowDir: [1, 0.15], flowAmt: 0.07, flowRate: 0.38, glowA: { hue: 0.52, width: 0.08, sat: 0.2, val: 0.75, color: [0.8, 1.4, 1.8], band: [0.3, 0.8, 0.6], base: 0.1 } } },
  'stone-linen': { look: { fog: 0xe3dccd, fogDen: 0, bloom: [0.2, 0.2], exposure: 1.02, threshold: 1.6, flowSpeed: 0.6 }, relief: 2.6, eq: 0.6, shade: 0.7, spark: 0.2, morph: 1,
    living: { flowDir: [1, 0], flowAmt: 0.025, flowRate: 0.2 },
    extras: (T, U, _m, B) => [B.sparks(T, U, { n: 500, mode: 3, r: 8, h: 5, size: 9, colA: 0xfff4dc, colB: 0xffffff, bright: 0.5, pos: [0, 0, 2] })] },
  'peach-satin': { look: { fog: 0xf3d6c4, fogDen: 0, bloom: [0.25, 0.3], exposure: 0.98, threshold: 1.5 }, relief: 2.8, gloss: 0.45, spark: 0.5, satin: 1, shade: 0.6,
    living: { flowDir: [1, 0.3], flowAmt: 0.045, flowRate: 0.26, glowA: { hue: 0.06, width: 0.08, sat: 0.2, val: 0.5, color: [0.5, 0.28, 0.2], band: [0.8, 0.3, 0], kick: 0.4, base: 0.05 } },
    form: { alpha: 0.08 },
    extras: (T, U, map, B) => [B.shards(T, U, map, { n: 34, geo: 'sphere', dist: 3, r0: 2.5, r1: 10, thick: 6, orbit: 0.12, s0: 0.12, s1: 0.5, mat: 4, uvA: [0.3, 0.3], uvB: [0.7, 0.7], pos: [0, 0, 3.2] }),
      B.sparks(T, U, { n: 500, mode: 3, r: 9, h: 5, size: 9, colA: 0xffffff, colB: 0xffe2cf, bright: 0.7, treK: 2, pos: [0, 0, 2] })] },
};

// Image worlds at real scale: near / mid / far layers, a light rig, room for flythroughs.
interface WorldRecipe { look: Look; rig: WorldRig; build: Recipe }
const rig = (radius: number, extent: number, flyY: number, floorY: number, fov = 55, ty = 0): WorldRig => ({ target: [0, ty, 0], radius, extent, flyY, floorY, fov });
const WORLDS: Record<string, WorldRecipe> = {
  'ember-bark': { look: { fog: 0x1a0c05, fogDen: 0.0075, bloom: [0.55, 0.6] }, rig: rig(30, 45, 5, -9, 55, -2),
    build: (T, U, map, depth, B) => [
      B.sky(T, U, map, { dim: 0.35, blur: 6 }),
      B.relief(T, U, map, depth, { w: 130, h: 72, relief: 13, floor: true, pos: [0, -12, 0], shade: 0.7, gloss: 0.6, spark: 0.8, ...OVER,
        glossMask: { hue: 0.11, width: 0.08, sat: 0.3, val: 0.4, color: [1, 1, 1], band: [0, 0, 0] }, living: { flowDir: [1, -0.4], flowAmt: 0.03, flowRate: 0.3, glowA: glowGold } }),
      B.shards(T, U, map, { n: 170, geo: 'slab', dist: 3, r0: 30, r1: 50, thick: 22, orbit: 0.25, s0: 0.8, s1: 4.2, spin: 0.15, mat: 3, uvA: [0.05, 0.3], uvB: [0.45, 0.85], texScale: 0.12, burst: 1, pos: [0, 4, 0] }),
      B.shards(T, U, map, { n: 70, geo: 'ico', dist: 1, r0: 120, r1: 190, thick: 0, orbit: 0.05, s0: 5, s1: 16, stretch: [1.4, 0.6, 1.2], spin: 0.02, mat: 3, uvA: [0, 0], uvB: [1, 1], texScale: 0.05 }),
      B.form(T, U, map, depth, { nx: 220, ny: 124, plane: [130, 72, 13], planeOff: [0, -11, 0], floor: true, shape: 2, shapeR: 34, morphMax: 0.8, size: 22, alpha: 0.2, disperse: 1, burst: 0.6 }),
      B.sparks(T, U, { n: 7000, mode: 0, r: 55, h: 45, speed: 0.1, size: 60, colA: 0xff7a1a, colB: 0xffd27a, bright: 3, pos: [0, -10, 0] }),
      B.beams(T, U, { n: 14, r: 60, y: 34, len: 70, width: 0.12, vertical: -1, alpha: 0.18 }),
    ] },
  'prism-silk': { look: { fog: 0x04060e, fogDen: 0.0045, bloom: [0.32, 0.38], threshold: 1.15, exposure: 1.0 }, rig: { ...rig(64, 70, 24, -40, 52), avoid: ['macro', 'flythrough'], minDist: 56 },
    build: (T, U, map, _d, B) => [
      B.sky(T, U, map, { dim: 0.22, blur: 7 }),
      B.ribbons(T, U, map, { n: 60, seg: 220, kind: 0, len: 150, width: 4.2, amp: 7, spread: 50, rise: 0.1, twist: 3, uvA: [0.08, 0.15], uvB: [0.95, 0.85], sat: 0.25, irid: 0.45, shine: 0.55, bright: 0.95, flutter: 1 }),
      B.ribbons(T, U, map, { n: 18, seg: 160, kind: 0, len: 320, width: 10, amp: 20, spread: 150, rise: 0.15, twist: 2, uvA: [0.1, 0.2], uvB: [0.9, 0.8], sat: 0.2, irid: 0.5, shine: 0.4, alpha: 0.5, bright: 0.8, flutter: 0.7, pos: [0, 70, -230] }),
      B.shards(T, U, map, { n: 34, geo: 'pane', dist: 3, r0: 26, r1: 34, thick: 30, orbit: 0.4, s0: 4, s1: 9, spin: 0.08, mat: 1, irid: 0.55, alpha: 0.55, burst: 0.6 }),
      B.sparks(T, U, { n: 3500, mode: 3, r: 75, h: 50, size: 40, colA: 0xffffff, colB: 0xc9b6ff, bright: 1.6, treK: 2 }),
      B.beams(T, U, { n: 16, r: 70, y: -36, len: 90, width: 0.1, vertical: 1, alpha: 0.16 }),
    ] },
  'neon-orbit': { look: { fog: 0x020208, fogDen: 0.004, bloom: [0.5, 0.5], threshold: 0.95 }, rig: rig(40, 40, 0, -60, 58),
    build: (T, U, map, depth, B) => [
      B.sky(T, U, map, { dim: 0.18, blur: 6 }),
      B.ribbons(T, U, map, { n: 90, kind: 1, len: 1, width: 0.28, amp: 0, spread: 30, speed: 0.6, uvA: [0, 0.1], uvB: [1, 0.9], sat: 1.2, emit: 2.2, dash: 3, additive: true, shine: 0, bright: 0.2 }),
      B.ribbons(T, U, map, { n: 36, seg: 220, kind: 1, len: 1, width: 0.8, amp: 0, spread: 95, speed: 0.2, uvA: [0, 0.1], uvB: [1, 0.9], sat: 1.2, emit: 1.6, dash: 6, additive: true, shine: 0, bright: 0.1 }),
      B.shards(T, U, map, { n: 420, geo: 'tetra', dist: 1, r0: 14, r1: 34, thick: 0, orbit: 0.4, s0: 0.3, s1: 1.9, stretch: [1, 1.8, 1], spin: 0.6, spinKick: 1.5, burst: 2.2, mat: 0, emit: 0.6, irid: 1.4, uvA: [0.5, 0], uvB: [1, 1] }),
      B.form(T, U, map, depth, { nx: 240, ny: 134, plane: [50, 28, 6], shape: 1, shapeR: 12, morphBase: 0.55, morphMax: 0.45, size: 16, alpha: 0.2, disperse: 1.4, burst: 1.2, twinkle: 2 }),
      B.sparks(T, U, { n: 6000, mode: 2, r: 320, h: 0, size: 420, colA: 0x9fd7ff, colB: 0xff9bf0, bright: 1.2, treK: 2.5 }),
      B.beams(T, U, { n: 20, r: 48, y: -40, len: 110, width: 0.07, vertical: 1, alpha: 0.22 }),
    ] },
  'pastel-veil': { look: { fog: 0xd9cbd6, fogDen: 0.004, bloom: [0.25, 0.3], exposure: 1.0, threshold: 1.6 }, rig: rig(34, 45, 4, -30),
    build: (T, U, map, _d, B) => [
      B.sky(T, U, map, { dim: 0.8, blur: 7 }),
      ...[0, 1, 2, 3, 4, 5].map(i => B.cloth(T, U, map, { w: 95, h: 52, seg: [150, 84], amp: 3.4, freq: 0.08 + i * 0.012, alpha: 0.55, sheen: 0.8, bright: 1.15,
        uvA: [(i % 4) * 0.18, 0.05], uvB: [(i % 4) * 0.18 + 0.4, 0.95], living: { flowDir: [1, 0.1], flowAmt: 0.04, flowRate: 0.2 }, pos: [(i % 2 ? 1 : -1) * 6, (i - 2.5) * 5, (i - 2.5) * 16], rot: [-0.2 + i * 0.08, 0.3 - i * 0.12, 0.05 * i] })),
      B.cloth(T, U, map, { w: 340, h: 180, seg: [90, 50], amp: 9, freq: 0.03, alpha: 0.5, sheen: 0.5, bright: 1.0, living: { flowDir: [1, 0.1], flowAmt: 0.04, flowRate: 0.15 }, pos: [0, 10, -160] }),
      B.shards(T, U, map, { n: 40, geo: 'disc', dist: 3, r0: 30, r1: 60, thick: 36, orbit: 0.2, s0: 3, s1: 9, spin: 0.05, mat: 1, irid: 0.9, alpha: 0.7 }),
      B.sparks(T, U, { n: 3000, mode: 3, r: 70, h: 40, size: 30, colA: 0xffffff, colB: 0xffe3f2, bright: 0.7 }),
      B.beams(T, U, { n: 8, r: 50, y: 40, len: 80, width: 0.18, vertical: -1, alpha: 0.08 }),
    ] },
  'verdant-cells': { look: { fog: 0x0b1307, fogDen: 0.008, bloom: [0.4, 0.5], threshold: 1.0 }, rig: rig(30, 34, 2, -14, 56, 0),
    build: (T, U, map, depth, B) => {
      const veins: GlowCfg = { hue: 0.2, width: 0.07, sat: 0.35, val: 0.45, color: [0.9, 1.5, 0.3], band: [1.2, 0.2, 0], kick: 0.9, base: 0.08 };
      const living = { flowDir: [0.6, 1] as [number, number], flowAmt: 0.03, flowRate: 0.25, glowA: veins };
      return [
        B.sky(T, U, map, { dim: 0.26, blur: 6 }),
        // the ground: the picture as a relief, so the vortex grows out of it
        B.relief(T, U, map, depth, { w: 150, h: 84, relief: 12, floor: true, pos: [0, -17, 0], shade: 0.7, gloss: 0.3, spark: 0.4, ...OVER, living }),
        // living tissue: thick cupped leaves with raised cells
        B.fronds(T, U, map, { n: 66, r0: [1, 7], len: [16, 38], width: [3.5, 8], thick: [0.6, 1.5], sweep: [1.4, 2.6], rise: [-3, 9], y: [-9, 5], cup: 0.4, twist: 1.2, bump: 0.7,
          center: [0.48, 0.45], uvR: 0.5, extent: 45, living }),
        // rock: marble and stone strata sweeping between them, rigid
        B.fronds(T, U, map, { n: 24, rock: true, segL: 40, segW: 6, r0: [3, 12], len: [28, 58], width: [5, 12], thick: [1.6, 3.8], sweep: [1.0, 2.0], rise: [-4, 4], y: [-13, 1], cup: 0.1, twist: 0.5, bump: 0.3,
          center: [0.48, 0.45], uvR: 0.55, extent: 45, living: { ...living, flowAmt: 0, glowA: undefined } }),
        B.shards(T, U, map, { n: 160, geo: 'ico', dist: 3, r0: 45, r1: 55, thick: 26, orbit: 0.06, s0: 0.4, s1: 2.6, stretch: [1.2, 0.7, 1], spin: 0.05, mat: 3, uvA: [0.6, 0.1], uvB: [0.95, 0.5], texScale: 0.2, pos: [0, -6, 0] }),
        B.form(T, U, map, depth, { nx: 180, ny: 100, plane: [56, 31, 6], shape: 0, shapeR: 34, morphBase: 0.6, morphMax: 0.4, size: 16, alpha: 0.1, disperse: 1 }),
        B.sparks(T, U, { n: 3500, mode: 3, r: 55, h: 36, size: 28, colA: 0xc8ff6a, colB: 0xfff3a0, bright: 1.5, treK: 1.5 }),
        B.beams(T, U, { n: 10, r: 40, y: -16, len: 60, width: 0.14, vertical: 1, alpha: 0.1 }),
      ];
    } },
  'white-mist': { look: { fog: 0xb9c6d2, fogDen: 0.0035, bloom: [0.2, 0.25], exposure: 1.0, threshold: 1.7, flowSpeed: 0.9 }, rig: rig(30, 50, 2, -30),
    build: (T, U, map, _d, B) => [
      B.sky(T, U, map, { dim: 0.6, blur: 5, tint: [0.86, 0.93, 1.05] }),
      B.mist(T, U, map, { n: 70, r: 80, h: 30, size: [22, 46], density: 0.15, speed: 0.7, bright: 0.98 }),
      // sheer veils in the wind: the wind is the music
      B.veils(T, U, map, { n: 46, len: [22, 48], width: [6, 13], r: 46, h: 26, wind: 1.1, alpha: 0.55, bright: 1.02, uvA: [0.05, 0.2], uvB: [0.95, 0.8] }),
      B.veils(T, U, map, { n: 14, len: [70, 120], width: [16, 26], r: 110, h: 40, wind: 0.9, alpha: 0.4, bright: 0.95, uvA: [0, 0.3], uvB: [1, 0.7], pos: [0, 8, 0] }),
      B.sparks(T, U, { n: 1800, mode: 3, r: 70, h: 35, size: 30, colA: 0xbfe2ff, colB: 0xffffff, bright: 1.3, treK: 2.5 }),
      B.beams(T, U, { n: 8, r: 36, y: 50, len: 90, width: 0.2, vertical: -1, alpha: 0.07 }),
    ] },
  'bubble-drift': { look: { fog: 0xc6d2de, fogDen: 0.006, bloom: [0.3, 0.35], exposure: 1.0, threshold: 1.4 }, rig: rig(26, 40, 2, -40),
    build: (T, U, map, _d, B) => [
      B.sky(T, U, map, { dim: 0.72, blur: 6 }),
      // depth: giant foreground bubbles, a dense mid cluster, a far field of tiny ones, haze between the layers
      B.shards(T, U, map, { n: 14, geo: 'sphere', dist: 2, r0: 22, r1: 22, thick: 60, orbit: 0.05, s0: 3.5, s1: 8, mat: 2, wobble: 0.06, irid: 1.1, alpha: 0.95 }),
      B.shards(T, U, map, { n: 650, geo: 'sphere', dist: 2, r0: 50, r1: 50, thick: 80, orbit: 0.1, s0: 0.3, s1: 3, mat: 2, wobble: 0.08, irid: 1.1, alpha: 0.9 }),
      B.shards(T, U, map, { n: 480, geo: 'sphere', dist: 1, r0: 90, r1: 170, thick: 0, orbit: 0.04, s0: 0.5, s1: 2.2, mat: 2, irid: 0.9, alpha: 0.8 }),
      B.mist(T, U, map, { n: 40, r: 70, h: 40, size: [30, 60], density: 0.12, speed: 0.4, bright: 1.0 }),
      ...[0, 1, 2, 3].map(i => B.cloth(T, U, map, { w: 170, h: 95, seg: [100, 60], amp: 4, freq: 0.06, alpha: 0.38, sheen: 0.6, bright: 1.05, uvA: [0, 0], uvB: [1, 1],
        living: { flowDir: [1, 0.2], flowAmt: 0.04, flowRate: 0.2 }, pos: [Math.sin(i * Math.PI / 2) * 95, 0, Math.cos(i * Math.PI / 2) * 95], rot: [0, i * Math.PI / 2 + Math.PI, 0] })),
      B.sparks(T, U, { n: 1500, mode: 3, r: 60, h: 40, size: 22, colA: 0xffffff, colB: 0xe6f2ff, bright: 0.6 }),
      B.beams(T, U, { n: 8, r: 50, y: 45, len: 85, width: 0.18, vertical: -1, alpha: 0.07 }),
    ] },
  'resin-river': { look: { fog: 0x120704, fogDen: 0.009, bloom: [0.45, 0.5], threshold: 1.0 },
    rig: { ...rig(13, 30, 3, -2, 62, 0), path: (u: number) => { const z = -120 + u * 240; return [riverX(z, 9), 2.4, z]; }, ride: 0.67 },
    build: (T, U, map, _d, B) => [
      B.sky(T, U, map, { dim: 0.28, blur: 6 }),
      B.river(T, U, map, { len: 300, width: 38, bankW: 55, bankH: 12, depth: 7, bend: 9, waterY: -0.5, splash: 2600,
        resinUv: [0.05, 0.05, 0.95, 0.95], woodUv: [0.1, 0.0, 0.6, 0.4], living: PLATES['resin-river'].living }),
      B.sparks(T, U, { n: 1500, mode: 3, r: 50, h: 24, size: 26, colA: 0xff9f5a, colB: 0x6affe0, bright: 1.0 }),
      B.beams(T, U, { n: 12, r: 55, y: 30, len: 70, width: 0.12, vertical: -1, alpha: 0.12 }),
    ] },
  'fire-crystals': { look: { fog: 0x12030b, fogDen: 0.004, bloom: [0.45, 0.5], threshold: 1.0 }, rig: rig(40, 50, 3, -40, 58),
    build: (T, U, map, depth, B) => [
      B.sky(T, U, map, { dim: 0.3, blur: 6 }),
      // morphing crystals: a galaxy, druse clusters growing outward, giants on the horizon
      B.crystals(T, U, map, { n: 900, layout: 0, r0: 5, r1: 58, thick: 9, s0: 0.3, s1: 1.5, detail: 2, orbit: 0.35, fire: 1.1, burst: 2 }),
      B.crystals(T, U, map, { n: 320, layout: 1, r0: 3, r1: 40, thick: 22, s0: 0.45, s1: 2.2, detail: 2, nodes: 7, fire: 1.2, burst: 1.5 }),
      B.crystals(T, U, map, { n: 50, layout: 2, r0: 140, r1: 210, thick: 0, s0: 9, s1: 20, detail: 3, orbit: 0.06, fire: 0.8, burst: 0.4 }),
      B.form(T, U, map, depth, { nx: 200, ny: 112, plane: [60, 34, 6], shape: 2, shapeR: 50, morphBase: 0.6, morphMax: 0.4, size: 22, alpha: 0.22, disperse: 1.6, burst: 1.5 }),
      B.sparks(T, U, { n: 12000, mode: 1, r: 62, h: 14, speed: 0.5, size: 55, colA: 0xff6a12, colB: 0xffe09a, bright: 2.4, treK: 2, kickK: 1.2 }),
      B.beams(T, U, { n: 20, r: 70, y: -30, len: 120, width: 0.07, vertical: 1, alpha: 0.18 }),
    ] },
  'tidal-glass': { look: { fog: 0x0b4a7c, fogDen: 0.006, bloom: [0.4, 0.5], exposure: 1.1, threshold: 1.1 }, rig: rig(30, 60, 8, -6, 58, 5),
    build: (T, U, map, _d, B) => [
      B.sky(T, U, map, { dim: 0.9, blur: 5 }),
      B.cloth(T, U, map, { w: 420, h: 420, seg: [300, 300], amp: 4.5, freq: 0.12, swell: 0.8, ocean: true, floor: true, sheen: 0.4, glass: 0.9, bright: 1,
        uvA: [0, 0], uvB: [8, 8], living: { flowDir: [1, 0.15], flowAmt: 0.06, flowRate: 0.35 }, pos: [0, -9, 0] }),
      B.ribbons(T, U, map, { n: 20, kind: 0, len: 210, width: 5, amp: 5, spread: 60, twist: 2, uvA: [0, 0.3], uvB: [1, 0.7], irid: 0.7, shine: 0.8, alpha: 0.45, bright: 1.0, flutter: 0.6, pos: [0, 7, 0] }),
      B.sparks(T, U, { n: 4000, mode: 4, r: 60, h: 25, speed: 0.4, size: 40, colA: 0xffffff, colB: 0xbfefff, bright: 2.2, pos: [0, -7, 0] }),
      B.shards(T, U, map, { n: 160, geo: 'sphere', dist: 2, r0: 50, r1: 50, thick: 30, orbit: 0.1, s0: 0.2, s1: 1.2, mat: 2, irid: 1, alpha: 0.9, pos: [0, 6, 0] }),
      B.beams(T, U, { n: 10, r: 90, y: -8, len: 120, width: 0.1, vertical: 1, alpha: 0.1 }),
    ] },
  'stone-linen': { look: { fog: 0xc8bfae, fogDen: 0.005, bloom: [0.2, 0.2], exposure: 1.02, threshold: 1.7, flowSpeed: 0.7 }, rig: rig(34, 40, 2, -16, 52, -2),
    build: (T, U, map, depth, B) => {
      const living = { flowDir: [1, 0] as [number, number], flowAmt: 0.012, flowRate: 0.15 };
      return [
        B.sky(T, U, map, { dim: 0.74, blur: 7 }),
        // kinetic architecture: three walls of tiles that reproduce the picture and move on every axis
        B.kinetic(T, U, map, depth, { nx: 64, ny: 36, w: 92, h: 52, thick: 1.6, relief: 6, amp: 1, pos: [0, 6, -26], living }),
        B.kinetic(T, U, map, depth, { nx: 56, ny: 32, w: 92, h: 52, thick: 1.4, relief: 4, amp: 0.8, pos: [0, -18, 6], rot: [-Math.PI / 2, 0, 0], uvA: [1, 0], uvB: [0, 1], living }),
        B.kinetic(T, U, map, depth, { nx: 40, ny: 30, w: 60, h: 46, thick: 1.4, relief: 5, amp: 0.9, pos: [-44, 4, 6], rot: [0, Math.PI / 2, 0], uvA: [0.3, 0], uvB: [1, 1], living }),
        B.slabs(T, U, map, depth, { w: PW * 2.4, h: PH * 2.4, bands: 5, copies: 6, gap: 3, thick: 2, spread: 0.8, pos: [14, 2, 6], living }),
        B.shards(T, U, map, { n: 60, geo: 'disc', dist: 3, r0: 30, r1: 50, thick: 30, orbit: 0.12, s0: 2, s1: 6, stretch: [1, 1, 5], spin: 0.08, spinKick: 1, burst: 1, mat: 3, uvA: [0.1, 0.1], uvB: [0.9, 0.9], texScale: 0.2 }),
        B.shards(T, U, map, { n: 10, geo: 'disc', dist: 1, r0: 150, r1: 220, thick: 0, orbit: 0.02, s0: 25, s1: 40, stretch: [1, 1, 3], spin: 0.005, mat: 3, uvA: [0.1, 0.1], uvB: [0.9, 0.9], texScale: 0.15 }),
        B.sparks(T, U, { n: 2500, mode: 3, r: 70, h: 40, size: 26, colA: 0xfff1d6, colB: 0xffffff, bright: 0.6 }),
        B.beams(T, U, { n: 8, r: 55, y: 45, len: 80, width: 0.16, vertical: -1, alpha: 0.07 }),
      ];
    } },
  'peach-satin': { look: { fog: 0xd8b8a4, fogDen: 0.004, bloom: [0.25, 0.3], exposure: 1.0, threshold: 1.6 }, rig: rig(32, 45, 4, -30),
    build: (T, U, map, _d, B) => [
      B.sky(T, U, map, { dim: 0.8, blur: 7 }),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => B.cloth(T, U, map, { w: 150 - (i % 3) * 20, h: 84 - (i % 3) * 10, seg: [160, 90], amp: 5 - (i % 5) * 0.6, freq: 0.07 + (i % 4) * 0.015, sheen: 1.1, bright: 1.1, alpha: 0.97,
        uvA: [(i % 3) * 0.2, 0], uvB: [(i % 3) * 0.2 + 0.6, 1], living: { flowDir: [1, 0.3], flowAmt: 0.04, flowRate: 0.22 },
        pos: [((i * 37) % 11 - 5) * 4, -14 + i * 4.2, -42 + i * 9.5], rot: [-1.15 + (i % 5) * 0.3, 0.35 * Math.sin(i * 1.7), 0.15 * Math.cos(i * 2.3)] })),
      B.ribbons(T, U, map, { n: 26, seg: 160, kind: 0, len: 150, width: 5, amp: 6, spread: 50, twist: 2, uvA: [0.1, 0.2], uvB: [0.9, 0.8], shine: 0.5, bright: 1.05, flutter: 0.7, pos: [0, 6, 0] }),
      B.cloth(T, U, map, { w: 420, h: 230, seg: [90, 50], amp: 12, freq: 0.025, sheen: 0.8, alpha: 0.9, bright: 1.0, living: { flowDir: [1, 0.3], flowAmt: 0.04, flowRate: 0.15 }, pos: [0, 20, -170] }),
      B.shards(T, U, map, { n: 520, geo: 'sphere', dist: 3, r0: 40, r1: 70, thick: 46, orbit: 0.15, s0: 0.3, s1: 1.6, mat: 4, uvA: [0.3, 0.3], uvB: [0.7, 0.7] }),
      B.sparks(T, U, { n: 3500, mode: 3, r: 65, h: 40, size: 28, colA: 0xffffff, colB: 0xffe6d2, bright: 0.9, treK: 2 }),
      B.beams(T, U, { n: 8, r: 50, y: 45, len: 85, width: 0.18, vertical: -1, alpha: 0.07 }),
    ] },
};

/** What the most recently directed image scene heard and decided (lab readouts). */
export interface ImageWorldReadout { scene: string; way: Way; shot: string; cut: number; load: number; tier: number; cues: WorldCues; graph?: any }
let readout: ImageWorldReadout | null = null;
export const imageWorldReadout = () => readout;

// ── assembly ───────────────────────────────────────────────────────────────────────────────────────
type Way = 'plate' | 'world';
interface Group { way: Way; obj: any; parts: Part[]; look: Look; offset: [number, number, number] }
const PLATE_OFFSET: [number, number, number] = [0, 0, 3000];   // the plate set sits far from the world set in Show mode

function buildGroup(T: any, U: U, map: any, depth: any, way: Way, id: string, offset: [number, number, number]): Group {
  const recipe = way === 'plate' ? plateRecipe(PLATES[id]) : WORLDS[id].build;
  const look = way === 'plate' ? PLATES[id].look : WORLDS[id].look;
  const g = new T.Group(); g.position.set(...offset);
  const parts = recipe(T, U, map, depth, BLOCKS); for (const p of parts) g.add(p.obj);
  return { way, obj: g, parts, look, offset };
}

function assemble(T: any, renderer: any, base: string, id: string, ways: Way[]): SceneInst {
  Q = imageWorldTier();
  const direction = imageWorldDirection(id);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 1, 0.1, 1400);
  const drive = makeDrive(T, renderer, direction, ways.length === 1 && ways[0] === 'plate');
  const map = loadTex(T, renderer, `${base}plates/${id}.jpg`), depth = loadTex(T, renderer, `${base}depth/${id}.png`);
  map.userData.flow ??= flowTexture(T, `${base}plates/${id}.jpg`);
  const groups = ways.map(w => buildGroup(T, drive.U, map, depth, w, id, ways.length > 1 && w === 'plate' ? PLATE_OFFSET : [0, 0, 0]));
  for (const g of groups) scene.add(g.obj);
  const director = new ImageDirector(direction);
  const worldRig = WORLDS[id].rig;
  let active: Group = groups[0], wantWay: Way = active.way, wantSince = 0;
  // frame governor: trims instance/point counts when frames run long (live only; never in exports)
  let load = 1, wall = -1, clipPrev = -1, slowFrames = 0, fastFrames = 0;
  const applyLoad = () => { for (const g of groups) for (const p of g.parts) p.load?.(load); };

  const setActive = (g: Group) => {
    active = g;
    for (const x of groups) x.obj.visible = x === g;
    drive.U.uFogCol.value.copy(col(T, g.look.fog)); drive.U.uFogDen.value = g.look.fogDen;
    drive.plate = g.way === 'plate';
  };
  setActive(active);

  return {
    scene, camera, immersive: true,
    cam: { target: [0, 0, 0], radius: 13, pitch: 0, yaw: 0, fov: 40 },
    get exposure() { return active.look.exposure ?? 1.1; },
    get brightThreshold() { return active.look.threshold ?? 0.9; },
    get grain() { return active.look.grain ?? 0.014; },
    direct(t: number, _a: FluxDriven, spec: any, aspect: number, audio: FluxAudio) {
      const c = drive.step(t, audio as WorldAudioIn, active.look.flowSpeed ?? 1);
      // Show mode: the councils say which way plays each section; switch on the bar (the drop switches at once).
      if (groups.length > 1) {
        const want = direction.show[c.section] as Way;
        if (want !== wantWay) { wantWay = want; wantSince = c.beat; }
        // with a song map the section change IS on the bar; live, wait a bar so a wobbly estimate doesn't flap
        if (want !== active.way && (c.dropHit || (c.barHit && (c.songKnown || c.beat - wantSince >= 3.9)))) {
          setActive(groups.find(g => g.way === want) || active); director.restart();
        }
      }
      drive.U.uMorphOn.value = spec.morph === false ? 0 : 1;
      const manual = { yaw: spec.yaw || 0, pitch: spec.pitch || 0, distance: spec.distance || 1 };
      const on = spec.director !== false;
      let pose: Pose;
      if (active.way === 'plate') {
        pose = director.plate(c, PLATE_RIG, aspect, manual, on);
        const o = active.offset; pose = { ...pose, pos: [pose.pos[0] + o[0], pose.pos[1] + o[1], pose.pos[2] + o[2]], target: [pose.target[0] + o[0], pose.target[1] + o[1], pose.target[2] + o[2]] };
        camera.near = 0.1; camera.far = 400;
      } else {
        pose = director.world(c, worldRig, manual, on);
        camera.near = 0.3; camera.far = 1400;
      }
      camera.fov = pose.fov; camera.position.set(...pose.pos); camera.up.set(0, 1, 0); camera.lookAt(...pose.target);
      if (pose.roll) camera.rotateZ(pose.roll);
      readout = { scene: id, way: active.way, shot: director.shotKind, cut: director.cutIndex, load, tier: Q, cues: c, graph: active.obj };
      return true;
    },
    update(t: number, _a: FluxDriven, _spec: any, audio?: FluxAudio) {
      const c = drive.step(t, (audio || {}) as WorldAudioIn, active.look.flowSpeed ?? 1);
      for (const p of active.parts) p.update?.(c);
      const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      if (wall >= 0 && clipPrev >= 0) {
        const wdt = now - wall, cdt = t - clipPrev;
        if (cdt > 0 && Math.abs(wdt - cdt) < Math.max(0.012, cdt * 0.35)) {   // realtime playback
          if (wdt > 0.026) { slowFrames++; fastFrames = 0; } else if (wdt < 0.0175) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
          if (slowFrames > 45 && load > 0.35) { load = Math.max(0.35, load * 0.85); slowFrames = 0; applyLoad(); }
          if (fastFrames > 240 && load < 1) { load = Math.min(1, load * 1.1); fastFrames = 0; applyLoad(); }
        }
      }
      wall = now; clipPrev = t;
    },
    bloom: () => active.look.bloom[0] + active.look.bloom[1] * Math.min(1, drive.cues.curve * 0.8 + drive.cues.kick * 0.3 + drive.cues.drop * drive.cues.drop * 0.3) * direction.intensity.glow,
    dispose() { scene.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); },
  } as SceneInst;
}

/** Builders for every image — plate, world and the directed Show — keyed by Flux scene id. `base` holds plates/ and depth/. */
export function imageWorldBuilders(base?: string): Record<string, (T: any, renderer: any) => SceneInst> {
  const out: Record<string, (T: any, renderer: any) => SceneInst> = {};
  for (const w of IMAGE_WORLDS) {
    out[imagePlateId(w.id)] = (T, r) => assemble(T, r, base ?? fluxCanvasBase(), w.id, ['plate']);
    out[imageWorldId(w.id)] = (T, r) => assemble(T, r, base ?? fluxCanvasBase(), w.id, ['world']);
    out[imageShowId(w.id)] = (T, r) => assemble(T, r, base ?? fluxCanvasBase(), w.id, ['plate', 'world']);
  }
  return out;
}

/** Current director state for a lab readout. */
export type { WorldCues };
