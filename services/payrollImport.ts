// payrollImport — bring staff in from the payroll system (names + roles + departments; never pay data).
//
// Two doors, same result (staff seats in Elevate, pre-provisioned Plajah accounts, department membership):
//   1. FILE: the employee / worker export every payroll product can produce (Paychex Flex, ADP Workforce Now / RUN,
//      Gusto, QuickBooks Payroll, Paylocity, Paycor, Rippling, BambooHR …). Headers are auto-detected per vendor,
//      pay columns are deliberately dropped at parse time so compensation never reaches Firestore.
//   2. API: Paychex Flex (OAuth2 client-credentials → GET /companies/{id}/workers). Lives in routes/payroll.ts
//      behind PAYCHEX_CLIENT_ID / PAYCHEX_CLIENT_SECRET; `fetchPaychexWorkers` calls it. See docs/elevate-payroll-integration.md.
//
// Both produce PayrollWorker[] → stagePayrollWorkers() turns them into chmsPeople records tagged "staff" with
// custom.Role / custom.Department / custom['Payroll ID'] and calls elevateAccounts.provisionAccountsBulk.
import { auth } from './firebase';
import type { Organization, ChmsPerson } from '../types';
import { fetchPeople, savePerson, newId } from './chmsPeople';
import { importRoleToKey, matchMinistry, provisionAccountsBulk } from './elevateAccounts';
import { normHeader, type ParsedTable } from './chmsFormats';
import { logOrgAction } from './orgAudit';

export type PayrollProvider = 'paychex' | 'adp' | 'gusto' | 'quickbooks' | 'paylocity' | 'paycor' | 'rippling' | 'bamboohr' | 'generic';
export const PROVIDER_LABEL: Record<PayrollProvider, string> = {
  paychex: 'Paychex Flex', adp: 'ADP', gusto: 'Gusto', quickbooks: 'QuickBooks Payroll', paylocity: 'Paylocity', paycor: 'Paycor', rippling: 'Rippling', bamboohr: 'BambooHR', generic: 'Payroll export',
};

export interface PayrollWorker {
  externalId?: string;
  firstName: string;
  lastName: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'LEAVE';
  hireDate?: string;
  employmentType?: string;   // full-time / part-time / contractor
}

interface Col { key: keyof PayrollWorker | 'fullName' | 'ignore'; aliases: string[] }
const COLS: Col[] = [
  { key: 'externalId', aliases: ['employeeid', 'employeenumber', 'employeeno', 'workerid', 'associateid', 'payrollid', 'id', 'empid', 'employee', 'number', 'file', 'filenumber', 'employeecode', 'positionid'] },
  { key: 'firstName', aliases: ['firstname', 'first', 'givenname', 'legalfirstname', 'preferredfirstname', 'employeefirstname'] },
  { key: 'lastName', aliases: ['lastname', 'last', 'surname', 'familyname', 'legallastname', 'employeelastname'] },
  { key: 'fullName', aliases: ['name', 'fullname', 'employeename', 'payrollname', 'workername', 'legalname', 'employeefullname'] },
  { key: 'title', aliases: ['jobtitle', 'title', 'position', 'positiontitle', 'jobtitledescription', 'job', 'role', 'occupation', 'positiondescription', 'jobdescription'] },
  { key: 'department', aliases: ['department', 'dept', 'homedepartment', 'homedepartmentdescription', 'departmentname', 'departmentdescription', 'team', 'division', 'location', 'worklocation', 'costcenter', 'laborallocation', 'org', 'organization', 'orgunit'] },
  { key: 'email', aliases: ['email', 'workemail', 'emailaddress', 'workcontactworkemail', 'businessemail', 'personalemail', 'homeemail', 'emailwork', 'companyemail'] },
  { key: 'phone', aliases: ['phone', 'mobile', 'cellphone', 'workphone', 'mobilephone', 'phonenumber', 'homephone'] },
  { key: 'status', aliases: ['status', 'employmentstatus', 'employeestatus', 'workerstatus', 'positionstatus', 'active', 'currentstatus'] },
  { key: 'hireDate', aliases: ['hiredate', 'dateofhire', 'startdate', 'originalhiredate', 'datehired', 'employmentstartdate'] },
  { key: 'employmentType', aliases: ['employmenttype', 'workertype', 'employeetype', 'type', 'fulltimeparttime', 'ftpt', 'classification', 'paytype', 'workerclassification'] },
  // Compensation and tax columns are recognised ONLY so they can be dropped — never read.
  { key: 'ignore', aliases: ['rate', 'payrate', 'salary', 'annualsalary', 'hourlyrate', 'wage', 'grosspay', 'netpay', 'ssn', 'socialsecurity', 'taxid', 'bankaccount', 'routing', 'compensation', 'annualrate', 'basepay', 'earnings', 'deductions', 'withholding', 'dob', 'dateofbirth', 'birthdate'] },
];

