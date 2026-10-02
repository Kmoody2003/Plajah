import type { ThesaCard, ThesaKind } from './types';
import { validateCard } from './validate';
import { cardsFromEduFactoids, cardsFromHistoryFigures } from './adapters';

/**
 * The card catalog and the daily pick. Built-in cards come from adapters over existing content; later
 * phases add Firestore-backed cards (creator-attached, Aria-extracted). Everything here is pure.
 */

let cache: ThesaCard[] | null = null;

/** All built-in cards that pass validation (an invalid adapter output is dropped, never shown). */
export function builtInCards(): ThesaCard[] {
  if (cache) return cache;
  const seen = new Set<string>();
  cache = [...cardsFromEduFactoids(), ...cardsFromHistoryFigures()].filter(c => {
    if (seen.has(c.id) || !validateCard(c).ok) return false;
    seen.add(c.id); return true;
  });
  return cache;
}

export const cardById = (id: string, pool: ThesaCard[] = builtInCards()) => pool.find(c => c.id === id) ?? null;

/** FNV-1a — a small stable string hash so each user rotates through the pool from a different point. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export interface PickOptions {
  /** Signed-in uid, or null for guests (all guests then share a rotation). */
  uid: string | null;
  /** Days since epoch (UTC). Passed in so the function stays pure and testable. */
  dayIndex: number;
  count: number;
  /** Restrict to these kinds. */
  kinds?: ThesaKind[];
  /** Under-13 / kids-mode: only kidsSafe cards. */
  kidsMode?: boolean;
  /** Wellness cards appear only for people who opted in to Ora. */
  wellnessOptIn?: boolean;
  /** Cards to skip (already stashed, just shown, …). */
  excludeIds?: ReadonlySet<string>;
  pool?: ThesaCard[];
}

export const isEligible = (c: ThesaCard, o: Pick<PickOptions, 'kidsMode' | 'wellnessOptIn' | 'kinds' | 'excludeIds'>): boolean =>
  c.status === 'LIVE'
  && (!o.kidsMode || c.kidsSafe)
  && (!c.wellness || !!o.wellnessOptIn)
  && (!o.kinds || o.kinds.includes(c.kind))
  && !(o.excludeIds && o.excludeIds.has(c.id));

/**
 * `count` consecutive cards from the viewer's own position in the eligible pool. Stable for a given
 * (uid, day), different for each user, and it advances by `count` each day so nothing repeats until the
 * pool is exhausted. Deliberately uses NO engagement signal.
 */
export function pickCards(o: PickOptions): ThesaCard[] {
  const eligible = (o.pool ?? builtInCards()).filter(c => isEligible(c, o));
  if (!eligible.length || o.count <= 0) return [];
  const n = Math.min(o.count, eligible.length);
  const start = (hashString(o.uid ?? 'guest') + o.dayIndex * n) % eligible.length;
  return Array.from({ length: n }, (_, i) => eligible[(start + i) % eligible.length]);
}

export const dayIndexOf = (now = Date.now()) => Math.floor(now / 86_400_000);
