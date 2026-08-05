import React from 'react';
import { motion } from 'motion/react';
import { Swords, Trophy, Clock, Users, Share2, ChevronRight, AlertTriangle } from 'lucide-react';
import { buildShareUrl } from '../services/deepLinkService';
import { Debate } from '../types';
import { format } from 'date-fns';

interface DebateCardProps {
  debate: Debate;
  onOpen: (id: string) => void;
  compact?: boolean;
}

function timeInfo(debate: Debate): { label: string; urgent: boolean } {
  if (debate.status === 'JUDGED') return { label: 'Judged', urgent: false };
  if (debate.status === 'DECLINED') return { label: 'Declined', urgent: false };
  if (debate.status === 'ENDED') return { label: 'Awaiting verdict', urgent: false };
  if (debate.status === 'PENDING') return { label: 'Pending acceptance', urgent: false };
  const left = debate.endsAt - Date.now();
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return { label: h > 0 ? `${h}h ${m}m left` : `${m}m left`, urgent: h < 2 };
}

const DebateCard: React.FC<DebateCardProps> = ({ debate, onOpen, compact = false }) => {
  const total  = debate.challengerSupporters.length + debate.defenderSupporters.length;
  const cPct   = total > 0 ? Math.round((debate.challengerSupporters.length / total) * 100) : 50;
  const dPct   = 100 - cPct;
  const ti     = timeInfo(debate);
  const winner = debate.verdict?.winner;

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildShareUrl('debate', debate.id);
    if (navigator.share) {
      navigator.share({ title: `Plajah Debate: ${debate.topic}`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  if (compact) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => onOpen(debate.id)}
        className="w-full text-left bg-white/[0.03] border border-white/10 rounded-2xl p-3 hover:bg-white/[0.06] hover:border-white/20 transition-all group"
      >
        <div className="flex items-start gap-3">
          <Swords size={14} className="text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-white truncate mb-1">{debate.topic}</p>
            <div className="flex items-center gap-2 text-[9px] text-white/30">
              <span className="text-red-400/70">{debate.challengerName}</span>
              <span>vs</span>
              <span className="text-emerald-400/70">{debate.defenderName}</span>
            </div>
          </div>
          {winner && <Trophy size={12} className={winner === 'CHALLENGER' ? 'text-red-400' : winner === 'DEFENDER' ? 'text-emerald-400' : 'text-yellow-400'} />}
        </div>
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpen(debate.id)}
      className="cursor-pointer bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 hover:bg-white/[0.05] transition-all group"
    >
      {/* Hero image / gradient header */}
      <div className="h-24 relative overflow-hidden">
        {debate.heroImageUrl ? (
          <img src={debate.heroImageUrl} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-red-900/40 via-black to-emerald-900/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

        {/* VS badge */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <img src={debate.challengerPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${debate.challengerId}`} className="w-9 h-9 rounded-full border-2 border-red-500/50 object-cover" alt="" />
            <div className="w-7 h-7 rounded-full bg-black/80 border border-white/20 flex items-center justify-center">
              <Swords size={12} className="text-orange-400" />
            </div>
            <img src={debate.defenderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${debate.defenderId}`} className="w-9 h-9 rounded-full border-2 border-emerald-500/50 object-cover" alt="" />
          </div>
        </div>

        {/* Status chip */}
        <div className="absolute top-2 right-2">
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
            debate.status === 'ACTIVE' ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' :
            debate.status === 'JUDGED' ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' :
            'bg-white/8 border-white/10 text-white/30'
          }`}>
            {debate.status === 'ACTIVE' && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
            {debate.status === 'ACTIVE' ? 'Live' : debate.status === 'JUDGED' ? '🏆 Judged' : debate.status === 'DECLINED' ? 'Declined' : debate.status === 'PENDING' ? 'Pending' : 'Ended'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-[12px] font-black text-white leading-snug mb-2 group-hover:text-orange-400/80 transition-colors line-clamp-2">
          {debate.topic}
        </p>

        {/* Participants */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-[10px] text-white/60 truncate">{debate.challengerName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[10px] text-white/60 truncate">{debate.defenderName}</span>
          </div>
        </div>

        {/* Public vote bar */}
        {total > 0 && (
          <div className="mb-3">
            <div className="h-1.5 rounded-full overflow-hidden flex mb-1">
              <div className="bg-red-500/70" style={{ width: `${cPct}%` }} />
              <div className="bg-emerald-500/70 flex-1" />
            </div>
            <div className="flex justify-between text-[8px] text-white/25 font-bold">
              <span>{cPct}%</span>
              <span>{dPct}%</span>
            </div>
          </div>
        )}

        {/* Winner badge */}
        {debate.status === 'JUDGED' && winner && (
          <div className={`mb-3 flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
            winner === 'CHALLENGER' ? 'bg-red-500/10 border-red-500/25' :
            winner === 'DEFENDER'   ? 'bg-emerald-500/10 border-emerald-500/25' :
            'bg-yellow-500/10 border-yellow-500/25'
          }`}>
            <Trophy size={11} className={winner === 'CHALLENGER' ? 'text-red-400' : winner === 'DEFENDER' ? 'text-emerald-400' : 'text-yellow-400'} />
            <span className={`text-[9px] font-black uppercase tracking-wider ${winner === 'CHALLENGER' ? 'text-red-400' : winner === 'DEFENDER' ? 'text-emerald-400' : 'text-yellow-400'}`}>
              {winner === 'DRAW' ? 'Draw' : `${debate.verdict?.winnerName} won`} · {debate.verdict?.consensusScore}% consensus
            </span>
          </div>
        )}

        {/* Highlight quote */}
        {debate.highlightQuote && (
          <p className="text-[10px] text-white/40 italic line-clamp-2 mb-3">"{debate.highlightQuote}"</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[9px] text-white/25">
            <span className="flex items-center gap-1"><Users size={9} />{debate.viewCount}</span>
            <span className="flex items-center gap-1"><Clock size={9} />{ti.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleShare} className="p-1.5 rounded-full text-white/20 hover:text-white/60 hover:bg-white/8 transition-all">
              <Share2 size={12} />
            </button>
            <ChevronRight size={14} className="text-white/15 group-hover:text-white/40 transition-all" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default DebateCard;
