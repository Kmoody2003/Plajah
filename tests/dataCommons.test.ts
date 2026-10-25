import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFloodZone, summarizeDisasters, parseGeography } from '../services/dataCommons/place';
import {
  parseGrantsDate, normalizeHit, scoreOpportunity, sanitizeInput, daysUntil, normalizeDetail,
  ELIGIBILITY_BY_KIND, type GrantHit, type MatchInput,
} from '../services/dataCommons/grants';
import { normalizeDataset } from '../services/dataCommons/catalog';
import { cached, cleanText, clearDataCommonsCache, isValidLatLng, layer, prov } from '../services/dataCommons/core';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const input: MatchInput = { kind: 'nonprofit', topics: ['housing'], keywords: ['homeless'] };
const hit = (o: Partial<GrantHit> = {}): GrantHit => ({
  id: '1', number: 'X', title: 'Housing for the homeless', agencyCode: 'HUD', agency: 'Department of Housing and Urban Development',
  status: 'posted', closeDate: '2026-12-15', assistanceListings: [], ...o,
});

test('flood zone wording: SFHA vs minimal hazard, never claims safety', () => {
  assert.match(describeFloodZone('AE', true), /Special Flood Hazard Area.*flood insurance/);
  const x = describeFloodZone('X', false, 'AREA OF MINIMAL FLOOD HAZARD');
  assert.match(x, /not a guarantee/);
  assert.match(describeFloodZone('D', false), /undetermined/);
});

test('disasters count each disaster once and sort newest first', () => {
  const rows = [
    { disasterNumber: 1, declarationTitle: 'A', incidentType: 'Flood', declarationDate: '2020-01-01T00:00:00Z' },
    { disasterNumber: 1, declarationTitle: 'A', incidentType: 'Flood', declarationDate: '2020-01-01T00:00:00Z' },
    { disasterNumber: 2, declarationTitle: 'B', incidentType: 'Biological', declarationDate: '2021-03-01T00:00:00Z' },
    { disasterNumber: 3, declarationTitle: 'C', incidentType: 'Flood', declarationDate: '2024-06-01T00:00:00Z' },
  ];
  const s = summarizeDisasters(rows, 'Wayne County', 2016);
  assert.equal(s.declarations, 3);
  assert.equal(s.recent[0].number, 3);
  assert.deepEqual(s.byType[0], { type: 'Flood', count: 2 });
});

test('census geography parse tolerates missing layers', () => {
  assert.equal(parseGeography({}), null);
  const g = parseGeography({ result: { geographies: {
    States: [{ NAME: 'Michigan', STATE: '26' }], Counties: [{ NAME: 'Wayne County', COUNTY: '163' }],
    'Census Tracts': [{ GEOID: '26163521400' }],
  } } });
  assert.deepEqual(g, { state: 'Michigan', stateAbbr: undefined, stateFips: '26', county: 'Wayne County', countyFips: '163', tractGeoid: '26163521400', place: undefined });
});

test('lat/lng guard rejects non-US and garbage', () => {
  assert.equal(isValidLatLng(42.33, -83.05), true);
  assert.equal(isValidLatLng(51.5, -0.12), false);
  assert.equal(isValidLatLng(NaN, -83), false);
  assert.equal(isValidLatLng('42' as any, -83), false);
});

test('grants dates: MM/DD/YYYY to ISO, blank stays undefined', () => {
  assert.equal(parseGrantsDate('11/02/2026'), '2026-11-02');
  assert.equal(parseGrantsDate(''), undefined);
  assert.equal(parseGrantsDate('2026-11-02'), undefined);
  assert.equal(daysUntil('2026-10-26', NOW), 2);
});

test('normalizeHit decodes the Grants.gov row', () => {
  const h = normalizeHit({ id: 362827, number: 'N', title: 'Ambassador&rsquo;s Fund', agencyCode: 'HUD', agency: 'HUD',
    openDate: '07/02/2026', closeDate: '11/02/2026', oppStatus: 'posted', cfdaList: ['14.418'] })!;
  assert.equal(h.title, "Ambassador's Fund");
  assert.equal(h.closeDate, '2026-11-02');
  assert.equal(normalizeHit({ id: 1 }), null);
});

