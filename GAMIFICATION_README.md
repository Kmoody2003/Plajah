# 🎮 Plajah Gamification System

Complete achievement, points, and badge system for platform engagement and user retention.

## 📋 Overview

The gamification system is built on three core pillars:

1. **Achievements** - Unlockable milestones for users, artists, and organizations
2. **Points** - Earned from achievements and daily activities, convertible to Plajah Bucks
3. **Badges** - Special recognitions for early adopters and verified accounts

## 🏗️ Architecture

### Services (Backend Integration)
- `services/achievementService.ts` - Achievement CRUD and unlock logic
- `services/pointsService.ts` - Points balance and transaction management  
- `services/badgeService.ts` - Badge assignment and tracking

### Contexts (Global State)
- `contexts/AchievementContext.tsx` - Achievement state, notifications, unlock triggers
- `contexts/PointsContext.tsx` - Points balance, transactions, earning/redeeming
- `contexts/BadgeContext.tsx` - Badge state, awards, eligibility checks

### Components (UI)
- `components/AchievementShowcase.tsx` - Display earned/locked achievements
- `components/PointsDisplay.tsx` - Show points and Plajah Bucks balance
- `components/BadgeDisplay.tsx` - Show earned badges with tooltips
- `components/PointsHistory.tsx` - Transaction history with filtering
- `components/AdminAchievementManager.tsx` - Admin achievement CRUD
- `components/CreatorAchievementBuilder.tsx` - Plajah+ member custom achievements

### Firestore Collections
```
achievements/              → System and admin-created achievements
├ id: string
├ title: string
├ category: USER | ARTIST | ORGANIZATION
├ triggerType: enum
├ pointsValue: number
├ requirements: object
├ createdBy: SYSTEM | ADMIN | CREATOR

userAchievements/{userId}/ → User achievement progress
├ achievementId: string
├ unlockedAt?: number
├ progressValue?: number
├ viewedAt?: number

userPoints/{userId}/       → User points balance
├ totalPoints: number
├ availablePlajahBucks: number
├ lifetime: number
├ lastEarnedAt?: number

pointsTransactions/        → Points transaction history
├ userId: string
├ amount: number
├ type: ACHIEVEMENT_UNLOCK | DAILY_ACTIVITY | SHARE | ...
├ timestamp: number

userBadges/{userId}/       → User badge assignments
├ badgeId: string
├ badgeType: PIONEER | PIONEER_ELITE | ARTIST | CUSTOM
├ earnedAt: number

badges/                    → Badge definitions
├ type: enum
├ title: string
├ criteria: object
├ displayPriority: number
```

## 🚀 Quick Start

### 1. Setup Providers

In `App.tsx`, wrap your app with the gamification providers:

```tsx
import { BadgeProvider, PointsProvider, AchievementProvider } from './components/gamification-index';

export function App() {
  return (
    <BadgeProvider>
      <PointsProvider>
        <AchievementProvider>
          {/* Your app content */}
        </AchievementProvider>
      </PointsProvider>
    </BadgeProvider>
  );
}
```

### 2. Display on Profile

Add components to user profile views:

```tsx
import { AchievementShowcase, PointsDisplay, BadgeDisplay } from './components/gamification-index';

export function UserProfile({ userId }) {
  return (
    <div className="space-y-6">
      <BadgeDisplay userId={userId} />
      <PointsDisplay userId={userId} showDetails={true} />
      <AchievementShowcase userId={userId} maxDisplay={6} />
    </div>
  );
}
```

### 3. Trigger Achievements

When users perform actions, unlock achievements:

```tsx
import { useAchievements, usePoints, addPoints } from './components/gamification-index';

export function VideoPlayer() {
  const { triggerAction } = useAchievements();
  const { addPoints } = usePoints();
  const [userId] = useUser();

  const handleVideoComplete = async () => {
    triggerAction('FIRST_VIDEO_COMPLETED');
    await addPoints(userId, 15, 'ACHIEVEMENT_UNLOCK', 'Video Watched');
  };

  return <video onEnded={handleVideoComplete} />;
}
```

### 4. Award Badges

Automatically award badges when conditions are met:

