/**
 * Self-host the film's typefaces (all SIL Open Font License) so the in-app player and the MP4
 * renderer never depend on Google Fonts at runtime.
 * Run: npx tsx scripts/dossier/fetchFilmFonts.ts  → public/dossier/fonts/{*.woff2, fonts.css}
 *
 * Two sets, one stylesheet:
 *  - legacy: IM Fell English, Playfair Display, Inter (the original Douglass film);
 *  - council: the Motion Council's type family for all four exhibits (Anton, Abril Fatface, Alfa Slab One,
 *    Cormorant Garamond, Fraunces, Source Serif 4, Inter Tight, and the real scripts: Noto Sans Syriac,
 *    Noto Nastaliq Urdu, Noto Serif Devanagari, Noto Serif Gurmukhi, Noto Serif SC).
 *
 * Noto Serif SC is a ~120-slice CJK family; the film only ever needs the characters of the Xi'an stele
 * title, so it is fetched with Google's `text=` subsetting (one small file) instead of the whole family.
 * Add characters to SC_TEXT when another film needs them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const OUT = join('public', 'dossier', 'fonts');

const LEGACY = 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Inter:wght@400;600;700&display=block';
const COUNCIL = 'https://fonts.googleapis.com/css2?'
  + [
    'family=Anton',
    'family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700',
    'family=Inter+Tight:wght@400..700',
    'family=Abril+Fatface',
    'family=Alfa+Slab+One',
    'family=Cormorant+Garamond:ital,wght@0,500;0,700;1,500',
    'family=Fraunces:opsz,wght@9..144,400..800',
    'family=Noto+Sans+Syriac',
    'family=Noto+Nastaliq+Urdu',
    'family=Noto+Serif+Devanagari:wght@400;600',
    'family=Noto+Serif+Gurmukhi:wght@400;600',
  ].join('&') + '&display=block';
const SC_TEXT = '大秦景教流行中國碑建唐';
const SC = `https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500&text=${encodeURIComponent(SC_TEXT)}&display=block`;

/** The film uses English text with curly quotes and dashes, plus the real second scripts of the exhibits. */
const KEEP = /^(latin|latin-ext|syriac|arabic|devanagari|gurmukhi)$/;

interface Block { family: string; style: string; weight: string; subset: string; url: string; css: string }

function parse(css: string, defaultSubset = ''): Block[] {
  // Google separates subsets with `/* subset */` comments; the `text=` response has none.
  const parts = css.includes('/*') ? css.split('/*').slice(1).map(b => '/*' + b) : [css];
  return parts.map(b => ({
    family: /font-family: '([^']+)'/.exec(b)![1],
    style: /font-style: (\w+)/.exec(b)![1],
    weight: (/font-weight: ([\d ]+)/.exec(b)?.[1] ?? '400').trim().replace(/\s+/g, '-'),
    subset: /\/\* ([\w-]+) \*\//.exec(b)?.[1] ?? defaultSubset,
    url: /url\(([^)]+)\)/.exec(b)![1],
    css: b,
  }));
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let local = '/* Self-hosted for the Dossier film. Fonts: SIL Open Font License 1.1. */\n';
  const files = new Map<string, string>();
  const emit = async (blocks: Block[], name: (b: Block) => string) => {
    for (const b of blocks) {
      let file = files.get(b.url);
      if (!file) {
        file = name(b);
        const buf = Buffer.from(await (await fetch(b.url)).arrayBuffer());
        writeFileSync(join(OUT, file), buf);
        files.set(b.url, file);
        console.log(file, buf.length);
      }
      local += b.css.replace(b.url, `/dossier/fonts/${file}`) + '\n';
    }
  };
  const fam = (s: string) => s.replace(/\s+/g, '');

  // Legacy set: file names unchanged so the Douglass film keeps resolving them.
  await emit(parse(await get(LEGACY)).filter(b => /^latin(-ext)?$/.test(b.subset)), b => `${fam(b.family)}-${b.style}-${b.subset}.woff2`);
  // Council set: weight in the name, because several families ship more than one weight per subset.
  await emit(parse(await get(COUNCIL)).filter(b => KEEP.test(b.subset)), b => `${fam(b.family)}-${b.style}-${b.weight}-${b.subset}.woff2`);
  await emit(parse(await get(SC), 'stele'), b => `${fam(b.family)}-${b.style}-${b.weight}-stele.woff2`);

  writeFileSync(join(OUT, 'fonts.css'), local);
  console.log(`wrote ${files.size} files → ${OUT}/fonts.css`);
}

main().catch(e => { console.error(e); process.exit(1); });
