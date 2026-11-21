// The card table for Spades, Euchre and Bid Whist. You sit at the bottom, your CPU partner across, the other
// team left and right. Only legal cards light up; bids and calls show only the options the rules accept.
import React, { useMemo, useState } from 'react';
import { legalPlays, sortHand, isJoker, SUIT_GLYPH, SUIT_NAME, SUITS, type Play, type TrickRules } from '../../../services/gamerNet/games/cards';
import * as SP from '../../../services/gamerNet/games/spades';
import * as EU from '../../../services/gamerNet/games/euchre';
import * as BW from '../../../services/gamerNet/games/bidWhist';
import type { BoardProps } from './TableGame';

const RED = (c: string) => c[1] === 'H' || c[1] === 'D' || c === 'BJ';
const label = (c: string) => (c === 'BJ' ? 'Big ★' : c === 'LJ' ? 'Little ★' : `${c[0] === 'T' ? '10' : c[0]}${SUIT_GLYPH[c[1]]}`);

function Card({ c, onClick, dim, raised, small }: { c: string; onClick?(): void; dim?: boolean; raised?: boolean; small?: boolean }) {
  return (
    <button type="button" data-card={c} onClick={onClick} disabled={!onClick}
      className={`flex flex-col items-start justify-between rounded-lg border border-slate-300 bg-white px-1.5 py-1 font-semibold shadow transition ${small ? 'h-14 w-10 text-sm' : 'h-20 w-14 text-base sm:h-24 sm:w-16 sm:text-lg'} ${RED(c) ? 'text-rose-600' : 'text-slate-900'} ${dim ? 'opacity-35' : ''} ${raised ? '-translate-y-3 ring-4 ring-cyan-400' : onClick ? 'hover:-translate-y-1' : ''}`}>
      <span>{label(c)}</span>
      <span className="self-end text-2xl leading-none">{isJoker(c) ? '★' : SUIT_GLYPH[c[1]]}</span>
    </button>
  );
}

const Back = ({ n }: { n: number }) => (
  <div className="flex items-center gap-1 text-xs text-white/60"><span className="inline-block h-8 w-6 rounded bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow" />× {n}</div>
);

function rulesOf(game: string, t: any): TrickRules {
  if (game === 'spades') return SP.R;
  if (game === 'euchre') return EU.rulesFor(t.trump);
  return BW.rulesFor(t.bid?.mode ?? 'up', t.trump);
}

