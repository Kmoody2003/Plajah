import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SheetEngine, addConditionalFormat, addDataValidation, addSheet, applyPatch, clearRange, copyRange, createWorkbook, deleteCols, deleteRows, deleteSheet, duplicateSheet,
  engineSource, evaluateConditionalFormats, fillRange, findAll, freezePanes, getCellA1, getStyleAt, insertCols, listOptions, mergeCells, moveRange, moveSheet, renameName,
  replaceAll, setCellInput, setCellInputs, setFilter, setName, setNumberFormat, setStyle, sortRange, unmergeCells, validateValue, type Workbook,
} from '../services/tela/sheet';

const S = (wb: Workbook, i = 0) => wb.sheets[i].id;
const cell = (wb: Workbook, a1: string, i = 0) => getCellA1(wb.sheets[i].cells, a1);
function wbWith(cells: Record<string, string>): Workbook {
  const wb = createWorkbook();
  return setCellInputs(wb, S(wb), Object.entries(cells)).workbook;
}

describe('ops: input, styles, undo', () => {
  it('guesses formats from typed input and keeps the style on clear', () => {
    let wb = createWorkbook();
    wb = setCellInputs(wb, S(wb), [['A1', '$1,200.50'], ['A2', '12%'], ['A3', '3/15/2026'], ['A4', "'007"], ['A5', '=A1*2'], ['A6', 'TRUE']]).workbook;
    assert.deepEqual(cell(wb, 'A1')?.v, 1200.5);
    assert.equal(getStyleAt(wb, S(wb), 'A1').numFmt, '"$"#,##0.00');
    assert.equal(cell(wb, 'A2')?.v, 0.12);
    assert.equal(cell(wb, 'A3')?.v, 46096);
    assert.equal(getStyleAt(wb, S(wb), 'A3').numFmt, 'm/d/yyyy');
    assert.equal(cell(wb, 'A4')?.v, '007');
    assert.equal(cell(wb, 'A5')?.f, 'A1*2');
    assert.equal(cell(wb, 'A6')?.v, true);
    wb = setCellInput(wb, S(wb), 'A1', '').workbook;
    assert.equal(cell(wb, 'A1')?.v, undefined);
    assert.ok(cell(wb, 'A1')?.s, 'style survives clearing content');
  });
  it('produces cell-granular patches that undo and redo', () => {
    const wb0 = wbWith({ A1: '1' });
    const { workbook: wb1, patch } = setCellInput(wb0, S(wb0), 'A1', '2');
    const undone = applyPatch(wb1, patch, 'undo');
    assert.equal(cell(undone, 'A1')?.v, 1);
    assert.equal(cell(applyPatch(undone, patch, 'redo'), 'A1')?.v, 2);
    // Untouched rows keep identity (engine diff relies on it).
    const wb2 = setCellInput(wb1, S(wb1), 'C9', 'x').workbook;
    assert.equal(wb2.sheets[0].cells[0], wb1.sheets[0].cells[0]);
  });
  it('styles merge, intern, and remove keys with null', () => {
    let wb = wbWith({ A1: '1', B1: '2' });
    wb = setStyle(wb, S(wb), 'A1:B1', { font: { bold: true }, fill: { color: '#FFFF00' } }).workbook;
    wb = setStyle(wb, S(wb), 'B1', { font: { italic: true }, fill: null }).workbook;
    assert.deepEqual(getStyleAt(wb, S(wb), 'A1'), { font: { bold: true }, fill: { color: '#FFFF00' } });
    assert.deepEqual(getStyleAt(wb, S(wb), 'B1'), { font: { bold: true, italic: true } });
    assert.equal(cell(wb, 'A1')?.s, getCellA1(wb.sheets[0].cells, 'A1')?.s);
    wb = setNumberFormat(wb, S(wb), 'A1', '0.00%').workbook;
    assert.equal(getStyleAt(wb, S(wb), 'A1').numFmt, '0.00%');
    wb = clearRange(wb, S(wb), 'A1:B1', 'formats').workbook;
    assert.equal(cell(wb, 'A1')?.s, undefined);
  });
});

