// Evaluates the `experiences` + `experienceFilms` rules in firestore.rules with the Firebase Rules REST `:test` API.
// Read-only: it sends the rules text and test cases to Google for evaluation and DEPLOYS NOTHING.
// Same approach as scripts/testPhiRules.mjs. Usage: node scripts/testExperiencesRules.mjs
// Needs a live firebase-tools login (npx firebase-tools projects:list refreshes the token).
import fs from 'node:fs';
import os from 'node:os';
const PROJECT = 'gen-lang-client-0665118474';
const cfgPath = os.homedir() + '/.config/configstore/firebase-tools.json';
const tok = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).tokens;
if (!tok?.access_token || tok.expires_at < Date.now() + 60000) { console.error('Token expired — run `npx firebase-tools projects:list` once, then retry.'); process.exit(2); }
// The test API cannot express timestamps, and the whole 4000-line file is not accepted by it. So: take the REAL
// helper functions and the REAL `experiences` / `experienceFilms` blocks out of firestore.rules (nothing retyped here)
// and evaluate them in a minimal ruleset.
const full = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const grab = (startRe) => {
  const i = full.search(startRe);
  if (i < 0) throw new Error('not found in firestore.rules: ' + startRe);
  let depth = 0;
  const open = full.slice(i).search(/\{\r?\n/);   // the body's brace (skips path wildcards like {expId}); the file is CRLF
  for (let k = i + open; k < full.length; k++) {
    if (full[k] === '{') depth++;
    else if (full[k] === '}' && --depth === 0) return full.slice(i, k + 1);
  }
  throw new Error('unbalanced braces');
};
const src = [
  "rules_version = '2';", 'service cloud.firestore {', '  match /databases/{database}/documents {',
  grab(/function isAuthenticated\(\)/), grab(/function isAdmin\(\)/),
  grab(/match \/experiences\/\{expId\}/), grab(/match \/experienceFilms\/\{exhibitId\}/),
  '  }', '}', '',
].join('\n');

const DB = '/databases/(default)/documents';
const ADM = 'adm', USR = 'usr', STF = 'stf', OWNER = 'ownr';
const mocks = [ADM, USR, STF, OWNER].map(u => ({ function: 'exists', args: [{ exactValue: `${DB}/admins/${u}` }], result: { value: u === ADM } }));

const film = (o = {}) => ({ exhibitId: 'henry-ford', experienceId: 'ford-council', reelloVideoId: 'vid_1760000000000', title: 'Henry Ford: the film', muxPlaybackId: 'AbCdEf0123456789', playbackPolicy: 'public', durationSec: 219.17, width: 1920, height: 1080, updatedAt: 1, ...o });
const rec = { id: 'ford-council', exhibitId: 'henry-ford', kind: 'film', muxAssetId: 'a1', status: 'ready' };
const cases = [];
const t = (name, expect, who, method, path, { data, existing } = {}) => cases.push({ name, expect, who, method, path, data, existing });
const E = id => `${DB}/experiences/${id}`;
const F = id => `${DB}/experienceFilms/${id}`;

// experiences: admin only
t('admin reads experience', 'ALLOW', ADM, 'get', E('ford-council'), { existing: rec });
t('admin writes experience', 'ALLOW', ADM, 'create', E('ford-council'), { data: rec });
t('admin updates experience', 'ALLOW', ADM, 'update', E('ford-council'), { data: { ...rec, status: 'ready' }, existing: rec });
t('admin deletes experience', 'ALLOW', ADM, 'delete', E('ford-council'), { existing: rec });
t('signed-in user cannot read experience', 'DENY', USR, 'get', E('ford-council'), { existing: rec });
t('signed-in user cannot list experiences', 'DENY', USR, 'list', `${DB}/experiences`);
t('signed-in user cannot write experience', 'DENY', USR, 'create', E('x'), { data: rec });
t('signed-in user cannot delete experience', 'DENY', USR, 'delete', E('ford-council'), { existing: rec });
t('anonymous cannot read experience', 'DENY', null, 'get', E('ford-council'), { existing: rec });
t('staff without admins doc cannot read experience', 'DENY', STF, 'get', E('ford-council'), { existing: rec });
t('verified owner email reads experience', 'ALLOW', OWNER, 'get', E('ford-council'), { existing: rec });
t('unverified owner email cannot read experience', 'DENY', 'unv', 'get', E('ford-council'), { existing: rec });

// experienceFilms: public read, admin write with a fixed shape
t('anonymous reads hall film', 'ALLOW', null, 'get', F('henry-ford'), { existing: film() });
t('signed-in user reads hall film', 'ALLOW', USR, 'get', F('henry-ford'), { existing: film() });
t('user cannot write hall film', 'DENY', USR, 'create', F('henry-ford'), { data: film() });
t('anonymous cannot write hall film', 'DENY', null, 'create', F('henry-ford'), { data: film() });
t('admin creates hall film', 'ALLOW', ADM, 'create', F('henry-ford'), { data: film() });
t('admin updates hall film', 'ALLOW', ADM, 'update', F('henry-ford'), { data: film({ updatedAt: 2 }), existing: film() });
t('admin creates hall film with captions', 'ALLOW', ADM, 'create', F('henry-ford'), { data: film({ captionsUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/c.vtt?alt=media' }) });
t('admin deletes hall film', 'ALLOW', ADM, 'delete', F('henry-ford'), { existing: film() });
t('user cannot delete hall film', 'DENY', USR, 'delete', F('henry-ford'), { existing: film() });
t('hall film with asset id leak field', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ muxAssetId: 'secret-asset' }) });
t('hall film with sourceFile field', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ sourceFile: 'docs/dossier/x.mp4' }) });
t('hall film with signed policy', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ playbackPolicy: 'signed' }) });
t('hall film doc id must equal exhibitId', 'DENY', ADM, 'create', F('someone-else'), { data: film() });
t('hall film without duration', 'DENY', ADM, 'create', F('henry-ford'), { data: (() => { const d = film(); delete d.durationSec; return d; })() });
t('hall film with zero duration', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ durationSec: 0 }) });
t('hall film with tiny playback id', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ muxPlaybackId: 'abc' }) });
t('hall film without reelloVideoId (the Reello video is the source of truth)', 'DENY', ADM, 'create', F('henry-ford'), { data: (() => { const d = film(); delete d.reelloVideoId; return d; })() });
t('hall film with empty reelloVideoId', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ reelloVideoId: '' }) });
t('hall film with non-string reelloVideoId', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ reelloVideoId: 12345 }) });
t('hall film with oversized reelloVideoId', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ reelloVideoId: 'v'.repeat(250) }) });
t('hall film with an unknown extra field', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ reelloIsPrivate: false }) });
t('hall film update cannot drop reelloVideoId', 'DENY', ADM, 'update', F('henry-ford'), { data: (() => { const d = film({ updatedAt: 2 }); delete d.reelloVideoId; return d; })(), existing: film() });
t('user cannot write a hall film with reelloVideoId', 'DENY', USR, 'update', F('henry-ford'), { data: film({ updatedAt: 2 }), existing: film() });
t('hall film with non-string playback id', 'DENY', ADM, 'create', F('henry-ford'), { data: film({ muxPlaybackId: 12345678 }) });

