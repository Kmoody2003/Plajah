// formulaAssist — the formula-editing smarts shared by the in-cell editor and
// the formula bar: reference colouring (each distinct ref gets a colour, and
// the grid outlines the range in the same colour), F4 anchor cycling,
// click-to-insert "point mode", function autocomplete, and signature help
// with the current argument highlighted. All pure, over the engine tokenizer.

import { parseRange, tokenize, type Token } from '../../../services/tela/sheet';

/** Excel-like reference palette (high contrast on white cells and dark chrome). */
export const REF_COLORS = ['#1F6FEB', '#D40055', '#7A3EC8', '#0E9F6E', '#E36B00', '#0891B2', '#B4235A', '#5B6B00'];

export interface RefSpan {
  start: number; end: number;          // text span including any sheet prefix
  text: string;                        // the ref text without the sheet prefix
  sheet?: string;                      // unquoted sheet name when qualified
  color: string;
  range: { r1: number; c1: number; r2: number; c2: number } | null;
}

const unquoteSheet = (s: string) => {
  const t = s.replace(/!$/, '');
  return t.startsWith("'") ? t.slice(1, -1).replace(/''/g, "'") : t;
};

/** Tokenize editor text (with its leading '=') safely. */
export function tokensOf(text: string): Token[] {
  if (!text.startsWith('=')) return [];
  try { return tokenize(text); } catch { return []; }
}

/** Reference spans with a stable colour per distinct reference text. */
export function refSpans(text: string): RefSpan[] {
  const toks = tokensOf(text);
  const out: RefSpan[] = [];
  const colorOf = new Map<string, string>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'ref') continue;
    const prev = toks[i - 1];
    const sheet = prev?.type === 'sheet' ? unquoteSheet(prev.text) : undefined;
    const key = `${(sheet ?? '').toLowerCase()}!${t.text.replace(/\$/g, '').toUpperCase()}`;
    if (!colorOf.has(key)) colorOf.set(key, REF_COLORS[colorOf.size % REF_COLORS.length]);
    const r = parseRange(t.text.replace(/\$/g, ''));
    out.push({ start: sheet !== undefined ? prev.start : t.start, end: t.end, text: t.text, sheet, color: colorOf.get(key)!, range: r });
  }
  return out;
}

/** Syntax-highlight segments for the editor mirror layer. */
export interface Segment { text: string; color?: string; bold?: boolean }
export function highlight(text: string, dark = false): Segment[] {
  if (!text.startsWith('=')) return [{ text }];
  const toks = tokensOf(text);
  if (!toks.length) return [{ text }];
  const refs = refSpans(text);
  const refAt = new Map<number, RefSpan>(); for (const r of refs) refAt.set(r.start, r);
  const segs: Segment[] = [];
  let pos = 0;
  const muted = dark ? '#C9C2D6' : '#3B3447';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.start > pos) segs.push({ text: text.slice(pos, t.start) });
    const r = refAt.get(t.start);
    if (r) { segs.push({ text: text.slice(r.start, r.end), color: r.color }); pos = r.end; if (t.type === 'sheet') i++; continue; }
    const color = t.type === 'func' ? (dark ? '#D0BCFF' : '#6B0099') : t.type === 'str' ? (dark ? '#8FF5FF' : '#0E7490') : t.type === 'num' ? (dark ? '#FFD08A' : '#9A5B00') : t.type === 'err' ? '#EF4444' : t.type === 'name' || t.type === 'struct' ? (dark ? '#9FE8C4' : '#0E7C52') : muted;
    segs.push({ text: t.text, color, bold: t.type === 'func' });
    pos = t.end;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) });
  return segs;
}

// ── F4: cycle $ anchors ──────────────────────────────────────────────────────

const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;
function cycleCell(ref: string): string {
  const m = ref.match(CELL); if (!m) return ref;
  const [, dc, col, dr, row] = m;
  // A1 → $A$1 → A$1 → $A1 → A1
  if (!dc && !dr) return `$${col}$${row}`;
  if (dc && dr) return `${col}$${row}`;
  if (!dc && dr) return `$${col}${row}`;
  return `${col}${row}`;
}
/** Cycle the anchors of the reference at/just before the caret. */
export function cycleAnchor(text: string, caret: number): { text: string; selStart: number; selEnd: number } | null {
  const toks = tokensOf(text);
  const t = toks.find(x => x.type === 'ref' && caret >= x.start && caret <= x.end);
  if (!t) return null;
  const parts = t.text.split(':');
  const next = parts.map(cycleCell).join(':');
  if (next === t.text) return null;
  const out = text.slice(0, t.start) + next + text.slice(t.end);
  return { text: out, selStart: t.start, selEnd: t.start + next.length };
}