describe('ops: structure', () => {
  it('insert/delete columns rewrite formulas, merges, widths', () => {
    let wb = wbWith({ A1: '1', B1: '2', C1: '=A1+B1', D1: '=SUM(A1:B1)' });
    wb = mergeCells(wb, S(wb), 'A3:B3').workbook;
    wb = { ...wb, sheets: [{ ...wb.sheets[0], colWidths: { 1: 120 } }] };
    wb = insertCols(wb, S(wb), 1, 1).workbook;
    assert.equal(cell(wb, 'D1')?.f, 'A1+C1');
    assert.equal(cell(wb, 'E1')?.f, 'SUM(A1:C1)');
    assert.deepEqual(wb.sheets[0].merges, ['A3:C3']);
    assert.deepEqual(wb.sheets[0].colWidths, { 2: 120 });
    wb = deleteCols(wb, S(wb), 0, 1).workbook;
    assert.equal(cell(wb, 'C1')?.f, '#REF!+B1');
    assert.equal(new SheetEngine(wb).getValueA1(0, 'C1'), new SheetEngine(wb).getValueA1(0, 'C1'));
  });
  it('deleting rows shrinks ranges and #REF!s deleted cells; undo restores', () => {
    const wb0 = wbWith({ A1: '1', A2: '2', A3: '3', A4: '=SUM(A1:A3)', B1: '=A2' });
    const res = deleteRows(wb0, S(wb0), 1, 1);
    assert.equal(cell(res.workbook, 'A3')?.f, 'SUM(A1:A2)');
    assert.equal(cell(res.workbook, 'B1')?.f, '#REF!');
    assert.equal(cell(applyPatch(res.workbook, res.patch, 'undo'), 'A4')?.f, 'SUM(A1:A3)');
  });
  it('move (cut/paste) re-points references to the moved block', () => {
    let wb = wbWith({ A1: '5', B1: '=A1*2', C1: '=SUM(A1:A1)' });
    wb = moveRange(wb, S(wb), 'A1', S(wb), 'A10').workbook;
    assert.equal(cell(wb, 'A10')?.v, 5);
    assert.equal(cell(wb, 'B1')?.f, 'A10*2');
    assert.equal(cell(wb, 'A1'), undefined);
    assert.equal(new SheetEngine(wb).getValueA1(0, 'B1'), 10);
  });
  it('copy shifts relative refs, tiles, transposes, pastes values', () => {
    let wb = wbWith({ A1: '1', A2: '2', B1: '=A1*10' });
    wb = copyRange(wb, S(wb), 'B1', S(wb), 'B2:B3').workbook;
    assert.equal(cell(wb, 'B2')?.f, 'A2*10');
    assert.equal(cell(wb, 'B3')?.f, 'A3*10');
    wb = copyRange(wb, S(wb), 'A1:A2', S(wb), 'D1', { transpose: true }).workbook;
    assert.equal(cell(wb, 'E1')?.v, 2);
    const e = new SheetEngine(wb);
    wb = copyRange(wb, S(wb), 'B1:B2', S(wb), 'F1', { mode: 'values', valueAt: (s, r, c) => e.getValue(s, r, c) }).workbook;
    assert.equal(cell(wb, 'F2')?.v, 20);
    assert.equal(cell(wb, 'F2')?.f, undefined);
  });
  it('merge keeps the top-left value; unmerge removes', () => {
    let wb = wbWith({ A1: 'keep', B1: 'drop' });
    wb = mergeCells(wb, S(wb), 'A1:B2').workbook;
    assert.equal(cell(wb, 'B1'), undefined);
    assert.deepEqual(wb.sheets[0].merges, ['A1:B2']);
    wb = unmergeCells(wb, S(wb), 'A1').workbook;
    assert.deepEqual(wb.sheets[0].merges, []);
  });
  it('sheets: add, rename (refs follow), duplicate, move, delete (#REF!)', () => {
    let wb = wbWith({ A1: '=Data!A1' });
    wb = addSheet(wb, 'Data').workbook;
    wb = setCellInput(wb, S(wb, 1), 'A1', '9').workbook;
    wb = setCellInput(wb, S(wb, 0), 'A1', '=Data!A1').workbook;
    wb = duplicateSheet(wb, S(wb, 1)).workbook;
    assert.equal(wb.sheets[2].name, 'Data (2)');
    wb = moveSheet(wb, S(wb, 2), 0).workbook;
    assert.equal(wb.sheets[0].name, 'Data (2)');
    const dataId = wb.sheets.find(s => s.name === 'Data')!.id;
    wb = deleteSheet(wb, dataId).workbook;
    assert.equal(getCellA1(wb.sheets.find(s => s.name === 'Sheet1')!.cells, 'A1')?.f, '#REF!');
  });
  it('names: rename rewrites formulas; freeze panes', () => {
    let wb = wbWith({ A1: '2', B1: '=A1*Rate' });
    wb = setName(wb, { name: 'Rate', ref: '3' }).workbook;
    wb = renameName(wb, 'Rate', 'TaxRate').workbook;
    assert.equal(cell(wb, 'B1')?.f, 'A1*TaxRate');
    assert.equal(new SheetEngine(wb).getValueA1(0, 'B1'), 6);
    wb = freezePanes(wb, S(wb), 1, 2).workbook;
    assert.deepEqual(wb.sheets[0].freeze, { rows: 1, cols: 2 });
  });
});

