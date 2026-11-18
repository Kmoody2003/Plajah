// Story → breakdown through the AI lane (plan §7a step 3). Pure: builds the prompt and repairs + checks the
// answer; the network call lives in routes/gameStory.ts. A hand-written breakdown works exactly the same,
// so nothing here is required to make a game.

import type { TemplateId } from '../schema';
import { canonText } from './canon';
import { BEATS, GAME_STORY_KIND, GAME_STORY_VERSION, GOAL_KINDS, validateGameStory, type GameStory, type StorySource } from './schema';

export const MAX_STORY_CHARS = 24_000;

export function breakdownPrompt(text: string, template: TemplateId | 'auto'): { system: string; user: string } {
  const t: TemplateId = template === 'auto' ? 'adventure' : template;
  const system = [
    'You are a game designer and story editor. You turn a story into a playable game plan.',
    'Answer with JSON only, in exactly the shape described. Use the author\'s names and places; never invent characters the story does not have unless the game needs unnamed enemies.',
    'Keep every level small enough to build: one place, one goal, at most one new thing to do.',
    '',
    'What you know about telling stories in games:',
    canonText(t),
  ].join('\n');
  const user = [
    template === 'auto' ? 'Pick the best game template for this story from: arena-shooter, racer, fighter, platformer, adventure, picture-walk, party. Say why in templateWhy.' : `The game template is ${template}. Say in templateWhy why it fits this story.`,
    '',
    'JSON shape:',
    '{"title":string,"logline":string,"template":string,"templateWhy":string,',
    ' "cast":[{"id":string,"name":string,"role":"hero|ally|rival|enemy|boss|npc","blurb":string}],',
    ' "places":[{"id":string,"name":string,"mood":string}],',
    ' "items":[{"id":string,"name":string}],',
    ' "chapters":[{"id":string,"title":string,"act":number,"levels":[{"id":string,"title":string,',
    `   "beat":"${BEATS.join('|')}","place":placeId,"goal":{"kind":"${GOAL_KINDS.join('|')}","target":id?,"count":number?,"seconds":number?},`,
    '   "story":string,"verb":string?,"cast":[{"castId":id,"as":"enemy|ally|boss|npc","count":number?}],"item":itemId?,',
    '   "tellBy":["environment|dialogue|cutscene|lore|play"],"minutes":number,"intensity":1-5}]}]}',
    'Ids are short lowercase words. 2 to 4 chapters, 2 to 5 levels each. defeat goals target a cast id; collect goals target an item id; reach/escape goals target a place id.',
    '',
    'The story:',
    text.slice(0, MAX_STORY_CHARS),
  ].join('\n');
  return { system, user };
}

const slug = (s: unknown, fallback: string) => (String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)) || fallback;
const clampN = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const TEMPLATES: TemplateId[] = ['arena-shooter', 'racer', 'fighter', 'platformer', 'adventure', 'picture-walk', 'party'];
const TELL = ['environment', 'dialogue', 'cutscene', 'lore', 'play'];
const ROLES = ['hero', 'ally', 'rival', 'enemy', 'boss', 'npc'];
const AS = ['enemy', 'ally', 'boss', 'npc'];

/**
 * Repair an AI answer into a Game Story: fill missing ids, clamp numbers, drop references to things that
 * don't exist, then validate. Returns the story plus what was repaired, so the Story tab can say so.
 */
