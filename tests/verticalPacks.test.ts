// verticalPacks — Test Suite
// Run with: npm run test:packs
//
// Pins the manifest invariants (every pack is complete and internally consistent), the honest capability
// readiness rules, the idempotent applier plan, and the go-live checklist detection. All pure, no Firebase.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PACKS, getPack, packForPage, packsByParent, tabsFor, vocabularyFor, samplePackId, offerIdFor,
  CAPABILITIES, packReadiness, capabilityBreakdown, isUsable, type VerticalPack,
} from '../services/verticalPacks';
import { planApply, toProductDraft, stripUndefined, type ExistingState } from '../services/verticalPacks/plan';
import { computeChecklist, emptySnapshot, type BusinessSnapshot } from '../services/verticalPacks/checklist';
import { BUSINESS_VERTICALS, VERTICAL_PRESETS, getVertical } from '../services/businessVerticals';

const REQUIRED = ['grocery_corner_store', 'clothing_boutique', 'salon_barbershop', 'health_spa', 'auto_repair', 'laundromat'];
const must = (id: string): VerticalPack => { const p = getPack(id); assert.ok(p, id); return p!; };
const ctx = { sellerId: 'u1', sellerName: 'Test Biz' };
const blank = (page: ExistingState['page'] = {}): ExistingState => ({ products: [], offerIds: [], page });

describe('registry', () => {
  test('the six required packs plus migrated restaurant and real estate exist', () => {
    for (const id of REQUIRED) assert.ok(getPack(id), id);
    assert.ok(getPack('restaurant_cafe'));
    assert.ok(getPack('real_estate_brokerage'));
    assert.equal(new Set(PACKS.map(p => p.id)).size, PACKS.length, 'unique ids');
  });

  test('every pack parent is a real vertical and tabs are a subset of dashboard tabs', () => {
    for (const p of PACKS) {
      assert.ok(BUSINESS_VERTICALS[p.parent], p.id);
      assert.ok(p.tabs.includes('OVERVIEW') && p.tabs.includes('SETTINGS'), `${p.id} keeps Overview and Settings`);
      assert.equal(new Set(p.tabs).size, p.tabs.length, `${p.id} no duplicate tabs`);
    }
  });

  test('packsByParent groups every pack once', () => {
    const groups = packsByParent();
    assert.equal(groups.reduce((n, g) => n + g.packs.length, 0), PACKS.length);
  });

  test('tabsFor / vocabularyFor fall back to the vertical when no pack is applied', () => {
    assert.deepEqual(tabsFor({ businessType: 'RESTAURANT' }), getVertical('RESTAURANT').tabs);
    assert.deepEqual(tabsFor({ businessType: 'SERVICE', subtype: 'nope' }), getVertical('SERVICE').tabs);
    assert.deepEqual(tabsFor({ businessType: 'SERVICE', subtype: 'salon_barbershop' }), must('salon_barbershop').tabs);
    assert.equal(vocabularyFor({ businessType: 'HEALTH' }).catalogNoun, 'Services');
    assert.equal(vocabularyFor({ subtype: 'laundromat' }).orderNoun, 'ticket');
    assert.equal(packForPage({ packId: 'laundromat' })?.id, 'laundromat');
    assert.equal(packForPage(null), null);
  });

  test('migrated presets stay in sync with businessVerticals', () => {
    assert.equal(must('restaurant_cafe').extras!.presetBusinessName, VERTICAL_PRESETS.RESTAURANT!.businessName);
    assert.deepEqual(must('restaurant_cafe').tabs, BUSINESS_VERTICALS.RESTAURANT.tabs);
    assert.deepEqual(must('real_estate_brokerage').tabs, BUSINESS_VERTICALS.REAL_ESTATE.tabs);
    assert.equal(must('real_estate_brokerage').extras!.presetTagline, VERTICAL_PRESETS.REAL_ESTATE!.tagline);
  });
});

