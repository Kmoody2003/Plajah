// Gamer Network parties — pure. A party is a small group of friends that follows you from game to game: one
// chat (scope party_<id>), one voice room, and a leader who picks the game and starts matches. Party docs
// change only through these functions inside a compare-and-swap (routes/gamerTogether.ts).
//
// One party per person (gamerPartyOf/{uid} → partyId); joining a new party leaves the old one.

export const MAX_PARTY = 8;
export const MAX_PENDING_INVITES = 20;
/** Invites expire after an hour. */
export const INVITE_TTL_MS = 60 * 60_000;

export interface PartyMember { uid: string; name: string; photo: string; isChild: boolean; joinedAt: number }
export interface PartyInvite { uid: string; by: string; at: number }

export interface PartyDoc {
  id: string;
  leader: string;
  members: PartyMember[];
  code: string;
  status: 'open' | 'closed';
  /** The game the leader picked (a registry id or a Plajah Originals id). */
  game: string;
  invites: PartyInvite[];
  /** The latest match the leader started for the party; members' docks jump into it. */
  match?: { id: string; game: string; seats: string[]; at: number };
  /** Team channels inside the party (0 = Team A, 1 = Team B); members without a team stay in party voice. */
  teams?: Record<string, 0 | 1>;
  /** The leader sent everyone into matchmaking for this game; each member's dock queues and opens its match. */
  queue?: { id: string; game: string; at: number } | null;
  /** A member is broadcasting party voice into their live stream. Only members in streamOk are mixed in. */
  streaming?: { uid: string; at: number } | null;
  /** Members who agreed to be heard on that stream. Cleared whenever the streamer changes. */
  streamOk?: string[];
  v: number;
  createdAt: number;
  updatedAt: number;
}

export type PartyStep = { ok: true; doc: PartyDoc; note?: string } | { ok: false; error: string; status: number };

const bump = (d: PartyDoc, now: number, patch: Partial<PartyDoc>): PartyDoc => ({ ...d, ...patch, v: d.v + 1, updatedAt: now });
const liveInvites = (d: PartyDoc, now: number) => d.invites.filter(i => now - i.at < INVITE_TTL_MS);

export function newParty(p: { id: string; code: string; leader: PartyMember; game?: string; now: number }): PartyDoc {
  return { id: p.id, leader: p.leader.uid, members: [{ ...p.leader, joinedAt: p.now }], code: p.code, status: 'open', game: p.game ?? '', invites: [], v: 1, createdAt: p.now, updatedAt: p.now };
}

export const isMember = (d: PartyDoc | null | undefined, uid: string) => !!d && d.status === 'open' && d.members.some(m => m.uid === uid);

/** Join by code (anyone with the code) or by invite (`viaInvite` — must hold a live invite). */
export function join(d: PartyDoc, who: PartyMember, now: number, viaInvite = false): PartyStep {
  if (d.status !== 'open') return { ok: false, error: 'That party has ended', status: 410 };
  if (d.members.some(m => m.uid === who.uid)) return { ok: true, doc: d };
  if (viaInvite && !liveInvites(d, now).some(i => i.uid === who.uid)) return { ok: false, error: 'That invite has expired', status: 410 };
  if (d.members.length >= MAX_PARTY) return { ok: false, error: `Parties hold ${MAX_PARTY} people`, status: 409 };
  return {
    ok: true, note: `${who.name} joined the party`,
    doc: bump(d, now, { members: [...d.members, { ...who, joinedAt: now }], invites: liveInvites(d, now).filter(i => i.uid !== who.uid) }),
  };
}

