// Lexicon: The Unwriting — adventure-template runtime built on playkit + the Game Studio project.
//
// Loop: PlaykitEngine (fixed step; timeScale slows the world while a rescue challenge is open).
// Input: UnifiedInputBuffer (keyboard/mouse/gamepad). Platform: PlajahPlatformBridge (XP, achievements, saves).
// Logic: the level's rules (Game Project) run in the Studio's RulePlayer; the game is its RuleHost.
// Adventure kit: lock-on, follow camera, dialogue, instrument (playkit/adventure); challenges (playkit/learning).
import * as THREE from 'three/webgpu';
import { PlaykitEngine } from '../../../playkit/core/engine';
import { createPlaykitPostPipeline, type PlaykitPostHandle } from '../../../playkit/render/unifiedPost';
import { createManuscriptLook, type ErasureZone } from '../../../playkit/render/manuscriptLook';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { VegetationScene } from '../../../services/vegetation/scene';
import { createLexSky, type LexSky } from './sky';
import { mergeRigid } from '../../rift-realm/src/batching';
import { glossaVegetation } from './vegetation';
import { loadScribe, type ScribeModel } from './scribe';
import { UnifiedInputBuffer, type UnifiedInputFrame } from '../../../playkit/input/unifiedInput';
import { PlajahPlatformBridge } from '../../../playkit/platform/bridge';
import { Instrument } from '../../../playkit/adventure/instrument';
import { cycleTarget, keepLock, pickTarget, yawTo } from '../../../playkit/adventure/lockOn';
import { DialogueRunner, type DialogueNode } from '../../../playkit/adventure/dialogue';
import { FollowCamera } from '../../../playkit/adventure/followCamera';
import { arithChallenge, letterChallenge, makeSumTarget, valueChallenge, wordValue, type Challenge, type LexEntry } from '../../../playkit/learning/challenges';
import { RulePlayer, type RuleHost } from '../../../services/gamestudio/rulePlayer';
import { LEXICON_NAMES, lexiconProject } from '../../../services/gamestudio/projects/lexicon';
import type { GameLevel } from '../../../services/gamestudio/schema';
import { POWER_LABEL, WORDS, wordByText } from './words';
import { STARTING_WORDS, VILLAGERS, villagerGraph } from './content';
import { buildGlossa, buildTemple, mat, PAL, personModel, textSprite, type BuiltLevel, type SigilView } from './world';
import { audioStart, sfx } from './audio';
import { duckMusic, musicTracks, playMusic, toggleMusic } from './music';
import { inStudio, joinStudio, postToStudio } from './studio';
import { nextStep, tipHtml, type GuideStep } from './guide';

// ── setup ──
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
// WebGPU (WebGL2 fallback) + the playkit post pipeline with the manuscript stage (docs/lexicon-visual-identity.md §8)
const QS = new URLSearchParams(location.search);
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', forceWebGL: QS.has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const manuscript = createManuscriptLook({ ink: 0x2a2118, paper: 0xf4f1ea, inkStrength: 0.5, paperTooth: 0.05, inkFar: 80 });
let post: PlaykitPostHandle | null = null;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe3ee, 40, 170);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
const cam = new FollowCamera(camera);
const hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a3a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 200 });
scene.add(sun, sun.target);
const stars = (() => {
  const g = new THREE.BufferGeometry(), p = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.15, r = 300; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(s); return s;
})();
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('lexdebug');
const project = lexiconProject();
const bridge = new PlajahPlatformBridge({
  gameId: 'lexicon', mode: 'story',
  achievements: [
    { trigger: 'lexicon_first_word', title: 'First Word Home' },
    { trigger: 'lexicon_ten_words', title: 'Keeper of Ten' },
    { trigger: 'lexicon_villagers', title: 'Every Voice Returned' },
    { trigger: 'lexicon_cipher', title: 'Weigher of Words' },
    { trigger: 'lexicon_redactor', title: 'The Redactor Unwritten' },
  ],
  onToast: (d) => toast(`★ ${d.title}`, 'Achievement'),
});

// ── save ──
interface Save { words: string[]; freed: string[]; met: string[]; sigils: string[]; gates: string[]; maxHp: number; cipherTarget: number; templeDone: boolean; tod: number }
const SAVE_KEY = 'plajah.lexicon.save.v1';
const fresh = (): Save => ({ words: [...STARTING_WORDS], freed: [], met: [], sigils: [], gates: [], maxHp: 6, cipherTarget: 0, templeDone: false, tod: 0.42 });
let save: Save = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return fresh(); } })();
if (inStudio()) save = fresh(); // play-in-editor always starts clean
const words = new Set(save.words);
function persist() {
  save.words = [...words];
  if (inStudio()) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
  bridge.emitSave(save as unknown as Record<string, unknown>);
}

// ── state ──
type Mode = 'title' | 'play' | 'dialog' | 'challenge' | 'lyre' | 'archive' | 'cipher' | 'pause' | 'end';
let mode: Mode = 'title';
const builtCache = new Map<string, BuiltLevel>();
let lvl!: BuiltLevel;
let levelDef!: GameLevel;
let rules: RulePlayer | null = null;
let names: Record<string, string> = { ...LEXICON_NAMES };
const studioLevels = new Map<string, GameLevel>();

type Kind = 'hushling' | 'numeral' | 'glyphmaw' | 'redactor';
interface Enemy {
  id: string; kind: Kind; x: number; z: number; y: number; hp: number; alive: boolean;
  state: 'idle' | 'chase' | 'windup' | 'lunge' | 'recover' | 'stun' | 'bound' | 'dying';
  t: number; tier: number; wave: number; g: THREE.Group; body: THREE.Mesh; home: [number, number];
  dir: [number, number]; angry: number; flash: number; wander: number;
}
const enemies: Enemy[] = [];
let eSeq = 0;

const P = {
  x: 0, y: 0, z: 7, yaw: Math.PI, hp: save.maxHp, inv: 0, rollT: 0, rollDir: [0, 1] as [number, number],
  atkT: 0, atkHit: false, lock: null as Enemy | null, fall: 0, walk: 0,
  // the Scribe (identity §4): leather armour, navy cloak, dark locs, brass quill-staff with a cyan feather-blade
  g: personModel(PAL.leather, 0x6b4a35, 0x1a1410, { hair: true, legs: 0x2e2a26 }), quill: new THREE.Group(),
};
{
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 8).rotateX(Math.PI / 2), mat(PAL.brass)); shaft.position.z = 0.35;
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.62, 8).rotateX(Math.PI / 2), mat(PAL.cyan, 0x5ad8e6)); blade.position.z = 1.55;
  P.quill.add(shaft, blade); P.quill.position.set(0.45, 1.05, 0.15); P.g.add(P.quill);
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.35, 14, 1, true), mat(PAL.navy)); cloak.position.set(0, 1.0, -0.08); P.g.add(cloak);
  const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16).rotateX(Math.PI / 2), mat(PAL.brass, 0x3a2a00)); compass.position.set(0.22, 0.85, 0.42); P.g.add(compass);
  P.g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  scene.add(P.g);
}

const inst = new Instrument([], { resetAfter: 1.8 });
const refreshSongs = () => inst.setSongs([...words].filter((w) => wordByText(w)?.power !== 'none' && wordByText(w)).map((w) => ({ id: w, notes: [...w] })));
refreshSongs();

