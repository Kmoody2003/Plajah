// Grants: the application workspace behind the Grant Matcher.
//
// Everything here is per-organization and private to its staff. The applicant profile (authorized
// representative, budget, EIN/UEI…) is sensitive, and `organizations/*` is world-readable, so none
// of it is ever written to the org document: it lives in the server-only collection
// `grantWorkspaces/{orgId}`, which no client can read or write directly.
//
// GET  /api/grants/orgs/:orgId/workspace                  profile (platform + derived + saved), kind, applications
// PUT  /api/grants/orgs/:orgId/profile    {key,value}      validate and save one answer
// POST /api/grants/orgs/:orgId/readiness  {opportunityId}  what this application needs / what is missing / Aria's next question
// POST /api/grants/orgs/:orgId/contracts  {naics?, keywords?, certs?, includeIneligible?}  federal contract opportunities near the business + contracting readiness
// PUT  /api/grants/orgs/:orgId/applications/:oppId         notes, checklist, typed facts, draft sections
// POST /api/grants/orgs/:orgId/draft      {opportunityId, section, facts?, instructions?}
// POST /api/grants/orgs/:orgId/council    {opportunityId, draft?, sections?, facts?}
//
// PDF prefill happens in the browser (the uploaded file never reaches us); this router only supplies
// the profile it fills from.
import express from 'express';
import { verifyIdToken, fsGet, fsSet } from '../services/firebaseAdminRest';
import { geocodeAddress } from '../services/dataCommons/place';
import { fetchOpportunity, type ApplicantKind } from '../services/dataCommons/grants';
import { FIELD_BY_KEY, applicantKindForOrg, buildProfile, splitAddress, validateValue, type DerivedGeo, type OrgLike, type Profile, type StoredProfile } from '../services/grants/profile';
import { buildContractReadiness, buildReadiness, nextQuestion } from '../services/grants/readiness';
import { CERT_KEYS, parseNaicsList, searchContracts, type CertKey } from '../services/dataCommons/contracts';
import { sf424CopySheet } from '../services/grants/forms';
import { draftSection, reviewApplication, SECTIONS, type Facts, type ModelFn, type NoticeCtx } from '../services/grants/council';

export interface GrantsDeps {
  limiter?: express.RequestHandler;
  /** Model lane for the council and drafting. Defaults to Claude via ANTHROPIC_API_KEY. */
  model?: ModelFn;
  verify?: (token: string) => Promise<string | null>;
  get?: (path: string) => Promise<Record<string, any> | null>;
  set?: (path: string, data: Record<string, unknown>) => Promise<boolean>;
  geocode?: typeof geocodeAddress;
  opportunity?: typeof fetchOpportunity;
  contracts?: typeof searchContracts;
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';
async function claude(system: string, user: string, maxTokens = 1000): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('The writing assistant is not configured yet.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    // Low temperature: this is fidelity work, not creative writing.
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, temperature: 0.3, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(60_000),
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `model ${r.status}`);
  return data?.content?.[0]?.text || '';
}

