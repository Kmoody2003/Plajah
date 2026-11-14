// Attacker cases for shared documents, against firestore.ops.rules and storage.rules, with the Firebase Rules REST
// `:test` API. Read-only: deploys nothing. Usage: node scripts/testCoeditRules.mjs
import fs from 'node:fs';
import os from 'node:os';

const PROJECT = 'gen-lang-client-0665118474';
const tok = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired: run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }

const DB = '/databases/(default)/documents';
const AT = '2026-11-01T00:00:00Z';
const OWNER = 'owner', ED = 'editor', COMM = 'commenter', VIEW = 'viewer', OUT = 'outsider', GONE = 'expired', IT = 'it';
const project = (extra = {}) => ({
  ownerId: OWNER, kind: 'tela', title: 'Doc', orgId: 'o1',
  members: { [OWNER]: 'owner', [ED]: 'editor', [COMM]: 'commenter', [VIEW]: 'viewer', [GONE]: 'editor' },
  memberIds: [OWNER, ED, COMM, VIEW, GONE], names: {}, expires: { [GONE]: 1 }, updatedAt: 1, ...extra,
});
const P = `${DB}/coedit/tela__a`, LOCKED = `${DB}/coedit/tela__l`;
const verPrivate = { by: VIEW, private: true, reason: 'personal' };
const verShared = { by: ED, private: false, reason: 'named' };
const verCheck = { by: ED, private: false, reason: 'checkpoint' };

const mocks = [
  { function: 'get', args: [{ exactValue: P }], result: { value: { data: project() } } },
  { function: 'get', args: [{ exactValue: LOCKED }], result: { value: { data: project({ locked: true }) } } },
  { function: 'exists', args: [{ exactValue: P }], result: { value: true } },
  { function: 'exists', args: [{ exactValue: `${DB}/coedit/tela__solo` }], result: { value: false } },
  { function: 'get', args: [{ exactValue: `${P}/versions/priv_1` }], result: { value: { data: verPrivate } } },
  { function: 'get', args: [{ exactValue: `${P}/versions/shared_1` }], result: { value: { data: verShared } } },
  { function: 'get', args: [{ exactValue: `${P}/versions/check_1` }], result: { value: { data: verCheck } } },
  { function: 'get', args: [{ exactValue: `${DB}/organizations/o1` }], result: { value: { data: { creatorId: 'orgOwner', itAdminUids: [IT], admins: ['orgAdmin'] } } } },
  { function: 'exists', args: [{ anyValue: {} }], result: { value: false } },
];

const cases = [];
const t = (name, expect, uid, method, path, { data, existing, time } = {}) => cases.push({ name, expect, uid, method, path, data, existing, time });
const C = key => `${P}/chunks/${key}`;
const chunk = (by, extra = {}) => ({ d: 'g:xx', n: 1, by, ...extra });

