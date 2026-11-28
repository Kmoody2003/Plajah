import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignAudio } from '../services/fabula/smartSync/audioAlign';
import { alignTranscripts, chunksToWords } from '../services/fabula/smartSync/transcriptAlign';
import { fuseAngle, layout, applyVision } from '../services/fabula/smartSync/fuse';
import { motionLag } from '../services/fabula/smartSync/visionLock';
import { segmentProgram, sentenceBreaks } from '../services/fabula/smartSync/segment';
import { detectFlags, carryDecisions } from '../services/fabula/smartSync/graphicsFlags';
import { precut, locksFromCut, normalizeCouncil, leadFor } from '../services/fabula/smartSync/editorCouncil';
import { runSmartSync, newState, defaultOptions, setManualOffset, type SmartSyncIO } from '../services/fabula/smartSync/pipeline';
import { buildTimeline } from '../services/fabula/smartSync/timeline';
import type { SyncAngle, TimedWord } from '../services/fabula/smartSync/types';

// Deterministic noise.
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** A "program": speech-like bursts of noise with random gaps, at 8 kHz. */
function program(sec: number, seed = 1, rate = 8000) {
  const r = rng(seed), out = new Float32Array(sec * rate);
  let i = 0;
  while (i < out.length) {
    const on = Math.floor((0.15 + r() * 0.6) * rate), off = Math.floor((0.05 + r() * 0.5) * rate), amp = 0.05 + r() * 0.5;
    for (let k = 0; k < on && i < out.length; k++, i++) out[i] = (r() * 2 - 1) * amp;
    i += off;
  }
  return out;
}

test('audio: finds a long lag (minutes) to 5 ms with noise and level change', () => {
  const rate = 8000, m = program(240, 7);
  const start = 83.37; // angle started 83.37 s into the master
  const len = 120 * rate, a = new Float32Array(len), r = rng(99);
  for (let i = 0; i < len; i++) a[i] = m[Math.floor(start * rate) + i] * 0.4 + (r() * 2 - 1) * 0.01;
  const c = alignAudio(m, a, rate)!;
  assert.ok(c, 'aligned');
  assert.ok(Math.abs(c.lag - start) < 0.01, `lag ${c.lag}`);
  assert.ok(c.confidence > 0.5, `conf ${c.confidence}`);
});

test('audio: an angle that started BEFORE the master gives a negative lag', () => {
  const rate = 8000, src = program(200, 3);
  const m = src.subarray(30 * rate, 180 * rate); // master starts at 30 s of the "world"
  const a = src.subarray(10 * rate, 100 * rate);  // angle starts at 10 s
  const c = alignAudio(m, a, rate)!;
  assert.ok(Math.abs(c.lag - (-20)) < 0.01, `lag ${c.lag}`);
});

const sentence = 'turn with me in your bibles to john chapter three verse sixteen for god so loved the world that he gave his only begotten son that whosoever believeth in him should not perish but have everlasting life';
function wordsAt(text: string, t0: number, rate = 0.4): TimedWord[] {
  return text.split(' ').map((w, i) => ({ t: t0 + i * rate, end: t0 + i * rate + 0.3, text: w }));
}

test('transcript: word anchors find the lag, ignoring repeated refrains', () => {
  const refrain = 'hallelujah hallelujah praise the lord hallelujah';
  const master = [...wordsAt(refrain, 10), ...wordsAt(refrain, 40), ...wordsAt(sentence, 600), ...wordsAt(refrain, 900)];
  const angle = wordsAt(sentence, 600 - 412.5).map((w) => ({ ...w, t: w.t + 0.05 }));
  const r = alignTranscripts(master, angle)!;
  assert.ok(Math.abs(r.lag - 412.45) < 0.2, `lag ${r.lag}`);
  assert.ok(r.anchors >= 10);
});

