// serviceRunner — Test Suite (the run of show)
// Run with: npm run test:runner
//
// Timers are pure on purpose: the stage display, the countdown slide and the
// operator's clock all read the same function, so they cannot disagree.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  timerValue, startTimer, pauseTimer, resetTimer, formatTimer, timerSnapshot, makeTimer,
  runActions, takeSlideAt, flattenPlan, plannedRuntimeSec, nextSlide, currentItem,
  nextIndex, prevIndex,
  type RunnerState, type ServicePlan, type Timer,
} from '../services/ambo/serviceRunner';
import { textSlide, type Slide } from '../services/ambo/showModel';

const T0 = 1_700_000_000_000;
const S = (n: number) => T0 + n * 1000;

// ── Timers ───────────────────────────────────────────────────────────────────

describe('timers', () => {
  test('countdown counts down while running', () => {
    let t = makeTimer('t1', 'Pre-service', 'COUNTDOWN', { durationSec: 300 });
    assert.equal(timerValue(t, T0), 300);
    t = startTimer(t, T0);
    assert.equal(timerValue(t, S(60)), 240);
    assert.equal(timerValue(t, S(300)), 0);
  });

  test('a countdown floors at zero unless overrun is on', () => {
    let t = startTimer(makeTimer('t', 'x', 'COUNTDOWN', { durationSec: 60 }), T0);
    assert.equal(timerValue(t, S(90)), 0);
    t = { ...t, overrun: true };
    assert.equal(timerValue(t, S(90)), -30, 'a speaker needs to know HOW far over');
  });

  test('pause and resume is honest about elapsed time', () => {
    let t = startTimer(makeTimer('t', 'x', 'COUNTDOWN', { durationSec: 600 }), T0);
    t = pauseTimer(t, S(120));
    assert.equal(timerValue(t, S(999)), 480, 'paused time does not keep draining');
    t = startTimer(t, S(200));
    assert.equal(timerValue(t, S(260)), 420, '120 + 60 consumed');
  });

  test('reset returns to the top and stops', () => {
    let t = startTimer(makeTimer('t', 'x', 'COUNTDOWN', { durationSec: 300 }), T0);
    t = resetTimer(pauseTimer(t, S(100)));
    assert.equal(t.running, false);
    assert.equal(timerValue(t, S(500)), 300);
  });

  test('elapsed counts up from zero', () => {
    const t = startTimer(makeTimer('t', 'Message', 'ELAPSED'), T0);
    assert.equal(timerValue(t, S(90)), 90);
  });

  test('count-to-time tracks a wall-clock target', () => {
    const t = makeTimer('t', 'On screen at 10:00', 'TO_TIME', { targetAt: S(600) });
    assert.equal(timerValue(t, T0), 600);
    assert.equal(timerValue(t, S(600)), 0);
    assert.equal(timerValue(t, S(700)), 0, 'floors without overrun');
    assert.equal(timerValue({ ...t, overrun: true }, S(700)), -100);
  });

  test('formatTimer covers the shapes a stage display shows', () => {
    assert.equal(formatTimer(0), '0:00');
    assert.equal(formatTimer(65), '1:05');
    assert.equal(formatTimer(3725), '1:02:05');
    assert.equal(formatTimer(-83), '-1:23');
  });

  test('snapshot is what goes on the wire to outputs', () => {
    const timers: Timer[] = [
      startTimer(makeTimer('a', 'A', 'COUNTDOWN', { durationSec: 100 }), T0),
      makeTimer('b', 'B', 'ELAPSED'),
    ];
    assert.deepEqual(timerSnapshot(timers, S(40)), { a: 60, b: 0 });
  });
});

// ── Actions ──────────────────────────────────────────────────────────────────

describe('slide actions', () => {
  const base = { stack: {}, timers: [makeTimer('cd', 'Countdown', 'COUNTDOWN', { durationSec: 300 })], now: T0 };

  test('TIMER_START runs a timer, and can override its length', () => {
    const r = runActions([{ kind: 'TIMER_START', timerId: 'cd', seconds: 120 }], base);
    assert.equal(r.timers[0].running, true);
    assert.equal(timerValue(r.timers[0], S(30)), 90);
  });

  test('AUDIO_PLAY becomes a real audio layer, not a side channel', () => {
    const r = runActions([{ kind: 'AUDIO_PLAY', src: 'sting.mp3', volume: 0.7 }], base);
    assert.equal(r.stack.overlay?.content.kind, 'AUDIO');
    assert.equal((r.stack.overlay?.content as any).volume, 0.7);
  });

  test('CLEAR_LAYER clears exactly one slot', () => {
    const withBg: any = { ...base, stack: { background: { content: { kind: 'IMAGE', src: 'a' }, since: T0 }, slide: { content: { kind: 'TEXT', blocks: [] }, since: T0 } } };
    const r = runActions([{ kind: 'CLEAR_LAYER', slot: 'slide' }], withBg);
    assert.equal(r.stack.slide, undefined);
    assert.ok(r.stack.background);
  });

  test('macros and switcher cuts are dispatched, not silently swallowed', () => {
    const r = runActions([
      { kind: 'MACRO', macroId: 'lights_worship' },
      { kind: 'SWITCHER_CUT', sourceId: 'cam2' },
    ], base);
    assert.deepEqual(r.dispatched.map(d => d.kind), ['MACRO', 'SWITCHER_CUT']);
  });

  test('GOTO is reported, not executed — the runner owns the cursor', () => {
    const r = runActions([{ kind: 'GOTO', slideId: 'sl_x' }], base);
    assert.equal(r.gotoSlideId, 'sl_x');
  });

  test('no actions is not an error', () => {
    const r = runActions(undefined, base);
    assert.deepEqual(r.dispatched, []);
    assert.equal(r.stack, base.stack);
  });
});

