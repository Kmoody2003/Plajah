// textProof — a typographic specimen rendered entirely by the platform text engine
// (rust/plajah-text via services/text), written to .tela-proofs/text-proof.{html,png}.
//
//   npx tsx scripts/textProof.ts            (fonts download once into .cache/text-fonts)
//
// Panels: total-fit vs first-fit justification, optical margins, OpenType features, variable
// axes, complex scripts (Arabic, Hebrew, Devanagari), and a threaded three-column story with a
// drop cap and a contour wrap around a circle. Every glyph is an outline path from the engine.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTextSystem, createStory, layoutToSvgMarkup, type CharAttrs, type ParaAttrs, type TextFrame, type TextStory, type StoryLayout, type TextSystem,
} from '../services/text';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.tela-proofs');

const BODY = 'Typography exists to honor content. Like oratory, music, dance, calligraphy — like anything that lends its grace to language — typography is an art that can be deliberately misused. It is a craft by which the meanings of a text (or its absence of meaning) can be clarified, honored and shared, or knowingly disguised. In a world rife with unsolicited messages, typography must often draw attention to itself before it will be read. Yet in order to be read, it must relinquish the attention it has drawn.';
const STORY = [
  'Composition is the art of setting a paragraph as a whole rather than line by line. The total-fit algorithm of Knuth and Plass considers every feasible set of breakpoints at once and chooses the one with the fewest demerits — loose and tight lines, hyphens, and abrupt changes of rhythm from one line to the next all carry a cost.',
  'Where a single-line composer must commit to each line as it goes, a paragraph composer can borrow space from a later line to rescue an earlier one. The result is an even texture of words and spaces, with fewer rivers running down the column and fewer hyphens stacked at its edge.',
  'Optical margin alignment finishes the job. Punctuation and the diagonals of capitals hang a little outside the measure, so that the edge of the column looks straight to the eye rather than to the ruler. Quotation marks, hyphens, full stops and commas are the usual offenders: mostly white, they make a line appear indented when they sit flush.',
  'Text wrap sends the lines around an illustration. With room on both sides, the composer reads the left fragment first and then the right, each with its own measure, and still balances the paragraph as a whole. Threaded frames carry the story on from column to column and from frame to frame; widow and orphan control keeps stray lines from being stranded at the top or bottom of a column.',
  'Every glyph you see here is an outline drawn from the font’s own data by the engine, positioned by the same composer in the browser, in node, and in the exported file — so a page looks the same wherever it is opened.',
];

type Panel = { title: string; note: string; svg: string; w: number; h: number };

