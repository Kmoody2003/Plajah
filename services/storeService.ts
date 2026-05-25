import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, addDoc, increment,
  arrayUnion, arrayRemove, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type {
  StoreProduct, StoreOrder, StoreOrderItem, StoreCartItem,
  StoreReview, GarageSaleItem, GarageSaleBid, StoreProductCategory,
} from '../types';

// ── PRODUCTS ─────────────────────────────────────────────────────────────────

export const createProduct = async (product: Omit<StoreProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const ref = doc(collection(db, 'storeProducts'));
  const now = Date.now();
  await setDoc(ref, { ...product, id: ref.id, createdAt: now, updatedAt: now });
  return ref.id;
};

export const updateProduct = async (productId: string, updates: Partial<StoreProduct>): Promise<void> => {
  await updateDoc(doc(db, 'storeProducts', productId), { ...updates, updatedAt: Date.now() });
};

export const deleteProduct = async (productId: string): Promise<void> => {
  await deleteDoc(doc(db, 'storeProducts', productId));
};

export const fetchProductsBySeller = async (sellerId: string): Promise<StoreProduct[]> => {
  const q = query(collection(db, 'storeProducts'), where('sellerId', '==', sellerId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct));
};

export const fetchFeaturedProducts = async (limitCount = 20): Promise<StoreProduct[]> => {
  const q = query(
    collection(db, 'storeProducts'),
    where('isActive', '==', true),
    where('isFeatured', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct));
};

export const fetchProductsByCategory = async (
  category: StoreProductCategory,
  limitCount = 40,
): Promise<StoreProduct[]> => {
  const q = query(
    collection(db, 'storeProducts'),
    where('isActive', '==', true),
    where('category', '==', category),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct));
};

export const fetchAllActiveProducts = async (limitCount = 60): Promise<StoreProduct[]> => {
  const q = query(
    collection(db, 'storeProducts'),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct));
};

export const listenToProducts = (
  callback: (products: StoreProduct[]) => void,
  sellerId?: string,
) => {
  const q = sellerId
    ? query(collection(db, 'storeProducts'), where('sellerId', '==', sellerId), orderBy('createdAt', 'desc'))
    : query(collection(db, 'storeProducts'), where('isActive', '==', true), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct)));
  });
};

// ── REVIEWS ───────────────────────────────────────────────────────────────────

export const addProductReview = async (review: Omit<StoreReview, 'id' | 'timestamp' | 'helpfulCount'>): Promise<void> => {
  const ref = doc(collection(db, 'storeReviews'));
  await setDoc(ref, { ...review, id: ref.id, helpfulCount: 0, timestamp: Date.now() });
  await updateDoc(doc(db, 'storeProducts', review.productId), {
    reviewCount: increment(1),
  });
};

export const fetchProductReviews = async (productId: string): Promise<StoreReview[]> => {
  const q = query(collection(db, 'storeReviews'), where('productId', '==', productId), orderBy('timestamp', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreReview));
};

export const markReviewHelpful = async (reviewId: string): Promise<void> => {
  await updateDoc(doc(db, 'storeReviews', reviewId), { helpfulCount: increment(1) });
};

// ── ORDERS ────────────────────────────────────────────────────────────────────

export const createOrder = async (order: Omit<StoreOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const ref = doc(collection(db, 'storeOrders'));
  const now = Date.now();
  await setDoc(ref, { ...order, id: ref.id, status: 'PENDING', createdAt: now, updatedAt: now });

  // Decrement stock for each item
  for (const item of order.items) {
    await updateDoc(doc(db, 'storeProducts', item.productId), {
      stock: increment(-item.quantity),
      soldCount: increment(item.quantity),
    });
  }

  return ref.id;
};

export const fetchMyOrders = async (): Promise<StoreOrder[]> => {
  if (!auth.currentUser) return [];
  const q = query(
    collection(db, 'storeOrders'),
    where('buyerId', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreOrder));
};

export const fetchSellerOrders = async (sellerId: string): Promise<StoreOrder[]> => {
  const q = query(
    collection(db, 'storeOrders'),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreOrder));
};

export const updateOrderStatus = async (orderId: string, status: StoreOrder['status'], trackingNumber?: string): Promise<void> => {
  const updates: any = { status, updatedAt: Date.now() };
  if (trackingNumber) updates.trackingNumber = trackingNumber;
  await updateDoc(doc(db, 'storeOrders', orderId), updates);
};

// ── GARAGE SALE (AUCTIONS) ────────────────────────────────────────────────────

