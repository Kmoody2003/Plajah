// labelCore - PURE logic for Chora label accounts (routes/labels.ts): team permissions, deal terms, distributor
// CSV parsing and royalty statements. No Firebase, no I/O.
//
// Statements are an accounting record. They never move money: distributor income reaches the label outside
// Plajah, and Plajah sales are already paid to the album owner's Connect account (server.ts payCreatorEarning).
// So each artist line says what the label owes them after what they already received directly.
//
// All statement money is integer cents; CSV amounts are summed in integer micro-dollars first, because
// distributor lines are fractions of a cent.

import { isValidIsrc, isValidUpc, normIsrc } from '../melos/beats/releaseDesk';

// ── Team ─────────────────────────────────────────────────────────────────────

export type LabelRole = 'owner' | 'admin' | 'finance' | 'catalog' | 'viewer';
export type LabelPerm = 'team' | 'roster' | 'catalog' | 'finance' | 'view';

export const LABEL_ROLES: LabelRole[] = ['owner', 'admin', 'finance', 'catalog', 'viewer'];
const ROLE_PERMS: Record<LabelRole, LabelPerm[]> = {
  owner: ['team', 'roster', 'catalog', 'finance', 'view'],
  admin: ['team', 'roster', 'catalog', 'finance', 'view'],
  finance: ['finance', 'view'],
  catalog: ['roster', 'catalog', 'view'],
  viewer: ['view'],
};
export const roleCan = (role: LabelRole | undefined | null, perm: LabelPerm) => !!role && !!ROLE_PERMS[role]?.includes(perm);
export const asInvitableRole = (r: unknown): LabelRole | null =>
  r === 'admin' || r === 'finance' || r === 'catalog' || r === 'viewer' ? r : null;

// ── Deals ────────────────────────────────────────────────────────────────────

export const LABEL_PARTY = 'label';
export const BPS_TOTAL = 10000;

export interface DealParty { id: string; name: string; uid?: string; bps: number }

/** Null when valid: whole basis points summing to 100%, unique ids, exactly one label party. */
export function dealProblem(parties: unknown): string | null {
  if (!Array.isArray(parties) || parties.length < 1 || parties.length > 20) return 'A deal needs between 1 and 20 parties.';
  const ids = new Set<string>();
  let total = 0, labels = 0;
  for (const p of parties as DealParty[]) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 128) return 'Every party needs an id.';
    if (ids.has(p.id)) return 'Each party can only appear once.';
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) return 'Every party needs a name.';
    if (!Number.isInteger(p.bps) || p.bps < 0 || p.bps > BPS_TOTAL) return 'Shares must be between 0% and 100%.';
    total += p.bps;
    if (p.id === LABEL_PARTY) labels++;
  }
  if (labels !== 1) return 'A deal must include the label.';
  if (total !== BPS_TOTAL) return `Shares must add up to 100% (they add up to ${(total / 100).toFixed(2)}%).`;
  return null;
}

/** Split cents by basis points so the parts always sum to the whole (largest remainder, ties by id). */
export function allocate(cents: number, parties: Pick<DealParty, 'id' | 'bps'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  const rows = parties.map(p => {
    const exact = cents * p.bps / BPS_TOTAL;
    const floor = Math.floor(exact);
    out[p.id] = floor;
    return { id: p.id, rem: exact - floor };
  });
  let left = cents - rows.reduce((s, r) => s + out[r.id], 0);
  rows.sort((a, b) => b.rem - a.rem || a.id.localeCompare(b.id));
  for (let i = 0; left > 0 && rows.length; i = (i + 1) % rows.length, left--) out[rows[i].id]++;
  return out;
}

// ── Distributor CSV ──────────────────────────────────────────────────────────

