// Live polls + vote-to-schedule (server side). See services/fast/voteSchedule.ts for the model.
//
// Polls are SERVER-MEDIATED: clients read them through GET /api/live-polls and vote through
// POST /api/live-polls/:id/vote. Nothing is client-writable, so a poll needs no Firestore rules
// beyond the default deny — the main ruleset is at its size cap — and the server alone enforces one
// vote per account, the closing time, and the tally.
//
// Storage (main DB):
//   livePolls/{pollId}                 LivePoll (counts.{i} are atomic increments)
//   livePolls/{pollId}/votes/{uid}     { uid, choice, at }
//   livePollLocks/{pollId}             claim doc: whoever creates it locks the poll (exactly once)
//   fastVoteState/tick_{minute}        claim doc: one scheduling tick per minute, however many callers
//   fast_channel_schedules/{channelId} the channel's schedule (public read, existing collection)
//
// The tick (POST /api/cron/fast-vote-tick, x-cron-key; also run opportunistically, throttled, when a
// room is viewed) opens tomorrow's ballot, lays out the days, locks ballots whose voting has closed
// and writes the winner into that day's schedule.

import express from 'express';
import rateLimit from 'express-rate-limit';
import { dbIdFor } from '../services/opsCollections';
import {
  addDays, airingTimes, applyWinnerToDay, countsToArray, daySeconds, decideWinner, dropUndefined,
  hhmmToSec, layoutDay, pickBallot, reservedSecFor, scheduleRoundId, weekdayOf, zonedDateKey,
  type LivePoll, type VoteAwareSlot, type VoteOption,
} from '../services/fast/voteSchedule';
import {
  HORROR_CLASSICS_AD_BREAK_SEC, HORROR_CLASSICS_CHANNEL_ID, HORROR_CLASSICS_NAME, HORROR_CLASSICS_NIGHTLY_SLOT,
  HORROR_CLASSICS_PD_POOL, HORROR_CLASSICS_ROOM, HORROR_CLASSICS_TIMEZONE, MIN_FEATURE_SEC,
  PUMPKIN_PATCH_ALBUM_ID, PUMPKIN_PATCH_BASE,
} from '../data/horrorClassicsChannel';

const PROJECT = 'gen-lang-client-0665118474';

export interface FastVoteDeps {
  authMiddleware: any;
  requireRegisteredUser: any;
  verifyToken: (token: string) => Promise<{ uid: string } | null>;
  firestoreAuthHeaders: () => Promise<Record<string, string>>;
  /** deep doc read */
  read: (collection: string, id: string) => Promise<Record<string, any> | null>;
  /** deep merge-patch of top-level fields */
  patch: (collection: string, id: string, fields: Record<string, any>) => Promise<boolean>;
  createOnce: (collection: string, id: string, data: Record<string, any>) => Promise<'created' | 'exists' | 'error'>;
  query: (collection: string, filters: Array<{ field: string; op: string; value: any }>, limit?: number) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  cronKeyOk: (req: any) => boolean;
}

// ── Firestore REST bits the shared helpers don't cover (commit with transforms + preconditions) ──

const docName = (path: string) => `projects/${PROJECT}/databases/${dbIdFor(path.split('/')[0])}/documents/${path}`;
const commitUrl = (collection: string) => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${dbIdFor(collection)}/documents:commit`;

function toFs(x: any): any {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toFs) } };
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(x)) if (v !== undefined) fields[k] = toFs(v);
  return { mapValue: { fields } };
}

/** Raw doc GET returning updateTime too (for the vote precondition). */
async function getWithTime(deps: FastVoteDeps, path: string): Promise<{ data: Record<string, any>; updateTime: string } | null> {
  const res = await fetch(`https://firestore.googleapis.com/v1/${docName(path)}`, { headers: await deps.firestoreAuthHeaders() });
  if (!res.ok) return null;
  const j: any = await res.json();
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(j.fields || {}) as [string, any][]) {
    data[k] = v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue ?? v.stringValue ?? v.booleanValue;
  }
  return { data, updateTime: j.updateTime };
}

