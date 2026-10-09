// The Book Audio engine: implements BookAudioApi (services/living/contracts.ts) on top of WebAudio.
//
//   * AudioContext is created lazily inside unlock() (call it from a tap; iOS Safari requires that). Nothing sounds before then.
//   * master chain: sfx / music / ambience / voice buses -> generated reverb -> compressor -> soft limiter (see graph.ts)
//   * polyphony caps + voice stealing (voices.ts), retrigger guard, per-sound release fades (never a hard cut)
//   * tab hidden -> context suspended; visible -> resumed. Reduced-sound mode softens onsets, cuts level and darkens sfx.
//   * every method is safe to call at any time (before unlock, after dispose): it just does nothing instead of throwing.

import type { AudioReadyState, BookAudioApi, Instrument, Score, SfxParams } from '../contracts';
import { AMBIENCE_BEDS, resolveBed } from './ambience';
import { clamp, makePanner } from './dsp';
import { AudioGraph } from './graph';
import { type SustainedVoice, playNoteInto, resolveInstrument } from './instruments';
import { noteToMidi } from './notes';
import { type AriaClient, Narrator, type NarratorDeps } from './narration';
import { Sequencer, type Run, type ScoreEvent } from './sequencer';
import { resolveSfx, playSfxInto } from './sfxCatalog';
import { VoicePool } from './voices';

export interface BookAudioEx extends BookAudioApi {
  setReducedSound(on: boolean): void;
  /** Stop narration, one-shot sfx/notes and held voices, but keep music + ambience running (use on page changes). */
  stopTransient(): void;
  pauseSpeech(): void;
  resumeSpeech(): void;
  /** Current cue id, or null. */
  readonly cue: string | null;
  readonly ambienceBed: string | null;
  readonly narrator: Narrator;
  readonly graph: AudioGraph | null;
  /** counts for diagnostics / tests */
  readonly stats: { sfxStolen: number; notesStolen: number; voicesStolen: number; sfxPlayed: number; sfxSkipped: number };
}

export interface EngineOptions {
  createContext?: () => AudioContext;
  speech?: NarratorDeps['speech'];
  makeUtterance?: NarratorDeps['makeUtterance'];
  aria?: AriaClient | null;
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'hidden'> | null;
  reducedSound?: boolean;
  /** injected for tests: drives cleanup + the music scheduler */
  timer?: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
}

function defaultContext(): AudioContext {
  const C = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
  if (!C) throw new Error('WebAudio is not available');
  return new C({ latencyHint: 'interactive' });
}

