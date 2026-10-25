import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  buildProfile, validateValue, parseMoney, splitAddress, applicantKindForOrg, SF424_APPLICANT_CODE, type StoredProfile,
} from '../services/grants/profile';
import { buildReadiness, nextQuestion, needsFor, documentsFor } from '../services/grants/readiness';
import { matchField, prefillPdf, sf424CopySheet, HUMAN_ONLY } from '../services/grants/forms';
import {
  reviewApplication, draftSection, findUnsupportedNumbers, extractPlaceholders, parseJson, SEATS, type ModelFn,
} from '../services/grants/council';
import { sanitizeInput } from '../services/dataCommons/grants';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const org = {
  name: 'Grace Chapel', legalName: 'Grace Chapel of Detroit Inc.', ein: '38-1234567', orgType: 'CHURCH',
  tagline: 'A neighborhood church feeding and mentoring families.',
  location: { address: '1600 W Lafayette Blvd, Detroit, MI 48216', phone: '313-555-0100', email: 'office@grace.example', website: 'https://grace.example' },
};
const geo = { county: 'Wayne County', congressionalDistrict: 'MI-013', state: 'MI' };

test('profile pulls from the org page and derives geography', () => {
  const p = buildProfile(org, {}, geo);
  assert.equal(p.legalName.value, 'Grace Chapel of Detroit Inc.');
  assert.equal(p.dbaName.value, 'Grace Chapel');
  assert.equal(p.ein.value, '38-1234567');
  assert.equal(p.street.value, '1600 W Lafayette Blvd');
  assert.equal(p.city.value, 'Detroit');
  assert.equal(p.zip.value, '48216');
  assert.equal(p.congressionalDistrict.source, 'derived');
  assert.equal(p.county.value, 'Wayne County');
  assert.equal(p.entityType.source, 'suggested');
  assert.equal(p.legalName.confirmed, false); // platform data is a draft until a person confirms
});

test('typed answers outrank platform data and are marked confirmed', () => {
  const stored: StoredProfile = { legalName: { value: 'Grace Chapel Detroit', at: 1 } };
  const p = buildProfile(org, stored, geo);
  assert.equal(p.legalName.value, 'Grace Chapel Detroit');
  assert.equal(p.legalName.source, 'you');
  assert.equal(p.legalName.confirmed, true);
});

test('address splitting and applicant kind', () => {
  assert.deepEqual(splitAddress('12 Oak St, Flint, mi 48502'), { street: '12 Oak St', city: 'Flint', state: 'MI', zip: '48502' });
  assert.deepEqual(splitAddress('Just a street'), { street: 'Just a street' });
  assert.equal(applicantKindForOrg({ orgType: 'CHURCH' }), 'church');
  assert.equal(applicantKindForOrg({ orgType: 'RESTAURANT' }), 'small-business');
});

test('validators: EIN, UEI, money, state, yes/no', () => {
  assert.deepEqual(validateValue('ein', '381234567'), { ok: true, value: '38-1234567' });
  assert.equal(validateValue('ein', '12-345').ok, false);
  assert.equal(validateValue('uei', 'ABCDEFGHJKLM').ok, true);
  assert.equal(validateValue('uei', 'OOOOOOOOOOOO').ok, false); // O is never used in a UEI
  assert.equal(validateValue('uei', 'short').ok, false);
  assert.deepEqual(validateValue('annualBudget', '$250k'), { ok: true, value: '250000' });
  assert.deepEqual(validateValue('state', 'mi'), { ok: true, value: 'MI' });
  assert.deepEqual(validateValue('taxExempt', 'yeah'), { ok: true, value: 'yes' });
  assert.equal(validateValue('repEmail', 'not-an-email').ok, false);
  assert.equal(parseMoney('1.2M'), 1200000);
  assert.equal(parseMoney('abc'), null);
});

