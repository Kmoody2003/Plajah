// inspectionCore - PURE digital vehicle inspection (DVI): checklist templates, PASS/WATCH/FAIL with measurement
// thresholds, sanitising untrusted tech input, roll-up into recommended work (SAFETY / SOON / LATER) and
// pricing those recommendations ONLY from the shop's own labor rate, parts markup and price book. No Firebase.
// Tests: npm run test:auto

export type ItemStatus = 'UNSET' | 'PASS' | 'WATCH' | 'FAIL' | 'NA';
export const ITEM_STATUSES: ItemStatus[] = ['UNSET', 'PASS', 'WATCH', 'FAIL', 'NA'];
export type Priority = 'SAFETY' | 'SOON' | 'LATER';
export const PRIORITIES: Priority[] = ['SAFETY', 'SOON', 'LATER'];
export const PRIORITY_LABEL: Record<Priority, string> = { SAFETY: 'Do now', SOON: 'Soon', LATER: 'Later' };

export type MeasureKind = 'tread32' | 'pad_mm' | 'voltage';
export interface Measure { kind: MeasureKind; label: string; unit: string; /** value >= passAt -> PASS, >= watchAt -> WATCH, else FAIL. */ passAt: number; watchAt: number; max: number }
export interface TemplateItem {
  id: string; label: string; section: string;
  /** Safety-critical: a FAIL is "Do now", a WATCH is "Soon". */
  safety?: boolean;
  measure?: Measure;
  /** Shop-default labor hours and part for the recommended repair. Editable defaults, not a labor guide. */
  rec?: { description: string; hours?: number; partName?: string };
}
export interface InspectionTemplate { id: string; label: string; items: TemplateItem[] }

export const MEASURES: Record<MeasureKind, Measure> = {
  tread32: { kind: 'tread32', label: 'Tread depth', unit: '/32"', passAt: 5, watchAt: 3, max: 20 },       // <=2/32 fail (legal minimum is 2/32)
  pad_mm: { kind: 'pad_mm', label: 'Pad thickness', unit: 'mm', passAt: 6, watchAt: 3, max: 20 },
  voltage: { kind: 'voltage', label: 'Resting voltage', unit: 'V', passAt: 12.4, watchAt: 12.2, max: 16 },
};