test('scoring rewards category + title fit, penalizes expired and last-minute', () => {
  const good = scoreOpportunity(hit(), { topicsHit: ['housing'], keywordsFound: ['homeless'], input }, NOW);
  assert.ok(good.relevance >= 50, `got ${good.relevance}`);
  assert.ok(good.reasons.some(r => /Funding category/.test(r)));

  const expired = scoreOpportunity(hit({ closeDate: '2026-09-01' }), { topicsHit: ['housing'], keywordsFound: [], input }, NOW);
  assert.ok(expired.relevance < good.relevance);
  assert.ok(expired.reasons.includes('Deadline has passed'));

  const tight = scoreOpportunity(hit({ closeDate: '2026-10-30' }), { topicsHit: ['housing'], keywordsFound: [], input }, NOW);
  assert.ok(tight.reasons.some(r => /Tight/.test(r)));

  const pref = scoreOpportunity(hit(), { topicsHit: [], keywordsFound: [], input: { ...input, preferredAgencies: ['HUD'] } }, NOW);
  assert.ok(pref.reasons.some(r => /preferred agency/.test(r)));
});

test('score is clamped to 0..100', () => {
  const s = scoreOpportunity(hit({ title: 'Unrelated notice', closeDate: '2026-09-01' }), { topicsHit: [], keywordsFound: [], input }, NOW);
  assert.equal(s.relevance, 0);
});

test('input validation: kinds, topics, and requiring something to search', () => {
  assert.throws(() => sanitizeInput({ kind: 'wizard', topics: ['housing'] }), /unknown applicant kind/);
  assert.throws(() => sanitizeInput({ kind: 'church', topics: ['nonsense'] }), /pick at least one/);
  const ok = sanitizeInput({ kind: 'church', topics: ['food', 'bogus'], keywords: ['  pantry ', ''] });
  assert.deepEqual(ok.topics, ['food']);
  assert.deepEqual(ok.keywords, ['pantry']);
  assert.ok(ELIGIBILITY_BY_KIND.church.includes('12'));
});

test('opportunity detail keeps eligibility text and parses award range', () => {
  const d = normalizeDetail({ data: { id: 7, opportunityNumber: 'N', opportunityTitle: 'T', owningAgencyCode: 'HUD',
    synopsis: { agencyName: 'HUD', synopsisDesc: '<p>Hello</p>', applicantEligibilityDesc: 'Must be 501(c)(3).',
      awardFloor: '500000', awardCeiling: '1500000', costSharing: false, responseDate: 'Nov 02, 2026 12:00:00 AM EST' } } })!;
  assert.equal(d.summary, 'Hello');
  assert.equal(d.awardCeiling, 1500000);
  assert.equal(d.closeDate, '2026-11-02');
  assert.match(d.link, /search-results-detail\/7$/);
});

test('catalog record normalizes distributions and drops non-http links', () => {
  const d = normalizeDataset({ title: 'Flood', slug: 'flood-x', identifier: 'id1', has_spatial: true,
    organization: { name: 'FEMA' }, keyword: ['flood'],
    dcat: { modified: '2024-05-01T00:00:00', distribution: [
      { format: 'CSV', downloadURL: 'https://x.gov/a.csv' }, { format: 'ZIP', downloadURL: 'ftp://nope' } ] } })!;
  assert.equal(d.distributions.length, 1);
  assert.equal(d.modified, '2024-05-01');
  assert.equal(d.landingPage, 'https://catalog.data.gov/dataset/flood-x');
  assert.equal(normalizeDataset({}), null);
});

test('layer reports an outage as unavailable, and an empty answer as none', async () => {
  const down = await layer(prov('A', 'B', 'https://x'), async () => { throw new Error('boom'); });
  assert.equal(down.status, 'unavailable');
  assert.equal(down.error, 'boom');
  const none = await layer(prov('A', 'B', 'https://x'), async () => null);
  assert.equal(none.status, 'none');
});

test('cache serves stale data on upstream failure', async () => {
  clearDataCommonsCache();
  assert.equal(await cached('k', 0, async () => 'fresh'), 'fresh');
  assert.equal(await cached('k', 0, async () => { throw new Error('down'); }), 'fresh');
  await assert.rejects(cached('other', 0, async () => { throw new Error('down'); }), /down/);
});

test('cleanText decodes the entities federal feeds emit and strips tags', () => {
  assert.equal(cleanText('ROSS-SC Program &ndash; Fiscal Year 2026'), 'ROSS-SC Program – Fiscal Year 2026');
  assert.equal(cleanText('<p>Tom &amp; Jerry&#39;s</p>'), "Tom & Jerry's");
  assert.equal(cleanText('&unknownthing; stays'), '&unknownthing; stays');
});
