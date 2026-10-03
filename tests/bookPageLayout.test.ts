import test from 'node:test';
import assert from 'node:assert/strict';
import { itemsToLines, orderColumns, stripRunningHeads, linesToParas, paginateFlow, figureAfterIndex, looksTextless, type PdfTextItem, type PdfLine } from '../services/bookPageLayout';

const it = (str: string, x: number, y: number, w = str.length * 5, h = 10): PdfTextItem => ({ str, x, y, w, h });
const line = (text: string, y: number, x0 = 72, x1 = 500, h = 10): PdfLine => ({ text, x0, x1, y, h });

test('itemsToLines joins runs on one baseline and splits lines', () => {
  const lines = itemsToLines([it('Hello', 72, 100), it('world', 110, 100.5), it('Next', 72, 114)]);
  assert.deepEqual(lines.map(l => l.text), ['Hello world', 'Next']);
});

test('linesToParas: blank gap starts a paragraph, hyphen is joined, indent after a sentence breaks', () => {
  const lines = [line('The quick brown fox jum-', 100), line('ped over the lazy dog.', 114), line('A new paragraph begins here.', 150), line('Indented start of another.', 164, 90)];
  const ps = linesToParas(lines);
  assert.equal(ps[0].text, 'The quick brown fox jumped over the lazy dog.');
  assert.equal(ps[1].text, 'A new paragraph begins here.');
  assert.equal(ps.length, 3);
});

test('stripRunningHeads removes repeated heads and page numbers but keeps body text', () => {
  const pages = [1, 2, 3, 4].map(n => [line('MY BOOK TITLE', 20), line('Body text on page ' + n, 300), line(String(n), 770)]);
  const out = stripRunningHeads(pages, 792);
  assert.ok(out.every(p => p.length === 1 && p[0].text.startsWith('Body text')));
});

test('orderColumns reads left column then right on a two-column page', () => {
  const lines: PdfLine[] = [];
  for (let i = 0; i < 10; i++) { lines.push(line('L' + i, 100 + i * 12, 60, 280)); lines.push(line('R' + i, 100 + i * 12, 330, 550)); }
  lines.sort((a, b) => a.y - b.y);
  const ordered = orderColumns(lines, 612).map(l => l.text);
  assert.deepEqual(ordered.slice(0, 10), Array.from({ length: 10 }, (_, i) => 'L' + i));
  assert.equal(ordered[10], 'R0');
});

test('orderColumns leaves a single-column page alone', () => {
  const lines = Array.from({ length: 20 }, (_, i) => line('line ' + i, 100 + i * 12, 72, 540));
  assert.deepEqual(orderColumns(lines, 612), lines);
});

test('paginateFlow keeps a figure with the paragraph before it and splits on the word budget', () => {
  const para = (n: number) => ({ kind: 'p' as const, text: Array(n).fill('word').join(' ') });
  const pages = paginateFlow([para(200), { kind: 'fig', src: 'u', alt: 'a' }, para(200), para(50)], { words: 330 });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].figures[0].afterPara, 0);
  assert.equal(pages[1].paras.length, 2);
});

test('paginateFlow gives one huge paragraph its own page and tolerates a leading figure', () => {
  const pages = paginateFlow([{ kind: 'fig', src: 'u', alt: 'a' }, { kind: 'p', text: Array(900).fill('w').join(' ') }, { kind: 'p', text: 'after' }]);
  assert.equal(pages[0].figures[0].afterPara, -1);
  assert.equal(pages.length, 2);
});

test('figureAfterIndex and looksTextless', () => {
  assert.equal(figureAfterIndex([10, 80, 200], 120), 1);
  assert.equal(figureAfterIndex([50, 80], 20), -1);
  assert.equal(looksTextless([{ paras: [] }, { paras: ['x'] }]), true);
  assert.equal(looksTextless([{ paras: ['a'.repeat(400)] }]), false);
});

test('itemsToLines splits a column gutter into separate lines that orderColumns can read in order', () => {
  const items: PdfTextItem[] = [];
  for (let i = 0; i < 10; i++) { items.push(it('left ' + i, 60, 100 + i * 12, 200)); items.push(it('right ' + i, 330, 100 + i * 12, 200)); }
  const lines = itemsToLines(items);
  assert.equal(lines.length, 20);
  const ordered = orderColumns(lines, 612).map(l => l.text);
  assert.equal(ordered[0], 'left 0'); assert.equal(ordered[9], 'left 9'); assert.equal(ordered[10], 'right 0');
});
