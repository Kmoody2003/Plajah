// releaseAnnouncer — SERVER-ONLY. Announces creator content at the moment its scheduled release time arrives.
//
// Visibility of scheduled content is already exact without any job: every reader compares releaseDate / embargoUntil to the
// clock (albums, videos, books, movies, articles). What read-time comparison CANNOT do is *announce* a release, because nothing
// runs when the clock passes. This sweep is that missing event: it finds items whose time passed inside a short look-back
// window and, exactly once each, (1) posts to the creator's feed, (2) notifies followers in-app, (3) pushes to their devices.
//
// Exactly-once, at three levels:
//   * a `releaseAnnouncements/{key}` claim doc is created create-if-absent before anything is sent (one announcer per item);
//   * the feed post has a deterministic id (`rel_<claimKey>`), so it can never be posted twice;
//   * every follower notification has a deterministic id (`rel_<claimKey>_<followerId>`) and push is sent only when that create
//     succeeded, so re-sending a page after a crash or a retry can never double-notify anyone.
//
// Big audiences: fan-out is RESUMABLE. Followers are read in pages ordered by followerId; after each page the claim doc stores
// the last followerId reached (`cursor`) and stays `sending`. A run that hits its time budget just stops; the next run resumes
// from the cursor. A 100k-follower creator therefore takes several runs instead of being capped or timing out. Transient errors
// leave the claim `sending` (retried next run, safe because of the deterministic ids) and become `failed` only after MAX_ATTEMPTS.
//
// Chapters: a serial book carries `chapterSchedule: [{chapterId,title,releaseAt}]` and a denormalised `nextChapterReleaseAt`
// (earliest upcoming drop). Each due chapter is announced; if several are due at once only the latest is announced (no spam) and
// the cursor then advances to the next future drop.
//
// Lateness: the announcement lands within one scheduler interval of the release time (the content itself is visible on time).
// Look-back is bounded (default 72h) ON PURPOSE: the first run on a platform with old scheduled content must never announce
// ancient items, and a creator would not want a three-week-old release announced as if it were new.
//
// Adding a content type = add one entry to RELEASE_KINDS. The IO is injected (ReleaseIo) so this runs unchanged under test.

export interface ReleaseDoc { id: string; data: Record<string, any> }

/** One announceable thing found on a content doc (usually the doc itself; a serial book yields one per due chapter). */
export interface ReleaseItem {
  /** Unique within the kind; becomes part of the claim id. */
  key: string;
  title: string;
  noun: string;
  releaseAt: number;
  feedExtras?: Record<string, unknown>;
}

