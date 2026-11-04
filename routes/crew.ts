// Aria Crew — the workers behind Aria, for orgs/small businesses and for Plajah HQ.
//
// Org crew (owner, org admins and IT Admins manage it):
//   GET  /org/:orgId                       offered crew, who is hired, FAQ, unanswered questions, drafts, log
//   PUT  /org/:orgId/hire     {crewId, on} hire or let go (live crew only)
//   PUT  /org/:orgId/faq      {faq: [{q,a}]} what Front Desk may tell visitors
//   POST /org/:orgId/unanswered/clear
//   POST /org/:orgId/drafts/:draftId/decide {decision: 'approved'|'rejected', reason?}
//
// Front Desk (public, rate-limited):
//   GET  /desk/:orgId                      is Front Desk on here + a few suggested questions
//   POST /desk/:orgId/ask     {question}   an answer grounded in the org's published facts
//
// HQ crew (platform admins only):
//   GET  /hq/briefing                      today's briefing, the HQ roster, standing decisions and drifts
//   POST /hq/drifts           {principleId, note}
//   POST /hq/drifts/:id/close
//
// State lives in the server-only docs `orgCrew/{orgId}` and `hqCrew/state` (no client rule matches them,
// so clients can neither read nor write them). Every action goes through services/crew/crewPolicy.
//
// Mounted in server.ts as: app.use('/api/crew', apiLimiter, express.json({ limit: '64kb' }), createCrewRouter({...}))
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { fsGet, fsPatch, fsQuery, verifyIdTokenDetailed } from '../services/firebaseAdminRest';
import { HQ_CREW, charterFor, offeredOrgCrew } from '../services/crew/crewRoster';
import {
  addLog, addUnanswered, canHire, canManageCrew, checkAction, cleanFaq, decideDraft, expireDrafts, isHired,
  normalizeOrgCrew, takeModelCall,
} from '../services/crew/crewPolicy';
import { buildPrompt, checkAnswer, extractiveAnswer, factsFromOrg, genericWords, retrieve, unknownAnswer, type DeskAnswer } from '../services/crew/frontDesk';
import { VISION_PRINCIPLES, composeBriefing, countSignups, type BriefingInputs, type VisionDrift } from '../services/crew/hqBriefing';
import { createGeminiLane, geminiConfigured, laneModel, type LaneFn } from '../services/ai/geminiLane';
import type { CrewMemberId, OrgCrewState } from '../services/crew/crewTypes';

export interface CrewStore {
  get(path: string): Promise<Record<string, any> | null>;
  patch(path: string, data: Record<string, unknown>): Promise<boolean>;
  query(collection: string, filters: { field: string; value: string | number | boolean; op?: 'EQUAL' | 'ARRAY_CONTAINS' | 'LESS_THAN_OR_EQUAL' }[], limit?: number, orderBy?: { field: string; direction: 'ASCENDING' | 'DESCENDING' }): Promise<Array<{ id: string; data: Record<string, any> }>>;
}
const adminStore: CrewStore = { get: fsGet, patch: fsPatch, query: (c, f, l, o) => fsQuery(c, f, l, o) };

export interface CrewDeps {
  store?: CrewStore;
  /** The signed-in, non-anonymous caller's uid, or null. */
  callerUid?: (req: Request) => Promise<string | null>;
  /** Platform-admin check (server.ts isPlatformAdminReq after authMiddleware semantics). */
  isAdmin?: (req: Request) => Promise<boolean>;
  /** Front Desk's model. Defaults to Gemini when configured; without one Front Desk answers from the facts alone. */
  model?: LaneFn | null;
  now?: () => number;
}

const FRONT_DESK_MODEL_ENV = 'FRONT_DESK_AI_MODEL';
const SIGNUP_READ_LIMIT = 1000;
const badId = (s: string) => !s || s.length > 128 || /[\/.]/.test(s);
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

async function tokenUid(req: Request): Promise<string | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(h.slice(7));
  return t && !t.isAnonymous ? t.uid : null;
}

