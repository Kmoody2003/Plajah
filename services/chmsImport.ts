// chmsImport — the Elevate ChMS import engine.
//   parse (chmsFormats) -> analyzeFile -> buildPlan (map + validate + match/dedupe + reconcile, NO writes)
//   -> commitPlan (chunked, resumable, stamped with source.importId) -> rollbackImport.
// Bad rows never throw: they become issues in the plan. Re-importing the same file updates, never duplicates
// (new docs get deterministic ids; existing docs are matched by source id, email, name+birthdate/phone…).

import { db } from './firebase';
import { collection, doc, getDocs, query, where, writeBatch, setDoc, updateDoc } from 'firebase/firestore';
import { elevateCan } from './elevateRoles';
import { updateOrganization } from './organizationService';
import type {
  Organization, OrgMembership, ChmsPerson, ChmsHousehold, ChmsContribution, ChmsBatch, ChmsPledge, ChmsAttendance, ChmsImport, GivingFund,
} from '../types';
import {
  ChmsFileKind, ChmsSourceSystem, ParsedTable, ColumnMapping, FieldDef, FIELD_DEFS, mapHeaders, detectKind, detectSource,
  normDate, normPhone, normState, normZip, normEmail, normGender, parseAmount, mapStatus, mapMethod, mapFrequency, mapHouseholdRole,
  slugify, tidyName, splitFullName, stableId, safeKey, nameSimilarity, toCsv,
} from './chmsFormats';

// ── Collections ──────────────────────────────────────────────────────────────
export const CHMS_COLL = {
  people: 'chmsPeople', households: 'chmsHouseholds', contributions: 'chmsContributions', batches: 'chmsBatches',
  pledges: 'chmsPledges', attendance: 'chmsAttendance', imports: 'chmsImports',
} as const;

// ── Files ────────────────────────────────────────────────────────────────────
export interface ImportFile {
  id: string; name: string; table: ParsedTable;
  kind: ChmsFileKind; kindConfidence: number; alternatives: ChmsFileKind[];
  source: ChmsSourceSystem; sourceConfidence: number;
  mapping: ColumnMapping[];
}

export function analyzeFile(name: string, table: ParsedTable): ImportFile {
  const det = detectKind(table.headers);
  const src = detectSource(table.headers);
  return {
    id: `${name}:${table.rows.length}:${Math.random().toString(36).slice(2, 7)}`, name, table,
    kind: det.kind, kindConfidence: det.confidence, alternatives: det.alternatives,
    source: src.source, sourceConfidence: src.confidence, mapping: det.mapping,
  };
}

/** Change the kind and/or source of a file (re-maps columns for the new kind). */
export function reanalyzeFile(f: ImportFile, o: { kind?: ChmsFileKind; source?: ChmsSourceSystem }): ImportFile {
  const kind = o.kind ?? f.kind;
  return { ...f, kind, source: o.source ?? f.source, mapping: kind === f.kind ? f.mapping : mapHeaders(f.table.headers, kind), kindConfidence: o.kind ? 1 : f.kindConfidence };
}

/** Manually assign (or clear) one column's field. A field can only be bound to one column. */
export function setColumnField(f: ImportFile, index: number, field: string | null): ImportFile {
  const mapping = f.mapping.map(m => {
    if (m.index === index) return { ...m, field, confidence: field ? 1 : 0 };
    if (field && m.field === field) return { ...m, field: null, confidence: 0 };
    return m;
  });
  return { ...f, mapping };
}

/** Columns the UI should ask a human about: mapped with low confidence. (Unmapped columns are kept in `custom`.) */
export const columnsNeedingReview = (f: ImportFile) => f.mapping.filter(m => m.field && m.confidence < 0.7);
export const unmappedColumns = (f: ImportFile) => f.mapping.filter(m => !m.field);

/** Blocking problems that need the mapping step before this file can be planned. */
export function fileProblems(f: ImportFile): string[] {
  const has = (k: string) => f.mapping.some(m => m.field === k);
  const out: string[] = [];
  const names = (has('firstName') && has('lastName')) || has('fullName');
  switch (f.kind) {
    case 'people': if (!names) out.push('Map a first + last name column (or a single full-name column).'); break;
    case 'households': if (!has('name')) out.push('Map the family / household name column.'); break;
    case 'contributions':
      if (!has('amount')) out.push('Map the Amount column.');
      if (!has('date')) out.push('Map the Gift date column.');
      if (!has('personId') && !has('envelope') && !has('familyId') && !names) out.push('Map at least one way to identify the giver (envelope #, ID, or name).');
      break;
    case 'pledges': if (!has('amount')) out.push('Map the Pledge amount column.'); if (!has('personId') && !has('envelope') && !has('familyId') && !names) out.push('Map a giver column (envelope #, ID, or name).'); break;
    case 'funds': if (!has('name') && !has('code')) out.push('Map the fund name column.'); break;
    case 'attendance': if (!has('date')) out.push('Map the attendance date column.'); break;
    case 'groups': if (!has('group')) out.push('Map the group name column.'); if (!has('personId') && !has('envelope') && !has('familyId') && !names) out.push('Map a person column (ID or name).'); break;
  }
  return out;
}
export const fieldDefsFor = (kind: ChmsFileKind): FieldDef[] => FIELD_DEFS[kind];

// ── Permissions ──────────────────────────────────────────────────────────────
/** Finance imports money; staff import people/attendance. Nobody sees file kinds they cannot import. */
export function allowedKinds(org: Organization | null, member: OrgMembership | null): ChmsFileKind[] {
  const roster = elevateCan(member, org, 'MANAGE_ROSTER');
  const giving = elevateCan(member, org, 'MANAGE_GIVING');
  const out: ChmsFileKind[] = [];
  if (roster || giving) out.push('people', 'households');
  if (giving) out.push('contributions', 'pledges', 'funds');
  if (roster) out.push('attendance', 'groups');
  return out;
}

// ── Plan types ───────────────────────────────────────────────────────────────
export interface WriteOp { coll: string; id: string; data: Record<string, any>; merge: boolean; kind: string; action: 'create' | 'update' }
export interface ImportIssue { file: string; row: number; kind: ChmsFileKind | 'plan'; level: 'error' | 'warning' | 'info'; message: string; cells?: string[] }
export interface FundResolution { key: string; sourceName: string; sourceCode?: string; fundId: string; fundName: string; create: boolean; suggestion?: { fundId: string; fundName: string }; auto?: boolean; count: number; total: number }
export interface UnmatchedGiver { label: string; gifts: number; total: number }
export interface PossibleDuplicate { file: string; row: number; name: string; candidate: string; reason: string }
export interface PlanOptions { fundOverrides?: Record<string, string> /* fund key -> existing fund id | '__new' */ }
export interface PlanCounts { created: number; updated: number; skipped: number; failed: number }
export interface ImportPlan {
  importId: string; orgId: string; uid: string; sourceSystem: string; fileNames: string[]; builtAt: number;
  ops: WriteOp[];
  counts: Record<string, PlanCounts>;
  issues: ImportIssue[];
  funds: FundResolution[]; newFunds: GivingFund[];
  unmatchedGivers: UnmatchedGiver[]; possibleDuplicates: PossibleDuplicate[];
  totals: { gifts: number; amount: number; byFund: Record<string, { count: number; amount: number }>; byYear: Record<string, { count: number; amount: number }>; negativeFlagged: number; negativeTotal: number };
  samples: Record<string, { action: string; text: string }[]>;
  checklist: string[];
  warnings: string[];
  runtime: { nextOp: number; failed: { op: WriteOp; message: string }[]; fundsSaved: boolean; ledgerWritten: boolean };
}

const KIND_ORDER: ChmsFileKind[] = ['funds', 'households', 'people', 'groups', 'pledges', 'contributions', 'attendance'];
const COLL_ORDER = ['chmsHouseholds', 'chmsPeople', 'chmsBatches', 'chmsPledges', 'chmsContributions', 'chmsAttendance'];