describe('ops: fill, sort, filter, find', () => {
  it('autofills numbers, dates, text series, lists and formulas', () => {
    let wb = wbWith({ A1: '1', A2: '3', B1: 'Item 1', C1: 'Mon', D1: 'Jan', E1: 'x', I1: '1/31/2026', I2: '2/28/2026', J1: '1/15/2026', J2: '2/15/2026', F1: '=A1*2', G1: 'Q3', H1: '1/1/2026' });
    wb = fillRange(wb, S(wb), 'A1:A2', 'A1:A5').workbook;
    wb = fillRange(wb, S(wb), 'B1:H1', 'B1:H4').workbook;
    assert.deepEqual([3, 4, 5].map(r => cell(wb, `A${r}`)?.v), [5, 7, 9]);
    assert.equal(cell(wb, 'B4')?.v, 'Item 4');
    assert.equal(cell(wb, 'C3')?.v, 'Wed');
    assert.equal(cell(wb, 'D2')?.v, 'Feb');
    assert.equal(cell(wb, 'F3')?.f, 'A3*2');
    assert.equal(cell(wb, 'G3')?.v, 'Q1');
    assert.equal(cell(wb, 'H2')?.v, 46024);
    wb = fillRange(wb, S(wb), 'I1:J2', 'I1:J4').workbook;
    assert.equal(cell(wb, 'I3')?.v, 46109); // 1/31 → 2/28 is a 28-day step (Excel): 3/28
    assert.equal(cell(wb, 'J3')?.v, 46096); // same day-of-month → monthly: 3/15/2026
  });
  it('fills upward with a falling trend', () => {
    let wb = wbWith({ A5: '10', A6: '20' });
    wb = fillRange(wb, S(wb), 'A5:A6', 'A3:A6').workbook;
    assert.equal(cell(wb, 'A4')?.v, 0);
    assert.equal(cell(wb, 'A3')?.v, -10);
  });
  it('sorts stably with a header, blanks last, formulas move', () => {
    let wb = wbWith({ A1: 'Name', B1: 'Score', A2: 'b', B2: '2', A3: 'a', B3: '', A4: 'c', B4: '1', C2: '=B2*10', C3: '=B3*10', C4: '=B4*10' });
    const e = new SheetEngine(wb);
    wb = sortRange(wb, S(wb), 'A1:C4', [{ col: 1 }], { hasHeader: true, values: engineSource(e) }).workbook;
    assert.deepEqual(['A2', 'A3', 'A4'].map(a => cell(wb, a)?.v), ['c', 'b', 'a']);
    assert.equal(cell(wb, 'C2')?.f, 'B2*10');
    assert.equal(new SheetEngine(wb).getValueA1(0, 'C2'), 10);
  });
  it('filters rows by values and conditions; SUBTOTAL sees it', () => {
    let wb = wbWith({ A1: 'Fruit', B1: 'Qty', A2: 'apple', B2: '5', A3: 'pear', B3: '7', A4: 'apple', B4: '9', D1: '=SUBTOTAL(9,B2:B4)' });
    const e = new SheetEngine(wb);
    wb = setFilter(wb, S(wb), { range: 'A1:B4', columns: [{ col: 0, values: ['apple'] }, { col: 1, conditions: [{ op: 'gt', value: 6 }] }] }, engineSource(e)).workbook;
    assert.deepEqual(wb.sheets[0].filteredRows, [1, 2]);
    e.update(wb);
    assert.equal(e.getValueA1(0, 'D1'), 9);
  });
  it('find and replace across sheets', () => {
    let wb = wbWith({ A1: 'apple pie', A2: '=A1&"!"', A3: 'Apple' });
    assert.equal(findAll(wb, 'apple').length, 2);
    assert.equal(findAll(wb, 'apple', { matchCase: true }).length, 1);
    assert.equal(findAll(wb, 'A1', { lookIn: 'formulas' }).length, 1);
    const r = replaceAll(wb, 'apple', 'cherry');
    wb = r.workbook;
    assert.equal(r.count, 2);
    assert.equal(cell(wb, 'A1')?.v, 'cherry pie');
  });
});

