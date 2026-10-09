// Release a Firestore ruleset to plajah-prod through the Rules REST API, with a safety check.
//
//   node scripts/releaseRuleset.mjs <rules-file> --base <ruleset-id> [--apply]
//
// Why this exists: when a ruleset is over the release size limit the Firebase CLI hides the real error (see
// scripts/probeRuleset.mjs). This tool is the explicit, auditable path. It REFUSES to run if the live ruleset is
// not the one you based your edit on (--base), so it can never silently overwrite someone else's deploy.
// Without --apply it only reports what it would do. Run scripts/probeRuleset.mjs on the file first.
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const REL = `projects/${PROJECT}/releases/cloud.firestore/plajah-prod`;
const API = 'https://firebaserules.googleapis.com/v1/';
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && a !== args[args.indexOf('--base') + 1]);
const baseId = args[args.indexOf('--base') + 1];
const apply = args.includes('--apply');
if (!file || !baseId || baseId.startsWith('--')) { console.error('usage: node scripts/releaseRuleset.mjs <rules-file> --base <ruleset-id> [--apply]'); process.exit(2); }
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired. Run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
const H = { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
const api = async (p, init = {}) => { const r = await fetch(API + p, { headers: H, ...init }); return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }; };

const cur = await api(REL);
const liveId = String(cur.j.rulesetName || '').split('/').pop();
console.log('live ruleset:', liveId, cur.j.updateTime);
if (liveId !== baseId) { console.error(`ABORT: live ruleset is ${liveId}, not the base ${baseId}. Someone released since you started; re-base your edit.`); process.exit(4); }
const src = fs.readFileSync(file, 'utf8');
console.log('candidate:', file, src.length, 'bytes');
if (!apply) { console.log('dry run: would create a ruleset from the file and release it. Re-run with --apply.'); process.exit(0); }

const mk = await api(`projects/${PROJECT}/rulesets`, { method: 'POST', body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: src }] } }) });
if (!mk.ok) { console.error('ruleset create failed:', mk.status, JSON.stringify(mk.j).slice(0, 300)); process.exit(1); }
const rel = await api(REL, { method: 'PATCH', body: JSON.stringify({ release: { name: REL, rulesetName: mk.j.name }, updateMask: 'rulesetName' }) });
if (!rel.ok) {
  console.error('release failed:', rel.status, JSON.stringify(rel.j).slice(0, 300), '(400 = over the size limit; see scripts/probeRuleset.mjs). Cleaning up the unreleased ruleset.');
  await fetch(API + mk.j.name, { method: 'DELETE', headers: H });
  process.exit(1);
}
const now = await api(REL);
console.log('RELEASED. live ruleset is now:', String(now.j.rulesetName).split('/').pop(), now.j.updateTime, '(previous:', liveId + ', still available for rollback)');
