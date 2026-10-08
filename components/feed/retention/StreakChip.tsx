/**
 * StreakChip — gentle "days around" chip. No guilt copy, no loss warnings: a streak
 * stays alive through yesterday and simply restarts quietly after a full missed day.
 *
 * Props: uid (signed-in user), className?. Records today as an active day (at most one
 * write per day) and hides itself until there is something warm to say.
 */
import React, { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { touchStreak } from '../../../services/retentionService';
import { streakCopy, type StreakInfo } from '../../../services/postingLogic';

const StreakChip: React.FC<{ uid?: string | null; className?: string }> = ({ uid, className = '' }) => {
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    touchStreak(uid).then(s => { if (alive) setStreak(s); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);
  if (!uid || !streak || streak.current < 2) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-small-orange/10 border border-small-orange/25 text-small-orange text-[10px] font-black uppercase tracking-widest ${className}`}
      title={`Best: ${streak.best} days`}
    >
      <Flame size={11} />{streakCopy(streak)}
    </span>
  );
};

export default StreakChip;