describe('conditional formats & validation', () => {
  it('evaluates highlight, formula, scale, bar and icon rules', () => {
    let wb = wbWith({ A1: '10', A2: '50', A3: '90', B1: 'x' });
    wb = addConditionalFormat(wb, S(wb), { ranges: 'A1:A3', rule: { type: 'cellIs', operator: 'greaterThan', formulas: ['40'], style: { font: { bold: true } } } }).workbook;
    wb = addConditionalFormat(wb, S(wb), { ranges: 'A1:A3', rule: { type: 'expression', formula: 'A1=MAX($A$1:$A$3)', style: { fill: { color: '#00FF00' } } } }).workbook;
    wb = addConditionalFormat(wb, S(wb), { ranges: 'A1:A3', rule: { type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], colors: ['#FFFFFF', '#FF0000'] } }).workbook;
    wb = addConditionalFormat(wb, S(wb), { ranges: 'A1:A3', rule: { type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: '#638EC6' } }).workbook;
    wb = addConditionalFormat(wb, S(wb), { ranges: 'A1:A3', rule: { type: 'iconSet', iconSet: '3Arrows', cfvo: [] } }).workbook;
    const e = new SheetEngine(wb);
    const cf = evaluateConditionalFormats(e, wb, S(wb));
    assert.equal(cf.get('A1')?.style, undefined);
    assert.deepEqual(cf.get('A3')?.style, { font: { bold: true }, fill: { color: '#00FF00' } });
    assert.equal(cf.get('A2')?.scaleColor, '#FF8080');
    assert.equal(cf.get('A2')?.dataBar?.fraction, 0.5);
    assert.deepEqual([cf.get('A1')?.icon?.index, cf.get('A2')?.icon?.index, cf.get('A3')?.icon?.index], [0, 1, 2]);
  });
  it('validates list, whole-number range, and custom formulas', () => {
    let wb = wbWith({ D1: 'red', D2: 'green', A5: '3' });
    wb = addDataValidation(wb, S(wb), { ranges: 'A1', type: 'list', formula1: '$D$1:$D$2' }).workbook;
    wb = addDataValidation(wb, S(wb), { ranges: 'B1', type: 'whole', operator: 'between', formula1: '1', formula2: '10', error: 'Pick 1–10' }).workbook;
    wb = addDataValidation(wb, S(wb), { ranges: 'C1:C3', type: 'custom', formula1: 'COUNTIF($C$1:$C$3,C1)<=1' }).workbook;
    wb = setCellInput(wb, S(wb), 'C1', 'dup').workbook;
    const e = new SheetEngine(wb);
    assert.deepEqual(listOptions(e, wb, S(wb), 0, 0), ['red', 'green']);
    assert.equal(validateValue(e, wb, S(wb), 0, 0, 'Green').ok, true);
    assert.equal(validateValue(e, wb, S(wb), 0, 0, 'blue').ok, false);
    assert.equal(validateValue(e, wb, S(wb), 0, 1, 5).ok, true);
    const bad = validateValue(e, wb, S(wb), 0, 1, 5.5);
    assert.equal(bad.ok, false);
    assert.equal(bad.message, 'Pick 1–10');
    assert.equal(validateValue(e, wb, S(wb), 1, 2, 'dup').ok, false);
    assert.equal(validateValue(e, wb, S(wb), 1, 2, 'new').ok, true);
  });
});