const claims = { [ADM]: {}, [USR]: {}, [STF]: {}, [OWNER]: { email: 'kmoody2003@gmail.com', email_verified: true }, unv: { email: 'kmoody2003@gmail.com', email_verified: false } };
const body = {
  source: { files: [{ name: 'firestore.rules', content: src }] },
  testSuite: {
    testCases: cases.map(c => {
      const req = { method: c.method, path: c.path };
      if (c.who) req.auth = { uid: c.who, token: claims[c.who] || {} };
      if (c.data) req.resource = { data: c.data };
      const tc = { expectation: c.expect, request: req, functionMocks: [...mocks, { function: 'exists', args: [{ exactValue: `${DB}/admins/unv` }], result: { value: false } }] };
      if (c.existing) tc.resource = { data: c.existing };
      return tc;
    }),
  },
};
const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }, body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok) { console.error(JSON.stringify(out, null, 2).slice(0, 3000)); process.exit(1); }
if (out.issues?.length) console.log('ISSUES', JSON.stringify(out.issues, null, 1).slice(0, 3000));
const results = out.testResults || [];
let bad = 0;
results.forEach((r, i) => {
  if (r.state !== 'SUCCESS') { bad++; console.log('FAIL', cases[i].name, '→', r.state, (r.errorPosition ? 'line ' + r.errorPosition.line : ''), (r.debugMessages || []).slice(-3).join(' | ')); }
});
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
