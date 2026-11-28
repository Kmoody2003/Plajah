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
import { makeSumTarget, subsetReaching, wordValue, type Challenge, type LexEntry } from '../../../playkit/learning/challenges';
import { RulePlayer, type RuleHost } from '../../../services/gamestudio/rulePlayer';
import { LEXICON_NAMES, lexiconProject } from '../../../services/gamestudio/projects/lexicon';
import type { GameLevel } from '../../../services/gamestudio/schema';
import { POWER_LABEL, WORDS, wordByText } from './words';
import { INFECTED_ZONES, STARTING_WORDS, VILLAGERS, WILD_WORDS, villagerGraph, type EnemyKind, type LevelId } from './content';
import { buildGlossa, buildTemple, creekDist, GLOSSA_BRIDGES, mat, PAL, personModel, textSprite, type BuiltLevel, type SigilView } from './world';
import { loadVillagerCast, type VillagerCast } from './villagers';
import { createLassoSystem } from './lasso';
import { buildCavern } from './cavern';
import { startMineCartRun, startRapidsRun, type SetPieceHUD, type SetPieceRunner } from './setpieces';
import { buildWilds, createGreatForestElk, type ElkCompanion } from './wilds';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { audioStart, createAmbientSoundscape, sfx } from './audio';
import { currentTrackTitle, duckMusic, ensureMusicPlaying, playPlaylist, playlistForRegion, setTrackListener, skipMusicTrack, toggleMusic } from './music';
import { buildLexiconChallenge, DIFFICULTY_LABEL, workedLetterSum, type CipherDifficulty } from './ciphers';
import { inStudio, joinStudio, postToStudio } from './studio';
import { nextStep, tipHtml, type GuideStep } from './guide';
import { createGamepadManager, type PadGlyphs, type PadSnapshot } from './gamepad';
import { createOnboarding } from './onboarding';

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
scene.fog = new THREE.Fog(0xcfe3ee, 40, 230);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 480);
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
const ambient = createAmbientSoundscape();
let audioUnlocked = false;
setTrackListener((title) => {
  const el = $('nowPlaying');
  if (el && title) el.textContent = `♪ ${title}`;
});
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

// ── day/night cycle timing (Kenne's exact rhythm) ──
// - NEVER loads at night: every session boots into bright sunlit morning (dayClockSec = 0 -> tod 0.36).
// - Bright sunlit daytime for 15 full minutes (0..900s: tod 0.36 -> 0.66).
// - Smooth sunset / twilight transition for 5 minutes (900..1200s: tod 0.66 -> 0.775).
// - Dark moonlit night for 8 minutes (1200..1680s: tod 0.775 -> 1.0 -> 0.225).
// - Smooth dawn sunrise back into morning for 2 minutes (1680..1800s: tod 0.225 -> 0.36).
const DAY_SEC = 15 * 60;      // 900s
const DUSK_SEC = 5 * 60;      // 300s
const NIGHT_SEC = 8 * 60;     // 480s
const DAWN_SEC = 2 * 60;      // 120s
const CYCLE_TOTAL_SEC = DAY_SEC + DUSK_SEC + NIGHT_SEC + DAWN_SEC; // 1800s

function todFromCycleSec(sec: number): number {
  const s = ((sec % CYCLE_TOTAL_SEC) + CYCLE_TOTAL_SEC) % CYCLE_TOTAL_SEC;
  if (s < DAY_SEC) return 0.36 + (s / DAY_SEC) * 0.30;
  if (s < DAY_SEC + DUSK_SEC) return 0.66 + ((s - DAY_SEC) / DUSK_SEC) * 0.115;
  if (s < DAY_SEC + DUSK_SEC + NIGHT_SEC) return (0.775 + ((s - DAY_SEC - DUSK_SEC) / NIGHT_SEC) * 0.45) % 1;
  return 0.225 + ((s - DAY_SEC - DUSK_SEC - NIGHT_SEC) / DAWN_SEC) * 0.135;
}

function currentDayPhase(): 'day' | 'dusk' | 'night' | 'dawn' {
  if (todManualOverride) {
    if (save.tod < 0.21 || save.tod > 0.78) return 'night';
    if (save.tod >= 0.66 && save.tod <= 0.78) return 'dusk';
    if (save.tod >= 0.21 && save.tod < 0.32) return 'dawn';
    return 'day';
  }
  const s = ((dayClockSec % CYCLE_TOTAL_SEC) + CYCLE_TOTAL_SEC) % CYCLE_TOTAL_SEC;
  if (s < DAY_SEC) return 'day';
  if (s < DAY_SEC + DUSK_SEC) return 'dusk';
  if (s < DAY_SEC + DUSK_SEC + NIGHT_SEC) return 'night';
  return 'dawn';
}

// ── persistent save / load ──
interface Save {
  words: string[]; freed: string[]; met: string[]; sigils: string[]; gates: string[];
  reclaimed: string[]; puzzles: string[]; lassoedFirst: boolean; elkUnlocked: boolean;
  tutorialDone: boolean; maxHp: number; cipherTarget: number; templeDone: boolean; tod: number;
  difficulty: CipherDifficulty; lastLevel: LevelId; lastPos: [number, number]; savedAt: number;
}
const SAVE_KEY = 'plajah.lexicon.save.v1';
const EXPLORABLE_LEVELS: LevelId[] = ['glossa', 'cavern', 'wilds', 'temple'];
const fresh = (): Save => ({
  words: [...STARTING_WORDS], freed: [], met: [], sigils: [], gates: [],
  reclaimed: [], puzzles: [], lassoedFirst: false, elkUnlocked: false,
  tutorialDone: false, maxHp: 6, cipherTarget: 0, templeDone: false, tod: todFromCycleSec(0),
  difficulty: 'scribe', lastLevel: 'glossa', lastPos: [0, 7], savedAt: 0,
});
let save: Save = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return fresh(); } })();
if (inStudio()) save = fresh(); // play-in-editor always starts clean
// NEVER load at night: always start every session in bright sunlit morning with a fresh 15-minute daylight window!
let dayClockSec = 0;
let todManualOverride = false;
save.tod = todFromCycleSec(0);
const words = new Set(save.words);
const onboarding = createOnboarding(Boolean(save.tutorialDone));
if (!save.tutorialDone) {
  if (save.met.includes('elder')) onboarding.state.talkedMira = true;
  if (save.lassoedFirst) onboarding.state.lassoedHome = true;
}
function hasSavedProgress(): boolean {
  return !inStudio() && (
    save.savedAt > 0 ||
    words.size > STARTING_WORDS.length ||
    save.freed.length > 0 ||
    save.met.length > 0 ||
    save.reclaimed.length > 0 ||
    save.puzzles.length > 0
  );
}
let saveBadgeT = 0;
let autoSaveClock = 0;
function persist(silent = false) {
  save.words = [...words];
  if (lvl && EXPLORABLE_LEVELS.includes(lvl.id) && !activeSetPiece) {
    save.lastLevel = lvl.id;
    save.lastPos = [Number(P.x.toFixed(2)), Number(P.z.toFixed(2))];
  }
  save.savedAt = Date.now();
  if (inStudio()) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
  bridge.emitSave(save as unknown as Record<string, unknown>);
  if (!silent) {
    saveBadgeT = 2.2;
    const sb = $('saveBadge');
    if (sb) sb.style.opacity = '0.92';
  }
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
let villagerCast: VillagerCast | null = null;
const lasso = createLassoSystem();
const elk: ElkCompanion = createGreatForestElk();
elk.bonded = save.elkUnlocked;
scene.add(elk.root);
let activeSetPiece: SetPieceRunner | null = null;
let cavernTimeSlowT = 0;

type Kind = EnemyKind;
interface Enemy {
  id: string; kind: Kind; x: number; z: number; y: number; hp: number; alive: boolean;
  state: 'idle' | 'chase' | 'windup' | 'lunge' | 'recover' | 'stun' | 'bound' | 'dying';
  t: number; tier: number; wave: number; zoneId?: string; g: THREE.Group; body: THREE.Mesh; home: [number, number];
  dir: [number, number]; angry: number; flash: number; wander: number;
}
const enemies: Enemy[] = [];
let eSeq = 0;

const P = {
  x: 0, y: 0, z: 7, yaw: Math.PI, hp: save.maxHp, inv: 0, rollT: 0, rollDir: [0, 1] as [number, number],
  atkT: 0, atkHit: false, lock: null as Enemy | null, fall: 0, walk: 0,
  // the Scribe (identity §4): leather armour, navy cloak, dark locs, brass quill-staff with a glowing cyan feather-blade
  g: personModel(PAL.leather, 0x6b4a35, 0x1a1410, { hair: true, legs: 0x2e2a26 }), quill: new THREE.Group(),
};
const standInBladeMat = new THREE.MeshStandardMaterial({ color: PAL.cyan, emissive: 0x5ef2f6, emissiveIntensity: 1.4, roughness: 0.2 });
// Shared pre-compiled Quill-Spear PointLight on P.g (works for BOTH Forge Scribe & stand-in with ZERO late shader recompile!)
const spearPointLight = new THREE.PointLight(0xaef7f2, 8, 24, 1.35);
spearPointLight.position.set(0.42, 1.9, 0.55);
spearPointLight.userData.keepVisible = true;
// Luminous cyan-gold 3D Crescent Slash Arc VFX (plays on EVERY Quill strike for both Forge Scribe & stand-in!)
const slashArcMat = new THREE.MeshBasicMaterial({
  color: 0xa6fcf8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
});
const slashArc = new THREE.Mesh(
  new THREE.RingGeometry(1.05, 2.25, 22, 1, -Math.PI * 0.42, Math.PI * 0.84).rotateX(-Math.PI / 2),
  slashArcMat,
);
slashArc.position.set(0, 1.25, 0.35);
slashArc.visible = false;
slashArc.userData.keepVisible = true;
{
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 8).rotateX(Math.PI / 2), mat(PAL.brass)); shaft.position.z = 0.35;
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.62, 8).rotateX(Math.PI / 2), standInBladeMat); blade.position.z = 1.55;
  P.quill.add(shaft, blade); P.quill.position.set(0.45, 1.05, 0.15); P.g.add(P.quill);
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.35, 14, 1, true), mat(PAL.navy)); cloak.position.set(0, 1.0, -0.08); P.g.add(cloak);
  const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16).rotateX(Math.PI / 2), mat(PAL.brass, 0x3a2a00)); compass.position.set(0.22, 0.85, 0.42); P.g.add(compass);
  P.g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  P.g.add(slashArc, spearPointLight);
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
// ── universal controller state (Xbox-style layout across Xbox, PlayStation, Nintendo & generic USB pads) ──
let usePadPrompts = false;
let padSnap: PadSnapshot;
const padMgr = createGamepadManager({
  onConnect: (g) => {
    usePadPrompts = true;
    toast(`🎮 ${g.name} Connected`, `${g.confirm} Talk/Jump · ${g.strike} Strike · ${g.rb} Lasso · ${g.lyre} Lyre`);
    refreshControlUI();
  },
  onDisconnect: () => {
    usePadPrompts = false;
    toast('Controller Disconnected', 'Switched back to Keyboard & Mouse.');
    refreshControlUI();
  },
});
padSnap = padMgr.poll(0);
const activePadGlyphs = (): PadGlyphs | null => (usePadPrompts || padSnap.connected ? padMgr.getActiveGlyphs() : null);

function renderPadMap() {
  const g = padMgr.getActiveGlyphs();
  const pref = padMgr.getStylePref();
  const prefLabel = pref === 'auto' ? `Auto (${g.name.replace(' Controller', '')})` : g.name;
  const rows: Array<[string, string]> = [
    [`${g.move} / ${g.look}`, 'Move & Orbit Camera'],
    [g.confirm, 'Talk · Interact · Jump / Leap Logs'],
    [g.cancel, 'Dodge Roll · Duck Trunks · Back'],
    [g.strike, 'Quill Strike · Elk Antler Surge'],
    [`${g.rb} / ${g.rt}`, 'Cast Word Lasso · Switch Rail Right'],
    [g.lt, 'Hold Lock-On · Switch Rail Left'],
    [g.lb, 'Cycle Target · Switch Rail Left'],
    [g.lyre, 'Open Lyre of Words (Songs)'],
    [`D-Pad ${g.dpadUp}`, 'Summon / Mount Great Forest Elk'],
    [`D-Pad ${g.dpadUp}${g.dpadRight}${g.dpadDown}${g.dpadLeft}`, 'Word & Math Challenge Answers'],
    [`D-Pad ${g.dpadDown} / ${g.dpadLeft}`, 'Toggle Guide / Toggle Music'],
    [`${g.r3} · ${g.select} · ${g.start}`, 'Recenter Cam · Archive · Pause'],
  ];
  const grid = $('padMapGrid');
  if (grid) grid.innerHTML = rows.map(([k, v]) => `<div><span class="key">${k}</span>${v}</div>`).join('');
  const b1 = $('pPadStyle'), b2 = $('howtoPadStyle'), st = $('padStatus');
  if (b1) b1.textContent = `Icons: ${prefLabel}`;
  if (b2) b2.textContent = `Button Icons: ${prefLabel}`;
  if (st) {
    st.textContent = padSnap.connected
      ? `🎮 ${g.name} Connected — Press ${g.confirm} or ${g.start} to Begin (${g.lyre} Controls)`
      : 'Plug in any Xbox, PlayStation, Nintendo Switch, or USB controller — ready anytime';
  }
}

