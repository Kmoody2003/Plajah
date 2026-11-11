// ActivityPub server — pure logic + router, no network. Run: npx tsx --test tests/activitypub.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { normalizeHandle, postIdFromNoteUrl, handleFromActorUrl, apUrls, actorKeyFor, wantsActivityJson } from '../services/activitypub/config';
import { signRequest, verifySignature, parseSignatureHeader, digestHeader } from '../services/activitypub/httpSignature';
import { encryptPrivateKey, decryptPrivateKey } from '../services/activitypub/keys';
import { isChildAccount, userEligibility, orgEligibility, judgePost, isDomainBlocked, postActorRef } from '../services/activitypub/policy';
import { buildNote, buildActor, textToHtml, htmlToText, parseWebfingerResource } from '../services/activitypub/jsonld';
import { createMemoryStore } from '../services/activitypub/store';
import { inboxTargets, nextAttemptAt, classifyStatus, deliverPostToFollowers, deliverDelete, retryDueDeliveries, MAX_ATTEMPTS } from '../services/activitypub/delivery';
import { authenticateInbound, processActivity, _clearActorCache } from '../services/activitypub/inbox';
import { setIdentityEnabled, identityStatus, resolveLocalActor } from '../services/activitypub/actors';
import type { ApDeps } from '../services/activitypub/deps';
import type { ApHttp } from '../services/activitypub/remote';
import { createActivityPubRouter, createActivityPubOwnerRouter } from '../routes/activitypub';

const BASE = 'https://plajah.test.example';
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const ENC = randomBytes(32);
const U = apUrls(BASE);

function rsa() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  return { pub: publicKey, priv: privateKey };
}
const REMOTE_KEYS = rsa();
const REMOTE = {
  id: 'https://social.remote.example/users/alice',
  keyId: 'https://social.remote.example/users/alice#main-key',
  inbox: 'https://social.remote.example/users/alice/inbox',
  sharedInbox: 'https://social.remote.example/inbox',
};
const remoteActorDoc = {
  id: REMOTE.id, type: 'Person', preferredUsername: 'alice', name: 'Alice <b>R</b>', inbox: REMOTE.inbox,
  endpoints: { sharedInbox: REMOTE.sharedInbox }, icon: { type: 'Image', url: 'https://social.remote.example/a.png' },
  publicKey: { id: REMOTE.keyId, owner: REMOTE.id, publicKeyPem: REMOTE_KEYS.pub },
};

interface FakeHttp extends ApHttp { posts: { url: string; body: string; headers: Record<string, string> }[]; postStatus: number; docs: Map<string, any> }
function fakeHttp(): FakeHttp {
  const f: FakeHttp = {
    posts: [], postStatus: 202, docs: new Map([[REMOTE.id, remoteActorDoc]]),
    async getJson(url) { const d = f.docs.get(url); return d ? { status: 200, json: d } : { status: 404, json: null }; },
    async post(url, body, headers) { f.posts.push({ url, body, headers }); return { status: f.postStatus, body: '' }; },
  };
  return f;
}

function makeDeps(over: Partial<ApDeps> = {}) {
  const store = createMemoryStore({ blocked: ['bad.example'] });
  const http = fakeHttp();
  const users: Record<string, any> = {
    adult: { displayName: 'Ada Adult', bio: 'Hi <there>', photoURL: 'https://cdn.example/ada.jpg', birthYear: 1990 },
    kid: { displayName: 'Kid', isChild: true },
    priv: { displayName: 'Private Pat', isPrivate: true, birthYear: 1980 },
  };
  const orgs: Record<string, any> = {
    church1: { name: 'Grace', orgType: 'CHURCH', creatorId: 'adult', admins: [] },
  };
  const posts: Record<string, any> = {
    p1: { authorId: 'adult', authorName: 'Ada', text: 'Hello <world> https://x.example/a', isPublic: true, timestamp: NOW - 1000, media: [{ type: 'PHOTO', url: 'https://cdn.example/p.jpg', alt: 'a cat' }] },
    p2: { authorId: 'adult', text: 'members only', isPublic: true, orgAudience: 'MEMBERS', timestamp: NOW - 2000 },
    p3: { authorId: 'adult', text: 'locked', isPublic: true, sanctuaryGate: { tier: 'x' }, timestamp: NOW - 3000 },
    p4: { authorId: 'adult', text: 'quiet', isPublic: true, replyAudience: 'none', timestamp: NOW - 4000 },
  };
  const deps: ApDeps & { http: FakeHttp; users: typeof users; posts: typeof posts } = {
    base: BASE, store, http, now: () => NOW, encKey: () => ENC,
    users, posts,
    loadUser: async id => users[id] ?? null,
    loadOrg: async id => orgs[id] ?? null,
    loadPost: async id => posts[id] ?? null,
    postsByUser: async (uid, before, limit) => Object.entries(posts).filter(([, p]) => p.authorId === uid && p.timestamp <= before)
      .sort((a, b) => b[1].timestamp - a[1].timestamp).slice(0, limit).map(([id, data]) => ({ id, data })),
    postsByOrg: async () => [],
    handleTakenElsewhere: async h => h === 'taken',
    log: () => {},
    ...over,
  } as any;
  return deps;
}

