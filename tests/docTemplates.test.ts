// Word-page themes and templates (services/tela/docTemplates) and the look order (services/edu/documentLookCore).
import test from 'node:test';
import assert from 'node:assert/strict';
import fontManifest from '../services/text/fonts/manifest.json';
import type { TelaDoc, TelaWriterDevice } from '../types';
import { applyTelaOp } from '../components/tela/telaOps';
import { recordOp, emptyHistory, undo } from '../components/tela/telaHistory';
import { writerDocumentOf } from '../components/tela/writer/writerModel';
import { DOC_STRUCTURES, DOC_TEMPLATES, DOC_THEMES, structureById, themeById } from '../services/tela/docTemplates/library';
import { SHEET_ID, themeStyleSheet, writerTheme, mergeSheet } from '../services/tela/docTemplates/build';
import { pageIsEmpty, templateModeFor, templateOp, themeOf, themeOp, writerPages } from '../services/tela/docTemplates/apply';
import { pageFlourishSvg, readTheme, themeColor, themedMargins } from '../services/text/document/theme';
import { resolveParagraph } from '../services/text/model';
import { resolveLook, lookChoices, isTestKind } from '../services/edu/documentLookCore';
import { DEFAULT_LIVING_TEMPLATE_ID } from '../services/council/livingDocumentTemplates';

const families = new Set(Object.keys((fontManifest as { families: Record<string, unknown> }).families));
let n = 0;
const uid = (p: string) => `${p}_${++n}`;
const blankDoc = (text = ''): TelaDoc => ({
  id: 'd', ownerId: 'u', title: 'T', createdAt: 1, updatedAt: 1, bindings: [],
  frames: [{ id: 'f1', kind: 'PAPER', preset: 'LETTER', x: 0, y: 0, w: 816, h: 1056, deviceIds: ['w1'], label: 'Page 1' }],
  devices: { w1: { id: 'w1', type: 'WRITER', blocks: [{ id: 'b1', kind: 'p', text }] } },
});
const ids = (d: TelaWriterDevice) => writerDocumentOf(d).story.paragraphs.map(p => p.id);
const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every theme uses fonts the text engine ships, and prints legibly', () => {
  assert.ok(DOC_THEMES.length >= 12);
  for (const t of DOC_THEMES) {
    for (const f of Object.values(t.fonts)) assert.ok(families.has(f), `${t.id}: font "${f}" is not in the engine's manifest`);
    assert.ok(t.body.size >= 10.5 && t.body.size <= 12, `${t.id}: body ${t.body.size}pt`);
    assert.ok(contrast(t.palette.ink, t.palette.paper) >= 7, `${t.id}: ink on paper below 7:1`);
    assert.ok(lum(t.palette.paper) > 0.8, `${t.id}: paper too dark for a copier`);
    assert.ok(t.director && t.note && t.signature);
  }
  assert.equal(new Set(DOC_THEMES.map(t => t.id)).size, DOC_THEMES.length);
});

test('every template pairs a real structure with a real theme; every structure and theme is used', () => {
  assert.equal(new Set(DOC_TEMPLATES.map(t => t.id)).size, DOC_TEMPLATES.length);
  for (const t of DOC_TEMPLATES) { assert.ok(structureById(t.structureId), t.id); assert.ok(themeById(t.themeId), t.id); }
  for (const s of DOC_STRUCTURES) assert.ok(DOC_TEMPLATES.some(t => t.structureId === s.id), `structure ${s.id} unused`);
  for (const th of DOC_THEMES) assert.ok(DOC_TEMPLATES.some(t => t.themeId === th.id), `theme ${th.id} unused`);
});

