import React, { useEffect, useState } from 'react';
import { usePoints } from '../contexts/PointsContext';
import { TrendingUp, TrendingDown, Calendar, Filter } from 'lucide-react';
import { PointsTransaction } from '../types';

interface PointsHistoryProps {
  userId: string;
  maxDisplay?: number;
  showAllLink?: boolean;
}

export const PointsHistory: React.FC<PointsHistoryProps> = ({
  userId,
  maxDisplay = 10,
  showAllLink = false,
}) => {
  const { transactions, loadTransactionHistory } = usePoints();
  const [filterType, setFilterType] = useState<'ALL' | PointsTransaction['type']>('ALL');

  useEffect(() => {
    if (userId) {
      loadTransactionHistory(userId);
    }
  }, [userId, loadTransactionHistory]);

  const filtered =
    filterType === 'ALL'
      ? transactions
      : transactions.filter((t) => t.type === filterType);

  const displayed = filtered.slice(0, maxDisplay);

  const typeIcons: { [key in PointsTransaction['type']]: React.ReactNode } = {
    ACHIEVEMENT_UNLOCK: '🏆',
    DAILY_ACTIVITY: '⭐',
    SHARE: '📤',
    LOGIN: '📱',
    REWARD: '🎁',
    MANUAL: '👤',
    REDEMPTION: '💳',
  };

  const typeColors: { [key in PointsTransaction['type']]: string } = {
    ACHIEVEMENT_UNLOCK: 'text-yellow-400',
    DAILY_ACTIVITY: 'text-blue-400',
    SHARE: 'text-green-400',
    LOGIN: 'text-purple-400',
    REWARD: 'text-pink-400',
    MANUAL: 'text-white/60',
    REDEMPTION: 'text-red-400',
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
        <p className="text-white/60">No transaction history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
          <Calendar size={20} />
          Points History
        </h3>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Types</option>
          <option value="ACHIEVEMENT_UNLOCK">Achievements</option>
          <option value="DAILY_ACTIVITY">Daily Activity</option>
          <option value="SHARE">Shares</option>
          <option value="LOGIN">Logins</option>
          <option value="REWARD">Rewards</option>
          <option value="REDEMPTION">Redemptions</option>
        </select>
      </div>

      <div className="space-y-2">
        {displayed.map((txn) => (
          <div
            key={txn.id}
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-3 flex items-start justify-between transition-colors group"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="text-xl mt-1 shrink-0">{typeIcons[txn.type]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">
                  {txn.description || txn.type.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-white/40">
                  {new Date(txn.timestamp).toLocaleString()}
                </p>
                {txn.source && (
                  <p className="text-xs text-white/50 truncate">From: {txn.source}</p>
                )}
              </div>
            </div>

            <div className={`text-right shrink-0 ml-4`}>
              <p
                className={`text-lg font-black ${
                  txn.amount >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {txn.amount >= 0 ? '+' : ''}{txn.amount}
              </p>
              <p className="text-[10px] text-white/40">Points</p>
            </div>
          </div>
        ))}
      </div>

      {showAllLink && filtered.length > maxDisplay && (
        <button className="w-full py-2 text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors">
          View All ({filtered.length} total)
        </button>
      )}
    </div>
  );
};
