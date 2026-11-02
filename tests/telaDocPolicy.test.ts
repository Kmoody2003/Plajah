import test from 'node:test';
import assert from 'node:assert/strict';
import {
  afterCustodyTransfer, canManageAccess, canReadProjectAsset, canReadTelaMedia, canReleaseMedia, custodyHeir, expiredMembers,
  isClientAuditAction, isInlineSafeMime, mediaPidsIn, nextExpiryOf, orgInviteDecision, parseCoeditAssetPath, parseTelaMediaPath, safeMediaHeaders,
} from '../services/telaDocPolicy';

const org = { creatorId: 'orgOwner', itAdminUids: ['it'] };
const project = { ownerId: 'author', orgId: 'o1', members: { author: 'owner', ed: 'editor', view: 'viewer', old: 'editor' }, memberIds: ['author', 'ed', 'view', 'old'], expires: { old: 1000 } };
const solo = { ownerId: 'me', members: { me: 'owner', friend: 'viewer' }, memberIds: ['me', 'friend'] };
const orgMedia = parseTelaMediaPath('tela-media/tela__d/org/o1/author/a.png')!;
const userMedia = parseTelaMediaPath('tela-media/tela__d/user/me/a.png')!;
const read = (uid: string | null, media: any, extra: Record<string, unknown> = {}) =>
  canReadTelaMedia({ uid, media, project: null, org: null, isActiveOrgMember: false, release: null, now: 2000, ...extra });

test('media paths parse only in their two exact shapes', () => {
  assert.equal(orgMedia.scope, 'org');
  assert.equal(userMedia.scope, 'user');
  for (const bad of ['tela-media/x', 'users/u/tela/a.png', 'tela-media/p/user/u', 'tela-media/p/user/u/a/b', 'tela-media/../user/u/a', 'tela-media/p/other/u/a', 'tela-media/p/org/o/u']) assert.equal(parseTelaMediaPath(bad), null, bad);
  assert.deepEqual(parseCoeditAssetPath('coedit-assets/p/u/a/proxy.m4a'), { pid: 'p', uid: 'u' });
  assert.equal(parseCoeditAssetPath('coedit-assets/p/u/proxy.m4a'), null);
  assert.equal(parseCoeditAssetPath('coedit-assets/../u/a/b'), null);
});

test('a shared document answers to its member list', () => {
  assert.equal(read('ed', orgMedia, { project, org }), true);
  assert.equal(read('view', orgMedia, { project, org }), true);
  assert.equal(read('outsider', orgMedia, { project, org }), false);
  assert.equal(read(null, orgMedia, { project, org }), false);
  assert.equal(read('friend', userMedia, { project: solo }), true);
  assert.equal(read('stranger', userMedia, { project: solo }), false);
});

test('revoked and expired people lose the media, even media they uploaded', () => {
  assert.equal(read('old', orgMedia, { project, org }), false);
  const revoked = { ...project, members: { author: 'owner' }, memberIds: ['author'] };
  assert.equal(read('ed', parseTelaMediaPath('tela-media/tela__d/org/o1/ed/mine.png'), { project: revoked, org }), false);
  assert.equal(read('friend', parseTelaMediaPath('tela-media/tela__d/user/friend/mine.png'), { project: { ...solo, members: { me: 'owner' } } }), false);
});

test('an org steward reaches its documents; an org member with no seat on the project does not', () => {
  assert.equal(read('orgOwner', orgMedia, { project, org }), true);
  assert.equal(read('it', orgMedia, { project, org }), true);
  assert.equal(read('plainMember', orgMedia, { project, org, isActiveOrgMember: true }), false);
});

test('org media nobody has shared stays in the org', () => {
  assert.equal(read('plainMember', orgMedia, { org, isActiveOrgMember: true }), true);
  assert.equal(read('it', orgMedia, { org }), true);
  assert.equal(read('outsider', orgMedia, { org }), false);
  assert.equal(read(null, orgMedia, { org }), false);
});

test('a document never shared keeps its link; published media stays public; a chat grant is per person', () => {
  assert.equal(read(null, userMedia), true);
  assert.equal(read(null, orgMedia, { project, org, release: { public: true } }), true);
  assert.equal(read('inRoom', orgMedia, { project, org, release: { uids: ['inRoom'] } }), true);
  assert.equal(read('notInRoom', orgMedia, { project, org, release: { uids: ['inRoom'] } }), false);
});

test('project assets are for live members and org stewards', () => {
  assert.equal(canReadProjectAsset('ed', project, org, 2000), true);
  assert.equal(canReadProjectAsset('old', project, org, 2000), false);
  assert.equal(canReadProjectAsset('stranger', project, org, 2000), false);
  assert.equal(canReadProjectAsset('it', project, org, 2000), true);
  assert.equal(canReadProjectAsset('ed', null, org, 2000), false);
});

test('only the owner or a steward manages access; only an editor may release media', () => {
  assert.equal(canManageAccess('author', project, org), true);
  assert.equal(canManageAccess('it', project, org), true);
  assert.equal(canManageAccess('ed', project, org), false);
  assert.equal(canManageAccess('it', solo, org), false);
  assert.equal(canReleaseMedia('ed', project, org, null, 2000), true);
  assert.equal(canReleaseMedia('view', project, org, null, 2000), false);
  assert.equal(canReleaseMedia('old', project, org, null, 2000), false);
  assert.equal(canReleaseMedia('me', null, null, { uploaderUid: 'me' }), true);
});

