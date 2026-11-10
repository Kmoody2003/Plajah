// One refereed online match, for the compact boards in the timeline card and the game overlay. Same protocol as the
// full-screen Cyber Tic Tac Toe (poll fast while waiting on the opponent, optimistic move, server is the truth),
// kept separate so the feed doesn't mount the whole game screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as T from '../../../services/gamerNet/games/ticTacToe';
import { gamer, failed, type MatchView } from '../../../services/gamerNet/client';

export interface OnlineMatch {
  view: MatchView | null;
  you: number;
  myTurn: boolean;
  clock: number;
  error: string;
  play(i: number): Promise<void>;
  resign(): Promise<void>;
  rematch(): Promise<void>;
}

const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

/** Spectators (not a player) get the same live board, read-only. */
export function useOnlineMatch(matchId: string | null, onNext?: (nextId: string) => void): OnlineMatch {
  const [view, setView] = useState<MatchView | null>(null);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);
  const skew = useRef(0);
  const nextRef = useRef(onNext); nextRef.current = onNext;

  const apply = useCallback((v: MatchView) => { skew.current = v.serverNow - Date.now(); setView(v); }, []);
  useEffect(() => { setView(null); setError(''); }, [matchId]);

  const m = view?.match;
  const you = view?.you ?? -1;
  const myTurn = !!m && m.status === 'active' && you >= 0 && T.turnOf(m.state) === (you === 0 ? 'X' : 'O');

  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    const tick = async () => {
      const r = await gamer.match(matchId);
      if (!alive) return;
      if (failed(r)) { if (r.httpStatus !== 0) setError(r.error); return; }
      setError(''); apply(r);
      if (r.match.nextMatchId) nextRef.current?.(r.match.nextMatchId);
    };
    void tick();
    const done = m?.status === 'done';
    const waitingRematch = done && (m?.rematchVotes?.length ?? 0) > 0 && !m?.nextMatchId;
    if (done && !waitingRematch) return () => { alive = false; };
    const h = setInterval(tick, myTurn ? 3000 : 1200);
    return () => { alive = false; clearInterval(h); };
  }, [matchId, myTurn, m?.status, m?.rematchVotes?.length, m?.nextMatchId, apply]);

  useEffect(() => {
    if (!m || m.status !== 'active') { setClock(0); return; }
    const upd = () => setClock(Math.max(0, Math.ceil((m.moveDeadline - (Date.now() + skew.current)) / 1000)));
    upd(); const h = setInterval(upd, 250); return () => clearInterval(h);
  }, [m?.moveDeadline, m?.status]);

  const play = useCallback(async (i: number) => {
    if (!m || !matchId || !myTurn || m.state[i] !== '-') return;
    const optimistic = T.play(m.state, i, you === 0 ? 'X' : 'O'); if (!optimistic) return;
    buzz();
    setView(v => (v ? { ...v, match: { ...v.match, state: optimistic } } : v));
    const r = await gamer.move(matchId, i, m.v);
    if (!failed(r)) { apply(r); return; }
    setError(r.error);
    const again = await gamer.match(matchId); if (!failed(again)) apply(again);
  }, [m, matchId, myTurn, you, apply]);

  const resign = useCallback(async () => {
    if (!matchId) return;
    const r = await gamer.resign(matchId); if (!failed(r)) apply(r); else setError(r.error);
  }, [matchId, apply]);

  const rematch = useCallback(async () => {
    if (!matchId) return;
    const r = await gamer.rematch(matchId); if (!failed(r)) apply(r); else setError(r.error);
  }, [matchId, apply]);

  return { view, you, myTurn, clock, error, play, resign, rematch };
}

/** Status line for a match from one seat (or a spectator's view when you < 0). */
export function matchStatus(v: MatchView | null, myTurn: boolean): string {
  const m = v?.match; const you = v?.you ?? -1;
  if (!m) return 'Connecting…';
  const name = (seat: number) => m.cards[seat]?.name ?? 'Player';
  if (m.status === 'waiting') return 'Waiting for an opponent';
  if (m.status === 'active') {
    const toMove = T.turnOf(m.state) === 'X' ? 0 : 1;
    if (you < 0) return `${name(toMove)} to move`;
    return myTurn ? 'Your move' : `${name(1 - you)} is thinking`;
  }
  if (m.endReason === 'abandoned') return 'Match closed';
  const why = m.endReason === 'timeout' ? ' · out of time' : m.endReason === 'resign' ? ' · resigned' : '';
  if (m.winnerSeat === null || m.winnerSeat === undefined) return `Draw${why}`;
  if (you < 0) return `${name(m.winnerSeat)} wins${why}`;
  return (m.winnerSeat === you ? 'You win!' : 'You lose') + why;
}
