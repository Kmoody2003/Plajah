// Durable daily counters for things that cost money or can be aimed at someone: Veo renders, ticket messages, pushes.
// In-memory limiters reset per Cloud Run instance, so these live in usageCounters/{key}, which has no client rule.
import { createHash } from 'node:crypto';
import { fsBumpCounter } from './firebaseAdminRest';

/** One counter per subject per UTC day. The subject is hashed: emails and uids don't sit in doc ids. */
export function quotaKey(kind: string, subject: string, now = Date.now()): string {
  const day = new Date(now).toISOString().slice(0, 10);
  return `${kind}_${createHash('sha256').update(subject).digest('hex').slice(0, 32)}_${day}`;
}

export const overQuota = (count: number | null, limit: number): boolean => count !== null && count > limit;

/** Counts one use. Over the limit: true. `failClosed` treats an unreachable counter as over, for paid calls. */
export async function bumpQuota(kind: string, subject: string, limit: number, failClosed = false): Promise<boolean> {
  const count = await fsBumpCounter(`usageCounters/${quotaKey(kind, subject)}`).catch(() => null);
  if (count === null) return failClosed;
  return overQuota(count, limit);
}

/** Gives a use back after the paid call failed. */
export const refundQuota = (kind: string, subject: string): Promise<number | null> =>
  fsBumpCounter(`usageCounters/${quotaKey(kind, subject)}`, -1).catch(() => null);

export const VEO_DAILY_LIMIT = () => Number(process.env.VEO_DAILY_LIMIT) || 10;
export const TICKET_RECIPIENT_DAILY_LIMIT = 8;
export const TICKET_BUSINESS_DAILY_LIMIT = 300;
export const PUSH_PAIR_DAILY_LIMIT = 60;
export const PUSH_SENDER_DAILY_LIMIT = 1000;