// 1. Snapshots and version bodies
t('viewer cannot write a snapshot piece', 'DENY', VIEW, 'create', C('snap_g_0'), { data: chunk(VIEW) });
t('commenter cannot write a snapshot piece', 'DENY', COMM, 'create', C('snap_g_0'), { data: chunk(COMM) });
t('viewer cannot overwrite a snapshot piece', 'DENY', VIEW, 'update', C('snap_g_0'), { existing: chunk(ED), data: chunk(VIEW) });
t('viewer cannot delete a snapshot piece', 'DENY', VIEW, 'delete', C('snap_g_0'), { existing: chunk(ED) });
t('commenter cannot delete a snapshot piece', 'DENY', COMM, 'delete', C('snap_g_0'), { existing: chunk(ED) });
t('editor writes a snapshot piece', 'ALLOW', ED, 'create', C('snap_g_0'), { data: chunk(ED) });
t('every member reads a snapshot piece', 'ALLOW', VIEW, 'get', C('snap_g_0'), { existing: chunk(ED) });
t('an outsider cannot read a snapshot piece', 'DENY', OUT, 'get', C('snap_g_0'), { existing: chunk(ED) });
t('expired access cannot read a snapshot piece', 'DENY', GONE, 'get', C('snap_g_0'), { existing: chunk(ED), time: AT });
t('viewer stores the body of their private save', 'ALLOW', VIEW, 'create', C('ver_priv_1_0'), { data: chunk(VIEW) });
t('nobody stores a version body in another name', 'DENY', VIEW, 'create', C('ver_priv_1_0'), { data: chunk(ED) });
t('an editor cannot read another member\'s private save', 'DENY', ED, 'get', C('ver_priv_1_0'), { existing: chunk(VIEW) });
t('the owner cannot read another member\'s private save', 'DENY', OWNER, 'get', C('ver_priv_1_0'), { existing: chunk(VIEW) });
t('the author reads their private save', 'ALLOW', VIEW, 'get', C('ver_priv_1_0'), { existing: chunk(VIEW) });
t('anyone on the project reads a shared version', 'ALLOW', COMM, 'get', C('ver_shared_1_0'), { existing: chunk(ED) });
t('a piece whose version does not exist reads for nobody', 'DENY', ED, 'get', C('ver_nothere_1_0'), { existing: chunk(VIEW) });
t('nobody lists the pieces', 'DENY', OWNER, 'list', `${P}/chunks`, {});
t('an editor cannot overwrite someone else\'s private save', 'DENY', ED, 'update', C('ver_priv_1_0'), { existing: chunk(VIEW), data: chunk(ED) });
t('an editor cannot delete someone else\'s private save', 'DENY', ED, 'delete', C('ver_priv_1_0'), { existing: chunk(VIEW) });
t('a viewer cannot delete a shared version body', 'DENY', VIEW, 'delete', C('ver_shared_1_0'), { existing: chunk(ED) });
t('a viewer cannot overwrite a shared version body', 'DENY', VIEW, 'update', C('ver_shared_1_0'), { existing: chunk(ED), data: chunk(VIEW) });
t('the author removes their own save', 'ALLOW', VIEW, 'delete', C('ver_priv_1_0'), { existing: chunk(VIEW) });
t('an editor prunes a shared checkpoint', 'ALLOW', ED, 'delete', C('ver_check_1_0'), { existing: chunk(OWNER) });
t('an unknown kind of piece is refused', 'DENY', OWNER, 'create', C('other_0'), { data: chunk(OWNER) });
t('an editor cannot relabel someone else\'s private save', 'DENY', ED, 'update', `${P}/versions/priv_1`, { existing: verPrivate, data: { ...verPrivate, label: 'x' } });
t('the owner cannot delete someone else\'s private save', 'DENY', OWNER, 'delete', `${P}/versions/priv_1`, { existing: verPrivate });

// 4. Membership, org and custody are the server's
t('nobody can make a project directly', 'DENY', OWNER, 'create', `${DB}/coedit/tela__new`, { data: project({ memberIds: [OWNER], members: { [OWNER]: 'owner' } }) });
t('no client-declared org on a new project', 'DENY', OUT, 'create', `${DB}/coedit/tela__new`, { data: project({ ownerId: OUT, orgId: 'o1', memberIds: [OUT], members: { [OUT]: 'owner' } }) });
t('the owner cannot move a document to another org', 'DENY', OWNER, 'update', P, { existing: project(), data: project({ orgId: 'o2' }) });
t('the owner cannot strip the org from a document', 'DENY', OWNER, 'update', P, { existing: project(), data: (() => { const d = project(); delete d.orgId; return d; })() });
t('the owner cannot add an outsider directly', 'DENY', OWNER, 'update', P, { existing: project(), data: project({ memberIds: [...project().memberIds, OUT], members: { ...project().members, [OUT]: 'editor' } }) });
t('the owner cannot give the document away directly', 'DENY', OWNER, 'update', P, { existing: project(), data: project({ ownerId: ED }) });
t('an editor cannot make themselves owner', 'DENY', ED, 'update', P, { existing: project(), data: project({ members: { ...project().members, [ED]: 'owner' } }) });
t('nobody extends their own access', 'DENY', GONE, 'update', P, { existing: project(), data: project({ expires: {} }) });
t('the owner cannot set a date directly', 'DENY', OWNER, 'update', P, { existing: project(), data: project({ expires: { [ED]: 5 } }) });
t('the owner cannot write a revocation directly', 'DENY', OWNER, 'create', `${P}/revocations/${ED}`, { data: { reason: 'x' } });
t('nobody lifts their own revocation', 'DENY', ED, 'delete', `${P}/revocations/${ED}`, { existing: { reason: 'x' } });
t('owner renames', 'ALLOW', OWNER, 'update', P, { existing: project(), data: project({ title: 'New', updatedAt: 2 }) });
t('editor renames', 'ALLOW', ED, 'update', P, { existing: project(), data: project({ title: 'New', updatedAt: 2 }) });
t('viewer cannot rename', 'DENY', VIEW, 'update', P, { existing: project(), data: project({ title: 'New' }) });
t('outsider cannot read a project', 'DENY', OUT, 'get', P, { existing: project() });

