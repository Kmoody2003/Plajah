// Playing together — browser client for /api/gamer/party and /api/gamer/chat (routes/gamerTogether.ts).
// Non-throwing like services/gamerNet/client.ts: every call resolves to { ok, ... }.

import { auth } from '../firebase';
import type { ChatLine, QuickChat, ScopeAccess } from './chat';
import type { PartyMember } from './party';

const base = () => `${(import.meta as any).env?.VITE_APP_URL ?? window.location.origin}/api/gamer`;

export interface PartyView {
  id: string; leader: string; members: PartyMember[]; code: string; status: 'open' | 'closed'; game: string;
  match?: { id: string; game: string; seats: string[]; at: number; rt?: boolean }; v: number; createdAt: number; updatedAt: number; pendingInvites: number;
  teams?: Record<string, 0 | 1>; queue?: { id: string; game: string; at: number } | null;
  streaming?: { uid: string; at: number } | null; streamOk?: string[];
}
export interface PartyState { party: PartyView | null; voice: { available: boolean } }
export interface ChatPage { lines: ChatLine[]; seq: number; access: ScopeAccess; quick: QuickChat[] }
export interface VoiceGrant { url: string; token: string; room: string; identity: string; cap: number; exclude?: string[]; available: true }
export interface PartyPeek { party: { id: string; game: string; leader: string; members: Array<{ uid: string; name: string; photo: string }> }; invited: boolean }

export interface Fail { ok: false; error: string; httpStatus: number }
export type Res<T> = ({ ok: true } & T) | Fail;
export const failed = <T,>(r: Res<T>): r is Fail => r.ok === false;
export const myUid = () => auth.currentUser?.uid ?? null;

async function call<T>(method: string, path: string, body?: object): Promise<Res<T>> {
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(`${base()}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `Request failed (${res.status})`, httpStatus: res.status };
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, error: 'Connection lost — retrying', httpStatus: 0 };
  }
}

const enc = encodeURIComponent;

export const party = {
  me: () => call<PartyState>('GET', '/party/me'),
  create: (game?: string) => call<PartyState>('POST', '/party', { game }),
  joinCode: (code: string) => call<PartyState>('POST', '/party/join', { code }),
  acceptInvite: (partyId: string) => call<PartyState>('POST', '/party/join', { partyId }),
  peek: (partyId: string) => call<PartyPeek>('GET', `/party/peek/${enc(partyId)}`),
  leave: () => call<PartyState>('POST', '/party/leave'),
  kick: (uid: string) => call<PartyState>('POST', '/party/kick', { uid }),
  promote: (uid: string) => call<PartyState>('POST', '/party/promote', { uid }),
  setGame: (game: string) => call<PartyState>('POST', '/party/game', { game }),
  invite: (to: string) => call<PartyState>('POST', '/party/invite', { to }),
  play: (game: string, withUid?: string, meta?: Record<string, string | number | boolean>) =>
    call<PartyState & { matchId: string; code?: string; rt?: boolean }>('POST', '/party/play', { game, ...(withUid ? { with: withUid } : {}), ...(meta ? { meta } : {}) }),
  setTeam: (team: 0 | 1 | null, uid?: string) => call<PartyState>('POST', '/party/team', { team, uid }),
  queue: (game: string) => call<PartyState>('POST', '/party/queue', { game }),
  stopQueue: () => call<PartyState>('DELETE', '/party/queue'),
  stream: (on: boolean) => call<PartyState>('POST', '/party/stream', { on }),
  streamConsent: (ok: boolean) => call<PartyState>('POST', '/party/stream-consent', { ok }),
};

export const chat = {
  read: (scope: string, since = 0) => call<ChatPage>('GET', `/chat/${enc(scope)}?since=${since}`),
  say: (scope: string, text: string) => call<{ line: ChatLine }>('POST', `/chat/${enc(scope)}`, { text }),
  quick: (scope: string, quick: string) => call<{ line: ChatLine }>('POST', `/chat/${enc(scope)}`, { quick }),
  report: (scope: string, lineId: string, reason = '') => call<{ ok: boolean; duplicate: boolean }>('POST', `/chat/${enc(scope)}/report`, { lineId, reason }),
  voice: (scope: string) => call<VoiceGrant>('POST', '/chat/voice', { scope }),
};

// ── local mutes (per device; blocks are the server-side, account-wide version) ──
const MUTE_KEY = 'plajah.gamer.mutes';
export function mutedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || '[]')); } catch { return new Set(); }
}
export function setMuted(uid: string, on: boolean): Set<string> {
  const m = mutedSet(); if (on) m.add(uid); else m.delete(uid);
  try { localStorage.setItem(MUTE_KEY, JSON.stringify([...m].slice(-500))); } catch { /* private mode */ }
  return m;
}

// ── party dock opener: the dock mounts itself into <body> on first use ──
export const OPEN_PARTY_EVENT = 'plajah:open-party';
/** Invite someone from a profile or a chat: starts a party first if you aren't in one, then opens the dock. */
export async function inviteToParty(uid: string): Promise<Res<PartyState>> {
  const cur = await party.me();
  if (!failed(cur) && !cur.party) { const made = await party.create(); if (failed(made)) return made; }
  const r = await party.invite(uid);
  void openPartyDock();
  return r;
}
export type PartyTarget = { invite?: string } | undefined;
export async function openPartyDock(target?: PartyTarget): Promise<void> {
  const { showPartyDock } = await import('../../components/games/together/PartyDock');
  showPartyDock(target);
}
/** `game-party:<id>` notification links. */
export function openPartyLink(link: string): void {
  const id = link.startsWith('game-party:') ? link.slice('game-party:'.length) : '';
  void openPartyDock(id ? { invite: id } : undefined);
}
