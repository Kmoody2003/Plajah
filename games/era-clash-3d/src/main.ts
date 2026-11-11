// Era Clash 3D: Tales of the Ages, third-person. First tale, The Falling Petal; first chapter playable,
// "Smoke Over the Valley". Built on Ravencrest's engine core (src/core, copied from games/ravencrest/src):
// the WebGPU renderer and post chain with iGPU tiers + dynamic resolution, the capsule player and follow
// camera, contract-rig characters with CMU motion capture, authored strikes, and the mob AI.
import * as THREE from 'three/webgpu';
import { buildPost } from './core/post';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { texture, equirectUV, positionWorldDirection, mix, smoothstep, vec3 } from 'three/tsl';
import { initKTX2 } from './core/ktx2';
import { setTextureTier } from './core/materials';
import { CollisionWorld } from './core/collision';
import { PlayerController } from './core/player';
import { loadJack, prefetchHero, type Character, type CombatMove } from './core/character';
import { Mob, preloadMobs, type MobKind } from './core/mobs';
import { buildChapter1, roadX } from './chapter1';
import { FALLING_PETAL, type Foe } from './tale';
import { cutMove, HARU_MOVES, type CutMove } from './moves';
import { goldenHour } from './look';
import { Townsfolk } from './townsfolk';
import { OTSU } from './otsu';
import { Forest } from './core/forest';
import { Binds, openBindEditor, type Action } from './binds';
import { Props, type Body } from './props';
import { Villagers } from './villagers';

const params = new URLSearchParams(location.search);
const $ = (id: string) => document.getElementById(id)!;
const CH = Math.max(0, Math.min(3, Number(params.get('chapter') ?? 0)));
const chapter = FALLING_PETAL.chapters[CH];
const scholar = params.get('mode') === 'scholar';

// ── Quality tier by GPU (Ravencrest canon: the Intel Arc iGPU at 60 fps is the baseline) ─────────────
prefetchHero('haru');
const adapterInfo = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
  .then((a) => (a as unknown as { info?: { vendor?: string; architecture?: string } } | null)?.info).catch(() => undefined);
const integrated = !adapterInfo || /intel|qualcomm|apple|arm/i.test(adapterInfo.vendor ?? '') || /xe-|gen-|integrated/i.test(adapterInfo.architecture ?? '');
const inDesktopApp = (() => { const has = (w: Window | null) => { try { return !!(w as unknown as { chrome?: { webview?: unknown } })?.chrome?.webview; } catch { return false; } }; return has(window) || has(window.top); })();
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
const quality = (params.get('q') ?? (isMobile ? 'low' : inDesktopApp ? 'ultra' : integrated ? 'medium' : 'high')) as 'low' | 'medium' | 'high' | 'ultra';
const Q = {
  low:    { pr: 1.0, res: 540, resMin: 380, shadow: 0 },
  medium: { pr: 1.0, res: 720, resMin: 480, shadow: 1536 },   // long golden-hour shadows are the look; a tight frustum round Haru
  high:   { pr: Math.min(devicePixelRatio, 1.5), res: 1080, resMin: 720, shadow: 2048 },
  ultra:  { pr: Math.min(devicePixelRatio, 2), res: 2160, resMin: 900, shadow: 4096 },
}[quality];
const frameTarget = isMobile ? 33.3 : 16.7;
setTextureTier(quality === 'high' || quality === 'ultra' ? '2k' : '1k');
console.info(`[eraclash3d] GPU ${adapterInfo?.vendor ?? '?'} ${adapterInfo?.architecture ?? ''} → ${quality}`);

const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance', reversedDepthBuffer: true });
await renderer.init();
initKTX2(renderer);
renderer.setPixelRatio(Q.pr);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('view').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.15, 14000);   // the volcano stands 4 km up the valley
camera.rotation.order = 'YXZ';

// ── The world ───────────────────────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8a5a6a, 70, 620);
const hemi = new THREE.HemisphereLight(0xb8a8d8, 0x6a5040, 2.4); scene.add(hemi);
const amb = new THREE.AmbientLight(0x6a5a6a, 0.6); scene.add(amb);
/** Where the sun is (set from the HDRI when there is one); the light follows the player along it. */
let lookCtl: { setRaid(k: number): void } | null = null;
let raidK = 0, raidShown = -1;
const sunDir = new THREE.Vector3(-120, 60, 260).normalize();
const sun = new THREE.DirectionalLight(0xffb088, 3.2);
sun.position.set(-120, 60, 260);
if (Q.shadow && !params.has('noshadow')) { sun.castShadow = true; sun.shadow.mapSize.setScalar(Q.shadow); const r = Q.shadow > 2048 ? 40 : 26; Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: 600 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; }
scene.add(sun, sun.target);
$('loadMsg').textContent = 'Painting the valley';
const world = await buildChapter1();
scene.add(world.group);

// ── The sky: a photographed CC0 Poly Haven HDRI is both the backdrop and the light (image-based lighting).
//    The directional sun is aimed from the HDRI's own sun, and the fog takes its horizon colour. ?painted keeps
//    the painted sky; ?sky=kiara swaps the coastal sunset (Cape Hill) for a mountain valley sunset.
if (!params.has('painted')) {
  const SKIES: Record<string, string> = { qwantani: 'qwantani_sunset-2k.hdr', spruit: 'spruit_sunrise-2k.hdr', cape: 'cape_hill-2k.hdr', kiara: 'kiara_8_sunset-2k.hdr' };
  const file = SKIES[params.get('sky') ?? 'qwantani'] ?? SKIES.qwantani;
  try {
    const hdr = await new HDRLoader().loadAsync(`/games/era-clash/3d/assets/hdri/${file}`);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = hdr;
    scene.environment = hdr;
    world.group.getObjectByName('paintedSky')!.visible = false;
    world.group.getObjectByName('paintedBackdrop')!.visible = false;
    // the reference shots' look (look.ts): golden-hour sun up the valley, haze, grade
    const g = goldenHour({ scene, hdr, sun, sunDir, hemi, amb });
    lookCtl = g;
    console.info(`[eraclash3d] sky ${file}: photo sun ${g.photoElevation.toFixed(1)}°, turned ${THREE.MathUtils.radToDeg(g.rotation).toFixed(0)}°`);
  } catch (e) { console.warn('[eraclash3d] HDRI failed, keeping the painted sky', e); }
}
const collision = new CollisionWorld(scene);
collision.rebuild();
// the village's loose props (pots to throw, tables to kick) and the villagers the raiders hold
const props = new Props(collision);
for (const pr of world.village.props) props.add(pr.mesh as THREE.Mesh, pr.kind);
props.batch();
scene.add(props.group);
const villagers = new Villagers(world.village.huddles);
void villagers.dress();
scene.add(villagers.group);
const SAFETY = new THREE.Vector3(roadX(62), world.heightAt(roadX(62), 62), 62);
// the townsfolk going about their day until the raiders come (townsfolk.ts)
const townsfolk = new Townsfolk({ heightAt: world.heightAt, roadX, plaza: { x: roadX(OTSU.plaza.z), z: OTSU.plaza.z, r: OTSU.plaza.r }, safety: SAFETY, wallZ: OTSU.wallZ,
  quay: { x0: -47, x1: -13, z: -66.5, top: 1.45 } });
scene.add(townsfolk.group);
void townsfolk.dress();
const _threats: THREE.Vector3[] = [];
// Edges: 4× MSAA on the scene pass (FXAA on the HDR scene colour corrupted the frame); ?msaa=0|2|4 overrides
const MSAA = params.has('msaa') ? Number(params.get('msaa')) : quality === 'low' ? 0 : 4;
// the forest's far impostors are baked from the real tree variants once the renderer is up (core/forest.ts);
// trees outside the view are skipped per instance (a tree just behind the camera may lose its shadow into view: the
// forest's leaves are drawn three times — depth prepass, lit, shadow — so drawing them all costs millions of triangles)
Forest.cull = !params.has('nocull');
// then warm every shader the chapter will need (raid fires and embers, each tree variant, the impostors) while it
// loads: WebGPU compiles a pipeline the first time a thing is drawn, and mid-fight that was a visible freeze
world.forest.bake(renderer).then(async () => {
  const k = raidShown;
  world.setRaid(1); world.forest.unpack();
  try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn('[eraclash3d] shader warm-up', e); }
  world.setRaid(Math.max(0, k));
  console.info('[eraclash3d] shaders warmed');
}).catch((e) => console.warn('[eraclash3d] forest impostors failed', e));
// Contact shadow (GTAO) and sun shafts on medium and up; ?noao / ?norays turn them off
const post = buildPost(renderer, scene, camera, { ssr: false, ssrScale: 0.5, bloom: quality === 'low' || params.has('nobloom') ? false : 'lean', taa: false, smaa: false, upscale: true, msaa: MSAA,
  ao: quality !== 'low' && !params.has('noao'), rays: quality !== 'low' && Q.shadow > 0 && !params.has('norays') ? sun : undefined });

