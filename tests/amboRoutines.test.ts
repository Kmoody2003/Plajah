// Routines — recurrence, offsets, grace, DST, registry, and the Sunday chain.
// Run: npx tsx --test tests/amboRoutines.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  zonedTimeToEpoch, wallClock, occurrencesBetween, nextRunAt, dueRoutines, createDefaultRegistry,
  RoutineEngine, sundayServiceTemplate, SUNDAY_IDS, batchSteps, actionToStep, dispatchActions,
  type Routine, type ScheduleContext, type RoutineHost,
} from '../services/ambo/routines';

const NY = 'America/New_York';
const Z = (iso: string) => Date.parse(iso);
const ctx: ScheduleContext = {
  locations: [{ id: 'loc', name: 'Main', timezone: NY }],
  serviceTimes: [{ id: 'svc', name: 'Sun', weekday: 0, time: '10:00', durationMin: 75, locationId: 'loc' }],
};
const weekly = (over: any = {}): Routine => ({
  id: 'w', name: 'w', enabled: true, steps: [],
  trigger: { kind: 'weekly', days: [0], time: '10:00', timezone: NY, ...over },
});

describe('timezone maths', () => {
  test('wall clock round trip', () => {
    assert.equal(zonedTimeToEpoch(2026, 10, 4, 10, 0, NY), Z('2026-10-04T14:00:00Z'));
    const w = wallClock(Z('2026-10-04T14:00:00Z'), NY);
    assert.deepEqual([w.y, w.m, w.d, w.h, w.mi, w.dow], [2026, 10, 4, 10, 0, 0]);
  });
  test('spring-forward gap resolves to just after the gap', () => {
    assert.equal(zonedTimeToEpoch(2026, 3, 8, 2, 30, NY), Z('2026-03-08T07:30:00Z')); // 03:30 EDT
  });
  test('fall-back ambiguity picks the earlier instant', () => {
    assert.equal(zonedTimeToEpoch(2026, 11, 1, 1, 30, NY), Z('2026-11-01T05:30:00Z')); // EDT
  });
});

describe('weekly recurrence', () => {
  test('stays at 10:00 local across the DST change', () => {
    const occ = occurrencesBetween(weekly(), ctx, Z('2026-02-28T00:00:00Z'), Z('2026-03-16T00:00:00Z'));
    assert.deepEqual(occ, [Z('2026-03-01T15:00:00Z'), Z('2026-03-08T14:00:00Z'), Z('2026-03-15T14:00:00Z')]);
  });
  test('skip dates are honoured', () => {
    const occ = occurrencesBetween(weekly({ skipDates: ['2026-03-08'] }), ctx, Z('2026-03-01T00:00:00Z'), Z('2026-03-16T00:00:00Z'));
    assert.deepEqual(occ, [Z('2026-03-01T15:00:00Z'), Z('2026-03-15T14:00:00Z')]);
  });
  test('multiple days, start/end window', () => {
    const r = weekly({ days: [3, 0], time: '19:00', startDate: '2026-10-05', endDate: '2026-10-11' });
    const occ = occurrencesBetween(r, ctx, Z('2026-10-01T00:00:00Z'), Z('2026-10-20T00:00:00Z'));
    assert.deepEqual(occ, [Z('2026-10-07T23:00:00Z'), Z('2026-10-11T23:00:00Z')]);
  });
  test('uses the location timezone when none is set', () => {
    const r: Routine = { ...weekly(), locationId: 'loc', trigger: { kind: 'weekly', days: [0], time: '10:00' } };
    assert.equal(nextRunAt(r, ctx, Z('2026-10-01T00:00:00Z')), Z('2026-10-04T14:00:00Z'));
  });
  test('one-time and manual', () => {
    const o: Routine = { id: 'o', name: 'o', enabled: true, steps: [], trigger: { kind: 'once', at: 5000 } };
    assert.equal(nextRunAt(o, ctx, 1000), 5000);
    assert.equal(nextRunAt(o, ctx, 6000), null);
    assert.equal(nextRunAt({ ...o, trigger: { kind: 'manual' } }, ctx, 0), null);
  });
});

