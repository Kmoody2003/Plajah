// Rift Realm — front end: Start → Map select → Character select, then the loading screen (loadProgress.ts).
//
// Pure DOM + CSS + <video>, up the moment the page opens, while the renderer starts behind it. Everything works with
// keyboard (arrows / WASD, Enter, Esc), mouse (hover, click, drag the pedestal) and controller (d-pad / left stick,
// A confirm, B back, LB / RB cycle, right stick turns the vessel). While the player browses, the chosen map's textures
// and baked layers, the character models and the files the level fetched last time start downloading (prefetch), so
// the loading screen has less to do.
//
// Skipped (straight into the level from the URL, the old behaviour) with ?rrdebug, ?studio=1 or ?menu=0.
import type * as THREE from 'three/webgpu';
import './menu.css';
import { CHARS, MAPS, statsFor, type CharCard, type MapCard } from './content';
import { Pedestal } from './pedestal';
import { installFastCompile } from './fastCompile';
import { preloadCharacters } from '../characters';
import { getKTX2, initKTX2, preloadSets } from '../textures';
import { moduleByParam, type LevelModule } from '../studio/levelModules';
import { RhythmEngine } from '../rhythm';
import { WEAPONS } from '../weapons';
import { VESSELS, type VesselId } from '../vessels';

export type Quality = 'auto' | 'low' | 'high';
export interface MenuChoice { level: string; vessel: VesselId; quality: Quality }

const qs = () => new URLSearchParams(location.search);
export const menuSkipped = () => { const q = qs(); return q.has('rrdebug') || q.get('studio') === '1' || q.get('menu') === '0'; };

// ── settings (saved) ──
const SKEY = 'rift-realm-settings';
export interface Settings { quality: Quality; sens: number; volume: number }
export const settings: Settings = (() => {
  const d: Settings = { quality: 'auto', sens: 1, volume: 0.8 };
  try { Object.assign(d, JSON.parse(localStorage.getItem(SKEY) ?? '{}')); d.sens = Number(localStorage.getItem('rift-realm-mouse-sens')) || d.sens; } catch { /* private mode */ }
  return d;
})();
function saveSettings() {
  try { localStorage.setItem(SKEY, JSON.stringify(settings)); localStorage.setItem('rift-realm-mouse-sens', String(settings.sens)); } catch { /* private mode */ }
}
/** Music + sound level on the score's master bus (rhythm.ts keeps it private; 0.7 is its own default). */
export function applyVolume(r: RhythmEngine) {
  const m = (r as unknown as { master: GainNode | null }).master;
  if (m) m.gain.value = 0.7 * settings.volume;
}

// ── prefetch: start the network work for the chosen map / characters while the player is still choosing ──
const levelJobs = new Map<string, Promise<void>>();
let charJob: Promise<void> | null = null;
const LKEY = 'rift-realm-level-files:';
const warmed = new Set<string>();

export const prefetch = {
  /** Textures (KTX2) + the level's own preload (baked terrain layers). Memoised: the boot awaits the same promise. */
  level(mod: LevelModule): Promise<void> {
    let j = levelJobs.get(mod.param);
    if (!j && getKTX2()) { j = Promise.all([preloadSets(mod.sets), mod.preload?.()]).then(() => undefined); levelJobs.set(mod.param, j); }
    return j ?? Promise.all([preloadSets(mod.sets), mod.preload?.()]).then(() => undefined);
  },
  characters(): Promise<void> { return (charJob ??= preloadCharacters()); },
  /** Warm the HTTP cache with every file this level fetched last time it loaded (models, maps, clips, audio). */
  files(param: string) {
    let list: string[] = [];
    try { list = JSON.parse(localStorage.getItem(LKEY + param) ?? '[]'); } catch { /* none yet */ }
    const todo = list.filter((u) => !warmed.has(u));
    let i = 0;
    const next = (): Promise<void> | void => {
      const u = todo[i++]; if (!u) return;
      warmed.add(u);
      return fetch(u, { priority: 'low' } as RequestInit).then((r) => r.arrayBuffer()).catch(() => undefined).then(next);
    };
    for (let k = 0; k < 4; k++) void next();
  },
  /** After a load: remember which asset files the level fetched, for files() next time. */
  remember(param: string) {
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && /\/(assets|basis)\//.test(u) && !/\.(ts|tsx|js|mjs|css|html)(\?|$)/.test(u));
    try { localStorage.setItem(LKEY + param, JSON.stringify([...new Set(urls)].slice(0, 400))); } catch { /* full */ }
  },
};

