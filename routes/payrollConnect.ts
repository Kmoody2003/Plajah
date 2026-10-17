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
// Provider 2 ("any payroll"): Finch's unified API (api.tryfinch.com) — one integration for 250+ payroll / HRIS
//   systems (Paychex, ADP, Gusto, QuickBooks, Paylocity, Paycor, Rippling, BambooHR, …). The org admin connects
//   their own payroll through Finch Connect (an OAuth-style popup, product scope `directory`); the server exchanges
//   the authorization code for a long-lived access token (POST /auth/token with FINCH_CLIENT_ID / FINCH_CLIENT_SECRET)
//   and stores it AES-256-GCM encrypted (ENCRYPTION_KEY) in the server-only collection payrollConnections/{orgId}.
//   The org doc only carries non-secret metadata (provider id, connection id, who/when) — organizations/* is
//   world-readable, so the token never goes there. Data: GET /employer/directory (names, department, is_active),
//   paginated. Job titles come from GET /employer/employment ONLY when FINCH_PRODUCTS includes `employment`
//   (off by default — that response also carries income fields, which this file never reads, logs or stores).
//   We never request the `individual` (SSN / DOB) or `payment` / `pay_statement` products.
//
// Mounted in server.ts as:  app.use('/api/payroll', express.json({ limit: '8kb' }), payrollConnectRouter)

import { Router, Request, Response } from 'express';
import { verifyIdToken, fsGet, fsPatch, fsSet, fsDelete, adminConfig } from '../services/firebaseAdminRest';
import { encryptSecret, decryptSecret } from '../services/fabula/genVault';

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

// ═════════════════════════════════════════════════════════════════════════════
// Finch — unified payroll / HRIS API (developer.tryfinch.com)
// ═════════════════════════════════════════════════════════════════════════════
const FINCH_API = (process.env.FINCH_API_BASE || 'https://api.tryfinch.com').replace(/\/+$/, '');
const FINCH_CONNECT_URL = process.env.FINCH_CONNECT_URL || 'https://connect.tryfinch.com/authorize';
const FINCH_API_VERSION = '2020-09-17';
/** Products we ask the employer to grant. `directory` is all the staff import needs; add `employment` for job titles. */
const FINCH_PRODUCTS = (process.env.FINCH_PRODUCTS || 'directory').split(/[\s,]+/).filter(Boolean)
  .filter(p => !/^(individual|payment|pay_statement|benefits|deduction|ssn)$/i.test(p));   // never pay / SSN products
/** `finch` or `provider` puts Finch Connect in sandbox mode (test credentials only). Leave unset in production. */
const FINCH_SANDBOX = (process.env.FINCH_SANDBOX || '').trim();
/** Everything the Finch path needs: Finch app keys + the vault key the token is encrypted with. */
const finchConfigured = () => !!(process.env.FINCH_CLIENT_ID && process.env.FINCH_CLIENT_SECRET && (process.env.ENCRYPTION_KEY || '').length >= 16);
/** Same public-base rule server.ts uses for its own OAuth redirects (VITE_APP_URL, else the request host). */
const finchRedirectUri = (req: Request) =>
  (process.env.FINCH_REDIRECT_URI || `${(process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')}/api/payroll/finch/callback`);

/** Server-only doc holding the encrypted token. organizations/* is world-readable; this collection has no client rule. */
const FINCH_CONN = (orgId: string) => `payrollConnections/${orgId}`;
interface FinchConnection { provider: 'finch'; token: string; providerId?: string; companyId?: string; connectionId?: string; products?: string[]; connectedBy: string; connectedAt: number }

