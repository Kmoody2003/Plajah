// KaijuLetterPeekScene — the three.js half of <KaijuLetterPeek> (lazy chunk; never import this directly).
//
// Chora and Reello (the v2 rigged GLBs, public/models/mascots/v2) hide BEHIND the letters of a word in a page title
// ("CHORA") and peek over them. How it is put together:
//   • DOM: the host <div> sits in the same relative box as the <h1>. We find the word in the h1's text with a Range,
//     measure each letter's pen box, baseline and CAP TOP (canvas measureText: font ascent vs cap ascent), and lay a
//     transparent canvas over the title, extended upward for headroom.
//   • Occlusion: the canvas is ABOVE the h1, masked (CSS mask-image) by the word's own glyphs drawn into a 2D canvas.
//     So the kaiju are always behind "CHORA" but can overlap whatever is above it (a wrapped "PLAJAH" line, or empty
//     space when the title fits on one line). Each character's materials also get a world-space clipping plane just
//     under its letter's cap top, so nothing below that shows through the counters / open side of a C.
//   • 3D: an orthographic camera in CSS pixels, so a character is placed straight onto a letter.
//   • Face: the v2 heads have a blank mask; eyes / brows / mouth are decal quads from the sprite atlases
//     (public/models/mascots/v2/face). The mask is FOUND at load: every bind-pose vertex on the front of the head is
//     looked up in the skin texture; the pale, low-saturation ones are the mask. Decals are laid out on the mask's
//     bounds (fallback: the head's front bounds), pushed onto the surface along the local normal, parented to `head`.
//   • Behaviour: a tiny per-character director (down → peek → look around → duck), partner sync, music bop from the
//     analyser, hover → wave. prefers-reduced-motion: no bob / overshoot / tilt, slow eases, longer holds.

import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useKaijuSignal } from './kaijuSignal';
import { atlasUV, type AtlasInfo } from './stage3d/kaijuFaceDecals';

type Who = 'chora' | 'reello';
const MODEL_URL = (w: Who) => `/models/mascots/v2/${w}.glb`;
const FACE_URL = (w: Who, part: string, ext: 'png' | 'json') => `/models/mascots/v2/face/${w}_${part}.${ext}`;
const DRACO = '/draco/';

export interface KaijuLetterPeekSceneProps {
  /** The word in the title to hide behind (case-insensitive). */
  word: string;
  /** Letter index (within `word`) each character hides behind. */
  letters: Partial<Record<Who, number>>;
  /** Head width as a fraction of the letter's width. */
  headScale?: number;
}

// ---------------------------------------------------------------- layout (DOM measuring)
interface Slot { who: Who; x: number; capTop: number; clip: number; letterW: number; capH: number }
interface Glyph { ch: string; x: number; base: number; font: string }
interface Layout { w: number; h: number; top: number; left: number; slots: Slot[]; glyphs: Glyph[] }

function textNodes(el: Node): Text[] {
  const out: Text[] = []; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null; while ((n = tw.nextNode())) out.push(n as Text); return out;
}
function rangeFor(nodes: Text[], index: number): Range | null {
  let acc = 0;
  for (const t of nodes) {
    const len = t.data.length;
    if (index < acc + len) { const r = document.createRange(); r.setStart(t, index - acc); r.setEnd(t, index - acc + 1); return r; }
    acc += len;
  }
  return null;
}
const metricsCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

