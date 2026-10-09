// Evite creator themes — pure rules (access, price, fee math, input cleaning) and the marketplace server flow
// against in-memory Firestore + a fake Stripe. No network.
// Run: npx tsx --test tests/eviteThemes.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  themeIdOf, isThemeId, themeTemplateId, canUseTheme, canSeeTheme, sanctuaryAllows, validatePriceCents, themeSaleMath, cleanThemeInput,
  brandFlag, licenseGrants, licenseTransferable, dhashFromGray, hamming64, isLightBottom, coverCrop, filterMarket, type EviteTheme,
} from '../services/evite/eviteThemes';
import { registerEviteThemeRoutes, mayUseTemplate, resolveArt, recordThemePurchase, grantThemeLicensesForStoreOrder } from '../services/evite/eviteThemeServer';
import { registerEviteRoutes } from '../services/evite/eviteServer';

const up = (uid: string, name: string) => `https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/${encodeURIComponent(`users/${uid}/evite-themes/k1/${name}`)}?alt=media&token=t`;
const assetsOf = (uid: string) => ({ plate: up(uid, 'plate.jpg'), depth: up(uid, 'depth.jpg'), thumb: up(uid, 'thumb.jpg') });
const T = (o: Partial<EviteTheme> = {}): EviteTheme => ({
  id: 'abcdefghjk', ownerUid: 'creator1', title: 'Night Garden', description: '', tags: [], preset: 'wedding', light: false, assets: assetsOf('creator1'),
  access: 'free', priceCents: 0, status: 'published', listed: true, uses: 0, sales: 0, createdAt: 1, updatedAt: 1, ...o,
});

describe('ids and access rules', () => {
  test('theme design ids are distinct from catalogue ids', () => {
    assert.equal(themeIdOf('theme:abcdefghjk'), 'abcdefghjk');
    assert.equal(isThemeId('wedding/olive'), false);
    assert.equal(isThemeId('theme:../x'), false);
    assert.equal(isThemeId('theme:ABCDEFGHJK'), false);
    assert.equal(themeTemplateId('abcdefghjk'), 'theme:abcdefghjk');
  });
  test('who can use what', () => {
    assert.equal(canUseTheme(T(), 'anyone'), true, 'free: anyone');
    assert.equal(canUseTheme(T({ access: 'paid', priceCents: 500 }), 'buyer'), false);
    assert.equal(canUseTheme(T({ access: 'paid', priceCents: 500 }), 'buyer', { licensed: true }), true);
    assert.equal(canUseTheme(T({ access: 'sanctuary' }), 'fan', { sanctuaryMember: true }), true);
    assert.equal(canUseTheme(T({ access: 'sanctuary' }), 'fan'), false);
    assert.equal(canUseTheme(T({ access: 'private' }), 'other'), false, 'private: only the creator');
    assert.equal(canUseTheme(T({ access: 'private' }), 'creator1'), true);
    assert.equal(canUseTheme(T({ access: 'private' }), 'family', { licensed: true }), true, 'the creator can gift a private theme');
    assert.equal(canUseTheme(T({ status: 'removed' }), 'creator1'), false, 'removed: nobody, not even the creator');
    assert.equal(canUseTheme(T({ status: 'draft' }), 'anyone'), false);
    assert.equal(canUseTheme(T(), null), false);
  });
  test('private and removed themes are invisible', () => {
    assert.equal(canSeeTheme(T({ access: 'private' })), false);
    assert.equal(canSeeTheme(T({ access: 'private' }), 'creator1'), true);
    assert.equal(canSeeTheme(T({ status: 'removed' }), 'creator1'), false);
    assert.equal(canSeeTheme(T({ status: 'draft' })), false);
  });
  test('sanctuary membership: ACTIVE only, tiers respected', () => {
    assert.equal(sanctuaryAllows({ status: 'ACTIVE', tierId: 'gold' }), true);
    assert.equal(sanctuaryAllows({ status: 'PAUSED', tierId: 'gold' }), false);
    assert.equal(sanctuaryAllows({ status: 'ACTIVE', tierId: 'bronze' }, ['gold']), false);
    assert.equal(sanctuaryAllows(null), false);
  });
  test('licences: member bookmarks grant nothing; only paid/gifted ones move', () => {
    assert.equal(licenseGrants({ status: 'active', source: 'member' }), false);
    assert.equal(licenseGrants({ status: 'transferred', source: 'purchase' }), false);
    assert.equal(licenseTransferable({ status: 'active', source: 'purchase' }), true);
    assert.equal(licenseTransferable({ status: 'active', source: 'claim' }), false);
  });
});