describe('service offsets', () => {
  const pre: Routine = { id: 'p', name: 'p', enabled: true, steps: [], trigger: { kind: 'service', serviceTimeId: 'svc', offsetMin: -15 } };
  test('T-15 fires at 09:45 local', () => {
    assert.equal(nextRunAt(pre, ctx, Z('2026-10-01T00:00:00Z')), Z('2026-10-04T13:45:00Z'));
  });
  test('offset across the DST boundary stays local', () => {
    assert.equal(nextRunAt(pre, ctx, Z('2026-03-02T00:00:00Z')), Z('2026-03-08T13:45:00Z'));
  });
  test('service skip date and disabled service', () => {
    const c2 = { ...ctx, serviceTimes: [{ ...ctx.serviceTimes[0], skipDates: ['2026-10-04'] }] };
    assert.equal(nextRunAt(pre, c2, Z('2026-10-01T00:00:00Z')), Z('2026-10-11T13:45:00Z'));
    const c3 = { ...ctx, serviceTimes: [{ ...ctx.serviceTimes[0], enabled: false }] };
    assert.equal(nextRunAt(pre, c3, Z('2026-10-01T00:00:00Z')), null);
  });
  test('positive offset (after service)', () => {
    const post = { ...pre, trigger: { kind: 'service', serviceTimeId: 'svc', offsetMin: 90 } as const };
    assert.equal(nextRunAt(post, ctx, Z('2026-10-01T00:00:00Z')), Z('2026-10-04T15:30:00Z'));
  });
});

describe('dueRoutines — grace window', () => {
  const r = weekly();
  const at = Z('2026-10-04T14:00:00Z');
  test('not due before the time', () => assert.equal(dueRoutines([r], ctx, at - 1000, {}).length, 0));
  test('due on time', () => {
    const d = dueRoutines([r], ctx, at + 1000, {});
    assert.equal(d.length, 1); assert.equal(d[0].run, true); assert.equal(d[0].scheduledAt, at);
  });
  test('late but inside grace still runs', () => {
    assert.equal(dueRoutines([r], ctx, at + 4 * 60000, {})[0].run, true);
  });
  test('outside grace is reported as skipped', () => {
    assert.equal(dueRoutines([r], ctx, at + 20 * 60000, {})[0].run, false);
  });
  test('per-routine grace overrides', () => {
    assert.equal(dueRoutines([{ ...r, graceMin: 30 }], ctx, at + 20 * 60000, {})[0].run, true);
  });
  test('already handled occurrence is not due again', () => {
    assert.equal(dueRoutines([r], ctx, at + 1000, { w: at }).length, 0);
  });
  test('days closed collapses to the latest occurrence', () => {
    const d = dueRoutines([r], ctx, Z('2026-10-20T20:00:00Z'), { w: Z('2026-09-20T14:00:00Z') }, { lookbackMs: 30 * 86400000 });
    assert.equal(d.length, 1); assert.equal(d[0].collapsed, 3); assert.equal(d[0].run, false);
  });
  test('disabled / event / manual never due', () => {
    assert.equal(dueRoutines([{ ...r, enabled: false }, { ...r, id: 'e', trigger: { kind: 'event', event: 'countdown-ended' } }], ctx, at + 1000, {}).length, 0);
  });
});

function fakeHost(calls: string[]): RoutineHost {
  const rec = (n: string) => (a?: any) => { calls.push(`${n}:${JSON.stringify(a ?? {})}`); };
  return {
    takeSlide: rec('takeSlide'), takeShow: rec('takeShow'), cueFirstSong: rec('cueFirstSong'),
    playPlaylist: rec('playPlaylist'), playAudio: rec('playAudio'), stopAudio: rec('stopAudio'),
    startVisualizer: rec('startVisualizer'), openOutputs: rec('openOutputs'), clearLayers: rec('clearLayers'),
    startCountdown: rec('startCountdown'), showProp: rec('showProp'), switcherCut: rec('switcherCut'), cue: rec('cue'),
  };
}
const memStore = () => {
  const m: Record<string, string> = {};
  return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; }, m };
};

