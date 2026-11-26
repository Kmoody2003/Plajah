import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  normalizeAdNetwork, adAudienceFor, interleaveNetworkSlots, buildAdsTxt, cleanAdsTxtLines, railUnitFor, videoTagFor,
  audioTagFor, gamesPubFor, finalizeVastUrl, networkSpotSec, GOOGLE_TEST_RAIL_UNIT, GOOGLE_TEST_VAST, NETWORK_SPOT_URL,
} from '../services/ads/networkAds';
import { planBreak } from '../services/fast/breakPlan';
import { createAdPlatformRouter } from '../routes/adPlatform';

const NOW = Date.UTC(2026, 10, 26, 12);

test('a stored setup is cleaned: bad ids and non-https tags are dropped, never trusted', () => {
  const c = normalizeAdNetwork({
    enabled: true, networkCode: '21812345678', railUnitPath: '/21812345678/plajah_rail',
    videoTagUrl: 'javascript:alert(1)', audioTagUrl: 'http://insecure.example/vast',
    adsensePubId: 'pub-1234567890123456', gamesEnabled: 'yes', adsTxtExtra: 'adinplay.com, 999, DIRECT\n<script>bad</script>',
  });
  assert.equal(c.enabled, true);
  assert.equal(c.railUnitPath, '/21812345678/plajah_rail');
  assert.equal(c.videoTagUrl, '');
  assert.equal(c.audioTagUrl, '');
  assert.equal(c.adsensePubId, 'ca-pub-1234567890123456');
  assert.equal(c.gamesEnabled, false, 'only a real true switches games on');
  assert.equal(c.adsTxtExtra, 'adinplay.com, 999, DIRECT');
  assert.equal(normalizeAdNetwork({ railUnitPath: '../../etc' }).railUnitPath, '');
  assert.equal(normalizeAdNetwork(null).enabled, false);
});

