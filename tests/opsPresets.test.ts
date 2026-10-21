// opsPresets — Test Suite
// Run with: npm run test:presets
//
// Every business pack and org type resolves to a complete, internally consistent ops preset.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { opsPresetFor, opsPresetForPage, opsPresetForOrg, presetProblems, ALL_BUSINESS_PRESETS, ALL_ORG_PRESETS, pipelineById } from '../services/opsPresets';
import { PACKS } from '../services/verticalPacks';

const all = [...ALL_BUSINESS_PRESETS, ...Object.values(ALL_ORG_PRESETS)];

describe('opsPresets', () => {
  test('no structural problems in any preset', () => {
    const problems = all.flatMap(presetProblems);
    assert.deepEqual(problems, []);
  });

  test('every vertical pack has its own preset', () => {
    for (const p of PACKS) assert.equal(opsPresetForPage({ subtype: p.id }).id, p.id, `pack ${p.id} has no preset`);
  });

  test('requested business types are ready to run', () => {
    for (const id of ['supermarket', 'grocery_corner_store', 'auto_repair', 'furniture_store', 'car_dealership', 'event_venue', 'event_planner', 'real_estate_brokerage']) {
      const p = opsPresetFor({ kind: 'business', packId: id });
      assert.equal(p.id, id);
      assert.ok(p.events.length >= 1, `${id} events`);
      assert.ok(p.crm.pipelines.length >= 1, `${id} pipelines`);
      assert.ok(p.correspondence.length >= 6, `${id} correspondence`);
      assert.ok(p.marketing.length >= 1, `${id} marketing`);
      assert.ok(p.social.starterPosts.length >= 10, `${id} starter posts`);
      assert.ok(p.staffToday.length >= 1, `${id} staff board`);
    }
  });

  test('pages without a pack fall back by vertical; unknown falls back to OTHER', () => {
    assert.equal(opsPresetForPage({ businessType: 'RESTAURANT' }).id, 'vertical_restaurant');
    assert.equal(opsPresetForPage({ businessType: 'nope' }).id, 'vertical_other');
    assert.equal(opsPresetForPage(null).id, 'vertical_other');
  });

  test('orgs resolve by type, and business-like org templates map to business presets', () => {
    assert.equal(opsPresetForOrg({ orgType: 'CHURCH' }).id, 'org_church');
    assert.equal(opsPresetForOrg({ orgType: 'RELIGIOUS' }).id, 'org_church');
    assert.equal(opsPresetForOrg({ orgType: 'NONPROFIT' }).id, 'org_nonprofit');
    assert.equal(opsPresetForOrg({ orgType: 'REALTY' }).id, 'real_estate_brokerage');
    assert.equal(opsPresetForOrg({ orgType: 'CLUB', templateId: 'event_venue' }).id, 'event_venue');
    assert.equal(opsPresetForOrg({ orgType: 'WHATEVER' }).id, 'org_other');
  });

  test('every org preset sells merch (org pages get a shop)', () => {
    for (const p of Object.values(ALL_ORG_PRESETS)) assert.ok(p.commerce.merchShop, p.id);
  });

  test('pipelineById falls back to the first pipeline', () => {
    const p = opsPresetFor({ kind: 'business', packId: 'car_dealership' });
    assert.equal(pipelineById(p, 'nope').id, p.crm.pipelines[0].id);
  });

  test('offline marketing hand-offs are fully specified', () => {
    for (const p of all) for (const m of p.marketing) {
      if (m.channels.some(c => c === 'eddm' || c === 'direct_mail')) assert.ok(m.mail, `${p.id}/${m.id} needs a mail spec`);
      if (m.channels.includes('billboard_dooh')) assert.ok(m.billboard || m.headline, `${p.id}/${m.id} needs billboard copy`);
    }
  });
});

// ── Offline marketing hand-offs ──────────────────────────────────────────
import { billboardBrief, billboardCopyCheck, mailJob, recipientsCsv, briefHtml } from '../services/marketing/handoff';

describe('marketing hand-offs', () => {
  const who = { name: 'Corner Co', phone: '555-0100', address: { line1: '1 Main St', city: 'Akron', region: 'OH', postal: '44308' } };
  const dealer = opsPresetFor({ kind: 'business', packId: 'car_dealership' });

  test('billboard brief carries flight, copy check and every DOOH size', () => {
    const play = dealer.marketing.find(m => m.channels.includes('billboard_dooh'))!;
    const b = billboardBrief(play, who, new Date('2026-11-01T00:00:00Z'));
    assert.equal(b.flight.start, '2026-11-01');
    assert.equal(b.creativeSpecs.length, 4);
    assert.ok(b.copy.check.ok);
    assert.equal(billboardCopyCheck('one two three four five six seven eight').ok, false);
  });

  test('targeted mail job lists recipients; EDDM job has none and uses route quantity', () => {
    const conquest = dealer.marketing.find(m => m.id === 'conquest_mail')!;
    const r = [{ name: 'Ana Ruiz', line1: '9 Elm', city: 'Akron', region: 'OH', postal: '44310' }];
    const job = mailJob(conquest, who, r, new Date('2026-11-05T00:00:00Z'));
    assert.equal(job.quantity, 1);
    assert.equal(job.to[0].address_state, 'OH');
    const eddm = dealer.marketing.find(m => m.channels.includes('eddm'))!;
    const e = mailJob(eddm, who, r, new Date('2026-11-05T00:00:00Z'), 1200);
    assert.equal(e.to.length, 0);
    assert.equal(e.quantity, 1200);
  });

  test('CSV quotes fields and skips incomplete addresses; brief HTML escapes', () => {
    const csv = recipientsCsv([{ name: 'A "B"', line1: '1 X', city: 'C', region: 'OH', postal: '1' }, { name: 'No addr', line1: '', city: '', region: '', postal: '' }]);
    assert.equal(csv.split('\n').length, 2);
    assert.ok(csv.includes('"A ""B"""'));
    const html = briefHtml(billboardBrief({ ...dealer.marketing[0], label: '<x>' }, who, new Date()));
    assert.ok(html.includes('&lt;x&gt;'));
  });
});
