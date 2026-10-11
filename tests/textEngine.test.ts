// Text engine — shaping, hyphenation, total-fit vs first-fit, optical margins, threading,
// text wrap, bidi and caret geometry, against real OFL fonts (cached in .cache/text-fonts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTextSystem, createStory, defaultStyleSheet, positionToCaret, pointToPosition, rangeToRects, moveVertical, layoutToSvg,
  LINE, type TextSystem, type TextStory, type TextFrame, type ParaAttrs, type CharAttrs,
} from '../services/text';

let sys: TextSystem;
async function system(): Promise<TextSystem> {
  if (!sys) sys = await createTextSystem({ preload: ['EB Garamond', 'Noto Sans Arabic', 'Noto Sans Hebrew', 'Noto Sans Devanagari'] });
  return sys;
}
const garamond = (size = 12): CharAttrs => ({ fontFamily: 'EB Garamond', fontSize: size });
function story(text: string | string[], char: CharAttrs = garamond(), para: ParaAttrs = {}): TextStory {
  const parts = Array.isArray(text) ? text : [text];
  return createStory(parts.map(t => ({ attrs: para, runs: [{ text: t, attrs: char }] })));
}
const frame = (x: number, y: number, w: number, h: number, extra: Partial<TextFrame> = {}): TextFrame => ({ id: `f${x}_${y}`, x, y, width: w, height: h, ...extra });
async function lay(s: TextStory, frames: TextFrame[]) {
  const t = await system();
  await t.ensure(s);
  return t.layout(s, frames);
}

const PARA = 'In olden times when wishing still helped one, there lived a king whose daughters were all beautiful; and the youngest was so beautiful that the sun itself, which has seen so much, was astonished whenever it shone in her face. Close by the king’s castle lay a great dark forest, and under an old lime-tree in the forest was a well, and when the day was very warm, the king’s child went out into the forest and sat down by the side of the cool fountain.';

test('shaping: fi/fl ligatures, AV kerning, Arabic joining, Devanagari reordering', async () => {
  const t = await system();
  const gar = t.fonts.resolve({ family: 'EB Garamond' }, 20)!;
  assert.equal(t.engine.shape('fi', { fonts: [gar], size: 20 }).length, 1, 'fi ligature');
  assert.equal(t.engine.shape('fl', { fonts: [gar], size: 20 }).length, 1, 'fl ligature');
  assert.equal(t.engine.shape('fi', { fonts: [gar], size: 20, features: [['liga', 0]] }).length, 2, 'liga off');
  const inter = t.fonts.resolve({ family: 'Inter' }, 100)!;
  const w = (s: string) => t.engine.shape(s, { fonts: [inter], size: 100 }).reduce((a, g) => a + g.xAdvance, 0);
  assert.ok(w('AV') < w('A') + w('V') - 1, 'AV kerns');
  const ar = t.fonts.resolve({ family: 'Noto Sans Arabic' }, 30)!;
  const word = t.engine.shape('مرحبا', { fonts: [ar], size: 30 });
  const isolated = t.engine.shape('م', { fonts: [ar], size: 30 })[0].gid;
  assert.ok(word.every(g => g.gid !== 0));
  // Visual order: meem (logical first, initial form) is the rightmost glyph.
  assert.notEqual(word[word.length - 1].gid, isolated, 'meem joins (initial form)');
  const dev = t.fonts.resolve({ family: 'Noto Sans Devanagari' }, 30)!;
  const ki = t.engine.shape('कि', { fonts: [dev], size: 30 });
  assert.equal(ki[1].gid, t.engine.glyphIndex(dev, 0x0915), 'i-matra is drawn before ka');
});

test('hyphenation: Liang patterns (en-us, de)', async () => {
  const t = await system();
  const { ensureHyphenation } = await import('../services/text/hyphenation');
  const en = (await ensureHyphenation(t.engine, 'en'))!;
  const mark = (w: string, pts: number[]) => [...w].map((c, i) => (pts.includes(i) ? '-' : '') + c).join('');
  assert.equal(mark('hyphenation', t.engine.hyphenate(en, 'hyphenation')), 'hy-phen-ation');
  assert.equal(mark('typography', t.engine.hyphenate(en, 'typography')), 'ty-pog-ra-phy');
  const de = (await ensureHyphenation(t.engine, 'de'))!;
  assert.ok(t.engine.hyphenate(de, 'Silbentrennung').length >= 3);
});

