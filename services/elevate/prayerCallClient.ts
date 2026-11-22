// Browser client for /api/elevate/prayer-call (routes/prayerCall.ts). Non-throwing: every call
// resolves to { ok, ... }. Labs swap the transport with configurePrayerCallClient.
import type { PrayerCallView } from './prayerCallCore';

export interface PrayerCallState { call: PrayerCallView | null; canStart: boolean; canJoin: boolean; media?: boolean }
export type MediaGrant =
  | { available: false; degraded?: boolean }
  | { available: true; url: string; token: string; room: string; identity: string; cap: number; endsAt: number };
export interface Fail { ok: false; error: string; status: number; reason?: string }
export type Res<T> = ({ ok: true } & T) | Fail;
export const failed = <T,>(r: Res<T>): r is Fail => r.ok === false;

interface ClientConfig { base: string; headers: () => Promise<Record<string, string>>; uid: () => string | null }

// Loaded lazily so labs that swap the transport never boot Firebase.
const firebaseAuth = async () => (await import('../backendService')).auth;
let uidSync: string | null = null;
let cfg: ClientConfig = {
  base: `${(import.meta as any).env?.VITE_APP_URL ?? ''}/api/elevate/prayer-call`,
  headers: async () => {
    const a = await firebaseAuth();
    uidSync = a.currentUser?.uid ?? null;
    const token = await a.currentUser?.getIdToken().catch(() => null);
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  uid: () => uidSync,
};

export function configurePrayerCallClient(next: Partial<ClientConfig>) { cfg = { ...cfg, ...next }; }
export const myUid = () => cfg.uid();

async function call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<Res<T>> {
  try {
    const res = await fetch(`${cfg.base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await cfg.headers()) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `Request failed (${res.status})`, status: res.status, reason: json?.reason };
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, error: 'Connection lost. Retrying…', status: 0 };
  }
}

const q = (orgId: string, ministryId: string) => `orgId=${encodeURIComponent(orgId)}&ministryId=${encodeURIComponent(ministryId)}`;

export const prayerCallApi = {
  state: (orgId: string, ministryId: string, here = false) => call<PrayerCallState>('GET', `/?${q(orgId, ministryId)}${here ? '&here=1' : ''}`),
  start: (orgId: string, ministryId: string, opts: { minutes?: number; requestsOn?: boolean; title?: string } = {}) =>
    call<{ call: PrayerCallView; existing?: boolean }>('POST', '/start', { orgId, ministryId, ...opts }),
  token: (orgId: string, ministryId: string) => call<MediaGrant>('POST', '/token', { orgId, ministryId }),
  end: (orgId: string, ministryId: string) => call<{ call?: PrayerCallView }>('POST', '/end', { orgId, ministryId }),
  remove: (orgId: string, ministryId: string, uid: string) => call<{ call: PrayerCallView }>('POST', '/remove', { orgId, ministryId, uid }),
  leave: (orgId: string, ministryId: string) => call<{}>('POST', '/leave', { orgId, ministryId }),
  addRequest: (orgId: string, ministryId: string, text: string) => call<{ call: PrayerCallView }>('POST', '/requests', { orgId, ministryId, op: 'add', text }),
  editRequest: (orgId: string, ministryId: string, id: string, op: 'prayed' | 'unprayed' | 'delete') => call<{ call: PrayerCallView }>('POST', '/requests', { orgId, ministryId, op, id }),
  toggleRequests: (orgId: string, ministryId: string, on: boolean) => call<{ call: PrayerCallView }>('POST', '/requests', { orgId, ministryId, op: 'toggle', on }),
};