const nk = (s: string | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const NICK: Record<string, string> = { bill: 'william', billy: 'william', will: 'william', bob: 'robert', bobby: 'robert', rob: 'robert', jim: 'james', jimmy: 'james', jack: 'john', johnny: 'john', mike: 'michael', tom: 'thomas', tommy: 'thomas', dick: 'richard', rick: 'richard', rich: 'richard', liz: 'elizabeth', beth: 'elizabeth', betty: 'elizabeth', kate: 'katherine', katie: 'katherine', kathy: 'katherine', cathy: 'katherine', peggy: 'margaret', maggie: 'margaret', meg: 'margaret', sue: 'susan', suzy: 'susan', debbie: 'deborah', deb: 'deborah', chris: 'christopher', dave: 'david', steve: 'stephen', ted: 'edward', ed: 'edward', eddie: 'edward', joe: 'joseph', tony: 'anthony', dan: 'daniel', danny: 'daniel', matt: 'matthew', nick: 'nicholas', sam: 'samuel', andy: 'andrew', pat: 'patricia', patty: 'patricia', jen: 'jennifer', jenny: 'jennifer' };
const canonFirst = (s: string) => { const k = (s || '').toLowerCase().trim().split(/\s+/)[0]; return NICK[k] || k; };

function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.filter(x => x !== undefined).map(clean) as any;
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v as any)) if (x !== undefined) o[k] = clean(x);
    return o;
  }
  return v;
}
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

async function loadColl<T>(coll: string, orgId: string, warnings: string[], label: string): Promise<T[]> {
  try {
    const snap = await getDocs(query(collection(db, coll), where('orgId', '==', orgId)));
    return snap.docs.map(d => ({ ...(d.data() as any), id: d.id }) as T);
  } catch (e: any) {
    warnings.push(`Could not read existing ${label} (${e?.code || e?.message || 'error'}) - duplicates against them cannot be detected.`);
    return [];
  }
}

// ── Plan builder ─────────────────────────────────────────────────────────────
interface PDraft { id: string; data: ChmsPerson; isNew: boolean; patch: Record<string, any>; touched: boolean }
interface HDraft { id: string; data: ChmsHousehold; isNew: boolean; patch: Record<string, any>; headSource?: string }

