// Gamer Network chat — pure. One small capped log per scope, changed only through these functions inside a
// compare-and-swap (routes/gamerTogether.ts). Scopes:
//   match_<matchId>  the players of a match
//   spec_<matchId>   spectators of a match (players can read it after the match ends)
//   party_<partyId>  the members of a party
//   team_<partyId>_<0|1>  one team inside a party (Team A / Team B)
//   rt_<matchId>     the players of a realtime room (gamerRtMatches) — races, open world
//
// Safety: every free-text line goes through the profanity mask; child accounts can only send quick-chat
// lines, and they see other people's free text as "(message hidden)". Blocked people are filtered per viewer.

import { PROFANITY_SET, normalizeForMatch } from '../profanityLexicon';

export type ChatScopeKind = 'match' | 'spec' | 'party' | 'team' | 'rt';
export interface ChatScope { kind: ChatScopeKind; id: string; key: string }

export interface QuickChat { id: string; text: string }
/** Fixed lines anyone (children included) can send with one tap. */
export const QUICK_CHAT: ReadonlyArray<QuickChat> = [
  { id: 'gl', text: 'Good luck!' }, { id: 'gg', text: 'GG' }, { id: 'nice', text: 'Nice move!' }, { id: 'wow', text: 'Wow!' },
  { id: 'oops', text: 'Oops!' }, { id: 'thanks', text: 'Thanks!' }, { id: 'rematch', text: 'Rematch?' }, { id: 'ready', text: "I'm ready" },
  { id: 'wait', text: 'One sec…' }, { id: 'brb', text: 'Be right back' }, { id: 'lets-go', text: "Let's go!" }, { id: 'well-played', text: 'Well played' },
];
const QUICK_BY_ID = new Map(QUICK_CHAT.map(q => [q.id, q]));

export interface ChatLine {
  seq: number;
  id: string;
  uid: string;
  name: string;
  photo: string;
  text: string;
  /** Set for quick-chat lines (safe for every viewer). */
  quick?: string;
  kind: 'user' | 'system';
  at: number;
}

export interface ChatDoc {
  scope: string;
  seq: number;
  lines: ChatLine[];
  /** Recent send times per uid, for the rate limit. */
  rate: Record<string, number[]>;
  updatedAt: number;
}

export const MAX_LINES = 80;
export const MAX_TEXT = 200;
/** At most 5 lines in 10 s and 30 in a minute per person per scope. */
export const RATE_BURST = { n: 5, ms: 10_000 };
export const RATE_MINUTE = { n: 30, ms: 60_000 };

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function parseScope(raw: unknown): ChatScope | null {
  const s = String(raw ?? '');
  const m = /^(match|spec|party|team|rt)_(.+)$/.exec(s);
  if (!m || !ID.test(m[2])) return null;
  if (m[1] === 'team' && !/_[01]$/.test(m[2])) return null;
  return { kind: m[1] as ChatScopeKind, id: m[2], key: s };
}

export const scopeKey = (kind: ChatScopeKind, id: string) => `${kind}_${id}`;

/** Collapse whitespace, drop control characters, cap the length and mask profanity. Empty → null. */
export function cleanText(raw: unknown): string | null {
  const flat = String(raw ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!flat) return null;
  return flat.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok)) return tok;
    const core = normalizeForMatch(tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    return core && PROFANITY_SET.has(core) ? tok.replace(/[\p{L}\p{N}]/gu, '*') : tok;
  }).join('');
}

export function quickLine(id: unknown): QuickChat | null { return QUICK_BY_ID.get(String(id ?? '')) ?? null; }

/** Rate check; returns the trimmed send times including this one when allowed. */
export function rateCheck(times: ReadonlyArray<number> | undefined, now: number): { ok: true; times: number[] } | { ok: false; retryMs: number } {
  const recent = (times ?? []).filter(t => now - t < RATE_MINUTE.ms);
  const burst = recent.filter(t => now - t < RATE_BURST.ms);
  if (burst.length >= RATE_BURST.n) return { ok: false, retryMs: RATE_BURST.ms - (now - Math.min(...burst)) };
  if (recent.length >= RATE_MINUTE.n) return { ok: false, retryMs: RATE_MINUTE.ms - (now - Math.min(...recent)) };
  return { ok: true, times: [...recent, now] };
}

export const emptyChat = (scope: string, now: number): ChatDoc => ({ scope, seq: 0, lines: [], rate: {}, updatedAt: now });

export interface Sender { uid: string; name: string; photo: string; isChild: boolean }
export type Post = { text?: unknown; quick?: unknown };
export type AppendResult = { ok: true; doc: ChatDoc; line: ChatLine } | { ok: false; error: string; status: number };