/** Which vendor produced this file? (Only affects labels + a few header quirks.) */
export function detectPayrollProvider(headers: string[]): PayrollProvider {
  const h = headers.map(normHeader).join('|');
  if (/workerid|paychex|orgunit|workerstatus/.test(h)) return 'paychex';
  if (/associateid|payrollname|homedepartmentdescription|jobtitledescription|filenumber|workcontact/.test(h)) return 'adp';
  if (/gusto|employmenttype.*(jobtitle)|personalemail.*workemail/.test(h)) return 'gusto';
  if (/quickbooks|employeecode|paytype/.test(h)) return 'quickbooks';
  if (/paylocity|costcenter/.test(h)) return 'paylocity';
  if (/paycor/.test(h)) return 'paycor';
  if (/rippling/.test(h)) return 'rippling';
  if (/bamboohr|supervisor|hiredate.*division/.test(h)) return 'bamboohr';
  return 'generic';
}

/** Map a parsed CSV/TSV to workers. Returns the detected provider, the column mapping (for the preview), and issues. */
export function parsePayrollTable(table: ParsedTable): { provider: PayrollProvider; workers: PayrollWorker[]; mapping: Record<string, string>; dropped: string[]; issues: string[] } {
  const provider = detectPayrollProvider(table.headers);
  const mapping: Record<string, string> = {};
  const idx: Partial<Record<Col['key'], number>> = {};
  const dropped: string[] = [];
  table.headers.forEach((header, i) => {
    const n = normHeader(header);
    const col = COLS.find(c => c.aliases.includes(n)) || COLS.find(c => c.key !== 'ignore' && c.aliases.some(a => a.length > 3 && n.includes(a)));
    if (!col) return;
    if (col.key === 'ignore') { dropped.push(header); return; }
    if (idx[col.key] === undefined) { idx[col.key] = i; mapping[col.key] = header; }
  });
  const issues: string[] = [];
  if (idx.firstName === undefined && idx.fullName === undefined) issues.push('No name column found (First/Last or Name).');
  const get = (row: string[], k: Col['key']) => (idx[k] !== undefined ? String(row[idx[k]!] ?? '').trim() : '');
  const workers: PayrollWorker[] = [];
  table.rows.forEach((row, r) => {
    let first = get(row, 'firstName'), last = get(row, 'lastName');
    if (!first && !last) {
      const full = get(row, 'fullName');
      if (!full) return;
      if (full.includes(',')) { const [l, f] = full.split(',').map(s => s.trim()); last = l; first = f; }   // "Smith, Jane" (ADP / Paychex)
      else { const parts = full.split(/\s+/); first = parts.slice(0, -1).join(' ') || parts[0]; last = parts.length > 1 ? parts[parts.length - 1] : ''; }
    }
    if (!first && !last) { issues.push(`Row ${r + 2}: no name.`); return; }
    const statusRaw = get(row, 'status').toLowerCase();
    const status: PayrollWorker['status'] = !statusRaw ? 'ACTIVE' : /term|separat|inactive|ended|released/.test(statusRaw) ? (/inactive/.test(statusRaw) ? 'INACTIVE' : 'TERMINATED') : /leave|loa/.test(statusRaw) ? 'LEAVE' : /active|^a$|current|employed|true|yes|1/.test(statusRaw) ? 'ACTIVE' : 'ACTIVE';
    workers.push({
      externalId: get(row, 'externalId') || undefined,
      firstName: first, lastName: last,
      title: get(row, 'title') || undefined, department: get(row, 'department') || undefined,
      email: get(row, 'email').toLowerCase() || undefined, phone: get(row, 'phone') || undefined,
      status, hireDate: get(row, 'hireDate') || undefined, employmentType: get(row, 'employmentType') || undefined,
    });
  });
  return { provider, workers, mapping, dropped, issues };
}

export interface StagePreviewRow { worker: PayrollWorker; roleKey: string; ministryName?: string; existing?: ChmsPerson; action: 'create' | 'update' | 'skip'; why?: string }

/** Dry-run: what stagePayrollWorkers would do (match by payroll id, email, then name). */
export function previewPayrollStage(org: Organization, workers: PayrollWorker[], people: ChmsPerson[], opts: { includeInactive?: boolean } = {}): StagePreviewRow[] {
  const byPayrollId = new Map(people.filter(p => p.custom?.['Payroll ID']).map(p => [p.custom!['Payroll ID'].toLowerCase(), p]));
  const byEmail = new Map(people.filter(p => p.email).map(p => [p.email!.toLowerCase(), p]));
  const byName = new Map(people.map(p => [`${p.firstName} ${p.lastName}`.toLowerCase().replace(/\s+/g, ' '), p]));
  return workers.map(w => {
    const roleKey = importRoleToKey(w.title) === 'MEMBER' ? 'STAFF' : importRoleToKey(w.title);
    const ministry = matchMinistry(org.ministries, w.department);
    const existing = (w.externalId && byPayrollId.get(w.externalId.toLowerCase())) || (w.email && byEmail.get(w.email)) || byName.get(`${w.firstName} ${w.lastName}`.toLowerCase().replace(/\s+/g, ' '));
    if (w.status !== 'ACTIVE' && !opts.includeInactive) return { worker: w, roleKey, ministryName: ministry?.name, existing, action: 'skip', why: `${w.status?.toLowerCase()} in payroll` };
    return { worker: w, roleKey, ministryName: ministry?.name, existing, action: existing ? 'update' : 'create' };
  });
}