/** Human label for a Finch provider id ("paychex_flex" → "Paychex Flex"). Finch ids are snake_case vendor slugs. */
const FINCH_PROVIDER_NAMES: Record<string, string> = {
  paychex_flex: 'Paychex Flex', adp_workforce_now: 'ADP Workforce Now', adp_run: 'ADP RUN', gusto: 'Gusto', quickbooks: 'QuickBooks Payroll',
  paylocity: 'Paylocity', paycor: 'Paycor', rippling: 'Rippling', bamboo_hr: 'BambooHR', justworks: 'Justworks', trinet: 'TriNet', namely: 'Namely',
  zenefits: 'Zenefits', workday: 'Workday', ukg_pro: 'UKG Pro', ukg_ready: 'UKG Ready', square_payroll: 'Square Payroll', onpay: 'OnPay', wave: 'Wave', finch: 'Finch sandbox',
};
const finchProviderName = (id?: string) => (id && (FINCH_PROVIDER_NAMES[id] || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))) || undefined;

class FinchError extends Error { constructor(msg: string, public status: number) { super(msg); } }
async function finchFetch(token: string, path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<any> {
  const res = await fetch(`${FINCH_API}${path}`, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Finch-API-Version': FINCH_API_VERSION, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) throw new FinchError('The payroll connection expired or was revoked in the payroll system — reconnect it.', 409);
  if (res.status === 403) throw new FinchError('The payroll connection did not grant the directory product — reconnect and approve it.', 409);
  if (res.status === 202) throw new FinchError('Finch is still syncing this payroll account for the first time — try again in a few minutes.', 503);
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { message?: string; error_description?: string };
    throw new FinchError(j.message || j.error_description || `Finch request failed (${res.status}).`, 502);
  }
  return res.json();
}
async function finchConnection(orgId: string): Promise<FinchConnection | null> {
  const doc = await fsGet(FINCH_CONN(orgId));
  return doc && doc.provider === 'finch' && typeof doc.token === 'string' ? doc as FinchConnection : null;
}
const isOrgOwnerOrAdmin = (org: Record<string, any>, uid: string) => org.creatorId === uid || (Array.isArray(org.admins) && org.admins.includes(uid));
const finchStatusMessage = (configured: boolean, connected: boolean) =>
  !configured ? 'Finch is not configured on this server (FINCH_CLIENT_ID / FINCH_CLIENT_SECRET + ENCRYPTION_KEY). Use the file export for now.'
    : !connected ? 'Connect this organization\'s payroll (Accounts & Access → Import staff from payroll → Connect payroll).' : undefined;

// ── GET /finch/status?orgId= — configured? connected? plus what the client needs to open Finch Connect ──
payrollConnectRouter.get('/finch/status', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.query.orgId || '');
  const { ok, org } = await orgStaff(orgId, uid);
  if (!ok || !org) return res.status(403).json({ error: 'Not allowed for this organization.' });
  const configured = finchConfigured() && adminConfig.hasCredentials();
  const conn = configured ? await finchConnection(orgId) : null;
  const connected = !!conn;
  const canConnect = isOrgOwnerOrAdmin(org, uid);
  return res.json({
    configured, connected, canConnect,
    provider: conn?.providerId, providerName: finchProviderName(conn?.providerId), products: conn?.products, connectedAt: conn?.connectedAt,
    // Public bits the client needs to build the Finch Connect URL (the secret never leaves the server).
    ...(configured && canConnect ? { connectUrl: FINCH_CONNECT_URL, clientId: process.env.FINCH_CLIENT_ID, redirectUri: finchRedirectUri(req), requestedProducts: FINCH_PRODUCTS, sandbox: FINCH_SANDBOX || undefined } : {}),
    message: finchStatusMessage(configured, connected),
  });
});