/** A tiny per-key window limiter for the public Front Desk (on top of the global API limiter). */
function windowLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { start: number; n: number }>();
  return (key: string, now: number) => {
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); if (hits.size > 5000) hits.delete(hits.keys().next().value as string); return true; }
    if (h.n >= max) return false;
    h.n += 1; return true;
  };
}

export function createCrewRouter(deps: CrewDeps = {}): Router {
  const r = Router();
  const store = deps.store || adminStore;
  const callerUid = deps.callerUid || tokenUid;
  const isAdmin = deps.isAdmin || (async () => false);
  const now = deps.now || Date.now;
  const model: LaneFn | null = deps.model !== undefined ? deps.model
    : geminiConfigured() ? createGeminiLane({ model: laneModel(FRONT_DESK_MODEL_ENV), temperature: 0.2, timeoutMs: 12_000 }) : null;
  const askPerIp = windowLimiter(30, 10 * 60_000);
  const askPerOrg = windowLimiter(600, 60 * 60_000);

  const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
  const loadCrew = async (orgId: string) => normalizeOrgCrew(orgId, await store.get(`orgCrew/${orgId}`), now());
  const saveCrew = (s: OrgCrewState, fields: (keyof OrgCrewState)[]) => {
    s.updatedAt = now();
    const data: Record<string, unknown> = { orgId: s.orgId, updatedAt: s.updatedAt };
    for (const f of fields) data[f] = s[f];
    return store.patch(`orgCrew/${s.orgId}`, data);
  };

  /** Signed in + allowed to manage this org's crew. */
  async function manager(req: Request, res: Response): Promise<{ uid: string; orgId: string; org: Record<string, any> } | null> {
    const uid = await callerUid(req);
    if (!uid) { fail(res, 401, 'Sign in first.'); return null; }
    const orgId = String(req.params.orgId || '');
    if (badId(orgId)) { fail(res, 400, 'Bad organization id.'); return null; }
    const org = await store.get(`organizations/${orgId}`);
    if (!org) { fail(res, 404, 'Organization not found.'); return null; }
    if (!canManageCrew(org, uid)) { fail(res, 403, 'Only the owner, org admins and IT Admins manage the crew.'); return null; }
    return { uid, orgId, org };
  }

  const view = (org: Record<string, any>, s: OrgCrewState) => ({
    offered: offeredOrgCrew(org).map(c => ({ ...c, hired: isHired(s, c.id), usedToday: s.usage.calls[c.id] || 0 })),
    faq: s.faq,
    unanswered: s.unanswered,
    drafts: s.drafts.filter(d => d.status === 'pending'),
    log: s.log.slice(0, 40),
    frontDeskModel: !!model,
  });

  r.get('/org/:orgId', async (req, res) => {
    const g = await manager(req, res); if (!g) return;
    const s = await loadCrew(g.orgId);
    if (expireDrafts(s, now())) await saveCrew(s, ['drafts']);
    res.json(view(g.org, s));
  });

  r.put('/org/:orgId/hire', async (req, res) => {
    const g = await manager(req, res); if (!g) return;
    const crewId = clean(req.body?.crewId, 40) as CrewMemberId;
    const on = req.body?.on === true;
    if (on) { const ok = canHire(crewId, 'org'); if (!ok.ok) return fail(res, 400, ok.reason!); }
    else if (!charterFor(crewId)) return fail(res, 400, 'Unknown crew member.');
    if (!offeredOrgCrew(g.org).some(c => c.id === crewId)) return fail(res, 400, 'That crew member is not offered to this kind of organization.');
    const s = await loadCrew(g.orgId);
    s.hired[crewId] = { on, by: g.uid, at: now() };
    addLog(s, { at: now(), crewId, what: on ? 'Joined the crew' : 'Left the crew', by: 'person' });
    if (!(await saveCrew(s, ['hired', 'log']))) return fail(res, 502, 'Could not save. Try again.');
    res.json(view(g.org, s));
  });

  r.put('/org/:orgId/faq', async (req, res) => {
    const g = await manager(req, res); if (!g) return;
    const c = cleanFaq(req.body?.faq);
    if (!c.ok) return fail(res, 400, c.reason!);
    const s = await loadCrew(g.orgId);
    s.faq = c.faq;
    // A question that is now taught leaves the unanswered list.
    const taught = new Set(c.faq.map(f => f.q.toLowerCase()));
    s.unanswered = s.unanswered.filter(u => !taught.has(u.q.toLowerCase()));
    addLog(s, { at: now(), crewId: 'front_desk', what: `FAQ saved (${c.faq.length} questions)`, by: 'person' });
    if (!(await saveCrew(s, ['faq', 'unanswered', 'log']))) return fail(res, 502, 'Could not save. Try again.');
    res.json(view(g.org, s));
  });

  r.post('/org/:orgId/unanswered/clear', async (req, res) => {
    const g = await manager(req, res); if (!g) return;
    const s = await loadCrew(g.orgId);
    s.unanswered = [];
    if (!(await saveCrew(s, ['unanswered']))) return fail(res, 502, 'Could not save. Try again.');
    res.json(view(g.org, s));
  });

  r.post('/org/:orgId/drafts/:draftId/decide', async (req, res) => {
    const g = await manager(req, res); if (!g) return;
    const decision = req.body?.decision === 'approved' ? 'approved' : req.body?.decision === 'rejected' ? 'rejected' : null;
    if (!decision) return fail(res, 400, 'decision must be approved or rejected.');
    const s = await loadCrew(g.orgId);
    const out = decideDraft(s, clean(req.params.draftId, 64), decision, g.uid, now(), clean(req.body?.reason, 300) || undefined);
    if (!out.ok) return fail(res, 409, out.reason!);
    if (!(await saveCrew(s, ['drafts', 'log']))) return fail(res, 502, 'Could not save. Try again.');
    res.json(view(g.org, s));
  });

  // ── Front Desk (public) ───────────────────────────────────────────────────

  /** The org, if Front Desk may speak for it: it exists, is public, and has hired Front Desk. */
  async function deskOrg(orgId: string) {
    if (badId(orgId)) return null;
    const org = await store.get(`organizations/${orgId}`);
    if (!org || org.isPrivate === true || org.isPublic === false) return null;
    const s = await loadCrew(orgId);
    return isHired(s, 'front_desk') ? { org, s } : null;
  }

  r.get('/desk/:orgId', async (req, res) => {
    const d = await deskOrg(String(req.params.orgId || ''));
    res.set('Cache-Control', 'public, max-age=60');
    if (!d) return res.json({ on: false });
    res.json({ on: true, name: clean(d.org.name, 120), suggestions: d.s.faq.slice(0, 4).map(f => f.q) });
  });

  r.post('/desk/:orgId/ask', async (req, res) => {
    const orgId = String(req.params.orgId || '');
    const question = clean(req.body?.question, 500);
    if (question.length < 2) return fail(res, 400, 'Ask a question.');
    const t = now();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!askPerIp(ip, t) || !askPerOrg(orgId, t)) return fail(res, 429, 'Front Desk is busy — try again in a few minutes.');
    const d = await deskOrg(orgId);
    if (!d) return fail(res, 404, 'Front Desk is not on for this page.');
    const allowed = checkAction('front_desk', 'answer_visitors');
    if (!allowed.ok) return fail(res, 403, allowed.reason!);

    const name = clean(d.org.name, 120) || 'this organization';
    const facts = factsFromOrg(d.org, d.s.faq);
    const ignore = genericWords(d.org);
    const hits = retrieve(question, facts, 6, ignore);
    let out: DeskAnswer | null = null;
    // The model only sees the matching facts; with no match there is nothing to ground an answer in.
    if (model && hits.length && takeModelCall(d.s, 'front_desk', t)) {
      try {
        const p = buildPrompt(name, question, hits);
        out = checkAnswer(await model(p.system, p.user, 400, { json: true, temperature: 0.2 }), hits);
        if (out?.unknown) out = unknownAnswer(name, facts);
      } catch { out = null; }
    }
    if (!out) out = extractiveAnswer(name, question, facts, facts, ignore);
    if (out.unknown) addUnanswered(d.s, question, t);
    addLog(d.s, { at: t, crewId: 'front_desk', what: out.unknown ? 'Could not answer a visitor' : 'Answered a visitor', by: out.by });
    await saveCrew(d.s, ['usage', 'unanswered', 'log']);
    const labels = new Map(facts.map(f => [f.id, f.label]));
    res.json({ answer: out.answer, from: [...new Set(out.cites.map(c => labels.get(c)).filter(Boolean))], unknown: out.unknown, by: out.by });
  });

  // ── HQ crew (platform admins) ─────────────────────────────────────────────

  async function hqGuard(req: Request, res: Response): Promise<string | null> {
    const uid = await callerUid(req);
    if (!uid) { fail(res, 401, 'Sign in first.'); return null; }
    if (!(await isAdmin(req))) { fail(res, 403, 'Platform admins only.'); return null; }
    return uid;
  }
  const loadDrifts = async (): Promise<VisionDrift[]> => {
    const d = await store.get('hqCrew/state');
    return Array.isArray(d?.drifts) ? d!.drifts.slice(0, 200) : [];
  };

  async function gatherInputs(): Promise<BriefingInputs> {
    const t = now();
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const [briefToday, briefYesterday, open, ack, users, drifts] = await Promise.all([
      store.get(`security_briefs/${day(t)}`).catch(() => null),
      store.get(`security_briefs/${day(t - 86_400_000)}`).catch(() => null),
      store.query('security_findings', [{ field: 'status', value: 'open' }], 500).catch(() => null),
      store.query('security_findings', [{ field: 'status', value: 'ack' }], 500).catch(() => null),
      store.query('users', [{ field: 'createdAt', value: t + 86_400_000, op: 'LESS_THAN_OR_EQUAL' }], SIGNUP_READ_LIMIT, { field: 'createdAt', direction: 'DESCENDING' }).catch(() => null),
      loadDrifts(),
    ]);
    const brief = briefToday?.status === 'generating' ? briefYesterday : (briefToday || briefYesterday);
    const findings = open || ack ? (() => {
      const f = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const row of [...(open || []), ...(ack || [])]) { const sev = row.data.severity as keyof typeof f; if (sev in f) f[sev] += 1; }
      return f;
    })() : null;
    return { now: t, securityBrief: brief as any, findings, signups: users ? countSignups(users.map(u => u.data), t, SIGNUP_READ_LIMIT) : null, drifts };
  }

  r.get('/hq/briefing', async (req, res) => {
    if (!(await hqGuard(req, res))) return;
    const inputs = await gatherInputs();
    res.json({ briefing: composeBriefing(inputs), crew: HQ_CREW, principles: VISION_PRINCIPLES, drifts: inputs.drifts });
  });

  r.post('/hq/drifts', async (req, res) => {
    const uid = await hqGuard(req, res); if (!uid) return;
    const principleId = clean(req.body?.principleId, 40);
    const note = clean(req.body?.note, 400);
    if (!VISION_PRINCIPLES.some(p => p.id === principleId)) return fail(res, 400, 'Pick one of the standing decisions.');
    if (!note) return fail(res, 400, 'Say what drifted.');
    const drifts = await loadDrifts();
    drifts.unshift({ id: `d${now().toString(36)}`, principleId, note, openedAt: now() });
    if (!(await store.patch('hqCrew/state', { drifts: drifts.slice(0, 200), updatedAt: now() }))) return fail(res, 502, 'Could not save. Try again.');
    res.json({ drifts });
  });

  r.post('/hq/drifts/:id/close', async (req, res) => {
    const uid = await hqGuard(req, res); if (!uid) return;
    const drifts = await loadDrifts();
    const d = drifts.find(x => x.id === req.params.id);
    if (!d) return fail(res, 404, 'Drift not found.');
    if (!d.closedAt) d.closedAt = now();
    if (!(await store.patch('hqCrew/state', { drifts, updatedAt: now() }))) return fail(res, 502, 'Could not save. Try again.');
    res.json({ drifts });
  });

  return r;
}
