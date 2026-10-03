// typoEngine — the glyph renderer behind Chora's TYPO FX engine.
//
// One 2048px atlas holds four real typefaces (R = sharp glyph, G = blurred halo). Every letter in
// a volume is an INSTANCE of one mesh per layer, so a 150-letter sphere is one draw call, not 150
// meshes/materials/canvas textures. Extrusion is stacked glyph slices (no text geometry), and a
// lyric change flips each glyph to its new character in place — nothing is rebuilt.

import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const wrap = (x: number, w: number) => ((x % w) + w) % w;
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);
export const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const MOTION = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.4 : 1;

/* ───────── Glyph atlas ───────── */
export const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·&?!'-.,:/ ";
const FONTS = [
  { css: "400 {s}px 'Anton', Impact, sans-serif", size: 110 },
  { css: "400 {s}px 'Archivo Black', 'Arial Black', sans-serif", size: 94 },
  { css: "800 {s}px 'Syne', 'Arial Black', sans-serif", size: 92 },
  { css: "600 {s}px 'IBM Plex Mono', monospace", size: 104 },
];
export const F = { ANTON: 0, ARCHIVO: 1, SYNE: 2, MONO: 3 } as const;
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=IBM+Plex+Mono:wght@600&family=Syne:wght@800&display=swap';
const CELL = 128, GRIDN = 16;

export const norm = (ch: string) => { ch = (ch || ' ').toUpperCase(); if (ch === '’' || ch === '‘') ch = "'"; return CHARS.includes(ch) ? ch : ' '; };
export const gIndex = (font: number, ch: string) => font * 64 + CHARS.indexOf(norm(ch));

function ensureFontLink() {
  if (typeof document === 'undefined' || document.querySelector('link[data-typo-fonts]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = FONT_HREF; l.setAttribute('data-typo-fonts', '1');
  document.head.appendChild(l);
}

let atlasPromise: Promise<THREE.CanvasTexture> | null = null;
/** Shared across every TYPO mount; built once per session. */
export function loadAtlas(): Promise<THREE.CanvasTexture> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = (async () => {
    ensureFontLink();
    const load = FONTS.map(f => document.fonts.load(f.css.replace('{s}', String(f.size)), 'AQ7'));
    await Promise.race([Promise.all(load).catch(() => {}), new Promise(r => setTimeout(r, 3500))]);
    const S = CELL * GRIDN;
    const a = document.createElement('canvas'); a.width = a.height = S;
    const ca = a.getContext('2d', { willReadFrequently: true })!;
    ca.fillStyle = '#000'; ca.fillRect(0, 0, S, S); ca.fillStyle = '#fff'; ca.textAlign = 'center'; ca.textBaseline = 'alphabetic';
    FONTS.forEach((f, fi) => {
      ca.font = f.css.replace('{s}', String(f.size));
      const capH = ca.measureText('H').actualBoundingBoxAscent || f.size * 0.72;
      [...CHARS].forEach((ch, ci) => {
        if (ch === ' ') return;
        const idx = fi * 64 + ci, cx = (idx % GRIDN) * CELL, cy = Math.floor(idx / GRIDN) * CELL;
        const m = ca.measureText(ch);
        const w = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width);
        const sx = Math.min(1, 104 / Math.max(1, w));
        ca.save(); ca.translate(cx + CELL / 2, cy + CELL / 2 + capH / 2); ca.scale(sx, 1); ca.fillText(ch, 0, 0); ca.restore();
      });
    });
    const b = document.createElement('canvas'); b.width = b.height = S;
    const cb = b.getContext('2d', { willReadFrequently: true })!;
    cb.filter = 'blur(6px)'; cb.drawImage(a, 0, 0); cb.filter = 'none';
    const A = ca.getImageData(0, 0, S, S), B = cb.getImageData(0, 0, S, S);
    const o = A.data, bd = B.data;
    for (let i = 0; i < o.length; i += 4) { o[i + 1] = bd[i]; o[i + 2] = 0; o[i + 3] = 255; }
    ca.putImageData(A, 0, 0);
    const tex = new THREE.CanvasTexture(a);
    tex.flipY = false; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    return tex;
  })();
  return atlasPromise;
}

