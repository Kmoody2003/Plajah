// Themed Shows — shared rendering pieces: easing, text cards, polaroid cards, the
// full-page photo layer (Ken Burns + depth parallax), and a small texture cache.

import * as THREE from 'three';
import type { ShowDedication, ShowPhoto } from './types';
import { renderFixed } from './photoPrep';

export const SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif";
export const HAND = "'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";

/** Graceful easing: smootherstep (zero velocity AND acceleration at both ends). */
export const ease = (x: number) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (x * 6 - 15) + 10); };
export const easeOut = (x: number) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return 1 - Math.pow(1 - x, 3); };
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function hash(n: number) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function strHash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

/** Fade envelope: 0→1 over `fin`, hold, 1→0 over `fout`, across [0, len]. */
export function envelope(t: number, len: number, fin: number, fout: number) {
  if (t <= 0 || t >= len) return 0;
  return Math.min(ease(t / fin), ease((len - t) / fout));
}

// --- texture cache ----------------------------------------------------------------------

export class TextureCache {
  private map = new Map<string, Promise<THREE.Texture>>();
  private order: string[] = [];
  constructor(private limit: number) {}
  get(key: string, make: () => Promise<THREE.Texture>): Promise<THREE.Texture> {
    let p = this.map.get(key);
    if (!p) {
      p = make();
      this.map.set(key, p);
      this.order.push(key);
      while (this.order.length > this.limit) {
        const old = this.order.shift()!;
        this.map.get(old)?.then((t) => t.dispose()).catch(() => {});
        this.map.delete(old);
      }
    } else {
      this.order.splice(this.order.indexOf(key), 1);
      this.order.push(key);
    }
    return p;
  }
  /** Synchronous peek: the texture if it has finished loading. */
  ready = new Map<string, THREE.Texture>();
  async load(key: string, make: () => Promise<THREE.Texture>) {
    const t = await this.get(key, make);
    this.ready.set(key, t);
    // prune ready entries that were evicted
    for (const k of this.ready.keys()) if (!this.map.has(k)) this.ready.delete(k);
    return t;
  }
  dispose() { for (const p of this.map.values()) p.then((t) => t.dispose()).catch(() => {}); this.map.clear(); this.ready.clear(); }
}

export function canvasTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Full photo, tone-fixed, as a texture (max side 2048 for 1080p output). */
export async function fullPhotoTexture(p: ShowPhoto, maxSide = 2048) {
  return canvasTexture(await renderFixed(p, maxSide));
}

// --- polaroid card --------------------------------------------------------------------

function penDate(p: ShowPhoto) {
  if (!p.takenAt) return '';
  const d = new Date(p.takenAt);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** White polaroid with the square crop and a hand-written line in the bottom margin. */
export async function polaroidCanvas(p: ShowPhoto, W = 384): Promise<HTMLCanvasElement> {
  const H = Math.round(W * (0.366 / 0.3));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // paper with a faint warm grain
  g.fillStyle = '#f7f3ea';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(120,100,70,${0.025 * hash(i + strHash(p.id) * 1000)})`;
    g.fillRect(hash(i) * W, hash(i + 4000) * H, 1.5, 1.5);
  }
  const win = Math.round(W * (0.252 / 0.3));
  const left = Math.round((W - win) / 2), top = Math.round(W * (0.024 / 0.3));
  const photo = await renderFixed(p, win * 2, p.polaroidCrop);
  g.fillStyle = '#1b1b1b';
  g.fillRect(left, top, win, win);
  g.drawImage(photo, left, top, win, win);
  // soft inner shade like a real print
  const sh = g.createLinearGradient(0, top, 0, top + win);
  sh.addColorStop(0, 'rgba(0,0,0,0.10)'); sh.addColorStop(0.15, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.06)');
  g.fillStyle = sh; g.fillRect(left, top, win, win);
  const line = (p.caption || p.title || penDate(p) || '').slice(0, 34);
  if (line) {
    g.fillStyle = '#2c3a66';
    g.font = `${Math.round(W * 0.07)}px ${HAND}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(W / 2, top + win + (H - top - win) / 2);
    g.rotate((hash(strHash(p.id) * 77) - 0.5) * 0.05);
    g.fillText(line, 0, 0, W * 0.86);
    g.restore();
  }
  return c;
}

// --- title cards ----------------------------------------------------------------------

