import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_DVI_TEMPLATE, MEASURES, statusFromMeasure, newInspection, sanitizeInspection, summarize, recommendations, defaultPriority, priceRecommendation, priceAll,
  toPublicInspection, serializeInspection, parseInspection, sectionsOf, type Inspection,
} from '../services/inspectionCore';
import { buildAdvisorPrompt, buildFindings, validateAdvisorResponse, fallbackDraft, scrubPII } from '../services/advisorCore';

const base = (): Inspection => newInspection('tk1', undefined, 'Tech', 1000);
const withItems = (items: any, extra: any = {}): Inspection => sanitizeInspection({ items, ...extra }, base(), 2000);

describe('thresholds', () => {
  test('tread depth in 32nds: >=5 pass, 3-4 watch, <=2 fail', () => {
    const m = MEASURES.tread32;
    assert.equal(statusFromMeasure(m, 8), 'PASS'); assert.equal(statusFromMeasure(m, 5), 'PASS');
    assert.equal(statusFromMeasure(m, 4), 'WATCH'); assert.equal(statusFromMeasure(m, 3), 'WATCH');
    assert.equal(statusFromMeasure(m, 2), 'FAIL'); assert.equal(statusFromMeasure(m, 0), 'FAIL');
    assert.equal(statusFromMeasure(m, -1), 'UNSET'); assert.equal(statusFromMeasure(m, 99), 'UNSET');
  });
  test('brake pad mm and battery voltage', () => {
    assert.equal(statusFromMeasure(MEASURES.pad_mm, 2.5), 'FAIL'); assert.equal(statusFromMeasure(MEASURES.pad_mm, 4), 'WATCH');
    assert.equal(statusFromMeasure(MEASURES.voltage, 12.6), 'PASS'); assert.equal(statusFromMeasure(MEASURES.voltage, 12.3), 'WATCH'); assert.equal(statusFromMeasure(MEASURES.voltage, 11.9), 'FAIL');
  });
  test('template covers the required areas and ids are unique', () => {
    const secs = sectionsOf(AUTO_DVI_TEMPLATE).join('|').toLowerCase();
    for (const w of ['brakes', 'tires', 'fluids', 'belts', 'battery', 'lights', 'suspension', 'wipers']) assert.ok(secs.includes(w), w);
    const ids = AUTO_DVI_TEMPLATE.items.map(i => i.id); assert.equal(new Set(ids).size, ids.length);
  });
});

describe('sanitize', () => {
  test('drops unknown items, bad enums, non-https attachments; clamps', () => {
    const i = withItems({
      brk_front: { status: 'FAIL', measurement: 2, note: ' grinding ', attachments: [{ url: 'https://x/y.jpg', kind: 'image' }, { url: 'http://insecure/a.jpg' }, { url: 'javascript:alert(1)' }] },
      hacker: { status: 'FAIL' }, tire_lf: { status: 'BOGUS', measurement: 500 },
    });
    assert.deepEqual(Object.keys(i.items).sort(), ['brk_front', 'tire_lf']);
    assert.equal(i.items.brk_front.attachments.length, 1); assert.equal(i.items.brk_front.note, 'grinding');
    assert.equal(i.items.tire_lf.status, 'UNSET'); assert.equal(i.items.tire_lf.measurement, undefined);
  });
  test('complete flag sets completedAt once', () => {
    const a = sanitizeInspection({ items: {}, complete: true }, base(), 5000); assert.equal(a.completedAt, 5000);
    const b = sanitizeInspection({ items: {}, complete: true }, a, 9000); assert.equal(b.completedAt, 5000);
    assert.equal(sanitizeInspection({ items: {}, complete: false }, a, 9000).completedAt, undefined);
  });
  test('summary counts', () => {
    const s = summarize(withItems({ brk_front: { status: 'PASS' }, brk_rear: { status: 'FAIL' }, tire_lf: { status: 'WATCH' }, fl_oil: { status: 'NA' } }));
    assert.deepEqual([s.pass, s.fail, s.watch, s.na, s.done], [1, 1, 1, 1, false]);
  });
});