describe('manifest integrity', () => {
  for (const pack of PACKS) {
    test(`${pack.id}: well-formed`, () => {
      const cats = new Set(pack.starterCatalog.categories.map(c => c.name));
      const keys = pack.starterCatalog.items.map(i => i.key);
      assert.equal(new Set(keys).size, keys.length, 'unique item keys');
      for (const it of pack.starterCatalog.items) {
        assert.ok(cats.has(it.category), `${it.key} category ${it.category}`);
        assert.ok(it.price >= 0 && Number.isFinite(it.price), `${it.key} price`);
        if (it.costPrice !== undefined) assert.ok(it.costPrice <= it.price, `${it.key} cost <= price`);
        if (it.kind === 'service') assert.ok((it.durationMin ?? 0) > 0 || it.soldBy === 'weight' || pack.id === 'laundromat', `${it.key} duration`);
        if (it.kind === 'addon') assert.ok(it.addOnFor?.length, `${it.key} addOnFor`);
        for (const target of it.addOnFor ?? []) if (target !== '*') assert.ok(keys.includes(target), `${it.key} -> ${target}`);
        if (it.requires) assert.ok(CAPABILITIES[it.requires], it.requires);
      }
      for (const c of pack.capabilities) assert.ok(CAPABILITIES[c.id], `capability ${c.id}`);
      assert.ok(pack.roles.some(r => r.key === 'OWNER'), 'owner role');
      assert.equal(new Set(pack.roles.map(r => r.key)).size, pack.roles.length, 'unique role keys');
      assert.equal(new Set(pack.checklist.map(s => s.id)).size, pack.checklist.length, 'unique step ids');
      assert.equal(new Set(pack.deals.map(d => d.key)).size, pack.deals.length, 'unique deal keys');
      for (const d of pack.deals) assert.ok(d.kind === 'PERCENT' ? d.value > 0 && d.value <= 100 : d.value > 0);
      for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) assert.ok(pack.defaultHours[day], day);
      assert.equal(pack.clinical, false);
    });

    test(`${pack.id}: go-live promise is 15 minutes`, () => {
      const required = pack.checklist.filter(s => !s.optional && !(s.requires && !isUsable(s.requires)));
      const minutes = required.reduce((n, s) => n + s.minutes, 0);
      assert.ok(minutes <= 15, `${pack.id} requires ${minutes} min`);
      assert.ok(pack.checklist.some(s => s.detect === 'PACK_APPLIED'));
    });
  }

  test('pack ids and item keys are frozen identifiers (sample ids)', () => {
    assert.equal(samplePackId(must('laundromat'), 'wf_standard'), 'laundromat:wf_standard');
    assert.equal(offerIdFor(must('laundromat'), 'members_5'), 'pack_laundromat_members_5');
  });
});