export function titleCardCanvas(kind: 'intro' | 'outro', d: ShowDedication, w = 1920, h = 1080): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = h * 0.02;
  const cy = h * 0.5;
  if (kind === 'intro') {
    g.fillStyle = 'rgba(255,240,215,0.92)';
    g.font = `italic ${Math.round(h * 0.04)}px ${SERIF}`;
    g.fillText(d.heading || 'In loving memory of', w / 2, cy - h * 0.1);
    g.fillStyle = '#fff6e6';
    g.font = `500 ${Math.round(h * 0.095)}px ${SERIF}`;
    g.fillText(d.name || '', w / 2, cy + h * 0.005, w * 0.9);
    if (d.dates) {
      g.fillStyle = 'rgba(255,236,205,0.85)';
      g.font = `${Math.round(h * 0.038)}px ${SERIF}`;
      g.fillText(d.dates, w / 2, cy + h * 0.1);
    }
    // a thin ornament
    g.strokeStyle = 'rgba(255,225,180,0.6)'; g.lineWidth = Math.max(1, h * 0.0016);
    g.beginPath(); g.moveTo(w / 2 - h * 0.12, cy + h * 0.165); g.lineTo(w / 2 + h * 0.12, cy + h * 0.165); g.stroke();
  } else {
    g.fillStyle = '#fff6e6';
    g.font = `italic ${Math.round(h * 0.06)}px ${SERIF}`;
    g.fillText(d.closing || 'Forever in our hearts', w / 2, cy - h * 0.02, w * 0.9);
    if (d.name) {
      g.fillStyle = 'rgba(255,236,205,0.85)';
      g.font = `${Math.round(h * 0.036)}px ${SERIF}`;
      g.fillText(d.name + (d.dates ? `  ·  ${d.dates}` : ''), w / 2, cy + h * 0.07, w * 0.9);
    }
  }
  return c;
}

export function captionCanvas(text: string, w = 1600, h = 120): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 12;
  g.fillStyle = 'rgba(255,244,228,0.95)';
  g.font = `italic ${Math.round(h * 0.42)}px ${SERIF}`;
  g.fillText(text, w / 2, h / 2, w * 0.95);
  return c;
}

// --- full-page photo layer (shared by both themes) -------------------------------------
//
// An orthographic overlay drawn after the 3D scene. One quad per visible photo, with a
// shader that does Ken Burns (scale + pan toward the subject), a 2.5D parallax from a
// fake depth field (subject + lower frame come forward), soft vignette and fade.

const PHOTO_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const PHOTO_FS = `
uniform sampler2D uMap; uniform float uOpacity; uniform vec2 uScale; uniform vec2 uPan; uniform float uZoom;
uniform vec2 uFocus; uniform vec2 uPar; uniform float uDepth; uniform float uVig; uniform float uBlur; uniform vec2 uTexel; uniform float uWipe;
varying vec2 vUv;
float depthAt(vec2 uv){
  float d = 0.55*smoothstep(0.15, 1.0, 1.0 - uv.y);                  // lower frame nearer
  vec2 q = (uv - uFocus) * vec2(1.0, 1.25);
  d += 0.6*exp(-dot(q,q)*7.0);                                     // subject nearer
  return d;
}
void main(){
  vec2 uv = (vUv - 0.5) / (uScale * uZoom) + 0.5 + uPan;
  float dep = depthAt(uv);
  uv += uPar * (dep - 0.5) * uDepth;
  vec4 c;
  if (uBlur > 0.0) {
    c = vec4(0.0);
    for (int i=-2;i<=2;i++) for (int j=-2;j<=2;j++) c += texture2D(uMap, uv + vec2(float(i),float(j))*uTexel*uBlur);
    c /= 25.0;
  } else c = texture2D(uMap, uv);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) c.a = 0.0;
  if (uWipe < 1.5) c.a *= clamp((uWipe*1.25 - vUv.x)/0.25, 0.0, 1.0);
  vec2 v = vUv - 0.5; float vig = 1.0 - uVig * dot(v, v) * 1.6;
  gl_FragColor = vec4(c.rgb * vig, c.a * uOpacity);
  #include <colorspace_fragment>
}`;

export interface PhotoQuadState {
  tex: THREE.Texture | null;
  opacity: number;
  /** Ken Burns: zoom (1 = fit), pan in uv units. */
  zoom: number;
  pan: { x: number; y: number };
  focus: { x: number; y: number };
  /** Parallax camera offset (uv units) and strength. */
  par: { x: number; y: number };
  depth: number;
  /** Placement in the overlay (normalised screen, 0..1) and whether to cover or contain. */
  rect: { x: number; y: number; w: number; h: number };
  fit: 'contain' | 'cover';
  vignette: number;
  blur: number;
  z: number;
  /** 0..1 left-to-right soft reveal; omit for none. */
  wipe?: number;
}

