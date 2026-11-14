// csv — RFC 4180 CSV/TSV parsing for live data feeds (no dependencies).
// Handles quoted fields, escaped quotes (""), CRLF/LF, embedded newlines,
// a UTF-8 BOM, and delimiter sniffing (comma, semicolon, tab, pipe).

export function sniffDelimiter(text: string): string {
  const head = text.slice(0, 4096).split(/\r?\n/).slice(0, 5);
  let best = ',', bestScore = -1;
  for (const d of [',', '\t', ';', '|']) {
    const counts = head.map(l => splitCount(l, d)).filter(n => n > 0);
    if (!counts.length) continue;
    const consistent = counts.every(n => n === counts[0]);
    const score = counts[0] * (consistent ? 2 : 1);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}
function splitCount(line: string, d: string): number {
  let n = 0, q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
  return n;
}

/** Parse to a matrix of strings. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = delimiter || sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], field = '', i = 0, q = false;
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { q = true; i++; continue; }
    if (ch === d) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++; continue;
    }
    field += ch; i++;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

export interface LiveTable {
  columns: string[];
  rows: Record<string, string>[];
  /** ms epoch the data last changed. */
  updatedAt: number;
}

/** Header row → columns; empty/duplicate headers get unique names. */
export function tableFromMatrix(m: string[][], hasHeader = true): LiveTable {
  const width = Math.max(0, ...m.map(r => r.length));
  const raw = hasHeader && m.length ? m[0] : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const seen = new Map<string, number>();
  const columns = Array.from({ length: width }, (_, i) => {
    let c = (raw[i] ?? '').trim() || `Column ${i + 1}`;
    const n = seen.get(c) || 0; seen.set(c, n + 1);
    if (n) c = `${c} ${n + 1}`;
    return c;
  });
  const body = hasHeader ? m.slice(1) : m;
  const rows = body.map(r => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])));
  return { columns, rows, updatedAt: Date.now() };
}

export function tableFromCsv(text: string, opts: { delimiter?: string; hasHeader?: boolean } = {}): LiveTable {
  return tableFromMatrix(parseCsv(text, opts.delimiter), opts.hasHeader !== false);
}

/** Array of objects (JSON feeds) → table. Nested values are JSON-stringified. */
export function tableFromRecords(records: unknown[]): LiveTable {
  const cols: string[] = [];
  const objs = records.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
  for (const o of objs) for (const k of Object.keys(o)) if (!cols.includes(k)) cols.push(k);
  const str = (v: unknown) => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return { columns: cols, rows: objs.map(o => Object.fromEntries(cols.map(c => [c, str(o[c])]))), updatedAt: Date.now() };
}

/** Stable content signature, so pollers only notify on real changes. */
export function tableSignature(t: LiveTable): string {
  let h = 2166136261;
  const feed = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 31; };
  feed(t.columns.join('\u0001'));
  for (const r of t.rows) for (const c of t.columns) feed(r[c] ?? '');
  return `${t.rows.length}:${(h >>> 0).toString(36)}`;
}
