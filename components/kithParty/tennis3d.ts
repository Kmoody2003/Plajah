/**
 * Kith Tennis renderer. Same art pipeline as Kith Racing: the course sky dome + PMREM environment, ACES tone mapping,
 * the sanctuary environment kit (laid out as an arena), Kith character models, the shared particle FX and PostFx
 * (bloom + grade). Each venue is one of the racing worlds, so a Crestfall match plays under the sakura cliffs and an
 * Ember Ridge match among the volcanoes.
 */
import * as T from 'three';
import {kithGltfLoader} from './kithGltf';
import {characterById, CHARACTERS} from './catalog';
import {makeCreature} from './creatures3d';
import {courseById, type CourseDef} from './course3d';
import {makeSkyDome, buildEnvironment, makeGlowTexture, makePuffTexture, makeContactShadowTexture, loadDriversGlb, disposeTree} from './circuit3d';
import {buildArenaKit, kitTheme, fbm} from './sanctuaryKit3d';
import {createFxSystem, createPostFx, type FxKind} from './fx3d';
import {kithKart} from './abilities';
import {COURT, TENNIS_INTRO, POINT_PAUSE, netHeight, venueById, halfWidth, pointLabels, pressureCall, serverIndex, tennisSpecialFor, type TennisState, type TennisPlayer, type Venue, type ShotKind} from './tennis';

export type TennisCam = 'broadcast' | 'player';