describe('registry', () => {
  test('every showModel Action kind maps to a registered function', () => {
    const R = createDefaultRegistry();
    const actions: any[] = [
      { kind: 'AUDIO_PLAY', src: 'a' }, { kind: 'AUDIO_STOP' }, { kind: 'TIMER_START', timerId: 't', seconds: 5 }, { kind: 'TIMER_RESET', timerId: 't' },
      { kind: 'CLEAR_LAYER', slot: 'slide' }, { kind: 'PROP_SHOW', propId: 'p' }, { kind: 'PROP_HIDE', propId: 'p' }, { kind: 'GOTO', slideId: 's' },
      { kind: 'MACRO', macroId: 'm' }, { kind: 'SWITCHER_CUT', sourceId: 'x' }, { kind: 'CUE', refId: 'r' },
    ];
    for (const a of actions) assert.ok(R.get(actionToStep(a).fn), a.kind);
  });
  test('validation and coercion', () => {
    const R = createDefaultRegistry();
    assert.match(R.validate('audio.play', {})!, /required/);
    assert.match(R.validate('wait', { seconds: 'abc' })!, /number/);
    assert.equal(R.validate('wait', { seconds: '4' }), null);
    assert.equal(R.normalize('wait', { seconds: '4' }).seconds, 4);
    assert.match(R.validate('nope', {})!, /Unknown/);
  });
  test('missing host method fails loudly, others still run', async () => {
    const calls: string[] = [];
    const e = new RoutineEngine({ storage: null, sleep: async () => {}, host: { clearLayers: async () => { calls.push('clear'); } } });
    e.upsertRoutine({ id: 'r', name: 'r', enabled: true, trigger: { kind: 'manual' }, steps: [
      { id: '1', fn: 'audio.stop', args: {} }, { id: '2', fn: 'layer.clear', args: { slot: 'all' } },
    ] });
    assert.equal(await e.runRoutine('r'), false);
    assert.deepEqual(calls, ['clear']);
    const log = e.getData().log[0];
    assert.match(log.steps[0].error!, /Not available/);
    assert.equal(log.steps[1].ok, true);
  });
  test('parallel batching and stopOnError', async () => {
    const steps = [{ id: '1', fn: 'wait', args: {} }, { id: '2', fn: 'wait', args: {}, parallel: true }, { id: '3', fn: 'wait', args: {} }];
    assert.deepEqual(batchSteps(steps).map(b => b.length), [2, 1]);
    const e = new RoutineEngine({ storage: null, sleep: async () => {}, host: {} });
    e.upsertRoutine({ id: 'r', name: 'r', enabled: true, stopOnError: true, trigger: { kind: 'manual' },
      steps: [{ id: '1', fn: 'audio.stop', args: {} }, { id: '2', fn: 'wait', args: { seconds: 1 } }] });
    await e.runRoutine('r');
    assert.equal(e.getData().log[0].steps.length, 1);
  });
  test('MACRO / CUE / PROP_SHOW / SWITCHER_CUT dispatch through the registry', async () => {
    const calls: string[] = [];
    const e = new RoutineEngine({ storage: null, sleep: async () => {}, host: fakeHost(calls) });
    e.upsertRoutine({ id: 'm1', name: 'm', enabled: true, trigger: { kind: 'manual' }, steps: [{ id: '1', fn: 'layer.clear', args: { slot: 'prop' } }] });
    const ctx2: any = { host: fakeHost(calls), engine: e, now: () => 0, sleep: async () => {}, depth: 0, cancelled: () => false };
    const logs = await dispatchActions([
      { kind: 'MACRO', macroId: 'm1' }, { kind: 'CUE', refId: 'sl_9' }, { kind: 'PROP_SHOW', propId: 'bug' }, { kind: 'SWITCHER_CUT', sourceId: 'cam2' },
    ], ctx2, e.registry);
    assert.ok(logs.every(l => l.ok), JSON.stringify(logs));
    assert.deepEqual(calls, ['clearLayers:{"slot":"prop"}', 'cue:{"refId":"sl_9"}', 'showProp:{"propId":"bug"}', 'switcherCut:{"sourceId":"cam2"}']);
  });
  test('nested routine depth is bounded (self-recursion)', async () => {
    const e = new RoutineEngine({ storage: null, sleep: async () => {}, host: {} });
    e.upsertRoutine({ id: 'loop', name: 'loop', enabled: true, trigger: { kind: 'manual' }, steps: [{ id: '1', fn: 'routine.run', args: { routineId: 'loop' } }] });
    assert.equal(await e.runRoutine('loop'), false);
  });
});

