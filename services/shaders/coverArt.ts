// coverArt — turns a track's cover URL into (a) a same-origin object URL the WebGPU texture loader can
// always read, and (b) a 3-colour palette the council recolours its looks toward.
//
// Why fetch→blob instead of handing the remote URL to the library: GPU texture upload needs a CORS-clean
// image, and covers come from several origins (Firebase Storage, Audius, user URLs). Fetching with CORS and
// re-serving as a blob either works or fails LOUDLY here, and on failure we substitute a generated
// brand-gradient cover so a look never goes blank and never falls back to the library's own sample image.

export interface ResolvedCover { url: string; palette: string[]; real: boolean }

const cache = new Map<string, Promise<ResolvedCover>>();
const BRAND = ['#8b5cf6', '#ff8c00', '#22d3ee'];

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

function placeholder(): ResolvedCover {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, '#0b0b12'); g.addColorStop(0.5, BRAND[0]); g.addColorStop(1, BRAND[1]);
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    return { url: c.toDataURL('image/png'), palette: BRAND, real: false };
  } catch { return { url: '', palette: BRAND, real: false }; }
}

/** Up to 3 distinct, vivid colours from a bitmap — saturation×brightness ranked, spread by RGB distance. */
export function paletteFromPixels(data: Uint8ClampedArray): string[] {
  const px: { r: number; g: number; b: number; score: number }[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    px.push({ r, g, b, score: sat * (mx / 255) + 0.05 * (mx / 255) });
  }
  px.sort((a, b) => b.score - a.score);
  const out: typeof px = [];
  for (const p of px) {
    if (out.every(o => Math.hypot(o.r - p.r, o.g - p.g, o.b - p.b) > 90)) out.push(p);
    if (out.length === 3) break;
  }
  return out.length ? out.map(p => hex(p.r, p.g, p.b)) : BRAND;
}

export function resolveCover(url?: string | null): Promise<ResolvedCover> {
  if (!url) return Promise.resolve(placeholder());
  const hit = cache.get(url);
  if (hit) return hit;
  const p = (async (): Promise<ResolvedCover> => {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(bmp, 0, 0, 24, 24);
      const palette = paletteFromPixels(x.getImageData(0, 0, 24, 24).data);
      bmp.close?.();
      return { url: URL.createObjectURL(blob), palette, real: true };
    } catch {
      return placeholder(); // CORS-blocked, offline, or not an image — never blank, never a foreign fallback
    }
  })();
  cache.set(url, p);
  if (cache.size > 8) cache.delete(cache.keys().next().value as string);
  return p;
}