function refreshControlUI() {
  renderPadMap();
  if (lvl) hud();
  const pg = usePadPrompts ? padMgr.getActiveGlyphs() : null;
  if (step) $('tip').innerHTML = tipHtml(step.tip, pg);
  const dm = $('dlgMore');
  if (dm) dm.textContent = pg ? `${pg.confirm} ▸` : 'E / Enter ▸';
}

function hud() {
  const pg = usePadPrompts ? padMgr.getActiveGlyphs() : null;
  let h = '';
  for (let i = 0; i < save.maxHp / 2; i++) { const v = P.hp - i * 2; h += `<span class="h" style="color:${v >= 2 ? '#ff5d6c' : v === 1 ? '#ffaab3' : 'rgba(255,255,255,.25)'}">${v >= 1 ? '♥' : '♡'}</span>`; }
  $('hearts').innerHTML = h;
  $('langN').textContent = String(words.size); $('langT').textContent = String(WORDS.length);
  $('langFill').style.width = `${(words.size / WORDS.length) * 100}%`;
  const songs = [...words].filter((w) => wordByText(w)?.power !== 'none');
  const lyreKey = pg ? pg.lyre : 'Q';
  const lassoKey = pg ? pg.rb : 'C';
  $('songs').innerHTML = `Songs <b>${songs.join(' · ')}</b> &nbsp;<span class="key" style="background:rgba(255,255,255,.15)">${lyreKey}</span> &nbsp; Lasso <span class="key" style="background:rgba(255,255,255,.15)">${lassoKey}</span>`;
  $('level').textContent = lvl?.name ?? levelDef?.name ?? '';
  $('level').style.display = activeSetPiece ? 'none' : 'block';
  const eb = $('elkBadge');
  if (save.elkUnlocked && lvl?.outdoor && !activeSetPiece) {
    eb.style.display = 'block';
    const elkKey = pg ? `D-Pad ${pg.dpadUp}` : 'V';
    const leapKey = pg ? pg.confirm : 'Space';
    const surgeKey = pg ? pg.strike : 'J';
    eb.innerHTML = elk.mounted
      ? `✦ Riding Great Forest Elk · <span class="key" style="background:rgba(255,255,255,.2)">${elkKey}</span> Dismount · <span class="key" style="background:rgba(255,255,255,.2)">${leapKey}</span> Leap · <span class="key" style="background:rgba(255,255,255,.2)">${surgeKey}</span> Antler Surge`
      : `✦ Great Forest Elk Ready · <span class="key" style="background:rgba(255,255,255,.2)">${elkKey}</span> Summon &amp; Mount`;
  } else {
    eb.style.display = 'none';
  }
}
function renderSetPieceHud(h: SetPieceHUD | null) {
  const el = $('setpiece');
  if (!h) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  $('spTitle').textContent = h.title;
  $('spLandmark').textContent = h.landmark;
  $('spBarFill').style.width = `${Math.round(h.progress * 100)}%`;
  $('spHint').textContent = h.hint;
  const pr = $('spPrompt');
  if (h.prompt) {
    pr.style.display = 'block';
    $('spPromptQ').textContent = h.prompt.text;
    $('spLeft').textContent = h.prompt.leftLabel;
    $('spRight').textContent = h.prompt.rightLabel;
  } else {
    pr.style.display = 'none';
  }
}
function clockText() {
  if (activeSetPiece || !lvl?.outdoor) return '';
  const hrs = (save.tod * 24) % 24, hh = Math.floor(hrs), mm = Math.floor((hrs - hh) * 60);
  const s = ((dayClockSec % CYCLE_TOTAL_SEC) + CYCLE_TOTAL_SEC) % CYCLE_TOTAL_SEC;
  const label = todManualOverride
    ? (save.tod < 0.23 || save.tod > 0.77 ? '☾ Night' : '☀ Day')
    : s < DAY_SEC ? '☀ Day' : s < DAY_SEC + DUSK_SEC ? '🌅 Dusk' : s < DAY_SEC + DUSK_SEC + NIGHT_SEC ? '☾ Night' : '🌄 Dawn';
  return `${label} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
const show = (id: string, v: boolean) => { $(id).style.display = v ? 'block' : 'none'; };

function onOnboardAdvance(advanced: boolean) {
  if (!advanced) return;
  sfx.rescue();
  padMgr.rumble(0.16, 0.36, 95);
  if (!onboarding.active && !save.tutorialDone) {
    save.tutorialDone = true;
    persist();
    toast('✦ Scribe Training Complete!', 'Explore Glossa Hollow, reclaim Infected Zones & follow the creek west to the Waterfall!');
  }
  updateCoach();
}

function updateCoach() {
  const el = $('coach');
  if (!el) return;
  if (!onboarding.active || activeSetPiece || !lvl || lvl.id !== 'glossa' || mode !== 'play') {
    el.style.display = 'none';
    return;
  }
  const nearEnemy = enemies.find((e) => e.alive && e.state !== 'dying');
  const v = onboarding.view(usePadPrompts ? padMgr.getActiveGlyphs() : null, nearEnemy ? [nearEnemy.x, nearEnemy.z] : undefined);
  if (!v) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.classList.toggle('celebrate', onboarding.celebrating);
  $('coachTitle').textContent = `${v.title} (${v.stepIndex} / ${v.totalSteps})`;
  $('coachAction').innerHTML = v.actionHtml;
  $('coachSub').textContent = v.sub;
  $('coachFill').style.width = `${Math.round(v.progress * 100)}%`;
  const chks = $('coachChecks');
  if (v.checks?.length) {
    chks.style.display = 'flex';
    chks.innerHTML = v.checks.map((c) => `<span class="coach-chk${c.done ? ' done' : ''}">${c.done ? '✓ ' : '○ '}${c.label}</span>`).join('');
  } else {
    chks.style.display = 'none';
    chks.innerHTML = '';
  }
}

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
  level: (activeSetPiece?.kind ?? lvl?.id ?? 'glossa') as LevelId,
  words, starting: STARTING_WORDS, freed: save.freed, met: save.met, sigils: save.sigils, gates: save.gates,
  reclaimed: save.reclaimed, puzzles: save.puzzles, lassoedFirst: save.lassoedFirst, elkUnlocked: save.elkUnlocked,
  templeDone: save.templeDone,
  songs: [...words].map((w) => ({ w, power: wordByText(w)?.power ?? 'none' })).filter((s) => s.power !== 'none'),
  enemies: enemies.filter((e) => e.alive && e.state !== 'bound' && e.state !== 'dying').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)).map((e) => ({ kind: e.kind, x: e.x, z: e.z })),
  player: [P.x, P.z] as [number, number],
});
const _bp = new THREE.Vector3();
function updateGuide(t: number) {
  updateCoach();
  const coachActive = onboarding.active && lvl?.id === 'glossa' && !activeSetPiece && mode === 'play';
  const nearEnemy = enemies.find((e) => e.alive && e.state !== 'dying');
  const coachView = coachActive ? onboarding.view(usePadPrompts ? padMgr.getActiveGlyphs() : null, nearEnemy ? [nearEnemy.x, nearEnemy.z] : undefined) : null;

  const next = !activeSetPiece && lvl && mode !== 'title' ? nextStep(guideState()) : null;
  if (next?.id !== step?.id) {
    // a new goal: say it once, then keep it on the HUD
    if (step && next && mode === 'play' && !coachActive) { sfx.note('E'); toast('New goal', next.goal); }
    $('tip').innerHTML = next ? tipHtml(next.tip, usePadPrompts ? padMgr.getActiveGlyphs() : null) : '';
  }
  step = next;
  const playing = mode === 'play' && guideOn && (!!step || coachActive);
  const q = $('quest');
  q.style.display = step && mode !== 'title' && !coachActive ? 'block' : 'none';
  $('tip').style.display = playing && !coachActive ? 'block' : 'none';
  if (step) {
    const d = step.at ? Math.round(Math.hypot(step.at[0] - P.x, step.at[1] - P.z)) : 0;
    q.innerHTML = `◆ ${step.goal}${step.at && d > 3 ? ` <span class="m">${d} m</span>` : ''}`;
  }
  // the beacon stands at the onboarding target (while learning) or the next open-world goal
  const targetAt = coachView ? coachView.beaconAt : step?.at;
  const arrow = $('waypoint');
  if (!playing || !targetAt) { beacon.visible = false; arrow.style.display = 'none'; return; }
  const [x, z] = targetAt;
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
  if (audioUnlocked) ensureMusicPlaying();
  if (usePadPrompts) { usePadPrompts = false; refreshControlUI(); }
  if (e.code === 'Tab') e.preventDefault();
  if (mode === 'lyre' && /^Key[A-Z]$/.test(e.code) && e.code !== 'KeyQ') { lyreNote(e.code.slice(3)); return; }
  if (mode === 'lyre' && e.code === 'KeyQ' && !e.repeat) { lyreNote('Q'); return; }
  if (mode === 'challenge' && /^Digit[1-4]$/.test(e.code)) { answer(Number(e.code.slice(5)) - 1); return; }
  if (e.repeat) return;
  if (e.code === 'KeyM' && mode !== 'lyre') { toast('Music', toggleMusic() ? `On · ♪ ${currentTrackTitle()}` : 'Off'); return; }
  if (e.code === 'KeyN' && mode !== 'lyre') { const next = skipMusicTrack(); toast('♪ Now Playing', next); return; }
  if (e.code === 'KeyG' && mode !== 'lyre') { guideOn = !guideOn; localStorage.setItem('lexicon_guide', guideOn ? '1' : '0'); toast('Guide', guideOn ? 'On' : 'Off · the goal stays at the top left'); return; }
  if ((e.code === 'KeyC' || e.code === 'KeyL') && mode === 'play' && !activeSetPiece) { fireWordLasso(); return; }
  if (e.code === 'KeyV' && mode === 'play' && !activeSetPiece) { toggleElkMount(); return; }
  keys.add(e.code);
  const a = keyAction[e.code]; if (a) input.setAction(a, true);
});
addEventListener('pointerdown', () => { if (audioUnlocked) ensureMusicPlaying(); }, { passive: true });
addEventListener('keyup', (e) => { keys.delete(e.code); const a = keyAction[e.code]; if (a) input.setAction(a, false); });
canvas.addEventListener('mousedown', (e) => {
  if (audioUnlocked) ensureMusicPlaying();
  if (usePadPrompts) { usePadPrompts = false; refreshControlUI(); }
  if (mode !== 'play') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); }
  if (e.button === 0) input.setAction('melee', true);
  if (e.button === 2) input.setAction('altFire', true);
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.setAction('melee', false); if (e.button === 2) input.setAction('altFire', false); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) input.addLookDelta(e.movementX, e.movementY, 'keyboard-mouse'); });

// a key released while the window was away (alt-tab, another pane) never sends its keyup: let everything go on blur
function releaseAll() {
  for (const code of keys) { const a = keyAction[code]; if (a) input.setAction(a, false); }
  keys.clear(); input.setAction('melee', false); input.setAction('altFire', false);
  input.setMoveStick(0, 0, 'keyboard-mouse');
}
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

let padLT = false;
function readKeys(dt: number) {
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  padSnap = padMgr.poll(dt);

  if (padSnap.anyInput) {
    if (audioUnlocked) ensureMusicPlaying();
    if (!usePadPrompts) {
      usePadPrompts = true;
      refreshControlUI();
    }
  }

  const padMoving = padSnap.connected && (Math.abs(padSnap.moveX) > 0.05 || Math.abs(padSnap.moveY) > 0.05);
  // Keyboard wins while WASD is held; controller drives smooth analog motion ONLY in play mode when engaged
  if (mode !== 'play') input.setMoveStick(0, 0, 'keyboard-mouse');
  else if (x || y) input.setMoveStick(x, y, 'keyboard-mouse');
  else if (padMoving) input.setMoveStick(padSnap.moveX, padSnap.moveY, 'gamepad');
  else input.setMoveStick(0, 0, 'keyboard-mouse');

  const lx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), ly = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
  if (lx || ly) input.addLookDelta(lx * 9, ly * 6, 'keyboard-mouse');
  if (padSnap.connected && (Math.abs(padSnap.lookX) > 0.02 || Math.abs(padSnap.lookY) > 0.02)) {
    input.addLookDelta(padSnap.lookX * 1250 * dt, padSnap.lookY * 920 * dt, 'gamepad');
  }

  // Feed Xbox-style normalized controller actions into UnifiedInputBuffer (works across Xbox, PlayStation, Switch & generic USB pads!)
  if (padSnap.connected) {
    if (padSnap.pressed.confirm) input.tapAction('jump', 'gamepad');
    if (padSnap.pressed.cancel && !elk.mounted) input.tapAction('dash', 'gamepad');
    if (padSnap.pressed.strike) input.tapAction('melee', 'gamepad');
    if (padSnap.pressed.lyre) input.tapAction('special', 'gamepad');
    if (padSnap.pressed.lb) input.tapAction('cycleSlot', 'gamepad');
    if (padSnap.pressed.select) input.tapAction('toggleView', 'gamepad');
    if (padSnap.pressed.start) input.tapAction('pause', 'gamepad');
    if (padSnap.pressed.r3) input.tapAction('item', 'gamepad');
    if (padSnap.pressed.left) input.setLane(0, true, 'gamepad'); else input.setLane(0, false, 'gamepad');
    if (padSnap.pressed.down) input.setLane(1, true, 'gamepad'); else input.setLane(1, false, 'gamepad');
    if (padSnap.pressed.up) input.setLane(2, true, 'gamepad'); else input.setLane(2, false, 'gamepad');
    if (padSnap.pressed.right) input.setLane(3, true, 'gamepad'); else input.setLane(3, false, 'gamepad');
    if (padSnap.held.lt !== padLT) {
      padLT = padSnap.held.lt;
      input.setAction('altFire', padLT, 'gamepad');
    }
  } else if (padLT) {
    padLT = false;
    input.setAction('altFire', false, 'gamepad');
  }
}

// ── levels ──
function startLevelDef(id: string): GameLevel {
  return studioLevels.get(id) ?? structuredClone(project.levels.find((l) => l.id === id) ?? project.levels[0]!);
}

/** Spawn denser Unwritten packs inside every un-reclaimed Infected Zone for this level. */
function spawnInfectedPacksFor(id: LevelId) {
  for (const z of INFECTED_ZONES) {
    if (z.level !== id || save.reclaimed.includes(z.id)) continue;
    const n = z.enemies.length;
    z.enemies.forEach((kind, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
      const rad = n === 1 ? 0 : Math.min(z.radius * 0.48, 5.5 + (i % 2) * 2.5);
      const ex = z.pos[0] + Math.cos(a) * rad;
      const ez = z.pos[1] + Math.sin(a) * rad;
      const e = spawnEnemy(kind, ex, ez, 0, z.id);
      if (z.triggersElk) e.state = 'chase';
    });
  }
}

function checkZoneReclaimed(zoneId?: string) {
  if (!zoneId || save.reclaimed.includes(zoneId)) return;
  const remaining = enemies.some((e) => e.alive && e.state !== 'dying' && e.zoneId === zoneId);
  if (remaining) return;
  const def = INFECTED_ZONES.find((z) => z.id === zoneId);
  if (!def) return;
  save.reclaimed.push(zoneId);
  persist();
  spawnReclaimBloom(def.pos[0], def.pos[1], def.radius);
  sfx.cleanse();
  padMgr.rumble(0.42, 0.3, 220);
  bridge.creditXp(50);
  toast(`✦ Reclaimed: ${def.name}!`, 'Living colour blooms back across the erased land.');
  setTimeout(() => freeWord(def.rewardWord), 900);
  if (def.triggersElk && !elk.visible) {
    elk.summonRescue(P.x, P.z - 8, lvl.heightAt);
    sfx.elkCall();
    story('Out of the mist steps the Great Forest Elk! Its cyan antlers glow — approach and press E to bond.');
  }
}

/** Fire the Scribe's luminous cyan Word Lasso (C / L): catches wild words, pulls grapple rings, or stuns enemies. */
function fireWordLasso() {
  if (!lvl) return;
  sfx.lasso();
  const res = lasso.cast(
    P.x, P.y + (elk.mounted ? 1.4 : 0), P.z, P.yaw,
    (wdef) => {
      sfx.catchWord();
      freeWord(wdef.word);
      // "Combat triggers after they lasso their first word" (Kenne's confirmed design!)
      if (!save.lassoedFirst) {
        save.lassoedFirst = true;
        persist();
        if (lvl.id === 'glossa') {
          spawnInfectedPacksFor('glossa');
          // Spawn a lone Scout Hushling right on the square's east lawn so Step 5 combat training is immediately in view!
          spawnEnemy('hushling', 12, -2, 0);
          spawnEnemy('hushling', -18, 20, 0);
          eraseBurst(12, -2, 10, 1);
          sfx.boss();
          padMgr.rumble(0.4, 0.35, 160);
          story('The Unwriting hears your first word! A Scout Hushling bleaches the east lawn — strike it to rescue its word!');
        }
      }
      if (wdef.isFirstTutorial || wdef.word === 'HOME') onOnboardAdvance(onboarding.recordLassoHome());
    },
    (anchor) => {
      sfx.open();
      toast(`Lassoed ${anchor.label}!`);
    },
    (tx, tz) => {
      for (const e of enemies) {
        if (!e.alive || e.state === 'bound' || e.state === 'dying' || e.kind === 'redactor') continue;
        if (Math.hypot(e.x - tx, e.z - tz) < 5.5) {
          e.state = 'stun'; e.t = 1.2; e.flash = 0.25;
          sfx.hit();
          toast('Lasso yank!', 'Enemy staggered — strike with J!');
          return true;
        }
      }
      return false;
    },
  );
  if (!res.hit) toast('Word Lasso', 'Aim toward a glowing wild word, puzzle ring, or nearby Unwritten.');
}

function toggleElkMount() {
  if (!save.elkUnlocked) {
    toast('Great Forest Elk', 'Explore behind the waterfall and survive the Forest Rapids to meet the Antlered Word-Keeper.');
    return;
  }
  if (!lvl?.outdoor) {
    toast('Too tight indoors', 'The Great Forest Elk waits outside in the valley or wildwood.');
    return;
  }
  if (elk.mounted) {
    elk.mounted = false;
    P.x = elk.x + Math.cos(elk.yaw) * 2.2;
    P.z = elk.z - Math.sin(elk.yaw) * 2.2;
    P.y = lvl.heightAt(P.x, P.z);
    P.g.visible = true;
    sfx.open();
  } else {
    elk.visible = true;
    elk.bonded = true;
    elk.mounted = true;
    elk.x = P.x; elk.z = P.z; elk.yaw = P.yaw;
    elk.root.visible = true;
    sfx.elkCall();
    toast('✦ Mounted the Great Forest Elk', 'Space to leap logs · J Antler Surge · C Word Lasso');
  }
  hud();
}

function buildLevelById(id: LevelId): BuiltLevel {
  if (id === 'glossa') return buildGlossa();
  if (id === 'temple') return buildTemple();
  if (id === 'cavern') {
    return buildCavern({
      hasPuzzle: (pid) => save.puzzles.includes(pid),
      completePuzzle: (pid, rewardWord, line) => {
        if (!save.puzzles.includes(pid)) { save.puzzles.push(pid); persist(); }
        sfx.cleanse();
        story(line);
        setTimeout(() => freeWord(rewardWord), 800);
      },
      openAcademiaQuiz: (opts) => openCustomQuiz(opts),
      toast,
      playSfx: (name) => sfx[name](),
    });
  }
  return buildWilds({
    isElkUnlocked: () => save.elkUnlocked,
    onPetElk: () => {
      if (!save.elkUnlocked) {
        save.elkUnlocked = true; elk.bonded = true; elk.bowing = false; persist();
        sfx.cleanse(); sfx.elkCall();
        toast('✦ Companion Unlocked: Great Forest Elk!', 'Press V anytime outdoors to mount, leap logs & hunt wild words!');
        toggleElkMount();
      }
    },
    onConstellationShrine: () => {
      if (save.puzzles.includes('wilds-constellation')) {
        toast('Constellation Ruin Restored', 'Zora’s star bearings shine steady above the aqueduct.');
        return;
      }
      openCustomQuiz({
        id: 'wilds-constellation',
        kind: 'Overgrown Astronomer’s Ruin · Geometry',
        prompt: 'A triangle’s interior angles sum to 180°. Two angles are 65° and 45°. Third angle?',
        sub: 'Align Zora’s brass star-ring in the ancient wildwood ruins.',
        choices: ['60°', '70°', '75°', '80°'],
        answer: 1,
        onPass: () => {
          if (!save.puzzles.includes('wilds-constellation')) { save.puzzles.push('wilds-constellation'); persist(); }
          sfx.cleanse();
          story('Starlight links the overgrown stone arches!');
          setTimeout(() => freeWord('COMPASS'), 700);
        },
      });
    },
  });
}

function loadLevel(id: LevelId, at?: [number, number, number], yaw?: number) {
  if (activeSetPiece) { activeSetPiece.dispose(scene); activeSetPiece = null; }
  renderSetPieceHud(null);
  if (lvl) scene.remove(lvl.group);
  for (const e of enemies) scene.remove(e.g);
  enemies.length = 0; projectiles.forEach((p) => scene.remove(p.m)); projectiles.length = 0; pickups.forEach((p) => scene.remove(p.m)); pickups.length = 0;
  endBoss(false);
  elk.mounted = false;
  P.g.visible = true;
  cavernTimeSlowT = 0;

  // Milestone 3: High-energy playable 3D Set-Pieces (Mine-Cart Escape & Forest Rapids Run!)
  if (id === 'minecart' || id === 'rapids') {
    if (!save.puzzles.includes('cavern-cart-done')) { save.puzzles.push('cavern-cart-done'); persist(); }
    P.g.visible = false;
    elk.visible = false; elk.root.visible = false;
    vegetation && (vegetation.group.visible = false);
    lasso.dispose(scene);
    lexSky?.setActive(id === 'rapids');
    sun.visible = id === 'rapids'; stars.visible = false;
    const spCb = {
      onDamage: (n: number, reason: string) => {
        P.hp = Math.max(1, P.hp - n); hud();
        toast(reason);
      },
      onWordBonus: (w: string) => freeWord(w),
      onComplete: (next: 'rapids' | 'wilds') => {
        fade(() => loadLevel(next));
      },
      onSfx: (name: 'railSwitch' | 'splash' | 'hit' | 'rescue' | 'lasso' | 'wrong') => sfx[name](),
      onHud: renderSetPieceHud,
    };
    activeSetPiece = id === 'minecart' ? startMineCartRun(scene, spCb) : startRapidsRun(scene, spCb);
    if (audioUnlocked) playPlaylist(playlistForRegion(project.assets, id), id, 1.5);
    hud();
    return;
  }

  clearReclaimBlooms();
  lvl = builtCache.get(id) ?? buildLevelById(id);
  builtCache.set(id, lvl);
  batchLevel(lvl);
  scene.add(lvl.group);
  levelDef = startLevelDef(id);
  for (const [gid, g] of lvl.gates) if (save.gates.includes(gid) && !g.open) openGate(gid, true);
  for (const [sid, s] of lvl.sigils) s.setSolved(save.sigils.includes(sid));
  if (lvl.id === 'glossa' && save.cipherTarget) setGateSign(save.cipherTarget);

  const defaultSpawns: Record<string, [number, number, number]> = {
    glossa: [0, 0, 7], cavern: [0, 0, 12], wilds: [-18, 0, 105], temple: [0, 0, -4],
  };
  const spawn = levelDef.id === id ? levelDef.markers.find((m) => m.kind === 'spawn') : undefined;
  const p = at ?? spawn?.pos ?? defaultSpawns[id] ?? [0, 0, 0];
  P.x = p[0]; P.z = p[2]; P.y = lvl.heightAt(P.x, P.z); P.yaw = yaw ?? spawn?.yaw ?? Math.PI; P.lock = null; P.fall = 0;
  cam.snapBehind(P.yaw); cam.jump();

  // Load all 12 Character Forge villagers progressively in Glossa Hollow!
  if (id === 'glossa' && !villagerCast) {
    villagerCast = loadVillagerCast(VILLAGERS, lvl.villagers, (vid) => {
      if (DEBUG) console.info('[lexicon] Character Forge villager ready:', vid);
    });
  }

  // Spawn Wild Words + Grapple Anchors for the Word Lasso
  lasso.setLevel(scene, WILD_WORDS.filter((w) => w.level === id), words, lvl.heightAt, lvl.grappleAnchors);

  // Combat triggers ONLY AFTER they lasso their first word in Glossa Hollow!
  if (id === 'glossa') {
    if (save.lassoedFirst) {
      spawnInfectedPacksFor('glossa');
      for (const m of levelDef.markers.filter((m) => m.kind === 'enemySpot').slice(0, 4)) {
        spawnEnemy((m.name as Kind) || 'hushling', m.pos[0], m.pos[2], 0);
      }
    }
  } else if (id === 'cavern') {
    spawnInfectedPacksFor('cavern');
    // Subterranean creatures patrolling between vaults (V00 Lurker, V01 Cavern Beast, V02 Rock Golem!)
    spawnEnemy('lurker', -6, -44, 0);
    spawnEnemy('cavern_beast', 6, -114, 0);
  } else if (id === 'wilds') {
    spawnInfectedPacksFor('wilds');
    if (save.elkUnlocked) {
      elk.visible = true; elk.bonded = true; elk.bowing = false;
      elk.x = P.x + 4; elk.z = P.z - 4; elk.y = lvl.heightAt(elk.x, elk.z); elk.root.visible = true;
    } else if (save.reclaimed.includes('wilds-river-ambush')) {
      elk.summonRescue(-18, 86, lvl.heightAt);
    } else {
      elk.visible = false; elk.root.visible = false;
      story('You wash ashore beside the splintered wreckage. Hushlings close in from the white-paper clearing — fight or sing LIGHT!');
    }
  }

  // Show Great Forest Elk companion in Glossa Hollow too once bonded!
  if (id === 'glossa' && save.elkUnlocked) {
    elk.visible = true; elk.bonded = true; elk.bowing = false;
    elk.x = 11; elk.z = 11; elk.y = lvl.heightAt(11, 11); elk.root.visible = true;
  } else if (!lvl.outdoor) {
    elk.visible = false; elk.root.visible = false;
  }

  sun.visible = lvl.outdoor; stars.visible = lvl.outdoor;
  vegetation && (vegetation.group.visible = id === 'glossa');
  if (lvl.outdoor && lexSky) lexSky.setActive(true);
  else {
    lexSky?.setActive(false);
    scene.fog = new THREE.Fog(lvl.sky.fog, lvl.sky.fogNear, lvl.sky.fogFar);
    scene.background = new THREE.Color(lvl.sky.day);
    hemi.intensity = id === 'cavern' ? 0.95 : 0.75;
    hemi.color.set(id === 'cavern' ? 0x9cd8e8 : 0x9a8cc8);
  }
  rules = (id === 'glossa' || id === 'temple')
    ? new RulePlayer(levelDef.rules, levelDef.zones, host, (k, i) => names[`${k}:${i}`])
    : null;
  rules?.start();
  if (audioUnlocked) playPlaylist(playlistForRegion(project.assets, id), id, 1.8);
  if (mode !== 'title' && EXPLORABLE_LEVELS.includes(id)) persist(true);
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
  } else if (kind === 'lurker') {
    // Pale bioluminescent crystal cave stalker (S03 / V00 — auto-upgrades to lurker.glb when built!)
    const standIn = new THREE.Group();
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.05, 6, 12), own(0xc8dfe4)); body.position.y = 1.05;
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), mat(PAL.cyan, 0x3ef0f6));
      sp.scale.set(0.5, 2.0, 0.5); sp.position.set(0, 1.35 - i * 0.25, -0.34); standIn.add(sp);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.2, 6).rotateX(-Math.PI / 2), mat(0xb0cdd4));
    tail.position.set(0, 0.65, -0.75); standIn.add(tail);
    g.add(standIn);
    new GLTFLoader().loadAsync('/games/lexicon/assets/characters/lurker.glb').then((gl) => {
      body.visible = false; standIn.visible = false;
      gl.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
      g.add(gl.scene);
    }).catch(() => {});
  } else if (kind === 'golem') {
    // Mossy ember-cracked quarry rock elemental (S43 / V02 — auto-upgrades to golem.glb when built!)
    const standIn = new THREE.Group();
    body = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 1), own(0x5d5b54)); body.position.y = 1.55;
    body.scale.set(1.15, 1.25, 0.95);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.55), mat(0x525048)); arm.position.set(s * 1.18, 1.25, 0.15); standIn.add(arm);
      const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), mat(0xff8a24, 0xff5500)); glow.position.set(s * 0.55, 2.45, -0.2); standIn.add(glow);
    }
    g.add(standIn);
    new GLTFLoader().loadAsync('/games/lexicon/assets/characters/golem.glb').then((gl) => {
      body.visible = false; standIn.visible = false;
      gl.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
      g.add(gl.scene);
    }).catch(() => {});
  } else if (kind === 'cavern_beast') {
    // Colossal armored crystal cave beast (S05 / V01!)
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.7, 6, 12).rotateX(Math.PI / 2), own(0x454e52)); body.position.y = 1.1;
    for (let i = 0; i < 6; i++) {
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.72, 6), mat(PAL.cyan, 0x3ef0f6));
      cr.position.set(0, 1.95, -0.9 + i * 0.36); g.add(cr);
    }
  } else {
    // the Redactor: faceless hooded judge in dark armour; black redaction bars orbit him
    body = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4.2, 16), own(PAL.inkWarm)); body.position.y = 2.1;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.2), mat(0x050505)); bar.position.set(0, 3.2, 0.62); g.add(bar);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.05), mat(0x050505)); b.userData.orbit = i; g.add(b); }
  }
  body.castShadow = true; g.add(body);
  if (kind !== 'redactor') {
    const sym = kind === 'hushling' ? 'A_c' : kind === 'numeral' ? '±' : kind === 'golem' ? '∑' : kind === 'lurker' ? '✦' : '#';
    const glyph = textSprite(sym, { size: 48, scale: 0.45, color: '#2a2418', bg: 'rgba(243,234,210,.85)' });
    glyph.position.y = kind === 'golem' || kind === 'cavern_beast' ? 3.1 : kind === 'numeral' ? 2.3 : 1.9; g.add(glyph);
  }
  return { g, body };
}

function tierAt(x: number, z: number) { if (lvl.id === 'temple' || lvl.id === 'cavern') return 2; const r = Math.hypot(x, z); return r < 34 ? 1 : r < 68 ? 2 : 3; }

function spawnEnemy(kind: Kind, x: number, z: number, wave: number, zoneId?: string): Enemy {
  const { g, body } = enemyModel(kind);
  const hp = kind === 'redactor' ? 5 : (kind === 'golem' || kind === 'cavern_beast') ? 3 : 2;
  const e: Enemy = { id: `e${eSeq++}`, kind, x, z, y: lvl ? lvl.heightAt(x, z) : 0, hp, alive: true, state: 'idle', t: 0, tier: tierAt(x, z), wave, zoneId, g, body, home: [x, z], dir: [0, 1], angry: 0, flash: 0, wander: Math.random() * 6 };
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

  // roll / Elk leap
  if (pressed('dash') && P.rollT <= 0 && P.atkT <= 0) {
    if (elk.mounted) {
      if (elk.jumpY <= 0.05) { elk.jumpVel = 11.2; sfx.roll(); padMgr.rumble(0.22, 0.15, 70); }
    } else {
      P.rollT = 0.42; P.inv = Math.max(P.inv, 0.35); sfx.roll();
      P.rollDir = moving ? [mx / Math.hypot(mx, mz), mz / Math.hypot(mx, mz)] : [Math.sin(P.yaw), Math.cos(P.yaw)];
      onOnboardAdvance(onboarding.recordRoll());
    }
  }
  // strike / Elk Cyan Antler Surge (S14!)
  if (pressed('melee') && P.atkT <= 0 && P.rollT <= 0) {
    P.atkT = 0.36; P.atkHit = false;
    if (elk.mounted) {
      elk.surgeT = 1.0; sfx.elkCall(); padMgr.rumble(0.55, 0.45, 160);
      for (const e of enemies) {
        if (!e.alive || e.state === 'bound' || e.state === 'dying' || e.kind === 'redactor') continue;
        const d = Math.hypot(e.x - P.x, e.z - P.z);
        if (d < 8.5) {
          e.hp -= 1; e.flash = 0.25; e.state = 'stun'; e.t = 0.6;
          const k = 3.2 / (d || 1); [e.x, e.z] = collide(e.x + (e.x - P.x) * k, e.z + (e.z - P.z) * k, 0.6);
          if (e.hp <= 0) openChallenge(e);
        }
      }
      P.atkHit = true;
    } else {
      sfx.swing();
      padMgr.rumble(0.12, 0.24, 55);
    }
  }

  let vx = 0, vz = 0;
  if (P.rollT > 0) {
    P.rollT -= dt; vx = P.rollDir[0] * 11; vz = P.rollDir[1] * 11;
  } else {
    const sp = elk.mounted ? 14.5 : P.atkT > 0 ? 1.8 : P.lock ? 4.6 : 6.6;
    vx = mx * sp; vz = mz * sp;
  }
  if (P.lock) P.yaw = yawTo(P.x, P.z, P.lock);
  else if (moving && P.rollT <= 0) P.yaw += angleDiff(Math.atan2(mx, mz), P.yaw) * Math.min(1, dt * (elk.mounted ? 8 : 14));
  const oldX = P.x, oldZ = P.z;
  [P.x, P.z] = collide(P.x + vx * dt, P.z + vz * dt, elk.mounted ? 0.9 : 0.45);
  P.y = lvl.heightAt(P.x, P.z);
  const stepDist = Math.hypot(P.x - oldX, P.z - oldZ);
  P.walk += stepDist;
  if (stepDist > 0.001) onOnboardAdvance(onboarding.recordMove(stepDist));
  if (elk.mounted) { elk.x = P.x; elk.z = P.z; elk.yaw = P.yaw; }

  // Cavern hazards (Molten Lava pits & Swinging Bronze Pendulum Blades — S34!)
  const timeSlow = cavernTimeSlowT > 0 ? 0.28 : 1.0;
  if (lvl.hazards.length && P.inv <= 0 && P.rollT <= 0) {
    for (const hz of lvl.hazards) {
      if (Math.abs(P.x - hz.x) < hz.rx && Math.abs(P.z - hz.z) < hz.rz) {
        if (!hz.isLethal || hz.isLethal(simT, timeSlow)) {
          hurt(1, hz.x, hz.z + 2);
          if (hz.kind === 'lava') { P.x = 0; P.z = -139; toast('Scorched by molten lava!', 'Stay on the stone arch and sing TIME [Q] to slow the pendulums.'); }
          break;
        }
      }
    }
  }

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

// ── rescue & Academia puzzle challenges ──
let ch: { c: Challenge; e: Enemy | null; t: number; total: number; onPass?: () => void } | null = null;
function openCustomQuiz(opts: { id: string; kind: string; prompt: string; sub: string; choices: string[]; answer: number; onPass: () => void }) {
  const c: Challenge = { kind: 'arith', prompt: opts.prompt, sub: opts.sub, choices: opts.choices, answer: opts.answer };
  ch = { c, e: null, t: 25, total: 25, onPass: opts.onPass };
  mode = 'challenge'; engine.timeScale = 0.08;
  $('chKind').textContent = opts.kind;
  const pr = $('chPrompt');
  pr.textContent = opts.prompt;
  pr.classList.toggle('verse', opts.prompt.length > 22);
  $('chSub').textContent = opts.sub;
  const box = $('chChoices'); box.innerHTML = '';
  const dpad = ['▲', '▶', '▼', '◀'];
  opts.choices.forEach((txt, i) => {
    const b = document.createElement('button'); b.className = 'btn';
    b.innerHTML = `<span class="key">${i + 1} ${dpad[i]}</span>${txt}`;
    b.onclick = () => answer(i); box.appendChild(b);
  });
  show('challenge', true);
  document.exitPointerLock?.();
}
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
  const c = buildLexiconChallenge(e.kind, BANK, e.tier, save.difficulty, prefer);
  e.state = 'bound'; e.flash = 0;
  const diffBonus = save.difficulty === 'explorer' ? 8 : save.difficulty === 'scribe' ? 4 : 0;
  const total = (c.kind === 'value' ? 14 : c.kind === 'arith' ? 12 : 11) + diffBonus;
  ch = { c, e, t: total, total };
  mode = 'challenge'; engine.timeScale = 0.06;
  const chLabels: Record<string, string> = {
    hushling: 'A Hushling falters · Restore the living word',
    lurker: 'A Pale Cipher-Lurker recoils · Free its crystal word',
    numeral: 'A Numeral cracks · Solve the equation',
    golem: 'A Quarry Rune-Golem fractures · Balance the sum',
    glyphmaw: 'A Glyphmaw gapes · Worked-Math Word Cipher',
    cavern_beast: 'The Deep Cavern Beast staggers · Worked-Math Word Cipher',
  };
  $('chKind').textContent = `${chLabels[e.kind] ?? 'The Unwritten falters'} · ${DIFFICULTY_LABEL[save.difficulty]}`;
  const pr = $('chPrompt');
  pr.textContent = c.prompt;
  pr.classList.toggle('verse', c.prompt.length > 20);
  $('chSub').textContent = c.sub;
  // the first few times: say how to answer
  if (words.size - STARTING_WORDS.length < 2) $('chSub').innerHTML += '<div style="margin-top:6px;font-style:italic">Press <span class="key">1</span>–<span class="key">4</span>, <span class="key">D-Pad</span>, or click your answer before the red bar runs out.</div>';
  const box = $('chChoices'); box.innerHTML = '';
  const dpad = ['▲', '▶', '▼', '◀'];
  c.choices.forEach((txt, i) => { const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = `<span class="key">${i + 1} ${dpad[i]}</span>${txt}`; b.onclick = () => answer(i); box.appendChild(b); });
  show('challenge', true);
  document.exitPointerLock?.();
}
function answer(i: number) {
  if (!ch) return;
  const { c, e, onPass } = ch; ch = null;
  show('challenge', false); mode = 'play'; engine.timeScale = 1;
  if (i === c.answer) {
    sfx.rescue();
    rules?.emit('puzzleSolved', { kind: c.kind });
    bridge.creditXp(10 + (e?.tier ?? 1) * 5);
    if (onPass) { onPass(); return; }
    if (e) {
      const zId = e.zoneId;
      e.state = 'dying'; e.t = 0.6;
      if (Math.random() < 0.3 || P.hp <= 2) dropHeart(e.x, e.z);
      rules?.enemyDown(e.kind, e.wave);
      if (P.lock === e) P.lock = null;
      checkZoneReclaimed(zId);
      onOnboardAdvance(onboarding.recordCombatRescue());
    }
    const w = c.entry?.w ?? pickFreed(e?.tier ?? 1);
    if (w) freeWord(w);
  } else {
    sfx.wrong();
    toast(`It was ${c.choices[c.answer]}.`, onPass ? 'Try the mechanism again when ready.' : 'The Unwritten pulls the word back.');
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
  if (activeSetPiece || !lvl) return null;
  // Pet & bond with the bowing Great Forest Elk (S11 / S36!) or mount/dismount
  if (elk.visible && !elk.mounted && Math.hypot(elk.x - P.x, elk.z - P.z) < 4.5) {
    if (!save.elkUnlocked) {
      return {
        label: 'Pet & Bond with the Great Forest Elk',
        act: () => {
          save.elkUnlocked = true; elk.bonded = true; elk.bowing = false; persist();
          sfx.cleanse(); sfx.elkCall();
          toast('✦ Companion Unlocked: Great Forest Elk!', 'Press V anytime outdoors to summon/mount, Space to leap logs, J for Antler Surge!');
          toggleElkMount();
        },
      };
    }
    return { label: 'Mount the Great Forest Elk [V]', act: toggleElkMount };
  }
  // Level portals (Waterfall Ladder -> Cavern, Staging Depot -> Mine-Cart, Shrine Arch <-> Glossa Valley)
  for (const pt of lvl.portals) {
    if (Math.hypot(pt.x - P.x, pt.z - P.z) < pt.r) {
      return {
        label: pt.label,
        act: () => {
          const msg = pt.lockedMsg?.();
          if (msg) { toast(msg); return; }
          fade(() => loadLevel(pt.target, pt.spawn, pt.yaw));
        },
      };
    }
  }
  // Interactive Academia physics/word mechanisms (mirrors, sluices, tile seals, counterweights, ruins)
  for (const it of lvl.interactables) {
    if (Math.hypot(it.x - P.x, it.z - P.z) < it.r) {
      return { label: it.label(), act: it.act };
    }
  }
  if (lvl.id === 'glossa') {
    for (const v of VILLAGERS) {
      const sleeping = villagerCast?.isSleepingHome(v.id) ?? false;
      if (sleeping) {
        if (Math.hypot(v.homePos[0] - P.x, v.homePos[1] - P.z) < 3.8) {
          return { label: `Knock on ${v.name}'s door (resting until dawn)`, act: () => talk(v.id) };
        }
      } else {
        const [vx, vz] = villagerCast ? villagerCast.getPosition(v.id) : v.pos;
        if (Math.hypot(vx - P.x, vz - P.z) < 3.0) {
          return { label: `Talk to ${v.name} · ${v.role}`, act: () => talk(v.id) };
        }
      }
    }
    if (Math.hypot(P.x, P.z) < 3.4) {
      return {
        label: 'Rest at the Word Well (Save Progress · Archive)',
        act: () => {
          P.hp = save.maxHp;
          persist(false);
          sfx.save();
          hud();
          toast('✦ Progress Saved at the Word Well', `${words.size} words safely recorded in your Archive.`);
          openArchive();
        },
      };
    }
    const g = lvl.gates.get('cipher');
    if (g && !g.open && Math.abs(P.x) < 5 && P.z > -66 && P.z < -61) return { label: 'Read the Cipher Gate', act: openCipher };
  }
  const s = nearestSigil(undefined, 3.6);
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
      if (k === 'meet' && who === 'elder') onOnboardAdvance(onboarding.recordTalkMira());
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
  dlgSel = 0;
  $('dlgWho').textContent = n.who ?? '';
  $('dlgText').textContent = n.text;
  const box = $('dlgChoices'); box.innerHTML = '';
  const pg = usePadPrompts ? padMgr.getActiveGlyphs() : null;
  (n.choices ?? []).forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === dlgSel && pg ? ' pad-focus' : '');
    b.innerHTML = `<span class="key">${pg ? (['▲', '▶', '▼', '◀'][i] ?? String(i + 1)) : String(i + 1)}</span>${c.label}`;
    b.onclick = () => renderDialog(dlg!.choose(i));
    box.appendChild(b);
  });
  $('dlgMore').style.display = n.choices?.length ? 'none' : 'block';
  $('dlgMore').textContent = pg ? `${pg.confirm} ▸` : 'E / Enter ▸';
}
let dlgSel = 0;
function updateDlgFocus() {
  const btns = Array.from($('dlgChoices').querySelectorAll('button'));
  btns.forEach((b, i) => b.classList.toggle('pad-focus', i === dlgSel));
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
  onOnboardAdvance(onboarding.recordSongPlayed());
  duckMusic(0.25, 0.3); setTimeout(() => { if (!boss) duckMusic(1, 1.5); }, 2600);
  if (def.power === 'time') {
    if (lvl.id === 'cavern') {
      cavernTimeSlowT = 14;
      story('The Song of Time slows the swinging bronze pendulums to a gentle drift!');
      return;
    }
    if (lvl.outdoor) {
      const s = ((dayClockSec % CYCLE_TOTAL_SEC) + CYCLE_TOTAL_SEC) % CYCLE_TOTAL_SEC;
      const isDark = s >= DAY_SEC + DUSK_SEC && s < DAY_SEC + DUSK_SEC + NIGHT_SEC;
      dayClockSec = isDark ? 360 : DAY_SEC + DUSK_SEC + 180;
      todManualOverride = false;
      save.tod = todFromCycleSec(dayClockSec);
      persist();
      story(isDark ? 'The Song of Time calls the bright morning sun back.' : 'The Song of Time pulls the moonlit night across the sky.');
    }
  }
  // Wilds Riverbank Ambush (S22 / S47 / S13): singing LIGHT unleashes a blinding burst that summons the Great Forest Elk!
  if (def.power === 'light' && lvl.id === 'wilds' && !save.elkUnlocked && !save.reclaimed.includes('wilds-river-ambush')) {
    for (const e of enemies) {
      if (e.zoneId === 'wilds-river-ambush' && e.alive) { e.state = 'dying'; e.t = 0.6; }
    }
    checkZoneReclaimed('wilds-river-ambush');
    story('A blazing golden burst of LIGHT scatters the Hushlings — the Great Forest Elk strides out of the trees!');
    return;
  }
  if (def.power === 'mend') {
    P.hp = save.maxHp; hud(); sfx.cleanse();
    for (const e of enemies) if (e.alive && Math.hypot(e.x - P.x, e.z - P.z) < 12) { e.state = 'stun'; e.t = 1.6; }
    toast('♪ MEND', 'Your hearts are restored and nearby Unwritten recoil.');
  }
  if (lvl.onSong?.(def.power, P.x, P.z)) return;
  const s = nearestSigil(def.power, def.power === 'light' && lvl.id === 'temple' ? 22 : 8);
  if (s && !s.solved) { solveSigil(s); return; }
  if (def.power !== 'time' && def.power !== 'mend') toast(`♪ ${w}`, 'The song rings out, but nothing here answers it.');
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

// ── cipher gate (scratchpad-free worked math + hints + age-scalable difficulty) ──
let cipherSel = new Set<string>();
let cipherCursor = 0;
let cipherHintWord: string | null = null;
const DIFF_ORDER: CipherDifficulty[] = ['explorer', 'scribe', 'scholar'];
function updateDifficultyLabels() {
  const lbl = DIFFICULTY_LABEL[save.difficulty] ?? DIFFICULTY_LABEL.scribe;
  const b1 = $('pDiff'), b2 = $('ciDiff');
  if (b1) b1.textContent = `Cipher: ${lbl}`;
  if (b2) b2.textContent = `Level: ${lbl}`;
}
function cycleDifficulty() {
  const idx = DIFF_ORDER.indexOf(save.difficulty);
  save.difficulty = DIFF_ORDER[(idx + 1) % DIFF_ORDER.length]!;
  persist(true);
  updateDifficultyLabels();
  toast('Cipher Level', DIFFICULTY_LABEL[save.difficulty]);
  if (mode === 'cipher') renderCipher();
}
function pickGateTarget(vals: number[]): number {
  if (save.difficulty === 'explorer' && vals.length >= 2) {
    const shuf = [...vals].sort(() => Math.random() - 0.5);
    return shuf[0]! + shuf[1]!;
  }
  return makeSumTarget(vals);
}
function openCipher() {
  if (words.size < 4) { toast('The gate stays silent.', `It wants at least 4 words to weigh. You carry ${words.size}.`); return; }
  const sorted = [...words].sort();
  const vals = sorted.map(wordValue);
  if (!save.cipherTarget || !subsetReaching(vals, save.cipherTarget)) {
    save.cipherTarget = pickGateTarget(vals);
    persist(true);
    setGateSign(save.cipherTarget);
  }
  rules?.emit('enterZone', {});
  mode = 'cipher'; cipherSel = new Set(); cipherCursor = 0; cipherHintWord = null; document.exitPointerLock?.();
  updateDifficultyLabels();
  renderCipher(); show('cipher', true);
}
function renderCipher() {
  const sorted = [...words].sort();
  if (sorted.length) cipherCursor = ((cipherCursor % sorted.length) + sorted.length) % sorted.length;
  const selList = [...cipherSel];
  const sum = selList.reduce((s, w) => s + wordValue(w), 0);
  const diff = save.cipherTarget - sum;
  const expr = selList.length ? selList.map((w) => `${w}(${wordValue(w)})`).join(' + ') + ` = <b>${sum}</b>` : `Σ <b>0</b>`;
  const status = diff === 0
    ? '<span style="color:#0d7a5f;font-weight:bold">✦ Exact match! Click Unseal!</span>'
    : diff > 0
      ? `<span style="opacity:.78">Need <b>+${diff}</b> more</span>`
      : `<span style="color:#a33">Over by <b>${-diff}</b></span>`;
  const pg = usePadPrompts ? padMgr.getActiveGlyphs() : null;
  $('ciSum').innerHTML = `${expr} &nbsp;/&nbsp; <b>${save.cipherTarget}</b><div style="font-size:15px;margin-top:4px">${status}</div>${pg ? `<div style="font-size:13px;opacity:.7;margin-top:4px">${pg.confirm} Toggle · ${pg.strike} / ${pg.start} Unseal · ${pg.cancel} Leave</div>` : ''}`;
  const grid = $('ciGrid'); grid.innerHTML = '';
  sorted.forEach((w, idx) => {
    const d = document.createElement('div');
    d.className = 'word' + (cipherSel.has(w) ? ' sel' : '') + (cipherHintWord === w ? ' hint' : '') + (pg && idx === cipherCursor ? ' pad-focus' : '');
    const breakdown = save.difficulty === 'scholar'
      ? `${[...w].map((c) => c.charCodeAt(0) - 64).join('+')} = <b>${wordValue(w)}</b>`
      : `${workedLetterSum(w)} = <b>${wordValue(w)}</b>`;
    d.innerHTML = `<b>${w}</b><span class="v">Σ ${wordValue(w)}</span><div class="d">${breakdown}</div>`;
    d.onclick = () => {
      cipherCursor = idx;
      cipherSel.has(w) ? cipherSel.delete(w) : cipherSel.add(w);
      if (cipherHintWord === w) cipherHintWord = null;
      sfx.note(w[0]); renderCipher();
    };
    grid.appendChild(d);
  });
}
$('ciHint').onclick = () => {
  const sorted = [...words].sort();
  const vals = sorted.map(wordValue);
  const sol = subsetReaching(vals, save.cipherTarget);
  if (!sol || !sol.length) {
    save.cipherTarget = pickGateTarget(vals);
    persist(true);
    setGateSign(save.cipherTarget);
    renderCipher();
    return;
  }
  const solWords = sol.map((i) => sorted[i]!);
  const pick = solWords.find((w) => !cipherSel.has(w)) ?? solWords[0]!;
  cipherHintWord = pick;
  sfx.note(pick[0]);
  toast('✦ Cipher Hint', `Try including “${pick}” (${wordValue(pick)}) in your sum!`);
  renderCipher();
};
$('ciDiff').onclick = cycleDifficulty;
$('ciOpen').onclick = () => {
  const sum = [...cipherSel].reduce((s, w) => s + wordValue(w), 0);
  if (sum === save.cipherTarget) {
    closePanel(); openGate('cipher'); padMgr.rumble(0.55, 0.3, 200); bridge.unlockAchievement('lexicon_cipher'); bridge.creditXp(40);
    rules?.emit('puzzleSolved', { kind: 'cipher' }); rules?.emit('gateOpened', { gate: 'cipher' });
  } else { sfx.wrong(); padMgr.rumble(0.45, 0.45, 160); $('ciSum').innerHTML += `<div style="font-size:14px;color:#a33">The gate weighs ${save.cipherTarget}. Your words weigh ${sum}.</div>`; }
};
$('ciClose').onclick = closePanel;
let pauseSel = 0;
const pauseButtons = () => [$('pResume'), $('pSave'), $('pDiff'), $('pSkipTrack'), $('pHow'), $('pPadStyle'), $('pSkipIntro'), $('pExit')];
function updatePauseFocus() {
  const btns = pauseButtons();
  pauseSel = ((pauseSel % btns.length) + btns.length) % btns.length;
  btns.forEach((b, i) => b.classList.toggle('pad-focus', usePadPrompts && i === pauseSel));
  updateDifficultyLabels();
  const sk = $('pSkipIntro');
  if (sk) sk.textContent = onboarding.active ? 'Skip Intro Walkthrough' : 'Replay Intro (Reset Save)';
}
function cyclePadIcons() {
  const next = padMgr.cycleStylePref();
  refreshControlUI();
  toast('Controller Icons', next === 'auto' ? `Auto (${padMgr.getActiveGlyphs().name})` : padMgr.getActiveGlyphs().name);
}
$('pResume').onclick = closePanel;
$('pSave').onclick = () => {
  persist(false);
  sfx.save();
  toast('✦ Progress Saved', `${words.size} words & ${save.reclaimed.length} reclaimed zones saved — safe across reloads!`);
};
$('pDiff').onclick = cycleDifficulty;
$('pSkipTrack').onclick = () => {
  const next = skipMusicTrack();
  toast('♪ Now Playing', next || 'Next Track');
};
$('howtoBtn').onclick = () => { renderPadMap(); show('howto', true); };
$('pHow').onclick = () => { renderPadMap(); show('howto', true); };
$('pPadStyle').onclick = cyclePadIcons;
$('howtoPadStyle').onclick = cyclePadIcons;
$('pSkipIntro').onclick = () => {
  if (onboarding.active) {
    onboarding.skip();
    save.tutorialDone = true;
    persist();
    updateCoach();
    closePanel();
    toast('Intro Skipped', 'Explore Glossa Hollow freely — follow the gold quest beacon anytime.');
  } else {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }
};
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
  bossRound = 0; blotT = 3; sfx.boss();
  if (audioUnlocked) playPlaylist(playlistForRegion(project.assets, 'boss'), 'boss', 1.2);
  show('boss', true); story('“Every word you keep, I will strike out.” The Redactor descends.');
  nextRound(ROUNDS[0]);
}
function endBoss(won: boolean) {
  if (!boss && !task) return;
  show('boss', false); task = null; duckMusic(1, 1.5);
  if (audioUnlocked && lvl) playPlaylist(playlistForRegion(project.assets, lvl.id), lvl.id, 1.8);
  if (lvl?.pillars) for (const p of lvl.pillars) setPillarLabel(p, '—');
  if (boss && !won) { scene.remove(boss.g); boss.alive = false; }
  boss = null;
}
function setPillarLabel(p: BuiltLevel['pillars'][number], text: string) {
  const parent = p.label.parent!; const pos = p.label.position.clone(); parent.remove(p.label);
  p.label = textSprite(text, { size: 52, color: '#ffe9a8', scale: 1, bg: 'rgba(10,8,20,.65)' }); p.label.position.copy(pos); parent.add(p.label);
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
      task = { type, k: [i, j], text: `Strike the two pillars that add up to ${S}`, struck: new Set() };
    } else {
      const k = Math.floor(Math.random() * 4);
      task = { type, k: [k], text: type === 'weight' ? `Strike the pillar that weighs ${v[k]}` : `Strike the word that means “${wordByText(pick[k])!.def}”`, struck: new Set() };
    }
    pillarWords = pick;
    // Show each word's numeric weight right on the pillar so combat stays joyful & scratchpad-free!
    lvl.pillars.forEach((p, i) => setPillarLabel(p, `${pick[i]} (${v[i]})`));
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
  if (activeSetPiece) {
    if (activeSetPiece.kind === 'rapids' && lexSky) lexSky.update(save.tod, playerPos.set(0, 0, 0));
    return;
  }
  if (!lvl.outdoor || !lexSky) { scene.background = new THREE.Color(lvl.sky.day); return; }
  lexSky.update(save.tod, playerPos.set(P.x, P.y, P.z));
}

