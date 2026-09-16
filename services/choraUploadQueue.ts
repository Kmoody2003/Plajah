// Upload persistence owns enqueueing; a mounted upload screen is not required.
export async function requestChoraConversion(kind: 'album' | 'track', id: string, token: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(`/api/chora/enqueue-${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(kind === 'album' ? { albumId: id } : { trackId: id }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) return true;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
    } catch { /* bounded retry; server catalog discovery provides recovery */ }
    if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  console.warn(`[Chora] Upload saved, but conversion queue request failed for ${kind} ${id}.`);
  return false;
}

export function protectPlaylist(playlist: string, token: string): string {
  const add = (url: string) => `${url}${url.includes('?') ? '&' : '?'}access=${encodeURIComponent(token)}`;
  return playlist.split('\n').map(line => line.startsWith('#')
    ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${add(uri)}"`)
    : line.trim() ? add(line.trim()) : line).join('\n');
}
