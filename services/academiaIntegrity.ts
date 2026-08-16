// academiaIntegrity — the Integrity Wall for Plajah Academia teacher accounts.
//
// One human, one login, two hard-separated personas:
//   • District persona   — the day job: rosters they teach, district materials, school comms.
//   • Independent persona — their Plajah creator business: courses, tutoring, payouts.
//
// The wall is NOT a UI toggle. Nothing in the Independent persona can read District data;
// the single bridge is the conflict-check endpoint, which returns booleans and never records.
// Rosters are stored as SALTED HASHES computed on the teacher's device — raw student identity
// never reaches Plajah's servers, which is what keeps the FERPA posture clean.
//
// Firestore layout (namespaced; nothing here touches existing collections):
//   teacherIntegrity/{uid}                       personas + integritySettings
//   districtPersona/{uid}/rosters/{termId}       salted student hashes, expiresAt = term end
//   integrityLog/{uid}/events/{eventId}          append-only; the teacher's own defense artifact
//
// Backend note: Plajah has no Cloud Functions — the server is Express on Cloud Run behind
// /api/**. The three privileged operations therefore live in routes/academiaIntegrity.ts and
// are called over HTTP here, not via httpsCallable.
//
// All writes are field-complete (no undefined — Firestore rejects it) and reads use single-field
// ordering only, per [[plajah-firestore-gotchas]].

import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';

// ── Model ─────────────────────────────────────────────────────────────────────

export type PersonaKind = 'district' | 'independent';

export interface DistrictPersona {
  active: boolean;
  districtId: string;
  districtName: string;
  schoolIds: string[];
  verifiedAt: number;      // epoch ms; 0 = claimed but unverified
}

export interface IndependentPersona {
  active: boolean;
  creatorId: string;       // the teacher's Plajah creator/uid
  payoutAccountId: string; // Stripe Connect account (see [[plajah-payments-direction]])
  activatedAt: number;
}

export interface Geofence {
  schoolId: string;
  label: string;
  lat: number;
  lng: number;
  radiusMeters: number;    // 150–300m is the useful range; smaller false-negatives on GPS drift
}

export interface ScheduleFence {
  enabled: boolean;
  timezone: string;        // IANA, e.g. 'America/Detroit'
  contractHours: Array<{ day: 0 | 1 | 2 | 3 | 4 | 5 | 6; start: string; end: string }>; // 0 = Sunday, 'HH:MM'
}

export interface IntegritySettings {
  /** 'auto' = geofence + schedule fence; 'manual' = teacher toggles only;
   *  'off' is refused by the rules while a verified district persona is active. */
  campusSilentMode: 'auto' | 'manual' | 'off';
  geofences: Geofence[];
  scheduleFence: ScheduleFence;
  disclosureAcknowledged: number | null;
}

export interface TeacherIntegrityDoc {
  uid: string;
  personas: { district: DistrictPersona | null; independent: IndependentPersona | null };
  integritySettings: IntegritySettings;
  updatedAt: number;
}

export type SilentModeTrigger = 'geofence' | 'schedule' | 'network' | 'manual';

export type IntegrityEventKind =
  | 'silent_enter' | 'silent_exit' | 'disclosure_ack' | 'conflict_block'
  | 'roster_submitted' | 'roster_expired' | 'persona_activated';

export interface IntegrityEvent {
  id: string;
  at: number;
  kind: IntegrityEventKind;
  trigger?: SilentModeTrigger;
  schoolId?: string;
  note?: string;
}

/** How far a district wants the roster block to reach. Ethics opinions locate the conflict in
 *  PAID, PERSONALIZED services to currently-graded students — so 'tutoring_only' is the default,
 *  and broader scopes are a district-configurable dial rather than a Plajah policy. */
export type BlockScope = 'tutoring_only' | 'all_paid' | 'all';

export type OfferingType = 'tutoring' | 'course' | 'workshop' | 'event';

