// exportPages: render every page of every showcase book to PNG, from the SAME Tela doc the living reader opens
// (services/showcase/livingDoc.ts -> the registered publication designers), so the flat export version and the living version never drift.
//
//   npm run showcase:pages                              write .tela-proofs/showcase-pages/<book-id>/page-NN.png (2x) for all six books
//   npm run showcase:pages -- --only=moon-blanket,orbit-party
//   npm run showcase:pages -- --check                   render to a temp folder, pixel-compare with the files that exist, write NOTHING there
//   npm run showcase:pages -- --out=some/dir            write somewhere else
//
// One Chrome instance, one page at a time (system Chrome via puppeteer; CHROME_PATH overrides). Fonts load from Google Fonts, so this needs network.
// These PNGs are what scripts/showcase/publishBooks.ts uploads as the album's flat pages (the export version and the fallback).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHOWCASE_BOOKS } from '../../data/showcase';
import { buildShowcaseTelaDoc } from '../../services/showcase/livingDoc';
import { objectsToSvg } from '../../services/tela/telaSvg';
import { FONTS, fontKeysInStacks } from '../../services/tela/telaFonts';

const args = process.argv.slice(2);
const arg = (k: string) => (args.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const only = arg('only').split(',').filter(Boolean);
const CHECK = args.includes('--check');
const SCALE = Number(arg('scale') || 2);
const TOL_CHANNEL = Number(arg('tolerance') || 24);      // a pixel "differs" when any channel is off by more than this (0-255)
const TOL_FRACTION = Number(arg('maxdiff') || 0.01);     // a page "matches" when no more than this fraction of pixels differ
const ROOT = path.resolve('.tela-proofs/showcase-pages');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export function pageHtml(objects: Parameters<typeof objectsToSvg>[0], w: number, h: number): string {
  const links = fontKeysInStacks(objects.map(o => o.fontFamily)).map(k => (FONTS as Record<string, { google?: string }>)[k]?.google).filter(Boolean);
  const css = links.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${links.map(s => `family=${s}`).join('&')}&display=swap">` : '';
  return `<!doctype html><meta charset="utf-8">${css}<style>html,body{margin:0;background:#fff}svg{display:block}</style>${objectsToSvg(objects, w, h)}`;
}

async function main() {
  const puppeteer = (await import('puppeteer')).default;
  const sharp = (await import('sharp')).default;
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (set CHROME_PATH)`);
  const books = SHOWCASE_BOOKS.filter(b => !only.length || only.includes(b.id));
  const outRoot = CHECK ? mkdtempSync(path.join(os.tmpdir(), 'showcase-pages-')) : path.resolve(arg('out') || ROOT);
  console.log(`${CHECK ? 'CHECK (no writes to ' + ROOT + ')' : 'EXPORT'} | ${books.length} book(s) | scale ${SCALE}x | out ${outRoot}`);

  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  let bad = 0;
  try {
    const page = await browser.newPage();
    for (const b of books) {
      const doc = buildShowcaseTelaDoc(b.id);
      const dir = path.join(outRoot, b.id); mkdirSync(dir, { recursive: true });
      let worst = 0, mismatched = 0, compared = 0, missing = 0, sizeDiff = 0;
      for (let i = 0; i < doc.frames.length; i++) {
        const f = doc.frames[i]; const d = doc.devices[f.deviceIds[0]];
        if (d.type !== 'VECTOR') throw new Error(`${b.id} page ${i + 1} is not a VECTOR device`);
        await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: SCALE });
        await page.setContent(pageHtml(d.objects, d.width, d.height), { waitUntil: 'load', timeout: 90_000 });
        await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
        await new Promise(r => setTimeout(r, 300));   // let the webfont paint (the page is a single SVG; 'networkidle0' hangs on the heavier pages)
        const name = `page-${String(i + 1).padStart(2, '0')}.png`;
        const file = path.join(dir, name);
        const el = await page.$('svg');
        await el!.screenshot({ type: 'png', path: file as `${string}.png` });
        if (CHECK) {
          const ref = path.join(ROOT, b.id, name);
          if (!existsSync(ref)) { missing++; continue; }
          const [a, r] = await Promise.all([sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(ref).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
          compared++;
          if (a.info.width !== r.info.width || a.info.height !== r.info.height) { sizeDiff++; console.log(`   ${b.id}/${name}: SIZE ${a.info.width}x${a.info.height} vs existing ${r.info.width}x${r.info.height}`); continue; }
          let diff = 0; const n = a.info.width * a.info.height;
          for (let p = 0; p < n; p++) { const o = p * 3; if (Math.abs(a.data[o] - r.data[o]) > TOL_CHANNEL || Math.abs(a.data[o + 1] - r.data[o + 1]) > TOL_CHANNEL || Math.abs(a.data[o + 2] - r.data[o + 2]) > TOL_CHANNEL) diff++; }
          const frac = diff / n; worst = Math.max(worst, frac);
          if (frac > TOL_FRACTION) { mismatched++; console.log(`   ${b.id}/${name}: ${(frac * 100).toFixed(2)}% of pixels differ`); }
        }
        process.stdout.write(`   ${b.id} ${i + 1}/${doc.frames.length}\r`);
      }
      if (CHECK) {
        const ok = !mismatched && !missing && !sizeDiff; if (!ok) bad++;
        console.log(`${ok ? 'MATCH   ' : 'DIFFERS '} ${b.id}: ${compared}/${doc.frames.length} compared, worst page ${(worst * 100).toFixed(3)}% pixels differ (tolerance ${TOL_CHANNEL}/channel, ${(TOL_FRACTION * 100).toFixed(1)}% of pixels)${missing ? `, ${missing} existing files missing` : ''}${sizeDiff ? `, ${sizeDiff} size mismatches` : ''}`);
      } else console.log(`wrote ${doc.frames.length} pages -> ${dir}`);
    }
  } finally { await browser.close(); if (CHECK) { try { rmSync(outRoot, { recursive: true, force: true }); } catch { /* temp */ } } }
  if (CHECK) { console.log(bad ? `\n${bad} book(s) differ from the existing exports.` : '\nAll rendered pages match the existing exports.'); if (bad) process.exitCode = 1; }
  void readdirSync;
}
main().catch(e => { console.error(e); process.exit(1); });