/** Per-person daily ceilings on model calls; in-memory is fine — this only guards cost, not correctness. */
const USAGE = new Map<string, { day: string; n: number }>();
const CAPS = { draft: 25, council: 8 };
function underCap(uid: string, kind: keyof typeof CAPS): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${kind}:${uid}`;
  const u = USAGE.get(key);
  if (!u || u.day !== day) { USAGE.set(key, { day, n: 1 }); return true; }
  if (u.n >= CAPS[kind]) return false;
  u.n += 1; return true;
}

interface StoredApplication {
  /** Notice title, so the workspace can list in-progress applications without refetching each. */
  title?: string;
  notes?: string;
  /** Tick state for the document checklist, by document id. */
  docs?: Record<string, boolean>;
  /** Facts the person typed for this application (need data, outcomes, partners). */
  facts?: string[];
  sections?: Record<string, string>;
  updatedAt?: number;
}
interface Workspace { profile: StoredProfile; applications: Record<string, StoredApplication>; updatedAt?: number }

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').slice(0, max);

export function createGrantsRouter(deps: GrantsDeps = {}) {
  const router = express.Router();
  const limit = deps.limiter ?? ((_q, _r, n) => n());
  const verify = deps.verify ?? verifyIdToken;
  const get = deps.get ?? fsGet;
  const set = deps.set ?? fsSet;
  const geocode = deps.geocode ?? geocodeAddress;
  const opportunity = deps.opportunity ?? fetchOpportunity;
  const contracts = deps.contracts ?? searchContracts;
  const model = deps.model ?? claude;
  const json = express.json({ limit: '200kb' });

  const fail = (res: express.Response, status: number, error: string) => res.status(status).json({ error });

  /** Authenticate and require the caller to be on the org's leadership/finance team. */
  async function guard(req: express.Request, res: express.Response): Promise<{ uid: string; orgId: string; org: Record<string, any> } | null> {
    const h = req.headers.authorization;
    const uid = h?.startsWith('Bearer ') ? await verify(h.slice(7)) : null;
    if (!uid) { fail(res, 401, 'Sign in to use the grant workspace.'); return null; }
    const orgId = String(req.params.orgId || '');
    if (!orgId || orgId.length > 120 || /[/.]/.test(orgId)) { fail(res, 400, 'bad organization id'); return null; }
    const org = await get(`organizations/${orgId}`);
    if (!org) { fail(res, 404, 'Organization not found.'); return null; }
    const lists = ['admins', 'financeUids', 'accountingUids', 'pastorUids'].flatMap(k => (Array.isArray(org[k]) ? org[k] : []));
    if (org.creatorId !== uid && !lists.includes(uid)) { fail(res, 403, 'Only the organization\'s leaders can use its grant workspace.'); return null; }
    return { uid, orgId, org };
  }

  async function loadWorkspace(orgId: string): Promise<Workspace> {
    const w = (await get(`grantWorkspaces/${orgId}`)) as Partial<Workspace> | null;
    return { profile: (w?.profile as StoredProfile) || {}, applications: (w?.applications as Record<string, StoredApplication>) || {}, updatedAt: w?.updatedAt };
  }
  const saveWorkspace = (orgId: string, w: Workspace) => set(`grantWorkspaces/${orgId}`, { ...w, updatedAt: Date.now() });

  async function geoFor(org: Record<string, any>): Promise<DerivedGeo> {
    const loc = org.location || {};
    const addr = [loc.address, loc.city].filter(Boolean).join(', ');
    if (addr.length < 8) return {};
    try {
      const g = await geocode(addr);
      if (!g) return {};
      const parts = splitAddress(g.matchedAddress);
      return { state: g.geography?.stateAbbr, county: g.geography?.county, congressionalDistrict: g.geography?.congressionalDistrict, city: g.geography?.place?.replace(/ (city|town|village)$/i, ''), zip: parts.zip };
    } catch { return {}; }
  }

  async function profileFor(orgId: string, org: Record<string, any>, ws: Workspace): Promise<Profile> {
    return buildProfile(org as OrgLike, ws.profile, await geoFor(org));
  }

  router.get('/api/grants/orgs/:orgId/workspace', limit, async (req, res) => {
    const g = await guard(req, res); if (!g) return;
    const ws = await loadWorkspace(g.orgId);
    res.set('Cache-Control', 'no-store').json({
      kind: applicantKindForOrg(g.org as OrgLike),
      profile: await profileFor(g.orgId, g.org, ws),
      applications: ws.applications,
    });
  });

  router.put('/api/grants/orgs/:orgId/profile', limit, json, async (req, res) => {
    const g = await guard(req, res); if (!g) return;
    const key = String(req.body?.key || '');
    if (!FIELD_BY_KEY[key]) return fail(res, 400, 'Unknown field.');
    const v = validateValue(key, String(req.body?.value ?? ''));
    if ('error' in v) return fail(res, 422, v.error);
    const ws = await loadWorkspace(g.orgId);
    ws.profile[key] = { value: v.value, at: Date.now() };
    if (!(await saveWorkspace(g.orgId, ws))) return fail(res, 500, 'Could not save. Try again.');
    res.json({ profile: await profileFor(g.orgId, g.org, ws) });
  });

  /** Fetch the notice once and shape it for the readiness engine and the council. */
  async function noticeFor(oppId: string): Promise<{ notice: NoticeCtx; closeDate?: string; detail: Awaited<ReturnType<typeof fetchOpportunity>> } | null> {
    if (!/^\d{1,12}$/.test(oppId)) return null;
    const d = await opportunity(oppId);
    if (!d) return null;
    return {
      detail: d, closeDate: d.closeDate,
      notice: { title: d.title, agency: d.agency, number: d.number, summary: d.summary, eligibilityText: d.eligibilityText, closeDate: d.closeDate, awardFloor: d.awardFloor, awardCeiling: d.awardCeiling, costSharing: d.costSharing },
    };
  }

  router.post('/api/grants/orgs/:orgId/readiness', limit, json, async (req, res) => {
    const g = await guard(req, res); if (!g) return;
    let n: Awaited<ReturnType<typeof noticeFor>> = null;
    const oppId = String(req.body?.opportunityId || '');
    try { n = await noticeFor(oppId); } catch { return fail(res, 502, 'Grants.gov did not respond. Try again in a minute.'); }
    if (!n) return fail(res, 404, 'Could not find that opportunity.');
    const ws = await loadWorkspace(g.orgId);
    const profile = await profileFor(g.orgId, g.org, ws);
    const kind: ApplicantKind = (req.body?.kind as ApplicantKind) || applicantKindForOrg(g.org as OrgLike);
    const report = buildReadiness(profile, { kind, closeDate: n.closeDate, detail: n.detail ?? undefined });
    const skipped: string[] = Array.isArray(req.body?.skipped) ? req.body.skipped.map(String).slice(0, 60) : [];
    res.set('Cache-Control', 'no-store').json({
      notice: n.notice, report, next: nextQuestion(report, skipped), profile,
      sf424: sf424CopySheet(profile, { agency: n.notice.agency, number: n.notice.number, title: n.notice.title }),
      application: ws.applications[oppId] || {},
    });
  });

  router.post('/api/grants/orgs/:orgId/contracts', limit, json, async (req, res) => {
    const g = await guard(req, res); if (!g) return;
    const ws = await loadWorkspace(g.orgId);
    const profile = await profileFor(g.orgId, g.org, ws);
    const b = req.body || {};
    // Explicit request values win; otherwise fall back to what the business already told us.
    const naics = Array.isArray(b.naics) ? b.naics.map((x: unknown) => String(x).replace(/\D/g, '')).filter((x: string) => x.length >= 2 && x.length <= 6).slice(0, 12) : parseNaicsList(profile.naics?.value || '');
    const certs = (Array.isArray(b.certs) ? b.certs : String(profile.certifications?.value || 'small').split(/[\s,;]+/))
      .map((c: unknown) => String(c).toLowerCase()).filter((c: string): c is CertKey => (CERT_KEYS as string[]).includes(c));
    const keywords = (Array.isArray(b.keywords) ? b.keywords : []).map((k: unknown) => clean(k, 40)).filter(Boolean).slice(0, 5);
    const state = String(b.state || profile.state?.value || '').toUpperCase();
    const result = await contracts(state, { naics, keywords, certs: certs.length ? certs : ['small'], includeIneligible: !!b.includeIneligible });
    const report = buildContractReadiness(profile);
    res.set('Cache-Control', 'no-store').json({ ...result, usedNaics: naics, usedCerts: certs.length ? certs : ['small'], report, next: nextQuestion(report, Array.isArray(b.skipped) ? b.skipped.map(String).slice(0, 60) : []) });
  });

  router.put('/api/grants/orgs/:orgId/applications/:oppId', limit, json, async (req, res) => {
    const g = await guard(req, res); if (!g) return;
    const oppId = String(req.params.oppId || '');
    if (!/^\d{1,12}$/.test(oppId)) return fail(res, 400, 'bad opportunity id');
    const b = req.body || {};
    const sections: Record<string, string> = {};
    for (const k of Object.keys(SECTIONS)) if (typeof b.sections?.[k] === 'string') sections[k] = clean(b.sections[k], 20_000);
    const docs: Record<string, boolean> = {};
    if (b.docs && typeof b.docs === 'object') for (const [k, v] of Object.entries(b.docs).slice(0, 40)) docs[clean(k, 40)] = !!v;
    const app: StoredApplication = {
      title: clean(b.title, 220), notes: clean(b.notes, 4000), docs, sections,
      facts: (Array.isArray(b.facts) ? b.facts : []).slice(0, 40).map((f: unknown) => clean(f, 600)).filter(Boolean),
      updatedAt: Date.now(),
    };
    const ws = await loadWorkspace(g.orgId);
    ws.applications[oppId] = app;
    if (Object.keys(ws.applications).length > 50) return fail(res, 400, 'Too many saved applications — archive some first.');
    if (!(await saveWorkspace(g.orgId, ws))) return fail(res, 500, 'Could not save. Try again.');
    res.json({ application: app });
  });

  /** Identifiers and personal contact details never go to a model; the writing does not need them. */
  const NOT_FOR_MODEL = new Set(['ein', 'uei', 'repName', 'repEmail', 'repPhone', 'contactName', 'contactEmail', 'contactPhone']);

  /** Facts for a model call: the profile minus identifiers and personal contacts, plus what the person typed. */
  function factsFrom(profile: Profile, typed: unknown): Facts {
    const profileLines = Object.entries(profile)
      .filter(([k]) => FIELD_BY_KEY[k] && !NOT_FOR_MODEL.has(k))
      .map(([k, v]) => `${FIELD_BY_KEY[k].label}: ${v.value}`);
    const userFacts = (Array.isArray(typed) ? typed : []).slice(0, 40).map(f => clean(f, 600)).filter(Boolean);
    return { profileLines, userFacts };
  }

  router.post('/api/grants/orgs/:orgId/draft', limit, json, async (req, res) => {
    const g = await guard(req, res); if (!g) return;
    const section = String(req.body?.section || '');
    if (!SECTIONS[section]) return fail(res, 400, 'Unknown section.');
    if (!underCap(g.uid, 'draft')) return fail(res, 429, 'You have reached today\'s drafting limit. It resets tomorrow.');
    try {
      const n = await noticeFor(String(req.body?.opportunityId || ''));
      if (!n) return fail(res, 404, 'Could not find that opportunity.');
      const ws = await loadWorkspace(g.orgId);
      const facts = factsFrom(await profileFor(g.orgId, g.org, ws), req.body?.facts ?? ws.applications[String(req.body.opportunityId)]?.facts);
      res.json(await draftSection({ model, section, notice: n.notice, facts, instructions: clean(req.body?.instructions, 600) }));
    } catch (err: any) { fail(res, 502, String(err?.message || 'The writing assistant is unavailable.').slice(0, 200)); }
  });

  router.post('/api/grants/orgs/:orgId/council', limit, json, async (req, res) => {
    const g = await guard(req, res); if (!g) return;
    if (!underCap(g.uid, 'council')) return fail(res, 429, 'You have reached today\'s council limit. It resets tomorrow.');
    try {
      const oppId = String(req.body?.opportunityId || '');
      const n = await noticeFor(oppId);
      if (!n) return fail(res, 404, 'Could not find that opportunity.');
      const ws = await loadWorkspace(g.orgId);
      const saved = ws.applications[oppId];
      const sectionsIn = req.body?.sections && typeof req.body.sections === 'object' ? req.body.sections : saved?.sections || {};
      const sections = Object.entries(sectionsIn).filter(([k, v]) => SECTIONS[k] && typeof v === 'string' && (v as string).trim())
        .map(([k, v]) => ({ title: SECTIONS[k].title, text: clean(v, 20_000) }));
      const facts = factsFrom(await profileFor(g.orgId, g.org, ws), req.body?.facts ?? saved?.facts);
      res.json(await reviewApplication({ model, notice: n.notice, facts, draft: clean(req.body?.draft, 20_000), sections }));
    } catch (err: any) { fail(res, 502, String(err?.message || 'The council is unavailable.').slice(0, 200)); }
  });

  return router;
}
