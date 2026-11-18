// Story → Game Project (plan §7a step 4). The builder writes ONE batch op of ordinary edits (addLevel,
// putZone, putRule, setStartLevel), so a built story is the same as hand work: one undo removes it, every
// piece shows in History, and the author can move, rename or rewrite anything afterwards.
//
// Levels are added beside the project's existing ones (ids `st-<story level id>`), never replacing them.
// Building again skips levels already built, so hand edits to them survive.

import { emptyLevel, type GameLevel, type GameProject, type Rule, type Zone } from '../schema';
import type { Op } from '../ops';
import { RUNTIMES } from '../runtime';
import { allLevels, type GameStory, type StoryLevel } from './schema';

export interface BuildResult {
  op: Op | null;
  built: string[];
  skipped: string[];
  /** Plain notes for the author: stand-in arenas, goals that need placing. */
  notes: string[];
}

export const builtLevelId = (storyLevelId: string) => `st-${storyLevelId}`;

/** Which runtime level module plays each story place: the place's own module if the game has it, else a stand-in. */
export function placeModules(story: GameStory, runtimeId: string): Map<string, { module: string; standIn: boolean }> {
  const rt = RUNTIMES[runtimeId];
  const mods = rt?.levels.map(l => l.module) ?? [];
  const out = new Map<string, { module: string; standIn: boolean }>();
  let next = 0;
  for (const place of story.places) {
    if (place.module && mods.includes(place.module)) out.set(place.id, { module: place.module, standIn: false });
    else if (mods.length) out.set(place.id, { module: mods[next++ % mods.length], standIn: true });
  }
  return out;
}

const rid = (levelId: string, k: string) => `${levelId}:${k}`;

function goalRules(l: StoryLevel, levelId: string, nextId: string | undefined, story: GameStory): { rules: Rule[]; zones: Zone[] } {
  const win = { action: 'winLevel', ...(nextId ? { next: nextId } : {}) };
  const rule = (k: string, when: Rule['when'], ...acts: Rule['do']): Rule => ({ id: rid(levelId, k), enabled: true, when, if: [], do: acts });
  const g = l.goal;
  const rules: Rule[] = [];
  const zones: Zone[] = [];
  switch (g.kind) {
    case 'clear': rules.push(rule('goal', { event: 'allEnemiesDown' }, win)); break;
    case 'survive':
      rules.push(rule('timer', { event: 'levelStart' }, { action: 'startTimer', seconds: g.seconds ?? 120 }));
      rules.push(rule('goal', { event: 'timerEnds' }, win));
      break;
    case 'hold': rules.push(rule('goal', { event: 'pointHeld', seconds: g.seconds ?? 30 }, win)); break;
    case 'defeat': {
      const who = g.target ?? '';
      rules.push(rule('boss', { event: 'levelStart' }, { action: 'spawnBoss', who }));
      rules.push(rule('goal', { event: 'enemyDown', who }, win));
      break;
    }
    case 'collect': rules.push(rule('goal', { event: 'itemsCollected', count: g.count ?? 1, item: g.target ?? '' }, win)); break;
    case 'reach': case 'escape': case 'explore': {
      const zoneId = rid(levelId, 'goalArea');
      const place = story.places.find(p => p.id === g.target);
      zones.push({ id: zoneId, kind: 'trigger', name: `Goal: ${place?.name ?? g.target ?? 'the way out'}`, box: { center: [0, 1.5, 0], size: [6, 3, 6] } });
      rules.push(rule('goal', { event: 'enterZone', zone: zoneId }, win));
      break;
    }
  }
  return { rules, zones };
}

export function buildFromStory(story: GameStory, project: GameProject): BuildResult {
  const notes: string[] = [];
  const mods = placeModules(story, project.runtime.game);
  const existing = new Set(project.levels.map(l => l.id));
  const levels = allLevels(story);
  const ops: Op[] = [];
  const built: string[] = [], skipped: string[] = [];
  const standIns = new Set<string>();
  const goalAreas: string[] = [];

  levels.forEach((l, i) => {
    const id = builtLevelId(l.id);
    if (existing.has(id)) { skipped.push(l.title); return; }
    const m = mods.get(l.place);
    if (!m) { notes.push(`No arena for "${l.title}": this game has no levels to use.`); return; }
    if (m.standIn) standIns.add(story.places.find(p => p.id === l.place)?.name ?? l.place);
    const nextId = levels[i + 1] ? builtLevelId(levels[i + 1].id) : undefined;
    const level: GameLevel = emptyLevel(id, l.title, m.module);
    const { rules, zones } = goalRules(l, id, nextId, story);
    const intro: Rule = { id: rid(id, 'intro'), enabled: true, when: { event: 'levelStart' }, if: [], do: [{ action: 'showText', text: l.story }] };
    const waves = l.cast.filter(c => c.as === 'enemy').map((c, k): Rule => ({
      id: rid(id, `wave${k + 1}`), enabled: true, when: { event: 'levelStart' }, if: [],
      do: [{ action: 'spawnWave', count: c.count ?? Math.max(2, l.intensity * 2), who: c.castId }],
    }));
    const lose: Rule = { id: rid(id, 'lose'), enabled: true, when: { event: 'playerDowned' }, if: [], do: [{ action: 'restartFromCheckpoint' }] };
    const gift: Rule[] = l.item && l.goal.kind !== 'collect'
      ? [{ id: rid(id, 'item'), enabled: true, when: { event: 'levelStart' }, if: [], do: [{ action: 'giveItem', item: l.item }] }] : [];
    level.rules = [intro, ...waves, ...rules, ...gift, lose];
    level.zones = zones;
    // brighter for calm beats, darker for the most intense (a starting point the Look panel can change)
    level.look = { exposure: Math.round((1.25 - (l.intensity - 1) * 0.08) * 100) / 100, preset: story.places.find(p => p.id === l.place)?.mood };
    ops.push({ op: 'addLevel', level });
    if (zones.length) goalAreas.push(l.title);
    built.push(l.title);
  });

  if (goalAreas.length) notes.push(`${goalAreas.length === 1 ? `"${goalAreas[0]}" has a goal area` : `${goalAreas.length} levels have a goal area`} in the middle of the arena. Open ${goalAreas.length === 1 ? 'it' : 'each'} and drag the green box to where the player is heading${goalAreas.length > 1 ? ` (${goalAreas.join(', ')})` : ''}.`);
  if (standIns.size) notes.unshift(`${[...standIns].join(', ')} ${standIns.size === 1 ? 'uses' : 'use'} a stand-in arena until ${standIns.size === 1 ? 'its own level is' : 'their own levels are'} built.`);
  if (!ops.length) return { op: null, built, skipped, notes };
  const first = ops[0] as Extract<Op, { op: 'addLevel' }>;
  if (!skipped.length) ops.push({ op: 'setStartLevel', levelId: first.level.id });
  return { op: { op: 'batch', label: `Built ${built.length} level${built.length === 1 ? '' : 's'} from the story "${story.title}"`, ops }, built, skipped, notes };
}

/** Names for rule sentences: level, cast, item and zone ids → their names. */
export function storyNames(story: GameStory | null, project: GameProject) {
  return (kind: string, id: string): string | undefined => {
    if (kind === 'level') return project.levels.find(l => l.id === id)?.name;
    if (kind === 'zone') for (const l of project.levels) { const z = l.zones.find(z => z.id === id); if (z) return z.name; }
    if (!story) return undefined;
    if (kind === 'cast') return story.cast.find(c => c.id === id)?.name;
    if (kind === 'item') return story.items.find(c => c.id === id)?.name;
    return undefined;
  };
}
