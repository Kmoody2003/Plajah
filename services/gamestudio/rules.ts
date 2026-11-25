// Rules as sentences (plan §5.1). A rule is data, { when, if, do }, and this file is its vocabulary:
// which events and actions exist, what parameters they take, and how a rule reads aloud. The Studio shows
// rules only as these sentences; the story builder writes rules from this vocabulary; Phase 2's playkit
// runs them. An event or action a game doesn't know yet still reads sensibly (it falls back to its name).

import type { ParamValue, Rule, RuleAction, RuleCond, RuleWhen } from './schema';

export interface VerbSpec {
  id: string;
  /** Sentence template; {key} is replaced by the parameter (formatted). */
  says: string;
  params?: Record<string, 'number' | 'seconds' | 'text' | 'level' | 'zone' | 'cast' | 'item'>;
}

export const EVENTS: Record<string, VerbSpec> = {
  levelStart: { id: 'levelStart', says: 'the level starts' },
  allEnemiesDown: { id: 'allEnemiesDown', says: 'every enemy is down' },
  enemyDown: { id: 'enemyDown', says: '{who} is defeated', params: { who: 'cast' } },
  enterZone: { id: 'enterZone', says: 'a player reaches {zone}', params: { zone: 'zone' } },
  timerEnds: { id: 'timerEnds', says: 'the timer runs out' },
  pointHeld: { id: 'pointHeld', says: 'a control point is held for {seconds}', params: { seconds: 'seconds' } },
  itemsCollected: { id: 'itemsCollected', says: '{count} {item} are collected', params: { count: 'number', item: 'item' } },
  playerDowned: { id: 'playerDowned', says: 'the player goes down' },
  waveCleared: { id: 'waveCleared', says: 'wave {wave} is cleared', params: { wave: 'number' } },
  // adventure template (Lexicon first): songs, puzzles, conversations, gates
  songPlayed: { id: 'songPlayed', says: 'the player plays {song}', params: { song: 'text' } },
  puzzleSolved: { id: 'puzzleSolved', says: 'a {kind} puzzle is solved', params: { kind: 'text' } },
  talkedTo: { id: 'talkedTo', says: 'the player talks to {who}', params: { who: 'cast' } },
  gateOpened: { id: 'gateOpened', says: '{gate} opens', params: { gate: 'text' } },
};

export const ACTIONS: Record<string, VerbSpec> = {
  winLevel: { id: 'winLevel', says: 'win the level', params: { next: 'level' } },
  loseLevel: { id: 'loseLevel', says: 'lose the level' },
  showText: { id: 'showText', says: 'show "{text}"', params: { text: 'text' } },
  startTimer: { id: 'startTimer', says: 'start a {seconds} timer', params: { seconds: 'seconds' } },
  spawnWave: { id: 'spawnWave', says: 'send a wave of {count} {who}', params: { count: 'number', who: 'cast' } },
  spawnBoss: { id: 'spawnBoss', says: 'bring in {who}', params: { who: 'cast' } },
  giveItem: { id: 'giveItem', says: 'give the player {item}', params: { item: 'item' } },
  unlockLevel: { id: 'unlockLevel', says: 'unlock {level}', params: { level: 'level' } },
  restartFromCheckpoint: { id: 'restartFromCheckpoint', says: 'restart from the last checkpoint' },
  openGate: { id: 'openGate', says: 'open {gate}', params: { gate: 'text' } },
};

const OP_WORD: Record<RuleCond['op'], string> = { '==': 'is', '!=': 'is not', '<': 'is under', '<=': 'is at most', '>': 'is over', '>=': 'is at least' };

/** Names for ids (levels, cast, zones, items) so sentences say "Dracula", not "c-dracula". */
export type NameLookup = (kind: string, id: string) => string | undefined;

function fmt(v: ParamValue | undefined, kind: string | undefined, names?: NameLookup): string {
  if (v === undefined) return '…';
  if (kind === 'seconds' && typeof v === 'number') return v >= 60 && v % 60 === 0 ? `${v / 60} min` : `${v} s`;
  if (typeof v === 'string' && kind && kind !== 'text') return names?.(kind, v) ?? v;
  if (Array.isArray(v)) return v.map(n => Math.round(n * 10) / 10).join(', ');
  return String(v);
}

function fill(spec: VerbSpec | undefined, name: string, args: Record<string, ParamValue | undefined>, names?: NameLookup): string {
  if (!spec) return name.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spec.says.replace(/\{(\w+)\}/g, (_, k) => fmt(args[k], spec.params?.[k], names));
}

export const eventSentence = (w: RuleWhen, names?: NameLookup) => fill(EVENTS[w.event], w.event, w, names);

export function actionSentence(a: RuleAction, names?: NameLookup): string {
  let s = fill(ACTIONS[a.action], a.action, a, names);
  if (a.action === 'winLevel' && typeof a.next === 'string') s += ` and go on to ${names?.('level', a.next) ?? a.next}`;
  return s;
}

const condSentence = (c: RuleCond, names?: NameLookup) => `${c.var} ${OP_WORD[c.op]} ${fmt(c.value, undefined, names)}`;

/** "When every enemy is down, win the level and go on to The Dead Road." */
export function ruleSentence(r: Rule, names?: NameLookup): string {
  const conds = r.if.length ? ` and ${r.if.map(c => condSentence(c, names)).join(' and ')}` : '';
  const acts = r.do.map(a => actionSentence(a, names));
  const doPart = acts.length > 1 ? `${acts.slice(0, -1).join(', ')} and ${acts[acts.length - 1]}` : acts[0] ?? 'do nothing';
  const s = `When ${eventSentence(r.when, names)}${conds}, ${doPart}.`;
  return r.enabled ? s : `(Off) ${s}`;
}