// ── GET /finch/callback?code=&state= — Finch Connect lands here in the popup; hand the code to the opener ──
// No request value is interpolated into the HTML: the page reads its own query string in the browser.
payrollConnectRouter.get('/finch/callback', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Connecting payroll…</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c10;color:#ddd;display:grid;place-items:center;height:100vh;margin:0}p{font-size:14px}</style></head>
<body><p id="m">Finishing the payroll connection…</p>
<script>
(function(){
  var q = new URLSearchParams(location.search);
  var msg = { type: 'plajah-finch-connect', code: q.get('code') || '', state: q.get('state') || '', error: q.get('error') || '', errorDescription: q.get('error_description') || '' };
  try { if (window.opener && !window.opener.closed) { window.opener.postMessage(msg, location.origin); setTimeout(function(){ window.close(); }, 300); return; } } catch (e) {}
  document.getElementById('m').textContent = msg.error ? ('Payroll connection failed: ' + (msg.errorDescription || msg.error)) : 'You can close this window and return to Plajah.';
})();
</script></body></html>`);
});

// ── POST /finch/connect { orgId, code } — org owner/admin exchanges the Finch Connect code for a token ──
payrollConnectRouter.post('/finch/connect', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  if (!finchConfigured()) return res.status(503).json({ error: 'Finch is not configured on this server.' });
  const orgId = String(req.body?.orgId || ''); const code = String(req.body?.code || '').trim();
  const { ok, org } = await orgStaff(orgId, uid);
  if (!ok || !org) return res.status(403).json({ error: 'Not allowed for this organization.' });
  if (!isOrgOwnerOrAdmin(org, uid)) return res.status(403).json({ error: 'Only org owners / admins can connect payroll.' });
  if (!/^[A-Za-z0-9._~-]{8,512}$/.test(code)) return res.status(400).json({ error: 'Missing Finch authorization code.' });
  try {
    const r = await fetch(`${FINCH_API}/auth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: process.env.FINCH_CLIENT_ID, client_secret: process.env.FINCH_CLIENT_SECRET, code, redirect_uri: finchRedirectUri(req) }),
    });
    const j = await r.json().catch(() => ({})) as { access_token?: string; provider_id?: string; company_id?: string; connection_id?: string; products?: string[]; message?: string; error_description?: string };
    if (!r.ok || !j.access_token) return res.status(502).json({ error: j.message || j.error_description || `Finch did not accept the authorization code (${r.status}).` });
    const products = Array.isArray(j.products) ? j.products.map(String) : FINCH_PRODUCTS;
    const now = Date.now();
    const conn: FinchConnection = { provider: 'finch', token: encryptSecret(j.access_token), providerId: j.provider_id, companyId: j.company_id, connectionId: j.connection_id, products, connectedBy: uid, connectedAt: now };
    await fsSet(FINCH_CONN(orgId), conn as unknown as Record<string, unknown>);
    // Org doc: non-secret metadata only (world-readable). A Finch connection replaces any Paychex binding as the active provider.
    const { paychexCompanyId: _pc, paychexCompanyName: _pn, ...rest } = (org.payroll || {}) as Record<string, any>;
    await fsPatch(`organizations/${orgId}`, { payroll: { ...rest, provider: 'finch', finchProvider: j.provider_id, finchProviderName: finchProviderName(j.provider_id), finchCompanyId: j.company_id, finchConnectionId: j.connection_id, finchProducts: products, connectedBy: uid, connectedAt: now }, updatedAt: now });
    return res.json({ ok: true, provider: j.provider_id, providerName: finchProviderName(j.provider_id), products });
  } catch (e: any) { return res.status(502).json({ error: e?.message || 'Could not reach Finch.' }); }
});

// ── POST /finch/disconnect { orgId } — org owner/admin drops the stored token ──
payrollConnectRouter.post('/finch/disconnect', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.body?.orgId || '');
  const { ok, org } = await orgStaff(orgId, uid);
  if (!ok || !org) return res.status(403).json({ error: 'Not allowed for this organization.' });
  if (!isOrgOwnerOrAdmin(org, uid)) return res.status(403).json({ error: 'Only org owners / admins can disconnect payroll.' });
  const conn = await finchConnection(orgId);
  if (conn && finchConfigured()) {
    // Best effort: ask Finch to revoke the token too, so the employer sees the app disappear from their payroll.
    try { await finchFetch(decryptSecret(conn.token), '/disconnect', { method: 'POST' }); } catch { /* token may already be dead */ }
  }
  await fsDelete(FINCH_CONN(orgId));
  const { provider: _p, finchProvider: _fp, finchProviderName: _fn, finchCompanyId: _fc, finchConnectionId: _fi, finchProducts: _fpr, ...rest } = (org.payroll || {}) as Record<string, any>;
  await fsPatch(`organizations/${orgId}`, { payroll: { ...rest, ...(rest.paychexCompanyId ? { provider: 'paychex' } : {}) }, updatedAt: Date.now() });
  return res.json({ ok: true });
});

