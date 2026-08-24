// Inflection Points — the deterministic contract.
//
// The whole design depends on the shared song schedule being a pure function of (day, pool, policy):
// if two devices computed different timelines, they would no longer be watching one channel. These
// tests pin that, plus the crossfade envelope and the decaying inflection.
//
//   npx tsx --test tests/inflection.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  songTimelineForDay, sharedSongAt, sharedInflectionAt, pickSolaSong, solaInflection,
  DEFAULT_INFLECTION_POLICY, type EndlessHourConfig, type InflectionSong,
} from '../services/fast/inflection';

const song = (id: string, over: Partial<InflectionSong> = {}): InflectionSong => ({
  id, title: id, artist: 'Various', audioUrl: `https://x/${id}.mp3`, durationSec: 180,
  key: 0, brightness: 0.5, energy: 0.5, enabled: true, weight: 1, ...over,
});

const cfg = (over: Partial<EndlessHourConfig> = {}): EndlessHourConfig => ({
  pool: [song('a', { key: 7, brightness: 0.9, energy: 0.8 }), song('b', { key: 3, brightness: 0.2, energy: 0.2 }), song('c')],
  // Short gaps so a test day is densely populated and easy to probe.
  policy: { ...DEFAULT_INFLECTION_POLICY, minGapSec: 300, maxGapSec: 600, inflectionDecaySec: 900 },
  ...over,
});

// A fixed UTC day to probe.
const DAY = Date.UTC(2026, 7, 23, 0, 0, 0);
const at = (secOfDay: number) => DAY + secOfDay * 1000;

test('the shared timeline is a pure function of the day, pool and policy', () => {
  const a = songTimelineForDay(at(0), cfg());
  const b = songTimelineForDay(at(43200), cfg()); // any time within the same UTC day
  assert.deepEqual(a, b, 'same day + config must yield an identical timeline');
  assert.ok(a.length > 10, `a day of short gaps should have many songs, got ${a.length}`);

  // A different day differs.
  const other = songTimelineForDay(Date.UTC(2026, 7, 24), cfg());
  assert.notDeepEqual(a.map((s) => s.song.id), other.map((s) => s.song.id));
});

test('the timeline is ordered, non-overlapping and never straddles midnight', () => {
  const tl = songTimelineForDay(at(0), cfg());
  let prevEnd = 0;
  for (const s of tl) {
    assert.ok(s.startSec >= prevEnd, `songs must not overlap (start ${s.startSec} < prev end ${prevEnd})`);
    assert.ok(s.endSec > s.startSec);
    assert.ok(s.endSec < 24 * 3600, 'no song may cross midnight');
    prevEnd = s.endSec;
  }
});

test('sharedSongAt reports the song, the aligned offset, and a full crossfade', () => {
  const c = cfg();
  const tl = songTimelineForDay(at(0), c);
  const first = tl[0];

  // Outside every window → generative bed, nothing playing.
  assert.equal(sharedSongAt(at(1), c), null);

  // Deep in the body → full song, no bed.
  const mid = first.startSec + first.song.durationSec / 2;
  const body = sharedSongAt(at(mid), c);
  assert.ok(body, 'a song should be playing mid-window');
  assert.equal(body!.song.id, first.song.id);
  assert.ok(Math.abs(body!.offsetSec - first.song.durationSec / 2) < 1.0, 'offset ~ half the song');
  assert.ok(body!.songGain > 0.98 && body!.bedGain < 0.02, 'bed fully out in the body');

  // Just inside the fade-in → partial, bed still audible, and songGain + bedGain === 1.
  const edge = sharedSongAt(at(first.startSec + 1), c);
  assert.ok(edge && edge.songGain > 0 && edge.songGain < 1, 'edge is mid-crossfade');
  assert.ok(Math.abs(edge!.songGain + edge!.bedGain - 1) < 1e-9, 'full crossfade: gains sum to 1');
});