export function createBookAudio(opts: EngineOptions = {}): BookAudioEx {
  let ctx: AudioContext | null = null;
  let graph: AudioGraph | null = null;
  let unlockedFlag = false;
  let unlocking: Promise<void> | null = null;
  let disposed = false;
  let muted = false;
  let reducedSound = !!opts.reducedSound;
  let musicGain = 0.7;
  let sfxGain = 1;
  let footAlt = 0;
  const warned = new Set<string>();
  const stats = { sfxStolen: 0, notesStolen: 0, voicesStolen: 0, sfxPlayed: 0, sfxSkipped: 0 };
  const timer = opts.timer ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as any) };
  const setT = timer.set;

  const sfxPool = new VoicePool(18, 5, 0.03);
  const notePool = new VoicePool(28, 12, 0);
  const voicePool = new VoicePool(6, 6, 0);
  const musicPool = new VoicePool(96, 48, 0);

  // pending requests made before the first gesture
  let pendingCue: { id: string; fadeMs?: number } | null = null;
  let pendingBed: { bed: string | null; gain?: number; fadeMs?: number } | null | undefined;

  const warnOnce = (k: string, msg: string) => { if (!warned.has(k)) { warned.add(k); try { console.warn(`[living-audio] ${msg}`); } catch { /* no console */ } } };
  const ready = (): boolean => !!(ctx && graph && unlockedFlag && !disposed && ctx.state !== 'closed');

  // ───── music ─────
  const runNodes = new Map<number, { gain: GainNode; send: GainNode; pans: Map<number, AudioNode>; score: Score }>();
  const seq = new Sequencer({
    now: () => (ctx ? ctx.currentTime : 0),
    timer,
    emit: (ev, run) => emitMusic(ev, run),
    onStart: (run, fadeIn) => {
      if (!ctx || !graph) return;
      const score = scores[run.scoreId];
      const gain = ctx.createGain(); const now = ctx.currentTime;
      if (fadeIn > 0.02) { gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(1, now + fadeIn); } else gain.gain.value = 1;
      gain.connect(graph.music.input);
      const send = ctx.createGain(); send.gain.value = clamp(score?.reverb ?? 0.15, 0, 1) * 0.6;
      gain.connect(send); send.connect(graph.reverbIn);
      runNodes.set(run.id, { gain, send, pans: new Map(), score });
    },
    onStop: (run, fadeOut) => {
      const n = runNodes.get(run.id); if (!n || !ctx) return;
      const now = ctx.currentTime;
      n.gain.gain.cancelScheduledValues(now);
      n.gain.gain.setValueAtTime(Math.max(0.0001, n.gain.gain.value), now);
      n.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.03, fadeOut));
    },
    onEnd: (run) => {
      const n = runNodes.get(run.id); if (!n) return;
      runNodes.delete(run.id);
      setT(() => { try { n.gain.disconnect(); n.send.disconnect(); n.pans.forEach((p) => p.disconnect()); } catch { /* gone */ } }, 300);
    },
  });
  const scores: Record<string, Score> = {};

  function emitMusic(ev: ScoreEvent, _run: Run) {
    if (!ready() || !ctx || muted) return;
    const rn = runNodes.get(ev.runId); if (!rn) return;
    const inst = resolveInstrument(ev.instrument);
    if (!inst) { warnOnce('inst:' + ev.instrument, `unknown instrument "${ev.instrument}" in cue`); return; }
    let pan = rn.pans.get(ev.trackIndex);
    if (!pan) { pan = makePanner(ctx, ev.pan); pan.connect(rn.gain); rn.pans.set(ev.trackIndex, pan); }
    const vg = ctx.createGain(); vg.connect(pan);
    const t = Math.max(ctx.currentTime, ev.time);
    const key = `m:${ev.instrument}`;
    const { stolen } = musicPool.acquire(key, ctx.currentTime, t + ev.durSec + inst.tail, (fade) => releaseGain(vg, fade));
    void stolen;
    const total = playNoteInto(ctx, vg, t, ev.instrument, ev.note, { durationMs: ev.durSec * 1000, gain: 0.8 * ev.gain, vel: ev.vel, soft: reducedSound, seed: (ev.pass * 131 + ev.trackIndex * 17 + Math.floor(ev.beat * 8)) >>> 0 });
    cleanupLater(vg, t - ctx.currentTime + total + 0.3);
  }

  function releaseGain(g: GainNode, fadeSec: number) {
    if (!ctx) return;
    try { const now = ctx.currentTime; g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fadeSec)); } catch { /* ignore */ }
    cleanupLater(g, fadeSec + 0.1);
  }
  function cleanupLater(n: AudioNode | AudioNode[], inSec: number) {
    const list = Array.isArray(n) ? n : [n];
    setT(() => { for (const x of list) { try { x.disconnect(); } catch { /* gone */ } } }, Math.max(50, inSec * 1000));
  }

  // ───── ambience ─────
  let bed: { id: string; gain: GainNode; handle: { stop(at: number): void }; level: number } | null = null;
  function startBed(id: string | null, gain = 0.5, fadeMs = 1200) {
    if (!ctx || !graph) return;
    const now = ctx.currentTime; const fade = Math.max(0.05, fadeMs / 1000);
    const def = id ? resolveBed(id) : null;
    if (id && !def) { warnOnce('bed:' + id, `unknown ambience bed "${id}" (known: ${AMBIENCE_BEDS.map((b) => b.id).join(', ')})`); }
    if (bed && def && bed.id === def.id) { bed.gain.gain.cancelScheduledValues(now); bed.gain.gain.setValueAtTime(bed.gain.gain.value, now); bed.gain.gain.linearRampToValueAtTime(gain * def.level, now + fade); return; }
    if (bed) {
      const old = bed; bed = null;
      old.gain.gain.cancelScheduledValues(now); old.gain.gain.setValueAtTime(old.gain.gain.value, now); old.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
      old.handle.stop(now + fade); cleanupLater(old.gain, fade + 0.3);
    }
    if (!def) return;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(gain * def.level, now + fade); g.connect(graph.ambience.input);
    const handle = def.build(ctx, g, now);
    bed = { id: def.id, gain: g, handle, level: def.level };
  }

  // ───── narration ─────
  const narrator = new Narrator({
    getCtx: () => ctx, voiceBus: () => graph?.voice ?? null,
    aria: opts.aria ?? null,
    speech: opts.speech !== undefined ? opts.speech : (typeof globalThis !== 'undefined' && (globalThis as any).speechSynthesis ? (globalThis as any).speechSynthesis : null),
    makeUtterance: opts.makeUtterance,
    onSpeaking: (on) => { graph?.setSpeechDuck(on); },
    isMuted: () => muted,
  });

  // ───── visibility ─────
  const doc = opts.doc !== undefined ? opts.doc : (typeof document !== 'undefined' ? document : null);
  const onVis = () => {
    if (!ctx || disposed) return;
    if (doc && doc.hidden) { void ctx.suspend().catch(() => {}); narrator.pause(); }
    else if (unlockedFlag) { void ctx.resume().catch(() => {}); narrator.resume(); }
  };
  doc?.addEventListener('visibilitychange', onVis);

  function ensureContext(): boolean {
    if (ctx) return true;
    try {
      ctx = (opts.createContext ?? defaultContext)();
      graph = new AudioGraph(ctx);
      graph.setMuted(muted); graph.setGains({ music: musicGain, sfx: sfxGain }); graph.setReducedSound(reducedSound);
      ctx.onstatechange = () => { if (ctx && ctx.state === 'running') unlockedFlag = true; };
      return true;
    } catch (e) {
      warnOnce('ctx', `WebAudio unavailable: ${(e as Error)?.message ?? e}`);
      ctx = null; graph = null; return false;
    }
  }

  function flushPending() {
    if (pendingBed !== undefined) { const p = pendingBed; pendingBed = undefined; if (p) startBed(p.bed, p.gain, p.fadeMs); }
    if (pendingCue) { const p = pendingCue; pendingCue = null; seq.play(p.id, { fadeMs: p.fadeMs }); }
  }

  const api: BookAudioEx = {
    unlock() {
      if (disposed) return Promise.resolve();
      if (unlockedFlag && ctx && ctx.state === 'running') return Promise.resolve();
      if (unlocking) return unlocking;
      unlocking = (async () => {
        if (!ensureContext() || !ctx) return;
        try {
          // iOS: resume inside the gesture, then play one silent buffer so the output path is really open.
          const p = ctx.resume();
          const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
          await Promise.race([p, new Promise<void>((r) => setT(() => r(), 1500))]);
        } catch { /* stay locked; the next tap tries again */ }
        unlockedFlag = !!ctx && ctx.state === 'running';
        if (unlockedFlag) { narrator.warmUp(); flushPending(); }
      })().finally(() => { unlocking = null; });
      return unlocking;
    },
    get state(): AudioReadyState { return { unlocked: unlockedFlag && !!ctx && ctx.state === 'running', muted, musicGain, sfxGain, reducedSound }; },
    setMuted(m) { muted = !!m; graph?.setMuted(muted); },
    setGains(g) {
      if (g.music != null) musicGain = clamp(g.music, 0, 1.5);
      if (g.sfx != null) sfxGain = clamp(g.sfx, 0, 1.5);
      graph?.setGains({ music: g.music != null ? musicGain : undefined, sfx: g.sfx != null ? sfxGain : undefined });
    },
    setReducedSound(on) { reducedSound = !!on; graph?.setReducedSound(reducedSound); },

    sfx(id: string, params?: SfxParams & { x01?: number }) {
      if (!ready() || !ctx || !graph || muted) { stats.sfxSkipped++; return; }
      let name = id;
      if (name === 'footstep') { name = footAlt++ % 2 ? 'footstep-right' : 'footstep-left'; }
      const def = resolveSfx(name);
      if (!def) { warnOnce('sfx:' + id, `unknown sfx "${id}"`); return; }
      const now = ctx.currentTime;
      if (sfxPool.tooSoon(def.id, now)) { stats.sfxSkipped++; return; }
      const vg = ctx.createGain(); vg.gain.value = 1;
      let node: AudioNode = vg; const nodes: AudioNode[] = [vg];
      const panV = params?.pan === 'auto' ? (params.x01 != null ? (clamp(params.x01, 0, 1) * 2 - 1) * 0.7 : 0) : typeof params?.pan === 'number' ? clamp(params.pan, -1, 1) : 0;
      if (panV !== 0) { const p = makePanner(ctx, panV); vg.connect(p); node = p; nodes.push(p); }
      node.connect(graph.sfx);
      const gainMul = (params?.gain ?? 1) * (reducedSound ? (def.loud ? 0.4 : 0.7) : 1);
      const t = now + 0.005;
      const len = playSfxInto(ctx, vg, t, def.id, { pitch: params?.pitch, gain: gainMul, variation: params?.variation, durationScale: params?.durationScale, soft: reducedSound });
      const { stolen } = sfxPool.acquire(def.id, now, t + len, (fade) => { releaseGain(vg, fade); });
      stats.sfxStolen += stolen.length; stats.sfxPlayed++;
      cleanupLater(nodes, len + 0.4);
    },

    note(instrument: Instrument, note: string | number, o?: { durationMs?: number; gain?: number; pan?: number }) {
      if (!ready() || !ctx || !graph || muted) return;
      const inst = resolveInstrument(instrument);
      if (!inst) { warnOnce('inst:' + instrument, `unknown instrument "${instrument}"`); return; }
      const now = ctx.currentTime; const t = now + 0.005;
      const vg = ctx.createGain(); vg.gain.value = 1;
      let node: AudioNode = vg; const nodes: AudioNode[] = [vg];
      if (o?.pan != null && o.pan !== 0) { const p = makePanner(ctx, o.pan); vg.connect(p); node = p; nodes.push(p); }
      node.connect(graph.sfx);
      const len = playNoteInto(ctx, vg, t, inst.id, note, { durationMs: o?.durationMs ?? 500, gain: (o?.gain ?? 1) * (reducedSound ? 0.7 : 1), vel: 0.75, soft: reducedSound, seed: Math.floor(now * 1000) >>> 0 });
      if (len <= 0) { cleanupLater(nodes, 0.1); return; }
      const acq = notePool.acquire(`n:${inst.id}`, now, t + len, (fade) => releaseGain(vg, fade));
      stats.notesStolen += acq.stolen.length;
      cleanupLater(nodes, len + 0.4);
      return { stop: () => notePool.release(acq.id, 0.08) };
    },

    voice(instrument: Instrument, note: string | number, o?: { gain?: number }) {
      if (!ready() || !ctx || !graph || muted) return null;
      const inst = resolveInstrument(instrument);
      if (!inst || !inst.sustained || !inst.voice) { warnOnce('voice:' + instrument, `"${instrument}" cannot be held; use kazoo, flute, whistle, pad, choir, whale or hum with voice()`); return null; }
      const midi = noteToMidi(note); if (midi == null) return null;
      const now = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = inst.level * (reducedSound ? 0.7 : 1); out.connect(graph.sfx);
      const v: SustainedVoice = inst.voice(ctx, out, now + 0.005, midi, clamp(o?.gain ?? 1, 0, 1.5), reducedSound);
      let ended = false;
      const acq = voicePool.acquire(`v:${inst.id}`, now, now + 3600, (fade) => { if (ended) return; ended = true; v.stop(fade * 1000); cleanupLater([out, v.output], fade + inst.tail + 0.4); });
      stats.voicesStolen += acq.stolen.length;
      return {
        setPitch: (n, glideMs) => v.setPitch(n, glideMs ?? 60),
        setGain: (g) => v.setGain(g),
        stop: (releaseMs) => { if (ended) return; ended = true; voicePool.release(acq.id, 0); v.stop(releaseMs ?? 120); cleanupLater([out, v.output], (releaseMs ?? 120) / 1000 + inst.tail + 0.4); },
      };
    },

    registerScores(s) { Object.assign(scores, s); seq.register(s); },
    playCue(id, o) {
      if (disposed) return;
      if (!seq.has(id)) { warnOnce('cue:' + id, `unknown cue "${id}"`); return; }
      if (!ready()) { pendingCue = { id, fadeMs: o?.fadeMs }; return; }
      seq.play(id, { fadeMs: o?.fadeMs });
    },
    stopMusic(o) { pendingCue = null; seq.stop({ fadeMs: o?.fadeMs }); },
    setTempoScale(scale, rampMs) { seq.setTempoScale(scale, rampMs ?? 0); },
    setAmbience(b, o) {
      if (disposed) return;
      if (!ready()) { pendingBed = { bed: b, gain: o?.gain, fadeMs: o?.fadeMs }; return; }
      startBed(b, o?.gain, o?.fadeMs);
    },
    duck(amount, ms) { if (ready()) graph?.duck(amount, ms); },
    setDepth(d) { graph?.setDepth(d); },

    speak(text, o) {
      if (disposed) return { cancel() {}, done: Promise.resolve() };
      return narrator.speak(text, o);
    },
    pauseSpeech() { narrator.pause(); },
    resumeSpeech() { narrator.resume(); },

    stopTransient() {
      narrator.cancel();
      sfxPool.releaseAll(0.06); notePool.releaseAll(0.06); voicePool.releaseAll(0.1);
    },
    stopAll() {
      api.stopTransient();
      pendingCue = null; pendingBed = undefined;
      seq.stop({ fadeMs: 300 });
      if (ctx && graph) startBed(null, 0, 300);
      graph?.setSpeechDuck(false);
    },
    dispose() {
      if (disposed) return;
      api.stopAll();
      disposed = true;
      doc?.removeEventListener('visibilitychange', onVis);
      musicPool.releaseAll(0.02);
      setT(() => { seq.clear(); try { void ctx?.close(); } catch { /* closed */ } }, 400);
    },
    get cue() { return seq.currentCue; },
    get ambienceBed() { return bed ? bed.id : null; },
    narrator,
    get graph() { return graph; },
    stats,
  };
  return api;
}
