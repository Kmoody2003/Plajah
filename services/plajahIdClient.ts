// plajahIdClient — the browser side of Plajah ID (docs/plajah-id.md, routes/plajahId.ts).
// The identity records themselves are server-only; this asks the API and remembers the answer per account.

import { useEffect, useState } from 'react';
import { auth } from './backendService';

export interface IdentityEventView {
  seq: number; type: string; at: number; actor: string; data: Record<string, unknown>; prevHash: string; hash: string;
}
export interface IdentityHistory { id: string | null; events: IdentityEventView[]; verified: boolean; brokenAt?: number; reason?: string; controllers?: string[] }

const LS = (uid: string) => `plajah_id_v1:${uid}`;
const CHANGED = 'plajah:plajah-id';

async function call(path: string, method: 'GET' | 'POST' = 'GET'): Promise<any> {
  const u = auth.currentUser;
  const token = u ? await u.getIdToken().catch(() => null) : null;
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

export function cachedPlajahId(uid: string | undefined): string | null {
  if (!uid) return null;
  try { return localStorage.getItem(LS(uid)); } catch { return null; }
}

const inflight = new Map<string, Promise<string | null>>();

/** Make sure the signed-in account has its Plajah ID (minted on first call). Safe to call on every sign-in. */
export function ensureMyPlajahId(): Promise<string | null> {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return Promise.resolve(null);
  if (!inflight.has(u.uid)) {
    inflight.set(u.uid, (async () => {
      try {
        const r = await call('/api/plajah-id/me', 'POST');
        if (r.claimUpdated) await u.getIdToken(true).catch(() => {}); // pick up the new `pjid` claim
        if (r.id) {
          try { localStorage.setItem(LS(u.uid), r.id); } catch { /* */ }
          window.dispatchEvent(new CustomEvent(CHANGED));
        }
        return r.id || null;
      } catch {
        inflight.delete(u.uid); // try again next time
        return cachedPlajahId(u.uid);
      }
    })());
  }
  return inflight.get(u.uid)!;
}

export function useMyPlajahId(uid: string | undefined): string | null {
  const [id, setId] = useState<string | null>(() => cachedPlajahId(uid));
  useEffect(() => {
    setId(cachedPlajahId(uid));
    const on = () => setId(cachedPlajahId(uid));
    window.addEventListener(CHANGED, on);
    if (uid) ensureMyPlajahId().then(v => { if (v) setId(v); });
    return () => window.removeEventListener(CHANGED, on);
  }, [uid]);
  return id;
}

export const fetchMyIdentityHistory = (): Promise<IdentityHistory> => call('/api/plajah-id/me/history');
export const fetchOrgPlajahId = async (orgId: string): Promise<string | null> => (await call(`/api/plajah-id/org/${encodeURIComponent(orgId)}`)).id || null;
export const ensureOrgPlajahId = async (orgId: string): Promise<string | null> => (await call(`/api/plajah-id/org/${encodeURIComponent(orgId)}`, 'POST')).id || null;
export const fetchOrgIdentityHistory = (orgId: string): Promise<IdentityHistory> => call(`/api/plajah-id/org/${encodeURIComponent(orgId)}/history`);

/** The org's ID; an owner/admin viewing the page mints it on first visit. */
export function useOrgPlajahId(orgId: string | undefined, canMint: boolean): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!orgId) { setId(null); return; }
    let alive = true;
    fetchOrgPlajahId(orgId)
      .then(v => (v || !canMint ? v : ensureOrgPlajahId(orgId)))
      .then(v => { if (alive) setId(v || null); })
      .catch(() => { if (alive) setId(null); });
    return () => { alive = false; };
  }, [orgId, canMint]);
  return id;
}

export const EVENT_LABEL: Record<string, string> = {
  created: 'Identity created',
  login_linked: 'Sign-in linked',
  controller_added: 'Controller added',
  org_linked: 'Linked to organization page',
};
