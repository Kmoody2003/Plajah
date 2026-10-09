// A recording stand-in for the audio engine: for the behaviour runtime's unit tests and for authors' dry runs ("what would this page play?").
// It makes no sound and needs no AudioContext. It also validates ids against the real catalogues, so a typo in a behaviour shows up as a problem.

import type { AudioReadyState, BookAudioApi, Instrument, Score, SfxParams } from '../contracts';
import { resolveBed } from './ambience';
import { resolveInstrument } from './instruments';
import { splitWords } from './narration';
import { resolveSfx } from './sfxCatalog';

export interface MockCall { method: string; args: unknown[]; at: number; seq: number }

export interface MockAudio extends BookAudioApi {
  calls: MockCall[];
  /** all calls of one method */
  callsOf(method: string): MockCall[];
  /** ids passed to sfx(), in order */
  sfxIds(): string[];
  /** problems found so far: unknown sfx / instrument / bed / cue ids, sound before unlock */
  problems: string[];
  reset(): void;
  registeredScores: Record<string, Score>;
  currentCue: string | null;
  ambienceBed: string | null;
  depth: number;
  tempoScale: number;
  /** set false to make unlock() leave the engine locked (to test "no sound before a gesture") */
  allowUnlock: boolean;
  /** finish every pending speak() (resolves done); words are reported first if reportWords is true */
  finishSpeech(): void;
  /** number of live held voices */
  openVoices: number;
  stopTransient(): void;
  setReducedSound(on: boolean): void;
}

export function createMockAudio(o: { clock?: () => number; autoSpeak?: boolean; reportWords?: boolean } = {}): MockAudio {
  const clock = o.clock ?? (() => Date.now());
  let seqNo = 0;
  const calls: MockCall[] = [];
  const problems: string[] = [];
  const state: AudioReadyState = { unlocked: false, muted: false, musicGain: 0.7, sfxGain: 1, reducedSound: false };
  const speaking: Array<{ finish(): void }> = [];
  const rec = (method: string, ...args: unknown[]) => { calls.push({ method, args, at: clock(), seq: seqNo++ }); };
  const needUnlock = (what: string) => { if (!state.unlocked) problems.push(`${what} before unlock()`); };

  const m: MockAudio = {
    calls, problems, registeredScores: {}, currentCue: null, ambienceBed: null, depth: 0, tempoScale: 1, allowUnlock: true, openVoices: 0,
    callsOf: (method) => calls.filter((c) => c.method === method),
    sfxIds: () => calls.filter((c) => c.method === 'sfx').map((c) => c.args[0] as string),
    reset() { calls.length = 0; problems.length = 0; m.currentCue = null; m.ambienceBed = null; m.depth = 0; m.tempoScale = 1; m.openVoices = 0; },
    async unlock() { rec('unlock'); if (m.allowUnlock) state.unlocked = true; },
    get state() { return state; },
    setMuted(x) { rec('setMuted', x); state.muted = x; },
    setGains(g) { rec('setGains', g); if (g.music != null) state.musicGain = g.music; if (g.sfx != null) state.sfxGain = g.sfx; },
    setReducedSound(on) { rec('setReducedSound', on); state.reducedSound = on; },
    sfx(id: string, params?: SfxParams & { x01?: number }) {
      rec('sfx', id, params); needUnlock(`sfx("${id}")`);
      if (id !== 'footstep' && !resolveSfx(id)) problems.push(`unknown sfx "${id}"`);
    },
    note(instrument: Instrument, note: string | number, opts) {
      rec('note', instrument, note, opts); needUnlock(`note("${instrument}")`);
      if (!resolveInstrument(instrument)) problems.push(`unknown instrument "${instrument}"`);
      return { stop() { rec('note.stop', instrument, note); } };
    },
    voice(instrument: Instrument, note: string | number, opts) {
      rec('voice', instrument, note, opts); needUnlock(`voice("${instrument}")`);
      const inst = resolveInstrument(instrument);
      if (!inst) problems.push(`unknown instrument "${instrument}"`);
      else if (!inst.sustained) { problems.push(`"${instrument}" cannot be held with voice()`); return null; }
      m.openVoices++;
      let open = true;
      return {
        setPitch(n, glideMs) { rec('voice.setPitch', instrument, n, glideMs); },
        setGain(g) { rec('voice.setGain', instrument, g); },
        stop(releaseMs) { if (open) { open = false; m.openVoices--; } rec('voice.stop', instrument, releaseMs); },
      };
    },
    registerScores(s) { rec('registerScores', Object.keys(s)); Object.assign(m.registeredScores, s); },
    playCue(id, opts) {
      rec('playCue', id, opts);
      if (!m.registeredScores[id]) problems.push(`unknown cue "${id}"`);
      m.currentCue = id;
    },
    stopMusic(opts) { rec('stopMusic', opts); m.currentCue = null; },
    setTempoScale(scale, rampMs) { rec('setTempoScale', scale, rampMs); m.tempoScale = scale; },
    setAmbience(bed, opts) {
      rec('setAmbience', bed, opts);
      if (bed && !resolveBed(bed)) problems.push(`unknown ambience bed "${bed}"`);
      m.ambienceBed = bed;
    },
    duck(amount, ms) { rec('duck', amount, ms); },
    setDepth(d) { rec('setDepth', d); m.depth = d; },
    speak(text, opts) {
      rec('speak', text, { voice: opts?.voice, rate: opts?.rate });
      let resolve!: () => void; const done = new Promise<void>((r) => { resolve = r; });
      let finished = false;
      const words = splitWords(text);
      const finish = () => {
        if (finished) return; finished = true;
        if (o.reportWords) words.forEach((_, i) => opts?.onWord?.(i));
        resolve();
      };
      speaking.push({ finish });
      if (o.autoSpeak) finish();
      return { cancel() { rec('speak.cancel', text); finished = true; resolve(); }, done };
    },
    finishSpeech() { for (const s of speaking.splice(0)) s.finish(); },
    stopTransient() { rec('stopTransient'); },
    stopAll() { rec('stopAll'); m.currentCue = null; m.ambienceBed = null; m.openVoices = 0; },
    dispose() { rec('dispose'); },
  };
  return m;
}