// ── Polls ───────────────────────────────────────────────────────────────────────────────────────

/** The room's standing community polls. Created once; never reset. */
const COMMUNITY_POLLS: Array<Pick<LivePoll, 'id' | 'question' | 'subtitle' | 'options'>> = [
  {
    id: 'halloween_pumpkin_mvp',
    question: 'Who steals the show in "Pumpkin Patch" (2025)?',
    subtitle: 'Planet Ween Universe · District 13 Showdown',
    options: [
      { label: 'Melvin Lester ("Pumpkin Patch") & his dual plasma blades', emoji: '🎃' },
      { label: 'Wicked Witch Miriam & the Flying Monkey Squadron', emoji: '🧙‍♀️' },
      { label: 'Stitch the Scarecrow on the District 13 rooftops', emoji: '🌾' },
      { label: "Lil' Boo, the ectoplasmic jar sidekick", emoji: '👻' },
    ],
  },
  {
    id: 'halloween_best_filter',
    question: 'Which face filter hits hardest with "Dim the Lights" on?',
    subtitle: 'Try them live in the Filter Booth',
    options: [
      { label: "Carved Jack-o'-Lantern talking head", emoji: '🎃' },
      { label: 'Ghost Face scream phantom', emoji: '👻' },
      { label: 'Full-moon Werewolf', emoji: '🐺' },
      { label: 'Necrotic Zombie / Count Vampire', emoji: '🧛' },
    ],
  },
];

async function ensureCommunityPolls(deps: FastVoteDeps, now: number) {
  for (const p of COMMUNITY_POLLS) {
    await deps.createOnce('livePolls', p.id, {
      ...p, roomId: HORROR_CLASSICS_ROOM, kind: 'COMMUNITY', counts: {}, status: 'OPEN', active: true, createdAt: now,
    });
  }
}

async function readPoll(deps: FastVoteDeps, id: string): Promise<LivePoll | null> {
  const d = await deps.read('livePolls', id);
  return d ? ({ ...(d as any), id } as LivePoll) : null;
}

/** Cast or change a vote. Atomic: the vote doc write (with a precondition on what we read) and the
 *  count increments commit together, so concurrent votes can't double-count or lose one. */
