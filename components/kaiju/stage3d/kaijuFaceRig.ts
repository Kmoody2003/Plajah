// kaijuFaceRig — the 3D kaiju's decal FACE.
//
// The v2 models have a blank white mask; eyes / brows / mouth are sprite-atlas decals (public/models/mascots/v2/face/*)
// drawn on grids that are projected onto the mask (kaijuFaceConform.ts) and parented to the HEAD bone. Each decal draws one
// atlas cell through a small unlit premultiplied-alpha shader that does all the animation as UV transforms about the cell
// centre — blink squash, gaze slide, brow lift / tilt, mouth open — so the geometry never leaves the surface. State
// swaps cross-dissolve for ~70 ms. Blush is two cheek decals; tears / sweat / hearts / zzz / … are sprites near the head.
//
// Drive it with `rig.apply(DecalFace)` (music acting: decalsFromExpr) or `rig.applyPose(Pose)` (a webcam tracker via
// decalsFromPose) — the VTuber avatar uses the second.

import * as THREE from 'three';
import type { Pose } from '../kaijuPose';
import { atlasUV, decalsFromPose, neutralDecalFace, type AtlasInfo, type DecalFace, type Extra } from './kaijuFaceDecals';
import { castRay, conformGrid, type DecalAnchor, type V3 } from './kaijuFaceConform';
import { EXTRA_DEFS, GLYPH, glyphRect, paintExtrasAtlas, type SpriteState } from './kaijuFaceExtras';

export const FACE_BASE = '/models/mascots/v2/face/';
export type Who = 'chora' | 'reello';
export type SlotName = 'eyeL' | 'eyeR' | 'browL' | 'browR' | 'mouth' | 'blushL' | 'blushR';
export const SLOTS: SlotName[] = ['eyeL', 'eyeR', 'browL', 'browR', 'mouth', 'blushL', 'blushR'];

export interface FaceAnchors {
  slots: Record<SlotName, DecalAnchor>;
  /** head-local origin for the floating extras (hearts, zzz, !, ?, anger vein) */
  top: V3;
  /** gaze slide, in cell units at gaze = ±1, for pupil-bearing eyes */
  gazeAmp: [number, number];
  /** how far the brows travel with browLift (cell units) */
  browTravel: number;
  /** light multiplier on decal colour (match the lit mask) */
  brightness: number;
  /** how far the decals sit off the surface (metres) */
  lift?: number;
}

/** Starting points; the face lab tunes these and writes public/models/mascots/v2/face/{who}_anchors.json. */
export const DEFAULT_ANCHORS: Record<Who, FaceAnchors> = {
  chora: {
    slots: {
      eyeL: { x: 0.145, y: 0.15, s: 0.2, rot: 0 }, eyeR: { x: -0.135, y: 0.15, s: 0.2, rot: 0 },
      browL: { x: 0.135, y: 0.238, s: 0.19, rot: 0 }, browR: { x: -0.125, y: 0.238, s: 0.19, rot: 0 },
      mouth: { x: 0, y: 0.06, s: 0.25, rot: 0 }, blushL: { x: 0.205, y: 0.095, s: 0.09, rot: 0, aspect: 0.7 }, blushR: { x: -0.215, y: 0.095, s: 0.09, rot: 0, aspect: 0.7 },
    },
    top: [0, 0.68, 0.12], gazeAmp: [0.1, 0.07], browTravel: 0.06, brightness: 0.9,
  },
  reello: {
    slots: {
      eyeL: { x: 0.15, y: 0.165, s: 0.26, rot: 0 }, eyeR: { x: -0.15, y: 0.165, s: 0.26, rot: 0 },
      browL: { x: 0.15, y: 0.225, s: 0.2, rot: 0 }, browR: { x: -0.15, y: 0.225, s: 0.2, rot: 0 },
      mouth: { x: 0, y: 0.08, s: 0.21, rot: 0 }, blushL: { x: 0.22, y: 0.1, s: 0.09, rot: 0, aspect: 0.7 }, blushR: { x: -0.22, y: 0.1, s: 0.09, rot: 0, aspect: 0.7 },
    },
    top: [0, 0.68, 0.12], gazeAmp: [0.05, 0.04], browTravel: 0.06, brightness: 0.9,
  },
};

// ------------------------------------------------------------------------------------------------ assets
export interface AtlasTex { tex: THREE.Texture; info: AtlasInfo }
export interface FaceAssets {
  who: Who; eyesL: AtlasTex; eyesR: AtlasTex; brows: AtlasTex; mouths: AtlasTex; extras: THREE.Texture; anchors: FaceAnchors;
}

