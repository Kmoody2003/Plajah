// Story Intelligence → game (docs/game-studio-unified-plan.md §7a): breakdown schema, canon review,
// story → ops builder, AI answer repair, rule sentences, and the breakdown route.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { validateGameStory, allLevels, totalMinutes, type GameStory } from '../services/gamestudio/story/schema';
import { CANON, reviewStory, canonText } from '../services/gamestudio/story/canon';
import { buildFromStory, builtLevelId, placeModules, storyNames } from '../services/gamestudio/story/build';
import { breakdownPrompt, parseBreakdown } from '../services/gamestudio/story/prompt';
import { RAVENCREST_STORY } from '../services/gamestudio/story/samples/ravencrest';
import { ruleSentence } from '../services/gamestudio/rules';
import { applyOp, describeOp, History } from '../services/gamestudio/ops';
import { newProjectFor } from '../services/gamestudio/runtime';
import { validateProject } from '../services/gamestudio/validate';
import { createGameStoryRouter } from '../routes/gameStory';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test('Ravencrest sample validates: 4 acts, 13 levels, 60 minutes', () => {
  const v = validateGameStory(RAVENCREST_STORY);
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.equal(RAVENCREST_STORY.chapters.length, 4);
  assert.equal(allLevels(RAVENCREST_STORY).length, 13);
  assert.equal(totalMinutes(RAVENCREST_STORY), 60);
});

test('validator catches broken references', () => {
  const s = clone(RAVENCREST_STORY);
  s.chapters[0].levels[0].place = 'nowhere';
  s.chapters[1].levels[1].goal = { kind: 'defeat', target: 'nobody' };
  s.chapters[1].levels[0].cast.push({ castId: 'ghost', as: 'enemy' });
  s.chapters[2].levels[0].intensity = 9;
  const v = validateGameStory(s);
  assert.equal(v.ok, false);
  const paths = v.errors.map(e => e.path);
  assert.ok(paths.includes('chapters[0].levels[0].place'));
  assert.ok(paths.includes('chapters[1].levels[1].goal.target'));
  assert.ok(paths.some(p => p.startsWith('chapters[1].levels[0].cast')));
  assert.ok(paths.includes('chapters[2].levels[0].intensity'));
});

test('canon: every pattern has a sentence and an example; text names the template pacing', () => {
  for (const c of CANON) { assert.ok(c.sentence.length > 20, c.id); assert.ok(c.example.length > 10, c.id); }
  assert.match(canonText('arena-shooter'), /3–8 minutes/);
});

test('canon review on Ravencrest gives only gentle notes (it is a well-shaped story)', () => {
  const notes = reviewStory(RAVENCREST_STORY);
  assert.equal(notes.filter(n => n.severity === 'warn').length, 0, JSON.stringify(notes));
});

test('canon review catches the classic mistakes', () => {
  const s = clone(RAVENCREST_STORY);
  // a new move taught in the boss fight
  s.chapters[1].levels[3].verb = 'parry';
  // two peaks back to back
  s.chapters[2].levels[0].intensity = 5;
  // cutscene-only game
  for (const l of allLevels(s)) l.tellBy = ['cutscene'];
  // reach with nowhere to go
  s.chapters[0].levels[1].goal = { kind: 'reach' };
  const ids = new Set(reviewStory(s).map(n => n.pattern));
  for (const id of ['teach-before-test', 'breather', 'show-dont-cut', 'goal-in-sight']) assert.ok(ids.has(id), id);
  assert.equal(reviewStory(s, ['breather']).some(n => n.pattern === 'breather'), false, 'patterns can be switched off');
});

