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
  | 'book' | 'article' | 'game' | 'club' | 'clubPost' | 'pitch' | 'event' | 'invite' | 'debate' | 'archive'
  | 'videoPlaylist' | 'movie' | 'channel';

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
    // Content assets route through /share — the server injects rich Open Graph meta
    // (title, "Experience … now on Plajah", cover/thumbnail) then bounces humans into
    // the app. A plain /?type= link hits static index.html and previews as generic Plajah.
    case 'album':      return `${base}/share?${qs({ type: 'album', id, track: extra?.track, video: extra?.video })}`;
    case 'track':      return `${base}/share?${qs({ type: 'album', id, track: extra?.track })}`;
    case 'video':      return `${base}/share?${qs({ type: 'video', id })}`;
    case 'movie':      return `${base}/share?${qs({ type: 'movie', id })}`;
    case 'videoPlaylist': return `${base}/share?${qs({ type: 'videoPlaylist', id })}`;
    case 'post':       return `${base}/share?${qs({ type: 'feed', id })}`;
    case 'profile':    return `${base}/profile/${encodeURIComponent(id)}`;
    case 'release':    return `${base}/release/${encodeURIComponent(id)}`;
    case 'room':       return `${base}/?${qs({ room: id })}`;
    case 'livestream': return `${base}/?${qs({ livestream: id })}`;
    case 'callin':     return `${base}/?${qs({ callin: id })}`;
    case 'listen':     return `${base}/?${qs({ listen: id })}`;
    case 'book':       return `${base}/share?${qs({ type: 'book', id, ref: extra?.ref })}`;
    case 'article':    return `${base}/share?${qs({ type: 'article', id })}`;
    case 'game':       return `${base}/share?${qs({ type: 'game', id })}`;
    case 'archive':    return `${base}/share?${qs({ type: 'archive', id })}`;
    // A live channel. `id` is a stable key — `plajah:<id>` for a first-party channel, `owner:<uid>`
    // for an account's channel — and `n` is the guide number (8.1, 42.1) carried for display and to
    // re-tune the dial. The /share route injects the channel's OG card then bounces humans into the
    // Live guide focused on it.
    case 'channel':    return `${base}/share?${qs({ type: 'channel', id, n: extra?.n })}`;
    case 'club':       return `${base}/?${qs({ club: id })}`;
    case 'debate':     return `${base}/?${qs({ debate: id })}`;
    case 'clubPost':   return `${base}/?${qs({ club: extra?.club, post: id })}`;
    case 'pitch':      return `${base}/?${qs({ pitch: id })}`;
    case 'event':      return `${base}/event/${encodeURIComponent(id)}`;
    case 'invite':     return `${base}/?${qs({ invite: id })}`;
    default:           return `${base}/?${qs({ id })}`;
  }
}

/** The default social post body — creator-forward, mirrors the /share OG description so
 *  the typed text and the link-preview card read the same: "Check out X by Y on Plajah.com". */
export function shareText(title?: string, artist?: string): string {
  const t = (title || '').trim();
  let a = (artist || '').trim();
  // Placeholder artists read badly as "…by Unknown Artist" — drop them for clean copy.
  if (/^(unknown artist|unknown|various artists?|n\/?a|na|null|undefined)$/i.test(a)) a = '';
  if (t && a) return `Check out ${t} by ${a} on Plajah.com`;
  if (t)      return `Check out ${t} on Plajah.com`;
  return 'Check out this on Plajah.com';
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