describe('money', () => {
  test('price bounds', () => {
    assert.equal(validatePriceCents(99).ok, false);
    assert.equal(validatePriceCents(250.5).ok, false);
    assert.equal(validatePriceCents(10_001).ok, false);
    assert.deepEqual(validatePriceCents(500), { ok: true, cents: 500 });
  });
  test('5% platform fee; Stripe fee comes out of the platform side on a destination charge', () => {
    const m = themeSaleMath(1000);
    assert.equal(m.platformFeeCents, 50); assert.equal(m.creatorCents, 950);
    assert.equal(m.estStripeFeeCents, 59);
    assert.ok(themeSaleMath(500).platformNetCents < 0, 'a $5 sale costs the platform money at 2.9% + 30¢');
    assert.ok(themeSaleMath(1500).platformNetCents >= 0);
  });
});

describe('input cleaning', () => {
  test('assets must be the creator’s own uploads; brands refused; preset required', () => {
    const base = { title: 'Night Garden', preset: 'wedding', assets: assetsOf('creator1'), access: 'free' };
    assert.equal(cleanThemeInput(base, 'creator1').ok, true);
    assert.match((cleanThemeInput(base, 'someoneelse') as any).error, /uploaded from your account/);
    assert.match((cleanThemeInput({ ...base, assets: { ...base.assets, plate: 'https://evil.example/x.jpg' } }, 'creator1') as any).error, /uploaded/);
    assert.match((cleanThemeInput({ ...base, title: 'Paw Patrol Party' }, 'creator1') as any).error, /brands/);
    assert.match((cleanThemeInput({ ...base, preset: 'nope' }, 'creator1') as any).error, /style/);
    assert.match((cleanThemeInput({ ...base, access: 'paid', priceCents: 20 }, 'creator1') as any).error, /lowest price/);
    const s = cleanThemeInput({ ...base, access: 'sanctuary', tags: ['#Garden', 'garden', 'Night!'] }, 'creator1') as any;
    assert.equal(s.value.sanctuaryId, 'creator1', 'a theme can only be gated behind the creator’s own Sanctuary');
    assert.deepEqual(s.value.tags, ['garden', 'night']);
    assert.equal(brandFlag('Mario’s 40th'), null, 'ordinary first names are fine');
  });
  test('image helpers', () => {
    const flat = new Array(72).fill(100);
    assert.equal(dhashFromGray(flat), '0000000000000000');
    assert.equal(hamming64('0000000000000000', '000000000000000f'), 4);
    const w = 2, h = 10, px = new Uint8ClampedArray(w * h * 4).fill(255);
    assert.equal(isLightBottom(px, w, h), true);
    assert.equal(isLightBottom(new Uint8ClampedArray(w * h * 4), w, h), false);
    const c = coverCrop(1000, 1000); assert.equal(Math.round(c.sw), 663); assert.equal(c.sy, 0);
  });
  test('market search and sort', () => {
    const a = T({ id: 'aaaaaaaaaa', title: 'Night Garden', tags: ['garden'], uses: 3, createdAt: 1 });
    const b = T({ id: 'bbbbbbbbbb', title: 'Neon Kaiju', preset: 'kids_kaiju', uses: 9, createdAt: 2, access: 'paid', priceCents: 300 });
    assert.deepEqual(filterMarket([a, b]).map(t => t.id), ['bbbbbbbbbb', 'aaaaaaaaaa']);
    assert.deepEqual(filterMarket([a, b], { sort: 'new' }).map(t => t.id), ['bbbbbbbbbb', 'aaaaaaaaaa']);
    assert.deepEqual(filterMarket([a, b], { q: 'garden' }).map(t => t.id), ['aaaaaaaaaa']);
    assert.deepEqual(filterMarket([a, b], { access: 'paid' }).map(t => t.id), ['bbbbbbbbbb']);
  });
});

