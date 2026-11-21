// Table games on the Gamer Network (chess, checkers, dominoes, Spades, Euchre, Bid Whist): one shell for
// local play against the CPU and server-refereed online matches (quick match, invite code, rematch). The rules
// modules in services/gamerNet/games are shared with the server, so the board only offers moves the referee accepts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gamer, isSignedIn, failed, type MatchView } from '../../../services/gamerNet/client';
import { tableGame } from '../../../services/gamerNet/games/table';
import { ChessBoard, CheckersBoard, DominoTable } from './TableBoards';
import CardTable from './CardTable';
import { MatchTogether } from '../together/MatchTogether';

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

  return (
    <div className="min-h-full w-full bg-[#070a14] text-white" data-testid={`table-${g.id}`}>
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={back} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10">← {screen === 'lobby' ? 'Games' : 'Leave'}</button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{g.title}</h1>
          <p className="truncate text-xs text-white/55">{g.blurb}</p>
        </div>
        {screen === 'online' && m?.status === 'active' && (
          <div className={`ml-auto rounded-full px-3 py-1 text-sm font-medium ${myTurn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/70'}`} data-testid="turn">
            {myTurn ? `Your move · ${clock}s` : `Their move · ${clock}s`}
          </div>
        )}
      </header>

      {screen === 'lobby' && (
        <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
          <button type="button" onClick={startCpu} className="rounded-xl bg-cyan-500/90 px-4 py-3 text-left font-semibold text-slate-950 hover:bg-cyan-400">
            Play vs CPU<span className="block text-xs font-normal opacity-80">{g.partnered ? 'You and a CPU partner against two CPUs' : 'Practice — not rated'}</span>
          </button>
          {isSignedIn() ? (
            <>
              {searching ? (
                <div className="rounded-xl border border-white/15 p-4">
                  <div className="font-medium">Finding an opponent… {Math.floor(waitedMs / 1000)}s</div>
                  <button type="button" onClick={cancelSearch} className="mt-2 text-sm text-white/70 underline">Cancel</button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={quickMatch} data-testid="quick-match" className="rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/15 px-4 py-3 text-left font-semibold hover:bg-fuchsia-500/25 disabled:opacity-50">
                  Quick match<span className="block text-xs font-normal text-white/70">Ranked · refereed by the server · on your Gamer Ledger{g.partnered ? ' · each of you gets a CPU partner' : ''}</span>
                </button>
              )}
              <button type="button" disabled={busy} onClick={createInvite} data-testid="invite" className="rounded-xl border border-white/15 px-4 py-3 text-left font-semibold hover:bg-white/5 disabled:opacity-50">
                Invite a friend<span className="block text-xs font-normal text-white/60">Get a 6-letter code · friendly, not rated</span>
              </button>
              <div className="flex gap-2">
                <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Code" maxLength={6} data-testid="join-code" className="w-full rounded-xl border border-white/15 bg-transparent px-3 py-2 tracking-widest" />
                <button type="button" disabled={busy || joinCode.length !== 6} onClick={joinInvite} data-testid="join" className="rounded-xl border border-white/15 px-4 font-semibold disabled:opacity-40">Join</button>
              </div>
            </>
          ) : <p className="text-sm text-white/60">Sign in to play ranked online matches.</p>}
          {onOpenLeaderboard && <button type="button" onClick={onOpenLeaderboard} className="text-sm text-cyan-300 underline">Leaderboards</button>}
          {netError && <p className="text-sm text-rose-300" role="alert">{netError}</p>}
        </div>
      )}

      {screen === 'cpu' && local && (
        <div className="p-3 sm:p-4">
          {localOutcome && (
            <div className="mx-auto mb-3 flex max-w-xl items-center justify-between rounded-xl bg-white/10 px-4 py-3" data-testid="result">
              <span className="font-semibold">{endLine(localOutcome.winnerSeat, localOutcome.draw, 0, (localOutcome.detail as any)?.reason)}</span>
              <button type="button" onClick={startCpu} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950">Play again</button>
            </div>
          )}
          <Board game={g.id} state={g.viewFor ? g.viewFor(local, 0) : local} you={0} myTurn={localTurn === 0} names={['You', 'CPU']} onMove={localMove} />
        </div>
      )}

      {screen === 'online' && (
        <div className="p-3 sm:p-4">
          {inviteCode && m?.status === 'waiting' && (
            <div className="mx-auto mb-3 max-w-md rounded-xl border border-white/15 p-4 text-center" data-testid="code-card">
              <div className="text-xs uppercase tracking-wider text-white/60">Share this code</div>
              <div className="my-1 font-mono text-3xl tracking-[0.3em]">{inviteCode}</div>
              <div className="text-sm text-white/60">Waiting for your friend to join…</div>
            </div>
          )}
          {m?.status === 'done' && (
            <div className="mx-auto mb-3 flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-xl bg-white/10 px-4 py-3" data-testid="result">
              <span className="font-semibold">{endLine(m.winnerSeat, m.winnerSeat === null, you, m.endReason)}</span>
              <span className="flex gap-2">
                <button type="button" onClick={async () => { const r = await gamer.rematch(matchId!); if (!failed(r)) applyView(r); }} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950">
                  {(m.rematchVotes ?? []).length ? 'Waiting for rematch…' : 'Rematch'}
                </button>
                {onOpenLeaderboard && <button type="button" onClick={onOpenLeaderboard} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm">Leaderboard</button>}
              </span>
            </div>
          )}
          {m && m.status !== 'waiting' && you >= 0 && (
            <Board game={g.id} state={m.state} you={you as 0 | 1} myTurn={myTurn && !busy} names={names} onMove={onlineMove} />
          )}
          {matchId && m && m.status !== 'waiting' && <MatchTogether matchId={matchId} player={you >= 0} active={m.status === 'active'} myName={you >= 0 ? m.cards?.[you]?.name : undefined} />}
          {m?.status === 'active' && (
            <div className="mt-3 text-center"><button type="button" onClick={() => { if (confirm('Resign this match?')) void gamer.resign(matchId!).then(r => { if (!failed(r)) applyView(r); }); }} className="text-sm text-white/60 underline">Resign</button></div>
          )}
          {netError && <p className="mt-2 text-center text-sm text-rose-300" role="alert">{netError}</p>}
        </div>
      )}
    </div>
  );
}