describe('pack content (real-world rules)', () => {
  test('grocery: age gates, SNAP flags and weighed produce', () => {
    const g = must('grocery_corner_store');
    const by = (k: string) => g.starterCatalog.items.find(i => i.key === k)!;
    assert.equal(by('cigs_pack').ageRestricted, 'TOBACCO');
    assert.equal(by('beer_6').ageRestricted, 'ALCOHOL');
    assert.equal(by('milk_gal').snapEligible, true);
    for (const k of ['cigs_pack', 'beer_6', 'hot_dog', 'coffee_hot', 'paper_towels']) assert.equal(by(k).snapEligible, false, k);
    assert.equal(by('bananas').soldBy, 'weight');
    assert.equal(by('bananas').requires, 'WEIGHED_REGISTER');   // register cannot sell weighed products yet; tickets can (WEIGHED_ITEMS partial)
    assert.ok(g.checklist.some(s => s.id === 'ebt_connected'));
    assert.equal(CAPABILITIES.EBT_SNAP.status, 'planned');
    assert.equal(g.extras!.ageGateDefaults.find((a: any) => a.id === 'TOBACCO').minAge, 21);
    for (const it of g.starterCatalog.items) assert.ok(!(it.ageRestricted && it.snapEligible), `${it.key} age-restricted must not be SNAP`);
  });

  test('boutique: size x color matrix and an off-by-default markdown', () => {
    const b = must('clothing_boutique');
    const tee = b.starterCatalog.items.find(i => i.key === 'tee_basic')!;
    const draft = toProductDraft(b, tee, ctx);
    assert.equal(draft.variants.length, 5 * 3);
    assert.equal(draft.stock, 15 * (tee.stock ?? 2));
    assert.equal(Object.keys(draft.variantStock).length, 15);
    assert.equal(draft.taxClass, 'CLOTHING');
    const md = b.deals.find(d => d.key === 'seasonal_markdown')!;
    assert.equal(md.startActive, false);
    assert.ok(b.policies!.some(p => p.id === 'returns'));
  });

  test('salon: durations, add-ons, pay models, 4-6 week rebook', () => {
    const s = must('salon_barbershop');
    assert.ok(s.starterCatalog.items.filter(i => i.kind === 'service').every(i => (i.durationMin ?? 0) >= 15));
    assert.ok(s.starterCatalog.items.some(i => i.kind === 'addon'));
    assert.ok(s.roles.some(r => r.key === 'BOOTH_RENTER'));
    const rebook = s.automations.find(a => a.id === 'rebook_cut')!;
    assert.ok((rebook.params.minWeeks as number) >= 4 && (rebook.params.maxWeeks as number) <= 6);
    assert.ok(s.extras!.payModels.some((m: any) => m.id === 'booth_rent') && s.extras!.payModels.some((m: any) => m.id === 'commission'));
  });

  test('spa: never clinical, never HEALTH, forms are non-clinical', () => {
    const sp = must('health_spa');
    assert.equal(sp.clinical, false);
    assert.notEqual(sp.parent, 'HEALTH');
    assert.equal(sp.parent, 'SERVICE');
    assert.ok(sp.forms!.length >= 2 && sp.forms!.every(f => f.clinical === false));
    const plan = planApply(sp, blank({ businessType: 'HEALTH' }), ctx);
    assert.equal(plan.pagePatch.businessType, 'SERVICE', 'a spa is moved off the clinical vertical');
    assert.ok(sp.packages!.every(p => p.requires === 'MEMBERSHIPS'));
    for (const pack of PACKS) assert.ok(!JSON.stringify(pack).match(/\bPHI\b.*chart|diagnos(is|e)s? (are )?stored/i));
  });

  test('auto repair: stages, vehicle fields, service intervals', () => {
    const a = must('auto_repair');
    assert.deepEqual(a.stages!.map(s => s.id), ['estimate', 'approved', 'in_progress', 'ready', 'picked_up']);
    for (const f of ['vin', 'plate', 'mileage_in']) assert.ok(a.jobFields!.some(j => j.id === f), f);
    assert.ok(a.extras!.laborRatePerHour > 0 && a.extras!.partsMarkupPercent > 0);
    assert.ok(a.automations.filter(x => x.kind === 'SERVICE_DUE').length >= 4);
    assert.ok(['oil', 'brake', 'tire', 'inspect'].every(w => a.starterCatalog.items.some(i => i.name.toLowerCase().includes(w))));
    assert.equal(a.vocabulary.orderNoun, 'work order');
  });

  test('laundromat: stage pipeline, modes, per-lb pricing is draft until weighed items ship', () => {
    const l = must('laundromat');
    assert.deepEqual(l.stages!.map(s => s.id), ['received', 'washing', 'drying', 'folded', 'ready']);
    assert.equal(l.stages!.find(s => s.id === 'ready')!.notifyCustomer, true);
    assert.deepEqual(l.extras!.modes.map((m: any) => m.id), ['self_serve', 'wash_fold']);
    const plan = planApply(l, blank(), ctx);
    const wf = plan.productsToCreate.find(p => p.packSampleId === 'laundromat:wf_standard')!;
    assert.equal(wf.isActive, false);
    assert.ok(wf.tags.includes('needs:WEIGHED_REGISTER'));
    assert.ok(plan.draftedItems.some(d => d.key === 'wf_standard'));
    const comforter = plan.productsToCreate.find(p => p.packSampleId === 'laundromat:comforter_king')!;
    assert.equal(comforter.isActive, true);
    assert.equal(l.vocabulary.orderNoun, 'ticket');
  });
});

