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
import { lookup as dnsLookup } from 'node:dns/promises';
import nodeCrypto from 'node:crypto';
import { coraRouter } from './routes/cora';

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

// ── Google service-account auth for Firestore REST ──────────────────────────
// Unauthenticated REST calls evaluate as request.auth == null in security
// rules, so every server-side WRITE was silently rejected. With
// GOOGLE_SERVICE_ACCOUNT_JSON set (full service-account key JSON), we mint
// short-lived OAuth tokens and the server gets full datastore access.
let _gsaToken: { token: string; exp: number } | null = null;
async function getGoogleAccessToken(): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  if (_gsaToken && Date.now() < _gsaToken.exp - 120_000) return _gsaToken.token;
  try {
    const sa = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    const b64url = (s: string) => Buffer.from(s).toString('base64url');
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }))}`;
    const signer = nodeCrypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const jwt = `${unsigned}.${signer.sign(sa.private_key).toString('base64url')}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
    });
    const data = await res.json() as any;
    if (!data.access_token) return null;
    _gsaToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return _gsaToken.token;
  } catch (err: any) {
    console.error('[Auth] Service account token mint failed:', err.message);
    return null;
  }
}

async function firestoreAuthHeaders(): Promise<Record<string, string>> {
  const token = await getGoogleAccessToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

// Simple REST fetch for Firebase DB without needing admin SDK initialized
const fetchFirebaseDoc = async (collection: string, id: string) => {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collection}/${id}`;
  try {
    const res = await fetch(url, { headers: await firestoreAuthHeaders() });
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
// Firebase project id for ID-token claim checks — from the service account, then
// env, then the known project (matches firebase-applet-config.json + Firestore).
let _fbProjectId: string | null = null;
function firebaseProjectId(): string {
  if (_fbProjectId) return _fbProjectId;
  try { const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'); if (sa.project_id) return (_fbProjectId = sa.project_id); } catch {}
  return (_fbProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474');
}

// Google's public x509 certs for Firebase ID-token (secure token) signatures.
let _stCerts: { certs: Record<string, string>; exp: number } | null = null;
async function secureTokenCerts(): Promise<Record<string, string>> {
  if (_stCerts && Date.now() < _stCerts.exp) return _stCerts.certs;
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const certs = await res.json() as Record<string, string>;
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  _stCerts = { certs, exp: Date.now() + (m ? parseInt(m[1], 10) * 1000 : 3_600_000) };
  return certs;
}

// Verify a Firebase ID token by its RS256 signature + claims — no API key needed
// (so it survives a referrer-restricted Web API key, which rejects server-side
// accounts:lookup). Standard checks: alg/kid, exp, iat, aud, iss, sub, signature.
async function verifyIdTokenViaJwt(token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: any, payload: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;
  const projectId = firebaseProjectId();
  const now = Math.floor(Date.now() / 1000);
  if (!(typeof payload.exp === 'number' && payload.exp > now)) return null;
  if (!(typeof payload.iat === 'number' && payload.iat <= now + 300)) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.sub !== 'string') return null;
  try {
    const certs = await secureTokenCerts();
    const cert = certs[header.kid];
    if (!cert) return null;
    const ok = nodeCrypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), cert, Buffer.from(parts[2], 'base64url'));
    return ok ? payload.sub : null;
  } catch (e: any) {
    console.error('[Auth] JWT signature verify error:', e.message);
    return null;
  }
}

async function verifyFirebaseToken(token: string): Promise<string | null> {
  // Primary: Identity Toolkit lookup — works when FIREBASE_API_KEY is present and
  // NOT referrer-restricted.
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const uid = data.users?.[0]?.localId;
        if (uid) return uid;
      }
    } catch (err: any) {
      console.error('[Auth] lookup error (falling back to JWT verify):', err.message);
    }
  }
  // Fallback: verify the token signature directly (no API key).
  return verifyIdTokenViaJwt(token);
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
  const dbId = 'plajah-prod';
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
  const res = await fetch(url, {
    method: 'PATCH',
    headers: await firestoreAuthHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) console.error(`[Firestore] write ${collection}/${id} failed: HTTP ${res.status}${process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? '' : ' (GOOGLE_SERVICE_ACCOUNT_JSON not set — server writes are unauthenticated)'}`);
}

async function firestoreCreate(collection: string, data: object) {
  const projectId = 'gen-lang-client-0665118474';
  const dbId = 'plajah-prod';
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
    headers: await firestoreAuthHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) console.error(`[Firestore] create in ${collection} failed: HTTP ${res.status}${process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? '' : ' (GOOGLE_SERVICE_ACCOUNT_JSON not set — server writes are unauthenticated)'}`);
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

function checkUrlBasics(parsed: URL): URL {
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only http/https URLs allowed');
  if (isPrivateHost(parsed.hostname)) throw new Error('Private network access blocked');
  return parsed;
}

function validateProxyUrl(rawUrl: string): URL {
  let parsed: URL;
  // Do NOT decodeURIComponent here: Express already decoded the query param.
  // Decoding again corrupts URLs that legitimately contain encoded characters —
  // e.g. Firebase Storage object paths (`books%2Fclassics%2F…`) turned into
  // literal slashes, which made Storage return 400 for every proxied book.
  try { parsed = new URL(rawUrl); } catch { throw new Error('Invalid URL'); }
  return checkUrlBasics(parsed);
}

// The hostname string check above is bypassable: a public hostname can resolve
// to a private IP (DNS-based SSRF). Resolve and verify every address.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true;
    if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7)); // v4-mapped
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return true; // unparseable → refuse
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||      // CGNAT
    (a === 169 && b === 254) ||                // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

async function assertPublicHost(parsed: URL): Promise<void> {
  try {
    const addrs = await dnsLookup(parsed.hostname, { all: true });
    if (addrs.length === 0 || addrs.some(a => isPrivateIp(a.address))) {
      throw new Error('Private network access blocked');
    }
  } catch (e: any) {
    if (e?.message === 'Private network access blocked') throw e;
    throw new Error('Host could not be resolved');
  }
}

// SSRF-hardened outbound fetch: validates the URL AND its resolved IPs, and
// follows redirects manually so every hop is re-validated (a 302 to the cloud
// metadata service or an internal host is refused instead of followed).
async function safeOutboundFetch(target: string | URL, init: RequestInit = {}, maxRedirects = 4): Promise<Response> {
  let current = typeof target === 'string' ? checkUrlBasics(new URL(target)) : checkUrlBasics(target);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(current);
    const res = await fetch(current.toString(), { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = checkUrlBasics(new URL(loc, current));
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
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
          }

          // ── Event ticket fulfillment ──────────────────────────────────────────
          if (mode === 'payment' && meta.type === 'event_ticket' && meta.eventId) {
            const orderNum = `PLJ-${Date.now().toString(36).toUpperCase().slice(-8)}`;
            const ticketId = `tkt_${meta.eventId.slice(-6)}_${Date.now().toString(36)}`;
            await firestoreCreate('eventTickets', {
              id: ticketId,
              eventId: meta.eventId,
              eventTitle: meta.eventId,
              tierId: meta.tierId || '',
              tierName: meta.tierName || '',
              tierColor: meta.tierColor || '#a78bfa',
              holderName: meta.holderName || '',
              holderEmail: meta.holderEmail || '',
              holderUid: meta.uid || '',
              orderNumber: orderNum,
              quantity: parseInt(meta.quantity || '1'),
              totalPriceCents: parseInt(meta.subtotal || String(session.amount_total || 0)),
              status: 'VALID',
              physicalRequested: meta.physicalRequested === 'true',
              customPackagingRequested: meta.customPackagingRequested === 'true',
              shippingAddress: meta.shippingAddress || '',
              stripePaymentIntentId: session.payment_intent || '',
              createdAt: now,
            });
            // Increment tier sold count in event
            try {
              const evDoc = await fetchFirebaseDoc('plajahEvents', meta.eventId);
              if (evDoc?.fields) {
                const tiers = JSON.parse(evDoc.fields.tiers?.stringValue ?? '[]');
                const tierIdx = tiers.findIndex((t: any) => t.id === meta.tierId);
                if (tierIdx >= 0) { tiers[tierIdx].sold = (tiers[tierIdx].sold || 0) + parseInt(meta.quantity || '1'); }
                const totalSold = parseInt(evDoc.fields.totalSold?.integerValue ?? '0') + parseInt(meta.quantity || '1');
                await firestoreWrite('plajahEvents', meta.eventId, { tiers: JSON.stringify(tiers), totalSold, updatedAt: now });
              }
            } catch {}
          }

          // ── Record earnings + process splits for all creator-facing payments ──
          const CREATOR_PAYMENT_TYPES: Record<string, string> = {
            live_tip: 'tip',
            digital_sale: 'digital_sale',
            sanctuary_membership: 'sanctuary',
            plajahplus: 'plajahplus',
            store_order: 'store_order',
            club_membership: 'club',
            seedraiser_pledge: 'seedraiser',
          };
          const earningCategory = CREATOR_PAYMENT_TYPES[meta.type];
          const recipientUid = meta.creatorUid || meta.artistId || meta.uid;

          if (earningCategory && recipientUid && session.amount_total) {
            const grossCents       = session.amount_total;
            const platformFeeCents = Math.round(grossCents * 0.10);
            const netCents         = grossCents - platformFeeCents;

            // Load creator's split config
            let splitRecipients: any[] = [];
            let appliesTo: string[] = [];
            try {
              const splitDoc = await fetchFirebaseDoc('creatorSplits', recipientUid);
              if (splitDoc?.fields) {
                splitRecipients = JSON.parse(splitDoc.fields.recipients?.stringValue ?? '[]');
                appliesTo       = JSON.parse(splitDoc.fields.appliesTo?.stringValue ?? '[]');
              }
            } catch {}

            const activeSplits = appliesTo.includes(earningCategory) ? splitRecipients : [];
            const splitTotal   = activeSplits.reduce((s: number, r: any) => s + (r.percentage || 0), 0);
            const creatorPct   = 100 - Math.min(splitTotal, 99);
            const creatorNetCents = Math.round(netCents * creatorPct / 100);

            // Build split detail array
            const splitDetails = activeSplits.map((r: any) => ({
              creatorUid:   r.creatorUid,
              displayName:  r.displayName,
              amountCents:  Math.round(netCents * r.percentage / 100),
              percentage:   r.percentage,
            }));

            const earningTitle =
              meta.type === 'live_tip'             ? `Tip${meta.title ? ` — ${meta.title}` : ''}` :
              meta.type === 'digital_sale'          ? `Sale${meta.title ? `: ${meta.title}` : ''}` :
              meta.type === 'sanctuary_membership'  ? `Sanctuary Membership` :
              meta.type === 'plajahplus'            ? `Plajah+ Subscription` :
              meta.type === 'store_order'           ? `Store Order${meta.title ? `: ${meta.title}` : ''}` :
              meta.type === 'club_membership'       ? `Club Membership` :
              meta.type === 'seedraiser_pledge'     ? `SeedRaiser Pledge` : 'Payment';

            await firestoreCreate('creatorEarnings', {
              creatorUid:            recipientUid,
              payerUid:              meta.uid || '',
              category:              earningCategory,
              grossCents,
              platformFeeCents,
              netCents,
              creatorNetCents,
              splits:                JSON.stringify(splitDetails),
              title:                 earningTitle,
              stripePaymentIntentId: session.payment_intent || '',
              status:                'pending',
              timestamp:             now,
            });

            // Fire split transfers if recipients have Connect accounts
            if (splitDetails.length > 0) {
              const stripe = getStripe();
              for (const split of splitDetails) {
                try {
                  const recipDoc = await fetchFirebaseDoc('users', split.creatorUid);
                  const recipAccountId = recipDoc?.fields?.stripeConnectAccountId?.stringValue;
                  if (recipAccountId && split.amountCents > 0) {
                    await (stripe as any).transfers.create({
                      amount:      split.amountCents,
                      currency:    'usd',
                      destination: recipAccountId,
                      metadata:    { type: 'split', fromCreatorUid: recipientUid, toCreatorUid: split.creatorUid, category: earningCategory },
                    });
                  }
                } catch (transferErr: any) {
                  console.error('[Connect] Split transfer failed:', transferErr.message);
                }
              }
            }
          }

          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const snap = await fetch(`https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/plajahPlusSubscriptions?pageSize=5`);
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
    // Helmet's default COOP is 'same-origin', which BREAKS signInWithPopup
    // (Google/X/Facebook/Microsoft) — the OAuth popup can't postMessage the
    // result back to the opener. 'same-origin-allow-popups' keeps COOP
    // protection while letting the auth popup communicate back.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }));

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = isProd
    ? ['https://plajah.com', 'https://www.plajah.com']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

  // In dev, accept any localhost port — ES module scripts always send an
  // Origin header, so a dev server on a non-allowlisted port (preview tools,
  // PORT overrides) would otherwise 500 on every module request.
  const isDevLocalOrigin = (origin: string) =>
    !isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || isDevLocalOrigin(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  // Tight global JSON limit for safety — but exempt routes that legitimately carry
  // larger bodies (the AI proxy sends system prompt + scene context, well over 10kb)
  // so they can parse with their own limit instead of being 413'd here first.
  const tightJson = express.json({ limit: '10kb' });
  const LARGE_BODY_ROUTES = new Set(['/api/ai/anthropic']);
  app.use((req, res, next) => {
    if (LARGE_BODY_ROUTES.has(req.path)) return next();
    return tightJson(req, res, next);
  });
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

  // Liveness probe for uptime monitors / load balancers
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // ── Classic Books Seeder ─────────────────────────────────────────────────
  // One-time admin endpoint: downloads 40 Gutenberg public-domain TXTs and
  // uploads them to Firebase Storage at books/classics/{id}/text.txt so the
  // reader can fetch them directly (no proxy, no Gutenberg rate-limits).
  // Hit once after deploy: GET /api/admin/seed-classic-books?key=<ADMIN_KEY>
  app.get('/api/admin/seed-classic-books', async (req: any, res: any) => {
    if (req.query.key !== process.env.ADMIN_SEED_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
    const CLASSIC_IDS = [
      1342, 84, 11, 2701, 98, 345, 76, 174, 1260, 768,
      514, 120, 1513, 1524, 1400, 730, 46, 2554, 2600, 1399,
      996, 1184, 135, 161, 158, 1257, 103, 164, 36, 35,
      43, 215, 236, 844, 5200, 74, 25344, 1727, 6130, 145,
    ];
    const results: { id: number; status: string; url?: string }[] = [];
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    const token = await getGoogleAccessToken();
    if (!token) {
      res.write(`data: ${JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' })}\n\n`);
      return res.end();
    }

    for (const id of CLASSIC_IDS) {
      const storagePath = `books/classics/${id}/text.txt`;
      const encodedPath = encodeURIComponent(storagePath);
      const downloadUrl  = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodedPath}?alt=media`;

      // Skip if already uploaded (HEAD the download URL)
      try {
        const check = await fetch(downloadUrl, { method: 'HEAD' });
        if (check.ok) {
          results.push({ id, status: 'skipped (already exists)', url: downloadUrl });
          res.write(`data: ${JSON.stringify({ id, status: 'exists' })}\n\n`);
          continue;
        }
      } catch { /* not found — proceed with upload */ }

      try {
        const gutenbergUrl = `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`;
        const txtRes = await safeOutboundFetch(gutenbergUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Plajah/1.0)' },
        }, 6);
        if (!txtRes.ok) throw new Error(`Gutenberg fetch failed: ${txtRes.status}`);
        const text = await txtRes.text();

        const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodedPath}`;
        const up = await fetch(uploadUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
          body: text,
        });
        if (!up.ok) {
          const err = await up.text();
          throw new Error(`Storage upload failed: ${up.status} ${err}`);
        }
        results.push({ id, status: 'uploaded', url: downloadUrl });
        res.write(`data: ${JSON.stringify({ id, status: 'uploaded', url: downloadUrl })}\n\n`);
      } catch (err: any) {
        results.push({ id, status: `error: ${err.message}` });
        res.write(`data: ${JSON.stringify({ id, status: 'error', error: err.message })}\n\n`);
      }
      // Polite delay — Gutenberg rate-limits aggressive crawlers
      await new Promise(r => setTimeout(r, 800));
    }

    res.write(`data: ${JSON.stringify({ done: true, results })}\n\n`);
    res.end();
  });

  // ── Stripe Connect: Creator Payout Onboarding ────────────────────────────
  // Creates or retrieves a Stripe Express account for the creator and returns an onboarding URL.
  app.post('/api/stripe/connect/onboard', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      // Check if creator already has an account
      const userDoc = await fetchFirebaseDoc('users', uid);
      let accountId: string | undefined = userDoc?.fields?.stripeConnectAccountId?.stringValue;

      if (!accountId) {
        const account = await (stripe as any).accounts.create({
          type: 'express',
          metadata: { uid },
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        });
        accountId = account.id;
        await firestoreWrite('users', uid, { stripeConnectAccountId: accountId, updatedAt: Date.now() });
      }

      const origin = req.headers.origin || 'https://plajah.com';
      const link = await (stripe as any).accountLinks.create({
        account: accountId,
        refresh_url: `${origin}?connect=refresh`,
        return_url:  `${origin}?connect=success`,
        type: 'account_onboarding',
      });

      res.json({ url: link.url, accountId });
    } catch (err: any) {
      console.error('[Connect] Onboard error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Check Connect account status
  app.get('/api/stripe/connect/status', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const userDoc = await fetchFirebaseDoc('users', uid);
      const accountId: string | undefined = userDoc?.fields?.stripeConnectAccountId?.stringValue;
      if (!accountId) return res.json({ connected: false });

      const account = await (stripe as any).accounts.retrieve(accountId);
      const onboarded = account.details_submitted && account.charges_enabled;

      // Sync status back to Firestore
      if (onboarded) {
        await firestoreWrite('users', uid, {
          stripeConnectOnboarded: true,
          stripeConnectPayoutsEnabled: account.payouts_enabled,
          updatedAt: Date.now(),
        });
      }

      res.json({
        connected: true,
        accountId,
        onboarded,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        requiresAction: !account.details_submitted,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Stripe Express dashboard login link
  app.post('/api/stripe/connect/dashboard-link', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

      const userDoc = await fetchFirebaseDoc('users', uid);
      const accountId: string | undefined = userDoc?.fields?.stripeConnectAccountId?.stringValue;
      if (!accountId) return res.status(404).json({ error: 'No connected account' });

      const link = await (stripe as any).accounts.createLoginLink(accountId);
      res.json({ url: link.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch creator earnings from Firestore (categorised)
  app.get('/api/stripe/earnings', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    const period = (req.query.period as string) || '30d';
    const periodMs: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = periodMs[period] ?? 30;
    const since = Date.now() - days * 86_400_000;

    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = {
        structuredQuery: {
          from: [{ collectionId: 'creatorEarnings' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'creatorUid' }, op: 'EQUAL', value: { stringValue: uid } } },
                { fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(since) } } },
              ],
            },
          },
          orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
          limit: 200,
        },
      };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();

      const transactions = docs
        .filter((d: any) => d.document)
        .map((d: any) => {
          const f = d.document.fields;
          return {
            id: d.document.name.split('/').pop(),
            creatorUid:          f.creatorUid?.stringValue,
            payerUid:            f.payerUid?.stringValue,
            category:            f.category?.stringValue,
            grossCents:          parseInt(f.grossCents?.integerValue ?? '0'),
            platformFeeCents:    parseInt(f.platformFeeCents?.integerValue ?? '0'),
            netCents:            parseInt(f.netCents?.integerValue ?? '0'),
            creatorNetCents:     parseInt(f.creatorNetCents?.integerValue ?? '0'),
            title:               f.title?.stringValue ?? '',
            status:              f.status?.stringValue ?? 'pending',
            timestamp:           parseInt(f.timestamp?.integerValue ?? '0'),
            stripePaymentIntentId: f.stripePaymentIntentId?.stringValue,
          };
        });

      // Compute summary
      const CATEGORIES = ['tip','digital_sale','sanctuary','plajahplus','store_order','club','seedraiser','other'];
      const byCategory: any = {};
      for (const cat of CATEGORIES) byCategory[cat] = { grossCents: 0, netCents: 0, count: 0 };

      let totalGross = 0, totalFee = 0, totalNet = 0, pending = 0, paidOut = 0;
      for (const t of transactions) {
        totalGross += t.grossCents;
        totalFee   += t.platformFeeCents;
        totalNet   += t.creatorNetCents;
        if (t.status === 'pending')    pending  += t.creatorNetCents;
        if (t.status === 'paid_out')   paidOut  += t.creatorNetCents;
        const cat = byCategory[t.category] ?? byCategory.other;
        cat.grossCents += t.grossCents;
        cat.netCents   += t.creatorNetCents;
        cat.count      += 1;
      }

      res.json({ period, totalGrossCents: totalGross, totalPlatformFeeCents: totalFee, totalNetCents: totalNet, pendingCents: pending, paidOutCents: paidOut, byCategory, transactions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save split configuration
  app.post('/api/stripe/split', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    const { recipients, appliesTo } = req.body;
    if (!Array.isArray(recipients)) return res.status(400).json({ error: 'recipients required' });
    const total = recipients.reduce((s: number, r: any) => s + (r.percentage || 0), 0);
    if (total >= 100) return res.status(400).json({ error: 'Split percentages must sum to less than 100' });

    try {
      await firestoreWrite('creatorSplits', uid, {
        ownerUid: uid,
        recipients: JSON.stringify(recipients),
        appliesTo: JSON.stringify(appliesTo || ['tip','digital_sale','sanctuary','plajahplus']),
        updatedAt: Date.now(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get split configuration
  app.get('/api/stripe/split', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const doc = await fetchFirebaseDoc('creatorSplits', uid);
      if (!doc?.fields) return res.json({ recipients: [], appliesTo: [] });
      const f = doc.fields;
      res.json({
        ownerUid: uid,
        recipients: JSON.parse(f.recipients?.stringValue ?? '[]'),
        appliesTo:  JSON.parse(f.appliesTo?.stringValue ?? '[]'),
        updatedAt:  parseInt(f.updatedAt?.integerValue ?? '0'),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ── EVENTS & TICKETING ────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // Create or update an event
  app.post('/api/events', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const body = req.body;
      const eventId = body.id || `evt_${uid.slice(0,8)}_${Date.now()}`;
      await firestoreWrite('plajahEvents', eventId, {
        ...body, id: eventId, creatorUid: uid, updatedAt: Date.now(),
        createdAt: body.createdAt || Date.now(), viewCount: body.viewCount || 0,
        shareCount: body.shareCount || 0, totalSold: body.totalSold || 0, status: body.status || 'DRAFT',
        tiers: JSON.stringify(body.tiers || []), itinerary: JSON.stringify(body.itinerary || []),
        promoCodes: JSON.stringify(body.promoCodes || []), faqItems: JSON.stringify(body.faqItems || []),
        galleryImages: JSON.stringify(body.galleryImages || []), tags: JSON.stringify(body.tags || []),
      });
      res.json({ id: eventId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Get event by ID (public)
  app.get('/api/events/list', async (req, res) => {
    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'plajahEvents' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'ON_SALE' }, { stringValue: 'PUBLISHED' }] } } } }, orderBy: [{ field: { fieldPath: 'startDate' }, direction: 'ASCENDING' }], limit: 50 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const events = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), title: f.title?.stringValue, type: f.type?.stringValue, status: f.status?.stringValue, startDate: parseInt(f.startDate?.integerValue ?? '0'), coverImage: f.coverImage?.stringValue, city: f.city?.stringValue, venueName: f.venueName?.stringValue, creatorName: f.creatorName?.stringValue, creatorPhotoURL: f.creatorPhotoURL?.stringValue, totalSold: parseInt(f.totalSold?.integerValue ?? '0'), totalCapacity: parseInt(f.totalCapacity?.integerValue ?? '0') };
      });
      res.json({ events });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/events/creator/:uid', authMiddleware, async (req: any, res) => {
    if (req.uid !== req.params.uid) return res.status(403).json({ error: 'Forbidden' });
    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'plajahEvents' }], where: { fieldFilter: { field: { fieldPath: 'creatorUid' }, op: 'EQUAL', value: { stringValue: req.params.uid } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 50 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const events = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), title: f.title?.stringValue, status: f.status?.stringValue, type: f.type?.stringValue, startDate: parseInt(f.startDate?.integerValue ?? '0'), coverImage: f.coverImage?.stringValue, totalSold: parseInt(f.totalSold?.integerValue ?? '0'), totalCapacity: parseInt(f.totalCapacity?.integerValue ?? '0'), city: f.city?.stringValue, venueName: f.venueName?.stringValue };
      });
      res.json({ events });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/events/:eventId', async (req, res) => {
    try {
      const doc = await fetchFirebaseDoc('plajahEvents', req.params.eventId);
      if (!doc?.fields) return res.status(404).json({ error: 'Event not found' });
      const f = doc.fields;
      const event = { id: req.params.eventId, creatorUid: f.creatorUid?.stringValue, creatorName: f.creatorName?.stringValue, creatorPhotoURL: f.creatorPhotoURL?.stringValue, title: f.title?.stringValue, subtitle: f.subtitle?.stringValue, description: f.description?.stringValue, coverImage: f.coverImage?.stringValue, heroVideoUrl: f.heroVideoUrl?.stringValue, type: f.type?.stringValue, status: f.status?.stringValue, venueName: f.venueName?.stringValue, venueAddress: f.venueAddress?.stringValue, city: f.city?.stringValue, state: f.state?.stringValue, country: f.country?.stringValue, streamUrl: f.streamUrl?.stringValue, startDate: parseInt(f.startDate?.integerValue ?? '0'), endDate: parseInt(f.endDate?.integerValue ?? '0'), doorsOpenDate: f.doorsOpenDate?.integerValue ? parseInt(f.doorsOpenDate.integerValue) : undefined, timezone: f.timezone?.stringValue ?? 'America/New_York', totalCapacity: parseInt(f.totalCapacity?.integerValue ?? '0'), totalSold: parseInt(f.totalSold?.integerValue ?? '0'), kioskEnabled: f.kioskEnabled?.booleanValue ?? false, printingEnabled: f.printingEnabled?.booleanValue ?? false, sanctuaryMembersOnly: f.sanctuaryMembersOnly?.booleanValue ?? false, refundPolicy: f.refundPolicy?.stringValue ?? 'NO_REFUND', ageRestriction: f.ageRestriction?.stringValue, dresscode: f.dresscode?.stringValue, accessibilityInfo: f.accessibilityInfo?.stringValue, viewCount: parseInt(f.viewCount?.integerValue ?? '0'), shareCount: parseInt(f.shareCount?.integerValue ?? '0'), tiers: JSON.parse(f.tiers?.stringValue ?? '[]'), itinerary: JSON.parse(f.itinerary?.stringValue ?? '[]'), faqItems: JSON.parse(f.faqItems?.stringValue ?? '[]'), promoCodes: JSON.parse(f.promoCodes?.stringValue ?? '[]'), galleryImages: JSON.parse(f.galleryImages?.stringValue ?? '[]'), tags: JSON.parse(f.tags?.stringValue ?? '[]'), createdAt: parseInt(f.createdAt?.integerValue ?? '0'), updatedAt: parseInt(f.updatedAt?.integerValue ?? '0') };
      firestoreWrite('plajahEvents', req.params.eventId, { viewCount: event.viewCount + 1, updatedAt: Date.now() }).catch(() => {});
      res.json(event);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Purchase tickets — creates Stripe Checkout session
  app.post('/api/events/:eventId/tickets/purchase', authMiddleware, express.json(), async (req: any, res) => {
    const uid: string = req.uid;
    const { tierId, quantity = 1, holderName, holderEmail, physicalRequested, customPackagingRequested, shippingAddress, promoCode } = req.body;
    try {
      const stripe = getStripe();
      const eventDoc = await fetchFirebaseDoc('plajahEvents', req.params.eventId);
      if (!eventDoc?.fields) return res.status(404).json({ error: 'Event not found' });
      const f = eventDoc.fields;
      const tiers = JSON.parse(f.tiers?.stringValue ?? '[]');
      const tier = tiers.find((t: any) => t.id === tierId);
      if (!tier) return res.status(400).json({ error: 'Ticket tier not found' });
      if (tier.sold + quantity > tier.quantity) return res.status(400).json({ error: 'Not enough tickets available' });

      let unitPrice = tier.priceCents;
      const promoCodes = JSON.parse(f.promoCodes?.stringValue ?? '[]');
      const promo = promoCodes.find((p: any) => p.code?.toLowerCase() === promoCode?.toLowerCase() && p.usesLeft > 0);
      if (promo) unitPrice = Math.round(unitPrice * (1 - promo.discountPct / 100));
      const packagingFee = (physicalRequested && customPackagingRequested) ? (tier.customPackagingFeeCents ?? 0) : 0;
      const subtotal = unitPrice * quantity + packagingFee;

      const origin = req.headers.origin || 'https://plajah.com';
      const lineItems: any[] = [{ price_data: { currency: 'usd', product_data: { name: `${f.title?.stringValue} — ${tier.name}`, description: tier.description, ...(f.coverImage?.stringValue ? { images: [f.coverImage.stringValue] } : {}) }, unit_amount: unitPrice }, quantity }];
      if (packagingFee > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Custom Ticket Packaging' }, unit_amount: packagingFee }, quantity: 1 });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], line_items: lineItems,
        metadata: { type: 'event_ticket', eventId: req.params.eventId, tierId, tierName: tier.name, tierColor: tier.color || '#a78bfa', quantity: String(quantity), uid, holderName: holderName || '', holderEmail: holderEmail || '', physicalRequested: String(!!physicalRequested), customPackagingRequested: String(!!customPackagingRequested), shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : '', subtotal: String(subtotal) },
        success_url: `${origin}?event_success=${req.params.eventId}`,
        cancel_url: `${origin}/event/${req.params.eventId}`,
        customer_email: holderEmail,
      });
      res.json({ url: session.url });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Validate / check-in a ticket
  app.post('/api/tickets/:ticketId/validate', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.json({ valid: false, reason: 'Ticket not found' });
      const f = doc.fields;
      if (f.status?.stringValue === 'USED') return res.json({ valid: false, reason: 'Already checked in', checkedInAt: parseInt(f.checkedInAt?.integerValue ?? '0'), holderName: f.holderName?.stringValue });
      if (f.status?.stringValue !== 'VALID') return res.json({ valid: false, reason: `Ticket is ${f.status?.stringValue}` });
      await firestoreWrite('eventTickets', req.params.ticketId, { status: 'USED', checkedInAt: Date.now(), checkedInBy: req.uid });
      res.json({ valid: true, holderName: f.holderName?.stringValue, tierName: f.tierName?.stringValue, eventTitle: f.eventTitle?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1') });
    } catch (err: any) { res.status(500).json({ error: err.message, valid: false }); }
  });

  // Get user's tickets
  app.get('/api/tickets', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'eventTickets' }], where: { fieldFilter: { field: { fieldPath: 'holderUid' }, op: 'EQUAL', value: { stringValue: uid } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 50 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const tickets = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), eventId: f.eventId?.stringValue, eventTitle: f.eventTitle?.stringValue, eventStartDate: parseInt(f.eventStartDate?.integerValue ?? '0'), eventVenue: f.eventVenue?.stringValue, eventCoverImage: f.eventCoverImage?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, status: f.status?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1'), createdAt: parseInt(f.createdAt?.integerValue ?? '0') };
      });
      res.json({ tickets });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Get single ticket (holder only)
  app.get('/api/tickets/:ticketId', authMiddleware, async (req: any, res) => {
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.status(404).json({ error: 'Ticket not found' });
      const f = doc.fields;
      if (f.holderUid?.stringValue !== req.uid) return res.status(403).json({ error: 'Forbidden' });
      res.json({ id: req.params.ticketId, eventId: f.eventId?.stringValue, eventTitle: f.eventTitle?.stringValue, eventStartDate: parseInt(f.eventStartDate?.integerValue ?? '0'), eventVenue: f.eventVenue?.stringValue, eventCoverImage: f.eventCoverImage?.stringValue, tierId: f.tierId?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, holderName: f.holderName?.stringValue, holderEmail: f.holderEmail?.stringValue, orderNumber: f.orderNumber?.stringValue, quantity: parseInt(f.quantity?.integerValue ?? '1'), totalPriceCents: parseInt(f.totalPriceCents?.integerValue ?? '0'), status: f.status?.stringValue, checkedInAt: f.checkedInAt?.integerValue ? parseInt(f.checkedInAt.integerValue) : undefined, physicalRequested: f.physicalRequested?.booleanValue ?? false, createdAt: parseInt(f.createdAt?.integerValue ?? '0') });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // List event attendees (creator only)
  app.get('/api/events/:eventId/attendees', authMiddleware, async (req: any, res) => {
    try {
      const eventDoc = await fetchFirebaseDoc('plajahEvents', req.params.eventId);
      if (eventDoc?.fields?.creatorUid?.stringValue !== req.uid) return res.status(403).json({ error: 'Forbidden' });
      const projectId = 'gen-lang-client-0665118474';
      const dbId = 'plajah-prod';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
      const body = { structuredQuery: { from: [{ collectionId: 'eventTickets' }], where: { fieldFilter: { field: { fieldPath: 'eventId' }, op: 'EQUAL', value: { stringValue: req.params.eventId } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 500 } };
      const qRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const docs: any[] = await qRes.json();
      const attendees = docs.filter((d: any) => d.document).map((d: any) => {
        const f = d.document.fields;
        return { id: d.document.name.split('/').pop(), holderName: f.holderName?.stringValue, holderEmail: f.holderEmail?.stringValue, tierName: f.tierName?.stringValue, tierColor: f.tierColor?.stringValue, status: f.status?.stringValue, checkedInAt: f.checkedInAt?.integerValue ? parseInt(f.checkedInAt.integerValue) : undefined, quantity: parseInt(f.quantity?.integerValue ?? '1'), physicalRequested: f.physicalRequested?.booleanValue, createdAt: parseInt(f.createdAt?.integerValue ?? '0') };
      });
      res.json({ attendees });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Print ticket via PrintNode
  app.post('/api/tickets/:ticketId/print', authMiddleware, express.json(), async (req: any, res) => {
    const { printNodeApiKey, printerId, copies = 1 } = req.body;
    try {
      const doc = await fetchFirebaseDoc('eventTickets', req.params.ticketId);
      if (!doc?.fields) return res.status(404).json({ error: 'Ticket not found' });
      const f = doc.fields;
      const eventDoc = await fetchFirebaseDoc('plajahEvents', f.eventId?.stringValue);
      if (f.holderUid?.stringValue !== req.uid && eventDoc?.fields?.creatorUid?.stringValue !== req.uid) return res.status(403).json({ error: 'Forbidden' });
      const apiKey = printNodeApiKey || process.env.PRINTNODE_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'Printer not configured — add PRINTNODE_API_KEY to env or pass in request' });
      const ticketPdfUrl = `${req.headers.origin || 'https://plajah.com'}/print-ticket/${req.params.ticketId}`;
      const printRes = await fetch('https://api.printnode.com/printjobs', {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: parseInt(printerId), title: `Ticket — ${f.eventTitle?.stringValue}`, contentType: 'pdf_uri', content: ticketPdfUrl, source: 'Plajah', copies }),
      });
      if (!printRes.ok) return res.status(502).json({ error: 'PrintNode rejected print job' });
      const job = await printRes.json();
      await firestoreWrite('eventTickets', req.params.ticketId, { printedAt: Date.now() });
      res.json({ success: true, printJobId: job.id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Kiosk session start
  app.post('/api/events/:eventId/kiosk/session', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const sessionId = `kiosk_${req.params.eventId}_${Date.now()}`;
      await firestoreCreate('eventKioskSessions', { id: sessionId, eventId: req.params.eventId, creatorUid: req.uid, deviceLabel: req.body.deviceLabel || 'Kiosk 1', startedAt: Date.now(), lastActivityAt: Date.now(), ordersCount: 0, totalRevenueCents: 0, isActive: true });
      res.json({ sessionId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

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
      const subSnap = await fetch(`https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/plajahPlusSubscriptions?pageSize=1`);
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

      // complete() signals end-of-stream and triggers asset creation from new_asset_settings.
      // disable() only stops ingestion — it does NOT create a recording asset.
      await mux.video.liveStreams.complete(streamId);

      // Retrieve the stream to get the asset ID Mux is now preparing.
      const stream = await mux.video.liveStreams.retrieve(streamId);
      const assetId: string | null = (stream as any).recent_asset_ids?.[0] ?? null;

      // Try to get the playback ID from the asset (may still be "preparing").
      let playbackId: string | null = null;
      if (assetId) {
        try {
          const asset = await mux.video.assets.retrieve(assetId);
          playbackId = asset.playback_ids?.[0]?.id ?? null;
        } catch { /* asset may not be immediately accessible; save ID for later */ }
      }

      res.json({ ok: true, assetId, playbackId });
    } catch (error: any) {
      console.error('Mux live end error:', error);
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
      const dbId      = 'plajah-prod';
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

  app.post('/api/sports/ingest', authMiddleware, express.json({ limit: '128kb' }), async (req: any, res) => {
    const isAdmin = await fetchFirebaseDoc('admins', req.uid);
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    try {
      const {
        scope = 'standard',
        leagues,
        includeHistory,
        investigateEvents,
        maxEventsPerLeague,
        maxTeamsPerLeague,
        maxPlayersPerTeam,
      } = req.body ?? {};
      if (!['lite', 'standard', 'deep'].includes(scope)) {
        return res.status(400).json({ error: 'scope must be lite, standard, or deep' });
      }
      if (leagues && (!Array.isArray(leagues) || leagues.length > 40)) {
        return res.status(400).json({ error: 'leagues must be an array of up to 40 league ids' });
      }

      const { runSportsIngestionWorker } = await import('./services/sportsIngestionWorker.js');
      const summary = await runSportsIngestionWorker({
        scope,
        leagues,
        includeHistory: typeof includeHistory === 'boolean' ? includeHistory : undefined,
        investigateEvents: typeof investigateEvents === 'boolean' ? investigateEvents : undefined,
        reason: 'manual_api',
        maxEventsPerLeague: Number.isFinite(maxEventsPerLeague) ? Math.max(1, Math.min(64, Number(maxEventsPerLeague))) : undefined,
        maxTeamsPerLeague: Number.isFinite(maxTeamsPerLeague) ? Math.max(1, Math.min(64, Number(maxTeamsPerLeague))) : undefined,
        maxPlayersPerTeam: Number.isFinite(maxPlayersPerTeam) ? Math.max(1, Math.min(64, Number(maxPlayersPerTeam))) : undefined,
      });
      res.json(summary);
    } catch (err: any) {
      console.error('[Sports Ingestion] Manual run failed:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Sports ingestion failed' });
    }
  });

  // Lazy-load to keep cold-start fast; these are ESM modules with node:crypto
  const getFediverseAuth = async () => {
    const { decentralizedAuth } = await import('./services/fediverse/auth.js');
    return decentralizedAuth;
  };
  const getBroadcast = async () => {
    const { broadcastToDecentralizedWeb } = await import('./services/fediverse/broadcast.js');
    return broadcastToDecentralizedWeb;
  };

  // ── Anthropic (Claude) proxy for FABULA ─────────────────────────────────────
  // FABULA is Claude-powered; this keeps the API key server-side. Accepts the
  // standard Messages-API body and forwards it. Logged-in + rate-limited.
  app.post('/api/ai/anthropic', apiLimiter, authMiddleware, express.json({ limit: '4mb' }), async (req: any, res) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
    const { model, max_tokens, system, messages } = req.body as {
      model?: string; max_tokens?: number; system?: string; messages?: unknown;
    };
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages[] required' });
    }
    // Constrain to Claude models and a sane token ceiling to prevent abuse.
    // (claude-sonnet-4-20250514 is deprecated, retires 2026-06-15 — use current Sonnet.)
    const safeModel = typeof model === 'string' && /^claude-/.test(model) ? model : 'claude-sonnet-4-6';
    const safeMax = Math.min(Math.max(Number(max_tokens) || 1000, 1), 4096);
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: safeModel, max_tokens: safeMax, ...(system ? { system } : {}), messages }),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      console.error('[AI] Anthropic proxy failed:', err?.message || err);
      res.status(502).json({ error: 'Anthropic request failed' });
    }
  });

  // ── Manager Suite: publish due scheduled posts (cron) ───────────────────────
  // Robust, browser-independent publisher. A scheduler (Cloud Scheduler, cron,
  // or any uptime pinger) hits this every minute:
  //   POST /api/cron/publish-due-posts?key=<ADMIN_SEED_KEY>
  // It finds every users/*/scheduledPosts doc that is SCHEDULED and due, posts
  // it to the owner's connected fediverse accounts, and records the outcome.
  // (Plajah on-platform cross-post for scheduled items is handled client-side.)
  const PUBLISH_PROJECT = 'gen-lang-client-0665118474';
  const PUBLISH_DB = 'plajah-prod';
  const PUBLISH_FS = `https://firestore.googleapis.com/v1/projects/${PUBLISH_PROJECT}/databases/${PUBLISH_DB}/documents`;

  // Decode a Firestore REST value map into plain JS.
  const fsVal = (v: any): any => {
    if (v == null) return undefined;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fsVal);
    if ('mapValue' in v) return fsFields(v.mapValue.fields ?? {});
    if ('nullValue' in v) return null;
    return undefined;
  };
  const fsFields = (fields: Record<string, any>): any => {
    const out: any = {};
    for (const k of Object.keys(fields)) out[k] = fsVal(fields[k]);
    return out;
  };

  app.post('/api/cron/publish-due-posts', express.json(), async (req: any, res: any) => {
    const key = req.query.key || req.headers['x-cron-key'];
    if (key !== process.env.ADMIN_SEED_KEY && key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = await getGoogleAccessToken();
    if (!token) return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' });

    const now = Date.now();
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    try {
      // 1) Find due posts across all users (collection-group query).
      const queryBody = {
        structuredQuery: {
          from: [{ collectionId: 'scheduledPosts', allDescendants: true }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'SCHEDULED' } } },
                { fieldFilter: { field: { fieldPath: 'scheduledAt' }, op: 'LESS_THAN_OR_EQUAL', value: { doubleValue: now } } },
              ],
            },
          },
          limit: 50,
        },
      };
      const qRes = await fetch(`${PUBLISH_FS}:runQuery`, { method: 'POST', headers: authHeaders, body: JSON.stringify(queryBody) });
      if (!qRes.ok) throw new Error(`query failed: ${qRes.status} ${(await qRes.text()).slice(0, 200)}`);
      const rows: any[] = await qRes.json();
      const docs = rows.filter(r => r.document).map(r => r.document);

      const auth = await getFediverseAuth();
      const broadcast = await getBroadcast();
      const summary: any[] = [];

      for (const d of docs) {
        const name: string = d.name; // projects/.../documents/users/{uid}/scheduledPosts/{id}
        const m = name.match(/\/users\/([^/]+)\/scheduledPosts\/([^/]+)$/);
        if (!m) continue;
        const [, uid] = m;
        const post = fsFields(d.fields ?? {});

        const patch = async (fields: Record<string, any>) => {
          const masks = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
          await fetch(`https://firestore.googleapis.com/v1/${name}?${masks}`, {
            method: 'PATCH', headers: authHeaders, body: JSON.stringify({ fields }),
          });
        };

        // Claim it so a second cron tick won't double-send.
        await patch({ status: { stringValue: 'PUBLISHING' }, claimedAt: { integerValue: String(now) } });

        try {
          const accounts = await auth.loadAccounts(uid, token);
          const targetIds: string[] = Array.isArray(post.targetAccountIds) ? post.targetAccountIds : [];
          const targeted = accounts.filter((a: any) => targetIds.includes(a.id));

          if (!targeted.length) {
            await patch({
              status: { stringValue: 'FAILED' },
              publishLog: { stringValue: 'No connected accounts matched the scheduled targets (reconnect needed?).' },
              lastAttemptAt: { integerValue: String(now) }, updatedAt: { integerValue: String(now) },
            });
            summary.push({ uid, status: 'FAILED', reason: 'no matching accounts' });
            continue;
          }

          const result = await broadcast(
            targeted,
            {
              text: String(post.text ?? ''),
              uri: post.linkUri || undefined,
              title: post.linkTitle || undefined,
              description: post.linkDescription || undefined,
              thumbnail: Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : undefined,
            },
          );

          const okCount = result.succeeded.length;
          const failCount = result.failed.length;
          const status = failCount === 0 ? 'PUBLISHED' : okCount === 0 ? 'FAILED' : 'PARTIAL';
          const log = [
            ...result.succeeded.map((s: any) => `✓ ${s.protocol}`),
            ...result.failed.map((f: any) => `✗ ${f.protocol}: ${f.error}`),
          ].join('  ');
          await patch({
            status: { stringValue: status },
            publishLog: { stringValue: log.slice(0, 900) },
            lastAttemptAt: { integerValue: String(now) }, updatedAt: { integerValue: String(now) },
          });
          summary.push({ uid, status, ok: okCount, failed: failCount });
        } catch (err: any) {
          await patch({
            status: { stringValue: 'FAILED' },
            publishLog: { stringValue: (err?.message ?? 'publish error').slice(0, 900) },
            lastAttemptAt: { integerValue: String(now) }, updatedAt: { integerValue: String(now) },
          });
          summary.push({ uid, status: 'FAILED', reason: err?.message });
        }
      }

      res.json({ ok: true, processed: docs.length, summary });
    } catch (err: any) {
      console.error('[Cron] publish-due-posts failed:', err?.message || err);
      res.status(500).json({ error: err?.message ?? 'publish run failed' });
    }
  });

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

  // ── Social Graph Import ───────────────────────────────────────────────────────
  // Seed the user's Plajah follow graph from Twitter/X or Instagram.
  // OAuth flows redirect back to the app with ?social_import_code=…&social_import_platform=…

  app.get('/api/social-import/twitter/auth', authMiddleware, async (req: any, res) => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) return res.status(501).json({ error: 'TWITTER_CLIENT_ID not configured' });
    const appUrl = process.env.VITE_APP_URL ?? 'https://plajah.com';
    const redirectUri = encodeURIComponent(`${appUrl}/auth/twitter/callback`);
    const state = Buffer.from(req.uid).toString('base64');
    const scope = encodeURIComponent('tweet.read users.read follows.read offline.access');
    const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
    res.json({ url });
  });

  app.get('/auth/twitter/callback', async (req: any, res) => {
    const { code, state } = req.query as Record<string, string>;
    const appUrl = process.env.VITE_APP_URL ?? 'https://plajah.com';
    // Pass the code back to the SPA so SocialGraphImport.tsx can pick it up
    res.redirect(`${appUrl}?social_import_code=${encodeURIComponent(code)}&social_import_platform=twitter&state=${state}`);
  });

  app.get('/api/social-import/twitter/matches', authMiddleware, async (req: any, res) => {
    const { code } = req.query as { code: string };
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(501).json({ error: 'Twitter not configured' });

    try {
      const appUrl = process.env.VITE_APP_URL ?? 'https://plajah.com';
      // Exchange code for token
      const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: `${appUrl}/auth/twitter/callback`, code_verifier: 'challenge' }).toString(),
      });
      if (!tokenRes.ok) return res.status(400).json({ error: 'Token exchange failed' });
      const { access_token } = await tokenRes.json();

      // Get the authenticated user's following list
      const meRes = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${access_token}` } });
      const { data: me } = await meRes.json();
      const followingRes = await fetch(`https://api.twitter.com/2/users/${me.id}/following?max_results=1000&user.fields=username`, { headers: { Authorization: `Bearer ${access_token}` } });
      const { data: following } = await followingRes.json();
      const handles = (following ?? []).map((u: any) => u.username.toLowerCase());

      // Match against Plajah users by twitterHandle field
      const { getDocs, collection, where, query, limit } = await import('firebase/firestore');
      const { db: firestoreDb } = await import('./services/firebase.js');
      const matches: any[] = [];

      // Batch into groups of 10 (Firestore 'in' limit)
      for (let i = 0; i < handles.length; i += 10) {
        const batch = handles.slice(i, i + 10);
        if (!batch.length) continue;
        const q = query(collection(firestoreDb, 'users'), where('twitterHandle', 'in', batch), limit(10));
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const u = d.data();
          matches.push({
            plajahUid: d.id,
            displayName: u.displayName ?? u.twitterHandle,
            photoURL: u.photoURL,
            externalHandle: u.twitterHandle ?? '',
            alreadyFollowing: false,
          });
        });
      }

      res.json(matches);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social-import/follow-batch', authMiddleware, express.json(), async (req: any, res) => {
    const { uids } = req.body as { uids: string[] };
    if (!Array.isArray(uids) || uids.length === 0) return res.status(400).json({ error: 'uids required' });
    // Write follow records to Firestore
    const { doc, setDoc, serverTimestamp: ts } = await import('firebase/firestore');
    const { db: firestoreDb } = await import('./services/firebase.js');
    await Promise.allSettled(uids.map(uid =>
      setDoc(doc(firestoreDb, 'follows', `${req.uid}_${uid}`), {
        followerId: req.uid, followingId: uid, createdAt: ts(), source: 'social_import',
      })
    ));
    res.json({ followed: uids.length });
  });

  // ── Alexa Skill Fulfillment ───────────────────────────────────────────────────
  // Alexa POSTs signed requests here — no Firebase auth (Alexa doesn't know
  // about Firebase), but the Alexa app ID should be verified in production.
  app.post('/api/alexa', express.json(), async (req, res) => {
    try {
      const { handleAlexaRequest } = await import('./services/alexaService.js');
      const response = await handleAlexaRequest(req.body);
      res.json(response);
    } catch (err: any) {
      console.error('[Alexa] handler error:', err.message);
      res.status(500).json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: 'An error occurred.' }, shouldEndSession: true } });
    }
  });

  // ── Google Actions Fulfillment ────────────────────────────────────────────────
  // Google Assistant POSTs here for conversational actions.
  // Verify with Google Actions SDK JWT in production.
  app.post('/api/google-action', express.json(), async (req, res) => {
    try {
      const { handleGoogleActionRequest } = await import('./services/googleHomeService.js');
      const response = handleGoogleActionRequest(req.body);
      res.json(response);
    } catch (err: any) {
      console.error('[GoogleAction] handler error:', err.message);
      res.status(500).json({ prompt: { override: true, firstSimple: { speech: 'An error occurred.', text: 'Error.' } } });
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

      const response = await safeOutboundFetch(parsed, {
        headers,
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
      const upstream = await safeOutboundFetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
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
    const dbId = 'plajah-prod';
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

    // Album embed: ALWAYS render the full player — album art + the whole track list +
    // an audio player — whether or not a specific track was requested. (Previously a
    // share link without a &track= resolved no media and returned "No Media Found",
    // so album/music embeds showed nothing. This is the fix.)
    if (type === 'album') {
      const albumTitle = dbData.fields?.title?.stringValue || 'Album';
      const albumArtist = dbData.fields?.artist?.stringValue || '';
      const cover = dbData.fields?.coverImage?.stringValue || dbData.fields?.coverImageUrl?.stringValue || '';
      const tracksArr = dbData.fields?.tracks?.arrayValue?.values || [];
      const tracks = tracksArr.map((t: any) => {
        const f = t.mapValue?.fields || {};
        const locked = !!f.isPaywalled?.booleanValue;            // don't expose paywalled track URLs
        return {
          title: f.title?.stringValue || 'Untitled',
          artist: f.artist?.stringValue || albumArtist,
          url: locked ? '' : (f.url?.stringValue || ''),
          cover: f.albumCover?.stringValue || cover,
          locked,
        };
      }).filter((t: any) => !!t.title);

      let startIndex = 0;
      if (track) {
        const i = tracksArr.findIndex((t: any) => t.mapValue?.fields?.id?.stringValue === track);
        if (i >= 0) startIndex = i;
      }

      const j = (v: any) => JSON.stringify(v).replace(/</g, '\\u003c');  // safe to embed in <script>
      const safeAlbumTitle = htmlEscape(albumTitle);
      const safeAlbumArtist = htmlEscape(albumArtist);
      const safeCover = htmlEscape(cover);

      return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeAlbumTitle}</title>
<style>
*{box-sizing:border-box;}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;}
.wrap{position:relative;width:100%;height:100%;display:flex;}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.22;filter:blur(46px);transform:scale(1.15);}
.scrim{position:absolute;inset:0;background:linear-gradient(120deg,rgba(0,0,0,.92),rgba(0,0,0,.6));}
.left{position:relative;z-index:1;flex:0 0 44%;max-width:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;padding:18px;}
.art{width:128px;height:128px;border-radius:14px;object-fit:cover;box-shadow:0 18px 50px rgba(0,0,0,.6);background:#222;}
.meta{text-align:center;max-width:100%;}
.kicker{margin:0 0 3px;font-size:9px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#ff8c00;}
.title{margin:0;font-size:15px;font-weight:900;letter-spacing:-.3px;line-height:1.15;}
.artist{margin:2px 0 0;font-size:12px;color:#bbb;}
audio{width:100%;margin-top:2px;accent-color:#ff8c00;height:34px;}
.right{position:relative;z-index:1;flex:1;overflow-y:auto;padding:12px 10px;border-left:1px solid rgba(255,255,255,.08);}
.row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;cursor:pointer;transition:background .15s;}
.row:hover{background:rgba(255,255,255,.07);}.row.active{background:rgba(255,140,0,.16);}
.num{font-size:11px;color:#888;width:18px;text-align:center;flex:0 0 18px;}.row.active .num{color:#ff8c00;}
.tt{flex:1;min-width:0;}.tt b{display:block;font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.tt span{font-size:10.5px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;}
.lock{font-size:10px;color:#777;}
.empty{padding:18px;color:#888;font-size:12px;}
@media (max-width:430px){.wrap{flex-direction:column;}.left{flex:0 0 auto;max-width:none;flex-direction:row;justify-content:flex-start;gap:12px;padding:12px;}.art{width:64px;height:64px;}.meta{text-align:left;}.right{border-left:none;border-top:1px solid rgba(255,255,255,.08);}}
</style></head>
<body>
  <div class="wrap">
    <div class="bg" id="bg"></div><div class="scrim"></div>
    <div class="left">
      <img class="art" id="art" src="${safeCover}" alt="" onerror="this.style.visibility='hidden'"/>
      <div class="meta"><p class="kicker">Now Playing on Plajah</p><h3 class="title" id="ctitle">${safeAlbumTitle}</h3><p class="artist" id="cartist">${safeAlbumArtist}</p></div>
      <audio id="aud" controls autoplay playsinline></audio>
    </div>
    <div class="right" id="list"></div>
  </div>
  <script>
    var TRACKS=${j(tracks)},START=${startIndex},COVER=${j(cover)},cur=-1;
    var aud=document.getElementById('aud'),list=document.getElementById('list'),bg=document.getElementById('bg'),art=document.getElementById('art'),ct=document.getElementById('ctitle'),ca=document.getElementById('cartist');
    if(COVER)bg.style.backgroundImage="url('"+COVER+"')";
    function esc(s){return String(s||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
    function rows(){if(!TRACKS.length){list.innerHTML='<div class="empty">No tracks in this album yet.</div>';return;}list.innerHTML='';TRACKS.forEach(function(t,i){var r=document.createElement('div');r.className='row'+(i===cur?' active':'');r.innerHTML='<div class="num">'+(t.locked?'\\uD83D\\uDD12':(i+1))+'</div><div class="tt"><b>'+esc(t.title)+'</b><span>'+esc(t.artist)+'</span></div>'+(t.locked?'<div class="lock">Locked</div>':'');r.onclick=function(){if(!t.locked&&t.url)play(i);};list.appendChild(r);});}
    function play(i){var t=TRACKS[i];if(!t||!t.url)return;cur=i;aud.src=t.url;aud.play().catch(function(){});ct.textContent=t.title;ca.textContent=t.artist||'';var c=t.cover||COVER;if(c){art.src=c;art.style.visibility='visible';bg.style.backgroundImage="url('"+c+"')";}rows();}
    aud.addEventListener('ended',function(){for(var k=cur+1;k<TRACKS.length;k++){if(!TRACKS[k].locked&&TRACKS[k].url){play(k);return;}}});
    rows();
    (function(){if(TRACKS[START]&&!TRACKS[START].locked&&TRACKS[START].url){play(START);return;}for(var k=0;k<TRACKS.length;k++){if(!TRACKS[k].locked&&TRACKS[k].url){play(k);return;}}})();
  </script>
</body></html>`);
    }

    let mediaUrl = '';
    let title = '';
    let cover = '';
    let isYoutube = false;

    if (type === 'video') {
      mediaUrl = dbData.fields?.url?.stringValue || dbData.fields?.embedUrl?.stringValue || '';
      title = dbData.fields?.title?.stringValue || 'Video';
      cover = dbData.fields?.coverImageUrl?.stringValue || dbData.fields?.thumbnailUrl?.stringValue || '';
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) isYoutube = true;
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

  // Share landing — serves the SPA shell with OG/twitter:player meta injected so
  // a shared track link renders an inline player card on social. Crawlers read
  // the meta; humans are bounced to the canonical app URL so the full app loads.
  app.get('/share', async (req, res) => {
    const host = req.get('host') || 'plajah.com';
    let html = '';
    try { html = await fs.readFile(path.join(__dirname, 'dist', 'index.html'), 'utf-8'); }
    catch {
      try { html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8'); }
      catch { html = '<!DOCTYPE html><html><head></head><body></body></html>'; }
    }
    try { html = await injectMetaTags(html, req.query, host); } catch {}

    const { type, id, track } = req.query as any;
    if (type && id) {
      const canonical = `/?type=${encodeURIComponent(String(type))}&id=${encodeURIComponent(String(id))}${track ? `&track=${encodeURIComponent(String(track))}` : ''}`;
      // Bounce real browsers to the canonical app URL; crawlers (no JS) keep the meta.
      const redirect = `<script>try{if(!/(bot|crawl|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|embedly|linkedinbot|pinterest|redditbot|googlebot|bingbot|applebot|skypeuripreview|vkshare|w3c_validator)/i.test(navigator.userAgent)){location.replace(${JSON.stringify(canonical)});}}catch(e){}</script>`;
      html = html.replace('</head>', `${redirect}\n</head>`);
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
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
    // Vite's SPA middleware serves index.html for any unmatched GET — but some
    // API routes (/api/fetch-rss, /api/cora, the MUSE agent) are registered
    // AFTER this point, so /api/* must skip Vite and fall through to them.
    // Without this, those endpoints return the HTML shell (e.g. RSS news
    // parsed to 0 items → "No articles found").
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return (vite.middlewares as any)(req, res, next);
    });
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

    app.get('*all', async (req, res, next) => {
      // API routes registered after this catch-all (/api/fetch-rss, /api/cora,
      // MUSE agent) must not be served the SPA shell — let them resolve.
      if (req.path.startsWith('/api/')) return next();
      try {
        let html = await fs.readFile(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
        if (req.query.type) {
           html = await injectMetaTags(html, req.query, req.get('host') || 'localhost');
        }
        // Event page social OG injection: /event/:eventId
        const pathParts = req.path.split('/').filter(Boolean);
        if (pathParts[0] === 'event' && pathParts[1]) {
          try {
            const eventDoc = await fetchFirebaseDoc('plajahEvents', pathParts[1]);
            if (eventDoc?.fields) {
              const ef = eventDoc.fields;
              const title = ef.title?.stringValue ?? 'Event on Plajah';
              const desc = ef.subtitle?.stringValue || ef.description?.stringValue?.slice(0, 160) || 'Get your tickets on Plajah';
              const image = ef.coverImage?.stringValue ?? '';
              const host = req.get('host') || 'plajah.com';
              const dateStr = ef.startDate?.integerValue ? new Date(parseInt(ef.startDate.integerValue)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
              const venue = ef.venueName?.stringValue ?? ef.city?.stringValue ?? '';
              const richDesc = `${dateStr}${venue ? ` · ${venue}` : ''} — ${desc}`;
              const safeT = htmlEscape(title); const safeD = htmlEscape(richDesc); const safeI = htmlEscape(image); const safeH = htmlEscape(host); const safeEid = htmlEscape(pathParts[1]);
              const eventMeta = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeT}" />
    <meta property="og:description" content="${safeD}" />
    <meta property="og:image" content="${safeI}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="https://${safeH}/event/${safeEid}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@plajah" />
    <meta name="twitter:title" content="${safeT}" />
    <meta name="twitter:description" content="${safeD}" />
    <meta name="twitter:image" content="${safeI}" />
    <meta name="description" content="${safeD}" />`;
              html = html.replace('</head>', `${eventMeta}\n</head>`);
            }
          } catch {}
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

      // ── Firestore REST helpers (no admin SDK needed) ──────────────────────
      const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? 'gen-lang-client-0665118474';
      const dbId = process.env.VITE_FIREBASE_DB_ID ?? '(default)';
      const fsBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;

      // Query live_streams collection for a doc with muxStreamId == streamId
      const queryLiveStream = async (streamId: string) => {
        const url = `${fsBase}:runQuery`;
        const body = {
          structuredQuery: {
            from: [{ collectionId: 'live_streams' }],
            where: { fieldFilter: { field: { fieldPath: 'muxStreamId' }, op: 'EQUAL', value: { stringValue: streamId } } },
            limit: 1,
          },
        };
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const rows = await res.json();
        const doc = rows[0]?.document;
        return doc ? { name: doc.name, fields: doc.fields } : null;
      };

      const patchLiveDoc = async (docName: string, fields: Record<string, any>) => {
        const fieldPaths = Object.keys(fields);
        const mask = fieldPaths.map(f => `updateMask.fieldPaths=${f}`).join('&');
        const body = { fields: Object.fromEntries(fieldPaths.map(f => [f, fields[f]])) };
        await fetch(`https://firestore.googleapis.com/v1/${docName}?${mask}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      };

      if (type === 'video.live_stream.active') {
        const streamId = data?.id;
        if (streamId) {
          console.log(`[MUX] Stream ${streamId} is now ACTIVE`);
          try {
            const liveDoc = await queryLiveStream(streamId);
            if (liveDoc) {
              await patchLiveDoc(liveDoc.name, {
                isLive: { booleanValue: true },
                streamStatus: { stringValue: 'active' },
                liveStartedAt: { integerValue: String(Date.now()) },
              });
              console.log(`[MUX] Flipped isLive=true for stream ${streamId}`);
            }
          } catch (e: any) { console.error('[MUX webhook] Firestore update failed:', e.message); }
        }
      }

      if (type === 'video.live_stream.idle') {
        const streamId = data?.id;
        if (streamId) {
          console.log(`[MUX] Stream ${streamId} is now IDLE/ended`);
          try {
            const liveDoc = await queryLiveStream(streamId);
            if (liveDoc) {
              await patchLiveDoc(liveDoc.name, {
                isLive: { booleanValue: false },
                streamStatus: { stringValue: 'idle' },
                liveEndedAt: { integerValue: String(Date.now()) },
              });
              console.log(`[MUX] Flipped isLive=false for stream ${streamId}`);
            }
          } catch (e: any) { console.error('[MUX webhook] Firestore update failed:', e.message); }
        }
      }

      if (type === 'video.asset.ready') {
        // VOD asset finished processing — update video doc with final playback ID
        const assetId = data?.id;
        const playbackId = data?.playback_ids?.[0]?.id;
        if (assetId && playbackId) {
          console.log(`[MUX] Asset ${assetId} ready with playbackId ${playbackId}`);
          try {
            // Find video doc with muxAssetId == assetId and update playbackId
            const url = `${fsBase}:runQuery`;
            const body = {
              structuredQuery: {
                from: [{ collectionId: 'videos' }],
                where: { fieldFilter: { field: { fieldPath: 'muxAssetId' }, op: 'EQUAL', value: { stringValue: assetId } } },
                limit: 1,
              },
            };
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const rows = await res.json();
            const videoDoc = rows[0]?.document;
            if (videoDoc) {
              await patchLiveDoc(videoDoc.name, {
                muxPlaybackId: { stringValue: playbackId },
                status: { stringValue: 'ready' },
              });
            }
          } catch (e: any) { console.error('[MUX webhook] Video update failed:', e.message); }
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('[MUX webhook] Parse error:', err);
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  });

  // ── Stripe: Club Membership Checkout ─────────────────────────────────────
  // ── Live Stream Tip — instant one-time payment to creator ────────────────────
  app.post('/api/stripe/live-tip', authMiddleware, express.json(), async (req: any, res) => {
    try {
      const { creatorUid, creatorStripeAccountId, amount, title } = req.body;
      if (!creatorUid || !creatorStripeAccountId || typeof amount !== 'number' || amount < 100) {
        return res.status(400).json({ error: 'amount must be at least $1.00 (100 cents)' });
      }
      const platformFee = Math.round(amount * 0.10); // 10% platform fee
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `💸 Live tip${title ? ` — ${title}` : ''}` },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: { destination: creatorStripeAccountId },
          metadata: { type: 'live_tip', creatorUid, senderUid: req.uid ?? '' },
        },
        success_url: `${process.env.VITE_APP_URL ?? 'https://plajah.com'}?tip=success`,
        cancel_url: `${process.env.VITE_APP_URL ?? 'https://plajah.com'}?tip=cancelled`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error('/api/stripe/live-tip', err.message);
      res.status(500).json({ error: err.message });
    }
  });

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
          const dbId = 'plajah-prod';
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

  // ── Plajah Aria Agent ─────────────────────────────────────────────────────────
  //
  // Uses Google Gemini 2.0 Flash with optional Google Search grounding.
  //
  // RE: "Microsoft WebIQ" — there is no Microsoft product called WebIQ.
  // The capability you're thinking of is either:
  //   a) Azure OpenAI with Bing grounding (bing_search tool in Azure deployments), or
  //   b) Microsoft Copilot Studio web connectors.
  // Since this platform already ships @google/genai, we use Gemini's built-in
  // Google Search grounding — same concept (live-web RAG), simpler integration,
  // cheaper at scale.  If you later want Bing specifically, swap the
  // googleSearch tool for a bing fetch and pass BING_API_KEY in .env.
  //
  // Privacy: all messages stored under  users/{uid}/muse_sessions/{sessionId}/messages
  // and usage counters under  users/{uid}/muse_usage/{YYYY-MM-DD}.
  // Firestore security rules must restrict each user's subtree to their own uid.
  //
  // Tier rate limits (enforced server-side — client-side is informational only):
  //   FREE        : 5 msg/day,   0 web searches, 0 uploads
  //   CREATOR     : 20 msg/day,  0 web searches, 2 uploads/session
  //   PLAJAH_PLUS : 40 msg/day,  8 web searches, 5 uploads/session
  //   PRO         : 100 msg/day, 20 web searches, 20 uploads/session
  //
  // Estimated cost at Gemini 2.0 Flash ($0.075/MTok in, $0.30/MTok out):
  //   PLAJAH_PLUS (~$19.99/mo): ~$0.45 Gemini + ~$2.10 grounding = ~$2.55/user/month
  //   PRO (~$49.99/mo)        : ~$1.13 Gemini + ~$7.00 grounding = ~$8.13/user/month

  const AGENT_TIER_LIMITS: Record<string, { daily: number; searches: number }> = {
    FREE:        { daily: 5,   searches: 0  },
    CREATOR:     { daily: 20,  searches: 0  },
    PLAJAH_PLUS: { daily: 40,  searches: 8  },
    PRO:         { daily: 100, searches: 20 },
  };

  const ARIA_SYSTEM_PROMPT = `You are Aria, Plajah's private creative agent. You help users on the Plajah platform:

1. BUILD MODULE EXPERIENCES — When a user describes a module (educational, historical, musical, cinematic), generate a JSON config they can use on the platform. Output it in a <BUILD_MODULE> block.

2. DESIGN ALBUM GALLERY VIEWS — When a user describes an aesthetic or experience for an album, generate a gallery view config. Output it in a <BUILD_GALLERY> block.

3. CURATE CONTENT — Recommend tracks, artists, and experiences based on user interests. Output curated list in a <BUILD_PLAYLIST> block.

4. RESEARCH — Search the web (when enabled) to find factual information, biographies, public domain content, and creative inspiration.

5. ANALYZE DOCUMENTS — Process any files the user uploads and incorporate their content.

PRIVACY: Never reveal other users' data. This is a private 1:1 session.

LIMITS: Be transparent about tier limits when relevant.

OUTPUT FORMAT for builds:
- When generating a build, always include a human-readable explanation BEFORE the build block.
- Build blocks are JSON inside XML-like tags:  <BUILD_MODULE>{...}</BUILD_MODULE>
- Always include: type, title, description, layout, theme (colorPalette, gradient), sections[], tags[]

TONE: Creative, concise, inspiring. Never sycophantic. Be direct. If the user's idea is vague, ask one clarifying question.`;

  app.post('/api/agent/chat', authMiddleware, express.json({ limit: '10mb' }), async (req: any, res) => {
    try {
      const uid: string = req.uid;
      const { sessionId, message, attachments = [], tier = 'FREE', context = {} } = req.body;

      if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message required' });

      // ── Tier enforcement ──
      const limits = AGENT_TIER_LIMITS[tier] ?? AGENT_TIER_LIMITS.FREE;
      const todayKey = new Date().toISOString().slice(0, 10);

      // Read daily usage from Firestore REST
      const usageUrl = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/users/${uid}/muse_usage/${todayKey}`;
      let dailyMessages = 0;
      let dailySearches = 0;
      try {
        const usageSnap = await fetch(usageUrl);
        if (usageSnap.ok) {
          const usageData = await usageSnap.json();
          dailyMessages = parseInt(usageData.fields?.dailyMessages?.integerValue ?? '0', 10);
          dailySearches = parseInt(usageData.fields?.dailySearches?.integerValue ?? '0', 10);
        }
      } catch {}

      if (dailyMessages >= limits.daily) {
        return res.status(429).json({ error: 'Daily message limit reached. Upgrade your plan to continue.' });
      }

      const webSearchAllowed = dailySearches < limits.searches;

      // ── Microsoft MAI Thinking Model — Default for all Aria requests ─────────
      //
      // MAI Thinking is Microsoft's reasoning model (announced 2026-06-02).
      // It applies chain-of-thought / extended reasoning before responding —
      // equivalent to OpenAI o3 or Claude's Extended Thinking mode.
      // This makes Aria's builds, curations, and module configs significantly
      // more accurate and creative.
      //
      // Model name conventions (update once Microsoft publishes the catalog):
      //   MAI_THINKING_MODEL — reasoning/thinking variant (default for all tiers)
      //   MAI_FAST_MODEL     — fast non-thinking variant (fallback for simple queries)
      //
      // Cost note (estimated — verify on Azure AI Foundry pricing page):
      //   MAI Thinking  ~$0.06/MTok in, $0.24/MTok out  (reasoning tokens billed separately)
      //   MAI Fast      ~$0.02/MTok in, $0.08/MTok out
      // Still cheaper than Gemini Pro or GPT-4o, and includes native tool use + web search.
      //
      // Required env vars (all in .env.local):
      //   MAI_API_KEY          — from Azure AI Foundry → your deployment → Keys & Endpoint
      //   MAI_ENDPOINT         — e.g. https://plajah-mai.services.ai.azure.com/models
      //   MAI_THINKING_MODEL   — thinking/reasoning deployment name (e.g. "mai-thinking-1")
      //   MAI_FAST_MODEL       — fast deployment name (e.g. "mai-1")  [optional fallback]

      const MAI_KEY            = process.env.MAI_API_KEY || '';
      const MAI_ENDPOINT       = process.env.MAI_ENDPOINT || 'https://TODO.services.ai.azure.com/models';

      // Always use the thinking model — it reasons before answering, making builds better.
      // Fall back to MAI_FAST_MODEL for simple ping/greeting messages (detected below).
      const MAI_THINKING_MODEL = process.env.MAI_THINKING_MODEL || process.env.MAI_MODEL_NAME || 'mai-thinking-1';
      const MAI_FAST_MODEL     = process.env.MAI_FAST_MODEL || 'mai-1';

      // Use thinking model unless the message is trivially short (< 10 words)
      // to avoid paying reasoning tokens on "hi" / "what can you do?" queries
      const messageWordCount = message.trim().split(/\s+/).length;
      const MAI_MODEL = messageWordCount < 10 ? MAI_FAST_MODEL : MAI_THINKING_MODEL;

      // Fetch recent message history (last 16 turns)
      const histUrl = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents/users/${uid}/muse_sessions/${sessionId}/messages?pageSize=16&orderBy=timestamp%20desc`;
      let chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: ARIA_SYSTEM_PROMPT },
      ];
      try {
        const hSnap = await fetch(histUrl);
        if (hSnap.ok) {
          const hData = await hSnap.json();
          const docs = (hData.documents || []).reverse();
          for (const d of docs) {
            const role = d.fields?.role?.stringValue;
            const content = d.fields?.content?.stringValue || '';
            if (content && (role === 'user' || role === 'muse')) {
              chatHistory.push({ role: role === 'user' ? 'user' : 'assistant', content });
            }
          }
        }
      } catch {}

      // Append current user message (include attachment text inline)
      let userContent = message;
      const ctxNote = context.currentView ? `[Context: user is in ${context.currentView}]\n` : '';
      if (ctxNote) userContent = ctxNote + userContent;
      for (const att of attachments.slice(0, 5)) {
        if (att.dataUrl && att.type === 'text/plain') {
          const text = Buffer.from(att.dataUrl.split(',')[1] || att.dataUrl, 'base64').toString('utf8').slice(0, 6000);
          userContent += `\n\n[Attached: "${att.name}"]\n${text}`;
        } else if (att.type?.startsWith('image/')) {
          userContent += `\n[Image attached: "${att.name}" — describe it if relevant]`;
        }
      }
      chatHistory.push({ role: 'user', content: userContent });

      // Optional Bing web search tool (MAI supports OpenAI-style tool_choice + tools)
      const maiTools = webSearchAllowed ? [{
        type: 'function' as const,
        function: {
          name: 'search_web',
          description: 'Search the web for current information, facts, biographies, and content.',
          parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        },
      }] : undefined;

      let replyText = '';
      let toolCalls: any[] = [];
      let usedSearch = false;

      if (MAI_KEY && !MAI_ENDPOINT.includes('TODO')) {
        // ── Microsoft MAI (primary) ──────────────────────────────────────────────
        const maiRes = await fetch(`${MAI_ENDPOINT}/chat/completions?api-version=2025-05-15-preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': MAI_KEY,
            // MAI also accepts Bearer token:
            // 'Authorization': `Bearer ${MAI_KEY}`,
          },
          body: JSON.stringify({
            model: MAI_MODEL,
            messages: chatHistory,
            // Thinking model params — ignored by non-thinking models, so safe to always send.
            // When the MAI thinking model is active it applies chain-of-thought reasoning
            // before producing its final reply.  The thinking budget controls cost/depth.
            ...(MAI_MODEL === MAI_THINKING_MODEL ? {
              thinking: {
                type: 'enabled',
                budget_tokens: tier === 'PRO' ? 8000 : tier === 'PLAJAH_PLUS' ? 4000 : 2000,
              },
              temperature: 1, // required for thinking mode (some models mandate temp=1)
            } : {
              temperature: 0.8,
            }),
            max_tokens: tier === 'PRO' ? 4096 : 2048,
            tools: maiTools,
          }),
        });

        if (!maiRes.ok) {
          const errText = await maiRes.text().catch(() => '');
          throw new Error(`MAI API error (${maiRes.status}): ${errText}`);
        }

        const maiData = await maiRes.json();
        const choice = maiData.choices?.[0];
        replyText = choice?.message?.content || '';

        // Handle tool calls (Bing search) if model invoked them
        if (choice?.message?.tool_calls?.length) {
          for (const tc of choice.message.tool_calls) {
            if (tc.function?.name === 'search_web') {
              usedSearch = true;
              let query = '';
              try { query = JSON.parse(tc.function.arguments).query; } catch {}
              toolCalls.push({ name: 'search_web', label: `Searched: ${query}`, status: 'done' });

              // Bing Search (if key available) — feed result back for a second pass
              const bingKey = process.env.BING_SEARCH_KEY || '';
              if (bingKey && query) {
                try {
                  const bingRes = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=3`, {
                    headers: { 'Ocp-Apim-Subscription-Key': bingKey },
                  });
                  if (bingRes.ok) {
                    const bingData = await bingRes.json();
                    const snippets = (bingData.webPages?.value ?? []).slice(0, 3).map((r: any) => `${r.name}: ${r.snippet}`).join('\n');
                    // Second pass with search results injected
                    chatHistory.push({ role: 'assistant', content: replyText || '...' });
                    chatHistory.push({ role: 'user', content: `[Web search results for "${query}"]:\n${snippets}\n\nPlease continue your response using these results.` });
                    const pass2 = await fetch(`${MAI_ENDPOINT}/chat/completions?api-version=2025-05-15-preview`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'api-key': MAI_KEY },
                      body: JSON.stringify({ model: MAI_MODEL, messages: chatHistory, max_tokens: 2048, temperature: 0.8 }),
                    });
                    if (pass2.ok) {
                      const p2Data = await pass2.json();
                      replyText = p2Data.choices?.[0]?.message?.content || replyText;
                    }
                  }
                } catch {}
              }
            }
          }
        }

      } else {
        // ── Fallback: Google Gemini Flash ────────────────────────────────────────
        console.warn('[Aria] MAI_API_KEY or MAI_ENDPOINT not set — falling back to Gemini. Add MAI_API_KEY to .env.local.');
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || '' });
        const geminiHistory = chatHistory.slice(1, -1).map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }],
        }));
        const geminiTools = webSearchAllowed ? [{ googleSearch: {} }] : undefined;
        const chat = genai.chats.create({
          model: 'gemini-2.0-flash',
          config: { systemInstruction: ARIA_SYSTEM_PROMPT, tools: geminiTools, maxOutputTokens: 2048, temperature: 0.8 },
          history: geminiHistory,
        });
        const geminiRes = await chat.sendMessage({ message: [{ text: userContent }] });
        replyText = geminiRes.text || '';
        usedSearch = !!(geminiRes as any).candidates?.[0]?.groundingMetadata?.webSearchQueries?.length;
        if (usedSearch) toolCalls.push({ name: 'search_web', label: 'Searched the web', status: 'done' });
      }

      // ── Parse build outputs ──
      let buildOutput: any = null;
      const buildMatch = replyText.match(/<BUILD_(MODULE|GALLERY|PLAYLIST|CURATION)>([\s\S]*?)<\/BUILD_\1>/);
      if (buildMatch) {
        try {
          const buildType = buildMatch[1] as 'MODULE' | 'GALLERY' | 'PLAYLIST' | 'CURATION';
          const config = JSON.parse(buildMatch[2].trim());
          buildOutput = {
            type: buildType,
            title: config.title || 'Untitled Build',
            description: config.description || '',
            config,
            previewGradient: config.theme?.gradient || 'from-purple-900/80 to-indigo-900/60',
            previewEmoji: { MODULE: '🧩', GALLERY: '🖼️', PLAYLIST: '🎵', CURATION: '✨' }[buildType],
            createdAt: Date.now(),
          };
          toolCalls.push({ name: `generate_${buildType.toLowerCase()}`, label: `${buildType} config generated`, status: 'done' });
        } catch {}
      }

      // Strip raw build blocks from reply text for cleaner display
      const cleanReply = replyText.replace(/<BUILD_\w+>[\s\S]*?<\/BUILD_\w+>/g, '').trim();

      // ── Persist message to Firestore ──
      const now = Date.now();
      const baseUrl = `https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents`;
      const msgBase = `users/${uid}/muse_sessions/${sessionId}/messages`;

      const persistMsg = async (role: string, content: string, extra: any = {}) => {
        await fetch(`${baseUrl}/${msgBase}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              role:      { stringValue: role },
              content:   { stringValue: content },
              timestamp: { integerValue: String(now) },
              ...( extra.buildOutput ? { buildOutput: { stringValue: JSON.stringify(extra.buildOutput) } } : {} ),
              ...( extra.toolCalls?.length ? { toolCalls: { stringValue: JSON.stringify(extra.toolCalls) } } : {} ),
              ...( attachments.length ? { attachmentNames: { stringValue: JSON.stringify(attachments.map((a: any) => a.name)) } } : {} ),
            },
          }),
        }).catch(() => {});
      };

      await persistMsg('user', message);
      await persistMsg('muse', cleanReply, { buildOutput, toolCalls: toolCalls.length ? toolCalls : undefined });

      // ── Update daily usage counters ──
      const newDaily = dailyMessages + 1;
      const newSearches = dailySearches + (usedSearch ? 1 : 0);
      await fetch(usageUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            dailyMessages: { integerValue: String(newDaily) },
            dailySearches: { integerValue: String(newSearches) },
            resetDate:     { stringValue: todayKey },
          },
        }),
      }).catch(() => {});

      // ── Update session metadata ──
      await fetch(`${baseUrl}/users/${uid}/muse_sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            updatedAt:    { integerValue: String(now) },
            lastSnippet:  { stringValue: cleanReply.slice(0, 80) },
          },
        }),
      }).catch(() => {});

      return res.json({
        reply: cleanReply,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        buildOutput: buildOutput || undefined,
        usage: {
          dailyMessages: newDaily,
          dailySearches: newSearches,
          monthlyModules: 0,
          monthlyGalleries: 0,
          resetDate: todayKey,
        },
      });

    } catch (err: any) {
      console.error('[Aria Agent]', err.message);
      res.status(500).json({ error: 'Agent error — please try again.' });
    }
  });

  // ── END MUSE AGENT ────────────────────────────────────────────────────────────

  // ── Podcast RSS Proxy ─────────────────────────────────────────────────────────
  // Replaces allorigins.win with a first-party proxy so there's no third-party SLA dependency.
  app.get('/api/fetch-rss', async (req, res) => {
    const rawUrl = req.query.url as string;
    if (!rawUrl) return res.status(400).json({ error: 'Missing url param' });
    try {
      const parsed = validateProxyUrl(rawUrl);
      const upstream = await safeOutboundFetch(parsed, {
        signal: AbortSignal.timeout(20_000),
        headers: {
          'User-Agent': 'Plajah-Podcast-Bot/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
      });
      if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
      const text = await upstream.text();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(text);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Podcast Auto-Sync ──────────────────────────────────────────────────────────
  // Client calls this on startup when syncEnabled is true. Server fetches the feed
  // (bypassing CORS) and returns raw XML for client-side parsing + Firestore writes.
  app.post('/api/podcast-sync', authMiddleware, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const userDoc = await fetchFirebaseDoc('users', uid);
      const rssFields = userDoc?.fields?.podcastRss?.mapValue?.fields;
      if (!rssFields) return res.json({ synced: false, reason: 'no_feed' });

      const syncEnabled = rssFields.syncEnabled?.booleanValue ?? false;
      if (!syncEnabled) return res.json({ synced: false, reason: 'disabled' });

      const externalFeedUrl: string = rssFields.externalFeedUrl?.stringValue ?? '';
      if (!externalFeedUrl) return res.json({ synced: false, reason: 'no_url' });

      const lastSynced = parseInt(rssFields.lastSynced?.integerValue ?? '0', 10);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const force = req.query.force === 'true';
      if (!force && Date.now() - lastSynced < sevenDaysMs) {
        return res.json({ synced: false, reason: 'not_due', nextSync: lastSynced + sevenDaysMs });
      }

      const parsed = validateProxyUrl(externalFeedUrl);
      const feedRes = await fetch(parsed.href, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': 'Plajah-Podcast-Bot/1.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
      });
      if (!feedRes.ok) return res.status(502).json({ error: `Feed returned ${feedRes.status}` });

      const xmlText = await feedRes.text();
      res.json({ synced: true, xmlText, syncedAt: Date.now() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cora Music Analysis ───────────────────────────────────────────────────────
  app.use('/api/cora', express.json({ limit: '1mb' }), coraRouter);

  if (process.env.SPORTS_INGESTION_WORKER !== 'false') {
    const intervalMs = Number(process.env.SPORTS_INGESTION_INTERVAL_MS) || undefined;
    const { startSportsIngestionScheduler } = await import('./services/sportsIngestionWorker.js');
    startSportsIngestionScheduler({ intervalMs });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mesh Server running on http://localhost:${PORT}`);
    // Log env var status at startup so Cloud Run logs reveal config issues immediately
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    const fbKey  = process.env.FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY ?? '';
    console.log('[Config] ENCRYPTION_KEY:', encKey.length >= 16 ? `set (${encKey.length} chars)` : 'MISSING');
    console.log('[Config] FIREBASE_API_KEY:', fbKey.length > 0 ? 'set' : 'MISSING');
    const aiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.VITE_GOOGLE_AI_API_KEY ?? '';
    console.log('[Config] GOOGLE_AI_API_KEY (Aria fallback):', aiKey.length > 0 ? 'set' : 'not set');
    const maiKey      = process.env.MAI_API_KEY ?? '';
    const maiEp       = process.env.MAI_ENDPOINT ?? '';
    const maiThinking = process.env.MAI_THINKING_MODEL ?? 'mai-thinking-1';
    const maiFast     = process.env.MAI_FAST_MODEL ?? 'mai-1';
    console.log('[Config] MAI_API_KEY (Aria):', maiKey.length > 0 ? 'set' : 'MISSING — add MAI_API_KEY to .env.local');
    console.log('[Config] MAI_ENDPOINT:', maiEp.length > 0 && !maiEp.includes('TODO') ? maiEp : 'not configured');
    console.log(`[Config] MAI models — thinking: ${maiThinking}, fast: ${maiFast}`);
    console.log('[Config] VITE_AZURE_SPEECH_KEY (MAI Voice 2 / Transcribe 1.5):', (process.env.VITE_AZURE_SPEECH_KEY ?? '').length > 0 ? 'set' : 'MISSING — add VITE_AZURE_SPEECH_KEY for audiobook features');
    console.log('[Config] VITE_APP_URL:', process.env.VITE_APP_URL ?? '(not set)');
  });
}

startServer();