```tsx
import { awardArtistBadge, checkAndAwardPioneerBadges } from './components/gamification-index';

export async function handleAccountTypeChange(userId, newType) {
  if (newType === 'ARTIST') {
    await awardArtistBadge(userId);
  }
  await checkAndAwardPioneerBadges(userId);
}
```

## 📊 Achievement Categories

### USER Achievements (For all users)
- `FIRST_ALBUM_LISTEN` - Completed first full album
- `FIRST_SONG` - Played first song
- `FIRST_MOVIE_COMPLETED` - Watched complete movie
- `FIRST_TV_COMPLETED` - Watched TV episode
- `FIRST_VIDEO_COMPLETED` - Watched video
- `FIRST_GIFT` - Sent monetary gift to artist
- `FIRST_DONATION` - Donated to charity
- `FIRST_ENGAGEMENT` - First to engage with artist work

### ARTIST Achievements (For creators)
- `FIRST_UPLOAD` - Uploaded first content
- `FIRST_FAN` - First user followed them
- `FIRST_LISTENER` - First engagement with content

### ORGANIZATION Achievements (For brands/charities)
- Extensible - add as needed for org metrics

## 💰 Points System

### Earning Points
- **Achievements** - Award points on unlock (10-150 per achievement)
- **Daily Activity** - Login bonuses, shares, interactions
- **Special Events** - Limited-time bonuses
- **Admin Rewards** - Manual points for participation

### Plajah Bucks Conversion
1 point = 1 Plajah Buck (configurable in `pointsService.ts`)

### Spending Bucks
- Store purchases (collector items)
- Artist merch
- Special features unlock

## 🏅 Badge Types

### Pioneer Badge
- **Criteria**: First 100 users on platform
- **Display**: Gold star icon
- **Priority**: Medium

### Pioneer Elite Badge  
- **Criteria**: First 25 users to create/upload/engage
- **Display**: Red crown icon
- **Priority**: Highest

### Artist Badge
- **Criteria**: Account type categorized as ARTIST
- **Display**: Purple palette icon
- **Priority**: Medium-low

### Custom Badges (Admin/Creator)
- Extensible - create additional badge types as needed

## 🛠️ Admin Tools

Access at `/admin/achievements` or integrate into admin dashboard:

```tsx
import { AdminAchievementManager } from './components/gamification-index';

export function AdminPanel() {
  const [showManager, setShowManager] = useState(false);

  return (
    <>
      <button onClick={() => setShowManager(true)}>Manage Achievements</button>
      {showManager && <AdminAchievementManager onClose={() => setShowManager(false)} />}
    </>
  );
}
```

**Capabilities:**
- ✏️ Create new achievements
- 🔄 Edit existing achievements
- 🔴 Deactivate achievements
- 📊 View category breakdowns
- 🔍 Search and filter

## 👨‍🎨 Creator Tools (Plajah+)

Plajah+ members can create custom achievements for their fandoms:

```tsx
import { CreatorAchievementBuilder } from './components/gamification-index';

export function ArtistProfile({ artistId, albumId }) {
  return (
    <CreatorAchievementBuilder
      creatorId={artistId}
      creatorName="Band Name"
      albumId={albumId}
      fandomId="fandom-123"
    />
  );
}
```

**Features:**
- 🎯 Define achievement title & description
- 🎨 Customize badge color
- 💎 Set point rewards (5-500)
- 📌 Link to albums or fandoms
- 🔔 Get notifications when fans unlock

## 📈 Statistics & Leaderboards

### User Stats
```tsx
import { fetchUserPointsBalance, fetchUnlockedAchievementCount } from './components/gamification-index';

const balance = await fetchUserPointsBalance(userId);
const unlockedCount = await fetchUnlockedAchievementCount(userId);
```

### Global Leaderboards
```tsx
import { fetchLeaderboard, fetchTopPointsEarners } from './components/gamification-index';

const topUsers = await fetchLeaderboard(50);
const weeklyTopEarners = await fetchTopPointsEarners('week');
```

