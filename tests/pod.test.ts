import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { PDFDocument, PDFName } from 'pdf-lib';
import { spineWidthIn, coverDimensions, gutterIn, preflight, luluPodPackageId, paddedPageCount, pageLimits, spineTextMinPages } from '../services/pod/printSpec';
import { ean13CheckDigit, ean13Modules, normalizeIsbn13 } from '../services/pod/barcode';
import { computeRoyalty, minimumListPriceCents, priceIsViable } from '../services/pod/royalty';
import { LuluProvider, verifyLuluHmac } from '../services/pod/providers/lulu';
import { buildInteriorPdf } from '../services/pod/interiorPdf';
import { buildCoverPdf } from '../services/pod/coverPdf';
import { buildMetadataCsv, buildOnix } from '../services/pod/providers/exportPack';

test('spine: Lulu paperback = pages/444 + 0.06', () => {
  assert.equal(spineWidthIn('lulu', 'PERFECT_PAPERBACK', 444, 'white', 60).value, 1.06);
  assert.equal(spineWidthIn('lulu', 'PERFECT_PAPERBACK', 300, 'white', 60).value, 0.7357);
  assert.equal(spineWidthIn('lulu', 'PERFECT_PAPERBACK', 300, 'white', 60).verified, true);
});
test('spine: Lulu hardcover table + saddle stitch none', () => {
  assert.equal(spineWidthIn('lulu', 'HARDCOVER_CASEWRAP', 300, 'white', 60).value, 0.9375);
  assert.equal(spineWidthIn('lulu', 'HARDCOVER_CASEWRAP', 84, 'white', 60).value, 0.25);
  assert.equal(spineWidthIn('lulu', 'HARDCOVER_CASEWRAP', 85, 'white', 60).value, 0.5);
  assert.equal(spineWidthIn('lulu', 'HARDCOVER_CASEWRAP', 10, 'white', 60).value, null);
  assert.equal(spineWidthIn('lulu', 'SADDLE_STITCH', 32, 'white', 60).value, 0);
});
test('spine: KDP and Ingram per-page constants; Ingram rounds to even; hardcover not encoded', () => {
  assert.equal(spineWidthIn('kdp', 'PERFECT_PAPERBACK', 300, 'cream', 60).value, 0.75);
  assert.equal(spineWidthIn('kdp', 'PERFECT_PAPERBACK', 300, 'white', 60).value, 0.6756);
  assert.equal(spineWidthIn('ingramspark', 'PERFECT_PAPERBACK', 301, 'white', 50).value, spineWidthIn('ingramspark', 'PERFECT_PAPERBACK', 302, 'white', 50).value);
  assert.equal(spineWidthIn('ingramspark', 'HARDCOVER_CASEWRAP', 300, 'white', 50).value, null);
  assert.equal(spineWidthIn('ingramspark', 'PERFECT_PAPERBACK', 300, 'white', 50).verified, false);
});
test('cover wrap: bleed + back + spine + front + bleed, 300 dpi px', () => {
  const d = coverDimensions('lulu', 'PERFECT_PAPERBACK', '6x9', 300, 'white', 60)!;
  assert.equal(d.widthIn, Math.round((0.25 + 12 + 0.7357) * 10000) / 10000);
  assert.equal(d.heightIn, 9.25);
  assert.equal(d.widthPx, Math.round(d.widthIn * 300));
  assert.equal(d.heightPx, 2775);
  assert.equal(d.spineX0In, 0.125 + 6);
  assert.equal(d.frontX0In, 0.125 + 6 + 0.7357);
  assert.equal(d.estimated, false);
  assert.equal(coverDimensions('lulu', 'HARDCOVER_CASEWRAP', '6x9', 300, 'white', 60)!.estimated, true);
  assert.equal(coverDimensions('lulu', 'HARDCOVER_CASEWRAP', '6x9', 10, 'white', 60), null);
});
test('gutter grows with page count', () => {
  assert.equal(gutterIn(100), 0.375); assert.equal(gutterIn(200), 0.5); assert.equal(gutterIn(400), 0.625); assert.equal(gutterIn(800), 0.875);
});
test('preflight + padding + lulu package id', () => {
  assert.ok(preflight('lulu', 'PERFECT_PAPERBACK', '6x9', 10, 'white', 60).some(m => m.level === 'error'));
  assert.ok(preflight('lulu', 'PERFECT_PAPERBACK', '7x10', 100, 'white', 60).some(m => m.level === 'error' && /Lulu/.test(m.text)));
  assert.ok(preflight('lulu', 'PERFECT_PAPERBACK', '6x9', 60, 'white', 60).some(m => /spine will be left blank/.test(m.text)));
  assert.equal(paddedPageCount(33, pageLimits('lulu', 'PERFECT_PAPERBACK')), 34);
  assert.equal(paddedPageCount(9, pageLimits('lulu', 'SADDLE_STITCH')), 12);
  assert.equal(luluPodPackageId('6x9', 'PERFECT_PAPERBACK', 'white', 60, false, { glossy: true }), '0600X0900BWSTDPB060UW444GXX');
  assert.equal(luluPodPackageId('6x9', 'PERFECT_PAPERBACK', 'cream', 60, false, { dotted: true }), '0600X0900.BW.STD.PB.060UC444.MXX');
  assert.equal(luluPodPackageId('7x10', 'PERFECT_PAPERBACK', 'white', 60, false), null);
  assert.equal(spineTextMinPages('kdp').value, 80);
});

