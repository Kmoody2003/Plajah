import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { BskyAgent } from '@atproto/api';
import fs from 'fs/promises';
import { Readable } from 'stream';
import { readFileSync } from 'fs';

// Load .env.local (development) or .env (production) — no dotenv dependency needed
for (const envFile of ['.env.local', '.env']) {
  try {
    readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    });
    break;
  } catch {}
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple REST fetch for Firebase DB without needing admin SDK initialized
const fetchFirebaseDoc = async (collection: string, id: string) => {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}/${id}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
};

const injectMetaTags = async (html: string, query: any, host: string) => {
   const { type, id, track } = query;
   if (!type || !id) return html;
   
   let collection = '';
   if (type === 'video') collection = 'videos';
   if (type === 'album') collection = 'albums';
   if (type === 'feed') collection = 'global_posts';
   if (!collection) return html;

   const dbData = await fetchFirebaseDoc(collection, id);
   if (!dbData || !dbData.fields) return html;

   let title = '';
   let image = '';
   let desc = '';
   let playerUrl = `https://${host}/embed?type=${type}&id=${id}${track ? `&track=${track}` : ''}`;
   
   if (type === 'video') {
      title = dbData.fields?.title?.stringValue || 'Video';
      image = dbData.fields?.thumbnailUrl?.stringValue || dbData.fields?.coverImageUrl?.stringValue || '';
      desc = dbData.fields?.description?.stringValue || 'Watch this video on Plajah';
   } else if (type === 'album') {
      title = dbData.fields?.title?.stringValue || 'Album';
      const tracksArray = dbData.fields?.tracks?.arrayValue?.values || [];
      const trackObj = tracksArray.find((t: any) => t.mapValue?.fields?.id?.stringValue === track);
      if (trackObj) {
        title = trackObj.mapValue?.fields?.title?.stringValue + ' - ' + title;
      }
      image = dbData.fields?.coverImage?.stringValue || dbData.fields?.coverImageUrl?.stringValue || '';
      desc = dbData.fields?.description?.stringValue || 'Listen on Plajah';
   } else if (type === 'feed') {
      title = `${dbData.fields?.authorName?.stringValue || 'User'} on Plajah`;
      desc = dbData.fields?.content?.stringValue || 'Check out this post';
      image = dbData.fields?.imageUrl?.stringValue || dbData.fields?.videoThumbnail?.stringValue || '';
      // If it's a feed with a video, we can still use player card
      if (!dbData.fields?.videoUrl?.stringValue) {
          playerUrl = ''; // Turn off player card if no video
      }
   }

   let metaTags = `
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${image.replace(/"/g, '&quot;')}" />
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta property="og:image" content="${image.replace(/"/g, '&quot;')}" />
    <meta property="og:url" content="https://${host}/?type=${type}&id=${id}" />
   `;

   if (playerUrl) {
     metaTags += `
    <meta name="twitter:card" content="player" />
    <meta name="twitter:player" content="${playerUrl}" />
    <meta name="twitter:player:width" content="1280" />
    <meta name="twitter:player:height" content="720" />
    <meta property="og:type" content="video.other" />
    <meta property="og:video:url" content="${playerUrl}" />
     `;
   } else {
     metaTags += `<meta name="twitter:card" content="summary_large_image" />`;
   }

   const oEmbedUrl = `https://${host}/oembed?url=${encodeURIComponent(`https://${host}/?type=${type}&id=${id}`)}&format=json`;
   metaTags += `\n    <link rel="alternate" type="application/json+oembed" href="${oEmbedUrl}" title="${(title || 'Plajah').replace(/"/g, '&quot;')}" />`;
   return html.replace('</head>', `${metaTags}\n</head>`);
};


// ── Stripe helpers (shared by all Stripe routes) ─────────────────────────────

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_live_YOUR')) throw new Error('Stripe secret key not configured');
  // Dynamic import so Stripe isn't loaded until first use
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' });
}

// Verify a Firebase ID token using Firebase Auth REST API
async function verifyFirebaseToken(token: string): Promise<string | null> {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    console.error('[Auth] FIREBASE_API_KEY / VITE_FIREBASE_API_KEY env var is not set — all auth will fail');
    return null;
  }
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => res.statusText);
      console.error(`[Auth] Token verification failed: HTTP ${res.status} — ${errBody}`);
      return null;
    }
    const data = await res.json() as any;
    return data.users?.[0]?.localId ?? null;
  } catch (err: any) {
    console.error('[Auth] Token verification error:', err.message);
    return null;
  }
}

async function authMiddleware(req: any, res: any, next: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  const uid = await verifyFirebaseToken(token);
  if (!uid) return res.status(401).json({ error: 'Invalid token' });
  req.uid = uid;
  next();
}

// Firestore REST helper (reuses existing fetchFirebaseDoc pattern)
async function firestoreWrite(collection: string, id: string, data: object) {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}/${id}`;
  // Build Firestore field map
  const fields: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(i => ({ stringValue: String(i) })) } };
    else fields[k] = { stringValue: JSON.stringify(v) };
  }
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function firestoreCreate(collection: string, data: object) {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}`;
  const fields: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(i => ({ stringValue: String(i) })) } };
    else fields[k] = { stringValue: JSON.stringify(v) };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const json = await res.json() as any;
  return json.name?.split('/').pop() ?? null;
}

