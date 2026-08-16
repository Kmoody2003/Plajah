/**
 * praxisService — the founder's "Venture" (their business-in-progress) and its
 * living plan (the Blueprint).
 *
 * First slice persists to localStorage keyed by uid so the whole experience is
 * real and durable without waiting on Firestore rules/indexes (see
 * plajah-firestore-gotchas). The Venture shape is intentionally Firestore-ready
 * — a later phase lifts it to `ventures/{id}` unchanged.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { addPoints } from './pointsService';
import { db } from './firebase';
import type { FounderBand } from '../data/praxisJourney';

const VENTURES_COLLECTION = 'ventures';

export interface Venture {
  id: string;
  ownerUid: string;
  name: string;
  thesis: string;          // one-line venture thesis
  purpose: string;         // your "why"
  serves: string;          // who you serve
  archetype: string;       // ARCHETYPES id
  jurisdiction: { country: string; state: string; city?: string };
  band: FounderBand;       // founder level → depth of every lesson
  mode: 'real' | 'simulate';
  currentStage: string;
  completedStages: string[];
  plan: Record<string, string>;   // stage/section key -> content (the Blueprint)
  createdAt: number;
  updatedAt: number;
}

const keyFor = (uid?: string | null) => `praxis_venture_${uid || 'guest'}`;

export function newVenture(uid: string | null | undefined, seed: Partial<Venture>): Venture {
  const now = Date.now();
  return {
    id: `v_${now.toString(36)}`,
    ownerUid: uid || 'guest',
    name: seed.name?.trim() || 'My venture',
    thesis: seed.thesis?.trim() || '',
    purpose: seed.purpose?.trim() || '',
    serves: seed.serves?.trim() || '',
    archetype: seed.archetype || 'local_service',
    jurisdiction: seed.jurisdiction || { country: 'US', state: '' },
    band: seed.band || 'new',
    mode: seed.mode || 'real',
    currentStage: 'spark',
    completedStages: [],
    plan: seed.plan || {},
    createdAt: now,
    updatedAt: now,
  };
}

export function loadVenture(uid?: string | null): Venture | null {
  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (!raw) return null;
    return JSON.parse(raw) as Venture;
  } catch {
    return null;
  }
}

export function saveVenture(v: Venture): Venture {
  const next = { ...v, updatedAt: Date.now() };
  try { localStorage.setItem(keyFor(v.ownerUid), JSON.stringify(next)); } catch { /* quota — non-fatal */ }
  saveVentureRemote(next);
  return next;
}

/**
 * Fire-and-forget sync to Firestore `ventures/{uid}`. Never blocks the UI; if it
 * fails (offline, or rules not yet deployed) the localStorage copy is the source
 * of truth. Guests (no real uid) never touch Firestore. JSON round-trip strips
 * undefined — Firestore rejects undefined fields (see plajah-firestore-gotchas).
 */
export function saveVentureRemote(v: Venture): void {
  if (!v.ownerUid || v.ownerUid === 'guest') return;
  try {
    const clean = JSON.parse(JSON.stringify(v));
    setDoc(doc(db, VENTURES_COLLECTION, v.ownerUid), clean, { merge: true }).catch(() => { /* offline / denied → local wins */ });
  } catch { /* noop */ }
}

/**
 * Load the venture, reconciling the local cache with Firestore by updatedAt.
 * Returns instantly-usable data and, when signed in, prefers whichever copy is
 * newer (so a venture started on one device shows up on another).
 */
export async function loadVentureFor(uid?: string | null): Promise<Venture | null> {
  const local = loadVenture(uid);
  if (!uid || uid === 'guest') return local;
  try {
    const snap = await getDoc(doc(db, VENTURES_COLLECTION, uid));
    const remote = snap.exists() ? (snap.data() as Venture) : null;
    if (remote && (!local || (remote.updatedAt || 0) >= (local.updatedAt || 0))) {
      try { localStorage.setItem(keyFor(uid), JSON.stringify(remote)); } catch { /* noop */ }
      return remote;
    }
    if (local && (!remote || (local.updatedAt || 0) > (remote.updatedAt || 0))) {
      saveVentureRemote(local); // push the newer local copy up
    }
    return local || remote;
  } catch {
    return local; // offline / permission → localStorage is fine
  }
}

export function clearVenture(uid?: string | null): void {
  try { localStorage.removeItem(keyFor(uid)); } catch { /* noop */ }
}

/** Merge plan sections and persist. */
export function updatePlan(v: Venture, patch: Record<string, string>): Venture {
  return saveVenture({ ...v, plan: { ...v.plan, ...patch } });
}

/** Mark a stage complete (idempotent), advance, persist. */
export function completeStage(v: Venture, stageKey: string, nextStage?: string): Venture {
  const completedStages = v.completedStages.includes(stageKey)
    ? v.completedStages
    : [...v.completedStages, stageKey];
  return saveVenture({ ...v, completedStages, currentStage: nextStage || v.currentStage });
}

/** Real Plajah Points for progress (signed-in only). Mirrors the Quest pattern. */
export async function awardPraxisPoints(uid: string, entityId: string, amount = 15): Promise<number> {
  try {
    await addPoints(uid, amount, 'DAILY_ACTIVITY', 'praxis', entityId);
  } catch { /* points are a nicety, never block progress */ }
  return amount;
}