// ── Server flow ─────────────────────────────────────────────────────────────

function harness(opts: { withEvites?: boolean; extra?: Record<string, any> } = {}) {
  const db = new Map<string, Record<string, any>>();
  const routes: Record<string, any> = {};
  const stripeCalls: any[] = [];
  const sessions = new Map<string, any>();
  const reg = (m: string) => (path: string, ...h: any[]) => { routes[`${m} ${path}`] = h; };
  const app = { get: reg('GET'), post: reg('POST') };
  const express = { json: () => (_q: any, _s: any, n: any) => n() };
  const deps: any = {
    app, express, rateLimit: () => (_q: any, _s: any, n: any) => n(), authMiddleware: (_q: any, _s: any, n: any) => n(),
    firestoreRead: async (c: string, id: string) => db.get(`${c}/${id}`) || null,
    firestoreWrite: async (c: string, id: string, data: any) => { db.set(`${c}/${id}`, { ...(db.get(`${c}/${id}`) || {}), ...data }); },
    firestoreCreateOnce: async (c: string, id: string, data: any) => { if (db.has(`${c}/${id}`)) return 'exists' as const; db.set(`${c}/${id}`, data); return 'created' as const; },
    firestoreDeleteDoc: async (c: string, id: string) => { db.delete(`${c}/${id}`); },
    fsQueryDocs: async (c: string, f: any[]) => [...db.entries()].filter(([k, v]) => k.startsWith(c + '/') && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.slice(c.length + 1), data: v })),
    getStripe: () => ({
      accounts: { retrieve: async (id: string) => ({ id, payouts_enabled: id !== 'acct_nopayouts' }) },
      checkout: { sessions: {
        create: async (a: any) => { stripeCalls.push(a); const id = `cs_test_${stripeCalls.length}`; sessions.set(id, { id, payment_status: 'paid', metadata: a.metadata, amount_total: a.line_items[0].price_data.unit_amount, payment_intent: 'pi_' + id }); return { id, url: 'https://checkout.stripe.test/' + id }; },
        retrieve: async (id: string) => sessions.get(id),
      } },
    }),
    trustedRequestOrigin: () => 'https://plajah.com',
    ...(opts.extra || {}),
  };
  registerEviteThemeRoutes(deps);
  if (opts.withEvites) registerEviteRoutes({ ...deps, mayUseTemplate: (uid: string, t: string) => mayUseTemplate(deps, uid, t), resolveArt: (t: string) => resolveArt(deps, t) });
  const call = async (key: string, req: any) => {
    let status = 200, body: any;
    const res: any = { status(c: number) { status = c; return this; }, json(b: any) { body = b; return this; }, send(b: any) { body = b; return this; }, set() { return this; }, type() { return this; } };
    const handlers = routes[key]; if (!handlers) throw new Error('no route ' + key);
    const fullReq = { params: {}, query: {}, body: {}, headers: {}, ...req };
    // run the middleware chain (auth/registered/limiters are pass-through or real checks)
    let i = 0; const next = async (): Promise<void> => { const h = handlers[i++]; if (h) await h(fullReq, res, next); };
    await next();
    return { status, body };
  };
  db.set('users/creator1', { displayName: 'Ada Lovelace', username: 'ada' });
  db.set('users/buyer1', { displayName: 'Bea', username: 'bea' });
  db.set('users/friend1', { displayName: 'Cy', username: 'cy' });
  db.set('users/fan1', { displayName: 'Fan', username: 'fan' });
  const make = async (over: Record<string, any> = {}, uid = 'creator1') => {
    const s = await call('POST /api/evite-themes/save', { uid, body: { title: 'Night Garden', description: 'Moonlit florals I painted.', tags: ['garden', 'night'], preset: 'wedding', foil: '#e8c46c', assets: assetsOf(uid), access: 'free', ...over } });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    return s.body.theme.id as string;
  };
  const publish = (id: string, uid = 'creator1') => call('POST /api/evite-themes/publish', { uid, body: { id, attest: true } });
  return { db, call, stripeCalls, sessions, deps, make, publish };
}