describe('pack content: retail big-ticket + events (2026-10-20)', () => {
  const item = (p: VerticalPack, k: string) => { const it = p.starterCatalog.items.find(i => i.key === k); assert.ok(it, `${p.id}:${k}`); return it!; };
  const sizeOk = (p: VerticalPack) => {
    const n = p.starterCatalog.items.length;
    assert.ok(n >= 20 && n <= 40, `${p.id} has ${n} items`);
    assert.ok(p.roles.length >= 3 && p.roles.length <= 6, `${p.id} roles`);
    assert.ok(p.deals.length >= 2 && p.deals.length <= 4, `${p.id} deals`);
    assert.ok(p.signage.length >= 3 && p.signage.length <= 5, `${p.id} signage`);
    assert.ok(p.loyalty.ladder.length >= 3, `${p.id} loyalty ladder`);
    assert.ok(p.hardware.length >= 3 && p.hardware.some(h => h.required), `${p.id} hardware`);
    assert.ok(p.automations.length >= 3, `${p.id} automations`);
    assert.ok((p.policies ?? []).length >= 3, `${p.id} policies`);
    for (const a of p.automations) if (a.requires) assert.ok(CAPABILITIES[a.requires], `${p.id}:${a.id}`);
  };

  test('new packs are registered with the right parent, icon and label', () => {
    const exp: [string, string, string, string][] = [
      ['supermarket', 'RETAIL', 'ShoppingCart', 'Grocery Store'],
      ['furniture_store', 'RETAIL', 'Sofa', 'Furniture Store'],
      ['car_dealership', 'RETAIL', 'Car', 'Car Dealership'],
      ['event_venue', 'ENTERTAINMENT', 'Landmark', 'Event Venue'],
      ['event_planner', 'SERVICE', 'PartyPopper', 'Event Planner'],
    ];
    for (const [id, parent, icon, label] of exp) {
      const p = must(id);
      assert.equal(p.parent, parent, id); assert.equal(p.icon, icon, id); assert.equal(p.label, label, id);
      assert.ok(!p.tabs.includes('TICKETS'), `${id}: the service-ticket tab stays auto/laundry only`);
      assert.equal(p.ticket, undefined, id);
      sizeOk(p);
    }
  });

  test('corner store is relabelled but keeps its id and keys', () => {
    const g = must('grocery_corner_store');
    assert.equal(g.label, 'Corner Store & Convenience');
    assert.notEqual(g.label, must('supermarket').label);
    assert.ok(g.starterCatalog.items.some(i => i.key === 'cigs_pack'));
  });

  test('supermarket: departments, SNAP, age and weighed-item honesty', () => {
    const s = must('supermarket');
    const cats = s.starterCatalog.categories.map(c => c.name);
    for (const d of ['Produce', 'Meat & Seafood', 'Deli', 'Bakery', 'Dairy', 'Frozen', 'Pantry', 'Household', 'Health & Beauty']) assert.ok(cats.includes(d), d);
    assert.ok(cats.some(c => c.startsWith('Beer & Wine')));
    for (const it of s.starterCatalog.items) {
      assert.ok(!(it.ageRestricted && it.snapEligible), `${it.key} age-restricted must not be SNAP`);
      if (it.soldBy === 'weight') assert.equal(it.requires, 'WEIGHED_REGISTER', it.key);
    }
    assert.equal(item(s, 'wine_red').ageRestricted, 'ALCOHOL');
    assert.equal(item(s, 'rotisserie').snapEligible, false);   // hot food
    assert.equal(item(s, 'cold_sub').snapEligible, true);
    for (const k of ['vitamins', 'dog_food', 'paper_towels', 'shampoo']) assert.equal(item(s, k).snapEligible, false, k);
    const plan = planApply(s, blank(), ctx);
    assert.equal(plan.productsToCreate.find(p => p.packSampleId === 'supermarket:chicken_breast')!.isActive, false);
    assert.equal(plan.productsToCreate.find(p => p.packSampleId === 'supermarket:ground_beef')!.isActive, true);
    assert.ok(s.checklist.some(st => st.id === 'ebt_connected' && st.optional));
  });

  test('furniture: variants, delivery services, protection add-ons, special-order stages', () => {
    const f = must('furniture_store');
    const sofa = toProductDraft(f, item(f, 'sofa_3'), ctx);
    assert.equal(sofa.variants.length, item(f, 'sofa_3').colors!.length);
    assert.equal(item(f, 'white_glove').kind, 'service');
    assert.equal(item(f, 'white_glove').requires, 'DELIVERY');
    assert.equal(item(f, 'protect_uph').kind, 'addon');
    assert.deepEqual(f.stages!.map(st => st.id), ['ordered', 'in_transit', 'received', 'delivery_scheduled', 'delivered']);
    const so = computeChecklist(f, emptySnapshot({})).steps.find(st => st.id === 'special_orders')!;
    assert.equal(so.state, 'soon');   // SPECIAL_ORDERS is planned: never offered as working
    assert.ok(f.capabilities.some(c => c.id === 'LAYAWAY' && c.importance === 'nice'));
  });

  test('car dealership: one-off vehicles, optional F&I, deal stages and compliance notes', () => {
    const d = must('car_dealership');
    const cars = d.starterCatalog.items.filter(i => i.kind === 'product');
    assert.ok(cars.length >= 10);
    for (const c of cars) {
      assert.equal(c.stock, 1, c.key); assert.equal(c.storeCategory, 'OTHER', c.key);
      assert.ok(/^\d{4} /.test(c.name) && /miles/.test(c.description), c.key);
      assert.ok(d.extras!.vehicleSpecs[c.key].miles > 0, c.key);
    }
    for (const k of ['vsc', 'gap', 'tint', 'doc_fee']) assert.equal(item(d, k).kind, 'addon', k);
    assert.ok(d.starterCatalog.items.filter(i => i.category === 'F&I Products').every(i => i.description.startsWith('Optional.')));
    assert.deepEqual(d.stages!.map(st => st.id), ['lead', 'test_drive', 'working', 'fi', 'delivered']);
    for (const f of ['vin', 'stock_no', 'trade_in', 'financing']) assert.ok(d.jobFields!.some(j => j.id === f), f);
    assert.equal(d.vocabulary.catalogNoun, 'Vehicles'); assert.equal(d.vocabulary.orderNoun, 'deal'); assert.equal(d.vocabulary.staff, 'salesperson');
    for (const c of ['VIN_DECODE', 'RECALL_CHECK', 'FINANCING']) assert.equal(d.capabilities.find(x => x.id === c)?.importance, 'nice', c);
    assert.ok(d.policies!.some(p => p.id === 'buyers_guide'));
    assert.ok(d.checklist.some(st => st.id === 'dealer_license'));
  });

  test('event venue: rentals by space, 21+ bar, deposits, full stage pipeline, tours + orders tabs', () => {
    const v = must('event_venue');
    assert.deepEqual(v.stages!.map(st => st.id), ['inquiry', 'tour', 'hold', 'contract', 'deposit_paid', 'event', 'settled']);
    assert.ok(v.tabs.includes('APPOINTMENTS') && v.tabs.includes('ORDERS'));
    for (const k of ['bar_beer_wine', 'bar_standard', 'bar_premium']) assert.equal(item(v, k).ageRestricted, 'ALCOHOL', k);
    assert.equal(item(v, 'bar_soft').ageRestricted, undefined);
    assert.equal(item(v, 'damage_deposit').requires, 'DEPOSITS');
    assert.ok(v.capabilities.some(c => c.id === 'TICKETS'));
    assert.ok(item(v, 'ballroom_sat').price > item(v, 'ballroom_weekday').price);
  });

  test('event planner: packages, add-ons, referral disclosure, stage pipeline', () => {
    const p = must('event_planner');
    assert.deepEqual(p.stages!.map(st => st.id), ['inquiry', 'consult', 'proposal', 'contract', 'planning', 'event', 'review']);
    assert.ok(item(p, 'day_of').price < item(p, 'partial').price && item(p, 'partial').price < item(p, 'full').price);
    assert.ok(p.policies!.some(x => x.id === 'referrals'));
    assert.ok(p.starterCatalog.items.some(i => i.kind === 'addon'));
  });

  test('real estate: $0 commission-based services, stages, fields, NAR + fair housing', () => {
    const re = must('real_estate_brokerage');
    for (const k of ['listing_consult', 'cma', 'buyer_consult', 'staging_consult']) { assert.equal(item(re, k).kind, 'service', k); assert.equal(item(re, k).price, 0, k); }
    assert.deepEqual(re.stages!.map(st => st.id), ['lead', 'appointment', 'showing', 'offer', 'under_contract', 'closed']);
    for (const f of ['budget', 'beds', 'area', 'pre_approved']) assert.ok(re.jobFields!.some(j => j.id === f), f);
    assert.equal(re.deals.length, 3);
    assert.ok(re.deals.every(d => d.startActive === false));
    assert.ok(re.policies!.some(x => x.id === 'fair_housing') && re.policies!.some(x => x.id === 'buyer_agreement'));
    assert.ok(re.automations.length >= 3);
  });
});

