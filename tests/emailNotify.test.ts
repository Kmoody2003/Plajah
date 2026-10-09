import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planEmail, categoryForType, enqueue, groupDigest, safeSnippet, signUnsub, verifyUnsub,
  prefKeyForScope, digestDue, renderEmail, MAX_QUEUE_ITEMS, DAILY_IMMEDIATE_CAP, type QueueItem,
} from '../services/notify/emailNotifyCore';

const base = { prefs: {}, emailVerified: true, hasEmail: true, now: 1_000_000_000_000, sentTodayImmediate: 0 };

test('unverified or missing email never gets mail, even security', () => {
  assert.equal(planEmail({ ...base, category: 'security', emailVerified: false }).action, 'skip');
  assert.equal(planEmail({ ...base, category: 'system', hasEmail: false }).action, 'skip');
});

test('security ignores the master switch', () => {
  assert.equal(planEmail({ ...base, category: 'security', prefs: { email: false } }).action, 'send_now');
});

test('master off silences everything else', () => {
  for (const c of ['messages', 'social', 'system', 'platform'] as const) {
    assert.equal(planEmail({ ...base, category: c, prefs: { email: false } }).action, 'skip');
  }
});

test('messages wait for unread, respect thread cooldown and strangers', () => {
  const p = planEmail({ ...base, category: 'messages' });
  assert.equal(p.action, 'queue_unread');
  assert.equal(planEmail({ ...base, category: 'messages', lastThreadEmailAt: base.now - 10 * 60_000 }).action, 'skip');
  assert.equal(planEmail({ ...base, category: 'messages', lastThreadEmailAt: base.now - 2 * 3600_000 }).action, 'queue_unread');
  assert.equal(planEmail({ ...base, category: 'messages', senderIsStranger: true }).action, 'skip');
});

test('social digests; content is opt-in', () => {
  assert.equal(planEmail({ ...base, category: 'social' }).action, 'digest');
  assert.equal(planEmail({ ...base, category: 'social', prefs: { emailSocial: false } }).action, 'skip');
  assert.equal(planEmail({ ...base, category: 'content' }).action, 'skip');
  assert.equal(planEmail({ ...base, category: 'content', prefs: { emailContent: true } }).action, 'digest');
});

test('system mail overflows into digest past the daily cap', () => {
  assert.equal(planEmail({ ...base, category: 'system' }).action, 'send_now');
  assert.equal(planEmail({ ...base, category: 'system', sentTodayImmediate: DAILY_IMMEDIATE_CAP }).action, 'digest');
});

test('categoryForType', () => {
  assert.equal(categoryForType('MESSAGE'), 'messages');
  assert.equal(categoryForType('like'), 'social');
  assert.equal(categoryForType('CONTENT'), 'content');
  assert.equal(categoryForType(undefined), 'system');
});

const item = (o: Partial<QueueItem>): QueueItem => ({ kind: 'digest', type: 'LIKE', category: 'social', senderId: 's', senderName: 'Ana', snippet: '', at: 0, ...o });

test('enqueue dedupes by notificationId and stays bounded', () => {
  let q: QueueItem[] = [];
  q = enqueue(q, item({ notificationId: 'a' }));
  q = enqueue(q, item({ notificationId: 'a' }));
  assert.equal(q.length, 1);
  for (let i = 0; i < MAX_QUEUE_ITEMS + 10; i++) q = enqueue(q, item({ notificationId: `n${i}` }));
  assert.equal(q.length, MAX_QUEUE_ITEMS);
});

test('groupDigest bundles likes on the same post', () => {
  const lines = groupDigest([
    item({ senderName: 'Ana', targetId: 'p1' }), item({ senderName: 'Ben', targetId: 'p1' }),
    item({ senderName: 'Cy', targetId: 'p1' }), item({ type: 'FOLLOW', senderName: 'Dee' }),
  ]);
  assert.deepEqual(lines, ['Ana and 2 others liked your post', 'Dee followed you']);
});

test('safeSnippet strips links and markup', () => {
  assert.equal(safeSnippet('<b>hi</b> go to https://evil.example/x now'), 'hi go to [link] now');
  assert.equal(safeSnippet('x'.repeat(500)).length, 140);
});

test('unsubscribe tokens round-trip and reject tampering', () => {
  const t = signUnsub('uid123', 'social', 'secret');
  assert.deepEqual(verifyUnsub(t, 'secret'), { uid: 'uid123', scope: 'social' });
  assert.equal(verifyUnsub(t, 'other'), null);
  assert.equal(verifyUnsub(t.replace(/^./, 'A'), 'secret'), null);
  assert.equal(prefKeyForScope('all'), 'email');
  assert.equal(prefKeyForScope('nope'), null);
});

test('digest cadence', () => {
  const now = 10 * 86400_000;
  assert.equal(digestDue({}, now - 21 * 3600_000, now), true);
  assert.equal(digestDue({}, now - 5 * 3600_000, now), false);
  assert.equal(digestDue({ emailWeekly: true }, now - 2 * 86400_000, now), false);
});

test('rendered html escapes user text', () => {
  const m = renderEmail({ subject: 's', heading: '<script>', lines: ['a & b'], ctaLabel: 'Go', ctaUrl: 'https://plajah.com/' });
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('a &amp; b'));
  assert.ok(m.text.includes('Go: https://plajah.com/'));
});