test('an ended song inflects the engine, and weakens over time', () => {
  const c = cfg();
  const tl = songTimelineForDay(at(0), c);
  // A mid-day song: no yesterday-tail bleed, and a real gap after it.
  const k = Math.floor(tl.length / 2);
  const midSong = tl[k];
  const nextStart = tl[k + 1]?.startSec ?? Infinity;

  // Right after it ends: it IS the active inflection, strong, biased by itself.
  const justAfter = sharedInflectionAt(at(midSong.endSec + 3), c);
  assert.ok(justAfter, 'an inflection should exist right after a song');
  assert.equal(justAfter!.song.id, midSong.song.id);
  assert.ok(justAfter!.strength > 0.5 * c.policy.inflectionStrength, 'strong just after');
  assert.ok(Math.abs(justAfter!.transpose) <= 6, 'transpose is a shortest-path semitone shift');

  // Later, still that song and before the next one starts: weaker.
  const later = Math.min(midSong.endSec + c.policy.inflectionDecaySec * 0.6, nextStart - 1);
  if (later > midSong.endSec + 3) {
    const l = sharedInflectionAt(at(later), c)!;
    assert.equal(l.song.id, midSong.song.id, 'still the same song mid-decay');
    assert.ok(l.strength <= justAfter!.strength, 'inflection weakens over time');
  }
});

test('with a real gap between songs, the inflection fully decays to null', () => {
  // Sparse: 4-hour gaps and a 10-minute decay, so a long silent stretch exists.
  const sparse = cfg({ policy: { ...DEFAULT_INFLECTION_POLICY, minGapSec: 4 * 3600, maxGapSec: 4 * 3600, inflectionDecaySec: 600 } });
  const tl = songTimelineForDay(at(0), sparse);
  const s0 = tl[0];
  const nextStart = tl[1]?.startSec ?? Infinity;
  const probe = s0.endSec + sparse.policy.inflectionDecaySec + 60;
  assert.ok(probe < nextStart, 'the sparse gap leaves a genuinely silent stretch');
  assert.equal(sharedInflectionAt(at(probe), sparse), null, 'no song within the decay window → null');
});

test('brightness and energy biases carry the song\'s sign', () => {
  const c = cfg();
  const tl = songTimelineForDay(at(0), c);
  // Find an ended instance of the bright/energetic song 'a' vs the dim 'b' and compare bias signs.
  const bright = tl.find((s) => s.song.id === 'a');
  const dim = tl.find((s) => s.song.id === 'b');
  if (bright) {
    const inf = sharedInflectionAt(at(bright.endSec + 2), c)!;
    if (inf.song.id === 'a') assert.ok(inf.brightnessBias > 0 && inf.energyBias > 0, 'bright song biases up');
  }
  if (dim) {
    const inf = sharedInflectionAt(at(dim.endSec + 2), c)!;
    if (inf.song.id === 'b') assert.ok(inf.brightnessBias < 0 && inf.energyBias < 0, 'dim song biases down');
  }
});

test('a disabled policy or empty pool makes the channel purely generative', () => {
  assert.deepEqual(songTimelineForDay(at(0), cfg({ policy: { ...DEFAULT_INFLECTION_POLICY, enabled: false } })), []);
  assert.deepEqual(songTimelineForDay(at(0), cfg({ pool: [] })), []);
  assert.equal(sharedSongAt(at(1000), cfg({ pool: [] })), null);
  assert.equal(sharedInflectionAt(at(1000), cfg({ pool: [] })), null);
});

test('disabled songs never schedule and never inflect', () => {
  const c = cfg({ pool: [song('on'), song('off', { enabled: false })] });
  const ids = new Set(songTimelineForDay(at(0), c).map((s) => s.song.id));
  assert.ok(ids.has('on'));
  assert.ok(!ids.has('off'), 'a disabled song must never appear on the timeline');
});

test('Sola picks from entropy, honours the chance gate, and inflects on its own clock', () => {
  const c = cfg();
  // chance 0 → never a song.
  assert.equal(pickSolaSong(cfg({ policy: { ...c.policy, solaSongChance: 0 } }), () => 0.5), null);
  // chance 1 → always a song, drawn from the pool.
  const picked = pickSolaSong(cfg({ policy: { ...c.policy, solaSongChance: 1 } }), (() => { let i = 0; const v = [0.0, 0.1]; return () => v[i++ % v.length]; })());
  assert.ok(picked && ['a', 'b', 'c'].includes(picked.id));

  // Its inflection decays the same way the shared one does.
  const s = song('x', { key: 5, brightness: 1, energy: 1 });
  assert.ok(solaInflection(s, 10, c.policy)!.strength > 0.5 * c.policy.inflectionStrength);
  assert.equal(solaInflection(s, c.policy.inflectionDecaySec + 1, c.policy), null, 'gone past the window');
});
