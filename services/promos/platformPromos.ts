/**
 * Plajah's own promo spots — the site-wide commercial rotation.
 *
 * They air in two places: inside FAST ad breaks (components/tv/AdBreakBumper) and in the left ad panel
 * (components/ads/PromoBillboard, muted until hovered). A promo may name a channel; where it does, the
 * panel offers "Tune in now" / "Add to watchlist" for it — but only while that channel is in the pilot.
 *
 * Bundled in public/promos so they start instantly. Add a spot by appending to PLAJAH_PROMOS.
 */

export interface PlajahPromo {
  id: string;
  url: string;
  title: string;
  durationSec: number;
  /** Poster for the watchlist entry. */
  thumbnail?: string;
  /** The channel this spot sells — drives the Tune in / Watchlist buttons. */
  channel?: { plajahId?: string; ownerId?: string; name: string };
  /** Plays this many times per rotation pass in the panel and in breaks everywhere (default 1). */
  weight?: number;
}

export const PLAJAH_PROMOS: readonly PlajahPromo[] = [
  {
    id: 'horror-classics-30s',
    url: '/promos/plajah-horror-promo-30s-v4.mp4',
    title: 'Plajah Horror Classics',
    durationSec: 30,
    channel: { plajahId: 'horror-classics', name: 'Plajah Horror Classics' },
  },
  { id: 'chora-30s', url: '/promos/plajah-chora-promo-30s-v3.mp4', title: 'Plajah Chora', durationSec: 30 },
  { id: 'lorea-30s', url: '/promos/plajah-lorea-promo-30s-v4.mp4', title: 'Plajah Lorea', durationSec: 30 },
];

/**
 * Channels in the first rollout (a week or two of testing before it widens): Impact TV, Cashmere,
 * K-Moody, The Endless Hour and Plajah Horror Classics. User channels have no stable id here, so they
 * are matched by name.
 */
const PILOT_PLAJAH_IDS = new Set(['endless-hour', 'horror-classics']);
const PILOT_NAME = /impact\s*tv|cashmere|k[\s-]?moody/i;
/** Channels that get the promos in HEAVY rotation inside their own breaks. */
const HEAVY_PLAJAH_IDS = new Set(['horror-classics']);
const HEAVY_NAME = /k[\s-]?moody/i;

export interface ChannelRef { plajahId?: string; name?: string }

export const isPilotChannel = (ch?: ChannelRef | null): boolean =>
  !!ch && (PILOT_PLAJAH_IDS.has(ch.plajahId || '') || PILOT_NAME.test(ch.name || ''));

export const isHeavyPromoChannel = (ch?: ChannelRef | null): boolean =>
  !!ch && (HEAVY_PLAJAH_IDS.has(ch.plajahId || '') || HEAVY_NAME.test(ch.name || ''));

/**
 * The promo spots for a channel's ad break: once each everywhere (site-wide rotation), three times
 * each on the heavy-rotation channels (K-Moody and Plajah Horror Classics).
 */
export function promoSpotsForBreak(ch?: ChannelRef | null): Array<{ url: string; title: string }> {
  const heavy = isHeavyPromoChannel(ch);
  const out: Array<{ url: string; title: string }> = [];
  for (const p of PLAJAH_PROMOS) {
    const n = heavy ? Math.max(3, p.weight || 1) : p.weight || 1;
    for (let i = 0; i < n; i++) out.push({ url: p.url, title: p.title });
  }
  return out;
}

/** The promos for the side panel, in a stable order (the panel interleaves them with its other slots). */
export const panelPromos = (): PlajahPromo[] => PLAJAH_PROMOS.flatMap(p => Array.from({ length: p.weight || 1 }, () => p));
