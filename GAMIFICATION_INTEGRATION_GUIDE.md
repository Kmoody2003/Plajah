/**
 * GAMIFICATION SYSTEM INTEGRATION GUIDE
 * ======================================
 * 
 * This document shows how to integrate the new gamification system
 * (Achievements, Points, Badges) into existing Plajah components.
 */

// ── 1. WRAP APP WITH PROVIDERS ───────────────────────────────────────────────
// In your App.tsx or main layout:

import {
  AchievementProvider,
  PointsProvider,
  BadgeProvider,
} from './components/gamification-index';

export function App() {
  return (
    <BadgeProvider>
      <PointsProvider>
        <AchievementProvider>
          {/* Your existing app content */}
        </AchievementProvider>
      </PointsProvider>
    </BadgeProvider>
  );
}

// ── 2. DISPLAY GAMIFICATION ON PROFILE ────────────────────────────────────────
// In UserProfileView.tsx or similar:

import {
  AchievementShowcase,
  BadgeDisplay,
  PointsDisplay,
  PointsHistory,
} from './components/gamification-index';
import { useAchievements, usePoints, useBadges } from './components/gamification-index';

export function UserProfileView({ userId }: { userId: string }) {
  const { loadUserAchievements } = useAchievements();
  const { loadBalance } = usePoints();
  const { loadUserBadges } = useBadges();

  useEffect(() => {
    if (userId) {
      loadUserAchievements(userId);
      loadBalance(userId);
      loadUserBadges(userId);
    }
  }, [userId]);

  return (
    <div className="space-y-6">
      {/* Badges section */}
      <div className="bg-white/5 rounded-xl p-6">
        <BadgeDisplay userId={userId} maxDisplay={5} size="md" />
      </div>

      {/* Points section */}
      <div className="bg-white/5 rounded-xl p-6">
        <PointsDisplay userId={userId} showDetails={true} size="lg" />
      </div>

      {/* Achievements section */}
      <div className="bg-white/5 rounded-xl p-6">
        <AchievementShowcase userId={userId} maxDisplay={6} />
      </div>

      {/* Points history */}
      <div className="bg-white/5 rounded-xl p-6">
        <PointsHistory userId={userId} maxDisplay={10} showAllLink={true} />
      </div>
    </div>
  );
}

// ── 3. TRIGGER ACHIEVEMENTS ON ACTIONS ───────────────────────────────────────
// When users perform actions, trigger achievement unlocks:

import { useAchievements } from './components/gamification-index';
import { addPoints } from './components/gamification-index';

export function VideoPlayerComponent() {
  const { triggerAction } = useAchievements();
  const { addPoints } = usePoints();

  const handleVideoComplete = async (videoId: string) => {
    // Trigger achievement for watching first video
    triggerAction('WATCH_LIVE'); // or your custom trigger type

    // Award points
    await addPoints(
      10,
      'ACHIEVEMENT_UNLOCK',
      'Watched Video',
      videoId
    );
  };

  return (
    <video onEnded={() => handleVideoComplete('video-123')}>
      {/* video content */}
    </video>
  );
}

// ── 4. ADMIN MANAGEMENT ──────────────────────────────────────────────────────
// In AdminDashboard.tsx or similar:

import { AdminAchievementManager } from './components/gamification-index';

export function AdminDashboard() {
  const [showAchievementManager, setShowAchievementManager] = useState(false);

  return (
    <div>
      <button onClick={() => setShowAchievementManager(true)}>
        Manage Achievements
      </button>

      {showAchievementManager && (
        <AdminAchievementManager
          onClose={() => setShowAchievementManager(false)}
        />
      )}
    </div>
  );
}

// ── 5. CREATOR TOOLS ─────────────────────────────────────────────────────────
// In ArtistMembersArea.tsx or similar (for Plajah+ creators):

import { CreatorAchievementBuilder } from './components/gamification-index';

