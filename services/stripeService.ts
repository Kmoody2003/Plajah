import { loadStripe } from '@stripe/stripe-js';
import { auth } from './firebase';

// Redirect the browser to a Stripe Checkout session created by one of our
// server endpoints. Fetches the caller's ID token so components don't have to.
async function redirectToCheckout(path: string, body: Record<string, any>): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to continue');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Payment could not be started' }));
    throw new Error(error || 'Payment could not be started');
  }
  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');
  window.location.href = url;
}

// ── Singleton stripe.js instance ─────────────────────────────────────────────

let stripePromise: ReturnType<typeof loadStripe> | null = null;

export const getStripe = () => {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error('Stripe publishable key not configured');
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

// ── Subscription Checkout ─────────────────────────────────────────────────────

export interface CheckoutOptions {
  tier: 1 | 2 | 3;
  isMorph: boolean;
  boundCreatorId?: string;
  morphCreatorIds?: string[];
  morphMode?: 'SPLIT' | 'RANDOM';
  userIdToken: string;
}

export async function startSubscriptionCheckout(opts: CheckoutOptions): Promise<void> {
  const res = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.userIdToken}`,
    },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Failed to create checkout session');
  }

  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');
  window.location.href = url;
}

// ── Billing Portal ────────────────────────────────────────────────────────────

export async function openBillingPortal(userIdToken: string): Promise<void> {
  const res = await fetch('/api/stripe/create-portal-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userIdToken}`,
    },
    body: JSON.stringify({ returnUrl: window.location.href }),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Failed to open billing portal');
  }

  const { url } = await res.json();
  if (url) window.location.href = url;
}

// ── Rebind Subscription ───────────────────────────────────────────────────────

export async function rebindSubscription(
  subscriptionId: string,
  newCreatorId: string,
  userIdToken: string
): Promise<void> {
  const res = await fetch('/api/stripe/rebind-subscription', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userIdToken}`,
    },
    body: JSON.stringify({ subscriptionId, newCreatorId }),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Rebind failed');
  }
}

// ── Ad Packages ───────────────────────────────────────────────────────────────

export const AD_PACKAGES = [
  { type: 'BASIC',   price: 4.99,  days: 7,  boostMultiplier: 1.5,  label: 'Starter Boost',  description: 'Increased placement across the platform for 7 days' },
  { type: 'FEATURED', price: 9.99, days: 14, boostMultiplier: 2.5,  label: 'Featured Boost', description: 'Featured placement + priority in discovery for 14 days' },
  { type: 'PREMIUM',  price: 14.99, days: 21, boostMultiplier: 4.0,  label: 'Premium Blast',  description: 'Premium-tier visibility + home feed feature for 21 days' },
  { type: 'MAXIMUM',  price: 20.00, days: 30, boostMultiplier: 6.0,  label: 'Max Exposure',   description: 'Maximum aggressive placement everywhere for 30 days' },
] as const;

export const OFF_PLATFORM_PACKAGES = [
  { tier: 'STANDARD', price: 49,  label: 'Off-Platform Standard', description: 'Monthly digital ad rotation across partner networks and social channels' },
  { tier: 'PREMIUM',  price: 100, label: 'Off-Platform Premium',  description: 'Monthly premium rotation including digital billboards and high-reach placements' },
] as const;

export async function purchaseAdPackage(opts: {
  packageType: string;
  contentId?: string;
  contentType?: string;
  userIdToken: string;
}): Promise<void> {
  const res = await fetch('/api/stripe/purchase-ad-package', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.userIdToken}`,
    },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Ad package purchase failed');
  }

  const { url } = await res.json();
  if (url) window.location.href = url;
}

export async function purchaseOffPlatformPromotion(opts: {
  tier: 'STANDARD' | 'PREMIUM';
  userIdToken: string;
}): Promise<void> {
  const res = await fetch('/api/stripe/purchase-off-platform', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.userIdToken}`,
    },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Off-platform purchase failed');
  }

  const { url } = await res.json();
  if (url) window.location.href = url;
}

// ── SeedRaiser Pledge ─────────────────────────────────────────────────────────

export async function pledgeToCampaign(opts: {
  campaignId: string;
  amount: number;
  rewardId?: string;
  message?: string;
  isAnonymous: boolean;
  userIdToken: string;
}): Promise<void> {
  const res = await fetch('/api/stripe/seedraiser-pledge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.userIdToken}`,
    },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Pledge failed');
  }

  const { url } = await res.json();
  if (url) window.location.href = url;
}

// ── Stripe Connect onboarding (creator or organization) ──────────────────────

