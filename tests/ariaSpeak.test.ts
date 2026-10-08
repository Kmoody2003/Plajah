import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createAriaSpeakRouter, decideAriaVoiceAccess, type AriaVoiceAccess } from '../routes/ariaSpeak';

const realFetch = globalThis.fetch;
let server: http.Server;
let base = '';
let upstreamCalls: Array<{ url: string; init: any }> = [];
let upstreamStatus = 200;

before(async () => {
  const app = express();
  const pass = (_q: any, _s: any, n: any) => n();
  const auth = (req: any, _s: any, n: any) => { req.uid = req.headers['x-test-uid'] || 'u1'; n(); };
  // uid prefix decides access in tests: admin-* → admin, free-* → none, anything else → paid.
  const resolveAccess = async (req: any): Promise<AriaVoiceAccess> =>
    String(req.uid).startsWith('admin-') ? 'admin' : String(req.uid).startsWith('free-') ? null : 'paid';
  app.use('/api/aria/speak', createAriaSpeakRouter({ authMiddleware: auth, requireRegisteredUser: pass, limiter: pass, resolveAccess }));
  await new Promise<void>(r => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Stub ONLY the ElevenLabs upstream; let calls to our own test server through.
  globalThis.fetch = (async (url: any, init?: any) => {
    if (String(url).startsWith('https://api.elevenlabs.io/')) {
      upstreamCalls.push({ url: String(url), init });
      return new Response(upstreamStatus === 200 ? new Uint8Array([1, 2, 3, 4]) : 'nope', { status: upstreamStatus });
    }
    return realFetch(url, init);
  }) as any;
});

after(() => { globalThis.fetch = realFetch; server.close(); });

const post = (text: unknown, uid = 'u1') => realFetch(`${base}/api/aria/speak`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-test-uid': uid }, body: JSON.stringify({ text }),
});

test('503 and available:false when no voice is configured', async () => {
  delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_ARIA_VOICE_ID;
  assert.equal((await post('hi')).status, 503);
  const s = await (await realFetch(`${base}/api/aria/speak/status`)).json();
  assert.deepEqual(s, { available: false, eligible: true, access: 'paid' });
  assert.equal(upstreamCalls.length, 0);
});

test('speaks: respells names, sends approved settings, returns audio/mpeg', async () => {
  process.env.ELEVENLABS_API_KEY = 'test-key'; process.env.ELEVENLABS_ARIA_VOICE_ID = 'voice123';
  const res = await post('Welcome to **Plajah**! Try Chora. <ARIA_ACTION>{"id":"x"}</ARIA_ACTION>');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await res.arrayBuffer()).byteLength, 4);
  const call = upstreamCalls.at(-1)!;
  assert.match(call.url, /text-to-speech\/voice123\?/);
  assert.equal(call.init.headers['xi-api-key'], 'test-key');
  const body = JSON.parse(call.init.body);
  assert.equal(body.text, 'Welcome to Plah-yah! Try Koh-rah.');
  assert.deepEqual(body.voice_settings, { stability: 0.5, similarity_boost: 0.75, speed: 1.0 });
  assert.deepEqual(await (await realFetch(`${base}/api/aria/speak/status`)).json(), { available: true, eligible: true, access: 'paid' });
  assert.equal(JSON.parse(call.init.body).model_id, 'eleven_v4');
});

test('free accounts get 403 PAID_ONLY, no upstream call, and status says not eligible', async () => {
  const before = upstreamCalls.length;
  const res = await post('hello there', 'free-1');
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'PAID_ONLY');
  assert.equal(upstreamCalls.length, before);
  const s = await (await realFetch(`${base}/api/aria/speak/status`, { headers: { 'x-test-uid': 'free-1' } })).json();
  assert.deepEqual(s, { available: true, eligible: false, access: null });
});

test('admin is exempt from the daily cap', async () => {
  process.env.ARIA_TTS_DAILY_CHARS = '30';
  for (let i = 0; i < 3; i++) assert.equal((await post('x'.repeat(25), 'admin-1')).status, 200);
  delete process.env.ARIA_TTS_DAILY_CHARS;
});

test('decideAriaVoiceAccess: verified owner email, admins doc, or subscription grant access', () => {
  const base = { isAdminDoc: false, hasActiveSubscription: false };
  assert.equal(decideAriaVoiceAccess({ ...base, email: 'kmoody2003@gmail.com', emailVerified: true }), 'admin');
  assert.equal(decideAriaVoiceAccess({ ...base, email: 'KMoody2003@Gmail.com', emailVerified: true }), 'admin');
  assert.equal(decideAriaVoiceAccess({ ...base, email: 'kmoody2003@gmail.com', emailVerified: false }), null); // unverified claim
  assert.equal(decideAriaVoiceAccess({ ...base, email: 'someone@else.com', emailVerified: true }), null);
  assert.equal(decideAriaVoiceAccess({ ...base, isAdminDoc: true }), 'admin');
  assert.equal(decideAriaVoiceAccess({ ...base, hasActiveSubscription: true }), 'paid');
  assert.equal(decideAriaVoiceAccess({ ...base, email: 'a@b.com', emailVerified: true, extraAdminEmails: 'x@y.com, a@b.com' }), 'admin');
  assert.equal(decideAriaVoiceAccess({ ...base }), null);
});

test('400 on empty text, no upstream call', async () => {
  const before = upstreamCalls.length;
  assert.equal((await post('   ')).status, 400);
  assert.equal((await post(undefined)).status, 400);
  assert.equal(upstreamCalls.length, before);
});

test('daily cap returns 429 and is per user', async () => {
  process.env.ARIA_TTS_DAILY_CHARS = '50';
  assert.equal((await post('x'.repeat(40), 'capuser')).status, 200);
  assert.equal((await post('y'.repeat(40), 'capuser')).status, 429);
  assert.equal((await post('z'.repeat(40), 'someone-else')).status, 200);
  delete process.env.ARIA_TTS_DAILY_CHARS;
});

test('upstream failure is a clean 502 that does not leak the upstream body', async () => {
  upstreamStatus = 500;
  const res = await post('hello there', 'failuser');
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'Voice request failed' });
  upstreamStatus = 200;
  // a failed call must not burn the user's allowance
  process.env.ARIA_TTS_DAILY_CHARS = '12';
  assert.equal((await post('hello there', 'failuser')).status, 200);
  delete process.env.ARIA_TTS_DAILY_CHARS;
});