export interface ConflictCheckResult {
  blocked: boolean;
  reason?: 'ROSTER_MATCH';
  /** Neutral, non-disclosing copy for the checkout surface. Never says "roster". */
  message?: string;
}

export const NEUTRAL_BLOCK_MESSAGE =
  "This educator isn't available to you for paid sessions right now.";

export const DEFAULT_INTEGRITY_SETTINGS: IntegritySettings = {
  campusSilentMode: 'auto',
  geofences: [],
  scheduleFence: { enabled: false, timezone: 'America/Detroit', contractHours: [] },
  disclosureAcknowledged: null,
};

// ── Paths ─────────────────────────────────────────────────────────────────────

const INTEGRITY_DOC = (uid: string) => doc(db, 'teacherIntegrity', uid);
const LOG_COL = (uid: string) => collection(db, 'integrityLog', uid, 'events');
const ROSTER_DOC = (uid: string, termId: string) => doc(db, 'districtPersona', uid, 'rosters', termId);

// ── Settings ──────────────────────────────────────────────────────────────────

export async function loadIntegrity(uid: string): Promise<TeacherIntegrityDoc | null> {
  try {
    const snap = await getDoc(INTEGRITY_DOC(uid));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<TeacherIntegrityDoc>;
    return {
      uid,
      personas: {
        district: d.personas?.district ?? null,
        independent: d.personas?.independent ?? null,
      },
      // Merge over defaults so a doc written by an older build never yields undefined fields.
      integritySettings: { ...DEFAULT_INTEGRITY_SETTINGS, ...(d.integritySettings ?? {}) },
      updatedAt: d.updatedAt ?? 0,
    };
  } catch (e) {
    console.warn('[integrity] load failed:', (e as Error)?.message);
    return null;
  }
}

/** Ensures a doc exists for a teacher, seeded with safe defaults. */
export async function ensureIntegrityDoc(uid: string): Promise<TeacherIntegrityDoc> {
  const existing = await loadIntegrity(uid);
  if (existing) return existing;
  const fresh: TeacherIntegrityDoc = {
    uid,
    personas: { district: null, independent: null },
    integritySettings: DEFAULT_INTEGRITY_SETTINGS,
    updatedAt: Date.now(),
  };
  try { await setDoc(INTEGRITY_DOC(uid), fresh, { merge: true }); } catch { /* non-fatal */ }
  return fresh;
}

export async function saveIntegritySettings(uid: string, settings: IntegritySettings): Promise<boolean> {
  // Guard the invariant client-side too, so the UI can explain the refusal rather than
  // surfacing a raw permission-denied from the rules layer.
  const current = await loadIntegrity(uid);
  if (settings.campusSilentMode === 'off' && current?.personas.district?.active) {
    console.warn('[integrity] refusing to disable Silent Mode with an active district persona');
    return false;
  }
  try {
    await setDoc(
      INTEGRITY_DOC(uid),
      { uid, integritySettings: settings, updatedAt: Date.now() },
      { merge: true },
    );
    return true;
  } catch (e) {
    console.warn('[integrity] save failed:', (e as Error)?.message);
    return false;
  }
}

export async function setDistrictPersona(uid: string, persona: DistrictPersona): Promise<boolean> {
  try {
    await setDoc(INTEGRITY_DOC(uid), { uid, personas: { district: persona }, updatedAt: Date.now() }, { merge: true });
    await appendIntegrityEvent(uid, { kind: 'persona_activated', note: `district:${persona.districtId}` });
    return true;
  } catch { return false; }
}

export async function setIndependentPersona(uid: string, persona: IndependentPersona): Promise<boolean> {
  try {
    await setDoc(INTEGRITY_DOC(uid), { uid, personas: { independent: persona }, updatedAt: Date.now() }, { merge: true });
    await appendIntegrityEvent(uid, { kind: 'persona_activated', note: 'independent' });
    return true;
  } catch { return false; }
}

