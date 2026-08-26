/**
 * Kith Sightings — the trusted half.
 *
 * Plajah has no Cloud Functions; the backend is Express on Cloud Run behind
 * /api/**, so these are HTTP routes rather than callables. Firestore REST here
 * runs with the service account, which BYPASSES firestore.rules — so every
 * route does its own authorization, and the matching rules block denies all
 * client writes to these collections.
 *
 * THE RULE: the client never decides that a sighting happened.
 *
 *   POST /api/kith/spawn-check  → server decides; writes the sighting; returns an id
 *   POST /api/kith/claim        → server validates the id it issued; awards points
 *   GET  /api/kith/log          → the Field Log
 *
 * Anti-farm rests on a deterministic roll: whether a sighting is due is a pure
 * function of (userId, window index), so hammering refresh inside a window
 * returns the same answer every time. There is no reroll to hunt for.
 *
 * Points are awarded HERE and not via services/pointsService.addPoints, which is
 * client-side and blocked by firestore.rules (userPoints is admin-write only).
 */
import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import {
  fsGet, fsSet, fsPatch, fsCreate, verifyIdToken, adminConfig,
} from '../services/firebaseAdminRest';
import {
  KITH_ACHIEVEMENT_TIERS, KITH_POINTS_PER_SIGHTING,
  type KithMascot, type KithAchievementTrigger,
} from '../services/kith/types';

export const kithSightingsRouter = Router();

// ── tuning ────────────────────────────────────────────────────────────────────

/** Length of a deterministic roll window. Refresh inside one cannot reroll. */
const WINDOW_MS = 15 * 60 * 1000;
/** Minimum gap between two spawns for the same user. */
const SPAWN_COOLDOWN_MS = 45 * 60 * 1000;
/** A spawn the user never acts on simply expires. No nag, no penalty. */
const SIGHTING_TTL_MS = 2 * 60 * 1000;
/** Hard daily cap. Surfaced in the UI so there is no infinite hunt. */
const DAILY_CAP_ADULT = 4;
/** Kids-mode is inverted: exactly one, guaranteed, per day. */
const DAILY_CAP_KID = 1;
/** Probability a given window carries a sighting, for non-kids accounts. */
const WINDOW_HIT_RATE = 0.16;
/** Earliest minute of the day the kids-mode guaranteed sighting can unlock. */
const KID_UNLOCK_MIN = 8 * 60;
const KID_UNLOCK_SPAN = 10 * 60;

const SIGHTINGS = 'kithSightings';
const HUNTERS = 'kithHunters';
const LOG = (uid: string) => `kithSightingLog/${uid}/entries`;

// ── surfaces ──────────────────────────────────────────────────────────────────

/** Chora rides anything music or sound. */
const CHORA_SURFACES = new Set([
  'CHORA', 'MELOS', 'DJ_CONSOLE', 'SPATIAL_MIXER', 'PLAYER', 'ALBUM_DETAIL',
  'MIXES', 'MIX_PLAYER', 'PODCAST_STUDIO', 'MUSIC', 'MY_LIBRARY',
]);
/** Reello rides anything visual or moving-image. */
const REELLO_SURFACES = new Set([
  'REELLO', 'PHOTOS', 'PHOTO_GALLERY', 'PIXELS', 'PLAJAH_PIXELS', 'FABULA',
  'TALEO', 'MOVIE_UX', 'MOVIES_TV', 'LIVE', 'LIVE_HUB', 'TV_STUDIO', 'SWITCHER',
]);

/**
 * Delight must never interrupt something that matters. These surfaces suppress
 * outright — we do not queue a missed spawn, we drop it.
 */
const BLOCKED_SURFACES = new Set([
  'CHECKOUT', 'PAYMENT', 'CART', 'BILLING', 'SUBSCRIBE',
  'ASSESSMENT', 'EXAM', 'QUIZ_ACTIVE', 'WORKSHEET_ACTIVE', 'TEST_TAKING',
  'GO_LIVE', 'BROADCASTING', 'STREAM_ACTIVE',
  'SOURCE_VAULT', 'INTIMATE', 'INTIMATE_MODE',
  'WELLBEING', 'ORA_CRISIS', 'CRISIS',
  'CLASS_SESSION_ACTIVE', 'TEACHER_LIVE_CLASS',
]);

// ── helpers ───────────────────────────────────────────────────────────────────

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

function secret(): string {
  return process.env.KITH_SIGHTING_SECRET || `kith:${process.env.GOOGLE_CLOUD_PROJECT || 'plajah'}`;
}

/** Stable 0..1 from a label. Same input, same output, forever. */
function roll(label: string): number {
  const h = createHmac('sha256', secret()).update(label).digest();
  return h.readUInt32BE(0) / 0x1_0000_0000;
}

function dayKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function windowKeyOf(uid: string, now: number): string {
  return `${uid}:${Math.floor(now / WINDOW_MS)}`;
}

