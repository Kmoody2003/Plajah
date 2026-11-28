// Table games on the Gamer Network (chess, checkers, dominoes, Spades, Euchre, Bid Whist): one shell for
// local play against the CPU and server-refereed online matches (quick match, invite code, rematch). The rules
// modules in services/gamerNet/games are shared with the server, so the board only offers moves the referee accepts.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Cpu, Globe, Sparkles, Trophy, Users } from 'lucide-react';
import { gamer, isSignedIn, failed, type MatchView } from '../../../services/gamerNet/client';
import { tableGame } from '../../../services/gamerNet/games/table';
import { ChessBoard, CheckersBoard, DominoTable } from './TableBoards';
import CardTable from './CardTable';
import { MatchTogether } from '../together/MatchTogether';

const ParlorStage3D = lazy(() => import('../../liveGames/ParlorStage3D').then(m => ({ default: m.ParlorStage3D })));

const GAME_EMBLEM: Record<string, string> = {
  chess: '♞', checkers: '⛀', dominoes: '🁫', spades: '♠', euchre: '♣', bidwhist: '♦',
};

export interface BoardProps { game: string; state: string; you: 0 | 1; myTurn: boolean; names: [string, string]; onMove(move: unknown): void }

function Board(p: BoardProps) {
  if (p.game === 'chess') return <ChessBoard {...p} />;
  if (p.game === 'checkers') return <CheckersBoard {...p} />;
  if (p.game === 'dominoes') return <DominoTable {...p} />;
  return <CardTable {...p} />;
}

type Screen = 'lobby' | 'cpu' | 'online';