// ── HUD ──
let toastT = 0, storyT = 0;
const toastQueue: [string, string][] = [];
/** Toasts queue up so an achievement never hides the word you just rescued. */
function toast(text: string, sub = '') { if (toastT > 0.4) { toastQueue.push([text, sub]); return; } showToast(text, sub); }
function showToast(text: string, sub: string) { const el = $('toast'); el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; el.style.opacity = '1'; toastT = 2.8; }
function story(text: string) { const el = $('story'); el.textContent = text; el.style.opacity = '1'; storyT = 6; }
function hud() {
  let h = '';
  for (let i = 0; i < save.maxHp / 2; i++) { const v = P.hp - i * 2; h += `<span class="h" style="color:${v >= 2 ? '#ff5d6c' : v === 1 ? '#ffaab3' : 'rgba(255,255,255,.25)'}">${v >= 1 ? '♥' : '♡'}</span>`; }
  $('hearts').innerHTML = h;
  $('langN').textContent = String(words.size); $('langT').textContent = String(WORDS.length);
  $('langFill').style.width = `${(words.size / WORDS.length) * 100}%`;
  const songs = [...words].filter((w) => wordByText(w)?.power !== 'none');
  $('songs').innerHTML = `Songs <b>${songs.join(' · ')}</b> &nbsp;<span class="key" style="background:rgba(255,255,255,.15)">Q</span>`;
  $('level').textContent = levelDef?.name ?? '';
}
function clockText() {
  if (lvl.id !== 'glossa') return '';
  const hrs = (save.tod * 24) % 24, hh = Math.floor(hrs), mm = Math.floor((hrs - hh) * 60);
  const night = save.tod < 0.23 || save.tod > 0.77;
  return `${night ? '☾ Night' : '☀ Day'} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
const show = (id: string, v: boolean) => { $(id).style.display = v ? 'block' : 'none'; };

// ── the guide: the next goal on the HUD, a gold beacon where it is, and the keys for it (guide.ts) ──
let guideOn = localStorage.getItem('lexicon_guide') !== '0';
let step: GuideStep | null = null;
const beacon = (() => {
  const g = new THREE.Group(); g.name = 'guide-beacon';
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 40, 12, 1, true).translate(0, 22, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false }));
  gem.position.y = 3.4; gem.name = 'gem';
  g.add(beam, gem); g.visible = false; scene.add(g);
  return g;
})();
const guideState = () => ({
  level: lvl.id, words, starting: STARTING_WORDS, freed: save.freed, met: save.met, sigils: save.sigils, gates: save.gates, templeDone: save.templeDone,
  songs: [...words].map((w) => ({ w, power: wordByText(w)?.power ?? 'none' })).filter((s) => s.power !== 'none'),
  enemies: enemies.filter((e) => e.alive && e.state !== 'bound' && e.state !== 'dying').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)).map((e) => ({ kind: e.kind, x: e.x, z: e.z })),
  player: [P.x, P.z] as [number, number],
});
const _bp = new THREE.Vector3();
function updateGuide(t: number) {
  const next = lvl && mode !== 'title' ? nextStep(guideState()) : null;
  if (next?.id !== step?.id) {
    // a new goal: say it once, then keep it on the HUD
    if (step && next && mode === 'play') { sfx.note('E'); toast('New goal', next.goal); }
    $('tip').innerHTML = next ? tipHtml(next.tip) : '';
  }
  step = next;
  const playing = mode === 'play' && guideOn && !!step;
  const q = $('quest');
  q.style.display = step && mode !== 'title' ? 'block' : 'none';
  $('tip').style.display = playing ? 'block' : 'none';
  if (step) {
    const d = step.at ? Math.round(Math.hypot(step.at[0] - P.x, step.at[1] - P.z)) : 0;
    q.innerHTML = `◆ ${step.goal}${step.at && d > 3 ? ` <span class="m">${d} m</span>` : ''}`;
  }
  // the beacon stands at the goal; an arrow at the screen edge points to it when it's out of view
  const arrow = $('waypoint');
  if (!playing || !step?.at) { beacon.visible = false; arrow.style.display = 'none'; return; }
  const [x, z] = step.at;
  beacon.visible = Math.hypot(x - P.x, z - P.z) > 2.5;
  beacon.position.set(x, lvl.heightAt(x, z), z);
  const gem = beacon.getObjectByName('gem')!; gem.rotation.y = t * 1.6; gem.position.y = 3.4 + Math.sin(t * 2.2) * 0.25;
  _bp.set(x, beacon.position.y + 3.4, z).project(camera);
  const behind = _bp.z > 1;
  let sx = _bp.x, sy = _bp.y;
  if (behind) { sx = -sx; sy = -sy; }
  const onScreen = !behind && Math.abs(sx) < 0.92 && Math.abs(sy) < 0.88;
  if (onScreen || Math.hypot(x - P.x, z - P.z) < 2.5) { arrow.style.display = 'none'; return; }
  const k = 0.88 / Math.max(Math.abs(sx), Math.abs(sy), 1e-3);
  const ex = sx * k, ey = sy * k;
  arrow.style.display = 'block';
  arrow.style.left = `${(ex * 0.5 + 0.5) * innerWidth}px`; arrow.style.top = `${(-ey * 0.5 + 0.5) * innerHeight}px`;
  arrow.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(-ey, ex)}rad)`;
}

// ── input ──
const input = new UnifiedInputBuffer();
const keys = new Set<string>();
const keyAction: Record<string, Parameters<UnifiedInputBuffer['setAction']>[0]> = {
  Space: 'dash', KeyJ: 'melee', KeyF: 'melee', ShiftLeft: 'altFire', ShiftRight: 'altFire', KeyE: 'interact', Enter: 'interact',
  KeyQ: 'special', Tab: 'toggleView', Escape: 'pause', KeyR: 'cycleSlot', KeyC: 'item',
};
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (mode === 'lyre' && /^Key[A-Z]$/.test(e.code) && e.code !== 'KeyQ') { lyreNote(e.code.slice(3)); return; }
  if (mode === 'lyre' && e.code === 'KeyQ' && !e.repeat) { lyreNote('Q'); return; }
  if (mode === 'challenge' && /^Digit[1-4]$/.test(e.code)) { answer(Number(e.code.slice(5)) - 1); return; }
  if (e.repeat) return;
  if (e.code === 'KeyM' && mode !== 'lyre') { toast('Music', toggleMusic() ? 'On' : 'Off'); return; }
  if (e.code === 'KeyG' && mode !== 'lyre') { guideOn = !guideOn; localStorage.setItem('lexicon_guide', guideOn ? '1' : '0'); toast('Guide', guideOn ? 'On' : 'Off · the goal stays at the top left'); return; }
  keys.add(e.code);
  const a = keyAction[e.code]; if (a) input.setAction(a, true);
});
addEventListener('keyup', (e) => { keys.delete(e.code); const a = keyAction[e.code]; if (a) input.setAction(a, false); });
canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'play') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); }
  if (e.button === 0) input.setAction('melee', true);
  if (e.button === 2) input.setAction('altFire', true);
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.setAction('melee', false); if (e.button === 2) input.setAction('altFire', false); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) input.addLookDelta(e.movementX, e.movementY, 'keyboard-mouse'); });

/**
 * The controller to read: the first one with the browser's standard layout (Xbox / PlayStation pads). A racing wheel,
 * pedals or a flight stick also show up as gamepads, often in slot 0, with axes that rest at full travel; read as a
 * stick, they walk the Scribe in a circle and lock out the keyboard. Each pad's resting axes are learnt when it is
 * first seen, so stick drift doesn't count as a push either.
 */
const padRest = new Map<string, number[]>();
// a key released while the window was away (alt-tab, another pane) never sends its keyup: let everything go on blur
function releaseAll() {
  for (const code of keys) { const a = keyAction[code]; if (a) input.setAction(a, false); }
  keys.clear(); input.setAction('melee', false); input.setAction('altFire', false);
  input.setMoveStick(0, 0, 'keyboard-mouse');
}
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
function activePad() {
  const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected && p.mapping === 'standard');
  if (!pad) return null;
  const key = `${pad.index}:${pad.id}`;
  let rest = padRest.get(key);
  if (!rest) { rest = pad.axes.map((a) => (Math.abs(a) < 0.35 ? a : 0)); padRest.set(key, rest); }
  const axes = pad.axes.map((a, i) => (Math.abs(a - rest![i]) < 0.18 ? 0 : a));
  return { axes, buttons: pad.buttons };
}
function readKeys() {
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const pad = activePad();
  const padMoving = !!pad && (pad.axes[0] !== 0 || pad.axes[1] !== 0);
  // the keyboard always wins while a key is held; the pad drives only when it is actually pushed
  if (x || y || !padMoving) input.setMoveStick(x, y, 'keyboard-mouse');
  const lx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), ly = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
  if (lx || ly) input.addLookDelta(lx * 9, ly * 6, 'keyboard-mouse');
  if (pad) {
    input.ingestGamepad(pad, 1 / 60);
    if (x || y) input.setMoveStick(x, y, 'keyboard-mouse');
    const lt = pad.buttons[6]; const ltDown = !!(lt?.pressed || (lt?.value ?? 0) > 0.4);
    if (ltDown !== padLT) { padLT = ltDown; input.setAction('altFire', ltDown, 'gamepad'); }
  }
}
let padLT = false;

// ── levels ──
function startLevelDef(id: string): GameLevel {
  return studioLevels.get(id) ?? structuredClone(project.levels.find((l) => l.id === id)!);
}

function loadLevel(id: 'glossa' | 'temple', at?: [number, number, number], yaw?: number) {
  if (lvl) scene.remove(lvl.group);
  for (const e of enemies) scene.remove(e.g);
  enemies.length = 0; projectiles.forEach((p) => scene.remove(p.m)); projectiles.length = 0; pickups.forEach((p) => scene.remove(p.m)); pickups.length = 0;
  endBoss(false);
  lvl = builtCache.get(id) ?? (id === 'glossa' ? buildGlossa() : buildTemple());
  builtCache.set(id, lvl);
  batchLevel(lvl);
  scene.add(lvl.group);
  levelDef = startLevelDef(id);
  for (const [gid, g] of lvl.gates) if (save.gates.includes(gid) && !g.open) openGate(gid, true);
  for (const [sid, s] of lvl.sigils) s.setSolved(save.sigils.includes(sid));
  if (lvl.id === 'glossa' && save.cipherTarget) setGateSign(save.cipherTarget);
  const spawn = levelDef.markers.find((m) => m.kind === 'spawn');
  const p = at ?? spawn?.pos ?? [0, 0, 0];
  P.x = p[0]; P.z = p[2]; P.yaw = yaw ?? spawn?.yaw ?? Math.PI; P.lock = null; P.fall = 0;
  cam.snapBehind(P.yaw); cam.jump();
  // glossa: the Unwritten wait at their spots; temple: the rules send them
  if (lvl.id === 'glossa') for (const m of levelDef.markers.filter((m) => m.kind === 'enemySpot')) spawnEnemy((m.name as Kind) || 'hushling', m.pos[0], m.pos[2], 0);
  sun.visible = lvl.id === 'glossa'; stars.visible = lvl.id === 'glossa';
  vegetation && (vegetation.group.visible = lvl.id === 'glossa');
  if (lvl.id === 'glossa' && lexSky) lexSky.setActive(true);
  else {
    lexSky?.setActive(false);
    scene.fog = new THREE.Fog(lvl.sky.fog, lvl.sky.fogNear, lvl.sky.fogFar);
    hemi.intensity = 0.75; hemi.color.set(0x9a8cc8);
  }
  rules = new RulePlayer(levelDef.rules, levelDef.zones, host, (k, i) => names[`${k}:${i}`]);
  rules.start();
  hud();
}

/** One draw per material for everything in a level that never changes (houses, stones, walls): the Intel iGPU was
 *  CPU-bound on ~200 small draws. Sigils, gates, villagers, pillars and the bridge are marked dynamic and left alone. */
