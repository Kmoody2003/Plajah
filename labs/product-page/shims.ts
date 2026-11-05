// Product page lab: in-memory stand-ins for what ProductPage imports (auth, reviews, waitlist, uploads).
// Nothing here writes anywhere; the products themselves are read live (storeProducts is public).
import type { StoreReview } from '../../types';

const params = new URLSearchParams(location.search);
const who = params.get('as') || 'shopper';   // ?as=shopper | seller | admin | guest
export const LAB_SELLER = '8dCD4GRrFzWi9y5tbWdfJEUHwYz2';
export const auth: any = {
  currentUser: who === 'guest' ? null : {
    uid: who === 'seller' ? LAB_SELLER : who === 'admin' ? 'lab-admin' : 'lab-shopper',
    displayName: who === 'seller' ? 'Great Faith Ministries' : who === 'admin' ? 'Lab Admin' : 'Lab Shopper',
    photoURL: '',
    getIdToken: async () => 'lab',
  },
};

const day = 86400000;
let reviews: StoreReview[] = [];
const seeded = new Set<string>();
const seed = (productId: string) => {
  if (seeded.has(productId) || params.get('reviews') === '0') return;
  seeded.add(productId);
  const base = Date.now();
  const mk = (n: number, rating: number, title: string, body: string, extra: Partial<StoreReview> = {}): StoreReview => ({
    id: `${productId}_lab${n}`, productId, reviewerId: `lab${n}`, reviewerName: `Lab reviewer ${n}`, rating, title, body,
    isVerifiedPurchase: n % 2 === 1, helpfulCount: (5 - n) * 2, timestamp: base - n * 9 * day, ...extra,
  });
  reviews.push(
    mk(1, 5, 'LAB SAMPLE (not a real review)', 'This text only exists in the product page lab so the reviews layout can be checked.'),
    mk(2, 4, 'LAB SAMPLE', 'Second sample review, unverified, to check the badge and sorting.', { sellerReply: 'Sample shop reply (lab).', sellerReplyAt: base - day }),
    mk(3, 5, '', 'Third sample with no headline.'),
    mk(4, 2, 'LAB SAMPLE low rating', 'Checks the lowest-rated sort.'),
  );
};
const agg = (productId: string) => {
  const r = reviews.filter(x => x.productId === productId);
  return { rating: r.length ? r.reduce((s, x) => s + x.rating, 0) / r.length : 0, reviewCount: r.length };
};

export const fetchProductReviews = async (productId: string) => { seed(productId); return reviews.filter(r => r.productId === productId); };
export const addProductReview = async (d: { productId: string; rating: number; title?: string; body: string; images?: string[] }) => {
  const u = auth.currentUser; if (!u) throw new Error('Sign in first.');
  const id = `${d.productId}_${u.uid}`;
  const prev = reviews.find(r => r.id === id);
  const review: StoreReview = {
    id, productId: d.productId, reviewerId: u.uid, reviewerName: u.displayName, rating: d.rating, title: d.title, body: d.body,
    images: d.images || [], isVerifiedPurchase: false, helpfulCount: prev?.helpfulCount || 0, timestamp: prev?.timestamp || Date.now(),
    ...(prev ? { editedAt: Date.now() } : {}),
  };
  reviews = [review, ...reviews.filter(r => r.id !== id)];
  return { review, ...agg(d.productId) };
};
export const deleteMyProductReview = async (productId: string) => { reviews = reviews.filter(r => r.id !== `${productId}_${auth.currentUser?.uid}`); return agg(productId); };
export const markReviewHelpful = async (id: string) => { const r = reviews.find(x => x.id === id); if (r) r.helpfulCount++; return { already: false }; };
export const replyToReview = async (id: string, text: string) => { const r = reviews.find(x => x.id === id); if (r) r.sellerReply = text; return { sellerReply: text }; };

const waitlist = new Set<string>();
export const isOnWaitlist = async (id: string) => waitlist.has(id);
export const joinWaitlist = async (id: string) => { waitlist.add(id); };
export const leaveWaitlist = async (id: string) => { waitlist.delete(id); };
export const uploadImageWithDerivatives = async (_p: string, f: File) => ({ display: URL.createObjectURL(f) });
