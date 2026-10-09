// The Golden Thread: the living edition against the real built Tela doc. `npx tsx --test tests/livingEdition.golden-thread.test.ts`
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import living from '../data/showcase/living/golden-thread';
import { byId, describeEdition, describeEditionAudio, holds, pageSetup, runner, walk, whenCond } from './livingEditionKit';
import type { Action, AnimKeyframe } from '../services/living/contracts';
import { center, pathPoints, sampler, type Pt } from '../data/showcase/living/_blueThreadKit';
import type { TelaVectorObject } from '../types';

describeEdition('golden-thread', living, { pages: 14, coverTitle: 'The Golden Thread' });
describeEditionAudio('golden-thread', living, { richer: ['gt-0', 'gt-1', 'gt-2', 'gt-3', 'gt-4', 'gt-5', 'gt-6'] });

const BOOK = 'golden-thread';
const P = (n: number) => living.pages.find(p => p.page === n)!;
const animOf = (n: number, id: string) => byId(P(n), id).do.find(a => a.do === 'animate') as Extract<Action, { do: 'animate' }>;
const dragOf = (n: number, id: string) => byId(P(n), id).on as { axis: string; bounds: { minX?: number; maxX?: number; minY?: number; maxY?: number }; progressVar: string; snapBack?: boolean; snapTo?: Array<{ x: number; y: number; r: number }> };