test('build: one undoable batch, levels chained, rules read as sentences', () => {
  const p = newProjectFor('rift-realm', 'Story test', 1000);
  const out = buildFromStory(RAVENCREST_STORY, p);
  assert.ok(out.op);
  assert.equal(out.built.length, 13);
  assert.match(out.notes[0], /stand-in arena/);
  const { project, inverse } = applyOp(p, out.op!);
  assert.ok(validateProject(project).ok, JSON.stringify(validateProject(project).errors));
  assert.equal(project.levels.length, p.levels.length + 13);
  assert.equal(project.startLevel, builtLevelId('prologue'));
  const night = project.levels.find(l => l.id === builtLevelId('countsnight'))!;
  const names = storyNames(RAVENCREST_STORY, project);
  const sentences = night.rules.map(r => ruleSentence(r, names));
  assert.ok(sentences.includes('When Dracula is defeated, win the level and go on to The Undercroft.'), sentences.join('\n'));
  assert.ok(sentences.includes('When the level starts, bring in Dracula.'));
  const road = project.levels.find(l => l.id === builtLevelId('deadroad'))!;
  assert.ok(road.rules.map(r => ruleSentence(r, names)).includes('When the level starts, start a 4 min timer.'));
  assert.match(describeOp(p, out.op!), /Built 13 levels from the story/);
  // undo removes all of it
  assert.equal(applyOp(project, inverse).project.levels.length, p.levels.length);
});

test('build again skips levels already built, keeping hand edits', () => {
  const h = new History(newProjectFor('rift-realm', 'x', 1000));
  h.apply(buildFromStory(RAVENCREST_STORY, h.project).op!);
  const id = builtLevelId('ashmoor');
  h.apply({ op: 'renameLevel', levelId: id, name: 'Ashmoor (my cut)' });
  const again = buildFromStory(RAVENCREST_STORY, h.project);
  assert.equal(again.op, null);
  assert.equal(again.skipped.length, 13);
  assert.equal(h.project.levels.find(l => l.id === id)!.name, 'Ashmoor (my cut)');
});

test('places with a real module use it; others get stand-ins spread across the arenas', () => {
  const s = clone(RAVENCREST_STORY);
  s.places[0].module = 'rift-realm.glacial';
  const m = placeModules(s, 'rift-realm');
  assert.deepEqual(m.get('office'), { module: 'rift-realm.glacial', standIn: false });
  assert.equal(m.get('pines')!.standIn, true);
  assert.notEqual(m.get('pines')!.module, m.get('ashmoor')!.module);
});

test('reach goals get a goal area to drag into place', () => {
  const p = newProjectFor('rift-realm', 'x', 1000);
  const out = buildFromStory(RAVENCREST_STORY, p);
  const project = applyOp(p, out.op!).project;
  const ash = project.levels.find(l => l.id === builtLevelId('ashmoor'))!;
  assert.equal(ash.zones[0].kind, 'trigger');
  assert.equal(ash.zones[0].name, 'Goal: Ashmoor bell tower');
  // dragging the area is one merged history step that reads as a sentence
  const h = new History(project);
  const z = ash.zones[0];
  h.apply({ op: 'putZone', levelId: ash.id, zone: { ...z, box: { ...z.box!, center: [4, 1.5, 0] } } });
  h.apply({ op: 'putZone', levelId: ash.id, zone: { ...z, box: { ...z.box!, center: [8, 1.5, 2] } } });
  assert.equal(h.entries.length, 1);
  assert.match(h.entries[0].label, /Goal: Ashmoor bell tower in Ashmoor Crossing: moved or resized at 8, 1.5, 2/);
  assert.ok(ruleSentence(ash.rules.find(r => r.when.event === 'enterZone')!, storyNames(RAVENCREST_STORY, project)).startsWith('When a player reaches Goal: Ashmoor bell tower, win the level'));
  assert.ok(out.notes.some(n => /levels have a goal area.*Ashmoor Crossing/.test(n)));
});

test('prompt carries the canon and the story', () => {
  const { system, user } = breakdownPrompt('A courier races across a flooded city to deliver a heart.', 'auto');
  assert.match(system, /Show the goal before the path/);
  assert.match(user, /Pick the best game template/);
  assert.match(user, /flooded city/);
});

