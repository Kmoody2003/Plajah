// Evaluates firestore.ops.rules (the plajah-ops back office) with the Firebase Rules REST `:test` API.
// Read-only: sends the rules text and test cases to Google for evaluation and DEPLOYS NOTHING.
// Runs against the compacted deploy artifact so what's tested is what ships:
//   node scripts/minifyRules.mjs firestore.ops.rules <tmp>/ops.min && node scripts/testOpsRules.mjs <tmp>/ops.min
// Auth: RULES_ACCESS_TOKEN (`gcloud auth print-access-token`), else a fresh firebase-tools login.
//
// Covers: access resolves through the MIRRORED organizations / businessPages / admins docs (the only
// prod docs these rules can see), and the mirrors themselves are closed to every client.
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/testOpsRules.mjs <compacted ops rules>'); process.exit(2); }
const token = process.env.RULES_ACCESS_TOKEN || (() => {
  const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
  if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — set RULES_ACCESS_TOKEN or run `npx firebase-tools projects:list`.'); process.exit(2); }
  return tok.access_token;
})();
const src = fs.readFileSync(file, 'utf8');

const DB = '/databases/(default)/documents';
const ADM = 'adm', OWNER = 'owner', PASTOR = 'pastor', BOOKS = 'books', MEMBER = 'member', OTHER = 'other', SHOP = 'shop';
const ORG = { creatorId: OWNER, admins: [OWNER], pastorUids: [PASTOR], accountingViewUids: [BOOKS], staffUids: [], financeUids: [] };
const PAGE = { ownerId: SHOP };
const mocks = [
  ...[ADM, OWNER, PASTOR, BOOKS, MEMBER, OTHER, SHOP].map(u => ({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: u === ADM } })),
  { function: 'exists', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: true } },
  { function: 'get', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: { data: ORG } } },
  { function: 'get', args: [{ exactValue: `${DB}/businessPages/b1` }], result: { value: { data: PAGE } } },
];

const cases = [];
const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name, expect, who, method, path, data, existing });

const P = `${DB}/chmsPeople/p1`;
const person = { orgId: 'o1', firstName: 'Ann', linkedUid: MEMBER };
t('org owner reads a ChMS person', 'ALLOW', OWNER, 'get', P, { existing: person });
t('pastor reads a ChMS person', 'ALLOW', PASTOR, 'get', P, { existing: person });
t('linked member reads their own record', 'ALLOW', MEMBER, 'get', P, { existing: person });
t('stranger cannot read a ChMS person', 'DENY', OTHER, 'get', P, { existing: person });
t('anonymous cannot read a ChMS person', 'DENY', null, 'get', P, { existing: person });
t('stranger cannot create a ChMS person', 'DENY', OTHER, 'create', P, { data: person });
t('org owner creates a ChMS person', 'ALLOW', OWNER, 'create', P, { data: person });

const J = `${DB}/acctJournals/j1`;
const journal = { orgId: 'o1', status: 'POSTED' };
t('accounting viewer reads a journal', 'ALLOW', BOOKS, 'get', J, { existing: journal });
t('accounting viewer cannot post a journal', 'DENY', BOOKS, 'create', J, { data: journal });
t('stranger cannot read a journal', 'DENY', OTHER, 'get', J, { existing: journal });

const G = `${DB}/chmsContributions/g1`;
const gift = { orgId: 'o1', amount: 50, linkedUid: MEMBER, enteredBy: OWNER };
t('giver reads their own gift', 'ALLOW', MEMBER, 'get', G, { existing: gift });
t('stranger cannot read a gift', 'DENY', OTHER, 'get', G, { existing: gift });

const V = `${DB}/orgOnboardingVault/m1`;
t('member reads their own onboarding vault', 'ALLOW', MEMBER, 'get', V, { existing: { orgId: 'o1', userId: MEMBER } });
t('stranger cannot read an onboarding vault', 'DENY', OTHER, 'get', V, { existing: { orgId: 'o1', userId: MEMBER } });

const K = `${DB}/crmContacts/c1`;
t('business page owner reads a CRM contact', 'ALLOW', SHOP, 'get', K, { existing: { businessId: 'b1' } });
t('stranger cannot read a CRM contact', 'DENY', OTHER, 'get', K, { existing: { businessId: 'b1' } });

// The mirrors are server-written only.
t('mirror: org owner cannot read the ops copy of their org', 'DENY', OWNER, 'get', `${DB}/organizations/o1`, { existing: ORG });
t('mirror: org owner cannot rewrite the ops copy (would self-grant)', 'DENY', OWNER, 'update', `${DB}/organizations/o1`, { existing: ORG, data: { ...ORG, admins: [OWNER, OTHER] } });
t('mirror: no one can mint a platform admin', 'DENY', OTHER, 'create', `${DB}/admins/${OTHER}`, { data: {} });
t('mirror: business owner cannot rewrite the ops copy of a page', 'DENY', SHOP, 'update', `${DB}/businessPages/b1`, { existing: PAGE, data: { ownerId: OTHER } });

const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) req.auth = { uid: c.who, token: { firebase: { sign_in_provider: 'google.com' } } };
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: mocks };
      if (c.existing) tc.resource = { data: c.existing };
      return tc;
    }),
  },
};
const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok) { console.error(JSON.stringify(out, null, 2).slice(0, 3000)); process.exit(1); }
if (out.issues?.length) console.log('ISSUES', JSON.stringify(out.issues, null, 1).slice(0, 3000));
const results = out.testResults || [];
let bad = 0;
results.forEach((r, i) => {
  if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].name, '→', r.state, (r.errorPosition ? 'line ' + r.errorPosition.line : ''), (r.debugMessages || []).slice(-3).join(' | ')); }
});
console.log(`${results.length - bad}/${results.length} ops rules checks passed. No rules deployed.`);
process.exit(bad ? 1 : 0);
