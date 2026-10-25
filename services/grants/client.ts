// Browser-side wrappers for /api/grants/* (routes/grants.ts). Types come from the shared modules.
import { auth } from '../firebase';
import type { Profile } from './profile';
import type { ReadinessReport, Question } from './readiness';
import type { CopyRow } from './forms';
import type { CouncilReview, NoticeCtx } from './council';
import type { ApplicantKind } from '../dataCommons/grants';
import type { ContractSearchResult, CertKey } from '../dataCommons/contracts';
import type { FinancePurpose, Recommendation, FREE_HELP } from '../dataCommons/financing';

export type { Profile, ReadinessReport, Question, CopyRow, CouncilReview, NoticeCtx, ApplicantKind };

export interface SavedApplication {
  title?: string;
  notes?: string;
  docs?: Record<string, boolean>;
  facts?: string[];
  sections?: Record<string, string>;
  updatedAt?: number;
}
export interface Workspace { kind: ApplicantKind; profile: Profile; applications: Record<string, SavedApplication> }
export interface ReadinessResponse {
  notice: NoticeCtx; report: ReadinessReport; next: Question | null; profile: Profile; sf424: CopyRow[]; application: SavedApplication;
}
export interface Draft { text: string; placeholders: string[]; unsupportedNumbers: string[] }

let tokenOverride: (() => Promise<string | null>) | null = null;
/** Lets a lab or test supply a token without Firebase. */
export function configureGrantsClient(opts: { token: () => Promise<string | null> }) { tokenOverride = opts.token; }

async function token(): Promise<string | null> {
  if (tokenOverride) return tokenOverride();
  const user = auth?.currentUser;
  if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(init.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any)?.error || `Request failed (${r.status})`);
  return data as T;
}

const base = (orgId: string) => `/api/grants/orgs/${encodeURIComponent(orgId)}`;

export const grantsApi = {
  workspace: (orgId: string) => call<Workspace>(`${base(orgId)}/workspace`),
  saveAnswer: (orgId: string, key: string, value: string) =>
    call<{ profile: Profile }>(`${base(orgId)}/profile`, { method: 'PUT', body: JSON.stringify({ key, value }) }),
  readiness: (orgId: string, opportunityId: string, skipped: string[] = []) =>
    call<ReadinessResponse>(`${base(orgId)}/readiness`, { method: 'POST', body: JSON.stringify({ opportunityId, skipped }) }),
  saveApplication: (orgId: string, oppId: string, app: SavedApplication) =>
    call<{ application: SavedApplication }>(`${base(orgId)}/applications/${encodeURIComponent(oppId)}`, { method: 'PUT', body: JSON.stringify(app) }),
  draft: (orgId: string, opportunityId: string, section: string, facts: string[], instructions?: string) =>
    call<Draft>(`${base(orgId)}/draft`, { method: 'POST', body: JSON.stringify({ opportunityId, section, facts, instructions }) }),
  council: (orgId: string, opportunityId: string, sections: Record<string, string>, facts: string[], draft?: string) =>
    call<CouncilReview>(`${base(orgId)}/council`, { method: 'POST', body: JSON.stringify({ opportunityId, sections, facts, draft }) }),
};

export type ContractsResponse = ContractSearchResult & { usedNaics: string[]; usedCerts: CertKey[]; report: ReadinessReport; next: Question | null };
export interface FinancingResponse {
  asOf: string; purpose: FinancePurpose; amount?: number; recommendations: Recommendation[]; disclaimer: string;
  help: typeof FREE_HELP;
}

export const businessApi = {
  contracts: (orgId: string, body: { naics?: string[]; keywords?: string[]; certs?: CertKey[]; includeIneligible?: boolean; state?: string; skipped?: string[] }) =>
    call<ContractsResponse>(`${base(orgId)}/contracts`, { method: 'POST', body: JSON.stringify(body) }),
  options: () => call<{ businessTypes: { key: string; label: string; naics: string[] }[]; certifications: { key: CertKey; label: string; hint: string }[] }>('/api/data/contracts/options'),
  financing: (purpose: FinancePurpose, amount?: number, disaster?: boolean) =>
    call<FinancingResponse>(`/api/data/financing?purpose=${encodeURIComponent(purpose)}${amount ? `&amount=${amount}` : ''}${disaster ? '&disaster=1' : ''}`),
};
