// Dominoes — two-player draw game, double-six set. Pure rules + CPU, shared by client and server.
//
// House rules: 7 tiles each, 14 in the boneyard. Hand one opens with whoever holds the highest double (or the
// heaviest tile); later hands open with the last hand's winner. Play a tile matching either open end; if you
// can't, draw from the boneyard until you can (one tile per move); with an empty boneyard you pass. Going out
// scores the pips left in the other hand. A blocked line (both pass) goes to the lighter hand, which scores the
// other hand's pips; equal hands score nothing. First to 100 wins.

import { shuffle, newSeed, parse } from './rng';

export const ID = 'dominoes';
export const TARGET = 100;

export type Tile = [number, number];
export interface DominoState {
  g: 'dominoes';
  rs: number;
  hands: string[][];
  bone: string[];
  line: Tile[];
  turn: 0 | 1;
  passes: number;
  scores: [number, number];
  handNo: number;
  lastHand: { winner: 0 | 1 | null; points: number; blocked: boolean } | null;
  over: { winner: 0 | 1 } | null;
}

export const tileOf = (s: string): Tile => { const [a, b] = s.split('-').map(Number); return [a, b]; };
export const pips = (s: string) => { const [a, b] = tileOf(s); return a + b; };
const handPips = (h: string[]) => h.reduce((n, s) => n + pips(s), 0);
const allTiles = () => { const t: string[] = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push(`${a}-${b}`); return t; };
export const ends = (line: Tile[]): [number, number] | null => (line.length ? [line[0][0], line[line.length - 1][1]] : null);

export function playableEnds(line: Tile[], tile: string): ('L' | 'R')[] {
  const e = ends(line); if (!e) return ['L'];
  const [a, b] = tileOf(tile); const out: ('L' | 'R')[] = [];
  if (a === e[0] || b === e[0]) out.push('L');
  if (a === e[1] || b === e[1]) out.push('R');
  return out;
}
const canPlay = (t: DominoState, seat: number) => t.hands[seat].some(x => playableEnds(t.line, x).length > 0);

function dealHand(t: DominoState, opener: 0 | 1 | null): DominoState {
  const [d, rs] = shuffle(allTiles(), t.rs);
  const hands = [d.slice(0, 7), d.slice(7, 14)];
  let turn: 0 | 1 = opener ?? 0;
  if (opener === null) {
    const weight = (h: string[]) => Math.max(...h.map(s => { const [a, b] = tileOf(s); return a === b ? 100 + a : a + b; }));
    turn = weight(hands[0]) >= weight(hands[1]) ? 0 : 1;
  }
  return { ...t, rs, hands, bone: d.slice(14), line: [], turn, passes: 0, handNo: t.handNo + 1 };
}

export function initialState(seed = newSeed()): DominoState {
  return dealHand({ g: 'dominoes', rs: seed >>> 0, hands: [[], []], bone: [], line: [], turn: 0, passes: 0, scores: [0, 0], handNo: 0, lastHand: null, over: null }, null);
}

function endHand(t: DominoState, winner: 0 | 1 | null, blocked: boolean): DominoState {
  const points = winner === null ? 0 : handPips(t.hands[1 - winner]);
  const scores: [number, number] = [...t.scores] as [number, number];
  if (winner !== null) scores[winner] += points;
  const over = scores[0] >= TARGET ? { winner: 0 as const } : scores[1] >= TARGET ? { winner: 1 as const } : null;
  const done: DominoState = { ...t, scores, lastHand: { winner, points, blocked }, over };
  return over ? done : dealHand(done, winner ?? (t.turn === 0 ? 1 : 0));
}

function step(t: DominoState, seat: 0 | 1, move: any): DominoState | null {
  if (t.over || t.turn !== seat || !move || typeof move !== 'object') return null;
  const other: 0 | 1 = seat === 0 ? 1 : 0;
  if (move.draw) {
    if (canPlay(t, seat) || !t.bone.length) return null;
    const hands = t.hands.map((h, i) => (i === seat ? [...h, t.bone[0]] : h));
    return { ...t, hands, bone: t.bone.slice(1) };
  }
  if (move.pass) {
    if (canPlay(t, seat) || t.bone.length) return null;
    const n: DominoState = { ...t, passes: t.passes + 1, turn: other };
    if (n.passes >= 2) {
      const a = handPips(t.hands[0]), b = handPips(t.hands[1]);
      return endHand(n, a === b ? null : a < b ? 0 : 1, true);
    }
    return n;
  }
  const tile = String(move.play ?? '');
  if (!t.hands[seat].includes(tile)) return null;
  const side = move.end === 'R' ? 'R' : 'L';
  const okEnds = playableEnds(t.line, tile);
  if (!okEnds.includes(side) && !(t.line.length === 0)) return null;
  const [a, b] = tileOf(tile);
  let line: Tile[];
  const e = ends(t.line);
  if (!e) line = [[a, b]];
  else if (side === 'L') line = [[a === e[0] ? b : a, e[0]], ...t.line];
  else line = [...t.line, [e[1], a === e[1] ? b : a]];
  const hands = t.hands.map((h, i) => (i === seat ? h.filter(x => x !== tile) : h));
  const n: DominoState = { ...t, hands, line, passes: 0, turn: other };
  return hands[seat].length === 0 ? endHand({ ...n, turn: seat }, seat, false) : n;
}

export function botMoveFor(t: DominoState, seat: number): { play: string; end: 'L' | 'R' } | { draw: true } | { pass: true } {
  const options = t.hands[seat].flatMap(x => playableEnds(t.line, x).map(end => ({ x, end })));
  if (options.length) { const best = options.sort((p, q) => pips(q.x) - pips(p.x))[0]; return { play: best.x, end: best.end }; }
  // Works on a redacted view too, where the boneyard is only a count.
  const bone = (t as DominoState & { boneCount?: number }).boneCount ?? t.bone.length;
  return bone ? { draw: true } : { pass: true };
}

export const initial = (seed?: number) => JSON.stringify(initialState(seed));
export const seatToMove = (s: string): 0 | 1 => parse<DominoState>(s)?.turn ?? 0;
export function apply(s: string, seat: 0 | 1, move: unknown): string | null {
  const t = parse<DominoState>(s); if (!t) return null;
  const n = step(t, seat, move); return n ? JSON.stringify(n) : null;
}
export const outcome = (s: string) => { const t = parse<DominoState>(s); return t?.over ? { winnerSeat: t.over.winner, draw: false, detail: { scores: t.scores } } : null; };
export function viewFor(s: string, seat: number): string {
  const t = parse<DominoState>(s); if (!t) return s;
  const out: Record<string, unknown> = { ...t, hands: t.hands.map((h, i) => (i === seat ? h : [])), counts: t.hands.map(h => h.length), bone: [], boneCount: t.bone.length };
  delete out.rs;
  return JSON.stringify(out);
}
export const botMove = (s: string, seat: number) => botMoveFor(parse<DominoState>(s)!, seat);
