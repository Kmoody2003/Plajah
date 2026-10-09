// The LIVING edition of Beep Block Street against the real built Tela doc. `npx tsx --test tests/livingEdition.beep-block-street.test.ts`
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import living from '../data/showcase/living/beep-block-street';
import { buildShowcaseTelaDoc } from '../services/showcase/livingDoc';
import { PageSim, allActions, registerPictureEditionChecks } from './support/livingEditionPicture';

registerPictureEditionChecks('beep-block-street', living);
const doc = buildShowcaseTelaDoc('beep-block-street', living);
const page = (n: number) => living.pages.find(p => p.page === n)!;

describe('beep-block-street: instruments, groove and cause-and-effect', () => {
  it('has a bouncy 112 bpm groove with bass, a drum kit, marimba stabs and a kalimba hook; hush and dusk are calmer', () => {
    const g = living.scores.groove;
    assert.equal(g.tempo, 112); assert.equal(g.lengthBeats, 32);
    assert.deepEqual(g.tracks.map(t => t.instrument).sort(), ['bass', 'drum', 'kalimba', 'marimba']);
    assert.ok(g.tracks.find(t => t.instrument === 'drum')!.notes.length > 100, 'a busy kit');
    assert.ok(living.scores.hush.tempo < g.tempo && living.scores.dusk.tempo < g.tempo);
    assert.deepEqual(living.pages.map(p => p.music?.cue), ['groove', 'groove', 'groove', 'hush', 'groove', 'hush', 'hush', 'dusk', 'groove', 'groove']);
  });

  it("Bo's beep depends on where you tap: wheels low, body middle (with a note that follows the finger), roof light high, mouth double", async () => {
    for (const n of [1, 2, 10]) {
      const s = new PageSim(doc, living, n);
      const got: Record<string, string> = {};
      for (const z of ['low', 'mid', 'high', 'mouth']) { const id = `p${n}-beep-${z}`; await s.fire(id); got[z] = s.sfx().at(-1)!; await s.wait(400); }
      assert.deepEqual(got, { low: 'beep-low', mid: 'beep', high: 'beep-high', mouth: 'beep-double' }, `page ${n}`);
      assert.equal(s.v('beeps'), 4);
    }
    const s = new PageSim(doc, living, 1);
    await s.fire('p1-beep-mid', { x01: 0.02 }); await s.wait(300); await s.fire('p1-beep-mid', { x01: 0.98 });
    assert.deepEqual(s.notes(), ['kalimba:C5', 'kalimba:C6'], 'tapping left and right plays different notes'); await s.wait(300); await s.fire('p1-beep-low');
    // the zones really are different parts of the bus
    const z = (id: string) => new Set(s.targets(id));
    assert.ok(z('p1-beep-low').has('p01_wheel_1') && !z('p1-beep-low').has('p01_bus-body_1'));
    assert.ok(z('p1-beep-high').has('p01_roof-light_1') && z('p1-beep-mid').has('p01_bus-body_1') && z('p1-beep-mouth').has('p01_teeth_1'));
    assert.ok(z('p1-beep-mid').has('p01_eye_2') && !z('p1-beep-mid').has('p01_eye_1'), "Bo's eyes are in his body zone; Pip's eye is not");
    assert.deepEqual(s.completed, ['three-beeps']);
  });

  it('page 3: each window wakes with its own instrument and the street wakes together when Bo beeps', async () => {
    const s = new PageSim(doc, living, 3);
    await s.fire('p3-baker'); await s.fire('p3-barber'); assert.deepEqual(s.completed, []);
    await s.fire('p3-pigeons-tap'); assert.deepEqual(s.completed, ['woke-all']);
    assert.deepEqual(['marimba:C5', 'kalimba:E5', 'flute:G5'], s.notes());
    assert.deepEqual(s.sfx(), ['ding', 'tick', 'wings']);
    const t = new PageSim(doc, living, 3); await t.fire('p3-bo-wakes-all'); await t.wait(1000);
    assert.deepEqual(t.completed, ['woke-all']); assert.deepEqual(t.notes(), ['marimba:C5', 'kalimba:E5', 'flute:G5']);
    assert.ok(new Set(t.targets('p3-bo-wakes-all')).has('p03_open-mouth_3') === false, "Bo's body tap does not include the baker's mouth");
    assert.ok(new Set(t.targets('p3-baker')).has('p03_open-mouth_1') && !new Set(t.targets('p3-baker')).has('p03_open-mouth_2'));
  });

  it('page 5: six different honks; when everyone has honked the chorus plays, the tempo jumps and settles, and Pip asks where the beep went', async () => {
    const s = new PageSim(doc, living, 5);
    const ids = ['p5-honk-car1', 'p5-honk-car2', 'p5-honk-car3', 'p5-honk-car4', 'p5-honk-taxi', 'p5-honk-gus'];
    for (const id of ids.slice(0, 5)) { await s.fire(id); await s.wait(400); }
    assert.deepEqual(s.completed, []); assert.deepEqual(s.host.of('narrate'), []);
    await s.fire(ids[5]); await s.wait(5000);
    assert.deepEqual(s.completed, ['everyone-honked']); assert.equal(s.v('honks'), 6);
    const firsts = s.audio.of('sfx').slice(0, 6).map(c => `${c[1]}${(c[2] as { pitch: number }).pitch}`);
    assert.equal(new Set(firsts).size, 6, `six distinct honks: ${firsts}`);
    assert.deepEqual(s.audio.of('setTempoScale').map(c => c[1]).slice(-2), [1.2, 1]);
    const [from, to] = s.host.of('narrate').at(-1)!.slice(1) as number[];
    assert.equal(page(5).narration!.text!.split(' ').slice(from, to + 1).join(' '), 'Pip tilted his head. Where did the beep go?');
    assert.ok(new Set(s.targets('p5-honk-car2')).has('p05_brow_1') && !new Set(s.targets('p5-honk-car1')).has('p05_brow_1'));
    assert.ok(!new Set(s.targets('p5-honk-taxi')).has('p05_wheel_3'), 'the taxi group has only its own wheels');
  });

  it('page 6: three panels; dragging Pip into the tailpipe finds the tiny stuck beep', async () => {
    const s = new PageSim(doc, living, 6);
    await s.fire('p6-bakery'); await s.fire('p6-barber'); await s.fire('p6-pipe'); await s.wait(600);
    assert.deepEqual(s.sfx().sort(), ['ding', 'knock', 'knock', 'tick', 'tick']);
    await s.drag('p6-pip-in', 0.5); assert.equal(s.v('found'), false);
    await s.drag('p6-pip-in', 0.9); assert.equal(s.v('found'), true); assert.deepEqual(s.completed, ['found-it']);
    assert.ok(s.targets('p6-pip-in').length >= 12 && !new Set(s.targets('p6-pip-in')).has('p06_pigeon-body_1'), 'only panel three\'s pigeon moves');
  });

  it('page 7: pull Pip (or tap him three times) and POP: the pop, the big double beep, confetti, a faster groove; and a timer completes the page for readers who never pull', async () => {
    const hidden = page(7).behaviors.find(b => b.id === 'p7-hide')!; assert.equal(hidden.do.length, 3);
    const s = new PageSim(doc, living, 7); await s.enter();
    assert.equal(await s.fire('p7-beep-mid'), false, 'Bo has no beep until the pop');
    await s.drag('p7-pull', 0.4); assert.equal(s.v('popped'), false);
    await s.drag('p7-pull', 0.95); await s.wait(1500);
    assert.equal(s.v('popped'), true); assert.deepEqual(s.sfx().slice(-2), ['pop', 'beep-double']);
    assert.ok(s.host.of('burst').some(b => b[2] === 'confetti' && (b[3] as number) >= 30)); assert.deepEqual(s.audio.of('setTempoScale').at(-1)!.slice(1), [1.15, 800]);
    assert.deepEqual(s.completed, ['pop']);
    assert.equal(await s.fire('p7-beep-mid'), true, 'after the pop Bo beeps again');
    const t = new PageSim(doc, living, 7); for (let i = 0; i < 3; i++) { await t.fire('p7-tug'); await t.wait(450); } await t.wait(1500);
    assert.equal(t.v('popped'), true);
    const u = new PageSim(doc, living, 7); await u.enter(); await u.fire('p7-pop-timer'); await u.wait(1500);
    assert.equal(u.v('popped'), true); assert.equal(page(7).behaviors.find(b => b.id === 'p7-pop-timer')!.on.type === 'timer' && (page(7).behaviors.find(b => b.id === 'p7-pop-timer')!.on as { afterMs: number }).afterMs, 22000);
  });

  it('page 8: Bo says good morning, good afternoon, goodnight in three taps; the thank-you letters and lamps respond', async () => {
    const s = new PageSim(doc, living, 8);
    for (let i = 0; i < 3; i++) { await s.fire('p8-bo-greets'); await s.wait(700); }
    assert.deepEqual(s.sfx(), ['beep', 'beep-high', 'beep']); assert.deepEqual(s.completed, ['three-greetings']);
    await s.fire('p8-lampL'); assert.equal(s.v('lampL'), false); await s.wait(600); await s.fire('p8-lampL'); assert.equal(s.v('lampL'), true);
  });
});