const batched = new WeakSet<BuiltLevel>();
function batchLevel(l: BuiltLevel) {
  if (batched.has(l) || QS.has('nobatch')) return;
  batched.add(l);
  const dynamic = (m: THREE.Object3D) => { for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.userData.dynamic) return true; return false; };
  mergeRigid(l.group, (m) => !dynamic(m));
}

// ── the Unwritten ──
function enemyModel(kind: Kind): { g: THREE.Group; body: THREE.Mesh } {
  const g = new THREE.Group();
  let body: THREE.Mesh;
  // identity §5: the Unwriting is black ink; the world around them is erased to paper (manuscript field)
  // each body gets its own material: hits flash it, and a shared cached material would flash every match
  const own = (c: number, e = 0) => mat(c, e).clone();
  if (kind === 'hushling') {
    // faceless fog-head over a tattered shadow cloak
    body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), own(PAL.ink)); body.position.y = 1.55;
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 12, 1, true), mat(0x23252a)); cloak.position.y = 0.85; g.add(cloak);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.05), mat(0xf4f1ea)); bar.position.set(0, 1.6, 0.5); g.add(bar); // a redaction where the face was
  } else if (kind === 'numeral') {
    // brass and obsidian clockwork with a glowing red numeral core
    body = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), own(0x2a2a2e, 0x5a0808)); body.position.y = 1.1;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 32), mat(0xb08d4a)); ring.position.y = 1.1; ring.userData.spin = 1; g.add(ring);
  } else if (kind === 'glyphmaw') {
    // ink-black devourer with bioluminescent rune spines
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.0, 6, 12).rotateX(Math.PI / 2), own(PAL.ink)); body.position.y = 0.7;
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), mat(PAL.cyan, 0x3ac0d0)); sp.position.set(0, 1.25, -0.45 + i * 0.3); g.add(sp); }
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.2), mat(0x8a1010, 0x300000)); jaw.position.set(0, 0.62, 1.0); g.add(jaw);
  } else {
    // the Redactor: faceless hooded judge in dark armour; black redaction bars orbit him
    body = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4.2, 16), own(PAL.inkWarm)); body.position.y = 2.1;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.2), mat(0x050505)); bar.position.set(0, 3.2, 0.62); g.add(bar);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.05), mat(0x050505)); b.userData.orbit = i; g.add(b); }
  }
  body.castShadow = true; g.add(body);
  if (kind !== 'redactor') {
    const glyph = textSprite(kind === 'hushling' ? 'A_c' : kind === 'numeral' ? '±' : '#', { size: 48, scale: 0.45, color: '#2a2418', bg: 'rgba(243,234,210,.85)' });
    glyph.position.y = kind === 'numeral' ? 2.3 : 1.9; g.add(glyph);
  }
  return { g, body };
}

function tierAt(x: number, z: number) { if (lvl.id === 'temple') return 2; const r = Math.hypot(x, z); return r < 30 ? 1 : r < 55 ? 2 : 3; }

function spawnEnemy(kind: Kind, x: number, z: number, wave: number): Enemy {
  const { g, body } = enemyModel(kind);
  const e: Enemy = { id: `e${eSeq++}`, kind, x, z, y: 0, hp: kind === 'redactor' ? 5 : 2, alive: true, state: 'idle', t: 0, tier: tierAt(x, z), wave, g, body, home: [x, z], dir: [0, 1], angry: 0, flash: 0, wander: Math.random() * 6 };
  scene.add(g); enemies.push(e);
  return e;
}

// ── collisions ──
function collide(x: number, z: number, r: number): [number, number] {
  for (const c of lvl.circles) {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d < m && d > 1e-4) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
  }
  for (const b of lvl.boxes) {
    if (b.off) continue;
    if (x > b.minx - r && x < b.maxx + r && z > b.minz - r && z < b.maxz + r) {
      const pushL = x - (b.minx - r), pushR = b.maxx + r - x, pushB = z - (b.minz - r), pushF = b.maxz + r - z;
      const m = Math.min(pushL, pushR, pushB, pushF);
      if (m === pushL) x = b.minx - r; else if (m === pushR) x = b.maxx + r; else if (m === pushB) z = b.minz - r; else z = b.maxz + r;
    }
  }
  return lvl.constrain(x, z);
}

/** Where the camera may not sit: inside walls, houses or tree crowns (colliders plus a 1.2 m crown margin). */
function cameraBlocked(x: number, _y: number, z: number): boolean {
  for (const b of lvl.boxes) if (!b.off && x > b.minx - 0.3 && x < b.maxx + 0.3 && z > b.minz - 0.3 && z < b.maxz + 0.3) return true;
  for (const c of lvl.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + 1.2) return true;
  const [cx, cz] = lvl.constrain(x, z);
  return lvl.id === 'temple' && (Math.abs(cx - x) > 0.01 || Math.abs(cz - z) > 0.01);
}

// ── player ──
let frame: UnifiedInputFrame;
let consumed = false;
const pressed = (a: keyof UnifiedInputFrame['pressed']) => !consumed && frame.pressed[a];
const angleDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function hurt(n: number, fromX: number, fromZ: number) {
  if (P.inv > 0 || mode !== 'play') return;
  P.hp = Math.max(0, P.hp - n); P.inv = 1.0; sfx.hurt();
  const d = Math.hypot(P.x - fromX, P.z - fromZ) || 1;
  [P.x, P.z] = collide(P.x + ((P.x - fromX) / d) * 1.6, P.z + ((P.z - fromZ) / d) * 1.6, 0.45);
  engine.triggerHitstop(0.06);
  hud();
  if (P.hp <= 0) downed();
}

function downed() {
  rules?.playerDowned();
  fade(() => {
    P.hp = save.maxHp;
    loadLevel(lvl.id);
    toast('You wake by the Word Well.', 'The words you saved are still safe.');
  });
}

function updatePlayer(dt: number) {
  const [mx, mz] = cam.toWorld(frame.moveX, frame.moveY);
  const moving = Math.hypot(mx, mz) > 0.1;
  P.inv = Math.max(0, P.inv - dt);

  // lock-on (hold)
  if (frame.held.altFire) {
    if (!P.lock || !keepLock(P.lock, P.x, P.z)) P.lock = pickTarget(P.x, P.z, P.yaw, enemies.filter((e) => e.state !== 'bound' && e.kind !== 'redactor' || e.kind === 'redactor'));
    if (pressed('cycleSlot')) P.lock = cycleTarget(P.lock, P.x, P.z, enemies);
  } else P.lock = null;

  if (P.fall > 0) {
    P.fall += dt; P.y -= dt * 14;
    if (P.fall > 0.8) { P.fall = 0; P.x = 0; P.z = -50; P.y = 0; hurt(1, 0, -49); toast('You climb back up.'); }
    return;
  }

  // roll
  if (pressed('dash') && P.rollT <= 0 && P.atkT <= 0) {
    P.rollT = 0.42; P.inv = Math.max(P.inv, 0.35); sfx.roll();
    P.rollDir = moving ? [mx / Math.hypot(mx, mz), mz / Math.hypot(mx, mz)] : [Math.sin(P.yaw), Math.cos(P.yaw)];
  }
  // strike
  if (pressed('melee') && P.atkT <= 0 && P.rollT <= 0) { P.atkT = 0.34; P.atkHit = false; sfx.swing(); }

  let vx = 0, vz = 0;
  if (P.rollT > 0) {
    P.rollT -= dt; vx = P.rollDir[0] * 11; vz = P.rollDir[1] * 11;
  } else {
    const sp = P.atkT > 0 ? 1.8 : P.lock ? 4.6 : 6.4;
    vx = mx * sp; vz = mz * sp;
  }
  if (P.lock) P.yaw = yawTo(P.x, P.z, P.lock);
  else if (moving && P.rollT <= 0) P.yaw += angleDiff(Math.atan2(mx, mz), P.yaw) * Math.min(1, dt * 14);
  [P.x, P.z] = collide(P.x + vx * dt, P.z + vz * dt, 0.45);
  P.y = lvl.heightAt(P.x, P.z);
  P.walk += Math.hypot(vx, vz) * dt;

  if (P.atkT > 0) {
    P.atkT -= dt;
    if (!P.atkHit && P.atkT < 0.2) { P.atkHit = true; resolveStrike(); }
  }

  // the chasm
  if (lvl.chasm && P.rollT <= 0) {
    const c = lvl.chasm, onBridge = lvl.bridge?.visible && Math.abs(P.x) < 1.5;
    if (P.x > c.minx && P.x < c.maxx && P.z > c.minz + 0.6 && P.z < c.maxz - 0.6 && !onBridge) { P.fall = 0.001; sfx.hurt(); }
  }
  // back out of the temple
  if (lvl.id === 'temple' && P.z > 1.2) { const [x, , z] = [0, 0, -72]; fade(() => loadLevel('glossa', [x, 0, z], 0)); }
}

function resolveStrike() {
  let hit = false;
  for (const e of enemies) {
    if (!e.alive || e.state === 'bound' || e.state === 'dying') continue;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    const facing = Math.abs(angleDiff(yawTo(P.x, P.z, e), P.yaw)) < 1.1;
    if ((d < 2.7 && facing) || (P.lock === e && d < 3.4)) {
      hit = true;
      if (e.kind === 'redactor') { toast('The quill glances off.', 'Strike the right pillar to break his ink.'); continue; }
      e.hp -= 1; e.flash = 0.18; e.state = 'stun'; e.t = 0.35;
      const k = 1.4 / (d || 1); [e.x, e.z] = collide(e.x + (e.x - P.x) * k, e.z + (e.z - P.z) * k, 0.6);
      sfx.hit(); engine.triggerHitstop(0.05);
      if (e.hp <= 0) openChallenge(e);
    }
  }
  if (boss) for (let i = 0; i < lvl.pillars.length; i++) {
    const pl = lvl.pillars[i]; const d = Math.hypot(pl.x - P.x, pl.z - P.z);
    if (d < 3.2 && Math.abs(angleDiff(yawTo(P.x, P.z, pl), P.yaw)) < 1.0) { strikePillar(i); hit = true; break; }
  }
  return hit;
}

