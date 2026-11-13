import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_NOTES, NEW_FROM_ARIA, STEP, guardNotes, mergeIntoPage, notesToBlocks, parseNotes, parsePresence,
  recapMessage, rulesStep, shouldStep, stepPrompt, wakeRequest, type AriaLine, type AriaNotes,
} from '../services/meetings/ariaMeetingCore';

const T0 = 1_700_000_000_000;
const line = (name: string, text: string, s: number): AriaLine => ({ uid: name.toLowerCase(), name, text, at: T0 + s * 1000 });

test('wake phrase: addressed vs. mentioned', () => {
  assert.equal(wakeRequest('Aria, put the budget in the notes.'), 'put the budget in the notes');
  assert.equal(wakeRequest('ok so hey Aria draft an agenda for Sunday'), 'draft an agenda for Sunday');
  assert.equal(wakeRequest('That was great. Aria: what did we decide?'), 'what did we decide?'.replace(/\?$/, ''));
  assert.equal(wakeRequest('Maria, can you send it?'), null);
  assert.equal(wakeRequest('I told Aria about it yesterday'), null);
  assert.equal(wakeRequest('Aria'), null);
});

test('shouldStep: pacing, wake requests, idle flush, never while in flight', () => {
  const c = { lastStepAt: T0, cursor: 0, inFlight: false };
  assert.equal(shouldStep(c, 2, 0, T0 + 30_000), false, 'too few lines');
  assert.equal(shouldStep(c, 3, 0, T0 + 10_000), false, 'too soon');
  assert.equal(shouldStep(c, 3, 0, T0 + STEP.minGapMs), true);
  assert.equal(shouldStep(c, 0, 1, T0 + STEP.wakeGapMs), true, 'wake request goes fast');
  assert.equal(shouldStep(c, 1, 0, T0 + STEP.idleFlushMs), true, 'idle flush');
  assert.equal(shouldStep({ ...c, inFlight: true }, 50, 2, T0 + 999_999), false);
});

test('stepPrompt carries notes, context, new lines and requests', () => {
  const tr = [line('Ana', 'We start at nine.', 1), line('Ben', 'Sounds good.', 5), line('Ana', 'Ben, can you bring chairs?', 9)];
  const p = stepPrompt({ title: 'Youth night', notes: { ...EMPTY_NOTES, summary: 'Planning.' }, transcript: tr, cursor: 2, startedAt: T0, pending: [{ request: 'list the volunteers', by: 'Ana' }] });
  assert.match(p, /Meeting: Youth night/);
  assert.match(p, /"summary":"Planning\."/);
  assert.match(p, /Just before[\s\S]*Ben: Sounds good/);
  assert.match(p, /New transcript:\n\[0:09\] Ana: Ben, can you bring chairs\?/);
  assert.match(p, /- Ana: list the volunteers/);
});

test('parseNotes: fences, junk, owners, caps, duplicates', () => {
  const n = parseNotes('```json\n{"summary":"We met.","decisions":["Go with Saturday","go with saturday!"],"actions":[{"text":"Bring chairs","owner":"Ben"},{"text":"Book room","owner":null},"Print flyers"],"questions":["Who drives?"],"requests":[{"request":"agenda","by":"Ana","response":"1. Welcome"}]}\n```');
  assert.ok(n);
  assert.deepEqual(n!.decisions, ['Go with Saturday']);
  assert.deepEqual(n!.actions, [{ text: 'Bring chairs', owner: 'Ben' }, { text: 'Book room' }, { text: 'Print flyers' }]);
  assert.equal(n!.requests.length, 1);
  assert.equal(parseNotes('sorry, I cannot'), null);
  assert.equal(parseNotes('{"summary":""}'), null);
  const big = parseNotes(JSON.stringify({ summary: 'x', actions: Array.from({ length: 80 }, (_, i) => `task ${i}`) }));
  assert.equal(big!.actions.length, 25);
});

test('guardNotes keeps the record when a reply collapses, keeps answered requests', () => {
  const prev: AriaNotes = { summary: 'a', decisions: ['d1', 'd2', 'd3', 'd4'], actions: [{ text: 'a1' }], questions: ['q1'], requests: [{ request: 'r1', by: 'A', response: 'x' }] };
  const next: AriaNotes = { summary: '', decisions: ['d1'], actions: [{ text: 'a1' }, { text: 'a2' }], questions: [], requests: [] };
  const g = guardNotes(prev, next);
  assert.equal(g.summary, 'a');
  assert.deepEqual(g.decisions, ['d1', 'd2', 'd3', 'd4']);
  assert.equal(g.actions.length, 2);
  assert.deepEqual(g.questions, [], 'answered questions may drop');
  assert.equal(g.requests.length, 1);
});

