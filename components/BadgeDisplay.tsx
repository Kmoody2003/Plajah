import React, { useEffect } from 'react';
import { useBadges } from '../contexts/BadgeContext';
import Tooltip from './Tooltip';

interface BadgeDisplayProps {
  userId: string;
  showAll?: boolean;
  maxDisplay?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const BadgeDisplay: React.FC<BadgeDisplayProps> = ({
  userId,
  showAll = false,
  maxDisplay = 5,
  size = 'md',
}) => {
  const { userBadges, loadUserBadges } = useBadges();

  useEffect(() => {
    if (userId) {
      loadUserBadges(userId);
    }
  }, [userId, loadUserBadges]);

  if (userBadges.length === 0) return null;

  const displayBadges = showAll ? userBadges : userBadges.slice(0, maxDisplay);
  const hiddenCount = userBadges.length - displayBadges.length;

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const iconSizes = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  const bgMap: { [key: string]: string } = {
    PIONEER: 'bg-gradient-to-br from-yellow-400/20 to-amber-500/20 border border-yellow-400/40',
    PIONEER_ELITE: 'bg-gradient-to-br from-red-400/20 to-orange-500/20 border border-red-400/40',
    ARTIST: 'bg-gradient-to-br from-purple-400/20 to-pink-500/20 border border-purple-400/40',
    CUSTOM: 'bg-gradient-to-br from-blue-400/20 to-cyan-500/20 border border-blue-400/40',
  };

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-white/50">Badges Earned</p>
      <div className="flex flex-wrap gap-2">
        {displayBadges.map((userBadge) => (
          <Tooltip
            key={userBadge.id}
            content={userBadge.badge?.title || userBadge.badgeType}
          >
            <div
              className={`${sizeClasses[size]} ${bgMap[userBadge.badgeType] || bgMap.CUSTOM} rounded-full flex items-center justify-center cursor-help hover:scale-110 transition-transform`}
            >
              {userBadge.badge?.icon && (
                <span className="text-sm">{userBadge.badge.icon}</span>
              )}
            </div>
          </Tooltip>
        ))}

        {hiddenCount > 0 && (
          <Tooltip content={`+${hiddenCount} more badges`}>
            <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-xs font-bold text-white/60 cursor-help hover:scale-110 transition-transform">
              +{hiddenCount}
            </div>
          </Tooltip>
        )}
      </div>

      {/* Earned Dates */}
      {showAll && (
        <div className="space-y-2">
          {userBadges.map((userBadge) => (
            <div
              key={userBadge.id}
              className="flex items-center justify-between bg-white/5 rounded-lg p-2"
            >
              <div>
                <p className="text-sm font-bold text-white">
                  {userBadge.badge?.title || userBadge.badgeType}
                </p>
                <p className="text-xs text-white/40">
                  {new Date(userBadge.earnedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
