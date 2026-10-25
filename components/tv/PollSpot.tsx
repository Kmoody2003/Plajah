import React, { useEffect, useMemo, useState } from 'react';
import { Vote, Trophy } from 'lucide-react';
import { auth } from '../../services/backendService';
import { useLivePolls } from '../../services/livePollsClient';
import { countsToArray, percentages, totalVotes, type LivePoll } from '../../services/fast/voteSchedule';

/**
 * PollSpot — the interactive platform spot that runs inside a FAST ad break.
 *
 *   mode 'vote'      a compact card over the break: the channel's open polls take turns (every ~10s),
 *                    each with tappable choices and live percentages that refresh while it is on screen.
 *   mode 'announce'  the full-screen results card for the break before a Fan Vote slot: the locked
 *                    winner, how the vote went, and when it airs. (Its pollId is the slot's ballot.)
 */

const ORANGE = '#FF8C00';
const ROTATE_MS = 10_000;

interface Props {
  room: string;
  mode: 'vote' | 'announce';
  /** announce: the ballot whose result is being announced. */
  pollId?: string;
  accent?: string;
}

const clock = (ms?: number, tz = 'America/New_York') =>
  ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }) : '';

const Bars: React.FC<{ poll: LivePoll; myVote?: number; canVote: boolean; onVote?: (i: number) => void; winnerIdx?: number; accent: string; big?: boolean }> = ({ poll, myVote, canVote, onVote, winnerIdx, accent, big }) => {
  const counts = countsToArray(poll.counts, poll.options.length);
  const pct = percentages(counts);
  return (
    <div className="space-y-1.5">
      {poll.options.map((o, i) => {
        const isWin = winnerIdx === i;
        const Tag: any = onVote && canVote ? 'button' : 'div';
        return (
          <Tag
            key={i}
            {...(onVote && canVote ? { type: 'button', onClick: () => onVote(i) } : {})}
            className={`relative w-full overflow-hidden rounded-lg border text-left ${big ? 'px-4 py-2.5' : 'px-2.5 py-1.5'} ${isWin ? 'border-amber-300/70' : myVote === i ? 'border-white/60' : 'border-white/15'} ${onVote && canVote ? 'hover:border-white/50 cursor-pointer' : ''}`}
          >
            <span className="absolute inset-y-0 left-0 transition-all duration-700" style={{ width: `${pct[i]}%`, background: isWin ? 'rgba(252,211,77,0.35)' : `${accent}40` }} />
            <span className={`relative flex items-center justify-between gap-3 font-bold text-white ${big ? 'text-base' : 'text-[11px]'}`}>
              <span className="truncate">{isWin ? '🏆 ' : myVote === i ? '✓ ' : ''}{o.label}</span>
              <span className="shrink-0 tabular-nums text-white/80">{pct[i]}%</span>
            </span>
          </Tag>
        );
      })}
    </div>
  );
};

const PollSpot: React.FC<Props> = ({ room, mode, pollId, accent = ORANGE }) => {
  const live = useLivePolls(room, { active: true, intervalMs: mode === 'announce' ? 4000 : 6000 });
  const [turn, setTurn] = useState(0);
  const user = auth.currentUser;
  const canVote = !!user && !user.isAnonymous;
  const [err, setErr] = useState<string | null>(null);

  const open = useMemo(
    () => live.polls.filter(p => p.status === 'OPEN' && (!p.closesAtMs || p.closesAtMs > Date.now() + live.skewMs))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'SCHEDULE' ? -1 : 1)),
    [live.polls, live.skewMs],
  );

  useEffect(() => {
    if (mode !== 'vote' || open.length < 2) return;
    const t = setInterval(() => setTurn(n => n + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [mode, open.length]);

  if (mode === 'announce') {
    const poll = live.polls.find(p => p.id === pollId);
    if (!poll) return null;
    const locked = poll.status === 'LOCKED' && poll.winnerIdx != null;
    const win = locked ? poll.options[poll.winnerIdx!] : undefined;
    const total = totalVotes(poll.counts, poll.options.length);
    return (
      <div className="absolute inset-0 z-10 grid place-items-center bg-black/90 backdrop-blur-sm px-[6%]">
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} style={{ color: accent }} />
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-white/60">Fan Vote · {locked ? 'The people have spoken' : 'Final tally'}</span>
          </div>
          <h2 className="text-2xl md:text-4xl font-black text-white leading-tight">
            {win ? <>Tonight at {clock(poll.schedule?.airAtMs, poll.schedule?.timezone)}: <span style={{ color: accent }}>{win.label}</span></> : poll.question}
          </h2>
          <p className="text-sm text-white/60 mt-2 mb-5">{total.toLocaleString()} vote{total === 1 ? '' : 's'}{poll.winnerReason === 'NO_VOTES_RANDOM' ? ' · no votes were cast, so the pick was random' : ''}{poll.winnerReason === 'TIE_FIRST_TO_REACH' ? ' · a tie, won by the first to reach it' : ''}{poll.funding?.unlocked ? ' · airing commercial-free, thanks to fan pledges' : ''}</p>
          <Bars poll={poll} winnerIdx={locked ? poll.winnerIdx : undefined} canVote={false} accent={accent} big />
          <p className="text-[11px] text-white/45 mt-4">Vote for tomorrow night's movie in the Fan Vote strip below the player.</p>
        </div>
      </div>
    );
  }

  const poll = open.length ? open[turn % open.length] : null;
  if (!poll) return null;
  const my = live.myVotes[poll.id];
  const mins = poll.closesAtMs ? Math.max(0, Math.round((poll.closesAtMs - (Date.now() + live.skewMs)) / 60000)) : 0;
  return (
    <div className="absolute z-10 right-4 bottom-6 w-[min(22rem,46%)] rounded-2xl border border-white/15 bg-black/75 backdrop-blur p-3 shadow-2xl">
      <div className="flex items-center gap-2 mb-1.5">
        <Vote size={13} style={{ color: accent }} />
        <span className="text-[9px] font-black uppercase tracking-[0.35em] text-white/55">Vote now{poll.closesAtMs ? ` · closes in ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`}` : ''}</span>
      </div>
      <p className="text-[13px] font-black text-white leading-snug mb-2">{poll.question}</p>
      <Bars poll={poll} myVote={my} canVote={canVote} accent={accent} onVote={async i => { setErr(null); const e = await live.vote(poll.id, i); if (e) setErr(e); }} />
      <p className="text-[10px] text-white/50 mt-1.5">{err || (canVote ? (my != null ? 'Vote recorded — tap another to change it.' : 'Tap a choice to vote.') : 'Sign in to Plajah to vote.')}</p>
    </div>
  );
};

export default PollSpot;
