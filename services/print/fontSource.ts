// fontSource — embeddable font files for vector text in the press PDF.
//
// Tela's type comes from Google Fonts (open licences). Google hands browsers WOFF2, which fontkit
// cannot subset, but hands server clients a static TrueType file per weight. So the CSS is fetched
// through Plajah's own /api/proxy (a server fetch), and the .ttf it names is downloaded from
// fonts.gstatic.com. System families (Georgia, Arial, system-ui…) ship no file we may embed; they are
// replaced by an open family of the same class and the substitution is reported. When nothing can be
// fetched (offline, or a dev lab with no proxy) the caller keeps that text in the raster underlay.
// `classifyFamily` / `SYSTEM_FAMILIES` are pure and shared with preflight.

import type { ResolvedFont } from './vector';
import { fontKey } from './vector';

export type FontClass = 'serif' | 'sans' | 'mono';

/** Families with no embeddable open file, by class. */
export const SYSTEM_FAMILIES: Record<string, FontClass> = {
  georgia: 'serif', 'times new roman': 'serif', times: 'serif', cambria: 'serif', 'book antiqua': 'serif', palatino: 'serif', garamond: 'serif',
  arial: 'sans', helvetica: 'sans', 'helvetica neue': 'sans', 'segoe ui': 'sans', verdana: 'sans', tahoma: 'sans', calibri: 'sans', 'system-ui': 'sans',
  '-apple-system': 'sans', blinkmacsystemfont: 'sans', 'ui-sans-serif': 'sans', 'sans-serif': 'sans', 'trebuchet ms': 'sans',
  'courier new': 'mono', courier: 'mono', consolas: 'mono', 'cascadia mono': 'mono', menlo: 'mono', monaco: 'mono', 'ui-monospace': 'mono', monospace: 'mono',
  serif: 'serif', 'ui-serif': 'serif', cursive: 'sans', fantasy: 'sans',
};

/** Open stand-ins for system families. */
export const SUBSTITUTE: Record<FontClass, string> = { serif: 'Source Serif 4', sans: 'Inter', mono: 'JetBrains Mono' };

export const isSystemFamily = (family: string) => family.trim().toLowerCase() in SYSTEM_FAMILIES;

/** The class of a CSS font-family stack: the first system/generic family in it decides; default sans. */
export function classifyFamily(stack: string): FontClass {
  for (const raw of stack.split(',')) {
    const f = raw.trim().replace(/["']/g, '').toLowerCase();
    if (f in SYSTEM_FAMILIES) return SYSTEM_FAMILIES[f];
  }
  return /serif|garamond|baskerville|bodoni|caslon|playfair|lora|merriweather|crimson|spectral|fraunces/i.test(stack) && !/sans/i.test(stack) ? 'serif' : 'sans';
}

export interface FontSourceOptions {
  /** The app's proxy endpoint (server fetch, so Google returns TrueType). */
  proxy?: string;
  fetchFn?: typeof fetch;
}

const cache = new Map<string, Promise<ResolvedFont | null>>();

async function googleTtf(family: string, weight: number, italic: boolean, o: FontSourceOptions): Promise<Uint8Array | null> {
  const f = o.fetchFn || fetch;
  const fam = family.trim().replace(/ /g, '+');
  const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const css = `https://fonts.googleapis.com/css2?family=${fam}:${axis}`;
  let text = '';
  try {
    const r = await f(`${o.proxy ?? '/api/proxy'}?url=${encodeURIComponent(css)}`);
    if (!r.ok) return null;
    text = await r.text();
  } catch { return null; }
  // A server fetch gets one @font-face with a full TrueType file. WOFF2 means the proxy wasn't a server fetch.
  const m = text.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)\s*format\(['"]truetype['"]\)/);
  if (!m) return null;
  for (const url of [m[1], `${o.proxy ?? '/api/proxy'}?url=${encodeURIComponent(m[1])}`]) {
    try {
      const r = await f(url);
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch { /* CORS or offline: try the proxy */ }
  }
  return null;
}

/**
 * Resolve an embeddable font for a computed CSS family stack, weight and style. Tries the stack's first
 * family on Google at the exact weight, then 400/700; system families and misses fall back to the
 * class's open stand-in (reported as a substitution).
 */
export function resolveFont(stack: string, weight: number, italic: boolean, o: FontSourceOptions = {}): Promise<ResolvedFont | null> {
  const first = stack.split(',')[0].trim().replace(/["']/g, '');
  const w = Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
  const key = fontKey(first, w, italic);
  if (!cache.has(key)) cache.set(key, (async () => {
    const tryFamily = async (family: string) => {
      for (const ww of [...new Set([w, w >= 600 ? 700 : 400, 400])]) {
        const bytes = await googleTtf(family, ww, italic, o);
        if (bytes) return { bytes, family, weight: ww, italic } as ResolvedFont;
      }
      return null;
    };
    if (!isSystemFamily(first)) {
      const direct = await tryFamily(first);
      if (direct) return direct;
    }
    const sub = SUBSTITUTE[classifyFamily(stack)];
    const stand = await tryFamily(sub) || (italic ? await googleTtf(sub, w, false, o).then(b => b && ({ bytes: b, family: sub, weight: w, italic: false } as ResolvedFont)) : null);
    return stand ? { ...stand, substitutedFor: first } : null;
  })());
  return cache.get(key)!;
}

/** For tests: forget resolved fonts. */
export const clearFontCache = () => cache.clear();
