/**
 * Kith Racing track set pieces: jump ramps, gap chasms, tunnels, bridges, shortcuts, moving obstacles and item boxes.
 * Everything is built from the same course3d frames the physics uses, so what you see is what you hit.
 */
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
 courseShortcuts, courseMorphs, courseTwists, courseLength, KICK_LEN, KICK_HEIGHT, isGapAt, normT, obstacleState, rampHeightAt, shortcutFrame, trackFrame, worldPoint,
 type BridgeZone, type CourseDef, type Obstacle, type TunnelZone,
} from './course3d';
import type {ItemBox} from './race';
import type {FxSystem} from './fx3d';
import {buildRoadDressing, buildTunnelMountain, buildBridgeArcade} from './sanctuaryKit3d';

type Frame = ReturnType<typeof trackFrame>;
const basis = new T.Matrix4();
function orient(o: T.Object3D, f: Frame) { basis.makeBasis(f.right, f.normal, f.tangent); o.quaternion.setFromRotationMatrix(basis); }

function noiseTexture(base: string, dots: string[], size = 256, count = 2600, repeat = 1): T.CanvasTexture {
 const c = document.createElement('canvas'); c.width = c.height = size;
 const x = c.getContext('2d')!;
 x.fillStyle = base; x.fillRect(0, 0, size, size);
 for (let i = 0; i < count; i++) { x.fillStyle = dots[i % dots.length]; const s = 1 + Math.random() * 3; x.fillRect(Math.random() * size, Math.random() * size, s, s); }
 const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.repeat.set(repeat, repeat); t.anisotropy = 4;
 return t;
}

