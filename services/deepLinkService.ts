// deepLinkService — the ONE place that builds shareable links to platform assets.
//
// The bug this fixes: many share buttons built `${origin}${pathname}?id=` (which
// is whatever page you're on — often the homepage) or shared window.location.href,
// so shared links dropped people on the main site instead of the actual video /
// track / post. Every share icon should route through buildShareUrl() so the link
// always opens the exact asset. The URL shapes here match App.tsx's boot deep-link
// handler, so a fresh visitor lands directly on the content.

export type ShareAsset =
  | 'album' | 'track' | 'video' | 'post' | 'profile' | 'release'
  | 'room' | 'livestream' | 'callin' | 'listen'
  | 'book' | 'article' | 'game' | 'club' | 'clubPost' | 'pitch' | 'event' | 'invite';

/** Canonical origin for share links — prefer the configured app domain over
 *  whatever host the user is on (e.g. localhost), so links work everywhere. */
export function shareOrigin(): string {
  const configured = (import.meta as any).env?.VITE_APP_URL as string | undefined;
  return (configured && /^https?:\/\//.test(configured) ? configured : window.location.origin).replace(/\/$/, '');
}

/**
 * Build a direct, landable link to an asset. `extra` carries the secondary ids
 * some assets need (a track within an album, an episode within a video, a post
 * within a club).
 */
export function buildShareUrl(asset: ShareAsset, id: string, extra?: Record<string, string | undefined>): string {
  const base = shareOrigin();
  const qs = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.set(k, v);
    return u.toString();
  };
  switch (asset) {
    case 'album':      return `${base}/?${qs({ type: 'album', id, track: extra?.track, video: extra?.video })}`;
    case 'track':      return `${base}/?${qs({ type: 'album', id, track: extra?.track })}`;
    case 'video':      return `${base}/?${qs({ type: 'video', id })}`;
    case 'post':       return `${base}/?${qs({ type: 'feed', id })}`;
    case 'profile':    return `${base}/profile/${encodeURIComponent(id)}`;
    case 'release':    return `${base}/release/${encodeURIComponent(id)}`;
    case 'room':       return `${base}/?${qs({ room: id })}`;
    case 'livestream': return `${base}/?${qs({ livestream: id })}`;
    case 'callin':     return `${base}/?${qs({ callin: id })}`;
    case 'listen':     return `${base}/?${qs({ listen: id })}`;
    case 'book':       return `${base}/?${qs({ type: 'book', id, ref: extra?.ref })}`;
    case 'article':    return `${base}/?${qs({ type: 'article', id })}`;
    case 'game':       return `${base}/?${qs({ type: 'game', id })}`;
    case 'club':       return `${base}/?${qs({ club: id })}`;
    case 'clubPost':   return `${base}/?${qs({ club: extra?.club, post: id })}`;
    case 'pitch':      return `${base}/?${qs({ pitch: id })}`;
    case 'event':      return `${base}/event/${encodeURIComponent(id)}`;
    case 'invite':     return `${base}/?${qs({ invite: id })}`;
    default:           return `${base}/?${qs({ id })}`;
  }
}

/** Copy a share link to the clipboard; returns true on success. */
export async function copyShareUrl(asset: ShareAsset, id: string, extra?: Record<string, string | undefined>): Promise<boolean> {
  try { await navigator.clipboard.writeText(buildShareUrl(asset, id, extra)); return true; }
  catch { return false; }
}

/** Native share sheet where available, with a clipboard fallback. */
export async function shareAsset(
  asset: ShareAsset, id: string,
  meta?: { title?: string; text?: string; extra?: Record<string, string | undefined> },
): Promise<'shared' | 'copied' | 'failed'> {
  const url = buildShareUrl(asset, id, meta?.extra);
  const nav = navigator as any;
  if (nav.share) {
    try { await nav.share({ title: meta?.title, text: meta?.text, url }); return 'shared'; }
    catch (e: any) { if (e?.name === 'AbortError') return 'failed'; /* fall through to copy */ }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; }
  catch { return 'failed'; }
}