function signedPost(url: string, activity: unknown, opts: { keys?: { priv: string }; keyId?: string; date?: Date; tamper?: boolean } = {}) {
  const body = JSON.stringify(activity);
  const headers = signRequest({ method: 'POST', url, body, keyId: opts.keyId ?? REMOTE.keyId, privateKeyPem: (opts.keys ?? REMOTE_KEYS).priv, now: opts.date ?? new Date(NOW) });
  const u = new URL(url);
  return { method: 'POST', path: u.pathname + u.search, headers, rawBody: Buffer.from(opts.tamper ? body.replace('Follow', 'Fallow') : body), hostCandidates: [u.host] };
}

// ── config ────────────────────────────────────────────────────────────────────
test('handles and URL parsing', () => {
  assert.equal(normalizeHandle('@Ada_Lovelace'), 'ada_lovelace');
  assert.equal(normalizeHandle('a.b-c'), 'a.b-c');
  assert.equal(normalizeHandle('.bad'), null);
  assert.equal(normalizeHandle('has space'), null);
  assert.equal(postIdFromNoteUrl(BASE, `${BASE}/ap/posts/abc_123`), 'abc_123');
  assert.equal(postIdFromNoteUrl(BASE, `https://evil.example/ap/posts/abc`), null);
  assert.equal(postIdFromNoteUrl(BASE, `${BASE}/ap/posts/abc/activity`), null);
  assert.equal(handleFromActorUrl(BASE, `${BASE}/ap/users/ada`), 'ada');
  assert.equal(wantsActivityJson('application/activity+json'), true);
  assert.equal(wantsActivityJson('text/html,*/*'), false);
});

// ── signatures ────────────────────────────────────────────────────────────────
test('HTTP signature: sign → verify, tamper, skew', () => {
  const k = rsa();
  const url = `${BASE}/ap/inbox`;
  const body = '{"type":"Follow"}';
  const headers = signRequest({ method: 'POST', url, body, keyId: 'https://r.example/u#k', privateKeyPem: k.priv, now: new Date(NOW) });
  const parsed = parseSignatureHeader(headers.signature)!;
  assert.equal(parsed.keyId, 'https://r.example/u#k');
  assert.deepEqual(parsed.headers, ['(request-target)', 'host', 'date', 'digest', 'content-type']);
  assert.equal(headers.digest, digestHeader(body));
  const ok = verifySignature({ method: 'POST', path: '/ap/inbox', headers, rawBody: Buffer.from(body), publicKeyPem: k.pub, now: NOW });
  assert.deepEqual(ok, { ok: true, keyId: 'https://r.example/u#k' });
  assert.equal((verifySignature({ method: 'POST', path: '/ap/inbox', headers, rawBody: Buffer.from(body + ' '), publicKeyPem: k.pub, now: NOW }) as any).reason, 'digest-mismatch');
  assert.equal((verifySignature({ method: 'POST', path: '/ap/other', headers, rawBody: Buffer.from(body), publicKeyPem: k.pub, now: NOW }) as any).reason, 'bad-signature');
  assert.equal((verifySignature({ method: 'POST', path: '/ap/inbox', headers, rawBody: Buffer.from(body), publicKeyPem: k.pub, now: NOW + 2 * 3600_000 }) as any).reason, 'date-too-old');
  assert.equal((verifySignature({ method: 'POST', path: '/ap/inbox', headers, rawBody: Buffer.from(body), publicKeyPem: rsa().pub, now: NOW }) as any).reason, 'bad-signature');
  const noDigest = { ...headers, signature: headers.signature.replace(' digest', '') };
  assert.equal((verifySignature({ method: 'POST', path: '/ap/inbox', headers: noDigest, rawBody: Buffer.from(body), publicKeyPem: k.pub, now: NOW }) as any).reason, 'digest-not-signed');
  assert.equal(parseSignatureHeader('garbage'), null);
});

