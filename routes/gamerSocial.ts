// Plajah Gamer Network × Social — games in the timeline. Mounted at /api/gamer/social (server.ts), next to the
// core gamer API (routes/gamerNet.ts), and writes match docs the core API then referees, settles and scores.
//
//   POST   /lobby      {game, seeking?}       heartbeat from a visible feed card → { count, people, status, matchId? }
//   GET    /lobby?game=ttt                    who's on the timeline with this game right now
//   DELETE /lobby?game=ttt                    card scrolled away / closed
//   POST   /challenge  {game, to, source, postId?}  call someone out → notification for them
//   GET    /challenges                        my incoming (pending) and outgoing (recent) challenges
//   GET    /challenge/:id
//   POST   /challenge/:id/accept|decline|cancel
//   POST   /live       {matchId, streamId}    a player went live on this match
//   GET    /live/:matchId                     → { streamId?, uid? } so spectators can watch from the card
//
// The lobby pairs two people who both tapped "Find a match" on a game card, using the same skill window as
// the global queue (services/gamerNet/matchmaking.ts). Lobby, challenge and live docs change only through
// services/gamerNet/social.ts inside a compare-and-swap.

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { casUpdate } from '../services/casCore';
import type { GamerStore } from '../services/gamerNet/store';
import { gameRules } from '../services/gamerNet/registry';
import { START_RATING } from '../services/gamerNet/rating';
import { pickOpponent, type Ticket } from '../services/gamerNet/matchmaking';
import * as M from '../services/gamerNet/match';
import * as S from '../services/gamerNet/social';
import type { UserCard } from './gamerNet';

export interface GamerNotice { userId: string; senderId: string; senderName: string; senderPhoto: string; title: string; message: string; link: string; targetId: string }
export interface GamerSocialDeps {
  store: GamerStore;
  verify(idToken: string): Promise<string | null>;
  userCard(uid: string): Promise<UserCard | null>;
  /** In-app notification (+ push) for the person challenged. Best effort. */
  notify?(n: GamerNotice): Promise<void>;
  /** uids `uid` has blocked or been blocked by — hidden from their lobby and refused as challenge targets. */
  blockedFor?(uid: string): Promise<Set<string>>;
  now?: () => number;
}

const PROFILES = 'gamerProfiles', MATCHES = 'gamerMatches', LOBBY = 'gamerLobby', CHALLENGES = 'gamerChallenges', LIVE = 'gamerMatchLive';
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SOURCES: ReadonlyArray<S.ChallengeSource> = ['post', 'profile', 'chat', 'feed'];

