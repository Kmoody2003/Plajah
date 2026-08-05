import React, { useEffect } from 'react';
import { useAchievements } from '../contexts/AchievementContext';
import { Trophy, Lock } from 'lucide-react';
import { motion } from 'motion/react';

interface AchievementShowcaseProps {
  userId: string;
  maxDisplay?: number;
  category?: 'USER' | 'ARTIST' | 'ORGANIZATION';
}

export const AchievementShowcase: React.FC<AchievementShowcaseProps> = ({
  userId,
  maxDisplay = 6,
  category,
}) => {
  const { userAchievements, loadUserAchievements, achievements } = useAchievements();

  useEffect(() => {
    if (userId) {
      loadUserAchievements(userId);
    }
  }, [userId, loadUserAchievements]);

  const unlockedIds = new Set(
    userAchievements.filter(a => a.unlockedAt).map(a => a.achievementId)
  );

  let displayed = achievements.filter(a => 
    !category || a.category === category
  ).slice(0, maxDisplay * 2);

  // Show unlocked first, then locked
  const sorted = [
    ...displayed.filter(a => unlockedIds.has(a.id)),
    ...displayed.filter(a => !unlockedIds.has(a.id)),
  ].slice(0, maxDisplay);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-yellow-400" />
          <h3 className="text-lg font-black uppercase tracking-wider text-white">
            Achievements
          </h3>
        </div>
        <p className="text-xs text-white/40">
          {unlockedIds.size} / {achievements.length} unlocked
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {sorted.map((achievement, idx) => {
          const isUnlocked = unlockedIds.has(achievement.id);
          const userAchievement = userAchievements.find(
            a => a.achievementId === achievement.id
          );

          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="group relative"
            >
              {/* Achievement Badge */}
              <div
                className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all ${
                  isUnlocked
                    ? 'bg-gradient-to-br border border-yellow-400/40 shadow-[0_0_20px_rgba(255,200,0,0.3)]'
                    : 'bg-black/30 border border-white/10 opacity-50 hover:opacity-75'
                }`}
                style={{
                  background: isUnlocked
                    ? `linear-gradient(135deg, ${achievement.backgroundColor}33 0%, ${achievement.backgroundColor}11 100%)`
                    : 'rgba(0,0,0,0.3)',
                }}
              >
                {/* Icon */}
                <div className="absolute inset-0 flex items-center justify-center text-2xl">
                  {isUnlocked ? (
                    <>
                      <Trophy className="text-yellow-300" size={28} />
                      {achievement.isNew && (
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"
                        />
                      )}
                    </>
                  ) : (
                    <Lock size={28} className="text-white/30" />
                  )}
                </div>

                {/* Unlock Date Badge */}
                {isUnlocked && userAchievement?.unlockedAt && (
                  <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1 py-0.5 text-[10px] text-white/70">
                    {new Date(userAchievement.unlockedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                )}

                {/* Points Badge */}
                <div className="absolute top-1 right-1 bg-black/60 rounded px-1 py-0.5 text-[10px] font-bold text-yellow-300">
                  +{achievement.pointsValue}
                </div>
              </div>

              {/* Tooltip */}
              <div className="opacity-0 group-hover:opacity-100 absolute -bottom-24 left-1/2 -translate-x-1/2 w-48 bg-black/95 border border-white/20 rounded-lg p-2 z-50 transition-opacity text-center text-xs">
                <p className="font-bold text-white mb-1">{achievement.title}</p>
                <p className="text-white/70 text-[10px]">{achievement.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-white/50 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-400/30 border border-yellow-400/60" />
          <span>Unlocked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-black/50 border border-white/10" />
          <span>Locked</span>
        </div>
      </div>
    </div>
  );
};
