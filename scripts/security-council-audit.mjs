#!/usr/bin/env node
/**
 * Security & IT Council — CI audit summariser (used by .github/workflows/security-audit.yml).
 *
 *   node scripts/security-council-audit.mjs --npm-audit audit.json [--dist dist] [--out council-audit.json]
 *
 * Produces a compact JSON summary (kept under the server's 10kb JSON body limit) with:
 *   npmAudit   — counts + high/critical advisories from `npm audit --json --omit=dev`
 *   secretScan — rule + file + line for likely committed secrets (NEVER the value)
 *   staticScan — Firestore onSnapshot/getDocs call sites with no limit() nearby (heuristic)
 *   bundle     — total JS/CSS size of dist/assets and the largest chunks (when --dist exists)
 * If SECURITY_COUNCIL_INGEST_KEY and SECURITY_COUNCIL_INGEST_URL are set, POSTs it to the server.
 * Read-only: changes nothing in the repo.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const MAX_BYTES = 9500;

// ── npm audit ──
function summariseNpmAudit(path) {
  if (!path || !existsSync(path)) return { counts: null, advisories: [], error: 'no npm audit output' };
  let j;
  try { j = JSON.parse(readFileSync(path, 'utf8')); } catch { return { counts: null, advisories: [], error: 'unparseable npm audit output' }; }
  const m = j.metadata?.vulnerabilities || {};
  const counts = { critical: m.critical || 0, high: m.high || 0, moderate: m.moderate || 0, low: m.low || 0 };
  const advisories = [];
  for (const [name, v] of Object.entries(j.vulnerabilities || {})) {
    if (v.severity !== 'high' && v.severity !== 'critical') continue;
    const via = (v.via || []).find(x => typeof x === 'object') || {};
    advisories.push({
      name, severity: v.severity, isDirect: !!v.isDirect, range: String(v.range || '').slice(0, 60),
      title: String(via.title || '').slice(0, 120), url: String(via.url || '').slice(0, 120), source: String(via.source ?? ''),
      fixAvailable: v.fixAvailable && typeof v.fixAvailable === 'object'
        ? { name: v.fixAvailable.name, version: v.fixAvailable.version, isSemVerMajor: !!v.fixAvailable.isSemVerMajor }
        : !!v.fixAvailable,
    });
  }
  advisories.sort((a, b) => (a.severity === b.severity ? Number(b.isDirect) - Number(a.isDirect) : a.severity === 'critical' ? -1 : 1));
  return { counts, advisories };
}

// ── tracked files ──
function trackedFiles() {
  try { return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); }
  catch { return []; }
}
const SKIP = /(^|\/)(node_modules|dist|build|android|ios|vendor|\.git)\/|package-lock\.json$|\.(png|jpe?g|gif|webp|avif|mp[34]|wav|ogg|woff2?|ttf|otf|ico|pdf|zip|gz|onnx|bin|glb|gltf|wasm|lock)$/i;

// ── secret scan (location + rule only) ──
const SECRET_RULES = [
  ['private-key-block', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['stripe-live-key', /\b(sk|rk)_live_[0-9a-zA-Z]{20,}/],
  ['anthropic-key', /\bsk-ant-(api|admin)[0-9]{2}-[A-Za-z0-9_-]{20,}/],
  ['github-token', /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['sendgrid-key', /\bSG\.[\w-]{22}\.[\w-]{43}\b/],
  // Firebase *web* config keys are public by design; anything else using AIza (Gemini, Maps server keys) is not.
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['service-account-json', /"private_key_id"\s*:\s*"[0-9a-f]{20,}"/],
];
function secretScan(files) {
  const findings = [];
  for (const f of files) {
    if (SKIP.test(f) || findings.length >= 25) continue;
    let text;
    try { if (statSync(f).size > 1_500_000) continue; text = readFileSync(f, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length && findings.length < 25; i++) {
      const line = lines[i];
      if (line.length > 5000) continue;
      for (const [rule, re] of SECRET_RULES) {
        if (!re.test(line)) continue;
        if (/example|placeholder|dummy|your[_-]?key|xxxx/i.test(line)) continue;
        findings.push({ rule, file: f, line: i + 1 });
        break;
      }
    }
  }
  return { findings };
}

// ── static scan: unbounded Firestore reads ──
function staticScan(files) {
  const unboundedListeners = [], unboundedQueries = [];
  for (const f of files) {
    if (SKIP.test(f) || !/\.(tsx?|jsx?)$/.test(f) || /(^|\/)(tests?|__tests__|scripts)\//.test(f) || /\.test\./.test(f)) continue;
    let lines;
    try { lines = readFileSync(f, 'utf8').split('\n'); } catch { continue; }
    for (let i = 0; i < lines.length; i++) {
      const isListener = /\bonSnapshot\(/.test(lines[i]);
      const isQuery = /\bgetDocs\(/.test(lines[i]);
      if (!isListener && !isQuery) continue;
      const windowText = lines.slice(Math.max(0, i - 8), i + 2).join('\n');
      if (/\blimit(ToLast)?\(/.test(windowText)) continue;
      if (/\bdoc\(/.test(windowText) && !/\bcollection(Group)?\(|\bquery\(/.test(windowText)) continue; // single-doc listener
      if (!/\bcollection(Group)?\(|\bquery\(/.test(windowText)) continue; // can't tell — skip rather than guess
      (isListener ? unboundedListeners : unboundedQueries).push({ file: f, line: i + 1 });
    }
  }
  return { unboundedListeners, unboundedQueries, totals: { listeners: unboundedListeners.length, queries: unboundedQueries.length } };
}

// ── bundle sizes ──
function bundle(distDir) {
  const dir = distDir && join(distDir, 'assets');
  if (!dir || !existsSync(dir)) return null;
  const chunks = [];
  for (const name of readdirSync(dir)) {
    if (!['.js', '.css'].includes(extname(name))) continue;
    chunks.push({ file: name, kb: Math.round(statSync(join(dir, name)).size / 1024) });
  }
  chunks.sort((a, b) => b.kb - a.kb);
  return { totalKb: chunks.reduce((n, c) => n + c.kb, 0), largest: chunks.slice(0, 10) };
}

// ── assemble + trim to fit the server body limit ──
const files = trackedFiles();
const summary = {
  generatedAt: Date.now(),
  ref: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'local',
  commit: (process.env.GITHUB_SHA || '').slice(0, 40),
  event: process.env.GITHUB_EVENT_NAME || 'local',
  npmAudit: summariseNpmAudit(args['npm-audit']),
  secretScan: secretScan(files),
  staticScan: staticScan(files),
  bundle: bundle(args.dist),
};
const fullCopy = JSON.parse(JSON.stringify(summary));
const size = () => Buffer.byteLength(JSON.stringify(summary));
const trims = [
  () => { summary.staticScan.unboundedListeners = summary.staticScan.unboundedListeners.slice(0, 15); summary.staticScan.unboundedQueries = summary.staticScan.unboundedQueries.slice(0, 15); },
  () => { summary.npmAudit.advisories = summary.npmAudit.advisories.map(a => ({ ...a, url: undefined, range: undefined })); },
  () => { summary.npmAudit.advisories = summary.npmAudit.advisories.slice(0, 20); },
  () => { summary.staticScan.unboundedListeners = summary.staticScan.unboundedListeners.slice(0, 6); summary.staticScan.unboundedQueries = summary.staticScan.unboundedQueries.slice(0, 6); },
  () => { summary.npmAudit.advisories = summary.npmAudit.advisories.map(a => ({ name: a.name, severity: a.severity, fixAvailable: a.fixAvailable, source: a.source })); },
  () => { summary.secretScan.findings = summary.secretScan.findings.slice(0, 10); },
  () => { summary.npmAudit.advisories = summary.npmAudit.advisories.slice(0, 10); },
];
for (const t of trims) { if (size() <= MAX_BYTES) break; t(); }

const out = args.out || 'council-audit.json';
writeFileSync(out, JSON.stringify(summary, null, 2));
writeFileSync(out.replace(/\.json$/, '.full.json'), JSON.stringify(fullCopy, null, 2));

const c = summary.npmAudit.counts || {};
const md = [
  '## Security & IT Council audit',
  `npm (prod deps): critical ${c.critical ?? '?'}, high ${c.high ?? '?'}, moderate ${c.moderate ?? '?'}, low ${c.low ?? '?'}`,
  `Secret-scan hits: ${summary.secretScan.findings.length} (locations only — values are never printed)`,
  `Unbounded Firestore listeners/queries (heuristic): ${fullCopy.staticScan.totals.listeners} / ${fullCopy.staticScan.totals.queries}`,
  summary.bundle ? `Bundle: ${summary.bundle.totalKb} KB total; largest ${summary.bundle.largest[0]?.file} (${summary.bundle.largest[0]?.kb} KB)` : 'Bundle: not measured on this run',
  `Payload: ${size()} bytes`,
].join('\n\n');
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n', { flag: 'a' });
console.log(md);

const key = process.env.SECURITY_COUNCIL_INGEST_KEY;
const url = process.env.SECURITY_COUNCIL_INGEST_URL;
if (key && url) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-council-ingest-key': key }, body: JSON.stringify(summary) });
  console.log(`Ingest POST → HTTP ${res.status}`);
  if (!res.ok) process.exitCode = 1;
} else {
  console.log('SECURITY_COUNCIL_INGEST_KEY/URL not set — summary uploaded as an artifact only.');
}
