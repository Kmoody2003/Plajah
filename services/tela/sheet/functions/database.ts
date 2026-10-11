// database — the D-functions (DSUM, DAVERAGE, …) over a header-row database
// and a criteria range (rows are OR'd, columns AND'd; plain text matches as
// "begins with", like Excel's advanced-filter criteria).

import { compareScalars, makeCriterion, scalarOf, toMatrix, type Frame } from '../coerce';
import { CellError, ERR, type Scalar, type Value, isErr } from '../values';
import { def } from './registry';
import * as st from './statcore';

function selectRows(a: Value[], f: Frame): { values: Scalar[] } | CellError {
  const db = toMatrix(a[0], f); if (isErr(db)) return db;
  const crit = toMatrix(a[2], f); if (isErr(crit)) return crit;
  if (db.rows < 1 || crit.rows < 1) return ERR.VALUE;
  const headers = db.data[0].map(h => String(h ?? '').trim().toLowerCase());
  const fieldV = scalarOf(a[1], f);
  let fieldIdx = -1;
  if (typeof fieldV === 'number') fieldIdx = Math.trunc(fieldV) - 1;
  else if (typeof fieldV === 'string') fieldIdx = headers.indexOf(fieldV.trim().toLowerCase());
  else if (fieldV instanceof CellError) return fieldV;
  if (fieldIdx < 0 || fieldIdx >= headers.length) return ERR.VALUE;
  const critHeaders = crit.data[0].map(h => headers.indexOf(String(h ?? '').trim().toLowerCase()));
  const critRows = crit.data.slice(1).map(row => row.map((c, j) => {
    if (c === null || c === '') return null;
    if (critHeaders[j] < 0) return () => false;
    let pred: (v: Scalar) => boolean;
    if (typeof c === 'string' && !/^(<=|>=|<>|<|>|=)/.test(c)) { const p = makeCriterion(c + '*'); pred = v => typeof v === 'string' ? p(v) : makeCriterion(c)(v); }
    else pred = makeCriterion(c);
    return (row: Scalar[]) => pred(row[critHeaders[j]]);
  }).filter(Boolean) as ((row: Scalar[]) => boolean)[]);
  const values: Scalar[] = [];
  for (const row of db.data.slice(1)) {
    const ok = critRows.length === 0 || critRows.some(preds => preds.every(p => p(row)));
    if (ok) values.push(row[fieldIdx]);
  }
  return { values };
}
const numsOf = (v: Scalar[]) => v.filter((x): x is number => typeof x === 'number');
function D(name: string, desc: string, fn: (vals: Scalar[]) => Scalar) {
  def(name, 'database', 3, 3, 'database, field, criteria', desc, (a, f) => {
    const r = selectRows(a, f); if (isErr(r)) return r;
    return fn(r.values);
  });
}
D('DSUM', 'Sum of matching records.', v => st.sum(numsOf(v)));
D('DAVERAGE', 'Average of matching records.', v => { const n = numsOf(v); return n.length ? st.mean(n) : ERR.DIV0; });
D('DCOUNT', 'Count of numbers in matching records.', v => numsOf(v).length);
D('DCOUNTA', 'Count of non-empty matching records.', v => v.filter(x => x !== null && x !== '').length);
D('DMAX', 'Maximum of matching records.', v => { const n = numsOf(v); return n.length ? Math.max(...n) : 0; });
D('DMIN', 'Minimum of matching records.', v => { const n = numsOf(v); return n.length ? Math.min(...n) : 0; });
D('DPRODUCT', 'Product of matching records.', v => { const n = numsOf(v); return n.length ? n.reduce((p, x) => p * x, 1) : 0; });
D('DGET', 'Single matching record.', v => (v.length === 0 ? ERR.VALUE : v.length > 1 ? ERR.NUM : v[0] ?? 0));
D('DSTDEV', 'Sample standard deviation of matching records.', v => { const n = numsOf(v); return n.length < 2 ? ERR.DIV0 : Math.sqrt(st.varS(n)); });
D('DSTDEVP', 'Population standard deviation of matching records.', v => { const n = numsOf(v); return n.length < 1 ? ERR.DIV0 : Math.sqrt(st.varP(n)); });
D('DVAR', 'Sample variance of matching records.', v => { const n = numsOf(v); return n.length < 2 ? ERR.DIV0 : st.varS(n); });
D('DVARP', 'Population variance of matching records.', v => { const n = numsOf(v); return n.length < 1 ? ERR.DIV0 : st.varP(n); });

export { compareScalars };