test('parse repairs a sloppy AI answer into a valid story', () => {
  const answer = '```json\n' + JSON.stringify({
    title: 'Heart Run', logline: 'A courier races a storm.', template: 'racer', templateWhy: 'It is a chase.',
    cast: [{ name: 'Mara', role: 'hero' }, { name: 'The Collector', role: 'villain' }],
    places: [{ name: 'Flood Docks' }],
    items: [{ name: 'Heart Case' }],
    chapters: [{ title: 'Rain', levels: [
      { title: 'Docks Dash', beat: 'hook', place: 'Flood Docks', goal: { kind: 'reach', target: 'Flood Docks' }, story: 'Go.', tellBy: ['play'], minutes: '4', intensity: 7 },
      { title: 'Bridge', beat: 'showdown', place: 'Old Bridge', goal: { kind: 'defeat', target: 'The Collector' }, cast: [{ castId: 'The Collector', as: 'boss' }], minutes: 3, intensity: 5 },
      { title: 'Vault', beat: 'climax', place: 'Flood Docks', goal: { kind: 'collect', target: 'nothing' }, minutes: 3, intensity: 5 },
    ] }],
  }) + '\n```';
  const out = parseBreakdown(answer, { kind: 'idea' }, 5000);
  assert.ok(out.story, out.errors.join('; '));
  const s = out.story as GameStory;
  assert.equal(s.cast[1].role, 'npc', 'unknown role falls back');
  const [a, b, c] = allLevels(s);
  assert.equal(a.intensity, 5);
  assert.equal(a.minutes, 4);
  assert.equal(b.beat, 'test');
  assert.equal(b.goal.target, 'the-collector');
  assert.equal(c.goal.kind, 'clear');
  assert.ok(out.repairs.some(r => r.includes('old-bridge')));
  assert.ok(out.repairs.some(r => r.includes('collect target unknown')));
});

test('parse rejects non-JSON', () => {
  assert.equal(parseBreakdown('sorry, I cannot', { kind: 'idea' }).story, null);
});

async function call(router: express.Router, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/gamestudio', router);
  const server = app.listen(0);
  try {
    const port = (server.address() as any).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/gamestudio/breakdown`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() as any };
  } finally { server.close(); }
}

test('route: sign-in required, returns a repaired story', async () => {
  const anon = await call(createGameStoryRouter({ callerUid: async () => null, generate: async () => '{}' }), { text: 'x'.repeat(40) });
  assert.equal(anon.status, 401);
  const ai = JSON.stringify({ title: 'T', template: 'arena-shooter', cast: [{ name: 'Hero', role: 'hero' }], places: [{ name: 'Pit' }], items: [], chapters: [{ title: 'One', levels: [{ title: 'Pit Fight', beat: 'hook', place: 'Pit', goal: { kind: 'clear' }, story: 's', tellBy: ['play'], minutes: 4, intensity: 3 }] }] });
  const ok = await call(createGameStoryRouter({ callerUid: async () => 'u1', generate: async () => ai }), { text: 'A hero fights in a pit for their freedom.', template: 'arena-shooter' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.story.title, 'T');
  const short = await call(createGameStoryRouter({ callerUid: async () => 'u1', generate: async () => ai }), { text: 'too short' });
  assert.equal(short.status, 400);
});

test('the story rides on the project: setStory undoes, validates, and a broken story only warns', () => {
  const h = new History(newProjectFor('rift-realm', 'x', 1000));
  h.apply({ op: 'setStory', story: RAVENCREST_STORY });
  assert.equal(h.project.story?.title, RAVENCREST_STORY.title);
  assert.match(h.entries[h.entries.length - 1].label, /Attached the story/);
  assert.ok(validateProject(h.project).ok);
  const broken = clone(h.project);
  broken.story!.chapters[0].levels[0].place = 'nowhere';
  const v = validateProject(broken);
  assert.ok(v.ok, 'a bad story never blocks opening the game');
  assert.ok(v.warnings.some(w => w.path.startsWith('story.')));
  h.undo();
  assert.equal(h.project.story, undefined);
});
