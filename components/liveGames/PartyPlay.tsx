// Play screen for Brain Rush, Crowd Says and Impostor Night — the same component on the host's screen, in the
// stream overlay (compact), in a feed card and full screen. Answers are locked in once per round.
import React, { useState } from 'react';
import { Brain, Check, Loader2, Send, Trophy, Users, UserSearch, BarChart3 } from 'lucide-react';
import { usePartyGame } from './usePartyGame';
import { Scoreboard } from './SketchRushPlay';
import { isGuest } from '../../services/liveGames/client';
import { PARTY_TITLES, type PartyKind } from '../../services/liveGames/party';

const THEME: Record<PartyKind, { from: string; icon: React.ReactNode; chip: string }> = {
  trivia: { from: 'from-[#0d3b66] via-[#132a52] to-[#0b1630]', icon: <Brain size={12} />, chip: 'from-sky-500 to-indigo-600' },
  crowd: { from: 'from-[#5a2d0c] via-[#3d1f12] to-[#1d1022]', icon: <BarChart3 size={12} />, chip: 'from-amber-500 to-orange-600' },
  impostor: { from: 'from-[#1b2b1f] via-[#14201c] to-[#0b1214]', icon: <UserSearch size={12} />, chip: 'from-emerald-500 to-teal-700' },
};
const LETTERS = ['A', 'B', 'C', 'D'];
const OPT_COLORS = ['bg-rose-600', 'bg-sky-600', 'bg-amber-500', 'bg-emerald-600'];

