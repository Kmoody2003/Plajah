/**
 * Client side of business staff seats (see services/businessStaffCore.ts for the model).
 * Seats are created and changed only through the server (routes/businessStaff.ts); the client lists them.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { BusinessPage } from '../types';
import type { BizPerm, StaffInviteSummary, StaffSeatRole } from './businessStaffCore';

const BASE = '/api/business/staff';

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in first.');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export const createStaffInvite = (input: { pageId: string; role: StaffSeatRole; roleKey?: string; roleLabel?: string; perms?: BizPerm[]; staffMemberId?: string }) =>
  call<{ code: string; expiresAt: number }>('/invite', input);
export const lookupStaffInvite = (code: string) => call<StaffInviteSummary>('/lookup', { code });
export const redeemStaffInvite = (code: string) => call<{ pageId: string }>('/redeem', { code });
export const updateStaffSeat = (input: { pageId: string; uid: string; role?: StaffSeatRole; perms?: BizPerm[]; roleLabel?: string }) => call<{ ok: true }>('/update', input);
export const removeStaffSeat = (pageId: string, uid: string) => call<{ ok: true }>('/remove', { pageId, uid });
export const listStaffInvites = (pageId: string) =>
  call<{ invites: { id: string; role: StaffSeatRole; roleLabel?: string; perms: BizPerm[]; expiresAt: number; createdAt: number }[] }>(`/invites?pageId=${encodeURIComponent(pageId)}`, undefined, 'GET');
export const revokeStaffInvite = (inviteId: string) => call<{ ok: true }>('/revoke', { inviteId });

/** Business pages the user works at (seated staff), not counting ones they own. */
export async function fetchStaffBusinessPages(uid: string): Promise<BusinessPage[]> {
  const snap = await getDocs(query(collection(db, 'businessPages'), where('staffUids', 'array-contains', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessPage)).filter(p => p.ownerId !== uid);
}

// ── Opening a business workspace from anywhere (switcher, join flow, notifications) ──
const OPEN_KEY = 'plajah:bizOpenPage';

/** Ask the business dashboard to open a specific page, then navigate there. */
export function openBusinessWorkspace(pageId: string) {
  try { sessionStorage.setItem(OPEN_KEY, pageId); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('plajah:openBusinessPage', { detail: { pageId } }));
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'BUSINESS_DASHBOARD', params: { pageId } } }));
}

/** Read (and clear) the page the dashboard was asked to open. */
export function takeRequestedBusinessPage(): string | null {
  try { const v = sessionStorage.getItem(OPEN_KEY); if (v) sessionStorage.removeItem(OPEN_KEY); return v; } catch { return null; }
}