test('private keys are encrypted at rest', () => {
  const k = rsa();
  const enc = encryptPrivateKey(k.priv, ENC);
  assert.ok(!enc.includes('PRIVATE KEY'));
  assert.equal(decryptPrivateKey(enc, ENC), k.priv);
  assert.throws(() => decryptPrivateKey(enc, randomBytes(32)));
});

// ── policy ────────────────────────────────────────────────────────────────────
test('who may federate', () => {
  assert.equal(isChildAccount({ isChild: true }), true);
  assert.equal(isChildAccount({ birthYear: 2015 }, 2026), true);
  assert.equal(isChildAccount({ birthYear: 2008 }, 2026), true, 'could still be 17');
  assert.equal(isChildAccount({ birthYear: 2007 }, 2026), false);
  assert.equal(isChildAccount({ accountType: 'STUDENT' }), true, 'student with unknown age');
  assert.equal(userEligibility({ displayName: 'x' }).eligible, true);
  assert.equal(userEligibility({ isPrivate: true }).eligible, false);
  assert.equal(userEligibility({ isEmployee: true }).eligible, false);
  const ch = orgEligibility({ orgType: 'CHURCH' });
  assert.equal(ch.eligible && ch.sensitiveOrg, true);
  assert.equal(orgEligibility({ orgType: 'BUSINESS', isPrivate: true }).eligible, false);
});

test('which posts federate', () => {
  const url = U.postPage('x');
  const base = { authorId: 'a', text: 'hi', isPublic: true, timestamp: NOW };
  assert.deepEqual(judgePost(base, url, NOW), { ok: true });
  for (const [extra, why] of [
    [{ isPublic: false }, 'not-public'], [{ audience: 'FOLLOWERS' }, 'audience'], [{ sourceCollection: 'circle_posts' }, 'private-collection'],
    [{ isToday: true }, 'ephemeral'], [{ repostOf: 'z' }, 'repost'], [{ targetUserId: 'b' }, 'wall-post'], [{ eduRole: 'STUDENT' }, 'school-community'],
    [{ orgDepartmentId: 'd' }, 'org-internal'],
  ] as const) assert.equal((judgePost({ ...base, ...extra }, url, NOW) as any).reason, why);
  assert.equal(judgePost({ ...base, sanctuaryGate: {} }, url, NOW).ok, false);
  assert.equal(judgePost({ ...base, exclusive: true }, url, NOW).ok, false);
  assert.equal(judgePost({ ...base, orgAudience: 'INTERNAL' }, url, NOW).ok, false);
  assert.equal(judgePost({ ...base, authorIsPrivate: true }, url, NOW).ok, false);
  assert.deepEqual(postActorRef({ authorId: 'a', authorIsOrg: true, authorOrgId: 'o' }), { kind: 'org', id: 'o' });
  assert.equal(isDomainBlocked('a.bad.example', new Set(['bad.example'])), true);
  assert.equal(isDomainBlocked('notbad.example', new Set(['bad.example'])), false);
});

