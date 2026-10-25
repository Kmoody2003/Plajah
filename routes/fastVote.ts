// Live polls + vote-to-schedule (server side). See services/fast/voteSchedule.ts for the model.
//
// Polls are SERVER-MEDIATED: clients read them through GET /api/live-polls and vote through
// POST /api/live-polls/:id/vote. Nothing is client-writable, so a poll needs no Firestore rules
// beyond the default deny — the main ruleset is at its size cap — and the server alone enforces one
// vote per account, the closing time, and the tally.
//
// Storage (main DB):
//   livePolls/{pollId}                 LivePoll (counts.{i} and funding.pledgedCents are atomic increments)
//   livePolls/{pollId}/votes/{uid}     { uid, choice, at }
//   livePollPledges/{paymentIntentId}  { pollId, uid, amountCents, status: AUTHORIZED|CAPTURED|RELEASED|FAILED }
//   livePollLocks/{pollId}             claim doc: whoever creates it locks the poll (exactly once)
//   fastVoteState/tick_{minute}        claim doc: one scheduling tick per minute, however many callers
//   fast_channel_schedules/{id}        the channel's schedule (public read, existing collection)
//
// Two kinds of vote-to-schedule channel:
//   • Plajah Horror Classics — platform-owned; the server lays out every day around the 9 PM ballot.
//   • Creator channels — a creator puts Fan Vote slots into their own schedule (FastChannelManager →
//     Fan Vote); the server only swaps each slot's placeholder for the winner. Their schedule doc
//     carries `hasVoteSlots: true` and `voteSlots: CreatorVoteSlot[]`.
//
// Commercial-free funding: fans pledge toward a slot's goal through Stripe Checkout with MANUAL
// capture — the card is only authorised. When voting closes the server captures every hold if the
// goal was met (the airing then runs without ad breaks) and releases them all if it wasn't. Creator
// slots pay the creator directly (Connect destination charge): Plajah's fee is 0% when the creator
// has Plajah+, 5% otherwise. It is a creator feature only — Plajah's own channels never take pledges.
//
// The tick (POST /api/cron/fast-vote-tick, x-cron-key; also run opportunistically, throttled, when a
// room is viewed in production) opens ballots, lays out / patches schedules, and locks ballots.

import express from 'express';
import rateLimit from 'express-rate-limit';
import { dbIdFor } from '../services/opsCollections';
import {
  addDays, adPlanFor, airingTimes, applyWinnerToDay, clampCutoff, countsToArray, daySeconds, decideWinner,
  dropUndefined, hhmmToSec, layoutDay, pickBallot, replaceVoteGroup, reservedSecFor, scheduleRoundId, secToHHMM,
  voteBlockSlots, voteGroup, weekdayOf, zonedDateKey, zonedWallTimeToMs,
  type AdPlan, type CreatorVoteSlot, type LivePoll, type VoteAwareSlot, type VoteOption,
} from '../services/fast/voteSchedule';
import {
  HORROR_CLASSICS_ADS, HORROR_CLASSICS_CHANNEL_ID, HORROR_CLASSICS_NAME,
  HORROR_CLASSICS_NIGHTLY_SLOT, HORROR_CLASSICS_PD_POOL, HORROR_CLASSICS_ROOM, HORROR_CLASSICS_TIMEZONE,
  MIN_FEATURE_SEC, PUMPKIN_PATCH_ALBUM_ID, PUMPKIN_PATCH_BASE,
} from '../data/horrorClassicsChannel';

const PROJECT = 'gen-lang-client-0665118474';
const MIN_PLEDGE_CENTS = 100;
const MAX_PLEDGE_CENTS = 50_000;
const PLATFORM_FEE_PCT_WITHOUT_PLUS = 0.05;

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
  getStripe: () => any;
  trustedRequestOrigin: (req: any) => string;
  /** Does this uid hold an active Plajah+ subscription? (fee waiver) */
  hasPlajahPlus: (uid: string) => Promise<boolean>;
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