const SHOT_COLORS: Record<string, string> = {topspin: '#ff6a3d', slice: '#4fb6ff', lob: '#ffe14a', drop: '#c78bff', smash: '#ffffff', volley: '#9dff7a', serve: '#fff2c8', block: '#e8e8f0', dive: '#ffd0a0'};
const APRON = {x: 9.15, z: 18.3};
const smooth = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, srgb = true, repeat = false): T.CanvasTexture {
 const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
 const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
 if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
 return t;
}
function rng(seed: number) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------------------------------------------------------------- court surface
function courtTextures(v: Venue) {
 const W = 1024, H = 2048, px = W / (APRON.x * 2);
 const X = (x: number) => (x + APRON.x) * px, Z = (z: number) => (z + APRON.z) * px;
 const r = rng(v.id.length * 7 + 3);
 const paintLines = (x: CanvasRenderingContext2D, color: string, glow = false) => {
  x.fillStyle = color; x.strokeStyle = color;
  if (glow) { x.shadowColor = color; x.shadowBlur = 14; }
  const line = (x0: number, z0: number, x1: number, z1: number, w = .07) => { const wpx = Math.max(3, w * px); if (x0 === x1) x.fillRect(X(x0) - wpx / 2, Z(Math.min(z0, z1)), wpx, Math.abs(Z(z1) - Z(z0))); else x.fillRect(X(Math.min(x0, x1)), Z(z0) - wpx / 2, Math.abs(X(x1) - X(x0)), wpx); };
  const L = COURT.halfLength, D = COURT.doublesHalfWidth, S = COURT.singlesHalfWidth, SV = COURT.serviceLine;
  for (const sx of [-1, 1]) { line(sx * D, -L, sx * D, L); line(sx * S, -L, sx * S, L); }
  for (const sz of [-1, 1]) { line(-D - .035, sz * L, D + .035, sz * L, .1); line(-S, sz * SV, S, sz * SV); line(0, sz * L, 0, sz * (L - .15)); }
  line(0, -SV, 0, SV);
  x.shadowBlur = 0;
 };
 const map = canvasTex(W, H, x => {
  x.fillStyle = v.apron; x.fillRect(0, 0, W, H);
  const inner = () => { x.fillStyle = v.court; x.fillRect(X(-COURT.doublesHalfWidth), Z(-COURT.halfLength), X(COURT.doublesHalfWidth) - X(-COURT.doublesHalfWidth), Z(COURT.halfLength) - Z(-COURT.halfLength)); };
  switch (v.surface) {
   case 'grass': {
    for (let i = 0; i < 24; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; x.fillRect(0, i * H / 24, W, H / 24); }
    // worn baseline patches
    for (const sz of [-1, 1]) { const g = x.createRadialGradient(X(0), Z(sz * 12.3), 10, X(0), Z(sz * 12.3), 240); g.addColorStop(0, 'rgba(176,150,96,.75)'); g.addColorStop(1, 'rgba(176,150,96,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    for (let i = 0; i < 26000; i++) { x.fillStyle = r() > .5 ? 'rgba(220,255,180,.07)' : 'rgba(10,40,10,.1)'; x.fillRect(r() * W, r() * H, 1, 2 + r() * 3); }
    break;
   }
   case 'clay': {
    inner();
    for (let i = 0; i < 40000; i++) { x.fillStyle = r() > .5 ? 'rgba(255,220,190,.07)' : 'rgba(90,30,10,.09)'; x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    x.strokeStyle = 'rgba(120,40,20,.12)'; x.lineWidth = 3; // drag-mat sweeps
    for (let i = 0; i < 60; i++) { x.beginPath(); const cx = r() * W, cz = r() * H, rr = 80 + r() * 260; x.arc(cx, cz, rr, r() * 6, r() * 6 + 1); x.stroke(); }
    break;
   }
   case 'hard': {
    inner();
    for (let i = 0; i < 30000; i++) { x.fillStyle = r() > .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; x.fillRect(r() * W, r() * H, 1, 1); }
    break;
   }
   case 'ice': {
    inner();
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) { let cx = r() * W, cz = r() * H; x.beginPath(); x.moveTo(cx, cz); for (let k = 0; k < 6; k++) { cx += (r() - .5) * 90; cz += (r() - .5) * 90; x.lineTo(cx, cz); } x.stroke(); }
    for (let i = 0; i < 9000; i++) { x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(r() * W, r() * H, 1, 1); }
    break;
   }
   case 'neon': {
    inner();
    x.strokeStyle = 'rgba(0,240,255,.07)'; x.lineWidth = 2;
    const s = 46; for (let gz = 0; gz < H; gz += s * .866) for (let gx = (Math.round(gz / (s * .866)) % 2) * s / 2; gx < W; gx += s) { x.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; x[k ? 'lineTo' : 'moveTo'](gx + Math.cos(a) * s / 2, gz + Math.sin(a) * s / 2); } x.stroke(); }
    break;
   }
   case 'basalt': {
    inner();
    for (let i = 0; i < 26000; i++) { x.fillStyle = r() > .5 ? 'rgba(255,200,160,.04)' : 'rgba(0,0,0,.14)'; x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    // columnar joints
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2;
    const s = 70; for (let gz = 0; gz < H; gz += s * .866) for (let gx = (Math.round(gz / (s * .866)) % 2) * s / 2; gx < W; gx += s) { x.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; x[k ? 'lineTo' : 'moveTo'](gx + Math.cos(a) * s / 2, gz + Math.sin(a) * s / 2); } x.stroke(); }
    break;
   }
  }
  if (v.surface !== 'neon') paintLines(x, v.lines);
  else paintLines(x, 'rgba(180,250,255,.9)');
 });
 let emissive: T.CanvasTexture | null = null;
 if (v.surface === 'neon' || v.surface === 'basalt') {
  emissive = canvasTex(W, H, x => {
   x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
   if (v.surface === 'neon') { paintLines(x, v.lines, true); x.globalAlpha = .5; paintLines(x, '#ff2e93'); x.globalAlpha = 1; }
   else {
    x.strokeStyle = '#ff5a10'; x.shadowColor = '#ff7a1a'; x.shadowBlur = 10; x.lineWidth = 2.4;
    for (let i = 0; i < 22; i++) { let cx = r() < .5 ? r() * X(-6) : X(6) + r() * (W - X(6)), cz = r() * H; x.beginPath(); x.moveTo(cx, cz); for (let k = 0; k < 7; k++) { cx += (r() - .5) * 60; cz += (r() - .5) * 90; x.lineTo(cx, cz); } x.stroke(); }
    x.shadowBlur = 0; paintLines(x, '#5a2a00');
   }
  });
 }
 return {map, emissive};
}

function courtMaterial(v: Venue, maps: ReturnType<typeof courtTextures>): T.Material {
 switch (v.surface) {
  case 'ice': return new T.MeshPhysicalMaterial({map: maps.map, roughness: .1, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.5});
  case 'hard': return new T.MeshPhysicalMaterial({map: maps.map, roughness: .62, clearcoat: .35, clearcoatRoughness: .4});
  case 'neon': return new T.MeshPhysicalMaterial({map: maps.map, emissiveMap: maps.emissive, emissive: '#ffffff', emissiveIntensity: 1.5, roughness: .4, clearcoat: .6});
  case 'basalt': return new T.MeshStandardMaterial({map: maps.map, emissiveMap: maps.emissive, emissive: '#ffffff', emissiveIntensity: 1.3, roughness: .82});
  default: return new T.MeshStandardMaterial({map: maps.map, roughness: v.surface === 'clay' ? 1 : .93});
 }
}

// ---------------------------------------------------------------- props
function netTexture() {
 return canvasTex(256, 64, x => {
  x.clearRect(0, 0, 256, 64);
  x.strokeStyle = 'rgba(20,20,26,.95)'; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); }
  for (let j = 0; j <= 64; j += 8) { x.beginPath(); x.moveTo(0, j); x.lineTo(256, j); x.stroke(); }
 }, true, true);
}
function stringTexture() {
 return canvasTex(64, 64, x => {
  x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(250,250,240,.9)'; x.lineWidth = 1.4;
  for (let i = 4; i < 64; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
 });
}
function ballTexture() {
 return canvasTex(256, 128, x => {
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#f4ff6a'); g.addColorStop(1, '#d6f03a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 3000; i++) { x.fillStyle = Math.random() > .5 ? 'rgba(255,255,220,.25)' : 'rgba(120,140,20,.18)'; x.fillRect(Math.random() * 256, Math.random() * 128, 1, 1); }
  x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.beginPath();
  for (let i = 0; i <= 256; i++) { const y = 64 + Math.sin(i / 256 * Math.PI * 4) * 34; i ? x.lineTo(i, y) : x.moveTo(i, y); }
  x.stroke();
 });
}
function boardTexture(text: string, a: string, b: string) {
 return canvasTex(2048, 96, x => {
  x.fillStyle = a; x.fillRect(0, 0, 2048, 96);
  x.fillStyle = b; x.fillRect(0, 0, 2048, 8); x.fillRect(0, 88, 2048, 8);
  x.font = '900 52px Arial, sans-serif'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
  let px = 20; let k = 0;
  while (px < 2048) { x.fillStyle = k % 2 ? b : '#ffffff'; x.fillText(text, px, 50); px += x.measureText(text).width + 60; x.fillStyle = b; x.fillText('✳', px - 46, 50); k++; }
 }, true, true);
}

function makeRacket(colorFrame: string, colorGrip: string, strings: T.Texture): T.Group {
 const g = new T.Group(); g.name = 'racket';
 const frameMat = new T.MeshPhysicalMaterial({color: colorFrame, roughness: .25, metalness: .35, clearcoat: .8, emissive: colorFrame, emissiveIntensity: .12});
 const grip = new T.Mesh(new T.CylinderGeometry(.022, .026, .26, 10), new T.MeshStandardMaterial({color: colorGrip, roughness: .7}));
 grip.position.y = .13; g.add(grip);
 const throatL = new T.Mesh(new T.CylinderGeometry(.01, .012, .17, 6), frameMat); throatL.position.set(-.04, .32, 0); throatL.rotation.z = .3; g.add(throatL);
 const throatR = throatL.clone(); throatR.position.x = .04; throatR.rotation.z = -.3; g.add(throatR);
 const head = new T.Mesh(new T.TorusGeometry(.13, .013, 8, 28), frameMat); head.scale.set(1, 1.28, 1); head.position.y = .55; g.add(head);
 const str = new T.Mesh(new T.CircleGeometry(.125, 24), new T.MeshBasicMaterial({map: strings, transparent: true, side: T.DoubleSide, depthWrite: false}));
 str.scale.set(1, 1.28, 1); str.position.y = .55; g.add(str);
 g.traverse(o => { if (o instanceof T.Mesh) o.castShadow = true; });
 return g;
}

function spectatorGeometry(): T.BufferGeometry {
 const parts: T.BufferGeometry[] = [];
 const body = new T.SphereGeometry(.28, 8, 6); body.scale(1, 1.15, .9); body.translate(0, .32, 0); parts.push(body);
 const head = new T.SphereGeometry(.24, 9, 7); head.translate(0, .78, .02); parts.push(head);
 for (const s of [-1, 1]) { const fin = new T.ConeGeometry(.08, .3, 4); fin.translate(s * .15, 1.04, 0); fin.rotateZ(-s * .3); parts.push(fin); const arm = new T.CapsuleGeometry(.06, .26, 3, 5); arm.translate(s * .3, .5, .06); parts.push(arm); }
 const clean = parts.map(p => { const n = p.index ? p.toNonIndexed() : p; n.deleteAttribute('uv'); return n; });
 const merged = new T.BufferGeometry();
 const total = clean.reduce((a, p) => a + p.getAttribute('position').count, 0);
 const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
 let o = 0; for (const p of clean) { pos.set(p.getAttribute('position').array as Float32Array, o * 3); nor.set(p.getAttribute('normal').array as Float32Array, o * 3); o += p.getAttribute('position').count; p.dispose(); }
 merged.setAttribute('position', new T.BufferAttribute(pos, 3)); merged.setAttribute('normal', new T.BufferAttribute(nor, 3));
 return merged;
}

// ---------------------------------------------------------------- player rig
interface Rig {
 root: T.Group; body: T.Group; model: T.Object3D; pivot: T.Group; racket: T.Group;
 shadow: T.Mesh; aura: T.Sprite; ring: T.Mesh; marker: T.Mesh | null; ice: T.Mesh; stars: T.Group;
 mixer: T.AnimationMixer | null; actions: Record<string, T.AnimationAction>; current: string;
 height: number; prevAnim: string; trailCol: string;
}

function playAction(rig: Rig, name: string, fade = .18) {
 if (!rig.mixer || rig.current === name) return;
 const next = rig.actions[name] || rig.actions.idle;
 if (!next) return;
 const prev = rig.actions[rig.current];
 next.reset().setEffectiveWeight(1).fadeIn(fade).play();
 if (prev && prev !== next) prev.fadeOut(fade);
 rig.current = name;
}

// ---------------------------------------------------------------- main
export function createTennis3D(canvas: HTMLCanvasElement, initial: TennisState) {
 const venue = venueById(initial.venue);
 const course: CourseDef = courseById(venue.id);
 const theme = kitTheme(venue.id);
 const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); renderer.setSize(960, 560, false);
 renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
 canvas.dataset.renderer = 'three-webgl'; canvas.dataset.venue = venue.id;
 const scene = new T.Scene();
 scene.fog = new T.FogExp2(course.fogColor, course.fogDensity * .85);
 scene.add(makeSkyDome(course));
 const envRT = buildEnvironment(renderer, course);
 scene.environment = envRT.texture; scene.environmentIntensity = .72;
 const disposables: {dispose(): void}[] = [envRT];
 const own = <X extends {dispose(): void}>(x: X) => { disposables.push(x); return x; };

 // sky dressing (same recipe as the race): sun glow, horizon streak, clouds, air motes
 const glowTex = own(makeGlowTexture());
 const sunGlow = new T.Sprite(new T.SpriteMaterial({map: glowTex, color: venue.id === 'abyssal-trench' ? '#3df5ff' : '#ffdf9e', transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false, fog: false}));
 sunGlow.position.set(-30, 68, -60).normalize().multiplyScalar(420); sunGlow.scale.setScalar(185); scene.add(sunGlow);
 const streak = new T.Sprite(new T.SpriteMaterial({map: glowTex, color: '#fff0cc', transparent: true, opacity: .22, blending: T.AdditiveBlending, depthWrite: false, fog: false}));
 streak.position.copy(sunGlow.position); streak.scale.set(340, 26, 1); scene.add(streak);
 const puffTex = own(makePuffTexture());
 const clouds: {s: T.Sprite; speed: number}[] = [];
 for (let i = 0; i < 14; i++) {
  const sp = new T.Sprite(new T.SpriteMaterial({map: puffTex, transparent: true, opacity: .46 + Math.random() * .3, depthWrite: false, fog: false, color: venue.id === 'abyssal-trench' ? '#2088b8' : '#fff7fb'}));
  const a = Math.random() * Math.PI * 2, rr = 200 + Math.random() * 140; sp.position.set(Math.cos(a) * rr, 56 + Math.random() * 46, Math.sin(a) * rr);
  const sc = 50 + Math.random() * 56; sp.scale.set(sc, sc * .52, 1); scene.add(sp); clouds.push({s: sp, speed: .5 + Math.random() * 1.3});
 }
 const moteGeo = new T.BufferGeometry(); const mp = new Float32Array(140 * 3);
 for (let i = 0; i < 140; i++) { mp[i * 3] = (Math.random() - .5) * 90; mp[i * 3 + 1] = 1 + Math.random() * 18; mp[i * 3 + 2] = (Math.random() - .5) * 110; }
 moteGeo.setAttribute('position', new T.BufferAttribute(mp, 3));
 const motes = new T.Points(moteGeo, new T.PointsMaterial({map: glowTex, color: course.accent, size: .5, transparent: true, opacity: .6, blending: T.AdditiveBlending, depthWrite: false})); scene.add(motes);

 const hemi = new T.HemisphereLight('#f6f8ff', '#7a5d7e', 1.4); scene.add(hemi);
 const sun = new T.DirectionalLight('#ffebd2', 3.1);
 sun.position.set(-26, 46, -18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
 Object.assign(sun.shadow.camera, {left: -34, right: 34, top: 40, bottom: -40, near: 1, far: 140});
 sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; scene.add(sun); scene.add(sun.target);
 const fill = new T.DirectionalLight(course.accent, 1.1); fill.position.set(40, 26, 50); scene.add(fill);

 // ---- terrain: flat grounds around the stadium, rolling valley beyond
 const heightAt = (x: number, z: number) => {
  const q = Math.max(0, Math.max(Math.abs(x) - 38, Math.abs(z) - 48));
  const n = fbm(x * .012, 0, z * .012, 3);
  return smooth(q / 70) * (4 + 10 * (n * .5 + .5)) + smooth((q - 140) / 120) * 18 - .05;
 };
 {
  const g = new T.PlaneGeometry(960, 960, 150, 150); g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as T.BufferAttribute, cols = new Float32Array(pos.count * 3);
  const ca = new T.Color(theme.grass[0]), cb = new T.Color(theme.grass[1]), c = new T.Color();
  for (let i = 0; i < pos.count; i++) {
   const x = pos.getX(i), z = pos.getZ(i);
   pos.setY(i, heightAt(x, z) - .02);
   c.copy(ca).lerp(cb, fbm(x * .03, 1, z * .03, 3) * .5 + .5).multiplyScalar(.82);
   cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new T.BufferAttribute(cols, 3)); g.computeVertexNormals();
  const ground = new T.Mesh(own(g), own(new T.MeshStandardMaterial({vertexColors: true, roughness: .95})));
  ground.receiveShadow = true; scene.add(ground);
 }
 const kit = buildArenaKit(scene, venue.id, heightAt, {rail: {x: 23, z: 33}, clear: {x: 30, z: 42}, backdrop: -1, seed: venue.id.length});
 disposables.push(kit);
 canvas.dataset.kit = JSON.stringify(kit.stats);
 // Ember Ridge has no cliff kit: give it volcanoes
 if (venue.id === 'ember-ridge') {
  const lava = own(new T.MeshStandardMaterial({color: '#ff6a1a', emissive: '#ff4a0a', emissiveIntensity: 2.4}));
  const rock = own(new T.MeshStandardMaterial({color: '#2a2024', roughness: .95, flatShading: true}));
  for (let i = 0; i < 7; i++) {
   const a = -Math.PI / 2 + (i - 3) * .42, rr = 150 + (i % 3) * 60, h = 60 + (i % 2) * 50, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
   const cone = new T.Mesh(own(new T.ConeGeometry(h * .9, h, 9, 4, true)), rock); cone.position.set(x, heightAt(x, z) + h / 2 - 4, z); scene.add(cone);
   const crater = new T.Mesh(own(new T.CircleGeometry(h * .16, 12)), lava); crater.rotation.x = -Math.PI / 2; crater.position.set(x, heightAt(x, z) + h * .84 - 4, z); scene.add(crater);
  }
 }

 // ---- stadium floor, court, net
 const stone = new T.Color(theme.stone), stoneDark = new T.Color(theme.stoneDark);
 const plazaTex = own(canvasTex(512, 512, x => {
  x.fillStyle = '#' + stone.clone().lerp(stoneDark, .7).multiplyScalar(.7).getHexString(); x.fillRect(0, 0, 512, 512);
  const r = rng(5);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) { const v = .85 + r() * .25; x.fillStyle = '#' + stone.clone().lerp(stoneDark, .5).multiplyScalar(v * .78).getHexString(); x.fillRect(col * 64 + 2, row * 64 + 2, 60, 60); }
 }, true, true));
 plazaTex.repeat.set(12, 16);
 const plaza = new T.Mesh(own(new T.PlaneGeometry(46, 66)), own(new T.MeshStandardMaterial({map: plazaTex, roughness: .78})));
 plaza.rotation.x = -Math.PI / 2; plaza.position.y = -.01; plaza.receiveShadow = true; scene.add(plaza);
 const cmaps = courtTextures(venue); own(cmaps.map); if (cmaps.emissive) own(cmaps.emissive);
 const courtMat = own(courtMaterial(venue, cmaps));
 const court = new T.Mesh(own(new T.PlaneGeometry(APRON.x * 2, APRON.z * 2)), courtMat);
 court.rotation.x = -Math.PI / 2; court.receiveShadow = true; scene.add(court);
 // net
 const netTex = own(netTexture()); netTex.repeat.set(12.8 / 1.6, 1);
 const netGeo = own(new T.PlaneGeometry(COURT.netPostX * 2, 1, 32, 6));
 const netBase = (netGeo.getAttribute('position') as T.BufferAttribute).array.slice() as Float32Array;
 {
  const pos = netGeo.getAttribute('position') as T.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const x = netBase[i * 3], yy = netBase[i * 3 + 1] + .5; pos.setY(i, yy * netHeight(x)); }
  for (let i = 0; i < pos.count; i++) netBase[i * 3 + 1] = pos.getY(i);
 }
 const net = new T.Mesh(netGeo, own(new T.MeshStandardMaterial({map: netTex, transparent: true, alphaTest: .35, side: T.DoubleSide, roughness: .8})));
 net.castShadow = true; scene.add(net);
 const tapeGeo = own(new T.BufferGeometry());
 {
  const pts: number[] = [];
  for (let i = 0; i <= 32; i++) { const x = -COURT.netPostX + i / 32 * COURT.netPostX * 2; pts.push(x, netHeight(x) + .02, 0); }
  const curve = new T.CatmullRomCurve3(Array.from({length: 33}, (_, i) => new T.Vector3(pts[i * 3], pts[i * 3 + 1], 0)));
  tapeGeo.copy(new T.TubeGeometry(curve, 64, .035, 6, false));
 }
 const tape = new T.Mesh(tapeGeo, own(new T.MeshStandardMaterial({color: '#ffffff', roughness: .6})));
 tape.castShadow = true; scene.add(tape);
 const postMat = own(new T.MeshStandardMaterial({color: theme.trim, metalness: .8, roughness: .3}));
 for (const sx of [-1, 1]) { const post = new T.Mesh(own(new T.CylinderGeometry(.05, .06, 1.12, 12)), postMat); post.position.set(sx * (COURT.netPostX + .03), .56, 0); post.castShadow = true; scene.add(post); const cap = new T.Mesh(own(new T.SphereGeometry(.075, 12, 8)), postMat); cap.position.set(sx * (COURT.netPostX + .03), 1.13, 0); scene.add(cap); }
 const strap = new T.Mesh(own(new T.BoxGeometry(.05, .914, .012)), own(new T.MeshStandardMaterial({color: '#ffffff'}))); strap.position.set(0, .457, 0); scene.add(strap);
 let netShake = 0, netShakeX = 0;

 // ---- signage boards around the apron
 const boardTex = own(boardTexture(`KITH TENNIS OPEN · ${venue.name.toUpperCase()}`, theme.clothDark, theme.trim));
 const boardMat = own(new T.MeshStandardMaterial({map: boardTex, roughness: .6, emissive: '#ffffff', emissiveMap: boardTex, emissiveIntensity: .25}));
 const boardBack = own(new T.MeshStandardMaterial({color: theme.clothDark, roughness: .8}));
 const board = (len: number, x: number, z: number, yaw: number) => {
  const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
  const t = boardTex.clone(); t.needsUpdate = true; t.repeat.set(len / 16, 1); own(t);
  const m = boardMat.clone(); m.map = t; m.emissiveMap = t; own(m);
  const face = new T.Mesh(own(new T.PlaneGeometry(len, .9)), m); face.position.set(0, .45, .051); g.add(face);
  const box = new T.Mesh(own(new T.BoxGeometry(len, .9, .1)), boardBack); box.position.y = .45; box.castShadow = true; box.receiveShadow = true; g.add(box);
  scene.add(g);
 };
 board(18, 0, -APRON.z + .05, 0); board(18, 0, APRON.z - .05, Math.PI);
 board(30, -APRON.x + .05, 0, Math.PI / 2); board(30, APRON.x - .05, 0, -Math.PI / 2);

 // ---- stands + crowd
 const seatMat = own(new T.MeshStandardMaterial({color: new T.Color(theme.stone).lerp(new T.Color(theme.stoneDark), .45), roughness: .8}));
 const cushionMat = own(new T.MeshStandardMaterial({color: theme.cloth, roughness: .7}));
 const crowdSeats: {x: number; y: number; z: number; yaw: number; phase: number; amp: number}[] = [];
 const r0 = rng(venue.id.length * 13 + 1);
 const stand = (axis: 'x' | 'z', sign: number, start: number, len: number, rows: number) => {
  for (let i = 0; i < rows; i++) {
   const d = start + i * .95, h = .5 + i * .52;
   const g = new T.Mesh(own(axis === 'x' ? new T.BoxGeometry(.95, h, len) : new T.BoxGeometry(len, h, .95)), seatMat);
   if (axis === 'x') g.position.set(sign * d, h / 2, 0); else g.position.set(0, h / 2, sign * d);
   g.castShadow = true; g.receiveShadow = true; scene.add(g);
   const c = new T.Mesh(own(axis === 'x' ? new T.BoxGeometry(.5, .08, len - .4) : new T.BoxGeometry(len - .4, .08, .5)), cushionMat);
   if (axis === 'x') c.position.set(sign * (d - .1), h + .04, 0); else c.position.set(0, h + .04, sign * (d - .1));
   scene.add(c);
   const n = Math.floor(len / .78);
   for (let k = 0; k < n; k++) {
    if (r0() < .1) continue;
    const along = -len / 2 + (k + .5) * len / n + (r0() - .5) * .12;
    const yaw = axis === 'x' ? (sign > 0 ? -Math.PI / 2 : Math.PI / 2) : (sign > 0 ? Math.PI : 0);
    crowdSeats.push(axis === 'x' ? {x: sign * (d - .1), y: h + .05, z: along, yaw, phase: r0() * 6.28, amp: .6 + r0() * .6} : {x: along, y: h + .05, z: sign * (d - .1), yaw, phase: r0() * 6.28, amp: .6 + r0() * .6});
   }
  }
 };
 stand('x', 1, 11, 34, 8); stand('x', -1, 11, 34, 8); stand('z', -1, 20, 22, 8);
 const specGeo = own(spectatorGeometry());
 const crowd = new T.InstancedMesh(specGeo, own(new T.MeshStandardMaterial({roughness: .65})), crowdSeats.length);
 const palette = CHARACTERS.flatMap(c => [c.color, c.fin, c.accent]);
 crowdSeats.forEach((_, i) => crowd.setColorAt(i, new T.Color(palette[Math.floor(r0() * palette.length)])));
 crowd.castShadow = true; crowd.receiveShadow = true; scene.add(crowd);
 let excitement = .3, waveT = -1;
 const tmpM = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpS = new T.Vector3(1, 1, 1), tmpP = new T.Vector3(), yAxis = new T.Vector3(0, 1, 0);

 // ---- umpire chair + umpire
 {
  const ux = -(COURT.doublesHalfWidth + 1.6);
  const wood = own(new T.MeshStandardMaterial({color: theme.trim, metalness: .6, roughness: .35}));
  for (const [dx, dz] of [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]]) { const leg = new T.Mesh(own(new T.CylinderGeometry(.04, .05, 2.1, 8)), wood); leg.position.set(ux + dx, 1.05, dz); leg.castShadow = true; scene.add(leg); }
  const seat = new T.Mesh(own(new T.BoxGeometry(1, .12, 1)), wood); seat.position.set(ux, 2.1, 0); scene.add(seat);
  const back = new T.Mesh(own(new T.BoxGeometry(.12, .8, 1)), wood); back.position.set(ux - .45, 2.5, 0); scene.add(back);
  const players = new Set(initial.players.map(p => p.character));
  const ump = CHARACTERS.find(c => !players.has(c.id) && c.id !== 'rello' && c.id !== 'chora') || CHARACTERS[2];
  const u = makeCreature(ump); u.position.set(ux, 2.16, 0); u.rotation.y = Math.PI / 2; u.scale.setScalar(.7); scene.add(u);
 }

 // ---- scoreboard behind the far stand
 const sbCanvas = document.createElement('canvas'); sbCanvas.width = 1024; sbCanvas.height = 420;
 const sbTex = own(new T.CanvasTexture(sbCanvas)); sbTex.colorSpace = T.SRGBColorSpace;
 const sb = new T.Mesh(own(new T.PlaneGeometry(13, 5.33)), own(new T.MeshBasicMaterial({map: sbTex, toneMapped: false})));
 sb.position.set(0, 9.4, -29.2); scene.add(sb);
 const sbFrame = new T.Mesh(own(new T.BoxGeometry(14, 6.3, .6)), seatMat); sbFrame.position.set(0, 9.4, -29.55); sbFrame.castShadow = true; scene.add(sbFrame);
 for (const sx of [-1, 1]) { const pil = new T.Mesh(own(new T.BoxGeometry(.9, 12.6, .9)), seatMat); pil.position.set(sx * 7.4, 6.3, -29.5); pil.castShadow = true; scene.add(pil); }
 let sbKey = '';
 const teamLabel = (s: TennisState, team: 0 | 1) => s.players.filter(p => p.team === team).map(p => characterById(p.character).name).join(' / ').toUpperCase();
 const drawScoreboard = (s: TennisState) => {
  const pl = pointLabels(s), call = pressureCall(s), si = serverIndex(s);
  const key = `${s.match.games.join()}|${pl.join()}|${call}|${si}|${s.match.winner}`;
  if (key === sbKey) return; sbKey = key;
  const x = sbCanvas.getContext('2d')!;
  x.fillStyle = '#0d0a1c'; x.fillRect(0, 0, 1024, 420);
  x.strokeStyle = theme.trim; x.lineWidth = 10; x.strokeRect(5, 5, 1014, 410);
  x.font = '900 34px Arial, sans-serif'; x.fillStyle = theme.trim; x.textAlign = 'left';
  x.fillText(`KITH TENNIS OPEN · ${venue.name.toUpperCase()}`, 36, 62);
  for (const team of [0, 1] as const) {
   const y = 150 + team * 110;
   x.fillStyle = s.match.winner === team ? theme.trim : '#ffffff'; x.font = '900 52px Arial, sans-serif'; x.textAlign = 'left';
   x.fillText(teamLabel(s, team), 80, y);
   if (s.players[si]?.team === team && s.match.winner === null) { x.fillStyle = '#e8ff5a'; x.beginPath(); x.arc(46, y - 18, 14, 0, 7); x.fill(); }
   x.textAlign = 'center'; x.fillStyle = '#ffffff'; x.font = '900 64px Arial, sans-serif'; x.fillText(String(s.match.games[team]), 760, y + 4);
   x.fillStyle = theme.trim; x.fillRect(840, y - 58, 150, 80); x.fillStyle = '#0d0a1c'; x.fillText(pl[team] || '', 915, y + 4);
  }
  x.font = '800 30px Arial, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#9ff7ff';
  x.fillText(s.match.winner !== null ? 'GAME · SET · MATCH' : call || (s.match.tiebreak ? 'TIE-BREAK' : 'GAMES        POINTS'), 512, 392);
  sbTex.needsUpdate = true;
 };

 // ---- players
 const strings = own(stringTexture());
 const contactTex = own(makeContactShadowTexture());
 const shadowMat = own(new T.MeshBasicMaterial({map: contactTex, transparent: true, depthWrite: false, opacity: .8}));
 const iceMat = own(new T.MeshPhysicalMaterial({color: '#bfefff', roughness: .05, transparent: true, opacity: .5, clearcoat: 1}));
 const starMat = own(new T.SpriteMaterial({map: glowTex, color: '#ffe14a', transparent: true, blending: T.AdditiveBlending, depthWrite: false}));
 const mixers: T.AnimationMixer[] = [];
 let disposed = false;
 const humanIdx = initial.players.map((p, i) => p.human ? i : -1).filter(i => i >= 0);
 const rigs: Rig[] = initial.players.map((p, i) => {
  const c = characterById(p.character), kk = kithKart(p.character);
  const root = new T.Group(); scene.add(root);
  const body = new T.Group(); root.add(body);
  const proc = makeCreature(c); proc.scale.setScalar(1.05); body.add(proc);
  const pivot = new T.Group(); pivot.position.set(.32, .78, .05); body.add(pivot);
  const racket = makeRacket(kk.flameOuter, c.accent, strings); racket.rotation.set(-.4, 0, -.25); racket.scale.setScalar(1.3); pivot.add(racket);
  const shadow = new T.Mesh(new T.PlaneGeometry(1.4, 1.4), shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015; scene.add(shadow);
  const sp = tennisSpecialFor(p.character);
  const aura = new T.Sprite(new T.SpriteMaterial({map: glowTex, color: sp.color, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false})); aura.position.y = .8; root.add(aura);
  const ring = new T.Mesh(new T.TorusGeometry(.62, .035, 8, 40), new T.MeshBasicMaterial({color: sp.color, transparent: true, opacity: 0, toneMapped: false})); ring.rotation.x = -Math.PI / 2; ring.position.y = .04; root.add(ring);
  let marker: T.Mesh | null = null;
  if (p.human) {
   marker = new T.Mesh(new T.ConeGeometry(.16, .3, 4), new T.MeshBasicMaterial({color: humanIdx.indexOf(i) === 0 ? '#ffd23a' : '#3df5ff', toneMapped: false}));
   marker.rotation.x = Math.PI; marker.position.y = 2.05; root.add(marker);
  }
  const ice = new T.Mesh(new T.BoxGeometry(1.2, 1.8, 1.2), iceMat); ice.position.y = .9; ice.visible = false; root.add(ice);
  const stars = new T.Group(); for (let k = 0; k < 3; k++) { const st = new T.Sprite(starMat); st.scale.setScalar(.3); stars.add(st); } stars.position.y = 1.7; stars.visible = false; root.add(stars);
  const rig: Rig = {root, body, model: proc, pivot, racket, shadow, aura, ring, marker, ice, stars, mixer: null, actions: {}, current: '', height: 1.5, prevAnim: '', trailCol: '#ffffff'};
  // Kith models: the rigged Chora/Reello GLBs (with their animation set) or the sculpted drivers.glb busts
  const fit = (obj: T.Object3D, target: number) => {
   const box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3());
   const w = new T.Group(); obj.position.set(-ctr.x, -box.min.y, -ctr.z); w.add(obj); w.scale.setScalar(target / Math.max(.01, size.y));
   obj.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
   return w;
  };
  if (p.character === 'rello' || p.character === 'chora') {
   kithGltfLoader().load(`/kith-party/models/${p.character}.glb`, gltf => {
    if (disposed) { disposeTree(gltf.scene); return; }
    const w = fit(gltf.scene, 1.62);
    body.remove(rig.model); disposeTree(rig.model); body.add(w); rig.model = w; rig.height = 1.62;
    pivot.position.set(.36, .8, .08);
    const mixer = new T.AnimationMixer(gltf.scene); mixers.push(mixer); rig.mixer = mixer;
    for (const clip of gltf.animations) rig.actions[clip.name] = mixer.clipAction(clip);
    playAction(rig, 'idle', 0);
   }, undefined, () => { canvas.dataset.modelFallback = 'true'; });
  } else {
   loadDriversGlb().then(root2 => {
    if (disposed) return;
    const tpl = root2.getObjectByName(`driver_${p.character}`);
    if (!tpl) return;
    const clone = tpl.clone(true);
    clone.traverse(o => { if (o instanceof T.Mesh) { const hasV = o.geometry.hasAttribute('color'); o.material = new T.MeshPhysicalMaterial({color: hasV ? '#ffffff' : c.color, vertexColors: hasV, roughness: .34, metalness: .06, clearcoat: .45, envMapIntensity: 1.2}); } });
    clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0);
    const w = fit(clone, 1.45);
    body.remove(rig.model); disposeTree(rig.model); body.add(w); rig.model = w; rig.height = 1.45;
   }).catch(() => {});
  }
  return rig;
 });

 // ---- ball, decoys, trail, shadow, landing marker, bounce marks
 const ballTex = own(ballTexture());
 const ballMat = own(new T.MeshStandardMaterial({map: ballTex, roughness: .7, emissive: '#d8ff4a', emissiveIntensity: .25}));
 const BALL_R = .085;
 const ball = new T.Mesh(own(new T.SphereGeometry(BALL_R, 20, 14)), ballMat); ball.castShadow = true; scene.add(ball);
 const decoys = [0, 1].map(() => { const d = new T.Mesh(ball.geometry, ballMat); d.visible = false; scene.add(d); return d; });
 const ballShadow = new T.Mesh(own(new T.PlaneGeometry(.5, .5)), own(new T.MeshBasicMaterial({map: contactTex, transparent: true, depthWrite: false, opacity: .7})));
 ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
 const TRAIL = 22;
 const trailPts: T.Vector3[] = Array.from({length: TRAIL}, () => new T.Vector3());
 const trailGeo = own(new T.BufferGeometry());
 const trailPos = new Float32Array(TRAIL * 2 * 3), trailAlpha = new Float32Array(TRAIL * 2);
 trailGeo.setAttribute('position', new T.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('aAlpha', new T.BufferAttribute(trailAlpha, 1));
 const idx: number[] = []; for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx);
 const trailMat = own(new T.ShaderMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: {uColor: {value: new T.Color('#ffffff')}, uOpacity: {value: 0}},
  vertexShader: 'attribute float aAlpha;varying float vA;void main(){vA=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform vec3 uColor;uniform float uOpacity;varying float vA;void main(){gl_FragColor=vec4(uColor*1.6,vA*uOpacity);}'}));
 const trail = new T.Mesh(trailGeo, trailMat); trail.frustumCulled = false; scene.add(trail);
 let trailInit = false;
 const marker = new T.Mesh(own(new T.RingGeometry(.32, .42, 40)), own(new T.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: T.DoubleSide})));
 marker.rotation.x = -Math.PI / 2; marker.position.y = .03; scene.add(marker);
 const markerDot = new T.Mesh(own(new T.CircleGeometry(.12, 20)), marker.material); markerDot.rotation.x = -Math.PI / 2; markerDot.position.y = .031; scene.add(markerDot);
 const MARKS = 24;
 const markMat = own(new T.MeshBasicMaterial({map: contactTex, color: venue.surface === 'clay' ? '#6a2410' : venue.surface === 'ice' ? '#ffffff' : '#20180c', transparent: true, opacity: venue.surface === 'clay' ? .5 : .28, depthWrite: false}));
 const marks = new T.InstancedMesh(own(new T.PlaneGeometry(.34, .2)), markMat, MARKS);
 const markLife: number[] = Array(MARKS).fill(0); let markNext = 0;
 for (let i = 0; i < MARKS; i++) { tmpM.makeScale(0, 0, 0); marks.setMatrixAt(i, tmpM); }
 scene.add(marks);
 // shockwave ring (Bass Drop) + perfect-hit flash
 const shock = new T.Mesh(own(new T.RingGeometry(.8, 1, 48)), own(new T.MeshBasicMaterial({color: '#ff4fb0', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending})));
 shock.rotation.x = -Math.PI / 2; shock.position.y = .05; scene.add(shock); let shockT = -1;
 const flash = new T.Sprite(new T.SpriteMaterial({map: glowTex, color: '#fff2b0', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false})); scene.add(flash); let flashT = -1;

 const fx = createFxSystem(scene, {maxParticles: 5000});
 const post = createPostFx(renderer);
 const camera = new T.PerspectiveCamera(44, 960 / 560, .1, 1400);
 const camTarget = new T.Vector3(0, .2, -1.5);
 let camMode: TennisCam = 'broadcast';
 let shake = 0, lastEvent = 0, initialized = false;
 const up = new T.Vector3(0, 1, 0);
 const v3 = (x: number, y: number, z: number) => new T.Vector3(x, y, z);

 const bounceFx = (x: number, z: number, impact: number, kind: string) => {
  const p = v3(x, .05, z), k = Math.min(1.6, .5 + impact / 8);
  const surf: Record<string, [FxKind, string]> = {grass: ['dust', '#b9d98a'], clay: ['dust', '#d9784a'], hard: ['dust', '#c8ccd8'], ice: ['ice', '#e8fbff'], neon: ['electric', '#00f0ff'], basalt: ['spark', '#ff8a2a']};
  const [kindFx, col] = surf[venue.surface];
  fx.emit(kindFx, p, up.clone().multiplyScalar(1.6 * k), Math.round(10 * k), col, venue.surface === 'clay' ? 1 : .7);
  if (venue.surface === 'grass' && Math.random() < .6) fx.emit('leaf', p, up.clone().multiplyScalar(2), 2, '#7ccf4a', .4);
  if (venue.surface === 'basalt') fx.emit('smoke', p, up.clone(), 2, '#3a2c2a', .6);
  // ball mark
  const yaw = Math.random() * .3;
  tmpM.compose(v3(x, .012 + markNext * .0004, z), tmpQ.setFromEuler(new T.Euler(-Math.PI / 2, 0, yaw)), tmpS.set(1, 1, 1)); marks.setMatrixAt(markNext, tmpM);
  markLife[markNext] = venue.surface === 'clay' ? 60 : 3.5; markNext = (markNext + 1) % MARKS; marks.instanceMatrix.needsUpdate = true;
  void kind;
 };

 const handleEvents = (s: TennisState) => {
  for (const e of s.events) {
   if (e.id <= lastEvent) continue;
   const pos = v3(e.x, Math.max(.1, e.y), e.z);
   const p = e.player >= 0 ? s.players[e.player] : null;
   switch (e.type) {
    case 'hit': {
     const [kind, , q] = e.data.split('|');
     const col = kind === 'special' && p ? tennisSpecialFor(p.character).color : SHOT_COLORS[kind] || '#ffffff';
     const strong = kind === 'smash' || kind === 'special' || Number(q) > .85;
     fx.emit('spark', pos, up.clone().multiplyScalar(3), strong ? 34 : 12, col, strong ? 1.1 : .7);
     if (strong) shake = Math.max(shake, kind === 'smash' ? .22 : .14);
     excitement = Math.min(1.4, excitement + (strong ? .12 : .03));
     break;
    }
    case 'perfect':
     flash.position.copy(pos); flashT = 0;
     fx.emit('spark', pos, up.clone().multiplyScalar(4.4), e.data === 'sweetspot' ? 38 : 26, e.data === 'sweetspot' ? '#fff48f' : '#ffe27a', e.data === 'sweetspot' ? 1.25 : 1);
     if (e.data === 'sweetspot') { shock.position.set(pos.x, .06, pos.z); (shock.material as T.MeshBasicMaterial).color.set('#ffe45e'); shockT = 0; shake = Math.max(shake, .11); excitement = Math.min(1.5, excitement + .14); }
     break;
    case 'bounce': { const [, kind, imp] = e.data.split('|'); bounceFx(e.x, e.z, Number(imp), kind); break; }
    case 'net': case 'netcord': netShake = e.type === 'net' ? 1 : .5; netShakeX = e.x; fx.emit('spark', pos, up.clone().multiplyScalar(2), 8, '#ffffff', .5); break;
    case 'point': {
     const [team, how] = e.data.split('|');
     const winners = s.players.filter(q => q.team === Number(team));
     winners.forEach(w => fx.emit('confetti', v3(w.x, 2.2, w.z), up.clone().multiplyScalar(6), how === 'ACE' || how === 'WINNER' ? 90 : 45, undefined, 1));
     excitement = Math.min(1.6, excitement + (how === 'WINNER' || how === 'ACE' ? .9 : .5));
     break;
    }
    case 'game': case 'match': excitement = 1.8; waveT = 0; fx.emit('confetti', v3(0, 8, -6), up.clone().multiplyScalar(5), 240, undefined, 1.4); break;
    case 'special': {
     const sp = p ? tennisSpecialFor(p.character) : null;
     if (sp) { fx.emit('spark', pos, up.clone().multiplyScalar(6), 60, sp.color, 1.4); flash.position.copy(pos); flashT = 0; (flash.material as T.SpriteMaterial).color.set(sp.color); }
     shake = .25; excitement = 1.5;
     if (e.data === 'confetti-decoy') fx.emit('confetti', pos, up.clone().multiplyScalar(5), 120, undefined, 1.1);
     break;
    }
    case 'shock': shock.position.set(e.x, .05, e.z); shockT = 0; fx.emit('spark', pos, up.clone().multiplyScalar(3), 40, '#ff4fb0', 1.2); break;
    case 'freeze': fx.emit('ice', v3(e.x, 1, e.z), up.clone().multiplyScalar(4), 50, '#bfefff', 1.2); break;
    case 'knock': fx.emit('spark', v3(e.x, 1, e.z), up.clone().multiplyScalar(5), 30, e.data === 'inferno' ? '#ff6a1a' : '#c98a5a', 1.1); shake = .2; break;
    case 'warp': fx.emit('electric', pos, up.clone().multiplyScalar(3), 46, '#b8a6ff', 1.3); break;
    case 'dive': fx.emit('dust', v3(e.x, .1, e.z), up.clone().multiplyScalar(2), 14, venue.surface === 'clay' ? '#d9784a' : '#d8d0c0', 1.1); break;
    case 'fault': case 'out': excitement = Math.min(1.2, excitement + .15); break;
   }
  }
  if (s.events.length) lastEvent = s.events[s.events.length - 1].id;
 };

 // ---------------------------------------------------------------- per-frame pose
 const poseRig = (rig: Rig, p: TennisPlayer, s: TennisState, dt: number) => {
  const speed = Math.hypot(p.vx, p.vz);
  rig.root.position.set(p.x, 0, p.z);
  rig.root.rotation.y = p.facing;
  const t = s.time, a = p.anim, at = p.animT;
  const body = rig.body, pv = rig.pivot;
  // defaults
  let by = p.y, rx = 0, rz = 0, sy = 1, sxz = 1;
  let pY = 0, pX = -.4, pZ = -.25; // racket pivot rotation (yaw, pitch, roll)
  const side = p.swingSide;
  pv.position.x = Math.abs(pv.position.x) * (a === 'swing' || a === 'charge' ? side : 1);
  const lean = Math.min(.28, speed * .045);
  if (a === 'run') { by += Math.abs(Math.sin(t * 13)) * .07; rx = lean; sy = 1 + Math.sin(t * 26) * .03; pX = -.2 + Math.sin(t * 13) * .25; }
  else if (a === 'idle') { by += Math.sin(t * 3 + p.slot) * .015; sy = 1 + Math.sin(t * 3) * .015; pX = -.5; }
  else if (a === 'charge') {
   const c = p.charge;
   pY = side * (1.3 + c * .5); pX = -.6 - c * .3; rz = -side * .08 * c; sy = 1 - c * .05; sxz = 1 + c * .04;
   by += Math.sin(t * 40) * .01 * c;
  } else if (a === 'swing') {
   const u = smooth(at / .3);
   const kind = p.swingKind as ShotKind;
   pY = side * T.MathUtils.lerp(1.6, -1.9, u);
   pX = kind === 'slice' || kind === 'drop' ? T.MathUtils.lerp(-1.1, .2, u) : kind === 'lob' ? T.MathUtils.lerp(-.2, -1.3, u) : T.MathUtils.lerp(.1, -1.2, u);
   pZ = kind === 'volley' ? -.6 : -.25;
   body.rotation.y = side * T.MathUtils.lerp(.5, -.6, u);
   rx = .08;
  } else if (a === 'smash' || a === 'serve') {
   const u = smooth(at / .32);
   pX = T.MathUtils.lerp(-2.9, .9, u); pY = 0; pZ = 0;
   if (a === 'serve') by += Math.sin(Math.min(1, at / .35) * Math.PI) * .35;
   rx = T.MathUtils.lerp(-.2, .25, u);
  } else if (a === 'toss') { pX = -2.4 * smooth(at / .4); rx = -.12; by += Math.sin(Math.min(1, at / .5) * Math.PI) * .05; }
  else if (a === 'dive') { rz = -side * Math.min(1.35, at * 7); by = .25 + Math.max(0, .3 - at) * .6; pY = side * -.6; pX = -1.4; }
  else if (a === 'down') { rz = -side * Math.max(0, 1.35 - Math.max(0, at - .4) * 4); by = .2 * Math.max(0, 1 - at * 1.5); }
  else if (a === 'celebrate') { by += Math.abs(Math.sin(at * 9)) * .45 * Math.max(0, 1 - at * .4); body.rotation.y = at < .7 ? at * 9 : 0; pX = -2.8; }
  else if (a === 'sad') { sy = .93; rx = .3; pX = .4; }
  else if (a === 'stunned') { rz = Math.sin(t * 12) * .15; }
  if (a !== 'swing' && a !== 'celebrate') body.rotation.y *= Math.exp(-dt * 10);
  body.position.y = by;
  body.rotation.x = rx; body.rotation.z = rz;
  body.scale.set(sxz, sy, sxz);
  pv.rotation.set(pX, pY, pZ);
  // GLB animation set (Chora/Reello)
  if (rig.mixer) {
   const want = a === 'celebrate' ? (s.match.winner !== null ? 'excited' : 'cheer') : a === 'sad' ? 'almost' : a === 'run' ? 'hop' : 'idle';
   playAction(rig, want);
   if (rig.actions.hop) rig.actions.hop.timeScale = 1.2 + speed * .12;
  }
  // shadow, aura, special ring, status
  rig.shadow.position.set(p.x, .015, p.z); const ss = 1 - Math.min(.5, p.y * .4); rig.shadow.scale.setScalar(ss);
  const sp = tennisSpecialFor(p.character);
  const am = rig.aura.material as T.SpriteMaterial;
  const auraOn = a === 'charge' ? .25 + p.charge * .6 : p.armed ? .35 + Math.sin(t * 8) * .1 : 0;
  am.opacity += (auraOn - am.opacity) * Math.min(1, dt * 12);
  am.color.set(p.armed ? sp.color : SHOT_COLORS[p.pending || 'topspin'] || '#ffffff');
  rig.aura.scale.setScalar(1.2 + p.charge * 1.6 + (p.armed ? .5 : 0));
  if (a === 'charge' && p.charge > .45 && Math.random() < p.charge * .5) fx.emit('spark', v3(p.x, .9 + Math.random() * .5, p.z), up.clone().multiplyScalar(1.5), 1, p.armed ? sp.color : '#ffe9a0', .5);
  const rm = rig.ring.material as T.MeshBasicMaterial;
  rm.opacity = p.meter >= 1 ? (p.armed ? .95 : .55 + Math.sin(t * 6) * .25) : 0;
  rig.ring.rotation.z += dt * 2; rig.ring.scale.setScalar(p.armed ? 1.15 + Math.sin(t * 10) * .06 : 1);
  if (rig.marker) { rig.marker.position.y = rig.height + .45 + Math.sin(t * 4) * .06; rig.marker.rotation.y += dt * 3; }
  rig.ice.visible = p.frozen > 0;
  rig.stars.visible = p.stun > 0 || p.slow > 0;
  if (rig.stars.visible) rig.stars.children.forEach((c, k) => { const ang = t * 6 + k * 2.1; c.position.set(Math.cos(ang) * .45, Math.sin(t * 9 + k) * .05, Math.sin(ang) * .45); });
 };

 // ---------------------------------------------------------------- camera
 const ACE_PALETTE = new T.Color();
 void ACE_PALETTE;
 const cameraPose = (s: TennisState): {pos: T.Vector3; look: T.Vector3; fov: number} => {
  const b = s.ball;
  if (s.time < 0) {
   const u = Math.max(0, Math.min(1, (s.time + TENNIS_INTRO) / TENNIS_INTRO));
   if (u < .55) { const k = smooth(u / .55), a = -2.2 + k * 1.8; return {pos: v3(Math.cos(a) * 70, 38 - 16 * k, Math.sin(a) * 70), look: v3(0, 2, -6), fov: 48}; }
   if (u < .8) { const k = smooth((u - .55) / .25); return {pos: v3(-13 + k * 4, 2.6 + k * 2, -16 + k * 30), look: v3(0, 1, 0), fov: 52}; }
   const k = smooth((u - .8) / .2); return {pos: v3(-9 + 9 * k, 4.6 + 4 * k, 14 + 7 * k), look: v3(0, 1 - k, 0), fov: 52 - 5 * k};
  }
  // after the match: orbit the winners
  if (s.phase === 'finished' || (s.phase === 'point' && s.match.winner !== null && s.phaseT > .9)) {
   const w = s.players.filter(p => p.team === s.match.winner);
   const cx = w.reduce((a, p) => a + p.x, 0) / Math.max(1, w.length), cz = w.reduce((a, p) => a + p.z, 0) / Math.max(1, w.length);
   const a = s.time * .35;
   return {pos: v3(cx + Math.cos(a) * 5.5, 2.4, cz + Math.sin(a) * 5.5), look: v3(cx, 1, cz), fov: 46};
  }
  // point replay beat: drift in toward the point winner
  if (s.phase === 'point' && s.phaseT > .55 && s.match.lastPointTeam !== null) {
   const w = s.players.filter(p => p.team === s.match.lastPointTeam);
   const p = w[0];
   if (p) {
    const k = smooth((s.phaseT - .55) / .8) * (1 - smooth((s.phaseT - (POINT_PAUSE - .35)) / .35));
    const dir = p.team === 0 ? 1 : -1;
    const close = {pos: v3(p.x + 2.2, 2.1, p.z + dir * 4.2), look: v3(p.x, 1.1, p.z)};
    const base = broadcast(s);
    return {pos: base.pos.lerp(close.pos, k * .85), look: base.look.lerp(close.look, k * .85), fov: base.fov - k * 10};
   }
  }
  if (camMode === 'player') {
   const h = s.players[humanIdx[0] ?? 0];
   const dir = h.team === 0 ? 1 : -1;
   return {pos: v3(h.x * .75 + b.x * .1, 4.4, h.z + dir * 8.2), look: v3(h.x * .35 + b.x * .25, .9, h.z - dir * 15), fov: 54};
  }
  return broadcast(s);
 };
 const broadcast = (s: TennisState) => {
  const b = s.ball;
  // follow the human on the far side a touch more in two-player games
  const bx = b.inPlay || !b.held ? b.x : 0;
  return {pos: v3(bx * .22, 8.6, 21), look: v3(bx * .15, 0, 1), fov: 47};
 };

 drawScoreboard(initial);

 return {
  setCameraMode(m: TennisCam) { camMode = m; },
  render(s: TennisState, dt: number) {
   handleEvents(s);
   kit.update(dt, s.time);
   for (const m of mixers) m.update(dt);
   clouds.forEach(c => { c.s.position.x += c.speed * dt; if (c.s.position.x > 340) c.s.position.x = -340; });
   motes.rotation.y += dt * .01;
   drawScoreboard(s);
   // players
   s.players.forEach((p, i) => poseRig(rigs[i], p, s, dt));
   // ball
   const b = s.ball;
   const by = Math.max(BALL_R, b.y);
   ball.position.set(b.x, by, b.z);
   ball.rotation.x += dt * (b.spin * 30 + Math.hypot(b.vx, b.vz) * 2); ball.rotation.z += dt * b.curve * .5;
   ball.visible = s.time >= -.5 || true;
   ballShadow.position.set(b.x, .02, b.z); ballShadow.scale.setScalar(.5 + Math.min(1.2, b.y * .25)); (ballShadow.material as T.MeshBasicMaterial).opacity = Math.max(.15, .75 - b.y * .12);
   const col = b.special ? (s.players[b.specialOwner] ? tennisSpecialFor(s.players[b.specialOwner].character).color : '#ffffff') : SHOT_COLORS[b.kind] || '#ffffff';
   // decoys
   decoys.forEach((d, k) => { d.visible = b.decoy && b.inPlay; if (d.visible) { const u = Math.min(1, b.flightT / Math.max(.1, b.flightDur)); d.position.set(b.x + (k ? 1 : -1) * 1.8 * Math.sin(u * Math.PI * .9), by + Math.sin(u * 9 + k) * .2, b.z); } });
   // trail
   if (!trailInit) { trailPts.forEach(q => q.copy(ball.position)); trailInit = true; }
   trailPts.pop(); trailPts.unshift(ball.position.clone());
   const view = camera.position;
   const speed = Math.hypot(b.vx, b.vy, b.vz);
   const width = BALL_R * (b.special ? 1.4 : 1) * (b.kind === 'smash' ? 1.3 : 1);
   for (let i = 0; i < TRAIL; i++) {
    const a = trailPts[i], nb = trailPts[Math.min(TRAIL - 1, i + 1)], pb = trailPts[Math.max(0, i - 1)];
    const dir = nb.clone().sub(pb); if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    const side = dir.cross(a.clone().sub(view)).normalize().multiplyScalar(width * (1 - i / TRAIL));
    trailPos.set([a.x + side.x, a.y + side.y, a.z + side.z], i * 6); trailPos.set([a.x - side.x, a.y - side.y, a.z - side.z], i * 6 + 3);
    trailAlpha[i * 2] = trailAlpha[i * 2 + 1] = (1 - i / TRAIL) ** 1.6;
   }
   trailGeo.attributes.position.needsUpdate = true; (trailGeo.attributes.aAlpha as T.BufferAttribute).needsUpdate = true;
   trailMat.uniforms.uColor.value.set(col);
   const trailWant = b.inPlay && !b.held ? Math.min(1, speed / 18) * (b.special ? 1 : .75) : 0;
   trailMat.uniforms.uOpacity.value += (trailWant - trailMat.uniforms.uOpacity.value) * Math.min(1, dt * 10);
   // special particle trails
   if (b.inPlay && b.special) {
    const sp = s.players[b.specialOwner] ? tennisSpecialFor(s.players[b.specialOwner].character) : null;
    const kinds: Record<string, FxKind> = {'inferno-drive': 'flame', 'bass-drop': 'spark', 'bramble-kick': 'leaf', 'chain-zag': 'electric', 'riptide-curve': 'splash', 'confetti-decoy': 'confetti', 'boulder-smash': 'dust', 'moon-warp': 'electric', 'gear-lob': 'spark', 'glacier-slice': 'ice'};
    fx.emit(kinds[b.special] || 'spark', ball.position, v3(-b.vx * .05, .4, -b.vz * .05), 2, sp?.color, b.special === 'inferno-drive' ? 1.1 : .7);
   } else if (b.inPlay && (b.kind === 'smash' || speed > 30)) fx.emit('spark', ball.position, v3(0, .2, 0), 1, '#ffffff', .4);
   // landing marker: where the incoming ball will bounce (only on a human's side)
   const mm = marker.material as T.MeshBasicMaterial;
   const tgt = b.target;
   const showMarker = !!tgt && b.inPlay && b.bounces === 0 && s.players.some(p => p.human && p.team !== b.lastTeam);
   if (showMarker && tgt) { marker.position.set(tgt.x, .03, tgt.z); markerDot.position.set(tgt.x, .031, tgt.z); mm.color.set(col); mm.opacity += (.85 - mm.opacity) * Math.min(1, dt * 14); const pulse = 1 + Math.sin(s.time * 14) * .08; marker.scale.setScalar(pulse * (1.6 - Math.min(.6, b.flightT / Math.max(.2, b.flightDur) * .6))); }
   else mm.opacity *= Math.exp(-dt * 10);
   // marks fade
   for (let i = 0; i < MARKS; i++) if (markLife[i] > 0) { markLife[i] -= dt; if (markLife[i] <= 0) { tmpM.makeScale(0, 0, 0); marks.setMatrixAt(i, tmpM); marks.instanceMatrix.needsUpdate = true; } }
   // net wobble
   if (netShake > .001) {
    netShake *= Math.exp(-dt * 4.5);
    const pos = netGeo.getAttribute('position') as T.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const x = netBase[i * 3], y = netBase[i * 3 + 1]; const fall = Math.exp(-((x - netShakeX) ** 2) / 4); pos.setZ(i, Math.sin(s.time * 30) * .12 * netShake * fall * (y / 1)); }
    pos.needsUpdate = true;
   }
   if (shockT >= 0) { shockT += dt; const k = shockT / .6; shock.scale.setScalar(.5 + k * 4); (shock.material as T.MeshBasicMaterial).opacity = Math.max(0, .9 * (1 - k)); if (k >= 1) shockT = -1; }
   if (flashT >= 0) { flashT += dt; const k = flashT / .3; flash.scale.setScalar(.6 + k * 3); (flash.material as T.SpriteMaterial).opacity = Math.max(0, 1 - k); if (k >= 1) { flashT = -1; (flash.material as T.SpriteMaterial).color.set('#fff2b0'); } }
   // crowd
   excitement += ((s.phase === 'rally' ? .25 + Math.min(.4, s.match.rally * .03) : .2) - excitement) * Math.min(1, dt * .8);
   if (waveT >= 0) { waveT += dt; if (waveT > 3) waveT = -1; }
   crowdSeats.forEach((c, i) => {
    const wave = waveT >= 0 ? Math.max(0, 1 - Math.abs(((c.z + c.x) * .06 + 2) - waveT * 2.4) * 1.5) : 0;
    const hop = Math.max(0, Math.sin(s.time * (7 + c.amp * 3) + c.phase)) * .32 * Math.max(0, excitement - .3) * c.amp + wave * .6;
    tmpP.set(c.x, c.y + hop, c.z); tmpQ.setFromAxisAngle(yAxis, c.yaw + Math.sin(s.time * .7 + c.phase) * .2);
    tmpS.set(1, 1 + hop * .2, 1); tmpM.compose(tmpP, tmpQ, tmpS); crowd.setMatrixAt(i, tmpM);
   });
   crowd.instanceMatrix.needsUpdate = true;
   fx.update(dt, camera);
   // camera
   const pose = cameraPose(s);
   if (!initialized) { camera.position.copy(pose.pos); camTarget.copy(pose.look); camera.fov = pose.fov; }
   else { const k = s.time < 0 ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 4); camera.position.lerp(pose.pos, k); camTarget.lerp(pose.look, 1 - Math.exp(-dt * 6)); camera.fov += (pose.fov - camera.fov) * Math.min(1, dt * 4); }
   shake *= Math.exp(-dt * 7);
   if (shake > .002) { camera.position.x += Math.sin(s.time * 87) * shake; camera.position.y += Math.cos(s.time * 93) * shake * .6; }
   camera.lookAt(camTarget);
   const rect = canvas.getBoundingClientRect();
   const w = Math.max(320, Math.round(rect.width)), h = Math.max(190, Math.round(rect.height));
   const size = renderer.getSize(new T.Vector2());
   if (size.x !== w || size.y !== h) { renderer.setSize(w, h, false); post.setSize(w, h); }
   camera.aspect = w / h; camera.updateProjectionMatrix();
   const smashing = b.inPlay && (b.kind === 'smash' || b.special === 'inferno-drive');
   post.render(scene, [{camera, x: 0, y: 0, w, h, speedBlur: smashing ? .35 : 0, boostTint: b.inPlay && b.special ? .45 : 0}]);
   initialized = true;
   canvas.dataset.drawCalls = String(renderer.info.render.calls);
  },
  dispose() {
   disposed = true;
   mixers.forEach(m => m.stopAllAction());
   fx.dispose(); post.dispose();
   disposeTree(scene);
   disposables.forEach(d => { try { d.dispose(); } catch { /* already gone */ } });
   renderer.dispose(); renderer.forceContextLoss();
   delete canvas.dataset.renderer;
  },
 };
}
export {halfWidth};