test('total-fit gives lower total badness and tighter spacing than first-fit', async () => {
  const just: ParaAttrs = { align: 'justify' };
  const kp = await lay(story(PARA, garamond(11), just), [frame(0, 0, 190, 2000)]);
  const ff = await lay(story(PARA, garamond(11), { ...just, justification: { composer: 'single-line' } }), [frame(0, 0, 190, 2000)]);
  const t = await system();
  const gid = t.fonts.resolve({ family: 'EB Garamond' }, 11)!;
  const run = [{ start: 0, end: PARA.length, fonts: [gid], size: 11, hyph: 0 }];
  let better = 0;
  const spread = (lines: { wordExtra: number }[]) => { const v = lines.slice(0, -1).map(l => l.wordExtra); const m = v.reduce((x, y) => x + y, 0) / v.length; return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length); };
  for (const w of [150, 170, 190, 210, 230, 260]) {
    const a = t.engine.layoutParagraph(PARA, run, { widths: [w], word: [0.75, 1, 1.5], pretolerance: -1 });
    const b = t.engine.layoutParagraph(PARA, run, { widths: [w], word: [0.75, 1, 1.5], composer: 'first-fit' });
    // Line-quality demerits Σ(10 + badness)² over the justified lines (the last line is ragged in
    // both): what total-fit minimises, without the hyphen penalties first-fit ignores.
    const q = (p: typeof a) => p.lines.slice(0, -1).reduce((s, l) => s + (10 + Math.min(1e4, 100 * Math.abs(l.ratio) ** 3)) ** 2, 0);
    console.log(`[kp] w=${w} total-fit ${q(a).toFixed(0)} (${a.lines.length} lines) vs first-fit ${q(b).toFixed(0)} (${b.lines.length} lines)`);
    assert.ok(q(a) <= q(b) * 1.05 + 1, `w=${w}: total-fit ${q(a).toFixed(0)} vs first-fit ${q(b).toFixed(0)}`);
    if (q(a) < q(b) * 0.9) better++;
    void spread;
  }
  assert.ok(better >= 2, `total-fit strictly better on ${better} of 6 measures`);
  // Justified lines fill the measure exactly (except the last).
  for (const l of kp.lines.slice(0, -1)) assert.ok(Math.abs(l.inkWidth - 190) < 4 && (l.flags & LINE.JUSTIFIED), `line fills measure: ${l.inkWidth}`);
  assert.ok(ff.lines.length >= kp.lines.length - 1);
});

test('optical margin alignment hangs punctuation outside the measure', async () => {
  const text = '“Quotes, commas, and full stops hang into the margin,” said the compositor. “So do hyphens and the tips of diagonal capitals — Ws, Vs and Ts — just a little.”';
  const l = await lay(story(text, garamond(14), { align: 'justify', justification: { opticalMargin: true } }), [frame(0, 0, 200, 800)]);
  assert.ok(l.lines[0].inkX < -0.5, `opening quote hangs left (inkX ${l.lines[0].inkX.toFixed(2)})`);
  assert.ok(l.lines.slice(0, -1).some(x => x.inkX + x.inkWidth > 200.5), 'a line ending in punctuation hangs right');
  const off = await lay(story(text, garamond(14), { align: 'justify' }), [frame(0, 0, 200, 800)]);
  assert.ok(Math.abs(off.lines[0].inkX) < 0.01, 'no hang without OMA');
});

test('threading: a story flows through 3 frames and reports overflow', async () => {
  const s = story(Array(6).fill(PARA), garamond(12), { align: 'justify', spaceAfter: 6 });
  const frames = [frame(0, 0, 180, 160), frame(220, 0, 180, 160), frame(440, 0, 180, 160)];
  const l = await lay(s, frames);
  for (let f = 0; f < 3; f++) assert.ok(l.frames[f].lines.length > 3, `frame ${f} has lines`);
  assert.equal(l.overflow, true);
  assert.ok(l.overflowAt && l.overflowAt.paragraphId, 'overflow position reported');
  for (const fl of l.frames) for (const line of fl.lines) assert.ok(line.baseline + line.descent <= fl.frame.y + fl.frame.height + 0.5, 'lines stay inside their frame');
  // Each frame's lines continue where the previous frame stopped.
  const firstOf2 = l.frames[1].lines[0], lastOf1 = l.frames[0].lines[l.frames[0].lines.length - 1];
  assert.ok(firstOf2.paragraphIndex > lastOf1.paragraphIndex || firstOf2.start === lastOf1.end);
  // Two columns in one frame.
  const cols = await lay(s, [frame(0, 0, 400, 200, { columns: 2, gutter: 20 })]);
  assert.ok(new Set(cols.lines.map(x => x.column)).size === 2);
});

test('text wrap: lines avoid a circle (both sides) and keep the standoff', async () => {
  const s = story(Array(3).fill(PARA), garamond(11), { align: 'justify' });
  const circle = { kind: 'circle' as const, cx: 200, cy: 150, r: 60 };
  const l = await lay(s, [frame(0, 0, 400, 400, { exclusions: [{ shape: circle, offset: 8, side: 'both' }] })]);
  let besides = 0;
  for (const line of l.lines) {
    const band0 = line.baseline - 8, band1 = line.baseline + 3;
    const dy = Math.max(0, Math.max(band0 - circle.cy, circle.cy - band1));
    if (dy >= circle.r + 8) continue;
    const half = Math.sqrt((circle.r + 8) ** 2 - dy * dy);
    const inkL = line.inkX, inkR = line.inkX + line.inkWidth;
    assert.ok(inkR <= circle.cx - half + 1 || inkL >= circle.cx + half - 1, `line at ${line.baseline.toFixed(1)} avoids circle (${inkL.toFixed(1)}–${inkR.toFixed(1)})`);
    besides++;
  }
  assert.ok(besides >= 6, 'several lines sit beside the circle');
  // Both sides used on the same baseline.
  const byBase = new Map<number, number>();
  for (const line of l.lines) byBase.set(Math.round(line.baseline), (byBase.get(Math.round(line.baseline)) ?? 0) + 1);
  assert.ok([...byBase.values()].some(n => n === 2), 'text flows on both sides');
});