test('a theme becomes a full stylesheet: Word styles kept, headings flush, flourishes have room', () => {
  for (const t of DOC_THEMES) {
    const sheet = themeStyleSheet(t);
    for (const id of ['body', 'title', 'subtitle', 'h1', 'h2', 'h3', 'quote', 'intense-quote', 'caption', 'kicker', 'byline', 'lead', 'meta', 'list', 'list-number', 'footnote', 'toc1']) assert.ok(sheet.paragraph[id], `${t.id}: missing ${id}`);
    const h1 = resolveParagraph(sheet, { id: 'x', styleId: 'h1', runs: [] });
    assert.equal(h1.para.indentFirst, 0, `${t.id}: h1 inherits the body indent`);
    assert.equal(h1.char.fontFamily, t.fonts[t.styles.h1.font ?? 'heading']);
    const body = resolveParagraph(sheet, { id: 'x', runs: [] });
    assert.equal(body.char.color, t.palette.ink);
    for (const [k, f] of Object.entries(t.flourishes)) {
      if (k === 'body' || !f?.below) continue;
      assert.ok((t.styles[k as keyof typeof t.styles].after ?? 0) >= (f.below.gap ?? 4) + f.below.weight, `${t.id}.${k}: rule below has no room`);
    }
    const wt = writerTheme(t);
    assert.deepEqual(Object.keys(wt.styles).sort(), Object.keys(t.flourishes).map(k => (k === 'body' ? k : SHEET_ID[k as keyof typeof SHEET_ID])).sort());
    assert.doesNotThrow(() => JSON.stringify(wt));
  }
});

test('page flourishes draw as safe SVG and respect minimum margins', () => {
  for (const t of DOC_THEMES) {
    const wt = writerTheme(t);
    const m = themedMargins(wt, { top: 96, right: 96, bottom: 96, left: 96 });
    const svg = pageFlourishSvg(wt, { width: 816, height: 1056, content: { x: m.left, y: m.top, width: 816 - m.left - m.right, height: 1056 - m.top - m.bottom } });
    assert.ok(svg.startsWith('<rect'), t.id);
    assert.ok(!/NaN|undefined|<script|javascript:/i.test(svg), `${t.id}: bad markup`);
    assert.ok(m.left >= (t.page.minMargins?.left ?? 0) * 96);
  }
  assert.equal(themeColor(DOC_THEMES[0].palette, 'url(javascript:alert(1))', '#000000'), '#000000');
  assert.equal(readTheme({ id: 1 }), undefined);
});

test('use theme: design only, the words stay, one undo step, custom styles survive', () => {
  const doc = blankDoc('My own words');
  const before = doc.devices.w1 as TelaWriterDevice;
  const t = DOC_THEMES[0];
  const op = themeOp(doc, t, ['w1'])!;
  assert.equal(op.type, 'BATCH');
  const next = applyTelaOp(doc, op);
  const w = next.devices.w1 as TelaWriterDevice;
  assert.equal(themeOf(w), t.id);
  assert.equal(w.blocks[0].text, 'My own words');
  assert.deepEqual(ids(w), ids(before));
  assert.equal(writerDocumentOf(w).styles.paragraph.body.char?.fontFamily, t.fonts.body);
  const h = recordOp(emptyHistory(), doc, op);
  assert.equal(h.past.length, 1);
  assert.equal(h.past[0].label, `Theme: ${t.name}`);
  assert.equal(themeOf(undo(h, next)!.doc.devices.w1 as TelaWriterDevice), null);
  const plain = applyTelaOp(next, themeOp(next, null, ['w1'])!);
  assert.equal(themeOf(plain.devices.w1 as TelaWriterDevice), null);
  const other = themeStyleSheet(DOC_THEMES[1]);
  const merged = mergeSheet(themeStyleSheet(t), { ...other, paragraph: { ...other.paragraph, mine: { id: 'mine', name: 'Mine' } } });
  assert.ok(merged.paragraph.mine);
  assert.equal(merged.paragraph.body.char?.fontFamily, t.fonts.body);
});

