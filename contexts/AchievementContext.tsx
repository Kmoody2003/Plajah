import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Zap, Target, Award, Sparkles, MessageSquare } from 'lucide-react';
import {
  fetchAllAchievements,
  fetchUserAchievements,
  unlockAchievement as firebaseUnlockAchievement,
  initializeBaseAchievements,
} from '../services/achievementService';
import { Achievement as FirebaseAchievement, UserAchievementProgress } from '../types';

// Legacy Achievement type (for backward compatibility)
export type AchievementType = 'PLATFORM' | 'CREATOR' | 'SOCIAL' | 'CONTENT';

export interface Achievement extends FirebaseAchievement {
  unlockedAt?: number;
  isNew?: boolean;
}

interface AchievementContextType {
  achievements: Achievement[];
  userAchievements: UserAchievementProgress[];
  unlockAchievement: (id: string) => void;
  triggerAction: (action: string) => void;
  registerAndUnlock: (achievement: Omit<Achievement, 'unlockedAt' | 'isNew' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  isLoading: boolean;
  loadUserAchievements: (userId: string) => void;
}

const AchievementContext = createContext<AchievementContextType | undefined>(undefined);

// Keep legacy achievements for backward compatibility
const LEGACY_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_play',    title: 'First Contact',          description: 'Played your first track on Plajah',              type: 'PLATFORM', icon: 'Zap',          points: 10, category: 'USER', triggerType: 'FIRST_PLAY', pointsValue: 10, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'first_upload',  title: 'Creator Spirit',          description: 'Uploaded your first piece of content',           type: 'CREATOR',  icon: 'Trophy',       points: 50, category: 'ARTIST', triggerType: 'FIRST_UPLOAD', pointsValue: 50, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'first_follow',  title: 'Networker',               description: 'Followed your first artist',                     type: 'SOCIAL',   icon: 'Users',        points: 20, category: 'USER', triggerType: 'FIRST_PLAY', pointsValue: 20, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'lucky_roll',    title: 'Feeling Lucky',           description: 'Used the dice roll for discovery',               type: 'PLATFORM', icon: 'Dices',        points: 15, category: 'USER', triggerType: 'FIRST_PLAY', pointsValue: 15, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'live_viewer',   title: 'Live Witness',            description: 'Watched a live stream for the first time',       type: 'CONTENT',  icon: 'Radio',        points: 25, category: 'USER', triggerType: 'FIRST_PLAY', pointsValue: 25, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'commenter',     title: 'Voice of the People',     description: 'Posted your first comment',                      type: 'SOCIAL',   icon: 'MessageSquare',points: 10, category: 'USER', triggerType: 'FIRST_PLAY', pointsValue: 10, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'hns_first',     title: 'Ghost Track',             description: 'Discovered your first hidden alternate during Hide N Seek mode', type: 'CONTENT',  icon: 'Ghost',       points: 15, category: 'USER', triggerType: 'FIRST_PLAY', pointsValue: 15, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'hns_both_slots',title: 'Both Sides Now',          description: 'Heard both alternates for a single track in Hide N Seek',        type: 'CONTENT',  icon: 'Shuffle',     points: 25, category: 'USER', triggerType: 'FIRST_PLAY', pointsValue: 25, requirements: { type: 'ACTION' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'hns_artist_10', title: 'Hidden Gem',              description: 'Your hidden tracks were discovered by 10 unique listeners',      type: 'CREATOR',  icon: 'Gem',         points: 75, category: 'ARTIST', triggerType: 'FIRST_PLAY', pointsValue: 75, requirements: { type: 'METRIC' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
  { id: 'hns_artist_50', title: 'Going Viral',             description: 'Your hidden tracks were discovered by 50 unique listeners',      type: 'CREATOR',  icon: 'TrendingUp',  points: 150, category: 'ARTIST', triggerType: 'FIRST_PLAY', pointsValue: 150, requirements: { type: 'METRIC' }, createdBy: 'SYSTEM', isActive: true, createdAt: 0, updatedAt: 0  },
];

export const AchievementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievementProgress[]>([]);
  const [activeNotification, setActiveNotification] = useState<Achievement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize base achievements and load legacy data
  useEffect(() => {
    const init = async () => {
      try {
        await initializeBaseAchievements();
        const allAchievements = await fetchAllAchievements();
        const merged = [...allAchievements, ...LEGACY_ACHIEVEMENTS];
        setAchievements(merged);
      } catch (error) {
        console.error('Error initializing achievements:', error);
        setAchievements(LEGACY_ACHIEVEMENTS);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const loadUserAchievements = useCallback(async (userId: string) => {
    try {
      const userAchs = await fetchUserAchievements(userId);
      setUserAchievements(userAchs);
    } catch (error) {
      console.error('Error loading user achievements:', error);
    }
  }, []);

  const fireNotification = useCallback((achievement: Achievement) => {
    setActiveNotification({ ...achievement, unlockedAt: Date.now() });
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  }, []);

  const unlockAchievement = useCallback((id: string) => {
    const achievement = achievements.find(a => a.id === id);
    if (achievement) {
      fireNotification(achievement);
    }
  }, [achievements, fireNotification]);

  const registerAndUnlock = useCallback((achievement: Omit<Achievement, 'unlockedAt' | 'isNew' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const newAch: Achievement = {
      ...achievement,
      id: achievement.id || `custom_${Date.now()}`,
      unlockedAt: Date.now(),
      isNew: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setAchievements(prev => [...prev, newAch]);
    fireNotification(newAch);
  }, [fireNotification]);

  const triggerAction = useCallback((action: string) => {
    switch (action) {
      case 'PLAY_TRACK':         unlockAchievement('first_play');    break;
      case 'UPLOAD_CONTENT':     unlockAchievement('first_upload');  break;
      case 'FOLLOW_USER':        unlockAchievement('first_follow');  break;
      case 'USE_FEELING_LUCKY':  unlockAchievement('lucky_roll');    break;
      case 'WATCH_LIVE':         unlockAchievement('live_viewer');   break;
      case 'POST_COMMENT':       unlockAchievement('commenter');     break;
      case 'HNS_DISCOVER_FIRST': unlockAchievement('hns_first');     break;
      case 'HNS_BOTH_SLOTS':     unlockAchievement('hns_both_slots');break;
      case 'HNS_ARTIST_10':      unlockAchievement('hns_artist_10'); break;
      case 'HNS_ARTIST_50':      unlockAchievement('hns_artist_50'); break;
    }
  }, [unlockAchievement]);

  return (
    <AchievementContext.Provider
      value={{
        achievements,
        userAchievements,
        unlockAchievement,
        triggerAction,
        registerAndUnlock,
        isLoading,
        loadUserAchievements,
      }}
    >
      {children}

      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            onAnimationComplete={() => { setTimeout(() => setActiveNotification(null), 5000); }}
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
                <div className="text-3xl font-black text-white">+{activeNotification.pointsValue || activeNotification.points || 0}</div>
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
