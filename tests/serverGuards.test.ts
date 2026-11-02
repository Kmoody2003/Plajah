import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimAllowed, cleanRedeemUnits, isInternalPushLink, isPlainMemberSeat, isPrivateLanIp, isVeoDownloadUri, isVeoOperationName,
  lastNameMatches, muxAssetReadable, muxOwnerOf, muxOwnerTag, pinLockKeys, pushMatchesNotification, signConnectState,
  ticketActionAllowed, verifyConnectState,
} from '../services/serverGuards';

test('seat claims: ID + last name only ever reaches a plain member seat', () => {
  const member = { role: 'MEMBER', roleKey: 'MEMBER' };
  const finance = { role: 'STAFF', roleKey: 'FINANCE_DIRECTOR', claimEmailLower: 'cfo@church.org' };
  assert.equal(isPlainMemberSeat(member), true);
  assert.equal(isPlainMemberSeat({ role: 'MEMBER', roleKey: 'MEMBER', ministryRoles: [{ ministryId: 'x' }] }), false);
  assert.equal(claimAllowed(member, 'id-and-last-name', null), true);
  assert.equal(claimAllowed(finance, 'id-and-last-name', { email: 'cfo@church.org', emailVerified: false }), false);
  assert.equal(claimAllowed(finance, 'id-and-last-name', { email: 'evil@x.com', emailVerified: true }), false);
  assert.equal(claimAllowed(finance, 'id-and-last-name', { email: 'CFO@church.org', emailVerified: true }), true);
  assert.equal(claimAllowed(finance, 'verified-email', { email: 'cfo@church.org', emailVerified: true }), true);
  assert.equal(claimAllowed({ role: 'STAFF', roleKey: 'PASTOR' }, 'verified-email', { email: 'a@b.c', emailVerified: true }), false);
});

test('last name: whole-word suffix only', () => {
  assert.equal(lastNameMatches('Jane Smith', 'smith'), true);
  assert.equal(lastNameMatches('Jane van der Berg', 'van der Berg'), true);
  assert.equal(lastNameMatches('Smith', 'Smith'), true);
  assert.equal(lastNameMatches('Jane Smithson', 'smith'), false);
  assert.equal(lastNameMatches('Smith Jane', 'smith'), false);
  assert.equal(lastNameMatches('Jane Smith', ''), false);
});

test('tickets: holders keep self-serve; only staff add perks or override', () => {
  const holder = { isHolder: true, isEventManager: false };
  const stranger = { isHolder: false, isEventManager: false };
  const staff = { isHolder: false, isEventManager: true };
  for (const a of ['check-in', 'redeem', 'print'] as const) assert.equal(ticketActionAllowed(a, holder), true);
  for (const a of ['add-package', 'redeem-override'] as const) assert.equal(ticketActionAllowed(a, holder), false);
  for (const a of ['check-in', 'redeem', 'redeem-override', 'add-package', 'print'] as const) {
    assert.equal(ticketActionAllowed(a, stranger), false);
    assert.equal(ticketActionAllowed(a, staff), true);
  }
  assert.equal(cleanRedeemUnits(undefined), 1);
  assert.equal(cleanRedeemUnits(-5), null);
  assert.equal(cleanRedeemUnits(1.5), null);
});

test('mux: owner stamp survives long trace tags and gates reads', () => {
  const tag = muxOwnerTag('uidA', 'x'.repeat(400));
  assert.equal(tag.length, 255);
  assert.equal(muxOwnerOf(tag), 'uidA');
  assert.equal(muxOwnerOf('public_domain:abc'), null);
  const now = Date.now();
  assert.equal(muxAssetReadable({ passthrough: tag, callerUid: 'uidA', isAdmin: false, now }), true);
  assert.equal(muxAssetReadable({ passthrough: tag, callerUid: 'uidB', isAdmin: false, now }), false);
  assert.equal(muxAssetReadable({ passthrough: tag, callerUid: 'uidB', isAdmin: true, now }), true);
  assert.equal(muxAssetReadable({ passthrough: 'trace', createdAtMs: now - 3_600_000, callerUid: 'uidB', isAdmin: false, now }), true);
  assert.equal(muxAssetReadable({ passthrough: 'trace', createdAtMs: now - 72 * 3_600_000, callerUid: 'uidB', isAdmin: false, now }), false);
  assert.equal(muxAssetReadable({ callerUid: 'uidB', isAdmin: false, now }), false);
});

test('push links stay inside the app', () => {
  for (const ok of ['FEED', '', null, 'content-hq:abc', 'claim-copy:abc', '/org/x', 'CHAT_ROOM']) assert.equal(isInternalPushLink(ok), true, String(ok));
  for (const bad of ['https://evil.example', 'javascript:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', 'mailto:a@b.c']) assert.equal(isInternalPushLink(bad), false, bad);
  assert.equal(pushMatchesNotification({ userId: 'r', senderId: 's' }, 'r', 's'), true);
  assert.equal(pushMatchesNotification({ userId: 'r', senderId: 'other' }, 'r', 's'), false);
  assert.equal(pushMatchesNotification(null, 'r', 's'), false);
});

test('veo: only file downloads and veo operations reach the server key', () => {
  assert.equal(isVeoDownloadUri('https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media'), true);
  for (const bad of [
    'https://generativelanguage.googleapis.com/v1beta/files',
    'https://generativelanguage.googleapis.com/v1beta/tunedModels',
    'https://generativelanguage.googleapis.com.evil.com/v1beta/files/a:download',
    'https://generativelanguage.googleapis.com/v1beta/files/a:download&x=1',
  ]) assert.equal(isVeoDownloadUri(bad), false, bad);
  assert.equal(isVeoOperationName('models/veo-3.1-fast-generate-preview/operations/abc'), true);
  assert.equal(isVeoOperationName('tunedModels/x/operations/y'), false);
});

test('connect state binds org, caller and expiry', () => {
  const now = 1_000_000;
  const s = signConnectState('k', 'org1', 'u1', now + 1000);
  assert.equal(verifyConnectState('k', s, 'org1', 'u1', now), true);
  assert.equal(verifyConnectState('k', s, 'org2', 'u1', now), false);
  assert.equal(verifyConnectState('k', s, 'org1', 'u2', now), false);
  assert.equal(verifyConnectState('other', s, 'org1', 'u1', now), false);
  assert.equal(verifyConnectState('k', s, 'org1', 'u1', now + 2000), false);
  assert.equal(verifyConnectState('k', 'garbage', 'org1', 'u1', now), false);
});

test('LAN targets are literal private IPs only', () => {
  for (const ok of ['192.168.1.20', '10.0.0.5', '172.16.0.1']) assert.equal(isPrivateLanIp(ok), true, ok);
  for (const bad of ['169.254.169.254', '127.0.0.1', '8.8.8.8', 'evil.example', '172.32.0.1', '192.168.1.999', '192.168.1.1:80/x']) assert.equal(isPrivateLanIp(bad), false, bad);
});

test('PIN lockout never spans callers', () => {
  const [a] = pinLockKeys('biz', 'attacker', '1.1.1.1');
  const [b, ip] = pinLockKeys('biz', 'owner', '2.2.2.2');
  assert.notEqual(a, b);
  assert.ok(ip.includes('2.2.2.2'));
});
