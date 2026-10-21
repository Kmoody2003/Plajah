// services/creativeCloud/usage.ts — the signed-in user's creative storage, live.
//
// The authoritative number comes from the server, which sums the real Storage objects under the
// creative prefixes (routes/creativeStorage.ts) and writes users/{uid}/storageUsage/current
// (server-only). Between recounts, this module adjusts its copy as syncs add or free bytes so
// the meter moves immediately. Enforcement is off unless config/storagePolicy says otherwise.

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { evaluateCreativeQuota, quotaClassOf, type CreativeUsage } from './policy';

let cached: CreativeUsage | null = null;
let enforcedCache: { value: boolean; at: number } | null = null;
const listeners = new Set<(u: CreativeUsage | null) => void>();

function publish() {
  for (const l of listeners) l(cached);
}

/** Is the creative quota enforced? Missing / unreadable config = not enforced. */
export async function isCreativeQuotaEnforced(): Promise<boolean> {
  if (enforcedCache && Date.now() - enforcedCache.at < 5 * 60_000) return enforcedCache.value;
  let value = false;
  try {
    const snap = await getDoc(doc(db, 'config', 'storagePolicy'));
    value = snap.exists() && snap.data()?.enforceCreativeQuota === true;
  } catch {
    value = false;
  }
  enforcedCache = { value, at: Date.now() };
  return value;
}

/** Asks the server to recount (it lists the user's creative files). */
export async function refreshCreativeUsage(): Promise<CreativeUsage | null> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return null;
  try {
    const res = await fetch('/api/creative-storage/usage', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cached = (await res.json()) as CreativeUsage;
  } catch (err) {
    console.warn('[creativeCloud] usage recount failed', err);
  }
  publish();
  return cached;
}

/** Called by the sync engine as bytes are added (+) or freed (−). */
export function noteCloudBytes(kind: string, delta: number) {
  if (!cached || !delta) return;
  const byKind = { ...cached.byKind, [kind]: Math.max(0, (cached.byKind[kind] ?? 0) + delta) };
  cached =
    quotaClassOf(kind) === 'counted'
      ? { ...cached, byKind, countedBytes: Math.max(0, cached.countedBytes + delta) }
      : { ...cached, byKind, exemptBytes: Math.max(0, cached.exemptBytes + delta) };
  publish();
}

/** May a save of this size go to the cloud? Always yes while enforcement is off. */
export async function quotaAllowsSave(kind: string, incomingBytes: number): Promise<boolean> {
  const enforced = await isCreativeQuotaEnforced();
  if (!enforced) return true;
  const usage = cached ?? (await refreshCreativeUsage());
  if (!usage) return true; // can't measure → don't block the author's work
  return evaluateCreativeQuota({
    kind,
    usedBytes: usage.countedBytes,
    incomingBytes,
    limitBytes: usage.limitBytes,
    enforced,
  }).allowed;
}

/** Live creative-storage usage for meters (recounts on mount). */
export function useCreativeStorageUsage(): { usage: CreativeUsage | null; refresh: () => Promise<CreativeUsage | null> } {
  const [usage, setUsage] = useState<CreativeUsage | null>(cached);
  useEffect(() => {
    listeners.add(setUsage);
    void refreshCreativeUsage();
    return () => {
      listeners.delete(setUsage);
    };
  }, []);
  return { usage, refresh: refreshCreativeUsage };
}
