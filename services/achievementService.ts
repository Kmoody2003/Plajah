import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Achievement,
  UserAchievementProgress,
  AchievementCategory,
} from '../types';

const ACHIEVEMENTS_COLLECTION = 'achievements';
const USER_ACHIEVEMENTS_COLLECTION = 'userAchievements';

// ── BASE ACHIEVEMENTS (SYSTEM) ───────────────────────────────────────────────

const BASE_ACHIEVEMENTS: Omit<Achievement, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // USER ACHIEVEMENTS
  {
    title: 'First Album Listen',
    description: 'Completed listening to your first full album',
    category: 'USER',
    triggerType: 'FIRST_ALBUM_LISTEN',
    icon: 'Music',
    backgroundColor: '#FF6B35',
    pointsValue: 25,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_ALBUM_LISTEN' },
    rewards: { pointsBonus: 25 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'First Song',
    description: 'Played your first song on Plajah',
    category: 'USER',
    triggerType: 'FIRST_SONG',
    icon: 'Music2',
    backgroundColor: '#FF9500',
    pointsValue: 10,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_SONG' },
    rewards: { pointsBonus: 10 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'Movie Watcher',
    description: 'Completed watching your first movie',
    category: 'USER',
    triggerType: 'FIRST_MOVIE_COMPLETED',
    icon: 'Film',
    backgroundColor: '#FF5722',
    pointsValue: 30,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_MOVIE_COMPLETED' },
    rewards: { pointsBonus: 30 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'TV Explorer',
    description: 'Watched your first TV episode',
    category: 'USER',
    triggerType: 'FIRST_TV_COMPLETED',
    icon: 'Tv',
    backgroundColor: '#FF4081',
    pointsValue: 20,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_TV_COMPLETED' },
    rewards: { pointsBonus: 20 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'Video Enthusiast',
    description: 'Watched your first video on Plajah',
    category: 'USER',
    triggerType: 'FIRST_VIDEO_COMPLETED',
    icon: 'Play',
    backgroundColor: '#E91E63',
    pointsValue: 15,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_VIDEO_COMPLETED' },
    rewards: { pointsBonus: 15 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'Generous Heart',
    description: 'Sent your first monetary gift to an artist',
    category: 'USER',
    triggerType: 'FIRST_GIFT',
    icon: 'Gift',
    backgroundColor: '#F06292',
    pointsValue: 50,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_GIFT' },
    rewards: { pointsBonus: 50 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'Supporter',
    description: 'Made your first donation to a charity on Plajah',
    category: 'USER',
    triggerType: 'FIRST_DONATION',
    icon: 'Heart',
    backgroundColor: '#C2185B',
    pointsValue: 40,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_DONATION' },
    rewards: { pointsBonus: 40 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'Trailblazer',
    description: 'First to engage with an artist\'s work on Plajah',
    category: 'USER',
    triggerType: 'FIRST_ENGAGEMENT',
    icon: 'Sparkles',
    backgroundColor: '#AD1457',
    pointsValue: 75,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_ENGAGEMENT' },
    rewards: { pointsBonus: 75 },
    createdBy: 'SYSTEM',
    isActive: true,
  },

  // ARTIST ACHIEVEMENTS
  {
    title: 'Creator',
    description: 'Uploaded your first piece of content as a creator',
    category: 'ARTIST',
    triggerType: 'FIRST_UPLOAD',
    icon: 'Upload',
    backgroundColor: '#7C4DFF',
    pointsValue: 100,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_UPLOAD' },
    rewards: { pointsBonus: 100 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'First Fan',
    description: 'Your first user started following you',
    category: 'ARTIST',
    triggerType: 'FIRST_FAN',
    icon: 'Users',
    backgroundColor: '#651FFF',
    pointsValue: 50,
    requirements: { type: 'METRIC', metric: 'follower_count', targetValue: 1 },
    rewards: { pointsBonus: 50 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
  {
    title: 'First Listener',
    description: 'Your first track got played or content was engaged with',
    category: 'ARTIST',
    triggerType: 'FIRST_LISTENER',
    icon: 'Headphones',
    backgroundColor: '#536DFE',
    pointsValue: 75,
    requirements: { type: 'ACTION', actionTrigger: 'FIRST_LISTENER' },
    rewards: { pointsBonus: 75 },
    createdBy: 'SYSTEM',
    isActive: true,
  },
];

// ── FETCH FUNCTIONS ──────────────────────────────────────────────────────────

export async function fetchAllAchievements(): Promise<Achievement[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, ACHIEVEMENTS_COLLECTION),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Achievement));
  } catch (error) {
    console.error('Error fetching achievements:', error);
    return [];
  }
}

export async function fetchAchievementsByCategory(
  category: AchievementCategory
): Promise<Achievement[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, ACHIEVEMENTS_COLLECTION),
        where('category', '==', category),
        where('isActive', '==', true),
        orderBy('pointsValue', 'desc')
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Achievement));
  } catch (error) {
    console.error(`Error fetching ${category} achievements:`, error);
    return [];
  }
}

export async function fetchAchievement(id: string): Promise<Achievement | null> {
  try {
    const snap = await getDoc(doc(db, ACHIEVEMENTS_COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Achievement) : null;
  } catch (error) {
    console.error('Error fetching achievement:', error);
    return null;
  }
}

// ── USER ACHIEVEMENT PROGRESS ────────────────────────────────────────────────

export async function fetchUserAchievements(
  userId: string
): Promise<UserAchievementProgress[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, USER_ACHIEVEMENTS_COLLECTION),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as UserAchievementProgress));
  } catch (error) {
    console.error('Error fetching user achievements:', error);
    return [];
  }
}

