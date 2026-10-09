// Evite kids play gate — every kids plate gets a game, randomness is seeded, the math holds, nobody gets stuck.
// Run: npx tsx --test tests/evitePlay.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../services/evite/plateCatalog.json';
import {
  playFor, PLAY_TABLE, KIDS_PLAY_COLLECTIONS, SPRITES, baseSubject, shuffle, memoryDeck, memoryFaces, memoryGrid, spawnSchedule,
  huntSpots, hitCircle, pickNearest, tapRadius, scratchGrid, scratchAt, scratchLine, coverage, revealed, REVEAL_AT,
  createClock, tickClock, pauseClock, assistLevel, PLAY_LIMIT_MS, hitPhase, FRAME_MS, springAt, shardFor, progressLabel, seedFrom, rng, MIN_TAP,
} from '../services/evite/playGames';

const collections = (catalog as any).collections as { id: string; plates: string[] }[];
const kidsPlates = collections.filter(c => (KIDS_PLAY_COLLECTIONS as readonly string[]).includes(c.id)).flatMap(c => c.plates.map(s => [c.id, s] as [string, string]));

describe('plate → game', () => {
  test('all four kids collections are in the catalog', () => {
    for (const k of KIDS_PLAY_COLLECTIONS) assert.ok(collections.some(c => c.id === k), k);
    assert.ok(kidsPlates.length >= 60);
  });
  test('every kids plate has an explicitly mapped, sane spec', () => {
    for (const [c, s] of kidsPlates) {
      assert.ok(PLAY_TABLE[`${c}/${baseSubject(s)}`], `no table row for ${c}/${s}`);
      const p = playFor(c, s);
      assert.ok(p, `${c}/${s}`);
      assert.ok(SPRITES.includes(p!.sprite), `${c}/${s} sprite`);
      assert.ok(p!.prompt.length > 8 && p!.prompt.length <= 60, `${c}/${s} prompt "${p!.prompt}"`);
      assert.ok(p!.colors.length >= 2 && p!.colors.every(x => /^#[0-9A-F]{6}$/i.test(x)), `${c}/${s} colors`);
      const goals = { pop: [6, 10], catch: [6, 10], hunt: [3, 5], candles: [3, 6], memory: [4, 6], scratch: [40, 70] } as const;
      const [lo, hi] = goals[p!.kind];
      assert.ok(p!.goal >= lo && p!.goal <= hi, `${c}/${s} goal ${p!.goal}`);
    }
  });
  test('the brief\'s examples land', () => {
    assert.deepEqual([playFor('kids_boy', 'dino')!.kind, playFor('kids_boy', 'dino')!.goal, playFor('kids_boy', 'dino')!.sprite], ['hunt', 3, 'egg']);
    assert.deepEqual([playFor('kids_boy', 'rocket')!.kind, playFor('kids_boy', 'rocket')!.goal, playFor('kids_boy', 'rocket')!.sprite], ['catch', 8, 'star']);
    for (const [c, s] of [['kids_boy', 'shark'], ['kids_girl', 'mermaid'], ['kids_everyone', 'bubbles']]) assert.equal(playFor(c, s)!.kind, 'pop');
    assert.equal(playFor('kids_girl', 'bakery')!.kind, 'candles'); assert.equal(playFor('kids_girl', 'bakery')!.goal, 4);
    assert.equal(playFor('kids_kaiju', 'cake-eruption')!.kind, 'candles');
    for (const s of ['kitty', 'princess']) { assert.equal(playFor('kids_girl', s)!.kind, 'memory'); assert.equal(playFor('kids_girl', s)!.goal, 6); }
    for (const [c, s] of [['kids_girl', 'unicorn'], ['kids_girl', 'art'], ['kids_girl', 'popstar'], ['kids_girl', 'ballet'], ['kids_boy', 'truck'], ['kids_boy', 'knight']]) assert.equal(playFor(c, s)!.kind, 'scratch', `${c}/${s}`);
    assert.equal(playFor('kids_everyone', 'bubbles')!.prompt, 'Pop 8 bubbles to open your invite!');
  });
  test('every kind is used', () => {
    const kinds = new Set(kidsPlates.map(([c, s]) => playFor(c, s)!.kind));
    for (const k of ['pop', 'catch', 'memory', 'hunt', 'candles', 'scratch']) assert.ok(kinds.has(k as any), k);
  });
  test('alternates inherit their base subject', () => {
    const alts = kidsPlates.filter(([, s]) => s.endsWith('-alt'));
    assert.ok(alts.length >= 10);
    for (const [c, s] of alts) assert.deepEqual(playFor(c, s), playFor(c, baseSubject(s)), `${c}/${s}`);
    assert.deepEqual(playFor('kids_everyone', 'magic-alt'), playFor('kids_everyone', 'magic-show'));
    assert.deepEqual(playFor('kids_boy', 'dino-alt'), playFor('kids_boy', 'dino'));
  });
  test('non-kids collections get no gate', () => {
    for (const c of collections.filter(c => !c.id.startsWith('kids_') && c.id !== 'sports_kids')) for (const s of c.plates) assert.equal(playFor(c.id, s), null, `${c.id}/${s}`);
    assert.equal(playFor('wedding', 'dino'), null);
  });
  test('kids team sports get their own game (watch-party plates do not)', () => {
    const kids = collections.find(c => c.id === 'sports_kids')!;
    for (const s of kids.plates) assert.ok(PLAY_TABLE[`sports_kids/${s}`], `explicit row for sports_kids/${s}`);
    assert.equal(playFor('sports_kids', 'basketball')!.sprite, 'ball');
    assert.equal(playFor('sports_adult', 'basketball'), null);
  });
  test('specs are fresh objects (callers can mutate safely)', () => {
    const a = playFor('kids_boy', 'shark')!; a.colors.push('#000000');
    assert.notEqual(playFor('kids_boy', 'shark')!.colors.length, a.colors.length);
  });
});

describe('seeded randomness', () => {
  test('rng + shuffle are deterministic per seed and keep every element', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    assert.deepEqual(shuffle(xs, 42), shuffle(xs, 42));
    assert.notDeepEqual(shuffle(xs, 42), shuffle(xs, 43));
    assert.deepEqual([...shuffle(xs, 7)].sort((a, b) => a - b), xs);
    assert.deepEqual(xs, Array.from({ length: 20 }, (_, i) => i), 'input untouched');
    const r = rng(seedFrom('kids_boy/dino')); for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
  });
  test('memory deck has exact pairs and is seeded', () => {
    for (const pairs of [4, 6, 8]) {
      const d = memoryDeck(pairs, 99);
      assert.equal(d.length, pairs * 2);
      const counts = new Map<number, number>(); for (const id of d) counts.set(id, (counts.get(id) || 0) + 1);
      assert.equal(counts.size, pairs);
      for (const [id, n] of counts) { assert.equal(n, 2, `id ${id}`); assert.ok(id >= 0 && id < pairs); }
    }
    assert.deepEqual(memoryDeck(6, 1), memoryDeck(6, 1));
    assert.notDeepEqual(memoryDeck(6, 1), memoryDeck(6, 2));
    const g = memoryGrid(12); assert.ok(g.cols * g.rows >= 12);
  });
  test('memory faces are distinct for every memory plate', () => {
    for (const [c, s] of kidsPlates) {
      const p = playFor(c, s)!; if (p.kind !== 'memory') continue;
      const f = memoryFaces(p); assert.equal(f.length, p.goal);
      assert.equal(new Set(f.map(x => x.sprite)).size, p.goal, `${c}/${s} faces repeat`);
      assert.equal(f[0].sprite, p.sprite, 'theme sprite first');
    }
  });
  test('spawn schedules are seeded, sorted, on-card and give enough chances to win', () => {
    for (const kind of ['pop', 'catch'] as const) {
      const a = spawnSchedule(kind, 8, 1234), b = spawnSchedule(kind, 8, 1234), c = spawnSchedule(kind, 8, 4321);
      assert.deepEqual(a, b); assert.notDeepEqual(a, c);
      assert.ok(a.length >= 16, 'at least 2× goal');
      for (let i = 1; i < a.length; i++) assert.ok(a[i].at >= a[i - 1].at);
      for (const e of a) { assert.ok(e.x >= 0.08 && e.x <= 0.92, `x ${e.x}`); assert.ok(e.speed > 0); assert.ok(e.at >= 0 && e.at < PLAY_LIMIT_MS); }
      assert.ok(a.filter(e => e.at < 10000).length >= 8, 'goal reachable by 10 s');
      // lanes vary: no five spawns in a row in the same fifth of the card
      for (let i = 4; i < a.length; i++) assert.ok(new Set(a.slice(i - 4, i + 1).map(e => Math.floor(e.x * 5))).size > 1);
    }
  });
  test('hunt spots are seeded, apart and inside the play area', () => {
    const W = 347, H = 520;
    const s = huntSpots(3, 77, W, H, { top: 120, bottom: 60, margin: 36 });
    assert.deepEqual(s, huntSpots(3, 77, W, H, { top: 120, bottom: 60, margin: 36 }));
    assert.equal(s.length, 3);
    for (const p of s) { assert.ok(p.x >= 36 && p.x <= W - 36); assert.ok(p.y >= 120 && p.y <= H - 60); }
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.ok(Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y) >= Math.min(W, H) * 0.3 * 0.5);
    assert.equal(huntSpots(12, 5, 100, 100, { top: 0, bottom: 0, margin: 0, minDist: 90 }).length, 12, 'relaxes instead of looping forever');
  });
});

