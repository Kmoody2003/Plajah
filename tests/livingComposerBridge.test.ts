// Melos clip <-> Living Score bridge: pure conversion tests, deterministic round trips, documented loss.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Score } from '../services/living/contracts';
import type { NoteEvent } from '../services/melos/beats/grooveDoc';
import { canonicalScore, clipToScore, scoreToClips, scoreToSingleClip, velFromMelos, velToMelos } from '../services/living/composer/melosBridge';
import { progressionToClip } from '../services/melos/composition/progressionToClip';

const ev = (id: string, startBeats: number, lengthBeats: number, key: number, vel: number): NoteEvent => ({ id, startBeats, lengthBeats, key, vel });
const strip = (ns: NoteEvent[]) => ns.map(({ startBeats, lengthBeats, key, vel }) => ({ startBeats, lengthBeats, key, vel }));

test('velocity maps 1..127 <-> 0..1 and round-trips every integer', () => {
  for (let v = 1; v <= 127; v++) assert.equal(velToMelos(velFromMelos(v)), v);
  assert.equal(velToMelos(undefined), 89);   // 0.7 * 127
  assert.equal(velToMelos(5), 127); assert.equal(velToMelos(-1), 1);
});

test('clip -> score carries pitch, start, duration (beats), velocity and tempo', () => {
  const { score, loss } = clipToScore({ lengthBeats: 4, notes: [ev('a', 0, 1, 60, 127), ev('b', 1.5, 0.5, 64, 64)] }, { id: 's', tempo: 92, instrument: 'marimba' });
  assert.equal(score.tempo, 92); assert.equal(score.lengthBeats, 4);
  assert.equal(score.tracks[0].instrument, 'marimba');
  assert.deepEqual(score.tracks[0].notes.map((n) => [n.t, n.n, n.d]), [[0, 60, 1], [1.5, 64, 0.5]]);
  assert.equal(score.tracks[0].notes[0].v, 1);
  assert.ok(loss.dropped.length > 0);
});

test('melos -> score -> melos is exact (only ids regenerate), incl. a real Melos progression clip', () => {
  const clip = progressionToClip('pop', 7, { barBeats: 3, velocity: 77 })!;
  const a = clipToScore(clip, { id: 'rt', tempo: 100 });
  const b = scoreToClips(a.score, { idPrefix: 'rt' });
  assert.equal(b.clips.length, 1);
  const sorted = [...clip.notes!].sort((x, y) => x.startBeats - y.startBeats || x.key - y.key);
  assert.deepEqual(strip(b.clips[0].clip.notes!), strip(sorted));
  assert.equal(b.clips[0].clip.lengthBeats, clip.lengthBeats);
  assert.equal(b.tempo, 100);
  assert.equal(b.loss.unpitchedSkipped, 0);
});

test('round trip is deterministic: same input twice gives identical JSON, ids included', () => {
  const clip = progressionToClip('canon', 2)!;
  const run = () => JSON.stringify(scoreToClips(clipToScore(clip, { id: 'd', tempo: 80 }).score, { idPrefix: 'd' }));
  assert.equal(run(), run());
});

test('score -> melos -> score keeps pitched notes; names become numbers; unpitched hits are skipped and counted', () => {
  const s: Score = { id: 'x', tempo: 72, beatsPerBar: 3, lengthBeats: 6, tracks: [
    { instrument: 'musicbox', notes: [{ t: 0, n: 'E5', d: 1.5, v: 0.5 }, { t: 1.5, n: 'D5', d: 0.5, v: 0.25 }, { t: 3, n: 72, d: 3, v: 1 }] },
    { instrument: 'shaker', notes: [{ t: 0, n: 'x', d: 0.25, v: 0.3 }, { t: 1, n: 'kick', d: 0.25 }] },
  ] };
  const r = scoreToClips(s);
  assert.equal(r.loss.unpitchedSkipped, 2);
  assert.equal(r.clips[1].clip.notes!.length, 0);
  assert.deepEqual(r.clips[0].clip.notes!.map((n) => n.key), [76, 74, 72]);
  const back = clipToScore(r.clips[0].clip, { id: 'x', tempo: r.tempo, instrument: 'musicbox', beatsPerBar: 3 }).score;
  const want = canonicalScore(s).tracks[0].notes;
  assert.deepEqual(back.tracks[0].notes.map((n) => [n.t, n.n, n.d]), want.map((n) => [n.t, n.n, n.d]));
  for (let i = 0; i < want.length; i++) assert.ok(Math.abs(back.tracks[0].notes[i].v! - want[i].v!) < 0.5 / 127 + 1e-9);   // velocity quantised to 1/127
});

test('single-clip merge sorts all pitched tracks together and clamps out-of-range pitches', () => {
  const s: Score = { id: 'm', tempo: 80, lengthBeats: 4, tracks: [
    { instrument: 'pad', notes: [{ t: 2, n: 60, d: 2 }] },
    { instrument: 'harp', notes: [{ t: 0, n: 200, d: 1, v: 0.5 }, { t: 2, n: 55, d: 1 }] },
  ] };
  const r = scoreToSingleClip(s);
  assert.deepEqual(r.clip.notes!.map((n) => [n.startBeats, n.key]), [[0, 127], [2, 55], [2, 60]]);
  assert.ok(r.loss.adjusted >= 1);
});
