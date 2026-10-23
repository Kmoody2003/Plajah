// Can this Firestore ruleset be RELEASED? Probes without touching the live database.
//
//   node scripts/probeRuleset.mjs <rules-file>
//
// `firebase deploy --dry-run` and the Rules `:test` API only check that rules COMPILE. Release has a stricter,
// undocumented size limit on rule structure (about 144 KB of rule code today, far below the documented 256 KiB;
// comments and whitespace do not count). When a ruleset is over it, `firebase deploy` reports a misleading
// "409 Requested entity already exists" (the real error is a 400 INVALID_ARGUMENT on the release update).
//
// This creates the ruleset, releases it under a throwaway database id (cloud.firestore/zzprobe-N), then deletes
// both. 200 = releasable, 400 = over the limit (the message carries the compiled byte count). Auth: an access
// token in RULES_ACCESS_TOKEN (CI: `gcloud auth print-access-token`), else a fresh firebase-tools login
// (`npx firebase-tools projects:list`).
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const API = 'https://firebaserules.googleapis.com/v1/';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/probeRuleset.mjs <rules-file>'); process.exit(2); }
const tok = process.env.RULES_ACCESS_TOKEN
  ? { access_token: process.env.RULES_ACCESS_TOKEN, expires_at: Date.now() + 3600000 }
  : JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired. Run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
const H = { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };

const src = fs.readFileSync(file, 'utf8');
// The Rules API 503s intermittently on large rulesets; back off and retry before calling it a failure.
let mk, mj;
for (let attempt = 1; ; attempt++) {
  mk = await fetch(API + `projects/${PROJECT}/rulesets`, { method: 'POST', headers: H, body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: src }] } }) });
  mj = await mk.json();
  if (mk.status !== 503 || attempt === 6) break;
  console.log(`rulesets 503, retry ${attempt}/5`);
  await new Promise((res) => setTimeout(res, 5000 * attempt));
}
if (!mk.ok) { console.log('ruleset does not even compile:', mk.status, JSON.stringify(mj).slice(0, 400)); process.exit(1); }
const name = `projects/${PROJECT}/releases/cloud.firestore/zzprobe-${Date.now() % 1000000}`;
let r;
for (let attempt = 1; ; attempt++) {
  r = await fetch(API + `projects/${PROJECT}/releases`, { method: 'POST', headers: H, body: JSON.stringify({ name, rulesetName: mj.name }) });
  if (r.status !== 503 || attempt === 6) break;
  console.log(`releases 503, retry ${attempt}/5`);
  await new Promise((res) => setTimeout(res, 5000 * attempt));
}
const why = r.ok ? '' : ((await r.json().catch(() => ({})))?.error?.message || '');
console.log(file, src.length, 'bytes ->', r.ok ? 'RELEASABLE' : `NOT releasable (HTTP ${r.status}) ${why}`);
if (r.ok) await fetch(API + name, { method: 'DELETE', headers: H });
await fetch(API + mj.name, { method: 'DELETE', headers: H });
process.exit(r.ok ? 0 : 1);