test('readiness: slow registrations come first and a short deadline is flagged', () => {
  const p = buildProfile(org, {}, geo);
  const r = buildReadiness(p, { kind: 'church', closeDate: '2026-11-05', now: NOW });
  assert.ok(r.percentReady > 0 && r.percentReady < 100);
  const firstMissing = r.gaps.find(g => g.status === 'missing')!;
  assert.ok((firstMissing.leadTimeDays || 0) >= 14, `first missing was ${firstMissing.key}`);
  assert.ok(r.warnings.some(w => /SAM|days/.test(w)));
  assert.ok(r.blockingMissing >= 3);
  assert.equal(r.daysLeft, 12);
});

test('readiness: an expired SAM registration blocks even though a value exists', () => {
  const stored: StoredProfile = { samStatus: { value: 'expired', at: 1 }, uei: { value: 'ABCDEFGHJKLM', at: 1 } };
  const r = buildReadiness(buildProfile(org, stored, geo), { kind: 'nonprofit', now: NOW });
  assert.equal(r.gaps.find(g => g.key === 'samStatus')!.status, 'missing');
  assert.ok(r.warnings.some(w => /not active/.test(w)));
});

test('notice text adds needs; kinds change the needs and documents', () => {
  const r = buildReadiness(buildProfile(org, {}, geo), { kind: 'small-business', detail: { eligibilityText: 'Must have a Single Audit and negotiated indirect rate', summary: '' }, now: NOW });
  assert.ok(r.gaps.some(g => g.key === 'auditLevel'));
  assert.ok(r.gaps.some(g => g.key === 'indirectRate'));
  assert.ok(r.gaps.some(g => g.key === 'staffCount'));
  assert.ok(needsFor('church').some(n => n.key === 'determinationLetter'));
  assert.ok(documentsFor('church').some(d => d.id === 'irs'));
  assert.ok(documentsFor('small-business', { costSharing: true }).some(d => d.id === 'match'));
});

test('Aria asks confirmations before blanks, and finishes when nothing is open', () => {
  const p = buildProfile(org, {}, geo);
  const r = buildReadiness(p, { kind: 'church', now: NOW });
  const q = nextQuestion(r)!;
  assert.ok(q.confirm, 'a platform value should be confirmed first');
  assert.match(q.text, /Is that right\?/);
  // Confirm everything we have, then she should move to the slow blanks.
  const stored: StoredProfile = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { value: v.value, at: 1 }]));
  const r2 = buildReadiness(buildProfile(org, stored, geo), { kind: 'church', now: NOW });
  const q2 = nextQuestion(r2)!;
  assert.ok(!q2.confirm);
  assert.match(q2.text, /week|days/);
  assert.equal(nextQuestion(r2, r2.gaps.map(g => g.key)), null);
});

test('PDF field matching: names, camelCase, contact vs representative', () => {
  assert.equal(matchField('SF424_4_0:Applicant:LegalName[0]')?.key, 'legalName');
  assert.equal(matchField('EmployerTaxpayerIdentificationNumber')?.key, 'ein');
  assert.equal(matchField('Applicant_UEI')?.key, 'uei');
  assert.equal(matchField('ZipPostalCode')?.key, 'zip');
  assert.equal(matchField('Contact First Name')?.key, 'contactName');
  assert.equal(matchField('Contact First Name')?.part, 'first');
  assert.equal(matchField('Authorized Representative Email')?.key, 'repEmail');
  assert.equal(matchField('Email Address')?.key, 'contactEmail');
  assert.equal(matchField('Web Address')?.key, 'website');
  assert.equal(matchField('Street Address Line 1')?.key, 'street');
  assert.equal(matchField('Totally Unrelated Widget'), null);
  assert.ok(HUMAN_ONLY.test('Authorized Representative Signature'));
  assert.ok(HUMAN_ONLY.test('Date Signed'));
});