describe('capability honesty', () => {
  test('readiness derives from core capabilities only', () => {
    const mk = (caps: VerticalPack['capabilities']) => packReadiness({ capabilities: caps });
    assert.equal(mk([{ id: 'POS', importance: 'core' }, { id: 'EBT_SNAP', importance: 'nice' }]), 'ready');
    assert.equal(mk([{ id: 'POS', importance: 'core' }, { id: 'BOOKING', importance: 'core' }]), 'partial');
    assert.equal(mk([{ id: 'POS', importance: 'core' }, { id: 'WORK_ORDERS', importance: 'core' }]), 'partial');
    assert.equal(mk([{ id: 'POS', importance: 'core' }, { id: 'WALKIN_QUEUE', importance: 'core' }]), 'early');   // WALKIN_QUEUE is still planned
    assert.equal(mk([]), 'ready');
  });

  test('per-pack badges match the registry today', () => {
    const r = (id: string) => packReadiness(must(id));
    assert.equal(r('clothing_boutique'), 'ready');
    assert.equal(r('restaurant_cafe'), 'ready');
    assert.equal(r('real_estate_brokerage'), 'ready');
    assert.equal(r('grocery_corner_store'), 'partial');
    assert.equal(r('salon_barbershop'), 'partial');
    assert.equal(r('health_spa'), 'early');
    assert.equal(r('auto_repair'), 'partial');   // vehicle records/DVI/estimates are built (unverified live) -> works with gaps
    assert.equal(r('laundromat'), 'partial');   // weigh-in + tickets work (partial); self-serve machine control is separate and planned
    assert.equal(r('supermarket'), 'partial');   // TAX + AGE_GATE are partial; weighed register is nice-to-have
    assert.equal(r('furniture_store'), 'partial');   // DELIVERY partial; special orders / layaway / financing are nice + planned
    assert.equal(r('car_dealership'), 'partial');   // vehicle inventory, test drives, CRM pipeline partial; financing planned (nice)
    assert.equal(r('event_venue'), 'partial');
    assert.equal(r('event_planner'), 'partial');
  });

  test('retail big-ticket + events capability statuses (2026-10-20)', () => {
    const st = (id: keyof typeof CAPABILITIES) => CAPABILITIES[id].status;
    assert.equal(st('TICKETS'), 'partial');   // plajahEvents tiers, purchase, kiosk/scanner exist
    assert.equal(st('VEHICLE_INVENTORY'), 'partial');
    assert.equal(st('TEST_DRIVES'), 'partial');
    assert.equal(st('FINANCING'), 'planned');   // no lender integration
    assert.equal(st('SPECIAL_ORDERS'), 'planned');   // ticket engine is only on for auto + laundry
    assert.equal(st('LAYAWAY'), 'planned');
    assert.equal(st('DEPOSITS'), 'partial');   // ticket deposits only
    assert.equal(st('CRM_PIPELINE'), 'partial');
    assert.equal(st('EVENT_WORKFLOW'), 'partial');
    assert.ok(/new/i.test(CAPABILITIES.CRM_PIPELINE.note));
  });

  test('capabilityBreakdown buckets by status', () => {
    const b = capabilityBreakdown(must('auto_repair'));
    assert.ok(b.partial.some(c => c.id === 'WORK_ORDERS'));
    assert.ok(b.partial.some(c => c.id === 'VEHICLE_RECORDS'));
    assert.ok(b.partial.some(c => c.id === 'DVI') && b.partial.some(c => c.id === 'VIN_DECODE'));
    assert.ok(b.ready.some(c => c.id === 'POS'));
    assert.equal(b.ready.length + b.partial.length + b.planned.length, must('auto_repair').capabilities.length);
  });

  test('every capability has a note and a valid status', () => {
    for (const c of Object.values(CAPABILITIES)) {
      assert.ok(c.note.length > 5, c.id);
      assert.ok(['ready', 'partial', 'planned'].includes(c.status), c.id);
    }
  });

  test('checklist steps that need a planned capability are "soon" and do not block going live', () => {
    const a = must('laundromat');
    const p = computeChecklist(a, emptySnapshot({}));
    const est = p.steps.find(s => s.id === 'machine_integration')!;   // MACHINE_CONTROL is still planned
    assert.equal(est.state, 'soon');
    assert.equal(est.required, false);
  });
});

