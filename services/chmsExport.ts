// chmsExport — no lock-in. Export ChMS data as Servant-Keeper-compatible CSVs (re-importable by chmsImport
// and by Servant Keeper / Excel) plus a full portable bundle (one CSV per collection).

import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { ChmsPerson, ChmsHousehold, ChmsContribution, ChmsPledge, ChmsAttendance, ChmsBatch, ChmsMemberStatus } from '../types';
import { toCsv } from './chmsFormats';
import { CHMS_COLL } from './chmsImport';

const us = (iso?: string) => { const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || ''; };
const STATUS_OUT: Record<ChmsMemberStatus, string> = { VISITOR: 'Visitor', REGULAR: 'Regular Attender', MEMBER: 'Active Member', INACTIVE: 'Inactive', TRANSFERRED: 'Transferred', DECEASED: 'Deceased' };
const ROLE_OUT: Record<string, string> = { HEAD: 'Head', SPOUSE: 'Spouse', CHILD: 'Child', OTHER: 'Other' };
const METHOD_OUT: Record<string, string> = { CASH: 'Cash', CHECK: 'Check', CARD: 'Credit Card', ACH: 'ACH', ONLINE: 'Online', STOCK: 'Stock', INKIND: 'In-Kind', OTHER: 'Other' };
const FREQ_OUT: Record<string, string> = { ONCE: 'One time', WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly' };

export function exportPeopleCsv(people: ChmsPerson[], households: ChmsHousehold[] = []): string {
  const hh = new Map(households.map(h => [h.id, h]));
  const customKeys = Array.from(new Set(people.flatMap(p => Object.keys(p.custom || {}).filter(k => k !== 'Envelope #' && k !== 'Original Status'))));
  const rows: (string | number | undefined)[][] = [[
    'Individual ID', 'Family ID', 'Family Name', 'Envelope #', 'Last Name', 'First Name', 'Nickname', 'Family Role', 'Member Status', 'Date Joined', 'Birth Date',
    'Home Phone', 'Cell', 'E-mail', 'Address 1', 'Address 2', 'City', 'State', 'Zip', 'Marital Status', 'Baptism Date', 'Anniversary', 'Gender', 'Tags', 'Skills', ...customKeys,
  ]];
  for (const p of people) {
    const h = p.householdId ? hh.get(p.householdId) : undefined;
    rows.push([
      p.source?.id && !p.source.id.startsWith('gen:') ? p.source.id : p.id, h?.source?.id && !h.source.id.startsWith('gen:') ? h.source.id : p.householdId, h?.name,
      p.custom?.['Envelope #'], p.lastName, p.firstName, p.preferredName, p.householdRole ? ROLE_OUT[p.householdRole] : '', p.custom?.['Original Status'] || STATUS_OUT[p.status], us(p.memberSince), us(p.birthDate),
      p.custom?.['Home Phone'] || '', p.phone, p.email, p.address?.line1, p.address?.line2, p.address?.city, p.address?.region, p.address?.postal,
      p.maritalStatus, us(p.baptismDate), us(p.anniversary), p.gender, (p.tags || []).join('; '), (p.skills || []).join('; '), ...customKeys.map(k => p.custom?.[k] || ''),
    ]);
  }
  return toCsv(rows);
}

export function exportHouseholdsCsv(households: ChmsHousehold[], people: ChmsPerson[] = []): string {
  const pm = new Map(people.map(p => [p.id, p]));
  const rows: (string | number | undefined)[][] = [['Family ID', 'Family Name', 'Head of Household', 'Address 1', 'Address 2', 'City', 'State', 'Zip']];
  for (const h of households) {
    const head = h.headPersonId ? pm.get(h.headPersonId) : undefined;
    rows.push([h.source?.id && !h.source.id.startsWith('gen:') ? h.source.id : h.id, h.name, head ? `${head.lastName}, ${head.firstName}` : '', h.address?.line1, h.address?.line2, h.address?.city, h.address?.region, h.address?.postal]);
  }
  return toCsv(rows);
}

export function exportContributionsCsv(gifts: ChmsContribution[], people: ChmsPerson[] = [], batches: ChmsBatch[] = [], opts: { includeVoid?: boolean } = {}): string {
  const pm = new Map(people.map(p => [p.id, p])), bm = new Map(batches.map(b => [b.id, b]));
  const rows: (string | number | undefined)[][] = [['Gift Date', 'Envelope #', 'Last Name', 'First Name', 'Fund', 'Amount', 'Method', 'Check #', 'Batch', 'Memo', 'In Memory/Honor', 'Tax Deductible', 'Pledge', 'Status', 'Transaction ID']];
  for (const g of [...gifts].sort((a, b) => a.date.localeCompare(b.date))) {
    if (g.status === 'VOID' && !opts.includeVoid) continue;
    const p = g.personId ? pm.get(g.personId) : undefined;
    const fallback = (g.giverName || '').includes(',') ? g.giverName!.split(',').map(s => s.trim()) : null;
    rows.push([
      us(g.date), p?.custom?.['Envelope #'], p?.lastName ?? (fallback ? fallback[0] : g.giverName), p?.firstName ?? (fallback ? fallback[1] : ''), g.fundName, g.amount.toFixed(2),
      METHOD_OUT[g.method] || g.method, g.checkNumber, g.batchId ? bm.get(g.batchId)?.name || g.batchId : '', g.memo, g.tributeNote, g.deductible ? 'Yes' : 'No', g.pledgeId, g.status === 'VOID' ? `VOID (${g.voidReason || ''})` : 'Posted',
      g.source?.id && !g.source.id.startsWith('gen:') ? g.source.id : g.id,
    ]);
  }
  return toCsv(rows);
}

export function exportPledgesCsv(pledges: ChmsPledge[], people: ChmsPerson[] = []): string {
  const pm = new Map(people.map(p => [p.id, p]));
  const rows: (string | number | undefined)[][] = [['Envelope #', 'Last Name', 'First Name', 'Fund', 'Pledge Amount', 'Frequency', 'Start Date', 'End Date', 'Status', 'Pledge ID']];
  for (const x of pledges) {
    const p = x.personId ? pm.get(x.personId) : undefined;
    rows.push([p?.custom?.['Envelope #'], p?.lastName ?? x.giverName, p?.firstName, x.fundName, x.amount.toFixed(2), FREQ_OUT[x.frequency], us(x.startDate), us(x.endDate), x.status, x.source?.id && !x.source.id.startsWith('gen:') ? x.source.id : x.id]);
  }
  return toCsv(rows);
}

export function exportAttendanceCsv(att: ChmsAttendance[], people: ChmsPerson[] = []): string {
  const pm = new Map(people.map(p => [p.id, p]));
  const rows: (string | number | undefined)[][] = [['Attendance Date', 'Individual ID', 'Last Name', 'First Name', 'Event', 'Event Key']];
  for (const x of [...att].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = x.personId ? pm.get(x.personId) : undefined;
    rows.push([us(x.date), p ? (p.source?.id && !p.source.id.startsWith('gen:') ? p.source.id : p.id) : '', p?.lastName ?? x.guestName, p?.firstName, x.eventLabel, x.eventKey]);
  }
  return toCsv(rows);
}

/** Group membership (tags of the form group:<name>) as a Servant-Keeper-style group export. */
export function exportGroupsCsv(people: ChmsPerson[]): string {
  const rows: (string | number | undefined)[][] = [['Group', 'Individual ID', 'Last Name', 'First Name']];
  for (const p of people) for (const t of p.tags || []) if (t.startsWith('group:')) rows.push([t.slice(6), p.source?.id || p.id, p.lastName, p.firstName]);
  return toCsv(rows);
}

export interface ChmsExportData {
  people: ChmsPerson[]; households: ChmsHousehold[]; contributions: ChmsContribution[]; batches: ChmsBatch[]; pledges: ChmsPledge[]; attendance: ChmsAttendance[];
}

/** Load whatever the caller's role can read (a denied collection comes back empty). */
export async function fetchExportData(orgId: string): Promise<ChmsExportData> {
  const load = async <T,>(c: string): Promise<T[]> => {
    try { return (await getDocs(query(collection(db, c), where('orgId', '==', orgId)))).docs.map(d => ({ ...(d.data() as any), id: d.id }) as T); } catch { return []; }
  };
  const [people, households, contributions, batches, pledges, attendance] = await Promise.all([
    load<ChmsPerson>(CHMS_COLL.people), load<ChmsHousehold>(CHMS_COLL.households), load<ChmsContribution>(CHMS_COLL.contributions),
    load<ChmsBatch>(CHMS_COLL.batches), load<ChmsPledge>(CHMS_COLL.pledges), load<ChmsAttendance>(CHMS_COLL.attendance),
  ]);
  return { people, households, contributions, batches, pledges, attendance };
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ExportKind = 'people' | 'households' | 'contributions' | 'pledges' | 'attendance' | 'groups';

/** Build the CSVs (name -> text) for the requested kinds from already-loaded data. */
export function buildExportFiles(data: ChmsExportData, kinds: ExportKind[], orgName = 'church'): Record<string, string> {
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'church';
  const stamp = new Date().toISOString().slice(0, 10);
  const out: Record<string, string> = {};
  for (const k of kinds) {
    const name = `${slug}-${k}-${stamp}.csv`;
    if (k === 'people' && data.people.length) out[name] = exportPeopleCsv(data.people, data.households);
    if (k === 'households' && data.households.length) out[name] = exportHouseholdsCsv(data.households, data.people);
    if (k === 'contributions' && data.contributions.length) out[name] = exportContributionsCsv(data.contributions, data.people, data.batches, { includeVoid: true });
    if (k === 'pledges' && data.pledges.length) out[name] = exportPledgesCsv(data.pledges, data.people);
    if (k === 'attendance' && data.attendance.length) out[name] = exportAttendanceCsv(data.attendance, data.people);
    if (k === 'groups') { const g = exportGroupsCsv(data.people); if (g.split('\n').length > 2) out[name] = g; }
  }
  return out;
}

/** Zip-less portable bundle: downloads one CSV per collection (staggered so browsers allow multiple downloads). */
export async function downloadFullBundle(orgId: string, orgName: string, kinds: ExportKind[] = ['people', 'households', 'contributions', 'pledges', 'attendance', 'groups']): Promise<string[]> {
  const files = buildExportFiles(await fetchExportData(orgId), kinds, orgName);
  const names = Object.keys(files);
  for (const n of names) { downloadCsv(n, files[n]); await new Promise(r => setTimeout(r, 350)); }
  return names;
}