export async function buildPlan(
  ctx: { org: Organization; uid: string },
  files: ImportFile[],
  opts: PlanOptions = {},
  onProgress?: (msg: string) => void,
): Promise<ImportPlan> {
  const { org, uid } = ctx;
  const orgId = org.id;
  const now = Date.now();
  const importId = `imp_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const warnings: string[] = [];
  const issues: ImportIssue[] = [];
  const counts: Record<string, PlanCounts> = {};
  const bump = (k: string, f: keyof PlanCounts, n = 1) => { (counts[k] ||= { created: 0, updated: 0, skipped: 0, failed: 0 })[f] += n; };
  const samples: ImportPlan['samples'] = {};
  const sample = (k: string, action: string, text: string) => { const a = (samples[k] ||= []); if (a.length < 6) a.push({ action, text }); };
  const kinds = new Set(files.map(f => f.kind));
  const systems = Array.from(new Set(files.map(f => f.source)));
  const sourceSystem = systems.join('+') || 'generic';
  const today = new Date().toISOString().slice(0, 10);

  const issue = (f: ImportFile, i: number, level: ImportIssue['level'], message: string) =>
    issues.push({ file: f.name, row: f.table.leadingRowsSkipped + 2 + i, kind: f.kind, level, message, cells: f.table.rows[i] });

  // ── Existing data ──
  onProgress?.('Reading existing records…');
  const needPeople = kinds.has('people') || kinds.has('contributions') || kinds.has('pledges') || kinds.has('attendance') || kinds.has('groups') || kinds.has('households');
  const [exPeople, exHouseholds, exContribs, exPledges, exAttend, exBatches] = await Promise.all([
    needPeople ? loadColl<ChmsPerson>(CHMS_COLL.people, orgId, warnings, 'people') : Promise.resolve([] as ChmsPerson[]),
    needPeople ? loadColl<ChmsHousehold>(CHMS_COLL.households, orgId, warnings, 'households') : Promise.resolve([] as ChmsHousehold[]),
    kinds.has('contributions') ? loadColl<ChmsContribution>(CHMS_COLL.contributions, orgId, warnings, 'contributions') : Promise.resolve([] as ChmsContribution[]),
    kinds.has('pledges') || kinds.has('contributions') ? loadColl<ChmsPledge>(CHMS_COLL.pledges, orgId, warnings, 'pledges') : Promise.resolve([] as ChmsPledge[]),
    kinds.has('attendance') ? loadColl<ChmsAttendance>(CHMS_COLL.attendance, orgId, warnings, 'attendance') : Promise.resolve([] as ChmsAttendance[]),
    kinds.has('contributions') ? loadColl<ChmsBatch>(CHMS_COLL.batches, orgId, warnings, 'batches') : Promise.resolve([] as ChmsBatch[]),
  ]);

  // ── People / household indices ──
  const pdrafts = new Map<string, PDraft>();
  const hdrafts = new Map<string, HDraft>();
  const pBySource = new Map<string, PDraft>(), pByRawSource = new Map<string, PDraft>(), pByEmail = new Map<string, PDraft>(),
    pByNameDob = new Map<string, PDraft>(), pByNamePhone = new Map<string, PDraft>(), pByHhName = new Map<string, PDraft>(),
    pByFull = new Map<string, PDraft[]>(), pByLast = new Map<string, PDraft[]>(), pByEnv = new Map<string, PDraft[]>(), pByHh = new Map<string, PDraft[]>();
  const hBySource = new Map<string, HDraft>(), hByNameAddr = new Map<string, HDraft>(), hBySynth = new Map<string, HDraft>();
  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) { if (!a.includes(v)) a.push(v); } else m.set(k, [v]); };
  const digits = (s?: string) => (s || '').replace(/\D/g, '').slice(-10);
  const hKeyNameAddr = (name?: string, a1?: string) => `${nk(name)}|${nk(a1)}`;

  const indexPerson = (d: PDraft) => {
    const p = d.data;
    if (p.source?.id) { pBySource.set(`${p.source.system}:${p.source.id}`, d); pByRawSource.set(p.source.id, d); }
    if (p.email) pByEmail.set(p.email.toLowerCase(), d);
    const fk = `${nk(p.firstName)}|${nk(p.lastName)}`;
    if (p.birthDate) pByNameDob.set(`${fk}|${p.birthDate}`, d);
    if (digits(p.phone).length >= 7) pByNamePhone.set(`${fk}|${digits(p.phone)}`, d);
    if (p.householdId) { pByHhName.set(`${p.householdId}|${fk}`, d); push(pByHh, p.householdId, d); }
    push(pByFull, fk, d);
    push(pByLast, nk(p.lastName), d);
    const env = p.custom?.['Envelope #'];
    if (env) push(pByEnv, nk(env), d);
  };
  const indexHousehold = (h: HDraft) => {
    if (h.data.source?.id) hBySource.set(`${h.data.source.system}:${h.data.source.id}`, h);
    hByNameAddr.set(hKeyNameAddr(h.data.name, h.data.address?.line1), h);
  };
  exPeople.forEach(p => { const d: PDraft = { id: p.id, data: p, isNew: false, patch: {}, touched: false }; pdrafts.set(p.id, d); indexPerson(d); });
  exHouseholds.forEach(h => { const d: HDraft = { id: h.id, data: h, isNew: false, patch: {} }; hdrafts.set(h.id, d); indexHousehold(d); });
  const existingPeopleCount = exPeople.length;

  const applyPatchP = (d: PDraft, patch: Record<string, any>) => {
    for (const [k, v] of Object.entries(patch)) (d.data as any)[k] = v;
    if (!d.isNew) Object.assign(d.patch, patch);
  };
  const applyPatchH = (d: HDraft, patch: Record<string, any>) => {
    for (const [k, v] of Object.entries(patch)) (d.data as any)[k] = v;
    if (!d.isNew) Object.assign(d.patch, patch);
  };

  // ── Funds ──
  const orgFunds: GivingFund[] = org.givingFunds || [];
  const usedFundIds = new Set(orgFunds.map(x => x.id));
  const fundRes = new Map<string, FundResolution>();
  const newFunds: GivingFund[] = [];
  const fundCodeName = new Map<string, string>();
  const fundGoal = new Map<string, number>();
  const uniqueFundId = (base: string) => { let id = base, n = 2; while (usedFundIds.has(id)) id = `${base}-${n++}`; usedFundIds.add(id); return id; };
  const resolveFund = (nameRaw?: string, codeRaw?: string): FundResolution => {
    let label = (nameRaw || '').trim();
    const code = (codeRaw || '').trim();
    if (!label && code) label = fundCodeName.get(code.toLowerCase()) || code;
    if (!label) label = 'General';
    const key = label.toLowerCase();
    const hit = fundRes.get(key);
    if (hit) return hit;
    const slug = slugify(label);
    let match = orgFunds.find(x => x.name.trim().toLowerCase() === key) || orgFunds.find(x => x.id.toLowerCase() === key || x.id.toLowerCase() === slug || (code && x.id.toLowerCase() === code.toLowerCase()))
      || orgFunds.find(x => slugify(x.name) === slug);
    if (!match && key === 'general') match = orgFunds.find(x => /general/i.test(x.name));
    let suggestion: FundResolution['suggestion']; let auto = false;
    if (!match) {
      let best: GivingFund | undefined, bs = 0;
      for (const x of [...orgFunds, ...newFunds]) { const s = Math.max(nameSimilarity(x.name, label), x.name.toLowerCase().includes(key) || key.includes(x.name.toLowerCase()) ? 0.8 : 0); if (s > bs) { bs = s; best = x; } }
      if (best && bs >= 0.78) { suggestion = { fundId: best.id, fundName: best.name }; if (bs >= 0.9) { match = best; auto = true; } }
    }
    const ov = opts.fundOverrides?.[key];
    let r: FundResolution;
    if (ov && ov !== '__new') {
      const t = [...orgFunds, ...newFunds].find(x => x.id === ov);
      r = t ? { key, sourceName: label, sourceCode: code || undefined, fundId: t.id, fundName: t.name, create: false, suggestion, count: 0, total: 0 } : null as any;
    } else r = null as any;
    if (!r) {
      if (match && ov !== '__new') r = { key, sourceName: label, sourceCode: code || undefined, fundId: match.id, fundName: match.name, create: false, suggestion, auto, count: 0, total: 0 };
      else {
        const id = uniqueFundId(slug);
        const g = fundGoal.get(code.toLowerCase()) ?? fundGoal.get(key);
        const nf: GivingFund = { id, name: label, ...(g ? { goal: g } : {}) };
        newFunds.push(nf);
        r = { key, sourceName: label, sourceCode: code || undefined, fundId: id, fundName: label, create: true, suggestion, count: 0, total: 0 };
      }
    }
    fundRes.set(key, r);
    return r;
  };

  // ── Row accessor ──
  const accessor = (f: ImportFile) => {
    const idx: Record<string, number> = {};
    f.mapping.forEach(m => { if (m.field) idx[m.field] = m.index; });
    const headerOf = (field: string) => (idx[field] !== undefined ? f.table.headers[idx[field]] : field);
    const get = (cells: string[], field: string) => (idx[field] !== undefined ? (cells[idx[field]] || '').trim() : '');
    const custom = (cells: string[]) => {
      const c: Record<string, string> = {};
      f.mapping.forEach(m => { if (!m.field && (cells[m.index] || '').trim()) c[safeKey(m.header)] = cells[m.index].trim(); });
      return c;
    };
    return { get, custom, headerOf, has: (field: string) => idx[field] !== undefined };
  };

  const ordered = [...files].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
  const peopleFileRows = new Map<string, number>();
  const possibleDuplicates: PossibleDuplicate[] = [];

  // ── Person resolution (shared by gifts / pledges / attendance / groups) ──
  const pickFromGroup = (arr: PDraft[] | undefined, first?: string): PDraft | undefined => {
    if (!arr || !arr.length) return undefined;
    if (first) { const f = canonFirst(first); const m = arr.find(p => canonFirst(p.data.firstName) === f); if (m) return m; }
    return arr.find(p => p.data.householdRole === 'HEAD') || arr[0];
  };
  const resolvePerson = (f: ImportFile, a: ReturnType<typeof accessor>, cells: string[]): { p?: PDraft; label: string } => {
    const sys = f.source;
    let first = tidyName(a.get(cells, 'firstName')), last = tidyName(a.get(cells, 'lastName'));
    if (!first && !last && a.get(cells, 'fullName')) { const s = splitFullName(a.get(cells, 'fullName')); first = s.first; last = s.last; }
    const label = [first, last].filter(Boolean).join(' ') || a.get(cells, 'envelope') && `Envelope ${a.get(cells, 'envelope')}` || a.get(cells, 'personId') && `ID ${a.get(cells, 'personId')}` || '';
    const pid = a.get(cells, 'personId');
    if (pid) { const p = pBySource.get(`${sys}:${pid}`) || pByRawSource.get(pid); if (p) return { p, label: label || `${p.data.firstName} ${p.data.lastName}` }; }
    const env = a.get(cells, 'envelope');
    if (env) { const p = pickFromGroup(pByEnv.get(nk(env)), first); if (p) return { p, label: label || `${p.data.firstName} ${p.data.lastName}` }; }
    const fam = a.get(cells, 'familyId');
    if (fam) { const h = hBySource.get(`${sys}:${fam}`); if (h) { const p = pickFromGroup(pByHh.get(h.id), first); if (p) return { p, label: label || `${p.data.firstName} ${p.data.lastName}` }; } }
    if (last) {
      const arr = pByFull.get(`${nk(first)}|${nk(last)}`);
      if (arr && arr.length === 1) return { p: arr[0], label };
      if (arr && arr.length > 1) { const p = pickFromGroup(arr, first); if (p) return { p, label }; }
      if (!first) { const l = pByLast.get(nk(last)); if (l && l.length === 1) return { p: l[0], label }; }
      // nickname-tolerant
      const l = pByLast.get(nk(last));
      if (l && first) { const c = l.filter(p => canonFirst(p.data.firstName) === canonFirst(first)); if (c.length === 1) return { p: c[0], label }; }
    }
    return { label };
  };

  // ── HOUSEHOLD file ──
  const ensureHousehold = (f: ImportFile, key: { sourceId?: string; name: string; address?: ChmsHousehold['address']; synth?: string; headSource?: string }): HDraft | undefined => {
    const sys = f.source;
    let h: HDraft | undefined;
    if (key.sourceId) h = hBySource.get(`${sys}:${key.sourceId}`);
    if (!h && key.synth) h = hBySynth.get(key.synth);
    if (!h && !key.sourceId && key.name) h = hByNameAddr.get(hKeyNameAddr(key.name, key.address?.line1));
    if (!h) {
      const sid = key.sourceId || (key.synth ? `gen:${stableId(key.synth)}` : `gen:${stableId(key.name + '|' + (key.address?.line1 || ''))}`);
      const id = `h_${stableId(`${orgId}|${sys}|hh|${sid}`)}`;
      h = pdraftsHouse(id, { id, orgId, name: key.name, ...(key.address && Object.keys(key.address).length ? { address: key.address } : {}), source: { system: sys, id: sid, importId }, createdAt: now } as ChmsHousehold);
      h.headSource = key.headSource;
      indexHousehold(h);
      if (key.sourceId) hBySource.set(`${sys}:${key.sourceId}`, h);
      if (key.synth) hBySynth.set(key.synth, h);
      return h;
    }
    const patch: Record<string, any> = {};
    if (key.name && h.data.name !== key.name && h.data.source?.system === sys) patch.name = key.name;
    if (key.address && Object.keys(key.address).length && !same(h.data.address, key.address) && !h.isNew) patch.address = { ...(h.data.address || {}), ...key.address };
    if (!h.data.source) patch.source = { system: sys, id: key.sourceId || `gen:${stableId(key.name)}` };
    if (Object.keys(patch).length) applyPatchH(h, patch);
    if (key.headSource) h.headSource = key.headSource;
    if (key.sourceId) hBySource.set(`${sys}:${key.sourceId}`, h);
    return h;
  };
  function pdraftsHouse(id: string, data: ChmsHousehold): HDraft { const h: HDraft = { id, data, isNew: true, patch: {} }; hdrafts.set(id, h); return h; }

  const addrOf = (a: ReturnType<typeof accessor>, cells: string[]): NonNullable<ChmsPerson['address']> => {
    const o: NonNullable<ChmsPerson['address']> = {};
    const l1 = a.get(cells, 'address1'), l2 = a.get(cells, 'address2'), c = a.get(cells, 'city'), s = normState(a.get(cells, 'state')), z = normZip(a.get(cells, 'zip'));
    if (l1) o.line1 = l1; if (l2) o.line2 = l2; if (c) o.city = tidyName(c); if (s) o.region = s; if (z) o.postal = z;
    return o;
  };

  for (const f of ordered.filter(x => x.kind === 'households')) {
    onProgress?.(`Reading households from ${f.name}…`);
    const a = accessor(f);
    f.table.rows.forEach((cells, i) => {
      const name = tidyName(a.get(cells, 'name'));
      if (!name) { issue(f, i, 'error', 'No family name'); bump('households', 'failed'); return; }
      const h = ensureHousehold(f, { sourceId: a.get(cells, 'sourceId') || undefined, name, address: addrOf(a, cells), headSource: a.get(cells, 'headSourceId') || undefined });
      if (h) sample('households', h.isNew ? 'create' : 'update', name);
    });
  }

  // ── FUNDS file ──
  for (const f of ordered.filter(x => x.kind === 'funds')) {
    const a = accessor(f);
    f.table.rows.forEach((cells, i) => {
      const name = a.get(cells, 'name'), code = a.get(cells, 'code');
      if (!name && !code) { issue(f, i, 'warning', 'Empty fund row'); return; }
      if (code && name) fundCodeName.set(code.toLowerCase(), name);
      const goal = parseAmount(a.get(cells, 'goal'));
      if (goal.ok && goal.value > 0) { fundGoal.set(name.toLowerCase(), goal.value); if (code) fundGoal.set(code.toLowerCase(), goal.value); }
    });
  }
  for (const f of ordered.filter(x => x.kind === 'funds')) {
    const a = accessor(f);
    f.table.rows.forEach((cells) => {
      const name = a.get(cells, 'name'), code = a.get(cells, 'code');
      if (!name && !code) return;
      const r = resolveFund(name, code);
      bump('funds', r.create ? 'created' : 'skipped');
      sample('funds', r.create ? 'create' : 'exists', r.fundName);
    });
  }

  // ── PEOPLE ──
  for (const f of ordered.filter(x => x.kind === 'people')) {
    onProgress?.(`Matching people in ${f.name}…`);
    const a = accessor(f);
    const sys = f.source;
    let failed = 0;
    f.table.rows.forEach((cells, i) => {
      let first = tidyName(a.get(cells, 'firstName')), last = tidyName(a.get(cells, 'lastName'));
      if (!first && !last && a.get(cells, 'fullName')) { const s = splitFullName(a.get(cells, 'fullName')); first = s.first; last = s.last; }
      else if (first && !last && a.get(cells, 'fullName') && !a.has('lastName')) { const s = splitFullName(a.get(cells, 'fullName')); if (s.last) last = s.last; }
      if (!first && !last) { issue(f, i, 'error', 'Row has no name'); failed++; return; }
      const custom: Record<string, string> = a.custom(cells);
      const warn = (m: string) => issue(f, i, 'warning', m);

      const bd = normDate(a.get(cells, 'birthDate'), { past: true });
      if (bd.warning) { warn(bd.warning + ' (birth date kept in custom fields)'); custom[safeKey(a.headerOf('birthDate') + ' (unparsed)')] = a.get(cells, 'birthDate'); }
      else if (bd.value && bd.value > today) warn('Birth date is in the future');
      const dateField = (field: string, opts2: { past?: boolean } = {}) => {
        const raw = a.get(cells, field); if (!raw) return undefined;
        const r = normDate(raw, opts2);
        if (r.warning) { warn(`${r.warning} in ${a.headerOf(field)} (kept in custom fields)`); custom[safeKey(a.headerOf(field) + ' (unparsed)')] = raw; return undefined; }
        return r.value;
      };
      const anniversary = dateField('anniversary', { past: true });
      const memberSince = dateField('memberSince', { past: true });
      const baptismDate = dateField('baptismDate', { past: true });

      const emailRaw = a.get(cells, 'email'); const email = normEmail(emailRaw);
      if (emailRaw && !email) { warn(`Invalid email "${emailRaw}" (kept in custom fields)`); custom['Email (invalid)'] = emailRaw; }
      const email2Raw = a.get(cells, 'email2'); if (email2Raw) custom['Email 2'] = normEmail(email2Raw) || email2Raw;
      const cell = normPhone(a.get(cells, 'cellPhone')), home = normPhone(a.get(cells, 'homePhone')), work = normPhone(a.get(cells, 'workPhone'));
      const phone = cell || home || work;
      if (cell && home && home !== cell) custom['Home Phone'] = home;
      if (work && work !== phone) custom['Work Phone'] = work;
      const env = a.get(cells, 'envelope'); if (env) custom['Envelope #'] = env;
      const sourceId = a.get(cells, 'sourceId');
      const gender = normGender(a.get(cells, 'gender'));
      const statusRaw = a.get(cells, 'status');
      const address = addrOf(a, cells);
      const tags = a.get(cells, 'tags').split(/[;|,]+/).map(s => s.trim()).filter(Boolean);
      const skills = a.get(cells, 'skills').split(/[;|,]+/).map(s => s.trim()).filter(Boolean);

      // household
      let hh: HDraft | undefined;
      const famId = a.get(cells, 'familyId'), famName = tidyName(a.get(cells, 'householdName'));
      if (famId) hh = ensureHousehold(f, { sourceId: famId, name: famName || `${last} Family`, address });
      else if (address.line1) hh = ensureHousehold(f, { name: famName || `${last} Family`, address, synth: `${nk(last)}|${nk(address.line1)}|${nk(address.postal)}` });
      const role = mapHouseholdRole(a.get(cells, 'householdRole'));

      // match chain
      let d: PDraft | undefined; let how = '';
      if (sourceId) { d = pBySource.get(`${sys}:${sourceId}`); if (d) how = 'source id'; }
      if (!d && email) { d = pByEmail.get(email); if (d && !(nk(d.data.lastName) === nk(last))) d = undefined; else if (d) how = 'email'; }
      const fk = `${nk(first)}|${nk(last)}`;
      if (!d && bd.value) { d = pByNameDob.get(`${fk}|${bd.value}`); if (d) how = 'name + birth date'; }
      if (!d && phone && digits(phone).length >= 7) { d = pByNamePhone.get(`${fk}|${digits(phone)}`); if (d) how = 'name + phone'; }
      if (!d && hh) { d = pByHhName.get(`${hh.id}|${fk}`); if (d) how = 'household + name'; }

      const incoming: Record<string, any> = {
        firstName: first, lastName: last,
        ...(hh ? { householdId: hh.id } : {}), ...(role ? { householdRole: role } : {}),
        preferredName: tidyName(a.get(cells, 'preferredName')) || undefined,
        email, phone, ...(Object.keys(address).length ? { address } : {}),
        birthDate: bd.value, anniversary, gender, maritalStatus: a.get(cells, 'maritalStatus') || undefined,
        ...(a.has('status') && statusRaw ? { status: mapStatus(statusRaw) } : {}),
        memberSince, baptismDate,
      };
      if (statusRaw) custom['Original Status'] = statusRaw; // keep the source wording alongside the mapped status
      if (!/^[A-Za-z' .-]+$/.test(first + last)) warn('Name contains unusual characters');

      if (d) {
        const ex = d.data as any;
        const patch: Record<string, any> = {};
        for (const [k, v] of Object.entries(incoming)) {
          if (v === undefined || v === '') continue;
          if (k === 'address') { const merged = { ...(ex.address || {}), ...(v as any) }; if (!same(merged, ex.address)) patch.address = merged; }
          else if (!same(ex[k], v)) patch[k] = v;
        }
        if (tags.length) { const t = Array.from(new Set([...(ex.tags || []), ...tags])); if (!same(t, ex.tags)) patch.tags = t; }
        if (skills.length) { const t = Array.from(new Set([...(ex.skills || []), ...skills])); if (!same(t, ex.skills)) patch.skills = t; }
        const cm = { ...(ex.custom || {}) }; let cchg = false;
        for (const [k, v] of Object.entries(custom)) if (cm[k] !== v) { cm[k] = v; cchg = true; }
        if (cchg) patch.custom = cm;
        if (!ex.source) patch.source = { system: sys, id: sourceId || `gen:${stableId(fk + (bd.value || ''))}` };
        if (Object.keys(patch).length) patch.updatedAt = now;
        const changed = Object.keys(patch).length > 0;
        if (d.touched) warn(`Repeated person in the same import (matched by ${how}); fields merged`);
        if (changed) applyPatchP(d, patch);
        d.touched = true;
        peopleFileRows.set(d.id, i);
        if (changed && !d.isNew) sample('people', 'update', `${first} ${last} (matched by ${how})`);
      } else {
        const sid = sourceId || `gen:${stableId(`${fk}|${bd.value || ''}|${email || ''}|${digits(phone)}`)}`;
        const id = `p_${stableId(`${orgId}|${sys}|person|${sid}`)}`;
        const existingSameId = pdrafts.get(id);
        if (existingSameId) { // deterministic-id collision with an existing doc imported earlier
          existingSameId.touched = true; return;
        }
        const data: ChmsPerson = clean({
          id, orgId, ...(incoming as any),
          status: (incoming.status as any) || 'REGULAR',
          ...(tags.length ? { tags } : {}), ...(skills.length ? { skills } : {}),
          ...(Object.keys(custom).length ? { custom } : {}),
          source: { system: sys, id: sid, importId }, createdAt: now, updatedAt: now,
        });
        d = { id, data, isNew: true, patch: {}, touched: true };
        pdrafts.set(id, d);
        // fuzzy duplicate hint (before indexing self)
        const cands = pByLast.get(nk(last)) || [];
        for (const c of cands) {
          if (c.id === id) continue;
          const sim = canonFirst(c.data.firstName) === canonFirst(first) ? 1 : nameSimilarity(c.data.firstName, first);
          if (sim < 0.8) continue;
          const reasons: string[] = [];
          if (c.data.address?.postal && address.postal && c.data.address.postal === address.postal) reasons.push('same ZIP');
          if (c.data.birthDate && bd.value && c.data.birthDate.slice(0, 4) === bd.value.slice(0, 4)) reasons.push('same birth year');
          if (c.data.address?.line1 && address.line1 && nk(c.data.address.line1) === nk(address.line1)) reasons.push('same street');
          if (c.data.email && email && c.data.email === email) reasons.push('same email');
          if (c.data.householdId && hh && c.data.householdId === hh.id) reasons.push('same household');
          if (reasons.length || sim === 1) {
            possibleDuplicates.push({ file: f.name, row: f.table.leadingRowsSkipped + 2 + i, name: `${first} ${last}`, candidate: `${c.data.firstName} ${c.data.lastName}`, reason: sim === 1 && !reasons.length ? 'same name' : reasons.join(', ') });
            warn(`Possible duplicate of ${c.data.firstName} ${c.data.lastName} (${reasons.join(', ') || 'same name'}) - created anyway; review in People`);
            break;
          }
        }
        sample('people', 'create', `${first} ${last}${email ? ' · ' + email : ''}`);
      }
      indexPerson(d);
      if (hh) {
        if (!hh.data.headPersonId && ((role === 'HEAD') || (hh.headSource && sourceId && hh.headSource === sourceId))) applyPatchH(hh, { headPersonId: d.id });
      }
    });
    bump('people', 'failed', failed);
  }
  // set heads on households that lack one (first adult / first member)
  for (const h of hdrafts.values()) {
    if (h.data.headPersonId) continue;
    const members = pByHh.get(h.id);
    if (members?.length && members.some(m => m.isNew || m.touched)) applyPatchH(h, { headPersonId: (members.find(m => m.data.householdRole === 'HEAD') || members[0]).id });
  }

  // ── GROUPS ──
  for (const f of ordered.filter(x => x.kind === 'groups')) {
    const a = accessor(f);
    f.table.rows.forEach((cells, i) => {
      const g = a.get(cells, 'group');
      if (!g) { issue(f, i, 'error', 'No group name'); bump('groups', 'failed'); return; }
      const { p, label } = resolvePerson(f, a, cells);
      if (!p) { issue(f, i, 'error', `Person "${label || '?'}" not found - import People first`); bump('groups', 'failed'); return; }
      const tag = `group:${g}`;
      if ((p.data.tags || []).includes(tag)) { bump('groups', 'skipped'); return; }
      applyPatchP(p, { tags: [...(p.data.tags || []), tag], updatedAt: now });
      bump('groups', 'created'); sample('groups', 'tag', `${label} → ${g}`);
    });
  }

  // ── PLEDGES ──
  const pledgeIndex = new Map<string, string>(); // key -> doc id
  const exPledgeIds = new Set(exPledges.map(p => p.id));
  const pledgeBySource = new Map<string, string>();
  exPledges.forEach(p => { if (p.source?.id) pledgeBySource.set(p.source.id, p.id); pledgeIndex.set(`${p.personId || nk(p.giverName)}|${p.fundId}|${p.startDate}|${p.amount}`, p.id); });
  const unmatched = new Map<string, UnmatchedGiver>();
  const noteUnmatched = (label: string, amt: number) => { const k = label || '(no name)'; const u = unmatched.get(k) || { label: k, gifts: 0, total: 0 }; u.gifts++; u.total += amt; unmatched.set(k, u); };

  const ops: WriteOp[] = [];
  for (const f of ordered.filter(x => x.kind === 'pledges')) {
    onProgress?.(`Reading pledges from ${f.name}…`);
    const a = accessor(f);
    f.table.rows.forEach((cells, i) => {
      const amt = parseAmount(a.get(cells, 'amount'));
      if (!amt.ok || amt.value <= 0) { issue(f, i, 'error', amt.negative ? 'Negative pledge amount' : 'Missing or unreadable pledge amount'); bump('pledges', 'failed'); return; }
      const sd = normDate(a.get(cells, 'startDate'));
      const start = sd.value || today;
      if (!sd.value) issue(f, i, 'warning', sd.warning || 'No start date - used today');
      const ed = normDate(a.get(cells, 'endDate'));
      const { p, label } = resolvePerson(f, a, cells);
      if (!p) { issue(f, i, 'warning', `Giver "${label || '?'}" not matched to a person - pledge kept with name only`); noteUnmatched(label, amt.value); }
      const fund = resolveFund(a.get(cells, 'fund'), a.get(cells, 'fundCode'));
      const sourceId = a.get(cells, 'sourceId');
      const key = `${p?.id || nk(label)}|${fund.fundId}|${start}|${amt.value}`;
      const id = `pl_${stableId(`${orgId}|${f.source}|pledge|${sourceId || key}`)}`;
      const exId = (sourceId && pledgeBySource.get(sourceId)) || pledgeIndex.get(key) || (exPledgeIds.has(id) ? id : undefined);
      if (exId) { bump('pledges', 'skipped'); return; }
      const st = a.get(cells, 'status').toLowerCase();
      const data: ChmsPledge = clean({
        id, orgId, personId: p?.id, householdId: p?.data.householdId, giverName: p ? undefined : label || undefined,
        fundId: fund.fundId, fundName: fund.fundName, amount: amt.value, frequency: mapFrequency(a.get(cells, 'frequency')),
        startDate: start, endDate: ed.value, status: /fulfil|complete|paid/.test(st) ? 'FULFILLED' : /cancel|void|inactive|closed/.test(st) ? 'CANCELLED' : 'ACTIVE',
        source: { system: f.source, id: sourceId || `gen:${stableId(key)}`, importId }, createdAt: now,
      });
      pledgeIndex.set(key, id); if (sourceId) pledgeBySource.set(sourceId, id);
      ops.push({ coll: CHMS_COLL.pledges, id, data, merge: false, kind: 'pledges', action: 'create' });
      bump('pledges', 'created'); sample('pledges', 'create', `${label || 'Unknown'} · ${fund.fundName} · ${money(amt.value)} ${data.frequency.toLowerCase()}`);
    });
  }

  // ── CONTRIBUTIONS ──
  const totals: ImportPlan['totals'] = { gifts: 0, amount: 0, byFund: {}, byYear: {}, negativeFlagged: 0, negativeTotal: 0 };
  const exById = new Set(exContribs.map(c => c.id));
  const exBySid = new Set<string>();
  const exByKey = new Set<string>();
  const exKeyCount = new Map<string, number>();
  const giverKeyOfExisting = (c: ChmsContribution) => c.personId || nk(c.giverName);
  exContribs.forEach(c => {
    if (c.source?.id && !c.source.id.startsWith('gen:')) exBySid.add(`${c.source.system}:${c.source.id}`);
    const base = `${c.date}|${c.amount}|${giverKeyOfExisting(c)}|${nk(c.checkNumber)}|${c.fundId}`;
    const n = (exKeyCount.get(base) || 0) + 1; exKeyCount.set(base, n); exByKey.add(`${base}#${n}`);
  });
  const exBatchIds = new Set(exBatches.map(b => b.id));
  const batchAgg = new Map<string, { name: string; date: string; count: number; total: number }>();
  const fileKeyCount = new Map<string, number>();
  const seenSid = new Set<string>();
  const nowYear = new Date().getFullYear();

  for (const f of ordered.filter(x => x.kind === 'contributions')) {
    onProgress?.(`Matching gifts in ${f.name}…`);
    const a = accessor(f);
    // pre-pass: split groups (same check + date + giver across rows)
    const splitCount = new Map<string, number>();
    const splitKey = (cells: string[]) => `${a.get(cells, 'date')}|${nk(a.get(cells, 'checkNumber'))}|${nk(a.get(cells, 'personId') || a.get(cells, 'envelope') || a.get(cells, 'lastName') + a.get(cells, 'firstName') + a.get(cells, 'fullName'))}`;
    if (a.has('checkNumber')) f.table.rows.forEach(cells => { if (a.get(cells, 'checkNumber')) splitCount.set(splitKey(cells), (splitCount.get(splitKey(cells)) || 0) + 1); });

    f.table.rows.forEach((cells, i) => {
      const amt = parseAmount(a.get(cells, 'amount'));
      if (!amt.ok) { issue(f, i, 'error', 'Missing or unreadable amount'); bump('contributions', 'failed'); return; }
      if (amt.negative) { totals.negativeFlagged++; totals.negativeTotal += amt.value; issue(f, i, 'error', `Negative amount (${money(amt.value)} refund / adjustment) - flagged, NOT imported. Record it manually in Giving.`); bump('contributions', 'failed'); return; }
      if (amt.value === 0) { issue(f, i, 'warning', 'Zero amount - skipped'); bump('contributions', 'skipped'); return; }
      const dt = normDate(a.get(cells, 'date'));
      if (!dt.value) { issue(f, i, 'error', dt.warning || 'Missing gift date'); bump('contributions', 'failed'); return; }
      if (dt.value > today) issue(f, i, 'warning', `Gift date ${dt.value} is in the future`);
      if (+dt.value.slice(0, 4) < nowYear - 40) issue(f, i, 'warning', `Gift date ${dt.value} is more than 40 years old - check the year format`);
      const { p, label } = resolvePerson(f, a, cells);
      const fund = resolveFund(a.get(cells, 'fund'), a.get(cells, 'fundCode'));
      const check = a.get(cells, 'checkNumber');
      const sourceId = a.get(cells, 'sourceId');
      const giverKey = p?.id || nk(label) || nk(a.get(cells, 'envelope'));
      let key: string, dupSid = false;
      const sid = sourceId ? `${f.source}:${sourceId}` : '';
      if (sid) { if (seenSid.has(sid)) dupSid = true; seenSid.add(sid); }
      const base = `${dt.value}|${amt.value}|${giverKey}|${nk(check)}|${fund.fundId}`;
      const n = (fileKeyCount.get(base) || 0) + 1; fileKeyCount.set(base, n);
      key = `${base}#${n}`;
      if (dupSid) { issue(f, i, 'warning', `Duplicate source id ${sourceId} within the file - skipped`); bump('contributions', 'skipped'); return; }
      const id = `c_${stableId(`${orgId}|${f.source}|gift|${sid || key}`)}`;
      if (exById.has(id) || (sid && exBySid.has(sid)) || exByKey.has(key)) { bump('contributions', 'skipped'); return; }

      if (!p) { noteUnmatched(label, amt.value); issue(f, i, 'warning', `No matching person for giver "${label || '(blank)'}" - gift imported with name only (see Match givers)`); }
      const method = mapMethod(a.get(cells, 'method'), check);
      const dedRaw = a.get(cells, 'deductible').toLowerCase();
      const deductible = a.has('deductible') ? !/^(no|n|false|0|non)/.test(dedRaw) && !/non.?deduct/.test(dedRaw) : true;
      const batchName = a.get(cells, 'batch');
      let batchId: string | undefined;
      if (batchName) {
        batchId = `b_${stableId(`${orgId}|batch|${batchName}`)}`;
        const ag = batchAgg.get(batchId) || { name: batchName, date: dt.value, count: 0, total: 0 };
        ag.count++; ag.total = Math.round((ag.total + amt.value) * 100) / 100; if (dt.value < ag.date) ag.date = dt.value; batchAgg.set(batchId, ag);
      }
      const pledgeRef = a.get(cells, 'pledge');
      const pledgeId = pledgeRef ? pledgeBySource.get(pledgeRef) : undefined;
      const sk = splitKey(cells);
      const memo = [a.get(cells, 'memo'), pledgeRef && !pledgeId ? `Pledge ref ${pledgeRef}` : ''].filter(Boolean).join(' · ');
      const data: ChmsContribution = clean({
        id, orgId, personId: p?.id, householdId: p?.data.householdId, giverName: p ? undefined : label || undefined,
        fundId: fund.fundId, fundName: fund.fundName, amount: amt.value,
        splitGroupId: check && (splitCount.get(sk) || 0) > 1 ? `sg_${stableId(sk)}` : undefined,
        date: dt.value, method, checkNumber: check || undefined, batchId, pledgeId, memo: memo || undefined,
        tributeNote: a.get(cells, 'tribute') || undefined, deductible,
        source: { system: f.source, id: sourceId || `gen:${stableId(key)}`, importId },
        status: 'POSTED', enteredBy: uid, createdAt: now,
      });
      ops.push({ coll: CHMS_COLL.contributions, id, data, merge: false, kind: 'contributions', action: 'create' });
      bump('contributions', 'created');
      totals.gifts++; totals.amount = Math.round((totals.amount + amt.value) * 100) / 100;
      const bf = (totals.byFund[fund.fundName] ||= { count: 0, amount: 0 }); bf.count++; bf.amount = Math.round((bf.amount + amt.value) * 100) / 100;
      const by = (totals.byYear[dt.value.slice(0, 4)] ||= { count: 0, amount: 0 }); by.count++; by.amount = Math.round((by.amount + amt.value) * 100) / 100;
      fund.count++; fund.total = Math.round((fund.total + amt.value) * 100) / 100;
      sample('contributions', 'create', `${dt.value} · ${p ? `${p.data.firstName} ${p.data.lastName}` : (label || 'Unknown') + ' (unmatched)'} · ${fund.fundName} · ${money(amt.value)}`);
    });
  }
  for (const [id, b] of batchAgg) {
    if (exBatchIds.has(id)) continue;
    const data: ChmsBatch = { id, orgId, name: b.name, date: b.date, expectedTotal: b.total, expectedCount: b.count, status: 'POSTED', openedBy: uid, createdAt: now };
    ops.push({ coll: CHMS_COLL.batches, id, data: clean(data), merge: false, kind: 'batches', action: 'create' });
    bump('batches', 'created');
  }

  // ── ATTENDANCE ──
  const exAttIds = new Set(exAttend.map(x => x.id));
  const seenAtt = new Set<string>();
  for (const f of ordered.filter(x => x.kind === 'attendance')) {
    onProgress?.(`Reading attendance from ${f.name}…`);
    const a = accessor(f);
    f.table.rows.forEach((cells, i) => {
      const dt = normDate(a.get(cells, 'date'));
      if (!dt.value) { issue(f, i, 'error', dt.warning || 'Missing date'); bump('attendance', 'failed'); return; }
      const { p, label } = resolvePerson(f, a, cells);
      if (!p && !label) { issue(f, i, 'warning', 'Head-count-only row (no person) - not imported'); bump('attendance', 'skipped'); return; }
      const grp = a.get(cells, 'group'), ev = a.get(cells, 'event');
      const eventLabel = ev || grp || 'Attendance';
      const eventKey = grp && !ev ? `group:${slugify(grp)}:${dt.value}` : `service:${dt.value}:${slugify(eventLabel)}`;
      const who = p?.id || `guest:${nk(label)}`;
      const id = `a_${stableId(`${orgId}|${eventKey}|${who}`)}`;
      if (exAttIds.has(id) || seenAtt.has(id)) { bump('attendance', 'skipped'); return; }
      seenAtt.add(id);
      if (!p) issue(f, i, 'info', `"${label}" not matched to a person - recorded as a guest`);
      const data: ChmsAttendance = clean({ id, orgId, eventKey, eventLabel, date: dt.value, personId: p?.id, guestName: p ? undefined : label, checkedInBy: uid, checkedInAt: now, source: { system: f.source, id: a.get(cells, 'sourceId') || `gen:${stableId(id)}`, importId } });
      ops.push({ coll: CHMS_COLL.attendance, id, data, merge: false, kind: 'attendance', action: 'create' });
      bump('attendance', 'created'); sample('attendance', 'create', `${dt.value} · ${eventLabel} · ${label || p?.data.firstName}`);
    });
  }

  // ── Materialize people / household ops ──
  const peopleOps: WriteOp[] = [], hhOps: WriteOp[] = [];
  let pNew = 0, pUpd = 0, hNew = 0, hUpd = 0;
  for (const d of pdrafts.values()) {
    if (d.isNew) { peopleOps.push({ coll: CHMS_COLL.people, id: d.id, data: clean(d.data), merge: false, kind: 'people', action: 'create' }); pNew++; }
    else if (Object.keys(d.patch).length) { peopleOps.push({ coll: CHMS_COLL.people, id: d.id, data: clean({ ...d.patch, updatedAt: now }), merge: true, kind: 'people', action: 'update' }); pUpd++; }
  }
  for (const h of hdrafts.values()) {
    if (h.isNew) { hhOps.push({ coll: CHMS_COLL.households, id: h.id, data: clean(h.data), merge: false, kind: 'households', action: 'create' }); hNew++; }
    else if (Object.keys(h.patch).length) { hhOps.push({ coll: CHMS_COLL.households, id: h.id, data: clean(h.patch), merge: true, kind: 'households', action: 'update' }); hUpd++; }
  }
  const personRows = ordered.filter(x => x.kind === 'people').reduce((n, f) => n + f.table.rows.length, 0);
  if (personRows || kinds.has('people')) {
    const c = (counts.people ||= { created: 0, updated: 0, skipped: 0, failed: 0 });
    c.created = pNew; c.updated = pUpd; c.skipped = Math.max(0, personRows - pNew - pUpd - c.failed);
  }
  if (hNew || hUpd || kinds.has('households') || kinds.has('people')) {
    const c = (counts.households ||= { created: 0, updated: 0, skipped: 0, failed: 0 });
    c.created = hNew; c.updated = hUpd;
  }
  if (counts.groups && pUpd) { /* group tag updates are folded into people ops */ }

  const allOps = [...hhOps, ...peopleOps, ...ops].sort((x, y) => COLL_ORDER.indexOf(x.coll) - COLL_ORDER.indexOf(y.coll));

  // ── Funds / unmatched / checklist ──
  const fundList = Array.from(fundRes.values());
  const unmatchedGivers = Array.from(unmatched.values()).sort((x, y) => y.total - x.total);
  const unmatchedGifts = unmatchedGivers.reduce((n, u) => n + u.gifts, 0);
  const checklist: string[] = [];
  const cc = counts;
  const parts: string[] = [];
  if (cc.people && (cc.people.created || cc.people.updated)) parts.push(`${cc.people.created.toLocaleString()} new people${cc.people.updated ? ` (+${cc.people.updated.toLocaleString()} updated)` : ''}`);
  if (cc.households?.created) parts.push(`${cc.households.created.toLocaleString()} households`);
  if (totals.gifts) parts.push(`${totals.gifts.toLocaleString()} gifts totaling ${money(totals.amount)} across ${Object.keys(totals.byFund).length} fund${Object.keys(totals.byFund).length === 1 ? '' : 's'}`);
  if (cc.pledges?.created) parts.push(`${cc.pledges.created.toLocaleString()} pledges`);
  if (cc.attendance?.created) parts.push(`${cc.attendance.created.toLocaleString()} attendance records`);
  if (cc.groups?.created) parts.push(`${cc.groups.created.toLocaleString()} group memberships`);
  checklist.push(parts.length ? `Will import: ${parts.join('; ')}.` : 'Nothing new to import - everything in these files already exists.');
  const skippedTotal = Object.values(cc).reduce((n, c) => n + c.skipped, 0);
  if (skippedTotal) checklist.push(`${skippedTotal.toLocaleString()} rows are already in Plajah (or unchanged) and will be skipped - nothing is duplicated.`);
  if (newFunds.length) checklist.push(`${newFunds.length} fund${newFunds.length === 1 ? '' : 's'} will be created: ${newFunds.map(x => x.name).slice(0, 6).join(', ')}${newFunds.length > 6 ? '…' : ''}.`);
  if (unmatchedGifts) checklist.push(`${unmatchedGifts.toLocaleString()} gifts have no matching person (${unmatchedGivers.length} giver${unmatchedGivers.length === 1 ? '' : 's'}) - they import by name and appear in the "Match givers" queue. Review recommended.`);
  if (totals.negativeFlagged) checklist.push(`${totals.negativeFlagged} negative amounts (${money(totals.negativeTotal)}) were flagged and will not be imported.`);
  if (possibleDuplicates.length) checklist.push(`${possibleDuplicates.length} possible duplicate people were flagged for review (still created - nothing merged automatically).`);
  const errs = issues.filter(x => x.level === 'error').length;
  if (errs) checklist.push(`${errs.toLocaleString()} rows have errors and will be skipped - download the error report after import.`);
  checklist.push('Every record is stamped with this import and can be rolled back from Import History.');

  void existingPeopleCount;
  return {
    importId, orgId, uid, sourceSystem, fileNames: files.map(f => f.name), builtAt: now,
    ops: allOps, counts, issues, funds: fundList, newFunds, unmatchedGivers, possibleDuplicates, totals, samples, checklist, warnings,
    runtime: { nextOp: 0, failed: [], fundsSaved: false, ledgerWritten: false },
  };
}

