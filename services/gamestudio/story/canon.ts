// The game-story canon: what Story Intelligence knows about telling stories through play (plan §7a).
// Every pattern is a sentence with an example, and most carry a check that reads a Game Story and returns
// notes. Notes are advice shown on the Story tab, never automatic changes, and an author can switch any
// pattern off. The same text goes into the breakdown prompt, so the AI and the review share one canon.

import type { TemplateId } from '../schema';
import { allLevels, type Beat, type GameStory, type StoryLevel } from './schema';

export interface Pacing {
  /** Comfortable first-run minutes per level. */
  minutes: [number, number];
  /** Most of the story's time that should be cutscenes (0–1). */
  cutsceneShare: number;
  /** A new verb (thing to do) at least every N levels. */
  newVerbEvery: number;
  /** How this kind of game carries a story, said plainly. */
  carries: string;
}

export const PACING: Record<TemplateId, Pacing> = {
  'arena-shooter': { minutes: [3, 8], cutsceneShare: 0.1, newVerbEvery: 2, carries: 'Each arena is a place in the story; the fight is the scene. Story arrives between rounds and in the room itself.' },
  racer: { minutes: [2, 6], cutsceneShare: 0.1, newVerbEvery: 3, carries: 'Every race is a chase or a rivalry. The road tells the journey; rivals carry the drama.' },
  fighter: { minutes: [2, 5], cutsceneShare: 0.2, newVerbEvery: 2, carries: 'Each fight is a confrontation between two characters. Their history is the reason to fight.' },
  platformer: { minutes: [3, 8], cutsceneShare: 0.08, newVerbEvery: 1, carries: 'The level is the story: you read the world as you cross it. A new move per stage.' },
  adventure: { minutes: [4, 12], cutsceneShare: 0.2, newVerbEvery: 2, carries: 'Places, people and puzzles. The player uncovers the story by looking and choosing.' },
  'picture-walk': { minutes: [2, 10], cutsceneShare: 0.3, newVerbEvery: 4, carries: 'A walk through a picture or a memory. The room is the whole telling.' },
  party: { minutes: [1, 4], cutsceneShare: 0.05, newVerbEvery: 1, carries: 'A light frame around each round; the players are the story.' },
};

export const BEAT_MEANING: Record<Beat, string> = {
  hook: 'Grab the player in the first minute: a promise of what this game is.',
  teach: 'A safe place to learn one new thing.',
  test: 'Use what was taught, under pressure.',
  twist: 'Turn the story or the rules: what the player knew is no longer true.',
  breather: 'A calm stretch after a peak: explore, recover, take in the story.',
  climax: 'The peak of an act: the hardest fight and the biggest story turn.',
  resolution: 'Let it land: the result of the climax, and what comes next.',
};

export interface StoryNote {
  pattern: string;
  /** 'idea' = worth a look; 'warn' = likely to hurt the game. */
  severity: 'idea' | 'warn';
  levelId?: string;
  text: string;
}

export interface CanonPattern {
  id: string;
  title: string;
  sentence: string;
  example: string;
  check?: (s: GameStory, pacing: Pacing) => StoryNote[];
}

const lvlName = (l: StoryLevel) => `"${l.title}"`;

