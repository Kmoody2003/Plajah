import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart2, Clock, Check } from 'lucide-react';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/backendService';

export interface PollData {
  question: string;
  options: string[];
  multiSelect: boolean;
  durationHours: number;
  createdAt: number;
  votes?: Record<string, string[]>; // optionIndex → [uid, ...]
}

interface PollCardProps {
  postId: string;
  poll: PollData;
  compact?: boolean;
}

function timeLeft(createdAt: number, durationHours: number): string {
  const endsAt = createdAt + durationHours * 3_600_000;
  const diff = endsAt - Date.now();
  if (diff <= 0) return 'Closed';
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d left`;
  if (h > 0) return `${h}h left`;
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${m}m left`;
}

const PollCard: React.FC<PollCardProps> = ({ postId, poll, compact = false }) => {
  const uid = auth.currentUser?.uid;
  const [votes, setVotes] = useState<Record<string, string[]>>(poll.votes || {});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const isExpired = Date.now() > poll.createdAt + poll.durationHours * 3_600_000;

  // Check if current user already voted
  useEffect(() => {
    if (!uid) return;
    const alreadyVoted = Object.values(votes).some(voters => voters.includes(uid));
    setHasVoted(alreadyVoted);
  }, [uid, votes]);

  const totalVotes = Object.values(votes).reduce((sum, arr) => sum + arr.length, 0);

  const getVoteCount = (i: number) => (votes[String(i)] || []).length;
  const getPct = (i: number) => totalVotes === 0 ? 0 : Math.round((getVoteCount(i) / totalVotes) * 100);

  const isWinner = (i: number) => {
    if (totalVotes === 0) return false;
    const max = Math.max(...poll.options.map((_, idx) => getVoteCount(idx)));
    return getVoteCount(i) === max && max > 0;
  };

  const toggleSelect = (i: number) => {
    if (hasVoted || isExpired || !uid) return;
    const key = String(i);
    setSelected(prev => {
      const next = new Set(prev);
      if (poll.multiSelect) {
        next.has(key) ? next.delete(key) : next.add(key);
      } else {
        next.clear();
        next.add(key);
      }
      return next;
    });
  };

  const submitVote = async () => {
    if (!uid || selected.size === 0 || voting) return;
    setVoting(true);
    try {
      const ref = doc(db, 'posts', postId);
      const updates: Record<string, any> = {};
      selected.forEach(key => {
        updates[`poll.votes.${key}`] = arrayUnion(uid);
      });
      await updateDoc(ref, updates);
      // Optimistic local update
      setVotes(prev => {
        const next = { ...prev };
        selected.forEach(key => {
          next[key] = [...(next[key] || []), uid];
        });
        return next;
      });
      setHasVoted(true);
    } catch (e) {
      console.error('[PollCard] vote failed', e);
    } finally {
      setVoting(false);
    }
  };

  const showResults = hasVoted || isExpired;
  const remaining = timeLeft(poll.createdAt, poll.durationHours);

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <BarChart2 size={14} className="text-purple-400 shrink-0 mt-0.5" />
        <p className={`font-black text-white leading-snug flex-1 ${compact ? 'text-xs' : 'text-sm'}`}>
          {poll.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((option, i) => {
          const pct = getPct(i);
          const sel = selected.has(String(i));
          const winner = showResults && isWinner(i);
          const voterOf = showResults && uid && (votes[String(i)] || []).includes(uid);

          return (
            <button
              key={i}
              onClick={() => toggleSelect(i)}
              disabled={hasVoted || isExpired}
              className={`w-full relative rounded-xl overflow-hidden text-left transition-all ${
                !showResults && sel
                  ? 'ring-2 ring-purple-400/60'
                  : !showResults
                  ? 'hover:bg-white/5'
                  : ''
              } ${hasVoted || isExpired ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {/* Result bar */}
              {showResults && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.06 }}
                  className={`absolute inset-y-0 left-0 rounded-xl ${winner ? 'bg-purple-500/25' : 'bg-white/8'}`}
                />
              )}

              <div className={`relative flex items-center justify-between ${compact ? 'px-3 py-2' : 'px-4 py-2.5'} border rounded-xl ${
                sel && !showResults ? 'border-purple-400/50 bg-purple-400/10'
                : winner ? 'border-purple-400/30'
                : 'border-white/8'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  {!showResults && (
                    <div className={`w-4 h-4 shrink-0 rounded-${poll.multiSelect ? 'md' : 'full'} border-2 flex items-center justify-center transition-all ${
                      sel ? 'border-purple-400 bg-purple-400' : 'border-white/25'
                    }`}>
                      {sel && <Check size={9} className="text-black" />}
                    </div>
                  )}
                  {showResults && voterOf && (
                    <Check size={11} className="text-purple-400 shrink-0" />
                  )}
                  <span className={`font-bold truncate ${compact ? 'text-xs' : 'text-sm'} ${winner ? 'text-white' : 'text-white/80'}`}>
                    {option}
                  </span>
                </div>

                {showResults && (
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className={`text-[10px] font-black ${winner ? 'text-purple-300' : 'text-white/40'}`}>{pct}%</span>
                    {winner && <span className="text-[8px] text-purple-400 font-black uppercase tracking-wider">leading</span>}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Vote button (pre-vote) */}
      {!showResults && selected.size > 0 && (
        <button
          onClick={submitVote}
          disabled={voting}
          className="mt-3 w-full py-2 bg-purple-500 hover:bg-purple-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
        >
          {voting ? 'Voting…' : 'Vote'}
        </button>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-wider text-white/25">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          {poll.multiSelect && ' · multiple choice'}
        </span>
        <div className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider ${isExpired ? 'text-red-400/60' : 'text-white/25'}`}>
          <Clock size={10} />
          {remaining}
        </div>
      </div>
    </div>
  );
};

export default PollCard;
