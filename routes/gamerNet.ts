// Plajah Gamer Network — open API for profiles, the gamer ledger, unified matchmaking, refereed online
// matches and leaderboards. Mounted at /api/gamer (server.ts). Spec: docs/GAMER_NETWORK.md.
//
//   GET    /games                         registered first-party games
//   GET    /me                            my profile (created on first call)
//   GET    /profile/:uid                  public profile: score card, ratings, record, achievements
//   GET    /history/:uid?limit=30         newest ledger entries
//   GET    /verify/:uid                   re-walk the chain + recompute the score from genesis
//   POST   /recalculate                   replace my cached score with the recomputed one
//   GET    /leaderboard?game=all|ttt      top players by universal score or game rating
//   POST   /local       {game,result,vs}  same-device / vs-CPU game → history only
//   POST   /queue       {game}            join matchmaking   → { status, matchId? }
//   GET    /queue?game=ttt                poll (also tries to pair)
//   DELETE /queue?game=ttt                leave
//   POST   /private     {game}            invite match       → { matchId, code }
//   POST   /join        {code}            join an invite     → { matchId }
//   GET    /match/:id                     match state (applies an expired move clock)
//   POST   /match/:id/move  {move, v}
//   POST   /match/:id/resign
//   POST   /match/:id/rematch
//   GET    /links                         my linked platforms + what can be linked
//   POST   /links/steam/start {returnPath} → { url } Steam sign-in (OpenID); state is one-time, 10 min
//   GET    /links/steam/return            Steam redirects here: verify, link, first import, redirect back
//   POST   /links/steam/sync              import the change since the last sync → { imported, more }
//   DELETE /links/steam                   unlink (ledger history and the per-game baseline stay)
//
// Every write goes through the service account (rules never apply), so each handler checks the caller.
// Match docs change only through services/gamerNet/match.ts inside a compare-and-swap; results reach the
// ledger only from a refereed finish, exactly once per match (idempotency key `match:<id>`).

import { Router, type Request, type Response } from 'express';
import { randomUUID, randomInt } from 'node:crypto';
import { casUpdate } from '../services/casCore';
import type { GamerStore } from '../services/gamerNet/store';
import { GAMES, gameRules, canLogPlay } from '../services/gamerNet/registry';
import { GENESIS, entryId, makeEntry, verifyChain, type GamerEntry, type GamerEventBody } from '../services/gamerNet/ledger';
import { applyEvent, emptyFold, emptyStats, newlyEarned, recalculate, scoreOf, type GamerFold } from '../services/gamerNet/score';
import { nextRating, START_RATING } from '../services/gamerNet/rating';
import { pickOpponent, type Ticket } from '../services/gamerNet/matchmaking';
import * as M from '../services/gamerNet/match';
import * as Steam from '../services/gamerNet/links/steam';
import { LINKABLE } from '../services/gamerNet/links/platforms';

export interface UserCard { name: string; photo?: string; isChild?: boolean }
export interface GamerDeps {
  store: GamerStore;
  verify(idToken: string): Promise<string | null>;
  userCard(uid: string): Promise<UserCard | null>;
  now?: () => number;
  /** Platform linking. Without apiKey the Steam link answers 503 (never mock data on real accounts). */
  steam?: { apiKey?: string; fetch?: Steam.Fetch; loginBase?: string };
  /** Origin Steam redirects back to (e.g. https://plajah.com). Defaults to the request's own origin. */
  publicOrigin?: string;
}

const PROFILES = 'gamerProfiles', LEDGER = 'gamerLedger', MATCHES = 'gamerMatches', QUEUE = 'gamerQueue';
const LINKS = 'gamerLinks', LINK_CLAIMS = 'gamerLinkClaims', LINK_STATES = 'gamerLinkStates';
/** Per sync request: games imported and achievement lookups (each lookup is one Steam API call). */
export const STEAM_GAMES_PER_PASS = 40;
export const STEAM_SYNC_COOLDOWN_MS = 10 * 60_000;
const STEAM_LEASE_MS = 2 * 60_000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export type GamerAppend = (uid: string, body: GamerEventBody) => Promise<{ entry: GamerEntry; fold: GamerFold } | null>;