export function ArtistMembersArea({ artistId, albumId }: Props) {
  const [showAchievementBuilder, setShowAchievementBuilder] = useState(false);

  return (
    <div>
      <button onClick={() => setShowAchievementBuilder(true)}>
        Create Fan Achievement
      </button>

      {showAchievementBuilder && (
        <CreatorAchievementBuilder
          creatorId={artistId}
          creatorName="Your Band Name"
          albumId={albumId}
          onClose={() => setShowAchievementBuilder(false)}
        />
      )}
    </div>
  );
}

// ── 6. AWARD BADGES WHEN USER ACCOUNT CHANGES ────────────────────────────────
// When user updates their account type:

import { awardArtistBadge, checkAndAwardPioneerBadges } from './components/gamification-index';

export async function handleAccountTypeChange(userId: string, newType: 'ARTIST' | 'FAN') {
  if (newType === 'ARTIST') {
    await awardArtistBadge(userId);
  }

  // Check if eligible for pioneer badges
  await checkAndAwardPioneerBadges(userId);
}

// ── 7. POINTS CONVERSION EXAMPLE ──────────────────────────────────────────────
// When user redeems points in store:

import { redeemPlajahBucks } from './components/gamification-index';

export async function handleStoreCheckout(userId: string, itemPrice: number) {
  const success = await redeemPlajahBucks(
    userId,
    itemPrice,
    'Purchased collectible item'
  );

  if (success) {
    // Update user's inventory
  }
}

// ── 8. ACHIEVEMENT UNLOCK FLOW EXAMPLE ────────────────────────────────────────
// Complete flow for unlocking an achievement:

import {
  unlockAchievement,
  addPoints,
} from './components/gamification-index';
import { useAchievements } from './components/gamification-index';

async function handleFirstGift(userId: string, giftAmount: number) {
  // Unlock achievement
  const result = await unlockAchievement(userId, 'FIRST_GIFT');

  if (result?.unlockedAt) {
    // Achievement was newly unlocked

    // Award points
    await addPoints(
      50, // points value for first gift
      'ACHIEVEMENT_UNLOCK',
      'First Gift',
      userId
    );

    // Show notification (handled by context automatically)
    console.log('First gift achievement unlocked!');
  }
}

// ── KEY HOOKS & EXPORTS ──────────────────────────────────────────────────────
/**
 * useAchievements()
 *   - achievements: Achievement[]
 *   - userAchievements: UserAchievementProgress[]
 *   - unlockAchievement(id: string)
 *   - triggerAction(action: string)
 *   - loadUserAchievements(userId: string)
 *   - isLoading: boolean
 *
 * usePoints()
 *   - balance: UserPointsBalance | null
 *   - transactions: PointsTransaction[]
 *   - addPoints(amount, type, source?)
 *   - redeemBucks(bucks, description)
 *   - loadBalance(userId)
 *   - loadTransactionHistory(userId)
 *   - isLoading: boolean
 *
 * useBadges()
 *   - userBadges: UserBadge[]
 *   - awardBadge(badgeType)
 *   - loadUserBadges(userId)
 *   - checkPioneerEligibility(userId)
 *   - markAsArtist(userId)
 *   - isLoading: boolean
 */

// ── ACHIEVEMENT TRIGGER TYPES ────────────────────────────────────────────────
/**
 * Available triggerAction() types:
 * - 'PLAY_TRACK' / 'FIRST_SONG'
 * - 'FIRST_ALBUM_LISTEN'
 * - 'FIRST_MOVIE_COMPLETED'
 * - 'FIRST_TV_COMPLETED'
 * - 'FIRST_VIDEO_COMPLETED'
 * - 'FIRST_GIFT'
 * - 'FIRST_DONATION'
 * - 'FIRST_ENGAGEMENT'
 * - 'UPLOAD_CONTENT' / 'FIRST_UPLOAD'
 * - 'FOLLOW_USER' / 'FIRST_FAN'
 * - 'USE_FEELING_LUCKY'
 * - 'WATCH_LIVE' / 'FIRST_LISTENER'
 * - 'POST_COMMENT'
 * - 'HNS_DISCOVER_FIRST'
 * - 'HNS_BOTH_SLOTS'
 * - 'HNS_ARTIST_10'
 * - 'HNS_ARTIST_50'
 */
