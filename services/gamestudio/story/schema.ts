// Game Story: Story Intelligence's breakdown of a story into a game (plan §7a). It sits between a story
// (a manuscript, script, film report, World, or a typed idea) and a Game Project: chapters become levels,
// each level says what the player does there, where, against whom, what it teaches and which beat of the
// story it carries. Authors read and edit it as cards; the builder (build.ts) turns it into ordinary
// Game Project ops, so everything it makes can be changed by hand.

import type { TemplateId } from '../schema';

export const GAME_STORY_KIND = 'plajah.gamestory';
export const GAME_STORY_VERSION = 1;

/** The job a level does in the story's shape (canon.ts explains each). */
export type Beat = 'hook' | 'teach' | 'test' | 'twist' | 'breather' | 'climax' | 'resolution';
export const BEATS: Beat[] = ['hook', 'teach', 'test', 'twist', 'breather', 'climax', 'resolution'];

export type CastRole = 'hero' | 'ally' | 'rival' | 'enemy' | 'boss' | 'npc';
export type GoalKind = 'clear' | 'survive' | 'hold' | 'reach' | 'collect' | 'defeat' | 'escape' | 'explore';
export const GOAL_KINDS: GoalKind[] = ['clear', 'survive', 'hold', 'reach', 'collect', 'defeat', 'escape', 'explore'];
/** How the level tells its part of the story. */
export type TellBy = 'environment' | 'dialogue' | 'cutscene' | 'lore' | 'play';

export interface StoryCast {
  id: string;
  name: string;
  role: CastRole;
  blurb?: string;
  /** Character entry in a World (Worlds/Lorea), when the story came from one. */
  worldRef?: string;
}

export interface StoryPlace {
  id: string;
  name: string;
  mood?: string;
  blurb?: string;
  worldRef?: string;
  /** Level module that plays this place (`<game>.<level>`); unset → the builder picks a stand-in. */
  module?: string;
}

export interface StoryItem { id: string; name: string; blurb?: string }

export interface StoryGoal {
  kind: GoalKind;
  /** reach/escape: where to; collect: the item id; defeat: the cast id. */
  target?: string;
  count?: number;
  seconds?: number;
}

export interface LevelCast { castId: string; as: 'enemy' | 'ally' | 'boss' | 'npc'; count?: number }

export interface StoryLevel {
  id: string;
  title: string;
  beat: Beat;
  place: string;
  goal: StoryGoal;
  /** What happens, in a sentence or two (the author's words). */
  story: string;
  /** The new thing the player learns to do here, if any ("ring the bell to reset the loop"). */
  verb?: string;
  cast: LevelCast[];
  /** Item found or earned here. */
  item?: string;
  tellBy: TellBy[];
  /** Planned play time on a first run. */
  minutes: number;
  /** 1 calm … 5 the most intense moment. */
  intensity: number;
}

export interface StoryChapter { id: string; title: string; act: number; levels: StoryLevel[] }

export interface StorySource {
  kind: 'idea' | 'manuscript' | 'script' | 'film' | 'world' | 'doc';
  /** Where it came from: an album id, a Lorea doc id, a repo path. */
  ref?: string;
  worldId?: string;
}

export interface GameStory {
  kind: typeof GAME_STORY_KIND;
  version: typeof GAME_STORY_VERSION;
  id: string;
  title: string;
  logline: string;
  source: StorySource;
  template: TemplateId;
  /** Why this kind of game fits this story ("it is a chase, so the levels are races"). */
  templateWhy: string;
  cast: StoryCast[];
  places: StoryPlace[];
  items: StoryItem[];
  chapters: StoryChapter[];
  createdAt: number;
  updatedAt: number;
}

export const allLevels = (s: GameStory): StoryLevel[] => s.chapters.flatMap(c => c.levels);
export const totalMinutes = (s: GameStory) => allLevels(s).reduce((t, l) => t + (l.minutes || 0), 0);

export interface StoryCheck { ok: boolean; errors: { path: string; message: string }[] }

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const TEMPLATES: TemplateId[] = ['arena-shooter', 'racer', 'fighter', 'platformer', 'adventure', 'picture-walk', 'party'];