test('transcript: chunks → words keeps the phrase span', () => {
  const w = chunksToWords([{ text: 'hello there world', start: 1, end: 2.5 }], 10);
  assert.equal(w.length, 3); assert.ok(Math.abs(w[0].t - 11) < 1e-9); assert.ok(Math.abs(w[2].end - 12.5) < 1e-6);
});

test('fuse: agreeing audio + transcript lock; disagreeing goes to review', () => {
  const lock = fuseAngle('a', [{ method: 'audio', lag: 12.345, confidence: 0.8 }, { method: 'transcript', lag: 12.4, confidence: 0.7 }]);
  assert.equal(lock.status, 'locked'); assert.equal(lock.lag, 12.345);
  const split = fuseAngle('b', [{ method: 'audio', lag: 5, confidence: 0.5 }, { method: 'transcript', lag: 65, confidence: 0.5 }]);
  assert.notEqual(split.status, 'locked');
  const v = applyVision(lock, { agree: 0, disagree: 3, unsure: 0 });
  assert.equal(v.status, 'review');
});

test('layout: multicam 0 is the earliest start; offsets follow Fabula convention', () => {
  const angles: SyncAngle[] = [{ assetId: 'm', name: 'board', kind: 'audio', duration: 100 }, { assetId: 'c', name: 'cam', kind: 'video', duration: 100 }];
  const L = layout(angles, [{ assetId: 'm', lag: 0, confidence: 1, status: 'master', method: 'master', candidates: [], notes: [] }, { assetId: 'c', lag: -10, confidence: 1, status: 'locked', method: 'audio', candidates: [], notes: [] }]);
  assert.equal(L.mcZero, -10); assert.equal(L.mcDuration, 110);
  assert.equal(L.offsets.c, 0);    // camera source 0 plays at multicam 0
  assert.equal(L.offsets.m, -10);  // master's sound starts 10 s in
});

test('vision: motion curves recover a picture shift', () => {
  const r = rng(5), base = Array.from({ length: 80 }, () => r());
  const shifted = [0, 0, 0, ...base.slice(0, 77)]; // angle events 3 samples later
  const m = motionLag(base, shifted, 0.1, 0.6);
  assert.ok(Math.abs(m.lag - 0.3) < 1e-9, `lag ${m.lag}`); assert.ok(m.score > 0.9);
});

function churchService(): TimedWord[] {
  const parts: Array<[string, number]> = [
    ['good morning church welcome welcome to all our visitors and our online family we are glad you are here', 0],
    ['praise the lord hallelujah hallelujah sing it again hallelujah lift your hands hallelujah glory glory hallelujah', 90],
    ['hallelujah hallelujah sing hallelujah praise him praise him hallelujah glory', 150],
    ['please help me welcome pastor james carter to the pulpit', 240],
    ['turn with me in your bibles to john 3:16 for god so loved the world', 260],
    ['the bible says church some of you are carrying weight god wants you free brothers and sisters can i get an amen', 330],
    ['the bible says church some of you need to hear this jesus is enough brothers and sisters', 420],
    ['you can give tonight text the word give to 77977 or cash app $gracechurch thank you for your generosity', 600],
  ];
  // Real speech runs ~2.5 words/s: repeat each part to fill its stretch.
  return parts.flatMap(([s, t], i) => {
    const until = parts[i + 1]?.[1] ?? 700, out: TimedWord[] = [];
    for (let at = t; at < until - 5; at += s.split(' ').length * 0.4 + 0.8) out.push(...wordsAt(s, at, 0.4));
    return out.filter((w) => w.t < until);
  });
}

test('segment: a church service splits into its parts', () => {
  const secs = segmentProgram(churchService(), 700, 'church', { win: 30, minLen: 45 });
  const kinds = secs.map((s) => s.kind);
  assert.ok(kinds.includes('worship'), kinds.join(','));
  assert.ok(kinds.includes('sermon') || kinds.includes('scripture'), kinds.join(','));
  assert.equal(secs[0].start, 0); assert.equal(secs[secs.length - 1].end, 700);
});

