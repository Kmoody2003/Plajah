// Living Books audio ENGINE behaviour against a fake AudioContext: nothing sounds before unlock, caps + voice stealing, hidden tab suspends,
// pending cues start after unlock, muting, stopAll vs stopTransient, dispose. (Real sound is checked in livingAudio.render.test.ts.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookAudio } from '../services/living/audio/engine';
import { DEMO_SCORES } from '../services/living/audio/demoScores';

const PARAMS = new Set(['gain', 'frequency', 'detune', 'Q', 'pan', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release']);
function fakeParam(): any {
  const p: any = { value: 0 };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'setValueCurveAtTime']) p[m] = () => p;
  return p;
}
function fakeNode(counts: Record<string, number>, kind: string): any {
  counts[kind] = (counts[kind] ?? 0) + 1;
  const store: Record<string, any> = {};
  return new Proxy(store, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'connect') return (x: any) => x;
      if (k === 'disconnect' || k === 'start' || k === 'stop') return () => {};
      if (PARAMS.has(k)) return (t[k] = fakeParam());
      return undefined;
    },
    set(t, k: string, v) { t[k] = v; return true; },
  });
}
function fakeCtx() {
  const counts: Record<string, number> = {};
  const ctx: any = {
    currentTime: 0, sampleRate: 44100, state: 'suspended', suspended: 0, resumed: 0, closed: false,
    destination: fakeNode(counts, 'destination'),
    resume() { ctx.resumed++; ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.suspended++; ctx.state = 'suspended'; return Promise.resolve(); },
    close() { ctx.closed = true; ctx.state = 'closed'; return Promise.resolve(); },
    createBuffer(ch: number, len: number) { return { getChannelData: () => new Float32Array(len), length: len, numberOfChannels: ch }; },
    decodeAudioData: async () => ({ duration: 2 }),
    counts,
  };
  for (const [fn, kind] of Object.entries({ createGain: 'gain', createBiquadFilter: 'filter', createDynamicsCompressor: 'comp', createWaveShaper: 'shaper', createConvolver: 'conv', createBufferSource: 'src', createOscillator: 'osc', createStereoPanner: 'pan' })) ctx[fn] = () => fakeNode(counts, kind);
  return ctx;
}

function manualTimer() {
  const q: Array<{ fn: () => void; at: number; id: number }> = []; let now = 0; let id = 0;
  return {
    api: { set: (fn: () => void, ms: number) => { q.push({ fn, at: now + ms, id: ++id }); return id; }, clear: (h: unknown) => { const i = q.findIndex((x) => x.id === h); if (i >= 0) q.splice(i, 1); } },
    run(ms: number) { const end = now + ms; while (true) { q.sort((a, b) => a.at - b.at); const n = q[0]; if (!n || n.at > end) break; q.shift(); now = n.at; n.fn(); } now = end; },
    get pending() { return q.length; },
  };
}

function make(over: any = {}) {
  const ctx = fakeCtx(); const timer = manualTimer();
  const vis: { handler?: () => void } = {};
  const doc: any = { hidden: false, addEventListener: (_: string, h: () => void) => { vis.handler = h; }, removeEventListener: () => { vis.handler = undefined; } };
  const audio = createBookAudio({ createContext: () => ctx, doc, timer: timer.api, speech: null, ...over });
  return { ctx, timer, audio, doc, vis };
}

test('no AudioContext and no sound before unlock(); everything is safe to call', async () => {
  let created = 0;
  const { audio, ctx } = make({ createContext: () => { created++; return fakeCtx(); } });
  audio.sfx('beep'); audio.note('marimba', 'C4'); audio.setDepth(0.5); audio.duck(0.5, 100); audio.setTempoScale(0.8); audio.stopMusic(); audio.stopAll();
  assert.equal(audio.voice('kazoo', 'C4'), null);
  assert.equal(created, 0, 'the context must not be created before a user gesture');
  assert.equal(audio.state.unlocked, false); assert.equal(audio.stats.sfxPlayed, 0);
  await audio.unlock(); await audio.unlock();
  assert.equal(created, 1, 'unlock is idempotent'); assert.equal(audio.state.unlocked, true);
  void ctx;
});