test('barcode: ISBN check digit and EAN-13 modules', () => {
  assert.equal(ean13CheckDigit('978030640615'), 7);
  assert.equal(normalizeIsbn13('978-0-306-40615-7'), '9780306406157');
  assert.equal(normalizeIsbn13('9780306406158'), null);
  assert.equal(normalizeIsbn13('1234567890128'), null); // valid EAN, not Bookland
  const m = ean13Modules('9780306406157');
  assert.equal(m.length, 95);
  assert.equal(m.slice(0, 3), '101'); assert.equal(m.slice(45, 50), '01010'); assert.equal(m.slice(92), '101');
  // first digit 9 => left parity LGGLLG : second digit '7' with L is 0111011, digit 8 with G is 0001001
  assert.equal(m.slice(3, 10), '0111011'); assert.equal(m.slice(10, 17), '0001001');
  // structural invariants of the code tables, for several numbers
  const ones = (s: string) => [...s].filter(c => c === '1').length;
  for (const isbn of ['9780306406157', '9781234567897', '9791090636071', '4006381333931']) {
    const mm = ean13Modules(isbn);
    assert.equal(mm.length, 95);
    for (let i = 0; i < 6; i++) { const g = mm.slice(3 + i * 7, 10 + i * 7); assert.ok(g.startsWith('0') && g.endsWith('1')); }
    for (let i = 0; i < 6; i++) { const g = mm.slice(50 + i * 7, 57 + i * 7); assert.ok(g.startsWith('1') && g.endsWith('0')); assert.equal(ones(g) % 2, 0); }
  }
  assert.throws(() => ean13Modules('9780306406158'));
});

test('royalty: breakdown and minimum price makes profit >= 0', () => {
  const r = computeRoyalty({ listPriceCents: 1999, printCostCents: 600 });
  assert.equal(r.platformCutCents, 100);                       // 5% of 19.99 = 0.9995 -> 100
  assert.equal(r.cardFeeCents, Math.round(1999 * 0.029) + 30);
  assert.equal(r.authorProfitCents, 1999 - 600 - 100 - r.cardFeeCents);
  for (const print of [250, 600, 1234, 4000]) {
    const min = minimumListPriceCents(print, 399, 40);
    assert.ok(computeRoyalty({ listPriceCents: min, printCostCents: print, shippingCents: 399, taxCents: 40 }).authorProfitCents >= 0);
    assert.ok(computeRoyalty({ listPriceCents: min - 1, printCostCents: print, shippingCents: 399, taxCents: 40 }).authorProfitCents < 0);
  }
  assert.equal(priceIsViable(500, 600), false);
});

test('webhook: Lulu HMAC over the raw body', () => {
  const body = Buffer.from('{"topic":"PRINT_JOB_STATUS_CHANGED","data":{"id":1}}');
  const good = crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.equal(verifyLuluHmac(body, { 'lulu-hmac-sha256': good }, 's3cret'), true);
  assert.equal(verifyLuluHmac(body, { 'lulu-hmac-sha256': good }, 'other'), false);
  assert.equal(verifyLuluHmac(Buffer.from(body.toString() + ' '), { 'lulu-hmac-sha256': good }, 's3cret'), false);
  assert.equal(verifyLuluHmac(body, {}, 's3cret'), false);
  assert.equal(verifyLuluHmac(body, { 'lulu-hmac-sha256': 'zz' }, 's3cret'), false);
  assert.equal(verifyLuluHmac(body, { 'lulu-hmac-sha256': good }, ''), false);
});

