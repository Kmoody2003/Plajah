import test from 'node:test';
import assert from 'node:assert/strict';
import { countNewHqAlerts, summarizeHqAlerts, type HqAuditEntry } from '../services/hqSecurityAlerts';
import { canReviewHqSecurity } from '../services/hqAccessPolicy';

const now = 1_800_000_000_000;
const denied = (id: string, actorUid: string, assetId: string, ago = 1000): HqAuditEntry => ({ id, kind: 'ACCESS_DENIED', actorUid, assetId, createdAt: now - ago });

test('one wrong tap is not an alert', () => {
  assert.deepEqual(summarizeHqAlerts({ entries: [denied('a', 'u', 'f1')], now }), []);
});

test('repeat tries, or tries across files, are', () => {
  assert.equal(summarizeHqAlerts({ entries: [denied('a', 'u', 'f1'), denied('b', 'u', 'f1'), denied('c', 'u', 'f1')], now }).length, 1);
  const across = summarizeHqAlerts({ entries: [denied('a', 'u', 'f1'), denied('b', 'u', 'f2')], personNames: { u: 'Pat' }, now });
  assert.equal(across.length, 1);
  assert.match(across[0].title, /^Pat keeps trying/);
  assert.match(across[0].detail, /2 tries on 2 files/);
});

test('old tries and the reader themselves stay out of it', () => {
  const old = 8 * 86400000;
  assert.deepEqual(summarizeHqAlerts({ entries: [denied('a', 'u', 'f1', old), denied('b', 'u', 'f2', old)], now }), []);
  assert.deepEqual(summarizeHqAlerts({ entries: [denied('a', 'me', 'f1'), denied('b', 'me', 'f2')], viewerUid: 'me', now }), []);
});

test('a blocked file always speaks, in plain words, and offers the file', () => {
  const [a] = summarizeHqAlerts({ entries: [{ id: 'x', kind: 'FILE_BLOCKED', name: 'plan.exe', assetId: 'f', actorUid: 'u', reason: 'It looks like a program.', createdAt: now - 5 }], personNames: { u: 'Sam' }, now });
  assert.equal(a.title, 'plan.exe was blocked');
  assert.match(a.detail, /Uploaded by Sam/);
  assert.equal(a.action, 'open_file');
});

test('only links people can download from, and only while they work', () => {
  const links = [
    { id: 'l1', assetId: 'f', allowDownload: true, createdAt: now - 10, expiresAt: now + 86400000 },
    { id: 'l2', assetId: 'f', allowDownload: false, createdAt: now - 10 },
    { id: 'l3', assetId: 'f', allowDownload: true, revokedAt: now - 1, createdAt: now - 10 },
    { id: 'l4', assetId: 'f', allowDownload: true, expiresAt: now - 1, createdAt: now - 10 },
  ];
  assert.deepEqual(summarizeHqAlerts({ entries: [], links, now }).map(a => a.id), ['link:l1']);
});

test('quiet log kinds never reach the owner', () => {
  const entries = ['QUOTA_REJECTED', 'RETENTION_PURGE', 'MEDIA_PURGED'].map((kind, i) => ({ id: String(i), kind, createdAt: now }));
  assert.deepEqual(summarizeHqAlerts({ entries, now }), []);
});

test('done stays done; the badge counts only what is new', () => {
  const entries = [{ id: 'x', kind: 'FILE_BLOCKED', createdAt: now - 5 }, { id: 'y', kind: 'FILE_BLOCKED', createdAt: now - 500 }];
  assert.deepEqual(summarizeHqAlerts({ entries, dismissed: ['blocked:x'], now }).map(a => a.id), ['blocked:y']);
  const all = summarizeHqAlerts({ entries, now });
  assert.equal(countNewHqAlerts(all, now - 100), 1);
  assert.equal(countNewHqAlerts(all, now), 0);
  assert.equal(countNewHqAlerts(all, undefined), 2);
});

test('only the owner and IT Admins may read the log', () => {
  const org = { creatorId: 'owner', itAdminUids: ['it'], admins: ['admin'], staffUids: ['staff'] };
  assert.equal(canReviewHqSecurity('owner', 'org', org), true);
  assert.equal(canReviewHqSecurity('it', 'org', org), true);
  for (const uid of ['admin', 'staff', 'outsider', '']) assert.equal(canReviewHqSecurity(uid, 'org', org), false, uid);
  assert.equal(canReviewHqSecurity('owner', 'org', null), false);
});
