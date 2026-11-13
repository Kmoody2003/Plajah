/**
 * Kith Quest music director: plays the Chora-built score (one Chora project per cue, bounced to
 * /kith-party/quest-music/*.mp3 by scripts/games/buildKithQuestAudio.ts) and falls back to the synthesized
 * Lullaby Orchestra (./score.ts) when the bounces can't be loaded.
 *
 * Same calls as the synth score (start / setMood / setPaused / cadence / stop) plus title() and gameOver().
 * Moods crossfade (the cues have different tempos and keys, so they hand over rather than cut on a bar line):
 *   calm → calm-<stage> · energy → energy-<stage> · danger → danger, or fear at the last petal · battle → battle.
 */
import {gameAudio} from '../audio';
import {questScore, type QuestMood} from './score';

interface Entry { title: string; file: string; loop: boolean; duration: number; loopStart?: number; loopEnd?: number }
type Manifest = Record<string, Entry>;
declare global { var __kithQuestMusic: {manifest: Manifest; urls: Record<string, string>} | undefined }

const BASE = '/kith-party/quest-music/';
const STAGES = ['glowmoss', 'cascade', 'keep'];
const LEVEL = .9;

let manifestP: Promise<Manifest | null> | null = null;
function loadManifest(): Promise<Manifest | null> {
 if (!manifestP) manifestP = (async () => {
  if (globalThis.__kithQuestMusic) return globalThis.__kithQuestMusic.manifest;
  try { const r = await fetch(`${BASE}manifest.json`); if (!r.ok) return null; const m = await r.json() as Manifest; return Object.keys(m).length ? m : null; } catch { return null; }
 })();
 return manifestP;
}
const urlFor = (e: Entry) => globalThis.__kithQuestMusic?.urls[e.file] ?? `${BASE}${e.file}`;

const buffers = new Map<string, Promise<AudioBuffer | null>>();
function bufferFor(ctx: AudioContext, id: string, m: Manifest): Promise<AudioBuffer | null> {
 let p = buffers.get(id);
 if (!p) {
  const e = m[id];
  p = e ? fetch(urlFor(e)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))).then(b => ctx.decodeAudioData(b)).catch(() => null) : Promise.resolve(null);
  buffers.set(id, p);
 }
 return p;
}

interface Voice { src: AudioBufferSourceNode; gain: GainNode; id: string }

class QuestMusic {
 private mode: 'chora' | 'synth' | 'off' = 'off';
 private ctx: AudioContext | null = null;
 private bus: GainNode | null = null;
 private voice: Voice | null = null;
 private want = '';
 private stage = 0;
 private paused = false;
 private timer: ReturnType<typeof setInterval> | null = null;
 private muted = false;
 private token = 0;

 /** Which engine is playing: the Chora bounces or the synth fallback. */
 get engine() { return this.mode; }
 state() { return {engine: this.mode, cue: this.voice?.id ?? null}; }

 /** The title theme ("The Lantern Road") for the stage select. Chora only: the synth score has no title cue. */
 title() { void this.begin(0, 'title', false); }
 start(stage: number) { this.stage = Math.max(0, Math.min(2, stage)); void this.begin(this.stage, `calm-${STAGES[this.stage]}`, true); }

 setMood(mood: QuestMood, intensity = 0) {
  if (this.mode === 'synth') return questScore.setMood(mood, intensity);
  if (this.mode !== 'chora') return;
  const id = mood === 'battle' ? 'battle' : mood === 'danger' ? (intensity >= 1 ? 'fear' : 'danger') : `${mood}-${STAGES[this.stage]}`;
  this.play(id, id === 'fear' || this.want === 'fear' ? .6 : 1.4);
 }
 setPaused(p: boolean) { if (this.mode === 'synth') return questScore.setPaused(p); this.paused = p; this.level(.5); }
 /** Stage clear: the "Lantern Lit" jingle, then silence. */
 cadence() { if (this.mode === 'synth') return questScore.cadence(); if (this.mode === 'chora') this.play('clear', .35); }
 /** Out of lives: "The Lantern Dims". */
 gameOver() { if (this.mode === 'synth') return questScore.stop(2); if (this.mode === 'chora') this.play('gameover', .8); }
 stop(fade = .8) {
  this.token++;
  if (this.mode === 'synth') questScore.stop(fade);
  this.fadeOut(this.voice, fade); this.voice = null; this.want = '';
  if (this.timer) { clearInterval(this.timer); this.timer = null; }
  this.mode = 'off';
 }

 private async begin(stage: number, cue: string, synthFallback: boolean) {
  this.stop(.4);
  const token = ++this.token;
  gameAudio.unlock();
  const ctx = gameAudio.context;
  const m = ctx ? await loadManifest() : null;
  if (token !== this.token) return;
  if (!ctx || !m || !m[cue]) { if (synthFallback) { this.mode = 'synth'; questScore.start(stage); } return; }
  gameAudio.stopMusic();
  this.mode = 'chora'; this.ctx = ctx; this.paused = false;
  if (!this.bus) { this.bus = ctx.createGain(); this.bus.connect(ctx.destination); }
  this.muted = gameAudio.isMuted; this.level(0);
  this.timer = setInterval(() => { if (gameAudio.isMuted !== this.muted) { this.muted = gameAudio.isMuted; this.level(.3); } }, 250);
  // warm this stage's other cues so mood changes land quickly
  const warm = cue === 'title' ? ['title'] : [cue, `energy-${STAGES[stage]}`, 'danger', 'fear', 'clear', 'gameover', ...(stage === 2 ? ['battle'] : [])];
  for (const id of warm) void bufferFor(ctx, id, m);
  this.play(cue, 2);
 }

 private level(ramp: number) {
  const ctx = this.ctx, b = this.bus; if (!ctx || !b) return;
  const t = ctx.currentTime, v = gameAudio.isMuted ? 0 : LEVEL * (this.paused ? .35 : 1);
  b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(v, t + Math.max(.01, ramp));
 }

 private fadeOut(v: Voice | null, fade: number) {
  if (!v || !this.ctx) return;
  const t = this.ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + Math.max(.02, fade));
  try { v.src.stop(t + fade + .05); } catch { /* already stopped */ }
 }

 private play(id: string, fade: number) {
  if (id === this.want) return;
  this.want = id;
  const ctx = this.ctx, token = this.token;
  if (!ctx) return;
  void loadManifest().then(m => m ? bufferFor(ctx, id, m).then(buf => ({buf, e: m[id]})) : null).then(r => {
   if (!r || !r.buf || token !== this.token || this.want !== id || !this.bus) return;
   const {buf, e} = r;
   const src = ctx.createBufferSource(); src.buffer = buf;
   const gain = ctx.createGain(); gain.gain.value = 0;
   src.connect(gain); gain.connect(this.bus);
   const t = ctx.currentTime + .02;
   if (e.loop && e.loopStart !== undefined && e.loopEnd !== undefined) { src.loop = true; src.loopStart = e.loopStart; src.loopEnd = e.loopEnd; src.start(t, e.loopStart); }
   else src.start(t);
   gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(1, t + (e.loop ? Math.min(fade, 1) : .03));
   this.fadeOut(this.voice, fade);
   this.voice = {src, gain, id};
   if (!e.loop) src.onended = () => { if (this.voice?.src === src) { this.voice = null; } };
  });
 }
}

export const questMusic = new QuestMusic();
/** debug: which engine and cue are playing (playtests, headless checks) */
if (typeof window !== 'undefined') (window as unknown as {__kithQuestMusicState?: () => {engine: string; cue: string | null}}).__kithQuestMusicState = () => questMusic.state();
