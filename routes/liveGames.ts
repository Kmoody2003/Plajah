// Live party games — the referee. Mounted at /api/live-game (server.ts). Pure rules: services/liveGames/core.ts.
//
//   POST /                      {title?, settings?, streamId?}  host opens a game room → { game }
//   GET  /live                                                 games running now (feed / Games discovery)
//   GET  /:id                                                  { game, me?, secret? } — the word + choices only for the drawer
//   POST /:id/start                                            host: lobby → first round
//   POST /:id/choose            {i}                            drawer picks one of three words
//   POST /:id/strokes           {round, seq, ops}              drawer's drawing, in small vector batches
//   POST /:id/guess             {text}                         → { verdict, points? }  ('close' is private)
//   POST /:id/join              {name?}                        register as a player (guests may set a nickname)
//   POST /:id/tick                                             host heartbeat + timer transitions
//   POST /:id/skip                                             host: end the current round now
//   POST /:id/end                                              host: end the game (awards the gamer ledger)
//   POST /:id/stream            {streamId}                     host: the live stream that carries this game
//   GET  /:id/poll?round=&after=&feedAfter=                    polling transport (lab + fallback when realtime is off)
//
// Storage (plajah-ops, written only through the service account):
//   liveGames/{id}                    public game doc (LiveGameDoc) — clients may read
//   liveGameStrokes/{id}_{round}_{seq} one stroke batch                — clients may read
//   liveGameFeed/{id}_{at}_{rand}     wrong guesses + "got it" lines   — clients may read
//   liveGamePlayers/{id}__{uid}       per-player score                 — clients may read
//   liveGameSecrets/{id}              the word / choices               — NO client access
//
// Every transition runs inside a compare-and-swap on the game doc, so two callers (the host's tick and a
// viewer's guess, say) advance a round exactly once. A correct guess writes only the guesser's own player doc,
// so a thousand people solving at once never fight over one document.

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { casUpdate } from '../services/casCore';
import type { GamerStore } from '../services/gamerNet/store';
import type { GamerAppend } from './gamerNet';
import * as C from '../services/liveGames/core';
import { wordPool, aliasesFor, PACKS } from '../services/liveGames/words';

export interface LiveGameDeps {
  store: GamerStore;
  /** Firebase ID token → uid and whether it's an anonymous (guest) account. */
  verify(idToken: string): Promise<{ uid: string; guest: boolean } | null>;
  userCard(uid: string): Promise<{ name: string; photo?: string; isChild?: boolean } | null>;
  /** Gamer ledger writer (routes/gamerNet.ts). Without it, games still run but award nothing to the universal score. */
  appendEvent?: GamerAppend;
  now?: () => number;
  rand?: () => number;
}

const GAMES = 'liveGames', STROKES = 'liveGameStrokes', FEED = 'liveGameFeed', PLAYERS = 'liveGamePlayers', SECRETS = 'liveGameSecrets';
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const s = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const pid = (gid: string, uid: string) => `${gid}__${uid.replace(/[^\w-]/g, '_')}`;
/** Max wrong guesses written to the public feed per game per second (per server instance); the rest are judged but not shown. */
const FEED_WRONG_PER_SEC = 6;