function panelSvg(t: TextSystem, layout: StoryLayout, w: number, h: number, extra = '', guides = false): string {
  const g = guides ? layout.frames.map(f => `<line x1="${f.frame.x}" x2="${f.frame.x}" y1="${f.frame.y}" y2="${f.frame.y + f.frame.height}" stroke="#d33" stroke-width="0.4"/><line x1="${f.frame.x + f.frame.width}" x2="${f.frame.x + f.frame.width}" y1="${f.frame.y}" y2="${f.frame.y + f.frame.height}" stroke="#d33" stroke-width="0.4"/>`).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${g}${extra}${layoutToSvgMarkup(t.engine, layout)}</svg>`;
}

function para(text: string | string[], char: CharAttrs, attrs: ParaAttrs = {}): TextStory {
  return createStory((Array.isArray(text) ? text : [text]).map(x => ({ attrs, runs: [{ text: x, attrs: char }] })));
}

async function main() {
  const t = await createTextSystem({ preload: ['EB Garamond', 'Inter', 'Fraunces', 'Noto Sans Arabic', 'Noto Naskh Arabic', 'Noto Sans Hebrew', 'Noto Sans Devanagari', 'Playfair Display'] });
  const panels: Panel[] = [];
  const garamond = (size: number, extra: CharAttrs = {}): CharAttrs => ({ fontFamily: 'EB Garamond', fontSize: size, color: '#1b1b1b', ...extra });
  const L = async (s: TextStory, frames: TextFrame[]) => { await t.ensure(s); return t.layout(s, frames); };

  // 1 — total-fit vs first-fit.
  {
    const W = 250;
    const kp = await L(para(BODY, garamond(12.5), { align: 'justify', leading: { kind: 'fixed', value: 16 } }), [{ id: 'k', x: 10, y: 10, width: W, height: 400 }]);
    const ff = await L(para(BODY, garamond(12.5), { align: 'justify', leading: { kind: 'fixed', value: 16 }, justification: { composer: 'single-line' } }), [{ id: 'f', x: 30 + W, y: 10, width: W, height: 400 }]);
    const h = Math.max(...kp.lines.map(l => l.bottom), ...ff.lines.map(l => l.bottom)) + 14;
    const loose = (l: StoryLayout) => l.lines.slice(0, -1).filter(x => x.flags & 8).map(x => (x.inkWidth > 0 ? x : x)).length;
    const words = (l: StoryLayout) => l.lines.slice(0, -1).map(x => x.runs.reduce((n, r) => n + r.glyphs.length, 0));
    void words; void loose;
    const merged = { ...kp, frames: [...kp.frames, ...ff.frames], lines: [...kp.lines, ...ff.lines] };
    const label = `<text x="10" y="${h - 2}" font-family="system-ui" font-size="8" fill="#888">paragraph composer (Knuth–Plass total fit)</text><text x="${30 + W}" y="${h - 2}" font-family="system-ui" font-size="8" fill="#888">single-line composer (first fit)</text>`;
    panels.push({ title: 'Justification: total-fit vs first-fit', note: 'Same text, font, measure and spacing limits (80/100/133%), US English hyphenation. The red rules are the measure.', svg: panelSvg(t, merged as StoryLayout, 2 * W + 40, h + 6, label, true), w: 2 * W + 40, h: h + 6 });
  }
  // 2 — optical margins.
  {
    const W = 230;
    const txt = '“Hanging punctuation,” said the compositor, “is not decoration — it is correction.” Quotes, commas, full stops and hyphens are mostly white space; set flush, they make the edge look ragged. Vowels, Ws, Vs and Ts, too.';
    const off = await L(para(txt, garamond(14), { align: 'justify' }), [{ id: 'a', x: 14, y: 10, width: W, height: 300 }]);
    const on = await L(para(txt, garamond(14), { align: 'justify', justification: { opticalMargin: true } }), [{ id: 'b', x: 44 + W, y: 10, width: W, height: 300 }]);
    const h = Math.max(...off.lines.map(l => l.bottom), ...on.lines.map(l => l.bottom)) + 14;
    const merged = { ...off, frames: [...off.frames, ...on.frames], lines: [...off.lines, ...on.lines] };
    const label = `<text x="14" y="${h - 2}" font-family="system-ui" font-size="8" fill="#888">flush (OMA off)</text><text x="${44 + W}" y="${h - 2}" font-family="system-ui" font-size="8" fill="#888">optical margin alignment</text>`;
    panels.push({ title: 'Optical margin alignment', note: 'Protrusion per glyph (microtype-style table): punctuation hangs outside the red rules so the column edge reads straight.', svg: panelSvg(t, merged as StoryLayout, 2 * W + 60, h + 6, label, true), w: 2 * W + 60, h: h + 6 });
  }
  // 3 — OpenType features + variable axes.
  {
    const s = createStory([
      { attrs: { align: 'start', spaceAfter: 6 }, runs: [{ text: 'Small Caps: ', attrs: garamond(18) }, { text: 'Knuth and Plass, 1981', attrs: garamond(18, { caps: 'small-caps' }) }, { text: '  ·  All small caps: ', attrs: garamond(18) }, { text: 'NASA UNESCO', attrs: garamond(18, { caps: 'all-small-caps' }) }] },
      { attrs: { align: 'start', spaceAfter: 6 }, runs: [{ text: 'Old-style 1234567890 ', attrs: garamond(18, { numerals: 'oldstyle' }) }, { text: '· Lining 1234567890 ', attrs: garamond(18, { numerals: 'lining' }) }, { text: '· ffi ffl fj Th ', attrs: garamond(18) }, { text: '· 3/4 1/2', attrs: garamond(18, { features: { frac: 1 } }) }] },
      { attrs: { align: 'start', spaceAfter: 6 }, runs: [{ text: 'Discretionary: ', attrs: garamond(18) }, { text: 'ct st sp Qu', attrs: garamond(18, { ligatures: 'historical' }) }, { text: '  ·  Swash: ', attrs: garamond(18) }, { text: 'Rejoice Quietly', attrs: garamond(18, { fontStyle: 'italic', features: { swsh: 1 } }) }, { text: '  ·  x', attrs: garamond(18) }, { text: '2', attrs: garamond(18, { position: 'super' }) }, { text: ' H', attrs: garamond(18) }, { text: '2', attrs: garamond(18, { position: 'sub' }) }, { text: 'O', attrs: garamond(18) }] },
      { attrs: { align: 'start', spaceAfter: 4 }, runs: [100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => ({ text: `Inter ${w}  `, attrs: { fontFamily: 'Inter', fontSize: 15, fontWeight: w, color: '#222' } })) },
      { attrs: { align: 'start', spaceAfter: 4 }, runs: [9, 24, 72, 144].map(o => ({ text: `opsz ${o} `, attrs: { fontFamily: 'Fraunces', fontSize: 22, fontWeight: 400, opticalSize: o, color: '#222' } })) },
      { attrs: { align: 'start' }, runs: [0, 50, 100].map(v => ({ text: `Fraunces SOFT ${v} WONK  `, attrs: { fontFamily: 'Fraunces', fontSize: 22, fontWeight: 800, fontStyle: 'italic', axes: { SOFT: v, WONK: 1 }, color: '#7a2e14' } })) },
    ]);
    const l = await L(s, [{ id: 'o', x: 14, y: 8, width: 760, height: 400 }]);
    const h = l.lines[l.lines.length - 1].bottom + 10;
    panels.push({ title: 'OpenType features & variable axes', note: 'smcp / c2sc (native), onum / lnum, liga, dlig+hlig, swsh, frac, synthesized super/subscript; Inter wght 100–900 and Fraunces opsz / SOFT / WONK instances.', svg: panelSvg(t, l, 790, h), w: 790, h });
  }
  // 4 — complex scripts.
  {
    const s = createStory([
      { attrs: { align: 'start', spaceAfter: 8 }, runs: [{ text: 'Arabic (Naskh): ', attrs: garamond(16) }, { text: 'اَلْخَطُّ هَنْدَسَةٌ رُوحَانِيَّةٌ ظَهَرَتْ بِآلَةٍ جَسَدَانِيَّةٍ', attrs: { fontFamily: 'Noto Naskh Arabic', fontSize: 22, language: 'ar' } }] },
      { attrs: { align: 'start', spaceAfter: 8 }, runs: [{ text: 'Hebrew: ', attrs: garamond(16) }, { text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ', attrs: { fontFamily: 'Noto Sans Hebrew', fontSize: 20, language: 'he' } }, { text: ' — mixed with English and 2026.', attrs: garamond(16) }] },
      { attrs: { align: 'start', spaceAfter: 8 }, runs: [{ text: 'Devanagari: ', attrs: garamond(16) }, { text: 'क्षत्रिय श्रीमान् द्विज हिन्दी पत्रिका प्रकाशित', attrs: { fontFamily: 'Noto Sans Devanagari', fontSize: 20, language: 'hi' } }] },
      { attrs: { align: 'start', direction: 'rtl' }, runs: [{ text: 'פסקה מימין לשמאל עם מילה English באמצע ומספר 123.', attrs: { fontFamily: 'Noto Sans Hebrew', fontSize: 18, language: 'he' } }] },
    ]);
    const l = await L(s, [{ id: 'c', x: 14, y: 8, width: 760, height: 300 }]);
    const h = l.lines[l.lines.length - 1].bottom + 10;
    panels.push({ title: 'Complex scripts & bidi', note: 'Arabic joining and marks, Hebrew niqqud, Devanagari conjuncts and reordering, mixed-direction lines, an RTL paragraph (right-aligned start).', svg: panelSvg(t, l, 790, h), w: 790, h });
  }
  // 5 — threaded story with wrap and drop cap.
  {
    const s: TextStory = createStory([
      { attrs: { align: 'start', spaceAfter: 8, hyphenation: { enabled: false } }, runs: [{ text: 'The Paragraph Composer', attrs: { fontFamily: 'Playfair Display', fontSize: 26, fontWeight: 700, color: '#2a1d14' } }] },
      ...STORY.map((x, i) => ({ attrs: { align: 'justify' as const, indentFirst: i === 0 ? 0 : 14, dropCap: i === 0 ? { lines: 3 } : undefined, justification: { opticalMargin: true } }, runs: [{ text: x, attrs: garamond(11.5) }] })),
      ...STORY.slice(0, 3).map(x => ({ attrs: { align: 'justify' as const, indentFirst: 14, justification: { opticalMargin: true } }, runs: [{ text: x, attrs: garamond(11.5) }] })),
    ]);
    const circle = { kind: 'circle' as const, cx: 522, cy: 128, r: 62 };
    const wrap = [{ shape: circle, offset: 10, side: 'both' as const }];
    const frames: TextFrame[] = [
      { id: 'A', x: 20, y: 20, width: 240, height: 470 },
      { id: 'B', x: 280, y: 20, width: 490, height: 232, exclusions: wrap },
      { id: 'C', x: 280, y: 268, width: 490, height: 222, columns: 2, gutter: 18 },
    ];
    const l = await L(s, frames);
    const art = `<circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" fill="#e9d8b8"/><circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r * 0.62}" fill="#c98f4a"/><circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r * 0.25}" fill="#7a2e14"/>`;
    const over = l.overflow ? `<text x="755" y="500" font-family="system-ui" font-size="9" fill="#c00" text-anchor="end">overset ⊞</text>` : '';
    panels.push({ title: 'Threaded frames, columns, wrap, drop cap', note: `Three threaded frames (the last with two columns); wrap on both sides of a circle with a 10px standoff; 3-line drop cap; OMA; overflow ${l.overflow ? 'reported' : 'none'}. ${l.lines.length} lines in ${l.stats.ms.toFixed(1)} ms.`, svg: panelSvg(t, l, 790, 510, art + over), w: 790, h: 510 });
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Plajah text engine proof</title><style>
  body{margin:0;background:#efebe4;font:13px/1.4 system-ui,sans-serif;color:#333}
  main{max-width:860px;margin:0 auto;padding:28px}
  h1{font:600 20px system-ui;margin:0 0 4px} .sub{color:#777;margin-bottom:22px}
  section{background:#fffdf8;border-radius:6px;box-shadow:0 1px 3px #0002;margin:0 0 22px;padding:16px 18px}
  h2{font:600 14px system-ui;margin:0 0 2px} p{margin:0 0 10px;color:#777;font-size:12px}
  svg{display:block;max-width:100%;height:auto}
  </style></head><body><main><h1>Plajah text engine — specimen</h1><div class="sub">rust/plajah-text (wasm) · rustybuzz shaping · Knuth–Plass total fit · Liang hyphenation · all glyphs are engine outlines</div>
  ${panels.map(p => `<section><h2>${p.title}</h2><p>${p.note}</p>${p.svg}</section>`).join('\n')}
  </main></body></html>`;
  mkdirSync(outDir, { recursive: true });
  const htmlPath = join(outDir, 'text-proof.html');
  writeFileSync(htmlPath, html);
  console.log(`[textProof] ${htmlPath}`);
  try {
    const puppeteer = (await import('puppeteer')).default;
    const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
    await page.goto('file:///' + htmlPath.split('\\').join('/'));
    await page.screenshot({ path: join(outDir, 'text-proof.png'), fullPage: true });
    await browser.close();
    console.log(`[textProof] ${join(outDir, 'text-proof.png')}`);
  } catch (e) {
    console.warn('[textProof] PNG skipped:', (e as Error).message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
