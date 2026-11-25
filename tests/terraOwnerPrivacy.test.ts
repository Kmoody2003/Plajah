import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOwner, applyOwnerPolicy, scrubRaw, personalRawKeys } from '../services/terra/ownerPrivacy';
import { normalizeParcel, normalizeBlightTicket } from '../services/terra/detroitAdapter';
import { COUNTY_SOURCES, officialRecordUrl } from '../services/terra/countyParcels';

test('organizations are recognised; people, trusts and estates are not', () => {
  // 'GREATER GRACE TEMPLE' (no second clue) is deliberately kept private: misses err toward privacy.
  for (const org of ['DETROIT LAND BANK AUTHORITY', 'CITY OF DETROIT-P&DD', 'ABC HOLDINGS LLC', 'GREATER GRACE BAPTIST TEMPLE',
    'WAYNE COUNTY TREASURER', 'FANNIE MAE', 'CHASE BANK TRUST CO', 'DETROIT HOUSING COMMISSION', 'ST. JOHN MINISTRIES INC',
    'SMITH PROPERTIES', 'MICHIGAN LAND BANK FAST TRACK AUTHORITY', 'DTE ELECTRIC COMPANY'])
    assert.equal(classifyOwner(org), org === 'FANNIE MAE' ? 'individual' : 'organization', org);
  for (const person of ['SMITH, JOHN', 'JOHN A SMITH', 'MARY JONES & ROBERT JONES', 'JOHN SMITH TRUST', 'SMITH FAMILY TRUST',
    'ESTATE OF MARY JONES', 'JONES, MARY ET AL', 'COOPER JOHN', 'NA', '', undefined])
    assert.equal(classifyOwner(person as any), 'individual', String(person));
});

// Real Detroit roll shapes that tripped the first version (2026-11-25 sample of 3,000).
test('names that are also org words, and people co-owning with companies, stay private', () => {
  for (const person of ['PHAM, CHAU VAN & TRAN, HUYNH-HOA TH', 'LOVE, MICO/ DOUBLE P ENTERPRSES LLC',
    'LUREPI PROPERTIES LLC,PITMAN et al', 'JOHN CHURCH', 'CHURCH, MARY', 'TEMPLE ANN', 'LODGE, ROBERT J',
    'MARY ANN TEMPLE', 'SCHOOL ANNA-MARIE-VELLINGA ALYSSA-', 'COLLEGE JAN PIETER'])
    assert.equal(classifyOwner(person), 'individual', person);
  for (const org of ['10410 EAST JEFFERSON, LLC', 'City of Detroit P&DD, Care of DBA', 'OUR LADY OF GUADALUPE PARISH',
    'NORTOWN HOMES II LDHA LP', 'UNITED STATES POSTAL SERVICE', 'HISTORIC BOSTON EDISON ASSN', 'ASM REALTY HOLDINGS, LLC'])
    assert.equal(classifyOwner(org), 'organization', org);
});

test('a private owner never survives normalization; an organization does', () => {
  const person = normalizeParcel({ properties: { parcel_id: '02001910-5', address: '1 MAIN', taxpayer_1: 'SMITH, JOHN', taxpayer_street: '9 ELM ST' } })!;
  assert.equal(person.ownerKind, 'individual');
  assert.equal(person.taxpayerName, undefined);
  assert.equal(person.taxpayerAddress, undefined);
  assert.ok(!JSON.stringify(person).includes('SMITH'));

  const org = normalizeParcel({ properties: { parcel_id: '02001911-6', taxpayer_1: 'DETROIT LAND BANK AUTHORITY', taxpayer_street: '500 GRISWOLD' } })!;
  assert.equal(org.ownerKind, 'organization');
  assert.equal(org.taxpayerName, 'DETROIT LAND BANK AUTHORITY');

  const ottawa = COUNTY_SOURCES.ottawa.normalize({ properties: { FinalPIN: '70-14-17-408-017', OwnerName: 'DAVIS SONDRA', MailingAddress: '1 X' } })!;
  const kept = applyOwnerPolicy(ottawa, COUNTY_SOURCES.ottawa.ownerPolicy);
  assert.equal(kept.ownerKind, 'individual');
  assert.ok(!JSON.stringify(kept).includes('DAVIS'));
});

test("'none' policy drops even organizations", () => {
  const r = applyOwnerPolicy<{ taxpayerName?: string; taxpayerAddress?: string; ownerKind?: 'organization' | 'individual' }>({ taxpayerName: 'ABC LLC', taxpayerAddress: '1 X' }, 'none');
  assert.equal(r.taxpayerName, undefined);
  assert.equal(r.ownerKind, 'organization');
});

// Public concern stays public: the ticket, organizations responsible for the
// property, and officials acting in their role. Only a private owner's identity goes.
test('blight tickets keep the violation, officials and organization owners; private owners are removed', () => {
  const base = { ticket_number: 'T1', ordinance_description: 'Excessive weeds', amt_balance_due: 250,
    inspector_name: 'Officer X', agency_name: 'BSEED', residential_units: 2, street_name: 'MAIN' };
  const privateRaw = { ...base, property_owner_name: 'SMITH, JOHN', property_owner_address: '9 ELM',
    property_owner_zip_code: '48201', property_owner_id: 'P1', contact_phone: '313-555-0100' };
  const t = normalizeBlightTicket({ properties: privateRaw })!;
  assert.deepEqual(Object.keys(t.raw!).sort(), Object.keys(base).sort());
  assert.ok(!JSON.stringify(t.raw).includes('SMITH'));

  const orgRaw = { ...base, property_owner_name: 'ACME HOLDINGS LLC', property_owner_address: '1 WOODWARD',
    property_owner_zip_code: '48226', contact_phone: '313-555-0100' };
  const kept = scrubRaw(orgRaw)!;
  assert.equal(kept.property_owner_name, 'ACME HOLDINGS LLC');
  assert.equal(kept.property_owner_address, '1 WOODWARD');
  assert.equal(kept.inspector_name, 'Officer X');
  assert.equal(kept.contact_phone, undefined); // contact details never stored
  assert.deepEqual(personalRawKeys(orgRaw), ['contact_phone']);
  assert.equal(scrubRaw(undefined), undefined);
});

test('each parcel links to the publisher’s own record', () => {
  assert.match(officialRecordUrl({ jurisdiction: 'detroit', parcelNumber: '02001910-5' })!, /parcel_file_current\/FeatureServer\/0\/query\?where=parcel_id%20%3D%20'02001910-5'.*f=html/);
  assert.match(officialRecordUrl({ jurisdiction: 'oakland', parcelNumber: '2504276018' })!, /oakgov\.com.*PIN%20%3D%20'2504276018'/);
  assert.match(officialRecordUrl({ jurisdiction: 'ottawa', parcelNumber: "70-14-17-408-017" })!, /miottawa\.org.*FinalPIN/);
});
