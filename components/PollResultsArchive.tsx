import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart2, Clock, Trophy, ChevronDown, ChevronUp, ArrowLeft, Inbox } from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth } from '../services/backendService';
import { PollArchiveEntry } from '../types';
import { formatDistanceToNow, format } from 'date-fns';

// ── Archive hydration ─────────────────────────────────────────────────────────

// When a poll closes (endsAt < now), we hydrate its archive entry from the post doc

async function hydratePollArchive(uid: string): Promise<PollArchiveEntry[]> {
  const snap = await getDocs(
    query(collection(db, 'posts'), where('authorId', '==', uid), where('hasPoll', '==', true), orderBy('timestamp', 'desc'), limit(50))
  );
  const entries: PollArchiveEntry[] = [];
  snap.docs.forEach(d => {
    const data = d.data() as any;
    const poll = data.poll;
    if (!poll?.question) return;
    const endsAt = data.timestamp + (poll.durationHours || 24) * 3_600_000;
    const votes: Record<string, string[]> = poll.votes || {};
    const totalVoters = Object.values(votes).reduce((s: number, arr: any) => s + arr.length, 0);
    const winningIdx = Object.entries(votes).sort(([,a]: any, [,b]: any) => b.length - a.length)[0]?.[0];
    entries.push({
      id: d.id,
      postId: d.id,
      question: poll.question,
      options: poll.options || [],
      votes,
      totalVoters,
      createdAt: data.timestamp,
      closedAt: endsAt,
      winningOption: winningIdx !== undefined ? poll.options[Number(winningIdx)] : undefined,
    });
  });
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

// ── Poll result card ──────────────────────────────────────────────────────────

const PollResultCard: React.FC<{ entry: PollArchiveEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const isOpen = entry.closedAt > Date.now();
  const total = entry.totalVoters;

  const getPct = (idx: number) =>
    total === 0 ? 0 : Math.round(((entry.votes[String(idx)] || []).length / total) * 100);

  const sortedOptions = entry.options
    .map((opt, i) => ({ opt, i, count: (entry.votes[String(i)] || []).length, pct: getPct(i) }))
    .sort((a, b) => b.count - a.count);

  const winner = sortedOptions[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden"
    >
      <button onClick={() => setExpanded(v => !v)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={13} className="text-purple-400 shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-wider text-purple-400/70">
                {isOpen ? 'Active Poll' : 'Closed Poll'}
              </p>
            </div>
            <p className="text-sm font-black text-white leading-snug">{entry.question}</p>
          </div>
          {expanded ? <ChevronUp size={14} className="text-white/30 shrink-0 mt-1" /> : <ChevronDown size={14} className="text-white/30 shrink-0 mt-1" />}
        </div>

        {/* Summary row */}
        <div className="flex items-center gap-3 mt-2.5">
          <span className="text-[9px] font-black text-white/30">{total} vote{total !== 1 ? 's' : ''}</span>
          {winner && total > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-black text-yellow-400">
              <Trophy size={9} /> {winner.opt} — {winner.pct}%
            </span>
          )}
          <span className="text-[9px] text-white/20 ml-auto">{format(entry.createdAt, 'MMM d, yyyy')}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-2">
          {sortedOptions.map(({ opt, i, count, pct }) => (
            <div key={i} className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-bold ${i === 0 ? 'text-white' : 'text-white/60'}`}>{opt}</span>
                <span className={`text-[10px] font-black ${i === 0 ? 'text-purple-300' : 'text-white/30'}`}>{pct}%</span>
              </div>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05 }}
                  className={`h-full rounded-full ${i === 0 ? 'bg-purple-500' : 'bg-white/20'}`}
                />
              </div>
              <span className="text-[8px] text-white/25">{count} vote{count !== 1 ? 's' : ''}</span>
            </div>
          ))}
          <p className="text-[9px] text-white/20 pt-1 border-t border-white/5">
            {isOpen ? `Closes ${formatDistanceToNow(entry.closedAt, { addSuffix: true })}` : `Closed ${formatDistanceToNow(entry.closedAt, { addSuffix: true })}`}
          </p>
        </div>
      )}
    </motion.div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

interface PollResultsArchiveProps {
  onBack?: () => void;
}

const PollResultsArchive: React.FC<PollResultsArchiveProps> = ({ onBack }) => {
  const [entries, setEntries] = useState<PollArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    hydratePollArchive(uid).then(e => { setEntries(e); setLoading(false); });
  }, []);

  const filtered = entries.filter(e => {
    if (filter === 'ACTIVE') return e.closedAt > Date.now();
    if (filter === 'CLOSED') return e.closedAt <= Date.now();
    return true;
  });

  const totalVotesAllTime = entries.reduce((s, e) => s + e.totalVoters, 0);
  const avgVotes = entries.length > 0 ? Math.round(totalVotesAllTime / entries.length) : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Poll Archive</h2>
          <p className="text-[9px] text-white/30">All your polls and results</p>
        </div>
        <BarChart2 size={16} className="text-purple-400" />
      </div>

      {/* Stats */}
      {entries.length > 0 && (
        <div className="px-6 py-3 border-b border-white/5 grid grid-cols-3 gap-3 shrink-0">
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-2.5 text-center">
            <p className="text-lg font-black text-white">{entries.length}</p>
            <p className="text-[8px] text-purple-300/70 font-black uppercase tracking-wider">Polls</p>
          </div>
          <div className="bg-white/[0.04] border border-white/8 rounded-xl p-2.5 text-center">
            <p className="text-lg font-black text-white">{totalVotesAllTime}</p>
            <p className="text-[8px] text-white/30 font-black uppercase tracking-wider">Total Votes</p>
          </div>
          <div className="bg-white/[0.04] border border-white/8 rounded-xl p-2.5 text-center">
            <p className="text-lg font-black text-white">{avgVotes}</p>
            <p className="text-[8px] text-white/30 font-black uppercase tracking-wider">Avg/Poll</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {(['ALL', 'ACTIVE', 'CLOSED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest transition-colors relative ${
              filter === f ? 'text-white' : 'text-white/30 hover:text-white/60'
            }`}
          >
            {f}
            {filter === f && <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-purple-400 rounded-full" />}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="py-12 text-center text-white/20">
            <div className="w-8 h-8 border-2 border-white/10 border-t-purple-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[9px] font-black uppercase tracking-widest">Loading polls…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-white/20">
            <Inbox size={36} className="mx-auto mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest">
              {filter === 'ALL' ? 'No polls yet' : `No ${filter.toLowerCase()} polls`}
            </p>
            {filter === 'ALL' && <p className="text-[9px] text-white/15 mt-1">Create a poll in any post</p>}
          </div>
        ) : (
          filtered.map(entry => <PollResultCard key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
};

export default PollResultsArchive;