describe('applier plan (idempotent)', () => {
  for (const pack of PACKS) {
    test(`${pack.id}: first apply creates every sample once, second apply creates nothing`, () => {
      const first = planApply(pack, blank(), ctx);
      assert.equal(first.productsToCreate.length, pack.starterCatalog.items.length);
      assert.equal(first.offersToCreate.length, pack.deals.length);
      assert.equal(first.firstApply, true);
      const ids = first.productsToCreate.map(p => p.packSampleId);
      assert.equal(new Set(ids).size, ids.length, 'unique packSampleId');

      const existing: ExistingState = {
        products: first.productsToCreate.map((p, i) => ({ id: `p${i}`, packSampleId: p.packSampleId })),
        offerIds: first.offersToCreate.map(o => o.id),
        page: { subtype: pack.id, businessType: pack.parent, hours: pack.defaultHours, packRoles: pack.roles },
      };
      const second = planApply(pack, existing, ctx);
      assert.equal(second.productsToCreate.length, 0);
      assert.equal(second.offersToCreate.length, 0);
      assert.equal(second.productsSkipped, pack.starterCatalog.items.length);
      assert.equal(second.firstApply, false);
    });
  }

  test('partial earlier run: only the missing samples are created', () => {
    const g = must('grocery_corner_store');
    const all = planApply(g, blank(), ctx).productsToCreate;
    const existing: ExistingState = { products: all.slice(0, 10).map(p => ({ packSampleId: p.packSampleId })), offerIds: [], page: {} };
    const again = planApply(g, existing, ctx);
    assert.equal(again.productsToCreate.length, all.length - 10);
    assert.equal(again.productsSkipped, 10);
  });

  test('re-apply never flips toggles the owner changed and never overwrites hours', () => {
    const s = must('salon_barbershop');
    const plan = planApply(s, blank({ subtype: s.id, businessType: 'SERVICE', hours: { monday: { open: '10:00', close: '15:00' } }, packRoles: s.roles }), ctx);
    for (const k of ['isAcceptingOrders', 'radioServiceEnabled', 'digitalSignageEnabled', 'rewardsEnabled', 'priceRange']) assert.ok(!(k in plan.pagePatch), k);
    assert.ok(!('hours' in plan.pagePatch));
    assert.ok(!('packRoles' in plan.pagePatch));
    assert.equal(plan.pagePatch.subtype, s.id);
  });

  test('first apply sets page defaults, subtype, vocabulary, hours and loyalty', () => {
    const s = must('salon_barbershop');
    const plan = planApply(s, blank({ businessType: 'OTHER', amenities: ['parking'] }), ctx);
    const p = plan.pagePatch;
    assert.equal(p.subtype, 'salon_barbershop');
    assert.equal(p.businessType, 'SERVICE');
    assert.equal(p.packVocabulary.staff, 'stylist');
    assert.equal(p.rewardsEnabled, true);
    assert.equal(p.rewardPointsPerDollar, 1);
    assert.ok(p.amenities.includes('parking') && p.amenities.includes('wifi'));
    assert.deepEqual(p.hours.monday, { open: '00:00', close: '00:00', closed: true });
    assert.equal(p.packRoles.length, s.roles.length);
  });

  test('deals honor startActive; markdown stays off', () => {
    const plan = planApply(must('clothing_boutique'), blank(), ctx);
    const md = plan.offersToCreate.find(o => o.id === 'pack_clothing_boutique_seasonal_markdown')!;
    assert.equal(md.offer.active, false);
    assert.equal(plan.offersToCreate.find(o => o.id.endsWith('welcome_10'))!.offer.active, true);
  });

  test('payloads contain no undefined (Firestore throws on undefined)', () => {
    const hasUndef = (v: any): boolean => v === undefined || (v && typeof v === 'object' && Object.values(v).some(hasUndef));
    for (const pack of PACKS) {
      const plan = planApply(pack, blank(), ctx);
      assert.ok(!plan.productsToCreate.some(hasUndef), `${pack.id} products`);
      assert.ok(!plan.offersToCreate.some(o => hasUndef(o.offer)), `${pack.id} offers`);
      assert.ok(!hasUndef(plan.pagePatch), `${pack.id} page`);
    }
  });

  test('sample products are flagged and tagged for bulk delete; services are untracked', () => {
    const plan = planApply(must('salon_barbershop'), blank(), ctx);
    for (const p of plan.productsToCreate) {
      assert.equal(p.isSample, true);
      assert.ok(p.tags.includes('sample'));
      assert.ok(p.packSampleId.startsWith('salon_barbershop:'));
    }
    const cut = plan.productsToCreate.find(p => p.packSampleId.endsWith(':mens_cut'))!;
    assert.equal(cut.trackInventory, false);
    assert.equal(cut.durationMin, 30);
    assert.equal(cut.isService, true);
    const shampoo = plan.productsToCreate.find(p => p.packSampleId.endsWith(':shampoo'))!;
    assert.equal(shampoo.trackInventory, true);
    assert.equal(shampoo.stock, 8);
  });

  test('stripUndefined is deep and leaves arrays and primitives alone', () => {
    assert.deepEqual(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: [1, { f: undefined, g: 2 }] } }), { a: 1, c: { e: [1, { g: 2 }] } });
  });
});

