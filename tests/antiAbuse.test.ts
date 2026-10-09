import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSignupEmail, isDisposableDomain, emailDomain } from '../services/signupGuard';
import { DISPOSABLE_EMAIL_DOMAINS } from '../data/disposableEmailDomains';
import { appCheckClaimsOk } from '../services/appCheckServer';
import { consumeShared, uidOrIpKey } from '../services/sharedRateLimit';

test('disposable list is compact, lower-case and duplicate-free', () => {
  assert.ok(DISPOSABLE_EMAIL_DOMAINS.length >= 250, `only ${DISPOSABLE_EMAIL_DOMAINS.length}`);
  assert.equal(new Set(DISPOSABLE_EMAIL_DOMAINS).size, DISPOSABLE_EMAIL_DOMAINS.length);
  for (const d of DISPOSABLE_EMAIL_DOMAINS) assert.match(d, /^[a-z0-9.-]+\.[a-z]{2,}$/);
  for (const real of ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'proton.me', 'hotmail.com', 'aol.com']) {
    assert.ok(!DISPOSABLE_EMAIL_DOMAINS.includes(real), real);
  }
});

test('signup check: generic verdicts, disposable + subdomains rejected', () => {
  assert.deepEqual(checkSignupEmail('Person@Gmail.com'), { ok: true });
  assert.equal(checkSignupEmail('nope').ok, false);
  const v = checkSignupEmail('bot123@mailinator.com');
  assert.equal(v.ok, false);
  assert.equal((v as { code?: string }).code, 'EMAIL_NOT_ACCEPTED');
  assert.ok(isDisposableDomain('inbox.mailinator.com'));
  assert.ok(!isDisposableDomain('mailinator.com.example.org'));
  assert.equal(emailDomain('a@B.Example.COM.'), 'b.example.com');
});

const NUM = '538331111809';
const goodHeader = { alg: 'RS256', typ: 'JWT', kid: 'k1' };
const goodPayload = (over: Record<string, unknown> = {}) => ({
  iss: `https://firebaseappcheck.googleapis.com/${NUM}`,
  aud: [`projects/${NUM}`, 'projects/gen-lang-client-0665118474'],
  sub: '1:538331111809:web:abc',
  exp: 2_000_000_000,
  ...over,
});

test('App Check claims: iss/aud bound to this project number', () => {
  const now = 1_900_000_000;
  assert.equal(appCheckClaimsOk(goodHeader, goodPayload(), now), true);
  assert.equal(appCheckClaimsOk(goodHeader, goodPayload({ iss: 'https://firebaseappcheck.googleapis.com/999' }), now), false);
  assert.equal(appCheckClaimsOk(goodHeader, goodPayload({ aud: ['projects/999'] }), now), false);
  assert.equal(appCheckClaimsOk(goodHeader, goodPayload({ exp: now - 120 }), now), false);
  assert.equal(appCheckClaimsOk(goodHeader, goodPayload({ sub: '' }), now), false);
  assert.equal(appCheckClaimsOk({ ...goodHeader, alg: 'HS256' }, goodPayload(), now), false);
  assert.equal(appCheckClaimsOk({ alg: 'RS256' }, goodPayload(), now), false); // no kid
});

test('shared limiter fails open without credentials but still enforces the local shadow', async () => {
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const now = 1_000_000;
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await consumeShared('t', 'ip:1.2.3.4', 3, 60_000, now));
  assert.deepEqual(results.map(r => r.ok), [true, true, true, false]);
  assert.equal(results[3].shared, false);
  assert.ok((await consumeShared('t', 'ip:1.2.3.4', 3, 60_000, now + 60_000)).ok); // next window
  assert.equal(uidOrIpKey({ uid: 'abc', ip: '1.1.1.1' }), 'uid:abc');
  assert.match(uidOrIpKey({ ip: '2001:db8:1234:5678::1' }), /^ip:2001:db8:1234:5600::\/56$/);
});