function mockFetch(handlers: Array<(url: string, init: any) => { status: number; body: any } | undefined>) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = async (url: string, init: any) => {
    calls.push({ url, init });
    for (const h of handlers) { const r = h(url, init); if (r) return { ok: r.status < 300, status: r.status, text: async () => typeof r.body === 'string' ? r.body : JSON.stringify(r.body) }; }
    return { ok: false, status: 404, text: async () => '{}' };
  };
  return { impl, calls };
}
const tokenH = (url: string) => url.includes('openid-connect/token') ? { status: 200, body: { access_token: 'tok1', expires_in: 3600 } } : undefined;
const edition = { trimId: '6x9', binding: 'PERFECT_PAPERBACK' as const, paperColor: 'white' as const, paperWeight: 60 as const, listPriceCents: 1999, printer: 'lulu' as const };
const addr = { name: 'A B', street1: '1 Main', city: 'Austin', stateCode: 'TX', postcode: '78701', countryCode: 'US', phone: '5125550100', email: 'a@b.co' };

test('Lulu provider: token cache, quote parse, sandbox host', async () => {
  const m = mockFetch([tokenH, (u) => u.endsWith('/print-job-cost-calculations/') ? { status: 200, body: {
    currency: 'USD', total_cost_incl_tax: '9.80', total_tax: '0.50', line_item_costs: [{ total_cost_excl_tax: '4.20' }], shipping_cost: { total_cost_excl_tax: '4.00' }, fulfillment_cost: { total_cost_excl_tax: '1.10' } } } : undefined]);
  const p = new LuluProvider({ clientKey: 'k', clientSecret: 's', sandbox: true, fetchImpl: m.impl as any });
  const q = await p.quote({ edition, pageCount: 300, quantity: 1, address: addr, shippingLevel: 'MAIL' });
  await p.quote({ edition, pageCount: 300, quantity: 1, address: addr, shippingLevel: 'MAIL' });
  assert.equal(q.printCostCents, 420); assert.equal(q.shippingCents, 400); assert.equal(q.fulfillmentCents, 110); assert.equal(q.taxCents, 50); assert.equal(q.totalCents, 980);
  assert.equal(q.podPackageId, '0600X0900BWSTDPB060UW444MXX');
  assert.equal(m.calls.filter(c => c.url.includes('openid-connect')).length, 1);           // token cached
  assert.ok(m.calls[0].url.startsWith('https://api.sandbox.lulu.com/'));
  assert.match(m.calls[0].init.headers.Authorization, /^Basic /);
  assert.match(m.calls[1].init.headers.Authorization, /^Bearer tok1$/);
});

test('Lulu provider: create job payload, status mapping, retries on 5xx, 401 refresh, validation mapping', async () => {
  let hits = 0, seq = 0;
  const m = mockFetch([tokenH, (u, i) => {
    if (u.endsWith('/print-jobs/') && i.method === 'POST') {
      hits++;
      if (hits === 1) return { status: 503, body: {} };
      if (hits === 2) return { status: 401, body: {} };
      return { status: 201, body: { id: 77, status: { name: 'CREATED' }, line_items: [{ tracking_id: 'T1', tracking_urls: ['https://t'] }] } };
    }
    return undefined;
  }]);
  const p = new LuluProvider({ clientKey: 'k', clientSecret: 's', sandbox: false, fetchImpl: m.impl as any, sleep: async () => { seq++; } });
  const st = await p.createPrintJob({ externalId: 'ord_1', edition, pageCount: 300, quantity: 2, title: 'T', interiorUrl: 'https://x/i.pdf', coverUrl: 'https://x/c.pdf', address: addr, shippingLevel: 'GROUND' });
  assert.equal(st.providerJobId, '77'); assert.equal(st.status, 'created'); assert.equal(st.trackingId, 'T1');
  assert.equal(seq, 1);
  const post = m.calls.filter(c => c.url.endsWith('/print-jobs/')).pop()!;
  const body = JSON.parse(post.init.body);
  assert.equal(body.external_id, 'ord_1'); assert.equal(body.shipping_level, 'GROUND'); assert.equal(body.line_items[0].quantity, 2);
  assert.equal(body.line_items[0].printable_normalization.interior.source_url, 'https://x/i.pdf');
  assert.ok(post.url.startsWith('https://api.lulu.com/'));
  assert.equal(m.calls.filter(c => c.url.includes('openid-connect')).length, 2);          // refreshed after 401
  const bad = mockFetch([tokenH, () => ({ status: 400, body: { detail: 'bad pdf' } })]);
  const p2 = new LuluProvider({ clientKey: 'k', clientSecret: 's', fetchImpl: bad.impl as any });
  await assert.rejects(() => p2.getStatus('1'), (e: any) => e.code === 'LULU_VALIDATION' && /bad pdf/.test(e.message));
  assert.equal(p.toStatus({ id: 1, status: { name: 'SHIPPED' } }).status, 'shipped');
  assert.equal(p.toStatus({ id: 1, status: { name: 'REJECTED' } }).status, 'rejected');
  assert.equal(p.toStatus({ id: 1, status: { name: 'WAT' } }).status, 'unknown');
  await assert.rejects(() => new LuluProvider({ clientKey: '', clientSecret: '' }).getToken(), (e: any) => e.code === 'LULU_NOT_CONFIGURED');
});