// ── Haru and the warband ───────────────────────────────────────────────────────────────────────────
const player = new PlayerController(renderer.domElement);
player.world = collision;
// Ravencrest's fight camera, set a step wider: three fighters and a crowd share the frame.
player.camDist = 4.3;
player.turnAboutKey = null;   // Q is block here
player.teleport(world.spawn.position, world.spawn.yaw);
scene.add(player.object);
$('loadMsg').textContent = 'Haru draws his sword';
let haru: Character | null = null;
/** Haru's strikes, cut from CMU motion capture by his Atlas art (moves.ts); the authored poses are the fallback. */
const mocapMoves = new Map<string, CutMove>();
const heroReady = loadJack('haru').then(async (c) => {
  haru = c; player.character = c; player.object.add(c.root);
  // painted cloth and lacquer, not chrome: drop the baked gloss, as for the sheet cast (mobs.ts matte)
  c.root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      if (!mat.isMeshStandardMaterial) continue;
      mat.roughnessMap = null; mat.roughness = 0.8; mat.metalness = 0; mat.color.setHex(0xe2dad2);
      for (const t of [mat.map, mat.normalMap]) if (t) t.anisotropy = 8;
      mat.needsUpdate = true;
    }
  });
  $('loadMsg').textContent = 'Haru remembers his forms';
  await Promise.all(Object.entries(HARU_MOVES).map(async ([k, d]) => {
    try { const m = await cutMove(c.model, k, d); if (m) { c.addMove(k, m.clip); mocapMoves.set(k, m); } } catch (e) { console.warn('[eraclash3d] move', k, e); }
  }));
  console.info(`[eraclash3d] ${mocapMoves.size}/${Object.keys(HARU_MOVES).length} motion-capture strikes`);
});
const ALLY_KIND: Record<string, MobKind> = { monk: 'monk', knight: 'knight', gladiator: 'gladiator', samurai: 'samurai', viking: 'viking', raider: 'raider', chieftain: 'chieftain' };
// Foes: the wakō are the turnaround-sheet raiders (Bjorn the ally keeps the viking model).
const FOE_KIND = (c: string): MobKind => (c === 'viking' ? 'raider' : ALLY_KIND[c] ?? 'raider');
const allies: Mob[] = chapter.allies.map((id, i) => {
  const m = new Mob(ALLY_KIND[id] ?? 'monk', 'ally', world.spawn.position.clone().add(new THREE.Vector3(i ? 2.2 : -2.2, 0, -2)), 'ch');
  scene.add(m.object);
  return m;
});
const ALLY_NAMES: Record<string, string> = { monk: 'Chen', knight: 'Roland', gladiator: 'Maximus', viking: 'Bjorn', samurai: 'Haru' };
await Promise.all([heroReady, preloadMobs([...new Set([...chapter.allies.map((a) => ALLY_KIND[a]), ...chapter.foes.map((f) => FOE_KIND(f.c)), 'chieftain' as MobKind])])]);

// ── Sound: Era Clash's own: the Chora score cue for the chapter's arena and the game's effects bank ─────
// (public/games/era-clash/audio, built by scripts/games/buildEraClashAudio.ts). Nothing from Ravencrest.
const actx = new AudioContext();
const master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
const sfxBus = actx.createGain(); sfxBus.connect(master);
const SFX = new Map<string, AudioBuffer[]>();
void fetch('/games/era-clash/audio/manifest.json').then((r) => r.json()).then(async (man: { sfx: Record<string, string[]> }) => {
  await Promise.all(Object.entries(man.sfx).map(async ([name, files]) => {
    const bufs = await Promise.all(files.map((f) => fetch('/games/era-clash/audio/' + f).then((x) => x.arrayBuffer()).then((b) => actx.decodeAudioData(b)).catch(() => null)));
    SFX.set(name, bufs.filter((b): b is AudioBuffer => !!b));
  }));
}).catch(() => {});
// Recorded CC0 fight sounds (assets/sfx: punches, sword slashes, steel on steel, falls): every hit, block, swing
// and fall plays a real recording; Era Clash's own bank keeps the taiko calls and stingers.
const REC = new Map<string, AudioBuffer[]>();
void fetch('/games/era-clash/3d/assets/sfx/sfx.json').then((r) => r.json()).then(async (m: Record<string, { files: string[] }>) => {
  await Promise.all(Object.entries(m).map(async ([name, e]) => {
    const bufs = await Promise.all(e.files.map((f) => fetch('/games/era-clash/3d/assets/sfx/' + f).then((x) => x.arrayBuffer()).then((b) => actx.decodeAudioData(b)).catch(() => null)));
    REC.set(name, bufs.filter((b): b is AudioBuffer => !!b));
  }));
}).catch(() => {});
/** Game sound name → recorded layers [name, gain, rate range]. */
const RECORDED: Record<string, [string, number, [number, number]][]> = {
  hit: [['punch', 0.9, [0.92, 1.08]]],
  hitHard: [['punch', 1, [0.78, 0.9]], ['hurt_grunt', 0.45, [0.9, 1.05]]],
  slash: [['slash', 0.95, [0.92, 1.06]]],
  block: [['clash', 0.8, [0.95, 1.1]]],
  parry: [['clash', 1, [1.05, 1.2]]],
  swing: [['swing', 0.55, [1.0, 1.2]]],
  swingHeavy: [['swing', 0.7, [0.8, 0.92]]],
  bodyfall: [['body_fall', 0.95, [0.9, 1.05]]],
  shatter: [['glass_break', 0.75, [0.55, 0.7]], ['wood_break', 0.35, [1.3, 1.5]]],
  splinter: [['wood_break', 0.95, [0.9, 1.1]]],
  thud: [['body_fall', 0.45, [1.2, 1.45]]],
};
const playBuf = (b: AudioBuffer, gain: number, rate: [number, number]) => {
  const src = actx.createBufferSource(); src.buffer = b;
  src.playbackRate.value = rate[0] + Math.random() * (rate[1] - rate[0]);
  const g = actx.createGain(); g.gain.value = gain; src.connect(g); g.connect(sfxBus); src.start();
};
const sfx = (name: string, gain = 1, rate: [number, number] = [0.94, 1.06]) => {
  const rec = RECORDED[name];
  if (rec && rec.every(([n]) => REC.get(n)?.length)) {
    for (const [n, g, r] of rec) { const t = REC.get(n)!; playBuf(t[(Math.random() * t.length) | 0], g * gain, r); }
    return;
  }
  const takes = SFX.get(name); if (!takes?.length) return;
  const src = actx.createBufferSource(); src.buffer = takes[(Math.random() * takes.length) | 0];
  src.playbackRate.value = rate[0] + Math.random() * (rate[1] - rate[0]);
  const g = actx.createGain(); g.gain.value = gain; src.connect(g); g.connect(sfxBus); src.start();
};
let music: AudioBufferSourceNode | null = null;
async function startMusic(cue: string) {
  try {
    const man = await fetch('/games/era-clash/audio/manifest.json').then((r) => r.json());
    const m = man.music?.[cue]; if (!m) return;
    const buf = await fetch('/games/era-clash/audio/' + m.file).then((r) => r.arrayBuffer()).then((b) => actx.decodeAudioData(b));
    music?.stop();
    music = actx.createBufferSource(); music.buffer = buf; music.loop = true; music.loopStart = m.loopStart; music.loopEnd = m.loopEnd;
    const g = actx.createGain(); g.gain.value = 0.45; music.connect(g); g.connect(master); music.start();
  } catch { /* music is optional */ }
}

