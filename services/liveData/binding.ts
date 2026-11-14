// binding — map a live table onto a graphic's fields. Pure, so the timeline
// export, the live playout and Stage all resolve the same values.
//
// A field mapping is either:
//   "Name"                     a column (exact header)
//   "{First} {Last} · {Team}"  a template of columns
//   "#count"                   number of rows
//   "#sum:Votes" "#avg:Votes" "#min:Score" "#max:Score"   numeric aggregates
//   "#pct:Votes"               this row's share of the column total (0–100, rounded)
//   "#index"                   1-based row number
//   "@2:High" "@last:Name"     a column from an absolute row (0-based) — multi-row boards (5-day forecast, standings)
//   "=literal text"            a fixed value
import type { LiveTable } from './csv';

export type LiveRowSelector =
  | { mode: 'first' }
  | { mode: 'last' }                       // newest row — "as names get added"
  | { mode: 'index'; index: number }       // 0-based
  | { mode: 'match'; column: string; equals: string }
  | { mode: 'row-of-item' };               // one rundown item per row (set by the playout)

export interface LiveBinding {
  sourceId: string;
  row: LiveRowSelector;
  /** fieldKey → mapping expression (see header). */
  map: Record<string, string>;
  /** Row index pinned by a rundown that follows the source (mode 'row-of-item'). */
  pinnedRow?: number;
}

const num = (s: string | undefined) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.+-eE]/g, '')); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export function selectRow(t: LiveTable, sel: LiveRowSelector, pinned?: number): { row: Record<string, string> | null; index: number } {
  if (!t.rows.length) return { row: null, index: -1 };
  let i = -1;
  switch (sel.mode) {
    case 'first': i = 0; break;
    case 'last': i = t.rows.length - 1; break;
    case 'index': i = sel.index; break;
    case 'row-of-item': i = pinned ?? 0; break;
    case 'match': {
      const want = sel.equals.trim().toLowerCase();
      i = t.rows.findIndex(r => (r[sel.column] ?? '').trim().toLowerCase() === want);
      break;
    }
  }
  return i >= 0 && i < t.rows.length ? { row: t.rows[i], index: i } : { row: null, index: -1 };
}

export function evalMapping(expr: string, t: LiveTable, row: Record<string, string> | null, index: number): string {
  if (expr.startsWith('=')) return expr.slice(1);
  if (expr.startsWith('@')) {
    const m = expr.match(/^@(last|first|\d+):(.+)$/); if (!m) return '';
    const i = m[1] === 'last' ? t.rows.length - 1 : m[1] === 'first' ? 0 : Number(m[1]);
    return t.rows[i]?.[m[2]] ?? '';
  }
  if (expr.startsWith('#')) {
    const [op, col] = expr.slice(1).split(':');
    const vals = col ? t.rows.map(r => num(r[col])) : [];
    switch (op) {
      case 'count': return String(t.rows.length);
      case 'index': return index >= 0 ? String(index + 1) : '';
      case 'sum': return fmt(vals.reduce((a, b) => a + b, 0));
      case 'avg': return vals.length ? fmt(vals.reduce((a, b) => a + b, 0) / vals.length) : '0';
      case 'min': return vals.length ? fmt(Math.min(...vals)) : '0';
      case 'max': return vals.length ? fmt(Math.max(...vals)) : '0';
      case 'pct': { const tot = vals.reduce((a, b) => a + b, 0); return tot && row ? String(Math.round(num(row[col]) / tot * 100)) : '0'; }
      default: return '';
    }
  }
  if (!row) return '';
  if (expr.includes('{')) return expr.replace(/\{([^}]+)\}/g, (_, c) => row[c.trim()] ?? '').trim();
  return row[expr] ?? '';
}

/** Resolve bound field values. Unmapped fields are left out (the ref/default value wins). */
export function resolveBinding(b: LiveBinding, t: LiveTable | null | undefined): Record<string, string> {
  if (!t) return {};
  const { row, index } = selectRow(t, b.row, b.pinnedRow);
  const out: Record<string, string> = {};
  for (const [field, expr] of Object.entries(b.map)) { if (expr) out[field] = evalMapping(expr, t, row, index); }
  return out;
}

/** Best-effort automatic mapping: match field keys/labels to similarly named columns. */
export function autoMap(fields: { key: string; label: string }[], columns: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const syn: Record<string, string[]> = {
    name: ['name', 'fullname', 'speaker', 'guest', 'person', 'title'], title: ['title', 'role', 'position', 'job', 'subtitle', 'description'],
    tag: ['tag', 'kicker', 'label', 'category'], headline: ['headline', 'story', 'text', 'message'], items: ['items', 'headline', 'text'],
    handle: ['handle', 'username', 'twitter', 'instagram'], photo: ['photo', 'image', 'avatar', 'picture', 'headshot'],
    value: ['value', 'score', 'total', 'amount', 'count'], place: ['place', 'location', 'city'],
  };
  const out: Record<string, string> = {};
  const cols = columns.map(c => ({ c, n: norm(c) }));
  for (const f of fields) {
    const keys = [norm(f.key), norm(f.label), ...(syn[norm(f.key)] || [])];
    const hit = cols.find(c => keys.includes(c.n)) || cols.find(c => keys.some(k => k.length > 2 && c.n.includes(k)));
    if (hit) out[f.key] = hit.c;
  }
  return out;
}