describe('server: create, publish, market', () => {
  test('drafts are invisible; publishing needs the attestation; then it is in the market', async () => {
    const h = harness();
    const id = await h.make();
    assert.equal((await h.call('POST /api/evite-themes/market', { body: {} })).body.items.length, 0);
    assert.equal((await h.call('GET /api/evite-themes/:id', { params: { id } })).status, 404);
    assert.equal(await mayUseTemplate(h.deps, 'creator1', themeTemplateId(id)), false, 'a draft is not usable yet');
    assert.equal(await resolveArt(h.deps, themeTemplateId(id)), null);
    const noAttest = await h.call('POST /api/evite-themes/publish', { uid: 'creator1', body: { id } });
    assert.equal(noAttest.status, 400); assert.equal(noAttest.body.code, 'ATTEST');
    assert.equal((await h.call('POST /api/evite-themes/publish', { uid: 'buyer1', body: { id, attest: true } })).status, 404, 'only the creator publishes');
    const p = await h.publish(id);
    assert.equal(p.status, 200); assert.match(p.body.link, /evite_theme=/);
    const m = await h.call('POST /api/evite-themes/market', { body: { q: 'garden' } });
    assert.equal(m.body.items.length, 1); assert.equal(m.body.items[0].templateId, `theme:${id}`); assert.equal(m.body.items[0].ownerName, 'Ada Lovelace');
    assert.equal(m.body.items[0].attestation, undefined, 'internal fields stay server-side');
    const art = await resolveArt(h.deps, themeTemplateId(id));
    assert.equal(art?.preset, 'wedding'); assert.equal(art?.foil, '#E8C46C'); assert.match(art!.plate, /plate\.jpg/);
    assert.equal(await resolveArt(h.deps, 'wedding/olive'), null);
  });

  test('anonymous accounts cannot create', async () => {
    const h = harness();
    const r = await h.call('POST /api/evite-themes/save', { uid: 'anon', isAnonymous: true, body: { title: 'X y', preset: 'wedding', assets: assetsOf('anon') } });
    assert.equal(r.status, 403);
  });

  test('private themes: invisible to others, usable by the creator, art still renders on the creator’s invite', async () => {
    const h = harness();
    const id = await h.make({ access: 'private' });
    await h.publish(id);
    assert.equal((await h.call('POST /api/evite-themes/market', { body: {} })).body.items.length, 0);
    assert.equal((await h.call('GET /api/evite-themes/:id', { params: { id } })).status, 404);
    assert.equal((await h.call('POST /api/evite-themes/claim', { uid: 'buyer1', body: { id } })).status, 404);
    assert.equal(await mayUseTemplate(h.deps, 'buyer1', themeTemplateId(id)), false);
    assert.equal(await mayUseTemplate(h.deps, 'creator1', themeTemplateId(id)), true);
    assert.ok(await resolveArt(h.deps, themeTemplateId(id)));
    const usable = await h.call('POST /api/evite-themes/usable', { uid: 'creator1' });
    assert.equal(usable.body.items.length, 1); assert.equal(usable.body.items[0].why, 'mine');
  });

  test('free: claim saves it to the library; uses counts distinct people', async () => {
    const h = harness();
    const id = await h.make(); await h.publish(id);
    const c = await h.call('POST /api/evite-themes/claim', { uid: 'buyer1', body: { id } });
    assert.equal(c.status, 200); assert.equal(c.body.templateId, `theme:${id}`); assert.equal(c.body.art.preset, 'wedding');
    assert.equal(await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`), true);
    await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`);
    await mayUseTemplate(h.deps, 'friend1', `theme:${id}`);
    await mayUseTemplate(h.deps, 'creator1', `theme:${id}`);
    assert.equal(h.db.get(`evite_themes/${id}`)!.uses, 2);
    const mine = await h.call('POST /api/evite-themes/mine', { uid: 'buyer1' });
    assert.equal(mine.body.licenses.length, 1); assert.equal(mine.body.licenses[0].license.transferable, false);
  });

  test('look-alike art from another creator is refused', async () => {
    const h = harness();
    const a = await h.make({ dhash: '0f0f0f0f0f0f0f0f' }); await h.publish(a);
    const b = await h.make({ dhash: '0f0f0f0f0f0f0f0e' }, 'buyer1');
    const p = await h.publish(b, 'buyer1');
    assert.equal(p.status, 409); assert.equal(p.body.code, 'LOOKALIKE');
  });

  test('publishing freezes the files into a server-owned path when an uploader is wired', async () => {
    const uploaded: string[] = [];
    const h = harness({ extra: {
      uploadThemeFile: async (p: string) => { uploaded.push(p); return `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(p)}?alt=media&token=z`; },
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).buffer }),
    } });
    const id = await h.make(); const p = await h.publish(id);
    assert.equal(p.status, 200);
    assert.equal(uploaded.length, 3);
    assert.ok(uploaded.every(u => u.startsWith(`evite-themes/${id}/`)));
    assert.match((await resolveArt(h.deps, `theme:${id}`))!.plate, new RegExp(`evite-themes%2F${id}%2F`));
  });
});

