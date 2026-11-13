import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  classify, labelFor, planFill, valuesToWrite, learnFrom, applyLearned, sanitizeFillProfile, mergeFillProfiles,
  mapRequest, cleanAiMap, detectBlanks, searchRuns, splitFullName, formatPhone, pickOption, emptyFillProfile,
  type PdfField, type TextRun, type FillProfile,
} from '../services/tela/pdf/smartFill';
import { writePdf, mergePdfs, extractPages } from '../services/tela/pdf/pdfWrite';

const profile: FillProfile = {
  values: { fullName: 'Maya J. Okafor', email: 'maya@example.org', phone: '313-555-0142', street: '100 Woodward Ave', city: 'Detroit', state: 'Michigan', zip: '48226', dob: '1990-04-07', company: 'Second Ebenezer' },
  remembered: { 't shirt size': 'M' }, updatedAt: 1,
};
const F = (o: Partial<PdfField> & { name: string }): PdfField => ({ type: 'text', page: 0, rect: [100, 700, 300, 716], ...o });
const NOW = new Date('2026-11-12T12:00:00Z');

test('printed label beats a cryptic field name', () => {
  const runs: TextRun[] = [{ str: 'Email address:', x: 20, y: 703, w: 70, h: 10 }, { str: 'Unrelated footer', x: 20, y: 40, w: 90, h: 8 }];
  const label = labelFor([100, 700, 300, 716], runs);
  assert.equal(label, 'Email address:');
  const c = classify({ name: 'Text12', type: 'text', label });
  assert.equal(c.kind, 'match'); assert.equal((c as any).match.key, 'email');
});

test('label above a stacked box, and caption below a line', () => {
  const above: TextRun[] = [{ str: 'City', x: 100, y: 720, w: 20, h: 8 }];
  assert.equal(labelFor([100, 700, 200, 716], above), 'City');
  const below: TextRun[] = [{ str: '(Print name)', x: 110, y: 686, w: 50, h: 8 }];
  assert.equal(labelFor([100, 700, 260, 712], below), '(Print name)');
});

test('signatures, certifications and identifiers are never filled', () => {
  const rows = planFill([
    F({ name: 'sig', type: 'signature' }),
    F({ name: 'Text1', label: 'Signature of applicant' }),
    F({ name: 'Text2', label: 'Date signed' }),
    F({ name: 'Text3', label: 'Social Security Number' }),
    F({ name: 'Text4', label: 'Routing number' }),
    F({ name: 'cb', type: 'checkbox', label: 'I certify the above is true' }),
    F({ name: 'cb2', type: 'checkbox', label: 'Are you a veteran?' }),
  ], profile, { now: NOW });
  assert.deepEqual(rows.map(r => r.outcome), ['human', 'human', 'human', 'sensitive', 'sensitive', 'human', 'choice']);
  assert.ok(rows.every(r => r.value === undefined));
});

test('fills, shapes and splits from the profile', () => {
  const rows = planFill([
    F({ name: 'Text1', label: 'First name' }), F({ name: 'Text2', label: 'Last name' }), F({ name: 'Text3', label: 'Middle initial' }),
    F({ name: 'Text4', label: 'Phone', maxLen: 10 }), F({ name: 'Text5', label: 'State', maxLen: 2 }),
    F({ name: 'Text6', label: 'Date of birth (YYYY-MM-DD)' }), F({ name: 'Text7', label: 'Date of birth (mm/dd/yyyy)' }),
    F({ name: 'Text8', label: 'City, State, ZIP' }), F({ name: 'Text9', label: 'Date' }),
    F({ name: 'dd', type: 'dropdown', label: 'State', options: ['Michigan', 'Ohio'] }),
    F({ name: 'Text10', label: 'Email', value: 'already@there.com' }),
    F({ name: 'Text11', label: 'Name (print in BLOCK LETTERS)' }),
  ], profile, { now: NOW });
  const v = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(v.Text1.value, 'Maya'); assert.equal(v.Text2.value, 'Okafor'); assert.equal(v.Text3.value, 'J.');
  assert.equal(v.Text4.value, '3135550142');
  assert.equal(v.Text5.value, 'MI');
  assert.equal(v.Text6.value, '1990-04-07'); assert.equal(v.Text7.value, '04/07/1990');
  assert.equal(v.Text8.value, 'Detroit, MI 48226');
  assert.equal(v.Text9.outcome, 'suggest'); assert.equal(v.Text9.value, '11/12/2026');
  assert.equal(v.dd.value, 'Michigan');
  assert.equal(v.Text10.outcome, 'keep');
  assert.equal(v.Text11.value, 'MAYA J. OKAFOR');
  const write = valuesToWrite(rows, new Set());
  assert.ok(!('Text9' in write), 'suggestions wait for the person');
  assert.equal(write.Text1, 'Maya');
});

