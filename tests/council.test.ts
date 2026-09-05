import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNCIL_DIRECTORS, COUNCIL_LIST, emptyProfile, seedPortfolio } from '../services/council/councilDirectors';
import { COUNCIL_DIRECTOR_IDS, type CouncilDirectorId } from '../services/council/councilTypes';
import { directorSystem, disputeUser, parseJson, proposalUser, readDispute, readProposal, readSynthesis, reflectionUser, researchUser, synthesisSystem, synthesisUser } from '../services/council/councilPrompts';
import { DATA_VIZ_ART_DIRECTIONS } from '../services/fabula/dataVizArtDirection';
import { FABULA_BROADCAST_PACKS } from '../services/fabula/broadcastPacks';

test('six directors, each a whole person, each carrying a real identity in the art-direction spec', () => {
  assert.equal(COUNCIL_LIST.length, 6);
  for (const id of COUNCIL_DIRECTOR_IDS) {
    const d = COUNCIL_DIRECTORS[id];
    assert.ok(d.name && d.epithet && d.medium && d.conviction && d.challenges && d.protects, `${id} is missing a lens field`);
    assert.ok(d.voice.length > 40, `${id} has no voice`);
    assert.ok(d.questions.length >= 3, `${id} asks fewer than three questions of a brief`);
    assert.ok(d.researchBeats.length >= 3, `${id} has nothing to research`);
    assert.ok(Object.keys(d.tensions).length >= 2, `${id} has no standing arguments`);
    assert.ok(DATA_VIZ_ART_DIRECTIONS[d.councilStyle], `${id} points at a council style that does not exist`);
    for (const other of Object.keys(d.tensions)) assert.notEqual(other, id, `${id} argues with itself`);
  }
  // Tension is a two-way street somewhere: every director is argued WITH by at least one other.
  for (const id of COUNCIL_DIRECTOR_IDS) {
    const arguedWith = COUNCIL_DIRECTOR_IDS.some(o => o !== id && id in COUNCIL_DIRECTORS[o].tensions);
    assert.ok(arguedWith, `nobody on the team argues with ${id}`);
  }
});

test('a director\'s portfolio is read from the shipped libraries, not declared', () => {
  const rebel = seedPortfolio('REBEL', { packs: FABULA_BROADCAST_PACKS });
  assert.ok(rebel.length >= 5, `the Rebel led ${rebel.length} broadcast identities`);
  assert.ok(rebel.every(p => FABULA_BROADCAST_PACKS.find(x => x.id === p.id)?.councilStyle === 'REBEL'));
  const p = emptyProfile('REBEL', rebel);
  assert.equal(p.ledCount, 0); assert.equal(p.styleNotes.length, 0);
});

test('prompts carry the method, the person, and how their taste has moved', () => {
  const sys = directorSystem('CLASSICAL', { ...emptyProfile('CLASSICAL'), styleNotes: [{ at: 1, text: 'A rule I now hold: the measure first.' }], influences: [{ at: 1, topic: 'Van de Graaf', finding: 'The canon divides the page in ninths.', note: '' }] });
  assert.match(sys, /Classical Mind/); assert.match(sys, /synthesize without averaging/i); assert.match(sys, /measure first/); assert.match(sys, /ninths/);
  assert.match(sys, /You are not Aria/);
  const user = proposalUser({ ask: 'A title sequence for a documentary about Detroit techno.', audience: 'music fans' }, ['REBEL', 'FUTURIST']);
  assert.match(user, /Detroit techno/); assert.match(user, /"arguesWith"/); assert.match(user, /REBEL\|FUTURIST/);
  assert.match(synthesisSystem(), /the council|the team/); assert.match(synthesisSystem(), /at most two directors/);
  assert.match(researchUser('WORLD_ECLECTIC', 'Dancheong'), /Dancheong/); assert.match(researchUser('WORLD_ECLECTIC', 'Dancheong'), /Do not invent/);
});

