// The card table for Spades, Euchre and Bid Whist — refreshed Grand Parlor Lounge felt, linen-textured cards,
// ornate foil backs, brass dealer puck, and crisp bidding controls. Keeps all data-* hooks intact.
import React, { useMemo, useState } from 'react';
import { legalPlays, sortHand, isJoker, SUIT_GLYPH, SUIT_NAME, SUITS, type Play, type TrickRules } from '../../../services/gamerNet/games/cards';
import * as SP from '../../../services/gamerNet/games/spades';
import * as EU from '../../../services/gamerNet/games/euchre';
import * as BW from '../../../services/gamerNet/games/bidWhist';
import type { BoardProps } from './TableGame';

const RED = (c: string) => c[1] === 'H' || c[1] === 'D' || c === 'BJ';
const rankLabel = (c: string) => (c === 'BJ' ? 'BIG' : c === 'LJ' ? 'LTL' : c[0] === 'T' ? '10' : c[0]);
const label = (c: string) => (c === 'BJ' ? 'Big ★' : c === 'LJ' ? 'Little ★' : `${c[0] === 'T' ? '10' : c[0]}${SUIT_GLYPH[c[1]]}`);

function Card({ c, onClick, dim, raised, small }: { c: string; onClick?(): void; dim?: boolean; raised?: boolean; small?: boolean }) {
  const isRed = RED(c);
  const joker = isJoker(c);
  const suit = joker ? '★' : SUIT_GLYPH[c[1]];
  const isCourt = joker || ['A', 'K', 'Q', 'J'].includes(c[0]);
  return (
    <button
      type="button"
      data-card={c}
      onClick={onClick}
      disabled={!onClick}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-gradient-to-b from-[#fffef9] via-[#faf5e9] to-[#efe6d2] px-1.5 py-1 font-bold shadow-[0_6px_14px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-150 ${
        isCourt ? 'border-amber-400/80' : 'border-stone-300/90'
      } ${small ? 'h-16 w-11 text-xs' : 'h-24 w-16 text-sm sm:h-28 sm:w-[4.5rem] sm:text-base'} ${
        isRed ? 'text-rose-600' : 'text-slate-900'
      } ${dim ? 'opacity-35 saturate-50' : ''} ${
        raised ? '-translate-y-3.5 ring-4 ring-amber-400 shadow-[0_14px_24px_rgba(245,158,11,0.35)]' : onClick ? 'hover:-translate-y-2 hover:shadow-[0_12px_20px_rgba(0,0,0,0.6)]' : ''
      }`}
    >
      <div className="flex flex-col items-start leading-none">
        <span className="tracking-tight">{rankLabel(c)}</span>
        <span className={small ? 'text-[11px]' : 'text-xs'}>{suit}</span>
      </div>
      <span className={`pointer-events-none self-center leading-none ${small ? 'text-xl' : 'text-3xl sm:text-4xl'} ${joker ? 'text-amber-500 drop-shadow-sm' : 'opacity-90'}`}>
        {suit}
      </span>
      {!small && (
        <div className="flex rotate-180 flex-col items-start leading-none opacity-80">
          <span className="text-[11px] tracking-tight">{rankLabel(c)}</span>
        </div>
      )}
    </button>
  );
}

const Back = ({ n }: { n: number }) => (
  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-100/75">
    <span className="relative inline-flex h-9 w-6 items-center justify-center rounded-md border border-amber-300/60 bg-gradient-to-br from-indigo-900 via-violet-900 to-slate-950 shadow-md">
      <span className="h-5 w-3 rounded-[2px] border border-amber-300/45 bg-amber-400/10" />
    </span>
    <span>× {n}</span>
  </div>
);

function rulesOf(game: string, t: any): TrickRules {
  if (game === 'spades') return SP.R;
  if (game === 'euchre') return EU.rulesFor(t.trump);
  return BW.rulesFor(t.bid?.mode ?? 'up', t.trump);
}

const btn = 'rounded-xl px-3.5 py-1.5 text-sm font-bold transition shadow-sm';

export default function CardTable({ game, state, you, myTurn, names, onMove }: BoardProps) {
  const t = JSON.parse(state) as any;
  const R = rulesOf(game, t);
  const rel = (p: number) => (p - you + 4) % 4; // 0 you, 1 left, 2 partner, 3 right
  // The other human goes by their name; CPU seats by where they sit.
  const name = (p: number) => (rel(p) === 0 ? 'You' : p < 2 ? names[p] : ['You', 'Left', 'Partner', 'Right'][rel(p)]);
  const hand: string[] = useMemo(() => sortHand(t.hands[you] ?? [], R), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const legal = t.phase === 'play' && myTurn ? legalPlays(hand, t.trick, R, game === 'spades' ? (c: string) => t.broken || c[1] !== 'S' : undefined) : [];
  const [picked, setPicked] = useState<string[]>([]);
  const [trumpPick, setTrumpPick] = useState<string>('');
  const us = you % 2, them = 1 - us;

  const seat = (p: number) => {
    const play = (t.trick as Play[]).find(x => x.p === p);
    const bid = game === 'spades' ? t.bids?.[p] : game === 'bidwhist' ? t.bids?.[p] : null;
    const bidText = bid === null || bid === undefined ? '' : game === 'spades' ? (bid === 0 ? 'Nil' : `Bid ${bid}`) : bid === 'pass' ? 'Pass' : `${bid.n} ${bid.mode === 'up' ? '↑' : bid.mode === 'down' ? '↓' : 'NT'}`;
    return { play, bidText };
  };

  const logLine = (s: string) => s.replace(/\{(\d)\}/g, (_, d) => name(Number(d)));
  const trumpText = t.trump ? `${SUIT_GLYPH[t.trump]} ${SUIT_NAME[t.trump]}` : game === 'bidwhist' && t.bid?.mode === 'no' ? 'No trump' : '—';

  const Spot = ({ p, cls }: { p: number; cls: string }) => {
    const s = seat(p);
    const active = t.turn === p;
    return (
      <div className={`absolute flex flex-col items-center gap-1 ${cls}`}>
        <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md ${active ? 'border-amber-300/70 bg-amber-400/25 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.35)]' : 'border-white/15 bg-black/45 text-white/80'}`}>
          <span>{name(p)}{p >= 2 ? ' · CPU' : ''}</span>
          {t.dealer === p && <span title="Dealer" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-300 text-[10px] font-black text-slate-950">D</span>}
          {game === 'bidwhist' && t.bidder === p && <span className="text-[10px] font-bold uppercase text-amber-300">bid</span>}
          {game === 'euchre' && t.maker === p && <span className="text-[10px] font-bold uppercase text-amber-300">called</span>}
        </div>
        {rel(p) !== 0 && <Back n={t.counts?.[p] ?? 0} />}
        {s.bidText && <span className="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-amber-200">{s.bidText}{t.phase === 'play' ? ` · ${t.won?.[p] ?? 0} won` : ''}</span>}
        {s.play && <Card c={s.play.c} small />}
      </div>
    );
  };

  // ───────────── phase controls
  let controls: React.ReactNode = null;
  if (myTurn && game === 'spades' && t.phase === 'bid') {
    controls = (
      <div className="flex flex-wrap justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/40 p-2.5 backdrop-blur-md" data-testid="bid-row">
        {Array.from({ length: 14 }, (_, n) => (
          <button key={n} type="button" onClick={() => onMove({ bid: n })} className={`${btn} ${n === 0 ? 'border border-fuchsia-400/50 bg-fuchsia-500/25 text-fuchsia-100 hover:bg-fuchsia-500/40' : 'border border-white/15 bg-white/10 hover:bg-amber-400/25'}`}>
            {n === 0 ? 'Nil' : n}
          </button>
        ))}
      </div>
    );
  } else if (myTurn && game === 'euchre' && t.phase === 'call1') {
    controls = (
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-amber-400/25 bg-black/45 p-3 backdrop-blur-md" data-testid="call-row">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-200">Upcard</span>
        <Card c={t.upcard} small />
        <button type="button" onClick={() => onMove({ call: 'order' })} className={`${btn} bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 hover:brightness-105`}>{t.dealer === you ? 'Pick it up' : 'Order up'}</button>
        <button type="button" onClick={() => onMove({ call: 'pass' })} className={`${btn} border border-white/15 bg-white/10 hover:bg-white/20`}>Pass</button>
      </div>
    );
  } else if (myTurn && game === 'euchre' && t.phase === 'call2') {
    controls = (
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-amber-400/25 bg-black/45 p-3 backdrop-blur-md" data-testid="call-row">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-200">Name trump</span>
        {SUITS.filter(s => s !== t.upcard[1]).map(s => <button key={s} type="button" onClick={() => onMove({ call: s })} className={`${btn} border border-white/15 bg-white/10 hover:bg-white/20 ${s === 'H' || s === 'D' ? 'text-rose-300' : ''}`}>{SUIT_GLYPH[s]} {SUIT_NAME[s]}</button>)}
        {t.dealer !== you ? <button type="button" onClick={() => onMove({ call: 'pass' })} className={`${btn} border border-white/15 bg-white/10 hover:bg-white/20`}>Pass</button> : <span className="text-xs font-bold text-amber-300">Stick the dealer — must call</span>}
      </div>
    );
  } else if (myTurn && game === 'euchre' && t.phase === 'discard') {
    controls = <p className="rounded-xl border border-amber-400/30 bg-amber-500/15 px-4 py-2 text-center text-sm font-semibold text-amber-100 backdrop-blur-md">You picked up the {label(t.upcard)}. Tap a card from your hand to discard.</p>;
  } else if (myTurn && game === 'bidwhist' && t.phase === 'bid') {
    const bids = (t.bids as any[]).filter(b => b && b !== 'pass');
    const top = bids.reduce((m: number, b: any) => Math.max(m, b.n * 2 + (b.mode === 'no' ? 1 : 0)), 0);
    const stuck = t.dealer === you && !bids.length;
    controls = (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-400/25 bg-black/45 p-3 backdrop-blur-md" data-testid="bid-row">
        {(['up', 'down', 'no'] as const).map(mode => (
          <div key={mode} className="flex items-center gap-1.5">
            <span className="w-24 text-right text-xs font-semibold text-amber-100/75">{mode === 'up' ? 'Uptown' : mode === 'down' ? 'Downtown' : 'No trump'}</span>
            {[3, 4, 5, 6, 7].map(n => { const v = n * 2 + (mode === 'no' ? 1 : 0); return v > top ? <button key={n} type="button" onClick={() => onMove({ bid: { n, mode } })} className={`${btn} border border-white/15 bg-white/10 hover:bg-amber-400/25`}>{n}</button> : <span key={n} className="w-9" />; })}
          </div>
        ))}
        {stuck ? <span className="text-xs font-bold text-amber-300">Everyone passed — the dealer must bid</span> : <button type="button" onClick={() => onMove({ bid: 'pass' })} className={`${btn} border border-white/15 bg-white/10 hover:bg-white/20`}>Pass</button>}
      </div>
    );
  } else if (myTurn && game === 'bidwhist' && t.phase === 'kitty') {
    const needTrump = t.bid?.mode !== 'no';
    controls = (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-400/30 bg-black/45 p-3 backdrop-blur-md" data-testid="kitty-row">
        <p className="text-sm text-amber-100">You won the bid (<b>{t.bid.n} {t.bid.mode === 'up' ? 'uptown' : t.bid.mode === 'down' ? 'downtown' : 'no trump'}</b>). Pick 6 cards to lay away{needTrump ? ' and name trump' : ''}. ({picked.length}/6)</p>
        {needTrump && <div className="flex gap-1.5">{SUITS.map(s => <button key={s} type="button" onClick={() => setTrumpPick(s)} className={`${btn} ${trumpPick === s ? 'bg-amber-400 text-slate-950' : 'border border-white/15 bg-white/10'}`}>{SUIT_GLYPH[s]}</button>)}</div>}
        <button type="button" disabled={picked.length !== 6 || (needTrump && !trumpPick)} onClick={() => { onMove({ discard: picked, trump: needTrump ? trumpPick : null }); setPicked([]); setTrumpPick(''); }} className={`${btn} bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 disabled:opacity-40`}>Lay away</button>
      </div>
    );
  }

  const clickCard = (c: string) => {
    if (!myTurn) return;
    if (t.phase === 'play' && legal.includes(c)) onMove({ play: c });
    else if (game === 'euchre' && t.phase === 'discard') onMove({ discard: c });
    else if (game === 'bidwhist' && t.phase === 'kitty') setPicked(p => (p.includes(c) ? p.filter(x => x !== c) : p.length < 6 ? [...p, c] : p));
  };
  const clickable = (c: string) => myTurn && ((t.phase === 'play' && legal.includes(c)) || (game === 'euchre' && t.phase === 'discard') || (game === 'bidwhist' && t.phase === 'kitty'));
  const target = game === 'spades' ? SP.TARGET : game === 'euchre' ? EU.TARGET : BW.TARGET;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400/25 bg-black/45 px-4 py-2.5 text-sm shadow-lg backdrop-blur-md">
        <span className="flex items-center gap-2">
          <span className="rounded-lg bg-emerald-500/15 px-2.5 py-0.5 text-emerald-200">Us <b className="text-emerald-300">{t.scores[us]}</b>{game === 'spades' ? <span className="text-xs text-white/55"> · {t.bags[us]}b</span> : null}</span>
          <span className="text-white/35">vs</span>
          <span className="rounded-lg bg-rose-500/15 px-2.5 py-0.5 text-rose-200">Them <b className="text-rose-300">{t.scores[them]}</b>{game === 'spades' ? <span className="text-xs text-white/55"> · {t.bags[them]}b</span> : null}</span>
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-white/65">To {target} · Hand {t.handNo}</span>
        <span className="rounded-full border border-amber-400/35 bg-amber-500/15 px-3 py-0.5 text-xs font-bold text-amber-200">Trump: {game === 'spades' ? '♠ Spades' : trumpText}</span>
      </div>

      {/* Grand Parlor oval card table with padded walnut rail + inlaid brass ring + overhead lamp glow */}
      <div className="mx-auto max-w-2xl rounded-[54px] border-[8px] border-[#3d2112] bg-[radial-gradient(ellipse_at_center,#147052_0%,#0b4d37_65%,#062c20_100%)] p-1.5 shadow-[0_28px_70px_rgba(0,0,0,0.72),inset_0_0_50px_rgba(0,0,0,0.45)]">
        <div className="relative h-[320px] rounded-[44px] border border-amber-300/25 sm:h-[360px]" data-testid="card-table">
          <Spot p={(you + 2) % 4} cls="left-1/2 top-3 -translate-x-1/2" />
          <Spot p={(you + 1) % 4} cls="left-3 top-1/2 -translate-y-1/2" />
          <Spot p={(you + 3) % 4} cls="right-3 top-1/2 -translate-y-1/2" />
          <Spot p={you} cls="bottom-3 left-1/2 -translate-x-1/2" />
          {game === 'euchre' && (t.phase === 'call1' || t.phase === 'call2') && !myTurn && (
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2xl bg-black/35 px-3 py-2 backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Upcard</div>
              <Card c={t.upcard} small />
            </div>
          )}
          {t.last && !t.trick.length && t.phase === 'play' && (
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-sm">
              <span className="text-[11px] font-semibold text-amber-200">Last trick · {name(t.lastWinner)}</span>
              <div className="flex gap-1">{(t.last as Play[]).map(x => <Card key={x.c} c={x.c} small />)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 min-h-[44px]">{controls}</div>
      <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md sm:gap-2" data-testid="hand">
        {hand.map(c => <Card key={c} c={c} raised={picked.includes(c)} dim={myTurn && t.phase === 'play' && !legal.includes(c)} onClick={clickable(c) ? () => clickCard(c) : undefined} />)}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/60" data-testid="log">
        {(t.log as string[]).slice(-5).map((l, i) => <span key={i}>{logLine(l)}</span>)}
      </div>
      {!myTurn && <p className="mt-2 text-center text-sm font-medium text-amber-100/65">Waiting for {name(t.turn)}…</p>}
    </div>
  );
}
