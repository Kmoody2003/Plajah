// The browser's way to the security view. There is no client read of the audit log.
import { auth } from './firebase';
import type { HqSecurityAlert } from './hqSecurityAlerts';

type Scope = { kind: string; id: string };

async function headers(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Null means this person isn't allowed, or the server couldn't answer: no tab, no badge. */
export async function fetchHqAlerts(scope: Scope): Promise<{ alerts: HqSecurityAlert[]; newCount: number } | null> {
  try {
    const res = await fetch(`/api/hq/security/alerts?scopeKind=${encodeURIComponent(scope.kind)}&scopeId=${encodeURIComponent(scope.id)}`, { headers: await headers() });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function markHqAlertsSeen(scope: Scope): Promise<void> {
  await fetch('/api/hq/security/seen', { method: 'POST', headers: await headers(), body: JSON.stringify({ scopeKind: scope.kind, scopeId: scope.id }) }).catch(() => {});
}

export async function dismissHqAlert(scope: Scope, alertId: string): Promise<void> {
  await fetch('/api/hq/security/dismiss', { method: 'POST', headers: await headers(), body: JSON.stringify({ scopeKind: scope.kind, scopeId: scope.id, alertId }) }).catch(() => {});
}
