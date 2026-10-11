// Text model — pure edit ops, style resolution, Tela/HTML conversion, WOFF unwrapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { zlibSync } from 'fflate';
import {
  createStory, insertText, deleteRange, splitParagraph, mergeParagraphs, applyCharAttrs, setParaAttrs, applyOp, sliceStory, insertFragment,
  paragraphText, storyText, defaultStyleSheet, resolveParagraph, resolveRun, fromTelaBlocks, toTelaBlocks, fromVectorText, htmlToStory, storyToHtml,
  woffToSfnt, sniffFontFormat, TextEngine, type TextStory,
} from '../services/text';

const ids = (s: TextStory) => s.paragraphs.map(p => p.id);

test('insertText / splitParagraph / mergeParagraphs / deleteRange keep ids stable', () => {
  let s = createStory(['Hello world', 'Second']);
  const [p1, p2] = ids(s);
  let r = insertText(s, { paragraphId: p1, offset: 5 }, ',');
  assert.equal(paragraphText(r.story.paragraphs[0]), 'Hello, world');
  assert.deepEqual(r.caret, { paragraphId: p1, offset: 6 });
  r = insertText(r.story, { paragraphId: p1, offset: 6 }, ' big\nnew');
  assert.equal(r.story.paragraphs.length, 3);
  assert.equal(paragraphText(r.story.paragraphs[1]), 'new world');
  assert.equal(r.story.paragraphs[0].id, p1);
  s = r.story;
  r = mergeParagraphs(s, p1);
  assert.equal(paragraphText(r.story.paragraphs[0]), 'Hello, bignew world');
  r = deleteRange(r.story, { anchor: { paragraphId: p1, offset: 6 }, focus: { paragraphId: p2, offset: 3 } });
  assert.equal(storyText(r.story), 'Hello,ond');
  const sp = splitParagraph(r.story, { paragraphId: p1, offset: 6 }, 'fixed-id');
  assert.deepEqual(ids(sp.story), [p1, 'fixed-id']);
});

test('applyCharAttrs splits and re-merges runs; undefined clears', () => {
  const s = createStory(['abcdef']);
  const p = s.paragraphs[0].id;
  const bold = applyCharAttrs(s, { anchor: { paragraphId: p, offset: 2 }, focus: { paragraphId: p, offset: 4 } }, { fontWeight: 700 });
  assert.deepEqual(bold.paragraphs[0].runs.map(r => r.text), ['ab', 'cd', 'ef']);
  const unbold = applyCharAttrs(bold, { anchor: { paragraphId: p, offset: 0 }, focus: { paragraphId: p, offset: 6 } }, { fontWeight: undefined });
  assert.deepEqual(unbold.paragraphs[0].runs.map(r => r.text), ['abcdef']);
  const para = setParaAttrs(s, [p], { align: 'justify' });
  assert.equal(para.paragraphs[0].attrs?.align, 'justify');
});

test('ops are serialisable and replay identically', () => {
  const s = createStory(['one two']);
  const p = s.paragraphs[0].id;
  const ops = [
    { type: 'insertText', at: { paragraphId: p, offset: 3 }, text: ' and', newIds: [] },
    { type: 'splitParagraph', at: { paragraphId: p, offset: 7 }, newId: 'q' },
    { type: 'applyCharAttrs', range: { anchor: { paragraphId: 'q', offset: 0 }, focus: { paragraphId: 'q', offset: 4 } }, patch: { fontStyle: 'italic' } },
  ] as const;
  let a = s;
  for (const op of ops) a = applyOp(a, JSON.parse(JSON.stringify(op))).story;
  assert.equal(storyText(a), 'one and\n two');
  assert.equal(a.paragraphs[1].runs[0].attrs?.fontStyle, 'italic');
});

test('slice + insertFragment (copy/paste across paragraphs)', () => {
  const s = createStory(['alpha beta', 'gamma delta']);
  const [a, b] = ids(s);
  const frag = sliceStory(s, { anchor: { paragraphId: a, offset: 6 }, focus: { paragraphId: b, offset: 5 } });
  assert.equal(storyText(frag), 'beta\ngamma');
  const r = insertFragment(s, { paragraphId: b, offset: 11 }, frag);
  assert.equal(storyText(r.story), 'alpha beta\ngamma deltabeta\ngamma');
});

