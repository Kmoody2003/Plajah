// The rule player (plan Phase 2): story-built levels play by their rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RulePlayer, ruleNames, type RuleHost } from '../services/gamestudio/rulePlayer';
import { buildFromStory, builtLevelId, storyNames } from '../services/gamestudio/story/build';
import { RAVENCREST_STORY } from '../services/gamestudio/story/samples/ravencrest';
import { applyOp } from '../services/gamestudio/ops';
import { newProjectFor } from '../services/gamestudio/runtime';
import type { Rule } from '../services/gamestudio/schema';

const project = (() => {
  const p = newProjectFor('rift-realm', 'x', 1000);
  return applyOp(p, buildFromStory(RAVENCREST_STORY, p).op!).project;
})();
const names = storyNames(RAVENCREST_STORY, project);
const level = (id: string) => project.levels.find(l => l.id === builtLevelId(id))!;

/** A host that records what the player asked the game to do. */
function host() {
  const calls: string[] = [];
  const log: string[] = [];
  const h = {
    calls, log, timer: null as number | null,
    showText: (t: string) => { calls.push(`text:${t.slice(0, 20)}`); },
    spawnWave: (n: number, who: string, w: number) => { calls.push(`wave:${n}:${who}:${w}`); },
    spawnBoss: (who: string) => { calls.push(`boss:${who}`); },
    giveItem: (i: string) => { calls.push(`item:${i}`); },
    setTimer: (s: number | null) => { h.timer = s; },
    win: (next?: string) => { calls.push(`win:${next ?? ''}`); },
    lose: () => { calls.push('lose'); },
    restartFromCheckpoint: () => { calls.push('restart'); },
    fired: (_r: Rule, s: string) => { log.push(s); },
  };
  return h satisfies RuleHost;
}

test('boss level: intro, boss arrives, defeating them wins and names the next level', () => {
  const h = host();
  const p = new RulePlayer(level('countsnight').rules, level('countsnight').zones, h, names);
  assert.ok(p.active);
  p.start();
  assert.ok(h.calls.includes('boss:dracula'));
  assert.ok(h.calls[0].startsWith('text:'));
  p.enemyDown('dead', 0); // an untagged enemy is not the boss
  assert.equal(p.outcome, 'playing');
  p.enemyDown('dracula', 1);
  assert.equal(p.outcome, 'won');
  assert.ok(h.calls.includes(`win:${builtLevelId('undercroft')}`));
  assert.ok(h.log.includes('When Dracula is defeated, win the level and go on to The Undercroft.'));
  // nothing fires after the level ends
  const n = h.calls.length; p.playerDowned(); assert.equal(h.calls.length, n);
});

test('survive: the timer counts down on the HUD and winning happens when it runs out', () => {
  const h = host();
  const l = level('deadroad');
  const p = new RulePlayer(l.rules, l.zones, h, names);
  p.start();
  assert.equal(h.timer, 240);
  assert.ok(h.calls.some(c => c.startsWith('wave:14:dead')));
  for (let i = 0; i < 239; i++) p.tick(1, { player: [0, 0, 0] });
  assert.equal(p.outcome, 'playing');
  assert.ok(h.timer! > 0 && h.timer! <= 1.01);
  p.tick(1.5, { player: [0, 0, 0] });
  assert.equal(p.outcome, 'won');
  assert.equal(h.timer, null);
});

test('reach: walking into the goal area wins, once', () => {
  const h = host();
  const l = level('ashmoor');
  const p = new RulePlayer(l.rules, l.zones, h, names);
  assert.equal(p.goalZones().length, 1);
  p.start();
  p.tick(0.1, { player: [20, 0, 20] });
  assert.equal(p.outcome, 'playing');
  p.tick(0.1, { player: [1, 0.2, -1] });
  assert.equal(p.outcome, 'won');
  assert.equal(h.calls.filter(c => c.startsWith('win')).length, 1);
});

test('clear: every rule-spawned enemy down wins; a downed player restarts from the checkpoint', () => {
  const h = host();
  const l = level('tehom');
  const p = new RulePlayer(l.rules, l.zones, h, names);
  p.start();
  assert.ok(h.calls.includes('wave:8:shades:1'));
  p.playerDowned();
  assert.ok(h.calls.includes('restart'));
  for (let i = 0; i < 7; i++) p.enemyDown('shades', 1);
  assert.equal(p.outcome, 'playing');
  p.enemyDown('shades', 1);
  assert.equal(p.outcome, 'won');
  assert.ok(h.calls.includes(`win:${builtLevelId('cathedral')}`));
});

test('collect: the right count of the right item wins', () => {
  const h = host();
  const l = level('brennan');
  const p = new RulePlayer(l.rules, l.zones, h, names);
  assert.deepEqual(p.wantedItems(), [{ item: 'hexstone', count: 1 }]);
  p.start();
  p.collected('lantern');
  assert.equal(p.outcome, 'playing');
  p.collected('hexstone');
  assert.equal(p.outcome, 'won');
});

test('conditions, switched-off rules, wave cleared, hold a point', () => {
  const rules: Rule[] = [
    { id: 'a', enabled: true, when: { event: 'levelStart' }, if: [], do: [{ action: 'spawnWave', count: 2, who: 'x' }] },
    { id: 'b', enabled: true, when: { event: 'waveCleared', wave: 1 }, if: [{ var: 'time', op: '<', value: 10 }], do: [{ action: 'showText', text: 'fast!' }] },
    { id: 'c', enabled: false, when: { event: 'waveCleared' }, if: [], do: [{ action: 'loseLevel' }] },
    { id: 'd', enabled: true, when: { event: 'pointHeld', seconds: 5 }, if: [], do: [{ action: 'winLevel' }] },
  ];
  const h = host();
  const p = new RulePlayer(rules, [], h);
  p.start();
  p.tick(2, { player: [0, 0, 0] });
  p.enemyDown('x', 1); p.enemyDown('x', 1);
  assert.ok(h.calls.includes('text:fast!'));
  assert.equal(p.outcome, 'playing', 'the switched-off rule never runs');
  p.tick(1, { player: [0, 0, 0], pointHeldSeconds: 4 });
  assert.equal(p.outcome, 'playing');
  p.tick(1, { player: [0, 0, 0], pointHeldSeconds: 5.1 });
  assert.equal(p.outcome, 'won');
  assert.equal(p.log.length, 3);
});

test('a level with no rules is not active, so the game keeps its own loop', () => {
  assert.equal(new RulePlayer([], [], host()).active, false);
});

test('ruleNames gives the game the names its rules mention', () => {
  const n = ruleNames(level('countsnight').rules, names);
  assert.equal(n['cast:dracula'], 'Dracula');
  assert.equal(n[`level:${builtLevelId('undercroft')}`], 'The Undercroft');
  const z = ruleNames(level('ashmoor').rules, names);
  assert.equal(z[`zone:${builtLevelId('ashmoor')}:goalArea`], 'Goal: Ashmoor bell tower');
});
