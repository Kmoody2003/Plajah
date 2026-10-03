import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchlist, parseCaseRef } from '../services/livingKnowledge/watchlist';
import { classify, queryFor as pmQuery } from '../services/livingKnowledge/pubmed';
import { queryFor as clQuery, levelOf } from '../services/livingKnowledge/courtlistener';
import { parseRss, mentions, FEEDS } from '../services/livingKnowledge/feeds';
import { impactsFor, legalImpact, medicalImpact } from '../services/livingKnowledge/ingest';
import type { KnowledgeItem } from '../services/livingKnowledge/types';

const cur: any = { id: 'law-conlaw', label: 'x', blurb: '', accent: '#000000', tracks: [{ id: 't', title: '', blurb: '', lessons: [
  { id: 'law-conlaw.l01', title: '', blurb: '', anchors: [{ kind: 'case', ref: 'Marbury v. Madison|1803|US' }, { kind: 'concept', ref: 'judicial review' }] },
  { id: 'law-conlaw.l02', title: '', blurb: '', anchors: [{ kind: 'case', ref: 'marbury v. madison|1803|US' }] },
] }] };

test('watchlist dedupes anchors across lessons and infers the domain', () => {
  const w = buildWatchlist([cur, { ...cur, id: 'notacourse' }]);
  assert.equal(w.length, 2);
  const m = w.find(t => t.kind === 'case')!;
  assert.equal(m.domain, 'law'); assert.equal(m.lessons.length, 2);
});

test('case refs parse', () => assert.deepEqual(parseCaseRef('Marbury v. Madison|1803|US'), { name: 'Marbury v. Madison', year: 1803, court: 'US' }));

test('pubmed: evidence tiers, retractions beat everything, preprints are not peer reviewed', () => {
  assert.equal(classify(['Journal Article', 'Meta-Analysis']).tier, 'synthesis');
  assert.equal(classify(['Randomized Controlled Trial']).kind, 'trial');
  assert.equal(classify(['Practice Guideline']).kind, 'guideline');
  assert.equal(classify(['Journal Article', 'Retracted Publication', 'Randomized Controlled Trial']).kind, 'retraction');
  assert.equal(classify(['Preprint']).peerReviewed, false);
  assert.equal(classify(['Case Reports']).tier, 'other');
});

test('pubmed queries are built per anchor kind and sanitised', () => {
  assert.match(pmQuery('mesh', 'Diabetes Mellitus, Type 2')!, /MeSH Major Topic/);
  assert.match(pmQuery('guideline', 'ACC/AHA, Hypertension, 2017')!, /"Hypertension"\[Title\]/);
  assert.equal(pmQuery('case', 'x'), null);
  assert.ok(!pmQuery('drug', 'met"formin[x]')!.includes('[x]'));
});

test('courtlistener: only high courts, treatment query for cases only', () => {
  assert.equal(levelOf('scotus', 'F'), 'supreme-federal'); assert.equal(levelOf('ca9', 'F'), 'federal-appellate');
  assert.equal(levelOf('cal', 'S'), 'state-supreme'); assert.equal(levelOf('nysupct', 'ST'), null);
  assert.equal(clQuery('case', 'Roe v. Wade|1973|US')!.treatment, true);
  assert.equal(clQuery('concept', 'judicial review')!.treatment, false);
  assert.equal(clQuery('mesh', 'x'), null);
});

test('rss parsing handles CDATA, entities and rejects non-links', () => {
  const xml = `<rss><channel><item><title><![CDATA[FDA warns about Metformin &amp; lactic acidosis]]></title><link>https://x.test/a</link><pubDate>Tue, 29 Sep 2026 10:00:00 GMT</pubDate><description>desc</description></item><item><title>no link</title></item></channel></rss>`;
  const items = parseRss(xml, FEEDS[0], Date.parse('2026-10-01'));
  assert.equal(items.length, 1); assert.equal(items[0].title, 'FDA warns about Metformin & lactic acidosis'); assert.equal(items[0].date, '2026-09-29');
  assert.ok(mentions(items[0], 'metformin')); assert.ok(!mentions(items[0], 'met'));
});

test('impacts are idempotent per item+lesson and retractions/guidelines/overrulings need review', () => {
  const t = buildWatchlist([cur])[0];
  const it: KnowledgeItem = { id: 'cl_1', domain: 'law', source: 'courtlistener', kind: 'opinion', tier: 'court-binding', title: 'A v. B', date: '2026-09-01', url: 'u', peerReviewed: false, fetchedAt: 0, court: { id: 'scotus', name: 'x', level: 'supreme-federal' } };
  const a = impactsFor(it, t, 'review', 'r'); const b = impactsFor(it, t, 'review', 'r');
  assert.deepEqual(a.map(x => x.id), b.map(x => x.id)); assert.equal(a.length, 2);
  assert.equal(legalImpact(it, t, true).severity, 'review'); assert.equal(legalImpact(it, t, false).severity, 'new');
  const mk = (kind: any): KnowledgeItem => ({ ...it, id: 'pm_1', domain: 'medicine', kind });
  const md = { ...t, kind: 'drug' as const, ref: 'metformin' };
  assert.equal(medicalImpact(mk('retraction'), md).severity, 'review'); assert.equal(medicalImpact(mk('guideline'), md).severity, 'review'); assert.equal(medicalImpact(mk('trial'), md).severity, 'new');
});