// ── Commit ───────────────────────────────────────────────────────────────────
export interface CommitProgress { phase: 'funds' | 'ledger' | 'writing' | 'done'; done: number; total: number; message?: string }
export interface CommitResult { ledger: ChmsImport; completed: boolean; nextOp: number; failed: { kind: string; id: string; message: string }[] }

const CHUNK = 400;

/** Write the plan in 400-doc batches. Safe to call again with the same plan to resume (ops use deterministic ids). */
export async function commitPlan(
  plan: ImportPlan,
  ctx: { org: Organization; uid: string },
  onProgress?: (p: CommitProgress) => void,
  o: { rollbackAllowed?: boolean } = {},
): Promise<CommitResult> {
  const { org } = ctx;
  const rt = plan.runtime;
  const total = plan.ops.length;
  const ledgerRef = doc(db, CHMS_COLL.imports, plan.importId);
  const baseLedger = (status: ChmsImport['status']): ChmsImport & Record<string, any> => ({
    id: plan.importId, orgId: plan.orgId, sourceSystem: plan.sourceSystem, startedBy: plan.uid, startedAt: plan.builtAt,
    counts: adjustedCounts(plan), status, fileNames: plan.fileNames,
    warnings: [...plan.warnings, ...plan.issues.filter(i => i.level === 'error').slice(0, 20).map(i => `${i.file} row ${i.row}: ${i.message}`)].slice(0, 40),
    rollbackAllowed: o.rollbackAllowed !== false,
    totals: { gifts: plan.totals.gifts, amount: plan.totals.amount },
  });

  if (!rt.ledgerWritten) {
    onProgress?.({ phase: 'ledger', done: 0, total, message: 'Opening import ledger…' });
    await setDoc(ledgerRef, clean(baseLedger('RUNNING')));
    rt.ledgerWritten = true;
  } else {
    await setDoc(ledgerRef, { status: 'RUNNING' }, { merge: true });
  }

  if (plan.newFunds.length && !rt.fundsSaved) {
    onProgress?.({ phase: 'funds', done: 0, total, message: `Creating ${plan.newFunds.length} funds…` });
    try {
      const have = new Set((org.givingFunds || []).map(x => x.id));
      await updateOrganization(org.id, { givingFunds: [...(org.givingFunds || []), ...plan.newFunds.filter(x => !have.has(x.id))] });
      rt.fundsSaved = true;
    } catch (e: any) {
      plan.warnings.push(`Could not add new funds to the organization (${e?.code || e?.message}). Gifts still carry their fund names; add the funds in Giving settings.`);
    }
  }

  const failures: CommitResult['failed'] = [];
  let consecutiveDead = 0;
  let i = rt.nextOp;
  while (i < total) {
    const slice = plan.ops.slice(i, i + CHUNK);
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        const b = writeBatch(db);
        for (const op of slice) { const r = doc(db, op.coll, op.id); op.merge ? b.set(r, op.data, { merge: true }) : b.set(r, op.data); }
        await b.commit();
        ok = true;
      } catch { /* retry, then isolate */ }
    }
    if (!ok) {
      let succeeded = 0;
      for (const op of slice) {
        try { await setDoc(doc(db, op.coll, op.id), op.data, op.merge ? { merge: true } : {}); succeeded++; }
        catch (e: any) {
          const message = e?.code === 'permission-denied' ? 'Permission denied' : (e?.message || 'Write failed');
          rt.failed.push({ op, message }); failures.push({ kind: op.kind, id: op.id, message });
        }
      }
      consecutiveDead = succeeded === 0 ? consecutiveDead + 1 : 0;
    } else consecutiveDead = 0;
    i += slice.length;
    rt.nextOp = i;
    onProgress?.({ phase: 'writing', done: i, total, message: `${i.toLocaleString()} of ${total.toLocaleString()} records written` });
    if (consecutiveDead >= 3) {
      rt.nextOp = i - slice.length * 0; // everything up to here was attempted; failed ones are listed
      await setDoc(ledgerRef, clean({ ...baseLedger('FAILED'), warnings: [...(baseLedger('FAILED').warnings || []), 'Import stopped: repeated write failures (offline or permissions). Safe to resume.'] }), { merge: true });
      return { ledger: baseLedger('FAILED'), completed: false, nextOp: rt.nextOp, failed: failures };
    }
  }

  const ledger = baseLedger('DONE');
  await setDoc(ledgerRef, clean(ledger), { merge: true });
  onProgress?.({ phase: 'done', done: total, total });
  return { ledger, completed: true, nextOp: total, failed: rt.failed.map(f => ({ kind: f.op.kind, id: f.op.id, message: f.message })) };
}