describe('server: paid themes', () => {
  test('publishing a paid theme needs payouts; checkout is a destination charge with a 5% fee', async () => {
    const h = harness();
    const id = await h.make({ access: 'paid', priceCents: 1200 });
    const noAcct = await h.publish(id);
    assert.equal(noAcct.status, 409); assert.equal(noAcct.body.code, 'NO_PAYOUTS');
    h.db.set('users/creator1', { ...h.db.get('users/creator1'), stripeConnectAccountId: 'acct_ada' });
    assert.equal((await h.publish(id)).status, 200);

    assert.equal(await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`), false, 'not before buying');
    assert.equal((await h.call('POST /api/evite-themes/claim', { uid: 'buyer1', body: { id } })).status, 402);
    assert.equal((await h.call('POST /api/evite-themes/checkout', { uid: 'creator1', body: { id } })).status, 400, 'not your own');

    const co = await h.call('POST /api/evite-themes/checkout', { uid: 'buyer1', body: { id } });
    assert.equal(co.status, 200); assert.match(co.body.url, /^https:\/\/checkout\.stripe\.test\//);
    const s = h.stripeCalls[0];
    assert.equal(s.mode, 'payment');
    assert.equal(s.line_items[0].price_data.unit_amount, 1200, 'price from Firestore, never the client');
    assert.equal(s.payment_intent_data.application_fee_amount, 60);
    assert.equal(s.payment_intent_data.transfer_data.destination, 'acct_ada');
    assert.deepEqual(s.metadata, { type: 'evite_theme', themeId: id, buyerUid: 'buyer1', ownerUid: 'creator1', priceCents: '1200', platformFeeCents: '60' });
    assert.deepEqual(s.payment_intent_data.metadata, s.metadata);
    assert.match(s.success_url, /theme_session=\{CHECKOUT_SESSION_ID\}/);
  });

  test('creator without payouts enabled: checkout refused', async () => {
    const h = harness();
    h.db.set('users/creator1', { ...h.db.get('users/creator1'), stripeConnectAccountId: 'acct_nopayouts' });
    const id = await h.make({ access: 'paid', priceCents: 500 }); await h.publish(id);
    assert.equal((await h.call('POST /api/evite-themes/checkout', { uid: 'buyer1', body: { id } })).status, 409);
  });

  test('webhook grants the licence once per session; unpaid and foreign sessions ignored; confirm covers a slow webhook', async () => {
    const h = harness();
    h.db.set('users/creator1', { ...h.db.get('users/creator1'), stripeConnectAccountId: 'acct_ada' });
    const id = await h.make({ access: 'paid', priceCents: 800 }); await h.publish(id);
    await h.call('POST /api/evite-themes/checkout', { uid: 'buyer1', body: { id } });
    const session = h.sessions.get('cs_test_1');
    assert.equal(await recordThemePurchase(h.deps, { ...session, payment_status: 'unpaid' }), 'ignored');
    assert.equal(await recordThemePurchase(h.deps, { id: 'x', metadata: { type: 'evite_gift' } }), 'ignored');
    // buyer returns before the webhook: /confirm records it
    const conf = await h.call('POST /api/evite-themes/confirm', { uid: 'buyer1', body: { sessionId: 'cs_test_1' } });
    assert.equal(conf.body.licensed, true); assert.equal(conf.body.templateId, `theme:${id}`);
    assert.equal((await h.call('POST /api/evite-themes/confirm', { uid: 'friend1', body: { sessionId: 'cs_test_1' } })).status, 404, 'someone else’s session');
    assert.equal(await recordThemePurchase(h.deps, session), 'exists', 'the webhook arriving later is a no-op');
    assert.equal(await recordThemePurchase(h.deps, session), 'exists');
    assert.equal(h.db.get(`evite_themes/${id}`)!.sales, 1);
    assert.equal([...h.db.keys()].filter(k => k.startsWith('evite_theme_sales/')).length, 1);
    assert.equal(await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`), true);
    assert.equal((await h.call('POST /api/evite-themes/checkout', { uid: 'buyer1', body: { id } })).body.code, 'OWNED');
    const st = await h.call('POST /api/evite-themes/stats', { uid: 'creator1' });
    assert.deepEqual([st.body.totals.sales, st.body.totals.grossCents, st.body.totals.platformFeeCents, st.body.totals.creatorCents, st.body.totals.holders], [1, 800, 40, 760, 1]);
  });

  test('licence transfer ("trade"): moves once, the giver loses it, a webhook retry never brings it back', async () => {
    const h = harness();
    h.db.set('users/creator1', { ...h.db.get('users/creator1'), stripeConnectAccountId: 'acct_ada' });
    const id = await h.make({ access: 'paid', priceCents: 800 }); await h.publish(id);
    await h.call('POST /api/evite-themes/checkout', { uid: 'buyer1', body: { id } });
    const session = h.sessions.get('cs_test_1');
    assert.equal(await recordThemePurchase(h.deps, session), 'created');

    assert.equal((await h.call('POST /api/evite-themes/gift', { uid: 'buyer1', body: { id, to: '@nobody' } })).status, 404);
    assert.equal((await h.call('POST /api/evite-themes/gift', { uid: 'buyer1', body: { id, to: '@ada' } })).status, 400, 'not to the creator');
    const g = await h.call('POST /api/evite-themes/gift', { uid: 'buyer1', body: { id, to: '@cy' } });
    assert.equal(g.status, 200); assert.equal(g.body.transferred, true);
    assert.equal(await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`), false);
    assert.equal(await mayUseTemplate(h.deps, 'friend1', `theme:${id}`), true);
    assert.equal((await h.call('POST /api/evite-themes/gift', { uid: 'buyer1', body: { id, to: '@fan' } })).status, 403, 'nothing left to give');
    assert.equal(await recordThemePurchase(h.deps, session), 'exists');
    assert.equal(h.db.get(`evite_theme_licenses/buyer1__${id}`)!.status, 'transferred', 'retry did not resurrect it');
    // the receiver can pass it on again
    assert.equal((await h.call('POST /api/evite-themes/gift', { uid: 'friend1', body: { id, to: '@fan' } })).status, 200);
    assert.equal(await mayUseTemplate(h.deps, 'fan1', `theme:${id}`), true);
    // the creator can grant one outright (comp), without a sale
    const comp = await h.call('POST /api/evite-themes/gift', { uid: 'creator1', body: { id, to: 'bea' } });
    assert.equal(comp.body.granted, true);
    assert.equal(await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`), true);
  });

  test('a licence can only move once even if two gifts race', async () => {
    const h = harness();
    const id = await h.make({ access: 'private' }); await h.publish(id);
    await h.call('POST /api/evite-themes/gift', { uid: 'creator1', body: { id, to: 'bea' } });
    const [a, b] = await Promise.all([
      h.call('POST /api/evite-themes/gift', { uid: 'buyer1', body: { id, to: 'cy' } }),
      h.call('POST /api/evite-themes/gift', { uid: 'buyer1', body: { id, to: 'fan' } }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const holders = ['friend1', 'fan1'].filter(u => h.db.get(`evite_theme_licenses/${u}__${id}`)?.status === 'active');
    assert.equal(holders.length, 1);
  });
});

describe('server: sanctuary, removal, shop', () => {
  test('sanctuary themes follow live membership', async () => {
    const h = harness();
    const id = await h.make({ access: 'sanctuary' }); await h.publish(id);
    assert.equal((await h.call('POST /api/evite-themes/claim', { uid: 'fan1', body: { id } })).status, 403);
    h.db.set('sanctuaryMemberships/creator1_fan1', { creatorId: 'creator1', memberId: 'fan1', status: 'ACTIVE', tierId: 't1' });
    assert.equal(await mayUseTemplate(h.deps, 'fan1', `theme:${id}`), true);
    assert.equal((await h.call('POST /api/evite-themes/claim', { uid: 'fan1', body: { id } })).status, 200);
    const usable = await h.call('POST /api/evite-themes/usable', { uid: 'fan1' });
    assert.equal(usable.body.items[0].why, 'member');
    h.db.set('sanctuaryMemberships/creator1_fan1', { creatorId: 'creator1', memberId: 'fan1', status: 'PAUSED', tierId: 't1' });
    assert.equal(await mayUseTemplate(h.deps, 'fan1', `theme:${id}`), false, 'a lapsed member’s bookmark grants nothing');
    assert.equal((await h.call('POST /api/evite-themes/usable', { uid: 'fan1' })).body.items.length, 0);
    assert.equal((await h.call('POST /api/evite-themes/gift', { uid: 'fan1', body: { id, to: 'cy' } })).status, 403, 'member access cannot be passed on');
  });

  test('removed themes are unusable everywhere; sold themes need a confirm', async () => {
    const h = harness();
    h.db.set('users/creator1', { ...h.db.get('users/creator1'), stripeConnectAccountId: 'acct_ada' });
    const id = await h.make({ access: 'paid', priceCents: 500 }); await h.publish(id);
    await h.call('POST /api/evite-themes/checkout', { uid: 'buyer1', body: { id } });
    await recordThemePurchase(h.deps, h.sessions.get('cs_test_1'));
    const r1 = await h.call('POST /api/evite-themes/remove', { uid: 'creator1', body: { id } });
    assert.equal(r1.status, 409); assert.equal(r1.body.code, 'HAS_BUYERS');
    // unlisting keeps it working for buyers
    await h.call('POST /api/evite-themes/listing', { uid: 'creator1', body: { id, listed: false } });
    assert.equal((await h.call('POST /api/evite-themes/market', { body: {} })).body.items.length, 0);
    assert.equal(await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`), true);
    assert.equal((await h.call('POST /api/evite-themes/checkout', { uid: 'friend1', body: { id } })).status, 410);
    assert.equal((await h.call('POST /api/evite-themes/remove', { uid: 'creator1', body: { id, confirm: true } })).status, 200);
    assert.equal(await mayUseTemplate(h.deps, 'buyer1', `theme:${id}`), false);
    assert.equal(await mayUseTemplate(h.deps, 'creator1', `theme:${id}`), false);
    assert.equal(await resolveArt(h.deps, `theme:${id}`), null);
    assert.equal((await h.call('POST /api/evite-themes/mine', { uid: 'buyer1' })).body.licenses.length, 0);
    assert.equal((await h.call('POST /api/evite-themes/save', { uid: 'creator1', body: { id, title: 'Back again' } })).status, 404);
  });

  test('shop listing is off until the store hook is wired; the hook grants licences once', async () => {
    const h = harness();
    h.db.set('users/creator1', { ...h.db.get('users/creator1'), stripeConnectAccountId: 'acct_ada' });
    const id = await h.make({ access: 'paid', priceCents: 700 }); await h.publish(id);
    assert.equal((await h.call('POST /api/evite-themes/list-in-shop', { uid: 'creator1', body: { id } })).status, 501);
    h.deps.shopListing = true;
    const h2 = harness({ extra: { shopListing: true } });
    h2.db.set('users/creator1', { ...h2.db.get('users/creator1'), stripeConnectAccountId: 'acct_ada' });
    const id2 = await h2.make({ access: 'paid', priceCents: 700 }); await h2.publish(id2);
    const l = await h2.call('POST /api/evite-themes/list-in-shop', { uid: 'creator1', body: { id: id2 } });
    assert.equal(l.status, 200);
    const prod = h2.db.get(`storeProducts/${l.body.productId}`)!;
    assert.equal(prod.isDigital, true); assert.equal(prod.price, 7); assert.equal(prod.linkedAssetId, `theme:${id2}`); assert.equal(prod.sellerId, 'creator1');
    const order = { orderId: 'so_1', buyerUid: 'buyer1', sellerUid: 'creator1', items: [{ productId: l.body.productId }] };
    assert.equal(await grantThemeLicensesForStoreOrder(h2.deps, order), 1);
    assert.equal(await grantThemeLicensesForStoreOrder(h2.deps, order), 0, 'idempotent');
    assert.equal(await grantThemeLicensesForStoreOrder(h2.deps, { ...order, orderId: 'so_2', sellerUid: 'someoneelse' }), 0, 'a shop can only sell its own themes');
    assert.equal(await mayUseTemplate(h2.deps, 'buyer1', `theme:${id2}`), true);
  });
});

describe('server: wired into the evite routes', () => {
  test('a host can save an invite with a theme they may use, guests see its art', async () => {
    const h = harness({ withEvites: true });
    const id = await h.make(); await h.publish(id);
    const base = { fields: { headline: 'Garden party', hostName: 'Bea', startsAt: Date.UTC(2026, 10, 1, 18) }, status: 'live' };
    const saved = await h.call('POST /api/evite/save', { uid: 'buyer1', body: { ...base, templateId: `theme:${id}` } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const pub = await h.call('GET /api/evite/:id/public', { params: { id: saved.body.invite.id } });
    assert.equal(pub.body.invite.art.preset, 'wedding');
    assert.match(pub.body.invite.art.plate, /plate\.jpg/);

    const pid = await h.make({ access: 'private' }); await h.publish(pid);
    assert.equal((await h.call('POST /api/evite/save', { uid: 'buyer1', body: { ...base, templateId: `theme:${pid}` } })).status, 400, 'someone else’s private theme');
    assert.equal((await h.call('POST /api/evite/save', { uid: 'buyer1', body: { ...base, templateId: 'theme:zzzzzzzzzz' } })).status, 400);
  });
});
