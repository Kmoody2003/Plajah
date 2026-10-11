import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adjustForStructural, copyFormula, parseFormula, r1c1ToA1, toFormula, tokenize, transformFormula, tryParseFormula } from '../services/tela/sheet';

const rt = (f: string) => toFormula(parseFormula(f));

describe('formula parser', () => {
  it('round-trips the grammar', () => {
    for (const f of [
      'SUM(A1:B2)', '$A$1+A$2*$B3', "'My Sheet'!A1:B2", 'Sheet1:Sheet3!A1', 'A:A', '$1:$3', 'A1#', '{1,2;3,-4}', '{"a",TRUE,#N/A}',
      'IF(A1,,2)', 'LAMBDA(x,x+1)(2)', 'LET(a,1,b,a*2,a+b)', 'Table1[Qty]', 'Table1[[#Data],[Qty]:[Price]]', 'Table1[@Qty]', '-A1%', 'A1:A3 A2:C2', 'SUM((A1,B2))',
      '@A1:A3', '"a ""quoted"" text"', '1E+21', '_xlfn.XLOOKUP(1,A:A,B:B)'.replace('_xlfn.', ''), 'Orders.price', 'COUNT(Orders)',
    ]) assert.equal(rt(f), f);
  });
  it('applies Excel precedence', () => {
    const p = (f: string) => JSON.stringify(parseFormula(f));
    // unary minus binds tighter than ^
    assert.match(p('-2^2'), /"op":"\^","a":\{"t":"unary"/);
    // ^ is left-associative
    assert.match(p('2^3^2'), /^\{"t":"bin","op":"\^","a":\{"t":"bin","op":"\^"/);
    // & below +, comparison lowest
    assert.match(p('1+2&3=4'), /^\{"t":"bin","op":"=","a":\{"t":"bin","op":"&"/);
    // % above *
    assert.match(p('2*3%'), /"op":"\*".*"t":"postfix","op":"%"/);
  });
  it('strips OOXML prefixes and keeps names vs refs apart', () => {
    assert.equal(rt('_xlfn.XLOOKUP(1,A1:A2,B1:B2)'), 'XLOOKUP(1,A1:A2,B1:B2)');
    const n = parseFormula('Tax2024Rate+LOG10(100)+Q1Total');
    assert.equal(toFormula(n), 'Tax2024Rate+LOG10(100)+Q1Total');
    assert.equal((parseFormula('TAX2024') as { t: string }).t, 'ref'); // a valid cell (col TAX)
  });
  it('reports parse errors with a position', () => {
    const r = tryParseFormula('SUM(1,');
    assert.ok('error' in r);
    assert.ok('error' in tryParseFormula('1+'));
  });
  it('tokenizes with positions for the formula bar', () => {
    const t = tokenize('SUM(A1, Sheet2!B$3)');
    assert.deepEqual(t.filter(x => x.type !== 'ws').map(x => [x.type, x.text]), [['func', 'SUM'], ['lparen', '('], ['ref', 'A1'], ['comma', ','], ['sheet', 'Sheet2!'], ['ref', 'B$3'], ['rparen', ')']]);
    assert.equal(t[2].start, 4);
  });
});

describe('reference shifting', () => {
  it('copies relative and keeps absolute parts', () => {
    assert.equal(copyFormula('A1+$A$1+A$1+$A1', 2, 1), 'B3+$A$1+B$1+$A3');
    assert.equal(copyFormula('SUM(A1:B2)', 1, 0), 'SUM(A2:B3)');
    assert.equal(copyFormula('A1', -1, 0), '#REF!');
    assert.equal(copyFormula('SUM(A:A)', 5, 1), 'SUM(B:B)');
  });
  it('inserts and deletes rows/cols with #REF! for deleted cells', () => {
    const ins = (f: string) => transformFormula(f, n => adjustForStructural(n, { kind: 'insertRows', at: 2, count: 2 }, 'Sheet1', 'Sheet1'));
    assert.equal(ins('A1+A3+SUM(A1:A5)+SUM(A3:A4)'), 'A1+A5+SUM(A1:A7)+SUM(A5:A6)');
    const del = (f: string) => transformFormula(f, n => adjustForStructural(n, { kind: 'deleteRows', at: 2, count: 2 }, 'Sheet1', 'Sheet1'));
    assert.equal(del('A3'), '#REF!');
    assert.equal(del('A5+SUM(A1:A5)+SUM(A3:A4)'), 'A3+SUM(A1:A3)+SUM(#REF!)');
    const delc = (f: string) => transformFormula(f, n => adjustForStructural(n, { kind: 'deleteCols', at: 0, count: 1 }, 'Data', 'Sheet1'));
    assert.equal(delc('Data!B1+A1+Data!A1'), 'Data!A1+A1+Data!#REF!');
  });
  it('converts R1C1 (Google Sheets clipboard)', () => {
    assert.equal(r1c1ToA1('R[0]C[-1]*2+R1C1+SUM(R[-2]C:R[-1]C)', 4, 3), 'C5*2+$A$1+SUM(D3:D4)');
  });
});
