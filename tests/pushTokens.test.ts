import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceTokens } from '../services/pushTokensCore';

test('tokens merge across private and stale public docs, once each', () => {
  assert.deepEqual(deviceTokens({ fcmTokens: ['a', 'b'] }, { fcmTokens: ['b'], fcmToken: 'c' }), ['a', 'b', 'c']);
});
test('junk and missing docs are ignored', () => {
  assert.deepEqual(deviceTokens(null, undefined, { fcmTokens: [1, ''], fcmToken: null }), []);
});