### Badge Statistics
```tsx
import { fetchBadgeHolderCount, fetchMostEarmedBadges } from './components/gamification-index';

const pioneerCount = await fetchBadgeHolderCount('PIONEER');
const mostEarned = await fetchMostEarmedBadges();
```

## 🔌 Integration Hooks

### Activity Triggers
Hook into existing components to trigger achievements:

```tsx
// VideoPlayer.tsx
const { triggerAction } = useAchievements();

onVideoComplete(() => triggerAction('FIRST_VIDEO_COMPLETED'));
onMovieComplete(() => triggerAction('FIRST_MOVIE_COMPLETED'));
onTVWatch(() => triggerAction('FIRST_TV_COMPLETED'));

// GiftModal.tsx
onGiftSent(() => triggerAction('FIRST_GIFT'));

// DonationModal.tsx
onDonationSent(() => triggerAction('FIRST_DONATION'));

// FollowButton.tsx
onFollow(() => triggerAction('FIRST_FAN')); // For artists
```

### Points Integration
Hook achievement unlocks to point awards:

```tsx
const { addPoints } = usePoints();

async function handleAchievementUnlock(achievement) {
  await addPoints(
    userId,
    achievement.pointsValue,
    'ACHIEVEMENT_UNLOCK',
    achievement.id
  );
}
```

## 🎨 Customization

### Custom Achievement Animation
Achievements support custom animations:

```tsx
const achievement: Achievement = {
  // ... other fields
  animation: {
    animationType: 'ROTATE',
    soundType: 'FANFARE',
    animationUrl: 'https://cdn.example.com/animations/spin.json',
    soundEffectUrl: 'https://cdn.example.com/sounds/fanfare.mp3',
  }
};
```

### Theme Colors
Customize badge and achievement colors:

```tsx
const badge: Badge = {
  // ... other fields
  backgroundColor: '#FF6B35', // Orange
};

const achievement: Achievement = {
  // ... other fields
  backgroundColor: '#9C27B0', // Purple
};
```

## 📱 Mobile Responsive

All components are fully responsive:
- **Desktop**: Full showcase with details
- **Tablet**: Grid layout with modal previews
- **Mobile**: Horizontal scroll with minimal badges shown

## 🔒 Security

### Admin-Only Operations
- ✅ Create/edit/delete achievements
- ✅ Deactivate achievement types
- ✅ Manually award points/badges
- ✅ View all leaderboards

### Creator-Only Operations (Plajah+)
- ✅ Create album-specific achievements
- ✅ Create fandom-specific achievements
- ✅ Set point values (5-500 max)

### User Operations
- ✅ View personal achievements
- ✅ View achievements progress
- ✅ Redeem points for store items

## 🧪 Testing

### Manual Testing Checklist
- [ ] Achievements unlock on first occurrence
- [ ] Points add correctly to balance
- [ ] Plajah Bucks conversion calculates correctly
- [ ] Badges award automatically for pioneers
- [ ] Artist badge awards on account type change
- [ ] Notifications display and auto-dismiss
- [ ] Leaderboards rank users correctly
- [ ] Admin manager CRUD operations work
- [ ] Creator builder creates custom achievements
- [ ] Mobile responsiveness on all components

### Test Data
Initialize test achievements:
```tsx
import { initializeBaseAchievements } from './components/gamification-index';

await initializeBaseAchievements();
```

## 🚧 Future Enhancements

- [ ] Seasonal achievements with limited availability
- [ ] Tiered achievements with progression tracking
- [ ] Competitive challenges between fans/artists
- [ ] Achievement sharing to social media
- [ ] Animated achievement unlock videos
- [ ] Achievement trading or gifting
- [ ] VR/AR achievement experiences
- [ ] Real-world merchant partnerships for Plajah Bucks
- [ ] Achievement NFT minting
- [ ] Subscription tier-locked achievements

## 📞 Support

For issues or questions about the gamification system:
1. Check `GAMIFICATION_INTEGRATION_GUIDE.ts` for examples
2. Review component prop types in source files
3. Check Firestore rules for permission issues
4. Enable Firebase debug logging for troubleshooting

---

**Last Updated**: May 2026  
**Version**: 1.0.0  
**Status**: Production Ready