/** Shape and reference checks (does every level point at a real place, cast member, item). */
export function validateGameStory(s: unknown): StoryCheck {
  const errors: StoryCheck['errors'] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  if (!isObj(s)) return { ok: false, errors: [{ path: '', message: 'A game story must be an object.' }] };
  if (s.kind !== GAME_STORY_KIND) err('kind', `kind must be "${GAME_STORY_KIND}".`);
  if (s.version !== GAME_STORY_VERSION) err('version', `version must be ${GAME_STORY_VERSION}.`);
  if (typeof s.title !== 'string' || !s.title.trim()) err('title', 'The story needs a title.');
  if (!TEMPLATES.includes(s.template)) err('template', 'Unknown game template.');
  const ids = (key: string) => {
    const set = new Set<string>();
    if (!Array.isArray(s[key])) { err(key, `${key} must be a list.`); return set; }
    s[key].forEach((x: any, i: number) => {
      if (!isObj(x) || typeof x.id !== 'string' || !x.id) err(`${key}[${i}]`, 'Needs an id.');
      else if (set.has(x.id)) err(`${key}[${i}]`, `Duplicate id "${x.id}".`);
      else set.add(x.id);
      if (isObj(x) && (typeof x.name !== 'string' || !x.name.trim())) err(`${key}[${i}].name`, 'Needs a name.');
    });
    return set;
  };
  const cast = ids('cast'), places = ids('places'), items = ids('items');
  if (!Array.isArray(s.chapters) || !s.chapters.length) { err('chapters', 'The story needs at least one chapter.'); return { ok: false, errors }; }
  const levelIds = new Set<string>();
  s.chapters.forEach((c: any, ci: number) => {
    const at = `chapters[${ci}]`;
    if (!isObj(c)) { err(at, 'Chapter must be an object.'); return; }
    if (!Array.isArray(c.levels) || !c.levels.length) { err(`${at}.levels`, 'A chapter needs at least one level.'); return; }
    c.levels.forEach((l: any, li: number) => {
      const lat = `${at}.levels[${li}]`;
      if (!isObj(l)) { err(lat, 'Level must be an object.'); return; }
      if (typeof l.id !== 'string' || !l.id || levelIds.has(l.id)) err(`${lat}.id`, 'Level needs a unique id.');
      else levelIds.add(l.id);
      if (typeof l.title !== 'string' || !l.title.trim()) err(`${lat}.title`, 'Level needs a title.');
      if (!BEATS.includes(l.beat)) err(`${lat}.beat`, 'Unknown beat.');
      if (!places.has(l.place)) err(`${lat}.place`, `No place "${l.place}".`);
      if (!isObj(l.goal) || !GOAL_KINDS.includes(l.goal.kind)) err(`${lat}.goal`, 'Level needs a goal.');
      else {
        if (l.goal.kind === 'defeat' && !cast.has(l.goal.target)) err(`${lat}.goal.target`, 'Defeat goal must name a cast member.');
        if (l.goal.kind === 'collect' && !items.has(l.goal.target)) err(`${lat}.goal.target`, 'Collect goal must name an item.');
        if (l.goal.kind === 'survive' && !(l.goal.seconds > 0)) err(`${lat}.goal.seconds`, 'Survive goal needs seconds.');
      }
      if (!Array.isArray(l.cast)) err(`${lat}.cast`, 'cast must be a list.');
      else l.cast.forEach((lc: any, k: number) => { if (!cast.has(lc?.castId)) err(`${lat}.cast[${k}]`, `No cast member "${lc?.castId}".`); });
      if (l.item !== undefined && !items.has(l.item)) err(`${lat}.item`, `No item "${l.item}".`);
      if (!Array.isArray(l.tellBy)) err(`${lat}.tellBy`, 'tellBy must be a list.');
      if (!(l.minutes > 0 && l.minutes < 120)) err(`${lat}.minutes`, 'Minutes must be between 0 and 120.');
      if (!(l.intensity >= 1 && l.intensity <= 5)) err(`${lat}.intensity`, 'Intensity is 1 to 5.');
    });
  });
  return { ok: errors.length === 0, errors };
}

/** "Defeat Dracula", "Survive 4 min", "Reach Ashmoor bell tower". */
export function goalSentence(l: StoryLevel, s: GameStory): string {
  const g = l.goal;
  const cast = (id?: string) => s.cast.find(c => c.id === id)?.name ?? id ?? 'the boss';
  const place = (id?: string) => s.places.find(p => p.id === id)?.name ?? id ?? 'the goal';
  const item = (id?: string) => s.items.find(p => p.id === id)?.name ?? id ?? 'the items';
  switch (g.kind) {
    case 'clear': return 'Clear every enemy';
    case 'survive': { const t = g.seconds ?? 120; return `Survive ${t >= 60 && t % 60 === 0 ? `${t / 60} min` : `${t} s`}`; }
    case 'hold': return `Hold the point for ${g.seconds ?? 30} s`;
    case 'defeat': return `Defeat ${cast(g.target)}`;
    case 'collect': return `Collect ${g.count && g.count > 1 ? `${g.count} × ` : ''}${item(g.target)}`;
    case 'reach': return `Reach ${place(g.target)}`;
    case 'escape': return `Escape to ${place(g.target)}`;
    case 'explore': return 'Explore and find the way on';
  }
}