export interface StageResult { created: number; updated: number; skipped: number; provisioned: number }
/** Write staff records (tagged "staff"), then pre-provision a seat for each. Never writes pay data. */
export async function stagePayrollWorkers(org: Organization, rows: StagePreviewRow[], provider: PayrollProvider, onProgress?: (msg: string) => void): Promise<StageResult> {
  if (!auth.currentUser) throw new Error('Sign in first.');
  const out: StageResult = { created: 0, updated: 0, skipped: 0, provisioned: 0 };
  const touched: ChmsPerson[] = [];
  let i = 0;
  for (const r of rows) {
    i++;
    if (r.action === 'skip') { out.skipped++; continue; }
    onProgress?.(`${i} / ${rows.length} · ${r.worker.firstName} ${r.worker.lastName}`);
    const ministry = matchMinistry(org.ministries, r.worker.department);
    const custom: Record<string, string> = { ...(r.existing?.custom || {}) };
    if (r.worker.title) custom.Role = r.worker.title;
    if (r.worker.department) custom.Department = r.worker.department;
    if (r.worker.externalId) custom['Payroll ID'] = r.worker.externalId;
    if (r.worker.employmentType) custom['Employment type'] = r.worker.employmentType;
    if (r.worker.hireDate) custom['Hire date'] = r.worker.hireDate;
    custom['Payroll source'] = PROVIDER_LABEL[provider];
    const saved = await savePerson(org.id, {
      ...(r.existing || {}), id: r.existing?.id || newId('p'),
      firstName: r.worker.firstName, lastName: r.worker.lastName,
      email: r.worker.email || r.existing?.email, phone: r.worker.phone || r.existing?.phone,
      status: r.existing?.status || 'MEMBER',
      tags: Array.from(new Set([...(r.existing?.tags || []), 'staff'])),
      ministryIds: Array.from(new Set([...(r.existing?.ministryIds || []), ...(ministry ? [ministry.id] : [])])),
      custom,
      source: r.existing?.source || { system: `payroll:${provider}`, id: r.worker.externalId || `${r.worker.firstName}.${r.worker.lastName}`.toLowerCase() },
    } as any);
    touched.push(saved);
    r.existing ? out.updated++ : out.created++;
  }
  onProgress?.('Pre-provisioning Plajah accounts…');
  const res = await provisionAccountsBulk(org, touched, p => ({ roleKey: importRoleToKey(p.custom?.Role) === 'MEMBER' ? 'STAFF' : importRoleToKey(p.custom?.Role), ministryIds: p.ministryIds, isEmployee: true }));
  out.provisioned = res.provisioned.length;
  logOrgAction(org.id, 'ELEVATE_PAYROLL_IMPORT', { meta: { provider, ...out } });
  return out;
}

// ── Paychex Flex API (server-backed) ─────────────────────────────────────────
export interface PaychexStatus { configured: boolean; connected: boolean; companyId?: string; companyName?: string; message?: string }
async function authedJson<T>(path: string, body?: unknown): Promise<T> {
  const u = auth.currentUser; if (!u) throw new Error('Sign in first.');
  const token = await u.getIdToken();
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error((j as any).error || 'Payroll request failed.');
  return j;
}
/** Is a Paychex Flex connection configured on the server for this org? */
export const paychexStatus = (orgId: string) => authedJson<PaychexStatus>(`/api/payroll/paychex/status?orgId=${encodeURIComponent(orgId)}`).catch(() => ({ configured: false, connected: false } as PaychexStatus));
/** Org admin binds the org to its Paychex Flex company (the server verifies it with the Paychex app credentials). */
export const connectPaychex = (orgId: string, companyId: string) => authedJson<{ ok: true; companyId: string; companyName: string }>('/api/payroll/paychex/connect', { orgId, companyId });
/** Pull workers (names, titles, departments, work emails) from Paychex Flex — no pay data is requested. */
export const fetchPaychexWorkers = (orgId: string) => authedJson<{ workers: PayrollWorker[]; companyName?: string }>(`/api/payroll/paychex/workers`, { orgId });

/** Reload the directory after staging (helper for UIs). */
export const reloadPeople = (orgId: string) => fetchPeople(orgId);
