// Who is in the channel guide.
//
// This existed twice and disagreed with itself. LiveTvPlus decided membership inline while
// building its lineup; the numbering admin asked `fetchAllFastChannels`, which only knows about
// accounts that switched a FAST channel on. So an account carrying a live channel and no FAST
// channel had a number in the guide and was invisible to the thing that assigns numbers — which
// means the migration would have skipped it and something else could later be given its address.
//
// One definition, used by both.

import type { LiveFeed } from '../../types';

export interface GuideSource {
  kind: 'live' | 'fast';
  /** Stable id for the sub-channel. */
  id: string;
  title: string;
}

export interface GuideAccount {
  ownerId: string;
  /** What the guide calls this account. A custom FAST channel name wins over a stream title. */
  name: string;
  /** A number already stored against the account, from either source. */
  number?: number;
  sources: GuideSource[];
}

/** The shape the guide needs from a FAST channel listing. Structural, so both the service's
 *  `FastChannelListing` and a test fixture satisfy it without importing each other. */
export interface FastChannelLike {
  ownerId: string;
  name?: string;
  number?: number;
}

/**
 * Is this live feed a CHANNEL, or is it content?
 *
 * An on-platform (WebRTC / Reello) stream is content: it belongs to its creator's FAST channel and
 * flows there when it ends, so listing it as its own channel would put the same thing in the guide
 * twice. Off-platform sources — a creator re-broadcasting an external feed — are genuinely their
 * own channel. A creator can opt an on-platform stream in with `asChannel`, and then it counts.
 */
export function isChannelFeed(f: LiveFeed | Record<string, unknown>): boolean {
  const a = f as Record<string, unknown>;
  const url = typeof a.url === 'string' ? a.url : '';
  if (!url) return false;
  if (a.status === 'ENDED' || a.status === 'OFFLINE') return false;
  const onPlatform = a.streamSource === 'webrtc' || /[?&]stream=/.test(url);
  return !onPlatform || !!a.asChannel;
}

/**
 * Every account the guide gives a number to, with the sources sitting under it.
 *
 * An account is ONE channel with sub-channels — N.1 for a live source, N.2 for the FAST channel —
 * the way an over-the-air station has virtual subs. So the number belongs to the account, not to
 * any one stream, and this is the list the allocator has to see.
 */
export function guideAccounts(
  feeds: readonly (LiveFeed | Record<string, unknown>)[] | null | undefined,
  fastChannels: readonly FastChannelLike[] | null | undefined,
): GuideAccount[] {
  const map = new Map<string, GuideAccount>();
  const ensure = (ownerId: string, name: string): GuideAccount => {
    let o = map.get(ownerId);
    if (!o) { o = { ownerId, name, sources: [] }; map.set(ownerId, o); }
    return o;
  };

  for (const f of feeds || []) {
    if (!isChannelFeed(f)) continue;
    const a = f as Record<string, unknown>;
    // Falling back to the feed's own id matters: a feed with no ownerId is still somebody's
    // channel in the guide, and it needs an identity the registry can key on.
    const ownerId = (typeof a.ownerId === 'string' && a.ownerId) || String(a.id ?? '');
    if (!ownerId) continue;
    const title = String(a.title ?? 'Live');
    const o = ensure(ownerId, String(a.ownerName ?? title));
    if (typeof a.channelNumber === 'number') o.number = a.channelNumber;
    o.sources.push({ kind: 'live', id: `live_${String(a.id ?? ownerId)}`, title });
  }

  for (const fc of fastChannels || []) {
    const o = ensure(fc.ownerId, fc.name || 'Channel');
    if (fc.name) o.name = fc.name;              // a custom channel name wins for the account
    if (typeof fc.number === 'number') o.number = fc.number;
    o.sources.push({ kind: 'fast', id: `fast_${fc.ownerId}`, title: fc.name || 'FAST Channel' });
  }

  return [...map.values()];
}

/**
 * The guide number for one source under an account.
 *
 * A single-source account is a plain major; more than one and they become subs. That rule lives
 * here rather than in the renderer so the admin preview and the guide cannot disagree about
 * whether somebody is channel 12 or channel 12.1.
 */
export function sourceNumber(major: number | undefined, index: number, total: number, unnumbered: string): string {
  if (major == null) return unnumbered;
  return total > 1 ? `${major}.${index + 1}` : `${major}`;
}