export async function connectStripe(opts: { orgId?: string; userIdToken: string }): Promise<void> {
  const res = await fetch('/api/stripe/connect/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.userIdToken}` },
    body: JSON.stringify(opts.orgId ? { orgId: opts.orgId } : {}),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Could not start Stripe onboarding');
  }
  const { url } = await res.json();
  if (url) window.location.href = url;
}

// ── Church Donation (one-time or recurring) ───────────────────────────────────

export async function startChurchDonation(opts: {
  churchId: string;
  churchName?: string;
  amount: number;
  fund?: string;
  recurring?: boolean;
  message?: string;
  userIdToken: string;
}): Promise<void> {
  const res = await fetch('/api/stripe/church-donation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.userIdToken}` },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Could not start giving');
  }
  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');
  window.location.href = url;
}

// ── Business Order Payment ────────────────────────────────────────────────────

export async function checkoutBusinessOrder(opts: {
  businessId: string;
  items: { name: string; price: number; quantity: number }[];
  userIdToken: string;
}): Promise<void> {
  const res = await fetch('/api/stripe/business-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.userIdToken}`,
    },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error || 'Order payment failed');
  }

  const { url } = await res.json();
  if (url) window.location.href = url;
}

// ── Sanctuary (memberships · à la carte unlocks · campaign backing) ─────────────
// All three route the customer to Stripe Checkout; the webhook records the
// membership / purchase / pledge and the creator earning (10% platform, ~90%
// creator) on success. Callers should redirect away — completion happens on return.

export async function startSanctuaryTierCheckout(opts: {
  tierId: string; creatorId: string; tierName: string; tierColor?: string;
  monthlyPrice: number; annualPrice?: number; billingCycle?: 'MONTHLY' | 'ANNUAL';
}): Promise<void> {
  await redirectToCheckout('/api/stripe/sanctuary-tier', opts);
}

export async function purchaseSanctuaryUnlock(opts: {
  creatorId: string; itemId: string; itemType: 'CONTENT' | 'POST' | 'CHAT';
  itemTitle?: string; price: number;
}): Promise<void> {
  await redirectToCheckout('/api/stripe/sanctuary-unlock', opts);
}

export async function backSanctuaryCampaign(opts: {
  sanctuaryId: string; creatorId: string; amount: number; campaignTitle?: string;
}): Promise<void> {
  await redirectToCheckout('/api/stripe/sanctuary-pledge', opts);
}

// ── Tier Metadata ─────────────────────────────────────────────────────────────

export const TIER_META = {
  1: {
    price: 4.99,
    platformTake: 1.99,
    creatorShare: 3.00,
    storageGb: 50,
    monthlyPoints: 100,
    transactionDiscount: 10,
    merchDiscount: 10,
    sanctuaryDiscount: 10,
    adBoost: 15,
    label: 'Plajah+ Starter',
    color: '#FF8C00',
    features: [
      'Radio monetization',
      '10% off all platform transactions',
      '10% off Plajah & bound artist merch',
      '100 points / month',
      '10% off bound artist Sanctuary access',
      'Early access to drops & specials',
      '50 GB personal cloud storage',
      'Boosted account promotion',
      'All-access merch store',
    ],
  },
  2: {
    price: 9.99,
    platformTake: 2.99,
    creatorShare: 7.00,
    storageGb: 75,
    monthlyPoints: 300,
    transactionDiscount: 15,
    merchDiscount: 15,
    sanctuaryDiscount: 15,
    adBoost: 30,
    label: 'Plajah+ Pro',
    color: '#6B0099',
    features: [
      'Radio, TV fast channels & Pay-Per-View events',
      '15% off all platform transactions',
      '15% off Plajah & bound artist merch',
      '300 points / month',
      '15% off bound artist Sanctuary access',
      'Early access to drops & specials',
      '75 GB personal cloud storage',
      'Boosted account promotion',
      'All-access merch store',
    ],
  },
  3: {
    price: 14.99,
    platformTake: 3.99,
    creatorShare: 11.00,
    storageGb: 100,
    monthlyPoints: 1000,
    transactionDiscount: 20,
    merchDiscount: 20,
    sanctuaryDiscount: 20,
    adBoost: 50,
    label: 'Plajah+ Elite',
    color: '#D40055',
    features: [
      'Full radio, TV & Pay-Per-View monetization',
      '20% off all platform transactions',
      '20% off Plajah & bound artist merch',
      '1,000 points / month',
      '20% off bound artist Sanctuary access',
      'Early access to drops & specials',
      '100 GB personal cloud storage',
      'Maximum account promotion boost',
      'All-access merch store',
    ],
  },
} as const;
