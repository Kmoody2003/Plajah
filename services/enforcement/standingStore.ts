/**
 * Client singleton for the signed-in user's account standing (Fair Process).
 * Subscribes to user_sanctions/{uid}; if the rules deny that read (the live rules set may lack the
 * block — docs/rules-patches/enforcement.rules.snippet) it falls back to GET /api/enforcement/me.
 * Capabilities are computed by the shared pure core so client and server agree.
 *
 * Client gating is a UX layer (explain, don't hide). Server routes enforce with requireCapability.
 */
import { doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { onSnapshot } from '../safeSnapshot';
import { capabilitiesFor, type Capabilities, type SanctionsDoc } from './standingCore';

export interface StandingState {
  uid: string | null;
  loading: boolean;
  sanctions: SanctionsDoc | null;
  caps: Capabilities;
}

const listeners = new Set<() => void>();
let state: StandingState = { uid: null, loading: true, sanctions: null, caps: capabilitiesFor(null, Date.now()) };
let started = false;
let unsubDoc: (() => void) | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function emit(next: Partial<StandingState>) {
  const merged = { ...state, ...next };
  merged.caps = capabilitiesFor(merged.sanctions, Date.now());
  state = merged;
  scheduleExpiry();
  listeners.forEach(l => { try { l(); } catch { /* ignore */ } });
}

/** Recompute when the next restriction lapses, so the UI unlocks on time without a reload. */
function scheduleExpiry() {
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  const at = state.caps.nextChangeAt;
  if (at == null) return;
  const ms = Math.min(Math.max(at - Date.now() + 500, 1000), 2_000_000_000);
  expiryTimer = setTimeout(() => emit({}), ms);
}

async function fetchMe(): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  try {
    const t = await u.getIdToken();
    const res = await fetch('/api/enforcement/me', { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) { emit({ loading: false }); return; }
    const j = await res.json();
    // Rebuild a SanctionsDoc-equivalent from the server's in-force reasons is lossy; instead use the
    // actions list (authoritative records) plus the server's criminal-review flag.
    const actions: Record<string, any> = {};
    for (const a of (j.actions || [])) actions[a.id] = a;
    const criminal = (j.standing?.reasons || []).find((r: any) => r.level === 'CRIMINAL_REVIEW' && r.status === 'UNDER_REVIEW');
    const legacy = (j.standing?.reasons || []).find((r: any) => r.actionId === 'legacy-suspension');
    emit({ loading: false, sanctions: { actions, criminalReview: criminal ? { active: true } : null, suspendedUntil: legacy?.expiresAt ?? null } });
  } catch { emit({ loading: false }); }
}

function attach(uid: string | null) {
  if (unsubDoc) { unsubDoc(); unsubDoc = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (!uid) { emit({ uid: null, loading: false, sanctions: null }); return; }
  emit({ uid, loading: true, sanctions: null });
  unsubDoc = onSnapshot(
    doc(db, 'user_sanctions', uid),
    snap => emit({ loading: false, sanctions: snap.exists() ? (snap.data() as SanctionsDoc) : null }),
    () => {
      // Permission denied / offline → server fallback, refreshed every 5 minutes.
      void fetchMe();
      if (!pollTimer) pollTimer = setInterval(() => { void fetchMe(); }, 5 * 60_000);
    },
  );
}

function start() {
  if (started) return;
  started = true;
  try { onAuthStateChanged(auth, u => attach(u?.uid ?? null)); } catch { emit({ loading: false }); }
}

export function subscribeStanding(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getStandingSnapshot(): StandingState { start(); return state; }

/** Force a refresh (e.g. after filing an appeal or a correction). */
export function refreshStanding(): void { void fetchMe(); }

/** Ask the mounted StandingBanner to open the Appeal Center (from the composer, go-live, etc.). */
export function openAppealCenter(actionId?: string | null, mode?: 'fix' | 'appeal' | null): void {
  try { window.dispatchEvent(new CustomEvent('pj:open-appeal-center', { detail: { actionId: actionId ?? null, mode: mode ?? null } })); } catch { /* ignore */ }
}