/** Plan counts with committed failures moved from created/updated into failed. */
export function adjustedCounts(plan: ImportPlan): Record<string, PlanCounts> {
  const c: Record<string, PlanCounts> = JSON.parse(JSON.stringify(plan.counts));
  for (const f of plan.runtime.failed) {
    const k = (c[f.op.kind] ||= { created: 0, updated: 0, skipped: 0, failed: 0 });
    if (f.op.action === 'update') k.updated = Math.max(0, k.updated - 1); else k.created = Math.max(0, k.created - 1);
    k.failed++;
  }
  return c;
}

/** CSV of every skipped / failed / flagged row (with the original cells) + commit failures. */
export function buildIssuesCsv(plan: ImportPlan): string {
  const rows: (string | number)[][] = [['File', 'Row', 'Kind', 'Level', 'Problem', 'Original row']];
  for (const i of plan.issues) rows.push([i.file, i.row, i.kind, i.level, i.message, (i.cells || []).join(' | ')]);
  for (const f of plan.runtime.failed) rows.push(['(write)', '', f.op.kind, 'error', `${f.message} (doc ${f.op.id})`, '']);
  return toCsv(rows);
}

// ── History + rollback ───────────────────────────────────────────────────────
export async function fetchImports(orgId: string): Promise<(ChmsImport & { rollbackAllowed?: boolean; rolledBackAt?: number; totals?: { gifts: number; amount: number } })[]> {
  const snap = await getDocs(query(collection(db, CHMS_COLL.imports), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ ...(d.data() as any), id: d.id })).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export interface RollbackResult { deleted: number; voided: number; failed: number; skipped: string[]; message: string }

