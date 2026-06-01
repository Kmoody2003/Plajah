import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

   const safeTitle = htmlEscape(title);
   const safeDesc  = htmlEscape(desc);
   const safeImage = htmlEscape(image);
   const safeHost  = htmlEscape(host);
   const safeType  = htmlEscape(String(type));
   const safeId    = htmlEscape(String(id));

   let metaTags = `
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:url" content="https://${safeHost}/?type=${safeType}&amp;id=${safeId}" />
   `;

   if (playerUrl) {
     const safePlayerUrl = htmlEscape(playerUrl);
     metaTags += `
    <meta name="twitter:card" content="player" />
    <meta name="twitter:player" content="${safePlayerUrl}" />
    <meta name="twitter:player:width" content="1280" />
    <meta name="twitter:player:height" content="720" />
    <meta property="og:type" content="video.other" />
    <meta property="og:video:url" content="${safePlayerUrl}" />
     `;
   } else {
     metaTags += `<meta name="twitter:card" content="summary_large_image" />`;
   }

   const oEmbedUrl = `https://${safeHost}/oembed?url=${encodeURIComponent(`https://${host}/?type=${type}&id=${id}`)}&format=json`;
   metaTags += `\n    <link rel="alternate" type="application/json+oembed" href="${htmlEscape(oEmbedUrl)}" title="${safeTitle || 'Plajah'}" />`;
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

// ── Security helpers ──────────────────────────────────────────────────────────