// ── the Unwriting, drawn (manuscript erasure field) ──
// Kenne's rule: black-ink & white-paper Unwriting appears ONLY where live enemies are AND inside active
// (un-reclaimed) Infected Zones that need to be reclaimed & restored. Explored living wilderness stays painted-real!
const ERASE: Record<Kind, [number, number]> = {
  hushling: [6.5, 0.95], numeral: [4.5, 0.65], glyphmaw: [5.5, 0.85],
  lurker: [4.8, 0.7], golem: [5.5, 0.65], cavern_beast: [7.0, 0.8], redactor: [13, 0.75],
};
const bursts: { x: number; z: number; r: number; a: number; t: number }[] = [];
function eraseBurst(x: number, z: number, r = 4, a = 1) { bursts.push({ x, z, r, a, t: 2.2 }); }

interface ReclaimBloom {
  x: number; z: number; maxR: number; t: number; dur: number;
  ring: THREE.Mesh; motes: THREE.Points;
}
const reclaimBlooms: ReclaimBloom[] = [];
function clearReclaimBlooms() {
  for (const b of reclaimBlooms) {
    scene.remove(b.ring); scene.remove(b.motes);
    b.ring.geometry.dispose(); b.motes.geometry.dispose();
  }
  reclaimBlooms.length = 0;
}
function spawnReclaimBloom(x: number, z: number, maxR: number) {
  const gy = lvl ? lvl.heightAt(x, z) : 0;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 1.45, 36).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xb1f9f6, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  ring.position.set(x, gy + 0.35, z);
  scene.add(ring);

  const count = 42;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const pal = [new THREE.Color(0xffe082), new THREE.Color(0x96f7e4), new THREE.Color(0x88d870), new THREE.Color(0xffb570)];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * maxR * 0.85;
    pos[i * 3] = x + Math.cos(a) * rad;
    pos[i * 3 + 1] = gy + 0.4 + Math.random() * 1.4;
    pos[i * 3 + 2] = z + Math.sin(a) * rad;
    const c = pal[i % pal.length]!;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mPts = new THREE.Points(mg, new THREE.PointsMaterial({
    size: 0.48, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(mPts);
  reclaimBlooms.push({ x, z, maxR, t: 0, dur: 3.6, ring, motes: mPts });
}

function updateErasure(dt: number) {
  const zones: ErasureZone[] = [];
  if (!activeSetPiece && lvl) {
    // 1. Active Infected Zones (white-paper erasure fields until every enemy in the pack is cleared!)
    const showGlossaInfected = lvl.id !== 'glossa' || save.lassoedFirst;
    if (showGlossaInfected) {
      for (const iz of INFECTED_ZONES) {
        if (iz.level !== lvl.id || save.reclaimed.includes(iz.id)) continue;
        zones.push({ x: iz.pos[0], z: iz.pos[1], radius: iz.radius, amount: 0.95, hole: false });
      }
    }
    // 1b. Animated Reclamation Colour Blooms: living colour visibly grows outward from the center over 3.6 s!
    for (let i = reclaimBlooms.length - 1; i >= 0; i--) {
      const b = reclaimBlooms[i]!;
      b.t += dt;
      const p = Math.min(1, b.t / b.dur);
      const ease = 1 - Math.pow(1 - p, 2);
      b.ring.scale.setScalar(1 + ease * b.maxR * 0.92);
      (b.ring.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.85;
      const mp = b.motes.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < mp.count; k++) mp.setY(k, mp.getY(k) + dt * (1.8 + (k % 3) * 0.55));
      mp.needsUpdate = true;
      (b.motes.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - p * 0.95);

      if (p >= 1) {
        scene.remove(b.ring); scene.remove(b.motes);
        b.ring.geometry.dispose(); b.motes.geometry.dispose();
        reclaimBlooms.splice(i, 1);
        continue;
      }
      // Clear center into living colour first, while receding black-and-white sketch lobes dissolve outward to the edge!
      const centerAmt = Math.max(0, 0.92 * (1 - p * 2.2));
      if (centerAmt > 0.03) {
        zones.push({ x: b.x, z: b.z, radius: b.maxR * (1 - p * 0.35), amount: centerAmt, hole: true });
      }
      const rimAmt = 0.92 * Math.pow(1 - p, 1.15);
      const rimDist = p * b.maxR * 0.78;
      const rimR = b.maxR * (0.56 * (1 - p * 0.72));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + p * 0.35;
        zones.push({ x: b.x + Math.cos(a) * rimDist, z: b.z + Math.sin(a) * rimDist, radius: rimR, amount: rimAmt, hole: false });
      }
    }
    // 2. Live Unwritten enemies carry mobile erasure auras
    for (const e of enemies) {
      if (!e.alive) continue;
      const [r, a] = ERASE[e.kind];
      const k = e.state === 'dying' ? Math.max(0, e.t / 0.6) : e.state === 'bound' ? 0.6 : 1;
      zones.push({ x: e.x, z: e.z, radius: r, amount: a * k, hole: true });
    }
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t -= dt;
    if (b.t <= 0) { bursts.splice(i, 1); continue; }
    zones.push({ x: b.x, z: b.z, radius: b.r, amount: b.a * Math.min(1, b.t / 1.2) });
  }
  zones.sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z));
  manuscript.setZones(zones);
  manuscript.setPaperLight(lvl?.outdoor ? 0.25 + 0.75 * (lexSky?.light ?? 1) : 0.45);
  // Zero blanket edge erasure: living wilderness stays painted-real; only enemies & Infected Zones are white-paper!
  manuscript.setEdge(1e5, 1e5 + 1, 0);
}

