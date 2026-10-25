// ChannelVoteStrip — under the LiveHub TV+ player: the tuned channel's Fan Vote ballot, if it has
// one. Collapsed it's a single line ("Fan Vote · pick what airs at 9 PM · closes in 2h"); opened it
// is the same results/vote/pledge card the fan room uses. Renders nothing for channels with no ballot.

import React, { useState } from 'react';
import { ChevronDown, Vote } from 'lucide-react';
import { auth } from '../../services/backendService';
import { useLivePolls } from '../../services/livePollsClient';
import { LivePollsPanel } from '../taleo/LivePollsPanel';

/** The poll room a channel's ballots live in. */
export function voteRoomFor(ch: { plajahId?: string; scheduleOwner?: string; ownerId?: string }): string | null {
  if (ch.plajahId === 'horror-classics') return 'halloween_vault';
  const owner = ch.scheduleOwner || ch.ownerId;
  return owner && !ch.plajahId ? `ch_${owner}` : null;
}

export const ChannelVoteStrip: React.FC<{ roomId: string }> = ({ roomId }) => {
  const [open, setOpen] = useState(false);
  const live = useLivePolls(roomId, { active: true, intervalMs: open ? 5000 : 30000 });
  const ballots = live.polls.filter(p => p.kind === 'SCHEDULE');
  if (!ballots.length) return null;
  const next = ballots.filter(p => p.status === 'OPEN').sort((a, b) => (a.schedule?.airAtMs ?? 0) - (b.schedule?.airAtMs ?? 0))[0];
  const user = auth.currentUser;
  const canVote = !!user && !user.isAnonymous;
  const mins = next?.closesAtMs ? Math.max(0, Math.round((next.closesAtMs - (Date.now() + live.skewMs)) / 60000)) : 0;
  const closes = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;

  return (
    <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.06]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <Vote size={16} className="text-orange-300 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-black text-white leading-tight truncate">
            {next ? next.question : 'Fan Vote results'}
          </span>
          <span className="block text-[10px] text-white/55">
            {next ? `Fan Vote · closes in ${closes}${next.funding && !next.funding.unlocked ? ' · commercial-free goal open' : ''}` : 'See what fans picked'}
          </span>
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-orange-300">{open ? 'Hide' : next ? 'Vote' : 'View'}</span>
        <ChevronDown size={14} className={`text-orange-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 max-h-[60vh] overflow-y-auto">
          <LivePollsPanel
            polls={ballots}
            myVotes={live.myVotes}
            loading={live.loading}
            error={live.error}
            skewMs={live.skewMs}
            canVote={canVote}
            onVote={live.vote}
            onPledge={live.pledge}
            notice={live.pledgeNotice}
          />
        </div>
      )}
    </div>
  );
};

export default ChannelVoteStrip;