// ── Walking a real service ───────────────────────────────────────────────────

function plan(): ServicePlan {
  const countdown: Slide = { ...textSlide('Starting soon', { label: 'Countdown' }), id: 'cd1',
    onEnter: [{ kind: 'TIMER_START', timerId: 'cd', seconds: 300 }] };
  const song1: Slide = { ...textSlide('Verse 1', { label: 'V1' }), id: 'sg1' };
  const song2: Slide = { ...textSlide('Chorus', { label: 'C' }), id: 'sg2' };
  const msg: Slide = { ...textSlide('All Things', { label: 'Message' }), id: 'ms1',
    onEnter: [{ kind: 'TIMER_START', timerId: 'msg' }],
    onExit: [{ kind: 'CLEAR_LAYER', slot: 'slide' }] };

  return {
    id: 'svc', title: 'Sunday', startsAt: T0,
    items: [
      { id: 'i1', kind: 'COUNTDOWN', title: 'Countdown', plannedSec: 300, show: { id: 's1', title: 'Countdown', kind: 'MEDIA', slides: [countdown] } },
      { id: 'i2', kind: 'SONG', title: 'Great Are You Lord', plannedSec: 280, owner: 'Worship', show: { id: 's2', title: 'Song', kind: 'SONG', slides: [song1, song2] } },
      { id: 'i3', kind: 'MESSAGE', title: 'All Things', plannedSec: 1800, owner: 'Pastor Ellis', show: { id: 's3', title: 'Message', kind: 'PRESENTATION', slides: [msg] } },
    ],
  };
}

describe('running the service', () => {
  const timers = [
    makeTimer('cd', 'Countdown', 'COUNTDOWN', { durationSec: 300 }),
    makeTimer('msg', 'Message', 'ELAPSED'),
  ];
  const state0: RunnerState = { plan: plan(), cursor: -1, stack: {}, timers };

  test('the plan flattens to every slide, in order', () => {
    assert.deepEqual(flattenPlan(state0.plan).map(f => f.slide.id), ['cd1', 'sg1', 'sg2', 'ms1']);
  });

  test('planned runtime adds up', () => {
    assert.equal(plannedRuntimeSec(state0.plan), 2380);
  });

  test('taking the countdown starts its timer', () => {
    const s = takeSlideAt(state0, 0, T0);
    assert.equal(s.cursor, 0);
    assert.ok(s.stack.slide, 'the slide is on screen');
    assert.equal(s.timers.find(t => t.id === 'cd')!.running, true);
  });

  test('exit actions of the previous slide run before the next is applied', () => {
    let s = takeSlideAt(state0, 3, T0);          // message, sets slide layer
    assert.ok(s.stack.slide);
    s = takeSlideAt(s, 1, S(10));                // leaving message runs its onExit CLEAR_LAYER…
    assert.ok(s.stack.slide, '…then the new slide applies its own text');
    assert.equal((s.stack.slide!.content as any).blocks[0].text, 'Verse 1');
  });

  test('the message timer starts when the message does', () => {
    const s = takeSlideAt(state0, 3, T0);
    const msg = s.timers.find(t => t.id === 'msg')!;
    assert.equal(msg.running, true);
    assert.equal(timerValue(msg, S(120)), 120);
  });

  test('next / prev stay inside the service', () => {
    const at0 = { ...state0, cursor: 0 };
    assert.equal(nextIndex(at0), 1);
    assert.equal(prevIndex(at0), 0, 'cannot go before the first slide');
    assert.equal(nextIndex({ ...state0, cursor: 3 }), 3, 'cannot run off the end');
  });

  test('the stage display can see what is coming', () => {
    assert.equal(nextSlide({ ...state0, cursor: 0 })!.id, 'sg1');
    assert.equal(nextSlide({ ...state0, cursor: 3 }), null);
  });

  test('the run sheet knows which item is live, and who owns it', () => {
    assert.equal(currentItem({ ...state0, cursor: 2 })!.title, 'Great Are You Lord');
    assert.equal(currentItem({ ...state0, cursor: 3 })!.owner, 'Pastor Ellis');
  });

  test('an item with no show is skipped rather than crashing', () => {
    const p = plan();
    p.items.push({ id: 'i4', kind: 'BLANK', title: 'Reset' });
    assert.equal(flattenPlan(p).length, 4);
  });
});
