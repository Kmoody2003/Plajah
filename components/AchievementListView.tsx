import React from 'react';
import { useAchievements, Achievement } from '../contexts/AchievementContext';
import { motion } from 'motion/react';
import { Trophy, Star, Zap, Target, Award, Sparkles, MessageSquare, X } from 'lucide-react';

interface AchievementListViewProps {
  onClose: () => void;
}

const AchievementListView: React.FC<AchievementListViewProps> = ({ onClose }) => {
  const { achievements } = useAchievements();

  const unlocked = achievements.filter(a => a.unlockedAt);
  const locked = achievements.filter(a => !a.unlockedAt);

  return (
    <div className="flex flex-col h-full bg-black/95 backdrop-blur-3xl border-l border-white/10">
      <div className="p-8 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-black tracking-tightest uppercase">Achievements</h2>
          <p className="text-small-orange text-[10px] font-black uppercase tracking-widest">Gamified Experience</p>
        </div>
        <button onClick={onClose} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-all">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Total Points</p>
            <p className="text-4xl font-black text-white">{unlocked.reduce((sum, a) => sum + a.points, 0)}</p>
          </div>
          <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Unlocked</p>
            <p className="text-4xl font-black text-white">{unlocked.length} / {achievements.length}</p>
          </div>
        </div>

        {/* Unlocked Section */}
        <div className="space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Unlocked Milestones</h3>
          <div className="space-y-4">
            {unlocked.map(a => (
              <motion.div 
                key={a.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gradient-to-r from-small-orange/20 to-transparent p-6 rounded-[2rem] border border-small-orange/30 flex items-center gap-6"
              >
                <div className="w-14 h-14 bg-small-orange rounded-2xl flex items-center justify-center shadow-xl">
                  <Trophy size={24} className="text-black" />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-black uppercase tracking-tight mb-1">{a.title}</h4>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{a.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-small-orange">+{a.points}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-20">Points</p>
                </div>
              </motion.div>
            ))}
            {unlocked.length === 0 && (
              <p className="text-xs font-bold text-white/20 uppercase tracking-widest text-center py-8 italic">No achievements unlocked yet. Keep exploring!</p>
            )}
          </div>
        </div>

        {/* Locked Section */}
        <div className="space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Hidden Treasures</h3>
          <div className="space-y-4">
            {locked.map(a => (
              <div 
                key={a.id}
                className="bg-white/[0.02] p-6 rounded-[2rem] border border-white/5 flex items-center gap-6 opacity-40 grayscale"
              >
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
                  <Award size={24} className="text-white/20" />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-black uppercase tracking-tight mb-1">???</h4>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Locked Achievement</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-white/20">+{a.points}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AchievementListView;
