// broadcastFontEmbed — make a broadcast SVG carry its own typefaces.
//
// The library previews these identities inline in the DOM, where the page's Google Fonts apply.
// The moment one becomes a media-pool asset it is an SVG inside an <img>, and an <img> will not
// fetch a web font for its content — every face silently falls back to whatever the machine has.
// So the export path fetches each face the identity uses and writes it into the SVG as a
// @font-face with a data: URI. Data URIs inside the SVG's own <style> are allowed in <img>.
//
// Browser only; in node it returns the SVG unchanged.
import { FONTS, type FontKey } from '../tela/telaFonts';

const cache = new Map<string, Promise<string>>();

async function faceCss(key: FontKey): Promise<string> {
  const spec = FONTS[key];
  if (!spec?.google) return '';
  if (cache.has(key)) return cache.get(key)!;
  const job = (async () => {
    // Ask for the static weights the designs use; a woff2 per weight keeps the asset small.
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${spec.google}&display=swap`, { headers: { Accept: 'text/css' } }).then(r => r.ok ? r.text() : '');
    if (!css) return '';
    const out: string[] = [];
    // Each @font-face block carries one url(); inline it.
    for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
      const url = block.match(/url\(([^)]+)\)/)?.[1]?.replace(/["']/g, '');
      if (!url) continue;
      // Skip the per-script subsets that do not cover Latin; they only add weight.
      if (/unicode-range:\s*(?!U\+0000)/i.test(block) && !/U\+0000-00FF/i.test(block)) continue;
      const bytes = await fetch(url).then(r => r.ok ? r.arrayBuffer() : null);
      if (!bytes) continue;
      let bin = ''; const u8 = new Uint8Array(bytes); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      const mime = url.endsWith('.woff2') ? 'font/woff2' : url.endsWith('.woff') ? 'font/woff' : 'font/ttf';
      out.push(block.replace(/url\([^)]+\)\s*format\([^)]+\)/, `url(data:${mime};base64,${btoa(bin)}) format('${mime.split('/')[1]}')`).replace(/url\([^)]+\)/, m => m.startsWith('url(data:') ? m : `url(data:${mime};base64,${btoa(bin)})`));
    }
    return out.join('\n');
  })().catch(() => '');
  cache.set(key, job);
  return job;
}

/** Return the SVG with every named face embedded. Unknown or offline faces are left to fall back. */
export async function embedBroadcastFonts(svg: string, keys: FontKey[]): Promise<string> {
  if (typeof fetch === 'undefined' || typeof btoa === 'undefined' || !keys.length) return svg;
  const css = (await Promise.all(keys.map(faceCss))).filter(Boolean).join('\n');
  if (!css) return svg;
  return svg.replace(/<defs>/, `<defs><style>${css.replace(/</g, '&lt;')}</style>`);
}
