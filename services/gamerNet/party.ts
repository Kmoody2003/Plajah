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
  return { ok: true, note: `${me.name} left${handed}`, doc: bump(d, now, { members, leader }) };
}

const leaderOnly = (d: PartyDoc, by: string): PartyStep | null =>
  d.status !== 'open' ? { ok: false, error: 'That party has ended', status: 410 } : d.leader !== by ? { ok: false, error: 'Only the party leader can do that', status: 403 } : null;

export function kick(d: PartyDoc, by: string, uid: string, now: number): PartyStep {
  const no = leaderOnly(d, by); if (no) return no;
  if (uid === by) return { ok: false, error: 'Use Leave instead', status: 400 };
  const who = d.members.find(m => m.uid === uid); if (!who) return { ok: false, error: 'Not in this party', status: 404 };
  return { ok: true, note: `${who.name} was removed`, doc: bump(d, now, { members: d.members.filter(m => m.uid !== uid) }) };
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