test('rulesStep: no model, finds actions/decisions/questions, notes requests', () => {
  const tr = [line('Ana', 'Aria, what have we decided so far?', 0), line('Ana', 'We decided to meet on Saturday.', 1), line('Ana', 'Ben, can you bring the chairs by Friday?', 4), line('Ben', 'Who is driving the van this time?', 8)];
  const n = rulesStep(EMPTY_NOTES, tr, 0, [{ request: 'make a list', by: 'Ana' }]);
  assert.equal(n.decisions.length, 1);
  assert.equal(n.actions[0].owner, 'Ben');
  assert.deepEqual(n.questions, ['Who is driving the van this time?']);
  assert.match(n.requests[0].response, /notes-only/);
  assert.match(n.summary, /2 people/);
});

test('notesToBlocks: stable ids, sections only when present', () => {
  const notes: AriaNotes = { summary: 'S', decisions: ['D'], actions: [{ text: 'A', owner: 'Ben' }], questions: [], requests: [{ request: 'R', by: 'Ana', response: 'Ans' }] };
  const meta = { title: 'Plan', startedAt: T0, speakers: ['Ana', 'Ben'], lane: 'cloud' as const, live: true };
  const a = notesToBlocks(notes, meta), b = notesToBlocks(notes, meta);
  assert.deepEqual(a.map(x => x.id), b.map(x => x.id));
  const texts = a.map(x => x.text);
  assert.ok(texts.includes('Ben: A'));
  assert.ok(!texts.includes('Open questions'));
  assert.ok(texts.includes('Asked of Aria'));
  assert.equal(new Set(a.map(x => x.id)).size, a.length);
  const dup = notesToBlocks({ ...notes, decisions: ['Same', 'Same'] }, meta);
  assert.equal(new Set(dup.map(x => x.id)).size, dup.length);
});

test('mergeIntoPage: Aria replaces its own page, never a person\'s edits', () => {
  const meta = { title: 'Plan', startedAt: T0, speakers: ['Ana'], lane: 'rules' as const, live: true };
  const v1 = notesToBlocks({ ...EMPTY_NOTES, summary: 'one', actions: [{ text: 'a1' }] }, meta);
  const v2 = notesToBlocks({ ...EMPTY_NOTES, summary: 'two', actions: [{ text: 'a1' }, { text: 'a2' }] }, meta);
  // Untouched → replace.
  const r1 = mergeIntoPage(v1, v1, v2);
  assert.equal(r1.humanEdited, false);
  assert.equal(r1.blocks, v2);
  // A person rewrote a line → keep theirs, append only the new item.
  const edited = v1.map(b => (b.text === 'a1' ? { ...b, text: 'a1 (Ana will do it)' } : b));
  const r2 = mergeIntoPage(edited, v1, v2);
  assert.equal(r2.humanEdited, true);
  assert.ok(r2.blocks.some(b => b.text === 'a1 (Ana will do it)'));
  assert.ok(r2.blocks.some(b => b.text === 'two'), 'an untouched summary stays current');
  // A summary the person rewrote is theirs.
  const ownSummary = v1.map(b => (b.text === 'one' ? { ...b, text: 'Our summary.' } : b));
  const r2b = mergeIntoPage(ownSummary, v1, v2);
  assert.ok(r2b.blocks.some(b => b.text === 'Our summary.') && !r2b.blocks.some(b => b.text === 'two'));
  assert.equal(r2.blocks.filter(b => b.text === NEW_FROM_ARIA).length, 1);
  assert.equal(r2.blocks[r2.blocks.length - 1].text, 'a2');
  // Next step: header not repeated, nothing new → unchanged.
  const r3 = mergeIntoPage(r2.blocks, v2, v2);
  assert.equal(r3.changed, false);
  assert.equal(r3.blocks, r2.blocks);
});

test('recap message and presence parsing', () => {
  const m = recapMessage({ ...EMPTY_NOTES, summary: 'We planned.', actions: [{ text: 'Chairs', owner: 'Ben' }] }, 'Youth night', 25 * 60_000);
  assert.match(m, /Youth night \(25 min\)/);
  assert.match(m, /• Ben: Chairs/);
  assert.deepEqual(parsePresence({ on: true, hostUid: 'u1', hostName: 'Ana', lane: 'weird', startedAt: 5 }), { on: true, hostUid: 'u1', hostName: 'Ana', lane: 'rules', startedAt: 5 });
  assert.equal(parsePresence({ on: 'yes' }), null);
});
