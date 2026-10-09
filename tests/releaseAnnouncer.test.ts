// Release announcements: exactly-once, resumable fan-out for big audiences, serial chapters, bounded look-back, eligibility,
// failure isolation. In-memory IO, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sweepReleaseAnnouncements, renderAnnouncement, defaultAnnouncement, RELEASE_KINDS, wantsRelease, chapterDrops, nextChapterReleaseAt,
  type ReleaseIo, type ReleaseDoc, type ClaimDoc, type FollowerRow,
} from '../services/releases/releaseAnnouncer';

const NOW = 1_800_000_000_000;
const H = 3_600_000;

interface World {
  io: ReleaseIo; claims: Map<string, any>; feed: Map<string, any>; notes: Map<string, any>; pushes: any[]; patches: any[];
  seed: Record<string, ReleaseDoc[]>;
}

function world(seed: Record<string, ReleaseDoc[]>, followers: Record<string, FollowerRow[]> = {}, over: Partial<ReleaseIo> = {}): World {
  const claims = new Map<string, any>(); const feed = new Map<string, any>(); const notes = new Map<string, any>();
  const pushes: any[] = []; const patches: any[] = [];
  const io: ReleaseIo = {
    now: () => NOW,
    queryByTime: async (col, field, from, to) => (seed[col] || []).filter(d => { const t = Number(d.data[field]); return t >= from && t < to; }),
    claim: async (id, data) => { if (claims.has(id)) return 'exists'; claims.set(id, { ...data }); return 'created'; },
    finish: async (id, patch) => { Object.assign(claims.get(id) || {}, patch); },
    listSending: async () => [...claims.entries()].filter(([, v]) => v.status === 'sending').map(([id, data]) => ({ id, data: data as ClaimDoc })),
    profile: async uid => ({ displayName: `User ${uid}`, photoURL: '' }),
    followersPage: async (uid, after, limit) => (followers[uid] || []).slice().sort((a, b) => a.followerId.localeCompare(b.followerId)).filter(f => after === null || f.followerId > after).slice(0, limit),
    postFeed: async (id, item) => { if (!feed.has(id)) feed.set(id, item); },
    notifyOnce: async (id, n) => { if (notes.has(id)) return 'exists'; notes.set(id, n); return 'created'; },
    push: async (uid, m) => { pushes.push({ uid, ...m }); },
    patchContent: async (collection, id, patch) => { patches.push({ collection, id, patch }); },
    ...over,
  };
  return { io, claims, feed, notes, pushes, patches, seed };
}

const album = (id: string, extra: Record<string, any> = {}): ReleaseDoc => ({ id, data: { ownerId: 'ann', type: 'BOOK', title: 'Salt', isScheduled: true, releaseDate: NOW - H, isPublic: true, ...extra } });
const fol = (n: number, level?: string): FollowerRow[] => Array.from({ length: n }, (_, i) => ({ followerId: `f${String(i).padStart(5, '0')}`, notifyLevel: level }));

