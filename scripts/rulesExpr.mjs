// A small expression parser/printer for Firestore rules conditions, used by compactRules.mjs.
// Works on the token objects from compactRules' tokenizer ({ ws, t, k }). Path literals
// (`/databases/$(database)/…` inside get()/exists() and friends) are kept as opaque token spans.

const BIN = [['||'], ['&&'], ['==', '!=', 'in', 'is'], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];

export function parseExpr(toks, start, stopAt) {
  let i = start;
  const peek = () => toks[i];
  const at = (t) => toks[i] && toks[i].t === t;
  const stop = () => !toks[i] || stopAt(toks[i]);

  function primary() {
    const x = toks[i];
    if (!x) throw new Error('unexpected end');
    if (x.t === '(') {
      i++; const e = ternary();
      if (!at(')')) throw new Error('expected )');
      i++; return { type: 'group', e };
    }
    if (x.t === '[') {
      i++; const items = [];
      while (!at(']')) { items.push(ternary()); if (at(',')) i++; }
      i++; return { type: 'list', items };
    }
    if (x.t === '{') {
      i++; const entries = [];
      while (!at('}')) { const k = ternary(); if (!at(':')) throw new Error('expected :'); i++; const v = ternary(); entries.push([k, v]); if (at(',')) i++; }
      i++; return { type: 'map', entries };
    }
    if (x.t === '/') {                       // path literal: opaque until a depth-0 ')' or ','
      const s = i; let d = 0;
      for (; i < toks.length; i++) {
        if (toks[i].t === '(') d++;
        else if (toks[i].t === ')') { if (d === 0) break; d--; }
        else if (toks[i].t === ',' && d === 0) break;
      }
      return { type: 'path', toks: toks.slice(s, i) };
    }
    if (x.t === '!' || x.t === '-') { i++; return { type: 'unary', op: x.t, e: postfix(primary()) }; }
    if (x.k === 'id' || x.k === 's' || x.k === 'n') { i++; return { type: x.k === 'id' ? 'id' : 'lit', t: x.t }; }
    throw new Error(`unexpected ${x.t}`);
  }
  function postfix(e) {
    for (;;) {
      if (at('.') && toks[i + 1]?.k === 'id') { i += 2; e = { type: 'member', e, name: toks[i - 1].t }; continue; }
      if (at('[')) {
        i++; const ix = ternary(); let hi = null;
        if (at(':')) { i++; hi = ternary(); }
        if (!at(']')) throw new Error('expected ]'); i++;
        e = { type: 'index', e, ix, hi }; continue;
      }
      if (at('(')) {
        i++; const args = [];
        while (!at(')')) { args.push(ternary()); if (at(',')) i++; }
        i++; e = { type: 'call', e, args }; continue;
      }
      return e;
    }
  }
  function unaryExpr() { return postfix(primary()); }
  function bin(level) {
    if (level === BIN.length) return unaryExpr();
    let l = bin(level + 1);
    while (!stop() && BIN[level].includes(peek().t)) {
      const op = peek().t; i++;
      const r = bin(level + 1);
      l = { type: 'bin', op, l, r };
    }
    return l;
  }
  function ternary() {
    const c = bin(0);
    if (at('?')) { i++; const a = ternary(); if (!at(':')) throw new Error('expected :'); i++; const b = ternary(); return { type: 'cond', c, a, b }; }
    return c;
  }
  const e = ternary();
  return { e, end: i };
}

export function print(e) {
  switch (e.type) {
    case 'group': return `(${print(e.e)})`;
    case 'list': return `[${e.items.map(print).join(', ')}]`;
    case 'map': return `{${e.entries.map(([k, v]) => `${print(k)}: ${print(v)}`).join(', ')}}`;
    case 'path': return e.toks.map(x => x.t).join('');
    case 'unary': return `${e.op}${print(e.e)}`;
    case 'id': case 'lit': return e.t;
    case 'member': return `${print(e.e)}.${e.name}`;
    case 'index': return `${print(e.e)}[${print(e.ix)}${e.hi ? ':' + print(e.hi) : ''}]`;
    case 'call': return `${print(e.e)}(${e.args.map(print).join(', ')})`;
    case 'bin': return `${print(e.l)} ${e.op} ${print(e.r)}`;
    case 'cond': return `${print(e.c)} ? ${print(e.a)} : ${print(e.b)}`;
  }
  throw new Error('print: ' + e.type);
}

/** Node count, the unit the compiler charges for (roughly). */
export function weight(e) {
  switch (e.type) {
    case 'group': return weight(e.e);
    case 'list': return 1 + e.items.reduce((a, x) => a + weight(x), 0);
    case 'map': return 1 + e.entries.reduce((a, [k, v]) => a + weight(k) + weight(v), 0);
    case 'path': return e.toks.length;
    case 'unary': return 1 + weight(e.e);
    case 'id': case 'lit': return 1;
    case 'member': return 1 + weight(e.e);
    case 'index': return 1 + weight(e.e) + weight(e.ix) + (e.hi ? weight(e.hi) : 0);
    case 'call': return 1 + weight(e.e) + e.args.reduce((a, x) => a + weight(x), 0);
    case 'bin': return 1 + weight(e.l) + weight(e.r);
    case 'cond': return 1 + weight(e.c) + weight(e.a) + weight(e.b);
  }
  return 1;
}

/** Visit every sub-expression (pre-order). */
export function walk(e, fn, parent = null) {
  fn(e, parent);
  const kids = e.type === 'group' || e.type === 'unary' ? [e.e]
    : e.type === 'list' ? e.items
      : e.type === 'map' ? e.entries.flat()
        : e.type === 'member' ? [e.e]
          : e.type === 'index' ? [e.e, e.ix, e.hi].filter(Boolean)
            : e.type === 'call' ? [e.e, ...e.args]
              : e.type === 'bin' ? [e.l, e.r]
                : e.type === 'cond' ? [e.c, e.a, e.b] : [];
  for (const k of kids) walk(k, fn, e);
}