const it = (section: string, id: string, label: string, o: Partial<TemplateItem> = {}): TemplateItem => ({ id, label, section, ...o });
export const AUTO_DVI_TEMPLATE: InspectionTemplate = {
  id: 'auto_multipoint_v1', label: 'Multi-point inspection',
  items: [
    it('Brakes', 'brk_front', 'Front brake pads', { safety: true, measure: MEASURES.pad_mm, rec: { description: 'Replace front brake pads and service hardware', hours: 1.2, partName: 'Front brake pad set' } }),
    it('Brakes', 'brk_rear', 'Rear brake pads / shoes', { safety: true, measure: MEASURES.pad_mm, rec: { description: 'Replace rear brake pads and service hardware', hours: 1.2, partName: 'Rear brake pad set' } }),
    it('Brakes', 'brk_rotors', 'Rotors / drums', { safety: true, rec: { description: 'Resurface or replace rotors', hours: 1.0, partName: 'Brake rotors' } }),
    it('Brakes', 'brk_fluid', 'Brake fluid condition', { safety: true, rec: { description: 'Brake fluid flush', hours: 0.8, partName: 'Brake fluid' } }),
    it('Brakes', 'brk_lines', 'Brake lines & hoses', { safety: true, rec: { description: 'Replace brake hose / line', hours: 1.0, partName: 'Brake hose' } }),
    it('Tires', 'tire_lf', 'Left front tire', { safety: true, measure: MEASURES.tread32, rec: { description: 'Replace left front tire, mount and balance', hours: 0.5, partName: 'Tire' } }),
    it('Tires', 'tire_rf', 'Right front tire', { safety: true, measure: MEASURES.tread32, rec: { description: 'Replace right front tire, mount and balance', hours: 0.5, partName: 'Tire' } }),
    it('Tires', 'tire_lr', 'Left rear tire', { safety: true, measure: MEASURES.tread32, rec: { description: 'Replace left rear tire, mount and balance', hours: 0.5, partName: 'Tire' } }),
    it('Tires', 'tire_rr', 'Right rear tire', { safety: true, measure: MEASURES.tread32, rec: { description: 'Replace right rear tire, mount and balance', hours: 0.5, partName: 'Tire' } }),
    it('Tires', 'tire_wear', 'Tire wear pattern / pressure', { rec: { description: 'Four-wheel alignment', hours: 1.0 } }),
    it('Fluids', 'fl_oil', 'Engine oil level & condition', { rec: { description: 'Oil & filter change', hours: 0.5, partName: 'Oil and filter' } }),
    it('Fluids', 'fl_coolant', 'Coolant level & condition', { rec: { description: 'Coolant flush', hours: 1.0, partName: 'Coolant' } }),
    it('Fluids', 'fl_trans', 'Transmission fluid', { rec: { description: 'Transmission fluid service', hours: 1.2, partName: 'Transmission fluid' } }),
    it('Fluids', 'fl_ps', 'Power steering fluid', { rec: { description: 'Power steering fluid service', hours: 0.6, partName: 'Power steering fluid' } }),
    it('Belts & hoses', 'belt_serp', 'Serpentine / drive belt', { rec: { description: 'Replace serpentine belt', hours: 0.8, partName: 'Serpentine belt' } }),
    it('Belts & hoses', 'hose_cool', 'Radiator & heater hoses', { rec: { description: 'Replace coolant hose', hours: 1.0, partName: 'Coolant hose' } }),
    it('Battery', 'batt_test', 'Battery', { measure: MEASURES.voltage, rec: { description: 'Replace battery', hours: 0.4, partName: 'Battery' } }),
    it('Battery', 'batt_term', 'Terminals & cables', { rec: { description: 'Clean or replace battery terminals', hours: 0.4, partName: 'Battery terminal' } }),
    it('Lights', 'lt_head', 'Headlights (low / high)', { safety: true, rec: { description: 'Replace headlight bulb', hours: 0.4, partName: 'Headlight bulb' } }),
    it('Lights', 'lt_brake', 'Brake lights', { safety: true, rec: { description: 'Replace brake light bulb', hours: 0.3, partName: 'Brake light bulb' } }),
    it('Lights', 'lt_turn', 'Turn signals & hazards', { safety: true, rec: { description: 'Replace turn signal bulb', hours: 0.3, partName: 'Signal bulb' } }),
    it('Suspension & steering', 'susp_shocks', 'Shocks / struts', { rec: { description: 'Replace shocks / struts (pair)', hours: 2.0, partName: 'Strut / shock pair' } }),
    it('Suspension & steering', 'susp_joints', 'Ball joints & tie rod ends', { safety: true, rec: { description: 'Replace worn steering / suspension joint', hours: 1.5, partName: 'Joint / tie rod end' } }),
    it('Suspension & steering', 'susp_cv', 'CV boots & axles', { rec: { description: 'Replace CV boot / axle', hours: 1.5, partName: 'CV axle' } }),
    it('Wipers & filters', 'wip_blades', 'Wiper blades', { safety: true, rec: { description: 'Replace wiper blades', hours: 0.2, partName: 'Wiper blades' } }),
    it('Wipers & filters', 'wip_washer', 'Washer spray & fluid', { rec: { description: 'Top off / repair washer system', hours: 0.2 } }),
    it('Wipers & filters', 'flt_air', 'Engine air filter', { rec: { description: 'Replace engine air filter', hours: 0.2, partName: 'Engine air filter' } }),
    it('Wipers & filters', 'flt_cabin', 'Cabin air filter', { rec: { description: 'Replace cabin air filter', hours: 0.3, partName: 'Cabin air filter' } }),
  ],
};
export const INSPECTION_TEMPLATES: Record<string, InspectionTemplate> = { [AUTO_DVI_TEMPLATE.id]: AUTO_DVI_TEMPLATE };
export const templateById = (id?: string): InspectionTemplate => INSPECTION_TEMPLATES[String(id)] || AUTO_DVI_TEMPLATE;
export const sectionsOf = (t: InspectionTemplate): string[] => [...new Set(t.items.map(i => i.section))];

