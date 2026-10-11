import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ERR, SheetEngine, addSheet, createWorkbook, engineForGrid, fromLegacyGrid, insertRows, migrateLegacyFormula, renameSheet, setCellInput, setCellInputs, setName,
  workbookFromGrid, setRowsHidden, addTable, getCellA1, type Workbook,
} from '../services/tela/sheet';

function wbWith(cells: Record<string, string>): Workbook {
  let wb = createWorkbook();
  wb = setCellInputs(wb, wb.sheets[0].id, Object.entries(cells)).workbook;
  return wb;
}
const S0 = (wb: Workbook) => wb.sheets[0].id;

describe('engine: dependency graph and recalc', () => {
  it('recalculates only what depends on an edit', () => {
    let wb = wbWith({ A1: '1', A2: '2', B1: '=A1*10', B2: '=A2*10', C1: '=SUM(B1:B2)', D1: '=SUM(A:A)' });
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'C1'), 30);
    assert.equal(e.getValueA1(0, 'D1'), 3);
    wb = setCellInput(wb, S0(wb), 'A1', '5').workbook;
    const st = e.update(wb);
    assert.equal(e.getValueA1(0, 'B1'), 50);
    assert.equal(e.getValueA1(0, 'C1'), 70);
    assert.equal(e.getValueA1(0, 'D1'), 7);
    assert.equal(st.computed, 3, 'B1, C1, D1 — not B2');
  });
  it('handles 50k-long chains in both directions without stack overflow', () => {
    const wb = createWorkbook();
    const c = wb.sheets[0].cells;
    for (let r = 0; r < 50000; r++) c[r] = { 0: r === 0 ? { v: 1 } : { f: `A${r}+1` }, 1: r === 49999 ? { v: 1 } : { f: `B${r + 2}+1` } };
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'A50000'), 50000);
    assert.equal(e.getValueA1(0, 'B1'), 50000);
  });
  it('detects circular references and reports them', () => {
    const e = new SheetEngine(wbWith({ A1: '=B1+1', B1: '=A1+1', C1: '=A1*2' }));
    assert.equal(e.getValueA1(0, 'A1'), 0);
    assert.equal(e.getValueA1(0, 'C1'), 0);
    assert.deepEqual(e.getCircularRefs().map(x => x.a1).sort(), ['A1', 'B1']);
  });
  it('iterates circular references when iterative calc is on', () => {
    const wb = wbWith({ A1: '=B1/2+1', B1: '=A1' });
    const e = new SheetEngine({ ...wb, calc: { iterative: true, maxIterations: 200, maxChange: 1e-9 } });
    assert.ok(Math.abs((e.getValueA1(0, 'A1') as number) - 2) < 1e-6);
  });
  it('recomputes volatile functions every recalc', () => {
    let n = 0;
    const e = new SheetEngine(wbWith({ A1: '=RAND()', B1: '=A1*2' }), { random: () => ++n / 10 });
    const first = e.getValueA1(0, 'B1');
    e.recalc();
    assert.notEqual(e.getValueA1(0, 'B1'), first);
  });
});

