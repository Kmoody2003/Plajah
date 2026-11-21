// Plajah Gamer Network — playing together: parties, match/party/spectator chat and game voice.
// Two routers, mounted in server.ts:
//
//   /api/gamer/party
//     GET    /me                      my party (or null) + whether voice is available
//     POST   /          {game?}       start a party (leaves the one I'm in)
//     POST   /join      {code}|{partyId}   join by code, or accept an invite
//     GET    /peek/:id                an invitee sees who's in the party before joining
//     POST   /leave
//     POST   /kick      {uid}         leader only
//     POST   /promote   {uid}         leader only
//     POST   /game      {game}        leader only
//     POST   /invite    {to}          any member → notification `game-party:<id>` for them
//     POST   /play      {game, with}  leader starts a friendly 2-seat match with a member
//     POST   /team      {uid?, team}  Team A (0) / Team B (1) / none (null); self, or the leader for anyone
//     POST   /queue     {game}        leader sends the party into matchmaking; DELETE /queue stops it
//     POST   /stream    {on}          I put party voice on my live stream (one streamer at a time)
//     POST   /stream-consent {ok}     I agree (or stop agreeing) to be heard on it
//
//   /api/gamer/chat
//     POST   /voice     {scope}       LiveKit join token for party_, team_, match_ or rt_ (realtime room) scopes
//     GET    /:scope?since=N          new lines + what I may do here
//     POST   /:scope    {text}|{quick}
//     POST   /:scope/report {lineId, reason}
//
// Storage (plajah-prod, server-only through the service account): gamerParties/{id}, gamerPartyOf/{uid},
// gamerChat/{scope}, gamerChatReports/{id}. Party and chat docs change only through the pure rules in
// services/gamerNet/party.ts and services/gamerNet/chat.ts inside a compare-and-swap.

import { Router, type Request, type Response } from 'express';
import { randomUUID, randomInt } from 'node:crypto';
import { casUpdate } from '../services/casCore';
import type { GamerStore } from '../services/gamerNet/store';
import { gameRules } from '../services/gamerNet/registry';
import { START_RATING } from '../services/gamerNet/rating';
import * as M from '../services/gamerNet/match';
import * as C from '../services/gamerNet/chat';
import * as P from '../services/gamerNet/party';
import { mintJoinToken, type LiveKitConfig } from '../services/meetings/livekitServer';
import type { UserCard } from './gamerNet';
import type { GamerNotice } from './gamerSocial';

export interface GamerTogetherDeps {
  store: GamerStore;
  verify(idToken: string): Promise<string | null>;
  userCard(uid: string): Promise<UserCard | null>;
  notify?(n: GamerNotice): Promise<void>;
  blockedFor?(uid: string): Promise<Set<string>>;
  /** LiveKit (docs/MEETINGS_SFU.md). Null = voice answers 503 { available: false }. */
  livekit?: () => LiveKitConfig | null;
  now?: () => number;
}

const PROFILES = 'gamerProfiles', MATCHES = 'gamerMatches', RT_MATCHES = 'gamerRtMatches', PARTIES = 'gamerParties', PARTY_OF = 'gamerPartyOf', CHAT = 'gamerChat', REPORTS = 'gamerChatReports';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
/** Party voice rooms hold the whole party; a match room holds its two players. */
/** Realtime rooms (routes/gamerRealtime.ts on the realtime branch) hold up to 12 drivers. */
export const VOICE_CAP = { party: P.MAX_PARTY, team: P.MAX_PARTY, match: 2, rt: 12 };
/** `team_<partyId>_<n>` -> party id + team number. */
const splitTeam = (id: string): { partyId: string; team: 0 | 1 } => ({ partyId: id.slice(0, -2), team: (id.endsWith('_1') ? 1 : 0) });
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
type Fail = { error: string; status: number };

