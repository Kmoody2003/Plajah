import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, Lock, Maximize, Pause, Play, RotateCcw, Star, Trophy, Volume2, VolumeX} from 'lucide-react';
import {characterById, portrait} from '../catalog';
import {gameAudio} from '../audio';
import {createQuestState, stepQuest, emptyQuestInput, kithTraits, levelProgress, MAX_HP, SUB_NAMES, type QuestInput, type QuestState} from './sim';
import {LEVEL_INFO, moodAt} from './level';
import {createQuestRenderer, type QuestRenderer} from './render2d';
import {questSfx} from './sfx';
import {type QuestMood} from './score';
import {questMusic} from './questMusic';
import {TouchControls, emptyTouch, useTouchDevice, type TouchInput} from './touch';
import {CHARACTERS} from '../catalog';
import '../kith-party.css';
import '../plajah-layout.css';
import './quest.css';

const SAVE_KEY = 'kith-quest-v1';
interface Save { unlocked: number; best: Record<string, {score: number; time: number; seeds: number}>; }
/** Playtest builds (phone test page) set this so every stage is open. */
const playtest = () => !!(globalThis as {__kithQuestPlaytest?: boolean}).__kithQuestPlaytest;
function readSave(): Save { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); return {unlocked: playtest() ? 3 : Math.max(1, Math.min(3, s.unlocked || 1)), best: s.best || {}}; } catch { return {unlocked: playtest() ? 3 : 1, best: {}}; } }
/** Tutorial signs name keyboard keys; on phones, name the on-screen controls instead. */
function touchSign(t: string) {
 return t.replace('← → to run. Press Jump (Space / Z / Ⓐ) — hold it to jump higher.', 'Drag the left stick to run. Tap JUMP — hold it to jump higher.')
  .replace(/Press X \/ Ⓧ to lash/, 'Tap LASH')
  .replace(/Special \(C \/ Ⓨ\)/, 'the ✸ button')
  .replace(/Dash \(Shift \/ V \/ Ⓡ\)/, 'DASH')
  .replace('press Dash to BASH: hold a direction and launch', 'tap DASH to BASH: aim with the stick and let go')
  .replace('Hold ↓ while running to roll', 'Pull the stick down while running to roll')
  .replace(/\s*\([^)]*[ⒶⓍⓎⓇ][^)]*\)/g, '');
}
function writeSave(s: Save) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }

const KEYS = {
 left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
 jump: ['Space', 'KeyZ', 'KeyK'], attack: ['KeyX', 'KeyJ'], dash: ['ShiftLeft', 'ShiftRight', 'KeyV', 'KeyL'], special: ['KeyC', 'KeyI', 'ControlLeft'],
};
const ALL_KEYS = Object.values(KEYS).flat();
const HERO_KEY = 'kith-quest-hero';

