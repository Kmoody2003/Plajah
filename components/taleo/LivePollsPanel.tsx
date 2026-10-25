// LivePollsPanel — real, shared fan polls (server-mediated; see routes/fastVote.ts).
// Results are always visible: every choice shows its share and its vote count, your pick is marked,
// and a schedule ballot shows when voting closes and, once locked, what airs and why it won.

import React, { useEffect, useState } from 'react';
import { BarChart3, Check, Clock, HeartHandshake, Lock, Trophy, Tv } from 'lucide-react';
import { countsToArray, percentages, type LivePoll } from '../../services/fast/voteSchedule';

const WINNER_REASON: Record<string, string> = {
  MOST_VOTES: 'Most votes',
  TIE_FIRST_TO_REACH: 'Tie — the choice that reached it first wins',
  NO_VOTES_RANDOM: 'No votes came in, so it was picked at random',
};

function timeIn(tz: string | undefined, ms: number): string {
  try { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }); } catch { return ''; }
}
function tzAbbrev(tz: string, ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
}
function untilText(ms: number): string {
  if (ms <= 0) return 'now';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
function runtime(sec?: number): string {
  if (!sec) return '';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export const LivePollsPanel: React.FC<{
  polls: LivePoll[];
  myVotes: Record<string, number>;
  loading: boolean;
  error: string | null;
  skewMs: number;
  canVote: boolean;
  onVote: (pollId: string, choice: number) => Promise<string | null>;
  /** Pledge toward a slot's commercial-free goal (opens Checkout). Omit to hide pledging. */
  onPledge?: (pollId: string, amountCents: number) => Promise<string | null>;
  /** Shown once after returning from Checkout. */
  notice?: string | null;
}> = ({ polls, myVotes, loading, error, skewMs, canVote, onVote, onPledge, notice }) => {
  const [pledging, setPledging] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() + skewMs);
  const [voteError, setVoteError] = useState<string | null>(null);
  useEffect(() => {
    setNow(Date.now() + skewMs);
    const t = setInterval(() => setNow(Date.now() + skewMs), 15_000);
    return () => clearInterval(t);
  }, [skewMs]);

  // Tonight's open ballot first, then a just-locked one, then the community polls.
  const order = (p: LivePoll) => (p.kind === 'SCHEDULE' ? (p.status === 'OPEN' ? 0 : 1) : 2);
  const sorted = polls.slice().sort((a, b) => order(a) - order(b) || (a.schedule?.airAtMs ?? 0) - (b.schedule?.airAtMs ?? 0) || a.createdAt - b.createdAt);

  if (loading && !polls.length) return <p className="text-center text-xs text-white/45 py-10">Loading polls…</p>;
  if (error && !polls.length) return <p className="text-center text-xs text-rose-300 py-10">{error}</p>;
  if (!sorted.length) return <p className="text-center text-xs text-white/45 py-10">No polls right now.</p>;

  return (
    <div className="space-y-4">
      {notice && (
        <div role="status" className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-[12px] text-emerald-100 font-semibold">{notice}</div>
      )}
      {voteError && (
        <div role="alert" className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[12px] text-rose-200 font-semibold">{voteError}</div>
      )}
      {!canVote && (
        <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-[12px] text-white/70">
          Sign in to vote. Everyone can see the results.
        </div>
      )}
      {sorted.map(poll => {
        const n = poll.options.length;
        const counts = countsToArray(poll.counts, n);
        const pct = percentages(counts);
        const total = counts.reduce((a, b) => a + b, 0);
        const top = Math.max(0, ...counts);
        const mine = myVotes[poll.id];
        const sched = poll.schedule;
        const locked = poll.status === 'LOCKED' || (!!poll.closesAtMs && now >= poll.closesAtMs);
        const decided = poll.status === 'LOCKED' && poll.winnerIdx != null;
        const tz = sched?.timezone;
        return (
          <section key={poll.id} className={`rounded-2xl border p-4 space-y-3 ${sched ? 'bg-gradient-to-b from-orange-500/[0.08] to-white/[0.02] border-orange-500/30' : 'bg-white/[0.03] border-white/10'}`}>
            <header className="space-y-1">
              {sched ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-black text-[10px] font-black uppercase tracking-wider">
                    <Tv size={11} /> {timeIn(tz, sched.airAtMs)} {tzAbbrev(tz!, sched.airAtMs)} · Ch 8.2
                  </span>
                  {locked
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[10px] font-black uppercase tracking-wider"><Lock size={10} /> Voting closed</span>
                    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-[10px] font-black uppercase tracking-wider"><Clock size={10} /> Closes in {untilText(sched.closesAtMs - now)}</span>}
                </div>
              ) : (
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">{poll.subtitle}</p>
              )}
              <h4 className="text-[15px] font-black leading-snug text-white">{poll.question}</h4>
              {sched && !locked && (
                <p className="text-[11px] text-white/55">
                  Voting closes at {timeIn(tz, sched.closesAtMs)} {tzAbbrev(tz!, sched.closesAtMs)}
                  {timeIn(undefined, sched.closesAtMs) !== timeIn(tz, sched.closesAtMs) ? ` (${timeIn(undefined, sched.closesAtMs)} your time)` : ''}.
                  The winner airs on {poll.subtitle?.split('·')[0]?.trim() || 'the channel'}.
                </p>
              )}
              {decided && (
                <p className="text-[12px] text-white/80 flex items-start gap-1.5">
                  <Trophy size={14} className="text-amber-300 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-black text-amber-200">{poll.options[poll.winnerIdx!]?.programme?.title || poll.options[poll.winnerIdx!]?.label}</span>
                    {sched ? ` ${now >= sched.airAtMs ? 'aired' : 'airs'} at ${timeIn(tz, sched.airAtMs)} ${tzAbbrev(tz!, sched.airAtMs)}.` : ' won.'}
                    <span className="block text-[11px] text-white/50">{WINNER_REASON[poll.winnerReason || ''] || ''}</span>
                  </span>
                </p>
              )}
              {locked && !decided && <p className="text-[11px] text-white/55">Counting the votes…</p>}
            </header>

            <div className="space-y-2" role="radiogroup" aria-label={poll.question}>
              {poll.options.map((opt, i) => {
                const isMine = mine === i;
                const isWinner = decided && poll.winnerIdx === i;
                const isLeader = !decided && total > 0 && counts[i] === top;
                const prog = opt.programme;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={isMine}
                    disabled={!canVote || locked}
                    onClick={async () => { setVoteError(null); const err = await onVote(poll.id, i); if (err) setVoteError(err); }}
                    className={`w-full relative overflow-hidden rounded-xl border text-left transition-all disabled:cursor-default ${
                      isWinner ? 'border-amber-300 bg-amber-400/10'
                        : isMine ? 'border-orange-400 bg-orange-500/10'
                          : 'border-white/10 bg-black/40 enabled:hover:border-white/30'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 transition-all duration-500 ${isWinner ? 'bg-amber-400/25' : isMine ? 'bg-orange-500/25' : 'bg-white/[0.08]'}`}
                      style={{ width: `${pct[i]}%` }}
                    />
                    <span className="relative flex items-center gap-3 p-2.5">
                      {prog?.thumbnail
                        ? <img src={prog.thumbnail} alt="" referrerPolicy="no-referrer" className="w-9 h-[54px] rounded-md object-cover shrink-0 border border-white/10" />
                        : opt.emoji ? <span className="text-lg w-7 text-center shrink-0">{opt.emoji}</span> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold leading-snug text-white">{prog?.title || opt.label}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-white/50">
                          {prog?.year && <span>{prog.year}</span>}
                          {prog?.durationSec ? <span>{runtime(prog.durationSec)}</span> : null}
                          {prog?.commercialFree && <span className="text-emerald-300">Commercial-free</span>}
                          {isMine && <span className="inline-flex items-center gap-0.5 font-black text-orange-300"><Check size={11} /> Your pick</span>}
                          {isLeader && !isMine && <span className="font-black text-white/70">Leading</span>}
                          {isWinner && <span className="inline-flex items-center gap-0.5 font-black text-amber-200"><Trophy size={11} /> Winner</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[15px] font-black tabular-nums text-white">{pct[i]}%</span>
                        <span className="block text-[10px] tabular-nums text-white/50">{counts[i]} {counts[i] === 1 ? 'vote' : 'votes'}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-white/45 leading-relaxed">
              <BarChart3 size={12} className="inline -mt-0.5 mr-1" />
              {total ? `${total} ${total === 1 ? 'vote' : 'votes'}` : locked ? 'No votes' : 'No votes yet — be the first'}
              {!locked && mine != null && ' · tap another choice to change your vote'}
            </p>

            {poll.funding && poll.funding.goalCents > 0 && poll.ownerUid && (() => {
              const f = poll.funding!;
              const pledged = Math.min(f.pledgedCents || 0, f.goalCents);
              const left = Math.max(0, f.goalCents - (f.pledgedCents || 0));
              const pctFunded = Math.round((pledged / f.goalCents) * 100);
              const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
              const closeAt = sched ? `${timeIn(tz, sched.closesAtMs)} ${tzAbbrev(tz!, sched.closesAtMs)}` : 'voting closes';
              const go = async (cents: number) => {
                if (!onPledge) return;
                setVoteError(null); setPledging(poll.id);
                const err = await onPledge(poll.id, cents);
                if (err) { setVoteError(err); setPledging(null); }
              };
              return (
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <HeartHandshake size={16} className="text-emerald-300 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-black text-white leading-snug">
                        {f.unlocked ? 'Commercial-free — fans covered it' : f.released ? 'Commercial-free goal not reached' : 'Make this airing commercial-free'}
                      </p>
                      <p className="text-[11px] text-white/60 leading-snug">
                        {f.unlocked
                          ? `${usd(f.capturedCents ?? f.pledgedCents)} from ${f.pledgeCount} ${f.pledgeCount === 1 ? 'fan' : 'fans'}. No ad breaks during this slot.`
                          : f.released
                            ? 'Nobody was charged — every pledge was released.'
                            : `Pledges are held, not charged, until ${closeAt}. If the goal isn’t met, nobody pays.`}
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={f.goalCents} aria-valuenow={pledged} aria-label="Commercial-free goal">
                      <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${pctFunded}%` }} />
                    </div>
                    <p className="mt-1 flex justify-between text-[11px] tabular-nums text-white/60">
                      <span><span className="font-black text-white">{usd(f.pledgedCents || 0)}</span> of {usd(f.goalCents)}</span>
                      <span>{f.pledgeCount || 0} {f.pledgeCount === 1 ? 'pledge' : 'pledges'}</span>
                    </p>
                  </div>
                  {!locked && !f.unlocked && left > 0 && onPledge && (
                    canVote ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {[300, 500, 1000].filter(c => c < left).map(c => (
                          <button key={c} type="button" disabled={pledging === poll.id} onClick={() => go(c)}
                            className="rounded-lg bg-white/[0.06] border border-white/15 hover:border-emerald-300/60 text-[12px] font-black text-white disabled:opacity-50">
                            {usd(c)}
                          </button>
                        ))}
                        <button type="button" disabled={pledging === poll.id} onClick={() => go(left)}
                          className={`rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black text-[11px] font-black leading-tight px-1 disabled:opacity-50 ${[300, 500, 1000].filter(c => c < left).length === 3 ? '' : 'col-span-4'}`}>
                          Cover the rest · {usd(left)}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-white/55">Sign in to pledge.</p>
                    )
                  )}
                  {!locked && !f.unlocked && (
                    <p className="text-[10px] text-white/40 leading-snug">
                      Goes straight to the creator. Plajah takes nothing when the creator has Plajah+, 5% otherwise.
                    </p>
                  )}
                </div>
              );
            })()}
          </section>
        );
      })}
    </div>
  );
};

export default LivePollsPanel;
