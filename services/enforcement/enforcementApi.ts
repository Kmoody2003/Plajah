/** Client for routes/enforcement.ts (Fair Process). */
import { auth } from '../firebase';
import type { Capabilities, StandingLevel, ContentRef, AppealOutcome } from './standingCore';

export interface EnforcementActionRecord {
  id: string; uid: string; contentRef: ContentRef | null; rule: string; ruleText: string; level: StandingLevel;
  restrictions: string[]; expiresAt: number | null; createdAt: number; createdBy: string; status: string;
  correction?: { at: number; note: string | null; slaDueAt: number; accepted?: boolean; decidedAt?: number } | null;
  csam?: boolean; withheld?: boolean; reviewerNote?: string | null; lastAppealId?: string | null;
  history?: Array<{ at: number; kind: string }>;
}
export interface AppealRecord {
  id: string; uid: string; actionId: string; level: StandingLevel; statement: string; evidence: string[];
  correctionTaken: string | null; status: 'PENDING' | 'UPHELD' | 'MODIFIED' | 'OVERTURNED'; createdAt: number; slaDueAt: number;
  requiresSecondReviewer: boolean; actionCreatedBy: string; timeline: Array<{ at: number; kind: string; note: string }>;
  decidedBy: string | null; decidedAt: number | null; decisionNote: string | null; outcome: AppealOutcome | null;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const u = auth.currentUser;
  if (!u) throw new Error('Please sign in.');
  const t = await u.getIdToken();
  const res = await fetch(`/api/enforcement${path}`, {
    method: init?.method || 'GET',
    headers: { Authorization: `Bearer ${t}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `Request failed (${res.status})`);
  return j as T;
}

export const getMyStanding = () => call<{ standing: Capabilities; actions: EnforcementActionRecord[]; appeals: AppealRecord[]; now: number }>('/me');
export const fileAppeal = (body: { actionId: string; statement: string; evidence?: string[]; correctionTaken?: string }) =>
  call<{ ok: true; appeal: AppealRecord }>('/appeal', { method: 'POST', body });
export const reportCorrection = (actionId: string, note?: string) => call<{ ok: true }>('/correct', { method: 'POST', body: { actionId, note: note || '' } });

// Admin
export const getEnforcementQueue = () => call<{ appeals: AppealRecord[]; corrections: EnforcementActionRecord[]; actions: Record<string, EnforcementActionRecord>; now: number }>('/queue');
export const createEnforcementAction = (body: {
  uid: string; level: StandingLevel; rule: string; ruleText: string; contentRef?: ContentRef | null;
  durationHours: number | null; indefinite?: boolean; reportIds?: string[]; note?: string;
}) => call<{ ok: true; action: EnforcementActionRecord }>('/action', { method: 'POST', body });
export const decideAppeal = (id: string, body: { outcome: AppealOutcome; note: string; level?: StandingLevel; durationHours?: number | null }) =>
  call<{ ok: true }>(`/appeal/${encodeURIComponent(id)}/decide`, { method: 'POST', body });
export const decideCorrection = (actionId: string, accept: boolean, note: string) =>
  call<{ ok: true }>(`/correction/${encodeURIComponent(actionId)}/decide`, { method: 'POST', body: { accept, note } });
