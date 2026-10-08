// ticketCore - PURE generic service-ticket engine (estimate -> approval -> work -> ready -> paid/picked up).
// Auto repair "repair orders" and laundromat "wash-and-fold tickets" both ride on it; a vertical pack
// supplies a TicketConfig (stages, subject-field schema, numbering, notify rules, line templates).
// No Firebase / node imports: shared by server, UI, dev preview and tests (npm run test:tickets).
// All money is INTEGER CENTS. Tax goes through taxCore (parts and labor can be different tax classes).

import { computeTax, normalizeTaxClass, type TaxSettings, NO_TAX } from './taxCore';

export type StageKind = 'INTAKE' | 'ESTIMATE' | 'AWAITING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'READY' | 'DONE' | 'CANCELLED';
export const STAGE_KINDS: StageKind[] = ['INTAKE', 'ESTIMATE', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'READY', 'DONE', 'CANCELLED'];
export type LineKind = 'LABOR' | 'PART' | 'SERVICE' | 'FEE' | 'BY_WEIGHT';
export const LINE_KINDS: LineKind[] = ['LABOR', 'PART', 'SERVICE', 'FEE', 'BY_WEIGHT'];
export type ApprovalState = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface StageDef {
  id: string; label: string; kind: StageKind;
  /** Notify the customer (push / email) when a ticket enters this stage. */
  notify?: boolean;
  /** Allowed next stage ids. Default: the following stage in order, plus CANCELLED stages. */
  next?: string[];
}
export interface FieldDef { id: string; label: string; type: 'text' | 'number' | 'select' | 'tags'; options?: string[]; required?: boolean; hint?: string; unit?: string; /** Internal bookkeeping: not asked at intake, not shown to the customer. */ hidden?: boolean }
export interface LineTemplate { key: string; label: string; kind: LineKind; unitPriceCents: number; costCents?: number; qty?: number; taxClass?: string; unit?: string }

export interface TicketConfig {
  prefix: string;                 // 'RO' -> RO-1042
  startAt: number;                // first sequence number
  noun: string; nounPlural: string;
  subjectLabel: string;           // 'Vehicle' / 'Bag'
  subjectFields: FieldDef[];
  stages: StageDef[];
  /** When false, lines are created APPROVED (laundromat). */
  requireApproval: boolean;
  /** Default tax class by line kind (e.g. PART -> STANDARD, LABOR -> SERVICE). */
  taxClassByKind?: Partial<Record<LineKind, string>>;
  laborRateCents?: number; partsMarkupPct?: number;
  lineTemplates?: LineTemplate[];
  consentText?: string;
  /** Plug-in seam: ids of pack-specific detail panels (see components/business/tickets/panelRegistry). */
  panels?: string[];
  /** Plug-in seam: id of a pack-specific intake panel shown in the New-ticket form. */
  intakePanel?: string;
  /** Free-form per-panel settings (auto: inspection template id, price book...). Pure data. */
  panelConfig?: Record<string, any>;
  /** Plug-in seams (pack driven; ignored when absent). Ids resolve in components/business/ticketPlugins.tsx. */
  ui?: { boardTools?: string[]; detailPanels?: string[] };
  hooks?: { publicExtras?: (t: Ticket, cfg: TicketConfig) => PublicExtras | undefined };
}

/** Optional extras a pack adds to the customer page: progress steps, ready-by time, key facts, a one-line banner. */
export interface PublicExtras {
  progress?: { label: string; state: 'done' | 'current' | 'todo' }[];
  readyByAt?: number; banner?: string; facts?: { label: string; value: string }[];
}

export interface Attachment { id: string; url: string; kind: 'image' | 'video' | 'file'; name?: string; lineId?: string; by?: string; at: number; visibleToCustomer?: boolean }
export interface TicketLine {
  id: string; kind: LineKind; description: string;
  qty: number;                    // BY_WEIGHT: pounds etc (decimals ok)
  unit?: string;
  unitPriceCents: number; costCents?: number;
  taxClass?: string;
  approval: ApprovalState;
  technicianId?: string; technicianName?: string;
  notes?: string;                 // customer-visible
  attachmentIds?: string[];
  productId?: string;             // optional inventory link (stock decrements on sale)
  group?: string;                 // optional customer-facing grouping label key (e.g. auto DVI priority SAFETY/SOON/LATER)
}
export interface Deposit { id: string; amountCents: number; method: string; reference?: string; at: number; by: string }
export interface TimeEntry { id: string; staffId: string; staffName: string; startedAt: number; endedAt?: number; lineId?: string; note?: string }
export interface Note { id: string; text: string; internal: boolean; by: string; at: number }
export interface ApprovalRecord { at: number; ip: string; lineIds: string[]; decision: ApprovalState; consentText: string; via: 'LINK' | 'STAFF'; by?: string }
export interface AuditEntry { at: number; by: string; type: string; from?: string; to?: string; detail?: string }
export interface Customer { uid?: string; name: string; phone?: string; email?: string }