// ── enemies ──
function updateEnemies(dt: number, night: boolean) {
  for (const e of enemies) {
    if (!e.alive) continue;
    e.flash = Math.max(0, e.flash - dt); e.angry = Math.max(0, e.angry - dt);
    if (e.kind === 'redactor') continue;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
    const speed = (2.4 + e.tier * 0.45) * (e.angry > 0 ? 1.45 : 1);
    e.t -= dt;
    switch (e.state) {
      case 'idle': {
        e.wander -= dt;
        if (e.wander < 0) { const a = Math.random() * Math.PI * 2; e.dir = [Math.sin(a), Math.cos(a)]; e.wander = 2 + Math.random() * 3; }
        const hx = e.home[0] - e.x, hz = e.home[1] - e.z;
        const back = Math.hypot(hx, hz) > 8;
        const wx = back ? hx : e.dir[0], wz = back ? hz : e.dir[1], wl = Math.hypot(wx, wz) || 1;
        [e.x, e.z] = collide(e.x + (wx / wl) * dt * 1.1, e.z + (wz / wl) * dt * 1.1, 0.6);
        if (d < (night ? 16 : 12) && mode === 'play') e.state = 'chase';
        break;
      }
      case 'chase':
        if (d > 24) { e.state = 'idle'; break; }
        [e.x, e.z] = collide(e.x + (dx / d) * speed * dt, e.z + (dz / d) * speed * dt, 0.6);
        if (d < 2.9 && e.t <= 0) { e.state = 'windup'; e.t = 0.55; e.dir = [dx / d, dz / d]; }
        break;
      case 'windup': if (e.t <= 0) { e.state = 'lunge'; e.t = 0.28; } break;
      case 'lunge':
        [e.x, e.z] = collide(e.x + e.dir[0] * 11 * dt, e.z + e.dir[1] * 11 * dt, 0.6);
        if (d < 1.3) hurt(e.kind === 'glyphmaw' ? 2 : 1, e.x, e.z);
        if (e.t <= 0) { e.state = 'recover'; e.t = 0.7; }
        break;
      case 'recover': if (e.t <= 0) { e.state = 'chase'; e.t = 0.4; } break;
      case 'stun': if (e.t <= 0) { e.state = 'chase'; e.t = 0.5; } break;
      case 'dying': if (e.t <= 0) { e.alive = false; scene.remove(e.g); } break;
      case 'bound': break;
    }
    // soft separation
    for (const o of enemies) if (o !== e && o.alive && o.kind !== 'redactor') {
      const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz);
      if (od < 1.3 && od > 1e-3) { e.x += (ox / od) * (1.3 - od) * 0.5; e.z += (oz / od) * (1.3 - od) * 0.5; }
    }
    e.y = lvl.heightAt(e.x, e.z);
  }
  // night: the Unwriting walks
  if (lvl.id === 'glossa' && night && mode === 'play') {
    nightClock -= dt;
    const near = enemies.filter((e) => e.alive && Math.hypot(e.x - P.x, e.z - P.z) < 40).length;
    const safe = save.sigils.includes('lantern') && Math.hypot(P.x, P.z) < 26;
    if (nightClock <= 0 && near < 5 && !safe) {
      nightClock = 7;
      const a = Math.random() * Math.PI * 2, x = P.x + Math.sin(a) * 16, z = P.z + Math.cos(a) * 16;
      if (Math.hypot(x, z) < 84 && Math.hypot(x, z) > 20) { const e = spawnEnemy(Math.random() < 0.6 ? 'hushling' : 'numeral', x, z, 0); e.state = 'chase'; }
    }
  }
}
let nightClock = 4;

// ── rescue challenges ──
let ch: { c: Challenge; e: Enemy | null; t: number; total: number } | null = null;
const BANK: LexEntry[] = WORDS.map((w) => ({ w: w.w, def: w.def, tier: w.tier }));
function neededWords(): Set<string> {
  const need = new Set<string>();
  for (const v of VILLAGERS) if (!save.freed.includes(v.id) && !words.has(v.word)) need.add(v.word);
  if (need.size) return need;
  for (const w of WORDS) if (!words.has(w.w) && ![...VILLAGERS.map((v) => v.rewardWord), 'LANGUAGE'].includes(w.w)) need.add(w.w);
  return need;
}
function openChallenge(e: Enemy) {
  const need = neededWords();
  const prefer = (x: LexEntry) => need.has(x.w);
  const c = e.kind === 'hushling' ? letterChallenge(BANK, e.tier, prefer) : e.kind === 'numeral' ? arithChallenge(e.tier) : valueChallenge(BANK, e.tier, prefer);
  e.state = 'bound'; e.flash = 0;
  const total = c.kind === 'value' ? 12 : c.kind === 'arith' ? 10 : 9;
  ch = { c, e, t: total, total };
  mode = 'challenge'; engine.timeScale = 0.06;
  $('chKind').textContent = e.kind === 'hushling' ? 'A Hushling falters. Restore the word.' : e.kind === 'numeral' ? 'A Numeral cracks. Break the sum.' : 'A Glyphmaw gapes. Weigh the word.';
  $('chPrompt').textContent = c.prompt;
  $('chSub').textContent = c.sub;
  // the first few times: say how to answer
  if (words.size - STARTING_WORDS.length < 2) $('chSub').innerHTML += '<div style="margin-top:6px;font-style:italic">Press <span class="key">1</span>–<span class="key">4</span> or click your answer before the red bar runs out.</div>';
  const box = $('chChoices'); box.innerHTML = '';
  const dpad = ['▲', '▶', '▼', '◀'];
  c.choices.forEach((txt, i) => { const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = `<span class="key">${i + 1} ${dpad[i]}</span>${txt}`; b.onclick = () => answer(i); box.appendChild(b); });
  show('challenge', true);
  document.exitPointerLock?.();
}
function answer(i: number) {
  if (!ch) return;
  const { c, e } = ch; ch = null;
  show('challenge', false); mode = 'play'; engine.timeScale = 1;
  if (i === c.answer) {
    sfx.rescue();
    rules?.emit('puzzleSolved', { kind: c.kind });
    bridge.creditXp(10 + (e?.tier ?? 1) * 5);
    if (e) {
      e.state = 'dying'; e.t = 0.6;
      if (Math.random() < 0.3 || P.hp <= 2) dropHeart(e.x, e.z);
      rules?.enemyDown(e.kind, e.wave);
      if (P.lock === e) P.lock = null;
    }
    const w = c.entry?.w ?? pickFreed(e?.tier ?? 1);
    if (w) freeWord(w);
  } else {
    sfx.wrong();
    toast(`It was ${c.choices[c.answer]}.`, 'The Unwritten pulls the word back.');
    if (e) { e.state = 'chase'; e.hp = 1; e.angry = 6; e.t = 0.6; eraseBurst(e.x, e.z, 6, 1); }
  }
}
function pickFreed(tier: number): string | null {
  const need = [...neededWords()].filter((w) => (wordByText(w)?.tier ?? 9) <= Math.max(tier, 2));
  const all = need.length ? need : [...neededWords()];
  return all.length ? all[Math.floor(Math.random() * all.length)] : null;
}
function freeWord(w: string) {
  const def = wordByText(w);
  if (!def) return;
  if (words.has(w)) { P.hp = Math.min(save.maxHp, P.hp + 2); toast(`${w} was already safe.`, 'You feel steadier.'); hud(); return; }
  words.add(w); persist(); refreshSongs();
  rules?.collected('words');
  const isSong = def.power !== 'none';
  toast(`${isSong ? '♪' : '✦'} ${w}`, isSong ? `New song: ${POWER_LABEL[def.power]}. ${def.def}` : `Rescued: “${def.def}”`);
  if (words.size - STARTING_WORDS.length >= 1) bridge.unlockAchievement('lexicon_first_word');
  if (words.size >= 10) bridge.unlockAchievement('lexicon_ten_words');
  hud();
}

// ── pickups + projectiles ──
const pickups: { m: THREE.Mesh; x: number; z: number; t: number }[] = [];
function dropHeart(x: number, z: number) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), mat(0xff5d6c, 0x5a0010));
  m.position.set(x, lvl.heightAt(x, z) + 0.6, z); scene.add(m); pickups.push({ m, x, z, t: 15 });
}
const projectiles: { m: THREE.Mesh; x: number; z: number; vx: number; vz: number; t: number }[] = [];