// ── JSON-LD ───────────────────────────────────────────────────────────────────
test('Note + actor shapes', () => {
  assert.equal(textToHtml('a <b> & https://x.example/y.\n\nnext'), '<p>a &lt;b&gt; &amp; <a href="https://x.example/y" rel="nofollow noopener noreferrer" target="_blank">https://x.example/y</a>.</p><p>next</p>');
  assert.equal(htmlToText('<p>Hi <span class="h-card">@ada</span></p><p>bye &amp; <script>x</script></p>'), 'Hi @ada\n\nbye & x');
  const note: any = buildNote(BASE, { id: 'p9', authorId: 'a', text: 'Hey', isPublic: true, timestamp: NOW, contentLabels: ['MATURE_18'],
    media: [{ type: 'PHOTO', url: 'https://c.example/1.png', alt: 'alt' }, { type: 'VIDEO', url: '', muxPlaybackId: 'm' }], hashtags: ['music'] }, 'ada');
  assert.equal(note.id, U.note('p9'));
  assert.equal(note.attributedTo, U.actor('ada'));
  assert.equal(note.sensitive, true);
  assert.match(note.summary, /Mature/);
  assert.equal(note.attachment.length, 1);
  assert.equal(note.attachment[0].mediaType, 'image/png');
  assert.match(note.content, /Open on Plajah/, 'Mux-only video links back');
  assert.deepEqual(note.tag, [{ type: 'Hashtag', name: '#music' }]);
  const actor: any = buildActor(BASE, { handle: 'ada', kind: 'user', refId: 'uid1', name: 'Ada', publicKeyPem: 'PEM' });
  assert.equal(actor.type, 'Person');
  assert.equal(actor.url, U.userProfile('uid1'));
  assert.equal(actor.publicKey.id, `${U.actor('ada')}#main-key`);
  assert.deepEqual(parseWebfingerResource('acct:Ada@Plajah.test.example', BASE), { handle: 'ada', host: 'plajah.test.example' });
});

// ── identity switch ───────────────────────────────────────────────────────────
test('switching an identity on and off', async () => {
  const deps = makeDeps();
  await assert.rejects(setIdentityEnabled(deps, { kind: 'user', uid: 'kid' }, true, 'kiddo'), (e: any) => e.status === 403);
  await assert.rejects(setIdentityEnabled(deps, { kind: 'user', uid: 'priv' }, true, 'pat'), (e: any) => e.status === 403);
  await assert.rejects(setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, true, 'taken'), (e: any) => e.status === 409);
  await assert.rejects(setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, true, 'admin'), (e: any) => e.status === 409);
  const st = await setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, true, 'Ada');
  assert.equal(st.enabled, true);
  assert.equal(st.address, '@ada@plajah.test.example');
  const rec = await deps.store.getActor(actorKeyFor('user', 'adult'));
  assert.ok(rec?.publicKeyPem.includes('PUBLIC KEY'));
  assert.ok(!rec?.privateKeyEnc.includes('PRIVATE KEY'));
  assert.ok(await resolveLocalActor(deps, 'ada'));
  // org: only the owner/admin; church gets the notice
  await assert.rejects(setIdentityEnabled(deps, { kind: 'org', orgId: 'church1', uid: 'priv' }, true, 'grace'), (e: any) => e.status === 403);
  const org2 = await setIdentityEnabled(deps, { kind: 'org', orgId: 'church1', uid: 'adult' }, true, 'grace');
  assert.equal(org2.enabled, true);
  assert.ok(org2.notice);
  // off → not resolvable; handle frozen
  const off = await setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, false);
  assert.equal(off.enabled, false);
  assert.equal(off.handle, 'ada');
  assert.equal(await resolveLocalActor(deps, 'ada'), null);
  // becoming private later turns federation off without touching the switch
  await setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, true);
  deps.users.adult.isPrivate = true;
  assert.equal(await resolveLocalActor(deps, 'ada'), null);
  assert.equal((await identityStatus(deps, { kind: 'user', uid: 'adult' })).enabled, false);
});

test('org handle collision is a 409', async () => {
  const deps = makeDeps();
  await setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, true, 'ada');
  await assert.rejects(setIdentityEnabled(deps, { kind: 'org', orgId: 'church1', uid: 'adult' }, true, 'ada'), (e: any) => e.status === 409);
});

// ── inbox ─────────────────────────────────────────────────────────────────────
async function enabledDeps() {
  _clearActorCache();
  const deps = makeDeps();
  await setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, true, 'ada');
  return deps;
}