export interface Ticket {
  id: string; seq: number; number: string; businessUid: string; packId?: string;
  stage: string;                  // StageDef.id
  customer: Customer;
  subject: Record<string, string | number | string[]>;
  lines: TicketLine[]; deposits: Deposit[]; timeLog: TimeEntry[]; audit: AuditEntry[];
  attachments: Attachment[]; notes: Note[]; approvals: ApprovalRecord[];
  assignedTo?: { id: string; name: string };
  linkVersion: number;
  createdAt: number; updatedAt: number; createdBy: string;
  estimateSentAt?: number;
  saleOrderId?: string; paidAt?: number; paidCents?: number;
}

// ── Config helpers ────────────────────────────────────────────────────────────────────────────────
export const stageById = (cfg: TicketConfig, id: string): StageDef | undefined => cfg.stages.find(s => s.id === id);
export const stageKind = (cfg: TicketConfig, id: string): StageKind | undefined => stageById(cfg, id)?.kind;
export const stageOfKind = (cfg: TicketConfig, k: StageKind): StageDef | undefined => cfg.stages.find(s => s.kind === k);
export const formatNumber = (cfg: Pick<TicketConfig, 'prefix'>, seq: number): string => `${cfg.prefix}-${seq}`;

/** Allowed next stage ids from `fromId`. Terminal DONE / CANCELLED stages have none. */
export function allowedNext(cfg: TicketConfig, fromId: string): string[] {
  const i = cfg.stages.findIndex(s => s.id === fromId);
  if (i < 0) return [];
  const cur = cfg.stages[i];
  if (cur.kind === 'DONE' || cur.kind === 'CANCELLED') return [];
  const ids = new Set(cfg.stages.map(s => s.id));
  if (cur.next) return cur.next.filter(x => ids.has(x));
  const out: string[] = [];
  const nxt = cfg.stages[i + 1];
  if (nxt && nxt.kind !== 'CANCELLED') out.push(nxt.id);
  for (const s of cfg.stages) if (s.kind === 'CANCELLED') out.push(s.id);
  return out;
}

/** Structural validation of a pack's config (used by tests for every pack). Returns problems, [] when fine. */
export function validateConfig(cfg: TicketConfig): string[] {
  const p: string[] = [];
  const ids = cfg.stages.map(s => s.id);
  if (new Set(ids).size !== ids.length) p.push('duplicate stage ids');
  if (!/^[A-Z]{1,4}$/.test(cfg.prefix)) p.push('prefix must be 1-4 capitals');
  if (!cfg.stages.length) return [...p, 'no stages'];
  if (!['INTAKE', 'ESTIMATE'].includes(cfg.stages[0].kind)) p.push('first stage must be INTAKE or ESTIMATE');
  if (!cfg.stages.some(s => s.kind === 'DONE')) p.push('needs a DONE stage');
  if (!cfg.stages.some(s => s.kind === 'CANCELLED')) p.push('needs a CANCELLED stage');
  for (const s of cfg.stages) {
    if (!STAGE_KINDS.includes(s.kind)) p.push(`bad kind ${s.kind}`);
    for (const n of s.next || []) if (!ids.includes(n)) p.push(`${s.id} -> unknown ${n}`);
  }
  // every non-terminal stage can reach DONE
  const reach = (from: string, seen = new Set<string>()): boolean => {
    if (stageKind(cfg, from) === 'DONE') return true;
    if (seen.has(from)) return false; seen.add(from);
    return allowedNext(cfg, from).some(n => reach(n, seen));
  };
  if (!reach(cfg.stages[0].id)) p.push('DONE unreachable from first stage');
  if (cfg.requireApproval && !cfg.stages.some(s => s.kind === 'AWAITING_APPROVAL')) p.push('requireApproval needs an AWAITING_APPROVAL stage');
  const fids = cfg.subjectFields.map(f => f.id);
  if (new Set(fids).size !== fids.length) p.push('duplicate field ids');
  return p;
}

