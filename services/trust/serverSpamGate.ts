// serverSpamGate — the client spam heuristic (services/socialSpamHeuristic.ts) + trust-tier
// ceilings (trustCore), run SERVER-SIDE on write paths the server owns:
//   • routes/socialServer.ts  publishOne()        scheduled posts → posts/private_posts
//   • routes/socialConnect.ts POST /publish       outbound posts to Meta/X/LinkedIn
// Pure (no I/O) so it can be unit-tested; callers record the outcome in security_events.
//
// Only HARD blocks here (duplicate/char-flood/NEW-tier link spam per assessPostSpam's `block`).
// "warn"-level findings are allowed — on the server there is no human to confirm with, and real
// people must never lose a scheduled post to a heuristic false positive.

import { assessPostSpam, type SpamReason } from '../socialSpamHeuristic';
import { computeTrust, type TrustSignals, type TrustTier } from './trustCore';

export interface ServerSpamVerdict { block: boolean; reasons: SpamReason[]; tier: TrustTier }

/** `accountCreatedMs` from users/{uid}.createdAt|joinedAt (ms) when known. */
export function serverSpamCheck(
  text: string,
  opts: { accountCreatedMs?: number | null; signals?: Partial<TrustSignals>; recentTexts?: readonly string[]; now?: number } = {},
): ServerSpamVerdict {
  const now = opts.now ?? Date.now();
  const created = typeof opts.accountCreatedMs === 'number' && Number.isFinite(opts.accountCreatedMs) && opts.accountCreatedMs > 0
    ? opts.accountCreatedMs : null;
  // Unknown creation time → don't punish (treat as established-age).
  const accountAgeMs = created ? now - created : 100 * 365 * 86_400_000;
  const trust = computeTrust({ ...(opts.signals || {}), accountAgeMs });
  const a = assessPostSpam(text || '', opts.recentTexts ?? [], {
    newAccount: trust.tier === 'NEW',
    maxLinks: trust.limits.linksPerPost,
    maxMentions: trust.limits.mentionsPerPost,
  });
  return { block: a.block, reasons: a.reasons, tier: trust.tier };
}

/** Best-effort ms timestamp from a profile doc's createdAt/joinedAt (number, ISO string or {seconds}). */
export function profileCreatedMs(profile: Record<string, any> | null | undefined): number | null {
  for (const k of ['createdAt', 'joinedAt']) {
    const v = profile?.[k];
    if (typeof v === 'number' && v > 0) return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') { const t = Date.parse(v); if (Number.isFinite(t)) return t; }
    if (v && typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  }
  return null;
}