async function makeForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const names = ['LegalName', 'EIN', 'UEI', 'Street1', 'City', 'ZipPostalCode', 'ContactFirstName', 'ContactLastName', 'ContactEmail',
    'Signature of Authorized Representative', 'Date Signed', 'Mystery Box'];
  names.forEach((n, i) => { const f = form.createTextField(n); f.addToPage(page, { x: 40, y: 740 - i * 30, width: 300, height: 20 }); });
  const pre = form.getTextField('City'); pre.setText('Existing City');
  return doc.save();
}

test('PDF prefill fills known fields, leaves signatures and unknowns, and never overwrites typing', async () => {
  const p = buildProfile(org, { contactName: { value: 'Pat Rivera', at: 1 }, uei: { value: 'ABCDEFGHJKLM', at: 1 } }, geo);
  const res = await prefillPdf(await makeForm(), p);
  const by = Object.fromEntries(res.fields.map(f => [f.name, f]));
  assert.equal(by.LegalName.outcome, 'filled');
  assert.equal(by.EIN.value, '38-1234567');
  assert.equal(by.UEI.confirm, false); // typed by the person
  assert.equal(by.Street1.value, '1600 W Lafayette Blvd');
  assert.equal(by.ContactFirstName.value, 'Pat');
  assert.equal(by.ContactLastName.value, 'Rivera');
  assert.equal(by.City.outcome, 'skipped-nonempty');
  assert.equal(by['Signature of Authorized Representative'].outcome, 'needs-you');
  assert.equal(by['Date Signed'].outcome, 'needs-you');
  assert.equal(by['Mystery Box'].outcome, 'unmatched');
  // The saved file really carries the values and the signature stays blank.
  const out = await PDFDocument.load(res.bytes!);
  assert.equal(out.getForm().getTextField('LegalName').getText(), 'Grace Chapel of Detroit Inc.');
  assert.equal(out.getForm().getTextField('City').getText(), 'Existing City');
  assert.equal(out.getForm().getTextField('Signature of Authorized Representative').getText(), undefined);
});

test('PDF prefill reports honestly on unreadable and field-less files', async () => {
  const bad = await prefillPdf(new Uint8Array([1, 2, 3]), buildProfile(org, {}, geo));
  assert.match(bad.summary, /could not be opened/);
  const blank = await PDFDocument.create(); blank.addPage();
  const none = await prefillPdf(await blank.save(), buildProfile(org, {}, geo));
  assert.match(none.summary, /no fillable fields/);
  assert.equal(none.bytes, undefined);
});

test('SF-424 copy sheet: applicant code, never fills item 21, missing items say so', () => {
  const rows = sf424CopySheet(buildProfile(org, {}, geo), { agency: 'HUD', number: 'OFH-2600', title: 'Fair Housing' });
  const get = (item: string, label?: string) => rows.find(r => r.item === item && (!label || r.label.includes(label)))!;
  assert.match(get('9').value!, /^M — /);
  assert.equal(get('8a').value, 'Grace Chapel of Detroit Inc.');
  assert.equal(get('8c').action, 'missing');
  assert.equal(get('16a').value, 'MI-013');
  assert.equal(get('21').value, undefined);
  assert.equal(get('21').action, 'you-decide');
  assert.equal(get('20').action, 'missing'); // never defaulted
  assert.equal(get('10').value, 'HUD');
  assert.equal(SF424_APPLICANT_CODE['small-business'], 'R');
});

// ── Council ──────────────────────────────────────────────────────────────────

const facts = { profileLines: ['Legal name: Grace Chapel', 'People served per year: 1200'], userFacts: ['Our pantry fed 450 families in 2025.'] };
const notice = { title: 'Community Food Grant', agency: 'USDA', eligibilityText: 'Nonprofits', closeDate: '2026-12-01' };

const goodModel: ModelFn = async (system, _user) => {
  if (/chairing the Grant Council/.test(system)) {
    return JSON.stringify({ readiness: 'ready', headline: 'Strong.', topFixes: [{ fix: 'Add a source for the need statement', seat: 'PEER_REVIEWER' }], limits: 'Cannot see the full notice.' });
  }
  return '```json\n' + JSON.stringify({ score: 4, verdict: 'Good.', strengths: ['clear'], concerns: [], fixes: ['Cite your source'] }) + '\n```';
};