/* ───────── Instanced glyph layer ───────── */
const VS = `
attribute float layer; attribute float iGlyph; attribute vec3 iColor; attribute vec4 iTile; attribute float iGlow;
uniform float uDepth; uniform vec3 uLight;
varying vec2 vUv; varying vec2 vQ; varying float vLayer; varying vec3 vColor; varying vec4 vTile; varying float vGlow; varying float vFog; varying float vShade;
void main(){
  vec3 p = position; p.z -= layer * uDepth;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
  vShade = 0.5 + 0.5 * abs(dot(n, normalize(uLight)));
  float col = mod(iGlyph, 16.0); float row = floor(iGlyph / 16.0);
  vUv = (vec2(col, row) + vec2(uv.x, 1.0 - uv.y)) / 16.0;
  vQ = uv; vLayer = layer; vColor = iColor; vTile = iTile; vGlow = iGlow; vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uAtlas; uniform vec3 uFog; uniform float uFogD; uniform float uMode; uniform vec3 uHi; uniform float uHiAmt; uniform float uGain;
varying vec2 vUv; varying vec2 vQ; varying float vLayer; varying vec3 vColor; varying vec4 vTile; varying float vGlow; varying float vFog; varying float vShade;
void main(){
  vec4 s = texture2D(uAtlas, vUv);
  float ink = smoothstep(0.3, 0.7, s.r);
  float halo = s.g;
  float front = 1.0 - step(0.001, vLayer);
  vec3 glyph = mix(vColor, uHi, clamp(vGlow * uHiAmt, 0.0, 1.0));
  float fogF = 1.0 - exp(-vFog * vFog * uFogD * uFogD);
  if (uMode < 0.5) {
    float tile = vTile.a;
    float a = max(ink, tile);
    if (a < 0.5) discard;
    vec3 c;
    if (front > 0.5) {
      float e = min(min(vQ.x, 1.0 - vQ.x), min(vQ.y, 1.0 - vQ.y));
      vec3 t = vTile.rgb * mix(0.7, 1.0, smoothstep(0.0, 0.06, e));
      c = tile > 0.5 ? mix(t, glyph, ink) : glyph;
      c *= 1.0 + vGlow * 0.25;
    } else {
      vec3 base = tile > 0.5 ? vTile.rgb : glyph;
      c = base * mix(0.62, 0.32, vLayer);
    }
    c *= vShade * uGain;
    gl_FragColor = vec4(mix(c, uFog, fogF), 1.0);
  } else if (uMode < 1.5) {
    vec3 c = front > 0.5 ? glyph * (ink * 1.15 + halo * (0.3 + vGlow * 1.1)) : glyph * ink * 0.3 * (1.0 - vLayer * 0.6);
    gl_FragColor = vec4(c * uGain * (1.0 - fogF), 1.0);
  } else {
    float edge = ink * (1.0 - smoothstep(0.45, 0.8, halo));
    float a; vec3 c;
    if (front > 0.5) { a = ink * 0.1 + edge * 0.8 + vGlow * ink * 0.35; c = mix(vec3(1.0), glyph, clamp(edge * 1.2 + vGlow * 0.6, 0.0, 1.0)); }
    else { a = edge * 0.16; c = glyph; }
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(c, uFog, fogF), a);
  }
  #include <colorspace_fragment>
}`;

export const MODES = { solid: 0, light: 1, glass: 2 } as const;
export type GlyphMode = keyof typeof MODES;
export interface GlyphOpts { mode?: GlyphMode; font?: number; layers?: number; depth?: number; fog?: string; fogDensity?: number; hi?: string; hiAmt?: number }

