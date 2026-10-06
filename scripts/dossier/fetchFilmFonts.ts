/**
 * Self-host the film's typefaces (all SIL Open Font License) so the in-app player and the MP4
 * renderer never depend on Google Fonts at runtime.
 * Run: npx tsx scripts/dossier/fetchFilmFonts.ts  → public/dossier/fonts/{*.woff2, fonts.css}
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Inter:wght@400;600;700&display=block';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const OUT = join('public', 'dossier', 'fonts');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const css = await (await fetch(SRC, { headers: { 'User-Agent': UA } })).text();
  // Keep only the latin + latin-ext subsets (the film uses English text, curly quotes, dashes).
  const blocks = css.split('/*').slice(1).map(b => '/*' + b).filter(b => /\/\* latin(-ext)? \*\//.test(b));
  let local = '/* Self-hosted for the Dossier film. Fonts: SIL Open Font License 1.1. */\n';
  const files = new Map<string, string>();
  for (const block of blocks) {
    const family = /font-family: '([^']+)'/.exec(block)![1];
    const style = /font-style: (\w+)/.exec(block)![1];
    const subset = /\/\* ([\w-]+) \*\//.exec(block)![1];
    const url = /url\(([^)]+)\)/.exec(block)![1];
    let file = files.get(url);
    if (!file) {
      file = `${family.replace(/\s+/g, '')}-${style}-${subset}.woff2`;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      writeFileSync(join(OUT, file), buf);
      files.set(url, file);
      console.log(file, buf.length);
    }
    local += block.replace(url, `/dossier/fonts/${file}`) + '\n';
  }
  writeFileSync(join(OUT, 'fonts.css'), local);
  console.log(`wrote ${blocks.length} faces → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
