// routes/genCloud.ts — Plajah cloud generation (white-label images / video / voice), paid in credits.
//
//   GET  /engines              → engines a user may see, each with allowed / upgradeTo (no providers, no costs)
//   GET  /balance              → { available, monthly, bonus, pack, held, frozen, plan }
//   POST /quote   { engine, prompt, seconds?, resolution?, count?, aspect?, text? } → { credits, units, unitLabel }
//   POST /jobs    same body (+ imageUrl?, voiceId?)                                  → job (public view)
//   GET  /jobs/:id                                                                  → job, advanced one poll step
//   POST /admin/grant { uid, credits, grantId }   platform admins only: bonus credits (testing, make-goods)
//   GET  /packs                → credit packs for sale
//   POST /packs/checkout { packId } → { url } Stripe Checkout (credits arrive via the Stripe webhook)
//
// Mounted in server.ts at /api/gen-cloud; OFF until GENCLOUD_ENABLED=1 (503 gencloud_off).
// Monthly Plajah+ credits are granted lazily on the first call of each month (idempotent per period),
// so no cron is needed. Providers, model ids and provider costs never leave the server.
// Server-only Firestore: genCloudLedgers/{owner}, genCloudJobs/{id}, genCloudAccounts/{uid}
// { plan?, verifiedAdult? } (admin-set overrides). No client rule matches them → clients are denied.

import { Router, type Request, type Response } from 'express';
import { ENGINES, publicEngine, withRouteOverrides } from '../services/genCloud/catalog';
import { quote, QuoteError } from '../services/genCloud/pricing';
import { canUseEngine, PLAN_GRANTS, type AccountFacts, type PlanId } from '../services/genCloud/tiers';
import { balance, grantBonus, grantMonthly, grantPack, lapse, LedgerError, revokePack, type Ledger } from '../services/genCloud/ledger';
import { CREDIT_PACKS, getPack, packFromSession, packMetadata, refundRevokeTarget, type CreditPack } from '../services/genCloud/packs';
import { GenError, pollJob, submitJob, type GatewayDeps, type GenJob } from '../services/genCloud/gateway';
import type { Engine, GenRequest } from '../services/genCloud/types';

export interface GenCloudAccount {
  plan: PlanId;
  verifiedAdult: boolean;
  restricted: boolean;
  /** Ledger owner — the uid, or a team pool id for team plans. */
  owner: string;
}

export interface GenCloudRouteDeps extends Omit<GatewayDeps, 'updateLedger' | 'saveJob' | 'engines'> {
  enabled: () => boolean;
  callerUid: (req: Request) => Promise<string | null>;
  isAdmin: (req: Request, uid: string) => Promise<boolean>;
  account: (uid: string) => Promise<GenCloudAccount>;
  ledger: { read(owner: string): Promise<Ledger>; update(owner: string, fn: (l: Ledger) => Ledger): Promise<Ledger> };
  jobs: { save(job: GenJob): Promise<void>; get(id: string): Promise<GenJob | null> };
  /** GENCLOUD_ROUTES override JSON (read per request so ops can change it without a deploy). */
  routeOverrides?: () => string | undefined;
  /** Create a Stripe Checkout Session for a pack; returns its URL. Absent = packs not on sale. */
  createCheckout?: (a: { uid: string; owner: string; pack: CreditPack; metadata: Record<string, string>; origin: string }) => Promise<string>;
  /** Trusted site origin for the Checkout success/cancel URLs. */
  origin?: (req: Request) => string;
}

// ── Stripe webhook side (called from server.ts's /api/stripe/webhook) ─────────────────────────────

export interface PackWebhookDeps {
  ledger: GenCloudRouteDeps['ledger'];
  /** genCloudPackPurchases/{paymentIntentId} → which purchase a refund belongs to. */
  purchases: { get(pi: string): Promise<Record<string, any> | null>; set(pi: string, d: Record<string, unknown>): Promise<boolean> };
  now: () => number;
}

/**
 * checkout.session.completed. Returns 'skip' for anything that isn't a paid pack, 'granted' on
 * success (also on a redelivery — grantPack is idempotent per session), and throws on failure so
 * the webhook answers non-2xx and Stripe retries. Safe to call before the fulfilment gate.
 */