test('style resolution: basedOn chain, character styles, local overrides', () => {
  const sheet = defaultStyleSheet();
  const s = createStory([{ styleId: 'h2', runs: [{ text: 'x', styleId: 'emphasis', attrs: { color: '#f00' } }] }]);
  const rp = resolveParagraph(sheet, s.paragraphs[0]);
  assert.equal(rp.char.fontSize, 23);
  assert.equal(rp.char.fontFamily, 'Inter', 'inherited from body');
  assert.equal(rp.para.keepWithNext, true);
  const rc = resolveRun(sheet, rp.char, s.paragraphs[0].runs[0]);
  assert.equal(rc.fontStyle, 'italic');
  assert.equal(rc.color, '#f00');
  assert.equal(rc.fontWeight, 650);
});

test('Tela Writer blocks and vector text convert both ways', () => {
  const blocks = [
    { id: 'b1', kind: 'h1' as const, text: 'Title &amp; <em>more</em>' },
    { id: 'b2', kind: 'p' as const, text: 'Some <strong>bold</strong> and <code>code</code><br>next line' },
    { id: 'b3', kind: 'li' as const, text: 'item' },
  ];
  const s = fromTelaBlocks(blocks);
  assert.deepEqual(ids(s), ['b1', 'b2', 'b3']);
  assert.equal(paragraphText(s.paragraphs[0]), 'Title & more');
  assert.equal(s.paragraphs[1].runs.find(r => r.text === 'bold')?.attrs?.fontWeight, 700);
  assert.ok(paragraphText(s.paragraphs[1]).includes(String.fromCharCode(0x2028)));
  const back = toTelaBlocks(s, blocks);
  assert.equal(back[1].text, 'Some <strong>bold</strong> and <code>code</code><br>next line');
  assert.equal(back[2].kind, 'li');
  const v = fromVectorText({ text: 'BIG\nsmall', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 40, textAlign: 'center', letterSpacing: 0.05, textTransform: 'uppercase' });
  assert.equal(v.paragraphs.length, 2);
  assert.equal(v.paragraphs[0].runs[0].attrs?.fontFamily, 'Playfair Display');
  assert.equal(v.paragraphs[0].runs[0].attrs?.tracking, 50);
  assert.equal(v.paragraphs[0].runs[0].attrs?.caps, 'all-caps');
});

test('clipboard HTML round trip', () => {
  const s = htmlToStory('<h2>Head</h2><p>A <b>bold</b> <a href="https://x.y">link</a> and <span style="color:red;font-style:italic">red</span></p><ul><li>one</li><li>two</li></ul>');
  assert.equal(s.paragraphs.length, 4);
  assert.equal(s.paragraphs[0].styleId, 'h2');
  assert.equal(s.paragraphs[2].styleId, 'list');
  const red = s.paragraphs[1].runs.find(r => r.text === 'red')!;
  assert.equal(red.attrs?.color, 'red');
  assert.equal(red.attrs?.fontStyle, 'italic');
  const html = storyToHtml(s);
  assert.ok(html.includes('<ul>') && html.includes('<strong>bold</strong>') && html.includes('href="https://x.y"'));
});

test('WOFF 1.0 unwraps to an sfnt the engine loads', async () => {
  const ttfPath = new URL('../.cache/text-fonts/Inter[opsz,wght].ttf', import.meta.url);
  if (!existsSync(ttfPath)) return; // filled by textEngine.test.ts
  const ttf = new Uint8Array(readFileSync(ttfPath));
  // Build a WOFF from the TTF (zlib per table).
  const dv = new DataView(ttf.buffer, ttf.byteOffset);
  const n = dv.getUint16(4);
  const tables = Array.from({ length: n }, (_, i) => ({ tag: dv.getUint32(12 + i * 16), sum: dv.getUint32(16 + i * 16), off: dv.getUint32(20 + i * 16), len: dv.getUint32(24 + i * 16) }));
  const comp = tables.map(t => { const raw = ttf.subarray(t.off, t.off + t.len); const z = zlibSync(raw); return z.length < raw.length ? z : raw; });
  let size = 44 + n * 20;
  const offs = comp.map(c => { const o = size; size += (c.length + 3) & ~3; return o; });
  const woff = new Uint8Array(size);
  const wv = new DataView(woff.buffer);
  wv.setUint32(0, 0x774F4646); wv.setUint32(4, dv.getUint32(0)); wv.setUint32(8, size); wv.setUint16(12, n);
  tables.forEach((t, i) => { const o = 44 + i * 20; wv.setUint32(o, t.tag); wv.setUint32(o + 4, offs[i]); wv.setUint32(o + 8, comp[i].length); wv.setUint32(o + 12, t.len); wv.setUint32(o + 16, t.sum); woff.set(comp[i], offs[i]); });
  assert.equal(sniffFontFormat(woff), 'woff');
  const sfnt = woffToSfnt(woff);
  const engine = await TextEngine.create();
  const blob = engine.loadFont(sfnt);
  assert.equal(engine.fontInfo(blob).family, 'Inter');
});