const TIER_STORAGE: Record<string, number> = { '1': 50, '2': 75, '3': 100 };
const TIER_POINTS: Record<string, number> = { '1': 100, '2': 300, '3': 1000 };

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // ── Stripe Webhook — MUST be raw body BEFORE express.json() ──────────────
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || secret.startsWith('whsec_YOUR')) {
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event: any;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err: any) {
      console.error('Stripe webhook error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const now = Date.now();

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const meta = session.metadata || {};
          const subId = session.subscription;
          const custId = session.customer;
          const mode = session.mode;

          if (mode === 'subscription' && meta.type === 'plajahplus') {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subId);
            const priceId = sub.items.data[0]?.price?.id ?? '';
            const tierMap: Record<string, string> = {
              [process.env.STRIPE_PRICE_TIER1 ?? '']: '1',
              [process.env.STRIPE_PRICE_TIER2 ?? '']: '2',
              [process.env.STRIPE_PRICE_TIER3 ?? '']: '3',
            };
            const tier = tierMap[priceId] ?? '1';

            const docId = `${meta.uid}_${subId}`;
            await firestoreWrite('plajahPlusSubscriptions', docId, {
              id: docId,
              subscriberId: meta.uid,
              stripeSubscriptionId: subId,
              stripeCustomerId: custId,
              tier: parseInt(tier),
              status: 'active',
              isMorph: meta.isMorph === 'true',
              boundCreatorId: meta.boundCreatorId || '',
              morphCreatorIds: meta.morphCreatorIds || '',
              morphMode: meta.morphMode || 'SPLIT',
              currentPeriodEnd: sub.current_period_end * 1000,
              cancelAtPeriodEnd: false,
              storageLimitGb: TIER_STORAGE[tier] ?? 100,
              monthlyPoints: TIER_POINTS[tier] ?? 100,
              createdAt: now,
              updatedAt: now,
            });

            // Grant monthly points
            const userDoc = await fetchFirebaseDoc('users', meta.uid);
            if (userDoc?.fields) {
              const currentPoints = parseInt(userDoc.fields.points?.integerValue ?? '0');
              await firestoreWrite('users', meta.uid, { points: currentPoints + (TIER_POINTS[tier] ?? 100), updatedAt: now });
            }
          }

          if (mode === 'payment' && meta.type === 'adpackage') {
            const packageBoost: Record<string, number> = { BASIC: 1.5, FEATURED: 2.5, PREMIUM: 4.0, MAXIMUM: 6.0 };
            const packageDays: Record<string, number> = { BASIC: 7, FEATURED: 14, PREMIUM: 21, MAXIMUM: 30 };
            const pType = meta.packageType || 'BASIC';
            const expiresAt = now + (packageDays[pType] ?? 7) * 86_400_000;
            await firestoreCreate('adPackages', {
              userId: meta.uid,
              packageType: pType,
              price: parseFloat(meta.price || '4.99'),
              durationDays: packageDays[pType] ?? 7,
              boostMultiplier: packageBoost[pType] ?? 1.5,
              contentId: meta.contentId || '',
              contentType: meta.contentType || '',
              stripePaymentIntentId: session.payment_intent || '',
              isActive: true,
              expiresAt,
              createdAt: now,
            });
          }

          if (mode === 'payment' && meta.type === 'seedraiser_pledge') {
            await firestoreCreate('seedRaiserPledges', {
              campaignId: meta.campaignId,
              backerId: meta.uid,
              backerName: meta.backerName || 'Backer',
              amount: parseFloat(meta.amount || '0'),
              rewardId: meta.rewardId || '',
              stripePaymentIntentId: session.payment_intent || '',
              status: 'COMPLETED',
              isAnonymous: meta.isAnonymous === 'true',
              message: meta.message || '',
              createdAt: now,
            });
            // Update campaign totals via REST — best-effort
          }

          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const snap = await fetch(`https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/ai-studio-5564c944-b75c-4461-bcd3-afa92800323b/documents/plajahPlusSubscriptions?pageSize=5`);
          // Update status in Firestore based on stripeSubscriptionId
          // (full query not available via REST easily — rely on client-side sync)
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          console.log('Subscription cancelled:', sub.id);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          console.warn('Payment failed for subscription:', invoice.subscription);
          break;
        }
      }
    } catch (err: any) {
      console.error('Webhook handler error:', err.message);
    }

    res.json({ received: true });
  });

  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());

  // ── Stripe: Create Subscription Checkout Session ──────────────────────────
  app.post('/api/stripe/create-checkout-session', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const { tier, isMorph, boundCreatorId, morphCreatorIds, morphMode } = req.body;
      const uid: string = req.uid;

      const priceMap: Record<number, string> = {
        1: process.env.STRIPE_PRICE_TIER1 ?? '',
        2: process.env.STRIPE_PRICE_TIER2 ?? '',
        3: process.env.STRIPE_PRICE_TIER3 ?? '',
      };

      const priceId = priceMap[tier as 1|2|3];
      if (!priceId || priceId.startsWith('price_YOUR')) {
        return res.status(400).json({ error: 'Subscription pricing not configured yet. Contact support.' });
      }

      const successUrl = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?subscription=success`;
      const cancelUrl  = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?subscription=cancelled`;

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'plajahplus',
          uid,
          tier: String(tier),
          isMorph: String(!!isMorph),
          boundCreatorId: boundCreatorId ?? '',
          morphCreatorIds: Array.isArray(morphCreatorIds) ? morphCreatorIds.join(',') : '',
          morphMode: morphMode ?? 'SPLIT',
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('/api/stripe/create-checkout-session', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Create Billing Portal Session ─────────────────────────────────
  app.post('/api/stripe/create-portal-session', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { returnUrl } = req.body;

      // Look up customer ID from Firestore
      const subSnap = await fetch(`https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/ai-studio-5564c944-b75c-4461-bcd3-afa92800323b/documents/plajahPlusSubscriptions?pageSize=1`);
      // We'll use the customer ID stored in metadata — but we need to find it.
      // For now, search Stripe for the customer by metadata.uid
      const customers = await stripe.customers.search({ query: `metadata['uid']:'${uid}'`, limit: 1 });
      const customerId = customers.data[0]?.id;
      if (!customerId) return res.status(404).json({ error: 'No subscription found' });

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || 'https://gen-lang-client-0665118474.web.app',
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('/api/stripe/create-portal-session', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Rebind Subscription ($2.99 fee) ───────────────────────────────
  app.post('/api/stripe/rebind-subscription', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { subscriptionId, newCreatorId } = req.body;

      if (!subscriptionId || !newCreatorId) {
        return res.status(400).json({ error: 'subscriptionId and newCreatorId required' });
      }

      const successUrl = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?rebind=success`;
      const cancelUrl  = `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?rebind=cancelled`;

      // Charge $2.99 one-time rebind fee
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'Plajah+ Rebind Fee', description: 'Move your subscription to a new creator' },
            unit_amount: 299, // $2.99
          },
          quantity: 1,
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { type: 'rebind', uid, subscriptionId, newCreatorId },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Purchase Ad Package ───────────────────────────────────────────
  app.post('/api/stripe/purchase-ad-package', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { packageType, contentId, contentType } = req.body;

      const PACKAGES: Record<string, { price: number; label: string; days: number }> = {
        BASIC:    { price: 499,  label: 'Starter Boost (7 days)',   days: 7  },
        FEATURED: { price: 999,  label: 'Featured Boost (14 days)', days: 14 },
        PREMIUM:  { price: 1499, label: 'Premium Blast (21 days)',  days: 21 },
        MAXIMUM:  { price: 2000, label: 'Max Exposure (30 days)',   days: 30 },
      };

      const pkg = PACKAGES[packageType as string];
      if (!pkg) return res.status(400).json({ error: 'Invalid package type' });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Plajah Ad: ${pkg.label}` },
            unit_amount: pkg.price,
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?ad=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?ad=cancelled`,
        metadata: {
          type: 'adpackage',
          uid,
          packageType,
          price: String(pkg.price / 100),
          contentId: contentId ?? '',
          contentType: contentType ?? '',
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Off-Platform Promotion ───────────────────────────────────────
  app.post('/api/stripe/purchase-off-platform', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { tier } = req.body;

      const TIERS: Record<string, { price: number; label: string }> = {
        STANDARD: { price: 4900,  label: 'Off-Platform Standard Promotion' },
        PREMIUM:  { price: 10000, label: 'Off-Platform Premium Promotion (Billboards)' },
      };

      const t = TIERS[tier as string];
      if (!t) return res.status(400).json({ error: 'Invalid tier' });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Plajah: ${t.label}` },
            unit_amount: t.price,
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?offplatform=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?offplatform=cancelled`,
        metadata: { type: 'offplatform', uid, tier, price: String(t.price / 100) },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: SeedRaiser Pledge ─────────────────────────────────────────────
  app.post('/api/stripe/seedraiser-pledge', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { campaignId, amount, rewardId, message, isAnonymous } = req.body;

      if (!campaignId || !amount || amount < 1) {
        return res.status(400).json({ error: 'campaignId and amount (min $1) required' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'Plajah Seed Raiser Pledge' },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?pledge=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?pledge=cancelled`,
        metadata: {
          type: 'seedraiser_pledge',
          uid,
          campaignId,
          amount: String(amount),
          rewardId: rewardId ?? '',
          message: message ?? '',
          isAnonymous: String(!!isAnonymous),
          backerName: '', // will be resolved from user profile
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: Business Order Payment ────────────────────────────────────────
  app.post('/api/stripe/business-order', authMiddleware, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const uid: string = req.uid;
      const { businessId, items } = req.body;

      if (!businessId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'businessId and items required' });
      }

      const lineItems = items.map((item: { name: string; price: number; quantity: number }) => ({
        price_data: {
          currency: 'usd',
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      }));

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        success_url: `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?order=success`,
        cancel_url:  `${req.headers.origin || 'https://gen-lang-client-0665118474.web.app'}/?order=cancelled`,
        metadata: { type: 'business_order', uid, businessId },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Mux Integration ---

  // Shared optimal Mux asset settings — per-title smart encoding, 4K ceiling,
  // MP4 rendition for download/fallback, normalised audio levels.
  const MUX_ASSET_SETTINGS = {
    playback_policy: ['public'] as ['public'],
    encoding_tier: 'smart' as const,         // per-title encoding (better quality, lower bitrate)
    max_resolution_tier: '2160p' as const,   // accept 4K source, transcode down as needed
    mp4_support: 'standard' as const,        // MP4 rendition for compatibility/download
    normalize_audio: true,                   // loudness normalisation (EBU R128)
  };

  async function getMux() {
    const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
    if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) throw new Error('Mux keys not configured');
    const Mux = (await import('@mux/mux-node')).default;
    return new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
  }

  // Poll until Mux asset has a playback ID (fires quickly, often within seconds)
  async function waitForPlaybackId(mux: any, assetId: string): Promise<string | undefined> {
    for (let i = 0; i < 60; i++) {           // up to 4 min (60 × 4 s)
      await new Promise(r => setTimeout(r, 4000));
      try {
        const a = await mux.video.assets.retrieve(assetId);
        if (a.playback_ids?.[0]?.id) return a.playback_ids[0].id;
        if (a.status === 'errored') return undefined;
      } catch { return undefined; }
    }
    return undefined;
  }

  // POST /api/mux/upload — browser gets an upload URL and PUTs directly to Mux
  app.post('/api/mux/upload', async (req, res) => {
    try {
      const mux = await getMux();
      const corsOrigin = req.headers.origin || '*';
      const upload = await mux.video.uploads.create({
        new_asset_settings: MUX_ASSET_SETTINGS,
        cors_origin: corsOrigin,
        timeout: 3600,   // 1-hour window for large files
      });
      res.json({ id: upload.id, url: upload.url });
    } catch (error: any) {
      console.error('[Mux] upload create error:', error.message);
      res.status(500).json({ error: error.message || 'Failed to create Mux upload URL' });
    }
  });

  // GET /api/mux/asset — poll upload status until asset_id is present
  app.get('/api/mux/asset', async (req, res) => {
    try {
      const { uploadId } = req.query;
      if (!uploadId) return res.status(400).json({ error: 'Missing uploadId' });
      const mux = await getMux();
      const upload = await mux.video.uploads.retrieve(uploadId as string);
      res.json({ status: upload.status, assetId: upload.asset_id });
    } catch (error: any) {
      console.error('[Mux] asset retrieve error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/mux/create-asset-from-url — ingest a public URL into Mux
  // Returns playbackId as soon as it's available (usually within a few seconds
  // of the first segments being ready — full transcoding continues in background).
  app.post('/api/mux/create-asset-from-url', express.json(), async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing url' });

      const mux = await getMux();
      const asset = await mux.video.assets.create({
        inputs: [{ url }],
        ...MUX_ASSET_SETTINGS,
      });

      const assetId = asset.id;
      let playbackId: string | undefined = asset.playback_ids?.[0]?.id;
      if (!playbackId) playbackId = await waitForPlaybackId(mux, assetId);

      res.json({ assetId, playbackId });
    } catch (error: any) {
      console.error('[Mux] create-asset-from-url error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/mux/playback', async (req, res) => {
    try {
      const { assetId } = req.query;
      if (!assetId) return res.status(400).json({ error: 'Missing assetId' });

      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }

      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({
        tokenId: MUX_TOKEN_ID,
        tokenSecret: MUX_TOKEN_SECRET,
      });

      const asset = await mux.video.assets.retrieve(assetId as string);
      // Only expose the playback ID once the asset is fully ready — prevents
      // the client from trying to stream a manifest that doesn't exist yet.
      const playbackId = asset.status === 'ready' ? asset.playback_ids?.[0]?.id : undefined;
      res.json({ status: asset.status, playbackId, asset });
    } catch (error: any) {
      console.error('Mux playback error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Mux Live Streaming ---
  app.post('/api/mux/live/create', express.json(), async (req, res) => {
    try {
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }
      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
      const stream = await mux.video.liveStreams.create({
        playback_policy: ['public'],
        new_asset_settings: { playback_policy: ['public'] },
        latency_mode: 'reduced',
        reconnect_window: 60, // 60s reconnect window for dropped SRT/RTMP connections
      });
      const streamKey = stream.stream_key ?? '';
      res.json({
        streamId: stream.id,
        streamKey,
        rtmpUrl: 'rtmps://global-live.mux.com:443/app',
        // SRT ingest — OBS 29+, vMix, Haivision, ffmpeg all support this natively
        srtUrl: `srt://global-live.mux.com:5001?streamid=${streamKey}`,
        playbackId: stream.playback_ids?.[0]?.id ?? null,
      });
    } catch (error: any) {
      console.error('Mux live create error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/mux/live/:streamId', async (req, res) => {
    try {
      const { streamId } = req.params;
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }
      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
      await mux.video.liveStreams.disable(streamId);
      res.json({ ok: true });
    } catch (error: any) {
      console.error('Mux live disable error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/mux/live/:streamId/status', async (req, res) => {
    try {
      const { streamId } = req.params;
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux integration is not configured.' });
      }
      const Mux = (await import('@mux/mux-node')).default;
      const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
      const stream = await mux.video.liveStreams.retrieve(streamId);
      res.json({ status: stream.status, playbackId: stream.playback_ids?.[0]?.id || null });
    } catch (error: any) {
      console.error('Mux live status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Mux Backfill: transcode all existing Firestore videos that lack muxPlaybackId ---
  app.post('/api/mux/backfill-videos', async (req, res) => {
    try {
      const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
      if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
        return res.status(500).json({ error: 'Mux keys not configured' });
      }

      const projectId = 'gen-lang-client-0665118474';
      const dbId      = 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b';
      const baseUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;

      // Fetch all videos from Firestore (paginate if needed — 300 per page)
      const allVideos: Array<{ id: string; url: string }> = [];
      let pageToken: string | undefined;
      do {
        const url = `${baseUrl}/videos?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const snap = await fetch(url);
        if (!snap.ok) {
          console.error(`[Mux Backfill] Firestore fetch failed: ${snap.status} ${snap.statusText}`);
          break;
        }
        const data = await snap.json() as any;
        const docs: any[] = data.documents || [];
        for (const d of docs) {
          const fields = d.fields || {};
          const muxId = fields.muxPlaybackId?.stringValue;
          if (muxId) continue; // already transcoded
          const videoUrl = fields.url?.stringValue;
          if (!videoUrl) continue;
          if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.includes('vimeo.com')) continue;
          const docId = d.name?.split('/').pop();
          if (docId) allVideos.push({ id: docId, url: videoUrl });
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      res.json({ queued: allVideos.length, message: `Starting background transcoding for ${allVideos.length} videos` });

      // Kick off transcoding in background — respond to client first
      const mux = await getMux();

      for (const v of allVideos) {
        (async () => {
          try {
            const asset = await mux.video.assets.create({
              inputs: [{ url: v.url }],
              ...MUX_ASSET_SETTINGS,
            });
            const assetId = asset.id;
            let playbackId = asset.playback_ids?.[0]?.id;
            if (!playbackId) playbackId = await waitForPlaybackId(mux, assetId);

            if (playbackId) {
              const docUrl = `${baseUrl}/videos/${v.id}?updateMask.fieldPaths=muxAssetId&updateMask.fieldPaths=muxPlaybackId`;
              await fetch(docUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fields: {
                    muxAssetId:    { stringValue: assetId },
                    muxPlaybackId: { stringValue: playbackId },
                  },
                }),
              });
              console.log(`[Mux Backfill] ✓ ${v.id} → ${playbackId}`);
            }
          } catch (err: any) {
            console.error(`[Mux Backfill] ✗ ${v.id}:`, err.message);
          }
        })();
      }
    } catch (err: any) {
      console.error('[Mux Backfill] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Decentralized Social Layer (Mastodon + Bluesky + Threads) ─────────────
  // ═══════════════════════════════════════════════════════════════════════════
  // All credential-sensitive operations run server-side.
  // The browser never sees raw access tokens after connecting an account.

  // Lazy-load to keep cold-start fast; these are ESM modules with node:crypto
  const getFediverseAuth = async () => {
    const { decentralizedAuth } = await import('./services/fediverse/auth.js');
    return decentralizedAuth;
  };
  const getBroadcast = async () => {
    const { broadcastToDecentralizedWeb } = await import('./services/fediverse/broadcast.js');
    return broadcastToDecentralizedWeb;
  };

  // ── Mastodon OAuth2 — Step 1: Register app + return authorization URL ───────
  // The clientSecret is kept server-side; only the authUrl is sent to browser.
  app.post('/api/fediverse/mastodon/authorize', express.json(), authMiddleware, async (req: any, res) => {
    const { instanceUrl } = req.body as { instanceUrl?: string };
    if (!instanceUrl?.trim()) return res.status(400).json({ error: 'instanceUrl required' });

    try {
      const auth = await getFediverseAuth();
      const appBase = (process.env.VITE_APP_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const redirectUri = `${appBase}/auth/fediverse/callback`;
      const app = await auth.registerMastodonApp(instanceUrl.trim(), redirectUri);
      const { authUrl, state } = auth.buildMastodonAuthUrl(app, req.uid);
      res.json({ authUrl, state, instanceUrl: app.instanceUrl });
    } catch (err: any) {
      console.error('[Fediverse] Mastodon authorize error:', err);
      res.status(500).json({ error: err.message ?? 'Failed to start Mastodon OAuth' });
    }
  });

  // ── Mastodon OAuth2 — Callback (popup closer) ───────────────────────────────
  // Mastodon redirects here after user authorizes. The popup sends code+state
  // back to the opener via postMessage, then closes itself.
  app.get('/auth/fediverse/callback', (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Plajah — Connecting…</title>
<style>
  body { margin: 0; background: #0a0a0f; color: #fff; font-family: system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { text-align: center; padding: 40px; max-width: 360px; }
  .logo { font-size: 28px; font-weight: 900; letter-spacing: -1px; margin-bottom: 16px; }
  .status { font-size: 14px; color: rgba(255,255,255,0.5); }
</style>
</head>
<body>
<div class="card">
  <div class="logo">Plajah</div>
  <p class="status" id="s">Synchronizing…</p>
</div>
<script>
  (function() {
    const code = ${JSON.stringify(code ?? null)};
    const state = ${JSON.stringify(state ?? null)};
    const err = ${JSON.stringify(error ?? null)};
    const msg = err
      ? { type: 'FEDIVERSE_AUTH_ERROR', error: err }
      : { type: 'FEDIVERSE_AUTH_SUCCESS', code, state };
    if (window.opener) {
      window.opener.postMessage(msg, window.location.origin);
      document.getElementById('s').textContent = 'Connected! Closing…';
      setTimeout(() => window.close(), 600);
    } else {
      document.getElementById('s').textContent = 'No opener found. Please close this window.';
    }
  })();
</script>
</body>
</html>`);
  });

  // ── Mastodon OAuth2 — Step 2: Exchange code, verify, save account ───────────
  app.post('/api/fediverse/mastodon/connect', express.json(), authMiddleware, async (req: any, res) => {
    const { code, state, instanceUrl } = req.body as {
      code?: string; state?: string; instanceUrl?: string;
    };
    if (!code || !state || !instanceUrl) {
      return res.status(400).json({ error: 'code, state, and instanceUrl are required' });
    }

    try {
      const auth = await getFediverseAuth();

      // Decrypt and validate state token (stateless — no server-side Map needed)
      const pending = auth.consumeOAuthState(state);
      if (!pending) {
        return res.status(400).json({ error: 'Invalid or expired OAuth state — restart the flow' });
      }
      if (pending.uid !== req.uid) {
        return res.status(403).json({ error: 'State mismatch — potential CSRF' });
      }

      // Use redirect URI and client credentials from the encrypted state token
      const creds = await auth.exchangeMastodonCode(
        pending.instanceUrl,
        code,
        pending.redirectUri,
        pending.clientId,
        pending.clientSecret,
      );

      const firebaseToken = (req.headers.authorization as string).slice(7);
      const account = await auth.buildAndSaveAccount(req.uid, 'mastodon', creds, firebaseToken);
      res.json({ account });
    } catch (err: any) {
      console.error('[Fediverse] Mastodon connect error:', err);
      res.status(500).json({ error: err.message ?? 'Mastodon connection failed' });
    }
  });

  // ── Public status — no auth, safe to expose, used for deployment verification ─
  app.get('/api/status', (_req, res) => {
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const firebaseApiKey = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    res.json({
      ok: true,
      encryption_key_set: encKey.length >= 16,
      firebase_api_key_set: firebaseApiKey.length > 0,
      app_url: process.env.VITE_APP_URL ?? '(not set)',
      node_env: process.env.NODE_ENV ?? '(not set)',
    });
  });

  // ── Fediverse diagnostics — check every config requirement ────────────────
  app.get('/api/fediverse/diagnostics', authMiddleware, async (req: any, res) => {
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const firebaseApiKey = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    const checks: Record<string, unknown> = {
      uid: req.uid,
      encryption_key_set: encKey.length >= 16,
      encryption_key_length: encKey.length,
      firebase_api_key_set: firebaseApiKey.length > 0,
      vite_app_url: process.env.VITE_APP_URL ?? '(not set)',
      node_env: process.env.NODE_ENV ?? '(not set)',
    };
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      checks.firestore_read = 'ok';
      checks.accounts_count = accounts.length;
    } catch (err: any) {
      checks.firestore_read = 'FAILED';
      checks.firestore_error = err.message;
    }
    res.json(checks);
  });

  // ── Bluesky — Create session from handle + App Password ────────────────────
  // App Password never leaves the server. Browser receives only account metadata.
  app.post('/api/fediverse/bluesky/connect', express.json(), authMiddleware, async (req: any, res) => {
    const { handle, appPassword } = req.body as { handle?: string; appPassword?: string };
    if (!handle?.trim() || !appPassword?.trim()) {
      return res.status(400).json({ error: 'handle and appPassword are required' });
    }

    // Gate early so the error is unambiguous
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    if (encKey.length < 16) {
      return res.status(500).json({ error: 'Server misconfiguration: ENCRYPTION_KEY env var is not set in Cloud Run' });
    }

    try {
      const auth = await getFediverseAuth();

      let creds;
      try {
        creds = await auth.createBlueskySession(handle.trim(), appPassword.trim());
      } catch (err: any) {
        console.error('[Fediverse] Bluesky session error:', err);
        return res.status(401).json({ error: `Bluesky login failed: ${err.message}` });
      }

      const firebaseToken = (req.headers.authorization as string).slice(7);
      try {
        const account = await auth.buildAndSaveAccount(req.uid, 'bluesky', creds, firebaseToken);
        res.json({ account });
      } catch (err: any) {
        console.error('[Fediverse] Bluesky save error:', err);
        res.status(500).json({ error: `Account save failed: ${err.message}` });
      }
    } catch (err: any) {
      console.error('[Fediverse] Bluesky connect error:', err);
      res.status(500).json({ error: err.message ?? 'Bluesky connection failed' });
    }
  });

  // ── Disconnect an account ───────────────────────────────────────────────────
  app.delete('/api/fediverse/accounts/:accountId', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      await auth.removeAccount(req.uid, req.params.accountId, firebaseToken);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Failed to disconnect account' });
    }
  });

  // ── Unified Broadcast — post to all active networks simultaneously ──────────
  app.post('/api/fediverse/broadcast', express.json(), authMiddleware, async (req: any, res) => {
    const { text, uri, title, description, thumbnail, langs, targetAccountIds } = req.body as {
      text?: string;
      uri?: string;
      title?: string;
      description?: string;
      thumbnail?: string;
      langs?: string[];
      targetAccountIds?: string[];
    };

    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    try {
      const auth = await getFediverseAuth();
      const broadcast = await getBroadcast();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);

      if (!accounts.length) {
        return res.status(400).json({ error: 'No connected fediverse accounts' });
      }

      const result = await broadcast(accounts, { text, uri, title, description, thumbnail, langs }, targetAccountIds);
      res.json(result);
    } catch (err: any) {
      console.error('[Fediverse] Broadcast error:', err);
      res.status(500).json({ error: err.message ?? 'Broadcast failed' });
    }
  });

  // ── Unified Timeline ────────────────────────────────────────────────────────
  app.get('/api/fediverse/timeline', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);

      const { getUnifiedTimeline } = await import('./services/fediverse/service.js');
      const result = await getUnifiedTimeline(accounts);
      res.json(result);
    } catch (err: any) {
      console.error('[Fediverse] Timeline error:', err);
      res.status(500).json({ error: err.message ?? 'Timeline fetch failed' });
    }
  });

  // ── List connected accounts (metadata only, no credentials) ─────────────────
  app.get('/api/fediverse/accounts', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const safe = accounts.map(({ credentials: _creds, ...meta }) => meta);
      res.json({ accounts: safe });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Failed to load accounts' });
    }
  });

  // ── Per-post actions (like, unlike, repost, unrepost, reply) ────────────────
  app.post('/api/fediverse/posts/action', express.json(), authMiddleware, async (req: any, res) => {
    const { action, post, accountId } = req.body as {
      action: 'like' | 'unlike' | 'repost' | 'unrepost';
      post: import('./services/fediverse/types.js').FediversePost;
      accountId: string;
    };

    if (!action || !post || !accountId) {
      return res.status(400).json({ error: 'action, post, and accountId are required' });
    }

    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const account = await auth.loadAccount(req.uid, accountId, firebaseToken);
      if (!account) return res.status(404).json({ error: 'Account not found' });

      const { ADAPTERS_MAP } = await import('./services/fediverse/service.js');
      const adapter = ADAPTERS_MAP[account.protocol];

      let result: Partial<import('./services/fediverse/types.js').FediversePost> = {};
      switch (action) {
        case 'like':   result = await adapter.likePost(account.credentials, post);   break;
        case 'unlike': await adapter.unlikePost(account.credentials, post);          break;
        case 'repost': result = await adapter.repost(account.credentials, post);     break;
        case 'unrepost': await adapter.unrepost(account.credentials, post);          break;
        default: return res.status(400).json({ error: `Unknown action: ${action}` });
      }
      res.json({ success: true, update: result });
    } catch (err: any) {
      console.error('[Fediverse] Action error:', err);
      res.status(500).json({ error: err.message ?? 'Action failed' });
    }
  });

  // ── Legacy compat — keep old callback path working ──────────────────────────
  app.get('/auth/mastodon/callback', (req, res) => {
    res.redirect(`/auth/fediverse/callback?${new URLSearchParams(req.query as Record<string, string>)}`);
  });

  // ── Fediverse proxy (CORS bypass for remote instance lookups) ────────────────
  app.get('/api/social/fediverse/proxy', async (req: any, res: any) => {
    const { instance, path: apiPath, token } = req.query as Record<string, string>;
    if (!instance || !apiPath) return res.status(400).json({ error: 'instance and path required' });

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`https://${instance}${apiPath}`, { headers });
      if (!response.ok) {
        return res.status(response.status).json({ error: response.statusText });
      }
      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        return res.status(502).json({ error: 'Non-JSON response from instance' });
      }
      res.json(await response.json());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Legacy direct-post shims (kept for back-compat) ─────────────────────────
  app.post('/api/social/mastodon/post', express.json(), async (req, res) => {
    const { instance, token, status, inReplyToId } = req.body as Record<string, string>;
    try {
      const r = await fetch(`https://${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, in_reply_to_id: inReplyToId, visibility: 'public' }),
      });
      res.status(r.status).json(await r.json());
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/social/bluesky/post', express.json(), async (req, res) => {
    const { session, text, reply } = req.body as Record<string, unknown>;
    try {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      await agent.resumeSession(session as any);
      const post = await agent.post({ text: text as string, reply: reply as any, createdAt: new Date().toISOString() });
      res.json(post);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Legacy Bluesky login shim ────────────────────────────────────────────────
  app.post('/api/auth/bluesky/login', express.json(), async (req, res) => {
    const { identifier, password } = req.body as { identifier: string; password: string };
    try {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      const r = await agent.login({ identifier, password });
      res.json({ session: r.data });
    } catch { res.status(401).json({ error: 'Bluesky login failed' }); }
  });

  // --- Generic Proxy for external assets (CORS bypass and streaming support) ---
  app.get('/api/proxy', async (req: any, res: any) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const controller = new AbortController();
    req.on('close', () => {
      controller.abort();
    });

    try {
      const decodedUrl = decodeURIComponent(url as string);
      const range = req.headers.range;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      };

      if (range) {
        headers['Range'] = range;
      }

      console.log(`[Proxy] ${range ? 'Streaming' : 'Fetching'} (${range || 'full'}): ${decodedUrl}`);
      
      const response = await fetch(decodedUrl, { 
        headers,
        redirect: 'follow',
        signal: controller.signal
      });
      
      if (!response.ok && response.status !== 206) {
        console.error(`[Proxy] Upstream Error: ${response.status} ${response.statusText} for ${decodedUrl}`);
        return res.status(response.status).send(response.statusText);
      }

      // Forward headers
      const contentRange = response.headers.get('content-range');
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const acceptRanges = response.headers.get('accept-ranges');

      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges || 'bytes');
      
      // If the upstream responded with Partial Content (206)
      if (response.status === 206) {
        res.status(206);
      }

      // Robust streaming using Readable.fromWeb
      if (response.body) {
        try {
          // @ts-ignore - Web readable stream to Node stream conversion
          const nodeReadable = Readable.fromWeb(response.body);
          nodeReadable.pipe(res);
          
          res.on('close', () => {
             nodeReadable.destroy();
          });
        } catch (streamError) {
          console.error('[Proxy] Stream construction failed, falling back to manual push:', streamError);
          // Manual fallback if fromWeb is not available or fails
          const reader = response.body.getReader();
          const push = async () => {
            try {
              const { done, value } = await reader.read();
              if (done) {
                if (!res.writableEnded) res.end();
                return;
              }
              if (!res.writableEnded) {
                res.write(Buffer.from(value));
                push();
              }
            } catch (readError) {
              console.error('[Proxy] Read error:', readError);
              if (!res.writableEnded) res.end();
            }
          };
          push();
        }
      } else {
        res.end();
      }
    } catch (error: any) {
      console.error('Proxy Total Failure:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to proxy request: ' + error.message });
      }
    }
  });

  // Fediverse Proxy (to avoid CORS and handle remote lookups)
  app.get('/api/social/fediverse/proxy', async (req: any, res: any) => {
    const { instance, path: apiPath, token } = req.query;
    if (!instance || !apiPath) return res.status(400).json({ error: 'Instance and Path required' });

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = `https://${instance}${apiPath}`;
      console.log(`[MeshProxy] Intercepting: ${url}`);
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.error(`[MeshProxy] Remote Error: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ 
          error: `Fediverse API error: ${response.statusText}`,
          status: response.status 
        });
      }

      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        console.error(`[MeshProxy] Non-JSON Response: ${contentType}`);
        const text = await response.text();
        console.error(`[MeshProxy] Raw Content Sample: ${text.substring(0, 100)}`);
        return res.status(502).json({ error: 'Remote instance returned non-JSON data' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('Fediverse Proxy Error:', error);
      res.status(500).json({ error: 'Failed to proxy Fediverse request: ' + error.message });
    }
  });

  // Mastodon Post/Reply
  app.post('/api/social/mastodon/post', async (req, res) => {
    const { instance, token, status, inReplyToId } = req.body;
    try {
      const response = await fetch(`https://${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status,
          in_reply_to_id: inReplyToId,
          visibility: 'public'
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // Bluesky Post/Reply
  app.post('/api/social/bluesky/post', async (req, res) => {
    const { session, text, reply } = req.body;
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    
    try {
      await agent.resumeSession(session);
      const post = await agent.post({
        text,
        reply,
        createdAt: new Date().toISOString()
      });
      res.json(post);
    } catch (error) {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // --- Partner Site Browser Proxy ---
  // Fetches an external URL server-side and strips X-Frame-Options / CSP frame-ancestors
  // so the content can be rendered inside a Plajah iframe panel.
  app.get('/api/browse', async (req: any, res: any) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    let targetUrl: string;
    try {
      targetUrl = decodeURIComponent(url as string);
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).send('Only http/https URLs are supported');
      }
    } catch {
      return res.status(400).send('Invalid URL');
    }

    try {
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'follow',
      });

      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      res.setHeader('Content-Type', contentType);
      // Strip iframe-blocking headers — intentionally NOT forwarding X-Frame-Options or CSP

      if (contentType.includes('text/html')) {
        let html = await upstream.text();
        // Inject <base> tag so relative URLs resolve against the original origin
        const origin = new URL(targetUrl).origin;
        const baseTag = `<base href="${origin}/">`;
        if (/<head(\s[^>]*)?>/.test(html)) {
          html = html.replace(/<head(\s[^>]*)?>/, (m) => `${m}${baseTag}`);
        } else {
          html = baseTag + html;
        }
        return res.send(html);
      }

      // Non-HTML: stream directly (CSS, JS, images, etc.)
      if (upstream.body) {
        try {
          // @ts-ignore
          const nodeReadable = Readable.fromWeb(upstream.body);
          nodeReadable.pipe(res);
          res.on('close', () => nodeReadable.destroy());
        } catch {
          const buf = await upstream.arrayBuffer();
          res.end(Buffer.from(buf));
        }
      } else {
        res.end();
      }
    } catch (error: any) {
      console.error('[BrowseProxy] Error:', error.message);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(502).send(`<!DOCTYPE html><html><body style="font-family:system-ui;background:#0a0a0a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;gap:12px;"><h2 style="margin:0">Could not load page</h2><p style="color:#666;margin:0">${error.message}</p></body></html>`);
      }
    }
  });

  // --- Embed & Meta tag Middleware ---

  // Push notification send endpoint — called by the client after creating a Firestore notification
  app.post('/api/push', express.json(), async (req, res) => {
    const { token, tokens, title, body, link, icon } = req.body || {};
    const serverKey = process.env.FCM_SERVER_KEY;
    if (!serverKey) return res.status(503).json({ error: 'FCM not configured — set FCM_SERVER_KEY in environment' });

    const targets: string[] = tokens || (token ? [token] : []);
    if (!targets.length) return res.status(400).json({ error: 'No FCM token provided' });

    const payload = {
      registration_ids: targets,
      notification: {
        title: title || 'Plajah',
        body: body || '',
        icon: icon || 'https://plajah.com/icons/icon-192.png',
        click_action: link || 'https://plajah.com',
      },
      data: { link: link || '/' },
    };

    try {
      const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: { 'Authorization': `key=${serverKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      res.json(await fcmRes.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Philips Hue OAuth ─────────────────────────────────────────────────────
  // Step 1: redirect user to Hue login page
  app.get('/api/hue/auth', (req: any, res: any) => {
    const clientId  = process.env.HUE_CLIENT_ID;
    const redirectUri = process.env.HUE_REDIRECT_URI;
    if (!clientId || !redirectUri) return res.status(500).send('HUE_CLIENT_ID / HUE_REDIRECT_URI not configured');
    const state = Math.random().toString(36).slice(2);
    const url = new URL('https://api.meethue.com/oauth2/auth');
    url.searchParams.set('clientid', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('appid', clientId);
    url.searchParams.set('deviceid', 'plajah-server');
    url.searchParams.set('devicename', 'Plajah');
    res.redirect(url.toString());
  });

  // Step 2: Hue redirects back here with ?code=… — exchange for access token
  app.get('/api/hue/callback', async (req: any, res: any) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');
    const clientId     = process.env.HUE_CLIENT_ID!;
    const clientSecret = process.env.HUE_CLIENT_SECRET!;
    const redirectUri  = process.env.HUE_REDIRECT_URI!;
    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://api.meethue.com/oauth2/token', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: String(code), grant_type: 'authorization_code', redirect_uri: redirectUri }).toString(),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return res.status(502).send(`Hue token error: ${err}`);
      }
      const { access_token, refresh_token } = await tokenRes.json() as any;
      // Return a tiny page that posts the token back to the opener and closes itself
      res.send(`<!DOCTYPE html><html><body><script>
        try { window.opener.postMessage({ type:'hue-auth', accessToken:${JSON.stringify(access_token)}, refreshToken:${JSON.stringify(refresh_token)} }, '*'); }
        catch(e) {}
        window.close();
      </script><p>Hue connected! You can close this window.</p></body></html>`);
    } catch (e: any) {
      res.status(500).send(`OAuth error: ${e.message}`);
    }
  });

  // ── Smart Lighting Proxy ──────────────────────────────────────────────────
  // Forwards requests to cloud light APIs (Hue Remote, Govee) and local devices.
  // The body is wrapped: { targetMethod, body } so we can use POST for all verbs.
  app.post('/api/lights/proxy', express.json(), async (req: any, res: any) => {
    const { url: targetUrl, goveeKey, hueToken, method: qMethod } = req.query;
    if (!targetUrl) return res.status(400).json({ error: 'url required' });
    const method = (req.body?.targetMethod || qMethod || 'GET').toUpperCase();
    const bodyPayload = req.body?.body;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (goveeKey) headers['Govee-API-Key'] = goveeKey as string;
    if (hueToken) headers['Authorization'] = `Bearer ${hueToken}`;
    try {
      const upstream = await fetch(decodeURIComponent(targetUrl as string), {
        method,
        headers,
        body: bodyPayload && method !== 'GET' ? JSON.stringify(bodyPayload) : undefined,
      });
      const data = await upstream.json().catch(() => null);
      res.status(upstream.status).json(data ?? {});
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Also accept GET for read-only calls
  app.get('/api/lights/proxy', express.json(), async (req: any, res: any) => {
    const { url: targetUrl, goveeKey, hueToken } = req.query;
    if (!targetUrl) return res.status(400).json({ error: 'url required' });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (goveeKey) headers['Govee-API-Key'] = goveeKey as string;
    if (hueToken) headers['Authorization'] = `Bearer ${hueToken}`;
    try {
      const upstream = await fetch(decodeURIComponent(targetUrl as string), { headers });
      const data = await upstream.json().catch(() => null);
      res.status(upstream.status).json(data ?? {});
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Alexa Skill Webhook ────────────────────────────────────────────────────
  // Point your Alexa custom skill endpoint at /api/alexa (HTTPS required).
  // Skill intents: PlayArtistIntent (slot: artist), PlayAlbumIntent (slot: album),
  // plus built-in AMAZON.PauseIntent / AMAZON.ResumeIntent / AMAZON.StopIntent.
  app.post('/api/alexa', express.json(), async (req: any, res: any) => {
    const { request, context } = req.body || {};
    if (!request) return res.status(400).json({ error: 'Invalid Alexa request' });

    const reply = (text: string, end = false, directive?: object) => {
      const r: any = { version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: end } };
      if (directive) r.response.directives = [directive];
      res.json(r);
    };
    const audioPlay = (url: string, token: string, offset = 0) => ({
      type: 'AudioPlayer.Play', playBehavior: 'REPLACE_ALL',
      audioItem: { stream: { url, token, offsetInMilliseconds: offset } },
    });

    try {
      if (request.type === 'LaunchRequest') {
        return reply("Welcome to Plajah. Ask me to play an artist, album, or radio station.");
      }
      if (request.type === 'SessionEndedRequest') return res.json({ version: '1.0', response: {} });

      if (request.type === 'IntentRequest') {
        const { name, slots = {} } = request.intent;
        switch (name) {
          case 'PlayArtistIntent': {
            const artist = slots.artist?.value || '';
            if (!artist) return reply("Which artist would you like to hear?");
            return reply(`Playing ${artist} on Plajah.`, true,
              audioPlay(`https://plajah.com/api/alexa/stream?artist=${encodeURIComponent(artist)}`, `artist:${artist}`));
          }
          case 'PlayAlbumIntent': {
            const album = slots.album?.value || '';
            if (!album) return reply("Which album would you like?");
            return reply(`Playing ${album} on Plajah.`, true,
              audioPlay(`https://plajah.com/api/alexa/stream?album=${encodeURIComponent(album)}`, `album:${album}`));
          }
          case 'PlayRadioIntent': {
            const station = slots.station?.value || 'top tracks';
            return reply(`Playing ${station} radio on Plajah.`, true,
              audioPlay(`https://plajah.com/api/alexa/stream?radio=${encodeURIComponent(station)}`, `radio:${station}`));
          }
          case 'AMAZON.PauseIntent':  return reply('', true, { type: 'AudioPlayer.Stop' });
          case 'AMAZON.StopIntent':   return reply('Goodbye from Plajah.', true, { type: 'AudioPlayer.Stop' });
          case 'AMAZON.ResumeIntent': {
            const token = context?.AudioPlayer?.token || '';
            const offset = context?.AudioPlayer?.offsetInMilliseconds || 0;
            return reply('', false, audioPlay(`https://plajah.com/api/alexa/stream?token=${encodeURIComponent(token)}`, token, offset));
          }
          default: return reply("I didn't catch that. Try asking Plajah to play an artist or album.");
        }
      }
      res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: 'Something went wrong.' }, shouldEndSession: true } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Alexa stream resolver — looks up Firestore to find a track URL by artist/album
  app.get('/api/alexa/stream', async (req: any, res: any) => {
    const { artist, album } = req.query;
    // Search Firestore for matching album/artist
    const projectId = 'gen-lang-client-0665118474';
    const dbId = 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b';
    try {
      const searchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const field = album ? 'title' : 'artist';
      const value = String(album || artist || '');
      const body = { structuredQuery: { from: [{ collectionId: 'albums' }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }, limit: 1 } };
      const r = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const results = await r.json();
      const doc = Array.isArray(results) ? results.find((d: any) => d.document) : null;
      const tracks = doc?.document?.fields?.tracks?.arrayValue?.values || [];
      const firstTrackUrl = tracks[0]?.mapValue?.fields?.url?.stringValue;
      if (firstTrackUrl) {
        res.redirect(302, firstTrackUrl);
      } else {
        res.status(404).json({ error: 'Track not found' });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Google Home / Assistant Webhook ───────────────────────────────────────
  // Point your Dialogflow / Actions on Google webhook at /api/google-home.
  // Intents to create: PlayArtist, PlayAlbum, PlayRadio, Pause, Default Fallback.
  app.post('/api/google-home', express.json(), async (req: any, res: any) => {
    const { queryResult } = req.body || {};
    if (!queryResult) return res.status(400).json({ error: 'Invalid webhook' });

    const intent = queryResult.intent?.displayName || '';
    const params = queryResult.parameters || {};

    const reply = (text: string, ssml?: string) => res.json({
      fulfillmentText: text,
      fulfillmentMessages: [{ text: { text: [text] } }],
      ...(ssml ? { payload: { google: { expectUserResponse: false, richResponse: { items: [{ simpleResponse: { ssml } }] } } } } : {}),
    });

    try {
      if (intent === 'PlayArtist' || intent === 'play artist') {
        const artist = params.artist || params['music-artist'] || '';
        if (!artist) return reply("Which artist would you like on Plajah?");
        return reply(`Playing ${artist} on Plajah.`, `<speak>Starting ${artist} on Plajah right now.</speak>`);
      }
      if (intent === 'PlayAlbum' || intent === 'play album') {
        const album = params.album || params['music-album'] || '';
        if (!album) return reply("Which album would you like?");
        return reply(`Playing ${album} on Plajah.`, `<speak>Playing ${album} on Plajah.</speak>`);
      }
      if (intent === 'PlayRadio' || intent === 'play radio') {
        const station = params.station || 'top tracks';
        return reply(`Playing ${station} radio on Plajah.`);
      }
      if (intent === 'Pause') return reply('Pausing Plajah.');
      if (intent === 'Resume') return reply('Resuming Plajah.');
      reply("You can ask me to play an artist, album, or radio station on Plajah.");
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // oEmbed endpoint — lets Slack, Notion, Mastodon, and other rich-preview platforms embed Plajah links
  app.get('/oembed', async (req, res) => {
    const { url: pageUrl, format = 'json' } = req.query as any;
    if (!pageUrl) return res.status(400).json({ error: 'url required' });

    let type = '', id = '', track = '';
    try {
      const parsed = new URL(pageUrl);
      type = parsed.searchParams.get('type') || '';
      id = parsed.searchParams.get('id') || '';
      track = parsed.searchParams.get('track') || '';
    } catch { return res.status(400).json({ error: 'invalid url' }); }

    if (!type || !id) return res.status(404).json({ error: 'not found' });

    let collection = type === 'video' ? 'videos' : type === 'album' ? 'albums' : '';
    if (!collection) return res.status(404).json({ error: 'not found' });

    const dbData = await fetchFirebaseDoc(collection, id);
    if (!dbData?.fields) return res.status(404).json({ error: 'not found' });

    const host = req.get('host') || 'plajah.com';
    const title = dbData.fields?.title?.stringValue || 'Plajah';
    const cover = dbData.fields?.coverImage?.stringValue || dbData.fields?.coverImageUrl?.stringValue || dbData.fields?.thumbnailUrl?.stringValue || '';
    const embedUrl = `https://${host}/embed?type=${type}&id=${id}${track ? `&track=${track}` : ''}`;

    const response = {
      version: '1.0',
      type: type === 'album' ? 'rich' : 'video',
      title,
      provider_name: 'Plajah',
      provider_url: `https://${host}`,
      thumbnail_url: cover,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      html: `<iframe src="${embedUrl}" width="560" height="315" style="border:none;border-radius:12px;" allow="autoplay; encrypted-media" allowfullscreen></iframe>`,
      width: 560,
      height: 315,
    };

    if (format === 'xml') {
      res.set('Content-Type', 'text/xml');
      return res.send(`<?xml version="1.0" encoding="utf-8"?><oembed>${Object.entries(response).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</oembed>`);
    }
    res.json(response);
  });

  app.get('/embed', async (req, res) => {
    const { type, id, track } = req.query;
    if (!type || !id) return res.status(404).send('Not Found');

    let collection = '';
    if (type === 'video') collection = 'videos';
    if (type === 'album') collection = 'albums';
    if (type === 'feed') collection = 'global_posts';
    
    if (!collection) return res.status(404).send('Not Found');

    const dbData = await fetchFirebaseDoc(collection, id as string);
    if (!dbData || !dbData.fields) return res.status(404).send('Not Found');

    let mediaUrl = '';
    let title = '';
    let cover = '';
    let isYoutube = false;

    if (type === 'video') {
      mediaUrl = dbData.fields?.url?.stringValue || dbData.fields?.embedUrl?.stringValue || '';
      title = dbData.fields?.title?.stringValue || 'Video';
      cover = dbData.fields?.coverImageUrl?.stringValue || dbData.fields?.thumbnailUrl?.stringValue || '';
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) isYoutube = true;
    } else if (type === 'album') {
      const tracksArray = dbData.fields?.tracks?.arrayValue?.values || [];
      const trackObj = tracksArray.find((t: any) => t.mapValue?.fields?.id?.stringValue === track);
      if (trackObj) {
        mediaUrl = trackObj.mapValue?.fields?.url?.stringValue || '';
        title = trackObj.mapValue?.fields?.title?.stringValue || 'Track';
      }
      cover = dbData.fields?.coverImage?.stringValue || dbData.fields?.coverImageUrl?.stringValue || '';
      if (!title || title === 'Track') title = (dbData.fields?.title?.stringValue || 'Album') + (title && title !== 'Track' ? ' — ' + title : '');
    } else if (type === 'feed') {
      mediaUrl = dbData.fields?.videoUrl?.stringValue || '';
      title = 'Video Post';
      cover = dbData.fields?.videoThumbnail?.stringValue || dbData.fields?.imageUrl?.stringValue || '';
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) isYoutube = true;
    }

    if (!mediaUrl) return res.status(404).send('No Media Found');

    let playerHtml = '';
    if (isYoutube) {
        let embedLink = mediaUrl;
        const vMatch = mediaUrl.match(/[?&]v=([^&#]*)/);
        if (vMatch && vMatch[1]) {
            embedLink = `https://www.youtube.com/embed/${vMatch[1]}`;
        } else if (mediaUrl.includes('youtu.be/')) {
            const shortId = mediaUrl.split('youtu.be/')[1].split('?')[0];
            embedLink = `https://www.youtube.com/embed/${shortId}`;
        }
        playerHtml = `<iframe src="${embedLink}" width="100%" height="100%" style="border:none" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else if (mediaUrl.endsWith('.mp4') || mediaUrl.includes('/videos%2F') || type === 'video' || type === 'feed') {
        playerHtml = `<video src="${mediaUrl}" controls width="100%" height="100%" style="background:black" poster="${cover}"></video>`;
    } else {
        playerHtml = `
        <div style="position:relative;background:#0a0a0a;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;">
          ${cover ? `<img src="${cover}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.25;filter:blur(40px);transform:scale(1.1);" />` : ''}
          <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.9) 0%,rgba(0,0,0,0.5) 60%,rgba(0,0,0,0.3) 100%);"></div>
          <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px;width:100%;max-width:480px;box-sizing:border-box;">
            ${cover ? `<img src="${cover}" style="width:140px;height:140px;border-radius:16px;object-fit:cover;box-shadow:0 20px 60px rgba(0,0,0,0.6);" />` : ''}
            <div style="text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#ff8c00;">Now Playing on Plajah</p>
              <h3 style="margin:0;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:-0.5px;">${title}</h3>
            </div>
            <audio src="${mediaUrl}" controls autoplay style="width:100%;accent-color:#ff8c00;"></audio>
          </div>
        </div>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
        <style>body,html{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:black;}</style>
      </head>
      <body>
        ${playerHtml}
      </body>
      </html>
    `);
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      // Just intercept root and add meta tags if type is present
      if (req.path === '/' && req.query.type) {
        try {
          const rawHtml = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
          const finalHtml = await injectMetaTags(rawHtml, req.query, req.get('host') || 'localhost');
          const viteTransformed = await vite.transformIndexHtml(req.originalUrl, finalHtml);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(viteTransformed);
        } catch(e) {
          return next();
        }
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    // In production, we don't want to serve index.html via express.static by default
    // so we configure it to not serve 'index' to let the fallback handle it
    app.use(express.static(path.join(__dirname, 'dist'), { index: false }));
    app.get('*all', async (req, res) => {
      try {
        let html = await fs.readFile(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
        if (req.query.type) {
           html = await injectMetaTags(html, req.query, req.get('host') || 'localhost');
        }
        res.send(html);
      } catch (e) {
        res.status(500).send('Server Error');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mesh Server running on http://localhost:${PORT}`);
    // Log env var status at startup so Cloud Run logs reveal config issues immediately
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const fbKey  = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    console.log('[Config] ENCRYPTION_KEY:', encKey.length >= 16 ? `set (${encKey.length} chars)` : 'MISSING');
    console.log('[Config] FIREBASE_API_KEY:', fbKey.length > 0 ? 'set' : 'MISSING');
    console.log('[Config] VITE_APP_URL:', process.env.VITE_APP_URL ?? '(not set)');
  });
}

startServer();
