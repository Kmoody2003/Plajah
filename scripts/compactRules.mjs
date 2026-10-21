// compactRules — shrinks the *compiled* size of a minified Firestore rules file without changing what
// it allows. Firebase caps a released ruleset at 256,000 compiled bytes (separate from the 256 KiB
// source cap minifyRules handles). Measured on this project's rules (2026-10-21):
//   • calls are NOT inlined — a helper's body is compiled once, each call costs a few bytes;
//   • every identifier / literal character costs ~1 byte at every use; whitespace is free;
//   • each member access (a.b) costs ~7 bytes + its name.
// So this pass hoists the most repeated access chains into zero-arg helpers and shortens names.
// Every transform is a pure alias (a helper's body is exactly the text it replaced, so it yields the
// same value or the same error), and `expandRules` undoes all of them; tests/compactRules.test.ts
// checks expand(compact(x)) == x token-for-token on the real firestore.rules.
//
// Transforms, in order:
//   1. request.resource.data.diff(resource.data).affectedKeys()  → helper
//   2. get/exists/getAfter/existsAfter(/databases/$(database)/documents/<segments>) → helper(segments…)
//   3. request.resource.data.<f> / resource.data.<f> used ≥8×  → one getter per field
//      remaining request.resource.data / resource.data / request.auth.uid  → helpers
//   4. string literals ≥8 chars used ≥3× (never map keys)  → helpers
//   5. every function gets a short name (same name → same short name, so scoping is unchanged)
//   6. match wildcards and function parameters get short names, per declaration, scope-aware
//   7. the 120 most valuable sub-expressions repeated across conditions → helpers with ≤2 parameters. Only wildcard/param
//      variables and string literals become arguments (they always evaluate cleanly, so moving them
//      ahead of a short-circuit changes nothing); anything calling a function defined in a nested
//      match is left alone, since a top-level helper could resolve that name differently.
//   8. identical-condition allows in one block are merged, and `allow …: if false;` is dropped.
// The readable firestore.rules is never touched; only the deploy artifact is compacted.

import { parseExpr, print, weight, walk } from './rulesExpr.mjs';

const KEYWORDS = new Set(['rules_version', 'service', 'match', 'allow', 'if', 'function', 'return', 'let', 'true', 'false', 'null',
  'in', 'is', 'request', 'resource', 'database', 'math', 'timestamp', 'duration', 'latlng', 'hashing', 'path', 'debug', 'int', 'float',
  'string', 'bool', 'bytes', 'list', 'map', 'number', 'constraint', 'get', 'exists', 'getAfter', 'existsAfter', 'cloud', 'firestore',
  'read', 'write', 'create', 'update', 'delete', 'list', 'documents', 'databases']);
// Never generate a word the rules language (or its JS-style grammar) reserves.
const RESERVED = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'do', 'else', 'enum', 'export', 'extends',
  'finally', 'for', 'if', 'import', 'in', 'instanceof', 'is', 'let', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'static',
  'await', 'async', 'of', 'fn', 'func', 'def', 'del', 'not', 'and', 'or', 'as', 'from', 'end', 'nil', 'now', 'size']);

