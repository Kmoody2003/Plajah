// Shared test doubles for the living runtime: a recording BookAudioApi and a recording RuntimeHost.
import type { AnimSpec, BookAudioApi, BurstKind, HapticPattern, Scalar, Target } from '../services/living/contracts';
import type { ActionCtx, RuntimeHost } from '../services/living/runtime/interpreter';
import { VarStore } from '../services/living/runtime/state';
import { resolveTarget, type ObjInfo } from '../services/living/runtime/targets';

export class MockAudio implements BookAudioApi {
  calls: Array<[string, ...unknown[]]> = [];
  state = { unlocked: true, muted: false, musicGain: 1, sfxGain: 1, reducedSound: false };
  voices: Array<{ stopped: boolean; pitches: Array<string | number> }> = [];
  async unlock() { this.calls.push(['unlock']); }
  setMuted(m: boolean) { this.calls.push(['setMuted', m]); }
  setGains(g: unknown) { this.calls.push(['setGains', g]); }
  sfx(id: string, p?: unknown) { this.calls.push(['sfx', id, p]); }
  note(i: string, n: string | number, o?: unknown) { this.calls.push(['note', i, n, o]); }
  voice(i: string, n: string | number, o?: unknown) {
    this.calls.push(['voice', i, n, o]); const rec = { stopped: false, pitches: [n] }; this.voices.push(rec);
    return { setPitch: (x: string | number) => { rec.pitches.push(x); }, setGain: () => {}, stop: () => { rec.stopped = true; } };
  }
  registerScores(s: unknown) { this.calls.push(['registerScores', s]); }
  playCue(id: string, o?: unknown) { this.calls.push(['playCue', id, o]); }
  stopMusic(o?: unknown) { this.calls.push(['stopMusic', o]); }
  setTempoScale(s: number, r?: number) { this.calls.push(['setTempoScale', s, r]); }
  setAmbience(b: string | null, o?: unknown) { this.calls.push(['setAmbience', b, o]); }
  duck(a: number, ms: number) { this.calls.push(['duck', a, ms]); }
  setDepth(d: number) { this.calls.push(['setDepth', d]); }
  speak(t: string) { this.calls.push(['speak', t]); return { cancel() {}, done: Promise.resolve() }; }
  stopAll() { this.calls.push(['stopAll']); }
  dispose() { this.calls.push(['dispose']); }
  names() { return this.calls.map(c => c[0]); }
  of(name: string) { return this.calls.filter(c => c[0] === name); }
}

export class MockHost implements RuntimeHost {
  log: Array<[string, ...unknown[]]> = [];
  vars: VarStore;
  _reduced = false; _sound = true; t = 0;
  pending: Array<{ at: number; res: () => void }> = [];
  constructor(public audio: MockAudio | null, public objs: ObjInfo[] = [], vars: Record<string, Scalar> = {}, public groups?: Record<string, string[]>) { this.vars = new VarStore(vars); }
  reduced() { return this._reduced; }
  sound() { return this._sound; }
  now() { return this.t; }
  resolve(t: Target | undefined, ctx: ActionCtx) { return t ? resolveTarget(t, this.objs, this.groups) : ctx.targets; }
  centerOf(ids: string[]) { const o = this.objs.find(x => x.id === ids[0]); return o ? { x: o.box.x + o.box.w / 2, y: o.box.y + o.box.h / 2 } : null; }
  animate(ids: string[], spec: AnimSpec) { this.log.push(['animate', ids, spec]); }
  stopAnim(ids: string[]) { this.log.push(['stopAnim', ids]); }
  setProps(ids: string[], props: unknown) { this.log.push(['setProps', ids, props]); }
  visibility(ids: string[], mode: string, spec?: AnimSpec) { this.log.push(['visibility', ids, mode, spec]); }
  burst(at: { x: number; y: number }, kind: BurstKind, count?: number) { this.log.push(['burst', at, kind, count]); }
  trail(kind: BurstKind, v?: string) { this.log.push(['trail', kind, v]); }
  follow(ids: string[], o: unknown) { this.log.push(['follow', ids, o]); }
  narrate(a?: number, b?: number) { this.log.push(['narrate', a, b]); }
  haptic(p: HapticPattern) { this.log.push(['haptic', p]); }
  goto(p: number | 'next' | 'prev') { this.log.push(['goto', p]); }
  emit(n: string, p?: unknown) { this.log.push(['emit', n, p]); }
  announce(t: string) { this.log.push(['announce', t]); }
  celebrate() { this.log.push(['celebrate']); }
  /** A sleep the test resolves by hand: advance(ms). */
  sleep(ms: number) { return new Promise<void>(res => { this.pending.push({ at: this.t + ms, res }); }); }
  async advance(ms: number) { this.t += ms; const due = this.pending.filter(p => p.at <= this.t); this.pending = this.pending.filter(p => p.at > this.t); due.forEach(d => d.res()); for (let i = 0; i < 6; i++) await Promise.resolve(); }
  names() { return this.log.map(l => l[0]); }
  of(name: string) { return this.log.filter(l => l[0] === name); }
}

export const box = (x: number, y: number, w = 40, h = 40) => ({ x, y, w, h });
export const OBJS: ObjInfo[] = [
  { id: 'bo-body', label: 'Bo body', role: 'IMAGE_SLOT', box: box(100, 200, 200, 120) },
  { id: 'bo-eye-l', label: 'Bo eye L', box: box(130, 210, 20, 20) },
  { id: 'bo-eye-r', label: 'Bo eye R', box: box(170, 210, 20, 20) },
  { id: 'win-1', label: 'Window 1', box: box(20, 20) },
  { id: 'win-2', label: 'Window 2', box: box(80, 20) },
  { id: 'title', label: 'Title', role: 'HEADLINE', box: box(10, 400, 300, 40) },
];
