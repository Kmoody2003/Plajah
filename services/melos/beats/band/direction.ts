// Chora Session Band — the producer's talkback. Plain-language directions ("Dwayne, lay back",
// "everybody out except drums and bass", "make it gospel", "Rosie, take a solo", "build over 8
// bars", "Marcus, give me Thunder") become changes to the band's state, which the performers read
// on their next bar — the way a real band hears you in the cans and changes at the next downbeat.
// Questions ("why that voicing?", "who invented the saxophone?") are handed to the teacher.
// Pure, no model: the vocabulary is the one producers actually use.

import { BAND, type BandPlayer, type BandRole } from './roster';
import { genreById, genreInText } from './styles';

export interface PlayerDirection {
  in: boolean;
  /** Featured soloist (one at a time). */
  feature: boolean;
  energy: number;      // −1 … 1
  density: number;     // −1 … 1
  dynamics: number;    // −1 … 1 (softer … louder)
  pocket: number;      // −1 pushing … 1 laid back
  complexity: number;  // −1 … 1
  brightness: number;  // −1 dark … 1 bright
  octave: number;      // −2 … 2
  feel: 'normal' | 'half' | 'double';
  sustain: boolean;
  short: boolean;
  /** A personality the producer asked for; undefined = the player's own call. */
  persona?: string;
}

export interface BandDirection {
  genre: string;
  /** The band's energy 0 … 1. */
  energy: number;
  build?: { startBar: number; bars: number; from: number; to: number };
  breakdown: boolean;
  players: Record<string, PlayerDirection>;
  /** One-bar cues, consumed when played. */
  cues: Record<string, { fill?: boolean; hit?: boolean }>;
}

export interface DirectionAck { playerId: string; did: string }
export interface DirectionOutcome {
  understood: boolean;
  acks: DirectionAck[];
  /** Band-wide changes, for the feed ("Genre → Gospel"). */
  notes: string[];
  /** A question for the teacher, with who it was asked of (if anyone). */
  question?: { text: string; playerId?: string };
  /** "teach me …" — the lesson asked for, by player (and optional words to match a title). */
  lesson?: { playerId?: string; words: string };
}

export const neutralDirection = (inBand: boolean): PlayerDirection => ({
  in: inBand, feature: false, energy: 0, density: 0, dynamics: 0, pocket: 0, complexity: 0, brightness: 0, octave: 0,
  feel: 'normal', sustain: false, short: false,
});

export function newBandDirection(genreId = 'pop'): BandDirection {
  const g = genreById(genreId);
  const players: Record<string, PlayerDirection> = {};
  for (const p of BAND) players[p.id] = neutralDirection(g.lineup.includes(p.role));
  return { genre: g.id, energy: g.energy, breakdown: false, players, cues: {} };
}

/** Bring the lineup in line with a genre (who's on the bandstand). */
export function seatLineup(state: BandDirection, genreId: string): void {
  const g = genreById(genreId);
  state.genre = g.id;
  state.energy = g.energy;
  for (const p of BAND) state.players[p.id].in = g.lineup.includes(p.role);
}

