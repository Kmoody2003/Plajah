// Mobilizon bridge — publish a PUBLIC Plajah org event to a Mobilizon instance over its GraphQL API (POST /api).
//
// Flow: login(email, password) → { accessToken, refreshToken }; loggedPerson → organizer actor id; createEvent(...).
// The password is used once and dropped; the access + refresh tokens are stored encrypted. Mobilizon access tokens
// are short-lived, so publish() refreshes once on an auth error and hands back the rotated tokens to persist.
//
// API notes (checked against Mobilizon 3.x/4.x schema from memory, not against a live server):
//   • `login`, `refreshToken`, `loggedPerson`, `createEvent` exist with these argument names.
//   • `beginsOn`/`endsOn` are DateTime (ISO 8601); `visibility: PUBLIC`; `draft: false`.
//   • `physicalAddress` is AddressInput; its `geom` is a "lon;lat" string — the least certain field here, so it is
//     only sent when both coordinates exist.

import { type NetDeps, OpenNetworkError, netFetch, clean, textToHtml, federationBlockReason, safeLink } from './common';

export interface MobilizonTokens { accessToken: string; refreshToken?: string }
export interface MobilizonIdentity { actorId: string; username: string; name?: string }

async function gql<T = any>(deps: NetDeps, server: string, query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const r = await netFetch(deps, `${server}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const j: any = r.json;
  if (!j) throw new OpenNetworkError(502, `Mobilizon answered HTTP ${r.status} without JSON`, 'bad-response');
  if (Array.isArray(j.errors) && j.errors.length) {
    const msg = clean(j.errors[0]?.message || 'Mobilizon error', 200);
    const unauth = /unauth|not logged|invalid.*token|expired/i.test(msg) || j.errors[0]?.status_code === 401;
    throw new OpenNetworkError(unauth ? 401 : 400, msg, unauth ? 'auth' : 'remote');
  }
  if (!r.ok) throw new OpenNetworkError(502, `Mobilizon answered HTTP ${r.status}`, 'remote');
  return j.data as T;
}

const LOGIN = `mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) { accessToken refreshToken }
}`;
const REFRESH = `mutation RefreshToken($refreshToken: String!) {
  refreshToken(refreshToken: $refreshToken) { accessToken refreshToken }
}`;
const ME = `query { loggedPerson { id preferredUsername name } }`;
const CREATE_EVENT = `mutation CreateEvent(
  $organizerActorId: ID!, $title: String!, $description: String!, $beginsOn: DateTime!, $endsOn: DateTime,
  $visibility: EventVisibility, $draft: Boolean, $onlineAddress: String, $externalParticipationUrl: String,
  $physicalAddress: AddressInput, $tags: [String], $joinOptions: EventJoinOptions
) {
  createEvent(
    organizerActorId: $organizerActorId, title: $title, description: $description, beginsOn: $beginsOn, endsOn: $endsOn,
    visibility: $visibility, draft: $draft, onlineAddress: $onlineAddress, externalParticipationUrl: $externalParticipationUrl,
    physicalAddress: $physicalAddress, tags: $tags, joinOptions: $joinOptions
  ) { id uuid url }
}`;

export async function mobilizonLogin(deps: NetDeps, server: string, email: string, password: string): Promise<{ tokens: MobilizonTokens; identity: MobilizonIdentity }> {
  if (!email || !password) throw new OpenNetworkError(400, 'Email and password required');
  const d = await gql<{ login: MobilizonTokens }>(deps, server, LOGIN, { email: clean(email, 254), password: String(password).slice(0, 1024) });
  if (!d?.login?.accessToken) throw new OpenNetworkError(401, 'Mobilizon did not return a token', 'auth');
  const identity = await mobilizonIdentity(deps, server, d.login.accessToken);
  return { tokens: { accessToken: d.login.accessToken, refreshToken: d.login.refreshToken }, identity };
}

export async function mobilizonIdentity(deps: NetDeps, server: string, token: string): Promise<MobilizonIdentity> {
  const d = await gql<{ loggedPerson: { id: string; preferredUsername: string; name?: string } | null }>(deps, server, ME, {}, token);
  if (!d?.loggedPerson?.id) throw new OpenNetworkError(400, 'This Mobilizon account has no profile (identity) yet', 'no-identity');
  return { actorId: String(d.loggedPerson.id), username: clean(d.loggedPerson.preferredUsername, 100), name: clean(d.loggedPerson.name, 120) || undefined };
}

export async function mobilizonRefresh(deps: NetDeps, server: string, refreshToken: string): Promise<MobilizonTokens> {
  const d = await gql<{ refreshToken: MobilizonTokens }>(deps, server, REFRESH, { refreshToken });
  if (!d?.refreshToken?.accessToken) throw new OpenNetworkError(401, 'Mobilizon session expired — reconnect', 'auth');
  return d.refreshToken;
}

/** The slice of PlajahEvent we read. */
export interface EventLike {
  id?: string; title?: string; subtitle?: string; description?: string; status?: string;
  startDate?: number; endDate?: number; timezone?: string;
  venueName?: string; venueAddress?: string; city?: string; state?: string; country?: string; lat?: number; lng?: number;
  streamUrl?: string; streamPassword?: string; virtualPlatform?: string;
  sanctuaryMembersOnly?: boolean; tags?: string[]; slug?: string; tiers?: Array<{ price?: number }>;
  host?: { kind: 'org' | 'business'; id: string; name?: string };
  creatorUid?: string;
  [k: string]: unknown;
}

const PUBLIC_STATUSES = new Set(['PUBLISHED', 'ON_SALE', 'SOLD_OUT']);

/** Why this event may not go to Mobilizon, or null when it may. */
export function eventBlockReason(ev: EventLike | null): string | null {
  if (!ev) return 'Event not found';
  if (!PUBLIC_STATUSES.has(String(ev.status))) return 'Only published, public events can be shared';
  if (ev.sanctuaryMembersOnly) return 'Members-only events stay on Plajah';
  const generic = federationBlockReason(ev as Record<string, any>);
  if (generic) return generic;
  if (!ev.title || !ev.startDate) return 'Event is missing a title or start time';
  if (typeof ev.endDate === 'number' && ev.endDate < Date.now() - 86_400_000) return 'This event is already over';
  return null;
}

export interface MobilizonEventInput {
  organizerActorId: string; title: string; description: string; beginsOn: string; endsOn?: string;
  visibility: 'PUBLIC'; draft: false; joinOptions: 'FREE' | 'EXTERNAL';
  externalParticipationUrl?: string; onlineAddress?: string; tags?: string[];
  physicalAddress?: { description?: string; street?: string; locality?: string; region?: string; country?: string; geom?: string };
}

/** PlajahEvent → createEvent variables. Stream links/passwords never leave; ticketing points back to Plajah. */
export function buildMobilizonEvent(ev: EventLike, organizerActorId: string, plajahUrl: string): MobilizonEventInput {
  const paid = Array.isArray(ev.tiers) && ev.tiers.some(t => Number(t?.price) > 0);
  const parts = [ev.subtitle, ev.description].map(s => clean(s, 8000)).filter(Boolean);
  parts.push(`${paid ? 'Tickets' : 'RSVP'} and details on Plajah: ${plajahUrl}`);
  const physical = ev.venueName || ev.venueAddress || ev.city
    ? {
        description: clean(ev.venueName || ev.venueAddress, 200) || undefined,
        street: clean(ev.venueAddress, 200) || undefined,
        locality: clean(ev.city, 100) || undefined,
        region: clean(ev.state, 100) || undefined,
        country: clean(ev.country, 100) || undefined,
        geom: typeof ev.lat === 'number' && typeof ev.lng === 'number' ? `${ev.lng};${ev.lat}` : undefined,
      }
    : undefined;
  const tags = (Array.isArray(ev.tags) ? ev.tags : []).map(t => clean(t, 40).replace(/^#/, '')).filter(Boolean).slice(0, 10);
  return {
    organizerActorId,
    title: clean(ev.title, 200),
    description: textToHtml(parts.join('\n\n')),
    beginsOn: new Date(Number(ev.startDate)).toISOString(),
    endsOn: ev.endDate ? new Date(Number(ev.endDate)).toISOString() : undefined,
    visibility: 'PUBLIC',
    draft: false,
    // Participation happens on Plajah (tickets, approvals, check-in), so Mobilizon points there.
    joinOptions: 'EXTERNAL',
    externalParticipationUrl: safeLink(plajahUrl),
    // A public online event gets the Plajah page, never the raw stream URL / password.
    onlineAddress: ev.streamUrl && !physical ? safeLink(plajahUrl) : undefined,
    tags: tags.length ? tags : undefined,
    physicalAddress: physical,
  };
}

export interface PublishResult { id: string; uuid?: string; url?: string; rotatedTokens?: MobilizonTokens }

export async function mobilizonCreateEvent(deps: NetDeps, server: string, tokens: MobilizonTokens, input: MobilizonEventInput): Promise<PublishResult> {
  const vars = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const run = (t: string) => gql<{ createEvent: { id: string; uuid?: string; url?: string } }>(deps, server, CREATE_EVENT, vars, t);
  let rotated: MobilizonTokens | undefined;
  let d;
  try {
    d = await run(tokens.accessToken);
  } catch (e) {
    if (!(e instanceof OpenNetworkError) || e.code !== 'auth' || !tokens.refreshToken) throw e;
    rotated = await mobilizonRefresh(deps, server, tokens.refreshToken);
    d = await run(rotated.accessToken);
  }
  if (!d?.createEvent?.id) throw new OpenNetworkError(502, 'Mobilizon did not confirm the event', 'remote');
  return { id: String(d.createEvent.id), uuid: d.createEvent.uuid, url: safeLink(d.createEvent.url), rotatedTokens: rotated };
}