export class PhotoQuad {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uMap: { value: null }, uOpacity: { value: 0 }, uScale: { value: new THREE.Vector2(1, 1) }, uPan: { value: new THREE.Vector2() },
        uZoom: { value: 1 }, uFocus: { value: new THREE.Vector2(0.5, 0.5) }, uPar: { value: new THREE.Vector2() }, uDepth: { value: 0 },
        uVig: { value: 0 }, uBlur: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, uWipe: { value: 2 },
      },
      vertexShader: PHOTO_VS, fragmentShader: PHOTO_FS,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.visible = false;
  }
  /** Apply state. `aspect` is the viewport width/height. */
  apply(s: PhotoQuadState, aspect: number) {
    const u = this.mat.uniforms;
    if (!s.tex || s.opacity <= 0.001) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mesh.renderOrder = s.z;
    const img = s.tex.image as { width: number; height: number };
    const ia = img.width / img.height;
    // quad geometry in ortho space: x in [-aspect/2, aspect/2], y in [-0.5, 0.5]
    let qw = s.rect.w * aspect, qh = s.rect.h;
    const qa = qw / qh;
    let sx = 1, sy = 1; // uv scale so the image keeps its aspect
    if (s.fit === 'contain') {
      if (ia > qa) qh = qw / ia; else qw = qh * ia;
    } else {
      if (ia > qa) sx = qa / ia; else sy = ia / qa;
    }
    this.mesh.scale.set(qw, qh, 1);
    this.mesh.position.set((s.rect.x + s.rect.w / 2 - 0.5) * aspect, 0.5 - (s.rect.y + s.rect.h / 2), 0);
    u.uMap.value = s.tex;
    u.uOpacity.value = s.opacity;
    u.uScale.value.set(1 / sx, 1 / sy);
    u.uZoom.value = s.zoom;
    u.uPan.value.set(s.pan.x, -s.pan.y);
    u.uFocus.value.set(s.focus.x, 1 - s.focus.y);
    u.uPar.value.set(s.par.x, s.par.y);
    u.uDepth.value = s.depth;
    u.uVig.value = s.vignette;
    u.uBlur.value = s.blur;
    u.uWipe.value = s.wipe ?? 2;
    // keep Ken Burns + parallax inside the frame
    const m = Math.max(0, (1 - 1 / Math.max(1, s.zoom)) / 2);
    u.uPan.value.set(Math.max(-m, Math.min(m, s.pan.x)), -Math.max(-m, Math.min(m, s.pan.y)));
    u.uTexel.value.set(1 / img.width, 1 / img.height);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/** A flat full-screen sprite (title cards, captions, dim layers). */
export class FlatQuad {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  constructor(color?: number) {
    this.mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthTest: false, depthWrite: false, color: color ?? 0xffffff, opacity: 0 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.visible = false;
  }
  set(tex: THREE.Texture | null, opacity: number, rect: { x: number; y: number; w: number; h: number }, aspect: number, z: number) {
    if (opacity <= 0.001) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mesh.renderOrder = z;
    if (this.mat.map !== tex) { this.mat.map = tex; this.mat.needsUpdate = true; }
    this.mat.opacity = opacity;
    this.mesh.scale.set(rect.w * aspect, rect.h, 1);
    this.mesh.position.set((rect.x + rect.w / 2 - 0.5) * aspect, 0.5 - (rect.y + rect.h / 2), 0);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/** Deterministic Ken Burns move for a photo: start/end zoom and pan drifting toward its subject. */
export function kenBurns(p: ShowPhoto, k: number) {
  const s = strHash(p.id + ':kb');
  const zoomIn = s > 0.35; // most moves push in; some pull back
  const z0 = zoomIn ? 1.0 : 1.12, z1 = zoomIn ? 1.1 + s * 0.04 : 1.02;
  const fx = (p.focus.x - 0.5) * 0.12, fy = (p.focus.y - 0.5) * 0.12;
  const sx = (hash(s * 91) - 0.5) * 0.05, sy = (hash(s * 37) - 0.5) * 0.04;
  const e = ease(k);
  const zoom = z0 + (z1 - z0) * e;
  const pan = zoomIn
    ? { x: sx + (fx - sx) * e, y: sy + (fy - sy) * e }
    : { x: fx + (sx - fx) * e, y: fy + (sy - fy) * e };
  return { zoom, pan };
}