function glyphMaterial(atlas: THREE.Texture, o: GlyphOpts) {
  const mode = MODES[o.mode || 'solid'];
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas }, uDepth: { value: o.depth || 0 }, uFog: { value: new THREE.Color(o.fog || '#000') }, uFogD: { value: o.fogDensity ?? 0.03 },
      uMode: { value: mode }, uHi: { value: new THREE.Color(o.hi || '#ffffff') }, uHiAmt: { value: o.hiAmt ?? 0.8 },
      uLight: { value: new THREE.Vector3(0.35, 0.6, 1).normalize() }, uGain: { value: 1 },
    },
    vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide,
    transparent: mode !== 0, depthWrite: mode === 0,
    blending: mode === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
function glyphGeometry(L: number) {
  const pos: number[] = [], uv: number[] = [], lay: number[] = [], idx: number[] = [];
  for (let l = 0; l < L; l++) {
    const t = L > 1 ? l / (L - 1) : 0, b = l * 4;
    pos.push(-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0); uv.push(0, 0, 1, 0, 1, 1, 0, 1); lay.push(t, t, t, t);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('layer', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  return g;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export const QI = new THREE.Quaternion();
export const QFLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
export const TMPC = new THREE.Color();
export const C = (h: string) => new THREE.Color(h);
export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface Stream { chars: string[]; word: number[] }

export class GlyphLayer {
  n: number; font: number; mode: number;
  aG: THREE.InstancedBufferAttribute; aC: THREE.InstancedBufferAttribute; aT: THREE.InstancedBufferAttribute; aW: THREE.InstancedBufferAttribute;
  mat: THREE.ShaderMaterial; mesh: THREE.InstancedMesh;
  cur: string[]; tgt: string[]; flip: Float32Array; word: Int16Array; glow: Float32Array;
  constructor(atlas: THREE.Texture, n: number, o: GlyphOpts) {
    this.n = n; this.font = o.font ?? 0; this.mode = MODES[o.mode || 'solid'];
    const geo = glyphGeometry(o.layers || 1);
    const mk = (k: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aG = mk(1); this.aC = mk(3); this.aT = mk(4); this.aW = mk(1);
    geo.setAttribute('iGlyph', this.aG); geo.setAttribute('iColor', this.aC); geo.setAttribute('iTile', this.aT); geo.setAttribute('iGlow', this.aW);
    this.mat = glyphMaterial(atlas, o);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cur = Array(n).fill(' '); this.tgt = Array(n).fill(' ');
    this.flip = new Float32Array(n).fill(1); this.word = new Int16Array(n).fill(-1); this.glow = new Float32Array(n);
    (this.aG.array as Float32Array).fill(gIndex(this.font, ' '));
    (this.aC.array as Float32Array).fill(1);
  }
  /** delay null = instant; otherwise seconds before this glyph starts its flip. */
  char(i: number, ch: string, delay?: number | null) {
    ch = norm(ch); if (this.tgt[i] === ch) return; this.tgt[i] = ch; this.busy = true;
    if (delay == null) { this.cur[i] = ch; (this.aG.array as Float32Array)[i] = gIndex(this.font, ch); this.flip[i] = 1; this.aG.needsUpdate = true; }
    else this.flip[i] = -delay;
  }
  fill(st: Stream, order: number[] | null, off = 0, stag: number | null = 0.01) {
    const L = st.chars.length, n = order ? order.length : this.n;
    for (let j = 0; j < n; j++) {
      const i = order ? order[j] : j, k = wrap(j + off, L);
      this.char(i, st.chars[k], stag == null ? null : j * stag); this.word[i] = st.word[k];
    }
  }
  /** Skip-when-settled bookkeeping: once no glyph is flipping and every glow has reached its target
   *  for the current active word, tick() is a no-op (the whole Metropolis costs nothing per frame). */
  private busy = true; private lastActive = -99;
  tick(dt: number, active: number) {
    if (!this.busy && active === this.lastActive) return;
    this.lastActive = active;
    let g = false, moving = false; const k = Math.min(1, dt * 9); const G = this.aG.array as Float32Array, W = this.aW.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const f = this.flip[i];
      if (f < 1) {
        moving = true;
        const nf = f + dt * 3.4;
        if (f < 0.5 && nf >= 0.5) { this.cur[i] = this.tgt[i]; G[i] = gIndex(this.font, this.cur[i]); g = true; }
        this.flip[i] = Math.min(1, nf);
      }
      const tg = active >= 0 && this.word[i] === active ? 1 : 0, gl = this.glow[i];
      if (gl !== tg) { const ng = Math.abs(tg - gl) < 0.004 ? tg : gl + (tg - gl) * k; this.glow[i] = ng; W[i] = ng; moving = true; }
    }
    if (g) this.aG.needsUpdate = true;
    if (moving) this.aW.needsUpdate = true;
    this.busy = moving;
  }
  fs(i: number) { const f = this.flip[i]; return f >= 1 || f < 0 ? 1 : Math.abs(Math.cos(f * Math.PI)); }
  put(i: number, x: number, y: number, z: number, q: THREE.Quaternion, sx: number, sy: number, sz?: number) {
    _p.set(x, y, z); _s.set(sx, sy * this.fs(i), sz ?? sx); _m.compose(_p, q, _s); _m.toArray(this.mesh.instanceMatrix.array as Float32Array, i * 16);
  }
  putE(i: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz?: number) {
    _q.setFromEuler(_e.set(rx, ry, rz)); this.put(i, x, y, z, _q, sx, sy, sz);
  }
  hide(i: number) { _m.makeScale(0, 0, 0); _m.toArray(this.mesh.instanceMatrix.array as Float32Array, i * 16); }
  col(i: number, c: THREE.Color) { const a = this.aC.array as Float32Array; a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  tile(i: number, c: THREE.Color, alpha = 1) { const a = this.aT.array as Float32Array; a[i * 4] = c.r; a[i * 4 + 1] = c.g; a[i * 4 + 2] = c.b; a[i * 4 + 3] = alpha; }
  /** Static layers (a whole city) set their matrices once; freeze() uploads them and stops per-frame uploads. */
  frozen = false;
  freeze() { this.mesh.instanceMatrix.needsUpdate = true; this.frozen = true; }
  commit() { if (!this.frozen) this.mesh.instanceMatrix.needsUpdate = true; this.aC.needsUpdate = true; this.aT.needsUpdate = true; }
}

/* ───────── scene helpers ───────── */
const _mb = new THREE.Matrix4(), _bx = new THREE.Vector3(), _bz = new THREE.Vector3();
/** Last basis y-axis computed by basisQ (read it straight after the call). */
export const BASIS_Y = new THREE.Vector3();
export function basisQ(x: THREE.Vector3, z: THREE.Vector3, out: THREE.Quaternion) {
  _bx.copy(x).normalize(); _bz.copy(z).normalize(); BASIS_Y.crossVectors(_bz, _bx).normalize(); _bz.crossVectors(_bx, BASIS_Y);
  _mb.makeBasis(_bx, BASIS_Y, _bz); return out.setFromRotationMatrix(_mb);
}
export function grad(stops: THREE.Color[], t: number, out: THREE.Color) { t = clamp(t) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)); return out.copy(stops[i]).lerp(stops[i + 1], t - i); }
export function blobTex(stops: [number, string][]) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ───────── volume contract ───────── */
export interface TypoAudio { kick: number; bass: number; mid: number; high: number; level: number; bands: Float32Array; beat: number; half: number; bar: number; onset: boolean; live: boolean; voice: number;
  /** Running beat count (integrated tempo) — the clock mechanical motion ratchets on. */
  beats: number }

/** Ratchet: integer steps that snap in the first third of each unit with a back-out overshoot, then hold. */
export function tick(x: number) { const i = Math.floor(x); const f = clamp((x - i) * 3) - 1; return i + 1 + 2.2 * f * f * f + 1.2 * f * f; }
/** A lever that swings 0→1 on one step and back 1→0 on the next, with the same ratchet easing. */
export function lever(x: number) { const t = tick(x), i = Math.floor(t + 0.001), f = t - i; return i % 2 === 0 ? f : 1 - f; }
export interface LyricState { idx: number; word: number; words: string[] }
export interface LineStreams { words: string[]; dense: Stream; spaced: Stream }

export interface Vol {
  def: VolumeDef; scene: THREE.Scene; cam: THREE.PerspectiveCamera; bg: THREE.Color; root: THREE.Group;
  layers: GlyphLayer[]; s: any;
  layer: (n: number, o: GlyphOpts) => GlyphLayer;
  flat: (geo: THREE.BufferGeometry, color: string, pos?: THREE.Vector3, parent?: THREE.Object3D) => THREE.Mesh;
  decal: (tex: THREE.Texture, w: number, h: number, pos: THREE.Vector3, opacity?: number) => THREE.Mesh;
}
export interface VolumeDef {
  key: string; name: string; bg: string; fog: number; fov: number;
  /** The volume drives its own camera every frame (fly-throughs, orbits); the director leaves it alone. */
  ownCamera?: boolean;
  build(v: Vol): void;
  text(v: Vol, st: LineStreams, instant: boolean): void;
  update(v: Vol, t: number, dt: number, A: TypoAudio, ly: LyricState): void;
}

export function makeVol(def: VolumeDef, atlas: THREE.Texture): Vol {
  const v: Vol = {
    def, scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(def.fov, 16 / 9, 0.1, 200), bg: new THREE.Color(def.bg),
    layers: [], root: new THREE.Group(), s: {},
    layer: (n, o) => { const L = new GlyphLayer(atlas, n, { fog: def.bg, fogDensity: def.fog, ...o }); v.root.add(L.mesh); v.layers.push(L); return L; },
    flat: (geo, color, pos, parent) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); if (pos) m.position.copy(pos); (parent || v.root).add(m); return m; },
    decal: (tex, w, h, pos, opacity = 1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity })); m.rotation.x = -Math.PI / 2; m.position.copy(pos); v.scene.add(m); return m; },
  };
  v.scene.add(v.root);
  def.build(v);
  return v;
}