// 5. Delete
t('the owner cannot delete a project directly', 'DENY', OWNER, 'delete', P, { existing: project() });
t('an editor cannot delete a project', 'DENY', ED, 'delete', P, { existing: project() });

// 7. The paper trail
const ev = (by, extra = {}) => ({ pid: 'tela__a', action: 'shared', by, byName: 'N', at: AT, detail: '', ownerId: OWNER, orgId: 'o1', ...extra });
const AUD = `${DB}/docAudit/tela__a/events/e1`;
t('nobody writes the trail directly', 'DENY', OWNER, 'create', AUD, { data: ev(OWNER), time: AT });
t('a member cannot forge an event', 'DENY', ED, 'create', AUD, { data: ev(ED), time: AT });
t('nobody edits the trail', 'DENY', OWNER, 'update', AUD, { existing: ev(OWNER), data: ev(OWNER, { detail: 'x' }) });
t('nobody deletes from the trail', 'DENY', OWNER, 'delete', AUD, { existing: ev(OWNER) });
t('the current owner reads the trail', 'ALLOW', OWNER, 'get', AUD, { existing: ev(ED) });
t('an IT Admin reads the trail', 'ALLOW', IT, 'get', AUD, { existing: ev(ED) });
t('a member cannot read the trail', 'DENY', ED, 'get', AUD, { existing: ev(ED) });
t('an org admin cannot read the trail', 'DENY', 'orgAdmin', 'get', AUD, { existing: ev(ED) });
t('a former owner no longer reads it', 'DENY', 'author', 'get', AUD, { existing: ev(ED, { ownerId: 'author', orgId: '' }) });
t('the author of an unshared document reads its trail', 'ALLOW', OWNER, 'get', `${DB}/docAudit/tela__solo/events/e1`, { existing: ev(OWNER, { pid: 'tela__solo', orgId: '' }) });

// 9. Locked documents
const L = `${LOCKED}`;
t('an editor cannot send edits to a locked document', 'DENY', ED, 'create', `${L}/ops/b1`, { data: { u: ED, ops: '[]', n: 0, at: AT }, time: AT });
t('an editor cannot change a locked document\'s snapshot', 'DENY', ED, 'update', `${L}/snap/head`, { existing: { gen: 'a' }, data: { gen: 'b' } });
t('an editor cannot write a locked document\'s pieces', 'DENY', ED, 'create', `${L}/chunks/snap_g_0`, { data: chunk(ED) });
t('an editor cannot empty a locked document\'s log', 'DENY', ED, 'delete', `${L}/ops/b1`, { existing: { u: ED } });
t('the owner still edits a locked document', 'ALLOW', OWNER, 'update', `${L}/ops/b1`, { existing: { u: OWNER }, data: { u: OWNER, ops: '[]', n: 0, at: AT }, time: AT });
t('an editor cannot lift the lock', 'DENY', ED, 'update', L, { existing: project({ locked: true }), data: project({ locked: false }) });
t('the owner sets the lock', 'ALLOW', OWNER, 'update', P, { existing: project(), data: project({ locked: true, updatedAt: 2 }) });
t('an editor still edits an unlocked document', 'ALLOW', ED, 'update', `${P}/ops/b1`, { existing: { u: ED }, data: { u: ED, ops: '[]', n: 0, at: AT }, time: AT });