test('flags: scripture lower third at the callout, name LT, giving full page', () => {
  const words = churchService();
  const flags = detectFlags(words, [], 'church');
  const sc = flags.find((f) => f.category === 'scripture');
  assert.ok(sc, 'scripture flag'); assert.match(sc!.title, /John 3:16/);
  assert.ok(sc!.at >= 260 && sc!.at < 266, `at ${sc!.at}`);
  const nm = flags.find((f) => f.category === 'name');
  assert.ok(nm, 'name flag'); assert.equal(nm!.title, 'Pastor James Carter');
  const gv = flags.find((f) => f.category === 'giving');
  assert.ok(gv && gv.kind === 'fullPage', 'giving full page');
  // Editor decisions survive a re-run.
  const prev = flags.map((f) => (f.category === 'name' ? { ...f, status: 'rejected' as const } : f));
  const again = carryDecisions(detectFlags(words, [], 'church'), prev);
  assert.equal(again.find((f) => f.category === 'name')!.status, 'rejected');
});

test('precut: respects locks, coverage, pacing; council can only shape, never override', () => {
  const angles: SyncAngle[] = [
    { assetId: 'w', name: 'WIDE', kind: 'video', duration: 300 },
    { assetId: 'c', name: 'pulpit CU', kind: 'video', duration: 300 },
    { assetId: 'x', name: 'crowd', kind: 'video', duration: 100 }, // only covers the first 100 s
  ];
  const offsets = { w: 0, c: 0, x: 0 };
  const looks = [{ assetId: 'w', size: 'wide' as const, subject: '', tags: [] }, { assetId: 'c', size: 'close' as const, subject: '', tags: [] }, { assetId: 'x', size: 'crowd' as const, subject: '', tags: ['audience'] }];
  const sections = [{ id: 'sec1', kind: 'worship' as const, start: 0, end: 120, label: 'Worship', confidence: 1 }, { id: 'sec2', kind: 'sermon' as const, start: 120, end: 300, label: 'Sermon', confidence: 1 }];
  const breaks = Array.from({ length: 100 }, (_, i) => i * 3 + 1.5);
  const locks = [{ start: 150, end: 170, angle: 0 }];
  const cut = precut({ angles, offsets, looks, sections, breaks, flags: [], locks, duration: 300, lead: 'WORSHIP', fps: 30 });
  assert.equal(cut[0].start, 0); assert.equal(cut[cut.length - 1].end, 300);
  for (let i = 1; i < cut.length; i++) assert.ok(Math.abs(cut[i].start - cut[i - 1].end) < 1e-6, 'contiguous');
  assert.equal(cut[0].angle, 0, 'worship opens wide');
  const lk = cut.find((c) => c.locked)!; assert.equal(lk.start, 150); assert.equal(lk.end, 170); assert.equal(lk.angle, 0);
  assert.ok(!cut.some((c) => c.angle === 2 && c.start > 100), 'never cuts to an angle with no picture');
  for (const c of cut.filter((c) => !c.locked && c.end < 299)) assert.ok(c.end - c.start <= 16 * 1.6 + 1.5, `shot ${c.end - c.start}`);
  // A council adjustment that tries to avoid the locked angle cannot remove the lock.
  const council = normalizeCouncil({ adjustments: [{ sectionId: 'sec2', avoidAngles: [1], pace: 0.7 }], notes: [{ member: 'WORSHIP', note: 'x' }, { member: 'BOGUS', note: 'y' }] }, 'WORSHIP', sections);
  assert.equal(council.notes.length, 1);
  const cut2 = precut({ angles, offsets, looks, sections, breaks, flags: [], locks: locksFromCut(cut, locks), duration: 300, lead: 'WORSHIP', council, fps: 30 });
  const lk2 = cut2.find((c) => c.locked && c.start === 150)!; assert.equal(lk2.angle, 0);
  assert.ok(!cut2.some((c) => !c.locked && c.start >= 120 && c.angle === 0), 'council avoided angle 1 in the sermon');
  assert.equal(leadFor('church'), 'WORSHIP');
});

