// Live party games — referee for Brain Rush, Crowd Says and Impostor Night. Mounted at /api/live-party
// (server.ts). Pure rules: services/liveGames/party.ts. Sketch Rush has its own route (routes/liveGames.ts);
// both write the public game doc to `liveGames`, players to `liveGamePlayers` and lines to `liveGameFeed`,
// so the feed card, Live now strip and realtime listeners serve every game.
//
//   POST /                  {kind, title?, settings?, streamId?}   host opens a room → { game }
//   GET  /packs?kind=                                              packs for that game
//   GET  /:id                                                      { game, me, mine, serverNow } — mine = my answer / role / word
//   POST /:id/join          {name?}
//   POST /:id/start                                                host: lobby → round 1
//   POST /:id/answer        {choice} | {text}                      trivia choice / crowd answer / impostor clue (one per round)
//   POST /:id/vote          {target}                               impostor vote (one per round)
//   POST /:id/tick | /skip | /end | /stream {streamId}
//
// Storage (plajah-ops): liveGames (public), liveGamePlayers (public), liveGameFeed (public),
// liveGameSecrets (no client access), liveGameAnswers/{id}_{round}_{uid}[_v] (no client access).
// Points are paid once per player per round when the round closes (PlayerDoc.solvedRound marks it paid).

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { casUpdate } from '../services/casCore';
import type { GamerStore } from '../services/gamerNet/store';
import type { GamerAppend } from './gamerNet';
import * as C from '../services/liveGames/core';
import * as P from '../services/liveGames/party';
import { TRIVIA_PACKS, CROWD_PACKS, triviaPack, crowdPack } from '../services/liveGames/partyContent';
import { PACKS, packOrDefault } from '../services/liveGames/words';
import type { LiveGameDeps } from './liveGames';

const GAMES = 'liveGames', FEED = 'liveGameFeed', PLAYERS = 'liveGamePlayers', SECRETS = 'liveGameSecrets', ANSWERS = 'liveGameAnswers';
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const pid = (gid: string, uid: string) => `${gid}__${uid.replace(/[^\w-]/g, '_')}`;
const aid = (gid: string, round: number, uid: string, vote = false) => `${gid}_${String(round).padStart(3, '0')}_${uid.replace(/[^\w-]/g, '_')}${vote ? '_v' : ''}`;
const ACTIVE_MS = 5 * 60_000;

interface Answer { gid: string; round: number; uid: string; name: string; choice?: number; text?: string; target?: string; at: number; vote?: boolean }

export const packsFor = (kind: P.PartyKind) =>
  kind === 'trivia' ? TRIVIA_PACKS.map(p => ({ id: p.id, title: p.title, size: p.questions.length }))
  : kind === 'crowd' ? CROWD_PACKS.map(p => ({ id: p.id, title: p.title, size: p.prompts.length }))
  : PACKS.map(p => ({ id: p.id, title: p.title, size: p.words.length }));