// ── Subject (custom field bag) ────────────────────────────────────────────────────────────────────
export function cleanSubject(cfg: Pick<TicketConfig, 'subjectFields'>, raw: any): { subject: Ticket['subject']; errors: string[] } {
  const subject: Ticket['subject'] = {}; const errors: string[] = [];
  for (const f of cfg.subjectFields) {
    const v = raw?.[f.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) { if (f.required) errors.push(`${f.label} is required.`); continue; }
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) { errors.push(`${f.label} must be a number.`); continue; }
      subject[f.id] = Math.round(n * 100) / 100;
    } else if (f.type === 'select') {
      const s = String(v);
      if (f.options && !f.options.includes(s)) { errors.push(`${f.label} must be one of: ${f.options.join(', ')}.`); continue; }
      subject[f.id] = s;
    } else if (f.type === 'tags') {
      const arr = (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 40);
      if (arr.length) subject[f.id] = arr;
    } else subject[f.id] = String(v).trim().slice(0, 200);
  }
  return { subject, errors };
}

// ── Lines ─────────────────────────────────────────────────────────────────────────────────────────
export const lineGrossCents = (l: Pick<TicketLine, 'qty' | 'unitPriceCents'>): number =>
  Math.max(0, Math.round((Number(l.qty) || 0) * (Number(l.unitPriceCents) || 0)));

export function taxClassFor(cfg: Pick<TicketConfig, 'taxClassByKind'>, l: Pick<TicketLine, 'kind' | 'taxClass'>): string {
  return normalizeTaxClass(l.taxClass || cfg.taxClassByKind?.[l.kind] || 'STANDARD');
}

/** Normalise an untrusted line patch into a safe TicketLine (id/approval handled by the caller). */
export function cleanLine(cfg: TicketConfig, raw: any, id: string): { line?: TicketLine; error?: string } {
  const kind = String(raw?.kind || '').toUpperCase() as LineKind;
  if (!LINE_KINDS.includes(kind)) return { error: 'Pick a line type.' };
  const description = String(raw?.description || '').trim().slice(0, 200);
  if (!description) return { error: 'Describe the line.' };
  const qty = Number(raw?.qty);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) return { error: 'Quantity must be above 0.' };
  const unitPriceCents = Math.round(Number(raw?.unitPriceCents));
  if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0 || unitPriceCents > 100_000_000) return { error: 'Enter a price.' };
  const line: TicketLine = {
    id, kind, description, qty: kind === 'BY_WEIGHT' ? Math.round(qty * 100) / 100 : Math.round(qty * 1000) / 1000,
    unitPriceCents, approval: cfg.requireApproval ? 'PENDING' : 'APPROVED',
  };
  if (raw?.unit) line.unit = String(raw.unit).slice(0, 12);
  if (raw?.costCents !== undefined && raw?.costCents !== null && raw?.costCents !== '') { const c = Math.round(Number(raw.costCents)); if (Number.isFinite(c) && c >= 0) line.costCents = c; }
  if (raw?.taxClass) line.taxClass = normalizeTaxClass(raw.taxClass);
  if (raw?.technicianId) { line.technicianId = String(raw.technicianId).slice(0, 80); line.technicianName = String(raw.technicianName || '').slice(0, 80); }
  if (raw?.notes) line.notes = String(raw.notes).slice(0, 500);
  if (raw?.productId) line.productId = String(raw.productId).slice(0, 120);
  if (raw?.group && /^[A-Z_]{2,16}$/.test(String(raw.group))) line.group = String(raw.group);
  if (Array.isArray(raw?.attachmentIds)) line.attachmentIds = raw.attachmentIds.map(String).slice(0, 12);
  return { line };
}

/** Line from a template, with the shop labor rate / parts markup applied when the template is cost-based. */
export function lineFromTemplate(cfg: TicketConfig, key: string, qty?: number): Partial<TicketLine> | null {
  const t = cfg.lineTemplates?.find(x => x.key === key);
  if (!t) return null;
  return { kind: t.kind, description: t.label, qty: qty ?? t.qty ?? 1, unit: t.unit, unitPriceCents: t.unitPriceCents, costCents: t.costCents, taxClass: t.taxClass };
}
/** Parts sell price from cost with a markup percent (rounded to cents). */
export const partPriceFromCost = (costCents: number, markupPct: number): number => Math.round(Math.max(0, costCents) * (1 + Math.max(0, markupPct) / 100));

