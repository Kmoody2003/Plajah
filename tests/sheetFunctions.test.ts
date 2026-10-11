import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { functionCount, listFunctions, suggestFunctions } from '../services/tela/sheet';
import { CASES, approxEqual, makeEvaluator, normalize } from './sheetFixtures';

describe('sheet functions — Excel-verified results', () => {
  const ev = makeEvaluator();
  const cats = [...new Set(CASES.map(c => c[2]))];
  for (const cat of cats) {
    it(`${cat} (${CASES.filter(c => c[2] === cat).length} cases)`, () => {
      const failures: string[] = [];
      for (const [f, exp] of CASES.filter(c => c[2] === cat)) {
        const got = normalize(ev(f));
        if (!approxEqual(got, exp)) failures.push(`=${f} → ${JSON.stringify(got)} (Excel: ${JSON.stringify(exp)})`);
      }
      assert.deepEqual(failures, []);
    });
  }
});

describe('function registry', () => {
  it('has well over 250 functions with metadata', () => {
    assert.ok(functionCount() >= 250, `only ${functionCount()}`);
    for (const f of listFunctions()) {
      assert.ok(f.desc.length > 3, `${f.name} has no description`);
      assert.ok(f.min <= f.max, `${f.name} arity`);
    }
  });
  it('autocompletes by prefix', () => {
    const s = suggestFunctions('xl').map(f => f.name);
    assert.ok(s.includes('XLOOKUP'));
    assert.ok(suggestFunctions('sumi').every(f => f.name.startsWith('SUMI')));
  });
  it('covers every category in the brief', () => {
    const names = new Set(listFunctions().map(f => f.name));
    for (const n of ['SUMIFS', 'SUBTOTAL', 'AGGREGATE', 'SEQUENCE', 'MMULT', 'MINVERSE', 'MDETERM', 'RANDARRAY', 'AVERAGEIFS', 'MODE.MULT', 'PERCENTILE.EXC', 'RANK.AVG', 'LINEST', 'GROWTH', 'NORM.DIST', 'T.DIST', 'BINOM.DIST', 'POISSON.DIST', 'EXPON.DIST', 'CHISQ.TEST',
      'IFS', 'SWITCH', 'LET', 'LAMBDA', 'MAP', 'REDUCE', 'BYROW', 'XLOOKUP', 'XMATCH', 'OFFSET', 'INDIRECT', 'FILTER', 'SORTBY', 'UNIQUE', 'TRANSPOSE', 'TEXTJOIN', 'TEXTSPLIT', 'TEXTBEFORE', 'NUMBERVALUE', 'UNICHAR',
      'NETWORKDAYS.INTL', 'WORKDAY.INTL', 'YEARFRAC', 'DATEDIF', 'ISOWEEKNUM', 'XNPV', 'XIRR', 'CUMIPMT', 'CUMPRINC', 'VDB', 'ISFORMULA', 'ERROR.TYPE', 'CELL', 'DSUM'])
      assert.ok(names.has(n), `missing ${n}`);
  });
});
