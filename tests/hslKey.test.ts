import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgb2hsl, keyFromPixel, isQualifierIdentity, QUALIFIER_DEFAULT } from '../services/fabula/hslKey.ts';
import { isGradeIdentity } from '../components/plajahPixels/engine/core/compositor.ts';

test('rgb2hsl matches known colours', () => {
  const [h1, s1, l1] = rgb2hsl(1, 0, 0);   // pure red
  assert.ok(Math.abs(h1 - 0) < 1e-6 || Math.abs(h1 - 1) < 1e-6);
  assert.ok(Math.abs(s1 - 1) < 1e-6 && Math.abs(l1 - 0.5) < 1e-6);
  const [, s2, l2] = rgb2hsl(0.5, 0.5, 0.5); // grey
  assert.equal(s2, 0);
  assert.ok(Math.abs(l2 - 0.5) < 1e-6);
  const [h3] = rgb2hsl(0, 1, 0);            // green ≈ 1/3 turn
  assert.ok(Math.abs(h3 - 1 / 3) < 1e-6);
});

test('keyFromPixel centres the key on the sampled hue with sane ranges', () => {
  const q = keyFromPixel(0.9, 0.5, 0.35); // a skin-ish orange
  const [h] = rgb2hsl(0.9, 0.5, 0.35);
  assert.ok(Math.abs(q.h - h) < 1e-6, 'hue centred');
  assert.ok(q.hw > 0 && q.hw < 0.2);
  assert.ok(q.sl >= 0 && q.sh <= 1 && q.sl < q.sh);
  assert.ok(q.ll >= 0 && q.lh <= 1 && q.ll < q.lh);
  assert.equal(q.enabled, true);
});

test('a qualifier with no correction is identity (a key alone changes nothing)', () => {
  assert.ok(isQualifierIdentity(null));
  assert.ok(isQualifierIdentity({ ...QUALIFIER_DEFAULT }));            // default has dHue0/mSat1/mLum1
  assert.ok(isQualifierIdentity({ ...QUALIFIER_DEFAULT, enabled: false }));
});

test('a correction OR show-key makes it active', () => {
  assert.ok(!isQualifierIdentity({ ...QUALIFIER_DEFAULT, dHue: 0.1 }));
  assert.ok(!isQualifierIdentity({ ...QUALIFIER_DEFAULT, mSat: 1.5 }));
  assert.ok(!isQualifierIdentity({ ...QUALIFIER_DEFAULT, mLum: 0.6 }));
  assert.ok(!isQualifierIdentity({ ...QUALIFIER_DEFAULT, show: true }));
});

test('the compositor treats a qualifier-only grade as non-identity (so the stage runs)', () => {
  assert.ok(isGradeIdentity(null));
  assert.ok(isGradeIdentity({}));
  assert.ok(!isGradeIdentity({ qualifier: { ...QUALIFIER_DEFAULT, mSat: 1.4 } }));
});