export default function PartyPlay({ gid, compact = false, onOpenFull }: { gid: string; compact?: boolean; onOpenFull?: () => void }) {
  const L = usePartyGame(gid);
  const { game, mine, me, secondsLeft } = L;
  const [text, setText] = useState('');
  const [nick, setNick] = useState('');

  if (L.missing) return <Box kind="trivia" compact={compact}><p className="p-6 text-center text-sm text-white/70">This game has closed.</p></Box>;
  if (!game) return <Box kind="trivia" compact={compact}><div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-white/60" /></div></Box>;
  const k = game.kind;
  const open = game.status === 'answer';
  const answered = mine.choice !== undefined || mine.text !== undefined;
  const submitText = (e: React.FormEvent) => { e.preventDefault(); const t = text.trim(); if (t) { void L.answer({ text: t }); setText(''); } };

  return (
    <Box kind={k} compact={compact}>
      <div className="flex items-center gap-2 px-3 pt-3">
        <span className={`flex items-center gap-1 rounded-full bg-gradient-to-r ${THEME[k].chip} px-2.5 py-1 text-[11px] font-black uppercase tracking-wide`}>{THEME[k].icon} {PARTY_TITLES[k]}</span>
        {game.status !== 'ended' && game.status !== 'lobby' && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live</span>}
        <span className="ml-auto flex items-center gap-1 text-xs text-white/70"><Users size={13} />{game.players}</span>
        {game.round > 0 && <span className="text-xs text-white/70">{game.round}/{game.settings.rounds}</span>}
        {secondsLeft > 0 && game.status !== 'reveal' && <span className={`min-w-[2.6rem] rounded-full px-2 py-0.5 text-center text-sm font-black tabular-nums ${secondsLeft <= 5 ? 'animate-pulse bg-red-500' : 'bg-white/15'}`}>{secondsLeft}s</span>}
      </div>

      <div className={`grid gap-3 p-3 ${compact ? '' : 'md:grid-cols-[1fr_17rem]'}`}>
        <div className="min-w-0 space-y-3">
          {game.status === 'lobby' && <Panel><div className="text-lg font-black">Waiting for {game.hostName} to start</div><div className="text-sm text-white/60">{game.players} joined so far</div></Panel>}

          {/* the prompt */}
          {game.status !== 'lobby' && game.status !== 'ended' && (
            <Panel>
              {k === 'impostor' ? (
                mine.role === 'impostor'
                  ? <><div className="text-xs font-black uppercase tracking-widest text-rose-300">You are the impostor</div><div className="mt-1 text-sm text-white/80">Category: <b>{game.prompt}</b>. Blend in!</div></>
                  : mine.word
                    ? <><div className="text-xs font-black uppercase tracking-widest text-emerald-300">Secret word</div><div className="mt-1 text-2xl font-black">{mine.word}</div><div className="text-xs text-white/60">Category: {game.prompt} · someone here doesn’t know it</div></>
                    : <div className="text-sm text-white/70">Category: <b>{game.prompt}</b></div>
              ) : <div className={`font-black ${compact ? 'text-lg' : 'text-2xl'}`}>{game.prompt}</div>}
              {open && <div className="mt-1 text-xs text-white/50">{game.answered} answered</div>}
              {game.status === 'vote' && <div className="mt-1 text-xs text-white/50">{game.answered} voted · who’s faking it?</div>}
            </Panel>
          )}

          {/* trivia options */}
          {k === 'trivia' && game.options.length > 0 && game.status !== 'ended' && game.status !== 'lobby' && (
            <div className="grid grid-cols-2 gap-2">
              {game.options.map((o, i) => {
                const correct = game.status === 'reveal' && game.reveal?.correct === i;
                const picked = mine.choice === i;
                const dim = game.status === 'reveal' ? !correct : answered && !picked;
                return (
                  <button key={i} disabled={!open || answered} onClick={() => L.answer({ choice: i })}
                    className={`relative flex items-center gap-2 rounded-xl px-3 py-3 text-left font-bold transition ${OPT_COLORS[i]} ${dim ? 'opacity-35' : ''} ${picked ? 'ring-4 ring-white' : ''} ${open && !answered ? 'active:scale-[0.98]' : ''}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black/25 text-xs">{LETTERS[i]}</span>
                    <span className="min-w-0 flex-1">{o}</span>
                    {correct && <Check size={18} />}
                    {game.status === 'reveal' && game.reveal?.counts && <span className="text-xs opacity-80">{game.reveal.counts[i] ?? 0}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* crowd / impostor text answer */}
          {(k === 'crowd' || k === 'impostor') && open && (answered
            ? <Panel><div className="text-sm">Your {k === 'impostor' ? 'clue' : 'answer'}: <b>{mine.text}</b> — locked in</div></Panel>
            : <form onSubmit={submitText} className="flex gap-2">
                <input value={text} onChange={e => setText(e.target.value)} maxLength={k === 'impostor' ? 24 : 40} autoComplete="off" enterKeyHint="send"
                  placeholder={k === 'impostor' ? 'One-word clue…' : 'What would most people say?'} aria-label="Your answer"
                  className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-base font-semibold text-neutral-900 outline-none ring-white/40 focus:ring-4" />
                <button disabled={!text.trim()} className="flex items-center gap-1 rounded-xl bg-white/20 px-4 font-bold disabled:opacity-50"><Send size={16} />Lock in</button>
              </form>)}

          {/* impostor vote */}
          {k === 'impostor' && game.status === 'vote' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {game.clues.map(c => (
                <button key={c.uid} disabled={!!mine.target || c.uid === L.uid} onClick={() => L.vote(c.uid)}
                  className={`rounded-xl bg-white/10 px-3 py-2 text-left ring-1 ring-white/10 transition hover:bg-white/15 disabled:cursor-default ${mine.target === c.uid ? 'ring-4 ring-rose-400' : ''} ${mine.target && mine.target !== c.uid ? 'opacity-50' : ''}`}>
                  <div className="truncate text-[11px] text-white/60">{c.name}{c.uid === L.uid ? ' (you)' : ''}</div>
                  <div className="truncate font-black">“{c.text}”</div>
                </button>
              ))}
            </div>
          )}

          {/* reveals */}
          {game.status === 'reveal' && k === 'crowd' && game.reveal?.board && (
            <ol className="space-y-1.5">
              {game.reveal.board.map((b, i) => {
                const top = game.reveal!.board![0].count;
                return (
                  <li key={b.text} className="relative overflow-hidden rounded-xl bg-white/10 px-3 py-2">
                    <div className="absolute inset-y-0 left-0 bg-amber-500/40" style={{ width: `${(b.count / top) * 100}%` }} />
                    <div className="relative flex items-center gap-2 font-bold"><span className="w-5 text-white/60">{i + 1}</span><span className="flex-1 capitalize">{b.text}</span><span>{b.count}</span></div>
                  </li>
                );
              })}
              {!game.reveal.board.length && <Panel>Nobody answered this one.</Panel>}
            </ol>
          )}
          {game.status === 'reveal' && k === 'impostor' && game.reveal && (
            <Panel>
              <div className={`text-xl font-black ${game.reveal.caught ? 'text-emerald-300' : 'text-rose-300'}`}>{game.reveal.caught ? 'Caught!' : 'The impostor got away!'}</div>
              <div className="mt-1 text-sm">Impostor: <b>{game.reveal.impostors?.map(i => i.name).join(', ')}</b> · the word was <b>{game.reveal.word}</b></div>
              {!!game.reveal.votes?.length && <div className="mt-2 text-xs text-white/60">Votes: {game.reveal.votes.map(v => `${v.name} ${v.votes}`).join(' · ')}</div>}
            </Panel>
          )}
          {game.status === 'reveal' && me && me.solvedRound === game.round && me.lastPoints > 0 && <div className="rounded-xl bg-emerald-500 px-3 py-2 text-center font-black">+{me.lastPoints} points!</div>}

          {game.status === 'ended' && (
            <Panel><Trophy className="mx-auto mb-1 text-amber-300" size={30} /><div className="text-center text-xl font-black">{game.top[0] ? `${game.top[0].name} wins!` : 'Game over'}</div>{game.top[0] && <div className="text-center text-sm">{game.top[0].score} points</div>}</Panel>
          )}

          {L.note && <div className={`rounded-lg px-3 py-1.5 text-center text-sm font-bold ${L.note.tone === 'ok' ? 'bg-white/15' : 'bg-red-600'}`}>{L.note.text}</div>}
        </div>

        {!compact && (
          <aside className="flex min-h-0 flex-col gap-3">
            <Scoreboard game={game} meUid={L.uid} />
            <div className="max-h-60 min-h-[6rem] overflow-y-auto rounded-xl bg-black/25 p-2 text-sm">
              {L.feed.slice(-14).map((f, i) => <div key={`${f.at}-${i}`} className={f.kind === 'system' ? 'font-semibold text-amber-200' : 'text-white/80'}>{f.text}</div>)}
            </div>
          </aside>
        )}
      </div>

      <div className="px-3 pb-3">
        {isGuest() && me && me.name.startsWith('Guest ') && game.status !== 'ended' && (
          <form className="mb-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (nick.trim()) void L.join(nick.trim()); }}>
            <input value={nick} onChange={e => setNick(e.target.value)} maxLength={24} placeholder="Pick a nickname (optional)" className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40" />
            <button className="rounded-xl bg-white/15 px-3 text-sm font-semibold">Save</button>
          </form>
        )}
        {me && me.score > 0 && <div className="text-center text-xs text-white/60">Your score: <b className="text-white">{me.score}</b>{isGuest() ? ' · sign up to keep it on your gamer card' : ''}</div>}
        {compact && onOpenFull && <button onClick={onOpenFull} className="mt-2 w-full rounded-xl bg-white/10 py-2 text-sm font-semibold">Open full screen</button>}
      </div>
    </Box>
  );
}

function Box({ kind, compact, children }: { kind: PartyKind; compact: boolean; children: React.ReactNode }) {
  return <div className={`overflow-hidden text-white ${compact ? 'rounded-2xl' : 'rounded-3xl'} bg-gradient-to-br ${THEME[kind].from} shadow-xl ring-1 ring-white/10`}>{children}</div>;
}
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-black/25 p-3">{children}</div>;
}