async function castVote(deps: FastVoteDeps, pollId: string, uid: string, choice: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const poll = await readPoll(deps, pollId);
  if (!poll) return { ok: false, status: 404, error: 'Poll not found' };
  const now = Date.now();
  if (poll.status !== 'OPEN' || (poll.closesAtMs && now >= poll.closesAtMs)) return { ok: false, status: 409, error: 'Voting has closed' };
  if (poll.schedule && now < poll.schedule.opensAtMs) return { ok: false, status: 409, error: 'Voting has not opened yet' };
  if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) return { ok: false, status: 400, error: 'Invalid choice' };

  for (let attempt = 0; attempt < 3; attempt++) {
    const votePath = `livePolls/${pollId}/votes/${uid}`;
    const prev = await getWithTime(deps, votePath);
    const prevChoice = prev ? Number(prev.data.choice) : null;
    if (prevChoice === choice) return { ok: true };
    const transforms: any[] = [{ fieldPath: `counts.\`${choice}\``, increment: { integerValue: '1' } }];
    if (prevChoice !== null && Number.isInteger(prevChoice)) transforms.push({ fieldPath: `counts.\`${prevChoice}\``, increment: { integerValue: '-1' } });
    const body = {
      writes: [
        {
          update: { name: docName(votePath), fields: toFs({ uid, choice, at: now }).mapValue.fields },
          currentDocument: prev ? { updateTime: prev.updateTime } : { exists: false },
        },
        {
          // reachedAt.{i}: when this choice last gained a vote — the tie-break ("first to reach").
          update: { name: docName(`livePolls/${pollId}`), fields: { reachedAt: toFs({ [String(choice)]: now }) } },
          updateMask: { fieldPaths: [`reachedAt.\`${choice}\``] },
          updateTransforms: transforms,
          currentDocument: { exists: true },
        },
      ],
    };
    const res = await fetch(commitUrl('livePolls'), { method: 'POST', headers: { ...(await deps.firestoreAuthHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    if (res.status !== 409 && res.status !== 400) return { ok: false, status: 502, error: 'Could not record your vote' };
    // Precondition failed: the same account voted in parallel. Re-read and retry.
  }
  return { ok: false, status: 409, error: 'Your vote changed elsewhere — try again' };
}

// ── The Horror Classics channel ─────────────────────────────────────────────────────────────────

/** Pumpkin Patch's stream + real running time from its album. Excluded (with a reason) when the
 *  album doesn't carry both — a guessed length would push every later programme off its time. */
async function resolvePumpkinPatch(deps: FastVoteDeps): Promise<{ option: VoteOption | null; reason?: string }> {
  const album = await deps.read('albums', PUMPKIN_PATCH_ALBUM_ID);
  if (!album) return { option: null, reason: 'album not found' };
  const t = Array.isArray(album.tracks) ? album.tracks[0] || {} : {};
  const mux = t.muxPlaybackId || album.muxPlaybackId;
  const url: string | undefined = mux ? `https://stream.mux.com/${mux}.m3u8` : (t.hlsUrl || t.videoUrl || t.url || album.videoUrl);
  const dur = Number(t.durationSeconds ?? t.duration ?? album.durationSeconds ?? album.duration);
  if (!url) return { option: null, reason: 'no stream url on the album' };
  if (!(dur > 60)) return { option: null, reason: 'no running time on the album' };
  return { option: { ...PUMPKIN_PATCH_BASE, videoUrl: url, durationSec: dur } };
}

async function channelPool(deps: FastVoteDeps) {
  const pp = await resolvePumpkinPatch(deps);
  const pool = pp.option ? [...HORROR_CLASSICS_PD_POOL, pp.option] : [...HORROR_CLASSICS_PD_POOL];
  const features = pool.filter(p => p.durationSec >= MIN_FEATURE_SEC);
  return { pool, features, pumpkinPatch: pp };
}

const SLOT = HORROR_CLASSICS_NIGHTLY_SLOT;
const TZ = HORROR_CLASSICS_TIMEZONE;
const CH = HORROR_CLASSICS_CHANNEL_ID;

function nightlyQuestion(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `Pick the 9 PM movie for ${day}`;
}

function scheduleDoc(weeklySlots: Record<string, VoteAwareSlot[]>, builtFor: Record<string, string>, todayKey: string, now: number) {
  return {
    userId: CH,
    channelName: HORROR_CLASSICS_NAME,
    platformOwned: true,
    timezone: TZ,
    midnightAnchored: true,
    stationKind: 'tv',
    loopSchedule: false,
    autoGenerated: true,
    includePublicDomain: true,
    adFrequencyMinutes: 0,
    adDurationSeconds: HORROR_CLASSICS_AD_BREAK_SEC,
    commercialFree: false,
    slots: weeklySlots[String(weekdayOf(todayKey))] || [],
    weeklySlots,
    weeklyBuiltFor: builtFor,
    lastUpdated: now,
  };
}

/** Open a ballot for `dateKey` (if due and not open yet) and lay out that day around it. */
async function ensureBallot(deps: FastVoteDeps, dateKey: string, features: VoteOption[], now: number, log: string[]): Promise<LivePoll | null> {
  const id = scheduleRoundId(CH, SLOT.id, dateKey);
  const existing = await readPoll(deps, id);
  if (existing) return existing;
  const times = airingTimes(SLOT, dateKey, TZ);
  if (now < times.opensAtMs) return null;
  if (now >= times.airAtMs) return null; // too late to ballot this airing; the provisional day airs as built

  // Never offer what won this slot last night — which means last night must be decided first.
  const prev = await readPoll(deps, scheduleRoundId(CH, SLOT.id, addDays(dateKey, -1)));
  if (prev && prev.status !== 'LOCKED' && now < (prev.schedule?.airAtMs ?? 0)) { log.push(`${dateKey}: waiting for ${addDays(dateKey, -1)} to lock`); return null; }
  const exclude = SLOT.excludePreviousWinner && prev?.status === 'LOCKED' && prev.winnerIdx != null
    ? [prev.options[prev.winnerIdx]?.programme?.videoId].filter(Boolean) as string[] : [];
  const ballot = pickBallot(features, SLOT.optionCount, exclude, id);
  const poll: LivePoll = {
    id, roomId: HORROR_CLASSICS_ROOM, kind: 'SCHEDULE',
    question: nightlyQuestion(dateKey),
    subtitle: `${HORROR_CLASSICS_NAME} · 8.2 on LiveHub TV+ · airs 9 PM ET`,
    options: ballot.map(b => ({ label: b.year ? `${b.title} (${b.year})` : b.title, programme: b })),
    counts: {}, status: 'OPEN', active: true, createdAt: now,
    closesAtMs: times.closesAtMs,
    schedule: { channelId: CH, slotId: SLOT.id, date: dateKey, timezone: TZ, ...times, reservedSec: reservedSecFor(ballot) },
  };
  const made = await deps.createOnce('livePolls', id, JSON.parse(JSON.stringify(poll)));
  if (made === 'error') { log.push(`${dateKey}: ballot create failed`); return null; }
  log.push(`${dateKey}: ballot opened (${ballot.map(b => b.title).join(' / ')})`);
  return made === 'created' ? poll : readPoll(deps, id);
}

/** Lock a ballot whose voting has closed, exactly once, and return the decided poll. */
async function lockBallot(deps: FastVoteDeps, poll: LivePoll, now: number, log: string[]): Promise<LivePoll | null> {
  const claim = await deps.createOnce('livePollLocks', poll.id, { at: now });
  if (claim !== 'created') return readPoll(deps, poll.id);
  const fresh = (await readPoll(deps, poll.id)) || poll;
  const counts = countsToArray(fresh.counts, fresh.options.length);
  const reached = fresh.options.map((_, i) => Number((fresh as any).reachedAt?.[String(i)]) || undefined);
  const { winnerIdx, reason } = decideWinner(counts, reached, fresh.id);
  await deps.patch('livePolls', fresh.id, { status: 'LOCKED', winnerIdx, winnerReason: reason, lockedAt: now });
  log.push(`${fresh.schedule?.date}: locked → ${fresh.options[winnerIdx]?.label} (${reason}, ${counts.join('/')})`);
  return { ...fresh, status: 'LOCKED', winnerIdx, winnerReason: reason, lockedAt: now };
}

/**
 * One scheduling pass. Idempotent and safe to run from several callers: every create is a claim,
 * and the schedule is rewritten only by the caller holding this minute's tick claim.
 */
export async function runFastVoteTick(deps: FastVoteDeps, opts: { force?: boolean; dryRun?: boolean } = {}) {
  const now = Date.now();
  const log: string[] = [];
  if (!opts.dryRun && !opts.force) {
    const claim = await deps.createOnce('fastVoteState', `tick_${Math.floor(now / 60_000)}`, { at: now });
    if (claim !== 'created') return { ran: false, log: ['another tick holds this minute'] };
  }
  if (!opts.dryRun) await ensureCommunityPolls(deps, now);

  const { pool, features, pumpkinPatch } = await channelPool(deps);
  if (!pumpkinPatch.option) log.push(`Pumpkin Patch not in rotation: ${pumpkinPatch.reason}`);
  const today = zonedDateKey(now, TZ);
  const existing = opts.dryRun ? null : await deps.read('fast_channel_schedules', CH);
  const weeklySlots: Record<string, VoteAwareSlot[]> = { ...((existing?.weeklySlots as any) || {}) };
  const builtFor: Record<string, string> = { ...((existing?.weeklyBuiltFor as any) || {}) };
  const startSec = hhmmToSec(SLOT.localTime);

  // Ballots: tonight's (if still before air) and tomorrow's (once tonight has locked).
  const ballots: Record<string, LivePoll | null> = {};
  for (const dateKey of [today, addDays(today, 1)]) {
    ballots[dateKey] = opts.dryRun ? null : await ensureBallot(deps, dateKey, features, now, log);
  }

  // Lock anything whose voting has closed.
  if (!opts.dryRun) {
    for (const dateKey of [addDays(today, -1), today]) {
      const p = ballots[dateKey] ?? await readPoll(deps, scheduleRoundId(CH, SLOT.id, dateKey));
      if (p && p.status === 'OPEN' && p.closesAtMs && now >= p.closesAtMs) ballots[dateKey] = await lockBallot(deps, p, now, log);
      else if (p) ballots[dateKey] = p;
    }
  }

  // Lay out the coming week. A day with a ballot is built around it (provisional leader until it
  // locks, the winner after); days further out get a provisional ballot from the same seed, so the
  // guide always has a full week.
  let changed = false;
  for (let i = 0; i < 7; i++) {
    const dateKey = addDays(today, i);
    const wd = String(weekdayOf(dateKey));
    const roundId = scheduleRoundId(CH, SLOT.id, dateKey);
    const poll = ballots[dateKey] ?? null;
    const alreadyBuilt = builtFor[wd] === dateKey && Array.isArray(weeklySlots[wd]) && weeklySlots[wd].length > 0;
    // Built around tonight's real ballot (vs. a provisional one from before the ballot opened).
    const builtWithBallot = alreadyBuilt && weeklySlots[wd].some(s => s.voteRoundId === roundId && (s as any).ballotOpen);

    if (poll?.status === 'LOCKED' && poll.winnerIdx != null && alreadyBuilt) {
      const winner = poll.options[poll.winnerIdx]?.programme;
      const block = weeklySlots[wd].find(s => s.voteRoundId === roundId && s.type !== 'FM_BLOCK');
      if (winner && block && (block.votePending || block.videoId !== winner.videoId)) {
        weeklySlots[wd] = applyWinnerToDay(weeklySlots[wd], roundId, winner, poll.schedule!.reservedSec, pool, HORROR_CLASSICS_AD_BREAK_SEC);
        changed = true;
        log.push(`${dateKey}: winner written into the 9 PM block`);
      }
      continue;
    }
    if (alreadyBuilt && (!poll || builtWithBallot)) continue;
    if (i === 0 && alreadyBuilt) continue; // never re-lay a day that is airing now

    const ballot = poll ? poll.options.map(o => o.programme!).filter(Boolean) : pickBallot(features, SLOT.optionCount, [], roundId);
    const reservedSec = poll?.schedule?.reservedSec ?? reservedSecFor(ballot);
    const leader = poll ? leadingOption(poll) ?? ballot[0] : ballot[0];
    const day = layoutDay({
      dateKey, channelId: CH, pool, adBreakSec: HORROR_CLASSICS_AD_BREAK_SEC, minFillSec: 0,
      vote: { roundId, startSec, reservedSec, airing: leader, pending: true },
    }).map(s => (s.voteRoundId === roundId && poll ? { ...s, ballotOpen: true } as any : s));
    const total = daySeconds(day);
    if (total !== 86400) { log.push(`${dateKey}: layout came to ${total}s, not 86400 — skipped`); continue; }
    weeklySlots[wd] = day;
    builtFor[wd] = dateKey;
    changed = true;
    log.push(`${dateKey}: day laid out (${day.filter(s => s.type === 'PUBLIC_DOMAIN').length} programmes${poll ? ', ballot open' : ', provisional'})`);
  }

  // Retire ballots older than last night so the room shows tonight's and last night's only.
  if (!opts.dryRun) {
    const old = await deps.query('livePolls', [{ field: 'roomId', op: 'EQUAL', value: HORROR_CLASSICS_ROOM }, { field: 'active', op: 'EQUAL', value: true }], 50);
    for (const o of old) {
      const date = o.data?.schedule?.date as string | undefined;
      if (date && date < addDays(today, -1)) await deps.patch('livePolls', o.id, { active: false });
    }
  }

  const doc = scheduleDoc(
    Object.fromEntries(Object.entries(weeklySlots).map(([k, v]) => [k, dropUndefined(v)])),
    builtFor, today, now,
  );
  if (changed && !opts.dryRun) await deps.patch('fast_channel_schedules', CH, doc);
  return { ran: true, changed, log, today, ...(opts.dryRun ? { preview: doc } : {}) };
}

function leadingOption(poll: LivePoll): VoteOption | undefined {
  const counts = countsToArray(poll.counts, poll.options.length);
  const top = Math.max(0, ...counts);
  if (!top) return undefined;
  return poll.options[counts.indexOf(top)]?.programme;
}

// ── Router ─────────────────────────────────────────────────────────────────────────────────────

const TICK_THROTTLE_MS = 3 * 60_000;
let lastOpportunisticTick = 0;

export function createFastVoteRouter(deps: FastVoteDeps) {
  const router = express.Router();

  // Optional auth: a signed-in viewer also gets their own votes back.
  const optionalUid = async (req: any): Promise<string | null> => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return null;
    const r = await deps.verifyToken(h.slice(7)).catch(() => null);
    return r?.uid || null;
  };

  router.get('/api/live-polls', async (req: any, res: any) => {
    const room = String(req.query.room || '');
    if (!/^[a-z0-9_]{1,40}$/.test(room)) return res.status(400).json({ error: 'room required' });
    // Keep the schedule moving even before Cloud Scheduler is set up (throttled, fire-and-forget).
    // Production only (or FAST_VOTE_TICK=1): a dev server talks to the production database, and
    // merely opening the fan room locally must not create ballots or rewrite the channel.
    const tickAllowed = process.env.NODE_ENV === 'production' || process.env.FAST_VOTE_TICK === '1';
    if (tickAllowed && Date.now() - lastOpportunisticTick > TICK_THROTTLE_MS) {
      lastOpportunisticTick = Date.now();
      runFastVoteTick(deps).catch(e => console.error('[fast-vote] tick', e?.message || e));
    }
    const rows = await deps.query('livePolls', [{ field: 'roomId', op: 'EQUAL', value: room }, { field: 'active', op: 'EQUAL', value: true }], 30);
    const polls = rows.map(r => ({ ...(r.data as any), id: r.id }) as LivePoll);
    const uid = await optionalUid(req);
    const myVotes: Record<string, number> = {};
    if (uid) {
      await Promise.all(polls.map(async p => {
        const v = await deps.read(`livePolls/${p.id}/votes`, uid);
        if (v && Number.isInteger(v.choice)) myVotes[p.id] = v.choice;
      }));
    }
    res.set('Cache-Control', 'no-store');
    res.json({ polls, myVotes, now: Date.now() });
  });

  // Votes are cheap to change but each one is a Firestore commit — 30 a minute per caller is plenty.
  const voteLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many votes, slow down' } });
  router.post('/api/live-polls/:id/vote', voteLimiter, deps.authMiddleware, deps.requireRegisteredUser, express.json(), async (req: any, res: any) => {
    const id = String(req.params.id || '');
    if (!/^[A-Za-z0-9_\-]{1,200}$/.test(id)) return res.status(400).json({ error: 'bad poll id' });
    const r = await castVote(deps, id, req.uid, Number(req.body?.choice));
    if (r.ok === false) return res.status(r.status).json({ error: r.error });
    const poll = await readPoll(deps, id);
    res.json({ ok: true, poll, myVote: Number(req.body?.choice) });
  });

  router.post('/api/cron/fast-vote-tick', express.json(), async (req: any, res: any) => {
    if (!deps.cronKeyOk(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await runFastVoteTick(deps, { force: req.query.force === '1' })); }
    catch (e: any) { console.error('[fast-vote] cron', e?.message || e); res.status(500).json({ error: String(e?.message || e).slice(0, 300) }); }
  });

  // Read-only: what the next tick would lay out. Writes nothing. Keyless on a dev server.
  router.get('/api/cron/fast-vote-preview', async (req: any, res: any) => {
    if (!deps.cronKeyOk(req) && process.env.NODE_ENV === 'production') return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await runFastVoteTick(deps, { dryRun: true })); }
    catch (e: any) { res.status(500).json({ error: String(e?.message || e).slice(0, 300) }); }
  });

  return router;
}