test('remembered answers fill custom questions; learning skips identifiers', () => {
  const rows = planFill([F({ name: 'Text1', label: 'T-shirt size' })], profile, { now: NOW });
  assert.equal(rows[0].value, 'M');
  const fields = [F({ name: 'a', label: 'Favorite hymn' }), F({ name: 'b', label: 'Card number' }), F({ name: 'c', label: 'Notes' }), F({ name: 'd', label: 'Email' })];
  const learned = learnFrom(fields, { a: 'Amazing Grace', b: '4111 1111 1111 1111', c: '123-45-6789', d: 'new@example.org' }, profile);
  assert.deepEqual(learned.map(l => l.value).sort(), ['Amazing Grace', 'new@example.org']);
  const next = applyLearned(profile, learned, 5);
  assert.equal(next.values.email, 'new@example.org'); assert.equal(next.remembered['favorite hymn'], 'Amazing Grace');
});

test('profile sanitising drops unknown keys and ID-shaped values; merge keeps both sides', () => {
  const p = sanitizeFillProfile({ values: { email: 'a@b.c', ssn: '123-45-6789', phone: '123-45-6789', bogus: 'x' }, remembered: { 'bank account': '1', 'shoe size': '9' }, updatedAt: 3 });
  assert.deepEqual(p.values, { email: 'a@b.c' }); assert.deepEqual(p.remembered, { 'shoe size': '9' });
  const m = mergeFillProfiles({ values: { city: 'Detroit' }, remembered: {}, updatedAt: 1 }, { values: { email: 'x@y.z' }, remembered: { k: 'v' }, updatedAt: 2 });
  assert.deepEqual(m.values, { city: 'Detroit', email: 'x@y.z' }); assert.equal(m.updatedAt, 2);
});

test('AI request carries questions only, never values; answer is validated', () => {
  const fields = [F({ name: 'Text1', label: 'Where do you live (town)?' }), F({ name: 'Text2', label: 'Zorp' }), F({ name: 'Text3', label: 'SSN' })];
  const rows = planFill(fields, profile, { now: NOW });
  const req = mapRequest(fields, rows);
  const json = JSON.stringify(req);
  for (const val of Object.values(profile.values)) assert.ok(!json.includes(val!), `leaked ${val}`);
  assert.ok(!json.includes('SSN'));
  const map = cleanAiMap({ map: { Text2: 'city', Text9: 'email', Text1: 'password' } }, req);
  assert.deepEqual(map, { Text2: 'city' });
  const again = planFill(fields, profile, { now: NOW, aiMap: map });
  assert.equal(again.find(r => r.name === 'Text2')!.outcome, 'suggest');
});

test('flat forms: blanks and boxes become fields; search folds accents', () => {
  const runs: TextRun[] = [{ str: 'Name ____________  ', x: 50, y: 600, w: 190, h: 10 }, { str: '☐ Yes ☐ No', x: 50, y: 560, w: 60, h: 10 }];
  const b = detectBlanks(0, runs);
  assert.equal(b[0].label, 'Name'); assert.equal(b[0].type, 'text');
  assert.deepEqual(b.filter(x => x.type === 'checkbox').map(x => x.label), ['Yes', 'No']);
  const hits = searchRuns([[{ str: 'Café menu', x: 0, y: 0, w: 1, h: 1 }], [{ str: 'cafe hours, CAFE', x: 0, y: 0, w: 1, h: 1 }]], 'cafe');
  assert.equal(hits.length, 3);
});

test('helpers', () => {
  assert.deepEqual(splitFullName('Dr. Maya J. Okafor Jr.'), { prefix: 'Dr.', first: 'Maya', middle: 'J.', last: 'Okafor', suffix: 'Jr.' });
  assert.equal(formatPhone('+1 313 555 0142'), '(313) 555-0142');
  assert.equal(pickOption(['AL', 'MI'], 'Michigan', 'state'), 'MI');
  assert.equal(pickOption(['United States', 'Canada'], 'USA', 'country'), 'United States');
  assert.deepEqual(planFill([], emptyFillProfile()), []);
});

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]); doc.addPage([612, 792]);
  page.drawText('Email', { x: 40, y: 704, size: 10, font });
  const form = doc.getForm();
  form.createTextField('Text1').addToPage(page, { x: 100, y: 700, width: 200, height: 16 });
  form.createCheckBox('Check1').addToPage(page, { x: 100, y: 660, width: 12, height: 12 });
  const dd = form.createDropdown('State'); dd.addOptions(['MI', 'OH']); dd.addToPage(page, { x: 100, y: 620, width: 80, height: 16 });
  return doc.save();
}

