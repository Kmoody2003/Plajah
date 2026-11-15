// What people type into "Mastodon server" is rarely a bare host. Accept every common form and reduce it to the
// server's origin:
//   mastodon.social · https://mastodon.social · KMoody2003@mastodon.social · @KMoody2003@mastodon.social
//   https://mastodon.social/@KMoody2003 · mastodon.social/about
// The old code prefixed "https://" onto whatever was typed, so a handle became https://user@host — a URL with
// credentials, which fetch() refuses ("Request cannot be constructed from a URL that includes credentials").
// Pure and dependency-free: used by both the settings screen and the server.

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?::\d{1,5})?$/;

/** The server origin (e.g. "https://mastodon.social"), or null when nothing usable was typed. */
export function parseMastodonInstance(input: string): string | null {
  let s = String(input ?? '').trim().replace(/^@+/, '');
  if (!s) return null;

  let protocol = 'https:';
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
  if (scheme) {
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      protocol = u.protocol;
      s = u.host;                                       // drops path (/@user), query, and user:pass@
    } catch { return null; }
  } else {
    s = s.split(/[/?#]/)[0];                            // mastodon.social/about → mastodon.social
    const at = s.lastIndexOf('@');
    if (at >= 0) s = s.slice(at + 1);                   // user@host → host
  }

  const host = s.toLowerCase().replace(/\.$/, '');
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host);
  if (!isLocal && !HOST_RE.test(host)) return null;
  // Plain http only for local development servers.
  return `${isLocal ? protocol : 'https:'}//${host}`;
}