/** Leave. The longest-standing member takes over when the leader leaves; the last one out closes the party. */
export function leave(d: PartyDoc, uid: string, now: number): PartyStep {
  const me = d.members.find(m => m.uid === uid);
  if (!me) return { ok: true, doc: d };
  const members = d.members.filter(m => m.uid !== uid);
  if (!members.length) return { ok: true, note: `${me.name} left`, doc: bump(d, now, { members, status: 'closed', invites: [] }) };
  const leader = d.leader === uid ? [...members].sort((a, b) => a.joinedAt - b.joinedAt)[0].uid : d.leader;
  const handed = leader !== d.leader ? ` — ${members.find(m => m.uid === leader)!.name} leads now` : '';
  return { ok: true, note: `${me.name} left${handed}`, doc: bump(d, now, { members, leader, ...withoutMember(d, uid) }) };
}

/** Team, stream and consent entries that go when a member leaves. */
function withoutMember(d: PartyDoc, uid: string): Partial<PartyDoc> {
  const teams = { ...(d.teams ?? {}) }; delete teams[uid];
  const out: Partial<PartyDoc> = { teams, streamOk: (d.streamOk ?? []).filter(u => u !== uid) };
  if (d.streaming?.uid === uid) { out.streaming = null; out.streamOk = []; }
  return out;
}

const leaderOnly = (d: PartyDoc, by: string): PartyStep | null =>
  d.status !== 'open' ? { ok: false, error: 'That party has ended', status: 410 } : d.leader !== by ? { ok: false, error: 'Only the party leader can do that', status: 403 } : null;

export function kick(d: PartyDoc, by: string, uid: string, now: number): PartyStep {
  const no = leaderOnly(d, by); if (no) return no;
  if (uid === by) return { ok: false, error: 'Use Leave instead', status: 400 };
  const who = d.members.find(m => m.uid === uid); if (!who) return { ok: false, error: 'Not in this party', status: 404 };
  return { ok: true, note: `${who.name} was removed`, doc: bump(d, now, { members: d.members.filter(m => m.uid !== uid), ...withoutMember(d, uid) }) };
}

export function promote(d: PartyDoc, by: string, uid: string, now: number): PartyStep {
  const no = leaderOnly(d, by); if (no) return no;
  const who = d.members.find(m => m.uid === uid); if (!who) return { ok: false, error: 'Not in this party', status: 404 };
  return { ok: true, note: `${who.name} leads the party now`, doc: bump(d, now, { leader: uid }) };
}

export function setGame(d: PartyDoc, by: string, game: string, now: number): PartyStep {
  const no = leaderOnly(d, by); if (no) return no;
  return { ok: true, doc: bump(d, now, { game }) };
}

/** Any member can invite; the invitee needs a live invite to join without the code. */
export function invite(d: PartyDoc, by: string, uid: string, now: number): PartyStep {
  if (!isMember(d, by)) return { ok: false, error: 'Join the party first', status: 403 };
  if (d.members.some(m => m.uid === uid)) return { ok: false, error: 'Already in the party', status: 409 };
  if (d.members.length >= MAX_PARTY) return { ok: false, error: `Parties hold ${MAX_PARTY} people`, status: 409 };
  const invites = liveInvites(d, now).filter(i => i.uid !== uid);
  if (invites.length >= MAX_PENDING_INVITES) return { ok: false, error: 'Too many pending invites', status: 429 };
  return { ok: true, doc: bump(d, now, { invites: [...invites, { uid, by, at: now }] }) };
}

/** The leader started a match for some members; their docks open it. */
export function startMatch(d: PartyDoc, by: string, m: { id: string; game: string; seats: string[] }, now: number): PartyStep {
  const no = leaderOnly(d, by); if (no) return no;
  if (!m.seats.every(u => d.members.some(x => x.uid === u))) return { ok: false, error: 'Everyone in the match must be in the party', status: 400 };
  return { ok: true, doc: bump(d, now, { match: { ...m, at: now } }) };
}

