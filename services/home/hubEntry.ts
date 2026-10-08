/**
 * Embedded hub entry — the single file that runs inside the Android app's Node runtime
 * (nodejs-mobile 18, PlajahHubService in the `:hub` process) and can also run on a PC:
 *   node android/app/src/main/assets/plajah-hub/main.js
 * Bundled by scripts/buildHubBundle.mjs (esbuild -> one CJS file, target node18).
 *
 * It owns the HTTP listener on PLAJAH_HUB_HOST:PLAJAH_HUB_PORT (default 127.0.0.1:8786) and serves:
 *   GET  /health     liveness + versions + memory (PlajahHub.status() probes this)
 *   GET  /selftest   runtime capability check for Matter (aes-128-ccm, P-256, dgram multicast, fs)
 *   POST /__shutdown graceful stop (PlajahHubService.ACTION_STOP calls it, then ends the process)
 * Everything else goes to the real hub, if one was bundled.
 *
 * REAL HUB CONTRACT — the virtual module `plajah-hub-real` resolves to services/home/hubServer.ts when
 * that file exists (else to a stub). It must export:
 *   export async function startHub(ctx: HubContext): Promise<HubInstance>
 * where HubInstance = { handler: (req, res, next) => void; stop?: () => Promise<void> }.
 * An Express app is a valid `handler`. ctx.dataDir === process.env.PLAJAH_HOME_DIR (hubStorage.ts root).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Resolved by buildHubBundle.mjs (alias) — real hub or stub.
import * as real from 'plajah-hub-real';

export interface HubContext {
  host: string;
  port: number;
  dataDir: string;
  platform: string;
  log: (...a: unknown[]) => void;
}
export interface HubInstance {
  handler: (req: http.IncomingMessage, res: http.ServerResponse, next: (err?: unknown) => void) => void;
  stop?: () => Promise<void>;
}

const HOST = process.env.PLAJAH_HUB_HOST || '127.0.0.1';
const PORT = Number(process.env.PLAJAH_HUB_PORT || 8786);
const DATA = process.env.PLAJAH_HOME_DIR || process.env.PLAJAH_HUB_DATA || path.join(os.homedir(), '.plajah-home');
const PLATFORM = process.env.PLAJAH_HUB_PLATFORM || process.platform;
const startedAt = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), '[hub]', ...a);

let hub: HubInstance | null = null;
let hubError: string | null = null;

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function mem() {
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;
  return { rssMB: mb(m.rss), heapUsedMB: mb(m.heapUsed), heapTotalMB: mb(m.heapTotal), externalMB: mb(m.external) };
}

function health() {
  return {
    ok: true,
    service: 'plajah-hub',
    platform: PLATFORM,
    node: process.version,
    arch: process.arch,
    pid: process.pid,
    uptimeS: Math.round((Date.now() - startedAt) / 1000),
    dataDir: DATA,
    hub: hub ? 'loaded' : hubError ? 'error' : 'none',
    hubError,
    memory: mem(),
  };
}

async function selftest() {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => unknown | Promise<unknown>) => {
    try { out[name] = { ok: true, value: await fn() }; } catch (e) { out[name] = { ok: false, error: String((e as Error)?.message || e) }; }
  };
  await step('versions', () => ({ node: process.version, openssl: process.versions.openssl, v8: process.versions.v8, uv: process.versions.uv }));
  // nodejs-mobile ships without ICU: no Intl, no RegExp \p{..} (buildHubBundle rewrites those).
  await step('intl', () => ({ icu: process.versions.icu ?? null, hasIntl: typeof Intl !== 'undefined',
    unicodePropertyRegex: (() => { try { return new RegExp('\\p{L}', 'u').test('é'); } catch { return false; } })() }));
  await step('ciphersHasAes128Ccm', () => crypto.getCiphers().includes('aes-128-ccm'));
  await step('aes128ccmRoundTrip', () => {
    // Matter message encryption: AES-128-CCM, 13-byte nonce, 16-byte tag.
    const key = crypto.randomBytes(16), nonce = crypto.randomBytes(13), aad = Buffer.from('hdr');
    const c = crypto.createCipheriv('aes-128-ccm', key, nonce, { authTagLength: 16 });
    c.setAAD(aad, { plaintextLength: 5 });
    const ct = Buffer.concat([c.update(Buffer.from('hello')), c.final()]);
    const tag = c.getAuthTag();
    const d = crypto.createDecipheriv('aes-128-ccm', key, nonce, { authTagLength: 16 });
    d.setAuthTag(tag); d.setAAD(aad, { plaintextLength: ct.length });
    return Buffer.concat([d.update(ct), d.final()]).toString() === 'hello';
  });
  await step('p256EcdhEcdsa', () => {
    const a = crypto.createECDH('prime256v1'); a.generateKeys();
    const b = crypto.createECDH('prime256v1'); b.generateKeys();
    const same = a.computeSecret(b.getPublicKey()).equals(b.computeSecret(a.getPublicKey()));
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const sig = crypto.sign('sha256', Buffer.from('m'), { key: privateKey, dsaEncoding: 'ieee-p1363' });
    return same && crypto.verify('sha256', Buffer.from('m'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
  });
  await step('pbkdf2AndHkdf', () => {
    const k = crypto.pbkdf2Sync('20202021', crypto.randomBytes(16), 1000, 80, 'sha256');
    const h = crypto.hkdfSync('sha256', k, Buffer.alloc(0), Buffer.from('x'), 32);
    return k.length === 80 && (h as ArrayBuffer).byteLength === 32;
  });
  await step('webcryptoSubtle', () => typeof (crypto as any).webcrypto?.subtle?.importKey === 'function');
  const mcast = (type: 'udp4' | 'udp6', group: string) => new Promise((resolve, reject) => {
    const s = dgram.createSocket({ type, reuseAddr: true });
    const t = setTimeout(() => { try { s.close(); } catch { /* */ } reject(new Error('bind timeout')); }, 3000);
    s.once('error', (e) => { clearTimeout(t); try { s.close(); } catch { /* */ } reject(e); });
    s.bind(5353, () => {
      try {
        s.addMembership(group);
        s.setMulticastTTL?.(255);
        const addr = s.address();
        clearTimeout(t); s.close(); resolve({ bound: addr, group });
      } catch (e) { clearTimeout(t); try { s.close(); } catch { /* */ } reject(e); }
    });
  });
  await step('dgramMulticast4_5353', () => mcast('udp4', '224.0.0.251'));
  await step('dgramMulticast6_5353', () => mcast('udp6', 'ff02::fb'));
  await step('fsWriteRead', () => {
    fs.mkdirSync(DATA, { recursive: true });
    const p = path.join(DATA, '.selftest');
    fs.writeFileSync(p, String(Date.now()));
    const v = fs.readFileSync(p, 'utf8'); fs.unlinkSync(p);
    return { dir: DATA, ok: v.length > 0 };
  });
  await step('networkInterfaces', () => Object.fromEntries(Object.entries(os.networkInterfaces()).map(([k, v]) =>
    [k, (v || []).map((a) => `${a.family === 'IPv6' || (a.family as unknown) === 6 ? 'v6' : 'v4'} ${a.address}${a.scopeid ? '%' + a.scopeid : ''}`)])));
  await step('memory', () => mem());
  await step('os', () => ({ totalMemMB: Math.round(os.totalmem() / 1048576), freeMemMB: Math.round(os.freemem() / 1048576), cpus: os.cpus().length, release: os.release() }));
  return out;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = (req.url || '/').split('?')[0];
  try {
    if (url === '/health') return json(res, 200, health());
    if (url === '/selftest') return json(res, 200, await selftest());
    if (url === '/__shutdown' && req.method === 'POST') {
      // Android: stop the hub cleanly, answer, and let PlajahHubService end the :hub process —
      // process.exit() there kills the whole Android process, which ActivityManager reads as a crash.
      if (PLATFORM === 'android') {
        try { await hub?.stop?.(); } catch (e) { log('hub stop error', e); }
        hub = null;
        return json(res, 200, { ok: true });
      }
      json(res, 200, { ok: true });
      setTimeout(() => void shutdown(0), 50);
      return;
    }
    if (hub) {
      return hub.handler(req, res, (err?: unknown) => {
        if (res.headersSent) return;
        json(res, err ? 500 : 404, err ? { error: String((err as Error)?.message || err) } : { error: 'not found', path: url });
      });
    }
    json(res, 404, { error: 'not found', path: url, hub: hub ? 'loaded' : 'none', hubError });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: String((e as Error)?.message || e) });
  }
});

async function shutdown(code: number) {
  log('shutting down');
  try { await hub?.stop?.(); } catch (e) { log('hub stop error', e); }
  server.close();
  setTimeout(() => process.exit(code), 200);
}

process.on('uncaughtException', (e) => log('uncaughtException', e?.stack || e));
process.on('unhandledRejection', (e) => log('unhandledRejection', (e as Error)?.stack || e));
process.on('SIGTERM', () => void shutdown(0));

server.listen(PORT, HOST, async () => {
  log(`listening on http://${HOST}:${PORT} (node ${process.version} ${process.arch}, data ${DATA})`);
  const startHub = (real as { startHub?: (ctx: HubContext) => Promise<HubInstance> }).startHub;
  if (typeof startHub !== 'function') { log('no real hub bundled (stub)'); return; }
  try {
    hub = await startHub({ host: HOST, port: PORT, dataDir: DATA, platform: PLATFORM, log });
    log('real hub started');
  } catch (e) {
    hubError = String((e as Error)?.stack || e);
    log('real hub failed to start', hubError);
  }
});
