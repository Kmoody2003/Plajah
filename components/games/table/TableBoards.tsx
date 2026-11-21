// Boards for chess, checkers and dominoes. Each one only offers moves the shared rules allow.
import React, { useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import * as CK from '../../../services/gamerNet/games/checkers';
import * as DM from '../../../services/gamerNet/games/dominoes';
import type { BoardProps } from './TableGame';

const GLYPH: Record<string, string> = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };

/** The two player strips (opponent above the board, you below). */
function playerRows({ names, you, turn, extra }: { names: [string, string]; you: number; turn: number; extra?: [React.ReactNode, React.ReactNode] }): { top: React.ReactElement; bottom: React.ReactElement } {
  const row = (seat: number) => (
    <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${turn === seat ? 'bg-emerald-500/15 text-emerald-200' : 'text-white/70'}`}>
      <span>{names[seat]}{seat === you ? ' (you)' : ''}</span><span>{extra?.[seat]}</span>
    </div>
  );
  return { top: row(1 - you), bottom: row(you) };
}

// ── chess ────────────────────────────────────────────────────────────────────────
export function ChessBoard({ state, you, myTurn, names, onMove }: BoardProps) {
  const st = JSON.parse(state) as { moves: string[]; fen: string };
  const c = useMemo(() => new Chess(st.fen), [st.fen]);
  const [sel, setSel] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const targets = useMemo(() => (sel ? c.moves({ square: sel as Square, verbose: true }).map(m => m.to) : []), [sel, c]);
  const last = st.moves.at(-1);
  const board = c.board();
  const rows = you === 1 ? [...board].reverse().map(r => [...r].reverse()) : board;
  const sqName = (r: number, f: number) => (you === 1 ? `${'hgfedcba'[f]}${r + 1}` : `${'abcdefgh'[f]}${8 - r}`);
  const turnSeat = c.turn() === 'w' ? 0 : 1;
  const P = playerRows({ names, you, turn: turnSeat, extra: [c.inCheck() && turnSeat === 0 ? 'check' : '', c.inCheck() && turnSeat === 1 ? 'check' : ''] });
  const click = (sq: string) => {
    if (!myTurn) return;
    if (sel && targets.includes(sq as Square)) {
      const piece = c.get(sel as Square);
      if (piece?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: sel, to: sq }); return; }
      onMove({ from: sel, to: sq }); setSel(null); return;
    }
    const p = c.get(sq as Square);
    setSel(p && p.color === (you === 0 ? 'w' : 'b') ? sq : null);
  };
  return (
    <div className="mx-auto max-w-[min(92vw,560px)]">
      {P.top}
      <div className="my-2 grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-lg border border-white/15" data-testid="chess-board">
        {rows.map((row, r) => row.map((p, f) => {
          const sq = sqName(r, f);
          const dark = (r + f) % 2 === 1;
          const isLast = last && (last.slice(0, 2) === sq || last.slice(2, 4) === sq);
          return (
            <button key={sq} type="button" data-sq={sq} onClick={() => click(sq)}
              className={`relative flex items-center justify-center text-[min(9vw,52px)] leading-none ${dark ? 'bg-[#3b4a6b]' : 'bg-[#c9d3e6]'} ${sel === sq ? 'ring-4 ring-inset ring-cyan-400' : ''} ${isLast ? 'after:absolute after:inset-0 after:bg-yellow-300/30' : ''}`}>
              {p && <span className={p.color === 'w' ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]' : 'text-slate-950'}>{GLYPH[p.color + p.type]}</span>}
              {targets.includes(sq as Square) && <span className="absolute h-3 w-3 rounded-full bg-cyan-400/80" />}
            </button>
          );
        }))}
      </div>
      {P.bottom}
      {promo && (
        <div className="mt-2 flex justify-center gap-2" data-testid="promotion">
          {(['q', 'r', 'b', 'n'] as const).map(k => (
            <button key={k} type="button" onClick={() => { onMove({ ...promo, promotion: k }); setPromo(null); setSel(null); }} className="rounded-lg bg-white/10 px-3 py-1 text-3xl">{GLYPH[(you === 0 ? 'w' : 'b') + k]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── checkers ─────────────────────────────────────────────────────────────────────
export function CheckersBoard({ state, you, myTurn, names, onMove }: BoardProps) {
  const st = JSON.parse(state) as CK.CheckersState;
  const legal = useMemo(() => CK.legalMoves(st), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const [path, setPath] = useState<number[]>([]);
  const fitting = legal.filter(m => path.every((x, i) => m[i] === x));
  const nextSteps = path.length ? fitting.filter(m => m.length > path.length).map(m => m[path.length]) : [];
  const starts = new Set(legal.map(m => m[0]));
  const P = playerRows({ names, you, turn: st.t });
  const click = (sq: number) => {
    if (!myTurn) return;
    if (path.length && nextSteps.includes(sq)) {
      const np = [...path, sq];
      const exact = legal.filter(m => m.length === np.length && m.every((x, i) => x === np[i]));
      const longer = legal.filter(m => m.length > np.length && np.every((x, i) => m[i] === x));
      if (exact.length && !longer.length) { onMove(np); setPath([]); } else setPath(np);
      return;
    }
    setPath(starts.has(sq) ? [sq] : []);
  };
  const order = Array.from({ length: 64 }, (_, i) => (you === 1 ? 63 - i : i));
  return (
    <div className="mx-auto max-w-[min(92vw,560px)]">
      {P.top}
      <div className="my-2 grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-lg border border-white/15" data-testid="checkers-board">
        {order.map(sq => {
          const r = Math.floor(sq / 8), c = sq % 8, dark = (r + c) % 2 === 1, ch = st.b[sq];
          const inPath = path.includes(sq), isNext = nextSteps.includes(sq), canStart = myTurn && !path.length && starts.has(sq);
          const lastHit = st.last?.includes(sq);
          return (
            <button key={sq} type="button" data-sq={sq} onClick={() => click(sq)} className={`relative flex items-center justify-center ${dark ? 'bg-[#2c3a55]' : 'bg-[#d9cdb0]'} ${lastHit ? 'after:absolute after:inset-0 after:bg-yellow-300/20' : ''}`}>
              {ch !== '.' && (
                <span className={`flex h-[78%] w-[78%] items-center justify-center rounded-full border-4 text-xl font-bold ${ch.toLowerCase() === 'b' ? 'border-slate-500 bg-slate-900 text-amber-300' : 'border-rose-300 bg-rose-600 text-amber-200'} ${inPath ? 'ring-4 ring-cyan-400' : canStart ? 'ring-2 ring-cyan-300/60' : ''}`}>
                  {ch === 'B' || ch === 'R' ? '♛' : ''}
                </span>
              )}
              {isNext && <span className="absolute h-4 w-4 rounded-full bg-cyan-400/80" />}
            </button>
          );
        })}
      </div>
      {P.bottom}
      {legal.length && Math.abs(legal[0][0] - legal[0][1]) > 9 && myTurn && <p className="mt-1 text-center text-sm text-amber-300">You must jump.</p>}
    </div>
  );
}

// ── dominoes ─────────────────────────────────────────────────────────────────────
const PIP_POS: Record<number, [number, number][]> = {
  0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};
function Half({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 grid-cols-3 grid-rows-3 p-0.5 sm:h-9 sm:w-9">
      {Array.from({ length: 9 }, (_, i) => <span key={i} className="flex items-center justify-center">{PIP_POS[n].some(([r, c]) => r * 3 + c === i) && <span className="h-1.5 w-1.5 rounded-full bg-slate-900 sm:h-2 sm:w-2" />}</span>)}
    </span>
  );
}
function Bone({ a, b, vertical, selected, dim, onClick }: { a: number; b: number; vertical?: boolean; selected?: boolean; dim?: boolean; onClick?(): void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} data-tile={`${Math.min(a, b)}-${Math.max(a, b)}`}
      className={`inline-flex ${vertical ? 'flex-col' : ''} items-center rounded-md border border-slate-400 bg-[#f5f1e6] shadow ${selected ? 'ring-4 ring-cyan-400' : ''} ${dim ? 'opacity-40' : ''}`}>
      <Half n={a} /><span className={vertical ? 'h-px w-6 bg-slate-400' : 'h-6 w-px bg-slate-400'} /><Half n={b} />
    </button>
  );
}
export function DominoTable({ state, you, myTurn, names, onMove }: BoardProps) {
  const st = JSON.parse(state) as DM.DominoState & { counts: number[]; boneCount: number };
  const hand = st.hands[you] ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const playable = (t: string) => DM.playableEnds(st.line, t);
  const anyPlay = hand.some(t => playable(t).length);
  const P = playerRows({ names, you, turn: st.turn, extra: [`${st.scores[0]} pts`, `${st.scores[1]} pts`] });
  const choose = (t: string) => {
    if (!myTurn) return;
    const ends = playable(t);
    if (!ends.length) return;
    if (ends.length === 1 || st.line.length === 0) { onMove({ play: t, end: ends[0] }); setSel(null); return; }
    setSel(t);
  };
  return (
    <div className="mx-auto max-w-3xl">
      {P.top}
      <div className="my-1 text-center text-xs text-white/55">Their hand: {st.counts?.[1 - you] ?? 0} tiles · Boneyard: {st.boneCount ?? 0} · First to {DM.TARGET}</div>
      <div className="my-3 flex min-h-[90px] flex-wrap items-center justify-center gap-1 rounded-xl bg-emerald-900/40 p-3" data-testid="domino-line">
        {st.line.length === 0 && <span className="text-sm text-white/60">{myTurn ? 'Lead any tile' : 'Waiting for the lead'}</span>}
        {st.line.map(([a, b], i) => <Bone key={i} a={a} b={b} vertical={a === b} />)}
      </div>
      {st.lastHand && <div className="mb-2 text-center text-sm text-amber-200">Last hand: {st.lastHand.winner === null ? 'blocked, even' : `${names[st.lastHand.winner]} +${st.lastHand.points}${st.lastHand.blocked ? ' (blocked)' : ''}`}</div>}
      {P.bottom}
      <div className="mt-2 flex flex-wrap justify-center gap-2" data-testid="domino-hand">
        {hand.map(t => { const [a, b] = DM.tileOf(t); const ok = myTurn && playable(t).length > 0; return <Bone key={t} a={a} b={b} vertical selected={sel === t} dim={myTurn && !ok} onClick={ok ? () => choose(t) : undefined} />; })}
      </div>
      {sel && (
        <div className="mt-2 flex justify-center gap-2">
          <button type="button" onClick={() => { onMove({ play: sel, end: 'L' }); setSel(null); }} className="rounded-lg bg-white/10 px-3 py-1.5">◀ Left end</button>
          <button type="button" onClick={() => { onMove({ play: sel, end: 'R' }); setSel(null); }} className="rounded-lg bg-white/10 px-3 py-1.5">Right end ▶</button>
        </div>
      )}
      {myTurn && !anyPlay && (
        <div className="mt-3 text-center">
          {st.boneCount ? <button type="button" onClick={() => onMove({ draw: true })} data-testid="draw" className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Draw a tile</button>
            : <button type="button" onClick={() => onMove({ pass: true })} data-testid="pass" className="rounded-lg bg-white/15 px-4 py-2 font-semibold">Pass</button>}
        </div>
      )}
    </div>
  );
}
