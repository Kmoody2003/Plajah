// Boards for chess, checkers and dominoes — refreshed Grand Parlor Lounge visuals (layered Staunton SVG chess
// pieces, walnut & maple boards, 3D-beveled ridged lacquer checkers, color-coded ivory tournament dominoes).
// Each board still only offers moves the shared rules allow and keeps all data-* hooks intact.
import React, { useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import * as CK from '../../../services/gamerNet/games/checkers';
import * as DM from '../../../services/gamerNet/games/dominoes';
import type { BoardProps } from './TableGame';

/** Crisp layered Staunton SVG chess pieces (ivory white with warm gold shadow vs obsidian black with silver trim). */
function ChessPieceSvg({ color, type }: { color: 'w' | 'b'; type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p' }) {
  const fill = color === 'w' ? '#fbf6ea' : '#1b202c';
  const stroke = color === 'w' ? '#52381c' : '#d6c39c';
  const hi = color === 'w' ? '#ffffff' : '#3d475e';
  return (
    <svg viewBox="0 0 45 45" className="h-[82%] w-[82%] drop-shadow-[0_3px_3px_rgba(0,0,0,0.55)] transition-transform duration-150" aria-hidden>
      {type === 'p' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="22.5" cy="13.5" r="4.5" />
          <path d="M16.5 21.5c1.5-1.8 3.2-2.6 6-2.6s4.5.8 6 2.6c-1.8 1.5-2.8 4-2.5 7.2h-7c.3-3.2-.7-5.7-2.5-7.2z" />
          <path d="M12 36.5c1.2-3.6 4.4-5.5 10.5-5.5s9.3 1.9 10.5 5.5H12z" />
          <path d="M18 33.5h9" stroke={hi} strokeWidth="1" opacity="0.6" />
        </g>
      )}
      {type === 'r' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 10h4.5v3h3.5v-3h5v3h3.5v-3H33v6.5l-3 2.5H15l-3-2.5V10z" />
          <path d="M15.5 19h14l1.5 11.5H14L15.5 19z" />
          <path d="M11 36.5h23v-3.5l-3-2.5H14l-3 2.5v3.5z" />
          <path d="M16 22.5h13" stroke={hi} strokeWidth="1" opacity="0.55" />
        </g>
      )}
      {type === 'n' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 36.5h20v-3.5H13v3.5z" />
          <path d="M16 33c.8-4.5 2.5-7.8 5.2-10.2-2.5.4-5.3 1.2-7.8 2.3l-2.1-3.3c1.6-2.8 4.4-6.4 7.7-8.7l-.8-3.8c3.2.5 5.4 2.1 6.7 3.7 3.7 1.2 6.8 5.2 7.3 11.5.4 4.3-.4 6.5-1.2 8.5H16z" />
          <circle cx="19.5" cy="15.5" r="1.1" fill={stroke} stroke="none" />
          <path d="M26 16c2 2.2 3.3 5.5 3.3 9.5" fill="none" stroke={hi} strokeWidth="1.2" opacity="0.6" />
        </g>
      )}
      {type === 'b' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="22.5" cy="8.5" r="2.6" />
          <path d="M15.5 28c-2-3.4-1.5-8.5 2.4-12.5 1.8-1.9 3.4-3.1 4.6-4.2 1.2 1.1 2.8 2.3 4.6 4.2 3.9 4 4.4 9.1 2.4 12.5h-14z" />
          <path d="M17.5 19.5l5 5m0-5l-5 5" stroke={stroke} strokeWidth="1.4" opacity="0.7" />
          <path d="M11 36.5c2.8-2.3 6.6-3.2 11.5-3.2s8.7.9 11.5 3.2c-2.5 1.2-6.5.8-11.5-.6-5 1.4-9 1.8-11.5.6z" />
          <rect x="14.5" y="28" width="16" height="3.2" rx="1.4" />
        </g>
      )}
      {type === 'q' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8.5" cy="13.5" r="2" />
          <circle cx="15" cy="10" r="2" />
          <circle cx="22.5" cy="8.5" r="2.2" />
          <circle cx="30" cy="10" r="2" />
          <circle cx="36.5" cy="13.5" r="2" />
          <path d="M11.5 30L9.5 15.8l6.2 7.2L15.6 12l5.1 9.8L22.5 11l1.8 10.8L29.4 12l-.1 11 6.2-7.2L33.5 30h-22z" />
          <path d="M11.5 30c3.6-1.4 18.4-1.4 22 0v3.5c-3.6 1.5-18.4 1.5-22 0V30z" />
          <path d="M10.5 36.5h24v-2.2c-4.5 1.2-19.5 1.2-24 0v2.2z" />
        </g>
      )}
      {type === 'k' && (
        <g fill={fill} stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 6v6.5M19.5 9h6" strokeWidth="2.2" />
          <path d="M22.5 14c-4.2-2.2-11.5-.3-11.5 6.8 0 4.5 3.5 7.4 5 9.2h13c1.5-1.8 5-4.7 5-9.2 0-7.1-7.3-9-11.5-6.8z" />
          <path d="M22.5 14v15.5" stroke={hi} strokeWidth="1.2" opacity="0.65" />
          <path d="M12.5 30c4-1.6 16-1.6 20 0v3.5c-4 1.6-16 1.6-20 0V30z" />
          <path d="M11 36.5h23v-2.2c-4.5 1.2-18.5 1.2-23 0v2.2z" />
        </g>
      )}
    </svg>
  );
}

