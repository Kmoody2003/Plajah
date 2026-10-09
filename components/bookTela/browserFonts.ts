// Browser-side font + asset loading for the exporters. Kept out of services/ because it uses Vite's `?url` imports.
// Fonts are EB Garamond (SIL OFL 1.1), the same family the POD interior pipeline embeds, so screen/print PDFs match.
import type { PDFDocument } from 'pdf-lib';
import type { BookPdfFonts, FontLoader } from '../../services/bookTela/export/pdf';
import type { AssetResolver, EmbedFont } from '../../services/bookTela/export/common';
import { sniffMime } from '../../services/bookTela/export/common';
// Relative paths bypass the package `exports` map of @fontsource (which only exposes CSS).
import regUrl from '../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url';
import itUrl from '../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff?url';
import boldUrl from '../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff?url';
import boldItUrl from '../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-700-italic.woff?url';

const bytes = async (u: string) => new Uint8Array(await (await fetch(u)).arrayBuffer());

export const browserFontLoader: FontLoader = async (doc: PDFDocument): Promise<BookPdfFonts> => {
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  doc.registerFontkit(fontkit);
  const [r, i, b, bi] = await Promise.all([regUrl, itUrl, boldUrl, boldItUrl].map(bytes));
  return { regular: await doc.embedFont(r, { subset: true }), italic: await doc.embedFont(i, { subset: true }), bold: await doc.embedFont(b, { subset: true }), boldItalic: await doc.embedFont(bi, { subset: true }) };
};

export async function ebGaramondForEpub(): Promise<EmbedFont[]> {
  const [r, i, b, bi] = await Promise.all([regUrl, itUrl, boldUrl, boldItUrl].map(bytes));
  const f = (weight: 400 | 700, style: 'normal' | 'italic', data: Uint8Array): EmbedFont => ({ family: 'EB Garamond', license: 'OFL-1.1', weight, style, ext: 'woff', bytes: data });
  return [f(400, 'normal', r), f(400, 'italic', i), f(700, 'normal', b), f(700, 'italic', bi)];
}

/** Direct fetch first (data:, same-origin, CORS-enabled), then the platform proxy the reader already uses for remote files. */
export const browserResolver: AssetResolver = async url => {
  const tryFetch = async (u: string) => { const r = await fetch(u); if (!r.ok) return null; const b = new Uint8Array(await r.arrayBuffer()); return { bytes: b, mime: sniffMime(b, (r.headers.get('content-type') || '').split(';')[0]) }; };
  try { const d = await tryFetch(url); if (d) return d; } catch { /* CORS or offline */ }
  if (/^https?:/i.test(url)) { try { return await tryFetch(`/api/proxy?url=${encodeURIComponent(url)}`); } catch { /* give up: alt text is used */ } }
  return null;
};