describe('hit testing', () => {
  test('circles, nearest pick and the 44 px floor', () => {
    assert.ok(hitCircle(10, 10, 0, 0, 15)); assert.ok(!hitCircle(20, 20, 0, 0, 15));
    assert.equal(tapRadius(10), MIN_TAP / 2); assert.equal(tapRadius(60), 38);
    assert.equal(pickNearest(50, 50, [{ x: 0, y: 0, r: 100 }, { x: 55, y: 55, r: 20 }, { x: 300, y: 300, r: 10 }]), 1);
    assert.equal(pickNearest(500, 500, [{ x: 0, y: 0, r: 10 }]), -1);
  });
});

describe('scratch coverage', () => {
  test('empty, full and half', () => {
    const g = scratchGrid(120, 180, 12);
    assert.equal(g.cols, 10); assert.equal(g.rows, 15); assert.equal(coverage(g), 0);
    scratchAt(g, 60, 90, 10_000); assert.equal(coverage(g), 1); assert.ok(revealed(g));
    const h = scratchGrid(120, 120, 10);
    for (let y = 5; y < 120; y += 10) scratchLine(h, 0, y, 59, y, 4);
    assert.equal(coverage(h), 0.5); assert.ok(!revealed(h)); assert.ok(revealed(h, 0.5));
  });
  test('re-scratching the same spot does not double count', () => {
    const g = scratchGrid(100, 100, 10);
    const a = scratchAt(g, 50, 50, 20); const b = scratchAt(g, 50, 50, 20);
    assert.ok(a > 0); assert.equal(b, 0); assert.equal(g.cleared, a);
  });
  test('a finger-sized zig-zag over a phone card reaches the reveal threshold', () => {
    const W = 347, H = 520, g = scratchGrid(W, H, 12); let y = 30, x = 20, dir = 1;
    while (!revealed(g) && y < H) { scratchLine(g, x, y, dir > 0 ? W - 20 : 20, y + 30, 28); x = dir > 0 ? W - 20 : 20; y += 30; dir = -dir; }
    assert.ok(coverage(g) >= REVEAL_AT && y < H, `reached ${coverage(g).toFixed(2)} at y=${y}`);
  });
  test('progress label', () => {
    const s = playFor('kids_girl', 'unicorn')!;
    assert.equal(progressLabel(s, 0), '0%'); assert.equal(progressLabel(s, REVEAL_AT), '100%'); assert.equal(progressLabel(s, 1), '100%');
    assert.equal(progressLabel(playFor('kids_boy', 'rocket')!, 3), '3 / 8');
  });
});

