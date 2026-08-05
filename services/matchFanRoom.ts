// matchFanRoom.ts — per-match World Cup fan rooms. Each live match gets a room keyed by
// its ESPN event id. On entry a fan declares which side they support; the room then live-
// updates with the score + play-by-play and runs intelligent, roster-aware polls designed
// to spark banter between the two fanbases. Reuses the simple presence/chat Firestore
// pattern from WCVideoChatRoom and the poll vote model from PollCard.

import { db } from './firebase';
import {
  collection, doc, setDoc, deleteDoc, addDoc, updateDoc, onSnapshot, query, orderBy, limit,
  arrayUnion, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { getPlayersByTeam, getKeyPlayers, getCaptain, WC26Player } from '../data/worldCupPlayers';
import { getTeam, WC26Team, WC26_TEAMS } from '../data/worldCup2026';

export type Side = 'home' | 'away';
export type MatchPhase = 'pre' | 'live' | 'post';

export interface RoomMember { uid: string; displayName: string; photoURL?: string | null; side: Side | null; joinedAt: number; }
export interface RoomMessage { id: string; uid: string; displayName: string; photoURL?: string | null; text: string; side?: Side | null; at: number; }
export interface MatchPollOption { label: string; sideTag?: Side | null; }
export interface MatchPoll {
  id: string;
  key: string;                          // stable template key (dedupe)
  question: string;
  hint?: string;                        // chatter prompt shown under the poll
  options: MatchPollOption[];
  votes: Record<string, string[]>;      // optionIndex -> uids
  voterSides?: Record<string, Side | null>; // uid -> side (for "X% of home fans" splits)
  phase: MatchPhase;
  createdAt: number;
}

/** Minimal team context the poll generator needs (resolved from WC26 data). */
export interface TeamCtx {
  side: Side;
  id?: string;            // WC26 team id (mex, ger) if mapped
  name: string;
  short: string;
  flag: string;
  color: string;
  players: WC26Player[];
  captain?: WC26Player;
  key: WC26Player[];
}

// ── Firestore refs ───────────────────────────────────────────────────────────
const roomCol = 'wcMatchRooms';
const memberCol = (mid: string) => collection(db, roomCol, mid, 'members');
const memberRef = (mid: string, uid: string) => doc(db, roomCol, mid, 'members', uid);
const chatCol = (mid: string) => collection(db, roomCol, mid, 'chat');
const pollCol = (mid: string) => collection(db, roomCol, mid, 'polls');

// ── Membership / declare-your-team ───────────────────────────────────────────
export async function joinMatchRoom(matchId: string, user: { uid: string; displayName?: string | null; photoURL?: string | null }, side: Side | null): Promise<void> {
  await setDoc(doc(db, roomCol, matchId), { matchId, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(memberRef(matchId, user.uid), {
    uid: user.uid,
    displayName: user.displayName || 'Fan',
    photoURL: user.photoURL || null,
    side,
    joinedAt: Date.now(),
  });
}
export async function setSupportedSide(matchId: string, uid: string, side: Side): Promise<void> {
  await updateDoc(memberRef(matchId, uid), { side });
}
export async function leaveMatchRoom(matchId: string, uid: string): Promise<void> {
  try { await deleteDoc(memberRef(matchId, uid)); } catch { /* */ }
}
export function subscribeMembers(matchId: string, cb: (m: RoomMember[]) => void): () => void {
  return onSnapshot(memberCol(matchId), snap => cb(snap.docs.map(d => d.data() as RoomMember)), () => cb([]));
}

// ── Chat ─────────────────────────────────────────────────────────────────────
export async function sendMatchMessage(matchId: string, msg: Omit<RoomMessage, 'id' | 'at'>): Promise<void> {
  await addDoc(chatCol(matchId), { ...msg, at: Date.now() });
}
export function subscribeMatchChat(matchId: string, cb: (m: RoomMessage[]) => void): () => void {
  const q = query(chatCol(matchId), orderBy('at', 'desc'), limit(80));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).reverse()), () => cb([]));
}