/** One letter of the title: its pen box, baseline, cap top and ink centre (viewport px). */
function letterBox(nodes: Text[], text: string, i: number, h1: HTMLElement) {
  const r = rangeFor(nodes, i); if (!r) return null;
  const rect = Array.from(r.getClientRects()).find(q => q.width > 0) ?? r.getBoundingClientRect();
  if (!rect.width) return null;
  const cs = getComputedStyle(r.startContainer.parentElement ?? h1);
  const upper = cs.textTransform === 'uppercase';
  const ch = upper ? text[i].toUpperCase() : text[i];
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  let base = rect.top + rect.height * 0.88, capH = rect.height * 0.7, inkCx = rect.left + rect.width / 2, k = 1;
  if (metricsCtx) {
    metricsCtx.font = font;
    const m = metricsCtx.measureText(ch);
    const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
    if (fa > 0 && fd >= 0) {
      k = rect.height / (fa + fd);                  // the inline box IS the font's content area
      base = rect.top + fa * k; capH = m.actualBoundingBoxAscent * k;
    }
    // the ink's centre, nudged toward the glyph's top edge for italics (that's where the head peeks over)
    const inkL = rect.left - m.actualBoundingBoxLeft * k, inkR = rect.left + m.actualBoundingBoxRight * k;
    inkCx = (inkL + inkR) / 2 + (cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique') ? capH * 0.1 : 0);
  }
  return { ch, rect, base, capH, capTop: base - capH, inkCx, font };
}

function measure(host: HTMLElement, h1: HTMLElement, word: string, letters: Partial<Record<Who, number>>, roomK: number): Layout | null {
  const nodes = textNodes(h1); const text = nodes.map(n => n.data).join('');
  const at = text.toLowerCase().lastIndexOf(word.toLowerCase()); if (at < 0) return null;
  const hostR = host.getBoundingClientRect();
  const boxes = Array.from({ length: word.length }, (_, j) => letterBox(nodes, text, at + j, h1));
  const slots: Slot[] = [];
  for (const [who, li] of Object.entries(letters) as [Who, number][]) {
    const b = boxes[li]; if (!b) continue;
    slots.push({ who, x: b.inkCx - hostR.left, capTop: b.capTop - hostR.top, clip: b.capTop - hostR.top + b.capH * 0.16, letterW: b.rect.width, capH: b.capH });
  }
  if (!slots.length) return null;
  const room = Math.max(...slots.map(s => s.capH)) * roomK;
  const top = Math.min(0, Math.min(...slots.map(s => s.capTop)) - room);
  const bottom = Math.max(...slots.map(s => s.clip)) + 4;
  // canvas spans the host's width (plus a little side room for waving arms), from `top` down to the lowest clip line
  const pad = Math.max(...slots.map(s => s.letterW)) * 0.6;
  const ox = hostR.left - pad, oy = hostR.top + top;   // canvas origin in viewport px
  return {
    w: Math.round(hostR.width + pad * 2), h: Math.round(bottom - top), top: Math.round(top), left: -Math.round(pad),
    slots: slots.map(s => ({ ...s, x: s.x + pad, capTop: s.capTop - top, clip: s.clip - top })),
    glyphs: boxes.filter(Boolean).map(b => ({ ch: b!.ch, x: b!.rect.left - ox, base: b!.base - oy, font: b!.font })),
  };
}

/** CSS mask for the canvas: opaque everywhere except the target word's glyphs, so the kaiju draw OVER the rest of the
 *  title (a line above the word, empty space) but always BEHIND the word's own letters. */
function glyphMask(L: Layout): string | null {
  try {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas'); c.width = Math.ceil(L.w * dpr); c.height = Math.ceil(L.h * dpr);
    const g = c.getContext('2d'); if (!g) return null;
    g.scale(dpr, dpr); g.fillStyle = '#000'; g.fillRect(0, 0, L.w, L.h);
    g.globalCompositeOperation = 'destination-out';
    g.lineJoin = 'round'; g.lineWidth = 1.5; g.textBaseline = 'alphabetic';
    for (const q of L.glyphs) { g.font = q.font; g.fillText(q.ch, q.x, q.base); g.strokeText(q.ch, q.x, q.base); }
    return c.toDataURL('image/png');
  } catch { return null; }
}

// ---------------------------------------------------------------- face analysis (pure, once per model)
interface Spot { pos: THREE.Vector3; q: THREE.Quaternion }   // head-bone local
interface FaceRig {
  head: THREE.Bone | null;
  headTop: number; headW: number; eyeY: number; mouthY: number; browY: number;   // model space (bind), metres
  eyeW: number; spots: { eyeL: Spot; eyeR: Spot; browL: Spot; browR: Spot; mouth: Spot };
  right: THREE.Vector3; up: THREE.Vector3;   // head-local face axes (for gaze nudges)
  yawAxis: THREE.Vector3; pitchAxis: THREE.Vector3;
  maskFound: boolean;
}

function pct(a: number[], p: number) { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; }

function analyzeFace(root: THREE.Object3D, mesh: THREE.SkinnedMesh, map: THREE.Texture | null): FaceRig {
  root.updateMatrixWorld(true);
  let head: THREE.Bone | null = null;
  root.traverse((o: any) => { if (o.isBone && o.name === 'head') head = o; });
  const headWorld = new THREE.Vector3(); if (head) (head as THREE.Bone).getWorldPosition(headWorld);

  // texture pixels for the mask test
  let px: Uint8ClampedArray | null = null; const PW = 512;
  const img: any = map?.image;
  if (img && (img.width || img.videoWidth)) {
    try {
      const c = document.createElement('canvas'); c.width = PW; c.height = PW;
      const g = c.getContext('2d', { willReadFrequently: true }); if (g) { g.drawImage(img, 0, 0, PW, PW); px = g.getImageData(0, 0, PW, PW).data; }
    } catch { px = null; }
  }
  const flipY = !!map?.flipY;

  const geo = mesh.geometry; const P = geo.attributes.position; const N = geo.attributes.normal; const UV = geo.attributes.uv;
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  const all: THREE.Vector3[] = new Array(P.count);
  for (let i = 0; i < P.count; i++) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); all[i] = v.clone(); if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y; }
  const H = maxY - minY;
  const headY = head ? headWorld.y : minY + H * 0.62;

  const headXs: number[] = [];
  const front: { p: THREE.Vector3; n: THREE.Vector3; white: boolean }[] = [];
  for (let i = 0; i < P.count; i++) {
    const p = all[i]; if (p.y < headY - H * 0.04) continue;
    headXs.push(p.x);
    n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    if (n.z < 0.45) continue;
    let white = false;
    if (px && UV) {
      let u = UV.getX(i), w = UV.getY(i); u -= Math.floor(u); w -= Math.floor(w); if (flipY) w = 1 - w;
      const k = (Math.min(PW - 1, Math.floor(w * PW)) * PW + Math.min(PW - 1, Math.floor(u * PW))) * 4;
      const r = px[k], g = px[k + 1], b = px[k + 2];
      // the mask is painted a pale, low-saturation grey-lavender (Chora ~180/190/215, Reello ~197/185/181)
      white = Math.min(r, g, b) > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 58;
    }
    front.push({ p, n: n.clone(), white });
  }
  const headTop = headXs.length ? maxY : headY + H * 0.3;
  const headW = headXs.length ? pct(headXs, 0.97) - pct(headXs, 0.03) : H * 0.4;

  // the mask: the near-white front vertices; keep the biggest, central blob (drop stray light patches)
  let mask = front.filter(f => f.white);
  if (mask.length > 40) {
    const cx = pct(mask.map(m => m.p.x), 0.5), cy = pct(mask.map(m => m.p.y), 0.5);
    const rad = headW * 0.45;
    mask = mask.filter(m => Math.hypot(m.p.x - cx, m.p.y - cy) < rad);
  }
  const maskFound = mask.length > 40;
  const src = maskFound ? mask : front;
  const xs = src.map(s => s.p.x), ys = src.map(s => s.p.y);
  const x0 = xs.length ? pct(xs, 0.05) : -headW / 2, x1 = xs.length ? pct(xs, 0.95) : headW / 2;
  const y0 = ys.length ? pct(ys, 0.05) : headY, y1 = ys.length ? pct(ys, 0.95) : headTop;
  const mw = x1 - x0, mh = y1 - y0, cx = (x0 + x1) / 2;
  const eyeY = y0 + mh * 0.58, browY = y0 + mh * 0.86, mouthY = y0 + mh * 0.2;
  const eyeDX = mw * 0.24;

  const headQ = new THREE.Quaternion(); if (head) (head as THREE.Bone).getWorldQuaternion(headQ);
  const headQi = headQ.clone().invert();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const spotAt = (x: number, y: number, lift: number): Spot => {
    // the surface point: average of the nearest front vertices (in x/y) — their z and normal
    const near = front.map(f => ({ f, d: (f.p.x - x) ** 2 + (f.p.y - y) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 12);
    const p = new THREE.Vector3(x, y, 0), nn = new THREE.Vector3();
    if (near.length) { let z = -Infinity; for (const k of near) { z = Math.max(z, k.f.p.z); nn.add(k.f.n); } p.z = z; nn.normalize(); }
    else { p.z = 0.3; nn.set(0, 0, 1); }
    nn.lerp(new THREE.Vector3(0, 0, 1), 0.35).normalize();   // flatter decals read better than steeply curved ones
    p.addScaledVector(nn, lift);
    const xa = new THREE.Vector3().crossVectors(worldUp, nn).normalize(); const ya = new THREE.Vector3().crossVectors(nn, xa).normalize();
    const qw = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, ya, nn));
    const local = head ? (head as THREE.Bone).worldToLocal(p.clone()) : p.clone();
    return { pos: local, q: headQi.clone().multiply(qw) };
  };
  const lift = H * 0.012;
  const spots = {
    eyeL: spotAt(cx + eyeDX, eyeY, lift), eyeR: spotAt(cx - eyeDX, eyeY, lift),
    browL: spotAt(cx + eyeDX * 1.05, browY, lift * 1.2), browR: spotAt(cx - eyeDX * 1.05, browY, lift * 1.2),
    mouth: spotAt(cx, mouthY, lift),
  };
  const toLocalDir = (d: THREE.Vector3) => d.clone().applyQuaternion(headQi).normalize();
  return {
    head, headTop, headW, eyeY, mouthY, browY, eyeW: mw * 0.34, spots,
    right: toLocalDir(new THREE.Vector3(1, 0, 0)), up: toLocalDir(new THREE.Vector3(0, 1, 0)),
    yawAxis: toLocalDir(new THREE.Vector3(0, 1, 0)), pitchAxis: toLocalDir(new THREE.Vector3(1, 0, 0)),
    maskFound,
  };
}