// ── Totals ────────────────────────────────────────────────────────────────────────────────────────
export interface TotalsSlice { subtotalCents: number; taxCents: number; totalCents: number }
export interface TicketTotals {
  /** Everything not declined (what an estimate shows). */
  estimate: TotalsSlice;
  /** APPROVED lines only (what will be billed). */
  approved: TotalsSlice;
  pendingCents: number; declinedCents: number; pendingCount: number; approvedCount: number; declinedCount: number;
  depositsCents: number; paidCents: number;
  /** approved total minus deposits and payment, never below 0. */
  balanceCents: number;
  /** Deposits beyond the approved total (owed back to the customer). */
  excessDepositCents: number;
  /** Per-line tax/charge for approved lines, by line id. */
  byLine: Record<string, { grossCents: number; taxCents: number; chargeCents: number; rateBps: number }>;
}

function slice(cfg: TicketConfig, lines: TicketLine[], tax: TaxSettings): { s: TotalsSlice; per: ReturnType<typeof computeTax> } {
  const per = computeTax(lines.map(l => ({ grossCents: lineGrossCents(l), taxClass: taxClassFor(cfg, l) })), tax);
  return { s: { subtotalCents: per.subtotalCents, taxCents: per.taxCents, totalCents: per.totalCents }, per };
}

export function computeTicketTotals(t: Pick<Ticket, 'lines' | 'deposits' | 'paidCents'>, cfg: TicketConfig, tax: TaxSettings = NO_TAX): TicketTotals {
  const live = t.lines.filter(l => l.approval !== 'DECLINED');
  const appr = t.lines.filter(l => l.approval === 'APPROVED');
  const pend = t.lines.filter(l => l.approval === 'PENDING');
  const dec = t.lines.filter(l => l.approval === 'DECLINED');
  const e = slice(cfg, live, tax), a = slice(cfg, appr, tax);
  const byLine: TicketTotals['byLine'] = {};
  appr.forEach((l, i) => { const o = a.per.lines[i]; byLine[l.id] = { grossCents: o.grossCents, taxCents: o.taxCents, chargeCents: o.chargeCents, rateBps: o.rateBps }; });
  const depositsCents = t.deposits.reduce((n, d) => n + Math.max(0, d.amountCents), 0);
  const paidCents = Math.max(0, t.paidCents || 0);
  const owed = a.s.totalCents - depositsCents - paidCents;
  return {
    estimate: e.s, approved: a.s,
    pendingCents: pend.reduce((n, l) => n + lineGrossCents(l), 0), declinedCents: dec.reduce((n, l) => n + lineGrossCents(l), 0),
    pendingCount: pend.length, approvedCount: appr.length, declinedCount: dec.length,
    depositsCents, paidCents, balanceCents: Math.max(0, owed), excessDepositCents: Math.max(0, -owed), byLine,
  };
}

// ── Transition guards ─────────────────────────────────────────────────────────────────────────────
export interface TransitionCtx { override?: boolean; tax?: TaxSettings }
export type TransitionCheck =
  | { ok: true; overridden?: string }
  | { ok: false; code: 'NOT_ALLOWED' | 'NO_SCOPE' | 'UNAPPROVED' | 'BALANCE_DUE' | 'PAID' | 'UNKNOWN_STAGE' | 'NOTHING_TO_APPROVE'; error: string; canOverride?: boolean };

/**
 * Can `t` move to stage `toId`? `override` = owner/manager override, which bypasses ONLY the soft guards
 * (UNAPPROVED, BALANCE_DUE, NO_SCOPE); an illegal move or cancelling a paid ticket is never overridable.
 */
