/**
 * linkPreviewService — link card data for a pasted URL.
 *
 * There is NO existing unfurl endpoint (server.ts only serves OG tags for
 * Plajah's own pages), and browsers can't fetch arbitrary pages (CORS). So this
 * asks `/api/link-preview?url=` (routes/socialServer.ts; SSRF-hardened, cached 10 min) which returns
 * { url, title, description, image, siteName, favicon }, and degrades to a host-only card on any error.
 */
import type { LinkPreviewData } from './postingLogic';

const URL_RE = /https?:\/\/[^\s<>"]+/;

export const firstUrl = (text: string): string | null => {
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[).,;!?]+$/, '') : null;
};

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData> {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
  const fallback: LinkPreviewData = { url, title: host };
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) return fallback;
    const j = await res.json();
    if (!j || typeof j !== 'object') return fallback;
    return {
      url,
      title: typeof j.title === 'string' && j.title ? j.title.slice(0, 200) : host,
      description: typeof j.description === 'string' ? j.description.slice(0, 300) : undefined,
      image: typeof j.image === 'string' ? j.image : undefined,
    };
  } catch { return fallback; }
}
