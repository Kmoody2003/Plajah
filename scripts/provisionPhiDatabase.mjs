// Creates the dedicated PHI Firestore database and publishes firestore.phi.rules to it.
// DRY RUN BY DEFAULT — prints what it would do. Pass --apply to actually do it.
//
//   node scripts/provisionPhiDatabase.mjs --location=nam5            (dry run)
//   node scripts/provisionPhiDatabase.mjs --location=nam5 --apply
//
// BEFORE running with --apply, in the Google Cloud console you must have accepted Google's BAA
// (Cloud Console → Compliance → HIPAA BAA) for the organisation that owns this project. That is a legal
// step only an authorised person at your company can take; this script cannot and does not do it.
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const DB = 'plajah-phi';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const apply = !!args.apply;
const location = args.location || 'nam5';
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
const H = { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
};
const step = (s) => console.log((apply ? '→ ' : '[dry-run] would ') + s);

const rules = fs.readFileSync(new URL('../firestore.phi.rules', import.meta.url), 'utf8');

// 1. database (point-in-time recovery + delete protection on)
const existing = await call('GET', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}`);
if (existing.ok) console.log(`database ${DB} already exists (${existing.j.locationId}) — leaving it as is`);
else {
  step(`create Firestore database "${DB}" in ${location} with point-in-time recovery and delete protection`);
  if (apply) {
    const r = await call('POST', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases?databaseId=${DB}`, {
      type: 'FIRESTORE_NATIVE', locationId: location, pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED', deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
    });
    if (!r.ok) { console.error('create failed', JSON.stringify(r.j).slice(0, 800)); process.exit(1); }
    console.log('creating (this takes a minute)…'); await new Promise(res => setTimeout(res, 60000));
  }
}

// 2. composite index for listing appointments by kind + day
step('create composite index records(kind ASC, day ASC)');
if (apply) {
  const r = await call('POST', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/collectionGroups/records/indexes`, {
    queryScope: 'COLLECTION', fields: [{ fieldPath: 'kind', order: 'ASCENDING' }, { fieldPath: 'day', order: 'ASCENDING' }],
  });
  console.log(r.ok || r.status === 409 ? 'index ok' : 'index: ' + JSON.stringify(r.j).slice(0, 400));
}

// 3. rules: validate → create ruleset → release to this database only
step('validate firestore.phi.rules, create a ruleset, and release it to cloud.firestore/' + DB);
if (apply) {
  const rs = await call('POST', `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, { source: { files: [{ name: 'firestore.rules', content: rules }] } });
  if (!rs.ok) { console.error('ruleset rejected', JSON.stringify(rs.j).slice(0, 1200)); process.exit(1); }
  const name = `projects/${PROJECT}/releases/cloud.firestore/${DB}`;
  const body = { release: { name, rulesetName: rs.j.name } };
  let rel = await call('PATCH', `https://firebaserules.googleapis.com/v1/${name}`, body);
  if (!rel.ok) rel = await call('POST', `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, body.release);
  if (!rel.ok) { console.error('release failed', JSON.stringify(rel.j).slice(0, 800)); process.exit(1); }
  console.log('rules released:', rs.j.name);
}

console.log(`
Still to do by hand (the script can't):
  • Accept the Google Cloud BAA for this organisation.
  • Cloud Console → IAM & Admin → Audit Logs → Cloud Firestore: enable Data Read, Data Write and Admin Read.
  • Upgrade Firebase Auth to Identity Platform (BAA-covered) and require MFA for clinic staff.
  • Optional: customer-managed encryption key (CMEK) for the database.
`);