export function canTransition(t: Ticket, cfg: TicketConfig, toId: string, ctx: TransitionCtx = {}): TransitionCheck {
  const to = stageById(cfg, toId);
  if (!to || !stageById(cfg, t.stage)) return { ok: false, code: 'UNKNOWN_STAGE', error: 'Unknown stage.' };
  if (!allowedNext(cfg, t.stage).includes(toId)) return { ok: false, code: 'NOT_ALLOWED', error: `Cannot move from ${stageById(cfg, t.stage)!.label} to ${to.label}.` };
  const totals = computeTicketTotals(t, cfg, ctx.tax);
  const soft = (code: 'UNAPPROVED' | 'BALANCE_DUE' | 'NO_SCOPE', error: string): TransitionCheck =>
    ctx.override ? { ok: true, overridden: error } : { ok: false, code, error, canOverride: true };
  switch (to.kind) {
    case 'AWAITING_APPROVAL':
      if (!totals.pendingCount) return { ok: false, code: 'NOTHING_TO_APPROVE', error: 'Add at least one line that needs approval first.' };
      return { ok: true };
    case 'APPROVED':
      if (cfg.requireApproval && totals.pendingCount) return soft('UNAPPROVED', `${totals.pendingCount} line(s) are still waiting for the customer.`);
      if (!totals.approvedCount) return soft('NO_SCOPE', 'No approved work on this ticket yet.');
      return { ok: true };
    case 'IN_PROGRESS': case 'READY':
      if (cfg.requireApproval && totals.pendingCount) return soft('UNAPPROVED', `${totals.pendingCount} line(s) are not approved yet.`);
      return { ok: true };
    case 'DONE':
      if (cfg.requireApproval && totals.pendingCount) return soft('UNAPPROVED', `${totals.pendingCount} line(s) are not approved yet.`);
      if (totals.balanceCents > 0 && !t.saleOrderId) return soft('BALANCE_DUE', `Balance of $${(totals.balanceCents / 100).toFixed(2)} is still due.`);
      return { ok: true };
    case 'CANCELLED':
      if (t.saleOrderId) return { ok: false, code: 'PAID', error: 'This ticket was paid. Refund the sale first.' };
      return { ok: true };
    default: return { ok: true };
  }
}

// ── Mutations (pure: return a new ticket) ─────────────────────────────────────────────────────────
const MAX_AUDIT = 300;
export const audit = (t: Ticket, e: Omit<AuditEntry, 'at'> & { at?: number }): Ticket =>
  ({ ...t, audit: [...t.audit, { ...e, at: e.at ?? Date.now() }].slice(-MAX_AUDIT) });

export function newTicket(cfg: TicketConfig, a: { id: string; seq: number; businessUid: string; packId?: string; customer: Customer; subject: Ticket['subject']; by: string; now?: number }): Ticket {
  const now = a.now ?? Date.now();
  const first = cfg.stages[0];
  const t: Ticket = {
    id: a.id, seq: a.seq, number: formatNumber(cfg, a.seq), businessUid: a.businessUid, packId: a.packId, stage: first.id,
    customer: a.customer, subject: a.subject, lines: [], deposits: [], timeLog: [], audit: [], attachments: [], notes: [], approvals: [],
    linkVersion: 1, createdAt: now, updatedAt: now, createdBy: a.by,
  };
  return audit(t, { at: now, by: a.by, type: 'CREATE', to: first.id });
}

/** Apply a transition (assumes canTransition passed). Records from->to, who, when, and any override. */
export function applyTransition(t: Ticket, cfg: TicketConfig, toId: string, by: string, opts: { now?: number; overridden?: string; reason?: string } = {}): Ticket {
  const now = opts.now ?? Date.now();
  const next = { ...t, stage: toId, updatedAt: now };
  const detail = [opts.overridden ? `OVERRIDE: ${opts.overridden}` : '', opts.reason || ''].filter(Boolean).join(' | ') || undefined;
  return audit(next, { at: now, by, type: opts.overridden ? 'OVERRIDE' : 'TRANSITION', from: t.stage, to: toId, ...(detail ? { detail } : {}) });
}
export const shouldNotify = (cfg: TicketConfig, stageId: string): boolean => !!stageById(cfg, stageId)?.notify;