/** Put a member on Team A (0), Team B (1) or no team (null). Members pick for themselves; the leader can move anyone. */
export function setTeam(d: PartyDoc, by: string, uid: string, team: 0 | 1 | null, now: number): PartyStep {
  if (d.status !== 'open') return { ok: false, error: 'That party has ended', status: 410 };
  if (by !== uid && d.leader !== by) return { ok: false, error: 'Only the leader can move other people', status: 403 };
  const who = d.members.find(m => m.uid === uid); if (!who) return { ok: false, error: 'Not in this party', status: 404 };
  const teams = { ...(d.teams ?? {}) };
  if (team === null) delete teams[uid]; else teams[uid] = team;
  // No chat line: the team chips show it, and stepping none → A → B would spam the party chat.
  return { ok: true, doc: bump(d, now, { teams }) };
}

export const teamOf = (d: PartyDoc, uid: string): 0 | 1 | null => (d.teams && d.teams[uid] !== undefined ? d.teams[uid] : null);

/** Leader sends the party into matchmaking (id changes each time so docks know it's a new search). */
export function startQueue(d: PartyDoc, by: string, q: { id: string; game: string }, now: number): PartyStep {
  const no = leaderOnly(d, by); if (no) return no;
  return { ok: true, note: 'The party is looking for matches', doc: bump(d, now, { queue: { ...q, at: now } }) };
}
export function stopQueue(d: PartyDoc, by: string, now: number): PartyStep {
  const no = leaderOnly(d, by); if (no) return no;
  if (!d.queue) return { ok: true, doc: d };
  return { ok: true, note: 'The party stopped searching', doc: bump(d, now, { queue: null }) };
}

/** A member starts (or stops) putting party voice on their live stream. One streamer at a time; consent resets. */
export function setStreaming(d: PartyDoc, by: string, on: boolean, now: number): PartyStep {
  const me = d.members.find(m => m.uid === by);
  if (!me || d.status !== 'open') return { ok: false, error: 'Join the party first', status: 403 };
  if (me.isChild) return { ok: false, error: 'Not available on child accounts', status: 403 };
  if (!on) {
    if (d.streaming?.uid !== by) return { ok: true, doc: d };
    return { ok: true, note: `${me.name} took party voice off their stream`, doc: bump(d, now, { streaming: null, streamOk: [] }) };
  }
  if (d.streaming && d.streaming.uid !== by) {
    const other = d.members.find(m => m.uid === d.streaming!.uid)?.name ?? 'Someone';
    return { ok: false, error: `${other} is already streaming party voice`, status: 409 };
  }
  if (d.streaming?.uid === by) return { ok: true, doc: d };
  return { ok: true, note: `${me.name} wants to put party voice on their stream — only people who agree are heard`, doc: bump(d, now, { streaming: { uid: by, at: now }, streamOk: [] }) };
}

/** A member agrees (or stops agreeing) to be heard on the party stream. Only for themselves. */
export function setStreamConsent(d: PartyDoc, uid: string, ok: boolean, now: number): PartyStep {
  const me = d.members.find(m => m.uid === uid);
  if (!me || d.status !== 'open') return { ok: false, error: 'Join the party first', status: 403 };
  if (!d.streaming) return { ok: false, error: 'Nobody is streaming party voice', status: 409 };
  if (d.streaming.uid === uid) return { ok: false, error: 'You are the streamer', status: 400 };
  if (ok && me.isChild) return { ok: false, error: 'Child accounts are never put on a stream', status: 403 };
  const cur = new Set(d.streamOk ?? []);
  if (ok === cur.has(uid)) return { ok: true, doc: d };
  if (ok) cur.add(uid); else cur.delete(uid);
  return { ok: true, note: ok ? `${me.name} is OK being heard on the stream` : `${me.name} is off the stream`, doc: bump(d, now, { streamOk: [...cur] }) };
}

/** Voice: children never join party voice (text quick chat only). */
export const voiceAllowed = (d: PartyDoc, uid: string): boolean => {
  const me = d.members.find(m => m.uid === uid);
  return !!me && d.status === 'open' && !me.isChild;
};

/** What a member sees: invites are reduced to a count (who invited whom isn't everyone's business). */
export function partyView(d: PartyDoc, now: number) {
  const { invites, ...rest } = d;
  return { ...rest, pendingInvites: liveInvites(d, now).length };
}