// ── Polls ────────────────────────────────────────────────────────────────────
export function subscribeMatchPolls(matchId: string, cb: (p: MatchPoll[]) => void): () => void {
  const q = query(pollCol(matchId), orderBy('createdAt', 'desc'), limit(12));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))), () => cb([]));
}
export async function voteMatchPoll(matchId: string, pollId: string, optionIndex: number, uid: string, side: Side | null): Promise<void> {
  await updateDoc(doc(db, roomCol, matchId, 'polls', pollId), {
    [`votes.${optionIndex}`]: arrayUnion(uid),
    [`voterSides.${uid}`]: side ?? null,
  });
}

/** Seed the room's polls if it has fewer than `minPolls`. Idempotent by template key —
 *  never duplicates a template that's already present. Returns how many were added. */
export async function ensureMatchPolls(matchId: string, home: TeamCtx, away: TeamCtx, phase: MatchPhase, minPolls = 4): Promise<number> {
  const existing = await getDocs(pollCol(matchId));
  const haveKeys = new Set(existing.docs.map(d => (d.data() as any).key));
  const seeds = generateMatchPolls(home, away, phase).filter(s => !haveKeys.has(s.key));
  let added = 0;
  for (const s of seeds) {
    if (existing.size + added >= minPolls) break;
    await addDoc(pollCol(matchId), { ...s, votes: {}, voterSides: {}, createdAt: Date.now() });
    added++;
  }
  return added;
}

/** Add the single next not-yet-present poll (used to drip new polls over time / on events). */
export async function addNextPoll(matchId: string, home: TeamCtx, away: TeamCtx, phase: MatchPhase): Promise<boolean> {
  const existing = await getDocs(pollCol(matchId));
  const haveKeys = new Set(existing.docs.map(d => (d.data() as any).key));
  const seed = generateMatchPolls(home, away, phase).find(s => !haveKeys.has(s.key));
  if (!seed) return false;
  await addDoc(pollCol(matchId), { ...seed, votes: {}, voterSides: {}, createdAt: Date.now() });
  return true;
}

// ── Team resolution + intelligent poll generation ────────────────────────────

/** Resolve an ESPN competitor (or a plain name/abbr) to WC26 roster context. */
export function resolveTeamCtx(side: Side, espnTeam: { displayName?: string; shortDisplayName?: string; abbreviation?: string; color?: string; }): TeamCtx {
  const abbr = (espnTeam.abbreviation || '').toUpperCase();
  const name = espnTeam.displayName || espnTeam.shortDisplayName || abbr || 'Team';
  let wc: WC26Team | undefined = WC26_TEAMS.find(t => t.shortName.toUpperCase() === abbr)
    || WC26_TEAMS.find(t => t.name.toLowerCase() === name.toLowerCase())
    || WC26_TEAMS.find(t => name.toLowerCase().includes(t.name.toLowerCase()));
  const players = wc ? getPlayersByTeam(wc.id) : [];
  return {
    side,
    id: wc?.id,
    name: wc?.name || name,
    short: wc?.shortName || abbr || name.slice(0, 3).toUpperCase(),
    flag: wc?.flag || '🏳️',
    color: wc?.primaryColor || (espnTeam.color ? `#${espnTeam.color.replace('#', '')}` : '#888'),
    players,
    captain: wc ? getCaptain(wc.id) : undefined,
    key: wc ? getKeyPlayers(wc.id) : [],
  };
}

const pickForwards = (t: TeamCtx) => (t.players.filter(p => p.position === 'FWD').sort((a, b) => b.goals - a.goals));
const topAttacker = (t: TeamCtx) => t.key.find(p => p.position === 'FWD') || pickForwards(t)[0] || t.key[0];
const topMids = (t: TeamCtx) => t.players.filter(p => p.position === 'MID').sort((a, b) => b.assists - a.assists).slice(0, 1);

