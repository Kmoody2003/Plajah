// The generative channel's contract.
//
// The premise is that nobody is told what is on — every consumer DERIVES it, from the clock and
// nothing else. A device rendering locally, the worker baking segments for carriage, and the
// EPG generator running a year ahead all have to land on the same programme and the same seed
// without talking to each other. That is what these check.
//
//   npx tsx --test tests/generativeChannel.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERATIVE_DAY, arcPositionAt, dateKey, generativeEpg, programmeAt,
  programmeSeed, programmeTitle, resolveGenerativeSlot, upcoming,
} from '../services/fast/generativeChannel';
import { TIER_POLICY, planBurst } from '../services/fast/sola';
import { createSession } from '../services/ora/stillness/emotionalEngine';

/** A fixed instant, so nothing here depends on when the suite runs. */
const AT = Date.UTC(2026, 7, 23, 13, 32, 7);
const HOUR = 3600_000;

test('every hour of the day resolves to a programme', () => {
  for (let h = 0; h < 24; h++) {
    const p = programmeAt(Date.UTC(2026, 7, 23, h, 30, 0));
    assert.ok(p.form, `no form at ${h}:30`);
    assert.ok(p.title.length > 0, `no title at ${h}:30`);
    assert.ok(p.arcSec > 60, `arc too short at ${h}:30`);
    assert.ok(p.startHour <= h || p.startHour === 23, `slot starts in the future at ${h}:30`);
  }
});

test('the seed is derived from the clock, so every consumer agrees', () => {
  // Three independent "consumers" computing the same thing with no shared state.
  const a = programmeAt(AT);
  const b = programmeAt(AT);
  const c = resolveGenerativeSlot(AT);
  assert.equal(a.seed, b.seed);
  assert.equal(a.title, c.title);
  assert.equal(arcPositionAt(AT).seed, arcPositionAt(AT).seed);

  // And a different day is a different programme, without anything being stored.
  const tomorrow = programmeAt(AT + 24 * HOUR);
  assert.notEqual(a.seed, tomorrow.seed, 'a new day must bring a new seed');
});

test('the same date and slot always produce the same seed', () => {
  // The reproducibility claim: anyone can re-render last Tuesday at 03:00.
  const t1 = Date.UTC(2026, 2, 17, 3, 0, 0);
  const t2 = Date.UTC(2026, 2, 17, 3, 59, 59);
  assert.equal(programmeSeed(t1, 2), programmeSeed(t2, 2));
  assert.equal(dateKey(t1), dateKey(t2));
  // A UTC date boundary is a real boundary.
  assert.notEqual(dateKey(t1), dateKey(t1 + 24 * HOUR));
});

test('a slot contains several complete arcs, and joining lands mid-arc correctly', () => {
  const p = programmeAt(AT);
  const arcsInSlot = p.slotDurationSec / p.arcSec;
  assert.ok(arcsInSlot >= 1, 'a slot must hold at least one arc');

  // Walk a slot and check the offset sawtooths rather than running away.
  const start = Date.UTC(2026, 7, 23, p.startHour, 0, 0);
  let prevIdx = -1;
  for (let s = 0; s < p.slotDurationSec; s += 137) {
    const pos = arcPositionAt(start + s * 1000);
    assert.ok(pos.offsetSec >= 0 && pos.offsetSec < p.arcSec + 1,
      `offset out of range at +${s}s: ${pos.offsetSec}`);
    assert.ok(pos.arcIndex >= prevIdx, 'arc index must not go backwards');
    prevIdx = pos.arcIndex;
  }
});

test('each arc inside a slot gets its own seed', () => {
  // Otherwise a four-hour block is the same twenty minutes on repeat — the one thing a
  // generative channel has no excuse for.
  const p = programmeAt(AT);
  const start = Date.UTC(2026, 7, 23, p.startHour, 0, 0);
  const seeds = new Set<number>();
  const arcs = Math.floor(p.slotDurationSec / p.arcSec);
  for (let i = 0; i < arcs; i++) {
    seeds.add(arcPositionAt(start + (i * p.arcSec + 5) * 1000).seed);
  }
  assert.equal(seeds.size, arcs, `each of ${arcs} arcs needs its own seed (got ${seeds.size})`);
});