test('invites stay inside the org unless a steward deliberately says otherwise', () => {
  const active = new Set(['m1']);
  const d = (callerUid: string, invitees: string[], outsideConfirmed = false) => orgInviteDecision({ callerUid, org, activeMemberUids: active, invitees, outsideConfirmed });
  assert.equal(d('author', ['m1']).ok, true);
  assert.equal(d('author', ['it']).ok, true);
  assert.deepEqual(d('author', ['stranger']), { ok: false, outside: ['stranger'], canOverride: false });
  assert.equal(d('author', ['stranger'], true).ok, false, 'an author cannot confirm their own outside share');
  assert.deepEqual(d('it', ['stranger']), { ok: false, outside: ['stranger'], canOverride: true });
  assert.equal(d('it', ['stranger'], true).ok, true);
  assert.equal(d('orgOwner', ['stranger'], true).ok, true);
});

test('custody passes to the org owner, else a seated IT Admin, never back to the leaver', () => {
  assert.equal(custodyHeir(org, new Set(['it']), 'author'), 'orgOwner');
  assert.equal(custodyHeir(org, new Set(['it']), 'orgOwner'), 'it');
  assert.equal(custodyHeir({ creatorId: 'gone', itAdminUids: ['gone'] }, new Set(), 'gone'), null);
  assert.equal(custodyHeir(null, new Set(), 'author'), null);
});

test('after custody moves the leaver is out and the heir owns it', () => {
  const next = afterCustodyTransfer({ ...project, names: { author: 'A', ed: 'E' }, photos: { author: 'p' } }, 'orgOwner', ['author'], 'Org Owner');
  assert.equal(next.ownerId, 'orgOwner');
  assert.equal(next.custodyFromUid, 'author');
  assert.equal((next.members as any)?.orgOwner, 'owner');
  assert.equal(next.members?.author, undefined);
  assert.ok(!next.memberIds?.includes('author'));
  assert.ok(next.memberIds?.includes('orgOwner'));
  assert.equal(next.names?.author, undefined);
  assert.equal(next.photos?.author, undefined);
  assert.equal(next.members?.ed, 'editor');
});

test('expiry sweeps past dates only, and never the owner', () => {
  assert.deepEqual(expiredMembers(project, 2000), ['old']);
  assert.deepEqual(expiredMembers(project, 500), []);
  assert.deepEqual(expiredMembers({ ...project, ownerId: 'old' }, 2000), []);
  assert.equal(nextExpiryOf({ a: 5, b: 3 }), 3);
  assert.equal(nextExpiryOf({}), Number.MAX_SAFE_INTEGER);
  assert.equal(nextExpiryOf(undefined), Number.MAX_SAFE_INTEGER);
});

test('HTML, SVG, XML and script never render from our origin', () => {
  for (const m of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'application/javascript', 'text/javascript', '', null, 'TEXT/HTML; charset=utf-8', 'application/octet-stream']) {
    assert.equal(isInlineSafeMime(m), false, String(m));
    const h = safeMediaHeaders(m, 'x');
    assert.equal(h['Content-Type'], 'application/octet-stream');
    assert.match(h['Content-Disposition'], /^attachment/);
    assert.equal(h['X-Content-Type-Options'], 'nosniff');
    assert.match(h['Content-Security-Policy'], /sandbox/);
  }
  for (const m of ['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'video/mp4', 'application/pdf', 'image/png; x=y']) {
    assert.equal(isInlineSafeMime(m), true, m);
    assert.match(safeMediaHeaders(m, 'x')['Content-Disposition'], /^inline/);
  }
  assert.ok(!safeMediaHeaders('image/png', 'a"\r\nSet-Cookie: x').toString().includes('\r'));
  assert.ok(!safeMediaHeaders('image/png', 'a"\r\nSet-Cookie: x')['Content-Disposition'].includes('\r'));
});

test('a client can report only what it alone can see', () => {
  for (const a of ['opened', 'exported', 'threat_blocked', 'access_ended_copy_removed']) assert.equal(isClientAuditAction(a), true);
  for (const a of ['shared', 'access_revoked', 'deleted', 'left', 'custody_transferred', 'role_changed', 7, null]) assert.equal(isClientAuditAction(a), false);
});

test('finds which projects a document draws media from', () => {
  const json = JSON.stringify({ a: { src: '/api/tela-media/tela__x/user/u/a.png' }, b: '/api/tela-media/tela__y/org/o/u/b.png', c: 'https://example.com/a.png', d: '/api/tela-media/tela__x/user/u/c.png' });
  assert.deepEqual(mediaPidsIn(json).sort(), ['tela__x', 'tela__y']);
  assert.deepEqual(mediaPidsIn('{}'), []);
});

test('private Notes never leave with a document sent to chat', async () => {
  const { forShare } = await import('../components/tela/telaCoedit');
  const doc: any = { id: 'd', frames: [], devices: { open: { type: 'WRITER' }, secret: { type: 'NOTES', domainBinding: { encryptedAtRest: true } }, plain: { type: 'NOTES' } } };
  assert.deepEqual(Object.keys(forShare(doc).devices).sort(), ['open', 'plain']);
  assert.ok(!JSON.stringify(forShare(doc)).includes('encryptedAtRest'));
});