export async function acknowledgeDisclosure(uid: string): Promise<boolean> {
  const current = await ensureIntegrityDoc(uid);
  const at = Date.now();
  const ok = await saveIntegritySettings(uid, { ...current.integritySettings, disclosureAcknowledged: at });
  if (ok) await appendIntegrityEvent(uid, { kind: 'disclosure_ack' });
  return ok;
}

// ── Integrity log ─────────────────────────────────────────────────────────────
// Append-only by rule. Client appends are best-effort; the server writes the entries that
// matter legally (silent-mode transitions, conflict blocks) so a tampered client can't
// fabricate or suppress them.

export async function appendIntegrityEvent(
  uid: string,
  event: { kind: IntegrityEventKind; trigger?: SilentModeTrigger; schoolId?: string; note?: string },
): Promise<void> {
  try {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(LOG_COL(uid), id), {
      at: Date.now(),
      kind: event.kind,
      ...(event.trigger ? { trigger: event.trigger } : {}),
      ...(event.schoolId ? { schoolId: event.schoolId } : {}),
      ...(event.note ? { note: event.note } : {}),
    });
  } catch { /* non-fatal — never block the teacher's flow on a log write */ }
}

export async function loadIntegrityLog(uid: string, max = 250): Promise<IntegrityEvent[]> {
  try {
    // Single-field ordering only — no composite index required.
    const snap = await getDocs(query(LOG_COL(uid), orderBy('at', 'desc'), limit(max)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<IntegrityEvent, 'id'>) }));
  } catch (e) {
    console.warn('[integrity] log read failed:', (e as Error)?.message);
    return [];
  }
}

const EVENT_LABEL: Record<IntegrityEventKind, string> = {
  silent_enter: 'Silent Mode engaged',
  silent_exit: 'Silent Mode released',
  disclosure_ack: 'District disclosure acknowledged',
  conflict_block: 'Paid booking blocked (conflict check)',
  roster_submitted: 'Roster submitted (hashed)',
  roster_expired: 'Roster expired at term end',
  persona_activated: 'Persona activated',
};

