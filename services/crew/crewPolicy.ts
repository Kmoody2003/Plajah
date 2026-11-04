/**
 * Aria Crew — the rules every crew member runs under. Pure functions; the routes call these before doing
 * anything, so a model's output or a crafted request can never widen what a crew member does.
 */
import { charterFor } from './crewRoster';
import { FORBIDDEN_ACTIONS, type CrewCapability, type CrewDraft, type CrewDraftStatus, type CrewLogEntry, type CrewMemberId, type OrgCrewState } from './crewTypes';

export const MAX_FAQ = 60;
export const MAX_UNANSWERED = 50;
export const MAX_DRAFTS = 100;
export const MAX_LOG = 200;
/** Pending drafts older than this expire instead of piling up. */
export const DRAFT_TTL_MS = 14 * 86_400_000;

/** `reason` is set whenever `ok` is false. (A plain shape: the repo's tsconfig does not narrow `ok` unions.) */
export type PolicyResult = { ok: boolean; reason?: string };

/** May this crew member do this? Forbidden actions are refused for everyone; otherwise it must be in its charter. */
export function checkAction(crewId: CrewMemberId, action: string): PolicyResult {
  if ((FORBIDDEN_ACTIONS as readonly string[]).includes(action)) return { ok: false, reason: `No crew member may ${action.replace(/_/g, ' ')}.` };
  const c = charterFor(crewId);
  if (!c) return { ok: false, reason: 'Unknown crew member.' };
  if (!c.can.includes(action as CrewCapability)) return { ok: false, reason: `${c.name} is not allowed to ${action.replace(/_/g, ' ')}.` };
  return { ok: true };
}

/** Who in an org may hire, fire and teach the crew: the owner, org admins and IT Admins. */
export function canManageCrew(org: Record<string, any>, uid: string): boolean {
  if (!uid) return false;
  if (org.creatorId === uid) return true;
  const lists = ['admins', 'itAdminUids'].flatMap(k => (Array.isArray(org[k]) ? org[k] : []));
  return lists.includes(uid);
}

export function canHire(crewId: string, audience: 'org' | 'hq' = 'org'): PolicyResult {
  const c = charterFor(crewId);
  if (!c || c.audience !== audience) return { ok: false, reason: 'Unknown crew member.' };
  if (c.status !== 'live') return { ok: false, reason: `${c.name} is not ready yet.` };
  return { ok: true };
}

export const today = (now: number) => new Date(now).toISOString().slice(0, 10);

export function emptyOrgCrew(orgId: string, now: number): OrgCrewState {
  return { orgId, hired: {}, faq: [], unanswered: [], drafts: [], log: [], usage: { day: today(now), calls: {} }, updatedAt: now };
}

/** Read a stored doc defensively: anything missing or malformed comes back as the empty default. */
export function normalizeOrgCrew(orgId: string, raw: Record<string, any> | null | undefined, now: number): OrgCrewState {
  const base = emptyOrgCrew(orgId, now);
  if (!raw || typeof raw !== 'object') return base;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const usage = raw.usage && raw.usage.day === base.usage.day ? { day: base.usage.day, calls: { ...(raw.usage.calls || {}) } } : base.usage;
  return {
    orgId,
    hired: raw.hired && typeof raw.hired === 'object' ? raw.hired : {},
    faq: arr(raw.faq).filter((f: any) => f && f.q && f.a).slice(0, MAX_FAQ),
    unanswered: arr(raw.unanswered).slice(0, MAX_UNANSWERED),
    drafts: arr(raw.drafts).slice(0, MAX_DRAFTS),
    log: arr(raw.log).slice(0, MAX_LOG),
    usage,
    updatedAt: Number(raw.updatedAt) || now,
  };
}

export const isHired = (s: OrgCrewState, id: CrewMemberId) => !!s.hired[id]?.on;

/** True and counted if the crew member still has model calls left today; false (and nothing counted) if not. */
export function takeModelCall(s: OrgCrewState, id: CrewMemberId, now: number): boolean {
  const c = charterFor(id);
  if (!c || c.dailyModelCalls <= 0) return false;
  if (s.usage.day !== today(now)) s.usage = { day: today(now), calls: {} };
  const used = s.usage.calls[id] || 0;
  if (used >= c.dailyModelCalls) return false;
  s.usage.calls[id] = used + 1;
  return true;
}

export function addLog(s: OrgCrewState, e: CrewLogEntry): void {
  s.log = [e, ...s.log].slice(0, MAX_LOG);
}

export function addUnanswered(s: OrgCrewState, q: string, now: number): void {
  const text = q.trim().slice(0, 300);
  if (!text) return;
  const key = text.toLowerCase();
  s.unanswered = [{ q: text, at: now }, ...s.unanswered.filter(u => u.q.toLowerCase() !== key)].slice(0, MAX_UNANSWERED);
}

/** Validate and normalize the FAQ an admin saves. Returns the error for the first bad row. */
export function cleanFaq(rows: unknown): { ok: boolean; reason?: string; faq: OrgCrewState['faq'] } {
  if (!Array.isArray(rows)) return { ok: false, reason: 'FAQ must be a list.', faq: [] };
  if (rows.length > MAX_FAQ) return { ok: false, reason: `Keep it to ${MAX_FAQ} questions.`, faq: [] };
  const out: OrgCrewState['faq'] = [];
  for (const [i, r] of rows.entries()) {
    const q = String((r as any)?.q ?? '').replace(/\u0000/g, '').trim().slice(0, 200);
    const a = String((r as any)?.a ?? '').replace(/\u0000/g, '').trim().slice(0, 1200);
    if (!q && !a) continue;
    if (!q || !a) return { ok: false, reason: `Question ${i + 1} needs both a question and an answer.`, faq: [] };
    const id = String((r as any)?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || `q${i + 1}_${q.length}`;
    out.push({ id, q, a });
  }
  return { ok: true, faq: out };
}

/** Move a pending draft to approved/rejected. Approving never performs it — the person sends it from the surface. */
export function decideDraft(s: OrgCrewState, draftId: string, decision: 'approved' | 'rejected', by: string, now: number, reason?: string): PolicyResult {
  expireDrafts(s, now);
  const d = s.drafts.find(x => x.id === draftId);
  if (!d) return { ok: false, reason: 'Draft not found.' };
  if (d.status !== 'pending') return { ok: false, reason: `This draft was already ${d.status}.` };
  d.status = decision; d.decidedAt = now; d.decidedBy = by;
  if (reason) d.reason = reason.slice(0, 300);
  addLog(s, { at: now, crewId: d.crewId, what: `${decision === 'approved' ? 'Approved' : 'Rejected'}: ${d.title}`, by: 'person' });
  return { ok: true };
}

export function expireDrafts(s: OrgCrewState, now: number): number {
  let n = 0;
  for (const d of s.drafts) if (d.status === 'pending' && now - d.createdAt > DRAFT_TTL_MS) { d.status = 'expired' as CrewDraftStatus; n++; }
  return n;
}

export function addDraft(s: OrgCrewState, d: Omit<CrewDraft, 'status'>): PolicyResult {
  const c = charterFor(d.crewId);
  if (!c) return { ok: false, reason: 'Unknown crew member.' };
  if (c.approval !== 'person_approves') return { ok: false, reason: `${c.name} does not write drafts.` };
  s.drafts = [{ ...d, status: 'pending' as CrewDraftStatus }, ...s.drafts].slice(0, MAX_DRAFTS);
  return { ok: true };
}
