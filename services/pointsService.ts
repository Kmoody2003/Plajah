import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { PointsTransaction, UserPointsBalance } from '../types';

const POINTS_COLLECTION = 'userPoints';
const TRANSACTIONS_COLLECTION = 'pointsTransactions';

const CONVERSION_RATE = 1; // 1 point = 1 Plajah Buck (can be adjusted)

// ── FETCH BALANCE ────────────────────────────────────────────────────────────

export async function fetchUserPointsBalance(userId: string): Promise<UserPointsBalance | null> {
  try {
    const snap = await getDoc(doc(db, POINTS_COLLECTION, userId));
    if (!snap.exists()) {
      // Initialize if doesn't exist
      const newBalance: UserPointsBalance = {
        id: userId,
        userId,
        totalPoints: 0,
        availablePlajahBucks: 0,
        lifetime: 0,
        timestamp: Date.now(),
      };
      await initializeUserPointsBalance(userId);
      return newBalance;
    }
    return { id: snap.id, ...snap.data() } as UserPointsBalance;
  } catch (error) {
    console.error('Error fetching user points balance:', error);
    return null;
  }
}

export async function initializeUserPointsBalance(userId: string): Promise<void> {
  try {
    await setDoc(doc(db, POINTS_COLLECTION, userId), {
      userId,
      totalPoints: 0,
      availablePlajahBucks: 0,
      lifetime: 0,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error initializing user points balance:', error);
  }
}

// ── ADD POINTS ───────────────────────────────────────────────────────────────

export async function addPoints(
  userId: string,
  amount: number,
  type: PointsTransaction['type'],
  source?: string,
  relatedEntityId?: string
): Promise<boolean> {
  try {
    const balance = await fetchUserPointsBalance(userId);
    if (!balance) return false;

    const newTotal = balance.totalPoints + amount;
    const newBucks = Math.floor(newTotal * CONVERSION_RATE);

    // Update balance
    await updateDoc(doc(db, POINTS_COLLECTION, userId), {
      totalPoints: newTotal,
      availablePlajahBucks: newBucks,
      lifetime: (balance.lifetime || 0) + amount,
      lastEarnedAt: Date.now(),
    });

    // Record transaction
    const transaction: PointsTransaction = {
      id: '', // Will be set by Firestore
      userId,
      amount,
      type,
      source,
      description: `${type.replace(/_/g, ' ')}: ${source || ''}`,
      timestamp: Date.now(),
      relatedEntityId,
    };

    await addDoc(collection(db, TRANSACTIONS_COLLECTION), transaction);
    return true;
  } catch (error) {
    console.error('Error adding points:', error);
    return false;
  }
}

// ── REDEEM POINTS (FOR PURCHASES) ────────────────────────────────────────────

export async function redeemPlajahBucks(
  userId: string,
  bucks: number,
  description: string
): Promise<boolean> {
  try {
    const balance = await fetchUserPointsBalance(userId);
    if (!balance || balance.availablePlajahBucks < bucks) return false;

    const pointsToDeduct = Math.ceil(bucks / CONVERSION_RATE);
    const newTotal = Math.max(0, balance.totalPoints - pointsToDeduct);
    const newBucks = Math.floor(newTotal * CONVERSION_RATE);

    await updateDoc(doc(db, POINTS_COLLECTION, userId), {
      totalPoints: newTotal,
      availablePlajahBucks: newBucks,
      lastRedeemedAt: Date.now(),
    });

    // Record redemption transaction
    const transaction: PointsTransaction = {
      id: '',
      userId,
      amount: -pointsToDeduct,
      type: 'REDEMPTION',
      description,
      timestamp: Date.now(),
    };

    await addDoc(collection(db, TRANSACTIONS_COLLECTION), transaction);
    return true;
  } catch (error) {
    console.error('Error redeeming plajah bucks:', error);
    return false;
  }
}

// ── FETCH TRANSACTION HISTORY ────────────────────────────────────────────────

export async function fetchUserTransactionHistory(
  userId: string,
  limitCount: number = 50
): Promise<PointsTransaction[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, TRANSACTIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as PointsTransaction));
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return [];
  }
}

// ── STATISTICS ───────────────────────────────────────────────────────────────

export async function fetchLeaderboard(limitCount: number = 50): Promise<UserPointsBalance[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, POINTS_COLLECTION),
        orderBy('lifetime', 'desc'),
        limit(limitCount)
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as UserPointsBalance));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

export async function fetchTopPointsEarners(period: 'day' | 'week' | 'month' = 'week'): Promise<UserPointsBalance[]> {
  const now = Date.now();
  const periodMs =
    period === 'day' ? 24 * 60 * 60 * 1000 :
    period === 'week' ? 7 * 24 * 60 * 60 * 1000 :
    30 * 24 * 60 * 60 * 1000;

  try {
    const snap = await getDocs(
      query(
        collection(db, POINTS_COLLECTION),
        where('lastEarnedAt', '>=', now - periodMs),
        orderBy('lastEarnedAt', 'desc'),
        limit(50)
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as UserPointsBalance));
  } catch (error) {
    console.error('Error fetching top earners:', error);
    return [];
  }
}