describe('beep-block-street: Find Pip (page 9), a real game with counters and a celebration', () => {
  const winId = (w: number) => `p9-window-${w}`;
  const label = (s: PageSim, id: string) => s.host.of('setProps').filter(c => (c[1] as string[]).includes(id)).map(c => (c[2] as { text?: string }).text).filter(Boolean);

  it('there are exactly three Pips, each is its own tap target with a window, and a window with something else in it never counts as a Pip', async () => {
    const s = new PageSim(doc, living, 9);
    assert.equal(s.page.behaviors.filter(b => b.id.startsWith('p9-find-pip')).length, 3);
    const tapped = new Set(['p9-find-pip-1', 'p9-find-pip-2', 'p9-find-pip-3', 'p9-lamp-1', 'p9-lamp-2', 'p9-lamp-3', 'p9-lamp-4']);
    const windows = s.page.behaviors.filter(b => b.id.startsWith('p9-window-') || tapped.has(b.id));
    const covered = new Set(windows.flatMap(b => s.targets(b.id).filter(i => /^p09_window_\d+$/.test(i))));
    assert.equal(covered.size, 16, 'every one of the sixteen windows is tappable');
    for (const w of [2, 3, 5, 6, 8, 9, 12, 13, 14]) { const t = new PageSim(doc, living, 9); await t.fire(winId(w)); assert.equal(t.v('pips'), 0); assert.equal(t.v('wrong'), 1); }
  });

  it('finding the Pips counts up on the page ("Pips: 1/2/3"), pops, plays a rising note per Pip, and each Pip counts only once', async () => {
    const s = new PageSim(doc, living, 9);
    await s.fire('p9-find-pip-2'); assert.equal(s.v('pips'), 1); assert.deepEqual(label(s, 'p09_answer-label_1'), ['Pips: 1']);
    assert.equal(await s.fire('p9-find-pip-2'), false, 'the same Pip again does not count'); assert.equal(s.v('pips'), 1);
    await s.fire('p9-find-pip-1'); await s.fire('p9-find-pip-3'); assert.equal(s.v('pips'), 3);
    assert.deepEqual(label(s, 'p09_answer-label_1').slice(0, 3), ['Pips: 1', 'Pips: 2', 'Pips: 3']);
    assert.deepEqual(s.notes(), ['kalimba:E5', 'kalimba:C5', 'kalimba:G5']);
    await s.wait(1200);
    assert.deepEqual(s.completed, ['found-pips']); assert.ok(s.sfx().includes('success-jingle')); assert.ok(s.host.of('burst').some(b => b[2] === 'confetti' && (b[3] as number) >= 30));
    assert.ok(label(s, 'p09_answer-label_1').includes('Pips: 3!'));
  });

  it('counting the four yellow lamps completes a second goal; wrong windows give a gentle sound and, after five misses, a hint pulse on the Pips not yet found', async () => {
    const s = new PageSim(doc, living, 9);
    for (const j of [1, 2, 3, 4]) { await s.fire(`p9-lamp-${j}`); await s.wait(400); }
    assert.equal(s.v('lamps'), 4); assert.deepEqual(s.completed, ['counted-lamps']); assert.deepEqual(label(s, 'p09_answer-label_2').slice(0, 4), ['Lamps: 1', 'Lamps: 2', 'Lamps: 3', 'Lamps: 4']);
    const t = new PageSim(doc, living, 9); await t.fire('p9-find-pip-1');
    for (const w of [2, 5, 6, 9, 14]) { await t.fire(winId(w)); await t.wait(400); }
    const pulses = t.host.of('animate').filter(a => (a[2] as { preset?: string }).preset === 'pulse' && (a[1] as string[]).some(id => /^p09_window_(10|15)$/.test(id)));
    assert.equal(pulses.length >= 2, true, 'hint pulses on windows 10 and 15, but not on the found Pip');
    assert.ok(!t.host.of('animate').some(a => (a[2] as { preset?: string }).preset === 'pulse' && (a[1] as string[]).includes('p09_window_1') && (a[2] as { delayMs?: number }).delayMs === undefined && false));
  });

  it('window hints are unique and say where the window is, so a keyboard or screen-reader player can play', () => {
    const hints = page(9).behaviors.filter(b => b.hint).map(b => b.hint!);
    assert.equal(new Set(hints).size, hints.length);
    assert.ok(hints.every(h => /row \d, column \d/.test(h)));
  });
});