// ---------------------------------------------------------------- decals
interface Decal { mesh: THREE.Mesh; tex: THREE.Texture; atlas: AtlasInfo; base: THREE.Vector3; size: number; mirror: boolean; aspect: number }
function makeDecal(tex: THREE.Texture, atlas: AtlasInfo, spot: Spot, size: number, mirror: boolean, planes: THREE.Plane[], aspect = 1): Decal {
  const t = tex.clone(); t.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, clippingPlanes: planes, toneMapped: false, alphaTest: 0.02 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.position.copy(spot.pos); mesh.quaternion.copy(spot.q); mesh.renderOrder = 2; mesh.frustumCulled = false;
  return { mesh, tex: t, atlas, base: spot.pos.clone(), size, mirror, aspect };
}
function setCell(d: Decal, name: string, sy = 1) {
  const uv = atlasUV(d.atlas, name) ?? atlasUV(d.atlas, d.atlas.states[0].name);
  if (!uv) return;
  d.tex.offset.set(uv.offset[0], uv.offset[1]); d.tex.repeat.set(uv.repeat[0], uv.repeat[1]);
  d.mesh.scale.set(d.size * (d.mirror ? -1 : 1), d.size * d.aspect * sy, 1);
}

// ---------------------------------------------------------------- one character
const rand = (a: number, b: number) => a + Math.random() * (b - a);
interface Brain {
  lift: number; liftV: number; target: number; phase: 'down' | 'peek' | 'wave';
  tNext: number; yaw: number; yawT: number; tLook: number; pitch: number;
  gazeX: number; gazeY: number; blinkAt: number; blink: number; waveCd: number; mood: 'curious' | 'grumpy' | 'happy';
  sync?: () => void;
}
interface Shared { brains: Partial<Record<Who, Brain>>; pointer: { x: number; y: number; on: boolean }; energy: number; playing: boolean; reduced: boolean }