test('interior PDF: front matter, recto chapter openers, even page count, embedded fonts', async () => {
  const para = 'It was a bright cold day in April, and the clocks were striking thirteen. '.repeat(12);
  const chapters = [1, 2, 3].map(n => ({ title: `Chapter title ${n}`, text: Array.from({ length: 14 }, () => para).join('\n\n') }));
  const r = await buildInteriorPdf({ title: 'Test Book', author: 'Ann Author', chapters, trimId: '5.5x8.5', binding: 'PERFECT_PAPERBACK', printer: 'lulu', isbn13: '9780306406157' });
  assert.equal(r.pageCount % 2, 0);
  assert.ok(r.pageCount >= 32);
  r.chapterStartPages.forEach(p => assert.equal(p % 2, 1, 'chapters open on recto'));
  const doc = await PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(), r.pageCount);
  const sz = doc.getPage(0).getSize();
  assert.equal(Math.round(sz.width), 396); assert.equal(Math.round(sz.height), 612);
  const embedded = [...doc.context.enumerateIndirectObjects()].filter(([, o]: any) => (o?.dict ?? o)?.has && (((o.dict ?? o).has(PDFName.of("FontFile2"))) || ((o.dict ?? o).has(PDFName.of("FontFile3"))))).length;
  assert.ok(embedded >= 1, 'fonts embedded');
});

test('interior PDF: skips unsupported glyphs with a warning, no-text chapters warn', async () => {
  const r = await buildInteriorPdf({ title: 'T', author: 'A', chapters: [{ title: 'One', text: 'Hello 世界 world' }], trimId: '6x9', binding: 'HARDCOVER_CASEWRAP', printer: 'lulu' });
  assert.ok(r.warnings.some(w => /replaced/.test(w)));
  const e = await buildInteriorPdf({ title: 'T', author: 'A', chapters: [], trimId: '6x9', binding: 'PERFECT_PAPERBACK', printer: 'lulu' });
  assert.ok(e.warnings.some(w => /No chapter/.test(w)));
});

test('cover PDF: size matches spec, spine text gated by page count, invalid ISBN warns', async () => {
  const a = await buildCoverPdf({ title: 'Test', author: 'Ann', backText: 'Back copy. '.repeat(30), isbn13: '9780306406157', printer: 'lulu', binding: 'PERFECT_PAPERBACK', trimId: '6x9', pageCount: 300, paperColor: 'white', paperWeight: 60, preview: true });
  const doc = await PDFDocument.load(a.bytes);
  assert.equal(Math.round(doc.getPage(0).getWidth()), Math.round(a.dims.widthIn * 72));
  assert.equal(a.spineTitleDrawn, true);
  const b = await buildCoverPdf({ title: 'Test', author: 'Ann', isbn13: '9780306406158', printer: 'lulu', binding: 'PERFECT_PAPERBACK', trimId: '6x9', pageCount: 60, paperColor: 'white', paperWeight: 60 });
  assert.equal(b.spineTitleDrawn, false);
  assert.ok(b.warnings.some(w => /Spine text omitted/.test(w)) && b.warnings.some(w => /ISBN/.test(w)));
});