function glyphTexture(glyph: string, color: string): T.CanvasTexture {
 const c = document.createElement('canvas'); c.width = c.height = 128;
 const x = c.getContext('2d')!;
 x.font = '900 96px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
 x.shadowColor = color; x.shadowBlur = 18; x.fillStyle = '#ffffff'; x.fillText(glyph, 64, 70);
 const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

/** Generic ribbon between two lanes over a t-range; offsetFn lifts along the road normal. */
function ribbon(def: CourseDef, t0: number, t1: number, l1: number, l2: number, offsetFn: (t: number) => number, steps: number, material: T.Material, uvScale = 6): T.Mesh {
 const pos: number[] = [], uv: number[] = [], idx: number[] = [];
 for (let i = 0; i <= steps; i++) {
  const t = t0 + (t1 - t0) * (i / steps);
  for (const lane of [l1, l2]) { const p = worldPoint(t, lane, offsetFn(t), def.id); pos.push(p.x, p.y, p.z); uv.push(lane === l1 ? 0 : 1, (i / steps) * uvScale); }
  if (i < steps) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
 }
 const g = new T.BufferGeometry();
 g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
 g.setIndex(idx); g.computeVertexNormals();
 const m = new T.Mesh(g, material); m.receiveShadow = true; m.castShadow = true; return m;
}

/** Vertical wall following the road edge at `lane`, `h` metres tall. */
function wallRibbon(def: CourseDef, t0: number, t1: number, lane: number, h: number, steps: number, material: T.Material, base = 0): T.Mesh {
 const pos: number[] = [], uv: number[] = [], idx: number[] = [];
 for (let i = 0; i <= steps; i++) {
  const t = t0 + (t1 - t0) * (i / steps);
  for (const o of [base, base + h]) { const p = worldPoint(t, lane, o, def.id); pos.push(p.x, p.y, p.z); uv.push(i / steps * 8, o === base ? 0 : 1); }
  if (i < steps) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
 }
 const g = new T.BufferGeometry();
 g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
 g.setIndex(idx); g.computeVertexNormals();
 const m = new T.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; return m;
}

/** Tube that follows a world curve. */
function tubeAlong(points: T.Vector3[], radius: number, material: T.Material, segs = 48): T.Mesh {
 const curve = new T.CatmullRomCurve3(points, false, 'centripetal');
 const m = new T.Mesh(new T.TubeGeometry(curve, segs, radius, 6, false), material); m.castShadow = true; return m;
}

const TUNNEL_STYLES: Record<TunnelZone['style'], {shell: string; rough: number; glass: boolean; strip: string; portal: string}> = {
 rock: {shell: '#5b4f4a', rough: .92, glass: false, strip: '#ffb347', portal: '#8a7a6a'},
 glass: {shell: '#7fe8ff', rough: .08, glass: true, strip: '#00f0ff', portal: '#2ee6ff'},
 ice: {shell: '#bfe9ff', rough: .15, glass: true, strip: '#7ff7ff', portal: '#e6f9ff'},
 jungle: {shell: '#2f5a2a', rough: .85, glass: false, strip: '#c8ff5a', portal: '#5c4228'},
 lava: {shell: '#2a1e1c', rough: .9, glass: false, strip: '#ff5a1a', portal: '#3a2a26'},
};

const BRIDGE_STYLES: Record<BridgeZone['style'], {rail: string; struct: string; glow: string}> = {
 arch: {rail: '#efe3d2', struct: '#d9c6b0', glow: '#ffcf7a'},
 suspension: {rail: '#d7e8f2', struct: '#2a4f72', glow: '#00f0ff'},
 rope: {rail: '#7a5532', struct: '#5c4228', glow: '#d9ff7a'},
 ice: {rail: '#e6f9ff', struct: '#9fd8f5', glow: '#7ff7ff'},
 basalt: {rail: '#3a2a26', struct: '#22181a', glow: '#ff5a1a'},
};

export interface TrackFeatures {
 update(time: number, dt: number, boxes: ItemBox[] | undefined, fx?: FxSystem | null): void;
 dispose(): void;
}

export function buildTrackFeatures(scene: T.Scene, def: CourseDef): TrackFeatures {
 const root = new T.Group(); root.name = 'track-features'; scene.add(root);
 const disposables: {dispose(): void}[] = [];
 const std = (o: T.MeshStandardMaterialParameters) => { const m = new T.MeshStandardMaterial(o); disposables.push(m); return m; };
 const phys = (o: T.MeshPhysicalMaterialParameters) => { const m = new T.MeshPhysicalMaterial(o); disposables.push(m); return m; };
 const lavaWorld = def.id === 'ember-ridge';
 const gapIsWater = !lavaWorld && def.id !== 'dune-canyon';

 // ---------- ROAD BARRIERS (both edges, broken at gaps, tunnels supply their own walls) ----------
 const barrierMat = std({color: def.copingColor, roughness: .55, metalness: .2});
 const barrierGlow = std({color: def.stripeColor, emissive: def.stripeColor, emissiveIntensity: 1.4, roughness: .4});
 const spans: [number, number][] = [];
 {
  const N = 400; let start = -1;
  // morph zones get energy rails from circuit3d instead of stone (stone can't reshape)
  const blocked = (t: number) => isGapAt(t, def.id) || def.loops.some(l => Math.abs(t - l.centerT) < l.halfWidth + .006) || courseMorphs(def.id).some(z => t > z.startT - .002 && t < z.endT + .002);
  for (let i = 0; i <= N; i++) {
   const t = i / N, b = i === N || blocked(t);
   if (!b && start < 0) start = t;
   if (b && start >= 0) { spans.push([start, t]); start = -1; }
  }
 }
 // carved-stone balustrade with glowing ▲▼ inlays, lantern pillars and pennants (key-art kit)
 const dressing = buildRoadDressing(root, def, spans, disposables);
 void barrierGlow;

 // ---------- JUMP RAMPS + GAP CHASMS ----------
 const rampMat = std({color: '#f2e6d0', roughness: .5, metalness: .1});
 const chevronMat = std({color: def.stripeColor, emissive: def.stripeColor, emissiveIntensity: 1.6});
 const lipMat = std({color: '#2a2230', roughness: .6, metalness: .3});
 const liquidMats: T.Material[] = [];
 for (const j of def.jumps) {
  const t0 = j.t - j.rampLen;
  const ramp = ribbon(def, t0, j.t, -56, 56, t => rampHeightAt(t, def.id) + .03, 16, rampMat, 2);
  root.add(ramp);
  // ramp face at the lip and side cheeks
  const lipF = trackFrame(j.t, 0, def.id);
  const face = new T.Mesh(new T.BoxGeometry(20.3, j.height, .5), lipMat);
  face.position.copy(lipF.position).addScaledVector(lipF.normal, j.height / 2).addScaledVector(lipF.tangent, .25);
  orient(face, lipF); face.castShadow = true; root.add(face); disposables.push(face.geometry);
  // glowing chevrons on the ramp
  for (let k = 0; k < 4; k++) {
   const t = t0 + j.rampLen * (.15 + k * .22);
   const f = trackFrame(t, 0, def.id);
   for (const side of [-1, 1]) {
    const c = new T.Mesh(new T.BoxGeometry(4.2, .06, .5), chevronMat);
    c.position.copy(worldPoint(t, side * 14, rampHeightAt(t, def.id) + .08, def.id));
    orient(c, f); c.rotateY(side * .55); root.add(c); disposables.push(c.geometry);
   }
  }
  if (j.gap > 0) {
   // far-side landing lip + chasm floor of water / lava / sand
   const landF = trackFrame(j.t + j.gap, 0, def.id);
   const land = new T.Mesh(new T.BoxGeometry(23.5, 1.2, .8), lipMat);
   land.position.copy(landF.position).addScaledVector(landF.normal, -.62); orient(land, landF); root.add(land); disposables.push(land.geometry);
   const lipEdge = new T.Mesh(new T.BoxGeometry(23.5, 1.2, .8), lipMat);
   lipEdge.position.copy(lipF.position).addScaledVector(lipF.normal, -.62); orient(lipEdge, lipF); root.add(lipEdge); disposables.push(lipEdge.geometry);
   const mid = trackFrame(j.t + j.gap / 2, 0, def.id);
   const span = lipF.position.distanceTo(landF.position);
   const liquid = lavaWorld
    ? std({color: '#ff4a12', emissive: '#ff3a00', emissiveIntensity: 2.2, roughness: .6})
    : gapIsWater ? phys({color: def.id === 'polar-vortex' ? '#7fd8ff' : def.id === 'abyssal-trench' ? '#0a6aa8' : '#2fa8c8', roughness: .06, metalness: .1, transmission: 0, transparent: true, opacity: .86, clearcoat: 1, envMapIntensity: 1.6})
    : std({color: '#c97a3a', roughness: 1});
   liquidMats.push(liquid);
   const pool = new T.Mesh(new T.PlaneGeometry(64, span + 40, 24, 24), liquid);
   pool.rotation.x = -Math.PI / 2; pool.position.set(mid.position.x, mid.position.y - 11, mid.position.z);
   pool.rotation.z = Math.atan2(mid.tangent.x, mid.tangent.z); pool.receiveShadow = true;
   root.add(pool); disposables.push(pool.geometry);
   // chasm walls so the gap reads as a drop
   const chasmMat = std({color: lavaWorld ? '#2a1c1a' : def.deckColor, roughness: .95});
   for (const f of [lipF, landF]) {
    const wall = new T.Mesh(new T.BoxGeometry(26, 11, 1.2), chasmMat);
    wall.position.copy(f.position).addScaledVector(f.normal, -6.4);
    orient(wall, f); root.add(wall); disposables.push(wall.geometry);
   }
  }
  // overhead banner announcing the jump
  const bf = trackFrame(t0 - .004, 0, def.id);
  const banner = new T.Mesh(new T.PlaneGeometry(10, 1.4), new T.MeshBasicMaterial({map: glyphBanner(j.label + (j.gap > 0 ? ' ▲ JUMP' : ' ▲'), def.accent), transparent: true, side: T.DoubleSide}));
  banner.position.copy(bf.position).addScaledVector(bf.normal, 9.5); orient(banner, bf); banner.rotateY(Math.PI); root.add(banner);
  disposables.push(banner.geometry, banner.material as T.Material);
  for (const side of [-1, 1]) {
   const post = new T.Mesh(new T.CylinderGeometry(.22, .26, 9.6, 8), barrierMat);
   post.position.copy(worldPoint(t0 - .004, side * 66, 4.8, def.id)); orient(post, bf); root.add(post); disposables.push(post.geometry);
  }
 }

 // ---------- TWIST KICKERS: corkscrew run-up (the road itself rolls, see course3d twistRollAt) + kicker lip ----------
 {
  const L = courseLength(def.id), kick = KICK_LEN / L;
  const kickMat = std({color: '#f4ecdf', roughness: .45, metalness: .1});
  const twistGlow = std({color: def.stripeColor, emissive: def.stripeColor, emissiveIntensity: 1.05, roughness: .35});
  const warnMat = std({color: '#ffb347', emissive: '#ff8c00', emissiveIntensity: .9, roughness: .4});
  for (const z of courseTwists(def.id)) {
   const ramp = ribbon(def, z.t - kick, z.t, -56, 56, t => rampHeightAt(t, def.id) + .03, 10, kickMat, 2);
   root.add(ramp);
   const lipF = trackFrame(z.t, 0, def.id);
   const face = new T.Mesh(new T.BoxGeometry(20.3, KICK_HEIGHT, .5), lipMat);
   face.position.copy(lipF.position).addScaledVector(lipF.normal, KICK_HEIGHT / 2).addScaledVector(lipF.tangent, .25);
   orient(face, lipF); face.castShadow = true; root.add(face); disposables.push(face.geometry);
   // spiral of glowing chevrons winding along the run-up so the twist reads from far away
   const n = 14;
   for (let k = 0; k < n; k++) {
    const t = z.startT + (z.t - kick - z.startT) * (k / (n - 1));
    const f = trackFrame(t, 0, def.id);
    for (const side of [-1, 1]) {
     const c = new T.Mesh(new T.BoxGeometry(3.4, .06, .55), k % 2 ? twistGlow : warnMat);
     c.position.copy(worldPoint(t, side * 46, .07, def.id));
     orient(c, f); c.rotateY(side * z.dir * .6); root.add(c); disposables.push(c.geometry);
    }
   }
   // a ring gate at the start of the twist and a big kicker arrow on the lip
   const gateF = trackFrame(z.startT, 0, def.id);
   const gate = new T.Mesh(new T.TorusGeometry(13.2, .45, 10, 48, Math.PI), twistGlow);
   gate.position.copy(gateF.position); orient(gate, gateF); gate.rotateY(Math.PI / 2); gate.rotateX(Math.PI / 2);
   root.add(gate); disposables.push(gate.geometry);
   for (const side of [-1, 1]) {
    const a = new T.Mesh(new T.ConeGeometry(1.1, 2.2, 3), warnMat);
    const af = trackFrame(z.t - kick * .45, 0, def.id);
    a.position.copy(worldPoint(z.t - kick * .45, side * 22, rampHeightAt(z.t - kick * .45, def.id) + .4, def.id));
    orient(a, af); a.rotateX(Math.PI / 2); root.add(a); disposables.push(a.geometry);
   }
  }
 }

 // ---------- TUNNELS ----------
 for (const z of def.tunnels) {
  const st = TUNNEL_STYLES[z.style];
  const tex = st.glass ? null : noiseTexture(st.shell, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.08)', 'rgba(0,0,0,.4)'], 256, 4000, 1);
  if (tex) disposables.push(tex);
  const shellMat = st.glass
   ? phys({color: st.shell, roughness: st.rough, metalness: 0, transparent: true, opacity: z.style === 'ice' ? .42 : .22, clearcoat: 1, envMapIntensity: 2, side: T.DoubleSide, depthWrite: false})
   : std({color: '#ffffff', map: tex!, roughness: st.rough, metalness: .05, side: T.DoubleSide});
  const steps = Math.max(12, Math.round((z.endT - z.startT) * 700));
  const ring = 18, R = 13.2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
   const t = z.startT + (z.endT - z.startT) * i / steps;
   const f = trackFrame(t, 0, def.id);
   for (let k = 0; k <= ring; k++) {
    const a = Math.PI * k / ring;
    const p = f.position.clone().addScaledVector(f.right, Math.cos(a) * R).addScaledVector(f.normal, Math.sin(a) * R * .78 - .6);
    pos.push(p.x, p.y, p.z); uv.push(k / ring * 3, i / steps * (z.endT - z.startT) * 120);
   }
   if (i < steps) for (let k = 0; k < ring; k++) { const a = i * (ring + 1) + k, b = a + ring + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const shell = new T.Mesh(g, shellMat); shell.receiveShadow = !st.glass; shell.castShadow = !st.glass; root.add(shell); disposables.push(g);
  // ceiling light strips + ring lights
  const stripMat = std({color: st.strip, emissive: st.strip, emissiveIntensity: 2.4});
  for (const a of [Math.PI * .32, Math.PI * .68]) {
   const pts: T.Vector3[] = [];
   for (let i = 0; i <= 24; i++) { const t = z.startT + (z.endT - z.startT) * i / 24; const f = trackFrame(t, 0, def.id); pts.push(f.position.clone().addScaledVector(f.right, Math.cos(a) * (R - .3)).addScaledVector(f.normal, Math.sin(a) * (R - .3) * .78 - .6)); }
   const tube = tubeAlong(pts, .14, stripMat, 64); tube.castShadow = false; root.add(tube); disposables.push(tube.geometry);
  }
  const ringCount = Math.round((z.endT - z.startT) * 90);
  for (let i = 1; i < ringCount; i++) {
   const t = z.startT + (z.endT - z.startT) * i / ringCount;
   const f = trackFrame(t, 0, def.id);
   const tor = new T.Mesh(new T.TorusGeometry(R - .25, .1, 6, 28, Math.PI), stripMat);
   tor.position.copy(f.position).addScaledVector(f.normal, -.6); orient(tor, f); tor.scale.set(1, .78, 1); root.add(tor); disposables.push(tor.geometry);
  }
  // portals
  if (!st.glass) buildTunnelMountain(root, def, z, disposables);
  for (const t of [z.startT, z.endT]) {
   const f = trackFrame(t, 0, def.id);
   if (!st.glass) {
    const trim = new T.Mesh(new T.TorusGeometry(R + .75, .22, 6, 40, Math.PI), stripMat);
    trim.position.copy(f.position).addScaledVector(f.normal, -.6).addScaledVector(f.tangent, t === z.startT ? -2.05 : 2.05); orient(trim, f); trim.scale.set(1, .8, 1); root.add(trim); disposables.push(trim.geometry);
    continue;
   }
   const portal = new T.Mesh(new T.TorusGeometry(R + .9, 1.4, 10, 32, Math.PI), std({color: st.portal, roughness: .7, metalness: .15}));
   portal.position.copy(f.position).addScaledVector(f.normal, -.6); orient(portal, f); portal.scale.set(1, .8, 1); portal.castShadow = true; root.add(portal); disposables.push(portal.geometry);
   const trim = new T.Mesh(new T.TorusGeometry(R + .9, .3, 6, 32, Math.PI), stripMat);
   trim.position.copy(portal.position).addScaledVector(f.tangent, t === z.startT ? -1.5 : 1.5); orient(trim, f); trim.scale.set(1, .8, 1); root.add(trim); disposables.push(trim.geometry);
  }
 }

 // ---------- BRIDGES ----------
 for (const b of def.bridges) {
  const st = BRIDGE_STYLES[b.style];
  const railMat = std({color: st.rail, roughness: .5, metalness: b.style === 'suspension' ? .6 : .1});
  const structMat = std({color: st.struct, roughness: .7, metalness: b.style === 'suspension' ? .55 : .1});
  const glowMat = std({color: st.glow, emissive: st.glow, emissiveIntensity: 2});
  const steps = Math.max(12, Math.round((b.endT - b.startT) * 500));
  if (b.style === 'arch') { buildBridgeArcade(root, def, b.startT, b.endT, disposables); continue; }
  for (const side of [-1, 1]) {
   root.add(wallRibbon(def, b.startT, b.endT, side * 66.5, 1.5, steps, railMat));
   root.add(wallRibbon(def, b.startT, b.endT, side * 66.2, .12, steps, glowMat, 1.5));
  }
  const len = Math.round((b.endT - b.startT) * 120);
  // lamp posts
  for (let i = 0; i <= len; i++) {
   const t = b.startT + (b.endT - b.startT) * i / len;
   const f = trackFrame(t, 0, def.id);
   for (const side of [-1, 1]) {
    const post = new T.Mesh(new T.CylinderGeometry(.16, .2, 4.2, 8), structMat);
    post.position.copy(worldPoint(t, side * 67, 2.1, def.id)); orient(post, f); root.add(post); disposables.push(post.geometry);
    const lamp = new T.Mesh(new T.SphereGeometry(.38, 10, 8), glowMat);
    lamp.position.copy(worldPoint(t, side * 67, 4.4, def.id)); root.add(lamp); disposables.push(lamp.geometry);
   }
  }
  const f0 = trackFrame(b.startT, 0, def.id), f1 = trackFrame(b.endT, 0, def.id), fm = trackFrame((b.startT + b.endT) / 2, 0, def.id);
  if (b.style === 'suspension' || b.style === 'ice' || b.style === 'basalt') {
   // twin towers at each end + main cables + hangers
   const towerH = b.style === 'suspension' ? 22 : 14;
   for (const f of [f0, f1]) for (const side of [-1, 1]) {
    const geo = b.style === 'basalt' ? new T.CylinderGeometry(1.6, 2, towerH, 6) : new T.BoxGeometry(1.6, towerH, 1.6);
    const tower = new T.Mesh(geo, structMat);
    tower.position.copy(f.position).addScaledVector(f.right, side * 13.2).addScaledVector(f.normal, towerH / 2 - 1); orient(tower, f); tower.castShadow = true; root.add(tower); disposables.push(geo);
   }
   for (const side of [-1, 1]) {
    const pts: T.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
     const u = i / 20, t = b.startT + (b.endT - b.startT) * u, f = trackFrame(t, 0, def.id);
     const sag = towerH - 1.5 - Math.sin(Math.PI * u) * (towerH - 4);
     pts.push(f.position.clone().addScaledVector(f.right, side * 13.2).addScaledVector(f.normal, sag));
    }
    const cable = tubeAlong(pts, .18, b.style === 'basalt' ? glowMat : railMat, 60); root.add(cable); disposables.push(cable.geometry);
    for (let i = 2; i < 19; i += 2) {
     const top = pts[i], u = i / 20, t = b.startT + (b.endT - b.startT) * u;
     const base = worldPoint(t, side * 73, 0, def.id);
     const h = new T.Mesh(new T.CylinderGeometry(.05, .05, top.distanceTo(base), 4), railMat);
     h.position.copy(top).lerp(base, .5); h.lookAt(top); h.rotateX(Math.PI / 2); root.add(h); disposables.push(h.geometry);
    }
   }
  } else {
   // stone arches beneath the deck (arch / rope)
   const span = f0.position.distanceTo(f1.position);
   const archGeo = new T.TorusGeometry(span / 2, b.style === 'rope' ? .6 : 1.6, 10, 40, Math.PI);
   const arch = new T.Mesh(archGeo, structMat);
   arch.position.copy(fm.position).addScaledVector(fm.normal, -1.2);
   basis.makeBasis(fm.tangent, fm.normal.clone().negate(), fm.right.clone().negate()); arch.quaternion.setFromRotationMatrix(basis);
   arch.scale.set(1, .42, 1); arch.castShadow = true; root.add(arch); disposables.push(archGeo);
   if (b.style === 'rope') {
    for (const side of [-1, 1]) {
     const pts: T.Vector3[] = [];
     for (let i = 0; i <= 16; i++) { const t = b.startT + (b.endT - b.startT) * i / 16; pts.push(worldPoint(t, side * 68, 2.2 - Math.sin(Math.PI * i / 16) * .6, def.id)); }
     const rope = tubeAlong(pts, .1, structMat, 48); root.add(rope); disposables.push(rope.geometry);
    }
   }
  }
 }

 // ---------- SHORTCUTS ----------
 const dirtTex = noiseTexture(lavaWorld ? '#3a2620' : def.id === 'polar-vortex' ? '#c8dcea' : def.id === 'abyssal-trench' ? '#1e3a52' : '#8a5a34', ['rgba(0,0,0,.25)', 'rgba(255,240,220,.12)', 'rgba(60,30,10,.3)'], 256, 5000, 1);
 disposables.push(dirtTex);
 const dirtMat = std({map: dirtTex, roughness: 1, metalness: 0});
 const fenceMat = std({color: '#e8d6b4', roughness: .8});
 const signMat = new T.MeshBasicMaterial({map: glyphBanner('SHORTCUT ➜', '#ffd23a'), transparent: true, side: T.DoubleSide}); disposables.push(signMat);
 courseShortcuts(def.id).forEach((sc, si) => {
  const steps = 40, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
   const u = i / steps;
   for (const lane of [-24, 24]) { const p = shortcutFrame(def.id, si, u, lane).position; p.y -= .02; pos.push(p.x, p.y, p.z); uv.push(lane < 0 ? 0 : 1, u * sc.length / 8); }
   if (i < steps) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const dirt = new T.Mesh(g, dirtMat); dirt.receiveShadow = true; root.add(dirt); disposables.push(g);
  for (let i = 1; i < steps; i += 2) for (const side of [-1, 1]) {
   const f = shortcutFrame(def.id, si, i / steps, side * 25);
   const post = new T.Mesh(new T.BoxGeometry(.18, 1.1, .18), fenceMat); post.position.copy(f.position).addScaledVector(f.normal, .55); root.add(post); disposables.push(post.geometry);
  }
  const entry = trackFrame(sc.fromT - .012, 0, def.id);
  const sign = new T.Mesh(new T.PlaneGeometry(5, 1.2), signMat);
  sign.position.copy(worldPoint(sc.fromT - .012, sc.side * 70, 3.2, def.id)); orient(sign, entry); sign.rotateY(Math.PI); root.add(sign); disposables.push(sign.geometry);
 });

 // ---------- OBSTACLES ----------
 interface ObstacleView { o: Obstacle; obj: T.Object3D; parts: Record<string, T.Object3D>; frame: Frame; }
 const obstacleViews: ObstacleView[] = [];
 const stoneTex = noiseTexture(lavaWorld ? '#3a2a26' : def.id === 'polar-vortex' ? '#a8d4f0' : '#8a7f78', ['rgba(0,0,0,.3)', 'rgba(255,255,255,.1)'], 128, 1400, 1); disposables.push(stoneTex);
 const stoneMat = std({map: stoneTex, roughness: .9, metalness: .05, color: '#ffffff'});
 const eyeMat = std({color: def.accent, emissive: def.accent, emissiveIntensity: 3});
 const metalMat = std({color: '#5a5a66', roughness: .35, metalness: .85});
 const spikeMat = std({color: '#cfd2dc', roughness: .25, metalness: .9});
 const hotMat = new T.MeshBasicMaterial({color: '#ffb347', transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false}); disposables.push(hotMat);
 for (const o of def.obstacles) {
  const f = trackFrame(o.t, 0, def.id);
  const obj = new T.Group(); const parts: Record<string, T.Object3D> = {};
  if (o.kind === 'crusher') {
   const w = o.width * .18 + 1.2;
   const block = new T.Mesh(new RoundedBoxGeometry(w, 3.6, 4.2, 3, .3), stoneMat); block.castShadow = true;
   for (const ex of [-.24, .24]) { const eye = new T.Mesh(new T.BoxGeometry(w * .16, .4, .1), eyeMat); eye.position.set(ex * w, .5, -2.12); block.add(eye); }
   const brow = new T.Mesh(new T.BoxGeometry(w * .8, .3, .2), stoneMat); brow.position.set(0, 1.0, -2.15); brow.rotation.z = .08; block.add(brow);
   parts.block = block; obj.add(block);
   const shadow = new T.Mesh(new T.PlaneGeometry(w * 1.2, 4.6), new T.MeshBasicMaterial({color: '#000', transparent: true, opacity: .4, depthWrite: false}));
   shadow.rotation.x = -Math.PI / 2; shadow.position.y = .05; parts.shadow = shadow; obj.add(shadow);
  } else if (o.kind === 'pendulum') {
   const gantry = new T.Group();
   for (const side of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(.8, 14, .8), metalMat); post.position.set(side * 12.6, 7, 0); post.castShadow = true; gantry.add(post); }
   const beam = new T.Mesh(new T.BoxGeometry(26, .9, .9), metalMat); beam.position.y = 14; gantry.add(beam);
   obj.add(gantry);
   const arm = new T.Group(); arm.position.y = 13.6;
   const chain = new T.Mesh(new T.CylinderGeometry(.12, .12, 11.6, 6), metalMat); chain.position.y = -5.8; arm.add(chain);
   const ball = new T.Mesh(new T.IcosahedronGeometry(1.7, 1), def.id === 'crestfall-gardens' ? std({color: '#ff7a3a', emissive: '#ff5a1a', emissiveIntensity: 1.2, roughness: .4}) : spikeMat);
   ball.position.y = -12.2; ball.castShadow = true; arm.add(ball);
   for (let k = 0; k < 12; k++) { const sp = new T.Mesh(new T.ConeGeometry(.28, 1.1, 6), spikeMat); const d = new T.Vector3().setFromSphericalCoords(1, Math.acos(1 - 2 * (k + .5) / 12), k * 2.4); sp.position.copy(ball.position).addScaledVector(d, 1.8); sp.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d); arm.add(sp); }
   parts.arm = arm; obj.add(arm);
  } else if (o.kind === 'roller') {
   const ball = new T.Mesh(new T.DodecahedronGeometry(1.9, 1), stoneMat); ball.castShadow = true; parts.ball = ball; obj.add(ball);
   for (let k = 0; k < 5; k++) { const glow = new T.Mesh(new T.BoxGeometry(.14, .14, 3.9), lavaWorld ? eyeMat : stoneMat); glow.rotation.set(k, k * 1.3, 0); ball.add(glow); }
  } else if (o.kind === 'fire-jet') {
   const grate = new T.Mesh(new T.CylinderGeometry(o.width * .09, o.width * .09 + .2, .2, 16), metalMat); grate.position.y = .1; obj.add(grate);
   const ring = new T.Mesh(new T.TorusGeometry(o.width * .09, .12, 6, 24), eyeMat); ring.rotation.x = Math.PI / 2; ring.position.y = .22; obj.add(ring);
   const plume = new T.Mesh(new T.ConeGeometry(o.width * .085, 9, 14, 1, true), hotMat); plume.position.y = 4.5; plume.rotation.x = Math.PI; parts.plume = plume; obj.add(plume);
  } else {
   const slick = new T.Mesh(new T.CircleGeometry(o.width * .1, 24), phys({color: def.id === 'crestfall-gardens' ? '#ff9ad0' : '#1a1020', roughness: .05, clearcoat: 1, iridescence: 1, transparent: true, opacity: .85}));
   slick.rotation.x = -Math.PI / 2; slick.position.y = .04; obj.add(slick);
  }
  root.add(obj);
  obstacleViews.push({o, obj, parts, frame: f});
 }

 // ---------- ITEM BOXES ----------
 const boxGeo = new RoundedBoxGeometry(1.7, 1.7, 1.7, 3, .28); disposables.push(boxGeo);
 const boxMat = phys({color: '#ffffff', roughness: .05, metalness: .1, iridescence: 1, iridescenceIOR: 1.6, transparent: true, opacity: .72, clearcoat: 1, envMapIntensity: 2.2});
 const coreMat = new T.SpriteMaterial({map: glyphTexture('✦', def.accent), transparent: true, depthWrite: false}); disposables.push(coreMat);
 const boxViews: {obj: T.Group; t: number; lane: number; pop: number}[] = [];
 const boxBase = (t: number, lane: number) => { const f = trackFrame(t, lane, def.id); return {f, p: f.position.clone().addScaledVector(f.normal, 1.6)}; };

 function ensureBoxes(boxes: ItemBox[]) {
  while (boxViews.length < boxes.length) {
   const b = boxes[boxViews.length];
   const g = new T.Group();
   const m = new T.Mesh(boxGeo, boxMat); m.castShadow = true; g.add(m);
   const s = new T.Sprite(coreMat); s.scale.setScalar(1.15); g.add(s);
   const {p} = boxBase(b.t, b.lane); g.position.copy(p);
   root.add(g); boxViews.push({obj: g, t: b.t, lane: b.lane, pop: 1});
  }
 }

 return {
  update(time, dt, boxes, fx) {
   dressing.update(time);
   for (const v of obstacleViews) {
    const st = obstacleState(v.o, time);
    const f = trackFrame(v.o.t, st.lane, def.id);
    v.obj.position.copy(f.position); orient(v.obj, f);
    if (v.o.kind === 'crusher') {
     (v.parts.block as T.Mesh).position.y = 1.8 + st.amount * 7.5;
     const sh = v.parts.shadow as T.Mesh; (sh.material as T.MeshBasicMaterial).opacity = .55 - st.amount * .4;
     if (fx && st.amount === 0 && (time / v.o.period + v.o.phase) % 1 < .6 + dt / v.o.period) fx.emit('dust', f.position.clone().addScaledVector(f.normal, .3), f.normal.clone().multiplyScalar(4), 26, '#d8c8b0', 1.6);
    } else if (v.o.kind === 'pendulum') {
     const mid = trackFrame(v.o.t, v.o.lane, def.id);
     v.obj.position.copy(mid.position); orient(v.obj, mid);
     (v.parts.arm as T.Group).rotation.z = Math.asin(Math.max(-1, Math.min(1, (st.lane - v.o.lane) * .18 / 12.2)));
    } else if (v.o.kind === 'roller') {
     const b = v.parts.ball as T.Mesh; b.position.y = 1.9; b.rotation.z = -st.lane * .18 / 1.9;
    } else if (v.o.kind === 'fire-jet') {
     const plume = v.parts.plume as T.Mesh; plume.scale.set(1, Math.max(.02, st.amount), 1); plume.position.y = 4.5 * Math.max(.02, st.amount); plume.visible = st.amount > .02;
     if (fx && st.amount > .5) fx.emit('flame', f.position.clone().addScaledVector(f.normal, .4), f.normal.clone().multiplyScalar(14), 3, lavaWorld ? '#ff5a1a' : def.id === 'dune-canyon' ? '#ffcf8a' : '#ffa040', 2.4);
     else if (fx && st.amount > 0 && Math.random() < .3) fx.emit('smoke', f.position.clone().addScaledVector(f.normal, .4), f.normal.clone().multiplyScalar(3), 1);
    }
   }
   if (boxes) {
    ensureBoxes(boxes);
    boxes.forEach((b, i) => {
     const v = boxViews[i]; const live = b.respawn <= time;
     v.pop = live ? Math.min(1, v.pop + dt * 3) : 0;
     v.obj.visible = v.pop > .01;
     const s = v.pop < 1 ? v.pop * (1.25 - .25 * v.pop) : 1;
     v.obj.scale.setScalar(s);
     const {f, p} = boxBase(b.t, b.lane);
     v.obj.position.copy(p).addScaledVector(f.normal, Math.sin(time * 2.4 + i) * .22);
     const m = v.obj.children[0]; m.rotation.x = time * .9 + i; m.rotation.y = time * 1.3 + i * .7;
    });
   }
   for (const m of liquidMats) if ((m as T.MeshStandardMaterial).emissiveIntensity !== undefined && (m as T.MeshStandardMaterial).emissive?.getHex() === 0xff3a00) (m as T.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(time * 2.1) * .4;
  },
  dispose() {
   scene.remove(root);
   root.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); });
   disposables.forEach(d => d.dispose());
  },
 };
}

function glyphBanner(text: string, color: string): T.CanvasTexture {
 const c = document.createElement('canvas'); c.width = 512; c.height = 72;
 const x = c.getContext('2d')!;
 x.fillStyle = 'rgba(20,12,30,.88)'; x.fillRect(0, 0, 512, 72);
 x.fillStyle = color; x.fillRect(0, 0, 512, 6); x.fillRect(0, 66, 512, 6);
 x.fillStyle = '#fff6e8'; x.font = '900 38px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 38);
 const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

export {normT};
