// Fact-check workbench logic. Pure functions.
//
// The hard rule, enforced in code not just copy: NOTHING but a human with a source attached can
// set a claim to VERIFIED. The detector below only SUGGESTS checkable claims (they start
// UNVERIFIED); an AI or heuristic actor that tries to verify one gets an error.

import type { Claim, ClaimSourceLink, ClaimStatus } from './types';

export interface ClaimCandidate { text: string; reasons: string[]; score: number; blockId?: string; start: number }

const REASONS: Array<[RegExp, string, number]> = [
  [/\$\s?\d|\b\d[\d,.]*\s?(?:%|percent|million|billion|trillion|thousand)\b/i, 'a figure or amount', 3],
  [/\b(?:19|20)\d{2}\b/, 'a date or year', 1],
  [/\b\d[\d,]*\s+(?:people|residents|students|workers|voters|jobs|homes|cases|deaths|arrests|patients|children|families)\b/i, 'a count of people or things', 3],
  [/\b(?:first|only|largest|biggest|smallest|highest|lowest|most|least|record|never|always|every|all of|none of)\b/i, 'an absolute or superlative', 2],
  [/\b(?:because|caused|causes|led to|resulted in|due to|responsible for|linked to|blamed)\b/i, 'a causal claim', 3],
  [/\b(?:according to|reported|announced|confirmed|admitted|denied|signed|voted|ruled|sued|charged|arrested|fired|resigned)\b/i, 'an attributed action', 2],
  [/\b(?:study|studies|survey|poll|report|data|statistics|analysis|research)\s+(?:shows?|found|finds|says|suggests|indicates)\b/i, 'a cited study or data', 3],
  [/\b(?:law|bill|act|statute|regulation|ordinance|court|judge|lawsuit|indicted|convicted)\b/i, 'a legal assertion', 2],
];

/** Heuristic: sentences worth a second look. Suggestions only. */
export function detectCheckableClaims(text: string, minScore = 3): ClaimCandidate[] {
  const out: ClaimCandidate[] = [];
  const re = /[^.!?\n]+[.!?]+["'”’)]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m[0].trim();
    if (s.length < 25) continue;
    const reasons: string[] = []; let score = 0;
    for (const [rx, why, w] of REASONS) if (rx.test(s)) { reasons.push(why); score += w; }
    if (score >= minScore) out.push({ text: s, reasons, score, start: m.index });
  }
  return out.sort((a, b) => b.score - a.score || a.start - b.start);
}

export type Actor = { kind: 'human'; uid: string } | { kind: 'ai' | 'heuristic'; label?: string };

export class ClaimError extends Error {}

export const actorId = (a: Actor): string => (a.kind === 'human' ? `human:${a.uid}` : `${a.kind}:${a.label || 'system'}`);

export function newClaim(input: { id: string; ownerId: string; articleId: string; text: string; suggestedBy?: 'heuristic' | 'ai'; blockId?: string; now?: number }): Claim {
  const at = input.now ?? Date.now();
  return {
    id: input.id, ownerId: input.ownerId, articleId: input.articleId, text: input.text.trim(), status: 'UNVERIFIED',
    statusBy: input.suggestedBy ? `${input.suggestedBy}:suggestion` : `human:${input.ownerId}`, statusAt: at, sources: [],
    ...(input.suggestedBy ? { suggestedBy: input.suggestedBy } : {}), ...(input.blockId ? { blockId: input.blockId } : {}),
  };
}

export function isHttpUrl(u: string): boolean {
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; } catch { return false; }
}

export function addSource(claim: Claim, link: { url: string; label?: string; archiveUrl?: string }, now = Date.now()): Claim {
  if (!isHttpUrl(link.url)) throw new ClaimError('A source link must be an http(s) URL.');
  if (link.archiveUrl && !isHttpUrl(link.archiveUrl)) throw new ClaimError('The archive link must be an http(s) URL.');
  if (claim.sources.some(s => s.url === link.url)) return claim;
  const src: ClaimSourceLink = { url: link.url, addedAt: now, ...(link.label ? { label: link.label } : {}), ...(link.archiveUrl ? { archiveUrl: link.archiveUrl } : {}) };
  return { ...claim, sources: [...claim.sources, src] };
}

/**
 * The only way to change a claim's status. VERIFIED requires a human actor and at least one source.
 * DISPUTED requires a human actor and a note (what is disputed, by whom).
 */
export function setClaimStatus(claim: Claim, status: ClaimStatus, actor: Actor, opts: { note?: string; now?: number } = {}): Claim {
  if (status === 'UNVERIFIED') return { ...claim, status, statusBy: actorId(actor), statusAt: opts.now ?? Date.now() };
  if (actor.kind !== 'human') throw new ClaimError('Only a person can mark a claim verified or disputed. AI suggestions stay unverified.');
  if (status === 'VERIFIED' && claim.sources.length === 0) throw new ClaimError('Attach at least one source link before marking a claim verified.');
  if (status === 'DISPUTED' && !(opts.note || claim.note || '').trim()) throw new ClaimError('Say what is disputed and by whom.');
  return { ...claim, status, statusBy: actorId(actor), statusAt: opts.now ?? Date.now(), ...(opts.note ? { note: opts.note } : {}) };
}

/** A claim whose recorded verifier is not a human cannot be treated as verified, even if the field says so (tamper guard). */
export function isTrulyVerified(c: Claim): boolean {
  return c.status === 'VERIFIED' && c.statusBy.startsWith('human:') && c.sources.length > 0;
}

export function claimSummary(claims: ReadonlyArray<Claim>) {
  const verified = claims.filter(isTrulyVerified).length;
  const disputed = claims.filter(c => c.status === 'DISPUTED').length;
  return { total: claims.length, verified, disputed, unverified: claims.length - verified - disputed };
}

// ── archive.org helpers (links only; we do not call archive.org from here) ─────

export function wayback(url: string) {
  if (!isHttpUrl(url)) throw new ClaimError('Not an http(s) URL.');
  return {
    /** Newest existing snapshot (archive.org redirects to it). */
    latest: `https://web.archive.org/web/2/${url}`,
    /** Open this in a browser to ask the Wayback Machine to capture the page NOW. */
    saveNow: `https://web.archive.org/save/${url}`,
    /** JSON availability API: GET returns the closest snapshot if one exists. */
    availability: `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
  };
}