/** RFC 4180 style rows. Handles quotes, escaped quotes, CRLF and a BOM; also detects ; and tab delimiters. */
export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, Math.max(0, src.indexOf('\n')) || src.length);
  const delim = [',', ';', '\t'].map(d => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const COLUMN_NAMES = {
  isrc: ['isrc', 'trackisrc', 'isrccode'],
  upc: ['upc', 'ean', 'upcean', 'barcode', 'albumupc', 'releaseupc'],
  amount: ['earningsusd', 'netearningsusd', 'netrevenueusd', 'royaltyusd', 'netpayableusd', 'earnings', 'netearnings', 'netrevenue', 'royalty', 'royalties', 'netamount', 'payable', 'amountusd', 'amount', 'revenue', 'teamearnings'],
  month: ['salemonth', 'salesmonth', 'reportingmonth', 'reportingperiod', 'statementperiod', 'period', 'month', 'saledate', 'date'],
  currency: ['currency', 'currencycode', 'earningscurrency'],
};
export type CsvColumn = keyof typeof COLUMN_NAMES;

/** Finds the header among the first rows (some distributors put a title above it). Earlier aliases win. */
export function detectColumns(rows: string[][]): { headerRow: number; columns: Partial<Record<CsvColumn, number>> } | null {
  for (let h = 0; h < Math.min(rows.length, 10); h++) {
    const cells = rows[h].map(norm);
    const columns: Partial<Record<CsvColumn, number>> = {};
    for (const key of Object.keys(COLUMN_NAMES) as CsvColumn[]) {
      for (const alias of COLUMN_NAMES[key]) {
        const at = cells.indexOf(alias);
        if (at >= 0) { columns[key] = at; break; }
      }
    }
    if (columns.amount !== undefined && (columns.isrc !== undefined || columns.upc !== undefined)) return { headerRow: h, columns };
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const validMonth = (y: number, m: number) => (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}` : null);

/** "2026-09", "2026-09-14", "2026/9", "Sep 2026", "September-2026", "09/2026" to YYYY-MM. */
export function toMonth(raw: string | undefined): string | null {
  const s = (raw || '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/.exec(s);
  if (m) return validMonth(+m[1], +m[2]);
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return validMonth(+m[2], +m[1]);
  m = /^([a-z]{3})[a-z]*[\s-/,]+(\d{4})$/i.exec(s);
  if (m) { const i = MONTHS.indexOf(m[1].toLowerCase()); return i >= 0 ? validMonth(+m[2], i + 1) : null; }
  return null;
}

/** "$1,234.56" / "(0.25)" / "-0.0034" to integer micro-dollars; null when not a number. */
export function toMicros(raw: string | undefined): number | null {
  let s = (raw || '').trim().replace(/[$\s]/g, '');
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1);
  // A comma decimal ("0,25") only when there is no dot and it isn't a thousands group.
  if (!s.includes('.') && /,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  s = s.replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Math.round(parseFloat(s) * 1e6);
  return Number.isSafeInteger(n) ? (negative ? -n : n) : null;
}

export interface ImportRow { isrc: string; upc: string; month: string; micros: number }
export interface ParsedImport {
  rows: ImportRow[];
  lineCount: number;
  skipped: { noIdentifier: number; badAmount: number; otherCurrency: number; noMonth: number };
}

/** Rolls distributor lines up to one row per recording and month. `fallbackMonth` covers files with no date column. */
export function parseDistributorCsv(text: string, fallbackMonth?: string | null): ParsedImport | { error: string } {
  const rows = parseCsvRows(text);
  if (!rows.length) return { error: 'That file is empty.' };
  const found = detectColumns(rows);
  if (!found) return { error: 'Could not find an amount column and an ISRC or UPC column in that file.' };
  const c = found.columns;
  const totals = new Map<string, ImportRow>();
  const skipped = { noIdentifier: 0, badAmount: 0, otherCurrency: 0, noMonth: 0 };
  let lineCount = 0;
  for (const line of rows.slice(found.headerRow + 1)) {
    lineCount++;
    const currency = c.currency !== undefined ? (line[c.currency] || '').trim().toUpperCase() : '';
    if (currency && currency !== 'USD') { skipped.otherCurrency++; continue; }
    const isrc = c.isrc !== undefined ? normIsrc(line[c.isrc]) : '';
    const upc = c.upc !== undefined ? (line[c.upc] || '').replace(/\D/g, '') : '';
    const hasIsrc = isValidIsrc(isrc), hasUpc = isValidUpc(upc);
    if (!hasIsrc && !hasUpc) { skipped.noIdentifier++; continue; }
    const micros = c.amount !== undefined ? toMicros(line[c.amount]) : null;
    if (micros === null) { skipped.badAmount++; continue; }
    const month = (c.month !== undefined ? toMonth(line[c.month]) : null) || fallbackMonth || null;
    if (!month) { skipped.noMonth++; continue; }
    const row: ImportRow = { isrc: hasIsrc ? isrc : '', upc: hasIsrc ? '' : upc, month, micros };
    const key = `${row.isrc}|${row.upc}|${month}`;
    const prev = totals.get(key);
    if (prev) prev.micros += micros; else totals.set(key, row);
  }
  return { rows: [...totals.values()], lineCount, skipped };
}

// ── Statements ───────────────────────────────────────────────────────────────

export interface CatalogEntry {
  albumId: string;
  title: string;
  upc?: string;
  isrcs: string[];
  parties: DealParty[];
}
export interface StoredImport { id: string; source: string; rows: ImportRow[] }
export interface DirectEarning { id: string; albumId: string; uid: string; netCents: number; at: number }
export interface Recoupable { id: string; partyId: string; amountCents: number; date: string; note?: string }

export interface PriorStatement {
  periodEnd: string;
  closedAt: number;
  appliedImportMonths: string[];
  appliedRecoupableIds: string[];
  /** Carried per party. */
  closing: Record<string, { balanceCents: number; unrecoupedCents: number; paidCents?: number }>;
}

export interface StatementReleaseLine {
  albumId: string;
  title: string;
  externalCents: number;
  directCents: number;
  shares: Record<string, number>;
}
export interface StatementPartyLine {
  id: string;
  name: string;
  uid?: string;
  openingCents: number;
  earnedCents: number;
  /** Advances and expenses taken from this party's earnings this period. */
  recoupedCents: number;
  /** Recouped money credited to the label. */
  recoupCreditCents: number;
  /** Plajah sales this party already received through Connect. */
  directReceivedCents: number;
  /** Positive: the label owes this party. Negative: carried forward against future earnings. */
  closingCents: number;
  unrecoupedCents: number;
}
export interface StatementDraft {
  periodEnd: string;
  releases: StatementReleaseLine[];
  parties: StatementPartyLine[];
  totals: { externalCents: number; directCents: number; incomeCents: number };
  unmatched: { key: string; month: string; source: string; cents: number }[];
  /** Plajah earnings paid to someone with no share in the deal. Counted as income, flagged for review. */
  warnings: string[];
  appliedImportMonths: string[];
  appliedRecoupableIds: string[];
  earningsAfter: number;
  earningsThrough: number;
}

const compareMonths = (a: string, b: string) => a.localeCompare(b);
/** Last millisecond of a YYYY-MM month, UTC. */
export const monthEndMs = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m, 1) - 1;
};

export const isMonth = (s: unknown): s is string => typeof s === 'string' && toMonth(s) === s;

/**
 * Builds a statement through `periodEnd`. Picks up everything not on an earlier statement, so distributor
 * lines that report late land on the next statement rather than vanishing.
 */
export function buildStatement(input: {
  periodEnd: string;
  catalog: CatalogEntry[];
  imports: StoredImport[];
  earnings: DirectEarning[];
  recoupables: Recoupable[];
  prior: PriorStatement[];
}): StatementDraft {
  const { periodEnd, catalog } = input;
  const prior = [...input.prior].sort((a, b) => compareMonths(a.periodEnd, b.periodEnd));
  const last = prior[prior.length - 1];
  const appliedMonths = new Set(prior.flatMap(p => p.appliedImportMonths || []));
  const appliedRecoup = new Set(prior.flatMap(p => p.appliedRecoupableIds || []));
  const earningsAfter = last ? monthEndMs(last.periodEnd) : 0;
  const earningsThrough = monthEndMs(periodEnd);

  const byIsrc = new Map<string, CatalogEntry>(), byUpc = new Map<string, CatalogEntry>();
  for (const e of catalog) {
    for (const i of e.isrcs) if (i) byIsrc.set(normIsrc(i), e);
    if (e.upc) byUpc.set(e.upc.replace(/\D/g, ''), e);
  }

  // Sum in micro-dollars per release, then round once per release.
  const externalMicros = new Map<string, number>();
  const unmatchedMicros = new Map<string, { key: string; month: string; source: string; micros: number }>();
  const nowApplied: string[] = [];
  for (const imp of input.imports) {
    for (const row of imp.rows) {
      const key = row.isrc || row.upc;
      // Only matched rows are marked as used: income whose code is fixed later still reaches a later statement.
      const appliedKey = `${imp.id}:${key}:${row.month}`;
      if (compareMonths(row.month, periodEnd) > 0 || appliedMonths.has(appliedKey)) continue;
      const entry = (row.isrc && byIsrc.get(row.isrc)) || (row.upc && byUpc.get(row.upc)) || null;
      if (entry) {
        externalMicros.set(entry.albumId, (externalMicros.get(entry.albumId) || 0) + row.micros);
        nowApplied.push(appliedKey);
      } else {
        const k = `${key}|${row.month}|${imp.source}`;
        const u = unmatchedMicros.get(k);
        if (u) u.micros += row.micros; else unmatchedMicros.set(k, { key, month: row.month, source: imp.source, micros: row.micros });
      }
    }
  }

  const earningsByAlbum = new Map<string, DirectEarning[]>();
  for (const e of input.earnings) {
    if (e.at <= earningsAfter || e.at > earningsThrough) continue;
    const list = earningsByAlbum.get(e.albumId);
    if (list) list.push(e); else earningsByAlbum.set(e.albumId, [e]);
  }

  const parties = new Map<string, StatementPartyLine>();
  const party = (p: { id: string; name: string; uid?: string }) => {
    let line = parties.get(p.id);
    if (!line) {
      const c = last?.closing?.[p.id];
      line = {
        id: p.id, name: p.name, ...(p.uid ? { uid: p.uid } : {}),
        openingCents: c ? c.balanceCents - (c.paidCents || 0) : 0,
        earnedCents: 0, recoupedCents: 0, recoupCreditCents: 0, directReceivedCents: 0, closingCents: 0,
        unrecoupedCents: c ? c.unrecoupedCents : 0,
      };
      parties.set(p.id, line);
    }
    return line;
  };

  const warnings: string[] = [];
  const releases: StatementReleaseLine[] = [];
  let externalTotal = 0, directTotal = 0;
  for (const e of catalog) {
    const externalCents = Math.round((externalMicros.get(e.albumId) || 0) / 1e4);
    const direct = earningsByAlbum.get(e.albumId) || [];
    const directCents = direct.reduce((s, d) => s + d.netCents, 0);
    for (const p of e.parties) party(p);
    if (!externalCents && !directCents) continue;
    const income = externalCents + directCents;
    // Negative income (a net clawback period) allocates as the mirror of a positive one.
    const split = allocate(Math.abs(income), e.parties);
    const shares: Record<string, number> = {};
    for (const p of e.parties) {
      const cents = income < 0 ? -split[p.id] : split[p.id];
      shares[p.id] = cents;
      party(p).earnedCents += cents;
    }
    for (const d of direct) {
      const holder = e.parties.find(p => p.uid === d.uid);
      if (holder) party(holder).directReceivedCents += d.netCents;
      else warnings.push(`"${e.title}": a Plajah sale was paid to an account with no share in this deal.`);
    }
    releases.push({ albumId: e.albumId, title: e.title, externalCents, directCents, shares });
    externalTotal += externalCents;
    directTotal += directCents;
  }

  // New advances and expenses join the party's unrecouped balance; earnings then pay them down.
  const nowRecoup: string[] = [];
  for (const r of input.recoupables) {
    if (appliedRecoup.has(r.id) || compareMonths(r.date.slice(0, 7), periodEnd) > 0) continue;
    const line = parties.get(r.partyId);
    if (!line) continue;
    line.unrecoupedCents += r.amountCents;
    nowRecoup.push(r.id);
  }

  const labelLine = party({ id: LABEL_PARTY, name: 'Label' });
  for (const line of parties.values()) {
    if (line.id === LABEL_PARTY) continue;
    const recoup = Math.max(0, Math.min(line.unrecoupedCents, line.earnedCents));
    line.recoupedCents = recoup;
    line.unrecoupedCents -= recoup;
    labelLine.recoupCreditCents += recoup;
  }
  for (const line of parties.values()) {
    if (line.id === LABEL_PARTY) {
      // The label holds external income; its line is what it keeps, not something it is owed.
      line.closingCents = line.openingCents + line.earnedCents + line.recoupCreditCents;
    } else {
      line.closingCents = line.openingCents + line.earnedCents - line.recoupedCents - line.directReceivedCents;
    }
  }

  return {
    periodEnd,
    releases,
    parties: [...parties.values()],
    totals: { externalCents: externalTotal, directCents: directTotal, incomeCents: externalTotal + directTotal },
    unmatched: [...unmatchedMicros.values()].map(u => ({ key: u.key, month: u.month, source: u.source, cents: Math.round(u.micros / 1e4) })),
    warnings: [...new Set(warnings)],
    appliedImportMonths: nowApplied,
    appliedRecoupableIds: nowRecoup,
    earningsAfter,
    earningsThrough,
  };
}

/** The view an artist may see: their own line and the releases they share in, without other parties' shares. */
export function statementForParty<T extends { releases: StatementReleaseLine[]; parties: StatementPartyLine[] }>(s: T, partyIds: string[]) {
  const mine = new Set(partyIds);
  return {
    ...s,
    parties: s.parties.filter(p => mine.has(p.id)),
    releases: s.releases
      .filter(r => partyIds.some(id => id in r.shares))
      .map(r => ({ ...r, shares: Object.fromEntries(Object.entries(r.shares).filter(([k]) => mine.has(k))) })),
    unmatched: [],
    warnings: [],
  };
}

// ── Release readiness ────────────────────────────────────────────────────────

export interface ReadinessProblem { level: 'error' | 'warn'; text: string }

/** What a distributor will reject (error) or query (warn). Works on the stored album doc. */
export function releaseReadiness(album: Record<string, any>): ReadinessProblem[] {
  const out: ReadinessProblem[] = [];
  const tracks: any[] = Array.isArray(album.tracks) ? album.tracks : [];
  if (!String(album.title || '').trim()) out.push({ level: 'error', text: 'Release title is missing.' });
  if (!String(album.artist || '').trim()) out.push({ level: 'error', text: 'Artist name is missing.' });
  if (!album.coverUrl && !album.coverImage && !album.cover && !album.coverArt) out.push({ level: 'error', text: 'Cover art is missing.' });
  if (!tracks.length) out.push({ level: 'error', text: 'The release has no tracks.' });
  const upc = album.releaseMeta?.upc;
  if (!upc) out.push({ level: 'error', text: 'UPC is missing.' });
  else if (!isValidUpc(upc)) out.push({ level: 'error', text: 'UPC check digit is wrong.' });
  const seen = new Set<string>();
  tracks.forEach((t, i) => {
    const name = `Track ${i + 1}${t?.title ? ` (${t.title})` : ''}`;
    const isrc = t?.trackMeta?.isrc;
    if (!isrc) out.push({ level: 'error', text: `${name}: ISRC is missing.` });
    else if (!isValidIsrc(isrc)) out.push({ level: 'error', text: `${name}: ISRC format is wrong.` });
    else if (seen.has(normIsrc(isrc))) out.push({ level: 'error', text: `${name}: ISRC is used twice on this release.` });
    else seen.add(normIsrc(isrc));
    if (!String(t?.title || '').trim()) out.push({ level: 'error', text: `Track ${i + 1}: title is missing.` });
  });
  if (!album.releaseMeta?.releaseDate && !album.releaseDate) out.push({ level: 'warn', text: 'No release date set.' });
  return out;
}

/** Spreadsheet-safe CSV cell: quotes, and neutralizes formula prefixes from user-entered text. */
export function csvCell(value: unknown): string {
  let s = String(value ?? '');
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