export function createGamerTogether(deps: GamerTogetherDeps): { party: Router; chat: Router } {
  const { store } = deps;
  const now = deps.now ?? Date.now;

  const uidOf = async (req: Request): Promise<string | null> => {
    const a = req.headers.authorization; return a?.startsWith('Bearer ') ? deps.verify(a.slice(7)) : null;
  };
  const needUid = async (req: Request, res: Response): Promise<string | null> => {
    const uid = await uidOf(req); if (!uid) res.status(401).json({ error: 'Sign in to play together' }); return uid;
  };
  const blocked = async (uid: string) => (deps.blockedFor ? deps.blockedFor(uid).catch(() => new Set<string>()) : new Set<string>());
  const fail = (res: Response, f: Fail) => { res.status(f.status).json({ error: f.error }); };

  /** Name, photo, child flag — from the gamer profile when there is one. */
  async function who(uid: string): Promise<C.Sender> {
    const p = await store.get(PROFILES, uid);
    if (p) return { uid, name: p.isChild ? 'Player' : String(p.name || 'Player'), photo: p.isChild ? '' : String(p.photo || ''), isChild: !!p.isChild };
    const c = (await deps.userCard(uid).catch(() => null)) ?? { name: 'Player' };
    return { uid, name: c.isChild ? 'Player' : s(c.name, 60) || 'Player', photo: c.isChild ? '' : s(c.photo, 500), isChild: !!c.isChild };
  }
  const member = (w: C.Sender): P.PartyMember => ({ uid: w.uid, name: w.name, photo: w.photo, isChild: w.isChild, joinedAt: now() });

  // ───────────────────────────────────────────── chat storage
  async function chatSystem(scope: string, text: string): Promise<void> {
    await casUpdate(store.cas(CHAT), scope, cur => {
      const d = C.appendSystem((cur as C.ChatDoc | null) ?? null, scope, text, randomUUID(), now());
      return { patch: d as unknown as Record<string, any>, result: true };
    }).catch(() => null);
  }

  // ───────────────────────────────────────────── party storage
  async function partyOf(uid: string): Promise<P.PartyDoc | null> {
    const idx = await store.get(PARTY_OF, uid);
    if (!idx?.partyId) return null;
    const d = (await store.get(PARTIES, String(idx.partyId))) as P.PartyDoc | null;
    return d && P.isMember(d, uid) ? d : null;
  }

  /** Run one party step inside a CAS; writes the system chat line the step produced. */
  async function partyStep(id: string, fn: (d: P.PartyDoc) => P.PartyStep): Promise<{ doc: P.PartyDoc } | Fail> {
    const box: { err: Fail | null; doc: P.PartyDoc | null; note?: string } = { err: null, doc: null };
    const out = await casUpdate(store.cas(PARTIES), id, cur => {
      box.err = null; box.note = undefined;
      if (!cur) { box.err = { error: 'Party not found', status: 404 }; return { abort: true, result: null }; }
      const st = fn(cur as P.PartyDoc);
      if ('error' in st) { box.err = { error: st.error, status: st.status }; return { abort: true, result: null }; }
      box.doc = st.doc; box.note = st.note;
      if (st.doc === cur || st.doc.v === (cur as P.PartyDoc).v) return { abort: true, result: null };
      return { patch: st.doc as unknown as Record<string, any>, result: null };
    });
    if (box.err) return box.err;
    if (!out.ok && 'reason' in out && out.reason !== 'ABORT') return { error: 'The party is busy — try again', status: 503 };
    if (out.ok && box.note) await chatSystem(C.scopeKey('party', id), box.note);
    return box.doc ? { doc: box.doc } : { error: 'Party not found', status: 404 };
  }

  async function setPartyOf(uid: string, partyId: string | null): Promise<void> {
    await casUpdate(store.cas(PARTY_OF), uid, () => ({ patch: { uid, partyId: partyId ?? '', updatedAt: now() }, result: true })).catch(() => null);
  }

  /** Leave whatever party I'm in (before joining or starting another). */
  async function leaveCurrent(uid: string): Promise<void> {
    const cur = await partyOf(uid);
    if (cur) await partyStep(cur.id, d => P.leave(d, uid, now()));
    await setPartyOf(uid, null);
  }

  const voiceOn = () => !!deps.livekit?.();
  const partyOut = (d: P.PartyDoc | null) => ({ party: d && d.status === 'open' ? P.partyView(d, now()) : null, voice: { available: voiceOn() } });

  // ═════════════════════════════════════════════ /api/gamer/party
  const party = Router();

  party.get('/me', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    res.json(partyOut(await partyOf(uid)));
  });

  party.post('/', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    await leaveCurrent(uid);
    const game = s(req.body?.game, 40);
    const me = await who(uid);
    const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    const doc = P.newParty({ id: randomUUID(), code, leader: member(me), game, now: now() });
    if ((await store.createOnce(PARTIES, doc.id, doc as unknown as Record<string, unknown>)) !== 'created') { res.status(503).json({ error: 'Could not start a party' }); return; }
    await setPartyOf(uid, doc.id);
    await chatSystem(C.scopeKey('party', doc.id), `${me.name} started the party`);
    res.json(partyOut(doc));
  });

  party.post('/join', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    let id = s(req.body?.partyId, 64);
    const viaInvite = !!id;
    if (!viaInvite) {
      const code = s(req.body?.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) { res.status(400).json({ error: 'Party codes are 6 letters and numbers' }); return; }
      const rows = await store.query(PARTIES, [{ field: 'code', value: code }, { field: 'status', value: 'open' }], 3);
      if (!rows.length) { res.status(404).json({ error: 'No open party with that code' }); return; }
      id = rows[0].id;
    } else if (!ID.test(id)) { res.status(400).json({ error: 'Bad party id' }); return; }
    const already = await partyOf(uid);
    if (already?.id === id) { res.json(partyOut(already)); return; }
    const pre = (await store.get(PARTIES, id)) as P.PartyDoc | null;
    if (pre) {
      const nope = await blocked(uid);
      if (pre.members.some(m => nope.has(m.uid))) { res.status(403).json({ error: 'You can’t join this party' }); return; }
    }
    if (already) await leaveCurrent(uid);
    const me = await who(uid);
    const out = await partyStep(id, d => P.join(d, member(me), now(), viaInvite));
    if ('error' in out) { fail(res, out); return; }
    await setPartyOf(uid, id);
    res.json(partyOut(out.doc));
  });

  party.get('/peek/:id', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const d = (await store.get(PARTIES, s(req.params.id, 64))) as P.PartyDoc | null;
    const t = now();
    const invited = !!d && d.invites.some(i => i.uid === uid && t - i.at < P.INVITE_TTL_MS);
    if (!d || d.status !== 'open' || (!invited && !P.isMember(d, uid))) { res.status(404).json({ error: 'That invite has expired' }); return; }
    res.json({ party: { id: d.id, game: d.game, leader: d.leader, members: d.members.map(m => ({ uid: m.uid, name: m.name, photo: m.photo })) }, invited });
  });

  party.post('/leave', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    await leaveCurrent(uid);
    res.json(partyOut(null));
  });

  /** A leader action on my party. */
  const leaderAction = (fn: (d: P.PartyDoc, by: string, req: Request) => P.PartyStep, after?: (d: P.PartyDoc, req: Request) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const uid = await needUid(req, res); if (!uid) return;
      const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'You are not in a party' }); return; }
      const out = await partyStep(cur.id, d => fn(d, uid, req));
      if ('error' in out) { fail(res, out); return; }
      if (after) await after(out.doc, req);
      res.json(partyOut(out.doc));
    };

  party.post('/kick', leaderAction((d, by, req) => P.kick(d, by, s(req.body?.uid, 128), now()), async (_d, req) => {
    const gone = s(req.body?.uid, 128);
    const idx = await store.get(PARTY_OF, gone);
    if (idx?.partyId === _d.id) await setPartyOf(gone, null);
  }));
  party.post('/promote', leaderAction((d, by, req) => P.promote(d, by, s(req.body?.uid, 128), now())));
  party.post('/game', leaderAction((d, by, req) => P.setGame(d, by, s(req.body?.game, 40), now())));

  party.post('/invite', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const to = s(req.body?.to, 128);
    if (!ID.test(to) || to === uid) { res.status(400).json({ error: 'Pick someone to invite' }); return; }
    const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'Start a party first' }); return; }
    if ((await blocked(uid)).has(to)) { res.status(403).json({ error: 'You can’t invite this person' }); return; }
    const out = await partyStep(cur.id, d => P.invite(d, uid, to, now()));
    if ('error' in out) { fail(res, out); return; }
    const me = await who(uid);
    await deps.notify?.({
      userId: to, senderId: uid, senderName: me.name, senderPhoto: me.photo, title: 'Party invite',
      message: `${me.name} invited you to their party${out.doc.game ? ` (${gameRules(out.doc.game)?.title ?? out.doc.game})` : ''}`,
      link: `game-party:${cur.id}`, targetId: cur.id,
    }).catch(() => {});
    res.json(partyOut(out.doc));
  });

  party.post('/play', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 40), withUid = s(req.body?.with, 128);
    if (!gameRules(game)) { res.status(400).json({ error: 'That game has no online matches yet' }); return; }
    const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'You are not in a party' }); return; }
    if (cur.leader !== uid) { res.status(403).json({ error: 'Only the party leader can start a match' }); return; }
    if (withUid === uid || !cur.members.some(m => m.uid === withUid)) { res.status(400).json({ error: 'Pick a party member to play' }); return; }
    const seat = async (u: string): Promise<M.PlayerCard> => {
      const p = await store.get(PROFILES, u); const w = await who(u);
      return { uid: u, name: w.name, photo: w.photo, rating: p?.fold?.games?.[game]?.rating ?? START_RATING };
    };
    const doc = M.newMatch({ id: randomUUID(), game, rated: false, now: now(), seat0: await seat(uid), seat1: await seat(withUid) });
    if (!doc || (await store.createOnce(MATCHES, doc.id, doc as unknown as Record<string, unknown>)) !== 'created') { res.status(503).json({ error: 'Could not open a match' }); return; }
    const out = await partyStep(cur.id, d => P.startMatch(d, uid, { id: doc.id, game, seats: [uid, withUid] }, now()));
    if ('error' in out) { fail(res, out); return; }
    const names = doc.cards.map(c => c.name).join(' vs ');
    await chatSystem(C.scopeKey('party', cur.id), `${names} — ${gameRules(game)!.title} started`);
    res.json({ ...partyOut(out.doc), matchId: doc.id });
  });

  party.post('/team', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'You are not in a party' }); return; }
    const target = s(req.body?.uid, 128) || uid;
    const t = req.body?.team; const team = t === 0 || t === 1 ? t : null;
    const out = await partyStep(cur.id, d => P.setTeam(d, uid, target, team, now()));
    if ('error' in out) { fail(res, out); return; }
    res.json(partyOut(out.doc));
  });

  party.post('/queue', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const game = s(req.body?.game, 40);
    if (!gameRules(game)) { res.status(400).json({ error: 'That game has no online matches yet' }); return; }
    const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'You are not in a party' }); return; }
    const out = await partyStep(cur.id, d => P.startQueue(d, uid, { id: randomUUID(), game }, now()));
    if ('error' in out) { fail(res, out); return; }
    res.json(partyOut(out.doc));
  });

  party.delete('/queue', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'You are not in a party' }); return; }
    const out = await partyStep(cur.id, d => P.stopQueue(d, uid, now()));
    if ('error' in out) { fail(res, out); return; }
    res.json(partyOut(out.doc));
  });

  party.post('/stream', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'You are not in a party' }); return; }
    const out = await partyStep(cur.id, d => P.setStreaming(d, uid, req.body?.on === true, now()));
    if ('error' in out) { fail(res, out); return; }
    res.json(partyOut(out.doc));
  });

  party.post('/stream-consent', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const cur = await partyOf(uid); if (!cur) { res.status(404).json({ error: 'You are not in a party' }); return; }
    const out = await partyStep(cur.id, d => P.setStreamConsent(d, uid, req.body?.ok === true, now()));
    if ('error' in out) { fail(res, out); return; }
    res.json(partyOut(out.doc));
  });

  // ═════════════════════════════════════════════ /api/gamer/chat
  const chat = Router();

  /** Who I am in this scope: player / member / spectator, and what that lets me do. */
  async function scopeAccess(scope: C.ChatScope, uid: string, me: C.Sender): Promise<{ access: C.ScopeAccess; match?: M.MatchDoc; party?: P.PartyDoc; rtPlayers?: string[] } | Fail> {
    if (scope.kind === 'party' || scope.kind === 'team') {
      const { partyId, team } = scope.kind === 'team' ? splitTeam(scope.id) : { partyId: scope.id, team: null as 0 | 1 | null };
      const d = (await store.get(PARTIES, partyId)) as P.PartyDoc | null;
      if (!d) return { error: 'Party not found', status: 404 };
      return { access: C.accessFor(scope.kind, { uid, isChild: me.isChild, isMember: P.isMember(d, uid), onTeam: team !== null && P.teamOf(d, uid) === team }), party: d };
    }
    if (scope.kind === 'rt') {
      const r = await store.get(RT_MATCHES, scope.id);
      if (!r) return { error: 'Room not found', status: 404 };
      const players: string[] = Array.isArray(r.players) ? r.players.map(String) : [];
      return { access: C.accessFor('rt', { uid, isChild: me.isChild, isPlayer: players.includes(uid) }), rtPlayers: players };
    }
    const m = (await store.get(MATCHES, scope.id)) as M.MatchDoc | null;
    if (!m) return { error: 'Match not found', status: 404 };
    return { access: C.accessFor(scope.kind, { uid, isChild: me.isChild, isPlayer: m.players.includes(uid), matchDone: m.status === 'done' }), match: m };
  }

  chat.post('/voice', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const cfg = deps.livekit?.() ?? null;
    if (!cfg) { res.status(503).json({ error: 'Voice is off right now', available: false }); return; }
    const scope = C.parseScope(req.body?.scope);
    if (!scope || scope.kind === 'spec') { res.status(400).json({ error: 'Voice is for parties, teams, matches and rooms' }); return; }
    const me = await who(uid);
    if (me.isChild) { res.status(403).json({ error: 'Voice chat isn’t available on child accounts — use quick chat' }); return; }
    let room: string, cap: number;
    /** People in the room this listener must never hear (blocks); the client drops them. */
    let exclude: string[] = [];
    const nope = await blocked(uid);
    if (scope.kind === 'party' || scope.kind === 'team') {
      const { partyId, team } = scope.kind === 'team' ? splitTeam(scope.id) : { partyId: scope.id, team: null as 0 | 1 | null };
      const d = (await store.get(PARTIES, partyId)) as P.PartyDoc | null;
      if (!d || !P.voiceAllowed(d, uid)) { res.status(403).json({ error: 'Join the party to talk' }); return; }
      if (team !== null && P.teamOf(d, uid) !== team) { res.status(403).json({ error: 'Join this team to use its voice' }); return; }
      room = team === null ? `gparty-${d.id}` : `gteam-${d.id}-${team}`;
      cap = team === null ? VOICE_CAP.party : VOICE_CAP.team;
      exclude = d.members.map(m => m.uid).filter(u => nope.has(u));
    } else if (scope.kind === 'rt') {
      const r = await store.get(RT_MATCHES, scope.id);
      const players: string[] = Array.isArray(r?.players) ? r!.players.map(String) : [];
      if (!r || !players.includes(uid)) { res.status(403).json({ error: 'Only the players in this room can talk' }); return; }
      if (r.status === 'done') { res.status(409).json({ error: 'This race is over' }); return; }
      room = `grt-${scope.id}`; cap = VOICE_CAP.rt;
      exclude = players.filter(u => nope.has(u));
    } else {
      const m = (await store.get(MATCHES, scope.id)) as M.MatchDoc | null;
      if (!m || !m.players.includes(uid)) { res.status(403).json({ error: 'Only the players can talk in this match' }); return; }
      if (m.status === 'done') { res.status(409).json({ error: 'This match is over' }); return; }
      const others = await Promise.all(m.players.filter(p => p !== uid).map(p => who(p)));
      if (others.some(o => o.isChild)) { res.status(403).json({ error: 'Voice is off — your opponent uses quick chat' }); return; }
      if (m.players.some(p => nope.has(p))) { res.status(403).json({ error: 'Voice is off for this match' }); return; }
      room = `gmatch-${m.id}`; cap = VOICE_CAP.match;
    }
    const token = mintJoinToken(cfg, { room, identity: uid, name: me.name, metadata: JSON.stringify({ scope: scope.key }), ttlSeconds: 4 * 3600 }, now());
    res.json({ url: cfg.url, token, room, identity: uid, cap, exclude, available: true });
  });

  chat.get('/:scope', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const scope = C.parseScope(req.params.scope); if (!scope) { res.status(400).json({ error: 'Unknown chat' }); return; }
    const me = await who(uid);
    const a = await scopeAccess(scope, uid, me); if ('error' in a) { fail(res, a); return; }
    if (!a.access.read) { res.status(403).json({ error: a.access.reason ?? 'Not available', access: a.access }); return; }
    const doc = (await store.get(CHAT, scope.key)) as C.ChatDoc | null;
    const since = Math.max(0, Number(req.query.since) || 0);
    const lines = C.viewLines(doc, since, { uid, isChild: me.isChild, hidden: await blocked(uid) });
    res.json({ lines, seq: doc?.seq ?? 0, access: a.access, quick: C.QUICK_CHAT });
  });

  chat.post('/:scope', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const scope = C.parseScope(req.params.scope); if (!scope) { res.status(400).json({ error: 'Unknown chat' }); return; }
    const me = await who(uid);
    const a = await scopeAccess(scope, uid, me); if ('error' in a) { fail(res, a); return; }
    if (!a.access.post) { res.status(403).json({ error: a.access.reason ?? 'You can’t post here' }); return; }
    const box: { err: Fail | null; line: C.ChatLine | null } = { err: null, line: null };
    const lineId = randomUUID();
    const out = await casUpdate(store.cas(CHAT), scope.key, cur => {
      box.err = null;
      const st = C.appendLine((cur as C.ChatDoc | null) ?? null, scope.key, me, { text: req.body?.text, quick: req.body?.quick }, lineId, now());
      if ('error' in st) { box.err = { error: st.error, status: st.status }; return { abort: true, result: null }; }
      box.line = st.line;
      return { patch: st.doc as unknown as Record<string, any>, result: null };
    });
    if (box.err) { fail(res, box.err); return; }
    if (!out.ok) { res.status(503).json({ error: 'Chat is busy — try again' }); return; }
    res.json({ line: box.line });
  });

  chat.post('/:scope/report', async (req, res) => {
    const uid = await needUid(req, res); if (!uid) return;
    const scope = C.parseScope(req.params.scope); if (!scope) { res.status(400).json({ error: 'Unknown chat' }); return; }
    const me = await who(uid);
    const a = await scopeAccess(scope, uid, me); if ('error' in a) { fail(res, a); return; }
    if (!a.access.read) { res.status(403).json({ error: 'Not available' }); return; }
    const doc = (await store.get(CHAT, scope.key)) as C.ChatDoc | null;
    const line = doc?.lines.find(l => l.id === s(req.body?.lineId, 64));
    if (!line || line.kind !== 'user') { res.status(404).json({ error: 'That message is gone' }); return; }
    if (line.uid === uid) { res.status(400).json({ error: 'That’s your own message' }); return; }
    const id = `${scope.key}__${line.id}__${uid}`;
    const w = await store.createOnce(REPORTS, id, {
      scope: scope.key, lineId: line.id, reportedUid: line.uid, reporterUid: uid, reason: s(req.body?.reason, 300),
      text: line.text, at: line.at, context: doc!.lines.filter(l => Math.abs(l.seq - line.seq) <= 5).map(l => ({ uid: l.uid, name: l.name, text: l.text, at: l.at })),
      status: 'open', createdAt: now(),
    });
    res.json({ ok: w !== 'error', duplicate: w === 'exists' });
  });

  return { party, chat };
}