export const createGarageSaleItem = async (
  item: Omit<GarageSaleItem, 'id' | 'bidCount' | 'watchers' | 'currentBid' | 'createdAt' | 'status'>,
): Promise<string> => {
  const ref = doc(collection(db, 'garageSale'));
  await setDoc(ref, {
    ...item,
    id: ref.id,
    bidCount: 0,
    watchers: [],
    status: 'ACTIVE',
    createdAt: Date.now(),
  });
  return ref.id;
};

export const listenToGarageSaleItems = (callback: (items: GarageSaleItem[]) => void, category?: string) => {
  const base = [where('status', '==', 'ACTIVE'), orderBy('endTime', 'asc'), limit(50)] as any[];
  if (category) base.unshift(where('category', '==', category));
  const q = query(collection(db, 'garageSale'), ...base);
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as GarageSaleItem)));
  });
};

export const fetchGarageSaleItem = async (itemId: string): Promise<GarageSaleItem | null> => {
  const snap = await getDoc(doc(db, 'garageSale', itemId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as GarageSaleItem) : null;
};

export const placeBid = async (
  itemId: string,
  amount: number,
  maxAutoBid?: number,
): Promise<{ success: boolean; message: string }> => {
  if (!auth.currentUser) return { success: false, message: 'Must be signed in' };

  try {
    const result = await runTransaction(db, async (tx) => {
      const itemRef = doc(db, 'garageSale', itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error('Item not found');

      const item = itemSnap.data() as GarageSaleItem;
      if (item.status !== 'ACTIVE') throw new Error('Auction has ended');
      if (item.endTime < Date.now()) throw new Error('Auction has expired');
      if (item.sellerId === auth.currentUser!.uid) throw new Error('Cannot bid on your own item');

      const minBid = (item.currentBid ?? item.startingBid) + 1;
      if (amount < minBid) throw new Error(`Minimum bid is $${minBid.toFixed(2)}`);

      // Place bid
      const bidRef = doc(collection(db, 'garageSale', itemId, 'bids'));
      const bid: GarageSaleBid = {
        id: bidRef.id,
        itemId,
        bidderId: auth.currentUser!.uid,
        bidderName: auth.currentUser!.displayName || 'Anonymous',
        bidderPhoto: auth.currentUser!.photoURL || '',
        amount,
        isAutoBid: false,
        maxAutoBid,
        timestamp: Date.now(),
      };
      tx.set(bidRef, bid);

      // Update item
      tx.update(itemRef, {
        currentBid: amount,
        currentBidderId: auth.currentUser!.uid,
        currentBidderName: auth.currentUser!.displayName || 'Anonymous',
        bidCount: increment(1),
      });

      return { success: true, message: `Bid of $${amount.toFixed(2)} placed!` };
    });
    return result;
  } catch (err: any) {
    return { success: false, message: err.message || 'Bid failed' };
  }
};

export const watchGarageSaleItem = async (itemId: string): Promise<void> => {
  if (!auth.currentUser) return;
  await updateDoc(doc(db, 'garageSale', itemId), {
    watchers: arrayUnion(auth.currentUser.uid),
  });
};

export const unwatchGarageSaleItem = async (itemId: string): Promise<void> => {
  if (!auth.currentUser) return;
  await updateDoc(doc(db, 'garageSale', itemId), {
    watchers: arrayRemove(auth.currentUser.uid),
  });
};

export const fetchBidHistory = async (itemId: string): Promise<GarageSaleBid[]> => {
  const q = query(
    collection(db, 'garageSale', itemId, 'bids'),
    orderBy('timestamp', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as GarageSaleBid));
};

export const buyItNow = async (itemId: string): Promise<{ success: boolean; message: string }> => {
  if (!auth.currentUser) return { success: false, message: 'Must be signed in' };
  try {
    const result = await runTransaction(db, async (tx) => {
      const itemRef = doc(db, 'garageSale', itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error('Item not found');
      const item = itemSnap.data() as GarageSaleItem;
      if (!item.buyItNowPrice) throw new Error('No Buy It Now price set');
      if (item.status !== 'ACTIVE') throw new Error('Auction has ended');
      tx.update(itemRef, {
        status: 'SOLD',
        winnerId: auth.currentUser!.uid,
        winnerName: auth.currentUser!.displayName || 'Anonymous',
        finalPrice: item.buyItNowPrice,
      });
      return { success: true, message: `Purchased for $${item.buyItNowPrice.toFixed(2)}!` };
    });
    return result;
  } catch (err: any) {
    return { success: false, message: err.message || 'Purchase failed' };
  }
};

export const fetchMyGarageSaleItems = async (): Promise<GarageSaleItem[]> => {
  if (!auth.currentUser) return [];
  const q = query(collection(db, 'garageSale'), where('sellerId', '==', auth.currentUser.uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as GarageSaleItem));
};