test('readers are strict where the method needs them to be', () => {
  // JSON may arrive fenced or wrapped in prose.
  assert.deepEqual(parseJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('noise {"a":{"b":2}} trailing'), { a: { b: 2 } });
  assert.equal(parseJson('nothing here'), null);

  const p = readProposal('REBEL', { title: 'Torn Sheet', idea: 'One sheet tears.', geometry: 'g', typography: 't', imageLogic: 'i', texture: 'x', motion: 'm', productionMethod: 'p', humanTrace: 'h', risk: 'r', arguesWith: { directorId: 'REBEL', why: 'self' } });
  assert.ok(p); assert.equal(p!.arguesWith, undefined, 'a director cannot argue with themselves');
  assert.equal(readProposal('REBEL', { title: 'x' }), null, 'a proposal without an idea is not a proposal');

  assert.equal(readDispute('REBEL', { against: 'REBEL', objection: 'me' }, ['REBEL', 'CLASSICAL']), null);
  assert.equal(readDispute('REBEL', { against: 'BAROQUE', objection: 'absent' }, ['REBEL', 'CLASSICAL']), null, 'cannot object to someone not in the room');
  assert.ok(readDispute('REBEL', { against: 'CLASSICAL', objection: 'Your hierarchy is a cage.' }, ['REBEL', 'CLASSICAL']));

  // Synthesis without averaging means three different people in three roles, always.
  const ids: CouncilDirectorId[] = ['CLASSICAL', 'REBEL', 'FUTURIST'];
  const s = readSynthesis({ lead: 'REBEL', counterpoint: 'REBEL', editor: 'REBEL', direction: 'd', ariaSummary: 'a', quotes: [{ directorId: 'REBEL', line: 'x' }, { directorId: 'CLASSICAL', line: 'y' }, { directorId: 'FUTURIST', line: 'z' }] }, ids);
  assert.ok(s); assert.equal(s!.lead, 'REBEL'); assert.notEqual(s!.counterpoint, s!.lead); assert.notEqual(s!.editor, s!.lead); assert.notEqual(s!.editor, s!.counterpoint);
  assert.equal(s!.quotes.length, 2, 'Aria quotes at most two directors');
  assert.equal(readSynthesis({ lead: 'BAROQUE', direction: 'd', ariaSummary: 'a' }, ids), null, 'the lead must have been in the room');
});

test('dispute and reflection prompts are about the work on the table', () => {
  const proposals = [readProposal('REBEL', { title: 'Torn', idea: 'tear', geometry: 'g', typography: 't', imageLogic: 'i', texture: 'x', motion: 'm', productionMethod: 'p', humanTrace: 'h', risk: 'r' })!, readProposal('CLASSICAL', { title: 'Measured', idea: 'measure', geometry: 'g', typography: 't', imageLogic: 'i', texture: 'x', motion: 'm', productionMethod: 'p', humanTrace: 'h', risk: 'r' })!];
  const du = disputeUser('REBEL', proposals);
  assert.match(du, /Measured/); assert.ok(!/"Torn"/.test(du), 'a director is not asked to dispute their own proposal');
  const su = synthesisUser({ ask: 'brief' }, proposals, [{ from: 'REBEL', against: 'CLASSICAL', objection: 'cage' }]);
  assert.match(su, /cage/); assert.match(su, /\[REBEL\]/);
  const ru = reflectionUser('REBEL', { id: 'x', uid: 'u', createdAt: 0, depth: 'FULL', status: 'DONE', brief: { ask: 'b' }, directors: ['REBEL', 'CLASSICAL'], proposals, disputes: [], reflections: [], synthesis: { lead: 'CLASSICAL', counterpoint: 'REBEL', editor: 'CLASSICAL', direction: 'go classical', keepFromCounterpoint: 'k', editorCut: 'e', openDecision: 'o', ariaSummary: 's', quotes: [] } });
  assert.match(ru, /you were the counterpoint/); assert.match(ru, /go classical/);
});

