// socialLinks — one canonical read for a user's external social links.
//
// Part 1 / step 3 consolidation. A user's socials were fragmented across flat
// fields (xHandle, xUrl, mastodonHandle, mastodonInstance, blueskyHandle,
// threadsHandle), while Album/Brand/Business used a different `socialLinks`
// object shape. This normalizes the UserProfile handles into ONE resolved list
// (platform + label + absolute url) so every display reads them the same way.
// Writes still use the existing per-field settings for now (mirror-write phase);
// unifying the storage shape is the follow-up.

import type { UserProfile } from '../types';

export type SocialPlatform = 'x' | 'mastodon' | 'bluesky' | 'threads';

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  handle: string;
  url: string;
}

const strip = (s?: string) => (s || '').trim().replace(/^@+/, '');

/** Resolve a UserProfile's fragmented handle fields into canonical links. */
export function getSocialLinks(p: Pick<UserProfile,
  'xHandle' | 'xUrl' | 'mastodonHandle' | 'mastodonInstance' | 'blueskyHandle' | 'threadsHandle'> | null | undefined
): SocialLink[] {
  if (!p) return [];
  const out: SocialLink[] = [];

  const x = strip(p.xHandle);
  if (p.xUrl || x) {
    out.push({ platform: 'x', label: 'X', handle: x || p.xUrl || '', url: p.xUrl || `https://x.com/${x}` });
  }

  const masto = strip(p.mastodonHandle);
  if (masto) {
    const instance = (p.mastodonInstance || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || 'mastodon.social';
    out.push({ platform: 'mastodon', label: 'Mastodon', handle: `@${masto}@${instance}`, url: `https://${instance}/@${masto}` });
  }

  const bsky = strip(p.blueskyHandle);
  if (bsky) out.push({ platform: 'bluesky', label: 'Bluesky', handle: bsky, url: `https://bsky.app/profile/${bsky}` });

  const threads = strip(p.threadsHandle);
  if (threads) out.push({ platform: 'threads', label: 'Threads', handle: `@${threads}`, url: `https://www.threads.net/@${threads}` });

  return out;
}