/**
 * Undo one import: deletes ONLY docs this import created (source.importId == importId).
 * Gifts are never deleted (rules forbid it) - they are set to VOID with reason "import rolled back".
 * Records merely UPDATED by the import are left as they are. Funds and empty batches created by the import stay.
 * `kinds` limits what the caller may touch (finance: gifts/pledges; staff: people/households/attendance).
 */
export async function rollbackImport(
  orgId: string, importId: string, uid: string,
  o: { canMoney: boolean; canPeople: boolean },
  onProgress?: (msg: string) => void,
): Promise<RollbackResult> {
  const res: RollbackResult = { deleted: 0, voided: 0, failed: 0, skipped: [], message: '' };
  const q = (coll: string) => getDocs(query(collection(db, coll), where('orgId', '==', orgId), where('source.importId', '==', importId)));
  const now = Date.now();

  const run = async (coll: string, mode: 'delete' | 'void') => {
    onProgress?.(`Rolling back ${coll.replace('chms', '').toLowerCase()}…`);
    let docs: any[];
    try { docs = (await q(coll)).docs; } catch (e: any) { res.skipped.push(`${coll}: ${e?.code || 'cannot read'}`); return; }
    for (let i = 0; i < docs.length; i += CHUNK) {
      const slice = docs.slice(i, i + CHUNK).filter(d => mode === 'delete' || (d.data() as any).status !== 'VOID');
      const apply = (b: ReturnType<typeof writeBatch>, d: any) => mode === 'delete' ? b.delete(d.ref) : b.update(d.ref, { status: 'VOID', voidedBy: uid, voidReason: 'import rolled back', voidedAt: now });
      try {
        const b = writeBatch(db); slice.forEach(d => apply(b, d)); await b.commit();
        mode === 'delete' ? (res.deleted += slice.length) : (res.voided += slice.length);
      } catch {
        for (const d of slice) {
          try {
            if (mode === 'delete') { const b = writeBatch(db); b.delete(d.ref); await b.commit(); res.deleted++; }
            else { await updateDoc(d.ref, { status: 'VOID', voidedBy: uid, voidReason: 'import rolled back', voidedAt: now }); res.voided++; }
          } catch { res.failed++; }
        }
      }
    }
  };

  if (o.canMoney) { await run(CHMS_COLL.contributions, 'void'); await run(CHMS_COLL.pledges, 'delete'); } else res.skipped.push('Gifts and pledges (finance permission needed)');
  if (o.canPeople) { await run(CHMS_COLL.attendance, 'delete'); await run(CHMS_COLL.people, 'delete'); await run(CHMS_COLL.households, 'delete'); } else res.skipped.push('People, households and attendance (staff permission needed)');

  const complete = res.failed === 0 && res.skipped.length === 0;
  try {
    await setDoc(doc(db, CHMS_COLL.imports, importId), complete
      ? { status: 'ROLLED_BACK', rolledBackAt: now, rolledBackBy: uid, rollbackAllowed: false }
      : { rollbackNote: `Partial rollback ${new Date(now).toISOString()}: ${res.deleted} deleted, ${res.voided} voided, ${res.failed} failed`, lastRollbackAt: now }, { merge: true });
  } catch { /* ledger update is best-effort */ }
  res.message = `${res.voided.toLocaleString()} gifts voided, ${res.deleted.toLocaleString()} records removed${res.failed ? `, ${res.failed} could not be rolled back (permissions)` : ''}${res.skipped.length ? `. Not touched: ${res.skipped.join('; ')}` : ''}.`;
  return res;
}

