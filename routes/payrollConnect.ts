// payrollConnect router — read-only employee directory from a payroll provider, for Elevate staff provisioning.
//
// Provider 1: Paychex Flex (developer.paychex.com). A Flex client admin creates an application under
//   Company Settings → Connected Applications, which yields an API key (client id) + secret. The server holds
//   ONE Paychex app (PAYCHEX_CLIENT_ID / PAYCHEX_CLIENT_SECRET — Paychex lets one key serve many authorized
//   client companies); each Plajah org stores the Paychex company id it is authorized for on its org doc
//   (organizations/{id}.payroll.paychexCompanyId, set by an org admin via POST /paychex/connect).
//   Auth: client-credentials call to the Paychex token endpoint → 60-minute bearer (no refresh; re-request).
//   Data: GET /companies/{companyId}/workers (scope workers:read) — names, job title, organization, work email.
//   We never request or forward compensation endpoints.
// Provider 2 (recommended for "any payroll"): Finch's unified Directory API (api.tryfinch.com/employer/directory)
//   covers 180+ payroll/HRIS systems with one integration — wired here as a status stub; see
//   docs/elevate-payroll-integration.md for the partner steps before it can go live.
//
// Mounted in server.ts as:  app.use('/api/payroll', express.json({ limit: '8kb' }), payrollConnectRouter)

import { Router, Request, Response } from 'express';
import { verifyIdToken, fsGet, fsPatch, adminConfig } from '../services/firebaseAdminRest';

export const payrollConnectRouter = Router();

const PAYCHEX_BASE = process.env.PAYCHEX_API_BASE || 'https://api.paychex.com';
const PAYCHEX_TOKEN_URL = process.env.PAYCHEX_TOKEN_URL || `${PAYCHEX_BASE}/auth/oauth/v2/token`;
const paychexConfigured = () => !!(process.env.PAYCHEX_CLIENT_ID && process.env.PAYCHEX_CLIENT_SECRET);

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}
/** Org admins / creator, plus the pastors index (same people who can import the directory). */
async function orgStaff(orgId: string, uid: string): Promise<{ ok: boolean; org?: Record<string, any> }> {
  if (!orgId || orgId.length > 120) return { ok: false };
  const org = await fsGet(`organizations/${orgId}`);
  if (!org) return { ok: false };
  const admins: string[] = Array.isArray(org.admins) ? org.admins : [];
  const pastors: string[] = Array.isArray(org.pastorUids) ? org.pastorUids : [];
  const leaders: string[] = Array.isArray(org.leaderUids) ? org.leaderUids : [];
  return { ok: org.creatorId === uid || admins.includes(uid) || pastors.includes(uid) || leaders.includes(uid), org };
}