// ── sigils, gates ──
function nearestSigil(power?: string, radius = 3.2): SigilView | null {
  let best: SigilView | null = null, bd = radius;
  for (const s of lvl.sigils.values()) {
    if (power && s.def.power !== power) continue;
    const d = Math.hypot(s.def.pos[0] - P.x, s.def.pos[1] - P.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function solveSigil(s: SigilView) {
  s.setSolved(true);
  if (!save.sigils.includes(s.def.id)) save.sigils.push(s.def.id);
  persist();
  rules?.emit('puzzleSolved', { kind: 'sigil' });
  const lines: Record<string, string> = { torches: 'Cold blue light fills the chasm hall.', vine: 'Roots knit themselves into a bridge.', lantern: 'The lantern wakes. The village is warded at night.', sapling: 'The sapling bursts into blossom.', fountain: 'Rain fills the fountain. Your reflection looks back.', chest: 'The blank lock remembers it was a lock, and opens.', sundial: 'The shadow moves again. Time remembers itself.' };
  story(lines[s.def.id] ?? 'The sigil answers.');
  if (s.def.reward) setTimeout(() => freeWord(s.def.reward!), 900);
}
function openGate(id: string, silent = false) {
  const g = lvl.gates.get(id);
  if (!g || g.open) return;
  g.open = true; g.box.off = true; g.obj.visible = false;
  if (!save.gates.includes(id)) { save.gates.push(id); persist(); }
  if (!silent) { sfx.gate(); story(id === 'cipher' ? 'The Cipher Gate sinks into the earth.' : 'The door of bars dissolves.'); }
}
function setGateSign(n: number) {
  const g = lvl.gates.get('cipher'); if (!g) return;
  const old = g.obj.userData.sign as THREE.Sprite; g.obj.remove(old);
  const s = textSprite(String(n), { size: 90, color: '#ffe08a', scale: 1.4 }); s.position.copy(old.position); g.obj.add(s); g.obj.userData.sign = s;
}

// ── interaction ──
type Interactable = { label: string; act: () => void } | null;
function interactable(): Interactable {
  if (lvl.id === 'glossa') {
    for (const v of VILLAGERS) if (Math.hypot(v.pos[0] - P.x, v.pos[1] - P.z) < 2.6) return { label: `Talk to ${v.name}`, act: () => talk(v.id) };
    if (Math.hypot(P.x, P.z) < 3.4) return { label: 'Rest at the Word Well (save · Archive)', act: () => { P.hp = save.maxHp; persist(); hud(); openArchive(); } };
    const g = lvl.gates.get('cipher');
    if (g && !g.open && Math.abs(P.x) < 5 && P.z > -66 && P.z < -61) return { label: 'Read the Cipher Gate', act: openCipher };
  }
  const s = nearestSigil(undefined, 3.2);
  if (s && !s.solved) return { label: `${s.def.label}. It waits for a song.`, act: () => toast(s.def.label, 'Press Q and play the song it wants.') };
  return null;
}

// ── dialogue ──
let dlg: DialogueRunner | null = null;
function talk(id: string) {
  const v = VILLAGERS.find((x) => x.id === id)!;
  dlg = new DialogueRunner(villagerGraph(v), {
    test: (c) => { const [k, a] = c.split(':'); return k === 'has' ? words.has(a) : k === 'freed' ? save.freed.includes(a) : k === 'met' ? save.met.includes(a) : false; },
    act: (a) => {
      const [k, who] = a.split(':');
      if (k === 'meet' && !save.met.includes(who)) { save.met.push(who); persist(); }
      if (k === 'free' && !save.freed.includes(who)) {
        save.freed.push(who); sfx.rescue();
        const vv = VILLAGERS.find((x) => x.id === who)!;
        if (vv.heart) { save.maxHp += 2; P.hp = save.maxHp; setTimeout(() => toast('♥ Your heart grows.', 'Oren’s courage is yours.'), 2600); }
        setTimeout(() => freeWord(vv.rewardWord), 1200);
        if (save.freed.length === VILLAGERS.length) bridge.unlockAchievement('lexicon_villagers');
        persist(); hud();
      }
    },
  });
  rules?.emit('talkedTo', { who: id });
  mode = 'dialog'; document.exitPointerLock?.();
  renderDialog(dlg.start());
}
function renderDialog(n: DialogueNode | null) {
  while (n && !n.text && dlg) n = dlg.next(); // routing nodes have no text
  if (!n || !dlg) { dlg = null; show('dialog', false); mode = 'play'; input.poll(0); return; } // drop the closing press so it can't reopen the talk
  show('dialog', true);
  $('dlgWho').textContent = n.who ?? '';
  $('dlgText').textContent = n.text;
  const box = $('dlgChoices'); box.innerHTML = '';
  (n.choices ?? []).forEach((c, i) => { const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = `<span class="key">${i + 1}</span>${c.label}`; b.onclick = () => renderDialog(dlg!.choose(i)); box.appendChild(b); });
  $('dlgMore').style.display = n.choices?.length ? 'none' : 'block';
}
addEventListener('keydown', (e) => {
  if (mode !== 'dialog' || !dlg) return;
  const n = dlg.current();
  if (n?.choices?.length && /^Digit[1-9]$/.test(e.code)) renderDialog(dlg.choose(Number(e.code.slice(5)) - 1));
  else if (!n?.choices?.length && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') && !e.repeat) renderDialog(dlg.next());
});

// ── lyre ──
let lyreSel = 0;
function openLyre() {
  mode = 'lyre'; inst.clear(); document.exitPointerLock?.();
  $('lyPhrase').innerHTML = '&nbsp;';
  const box = $('lySongs'); box.innerHTML = '';
  const songs = [...words].filter((w) => wordByText(w)?.power !== 'none');
  songs.forEach((w, i) => { const b = document.createElement('button'); b.className = 'btn' + (i === lyreSel ? ' on' : ''); b.textContent = `${w} · ${POWER_LABEL[wordByText(w)!.power]}`; b.onclick = () => autoPlay(w); box.appendChild(b); });
  show('lyre', true);
}
function closePanel() {
  for (const id of ['lyre', 'archive', 'cipher', 'pause']) show(id, false);
  mode = 'play'; engine.paused = false;
}
function lyreNote(letter: string) {
  sfx.note(letter);
  const r = inst.play(letter, performance.now() / 1000);
  const ph = $('lyPhrase'); ph.textContent = r.song ? r.song.id : r.buffer.join('') || ' ';
  ph.classList.toggle('off', !r.song && !inst.onTrack());
  if (r.song) { const id = r.song.id; setTimeout(() => { closePanel(); castSong(id); }, 450); }
}
function autoPlay(w: string) { [...w].forEach((c, i) => setTimeout(() => { if (mode === 'lyre') lyreNote(c); }, i * 190)); }

function castSong(w: string) {
  const def = wordByText(w); if (!def) return;
  sfx.song(); rules?.emit('songPlayed', { song: w }); bridge.creditXp(3);
  duckMusic(0.25, 0.3); setTimeout(() => { if (!boss) duckMusic(1, 1.5); }, 2600); // the Lyre's song over the score
  if (def.power === 'time' && lvl.id === 'glossa') {
    const day = save.tod > 0.25 && save.tod < 0.75; save.tod = day ? 0.02 : 0.5; persist();
    story(day ? 'The Song of Time pulls the night across the sky.' : 'The Song of Time calls the sun back.');
  }
  const s = nearestSigil(def.power, def.power === 'light' && lvl.id === 'temple' ? 22 : 7);
  if (s && !s.solved) { solveSigil(s); return; }
  if (def.power !== 'time') toast(`♪ ${w}`, 'The song rings out, but nothing here answers it.');
}

// ── archive ──
function openArchive() {
  mode = 'archive'; document.exitPointerLock?.();
  const grid = $('arGrid'); grid.innerHTML = '';
  for (const w of WORDS) {
    const d = document.createElement('div');
    const has = words.has(w.w);
    d.className = 'word' + (has ? '' : ' lost') + (has && w.power !== 'none' ? ' power' : '');
    d.innerHTML = has ? `<b>${w.w}</b><span class="v">${wordValue(w.w)}</span><div class="d">${w.def}${w.power !== 'none' ? ` · ${POWER_LABEL[w.power]}` : ''}</div>` : `<b>${'_ '.repeat(w.w.length)}</b><div class="d">lost to the Unwriting</div>`;
    grid.appendChild(d);
  }
  show('archive', true);
}

// ── cipher gate ──
let cipherSel = new Set<string>();
function openCipher() {
  if (words.size < 4) { toast('The gate stays silent.', `It wants at least 4 words to weigh. You carry ${words.size}.`); return; }
  if (!save.cipherTarget) { save.cipherTarget = makeSumTarget([...words].map(wordValue)); persist(); setGateSign(save.cipherTarget); }
  rules?.emit('enterZone', {}); // harmless; zone rules use the tick
  mode = 'cipher'; cipherSel = new Set(); document.exitPointerLock?.();
  renderCipher(); show('cipher', true);
}
function renderCipher() {
  const sum = [...cipherSel].reduce((s, w) => s + wordValue(w), 0);
  $('ciSum').innerHTML = `Σ <b>${sum}</b> &nbsp;/&nbsp; ${save.cipherTarget}`;
  const grid = $('ciGrid'); grid.innerHTML = '';
  for (const w of [...words].sort()) {
    const d = document.createElement('div'); d.className = 'word' + (cipherSel.has(w) ? ' sel' : '');
    d.innerHTML = `<b>${w}</b><span class="v">${[...w].map((c) => c.charCodeAt(0) - 64).join('+')} = ${wordValue(w)}</span>`;
    d.onclick = () => { cipherSel.has(w) ? cipherSel.delete(w) : cipherSel.add(w); sfx.note(w[0]); renderCipher(); };
    grid.appendChild(d);
  }
}
$('ciOpen').onclick = () => {
  const sum = [...cipherSel].reduce((s, w) => s + wordValue(w), 0);
  if (sum === save.cipherTarget) {
    closePanel(); openGate('cipher'); bridge.unlockAchievement('lexicon_cipher'); bridge.creditXp(40);
    rules?.emit('puzzleSolved', { kind: 'cipher' }); rules?.emit('gateOpened', { gate: 'cipher' });
  } else { sfx.wrong(); $('ciSum').innerHTML += `<div style="font-size:14px;color:#a33">The gate weighs ${save.cipherTarget}. Your words weigh ${sum}.</div>`; }
};
$('ciClose').onclick = closePanel;
$('pResume').onclick = closePanel;
$('howtoBtn').onclick = () => show('howto', true);
$('pHow').onclick = () => show('howto', true);
$('howtoClose').onclick = () => show('howto', false);
$('pExit').onclick = () => window.parent.postMessage({ type: 'plajah.exit' }, '*');

// ── the Redactor ──
type Task = { type: 'weight' | 'meaning' | 'sum'; k: number[]; text: string; struck: Set<number> };
let boss: Enemy | null = null;
let task: Task | null = null;
let blotT = 3, pillarCd = 0, bossRound = 0;
const ROUNDS: Task['type'][] = ['weight', 'meaning', 'weight', 'sum', 'sum'];
let pillarWords: string[] = [];
function startBoss(wave: number) {
  if (boss || save.templeDone || !lvl.arena) { if (save.templeDone) story('The hall is quiet. The Redactor is gone.'); return; }
  boss = spawnEnemy('redactor', lvl.arena.x, lvl.arena.z, wave);
  bossRound = 0; blotT = 3; sfx.boss(); duckMusic(0.3, 1.2);
  show('boss', true); story('“Every word you keep, I will strike out.” The Redactor descends.');
  nextRound(ROUNDS[0]);
}
function endBoss(won: boolean) {
  if (!boss && !task) return;
  show('boss', false); task = null; duckMusic(1, 2.5);
  if (lvl?.pillars) for (const p of lvl.pillars) setPillarLabel(p, '—');
  if (boss && !won) { scene.remove(boss.g); boss.alive = false; }
  boss = null;
}
function setPillarLabel(p: BuiltLevel['pillars'][number], text: string) {
  const parent = p.label.parent!; const pos = p.label.position.clone(); parent.remove(p.label);
  p.label = textSprite(text, { size: 56, color: '#ffe9a8', scale: 1, bg: 'rgba(10,8,20,.6)' }); p.label.position.copy(pos); parent.add(p.label);
}
function nextRound(type: Task['type']) {
  const pool = [...words].length >= 4 ? [...words] : WORDS.filter((w) => w.tier <= 2).map((w) => w.w);
  for (let tries = 0; tries < 40; tries++) {
    const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
    const v = pick.map(wordValue);
    if (new Set(v).size < 4) continue;
    if (type === 'sum') {
      const i = Math.floor(Math.random() * 4); let j = Math.floor(Math.random() * 3); if (j >= i) j++;
      const S = v[i] + v[j];
      let pairs = 0; for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (v[a] + v[b] === S) pairs++;
      if (pairs !== 1) continue;
      task = { type, k: [i, j], text: `Strike the two words that weigh ${S} together`, struck: new Set() };
    } else {
      const k = Math.floor(Math.random() * 4);
      task = { type, k: [k], text: type === 'weight' ? `Strike the word that weighs ${v[k]}` : `Strike the word that means “${wordByText(pick[k])!.def}”`, struck: new Set() };
    }
    pillarWords = pick;
    lvl.pillars.forEach((p, i) => setPillarLabel(p, pick[i]));
    $('bossTask').textContent = task.text;
    return;
  }
}
function strikePillar(i: number) {
  if (!boss || !task || pillarCd > 0) return;
  pillarCd = 0.5;
  if (task.k.includes(i) && !task.struck.has(i)) {
    task.struck.add(i); sfx.note(pillarWords[i][0]);
    if (task.struck.size < task.k.length) { toast(`${pillarWords[i]} · ${wordValue(pillarWords[i])}`, 'One more.'); return; }
    boss.hp -= 1; boss.flash = 0.4; sfx.boss(); engine.triggerHitstop(0.14);
    beam(lvl.pillars[i]);
    $('bossFill').style.width = `${(boss.hp / 5) * 100}%`;
    if (boss.hp <= 0) { bossDefeated(); return; }
    bossRound++; task = null; $('bossTask').textContent = '…';
    setTimeout(() => { if (boss) nextRound(ROUNDS[Math.min(bossRound, ROUNDS.length - 1)]); }, 1200);
  } else {
    sfx.wrong(); toast(`${pillarWords[i]} weighs ${wordValue(pillarWords[i])}.`, 'Wrong word. The Redactor lashes out.');
    hurt(1, boss.x, boss.z);
    eraseBurst(P.x, P.z, 6, 1);
    nextRound(task.type);
  }
}
function beam(p: BuiltLevel['pillars'][number]) {
  if (!boss) return;
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, 4, p.z), new THREE.Vector3(boss.x, 3, boss.z)]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8 })); scene.add(l);
  setTimeout(() => scene.remove(l), 350);
}
function bossDefeated() {
  if (!boss) return;
  const b = boss; b.state = 'dying'; b.t = 1.2;
  save.templeDone = true; save.maxHp += 2; P.hp = save.maxHp; persist();
  bridge.unlockAchievement('lexicon_redactor'); bridge.creditXp(150);
  endBoss(true);
  freeWord('LANGUAGE');
  rules?.enemyDown('redactor', b.wave);
}
function updateBoss(dt: number, t: number) {
  pillarCd = Math.max(0, pillarCd - dt);
  if (!boss || !lvl.arena) return;
  const a = t * 0.35;
  boss.x = lvl.arena.x + Math.sin(a) * 3; boss.z = lvl.arena.z + Math.cos(a) * 3; boss.y = 1.2 + Math.sin(t * 2) * 0.3;
  blotT -= dt;
  if (blotT <= 0) {
    blotT = boss.hp <= 2 ? 2.1 : 3.2;
    const dx = P.x - boss.x, dz = P.z - boss.z, d = Math.hypot(dx, dz) || 1;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), mat(0x050505, 0x000000));
    m.position.set(boss.x, 1.4, boss.z); scene.add(m);
    projectiles.push({ m, x: boss.x, z: boss.z, vx: (dx / d) * 9, vz: (dz / d) * 9, t: 4 });
  }
}