test('council: five seats review, Aria synthesizes, JSON in code fences is tolerated', async () => {
  const r = await reviewApplication({ model: goodModel, notice, facts, draft: 'We served 450 families.' });
  assert.equal(r.seats.length, SEATS.length);
  assert.equal(r.readiness, 'ready');
  assert.equal(r.topFixes[0].seat, 'PEER_REVIEWER');
});

test('council: "ready" is overruled by a low seat score or a compliance blocker', async () => {
  const model: ModelFn = async (system) => /chairing/.test(system)
    ? JSON.stringify({ readiness: 'ready', headline: 'Ship it', topFixes: [], limits: '' })
    : JSON.stringify({ score: /Compliance Officer|check that the applicant may legally/.test(system) ? 1 : 5, verdict: 'x', strengths: [], concerns: ['not eligible'], fixes: ['Register in SAM.gov'] });
  const r = await reviewApplication({ model, notice, facts, draft: 'text' });
  assert.equal(r.readiness, 'not-yet');
});

test('council: survives a seat failing, and fails clearly when all do', async () => {
  let n = 0;
  const flaky: ModelFn = async (system) => {
    if (/chairing/.test(system)) throw new Error('synth down');
    if (n++ === 0) throw new Error('seat down');
    return JSON.stringify({ score: 4, verdict: 'ok', strengths: [], concerns: [], fixes: ['f'] });
  };
  const r = await reviewApplication({ model: flaky, notice, facts, draft: 'x' });
  assert.equal(r.seats.length, SEATS.length - 1);
  assert.ok(['ready', 'revise', 'not-yet'].includes(r.readiness));
  await assert.rejects(reviewApplication({ model: async () => { throw new Error('down'); }, notice, facts, draft: 'x' }), /could not be reached/);
});

test('integrity: invented numbers are flagged, supplied ones are not, placeholders are found', () => {
  const src = 'People served: 1,200. Our pantry fed 450 families in 2025.';
  assert.deepEqual(findUnsupportedNumbers('We feed 450 families and serve 1200 people.', src), []);
  assert.deepEqual(findUnsupportedNumbers('We reduced hunger by 73% and raised $50,000.', src), ['73%', '$50,000']);
  assert.deepEqual(findUnsupportedNumbers('In 2024 we met 3 times.', src), []); // years and tiny numbers ignored
  assert.deepEqual(findUnsupportedNumbers('We served [NEEDS YOUR FACT: how many people, 5000].', src), []);
  assert.equal(extractPlaceholders('a [NEEDS YOUR FACT: x] b [NEEDS YOUR FACT: y]').length, 2);
});

test('drafting: carries the integrity rules in the prompt and reports unsupported numbers', async () => {
  let seen = '';
  const model: ModelFn = async (system) => { seen = system; return 'We fed 450 families and cut waste by 62%. Funding need: [NEEDS YOUR FACT: budget total].'; };
  const d = await draftSection({ model, section: 'need', notice, facts });
  assert.match(seen, /Never invent statistics/);
  assert.match(seen, /NEEDS YOUR FACT/);
  assert.deepEqual(d.unsupportedNumbers, ['62%']);
  assert.equal(d.placeholders.length, 1);
  await assert.rejects(draftSection({ model, section: 'nope', notice, facts }), /unknown section/);
  assert.equal(parseJson('not json'), null);
});

test('matcher input now accepts school, teacher and business kinds', () => {
  for (const kind of ['public-school', 'charter-school', 'private-school', 'homeschool-coop', 'teacher', 'small-business']) {
    assert.equal(sanitizeInput({ kind, topics: ['stem'] }).kind, kind);
  }
  assert.throws(() => sanitizeInput({ kind: 'teacher', topics: ['bogus'] }), /pick at least one/);
});
