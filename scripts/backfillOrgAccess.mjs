// One-time backfill for the org access model (routes/elevateAccess.ts). Dry run unless --apply is passed.
//   node scripts/backfillOrgAccess.mjs            print what would change
//   node scripts/backfillOrgAccess.mjs --apply    write it
// For every org: protectedRoles on memberships from the roles they already hold, the server-only access lists,
// departmentUids, and departmentId on classes that have none (the org's Christian Education department).
// Explicit finance permissions on a membership are not carried over; they are printed for an IT Admin to review.
import fs from 'fs'; import os from 'os';

const APPLY = process.argv.includes('--apply');
const P = 'gen-lang-client-0665118474';
const token = process.env.RULES_ACCESS_TOKEN || JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')).tokens.access_token;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const base = db => `https://firestore.googleapis.com/v1/projects/${P}/databases/${db}/documents`;

const val = v => !v ? undefined : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : 'nullValue' in v ? null : 'integerValue' in v ? Number(v.integerValue) : Object.values(v)[0];
const data = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)]));
const enc = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'number' ? { integerValue: String(x) } : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } };

async function list(db, col) {
  const out = []; let pageToken = '';
  do {
    const r = await fetch(`${base(db)}/${col}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: H }).then(r => r.json());
    if (r.error) throw new Error(`${col}: ${r.error.message}`);
    out.push(...(r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...data(d) })));
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return out;
}
async function patch(db, path, fields) {
  if (!APPLY) return;
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${base(db)}/${path}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) }) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const MANAGE_GIVING = ['FINANCE_DIRECTOR', 'TREASURER'];
const VIEW_GIVING = ['FINANCE_DIRECTOR', 'TREASURER', 'TRUSTEE', 'BOOKKEEPER', 'ACCOUNTANT', 'FINANCE_VIEWER'];
const MANAGE_ACCOUNTING = ['FINANCE_DIRECTOR', 'TREASURER', 'BOOKKEEPER'];
const VIEW_ACCOUNTING = VIEW_GIVING;
const PROTECTED = ['IT_ADMIN', 'SENIOR_PASTOR', ...VIEW_GIVING];
const FINANCE_PERMS = ['MANAGE_MONEY', 'MANAGE_ACCOUNTING', 'VIEW_ACCOUNTING', 'MANAGE_GIVING', 'VIEW_GIVING'];
const keysOf = m => new Set([m.roleKey, ...(m.roleKeys || []), ...(m.ministryRoles || []).map(r => r?.roleKey)].filter(Boolean));

const [orgs, members, programs] = await Promise.all([list('plajah-prod', 'organizations'), list('plajah-prod', 'orgMemberships'), list('plajah-ops', 'churchPrograms')]);
for (const org of orgs) {
  const mine = members.filter(m => m.orgId === org.id);
  for (const m of mine) {
    const held = PROTECTED.filter(k => keysOf(m).has(k));
    m.protectedRoles = held;
    if (held.length) { console.log(`${org.name}: ${m.displayName || m.id} -> ${held.join(', ')}`); await patch('plajah-prod', `orgMemberships/${m.id}`, { protectedRoles: held }); }
    const extra = (m.permissions || []).filter(p => FINANCE_PERMS.includes(p));
    if (extra.length) console.log(`  REVIEW ${org.name}: ${m.displayName || m.id} has explicit ${extra.join(', ')}; not carried over`);
  }
  const active = mine.filter(m => m.status === 'ACTIVE');
  const ids = keys => [...new Set(active.filter(m => m.protectedRoles.some(k => keys.includes(k))).map(m => m.userId))];
  const departmentUids = {};
  for (const m of active) {
    const ds = new Set([...(m.ministryIds || []), ...(m.ministryRoles || []).map(r => r?.ministryId), ...(org.ministries || []).filter(d => (d.headUids || []).includes(m.userId)).map(d => d.id)].filter(Boolean));
    for (const d of ds) (departmentUids[d] ||= []).push(m.userId);
  }
  await patch('plajah-prod', `organizations/${org.id}`, {
    departmentUids,
    itAdminUids: [...new Set([org.creatorId, ...ids(['IT_ADMIN'])].filter(Boolean))],
    seniorPastorUids: ids(['SENIOR_PASTOR']),
    financeUids: ids(MANAGE_GIVING), givingViewUids: ids(VIEW_GIVING),
    accountingUids: ids(MANAGE_ACCOUNTING), accountingViewUids: ids(VIEW_ACCOUNTING),
  });
  const dept = (org.ministries || []).find(d => /christian\s*ed|education|sunday\s*school|discipleship/i.test(d.name || ''));
  for (const c of programs.filter(p => p.orgId === org.id && !p.departmentId)) {
    if (!dept) { console.log(`  REVIEW ${org.name}: class ${c.name} has no department to join`); continue; }
    console.log(`${org.name}: class ${c.name} -> ${dept.name}`);
    await patch('plajah-ops', `churchPrograms/${c.id}`, { departmentId: dept.id });
  }
}
console.log(`${APPLY ? 'Applied' : 'Dry run'}: ${orgs.length} orgs, ${members.length} memberships, ${programs.length} classes.`);