test('Follow → stored + signed Accept; Undo; blocklist; forged key', async () => {
  const deps = await enabledDeps();
  const follow = { '@context': 'https://www.w3.org/ns/activitystreams', id: 'https://social.remote.example/f/1', type: 'Follow', actor: REMOTE.id, object: U.actor('ada') };
  const req = signedPost(U.sharedInbox(), follow);
  const auth = await authenticateInbound(deps, req, follow);
  assert.equal(auth.ok, true);
  const out = await processActivity(deps, follow, (auth as any).actor);
  assert.equal(out.handled, 'follow-accepted');
  assert.equal(await deps.store.followerCount('u_adult'), 1);
  // the Accept went to alice's inbox, signed with ada's key
  const sent = deps.http.posts.at(-1)!;
  assert.equal(sent.url, REMOTE.inbox);
  const accept = JSON.parse(sent.body);
  assert.equal(accept.type, 'Accept');
  assert.equal(accept.object.id, follow.id);
  const adaPub = (await deps.store.getActor('u_adult'))!.publicKeyPem;
  const v = verifySignature({ method: 'POST', path: new URL(REMOTE.inbox).pathname, headers: sent.headers, rawBody: Buffer.from(sent.body), publicKeyPem: adaPub, now: NOW });
  assert.equal(v.ok, true);
  // duplicate delivery is idempotent
  assert.equal((await processActivity(deps, follow, (auth as any).actor)).handled, 'duplicate');

  // tampered body
  assert.equal((await authenticateInbound(deps, signedPost(U.sharedInbox(), follow, { tamper: true }), follow) as any).reason, 'digest-mismatch');
  // signed by someone else's key claiming alice's keyId
  _clearActorCache();
  assert.equal((await authenticateInbound(deps, signedPost(U.sharedInbox(), follow, { keys: rsa() }), follow) as any).reason, 'bad-signature');
  // keyId on another host
  assert.equal((await authenticateInbound(deps, signedPost(U.sharedInbox(), follow, { keyId: 'https://other.example/k#main-key' }), follow) as any).reason, 'key-host-mismatch');
  // blocked domain
  const bad = { ...follow, actor: 'https://bad.example/u/x' };
  assert.equal((await authenticateInbound(deps, signedPost(U.sharedInbox(), bad, { keyId: 'https://bad.example/u/x#main-key' }), bad) as any).status, 403);

  const undo = { id: 'https://social.remote.example/f/1/undo', type: 'Undo', actor: REMOTE.id, object: follow };
  assert.equal((await processActivity(deps, undo, (auth as any).actor)).handled, 'unfollowed');
  assert.equal(await deps.store.followerCount('u_adult'), 0);
});

test('replies, likes, boosts, deletes come back', async () => {
  const deps = await enabledDeps();
  const remote = ((await authenticateInbound(deps, signedPost(U.sharedInbox(), { type: 'Like', actor: REMOTE.id }), { type: 'Like', actor: REMOTE.id })) as any).actor;
  assert.ok(remote);
  const note = { id: 'https://social.remote.example/n/1', type: 'Note', attributedTo: REMOTE.id, inReplyTo: U.note('p1'), content: '<p>Nice <b>post</b> &amp; <script>alert(1)</script></p>', published: new Date(NOW - 10).toISOString() };
  const create = { id: 'https://social.remote.example/n/1/activity', type: 'Create', actor: REMOTE.id, object: note };
  assert.equal((await processActivity(deps, create, remote)).handled, 'reply-stored');
  const [reply] = await deps.store.listReplies('p1', 10);
  assert.equal(reply.text, 'Nice post & alert(1)');
  assert.equal(reply.authorHandle, '@alice@social.remote.example');
  assert.equal(reply.authorName, 'Alice R');

  // replies to posts that don't federate, or that closed replies, are dropped
  for (const [pid, why] of [['p2', 'not-a-reply-to-us'], ['p3', 'not-a-reply-to-us'], ['p4', 'replies-closed']] as const) {
    const c = { id: `https://social.remote.example/n/${pid}/a`, type: 'Create', actor: REMOTE.id, object: { ...note, id: `https://social.remote.example/n/${pid}`, inReplyTo: U.note(pid) } };
    assert.equal((await processActivity(deps, c, remote)).handled, why);
  }
  // can't post as someone else
  const spoof = { id: 'https://social.remote.example/n/2/a', type: 'Create', actor: REMOTE.id, object: { ...note, id: 'https://social.remote.example/n/2', attributedTo: 'https://social.remote.example/users/bob' } };
  assert.equal((await processActivity(deps, spoof, remote)).status, 403);

  await processActivity(deps, { id: 'https://social.remote.example/l/1', type: 'Like', actor: REMOTE.id, object: U.note('p1') }, remote);
  await processActivity(deps, { id: 'https://social.remote.example/l/2', type: 'Like', actor: REMOTE.id, object: U.note('p1') }, remote); // same person again
  await processActivity(deps, { id: 'https://social.remote.example/b/1', type: 'Announce', actor: REMOTE.id, object: U.note('p1') }, remote);
  assert.deepEqual(await deps.store.postCounts('p1'), { likes: 1, announces: 1, replies: 1 });
  await processActivity(deps, { id: 'https://social.remote.example/l/1/undo', type: 'Undo', actor: REMOTE.id, object: { type: 'Like', actor: REMOTE.id, object: U.note('p1') } }, remote);
  assert.equal((await deps.store.postCounts('p1')).likes, 0);

  assert.equal((await processActivity(deps, { id: 'https://social.remote.example/d/1', type: 'Delete', actor: REMOTE.id, object: { id: note.id, type: 'Tombstone' } }, remote)).handled, 'reply-deleted');
  assert.equal((await deps.store.listReplies('p1', 10)).length, 0);
  // activity ids must live on the sender's host
  assert.equal((await processActivity(deps, { id: 'https://elsewhere.example/x', type: 'Like', actor: REMOTE.id, object: U.note('p1') }, remote)).status, 400);
});

