import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCourtListenerAtom } from '../services/musicLaw/updates';
import { AUTHORITIES, CASES, WATCH } from '../data/musicLaw/library';
import { COURSE_MODULE } from '../data/practice/courses/law-music';
import { GOVERNANCE_RULES } from '../services/rightsDao/types';

test('CourtListener Atom: entries parse, foreign links drop, repeat dockets collapse', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Broadcast Music Inc v. Portside Investments LLC</title><link href="https://www.courtlistener.com/docket/71000001/12/broadcast-music/" rel="alternate"/><published>2026-10-29T00:00:00-04:00</published><author><name>District Court, D. South Carolina</name></author></entry>
    <entry><title>Broadcast Music Inc v. Portside Investments LLC</title><link href="https://www.courtlistener.com/docket/71000001/11/broadcast-music/" rel="alternate"/><published>2026-10-27T00:00:00-04:00</published><author><name>District Court, D. South Carolina</name></author></entry>
    <entry><title>Davidson v. J&amp;N Records, Inc.</title><link href="https://www.courtlistener.com/docket/71000002/1/davidson/" rel="alternate"/><published>2026-10-29T00:00:00-04:00</published><author><name>District Court, S.D. Florida</name></author></entry>
    <entry><title>Spoof</title><link href="https://evil.example/docket/1/" rel="alternate"/><published>2026-10-29</published></entry>
  </feed>`;
  const items = parseCourtListenerAtom(xml, WATCH.find(w => w.source === 'courtlistener-recap')!);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, '2026-10-29');
  assert.equal(items[1].title, 'Davidson v. J&N Records, Inc.');
  assert.equal(items[0].source, 'CourtListener · RECAP docket');
});

test('library: unique ids, every entry has a source link, cases carry a citation', () => {
  const ids = [...AUTHORITIES.map(a => a.id), ...CASES.map(c => c.id)];
  assert.equal(new Set(ids).size, ids.length);
  for (const a of AUTHORITIES) assert.ok(a.sources.length && a.sources.every(s => /^https:\/\//.test(s.url)), a.id);
  for (const c of CASES) {
    assert.ok(c.sources.length && c.sources.every(s => /^https:\/\//.test(s.url)), c.id);
    assert.match(c.cite, /\d+ (U\.S\.|F\.3d|F\.4th|F\. Supp\.) \d+/, c.id);
    for (const r of c.related || []) assert.ok(CASES.some(x => x.id === r), `${c.id} → ${r}`);
  }
});

test('law-music course: every question belongs to a lesson and mcq answers are in range', () => {
  const lessons = new Set(COURSE_MODULE.curriculum.tracks.flatMap(t => t.lessons.map(l => l.id)));
  assert.equal(lessons.size, 10);
  for (const q of COURSE_MODULE.bank.questions) {
    assert.ok(lessons.has(q.lessonId), q.id);
    if (q.kind === 'mcq') assert.ok(q.choices!.length === 4 && (q.answer as number) < 4, q.id);
  }
  for (const id of lessons) assert.ok(COURSE_MODULE.bank.questions.some(q => q.lessonId === id), `${id} has practice`);
});

test('rights DAO governance rules: thresholds are sane basis points', () => {
  for (const r of Object.values(GOVERNANCE_RULES)) {
    assert.ok(r.passBps > 5000 && r.passBps <= 10000, r.cls);
    assert.ok(r.quorumBps > 0 && r.quorumBps <= 10000, r.cls);
  }
  assert.equal(GOVERNANCE_RULES.MEMBERSHIP.operatorVeto, 'NONE');
});