describe('go-live checklist detection', () => {
  const salon = must('salon_barbershop');
  const done = (p: ReturnType<typeof computeChecklist>, id: string) => p.steps.find(s => s.id === id)!.state === 'done';

  test('fresh business: nothing done, not live', () => {
    const p = computeChecklist(salon, emptySnapshot({}));
    assert.equal(p.requiredDone, 0);
    assert.equal(p.live, false);
    assert.equal(p.percent, 0);
    assert.equal(p.next?.id, 'apply_pack');
  });

  test('applying the pack alone completes only the apply step; default hours do not count as confirmed', () => {
    const p = computeChecklist(salon, emptySnapshot({ subtype: salon.id, hours: salon.defaultHours }));
    assert.ok(done(p, 'apply_pack'));
    assert.ok(!done(p, 'confirm_hours'));
    const edited = computeChecklist(salon, emptySnapshot({ subtype: salon.id, hours: { ...salon.defaultHours, tuesday: { open: '10:00', close: '18:00' } } }));
    assert.ok(done(edited, 'confirm_hours'));
  });

  test('manual tick confirms hours and manual-only steps', () => {
    const p = computeChecklist(salon, emptySnapshot({ subtype: salon.id, hours: salon.defaultHours, packManualDone: ['confirm_hours', 'pay_model'] }));
    assert.ok(done(p, 'confirm_hours'));
    assert.equal(p.steps.find(s => s.id === 'pay_model')!.source, 'manual');
  });

  test('catalog reviewed once a sample is edited or samples are cleared', () => {
    const base: BusinessSnapshot = { ...emptySnapshot({ subtype: salon.id }), productCount: 30, sampleCount: 30 };
    assert.ok(!done(computeChecklist(salon, base), 'review_catalog'));
    assert.ok(done(computeChecklist(salon, { ...base, editedSampleCount: 1 }), 'review_catalog'));
    assert.ok(done(computeChecklist(salon, { ...base, sampleCount: 0 }), 'review_catalog'));
    assert.ok(!done(computeChecklist(salon, { ...base, productCount: 0, sampleCount: 0 }), 'review_catalog'), 'empty catalog is not reviewed');
  });

  test('payments, first sale, public page, own item and staff are detected from data', () => {
    const snap: BusinessSnapshot = {
      ...emptySnapshot({ subtype: salon.id, stripeAccountId: 'acct_1', isPublic: true, address: '1 Main', city: 'X', phone: '555' }),
      productCount: 31, sampleCount: 30, orderCount: 1, staffCount: 2,
    };
    const p = computeChecklist(salon, snap);
    for (const id of ['connect_payments', 'test_sale', 'go_public', 'add_own_item', 'add_staff', 'first_stylist', 'confirm_address']) assert.ok(done(p, id), id);
  });

  test('live when every required step is done; optional steps never block', () => {
    const snap: BusinessSnapshot = {
      ...emptySnapshot({ subtype: salon.id, stripeAccountId: 'a', isPublic: true, address: '1', city: 'c', phone: '1', hours: { ...salon.defaultHours, monday: { open: '1', close: '2' } }, packManualDone: ['pay_model'] }),
      productCount: 5, sampleCount: 0, orderCount: 1, staffCount: 1,
    };
    const p = computeChecklist(salon, snap);
    assert.equal(p.live, true);
    assert.equal(p.percent, 100);
    assert.equal(p.minutesLeft, 0);
    assert.equal(p.next, null);
  });

  test('minutesLeft shrinks as steps complete', () => {
    const a = computeChecklist(salon, emptySnapshot({}));
    const b = computeChecklist(salon, emptySnapshot({ subtype: salon.id }));
    assert.ok(b.minutesLeft < a.minutesLeft);
    assert.equal(a.minutesLeft, a.minutesTotal);
  });
});
