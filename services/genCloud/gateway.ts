// services/genCloud/gateway.ts — one generation job, end to end. SERVER ONLY.
//
//   quote → access check (tier/lane/age) → moderation → HOLD credits → provider route 1
//   → (submit fails? route 2 …) → poll → store results in Plajah storage, labelled AI-generated
//   → SETTLE (success) or RELEASE (every route failed: the user pays nothing).
// All I/O is injected (ledger store, job store, adapters, persist, moderation) so the whole flow
// runs in tests with fakes. Off unless GENCLOUD_ENABLED=1 (checked by the route, not here).

import { getEngine } from './catalog';
import { quote } from './pricing';
import { canUseEngine, type AccountFacts } from './tiers';
import { hold, release, settle, type Ledger } from './ledger';
import type { Engine, GenOutput, GenRequest, JobStatus, ProviderAdapter, ProviderId } from './types';

export interface StoredOutput { url: string; mime: string; width?: number; height?: number; seconds?: number }

export interface GenJob {
  id: string;
  owner: string;            // ledger owner (uid or team pool)
  uid: string;              // who asked
  engine: string;
  request: GenRequest;
  credits: number;
  status: JobStatus;
  routeIndex: number;
  providerJobId?: string;
  outputs: StoredOutput[];
  error?: string;
  createdAt: number;
  updatedAt: number;
  /** Every result carries this — labelling AI output is required (EU AI Act Art. 50) and honest. */
  aiGenerated: true;
}

export interface GatewayDeps {
  engines?: (id: string) => Engine | undefined;
  adapters: Partial<Record<ProviderId, ProviderAdapter>>;
  /** Read-modify-write the ledger atomically (Firestore transaction in production). */
  updateLedger: (owner: string, fn: (l: Ledger) => Ledger) => Promise<Ledger>;
  saveJob: (job: GenJob) => Promise<void>;
  /** Copy a provider result into Plajah storage; returns the stored URL. */
  persist: (bytes: Uint8Array, out: GenOutput, ctx: { job: GenJob; index: number }) => Promise<string>;
  moderate: (req: GenRequest, account: AccountFacts) => Promise<{ ok: true } | { ok: false; reason: string }>;
  now: () => number;
  newId: () => string;
}

export class GenError extends Error {
  constructor(public code: string, msg: string, public extra?: Record<string, unknown>) { super(msg); }
}

async function store(job: GenJob, adapter: ProviderAdapter, outputs: GenOutput[], deps: GatewayDeps): Promise<StoredOutput[]> {
  const stored: StoredOutput[] = [];
  for (let i = 0; i < outputs.length; i++) {
    const o = outputs[i];
    const bytes = o.bytes ?? (o.url ? await adapter.download(o.url) : null);
    if (!bytes) continue;
    const url = await deps.persist(bytes, o, { job, index: i });
    stored.push({ url, mime: o.mime, width: o.width, height: o.height, seconds: o.seconds });
  }
  if (!stored.length) throw new Error('no output could be stored');
  return stored;
}

async function finish(job: GenJob, deps: GatewayDeps, ok: boolean, patch: Partial<GenJob>): Promise<GenJob> {
  if (ok) await deps.updateLedger(job.owner, l => settle(l, job.id));
  else await deps.updateLedger(job.owner, l => release(l, job.id));
  const done = { ...job, ...patch, status: (ok ? 'succeeded' : 'failed') as JobStatus, updatedAt: deps.now() };
  await deps.saveJob(done);
  return done;
}

/** Try routes from `from` onward until one accepts the job. Sync providers finish here. */
async function dispatch(job: GenJob, engine: Engine, deps: GatewayDeps, from: number): Promise<GenJob> {
  const errors: string[] = [];
  for (let i = from; i < engine.routes.length; i++) {
    const route = engine.routes[i];
    const adapter = deps.adapters[route.provider];
    if (!adapter?.configured()) { errors.push(`${route.provider}: not configured`); continue; }
    try {
      const sub = await adapter.submit(route, job.request);
      const running: GenJob = { ...job, routeIndex: i, providerJobId: sub.providerJobId, status: 'running', updatedAt: deps.now() };
      if (sub.outputs?.length) {
        const outputs = await store(running, adapter, sub.outputs, deps);
        return finish(running, deps, true, { outputs });
      }
      await deps.saveJob(running);
      return running;
    } catch (e: any) {
      errors.push(`${route.provider}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  // Provider details stay in the server log; users see a plain message and keep their credits.
  console.warn('[genCloud] all routes failed', job.id, errors);
  return finish(job, deps, false, { error: 'The engine is busy right now. Your credits were not charged.' });
}

export async function submitJob(uid: string, owner: string, account: AccountFacts, req: GenRequest, deps: GatewayDeps): Promise<GenJob> {
  const engine = (deps.engines ?? getEngine)(req.engine);
  if (!engine) throw new GenError('unknown_engine', 'Unknown engine');
  const access = canUseEngine(engine, account);
  if (!access.ok) throw new GenError(access.reason, 'This engine is not available on your plan', { upgradeTo: access.upgradeTo });
  const prompt = (req.prompt ?? '').trim();
  if (engine.kind !== 'voice' && (!prompt || prompt.length > 4000)) throw new GenError('bad_prompt', 'Prompt must be 1–4000 characters');
  const mod = await deps.moderate(req, account);
  if (!mod.ok) throw new GenError('blocked', mod.reason);

  const q = quote(engine, req);
  const now = deps.now();
  const job: GenJob = {
    id: deps.newId(), owner, uid, engine: engine.id, request: { ...req, prompt }, credits: q.credits,
    status: 'queued', routeIndex: 0, outputs: [], createdAt: now, updatedAt: now, aiGenerated: true,
  };
  await deps.updateLedger(owner, l => hold(l, job.id, q.credits, now)); // throws LedgerError('insufficient')
  await deps.saveJob(job);
  return dispatch(job, engine, deps, 0);
}

/** Advance a running job one step. Safe to call repeatedly (cron or client polling via the route). */
export async function pollJob(job: GenJob, deps: GatewayDeps): Promise<GenJob> {
  if (job.status !== 'running' || !job.providerJobId) return job;
  const engine = (deps.engines ?? getEngine)(job.engine);
  if (!engine) return finish(job, deps, false, { error: 'engine removed' });
  const route = engine.routes[job.routeIndex];
  const adapter = route && deps.adapters[route.provider];
  if (!adapter) return finish(job, deps, false, { error: 'provider unavailable' });
  let p;
  try { p = await adapter.poll(route, job.providerJobId); } catch { return job; } // transient: try next poll
  if (p.status === 'queued' || p.status === 'running') return job;
  if (p.status === 'succeeded' && p.outputs?.length) {
    try { return await finish(job, deps, true, { outputs: await store(job, adapter, p.outputs, deps) }); }
    catch { /* storing failed → treat like a provider failure and try the next route */ }
  }
  // This route failed after starting: the hold stays, the next route gets the job.
  return dispatch({ ...job, providerJobId: undefined }, engine, deps, job.routeIndex + 1);
}
