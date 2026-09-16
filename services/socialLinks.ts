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

export type SocialPlatform = 'x' | 'mastodon' | 'bluesky' | 'threads' |
  'website' | 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin' |
  'twitch' | 'discord' | 'spotify' | 'appleMusic' | 'amazonMusic' | 'soundcloud' | 'bandcamp';

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  handle: string;
  url: string;
}

const strip = (s?: string) => (s || '').trim().replace(/^@+/, '');

export const PROFILE_LINK_FIELDS: ReadonlyArray<{ platform: Exclude<SocialPlatform, 'x' | 'mastodon' | 'bluesky' | 'threads'>; label: string; placeholder: string; group: 'social' | 'music' | 'home' }> = [
  { platform: 'website', label: 'Website', placeholder: 'https://yourwebsite.com', group: 'home' },
  { platform: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/username', group: 'social' },
  { platform: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/username', group: 'social' },
  { platform: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@username', group: 'social' },
  { platform: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@channel', group: 'social' },
  { platform: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username', group: 'social' },
  { platform: 'twitch', label: 'Twitch', placeholder: 'https://twitch.tv/username', group: 'social' },
  { platform: 'discord', label: 'Discord', placeholder: 'https://discord.gg/invite', group: 'social' },
  { platform: 'spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/…', group: 'music' },
  { platform: 'appleMusic', label: 'Apple Music', placeholder: 'https://music.apple.com/…/artist/…', group: 'music' },
  { platform: 'amazonMusic', label: 'Amazon Music', placeholder: 'https://music.amazon.com/artists/…', group: 'music' },
  { platform: 'soundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/username', group: 'music' },
  { platform: 'bandcamp', label: 'Bandcamp', placeholder: 'https://artist.bandcamp.com', group: 'music' },
];

export function normalizePublicProfileUrl(value?: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (!parsed.hostname || parsed.username || parsed.password) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch { return ''; }
}

export function invalidProfileLinks(links?: UserProfile['socialLinks']): string[] {
  return PROFILE_LINK_FIELDS.filter(field => links?.[field.platform]?.trim() && !normalizePublicProfileUrl(links[field.platform])).map(field => field.label);
}

/** Resolve a UserProfile's fragmented handle fields into canonical links. */
export function getSocialLinks(p: Pick<UserProfile,
  'xHandle' | 'xUrl' | 'mastodonHandle' | 'mastodonInstance' | 'blueskyHandle' | 'threadsHandle' | 'socialLinks'> | null | undefined
): SocialLink[] {
  if (!p) return [];
  const out: SocialLink[] = [];

  const x = strip(p.xHandle);
  if (p.xUrl || x) {
    const url = normalizePublicProfileUrl(p.xUrl) || `https://x.com/${encodeURIComponent(x)}`;
    out.push({ platform: 'x', label: 'X', handle: x || url, url });
  }

  const masto = strip(p.mastodonHandle);
  if (masto) {
    const instance = (p.mastodonInstance || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || 'mastodon.social';
    const url = normalizePublicProfileUrl(`https://${instance}/@${masto}`);
    if (url) out.push({ platform: 'mastodon', label: 'Mastodon', handle: `@${masto}@${instance}`, url });
  }

  const bsky = strip(p.blueskyHandle);
  if (bsky) out.push({ platform: 'bluesky', label: 'Bluesky', handle: bsky, url: `https://bsky.app/profile/${bsky}` });

  const threads = strip(p.threadsHandle);
  if (threads) out.push({ platform: 'threads', label: 'Threads', handle: `@${threads}`, url: `https://www.threads.net/@${threads}` });

  for (const field of PROFILE_LINK_FIELDS) {
    const url = normalizePublicProfileUrl(p.socialLinks?.[field.platform]);
    if (url) out.push({ platform: field.platform, label: field.label, handle: new URL(url).hostname.replace(/^www\./, ''), url });
  }

  return out;
}