/** Frees every geometry/material/texture the volume created (the atlas is shared and kept). */
export function disposeVol(v: Vol, atlas: THREE.Texture | null) {
  v.scene.traverse((o: any) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m: any) => { if (m.map && m.map !== atlas) m.map.dispose(); m.dispose(); });
  });
}

export function streamOf(words: string[], sep: string, tail: string): Stream {
  const chars: string[] = [], word: number[] = [];
  words.forEach((w, wi) => { for (const c of w) { chars.push(c); word.push(wi); } for (const c of (wi === words.length - 1 ? tail : sep)) { chars.push(c); word.push(-1); } });
  return { chars, word };
}
export function lineStreams(text: string): LineStreams {
  const words = text.toUpperCase().replace(/[’‘]/g, "'").replace(/[^A-Z0-9·&?!'\-.,:/ ]/g, ' ').split(/\s+/).filter(Boolean);
  const w = words.length ? words : ['CHORA'];
  return { words: w, dense: streamOf(w, '·', '·'), spaced: streamOf(w, ' ', ' · ') };
}

/* ───────── camera director ─────────
 * The same idea as the Deco director: cut on the beat between shot types, shorter shots when the
 * music is intense, a forced cut on a drop. Shots are built around each volume's own framing (the
 * pose its build() set), so every volume keeps its composition and gains coverage: push-ins,
 * tight angled close-ups, orbits, crane moves, snap zooms and dutch angles. Kicks punch the lens,
 * snares jolt the roll. Volumes with ownCamera (fly-throughs, orbits) are left alone.
 */
const SHOTS = ['base', 'push', 'tight', 'orbit', 'crane', 'snap', 'dutch'] as const;
const _dq = new THREE.Quaternion(), _dv = new THREE.Vector3(), _dt = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3();
export class TypoDirector {
  private base = new WeakMap<Vol, { pos: THREE.Vector3; tgt: THREE.Vector3; fov: number }>();
  private start = 0; private n = 0; private kind: (typeof SHOTS)[number] = 'base'; private len = 8; private seed = 0.5;
  private eF = 0; private eS = 0; private lastDrop = -99; private jolt = 0; private prevSnareish = 0;
  /** Field of view the host should use (before its aspect correction). */
  fov = 40;
  apply(v: Vol, A: TypoAudio, dt: number, t: number) {
    if (v.def.ownCamera) { this.fov = v.s._fov ?? v.def.fov; return; }
    let b = this.base.get(v);
    if (!b) {
      const pos = v.cam.position.clone(), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(v.cam.quaternion);
      const dist = Math.max(4, pos.length());
      b = { pos, tgt: pos.clone().addScaledVector(fwd, dist), fov: v.def.fov };
      this.base.set(v, b);
    }
    const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
    this.eF += (A.level - this.eF) * k1(0.35); this.eS += (A.level - this.eS) * k1(8);
    const drop = this.eF - this.eS > 0.25 && A.beats - this.lastDrop > 16;
    if (drop) this.lastDrop = A.beats;
    const e = Math.min(1, this.eF);
    if (drop || A.beats - this.start >= this.len || A.beats < this.start) {
      this.start = Math.floor(A.beats); this.n++;
      const lens = e > 0.55 ? [2, 2, 4, 4, 8] : e > 0.3 ? [2, 4, 4, 8, 8, 16] : [4, 8, 8, 16];
      this.len = lens[Math.floor(hash(this.n * 5.17) * lens.length)];
      this.kind = drop ? (hash(t) > 0.5 ? 'snap' : 'push') : SHOTS[Math.floor(hash(this.n * 2.31) * SHOTS.length)];
      this.seed = hash(this.n * 9.13);
    }
    const u = clamp((A.beats - this.start) / this.len), ease = u * u * (3 - 2 * u), sd = this.seed;
    _dv.copy(b.pos).sub(b.tgt);                       // target → camera
    _dt.copy(b.tgt);
    let fov = b.fov, roll = 0;
    const side = sd > 0.5 ? 1 : -1;
    switch (this.kind) {
      case 'base': _dv.multiplyScalar(1 - 0.08 * u); break;
      case 'push': _dv.multiplyScalar(1 - 0.5 * ease); break;
      case 'tight': {
        const r = _dv.length() * 0.28;
        _dt.x += (hash(sd * 3) - 0.5) * r * 2.4; _dt.y += (hash(sd * 7) - 0.5) * r * 1.6;
        _dv.multiplyScalar(0.42); _dv.applyQuaternion(_dq.setFromAxisAngle(_up, side * (0.35 + 0.2 * u)));
        fov *= 0.85; roll = (hash(sd * 11) - 0.5) * 0.4; break;
      }
      case 'orbit': _dv.applyQuaternion(_dq.setFromAxisAngle(_up, side * (0.2 + 0.9 * ease))); _dv.multiplyScalar(0.9); break;
      case 'crane': {
        _ax.crossVectors(_up, _dv).normalize();
        _dv.applyQuaternion(_dq.setFromAxisAngle(_ax, (u - 0.5) * 0.9 * side)); _dv.multiplyScalar(0.8);
        _dt.x += (u - 0.5) * 2.0 * side; break;
      }
      case 'snap': { const z = 1 - Math.pow(1 - Math.min(1, u * 4), 3); fov *= side > 0 ? 1 - 0.45 * z : 0.55 + 0.45 * z; break; }
      case 'dutch': roll = side * 0.3; _dv.multiplyScalar(0.85); break;
    }
    // Snare-ish hits (highs jumping) jolt the roll; kicks punch the lens.
    const snareish = A.high;
    if (snareish - this.prevSnareish > 0.25) this.jolt += (hash(t * 5.3) - 0.5) * 0.3;
    this.prevSnareish = snareish;
    this.jolt *= Math.exp(-dt / 0.25);
    fov *= 1 - A.kick * 0.1;
    v.cam.position.copy(_dt).add(_dv);
    v.cam.up.set(0, 1, 0); v.cam.lookAt(_dt);
    v.cam.rotateZ(roll + this.jolt);
    this.fov = fov;
  }
}