describe('engine: dynamic arrays', () => {
  it('spills, blocks with #SPILL!, and re-spills when cleared', () => {
    let wb = wbWith({ A1: '=SEQUENCE(3)', C1: '=SUM(A1#)', D1: '=A2*100' });
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'A3'), 3);
    assert.equal(e.getValueA1(0, 'C1'), 6);
    assert.equal(e.getValueA1(0, 'D1'), 200);
    assert.deepEqual(e.getCellInfo(0, 0, 0).spill, { r1: 0, c1: 0, r2: 2, c2: 0 });
    wb = setCellInput(wb, S0(wb), 'A2', 'x').workbook;
    e.update(wb);
    assert.equal(e.getValueA1(0, 'A1'), ERR.SPILL);
    assert.equal(e.getValueA1(0, 'C1'), ERR.SPILL);
    wb = setCellInput(wb, S0(wb), 'A2', '').workbook;
    e.update(wb);
    assert.equal(e.getValueA1(0, 'A2'), 2);
    assert.equal(e.getValueA1(0, 'D1'), 200);
  });
  it('grows a spill and refreshes readers of newly covered cells', () => {
    let wb = wbWith({ A1: '3', B1: '=SEQUENCE(A1)', D1: '=B5' });
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'D1'), 0);
    wb = setCellInput(wb, S0(wb), 'A1', '6').workbook;
    e.update(wb);
    assert.equal(e.getValueA1(0, 'B5'), 5);
    assert.equal(e.getValueA1(0, 'D1'), 5);
  });
  it('a range reference result spills; implicit intersection with @', () => {
    const e = new SheetEngine(wbWith({ A1: '1', A2: '2', A3: '3', B2: '=@A1:A3', C1: '=A1:A3*10' }));
    assert.equal(e.getValueA1(0, 'B2'), 2);
    assert.equal(e.getValueA1(0, 'C3'), 30);
  });
});

describe('engine: sheets, names, tables', () => {
  it('cross-sheet refs, 3D refs and rename', () => {
    let wb = wbWith({ A1: '5' });
    wb = addSheet(wb, 'Data').workbook;
    const data = wb.sheets[1].id;
    wb = setCellInputs(wb, data, [['A1', '7'], ['B1', '=Sheet1!A1+A1']]).workbook;
    wb = setCellInput(wb, S0(wb), 'B1', '=SUM(Sheet1:Data!A1)').workbook;
    let e = new SheetEngine(wb);
    assert.equal(e.getValueA1(1, 'B1'), 12);
    assert.equal(e.getValueA1(0, 'B1'), 12);
    wb = renameSheet(wb, data, 'My Data').workbook;
    assert.equal(getCellA1(wb.sheets[0].cells, "B1")!.f, "SUM('Sheet1:My Data'!A1)"); // Excel quotes the whole 3D span
    e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'B1'), 12);
  });
  it('defined names (ranges, constants, LAMBDA functions)', () => {
    let wb = wbWith({ A1: '2', A2: '3', B1: '=SUM(Nums)*Rate', B2: '=Double(A2)' });
    wb = setName(wb, { name: 'Nums', ref: 'Sheet1!$A$1:$A$2' }).workbook;
    wb = setName(wb, { name: 'Rate', ref: '0.5' }).workbook;
    wb = setName(wb, { name: 'Double', ref: 'LAMBDA(x,x*2)' }).workbook;
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'B1'), 2.5);
    assert.equal(e.getValueA1(0, 'B2'), 6);
    wb = setCellInput(wb, S0(wb), 'A1', '10').workbook;
    e.update(wb);
    assert.equal(e.getValueA1(0, 'B1'), 6.5);
  });
  it('structured table references', () => {
    let wb = wbWith({ A1: 'Item', B1: 'Qty', A2: 'a', B2: '2', A3: 'b', B3: '5', D1: '=SUM(Sales[Qty])', D2: '=ROWS(Sales[#All])' });
    wb = addTable(wb, S0(wb), 'A1:B3', 'Sales').workbook;
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'D1'), 7);
    assert.equal(e.getValueA1(0, 'D2'), 3);
  });
  it('SUBTOTAL ignores hidden rows (109) after a hide op', () => {
    let wb = wbWith({ A1: '1', A2: '2', A3: '3', B1: '=SUBTOTAL(109,A1:A3)', B2: '=SUBTOTAL(9,A1:A3)' });
    const e = new SheetEngine(wb);
    wb = setRowsHidden(wb, S0(wb), [1], true).workbook;
    e.update(wb);
    assert.equal(e.getValueA1(0, 'B1'), 4);
    assert.equal(e.getValueA1(0, 'B2'), 6);
  });
  it('insert rows keeps formulas pointing at the same data', () => {
    let wb = wbWith({ A1: '1', A2: '2', A3: '=SUM(A1:A2)' });
    wb = insertRows(wb, S0(wb), 1, 2).workbook;
    assert.equal(getCellA1(wb.sheets[0].cells, "A5")!.f, 'SUM(A1:A4)');
    const e = new SheetEngine(wb);
    assert.equal(e.getValueA1(0, 'A5'), 3);
  });
  it('reports precedents and dependents', () => {
    const e = new SheetEngine(wbWith({ A1: '1', B1: '=A1+SUM(C1:C3)' }));
    assert.deepEqual(e.getPrecedents(0, 0, 1).sort(), ['A1', 'C1:C3']);
    assert.deepEqual(e.getDependents(0, 1, 2).map(d => d.a1), ['B1']);
  });
});