describe('Sunday Service chain', () => {
  test('T-15 starts countdown+playlist; countdown end fires the opening', async () => {
    const calls: string[] = [];
    let now = Z('2026-10-04T13:44:00Z'); // 09:44 EDT
    const store = memStore();
    const e = new RoutineEngine({ storage: store, clock: () => now, sleep: async () => {}, host: fakeHost(calls) });
    e.install(sundayServiceTemplate({
      timezone: NY, time: '10:00', playlistId: 'pl1', openingAudio: 'open.mp3', visualizerId: 'viz1', firstSongShowId: 'song1', layoutId: 'lay1',
    }));

    await e.tick(now);
    assert.equal(calls.length, 0, 'nothing before T-15');

    now = Z('2026-10-04T13:45:05Z');
    await e.tick(now);
    assert.ok(calls.some(c => c.startsWith('openOutputs:') && c.includes('lay1')));
    assert.ok(calls.some(c => c.startsWith('startCountdown:') && c.includes('"seconds":895')), calls.join('\n'));
    assert.ok(calls.some(c => c.startsWith('playPlaylist:') && c.includes('pl1')));
    assert.ok(!calls.some(c => c.startsWith('playAudio')), 'opening has not fired yet');
    assert.equal(e.getData().countdowns.length, 1);

    const n = calls.length;
    await e.tick(now + 1000);
    assert.equal(calls.length, n, 'same occurrence must not re-fire');

    now = Z('2026-10-04T14:00:01Z');
    await e.tick(now);
    const open = calls.slice(n);
    assert.deepEqual(open.map(c => c.split(':')[0]), ['stopAudio', 'playAudio', 'startVisualizer', 'cueFirstSong', 'takeSlide']);
    assert.ok(open[1].includes('open.mp3'));
    assert.equal(e.getData().countdowns.length, 0);
    assert.ok(e.getData().log.every(l => l.ok), JSON.stringify(e.getData().log));
    assert.ok(store.m['ambo_routines_v1']);
    const e2 = new RoutineEngine({ storage: store, clock: () => now, host: {} });
    assert.equal(e2.getData().routines.length, 2);
  });
  test('app opened 20 minutes late: pre-service is recorded as missed, not run', async () => {
    const calls: string[] = [];
    const now = Z('2026-10-04T14:05:00Z');
    const e = new RoutineEngine({ storage: null, clock: () => now, sleep: async () => {}, host: fakeHost(calls) });
    e.install(sundayServiceTemplate({ timezone: NY, playlistId: 'pl1' }));
    await e.tick(now);
    assert.equal(calls.length, 0);
    assert.equal(e.getData().log[0].reason, 'missed');
  });
  test('stale countdown from a closed app does not fire the opening', async () => {
    const calls: string[] = [];
    const e = new RoutineEngine({ storage: null, clock: () => 10_000_000, sleep: async () => {}, host: fakeHost(calls) });
    e.install(sundayServiceTemplate({ timezone: NY, openingAudio: 'o', visualizerId: 'v', firstSongShowId: 's' }));
    e.startCountdown(SUNDAY_IDS.timer, 10, 'x');
    await e.tick(10_000_000 + 10_000 + 600_000);
    assert.equal(calls.length, 0);
  });
});