/** Set approval state of lines. Returns the updated ticket plus whether any lines remain pending. */
export function decideLines(t: Ticket, decisions: Record<string, 'APPROVED' | 'DECLINED'>, rec: Omit<ApprovalRecord, 'lineIds' | 'decision' | 'at'> & { at?: number }): { ticket: Ticket; pendingLeft: number; approved: number; applied: number } {
  const at = rec.at ?? Date.now();
  let applied = 0;
  const lines = t.lines.map(l => {
    const d = decisions[l.id];
    if (!d || l.approval !== 'PENDING') return l;
    applied++;
    return { ...l, approval: d };
  });
  const approvals = [...t.approvals];
  for (const decision of ['APPROVED', 'DECLINED'] as const) {
    const ids = Object.keys(decisions).filter(id => decisions[id] === decision && t.lines.find(l => l.id === id)?.approval === 'PENDING');
    if (ids.length) approvals.push({ at, ip: rec.ip, lineIds: ids, decision, consentText: rec.consentText, via: rec.via, ...(rec.by ? { by: rec.by } : {}) });
  }
  let nt: Ticket = { ...t, lines, approvals: approvals.slice(-100), updatedAt: at };
  if (applied) nt = audit(nt, { at, by: rec.by || (rec.via === 'LINK' ? 'customer' : 'staff'), type: 'APPROVAL', detail: `${applied} line(s) decided via ${rec.via}` });
  return { ticket: nt, pendingLeft: lines.filter(l => l.approval === 'PENDING').length, approved: lines.filter(l => l.approval === 'APPROVED').length, applied };
}

/** After the customer finished deciding: which stage should the ticket go to? */
export function stageAfterDecision(t: Ticket, cfg: TicketConfig): string | null {
  if (t.lines.some(l => l.approval === 'PENDING')) return null;
  const k: StageKind = t.lines.some(l => l.approval === 'APPROVED') ? 'APPROVED' : 'CANCELLED';
  const target = stageOfKind(cfg, k);
  if (!target || !allowedNext(cfg, t.stage).includes(target.id)) return null;
  return target.id;
}

export function addDeposit(t: Ticket, d: { id: string; amountCents: number; method: string; reference?: string; by: string; at?: number }): { ticket?: Ticket; error?: string } {
  const amt = Math.round(Number(d.amountCents));
  if (!Number.isFinite(amt) || amt <= 0 || amt > 100_000_000) return { error: 'Enter a deposit above $0.' };
  if (t.saleOrderId) return { error: 'This ticket is already paid.' };
  const at = d.at ?? Date.now();
  const dep: Deposit = { id: d.id, amountCents: amt, method: String(d.method || 'CASH').toUpperCase().slice(0, 16), at, by: d.by, ...(d.reference ? { reference: String(d.reference).slice(0, 40) } : {}) };
  return { ticket: audit({ ...t, deposits: [...t.deposits, dep].slice(-30), updatedAt: at }, { at, by: d.by, type: 'DEPOSIT', detail: `$${(amt / 100).toFixed(2)} ${dep.method}` }) };
}

// Time log
export function startTimer(t: Ticket, a: { id: string; staffId: string; staffName: string; lineId?: string; now?: number }): { ticket?: Ticket; error?: string } {
  if (t.timeLog.some(e => e.staffId === a.staffId && !e.endedAt)) return { error: 'You already have a running timer on this ticket.' };
  const now = a.now ?? Date.now();
  return { ticket: { ...t, updatedAt: now, timeLog: [...t.timeLog, { id: a.id, staffId: a.staffId, staffName: a.staffName, startedAt: now, ...(a.lineId ? { lineId: a.lineId } : {}) }].slice(-200) } };
}
export function stopTimer(t: Ticket, staffId: string, now = Date.now()): { ticket?: Ticket; error?: string } {
  const e = t.timeLog.find(x => x.staffId === staffId && !x.endedAt);
  if (!e) return { error: 'No running timer.' };
  return { ticket: { ...t, updatedAt: now, timeLog: t.timeLog.map(x => (x === e ? { ...x, endedAt: Math.max(now, x.startedAt) } : x)) } };
}
/** Minutes per technician (running timers count up to `now`). */
export function minutesByTech(t: Pick<Ticket, 'timeLog'>, now = Date.now()): Record<string, { name: string; minutes: number }> {
  const out: Record<string, { name: string; minutes: number }> = {};
  for (const e of t.timeLog) {
    const m = Math.max(0, ((e.endedAt ?? now) - e.startedAt) / 60000);
    const cur = out[e.staffId] || { name: e.staffName, minutes: 0 };
    cur.minutes = Math.round((cur.minutes + m) * 10) / 10; out[e.staffId] = cur;
  }
  return out;
}

