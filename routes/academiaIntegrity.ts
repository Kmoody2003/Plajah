// academiaIntegrity router — the privileged half of the Plajah Academia Integrity Wall.
//
// Three operations that cannot live on the client:
//   POST /conflict-check      the ONLY bridge across the persona wall; returns booleans only
//   POST /silent-mode         mirrors Silent Mode into a custom auth claim + writes the log
//   POST /validate-template   the only path to marking a template commercialUse
//
// Plajah has no Cloud Functions — the backend is Express on Cloud Run behind /api/**, so these
// are HTTP routes rather than callables. Firestore access goes through services/firebaseAdminRest
// (SA-signed REST), which bypasses security rules; every handler therefore does its own
// authorization explicitly.
//
// Mounted in server.ts as:
//   app.use('/api/academia', express.json({ limit: '64kb' }), academiaIntegrityRouter)

import { Router, Request, Response } from 'express';
import nodeCrypto from 'node:crypto';
import {
  verifyIdToken, fsGet, fsSet, fsPatch, fsCreate, fsList,
  setCustomClaims, getCustomClaims, adminConfig,
} from '../services/firebaseAdminRest';
import { libraryItemById } from '../data/oerLibrary';

export const academiaIntegrityRouter = Router();

type BlockScope = 'tutoring_only' | 'all_paid' | 'all';
type OfferingType = 'tutoring' | 'course' | 'workshop' | 'event';

const LOG = (uid: string) => `integrityLog/${uid}/events`;
const ROSTERS = (uid: string) => `districtPersona/${uid}/rosters`;

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

/** Server-side roster hashing. Must stay byte-identical to the client hash in
 *  services/academiaIntegrity.ts — same normalization, same `salt:ref` layout, same SHA-256 —
 *  or a purchaser would never match a roster entry and the wall would silently fail open. */
function hashStudentRef(ref: string, districtSalt: string): string {
  const normalized = ref.trim().toLowerCase().replace(/\s+/g, ' ');
  return nodeCrypto.createHash('sha256').update(`${districtSalt}:${normalized}`).digest('hex');
}

async function logEvent(uid: string, event: Record<string, unknown>) {
  await fsCreate(LOG(uid), { at: Date.now(), ...event });
}

/**
 * The district's roster salt, held in a collection no client may read (see firestore.rules).
 *
 * Deliberately NOT stored on the roster document and NOT accepted as a request parameter: a
 * caller-supplied salt lets anyone force a no-match by sending the wrong value, which turns the
 * whole wall into a formality. The district hands the salt to its teachers out of band (district
 * SSO / district app config) and registers it here once via POST /district-salt.
 *
 * Keeping salt and hashes in separate collections is also what preserves the privacy claim: a
 * read of districtPersona alone yields hashes with no salt to attack them with.
 */
async function districtSalt(districtId: string, cache: Map<string, string | null>): Promise<string | null> {
  if (!districtId) return null;
  if (cache.has(districtId)) return cache.get(districtId)!;
  const doc = await fsGet(`districtSecrets/${districtId}`);
  const salt = typeof doc?.salt === 'string' && doc.salt.length >= 16 ? doc.salt : null;
  cache.set(districtId, salt);
  return salt;
}

// ── POST /conflict-check ─────────────────────────────────────────────────────────
// The single bridge between personas.
//
// Legal basis: state ethics opinions locate the conflict in a teacher being PAID for
// personalized services to students they CURRENTLY GRADE. So:
//   • paid tutoring / 1:1 on a roster match → hard block
//   • broad, asynchronous course purchases  → follow the district's blockScope dial
//   • free interactions                     → never blocked (answering a question isn't a conflict)
//   • roster hashes expire at term end      → the conflict dies with the grading power
//
// The response is a boolean and a neutral message. It never reveals roster membership, which
// term matched, or that a roster exists at all — that disclosure would itself be the harm.
academiaIntegrityRouter.post('/conflict-check', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) {
    // Fail CLOSED for paid 1:1 rather than allow an unverifiable transaction.
    const oneToOne = req.body?.offeringType === 'tutoring' && req.body?.isPaid !== false;
    return res.status(503).json({ blocked: oneToOne, reason: oneToOne ? 'ROSTER_MATCH' : undefined });
  }
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const { creatorUid, purchaserRef, offeringType, isPaid } = (req.body ?? {}) as {
    creatorUid?: string; purchaserRef?: string; offeringType?: OfferingType; isPaid?: boolean;
  };
  if (!creatorUid || !purchaserRef) {
    return res.status(400).json({ error: 'creatorUid and purchaserRef are required.' });
  }
  // Free interactions are never a conflict.
  if (isPaid === false) return res.json({ blocked: false });

  const now = Date.now();
  const rosters = await fsList(ROSTERS(creatorUid), { maxDocs: 50 });

  let matched = false;
  let blockScope: BlockScope = 'tutoring_only';
  const saltCache = new Map<string, string | null>();

  for (const { data } of rosters) {
    const expiresAt = Number(data.expiresAt ?? 0);
    if (expiresAt <= now) continue;                       // term over → no grading power → no conflict
    const students: string[] = Array.isArray(data.students) ? data.students : [];
    if (!students.length) continue;
    if (data.blockScope) blockScope = data.blockScope as BlockScope;

    const salt = await districtSalt(String(data.districtId ?? ''), saltCache);
    // No salt on file means we cannot compute a comparable hash. Skipping would fail OPEN —
    // the roster would appear empty and every paid booking would sail through — so this is a
    // hard error instead. A misconfigured district blocks paid 1:1 rather than silently allowing it.
    if (!salt) {
      await logEvent(creatorUid, { kind: 'conflict_block', note: 'district salt missing — failed closed' });
      return res.json({ blocked: offeringType === 'tutoring', reason: 'ROSTER_MATCH' });
    }
    if (students.includes(hashStudentRef(purchaserRef, salt))) { matched = true; break; }
  }

  if (!matched) return res.json({ blocked: false });

  const oneToOne = offeringType === 'tutoring';
  const blocked =
    blockScope === 'all' ||
    (blockScope === 'all_paid') ||
    (blockScope === 'tutoring_only' && oneToOne);

  if (blocked) {
    // Written to the TEACHER's log — their own defense artifact, not a record about the student.
    // Deliberately stores no purchaser identifier, not even the hash.
    await logEvent(creatorUid, { kind: 'conflict_block', note: `offering:${offeringType ?? 'unknown'}` });
    return res.json({ blocked: true, reason: 'ROSTER_MATCH' });
  }
  return res.json({ blocked: false });
});

