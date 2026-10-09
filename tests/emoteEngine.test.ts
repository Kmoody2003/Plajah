// Tests for the live-emote engine: chat parsing, autocomplete, tap batching, rate limits, chorus
// detection (distinct people, not spam), crowd light (no strobing, colour follows the crowd), access.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEmoteText, isEmoteOnly, emoteQueryAt, completeEmote, TapBatcher, TokenBucket, ChorusDetector, CrowdLight, canUseEmote, pushRecent,
  relayWanted, RelayBuffer, spreadTick,
} from '../services/emotes/emoteEngine';
import type { EmoteDef } from '../services/emotes/emoteTypes';

const def = (code: string, gel = '#ff0000', access?: EmoteDef['access']): EmoteDef => ({
  id: `core.${code}`, code, name: code, pack: 'core', tags: [], gel, motion: 'float', access, art: { kind: 'svg', svg: () => '' },
});
const LIB = new Map(['fire', 'lol', 'gg'].map(c => [c, def(c)]));
const resolve = (c: string) => LIB.get(c) ?? null;

test('parses emote codes, keeps unknown codes and times as text', () => {
  const segs = parseEmoteText('gg :fire: at 10:30 :nope: :LOL:', resolve);
  assert.deepEqual(segs.map(s => (s.t === 'text' ? s.v : `<${s.code}>`)), ['gg ', '<fire>', ' at 10:30 :nope: ', '<lol>']);
  // a bogus code right before a real one doesn't swallow it
  assert.deepEqual(parseEmoteText(':a:fire:', resolve).map(s => (s.t === 'text' ? s.v : `<${s.code}>`)), [':a', '<fire>']);
});

test('emote-only detection (jumbo + emote-only chat mode)', () => {
  assert.equal(isEmoteOnly(parseEmoteText(' :fire: :gg: ', resolve)), true);
  assert.equal(isEmoteOnly(parseEmoteText(':fire: lol', resolve)), false);
  assert.equal(isEmoteOnly(parseEmoteText('   ', resolve)), false);
});

test('autocomplete finds the code being typed and completes it', () => {
  assert.deepEqual(emoteQueryAt('nice :fi', 8), { query: 'fi', start: 5 });
  assert.equal(emoteQueryAt('nice :f', 7), null);          // needs 2 chars
  assert.equal(emoteQueryAt('at 10:30', 8), null);          // a time is not a code
  assert.deepEqual(completeEmote('nice :fi', 8, 'fire'), { text: 'nice :fire: ', caret: 12 });
});

test('tap batching: holding the button produces one event per window with a count', () => {
  const sent: [string, number][] = [];
  let fire: (() => void) | null = null;
  const b = new TapBatcher((id, n) => sent.push([id, n]), 650, 30, (fn) => { fire = fn; return 0 as never; });
  for (let i = 0; i < 12; i++) b.tap('core.fire');
  b.tap('core.lol');
  assert.equal(sent.length, 0);
  fire!();
  assert.deepEqual(sent, [['core.fire', 12], ['core.lol', 1]]);
  for (let i = 0; i < 50; i++) b.tap('core.fire');
  fire!();
  assert.deepEqual(sent.at(-1), ['core.fire', 30]);       // capped per event
});

test('token bucket refills over time', () => {
  const tb = new TokenBucket(3, 1, 0);
  assert.equal([0, 0, 0, 0].map(() => tb.take(0)).join(), 'true,true,true,false');
  assert.equal(tb.take(500), false);
  assert.equal(tb.take(1100), true);
});

test('chorus needs distinct people, fires each tier once, then cools down', () => {
  const c = new ChorusDetector({ base: [3, 5, 8], audienceFrac: [0, 0, 0], cooldownMs: 10_000 });
  // one person spamming never starts a chorus
  for (let i = 0; i < 40; i++) assert.equal(c.add('core.fire', 'spammer', 1000 + i), null);
  const hits = [];
  for (let i = 0; i < 10; i++) { const h = c.add('core.fire', `u${i}`, 2000 + i * 100); if (h) hits.push(h.tier); }
  assert.deepEqual(hits, [1, 2, 3]);
  // cooling down after a full chorus
  assert.equal(c.add('core.fire', 'late', 3500), null);
  // other emotes are independent
  assert.equal(c.add('core.lol', 'a', 3500), null);
});

test('chorus window: senders older than the window drop out', () => {
  const c = new ChorusDetector({ base: [3, 50, 90], audienceFrac: [0, 0, 0], windowMs: 1000 });
  c.add('x', 'a', 0); c.add('x', 'b', 100);
  assert.equal(c.add('x', 'c', 5000), null);   // a and b expired
});

test('chorus thresholds scale with the audience', () => {
  const c = new ChorusDetector();
  c.audience = 10; assert.deepEqual(c.thresholds(), [3, 8, 18]);
  c.audience = 2000; assert.deepEqual(c.thresholds(), [40, 120, 300]);
});

test('crowd light follows the dominant gel, rises smoothly and decays to dark', () => {
  const L = new CrowdLight();
  let s = L.step(0.033);
  assert.equal(s.intensity, 0);
  for (let i = 0; i < 20; i++) L.add('#ff2200');
  L.add('#0044ff');
  let prev = 0, maxJump = 0;
  for (let i = 0; i < 30; i++) { s = L.step(1 / 30); maxJump = Math.max(maxJump, Math.abs(s.intensity - prev)); prev = s.intensity; }
  assert.equal(s.dominant, '#ff2200');
  assert.ok(s.rgb[0] > s.rgb[2] * 2, `mix should be red-dominant, got ${s.hex}`);
  assert.ok(s.intensity > 0.4, `intensity ${s.intensity}`);
  assert.ok(maxJump < 0.1, `no strobing: max per-frame change ${maxJump}`);
  for (let i = 0; i < 30 * 30; i++) s = L.step(1 / 30);
  assert.ok(s.intensity < 0.05, `decays, got ${s.intensity}`);
});

test('access tiers', () => {
  assert.equal(canUseEmote(def('a'), {}), true);
  assert.equal(canUseEmote(def('a', '#fff', 'member'), { isFollower: true }), false);
  assert.equal(canUseEmote(def('a', '#fff', 'member'), { isMember: true }), true);
  assert.equal(canUseEmote(def('a', '#fff', 'follower'), { isCreator: true }), true);
});

test('recents move to the front without duplicates', () => {
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'c', 3), ['c', 'a', 'b']);
});

test('relay switches on for busy streams with hysteresis', () => {
  assert.equal(relayWanted(39, false), false);
  assert.equal(relayWanted(40, false), true);
  assert.equal(relayWanted(30, true), true);     // stays on between the two thresholds
  assert.equal(relayWanted(24, true), false);
});

test('relay buffer folds taps per emote, biggest first, capped', () => {
  const b = new RelayBuffer();
  b.add('a', 2); b.add('b', 9); b.add('a', 3); b.add('c', 1);
  assert.deepEqual(b.drain(2), [['b', 9], ['a', 5]]);
  assert.equal(b.size, 0);
});

test('spreadTick spreads a tick over its duration and skips my own taps', () => {
  const s = spreadTick([['fire', 12], ['lol', 2]], 1200, new Map([['lol', 2]]));
  assert.ok(s.every(x => x.id === 'fire'), 'my own lol taps were already drawn locally');
  assert.equal(s.length, 6);
  assert.equal(s.reduce((n, x) => n + x.n, 0), 12, 'counts are preserved');
  assert.ok(s[0].at > 0 && s.at(-1)!.at < 1200 && s.every((x, i) => i === 0 || x.at >= s[i - 1].at));
});