// ── Story card (read-then-fight; Scholar locks Begin until the chapter is read) ─────────────────────────
type Mode = 'story' | 'play' | 'won' | 'lost';
let mode: Mode = 'story';
function showStory() {
  $('stKicker').textContent = `HARU · ${FALLING_PETAL.title.toUpperCase()}`;
  $('stTitle').textContent = `Chapter ${['I', 'II', 'III', 'IV'][CH]} — ${chapter.title}`;
  $('stPlace').textContent = `${chapter.place.toUpperCase()} · ${FALLING_PETAL.era}`;
  $('stBody').innerHTML = (CH === 0 ? FALLING_PETAL.intro.concat(chapter.story) : chapter.story).map((p) => `<p>${p}</p>`).join('');
  const go = $('stGo') as HTMLButtonElement, body = $('stBody');
  go.disabled = scholar;
  $('stCheck').textContent = scholar ? 'Read each chapter to its end — the battle unlocks when the tale is read.' : '';
  const check = () => { if (body.scrollTop + body.clientHeight >= body.scrollHeight - 20) { go.disabled = false; $('stCheck').textContent = 'Read and remembered. The field awaits.'; } };
  body.onscroll = check; requestAnimationFrame(check);
  $('story').classList.add('on');
}
$('stGo').addEventListener('click', () => {
  $('story').classList.remove('on');
  void actx.resume(); void startMusic('3d-ch1');
  mode = 'play';
  card(chapter.title, chapter.place);
  startSection(0);
  try { (renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* the pane refuses it; drag-to-look still works */ }
});
showStory();
$('loading').classList.add('done');

// ── Waves: the chapter's foes, split across the shore, the village and the hilltop ─────────────────────
const waves: Foe[][] = [[], [], []];
const rest = chapter.foes.filter((f) => !f.boss), bosses = chapter.foes.filter((f) => f.boss);
rest.forEach((f, i) => waves[Math.min(2, Math.floor(i * 3 / Math.max(1, rest.length)))].push(f));
bosses.forEach((f) => waves[2].push(f));
let section = 0;
const enemies: Mob[] = [];
const names = new Map<Mob, string>();
/** Each section's crew: the tale's named foes, plus enough of their raiders for three fighters to take on. */
const CREW = [7, 9, 10];
let pending: Foe[] = [], spawnT = 0;
function startSection(i: number) {
  section = i;
  const s = world.sections[i];
  const crew: Foe[] = [];
  for (let k = 0; k < CREW[i] - waves[i].length; k++) crew.push({ c: 'viking', n: k % 3 === 2 ? 'Wakō Oarsman' : 'Wakō Raider', hp: 0.5, dm: 0.7 });
  pending = [...crew.slice(0, 3), ...waves[i].filter((f) => !f.boss), ...crew.slice(3), ...waves[i].filter((f) => f.boss)];
  // the village is the chieftain's: he comes last, after his crew
  if (i === 1) pending.push({ c: 'chieftain', n: 'Wakō Chieftain', hp: 1.1, dm: 1 });
  spawnT = 0;
  sfx('taikoWave', 1);
  // the village: two captors stand over each group of villagers
  if (i === 1) world.village.huddles.forEach((h) => { for (const sx of [-1, 1]) spawnFoe({ c: 'viking', n: 'Wakō Captor', hp: 0.55, dm: 0.7 }, h.clone().add(new THREE.Vector3(sx * 1.6, 0, 1.4)), 1.3); });
  $('hudWave').textContent = `${s.name.toUpperCase()} · WAVE ${i + 1} / 3`;
}
function spawnFoe(f: Foe, fixed?: THREE.Vector3, aggro = 4) {
  const s = world.sections[section];
  const base = s.spawn[(Math.random() * s.spawn.length) | 0];
  const at = fixed ? fixed.clone() : base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
  at.y = world.heightAt(at.x, at.z);
  const m = new Mob(FOE_KIND(f.c), 'enemy', at, 'ch', Math.PI);
  m.hp = m.maxHp = Math.round(m.maxHp * f.hp * 1.4);
  m.power = f.dm;
  m.aggroMul = aggro;
  names.set(m, f.n);
  if (f.boss) bossMobs.add(m);
  scene.add(m.object);
  enemies.push(m);
}
function updateWaves(dt: number) {
  if (mode !== 'play' || !pending.length) return;
  spawnT -= dt;
  const alive = enemies.filter((m) => m.alive).length;
  if (spawnT <= 0 && alive < 4) { spawnFoe(pending.shift()!); spawnT = 0.9; }
}
function card(title: string, sub: string) {
  $('cardT').textContent = title; $('cardS').textContent = sub.toUpperCase();
  const c = $('card'); c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
}

// ── Haru's fighting: Era Clash's strings on the authored moves ─────────────────────────────────────────
const hero = { hp: 140, maxHp: 140, meter: 0, block: false, hurt: 0, inv: 0, combo: 0, comboT: 0, alive: true };
const STRINGS: Record<'punch' | 'kick' | 'blade', { move: CombatMove; dmg: number; reach: number; arc: number; speed: number }[]> = {
  punch: [{ move: 'jab', dmg: 9, reach: 2.0, arc: 0.85, speed: 1.25 }, { move: 'hook', dmg: 11, reach: 2.1, arc: 1.0, speed: 1.2 }, { move: 'jab', dmg: 9, reach: 2.0, arc: 0.85, speed: 1.3 }, { move: 'hook', dmg: 15, reach: 2.2, arc: 1.1, speed: 1.1 }],
  kick:  [{ move: 'frontKick', dmg: 12, reach: 2.4, arc: 0.8, speed: 1.15 }, { move: 'roundhouse', dmg: 15, reach: 2.5, arc: 1.3, speed: 1.1 }, { move: 'spinKick', dmg: 20, reach: 2.7, arc: 2.6, speed: 1.0 }],
  blade: [{ move: 'cleave', dmg: 22, reach: 3.0, arc: 1.2, speed: 1.15 }, { move: 'sweep', dmg: 19, reach: 3.2, arc: 2.2, speed: 1.1 }, { move: 'combo', dmg: 30, reach: 3.1, arc: 1.4, speed: 1.05 }],
};
type Kind = keyof typeof STRINGS;
/** Stances on 1 / 2 / 3 (Ravencrest's keys): jodan hits hardest and breaks guards, chudan is the fastest and
 *  forgiving on the block, gedan kicks sweep wide and drive men off their feet. */
type Stance = 'HIGH' | 'MID' | 'LOW';
const STANCE: Record<Stance, { name: string; dmg: number; tempo: number; guard: number; knock: number; arc: number; perfect: number; col: string }> = {
  HIGH: { name: 'JŌDAN · HIGH', dmg: 1.25, tempo: 0.94, guard: 0.45, knock: 1.1, arc: 1, perfect: 280, col: '#ff9d6a' },
  MID:  { name: 'CHŪDAN · MID', dmg: 1, tempo: 1.1, guard: 1, knock: 1, arc: 1, perfect: 420, col: '#f0c46a' },
  LOW:  { name: 'GEDAN · LOW', dmg: 0.95, tempo: 1, guard: 0.85, knock: 1.7, arc: 1.4, perfect: 300, col: '#9fd8ff' },
};
let stance: Stance = 'MID';
function setStance(st: Stance) {
  if (stance === st) return;
  stance = st;
  $('stance').textContent = STANCE[st].name; ($('stance') as HTMLElement).style.color = STANCE[st].col;
  if (mode === 'play') { floatText(player.object.position, STANCE[st].name, STANCE[st].col); sfx('swing', 0.4); }
}
/** Seconds from the press to the blow landing (the captured wind-up is squeezed into this), and the follow-through rate. */
const TO_HIT: Record<Kind, number> = { punch: 0.09, kick: 0.14, blade: 0.12 };
const POST: Record<Kind, number> = { punch: 1.7, kick: 1.5, blade: 1.45 };
let chainStep = 0, chainT = 0, heat = 0, curHitT = 0, counterT = 0, heroSpeed = 0, lastKind: Kind = 'punch';
/** A tap that lands mid-blow waits here and fires the moment this blow connects (the chain opens at contact). */
let buffered: { kind: Kind; t: number } | null = null;
let pendingHit: { at: number; t: number; dmg: number; reach: number; arc: number; super?: boolean; knock: number; finisher: boolean; guard: number } | null = null;
/** Knockback per blow (m/s): the string's closers and kicks drive a raider back, a spin kick sends him flying. */
const KNOCK: Record<Kind, number[]> = { punch: [0, 0, 0, 4.5], kick: [2.5, 4, 8], blade: [0, 3, 6.5] };
/** The raider the current combo is locked onto (Ravencrest's lock). */
let lock: Mob | null = null;
/** Roll: i-frames while Haru tumbles through; a blow that would have landed during it is an evade. */
const ROLL_TIME = 0.42;
let rollT = -1, rollCd = 0, evadeCd = 0, blockAt = 0;
const bossMobs = new Set<Mob>();
const stuck = new Map<Mob, { at: THREE.Vector3; t: number; detour: number }>();
let slowmo = 0, hitstop = 0, flashT = 0;
/** The chain opens once the blow has visibly landed (a beat of follow-through, never a twitch). */
const CHAIN_AFTER: Record<Kind, number> = { punch: 0.07, kick: 0.11, blade: 0.1 };
const canChain = () => { const a = haru?.acting; return !a || a.t >= curHitT + CHAIN_AFTER[lastKind]; };
function strike(kind: Kind) {
  if (!haru || mode !== 'play' || !hero.alive) return;
  if (held) { throwHeld(); return; }
  // mid-roll or mid-blow: hold the press and fire it the instant it can go (roll-out strikes, seamless strings)
  if ((rollT >= 0 && rollT < ROLL_TIME * 0.55) || !canChain()) { buffered = { kind, t: 0.45 }; return; }
  buffered = null;
  const chaining = chainT > 0;
  // one string across all three buttons: mixing punch, kick and blade keeps the flow and walks every string
  chainStep = chaining ? chainStep + 1 : 0;
  heat = chaining ? Math.min(6, heat + 1) : 0;
  lastKind = kind;
  const str = STRINGS[kind], idx = chainStep % str.length, s = str[idx], st = STANCE[stance];
  const tempo = st.tempo * (1 + heat * 0.05);
  // Lock (Ravencrest): keep him while he lives and stays near, unless you steer toward someone else.
  const p = player.object.position, input = player.inputDir();
  const toLock = lock ? lock.object.position.clone().sub(p).setY(0) : null;
  if (!lock || !lock.alive || !toLock || toLock.length() > 8 || (input.lengthSq() > 0 && toLock.lengthSq() > 0.01 && toLock.angleTo(input) > 1.0)) lock = pickTarget(8);
  const dash = heroSpeed > 3.6 && !chaining;
  if (lock) {
    const to = lock.object.position.clone().sub(p).setY(0), d = to.length();
    player.faceYaw(Math.atan2(to.x, to.z), 1);
    // close the gap in one stride: a master never swings at air
    if (d > s.reach * 0.7) player.impulse(to.normalize(), Math.min(22, (d - s.reach * 0.55) / 0.12), 0.12, false);
    else if (d > 1.1) player.impulse(to.normalize(), 2.6, 0.08, false);
  } else player.impulse(new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)), 3, 0.1, false);
  const key = `${kind}_${idx}`, cap = mocapMoves.get(key);
  const toHit = TO_HIT[kind] / tempo;
  const dur = cap ? haru.act(key, POST[kind] * tempo, { hit: cap.hitAt, toHit }) : haru.act(s.move, s.speed * 1.5 * tempo);
  curHitT = cap ? toHit : dur * 0.3;
  chainT = dur + 0.3;
  const counter = counterT > 0;
  if (counter) { counterT = 0; slowmo = Math.max(slowmo, 0.3); floatText(p, 'COUNTER', '#ffe08a'); }
  if (dash) floatText(p, kind === 'kick' ? 'FLYING KICK' : kind === 'blade' ? 'DRAWING CUT' : 'RUSHING STRIKE', '#fff3d6');
  const last = idx === str.length - 1;
  pendingHit = {
    at: curHitT, t: 0,
    dmg: s.dmg * st.dmg * (counter ? 2 : 1) * (dash ? 1.25 : 1) * (1 + heat * 0.03),
    reach: s.reach + 0.3 + (dash ? 0.6 : 0), arc: (s.arc + 0.3) * (kind === 'kick' ? st.arc : 1),
    knock: (KNOCK[kind][idx] ?? 0) * (kind === 'kick' ? st.knock : 1) + (dash ? 5 : 0) + (counter ? 3 : 0),
    finisher: last || counter || dash, guard: st.guard,
  };
  sfx(kind === 'blade' ? 'swingHeavy' : 'swing', 0.75, [1.05 + heat * 0.03, 1.2 + heat * 0.03]);
}
// ── Grab and throw (pots, jars, crates): lift it over your head, then throw it at the raider you're locked on ──
let held: Body | null = null, throwT = -1;
function grabOrThrow() {
  if (!haru || mode !== 'play' || !hero.alive || throwT >= 0) return;
  if (held) { throwHeld(); return; }
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const b = props.nearestGrab(player.object.position, fwd);
  if (!b) return;
  props.grab(b); held = b;
  player.object.attach(b.mesh);
  b.mesh.position.set(0, 1.9, 0.1); b.mesh.quaternion.identity();
  sfx('swing', 0.35, [0.8, 0.9]);
}
function throwHeld() {
  if (!haru || !held || throwT >= 0) return;
  if (!lock || !lock.alive || lock.object.position.distanceTo(player.object.position) > 16) lock = pickTarget(16);
  if (lock) { const to = lock.object.position.clone().sub(player.object.position).setY(0); player.faceYaw(Math.atan2(to.x, to.z), 1); }
  const dur = haru.act('throw', 1.6);
  throwT = dur * 0.42;
  sfx('swingHeavy', 0.7);
}
function releaseHeld() {
  if (!held) return;
  const b = held; held = null;
  const from = b.mesh.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  let vel = fwd.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3, 0));
  if (lock?.alive) {
    const aim = lock.object.position.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(from);
    const flat = Math.hypot(aim.x, aim.z), sp = 17, t = Math.max(0.12, flat / sp);
    vel = new THREE.Vector3(aim.x / t, Math.min(9, (aim.y + 0.5 * 20 * t * t) / t), aim.z / t);
  }
  props.throw(b, from, vel);
}
props.onHit = (b, t, speed, dmg) => {
  const m = t.ref as Mob;
  const killed = m.damage(dmg, b.mesh.position);
  if (!killed && !bossMobs.has(m)) m.vel.add(new THREE.Vector3(b.vel.x, 0, b.vel.z).multiplyScalar(0.35));
  spark(m.object.position, 0xffd27a);
  sfx('hitHard', 0.9);
  hitstop = Math.max(hitstop, 0.05); player.shake = Math.max(player.shake, 0.15);
  hero.meter = Math.min(100, hero.meter + (killed ? 18 : 8));
  if (killed) sfx('bodyfall', 0.9);
  void speed;
};
props.onBreak = (_b, how) => sfx(how, 0.9);
props.onThud = (_p, speed) => sfx('thud', Math.min(1, speed / 9));
// villagers: freed when their captors are down and Haru reaches them
villagers.onFreed = () => {
  hero.hp = Math.min(hero.maxHp, hero.hp + 8); hero.meter = Math.min(100, hero.meter + 15);
  floatText(player.object.position, `Villager freed  ${villagers.saved}/${villagers.total}`, '#a8e6a1');
};
function superMove() {
  if (!haru || mode !== 'play' || hero.meter < 100) return;
  hero.meter = 0;
  const dur = haru.act('kata', 1.1);
  pendingHit = { at: dur * 0.55, t: 0, dmg: 60, reach: 5.5, arc: Math.PI * 2, super: true, knock: 9, finisher: true, guard: 0 };
  slowmo = 1.2; card('Falling Petal Iaido', 'Super');
  sfx('super', 0.9);
}
/** Best raider to hit: close, and toward where the player steers (or the camera looks). */
function pickTarget(range: number) {
  const p = player.object.position;
  const input = player.inputDir();
  const want = input.lengthSq() ? input : new THREE.Vector3(-Math.sin(player.camYaw), 0, -Math.cos(player.camYaw));
  let best: Mob | null = null, bs = Infinity;
  for (const m of enemies) {
    if (!m.alive || !m.ready) continue;
    const to = m.object.position.clone().sub(p);
    if (Math.abs(to.y) > 2.5) continue;
    to.setY(0);
    const d = to.length();
    if (d > range) continue;
    const score = d + to.normalize().angleTo(want) * 1.6;
    if (score < bs) { bs = score; best = m; }
  }
  return best;
}
/** Combat roll (Ravencrest): a dash with i-frames while Haru tumbles through it; cancels a blow at any point. */
function roll() {
  if (!haru || mode !== 'play' || !hero.alive || rollCd > 0) return;
  if (haru.acting) { haru.cancel(); pendingHit = null; buffered = null; }
  rollT = 0;
  const dir = player.inputDir();
  player.impulse(dir.lengthSq() ? dir : new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)), 8.5, ROLL_TIME * 0.85, !!dir.lengthSq());
  hero.inv = ROLL_TIME; rollCd = 0.55;
  sfx('dash', 0.6);
}
function resolveHeroHit(h: NonNullable<typeof pendingHit>) {
  const p = player.object.position, fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  let landed = 0;
  for (const m of enemies) {
    if (!m.alive) continue;
    const to = m.object.position.clone().sub(p).setY(0); const d = to.length();
    const locked = m === lock && d < h.reach + 0.8;
    if (!locked && (d > h.reach || (d > 0.6 && Math.acos(THREE.MathUtils.clamp(to.clone().normalize().dot(fwd), -1, 1)) > h.arc / 2 + 0.15))) continue;
    to.normalize();
    // Guard: a fighter on guard turns or slips a blow (a string's closer and supers can't be read).
    const g = m.spec.guard;
    if (!h.finisher && g && m.guarding) {
      const r = Math.random() / Math.max(0.05, h.guard);
      if (r < g.deflect) { m.deflect(p); sfx('parry', 0.8); spark(m.object.position, 0xfff0c0); player.impulse(fwd.clone().negate(), 3.5, 0.14, false); hitstop = Math.max(hitstop, 0.06); floatText(m.object.position, 'Deflected', '#c8d6ff'); continue; }
      if (r < g.deflect + g.evade) { m.dodge(p); continue; }
    }
    const killed = m.damage(h.dmg * (1 + hero.combo * 0.04) * (h.finisher ? 1.3 : 1), p);
    if (!killed && h.knock && !bossMobs.has(m)) m.vel.addScaledVector(to, h.knock);
    landed++;
    spark(m.object.position, 0xffd27a);
    sfx(lastKind === 'blade' ? 'slash' : h.dmg >= 15 ? 'hitHard' : 'hit', 0.9);
    if (killed){ sfx('bodyfall', 0.9); hero.meter = Math.min(100, hero.meter + 18); }
  }
  // the same blow meets the furniture: a kick launches tables, crates and barrels; a punch or a cut breaks pottery
  const pn = props.strike(p, fwd, h.reach, h.arc, h.super ? 16 : lastKind === 'kick' ? 11 + h.knock : 5, !h.super && lastKind !== 'kick');
  if (pn && !landed) { hitstop = Math.max(hitstop, 0.025); player.shake = Math.max(player.shake, 0.08); }
  if (landed){
    hero.combo = hero.comboT > 0 ? hero.combo + landed : landed; hero.comboT = 1.4;
    hero.meter = Math.min(100, hero.meter + 7 * landed);
    hitstop = Math.max(hitstop, h.super ? 0.16 : h.finisher ? 0.08 : 0.032);
    player.kick = Math.min(1.5, player.kick + (h.finisher ? 1 : 0.6));
    player.shake = Math.max(player.shake, h.super ? 0.5 : h.finisher ? 0.22 : 0.1);
    if (h.super) flashT = 0.25;
  }
}
// enemies and allies swing: whoever they're facing within reach takes it
const strikeLog: { team: string; d: number; dot: number }[] = [];
function onMobStrike(m: Mob) {
  const reach = m.spec.reach + 0.35, p = m.object.position;
  const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
  const facing = (q: THREE.Vector3) => { const to = q.clone().sub(p).setY(0); const d = to.length(), dot = to.normalize().dot(fwd); if (strikeLog.length < 200) strikeLog.push({ team: m.team, d: +d.toFixed(2), dot: +dot.toFixed(2) }); return d < reach && dot > 0.35; };
  if (m.team === 'enemy') {
    const pp = player.object.position;
    if (hero.alive && facing(pp)) {
      const back = p.clone().sub(pp).setY(0).normalize();
      const hfwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      if (rollT >= 0) {
        // rolled clear of a blow that would have landed: a little health back for the evade
        if (evadeCd <= 0) { evadeCd = 1; hero.hp = Math.min(hero.maxHp, hero.hp + 4); floatText(pp, 'Evaded +4', '#9fe8b0'); counterT = 0.9; }
      } else if (hero.inv > 0) {
        // still shaking off the last blow
      } else if (hero.block && back.dot(hfwd) > 0.1) {
        // guard up and facing it: a block soaks most of it; raised just in time it soaks all, heals, and staggers him
        const perfect = performance.now() - blockAt < STANCE[stance].perfect;
        hero.inv = 0.35; player.shake = Math.max(player.shake, 0.15);
        sfx(perfect ? 'parry' : 'block', 0.9); spark(pp, 0xfff0c0);
        if (perfect) { hero.hp = Math.min(hero.maxHp, hero.hp + 6); m.damage(1, pp); hero.meter = Math.min(100, hero.meter + 10); floatText(pp, 'Perfect block +6', '#ffe08a'); counterT = 0.9; }
        else hero.hp = Math.max(1, hero.hp - m.spec.dmg * m.power * 0.25);
      } else {
        // hit: he flinches and is knocked back still facing his man; no stun, so he can answer at once
        hero.hp = Math.max(0, hero.hp - m.spec.dmg * m.power);
        hero.inv = 0.5;
        sfx('hitHard', 0.8); player.flinch(); player.shake = Math.max(player.shake, 0.35);
        player.impulse(back.clone().negate(), 5, 0.12, false);
        // struck from the side or behind: turn to face him and lock on
        if (back.dot(hfwd) < 0.75) { player.faceThreat(Math.atan2(back.x, back.z)); lock = m; }
        if (hero.hp <= 0) { hero.alive = false; lose(); }
      }
      return;
    }
    for (const a of allies) if (a.alive && facing(a.object.position)) {
      const st = STYLE[chapter.allies[allies.indexOf(a)]], r = Math.random();
      if (st && r < st.guard.deflect) { a.deflect(p); sfx('parry', 0.5); spark(a.object.position, 0xfff0c0); return; }
      if (st && r < st.guard.deflect + st.guard.evade) { a.dodge(p); return; }
      a.damage(m.spec.dmg * m.power * 0.6, p); sfx('hit', 0.5); return;
    }
  } else {
    for (const e of enemies) if (e.alive && facing(e.object.position)) { e.damage(m.spec.dmg * 0.8, p); spark(e.object.position, 0xffd27a); sfx('hit', 0.5); return; }
  }
}