describe('clock + motion', () => {
  test('the 15 s timer auto-completes on visible play time only', () => {
    let c = createClock();
    for (let i = 0; i < 899; i++) c = tickClock(c, 1000 / 60);   // 14.98 s
    assert.equal(c.done, false);
    c = pauseClock(c, true); for (let i = 0; i < 600; i++) c = tickClock(c, 1000 / 60);
    assert.equal(c.done, false, 'hidden tab does not count');
    c = pauseClock(c, false); for (let i = 0; i < 2; i++) c = tickClock(c, 1000 / 60);
    assert.equal(c.done, true); assert.ok(c.elapsed >= PLAY_LIMIT_MS);
    const frozen = tickClock(c, 1000); assert.equal(frozen.elapsed, c.elapsed, 'stays done');
  });
  test('a resumed tab cannot jump to the end in one frame', () => {
    const c = tickClock(createClock(), 60_000); assert.ok(c.elapsed <= 250); assert.equal(c.done, false);
  });
  test('assist ramps in after 7 s', () => {
    assert.equal(assistLevel(0), 0); assert.equal(assistLevel(7000), 0); assert.ok(assistLevel(10000) > 0.4 && assistLevel(10000) < 0.6); assert.equal(assistLevel(20000), 1);
  });
  test('hits are the council\'s three-beat sentence: 2 + 1 + 3 frames, under 100 ms to the burst', () => {
    assert.equal(hitPhase(0).phase, 'anticipation'); assert.deepEqual([hitPhase(0).sx, hitPhase(0).sy], [0.9, 1.1]);
    assert.equal(hitPhase(FRAME_MS * 1.5).phase, 'anticipation');
    assert.equal(hitPhase(FRAME_MS * 2.2).phase, 'impact'); assert.equal(hitPhase(FRAME_MS * 2.2).flash, 0.6);
    assert.equal(hitPhase(FRAME_MS * 3.5).phase, 'dissipation');
    assert.equal(hitPhase(FRAME_MS * 6).travel, 1); assert.ok(FRAME_MS * 6 <= 100);
    assert.equal(hitPhase(FRAME_MS * 20).phase, 'done');
  });
  test('spring(320,28) rises, overshoots a touch and settles', () => {
    assert.equal(springAt(0), 0); assert.equal(springAt(5000), 1);
    let peak = 0; for (let t = 0; t < 1000; t += 5) peak = Math.max(peak, springAt(t));
    assert.ok(peak > 1 && peak < 1.12, `peak ${peak}`);
    assert.ok(Math.abs(springAt(600) - 1) < 0.02);
  });
  test('every sprite has a shard silhouette', () => { for (const s of SPRITES) assert.ok(shardFor(s), s); });
});