/** The status a measurement implies (the tech may still override it). */
export function statusFromMeasure(m: Measure, value: number): ItemStatus {
  if (!Number.isFinite(value) || value < 0 || value > m.max) return 'UNSET';
  return value >= m.passAt ? 'PASS' : value >= m.watchAt ? 'WATCH' : 'FAIL';
}
export const formatMeasure = (m: Measure, v: number): string => (m.kind === 'tread32' ? `${v}/32"` : m.kind === 'pad_mm' ? `${v} mm` : `${v} V`);

// ── Inspection state ──────────────────────────────────────────────────────────────────────────────
export interface InspectionAttachment { url: string; kind: 'image' | 'video'; at: number }
export interface InspectionItemState {
  status: ItemStatus; measurement?: number;
  /** Tech note: INTERNAL (never shown to the customer unless copied into customerNote). */
  note?: string;
  /** Customer-visible explanation, written/approved by a human advisor. */
  customerNote?: string;
  priority?: Priority;                 // advisor override
  attachments: InspectionAttachment[];
}
export interface Inspection {
  ticketId: string; templateId: string;
  items: Record<string, InspectionItemState>;
  /** Free-text / voice-transcribed overall tech notes (INTERNAL). */
  techNotes?: string;
  techName?: string;
  startedAt: number; updatedAt: number; completedAt?: number;
  /** Set when the customer-facing report was shared. */
  sharedAt?: number;
}
export const newInspection = (ticketId: string, templateId = AUTO_DVI_TEMPLATE.id, tech = '', now = Date.now()): Inspection =>
  ({ ticketId, templateId, items: {}, techName: tech.slice(0, 60), startedAt: now, updatedAt: now });

const isHttps = (u: any): u is string => typeof u === 'string' && /^https:\/\//i.test(u) && u.length <= 1000;
/** Normalise untrusted client input against the template: unknown items dropped, enums/ranges/URLs enforced. */
export function sanitizeInspection(raw: any, base: Inspection, now = Date.now()): Inspection {
  const tpl = templateById(base.templateId);
  const ids = new Map(tpl.items.map(i => [i.id, i]));
  const items: Record<string, InspectionItemState> = {};
  for (const [id, v] of Object.entries<any>(raw?.items && typeof raw.items === 'object' ? raw.items : {})) {
    const def = ids.get(id); if (!def || !v || typeof v !== 'object') continue;
    const status: ItemStatus = ITEM_STATUSES.includes(v.status) ? v.status : 'UNSET';
    const s: InspectionItemState = { status, attachments: [] };
    if (v.measurement !== undefined && v.measurement !== null && v.measurement !== '') {
      const n = Math.round(Number(v.measurement) * 100) / 100;
      if (Number.isFinite(n) && n >= 0 && (!def.measure || n <= def.measure.max)) s.measurement = n;
    }
    if (typeof v.note === 'string' && v.note.trim()) s.note = v.note.trim().slice(0, 600);
    if (typeof v.customerNote === 'string' && v.customerNote.trim()) s.customerNote = v.customerNote.trim().slice(0, 600);
    if (PRIORITIES.includes(v.priority)) s.priority = v.priority;
    if (Array.isArray(v.attachments)) s.attachments = v.attachments.filter((a: any) => isHttps(a?.url)).slice(0, 6).map((a: any) => ({ url: a.url, kind: a.kind === 'video' ? 'video' as const : 'image' as const, at: Number(a.at) || now }));
    items[id] = s;
  }
  const out: Inspection = { ...base, items, updatedAt: now };
  if (typeof raw?.techNotes === 'string') out.techNotes = raw.techNotes.trim().slice(0, 2000) || undefined;
  if (raw?.complete === true && !base.completedAt) out.completedAt = now;
  if (raw?.complete === false) out.completedAt = undefined;
  if (out.techNotes === undefined) delete out.techNotes;
  if (out.completedAt === undefined) delete out.completedAt;
  return out;
}

