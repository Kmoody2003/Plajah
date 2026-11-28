// Gamer Network × Realtime: matchmaking, join tickets and result intake for realtime games.
// Mounted by routes/gamerNet.ts at /api/gamer/rt when the realtime secrets are configured.
//
//   GET    /rt/config                     { enabled, games }
//   POST   /rt/queue    {game}            rated 1v1 matchmaking → { status, matchId? }
//   GET    /rt/queue?game=apex-race         poll (also tries to pair)
//   DELETE /rt/queue?game=apex-race         leave
//   POST   /rt/private  {game}            friendly room with a code → { matchId, code }
//   POST   /rt/join     {code}            take the next seat → { matchId }
//   GET    /rt/match/:id                  roster + status
//   POST   /rt/ticket   {matchId}         short-lived signed join ticket → { ticket, url, seat, expiresAt }
//   POST   /rt/result                     realtime server only (HMAC-signed): standings → ledger
//
// Matchmaking stays here; the realtime server never calls Firebase. It trusts a ticket because only this
// API holds the ticket secret, and the API trusts a result because only the realtime server holds the
// result secret. Results reach the ledger once per match (key `rt:<matchId>`), source 'first-party'.

import { Router, type Request, type Response } from 'express';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { casUpdate } from '../services/casCore';
import type { GamerStore } from '../services/gamerNet/store';
import type { GamerEventBody } from '../services/gamerNet/ledger';
import { emptyStats, newlyEarned } from '../services/gamerNet/score';
import { START_RATING } from '../services/gamerNet/rating';
import { pickOpponent, type Ticket } from '../services/gamerNet/matchmaking';
import { REALTIME_GAMES, realtimeGame, cleanMeta, type RoomMeta } from '../services/realtime/games';
import { signTicket, verifyBody, TICKET_TTL_MS, RESULT_SIG_HEADER, RESULT_TS_HEADER } from '../services/realtime/ticket';
import { settlementPlan } from '../services/realtime/settle';
import type { GamerAppend } from './gamerNet';

export interface RealtimeConfig {
  /** GAMER_RT_TICKET_SECRET — shared with the realtime service. */
  ticketSecret: string;
  /** GAMER_RT_RESULT_SECRET — the realtime service signs results with it. */
  resultSecret: string;
  /** GAMER_RT_URLS — public wss:// URLs, one per realtime shard. A room always lives on hash(matchId) % n. */
  urls: string[];
}

export interface RealtimeRouteDeps extends RealtimeConfig {
  store: GamerStore;
  now: () => number;
  needUid(req: Request, res: Response): Promise<string | null>;
  profile(uid: string): Promise<Record<string, any> | null>;
  appendEvent: GamerAppend;
}

export const RT_MATCHES = 'gamerRtMatches';
export const RT_QUEUE = 'gamerRtQueue';
const MATCH_FRESH_MS = 6 * 3600_000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export interface RtMatch {
  id: string; game: string; rated: boolean; status: 'open' | 'done';
  players: string[]; names: string[]; url: string; code?: string;
  /** True for drop-in persistent open-world shards (shared pool, seats may be recycled via '' holes). */
  isShard?: boolean;
  /** Optional room metadata (e.g. circuitId, region), signed into tickets so every peer agrees on settings. */
  meta?: RoomMeta;
  createdAt: number; updatedAt: number; settled?: boolean; endedAt?: number;
  standings?: Array<{ uid: string; place: number; timeMs: number | null; dnf: boolean }>;
  plan?: GamerEventBody[];
}

/** Active player count (ignores '' recycled seat holes in drop-in shards). */
const activeCount = (players: ReadonlyArray<string>) => players.reduce((n, u) => n + (u ? 1 : 0), 0);
/** Assign a player into the first freed '' hole or append to the end (keeps existing seats stable). */
function assignSeat(players: string[], names: string[], uid: string, name: string): { players: string[]; names: string[] } {
  const nextP = [...players], nextN = [...names];
  const hole = nextP.indexOf('');
  if (hole >= 0) { nextP[hole] = uid; nextN[hole] = name; }
  else { nextP.push(uid); nextN.push(name); }
  return { players: nextP, names: nextN };
}