interface FinchIndividual { id: string; first_name?: string | null; middle_name?: string | null; last_name?: string | null; department?: { name?: string | null } | null; is_active?: boolean | null; manager?: { id?: string } | null }

// ── POST /finch/workers { orgId } → names, departments, active flag (+ titles when the employment product is granted) ──
payrollConnectRouter.post('/finch/workers', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  if (!finchConfigured()) return res.status(503).json({ error: 'Finch is not configured on this server. Use the file export.' });
  const orgId = String(req.body?.orgId || '');
  const { ok, org } = await orgStaff(orgId, uid);
  if (!ok || !org) return res.status(403).json({ error: 'Not allowed for this organization.' });
  const conn = await finchConnection(orgId);
  if (!conn) return res.status(409).json({ error: 'This organization has not connected its payroll yet.' });
  let token: string;
  try { token = decryptSecret(conn.token); } catch { return res.status(409).json({ error: 'The stored payroll connection is unreadable — reconnect payroll.' }); }
  try {
    const individuals: FinchIndividual[] = [];
    const limit = 100;
    for (let offset = 0, page = 0; page < 100; page++) {
      const j = await finchFetch(token, `/employer/directory?limit=${limit}&offset=${offset}`);
      const rows: FinchIndividual[] = Array.isArray(j?.individuals) ? j.individuals : [];
      individuals.push(...rows);
      const total = Number(j?.paging?.count);
      offset += rows.length;
      if (rows.length === 0 || rows.length < limit || (Number.isFinite(total) && offset >= total)) break;
    }
    // Titles / employment type / start date — only when the employer granted `employment`. We pick those three
    // fields out of each response and drop the rest (the same payload carries income, which is never read).
    const titles = new Map<string, { title?: string; employmentType?: string; hireDate?: string }>();
    if ((conn.products || []).includes('employment') && individuals.length) {
      for (let i = 0; i < individuals.length; i += 100) {
        const chunk = individuals.slice(i, i + 100).map(p => ({ individual_id: p.id }));
        const j = await finchFetch(token, '/employer/employment', { method: 'POST', body: { requests: chunk } }).catch(() => null);
        for (const r of (Array.isArray(j?.responses) ? j.responses : [])) {
          if (r?.code !== 200 || !r?.body) continue;
          const t = r.body.employment || {};
          titles.set(String(r.individual_id), {
            title: r.body.title || undefined,
            employmentType: [t.type, t.subtype].filter(Boolean).join(' / ').replace(/_/g, '-') || undefined,
            hireDate: r.body.start_date || undefined,
          });
        }
      }
    }
    const workers = individuals.map(p => {
      const extra = titles.get(String(p.id)) || {};
      return {
        externalId: p.id,
        firstName: String(p.first_name || '').trim(), lastName: String(p.last_name || '').trim(),
        title: extra.title, department: p.department?.name || undefined,
        email: undefined, phone: undefined,                      // contact details need Finch's `individual` product (SSN/DOB bundle) — not requested
        status: p.is_active === false ? 'INACTIVE' : 'ACTIVE',
        hireDate: extra.hireDate, employmentType: extra.employmentType,
      };
    }).filter(w => w.firstName || w.lastName);
    return res.json({ workers, provider: conn.providerId, providerName: finchProviderName(conn.providerId) });
  } catch (e: any) { return res.status(e instanceof FinchError ? e.status : 502).json({ error: e?.message || 'Could not reach Finch.' }); }
});
