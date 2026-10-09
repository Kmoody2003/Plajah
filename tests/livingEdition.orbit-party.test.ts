// The LIVING edition of Orbit Party! against the real built Tela doc. `npx tsx --test tests/livingEdition.orbit-party.test.ts`
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import living from '../data/showcase/living/orbit-party';
import { registerEditionChecks, allActions } from './support/livingEditionChecks';
import { defineOrbitFoxChecks } from './support/livingEditionOrbitFox';

registerEditionChecks('orbit-party', living);
// pages 1, 3, 4, 5, 10, 11 draw their headline word letter by letter (one TEXT object per letter), so their visible text does not split into the spread's words
defineOrbitFoxChecks({ bookId: 'orbit-party', living, noHighlight: [1, 3, 4, 5, 10, 11] });

describe('orbit-party: what the brief asked for', () => {
  const page = (n: number) => living.pages.find(p => p.page === n)!;
  const ons = (n: number, type: string) => page(n).behaviors.filter(b => b.on.type === type);

  it('every planet is a pentatonic note: planet taps play only C-major-pentatonic pitches', () => {
    const PENTA = new Set(['C', 'D', 'E', 'G', 'A']);
    let count = 0;
    for (const p of living.pages) for (const b of p.behaviors) if (b.id.endsWith('-note') && b.on.type === 'tap') {
      for (const a of b.do) if (a.do === 'note') { count++; assert.ok(PENTA.has(String(a.note).replace(/\d+$/, '')), `${b.id}: ${a.note}`); }
    }
    assert.ok(count >= 20, `only ${count} planet notes`);
  });

  it("Zib's kazoo is a press-and-hold voice (a `note` with no duration inside a press) and the hint says the finger bends it", () => {
    const hold = ons(2, 'press')[0];
    assert.ok(hold);
    const n = hold.do.find(a => a.do === 'note');
    assert.ok(n && n.do === 'note' && n.instrument === 'kazoo' && n.durationMs === undefined && !String(n.note).startsWith('scale:'));
    assert.match(hold.hint!, /bend/i);
  });

  it('Nova follows the pointer and leaves a sparkle trail', () => {
    const acts = ons(3, 'enter').flatMap(b => b.do);
    assert.ok(acts.some(a => a.do === 'follow' && a.to === 'pointer'));
    assert.ok(acts.some(a => a.do === 'trail' && a.kind === 'sparkles'));
  });

  it("Mars's shyness is proximity with speed: a slow approach peeks, a fast one hides (page 5)", () => {
    const prox = ons(5, 'proximity').map(b => b.on as { type: 'proximity'; slowBelow?: number; fastAbove?: number; radius: number });
    assert.ok(prox.some(t => t.slowBelow !== undefined && t.fastAbove === undefined), 'slow peek');
    assert.ok(prox.some(t => t.fastAbove !== undefined && t.slowBelow === undefined), 'fast hide');
    assert.ok(prox.every(t => t.radius >= 100));
  });

  it('the dance page starts a 120 bpm beat and every dancer loops in whole beats (500 ms), so the dance stays in step', () => {
    assert.equal(living.scores['dance-small'].tempo, 120);
    const toggle = page(9).behaviors.find(b => b.id === 'disco-toggle')!;
    const durations: number[] = [];
    const start = toggle.do.find(a => a.do === 'if' && JSON.stringify(a.cond).includes('true'));
    assert.ok(start && start.do === 'if');
    for (const a of start.then) if (a.do === 'animate' && a.anim.loop === 'infinite' && a.anim.durationMs) durations.push(a.anim.durationMs);
    assert.ok(durations.length >= 6);
    assert.ok(durations.every(d => d % 500 === 0), durations.join(','));
    assert.ok(allActions(toggle).some(a => a.do === 'music' && a.cue === 'dance-small'));
  });

  it('tilt parallax moves the star layers on the dark pages', () => {
    for (const n of [2, 4, 5, 7, 8, 10]) assert.ok(ons(n, 'tilt').some(b => b.do.some(a => a.do === 'animate' && a.anim.preset === 'parallax')), `page ${n}`);
  });

  it('page 4: tapping the planets in order plays a tune (goal "Played the arrival tune")', () => {
    assert.ok(page(4).goals?.some(g => g.id === 'arrival-tune'));
    assert.equal(ons(4, 'when').length, 1);
  });
});
