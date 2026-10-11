import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import {
  ERR, SheetEngine, addConditionalFormat, addDataValidation, addSheet, addTable, copyToClipboard, createWorkbook, exportDelimited, exportFormula, exportXlsx, forEachCell, freezePanes,
  getCellA1, importXlsx, mergeCells, parseClipboard, parseDelimited, pasteClipboard, setCellInputs, setName, setStyle, workbookFromDelimited, type Workbook,
} from '../services/tela/sheet';
import { parseXml } from '../services/tela/sheet/xml';
import { buildFixtureXlsx } from './sheetXlsxFixture';

const S = (wb: Workbook, i = 0) => wb.sheets[i].id;
const cell = (wb: Workbook, a1: string, i = 0) => getCellA1(wb.sheets[i].cells, a1);

describe('CSV / TSV', () => {
  it('parses quotes, embedded newlines, CRLF and sniffs delimiters', () => {
    assert.deepEqual(parseDelimited('a,"b,c","d ""q"""\r\n1,"x\ny",3'), [['a', 'b,c', 'd "q"'], ['1', 'x\ny', '3']]);
    assert.deepEqual(parseDelimited('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
    assert.deepEqual(parseDelimited('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  });
  it('imports with type guessing and exports display text', () => {
    const wb = workbookFromDelimited('name,amount,when\nx,"$1,200.50",3/4/2026\ny,=B2*2,\n');
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'B2'), 1200.5);
    assert.equal(e.getValueA1(0, 'B3'), 2401);
    const out = exportDelimited(e, wb, S(wb));
    assert.equal(out.split('\r\n')[1], 'x,"$1,200.50",3/4/2026');
    assert.equal(exportDelimited(e, wb, S(wb), { display: false, delimiter: '\t' }).split('\r\n')[1], 'x\t1200.5\t46085');
  });
});

describe('clipboard', () => {
  it('copies TSV + styled HTML and pastes it back exactly', () => {
    let wb = createWorkbook();
    wb = setCellInputs(wb, S(wb), [['A1', 'Qty'], ['B1', '12%'], ['A2', '3'], ['B2', '=A2*2']]).workbook;
    wb = setStyle(wb, S(wb), 'A1', { font: { bold: true }, fill: { color: '#FFFF00' } }).workbook;
    const e = new SheetEngine(wb);
    const clip = copyToClipboard(e, wb, S(wb), 'A1:B2');
    assert.equal(clip.tsv, 'Qty\t12%\r\n3\t6\r\n');
    assert.match(clip.html, /font-weight:700/);
    assert.match(clip.html, /x:fmla="=A2\*2"/);
    // External paste (no internal payload): values, formulas and styles survive.
    const parsed = parseClipboard({ html: clip.html.replace(/data-tela-[a-z]+="[^"]*"/g, '') }, { row: 5, col: 0 });
    wb = pasteClipboard(wb, S(wb), { row: 5, col: 0 }, parsed).workbook;
    assert.equal(cell(wb, 'A6')?.v, 'Qty');
    assert.equal(cell(wb, 'B6')?.v, 0.12);
    assert.equal(cell(wb, 'B7')?.f, 'A2*2');
    assert.deepEqual(wb.styles[cell(wb, 'A6')!.s!].font, { bold: true });
    // Internal paste re-anchors the formula.
    const internal = parseClipboard({ html: clip.html }, { row: 9, col: 0 });
    wb = pasteClipboard(wb, S(wb), { row: 9, col: 0 }, internal).workbook;
    assert.equal(cell(wb, 'B11')?.f, 'A11*2');
  });
  it('reads Excel and Google Sheets HTML', () => {
    const excel = `<html><head><style>.xl65{mso-number-format:"0\\.00";font-weight:700}</style></head><body><table><tr><td class=xl65 x:num="3.14159">3.14</td><td>hello &amp; bye</td></tr><tr><td colspan=2>merged</td></tr></table></body></html>`;
    const p = parseClipboard({ html: excel });
    assert.equal(p.rows[0][0].value, 3.14159);
    assert.deepEqual(p.rows[0][0].style, { font: { bold: true }, numFmt: '0.00' });
    assert.equal(p.rows[0][1].text, 'hello & bye');
    assert.deepEqual(p.merges, [{ r1: 1, c1: 0, r2: 1, c2: 1 }]);
    const google = `<google-sheets-html-origin><table><tr><td data-sheets-value='{"1":3,"3":42}'>42</td><td data-sheets-value='{"1":3,"3":84}' data-sheets-formula="=R[0]C[-1]*2">84</td></tr></table>`;
    const g = parseClipboard({ html: google }, { row: 4, col: 2 });
    assert.equal(g.rows[0][0].value, 42);
    assert.equal(g.rows[0][1].formula, 'C5*2');
    assert.deepEqual(parseClipboard({ text: 'a\tb\r\n1\t2\r\n' }).rows.map(r => r.map(c => c.text)), [['a', 'b'], ['1', '2']]);
  });
});

describe('xlsx import (hand-built Excel-style fixture)', () => {
  const bytes = readFileSync(new URL('./fixtures/sheet-fixture.xlsx', import.meta.url));
  it('the committed fixture matches the generator', () => {
    const a = unzipSync(new Uint8Array(bytes)), b = unzipSync(buildFixtureXlsx());
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    for (const k of Object.keys(a)) assert.equal(strFromU8(a[k]), strFromU8(b[k]), k);
  });
  const { workbook: wb, warnings } = importXlsx(bytes);
  it('reads sheets, values, shared formulas, names and view state', () => {
    assert.deepEqual(wb.sheets.map(s => s.name), ['Data', 'Calc Sheet']);
    assert.equal(wb.activeSheet, wb.sheets[1].id);
    assert.equal(cell(wb, 'A1')?.v, 'Item');
    assert.equal(cell(wb, 'C1')?.v, 'inline');
    assert.equal(cell(wb, 'A6')?.v, 'Hello ');
    assert.equal(cell(wb, 'E1')?.v, true);
    assert.equal(cell(wb, 'F1')?.f, '#N/A');
    assert.equal(cell(wb, 'B3')?.f, 'A3*2+TaxRate');
    assert.equal(cell(wb, 'B4')?.f, 'A4*2+TaxRate');
    assert.equal(cell(wb, 'B1', 1)?.f, 'XLOOKUP(1,Data!A2:A4,Data!B2:B4)');
    assert.equal(cell(wb, 'C1', 1)?.f, 'LET(n,3,n*Twice(2))');
    assert.equal(cell(wb, 'B4', 1)?.f, '@A2:A4');
    assert.equal(cell(wb, 'A3', 1), undefined, 'cached spill cells are dropped');
    assert.deepEqual(wb.names.map(n => [n.name, n.ref]), [['TaxRate', 'Data!$B$1'], ['Twice', 'LAMBDA(x,x*2)']]);
    assert.deepEqual(wb.sheets[0].freeze, { rows: 1, cols: 0 });
    assert.deepEqual(wb.sheets[0].merges, ['A6:B6']);
    assert.equal(wb.sheets[0].colWidths?.[0], 150);
    assert.deepEqual(wb.sheets[0].hiddenCols, [2]);
    assert.equal(wb.sheets[0].rowHeights?.[0], 40);
    assert.deepEqual(wb.sheets[0].hiddenRows, [3]);
    assert.equal(wb.sheets[0].tabColor, '#00B050');
    assert.equal(cell(wb, 'A1')?.note, 'Product name');
    assert.deepEqual(warnings, []);
  });
  it('resolves styles: theme colour + tint, fills, borders, numFmts, alignment', () => {
    const st = (a1: string) => wb.styles[cell(wb, a1)!.s!];
    assert.deepEqual(st('A1'), { font: { bold: true, color: '#C55A11' }, align: { h: 'center', wrap: true } });
    assert.equal(st('B1').numFmt, '0.0%');
    assert.equal(st('D1').numFmt, 'm/d/yyyy');
    assert.deepEqual(st('A6').fill, { color: '#FFFF00' });
    assert.deepEqual(st('A6').borders, { top: { style: 'thin', color: '#000000' }, bottom: { style: 'double', color: '#0000FF' } });
  });
  it('reads conditional formats and validation, then calculates', () => {
    const cf = wb.sheets[0].conditionalFormats![0];
    assert.equal(cf.ranges, 'A2:A4');
    assert.deepEqual(cf.rule, { type: 'cellIs', operator: 'greaterThan', formulas: ['2'], style: { font: { bold: true, color: '#9C0006' }, fill: { color: '#FFC7CE' } } });
    assert.deepEqual(wb.sheets[0].dataValidations![0].list, ['a', 'b', 'c']);
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(1, 'A1'), 6);
    assert.equal(e.getValueA1(1, 'B1'), 2.07);
    assert.equal(e.getValueA1(1, 'C1'), 12);
    assert.equal(e.getValueA1(1, 'A4'), 1, 'SORT spills again');
    assert.equal(e.getValueA1(1, 'B4'), 1, '@A2:A4 in row 4 intersects A4');
    assert.equal(e.getValueA1(0, 'D1'), 46096);
  });
});

describe('xlsx export', () => {
  function sample(): Workbook {
    let wb = createWorkbook(['Sales']);
    wb = setCellInputs(wb, S(wb), [
      ['A1', 'Region'], ['B1', 'Amount'], ['C1', 'When'], ['A2', 'North'], ['B2', '$1,200.50'], ['C2', '3/15/2026'], ['A3', 'South'], ['B3', '980'], ['C3', '4/1/2026'],
      ['D1', '=SUM(B2:B3)'], ['D2', '=SORT(B2:B3,1,-1)'], ['E1', '=XLOOKUP("South",A2:A3,B2:B3)'], ['E2', '=LET(x,2,x*Rate)'], ['F1', '=1/0'], ['F2', '=A2&" & co <ok>"'], ['G1', 'TRUE'],
    ]).workbook;
    wb = setStyle(wb, S(wb), 'A1:C1', { font: { bold: true, color: '#FFFFFF', size: 12 }, fill: { color: '#1F4E79' }, borders: { bottom: { style: 'medium', color: '#000000' } }, align: { h: 'center', wrap: true } }).workbook;
    wb = mergeCells(wb, S(wb), 'A5:C5').workbook;
    wb = freezePanes(wb, S(wb), 1, 1).workbook;
    wb = { ...wb, sheets: [{ ...wb.sheets[0], colWidths: { 0: 120 }, rowHeights: { 0: 32 }, hiddenCols: [7] }] };
    wb = setName(wb, { name: 'Rate', ref: '0.5' }).workbook;
    wb = addConditionalFormat(wb, S(wb), { ranges: 'B2:B3', rule: { type: 'cellIs', operator: 'greaterThan', formulas: ['1000'], style: { font: { bold: true }, fill: { color: '#C6EFCE' } } } }).workbook;
    wb = addConditionalFormat(wb, S(wb), { ranges: 'B2:B3', rule: { type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], colors: ['#F8696B', '#63BE7B'] } }).workbook;
    wb = addDataValidation(wb, S(wb), { ranges: 'A2:A3', type: 'list', list: ['North', 'South'] }).workbook;
    wb = addTable(wb, S(wb), 'A1:C3', 'SalesTable').workbook;
    wb = addSheet(wb, "Q1 'Notes' Review").workbook;
    wb = setCellInputs(wb, S(wb, 1), [['A1', "=Sales!B2*2"], ['A2', '=SUM(SalesTable[Amount])']]).workbook;
    return wb;
  }
  it('writes a standards-ordered package whose parts all parse and resolve', () => {
    const wb = sample();
    const e = new SheetEngine(wb);
    const files = unzipSync(exportXlsx(wb, { engine: e }));
    for (const p of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/metadata.xml', 'xl/tables/table1.xml', 'docProps/core.xml', 'docProps/app.xml'])
      assert.ok(files[p], `missing ${p}`);
    const types = strFromU8(files['[Content_Types].xml']);
    for (const p of Object.keys(files)) if (!p.endsWith('.rels') && p !== '[Content_Types].xml') assert.ok(types.includes(`PartName="/${p}"`), `no content type for ${p}`);
    for (const [p, data] of Object.entries(files)) {
      const xml = parseXml(strFromU8(data));
      assert.ok(xml.name, `${p} parses`);
      if (p.endsWith('.rels')) for (const r of xml.children) if (r.attrs.TargetMode !== 'External') {
        const base = p.replace(/_rels\/([^/]*)\.rels$/, '$1').split('/').slice(0, -1).join('/');
        const target = (base ? base + '/' : '') + r.attrs.Target;
        const norm = target.split('/').reduce<string[]>((acc, s) => (s === '..' ? acc.slice(0, -1) : [...acc, s]), []).join('/');
        assert.ok(files[norm], `${p} → ${norm} exists`);
      }
    }
    // SpreadsheetML element order inside <worksheet> follows the schema sequence.
    const order = ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'autoFilter', 'mergeCells', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'pageMargins', 'tableParts'];
    const ws = parseXml(strFromU8(files['xl/worksheets/sheet1.xml'])).children.map(c => c.name);
    const idx = ws.map(n => order.indexOf(n));
    assert.ok(idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || v >= idx[i - 1]), ws.join(','));
    const sheet1 = strFromU8(files['xl/worksheets/sheet1.xml']);
    assert.match(sheet1, /<c r="D2"[^>]* cm="1"><f t="array" ref="D2:D3">_xlfn\._xlws\.SORT\(B2:B3,1,-1\)<\/f>/);
    assert.match(sheet1, /_xlfn\.XLOOKUP/);
    assert.match(sheet1, /_xlfn\.LET\(_xlpm\.x,2,_xlpm\.x\*Rate\)/);
    assert.match(sheet1, /<c r="F1"[^>]* t="e"><f>1\/0<\/f><v>#DIV\/0!<\/v>/);
    assert.match(sheet1, /&amp; co &lt;ok&gt;/);
  });
  it('round-trips: export → import gives the same workbook', () => {
    const wb = sample();
    const e = new SheetEngine(wb);
    const back = importXlsx(exportXlsx(wb, { engine: e })).workbook;
    assert.deepEqual(back.sheets.map(s => s.name), wb.sheets.map(s => s.name));
    for (let i = 0; i < wb.sheets.length; i++) {
      const a: Record<string, unknown> = {}, b: Record<string, unknown> = {};
      forEachCell(wb.sheets[i].cells, (r, c, cl) => { a[`${r},${c}`] = { v: cl.v, f: cl.f, s: cl.s ? wb.styles[cl.s] : undefined }; });
      forEachCell(back.sheets[i].cells, (r, c, cl) => { b[`${r},${c}`] = { v: cl.v, f: cl.f, s: cl.s ? back.styles[cl.s] : undefined }; });
      assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), `sheet ${i} cells`);
    }
    const s0 = wb.sheets[0], r0 = back.sheets[0];
    for (const k of ['merges', 'freeze', 'colWidths', 'rowHeights', 'hiddenCols'] as const) assert.deepEqual(r0[k], s0[k], k);
    assert.deepEqual(r0.conditionalFormats!.map(c => c.rule), s0.conditionalFormats!.map(c => c.rule));
    assert.deepEqual(r0.dataValidations!.map(d => [d.ranges, d.type, d.list]), s0.dataValidations!.map(d => [d.ranges, d.type, d.list]));
    assert.deepEqual(r0.tables!.map(t => [t.name, t.range]), [['SalesTable', 'A1:C3']]);
    assert.deepEqual(back.names.map(n => [n.name, n.ref]), [['Rate', '0.5']]);
    const e2 = new SheetEngine(back);
    for (const a1 of ['D1', 'D3', 'E1', 'E2', 'F1', 'F2']) assert.deepEqual(e2.getValueA1(0, a1), e.getValueA1(0, a1), a1);
    assert.equal(e2.getValueA1(1, 'A2'), 2180.5);
    assert.equal(e2.getValueA1(0, 'F1'), ERR.DIV0);
  });
  it('writes OOXML-flavoured formula text', () => {
    assert.equal(exportFormula('FILTER(A1:A9,A1:A9>0)'), '_xlfn._xlws.FILTER(A1:A9,A1:A9>0)');
    assert.equal(exportFormula('@A1:A3+STDEV.S(B:B)'), '_xlfn.SINGLE(A1:A3)+_xlfn.STDEV.S(B:B)');
    assert.equal(exportFormula('SUM(A1:A3)'), 'SUM(A1:A3)');
  });
});
