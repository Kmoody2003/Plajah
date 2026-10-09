// routes/securityCouncil.ts — Security & IT Council API. Mounted in server.ts at '/api' with exact paths.
//
//   POST /api/cron/security-council               header x-cron-key: ADMIN_SEED_KEY | CRON_SECRET  (every 15 min)
//   POST /api/security/council/ingest-audit       header x-council-ingest-key: SECURITY_COUNCIL_INGEST_KEY (CI)
//   GET  /api/security/council/overview           platform admin
//   GET  /api/security/council/findings           platform admin  (?status=open|ack|fixed|false_positive|all&agent=&limit=)
//   POST /api/security/council/findings/:id/status platform admin  {status, note?}
//   GET  /api/security/council/briefs/latest      platform admin
//   GET  /api/security/council/mitigations        platform admin
//   POST /api/security/council/mitigations/:id/undo platform admin
//   POST /api/security/council/run                platform admin  (manual run; ?brief=force)
//
// The council PROPOSES. None of these routes changes rules, config, code, or user accounts.
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getCouncilStore } from '../services/securityCouncil/registry';
import { runCouncil, undoMitigation, updateFindingStatus } from '../services/securityCouncil/council';
import { AGENT_CHARTERS, THRESHOLDS } from '../services/securityCouncil/agents';
import { forgetMitigationLocally } from '../services/securityCouncil/registry';
import { toMs } from '../services/securityCouncil/store';
import {
  COUNCIL_AGENTS, FINDING_STATUSES, SEVERITY_RANK, clean, councilEnvFromProcess,
  type FindingStatus, type SecurityFinding, type SecurityMitigation,
} from '../services/securityCouncil/types';

type Mw = (req: any, res: any, next: any) => any;
export interface SecurityCouncilRouterDeps { authMiddleware: Mw; requireVerifiedAdmin: Mw }

