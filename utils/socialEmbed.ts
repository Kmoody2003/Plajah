export type SocialPlatform = 'youtube' | 'tiktok' | 'twitter' | 'instagram';

export interface SocialEmbed {
  platform: SocialPlatform;
  id: string;
  embedUrl: string;
  originalUrl: string;
  username?: string;
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function extractUrlsFromText(text: string): string[] {
  return [...(text.matchAll(URL_REGEX) || [])].map(m =>
    m[0].replace(/[.,;!?)\]]+$/, '')
  );
}

export function parseSocialUrl(raw: string): SocialEmbed | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^(www\.|mobile\.)/, '');

    // ── YouTube ─────────────────────────────────────────────────────────────
    if (host === 'youtube.com' || host === 'youtu.be') {
      let id: string | null = null;
      if (host === 'youtu.be') {
        id = u.pathname.slice(1).split('?')[0] || null;
      } else if (u.searchParams.has('v')) {
        id = u.searchParams.get('v');
      } else {
        const m = u.pathname.match(/\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{5,})/);
        if (m) id = m[1];
      }
      if (id) {
        return {
          platform: 'youtube',
          id,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
          originalUrl: raw,
        };
      }
    }

    // ── TikTok ──────────────────────────────────────────────────────────────
    if (host === 'tiktok.com' || host === 'vm.tiktok.com') {
      const m = u.pathname.match(/\/video\/(\d+)/);
      if (m) {
        return {
          platform: 'tiktok',
          id: m[1],
          embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`,
          originalUrl: raw,
        };
      }
    }

    // ── X / Twitter ─────────────────────────────────────────────────────────
    if (host === 'twitter.com' || host === 'x.com') {
      const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
      if (m) {
        return {
          platform: 'twitter',
          id: m[2],
          embedUrl: `https://twitter.com/${m[1]}/status/${m[2]}`,
          originalUrl: raw,
          username: m[1],
        };
      }
    }

    // ── Instagram ────────────────────────────────────────────────────────────
    if (host === 'instagram.com') {
      const m = u.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) {
        return {
          platform: 'instagram',
          id: m[2],
          embedUrl: `https://www.instagram.com/${m[1]}/${m[2]}/`,
          originalUrl: raw,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function detectSocialEmbeds(text: string): SocialEmbed[] {
  if (!text) return [];
  const seen = new Set<string>();
  return extractUrlsFromText(text)
    .map(parseSocialUrl)
    .filter((e): e is SocialEmbed => {
      if (!e) return false;
      const key = `${e.platform}:${e.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