export async function fetchUserAchievementProgress(
  userId: string,
  achievementId: string
): Promise<UserAchievementProgress | null> {
  try {
    const snap = await getDocs(
      query(
        collection(db, USER_ACHIEVEMENTS_COLLECTION),
        where('userId', '==', userId),
        where('achievementId', '==', achievementId)
      )
    );
    return snap.empty
      ? null
      : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as UserAchievementProgress);
  } catch (error) {
    console.error('Error fetching user achievement progress:', error);
    return null;
  }
}

export async function unlockAchievement(
  userId: string,
  achievementId: string
): Promise<UserAchievementProgress | null> {
  try {
    const existing = await fetchUserAchievementProgress(userId, achievementId);
    if (existing?.unlockedAt) return existing; // Already unlocked

    const now = Date.now();
    const progress: UserAchievementProgress = {
      id: '', // Will be set by Firestore
      userId,
      achievementId,
      unlockedAt: now,
      isNew: true,
      timestamp: now,
    };

    const docRef = await addDoc(
      collection(db, USER_ACHIEVEMENTS_COLLECTION),
      progress
    );
    return { ...progress, id: docRef.id };
  } catch (error) {
    console.error('Error unlocking achievement:', error);
    return null;
  }
}

export async function markAchievementAsViewed(
  userAchievementId: string
): Promise<void> {
  try {
    await updateDoc(
      doc(db, USER_ACHIEVEMENTS_COLLECTION, userAchievementId),
      { viewedAt: Date.now(), isNew: false }
    );
  } catch (error) {
    console.error('Error marking achievement as viewed:', error);
  }
}

// ── ADMIN ACHIEVEMENT MANAGEMENT ─────────────────────────────────────────────

export async function createAchievement(achievement: Omit<Achievement, 'id' | 'createdAt' | 'updatedAt'>): Promise<Achievement | null> {
  try {
    const now = Date.now();
    const data = {
      ...achievement,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await addDoc(collection(db, ACHIEVEMENTS_COLLECTION), data);
    return { id: docRef.id, ...data } as Achievement;
  } catch (error) {
    console.error('Error creating achievement:', error);
    return null;
  }
}

export async function updateAchievement(
  id: string,
  updates: Partial<Achievement>
): Promise<void> {
  try {
    await updateDoc(doc(db, ACHIEVEMENTS_COLLECTION, id), {
      ...updates,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error('Error updating achievement:', error);
  }
}

export async function deactivateAchievement(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, ACHIEVEMENTS_COLLECTION, id), {
      isActive: false,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error('Error deactivating achievement:', error);
  }
}

// ── INITIALIZATION (ONE-TIME) ────────────────────────────────────────────────

export async function initializeBaseAchievements(): Promise<void> {
  try {
    const existing = await fetchAllAchievements();
    if (existing.length > 0) return; // Already initialized

    for (const baseAch of BASE_ACHIEVEMENTS) {
      await createAchievement(baseAch);
    }
    console.log('Base achievements initialized');
  } catch (error) {
    console.error('Error initializing base achievements:', error);
  }
}

// ── STATISTICS ───────────────────────────────────────────────────────────────

export async function fetchUnlockedAchievementCount(userId: string): Promise<number> {
  try {
    const snap = await getDocs(
      query(
        collection(db, USER_ACHIEVEMENTS_COLLECTION),
        where('userId', '==', userId),
        where('unlockedAt', '!=', null)
      )
    );
    return snap.size;
  } catch (error) {
    console.error('Error fetching unlocked achievement count:', error);
    return 0;
  }
}