/** The two player strips (opponent above the board, you below). */
function playerRows({ names, you, turn, extra }: { names: [string, string]; you: number; turn: number; extra?: [React.ReactNode, React.ReactNode] }): { top: React.ReactElement; bottom: React.ReactElement } {
  const row = (seat: number) => {
    const active = turn === seat;
    return (
      <div className={`flex items-center justify-between rounded-xl border px-3.5 py-2 text-sm backdrop-blur-md transition ${active ? 'border-amber-400/50 bg-gradient-to-r from-amber-500/20 via-emerald-500/15 to-black/35 text-amber-100 shadow-lg shadow-amber-500/10' : 'border-white/10 bg-black/35 text-white/70'}`}>
        <span className="flex items-center gap-2 font-semibold">
          <span className={`h-2 w-2 rounded-full ${active ? 'animate-pulse bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-white/25'}`} />
          <span>{names[seat]}{seat === you ? ' (you)' : ''}</span>
        </span>
        {extra?.[seat] && <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-xs font-bold tracking-wide text-amber-200">{extra[seat]}</span>}
      </div>
    );
  };
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
  const inCheck = c.inCheck();
  const P = playerRows({ names, you, turn: turnSeat, extra: [inCheck && turnSeat === 0 ? 'CHECK' : 'White', inCheck && turnSeat === 1 ? 'CHECK' : 'Black'] });
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
    <div className="mx-auto max-w-[min(92vw,580px)]">
      {P.top}
      <div className="my-2.5 rounded-2xl border-2 border-amber-500/35 bg-gradient-to-br from-[#4a2b18] via-[#2f1a0f] to-[#1e1009] p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.65)] sm:p-3.5">
        <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-lg ring-1 ring-amber-200/30" data-testid="chess-board">
          {rows.map((row, r) => row.map((p, f) => {
            const sq = sqName(r, f);
            const dark = (r + f) % 2 === 1;
            const isLast = last && (last.slice(0, 2) === sq || last.slice(2, 4) === sq);
            const isTarget = targets.includes(sq as Square);
            const isKingChecked = inCheck && p?.type === 'k' && p.color === c.turn();
            return (
              <button
                key={sq}
                type="button"
                data-sq={sq}
                onClick={() => click(sq)}
                className={`relative flex items-center justify-center transition-colors ${
                  dark ? 'bg-[#7d5235]' : 'bg-[#e7d3b1]'
                } ${sel === sq ? 'ring-4 ring-inset ring-amber-300' : ''} ${
                  isLast ? 'after:pointer-events-none after:absolute after:inset-0 after:bg-amber-400/35' : ''
                } ${isKingChecked ? 'bg-rose-600/80 shadow-[inset_0_0_24px_rgba(244,63,94,0.95)]' : ''}`}
              >
                {f === 0 && (
                  <span className={`pointer-events-none absolute left-1 top-0.5 text-[9px] font-bold ${dark ? 'text-[#e7d3b1]/70' : 'text-[#7d5235]/70'}`}>
                    {sq[1]}
                  </span>
                )}
                {r === 7 && (
                  <span className={`pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-bold ${dark ? 'text-[#e7d3b1]/70' : 'text-[#7d5235]/70'}`}>
                    {sq[0]}
                  </span>
                )}
                {p && <ChessPieceSvg color={p.color} type={p.type} />}
                {isTarget && !p && <span className="pointer-events-none absolute h-3.5 w-3.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />}
                {isTarget && p && <span className="pointer-events-none absolute inset-1 rounded-full border-4 border-emerald-400/85 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />}
              </button>
            );
          }))}
        </div>
      </div>
      {P.bottom}
      {promo && (
        <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-amber-400/35 bg-black/55 p-2 backdrop-blur-md" data-testid="promotion">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-200">Promote:</span>
          {(['q', 'r', 'b', 'n'] as const).map(k => (
            <button key={k} type="button" onClick={() => { onMove({ ...promo, promotion: k }); setPromo(null); setSel(null); }} className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 transition hover:scale-105 hover:bg-amber-400/25">
              <ChessPieceSvg color={you === 0 ? 'w' : 'b'} type={k} />
            </button>
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
  const P = playerRows({ names, you, turn: st.t, extra: ['Obsidian', 'Crimson'] });
  const click = (sq: number) => {
    if (!myTurn) return;
    if (path.length && nextSteps.includes(sq)) {
      const np = [...path, sq];
      const exact = legal.filter(m => m.length === np.length && m.every((x, i) => x === np[i]));
      const longer = legal.filter(m => m.length > np.length && m.every((x, i) => m[i] === x));
      if (exact.length && !longer.length) { onMove(np); setPath([]); } else setPath(np);
      return;
    }
    setPath(starts.has(sq) ? [sq] : []);
  };
  const order = Array.from({ length: 64 }, (_, i) => (you === 1 ? 63 - i : i));
  return (
    <div className="mx-auto max-w-[min(92vw,580px)]">
      {P.top}
      <div className="my-2.5 rounded-2xl border-2 border-amber-500/35 bg-gradient-to-br from-[#3f2314] via-[#26140b] to-[#170c06] p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.65)] sm:p-3.5">
        <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-lg ring-1 ring-amber-200/30" data-testid="checkers-board">
          {order.map(sq => {
            const r = Math.floor(sq / 8), c = sq % 8, dark = (r + c) % 2 === 1, ch = st.b[sq];
            const inPath = path.includes(sq), isNext = nextSteps.includes(sq), canStart = myTurn && !path.length && starts.has(sq);
            const lastHit = st.last?.includes(sq);
            const isBlack = ch.toLowerCase() === 'b';
            const isKing = ch === 'B' || ch === 'R';
            return (
              <button key={sq} type="button" data-sq={sq} onClick={() => click(sq)}
                className={`relative flex items-center justify-center ${dark ? 'bg-[#2a3b34]' : 'bg-[#e5d4b3]'} ${lastHit ? 'after:pointer-events-none after:absolute after:inset-0 after:bg-amber-300/25' : ''}`}>
                {ch !== '.' && (
                  <span
                    className={`relative flex h-[80%] w-[80%] items-center justify-center rounded-full shadow-[0_5px_10px_rgba(0,0,0,0.65),inset_0_2px_4px_rgba(255,255,255,0.28)] transition-transform ${
                      isBlack
                        ? 'border-2 border-slate-500/80 bg-gradient-to-b from-slate-700 via-slate-900 to-black text-amber-300'
                        : 'border-2 border-rose-300/80 bg-gradient-to-b from-rose-500 via-rose-700 to-rose-950 text-amber-200'
                    } ${inPath ? 'scale-105 ring-4 ring-amber-300' : canStart ? 'ring-2 ring-emerald-300/80 hover:scale-105' : ''}`}
                  >
                    {/* concentric milled checker groove */}
                    <span className={`pointer-events-none absolute inset-[16%] rounded-full border ${isBlack ? 'border-slate-500/40' : 'border-rose-200/35'}`} />
                    {isKing && (
                      <svg viewBox="0 0 24 24" className="relative z-10 h-[52%] w-[52%] fill-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]" aria-hidden>
                        <path d="M3 18h18v2H3v-2zm0-2l2-9 4.5 4L12 5l2.5 6L19 7l2 9H3z" />
                      </svg>
                    )}
                  </span>
                )}
                {isNext && <span className="pointer-events-none absolute h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399] ring-4 ring-emerald-300/35" />}
              </button>
            );
          })}
        </div>
      </div>
      {P.bottom}
      {legal.length > 0 && Math.abs(legal[0][0] - legal[0][1]) > 9 && myTurn && (
        <p className="mt-2 text-center">
          <span className="inline-block rounded-full border border-amber-400/40 bg-amber-500/20 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-200 backdrop-blur-md">
            Forced capture — you must jump
          </span>
        </p>
      )}
    </div>
  );
}

// ── dominoes ─────────────────────────────────────────────────────────────────────
const PIP_POS: Record<number, [number, number][]> = {
  0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};
const PIP_COLOR: Record<number, string> = {
  0: 'bg-slate-900',
  1: 'bg-amber-600',
  2: 'bg-sky-700',
  3: 'bg-rose-700',
  4: 'bg-emerald-700',
  5: 'bg-violet-700',
  6: 'bg-slate-900',
};
function Half({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 grid-cols-3 grid-rows-3 p-1 sm:h-9 sm:w-9">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIP_POS[n].some(([r, c]) => r * 3 + c === i) && (
            <span className={`h-1.5 w-1.5 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.4)] sm:h-2 sm:w-2 ${PIP_COLOR[n] ?? 'bg-slate-900'}`} />
          )}
        </span>
      ))}
    </span>
  );
}
function Bone({ a, b, vertical, selected, dim, onClick }: { a: number; b: number; vertical?: boolean; selected?: boolean; dim?: boolean; onClick?(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-tile={`${Math.min(a, b)}-${Math.max(a, b)}`}
      className={`relative inline-flex ${vertical ? 'flex-col' : ''} items-center rounded-lg border border-amber-200/80 bg-gradient-to-b from-[#fffdf7] via-[#f6efe0] to-[#e6dbc5] shadow-[0_4px_10px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] transition ${
        selected ? '-translate-y-2 ring-4 ring-amber-400' : onClick ? 'hover:-translate-y-1.5 hover:shadow-[0_8px_18px_rgba(0,0,0,0.55)]' : ''
      } ${dim ? 'opacity-40' : ''}`}
    >
      <Half n={a} />
      <span className={`relative flex items-center justify-center ${vertical ? 'h-[1.5px] w-6 sm:w-7' : 'h-6 w-[1.5px] sm:h-7'} bg-amber-900/35`}>
        {/* classic brass spinner rivet */}
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 ring-1 ring-amber-900/40" />
      </span>
      <Half n={b} />
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
      <div className="my-2 flex flex-wrap items-center justify-center gap-2 text-xs text-white/75">
        <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 backdrop-blur-md">Their hand: <b>{st.counts?.[1 - you] ?? 0}</b></span>
        <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 backdrop-blur-md">Boneyard: <b>{st.boneCount ?? 0}</b></span>
        <span className="rounded-full border border-amber-400/25 bg-amber-500/15 px-3 py-1 text-amber-200 backdrop-blur-md">First to <b>{DM.TARGET}</b></span>
      </div>
      <div className="my-3 rounded-3xl border-[6px] border-[#422414] bg-gradient-to-b from-[#0e5a42] via-[#0a4633] to-[#073325] p-1 shadow-[0_22px_55px_rgba(0,0,0,0.6),inset_0_0_40px_rgba(0,0,0,0.45)]">
        <div className="flex min-h-[120px] flex-wrap items-center justify-center gap-1.5 rounded-[18px] border border-amber-300/20 p-4" data-testid="domino-line">
          {st.line.length === 0 && <span className="text-sm font-medium text-emerald-100/70">{myTurn ? 'Lead any domino onto the felt' : 'Waiting for the opening tile…'}</span>}
          {st.line.map(([a, b], i) => <Bone key={i} a={a} b={b} vertical={a === b} />)}
        </div>
      </div>
      {st.lastHand && (
        <div className="mb-2.5 text-center">
          <span className="inline-block rounded-full border border-amber-400/30 bg-black/45 px-3.5 py-1 text-xs font-semibold text-amber-200 backdrop-blur-md">
            Last hand: {st.lastHand.winner === null ? 'blocked, even' : `${names[st.lastHand.winner]} +${st.lastHand.points}${st.lastHand.blocked ? ' (blocked)' : ''}`}
          </span>
        </div>
      )}
      {P.bottom}
      <div className="mt-3 flex flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md" data-testid="domino-hand">
        {hand.map(t => { const [a, b] = DM.tileOf(t); const ok = myTurn && playable(t).length > 0; return <Bone key={t} a={a} b={b} vertical selected={sel === t} dim={myTurn && !ok} onClick={ok ? () => choose(t) : undefined} />; })}
      </div>
      {sel && (
        <div className="mt-3 flex justify-center gap-2.5">
          <button type="button" onClick={() => { onMove({ play: sel, end: 'L' }); setSel(null); }} className="rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30">◀ Play Left End</button>
          <button type="button" onClick={() => { onMove({ play: sel, end: 'R' }); setSel(null); }} className="rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30">Play Right End ▶</button>
        </div>
      )}
      {myTurn && !anyPlay && (
        <div className="mt-3 text-center">
          {st.boneCount
            ? <button type="button" onClick={() => onMove({ draw: true })} data-testid="draw" className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 font-bold text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-105">Draw from Boneyard</button>
            : <button type="button" onClick={() => onMove({ pass: true })} data-testid="pass" className="rounded-xl border border-white/20 bg-white/15 px-5 py-2.5 font-semibold hover:bg-white/25">Pass Turn</button>}
        </div>
      )}
    </div>
  );
}