// ── delivery ──────────────────────────────────────────────────────────────────
test('delivery: fan-out, dedupe, backoff, delete', async () => {
  assert.deepEqual(inboxTargets([
    { actorKey: 'k', remoteActor: 'a', inbox: 'https://m.example/u/a/inbox', sharedInbox: 'https://m.example/inbox', domain: 'm.example', at: 0 },
    { actorKey: 'k', remoteActor: 'b', inbox: 'https://m.example/u/b/inbox', sharedInbox: 'https://m.example/inbox', domain: 'm.example', at: 0 },
    { actorKey: 'k', remoteActor: 'c', inbox: 'https://p.example/u/c/inbox', domain: 'p.example', at: 0 },
    { actorKey: 'k', remoteActor: 'd', inbox: 'https://x.bad.example/inbox', domain: 'x.bad.example', at: 0 },
    { actorKey: 'k', remoteActor: 'e', inbox: 'http://127.0.0.1/inbox', domain: '127.0.0.1', at: 0 },
  ], new Set(['bad.example'])), ['https://m.example/inbox', 'https://p.example/u/c/inbox']);
  assert.equal(nextAttemptAt(1, 0), 60_000);
  assert.equal(nextAttemptAt(MAX_ATTEMPTS, 0), null);
  assert.equal(classifyStatus(202), 'ok');
  assert.equal(classifyStatus(503), 'retry');
  assert.equal(classifyStatus(410), 'drop');

  const deps = await enabledDeps();
  assert.equal((await deliverPostToFollowers('p1', deps)).skipped, 'no-followers');
  await deps.store.addFollower({ actorKey: 'u_adult', remoteActor: REMOTE.id, inbox: REMOTE.inbox, sharedInbox: REMOTE.sharedInbox, domain: 'social.remote.example', at: NOW });
  assert.equal((await deliverPostToFollowers('p2', deps)).skipped, 'Private and members-only posts stay on Plajah.');
  deps.http.posts.length = 0;
  const r = await deliverPostToFollowers('p1', deps);
  assert.deepEqual(r, { sent: 1, queued: 0, dropped: 0 });
  const create = JSON.parse(deps.http.posts[0].body);
  assert.equal(deps.http.posts[0].url, REMOTE.sharedInbox);
  assert.equal(create.type, 'Create');
  assert.equal(create.object.content.includes('&lt;world&gt;'), true);
  assert.equal(create.object.attachment[0].name, 'a cat');

  // server down → queued → retried later
  deps.http.postStatus = 503;
  assert.deepEqual(await deliverDelete('p1', deps), { sent: 0, queued: 1, dropped: 0 });
  const dump = (deps.store as any)._dump();
  const [[, queued]] = [...dump.deliveries];
  assert.equal(JSON.parse(queued.activity).type, 'Delete');
  assert.deepEqual(await retryDueDeliveries(deps), { sent: 0, rescheduled: 0, dead: 0 }, 'not due yet');
  const later = { ...deps, now: () => NOW + 61_000 };
  deps.http.postStatus = 202;
  assert.deepEqual(await retryDueDeliveries(later), { sent: 1, rescheduled: 0, dead: 0 });
  assert.equal(dump.deliveries.size, 0);
  assert.equal((await deliverDelete('p3', deps)).skipped, 'never-federated');

  // switched off → nothing goes out
  await setIdentityEnabled(deps, { kind: 'user', uid: 'adult' }, false);
  assert.equal((await deliverPostToFollowers('p1', deps)).skipped, 'federation-off');
});