const btn = 'rounded-lg px-3 py-1.5 text-sm font-semibold';

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
    return (
      <div className={`absolute flex flex-col items-center gap-1 ${cls}`}>
        <span className={`rounded-full px-2 py-0.5 text-xs ${t.turn === p ? 'bg-emerald-500/30 text-emerald-200' : 'bg-black/30 text-white/70'}`}>{name(p)}{p >= 2 ? ' · CPU' : ''}{t.dealer === p ? ' · D' : ''}{game === 'bidwhist' && t.bidder === p ? ' · bid' : ''}{game === 'euchre' && t.maker === p ? ' · called' : ''}</span>
        {rel(p) !== 0 && <Back n={t.counts?.[p] ?? 0} />}
        {s.bidText && <span className="text-xs text-amber-200">{s.bidText}{t.phase === 'play' ? ` · ${t.won?.[p] ?? 0} won` : ''}</span>}
        {s.play && <Card c={s.play.c} small />}
      </div>
    );
  };

  // ───────────── phase controls
  let controls: React.ReactNode = null;
  if (myTurn && game === 'spades' && t.phase === 'bid') {
    controls = (
      <div className="flex flex-wrap justify-center gap-1.5" data-testid="bid-row">
        {Array.from({ length: 14 }, (_, n) => <button key={n} type="button" onClick={() => onMove({ bid: n })} className={`${btn} ${n === 0 ? 'bg-fuchsia-500/30' : 'bg-white/10'} hover:bg-white/20`}>{n === 0 ? 'Nil' : n}</button>)}
      </div>
    );
  } else if (myTurn && game === 'euchre' && t.phase === 'call1') {
    controls = (
      <div className="flex items-center justify-center gap-3" data-testid="call-row">
        <span className="text-sm text-white/70">Upcard</span><Card c={t.upcard} small />
        <button type="button" onClick={() => onMove({ call: 'order' })} className={`${btn} bg-cyan-500 text-slate-950`}>{t.dealer === you ? 'Pick it up' : 'Order up'}</button>
        <button type="button" onClick={() => onMove({ call: 'pass' })} className={`${btn} bg-white/10`}>Pass</button>
      </div>
    );
  } else if (myTurn && game === 'euchre' && t.phase === 'call2') {
    controls = (
      <div className="flex flex-wrap items-center justify-center gap-2" data-testid="call-row">
        <span className="text-sm text-white/70">Name trump</span>
        {SUITS.filter(s => s !== t.upcard[1]).map(s => <button key={s} type="button" onClick={() => onMove({ call: s })} className={`${btn} bg-white/10 ${s === 'H' || s === 'D' ? 'text-rose-300' : ''}`}>{SUIT_GLYPH[s]} {SUIT_NAME[s]}</button>)}
        {t.dealer !== you ? <button type="button" onClick={() => onMove({ call: 'pass' })} className={`${btn} bg-white/10`}>Pass</button> : <span className="text-xs text-amber-200">Dealer must call</span>}
      </div>
    );
  } else if (myTurn && game === 'euchre' && t.phase === 'discard') {
    controls = <p className="text-center text-sm text-amber-200">You picked up the {label(t.upcard)}. Tap a card to discard.</p>;
  } else if (myTurn && game === 'bidwhist' && t.phase === 'bid') {
    const bids = (t.bids as any[]).filter(b => b && b !== 'pass');
    const top = bids.reduce((m: number, b: any) => Math.max(m, b.n * 2 + (b.mode === 'no' ? 1 : 0)), 0);
    const stuck = t.dealer === you && !bids.length;
    controls = (
      <div className="flex flex-col items-center gap-2" data-testid="bid-row">
        {(['up', 'down', 'no'] as const).map(mode => (
          <div key={mode} className="flex items-center gap-1.5">
            <span className="w-24 text-right text-xs text-white/60">{mode === 'up' ? 'Uptown' : mode === 'down' ? 'Downtown' : 'No trump'}</span>
            {[3, 4, 5, 6, 7].map(n => { const v = n * 2 + (mode === 'no' ? 1 : 0); return v > top ? <button key={n} type="button" onClick={() => onMove({ bid: { n, mode } })} className={`${btn} bg-white/10 hover:bg-white/20`}>{n}</button> : <span key={n} className="w-9" />; })}
          </div>
        ))}
        {stuck ? <span className="text-xs text-amber-200">Everyone passed — the dealer must bid</span> : <button type="button" onClick={() => onMove({ bid: 'pass' })} className={`${btn} bg-white/10`}>Pass</button>}
      </div>
    );
  } else if (myTurn && game === 'bidwhist' && t.phase === 'kitty') {
    const needTrump = t.bid?.mode !== 'no';
    controls = (
      <div className="flex flex-col items-center gap-2" data-testid="kitty-row">
        <p className="text-sm text-amber-200">You won the bid ({t.bid.n} {t.bid.mode === 'up' ? 'uptown' : t.bid.mode === 'down' ? 'downtown' : 'no trump'}). Pick 6 cards to lay away{needTrump ? ' and name trump' : ''}. ({picked.length}/6)</p>
        {needTrump && <div className="flex gap-1.5">{SUITS.map(s => <button key={s} type="button" onClick={() => setTrumpPick(s)} className={`${btn} ${trumpPick === s ? 'bg-cyan-500 text-slate-950' : 'bg-white/10'}`}>{SUIT_GLYPH[s]}</button>)}</div>}
        <button type="button" disabled={picked.length !== 6 || (needTrump && !trumpPick)} onClick={() => { onMove({ discard: picked, trump: needTrump ? trumpPick : null }); setPicked([]); setTrumpPick(''); }} className={`${btn} bg-cyan-500 text-slate-950 disabled:opacity-40`}>Lay away</button>
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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
        <span>Us <b className="text-emerald-300">{t.scores[us]}</b>{game === 'spades' ? <span className="text-white/50"> · {t.bags[us]} bags</span> : null} — Them <b className="text-rose-300">{t.scores[them]}</b>{game === 'spades' ? <span className="text-white/50"> · {t.bags[them]} bags</span> : null}</span>
        <span className="text-white/60">To {target} · Hand {t.handNo}</span>
        <span>Trump: <b>{game === 'spades' ? '♠ Spades' : trumpText}</b></span>
      </div>
      <div className="relative mx-auto h-[300px] max-w-2xl rounded-[40px] border border-emerald-400/20 bg-emerald-900/40 sm:h-[340px]" data-testid="card-table">
        <Spot p={(you + 2) % 4} cls="left-1/2 top-3 -translate-x-1/2" />
        <Spot p={(you + 1) % 4} cls="left-3 top-1/2 -translate-y-1/2" />
        <Spot p={(you + 3) % 4} cls="right-3 top-1/2 -translate-y-1/2" />
        <Spot p={you} cls="bottom-3 left-1/2 -translate-x-1/2" />
        {game === 'euchre' && (t.phase === 'call1' || t.phase === 'call2') && !myTurn && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"><div className="text-xs text-white/60">Upcard</div><Card c={t.upcard} small /></div>
        )}
        {t.last && !t.trick.length && t.phase === 'play' && (
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
            <span className="text-xs text-white/60">Last trick · {name(t.lastWinner)} won</span>
            <div className="flex gap-1">{(t.last as Play[]).map(x => <Card key={x.c} c={x.c} small />)}</div>
          </div>
        )}
      </div>
      <div className="mt-3 min-h-[44px]">{controls}</div>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:gap-2" data-testid="hand">
        {hand.map(c => <Card key={c} c={c} raised={picked.includes(c)} dim={myTurn && t.phase === 'play' && !legal.includes(c)} onClick={clickable(c) ? () => clickCard(c) : undefined} />)}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/55" data-testid="log">
        {(t.log as string[]).slice(-5).map((l, i) => <span key={i}>{logLine(l)}</span>)}
      </div>
      {!myTurn && <p className="mt-2 text-center text-sm text-white/50">Waiting for {name(t.turn)}…</p>}
    </div>
  );
}