export function parseBreakdown(raw: unknown, source: StorySource, now = Date.now()): { story: GameStory | null; repairs: string[]; errors: string[] } {
  const repairs: string[] = [];
  let j: any = raw;
  if (typeof raw === 'string') {
    const m = raw.match(/\{[\s\S]*\}/);
    try { j = JSON.parse(m ? m[0] : raw); } catch { return { story: null, repairs, errors: ['The answer was not JSON.'] }; }
  }
  if (!j || typeof j !== 'object') return { story: null, repairs, errors: ['The answer was empty.'] };
  const uniq = (list: any[], key: string) => {
    const seen = new Set<string>();
    return list.filter(x => x && typeof x === 'object').map((x, i) => {
      let id = slug(x.id ?? x.name, `${key}${i + 1}`);
      while (seen.has(id)) id += '-2';
      seen.add(id);
      return { ...x, id, name: String(x.name ?? x.title ?? id) };
    });
  };
  const cast = uniq(arr(j.cast), 'cast').map(c => ({ id: c.id, name: c.name, role: ROLES.includes(c.role) ? c.role : 'npc', ...(c.blurb ? { blurb: String(c.blurb) } : {}) }));
  const places = uniq(arr(j.places), 'place').map(p => ({ id: p.id, name: p.name, ...(p.mood ? { mood: String(p.mood) } : {}) }));
  const items = uniq(arr(j.items), 'item').map(p => ({ id: p.id, name: p.name }));
  const castIds = new Set(cast.map(c => c.id)), placeIds = new Set(places.map(p => p.id)), itemIds = new Set(items.map(p => p.id));
  // ids in the answer may differ from our slugs; map by original id and by name
  const resolve = (v: unknown, list: { id: string; name: string }[]) => {
    const s = slug(v, '');
    return list.find(x => x.id === s || slug(x.name, '') === s)?.id;
  };
  const levelIds = new Set<string>();
  const chapters = arr(j.chapters).map((c, ci) => ({
    id: slug(c?.id ?? c?.title, `act${ci + 1}`),
    title: String(c?.title ?? `Act ${ci + 1}`),
    act: clampN(c?.act, 1, 9, ci + 1),
    levels: arr(c?.levels).map((l, li) => {
      let id = slug(l?.id ?? l?.title, `level${ci + 1}-${li + 1}`);
      while (levelIds.has(id)) id += '-2';
      levelIds.add(id);
      let place = resolve(l?.place, places);
      if (!place) {
        place = slug(l?.place ?? l?.title, `place-${id}`);
        if (!placeIds.has(place)) { places.push({ id: place, name: String(l?.place ?? l?.title ?? place) }); placeIds.add(place); repairs.push(`Added the place "${place}" used by level "${l?.title ?? id}".`); }
      }
      let goal = { kind: GOAL_KINDS.includes(l?.goal?.kind) ? l.goal.kind : 'clear', ...(l?.goal?.target ? { target: String(l.goal.target) } : {}), ...(l?.goal?.count ? { count: clampN(l.goal.count, 1, 99, 1) } : {}), ...(l?.goal?.seconds ? { seconds: clampN(l.goal.seconds, 10, 3600, 120) } : {}) } as any;
      if (goal.kind === 'defeat') { const t = resolve(goal.target, cast); if (t) goal.target = t; else { repairs.push(`"${l?.title}": defeat target unknown, changed to clear.`); goal = { kind: 'clear' }; } }
      if (goal.kind === 'collect') { const t = resolve(goal.target, items); if (t) goal.target = t; else { repairs.push(`"${l?.title}": collect target unknown, changed to clear.`); goal = { kind: 'clear' }; } }
      if (goal.kind === 'survive' && !goal.seconds) goal.seconds = 120;
      if ((goal.kind === 'reach' || goal.kind === 'escape') && goal.target) goal.target = resolve(goal.target, places) ?? goal.target;
      const lc = arr(l?.cast).map(x => ({ castId: resolve(x?.castId ?? x?.id ?? x?.name, cast), as: AS.includes(x?.as) ? x.as : 'enemy', ...(x?.count ? { count: clampN(x.count, 1, 99, 1) } : {}) })).filter(x => x.castId) as any[];
      const item = l?.item ? resolve(l.item, items) : undefined;
      return {
        id, title: String(l?.title ?? id), beat: BEATS.includes(l?.beat) ? l.beat : 'test', place, goal,
        story: String(l?.story ?? ''), ...(l?.verb ? { verb: String(l.verb) } : {}), cast: lc, ...(item ? { item } : {}),
        tellBy: arr(l?.tellBy).filter(t => TELL.includes(t)).length ? arr(l.tellBy).filter(t => TELL.includes(t)) : ['play'],
        minutes: clampN(l?.minutes, 1, 60, 5), intensity: clampN(l?.intensity, 1, 5, 3),
      };
    }),
  })).filter(c => c.levels.length);
  void castIds; void itemIds;
  const story: GameStory = {
    kind: GAME_STORY_KIND, version: GAME_STORY_VERSION, id: `story_${now.toString(36)}`,
    title: String(j.title ?? 'Untitled story'), logline: String(j.logline ?? ''), source,
    template: TEMPLATES.includes(j.template) ? j.template : 'adventure', templateWhy: String(j.templateWhy ?? ''),
    cast, places, items, chapters, createdAt: now, updatedAt: now,
  };
  const check = validateGameStory(story);
  return { story: check.ok ? story : null, repairs, errors: check.errors.map(e => `${e.path}: ${e.message}`) };
}