// ── tokenizer: keeps the whitespace before each token so output preserves line structure ───────────
function tokenize(src) {
  const toks = [];
  let i = 0, ws = '';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { ws += c; i++; continue; }
    let j = i + 1, kind = 'p';
    if (c === '"' || c === "'") {
      kind = 's';
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      j++;
    } else if (/[A-Za-z_]/.test(c)) {
      kind = 'id';
      while (j < n && /\w/.test(src[j])) j++;
    } else if (/\d/.test(c)) {
      kind = 'n';
      while (j < n && /[\d.]/.test(src[j])) j++;
    } else {
      const two = src.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) j = i + 2;
    }
    toks.push({ ws, t: src.slice(i, j), k: kind });
    ws = ''; i = j;
  }
  return { toks, tail: ws };
}
const emit = ({ toks, tail }) => toks.map(x => x.ws + x.t).join('') + tail;
const T = (t, ws = '') => ({ ws, t, k: /^[A-Za-z_]/.test(t) ? 'id' : /^["']/.test(t) ? 's' : 'p' });

function seqAt(toks, i, words) {
  for (let k = 0; k < words.length; k++) if (!toks[i + k] || toks[i + k].t !== words[k]) return false;
  return true;
}
const prevIs = (toks, i, t) => i > 0 && toks[i - 1].t === t;
function closeParen(toks, open) {
  let d = 0;
  for (let k = open; k < toks.length; k++) {
    if (toks[k].t === '(') d++;
    else if (toks[k].t === ')') { d--; if (d === 0) return k; }
  }
  return -1;
}

const RRD = ['request', '.', 'resource', '.', 'data'];
const RD = ['resource', '.', 'data'];
const UID = ['request', '.', 'auth', '.', 'uid'];
const DIFF = ['request', '.', 'resource', '.', 'data', '.', 'diff', '(', 'resource', '.', 'data', ')', '.', 'affectedKeys', '(', ')'];
const PATH = ['/', 'databases', '/', '$', '(', 'database', ')', '/', 'documents', '/'];

// Defaults measured against the live Rules service (2026-10-21): many more parameterized helpers
// than this makes ruleset creation time out with 503s, fewer leaves the ruleset over the cap.
const DEFAULTS = { maxTemplates: 120, maxParams: 2, minGetterUses: 8 };

export function compactRules(src, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const skip = new Set(opts.skip || []);
  const doc = tokenize(src);
  let toks = doc.toks;
  const allIds = new Set(toks.filter(x => x.k === 'id').map(x => x.t));
  const helpers = [];            // { name, params, body } — defined at the top of the documents match
  const used = new Set();
  const fresh = (base) => { let s = base, k = 0; while (allIds.has(s) || used.has(s)) s = `${base}${++k}`; used.add(s); return s; };
  const call = (name, ws, args = []) => {
    const out = [T(name, ws), T('(')];
    args.forEach((a, i) => { if (i) out.push(T(',')); out.push(...a); });
    out.push(T(')'));
    return out;
  };
  const replaceAll = (match) => {   // match(toks, i) → { len, rep } | null
    const out = [];
    for (let i = 0; i < toks.length;) {
      const m = match(toks, i);
      if (m) { out.push(...m.rep); i += m.len; } else { out.push(toks[i]); i++; }
    }
    toks = out;
  };

  // 1. affectedKeys diff
  const hDiff = fresh('cDiff');
  let nDiff = 0;
  replaceAll((ts, i) => (!prevIs(ts, i, '.') && seqAt(ts, i, DIFF) ? (nDiff++, { len: DIFF.length, rep: call(hDiff, ts[i].ws) }) : null));
  if (nDiff) helpers.push({ name: hDiff, params: [], body: DIFF.join('').replace(/\./g, '.') });

  // 2. document paths: fn(/databases/$(database)/documents/<seg>/<seg>/…) → helper(seg, seg, …),
  //    one helper per (fn, segment count). A literal segment travels as a string and is
  //    interpolated back as $(…), which builds the identical path.
  const pathHelpers = new Map();
  replaceAll((ts, i) => {
    const fn = ts[i].t;
    if (skip.has('paths')) return null;
    if (!['get', 'exists', 'getAfter', 'existsAfter'].includes(fn) || prevIs(ts, i, '.') || ts[i + 1]?.t !== '(') return null;
    if (skip.has('after') && fn.endsWith('After')) return null;
    if (!seqAt(ts, i + 2, PATH)) return null;
    const segs = [];
    let k = i + 2 + PATH.length;
    for (;;) {
      const x = ts[k];
      if (!x) return null;
      if (x.k === 'id') { segs.push([T(`'${x.t}'`)]); k++; }
      else if (x.t === '$' && ts[k + 1]?.t === '(') {
        const close = closeParen(ts, k + 1);
        if (close < 0) return null;
        const expr = ts.slice(k + 2, close);
        if (!expr.length) return null;
        segs.push(expr.map((y, j) => (j === 0 ? { ...y, ws: '' } : y)));
        k = close + 1;
      } else return null;
      if (ts[k]?.t === '/') { k++; continue; }
      if (ts[k]?.t === ')') break;
      return null;
    }
    const key = `${fn}/${segs.length}`;
    if (!pathHelpers.has(key)) {
      const params = segs.map((_, j) => `s${j}`);
      pathHelpers.set(key, { name: fresh(`cPath_${fn}${segs.length}`), params, body: `${fn}(/databases/$(database)/documents/${params.map(p => `$(${p})`).join('/')})` });
    }
    const h = pathHelpers.get(key);
    return { len: k + 1 - i, rep: call(h.name, ts[i].ws, segs.map((a, j) => (j === 0 ? a : [{ ...a[0], ws: ' ' }, ...a.slice(1)]))) };
  });
  helpers.push(...pathHelpers.values());

  // 3. field getters + base aliases
  for (const [prefix, words, base] of [['cQ', RRD, 'request.resource.data'], ['cR', RD, 'resource.data']]) {
    const counts = new Map();
    for (let i = 0; i < toks.length; i++) {
      if (prevIs(toks, i, '.') || !seqAt(toks, i, words)) continue;
      const dot = toks[i + words.length], f = toks[i + words.length + 1], after = toks[i + words.length + 2];
      if (dot && dot.t === '.' && f && f.k === 'id' && !(after && after.t === '(')) counts.set(f.t, (counts.get(f.t) || 0) + 1);
    }
    const getters = new Map();
    for (const [f, c] of counts) if (c >= (opts.minGetterUses ?? 3)) getters.set(f, fresh(`${prefix}_${f}`));
    replaceAll((ts, i) => {
      if (prevIs(ts, i, '.') || !seqAt(ts, i, words)) return null;
      const dot = ts[i + words.length], f = ts[i + words.length + 1], after = ts[i + words.length + 2];
      if (dot && dot.t === '.' && f && getters.has(f.t) && !(after && after.t === '(')) return { len: words.length + 2, rep: call(getters.get(f.t), ts[i].ws) };
      return null;
    });
    for (const [f, name] of getters) helpers.push({ name, params: [], body: `${base}.${f}` });
    const hBase = fresh(prefix);
    let nBase = 0;
    replaceAll((ts, i) => (!prevIs(ts, i, '.') && seqAt(ts, i, words) ? (nBase++, { len: words.length, rep: call(hBase, ts[i].ws) }) : null));
    if (nBase) helpers.push({ name: hBase, params: [], body: base });
  }
  const hUid = fresh('cUid');
  let nUid = 0;
  replaceAll((ts, i) => (!prevIs(ts, i, '.') && seqAt(ts, i, UID) ? (nUid++, { len: UID.length, rep: call(hUid, ts[i].ws) }) : null));
  if (nUid) helpers.push({ name: hUid, params: [], body: 'request.auth.uid' });

  // 4. repeated long string literals (never a map key)
  const litCount = new Map();
  toks.forEach((x, i) => { if (x.k === 's' && x.t.length >= 10 && !(toks[i + 1] && toks[i + 1].t === ':')) litCount.set(x.t, (litCount.get(x.t) || 0) + 1); });
  const litName = new Map();
  for (const [lit, c] of litCount) if (c >= 3) litName.set(lit, fresh('cLit'));
  replaceAll((ts, i) => (ts[i].k === 's' && litName.has(ts[i].t) && !(ts[i + 1] && ts[i + 1].t === ':') ? { len: 1, rep: call(litName.get(ts[i].t), ts[i].ws) } : null));
  for (const [lit, name] of litName) helpers.push({ name, params: [], body: lit });

  // insert helper definitions right after `match /databases/{database}/documents {`
  const anchor = toks.findIndex((x, i) => x.t === 'match' && seqAt(toks, i + 1, ['/', 'databases', '/', '{', 'database', '}', '/', 'documents', '{']));
  if (anchor < 0) throw new Error('compactRules: documents match not found');
  const defs = tokenize(helpers.map(h => `\nfunction ${h.name}(${h.params.join(', ')}) { return ${h.body}; }`).join('')).toks;
  toks = [...toks.slice(0, anchor + 10), ...defs, ...toks.slice(anchor + 10)];

  // 5. short function names
  const fnNames = new Set();
  toks.forEach((x, i) => { if (x.t === 'function' && toks[i + 1]?.k === 'id') fnNames.add(toks[i + 1].t); });
  const fnUse = new Map([...fnNames].map(n => [n, 0]));
  toks.forEach((x, i) => { if (x.k === 'id' && fnUse.has(x.t) && toks[i + 1]?.t === '(' && !prevIs(toks, i, '.')) fnUse.set(x.t, fnUse.get(x.t) + 1); });
  const fnMap = new Map();
  const gen = mkNames('f', allIds);
  for (const n of [...fnNames].sort((a, b) => fnUse.get(b) * b.length - fnUse.get(a) * a.length)) fnMap.set(n, gen());
  toks = toks.map((x, i) => (x.k === 'id' && fnMap.has(x.t) && toks[i + 1]?.t === '(' && !prevIs(toks, i, '.') ? { ...x, t: fnMap.get(x.t) } : x));

  // 6. scope-aware short names for wildcards and parameters
  const varGen = mkNames('v', new Set([...allIds, ...fnMap.values()]));
  const varMap = new Map();    // short → original (for expand)
  toks = renameScoped(toks, varGen, varMap);

  // 7. parameterized templates
  const templates = [];
  if (!skip.has('templates')) toks = templatize(toks, varMap, templates, new Set([...allIds, ...fnMap.values(), ...varMap.keys()]), opts);

  // 8. merge identical allows, drop no-op ones
  if (!skip.has('allows')) toks = compactAllows(toks);

  return { out: emit({ toks, tail: doc.tail }), meta: { helpers, fnMap, varMap, templates } };
}

function mkNames(prefix, avoid) {
  const a = 'abcdefghijklmnopqrstuvwxyz';
  let i = 0;
  return () => {
    for (;;) {
      let s = '', k = i++ + 1;
      while (k) { k--; s = a[k % 26] + s; k = Math.floor(k / 26); }
      const name = prefix + s;
      if (!avoid.has(name) && !KEYWORDS.has(name) && !RESERVED.has(name)) return name;
    }
  };
}

// Walks the token stream with a scope stack. Scopes open at `match …{` (its {wildcards}) and at
// `function f(params) {` (its params, plus any `let` names, which shadow outer names unchanged).
function renameScoped(toks, gen, varMap) {
  const out = toks.map(x => ({ ...x }));
  const stack = [];           // frames: { depth, names: Map(orig → short|null) }
  let depth = 0;
  const lookup = (name) => { for (let s = stack.length - 1; s >= 0; s--) if (stack[s].names.has(name)) return stack[s].names.get(name); return undefined; };
  let pending = null;         // names for the scope opened by the next '{'
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    if (x.t === 'match') {
      // collect {wildcard} / {wildcard=**} up to the block's '{'
      const names = new Map();
      let j = i + 1;
      for (; j < out.length; j++) {
        if (out[j].t === '{' && out[j - 1].t === '/' ) {
          const w = out[j + 1];
          if (w && w.k === 'id' && w.t !== 'database') { const s = gen(); names.set(w.t, s); varMap.set(s, w.t); w.t = s; }
          while (out[j].t !== '}') j++;
          continue;
        }
        if (out[j].t === '{') break;   // block opener
      }
      pending = names; i = j - 1; continue;
    }
    if (x.t === 'function' && out[i + 1]?.k === 'id' && out[i + 2]?.t === '(') {
      const names = new Map();
      let j = i + 3;
      for (; out[j].t !== ')'; j++) {
        if (out[j].k === 'id') { const s = gen(); names.set(out[j].t, s); varMap.set(s, out[j].t); out[j].t = s; }
      }
      // `let` bindings inside the body shadow outer names and are left as they are
      let d = 0;
      for (let k = j + 1; k < out.length; k++) {
        if (out[k].t === '{') d++;
        else if (out[k].t === '}') { d--; if (d === 0) break; }
        else if (out[k].t === 'let' && out[k + 1]?.k === 'id') names.set(out[k + 1].t, null);
      }
      pending = names; i = j; continue;
    }
    if (x.t === '{') {
      depth++;
      if (pending) { stack.push({ depth, names: pending }); pending = null; }
      continue;
    }
    if (x.t === '}') {
      if (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
      depth--; continue;
    }
    if (x.k === 'id' && !prevIs(out, i, '.') && !prevIs(out, i, '/') && out[i + 1]?.t !== '(') {
      const s = lookup(x.t);
      if (s) x.t = s;
    }
  }
  return out;
}

const GLOBALS = new Set(['request', 'resource', 'database', 'true', 'false', 'null', 'string', 'int', 'float', 'bool', 'bytes',
  'list', 'map', 'number', 'timestamp', 'duration', 'path', 'latlng', 'constraint', 'math', 'hashing']);
const HOLE = (j) => `\u0001${j}\u0001`;
const KIDS = ['e', 'l', 'r', 'c', 'a', 'b', 'ix', 'hi'];
const calleeKids = (n) => (n.type === 'member' ? [n.e] : n.type === 'index' ? [n.e, n.ix, n.hi].filter(Boolean) : []);

// Condition spans inside the documents match: `allow …: if <expr>;` and `return <expr>;`.
// Also reports function names defined in nested matches (templates may not call those).
function exprSpans(toks) {
  const spans = [];
  const nestedFns = new Set();
  let depth = 0, docDepth = -1;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t;
    if (t === 'match' && seqAt(toks, i + 1, ['/', 'databases', '/', '{', 'database', '}', '/', 'documents', '{'])) docDepth = depth + 1;
    if (t === 'function' && toks[i + 1]?.k === 'id' && docDepth > 0 && depth > docDepth) nestedFns.add(toks[i + 1].t);
    if (t === '{') depth++;
    else if (t === '}') depth--;
    if (docDepth < 0 || depth < docDepth) continue;
    let start = -1;
    if (t === 'if') { let k = i - 1; while (k >= 0 && toks[k].t !== 'allow' && toks[k].t !== ';' && toks[k].t !== '{' && toks[k].t !== '}') k--; if (k >= 0 && toks[k].t === 'allow') start = i + 1; }
    if (t === 'return') start = i + 1;
    if (start < 0) continue;
    let d = 0, k = start;
    for (; k < toks.length; k++) {
      const x = toks[k].t;
      if (x === '(' || x === '[' || x === '{') d++;
      else if (x === ')' || x === ']' || x === '}') d--;
      else if (x === ';' && d === 0) break;
    }
    spans.push([start, k]);
  }
  return { spans, nestedFns };
}

function templatize(toks, varMap, templates, avoid, opts = {}) {
  const { spans, nestedFns } = exprSpans(toks);
  const parsed = [];
  for (const [a, b] of spans) {
    try {
      const { e, end } = parseExpr(toks, a, x => x.t === ';');
      if (end !== b) continue;
      const orig = toks.slice(a, b).map(x => x.t).join(' ');
      const back = tokenize(print(e)).toks.map(x => x.t).join(' ');
      if (orig !== back) continue;           // the printer must reproduce a span exactly, or we leave it alone
      parsed.push({ a, b, e });
    } catch { /* not an expression we understand: leave it */ }
  }
  // Shape of a sub-expression with variables and string literals as numbered holes.
  const cache = new WeakMap();
  const keyOf = (node) => {
    if (cache.has(node)) return cache.get(node);
    const holes = [], seen = new Map();
    let ok = true;
    const hole = (v) => { if (!seen.has(v)) { seen.set(v, HOLE(seen.size)); holes.push(v); } return seen.get(v); };
    const clone = (n, parent) => {
      if (n.type === 'id') {
        if (varMap.has(n.t)) return { type: 'id', t: hole(n.t) };
        if (parent && parent.type === 'call' && parent.e === n) { if (nestedFns.has(n.t)) ok = false; return n; }
        if (!GLOBALS.has(n.t)) ok = false;
        return n;
      }
      if (n.type === 'lit') return /^['"]/.test(n.t) ? { type: 'id', t: hole(n.t) } : n;
      if (n.type === 'path') { ok = false; return n; }
      const c = { ...n };
      for (const k of KIDS) if (n[k]) c[k] = clone(n[k], n);
      if (n.items) c.items = n.items.map(x => clone(x, n));
      if (n.args) c.args = n.args.map(x => clone(x, n));
      if (n.entries) c.entries = n.entries.map(([k, v]) => [clone(k, n), clone(v, n)]);
      return c;
    };
    const shape = clone(node, null);
    const r = ok ? { key: print(shape), holes } : null;
    cache.set(node, r);
    return r;
  };
  const MAX_PARAMS = opts.maxParams ?? 2;
  const candidate = (n) => {
    if (n.type === 'id' || n.type === 'lit' || n.type === 'group' || weight(n) < 4) return null;
    const k = keyOf(n);
    return k && k.holes.length <= MAX_PARAMS ? k : null;
  };
  const visitTop = (n, pick, onHit) => {
    const k = candidate(n);
    if (k && pick.has(k.key)) { onHit(k); return; }
    for (const c of KIDS) if (n[c] && typeof n[c] === 'object') {
      if (n.type === 'call' && c === 'e') { calleeKids(n.e).forEach(x => visitTop(x, pick, onHit)); continue; }
      visitTop(n[c], pick, onHit);
    }
    for (const c of n.items || []) visitTop(c, pick, onHit);
    for (const c of n.args || []) visitTop(c, pick, onHit);
    for (const [k2, v] of n.entries || []) { visitTop(k2, pick, onHit); visitTop(v, pick, onHit); }
  };
  const stats = new Map();
  for (const { e } of parsed) walk(e, (n, parent) => {
    if (parent && parent.type === 'call' && parent.e === n) return;   // a method/function target is not a value
    const k = candidate(n);
    if (!k) return;
    const s = stats.get(k.key) || { n: 0, w: weight(n) - k.holes.length, h: k.holes.length };
    s.n++; stats.set(k.key, s);
  });
  const gainOf = (s) => (s.n - 1) * s.w - s.n * (1 + s.h) - (3 + s.h);
  let selected = new Set([...stats].filter(([, s]) => s.n >= 2 && gainOf(s) > 0)
    .sort((x, y) => gainOf(y[1]) - gainOf(x[1])).slice(0, opts.maxTemplates ?? Infinity).map(([k]) => k));
  for (let round = 0; round < 6; round++) {      // drop templates that end up used once after nesting
    const uses = new Map();
    for (const { e } of parsed) visitTop(e, selected, (k) => uses.set(k.key, (uses.get(k.key) || 0) + 1));
    const next = new Set([...selected].filter(k => (uses.get(k) || 0) >= 2));
    if (next.size === selected.size) break;
    selected = next;
  }
  if (!selected.size) return toks;
  const gen = mkNames('h', avoid);
  const pgen = mkNames('p', avoid);
  const helperOf = new Map();
  const rewrite = (n) => {
    const k = candidate(n);
    if (k && selected.has(k.key)) {
      if (!helperOf.has(k.key)) {
        const params = k.holes.map(() => pgen());
        let body = k.key;
        params.forEach((p, j) => { body = body.split(HOLE(j)).join(p); });
        const name = gen();
        helperOf.set(k.key, name);
        templates.push({ name, params, body });
      }
      return { type: 'call', e: { type: 'id', t: helperOf.get(k.key) }, args: k.holes.map(h => (/^['"]/.test(h) ? { type: 'lit', t: h } : { type: 'id', t: h })) };
    }
    const c = { ...n };
    for (const f of KIDS) if (n[f] && typeof n[f] === 'object') c[f] = n.type === 'call' && f === 'e' ? rewriteCallee(n.e) : rewrite(n[f]);
    if (n.items) c.items = n.items.map(rewrite);
    if (n.args) c.args = n.args.map(rewrite);
    if (n.entries) c.entries = n.entries.map(([k2, v]) => [rewrite(k2), rewrite(v)]);
    return c;
  };
  // a callee keeps its own shape; only its receiver/arguments may be rewritten
  function rewriteCallee(n) {
    if (n.type === 'member') return { ...n, e: rewrite(n.e) };
    if (n.type === 'index') return { ...n, e: rewrite(n.e), ix: rewrite(n.ix), hi: n.hi ? rewrite(n.hi) : n.hi };
    return n;
  }
  const out = [];
  let last = 0;
  for (const { a, b, e } of parsed) {
    out.push(...toks.slice(last, a));
    const nt = tokenize(print(rewrite(e))).toks;
    if (nt.length) nt[0] = { ...nt[0], ws: toks[a].ws };
    out.push(...nt);
    last = b;
  }
  out.push(...toks.slice(last));
  const anchor = out.findIndex((x, i) => x.t === 'match' && seqAt(out, i + 1, ['/', 'databases', '/', '{', 'database', '}', '/', 'documents', '{']));
  const defs = tokenize(templates.map(h => `\nfunction ${h.name}(${h.params.join(', ')}) { return ${h.body}; }`).join('')).toks;
  return [...out.slice(0, anchor + 10), ...defs, ...out.slice(anchor + 10)];
}

// 8. allow statements: within one block, `allow a: if X; allow b: if X;` → `allow a, b: if X;`, and
// `allow …: if false;` is dropped (rules only ever grant, so a false condition grants nothing).
// Returns the rewritten tokens; `allowSet` (below) proves the per-block (method, condition) set is unchanged.
function parseAllows(toks) {
  // → [{ i, end, methods: [..], cond: tokens[], depthId }]
  const res = [];
  const stack = [0];
  let nextId = 1;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t;
    if (t === '{') stack.push(nextId++);
    else if (t === '}') stack.pop();
    else if (t === 'allow') {
      const methods = [];
      let k = i + 1;
      for (; k < toks.length && toks[k].t !== ':' && toks[k].t !== ';'; k++) if (toks[k].k === 'id') methods.push(toks[k].t);
      if (toks[k]?.t !== ':' || toks[k + 1]?.t !== 'if') continue;   // `allow x;` form: leave alone
      let d = 0, j = k + 2;
      for (; j < toks.length; j++) {
        const x = toks[j].t;
        if (x === '(' || x === '[' || x === '{') d++;
        else if (x === ')' || x === ']' || x === '}') d--;
        else if (x === ';' && d === 0) break;
      }
      res.push({ i, end: j, methods, cond: toks.slice(k + 2, j), block: stack[stack.length - 1] });
      i = j;
    }
  }
  return res;
}

function compactAllows(toks) {
  const allows = parseAllows(toks);
  const drop = new Set();             // allow start indices to remove
  const extra = new Map();            // first allow start → methods to add
  const byBlock = new Map();
  for (const a of allows) {
    const key = a.cond.map(x => x.t).join(' ');
    if (key === 'false') { drop.add(a.i); continue; }
    const bk = `${a.block}\u0000${key}`;
    if (byBlock.has(bk)) {
      const first = byBlock.get(bk);
      extra.set(first.i, [...(extra.get(first.i) || []), ...a.methods]);
      drop.add(a.i);
    } else byBlock.set(bk, a);
  }
  const out = [];
  const ends = new Map(allows.map(a => [a.i, a.end]));
  for (let i = 0; i < toks.length; i++) {
    if (drop.has(i)) { i = ends.get(i); continue; }
    if (extra.has(i)) {
      const a = allows.find(x => x.i === i);
      const methods = [...new Set([...a.methods, ...extra.get(i)])];
      out.push(toks[i], ...tokenize(' ' + methods.join(', ')).toks);
      let k = i + 1;
      while (toks[k].t !== ':') k++;
      i = k - 1;
      continue;
    }
    out.push(toks[i]);
  }
  // a match body may not be empty: where every allow was `if false`, keep one inert declaration
  const openers = new Set();
  for (let i = 0; i < out.length; i++) {
    if (out[i].t !== 'match') continue;
    let j = i + 1;
    for (; j < out.length; j++) {
      if (out[j].t === '{' && out[j - 1].t === '/') { while (out[j].t !== '}') j++; continue; }
      if (out[j].t === '{') break;
    }
    openers.add(j);
  }
  const fixed = [];
  for (let i = 0; i < out.length; i++) {
    fixed.push(out[i]);
    if (openers.has(i) && out[i + 1]?.t === '}') fixed.push(...tokenize(' allow get: if false;').toks);
  }
  return fixed;
}

/** Canonical form for verification: non-allow tokens in order, plus the sorted set of
 *  (block, method, condition) grants with `false` conditions removed. */
export function allowSet(src) {
  const toks = tokenize(src).toks;
  const allows = parseAllows(toks);
  const skip = new Map(allows.map(a => [a.i, a.end]));
  const rest = [];
  for (let i = 0; i < toks.length; i++) { if (skip.has(i)) { i = skip.get(i); continue; } rest.push(toks[i].t); }
  // block ids differ once statements move; key blocks by the ordinal of their opening '{' in `rest`
  const grants = new Set();
  for (const a of allows) {
    const cond = a.cond.map(x => x.t).join(' ');
    if (cond === 'false') continue;
    for (const m of a.methods) grants.add(`${a.block}|${m}|${cond}`);
  }
  return { rest: rest.join(' '), grants: [...grants].sort() };
}

// Undo every transform; used by the tests to prove compaction changes nothing but names and aliases.
export function expandRules(compacted, meta) {
  let { toks, tail } = tokenize(compacted);
  const revFn = new Map([...meta.fnMap].map(([o, s]) => [s, o]));
  toks = toks.map((x, i) => (x.k === 'id' && meta.varMap.has(x.t) && !prevIs(toks, i, '.') ? { ...x, t: meta.varMap.get(x.t) } : x));
  toks = toks.map((x, i) => (x.k === 'id' && revFn.has(x.t) && toks[i + 1]?.t === '(' ? { ...x, t: revFn.get(x.t) } : x));
  // templates: drop their definitions, then inline them (bodies hold renamed fn names; map those back)
  const tmpl = new Map((meta.templates || []).map(h => [h.name, h]));
  {
    const kept = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].t === 'function' && tmpl.has(toks[i + 1]?.t)) {
        let d = 0, k = i;
        for (; k < toks.length; k++) { if (toks[k].t === '{') d++; else if (toks[k].t === '}') { d--; if (d === 0) break; } }
        i = k; continue;
      }
      kept.push(toks[i]);
    }
    toks = kept;
    const next = [];
    for (let i = 0; i < toks.length; i++) {
      const h = toks[i].k === 'id' && !prevIs(toks, i, '.') && toks[i + 1]?.t === '(' ? tmpl.get(toks[i].t) : null;
      if (!h) { next.push(toks[i]); continue; }
      const close = closeParen(toks, i + 1);
      const args = toks.slice(i + 2, close).filter(x => x.t !== ',');
      const body = tokenize(h.body).toks.map((x, j, all) => {
        const pi = h.params.indexOf(x.t);
        if (pi >= 0 && x.k === 'id' && all[j - 1]?.t !== '.') {
          const a = args[pi];
          return { ...x, t: a.k === 'id' && meta.varMap.has(a.t) ? meta.varMap.get(a.t) : a.t, k: a.k };
        }
        if (x.k === 'id' && revFn.has(x.t) && all[j + 1]?.t === '(') return { ...x, t: revFn.get(x.t) };
        return x;
      });
      if (body.length) body[0] = { ...body[0], ws: toks[i].ws };
      next.push(...body);
      i = close;
    }
    toks = next;
  }

  const helpers = new Map(meta.helpers.map(h => [h.name, h]));
  // drop helper definitions
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t === 'function' && helpers.has(toks[i + 1]?.t)) {
      let d = 0, k = i;
      for (; k < toks.length; k++) { if (toks[k].t === '{') d++; else if (toks[k].t === '}') { d--; if (d === 0) break; } }
      i = k; continue;
    }
    out.push(toks[i]);
  }
  toks = out;
  // inline helper calls: zero-arg helpers first (their bodies hold no calls), then get/exists,
  // whose collection argument may itself have been a hoisted literal
  for (const wantParams of [false, true]) {
    const next = [];
    for (let i = 0; i < toks.length; i++) {
      const h0 = toks[i].k === 'id' && !prevIs(toks, i, '.') ? helpers.get(toks[i].t) : null;
      const h = h0 && (h0.params.length > 0) === wantParams ? h0 : null;
      if (h && toks[i + 1]?.t === '(') {
        const close = closeParen(toks, i + 1);
        const args = [];
        let cur = [], d = 0;
        for (let k = i + 2; k < close; k++) {
          if (toks[k].t === '(') d++; else if (toks[k].t === ')') d--;
          if (toks[k].t === ',' && d === 0) { args.push(cur); cur = []; } else cur.push(toks[k]);
        }
        if (cur.length) args.push(cur);
        let body = h.body;
        h.params.forEach((p, k) => {
          const a = args[k].map((x, j) => (j === 0 ? x.t : x.ws + x.t)).join('');
          const literal = args[k].length === 1 && args[k][0].k === 's';
          body = body.replace(`$(${p})`, literal ? a.slice(1, -1) : `$(${a})`);
        });
        const bt = tokenize(body).toks;
        if (bt.length) bt[0] = { ...bt[0], ws: toks[i].ws };
        next.push(...bt);
        i = close;
      } else next.push(toks[i]);
    }
    toks = next;
  }
  return emit({ toks, tail });
}

/** Token stream of a rules text, whitespace ignored — what the tests compare. */
export function tokensOf(src) { return tokenize(src).toks.map(x => x.t); }