export interface ReleaseKind {
  id: string;
  collection: string;
  /** Field holding the (next) release time in epoch ms; this is what the sweep queries on. */
  timeField: 'releaseDate' | 'embargoUntil' | 'nextChapterReleaseAt';
  /** The doc is a *scheduled* release (not just a doc that happens to carry a date). */
  scheduled: (d: Record<string, any>) => boolean;
  /** Public and finished: never announce private, draft or retracted items. */
  eligible: (d: Record<string, any>) => boolean;
  owner: (d: Record<string, any>) => string;
  title: (d: Record<string, any>) => string;
  cover: (d: Record<string, any>) => string;
  /** Plain noun for the message: "new book", "new video". */
  noun: (d: Record<string, any>) => string;
  feedType: (d: Record<string, any>) => 'SONG' | 'VIDEO' | 'BOOK' | 'NEWS';
  /** AppNotification.link value the client already understands for this content. */
  link: string;
  /** Extra fields for the feed item so the card opens the right thing. */
  feedExtras: (id: string, d: Record<string, any>) => Record<string, unknown>;
  /** Items due in [from, to). Default: the doc itself, keyed by its id. */
  items?: (id: string, d: Record<string, any>, from: number, to: number) => ReleaseItem[];
  /** After a doc's items were handled: patch for the CONTENT doc (e.g. advance the next-chapter cursor). */
  afterHandled?: (d: Record<string, any>, now: number) => Record<string, unknown> | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const notPrivate = (d: Record<string, any>) => d.isPrivate !== true && d.isDraft !== true && d.isPublic !== false;
const albumOwner = (d: Record<string, any>) => str(d.ownerId) || str(d.ownerUid) || str(d.uid) || str(d.creatorUid);

export interface ChapterDrop { chapterId: string; title?: string; releaseAt: number; index?: number }
export const chapterDrops = (d: Record<string, any>): ChapterDrop[] =>
  (Array.isArray(d.chapterSchedule) ? d.chapterSchedule : [])
    .map((c: any) => ({ chapterId: str(c?.chapterId), title: str(c?.title), releaseAt: num(c?.releaseAt), index: typeof c?.index === 'number' ? c.index : undefined }))
    .filter((c: ChapterDrop) => c.chapterId && c.releaseAt > 0)
    .sort((a: ChapterDrop, b: ChapterDrop) => a.releaseAt - b.releaseAt);

/** Earliest drop strictly after `now`, or null when none remain. Written to `nextChapterReleaseAt` so the sweep can query it. */
export const nextChapterReleaseAt = (d: Record<string, any>, now: number): number | null => {
  const next = chapterDrops(d).find(c => c.releaseAt > now);
  return next ? next.releaseAt : null;
};

export const RELEASE_KINDS: ReleaseKind[] = [
  {
    id: 'album', collection: 'albums', timeField: 'releaseDate',
    scheduled: d => d.isScheduled === true && !Array.isArray(d.chapterSchedule), eligible: notPrivate, owner: albumOwner,
    title: d => str(d.title) || 'Untitled', cover: d => str(d.coverImage) || str(d.coverThumb),
    noun: d => ({ BOOK: 'book', MOVIE: 'movie', VIDEO: 'video', MUSIC: 'release' } as Record<string, string>)[str(d.type)] || 'project',
    feedType: d => (str(d.type) === 'BOOK' ? 'BOOK' : str(d.type) === 'VIDEO' || str(d.type) === 'MOVIE' ? 'VIDEO' : 'SONG'),
    link: 'ALBUM',
    feedExtras: (id, d) => ({ albumId: id, songTitle: str(d.tracks?.[0]?.title) || str(d.title) || 'Untitled', songUrl: str(d.tracks?.[0]?.url), shareCount: 0 }),
  },
  {
    // Serial fiction: one announcement per chapter drop (components/SerialScheduler.tsx writes chapterSchedule + nextChapterReleaseAt).
    id: 'chapter', collection: 'albums', timeField: 'nextChapterReleaseAt',
    scheduled: d => chapterDrops(d).length > 0, eligible: notPrivate, owner: albumOwner,
    title: d => str(d.title) || 'Untitled', cover: d => str(d.coverImage) || str(d.coverThumb),
    noun: () => 'chapter', feedType: () => 'BOOK', link: 'ALBUM',
    feedExtras: id => ({ albumId: id, shareCount: 0 }),
    items: (id, d, from, to) => {
      const due = chapterDrops(d).filter(c => c.releaseAt >= from && c.releaseAt < to);
      const latest = due[due.length - 1];                    // several due at once => announce only the newest
      if (!latest) return [];
      const label = latest.title || (latest.index !== undefined ? `Chapter ${latest.index + 1}` : 'a new chapter');
      return [{ key: `${id}_${latest.chapterId}`, title: `${label} of ${str(d.title) || 'Untitled'}`, noun: 'chapter', releaseAt: latest.releaseAt, feedExtras: { albumId: id, shareCount: 0 } }];
    },
    afterHandled: (d, now) => ({ nextChapterReleaseAt: nextChapterReleaseAt(d, now) }),
  },
  {
    id: 'video', collection: 'videos', timeField: 'releaseDate',
    // Premieres reuse isScheduled + releaseDate for their START time and are announced by the premiere flow itself: never here.
    scheduled: d => d.isScheduled === true && d.isPremiere !== true, eligible: notPrivate,
    owner: d => str(d.ownerId) || str(d.uploaderId) || str(d.uid),
    title: d => str(d.title) || 'Untitled', cover: d => str(d.thumbnailUrl),
    noun: () => 'video', feedType: () => 'VIDEO', link: 'FEED',
    feedExtras: (id, d) => ({ videoId: id, videoUrl: str(d.videoUrl) || undefined, shareCount: 0 }),
  },
  {
    // Article embargo (services/journalist/embargo.ts): SCHEDULED until the time passes.
    id: 'article', collection: 'articles', timeField: 'embargoUntil',
    scheduled: d => d.status === 'SCHEDULED' || d.isScheduled === true,
    eligible: d => d.isPublic !== false && d.status !== 'DRAFT' && d.status !== 'RETRACTED',
    owner: d => str(d.authorId),
    title: d => str(d.title) || 'Untitled', cover: d => str(d.coverImage) || str(d.imageUrl),
    noun: () => 'article', feedType: () => 'NEWS', link: 'READ',
    feedExtras: id => ({ articleId: id }),
  },
];

/** What the creator chose in the release workflow, stored on the content doc as `releaseAnnouncement`. Default = announce, default wording. */
export interface ReleaseAnnouncementChoice { enabled?: boolean; message?: string }

export const MAX_ANNOUNCE_CHARS = 280;
export const defaultAnnouncement = (name: string, noun: string, title: string) => `${name} just released a new ${noun}: ${title}`;

/** Creator wording -> final post text. Placeholders {title} {name} {type}; control chars stripped; capped. Empty/invalid => default. */
export function renderAnnouncement(choice: ReleaseAnnouncementChoice | undefined | null, ctx: { name: string; noun: string; title: string }): string {
  const raw = typeof choice?.message === 'string' ? choice.message.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!raw) return defaultAnnouncement(ctx.name, ctx.noun, ctx.title);
  return raw.replace(/\{title\}/gi, ctx.title).replace(/\{name\}/gi, ctx.name).replace(/\{type\}/gi, ctx.noun).slice(0, MAX_ANNOUNCE_CHARS);
}