test('use template on an empty document fills it and adds the further pages', () => {
  const doc = blankDoc('');
  assert.equal(templateModeFor(doc), 'fill');
  const st = structureById('report')!, th = themeById('heavy-ink')!;
  const r = templateOp(doc, st, th, { mode: 'fill', uid, origin: { x: 0, y: 0 }, paragraphIds: ids })!;
  const next = applyTelaOp(doc, r.op);
  const pages = writerPages(next);
  assert.equal(pages.length, st.pages.length);
  assert.equal(r.added, st.pages.length - 1);
  assert.ok(pages.every(p => themeOf(p.device) === th.id && !pageIsEmpty(p.device)));
  assert.equal(pages[0].device.blocks.length, st.pages[0].body.length);
  assert.equal(pages[0].frame.label, 'Cover');
  assert.ok(pages[1].frame.y >= pages[0].frame.y + pages[0].frame.h);
  const setup = writerDocumentOf(pages[0].device).sections[0].setup;
  assert.equal(setup.margins.top, (st.pages[0].margins?.top ?? 1) * 96);
});

test('use template on a document with words never removes them', () => {
  const doc = blankDoc('Keep this sentence.');
  assert.equal(templateModeFor(doc), 'ask');
  const st = structureById('newsletter')!, th = themeById('chiaroscuro-gazette')!;
  for (const mode of ['fill', 'restyle', 'append'] as const) {
    const r = templateOp(doc, st, th, { mode, uid, origin: { x: 0, y: 0 }, paragraphIds: ids })!;
    const next = applyTelaOp(doc, r.op);
    const first = next.devices.w1 as TelaWriterDevice;
    assert.equal(first.blocks[0].text, 'Keep this sentence.', mode);
    if (mode === 'append') { assert.equal(writerPages(next).length, 1 + st.pages.length); assert.equal(themeOf(first), null); }
    else { assert.equal(themeOf(first), th.id); assert.equal(writerDocumentOf(first).sections[0].setup.columns.count, 2); }
  }
});

test('pages bound to a song or journal take a look but never a skeleton', () => {
  const doc = blankDoc('');
  (doc.devices.w1 as TelaWriterDevice).mode = 'SONGWRITING';
  const r = templateOp(doc, structureById('letter')!, themeById('gratiot-ledger')!, { mode: 'fill', uid, origin: { x: 0, y: 0 }, paragraphIds: ids })!;
  const w = applyTelaOp(doc, r.op).devices.w1 as TelaWriterDevice;
  assert.ok(pageIsEmpty(w));
  assert.equal(themeOf(w), 'gratiot-ledger');
});

test('look order: assignment, teacher, department, organization, lesson, platform', () => {
  const ws = lookChoices(false).map(t => t.id), ts = lookChoices(true).map(t => t.id);
  assert.ok(ws.length >= 4 && ts.length >= 4);
  const unit = { kind: 'WORKSHEET', livingTemplateId: ws[0] };
  assert.deepEqual(resolveLook({ unit: { kind: 'WORKSHEET' } }), { templateId: DEFAULT_LIVING_TEMPLATE_ID, source: 'platform' });
  assert.equal(resolveLook({ unit }).source, 'lesson');
  assert.deepEqual(resolveLook({ unit, organization: { worksheet: ws[1] } }), { templateId: ws[1], source: 'organization' });
  assert.deepEqual(resolveLook({ unit, organization: { worksheet: ws[1] }, department: { worksheet: ws[2] } }), { templateId: ws[2], source: 'department' });
  assert.deepEqual(resolveLook({ unit, organization: { worksheet: ws[1] }, department: { worksheet: ws[2] }, teacher: { worksheet: ws[3] } }), { templateId: ws[3], source: 'teacher' });
  assert.deepEqual(resolveLook({ unit, teacher: { worksheet: ws[3] }, assignment: ws[1] }), { templateId: ws[1], source: 'assignment' });
  // A test takes the test look; a look for the other kind, or one that no longer exists, is passed over.
  assert.ok(isTestKind('QUIZ') && isTestKind('UNIT_TEST') && !isTestKind('WORKSHEET'));
  assert.deepEqual(resolveLook({ unit: { kind: 'QUIZ' }, teacher: { worksheet: ws[3] }, organization: { test: ts[1] } }), { templateId: ts[1], source: 'organization' });
  assert.equal(resolveLook({ unit, teacher: { worksheet: 'gone' }, organization: { worksheet: ws[1] } }).source, 'organization');
});