// ── Search / board helpers ────────────────────────────────────────────────────────────────────────
export function searchText(t: Pick<Ticket, 'number' | 'customer' | 'subject'>): string {
  const sv = Object.values(t.subject).map(v => (Array.isArray(v) ? v.join(' ') : String(v)));
  return [t.number, t.customer.name, t.customer.phone, t.customer.email, ...sv].filter(Boolean).join(' ').toLowerCase();
}
export const matchesQuery = (t: Pick<Ticket, 'number' | 'customer' | 'subject'>, q: string): boolean => {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = searchText(t);
  return terms.every(x => hay.includes(x));
};
export function countsByStage(tickets: Pick<Ticket, 'stage'>[], cfg: TicketConfig): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(cfg.stages.map(s => [s.id, 0]));
  for (const t of tickets) if (t.stage in out) out[t.stage]++;
  return out;
}

// ── Storage codec (server writer cannot store object arrays: JSON-string the complex fields) ─────
const JSON_FIELDS = ['customer', 'subject', 'lines', 'deposits', 'timeLog', 'audit', 'attachments', 'notes', 'approvals', 'assignedTo'] as const;
/** Flat Firestore doc: JSON strings for complex parts + denormalised query fields. No undefined values. */
export function serializeTicket(t: Ticket, cfg: TicketConfig, tax: TaxSettings = NO_TAX): Record<string, any> {
  const totals = computeTicketTotals(t, cfg, tax);
  const o: Record<string, any> = {
    id: t.id, seq: t.seq, number: t.number, businessUid: t.businessUid, packId: t.packId || '', stage: t.stage, stageKind: stageKind(cfg, t.stage) || '',
    customerUid: t.customer.uid || '', customerName: t.customer.name, assignedUid: t.assignedTo?.id || '',
    linkVersion: t.linkVersion, createdAt: t.createdAt, updatedAt: t.updatedAt, createdBy: t.createdBy,
    estimateSentAt: t.estimateSentAt || 0, saleOrderId: t.saleOrderId || '', paidAt: t.paidAt || 0, paidCents: t.paidCents || 0,
    totalCents: totals.approved.totalCents, estimateCents: totals.estimate.totalCents, balanceCents: totals.balanceCents,
    search: searchText(t),
  };
  for (const f of JSON_FIELDS) o[f] = JSON.stringify((t as any)[f] ?? (f === 'customer' || f === 'subject' ? {} : f === 'assignedTo' ? null : []));
  return o;
}
const jp = (s: any, d: any) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v ?? d; } catch { return d; } };
export function parseTicket(d: Record<string, any>): Ticket {
  return {
    id: String(d.id), seq: Number(d.seq) || 0, number: String(d.number || ''), businessUid: String(d.businessUid || ''), packId: d.packId || undefined,
    stage: String(d.stage || ''), customer: jp(d.customer, { name: d.customerName || '' }), subject: jp(d.subject, {}),
    lines: jp(d.lines, []), deposits: jp(d.deposits, []), timeLog: jp(d.timeLog, []), audit: jp(d.audit, []),
    attachments: jp(d.attachments, []), notes: jp(d.notes, []), approvals: jp(d.approvals, []),
    assignedTo: jp(d.assignedTo, null) || undefined,
    linkVersion: Number(d.linkVersion) || 1, createdAt: Number(d.createdAt) || 0, updatedAt: Number(d.updatedAt) || 0, createdBy: String(d.createdBy || ''),
    ...(d.estimateSentAt ? { estimateSentAt: Number(d.estimateSentAt) } : {}),
    ...(d.saleOrderId ? { saleOrderId: String(d.saleOrderId) } : {}),
    ...(d.paidAt ? { paidAt: Number(d.paidAt) } : {}), ...(d.paidCents ? { paidCents: Number(d.paidCents) } : {}),
  };
}