// ── Paychex token (cached until ~55 min) ───────────────────────────────────────
let cached: { token: string; exp: number } | null = null;
async function paychexToken(): Promise<string> {
  if (cached && cached.exp > Date.now()) return cached.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.PAYCHEX_CLIENT_ID!, client_secret: process.env.PAYCHEX_CLIENT_SECRET! });
  const res = await fetch(PAYCHEX_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  if (!res.ok) throw new Error(`Paychex authentication failed (${res.status}).`);
  const j = await res.json() as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('Paychex did not return a token.');
  cached = { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
  return cached.token;
}
async function paychexGet(path: string): Promise<any> {
  const token = await paychexToken();
  const res = await fetch(`${PAYCHEX_BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (res.status === 401) { cached = null; throw new Error('Paychex rejected the token — check the application credentials.'); }
  if (!res.ok) throw new Error(`Paychex request failed (${res.status}).`);
  return res.json();
}

// ── GET /paychex/status?orgId= ────────────────────────────────────────────────
payrollConnectRouter.get('/paychex/status', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.query.orgId || '');
  const { ok, org } = await orgStaff(orgId, uid);
  if (!ok) return res.status(403).json({ error: 'Not allowed for this organization.' });
  const configured = paychexConfigured() && adminConfig.hasCredentials();
  const companyId = org?.payroll?.paychexCompanyId as string | undefined;
  return res.json({
    configured, connected: configured && !!companyId, companyId, companyName: org?.payroll?.paychexCompanyName,
    message: !configured ? 'Paychex Flex API is not configured on this server (PAYCHEX_CLIENT_ID / PAYCHEX_CLIENT_SECRET). Use the file export for now.'
      : !companyId ? 'Connect this organization to its Paychex company (Accounts & Access → Import staff from payroll → Connect).' : undefined,
  });
});

// ── POST /paychex/connect { orgId, companyId } — org admin binds their Paychex company ──
payrollConnectRouter.post('/paychex/connect', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  if (!paychexConfigured()) return res.status(503).json({ error: 'Paychex Flex API is not configured on this server.' });
  const orgId = String(req.body?.orgId || ''); const companyId = String(req.body?.companyId || '').trim();
  const { ok, org } = await orgStaff(orgId, uid);
  if (!ok || !org) return res.status(403).json({ error: 'Not allowed for this organization.' });
  if (!(org.creatorId === uid || (org.admins || []).includes(uid))) return res.status(403).json({ error: 'Only org owners / admins can connect payroll.' });
  if (!/^[A-Za-z0-9-]{1,64}$/.test(companyId)) return res.status(400).json({ error: 'Enter the Paychex company id.' });
  try {
    const company = await paychexGet(`/companies/${encodeURIComponent(companyId)}`);
    const name = company?.content?.[0]?.legalName || company?.legalName || company?.displayName || companyId;
    await fsPatch(`organizations/${orgId}`, { payroll: { ...(org.payroll || {}), provider: 'paychex', paychexCompanyId: companyId, paychexCompanyName: name, connectedBy: uid, connectedAt: Date.now() }, updatedAt: Date.now() });
    return res.json({ ok: true, companyId, companyName: name });
  } catch (e: any) { return res.status(502).json({ error: e?.message || 'Could not reach Paychex.' }); }
});

// ── POST /paychex/workers { orgId } → names, titles, departments, work emails (no pay data) ──
payrollConnectRouter.post('/paychex/workers', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  if (!paychexConfigured()) return res.status(503).json({ error: 'Paychex Flex API is not configured on this server. Use the file export.' });
  const orgId = String(req.body?.orgId || '');
  const { ok, org } = await orgStaff(orgId, uid);
  if (!ok || !org) return res.status(403).json({ error: 'Not allowed for this organization.' });
  const companyId = org.payroll?.paychexCompanyId as string | undefined;
  if (!companyId) return res.status(409).json({ error: 'This organization is not connected to a Paychex company yet.' });
  try {
    const workers: any[] = [];
    let offset = 0; const limit = 100;
    for (let page = 0; page < 50; page++) {
      const j = await paychexGet(`/companies/${encodeURIComponent(companyId)}/workers?offset=${offset}&limit=${limit}`);
      const rows: any[] = j?.content || j?.workers || [];
      workers.push(...rows);
      if (rows.length < limit) break;
      offset += limit;
    }
    const out = workers.map(w => {
      const name = w.name || {};
      const comms: any[] = Array.isArray(w.communications) ? w.communications : [];
      const email = comms.find(c => /email/i.test(String(c.type || '')) && /work|business/i.test(String(c.usageType || c.usage || 'work')))?.uri || comms.find(c => /email/i.test(String(c.type || '')))?.uri;
      const phone = comms.find(c => /phone|mobile/i.test(String(c.type || '')))?.dialNumber || comms.find(c => /phone|mobile/i.test(String(c.type || '')))?.uri;
      const statusRaw = String(w.currentStatus?.statusType || w.status || 'ACTIVE').toUpperCase();
      return {
        externalId: w.workerId || w.employeeId || w.id,
        firstName: name.givenName || w.firstName || '', lastName: name.familyName || w.lastName || '',
        title: w.job?.title || w.jobTitle || w.position?.title || undefined,
        department: w.organization?.name || w.laborAssignment?.organization?.name || w.department?.name || undefined,
        email: email ? String(email).toLowerCase() : undefined, phone: phone || undefined,
        status: /TERM/.test(statusRaw) ? 'TERMINATED' : /INACTIVE/.test(statusRaw) ? 'INACTIVE' : /LEAVE/.test(statusRaw) ? 'LEAVE' : 'ACTIVE',
        hireDate: w.hireDate || w.currentStatus?.effectiveDate || undefined,
        employmentType: w.employmentType || w.workerType || undefined,
      };
    }).filter(w => w.firstName || w.lastName);
    return res.json({ workers: out, companyName: org.payroll?.paychexCompanyName });
  } catch (e: any) { return res.status(502).json({ error: e?.message || 'Could not reach Paychex.' }); }
});