test('pipeline end-to-end with fake IO: sync, segment, flag, pre-cut, council, timeline', async () => {
  const rate = 8000, world = program(400, 11);
  const words = churchService();
  const angles: SyncAngle[] = [
    { assetId: 'board', name: 'Board feed', kind: 'audio', duration: 380 },
    { assetId: 'wide', name: 'WIDE cam', kind: 'video', duration: 360 },
    { assetId: 'cu', name: 'pulpit CU', kind: 'video', duration: 300 },
  ];
  const startInWorld: Record<string, number> = { board: 10, wide: 25, cu: 70.5 };
  const io: SmartSyncIO = {
    async pcm(a, r) {
      const s0 = startInWorld[a.assetId], len = a.duration;
      const base = world.subarray(Math.floor(s0 * rate), Math.floor((s0 + len) * rate));
      if (r === rate) return base;
      const out = new Float32Array(Math.floor(base.length * r / rate)); for (let i = 0; i < out.length; i++) out[i] = base[Math.floor(i * rate / r)]; return out;
    },
    async transcribe() { return []; }, // no recogniser in tests — the transcript is fed below
    async llm() { return { notes: [{ member: 'WORSHIP', note: 'Hold the wide through worship.' }], adjustments: [{ sectionId: 'sec1', pace: 1.3, prefer: ['wide'] }], summary: 'A calm service.' }; },
  };
  let s = newState(angles, defaultOptions({ programType: 'church', fps: 30, vision: false }));
  s = await runSmartSync(s, io, { to: 'fuse' });
  const lag = (id: string) => s.sync.find((x) => x.assetId === id)!.lag;
  assert.ok(Math.abs(lag('wide') - 15) < 0.02, `wide ${lag('wide')}`);
  assert.ok(Math.abs(lag('cu') - 60.5) < 0.02, `cu ${lag('cu')}`);
  assert.ok(s.sync.filter((x) => x.status === 'locked').length === 2, JSON.stringify(s.sync.map((x) => [x.assetId, x.status, x.confidence])));
  // Feed the transcript directly (the fake recogniser returns none), then run the rest.
  s = { ...s, words };
  s = await runSmartSync(s, io, { from: 'vision' });
  assert.ok(s.sections.length >= 1);
  assert.ok(s.flags.some((f) => f.category === 'scripture'));
  assert.ok(s.cut.length > 3);
  assert.equal(s.council?.summary, 'A calm service.');
  // Manual nudge keeps everything consistent.
  const before = s.mcZero, sec0 = s.sections[0].end;
  s = setManualOffset(s, 'cu', 10); // cu source 10 s at multicam 0 → cu now starts before everyone
  assert.equal(before, 0); assert.ok(Math.abs(s.mcZero - -10) < 1e-9);
  assert.ok(Math.abs(s.sections[0].end - (sec0 + 10)) < 1e-9, 'sections move with multicam 0');
  assert.equal(s.sync.find((x) => x.assetId === 'cu')!.status, 'manual');
  let n = 0;
  const built = buildTimeline(s, { mcAssetId: 'MC', at: 0, videoTrack: 'v1', audioTrack: 'a1', gfxTrack: 'v2', uid: () => `id${n++}`, fps: 30, ltSpec: { scripture: 'newsline' }, titleFx: {} });
  const v = built.clips.filter((c) => c.kind === 'multicam');
  assert.ok(v.length > 3 && v.every((c) => c.av === true));
  assert.equal(built.clips.filter((c) => c.trackId === 'a1').length, 1);
  assert.ok(built.clips.some((c) => c.aiFlag?.category === 'scripture' && c.tGraphic?.specId === 'newsline'));
  assert.ok(built.markers.length >= 1);
  assert.ok(sentenceBreaks(words).length > 0);
});