// ── engine ──
let simT = 0;
const engine = new PlaykitEngine({
  fixedUpdate: (dt) => {
    simT += dt;
    if (cavernTimeSlowT > 0) cavernTimeSlowT = Math.max(0, cavernTimeSlowT - dt);
    if (mode !== 'play' && mode !== 'challenge') return;
    if (activeSetPiece) {
      ambient.update(dt, simT, {
        outdoor: activeSetPiece.kind === 'rapids', night: false,
        waterfallProximity: activeSetPiece.kind === 'rapids' ? 0.75 : 0,
        creekProximity: activeSetPiece.kind === 'rapids' ? 0.9 : 0,
        inWoods: activeSetPiece.kind === 'rapids' ? 0.5 : 0,
        muted: false,
      });
      if (mode === 'play') {
        const keySteer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
        const padLeft = padSnap.connected && (padSnap.held.left || padSnap.held.lb || padSnap.held.lt || padSnap.moveX < -0.35);
        const padRight = padSnap.connected && (padSnap.held.right || padSnap.held.rb || padSnap.held.rt || padSnap.moveX > 0.35);
        const padSteer = padSnap.connected
          ? (Math.abs(padSnap.moveX) > 0.12 ? padSnap.moveX : (padRight ? 1 : 0) - (padLeft ? 1 : 0))
          : 0;
        activeSetPiece.update(dt, simT, {
          left: keys.has('KeyA') || keys.has('ArrowLeft') || padLeft,
          right: keys.has('KeyD') || keys.has('ArrowRight') || padRight,
          steer: keySteer !== 0 ? keySteer : padSteer,
          jump: pressed('dash') || keys.has('Space') || (padSnap.connected && (padSnap.pressed.confirm || padSnap.held.confirm || padSnap.pressed.up)),
          duck: keys.has('KeyS') || keys.has('ArrowDown') || (padSnap.connected && (padSnap.held.cancel || padSnap.held.down || padSnap.moveY < -0.45)),
          strike: pressed('melee') || keys.has('KeyJ') || (padSnap.connected && padSnap.pressed.strike),
          lasso: keys.has('KeyC') || keys.has('KeyL') || (padSnap.connected && (padSnap.pressed.rb || padSnap.pressed.rt || padSnap.pressed.lyre)),
          pad: usePadPrompts ? padMgr.getActiveGlyphs() : null,
        }, camera);
      }
      consumed = true;
      return;
    }
    onboarding.tick(dt);
    const night = lvl.outdoor && (save.tod < 0.23 || save.tod > 0.77);
    const nightK = lvl.outdoor ? Math.max(0, Math.min(1, 1 - (lexSky?.light ?? 1))) : 0.85;
    if (lvl.outdoor && !todManualOverride) {
      // 15m bright day -> 5m sunset/dusk transition -> 8m dark night -> 2m dawn
      dayClockSec = (dayClockSec + dt) % CYCLE_TOTAL_SEC;
      save.tod = todFromCycleSec(dayClockSec);
    }
    if (mode === 'play') updatePlayer(dt);
    updateEnemies(dt, night);
    updateBoss(dt, simT);
    lasso.update(dt, simT, P.x, P.y + (elk.mounted ? 1.5 : 0), P.z, lvl.heightAt);
    lvl.update?.(dt, simT, cavernTimeSlowT > 0 ? 0.28 : 1.0, nightK, P.x, P.z);
    // Living procedural environment soundscape (wind, waterfall & creek proximity, meadow birds, squirrels, night crickets/owl)
    const wfProx = lvl.id === 'glossa' ? Math.max(0, 1 - Math.hypot(P.x + 56, P.z + 26) / 50) : 0;
    const ckProx = lvl.id === 'glossa' ? Math.max(0, 1 - creekDist(P.x, P.z) / 22) : lvl.id === 'wilds' ? Math.max(0, Math.min(1, (P.z - 86) / 24)) : 0;
    const woodsK = lvl.id === 'wilds' ? 0.95 : lvl.id === 'glossa' ? Math.max(0, Math.min(1, (Math.hypot(P.x, P.z) - 22) / 36)) : 0;
    ambient.update(dt, simT, {
      outdoor: lvl.outdoor, night, waterfallProximity: wfProx, creekProximity: ckProx, inWoods: woodsK, muted: false,
    });
    // Periodic quiet auto-save every 20s during exploration so progress is never lost between reloads!
    autoSaveClock += dt;
    if (autoSaveClock >= 20 && mode === 'play') {
      autoSaveClock = 0;
      persist(true);
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]; p.t -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.m.position.set(p.x, 1.4, p.z);
      if (Math.hypot(p.x - P.x, p.z - P.z) < 0.9 && P.rollT <= 0) { hurt(1, p.x, p.z); p.t = 0; }
      if (p.t <= 0) { scene.remove(p.m); projectiles.splice(i, 1); }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]; p.t -= dt; p.m.rotation.y += dt * 3;
      if (Math.hypot(p.x - P.x, p.z - P.z) < 1.5) { P.hp = Math.min(save.maxHp, P.hp + 2); hud(); sfx.open(); p.t = 0; }
      if (p.t <= 0) { scene.remove(p.m); pickups.splice(i, 1); }
    }
    rules?.tick(dt, { player: [P.x, P.y, P.z], hp: P.hp });
    consumed = true;
  },
  render: (_alpha, frameDt) => {
    if (activeSetPiece) {
      updateSky();
      updateErasure(frameDt);
      if (post) post.render(); else renderer.render(scene, camera);
      return;
    }
    if (!lvl) return;
    // player & Elk companion pose
    const speedNow = frameDt > 0 ? Math.hypot(P.x - prevPX, P.z - prevPZ) / frameDt : 0;
    elk.update(frameDt, simT, elk.mounted ? speedNow : 0, lvl.heightAt);
    P.g.position.set(P.x, P.y + (elk.mounted ? elk.jumpY + 2.55 : 0), P.z);
    P.g.rotation.y = P.yaw;
    const sw = elk.mounted ? 0 : Math.sin(P.walk * 2.2) * 0.5;
    P.g.getObjectByName('legL')!.rotation.x = sw; P.g.getObjectByName('legR')!.rotation.x = -sw;
    P.g.rotation.x = P.rollT > 0 ? (0.42 - P.rollT) * 15 : 0;

    // 3-phase Quill-Spear Strike + glowing spear-tip lantern + 3D luminous Crescent Slash Arc!
    const strikeP = P.atkT > 0 ? Math.min(1, (0.36 - P.atkT) / 0.36) : 0;
    const nightK = lvl.outdoor ? Math.max(0, Math.min(1, 1 - (lexSky?.light ?? 1))) : 0.85;
    const spearGlow = lvl.outdoor ? Math.max(0.14, nightK * 1.18) : 0.94;
    if (strikeP > 0) {
      if (strikeP < 0.22) {
        const u = strikeP / 0.22;
        P.quill.rotation.y = -0.3 - 1.15 * u;
        P.quill.rotation.x = 0.5 - 0.35 * u;
      } else if (strikeP < 0.68) {
        const u = (strikeP - 0.22) / 0.46;
        P.quill.rotation.y = -1.45 + 2.85 * Math.sin(u * Math.PI * 0.5);
        P.quill.rotation.x = 0.15 + 0.12 * Math.sin(u * Math.PI);
      } else {
        const u = 1 - (strikeP - 0.68) / 0.32;
        P.quill.rotation.y = -0.3 + 1.7 * u;
        P.quill.rotation.x = 0.5 - 0.35 * u;
      }
    } else {
      P.quill.rotation.y = -0.3;
      P.quill.rotation.x = 0.5;
    }
    const pulse = 0.92 + 0.08 * Math.sin(simT * 4.2);
    const strikeBoost = strikeP > 0.15 && strikeP < 0.72 ? 1.6 : 0;
    spearPointLight.intensity = (spearGlow * 48 + strikeBoost * 20) * pulse;
    standInBladeMat.emissiveIntensity = (0.7 + spearGlow * 2.8 + strikeBoost * 1.4) * pulse;

    // 3D Crescent Slash Arc VFX sweeps cleanly across a 140° arc during strike!
    if (strikeP > 0.16 && strikeP < 0.78 && !elk.mounted) {
      const u = (strikeP - 0.16) / 0.62;
      slashArc.visible = true;
      slashArc.rotation.y = -1.15 + u * 2.45;
      slashArc.rotation.z = -0.18 + u * 0.32;
      slashArc.scale.setScalar(0.85 + u * 0.5);
      slashArcMat.opacity = Math.sin(u * Math.PI) * 0.88;
    } else {
      slashArc.visible = false;
      slashArcMat.opacity = 0;
    }

    P.g.visible = P.inv <= 0 || Math.floor(simT * 20) % 2 === 0;
    if (scribe && frameDt > 0) {
      scribe.update(frameDt, (P.rollT > 0 || elk.mounted) ? 0 : Math.min(speedNow, 8), strikeP, P.rollT > 0 ? (0.42 - P.rollT) / 0.42 : 0, spearGlow);
    }
    if (lvl.id === 'glossa' && villagerCast && frameDt > 0) {
      villagerCast.update(frameDt, simT, P.x, P.z, currentDayPhase(), lvl.heightAt);
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
    const ldx = frame?.lookDeltaX ?? 0, ldy = frame?.lookDeltaY ?? 0;
    if (mode === 'play' && (Math.abs(ldx) > 0.1 || Math.abs(ldy) > 0.1)) {
      onOnboardAdvance(onboarding.recordLook((Math.abs(ldx) + Math.abs(ldy)) * 0.0025));
    }
    cam.addLook(ldx, ldy);
    cam.height = elk.mounted ? 3.4 : 1.8;
    cam.distance = elk.mounted ? 8.8 : 5.8;
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
let bootReady = false;
function loop(now: number) {
  const dt = (now - last) / 1000; last = now;
  frameTick(dt);
  requestAnimationFrame(loop);
}
/** One display frame. Debug `step()` calls it directly: a hidden preview pane freezes rAF. */
function frameTick(dt: number) {
  readKeys(Math.min(Math.max(dt, 1 / 240), 0.1));
  frame = input.poll(dt); consumed = false;
  handleModeInput(dt);
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
  if (saveBadgeT > 0) { saveBadgeT -= dt; if (saveBadgeT <= 0) $('saveBadge').style.opacity = '0'; }
  if (lvl) {
    $('clock').textContent = clockText();
    const it = mode === 'play' ? interactable() : null;
    const pr = $('prompt'); pr.style.display = it ? 'block' : 'none';
    if (it) {
      const ik = usePadPrompts ? padMgr.getActiveGlyphs().confirm : 'E';
      pr.innerHTML = `<span class="key" style="background:rgba(255,255,255,.2)">${ik}</span>${it.label}`;
    }
    updateGuide(performance.now() / 1000);
    statT += dt; if (statT > 2) { statT = 0; postToStudio({ type: 'stats', frameMs: engine.budget.frameMs, draws: engine.budget.drawCalls, triangles: engine.budget.triangles } as never); }
  }
}

let chSel = -1;
function updateChallengeFocus() {
  const btns = Array.from($('chChoices').querySelectorAll('button'));
  btns.forEach((b, i) => b.classList.toggle('pad-focus', i === chSel));
}

function handleModeInput(dt: number) {
  const f = frame;
  // How-to-Play & Controller Map overlay (can open from Title or Pause)
  if ($('howto').style.display === 'block') {
    if (padSnap.connected) {
      const scr = (-padSnap.moveY + padSnap.lookY) * 420 * dt;
      if (Math.abs(scr) > 0.5) $('howto').scrollTop += scr;
      if (padSnap.pressed.lyre || padSnap.pressed.strike) { cyclePadIcons(); return; }
      if (padSnap.pressed.confirm || padSnap.pressed.cancel || padSnap.pressed.start) { show('howto', false); return; }
    }
    if (f.pressed.pause) show('howto', false);
    return;
  }

  if (mode === 'title') {
    if (padSnap.connected && bootReady) {
      if (padSnap.pressed.confirm || padSnap.pressed.start) {
        $('startBtn').click();
        return;
      }
      if (padSnap.pressed.lyre || padSnap.pressed.select) {
        renderPadMap(); show('howto', true);
        return;
      }
    }
    return;
  }

  if (mode === 'play') {
    if (f.pressed.pause) {
      mode = 'pause'; pauseSel = 0; renderPadMap(); updatePauseFocus();
      show('pause', true); document.exitPointerLock?.(); return;
    }
    if (activeSetPiece) return;
    if (padSnap.connected) {
      if (padSnap.pressed.rb || padSnap.pressed.rt) { fireWordLasso(); padMgr.rumble(0.18, 0.32, 70); return; }
      if (padSnap.pressed.up) { toggleElkMount(); padMgr.rumble(0.35, 0.2, 110); return; }
      if (elk.mounted && padSnap.pressed.cancel) { toggleElkMount(); return; }
      if (padSnap.pressed.down) { guideOn = !guideOn; localStorage.setItem('lexicon_guide', guideOn ? '1' : '0'); toast('Guide', guideOn ? 'On' : 'Off · the goal stays at the top left'); return; }
      if (padSnap.pressed.left) { toast('Music', toggleMusic() ? `On · ♪ ${currentTrackTitle()}` : 'Off'); return; }
      if (padSnap.pressed.right) { openLyre(); return; }
    }
    if (f.pressed.interact || f.pressed.jump) {
      const it = interactable();
      if (it) { it.act(); return; }
      if (f.pressed.jump) input.tapAction('dash');
    }
    if (f.pressed.special) { openLyre(); return; }
    if (f.pressed.toggleView) { openArchive(); return; }
    if (f.pressed.item) cam.snapBehind(P.yaw);
  } else if (mode === 'challenge') {
    const lane = f.laneTaps[0];
    if (lane !== undefined) { chSel = -1; answer(({ 2: 0, 3: 1, 1: 2, 0: 3 } as Record<number, number>)[lane]); return; }
    if (padSnap.connected) {
      const count = $('chChoices').querySelectorAll('button').length;
      if (count > 0) {
        const stepDir = padSnap.pressed.rb ? 1 : padSnap.pressed.lb ? -1 : (padSnap.navX !== 0 ? padSnap.navX : padSnap.navY * 2);
        if (stepDir !== 0) {
          chSel = chSel < 0 ? 0 : ((chSel + stepDir) % count + count) % count;
          updateChallengeFocus();
        }
        if (padSnap.pressed.confirm && chSel >= 0) {
          const pick = chSel; chSel = -1; answer(pick);
        }
      }
    }
  } else if (mode === 'lyre') {
    const songs = [...words].filter((w) => wordByText(w)?.power !== 'none');
    if (songs.length) {
      const dir = padSnap.navX !== 0 ? padSnap.navX : padSnap.navY !== 0 ? padSnap.navY : padSnap.pressed.rb ? 1 : padSnap.pressed.lb ? -1 : 0;
      if (dir !== 0) { lyreSel = ((lyreSel + dir) % songs.length + songs.length) % songs.length; openLyre(); }
      if (f.pressed.jump || padSnap.pressed.confirm) autoPlay(songs[lyreSel]);
    }
    if (f.pressed.pause || f.pressed.dash || padSnap.pressed.cancel || padSnap.pressed.lyre) closePanel();
  } else if (mode === 'archive') {
    if (padSnap.connected) {
      const scr = (-padSnap.moveY + padSnap.lookY) * 460 * dt;
      if (Math.abs(scr) > 0.5) $('archive').scrollTop += scr;
    }
    if (f.pressed.toggleView || f.pressed.pause || f.pressed.dash || padSnap.pressed.cancel) closePanel();
  } else if (mode === 'cipher') {
    const sorted = [...words].sort();
    if (padSnap.connected && sorted.length) {
      if (padSnap.navX !== 0 || padSnap.navY !== 0) {
        cipherCursor = ((cipherCursor + padSnap.navX + padSnap.navY * 3) % sorted.length + sorted.length) % sorted.length;
        renderCipher();
      }
      if (padSnap.pressed.confirm) {
        const w = sorted[cipherCursor];
        if (w) { cipherSel.has(w) ? cipherSel.delete(w) : cipherSel.add(w); sfx.note(w[0]); renderCipher(); }
      }
      if (padSnap.pressed.strike || padSnap.pressed.rt || padSnap.pressed.start) {
        $('ciOpen').click(); return;
      }
    }
    if (f.pressed.pause || f.pressed.dash || padSnap.pressed.cancel) closePanel();
  } else if (mode === 'pause') {
    if (padSnap.connected) {
      if (padSnap.navX !== 0 || padSnap.navY !== 0) {
        pauseSel += padSnap.navX !== 0 ? padSnap.navX : padSnap.navY;
        updatePauseFocus();
      }
      if (padSnap.pressed.confirm) { pauseButtons()[pauseSel]?.click(); return; }
    }
    if (f.pressed.pause || f.pressed.dash || padSnap.pressed.cancel) closePanel();
  } else if (mode === 'dialog' && dlg) {
    const n = dlg.current();
    const choices = n?.choices ?? [];
    if (choices.length) {
      if (padSnap.navX !== 0 || padSnap.navY !== 0) {
        dlgSel = ((dlgSel + (padSnap.navX !== 0 ? padSnap.navX : padSnap.navY)) % choices.length + choices.length) % choices.length;
        updateDlgFocus();
      }
      if (padSnap.pressed.confirm) { renderDialog(dlg.choose(dlgSel)); return; }
      const lane = f.laneTaps[0];
      if (lane !== undefined) {
        const idx = ({ 2: 0, 3: 1, 1: 2, 0: 3 } as Record<number, number>)[lane] ?? 0;
        if (idx < choices.length) { renderDialog(dlg.choose(idx)); return; }
      }
    } else if (f.pressed.jump || padSnap.pressed.confirm) {
      renderDialog(dlg.next()); return;
    }
    if (f.pressed.pause || padSnap.pressed.cancel) { dlg = null; show('dialog', false); mode = 'play'; }
  } else if (mode === 'end') {
    if (padSnap.pressed.confirm || padSnap.pressed.start) {
      const btn = $('dlgChoices').querySelector('button');
      btn?.click();
    }
  }
}

// ── boot ──
async function boot() {
  const validLevels: LevelId[] = ['glossa', 'cavern', 'minecart', 'rapids', 'wilds', 'temple'];
  const rawWant = (new URLSearchParams(location.search).get('level') ?? '') as LevelId;
  const hasSave = hasSavedProgress();
  const startId: LevelId = validLevels.includes(rawWant)
    ? rawWant
    : (hasSave && EXPLORABLE_LEVELS.includes(save.lastLevel) ? save.lastLevel : 'glossa');
  const starter = project.levels.find((l) => l.id === startId) ?? project.levels[0]!;
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
  const resumePos: [number, number, number] | undefined =
    hasSave && !validLevels.includes(rawWant) && EXPLORABLE_LEVELS.includes(startId) && Array.isArray(save.lastPos)
      ? [save.lastPos[0], 0, save.lastPos[1]]
      : undefined;
  loadLevel(startId, resumePos);
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
    for (const c of P.g.children) if (!c.userData.keepVisible) c.visible = false; // keep 3D slash arc VFX visible!
    P.g.add(s.root);
    if (DEBUG) console.info('[lexicon] the Scribe is here (Character Forge)');
  }).catch((e) => console.warn('[lexicon] Scribe model unavailable, keeping the stand-in:', e));
  renderPadMap();
  updateDifficultyLabels();
  bootReady = true;
  if (hasSave) {
    const levelNames: Record<string, string> = {
      glossa: 'Glossa Hollow', cavern: 'Crystal Cavern', wilds: 'Great Forest Wilderness', temple: 'Temple of Numerals',
    };
    const sumEl = $('saveSummary');
    sumEl.textContent = `✦ Saved Journey · ${words.size} Words · ${save.reclaimed.length} Zones Reclaimed · ${levelNames[save.lastLevel] ?? 'Glossa Hollow'}`;
    sumEl.style.display = 'block';
    $('startBtn').textContent = 'Continue Journey';
    $('newGameBtn').style.display = 'inline-block';
  } else {
    $('startBtn').textContent = 'Begin';
  }
  frame = input.poll(0);
  requestAnimationFrame(loop);
  const begin = (freshStart = false) => {
    if (freshStart) {
      localStorage.removeItem(SAVE_KEY);
      save = fresh();
      words.clear();
      for (const w of STARTING_WORDS) words.add(w);
      P.hp = save.maxHp;
      elk.bonded = false; elk.mounted = false; elk.visible = false; elk.root.visible = false;
      onboarding.state.movedDist = 0; onboarding.state.lookedAmt = 0;
      onboarding.state.talkedMira = false; onboarding.state.lassoedHome = false;
      onboarding.state.rolled = false; onboarding.state.rescuedCombat = false; onboarding.state.playedSong = false;
      onboarding.state.id = 'move_look';
      dayClockSec = 0; todManualOverride = false; save.tod = todFromCycleSec(0);
      loadLevel('glossa', [0, 0, 7], Math.PI);
      persist(true);
    }
    audioUnlocked = true;
    audioStart();
    playPlaylist(playlistForRegion(project.assets, activeSetPiece?.kind ?? lvl.id), activeSetPiece?.kind ?? lvl.id, 1.8);
    ensureMusicPlaying();
    $('title').style.display = 'none'; mode = 'play'; canvas.focus();
    updateCoach();
  };
  $('startBtn').onclick = () => begin(false);
  $('newGameBtn').onclick = () => begin(true);
  if (inStudio()) begin(false);
}
void boot();