export interface FollowerRow { followerId: string; notifyLevel?: string }

/** The claim doc (`releaseAnnouncements/{key}`): everything needed to resume a fan-out without re-reading the content. */
export interface ClaimDoc {
  kind: string; contentId: string; ownerId: string; releaseAt: number;
  status: 'sending' | 'announced' | 'failed';
  text: string; name: string; photo: string; link: string; targetId: string;
  cursor?: string; notified?: number; attempts?: number; error?: string; claimedAt: number;
}

export interface ReleaseIo {
  now: () => number;
  /** Docs of `collection` whose `field` is in [fromMs, toMs). One range field, so no composite index. */
  queryByTime: (collection: string, field: string, fromMs: number, toMs: number, limit: number) => Promise<ReleaseDoc[]>;
  /** Create-if-absent. 'exists' = somebody already announced this one. */
  claim: (id: string, data: Record<string, unknown>) => Promise<'created' | 'exists' | 'error'>;
  finish: (id: string, patch: Record<string, unknown>) => Promise<void>;
  /** Claims still `sending` (a previous run ran out of time or hit a transient error). */
  listSending: (limit: number) => Promise<Array<{ id: string; data: ClaimDoc }>>;
  profile: (uid: string) => Promise<{ displayName?: string; photoURL?: string } | null>;
  /** Followers of `uid` ordered by followerId, strictly after `afterFollowerId`. MUST throw on query failure (never return [] for an error). */
  followersPage: (uid: string, afterFollowerId: string | null, limit: number) => Promise<FollowerRow[]>;
  /** Create-if-absent with a deterministic id (the same id twice is a no-op). Throws on failure. */
  postFeed: (id: string, item: Record<string, unknown>) => Promise<void>;
  notifyOnce: (id: string, n: Record<string, unknown>) => Promise<'created' | 'exists'>;
  /** Optional: push to a user's devices. Failures never fail the announcement. */
  push?: (uid: string, msg: { title: string; body: string; link: string; targetId: string }) => Promise<void>;
  /** Patch the CONTENT doc (used to advance a serial book's next-chapter cursor). */
  patchContent: (collection: string, id: string, patch: Record<string, unknown>) => Promise<void>;
}

export interface SweepOptions {
  lookbackMs?: number;       // default 72h
  maxPerKind?: number;       // default 50 content docs per kind per run
  budgetMs?: number;         // stop starting new work after this long (default 40s); unfinished fan-outs resume next run
  fanoutConcurrency?: number; // parallel recipient writes (default 25)
  pageSize?: number;         // followers read per page (default 200)
  maxAttempts?: number;      // transient failures tolerated per item before 'failed' (default 5)
  kinds?: ReleaseKind[];
}

export interface SweepItemResult { kind: string; id: string; status: 'announced' | 'sending' | 'skipped' | 'failed'; reason?: string }
export interface SweepResult { at: number; checked: number; announced: number; resumed: number; pending: number; failed: number; items: SweepItemResult[] }