test('export pack metadata', () => {
  const e: any = { ...edition, albumId: 'a1', ownerUid: 'u', title: 'A "Quoted" <T>', author: 'Ann', isbn13: '9780306406157', listedForSale: true, updatedAt: 0, printer: 'kdp' };
  assert.match(buildMetadataCsv(e, 300, 'Desc, with comma'), /"A ""Quoted"" <T>"/);
  const x = buildOnix(e, 300, 'D');
  assert.match(x, /A &quot;Quoted&quot; &lt;T&gt;/); assert.match(x, /<IDValue>9780306406157<\/IDValue>/); assert.match(x, /<ProductForm>BC<\/ProductForm>/);
});

// ---- router smoke (no Firestore/Stripe: only paths that do not touch them) ----
import express from 'express';
import http from 'node:http';
import { createPodRouter, verifyFileSig, signFile, dimsFromTotal, applyJobStatus } from '../routes/pod';

async function withApp(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use('/api/pod', createPodRouter({ authMiddleware: (_q: any, s: any) => s.status(401).json({ error: 'no' }), requireRegisteredUser: (_q: any, _s: any, n: any) => n(), getStripe: () => { throw new Error('no stripe'); }, trustedRequestOrigin: () => 'https://x.test' }));
  const srv = http.createServer(app); await new Promise<void>(r => srv.listen(0, r));
  try { await fn(`http://127.0.0.1:${(srv.address() as any).port}`); } finally { srv.close(); }
}

test('router: providers are honest about direct vs export', async () => {
  await withApp(async base => {
    const j: any = await (await fetch(`${base}/api/pod/providers`)).json();
    const by = Object.fromEntries(j.providers.map((p: any) => [p.id, p]));
    assert.equal(by.lulu.capabilities.directOrder, true); assert.equal(by.lulu.mode, 'direct');
    for (const id of ['kdp', 'ingramspark', 'draft2digital', 'blurb']) { assert.equal(by[id].capabilities.directOrder, false); assert.equal(by[id].mode, 'export'); assert.equal(by[id].capabilities.directPublish, false); }
    assert.equal(by.blurb.capabilities.requiresPartnership, true);
    assert.ok(by.kdp.guide.dashboardUrl.startsWith('https://'));
    const s: any = await (await fetch(`${base}/api/pod/spec?printer=lulu&binding=PERFECT_PAPERBACK&pages=300&trim=6x9`)).json();
    assert.equal(s.spine.value, 0.7357); assert.equal(s.cover.heightPx, 2775);
    assert.equal((await fetch(`${base}/api/pod/quote`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/api/pod/files/o1/interior.pdf?exp=1&sig=bad`)).status, 403);
    assert.equal((await fetch(`${base}/api/pod/webhook/lulu`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status, 401);
  });
});

test('signed file links: valid, tampered, expired', () => {
  process.env.POD_FILE_SECRET = 'file-secret';
  const exp = Date.now() + 60_000;
  const sig = signFile('o1', 'interior.pdf', exp);
  assert.equal(verifyFileSig('o1', 'interior.pdf', exp, sig), true);
  assert.equal(verifyFileSig('o2', 'interior.pdf', exp, sig), false);
  assert.equal(verifyFileSig('o1', 'cover.pdf', exp, sig), false);
  assert.equal(verifyFileSig('o1', 'interior.pdf', exp + 1, sig), false);
  const past = Date.now() - 1; assert.equal(verifyFileSig('o1', 'interior.pdf', past, signFile('o1', 'interior.pdf', past)), false);
});

test('order status application + hardcover dims from printer total', () => {
  const o: any = { status: 'submitted' };
  assert.deepEqual(applyJobStatus(o, { providerJobId: '1', status: 'shipped', rawStatus: 'SHIPPED', trackingId: 'T9' }), { changed: true, shippedNow: true });
  assert.equal(o.trackingId, 'T9');
  assert.equal(applyJobStatus(o, { providerJobId: '1', status: 'shipped', rawStatus: 'SHIPPED' }).shippedNow, false);
  const r: any = { status: 'submitted' }; applyJobStatus(r, { providerJobId: '1', status: 'rejected', rawStatus: 'REJECTED', message: 'bad file' });
  assert.equal(r.status, 'rejected'); assert.equal(r.needsAttention, true);
  const d = dimsFromTotal(14, 11, "6x9", 1);
  assert.equal(d.backX0In, 0.5); assert.equal(d.frontX0In, 0.5 + 6 + 1);
});