export function createLivePartyRouter(deps: LiveGameDeps): Router {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const rand = deps.rand ?? Math.random;
  const r = Router();
  const games = store.cas(GAMES), players = store.cas(PLAYERS), secrets = store.cas(SECRETS);
  const lastAct = new Map<string, number>();

  const who = async (req: Request) => { const a = req.headers.authorization; return a?.startsWith('Bearer ') ? deps.verify(a.slice(7)).catch(() => null) : null; };
  const need = async (req: Request, res: Response) => { const w = await who(req); if (!w) res.status(401).json({ error: 'Sign in (or join as a guest) to play' }); return w; };
  const gameId = (req: Request, res: Response) => { const id = String(req.params.id ?? ''); if (!ID.test(id)) { res.status(400).json({ error: 'Bad game id' }); return null; } return id; };
  const readGame = async (id: string) => { const g = (await store.get(GAMES, id)) as P.PartyGameDoc | null; return g && P.PARTY_KINDS.includes(g.kind) ? g : null; };
  const readSecret = async (id: string) => ((await store.get(SECRETS, id)) as P.PartySecret | null) ?? { used: [], answer: -1, word: '', impostors: [] };
  const roundAnswers = async (gid: string, round: number) => (await store.query(ANSWERS, [{ field: 'gid', value: gid }, { field: 'round', value: round }], 5000)).map(x => x.data as Answer);
  const allPlayers = async (gid: string) => (await store.query(PLAYERS, [{ field: 'gid', value: gid }], 1000)).map(x => x.data as C.PlayerDoc);

  async function feed(gid: string, kind: 'guess' | 'solved' | 'system', name: string, text: string, extra: Record<string, unknown> = {}) {
    const at = now();
    await store.createOnce(FEED, `${gid}_${String(at).padStart(14, '0')}_${randomBytes(3).toString('hex')}`, { gid, kind, name: s(name, 40), text: s(text, 100), at, ...extra });
  }

  async function ensurePlayer(g: P.PartyGameDoc, uid: string, guest: boolean, nick?: string): Promise<C.PlayerDoc | null> {
    const key = pid(g.id, uid);
    const have = (await store.get(PLAYERS, key)) as C.PlayerDoc | null;
    const t = now();
    if (have && !nick) { if (t - have.seenAt > 30_000) await casUpdate(players, key, () => ({ patch: { seenAt: t }, result: true }), 2).catch(() => null); return have; }
    const card = guest ? null : await deps.userCard(uid).catch(() => null);
    const nickClean = nick ? C.publicGuessText(nick)?.slice(0, 24) : null;
    const name = card?.isChild ? 'Player' : nickClean || s(card?.name, 40) || `Guest ${uid.slice(-4).toUpperCase()}`;
    const doc: C.PlayerDoc = have
      ? { ...have, name: guest || !card ? name : have.name, seenAt: t }
      : { gid: g.id, uid, name, photo: card?.isChild ? '' : s(card?.photo, 500), score: 0, solvedRound: 0, solvedAtMs: 0, lastPoints: 0, guesses: 0, lastGuessAt: 0, joinedAt: t, seenAt: t, drewRounds: [], isGuest: guest };
    const out = await casUpdate(players, key, cur => (cur && !nick ? { abort: true, result: true } : { patch: doc as unknown as Record<string, unknown>, result: true }));
    if (!have && out.ok) await casUpdate(games, g.id, cur => (cur ? { patch: { players: (Number(cur.players) || 0) + 1 }, result: true } : { abort: true, result: false }));
    return (await store.get(PLAYERS, key)) as C.PlayerDoc | null;
  }

  /** Open round `round`: pick the question / prompt / word, then flip the public doc to 'answer'. */
  async function beginRound(g: P.PartyGameDoc, round: number): Promise<boolean> {
    const t = now();
    let prompt = '', options: string[] = [];
    const sec = await readSecret(g.id);
    const next: P.PartySecret = { used: sec.used, answer: -1, word: '', impostors: [] };
    if (g.kind === 'trivia') {
      const pack = triviaPack(g.settings.pack), i = P.pickIndex(pack.questions.length, sec.used, rand), q = pack.questions[i];
      prompt = q.q; options = [...q.options]; next.answer = q.answer; next.used = [...sec.used, i].slice(-200);
    } else if (g.kind === 'crowd') {
      const pack = crowdPack(g.settings.pack), i = P.pickIndex(pack.prompts.length, sec.used, rand);
      prompt = pack.prompts[i]; next.used = [...sec.used, i].slice(-200);
    } else {
      const pack = packOrDefault(g.settings.pack), i = P.pickIndex(pack.words.length, sec.used, rand);
      next.word = pack.words[i]; next.used = [...sec.used, i].slice(-200);
      prompt = pack.title;
      const active = (await allPlayers(g.id)).filter(p => t - p.seenAt < ACTIVE_MS).map(p => p.uid);
      if (!active.includes(g.hostUid)) active.push(g.hostUid);
      next.impostors = P.pickImpostors(active, rand);
    }
    // Secret first, so no answer is ever judged against the previous round's key.
    await casUpdate(secrets, g.id, () => ({ patch: next as unknown as Record<string, unknown>, result: true }));
    const out = await casUpdate(games, g.id, cur => {
      const c = cur as P.PartyGameDoc | null;
      if (!c || c.status === 'ended' || c.round !== round - 1 || (c.status !== 'lobby' && c.status !== 'reveal')) return { abort: true, result: false };
      return { patch: { status: 'answer', round, prompt, options, answered: 0, clues: [], reveal: null, phaseStartedAt: t, phaseEndsAt: t + g.settings.answerMs, updatedAt: t }, result: true };
    });
    return out.ok;
  }

  /** Impostor: close clue-giving and open the vote with everyone's clues on the board. */
  async function toVote(gid: string) {
    const g = await readGame(gid); if (!g || g.status !== 'answer') return;
    const clues = (await roundAnswers(gid, g.round)).filter(a => !a.vote && a.text)
      .sort((a, b) => a.at - b.at).slice(0, 60).map(a => ({ uid: a.uid, name: a.name, text: a.text! }));
    const t = now();
    await casUpdate(games, gid, cur => (cur?.status === 'answer' && cur.round === g.round
      ? { patch: { status: 'vote', clues, answered: 0, phaseStartedAt: t, phaseEndsAt: t + g.settings.voteMs, updatedAt: t }, result: true }
      : { abort: true, result: false }));
    await feed(gid, 'system', '', clues.length ? 'Clues are in — vote for the impostor!' : 'Nobody gave a clue — vote anyway!');
  }

  async function pay(gid: string, round: number, uid: string, pts: number) {
    await casUpdate(players, pid(gid, uid), cur => {
      const p = cur as C.PlayerDoc | null; if (!p || p.solvedRound === round) return { abort: true, result: false };
      return { patch: { score: p.score + pts, lastPoints: pts, solvedRound: round, solvedAtMs: now() }, result: true };
    }, 4).catch(() => null);
  }

  /** Close the round: compute the reveal, pay everyone once, refresh the scoreboard. Exactly once (CAS). */
  async function closeRound(gid: string) {
    const g0 = await readGame(gid); if (!g0 || (g0.status !== 'answer' && g0.status !== 'vote')) return;
    if (g0.kind === 'impostor' && g0.status === 'answer') { await toVote(gid); return; }
    const t = now();
    const claim = await casUpdate<P.PartyGameDoc | null>(games, gid, cur => {
      const c = cur as P.PartyGameDoc | null;
      if (!c || c.round !== g0.round || c.status !== g0.status) return { abort: true, result: null };
      return { patch: { status: 'reveal', phaseEndsAt: t + c.settings.revealMs, updatedAt: t }, result: c };
    });
    if (!claim.ok || !claim.result) return;
    const g = claim.result;
    const sec = await readSecret(gid);
    const answers = await roundAnswers(gid, g.round);
    let reveal: P.PartyGameDoc['reveal'] = null, line = '';
    if (g.kind === 'trivia') {
      const counts = [0, 0, 0, 0];
      let right = 0;
      for (const a of answers) {
        if (typeof a.choice !== 'number') continue;
        counts[a.choice] = (counts[a.choice] ?? 0) + 1;
        if (a.choice === sec.answer) { right++; await pay(gid, g.round, a.uid, P.triviaPoints(a.at - g.phaseStartedAt, g.settings.answerMs)); }
      }
      reveal = { correct: sec.answer, counts };
      line = `Answer: ${g.options[sec.answer] ?? '?'} — ${right} of ${answers.length} got it`;
    } else if (g.kind === 'crowd') {
      const board = P.crowdBoard(answers.map(a => a.text ?? ''));
      for (const a of answers) { const pts = P.crowdPoints(a.text ?? '', board); if (pts > 0) await pay(gid, g.round, a.uid, pts); }
      reveal = { board };
      line = board[0] ? `The crowd says: ${board[0].text} (${board[0].count})` : 'Nobody answered';
    } else {
      const votes = answers.filter(a => a.vote && a.target).map(a => ({ voter: a.uid, target: a.target! }));
      const clueGivers = new Set(answers.filter(a => !a.vote && a.text).map(a => a.uid));
      const tally = P.tallyImpostor(votes, sec.impostors);
      const nameOf = new Map((await allPlayers(gid)).map(p => [p.uid, p.name]));
      const owed = new Map<string, number>();
      const add = (u: string, n: number) => owed.set(u, (owed.get(u) ?? 0) + n);
      for (const u of clueGivers) add(u, P.IMPOSTOR_CLUE);
      for (const v of votes) if (!sec.impostors.includes(v.voter) && sec.impostors.includes(v.target)) add(v.voter, P.IMPOSTOR_CREW_CATCH);
      for (const u of sec.impostors) if (!tally.caughtIds.has(u)) add(u, P.IMPOSTOR_ESCAPE);
      for (const [u, n] of owed) await pay(gid, g.round, u, n);
      reveal = {
        word: sec.word, caught: tally.caught,
        impostors: sec.impostors.map(u => ({ uid: u, name: nameOf.get(u) ?? 'Player' })),
        votes: [...tally.counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u, n]) => ({ uid: u, name: nameOf.get(u) ?? 'Player', votes: n })),
      };
      line = `${tally.caught ? 'Caught!' : 'The impostor got away!'} The word was “${sec.word}”`;
    }
    const fresh = await allPlayers(gid);
    await casUpdate(games, gid, () => ({ patch: { reveal, top: C.topRows(fresh), players: Math.max(g.players, fresh.length) }, result: true }));
    await feed(gid, 'system', '', line);
  }

  async function endGame(gid: string, reason: string) {
    const t = now();
    const out = await casUpdate<P.PartyGameDoc | null>(games, gid, cur => {
      const c = cur as P.PartyGameDoc | null; if (!c || c.status === 'ended') return { abort: true, result: null };
      return { patch: { status: 'ended', endedAt: t, phaseEndsAt: t, updatedAt: t }, result: c };
    });
    if (!out.ok || !out.result) return;
    const g = out.result;
    const all = (await allPlayers(gid)).filter(p => p.score > 0).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    await casUpdate(games, gid, () => ({ patch: { top: C.topRows(all), players: Math.max(g.players, all.length) }, result: true }));
    await feed(gid, 'system', '', reason === 'host-gone' ? 'The host left — game over' : all[0] ? `${all[0].name} wins with ${all[0].score}!` : 'Game over');
    if (!deps.appendEvent || g.round === 0) return;
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      await deps.appendEvent(p.uid, {
        event: 'LIVE_GAME', uid: p.uid, at: t, key: `live:${gid}`, source: 'first-party', game: g.kind,
        points: C.gamerPointsFor(p.score, i + 1, all.length), rank: i + 1, players: all.length, note: `${p.score} pts`,
      }).catch(() => null);
    }
  }

  async function settle(gid: string): Promise<P.PartyGameDoc | null> {
    for (let i = 0; i < 4; i++) {
      const g = await readGame(gid); if (!g) return null;
      const step = P.partyTick(g, now(), C.HOST_GONE_MS);
      if (step.kind === 'none') return g;
      if (step.kind === 'toVote') await toVote(gid);
      else if (step.kind === 'close') await closeRound(gid);
      else if (step.kind === 'endGame') await endGame(gid, step.reason);
      else await beginRound(g, g.round + 1);
    }
    return readGame(gid);
  }

  const hostOnly = async (req: Request, res: Response) => {
    const id = gameId(req, res); if (!id) return null;
    const w = await need(req, res); if (!w) return null;
    const g = await readGame(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return null; }
    if (g.hostUid !== w.uid) { res.status(403).json({ error: 'Only the host can do that' }); return null; }
    return { id, uid: w.uid, g };
  };
  const throttle = (key: string, gap = 500) => { const t = now(); if (t - (lastAct.get(key) ?? 0) < gap) return false; lastAct.set(key, t); if (lastAct.size > 50_000) lastAct.clear(); return true; };

  // ───────────────────────────────────────────── routes
  r.post('/', async (req, res) => {
    const w = await need(req, res); if (!w) return;
    if (w.guest) { res.status(403).json({ error: 'Create a Plajah account to host a game' }); return; }
    const kind = String(req.body?.kind) as P.PartyKind;
    if (!P.PARTY_KINDS.includes(kind)) { res.status(400).json({ error: 'Unknown game' }); return; }
    const card = await deps.userCard(w.uid).catch(() => null);
    if (card?.isChild) { res.status(403).json({ error: 'Hosting live games needs a grown-up account' }); return; }
    const t = now(), id = randomBytes(9).toString('base64url');
    const streamId = /^[A-Za-z0-9_-]{1,128}$/.test(String(req.body?.streamId ?? '')) ? String(req.body.streamId) : '';
    const hostName = s(card?.name, 40) || 'Host';
    const game: P.PartyGameDoc = {
      id, kind, title: s(req.body?.title, 80) || `${hostName}'s ${P.PARTY_TITLES[kind]}`,
      hostUid: w.uid, hostName, hostPhoto: s(card?.photo, 500), streamId, settings: P.clampPartySettings(kind, req.body?.settings),
      status: 'lobby', round: 0, phaseEndsAt: 0, phaseStartedAt: 0, prompt: '', options: [], answered: 0, clues: [], reveal: null,
      top: [], players: 0, createdAt: t, updatedAt: t, hostSeenAt: t, endedAt: 0,
    };
    if ((await store.createOnce(GAMES, id, game as unknown as Record<string, unknown>)) !== 'created') { res.status(500).json({ error: 'Could not open the game room' }); return; }
    await store.createOnce(SECRETS, id, { used: [], answer: -1, word: '', impostors: [], hostUid: w.uid });
    await ensurePlayer(game, w.uid, false);
    res.json({ game });
  });

  r.get('/packs', (req, res) => {
    const kind = String(req.query.kind) as P.PartyKind;
    if (!P.PARTY_KINDS.includes(kind)) { res.status(400).json({ error: 'Unknown game' }); return; }
    res.json({ packs: packsFor(kind) });
  });

  r.get('/:id', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const g = await settle(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    const w = await who(req);
    const me = w ? (await store.get(PLAYERS, pid(id, w.uid))) as C.PlayerDoc | null : null;
    const mine: { choice?: number; text?: string; target?: string; role?: 'crew' | 'impostor' | 'watcher'; word?: string; category?: string } = {};
    if (w && g.round > 0) {
      const a = (await store.get(ANSWERS, aid(id, g.round, w.uid))) as Answer | null;
      const v = (await store.get(ANSWERS, aid(id, g.round, w.uid, true))) as Answer | null;
      if (a) { mine.choice = a.choice; mine.text = a.text; }
      if (v) mine.target = v.target;
      if (g.kind === 'impostor' && (g.status === 'answer' || g.status === 'vote')) {
        const sec = await readSecret(id);
        // Joined after roles were dealt: you're crew and see the word (you can vote, and clue if still open).
        if (sec.impostors.includes(w.uid)) { mine.role = 'impostor'; mine.category = g.prompt; }
        else { mine.role = 'crew'; mine.word = sec.word; }
      }
    }
    res.json({ game: g, me, mine, serverNow: now() });
  });

  r.post('/:id/join', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await need(req, res); if (!w) return;
    const g = await readGame(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    if (g.status === 'ended') { res.status(409).json({ error: 'This game has ended' }); return; }
    const me = await ensurePlayer(g, w.uid, w.guest, typeof req.body?.name === 'string' && w.guest ? req.body.name : undefined);
    if (!me) { res.status(500).json({ error: 'Could not join' }); return; }
    res.json({ me });
  });

  r.post('/:id/start', async (req, res) => {
    const h = await hostOnly(req, res); if (!h) return;
    if (h.g.status !== 'lobby') { res.status(409).json({ error: 'Already started' }); return; }
    await casUpdate(games, h.id, () => ({ patch: { hostSeenAt: now() }, result: true }));
    if (!(await beginRound({ ...h.g, hostSeenAt: now() }, 1))) { res.status(409).json({ error: 'Already started' }); return; }
    await feed(h.id, 'system', '', `${P.PARTY_TITLES[h.g.kind]} — round 1!`);
    res.json({ game: await readGame(h.id) });
  });

  r.post('/:id/answer', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await need(req, res); if (!w) return;
    if (!throttle(`${id}|${w.uid}|a`)) { res.status(429).json({ error: 'Slow down a little' }); return; }
    const g = await settle(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    const t = now();
    if (g.status !== 'answer' || t > g.phaseEndsAt + C.LATE_GUESS_GRACE_MS) { res.json({ result: 'closed' }); return; }
    const me = await ensurePlayer(g, w.uid, w.guest); if (!me) { res.status(500).json({ error: 'Could not join' }); return; }
    const row: Answer = { gid: id, round: g.round, uid: w.uid, name: me.name, at: t };
    if (g.kind === 'trivia') {
      const c = Number(req.body?.choice);
      if (!Number.isInteger(c) || c < 0 || c >= g.options.length) { res.status(400).json({ error: 'Pick an answer' }); return; }
      row.choice = c;
    } else if (g.kind === 'crowd') {
      const shown = C.publicGuessText(String(req.body?.text ?? '').slice(0, 80));
      if (!shown) { res.status(400).json({ error: 'Keep it clean and short' }); return; }
      row.text = shown;
    } else {
      const sec = await readSecret(id);
      const c = P.cleanClue(String(req.body?.text ?? '').slice(0, 80), sec.word);
      if ('error' in c) { res.status(400).json({ error: c.error }); return; }
      row.text = c.text;
    }
    const out = await store.createOnce(ANSWERS, aid(id, g.round, w.uid), row as unknown as Record<string, unknown>);
    if (out === 'exists') { res.json({ result: 'already' }); return; }
    if (out === 'error') { res.status(500).json({ error: 'Could not save' }); return; }
    await casUpdate(games, id, cur => (cur?.status === 'answer' && cur.round === g.round ? { patch: { answered: (Number(cur.answered) || 0) + 1 }, result: true } : { abort: true, result: false }), 3).catch(() => null);
    res.json({ result: 'locked' });
  });

  r.post('/:id/vote', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await need(req, res); if (!w) return;
    const g = await settle(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    if (g.kind !== 'impostor' || g.status !== 'vote' || now() > g.phaseEndsAt + C.LATE_GUESS_GRACE_MS) { res.json({ result: 'closed' }); return; }
    const target = String(req.body?.target ?? '');
    if (!g.clues.some(c => c.uid === target)) { res.status(400).json({ error: 'Vote for someone who gave a clue' }); return; }
    if (target === w.uid) { res.status(400).json({ error: 'You can’t vote for yourself' }); return; }
    const me = await ensurePlayer(g, w.uid, w.guest); if (!me) { res.status(500).json({ error: 'Could not join' }); return; }
    const out = await store.createOnce(ANSWERS, aid(id, g.round, w.uid, true), { gid: id, round: g.round, uid: w.uid, name: me.name, target, vote: true, at: now() });
    if (out === 'exists') { res.json({ result: 'already' }); return; }
    if (out === 'error') { res.status(500).json({ error: 'Could not save' }); return; }
    await casUpdate(games, id, cur => (cur?.status === 'vote' && cur.round === g.round ? { patch: { answered: (Number(cur.answered) || 0) + 1 }, result: true } : { abort: true, result: false }), 3).catch(() => null);
    res.json({ result: 'locked' });
  });

  r.post('/:id/tick', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await who(req);
    const g0 = await readGame(id); if (!g0) { res.status(404).json({ error: 'Game not found' }); return; }
    if (w && w.uid === g0.hostUid && g0.status !== 'ended') await casUpdate(games, id, () => ({ patch: { hostSeenAt: now() }, result: true }), 3).catch(() => null);
    res.json({ game: await settle(id), serverNow: now() });
  });

  r.post('/:id/skip', async (req, res) => {
    const h = await hostOnly(req, res); if (!h) return;
    if (h.g.status === 'answer' || h.g.status === 'vote') await closeRound(h.id);
    else if (h.g.status === 'reveal') await settle(h.id).then(async () => { const g = await readGame(h.id); if (g?.status === 'reveal') { if (g.round >= g.settings.rounds) await endGame(h.id, 'done'); else await beginRound(g, g.round + 1); } });
    res.json({ game: await readGame(h.id) });
  });

  r.post('/:id/end', async (req, res) => {
    const h = await hostOnly(req, res); if (!h) return;
    await endGame(h.id, 'host');
    res.json({ game: await readGame(h.id) });
  });

  r.post('/:id/stream', async (req, res) => {
    const h = await hostOnly(req, res); if (!h) return;
    const sid = String(req.body?.streamId ?? '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sid)) { res.status(400).json({ error: 'Bad stream id' }); return; }
    await casUpdate(games, h.id, () => ({ patch: { streamId: sid }, result: true }));
    res.json({ ok: true });
  });

  return r;
}