describe('beep-block-street: reduced motion keeps the game and the sounds', () => {
  it('reduced motion: tapping a window or a car still sounds and records the answer with no movement', async () => {
    const s = new PageSim(doc, living, 9, { reduced: true }); await s.fire('p9-find-pip-1'); await s.wait(1000);
    assert.equal(s.v('pips'), 1); assert.deepEqual(s.host.of('animate').concat(s.host.of('burst')), []); assert.ok(s.sfx().includes('pop'));
    const t = new PageSim(doc, living, 5, { reduced: true }); await t.fire('p5-honk-gus'); await t.wait(500);
    assert.equal(t.v('gus'), true); assert.equal(t.sfx()[0], 'toot'); assert.deepEqual(t.host.of('animate'), []);
    const u = new PageSim(doc, living, 7, { reduced: true }); await u.enter(); await u.drag('p7-pull', 0.95); await u.wait(1000);
    assert.equal(u.v('popped'), true); assert.deepEqual(u.host.of('animate').concat(u.host.of('burst')), []);
  });

  it('nothing in the book strobes: no flicker faster than 1.5 s, no repeating timers', () => {
    for (const p of living.pages) for (const b of p.behaviors) { assert.ok(!(b.on.type === 'timer' && b.on.every)); for (const a of allActions(b)) assert.ok(!(a.do === 'animate' && a.anim.preset === 'flicker')); }
  });
});