// Server-only records
t('nobody reads the media release list', 'DENY', OWNER, 'get', `${DB}/telaMediaRelease/tela__a`, { existing: { public: true } });
t('nobody publishes media directly', 'DENY', OWNER, 'create', `${DB}/telaMediaRelease/tela__a`, { data: { public: true } });

async function run(file, list, label, build) {
  const body = { source: { files: [{ name: file, content: fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') }] }, testSuite: { testCases: list.map(build) } };
  const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) { console.error(JSON.stringify(out, null, 2).slice(0, 3000)); process.exit(1); }
  let bad = 0;
  (out.testResults || []).forEach((r, i) => { if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', list[i].expect, '·', list[i].name, '→', r.state, (r.debugMessages || []).join(' ').slice(0, 160)); } });
  console.log(`${label}: ${(out.testResults || []).length - bad}/${(out.testResults || []).length} passed`);
  return bad;
}

let failed = await run('firestore.ops.rules', cases, 'firestore.ops.rules', c => {
  const req = { method: c.method, path: c.path };
  if (c.uid) req.auth = { uid: c.uid, token: { email: `${c.uid}@example.test`, email_verified: true } };
  if (c.data) req.resource = { data: c.data };
  if (c.time) req.time = c.time;
  const tc = { expectation: c.expect, request: req, functionMocks: mocks };
  if (c.existing) tc.resource = { data: c.existing };
  return tc;
});

// Storage: no direct reads of document media; only the uploader writes, and never active content.
const B = '/b/gen-lang-client-0665118474.firebasestorage.app/o';
const sCases = [];
const s = (name, expect, uid, method, path, resource) => sCases.push({ name, expect, uid, method, path, resource });
const up = (contentType, size = 1000) => ({ contentType, size, metadata: {}, name: 'x', bucket: 'b' });
const M = `${B}/tela-media/tela__a/user/u1/a.png`, O = `${B}/tela-media/tela__a/org/o1/u1/a.png`, A = `${B}/coedit-assets/tela__a/u1/h/proxy.m4a`;
for (const [label, path] of [['tela-media', M], ['org tela-media', O], ['coedit-assets', A]]) {
  s(`${label}: the uploader cannot read directly`, 'DENY', 'u1', 'get', path);
  s(`${label}: another account cannot read directly`, 'DENY', 'u2', 'get', path);
  s(`${label}: signed out cannot read`, 'DENY', null, 'get', path);
  s(`${label}: nobody lists`, 'DENY', 'u1', 'list', path);
  s(`${label}: the uploader writes an image`, 'ALLOW', 'u1', 'create', path, up('image/png'));
  s(`${label}: another account cannot write here`, 'DENY', 'u2', 'create', path, up('image/png'));
  s(`${label}: no HTML`, 'DENY', 'u1', 'create', path, up('text/html'));
  s(`${label}: no SVG`, 'DENY', 'u1', 'create', path, up('image/svg+xml'));
  s(`${label}: no script`, 'DENY', 'u1', 'create', path, up('application/javascript'));
  s(`${label}: no 3 GB file`, 'DENY', 'u1', 'create', path, up('video/mp4', 3 * 1024 ** 3));
  s(`${label}: another account cannot delete`, 'DENY', 'u2', 'delete', path, up('image/png'));
}
failed += await run('storage.rules', sCases, 'storage.rules', c => {
  const req = { method: c.method, path: c.path };
  if (c.uid) req.auth = { uid: c.uid, token: { email: `${c.uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } } };
  if (c.method === 'create') req.resource = c.resource;
  const tc = { expectation: c.expect, request: req };
  if (c.method === 'delete' || c.method === 'get') tc.resource = c.resource || up('image/png');
  return tc;
});
process.exit(failed ? 1 : 0);