const GROUPS: [RegExp, BandRole[]][] = [
  [/\brhythm section\b/i, ['drums', 'bass', 'guitar', 'piano']],
  [/\bhorns?\b|\bbrass\b/i, ['trumpet', 'sax']],
  [/\bstrings\b/i, ['violin', 'cello', 'orchestra']],
  [/\b(wood)?winds\b/i, ['woodwinds']],
  [/\bkeys\b|\bkeyboards\b/i, ['piano', 'organ', 'synth']],
  [/\bsoloists?\b|\bfront line\b/i, ['trumpet', 'sax', 'guitar', 'violin', 'woodwinds']],
];
const ROLE_WORDS: Record<BandRole, RegExp> = {
  drums: /\bdrums?\b|\bdrummer\b/i,
  percussion: /\bpercussion\b|\bcongas?\b|\bperc\b|\bshakers?\b|\bdjembe\b|\btimpani\b/i,
  bass: /\bbass(ist)?\b|\blow end\b/i,
  guitar: /\bguitars?\b|\bguitarist\b/i,
  piano: /\bpiano\b|\bpianist\b/i,
  organ: /\borgan(ist)?\b|\bb3\b|\bhammond\b/i,
  synth: /\bsynths?\b|\bsynthesizer\b/i,
  cello: /\bcello\b|\bcellist\b/i,
  violin: /\bviolin(ist)?\b|\bfiddle\b/i,
  trumpet: /\btrumpets?\b|\bcornet\b/i,
  sax: /\bsax(ophone)?\b|\btenor\b|\balto\b/i,
  woodwinds: /\bflute\b|\bclarinet\b|\boboe\b/i,
  orchestra: /\borchestra\b|\bensemble\b|\bmaestra\b|\bmeridian\b/i,
};
const EVERYONE = /\b(everybody|everyone|every one|y'?all|the band|whole band|all of you|full band|all)\b/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = (p: BandPlayer) => new RegExp(`\\b(${[p.name.split(' ')[0], p.name, p.nickname].filter(Boolean).map((s) => esc(s!)).join('|')})\\b`, 'i');
const personaRe = (name: string) => new RegExp(`\\b${esc(name.replace(/^the\s+/i, ''))}\\b`, 'i');

/** Players a phrase points at, in band order. */
export function playersIn(text: string): string[] {
  const ids = new Set<string>();
  for (const p of BAND) {
    if (nameRe(p).test(text) || ROLE_WORDS[p.role].test(text)) ids.add(p.id);
    if (p.personas.some((x) => personaRe(x.name).test(text))) ids.add(p.id);
  }
  for (const [re, roles] of GROUPS) if (re.test(text)) for (const p of BAND) if (roles.includes(p.role)) ids.add(p.id);
  return BAND.filter((p) => ids.has(p.id)).map((p) => p.id);
}

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const nudge = (d: PlayerDirection, k: 'energy' | 'density' | 'dynamics' | 'pocket' | 'complexity' | 'brightness', by: number) => { d[k] = clamp(d[k] + by); };

interface Act { re: RegExp; did: string; apply: (d: PlayerDirection) => void }
// Order matters: the more specific phrases first ("drop out" before "drop it").
const ACTS: Act[] = [
  { re: /\b(drop out|lay out|sit (this one )?out|tacet|stop playing|stay out|cut it|get out|you'?re out|out)\b/i, did: 'laying out', apply: (d) => { d.in = false; d.feature = false; } },
  { re: /\b(come (back )?in|bring (\w+ )?(in|back)|jump in|join( in)?|back in|you'?re in|start playing|in)\b/i, did: 'coming in', apply: (d) => { d.in = true; } },
  { re: /\b(take (a solo|the solo|a ride|it away)|solo|feature|spotlight|your turn|go off)\b/i, did: 'taking the solo', apply: (d) => { d.in = true; d.feature = true; } },
  { re: /\b(back to the (section|band|groove)|stop soloing|end (the )?solo|wrap (it|the solo) up|comp)\b/i, did: 'back in the section', apply: (d) => { d.feature = false; } },
  { re: /\b(louder|harder|dig in|more volume|turn (it |him |her |them )?up|forte|hit it harder)\b/i, did: 'digging in', apply: (d) => nudge(d, 'dynamics', 0.4) },
  { re: /\b(softer|quieter|gentler|gently|turn (it |him |her |them )?down|bring it down|down a notch|whisper)\b/i, did: 'playing softer', apply: (d) => nudge(d, 'dynamics', -0.4) },
  { re: /\b(busier|more notes|more fills|play more|more movement|more complex|show off|add more)\b/i, did: 'getting busier', apply: (d) => { nudge(d, 'density', 0.45); nudge(d, 'complexity', 0.25); } },
  { re: /\b(simpler|simplify|less|sparse|sparser|fewer notes|strip it|minimal|more space|leave space|keep it simple)\b/i, did: 'keeping it simple', apply: (d) => { nudge(d, 'density', -0.45); nudge(d, 'complexity', -0.25); } },
  { re: /\b(more energy|hype|drive( it)?|push it|intense|pick it up|bring the heat|fire)\b/i, did: 'driving harder', apply: (d) => nudge(d, 'energy', 0.35) },
  { re: /\b(chill|relax|calm|mellow|less energy|cool it|ease up)\b/i, did: 'easing up', apply: (d) => nudge(d, 'energy', -0.35) },
  { re: /\b(lay back|laid back|behind the beat|sit back|drag( it)?|lazy)\b/i, did: 'laying back', apply: (d) => nudge(d, 'pocket', 0.6) },
  { re: /\b(on top( of the beat)?|ahead of the beat|push the (time|beat)|rush|tighter|right on the grid|on the grid)\b/i, did: 'playing on top', apply: (d) => nudge(d, 'pocket', -0.6) },
  { re: /\bhalf[- ]?time\b/i, did: 'half-time feel', apply: (d) => { d.feel = 'half'; } },
  { re: /\bdouble[- ]?time\b/i, did: 'double-time', apply: (d) => { d.feel = 'double'; } },
  { re: /\b(normal time|regular time|back to (normal|the groove)|straight time)\b/i, did: 'back to the groove', apply: (d) => { d.feel = 'normal'; d.sustain = false; d.short = false; } },
  { re: /\b(up an octave|octave up|(go|play) higher|up high)\b/i, did: 'up an octave', apply: (d) => { d.octave = Math.min(2, d.octave + 1); } },
  { re: /\b(down an octave|octave down|(go|play) lower|down low)\b/i, did: 'down an octave', apply: (d) => { d.octave = Math.max(-2, d.octave - 1); } },
  { re: /\b(darker|dark|moodier|moody|sadder|ominous)\b/i, did: 'going darker', apply: (d) => nudge(d, 'brightness', -0.45) },
  { re: /\b(brighter|bright|happier|lighter|uplifting|sunnier)\b/i, did: 'brightening it', apply: (d) => nudge(d, 'brightness', 0.45) },
  { re: /\b(hold|sustain|long notes|legato|pads?|let it ring|whole notes)\b/i, did: 'holding long notes', apply: (d) => { d.sustain = true; d.short = false; } },
  { re: /\b(short|staccato|stabs?|punchy|choppy|tight hits)\b/i, did: 'playing short', apply: (d) => { d.short = true; d.sustain = false; } },
  { re: /\b(be yourself|your call|whatever you feel|do your thing|surprise me|play what you hear)\b/i, did: 'playing their own way', apply: (d) => { d.persona = undefined; } },
  { re: /\b(reset|from scratch|back to default|like before)\b/i, did: 'resetting', apply: (d) => { Object.assign(d, { ...neutralDirection(d.in), in: d.in }); } },
];

const QUESTION = /\?\s*$|^\s*(why|how|what|who|when|where|which|is it|can you explain|explain|tell me|show me how|what'?s)\b/i;
const LESSON = /\b(teach( me| us)?|lesson|show me how|walk me through|give me a lesson)\b/i;
const FILL = /\b(fills?|pickup|turnaround|lead (me|us) in|into the (next|chorus|verse|bridge|drop))\b/i;
const HIT = /\b(hits? on (the )?one|band hit|accent the one|everybody hit)\b/i;
const BUILD = /\b(build( it)?( up)?|crescendo|swell|bring it up|rise|ramp( it)? up)\b/i;
const BREAKDOWN = /\b(breakdown|break it down|drop it( down)?|strip it back)\b/i;
const FULL = /\b(full band|everybody back|all in|hit it|bring it all back|drop!?$)\b/i;
const EXCEPT = /\b(?:except|but( not)?|other than|apart from|minus|besides)\b(.*)$/i;

/**
 * Apply a direction to the band (mutates `state`). `nextBar` is the bar the change lands on
 * (builds start there); `activePersona` names each player's current personality, so asking for one
 * by name pins it.
 */
export function applyDirection(state: BandDirection, raw: string, nextBar = 0): DirectionOutcome {
  const out: DirectionOutcome = { understood: false, acks: [], notes: [] };
  const text = raw.trim();
  if (!text) return out;

  // A question or a lesson request goes to the teacher (asked of whoever is named).
  const asked = playersIn(text);
  if (LESSON.test(text)) { out.lesson = { playerId: asked[0], words: text }; out.understood = true; return out; }
  if (QUESTION.test(text)) { out.question = { text, playerId: asked[0] }; out.understood = true; return out; }

  const clauses = text.split(/[.;!\n]+|,(?!\s*(?:and|or)\b)|\bthen\b/i).map((c) => c.trim()).filter(Boolean);
  let lastTargets: string[] = [];
  const ack = (id: string, did: string) => {
    const prev = out.acks.find((a) => a.playerId === id);
    if (prev) { if (!prev.did.includes(did)) prev.did += `, ${did}`; } else out.acks.push({ playerId: id, did });
  };

  for (const clause of clauses) {
    // Genre first — it reseats the lineup, so the rest of the clause can still adjust it.
    const g = genreInText(clause);
    if (g && g.id !== state.genre) {
      seatLineup(state, g.id);
      out.notes.push(`Genre → ${g.label}`);
      out.understood = true;
    } else if (g) out.understood = true;

    const exceptM = clause.match(EXCEPT);
    const head = exceptM ? clause.slice(0, exceptM.index) : clause;
    const except = exceptM ? playersIn(exceptM[2] ?? '') : [];
    let targets = playersIn(head);
    const everyone = EVERYONE.test(head);
    if (everyone || (except.length && !targets.length)) targets = BAND.map((p) => p.id).filter((id) => !except.includes(id));
    else if (!targets.length && lastTargets.length && !g) targets = lastTargets;

    // Persona by name pins it on its player (and targets them).
    for (const p of BAND) {
      const persona = p.personas.find((x) => personaRe(x.name).test(clause));
      if (persona) {
        state.players[p.id].persona = persona.id;
        state.players[p.id].in = true;
        ack(p.id, `switching to ${persona.name}`);
        if (!targets.includes(p.id)) targets = [...targets, p.id];
        out.understood = true;
      }
    }

    // Band-wide moves.
    if (BUILD.test(clause) && !targets.filter((id) => !everyone).length) {
      const bars = Number(clause.match(/(\d+)\s*bars?/)?.[1] ?? 4);
      state.build = { startBar: nextBar, bars: Math.max(1, Math.min(64, bars)), from: state.energy, to: Math.min(1, state.energy + 0.4) };
      state.breakdown = false;
      out.notes.push(`Building over ${state.build.bars} bar${state.build.bars > 1 ? 's' : ''}`);
      out.understood = true;
    }
    if (BREAKDOWN.test(clause) && !/\bdrop out\b/i.test(clause)) {
      state.breakdown = true; state.build = undefined;
      out.notes.push('Breakdown');
      out.understood = true;
    }
    if (FULL.test(clause)) {
      state.breakdown = false;
      const g2 = genreById(state.genre);
      for (const p of BAND) if (g2.lineup.includes(p.role)) state.players[p.id].in = true;
      out.notes.push('Full band');
      out.understood = true;
    }
    if (HIT.test(clause)) {
      for (const id of targets.length ? targets : BAND.map((p) => p.id)) state.cues[id] = { ...state.cues[id], hit: true };
      out.notes.push('Band hit on the one');
      out.understood = true;
    }
    if (FILL.test(clause)) {
      const who = targets.length ? targets : [BAND.find((p) => p.role === 'drums')!.id];
      for (const id of who) { state.cues[id] = { ...state.cues[id], fill: true }; ack(id, 'fill coming'); }
      out.understood = true;
    }

    // Per-player moves. "Everybody out except X": the out applies to all, X is brought in.
    const isTargetless = !targets.length;
    for (const act of ACTS) {
      if (!act.re.test(head)) continue;
      if (act.did === 'coming in' && /\b(out|drop out|lay out)\b/i.test(head)) continue;
      // "in" on its own is only an instruction at the end of a clause ("bass in").
      if (act.did === 'coming in' && !/\b(come|bring|jump|join|back in|you'?re in|start)\b/i.test(head) && !/\bin\s*$/i.test(head)) continue;
      const who = isTargetless ? BAND.map((p) => p.id).filter((id) => state.players[id].in) : targets;
      if (act.did === 'taking the solo') for (const p of BAND) state.players[p.id].feature = false;
      for (const id of who) { act.apply(state.players[id]); ack(id, act.did); }
      out.understood = true;
      if (act.did === 'taking the solo') break;
    }
    if (except.length && /\b(out|drop out|lay out|tacet)\b/i.test(head)) {
      for (const id of except) { state.players[id].in = true; ack(id, 'staying in'); }
    }
    if (targets.length) lastTargets = targets;
  }
  // Energy words with no one named move the band's energy, not just who's playing.
  if (!playersIn(text).length) {
    if (/\b(more energy|hype|drive|intense|pick it up|bring the heat)\b/i.test(text)) { state.energy = clamp(state.energy + 0.2, 0, 1); out.notes.push('Band energy up'); }
    if (/\b(chill|relax|calm|mellow|less energy|cool it|ease up)\b/i.test(text)) { state.energy = clamp(state.energy - 0.2, 0, 1); out.notes.push('Band energy down'); }
  }
  // Only one featured soloist.
  const featured = BAND.filter((p) => state.players[p.id].feature);
  for (const p of featured.slice(0, -1)) state.players[p.id].feature = false;
  return out;
}

/** The band's energy at a bar (a build ramps it). */
export function energyAt(state: BandDirection, bar: number): number {
  const b = state.build;
  if (!b) return state.energy;
  const k = Math.max(0, Math.min(1, (bar - b.startBar) / b.bars));
  return b.from + (b.to - b.from) * k;
}

/** When a build has finished, settle the band at its peak. */
export function settleBuild(state: BandDirection, bar: number): void {
  if (state.build && bar >= state.build.startBar + state.build.bars) { state.energy = state.build.to; state.build = undefined; }
}