test('the four-round protocol runs end to end: propose, dispute, synthesise, reflect — and the team changes', async () => {
  const { createCouncil } = await import('../services/council/councilRoutes');
  // An in-memory store standing in for Firestore, and a scripted model that answers as whoever the system prompt says it is.
  const mem = new Map<string, any>();
  const store = { get: async (p: string) => mem.get(p) ?? null, set: async (p: string, o: any) => { mem.set(p, JSON.parse(JSON.stringify(o))); return true; }, list: async () => [...mem.values()] };
  const who = (system: string): CouncilDirectorId => (COUNCIL_DIRECTOR_IDS.find(id => system.startsWith('You are ' + COUNCIL_DIRECTORS[id].name)) ?? 'CLASSICAL');
  const calls: string[] = [];
  const model = async (system: string, user: string) => {
    if (system.startsWith('You are Aria')) { calls.push('synthesis'); return JSON.stringify({ lead: 'REBEL', counterpoint: 'CLASSICAL', editor: 'RADICAL_MINIMAL', direction: 'Torn paper over a measured grid, one hairline.', keepFromCounterpoint: 'the measure', editorCut: 'the second colour', openDecision: 'Whether the tear is animated or cut.', ariaSummary: 'The council split down the middle on this one. The team kept the measure. I went with the tear.', quotes: [{ directorId: 'REBEL', line: 'Leave the evidence in.' }] }); }
    const me = who(system);
    if (user.startsWith('The other proposals')) { calls.push(`dispute:${me}`); const against = me === 'REBEL' ? 'CLASSICAL' : 'REBEL'; return `Sure:\n\`\`\`json\n${JSON.stringify({ against, objection: `${me} objects to ${against}.`, concession: 'One thing is right.' })}\n\`\`\``; }
    if (user.startsWith('The deliberation is over')) { calls.push(`reflect:${me}`); return JSON.stringify({ note: `${me} learned something.` }); }
    calls.push(`propose:${me}`);
    return JSON.stringify({ title: `${me} direction`, idea: `${me} idea.`, geometry: 'g', typography: 'Anton / Karla', imageLogic: 'i', texture: 'x', motion: 'm', productionMethod: 'p', humanTrace: 'h', risk: 'r', arguesWith: { directorId: me === 'REBEL' ? 'CLASSICAL' : 'REBEL', why: 'standing argument' } });
  };
  const grounded = async () => JSON.stringify({ influences: [{ topic: 'Dancheong', finding: 'Five-colour system on timber.', source: { title: 'A source', url: 'https://example.org/dancheong' } }], note: 'This changes my palette logic.' });
  const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: async () => ({}), store, model, grounded });

  const d = await council.deliberate('u1', { ask: 'A title sequence for a documentary.' }, { depth: 'FULL', directors: ['REBEL', 'CLASSICAL', 'RADICAL_MINIMAL'] });
  assert.equal(d.status, 'DONE', d.error);
  assert.equal(d.proposals.length, 3);
  assert.equal(d.disputes.length, 3);
  for (const x of d.disputes) { assert.ok(d.directors.includes(x.from) && d.directors.includes(x.against)); assert.notEqual(x.from, x.against); }
  assert.ok(d.synthesis); assert.equal(new Set([d.synthesis!.lead, d.synthesis!.counterpoint, d.synthesis!.editor]).size, 3);
  assert.equal(d.synthesis!.quotes.length, 1);
  assert.ok(mem.has(`users/u1/council_sessions/${d.id}`), 'the session was persisted');
  assert.equal(mem.get(`users/u1/council_sessions/${d.id}`).status, 'DONE');
  // Proposals came first and in parallel, disputes after, synthesis after that; reflections trail the answer.
  assert.ok(calls.indexOf('synthesis') > calls.lastIndexOf('dispute:REBEL'));
  await new Promise(r => setTimeout(r, 50));
  assert.equal(calls.filter(c => c.startsWith('reflect:')).length, 3);
  const rebel = await council.profile('REBEL');
  assert.equal(rebel.styleNotes.length, 1); assert.match(rebel.styleNotes[0].text, /learned/);
  assert.equal(rebel.ledCount, 1); assert.equal(rebel.stances[0].outcome, 'LEAD'); assert.equal(rebel.stances[0].disagreedWith, 'CLASSICAL');
  const classical = await council.profile('CLASSICAL');
  assert.equal(classical.counterpointCount, 1);
  // The next brief's prompt carries what they learned.
  assert.match(directorSystem('REBEL', rebel), /learned something/);

  const r = await council.research('WORLD_ECLECTIC', 'Dancheong');
  assert.equal(r.influences.length, 1); assert.equal(r.influences[0].source?.url, 'https://example.org/dancheong');
  const traveller = await council.profile('WORLD_ECLECTIC');
  assert.equal(traveller.influences.length, 1); assert.ok(traveller.styleNotes.some(n => /Dancheong/.test(n.text)));
});