export const CANON: CanonPattern[] = [
  {
    id: 'hook-first',
    title: 'Hook in the first minute',
    sentence: 'The first level shows what the game is about and gives the player something to do straight away.',
    example: 'Ravencrest opens on the aircraft being pulled down: you escape through the breaking fuselage.',
    check: s => {
      const first = allLevels(s)[0];
      if (!first) return [];
      return first.beat === 'hook' || first.beat === 'teach' ? [] : [{ pattern: 'hook-first', severity: 'idea', levelId: first.id, text: `${lvlName(first)} opens the game as a ${first.beat}. A hook or a gentle teach usually starts stronger.` }];
    },
  },
  {
    id: 'teach-before-test',
    title: 'Teach before you test',
    sentence: 'A new move is learned somewhere safe before a hard fight demands it.',
    example: 'The Lantern Office drill teaches climbing and blocking before the first real enemies.',
    check: s => allLevels(s).filter(l => l.verb && (l.beat === 'climax' || l.cast.some(c => c.as === 'boss'))).map(l => {
      // the whole level is the boss fight: nowhere safe to learn the move first
      const allBoss = l.goal.kind === 'defeat' && l.beat === 'climax';
      return {
        pattern: 'teach-before-test', severity: allBoss ? 'warn' as const : 'idea' as const, levelId: l.id,
        text: allBoss
          ? `${lvlName(l)} introduces "${l.verb}" in the boss fight itself. Teach it a level earlier so the fight tests it.`
          : `${lvlName(l)} teaches "${l.verb}" and ends on a big fight. Make sure the early part of the level is a safe place to learn it.`,
      };
    }),
  },
  {
    id: 'new-verb',
    title: 'Something new to do, often',
    sentence: 'Players stay curious when the game keeps giving them a new thing to do.',
    example: 'Ashmoor adds the time loop, Saint Brennan adds moving by sound, Tehom Station adds flipping gravity.',
    check: (s, p) => {
      const out: StoryNote[] = [];
      let since = 0;
      for (const l of allLevels(s)) {
        if (l.verb) since = 0; else since++;
        if (since === p.newVerbEvery + 1) out.push({ pattern: 'new-verb', severity: 'idea', levelId: l.id, text: `${since} levels in a row without a new thing to do by ${lvlName(l)}. Add a mechanic, a tool or a new kind of enemy.` });
      }
      return out;
    },
  },
  {
    id: 'breather',
    title: 'Breathe after a peak',
    sentence: 'After the most intense moments, give the player a calmer stretch to recover and take in the story.',
    example: 'After the Count\'s Night, the Undercroft slows down into exploring her laboratory.',
    check: s => {
      const out: StoryNote[] = [];
      const ls = allLevels(s);
      for (let i = 1; i < ls.length; i++) {
        if (ls[i - 1].intensity >= 5 && ls[i].intensity >= 5 && ls[i].beat !== 'resolution') out.push({ pattern: 'breather', severity: 'idea', levelId: ls[i].id, text: `${lvlName(ls[i])} comes straight after another peak. A breather between them makes both hit harder.` });
      }
      return out;
    },
  },
  {
    id: 'act-peak',
    title: 'Each act builds to its peak',
    sentence: 'Intensity climbs through an act and its climax is the act\'s most intense level.',
    example: 'Act II climbs from the Dead Road to the drawbridge to the Count himself.',
    check: s => s.chapters.flatMap(c => {
      const climax = c.levels.filter(l => l.beat === 'climax');
      const top = Math.max(...c.levels.map(l => l.intensity));
      if (!climax.length) return c.levels.length >= 3 ? [{ pattern: 'act-peak', severity: 'idea' as const, text: `"${c.title}" has no climax level. Mark the level the act builds to.` }] : [];
      return climax.filter(l => l.intensity < top).map(l => ({ pattern: 'act-peak', severity: 'idea' as const, levelId: l.id, text: `${lvlName(l)} is the climax of "${c.title}" but another level there is more intense.` }));
    }),
  },
  {
    id: 'boss-is-turn',
    title: 'The boss is the turn',
    sentence: 'A boss fight should carry a story turn, not just a health bar: something changes when it ends.',
    example: 'Dracula is pulled away at 15% health: the win reveals the real villain.',
    check: s => allLevels(s).filter(l => l.cast.some(c => c.as === 'boss') && !['climax', 'twist'].includes(l.beat)).map(l => ({
      pattern: 'boss-is-turn', severity: 'idea' as const, levelId: l.id, text: `${lvlName(l)} has a boss but is marked ${l.beat}. Bosses land best as a climax or twist.`,
    })),
  },
  {
    id: 'show-dont-cut',
    title: 'Let the room tell it',
    sentence: 'Tell most of the story through the place and through play; keep cutscenes short and rare.',
    example: 'A burned-out portrait in the upper wing hints at a second presence before anyone says a word.',
    check: (s, p) => {
      const ls = allLevels(s);
      const total = ls.reduce((t, l) => t + l.minutes, 0) || 1;
      const cut = ls.filter(l => l.tellBy.length === 1 && l.tellBy[0] === 'cutscene').reduce((t, l) => t + l.minutes, 0);
      const env = ls.filter(l => l.tellBy.includes('environment') || l.tellBy.includes('play')).length;
      const out: StoryNote[] = [];
      if (cut / total > p.cutsceneShare) out.push({ pattern: 'show-dont-cut', severity: 'warn', text: `About ${Math.round((cut / total) * 100)}% of the time is cutscene-only. For this kind of game keep it under ${Math.round(p.cutsceneShare * 100)}%.` });
      if (env < ls.length / 2) out.push({ pattern: 'show-dont-cut', severity: 'idea', text: `Only ${env} of ${ls.length} levels tell their story through the place or through play.` });
      return out;
    },
  },
  {
    id: 'goal-in-sight',
    title: 'Show the goal before the path',
    sentence: 'The player should know where they are going; let them see the tower before they find the way up.',
    example: 'In Ashmoor the bell tower is visible from the start; the town is the puzzle of getting there.',
    check: s => allLevels(s).filter(l => (l.goal.kind === 'reach' || l.goal.kind === 'escape') && !l.goal.target).map(l => ({
      pattern: 'goal-in-sight', severity: 'warn' as const, levelId: l.id, text: `${lvlName(l)} asks the player to ${l.goal.kind} but doesn't say where. Name the place so it can be shown.`,
    })),
  },
  {
    id: 'verb-is-theme',
    title: 'What you do is who you are',
    sentence: 'The player\'s actions should match the character and the theme: a healer heals, a thief sneaks.',
    example: 'Elise alone in the silent mission: the player who must be quiet is the one who listens.',
  },
  {
    id: 'pacing-fits',
    title: 'Levels the right length',
    sentence: 'Each kind of game has a comfortable level length; far outside it feels padded or rushed.',
    example: 'Arena rounds land at 3 to 8 minutes; an adventure chapter can run 12.',
    check: (s, p) => allLevels(s).filter(l => l.minutes < p.minutes[0] * 0.5 || l.minutes > p.minutes[1] * 1.5).map(l => ({
      pattern: 'pacing-fits', severity: 'idea' as const, levelId: l.id, text: `${lvlName(l)} is planned at ${l.minutes} min; this kind of game usually runs ${p.minutes[0]}–${p.minutes[1]}.`,
    })),
  },
  {
    id: 'ending-lands',
    title: 'Let the ending land',
    sentence: 'After the final climax, give a moment of resolution: what was won, and what comes next.',
    example: 'The first full sunrise, then the Lantern Office closing one file and opening another.',
    check: s => {
      const ls = allLevels(s);
      const last = ls[ls.length - 1];
      if (!last || ls.length < 3) return [];
      return last.beat === 'resolution' || (last.beat === 'climax' && /sunrise|ending|epilogue|after/i.test(last.story)) ? [] : [{ pattern: 'ending-lands', severity: 'idea', levelId: last.id, text: `The game ends on ${lvlName(last)} (${last.beat}). Add a short resolution so the win lands.` }];
    },
  },
  {
    id: 'choice-matters',
    title: 'A choice is worth it when it changes something later',
    sentence: 'Only offer a branch when it changes a later level, an ally, or the ending; otherwise keep the path clear.',
    example: 'Every survivor you save holds the cathedral doors in the last act.',
  },
];

/** Run every enabled pattern's check. */
export function reviewStory(s: GameStory, off: string[] = []): StoryNote[] {
  const pacing = PACING[s.template] ?? PACING.adventure;
  return CANON.filter(p => p.check && !off.includes(p.id)).flatMap(p => p.check!(s, pacing));
}

/** The canon as plain text (fed to the breakdown prompt). */
export function canonText(template: TemplateId): string {
  const p = PACING[template] ?? PACING.adventure;
  return [
    `How a ${template} carries a story: ${p.carries}`,
    `Levels run ${p.minutes[0]}–${p.minutes[1]} minutes; cutscenes under ${Math.round(p.cutsceneShare * 100)}% of the time; a new thing to do at least every ${p.newVerbEvery} level(s).`,
    'Beats: ' + Object.entries(BEAT_MEANING).map(([b, m]) => `${b} = ${m}`).join(' '),
    ...CANON.map(c => `- ${c.title}: ${c.sentence}`),
  ].join('\n');
}
