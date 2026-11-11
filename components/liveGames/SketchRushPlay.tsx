// Sketch Rush — the play screen for everyone in the room. Viewers see the live drawing, the letter hint and the
// clock, and type guesses; whoever holds the pen gets the word, the tools and (between rounds) three words to
// pick from. `compact` is the feed-card version: same game, smaller, one tap to start guessing.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Loader2, Pencil, Send, Sparkles, Trophy, Users } from 'lucide-react';
import SketchBoard, { useStrokeSender } from './SketchBoard';
import { useLiveGame } from './useLiveGame';
import { liveGame, failed, isGuest } from '../../services/liveGames/client';

interface Props { gid: string; compact?: boolean; onOpenFull?: () => void }

export default function SketchRushPlay({ gid, compact = false, onOpenFull }: Props) {
  const L = useLiveGame(gid);
  const { game, strokes, feed, me, secret, isDrawer, solved, secondsLeft } = L;
  const [text, setText] = useState('');
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const send = useStrokeSender(gid, game?.round ?? 0, strokes, isDrawer && game?.status === 'drawing');
  const input = useRef<HTMLInputElement>(null);

  const feedTail = useMemo(() => feed.slice(compact ? -3 : -14), [feed, compact]);
  const feedEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!compact) feedEnd.current?.scrollIntoView({ block: 'nearest' }); }, [feedTail, compact]);

  if (L.missing) return <Shell compact={compact}><p className="p-6 text-center text-sm text-white/70">This game has closed.</p></Shell>;
  if (!game) return <Shell compact={compact}><div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-white/60" /></div></Shell>;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setText('');
    await L.guess(t);
    setBusy(false); input.current?.focus();
  };
  const choose = async (i: number) => {
    setBusy(true);
    const r = await liveGame.choose(gid, i);
    if (!failed(r)) L.setSecret({ word: r.secret.word });
    setBusy(false);
  };

  const urgent = game.status === 'drawing' && secondsLeft <= 10;
  const status =
    game.status === 'lobby' ? `${game.hostName} is setting up — get ready!`
    : game.status === 'choosing' ? (isDrawer ? 'Pick a word to draw' : `${game.drawerName} is picking a word…`)
    : game.status === 'drawing' ? (isDrawer ? 'Draw it! No letters or numbers.' : solved ? 'You got it! Watch the others sweat.' : 'Guess what’s being drawn')
    : game.status === 'reveal' ? `The word was “${game.revealWord}”`
    : 'Game over';

  const lastNote = L.last && Date.now() - L.last.at < 4000 ? L.last : null;

  return (
    <Shell compact={compact}>
      {/* header */}
      <div className="flex items-center gap-2 px-3 pt-3">
        <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500 to-violet-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide">
          <Pencil size={12} /> Sketch Rush
        </span>
        {game.status !== 'ended' && game.status !== 'lobby' && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live</span>}
        <span className="ml-auto flex items-center gap-1 text-xs text-white/70"><Users size={13} />{game.players}</span>
        {game.round > 0 && <span className="text-xs text-white/70">Round {game.round}/{game.settings.rounds}</span>}
        {secondsLeft > 0 && <span className={`min-w-[2.6rem] rounded-full px-2 py-0.5 text-center text-sm font-black tabular-nums ${urgent ? 'animate-pulse bg-red-500' : 'bg-white/15'}`}>{secondsLeft}s</span>}
      </div>

      {/* hint / word */}
      <div className="px-3 pt-2 text-center">
        {isDrawer && secret.word && game.status === 'drawing'
          ? <div className="text-lg font-black tracking-wide text-amber-300">Draw: {secret.word.toUpperCase()}</div>
          : game.status === 'drawing'
            ? <div className="font-mono text-2xl font-black tracking-[0.35em] text-white" aria-label={`Hint: ${game.wordLen} letters`}>{game.hint}</div>
            : <div className="text-sm font-semibold text-white/80">{status}</div>}
        {game.status === 'drawing' && <div className="text-[11px] text-white/55">{status}{!isDrawer ? ` · ${game.wordLen} letters` : ''}{game.solvedCount ? ` · ${game.solvedCount} got it` : ''}</div>}
      </div>

      <div className={`grid gap-3 p-3 ${compact ? '' : 'md:grid-cols-[1fr_17rem]'}`}>
        <div>
          <SketchBoard
            batches={strokes}
            draw={isDrawer && game.status === 'drawing' ? { send, roundKey: `${game.id}:${game.round}` } : undefined}
            overlay={boardOverlay()}
          />
        </div>

        {!compact && (
          <aside className="flex min-h-0 flex-col gap-3">
            <Scoreboard game={game} meUid={L.uid} />
            <div className="flex max-h-72 min-h-[8rem] flex-1 flex-col overflow-y-auto rounded-xl bg-black/25 p-2 text-sm">
              {feedTail.map((f, i) => <FeedLine key={`${f.at}-${i}`} f={f} />)}
              <div ref={feedEnd} />
            </div>
          </aside>
        )}
      </div>

      {compact && feedTail.length > 0 && (
        <div className="space-y-0.5 px-3 text-xs">{feedTail.map((f, i) => <FeedLine key={`${f.at}-${i}`} f={f} />)}</div>
      )}

      {/* input */}
      <div className="p-3 pt-2">
        {isGuest() && me && me.name.startsWith('Guest ') && game.status !== 'ended' && (
          <form className="mb-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (nick.trim()) void L.join(nick.trim()); }}>
            <input value={nick} onChange={e => setNick(e.target.value)} maxLength={24} placeholder="Pick a nickname (optional)" className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40" />
            <button className="rounded-xl bg-white/15 px-3 text-sm font-semibold">Save</button>
          </form>
        )}
        {game.status === 'drawing' && !isDrawer && !solved && (
          <form onSubmit={submit} className="flex gap-2">
            <input
              ref={input} value={text} onChange={e => setText(e.target.value)} maxLength={40} enterKeyHint="send" autoComplete="off"
              placeholder="Type your guess…" aria-label="Your guess"
              className="flex-1 rounded-xl bg-white px-3 py-2.5 text-base font-semibold text-neutral-900 outline-none ring-violet-400 focus:ring-4"
            />
            <button disabled={busy || !text.trim()} className="flex items-center gap-1 rounded-xl bg-violet-600 px-4 font-bold disabled:opacity-50"><Send size={16} />Guess</button>
          </form>
        )}
        {lastNote && (
          <div className={`mt-2 rounded-lg px-3 py-1.5 text-center text-sm font-bold ${lastNote.verdict === 'correct' ? 'bg-emerald-500' : lastNote.verdict === 'close' ? 'bg-amber-500 text-black' : lastNote.verdict === 'error' ? 'bg-red-600' : 'bg-white/10 text-white/70'}`}>
            {lastNote.verdict === 'correct' ? `Got it! +${lastNote.points}` : lastNote.verdict === 'close' ? `“${lastNote.text}” is so close!` : lastNote.verdict === 'error' ? lastNote.error : lastNote.verdict === 'closed' ? 'Round’s over — next one soon' : lastNote.verdict === 'already' ? 'You already got this one' : `Not “${lastNote.text}”`}
          </div>
        )}
        {me && me.score > 0 && <div className="mt-2 text-center text-xs text-white/60">Your score: <b className="text-white">{me.score}</b>{isGuest() ? ' · sign up to keep it on your gamer card' : ''}</div>}
        {compact && onOpenFull && <button onClick={onOpenFull} className="mt-2 w-full rounded-xl bg-white/10 py-2 text-sm font-semibold">Open full screen</button>}
      </div>
    </Shell>
  );

  function boardOverlay(): React.ReactNode {
    if (!game) return null;
    if (game.status === 'choosing' && isDrawer && secret.choices?.length) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-violet-950/85 p-4">
          <div className="text-sm font-bold uppercase tracking-wider text-white/80">Choose your word · {secondsLeft}s</div>
          <div className="flex flex-wrap justify-center gap-2">
            {secret.choices.map((w, i) => <button key={w} disabled={busy} onClick={() => choose(i)} className="rounded-xl bg-white px-4 py-2.5 text-lg font-black text-violet-700 shadow-lg transition hover:scale-105">{w}</button>)}
          </div>
        </div>
      );
    }
    if (game.status === 'lobby') return <Center><Sparkles className="mb-1" /> Waiting for {game.hostName} to start</Center>;
    if (game.status === 'choosing') return <Center>{game.drawerName} is choosing a word…</Center>;
    if (game.status === 'reveal') return <Center><div className="text-xs uppercase tracking-widest text-white/70">The word was</div><div className="text-3xl font-black">{game.revealWord}</div></Center>;
    if (game.status === 'ended') {
      const w = game.top[0];
      return <Center><Trophy className="mb-1 text-amber-300" size={30} /><div className="text-xl font-black">{w ? `${w.name} wins!` : 'Game over'}</div>{w && <div className="text-sm">{w.score} points</div>}</Center>;
    }
    return null;
  }
}