// ── input: one stream of menu actions from keys, pads and the mouse ──
type Act = 'left' | 'right' | 'up' | 'down' | 'ok' | 'back' | 'prev' | 'next' | 'reset';
const KEYMAP: Record<string, Act> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back', KeyQ: 'prev', KeyE: 'next', KeyR: 'reset', Delete: 'reset',
};
// standard gamepad: 0 A, 1 B, 4 LB, 5 RB, 9 Start, 12–15 d-pad
const PADMAP: [number, Act][] = [[0, 'ok'], [9, 'ok'], [1, 'back'], [4, 'prev'], [5, 'next'], [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'], [3, 'reset']];

export interface MenuHandle {
  choice: Promise<MenuChoice>;
  /** Hand the renderer over once it's up: the pedestal draws with it and texture prefetch can start. */
  attachRenderer(r: THREE.WebGPURenderer, view: HTMLElement): void;
  /** The score: started on the first press so the menus have music; the game keeps using it. */
  rhythm: RhythmEngine;
  map: MapCard; char: CharCard;
}

export function startMenu(): MenuHandle {
  const rhythm = new RhythmEngine();
  let resolve!: (c: MenuChoice) => void;
  const choice = new Promise<MenuChoice>((r) => { resolve = r; });
  const startLevel = qs().get('level');
  let mapI = Math.max(0, MAPS.findIndex((m) => m.param === startLevel));
  let charI = 0;
  let screen: 'start' | 'settings' | 'map' | 'char' | 'done' = 'start';
  let startI = 0, setI = 0;
  let renderer: THREE.WebGPURenderer | null = null, view: HTMLElement | null = null, pedestal: Pedestal | null = null;
  let audioOn = false;

  const root = document.createElement('div');
  root.className = 'rr-menu';
  root.innerHTML = `
    <div class="rr-bg">
      <video class="rr-bgv a" muted playsinline preload="auto"></video>
      <video class="rr-bgv b" muted playsinline preload="auto"></video>
      <div class="rr-bg-shade"></div>
      <div class="rr-motes">${Array.from({ length: 24 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${8 + (i * 7) % 11}s;--o:${-(i * 1.7) % 11}s;--s:${2 + (i % 4)}px"></i>`).join('')}</div>
    </div>
    <section class="rr-scr rr-start">
      <div class="rr-rune"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="74"/><path d="M100 8 L180 146 L20 146 Z"/><path d="M100 192 L20 54 L180 54 Z"/></svg></div>
      <div class="rr-title"><div class="rr-kicker">The Void Tournament</div><h1>Vesselbound</h1><div class="rr-sub">Fight on the pulse. Every beat is a blade.</div></div>
      <nav class="rr-list">
        <button data-i="0">Start</button><button data-i="1">Settings</button><button data-i="2">Quit</button>
      </nav>
      <div class="rr-hint"><kbd>↑↓</kbd> choose · <kbd>Enter</kbd> / <kbd>A</kbd> select</div>
    </section>
    <section class="rr-scr rr-settings">
      <h2>Settings</h2>
      <div class="rr-set" data-i="0"><span>Graphics quality</span><b class="rr-opt" data-k="quality"></b></div>
      <div class="rr-set" data-i="1"><span>Look sensitivity</span><b class="rr-opt" data-k="sens"></b></div>
      <div class="rr-set" data-i="2"><span>Volume</span><b class="rr-opt" data-k="volume"></b></div>
      <button class="rr-set rr-set-back" data-i="3">Back</button>
      <div class="rr-hint"><kbd>←→</kbd> change · <kbd>Esc</kbd> / <kbd>B</kbd> back</div>
    </section>
    <section class="rr-scr rr-map">
      <header class="rr-step"><b>1</b> Choose the battleground <em class="rr-world">Rift Realm</em></header>
      <div class="rr-map-info"><div class="rr-kicker rr-map-mode"></div><h2 class="rr-map-name"></h2><div class="rr-map-size"></div><p class="rr-map-blurb"></p>
        <button class="rr-go">Choose map <kbd>Enter</kbd></button></div>
      <div class="rr-cards">${MAPS.map((m, i) => `<button class="rr-card" data-i="${i}" style="--accent:${m.accent}"><img src="${m.poster}" alt="" loading="eager"><span>${m.name}</span></button>`).join('')}</div>
      <div class="rr-hint"><kbd>←→</kbd> / <kbd>LB RB</kbd> browse · <kbd>Enter</kbd> / <kbd>A</kbd> choose · <kbd>Esc</kbd> / <kbd>B</kbd> back</div>
    </section>
    <section class="rr-scr rr-char">
      <header class="rr-step"><b>2</b> Choose your vessel <em class="rr-char-map"></em></header>
      <div class="rr-char-left"><div class="rr-kicker rr-char-role"></div><h2 class="rr-char-name"></h2><div class="rr-char-title"></div>
        <p class="rr-char-design"></p><div class="rr-lore"></div></div>
      <div class="rr-stage"><video class="rr-turn" muted loop playsinline preload="auto"></video><div class="rr-stage-ring"></div><div class="rr-stage-note"></div>
        <button class="rr-arrow l" aria-label="Previous vessel">‹</button><button class="rr-arrow r" aria-label="Next vessel">›</button></div>
      <div class="rr-char-right"><div class="rr-load-out"></div><div class="rr-stats"></div><div class="rr-abil"></div>
        <button class="rr-go">Enter the rift <kbd>Enter</kbd></button></div>
      <div class="rr-tabs">${CHARS.map((c, i) => `<button class="rr-tab" data-i="${i}" style="--accent:#${VESSELS[c.id].primaryColor.toString(16).padStart(6, '0')}">${c.name}</button>`).join('')}</div>
      <div class="rr-hint"><kbd>←→</kbd> / <kbd>LB RB</kbd> vessel · drag or right stick to turn · <kbd>Enter</kbd> / <kbd>A</kbd> enter · <kbd>Esc</kbd> / <kbd>B</kbd> back</div>
    </section>`;
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));

  // ── background: two video layers crossfading (map loops on the start / map screens, the combat reel on the
  //    character screen); posters first, so a slow network never shows black ──
  const bgv = [$<HTMLVideoElement>('.rr-bgv.a'), $<HTMLVideoElement>('.rr-bgv.b')];
  let bgFront = 0, bgSrc = '', cycleT = 0, cycleI = 0;
  function setBg(src: string, poster: string) {
    if (src === bgSrc) return;
    bgSrc = src;
    const next = bgv[1 - bgFront], prev = bgv[bgFront];
    next.poster = poster; next.src = src; next.loop = screen !== 'start';
    next.play().catch(() => { /* autoplay refused: the poster stays */ });
    next.classList.add('on'); prev.classList.remove('on');
    window.setTimeout(() => { if (!prev.classList.contains('on')) prev.pause(); }, 900);
    bgFront = 1 - bgFront;
  }
  // the start screen cycles through every map's fly-through
  const cycleStart = () => { if (screen !== 'start' && screen !== 'settings') return; const m = MAPS[cycleI++ % MAPS.length]; setBg(m.video, m.poster); };
  for (const v of bgv) v.addEventListener('ended', cycleStart);

  // ── screens ──
  function show(s: typeof screen) {
    screen = s;
    root.dataset.screen = s;
    $$('.rr-scr').forEach((e) => e.classList.toggle('on', e.classList.contains(`rr-${s}`)));
    if (s === 'start' || s === 'settings') { if (!bgSrc || !MAPS.some((m) => m.video === bgSrc)) cycleStart(); renderStart(); }
    if (s === 'settings') renderSettings();
    if (s === 'map') renderMap();
    if (s === 'char') { renderChar(); startPedestal(); } else stopPedestal();
  }
  function renderStart() { $$('.rr-start .rr-list button').forEach((b, i) => b.classList.toggle('focus', i === startI)); }

  const QUAL: Quality[] = ['auto', 'low', 'high'];
  function renderSettings() {
    const opt = (k: string, label: string, isDefault: boolean) => {
      $(`.rr-opt[data-k="${k}"]`).innerHTML = `<i class="rr-nudge" data-d="-1" title="Lower">‹</i><span class="rr-val">${label}</span><i class="rr-nudge" data-d="1" title="Higher">›</i>`
        + `<i class="rr-reset${isDefault ? ' off' : ''}" title="Reset to default">↺</i>`;
    };
    opt('quality', ({ auto: 'Auto (by GPU)', low: 'Low', high: 'High' })[settings.quality], settings.quality === DEFAULTS.quality);
    opt('sens', `${settings.sens.toFixed(1)}×`, settings.sens === DEFAULTS.sens);
    opt('volume', `${Math.round(settings.volume * 100)}%`, settings.volume === DEFAULTS.volume);
    $$('.rr-settings .rr-set').forEach((e, i) => e.classList.toggle('focus', i === setI));
  }
  const DEFAULTS: Settings = { quality: 'auto', sens: 1, volume: 0.8 };
  function resetSetting() {
    if (setI === 0) settings.quality = DEFAULTS.quality;
    if (setI === 1) settings.sens = DEFAULTS.sens;
    if (setI === 2) { settings.volume = DEFAULTS.volume; applyVolume(rhythm); }
    saveSettings(); renderSettings();
  }
  function changeSetting(d: number) {
    if (setI === 0) settings.quality = QUAL[(QUAL.indexOf(settings.quality) + d + 3) % 3];
    if (setI === 1) settings.sens = Math.round(Math.min(3, Math.max(0.2, settings.sens + d * 0.1)) * 10) / 10;
    if (setI === 2) { settings.volume = Math.round(Math.min(1, Math.max(0, settings.volume + d * 0.1)) * 10) / 10; applyVolume(rhythm); }
    saveSettings(); renderSettings();
  }

  let focusTimer = 0;
  function renderMap() {
    const m = MAPS[mapI];
    root.style.setProperty('--accent', m.accent);
    $('.rr-map-name').textContent = m.name;
    $('.rr-map-mode').textContent = m.mode;
    $('.rr-map-size').textContent = m.size;
    $('.rr-map-blurb').textContent = m.blurb;
    $$('.rr-card').forEach((c, i) => c.classList.toggle('focus', i === mapI));
    $$<HTMLElement>('.rr-card')[mapI]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('.rr-map-info').classList.remove('swap'); void $('.rr-map-info').offsetWidth; $('.rr-map-info').classList.add('swap');
    setBg(m.video, m.poster);
    // settle on a map for a moment → start fetching it
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => { prefetch.files(m.param); if (renderer) void prefetch.level(moduleByParam(m.param)); }, 450);
  }

  function renderChar() {
    const c = CHARS[charI], v = VESSELS[c.id], w = WEAPONS[c.id];
    const hex = `#${v.primaryColor.toString(16).padStart(6, '0')}`, acc = `#${v.accentColor.toString(16).padStart(6, '0')}`;
    root.style.setProperty('--accent', hex); root.style.setProperty('--accent2', acc);
    $('.rr-char-map').textContent = `· ${MAPS[mapI].name}`;
    $('.rr-char-role').textContent = c.role;
    $('.rr-char-name').textContent = c.name;
    $('.rr-char-title').textContent = c.title === v.archetype ? c.title : `${c.title} · ${v.archetype}`;
    $('.rr-stage-note').textContent = c.standIn ?? '';
    $('.rr-char-design').textContent = c.design;
    $('.rr-lore').innerHTML = c.backstory
      ? `<h3>Origin</h3><p>${c.backstory}</p>`
      : `<h3>Origin</h3><p class="rr-canon">Awaiting canon from the Legend of Elohim. <span>Placeholder: this vessel's story is not written yet.</span></p>`;
    $('.rr-load-out').innerHTML = `<h3>Default loadout</h3><div class="rr-weapon"><b>${w.name}</b><span>${v.pellets > 1 ? `${v.pellets} pellets` : v.burstCount > 1 ? `${v.burstCount}-round burst` : 'single beam'} · ${w.magSize} per mag · ${w.reloadSec.toFixed(2)} s reload</span></div>`;
    $('.rr-stats').innerHTML = statsFor(c.id).map((s) => `<div class="rr-stat"><span>${s.label}</span><i><u style="transform:scaleX(${s.f.toFixed(3)})"></u></i><b>${s.value}</b></div>`).join('');
    $('.rr-abil').innerHTML = `<h3>Abilities</h3>` + c.abilities.map((a) => `<div class="rr-ab"><kbd>${a.key}</kbd><div><b>${a.name}</b><span>${a.text}</span></div></div>`).join('');
    $$('.rr-tab').forEach((t, i) => t.classList.toggle('focus', i === charI));
    for (const sel of ['.rr-char-left', '.rr-char-right']) { const e = $(sel); e.classList.remove('swap'); void e.offsetWidth; e.classList.add('swap'); }
    setBg(c.combat, c.combatPoster);
    const turn = $<HTMLVideoElement>('.rr-turn');
    if (!turn.src.endsWith(c.turn)) { turn.poster = c.turnPoster; turn.src = c.turn; turn.play().catch(() => undefined); }
    showOnPedestal();
  }

  // ── the 3D pedestal (real model) when the renderer and models are ready; the turntable video until then ──
  let pedestalOn = false;
  function showOnPedestal() {
    if (!pedestal || !pedestalOn) { root.classList.remove('rr-live3d'); return; }
    // the rig's shaders compile off the main thread first (the turntable video covers the wait), then it steps up
    const id = CHARS[charI].id;
    root.classList.toggle('rr-live3d', pedestal.ready(id));
    void pedestal.prepare(id).then((ok) => {
      if (ok && pedestalOn && CHARS[charI].id === id) root.classList.toggle('rr-live3d', pedestal!.show(id));
      // then the other vessels in the background, so cycling is instant
      for (const c of CHARS) void pedestal?.prepare(c.id);
    });
  }
  function startPedestal() {
    if (!renderer || !view) return;
    void prefetch.characters().then(() => {
      if (screen !== 'char' || !renderer || !view) return;
      pedestal ??= new Pedestal(renderer, (id) => CHARS.find((c) => c.id === id)!.model);
      pedestal.centerX = window.innerWidth > 900 ? 0.5 : 0.5;
      pedestalOn = true;
      document.body.classList.add('rr-pedestal');
      pedestal.start(renderer.domElement);
      showOnPedestal();
    });
  }
  function stopPedestal() {
    if (!pedestalOn || !pedestal || !renderer) return;
    pedestalOn = false;
    pedestal.stop(renderer.domElement);
    document.body.classList.remove('rr-pedestal');
    root.classList.remove('rr-live3d');
  }

  // ── actions ──
  function wakeAudio() {
    if (audioOn) return;
    audioOn = true;
    rhythm.start(); rhythm.setMood('menu'); applyVolume(rhythm);
  }
  function act(a: Act) {
    if (screen === 'done') return;
    wakeAudio();
    if (screen === 'start') {
      if (a === 'up' || a === 'left') startI = (startI + 2) % 3;
      if (a === 'down' || a === 'right') startI = (startI + 1) % 3;
      if (a === 'ok') { if (startI === 0) { show('map'); void prefetch.characters(); } else if (startI === 1) { setI = 0; show('settings'); } else quit(); return; }
      renderStart();
    } else if (screen === 'settings') {
      if (a === 'up') setI = (setI + 3) % 4;
      if (a === 'down') setI = (setI + 1) % 4;
      if (a === 'reset') { resetSetting(); return; }
      if (a === 'left' || a === 'prev') changeSetting(-1);
      if (a === 'right' || a === 'next') changeSetting(1);
      if (a === 'back' || (a === 'ok' && setI === 3)) { show('start'); return; }
      if (a === 'ok') changeSetting(1);
      renderSettings();
    } else if (screen === 'map') {
      if (a === 'left' || a === 'prev' || a === 'up') { mapI = (mapI + MAPS.length - 1) % MAPS.length; renderMap(); }
      if (a === 'right' || a === 'next' || a === 'down') { mapI = (mapI + 1) % MAPS.length; renderMap(); }
      if (a === 'ok') { if (renderer) void prefetch.level(moduleByParam(MAPS[mapI].param)); prefetch.files(MAPS[mapI].param); show('char'); }
      if (a === 'back') show('start');
    } else if (screen === 'char') {
      if (a === 'left' || a === 'prev' || a === 'up') { charI = (charI + CHARS.length - 1) % CHARS.length; renderChar(); }
      if (a === 'right' || a === 'next' || a === 'down') { charI = (charI + 1) % CHARS.length; renderChar(); }
      if (a === 'ok') finish();
      if (a === 'back') show('map');
    }
  }
  function quit() {
    // inside Plajah (an iframe or opened from the arcade) go back; on its own, to the Plajah home page
    if (window.parent !== window) { window.parent.postMessage({ source: 'rift-realm', type: 'quit' }, '*'); return; }
    if (history.length > 1) history.back(); else location.href = '/';
  }
  function finish() {
    screen = 'done';
    stopPedestal();
    window.removeEventListener('keydown', onKey);
    padOn = false;
    root.classList.add('rr-leave');
    window.setTimeout(() => { root.querySelectorAll('video').forEach((v) => v.pause()); root.remove(); }, 700);
    resolve({ level: MAPS[mapI].param, vessel: CHARS[charI].id, quality: settings.quality });
  }

  // keyboard
  const onKey = (e: KeyboardEvent) => { const a = KEYMAP[e.code]; if (!a) return; e.preventDefault(); act(a); };
  window.addEventListener('keydown', onKey);
  // mouse
  root.addEventListener('pointerdown', wakeAudio, { capture: true });
  $$('.rr-start .rr-list button').forEach((b, i) => {
    b.addEventListener('pointerenter', () => { startI = i; renderStart(); });
    b.addEventListener('click', () => { startI = i; act('ok'); });
  });
  $$<HTMLElement>('.rr-settings .rr-set').forEach((b, i) => {
    b.addEventListener('pointerenter', () => { setI = i; renderSettings(); });
    b.addEventListener('click', (e: MouseEvent) => {
      setI = i;
      if (i === 3) { show('start'); return; }
      const t = e.target as HTMLElement;
      if (t.closest('.rr-reset')) { resetSetting(); return; }
      const step = t.closest<HTMLElement>('.rr-nudge');
      changeSetting(step ? Number(step.dataset.d) : 1);
    });
  });
  $$('.rr-card').forEach((c, i) => {
    c.addEventListener('pointerenter', () => { if (mapI !== i) { mapI = i; renderMap(); } });
    c.addEventListener('click', () => { mapI = i; act('ok'); });
  });
  $('.rr-map .rr-go').addEventListener('click', () => act('ok'));
  $('.rr-char .rr-go').addEventListener('click', () => act('ok'));
  $('.rr-arrow.l').addEventListener('click', () => act('left'));
  $('.rr-arrow.r').addEventListener('click', () => act('right'));
  $$('.rr-tab').forEach((t, i) => t.addEventListener('click', () => { charI = i; renderChar(); }));
  root.addEventListener('wheel', (e) => { if (screen === 'map' || screen === 'char') act(e.deltaY > 0 || e.deltaX > 0 ? 'next' : 'prev'); }, { passive: true });

  // controller: edge-triggered buttons, a repeating left stick, the right stick turns the vessel
  let padOn = true;
  const held = new Map<string, number>();
  const pollPad = () => {
    if (!padOn) return;
    const now = performance.now();
    for (const g of navigator.getGamepads?.() ?? []) {
      if (!g) continue;
      const fire = (k: string, a: Act, down: boolean) => {
        const t = held.get(k);
        if (!down) { held.delete(k); return; }
        if (t === undefined) { held.set(k, now + 380); act(a); } else if (now > t && a !== 'ok' && a !== 'back') { held.set(k, now + 140); act(a); }
      };
      for (const [b, a] of PADMAP) fire(`${g.index}b${b}`, a, !!g.buttons[b]?.pressed);
      const x = g.axes[0] ?? 0, y = g.axes[1] ?? 0;
      fire(`${g.index}xl`, 'left', x < -0.55); fire(`${g.index}xr`, 'right', x > 0.55);
      fire(`${g.index}yu`, 'up', y < -0.55); fire(`${g.index}yd`, 'down', y > 0.55);
      const rx = g.axes[2] ?? 0;
      if (Math.abs(rx) > 0.2 && pedestal) pedestal.nudge(rx * 0.06);
    }
  };
  // rAF when visible, a slow timer as a backup (hidden panes don't run rAF)
  const padLoop = () => { if (!padOn) return; pollPad(); requestAnimationFrame(padLoop); };
  requestAnimationFrame(padLoop);
  const padTimer = window.setInterval(() => { if (!padOn) { window.clearInterval(padTimer); return; } if (document.hidden) pollPad(); }, 100);
  window.addEventListener('gamepadconnected', () => root.classList.add('rr-pad'));

  show('start');
  // a little first-paint life even before the first video frame
  window.setTimeout(() => root.classList.add('rr-in'), 30);

  const handle: MenuHandle = {
    choice, rhythm,
    get map() { return MAPS[mapI]; },
    get char() { return CHARS[charI]; },
    attachRenderer(r, v) {
      renderer = r; view = v;
      if (!getKTX2()) initKTX2(r);
      if (qs().get('fastcompile') !== '0') installFastCompile(r); // the pedestal's rigs compile with it too
      if (!r.domElement.parentElement) v.appendChild(r.domElement);
      r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      r.setSize(window.innerWidth, window.innerHeight);
      if (screen === 'map' || screen === 'char') void prefetch.level(moduleByParam(MAPS[mapI].param));
      if (screen === 'char') startPedestal();
    },
  };
  void cycleT;
  return handle;
}
