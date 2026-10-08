import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAllCourses } from '../scripts/content/lib';
import { loadConnections, SIM_DISCIPLINE } from '../data/connections';
import { loadTraditionNotes } from '../data/traditionNotes';
import { FAITH_READINGS } from '../data/faithReadings';
import { parseRef } from '../services/scriptureRef';

const labsIds = new Set(['physics', 'chemistry', 'biology', 'cs', 'engineering', 'mathematics', 'neuroscience', 'earth', 'astronomy', 'data', 'environment', 'networks', 'history', 'architecture', 'archaeology', 'combat']);

test('every cross-curricular connection points at real lessons, simulators and Labs disciplines', async () => {
  const courses = await loadAllCourses();
  const lessons = new Set(courses.flatMap(c => c.curriculum.tracks.flatMap(t => t.lessons.map(l => `${c.id}::${l.id}`))));
  const sims = new Set(Object.keys(SIM_DISCIPLINE));
  const conns = await loadConnections();
  const seen = new Set<string>(); const perFrom: Record<string, number> = {};
  for (const c of conns) {
    const from = `${c.from.courseId}::${c.from.lessonId}`;
    assert.ok(lessons.has(from), `connection from unknown lesson ${from}`);
    let key: string;
    if ('lessonId' in c.to) { const to = `${c.to.courseId}::${c.to.lessonId}`; assert.ok(lessons.has(to), `connection to unknown lesson ${to}`); assert.notEqual(c.to.courseId, c.from.courseId, `${from} links within its own course`); key = `${from}>${to}`; }  // a reversed pair authored from both ends is harmless: the reader de-duplicates by target
    else if ('sim' in c.to) { assert.ok(sims.has(c.to.sim), `unknown simulator ${c.to.sim}`); key = `${from}>sim:${c.to.sim}`; }
    else { assert.ok(labsIds.has(c.to.labs), `unknown labs discipline ${c.to.labs}`); key = `${from}>labs:${c.to.labs}`; }
    assert.ok(!seen.has(key), `duplicate connection ${key}`); seen.add(key);
    perFrom[from] = (perFrom[from] || 0) + 1; assert.ok(perFrom[from] <= 6, `${from} has more than 6 connections`);
    assert.ok(c.why.length >= 30 && c.why.length <= 260, `why length for ${key}`);
  }
});

test('tradition notes point at real lessons and parse as scripture; faith readings are unique', async () => {
  const courses = await loadAllCourses();
  const lessons = new Set(courses.flatMap(c => c.curriculum.tracks.flatMap(t => t.lessons.map(l => `${c.id}::${l.id}`))));
  for (const n of await loadTraditionNotes()) {
    assert.ok(lessons.has(`${n.courseId}::${n.lessonId}`), `tradition note for unknown lesson ${n.courseId}::${n.lessonId}`);
    for (const p of n.passages) assert.ok(parseRef(p), `scripture reference does not parse: ${p}`);
    assert.ok(n.connection.length > 20, 'connection text too short');
  }
  const ids = FAITH_READINGS.map(r => r.gutenbergId); assert.equal(new Set(ids).size, ids.length, 'duplicate Gutenberg ids');
});