// ── Match-givers queue ───────────────────────────────────────────────────────
/** Gifts that kept only a giver name (no personId), grouped by name. Finance-only (reads chmsContributions). */
export async function fetchUnmatchedGivers(orgId: string): Promise<UnmatchedGiver[]> {
  const snap = await getDocs(query(collection(db, CHMS_COLL.contributions), where('orgId', '==', orgId)));
  const m = new Map<string, UnmatchedGiver>();
  snap.docs.forEach(d => {
    const c = d.data() as ChmsContribution;
    if (c.personId || c.status === 'VOID' || !c.giverName) return;
    const u = m.get(c.giverName) || { label: c.giverName, gifts: 0, total: 0 };
    u.gifts++; u.total += c.amount; m.set(c.giverName, u);
  });
  return Array.from(m.values()).sort((a, b) => b.total - a.total);
}

/** Link every unmatched gift with this exact giverName to a person (and their household). Returns gifts updated. */
export async function linkGiverToPerson(orgId: string, giverName: string, person: { id: string; householdId?: string }): Promise<number> {
  const snap = await getDocs(query(collection(db, CHMS_COLL.contributions), where('orgId', '==', orgId), where('giverName', '==', giverName)));
  const targets = snap.docs.filter(d => !(d.data() as any).personId);
  for (let i = 0; i < targets.length; i += CHUNK) {
    const b = writeBatch(db);
    targets.slice(i, i + CHUNK).forEach(d => b.update(d.ref, clean({ personId: person.id, householdId: person.householdId })));
    await b.commit();
  }
  return targets.length;
}