// ── rule host ──
const host: RuleHost = {
  showText: (t) => story(t),
  spawnWave: (count, who, wave) => {
    const spots = levelDef.markers.filter((m) => m.kind === 'enemySpot');
    const match = spots.filter((m) => m.name === who);
    const use = match.length ? match : spots;
    const kind = (['hushling', 'numeral', 'glyphmaw'].includes(who) ? who : 'hushling') as Kind;
    for (let i = 0; i < count; i++) { const m = use[i % Math.max(1, use.length)]; const p = m?.pos ?? [0, 0, -20]; const e = spawnEnemy(kind, p[0] + (i >= use.length ? 1.5 : 0), p[2], wave); e.state = 'chase'; }
  },
  spawnBoss: (who, wave) => { if (who === 'redactor') startBoss(wave); },
  giveItem: (item) => freeWord(item.toUpperCase()),
  setTimer: () => {},
  win: (next) => {
    if (next === 'temple' || next === 'glossa') { fade(() => loadLevel(next)); postToStudio({ type: 'levelEnd', result: 'won', next } as never); return; }
    postToStudio({ type: 'levelEnd', result: 'won' } as never);
    setTimeout(endCard, 2500);
  },
  lose: () => downed(),
  restartFromCheckpoint: () => downed(),
  unlockLevel: () => {},
  openGate: (g) => openGate(g),
  fired: (r, sentence) => { postToStudio({ type: 'rule', ruleId: r.id, sentence } as never); if (DEBUG) console.debug('[rule]', sentence); },
};

function endCard() {
  mode = 'end'; document.exitPointerLock?.();
  show('dialog', true);
  $('dlgWho').textContent = 'The Heart of Language';
  $('dlgText').textContent = `The Redactor is unwritten, and a little of the world remembers how to speak. You have preserved ${words.size} of ${WORDS.length} words. More are still out there, and the Unwriting is not finished.`;
  const box = $('dlgChoices'); box.innerHTML = '';
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Return to Glossa Hollow';
  b.onclick = () => { show('dialog', false); mode = 'play'; fade(() => loadLevel('glossa', [0, 0, -72], 0)); };
  box.appendChild(b); $('dlgMore').style.display = 'none';
}

// ── fade ──
let fading = false;
function fade(mid: () => void) {
  if (fading) return; fading = true;
  const f = $('fade'); f.style.opacity = '1';
  setTimeout(() => { mid(); f.style.opacity = '0'; setTimeout(() => { fading = false; }, 600); }, 600);
}

// ── sky ──
// Glossa: the physical sky, sky light and aerial haze (sky.ts). The temple: torchlight and dark.
let lexSky: LexSky | null = null;
let vegetation: VegetationScene | null = null;
/** The Forge-built Scribe (scribe.ts); until it loads, the stand-in figure plays. */
let scribe: ScribeModel | null = null;
let prevPX = 0, prevPZ = 0;
const playerPos = new THREE.Vector3();
function updateSky() {
  if (lvl.id !== 'glossa' || !lexSky) { scene.background = new THREE.Color(lvl.sky.day); return; }
  lexSky.update(save.tod, playerPos.set(P.x, P.y, P.z));
}