// ── Point mode (click / arrows insert references) ────────────────────────────

const INSERTABLE_BEFORE = new Set(['=', '(', ',', ';', '+', '-', '*', '/', '^', '&', '<', '>', ':', '{', '%']);
/** Can a reference be inserted at the caret (after an operator, '(' or ',')? */
export function canInsertRef(text: string, caret: number): boolean {
  if (!text.startsWith('=')) return false;
  let i = caret - 1;
  while (i >= 0 && text[i] === ' ') i--;
  if (i < 0) return false;
  // Not inside a string literal.
  let quotes = 0; for (let k = 0; k < caret; k++) if (text[k] === '"') quotes++;
  if (quotes % 2) return false;
  // Caret followed by an identifier char means we're mid-token.
  const after = text[caret];
  if (after && /[A-Za-z0-9_$.]/.test(after)) return false;
  return INSERTABLE_BEFORE.has(text[i]);
}

/** Replace [start, end) with a ref and return the new text + caret. */
export function insertRef(text: string, start: number, end: number, ref: string): { text: string; caret: number } {
  const out = text.slice(0, start) + ref + text.slice(end);
  return { text: out, caret: start + ref.length };
}

// ── Function context, autocomplete, signature help ───────────────────────────

/** The innermost function call enclosing the caret and which argument it's in. */
export function fnContext(text: string, caret: number): { name: string; argIndex: number; start: number } | null {
  const toks = tokensOf(text.slice(0, caret));
  const stack: { name: string | null; arg: number; start: number }[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'lparen') {
      const prev = toks[i - 1];
      stack.push({ name: prev?.type === 'func' ? prev.text.toUpperCase() : null, arg: 0, start: prev?.type === 'func' ? prev.start : t.start });
    } else if (t.type === 'rparen') stack.pop();
    else if ((t.type === 'comma' || t.type === 'semi') && stack.length) stack[stack.length - 1].arg++;
    else if (t.type === 'lbrace') stack.push({ name: null, arg: 0, start: t.start });
    else if (t.type === 'rbrace') stack.pop();
  }
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name) return { name: stack[i].name!, argIndex: stack[i].arg, start: stack[i].start };
  return null;
}

/** The identifier being typed at the caret (for function autocomplete). */
export function identAtCaret(text: string, caret: number): { prefix: string; start: number; end: number } | null {
  if (!text.startsWith('=')) return null;
  let s = caret;
  while (s > 1 && /[A-Za-z0-9_.]/.test(text[s - 1])) s--;
  const prefix = text.slice(s, caret);
  if (!prefix || !/^[A-Za-z_]/.test(prefix)) return null;
  // Not a cell ref like "A1" being typed, and not inside a string.
  let quotes = 0; for (let k = 0; k < s; k++) if (text[k] === '"') quotes++;
  if (quotes % 2) return null;
  if (/^[A-Za-z]{1,3}\d+$/.test(prefix)) return null;
  const before = text[s - 1];
  if (before === '!' || before === '[' || before === "'") return null;
  let e = caret; while (e < text.length && /[A-Za-z0-9_.]/.test(text[e])) e++;
  return { prefix, start: s, end: e };
}

/** Split a signature into argument labels ("a, [b], ..." → ["a","[b]","..."]). */
export function sigArgs(sig: string): string[] {
  return sig.split(',').map(s => s.trim()).filter(Boolean);
}
/** Which signature argument is active, handling trailing repeated args ("number1, [number2], ..."). */
export function activeArg(sig: string, argIndex: number): number {
  const args = sigArgs(sig);
  if (argIndex < args.length) {
    if (args[argIndex] === '...') return Math.max(0, argIndex - 1);
    return argIndex;
  }
  const ell = args.indexOf('...');
  if (ell > 0) return ell - 1;
  return args.length - 1;
}

/** Close unbalanced parentheses / quotes when committing (Excel does this). */
export function autoClose(text: string): string {
  if (!text.startsWith('=')) return text;
  let out = text;
  let quotes = 0; for (const ch of out) if (ch === '"') quotes++;
  if (quotes % 2) out += '"';
  let depth = 0; let inStr = false;
  for (const ch of out) { if (ch === '"') inStr = !inStr; else if (!inStr) { if (ch === '(') depth++; else if (ch === ')') depth--; } }
  while (depth-- > 0) out += ')';
  return out;
}
