// Browser-side wrappers for /api/crew/* (routes/crew.ts).
import { auth } from '../firebase';
import type { CrewCharter, CrewDraft, CrewLogEntry } from './crewTypes';
import type { HqBriefing, VisionDrift, VisionPrinciple } from './hqBriefing';

export interface OfferedCrew extends CrewCharter { hired: boolean; usedToday: number }
export interface OrgCrewView {
  offered: OfferedCrew[];
  faq: { id: string; q: string; a: string }[];
  unanswered: { q: string; at: number }[];
  drafts: CrewDraft[];
  log: CrewLogEntry[];
  frontDeskModel: boolean;
}
export interface DeskReply { answer: string; from: string[]; unknown: boolean; by: 'model' | 'rules' }
export interface HqView { briefing: HqBriefing; crew: CrewCharter[]; principles: VisionPrinciple[]; drifts: VisionDrift[] }

let tokenOverride: (() => Promise<string | null>) | null = null;
let baseOverride = '';
/** Lets a lab supply a token (and base URL) without Firebase. */
export function configureCrewClient(opts: { token?: () => Promise<string | null>; base?: string }) {
  if (opts.token) tokenOverride = opts.token;
  if (opts.base !== undefined) baseOverride = opts.base;
}

async function token(): Promise<string | null> {
  if (tokenOverride) return tokenOverride();
  const user = auth?.currentUser;
  if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}

async function call<T>(method: string, path: string, body?: unknown, signed = true): Promise<T> {
  const t = signed ? await token() : null;
  const res = await fetch(`${baseOverride}/api/crew/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export const crewApi = {
  org: (orgId: string) => call<OrgCrewView>('GET', `org/${encodeURIComponent(orgId)}`),
  hire: (orgId: string, crewId: string, on: boolean) => call<OrgCrewView>('PUT', `org/${encodeURIComponent(orgId)}/hire`, { crewId, on }),
  saveFaq: (orgId: string, faq: { id?: string; q: string; a: string }[]) => call<OrgCrewView>('PUT', `org/${encodeURIComponent(orgId)}/faq`, { faq }),
  clearUnanswered: (orgId: string) => call<OrgCrewView>('POST', `org/${encodeURIComponent(orgId)}/unanswered/clear`, {}),
  decide: (orgId: string, draftId: string, decision: 'approved' | 'rejected', reason?: string) =>
    call<OrgCrewView>('POST', `org/${encodeURIComponent(orgId)}/drafts/${encodeURIComponent(draftId)}/decide`, { decision, reason }),
  desk: (orgId: string) => call<{ on: boolean; name?: string; suggestions?: string[] }>('GET', `desk/${encodeURIComponent(orgId)}`, undefined, false),
  ask: (orgId: string, question: string) => call<DeskReply>('POST', `desk/${encodeURIComponent(orgId)}/ask`, { question }, false),
  hq: () => call<HqView>('GET', 'hq/briefing'),
  addDrift: (principleId: string, note: string) => call<{ drifts: VisionDrift[] }>('POST', 'hq/drifts', { principleId, note }),
  closeDrift: (id: string) => call<{ drifts: VisionDrift[] }>('POST', `hq/drifts/${encodeURIComponent(id)}/close`, {}),
};