// ── Companions fight in their own arts ──────────────────────────────────────────────────────────────
// Chen (Shaolin): quick and slippery, chains fast blows and every few seconds spins his staff through a crowd.
// Roland (Armizare): slow and heavy, hard to hurt through his guard, and shield-bashes a crowd off its feet.
const STYLE: Record<string, { haste: number; power: number; guard: { deflect: number; evade: number }; special: 'whirl' | 'bash'; every: number; radius: number; dmg: number; shove: number; name: string }> = {
  monk:   { haste: 1.35, power: 0.8, guard: { deflect: 0.2, evade: 0.45 }, special: 'whirl', every: 6.5, radius: 3.4, dmg: 18, shove: 7, name: 'STAFF WHIRLWIND' },
  knight: { haste: 0.85, power: 1.35, guard: { deflect: 0.55, evade: 0.05 }, special: 'bash', every: 8, radius: 3.0, dmg: 26, shove: 13, name: 'SHIELD BASH' },
};
const special = new Map<Mob, number>();
allies.forEach((a, i) => {
  const st = STYLE[chapter.allies[i]]; if (!st) return;
  a.haste = st.haste; a.power = st.power; special.set(a, st.every * 0.5);
});
function updateCompanions(dt: number) {
  allies.forEach((a, i) => {
    const st = STYLE[chapter.allies[i]]; if (!st || !a.alive || mode !== 'play') return;
    const left = (special.get(a) ?? st.every) - dt; special.set(a, left);
    if (left > 0) return;
    const near = enemies.filter((e) => e.alive && e.object.position.distanceTo(a.object.position) < st.radius);
    if (near.length < (st.special === 'bash' ? 1 : 2)) { special.set(a, 0.5); return; }
    special.set(a, st.every);
    for (const e of near) {
      e.damage(st.dmg, a.object.position);
      e.vel.add(e.object.position.clone().sub(a.object.position).setY(0).normalize().multiplyScalar(st.shove));
      spark(e.object.position, st.special === 'whirl' ? 0xffc46a : 0xdfe6ff);
    }
    sfx(st.special === 'whirl' ? 'swingHeavy' : 'hitHard', 1);
    player.shake = Math.max(player.shake, 0.2);
    floatText(a.object.position, st.name, st.special === 'whirl' ? '#ffc46a' : '#dfe6ff');
  });
}
const floats: { el: HTMLDivElement; p: THREE.Vector3; t: number }[] = [];
function floatText(at: THREE.Vector3, text: string, col: string) {
  const el = document.createElement('div'); el.className = 'lab'; el.style.color = col; el.style.fontSize = '14px'; el.textContent = text;
  $('labels').appendChild(el); floats.push({ el, p: at.clone().add(new THREE.Vector3(0, 2.6, 0)), t: 1.2 });
}