function keyEquals(provided: unknown, expected: string | undefined): boolean {
  if (typeof provided !== 'string' || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

let running = false;

export function createSecurityCouncilRouter(deps: SecurityCouncilRouterDeps): Router {
  const r = Router();
  const admin = [deps.authMiddleware, deps.requireVerifiedAdmin];
  const storeOr503 = (res: any) => {
    const s = getCouncilStore();
    if (!s) { res.status(503).json({ error: 'Security council store not initialised' }); return null; }
    return s;
  };
  const actor = (req: any) => String(req.email || req.uid || 'admin').slice(0, 128);

  async function doRun(req: any, res: any, force: boolean) {
    const store = storeOr503(res); if (!store) return;
    if (!(await store.ready())) return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' });
    if (running) return res.status(409).json({ error: 'A council run is already in progress on this instance' });
    running = true;
    try {
      const b = String(req.query.brief || 'auto');
      const summary = await runCouncil(store, councilEnvFromProcess(), { force, brief: b === 'force' ? 'force' : b === 'skip' ? 'skip' : 'auto' });
      res.json(summary);
    } catch (err: any) {
      console.error('[security-council] run failed:', err?.message || err);
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    } finally { running = false; }
  }

  // ── Cron (Cloud Scheduler) ────────────────────────────────────────────────
  r.post('/cron/security-council', async (req: any, res: any) => {
    const key = req.headers['x-cron-key'];
    if (!keyEquals(key, process.env.ADMIN_SEED_KEY) && !keyEquals(key, process.env.CRON_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return doRun(req, res, req.query.force === '1');
  });

  // ── CI audit ingest (key auth, no user session) ───────────────────────────
  // Body must stay under the server's global 10kb JSON limit; scripts/security-council-audit.mjs trims it.
  r.post('/security/council/ingest-audit', async (req: any, res: any) => {
    if (!keyEquals(req.headers['x-council-ingest-key'], process.env.SECURITY_COUNCIL_INGEST_KEY)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const store = storeOr503(res); if (!store) return;
    const b = req.body || {};
    if (typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ error: 'JSON object required' });
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const arr = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : []);
    // PR runs describe a branch, not production: store them beside `latest` instead of overwriting it.
    const isPr = b.event === 'pull_request';
    const targetId = isPr ? `pr_${String(b.ref || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}` : 'latest';
    const prev = await store.get('security_audit', 'latest');
    const now = Date.now();
    const doc = clean({
      generatedAt: num(b.generatedAt) ?? now,
      receivedAt: now,
      ref: str(b.ref, 120), commit: str(b.commit, 64), event: str(b.event, 40),
      npmAudit: {
        counts: b.npmAudit?.counts && typeof b.npmAudit.counts === 'object' ? {
          critical: num(b.npmAudit.counts.critical) ?? 0, high: num(b.npmAudit.counts.high) ?? 0,
          moderate: num(b.npmAudit.counts.moderate) ?? 0, low: num(b.npmAudit.counts.low) ?? 0,
        } : null,
        advisories: arr(b.npmAudit?.advisories, 60).map((a: any) => ({
          name: str(a?.name, 120), severity: str(a?.severity, 12), title: str(a?.title, 160), url: str(a?.url, 200),
          range: str(a?.range, 80), isDirect: a?.isDirect === true, source: str(String(a?.source ?? ''), 40),
          fixAvailable: a?.fixAvailable === true ? true : a?.fixAvailable && typeof a.fixAvailable === 'object'
            ? { name: str(a.fixAvailable.name, 120), version: str(a.fixAvailable.version, 40), isSemVerMajor: a.fixAvailable.isSemVerMajor === true } : false,
        })),
      },
      // Secret scan: location + rule only. A value field is never accepted.
      secretScan: { findings: arr(b.secretScan?.findings, 25).map((s: any) => ({ rule: str(s?.rule, 60), file: str(s?.file, 200), line: num(s?.line) ?? 0 })) },
      staticScan: b.staticScan ? {
        scannedAt: now,
        unboundedListeners: arr(b.staticScan.unboundedListeners, 30).map((x: any) => ({ file: str(x?.file, 200), line: num(x?.line) ?? 0 })),
        unboundedQueries: arr(b.staticScan.unboundedQueries, 30).map((x: any) => ({ file: str(x?.file, 200), line: num(x?.line) ?? 0 })),
      } : prev?.staticScan ?? null,
      bundle: b.bundle && num(b.bundle.totalKb) ? {
        totalKb: num(b.bundle.totalKb),
        previousTotalKb: num(prev?.bundle?.totalKb) ?? null,
        largest: arr(b.bundle.largest, 10).map((c: any) => ({ file: str(c?.file, 160), kb: num(c?.kb) ?? 0 })),
      } : prev?.bundle ?? null, // PR runs skip the build: keep the last measured bundle
    });
    const ok = await store.patch('security_audit', targetId, doc as Record<string, unknown>);
    if (!isPr) await store.patch('security_audit', new Date(now).toISOString().slice(0, 10), doc as Record<string, unknown>);
    res.status(ok ? 200 : 500).json({ ok, stored: targetId });
  });

  // ── Admin views ───────────────────────────────────────────────────────────
  r.get('/security/council/overview', ...admin, async (_req: any, res: any) => {
    const store = storeOr503(res); if (!store) return;
    const [runs, state] = await Promise.all([
      store.query('security_council_runs', { orderBy: { field: 'at', dir: 'desc' }, limit: 5 }),
      store.get('security_audit', 'latest'),
    ]);
    const env = councilEnvFromProcess();
    res.json({
      agents: COUNCIL_AGENTS.map(id => ({ id, ...AGENT_CHARTERS[id] })),
      thresholds: THRESHOLDS,
      lastRuns: runs.map(r => ({ id: r.id, ...r.data })),
      auditFeed: state ? { generatedAt: toMs(state.generatedAt), ref: state.ref ?? null, commit: state.commit ?? null } : null,
      config: {
        llmTriage: !!env.anthropicApiKey, triageModel: env.triageModel, briefModel: env.briefModel,
        autoMitigate: env.autoMitigate, briefHourUtc: env.briefHourUtc, probePaths: env.probePaths,
        ingestKeyConfigured: !!process.env.SECURITY_COUNCIL_INGEST_KEY,
        cronKeyConfigured: !!(process.env.CRON_SECRET || process.env.ADMIN_SEED_KEY),
      },
    });
  });

  r.get('/security/council/findings', ...admin, async (req: any, res: any) => {
    const store = storeOr503(res); if (!store) return;
    const status = String(req.query.status || 'active');
    const where = status === 'all' ? [] : status === 'active'
      ? [{ field: 'status', op: 'in' as const, value: ['open', 'ack'] }]
      : FINDING_STATUSES.includes(status as FindingStatus) ? [{ field: 'status', op: '==' as const, value: status }] : null;
    if (!where) return res.status(400).json({ error: 'bad status' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    let rows = (await store.query('security_findings', { where, limit })).map(r => r.data as SecurityFinding);
    const agent = String(req.query.agent || '');
    if (agent) rows = rows.filter(f => f.agent === agent);
    rows.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || toMs(b.lastSeen) - toMs(a.lastSeen));
    res.json({ findings: rows });
  });

  r.post('/security/council/findings/:id/status', ...admin, async (req: any, res: any) => {
    const store = storeOr503(res); if (!store) return;
    const id = String(req.params.id || '');
    const status = String(req.body?.status || '') as FindingStatus;
    if (!/^f_[0-9a-f]{24}$/.test(id)) return res.status(400).json({ error: 'bad id' });
    if (!FINDING_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${FINDING_STATUSES.join(', ')}` });
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const f = await updateFindingStatus(store, id, status, actor(req), note);
    if (!f) return res.status(404).json({ error: 'Finding not found' });
    res.json({ finding: f });
  });

  r.get('/security/council/briefs/latest', ...admin, async (_req: any, res: any) => {
    const store = storeOr503(res); if (!store) return;
    const rows = await store.query('security_briefs', { orderBy: { field: 'generatedAt', dir: 'desc' }, limit: 3 });
    const brief = rows.map(r => r.data).find(b => b.status === 'ready') || rows[0]?.data || null;
    res.json({ brief });
  });

  r.get('/security/council/mitigations', ...admin, async (req: any, res: any) => {
    const store = storeOr503(res); if (!store) return;
    const all = req.query.all === '1';
    const rows = await store.query('security_mitigations', all ? { orderBy: { field: 'createdAt', dir: 'desc' }, limit: 100 } : { where: [{ field: 'status', op: '==', value: 'active' }], limit: 300 });
    const now = Date.now();
    res.json({
      autoMitigate: councilEnvFromProcess().autoMitigate,
      mitigations: rows.map(r => r.data as SecurityMitigation).map(m => ({ ...m, effectiveStatus: m.status === 'active' && toMs(m.expiresAt) <= now ? 'expired' : m.status })),
    });
  });

  r.post('/security/council/mitigations/:id/undo', ...admin, async (req: any, res: any) => {
    const store = storeOr503(res); if (!store) return;
    const id = String(req.params.id || '');
    if (!/^m_[0-9a-f]{6,24}_\d+$/.test(id)) return res.status(400).json({ error: 'bad id' });
    const m = await undoMitigation(store, id, actor(req));
    if (!m) return res.status(404).json({ error: 'Mitigation not found' });
    forgetMitigationLocally(m.target.ipHash); // other instances drop it within 60s (cache refresh)
    res.json({ mitigation: m });
  });

  r.post('/security/council/run', ...admin, async (req: any, res: any) => doRun(req, res, true));

  return r;
}