async function commit(deps: FastVoteDeps, collection: string, writes: any[]): Promise<Response> {
  return fetch(commitUrl(collection), {
    method: 'POST',
    headers: { ...(await deps.firestoreAuthHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
}

/** Patch ONE nested field (e.g. weeklySlots.`3`) without touching the rest of the doc — the
 *  creator may be editing other days of their schedule at the same moment. */
async function patchPath(deps: FastVoteDeps, collection: string, id: string, path: string[], value: any): Promise<boolean> {
  let nested: any = value;
  for (let i = path.length - 1; i >= 1; i--) nested = { [path[i]]: nested };
  const res = await commit(deps, collection, [{
    update: { name: docName(`${collection}/${id}`), fields: { [path[0]]: toFs(nested) } },
    updateMask: { fieldPaths: [path.map(p => `\`${p}\``).join('.')] },
  }]);
  if (!res.ok) console.error(`[fast-vote] patch ${collection}/${id} ${path.join('.')}: HTTP ${res.status}`);
  // Players re-check schedules with vote slots by lastUpdated — bump it with every change.
  else await deps.patch(collection, id, { lastUpdated: Date.now() });
  return res.ok;
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

/** The Halloween room's standing community polls. Created once; never reset. */
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
    const res = await commit(deps, 'livePolls', [
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
    ]);
    if (res.ok) return { ok: true };
    if (res.status !== 409 && res.status !== 400) return { ok: false, status: 502, error: 'Could not record your vote' };
    // Precondition failed: the same account voted in parallel. Re-read and retry.
  }
  return { ok: false, status: 409, error: 'Your vote changed elsewhere — try again' };
}

// ── Commercial-free funding ─────────────────────────────────────────────────────────────────────

/** Record a completed Checkout for a slot pledge (webhook or the return-page confirm — idempotent).
 *  A hold that lands after voting closed is released on the spot. */
async function recordPledgeFromSession(deps: FastVoteDeps, session: any): Promise<{ ok: boolean; reason?: string }> {
  const meta = session?.metadata || {};
  if (meta.type !== 'fast_slot_pledge' || !meta.pollId || !session.payment_intent) return { ok: false, reason: 'not a slot pledge' };
  const stripe = deps.getStripe();
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.status !== 'requires_capture') return { ok: false, reason: `payment is ${pi.status}` };
  const poll = await readPoll(deps, meta.pollId);
  const closed = !poll || poll.status !== 'OPEN' || !poll.funding || (poll.closesAtMs && Date.now() >= poll.closesAtMs);
  if (closed) {
    await stripe.paymentIntents.cancel(piId).catch(() => {});
    await deps.createOnce('livePollPledges', piId, { pollId: meta.pollId, uid: meta.uid || '', amountCents: pi.amount, status: 'RELEASED', reason: 'voting had closed', createdAt: Date.now() });
    return { ok: false, reason: 'voting had closed — your card was not charged' };
  }
  const made = await deps.createOnce('livePollPledges', piId, {
    pollId: meta.pollId, uid: meta.uid || '', amountCents: pi.amount, status: 'AUTHORIZED', createdAt: Date.now(),
  });
  if (made === 'created') {
    await commit(deps, 'livePolls', [{
      transform: {
        document: docName(`livePolls/${meta.pollId}`),
        fieldTransforms: [
          { fieldPath: 'funding.pledgedCents', increment: { integerValue: String(pi.amount) } },
          { fieldPath: 'funding.pledgeCount', increment: { integerValue: '1' } },
        ],
      },
    }]);
  }
  return { ok: true };
}

/** At lock: goal met → capture every hold and air commercial-free; missed → release them all. */
async function settleFunding(deps: FastVoteDeps, poll: LivePoll, log: string[]): Promise<boolean> {
  const f = poll.funding;
  if (!f || !f.goalCents) return false;
  const holds = await deps.query('livePollPledges', [
    { field: 'pollId', op: 'EQUAL', value: poll.id },
    { field: 'status', op: 'EQUAL', value: 'AUTHORIZED' },
  ], 500);
  const pledged = holds.reduce((a, h) => a + (Number(h.data.amountCents) || 0), 0);
  const met = pledged >= f.goalCents;
  const stripe = holds.length ? deps.getStripe() : null;
  let captured = 0;
  for (const h of holds) {
    try {
      if (met) { await stripe.paymentIntents.capture(h.id); captured += Number(h.data.amountCents) || 0; }
      else await stripe.paymentIntents.cancel(h.id);
      await deps.patch('livePollPledges', h.id, { status: met ? 'CAPTURED' : 'RELEASED', settledAt: Date.now() });
    } catch (e: any) {
      await deps.patch('livePollPledges', h.id, { status: 'FAILED', error: String(e?.message || e).slice(0, 200), settledAt: Date.now() });
    }
  }
  await deps.patch('livePolls', poll.id, { funding: { ...f, pledgedCents: pledged, pledgeCount: holds.length, unlocked: met, released: !met, capturedCents: captured } });
  log.push(`${poll.id}: funding ${met ? 'met — charged' : 'missed — released'} (${pledged}/${f.goalCents}¢ from ${holds.length})`);
  return met;
}

// ── Ballots + locking (shared by both channel kinds) ────────────────────────────────────────────

interface BallotSpec {
  id: string;
  roomId: string;
  question: string;
  subtitle: string;
  choices: VoteOption[];
  times: { airAtMs: number; opensAtMs: number; closesAtMs: number };
  schedule: { channelId: string; slotId: string; date: string; timezone: string; reservedSec: number };
  goalCents?: number;
  ownerUid?: string;
}

async function createBallot(deps: FastVoteDeps, b: BallotSpec, now: number, log: string[]): Promise<LivePoll | null> {
  const poll: LivePoll = {
    id: b.id, roomId: b.roomId, kind: 'SCHEDULE', question: b.question, subtitle: b.subtitle,
    options: b.choices.map(c => ({ label: c.year ? `${c.title} (${c.year})` : c.title, programme: c })),
    counts: {}, status: 'OPEN', active: true, createdAt: now, closesAtMs: b.times.closesAtMs,
    schedule: { ...b.schedule, ...b.times },
    ...(b.goalCents ? { funding: { goalCents: b.goalCents, pledgedCents: 0, pledgeCount: 0 } } : {}),
    ...(b.ownerUid ? { ownerUid: b.ownerUid } : {}),
  };
  const made = await deps.createOnce('livePolls', b.id, JSON.parse(JSON.stringify(poll)));
  if (made === 'error') { log.push(`${b.id}: ballot create failed`); return null; }
  if (made === 'created') log.push(`${b.id}: ballot opened (${b.choices.map(c => c.title).join(' / ')})`);
  return made === 'created' ? poll : readPoll(deps, b.id);
}

/** Lock a ballot whose voting has closed, exactly once: tally, settle funding, record the winner. */
async function lockBallot(deps: FastVoteDeps, poll: LivePoll, now: number, log: string[]): Promise<LivePoll | null> {
  const claim = await deps.createOnce('livePollLocks', poll.id, { at: now });
  if (claim !== 'created') return readPoll(deps, poll.id);
  const fresh = (await readPoll(deps, poll.id)) || poll;
  const counts = countsToArray(fresh.counts, fresh.options.length);
  const reached = fresh.options.map((_, i) => Number((fresh as any).reachedAt?.[String(i)]) || undefined);
  const { winnerIdx, reason } = decideWinner(counts, reached, fresh.id);
  await settleFunding(deps, fresh, log);
  await deps.patch('livePolls', fresh.id, { status: 'LOCKED', winnerIdx, winnerReason: reason, lockedAt: now });
  log.push(`${fresh.id}: locked → ${fresh.options[winnerIdx]?.label} (${reason}, ${counts.join('/')})`);
  return readPoll(deps, fresh.id);
}

const previousWinnerId = (prev: LivePoll | null): string[] =>
  prev?.status === 'LOCKED' && prev.winnerIdx != null ? [prev.options[prev.winnerIdx]?.programme?.videoId].filter(Boolean) as string[] : [];

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${ap}`;
}

// ── Plajah Horror Classics ──────────────────────────────────────────────────────────────────────

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

const H_SLOT = HORROR_CLASSICS_NIGHTLY_SLOT;
const H_TZ = HORROR_CLASSICS_TIMEZONE;
const H_CH = HORROR_CLASSICS_CHANNEL_ID;
const H_ADS = HORROR_CLASSICS_ADS;

async function horrorBallot(deps: FastVoteDeps, dateKey: string, features: VoteOption[], now: number, log: string[]): Promise<LivePoll | null> {
  const id = scheduleRoundId(H_CH, H_SLOT.id, dateKey);
  const existing = await readPoll(deps, id);
  if (existing) return existing;
  const times = airingTimes(H_SLOT, dateKey, H_TZ);
  if (now < times.opensAtMs || now >= times.airAtMs) return null;
  // Never offer what won this slot last night — which means last night must be decided first.
  const prev = await readPoll(deps, scheduleRoundId(H_CH, H_SLOT.id, addDays(dateKey, -1)));
  if (prev && prev.status !== 'LOCKED' && now < (prev.schedule?.airAtMs ?? 0)) { log.push(`${dateKey}: waiting for last night to lock`); return null; }
  const choices = pickBallot(features, H_SLOT.optionCount, H_SLOT.excludePreviousWinner ? previousWinnerId(prev) : [], id);
  return createBallot(deps, {
    id, roomId: HORROR_CLASSICS_ROOM,
    question: `Pick the 9 PM movie for ${dayLabel(dateKey)}`,
    subtitle: `${HORROR_CLASSICS_NAME} · 8.2 on LiveHub TV+ · airs 9 PM ET`,
    choices, times,
    schedule: { channelId: H_CH, slotId: H_SLOT.id, date: dateKey, timezone: H_TZ, reservedSec: reservedSecFor(choices, H_ADS) },
  }, now, log);
}

function leadingOption(poll: LivePoll): VoteOption | undefined {
  const counts = countsToArray(poll.counts, poll.options.length);
  const top = Math.max(0, ...counts);
  return top ? poll.options[counts.indexOf(top)]?.programme : undefined;
}

async function tickHorrorClassics(deps: FastVoteDeps, now: number, log: string[], dryRun: boolean) {
  const pp = await resolvePumpkinPatch(deps);
  if (!pp.option) log.push(`Pumpkin Patch not in rotation: ${pp.reason}`);
  const pool = pp.option ? [...HORROR_CLASSICS_PD_POOL, pp.option] : [...HORROR_CLASSICS_PD_POOL];
  const features = pool.filter(p => p.durationSec >= MIN_FEATURE_SEC);
  const today = zonedDateKey(now, H_TZ);
  const existing = dryRun ? null : await deps.read('fast_channel_schedules', H_CH);
  const weeklySlots: Record<string, VoteAwareSlot[]> = { ...((existing?.weeklySlots as any) || {}) };
  const builtFor: Record<string, string> = { ...((existing?.weeklyBuiltFor as any) || {}) };
  const startSec = hhmmToSec(H_SLOT.localTime);

  const ballots: Record<string, LivePoll | null> = {};
  if (!dryRun) {
    for (const d of [today, addDays(today, 1)]) ballots[d] = await horrorBallot(deps, d, features, now, log);
    for (const d of [addDays(today, -1), today]) {
      const p = ballots[d] ?? await readPoll(deps, scheduleRoundId(H_CH, H_SLOT.id, d));
      ballots[d] = p && p.status === 'OPEN' && p.closesAtMs && now >= p.closesAtMs ? await lockBallot(deps, p, now, log) : p;
    }
  }

  // Lay out the coming week. A day with a ballot is built around it (provisional until it locks,
  // the winner after); days further out get a provisional ballot from the same seed, so the guide
  // always has a full week.
  let changed = false;
  for (let i = 0; i < 7; i++) {
    const dateKey = addDays(today, i);
    const wd = String(weekdayOf(dateKey));
    const roundId = scheduleRoundId(H_CH, H_SLOT.id, dateKey);
    const poll = ballots[dateKey] ?? null;
    const alreadyBuilt = builtFor[wd] === dateKey && Array.isArray(weeklySlots[wd]) && weeklySlots[wd].length > 0;
    const builtWithBallot = alreadyBuilt && weeklySlots[wd].some(s => s.voteRoundId === roundId && (s as any).ballotOpen);

    if (poll?.status === 'LOCKED' && poll.winnerIdx != null && alreadyBuilt) {
      const winner = poll.options[poll.winnerIdx]?.programme;
      const prog = weeklySlots[wd].find(s => s.voteRoundId === roundId && s.type === 'PUBLIC_DOMAIN');
      if (winner && prog && (prog.votePending || prog.videoId !== winner.videoId)) {
        weeklySlots[wd] = applyWinnerToDay(weeklySlots[wd], roundId, winner, poll.schedule!.reservedSec, { fillPool: pool, ads: H_ADS, adFree: !!poll.funding?.unlocked });
        changed = true;
        log.push(`${dateKey}: winner written into the 9 PM block${poll.funding?.unlocked ? ' (commercial-free)' : ''}`);
      }
      continue;
    }
    if (alreadyBuilt && (!poll || builtWithBallot)) continue;
    if (i === 0 && alreadyBuilt) continue; // never re-lay a day that is airing now

    const choices = poll ? poll.options.map(o => o.programme!).filter(Boolean) : pickBallot(features, H_SLOT.optionCount, [], roundId);
    const reservedSec = poll?.schedule?.reservedSec ?? reservedSecFor(choices, H_ADS);
    const airing = (poll && leadingOption(poll)) || choices[0];
    const day = layoutDay({
      dateKey, channelId: H_CH, pool, ads: H_ADS, minFillSec: 0,
      vote: { roundId, startSec, reservedSec, airing, pending: true },
    }).map(s => (s.voteRoundId === roundId && poll ? { ...s, ballotOpen: true } as any : s));
    const total = daySeconds(day);
    if (total !== 86400) { log.push(`${dateKey}: layout came to ${total}s, not 86400 — skipped`); continue; }
    weeklySlots[wd] = day;
    builtFor[wd] = dateKey;
    changed = true;
    log.push(`${dateKey}: day laid out (${new Set(day.filter(s => s.type === 'PUBLIC_DOMAIN').map(s => s.videoId)).size} titles${poll ? ', ballot open' : ', provisional'})`);
  }

  const doc = {
    userId: H_CH, channelName: HORROR_CLASSICS_NAME, platformOwned: true, timezone: H_TZ,
    midnightAnchored: true, stationKind: 'tv', loopSchedule: false, autoGenerated: true, includePublicDomain: true,
    adFrequencyMinutes: H_ADS.midrollEverySec / 60, adDurationSeconds: H_ADS.breakSec, commercialFree: false,
    slots: dropUndefined(weeklySlots[String(weekdayOf(today))] || []),
    weeklySlots: Object.fromEntries(Object.entries(weeklySlots).map(([k, v]) => [k, dropUndefined(v)])),
    weeklyBuiltFor: builtFor, lastUpdated: now,
  };
  if (changed && !dryRun) await deps.patch('fast_channel_schedules', H_CH, doc);
  return { changed, preview: dryRun ? doc : undefined };
}

// ── Creator channels ────────────────────────────────────────────────────────────────────────────

/** Which array airs on a station date: that weekday's override if it has one, else the daily loop
 *  (the same choice playout makes in activeDaySlots). */
function dayArrayFor(sched: Record<string, any>, dateKey: string): { path: string[]; day: VoteAwareSlot[] } {
  const wd = String(weekdayOf(dateKey));
  const perDay = sched.weeklySlots?.[wd];
  return Array.isArray(perDay) && perDay.length ? { path: ['weeklySlots', wd], day: perDay } : { path: ['slots'], day: sched.slots || [] };
}

async function tickCreatorChannel(deps: FastVoteDeps, ownerUid: string, sched: Record<string, any>, now: number, log: string[]) {
  const tz: string = sched.timezone || 'America/New_York';
  const slots: CreatorVoteSlot[] = Array.isArray(sched.voteSlots) ? sched.voteSlots : [];
  if (!slots.length || !sched.midnightAnchored) return;
  const plan: AdPlan = adPlanFor(sched as any);
  const today = zonedDateKey(now, tz);
  const room = `ch_${ownerUid}`;
  const channelName = sched.channelName || 'this channel';

  for (const cfg of slots) {
    const choices = (cfg.choices || []).filter(c => c?.videoUrl && c.durationSec > 0).slice(0, 8);
    if (choices.length < 2) continue;
    for (const dateKey of [addDays(today, -1), today, addDays(today, 1)]) {
      const { path, day } = dayArrayFor(sched, dateKey);
      const g = voteGroup(day, cfg.id);
      if (!g) continue; // this vote slot doesn't air that day
      const hhmm = secToHHMM(g.startSec);
      const airAtMs = zonedWallTimeToMs(dateKey, hhmm, tz) + (g.startSec % 60) * 1000;
      const closesAtMs = airAtMs - clampCutoff(cfg.cutoffMinutes) * 60_000;
      const opensAtMs = airAtMs - 23 * 3_600_000;
      const id = scheduleRoundId(ownerUid, cfg.id, dateKey);
      let poll = await readPoll(deps, id);

      if (!poll && dateKey !== addDays(today, -1) && now >= opensAtMs && now < closesAtMs) {
        const prev = await readPoll(deps, scheduleRoundId(ownerUid, cfg.id, addDays(dateKey, -1)));
        if (prev && prev.status !== 'LOCKED' && now < (prev.schedule?.airAtMs ?? 0)) continue;
        const ballot = pickBallot(choices, cfg.optionCount || choices.length, cfg.excludePreviousWinner ? previousWinnerId(prev) : [], id);
        poll = await createBallot(deps, {
          id, roomId: room,
          question: `Pick what airs at ${clockLabel(hhmm)} on ${dayLabel(dateKey)}`,
          subtitle: `${channelName} · ${cfg.label || 'Fan Vote'}`,
          choices: ballot, times: { airAtMs, opensAtMs, closesAtMs },
          schedule: { channelId: ownerUid, slotId: cfg.id, date: dateKey, timezone: tz, reservedSec: g.lengthSec },
          goalCents: cfg.commercialFreeGoalCents && cfg.commercialFreeGoalCents >= MIN_PLEDGE_CENTS ? cfg.commercialFreeGoalCents : undefined,
          ownerUid,
        }, now, log);
        // The placeholder now advertises an open vote (yesterday's airing of a daily slot is over).
        if (poll && now < airAtMs) {
          const pending = voteBlockSlots(id, ballot[0], g.lengthSec, true, { ads: plan });
          await patchPath(deps, 'fast_channel_schedules', ownerUid, path, dropUndefined(replaceVoteGroup(day, cfg.id, pending)));
          (sched as any)[path[0]] = path.length > 1 ? { ...(sched as any)[path[0]], [path[1]]: replaceVoteGroup(day, cfg.id, pending) } : replaceVoteGroup(day, cfg.id, pending);
        }
      }
      if (poll && poll.status === 'OPEN' && poll.closesAtMs && now >= poll.closesAtMs) {
        poll = await lockBallot(deps, poll, now, log);
        const winner = poll?.winnerIdx != null ? poll.options[poll.winnerIdx]?.programme : undefined;
        if (winner && now < airAtMs + g.lengthSec * 1000) {
          const current = dayArrayFor(sched, dateKey);
          const block = voteBlockSlots(id, winner, g.lengthSec, false, { ads: plan, adFree: !!poll!.funding?.unlocked });
          await patchPath(deps, 'fast_channel_schedules', ownerUid, current.path, dropUndefined(replaceVoteGroup(current.day, cfg.id, block)));
          log.push(`${ownerUid}/${cfg.id}/${dateKey}: winner written`);
        }
      }
    }
  }
}

/**
 * One scheduling pass. Idempotent and safe to run from several callers: every create is a claim,
 * and only the caller holding this minute's tick claim proceeds.
 */
export async function runFastVoteTick(deps: FastVoteDeps, opts: { force?: boolean; dryRun?: boolean } = {}) {
  const now = Date.now();
  const log: string[] = [];
  if (!opts.dryRun && !opts.force) {
    const claim = await deps.createOnce('fastVoteState', `tick_${Math.floor(now / 60_000)}`, { at: now });
    if (claim !== 'created') return { ran: false, log: ['another tick holds this minute'] };
  }
  if (!opts.dryRun) await ensureCommunityPolls(deps, now);
  const horror = await tickHorrorClassics(deps, now, log, !!opts.dryRun);

  if (!opts.dryRun) {
    const chans = await deps.query('fast_channel_schedules', [{ field: 'hasVoteSlots', op: 'EQUAL', value: true }], 200);
    for (const c of chans) {
      if (c.id === H_CH) continue;
      try { await tickCreatorChannel(deps, c.id, c.data, now, log); }
      catch (e: any) { log.push(`${c.id}: ${String(e?.message || e).slice(0, 160)}`); }
    }
    // Retire ballots older than last night so rooms show tonight's and last night's only.
    const yesterday = addDays(zonedDateKey(now, H_TZ), -1);
    const open = await deps.query('livePolls', [{ field: 'kind', op: 'EQUAL', value: 'SCHEDULE' }, { field: 'active', op: 'EQUAL', value: true }], 300);
    for (const o of open) {
      const date = o.data?.schedule?.date as string | undefined;
      if (date && date < yesterday) await deps.patch('livePolls', o.id, { active: false });
    }
  }
  return { ran: true, changed: horror.changed, log, ...(opts.dryRun ? { preview: horror.preview } : {}) };
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
    if (!/^[A-Za-z0-9_]{1,80}$/.test(room)) return res.status(400).json({ error: 'room required' });
    // Keep schedules moving even before Cloud Scheduler is set up (throttled, fire-and-forget).
    // Production only (or FAST_VOTE_TICK=1): a dev server talks to the production database, and
    // merely opening a room locally must not create ballots or rewrite a channel.
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

  // Pledge toward a slot's commercial-free goal. The card is only AUTHORISED here; it is charged
  // when voting closes if the goal was met, and released otherwise.
  const pledgeLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts, try again shortly' } });
  router.post('/api/live-polls/:id/pledge', pledgeLimiter, deps.authMiddleware, deps.requireRegisteredUser, express.json(), async (req: any, res: any) => {
    try {
      const id = String(req.params.id || '');
      if (!/^[A-Za-z0-9_\-]{1,200}$/.test(id)) return res.status(400).json({ error: 'bad poll id' });
      const poll = await readPoll(deps, id);
      // Creator slots only: a pledge always goes to the creator who owns the slot.
      if (!poll?.funding?.goalCents || !poll.ownerUid) return res.status(404).json({ error: 'This slot has no commercial-free goal' });
      if (poll.status !== 'OPEN' || (poll.closesAtMs && Date.now() >= poll.closesAtMs)) return res.status(409).json({ error: 'Voting has closed for this slot' });
      const remaining = poll.funding.goalCents - (poll.funding.pledgedCents || 0);
      if (remaining <= 0) return res.status(409).json({ error: 'The goal is already met — this airing will be commercial-free' });
      const want = Math.round(Number(req.body?.amountCents));
      if (!(want >= MIN_PLEDGE_CENTS)) return res.status(400).json({ error: 'The smallest pledge is $1' });
      const amount = Math.min(want, MAX_PLEDGE_CENTS, Math.max(MIN_PLEDGE_CENTS, remaining));

      const stripe = deps.getStripe();
      let destination: string | undefined;
      let feeCents = 0;
      {
        if (poll.ownerUid === req.uid) return res.status(400).json({ error: 'You can’t pledge to your own slot' });
        const owner = await deps.read('users', poll.ownerUid);
        destination = owner?.stripeConnectAccountId;
        if (!destination) return res.status(400).json({ error: 'This creator hasn’t set up payouts yet, so pledges can’t reach them.' });
        try {
          const acct = await stripe.accounts.retrieve(destination);
          if (!acct.payouts_enabled) return res.status(400).json({ error: 'This creator can’t receive payouts yet.' });
        } catch { return res.status(400).json({ error: 'Could not verify the creator’s payout account.' }); }
        feeCents = (await deps.hasPlajahPlus(poll.ownerUid)) ? 0 : Math.round(amount * PLATFORM_FEE_PCT_WITHOUT_PLUS);
      }
      const returnPath = typeof req.body?.returnPath === 'string' && /^\/[^/\\]/.test(req.body.returnPath) ? req.body.returnPath.slice(0, 300) : '/';
      const origin = deps.trustedRequestOrigin(req);
      const sep = returnPath.includes('?') ? '&' : '?';
      const meta = { type: 'fast_slot_pledge', pollId: id, uid: req.uid, platformFeeCents: String(feeCents) };
      const title = poll.options.length ? `Commercial-free ${poll.schedule ? 'airing' : 'slot'} — ${poll.subtitle?.split('·')[0]?.trim() || 'Plajah'}` : 'Commercial-free slot';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: title, description: 'Charged only if the goal is met when voting closes. Otherwise your card is released.' }, unit_amount: amount }, quantity: 1 }],
        payment_intent_data: {
          capture_method: 'manual',
          ...(destination ? { transfer_data: { destination } } : {}),
          ...(destination && feeCents > 0 ? { application_fee_amount: feeCents } : {}),
          metadata: meta,
        },
        success_url: `${origin}${returnPath}${sep}slot_pledge=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${returnPath}`,
        metadata: meta,
      });
      res.json({ url: session.url, amountCents: amount, feeCents });
    } catch (e: any) {
      console.error('[fast-vote] pledge', e?.message || e);
      res.status(500).json({ error: 'Could not start the pledge' });
    }
  });

  // Return-page confirmation (works without the webhook; the webhook does the same, idempotently).
  router.post('/api/live-polls/pledges/confirm', deps.authMiddleware, express.json(), async (req: any, res: any) => {
    try {
      const sessionId = String(req.body?.sessionId || '');
      if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return res.status(400).json({ error: 'bad session' });
      const session = await deps.getStripe().checkout.sessions.retrieve(sessionId);
      if (session?.metadata?.uid !== req.uid) return res.status(403).json({ error: 'Not your pledge' });
      res.json(await recordPledgeFromSession(deps, session));
    } catch (e: any) {
      res.status(500).json({ error: 'Could not confirm the pledge' });
    }
  });

  router.post('/api/cron/fast-vote-tick', express.json(), async (req: any, res: any) => {
    if (!deps.cronKeyOk(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await runFastVoteTick(deps, { force: req.query.force === '1' })); }
    catch (e: any) { console.error('[fast-vote] cron', e?.message || e); res.status(500).json({ error: String(e?.message || e).slice(0, 300) }); }
  });

  // Read-only: what the next tick would lay out for Horror Classics. Writes nothing. Keyless on a dev server.
  router.get('/api/cron/fast-vote-preview', async (req: any, res: any) => {
    if (!deps.cronKeyOk(req) && process.env.NODE_ENV === 'production') return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await runFastVoteTick(deps, { dryRun: true })); }
    catch (e: any) { res.status(500).json({ error: String(e?.message || e).slice(0, 300) }); }
  });

  return {
    router,
    /** Stripe webhook hook: checkout.session.completed with metadata.type 'fast_slot_pledge'. */
    onPledgeCheckoutCompleted: (session: any) => recordPledgeFromSession(deps, session),
  };
}