function Kaiju({ who, slot, layout, headScale, shared, firstPeek }: { who: Who; slot: Slot; layout: Layout; headScale: number; shared: React.MutableRefObject<Shared>; firstPeek: number }) {
  const gltf = useGLTF(MODEL_URL(who), DRACO);
  const texE = useLoader(THREE.TextureLoader, [FACE_URL(who, 'eyes_L', 'png'), FACE_URL(who, 'eyes_R', 'png'), FACE_URL(who, 'brows', 'png'), FACE_URL(who, 'mouths', 'png')]);
  const jsons = useLoader(THREE.FileLoader, [FACE_URL(who, 'eyes_L', 'json'), FACE_URL(who, 'eyes_R', 'json'), FACE_URL(who, 'brows', 'json'), FACE_URL(who, 'mouths', 'json')]);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const rig = useMemo(() => {
    // SkeletonUtils clone: the skin is skinned; never dispose the clone's geometry (shared with useGLTF's cache).
    const root = cloneSkinned(gltf.scene) as THREE.Object3D;
    let mesh: THREE.SkinnedMesh | null = null;
    root.traverse((o: any) => {
      if (o.isSkinnedMesh && !mesh) mesh = o;
      if (o.isMesh) {
        o.frustumCulled = false;
        const m = (o.material as THREE.MeshStandardMaterial).clone();   // own copy: the clipping plane is per character
        m.clippingPlanes = [plane]; m.side = THREE.FrontSide;
        o.material = m;
      }
    });
    if (!mesh) throw new Error('kaiju v2: no skinned mesh');
    const sk = mesh as THREE.SkinnedMesh;
    const face = analyzeFace(root, sk, (sk.material as THREE.MeshStandardMaterial).map);
    const atl = (jsons as string[]).map(s => JSON.parse(s) as AtlasInfo);
    [texE].flat().forEach(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
    const [tEL, tER, tB, tM] = texE as THREE.Texture[];
    const eyeCell = atl[0].states.find(s => s.name === 'open')?.size ?? [0.4, 0.46];
    const eyeQuad = face.eyeW / Math.max(0.2, eyeCell[0]);       // quad size so the open eye's ink is eyeW wide
    const browQuad = face.eyeW * 1.25 / Math.max(0.3, atl[2].states[0].size[0]);
    const mouthQuad = face.eyeW * 1.15;
    const planes = [plane];
    const decals = {
      eyeL: makeDecal(tEL, atl[0], face.spots.eyeL, eyeQuad, false, planes),
      eyeR: makeDecal(tER, atl[1], face.spots.eyeR, eyeQuad, false, planes),
      // the brow sheet draws the viewer-left brow (the character's right); the other one is mirrored
      browR: makeDecal(tB, atl[2], face.spots.browR, browQuad, false, planes),
      browL: makeDecal(tB, atl[2], face.spots.browL, browQuad, true, planes),
      mouth: makeDecal(tM, atl[3], face.spots.mouth, mouthQuad, false, planes),
    };
    const parent: THREE.Object3D = face.head ?? root;
    Object.values(decals).forEach(d => parent.add(d.mesh));
    const mixer = new THREE.AnimationMixer(root);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const c of gltf.animations) {
      const a = mixer.clipAction(c);
      if (['wave', 'cheer', 'nod_yes', 'almost'].includes(c.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[c.name] = a;
    }
    actions.idle?.play();
    return { root, face, decals, mixer, actions, cur: 'idle', headRest: face.head ? face.head.quaternion.clone() : new THREE.Quaternion() };
  }, [gltf, texE, jsons, plane]);

  useEffect(() => () => {
    rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.root);
    Object.values(rig.decals).forEach(d => { d.mesh.geometry.dispose(); (d.mesh.material as THREE.Material).dispose(); d.tex.dispose(); });
    rig.root.traverse((o: any) => { if (o.isMesh) (o.material as THREE.Material).dispose(); });
  }, [rig]);

  const brain = useRef<Brain>({
    lift: 0, liftV: 0, target: 0, phase: 'down', tNext: firstPeek, yaw: 0, yawT: 0, tLook: 0, pitch: 0,
    gazeX: 0, gazeY: 0, blinkAt: rand(1.5, 4), blink: 0, waveCd: 0, mood: 'curious',
  });
  useEffect(() => {
    const s = shared.current; s.brains[who] = brain.current;
    return () => { delete s.brains[who]; };
  }, [shared, who]);

  const group = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const yq = useMemo(() => new THREE.Quaternion(), []), pq = useMemo(() => new THREE.Quaternion(), []);

  const fade = (name: string, dur = 0.35, ts = 1) => {
    if (rig.cur === name || !rig.actions[name]) return;
    rig.actions[rig.cur]?.fadeOut(dur);
    rig.actions[name].reset().setEffectiveTimeScale(ts).setEffectiveWeight(1).fadeIn(dur).play();
    rig.cur = name;
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20); clock.current += dt; const t = clock.current;
    const S = shared.current; const b = brain.current; const f = rig.face; const R = S.reduced;
    const s = (slot.letterW * headScale) / f.headW;      // px per metre
    const partner = S.brains[who === 'chora' ? 'reello' : 'chora'];

    // ---- director
    const px = S.pointer;
    const headPxX = slot.x, headPxTop = slot.capTop - (b.lift > 0.2 ? (f.headTop - f.eyeY) * s : 0);
    const hovering = px.on && Math.abs(px.x - headPxX) < (f.headW * s) * 0.6 && px.y > headPxTop - 20 && px.y < slot.clip;
    b.waveCd -= dt;
    if (hovering && b.phase !== 'wave' && b.waveCd <= 0) {
      b.phase = 'wave'; b.target = 2; b.tNext = t + (R ? 3.2 : 2.4); b.waveCd = 5; b.mood = 'happy';
      if (rig.actions.wave) { rig.actions[rig.cur]?.fadeOut(0.2); rig.actions.wave.reset().setEffectiveTimeScale(R ? 0.6 : 1).setEffectiveWeight(1).fadeIn(0.2).play(); rig.cur = 'wave'; }
    }
    if (t > b.tNext) {
      if (b.phase === 'down') {
        b.phase = 'peek'; b.target = S.playing ? 1.35 : 1; b.mood = Math.random() < 0.3 ? 'grumpy' : 'curious';
        b.tNext = t + (R ? rand(5, 8) : rand(2.8, 5.5)); b.tLook = t + 0.6;
        // sometimes the other one can't resist and pops up too
        if (partner && partner.phase === 'down' && Math.random() < (S.playing ? 0.6 : 0.35)) partner.tNext = Math.min(partner.tNext, t + rand(0.15, 0.7));
      } else {
        b.phase = 'down'; b.target = 0; b.yawT = 0;
        b.tNext = t + (S.playing ? rand(0.8, 2.2) : R ? rand(4, 8) : rand(2, 6));
      }
    }
    if (b.phase === 'peek') b.target = S.playing ? 1.35 : 1;
    const show = import.meta.env?.DEV && (window as any).__kaijuPeekShow;   // dev: hold both up, unclipped
    if (show) { b.phase = 'peek'; b.target = show.lift ?? 2; b.tNext = t + 99; if (show.yaw != null) b.yawT = show.yaw; }
    // look around
    if (b.phase !== 'down' && t > b.tLook) {
      const opts = [-0.55, -0.25, 0, 0.25, 0.55];
      b.yawT = partner && partner.lift > 0.5 && Math.random() < 0.35 ? (who === 'chora' ? -0.5 : 0.5) : opts[Math.floor(Math.random() * opts.length)];
      b.tLook = t + (R ? rand(1.6, 2.8) : rand(0.7, 1.6));
    }
    if (b.phase === 'wave' || (px.on && b.lift > 0.5)) {
      // track the pointer with head + eyes
      const dx = (px.x - headPxX) / Math.max(80, slot.letterW * 3); b.yawT = THREE.MathUtils.clamp(-dx, -0.6, 0.6);
    }
    // the lift spring (overshoots a touch normally; critically damped when calm)
    const bob = !R && S.playing && b.phase !== 'down' ? S.energy * 0.45 : 0;
    const k = R ? 14 : 70, d = R ? 2 * Math.sqrt(14) : 12;
    b.liftV += ((b.target + bob) - b.lift) * k * dt - b.liftV * d * dt; b.lift += b.liftV * dt;
    if (b.lift < -0.2) { b.lift = -0.2; b.liftV = 0; }
    b.yaw += (b.yawT - b.yaw) * (1 - Math.exp(-dt * (R ? 2.5 : 6)));
    const nod = !R && S.playing ? S.energy * 0.22 : 0;
    b.pitch += ((b.lift > 1.6 ? -0.05 : 0.08) + nod - b.pitch) * (1 - Math.exp(-dt * 10));
    b.gazeX += (THREE.MathUtils.clamp(-b.yaw * 1.6, -1, 1) - b.gazeX) * (1 - Math.exp(-dt * 10));
    b.gazeY += ((b.lift < 1.2 ? 0.25 : 0) - b.gazeY) * (1 - Math.exp(-dt * 6));
    // blink
    if (t > b.blinkAt) { b.blink = 1; b.blinkAt = t + rand(2, 5) + (Math.random() < 0.2 ? -1.6 : 0); }
    b.blink = Math.max(0, b.blink - dt / 0.16);
    if (b.phase === 'wave' && t > b.tNext) { b.phase = 'peek'; b.tNext = t + rand(1.5, 3); b.mood = 'curious'; }

    // clips: idle normally, a bouncier loop when music plays
    if (rig.cur !== 'wave' || !rig.actions.wave?.isRunning()) fade(S.playing && !R ? 'excited' : b.phase === 'peek' ? 'listen' : 'idle', 0.4, R ? 0.6 : 1);
    if (rig.face.head) rig.face.head.quaternion.copy(rig.headRest);   // clips without a head track must not accumulate the turn
    rig.mixer.update(dt);

    // head turn on top of the clip
    const head = f.head;
    if (head) {
      yq.setFromAxisAngle(f.yawAxis, b.yaw * 0.7); pq.setFromAxisAngle(f.pitchAxis, b.pitch);
      head.quaternion.multiply(yq).multiply(pq);
    }

    // ---- place: lift 0 = head under the clip line; 1 = eyes clear of the cap top; 2 = mouth clear too
    const eyeHalf = f.eyeW * 0.6;
    const eyeAt = (lift: number) => {
      const hidden = slot.clip + 8 + (f.headTop - f.eyeY) * s;
      const peek = slot.capTop - eyeHalf * s - slot.capH * 0.1;
      const high = slot.capTop - (f.eyeY - f.mouthY + f.eyeW * 0.5) * s;
      return lift <= 1 ? THREE.MathUtils.lerp(hidden, peek, lift) : THREE.MathUtils.lerp(peek, high, lift - 1);
    };
    const eyePx = eyeAt(b.lift);
    const g = group.current;
    if (g) {
      g.scale.setScalar(s);
      g.position.set(slot.x - layout.w / 2 + b.yaw * slot.letterW * 0.06, layout.h / 2 - eyePx - f.eyeY * s, 0);
      g.rotation.z = R ? 0 : b.yaw * 0.12;
    }
    plane.constant = show && show.noclip ? 1e5 : slot.clip - layout.h / 2;   // keep world y above the clip line (y_clip = h/2 - clip)

    // ---- face
    const D = rig.decals;
    const happy = b.mood === 'happy' || (S.playing && S.energy > 0.55);
    const eyeState = happy ? 'happy' : b.mood === 'grumpy' ? 'half' : 'open';
    const open = eyeState === 'happy' ? 1 : 1 - 0.9 * Math.sin(Math.min(1, b.blink) * Math.PI);
    const shut = open < 0.25;
    const gx = f.right.clone().multiplyScalar(b.gazeX * f.eyeW * 0.12), gy = f.up.clone().multiplyScalar(b.gazeY * f.eyeW * 0.08);
    for (const e of [D.eyeL, D.eyeR]) {
      setCell(e, shut ? 'closed' : eyeState, shut ? 1 : open);
      e.mesh.position.copy(e.base).add(gx).add(gy);
    }
    const brow = happy ? 'raised' : b.mood === 'grumpy' ? 'angry' : b.phase === 'down' ? 'soft' : b.lift > 1.2 ? 'surprised' : 'soft';
    setCell(D.browL, brow); setCell(D.browR, brow);
    const lift = (happy ? -1 : b.mood === 'grumpy' ? 0.4 : 0) * f.eyeW * 0.08;
    D.browL.mesh.position.copy(D.browL.base).addScaledVector(f.up, -lift); D.browR.mesh.position.copy(D.browR.base).addScaledVector(f.up, -lift);
    setCell(D.mouth, happy ? 'smile_wide' : b.mood === 'grumpy' ? 'rest_frown' : b.lift > 1.2 ? 'viseme_O' : 'smile_small');
  });

  return <group ref={group}><primitive object={rig.root} /></group>;
}

