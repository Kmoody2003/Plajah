// eviteClient — the guest-side API (no account, no Firebase import: the /i/:id page stays light).
// The guest's RSVP token is kept on this device only; it is the key to edit their own answer.
import type { EvitePublicView, RsvpStatus } from './eviteTypes';

export interface GuestMe { name: string; status: RsvpStatus; adults: number; kids: number; note?: string; answers?: Record<string, string>; bringing?: string[] }
export interface GuestRsvpInput { name: string; status: 'yes' | 'maybe' | 'no'; adults: number; kids: number; contact?: string; note?: string; answers?: Record<string, string>; bringing?: string[] }

export interface EviteGuestApi {
  load(id: string): Promise<{ invite: EvitePublicView; me: GuestMe | null }>;
  rsvp(id: string, input: GuestRsvpInput): Promise<{ status: RsvpStatus; waitlisted: boolean; invite: EvitePublicView; me: GuestMe | null }>;
  note(id: string, name: string, text: string): Promise<void>;
  gift(id: string, input: { amountCents: number; name?: string; note?: string; coverFees: boolean }): Promise<{ url: string }>;
  icsUrl(id: string): string;
  qrUrl(id: string, to?: 'event'): string;
}

const KEY = (id: string) => `pj-evite-rsvp:${id}`;
export const savedToken = (id: string): string | null => { try { return localStorage.getItem(KEY(id)); } catch { return null; } };
const saveToken = (id: string, t: string) => { try { localStorage.setItem(KEY(id), t); } catch { /* private mode: the answer still saved server-side */ } };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.error || 'Something went wrong. Please try again.'), { status: r.status });
  return data as T;
}
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const httpGuestApi: EviteGuestApi = {
  async load(id) {
    const t = savedToken(id) || new URLSearchParams(location.search).get('t');
    if (t && !savedToken(id)) saveToken(id, t);                 // opened from a personal edit link on a new device
    return call(`/api/evite/${encodeURIComponent(id)}/public${t ? `?t=${encodeURIComponent(t)}` : ''}`);
  },
  async rsvp(id, input) {
    const r: any = await call(`/api/evite/${encodeURIComponent(id)}/rsvp`, post({ ...input, token: savedToken(id) || undefined, via: new URLSearchParams(location.search).get('v') || undefined }));
    if (r.token) saveToken(id, r.token);
    return r;
  },
  async note(id, name, text) { await call(`/api/evite/${encodeURIComponent(id)}/wall`, post({ name, text })); },
  async gift(id, input) { return call(`/api/evite/${encodeURIComponent(id)}/gift`, post(input)); },
  icsUrl: id => `/api/evite/${encodeURIComponent(id)}/ics`,
  qrUrl: (id, to) => `/api/evite/${encodeURIComponent(id)}/qr.svg${to === 'event' ? '?to=event' : ''}`,
};

/** A guest's private link that re-opens their own answer on another device. Never shown unless they ask. */
export const personalLink = (origin: string, id: string): string | null => { const t = savedToken(id); return t ? `${origin}/i/${id}?t=${encodeURIComponent(t)}` : null; };
