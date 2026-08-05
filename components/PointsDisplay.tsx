import React, { useEffect } from 'react';
import { usePoints } from '../contexts/PointsContext';
import { Coins, Zap, TrendingUp } from 'lucide-react';

interface PointsDisplayProps {
  userId: string;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
}

export const PointsDisplay: React.FC<PointsDisplayProps> = ({
  userId,
  showDetails = false,
  size = 'md',
  compact = false,
}) => {
  const { balance, loadBalance } = usePoints();

  useEffect(() => {
    if (userId) {
      loadBalance(userId);
    }
  }, [userId, loadBalance]);

  if (!balance) return null;

  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-2',
    lg: 'text-base gap-3',
  };

  if (compact) {
    return (
      <div className={`flex items-center ${sizeClasses[size]}`}>
        <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2 py-1">
          <Zap size={14} className="text-yellow-400 mr-1" />
          <span className="font-bold text-white">{balance.totalPoints}</span>
        </div>
        <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2 py-1">
          <Coins size={14} className="text-purple-400 mr-1" />
          <span className="font-bold text-white">{balance.availablePlajahBucks}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Points Card */}
      <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-yellow-400/80 mb-1">Total Points</p>
            <p className="text-3xl font-black text-white">{balance.totalPoints}</p>
            <p className="text-xs text-white/40 mt-2">Lifetime Earned: {balance.lifetime}</p>
          </div>
          <Zap size={32} className="text-yellow-400/60" />
        </div>
      </div>

      {/* Plajah Bucks Card */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-purple-400/80 mb-1">Plajah Bucks</p>
            <p className="text-3xl font-black text-white">{balance.availablePlajahBucks}</p>
            <p className="text-xs text-white/40 mt-2">Ready to spend at the store</p>
          </div>
          <Coins size={32} className="text-purple-400/60" />
        </div>
      </div>

      {/* Stats */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-white/60 mb-1">Last Earned</p>
            <p className="text-sm font-bold text-white">
              {balance.lastEarnedAt
                ? new Date(balance.lastEarnedAt).toLocaleDateString()
                : 'Never'}
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-white/60 mb-1">Last Redeemed</p>
            <p className="text-sm font-bold text-white">
              {balance.lastRedeemedAt
                ? new Date(balance.lastRedeemedAt).toLocaleDateString()
                : 'Never'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