// ── the Unwriting, drawn (manuscript erasure field) ──
// Each Unwritten erases the world around it to sketch and paper; the island's edges are unwritten until
// enough words are saved; a wrong answer or the Redactor's strike leaves a white burst that fades.
const ERASE: Record<Kind, [number, number]> = { hushling: [6.5, 0.95], numeral: [4.5, 0.6], glyphmaw: [5.5, 0.8], redactor: [13, 0.7] };
const bursts: { x: number; z: number; r: number; a: number; t: number }[] = [];
function eraseBurst(x: number, z: number, r = 4, a = 1) { bursts.push({ x, z, r, a, t: 2.2 }); }
function updateErasure(dt: number) {
  const zones: ErasureZone[] = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    const [r, a] = ERASE[e.kind];
    const k = e.state === 'dying' ? Math.max(0, e.t / 0.6) : e.state === 'bound' ? 0.6 : 1;
    zones.push({ x: e.x, z: e.z, radius: r, amount: a * k, hole: true }); // the Unwritten keep their own ink form
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t -= dt;
    if (b.t <= 0) { bursts.splice(i, 1); continue; }
    zones.push({ x: b.x, z: b.z, radius: b.r, amount: b.a * Math.min(1, b.t / 1.2) });
  }
  zones.sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z));
  manuscript.setZones(zones);
  manuscript.setPaperLight(lvl.id === 'glossa' ? 0.22 + 0.78 * (lexSky?.light ?? 1) : 0.4);
  if (lvl.id === 'glossa') {
    const kept = words.size / WORDS.length;
    manuscript.setEdge(60 + kept * 20, 96, 0.92 * (1 - kept)); // the shore is unwritten; the hollow stays painted
  } else manuscript.setEdge(1e5, 1e5 + 1, 0);
}