/** Which followers get a release notice: a release always counts as a "highlight", so only an explicit NONE opts out. */
export const wantsRelease = (f: FollowerRow): boolean => f.notifyLevel !== 'NONE' && !!f.followerId;

export async function sweepReleaseAnnouncements(io: ReleaseIo, opts: SweepOptions = {}): Promise<SweepResult> {
  const now = io.now();
  const lookback = opts.lookbackMs ?? 72 * 3_600_000;
  const maxPerKind = opts.maxPerKind ?? 50;
  const budgetMs = opts.budgetMs ?? 40_000;
  const conc = Math.max(1, opts.fanoutConcurrency ?? 25);
  const pageSize = Math.max(1, opts.pageSize ?? 200);
  const maxAttempts = opts.maxAttempts ?? 5;
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > budgetMs;
  const out: SweepResult = { at: now, checked: 0, announced: 0, resumed: 0, pending: 0, failed: 0, items: [] };
  const kinds = opts.kinds ?? RELEASE_KINDS;

  /** Send (or keep sending) a claim's notifications page by page. */
  async function fanOut(claimId: string, c: ClaimDoc): Promise<'done' | 'paused'> {
    let cursor: string | null = c.cursor ?? null;
    let notified = c.notified ?? 0;
    for (;;) {
      if (overBudget()) return 'paused';
      const page = await io.followersPage(c.ownerId, cursor, pageSize);
      if (page.length === 0) { await io.finish(claimId, { status: 'announced', announcedAt: io.now(), notified }); return 'done'; }
      const lastId = page[page.length - 1].followerId;
      const seen = new Set<string>([c.ownerId]);
      const targets = page.filter(wantsRelease).filter(f => (seen.has(f.followerId) ? false : (seen.add(f.followerId), true)));
      for (let i = 0; i < targets.length; i += conc) {
        await Promise.all(targets.slice(i, i + conc).map(async f => {
          try {
            const r = await io.notifyOnce(`rel_${claimId}_${f.followerId}`, { userId: f.followerId, senderId: c.ownerId, senderName: c.name, senderPhoto: c.photo, type: 'CONTENT', title: 'New release', message: c.text, link: c.link, targetId: c.targetId, isRead: false, timestamp: c.claimedAt });
            if (r === 'created') {
              notified++;
              if (io.push) await io.push(f.followerId, { title: 'New release', body: c.text.slice(0, 180), link: c.link, targetId: c.targetId }).catch(() => {});
            }
          } catch { /* one bad recipient never stops the rest */ }
        }));
      }
      cursor = lastId;
      await io.finish(claimId, { cursor, notified });     // progress saved after EVERY page: a crash loses at most one page, re-sent safely
    }
  }

  async function runFanOut(kindId: string, itemId: string, claimId: string, c: ClaimDoc, resumed: boolean) {
    try {
      const r = await fanOut(claimId, c);
      if (r === 'done') { out.announced++; if (resumed) out.resumed++; out.items.push({ kind: kindId, id: itemId, status: 'announced' }); }
      else { out.pending++; out.items.push({ kind: kindId, id: itemId, status: 'sending', reason: 'time budget reached; resumes next run' }); }
    } catch (e: any) {
      const attempts = (c.attempts ?? 0) + 1;
      const reason = String(e?.message || e).slice(0, 200);
      if (attempts >= maxAttempts) {
        await io.finish(claimId, { status: 'failed', attempts, error: reason }).catch(() => {});
        out.failed++; out.items.push({ kind: kindId, id: itemId, status: 'failed', reason });
      } else {
        await io.finish(claimId, { attempts, error: reason }).catch(() => {});        // stays 'sending': retried next run
        out.pending++; out.items.push({ kind: kindId, id: itemId, status: 'sending', reason: `retry ${attempts}/${maxAttempts}: ${reason}` });
      }
    }
  }

  // ── Phase A: resume fan-outs a previous run could not finish ────────────────────────────────────────────────────
  let pendingClaims: Array<{ id: string; data: ClaimDoc }> = [];
  try { pendingClaims = await io.listSending(50); } catch { /* resume is best effort; discovery still runs */ }
  for (const p of pendingClaims) {
    if (overBudget()) break;
    await runFanOut(p.data.kind, p.data.contentId, p.id, p.data, true);
  }

  // ── Phase B: discover newly released items ──────────────────────────────────────────────────────────────────────
  for (const kind of kinds) {
    if (overBudget()) break;
    let docs: ReleaseDoc[] = [];
    try { docs = await io.queryByTime(kind.collection, kind.timeField, now - lookback, now + 1, maxPerKind); }
    catch (e: any) { out.items.push({ kind: kind.id, id: '*', status: 'failed', reason: `query failed: ${String(e?.message || e).slice(0, 120)}` }); out.failed++; continue; }

    for (const { id, data } of docs) {
      out.checked++;
      if (overBudget()) { out.items.push({ kind: kind.id, id, status: 'skipped', reason: 'time budget reached; next run' }); continue; }
      if (!kind.scheduled(data)) { out.items.push({ kind: kind.id, id, status: 'skipped', reason: 'not a scheduled release' }); continue; }
      if (!kind.eligible(data)) { out.items.push({ kind: kind.id, id, status: 'skipped', reason: 'private, draft or withdrawn' }); continue; }
      const owner = kind.owner(data);
      if (!owner) { out.items.push({ kind: kind.id, id, status: 'skipped', reason: 'no owner' }); continue; }

      const items: ReleaseItem[] = kind.items
        ? kind.items(id, data, now - lookback, now + 1)
        : [{ key: id, title: kind.title(data), noun: kind.noun(data), releaseAt: num(data[kind.timeField]), feedExtras: kind.feedExtras(id, data) }];

      // The creator can switch the announcement off while setting the release up. Not claimed: nothing is sent, nothing to undo.
      const choice = data.releaseAnnouncement as ReleaseAnnouncementChoice | undefined;
      const optedOut = !!choice && choice.enabled === false;
      let handledAll = true;

      if (optedOut) out.items.push({ kind: kind.id, id, status: 'skipped', reason: 'creator turned the announcement off' });
      else for (const item of items) {
        const claimId = `${kind.id}_${item.key}`;
        try {
          const profile = await io.profile(owner);
          const name = profile?.displayName || 'A creator';
          const text = renderAnnouncement(choice, { name, noun: item.noun, title: item.title });
          const claimData: ClaimDoc = { kind: kind.id, contentId: id, ownerId: owner, releaseAt: item.releaseAt, status: 'sending', text, name, photo: profile?.photoURL || '', link: kind.link, targetId: id, claimedAt: now };
          const claim = await io.claim(claimId, claimData as unknown as Record<string, unknown>);
          if (claim === 'exists') { out.items.push({ kind: kind.id, id: item.key, status: 'skipped', reason: 'already announced' }); continue; }
          if (claim === 'error') { handledAll = false; out.items.push({ kind: kind.id, id: item.key, status: 'failed', reason: 'could not claim' }); out.failed++; continue; }

          try {
            await io.postFeed(`rel_${claimId}`, {
              authorId: owner, authorName: name, authorPhoto: profile?.photoURL || '', type: kind.feedType(data),
              content: text, imageUrl: kind.cover(data) || undefined, ...(item.feedExtras ?? kind.feedExtras(id, data)),
              releaseAnnouncement: true, timestamp: now, score: 0, scoreUpdatedAt: now,
              interactions: { deep: {}, medium: {}, base: {}, dmSharerIds: [] },
            });
          } catch (e: any) {
            const reason = String(e?.message || e).slice(0, 200);
            await io.finish(claimId, { status: 'failed', error: `feed post failed: ${reason}` }).catch(() => {});
            out.failed++; out.items.push({ kind: kind.id, id: item.key, status: 'failed', reason }); continue;
          }
          await runFanOut(kind.id, item.key, claimId, claimData, false);
        } catch (e: any) {
          handledAll = false;
          out.failed++; out.items.push({ kind: kind.id, id: item.key, status: 'failed', reason: String(e?.message || e).slice(0, 200) });
        }
      }

      // Advance the serial-book cursor even when the creator opted out, otherwise the doc is re-found every run until the window closes.
      if (handledAll && kind.afterHandled) {
        const patch = kind.afterHandled(data, now);
        if (patch) await io.patchContent(kind.collection, id, patch).catch(() => {});
      }
    }
  }
  return out;
}