// ── POST /silent-mode ────────────────────────────────────────────────────────────
// Mirrors client Silent Mode state into a custom auth claim so firestore.rules can refuse
// Independent-persona writes even when a modified client ignores the UI lock, and writes the
// log entry server-side so the record survives a client that stops reporting.
academiaIntegrityRouter.post('/silent-mode', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const { engaged, trigger, schoolId } = (req.body ?? {}) as {
    engaged?: boolean; trigger?: 'geofence' | 'schedule' | 'network' | 'manual'; schoolId?: string;
  };
  if (typeof engaged !== 'boolean') return res.status(400).json({ error: 'engaged must be a boolean.' });

  const ok = await setCustomClaims(uid, { silentMode: engaged });
  await logEvent(uid, {
    kind: engaged ? 'silent_enter' : 'silent_exit',
    ...(trigger ? { trigger } : {}),
    ...(schoolId ? { schoolId } : {}),
  });
  // The claim reaches the rules only after the client refreshes its ID token; the caller in
  // services/academiaIntegrity.ts does that immediately on return.
  return res.json({ ok, claimSet: ok });
});

// ── POST /validate-template ──────────────────────────────────────────────────────
// The only path to commercialUse. Re-resolves every attached material from the server's own
// copy of the library — a client could otherwise send licence values it made up.
const COMMERCIAL_OK = new Set(['PD', 'CC-BY', 'CC-BY-SA']);
const RANK = ['PD', 'CC-BY', 'CC-BY-SA', 'CC-BY-NC', 'CC-BY-NC-SA'];

academiaIntegrityRouter.post('/validate-template', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const { templateId } = (req.body ?? {}) as { templateId?: string };
  if (!templateId) return res.status(400).json({ error: 'templateId is required.' });

  const tpl = await fsGet(`assignmentTemplates/${templateId}`);
  if (!tpl) return res.status(404).json({ error: 'Template not found.' });
  if (tpl.ownerUid !== uid) return res.status(403).json({ error: 'Not your template.' });

  const materials: string[] = tpl.structure?.materials ?? [];
  let worst = 'PD';

  for (const id of materials) {
    // The curated catalogue is compiled into the build, so it is authoritative and always
    // available. Firestore is consulted only for items ingested beyond it — otherwise every
    // validation would fail on a fresh environment until scripts/ingestOerLibrary.ts had run,
    // which would look like the licence gate rejecting perfectly legitimate OpenStax material.
    const item = libraryItemById(id) ?? await fsGet(`libraryItems/${id}`);
    // An unresolvable material is a validation FAILURE, not a pass. Treating "unknown" as safe
    // is exactly how non-commercial content ends up behind a paywall.
    if (!item) {
      await fsPatch(`assignmentTemplates/${templateId}`, { licenseValidated: false, commercialUse: false });
      return res.json({ valid: false, blockingItemId: id, error: 'Material not found in the library.' });
    }
    const lic = String(item.license ?? '');
    if (!COMMERCIAL_OK.has(lic)) {
      await fsPatch(`assignmentTemplates/${templateId}`, { licenseValidated: false, commercialUse: false });
      return res.json({ valid: false, blockingLicense: lic, blockingItemId: id });
    }
    if (RANK.indexOf(lic) > RANK.indexOf(worst)) worst = lic;
  }

  await fsPatch(`assignmentTemplates/${templateId}`, { licenseValidated: true, license: worst, updatedAt: Date.now() });
  return res.json({ valid: true, license: worst });
});

// ── POST /district-salt ──────────────────────────────────────────────────────────
// One-time registration of a district's roster salt, by that district's admin. Write-only:
// there is no GET, and no response echoes the value back. Rotating the salt invalidates every
// roster hashed under the old one, so rosters must be resubmitted — hence the explicit
// `rotate: true` acknowledgement rather than a silent overwrite.
academiaIntegrityRouter.post('/district-salt', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const { districtId, salt, rotate } = (req.body ?? {}) as { districtId?: string; salt?: string; rotate?: boolean };
  if (!districtId || !salt) return res.status(400).json({ error: 'districtId and salt are required.' });
  if (salt.length < 16) return res.status(400).json({ error: 'Salt must be at least 16 characters.' });

  const claims = await getCustomClaims(uid);
  if (claims.districtAdmin !== districtId) {
    return res.status(403).json({ error: 'Only this district\'s administrator can register its salt.' });
  }

  const existing = await fsGet(`districtSecrets/${districtId}`);
  if (existing?.salt && !rotate) {
    return res.status(409).json({ error: 'A salt is already registered. Pass rotate:true to replace it — every existing roster must then be resubmitted.' });
  }

  const ok = await fsSet(`districtSecrets/${districtId}`, { salt, setBy: uid, setAt: Date.now() });
  return ok ? res.json({ ok: true }) : res.status(500).json({ error: 'Could not store the salt.' });
});