// ── engine ──
let simT = 0;
const engine = new PlaykitEngine({
  fixedUpdate: (dt) => {
    simT += dt;
    if (mode !== 'play' && mode !== 'challenge') return;
    const night = lvl.id === 'glossa' && (save.tod < 0.23 || save.tod > 0.77);
    if (lvl.id === 'glossa') save.tod = (save.tod + dt / Number(levelDef.module.params.dayLengthSec ?? 360)) % 1;
    if (mode === 'play') updatePlayer(dt);
    updateEnemies(dt, night);
    updateBoss(dt, simT);
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]; p.t -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.m.position.set(p.x, 1.4, p.z);
      if (Math.hypot(p.x - P.x, p.z - P.z) < 0.9 && P.rollT <= 0) { hurt(1, p.x, p.z); p.t = 0; }
      if (p.t <= 0) { scene.remove(p.m); projectiles.splice(i, 1); }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]; p.t -= dt; p.m.rotation.y += dt * 3;
      if (Math.hypot(p.x - P.x, p.z - P.z) < 1.3) { P.hp = Math.min(save.maxHp, P.hp + 2); hud(); sfx.open(); p.t = 0; }
      if (p.t <= 0) { scene.remove(p.m); pickups.splice(i, 1); }
    }
    rules?.tick(dt, { player: [P.x, P.y, P.z], hp: P.hp });
    consumed = true;
  },
  render: (_alpha, frameDt) => {
    if (!lvl) return;
    // player pose
    P.g.position.set(P.x, P.y, P.z); P.g.rotation.y = P.yaw;
    const sw = Math.sin(P.walk * 2.2) * 0.5;
    P.g.getObjectByName('legL')!.rotation.x = sw; P.g.getObjectByName('legR')!.rotation.x = -sw;
    P.g.rotation.x = P.rollT > 0 ? (0.42 - P.rollT) * 15 : 0;
    P.quill.rotation.y = P.atkT > 0 ? -1.6 + (0.34 - P.atkT) * 9 : -0.3;
    P.quill.rotation.x = P.atkT > 0 ? 0.2 : 0.5;
    P.g.visible = P.inv <= 0 || Math.floor(simT * 20) % 2 === 0;
    if (scribe && frameDt > 0) {
      const speed = Math.hypot(P.x - prevPX, P.z - prevPZ) / frameDt;
      scribe.update(frameDt, P.rollT > 0 ? 0 : Math.min(speed, 8), P.atkT > 0 ? (0.34 - P.atkT) / 0.34 : 0, P.rollT > 0 ? (0.42 - P.rollT) / 0.42 : 0);
    }
    prevPX = P.x; prevPZ = P.z;
    // enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      e.g.position.set(e.x, e.y + (e.kind === 'redactor' ? 0 : Math.abs(Math.sin(simT * 4 + e.x)) * 0.15), e.z);
      e.g.rotation.y = yawTo(e.x, e.z, P);
      const s = e.state === 'windup' ? 1 + Math.sin(simT * 40) * 0.08 + 0.12 : e.state === 'dying' ? Math.max(0.01, e.t) : 1;
      e.g.scale.setScalar(s);
      const m = e.body.material as THREE.MeshStandardMaterial;
      m.emissive.setHex(e.flash > 0 ? 0xffffff : e.state === 'bound' ? 0xffd36a : e.state === 'windup' ? 0x661010 : e.angry > 0 ? 0x330000 : e.kind === 'numeral' ? 0x5a0808 : 0x000000);
      e.g.children.forEach((c) => { if (c.userData.spin) c.rotation.set(simT * 1.3, simT * 0.9, 0); });
      if (e.kind === 'redactor') e.g.children.forEach((c) => { if (c.userData.orbit !== undefined) { const a = simT * 1.4 + c.userData.orbit; c.position.set(Math.sin(a) * 2.2, 2 + Math.sin(a * 2) * 0.8, Math.cos(a) * 2.2); c.rotation.y = a; } });
    }
    // motes drift
    const mp = lvl.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < mp.count; i += 3) mp.setY(i, mp.getY(i) + Math.sin(simT + i) * 0.004);
    mp.needsUpdate = true;
    // camera
    cam.addLook(frame?.lookDeltaX ?? 0, frame?.lookDeltaY ?? 0);
    const lockP = P.lock ? new THREE.Vector3(P.lock.x, P.lock.y, P.lock.z) : null;
    cam.update(frameDt, new THREE.Vector3(P.x, P.y, P.z), { facingYaw: P.yaw, moving: Math.hypot(frame?.moveX ?? 0, frame?.moveY ?? 0) > 0.1, lockTarget: lockP, groundAt: lvl.heightAt, blocked: cameraBlocked });
    // reticle
    const ret = $('reticle');
    if (lockP) { const v = lockP.clone().setY(lockP.y + (P.lock!.kind === 'redactor' ? 5 : 2.6)).project(camera); ret.style.display = 'block'; ret.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; ret.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`; }
    else ret.style.display = 'none';
    updateSky();
    if (vegetation && lvl.id === 'glossa') vegetation.update(frameDt, [playerPos.set(P.x, P.y, P.z)], camera);
    updateErasure(frameDt);
    if (post) post.render(); else renderer.render(scene, camera);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRenderStats: () => { const r = renderer.info.render as any; return { drawCalls: r.drawCalls ?? r.calls ?? 0, triangles: r.triangles ?? 0 }; },
}, { fixedStepHz: 60, tier: PlaykitEngine.detectQualityTier({ hasWebGPU: 'gpu' in navigator, isMobile: /Android|iPhone|iPad/.test(navigator.userAgent) }) });

let last = performance.now();
let statT = 0;
function loop(now: number) {
  const dt = (now - last) / 1000; last = now;
  frameTick(dt);
  requestAnimationFrame(loop);
}
/** One display frame. Debug `step()` calls it directly: a hidden preview pane freezes rAF. */
function frameTick(dt: number) {
  readKeys();
  frame = input.poll(dt); consumed = false;
  handleModeInput();
  engine.paused = !(mode === 'play' || mode === 'challenge');
  engine.stepFrame(dt);
  if (engine.paused && lvl) engine.stepFrame(0); // keep drawing behind panels
  // challenge timer runs in real time
  if (ch) {
    ch.t -= dt; ($('chTimer') as HTMLElement).style.width = `${Math.max(0, ch.t / ch.total) * 100}%`;
    if (ch.t <= 0) answer(-1);
  }
  toastT -= dt;
  if (toastT <= 0) { const next = toastQueue.shift(); if (next) showToast(next[0], next[1]); else $('toast').style.opacity = '0'; }
  storyT -= dt; if (storyT <= 0) $('story').style.opacity = '0';
  if (lvl) {
    $('clock').textContent = clockText();
    const it = mode === 'play' ? interactable() : null;
    const pr = $('prompt'); pr.style.display = it ? 'block' : 'none'; if (it) pr.innerHTML = `<span class="key" style="background:rgba(255,255,255,.2)">E</span>${it.label}`;
    updateGuide(performance.now() / 1000);
    statT += dt; if (statT > 2) { statT = 0; postToStudio({ type: 'stats', frameMs: engine.budget.frameMs, draws: engine.budget.drawCalls, triangles: engine.budget.triangles } as never); }
  }
}

function handleModeInput() {
  const f = frame;
  if (mode === 'play') {
    if (f.pressed.interact || f.pressed.jump) { const it = interactable(); if (it) { it.act(); return; } if (f.pressed.jump) input.tapAction('dash'); }
    if (f.pressed.special) { openLyre(); return; }
    if (f.pressed.toggleView) { openArchive(); return; }
    if (f.pressed.pause) { mode = 'pause'; show('pause', true); document.exitPointerLock?.(); return; }
    if (f.pressed.item) cam.snapBehind(P.yaw);
  } else if (mode === 'challenge') {
    const lane = f.laneTaps[0];
    if (lane !== undefined) answer(({ 2: 0, 3: 1, 1: 2, 0: 3 } as Record<number, number>)[lane]);
  } else if (mode === 'lyre') {
    const songs = [...words].filter((w) => wordByText(w)?.power !== 'none');
    for (const lane of f.laneTaps) { if (lane === 3) lyreSel = (lyreSel + 1) % songs.length; if (lane === 0) lyreSel = (lyreSel + songs.length - 1) % songs.length; openLyre(); }
    if (f.pressed.jump) autoPlay(songs[lyreSel]);
    if (f.pressed.pause || f.pressed.dash) closePanel();
  } else if (mode === 'archive') {
    if (f.pressed.toggleView || f.pressed.pause || f.pressed.dash) closePanel();
  } else if (mode === 'cipher' || mode === 'pause') {
    if (f.pressed.pause || f.pressed.dash) closePanel();
  } else if (mode === 'dialog' && dlg) {
    const n = dlg.current();
    if (f.pressed.jump && !n?.choices?.length) renderDialog(dlg.next());
    const lane = f.laneTaps[0]; if (lane !== undefined && n?.choices?.length) renderDialog(dlg.choose(({ 2: 0, 3: 1, 1: 2, 0: 3 } as Record<number, number>)[lane] ?? 0));
    if (f.pressed.pause) { dlg = null; show('dialog', false); mode = 'play'; }
  }
}

// ── boot ──
async function boot() {
  const want = (new URLSearchParams(location.search).get('level') ?? 'glossa') as 'glossa' | 'temple';
  const startId = want === 'temple' ? 'temple' : 'glossa';
  const starter = project.levels.find((l) => l.id === startId)!;
  $('startBtn').textContent = 'Loading…';
  await renderer.init();
  // the photoreal half (AO, godrays, glyph bloom, grade, LUT) + the drawn half (manuscript stage)
  // graded toward the art: deep moss shade, warm key, glyph glow (identity §2–3)
  scene.userData.look = { bloomThreshold: 0.86, bloomStrength: 0.42, bloomRadius: 0.45, warm: 0.28, contrast: 1.18, toe: 0.12, aoRadius: 1.4, aoScale: 1.5, lutPreset: 'fable-warm', lutStrength: 0.6 };
  scene.userData.godrays = sun;
  // graphics profile by GPU adapter (canon; Rift Realm's gfx.ts pattern): 'intel' = the iGPU baseline (60 fps at a
  // scaled internal res + FSR, lean post, low-tier vegetation), 'high' = discrete GPUs, 'low' = phones. ?gfx= forces one.
  const tier = PlaykitEngine.detectQualityTier({ hasWebGPU: 'gpu' in navigator, isMobile: /Android|iPhone|iPad/.test(navigator.userAgent) });
  const adapterInfo = await (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string } } | null> } }).gpu?.requestAdapter().then((a) => a?.info).catch(() => undefined);
  const gfx = (QS.get('gfx') as 'low' | 'intel' | 'high' | null) ?? (tier === 'low' ? 'low' : adapterInfo?.vendor === 'intel' ? 'intel' : 'high');
  const lowTier = gfx !== 'high' || QS.has('lo');
  if (gfx !== 'high') renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  if (gfx === 'low') scene.userData.godrays = null;
  // shadows: one 2048 map riding with the Scribe (±45 m) so the godrays pass can read it — shafts through the canopy
  // are the art's signature. Cascades (?csm) carry shadows further but replace the single map godrays needs.
  sun.shadow.mapSize.setScalar(lowTier ? 1024 : 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 320 });
  sun.shadow.camera.updateProjectionMatrix();
  if (!lowTier && QS.has('csm')) {
    scene.userData.godrays = null;
    const csm = new CSMShadowNode(sun, { cascades: 3, maxFar: 160, mode: 'practical', lightMargin: 80 });
    csm.fade = true;
    sun.shadow.shadowNode = csm as never;
  }
  // the physical sky + sky light + aerial haze, then the forest grown from the art's species
  lexSky = createLexSky(scene, renderer, sun, hemi, stars, { lo: lowTier });
  lexSky.update(save.tod, playerPos.set(0, 0, 7));
  const glossa = builtCache.get('glossa') ?? buildGlossa(); builtCache.set('glossa', glossa);
  if (!QS.has('noveg') && glossa.treeSpots) {
    $('startBtn').textContent = 'Growing the forest…';
    vegetation = glossaVegetation(glossa.treeSpots, { lowTier, maxTrees: gfx === 'high' ? undefined : 100 });
    scene.add(vegetation.group);
    await vegetation.prepare(renderer, camera, { environment: scene.environment, envIntensity: 1 });
  }
  const joined = await joinStudio(starter, (l, n) => { studioLevels.set(l.id, l); names = { ...LEXICON_NAMES, ...n }; if (lvl?.id === l.id) loadLevel(l.id as 'glossa' | 'temple'); });
  if (joined) { studioLevels.set(joined.level.id, joined.level); names = { ...LEXICON_NAMES, ...joined.names }; }
  loadLevel(startId);
  // one plain frame first: the sun's shadow map only exists after it has rendered once, and the godrays pass reads it;
  // then compile every material now, so walking into a new tree LOD doesn't stall for seconds
  updateSky(); renderer.render(scene, camera);
  $('startBtn').textContent = 'Preparing…';
  await renderer.compileAsync(scene, camera).catch(() => {});
  post = QS.has('nopost') ? null : createPlaykitPostPipeline(renderer, scene, camera, {
    ao: gfx === 'high' && !QS.has('noao'), bloom: gfx === 'high' ? 'full' : 'lean', traa: gfx === 'high' && !QS.has('notraa'), fxaa: true, lut: true, lutPreset: 'fable-warm',
    internalScale: Number(QS.get('res')) || (gfx === 'high' ? 1 : gfx === 'intel' ? 0.6 : 0.5),
    stylize: (ctx) => manuscript.stylize(ctx),
  });
  if (DEBUG) console.info('[lexicon] backend', (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2', 'gfx', gfx, 'post', post?.activePasses);
  if (!QS.has('noscribe')) loadScribe().then((s) => {
    if (!s) return;
    scribe = s;
    for (const c of P.g.children) c.visible = false; // the stand-in steps aside
    P.g.add(s.root);
    if (DEBUG) console.info('[lexicon] the Scribe is here (Character Forge)');
  }).catch((e) => console.warn('[lexicon] Scribe model unavailable, keeping the stand-in:', e));
  $('startBtn').textContent = 'Begin';
  frame = input.poll(0);
  requestAnimationFrame(loop);
  const begin = () => {
    audioStart();
    playMusic(musicTracks(project.assets)[0]); // the main theme
    $('title').style.display = 'none'; mode = 'play'; canvas.focus();
    if (lvl.id === 'glossa' && !save.met.includes('elder')) setTimeout(() => talk('elder'), 700);
  };
  $('startBtn').onclick = begin;
  if (inStudio()) begin();
}
void boot();

if (DEBUG) (window as unknown as { __lex: unknown }).__lex = {
  get state() { return { scribe: !!scribe, mode, level: lvl?.id, P: { x: P.x, z: P.z, hp: P.hp }, words: [...words], enemies: enemies.filter((e) => e.alive).map((e) => ({ k: e.kind, x: e.x, z: e.z, s: e.state })), save, task: task?.text, budget: engine.budget, rules: rules?.log, move: frame ? [frame.moveX, frame.moveY] : null, keys: [...keys] }; },
  give: (...w: string[]) => w.forEach((x) => freeWord(x.toUpperCase())),
  step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frameTick(dt); },
  /** Render one frame and save the canvas to games/lexicon/review/<name> (dev server only). */
  // The WebGPU canvas can't be read back reliably (toDataURL returns the last frame the compositor presented, and a
  // hidden pane presents nothing), so the finished frame — post chain and all — is rendered into a render target
  // and read from the GPU.
  capture: async (name: string) => {
    frameTick(1 / 60);
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const rt = new THREE.RenderTarget(w, h, { type: THREE.UnsignedByteType });
    renderer.setRenderTarget(rt);
    if (post) post.render(); else renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h) as Uint8Array;
    rt.dispose();
    const rowBytes = px.length / h; // WebGPU pads rows to 256 bytes
    const flip = !(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend; // GL rows start at the bottom
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const g2 = c2.getContext('2d')!; const img = g2.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (flip ? h - 1 - y : y) * rowBytes;
      for (let x = 0; x < w; x++) { const s = src + x * 4, d = (y * w + x) * 4; img.data[d] = px[s]; img.data[d + 1] = px[s + 1]; img.data[d + 2] = px[s + 2]; img.data[d + 3] = 255; }
    }
    g2.putImageData(img, 0, 0);
    await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: c2.toDataURL('image/jpeg', 0.85) });
    return name;
  },
  burst: (r = 6) => eraseBurst(P.x, P.z + 6, r, 1),
  post: () => post?.activePasses,
  tp: (x: number, z: number) => { [P.x, P.z] = collide(x, z, 0.45); },
  /** Face (and put the camera behind) a yaw; 0 looks along +Z. */
  face: (yaw: number) => { P.yaw = yaw; cam.snapBehind(yaw); },
  /** Turnaround view: the Scribe faces `yaw`, the camera looks at him from `view` radians round (0 front, π/2 his left
   *  side, π back) at `dist` metres — compared against the art's turnaround (scripts/lexicon/shots.mjs). */
  portrait: (yaw: number, view = 0, dist = 3.4) => { P.yaw = yaw; cam.yaw = yaw + Math.PI + view; cam.pitch = 0.08; cam.distance = dist; cam.height = dist < 2 ? 1.55 : 0.9; cam.jump(); },
  load: (id: 'glossa' | 'temple') => loadLevel(id),
  hurtNearest: () => { const e = enemies.filter((x) => x.alive && x.kind !== 'redactor').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0]; if (e) { e.hp = 0; openChallenge(e); } },
  answer: (i: number) => answer(i),
  correct: () => ch?.c.answer,
  cast: (w: string) => castSong(w),
  talk: (id: string) => talk(id),
  strike: (i: number) => strikePillar(i),
  taskKeys: () => task?.k,
  setTod: (t: number) => { save.tod = t; },
  reset: () => { localStorage.removeItem(SAVE_KEY); location.reload(); },
};