/** Generate roster-aware polls tuned to spark fanbase banter. Ordered by "chatter value". */
export function generateMatchPolls(home: TeamCtx, away: TeamCtx, phase: MatchPhase): Omit<MatchPoll, 'id' | 'votes' | 'voterSides' | 'createdAt'>[] {
  const out: Omit<MatchPoll, 'id' | 'votes' | 'voterSides' | 'createdAt'>[] = [];
  const ha = topAttacker(home), aa = topAttacker(away);
  const hc = home.captain, ac = away.captain;

  // 1) Fanbase banter — directly pits the two declared sides against each other.
  out.push({
    key: 'louder', phase,
    question: `Which end is LOUDER right now?`,
    hint: 'Represent your side 👇',
    options: [{ label: `${home.flag} ${home.short}`, sideTag: 'home' }, { label: `${away.flag} ${away.short}`, sideTag: 'away' }],
  });

  // 2) Result prediction.
  out.push({
    key: 'result', phase,
    question: phase === 'post' ? 'Right result?' : 'Final score — who takes it?',
    hint: 'Lock your prediction.',
    options: [{ label: `${home.flag} ${home.short} win`, sideTag: 'home' }, { label: 'Draw', sideTag: null }, { label: `${away.flag} ${away.short} win`, sideTag: 'away' }],
  });

  // 3) Man of the match — pulls real key players from both squads.
  const motm = [...home.key.slice(0, 3).map(p => ({ p, side: 'home' as Side })), ...away.key.slice(0, 3).map(p => ({ p, side: 'away' as Side }))];
  if (motm.length >= 2) out.push({
    key: 'motm', phase,
    question: phase === 'pre' ? 'Who will be Man of the Match?' : 'Man of the Match so far?',
    hint: 'Make your case in chat.',
    options: motm.map(({ p, side }) => ({ label: `${side === 'home' ? home.flag : away.flag} ${p.name}`, sideTag: side })),
  });

  // 4) Who scores next (live) — forwards from both sides + "no goal".
  if (phase !== 'post' && (ha || aa)) out.push({
    key: 'next_scorer', phase,
    question: 'Who scores NEXT?',
    hint: 'Call it before it happens.',
    options: [
      ...(ha ? [{ label: `${home.flag} ${ha.name}`, sideTag: 'home' as Side }] : []),
      ...(aa ? [{ label: `${away.flag} ${aa.name}`, sideTag: 'away' as Side }] : []),
      { label: 'No more goals', sideTag: null },
    ],
  });

  // 5) Captain head-to-head.
  if (hc && ac) out.push({
    key: 'captain', phase,
    question: 'Better captain on the day?',
    hint: 'Leaders lead. Who’s yours?',
    options: [{ label: `${home.flag} ${hc.name}`, sideTag: 'home' }, { label: `${away.flag} ${ac.name}`, sideTag: 'away' }],
  });

  // 6) Star battle.
  if (ha && aa) out.push({
    key: 'star_battle', phase,
    question: `${ha.name} vs ${aa.name} — bigger impact today?`,
    hint: 'The matchup everyone’s watching.',
    options: [{ label: `${home.flag} ${ha.name}`, sideTag: 'home' }, { label: `${away.flag} ${aa.name}`, sideTag: 'away' }],
  });

  // 7) Midfield battle.
  const hm = topMids(home)[0], am = topMids(away)[0];
  if (hm && am) out.push({
    key: 'midfield', phase,
    question: 'Who wins the midfield?',
    hint: 'Games are won in the middle.',
    options: [{ label: `${home.flag} ${hm.name}`, sideTag: 'home' }, { label: `${away.flag} ${am.name}`, sideTag: 'away' }],
  });

  // 8) Kit clash — pure banter bait.
  out.push({
    key: 'kit', phase,
    question: 'Better kit today?',
    hint: 'Drip check. 👕',
    options: [{ label: `${home.flag} ${home.short}`, sideTag: 'home' }, { label: `${away.flag} ${away.short}`, sideTag: 'away' }],
  });

  return out;
}
