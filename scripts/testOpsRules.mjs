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

// Stripe payouts are server truth; clients only flip the reconciliation match.
const PO = `${DB}/chmsPayouts/po1`;
const payout = { orgId: 'o1', amount: 970, fees: 30, reconciled: false };
t('accounting writer marks a payout reconciled', 'ALLOW', OWNER, 'update', PO, { existing: payout, data: { ...payout, reconciled: true, bankTxnId: 't1' } });
t('accounting writer cannot change a payout amount', 'DENY', OWNER, 'update', PO, { existing: payout, data: { ...payout, amount: 1 } });
t('no client can create a payout', 'DENY', OWNER, 'create', PO, { data: payout });
t('accounting viewer cannot mark a payout reconciled', 'DENY', BOOKS, 'update', PO, { existing: payout, data: { ...payout, reconciled: true } });

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

// Live co-editing (services/coedit): membership on coedit/{pid}; viewers read only; owner manages people.
const CO = `${DB}/coedit/p1`;
const coProject = { ownerId: OWNER, kind: 'tela', title: 'Flyer', members: { [OWNER]: 'owner', [MEMBER]: 'editor', [BOOKS]: 'viewer' }, memberIds: [OWNER, MEMBER, BOOKS], names: {}, createdAt: 1, updatedAt: 1 };
mocks.push({ function: 'get', args: [{ exactValue: CO }], result: { value: { data: coProject } } });
t('co-edit: editor reads the project', 'ALLOW', MEMBER, 'get', CO, { existing: coProject });
t('co-edit: outsider cannot read the project', 'DENY', OTHER, 'get', CO, { existing: coProject });
t('co-edit: owner shares a doc they own', 'ALLOW', OWNER, 'create', `${DB}/coedit/tela__abc`, { data: { ...coProject, members: { [OWNER]: 'owner' }, memberIds: [OWNER] } });
t('co-edit: cannot create a project in someone else\'s name', 'DENY', OTHER, 'create', `${DB}/coedit/tela__abc`, { data: { ...coProject, members: { [OWNER]: 'owner' }, memberIds: [OWNER] } });
t('co-edit: owner invites someone', 'ALLOW', OWNER, 'update', CO, { existing: coProject, data: { ...coProject, members: { ...coProject.members, [PASTOR]: 'editor' }, memberIds: [...coProject.memberIds, PASTOR] } });
t('co-edit: editor cannot invite', 'DENY', MEMBER, 'update', CO, { existing: coProject, data: { ...coProject, members: { ...coProject.members, [OTHER]: 'editor' }, memberIds: [...coProject.memberIds, OTHER] } });
t('co-edit: editor cannot make themselves owner', 'DENY', MEMBER, 'update', CO, { existing: coProject, data: { ...coProject, members: { ...coProject.members, [MEMBER]: 'owner' } } });
t('co-edit: editor renames', 'ALLOW', MEMBER, 'update', CO, { existing: coProject, data: { ...coProject, title: 'Flyer v2', updatedAt: 2 } });
t('co-edit: viewer leaves', 'ALLOW', BOOKS, 'update', CO, { existing: coProject, data: { ...coProject, members: { [OWNER]: 'owner', [MEMBER]: 'editor' }, memberIds: [OWNER, MEMBER], updatedAt: 2 } });
t('co-edit: viewer cannot remove someone else', 'DENY', BOOKS, 'update', CO, { existing: coProject, data: { ...coProject, members: { [OWNER]: 'owner', [BOOKS]: 'viewer' }, memberIds: [OWNER, BOOKS] } });
t('co-edit: editor writes a snapshot', 'ALLOW', MEMBER, 'update', `${CO}/snap/head`, { existing: { gen: 'a' }, data: { gen: 'b', chunks: 1 } });
t('co-edit: viewer cannot write a snapshot', 'DENY', BOOKS, 'update', `${CO}/snap/head`, { existing: { gen: 'a' }, data: { gen: 'b', chunks: 1 } });
t('co-edit: viewer cannot send edits', 'DENY', BOOKS, 'create', `${CO}/ops/b1`, { data: { u: BOOKS, ops: '[]', n: 0 } });
t('co-edit: editor cannot send edits as someone else', 'DENY', MEMBER, 'create', `${CO}/ops/b1`, { data: { u: OWNER, ops: '[]', n: 0 } });
t('co-edit: viewer reads the live log', 'ALLOW', BOOKS, 'get', `${CO}/ops/b1`, { existing: { u: MEMBER, ops: '[]' } });
t('co-edit: shared version readable by members', 'ALLOW', BOOKS, 'get', `${CO}/versions/v1`, { existing: { by: MEMBER, private: false } });
t('co-edit: someone else\'s private copy is hidden', 'DENY', BOOKS, 'get', `${CO}/versions/v2`, { existing: { by: MEMBER, private: true } });
t('co-edit: viewer saves a private copy', 'ALLOW', BOOKS, 'create', `${CO}/versions/v3`, { data: { by: BOOKS, private: true, reason: 'personal' } });
t('co-edit: viewer cannot save a shared version', 'DENY', BOOKS, 'create', `${CO}/versions/v3`, { data: { by: BOOKS, private: false, reason: 'named' } });
t('co-edit: presence for yourself', 'ALLOW', MEMBER, 'create', `${CO}/presence/${MEMBER}_tab1`, { data: { uid: MEMBER, name: 'M' } });
t('co-edit: no presence for others', 'DENY', MEMBER, 'create', `${CO}/presence/${OWNER}_tab1`, { data: { uid: OWNER, name: 'O' } });
t('co-edit: drafts are private', 'DENY', OWNER, 'get', `${CO}/drafts/${MEMBER}`, { existing: { ops: '[]' } });
t('co-edit: your own draft', 'ALLOW', MEMBER, 'get', `${CO}/drafts/${MEMBER}`, { existing: { ops: '[]' } });
t('co-edit: editor contributes a take', 'ALLOW', MEMBER, 'create', `${CO}/assets/a1`, { data: { id: 'a1', owner: MEMBER, kind: 'take', status: 'local', tiers: {} } });
t('co-edit: viewer cannot contribute media', 'DENY', BOOKS, 'create', `${CO}/assets/a1`, { data: { id: 'a1', owner: BOOKS, kind: 'take' } });
t('co-edit: no contributing in someone else’s name', 'DENY', MEMBER, 'create', `${CO}/assets/a1`, { data: { id: 'a1', owner: OWNER, kind: 'take' } });
t('co-edit: contributor upgrades proxy → master', 'ALLOW', MEMBER, 'update', `${CO}/assets/a1`, { existing: { id: 'a1', owner: MEMBER, status: 'proxy' }, data: { id: 'a1', owner: MEMBER, status: 'master' } });
t('co-edit: others cannot rewrite your asset', 'DENY', OWNER, 'update', `${CO}/assets/a1`, { existing: { id: 'a1', owner: MEMBER, status: 'proxy' }, data: { id: 'a1', owner: MEMBER, status: 'master' } });
t('co-edit: viewer reads the media ledger', 'ALLOW', BOOKS, 'get', `${CO}/assets/a1`, { existing: { id: 'a1', owner: MEMBER } });
t('co-edit: publish your own rig', 'ALLOW', MEMBER, 'create', `${CO}/rigs/${MEMBER}_t1`, { data: { uid: MEMBER, shares: {} } });
t('co-edit: no rig for others', 'DENY', MEMBER, 'create', `${CO}/rigs/${OWNER}_t1`, { data: { uid: OWNER } });
t('co-edit: ask for a preset', 'ALLOW', MEMBER, 'create', `${CO}/requests/r1`, { data: { from: MEMBER, to: OWNER, status: 'pending' } });
t('co-edit: only the person asked answers', 'DENY', MEMBER, 'update', `${CO}/requests/r1`, { existing: { from: MEMBER, to: OWNER, status: 'pending' }, data: { from: MEMBER, to: OWNER, status: 'fulfilled' } });
t('co-edit: asked person fulfils', 'ALLOW', OWNER, 'update', `${CO}/requests/r1`, { existing: { from: MEMBER, to: OWNER, status: 'pending' }, data: { from: MEMBER, to: OWNER, status: 'fulfilled', assetId: 'a1' } });
t('co-edit: outsiders cannot read requests', 'DENY', OTHER, 'get', `${CO}/requests/r1`, { existing: { from: MEMBER, to: OWNER } });

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