export async function onPackCheckoutCompleted(session: any, deps: PackWebhookDeps): Promise<'skip' | 'granted'> {
  const g = packFromSession(session);
  if (!g) return 'skip';
  const now = deps.now();
  await deps.ledger.update(g.owner, l => grantPack(l, g.purchaseId, g.credits, now));
  if (g.paymentIntentId) {
    const ok = await deps.purchases.set(g.paymentIntentId, { owner: g.owner, uid: g.uid, purchaseId: g.purchaseId, credits: g.credits, at: now });
    if (!ok) throw new Error(`pack purchase index ${g.paymentIntentId} not written`);
  }
  return 'granted';
}

/** charge.refunded: take back the refunded share of the pack's unspent credits. */
export async function onPackChargeRefunded(charge: any, deps: PackWebhookDeps): Promise<number> {
  const pi = typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id;
  if (!pi) return 0;
  const p = await deps.purchases.get(pi);
  if (!p?.owner || !p.purchaseId) return 0;
  const target = refundRevokeTarget(Number(p.credits) || 0, Number(charge.amount_refunded) || 0, Number(charge.amount) || 0);
  let taken = 0;
  await deps.ledger.update(String(p.owner), l => { const r = revokePack(l, String(p.purchaseId), target); taken = r.taken; return r.ledger; });
  return taken;
}

const periodOf = (now: number) => { const d = new Date(now); return { id: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) }; };

/** Grant this month's allowance, or freeze monthly credits if the plan no longer has any. Idempotent. */
export function refreshAllowance(l: Ledger, plan: PlanId, now: number): Ledger {
  if (PLAN_GRANTS[plan].monthlyCredits > 0) {
    const p = periodOf(now);
    return grantMonthly(l, plan, p.id, p.start, now);
  }
  const hasMonthly = l.buckets.some(b => b.source === 'monthly' && b.remaining > 0);
  return hasMonthly && l.lapsedAt === undefined ? lapse(l, now) : l;
}

export function publicJob(j: GenJob) {
  return { id: j.id, engine: j.engine, status: j.status, credits: j.credits, outputs: j.outputs, error: j.error, createdAt: j.createdAt, updatedAt: j.updatedAt, aiGenerated: true as const };
}

const ENGINE_IDS = new Set(ENGINES.map(e => e.id));
const RESOLUTIONS = new Set(['720p', '1080p', '4k']);
const ASPECTS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);

/** Whitelist the request body. Anything else the client sends is dropped. */
function parseRequest(b: any): GenRequest {
  if (!b || typeof b !== 'object' || !ENGINE_IDS.has(b.engine)) throw new GenError('unknown_engine', 'Choose an engine.');
  const req: GenRequest = { engine: b.engine, prompt: typeof b.prompt === 'string' ? b.prompt : '' };
  if (b.seconds !== undefined) req.seconds = Number(b.seconds);
  if (RESOLUTIONS.has(b.resolution)) req.resolution = b.resolution;
  if (b.count !== undefined) req.count = Number(b.count);
  if (ASPECTS.has(b.aspect)) req.aspect = b.aspect;
  if (typeof b.text === 'string') req.text = b.text.slice(0, 20000);
  if (typeof b.voiceId === 'string' && /^[A-Za-z0-9]{8,64}$/.test(b.voiceId)) req.voiceId = b.voiceId;
  if (typeof b.imageUrl === 'string') {
    // Reference images must already be in Plajah storage — never a URL the provider would fetch for a stranger.
    let u: URL | null = null;
    try { u = new URL(b.imageUrl); } catch { /* ignore */ }
    if (!u || u.protocol !== 'https:' || !/(^|\.)firebasestorage\.googleapis\.com$|(^|\.)storage\.googleapis\.com$/.test(u.hostname)) {
      throw new GenError('bad_image', 'Reference images must be uploaded to Plajah first.');
    }
    req.imageUrl = u.toString();
  }
  return req;
}

const STATUS: Record<string, number> = {
  unknown_engine: 400, bad_prompt: 400, bad_image: 400, blocked: 422, not_found: 404, packs_off: 503, bad_pack: 400,
  restricted_account: 403, adult_only: 403, lane_locked: 403,
};