test('announces a book release once: feed post + follower notifications + push', async () => {
  const w = world({ albums: [album('b1')] }, { ann: [{ followerId: 'f1' }, { followerId: 'f2', notifyLevel: 'HIGHLIGHTS' }, { followerId: 'f3', notifyLevel: 'NONE' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 1);
  assert.equal(w.feed.size, 1);
  const post = [...w.feed.values()][0];
  assert.equal(post.type, 'BOOK');
  assert.match(post.content, /User ann just released a new book: Salt/);
  assert.deepEqual([...w.notes.values()].map(n => n.userId).sort(), ['f1', 'f2']);        // HIGHLIGHTS still gets a release; NONE opts out
  assert.equal(w.pushes.length, 2);
  assert.equal(w.claims.get('album_b1').status, 'announced');
  assert.equal(w.claims.get('album_b1').notified, 2);
});

test('exactly once: a second sweep announces nothing more', async () => {
  const w = world({ albums: [album('b1')] }, { ann: [{ followerId: 'f1' }] });
  await sweepReleaseAnnouncements(w.io);
  const again = await sweepReleaseAnnouncements(w.io);
  assert.equal(again.announced, 0);
  assert.equal(w.feed.size, 1); assert.equal(w.notes.size, 1); assert.equal(w.pushes.length, 1);
});

test('not yet released, outside the look-back window, or not a scheduled release: never announced', async () => {
  const w = world({ albums: [album('future', { releaseDate: NOW + H }), album('ancient', { releaseDate: NOW - 200 * H }), album('plain', { isScheduled: false })] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 0); assert.equal(w.feed.size, 0);
});

test('private, draft and unpublished items are skipped', async () => {
  const w = world({ albums: [album('p', { isPrivate: true }), album('d', { isDraft: true }), album('u', { isPublic: false })] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 0);
  assert.ok(r.items.every(i => i.status === 'skipped'));
});

test('articles use embargoUntil + SCHEDULED; retracted ones are skipped', async () => {
  const art = (id: string, extra: Record<string, any> = {}): ReleaseDoc => ({ id, data: { authorId: 'jo', title: 'The Light', status: 'SCHEDULED', isPublic: true, embargoUntil: NOW - H, ...extra } });
  const w = world({ articles: [art('a1'), art('a2', { status: 'RETRACTED' }), art('a3', { status: 'PUBLISHED' })] }, { jo: [{ followerId: 'r1' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 1);
  assert.equal([...w.feed.values()][0].type, 'NEWS');
  assert.equal([...w.notes.values()][0].link, 'READ');
});

test('videos are covered too', async () => {
  const w = world({ videos: [{ id: 'v1', data: { ownerId: 'vic', title: 'Clip', isScheduled: true, releaseDate: NOW - 5 * 60_000 } }] }, { vic: [{ followerId: 'f' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 1);
  assert.equal([...w.feed.values()][0].type, 'VIDEO');
});

// ── big audiences ───────────────────────────────────────────────────────────────────────────────────────────────────
test('big audience: no cap. 1,000 followers are all notified, in pages, with progress saved after every page', async () => {
  const w = world({ albums: [album('b1')] }, { ann: fol(1000) });
  const finishes: any[] = [];
  const spy = { ...w.io, finish: async (id: string, p: Record<string, unknown>) => { finishes.push(p); return w.io.finish(id, p); } };
  const r = await sweepReleaseAnnouncements(spy, { pageSize: 100 });
  assert.equal(r.announced, 1);
  assert.equal(w.notes.size, 1000);
  assert.ok(finishes.filter(p => p.cursor).length >= 10);                      // a cursor checkpoint per page
  assert.equal(w.claims.get('album_b1').notified, 1000);
});

test('a run that hits its time budget pauses; the next run resumes from the cursor and finishes, with no duplicates', async () => {
  const w = world({ albums: [album('b1')] }, { ann: fol(600) });
  // First run: budget 0 after the first page => paused mid-way.
  let pages = 0;
  const slow: ReleaseIo = { ...w.io, followersPage: async (...a) => { pages++; return w.io.followersPage(...a); } };
  const real = Date.now; let t = real();
  const clock = () => t;
  (Date as any).now = () => { const v = clock(); if (pages >= 2) t += 100_000; return v; };   // jump past the budget after 2 pages
  try { var first = await sweepReleaseAnnouncements(slow, { pageSize: 100, budgetMs: 40_000 }); } finally { (Date as any).now = real; }
  assert.equal(first.announced, 0);
  assert.equal(first.pending, 1);
  assert.equal(w.claims.get('album_b1').status, 'sending');
  const partial = w.notes.size;
  assert.ok(partial > 0 && partial < 600, `expected a partial send, got ${partial}`);
  assert.ok(w.claims.get('album_b1').cursor);

  const second = await sweepReleaseAnnouncements(w.io, { pageSize: 100 });
  assert.equal(second.announced, 1); assert.equal(second.resumed, 1);
  assert.equal(w.notes.size, 600);                                             // everyone exactly once
  assert.equal(w.pushes.length, 600);                                          // push only for newly created notifications
  assert.equal(w.feed.size, 1);                                                // feed post not repeated on resume
  assert.equal(w.claims.get('album_b1').status, 'announced');
});

test('retry safety: re-running a page after a crash never double-notifies or double-pushes', async () => {
  const w = world({ albums: [album('b1')] }, { ann: fol(50) });
  // Pre-seed: 20 notifications already created but the cursor was never saved (crash between send and checkpoint).
  w.claims.set('album_b1', { kind: 'album', contentId: 'b1', ownerId: 'ann', releaseAt: NOW - H, status: 'sending', text: 'x', name: 'User ann', photo: '', link: 'ALBUM', targetId: 'b1', claimedAt: NOW });
  for (const f of fol(20)) w.notes.set(`rel_album_b1_${f.followerId}`, { userId: f.followerId });
  const r = await sweepReleaseAnnouncements(w.io, { pageSize: 50 });
  assert.equal(r.announced, 1);
  assert.equal(w.notes.size, 50);
  assert.equal(w.pushes.length, 30);                                           // only the 30 new ones were pushed
});

test('transient failure keeps the claim sending and retries; becomes failed only after max attempts', async () => {
  let fail = true;
  const w = world({ albums: [album('b1')] }, { ann: fol(5) }, { followersPage: async () => { if (fail) throw new Error('index missing'); return fol(5); } });
  const r1 = await sweepReleaseAnnouncements(w.io, { maxAttempts: 3 });
  assert.equal(r1.pending, 1); assert.equal(w.claims.get('album_b1').status, 'sending'); assert.equal(w.claims.get('album_b1').attempts, 1);
  await sweepReleaseAnnouncements(w.io, { maxAttempts: 3 });
  const r3 = await sweepReleaseAnnouncements(w.io, { maxAttempts: 3 });
  assert.equal(r3.failed, 1); assert.equal(w.claims.get('album_b1').status, 'failed');
  assert.match(w.claims.get('album_b1').error, /index missing/);
  fail = false;                                                                // a failed claim is final: it is not silently re-announced
  const r4 = await sweepReleaseAnnouncements(w.io, { maxAttempts: 3 });
  assert.equal(r4.announced, 0);
});

test('a follower-query error is never mistaken for "no followers" (the item is not marked announced)', async () => {
  const w = world({ albums: [album('b1')] }, {}, { followersPage: async () => { throw new Error('boom'); } });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 0);
  assert.notEqual(w.claims.get('album_b1').status, 'announced');
});

// ── serial chapters ─────────────────────────────────────────────────────────────────────────────────────────────────
const serial = (extra: Record<string, any> = {}): ReleaseDoc => ({
  id: 'sb', data: {
    ownerId: 'ann', type: 'BOOK', title: 'Salt', isScheduled: true, isPublic: true,
    nextChapterReleaseAt: NOW - H,
    chapterSchedule: [
      { chapterId: 'c1', title: 'The Tide', releaseAt: NOW - 8 * 24 * H, index: 0 },
      { chapterId: 'c2', title: 'The Wreck', releaseAt: NOW - H, index: 1 },
      { chapterId: 'c3', title: 'The Light', releaseAt: NOW + 6 * 24 * H, index: 2 },
    ], ...extra,
  },
});

test('serial book: the chapter that just dropped is announced, then the cursor advances to the next future drop', async () => {
  const w = world({ albums: [serial()] }, { ann: [{ followerId: 'f1' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 1);
  const post = [...w.feed.values()][0];
  assert.equal(post.content, 'User ann just released a new chapter: The Wreck of Salt');
  assert.equal(post.type, 'BOOK');
  assert.equal(w.claims.has('chapter_sb_c2'), true);
  assert.deepEqual(w.patches, [{ collection: 'albums', id: 'sb', patch: { nextChapterReleaseAt: NOW + 6 * 24 * H } }]);
  const again = await sweepReleaseAnnouncements(w.io);                         // same doc re-found (cursor patched only in the fake store): still once
  assert.equal(again.announced, 0); assert.equal(w.feed.size, 1);
});

test('serial book: several chapters due at once announce only the newest (no spam)', async () => {
  const d = serial(); d.data.chapterSchedule = [
    { chapterId: 'c1', releaseAt: NOW - 3 * H, index: 0 }, { chapterId: 'c2', releaseAt: NOW - 2 * H, index: 1 }, { chapterId: 'c3', releaseAt: NOW - H, index: 2 },
  ]; d.data.nextChapterReleaseAt = NOW - 3 * H;
  const w = world({ albums: [d] }, { ann: [{ followerId: 'f1' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 1);
  assert.match([...w.feed.values()][0].content, /Chapter 3 of Salt/);
  assert.equal(w.patches[0].patch.nextChapterReleaseAt, null);                 // nothing left to release
});

test('serial book: opting out announces nothing but still advances the cursor', async () => {
  const w = world({ albums: [serial({ releaseAnnouncement: { enabled: false } })] }, { ann: [{ followerId: 'f1' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 0); assert.equal(w.feed.size, 0); assert.equal(w.claims.size, 0);
  assert.equal(w.patches.length, 1);
});

test('a serial book is never announced as a whole-book release too', async () => {
  const d = serial(); d.data.releaseDate = NOW - H;                            // has both fields: only the chapter kind may claim it
  const w = world({ albums: [d] }, { ann: [{ followerId: 'f1' }] });
  await sweepReleaseAnnouncements(w.io);
  assert.equal(w.claims.has('album_sb'), false);
});

test('chapter helpers: sorted, invalid rows dropped, next drop strictly in the future', () => {
  const drops = chapterDrops({ chapterSchedule: [{ chapterId: 'b', releaseAt: 20 }, { chapterId: '', releaseAt: 5 }, { chapterId: 'a', releaseAt: 10 }, { chapterId: 'z', releaseAt: 0 }] });
  assert.deepEqual(drops.map(d => d.chapterId), ['a', 'b']);
  assert.equal(nextChapterReleaseAt({ chapterSchedule: [{ chapterId: 'a', releaseAt: 10 }, { chapterId: 'b', releaseAt: 20 }] }, 10), 20);
  assert.equal(nextChapterReleaseAt({ chapterSchedule: [{ chapterId: 'a', releaseAt: 10 }] }, 10), null);
  assert.equal(nextChapterReleaseAt({}, 10), null);
});

// ── isolation, wording, registry ───────────────────────────────────────────────────────────────────────────────────
test('one failing item does not block the rest; a failed feed post is final and not retried', async () => {
  let n = 0;
  const w = world({ albums: [album('bad'), album('good')] }, { ann: fol(2) }, { postFeed: async (id, item) => { if (++n === 1) throw new Error('feed down'); w2.set(id, item); } });
  const w2 = new Map<string, any>();
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.failed, 1); assert.equal(r.announced, 1);
  assert.equal(w.claims.get('album_bad').status, 'failed');
  assert.equal(w.notes.size, 2);                                               // 'good' notified; 'bad' sent nothing (no feed post => no announcement)
});

test('a failed query for one kind does not stop the others', async () => {
  const w = world({}, { vic: [{ followerId: 'f' }] }, {
    queryByTime: async (col) => { if (col === 'albums') throw new Error('index missing'); if (col === 'videos') return [{ id: 'v1', data: { ownerId: 'vic', title: 'Clip', isScheduled: true, releaseDate: NOW - H } }]; return []; },
  });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 1); assert.ok(r.failed >= 1);
});

test('owner is never notified about their own release; duplicate follower rows collapse', async () => {
  const w = world({ albums: [album('b1')] }, { ann: [{ followerId: 'ann' }, { followerId: 'f1' }, { followerId: 'f1' }, { followerId: 'f2' }] });
  await sweepReleaseAnnouncements(w.io);
  assert.deepEqual([...w.notes.values()].map(n => n.userId).sort(), ['f1', 'f2']);
});

test('creator-customised announcement is used (with placeholders); default wording otherwise', async () => {
  const w = world({ albums: [album('b1', { releaseAnnouncement: { enabled: true, message: 'It is finally here. {title} is out now!' } })] }, { ann: [{ followerId: 'f1' }] });
  await sweepReleaseAnnouncements(w.io);
  assert.equal([...w.feed.values()][0].content, 'It is finally here. Salt is out now!');
  assert.equal([...w.notes.values()][0].message, 'It is finally here. Salt is out now!');
  assert.equal(renderAnnouncement(undefined, { name: 'Ann', noun: 'book', title: 'Salt' }), defaultAnnouncement('Ann', 'book', 'Salt'));
  assert.equal(renderAnnouncement({ message: '   ' }, { name: 'Ann', noun: 'book', title: 'Salt' }), 'Ann just released a new book: Salt');
});

test('custom message is sanitised and capped', () => {
  const t = renderAnnouncement({ message: 'x'.repeat(500) + String.fromCharCode(7, 10) }, { name: 'A', noun: 'book', title: 'T' });
  assert.equal(t.length, 280);
  assert.equal(renderAnnouncement({ message: 'a' + String.fromCharCode(0) + 'b' + String.fromCharCode(10) + 'c' }, { name: 'A', noun: 'b', title: 'T' }), 'a b c');
});

test('creator can turn the announcement off: nothing posted, nothing notified, nothing claimed', async () => {
  const w = world({ albums: [album('b1', { releaseAnnouncement: { enabled: false } })] }, { ann: [{ followerId: 'f1' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 0); assert.equal(w.feed.size, 0); assert.equal(w.notes.size, 0); assert.equal(w.claims.size, 0);
});

test('registry: every kind has a distinct id, a collection and a link', () => {
  const ids = RELEASE_KINDS.map(k => k.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const k of RELEASE_KINDS) { assert.ok(k.collection && k.link); }
  assert.deepEqual(ids.sort(), ['album', 'article', 'chapter', 'video']);
  assert.equal(wantsRelease({ followerId: 'x', notifyLevel: 'NONE' }), false);
});

test('premieres are never announced by the release sweep (they share isScheduled/releaseDate for their start time)', async () => {
  const w = world({ videos: [{ id: 'pm', data: { ownerId: 'vic', title: 'Premiere night', isScheduled: true, isPremiere: true, releaseDate: NOW - H } }] }, { vic: [{ followerId: 'f' }] });
  const r = await sweepReleaseAnnouncements(w.io);
  assert.equal(r.announced, 0); assert.equal(w.feed.size, 0); assert.equal(w.claims.size, 0);
});