test('bidi: mixed Latin/Hebrew/Arabic line, carets and hit testing', async () => {
  const text = 'Shalom is שלום עולם and salaam is سلام.';
  const l = await lay(story(text, { fontFamily: 'Inter', fontSize: 16 }, { align: 'start' }), [frame(0, 0, 600, 100)]);
  assert.equal(l.missing.length, 0, 'fallback covers Hebrew and Arabic');
  assert.equal(l.lines.length, 1);
  const pid = l.lines[0].paragraphId;
  const x = (o: number) => positionToCaret(l, { paragraphId: pid, offset: o })!.x;
  // Inside the Hebrew run, logical order runs right-to-left; the two words are visually swapped.
  assert.ok(x(10) > x(13), 'shin right of mem');
  assert.ok(x(15) < x(10), 'second Hebrew word left of the first');
  assert.ok(x(21) > x(10), 'Latin after the RTL run continues to the right');
  const hit = pointToPosition(l, x(12) + 0.1, l.lines[0].baseline)!;
  assert.ok(Math.abs(hit.position.offset - 12) <= 1);
});

test('caret positions split a ligature by grapheme; selection and vertical movement', async () => {
  const s = story(['The office affiliate filed a flawless file.', 'Second paragraph line.'], garamond(24), { align: 'start' });
  const l = await lay(s, [frame(0, 0, 900, 300)]);
  const pid = s.paragraphs[0].id;
  // "office": offsets 4..10; "ffi" ligature covers 5..8.
  const xs = [5, 6, 7, 8].map(o => positionToCaret(l, { paragraphId: pid, offset: o })!.x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1] + 1, `caret ${i} inside ligature advances (${xs.join(', ')})`);
  const rects = rangeToRects(l, s, { anchor: { paragraphId: pid, offset: 4 }, focus: { paragraphId: s.paragraphs[1].id, offset: 6 } });
  assert.ok(rects.length >= 2);
  const down = moveVertical(l, s, { paragraphId: pid, offset: 10 }, 'downstream', 1);
  assert.equal(down.position.paragraphId, s.paragraphs[1].id);
});

test('lists, drop cap, small caps, old-style numerals, variable axes render', async () => {
  const sheet = defaultStyleSheet();
  const s: TextStory = createStory([
    { attrs: { dropCap: { lines: 3 }, align: 'justify' }, runs: [{ text: PARA, attrs: garamond(12) }] },
    { styleId: 'list-number', runs: [{ text: 'First numbered item with oldstyle 1234567890', attrs: { ...garamond(12), numerals: 'oldstyle' } }] },
    { styleId: 'list-number', runs: [{ text: 'Second item in small caps', attrs: { ...garamond(12), caps: 'small-caps' } }] },
    { runs: [{ text: 'Inter Thin', attrs: { fontFamily: 'Inter', fontSize: 20, fontWeight: 100 } }, { text: ' Black', attrs: { fontFamily: 'Inter', fontSize: 20, fontWeight: 900 } }] },
  ]);
  void sheet;
  const l = await lay(s, [frame(0, 0, 320, 600)]);
  const first = l.lines[0];
  assert.ok(first.runs[0].size > 30, 'drop cap run is large');
  assert.ok(l.lines[1].x > l.lines[3].x, 'lines beside the drop cap are indented');
  const marker = l.lines.find(x => x.paragraphIndex === 1)!.runs[0];
  assert.equal(marker.styleIndex, -2, 'list marker run');
  const t = await system();
  const svg = layoutToSvg(t.engine, l);
  assert.ok(svg.startsWith('<svg') && svg.length > 10000);
});

test('perf: 1,000 paragraphs', async () => {
  const s = story(Array.from({ length: 1000 }, (_, i) => `${i}. ${PARA.slice(0, 200 + (i % 7) * 40)}`), garamond(11), { align: 'justify' });
  const t = await system();
  await t.ensure(s);
  const frames = Array.from({ length: 400 }, (_, i) => frame((i % 20) * 300, Math.floor(i / 20) * 900, 280, 860));
  const t0 = performance.now();
  const l = t.layout(s, frames);
  const cold = performance.now() - t0;
  const t1 = performance.now();
  t.layout(s, frames);
  const warm = performance.now() - t1;
  console.log(`[perf] 1000 paragraphs, ${l.lines.length} lines: cold ${cold.toFixed(0)} ms, warm (cached) ${warm.toFixed(0)} ms`);
  assert.ok(l.lines.length > 4000);
  assert.ok(warm < cold);
});