function loadTex(url: string): Promise<THREE.Texture> {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    // Premultiplied upload: mips of a straight-alpha atlas would bleed the transparent pixels' junk colour into the glyph edges.
    t.premultiplyAlpha = true; t.colorSpace = THREE.NoColorSpace;      // sRGB decode happens in the shader, after un-premultiply
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; res(t);
  }, undefined, rej));
}
const loadAtlas = async (name: string): Promise<AtlasTex> => {
  const [tex, info] = await Promise.all([loadTex(`${FACE_BASE}${name}.png`), fetch(`${FACE_BASE}${name}.json`).then(r => { if (!r.ok) throw new Error(name); return r.json() as Promise<AtlasInfo>; })]);
  return { tex, info };
};
const cache = new Map<Who, Promise<FaceAssets>>();

/** Mix an anchors JSON over the defaults (so older / partial files keep working). */
export function mergeAnchors(base: FaceAnchors, over: any): FaceAnchors {
  if (!over) return base;
  const out: FaceAnchors = { ...base, ...over, slots: { ...base.slots } };
  for (const k of SLOTS) if (over.slots?.[k]) out.slots[k] = { ...base.slots[k], ...over.slots[k] };
  return out;
}

export function loadFaceAssets(who: Who): Promise<FaceAssets> {
  let p = cache.get(who);
  if (!p) {
    p = (async () => {
      const [eyesL, eyesR, brows, mouths, anchorsJson] = await Promise.all([
        loadAtlas(`${who}_eyes_L`), loadAtlas(`${who}_eyes_R`), loadAtlas(`${who}_brows`), loadAtlas(`${who}_mouths`),
        fetch(`${FACE_BASE}${who}_anchors.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const extras = new THREE.CanvasTexture(paintExtrasAtlas());
      extras.colorSpace = THREE.SRGBColorSpace; extras.anisotropy = 4; extras.premultiplyAlpha = false;
      return { who, eyesL, eyesR, brows, mouths, extras, anchors: mergeAnchors(DEFAULT_ANCHORS[who], anchorsJson) };
    })();
    cache.set(who, p);
    p.catch(() => cache.delete(who));
  }
  return p;
}

/** React-Suspense friendly read: throws the promise until the assets are in (so the stage's shader precompile sees the decals). */
const status = new Map<Who, { done: boolean; err?: unknown; value?: FaceAssets }>();
export function readFaceAssets(who: Who): FaceAssets {
  let e = status.get(who);
  if (!e) { const rec: { done: boolean; err?: unknown; value?: FaceAssets } = { done: false }; status.set(who, rec); loadFaceAssets(who).then(v => { rec.value = v; rec.done = true; }, err => { rec.err = err; rec.done = true; }); e = rec; }
  if (!e.done) throw loadFaceAssets(who).then(() => undefined, () => undefined);
  if (e.err) { status.delete(who); throw e.err; }
  return e.value!;
}

// ------------------------------------------------------------------------------------------------ mesh triangles
/** The head-weighted triangles of the skinned mesh in HEAD-LOCAL bind-pose space (what conformGrid casts rays against). */
export function extractHeadTris(mesh: THREE.SkinnedMesh, head: THREE.Bone, minWeight = 0.4): Float32Array {
  const geo = mesh.geometry, pos = geo.attributes.position, sw = geo.attributes.skinWeight, si = geo.attributes.skinIndex;
  const hi = mesh.skeleton.bones.indexOf(head);
  const m = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[hi], mesh.bindMatrix);
  const w = new Float32Array(pos.count), p = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w[i] += sw.getComponent(i, k);
    v.fromBufferAttribute(pos, i).applyMatrix4(m); p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
  }
  const idx = geo.index; const n = idx ? idx.count : pos.count; const out: number[] = [];
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    if (w[a] < minWeight || w[b] < minWeight || w[c] < minWeight) continue;
    for (const q of [a, b, c]) out.push(p[q * 3], p[q * 3 + 1], p[q * 3 + 2]);
  }
  return new Float32Array(out);
}

// ------------------------------------------------------------------------------------------------ shader
const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec4 uCellA; uniform vec4 uCellB; uniform float uMix;
uniform vec4 uXf;        // sx, sy, shiftX, shiftY  (cell units, about the cell centre)
uniform float uTilt; uniform float uMirror; uniform float uAlpha; uniform vec3 uBright;
varying vec2 vUv;
vec3 srgb2lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec2 p = vUv - 0.5 - uXf.zw;
  float cs = cos(-uTilt), sn = sin(-uTilt);
  p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs) / max(uXf.xy, vec2(0.001));
  p.x *= mix(1.0, -1.0, uMirror);
  vec2 g = p + 0.5;
  float inside = step(0.0, g.x) * step(g.x, 1.0) * step(0.0, g.y) * step(g.y, 1.0);
  g = clamp(g, 0.0, 1.0);
  vec4 a = texture2D(uMap, uCellA.xy + g * uCellA.zw);
  vec4 b = texture2D(uMap, uCellB.xy + g * uCellB.zw);
  vec4 t = mix(a, b, uMix);                       // premultiplied, sRGB-encoded colour
  float al = t.a * inside * uAlpha;
  if (al < 0.003) discard;
  vec3 col = srgb2lin(t.rgb / max(t.a, 0.001)) * uBright;
  gl_FragColor = vec4(col, al);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;             // premultiplied output
}`;

function makeMaterial(tex: THREE.Texture, bright: number): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, premultipliedAlpha: true,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: {
      uMap: { value: tex }, uCellA: { value: new THREE.Vector4(0, 0, 1, 1) }, uCellB: { value: new THREE.Vector4(0, 0, 1, 1) }, uMix: { value: 1 },
      uXf: { value: new THREE.Vector4(1, 1, 0, 0) }, uTilt: { value: 0 }, uMirror: { value: 0 }, uAlpha: { value: 1 }, uBright: { value: new THREE.Vector3(bright, bright, bright) },
    },
  });
  return m;
}

// ------------------------------------------------------------------------------------------------ the rig
const OPEN_TYPE = new Set(['open', 'half', 'wide', 'sad', 'sleepy', 'look_up_left']);
const LINE_ART = new Set(['closed', 'happy', 'squint']);
const PUPIL = new Set(['open', 'half', 'wide', 'sad', 'sleepy', 'look_up_left']);
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const DISSOLVE = 0.075;
/** extras are drawn for a close-up; the stage views the dancers from 3-6 m, so enlarge them (also moves nothing else) */
const EXTRA_SCALE = 1.7;

interface Slot {
  name: SlotName; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; atlas: AtlasTex | null;
  cur: string; prev: string; mix: number; mirror: boolean;
  sx: number; sy: number; shx: number; shy: number; tilt: number; alpha: number;   // smoothed
}
interface SpriteRec { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; map: THREE.Texture }

export class FaceDecalRig {
  readonly who: Who;
  readonly head: THREE.Bone;
  readonly group = new THREE.Group();
  anchors: FaceAnchors;
  /** the face currently being shown (the last apply / applyPose target) */
  readonly face: DecalFace = neutralDecalFace();
  private slots = {} as Record<SlotName, Slot>;
  private sprites = new Map<Extra, SpriteRec[]>();
  private weight = new Map<string, number>();
  private blush = 0; private blushBig = 0;
  private clock = 0;
  private tris: Float32Array;
  private assets: FaceAssets;
  private tmp: SpriteState = { x: 0, y: 0, z: 0, size: 0, alpha: 0, rot: 0 };
  private frames: Partial<Record<SlotName, { p: V3; n: V3 }>> = {};

  constructor(assets: FaceAssets, head: THREE.Bone, tris: Float32Array, anchors?: FaceAnchors) {
    this.who = assets.who; this.head = head; this.assets = assets; this.tris = tris; this.anchors = anchors ?? assets.anchors;
    this.group.name = 'face-decals'; head.add(this.group);
    for (const name of SLOTS) {
      const atlas = name === 'eyeL' ? assets.eyesL : name === 'eyeR' ? assets.eyesR : name.startsWith('brow') ? assets.brows : name === 'mouth' ? assets.mouths : null;
      const mat = makeMaterial(atlas ? atlas.tex : assets.extras, this.anchors.brightness);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.frustumCulled = false; mesh.renderOrder = name.startsWith('blush') ? 1 : 2; mesh.name = `decal-${name}`;
      this.group.add(mesh);
      this.slots[name] = { name, mesh, mat, atlas, cur: '', prev: '', mix: 1, mirror: name === 'browL' || name === 'blushL', sx: 1, sy: 1, shx: 0, shy: 0, tilt: 0, alpha: 1 };
      if (name.startsWith('blush')) { const r = glyphRect(GLYPH.blush); mat.uniforms.uCellA.value.set(...r); mat.uniforms.uCellB.value.set(...r); mat.uniforms.uAlpha.value = 0; mat.uniforms.uBright.value.set(1, 1, 1); }
    }
    this.rebuild();
    // extras: a small pool of sprites per kind, hidden until used
    for (const [kind, def] of Object.entries(EXTRA_DEFS)) {
      const list: SpriteRec[] = [];
      for (let i = 0; i < def!.count; i++) {
        const map = assets.extras.clone(); map.needsUpdate = false;
        const r = glyphRect(def!.glyph); map.repeat.set(r[2], r[3]); map.offset.set(r[0], r[1]);
        const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: true });
        const sp = new THREE.Sprite(mat); sp.visible = false; sp.renderOrder = 5; sp.frustumCulled = false; sp.center.set(0.5, 0.5);
        this.group.add(sp); list.push({ sprite: sp, mat, map });
      }
      this.sprites.set(kind as Extra, list);
    }
    this.apply(neutralDecalFace());
    for (const s of Object.values(this.slots)) { s.prev = s.cur; s.mix = 1; }
    this.update(0);
  }

  /** (Re)project every decal grid onto the mesh — call after changing anchors. */
  rebuild() {
    this.frames = {};
    for (const name of SLOTS) {
      const a = this.anchors.slots[name];
      const nx = name === 'mouth' ? 24 : name.startsWith('brow') ? 14 : 16, ny = name === 'mouth' ? 12 : name.startsWith('brow') ? 6 : 16;
      const g = conformGrid(this.tris, a, nx, ny, this.anchors.lift ?? 0.003);
      const s = this.slots[name], geo = s.mesh.geometry;
      if (!g) { geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)); geo.setIndex(null); s.mesh.visible = false; continue; }
      geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3)); geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
      geo.computeBoundingSphere(); s.mesh.visible = true;
      this.frames[name] = { p: g.frame.p, n: g.frame.n };
    }
    for (const s of Object.values(this.slots)) if (s.name !== 'blushL' && s.name !== 'blushR') s.mat.uniforms.uBright.value.setScalar(this.anchors.brightness);
  }

  private cell(slot: Slot, state: string): THREE.Vector4 | null {
    if (!slot.atlas) return null;
    const u = atlasUV(slot.atlas.info, state); if (!u) return null;
    return new THREE.Vector4(u.offset[0], u.offset[1], u.repeat[0], u.repeat[1]);
  }

  private setState(slot: Slot, state: string) {
    if (slot.cur === state) return;
    const c = this.cell(slot, state); if (!c) return;
    const U = slot.mat.uniforms;
    if (slot.cur) { U.uCellB.value.copy(U.uCellA.value); U.uCellA.value.copy(c); slot.mix = 0; } // B = old, A = new; mix goes B→A
    else { U.uCellA.value.copy(c); U.uCellB.value.copy(c); slot.mix = 1; }
    slot.prev = slot.cur; slot.cur = state;
  }

  /** Set the face to show (cheap; call every frame). */
  apply(f: DecalFace) {
    Object.assign(this.face, f); this.face.extras = f.extras.slice();
    const A = this.anchors;
    // eyes
    for (const [name, state, open, sgn] of [['eyeL', f.eyeL, f.openL, 1], ['eyeR', f.eyeR, f.openR, -1]] as const) {
      const s = this.slots[name]; this.setState(s, state);
      // open-type eyes squash vertically (and spread a touch, like a real lid); line-art eyes (closed / happy / squint) are drawn a bit larger so they read
      const o = OPEN_TYPE.has(state) ? clamp(open, 0.07, 1) : 1, boost = LINE_ART.has(state) ? 1.28 : 1;
      s.sx = boost * (1 + (1 - o) * 0.18); s.sy = boost * o;
      const k = PUPIL.has(state) ? 1 : 0.35;
      s.shx = f.gazeX * A.gazeAmp[0] * k; s.shy = f.gazeY * A.gazeAmp[1] * k;
      void sgn;
    }
    // brows: lift (−1 raised … +1 lowered), tilt (+ = angrier: inner end down)
    for (const [name, state, lift, sgn] of [['browL', f.browL, f.browLiftL, 1], ['browR', f.browR, f.browLiftR, -1]] as const) {
      const s = this.slots[name]; this.setState(s, state);
      s.sx = 1; s.sy = 1; s.shx = 0; s.shy = -lift * A.browTravel; s.tilt = f.browTilt * sgn;
    }
    // mouth: height follows the voice / jaw
    const m = this.slots.mouth; this.setState(m, f.mouth); m.sx = 1; m.sy = f.mouthOpen; m.shx = 0; m.shy = 0;
    this.blush = f.extras.includes('blush') ? 1 : 0; this.blushBig = f.extras.includes('blush_big') ? 1 : 0;
  }

  /** The VTuber hook: drive the face straight from a tracker pose (services/vtuber/kaijuFaceMap.ts). */
  applyPose(p: Pose) { this.apply(decalsFromPose(p)); }

  /** Light multiplier for the decals (e.g. follow the stage light on the mask). */
  setBrightness(b: number | [number, number, number]) {
    for (const s of Object.values(this.slots)) if (!s.name.startsWith('blush')) (Array.isArray(b) ? s.mat.uniforms.uBright.value.set(...b) : s.mat.uniforms.uBright.value.setScalar(b));
  }

  update(dt: number) {
    this.clock += dt;
    const k = 1 - Math.exp(-dt * 40), kb = 1 - Math.exp(-dt * 22);
    for (const s of Object.values(this.slots)) {
      const U = s.mat.uniforms;
      if (s.mix < 1) { s.mix = Math.min(1, s.mix + dt / DISSOLVE); }
      U.uMix.value = 1 - s.mix;                              // shader: mix(A = new, B = old, uMix) → progress 0 shows the old cell, 1 the new
      if (s.name.startsWith('blush')) {
        const target = this.blushBig ? 1 : this.blush ? 0.55 : 0;
        const w = (this.weight.get(s.name) ?? 0) + (target - (this.weight.get(s.name) ?? 0)) * kb; this.weight.set(s.name, w);
        U.uMirror.value = s.mirror ? 1 : 0; U.uAlpha.value = w; s.mesh.visible = w > 0.01 && !!this.frames[s.name]; U.uXf.value.set(1 + 0.15 * this.blushBig, 1 + 0.15 * this.blushBig, 0, 0); continue;
      }
      const v = U.uXf.value as THREE.Vector4;
      // smoothed toward the targets set by apply() (squash is already time-shaped by the EmotionDirector → keep it fast)
      v.x += (s.sx - v.x) * k; v.y += (s.sy - v.y) * k; v.z += (s.shx - v.z) * k; v.w += (s.shy - v.w) * k;
      U.uTilt.value += (s.tilt - U.uTilt.value) * k; U.uMirror.value = s.mirror ? 1 : 0;
    }
    this.updateExtras(dt);
  }

  private pt(anchor: string, out: THREE.Vector3) {
    const A = this.anchors;
    const f = anchor === 'eyeL' ? this.frames.eyeL : anchor === 'eyeR' ? this.frames.eyeR : anchor === 'browL' ? this.frames.browL : anchor === 'browR' ? this.frames.browR : null;
    if (f) return out.set(f.p[0] + f.n[0] * 0.03, f.p[1] + f.n[1] * 0.03, f.p[2] + f.n[2] * 0.03);
    return out.set(A.top[0], A.top[1], A.top[2]);
  }

  private tv = new THREE.Vector3();
  private updateExtras(dt: number) {
    const want = new Map<string, number>();
    for (const e of this.face.extras) {
      if (e === 'tear_streams') { want.set('tear', 1); want.set('tear_streams', 1); } else want.set(e, 1);
    }
    for (const [kind, list] of this.sprites) {
      const def = EXTRA_DEFS[kind]!;
      let w = this.weight.get(kind) ?? 0; w += ((want.get(kind) ?? 0) - w) * (1 - Math.exp(-dt * (want.get(kind) ? 12 : 8))); this.weight.set(kind, w);
      const on = w > 0.02;
      const origin = this.pt(def.anchor, this.tv);
      const phase = (this.clock / def.period) % 1;
      for (let i = 0; i < list.length; i++) {
        const r = list[i]; r.sprite.visible = on; if (!on) continue;
        def.sprite((phase + (def.count > 1 ? i / def.count : 0)) % 1, i, this.clock, w, this.tmp);
        const o = this.tmp;
        r.sprite.position.set(origin.x + o.x, origin.y + o.y, origin.z + o.z);
        r.sprite.scale.set(o.size * EXTRA_SCALE, o.size * EXTRA_SCALE, 1); r.mat.opacity = clamp(o.alpha); r.mat.rotation = o.rot;
      }
    }
  }

  /** Where a slot's decal sits (head-local) — for the lab. */
  frameOf(name: SlotName) { return this.frames[name]; }

  dispose() {
    this.head.remove(this.group);
    for (const s of Object.values(this.slots)) { s.mesh.geometry.dispose(); s.mat.dispose(); }
    for (const l of this.sprites.values()) for (const r of l) r.mat.dispose();
  }
}

/** One-call helper: load assets, extract triangles, build the rig. */
export async function createFaceRig(who: Who, mesh: THREE.SkinnedMesh, head: THREE.Bone, anchors?: FaceAnchors): Promise<FaceDecalRig> {
  const assets = await loadFaceAssets(who);
  return new FaceDecalRig(assets, head, extractHeadTris(mesh, head), anchors);
}

export { castRay };