export default function TableGame({ gameId, onExit, onOpenLeaderboard }: { gameId: string; onExit(): void; onOpenLeaderboard?(): void }) {
  const g = tableGame(gameId)!;
  const [screen, setScreen] = useState<Screen>('lobby');
  const [stage3d, setStage3d] = useState(true);
  const [copied, setCopied] = useState(false);

  // ───────────── local vs CPU (you are seat 0)
  const [local, setLocal] = useState<string>('');
  const localOutcome = local ? g.outcome(local) : null;
  const localTurn = local && !localOutcome ? g.seatToMove(local) : -1;
  const recorded = useRef(false);
  const startCpu = () => { recorded.current = false; setLocal(g.initial()); setScreen('cpu'); };
  const localMove = (mv: unknown) => { if (localTurn !== 0) return; const n = g.apply(local, 0, mv); if (n) setLocal(n); };
  useEffect(() => {
    if (screen !== 'cpu' || localTurn !== 1) return;
    const h = setTimeout(() => {
      const view = g.viewFor ? g.viewFor(local, 1) : local;
      const n = g.apply(local, 1, g.botMove(view, 1));
      if (n) setLocal(n);
    }, g.partnered ? 700 : 450);
    return () => clearTimeout(h);
  }, [screen, local, localTurn, g]);
  useEffect(() => {
    if (screen !== 'cpu' || !localOutcome || recorded.current) return;
    recorded.current = true;
    if (isSignedIn()) void gamer.local(g.id, localOutcome.draw ? 'draw' : localOutcome.winnerSeat === 0 ? 'win' : 'loss', 'cpu');
  }, [screen, localOutcome, g.id]);

  // ───────────── online
  const [matchId, setMatchId] = useState<string | null>(null);
  const [mv, setMv] = useState<MatchView | null>(null);
  const [searching, setSearching] = useState(false);
  const [waitedMs, setWaitedMs] = useState(0);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [netError, setNetError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const skew = useRef(0);
  const applyView = useCallback((v: MatchView) => { skew.current = v.serverNow - Date.now(); setMv(v); }, []);

  useEffect(() => {
    if (!searching) return;
    let alive = true;
    const tick = async () => {
      const r = await gamer.pollQueue(g.id);
      if (!alive) return;
      if (failed(r)) { setNetError(r.error); return; }
      if (r.status === 'matched' && r.matchId) { setSearching(false); setMatchId(r.matchId); setScreen('online'); }
      else if (r.waitedMs !== undefined) setWaitedMs(r.waitedMs);
    };
    const h = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(h); };
  }, [searching, g.id]);
  const searchingRef = useRef(false); searchingRef.current = searching;
  useEffect(() => () => { if (searchingRef.current) void gamer.leaveQueue(g.id); }, [g.id]);

  const m = mv?.match;
  const you = (mv?.you ?? -1) as -1 | 0 | 1;
  const onlineTurn = m && m.status === 'active' ? g.seatToMove(m.state) : -1;
  const myTurn = you >= 0 && onlineTurn === you;
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    const tick = async () => {
      const r = await gamer.match(matchId);
      if (!alive) return;
      if (failed(r)) { if (r.httpStatus !== 0) setNetError(r.error); return; }
      setNetError(''); applyView(r);
      if (r.match.nextMatchId) { setMatchId(r.match.nextMatchId); setMv(null); }
    };
    void tick();
    const done = m?.status === 'done';
    const waitingRematch = done && (m?.rematchVotes?.length ?? 0) > 0 && !m?.nextMatchId;
    if (done && !waitingRematch) return () => { alive = false; };
    const h = setInterval(tick, myTurn ? 3000 : 1200);
    return () => { alive = false; clearInterval(h); };
  }, [matchId, myTurn, m?.status, m?.rematchVotes?.length, m?.nextMatchId, applyView]);

  useEffect(() => {
    if (!m || m.status !== 'active') { setClock(0); return; }
    const upd = () => setClock(Math.max(0, Math.ceil((m.moveDeadline - (Date.now() + skew.current)) / 1000)));
    upd(); const h = setInterval(upd, 250); return () => clearInterval(h);
  }, [m?.moveDeadline, m?.status]);

  const quickMatch = async () => {
    setNetError(''); setBusy(true);
    const r = await gamer.queue(g.id); setBusy(false);
    if (failed(r)) { setNetError(r.error); return; }
    if (r.status === 'matched' && r.matchId) { setMatchId(r.matchId); setScreen('online'); } else { setWaitedMs(0); setSearching(true); }
  };
  const cancelSearch = async () => {
    setSearching(false);
    const r = await gamer.leaveQueue(g.id);
    if (!failed(r) && r.status === 'matched' && r.matchId) { setMatchId(r.matchId); setScreen('online'); }
  };
  const createInvite = async () => {
    setNetError(''); setBusy(true);
    const r = await gamer.invite(g.id); setBusy(false);
    if (failed(r)) { setNetError(r.error); return; }
    setInviteCode(r.code); setMatchId(r.matchId); setScreen('online');
  };
  const joinInvite = async () => {
    setNetError(''); setBusy(true);
    const r = await gamer.join(joinCode); setBusy(false);
    if (failed(r)) { setNetError(r.error); return; }
    setInviteCode(''); setMatchId(r.matchId); setScreen('online');
  };
  const onlineMove = async (move: unknown) => {
    if (!m || !matchId || !myTurn || busy) return;
    setBusy(true);
    const r = await gamer.move(matchId, move, m.v);
    setBusy(false);
    if (!failed(r)) { applyView(r); return; }
    setNetError(r.error);
    const again = await gamer.match(matchId); if (!failed(again)) applyView(again);
  };
  const leaveOnline = async () => {
    if (matchId && m && (m.status === 'active' || m.status === 'waiting')) await gamer.resign(matchId);
    setMatchId(null); setMv(null); setInviteCode(''); setScreen('lobby');
  };
  const back = () => {
    if (screen === 'online') { void leaveOnline(); return; }
    if (searching) void cancelSearch();
    if (screen === 'lobby') onExit(); else setScreen('lobby');
  };

  const names = useMemo<[string, string]>(() => (m?.cards?.length ? [m.cards[0]?.name || 'Player', m.cards[1]?.name || 'Waiting…'] : ['You', 'CPU']), [m?.cards]);

  const endLine = (winnerSeat: number | null | undefined, draw: boolean, me: number, reason?: string) => {
    if (draw || winnerSeat === null || winnerSeat === undefined) return 'Draw';
    const won = winnerSeat === me;
    const why = reason === 'timeout' ? (won ? ' — their clock ran out' : ' — your clock ran out') : reason === 'resign' ? (won ? ' — they resigned' : ' — you resigned') : '';
    return (won ? (g.partnered ? 'Your team wins!' : 'You win!') : g.partnered ? 'Their team wins' : 'You lose') + why;
  };

  const tension =
    screen === 'online' && m?.status === 'done' ? 0.92 :
    screen === 'cpu' && localOutcome ? 0.9 :
    screen === 'online' && m?.status === 'active' && clock > 0 && clock <= 15 ? 0.85 :
    screen !== 'lobby' ? 0.45 : 0.2;

  const copyCode = () => {
    if (!inviteCode) return;
    void navigator.clipboard?.writeText(inviteCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className="relative min-h-full w-full overflow-hidden bg-gradient-to-b from-[#07110e] via-[#070e12] to-[#05080f] text-white" data-testid={`table-${g.id}`}>
      {stage3d && (
        <Suspense fallback={null}>
          <ParlorStage3D venue="lounge" tension={tension} className="pointer-events-none fixed inset-0 z-0 opacity-50" />
        </Suspense>
      )}
      <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-amber-400/20 bg-black/45 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={back} className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/15">← {screen === 'lobby' ? 'Games' : 'Leave'}</button>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-500/25 to-emerald-600/20 text-xl text-amber-200 shadow-inner">
            {GAME_EMBLEM[g.id] ?? '★'}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-amber-50">{g.title}</h1>
            <p className="truncate text-xs text-white/60">{g.blurb}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStage3d(v => !v)}
            className="rounded-full border border-amber-300/25 bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-100/80 transition hover:bg-black/65"
          >
            {stage3d ? '3D Lounge: On' : '3D Lounge: Off'}
          </button>
          {screen === 'online' && m?.status === 'active' && (
            <div className={`rounded-full border px-3 py-1 text-sm font-bold tabular-nums ${myTurn ? (clock <= 15 ? 'animate-pulse border-rose-400/60 bg-rose-500/25 text-rose-200' : 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200') : 'border-white/15 bg-white/10 text-white/75'}`} data-testid="turn">
              {myTurn ? `Your move · ${clock}s` : `Their move · ${clock}s`}
            </div>
          )}
        </div>
      </header>

      {screen === 'lobby' && (
        <div className="relative z-10 mx-auto flex max-w-md flex-col gap-3.5 p-6">
          <div className="rounded-2xl border border-amber-400/25 bg-black/45 p-5 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/25 via-emerald-500/20 to-black/60 text-3xl text-amber-200 shadow-lg">
              {GAME_EMBLEM[g.id] ?? '★'}
            </div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-300/80">Plajah Grand Parlor</div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white">{g.title}</h2>
            <p className="mt-1 text-xs text-white/65">{g.blurb}</p>
          </div>

          <button type="button" onClick={startCpu} className="flex items-center gap-3.5 rounded-2xl border border-amber-300/45 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 px-4 py-3.5 text-left font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:brightness-105 active:scale-[0.99]">
            <Cpu size={22} className="shrink-0" />
            <span>
              <span className="block text-base">Play vs CPU</span>
              <span className="block text-xs font-medium opacity-80">{g.partnered ? 'You and a CPU partner against two CPUs' : 'Practice table — not rated'}</span>
            </span>
          </button>
          {isSignedIn() ? (
            <>
              {searching ? (
                <div className="rounded-2xl border border-emerald-400/35 bg-black/50 p-4 text-center backdrop-blur-md">
                  <div className="font-bold text-emerald-200">Finding an opponent… {Math.floor(waitedMs / 1000)}s</div>
                  <div className="mt-0.5 text-xs text-white/60">Matching by rating · skill window widens as you wait</div>
                  <button type="button" onClick={cancelSearch} className="mt-3 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/10">Cancel search</button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={quickMatch} data-testid="quick-match" className="flex items-center gap-3.5 rounded-2xl border border-emerald-400/45 bg-emerald-500/15 px-4 py-3.5 text-left font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-emerald-500/25 disabled:opacity-50">
                  <Globe size={22} className="shrink-0 text-emerald-300" />
                  <span>
                    <span className="block text-base">Quick match</span>
                    <span className="block text-xs font-normal text-white/75">Ranked · refereed by the server · on your Gamer Ledger{g.partnered ? ' · each of you gets a CPU partner' : ''}</span>
                  </span>
                </button>
              )}
              <button type="button" disabled={busy} onClick={createInvite} data-testid="invite" className="flex items-center gap-3.5 rounded-2xl border border-white/15 bg-black/40 px-4 py-3.5 text-left font-bold text-white backdrop-blur-md transition hover:border-amber-300/40 hover:bg-black/55 disabled:opacity-50">
                <Users size={22} className="shrink-0 text-amber-300" />
                <span>
                  <span className="block text-base">Invite a friend</span>
                  <span className="block text-xs font-normal text-white/65">Get a 6-letter table code · friendly, not rated</span>
                </span>
              </button>
              <div className="flex gap-2 rounded-2xl border border-white/15 bg-black/40 p-2 backdrop-blur-md">
                <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Enter 6-char code" maxLength={6} data-testid="join-code" className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-center font-mono text-sm font-bold tracking-[0.22em] outline-none focus:border-amber-400/60" />
                <button type="button" disabled={busy || joinCode.length !== 6} onClick={joinInvite} data-testid="join" className="rounded-xl bg-white/15 px-4 font-bold transition hover:bg-white/25 disabled:opacity-40">Join</button>
              </div>
            </>
          ) : <p className="rounded-xl border border-amber-400/25 bg-black/40 p-3 text-center text-sm text-amber-100/75 backdrop-blur-md">Sign in to play ranked online matches and climb the ledger.</p>}
          {onOpenLeaderboard && (
            <button type="button" onClick={onOpenLeaderboard} className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-black/35 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-200 backdrop-blur-md hover:bg-black/55">
              <Trophy size={13} /> Leaderboards
            </button>
          )}
          {netError && <p className="rounded-xl bg-rose-600/25 p-2.5 text-center text-sm text-rose-200" role="alert">{netError}</p>}
        </div>
      )}

      {screen === 'cpu' && local && (
        <div className="relative z-10 p-3 sm:p-5">
          {localOutcome && (
            <div className="mx-auto mb-3.5 flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-black/60 px-4 py-3 shadow-xl backdrop-blur-md" data-testid="result">
              <span className="flex items-center gap-2 font-bold text-amber-100"><Sparkles size={16} className="text-amber-300" /> {endLine(localOutcome.winnerSeat, localOutcome.draw, 0, (localOutcome.detail as any)?.reason)}</span>
              <button type="button" onClick={startCpu} className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-1.5 text-sm font-bold text-slate-950">Play again</button>
            </div>
          )}
          <Board game={g.id} state={g.viewFor ? g.viewFor(local, 0) : local} you={0} myTurn={localTurn === 0} names={['You', 'CPU']} onMove={localMove} />
        </div>
      )}

      {screen === 'online' && (
        <div className="relative z-10 p-3 sm:p-5">
          {inviteCode && m?.status === 'waiting' && (
            <div className="mx-auto mb-4 max-w-md rounded-2xl border border-amber-400/40 bg-black/55 p-5 text-center shadow-2xl backdrop-blur-md" data-testid="code-card">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/80">Share this table code</div>
              <div className="my-2 font-mono text-3xl font-black tracking-[0.32em] text-amber-100">{inviteCode}</div>
              <button type="button" onClick={copyCode} className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20">
                {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy code</>}
              </button>
              <div className="text-xs text-white/65">Waiting for your friend to sit down…</div>
            </div>
          )}
          {m?.status === 'done' && (
            <div className="mx-auto mb-3.5 flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400/40 bg-black/60 px-4 py-3 shadow-xl backdrop-blur-md" data-testid="result">
              <span className="flex items-center gap-2 font-bold text-amber-100"><Trophy size={16} className="text-amber-300" /> {endLine(m.winnerSeat, m.winnerSeat === null, you, m.endReason)}</span>
              <span className="flex gap-2">
                <button type="button" onClick={async () => { const r = await gamer.rematch(matchId!); if (!failed(r)) applyView(r); }} className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-1.5 text-sm font-bold text-slate-950">
                  {(m.rematchVotes ?? []).length ? 'Waiting for rematch…' : 'Rematch'}
                </button>
                {onOpenLeaderboard && <button type="button" onClick={onOpenLeaderboard} className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">Leaderboard</button>}
              </span>
            </div>
          )}
          {m && m.status !== 'waiting' && you >= 0 && (
            <Board game={g.id} state={m.state} you={you as 0 | 1} myTurn={myTurn && !busy} names={names} onMove={onlineMove} />
          )}
          {matchId && m && m.status !== 'waiting' && <MatchTogether matchId={matchId} player={you >= 0} active={m.status === 'active'} myName={you >= 0 ? m.cards?.[you]?.name : undefined} />}
          {m?.status === 'active' && (
            <div className="mt-3 text-center"><button type="button" onClick={() => { if (confirm('Resign this match?')) void gamer.resign(matchId!).then(r => { if (!failed(r)) applyView(r); }); }} className="text-xs font-semibold text-white/60 underline hover:text-white/90">Resign</button></div>
          )}
          {netError && <p className="mt-2 text-center text-sm text-rose-300" role="alert">{netError}</p>}
        </div>
      )}
    </div>
  );
}
