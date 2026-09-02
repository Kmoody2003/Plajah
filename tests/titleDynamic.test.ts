import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dynamicText, formatNumber, formatTimecode, isDynamicActive } from '../services/fabula/titleDynamic';

describe('Dynamic title text', () => {
  it('counts with easing, grouping and affixes', () => {
    const cfg = { type: 'counter' as const, from: 0, to: 12500, duration: 2, decimals: 0, prefix: '$', ease: 'linear' as const };
    assert.equal(dynamicText('x', 0, cfg), '$0');
    assert.equal(dynamicText('x', 1, cfg), '$6,250');
    assert.equal(dynamicText('x', 5, cfg), '$12,500');
    assert.equal(dynamicText('x', 5, { ...cfg, type: 'percent', to: 87.5, decimals: 1 }), '$87.5%');
    assert.equal(formatNumber(-1234.5, 2), '-1,234.50');
  });
  it('formats timecode and countdowns', () => {
    assert.equal(formatTimecode(3661.5, 24), '01:01:01:12');
    assert.equal(dynamicText('', 2.5, { type: 'timecode', fps: 25, offset: 60 }), '00:01:02:12');
    assert.equal(dynamicText('', 3.2, { type: 'countdown', from: 10 }), '7');
    assert.equal(dynamicText('', 10, { type: 'countdown', from: 90 }), '1:20');
  });
  it('types a terminal screen with a cursor', () => {
    const cfg = { type: 'screen' as const, cps: 10, cursor: '_' };
    assert.equal(dynamicText('hello world', .5, cfg), 'hello_');
    assert.ok(dynamicText('hello world', 20, cfg).startsWith('hello world'));
    assert.equal(isDynamicActive(100, cfg), true);
    assert.equal(isDynamicActive(100, { type: 'counter', duration: 2 }), false);
    assert.equal(dynamicText('keep', 3, { type: 'none' }), 'keep');
  });
});
