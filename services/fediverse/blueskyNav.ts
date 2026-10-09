// Tiny navigation bus for the in-app Bluesky screens (profile / thread / search). Anything can open one —
// a post card, a @mention, a #hashtag, a header button — without knowing where the overlay host is mounted.

export type BskyNav =
  | { kind: 'profile'; actor: string }
  | { kind: 'thread'; uri: string }
  | { kind: 'search'; q?: string };

export const BSKY_OPEN_EVENT = 'PLAJAH_BSKY_OPEN';

export function openBluesky(nav: BskyNav): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<BskyNav>(BSKY_OPEN_EVENT, { detail: nav }));
}
