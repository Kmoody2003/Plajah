// The LIVING edition of Little Fox, Big Trees against the real built Tela doc. `npx tsx --test tests/livingEdition.little-fox-big-trees.test.ts`
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import living from '../data/showcase/living/little-fox-big-trees';
import { registerEditionChecks, PageSim } from './support/livingEditionChecks';
import { defineOrbitFoxChecks } from './support/livingEditionOrbitFox';
import { buildShowcaseTelaDoc } from '../services/showcase/livingDoc';

registerEditionChecks('little-fox-big-trees', living);
// pages 1, 4 and 11 draw their headline letter by letter (no word highlight). Page 5: the three captions (Crunch. Rustle. Peek!) sit above the story signs, so the
// visible reading order differs from the story and the runtime's highlight would land on the wrong words: a runtime gap, listed so it cannot grow.
defineOrbitFoxChecks({ bookId: 'little-fox-big-trees', living, noHighlight: [1, 4, 11], orderMismatch: [5] });

const doc = buildShowcaseTelaDoc('little-fox-big-trees', living);
const page = (n: number) => living.pages.find(p => p.page === n)!;
const ons = (n: number, type: string) => page(n).behaviors.filter(b => b.on.type === type);

describe('little-fox-big-trees: what the brief asked for', () => {
  it('page 3 is an alternating-tap rhythm game: left foot, right foot, eight steps, each step plays the next note of a rising tune', async () => {
    const s = new PageSim(doc, living, 3); await s.enter();
    const played: string[] = [];
    for (let i = 0; i < 8; i++) {
      const id = i % 2 === 0 ? 'foot-L' : 'foot-R';
      const before = s.notes().length;
      assert.ok(await s.fire(id), `step ${i + 1} fires`);
      played.push(s.notes()[before]);
    }
    assert.deepEqual(played.map(n => n.split(':')[1]), ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5']);
    assert.equal(s.v('steps'), 8); assert.equal(s.v('walk'), 1);
    assert.deepEqual(s.completed, ['walked']);
    assert.ok(s.sfx().filter(x => x === 'footstep-left').length === 4 && s.sfx().filter(x => x === 'footstep-right').length === 4, 'alternating footsteps');
    for (let i = 0; i < 8; i++) await s.host.advance(1500);
    await s.settle();
    assert.ok(s.sfx().includes('harp-gliss'), 'the walk-cheer plays');
  });

  it('page 3: tapping the same side twice stumbles softly (no progress); the walk stops counting at eight steps', async () => {
    const s = new PageSim(doc, living, 3); await s.enter();
    await s.fire('foot-L'); await s.fire('foot-L'); await s.fire('foot-L');
    assert.equal(s.v('steps'), 1);
    assert.equal(s.sfx().filter(x => x === 'tick').length, 2);
    for (let i = 0; i < 12; i++) await s.fire(i % 2 === 0 ? 'foot-R' : 'foot-L');
    assert.equal(s.v('steps'), 8);
  });

  it('page 3 scrolls three depths of trunks with the walk variable (scrubbed, not timed), and the foot zones are big', () => {
    const scroll = ons(3, 'enter').flatMap(b => b.do).filter(a => a.do === 'animate' && a.anim.easing === 'var:walk');
    assert.ok(scroll.length >= 5);
    const dist = (g: string) => { const a = scroll.find(x => x.do === 'animate' && JSON.stringify(x.target) === JSON.stringify({ group: g })); return a && a.do === 'animate' ? Math.abs(a.anim.keyframes!.at(-1)!.x!) : 0; };
    assert.ok(dist('trunkA') > dist('trunkB') && dist('trunkB') > dist('trunkC') && dist('trunkC') > 0, 'near trunks move further than far trunks');
    assert.ok(page(3).groups!.footL.length > 20 && page(3).groups!.footR.length > 20);
  });

  it('page 3 works the same with reduced motion (the notes still play and the steps still count)', async () => {
    const s = new PageSim(doc, living, 3, { reduced: true }); await s.enter();
    for (let i = 0; i < 8; i++) await s.fire(i % 2 === 0 ? 'foot-L' : 'foot-R');
    assert.equal(s.v('steps'), 8);
    assert.equal(s.notes().length, 8);
  });

  it('tilt parallax between trunk layers', () => {
    for (const n of [1, 2, 4, 6, 8, 9, 11]) assert.ok(ons(n, 'tilt').some(b => b.do.some(a => a.do === 'animate' && a.anim.preset === 'parallax')), `page ${n}`);
    const depths = ons(2, 'tilt').map(b => (b.do[0] as { anim: { amount: number } }).anim.amount);
    assert.ok(new Set(depths).size >= 3, 'at least three different depths on page 2');
  });

  it('page 5: Crunch, Rustle, Peek each play their own sound and reveal their part; all three together make a chord and the goal', async () => {
    const s = new PageSim(doc, living, 5); await s.enter();
    await s.fire('crunch'); await s.fire('rustle'); await s.fire('peek');
    assert.deepEqual(s.sfx().slice(0, 3), ['crunch', 'rustle', 'squeak']);
    assert.deepEqual(s.completed, ['crunch-rustle-peek']);
    for (let i = 0; i < 8; i++) await s.host.advance(1500);
    await s.settle();
    assert.ok(s.notes().length >= 6, 'three taps plus the three-note chord');
  });

  it('page 4 is the hush page: everything ducks, crickets are the only bed, the music cue is almost silent, every sfx is quiet, and the lantern drags', async () => {
    const p = page(4);
    assert.equal(p.ambience?.bed, 'night-crickets');
    assert.ok(ons(4, 'enter').some(b => b.do.some(a => a.do === 'duck' && a.amount >= 0.5)));
    const cue = living.scores[p.music!.cue];
    assert.ok(cue.tracks.every(t => t.notes.every(n => (n.v ?? 0.7) <= 0.25)), 'hush cue velocities stay at or under 0.25');
    const s = new PageSim(doc, living, 4); await s.enter();
    await s.drag('lantern-drag', 0.7);
    assert.deepEqual(s.completed, ['lantern-carried']);
    for (const b of p.behaviors) for (const a of [...b.do, ...(b.reduced ?? [])]) if (a.do === 'sfx') assert.ok((a.params?.gain ?? 1) <= 0.3, `${b.id}: sfx ${a.sound} is not quiet enough for the hush page`);
  });

  it('page 8: dragging Tam along the gold path drives the scenery (scrubbed), reaches the doe and ends with Dot running to her mother', async () => {
    const drag = ons(8, 'drag')[0].on as { type: 'drag'; progressVar: string; snapTo: Array<{ x: number }>; axis: string };
    assert.equal(drag.progressVar, 'walk'); assert.equal(drag.axis, 'x'); assert.equal(drag.snapTo[0].x, 330);
    const scrub = ons(8, 'enter').flatMap(b => b.do).filter(a => a.do === 'animate' && a.anim.easing === 'var:walk');
    assert.ok(scrub.length >= 5);
    const s = new PageSim(doc, living, 8); await s.enter();
    await s.drag('tam-walk', 0.3); await s.drag('tam-walk', 0.65); await s.drag('tam-walk', 1);
    assert.ok(s.completed.includes('walked-half'));
    assert.equal(s.audio.of('setTempoScale').length, 1, 'the music warms once past halfway');
    assert.deepEqual(ons(8, 'event').map(b => (b.on as { name: string }).name), ['drag:snap:tam-walk']);
    await s.fire('doe-reached');   // the engine emits drag:snap:<id> when the drag ends on the snap point
    for (let i = 0; i < 8; i++) await s.host.advance(1500);
    await s.settle();
    assert.ok(s.completed.includes('reached-doe'));
    assert.ok(s.sfx().includes('harp-gliss'));
  });

  it('page 10: five diamonds light once each, the twig answers crunch, and both goals complete', async () => {
    const s = new PageSim(doc, living, 10); await s.enter();
    for (let k = 1; k <= 5; k++) await s.fire(`diamond-${k}`);
    assert.equal(await s.fire('diamond-1'), false, 'a lit diamond does not count twice');
    await s.fire('twig-found');
    assert.deepEqual(new Set(s.completed), new Set(['five-lights', 'found-twig']));
    assert.ok(s.sfx().includes('crunch'));
  });

  it('plucked folk strings, forest wind and an owl: harp, pluck, kalimba and flute; forest-wind, crickets and forest-night beds; a distant quiet owl', () => {
    const inst = new Set(Object.values(living.scores).flatMap(s => s.tracks.map(t => t.instrument)));
    for (const i of ['harp', 'pluck', 'kalimba', 'flute']) assert.ok(inst.has(i), `uses ${i}`);
    const beds = new Set(living.pages.map(p => p.ambience?.bed));
    assert.ok(beds.has('forest-wind') && beds.has('night-crickets') && beds.has('forest-night'));
    const owls = living.pages.flatMap(p => p.behaviors.flatMap(b => b.do.filter(a => a.do === 'sfx' && a.sound === 'owl-hoo')));
    assert.ok(owls.length >= 4);
    for (const o of owls) assert.ok(((o as { params?: { gain?: number } }).params?.gain ?? 1) <= 0.2, 'the owl stays distant and quiet');
  });
});
