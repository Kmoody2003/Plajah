import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { compareHashes, staticEffects, hashPixels } from '../components/plajahPixels/engine/fx/fxReference';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';

const baseline = JSON.parse(readFileSync(new URL('../docs/fabula/fx-reference-hashes.json', import.meta.url), 'utf8'));

describe('Reference hashing', () => {
  it('is stable for identical pixels and moves for different ones', () => {
    const a = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);
    const b = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);
    const c = new Uint8Array([10, 20, 30, 255, 40, 50, 90, 255]);
    assert.equal(hashPixels(a, 2), hashPixels(b, 2));
    assert.notEqual(hashPixels(a, 2), hashPixels(c, 2));
  });

  it('tolerates last-place rounding, which is what a different driver produces', () => {
    const a = new Uint8Array([100, 100, 100, 255]);
    const nudged = new Uint8Array([101, 100, 100, 255]);
    assert.equal(hashPixels(a, 2), hashPixels(nudged, 2), 'a one-step difference must survive the mask');
    const big = new Uint8Array([140, 100, 100, 255]);
    assert.notEqual(hashPixels(a, 2), hashPixels(big, 2), 'a real difference must still register');
  });
});

describe('Sweep comparison', () => {
  const base = { a: '11-11-11', b: '22-33-44', c: 'aa-bb-cc' };

  it('reports what changed, appeared and disappeared', () => {
    const next = { a: '11-11-11', b: '99-33-44', d: 'ee-ff-00' };
    const diff = compareHashes(base, next);
    assert.deepEqual(diff.changed, ['b']);
    assert.deepEqual(diff.added, ['d']);
    assert.deepEqual(diff.removed, ['c']);
  });

  it('reports nothing when a sweep is unchanged', () => {
    const diff = compareHashes(base, { ...base });
    assert.deepEqual(diff, { changed: [], added: [], removed: [], errored: [] });
  });

  it('surfaces effects that failed to render at all', () => {
    const diff = compareHashes(base, { ...base, b: 'error:shader would not compile' });
    assert.deepEqual(diff.errored, ['b']);
    assert.ok(diff.changed.includes('b'), 'a failed render is also a change');
  });

  it('flags an effect whose sampled times never differ', () => {
    assert.deepEqual(staticEffects({ a: '11-11-11', b: '22-33-44', c: '55' }), ['a']);
  });
});

describe('Stored baseline', () => {
  it('covers every registered effect, so a new effect cannot slip in unfingerprinted', () => {
    const diff = compareHashes(baseline.effects, Object.fromEntries(FX_EFFECTS.map((e) => [e.id, baseline.effects[e.id] ?? 'missing'])));
    assert.deepEqual(diff.removed, [], `baseline has effects the registry does not: ${diff.removed.join(', ')}`);
    assert.deepEqual(diff.changed, [], `these effects have no stored fingerprint: ${diff.changed.join(', ')}`);
    assert.equal(Object.keys(baseline.effects).length, FX_EFFECTS.length);
  });

  it('recorded no render failures and no dead shaders', () => {
    const failed = Object.entries(baseline.effects).filter(([, h]) => String(h).startsWith('error:'));
    assert.deepEqual(failed, [], `effects that failed to render: ${failed.map(([id]) => id).join(', ')}`);
    // Every hash is three sampled times joined by "-".
    for (const [id, h] of Object.entries(baseline.effects)) {
      assert.equal(String(h).split('-').length, 3, `${id} does not carry three sampled times`);
    }
  });

  it('records the settings the fingerprints depend on', () => {
    assert.ok(baseline.settings.width > 0 && baseline.settings.height > 0);
    assert.ok(Array.isArray(baseline.settings.times) && baseline.settings.times.length === 3);
    assert.equal(typeof baseline.settings.tolerance, 'number');
  });
});