describe('engine: Tela bindings (legacy grids + bases)', () => {
  const base = { fields: [{ id: 'f1', name: 'price', type: 'NUMBER' }, { id: 'f2', name: 'sku', type: 'TEXT' }], rows: [{ values: { f1: '10', f2: 'a' } }, { values: { f1: '5', f2: 'b' } }, { values: { f1: '', f2: 'c' } }] };
  const other = { rows: 5, cols: 5, cells: { A1: '7', A2: '=A1*2' } };
  const ctx = { resolveGrid: (n: string) => (n.toLowerCase() === 'sheet2' || n.toLowerCase() === 'my grid' ? other : null), resolveBase: (n: string) => (n.toLowerCase() === 'orders' || n.toLowerCase() === 'my orders' ? base : null) };
  it('keeps =GridName!A1, =SUM(Base.field), =COUNT(Base) working', () => {
    const e = engineForGrid({ rows: 5, cols: 5, cells: { A1: '=Sheet2!A2+1', A2: '=SUM(Orders.price)', A3: '=COUNT(Orders)', A4: '=COUNT(Orders.price)', A5: '=AVG(Orders.price)', B1: "=XLOOKUP(\"b\",Orders.sku,Orders.price)", B2: '=SUM(Orders[price])' } }, ctx);
    assert.equal(e.getValueA1(0, 'A1'), 15);
    assert.equal(e.getValueA1(0, 'A2'), 15);
    assert.equal(e.getValueA1(0, 'A3'), 3);
    assert.equal(e.getValueA1(0, 'A4'), 2);
    assert.equal(e.getValueA1(0, 'A5'), 7.5);
    assert.equal(e.getValueA1(0, 'B1'), 5);
    assert.equal(e.getValueA1(0, 'B2'), 15);
  });
  it('migrates legacy names with spaces', () => {
    assert.equal(migrateLegacyFormula('My Grid!A1+1'), "'My Grid'!A1+1");
    assert.equal(migrateLegacyFormula('SUM(My Orders.price)'), 'SUM(My_Orders[price])');
    const e = engineForGrid({ rows: 2, cols: 2, cells: { A1: '=My Grid!A1', A2: '=SUM(My Orders.price)' } }, ctx);
    assert.equal(e.getValueA1(0, 'A1'), 7);
    assert.equal(e.getValueA1(0, 'A2'), 15);
  });
  it('legacy grids migrate to a workbook (numbers typed, text kept)', () => {
    const wb = fromLegacyGrid({ rows: 3, cols: 3, cells: { A1: '12', A2: '$5', A3: '=A1*2' } });
    assert.deepEqual(getCellA1(wb.sheets[0].cells, "A1")!, { v: 12 });
    assert.deepEqual(getCellA1(wb.sheets[0].cells, "A2")!, { v: '$5' });
    assert.deepEqual(getCellA1(wb.sheets[0].cells, "A3")!, { f: 'A1*2' });
    assert.equal(workbookFromGrid({ rows: 1, cols: 1, cells: {}, workbook: wb }), wb);
  });
});
