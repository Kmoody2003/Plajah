// routes/curriculumFetch.ts with fake auth and a fake Google: link rewriting, host allowlist, private files.
//   npx tsx --test tests/curriculumFetch.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createCurriculumFetchRouter, resolveCurriculumUrl } from '../routes/curriculumFetch';

test('share links become downloadable Google URLs; other hosts are refused', () => {
  assert.equal(resolveCurriculumUrl('https://drive.google.com/file/d/11EYZuvQ74v_NMPNsdxcP0VWv0zHnTFjv/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=11EYZuvQ74v_NMPNsdxcP0VWv0zHnTFjv');
  assert.equal(resolveCurriculumUrl('https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?tab=t.abc'), 'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/export?format=txt&tab=t.abc');
  assert.equal(resolveCurriculumUrl('https://docs.google.com/forms/d/e/1FAIpQLScAs2Gkj1Vv_rDmvGp0TQm/viewform?usp=header'), 'https://docs.google.com/forms/d/e/1FAIpQLScAs2Gkj1Vv_rDmvGp0TQm/viewform');
  assert.equal(resolveCurriculumUrl('https://evil.example.com/file.pdf'), null);
  assert.equal(resolveCurriculumUrl('http://drive.google.com/file/d/11EYZuvQ74v_NMPNsdxcP0VWv0zHnTFjv/view'), null);
  assert.equal(resolveCurriculumUrl('https://drive.google.com.evil.com/x'), null);
  assert.equal(resolveCurriculumUrl('not a url'), null);
});

type Fake = (url: string) => { status: number; type?: string; body?: string; location?: string };
async function serve(fake: Fake, signedIn = true) {
  const fetchImpl = (async (url: string) => {
    const r = fake(String(url));
    return new Response(r.body ?? '', { status: r.status, headers: { 'content-type': r.type || 'application/octet-stream', ...(r.location ? { location: r.location } : {}) } });
  }) as typeof fetch;
  const app = express();
  app.use(express.json(), createCurriculumFetchRouter({ verify: async () => (signedIn ? ({ uid: 'u1', isAnonymous: false } as any) : null), fetchImpl }));
  const srv = app.listen(0);
  const port = (srv.address() as AddressInfo).port;
  const call = (url: string) => fetch(`http://127.0.0.1:${port}/`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify({ url }) });
  return { call, close: () => srv.close() };
}

const DRIVE = 'https://drive.google.com/file/d/11EYZuvQ74v_NMPNsdxcP0VWv0zHnTFjv/view?usp=sharing';

test('returns the file, following Google redirects', async () => {
  const s = await serve(u => (u.includes('uc?export') ? { status: 303, location: 'https://drive.usercontent.google.com/download?id=x' } : { status: 200, type: 'application/pdf', body: '%PDF-1.7 real' }));
  const r = await s.call(DRIVE);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(await r.text(), '%PDF-1.7 real');
  s.close();
});

test('private files come back 403, never the sign-in page', async () => {
  const toLogin = await serve(() => ({ status: 302, location: 'https://accounts.google.com/ServiceLogin?continue=x' }));
  const a = await toLogin.call(DRIVE);
  assert.equal(a.status, 403);
  assert.equal((await a.json()).private, true);
  toLogin.close();
  const wall = await serve(() => ({ status: 200, type: 'text/html', body: '<html><title>Google Drive: Sign-in</title><a href="https://accounts.google.com/ServiceLogin">' }));
  assert.equal((await wall.call(DRIVE)).status, 403);
  wall.close();
  const denied = await serve(() => ({ status: 401, type: 'text/html', body: 'no' }));
  assert.equal((await denied.call(DRIVE)).status, 403);
  denied.close();
});

test('redirects off Google, other hosts, and signed-out callers are refused', async () => {
  const off = await serve(() => ({ status: 302, location: 'https://evil.example.com/steal' }));
  assert.equal((await off.call(DRIVE)).status, 502);
  assert.equal((await off.call('https://evil.example.com/a.pdf')).status, 400);
  off.close();
  const out = await serve(() => ({ status: 200, body: 'x' }), false);
  assert.equal((await out.call(DRIVE)).status, 401);
  out.close();
});