/** the polyline the designers draw for an object */
const poly = (o: TelaVectorObject) => pathPoints(o);
const distToPoly = (p: Pt, pts: Pt[]) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]; const dx = b.x - a.x, dy = b.y - a.y; const L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
};
const interp = (kf: AnimKeyframe[], at: number, key: 'x' | 'y') => {
  const a = [...kf].sort((p, q) => p.at - q.at); let i = 1; while (i < a.length - 1 && a[i].at < at) i++;
  const k0 = a[i - 1], k1 = a[i]; const f = (at - k0.at) / Math.max(1e-9, k1.at - k0.at);
  return (k0[key] ?? 0) + ((k1[key] ?? 0) - (k0[key] ?? 0)) * f;
};
const ids = (objs: TelaVectorObject[], labels: string[]) => objs.filter(o => labels.includes(o.objectLabel ?? '')).map(o => o.id);
const boxOf = (objs: TelaVectorObject[], idList: string[]) => {
  const bs = objs.filter(o => idList.includes(o.id));
  const x0 = Math.min(...bs.map(o => o.x)), y0 = Math.min(...bs.map(o => o.y)), x1 = Math.max(...bs.map(o => o.x + o.w)), y1 = Math.max(...bs.map(o => o.y + o.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

describe('Golden Thread: the thread is pulled, not decorated (draw-on bound to drag progress)', () => {
  it('p4: the thread draws on, scrubbed by the pull variable the drag writes', () => {
    assert.equal(dragOf(4, 'p4-pull').progressVar, 'pull');
    const draw = animOf(4, 'p4-draw'); assert.equal(draw.anim.preset, 'draw-on'); assert.equal(draw.anim.easing, 'var:pull');
    assert.deepEqual(P(4).groups!.solid.length, 3, 'glow, thread and highlight draw; the dashed twist cannot, so it fades with the same variable');
    assert.equal(animOf(4, 'p4-twist').anim.easing, 'var:pull');
  });

  it('p4: Glint stays ON the drawn thread for the whole pull (net of drag + ride, against the designer\'s own path)', () => {
    const { objects } = pageSetup(BOOK, living, 4); const p = P(4);
    const thread = objects.find(o => o.objectLabel === 'Golden thread')!; const pts = poly(thread);
    const glint = p.groups!.glint; const rest = center(boxOf(objects, glint));
    const ride = animOf(4, 'p4-ride').anim.keyframes!; const T = dragOf(4, 'p4-pull').bounds.maxX!;
    for (const k of ride.filter(k => k.at >= 0.15)) {
      const net: Pt = { x: rest.x + k.at * T + k.x!, y: rest.y + k.y! };
      assert.ok(distToPoly(net, pts) < 2.5, `progress ${k.at}: Glint is ${distToPoly(net, pts).toFixed(1)} units off the thread`);
    }
    assert.ok(ride[0].x === 0 && ride[0].y === 0, 'at rest nothing is displaced');
    const end = { x: rest.x + T + ride.at(-1)!.x!, y: rest.y + ride.at(-1)!.y! };
    assert.ok(end.x > 950, 'the pull ends near the right edge of the hills');
  });

  it('p4: eight harp notes, rising, one per eighth of the pull (and the same notes descend when you pull back)', async () => {
    const p = P(4); const bands = p.behaviors.filter(b => b.id.startsWith('p4-note-'));
    assert.equal(bands.length, 8);
    const notesPlayed = bands.map(b => (b.do.find(a => a.do === 'note') as Extract<Action, { do: 'note' }>).note as string);
    assert.deepEqual(notesPlayed, ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5']);
    for (let i = 0; i <= 200; i++) { const v = i / 200; const on = bands.filter(b => b.on.type === 'when' && holds(b.on.cond, { pull: v })); assert.ok(on.length <= 1, `pull ${v}`); if (v >= 0.03 && v <= 1) assert.equal(on.length, 1, `pull ${v} sits in a band`); }
    assert.equal(bands.filter(b => b.on.type === 'when' && holds(b.on.cond, { pull: 0 })).length, 0, 'no stray note when the page opens');
  });

  it('p4: tap, keyboard (runtime) and pull end the same way; finishing the pull earns the next music level', async () => {
    const { infos } = pageSetup(BOOK, living, 4); const r = runner(P(4), infos);
    const tap = byId(P(4), 'p4-pull-tap'); const seen: number[] = [];
    for (let i = 0; i < 3; i++) { await r.fire(tap); seen.push(r.host.vars.num('pull')); }
    assert.deepEqual(seen, [0.34, 0.68, 1]);
    const done = byId(P(4), 'p4-done'); assert.ok(done.do.some(a => a.do === 'music' && a.cue === 'gt-2'));
    assert.equal(holds(whenCond(done), { pull: 0.96 }), false); assert.equal(holds(whenCond(done), { pull: 0.98 }), true);
  });

  it('p6: Glint weaves along the bridge deck to the far end while the deck draws on; planks fade in after it', () => {
    const { objects } = pageSetup(BOOK, living, 6); const p = P(6);
    const deck = objects.find(o => o.objectLabel === 'Bridge deck')!; const pts = poly(deck);
    assert.equal(animOf(6, 'p6-deck').anim.easing, 'var:bridge'); assert.equal(animOf(6, 'p6-planks').anim.easing, 'var:bridge');
    const rest = center(boxOf(objects, p.groups!.glint)); const T = dragOf(6, 'p6-weave').bounds.maxX!;
    const ride = animOf(6, 'p6-ride').anim.keyframes!;
    for (const k of ride.filter(k => k.at >= 0.12 && k.at <= 0.98)) {
      const net: Pt = { x: rest.x + k.at * T + k.x!, y: rest.y + k.y! };
      assert.ok(distToPoly(net, pts) < 14, `progress ${k.at}: ${distToPoly(net, pts).toFixed(1)} off the deck (weaving swings it a little)`);
    }
    const last = ride.at(-1)!; assert.ok(Math.abs(rest.x + T + last.x! - pts.at(-1)!.x) < 4 && Math.abs(rest.y + last.y! - pts.at(-1)!.y) < 4, 'ends at the far bank');
    const ys = ride.map(k => k.y!); assert.ok(Math.max(...ys) - Math.min(...ys) > 150, 'it swings up and over the arch');
  });

  it('p5: the needle carries across to the coat while Mira stays put (her drag is cancelled); stitches appear in order, then the coat', () => {
    const p = P(5); const T = dragOf(5, 'p5-sew').bounds.maxX!;
    const stay = animOf(5, 'p5-stay').anim.keyframes!; assert.equal(stay.at(-1)!.x, -T, 'exactly cancels the drag');
    for (const at of [0.2, 0.5, 0.9]) assert.ok(Math.abs(interp(stay, at, 'x') + at * T) < 1e-6);
    const ride = animOf(5, 'p5-needle-ride').anim.keyframes!; assert.ok(Math.abs(ride.at(-1)!.x! - T) < 1);
    const { objects } = pageSetup(BOOK, living, 5);
    const needle = objects.find(o => o.objectLabel === 'Needle thread')!; const coat = objects.find(o => o.objectLabel === 'Gold coat')!;
    const endX = needle.x + needle.w / 2 + T; assert.ok(endX >= coat.x && endX <= coat.x + coat.w + 40, `needle ends at ${endX}, coat spans ${coat.x}..${coat.x + coat.w}`);
    const thr = [1, 2, 3, 4].map(i => { const kf = animOf(5, `p5-stitch-show-${i}`).anim.keyframes!; return kf.find(k => k.opacity === 1)!.at; });
    assert.deepEqual(thr, [...thr].sort((a, b) => a - b)); assert.ok(thr[3] < 1 && thr[0] > 0.7);
    const coatKf = animOf(5, 'p5-coat').anim.keyframes!; assert.equal(coatKf[0].opacity, 0); assert.ok(coatKf.at(-1)!.opacity === 1);
    assert.ok(P(5).goals!.length === 1);
    assert.ok(p.groups!.handle.every(id => objects.find(o => o.id === id)!.x >= 590), 'the handle is Mira\'s middle-panel figure only');
  });

  it('p7: the flick reaches the moon\'s sash; success ties a bow, brightens the moon, enriches the music', async () => {
    const { objects, infos } = pageSetup(BOOK, living, 7); const p = P(7);
    const d = dragOf(7, 'p7-flick'); assert.equal(d.snapBack, true); assert.equal(d.axis, 'y');
    const rest = center(boxOf(objects, p.groups!.glint)); const sash = objects.find(o => o.objectLabel === 'Silver sash')!;
    const ride = animOf(7, 'p7-ride').anim.keyframes!;
    const end = { x: rest.x + ride.at(-1)!.x!, y: rest.y + d.bounds.minY! };
    assert.ok(Math.hypot(end.x - (sash.x + sash.w / 2), end.y - (sash.y + sash.h / 2)) < 12, 'Glint ends on the sash');
    const r = runner(p, infos); await r.fire(byId(p, 'p7-frayed')); await r.fire(byId(p, 'p7-tied'));
    assert.equal(r.host.vars.num('tied'), 1); assert.ok(r.host.of('visibility').some(v => v[2] === 'show'), 'bow pops in');
    assert.ok(byId(p, 'p7-tied').do.some(a => a.do === 'music' && a.cue === 'gt-5'));
    assert.equal(holds(whenCond(byId(p, 'p7-tied')), { flick: 0.7 }), false);
  });

  it('p8: Mira climbs the stair of stars, one bell per step, rising; the ride ends on the last step', () => {
    const { objects } = pageSetup(BOOK, living, 8); const p = P(8);
    const bells = p.behaviors.filter(b => b.id.startsWith('p8-step-'));
    assert.equal(bells.length, 7);
    assert.deepEqual(bells.map(b => (b.do.find(a => a.do === 'note') as Extract<Action, { do: 'note' }>).note), ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6']);
    const steps = objects.filter(o => o.objectLabel === 'Star step glow'); assert.equal(steps.length, 7);
    const T = dragOf(8, 'p8-climb').bounds.maxX!; assert.ok(Math.abs(T - (steps[6].x - steps[0].x)) <= 1);
    const ride = animOf(8, 'p8-ride').anim.keyframes!; assert.ok(Math.abs(-ride.at(-1)!.y! - (steps[0].y - steps[6].y)) <= 8);
    const thr = bells.map(b => ((b.on as { cond: { value: number } }).cond.value)); assert.deepEqual(thr, [...thr].sort((a, b) => a - b));
  });

  it('p9/p10: the knot unwinds (windings turn and fade, loose end flies out) and the spool shrinks as it is given', () => {
    const p9 = P(9); const T = dragOf(9, 'p9-unwind').bounds.maxX!;
    assert.equal(animOf(9, 'p9-stay').anim.keyframes!.at(-1)!.x, -T, 'Glint stays put');
    const w = byId(p9, 'p9-windings').do as Array<Extract<Action, { do: 'animate' }>>; assert.equal(w.length, 4);
    for (const a of w) { assert.equal(a.anim.easing, 'var:unwind'); const kf = a.anim.keyframes!; assert.ok(Math.abs(kf.at(-1)!.rotate!) >= 360 && kf.at(-1)!.opacity! < 0.3); }
    const curl = animOf(9, 'p9-end-spin').anim.keyframes!; assert.ok(curl.at(-1)!.x === T && Math.abs(curl.at(-1)!.rotate!) >= 360);
    const spool = animOf(10, 'p10-shrink').anim.keyframes!; assert.ok(spool.at(-1)!.scale! < 0.4); assert.equal(animOf(10, 'p10-shrink').anim.easing, 'var:give');
  });

  it('p3: three tugs wake the thread; it starts coiled and draws itself on with a rising harp run', async () => {
    const { infos } = pageSetup(BOOK, living, 3); const p = P(3); const r = runner(p, infos);
    assert.deepEqual(byId(p, 'p3-coil').do, [{ do: 'set', props: { opacity: 0 } }]);
    const tug = byId(p, 'p3-tug');
    for (let i = 0; i < 3; i++) { assert.equal(holds(whenCond(byId(p, 'p3-awake')), r.host.vars.snapshot()), false); await r.fire(tug); }
    assert.equal(r.host.vars.num('tugs'), 3); assert.equal(holds(whenCond(byId(p, 'p3-awake')), r.host.vars.snapshot()), true);
    const awake = byId(p, 'p3-awake'); const run = awake.do.filter(a => a.do === 'note').map(a => (a as Extract<Action, { do: 'note' }>).note);
    assert.deepEqual(run, ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5']);
    assert.ok(awake.do.some(a => a.do === 'animate' && a.anim.preset === 'draw-on') && awake.do.some(a => a.do === 'music' && a.cue === 'gt-1'));
    assert.ok(awake.reduced!.some(a => a.do === 'set') && !awake.reduced!.some(a => a.do === 'animate'), 'reduced: the thread is simply there');
  });
});

describe('Golden Thread: music that grows with every task', () => {
  it('seven cues, each richer than the last: every level keeps all the tracks of the level below and adds one', () => {
    const keys = Object.keys(living.scores).sort(); assert.deepEqual(keys, ['gt-0', 'gt-1', 'gt-2', 'gt-3', 'gt-4', 'gt-5', 'gt-6']);
    let prev: string[] = [];
    for (let i = 0; i <= 6; i++) {
      const s = living.scores[`gt-${i}`]; const sig = s.tracks.map(t => `${t.instrument}:${t.notes.length}`);
      assert.equal(sig.length, 2 + i, `level ${i} has ${2 + i} voices`);
      for (const x of prev) assert.ok(sig.includes(x), `level ${i} lost ${x}`);
      prev = sig; assert.equal(s.lengthBeats, 32); assert.equal(s.tempo, 84);
    }
    assert.ok(living.scores['gt-0'].tracks.some(t => t.instrument === 'pad') && living.scores['gt-0'].tracks.some(t => t.instrument === 'harp'), 'level 0 is a drone and a harp');
  });
  it('each task\'s completion crossfades to the next level, in order; each page opens at the level the story has reached', () => {
    const tasks: Array<[number, number]> = [[3, 1], [4, 2], [5, 3], [6, 4], [7, 5], [9, 6]];
    for (const [page, level] of tasks) {
      const cues = P(page).behaviors.flatMap(b => [...b.do, ...(b.reduced ?? [])]).filter(a => a.do === 'music').map(a => (a as Extract<Action, { do: 'music' }>).cue);
      assert.ok(cues.includes(`gt-${level}`), `p${page} earns gt-${level}`);
    }
    const open = living.pages.map(p => Number(p.music!.cue.slice(3)));
    assert.deepEqual(open, [0, 0, 0, 1, 2, 3, 4, 5, 5, 6, 6, 6, 6, 6]);
    assert.ok(open.every((l, i) => i === 0 || l >= open[i - 1]), 'the music never gets thinner as the book goes on');
  });
});

describe('Golden Thread p13: tracing is validated against the art', () => {
  const { objects, infos } = pageSetup(BOOK, living, 13); const p = P(13);
  const threads = objects.filter(o => o.objectLabel === 'Golden thread').slice(0, 3);
  const houses = objects.filter(o => o.objectLabel === 'House');
  const mira = objects.find(o => o.objectLabel === 'Dress')!;
  const endOf = (o: TelaVectorObject) => poly(o).at(-1)!;
  const houseAt = (pt: Pt) => houses.findIndex(h => pt.y >= h.y - 20 && pt.y <= h.y + h.h + 20 && Math.abs(pt.x - h.x) < 30);
  const miraHouse = houses.findIndex(h => mira.y + mira.h / 2 >= h.y && mira.y + mira.h / 2 <= h.y + h.h + 40);

  it('three threads end at three DIFFERENT houses, and exactly one house is Mira\'s', () => {
    const ends = threads.map(t => houseAt(endOf(t))); assert.deepEqual([...ends].sort(), [0, 1, 2]);
    assert.ok(miraHouse >= 0);
  });
  it('the thread that the page treats as "home" really is the one that reaches Mira\'s house; the others do not', () => {
    const homeThread = threads.findIndex(t => houseAt(endOf(t)) === miraHouse) + 1;
    assert.ok(homeThread >= 1);
    for (const k of [1, 2, 3]) {
      const arrive = byId(p, `p13-arrive${k}`); const sets = arrive.do.some(a => a.do === 'var' && a.name === 'home');
      assert.equal(sets, k === homeThread, `thread ${k}`);
    }
  });
  it('each bead rides its own thread end to end (net of drag and ride), and the snap point is the end of the thread', () => {
    for (let k = 1; k <= 3; k++) {
      const d = dragOf(13, `p13-trace${k}`); const ride = animOf(13, `p13-ride${k}`).anim.keyframes!;
      const pts = poly(threads[k - 1]); const bead = center(boxOf(objects, p.groups![`bead${k}`]));
      for (const kf of ride.filter(q => q.at >= 0.15)) assert.ok(distToPoly({ x: bead.x + kf.at * d.bounds.maxX! + kf.x!, y: bead.y + kf.y! }, pts) < 2.5, `thread ${k} @${kf.at}`);
      const end = { x: bead.x + d.bounds.maxX! + ride.at(-1)!.x!, y: bead.y + ride.at(-1)!.y! };
      assert.ok(Math.hypot(end.x - endOf(threads[k - 1]).x, end.y - endOf(threads[k - 1]).y) < 3, 'the last point of the ride is the end of the thread');
      assert.equal(d.snapTo![0].x, d.bounds.maxX); assert.ok(d.snapTo![0].r >= 40 && d.snapTo![0].r <= 120); assert.equal(d.snapBack, true, 'let go half way and the bead goes back: it does not count');
      assert.ok(objects.find(o => o.id === p.groups![`bead${k}`][0])!.w >= 36, 'a bead a finger can find');
    }
  });
  it('arrival: the right thread wins (var, jingle, celebration goal); a wrong one is a gentle no and the bead and thread reset', async () => {
    const win = runner(p, infos); await win.fire(byId(p, 'p13-arrive1'));
    assert.equal(win.host.vars.num('home'), 1); assert.ok(win.audio.of('sfx').some(c => c[1] === 'success-jingle'));
    const goal = p.goals![0]; assert.equal(goal.celebrate, true); assert.equal(holds(goal.when, { home: 0 }), false); assert.equal(holds(goal.when, { home: 1 }), true);
    for (const k of [2, 3]) {
      const r = runner(p, infos); r.host.vars.set(`t${k}`, 1);
      r.it.fire(byId(p, `p13-arrive${k}`), { targets: [] }); await r.host.advance(0);
      assert.deepEqual(r.audio.of('sfx').map(c => c[1]), ['gentle-no']); assert.equal(r.host.vars.num('home'), 0);
      assert.equal(r.host.vars.num(`t${k}`), 1, 'not reset until the pause is over');
      await r.host.advance(1200);
      assert.equal(r.host.vars.num(`t${k}`), 0); assert.ok(r.host.of('setProps').some(c => JSON.stringify(c[2]) === JSON.stringify({ x: 0, y: 0 })));
      assert.match(r.host.of('announce').map(a => a[1]).join(), /different house/);
    }
  });
  it('arrival is only ever triggered by the drag\'s snap event or the tap alternative: the events line up with the behaviour ids', () => {
    for (let k = 1; k <= 3; k++) {
      const a = byId(p, `p13-arrive${k}`); assert.deepEqual(a.on, { type: 'event', name: `drag:snap:p13-trace${k}` });
      const tap = byId(p, `p13-tap${k}`); assert.ok(tap.do.some(x => x.do === 'emit' && x.name === `drag:snap:p13-trace${k}`));
      assert.equal(tap.hint!.includes(`thread ${k}`), true);
    }
  });
});

describe('Golden Thread: every drag has a tap alternative and a reduced twin; announcements use a real object', () => {
  it('drags: tap alternative on the same target', () => {
    for (const pg of living.pages) for (const d of pg.behaviors.filter(b => b.on.type === 'drag')) {
      const t = JSON.stringify(d.target);
      assert.ok(pg.behaviors.some(b => b.on.type === 'tap' && JSON.stringify(b.target) === t), `${pg.page}/${d.id}`);
      assert.ok((d.on as { progressVar?: string }).progressVar);
    }
  });
  it('drags that move something else than their own target cancel their own movement exactly (handle objects)', () => {
    for (const [n, id, stay] of [[5, 'p5-sew', 'p5-stay'], [9, 'p9-unwind', 'p9-stay']] as const) {
      const T = dragOf(n, id).bounds.maxX!; const kf = animOf(n, stay).anim.keyframes!;
      assert.equal(kf[0].x, 0); assert.equal(kf.at(-1)!.x, -T); assert.equal(animOf(n, stay).anim.easing, `var:${dragOf(n, id).progressVar}`);
    }
  });
  it('set text (announcements) always lands on the page ground, which every page has', () => {
    for (const pg of living.pages) for (const b of pg.behaviors) walk([...b.do, ...(b.reduced ?? [])], a => {
      if (a.do === 'set' && typeof a.props.text === 'string') assert.deepEqual(a.target, { label: 'Paper ground' });
    });
  });
  it('the p9 gold tint is temporary: set, wait, cleared', () => {
    const free = byId(P(9), 'p9-free').do; const sets = free.filter(a => a.do === 'set' && 'page' in (a.target ?? {})) as Array<Extract<Action, { do: 'set' }>>;
    assert.equal(sets.length, 2); assert.ok((sets[0].props.opacity as number) <= 0.25); assert.equal(sets[1].props.opacity, 0);
    assert.ok(free.some(a => a.do === 'wait'));
  });
});