// ── routers over a real (loopback) HTTP server ───────────────────────────────
test('routes: webfinger, conneg, outbox, inbox, owner API', async () => {
  const deps = await enabledDeps();
  const app = express();
  app.use(createActivityPubRouter({ deps }));
  app.use('/api/activitypub', express.json(), createActivityPubOwnerRouter({ deps, verifyToken: async t => (t === 'adult-token' ? 'adult' : t === 'kid-token' ? 'kid' : null) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = (server.address() as AddressInfo).port;
  const L = `http://127.0.0.1:${port}`;
  try {
    let res = await fetch(`${L}/.well-known/webfinger?resource=acct:ada@plajah.test.example`);
    assert.equal(res.status, 200);
    const wf = await res.json() as any;
    assert.equal(wf.links[0].href, U.actor('ada'));
    assert.equal((await fetch(`${L}/.well-known/webfinger?resource=acct:nobody@plajah.test.example`)).status, 404);
    assert.equal((await fetch(`${L}/.well-known/webfinger?resource=acct:ada@other.example`)).status, 404);

    res = await fetch(`${L}/ap/users/ada`, { headers: { Accept: 'application/activity+json' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type')!, /activity\+json/);
    assert.equal(((await res.json()) as any).preferredUsername, 'ada');
    res = await fetch(`${L}/ap/users/ada`, { headers: { Accept: 'text/html' }, redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), U.userProfile('adult'));

    res = await fetch(`${L}/ap/users/ada/outbox?page=true`, { headers: { Accept: 'application/activity+json' } });
    const page = await res.json() as any;
    assert.deepEqual(page.orderedItems.map((a: any) => a.object.id), [U.note('p1'), U.note('p4')], 'members-only + locked posts left out');
    assert.equal((await fetch(`${L}/ap/posts/p2`, { headers: { Accept: 'application/activity+json' } })).status, 404);
    assert.equal((await fetch(`${L}/ap/posts/p1`, { headers: { Accept: 'application/activity+json' } })).status, 200);

    const ni = await (await fetch(`${L}/nodeinfo/2.1`)).json() as any;
    assert.equal(ni.protocols[0], 'activitypub');
    assert.equal(ni.usage.users.total, 1);

    // signed Follow through the real inbox route (host the client signed = the public host)
    const follow = { id: 'https://social.remote.example/f/9', type: 'Follow', actor: REMOTE.id, object: U.actor('ada') };
    const body = JSON.stringify(follow);
    const headers = signRequest({ method: 'POST', url: `${BASE}/ap/users/ada/inbox`, body, keyId: REMOTE.keyId, privateKeyPem: REMOTE_KEYS.priv, now: new Date(NOW) });
    const { host: _h, ...rest } = headers;
    res = await fetch(`${L}/ap/users/ada/inbox`, { method: 'POST', body, headers: { ...rest, 'x-forwarded-host': 'plajah.test.example' } });
    assert.equal(res.status, 202);
    assert.equal(await deps.store.followerCount('u_adult'), 1);
    res = await fetch(`${L}/ap/inbox`, { method: 'POST', body, headers: { 'content-type': 'application/activity+json' } });
    assert.equal(res.status, 401, 'unsigned is refused');

    // owner API
    assert.equal((await fetch(`${L}/api/activitypub/me`)).status, 401);
    const me = await (await fetch(`${L}/api/activitypub/me`, { headers: { Authorization: 'Bearer adult-token' } })).json() as any;
    assert.equal(me.enabled, true);
    assert.equal(me.followerCount, 1);
    assert.ok(me.deletionNotice);
    res = await fetch(`${L}/api/activitypub/me`, { method: 'POST', headers: { Authorization: 'Bearer kid-token', 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, handle: 'kid' }) });
    assert.equal(res.status, 403);
    res = await fetch(`${L}/api/activitypub/replies/p1`, { headers: { Authorization: 'Bearer adult-token' } });
    assert.deepEqual(((await res.json()) as any).counts, { likes: 0, announces: 0, replies: 0 });
  } finally {
    server.close();
  }
});
