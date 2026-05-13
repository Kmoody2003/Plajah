// ── CONTEXTS ─────────────────────────────────────────────────────────────────

export { AchievementProvider, useAchievements, type Achievement as AchievementType } from './AchievementContext';
export { PointsProvider, usePoints } from './PointsContext';
export { BadgeProvider, useBadges } from './BadgeContext';

// ── COMPONENTS ───────────────────────────────────────────────────────────────

// Display Components
export { PointsDisplay } from './PointsDisplay';
export { BadgeDisplay } from './BadgeDisplay';
export { AchievementShowcase } from './AchievementShowcase';
export { PointsHistory } from './PointsHistory';

// Admin/Creator Tools
export { AdminAchievementManager } from './AdminAchievementManager';
export { CreatorAchievementBuilder } from './CreatorAchievementBuilder';

// ── SERVICES ─────────────────────────────────────────────────────────────────

export {
  fetchAllAchievements,
  fetchAchievementsByCategory,
  fetchAchievement,
  fetchUserAchievements,
  fetchUserAchievementProgress,
  unlockAchievement,
  markAchievementAsViewed,
  createAchievement,
  updateAchievement,
  deactivateAchievement,
  initializeBaseAchievements,
  fetchUnlockedAchievementCount,
} from '../services/achievementService';

export {
  fetchUserPointsBalance,
  initializeUserPointsBalance,
  addPoints,
  redeemPlajahBucks,
  fetchUserTransactionHistory,
  fetchLeaderboard,
  fetchTopPointsEarners,
} from '../services/pointsService';

export {
  fetchAllBadges,
  fetchBadge,
  fetchBadgeByType,
  fetchUserBadges,
  fetchUserBadge,
  awardBadge,
  removeBadge,
  checkAndAwardPioneerBadges,
  awardArtistBadge,
  createBadge,
  updateBadge,
  deactivateBadge,
  initializeBaseBadges,
  fetchBadgeHolderCount,
  fetchMostEarmedBadges,
} from '../services/badgeService';