interface Hud {
 phase: QuestState['phase']; time: number; hp: number; lives: number; motes: number; sparks: number; seeds: boolean[]; score: number;
 sign: string | null; boss: {hp: number; max: number; phase: number} | null; progress: number; result: QuestState['result']; intro: boolean;
}
const snap = (s: QuestState): Hud => ({
 phase: s.phase, time: s.time, hp: s.player.hp, lives: s.player.lives, motes: s.player.motes, sparks: s.player.sparks, seeds: [...s.player.seeds], score: s.player.score,
 sign: s.signT > 0 && s.sign >= 0 ? s.level.signs[s.sign] : null,
 boss: s.arenaLocked && s.boss && s.boss.state !== 'dead' ? {hp: s.boss.hp, max: s.boss.maxHp, phase: s.boss.phase} : null,
 progress: levelProgress(s), result: s.result, intro: s.phase === 'intro',
});
const fmt = (t: number) => { const s = Math.max(0, t); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const Art = ({id, className = ''}: {id: string; className?: string}) => <img className={className} src={portrait(characterById(id))} alt={characterById(id).name} draggable={false}/>;

export function QuestSession({characters, onExit}: {characters: string[]; onExit: () => void}) {
 const [hero, setHeroState] = useState(() => { try { const h = localStorage.getItem(HERO_KEY); if (h && CHARACTERS.some(c => c.id === h) && !characters[0]) return h; } catch { /* blocked */ } return characters[0] || 'rello'; });
 const setHero = (h: string) => { setHeroState(h); try { localStorage.setItem(HERO_KEY, h); } catch { /* blocked */ } };
 const touchDevice = useTouchDevice();
 const [save, setSave] = useState<Save>(readSave);
 const [stage, setStage] = useState<number | null>(null);
 const [run, setRun] = useState(0);
 const carry = useRef<{lives: number; motes: number; score: number; sparks: number} | undefined>(undefined);
 const start = (i: number, fresh = true) => {
  gameAudio.unlock(); gameAudio.uiClick(); if (fresh) carry.current = undefined; setStage(i); setRun(r => r + 1);
  // phones: go full screen + landscape where the browser allows it (Android Chrome); iOS falls back to the fixed layout
  if (touchDevice && !document.fullscreenElement) document.documentElement.requestFullscreen?.({navigationUI: 'hide'}).then(() => (screen.orientation as unknown as {lock?: (o: string) => Promise<void>})?.lock?.('landscape')).catch(() => { /* not allowed */ });
 };
 const onClear = (s: QuestState) => {
  const id = s.level.id, r = s.result!;
  setSave(prev => {
   const old = prev.best[id];
   const next: Save = {unlocked: Math.max(prev.unlocked, Math.min(3, s.levelIndex + 2)), best: {...prev.best, [id]: {score: Math.max(old?.score || 0, r.score), time: old ? Math.min(old.time, r.time) : r.time, seeds: Math.max(old?.seeds || 0, r.seeds)}}};
   writeSave(next); return next;
  });
  carry.current = {lives: s.player.lives, motes: s.player.motes, score: s.player.score, sparks: s.player.sparks};
 };
 if (stage === null) return <StageSelect hero={hero} setHero={setHero} save={save} onStart={i => start(i)} onExit={onExit}/>;
 return <QuestPlay key={`${stage}-${run}`} mobile={touchDevice} hero={hero} stage={stage} carry={carry.current} onClear={onClear}
  onNext={() => { if (stage < 2) start(stage + 1, false); else { setStage(null); } }}
  onRetry={() => start(stage, true)} onStages={() => setStage(null)} onExit={onExit}/>;
}

function StageSelect({hero, setHero, save, onStart, onExit}: {hero: string; setHero: (h: string) => void; save: Save; onStart: (i: number) => void; onExit: () => void}) {
 const tr = kithTraits(hero), c = characterById(hero);
 // the title theme ("The Lantern Road", a Chora project) plays on the stage select
 useEffect(() => { questMusic.title(); return () => questMusic.stop(.6); }, []);
 return <main className="kp-session kq-session">
  <div className="kp-session-title">
   <button className="kp-text-link" onClick={onExit}><ArrowLeft size={17}/> Playground</button>
   <div><span className="kp-eyebrow">2D PLATFORM ADVENTURE · 3 STAGES + BOSS</span><h2>Kith Quest: The Lantern Road</h2></div>
   <span/>
  </div>
  <section className="kq-brief">
   <div className="kq-brief-hero"><Art id={hero}/><div><span className="kp-eyebrow">YOUR KITH</span><b>{c.name}</b><small>{SUB_NAMES[tr.sub]} sub-weapon{tr.airJumps > 1 ? ' · triple jump' : ''}{tr.glideMul > 1.2 ? ' · long glide' : ''}{tr.runMul > 1 ? ' · fast feet' : ''}{tr.heavy ? ' · heavy stomp' : ''}</small></div></div>
   <div className="kq-pick" role="radiogroup" aria-label="Choose your Kith">{CHARACTERS.map(k => <button key={k.id} role="radio" aria-checked={k.id === hero} className={k.id === hero ? 'on' : ''} onClick={() => { gameAudio.uiClick(); setHero(k.id); }}><Art id={k.id}/><small>{k.name}</small></button>)}</div>
   <p>The lanterns of the Kithlands are going dark. Run, roll and glide through three stages, lash lanterns for sparks, bash off anything that glows, and face the Hollow Warden at the top of Lanternkeep. Find all three Star Seeds in every stage.</p>
  </section>
  <div className="kq-stages">
   {LEVEL_INFO.map((L, i) => {
    const locked = i >= save.unlocked, best = save.best[L.id];
    return <button key={L.id} className={`kq-stage kq-${L.biome}`} disabled={locked} onClick={() => onStart(i)}>
     <div className="kq-stage-art"><span className="kq-stage-num">STAGE {i + 1}</span>{locked ? <Lock size={28}/> : <Play size={26}/>}</div>
     <div className="kq-stage-body"><b>{L.name}</b><span>{L.subtitle}</span>
      <em>{best ? <>{[0, 1, 2].map(k => <Star key={k} size={13} fill={k < best.seeds ? '#ffd24a' : 'none'} color="#ffd24a"/>)} · {fmt(best.time)} · {best.score.toLocaleString()} pts</> : locked ? 'Clear the previous stage to unlock' : 'Not cleared yet'}</em>
     </div>
    </button>;
   })}
  </div>
  <dl className="kq-controls">
   <dt>Move</dt><dd><kbd>← →</kbd> / <kbd>A D</kbd> · stick / d-pad</dd>
   <dt>Jump · double jump · glide</dt><dd><kbd>Space</kbd> <kbd>Z</kbd> · Ⓐ — hold to jump higher, hold in the air to glide</dd>
   <dt>Lash</dt><dd><kbd>X</kbd> <kbd>J</kbd> · Ⓧ — with ↑ to lash up, ↓ in the air to pogo</dd>
   <dt>Dash · Bash</dt><dd><kbd>Shift</kbd> <kbd>V</kbd> · Ⓑ / RB — near a glowing lantern, enemy or shot it becomes a Bash: aim, release</dd>
   <dt>Roll · spin charge</dt><dd><kbd>↓</kbd> while running · hold ↓ and tap Jump to rev, let go to launch</dd>
   <dt>Sub-weapon</dt><dd><kbd>C</kbd> <kbd>I</kbd> · Ⓨ — spends one spark</dd>
   <dt>Wall jump</dt><dd>Hold toward a wall while falling, then Jump</dd>
  </dl>
 </main>;
}

function QuestPlay({mobile, hero, stage, carry, onClear, onNext, onRetry, onStages, onExit}: {mobile: boolean; hero: string; stage: number; carry?: {lives: number; motes: number; score: number; sparks: number}; onClear: (s: QuestState) => void; onNext: () => void; onRetry: () => void; onStages: () => void; onExit: () => void}) {
 const canvas = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null), container = useRef<HTMLElement>(null);
 const state = useRef<QuestState>(createQuestState(hero, stage, carry));
 const keys = useRef(new Set<string>());
 const touch = useRef<TouchInput>(emptyTouch());
 const [portraitOk, setPortraitOk] = useState(false);
 const [hud, setHud] = useState<Hud>(() => snap(state.current));
 const [paused, setPausedState] = useState(false); const pauseRef = useRef(false);
 const [sound, setSound] = useState(() => !gameAudio.isMuted);
 const [err, setErr] = useState('');
 const setPause = (v: boolean) => { pauseRef.current = v; setPausedState(v); keys.current.clear(); gameAudio.pauseBlip(); questMusic.setPaused(v); };
 const L = state.current.level;
 // debug handle for automated checks (labs/kith-quest, Playwright): read-only use expected
 if (typeof window !== 'undefined') (window as unknown as {__kithQuest?: QuestState}).__kithQuest = state.current;

 useEffect(() => {
  const down = (e: KeyboardEvent) => {
   if (e.code === 'Escape' || e.code === 'KeyP') { if (state.current.phase === 'play') setPause(!pauseRef.current); return; }
   if (ALL_KEYS.includes(e.code)) { e.preventDefault(); keys.current.add(e.code); }
  };
  const up = (e: KeyboardEvent) => keys.current.delete(e.code);
  const blur = () => { keys.current.clear(); if (state.current.phase === 'play') setPause(true); };
  const vis = () => { if (document.hidden) blur(); };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', vis);
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', vis); };
 }, []);

 useEffect(() => {
  if (!canvas.current) return;
  let view: QuestRenderer;
  try { view = createQuestRenderer(canvas.current, state.current); } catch (e) { setErr(e instanceof Error ? e.message : 'Canvas unavailable'); return; }
  const ro = new ResizeObserver(() => view.resize()); ro.observe(canvas.current);
  gameAudio.unlock(); questMusic.start(stage);
  let raf = 0, last = performance.now(), acc = 0, lastHud = 0, lastSeq = 0, cleared = false, padStart = false;
  const moodWant: {mood: QuestMood; since: number} = {mood: 'calm', since: 0};
  const has = (list: string[]) => list.some(k => keys.current.has(k));
  const loop = (now: number) => {
   raf = requestAnimationFrame(loop);
   const elapsed = Math.min(.1, (now - last) / 1000); last = now;
   const s = state.current;
   const pad = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
   const t = touch.current;
   const ax = pad && Math.abs(pad.axes[0]) > .3 ? pad.axes[0] : 0, ay = pad && Math.abs(pad.axes[1]) > .4 ? pad.axes[1] : 0;
   const btn = (i: number) => !!pad?.buttons[i]?.pressed;
   const input: QuestInput = {
    x: (has(KEYS.right) || btn(15) ? 1 : 0) - (has(KEYS.left) || btn(14) ? 1 : 0) || t.x || ax,
    y: (has(KEYS.down) || btn(13) ? 1 : 0) - (has(KEYS.up) || btn(12) ? 1 : 0) || t.y || ay,
    jump: has(KEYS.jump) || t.jump || btn(0), attack: has(KEYS.attack) || t.attack || btn(2),
    dash: has(KEYS.dash) || t.dash || btn(1) || btn(5) || btn(7), special: has(KEYS.special) || t.special || btn(3),
   };
   const st = btn(9); if (st && !padStart && s.phase === 'play') setPause(!pauseRef.current); padStart = st;
   if (!pauseRef.current) { acc += elapsed; let n = 0; while (acc >= 1 / 120 && n++ < 24) { stepQuest(s, input, 1 / 120); acc -= 1 / 120; } }
   for (const e of s.events) if (e.seq > lastSeq) { lastSeq = e.seq; questSfx(e); if (e.type === 'hurt' || e.type === 'die') navigator.vibrate?.(e.type === 'die' ? [60, 40, 90] : 45); else if (e.type === 'bossSlam') navigator.vibrate?.(30); }
   view.render(s, pauseRef.current ? 0 : elapsed);
   // adaptive score: boss → battle; low health → fear; otherwise the stage's music zone (with a short settle so it never flickers)
   {
    const B = s.boss, p = s.player;
    let want: QuestMood = moodAt(s.level, p.x + p.w / 2), inten = 0;
    if (s.arenaLocked && B && B.state !== 'dead' && B.state !== 'dying' && B.state !== 'dormant') { want = 'battle'; inten = B.phase / 2; }
    else if (p.hp <= 1 && p.dead <= 0 && s.phase === 'play') { want = 'danger'; inten = 1; }
    else if (want === 'danger') inten = p.hp <= 2 ? .5 : 0;
    if (want !== moodWant.mood) { moodWant.mood = want; moodWant.since = now; }
    if (s.phase === 'play' && (now - moodWant.since > (want === 'battle' || inten === 1 ? 0 : 900))) questMusic.setMood(want, inten);
   }
   if (s.phase === 'clear' && !cleared) { cleared = true; onClear(s); questMusic.cadence(); }
   if (s.phase === 'over' && !cleared) { cleared = true; questMusic.gameOver(); }
   if (now - lastHud > 80) { setHud(snap(s)); lastHud = now; }
  };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); view.dispose(); questMusic.stop(); };
 }, []);

 const c = characterById(hero), tr = kithTraits(hero);
 const r = hud.result;
 return <main className={`kp-session kq-session ${mobile ? 'kq-mobile' : ''}`} ref={container}>
  <div className="kp-session-title">
   <button className="kp-text-link" onClick={onExit}><ArrowLeft size={17}/> Playground</button>
   <div><span className="kp-eyebrow">KITH QUEST · STAGE {stage + 1} OF 3</span><h2>{L.name}</h2></div>
   <div className="kp-session-tools">
    <button className="kp-icon" onClick={() => { const m = gameAudio.toggleMute(); setSound(!m); }} aria-label={sound ? 'Mute' : 'Unmute'}>{sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button>
    <button className="kp-icon" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else container.current?.requestFullscreen?.(); }} aria-label="Fullscreen"><Maximize size={19}/></button>
    <button className="kp-icon" disabled={hud.phase !== 'play'} onClick={() => setPause(!paused)} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? <Play size={19}/> : <Pause size={19}/>}</button>
   </div>
  </div>
  <div className="kq-field" ref={wrap}>
   <canvas ref={canvas} tabIndex={0} aria-label={`${L.name}. Side-scrolling platform stage.`}/>
   <div className="kq-hud" aria-live="polite">
    <div className="kq-hud-left">
     <Art id={hero} className="kq-face"/>
     <div>
      <div className="kq-petals" aria-label={`${hud.hp} of ${MAX_HP} petals`}>{Array.from({length: MAX_HP}, (_, i) => <i key={i} className={i < hud.hp ? 'on' : ''}/>)}</div>
      <div className="kq-counts"><span title="Lives">✦ ×{hud.lives}</span><span title="Motes">◇ {hud.motes}</span><span title={`${SUB_NAMES[tr.sub]} sparks`} style={{color: tr.glow}}>✸ {hud.sparks}</span></div>
     </div>
    </div>
    <div className="kq-hud-center"><div className="kq-progress"><i style={{width: `${hud.progress * 100}%`}}/><b style={{left: `${hud.progress * 100}%`}}/></div></div>
    <div className="kq-hud-right">
     <div className="kq-seeds">{hud.seeds.map((on, i) => <Star key={i} size={18} fill={on ? '#ffd24a' : 'none'} color={on ? '#ffd24a' : 'rgba(255,255,255,.45)'}/>)}</div>
     <b>{fmt(hud.time)}</b><small>{hud.score.toLocaleString()}</small>
    </div>
    {mobile && <button className="kq-mpause" aria-label="Pause" onPointerDown={e => { e.preventDefault(); if (hud.phase === 'play') setPause(true); }}><Pause size={20}/></button>}
   </div>
   {mobile && hud.phase === 'play' && !paused && <TouchControls input={touch} sparks={hud.sparks} subLabel={SUB_NAMES[tr.sub].split(' ')[0].toUpperCase()}/>}
   {mobile && !portraitOk && <div className="kq-rotate"><div><span>⟲</span><b>Turn your phone sideways</b><small>Kith Quest plays in landscape.</small><button className="kp-button" onClick={() => setPortraitOk(true)}>Play anyway</button></div></div>}
   {hud.boss && <div className="kq-bossbar"><span>THE HOLLOW WARDEN{hud.boss.phase ? ` · PHASE ${hud.boss.phase + 1}` : ''}</span><div><i style={{width: `${hud.boss.hp / hud.boss.max * 100}%`}}/></div></div>}
   {hud.sign && hud.phase === 'play' && <div className="kq-sign">{mobile ? touchSign(hud.sign) : hud.sign}</div>}
   {hud.intro && <div className="kq-titlecard"><small>STAGE {stage + 1}</small><b>{L.name}</b><span>{L.subtitle}</span></div>}
   {err && <div className="kp-game-overlay"><div className="kp-ready" role="alert"><h2>Graphics unavailable</h2><p>{err}</p><button className="kp-button kp-primary" onClick={onRetry}>Try again</button></div></div>}
   {paused && hud.phase === 'play' && <div className="kp-game-overlay"><div className="kp-ready"><span className="kp-eyebrow">TAKE A BREATHER</span><h2>Paused</h2>
    <div className="kp-actions"><button className="kp-button kp-primary" onClick={() => { setPause(false); canvas.current?.focus(); }}>Resume <Play size={16}/></button><button className="kp-button" onClick={onRetry}><RotateCcw size={16}/> Restart stage</button></div>
    <button className="kp-text-link" onClick={onStages}>Stage select</button>
    {mobile && <div className="kp-actions"><button className="kp-button" onClick={() => { const m = gameAudio.toggleMute(); setSound(!m); }}>{sound ? <><Volume2 size={16}/> Sound on</> : <><VolumeX size={16}/> Sound off</>}</button><button className="kp-button" onClick={onExit}><ArrowLeft size={16}/> Leave</button></div>}</div></div>}
   {hud.phase === 'clear' && r && <div className="kp-game-overlay kq-delay"><div className="kp-ready kp-results" role="status"><Trophy size={30}/>
    <span className="kp-eyebrow">{stage === 2 ? 'THE LANTERN ROAD IS LIT' : 'STAGE CLEAR'}</span>
    <h2>{stage === 2 ? `${c.name} saved the last flame!` : `${L.name} cleared!`}</h2>
    <div className="kq-tally"><div><small>TIME</small><b>{fmt(r.time)}</b></div><div><small>MOTES</small><b>{r.motes}</b></div><div><small>STAR SEEDS</small><b>{r.seeds} / 3</b></div><div><small>SCORE</small><b>{r.score.toLocaleString()}</b></div></div>
    <div className="kp-actions">{stage < 2 ? <button className="kp-button kp-primary" onClick={onNext}>Next stage <Play size={16}/></button> : <button className="kp-button kp-primary" onClick={onStages}>Stage select</button>}<button className="kp-button" onClick={onRetry}><RotateCcw size={16}/> Replay</button></div>
    <button className="kp-text-link" onClick={onExit}>Back to the playground</button></div></div>}
   {hud.phase === 'over' && <div className="kp-game-overlay kq-delay"><div className="kp-ready"><span className="kp-eyebrow">OUT OF LIVES</span><h2>The lanterns flicker…</h2><p>Every stage restarts with three fresh lives. Checkpoints and Star Seeds you found stay counted in your best run.</p>
    <div className="kp-actions"><button className="kp-button kp-primary" onClick={onRetry}><RotateCcw size={16}/> Try again</button><button className="kp-button" onClick={onStages}>Stage select</button></div></div></div>}
  </div>
  <div className="kp-session-bottom"><span>←→ move · Space jump/glide · X lash · Shift dash/bash · ↓ roll · C sub-weapon</span><span>Esc to pause · 3 Star Seeds hidden per stage</span></div>
 </main>;
}