// ---------------------------------------------------------------- scene shell
function readEnergy(an: AnalyserNode | null, buf: { a: Uint8Array | null }) {
  if (!an) return 0;
  if (!buf.a || buf.a.length !== an.frequencyBinCount) buf.a = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(buf.a as Uint8Array<ArrayBuffer>);
  let sum = 0; const n = Math.min(10, buf.a.length); for (let i = 1; i < n; i++) sum += buf.a[i];
  return sum / ((n - 1) * 255);
}

function SignalPump({ shared }: { shared: React.MutableRefObject<Shared> }) {
  const sig = useKaijuSignal();
  const buf = useRef<{ a: Uint8Array | null }>({ a: null }); const env = useRef(0);
  useFrame((_, dt) => {
    const S = shared.current; S.playing = sig.isPlaying;
    const e = sig.isPlaying ? readEnergy(sig.analyser, buf.current) : 0;
    // fast attack, slow release → a bop envelope
    env.current = e > env.current ? env.current + (e - env.current) * Math.min(1, dt * 30) : env.current + (e - env.current) * Math.min(1, dt * 5);
    S.energy = Math.max(0, Math.min(1, (env.current - 0.25) * 1.8));
  });
  return null;
}

export default function KaijuLetterPeekScene({ word, letters, headScale = 0.82 }: KaijuLetterPeekSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [visible, setVisible] = useState(true);
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const shared = useRef<Shared>({ brains: {}, pointer: { x: 0, y: 0, on: false }, energy: 0, playing: false, reduced });
  const lettersKey = JSON.stringify(letters);

  useLayoutEffect(() => {
    const el = host.current; const box = el?.parentElement; const h1 = box?.querySelector('h1');
    if (!el || !box || !h1) return;
    let tm = 0;
    const run = () => { window.clearTimeout(tm); tm = window.setTimeout(() => setLayout(measure(el, h1 as HTMLElement, word, JSON.parse(lettersKey), 1.15)), 30); };
    run();
    (document as any).fonts?.ready?.then(run).catch(() => {});
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null; ro?.observe(h1); ro?.observe(box);
    window.addEventListener('resize', run);
    // the canvas is UNDER the title, so pointer events land on the title: watch the whole box instead
    const move = (e: PointerEvent) => {
      const L = layoutRef.current; if (!L) return; const r = el.getBoundingClientRect();
      shared.current.pointer = { x: e.clientX - r.left - L.left, y: e.clientY - r.top - L.top, on: true };
    };
    const leave = () => { shared.current.pointer.on = false; };
    box.addEventListener('pointermove', move); box.addEventListener('pointerleave', leave);
    return () => { window.clearTimeout(tm); ro?.disconnect(); window.removeEventListener('resize', run); box.removeEventListener('pointermove', move); box.removeEventListener('pointerleave', leave); };
  }, [word, lettersKey]);
  const layoutRef = useRef<Layout | null>(null); layoutRef.current = layout;
  // no mask (2D canvas unavailable) → no kaiju: drawn unmasked they would sit IN FRONT of the letters
  const mask = useMemo(() => (layout ? glyphMask(layout) : null), [layout]);

  useEffect(() => {
    const el = host.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '80px' });
    io.observe(el); return () => io.disconnect();
  }, []);

  return (
    // above the h1 (z 2 vs its z 1): the glyph mask is what puts the kaiju "behind" the word's letters
    <div ref={host} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      {layout && mask && layout.w > 0 && layout.h > 0 && (
        <div style={{
          position: 'absolute', left: layout.left, top: layout.top, width: layout.w, height: layout.h,
          ...(mask ? { WebkitMaskImage: `url(${mask})`, maskImage: `url(${mask})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' } : {}),
        }}>
          <Canvas orthographic frameloop={visible ? 'always' : 'never'} dpr={[1, 2]}
            gl={{ alpha: true, antialias: true, localClippingEnabled: true, powerPreference: 'low-power' } as any}
            camera={{ zoom: 1, position: [0, 0, 2000], near: 1, far: 6000 }}
            style={{ pointerEvents: 'none' }}
            onCreated={({ gl }) => { gl.localClippingEnabled = true; }}>
            <hemisphereLight args={[0xf4eeff, 0x2a1530, 1.1]} />
            <directionalLight position={[-1.6, 2.4, 3]} intensity={2.2} color={0xfff4ec} />
            <directionalLight position={[1.8, 1.2, 1.2]} intensity={0.9} color={0xffa0d0} />
            <SignalPump shared={shared} />
            <Suspense fallback={null}>
              {layout.slots.map((s, i) => (
                <Kaiju key={s.who} who={s.who} slot={s} layout={layout} headScale={headScale} shared={shared} firstPeek={reduced ? 1.2 + i * 2.5 : 0.6 + i * 1.1} />
              ))}
            </Suspense>
          </Canvas>
        </div>
      )}
    </div>
  );
}

export function preloadKaijuPeek() {
  try { useGLTF.preload(MODEL_URL('chora'), DRACO); useGLTF.preload(MODEL_URL('reello'), DRACO); } catch { /* never break a page over a preload */ }
}