export interface InspectionSummary { pass: number; watch: number; fail: number; na: number; unset: number; total: number; done: boolean }
export function summarize(insp: Inspection): InspectionSummary {
  const tpl = templateById(insp.templateId);
  const s: InspectionSummary = { pass: 0, watch: 0, fail: 0, na: 0, unset: 0, total: tpl.items.length, done: false };
  for (const i of tpl.items) {
    const st = insp.items[i.id]?.status || 'UNSET';
    if (st === 'PASS') s.pass++; else if (st === 'WATCH') s.watch++; else if (st === 'FAIL') s.fail++; else if (st === 'NA') s.na++; else s.unset++;
  }
  s.done = s.unset === 0;
  return s;
}

// ── Recommendations ───────────────────────────────────────────────────────────────────────────────
export function defaultPriority(def: Pick<TemplateItem, 'safety'>, status: ItemStatus): Priority | null {
  if (status === 'FAIL') return def.safety ? 'SAFETY' : 'SOON';
  if (status === 'WATCH') return def.safety ? 'SOON' : 'LATER';
  return null;
}
export interface Recommendation {
  itemId: string; section: string; label: string; status: 'WATCH' | 'FAIL'; priority: Priority;
  description: string; hours?: number; partName?: string; evidence: string; photos: string[]; customerNote?: string;
}
export function recommendations(insp: Inspection): Recommendation[] {
  const tpl = templateById(insp.templateId); const out: Recommendation[] = [];
  for (const def of tpl.items) {
    const st = insp.items[def.id]; if (!st || (st.status !== 'FAIL' && st.status !== 'WATCH')) continue;
    const priority = st.priority || defaultPriority(def, st.status)!;
    const ev = [def.measure && st.measurement !== undefined ? `${def.measure.label} ${formatMeasure(def.measure, st.measurement)}` : '', st.note || ''].filter(Boolean).join(' - ');
    out.push({
      itemId: def.id, section: def.section, label: def.label, status: st.status, priority,
      description: (def.rec?.description || `Service: ${def.label}`).slice(0, 190), ...(def.rec?.hours ? { hours: def.rec.hours } : {}), ...(def.rec?.partName ? { partName: def.rec.partName } : {}),
      evidence: ev, photos: st.attachments.filter(a => a.kind === 'image').map(a => a.url),
      ...(st.customerNote ? { customerNote: st.customerNote } : {}),
    });
  }
  const rank: Record<Priority, number> = { SAFETY: 0, SOON: 1, LATER: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

export interface Pricing {
  laborRateCents: number; partsMarkupPct: number;
  /** Shop price book by template item id: your hours / part cost for this vehicle class. Overrides the template defaults. */
  priceBook?: Record<string, { hours?: number; partCostCents?: number; partPriceCents?: number }>;
}
export interface DraftLine {
  kind: 'LABOR' | 'PART'; description: string; qty: number; unitPriceCents: number; costCents?: number; unit?: string;
  group: Priority; notes?: string; itemId: string;
  /** True when there is no price source (no price-book part cost): the advisor MUST enter a price before it is sent. */
  needsPrice?: boolean;
}
const markup = (cost: number, pct: number): number => Math.round(Math.max(0, cost) * (1 + Math.max(0, pct) / 100));
/**
 * Price one recommendation. Labor = hours x shop rate (hours from the price book, else the template default).
 * A part line is priced ONLY from a price-book cost (+ markup) or explicit price; otherwise it is $0 and flagged needsPrice.
 * Nothing here ever asks a model for a number.
 */
export function priceRecommendation(rec: Recommendation, p: Pricing): DraftLine[] {
  const book = p.priceBook?.[rec.itemId];
  const hours = book?.hours ?? rec.hours;
  const lines: DraftLine[] = [];
  const notes = rec.customerNote;
  if (hours && hours > 0 && p.laborRateCents > 0) {
    lines.push({ kind: 'LABOR', description: rec.description, qty: Math.round(hours * 100) / 100, unit: 'hr', unitPriceCents: Math.round(p.laborRateCents), group: rec.priority, itemId: rec.itemId, ...(notes ? { notes } : {}) });
  } else {
    lines.push({ kind: 'LABOR', description: rec.description, qty: 1, unitPriceCents: 0, group: rec.priority, itemId: rec.itemId, needsPrice: true, ...(notes ? { notes } : {}) });
  }
  if (rec.partName) {
    if (book?.partPriceCents !== undefined) lines.push({ kind: 'PART', description: rec.partName, qty: 1, unitPriceCents: Math.round(book.partPriceCents), ...(book.partCostCents !== undefined ? { costCents: book.partCostCents } : {}), group: rec.priority, itemId: rec.itemId });
    else if (book?.partCostCents !== undefined) lines.push({ kind: 'PART', description: rec.partName, qty: 1, unitPriceCents: markup(book.partCostCents, p.partsMarkupPct), costCents: book.partCostCents, group: rec.priority, itemId: rec.itemId });
    else lines.push({ kind: 'PART', description: rec.partName, qty: 1, unitPriceCents: 0, group: rec.priority, itemId: rec.itemId, needsPrice: true });
  }
  return lines;
}
export const priceAll = (recs: Recommendation[], p: Pricing): DraftLine[] => recs.flatMap(r => priceRecommendation(r, p));

// ── Customer-facing report (traffic light) ────────────────────────────────────────────────────────
export interface PublicInspectionItem { label: string; status: 'PASS' | 'WATCH' | 'FAIL'; detail: string; note: string; photos: string[] }
export interface PublicInspection { sections: { name: string; items: PublicInspectionItem[] }[]; counts: { pass: number; watch: number; fail: number }; completedAt?: number; techName?: string }
/** NEVER includes the internal tech note; only the advisor-approved customerNote. Skips UNSET / NA. */
export function toPublicInspection(insp: Inspection): PublicInspection {
  const tpl = templateById(insp.templateId); const counts = { pass: 0, watch: 0, fail: 0 };
  const sections = sectionsOf(tpl).map(name => ({
    name,
    items: tpl.items.filter(d => d.section === name).flatMap((d): PublicInspectionItem[] => {
      const s = insp.items[d.id]; if (!s || (s.status !== 'PASS' && s.status !== 'WATCH' && s.status !== 'FAIL')) return [];
      counts[s.status.toLowerCase() as 'pass' | 'watch' | 'fail']++;
      return [{ label: d.label, status: s.status, detail: d.measure && s.measurement !== undefined ? formatMeasure(d.measure, s.measurement) : '', note: s.customerNote || '', photos: s.attachments.filter(a => a.kind === 'image' && isHttps(a.url)).map(a => a.url).slice(0, 4) }];
    }),
  })).filter(s => s.items.length);
  return { sections, counts, ...(insp.completedAt ? { completedAt: insp.completedAt } : {}) };
}

// ── Storage codec (flat doc, JSON-string for the item map) ────────────────────────────────────────
export function serializeInspection(i: Inspection, businessUid: string): Record<string, any> {
  const s = summarize(i);
  return { ticketId: i.ticketId, businessUid, templateId: i.templateId, items: JSON.stringify(i.items), techNotes: i.techNotes || '', techName: i.techName || '',
    startedAt: i.startedAt, updatedAt: i.updatedAt, completedAt: i.completedAt || 0, sharedAt: i.sharedAt || 0, failCount: s.fail, watchCount: s.watch };
}
export function parseInspection(d: Record<string, any>): Inspection {
  let items: any = {}; try { items = typeof d.items === 'string' ? JSON.parse(d.items) : d.items || {}; } catch { items = {}; }
  const o: Inspection = { ticketId: String(d.ticketId), templateId: String(d.templateId || AUTO_DVI_TEMPLATE.id), items, startedAt: Number(d.startedAt) || 0, updatedAt: Number(d.updatedAt) || 0 };
  if (d.techNotes) o.techNotes = String(d.techNotes);
  if (d.techName) o.techName = String(d.techName);
  if (d.completedAt) o.completedAt = Number(d.completedAt);
  if (d.sharedAt) o.sharedAt = Number(d.sharedAt);
  return o;
}