function htmlEscape(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function xmlEscape(str: string): string {
  return htmlEscape(str);
}

function safeYouTubeEmbedUrl(mediaUrl: string): string | null {
  let id = '';
  const vMatch = mediaUrl.match(/[?&]v=([^&#]*)/);
  if (vMatch?.[1]) id = vMatch[1];
  else if (mediaUrl.includes('youtu.be/')) id = mediaUrl.split('youtu.be/')[1].split('?')[0];
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(id)) return null;
  return `https://www.youtube.com/embed/${id}`;
}

function isPrivateHost(hostname: string): boolean {
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|0\.0\.0\.0|169\.254\.)/.test(hostname);
}

function validateProxyUrl(rawUrl: string): URL {
  let parsed: URL;
  try { parsed = new URL(decodeURIComponent(rawUrl)); } catch { throw new Error('Invalid URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only http/https URLs allowed');
  if (isPrivateHost(parsed.hostname)) throw new Error('Private network access blocked');
  return parsed;
}

const LIGHTS_ALLOWED_HOSTS = new Set(['api.meethue.com', 'developer.api.govee.com', 'api.govee.com', 'api2.govee.com']);
function validateLightsProxyUrl(rawUrl: string): URL {
  const parsed = validateProxyUrl(rawUrl);
  const isHueBridgeLocal = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname);
  if (!LIGHTS_ALLOWED_HOSTS.has(parsed.hostname) && !isHueBridgeLocal) {
    throw new Error(`Host '${parsed.hostname}' not allowed for lights proxy`);
  }
  return parsed;
}

function validateFediverseInstance(instance: string): void {
  if (!instance || typeof instance !== 'string') throw new Error('Instance required');
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(instance)) {
    throw new Error('Invalid fediverse instance domain');
  }
  if (isPrivateHost(instance)) throw new Error('Private network access blocked');
}

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

  // ── Security middleware ───────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false,      // SPA served as static — no server-side CSP needed
    crossOriginEmbedderPolicy: false,  // Required for video/iframe embeds
  }));

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = isProd
    ? ['https://plajah.com', 'https://www.plajah.com']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // Per-category rate limiters
  const authLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
  const apiLimiter   = rateLimit({ windowMs:      60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
  const proxyLimiter = rateLimit({ windowMs:      60 * 1000, max: 60,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });

  app.use('/api/stripe/create-checkout-session', authLimiter);
  app.use('/api/stripe/create-portal-session',   authLimiter);
  app.use('/api/hue/auth',     authLimiter);
  app.use('/api/hue/callback', authLimiter);
  app.use('/api/proxy',        proxyLimiter);
  app.use('/api/lights/proxy', proxyLimiter);
  app.use('/api/social',       apiLimiter);

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

  // Per-user rate limiter for live stream creation (max 5 per 10 minutes)
  const muxLiveRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyGenerator: (req: any) => {
      // Prefer per-user UID when available; otherwise use connection remote address
      // Use remoteAddress/header instead of req.ip to avoid express-rate-limit IPv6 keyGenerator validation
      if (req && req.uid) return `uid:${req.uid}`;
      const forwarded = req?.headers?.['x-forwarded-for'];
      const remote = forwarded ? String(forwarded).split(',')[0].trim() : (req?.socket?.remoteAddress || 'unknown');
      return `ip:${remote}`;
    },
    message: { error: 'Too many live stream requests. Please wait before creating another stream.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // POST /api/mux/upload — browser gets an upload URL and PUTs directly to Mux
  app.post('/api/mux/upload', authMiddleware, async (req, res) => {
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
  app.get('/api/mux/asset', authMiddleware, async (req, res) => {
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
  app.post('/api/mux/create-asset-from-url', authMiddleware, express.json(), async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing url' });
      let parsedUrl: URL;
      try { parsedUrl = validateProxyUrl(String(url)); }
      catch (e: any) { return res.status(400).json({ error: e.message }); }

      const mux = await getMux();
      const asset = await mux.video.assets.create({
        inputs: [{ url: parsedUrl.toString() }],
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

  app.get('/api/mux/playback', authMiddleware, async (req, res) => {
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
  // Auth + per-user rate limit protects against stream creation abuse and billing attacks
  app.post('/api/mux/live/create', authMiddleware, muxLiveRateLimit, express.json(), async (req, res) => {
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

  app.delete('/api/mux/live/:streamId', authMiddleware, async (req, res) => {
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

  app.get('/api/mux/live/:streamId/status', authMiddleware, async (req, res) => {
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
  // Admin-only: this triggers expensive batch API calls and must not be publicly accessible
  app.post('/api/mux/backfill-videos', authMiddleware, async (req: any, res) => {
    // Verify admin status by checking the admins Firestore collection
    const isAdmin = await fetchFirebaseDoc('admins', req.uid);
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
    // Original handler continues below
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

  // ── Bluesky DMs — list conversations ─────────────────────────────────────────
  app.get('/api/fediverse/bluesky/dm/conversations', authMiddleware, async (req: any, res) => {
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const bskyAccount = accounts.find(a => a.protocol === 'bluesky');
      if (!bskyAccount) return res.status(404).json({ error: 'No Bluesky account connected' });
      const { bskyListConversations } = await import('./services/fediverse/bluesky.js');
      const convos = await bskyListConversations(bskyAccount.credentials);
      res.json({ conversations: convos });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'DM fetch failed' });
    }
  });

  // ── Bluesky DMs — get messages in conversation ────────────────────────────────
  app.get('/api/fediverse/bluesky/dm/messages', authMiddleware, async (req: any, res) => {
    const { convoId } = req.query as { convoId?: string };
    if (!convoId) return res.status(400).json({ error: 'convoId required' });
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const bskyAccount = accounts.find(a => a.protocol === 'bluesky');
      if (!bskyAccount) return res.status(404).json({ error: 'No Bluesky account connected' });
      const { bskyGetMessages } = await import('./services/fediverse/bluesky.js');
      const messages = await bskyGetMessages(bskyAccount.credentials, convoId);
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Message fetch failed' });
    }
  });

  // ── Bluesky DMs — send message ────────────────────────────────────────────────
  app.post('/api/fediverse/bluesky/dm/send', express.json(), authMiddleware, async (req: any, res) => {
    const { convoId, text } = req.body as { convoId?: string; text?: string };
    if (!convoId || !text?.trim()) return res.status(400).json({ error: 'convoId and text required' });
    try {
      const auth = await getFediverseAuth();
      const firebaseToken = (req.headers.authorization as string).slice(7);
      const accounts = await auth.loadAccounts(req.uid, firebaseToken);
      const bskyAccount = accounts.find(a => a.protocol === 'bluesky');
      if (!bskyAccount) return res.status(404).json({ error: 'No Bluesky account connected' });
      const { bskySendMessage } = await import('./services/fediverse/bluesky.js');
      const message = await bskySendMessage(bskyAccount.credentials, convoId, text);
      res.json({ message });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? 'Send failed' });
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

    try { validateFediverseInstance(instance); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }

    const pathStr = String(apiPath);
    if (!pathStr.startsWith('/') || pathStr.includes('..')) {
      return res.status(400).json({ error: 'Invalid API path' });
    }

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`https://${instance}${pathStr}`, { headers });
      if (!response.ok) return res.status(response.status).json({ error: 'Fediverse API error', status: response.status });
      const ct = response.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) return res.status(502).json({ error: 'Non-JSON response from instance' });
      res.json(await response.json());
    } catch {
      res.status(500).json({ error: 'Fediverse proxy failed' });
    }
  });

  // ── Social post routes (require Firebase auth) ───────────────────────────────
  app.post('/api/social/mastodon/post', authMiddleware, async (req: any, res) => {
    const { instance, token, status, inReplyToId } = req.body as Record<string, string>;
    try { validateFediverseInstance(instance); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
    try {
      const r = await fetch(`https://${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, in_reply_to_id: inReplyToId, visibility: 'public' }),
      });
      res.status(r.status).json(await r.json());
    } catch { res.status(500).json({ error: 'Post failed' }); }
  });

  app.post('/api/social/bluesky/post', authMiddleware, async (req: any, res) => {
    const { session, text, reply } = req.body as Record<string, unknown>;
    try {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      await agent.resumeSession(session as any);
      const post = await agent.post({ text: text as string, reply: reply as any, createdAt: new Date().toISOString() });
      res.json(post);
    } catch { res.status(500).json({ error: 'Post failed' }); }
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

    let parsed: URL;
    try { parsed = validateProxyUrl(url as string); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }

    const controller = new AbortController();
    req.on('close', () => { controller.abort(); });

    try {
      const decodedUrl = parsed.toString();
      const range = req.headers.range;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; Plajah/1.0)',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      };

      if (range) {
        headers['Range'] = range;
      }

      console.log(`[Proxy] ${range ? 'Streaming' : 'Fetching'}: ${parsed.hostname}${parsed.pathname}`);

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
      console.error('[Proxy] Failed:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy request failed' });
      }
    }
  });

  // Fediverse Proxy (to avoid CORS and handle remote lookups)
  app.get('/api/social/fediverse/proxy', async (req: any, res: any) => {
    const { instance, path: apiPath, token } = req.query;
    if (!instance || !apiPath) return res.status(400).json({ error: 'Instance and path required' });

    try {
      validateFediverseInstance(instance as string);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    // Only allow well-formed API paths starting with /
    const pathStr = String(apiPath);
    if (!pathStr.startsWith('/') || pathStr.includes('..')) {
      return res.status(400).json({ error: 'Invalid API path' });
    }

    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const url = `https://${instance}${pathStr}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Fediverse API error', status: response.status });
      }

      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        return res.status(502).json({ error: 'Remote instance returned non-JSON data' });
      }

      res.json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: 'Fediverse proxy failed' });
    }
  });

  // Mastodon Post/Reply — requires Firebase auth
  app.post('/api/social/mastodon/post', authMiddleware, async (req: any, res) => {
    const { instance, token, status, inReplyToId } = req.body;
    try {
      validateFediverseInstance(instance);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    try {
      const response = await fetch(`https://${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, in_reply_to_id: inReplyToId, visibility: 'public' }),
      });
      res.json(await response.json());
    } catch {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // Bluesky Post/Reply — requires Firebase auth
  app.post('/api/social/bluesky/post', authMiddleware, async (req: any, res) => {
    const { session, text, reply } = req.body;
    const agent = new BskyAgent({ service: 'https://bsky.social' });

    try {
      await agent.resumeSession(session);
      const post = await agent.post({ text, reply, createdAt: new Date().toISOString() });
      res.json(post);
    } catch {
      res.status(500).json({ error: 'Post failed' });
    }
  });

  // --- Partner Site Browser Proxy ---
  // Fetches an external URL server-side and strips X-Frame-Options / CSP frame-ancestors
  // so the content can be rendered inside a Plajah iframe panel.
  app.get('/api/browse', async (req: any, res: any) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    let parsed: URL;
    try {
      parsed = validateProxyUrl(url as string);
    } catch (e: any) {
      return res.status(400).send(e.message || 'Invalid URL');
    }
    const targetUrl = parsed.toString();

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
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Strip iframe-blocking headers — intentionally NOT forwarding X-Frame-Options or CSP

      if (contentType.includes('text/html')) {
        let html = await upstream.text();
        // Inject <base> tag so relative URLs resolve against the original origin
        const origin = parsed.origin;
        const baseTag = `<base href="${htmlEscape(origin)}/">`;
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
        try { window.opener.postMessage({ type:'hue-auth', accessToken:${JSON.stringify(access_token)}, refreshToken:${JSON.stringify(refresh_token)} }, window.location.origin); }
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
    let parsed: URL;
    try { parsed = validateLightsProxyUrl(targetUrl as string); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
    const method = (req.body?.targetMethod || qMethod || 'GET').toUpperCase();
    const bodyPayload = req.body?.body;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (goveeKey) headers['Govee-API-Key'] = goveeKey as string;
    if (hueToken) headers['Authorization'] = `Bearer ${hueToken}`;
    try {
      const upstream = await fetch(parsed.toString(), {
        method,
        headers,
        body: bodyPayload && method !== 'GET' ? JSON.stringify(bodyPayload) : undefined,
      });
      const data = await upstream.json().catch(() => null);
      res.status(upstream.status).json(data ?? {});
    } catch (e: any) {
      res.status(500).json({ error: 'Proxy request failed' });
    }
  });

  // Also accept GET for read-only calls
  app.get('/api/lights/proxy', express.json(), async (req: any, res: any) => {
    const { url: targetUrl, goveeKey, hueToken } = req.query;
    if (!targetUrl) return res.status(400).json({ error: 'url required' });
    let parsed: URL;
    try { parsed = validateLightsProxyUrl(targetUrl as string); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (goveeKey) headers['Govee-API-Key'] = goveeKey as string;
    if (hueToken) headers['Authorization'] = `Bearer ${hueToken}`;
    try {
      const upstream = await fetch(parsed.toString(), { headers });
      const data = await upstream.json().catch(() => null);
      res.status(upstream.status).json(data ?? {});
    } catch (e: any) {
      res.status(500).json({ error: 'Proxy request failed' });
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
    const safeTitle = htmlEscape(title);
    const safeHost = htmlEscape(host);
    const safeCover = htmlEscape(cover);
    const safeEmbedUrl = htmlEscape(embedUrl);

    const response = {
      version: '1.0',
      type: type === 'album' ? 'rich' : 'video',
      title: safeTitle,
      provider_name: 'Plajah',
      provider_url: `https://${safeHost}`,
      thumbnail_url: safeCover,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      html: `<iframe src="${safeEmbedUrl}" width="560" height="315" style="border:none;border-radius:12px;" allow="autoplay; encrypted-media" allowfullscreen></iframe>`,
      width: 560,
      height: 315,
    };

    if (format === 'xml') {
      res.set('Content-Type', 'text/xml');
      return res.send(`<?xml version="1.0" encoding="utf-8"?><oembed>${Object.entries(response).map(([k, v]) => `<${k}>${xmlEscape(String(v))}</${k}>`).join('')}</oembed>`);
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

    const safeMediaUrl = htmlEscape(mediaUrl);
    const safeCover = htmlEscape(cover);
    const safeTitle = htmlEscape(title);
    let playerHtml = '';
    if (isYoutube) {
        const embedLink = safeYouTubeEmbedUrl(mediaUrl);
        if (!embedLink) return res.status(400).send('Invalid YouTube URL');
        playerHtml = `<iframe src="${htmlEscape(embedLink)}" width="100%" height="100%" style="border:none" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else if (mediaUrl.endsWith('.mp4') || mediaUrl.includes('/videos%2F') || type === 'video' || type === 'feed') {
        playerHtml = `<video src="${safeMediaUrl}" controls width="100%" height="100%" style="background:black" poster="${safeCover}"></video>`;
    } else {
        playerHtml = `
        <div style="position:relative;background:#0a0a0a;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;">
          ${cover ? `<img src="${safeCover}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.25;filter:blur(40px);transform:scale(1.1);" />` : ''}
          <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.9) 0%,rgba(0,0,0,0.5) 60%,rgba(0,0,0,0.3) 100%);"></div>
          <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px;width:100%;max-width:480px;box-sizing:border-box;">
            ${cover ? `<img src="${safeCover}" style="width:140px;height:140px;border-radius:16px;object-fit:cover;box-shadow:0 20px 60px rgba(0,0,0,0.6);" />` : ''}
            <div style="text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#ff8c00;">Now Playing on Plajah</p>
              <h3 style="margin:0;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:-0.5px;">${safeTitle}</h3>
            </div>
            <audio src="${safeMediaUrl}" controls autoplay style="width:100%;accent-color:#ff8c00;"></audio>
          </div>
        </div>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${safeTitle}</title>
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
    // Service worker files must never be HTTP-cached — the browser manages their own cache.
    // Stale sw.js means users keep running old code even after a deploy.
    app.use((req, res, next) => {
      if (/^\/(sw\.js|workbox-[^/]+\.js)$/.test(req.path)) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (req.path.startsWith('/assets/')) {
        // Content-hashed filenames — safe to cache forever
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      next();
    });

    app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

    app.get('*all', async (req, res) => {
      try {
        let html = await fs.readFile(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
        if (req.query.type) {
           html = await injectMetaTags(html, req.query, req.get('host') || 'localhost');
        }
        // Tell browsers to always revalidate index.html so they pick up new deploys
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(html);
      } catch (e) {
        res.status(500).send('Server Error');
      }
    });
  }


  // ── MUX Webhook — receives live stream state changes ──────────────────────
  // Register MUX webhook at: https://dashboard.mux.com/webhooks
  // Point it to: https://your-domain.com/api/mux/webhook
  app.post('/api/mux/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['mux-signature'] as string;
    const secret = process.env.MUX_WEBHOOK_SECRET;

    // If webhook secret is configured, verify the signature
    if (secret && sig) {
      try {
        const body = req.body.toString('utf8');
        const ts = sig.split(',').find(p => p.startsWith('t='))?.split('=')[1];
        const v1 = sig.split(',').find(p => p.startsWith('v1='))?.split('=')[1];
        if (!ts || !v1) return res.status(400).json({ error: 'Invalid signature header' });
        const crypto = await import('crypto');
        const expected = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))) {
          return res.status(401).json({ error: 'Signature mismatch' });
        }
      } catch (err) {
        console.error('[MUX webhook] Signature verification error:', err);
        return res.status(400).json({ error: 'Signature verification failed' });
      }
    }

    try {
      const event = JSON.parse(req.body.toString('utf8'));
      const { type, data } = event;

      if (type === 'video.live_stream.active') {
        // Stream is receiving signal — update Firestore live_feeds status
        const streamId = data?.id;
        if (streamId) {
          console.log(`[MUX] Stream ${streamId} is now ACTIVE`);
          // Find the live feed doc with this muxStreamId and update it
          // (Using REST Firestore query — no admin SDK needed)
        }
      }

      if (type === 'video.live_stream.idle') {
        const streamId = data?.id;
        if (streamId) console.log(`[MUX] Stream ${streamId} is now IDLE/ended`);
      }

      if (type === 'video.asset.ready') {
        // VOD asset finished processing — update video doc with final playback ID
        const assetId = data?.id;
        const playbackId = data?.playback_ids?.[0]?.id;
        if (assetId && playbackId) {
          console.log(`[MUX] Asset ${assetId} ready with playbackId ${playbackId}`);
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('[MUX webhook] Parse error:', err);
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  });

  // ── Stripe: Club Membership Checkout ─────────────────────────────────────
  app.post('/api/stripe/club-membership', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { clubId, clubName, monthlyPrice } = req.body;
      if (!clubId || !clubName || typeof monthlyPrice !== 'number' || monthlyPrice <= 0) {
        return res.status(400).json({ error: 'Missing or invalid club membership parameters' });
      }
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: { name: `${clubName} — Fan Club Membership` },
            unit_amount: Math.round(monthlyPrice * 100),
          },
          quantity: 1,
        }],
        success_url: `${req.headers.origin ?? process.env.VITE_APP_URL ?? ''}/?club_join=${clubId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin ?? process.env.VITE_APP_URL ?? ''}/?club=${clubId}`,
        metadata: { type: 'club_membership', clubId, uid: req.uid },
        client_reference_id: req.uid,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] club-membership checkout error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MERCH API — Printful + Gelato proxy + Stripe checkout + platform fee payout
  // All keys stay server-side. Frontend calls /api/merch/* with a Firebase token.
  // Platform fee: PLATFORM_MERCH_FEE_PCT env var (default 15%)
  // ─────────────────────────────────────────────────────────────────────────────

  const PRINTFUL_API = 'https://api.printful.com';
  const GELATO_API   = 'https://product.gelatoapis.com/v3';
  const GELATO_ORDER_API = 'https://order.gelatoapis.com';
  const PLATFORM_FEE = parseFloat(process.env.PLATFORM_MERCH_FEE_PCT ?? '15') / 100;

  const printfulHeaders = () => ({
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
  });

  const gelatoHeaders = () => ({
    'X-API-KEY': process.env.GELATO_API_KEY ?? '',
    'Content-Type': 'application/json',
  });

  // ── Printful: fetch product catalog ─────────────────────────────────────────
  app.get('/api/merch/printful/catalog', authMiddleware, async (_req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/products?limit=20`, { headers: printfulHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: fetch variants for a product ───────────────────────────────────
  app.get('/api/merch/printful/products/:id', authMiddleware, async (req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/products/${req.params.id}`, { headers: printfulHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: upload design file ─────────────────────────────────────────────
  // Accepts multipart/form-data with field "file"
  app.post('/api/merch/printful/files', authMiddleware, async (req: any, res) => {
    try {
      // Stream the incoming multipart body directly to Printful
      const contentType = req.headers['content-type'] ?? 'multipart/form-data';
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      await new Promise(resolve => req.on('end', resolve));
      const body = Buffer.concat(chunks);

      const r = await fetch(`${PRINTFUL_API}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY ?? ''}`,
          'Content-Type': contentType,
          'Content-Length': String(body.length),
        },
        body,
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: generate mockup task ───────────────────────────────────────────
  app.post('/api/merch/printful/mockup/:productId', authMiddleware, express.json(), async (req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/mockup-generator/create-task/${req.params.productId}`, {
        method: 'POST',
        headers: printfulHeaders(),
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: poll mockup task result ────────────────────────────────────────
  app.get('/api/merch/printful/mockup/task', authMiddleware, async (req, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/mockup-generator/task?task_key=${req.query.task_key}`, { headers: printfulHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Printful: create sync product (publish to Plajah's Printful store) ───────
  app.post('/api/merch/printful/products', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const r = await fetch(`${PRINTFUL_API}/store/products`, {
        method: 'POST',
        headers: printfulHeaders(),
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Gelato: fetch product catalog ────────────────────────────────────────────
  app.get('/api/merch/gelato/catalog', authMiddleware, async (_req, res) => {
    try {
      const r = await fetch(`${GELATO_API}/products?limit=20&category=apparel`, { headers: gelatoHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Gelato: fetch variants ────────────────────────────────────────────────────
  app.get('/api/merch/gelato/products/:uid/variants', authMiddleware, async (req, res) => {
    try {
      const r = await fetch(`${GELATO_API}/products/${req.params.uid}/variants`, { headers: gelatoHeaders() });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Gelato: generate mockup ───────────────────────────────────────────────────
  app.post('/api/merch/gelato/mockup/:uid', authMiddleware, express.json(), async (req, res) => {
    try {
      const r = await fetch(`${GELATO_API}/products/${req.params.uid}/mockup`, {
        method: 'POST',
        headers: gelatoHeaders(),
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe: create merch checkout session ─────────────────────────────────────
  // Calculates platform fee, creates Stripe session, stores order intent in Firestore
  app.post('/api/merch/checkout', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { items, artistId, fulfillmentSource } = req.body as {
        items: { title: string; imageUrl: string; price: number; quantity: number; printfulVariantId?: number; printfulSyncProductId?: number }[];
        artistId: string;
        fulfillmentSource: 'printful' | 'gelato';
      };

      if (!items?.length || !artistId) return res.status(400).json({ error: 'Missing items or artistId' });

      const stripe = getStripe();
      const origin = req.headers.origin ?? process.env.VITE_APP_URL ?? '';
      const orderId = `merch-${Date.now()}-${req.uid.slice(0, 6)}`;

      // Build Stripe line items (retail price — Plajah takes fee from revenue share)
      const lineItems = items.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: item.imageUrl ? [item.imageUrl] : [],
          },
          unit_amount: Math.round(item.price * 100), // cents
        },
        quantity: item.quantity,
      }));

      const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const platformFeeAmount = Math.round(subtotal * PLATFORM_FEE * 100); // cents

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        success_url: `${origin}/?merch_success=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?merch_cancel=1`,
        metadata: {
          type: 'merch_order',
          orderId,
          artistId,
          buyerUid: req.uid,
          fulfillmentSource,
          platformFeeUsd: (platformFeeAmount / 100).toFixed(2),
          artistPayoutUsd: ((subtotal * 100 - platformFeeAmount) / 100).toFixed(2),
        },
        client_reference_id: req.uid,
        payment_intent_data: {
          // Transfer artist portion automatically if you use Stripe Connect (optional)
          // transfer_data: { destination: artistStripeAccountId },
          // application_fee_amount: platformFeeAmount,
          metadata: { orderId, artistId },
        },
      });

      // Record pending order in Firestore so webhook can fulfil it
      await firestoreWrite('merch_orders', orderId, {
        orderId,
        buyerUid: req.uid,
        artistId,
        fulfillmentSource,
        status: 'pending_payment',
        stripeSessionId: session.id,
        subtotalUsd: subtotal,
        platformFeeUsd: platformFeeAmount / 100,
        artistPayoutUsd: (subtotal * 100 - platformFeeAmount) / 100,
        itemsJson: JSON.stringify(items),
        timestamp: Date.now(),
      });

      res.json({ url: session.url, orderId });
    } catch (err: any) {
      console.error('[Merch] checkout error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stripe webhook: fulfil merch order after payment ─────────────────────────
  // Re-uses the existing /api/stripe/webhook handler pattern — add this case there.
  // Here we handle it inline via a dedicated route for clarity:
  app.post('/api/merch/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const secret = process.env.STRIPE_MERCH_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });

    let event: any;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err: any) {
      console.error('[Merch Webhook] signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.metadata?.type !== 'merch_order') return res.json({ received: true });

      const { orderId, artistId, fulfillmentSource, artistPayoutUsd } = session.metadata;

      try {
        // 1. Mark order paid in Firestore
        await firestoreWrite('merch_orders', orderId, {
          status: 'paid',
          stripePaymentIntentId: session.payment_intent ?? '',
          paidAt: Date.now(),
        });

        // 2. Submit fulfillment order to Printful or Gelato
        // Shipping address comes from Stripe session — available in session.customer_details
        const addr = session.customer_details?.address;
        const name = session.customer_details?.name ?? '';
        const email = session.customer_details?.email ?? '';

        if (fulfillmentSource === 'printful' && addr) {
          const projectId = 'gen-lang-client-0665118474';
          const dbId = 'ai-studio-5564c944-b75c-4461-bcd3-afa92800323b';
          const orderDoc = await fetchFirebaseDoc('merch_orders', orderId);
          const items = JSON.parse(orderDoc?.fields?.itemsJson?.stringValue ?? '[]');

          const pfOrder = await fetch(`${PRINTFUL_API}/orders`, {
            method: 'POST',
            headers: printfulHeaders(),
            body: JSON.stringify({
              external_id: orderId,
              shipping: 'STANDARD',
              recipient: {
                name,
                email,
                address1: addr.line1 ?? '',
                city: addr.city ?? '',
                state_code: addr.state ?? '',
                country_code: addr.country ?? 'US',
                zip: addr.postal_code ?? '',
              },
              items: items.map((i: any) => ({
                sync_variant_id: i.printfulSyncProductId,
                quantity: i.quantity,
                retail_price: i.price.toFixed(2),
              })),
            }),
          });
          const pfData = await pfOrder.json();
          await firestoreWrite('merch_orders', orderId, {
            status: 'fulfillment_submitted',
            printfulOrderId: String(pfData.result?.id ?? ''),
          });
        }

        if (fulfillmentSource === 'gelato' && addr) {
          const orderDoc = await fetchFirebaseDoc('merch_orders', orderId);
          const items = JSON.parse(orderDoc?.fields?.itemsJson?.stringValue ?? '[]');

          const glOrder = await fetch(`${GELATO_ORDER_API}/v4/orders`, {
            method: 'POST',
            headers: gelatoHeaders(),
            body: JSON.stringify({
              orderReferenceId: orderId,
              customerReferenceId: orderId,
              currency: 'USD',
              items: items.map((i: any, idx: number) => ({
                itemReferenceId: `${orderId}-${idx}`,
                productUid: i.gelatoProductUid ?? '',
                files: [{ type: 'default', url: i.designUrl ?? '' }],
                quantity: i.quantity,
              })),
              shippingAddress: {
                name,
                email,
                addressLine1: addr.line1 ?? '',
                city: addr.city ?? '',
                postCode: addr.postal_code ?? '',
                country: addr.country ?? 'US',
              },
            }),
          });
          const glData = await glOrder.json();
          await firestoreWrite('merch_orders', orderId, {
            status: 'fulfillment_submitted',
            gelatoOrderId: String(glData.id ?? ''),
          });
        }

        // 3. Record artist payout in Firestore (processed via your existing payout flow)
        const payoutId = `payout-merch-${orderId}`;
        await firestoreWrite('pending_payouts', payoutId, {
          type: 'merch',
          artistId,
          orderId,
          amountUsd: parseFloat(artistPayoutUsd ?? '0'),
          status: 'pending',
          createdAt: Date.now(),
        });

        console.log(`[Merch] Order ${orderId} fulfilled via ${fulfillmentSource}. Artist payout: $${artistPayoutUsd}`);
      } catch (err: any) {
        console.error(`[Merch] fulfillment error for ${orderId}:`, err.message);
        // Don't return 500 — Stripe will retry. Log and move on.
      }
    }

    res.json({ received: true });
  });

  // ── Merch: get order status ───────────────────────────────────────────────────
  app.get('/api/merch/orders/:orderId', authMiddleware, async (req: any, res) => {
    try {
      const doc = await fetchFirebaseDoc('merch_orders', req.params.orderId);
      if (!doc) return res.status(404).json({ error: 'Order not found' });
      // Only allow buyer or artist to read their own order
      const buyerUid = doc.fields?.buyerUid?.stringValue;
      const artistId = doc.fields?.artistId?.stringValue;
      if (req.uid !== buyerUid && req.uid !== artistId) return res.status(403).json({ error: 'Forbidden' });
      res.json(doc.fields);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── END MERCH API ─────────────────────────────────────────────────────────────

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