/** Sticky shard: the same match id always maps to the same realtime URL. */
export function shardUrl(urls: ReadonlyArray<string>, matchId: string): string {
  if (!urls.length) return '';
  const h = createHash('sha256').update(matchId).digest().readUInt32BE(0);
  return urls[h % urls.length];
}

export function createRealtimeRoutes(d: RealtimeRouteDeps): Router {
  const r = Router();
  const { store, now } = d;

  const nameOf = async (uid: string) => s((await d.profile(uid))?.name, 40) || 'Player';
  const statsOf = async (uid: string, game: string) => {
    const g = (await d.profile(uid))?.fold?.games?.[game] ?? emptyStats();
    return { rating: Number(g.rating) || START_RATING, rated: Number(g.rated) || 0 };
  };
  async function createMatch(game: string, rated: boolean, players: string[], opts: { code?: string; isShard?: boolean; meta?: RoomMeta } = {}): Promise<RtMatch | null> {
    const id = randomUUID(), t = now();
    const doc: RtMatch = {
      id, game, rated, status: 'open', players, names: await Promise.all(players.map(nameOf)),
      url: shardUrl(d.urls, id), createdAt: t, updatedAt: t,
      ...(opts.code ? { code: opts.code } : {}),
      ...(opts.isShard ? { isShard: true } : {}),
      ...(opts.meta ? { meta: opts.meta } : {}),
    };
    return (await store.createOnce(RT_MATCHES, id, doc as unknown as Record<string, unknown>)) === 'created' ? doc : null;
  }
  const view = (m: RtMatch, uid: string | null) => ({
    match: {
      id: m.id, game: m.game, rated: m.rated, status: m.status, code: m.code, isShard: !!m.isShard,
      ...(m.meta ? { meta: m.meta } : {}),
      players: m.players.map((u, seat) => (u ? { seat, uid: u, name: m.names[seat] ?? 'Player' } : null)).filter(Boolean),
      standings: m.standings,
    },
    you: uid ? m.players.indexOf(uid) : -1,
  });

  /** Find an open drop-in shard with space (or open a fresh one) and claim a stable seat for `uid`. */
  async function joinOrCreateShard(game: string, uid: string, meta?: RoomMeta): Promise<RtMatch | null> {
    const def = realtimeGame(game);
    if (!def?.dropIn) return null;
    const region = typeof meta?.region === 'string' ? meta.region : undefined;
    const rows = await store.query(RT_MATCHES, [{ field: 'game', value: game }, { field: 'status', value: 'open' }], 25);
    const fresh = rows
      .map(x => x.data as RtMatch)
      .filter(m => m.isShard && now() - Number(m.createdAt) < MATCH_FRESH_MS && (!region || !m.meta?.region || m.meta.region === region));
    const already = fresh.find(m => m.players.includes(uid));
    if (already) return already;
    const name = await nameOf(uid);
    // Prefer the most populated shard with space so players meet each other.
    fresh.sort((a, b) => activeCount(b.players) - activeCount(a.players));
    for (const cand of fresh) {
      if (activeCount(cand.players) >= def.maxPlayers) continue;
      const out = await casUpdate(store.cas(RT_MATCHES), cand.id, cur => {
        const m = cur as RtMatch | null;
        if (!m || m.status !== 'open' || !m.isShard) return { abort: true, result: null };
        if (m.players.includes(uid)) return { abort: true, result: m };
        if (activeCount(m.players) >= def.maxPlayers) return { abort: true, result: null };
        const next = assignSeat(m.players, m.names, uid, name);
        const patched: RtMatch = { ...m, players: next.players, names: next.names, updatedAt: now() };
        return { patch: { players: next.players, names: next.names, updatedAt: patched.updatedAt }, result: patched };
      });
      if (out.result) return out.result as RtMatch;
    }
    return createMatch(game, false, [uid], { isShard: true, meta });
  }

  r.get('/config', (_req, res) => {
    res.json({ enabled: true, games: Object.values(REALTIME_GAMES).map(g => ({ id: g.id, title: g.title, tickHz: g.tickHz, minPlayers: g.minPlayers, maxPlayers: g.maxPlayers, dropIn: !!g.dropIn })) });
  });

  // ───────────────────────────────────────────── matchmaking (rated 1v1)
  const tid = (game: string, uid: string) => `${game}__${uid}`;
  async function tryPair(game: string, uid: string): Promise<string | null> {
    const q = store.cas(RT_QUEUE);
    const mine = await q.get(tid(game, uid));
    if (!mine) return null;
    if (mine.data.status === 'matched') return mine.data.matchId || null;
    const t = now();
    await q.put(tid(game, uid), { seenAt: t }, mine.version);
    const me: Ticket = { uid, rating: Number(mine.data.rating) || START_RATING, joinedAt: Number(mine.data.joinedAt) || t, seenAt: t };
    const rows = await store.query(RT_QUEUE, [{ field: 'game', value: game }, { field: 'status', value: 'waiting' }], 50);
    const opp = pickOpponent(me, rows.map(x => x.data as Ticket), t);
    if (!opp) return null;
    const first = opp.joinedAt <= me.joinedAt ? opp.uid : uid, second = first === uid ? opp.uid : uid;
    const doc = await createMatch(game, true, [first, second]);
    if (!doc) return null;
    const claimMe = await casUpdate(q, tid(game, uid), cur => (cur?.status === 'waiting' ? { patch: { status: 'matched', matchId: doc.id }, result: doc.id } : { abort: true, result: (cur?.matchId as string) || '' }));
    if (!claimMe.ok) { await store.del(RT_MATCHES, doc.id); return claimMe.result || null; }
    const claimOpp = await casUpdate(q, tid(game, opp.uid), cur => (cur?.status === 'waiting' ? { patch: { status: 'matched', matchId: doc.id }, result: true } : { abort: true, result: false }));
    if (!claimOpp.ok) {
      await store.del(RT_MATCHES, doc.id);
      await casUpdate(q, tid(game, uid), cur => (cur?.matchId === doc.id ? { patch: { status: 'waiting', matchId: '' }, result: true } : { abort: true, result: false }));
      return null;
    }
    return doc.id;
  }

  r.post('/queue', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 24);
    const def = realtimeGame(game);
    if (!def) { res.status(400).json({ error: 'Unknown realtime game' }); return; }
    // Drop-in open-world games (e.g. apex-world) join a shared persistent shard instead of 1v1 Elo pairing.
    if (def.dropIn) {
      const shard = await joinOrCreateShard(game, uid, cleanMeta(req.body?.meta));
      if (!shard) { res.status(503).json({ error: 'Could not join an open-world shard' }); return; }
      res.json({ status: 'matched', matchId: shard.id, shard: true });
      return;
    }
    const { rating } = await statsOf(uid, game);
    const t = now();
    const put = await casUpdate(store.cas(RT_QUEUE), tid(game, uid), () => ({ patch: { game, uid, rating, joinedAt: t, seenAt: t, status: 'waiting', matchId: '' }, result: true }));
    if (!put.ok) { res.status(503).json({ error: 'Matchmaking is busy — try again' }); return; }
    const matchId = await tryPair(game, uid);
    res.json(matchId ? { status: 'matched', matchId } : { status: 'waiting', rating });
  });

  r.get('/queue', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const game = s(req.query.game, 24); if (!realtimeGame(game)) { res.status(400).json({ error: 'Unknown realtime game' }); return; }
    const t = await store.get(RT_QUEUE, tid(game, uid));
    if (!t || t.status === 'left') { res.json({ status: 'idle' }); return; }
    const matchId = await tryPair(game, uid);
    res.json(matchId ? { status: 'matched', matchId } : { status: 'waiting', waitedMs: now() - Number(t.joinedAt || now()) });
  });

  r.delete('/queue', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const game = s(req.query.game, 24); if (!realtimeGame(game)) { res.status(400).json({ error: 'Unknown realtime game' }); return; }
    const out = await casUpdate(store.cas(RT_QUEUE), tid(game, uid), cur => (cur?.status === 'waiting' ? { patch: { status: 'left' }, result: 'left' } : { abort: true, result: (cur?.matchId as string) || '' }));
    res.json(out.ok ? { status: 'left' } : out.result ? { status: 'matched', matchId: out.result } : { status: 'idle' });
  });

  // ───────────────────────────────────────────── drop-in persistent open-world shards
  r.post('/shard', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 24);
    const def = realtimeGame(game);
    if (!def || !def.dropIn) { res.status(400).json({ error: 'That game does not use drop-in shards' }); return; }
    const shard = await joinOrCreateShard(game, uid, cleanMeta(req.body?.meta));
    if (!shard) { res.status(503).json({ error: 'Could not open a shard' }); return; }
    res.json({ matchId: shard.id, players: activeCount(shard.players), maxPlayers: def.maxPlayers, ...(shard.meta ? { meta: shard.meta } : {}) });
  });

  r.post('/leave', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const matchId = s(req.body?.matchId, 64);
    if (!matchId) { res.status(400).json({ error: 'Missing matchId' }); return; }
    const out = await casUpdate(store.cas(RT_MATCHES), matchId, cur => {
      const m = cur as RtMatch | null;
      const def = m ? realtimeGame(m.game) : null;
      if (!m || m.status !== 'open' || !def?.dropIn) return { abort: true, result: false };
      const seat = m.players.indexOf(uid);
      if (seat < 0) return { abort: true, result: false };
      const nextP = [...m.players], nextN = [...m.names];
      nextP[seat] = ''; nextN[seat] = '';
      const remaining = activeCount(nextP);
      return { patch: { players: nextP, names: nextN, updatedAt: now(), ...(remaining === 0 ? { status: 'done' as const } : {}) }, result: true };
    });
    res.json({ ok: out.ok || out.result === false });
  });

  // ───────────────────────────────────────────── private rooms (friendly, unrated)
  r.post('/private', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 24); if (!realtimeGame(game)) { res.status(400).json({ error: 'Unknown realtime game' }); return; }
    const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    const meta = cleanMeta(req.body?.meta);
    const doc = await createMatch(game, false, [uid], { code, meta });
    if (!doc) { res.status(503).json({ error: 'Could not open a room' }); return; }
    res.json({ matchId: doc.id, code, ...(doc.meta ? { meta: doc.meta } : {}) });
  });

  r.post('/join', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const code = s(req.body?.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { res.status(400).json({ error: 'Codes are 6 letters and numbers' }); return; }
    const rows = await store.query(RT_MATCHES, [{ field: 'code', value: code }, { field: 'status', value: 'open' }], 5);
    const hit = rows.find(x => now() - Number(x.data.createdAt) < MATCH_FRESH_MS);
    if (!hit) { res.status(404).json({ error: 'No open room with that code' }); return; }
    const def = realtimeGame(hit.data.game);
    if (!def) { res.status(400).json({ error: 'Unknown realtime game' }); return; }
    const name = await nameOf(uid);
    const out = await casUpdate(store.cas(RT_MATCHES), hit.id, cur => {
      const m = cur as RtMatch | null;
      if (!m || m.status !== 'open') return { abort: true, result: 'closed' as const };
      if (m.players.includes(uid)) return { abort: true, result: 'in' as const };
      if (activeCount(m.players) >= def.maxPlayers) return { abort: true, result: 'full' as const };
      const next = assignSeat(m.players, m.names, uid, name);
      return { patch: { players: next.players, names: next.names, updatedAt: now() }, result: 'ok' as const };
    });
    if (out.ok || out.result === 'in') { res.json({ matchId: hit.id, game: String(hit.data.game), ...(hit.data.meta ? { meta: hit.data.meta } : {}) }); return; }
    res.status(409).json({ error: out.result === 'full' ? 'That room is full' : 'That room is closed' });
  });

  r.get('/match/:id', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const m = (await store.get(RT_MATCHES, s(req.params.id, 64))) as RtMatch | null;
    if (!m || !m.players.includes(uid)) { res.status(404).json({ error: 'Match not found' }); return; }
    res.json(view(m, uid));
  });

  // ───────────────────────────────────────────── tickets
  r.post('/ticket', async (req, res) => {
    const uid = await d.needUid(req, res); if (!uid) return;
    const m = (await store.get(RT_MATCHES, s(req.body?.matchId, 64))) as RtMatch | null;
    const seat = m ? m.players.indexOf(uid) : -1;
    if (!m || seat < 0) { res.status(404).json({ error: 'Match not found' }); return; }
    if (m.status !== 'open' || now() - m.createdAt > MATCH_FRESH_MS) { res.status(409).json({ error: 'This match is over' }); return; }
    const def = realtimeGame(m.game);
    const t = now(), exp = t + TICKET_TTL_MS;
    const min = m.rated ? activeCount(m.players) : (def?.minPlayers ?? 2);
    const ticket = signTicket({
      k: 'join', room: m.id, game: m.game, uid, seat, name: m.names[seat] ?? 'Player',
      min, rated: m.rated, ...(m.meta ? { meta: m.meta } : {}), iat: t, exp,
    }, d.ticketSecret);
    res.json({ ticket, url: m.url || shardUrl(d.urls, m.id), seat, expiresAt: exp, ...(m.meta ? { meta: m.meta } : {}) });
  });

  // ───────────────────────────────────────────── results (realtime server → API)
  r.post('/result', async (req, res) => {
    const body = req.body;
    if (!verifyBody(body, req.get(RESULT_TS_HEADER), req.get(RESULT_SIG_HEADER), d.resultSecret, now())) { res.status(401).json({ error: 'Bad signature' }); return; }
    const matchId = s(body?.matchId, 64);
    const m = (await store.get(RT_MATCHES, matchId)) as RtMatch | null;
    if (!m) { res.status(404).json({ error: 'Match not found' }); return; }
    if (body.game !== m.game) { res.status(400).json({ error: 'Game mismatch' }); return; }
    const def = realtimeGame(m.game);
    const raw: any[] = Array.isArray(body.standings) ? body.standings : [];
    const standings = raw.map(x => ({ uid: s(x?.uid, 128), place: Number(x?.place), timeMs: x?.timeMs === null || x?.timeMs === undefined ? null : Math.max(0, Math.round(Number(x.timeMs)) || 0), dnf: !!x?.dnf }));
    const uids = new Set(standings.map(x => x.uid)), places = new Set(standings.map(x => x.place));
    const valid = def && standings.length >= 2 && standings.length <= def.maxPlayers && uids.size === standings.length && places.size === standings.length
      && standings.every(x => m.players.includes(x.uid) && Number.isInteger(x.place) && x.place >= 1 && x.place <= standings.length);
    if (!valid) { res.status(400).json({ error: 'Invalid standings' }); return; }
    if (m.settled) { res.json({ ok: true, already: true }); return; }

    const at = Math.min(now(), Number(body.endedAt) || now());
    // Nobody finished or raced to the end (everyone left): close the match, no ledger entries.
    const abandoned = standings.every(x => x.dnf);
    const stats = Object.fromEntries(await Promise.all(standings.map(async x => [x.uid, await statsOf(x.uid, m.game)] as const)));
    const fresh = abandoned ? [] : settlementPlan({ matchId: m.id, game: m.game, rated: m.rated, at, standings, stats });
    // The plan is fixed in the match doc on the first attempt, so a retry after a partial write replays
    // exactly the same entries (appendEvent drops the ones already on each chain).
    const fixed = await casUpdate(store.cas(RT_MATCHES), m.id, cur => {
      const c = cur as RtMatch | null;
      if (!c) return { abort: true, result: null };
      if (c.plan) return { abort: true, result: c.plan };
      return { patch: { status: 'done', standings, plan: fresh, endedAt: at, updatedAt: now() }, result: fresh };
    });
    const plan = (fixed.result ?? null) as GamerEventBody[] | null;
    if (!plan) { res.status(503).json({ error: 'Match store busy' }); return; }
    let written = 0;
    for (const e of plan) {
      const out = await d.appendEvent(e.uid, e);
      if (!out) continue;
      written++;
      for (const a of newlyEarned(out.fold, m.game)) {
        await d.appendEvent(e.uid, { event: 'ACHIEVEMENT', uid: e.uid, at, key: `ach:${a.id}`, source: 'first-party', game: m.game, achievementId: a.id, points: a.points, note: a.title });
      }
    }
    await casUpdate(store.cas(RT_MATCHES), m.id, cur => (cur && !cur.settled ? { patch: { settled: true }, result: true } : { abort: true, result: false }));
    res.json({ ok: true, entries: written, abandoned });
  });

  return r;
}
