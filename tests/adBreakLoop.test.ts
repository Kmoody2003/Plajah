// The ad-break loop.
//
// Reported as "K-Moody is stuck in an ad break loop again". The word "again" is the tell: this is
// the second time the same writer bug has surfaced, in a second place.
//
// A writer once stored 1 into duration fields — its own Math.max(1, …) defeated its own fallback.
// The VIDEO case was fixed for it and carries a comment saying so. The helper every OTHER slot
// type used was not, so `adDurationSeconds: 1` survived as a one-second ad break.
//
// A one-second ad break is not a small error. syncFast arms the next boundary at the slot's
// remaining time, so the channel re-derives about once a second, remounting the break bumper each
// time. The bumper never reaches its own end, so the channel never returns to programming. From
// the sofa that is an ad break looping forever.
//
//   npx tsx --test tests/adBreakLoop.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastChannelSlot } from '../types';
import {
  DEFAULT_AD_SEC, DEFAULT_BUMPER_SEC, DEFAULT_FM_SEC, DEFAULT_VIDEO_SEC,
  hasPlayableProgramme, loopTotalSec, slotDurationSec,
} from '../services/fastChannelTimeline';

const slot = (over: Partial<FastChannelSlot> & { type: FastChannelSlot['type'] }): FastChannelSlot =>
  ({ id: 'x', order: 0, ...over } as FastChannelSlot);

const video = (url = 'https://stream.mux.com/abc.m3u8', duration = 1800) =>
  slot({ type: 'VIDEO', videoId: 'v', videoUrl: url, videoTitle: 'v', videoDurationSeconds: duration });

// ── The bug ──────────────────────────────────────────────────────────────────

test('a poisoned ad duration falls back instead of becoming a one-second break', () => {
  // The exact value the old writer stored. Before the fix this returned 1.
  assert.equal(slotDurationSec(slot({ type: 'AD_BREAK', adDurationSeconds: 1 })), DEFAULT_AD_SEC);
});

test('every slot type treats 1 as unknown, not as a duration', () => {
  // The VIDEO case was already correct. The point of this test is the OTHERS — the ones that
  // shared the unfixed helper.
  assert.equal(slotDurationSec(slot({ type: 'VIDEO', videoDurationSeconds: 1 })), DEFAULT_VIDEO_SEC);
  assert.equal(slotDurationSec(slot({ type: 'AD_BREAK', adDurationSeconds: 1 })), DEFAULT_AD_SEC);
  assert.equal(slotDurationSec(slot({ type: 'BUMPER', bumperDurationSeconds: 1 })), DEFAULT_BUMPER_SEC);
  assert.equal(slotDurationSec(slot({ type: 'FM_BLOCK', videoDurationSeconds: 1 })), DEFAULT_FM_SEC);
});

test('no slot can ever be short enough to churn the player', () => {
  // The property that actually matters. syncFast re-derives on every boundary, so any slot short
  // enough to expire inside a render cycle turns the channel into a strobe of bumpers.
  const everyType: FastChannelSlot[] = [
    slot({ type: 'VIDEO', videoDurationSeconds: 1 }),
    slot({ type: 'PUBLIC_DOMAIN', videoDurationSeconds: 0 }),
    slot({ type: 'AD_BREAK', adDurationSeconds: 1 }),
    slot({ type: 'BUMPER', bumperDurationSeconds: 1 }),
    slot({ type: 'FM_BLOCK', videoDurationSeconds: 1 }),
    slot({ type: 'GENERATIVE', videoDurationSeconds: 1 }),
    slot({ type: 'LIVE_INTERRUPT', liveInterruptMaxDurationSeconds: 1 }),
    slot({ type: 'AD_BREAK' }),
    slot({ type: 'VIDEO' }),
  ];
  for (const s of everyType) {
    assert.ok(slotDurationSec(s) >= 5, `${s.type} resolved to ${slotDurationSec(s)}s`);
  }
});

test('a real stored duration is still honoured', () => {
  // The fix must not swallow genuinely short slots that were set deliberately.
  assert.equal(slotDurationSec(slot({ type: 'AD_BREAK', adDurationSeconds: 15 })), 15);
  assert.equal(slotDurationSec(slot({ type: 'BUMPER', bumperDurationSeconds: 8 })), 8);
  assert.equal(slotDurationSec(slot({ type: 'VIDEO', videoDurationSeconds: 2 })), 2);
});

test('poisoned breaks no longer collapse the ad load', () => {
  // Six breaks around one programme. Poisoned, they occupied six seconds of a 30-minute hour and
  // each expired inside a render cycle; repaired they occupy six minutes and behave like breaks.
  const breaks = Array.from({ length: 6 }, () => slot({ type: 'AD_BREAK', adDurationSeconds: 1 }));
  assert.equal(loopTotalSec(breaks), 6 * DEFAULT_AD_SEC);
  assert.equal(loopTotalSec([video(), ...breaks]), 1800 + 6 * DEFAULT_AD_SEC);
});

test('an all-poisoned schedule no longer fits inside a few seconds', () => {
  // The worst case, and what "stuck in an ad loop" actually is: every duration poisoned, so the
  // entire day's loop is shorter than one render cycle and the channel re-derives forever.
  const poisoned = [
    slot({ type: 'VIDEO', videoId: 'v', videoUrl: 'https://stream.mux.com/a.m3u8', videoTitle: 'v', videoDurationSeconds: 1 }),
    slot({ type: 'AD_BREAK', adDurationSeconds: 1 }),
    slot({ type: 'BUMPER', bumperDurationSeconds: 1 }),
    slot({ type: 'AD_BREAK', adDurationSeconds: 1 }),
  ];
  // Four slots at 1s each is a four-second day. Repaired, it is over half an hour.
  assert.ok(loopTotalSec(poisoned) > 1800, `loop was only ${loopTotalSec(poisoned)}s`);
});

// ── Telling "in commercials" from "cannot play" ─────────────────────────────

test('a schedule with a playable programme is recognised as having one', () => {
  assert.equal(hasPlayableProgramme([slot({ type: 'AD_BREAK' }), video()]), true);
});

test('a loop of nothing but breaks and bumpers has no programming', () => {
  // Worth distinguishing: this channel is not in an ad break, it has nothing to play. Both look
  // identical on screen today, which is exactly why the fault gets reported as an ad loop.
  assert.equal(hasPlayableProgramme([
    slot({ type: 'AD_BREAK' }),
    slot({ type: 'BUMPER' }),
    slot({ type: 'FM_BLOCK' }),
  ]), false);
});

test('a programme with no url does not count as playable', () => {
  assert.equal(hasPlayableProgramme([slot({ type: 'VIDEO', videoId: 'v', videoTitle: 'v' })]), false);
});

test('an embed-only programme does not count as playable', () => {
  // FAST never plays third-party iframes — autoplay gates and TV iframe limits break them — so a
  // schedule of YouTube links is a channel with nothing on it.
  assert.equal(hasPlayableProgramme([video('https://www.youtube.com/watch?v=abc')]), false);
});