export function createGenCloudRouter(deps: GenCloudRouteDeps) {
  const router = Router();
  const engines = (): Engine[] => withRouteOverrides(ENGINES, deps.routeOverrides?.());
  const engineById = (id: string) => engines().find(e => e.id === id);

  router.use(async (req: Request, res: Response, next) => {
    if (!deps.enabled()) return res.status(503).json({ error: 'Cloud generation isn’t open yet.', code: 'gencloud_off' });
    const uid = await deps.callerUid(req).catch(() => null);
    if (!uid) return res.status(401).json({ error: 'Sign in to generate.' });
    (req as any).uid = uid;
    next();
  });

  const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try { res.json(await fn(req)); }
    catch (e: any) {
      if (e instanceof GenError) return res.status(STATUS[e.code] ?? 400).json({ error: e.message, code: e.code, ...(e.extra || {}) });
      if (e instanceof QuoteError) return res.status(400).json({ error: e.message, code: e.code });
      if (e instanceof LedgerError && e.code === 'insufficient') return res.status(402).json({ error: 'Not enough credits for this one.', code: 'insufficient' });
      console.warn('[genCloud]', e?.message || e);
      res.status(502).json({ error: 'Generation is having trouble. Please try again.', code: 'gencloud_error' });
    }
  };

  /** The account plus a ledger with this month's allowance applied. */
  const load = async (uid: string) => {
    const acct = await deps.account(uid);
    const now = deps.now();
    const ledger = await deps.ledger.update(acct.owner, l => refreshAllowance(l, acct.plan, now));
    const bal = balance(ledger, now);
    const facts: AccountFacts = { plan: acct.plan, packCredits: bal.pack, verifiedAdult: acct.verifiedAdult, restricted: acct.restricted };
    return { acct, facts, bal };
  };

  router.get('/engines', handle(async req => {
    const { facts } = await load((req as any).uid);
    return {
      engines: engines().map(e => {
        const a = canUseEngine(e, facts);
        return { ...publicEngine(e), allowed: a.ok, ...(a.ok ? {} : { reason: a.reason, upgradeTo: a.upgradeTo }) };
      }),
    };
  }));

  router.get('/balance', handle(async req => {
    const { acct, bal } = await load((req as any).uid);
    return { ...bal, plan: acct.plan };
  }));

  router.post('/quote', handle(async req => {
    const r = parseRequest(req.body);
    const e = engineById(r.engine);
    if (!e) throw new GenError('unknown_engine', 'Choose an engine.');
    const q = quote(e, r);
    return { engine: q.engine, credits: q.credits, units: q.units, unitLabel: q.unitLabel };
  }));

  router.post('/jobs', handle(async req => {
    const uid = (req as any).uid as string;
    const r = parseRequest(req.body);
    const { acct, facts } = await load(uid);
    const job = await submitJob(uid, acct.owner, facts, r, {
      ...deps, engines: engineById, updateLedger: deps.ledger.update, saveJob: deps.jobs.save,
    });
    return { job: publicJob(job) };
  }));

  router.get('/jobs/:id', handle(async req => {
    const uid = (req as any).uid as string;
    const job = await deps.jobs.get(String(req.params.id));
    if (!job || job.uid !== uid) throw new GenError('not_found', 'No such job.');
    const next = await pollJob(job, { ...deps, engines: engineById, updateLedger: deps.ledger.update, saveJob: deps.jobs.save });
    return { job: publicJob(next) };
  }));

  router.post('/admin/grant', handle(async req => {
    const uid = (req as any).uid as string;
    if (!(await deps.isAdmin(req, uid))) throw new GenError('lane_locked', 'Platform admins only.');
    const b = req.body || {};
    const to = typeof b.uid === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(b.uid) ? b.uid : '';
    const credits = Math.floor(Number(b.credits));
    const grantId = typeof b.grantId === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(b.grantId) ? b.grantId : '';
    if (!to || !grantId || !(credits > 0 && credits <= 100000)) throw new GenError('bad_prompt', 'uid, grantId and 1–100000 credits are required.');
    const acct = await deps.account(to);
    const l = await deps.ledger.update(acct.owner, x => grantBonus(x, grantId, credits, deps.now()));
    return { owner: acct.owner, balance: balance(l, deps.now()) };
  }));

  router.get('/packs', handle(async () => ({
    onSale: !!deps.createCheckout,
    packs: CREDIT_PACKS.map(p => ({ id: p.id, name: p.name, credits: p.credits, priceCents: p.priceCents, bonusPct: p.bonusPct })),
  })));

  router.post('/packs/checkout', handle(async req => {
    if (!deps.createCheckout || !deps.origin) throw new GenError('packs_off', 'Credit packs aren’t on sale yet.');
    const uid = (req as any).uid as string;
    const pack = getPack(req.body?.packId);
    if (!pack) throw new GenError('bad_pack', 'Choose a credit pack.');
    const acct = await deps.account(uid);
    if (acct.restricted) throw new GenError('restricted_account', 'Credit packs aren’t available on this account.');
    const url = await deps.createCheckout({ uid, owner: acct.owner, pack, metadata: packMetadata(pack, uid, acct.owner), origin: deps.origin(req) });
    return { url };
  }));

  return router;
}