/** Add one line from a person. Children may only send quick chat. */
export function appendLine(doc: ChatDoc | null, scope: string, who: Sender, post: Post, lineId: string, now: number): AppendResult {
  const base = doc ?? emptyChat(scope, now);
  const q = post.quick !== undefined && post.quick !== null && post.quick !== '' ? quickLine(post.quick) : null;
  if (post.quick && !q) return { ok: false, error: 'Unknown quick message', status: 400 };
  let text: string | null = q ? q.text : null;
  if (!q) {
    if (who.isChild) return { ok: false, error: 'Use the quick messages', status: 403 };
    text = cleanText(post.text);
    if (!text) return { ok: false, error: 'Type a message', status: 400 };
  }
  const rc = rateCheck(base.rate[who.uid], now);
  if ('retryMs' in rc) return { ok: false, error: `Slow down — try again in ${Math.ceil(rc.retryMs / 1000)}s`, status: 429 };
  const line: ChatLine = {
    seq: base.seq + 1, id: lineId, uid: who.uid, name: who.isChild ? 'Player' : who.name.slice(0, 60) || 'Player', photo: who.isChild ? '' : who.photo.slice(0, 500),
    text: text!, ...(q ? { quick: q.id } : {}), kind: 'user', at: now,
  };
  // Drop rate entries of people who haven't spoken for a minute so the doc stays small.
  const rate: Record<string, number[]> = {};
  for (const [u, ts] of Object.entries(base.rate)) { const keep = ts.filter(t => now - t < RATE_MINUTE.ms); if (keep.length) rate[u] = keep; }
  rate[who.uid] = rc.times;
  return { ok: true, line, doc: { ...base, seq: line.seq, lines: [...base.lines, line].slice(-MAX_LINES), rate, updatedAt: now } };
}

/** A system line ("Alice joined the party"). */
export function appendSystem(doc: ChatDoc | null, scope: string, text: string, lineId: string, now: number): ChatDoc {
  const base = doc ?? emptyChat(scope, now);
  const line: ChatLine = { seq: base.seq + 1, id: lineId, uid: '', name: '', photo: '', text: text.slice(0, MAX_TEXT), kind: 'system', at: now };
  return { ...base, seq: line.seq, lines: [...base.lines, line].slice(-MAX_LINES), updatedAt: now };
}

export interface Viewer { uid: string; isChild: boolean; hidden: ReadonlySet<string> }

/** Lines after `since` that this viewer may see. Children see other people's free text as hidden. */
export function viewLines(doc: ChatDoc | null, since: number, viewer: Viewer): ChatLine[] {
  if (!doc) return [];
  return doc.lines
    .filter(l => l.seq > since && !(l.uid && viewer.hidden.has(l.uid)))
    .map(l => (viewer.isChild && l.kind === 'user' && !l.quick && l.uid !== viewer.uid ? { ...l, text: '(message hidden)' } : l));
}

export interface ScopeAccess { read: boolean; post: boolean; quickOnly: boolean; reason?: string }

/**
 * Who may read and post where.
 * - match: players read and post.
 * - spec: any signed-in adult reads and posts; children read only (quick chat); players read once it's over.
 * - party: members read and post.
 * - team: members on that team read and post.
 * - rt: the players of a realtime room read and post.
 */
export function accessFor(kind: ChatScopeKind, ctx: { uid: string; isChild: boolean; isPlayer?: boolean; isMember?: boolean; onTeam?: boolean; matchDone?: boolean }): ScopeAccess {
  const quickOnly = ctx.isChild;
  if (kind === 'team') return ctx.isMember && ctx.onTeam ? { read: true, post: true, quickOnly } : { read: false, post: false, quickOnly, reason: 'Join this team to chat' };
  if (kind === 'rt') return ctx.isPlayer ? { read: true, post: true, quickOnly } : { read: false, post: false, quickOnly, reason: 'Only the players in this room can see this chat' };
  if (kind === 'match') return ctx.isPlayer ? { read: true, post: true, quickOnly } : { read: false, post: false, quickOnly, reason: 'Only the players can see this chat' };
  if (kind === 'party') return ctx.isMember ? { read: true, post: true, quickOnly } : { read: false, post: false, quickOnly, reason: 'Join the party to chat' };
  if (ctx.isPlayer) return ctx.matchDone ? { read: true, post: true, quickOnly } : { read: false, post: false, quickOnly, reason: 'Spectator chat opens for players after the match' };
  return { read: true, post: true, quickOnly };
}
