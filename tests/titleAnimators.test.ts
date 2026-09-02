import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { glyphStates, isTitleAnimating, titleOutProgress } from '../services/fabula/titleAnimators';

describe('Title animators', () => {
  it('leaves text untouched with no animator', () => {
    const g = glyphStates('Hi there', 0, { type: 'none', duration: 1 });
    assert.equal(g.length, 8); assert.ok(g.every(s => s.opacity === 1 && s.dx === 0 && s.char.length === 1));
  });

  it('types on left to right and finishes fully visible', () => {
    const anim = { type: 'typeOn' as const, duration: 1, stagger: 1 };
    const early = glyphStates('ABCDE', .1, anim), late = glyphStates('ABCDE', 5, anim);
    assert.equal(early[0].opacity, 1); assert.equal(early[4].opacity, 0);
    assert.ok(late.every(s => s.opacity === 1));
  });

  it('fade up moves glyphs and staggers them', () => {
    const anim = { type: 'fadeUp' as const, duration: 1, stagger: .8 };
    const g = glyphStates('ABCD', .3, anim);
    assert.ok(g[0].opacity > g[3].opacity);
    assert.ok(g[3].dy > g[0].dy);
    assert.deepEqual(glyphStates('ABCD', 3, anim).map(s => s.dy), [0, 0, 0, 0]);
  });

  it('scramble is deterministic and resolves to the real text', () => {
    const anim = { type: 'scramble' as const, duration: 1, stagger: .5 };
    const a = glyphStates('FABULA', .2, anim), b = glyphStates('FABULA', .2, anim);
    assert.deepEqual(a.map(s => s.char), b.map(s => s.char));
    assert.deepEqual(glyphStates('FABULA', 4, anim).map(s => s.char).join(''), 'FABULA');
  });

  it('plays out at the end of the clip and reports animating windows', () => {
    const anim = { type: 'fadeIn' as const, duration: .5, out: .5 };
    assert.equal(titleOutProgress(1, 3, anim), 0);
    assert.ok(titleOutProgress(2.75, 3, anim) > 0 && titleOutProgress(2.75, 3, anim) < 1);
    assert.ok(glyphStates('ABC', 2.9, anim, 3)[0].opacity < .5);
    assert.equal(isTitleAnimating(1.5, anim, 3), false);
    assert.equal(isTitleAnimating(.2, anim, 3), true);
    assert.equal(isTitleAnimating(2.8, anim, 3), true);
  });
});
