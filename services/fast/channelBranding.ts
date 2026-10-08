// Channel identity for branding: the stable key a name / logo / favorite hangs off, and how a
// channel's logo is chosen.
//
// A live feed's guide id is `live_<doc id>` and that doc is recreated every go-live, so anything
// keyed on it (a rename, a logo) is lost the next time the creator goes on air. The stream's URL
// is the one thing that stays the same between sessions — and the creator's own Master Control
// entry has it too — so a live source is keyed on a hash of it.

/** Small stable string hash (FNV-1a, base36). Not security — just a short key. */
export function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Normalise a stream URL so cosmetic differences (trailing slash, case of host) don't fork the key. */
function normUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url.trim();
  }
}

/** Key for a live source, from its stream URL. Used by the guide AND the Master Control editor. */
export const liveSourceKey = (url: string): string => `url_${hashKey(normUrl(url))}`;

/** Key for an account's FAST channel. */
export const fastSourceKey = (ownerId: string): string => `fast_${ownerId}`;

/** The key a guide sub-channel's custom name / logo is stored under. */
export function subKeyFor(sub: { id: string; kind?: string; ownerId?: string; scheduleOwner?: string; playUrl?: string; isLive?: boolean }): string {
  if (sub.id.startsWith('fast_')) return sub.id;
  if (sub.id.startsWith('live_') && sub.playUrl) return liveSourceKey(sub.playUrl);
  return sub.id;
}

/** What a viewer can favorite: first-party channels by plajah id, FAST channels by account,
 *  live sources by account (an account's channel is the thing people follow — not one feed doc). */
export function favoriteKey(ch: { id: string; plajahId?: string; scheduleOwner?: string; ownerId?: string }): string {
  if (ch.plajahId) return `plajah:${ch.plajahId}`;
  if (ch.scheduleOwner) return `fast_${ch.scheduleOwner}`;
  if (ch.ownerId) return `owner:${ch.ownerId}`;
  return ch.id;
}

export interface OwnerBranding {
  logoUrl?: string;                       // account default
  subLogos?: Record<string, string>;
  subNames?: Record<string, string>;
  photoURL?: string;                      // owner's profile photo
}

/** custom per-channel logo → account logo → profile photo → undefined (the UI draws the Plajah chevron). */
export function resolveChannelLogo(
  branding: OwnerBranding | undefined,
  subKey: string,
  fallbackPhoto?: string,
): string | undefined {
  return branding?.subLogos?.[subKey] || branding?.logoUrl || branding?.photoURL || fallbackPhoto || undefined;
}