test('each surface loads nothing while off, Google samples in test mode, your units otherwise', () => {
  const off = normalizeAdNetwork({ railUnitPath: '/123456/rail', videoTagUrl: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/1/x' });
  assert.equal(railUnitFor(off), null);
  assert.equal(videoTagFor(off), null);
  const test = normalizeAdNetwork({ enabled: true, testMode: true });
  assert.equal(railUnitFor(test), GOOGLE_TEST_RAIL_UNIT);
  assert.equal(videoTagFor(test), GOOGLE_TEST_VAST);
  const live = normalizeAdNetwork({ enabled: true, railUnitPath: '/123456/rail', videoTagUrl: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/1/x', adsensePubId: 'ca-pub-1234567890123456' });
  assert.equal(railUnitFor(live), '/123456/rail');
  assert.equal(audioTagFor(live), live.videoTagUrl, 'FM falls back to the TV tag');
  assert.equal(gamesPubFor(live), null, 'games need their own switch');
  assert.equal(gamesPubFor({ ...live, gamesEnabled: true }), 'ca-pub-1234567890123456');
});

test('children, under-18s and education accounts are restricted; adults and signed-out visitors are not', () => {
  const cfg = { restrictSignedOut: false };
  assert.equal(adAudienceFor({ signedIn: true }, cfg), 'general');
  assert.equal(adAudienceFor({ signedIn: false }, cfg), 'general');
  assert.equal(adAudienceFor({ signedIn: false }, { restrictSignedOut: true }), 'restricted');
  assert.equal(adAudienceFor({ signedIn: true, isChild: true }, cfg), 'restricted');
  assert.equal(adAudienceFor({ signedIn: true, accountType: 'CHILD' }, cfg), 'restricted');
  assert.equal(adAudienceFor({ signedIn: true, isEducation: true }, cfg), 'restricted');
  assert.equal(adAudienceFor({ signedIn: true, birthYear: 2010, now: NOW }, cfg), 'restricted');
  assert.equal(adAudienceFor({ signedIn: true, birthYear: 2008, now: NOW }, cfg), 'restricted', '2026 − 2008 = 18 by year, still under 18 until the birthday');
  assert.equal(adAudienceFor({ signedIn: true, birthYear: 2007, now: NOW }, cfg), 'general');
});

test('the rail gets its third-party share, spread out, and Plajah always leads', () => {
  const house = Array.from({ length: 14 }, (_, i) => `h${i}`);
  const mixed = interleaveNetworkSlots(house, 30, n => `N${n}`);
  const net = mixed.filter(s => s.startsWith('N')).length;
  assert.equal(net, 6, '14 × 30 / 70 = 6');
  assert.ok(Math.abs(net / mixed.length - 0.3) < 0.01);
  assert.ok(!mixed[0].startsWith('N'), 'a Plajah slot comes first');
  assert.deepEqual(mixed.filter(s => s.startsWith('h')), house, 'house order is kept');
  for (let i = 1; i < mixed.length; i++) assert.ok(!(mixed[i].startsWith('N') && mixed[i - 1].startsWith('N')), 'never two network ads in a row');
  assert.deepEqual(interleaveNetworkSlots(house, 0, n => `N${n}`), house);
  assert.deepEqual(interleaveNetworkSlots([], 30, n => `N${n}`), []);
  assert.equal(interleaveNetworkSlots(['a'], 30, n => `N${n}`).length, 2, 'a one-slot rail still gets one');
});

test('ads.txt carries Google’s seller line and only well-formed extras', () => {
  const txt = buildAdsTxt(normalizeAdNetwork({ adsensePubId: 'ca-pub-1234567890123456', adsTxtExtra: 'adinplay.com, 12, RESELLER\nnot a record' }));
  assert.match(txt, /^google\.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0$/m);
  assert.match(txt, /^adinplay\.com, 12, RESELLER$/m);
  assert.doesNotMatch(txt, /not a record/);
  assert.match(buildAdsTxt(normalizeAdNetwork(null)), /No sellers are authorized yet/);
  assert.equal(cleanAdsTxtLines('contact=ads@example.com\n# note'), 'contact=ads@example.com\n# note');
});

test('VAST tags get a fresh correlator and a duration cap; other hosts are left alone', () => {
  const u = new URL(finalizeVastUrl(GOOGLE_TEST_VAST, { now: 42, maxAdSec: 30, pageUrl: 'https://plajah.com' }));
  assert.equal(u.searchParams.get('correlator'), '42');
  assert.equal(u.searchParams.get('max_ad_duration'), '30000');
  assert.equal(u.searchParams.get('url'), 'https://plajah.com');
  assert.equal(finalizeVastUrl('https://ads.other.example/vast?x=1', { now: 1 }), 'https://ads.other.example/vast?x=1');
});

test('a TV break keeps its reserved network spot and still ends exactly on time', () => {
  assert.equal(networkSpotSec(30), 0);
  assert.equal(networkSpotSec(60), 15);
  assert.equal(networkSpotSec(120), 30);
  const plan = planBreak({
    totalSec: 120, hasUpNext: true, rng: () => 0.3,
    spots: [{ url: 'a.mp4', title: 'A', durSec: 30 }, { url: 'b.mp4', title: 'B', durSec: 20 }],
    reservedSpot: { url: NETWORK_SPOT_URL, title: 'Sponsored', durSec: 30 },
  });
  const net = plan.filter(s => s.url === NETWORK_SPOT_URL);
  assert.equal(net.length, 1);
  assert.equal(net[0].kind, 'spot');
  assert.equal(net[0].durSec, 30);
  const last = plan[plan.length - 1];
  assert.ok(Math.abs(last.startSec + last.durSec - 120) < 1e-6);
  // Too long for the break → simply not reserved.
  const short = planBreak({ totalSec: 20, hasUpNext: false, spots: [], reservedSpot: { url: NETWORK_SPOT_URL, title: 'S', durSec: 30 } });
  assert.equal(short.filter(s => s.url === NETWORK_SPOT_URL).length, 0);
});

// ── Routes ───────────────────────────────────────────────────────────────────

const pass: express.RequestHandler = (req: any, _res, next) => { req.uid = 'admin1'; next(); };
const deny: express.RequestHandler = (_req, res) => { res.status(403).json({ error: 'nope' }); };

async function serve(app: express.Express) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>(r => server.close(() => r())) };
}

test('network routes: public read, ads.txt, admin-only save with validation and audit', async () => {
  let settings: Record<string, any> = { adRatios: { userPromos: 50, partners: 20, thirdParty: 30 } };
  const audits: string[] = [];
  const mk = (admin: express.RequestHandler) => {
    const app = express();
    app.use(createAdPlatformRouter({
      authMiddleware: pass, requireAdmin: admin, now: () => NOW,
      get: async path => (path === 'systemConfig/settings' ? settings : null),
      patch: async (path, data) => { if (path === 'systemConfig/settings') settings = { ...settings, ...data }; return true; },
      audit: (async (_uid: string, action: string) => { audits.push(action); }) as any,
    }));
    return app;
  };
  const s = await serve(mk(pass));

  let r = await (await fetch(s.base + '/api/ads/network')).json();
  assert.equal(r.config.enabled, false, 'nothing set up → off');
  assert.equal(r.thirdPartyPct, 0);

  const save = (config: unknown) => fetch(s.base + '/api/admin/ads/network', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
  assert.equal((await save({ enabled: true })).status, 400, 'switching on with nothing to load is refused');
  const ok = await save({ enabled: true, railUnitPath: '/21812345678/plajah_rail', adsensePubId: 'ca-pub-1234567890123456', adsTxtExtra: 'adinplay.com, 1, DIRECT' });
  assert.equal(ok.status, 200);
  assert.deepEqual(audits, ['ads.network.update']);

  r = await (await fetch(s.base + '/api/ads/network')).json();
  assert.equal(r.config.enabled, true);
  assert.equal(r.config.railUnitPath, '/21812345678/plajah_rail');
  assert.equal(r.config.adsTxtExtra, undefined, 'the public read leaves out the ads.txt draft');
  assert.equal(r.thirdPartyPct, 30);

  const txt = await fetch(s.base + '/ads.txt');
  assert.match(txt.headers.get('content-type') || '', /text\/plain/);
  const body = await txt.text();
  assert.match(body, /google\.com, pub-1234567890123456, DIRECT/);
  assert.match(body, /adinplay\.com, 1, DIRECT/);
  await s.close();

  const d = await serve(mk(deny));
  assert.equal((await fetch(d.base + '/api/admin/ads/network', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(d.base + '/api/admin/ads/network')).status, 403);
  await d.close();
});