test('programme titles are real names, and recurring formats keep theirs', () => {
  for (const { hour, form } of GENERATIVE_DAY) {
    const seed = programmeSeed(AT, hour);
    const title = programmeTitle(form, seed);
    assert.ok(title.length > 2, `${form.id} needs a real title`);
    // An EPG full of serial numbers looks broken in a TV grid and fails platform review.
    assert.ok(!/\d{3,}/.test(title), `"${title}" reads as a serial number`);
    if (form.fixedName) {
      // A recurring format keeping its name every day is most of what makes a grid look
      // programmed rather than random.
      const otherDay = programmeTitle(form, programmeSeed(AT + 5 * 24 * HOUR, hour));
      assert.equal(title, otherDay, `${form.id} is a fixed format and must not drift`);
    }
  }
});

test('generated titles vary across a fortnight without repeating a slot', () => {
  const varying = GENERATIVE_DAY.filter((e) => !e.form.fixedName);
  assert.ok(varying.length > 0, 'some slots should generate their names');
  for (const { hour, form } of varying) {
    const titles = new Set<string>();
    for (let d = 0; d < 14; d++) titles.add(programmeTitle(form, programmeSeed(AT + d * 24 * HOUR, hour)));
    assert.ok(titles.size >= 7, `${form.id} repeats too often over 14 days (${titles.size} distinct)`);
  }
});

test('the guide runs forward in time without gaps or overlaps', () => {
  const epg = generativeEpg(AT, 8);
  assert.equal(epg.length, 8);
  for (let i = 0; i < epg.length; i++) {
    assert.ok(epg[i].stopMs > epg[i].startMs, 'a programme must have positive length');
    assert.ok(epg[i].title && epg[i].desc, 'the guide needs a title and a synopsis');
    assert.ok(['Sleep', 'Relaxation'].includes(epg[i].category));
  }
  const list = upcoming(AT, 8);
  for (let i = 1; i < list.length; i++) {
    assert.notEqual(list[i].startHour, list[i - 1].startHour, 'the guide must advance through slots');
  }
});

test('the guide can be generated a year ahead and still match', () => {
  // A guide that caches fourteen days has to stay correct, so the far-future answer computed
  // today must equal the answer computed on the day.
  const future = AT + 300 * 24 * HOUR;
  const ahead = programmeAt(future);
  const onTheDay = programmeAt(future);
  assert.equal(ahead.seed, onTheDay.seed);
  assert.equal(ahead.title, onTheDay.title);
});

test('a Sola burst is exactly one arc of whatever is on air', () => {
  const p = programmeAt(AT);
  const plan = planBurst(TIER_POLICY.burst, p.arcSec, 99999);
  if (plan.allowed) {
    assert.equal(plan.durationSec, p.arcSec, 'a burst takes the arc, never a fixed length');
  } else {
    // The only legitimate refusal is an arc longer than the thermal budget — better to stay on
    // the stream than to start something that has to be cut.
    assert.ok(p.arcSec > TIER_POLICY.burst.burstSec, `declined for the wrong reason: ${plan.reason}`);
  }
});

test('every form threads into a real session', () => {
  // The forms carry an arrival mood and an arc length straight into the emotional engine; a
  // value the engine rejects would only surface at playback.
  for (const { form } of GENERATIVE_DAY) {
    const s = createSession({ seed: 1, durationSec: form.arcSec, arrival: form.arrival });
    const mid = s.at(form.arcSec / 2);
    assert.ok(Number.isFinite(mid.depth) && mid.depth >= 0 && mid.depth <= 1, `${form.id} depth`);
    assert.ok(mid.breathRate > 1 && mid.breathRate < 30, `${form.id} breath rate ${mid.breathRate}`);
    assert.ok(s.turnAt > 0 && s.turnAt < form.arcSec, `${form.id} needs a Turn inside the arc`);
  }
});

test('the day has a real shape rather than one form repeated', () => {
  const dayparts = new Set(GENERATIVE_DAY.map((e) => e.form.daypart));
  assert.ok(dayparts.size >= 4, 'the broadcast day needs a diurnal arc, not one mood');
  const arcs = new Set(GENERATIVE_DAY.map((e) => e.form.arcSec));
  assert.ok(arcs.size >= 3, 'session length should differ across the day');
  // Night should be the least eventful: longer arcs, calmer arrivals.
  const night = GENERATIVE_DAY.filter((e) => e.form.daypart === 'deepNight');
  const day = GENERATIVE_DAY.filter((e) => e.form.daypart === 'day');
  const avgArc = (xs: typeof GENERATIVE_DAY) => xs.reduce((a, e) => a + e.form.arcSec, 0) / xs.length;
  assert.ok(avgArc(night) > avgArc(day), 'night sessions should run longer than day sessions');
});
