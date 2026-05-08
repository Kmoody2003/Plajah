import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Zap, Target, Award, Sparkles, MessageSquare } from 'lucide-react';

export type AchievementType = 'PLATFORM' | 'CREATOR' | 'SOCIAL' | 'CONTENT';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  type: AchievementType;
  icon: string;
  points: number;
  unlockedAt?: number;
  isNew?: boolean;
}

interface AchievementContextType {
  achievements: Achievement[];
  unlockAchievement: (id: string) => void;
  triggerAction: (action: string) => void;
}

const AchievementContext = createContext<AchievementContextType | undefined>(undefined);

export const AchievementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activeNotification, setActiveNotification] = useState<Achievement | null>(null);

  // Initial achievements definition
  const initialAchievements: Achievement[] = [
    { id: 'first_play', title: 'First Contact', description: 'Played your first track on Plajah', type: 'PLATFORM', icon: 'Zap', points: 10 },
    { id: 'first_upload', title: 'Creator Spirit', description: 'Uploaded your first piece of content', type: 'CREATOR', icon: 'Trophy', points: 50 },
    { id: 'first_follow', title: 'Networker', description: 'Followed your first artist', type: 'SOCIAL', icon: 'Users', points: 20 },
    { id: 'lucky_roll', title: 'Feeling Lucky', description: 'Used the dice roll for discovery', type: 'PLATFORM', icon: 'Dices', points: 15 },
    { id: 'live_viewer', title: 'Live Witness', description: 'Watched a live stream for the first time', type: 'CONTENT', icon: 'Radio', points: 25 },
    { id: 'commenter', title: 'Voice of the People', description: 'Posted your first comment', type: 'SOCIAL', icon: 'MessageSquare', points: 10 },
  ];

  useEffect(() => {
    // Load from localStorage or initialize
    const saved = localStorage.getItem('plajah_achievements');
    if (saved) {
      setAchievements(JSON.parse(saved));
    } else {
      setAchievements(initialAchievements);
    }
  }, []);

  const saveAchievements = (updated: Achievement[]) => {
    setAchievements(updated);
    localStorage.setItem('plajah_achievements', JSON.stringify(updated));
  };

  const unlockAchievement = useCallback((id: string) => {
    setAchievements(prev => {
      const achievement = prev.find(a => a.id === id);
      if (achievement && !achievement.unlockedAt) {
        const updated = prev.map(a => 
          a.id === id ? { ...a, unlockedAt: Date.now(), isNew: true } : a
        );
        setActiveNotification({ ...achievement, unlockedAt: Date.now() });
        saveAchievements(updated);
        
        // Play sound effect (simulated)
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => {});

        return updated;
      }
      return prev;
    });
  }, []);

  const triggerAction = useCallback((action: string) => {
    // Logic to map actions to achievements
    switch (action) {
      case 'PLAY_TRACK': unlockAchievement('first_play'); break;
      case 'UPLOAD_CONTENT': unlockAchievement('first_upload'); break;
      case 'FOLLOW_USER': unlockAchievement('first_follow'); break;
      case 'USE_FEELING_LUCKY': unlockAchievement('lucky_roll'); break;
      case 'WATCH_LIVE': unlockAchievement('live_viewer'); break;
      case 'POST_COMMENT': unlockAchievement('commenter'); break;
    }
  }, [unlockAchievement]);

  return (
    <AchievementContext.Provider value={{ achievements, unlockAchievement, triggerAction }}>
      {children}
      
      {/* Achievement Notification Overlay */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            onAnimationComplete={() => {
              setTimeout(() => setActiveNotification(null), 5000);
            }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none"
          >
            <div className="bg-black/80 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] p-6 flex items-center gap-6 shadow-[0_0_100px_rgba(255,140,0,0.3)] min-w-[400px]">
              <div className="w-20 h-20 bg-gradient-to-br from-small-orange to-orange-600 rounded-3xl flex items-center justify-center shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
                <Trophy size={40} className="text-white relative z-10" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={14} className="text-small-orange" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-small-orange">Achievement Unlocked</span>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tightest leading-none mb-2">{activeNotification.title}</h3>
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">{activeNotification.description}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-white">+{activeNotification.points}</div>
                <div className="text-[8px] font-black uppercase tracking-widest text-white/20">Points</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AchievementContext.Provider>
  );
};

export const useAchievements = () => {
  const context = useContext(AchievementContext);
  if (!context) throw new Error('useAchievements must be used within AchievementProvider');
  return context;
};
