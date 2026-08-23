// What the numbers in the guide mean.
//
// Before this, the lineup computed a channel's number from whoever happened to be in the list:
// bound numbers were honoured, and everyone else got "the smallest free positive integer". That
// is not a channel number, it is a row index — it moved whenever another account went live, and
// K-Moody sliding to 6 is exactly that behaviour, not a bug in one channel.
//
// A channel number is an ADDRESS. Someone learns it, types it, tells a friend. So:
//
//   1. It is GIVEN, once, when the channel is created — never derived at read time from whoever
//      else happens to be around. There is no provisional number: a channel either has one or is
//      waiting to be given one.
//   2. It belongs to the account and is honoured while the account is off air, so nothing else
//      takes the slot.
//   3. It is never recycled. See below.
//   4. Reserved ranges are reserved even when empty.
//
// WHY A RETIRED NUMBER IS NEVER REISSUED
//
// Integers do not run out. The only scarce thing is a LOW number, and that is status rather than
// capacity — so recycling buys nothing and costs the one thing an address cannot afford: people
// tune to channel 12 because they memorised it, and giving 12 to a stranger because its owner
// left is worse than a gap in the guide. Real lineups are full of gaps and nobody notices.
//
// Auctioning them is worse again. Vanity toll-free numbers and dropped domains both grew
// secondary markets, and both produced warehousing, squatting, and a policing burden on whoever
// ran the registry. The desire underneath "auction" — I want a good number — is served instead
// by letting anyone claim an UNUSED one, which is additive and does not require a channel to die.
//
// So deletion tombstones the number against the account that held it. If that account ever comes
// back, it gets its own number back.
//
// THE BANDS
//
//   1 …        accounts, one major each, sub-numbered per source (N.1 live, N.2 FAST)
//   8          Plajah's own channels — reserved, never allocated to an account
//   9001 …     curated Science Live, which are other people's feeds rather than channels

/**
 * Plajah's band.
 *
 * First-party channels live here as sub-channels — 8.1, 8.2 — and never as a bare "8", even when
 * there is only one of them. A single channel numbered 8 would have to become 8.1 the day a
 * second arrived, which is the renumbering this whole file exists to stop.
 */
export const PLAJAH_BAND = 8;

/** Majors an account can never be allocated, whether or not anything is using them today. */
export const RESERVED_MAJORS: ReadonlySet<number> = new Set([PLAJAH_BAND]);

/** Curated third-party feeds. Not channels anyone owns, so they sit far out of the way. */
export const SCIENCE_BAND_START = 9001;

export type PlajahChannelKind = 'generative' | 'fast' | 'live';

export interface PlajahChannel {
  id: string;
  /**
   * The `.N` under the band. Permanent and never reused — if a channel is retired its number
   * retires with it, because someone somewhere still has it written down.
   */
  sub: number;
  name: string;
  tagline: string;
  kind: PlajahChannelKind;
  /** False while a channel is announced in the guide but not yet carrying anything. */
  onAir: boolean;
}

/**
 * The first-party lineup.
 *
 * Order here is presentation only; `sub` is the address. Adding a channel means appending an
 * entry with the next unused `sub`, never renumbering the ones above it.
 */
export const PLAJAH_CHANNELS: readonly PlajahChannel[] = [
  {
    id: 'endless-hour',
    sub: 1,
    name: 'The Endless Hour',
    tagline: 'Made as you watch. Some of it only for you.',
    kind: 'generative',
    onAir: false,
  },
];

/** The guide number for a first-party channel — always `8.N`. */
export function plajahNumber(ch: PlajahChannel): string {
  return `${PLAJAH_BAND}.${ch.sub}`;
}

export function findPlajahChannel(id: string): PlajahChannel | undefined {
  return PLAJAH_CHANNELS.find((c) => c.id === id);
}

/** The next `sub` a new first-party channel should take. Max + 1, so retired numbers stay retired. */
export function nextPlajahSub(): number {
  return PLAJAH_CHANNELS.reduce((m, c) => Math.max(m, c.sub), 0) + 1;
}

/**
 * The registry, as the allocator sees it.
 *
 * `retired` is not an optimisation or a courtesy — it is the reason the allocator is correct.
 * Without it a deleted account's number returns to the pool and the next channel created inherits
 * an address that other people still have written down.
 */
export interface NumberRegistry {
  /** Live assignments, by account. */
  byOwner: Record<string, number>;
  /** Numbers whose owner is gone. Keyed by number; the value records who held it, so an account
   *  that returns is given its own number back rather than a new one. */
  retired?: Record<string, { ownerId: string; at: number }>;
}

/**
 * The lowest major that may be GIVEN out.
 *
 * `used` must include retired numbers as well as live ones. Passing only live assignments is the
 * bug this signature exists to make obvious.
 */
export function nextUserMajor(used: Iterable<number>): number {
  const taken = new Set<number>(used);
  let n = 1;
  while (taken.has(n) || RESERVED_MAJORS.has(n)) n++;
  return n;
}

/** Every number the registry has ever handed out — live and retired. */
export function allTakenNumbers(reg: NumberRegistry): number[] {
  const live = Object.values(reg.byOwner ?? {});
  const dead = Object.keys(reg.retired ?? {}).map(Number).filter(Number.isFinite);
  return [...live, ...dead];
}

/**
 * The number an account should be given, or one it is owed.
 *
 * An account returning after deletion is matched against the tombstones first. Someone who comes
 * back to find a different address has, from their side, lost their channel.
 */
export function numberFor(reg: NumberRegistry, ownerId: string): number {
  const live = reg.byOwner?.[ownerId];
  if (typeof live === 'number') return live;
  for (const [n, t] of Object.entries(reg.retired ?? {})) {
    if (t.ownerId === ownerId) return Number(n);
  }
  return nextUserMajor(allTakenNumbers(reg));
}

/**
 * Whether a specific number can be handed to a specific account on request.
 *
 * This is the "claim a good one" path, and it is the reason retirement has to be checked here
 * too: a free-looking gap in the guide is usually a retired number, not an unused one.
 */
export function canClaim(reg: NumberRegistry, n: number, ownerId: string): boolean {
  if (!isAllocatableMajor(n)) return false;
  if (Object.values(reg.byOwner ?? {}).includes(n)) return false;
  const tomb = reg.retired?.[String(n)];
  // Your own retired number is yours to take back; someone else's is not available at any price.
  return !tomb || tomb.ownerId === ownerId;
}

/** Whether an account is allowed to bind this major. */
export function isAllocatableMajor(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n < SCIENCE_BAND_START && !RESERVED_MAJORS.has(n);
}

/**
 * How a channel that has not been given a number yet appears.
 *
 * There is deliberately no provisional number to fall back on. A number computed at read time is
 * a number that changes, and one that changes is worse than none — it teaches people an address
 * that will not work next week. A channel shows this only in the gap between being created and
 * being assigned, which is one write.
 */
export const UNNUMBERED = '—';

/**
 * Sort key for the guide.
 *
 * Numbered channels ascend by major then sub; unnumbered ones fall to the end rather than
 * interleaving, so their position moving around does not shuffle anyone else.
 */
export function guideSortKey(number: string): number {
  if (number === UNNUMBERED) return Number.MAX_SAFE_INTEGER;
  const [maj, sub] = number.split('.');
  const m = Number(maj);
  if (!Number.isFinite(m)) return Number.MAX_SAFE_INTEGER;
  return m * 1000 + (Number(sub) || 0);
}