if (DEBUG) (window as unknown as { __lex: unknown }).__lex = {
  get state() { return { scribe: !!scribe, villagersLoaded: villagerCast?.loadedCount ?? 0, mode, level: activeSetPiece?.kind ?? lvl?.id, P: { x: P.x, y: P.y, z: P.z, hp: P.hp }, elk: { visible: elk.visible, mounted: elk.mounted, unlocked: save.elkUnlocked }, pad: { connected: padSnap.connected, style: padSnap.style, pref: padMgr.getStylePref(), usePadPrompts, glyphs: padMgr.getActiveGlyphs() }, cycle: { sec: dayClockSec, phase: currentDayPhase(), tod: save.tod, light: lexSky?.light ?? 1, clock: clockText() }, music: { track: currentTrackTitle(), tracksTotal: project.assets.filter((a) => a.id.startsWith('music:')).length }, difficulty: save.difficulty, blooms: reclaimBlooms.length, onboarding: { ...onboarding.state }, words: [...words], reclaimed: [...save.reclaimed], enemies: enemies.filter((e) => e.alive).map((e) => ({ k: e.kind, x: e.x, z: e.z, s: e.state, zId: e.zoneId })), save, task: task?.text, budget: engine.budget, rules: rules?.log, move: frame ? [frame.moveX, frame.moveY] : null, keys: [...keys] }; },
  give: (...w: string[]) => w.forEach((x) => freeWord(x.toUpperCase())),
  lasso: () => fireWordLasso(),
  elk: () => { save.elkUnlocked = true; elk.bonded = true; toggleElkMount(); },
  step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frameTick(dt); },
  /** Fast-forward villager schedules & simulation without redundant software WebGL renders during automated QA. */
  advanceSchedules: (secs: number) => {
    const dt = 0.1;
    const steps = Math.max(1, Math.round(secs / dt));
    for (let i = 0; i < steps; i++) {
      simT += dt;
      if (lvl?.id === 'glossa' && villagerCast) {
        villagerCast.update(dt, simT, P.x, P.z, currentDayPhase(), lvl.heightAt);
      }
    }
  },
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
  tp: (x: number, z: number) => { [P.x, P.z] = collide(x, z, 0.45); P.y = lvl.heightAt(P.x, P.z); },
  /** Face (and put the camera behind) a yaw; 0 looks along +Z. */
  face: (yaw: number) => { P.yaw = yaw; cam.snapBehind(yaw); },
  /** Turnaround view: the Scribe faces `yaw`, the camera looks at him from `view` radians round (0 front, π/2 his left
   *  side, π back) at `dist` metres — compared against the art's turnaround (scripts/lexicon/shots.mjs). */
  portrait: (yaw: number, view = 0, dist = 3.4) => { P.yaw = yaw; cam.yaw = yaw + Math.PI + view; cam.pitch = 0.08; cam.distance = dist; cam.height = dist < 2 ? 1.55 : 0.9; cam.jump(); },
  load: (id: LevelId) => loadLevel(id),
  hurtNearest: () => { const e = enemies.filter((x) => x.alive && x.kind !== 'redactor').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0]; if (e) { e.hp = 0; openChallenge(e); } },
  answer: (i: number) => answer(i),
  correct: () => ch?.c.answer,
  cast: (w: string) => castSong(w),
  talk: (id: string) => talk(id),
  strike: (i: number) => strikePillar(i),
  strikeNow: (atkT = 0.36) => { P.atkT = atkT; P.atkHit = false; sfx.swing(); },
  skipIntro: () => { onboarding.skip(); updateCoach(); },
  taskKeys: () => task?.k,
  setTod: (t: number) => { todManualOverride = true; save.tod = t; },
  setCycleSec: (s: number) => { todManualOverride = false; dayClockSec = s; save.tod = todFromCycleSec(s); },
  bridges: () => GLOSSA_BRIDGES,
  heightAt: (x: number, z: number) => lvl.heightAt(x, z),
  villagers: () => VILLAGERS.map((v) => {
    const pos = villagerCast ? villagerCast.getPosition(v.id) : v.pos;
    return {
      id: v.id, name: v.name, role: v.role, pos, homePos: v.homePos,
      sleeping: villagerCast?.isSleepingHome(v.id) ?? false, nightWatch: Boolean(v.nightWatch),
      y: lvl.heightAt(pos[0], pos[1]),
    };
  }),
  reclaim: (zoneId: string) => {
    for (const e of enemies) if (e.zoneId === zoneId) { e.alive = false; scene.remove(e.g); }
    checkZoneReclaimed(zoneId);
  },
  openCipher: () => openCipher(),
  saveNow: () => persist(false),
  nextTrack: () => skipMusicTrack(),
  setDiff: (d: CipherDifficulty) => { save.difficulty = d; updateDifficultyLabels(); },
  reset: () => { localStorage.removeItem(SAVE_KEY); location.reload(); },
};