// ── Hit sparks ──────────────────────────────────────────────────────────────────────────────────────
const sparkGeo = new THREE.SphereGeometry(0.06, 6, 4);
const sparks: { m: THREE.Mesh; v: THREE.Vector3; t: number }[] = [];
function spark(at: THREE.Vector3, col: number) {
  const mat = new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(sparkGeo, mat); m.position.copy(at).add(new THREE.Vector3(0, 1.3, 0));
    scene.add(m); sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7), t: 0.35 });
  }
}

// ── Input ───────────────────────────────────────────────────────────────────────────────────────────
// Rebindable (binds.ts): keys and all five mouse buttons, side buttons included. Esc pauses and opens the editor.
const binds = new Binds();
const refreshHint = () => { $('keys').innerHTML = binds.hint(); };
refreshHint();
let paused = false, editor: ReturnType<typeof openBindEditor> | null = null;
function setPaused(on: boolean) {
  if (mode !== 'play' && on) return;
  paused = on;
  $('pause').classList.toggle('on', on);
  if (on) { hero.block = false; buffered = null; document.exitPointerLock?.(); }
  else { editor?.close(); editor = null; try { (renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* */ } }
}
$('pResume').addEventListener('click', () => setPaused(false));
$('pControls').addEventListener('click', () => { editor = openBindEditor($('binds'), binds, refreshHint); });
$('gear').addEventListener('click', () => { if (mode === 'play') setPaused(true); editor = openBindEditor($('binds'), binds, refreshHint); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && mode === 'play' && !paused && hadLock) setPaused(true); hadLock = !!document.pointerLockElement; });
let hadLock = false;
function press(a: Action) {
  if (mode !== 'play' || paused) return;
  switch (a) {
    case 'punch': case 'kick': case 'blade': strike(a); break;
    case 'block': if (!hero.block) blockAt = performance.now(); hero.block = true; break;
    case 'roll': roll(); break;
    case 'jump': player.jump(); sfx('jump', 0.5); break;
    case 'super': superMove(); break;
    case 'grab': grabOrThrow(); break;
    case 'stanceHigh': setStance('HIGH'); break;
    case 'stanceMid': setStance('MID'); break;
    case 'stanceLow': setStance('LOW'); break;
  }
}
function release(a: Action) { if (a === 'block') hero.block = false; }
const inUi = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('#story, #end, #pause, #binds, #gear');
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { if (editor?.listening) return; if (mode === 'play') setPaused(!paused); return; }
  if (e.repeat) return;
  const acts = binds.actionsFor(e.code);
  if (acts.length && mode === 'play') e.preventDefault();
  acts.forEach(press);
});
addEventListener('keyup', (e) => binds.actionsFor(e.code).forEach(release));
addEventListener('blur', () => { hero.block = false; });
addEventListener('mousedown', (e) => {
  if (inUi(e.target) || paused) return;
  const acts = binds.actionsFor(`Mouse${e.button}`);
  if (acts.length) e.preventDefault();
  acts.forEach(press);
});
addEventListener('mouseup', (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault();   // the side buttons never navigate away mid-fight
  binds.actionsFor(`Mouse${e.button}`).forEach(release);
});
addEventListener('auxclick', (e) => { if (!inUi(e.target)) e.preventDefault(); });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
// Pad: X punch, A kick, B block, Y katana, RB roll, LT+RT super (Era Clash's own layout)
const padPrev: boolean[] = [];
function pollPad() {
  const pad = navigator.getGamepads?.()[0]; if (!pad) return;
  const b = (i: number) => !!pad.buttons[i]?.pressed, edge = (i: number) => b(i) && !padPrev[i];
  player.stick.set(Math.abs(pad.axes[0]) > 0.15 ? pad.axes[0] : 0, Math.abs(pad.axes[1]) > 0.15 ? -pad.axes[1] : 0);
  if (Math.abs(pad.axes[2] ?? 0) > 0.15 || Math.abs(pad.axes[3] ?? 0) > 0.15) player.look(-(pad.axes[2] ?? 0) * 0.05, -(pad.axes[3] ?? 0) * 0.03);
  if (mode === 'play') {
    if (edge(2)) strike('punch'); if (edge(0)) strike('kick'); if (edge(3)) strike('blade');
    if (b(1) && !hero.block) blockAt = performance.now();
    hero.block = b(1);
    if (edge(5)) roll();
    if (b(6) && b(7)) superMove();
  }
  for (let i = 0; i < pad.buttons.length; i++) padPrev[i] = b(i);
}