describe('roll-up and pricing', () => {
  const insp = withItems({
    brk_front: { status: 'FAIL', measurement: 2, attachments: [{ url: 'https://p/1.jpg', kind: 'image' }] },   // safety fail -> SAFETY
    flt_cabin: { status: 'FAIL' },                                                                           // non-safety fail -> SOON
    tire_rf: { status: 'WATCH', measurement: 4 },                                                            // safety watch -> SOON
    fl_oil: { status: 'WATCH' },                                                                             // non-safety watch -> LATER
    brk_rear: { status: 'PASS' },
  });
  test('priority rules', () => {
    assert.equal(defaultPriority({ safety: true }, 'FAIL'), 'SAFETY'); assert.equal(defaultPriority({}, 'FAIL'), 'SOON');
    assert.equal(defaultPriority({ safety: true }, 'WATCH'), 'SOON'); assert.equal(defaultPriority({}, 'WATCH'), 'LATER'); assert.equal(defaultPriority({}, 'PASS' as any), null);
    const r = recommendations(insp);
    assert.deepEqual(r.map(x => [x.itemId, x.priority]), [['brk_front', 'SAFETY'], ['tire_rf', 'SOON'], ['flt_cabin', 'SOON'], ['fl_oil', 'LATER']]);
    assert.equal(r[0].photos.length, 1); assert.match(r[0].evidence, /2 mm/);
  });
  test('advisor priority override is respected', () => {
    const r = recommendations(withItems({ fl_oil: { status: 'WATCH', priority: 'SAFETY' } })); assert.equal(r[0].priority, 'SAFETY');
  });
  test('labor priced from shop rate x hours; parts ONLY from the price book, never invented', () => {
    const r = recommendations(insp)[0];
    const none = priceRecommendation(r, { laborRateCents: 15000, partsMarkupPct: 40 });
    assert.equal(none[0].kind, 'LABOR'); assert.equal(none[0].unitPriceCents, 15000); assert.equal(none[0].qty, 1.2); assert.equal(none[0].group, 'SAFETY');
    assert.equal(none[1].kind, 'PART'); assert.equal(none[1].unitPriceCents, 0); assert.equal(none[1].needsPrice, true);
    const cost = priceRecommendation(r, { laborRateCents: 15000, partsMarkupPct: 40, priceBook: { brk_front: { partCostCents: 5000 } } });
    assert.equal(cost[1].unitPriceCents, 7000); assert.equal(cost[1].costCents, 5000); assert.equal(cost[1].needsPrice, undefined);
    const hrs = priceRecommendation(r, { laborRateCents: 15000, partsMarkupPct: 40, priceBook: { brk_front: { hours: 2, partPriceCents: 9900 } } });
    assert.equal(hrs[0].qty, 2); assert.equal(hrs[1].unitPriceCents, 9900);
  });
  test('no labor rate -> flagged needsPrice rather than a guessed number', () => {
    const l = priceRecommendation(recommendations(insp)[0], { laborRateCents: 0, partsMarkupPct: 40 });
    assert.equal(l[0].needsPrice, true); assert.equal(l[0].unitPriceCents, 0);
    assert.equal(priceAll(recommendations(insp), { laborRateCents: 13500, partsMarkupPct: 40 }).every(x => x.group), true);
  });
});

describe('customer report', () => {
  test('traffic light report hides tech notes, keeps customerNote, https photos only, skips unset/NA', () => {
    const i = withItems({ brk_front: { status: 'FAIL', measurement: 2, note: 'INTERNAL: customer is rude', customerNote: 'Pads are nearly gone.', attachments: [{ url: 'https://p/1.jpg', kind: 'image' }, { url: 'https://p/v.mp4', kind: 'video' }] }, brk_rear: { status: 'PASS' }, fl_oil: { status: 'NA' } }, { techNotes: 'secret' });
    const p = toPublicInspection(i); const json = JSON.stringify(p);
    assert.deepEqual(p.counts, { pass: 1, watch: 0, fail: 1 });
    assert.ok(!json.includes('INTERNAL')); assert.ok(!json.includes('secret')); assert.ok(json.includes('Pads are nearly gone.'));
    const it = p.sections[0].items[0]; assert.equal(it.photos.length, 1); assert.equal(it.detail, '2 mm');
  });
  test('codec round-trip', () => {
    const i = withItems({ brk_front: { status: 'FAIL', measurement: 2 } }, { techNotes: 'noise' });
    const s = serializeInspection(i, 'biz'); for (const v of Object.values(s)) assert.notEqual(v, undefined);
    const p = parseInspection(s); assert.equal(p.items.brk_front.status, 'FAIL'); assert.equal(p.techNotes, 'noise'); assert.equal(s.failCount, 1);
  });
});

describe('advisor prompt builder', () => {
  const insp = withItems({ brk_front: { status: 'FAIL', measurement: 2, note: 'Call Dana at 555-123-4567 or dana@x.com, VIN 1M8GDM9AXKP042788, plate: KXT4410' }, fl_oil: { status: 'WATCH' }, brk_rear: { status: 'PASS' } });
  test('only WATCH/FAIL findings, PII scrubbed, no customer fields', () => {
    const f = buildFindings(insp); assert.deepEqual(f.map(x => x.itemId), ['brk_front', 'fl_oil']);
    const p = buildAdvisorPrompt({ vehicle: { year: 2019, make: 'Honda', model: 'Civic', mileage: 48210 }, findings: f, techNotes: 'Owner phone 555 222 3333' });
    const all = p.system + p.user;
    for (const bad of ['555-123-4567', 'dana@x.com', '1M8GDM9AXKP042788', 'KXT4410', '555 222 3333']) assert.ok(!all.includes(bad), bad);
    assert.match(p.user, /\[phone\]/); assert.match(p.user, /48000 miles/);
    assert.match(p.system, /NEVER state, estimate or imply any price/); assert.match(p.user, /^<data>/);
  });
  test('known customer names are redacted from free text', () => { assert.equal(scrubPII('Dana Cruz said dana is upset', ['Dana Cruz']), '[name] [name] said [name] is upset'); });
  test('scrubPII', () => { assert.equal(scrubPII('mail me a@b.co now'), 'mail me [email] now'); assert.match(scrubPII('see https://evil.example/x'), /\[link\]/); });
});