export function createLiveGameRouter(deps: LiveGameDeps): Router {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const rand = deps.rand ?? Math.random;
  const r = Router();
  const games = store.cas(GAMES), players = store.cas(PLAYERS), secrets = store.cas(SECRETS);
  const lastGuess = new Map<string, number>();
  const feedBudget = new Map<string, { sec: number; n: number }>();

  const who = async (req: Request) => {
    const a = req.headers.authorization; return a?.startsWith('Bearer ') ? deps.verify(a.slice(7)).catch(() => null) : null;
  };
  const need = async (req: Request, res: Response) => {
    const w = await who(req); if (!w) res.status(401).json({ error: 'Sign in (or join as a guest) to play' }); return w;
  };
  const gameId = (req: Request, res: Response): string | null => {
    const id = String(req.params.id ?? ''); if (!ID.test(id)) { res.status(400).json({ error: 'Bad game id' }); return null; } return id;
  };
  const readGame = async (id: string) => (await store.get(GAMES, id)) as C.LiveGameDoc | null;
  const readSecret = async (id: string) => ((await store.get(SECRETS, id)) as C.LiveGameSecret | null) ?? { word: '', choices: [], used: [], aliases: [] };

  async function feed(gid: string, kind: 'guess' | 'solved' | 'system', name: string, text: string, extra: Record<string, unknown> = {}) {
    const at = now();
    await store.createOnce(FEED, `${gid}_${String(at).padStart(14, '0')}_${randomBytes(3).toString('hex')}`, { gid, kind, name: s(name, 40), text: s(text, 80), at, ...extra });
  }

  async function allPlayers(gid: string): Promise<C.PlayerDoc[]> {
    return (await store.query(PLAYERS, [{ field: 'gid', value: gid }], 1000)).map(x => x.data as C.PlayerDoc);
  }

  /** Begin round `round` with `drawer`: three word choices go to the secret doc, the public doc shows 'choosing'. */
  async function beginRound(g: C.LiveGameDoc, round: number, drawer: { uid: string; name: string }, t: number): Promise<Partial<C.LiveGameDoc>> {
    await casUpdate(secrets, g.id, cur => {
      const used: string[] = Array.isArray(cur?.used) ? cur!.used : [];
      return { patch: { word: '', choices: C.pickChoices(wordPool(g.settings.pack), used, rand), used, aliases: [] }, result: true };
    });
    return { status: 'choosing', round, phaseEndsAt: t + g.settings.chooseMs, drawerUid: drawer.uid, drawerName: drawer.name, hint: '', wordLen: 0, solvedCount: 0, revealWord: '', updatedAt: t };
  }

  /** Commit the chosen word and open the drawing phase. Called by /choose and by the auto-pick timer. */
  async function chooseWord(gid: string, i: number, byUid: string | null): Promise<{ ok: boolean; error?: string }> {
    const g0 = await readGame(gid);
    if (!g0 || g0.status !== 'choosing') return { ok: false, error: 'Not choosing right now' };
    if (byUid && g0.drawerUid !== byUid) return { ok: false, error: 'Not your turn to choose' };
    // The word lands in the secret doc BEFORE the round opens, so no guess is ever judged against a blank answer.
    const picked = await casUpdate<string>(secrets, gid, cur => {
      const choices: string[] = Array.isArray(cur?.choices) ? cur!.choices : [];
      const word = choices[Math.max(0, Math.min(choices.length - 1, i))];
      if (!word) return { abort: true, result: '' };
      const used: string[] = Array.isArray(cur?.used) ? cur!.used : [];
      return { patch: { word, choices: [], used: [...used, word].slice(-200), aliases: aliasesFor(word) }, result: word };
    });
    const word = picked.result;
    if (!picked.ok || !word) return { ok: false, error: 'No words to choose' };
    const t = now();
    const out = await casUpdate<boolean>(games, gid, cur => {
      const g = cur as C.LiveGameDoc | null;
      if (!g || g.status !== 'choosing' || g.round !== g0.round) return { abort: true, result: false };
      return { patch: { status: 'drawing', roundStartedAt: t, phaseEndsAt: t + g.settings.roundMs, hint: C.hintFor(word, 0), wordLen: word.replace(/[^a-z0-9]/gi, '').length, updatedAt: t }, result: true };
    });
    return out.ok ? { ok: true } : { ok: false, error: 'The round moved on' };
  }

  /** End the round: reveal the word, pay the drawer, refresh the scoreboard. Exactly once (CAS on status). */
  async function endRound(gid: string): Promise<void> {
    const sec = await readSecret(gid);
    const t = now();
    const out = await casUpdate<C.LiveGameDoc | null>(games, gid, cur => {
      const g = cur as C.LiveGameDoc | null;
      if (!g || (g.status !== 'drawing' && g.status !== 'choosing')) return { abort: true, result: null };
      return { patch: { status: 'reveal', revealWord: sec.word || '(skipped)', hint: sec.word, phaseEndsAt: t + g.settings.revealMs, updatedAt: t }, result: g };
    });
    if (!out.ok || !out.result) return;
    const g = out.result;
    const all = await allPlayers(gid);
    const solvers = all.filter(p => p.solvedRound === g.round && p.uid !== g.drawerUid).length;
    const pts = C.drawerPoints(solvers);
    if (pts > 0) await payDrawer(g, pts);
    const fresh = await allPlayers(gid);
    await casUpdate(games, gid, () => ({ patch: { top: C.topRows(fresh), players: fresh.length, solvedCount: solvers }, result: true }));
    await feed(gid, 'system', '', sec.word ? `The word was “${sec.word}”${solvers ? ` — ${solvers} got it` : ''}` : 'Round skipped');
  }

  async function payDrawer(g: C.LiveGameDoc, pts: number) {
    const key = pid(g.id, g.drawerUid);
    await casUpdate(players, key, cur => {
      const p = cur as C.PlayerDoc | null;
      if (p && (p.drewRounds ?? []).includes(g.round)) return { abort: true, result: false };
      const base: C.PlayerDoc = p ?? { gid: g.id, uid: g.drawerUid, name: g.drawerName, photo: g.drawerUid === g.hostUid ? g.hostPhoto : '', score: 0, solvedRound: 0, solvedAtMs: 0, lastPoints: 0, guesses: 0, lastGuessAt: 0, joinedAt: now(), seenAt: now(), drewRounds: [], isGuest: false };
      return { patch: { ...base, score: base.score + pts, lastPoints: pts, drewRounds: [...(base.drewRounds ?? []), g.round].slice(-40) }, result: true };
    });
  }

  /** End the game and write every player's result to their gamer ledger (idempotent per game + player). */
  async function endGame(gid: string, reason: string): Promise<void> {
    const t = now();
    const out = await casUpdate<C.LiveGameDoc | null>(games, gid, cur => {
      const g = cur as C.LiveGameDoc | null;
      if (!g || g.status === 'ended') return { abort: true, result: null };
      return { patch: { status: 'ended', endedAt: t, phaseEndsAt: t, updatedAt: t }, result: g };
    });
    if (!out.ok || !out.result) return;
    const g = out.result;
    const all = (await allPlayers(gid)).filter(p => p.score > 0).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    await casUpdate(games, gid, () => ({ patch: { top: C.topRows(all), players: Math.max(g.players, all.length) }, result: true }));
    await feed(gid, 'system', '', reason === 'host-gone' ? 'The host left — game over' : all[0] ? `${all[0].name} wins with ${all[0].score}!` : 'Game over');
    if (!deps.appendEvent || g.round === 0) return;
    const count = all.length;
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      await deps.appendEvent(p.uid, {
        event: 'LIVE_GAME', uid: p.uid, at: t, key: `live:${gid}`, source: 'first-party', game: g.kind,
        points: C.gamerPointsFor(p.score, i + 1, count), rank: i + 1, players: count, note: `${p.score} pts`,
      }).catch(() => null);
    }
  }

  /** Apply whatever the clock says is due. Loops so a long-idle game catches up in one call. */
  async function settle(gid: string): Promise<C.LiveGameDoc | null> {
    for (let i = 0; i < 4; i++) {
      const g = await readGame(gid); if (!g) return null;
      // Brain Rush / Crowd Says / Impostor Night share the collection but have their own referee (routes/liveParty.ts).
      if (g.kind !== 'sketch') return g;
      const sec = g.status === 'drawing' ? await readSecret(gid) : null;
      const step = C.tick(g, sec?.word ?? '', now());
      if (step.kind === 'none') return g;
      if (step.kind === 'hint') { await casUpdate(games, gid, cur => (cur?.status === 'drawing' ? { patch: { hint: step.hint }, result: true } : { abort: true, result: false })); return readGame(gid); }
      if (step.kind === 'autoChoose') await chooseWord(gid, Math.floor(rand() * 3), null);
      else if (step.kind === 'endRound') await endRound(gid);
      else if (step.kind === 'endGame') await endGame(gid, step.reason);
      else if (step.kind === 'nextRound') {
        const all = await allPlayers(gid);
        const t = now();
        const drawer = C.nextDrawer(g, all, t);
        const patch = await beginRound(g, g.round + 1, drawer, t);
        await casUpdate(games, gid, cur => (cur?.status === 'reveal' && cur.round === g.round ? { patch, result: true } : { abort: true, result: false }));
      }
    }
    return readGame(gid);
  }

  const publicGame = (g: C.LiveGameDoc) => g; // the doc itself is public by construction (no secret fields)

  async function ensurePlayer(g: C.LiveGameDoc, uid: string, guest: boolean, nick?: string): Promise<C.PlayerDoc | null> {
    const key = pid(g.id, uid);
    const have = (await store.get(PLAYERS, key)) as C.PlayerDoc | null;
    if (have && !nick) return have;
    const card = guest ? null : await deps.userCard(uid).catch(() => null);
    const nickClean = nick ? C.publicGuessText(nick)?.slice(0, 24) : null;
    const name = card?.isChild ? 'Player' : nickClean || s(card?.name, 40) || `Guest ${uid.slice(-4).toUpperCase()}`;
    const t = now();
    const doc: C.PlayerDoc = have
      ? { ...have, name: guest || !card ? name : have.name }
      : { gid: g.id, uid, name, photo: card?.isChild ? '' : s(card?.photo, 500), score: 0, solvedRound: 0, solvedAtMs: 0, lastPoints: 0, guesses: 0, lastGuessAt: 0, joinedAt: t, seenAt: t, drewRounds: [], isGuest: guest };
    const out = await casUpdate(players, key, cur => (cur && !nick ? { abort: true, result: true } : { patch: doc as unknown as Record<string, unknown>, result: true }));
    if (!have && out.ok) await casUpdate(games, g.id, cur => (cur ? { patch: { players: (Number(cur.players) || 0) + 1 }, result: true } : { abort: true, result: false }));
    return (await store.get(PLAYERS, key)) as C.PlayerDoc | null;
  }

  // ───────────────────────────────────────────── routes
  r.post('/', async (req, res) => {
    const w = await need(req, res); if (!w) return;
    if (w.guest) { res.status(403).json({ error: 'Create a Plajah account to host a game' }); return; }
    const card = await deps.userCard(w.uid).catch(() => null);
    if (card?.isChild) { res.status(403).json({ error: 'Hosting live games needs a grown-up account' }); return; }
    const t = now();
    const id = randomBytes(9).toString('base64url');
    const settings = C.clampSettings(req.body?.settings);
    const streamId = /^[A-Za-z0-9_-]{1,128}$/.test(String(req.body?.streamId ?? '')) ? String(req.body.streamId) : '';
    const game: C.LiveGameDoc = {
      id, kind: 'sketch', title: s(req.body?.title, 80) || `${s(card?.name, 40) || 'A host'}'s Sketch Rush`,
      hostUid: w.uid, hostName: s(card?.name, 40) || 'Host', hostPhoto: s(card?.photo, 500), streamId, settings,
      status: 'lobby', round: 0, phaseEndsAt: 0, roundStartedAt: 0, drawerUid: w.uid, drawerName: s(card?.name, 40) || 'Host',
      hint: '', wordLen: 0, solvedCount: 0, revealWord: '', top: [], players: 0, createdAt: t, updatedAt: t, hostSeenAt: t, endedAt: 0,
    };
    const ok = await store.createOnce(GAMES, id, game as unknown as Record<string, unknown>);
    if (ok !== 'created') { res.status(500).json({ error: 'Could not open the game room' }); return; }
    await store.createOnce(SECRETS, id, { word: '', choices: [], used: [], aliases: [], hostUid: w.uid });
    res.json({ game, packs: PACKS.map(p => ({ id: p.id, title: p.title })) });
  });

  r.get('/live', async (_req, res) => {
    const t = now();
    const rows = await store.query(GAMES, [{ field: 'status', value: 'drawing' }], 30);
    const more = await store.query(GAMES, [{ field: 'status', value: 'choosing' }], 30);
    const lobby = await store.query(GAMES, [{ field: 'status', value: 'lobby' }], 30);
    const party: typeof rows = [];
    for (const st of ['answer', 'vote', 'reveal']) party.push(...await store.query(GAMES, [{ field: 'status', value: st }], 30));
    const list = [...rows, ...more, ...party, ...lobby].map(x => x.data as C.LiveGameDoc)
      .filter(g => t - g.hostSeenAt < C.HOST_GONE_MS)
      .sort((a, b) => b.players - a.players || b.updatedAt - a.updatedAt).slice(0, 20);
    res.json({ games: list });
  });

  r.get('/packs', (_req, res) => { res.json({ packs: PACKS.map(p => ({ id: p.id, title: p.title, size: p.words.length })) }); });

  r.get('/:id', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const g = await settle(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    const w = await who(req);
    const me = w ? (await store.get(PLAYERS, pid(id, w.uid))) as C.PlayerDoc | null : null;
    let secret: { word?: string; choices?: string[] } | undefined;
    if (w && w.uid === g.drawerUid && (g.status === 'choosing' || g.status === 'drawing')) {
      const sec = await readSecret(id);
      secret = g.status === 'choosing' ? { choices: sec.choices } : { word: sec.word };
    }
    res.json({ game: publicGame(g), me, secret, serverNow: now() });
  });

  r.post('/:id/join', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await need(req, res); if (!w) return;
    const g = await readGame(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    if (g.status === 'ended') { res.status(409).json({ error: 'This game has ended' }); return; }
    const nick = typeof req.body?.name === 'string' && w.guest ? req.body.name : undefined;
    const me = await ensurePlayer(g, w.uid, w.guest, nick);
    if (!me) { res.status(500).json({ error: 'Could not join' }); return; }
    res.json({ me });
  });

  const hostOnly = async (req: Request, res: Response): Promise<{ id: string; uid: string; g: C.LiveGameDoc } | null> => {
    const id = gameId(req, res); if (!id) return null;
    const w = await need(req, res); if (!w) return null;
    const g = await readGame(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return null; }
    if (g.hostUid !== w.uid) { res.status(403).json({ error: 'Only the host can do that' }); return null; }
    return { id, uid: w.uid, g };
  };

  r.post('/:id/start', async (req, res) => {
    const h = await hostOnly(req, res); if (!h) return;
    if (h.g.status !== 'lobby') { res.status(409).json({ error: 'Already started' }); return; }
    const t = now();
    const patch = await beginRound(h.g, 1, { uid: h.g.hostUid, name: h.g.hostName }, t);
    const out = await casUpdate(games, h.id, cur => (cur?.status === 'lobby' ? { patch: { ...patch, hostSeenAt: t }, result: true } : { abort: true, result: false }));
    if (!out.ok) { res.status(409).json({ error: 'Already started' }); return; }
    await ensurePlayer({ ...h.g }, h.uid, false);
    await feed(h.id, 'system', '', 'Game on! Round 1');
    res.json({ game: await readGame(h.id) });
  });

  r.post('/:id/choose', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await need(req, res); if (!w) return;
    const out = await chooseWord(id, Number(req.body?.i) || 0, w.uid);
    if (!out.ok) { res.status(409).json({ error: out.error }); return; }
    res.json({ game: await readGame(id), secret: { word: (await readSecret(id)).word } });
  });

  r.post('/:id/strokes', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await need(req, res); if (!w) return;
    const g = await readGame(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    if (g.drawerUid !== w.uid) { res.status(403).json({ error: 'Only the drawer can draw' }); return; }
    const round = Number(req.body?.round), seq = Number(req.body?.seq);
    if (g.status !== 'drawing' || round !== g.round) { res.status(409).json({ error: 'Round is not live', status: g.status, round: g.round }); return; }
    if (!Number.isInteger(seq) || seq < 1 || seq > C.MAX_BATCHES_PER_ROUND) { res.status(400).json({ error: 'Bad seq' }); return; }
    const ops = C.cleanOps(req.body?.ops); if (!ops) { res.status(400).json({ error: 'Bad stroke batch' }); return; }
    const batch: C.StrokeBatch = { gid: id, round, seq, ops, at: now() };
    const out = await store.createOnce(STROKES, `${id}_${String(round).padStart(3, '0')}_${String(seq).padStart(5, '0')}`, batch as unknown as Record<string, unknown>);
    if (out === 'error') { res.status(500).json({ error: 'Could not save' }); return; }
    res.json({ ok: true, dup: out === 'exists' });
  });

  r.post('/:id/guess', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await need(req, res); if (!w) return;
    const t = now();
    const gapKey = `${id}|${w.uid}`;
    if (t - (lastGuess.get(gapKey) ?? 0) < C.GUESS_GAP_MS) { res.status(429).json({ error: 'Slow down a little' }); return; }
    lastGuess.set(gapKey, t);
    if (lastGuess.size > 50_000) lastGuess.clear();
    const text = String(req.body?.text ?? '').slice(0, C.GUESS_MAX_CHARS * 2);
    const g = await settle(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    if (g.status !== 'drawing' || t > g.phaseEndsAt + C.LATE_GUESS_GRACE_MS) { res.json({ verdict: 'closed', status: g.status }); return; }
    if (g.drawerUid === w.uid) { res.status(403).json({ error: 'The drawer can’t guess' }); return; }
    const me = await ensurePlayer(g, w.uid, w.guest); if (!me) { res.status(500).json({ error: 'Could not join' }); return; }
    if (me.solvedRound === g.round) { res.json({ verdict: 'already' }); return; }
    const sec = await readSecret(id);
    const verdict = C.judgeGuess(text, sec.word, sec.aliases);
    if (verdict === 'correct') {
      const key = pid(id, w.uid);
      const solvePlace = (g.solvedCount || 0) + 1;
      const pts = C.guessPoints(t - g.roundStartedAt, g.settings.roundMs, solvePlace);
      const out = await casUpdate<number>(players, key, cur => {
        const p = cur as C.PlayerDoc | null; if (!p || p.solvedRound === g.round) return { abort: true, result: 0 };
        return { patch: { score: p.score + pts, solvedRound: g.round, solvedAtMs: t, lastPoints: pts, guesses: p.guesses + 1, lastGuessAt: t, seenAt: t }, result: pts };
      });
      if (!out.ok) { res.json({ verdict: 'already' }); return; }
      // The solved count is a hint for podium bonuses and the "N got it" line; contention here is harmless.
      await casUpdate(games, id, cur => (cur?.status === 'drawing' && cur.round === g.round ? { patch: { solvedCount: (Number(cur.solvedCount) || 0) + 1 }, result: true } : { abort: true, result: false }), 3).catch(() => null);
      await feed(id, 'solved', me.name, `${me.name} got it! +${pts}`, { uid: w.uid, points: pts, round: g.round });
      res.json({ verdict, points: pts, score: me.score + pts });
      return;
    }
    await casUpdate(players, pid(id, w.uid), cur => (cur ? { patch: { guesses: (Number(cur.guesses) || 0) + 1, lastGuessAt: t, seenAt: t }, result: true } : { abort: true, result: false }), 2).catch(() => null);
    // Wrong guesses go to the public feed (cleaned, spoiler-free, budgeted); 'close' ones stay private.
    if (verdict === 'wrong') {
      const shown = C.publicGuessText(text);
      const sec1 = Math.floor(t / 1000), b = feedBudget.get(id);
      const budget = b && b.sec === sec1 ? b : { sec: sec1, n: 0 };
      if (shown && budget.n < FEED_WRONG_PER_SEC) { budget.n++; feedBudget.set(id, budget); await feed(id, 'guess', me.name, shown, { round: g.round }); }
    }
    res.json({ verdict });
  });

  r.post('/:id/tick', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const w = await who(req);
    const g0 = await readGame(id); if (!g0) { res.status(404).json({ error: 'Game not found' }); return; }
    if (w && w.uid === g0.hostUid && g0.status !== 'ended') await casUpdate(games, id, () => ({ patch: { hostSeenAt: now() }, result: true }), 3).catch(() => null);
    const g = await settle(id);
    res.json({ game: g, serverNow: now() });
  });

  r.post('/:id/skip', async (req, res) => {
    const h = await hostOnly(req, res); if (!h) return;
    await endRound(h.id);
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

  // Polling transport: the lab and any client without realtime. Same data the Firestore listeners get.
  r.get('/:id/poll', async (req, res) => {
    const id = gameId(req, res); if (!id) return;
    const g = await settle(id); if (!g) { res.status(404).json({ error: 'Game not found' }); return; }
    const round = Number(req.query.round) || g.round, after = Number(req.query.after) || 0, feedAfter = Number(req.query.feedAfter) || 0;
    const strokes = (await store.query(STROKES, [{ field: 'gid', value: id }, { field: 'round', value: round }], 2000))
      .map(x => x.data as C.StrokeBatch).filter(b => b.seq > after).sort((a, b) => a.seq - b.seq);
    const feedRows = (await store.query(FEED, [{ field: 'gid', value: id }], 400))
      .map(x => x.data).filter(f => f.at > feedAfter).sort((a, b) => a.at - b.at).slice(-40);
    res.json({ game: g, strokes, feed: feedRows, serverNow: now() });
  });

  return r;
}