// ── HUD ─────────────────────────────────────────────────────────────────────────────────────────────
function hud() {
  ($('hpFill') as HTMLElement).style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  ($('mtFill') as HTMLElement).style.width = `${hero.meter}%`;
  $('mt').classList.toggle('full', hero.meter >= 100);
  $('foes').textContent = `FOES ${enemies.filter((m) => m.alive).length + pending.length}${section >= 1 ? ` · VILLAGERS ${villagers.saved}/${villagers.total}` : ''}`;
  $('combo').textContent = hero.combo >= 2 && hero.comboT > 0 ? `${hero.combo} HITS` : '';
  $('allyBars').innerHTML = allies.map((a, i) => `<div><span>${ALLY_NAMES[chapter.allies[i]] ?? ''}</span><i style="width:${(a.hp / a.maxHp) * 100}%"></i></div>`).join('');
}
const labelLayer = $('labels');
const labelEls = new Map<Mob, HTMLDivElement>();
function labels() {
  const v = new THREE.Vector3();
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t -= 1 / 60; f.p.y += 0.02;
    v.copy(f.p).project(camera);
    f.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    f.el.style.opacity = String(Math.min(1, f.t * 2));
    if (f.t <= 0) { f.el.remove(); floats.splice(i, 1); }
  }
  for (const m of enemies) {
    let el = labelEls.get(m);
    if (!el) { el = document.createElement('div'); el.className = 'lab'; el.innerHTML = `<b>${names.get(m)}</b><i><u></u></i>`; labelLayer.appendChild(el); labelEls.set(m, el); }
    v.copy(m.object.position).add(new THREE.Vector3(0, 2.25, 0)).project(camera);
    const vis = m.alive && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && m.object.position.distanceTo(camera.position) < 40;
    el.style.display = vis ? 'block' : 'none';
    if (vis) { el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`; (el.querySelector('u') as HTMLElement).style.width = `${(m.hp / m.maxHp) * 100}%`; }
  }
}

// ── End states and Plajah XP (the 2D game's rule: chapter win 40 + 15 × chapter index) ─────────────────
function win() {
  if (mode !== 'play') return;
  mode = 'won';
  sfx('taikoWin', 1);
  const xp = 40 + 15 * CH;
  try { window.parent?.postMessage({ type: 'plajah.xp', gameId: 'era-clash', amount: xp, reason: `3D · ${chapter.title}` }, '*'); } catch { /* standalone */ }
  setTimeout(() => { $('endT').textContent = 'The Field Is Yours'; $('endS').textContent = `${chapter.title} is won. +${xp} XP · villagers saved ${villagers.saved}/${villagers.total}`; $('end').classList.add('on'); document.exitPointerLock?.(); }, 1800);
}
function lose() {
  mode = 'lost';
  setTimeout(() => { $('endT').textContent = 'Haru Falls'; $('endS').textContent = 'The field is lost — but the tale is not. Fight it again.'; $('end').classList.add('on'); document.exitPointerLock?.(); }, 1400);
}
$('endAgain').addEventListener('click', () => location.reload());
$('endBack').addEventListener('click', () => { location.href = '/games/era-clash/index.html'; });

// ── The frame ───────────────────────────────────────────────────────────────────────────────────────
let simTime = 0, internalH = Number(params.get('res')) || Q.res, frameEma = 16, scaleTimer = 0;
const resMax = Math.max(internalH, Math.round(innerHeight * Math.min(devicePixelRatio, 2)));
function applyRes() { const buf = renderer.getDrawingBufferSize(new THREE.Vector2()); post.setInternalScale(Math.min(1, internalH / Math.max(1, buf.y))); }
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyRes(); }
addEventListener('resize', resize); resize();
const ZERO = new THREE.Vector3();

function tick(rawDt: number) {
  if (paused) return;
  let dt = rawDt;
  if (hitstop > 0) { hitstop -= rawDt; dt = rawDt * 0.05; }
  if (slowmo > 0) { slowmo -= rawDt; dt *= 0.35; }
  simTime += dt;
  pollPad();
  if (hero.hurt > 0) hero.hurt -= dt;
  if (hero.inv > 0) hero.inv -= dt;
  if (hero.comboT > 0) hero.comboT -= dt; else hero.combo = 0;
  if (chainT > 0) chainT -= dt; else heat = 0;
  rollCd -= dt; evadeCd = Math.max(0, evadeCd - dt);
  player.enabled = mode === 'play' && hero.alive;
  player.speedScale = hero.block ? 0.4 : haru?.acting ? 0.55 : 1;
  player.faceLock = !!haru?.acting;
  // until the blow lands, keep turning onto the locked raider (he moves; the strike follows him)
  if (pendingHit && lock?.alive) {
    const to = lock.object.position.clone().sub(player.object.position).setY(0);
    if (to.lengthSq() > 0.01) player.faceYaw(Math.atan2(to.x, to.z), Math.min(1, dt * 14));
  }
  player.update(dt, camera);
  // roll: tumble the body one full turn about a pivot at hip height, tucked mid-roll
  if (haru && rollT >= 0) {
    rollT += dt;
    const r = haru.root, k = Math.min(1, rollT / ROLL_TIME);
    const a = (k * k * (3 - 2 * k)) * Math.PI * 2, h = 0.55;
    r.rotation.x = a; r.position.set(0, h - h * Math.cos(a), -h * Math.sin(a)); r.scale.set(1, 1 - 0.25 * Math.sin(k * Math.PI), 1);
    if (k >= 1) { rollT = -1; r.rotation.x = 0; r.position.set(0, 0, 0); r.scale.set(1, 1, 1); }
  }
  const sp = Math.hypot(player.object.position.x - lastPos.x, player.object.position.z - lastPos.z) / Math.max(dt, 1e-4);
  playerVel.copy(player.object.position).sub(lastPos).divideScalar(Math.max(dt, 1e-4));
  lastPos.copy(player.object.position);
  heroSpeed = sp;
  if (haru) { haru.setLocomotion(sp, 1.6, 4.8); haru.mixer.update(dt); }
  if (pendingHit) { pendingHit.t += dt; if (pendingHit.t >= pendingHit.at) { const h = pendingHit; pendingHit = null; resolveHeroHit(h); } }
  if (buffered) { buffered.t -= dt; if (buffered.t <= 0) buffered = null; else if (canChain() && !(rollT >= 0 && rollT < ROLL_TIME * 0.55)) { const k = buffered.kind; buffered = null; strike(k); } }
  // after the blow lands, steering cuts the follow-through: you are never stuck finishing a move
  { const a = haru?.acting; if (a && !pendingHit && !buffered && a.t > curHitT + 0.1 && a.t < a.dur - 0.12 && player.inputDir().lengthSq() > 0) haru!.cancel(); }
  if (counterT > 0) counterT -= dt;
  updateCompanions(dt);
  updateWaves(dt);
  if (throwT >= 0) { throwT -= dt; if (throwT < 0) releaseHeld(); }
  {
    const pp0 = player.object.position;
    const near = [...enemies, ...allies].filter((m) => m.alive && m.object.position.distanceTo(pp0) < 16);
    props.update(dt, { pos: pp0, vel: playerVel }, near.map((m) => ({ pos: m.object.position, vel: m.vel })),
      enemies.filter((m) => m.alive).map((m) => ({ pos: m.object.position, alive: m.alive, ref: m })), world.heightAt);
    _threats.length = 0; for (const m of enemies) if (m.alive) _threats.push(m.object.position);
    townsfolk.update(dt, camera.position, pp0, _threats, section >= 1);
    villagers.update(dt, simTime, pp0, (at) => enemies.some((m) => m.alive && m.object.position.distanceTo(at) < 6), world.heightAt, SAFETY, roadX);
  }
  // the warband
  const heroTarget = { pos: player.object.position, alive: hero.alive };
  for (const a of allies) {
    let foe: Mob | null = null, bd = 24;
    for (const e of enemies) if (e.alive) { const d = e.object.position.distanceTo(a.object.position); if (d < bd) { bd = d; foe = e; } }
    const side = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw)).multiplyScalar(allies.indexOf(a) ? 2.6 : -2.6);
    const lead = player.object.position.clone().add(side).add(new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(1.5));
    a.update(dt, collision, foe ? { pos: foe.object.position, alive: true } : null, lead, onMobStrike);
  }
  for (const m of [...allies, ...enemies]) {
    const near = m.object.position.distanceTo(camera.position) < 1.6;
    m.object.visible = !near;
  }
  // Ravencrest's director: the two closest raiders on Haru may swing (his companions draw the rest); the
  // others take posts behind him and to his sides, so turning to fight one leaves your back open, and wait.
  const pp = player.object.position;
  const engaged = enemies.filter((m) => m.alive && m.ready && m.object.position.distanceTo(pp) < 9)
    .sort((a, b) => a.object.position.distanceTo(pp) - b.object.position.distanceTo(pp));
  const TOKENS = 2, behind = player.yaw + Math.PI;
  for (const m of enemies) {
    const i = engaged.indexOf(m);
    m.mayAttack = i < TOKENS || bossMobs.has(m);
    if (i >= TOKENS) { const a = behind + (((i - TOKENS) % 2 ? 1 : -1) * (0.5 + 0.55 * Math.floor((i - TOKENS) / 2))); m.flank = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); }
    else m.flank = null;
  }
  // bodies push apart (Haru vs everyone, everyone vs each other): no clipping through a crowd
  const bodies = [...enemies, ...allies].filter((m) => m.alive && m.ready && m.object.position.distanceTo(pp) < 20);
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i].object.position;
    const dp = a.clone().sub(pp).setY(0), dl = dp.length();
    if (dl < 0.85 && dl > 1e-4 && Math.abs(a.y - pp.y) < 1.5) { const o = (0.85 - dl) * 0.5; bodies[i].push.addScaledVector(dp.normalize(), o); player.push.addScaledVector(dp, -o); }
    for (let j = i + 1; j < bodies.length; j++) {
      const d = a.clone().sub(bodies[j].object.position).setY(0), l = d.length();
      if (l < 0.9 && l > 1e-4) { d.normalize().multiplyScalar((0.9 - l) * 0.5); bodies[i].push.add(d); bodies[j].push.sub(d); }
    }
  }
  // camera framing: keep the nearest raider in view and pull back with the crowd (player.ts eases it)
  player.combatFocus = engaged[0] && hero.alive ? engaged[0].object.position : null;
  player.combatCount = engaged.length;
  for (const e of enemies) {
    // each raider takes the nearest of Haru and his companions
    let tgt: { pos: THREE.Vector3; alive: boolean } = heroTarget, bd = e.object.position.distanceTo(player.object.position) - 1.5;
    for (const a of allies) if (a.alive) { const d = e.object.position.distanceTo(a.object.position); if (d < bd) { bd = d; tgt = { pos: a.object.position, alive: true }; } }
    // no pathfinding: a raider pinned against a house for a while detours back to the road, then rejoins
    const sk = stuck.get(e) ?? { at: e.object.position.clone(), t: 0, detour: 0 };
    if (e.alive && e.state === 'chase' && bd > 3) { sk.t += dt; if (sk.t > 1.6) { if (sk.at.distanceTo(e.object.position) < 0.8) sk.detour = 2.2; sk.t = 0; sk.at.copy(e.object.position); } }
    else { sk.t = 0; sk.at.copy(e.object.position); }
    if (sk.detour > 0) { sk.detour -= dt; const z = e.object.position.z + Math.sign(tgt.pos.z - e.object.position.z) * 3; tgt = { pos: new THREE.Vector3(roadX(z), world.heightAt(roadX(z), z), z), alive: true }; }
    stuck.set(e, sk);
    e.update(dt, collision, tgt, null, onMobStrike);
  }
  // the fallen leave the field
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i] as Mob & { goneT?: number };
    if (!e.alive) { e.goneT = (e.goneT ?? 0) + dt; if (e.goneT > 3) { scene.remove(e.object); enemies.splice(i, 1); labelEls.get(e)?.remove(); labelEls.delete(e); } }
  }
  // section flow: clear a wave, the way up the valley opens
  if (mode === 'play' && !enemies.some((m) => m.alive) && !pending.length) {
    if (section >= 2) win();
    else {
      const next = world.sections[section + 1];
      $('go').classList.add('on');
      if (player.object.position.z > next.zMin - 6) {
        $('go').classList.remove('on'); card(next.name, chapter.place); startSection(section + 1);
        // a breath between fights: the warband binds its wounds
        hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * 0.35);
        allies.forEach((a) => { if (a.alive) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.35); });
      }
    }
  }
  // sparks, fires, petals
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t -= dt; s.v.y -= 14 * dt; s.m.position.addScaledVector(s.v, dt); if (s.t <= 0) { scene.remove(s.m); sparks.splice(i, 1); } }
  // the raid at dusk: golden hour on the beach; once the Outer Wall is breached the light goes and the town burns
  // (?look=raid / ?look=gold pin it)
  {
    const pin = params.get('look'), target = pin === 'raid' ? 1 : pin === 'gold' ? 0 : section >= 1 ? 1 : 0;
    raidK += Math.sign(target - raidK) * Math.min(Math.abs(target - raidK), dt / 7);
    if (raidK !== raidShown) { raidShown = raidK; lookCtl?.setRaid(raidK); world.setRaid(raidK); }
  }
  world.update(dt, simTime, camera);
  sun.target.position.copy(player.object.position); sun.position.copy(player.object.position).addScaledVector(sunDir, 280);
  void ZERO;
}
const lastPos = player.object.position.clone();
const playerVel = new THREE.Vector3();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta();
  frameEma += (raw * 1000 - frameEma) * 0.1;
  scaleTimer += raw;
  if (params.get('dynres') !== '0' && scaleTimer > 0.5) {
    scaleTimer = 0;
    const next = frameEma > frameTarget * 1.08 ? internalH * 0.92 : frameEma < frameTarget * 0.84 ? internalH * 1.04 : internalH;
    const c = Math.round(THREE.MathUtils.clamp(next, Q.resMin, resMax));
    if (Math.abs(c - internalH) >= 8) { internalH = c; applyRes(); }
  }
  tick(Math.min(raw, 0.05));
  if (mode !== 'story') { hud(); labels(); }
  $('flash').style.opacity = String(Math.max(0, flashT -= raw) * 3);
  camHold?.();
  world.forest.cull(camera);   // after any camera change this frame: the trees drawn match the view rendered
  post.pipeline.render();
  if (params.has('fps')) $('fps').textContent = `${(1000 / frameEma).toFixed(0)} fps · ${internalH}p · ${quality}`;
});

// ── Dev hooks (Ravencrest pattern): simulate without rendering, capture review frames ──────────────────
/** Dev: a camera the loop re-applies every frame (WebGPU captures read the last presented frame). */
let camHold: (() => void) | null = null;
(window as unknown as Record<string, unknown>).eraclash3d = {
  hold(f: (() => void) | null) { camHold = f; },
  townsfolk,
  /** Dev: one of each Era Clash tree variant in a row on the beach, for tuning (returns the lineup's centre). */
  treeLab(species = ['umbrella', 'cherry'], size = 9) {
    scene.getObjectByName('treeLab')?.removeFromParent();
    const lab = new THREE.Group(); lab.name = 'treeLab'; scene.add(lab);
    const F = world.forest as unknown as { variants: { species: string; bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null }[]; group: THREE.Group };
    const vs = F.variants.filter((v) => species.includes(v.species));
    vs.forEach((v, i) => {
      for (const geo of [v.bark, v.leaves]) {
        if (!geo) continue;
        const src = F.group.children.find((m) => (m as THREE.Mesh).geometry === geo && ((m as THREE.Mesh).material as THREE.Material).colorWrite !== false) as THREE.Mesh | undefined;
        if (!src) continue;
        const m = new THREE.Mesh(geo, src.material); m.scale.setScalar(size);
        const x = -((vs.length - 1) * size) / 2 + i * size + 2, z = -68; m.position.set(x, world.heightAt(x, z), z); lab.add(m);
      }
    });
    return new THREE.Vector3(2, world.heightAt(2, -68), -68);
  },
  renderer, perf: () => ({ fpsText: document.getElementById('fps')?.textContent, frameEma, internalH, quality, msaa: MSAA }),
  pause(p: boolean) { setPaused(p); },
  get state() { return { mode, section, hero: { ...hero }, enemies: enemies.map((m) => ({ k: m.kind, hp: Math.round(m.hp), alive: m.alive, st: m.state })), allies: allies.map((a) => ({ hp: Math.round(a.hp), st: a.state })), pos: player.object.position.toArray().map((n) => +n.toFixed(1)) }; },
  begin() { ($('stGo') as HTMLButtonElement).disabled = false; $('stGo').click(); },
  simulate(seconds: number, held: string[] = []) { held.forEach((k) => player.keys.add(k)); for (let t = 0; t < seconds; t += 1 / 30) tick(1 / 30); held.forEach((k) => player.keys.delete(k)); return (this as unknown as { state: unknown }).state; },
  strike, superMove, roll, grabOrThrow, props, villagers, setStance, binds, spawnFoe, lockedOn: () => lock, player, camera, scene, world, enemies, allies, strikeLog,
  warp(z: number) { const x = roadX(z); player.teleport(new THREE.Vector3(x, world.heightAt(x, z), z), 0); allies.forEach((a, i) => a.object.position.set(x + (i ? 2 : -2), world.heightAt(x, z), z - 2)); },
  async capture(name: string) {
    post.pipeline.render();
    const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
    await fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: url }).catch(() => {});
    return url.length;
  },
};