function pickMascot(surface: string, seed: string): KithMascot {
  if (CHORA_SURFACES.has(surface)) return 'CHORA';
  if (REELLO_SURFACES.has(surface)) return 'REELLO';
  return roll(`m:${seed}`) < 0.5 ? 'CHORA' : 'REELLO';
}

/** Kids-mode = a child account with kidsMode on. Mirrors services/contentSafety.ts. */
function isKidAccount(user: Record<string, any> | null): boolean {
  if (!user) return false;
  const isChild = user.isChild === true || user.accountType === 'CHILD';
  const kidsMode = user.parentalControls?.kidsMode !== false;
  return isChild && kidsMode;
}

/** Firestore rejects undefined. Everything written below is complete by construction. */
async function loadHunter(uid: string, now: number) {
  const raw = await fsGet(`${HUNTERS}/${uid}`);
  const today = dayKeyOf(now);
  if (!raw) {
    return {
      userId: uid, total: 0, dayKey: today, dayCount: 0,
      lastSpawnAt: 0, lastClaimAt: 0, kidsDayKey: '', updatedAt: now, _fresh: true,
    };
  }
  const sameDay = raw.dayKey === today;
  return {
    userId: uid,
    total: Number(raw.total) || 0,
    dayKey: today,
    dayCount: sameDay ? Number(raw.dayCount) || 0 : 0,
    lastSpawnAt: Number(raw.lastSpawnAt) || 0,
    lastClaimAt: Number(raw.lastClaimAt) || 0,
    kidsDayKey: typeof raw.kidsDayKey === 'string' ? raw.kidsDayKey : '',
    updatedAt: now,
    _fresh: false,
  };
}

async function saveHunter(uid: string, h: Record<string, any>) {
  const { _fresh, ...data } = h;
  await fsPatch(`${HUNTERS}/${uid}`, data);
}

/**
 * Award points server-side. pointsService.addPoints is client-side and the
 * deployed rules make userPoints admin-write only, so it silently fails for
 * ordinary users — we write through the service account instead, matching the
 * existing UserPointsBalance / PointsTransaction shapes exactly.
 */
async function awardPoints(uid: string, amount: number, source: string, relatedEntityId: string) {
  const cur = await fsGet(`userPoints/${uid}`);
  const totalPoints = (Number(cur?.totalPoints) || 0) + amount;
  const availablePlajahBucks = (Number(cur?.availablePlajahBucks) || 0) + amount;
  const lifetime = (Number(cur?.lifetime) || 0) + amount;
  const now = Date.now();

  await fsPatch(`userPoints/${uid}`, {
    userId: uid, totalPoints, availablePlajahBucks, lifetime, lastEarnedAt: now, timestamp: now,
  });
  await fsCreate('pointsTransactions', {
    userId: uid, amount, type: 'REWARD', source,
    description: 'Kith sighting logged', timestamp: now, relatedEntityId,
  });
}

/** Mint any thresholds this total just crossed. Idempotent per achievement id. */
async function mintTiers(uid: string, total: number): Promise<KithAchievementTrigger[]> {
  const crossed = KITH_ACHIEVEMENT_TIERS.filter((t) => t.count === total);
  const unlocked: KithAchievementTrigger[] = [];
  for (const tier of crossed) {
    const id = `${uid}__${tier.trigger}`;
    const existing = await fsGet(`userAchievements/${id}`);
    if (existing) continue;
    const now = Date.now();
    await fsSet(`userAchievements/${id}`, {
      userId: uid, achievementId: tier.trigger,
      unlockedAt: now, isNew: true, timestamp: now,
    });
    unlocked.push(tier.trigger);
  }
  return unlocked;
}

// ── POST /api/kith/spawn-check ────────────────────────────────────────────────
/**
 * "Is a sighting due for me, here, now?" Called on genuine navigation — not on
 * every render. The answer for a given (user, window) never changes, so there is
 * nothing to be gained by asking again.
 *
 * `surface` is client-supplied because only the client knows where the user is.
 * It steers which mascot appears and enforces the blocklist, and it is recorded
 * on the sighting document at spawn time. At claim time the surface is read back
 * off that document, so it cannot be forged after the fact.
 */