/** The export the teacher hands to HR: proof they never operated on district time. */
export function integrityLogToCsv(events: IntegrityEvent[]): string {
  const rows = [
    ['Timestamp (local)', 'Event', 'Trigger', 'School', 'Note'].join(','),
    ...events.map(e => [
      new Date(e.at).toLocaleString(),
      EVENT_LABEL[e.kind] ?? e.kind,
      e.trigger ?? '',
      e.schoolId ?? '',
      e.note ?? '',
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ];
  return rows.join('\n');
}

export const eventLabel = (kind: IntegrityEventKind): string => EVENT_LABEL[kind] ?? kind;

// ── Roster hashing (on-device) ────────────────────────────────────────────────
// The teacher (or a district SDK) hashes student references BEFORE they leave the device.
// Plajah stores only sha256(salt + normalizedRef), so a full database read cannot reconstruct
// which students a teacher teaches — and no education record in identifiable form is ever
// ingested. The salt is district-scoped and supplied by the district, not by Plajah.

const normalizeStudentRef = (ref: string) =>
  ref.trim().toLowerCase().replace(/\s+/g, ' ');

export async function hashStudentRef(ref: string, districtSalt: string): Promise<string> {
  const data = new TextEncoder().encode(`${districtSalt}:${normalizeStudentRef(ref)}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface RosterSubmission {
  termId: string;          // e.g. '2026-fall'
  districtId: string;
  schoolId: string;
  blockScope: BlockScope;
  expiresAt: number;       // term end — the conflict dies with grading power
  studentRefs: string[];   // RAW on this device only; hashed before the write below
  districtSalt: string;
}

/** Hashes on-device, then writes only the hashes. Raw refs never leave this function. */
export async function submitRoster(uid: string, sub: RosterSubmission): Promise<{ ok: boolean; count: number }> {
  try {
    const students = await Promise.all(sub.studentRefs.map(r => hashStudentRef(r, sub.districtSalt)));
    await setDoc(ROSTER_DOC(uid, sub.termId), {
      districtId: sub.districtId,
      schoolId: sub.schoolId,
      blockScope: sub.blockScope,
      students,
      expiresAt: sub.expiresAt,
      submittedAt: Date.now(),
    });
    await appendIntegrityEvent(uid, {
      kind: 'roster_submitted',
      schoolId: sub.schoolId,
      note: `${students.length} hashed refs · term ${sub.termId}`,
    });
    return { ok: true, count: students.length };
  } catch (e) {
    console.warn('[integrity] roster submit failed:', (e as Error)?.message);
    return { ok: false, count: 0 };
  }
}

export interface RosterSummary {
  termId: string;
  schoolId: string;
  count: number;
  expiresAt: number;
  expired: boolean;
  blockScope: BlockScope;
}

/** District-persona read. Deliberately NOT exported through any creator/checkout surface. */
export async function loadRosterSummaries(uid: string): Promise<RosterSummary[]> {
  try {
    const snap = await getDocs(collection(db, 'districtPersona', uid, 'rosters'));
    const now = Date.now();
    return snap.docs.map(d => {
      const data = d.data() as any;
      return {
        termId: d.id,
        schoolId: data.schoolId ?? '',
        count: (data.students as string[] | undefined)?.length ?? 0,
        expiresAt: data.expiresAt ?? 0,
        expired: (data.expiresAt ?? 0) <= now,
        blockScope: (data.blockScope ?? 'tutoring_only') as BlockScope,
      };
    }).sort((a, b) => b.expiresAt - a.expiresAt);
  } catch { return []; }
}

// ── Server bridge (/api/academia/*) ───────────────────────────────────────────

async function authedFetch(path: string, body: unknown): Promise<any | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    // Force-refresh: hot-switching accounts otherwise sends the previous account's token
    // (see [[plajah-upload-auth-multiaccount]]), and this endpoint is identity-critical.
    const token = await user.getIdToken(true);
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[integrity] api call failed:', path, (e as Error)?.message);
    return null;
  }
}

/**
 * The ONLY bridge across the wall. Called by checkout/booking before capturing payment on any
 * paid offering. Returns booleans; never a roster record, never which term matched.
 *
 * FAILS CLOSED for paid 1:1: if the server is unreachable we cannot prove the absence of a
 * conflict, and the cost of a wrong "allow" (a teacher taking money from a student they grade)
 * is far higher than the cost of a wrong "block" (one delayed booking).
 */
export async function conflictCheck(params: {
  creatorUid: string;
  purchaserRef: string;   // raw ref, hashed server-side against the district salt; never stored
  offeringType: OfferingType;
  isPaid: boolean;
}): Promise<ConflictCheckResult> {
  if (!params.isPaid) return { blocked: false }; // free interactions are never a conflict
  const out = await authedFetch('/api/academia/conflict-check', params);
  if (!out) {
    const oneToOne = params.offeringType === 'tutoring';
    return oneToOne
      ? { blocked: true, reason: 'ROSTER_MATCH', message: NEUTRAL_BLOCK_MESSAGE }
      : { blocked: false };
  }
  return out.blocked
    ? { blocked: true, reason: 'ROSTER_MATCH', message: NEUTRAL_BLOCK_MESSAGE }
    : { blocked: false };
}

/**
 * Mirrors Silent Mode into a custom auth claim so the rules layer blocks Independent-persona
 * writes even if a modified client ignores the UI lock. The ID token is refreshed afterwards
 * so the new claim is live on the very next Firestore write rather than up to an hour later.
 */
export async function pushSilentModeState(state: {
  engaged: boolean;
  trigger: SilentModeTrigger;
  schoolId?: string;
}): Promise<boolean> {
  const out = await authedFetch('/api/academia/silent-mode', state);
  try { await auth.currentUser?.getIdToken(true); } catch { /* claim lands on next refresh */ }
  return !!out?.ok;
}
