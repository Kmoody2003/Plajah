import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Swords, Trophy, BarChart2, Star, Users, Zap, Eye } from 'lucide-react';
import { Debate } from '../types';
import { listenUserDebates, seedDemoDebate } from '../services/debateService';
import DebateCard from './DebateCard';

interface DebatesProfileTabProps {
  uid: string;
  onOpenDebate: (debateId: string) => void;
}

const DebatesProfileTab: React.FC<DebatesProfileTabProps> = ({ uid, onOpenDebate }) => {
  const [debates, setDebates]     = useState<Debate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [demoLoaded, setDemoLoaded] = useState(false);

  useEffect(() => {
    const unsub = listenUserDebates(uid, d => {
      setDebates(d);
      setLoading(false);
    });
    // Seed demo debate on first load
    seedDemoDebate().then(id => { if (id) setDemoLoaded(true); }).catch(() => {});
    return () => unsub();
  }, [uid]);

  const wins  = debates.filter(d => d.verdict?.winnerUid === uid).length;
  const total = debates.filter(d => d.status === 'JUDGED').length;
  const totalPosts = debates.reduce((s, d) => s + d.postCount, 0);
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div className="mt-6">
      {/* Stats header */}
      {debates.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-3 text-center">
            <div className="flex justify-center mb-1"><Swords size={14} className="text-orange-400" /></div>
            <p className="text-xl font-black text-white">{debates.length}</p>
            <p className="text-[8px] text-white/30 font-black uppercase tracking-wider mt-0.5">Debates</p>
          </div>
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-3 text-center">
            <div className="flex justify-center mb-1"><Trophy size={14} className="text-yellow-400" /></div>
            <p className="text-xl font-black text-white">{wins}</p>
            <p className="text-[8px] text-white/30 font-black uppercase tracking-wider mt-0.5">Wins</p>
          </div>
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-3 text-center">
            <div className="flex justify-center mb-1"><BarChart2 size={14} className="text-purple-400" /></div>
            <p className="text-xl font-black text-white">{winRate}%</p>
            <p className="text-[8px] text-white/30 font-black uppercase tracking-wider mt-0.5">Win Rate</p>
          </div>
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-3 text-center">
            <div className="flex justify-center mb-1"><Zap size={14} className="text-cyan-400" /></div>
            <p className="text-xl font-black text-white">{totalPosts}</p>
            <p className="text-[8px] text-white/30 font-black uppercase tracking-wider mt-0.5">Posts Made</p>
          </div>
        </div>
      )}

      {/* Preview fight card — fires VS animation with demo data, no real debate */}
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('CHALLENGE_VS', {
            detail: {
              debateId:       'preview-demo',
              challengerId:   'demo_challenger',
              challengerName: 'Maya Rivers',
              challengerPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MayaRivers',
            },
          }));
        }}
        className="w-full mb-5 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-white/[0.04] border border-white/8 text-white/50 text-[10px] font-black uppercase tracking-[0.18em] hover:bg-orange-500/10 hover:border-orange-500/25 hover:text-orange-400 transition-all"
      >
        <Eye size={14} />
        Preview Fight Card Animation
      </button>

      {/* Rules reminder */}
      <div className="mb-5 p-4 rounded-2xl bg-orange-500/8 border border-orange-500/15">
        <div className="flex items-start gap-3">
          <Swords size={14} className="text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-400/80 mb-1">Debate Rules</p>
            <p className="text-[11px] text-white/50 leading-relaxed">
              3 challenges/day · 24-hour debates · Profanity or insults = auto-disqualification · Aria judges on facts + academic debate rubric · Participants must stay civil — spectators are free
            </p>
          </div>
        </div>
      </div>

      {/* Debate gallery */}
      {loading ? (
        <div className="py-16 text-center text-white/20">
          <div className="w-8 h-8 border-2 border-white/10 border-t-orange-400 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[9px] font-black uppercase tracking-widest">Loading debates…</p>
        </div>
      ) : debates.length === 0 ? (
        <div className="py-16 text-center text-white/20">
          <Swords size={40} className="mx-auto mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest mb-1">No debates yet</p>
          <p className="text-[9px] text-white/15">Challenge a comment to start a structured debate</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {debates.map(debate => (
            <DebateCard key={debate.id} debate={debate} onOpen={onOpenDebate} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DebatesProfileTab;
