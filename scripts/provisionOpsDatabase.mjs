// Creates the plajah-ops Firestore database (the org back office — services/opsCollections.ts), releases
// firestore.ops.rules to it, creates its composite indexes, and wires the Eventarc triggers that keep the
// organizations / productions / businessPages / admins mirrors current (services/opsMirror.ts).
// DRY RUN BY DEFAULT — prints what it would do. Pass --apply to do it.
//
//   node scripts/provisionOpsDatabase.mjs                      (dry run, everything)
//   node scripts/provisionOpsDatabase.mjs --apply --only=db     (database + rules + indexes)
//   node scripts/provisionOpsDatabase.mjs --apply --only=triggers
//
// Run the triggers step only once plajah-api serves POST /api/ops-mirror/event (i.e. after the deploy).
// Auth: RULES_ACCESS_TOKEN, else `gcloud auth print-access-token`. The triggers step shells out to gcloud.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const PROJECT = 'gen-lang-client-0665118474';
const DB = 'plajah-ops';
const LOCATION = 'us-west1';            // same region as plajah-prod; Eventarc Firestore triggers must match it
const RUN_SERVICE = 'plajah-api';
const TRIGGER_SA = '538331111809-compute@developer.gserviceaccount.com';   // plajah-api's runtime SA
const MIRRORED = ['organizations', 'productions', 'businessPages', 'admins'];   // = OPS_MIRRORED_COLLECTIONS

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const apply = !!args.apply;
const only = args.only ? String(args.only) : 'all';
const want = (s) => only === 'all' || only === s;
// shell on Windows: gcloud is a .cmd there. Args here are fixed strings, never user input.
const gcloud = (...a) => execFileSync('gcloud', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }).trim();
const token = process.env.RULES_ACCESS_TOKEN || gcloud('auth', 'print-access-token');
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
};
const step = (s) => console.log((apply ? '→ ' : '[dry-run] would ') + s);

if (want('db')) {
  // 1. database — point-in-time recovery + delete protection on, like plajah-phi
  const existing = await call('GET', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}`);
  if (existing.ok) console.log(`database ${DB} already exists (${existing.j.locationId}) — leaving it as is`);
  else {
    step(`create Firestore database "${DB}" in ${LOCATION} with point-in-time recovery and delete protection`);
    if (apply) {
      const r = await call('POST', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases?databaseId=${DB}`, {
        type: 'FIRESTORE_NATIVE', locationId: LOCATION, concurrencyMode: 'OPTIMISTIC',
        pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED', deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
      });
      if (!r.ok) { console.error('create failed', JSON.stringify(r.j).slice(0, 800)); process.exit(1); }
      for (let i = 0; i < 30; i++) {
        await new Promise(res => setTimeout(res, 5000));
        if ((await call('GET', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}`)).ok) break;
      }
      console.log('database ready');
    }
  }

  // 2. rules — the compacted build, exactly what CI deploys
  step('build firestore.ops.rules.min, create a ruleset, release it to cloud.firestore/' + DB);
  if (apply) {
    execFileSync(process.execPath, ['scripts/minifyRules.mjs', 'firestore.ops.rules', 'firestore.ops.rules.min'], { stdio: 'inherit' });
    const rules = fs.readFileSync('firestore.ops.rules.min', 'utf8');
    const rs = await call('POST', `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, { source: { files: [{ name: 'firestore.rules', content: rules }] } });
    if (!rs.ok) { console.error('ruleset rejected', JSON.stringify(rs.j).slice(0, 1200)); process.exit(1); }
    const name = `projects/${PROJECT}/releases/cloud.firestore/${DB}`;
    let rel = await call('PATCH', `https://firebaserules.googleapis.com/v1/${name}`, { release: { name, rulesetName: rs.j.name } });
    if (!rel.ok) rel = await call('POST', `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, { name, rulesetName: rs.j.name });
    if (!rel.ok) { console.error('release failed', JSON.stringify(rel.j).slice(0, 800)); process.exit(1); }
    console.log('rules released:', rs.j.name);
  }

  // 3. composite indexes
  const { indexes } = JSON.parse(fs.readFileSync('firestore.ops.indexes.json', 'utf8'));
  for (const ix of indexes) {
    step(`create index ${ix.collectionGroup}(${ix.fields.map(f => `${f.fieldPath} ${f.order || f.arrayConfig}`).join(', ')})`);
    if (apply) {
      const r = await call('POST', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/collectionGroups/${ix.collectionGroup}/indexes`, { queryScope: ix.queryScope, fields: ix.fields });
      console.log(r.ok || r.status === 409 ? '  ok' : '  ' + JSON.stringify(r.j).slice(0, 300));
    }
  }
}

if (want('triggers')) {
  // 4. Eventarc: plajah-prod writes to a mirrored collection → POST /api/ops-mirror/event on plajah-api.
  //    The endpoint re-reads the doc itself (ce-subject header), so the event payload format doesn't matter.
  step('enable eventarc.googleapis.com and grant the trigger SA roles/eventarc.eventReceiver');
  if (apply) {
    gcloud('services', 'enable', 'eventarc.googleapis.com', '--project', PROJECT);
    gcloud('projects', 'add-iam-policy-binding', PROJECT, '--member', `serviceAccount:${TRIGGER_SA}`, '--role', 'roles/eventarc.eventReceiver', '--condition=None', '--quiet');
  }
  const existing = apply ? gcloud('eventarc', 'triggers', 'list', '--location', LOCATION, '--project', PROJECT, '--format=value(name)') : '';
  for (const col of MIRRORED) {
    const name = `ops-mirror-${col.toLowerCase()}`;
    if (existing.split('\n').some(n => n.endsWith('/' + name))) { console.log(`trigger ${name} exists`); continue; }
    step(`create Eventarc trigger ${name}: plajah-prod ${col}/{doc} written → ${RUN_SERVICE} /api/ops-mirror/event`);
    if (apply) {
      gcloud('eventarc', 'triggers', 'create', name, '--project', PROJECT, '--location', LOCATION,
        '--event-filters=type=google.cloud.firestore.document.v1.written',
        '--event-filters=database=plajah-prod',
        `--event-filters-path-pattern=document=${col}/{doc}`,
        '--event-data-content-type=application/protobuf',
        `--destination-run-service=${RUN_SERVICE}`, `--destination-run-region=${LOCATION}`,
        '--destination-run-path=/api/ops-mirror/event',
        `--service-account=${TRIGGER_SA}`);
      console.log('  created');
    }
  }
}