/** The router, plus its ledger writer so other first-party games (routes/liveGames.ts) append through the same chain. */
export function createGamerRouter(deps: GamerDeps): Router & { appendEvent: GamerAppend } {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const r = Router();

  const uidOf = async (req: Request): Promise<string | null> => {
    const a = req.headers.authorization; return a?.startsWith('Bearer ') ? deps.verify(a.slice(7)) : null;
  };
  const needUid = async (req: Request, res: Response): Promise<string | null> => {
    const uid = await uidOf(req); if (!uid) res.status(401).json({ error: 'Sign in to play online' }); return uid;
  };

  // ───────────────────────────────────────────── profiles + ledger
  async function ensureProfile(uid: string): Promise<Record<string, any> | null> {
    const have = await store.get(PROFILES, uid); if (have) return have;
    const card = (await deps.userCard(uid).catch(() => null)) ?? { name: 'Player' };
    const fold = emptyFold();
    const doc = {
      uid, name: card.isChild ? 'Player' : s(card.name, 60) || 'Player', photo: card.isChild ? '' : s(card.photo, 500),
      isChild: !!card.isChild, public: !card.isChild, fold, score: 0, scoreCard: scoreOf(fold), ratings: {},
      ledgerSeq: 0, ledgerHead: GENESIS, recentKeys: [], createdAt: now(), updatedAt: now(),
    };
    await store.createOnce(PROFILES, uid, doc);
    return store.get(PROFILES, uid);
  }

  const profilePatch = (p: Record<string, any>, fold: GamerFold, e: GamerEntry) => ({
    fold, ledgerSeq: e.seq, ledgerHead: e.hash, recentKeys: [...(p.recentKeys ?? []), e.key].slice(-100),
    score: scoreOf(fold).total, scoreCard: scoreOf(fold),
    ratings: Object.fromEntries(Object.entries(fold.games).map(([g, st]) => [g, st.rating])), updatedAt: now(),
  });

  /** Append one event to a player's chain and fold it into their profile. Idempotent on body.key. */
  async function appendEvent(uid: string, body: GamerEventBody): Promise<{ entry: GamerEntry; fold: GamerFold } | null> {
    const profiles = store.cas(PROFILES);
    for (let attempt = 0; attempt < 12; attempt++) {
      const cur = await profiles.get(uid);
      if (!cur) { if (!(await ensureProfile(uid))) return null; continue; }
      const p = cur.data;
      if ((p.recentKeys ?? []).includes(body.key)) return null;
      const seq = (Number(p.ledgerSeq) || 0) + 1;
      let entry = makeEntry(body, seq, p.ledgerHead || GENESIS);
      const w = await store.createOnce(LEDGER, entryId(uid, seq), entry as unknown as Record<string, unknown>);
      if (w === 'error') return null;
      if (w === 'exists') {
        const ex = (await store.get(LEDGER, entryId(uid, seq))) as GamerEntry | null;
        if (!ex?.hash) return null;
        if (ex.key !== body.key) {
          // An earlier append wrote its entry but lost the profile race: adopt it, then retry ours.
          await profiles.put(uid, profilePatch(p, applyEvent(p.fold ?? emptyFold(), ex), ex), cur.version);
          continue;
        }
        entry = ex;
      }
      const fold = applyEvent(p.fold ?? emptyFold(), entry);
      const put = await profiles.put(uid, profilePatch(p, fold, entry), cur.version);
      if (put === 'ok') return { entry, fold };
      if (put === 'error') return null;
    }
    return null;
  }

  async function readChain(uid: string, fromSeq: number, toSeq: number): Promise<GamerEntry[]> {
    const ids: number[] = []; for (let q = fromSeq; q <= toSeq; q++) ids.push(q);
    const out: GamerEntry[] = [];
    for (let i = 0; i < ids.length; i += 25) {
      const part = await Promise.all(ids.slice(i, i + 25).map(q => store.get(LEDGER, entryId(uid, q))));
      for (const e of part) if (e) out.push(e as GamerEntry);
    }
    return out;
  }

  const publicProfile = (p: Record<string, any>) => {
    const fold: GamerFold = p.fold ?? emptyFold();
    return {
      uid: p.uid, name: p.name, photo: p.photo || '', score: p.score ?? 0, scoreCard: p.scoreCard ?? scoreOf(fold),
      games: fold.games, achievements: fold.achievementIds, platforms: fold.platforms, externalHours: Math.round((fold.externalHours ?? 0) * 10) / 10, localPlays: fold.localPlays,
      ledger: { length: p.ledgerSeq ?? 0, head: p.ledgerHead ?? GENESIS }, since: p.createdAt,
    };
  };

  r.get('/games', (_req, res) => { res.json({ games: Object.values(GAMES).map(g => ({ id: g.id, title: g.title, moveTimeMs: g.moveTimeMs })) }); });

  r.get('/me', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const p = await ensureProfile(uid); if (!p) { res.status(503).json({ error: 'Profile store unavailable' }); return; }
    res.json({ profile: publicProfile(p), public: p.public !== false });
  });

  r.get('/profile/:uid', async (req, res) => {
    const p = await store.get(PROFILES, s(req.params.uid, 128));
    if (!p) { res.status(404).json({ error: 'No gamer profile yet' }); return; }
    res.json({ profile: publicProfile(p) });
  });

  r.get('/history/:uid', async (req, res) => {
    const uid = s(req.params.uid, 128);
    const p = await store.get(PROFILES, uid); if (!p) { res.json({ entries: [] }); return; }
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
    const top = Number(p.ledgerSeq) || 0;
    const entries = (await readChain(uid, Math.max(1, top - limit + 1), top)).sort((a, b) => b.seq - a.seq);
    res.json({ entries });
  });

  r.get('/verify/:uid', async (req, res) => {
    const uid = s(req.params.uid, 128);
    const p = await store.get(PROFILES, uid); if (!p) { res.status(404).json({ error: 'No gamer profile yet' }); return; }
    const top = Math.min(Number(p.ledgerSeq) || 0, 5000);
    const chain = await readChain(uid, 1, top);
    const check = verifyChain(chain);
    const recomputed = scoreOf(recalculate(chain));
    res.json({ chain: check, headMatchesProfile: check.head === (p.ledgerHead || GENESIS), stored: p.scoreCard, recomputed, scoreMatches: recomputed.total === p.score });
  });

  r.post('/recalculate', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const cur = await store.get(PROFILES, uid); if (!cur) { res.status(404).json({ error: 'No gamer profile yet' }); return; }
    const chain = await readChain(uid, 1, Math.min(Number(cur.ledgerSeq) || 0, 5000));
    const check = verifyChain(chain);
    if (!check.ok) { res.status(409).json({ error: `Ledger check failed: ${check.problem}` }); return; }
    const fold = recalculate(chain);
    const out = await casUpdate(store.cas(PROFILES), uid, p => (p ? { patch: { fold, score: scoreOf(fold).total, scoreCard: scoreOf(fold), ratings: Object.fromEntries(Object.entries(fold.games).map(([g, st]) => [g, st.rating])), updatedAt: now() }, result: true } : { abort: true, result: false }));
    res.json({ ok: out.ok, scoreCard: scoreOf(fold) });
  });

  r.get('/leaderboard', async (req, res) => {
    const game = s(req.query.game, 20) || 'all';
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    if (game !== 'all' && !gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const field = game === 'all' ? 'score' : `ratings.${game}`;
    // A <= bound + order on the same field needs only Firestore's automatic single-field index.
    const rows = await store.query(PROFILES, [{ field, value: 1e9, op: 'LESS_THAN_OR_EQUAL' }], limit * 2, { field, direction: 'DESCENDING' });
    const players = rows.map(x => x.data).filter(p => p.public !== false).slice(0, limit).map((p, i) => {
      const g = game === 'all' ? null : (p.fold?.games?.[game] ?? emptyStats());
      return { rank: i + 1, uid: p.uid, name: p.name, photo: p.photo || '', score: p.score ?? 0, ...(g ? { rating: g.rating, wins: g.wins, losses: g.losses, draws: g.draws } : {}) };
    });
    res.json({ game, players });
  });

  r.post('/local', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 20); if (!canLogPlay(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const result = ['win', 'loss', 'draw'].includes(req.body?.result) ? req.body.result : undefined;
    const vs = req.body?.vs === 'cpu' ? `vs CPU (${s(req.body?.level, 10) || 'normal'})` : 'same device';
    const out = await appendEvent(uid, { event: 'LOCAL_PLAY', uid, at: now(), key: `local:${randomUUID()}`, source: 'self', game, result, note: vs });
    res.json({ ok: !!out });
  });

  // ───────────────────────────────────────────── matches
  async function card(uid: string, game: string): Promise<M.PlayerCard> {
    const p = await ensureProfile(uid);
    const rating = p?.fold?.games?.[game]?.rating ?? START_RATING;
    return { uid, name: p?.name || 'Player', photo: p?.photo || '', rating };
  }

  async function settle(doc: M.MatchDoc): Promise<void> {
    if (doc.status !== 'done' || doc.settled || doc.players.length < 2 || doc.endReason === 'abandoned') return;
    const profs = await Promise.all(doc.players.map(u => ensureProfile(u)));
    const stats = profs.map(p => p?.fold?.games?.[doc.game] ?? emptyStats());
    for (const seat of [0, 1] as const) {
      const uid = doc.players[seat], opp = 1 - seat;
      const result = M.resultFor(doc, seat);
      const sc = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
      const before = stats[seat].rating;
      const after = doc.rated ? nextRating(before, stats[opp].rating, sc, stats[seat].rated) : before;
      const out = await appendEvent(uid, {
        event: 'MATCH_RESULT', uid, at: doc.updatedAt, key: `match:${doc.id}`, source: 'first-party', game: doc.game, matchId: doc.id,
        opponentUid: doc.players[opp], result, rated: doc.rated, reason: doc.endReason, ratingBefore: before, ratingAfter: after,
      });
      if (!out) continue;
      for (const a of newlyEarned(out.fold, doc.game)) {
        await appendEvent(uid, { event: 'ACHIEVEMENT', uid, at: doc.updatedAt, key: `ach:${a.id}`, source: 'first-party', game: doc.game, achievementId: a.id, points: a.points, note: a.title });
      }
    }
    await casUpdate(store.cas(MATCHES), doc.id, cur => (cur && !cur.settled ? { patch: { settled: true }, result: true } : { abort: true, result: false }));
  }

  /** Advance a match through a pure step inside a CAS; settle it if this step finished it. */
  async function step(id: string, fn: (doc: M.MatchDoc) => M.Step | null): Promise<{ doc: M.MatchDoc } | { error: string; status: number }> {
    // Held in an object so TypeScript doesn't narrow these to their initial values across the callback.
    const box: { finished: boolean; after: M.MatchDoc | null; err: { error: string; status: number } | null } = { finished: false, after: null, err: null };
    const out = await casUpdate(store.cas(MATCHES), id, cur => {
      box.finished = false; box.err = null;
      if (!cur) { box.err = { error: 'Match not found', status: 404 }; return { abort: true, result: null }; }
      const st = fn(cur as M.MatchDoc);
      if (!st) { box.after = cur as M.MatchDoc; return { abort: true, result: null }; }
      if ('error' in st) { box.err = { error: st.error, status: st.status }; return { abort: true, result: null }; }
      box.finished = st.finished; box.after = st.doc;
      return { patch: st.doc as unknown as Record<string, any>, result: null };
    });
    if (box.err) return box.err;
    if ('reason' in out && out.reason !== 'ABORT') return { error: 'The match is busy — try again', status: 503 };
    if (out.ok && box.finished && box.after) await settle(box.after);
    // Settle catches up on a finish whose settle step was interrupted earlier.
    else if (box.after && box.after.status === 'done' && !box.after.settled) await settle(box.after);
    const fresh = (await store.get(MATCHES, id)) as M.MatchDoc | null;
    return fresh ? { doc: fresh } : { error: 'Match not found', status: 404 };
  }

  const view = (doc: M.MatchDoc, uid: string | null) => ({ match: doc, you: uid ? doc.players.indexOf(uid) : -1, serverNow: now() });

  r.post('/private', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    const doc = M.newMatch({ id: randomUUID(), game, rated: false, now: now(), seat0: await card(uid, game), code });
    if (!doc || (await store.createOnce(MATCHES, doc.id, doc as unknown as Record<string, unknown>)) !== 'created') { res.status(503).json({ error: 'Could not open a match' }); return; }
    res.json({ matchId: doc.id, code });
  });

  r.post('/join', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const code = s(req.body?.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { res.status(400).json({ error: 'Codes are 6 letters and numbers' }); return; }
    const rows = await store.query(MATCHES, [{ field: 'code', value: code }, { field: 'status', value: 'waiting' }], 5);
    const hit = rows.find(x => now() - Number(x.data.createdAt) < 6 * 3600_000);
    if (!hit) { res.status(404).json({ error: 'No open match with that code' }); return; }
    const c = await card(uid, hit.data.game);
    const out = await step(hit.id, d => M.join(d, c, now()));
    if ('error' in out) { res.status(out.status).json({ error: out.error }); return; }
    res.json({ matchId: hit.id });
  });

  r.get('/match/:id', async (req, res) => {
    const uid = await uidOf(req);
    const out = await step(s(req.params.id, 64), d => M.timeout(d, now()));
    if ('error' in out) { res.status(out.status).json({ error: out.error }); return; }
    res.json(view(out.doc, uid));
  });

  r.post('/match/:id/move', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const v = req.body?.v === undefined ? undefined : Number(req.body.v);
    const out = await step(s(req.params.id, 64), d => M.timeout(d, now()) ?? M.move(d, uid, req.body?.move, v, now()));
    if ('error' in out) { res.status(out.status).json({ error: out.error }); return; }
    res.json(view(out.doc, uid));
  });

  r.post('/match/:id/resign', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const out = await step(s(req.params.id, 64), d => M.resign(d, uid, now()));
    if ('error' in out) { res.status(out.status).json({ error: out.error }); return; }
    res.json(view(out.doc, uid));
  });

  r.post('/match/:id/rematch', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const id = s(req.params.id, 64);
    const nextId = randomUUID();
    const box: { create: M.MatchDoc | null } = { create: null };
    const out = await casUpdate(store.cas(MATCHES), id, cur => {
      box.create = null;
      const d = cur as M.MatchDoc | null;
      if (!d || d.status !== 'done' || !d.players.includes(uid) || d.players.length < 2) return { abort: true, result: 'invalid' as const };
      if (d.nextMatchId) return { abort: true, result: 'exists' as const };
      const votes = Array.from(new Set([...(d.rematchVotes ?? []), uid]));
      if (votes.length < 2) return { patch: { rematchVotes: votes }, result: 'voted' as const };
      // Both want another: swap seats so the other player opens.
      box.create = M.newMatch({ id: nextId, game: d.game, rated: false, now: now(), seat0: { ...d.cards[1] }, seat1: { ...d.cards[0] } });
      return { patch: { rematchVotes: votes, nextMatchId: nextId }, result: 'created' as const };
    });
    if (!out.ok && out.result === 'invalid') { res.status(409).json({ error: 'Rematch not available' }); return; }
    if (out.ok && out.result === 'created' && box.create) await store.createOnce(MATCHES, nextId, box.create as unknown as Record<string, unknown>);
    const fresh = (await store.get(MATCHES, id)) as M.MatchDoc | null;
    // Heal: the vote landed but the new match write was lost — create it now from the finished one.
    if (fresh?.nextMatchId && !(await store.get(MATCHES, fresh.nextMatchId))) {
      const again = M.newMatch({ id: fresh.nextMatchId, game: fresh.game, rated: false, now: now(), seat0: { ...fresh.cards[1] }, seat1: { ...fresh.cards[0] } });
      if (again) await store.createOnce(MATCHES, again.id, again as unknown as Record<string, unknown>);
    }
    res.json(fresh ? view(fresh, uid) : { error: 'Match not found' });
  });

  // ───────────────────────────────────────────── matchmaking
  const tid = (game: string, uid: string) => `${game}__${uid}`;

  async function tryPair(game: string, uid: string): Promise<string | null> {
    const q = store.cas(QUEUE);
    const mine = await q.get(tid(game, uid));
    if (!mine) return null;
    if (mine.data.status === 'matched') return mine.data.matchId || null;
    const t = now();
    await q.put(tid(game, uid), { seenAt: t }, mine.version);
    const me: Ticket = { uid, rating: Number(mine.data.rating) || START_RATING, joinedAt: Number(mine.data.joinedAt) || t, seenAt: t };
    const rows = await store.query(QUEUE, [{ field: 'game', value: game }, { field: 'status', value: 'waiting' }], 50);
    const opp = pickOpponent(me, rows.map(x => x.data as Ticket), t);
    if (!opp) return null;

    const matchId = randomUUID();
    const claimMe = await casUpdate(q, tid(game, uid), cur => (cur?.status === 'waiting' ? { patch: { status: 'matched', matchId }, result: matchId } : { abort: true, result: (cur?.matchId as string) || '' }));
    if (!claimMe.ok) return claimMe.result || null;
    // Whoever waited longer opens as X.
    const first = opp.joinedAt <= me.joinedAt ? opp.uid : uid, second = first === uid ? opp.uid : uid;
    const doc = M.newMatch({ id: matchId, game, rated: true, now: t, seat0: await card(first, game), seat1: await card(second, game) });
    const made = doc ? await store.createOnce(MATCHES, matchId, doc as unknown as Record<string, unknown>) : 'error';
    const claimOpp = made === 'created'
      ? await casUpdate(q, tid(game, opp.uid), cur => (cur?.status === 'waiting' ? { patch: { status: 'matched', matchId }, result: true } : { abort: true, result: false }))
      : { ok: false as const };
    if (!claimOpp.ok) {
      if (made === 'created') await store.del(MATCHES, matchId);
      await casUpdate(q, tid(game, uid), cur => (cur?.matchId === matchId ? { patch: { status: 'waiting', matchId: '' }, result: true } : { abort: true, result: false }));
      return null;
    }
    return matchId;
  }

  r.post('/queue', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const c = await card(uid, game);
    const t = now();
    const put = await casUpdate(store.cas(QUEUE), tid(game, uid), () => ({ patch: { game, uid, rating: c.rating, joinedAt: t, seenAt: t, status: 'waiting', matchId: '' }, result: true }));
    if (!put.ok) { res.status(503).json({ error: 'Matchmaking is busy — try again' }); return; }
    const matchId = await tryPair(game, uid);
    res.json(matchId ? { status: 'matched', matchId } : { status: 'waiting', rating: c.rating });
  });

  r.get('/queue', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.query.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const t = await store.get(QUEUE, tid(game, uid));
    if (!t) { res.json({ status: 'idle' }); return; }
    const matchId = await tryPair(game, uid);
    res.json(matchId ? { status: 'matched', matchId } : { status: 'waiting', waitedMs: now() - Number(t.joinedAt || now()) });
  });

  r.delete('/queue', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.query.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    // Only drop a ticket that is still waiting; a matched one already has a game behind it.
    const out = await casUpdate(store.cas(QUEUE), tid(game, uid), cur => (cur?.status === 'waiting' ? { patch: { status: 'left' }, result: 'left' } : { abort: true, result: (cur?.matchId as string) || '' }));
    res.json(out.ok ? { status: 'left' } : out.result ? { status: 'matched', matchId: out.result } : { status: 'idle' });
  });

  // ───────────────────────────────────────────── linked platforms
  // gamerLinks/{uid}__steam        { steamId, name, avatar, games: { appid: {m,a,c} }, syncSeq, pendingSync, … }
  // gamerLinkClaims/steam__{id}    { uid } — one Steam account feeds one Plajah ledger (kept on unlink)
  // gamerLinkStates/{nonce}        { uid, returnPath, exp } — one-time OpenID state
  const steamFetch: Steam.Fetch = deps.steam?.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<Steam.Fetch>);
  const steamKey = deps.steam?.apiKey ?? '';
  const linkId = (uid: string, platform: string) => `${uid}__${platform}`;
  const originOf = (req: Request) => (deps.publicOrigin || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const safePath = (p: unknown) => { const v = s(p, 300); return v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : '/'; };
  const steamReturnTo = (req: Request, nonce: string) => `${originOf(req)}/api/gamer/links/steam/return?state=${nonce}`;

  const linkView = (l: Record<string, any>) => {
    const games = Object.values<any>(l.games ?? {});
    return {
      platform: String(l.platform), accountId: String(l.steamId ?? ''), name: String(l.name || ''), avatar: String(l.avatar || ''), profileUrl: String(l.profileUrl || ''),
      linkedAt: Number(l.linkedAt) || 0, lastSyncAt: Number(l.lastSyncAt) || 0, pending: !!l.pendingSync, error: String(l.error || ''),
      games: games.filter(g => Number(g.m) > 0).length,
      hours: Steam.hoursOf(games.reduce((a, g) => a + (Number(g.m) || 0), 0)),
      achievements: games.reduce((a, g) => a + (Number(g.a) || 0), 0),
    };
  };

  r.get('/links', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const steam = await store.get(LINKS, linkId(uid, 'steam'));
    res.json({
      links: steam?.status === 'linked' ? [linkView(steam)] : [],
      platforms: LINKABLE.map(p => ({ ...p, available: p.id === 'steam' && !!steamKey })),
    });
  });

  r.post('/links/steam/start', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    if (!steamKey) { res.status(503).json({ error: 'Steam linking is not switched on yet' }); return; }
    const nonce = randomUUID();
    const returnPath = safePath(req.body?.returnPath);
    if ((await store.createOnce(LINK_STATES, nonce, { uid, platform: 'steam', returnPath, exp: now() + 10 * 60_000 })) !== 'created') { res.status(503).json({ error: 'Could not start the Steam sign-in' }); return; }
    res.json({ url: Steam.steamLoginUrl(steamReturnTo(req, nonce), originOf(req), deps.steam?.loginBase) });
  });

  r.get('/links/steam/return', async (req, res) => {
    const nonce = s(req.query.state, 64);
    const st = nonce ? await store.get(LINK_STATES, nonce) : null;
    if (st) await store.del(LINK_STATES, nonce); // one-time, whatever happens next
    const back = (status: 'ok' | 'error', reason = '') => {
      const path = safePath(st?.returnPath);
      res.redirect(302, `${path}${path.includes('?') ? '&' : '?'}gamerLink=steam&status=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`);
    };
    if (!st || st.platform !== 'steam' || Number(st.exp) < now()) { back('error', 'expired'); return; }
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') params[k] = v;
    const check = await Steam.verifySteamAssertion(params, steamReturnTo(req, nonce), steamFetch);
    if (check.ok === false) { back('error', check.reason); return; }
    const uid = String(st.uid);
    // One Steam account → one Plajah ledger, for good: unlinking keeps the claim, so a library can't be
    // walked from account to account collecting its playtime again.
    const claimId = `steam__${check.steamId}`;
    if ((await store.createOnce(LINK_CLAIMS, claimId, { uid, at: now() })) === 'error') { back('error', 'busy'); return; }
    if ((await store.get(LINK_CLAIMS, claimId))?.uid !== uid) { back('error', 'claimed'); return; }
    await ensureProfile(uid);
    const out = await casUpdate(store.cas(LINKS), linkId(uid, 'steam'), cur => {
      if (cur?.status === 'linked' && cur.steamId !== check.steamId) return { abort: true, result: 'other' as const };
      const same = cur?.steamId === check.steamId; // relinking the same account keeps its baseline
      return {
        patch: {
          uid, platform: 'steam', steamId: check.steamId, status: 'linked', linkedAt: same && cur?.linkedAt ? cur.linkedAt : now(),
          games: same ? (cur?.games ?? {}) : {}, syncSeq: same ? (Number(cur?.syncSeq) || 0) : 0, pendingSync: same ? (Number(cur?.pendingSync) || 0) : 0,
          lastSyncAt: same ? (Number(cur?.lastSyncAt) || 0) : 0, leaseUntil: 0, error: '',
        },
        result: 'ok' as const,
      };
    });
    if (!out.ok) { back('error', out.result === 'other' ? 'unlink-first' : 'busy'); return; }
    await syncSteam(uid, true).catch(() => null);
    back('ok');
  });

  type SyncOut =
    | { ok: true; imported: number; checked: number; hours: number; achievements: number; more: boolean; link: ReturnType<typeof linkView> }
    | { ok: false; status: number; error: string };

  /** One bounded pass over the library: at most STEAM_GAMES_PER_PASS games (and Steam calls) per request. */
  async function syncSteam(uid: string, force = false): Promise<SyncOut> {
    if (!steamKey) return { ok: false, status: 503, error: 'Steam linking is not switched on yet' };
    const links = store.cas(LINKS), id = linkId(uid, 'steam');
    const t = now();
    // Lease: one pass at a time. A sync still pending (big library, or an interrupted pass) resumes with the
    // same sync number, so its ledger keys repeat and appendEvent drops anything already written.
    const lease = await casUpdate(links, id, cur => {
      if (!cur || cur.status !== 'linked') return { abort: true, result: 'none' as const };
      if (Number(cur.leaseUntil) > t) return { abort: true, result: 'busy' as const };
      if (!force && !cur.pendingSync && Number(cur.lastSyncAt) + STEAM_SYNC_COOLDOWN_MS > t) return { abort: true, result: 'cooldown' as const };
      return { patch: { leaseUntil: t + STEAM_LEASE_MS, pendingSync: Number(cur.pendingSync) || (Number(cur.syncSeq) || 0) + 1 }, result: 'ok' as const };
    });
    if (!lease.ok) {
      const why = lease.result;
      return why === 'none' ? { ok: false, status: 404, error: 'Steam is not linked' }
        : why === 'cooldown' ? { ok: false, status: 429, error: 'Synced a few minutes ago — try again later' }
        : why === 'busy' ? { ok: false, status: 409, error: 'A Steam sync is already running' }
        : { ok: false, status: 503, error: 'Link store busy — try again' };
    }
    const link = (await store.get(LINKS, id)) ?? {};
    const steamId = String(link.steamId), sync = Number(link.pendingSync);
    const release = (patch: Record<string, unknown>) => casUpdate(links, id, cur => (cur ? { patch: { leaseUntil: 0, ...patch }, result: true } : { abort: true, result: false }));
    try {
      const summary = await Steam.steamSummary(steamFetch, steamKey, steamId);
      if (!summary.isPublic) throw new Steam.SteamApiError('Steam profile is private', 'private');
      const library = await Steam.steamOwnedGames(steamFetch, steamKey, steamId);
      const base: Steam.Baselines = { ...(link.games ?? {}) };
      const todo = Steam.candidates(library, base);
      const batch = todo.slice(0, STEAM_GAMES_PER_PASS);
      let imported = 0, minutes = 0, ach = 0, stalled = false;
      for (const g of batch) {
        const fetched = g.minutes > 0 ? await Steam.steamAchievements(steamFetch, steamKey, steamId, g.appid) : null;
        const plan = Steam.planImport(g, base[g.appid], fetched);
        if (plan.minutes > 0 || plan.achievements > 0) {
          const key = Steam.importKey(steamId, g.appid, sync, plan.next);
          const out = await appendEvent(uid, {
            event: 'EXTERNAL_IMPORT', uid, at: t, key, source: 'linked',
            platform: 'steam', externalGameId: String(g.appid), hours: Steam.hoursOf(plan.minutes), achievementsUnlocked: plan.achievements, note: g.name,
          });
          if (out) { imported++; minutes += plan.minutes; ach += plan.achievements; }
          // null = already on the ledger (a resumed pass) or a store failure; only the first may advance the baseline.
          else if (!((await store.get(PROFILES, uid))?.recentKeys ?? []).includes(key)) { stalled = true; break; }
        }
        base[g.appid] = plan.next;
      }
      const more = stalled || todo.length > batch.length;
      await release({
        games: base, name: summary.name, avatar: summary.avatar, profileUrl: summary.profileUrl, error: '',
        ...(more ? {} : { syncSeq: sync, pendingSync: 0, lastSyncAt: t }),
      });
      const fresh = (await store.get(LINKS, id)) ?? link;
      return { ok: true, imported, checked: batch.length, hours: Steam.hoursOf(minutes), achievements: ach, more, link: linkView(fresh) };
    } catch (e) {
      const isPrivate = e instanceof Steam.SteamApiError && e.code === 'private';
      const error = isPrivate ? 'Your Steam profile or game details are private — set both to Public in Steam, then sync again' : 'Steam is not answering right now — try again later';
      await release({ error });
      return { ok: false, status: isPrivate ? 422 : 502, error };
    }
  }

  r.post('/links/steam/sync', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const out = await syncSteam(uid);
    if (out.ok === false) { res.status(out.status).json({ error: out.error }); return; }
    const { ok: _ok, ...rest } = out;
    res.json(rest);
  });

  r.delete('/links/steam', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const out = await casUpdate(store.cas(LINKS), linkId(uid, 'steam'), cur => (cur?.status === 'linked' ? { patch: { status: 'unlinked', unlinkedAt: now(), leaseUntil: 0 }, result: true } : { abort: true, result: false }));
    res.json({ ok: out.ok });
  });

  return Object.assign(r, { appendEvent });
}