export function createGamerSocialRouter(deps: GamerSocialDeps): Router {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const r = Router();

  const uidOf = async (req: Request): Promise<string | null> => {
    const a = req.headers.authorization; return a?.startsWith('Bearer ') ? deps.verify(a.slice(7)) : null;
  };
  const needUid = async (req: Request, res: Response): Promise<string | null> => {
    const uid = await uidOf(req); if (!uid) res.status(401).json({ error: 'Sign in to play' }); return uid;
  };
  const blocked = async (uid: string) => (deps.blockedFor ? deps.blockedFor(uid).catch(() => new Set<string>()) : new Set<string>());

  /** Name, photo and rating for a player, from their gamer profile when they have one. */
  async function who(uid: string, game: string): Promise<M.PlayerCard & { isChild: boolean }> {
    const p = await store.get(PROFILES, uid);
    if (p) return { uid, name: p.name || 'Player', photo: p.photo || '', rating: p.fold?.games?.[game]?.rating ?? START_RATING, isChild: !!p.isChild };
    const c = (await deps.userCard(uid).catch(() => null)) ?? { name: 'Player' };
    return { uid, name: c.isChild ? 'Player' : s(c.name, 60) || 'Player', photo: c.isChild ? '' : s(c.photo, 500), rating: START_RATING, isChild: !!c.isChild };
  }
  const seat = (c: M.PlayerCard & { isChild?: boolean }): M.PlayerCard => ({ uid: c.uid, name: c.name, photo: c.photo, rating: c.rating });

  // ───────────────────────────────────────────── timeline lobby
  const lid = (game: string, uid: string) => `${game}__${uid}`;

  async function lobbyFor(game: string, uid: string | null) {
    const t = now();
    const rows = await store.query(LOBBY, [{ field: 'game', value: game }, { field: 'status', value: 'here' }], 100);
    return S.lobbyView(rows.map(x => x.data as S.LobbyRow), uid, t, uid ? await blocked(uid) : new Set());
  }

  /** Pair two seekers from the timeline. Same claim/rollback dance as the global queue. */
  async function tryPair(game: string, uid: string): Promise<string | null> {
    const q = store.cas(LOBBY);
    const mine = await q.get(lid(game, uid));
    if (!mine) return null;
    if (mine.data.status === 'matched') return mine.data.matchId || null;
    if (!mine.data.seeking) return null;
    const t = now();
    const me: Ticket = { uid, rating: Number(mine.data.rating) || START_RATING, joinedAt: Number(mine.data.seekingSince) || t, seenAt: t };
    const rows = await store.query(LOBBY, [{ field: 'game', value: game }, { field: 'seeking', value: true }, { field: 'status', value: 'here' }], 50);
    const nope = await blocked(uid);
    const opp = pickOpponent(me, rows.map(x => x.data as S.LobbyRow).map(d => ({ uid: d.uid, rating: d.rating, joinedAt: d.seekingSince ?? d.seenAt, seenAt: d.seenAt })), t, nope);
    if (!opp) return null;

    const matchId = randomUUID();
    const claimMe = await casUpdate(q, lid(game, uid), cur => (cur?.status === 'here' && cur.seeking ? { patch: { status: 'matched', matchId, seeking: false }, result: matchId } : { abort: true, result: (cur?.matchId as string) || '' }));
    if (!claimMe.ok) return claimMe.result || null;
    const first = opp.joinedAt <= me.joinedAt ? opp.uid : uid, second = first === uid ? opp.uid : uid;
    const doc = M.newMatch({ id: matchId, game, rated: true, now: t, seat0: seat(await who(first, game)), seat1: seat(await who(second, game)) });
    const made = doc ? await store.createOnce(MATCHES, matchId, doc as unknown as Record<string, unknown>) : 'error';
    const claimOpp = made === 'created'
      ? await casUpdate(q, lid(game, opp.uid), cur => (cur?.status === 'here' && cur.seeking ? { patch: { status: 'matched', matchId, seeking: false }, result: true } : { abort: true, result: false }))
      : { ok: false as const };
    if (!claimOpp.ok) {
      if (made === 'created') await store.del(MATCHES, matchId);
      await casUpdate(q, lid(game, uid), cur => (cur?.matchId === matchId ? { patch: { status: 'here', matchId: '', seeking: true }, result: true } : { abort: true, result: false }));
      return null;
    }
    return matchId;
  }

  r.post('/lobby', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const seeking = req.body?.seeking === true;
    const t = now();
    const me = await who(uid, game);
    const box: { matchId: string } = { matchId: '' };
    const put = await casUpdate(store.cas(LOBBY), lid(game, uid), cur => {
      box.matchId = '';
      // A fresh match is reported once, then the ticket goes back to plain presence.
      if (cur?.status === 'matched' && cur.matchId && t - Number(cur.seenAt || 0) < S.LOBBY_STALE_MS) {
        box.matchId = String(cur.matchId);
        return { patch: { status: 'here', matchId: '', seeking: false, seenAt: t }, result: true };
      }
      const wasSeeking = cur?.status === 'here' && cur.seeking === true;
      const row: S.LobbyRow = {
        uid, game, name: me.name, photo: me.photo, rating: me.rating, seenAt: t, seeking, status: 'here', isChild: me.isChild,
        ...(seeking ? { seekingSince: wasSeeking ? Number(cur?.seekingSince) || t : t } : {}),
      };
      return { patch: { ...row, matchId: '', ...(seeking ? {} : { seekingSince: 0 }) } as Record<string, any>, result: true };
    });
    if (!put.ok) { res.status(503).json({ error: 'The timeline lobby is busy — try again' }); return; }
    const matchId = box.matchId || (seeking ? await tryPair(game, uid) : null);
    if (matchId && !box.matchId) {
      // tryPair left my ticket 'matched'; hand the match over now and drop back to presence.
      await casUpdate(store.cas(LOBBY), lid(game, uid), cur => (cur?.matchId === matchId ? { patch: { status: 'here', matchId: '', seeking: false, seenAt: t }, result: true } : { abort: true, result: false }));
    }
    const view = await lobbyFor(game, uid);
    res.json({ ...view, status: matchId ? 'matched' : seeking ? 'seeking' : 'here', ...(matchId ? { matchId } : {}) });
  });

  r.get('/lobby', async (req, res) => {
    const uid = await uidOf(req);
    const game = s(req.query.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    res.json(await lobbyFor(game, uid));
  });

  r.delete('/lobby', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.query.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const out = await casUpdate(store.cas(LOBBY), lid(game, uid), cur => (cur && cur.status !== 'matched' ? { patch: { status: 'left', seeking: false }, result: '' } : { abort: true, result: (cur?.matchId as string) || '' }));
    res.json(out.ok || !out.result ? { status: 'left' } : { status: 'matched', matchId: out.result });
  });

  // ───────────────────────────────────────────── challenges
  const challengeView = (c: S.ChallengeDoc) => ({ ...c, status: S.effectiveStatus(c, now()) });

  r.post('/challenge', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 20); if (!gameRules(game)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const to = s(req.body?.to, 128); if (!ID.test(to)) { res.status(400).json({ error: 'Who are you challenging?' }); return; }
    const source = SOURCES.find(x => x === req.body?.source) ?? 'post';
    const postId = ID.test(s(req.body?.postId, 128)) ? s(req.body?.postId, 128) : undefined;
    if ((await blocked(uid)).has(to)) { res.status(403).json({ error: "You can't challenge this person" }); return; }
    const t = now();
    const recent = (await store.query(CHALLENGES, [{ field: 'from', value: uid }], 60)).map(x => x.data as S.ChallengeDoc);
    const ok = S.canChallenge(uid, to, recent, t);
    if ('error' in ok) { res.status(ok.status).json({ error: ok.error }); return; }
    const [fromCard, toCard] = await Promise.all([who(uid, game), who(to, game)]);
    const doc = S.newChallenge({ id: randomUUID(), game, from: fromCard, to: { uid: to, name: toCard.name }, source, postId, now: t });
    if (!doc || (await store.createOnce(CHALLENGES, doc.id, doc as unknown as Record<string, unknown>)) !== 'created') { res.status(503).json({ error: 'Could not send the challenge' }); return; }
    const title = gameRules(game)!.title;
    await deps.notify?.({
      userId: to, senderId: uid, senderName: fromCard.name, senderPhoto: fromCard.photo || '',
      title: `${fromCard.name} challenged you`, message: `${title} — tap to accept and play right here.`,
      link: `game-challenge:${doc.id}`, targetId: doc.id,
    }).catch(() => {});
    res.json({ challenge: challengeView(doc) });
  });

  r.get('/challenges', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const t = now();
    const [inc, out] = await Promise.all([
      store.query(CHALLENGES, [{ field: 'to', value: uid }, { field: 'status', value: 'pending' }], 30),
      store.query(CHALLENGES, [{ field: 'from', value: uid }], 60),
    ]);
    const incoming = inc.map(x => x.data as S.ChallengeDoc).filter(c => c.expiresAt > t).sort((a, b) => b.createdAt - a.createdAt);
    // Outgoing: still waiting, or answered in the last few minutes (so the challenger's card can jump into the match).
    const outgoing = out.map(x => x.data as S.ChallengeDoc)
      .filter(c => (c.status === 'pending' && c.expiresAt > t) || (c.respondedAt && t - c.respondedAt < 5 * 60_000))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 10).map(challengeView);
    res.json({ incoming, outgoing });
  });

  r.get('/challenge/:id', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const c = (await store.get(CHALLENGES, s(req.params.id, 128))) as S.ChallengeDoc | null;
    if (!c || (c.from !== uid && c.to !== uid)) { res.status(404).json({ error: 'Challenge not found' }); return; }
    res.json({ challenge: challengeView(c) });
  });

  r.post('/challenge/:id/:action', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const action = (['accept', 'decline', 'cancel'] as const).find(a => a === req.params.action);
    if (!action) { res.status(404).json({ error: 'Unknown action' }); return; }
    const id = s(req.params.id, 128);
    const first = (await store.get(CHALLENGES, id)) as S.ChallengeDoc | null;
    if (!first || (first.from !== uid && first.to !== uid)) { res.status(404).json({ error: 'Challenge not found' }); return; }
    const t = now();
    // The match id is fixed before the CAS so a retried accept never opens two matches.
    const matchId = `ch_${id}`.slice(0, 128);
    const box: { err: { error: string; status: number } | null; doc: S.ChallengeDoc | null } = { err: null, doc: null };
    const out = await casUpdate(store.cas(CHALLENGES), id, cur => {
      box.err = null; box.doc = null;
      if (!cur) { box.err = { error: 'Challenge not found', status: 404 }; return { abort: true, result: null }; }
      const st = S.respond(cur as S.ChallengeDoc, uid, action, t, action === 'accept' ? matchId : undefined);
      if ('error' in st) { box.err = { error: st.error, status: st.status }; return { abort: true, result: null }; }
      box.doc = st.doc;
      return { patch: st.doc as unknown as Record<string, any>, result: null };
    });
    if (box.err) {
      if (box.err.status === 410) await casUpdate(store.cas(CHALLENGES), id, cur => (cur?.status === 'pending' ? { patch: { status: 'expired' }, result: true } : { abort: true, result: false }));
      res.status(box.err.status).json({ error: box.err.error }); return;
    }
    if (!out.ok || !box.doc) { res.status(503).json({ error: 'Busy — try again' }); return; }
    const c = box.doc;
    if (action === 'accept') {
      const seats = S.challengeSeats(c);
      const m = M.newMatch({ id: matchId, game: c.game, rated: false, now: t, seat0: seat(await who(seats.seat0, c.game)), seat1: seat(await who(seats.seat1, c.game)) });
      if (!m || (await store.createOnce(MATCHES, matchId, S.withOpeningGrace(m, t) as unknown as Record<string, unknown>)) === 'error') {
        res.status(503).json({ error: 'Could not start the match' }); return;
      }
      await deps.notify?.({
        userId: c.from, senderId: c.to, senderName: c.toName, senderPhoto: '',
        title: `${c.toName} accepted your challenge`, message: `${gameRules(c.game)!.title} is on — tap to play.`,
        link: `game-match:${matchId}`, targetId: matchId,
      }).catch(() => {});
    }
    res.json({ challenge: challengeView(c), ...(c.matchId ? { matchId: c.matchId } : {}) });
  });

  // ───────────────────────────────────────────── live
  r.post('/live', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const matchId = s(req.body?.matchId, 128), streamId = s(req.body?.streamId, 128);
    if (!ID.test(matchId) || !ID.test(streamId)) { res.status(400).json({ error: 'matchId and streamId required' }); return; }
    const m = (await store.get(MATCHES, matchId)) as M.MatchDoc | null;
    if (!m || !m.players.includes(uid)) { res.status(403).json({ error: 'You are not in this match' }); return; }
    const out = await casUpdate(store.cas(LIVE), matchId, () => ({ patch: { matchId, streamId, uid, at: now() }, result: true }));
    res.json({ ok: out.ok });
  });

  r.get('/live/:matchId', async (req, res) => {
    const d = await store.get(LIVE, s(req.params.matchId, 128));
    res.json(d ? { streamId: d.streamId, uid: d.uid } : {});
  });

  return r;
}