test('after unlock: sfx and notes play; muted and unknown ids are silent no-ops', async () => {
  const { audio, ctx } = make(); await audio.unlock();
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    audio.sfx('beep', { pitch: 3, pan: 'auto', x01: 0.9 }); assert.equal(audio.stats.sfxPlayed, 1);
    audio.sfx('definitely-not-a-sound'); audio.sfx('definitely-not-a-sound'); assert.equal(warned, 1, 'warns once per unknown id');
    assert.equal(audio.stats.sfxPlayed, 1);
    const h = audio.note('marimba', 'E4', { durationMs: 300, gain: 0.8, pan: -0.5 }); assert.ok(h && typeof h.stop === 'function'); h!.stop();
    assert.ok(ctx.counts.osc > 3);
    audio.setMuted(true); assert.equal(audio.state.muted, true);
    const before = audio.stats.sfxPlayed; ctx.currentTime += 1; audio.sfx('boop'); assert.equal(audio.stats.sfxPlayed, before, 'muted: nothing scheduled');
    audio.setMuted(false); ctx.currentTime += 1; audio.sfx('boop'); assert.equal(audio.stats.sfxPlayed, before + 1);
    audio.setGains({ music: 0.3, sfx: 0.5 }); assert.equal(audio.state.musicGain, 0.3); assert.equal(audio.state.sfxGain, 0.5);
    audio.setGains({ music: 9 }); assert.ok(audio.state.musicGain <= 1.5);
  } finally { console.warn = warn; }
});

test('polyphony: retrigger guard, per-sound cap and voice stealing keep the voice count bounded', async () => {
  const { audio, ctx } = make(); await audio.unlock();
  for (let i = 0; i < 6; i++) audio.sfx('beep');                         // same instant: only the first passes the machine-gun guard
  assert.equal(audio.stats.sfxPlayed, 1); assert.equal(audio.stats.sfxSkipped, 5);
  for (let i = 0; i < 12; i++) { ctx.currentTime += 0.05; audio.sfx('bell'); }
  assert.ok(audio.stats.sfxStolen >= 7, `bell is capped per sound (stole ${audio.stats.sfxStolen})`);
  const ids = ['bell', 'chime', 'glass-chime', 'ding', 'whale-call', 'hum', 'yawn', 'snore', 'rumble', 'magic-appear', 'success-jingle', 'harp-gliss', 'thread-pluck', 'owl-hoo', 'heartbeat', 'twinkle', 'cricket', 'unravel', 'sparkle', 'wings', 'splash', 'boing'];
  ctx.currentTime += 10;
  const before = audio.stats.sfxStolen;
  for (const id of ids) { ctx.currentTime += 0.04; audio.sfx(id); }
  assert.ok(audio.stats.sfxStolen > before, 'the global cap steals when 20+ different sounds ring at once');
  for (let i = 0; i < 60; i++) { ctx.currentTime += 0.002; audio.note('musicbox', 60 + (i % 12)); }
  assert.ok(audio.stats.notesStolen >= 40, `notes stolen ${audio.stats.notesStolen}`);
  const vs = Array.from({ length: 9 }, (_, i) => audio.voice('kazoo', 60 + i));
  assert.ok(vs.every(Boolean)); assert.equal(audio.stats.voicesStolen, 3, 'held voices capped at 6');
  vs.forEach((v) => v!.stop());
  assert.equal(audio.voice('harp', 'C4'), null, 'a plucked instrument cannot be held');
});

test('held voices: pitch glide, gain and stop do not throw and stop is idempotent', async () => {
  const { audio } = make(); await audio.unlock();
  const v = audio.voice('whale', 'C3', { gain: 0.8 })!; assert.ok(v);
  v.setPitch('G3', 1200); v.setPitch(60); v.setPitch('not-a-note'); v.setGain(0.4); v.stop(500); v.stop(); v.setPitch('C4'); v.setGain(1);
});