describe('advisor response validator', () => {
  const f = buildFindings(withItems({ brk_front: { status: 'FAIL' }, fl_oil: { status: 'WATCH' }, flt_cabin: { status: 'FAIL' } }));
  const good = { summary: 'Brakes need attention soon.', items: [
    { itemId: 'brk_front', explanation: 'Your front pads are very thin and should be replaced.', priority: 'SAFETY', hoursLow: 1, hoursHigh: 2, parts: ['front brake pad set'], lineDescription: 'Replace front pads' },
    { itemId: 'fl_oil', explanation: 'Oil is dirty; plan a change.', priority: 'LATER', hoursLow: null, hoursHigh: null, parts: [] },
  ] };
  test('accepts a good reply (also in a code fence)', () => {
    const r = validateAdvisorResponse('```json\n' + JSON.stringify(good) + '\n```', f); assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.draft.aiDraft, true); assert.equal(r.draft.items.length, 2); assert.equal(r.draft.items[0].hoursHigh, 2); assert.equal(r.draft.items[1].hoursLow, undefined); }
  });
  test('rejects malformed JSON / wrong shape / empty', () => {
    for (const bad of ['not json', '[]', '{"items":"x"}', '{"items":[]}', '', 'null']) assert.equal(validateAdvisorResponse(bad, f).ok, false, bad);
  });
  test('rejects any price, link, html or warranty promise', () => {
    for (const t of ['This will cost about 300', 'Only $120 for you', 'around 200 dollars', 'See https://x.io', '<script>alert(1)</script>', 'We guarantee this fix', 'lifetime warranty included']) {
      const r = validateAdvisorResponse(JSON.stringify({ items: [{ itemId: 'brk_front', explanation: t, priority: 'SAFETY' }] }), f); assert.equal(r.ok, false, t);
    }
    assert.equal(validateAdvisorResponse(JSON.stringify({ summary: 'only $50', items: good.items }), f).ok, false);
    assert.equal(validateAdvisorResponse(JSON.stringify({ items: [{ itemId: 'brk_front', explanation: 'ok', parts: ['pads $40'] }] }), f).ok, false);
  });
  test('drops unknown ids; cannot downgrade a failed safety item; may raise urgency', () => {
    const r = validateAdvisorResponse(JSON.stringify({ items: [
      { itemId: 'brk_front', explanation: 'Fine for now.', priority: 'LATER' }, { itemId: 'nope', explanation: 'x', priority: 'SAFETY' }, { itemId: 'fl_oil', explanation: 'Check soon.', priority: 'SAFETY' },
    ] }), f);
    assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.draft.items.find(i => i.itemId === 'brk_front')!.priority, 'SAFETY'); assert.equal(r.draft.items.find(i => i.itemId === 'fl_oil')!.priority, 'SAFETY'); assert.ok(r.draft.issues.some(x => /unknown/i.test(x))); assert.equal(r.draft.items.length, 2); }
  });
  test('bad hour ranges are dropped, not trusted', () => {
    const r = validateAdvisorResponse(JSON.stringify({ items: [{ itemId: 'brk_front', explanation: 'x', priority: 'SAFETY', hoursLow: 5, hoursHigh: 2 }, { itemId: 'flt_cabin', explanation: 'y', priority: 'SOON', hoursLow: 1, hoursHigh: 900 }] }), f);
    assert.equal(r.ok, true); if (r.ok) for (const i of r.draft.items) assert.equal(i.hoursLow, undefined);
  });
  test('model output never carries a price field into the draft', () => {
    const r = validateAdvisorResponse(JSON.stringify({ items: [{ itemId: 'brk_front', explanation: 'x', priority: 'SAFETY', priceCents: 99999, unitPriceCents: 1, price: 5 }] }), f);
    assert.equal(r.ok, true); if (r.ok) assert.ok(!JSON.stringify(r.draft).match(/price/i));
  });
  test('fallback is labelled and deterministic', () => {
    const d = fallbackDraft(f); assert.equal(d.items.length, 3); assert.ok(d.issues[0]); assert.equal(d.items[0].priority, 'SAFETY');
  });
});
