// What the numbers in the guide mean.
//
// Before this, the lineup computed a channel's number from whoever happened to be in the list:
// bound numbers were honoured, and everyone else got "the smallest free positive integer". That
// is not a channel number, it is a row index — it moved whenever another account went live, and
// K-Moody sliding to 6 is exactly that behaviour, not a bug in one channel.
//
// A channel number is an ADDRESS. Someone learns it, types it, tells a friend. Three rules follow:
//
//   1. It belongs to the account, not to the lineup. It is claimed once, persisted, and honoured
//      forever after — including while the account is off air, so nothing else takes the slot.
//   2. It is never derived from POSITION IN THE LINEUP. An account that has not claimed one yet
//      still gets a number — allocated from when the channel was CREATED, which never changes,
//      rather than from who happens to be on air, which changes constantly. So existing channels
//      keep the numbers they have and simply stop drifting.
//   3. Reserved ranges are reserved even when empty.
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
 * The lowest major an account may be given.
 *
 * `used` is every number already CLAIMED — read from storage, not from who is currently on air.
 * Allocating against the live lineup is what let two accounts end up sharing a number and what
 * let an idle account's number get handed to someone else.
 */
export function nextUserMajor(used: Iterable<number>): number {
  const taken = new Set<number>(used);
  let n = 1;
  while (taken.has(n) || RESERVED_MAJORS.has(n)) n++;
  return n;
}

/** Whether an account is allowed to bind this major. */
export function isAllocatableMajor(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n < SCIENCE_BAND_START && !RESERVED_MAJORS.has(n);
}

/**
 * How a channel with no number at all appears.
 *
 * Reached only when a channel has neither a claim nor a creation date — rare, and better shown
 * as blank than as a number that will be different tomorrow.
 */
export const UNNUMBERED = '—';

export interface NumberCandidate {
  /** Stable identity — the owner account, or the first-party channel id. */
  key: string;
  /** A claimed, persisted number. Always wins. */
  claimed?: number;
  /** When the channel was created. Immutable, which is the entire point. */
  createdAt?: number;
}

/**
 * Numbers for a whole lineup.
 *
 * The ordering property that matters: this depends only on claims and creation dates, never on
 * who is currently on air or in what order they loaded. Two viewers looking at the same set of
 * channels at different moments see the same numbers, and an account going live or dark moves
 * nobody.
 *
 * Claims are honoured first and reserved out, so a provisional number can never collide with
 * one somebody already owns. The rest are handed out oldest-first — which is what keeps the
 * numbers that existing channels already have, instead of resetting the guide.
 *
 * One thing this deliberately does NOT promise: an unclaimed number survives a channel being
 * DELETED from the set — the ones after it move up. Small consecutive integers cannot be both
 * gapless and deletion-stable without a registry that remembers what was handed out, which is
 * precisely what `claimChannelNumber` persists. Provisional numbers are stable against the thing
 * that was actually going wrong (someone else switching on); claims make them permanent.
 */
export function assignMajors(candidates: readonly NumberCandidate[]): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();

  for (const c of candidates) {
    if (typeof c.claimed === 'number' && isAllocatableMajor(c.claimed)) {
      out.set(c.key, c.claimed);
      taken.add(c.claimed);
    }
  }

  // Oldest first, with the key as a tiebreak so the order is total — two channels created in the
  // same millisecond must still resolve the same way on every device.
  const unclaimed = candidates
    .filter((c) => !out.has(c.key) && typeof c.createdAt === 'number')
    .sort((a, b) => (a.createdAt! - b.createdAt!) || a.key.localeCompare(b.key));

  let n = 1;
  for (const c of unclaimed) {
    while (taken.has(n) || RESERVED_MAJORS.has(n)) n++;
    taken.add(n);
    out.set(c.key, n);
  }
  return out;
}

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