// ── Public (customer) view: never leaks internal notes, costs, audit, staff, other customers ─────
export interface PublicTicketView {
  number: string; businessName: string; stageLabel: string; stageKind: StageKind; canDecide: boolean;
  subjectSummary: { label: string; value: string }[];
  lines: { id: string; kind: LineKind; description: string; qty: number; unit?: string; unitPriceCents: number; amountCents: number; approval: ApprovalState; notes?: string; group?: string; photos: string[] }[];
  photos: string[]; estimateTotalCents: number; approvedTotalCents: number; pendingCents: number; depositsCents: number; balanceCents: number;
  taxCents: number; messages: string[]; consentText: string; extras?: PublicExtras;
}
export function toPublicView(t: Ticket, cfg: TicketConfig, businessName: string, tax: TaxSettings = NO_TAX): PublicTicketView {
  const tot = computeTicketTotals(t, cfg, tax);
  const vis = (id: string) => t.attachments.filter(a => a.kind === 'image' && a.visibleToCustomer !== false && a.lineId === id).map(a => a.url);
  const est = computeTicketTotals({ lines: t.lines.filter(l => l.approval !== 'DECLINED').map(l => ({ ...l, approval: 'APPROVED' as const })), deposits: [], paidCents: 0 }, cfg, tax);
  return {
    number: t.number, businessName, stageLabel: stageById(cfg, t.stage)?.label || t.stage, stageKind: stageKind(cfg, t.stage) || 'INTAKE',
    canDecide: stageKind(cfg, t.stage) === 'AWAITING_APPROVAL' && tot.pendingCount > 0,
    subjectSummary: cfg.subjectFields.filter(f => t.subject[f.id] !== undefined && !f.hidden).map(f => ({ label: f.label, value: Array.isArray(t.subject[f.id]) ? (t.subject[f.id] as string[]).join(', ') : String(t.subject[f.id]) })),
    lines: t.lines.map(l => ({ id: l.id, kind: l.kind, description: l.description, qty: l.qty, ...(l.unit ? { unit: l.unit } : {}), unitPriceCents: l.unitPriceCents, amountCents: lineGrossCents(l), approval: l.approval, ...(l.notes ? { notes: l.notes } : {}), ...(l.group ? { group: l.group } : {}), photos: vis(l.id) })),
    photos: t.attachments.filter(a => a.kind === 'image' && a.visibleToCustomer !== false && !a.lineId).map(a => a.url),
    estimateTotalCents: est.approved.totalCents, approvedTotalCents: tot.approved.totalCents, pendingCents: tot.pendingCents, depositsCents: tot.depositsCents,
    balanceCents: tot.balanceCents, taxCents: est.approved.taxCents,
    messages: t.notes.filter(n => !n.internal).map(n => n.text),
    consentText: cfg.consentText || DEFAULT_CONSENT,
    ...(() => { try { const x = cfg.hooks?.publicExtras?.(t, cfg); return x ? { extras: x } : {}; } catch { return {}; } })(),
  };
}
export const DEFAULT_CONSENT = 'I authorize the work and charges I approved above. Declined items will not be done.';

// ── Link tokens (HMAC computed by the server; pure parse/format here) ────────────────────────────
export const formatToken = (ticketId: string, version: number, mac: string): string => `${ticketId}.${version}.${mac}`;
export function parseToken(tok: string): { ticketId: string; version: number; mac: string } | null {
  const m = /^([A-Za-z0-9_-]{6,80})\.(\d{1,6})\.([A-Za-z0-9_-]{16,64})$/.exec(String(tok || ''));
  return m ? { ticketId: m[1], version: Number(m[2]), mac: m[3] } : null;
}

/**
 * Lines to hand to the existing pos-sale pipeline: approved lines as custom (non-inventory) lines. Quantity
 * is folded into the price (qty 1, unitAmount = line gross) because pos-sale quantities are whole numbers
 * and by-weight quantities are not; the title keeps the "12.5 lb x $1.85" detail for the receipt.
 */
export function saleLines(t: Ticket, cfg: TicketConfig): { ref: string; title: string; qty: 1; unitAmount: number; taxClass: string; productId?: string; partQty: number; lineId: string; kind: LineKind }[] {
  return t.lines.filter(l => l.approval === 'APPROVED').map(l => {
    const detail = l.qty === 1 ? '' : ` (${l.qty}${l.unit ? ' ' + l.unit : ' x'} @ $${(l.unitPriceCents / 100).toFixed(2)})`;
    return {
      ref: `tkt:${t.id}:${l.id}`, lineId: l.id, kind: l.kind, title: `${l.description}${detail}`.slice(0, 160),
      qty: 1 as const, unitAmount: lineGrossCents(l), taxClass: taxClassFor(cfg, l), partQty: l.qty, ...(l.productId ? { productId: l.productId } : {}),
    };
  });
}

/** Client/demo id helper (the server uses crypto-random ids). */
export const makeId = (p: string): string => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