function Shell({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return <div className={`overflow-hidden text-white ${compact ? 'rounded-2xl' : 'rounded-3xl'} bg-gradient-to-br from-[#2a1458] via-[#1b1240] to-[#0d1a3a] shadow-xl ring-1 ring-white/10`}>{children}</div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/55 p-4 text-center text-white">{children}</div>;
}
function FeedLine({ f }: { f: { kind: string; name: string; text: string } }) {
  if (f.kind === 'solved') return <div className="rounded px-1 font-bold text-emerald-300">✔ {f.text}</div>;
  if (f.kind === 'system') return <div className="px-1 font-semibold text-amber-200">{f.text}</div>;
  return <div className="truncate px-1 text-white/80"><b className="text-white/60">{f.name}:</b> {f.text}</div>;
}
export function Scoreboard({ game, meUid, max = 8 }: { game: { top: Array<{ uid: string; name: string; score: number }> }; meUid: string | null; max?: number }) {
  if (!game.top.length) return <div className="rounded-xl bg-black/25 p-3 text-center text-xs text-white/50">Scores appear after the first round</div>;
  return (
    <ol className="space-y-1 rounded-xl bg-black/25 p-2">
      {game.top.slice(0, max).map((t, i) => (
        <li key={t.uid} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${t.uid === meUid ? 'bg-violet-600/40' : ''}`}>
          <span className="w-5 text-center font-black text-white/60">{i === 0 ? <Crown size={14} className="inline text-amber-300" /> : i + 1}</span>
          <span className="flex-1 truncate">{t.name}</span>
          <b className="tabular-nums">{t.score}</b>
        </li>
      ))}
    </ol>
  );
}
