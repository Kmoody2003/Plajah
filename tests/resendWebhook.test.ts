import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { verifySvixSignature, resendStopReason } from '../services/notify/resendWebhookCore';

const key = Buffer.from('plajah-test-signing-key');
const secret = `whsec_${key.toString('base64')}`;
const NOW = 1_800_000_000_000;
const ts = String(NOW / 1000);
const body = Buffer.from('{"type":"email.bounced"}');
const sign = (b: Buffer, t = ts, id = 'msg_1') =>
  `v1,${nodeCrypto.createHmac('sha256', key).update(`${id}.${t}.`).update(b).digest('base64')}`;

test('a correct Svix signature passes, including alongside a rotated one', () => {
  assert.equal(verifySvixSignature(body, { id: 'msg_1', timestamp: ts, signature: sign(body) }, secret, NOW), true);
  assert.equal(verifySvixSignature(body, { id: 'msg_1', timestamp: ts, signature: `v1,AAAA ${sign(body)}` }, secret, NOW), true);
});

test('tampering, a wrong secret, missing headers and stale timestamps all fail', () => {
  const signature = sign(body);
  assert.equal(verifySvixSignature(Buffer.from('{"type":"x"}'), { id: 'msg_1', timestamp: ts, signature }, secret, NOW), false);
  assert.equal(verifySvixSignature(body, { id: 'msg_2', timestamp: ts, signature }, secret, NOW), false);
  assert.equal(verifySvixSignature(body, { id: 'msg_1', timestamp: ts, signature }, `whsec_${Buffer.from('other').toString('base64')}`, NOW), false);
  assert.equal(verifySvixSignature(body, { id: 'msg_1', timestamp: ts }, secret, NOW), false);
  assert.equal(verifySvixSignature(body, { id: 'msg_1', timestamp: ts, signature }, '', NOW), false);
  const old = String(NOW / 1000 - 301);
  assert.equal(verifySvixSignature(body, { id: 'msg_1', timestamp: old, signature: sign(body, old) }, secret, NOW), false);
});

test('only permanent failures stop mail to an address', () => {
  assert.equal(resendStopReason({ type: 'email.bounced', data: { bounce: { type: 'Permanent' } } }), 'Hard bounce');
  assert.equal(resendStopReason({ type: 'email.bounced', data: { bounce: { type: 'Transient' } } }), '');
  assert.equal(resendStopReason({ type: 'email.bounced', data: { bounce: { type: 'Undetermined' } } }), '');
  assert.equal(resendStopReason({ type: 'email.complained' }), 'Marked as spam');
  assert.equal(resendStopReason({ type: 'email.suppressed' }), 'On the provider suppression list');
  assert.equal(resendStopReason({ type: 'email.delivered' }), '');
});
