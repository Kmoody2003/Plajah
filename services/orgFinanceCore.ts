// What moved off the world-readable organizations/{id} doc, and who gets which part of it. Dependency-free so the
// browser, server.ts and tests share one definition.
//
//   organizations/{id}                  public: canReceiveGiving, donorFeeCoverOff, givingUrl, givingFunds
//   organizations/{id}/private/finance  ein, legalName, statementFooter, financeSettings + server-only Stripe fields
//   stripeAccountOrgs/{acct}            server-only: webhook lookup from a connected account to its org

/** Written by finance roles from the client. */
export const ORG_FINANCE_CLIENT_KEYS = ['ein', 'legalName', 'statementFooter', 'financeSettings'] as const;
/** Written only by the server (service account). */
export const ORG_FINANCE_SERVER_KEYS = ['stripeAccountId', 'billingConnection'] as const;
export const ORG_FINANCE_KEYS = [...ORG_FINANCE_CLIENT_KEYS, ...ORG_FINANCE_SERVER_KEYS] as const;
/** Public flags the server derives; a client can't set these. */
export const ORG_FINANCE_DERIVED_KEYS = ['canReceiveGiving'] as const;

export type OrgFinanceFields = Partial<Record<(typeof ORG_FINANCE_KEYS)[number], any>>;

/** Split one organization update: finance fields go to the private doc, server-owned fields are dropped. */
export function splitOrgPatch<T extends Record<string, any>>(updates: T): { publicPatch: Record<string, any>; financePatch: Record<string, any> } {
  const publicPatch: Record<string, any> = {}; const financePatch: Record<string, any> = {};
  const client: readonly string[] = ORG_FINANCE_CLIENT_KEYS;
  const dropped: readonly string[] = [...ORG_FINANCE_SERVER_KEYS, ...ORG_FINANCE_DERIVED_KEYS];
  for (const [k, v] of Object.entries(updates)) {
    if (client.includes(k)) financePatch[k] = v;
    else if (!dropped.includes(k)) publicPatch[k] = v;
  }
  // The only finance setting donors need: whether the "cover the fee" offer shows.
  const settings = financePatch.financeSettings;
  if (settings && typeof settings === 'object') publicPatch.donorFeeCoverOff = settings.donorCoversFees === false;
  return { publicPatch, financePatch };
}

/** The org plus whatever finance fields this reader may see. Private values win over a not-yet-stripped public copy. */
export function mergeOrgFinance<T extends Record<string, any>>(org: T, fin: OrgFinanceFields | null | undefined): T {
  if (!fin) return org;
  const out: Record<string, any> = { ...org };
  for (const k of ORG_FINANCE_KEYS) if (fin[k] !== undefined) out[k] = fin[k];
  return out as T;
}

/** Can this org take gifts through Stripe? Reads the public flag, or an unmigrated stripeAccountId. */
export const orgCanReceiveGiving = (org: { canReceiveGiving?: boolean; stripeAccountId?: string } | null | undefined): boolean =>
  org?.canReceiveGiving === true || !!org?.stripeAccountId;

/** Should a donor see the "cover the processing fee" offer? */
export const orgOffersFeeCover = (org: { canReceiveGiving?: boolean; stripeAccountId?: string; givingUrl?: string; donorFeeCoverOff?: boolean; financeSettings?: { donorCoversFees?: boolean } } | null | undefined): boolean =>
  orgCanReceiveGiving(org) && !org?.givingUrl && org?.donorFeeCoverOff !== true && org?.financeSettings?.donorCoversFees !== false;

const POLICY_SETTINGS = ['fiscalYearStartMonth', 'approvalThreshold', 'autoApproveUnder', 'deptAutoApprove', 'dualApprovalAbove', 'budgetWatchPct', 'budgetRiskPct'] as const;

export type FinanceViewLevel = 'none' | 'identity' | 'policy';

/** What someone without read access to the private doc gets: members need the tax identity on their own statements,
 *  department leaders also need the approval limits their spending screens compute with. Never bills, Stripe ids or QuickBooks setup. */
export function financeViewFor(fin: OrgFinanceFields | null | undefined, level: FinanceViewLevel): OrgFinanceFields {
  if (level === 'none' || !fin) return {};
  const s = fin.financeSettings || {};
  const settings: Record<string, any> = {};
  if (s.statementIntro !== undefined) settings.statementIntro = s.statementIntro;
  if (level === 'policy') for (const k of POLICY_SETTINGS) if (s[k] !== undefined) settings[k] = s[k];
  const out: OrgFinanceFields = { financeSettings: settings };
  for (const k of ['legalName', 'ein', 'statementFooter'] as const) if (fin[k] !== undefined) out[k] = fin[k];
  return out;
}

/** Decide a caller's level from the org's public role lists. `isMember` comes from the membership marker or a giving record. */
export function financeViewLevel(org: Record<string, any>, uid: string, isMember: boolean): FinanceViewLevel {
  const inList = (k: string) => Array.isArray(org[k]) && org[k].includes(uid);
  const isHead = Array.isArray(org.ministries) && org.ministries.some((m: any) => Array.isArray(m?.headUids) && m.headUids.includes(uid));
  const inDepartment = !!org.departmentUids && Object.values(org.departmentUids as Record<string, unknown>).some(l => Array.isArray(l) && l.includes(uid));
  if (org.creatorId === uid || isHead || inDepartment || ['admins', 'pastorUids', 'leaderUids', 'staffUids', 'itAdminUids', 'seniorPastorUids', 'financeUids', 'givingViewUids', 'accountingUids', 'accountingViewUids'].some(inList)) return 'policy';
  return isMember ? 'identity' : 'none';
}