test('writePdf fills fields, adds markup and new fields, rotates and flattens', async () => {
  const src = await samplePdf();
  const r = await writePdf(src, {
    values: { Text1: 'maya@example.org — ✓', Check1: true, State: 'MI', Nope: 'x' },
    newFields: [{ name: 'Name_auto', page: 1, rect: [50, 600, 250, 614], type: 'text', tooltip: 'Name' }],
    markups: [
      { id: 'h', page: 0, kind: 'highlight', rects: [[40, 700, 80, 712]], color: '#ffe066' },
      { id: 'i', page: 0, kind: 'ink', strokes: [[[10, 10], [20, 30], [40, 20]]], color: '#d40055', width: 2 },
      { id: 'n', page: 0, kind: 'note', at: [500, 750], text: 'Check this', color: '#ffcc00' },
      { id: 't', page: 1, kind: 'text', rect: [50, 500, 300, 560], text: 'A typed note that wraps across lines nicely', color: '#000000', size: 11 },
    ],
    rotate: { 1: 90 },
  });
  assert.deepEqual(r.written.sort(), ['Check1', 'State', 'Text1']);
  assert.deepEqual(r.failed.map(f => f.name), ['Nope']);
  const back = await PDFDocument.load(r.bytes);
  assert.equal(back.getForm().getTextField('Text1').getText(), 'maya@example.org - ');
  assert.equal(back.getForm().getCheckBox('Check1').isChecked(), true);
  assert.ok(back.getForm().getTextField('Name_auto'));
  assert.equal(back.getPage(1).getRotation().angle, 90);
  const flat = await writePdf(r.bytes, { flatten: true, remove: [1] });
  const fb = await PDFDocument.load(flat.bytes);
  assert.equal(fb.getForm().getFields().length, 0); assert.equal(fb.getPageCount(), 1);
});

test('merge and extract pages', async () => {
  const a = await samplePdf();
  const merged = await mergePdfs([a, a]);
  assert.equal((await PDFDocument.load(merged)).getPageCount(), 4);
  const one = await extractPages(merged, [3]);
  assert.equal((await PDFDocument.load(one)).getPageCount(), 1);
});

// ─── Real pdf.js against the lab's sample form ───────────────────────────────
import { sampleForm } from '../services/tela/pdf/sampleForm';
import { fieldsOf, runsOf } from '../services/tela/pdf/pdfjsAdapters';

async function openWithPdfjs(bytes: Uint8Array) {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
}

test('pdf.js reads the sample form; labels come from the page; Smart Fill plans; values survive a save', async () => {
  const bytes = await sampleForm();
  const pdf = await openWithPdfjs(bytes);
  const page = await pdf.getPage(1);
  const fields = await fieldsOf(page, 0); const runs = await runsOf(page);
  fields.forEach(f => { f.label = labelFor(f.rect, runs, { box: f.type === 'checkbox' || f.type === 'radio' }) || undefined; });
  const label = (n: string) => fields.find(f => f.name === n)?.label;
  assert.equal(label('Text1'), 'First name *');
  assert.equal(label('Text3'), 'Email address');
  assert.equal(label('Text7'), 'ZIP');
  assert.equal(fields.find(f => f.name === 'Dropdown1')?.type, 'dropdown');
  assert.equal(fields.find(f => f.name === 'Check Box1')?.type, 'checkbox');
  assert.equal(label('Check Box1'), 'Are you a veteran?');
  assert.match(label('Check Box2') ?? '', /^I certify/);

  const rows = planFill(fields, profile, { now: NOW });
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(by.Text1.value, 'Maya'); assert.equal(by.Text2.value, 'Okafor'); assert.equal(by.Text3.value, 'maya@example.org');
  assert.equal(by.Text4.value, '(313) 555-0142'); assert.equal(by.Text6.value, 'Detroit'); assert.equal(by.Text7.value, '48226');
  assert.equal(by.Dropdown1.value, 'Michigan'); assert.equal(by.Text8.value, '04/07/1990');
  assert.equal(by.Text11.value, 'M', 'remembered answer');
  assert.equal(by.Text9.outcome, 'no-data', 'emergency contact is not in the profile');
  assert.equal(by.Text12.outcome, 'sensitive');
  assert.equal(by.Text13.outcome, 'human');
  assert.equal(by['Check Box1'].outcome, 'choice'); assert.equal(by['Check Box2'].outcome, 'human');
  assert.equal(by.Text14.outcome, 'suggest');

  const write = valuesToWrite(rows, new Set());
  const out = await writePdf(bytes, { values: write });
  assert.equal(out.failed.length, 0);
  const again = await openWithPdfjs(out.bytes);
  const after = await fieldsOf(await again.getPage(1), 0);
  assert.equal(after.find(f => f.name === 'Text3')?.value, 'maya@example.org');
  assert.equal(after.find(f => f.name === 'Dropdown1')?.value, 'Michigan');
  assert.ok(!after.find(f => f.name === 'Text12')?.value, 'SSN stays blank');

  // Page 2 is flat: its blanks are found from the real text runs.
  const blanks = detectBlanks(1, await runsOf(await pdf.getPage(2)));
  assert.deepEqual(blanks.map(b => b.label), ['Name', 'Phone', 'Email']);
  const planned = planFill(blanks.map((b, i) => ({ name: `Tela_p2_${i + 1}`, type: b.type, page: 1, rect: b.rect, label: b.label })), profile, { now: NOW });
  assert.deepEqual(planned.map(r => r.value), ['Maya J. Okafor', '(313) 555-0142', 'maya@example.org']);
});