kithSightingsRouter.post('/spawn-check', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const surface = String((req.body ?? {}).surface || '').toUpperCase();
  if (!surface) return res.status(400).json({ error: 'surface is required.' });

  const now = Date.now();

  // Never interrupt something that matters.
  if (BLOCKED_SURFACES.has(surface)) return res.json({ sighting: null, remainingToday: 0 });

  const user = await fsGet(`users/${uid}`);
  const kid = isKidAccount(user);
  const cap = kid ? DAILY_CAP_KID : DAILY_CAP_ADULT;

  const h = await loadHunter(uid, now);
  const today = h.dayKey;
  const remainingToday = Math.max(0, cap - h.dayCount);

  if (remainingToday <= 0) return res.json({ sighting: null, remainingToday: 0 });
  if (now - h.lastSpawnAt < SPAWN_COOLDOWN_MS) return res.json({ sighting: null, remainingToday });

  // An already-live spawn is returned as-is rather than minting a second one.
  const windowKey = windowKeyOf(uid, now);

  let due = false;
  let guaranteed = false;

  if (kid) {
    // Inverted for children: randomise WHERE, never WHETHER. Exactly one per
    // day, unlocking at a per-user time so it still feels like a surprise —
    // but with no variable-ratio schedule to compulsively chase.
    if (h.kidsDayKey !== today) {
      const unlockMin = KID_UNLOCK_MIN + Math.floor(roll(`k:${uid}:${today}`) * KID_UNLOCK_SPAN);
      const minutesToday = new Date(now).getUTCHours() * 60 + new Date(now).getUTCMinutes();
      if (minutesToday >= unlockMin) { due = true; guaranteed = true; }
    }
  } else {
    // Deterministic per-window roll: the same window always gives the same
    // answer, so refreshing cannot produce a new one.
    due = roll(`s:${windowKey}`) < WINDOW_HIT_RATE;
  }

  if (!due) return res.json({ sighting: null, remainingToday });

  const mascot = pickMascot(surface, windowKey);
  const expiresAt = now + SIGHTING_TTL_MS;
  const id = await fsCreate(SIGHTINGS, {
    userId: uid, mascot, surface, spawnedAt: now, expiresAt,
    status: 'ACTIVE', windowKey, guaranteed,
  });
  if (!id) return res.status(500).json({ error: 'Could not create sighting.' });

  await saveHunter(uid, {
    ...h,
    lastSpawnAt: now,
    ...(kid && guaranteed ? { kidsDayKey: today } : {}),
  });

  return res.json({ sighting: { id, mascot, surface, expiresAt }, remainingToday });
});

// ── POST /api/kith/claim ──────────────────────────────────────────────────────
/**
 * Log a sighting. Idempotent: claiming the same id twice returns the original
 * result rather than paying out again.
 */
kithSightingsRouter.post('/claim', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const sightingId = String((req.body ?? {}).sightingId || '');
  if (!sightingId) return res.status(400).json({ error: 'sightingId is required.' });

  const s = await fsGet(`${SIGHTINGS}/${sightingId}`);
  if (!s) return res.status(404).json({ error: 'No such sighting.' });
  if (s.userId !== uid) return res.status(403).json({ error: 'Not your sighting.' });

  const now = Date.now();

  // Already claimed → return what happened the first time. No double payout.
  if (s.status === 'CLAIMED') {
    const h = await loadHunter(uid, now);
    return res.json({
      ok: true, mascot: s.mascot, surface: s.surface, at: Number(s.claimedAt) || now,
      pointsAwarded: 0, total: h.total, unlocked: [], alreadyClaimed: true,
    });
  }
  if (s.status !== 'ACTIVE') return res.status(409).json({ error: 'This sighting is no longer open.' });
  if (now > Number(s.expiresAt)) {
    await fsPatch(`${SIGHTINGS}/${sightingId}`, { status: 'EXPIRED' });
    return res.status(409).json({ error: 'It wandered off.' });
  }

  // Burn the token first, so a racing duplicate falls into the CLAIMED branch.
  await fsPatch(`${SIGHTINGS}/${sightingId}`, { status: 'CLAIMED', claimedAt: now });

  const h = await loadHunter(uid, now);
  const total = h.total + 1;

  // Surface and mascot come off the stored document, never off the request.
  await fsCreate(LOG(uid), {
    sightingId, mascot: s.mascot, surface: s.surface, at: now,
  });
  await saveHunter(uid, {
    ...h, total, dayCount: h.dayCount + 1, lastClaimAt: now,
  });
  await awardPoints(uid, KITH_POINTS_PER_SIGHTING, 'kith-sighting', sightingId);
  const unlocked = await mintTiers(uid, total);

  return res.json({
    ok: true, mascot: s.mascot, surface: s.surface, at: now,
    pointsAwarded: KITH_POINTS_PER_SIGHTING, total, unlocked,
  });
});

// ── GET /api/kith/log ─────────────────────────────────────────────────────────
/** The Field Log. Subcollection + single-field ordering, so no composite index. */
kithSightingsRouter.get('/log', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const now = Date.now();
  const h = await loadHunter(uid, now);
  const { fsList } = await import('../services/firebaseAdminRest');
  const rows = await fsList(LOG(uid), { maxDocs: 200 });
  const entries = rows
    .map((r) => ({
      id: r.id,
      sightingId: String(r.data.sightingId || ''),
      mascot: r.data.mascot as KithMascot,
      surface: String(r.data.surface || ''),
      at: Number(r.data.at) || 0,
    }))
    .sort((a, b) => b.at - a.at);

  return res.json({ total: h.total, dayCount: h.dayCount, entries });
});
