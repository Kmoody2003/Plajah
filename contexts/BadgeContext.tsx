import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Star } from 'lucide-react';
import {
  fetchUserBadges,
  awardBadge as firebaseAwardBadge,
  checkAndAwardPioneerBadges,
  awardArtistBadge,
  initializeBaseBadges,
} from '../services/badgeService';
import { UserBadge, Badge, BadgeType } from '../types';

interface BadgeContextType {
  userBadges: UserBadge[];
  awardBadge: (badgeType: BadgeType) => void;
  loadUserBadges: (userId: string) => void;
  checkPioneerEligibility: (userId: string) => void;
  markAsArtist: (userId: string) => void;
  isLoading: boolean;
}

const BadgeContext = createContext<BadgeContextType | undefined>(undefined);

export const BadgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeNotification, setActiveNotification] = useState<UserBadge | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Initialize base badges on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeBaseBadges();
      } catch (error) {
        console.error('Error initializing base badges:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const loadUserBadges = useCallback(async (userId: string) => {
    setCurrentUserId(userId);
    try {
      const badges = await fetchUserBadges(userId);
      setUserBadges(badges);
    } catch (error) {
      console.error('Error loading user badges:', error);
    }
  }, []);

  const fireNotification = useCallback((badge: UserBadge) => {
    setActiveNotification(badge);
  }, []);

  const awardBadge = useCallback(
    async (badgeType: BadgeType) => {
      if (!currentUserId) return;

      try {
        const awarded = await firebaseAwardBadge(currentUserId, badgeType);
        if (awarded) {
          await loadUserBadges(currentUserId);
          fireNotification(awarded);
        }
      } catch (error) {
        console.error('Error awarding badge:', error);
      }
    },
    [currentUserId, loadUserBadges, fireNotification]
  );

  const checkPioneerEligibility = useCallback(async (userId: string) => {
    try {
      await checkAndAwardPioneerBadges(userId);
      await loadUserBadges(userId);
    } catch (error) {
      console.error('Error checking pioneer eligibility:', error);
    }
  }, [loadUserBadges]);

  const markAsArtist = useCallback(
    async (userId: string) => {
      try {
        await awardArtistBadge(userId);
        await loadUserBadges(userId);
      } catch (error) {
        console.error('Error marking as artist:', error);
      }
    },
    [loadUserBadges]
  );

  return (
    <BadgeContext.Provider
      value={{
        userBadges,
        awardBadge,
        loadUserBadges,
        checkPioneerEligibility,
        markAsArtist,
        isLoading,
      }}
    >
      {children}

      <AnimatePresence>
        {activeNotification && (
          <motion.div
            key="badge-notification"
            initial={{ opacity: 0, scale: 0.5, rotateX: 180 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.3, transition: { duration: 0.2 } }}
            onAnimationComplete={() => { setTimeout(() => setActiveNotification(null), 5000); }}
            className="fixed bottom-20 right-8 z-[999] pointer-events-none perspective"
            style={{ perspective: '1000px' }}
          >
            <div className="bg-gradient-to-br from-yellow-400/20 via-orange-400/20 to-red-400/20 backdrop-blur-2xl border border-yellow-400/40 rounded-2xl p-6 shadow-[0_0_80px_rgba(255,200,0,0.4)]">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-300 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                  <Award size={32} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-yellow-200">Badge Unlocked</p>
                  <h4 className="text-lg font-black text-white">{activeNotification.badge?.title}</h4>
                  <p className="text-xs text-white/60">{activeNotification.badge?.description}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </BadgeContext.Provider>
  );
};

export const useBadges = () => {
  const context = useContext(BadgeContext);
  if (!context) throw new Error('useBadges must be used within BadgeProvider');
  return context;
};