test('a cue requested before unlock starts after it; crossfade and stop work; tempo scale applies', async () => {
  const { audio, ctx, timer } = make();
  audio.registerScores(DEMO_SCORES);
  audio.playCue('lullaby'); audio.setAmbience('night-crickets', { gain: 0.4 });
  assert.equal(audio.cue, null); assert.equal(audio.ambienceBed, null);
  const warn = console.warn; console.warn = () => {};
  audio.playCue('no-such-cue'); console.warn = warn;
  await audio.unlock();
  assert.equal(audio.cue, 'lullaby'); assert.equal(audio.ambienceBed, 'night-crickets');
  const oscStart = ctx.counts.osc;
  for (let t = 0.25; t < 6; t += 0.25) { ctx.currentTime = t; timer.run(250); }
  assert.ok(ctx.counts.osc > oscStart + 10, 'music keeps being scheduled as time advances');
  audio.playCue('city', { fadeMs: 400 }); assert.equal(audio.cue, 'city');
  audio.setTempoScale(0.6, 1000);
  audio.setAmbience('rain-soft'); assert.equal(audio.ambienceBed, 'rain-soft');
  audio.setAmbience(null); assert.equal(audio.ambienceBed, null);
  audio.stopMusic({ fadeMs: 100 }); ctx.currentTime += 2; timer.run(500); assert.equal(audio.cue, null);
});

test('hidden tab suspends the context, visible resumes it', async () => {
  const { audio, ctx, doc, vis } = make(); await audio.unlock();
  assert.ok(vis.handler);
  doc.hidden = true; vis.handler!(); assert.equal(ctx.suspended, 1);
  const resumedBefore = ctx.resumed; doc.hidden = false; vis.handler!(); assert.equal(ctx.resumed, resumedBefore + 1);
});

test('reduced-sound mode is reported and quiets startle sounds without throwing', async () => {
  const { audio, ctx } = make(); await audio.unlock();
  audio.setReducedSound(true); assert.equal(audio.state.reducedSound, true);
  audio.sfx('pop-balloon'); ctx.currentTime += 0.1; audio.sfx('rumble'); assert.equal(audio.stats.sfxPlayed, 2);
  audio.setReducedSound(false); assert.equal(audio.state.reducedSound, false);
});

test('speak: works without audio unlock or a voice engine (silent read-along), cancel stops it', async () => {
  const { audio } = make({ speech: null });
  const words: number[] = []; const h = audio.speak('Hello little moon', { onWord: (i) => words.push(i) });
  h.cancel(); await h.done;
  const h2 = audio.speak('', {}); await h2.done;
});

test('stopTransient keeps music playing; stopAll stops it; dispose closes the context and ignores later calls', async () => {
  const { audio, ctx, timer } = make(); await audio.unlock();
  audio.registerScores(DEMO_SCORES); audio.playCue('folk'); audio.setAmbience('wind');
  audio.sfx('beep'); audio.voice('hum', 'C4');
  audio.stopTransient(); assert.equal(audio.cue, 'folk'); assert.equal(audio.ambienceBed, 'wind');
  audio.stopAll(); assert.equal(audio.ambienceBed, null);
  ctx.currentTime += 1; timer.run(1000); assert.equal(audio.cue, null, 'music fades out and ends after stopAll');
  audio.dispose(); timer.run(2000); assert.equal(ctx.closed, true);
  audio.sfx('beep'); audio.playCue('folk'); audio.dispose();
  assert.equal((await audio.unlock()), undefined);
});

test('WebAudio missing entirely: unlock resolves, nothing throws', async () => {
  const audio = createBookAudio({ createContext: () => { throw new Error('no WebAudio here'); }, doc: null, speech: null });
  const warn = console.warn; console.warn = () => {};
  try { await audio.unlock(); audio.sfx('beep'); audio.playCue('x'); assert.equal(audio.state.unlocked, false); } finally { console.warn = warn; }
});
