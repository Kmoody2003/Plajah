/**
 * Kith Tennis — arcade tennis sim (singles + doubles), deterministic and fixed-step like the other Kith Party games.
 *
 * World frame (metres): x across the court, y up, z along it. The net is at z = 0. Team 0 plays the near half
 * (z > 0, the broadcast camera's side), team 1 the far half (z < 0).
 *
 * Shots are solved, not guessed: every stroke picks a target bounce point and a flight time, then solves the launch
 * velocity under gravity + spin (spin is modelled as extra constant vertical acceleration), so the renderer's
 * landing marker is exact. Bad timing, stretched reaches and greedy aim add error, which is where nets and outs
 * come from. Kith Type Specials bend those rules per type.
 */
import {kithKart, type KithType} from './abilities';
import type {CourseId} from './course3d';

// ---------------------------------------------------------------- court
export const COURT = {
 halfLength: 11.885,
 singlesHalfWidth: 4.115,
 doublesHalfWidth: 5.485,
 serviceLine: 6.4,
 netHeightCentre: .914,
 netHeightPost: 1.07,
 netPostX: 6.4,
 ballRadius: .045,
} as const;
export const GRAVITY = 9.81;
/** extra downward accel per unit of topspin (negative spin = slice lift) */
const SPIN_G = 4.2;
export const TENNIS_INTRO = 5.5;
export const POINT_PAUSE = 2.4;

export function netHeight(x: number): number {
 const u = Math.min(1, Math.abs(x) / COURT.netPostX);
 return COURT.netHeightCentre + (COURT.netHeightPost - COURT.netHeightCentre) * u * u;
}

// ---------------------------------------------------------------- venues
export type Surface = 'grass' | 'clay' | 'hard' | 'ice' | 'neon' | 'basalt';
export interface Venue {
 id: CourseId; name: string; subtitle: string; surface: Surface; badge: string;
 /** bounce restitution, horizontal speed kept through the bounce, slice skid factor */
 restitution: number; friction: number; skid: number;
 /** player traction (1 = full grip, lower = sliding) */
 grip: number;
 /** court paint: inner court, run-off, line colour */
 court: string; apron: string; lines: string; accent: string;
}
export const VENUES: Venue[] = [
 {id: 'crestfall-gardens', name: 'Crestfall Garden Court', subtitle: 'Fast grass under the sakura cliffs', surface: 'grass', badge: 'GRASS · FAST', restitution: .66, friction: .82, skid: 1.1, grip: .92, court: '#5fa34a', apron: '#4f8f3e', lines: '#ffffff', accent: '#ff9a1f'},
 {id: 'dune-canyon', name: 'Dune Canyon Clay', subtitle: 'Slow red clay, high kicking bounce', surface: 'clay', badge: 'CLAY · SLOW', restitution: .78, friction: .66, skid: .85, grip: .8, court: '#c9653a', apron: '#b5552f', lines: '#fff3e6', accent: '#ffb02e'},
 {id: 'amazon-canopy', name: 'Canopy Hard Court', subtitle: 'True-bouncing hard court in the jungle', surface: 'hard', badge: 'HARD · MEDIUM', restitution: .72, friction: .76, skid: 1, grip: 1, court: '#2f7fa6', apron: '#2f6b4e', lines: '#ffffff', accent: '#a6ff4d'},
 {id: 'polar-vortex', name: 'Polar Vortex Ice Court', subtitle: 'Glass-fast ice. Kith slide, slices skid', surface: 'ice', badge: 'ICE · SLIPPERY', restitution: .62, friction: .9, skid: 1.35, grip: .45, court: '#bfe6ff', apron: '#8cc4e8', lines: '#2a5fd6', accent: '#7ff7ff'},
 {id: 'abyssal-trench', name: 'Abyssal Dome', subtitle: 'Neon carpet court under the deep sea dome', surface: 'neon', badge: 'NEON · QUICK', restitution: .7, friction: .8, skid: 1.15, grip: .95, court: '#152a5c', apron: '#0d1838', lines: '#00f0ff', accent: '#ff2e93'},
 {id: 'ember-ridge', name: 'Ember Ridge Basalt', subtitle: 'Volcanic stone: heavy, high, wild', surface: 'basalt', badge: 'BASALT · HIGH', restitution: .82, friction: .74, skid: .95, grip: .95, court: '#3a2c2a', apron: '#2a1e1c', lines: '#ffb02e', accent: '#ff5a1a'},
];
export const venueById = (id: CourseId): Venue => VENUES.find(v => v.id === id) || VENUES[0];

// ---------------------------------------------------------------- formats
export type TennisFormat = 'quick' | 'classic' | 'full';
export const FORMATS: Record<TennisFormat, {label: string; games: number; noAd: boolean; tiebreakTo: number; detail: string}> = {
 quick: {label: 'Quick match', games: 2, noAd: true, tiebreakTo: 5, detail: 'First to 2 games · golden point at deuce'},
 classic: {label: 'Classic', games: 4, noAd: false, tiebreakTo: 7, detail: 'First to 4 games · deuce & advantage · tie-break'},
 full: {label: 'Full set', games: 6, noAd: false, tiebreakTo: 7, detail: 'A real set to 6 · tie-break at 6–6'},
};
export type Difficulty = 'rookie' | 'pro' | 'ace';
const AI_LEVEL: Record<Difficulty, {react: number; speed: number; error: number; quality: number; special: number; aimRisk: number}> = {
 rookie: {react: .32, speed: .8, error: 1.35, quality: .5, special: .45, aimRisk: .6},
 pro: {react: .2, speed: .93, error: 1.05, quality: .64, special: .75, aimRisk: .78},
 ace: {react: .12, speed: 1.02, error: .85, quality: .74, special: 1, aimRisk: .92},
};

// ---------------------------------------------------------------- specials
export type TennisSpecialId = 'inferno-drive' | 'bass-drop' | 'bramble-kick' | 'chain-zag' | 'riptide-curve' | 'confetti-decoy' | 'boulder-smash' | 'moon-warp' | 'gear-lob' | 'glacier-slice';
export interface TennisSpecial { id: TennisSpecialId; name: string; icon: string; color: string; description: string; }
export const TENNIS_SPECIALS: Record<KithType, TennisSpecial> = {
 Flare: {id: 'inferno-drive', name: 'Inferno Drive', icon: '🔥', color: '#ff5a1a', description: 'A blazing flat drive. Returning it without perfect timing knocks your racket wide.'},
 Resonance: {id: 'bass-drop', name: 'Bass Drop', icon: '♫', color: '#db388f', description: 'Floats high, then drops like a beat. The landing shockwave slows anyone close.'},
 Grove: {id: 'bramble-kick', name: 'Bramble Kick', icon: '❧', color: '#7ccf4a', description: 'Bounces off a thorn tangle and kicks sharply away from the receiver.'},
 Volt: {id: 'chain-zag', name: 'Chain Zag', icon: 'ϟ', color: '#ffe14a', description: 'A lightning ball that zig-zags across the court before it lands.'},
 Tide: {id: 'riptide-curve', name: 'Riptide Curve', icon: '≈', color: '#38c8ff', description: 'Huge sidespin: the ball bends hard into the far corner.'},
 Bloom: {id: 'confetti-decoy', name: 'Confetti Decoy', icon: '✿', color: '#ff8fd0', description: 'Splits into three in a burst of confetti. Only one is real.'},
 Terra: {id: 'boulder-smash', name: 'Boulder Smash', icon: '◆', color: '#c98a5a', description: 'A heavy ball. Return it without charging and you get shoved back and stunned.'},
 Astral: {id: 'moon-warp', name: 'Moon Warp', icon: '☾', color: '#a8a6ff', description: 'Blinks across the court mid-flight and lands somewhere new.'},
 Alloy: {id: 'gear-lob', name: 'Gear Lob', icon: '⚙', color: '#ffb347', description: 'A towering lob onto the baseline corner that skids away on landing.'},
 Frost: {id: 'glacier-slice', name: 'Glacier Slice', icon: '❄', color: '#9fe8ff', description: 'Skids ankle-low and freezes the receiver if it bounces near them.'},
};
export const tennisSpecialFor = (character: string): TennisSpecial => TENNIS_SPECIALS[kithKart(character).type];

/** Per-Kith player attributes from the shared kart stat line (1..5). */
export function tennisStats(character: string) {
 const s = kithKart(character).stats;
 return {
  speed: 5.4 + s.speed * .36,          // top run speed m/s
  accel: 15 + s.accel * 3.2,           // m/s²
  power: .9 + s.weight * .045,         // shot speed multiplier
  control: 1.3 - s.handling * .085,    // error multiplier
  reach: 1.12 + (s.handling >= 4 ? .08 : 0) + (s.weight >= 4 ? .06 : 0),
 };
}

// ---------------------------------------------------------------- state
export type ShotKind = 'topspin' | 'slice' | 'lob' | 'drop' | 'smash' | 'volley' | 'block' | 'dive' | 'serve' | 'special';
export interface TennisInput { x: number; y: number; topspin: boolean; slice: boolean; special: boolean; lob?: boolean; }
export const emptyTennisInput = (): TennisInput => ({x: 0, y: 0, topspin: false, slice: false, special: false, lob: false});

export type AnimState = 'idle' | 'run' | 'charge' | 'swing' | 'smash' | 'dive' | 'down' | 'toss' | 'serve' | 'celebrate' | 'sad' | 'frozen' | 'stunned';

export interface TennisPlayer {
 character: string; human: boolean; team: 0 | 1; slot: 0 | 1;
 x: number; z: number; vx: number; vz: number; y: number; vy: number;
 facing: number;
 stats: ReturnType<typeof tennisStats>;
 anim: AnimState; animT: number;
 /** which side the stroke is played on (+1 = player's +x) */
 swingSide: 1 | -1; swingKind: ShotKind | null;
 /** queued stroke from a button press, how long it has been held/queued */
 pending: ShotKind | null; pendingT: number; firstButton: 'topspin' | 'slice' | null;
 charge: number;
 /** Kith Type Special meter 0..1, armed for the next stroke */
 meter: number; armed: boolean;
 stun: number; frozen: number; slow: number; down: number; diveT: number; diveVX: number; diveVZ: number;
 lastTop: boolean; lastSlice: boolean; lastSpecial: boolean;
 aimX: number; aimDepth: number;
 /** score for Party Cup ranking + stats */
 score: number;
 stats2: {points: number; winners: number; aces: number; perfects: number; specials: number; dives: number; faults: number; hits: number};
 ai: {think: number; tx: number; tz: number; shot: ShotKind | null; pressAt: number; quality: number; aimX: number; aimDepth: number; useSpecial: boolean};
 feedback: string; feedbackT: number;
}

export interface TennisBall {
 x: number; y: number; z: number; vx: number; vy: number; vz: number;
 spin: number; curve: number;
 inPlay: boolean; held: boolean;
 lastHitter: number; lastTeam: 0 | 1;
 bounces: number; bounceSide: 0 | 1 | -1;
 serve: boolean; serveLet: boolean; touchedByReceiver: boolean;
 kind: ShotKind; special: TennisSpecialId | null; specialOwner: number;
 /** predicted first bounce of the current flight (for markers + AI) */
 target: {x: number; z: number; t: number} | null;
 flightT: number; flightDur: number;
 zigAmp: number; zigOff: number; warped: boolean; decoy: boolean;
 netted: boolean; speedKmh: number; age: number;
}

export interface TennisEvent { id: number; t: number; type: 'hit' | 'bounce' | 'net' | 'netcord' | 'out' | 'point' | 'fault' | 'let' | 'ace' | 'special' | 'dive' | 'perfect' | 'toss' | 'game' | 'match' | 'shock' | 'freeze' | 'knock' | 'warp' | 'call'; player: number; x: number; y: number; z: number; data: string; }

export interface TennisMatch {
 format: TennisFormat; games: [number, number]; points: [number, number];
 tiebreak: boolean; servingTeam: 0 | 1; serverSlot: [0 | 1, 0 | 1]; tbFirstServer: 0 | 1;
 serveNumber: 1 | 2; pointsInGame: number; winner: 0 | 1 | null;
 lastPointTeam: 0 | 1 | null; call: string; callT: number;
 rally: number; longestRally: number; totalPoints: number;
}

export interface TennisState {
 venue: CourseId; doubles: boolean; difficulty: Difficulty;
 time: number; phase: 'intro' | 'serve' | 'rally' | 'point' | 'finished';
 phaseT: number;
 serveState: 'ready' | 'toss' | 'struck';
 players: TennisPlayer[];
 ball: TennisBall;
 match: TennisMatch;
 events: TennisEvent[]; eventId: number;
 seed: number;
}

// ---------------------------------------------------------------- utils
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function rand(s: TennisState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
function gauss(s: TennisState) { return (rand(s) + rand(s) + rand(s) - 1.5) / .75; }
function emit(s: TennisState, type: TennisEvent['type'], player: number, x: number, y: number, z: number, data = '') {
 s.events.push({id: ++s.eventId, t: s.time, type, player, x, y, z, data});
 if (s.events.length > 96) s.events.splice(0, s.events.length - 96);
}
function say(p: TennisPlayer, text: string) { p.feedback = text; p.feedbackT = 1.1; }
const teamDir = (team: 0 | 1) => team === 0 ? -1 : 1; // direction a team hits toward (z)
const sideOf = (z: number): 0 | 1 => z > 0 ? 0 : 1;
export const halfWidth = (s: TennisState) => s.doubles ? COURT.doublesHalfWidth : COURT.singlesHalfWidth;

// ---------------------------------------------------------------- create
export function createTennisState(characters: string[], opts: {venue?: CourseId; doubles?: boolean; format?: TennisFormat; difficulty?: Difficulty; seed?: number} = {}): TennisState {
 const doubles = !!opts.doubles;
 const pool = ['zippi', 'fenn', 'moki', 'nori', 'pippa', 'luma', 'bram', 'tavi', 'rello', 'chora'].filter(c => !characters.includes(c));
 const n = doubles ? 4 : 2;
 const ids = [...characters, ...pool].slice(0, n);
 // humans: P1 always team 0 slot 0. P2 (versus) is on team 1 slot 0.
 const order: {team: 0 | 1; slot: 0 | 1; human: boolean; character: string}[] = [];
 const humans = characters.length;
 if (!doubles) {
  order.push({team: 0, slot: 0, human: true, character: ids[0]});
  order.push({team: 1, slot: 0, human: humans > 1, character: ids[1]});
 } else {
  order.push({team: 0, slot: 0, human: true, character: ids[0]});
  order.push({team: 1, slot: 0, human: humans > 1, character: ids[1]});
  order.push({team: 0, slot: 1, human: false, character: ids[2]});
  order.push({team: 1, slot: 1, human: false, character: ids[3]});
 }
 const s: TennisState = {
  venue: opts.venue || 'crestfall-gardens', doubles, difficulty: opts.difficulty || 'pro',
  time: -TENNIS_INTRO, phase: 'intro', phaseT: 0, serveState: 'ready',
  players: order.map(o => makePlayer(o.character, o.human, o.team, o.slot)),
  ball: makeBall(),
  match: {format: opts.format || 'quick', games: [0, 0], points: [0, 0], tiebreak: false, servingTeam: 0, serverSlot: [0, 0], tbFirstServer: 0, serveNumber: 1, pointsInGame: 0, winner: null, lastPointTeam: null, call: '', callT: 0, rally: 0, longestRally: 0, totalPoints: 0},
  events: [], eventId: 0, seed: (opts.seed ?? 1337) >>> 0 || 1,
 };
 setupServe(s);
 return s;
}

function makePlayer(character: string, human: boolean, team: 0 | 1, slot: 0 | 1): TennisPlayer {
 return {
  character, human, team, slot, x: 0, z: team === 0 ? 12 : -12, vx: 0, vz: 0, y: 0, vy: 0, facing: team === 0 ? Math.PI : 0,
  stats: tennisStats(character), anim: 'idle', animT: 0, swingSide: 1, swingKind: null,
  pending: null, pendingT: 0, firstButton: null, charge: 0, meter: 0, armed: false,
  stun: 0, frozen: 0, slow: 0, down: 0, diveT: 0, diveVX: 0, diveVZ: 0,
  lastTop: false, lastSlice: false, lastSpecial: false, aimX: 0, aimDepth: 0, score: 0,
  stats2: {points: 0, winners: 0, aces: 0, perfects: 0, specials: 0, dives: 0, faults: 0, hits: 0},
  ai: {think: 0, tx: 0, tz: 0, shot: null, pressAt: 0, quality: .8, aimX: 0, aimDepth: 0, useSpecial: false},
  feedback: '', feedbackT: 0,
 };
}

function makeBall(): TennisBall {
 return {x: 0, y: 1, z: 12, vx: 0, vy: 0, vz: 0, spin: 0, curve: 0, inPlay: false, held: true, lastHitter: 0, lastTeam: 0, bounces: 0, bounceSide: -1,
  serve: false, serveLet: false, touchedByReceiver: false, kind: 'serve', special: null, specialOwner: -1, target: null, flightT: 0, flightDur: 1,
  zigAmp: 0, zigOff: 0, warped: false, decoy: false, netted: false, speedKmh: 0, age: 0};
}

// ---------------------------------------------------------------- scoring helpers
export function serverIndex(s: TennisState): number {
 const m = s.match;
 return s.players.findIndex(p => p.team === m.servingTeam && p.slot === m.serverSlot[m.servingTeam]);
}
export function receiverIndex(s: TennisState): number {
 const m = s.match, recvTeam = (1 - m.servingTeam) as 0 | 1;
 const deuceSide = m.pointsInGame % 2 === 0;
 if (!s.doubles) return s.players.findIndex(p => p.team === recvTeam);
 // doubles: slot 0 receives on the deuce court, slot 1 on the ad court
 return s.players.findIndex(p => p.team === recvTeam && p.slot === (deuceSide ? 0 : 1));
}
const POINT_NAMES = ['0', '15', '30', '40'];
/** Scoreboard text for each team's current point. */
export function pointLabels(s: TennisState): [string, string] {
 const m = s.match, [a, b] = m.points;
 if (m.tiebreak) return [String(a), String(b)];
 const f = FORMATS[m.format];
 if (a >= 3 && b >= 3) {
  if (a === b) return ['40', '40'];
  if (f.noAd) return ['40', '40'];
  return a > b ? ['AD', ''] : ['', 'AD'];
 }
 return [POINT_NAMES[Math.min(3, a)], POINT_NAMES[Math.min(3, b)]];
}
function teamName(s: TennisState, team: 0 | 1): string {
 const ps = s.players.filter(p => p.team === team);
 const nm = (c: string) => c === 'rello' ? 'Reello' : c[0].toUpperCase() + c.slice(1);
 return ps.map(p => nm(p.character)).join(' & ');
}
/** Pressure call for the scoreboard: BREAK / SET / MATCH POINT, DEUCE, TIE-BREAK. */
export function pressureCall(s: TennisState): string {
 const m = s.match, f = FORMATS[m.format];
 const wouldWinGame = (team: 0 | 1) => {
  const [a, b] = team === 0 ? m.points : [m.points[1], m.points[0]];
  if (m.tiebreak) return a + 1 >= f.tiebreakTo && a + 1 - b >= 2;
  if (f.noAd && a === 3 && b === 3) return true;
  return a >= 3 && a - b >= 1;
 };
 const wouldWinMatch = (team: 0 | 1) => {
  if (!wouldWinGame(team)) return false;
  const g = m.games[team] + 1, o = m.games[1 - team];
  return m.tiebreak || (g >= f.games && g - o >= 2);
 };
 for (const team of [0, 1] as const) if (wouldWinMatch(team)) return 'MATCH POINT';
 for (const team of [0, 1] as const) if (team !== m.servingTeam && wouldWinGame(team)) return 'BREAK POINT';
 const [a, b] = m.points;
 if (!m.tiebreak && a >= 3 && a === b) return f.noAd ? 'DECIDING POINT' : 'DEUCE';
 if (m.tiebreak) return 'TIE-BREAK';
 return '';
}

/** Award a point and run the game / tie-break / match bookkeeping. Exported for tests and tools. */
export function awardPoint(s: TennisState, team: 0 | 1, how: string) {
 const m = s.match, f = FORMATS[m.format], b = s.ball;
 if (s.phase === 'point' || s.phase === 'finished') return;
 m.points[team]++;
 m.pointsInGame++;
 m.totalPoints++;
 m.lastPointTeam = team;
 m.longestRally = Math.max(m.longestRally, m.rally);
 b.inPlay = false;
 const hitter = s.players[b.lastHitter];
 s.players.forEach((p, i) => {
  if (p.team === team) { p.stats2.points++; p.score += 10; p.anim = 'celebrate'; p.animT = 0; p.meter = Math.min(1, p.meter + .08); }
  else { p.anim = 'sad'; p.animT = 0; }
  void i;
 });
 if ((how === 'WINNER' || how === 'ACE') && hitter && hitter.team === team) {
  if (how === 'ACE') hitter.stats2.aces++; else hitter.stats2.winners++;
  hitter.score += 15;
 }
 emit(s, 'point', b.lastHitter, b.x, b.y, b.z, `${team}|${how}`);
 // game / tiebreak bookkeeping
 let gameWon = false;
 const [a, o] = team === 0 ? m.points : [m.points[1], m.points[0]];
 if (m.tiebreak) gameWon = a >= f.tiebreakTo && a - o >= 2;
 else if (f.noAd) gameWon = a >= 4;
 else gameWon = a >= 4 && a - o >= 2;
 let call = how;
 if (gameWon) {
  m.games[team]++;
  s.players.forEach(p => { if (p.team === team) p.score += 50; });
  const g = m.games[team], og = m.games[1 - team];
  const broke = team !== m.servingTeam;
  const matchWon = m.tiebreak || (g >= f.games && g - og >= 2);
  if (matchWon) {
   m.winner = team;
   s.players.forEach(p => { if (p.team === team) p.score += 300; });
   call = `GAME, SET & MATCH · ${teamName(s, team)}`;
   emit(s, 'match', -1, 0, 0, 0, String(team));
  } else {
   call = `${broke ? 'BREAK! ' : ''}GAME ${teamName(s, team)}`;
   emit(s, 'game', -1, 0, 0, 0, String(team));
   // next game
   const wasTB = m.tiebreak;
   m.points = [0, 0]; m.pointsInGame = 0;
   m.tiebreak = !wasTB && m.games[0] === f.games && m.games[1] === f.games;
   rotateServer(s);
   if (m.tiebreak) m.tbFirstServer = m.servingTeam;
  }
 } else {
  if (m.tiebreak && m.pointsInGame % 2 === 1) rotateServer(s, true);
  const pc = pressureCall(s);
  if (!f.noAd && !m.tiebreak && m.points[0] >= 3 && m.points[1] >= 3 && m.points[0] !== m.points[1]) call = `${how} · ADVANTAGE ${teamName(s, m.points[0] > m.points[1] ? 0 : 1)}`;
  else if (pc) call = `${how} · ${pc}`;
 }
 m.call = call; m.callT = POINT_PAUSE;
 m.serveNumber = 1;
 s.phase = 'point'; s.phaseT = 0;
}

function rotateServer(s: TennisState, tiebreakSwap = false) {
 const m = s.match;
 const prevTeam = m.servingTeam;
 m.servingTeam = (1 - m.servingTeam) as 0 | 1;
 // in doubles each team alternates its server every time it serves a new game
 if (s.doubles && !tiebreakSwap) m.serverSlot[m.servingTeam] = (1 - m.serverSlot[m.servingTeam]) as 0 | 1;
 if (s.doubles && tiebreakSwap) m.serverSlot[prevTeam] = (1 - m.serverSlot[prevTeam]) as 0 | 1;
}

// ---------------------------------------------------------------- serve setup
function setupServe(s: TennisState) {
 const m = s.match, b = s.ball;
 const si = serverIndex(s), ri = receiverIndex(s);
 const deuce = m.pointsInGame % 2 === 0;
 s.serveState = 'ready';
 m.rally = 0;
 s.players.forEach((p, i) => {
  const dir = p.team === 0 ? 1 : -1; // +z for near team
  // a player's right-hand side: near team (facing -z) right = +x, far team right = -x
  const right = p.team === 0 ? 1 : -1;
  const sideX = (deuce ? 1 : -1) * right;
  p.vx = p.vz = 0; p.y = 0; p.vy = 0;
  p.pending = null; p.charge = 0; p.firstButton = null; p.swingKind = null; p.anim = 'idle'; p.animT = 0;
  p.stun = p.frozen = p.slow = p.down = p.diveT = 0; p.armed = false;
  p.facing = p.team === 0 ? Math.PI : 0;
  if (i === si) { p.x = sideX * .9; p.z = dir * 12.25; }
 });
 const sv = s.players[si], srvSign = Math.sign(sv.x) || 1;
 s.players.forEach((p, i) => {
  if (i === si) return;
  const dir = p.team === 0 ? 1 : -1;
  // the receiver waits on the diagonal; the server's partner hugs the net on the other half; the receiver's partner holds the service line
  if (i === ri) { p.x = -srvSign * (s.doubles ? 3.1 : 2.7); p.z = dir * 11.6; }
  else if (p.team === m.servingTeam) { p.x = -srvSign * 2.5; p.z = dir * 3.2; }
  else { p.x = srvSign * 2.5; p.z = dir * 6.6; }
 });
 Object.assign(b, makeBall());
 b.held = true; b.x = sv.x + .35 * (sv.team === 0 ? 1 : -1); b.z = sv.z; b.y = 1.05;
 b.lastHitter = si; b.lastTeam = sv.team;
}

// ---------------------------------------------------------------- shot solver
interface ShotPlan { tx: number; tz: number; dur: number; spin: number; curve: number; margin: number; }
/** Solve launch velocity from (x0,y0,z0) to bounce point (tx, r, tz) in `dur` seconds under gravity + spin. */
function solveLaunch(x0: number, y0: number, z0: number, plan: ShotPlan) {
 const g = GRAVITY + plan.spin * SPIN_G;
 const T = plan.dur;
 const vx = (plan.tx - x0) / T - .5 * plan.curve * T;
 const vz = (plan.tz - z0) / T;
 const vy = (COURT.ballRadius - y0 + .5 * g * T * T) / T;
 return {vx, vy, vz, g};
}
function heightAtNet(x0: number, y0: number, z0: number, v: {vx: number; vy: number; vz: number; g: number}, curve: number) {
 if (Math.sign(z0) === Math.sign(z0 + v.vz) && Math.abs(v.vz) < 1e-3) return Infinity;
 const tn = -z0 / v.vz;
 if (tn <= 0) return Infinity;
 const x = x0 + v.vx * tn + .5 * curve * tn * tn;
 return {y: y0 + v.vy * tn - .5 * v.g * tn * tn, x, tn};
}

function launch(s: TennisState, hitterIdx: number, kind: ShotKind, quality: number, aimX: number, aimDepth: number, charge: number, special: TennisSpecialId | null) {
 const p = s.players[hitterIdx], b = s.ball, hw = halfWidth(s), dir = teamDir(p.team);
 const st = p.stats;
 // pressure: pace of the incoming ball and hitting on the run
 const pace = Math.hypot(b.vx, b.vy, b.vz), run = Math.hypot(p.vx, p.vz);
 const pressure = clamp((pace - 12) / 30, 0, 1) * .5 + clamp(run / p.stats.speed, 0, 1) * .45 + (b.spin > .9 ? .15 : 0);
 quality = clamp(quality - pressure * (kind === 'smash' ? .1 : .32), .1, 1);
 const err = (1.12 - quality) * 1.75 * st.control * (kind === 'block' || kind === 'dive' ? .7 : 1) * (p.human ? 1 : AI_LEVEL[s.difficulty].error);
 // ---- target
 const aimW = hw - .4;
 let tx = clamp(aimX, -1, 1) * aimW;
 let depth: number; // metres from the net on the far side
 let speed: number;  // ground speed m/s
 let spin = 0, curve = 0, margin = .28;
 const power = st.power * (1 + charge * .32) * (quality > .85 ? 1.08 : 1);
 switch (kind) {
  case 'topspin': depth = lerp(8.4, 10.9, (aimDepth + 1) / 2) - (Math.abs(aimX) > .7 ? .9 : 0); speed = 21.5 * power; spin = 1 + charge * .5; margin = .32; break;
  case 'slice': depth = lerp(6.8, 10.2, (aimDepth + 1) / 2); speed = 17 * power; spin = -.55; margin = .22; break;
  case 'lob': depth = lerp(9.6, 11.2, (aimDepth + 1) / 2); speed = 9.5 * (1 + charge * .2); spin = .35; margin = 2.5; break;
  case 'drop': depth = lerp(1.6, 3.8, (aimDepth + 1) / 2); speed = 8.5; spin = -1.1; margin = .18; break;
  case 'smash': depth = lerp(7.5, 10.4, (aimDepth + 1) / 2); speed = 30 * power; spin = .3; margin = .1; tx = clamp(aimX, -1, 1) * aimW * 1.02; break;
  case 'volley': depth = lerp(6.4, 9.8, (aimDepth + 1) / 2); speed = 16.5 * st.power; spin = -.2; margin = .2; break;
  case 'block': depth = 7.6; speed = 13.5; spin = 0; margin = .45; tx = clamp(aimX, -1, 1) * aimW * .55; break;
  case 'dive': depth = 7.2; speed = 9; spin = .1; margin = 1.2; tx = clamp(aimX, -1, 1) * aimW * .5; break;
  default: depth = 9; speed = 20; break;
 }
 // specials reshape the shot
 let zig = 0, decoy = false;
 if (special) {
  switch (special) {
   case 'inferno-drive': speed = 36 * st.power; spin = .15; margin = .12; depth = 10.2; break;
   case 'bass-drop': speed = 19; spin = 4.2; margin = .4; depth = 8.8; break;
   case 'bramble-kick': speed = 22; spin = .8; depth = 7.6; break;
   case 'chain-zag': speed = 24; spin = .6; zig = 1.6; depth = 9.6; break;
   case 'riptide-curve': speed = 22; spin = .4; curve = -Math.sign(tx || (p.x > 0 ? -1 : 1)) * 9; tx = Math.sign(tx || -p.x || 1) * aimW * .92; depth = 9.4; break;
   case 'confetti-decoy': speed = 24; spin = .8; decoy = true; depth = 9.6; break;
   case 'boulder-smash': speed = 29 * st.power; spin = .5; depth = 9.4; break;
   case 'moon-warp': speed = 21; spin = .6; depth = 9.2; break;
   case 'gear-lob': speed = 9; spin = .2; margin = 3; depth = 11.3; tx = Math.sign(tx || (rand(s) > .5 ? 1 : -1)) * aimW * .9; break;
   case 'glacier-slice': speed = 19; spin = -1; depth = 8.8; margin = .16; break;
  }
  quality = Math.max(quality, .92);
 }
 // ---- error
 let netMiss = false;
 const e = special ? .15 : err;
 tx += gauss(s) * e * .9;
 depth += gauss(s) * e * 1.05;
 // bots also make honest unforced errors, more under pressure
 if (!p.human && !special && kind !== 'block') {
  const lvl = AI_LEVEL[s.difficulty];
  const missChance = (s.difficulty === 'rookie' ? .15 : s.difficulty === 'pro' ? .095 : .06) + pressure * .14 * lvl.error;
  if (rand(s) < missChance) {
   const r = rand(s);
   if (r < .36) netMiss = true;                                     // into the net
   else if (r < .7) depth = COURT.halfLength + .35 + rand(s) * 1.6; // long
   else tx = Math.sign(tx || 1) * (hw + .3 + rand(s) * 1.2);        // wide
  }
 }
 const tz = dir * depth;
 const dist = Math.hypot(tx - b.x, tz - b.z);
 let dur = clamp(dist / speed, .38, 3.2);
 if (kind === 'lob' || special === 'gear-lob') dur = clamp(dist / speed, 1.6, 2.6);
 if (kind === 'drop') dur = clamp(dist / speed, .9, 1.8);
 // late/poor contact lowers the net margin (that's how balls find the tape)
 margin -= (1 - quality) * .95;
 let v = solveLaunch(b.x, b.y, b.z, {tx, tz, dur, spin, curve, margin});
 for (let k = 0; k < 24; k++) {
  const hn = heightAtNet(b.x, b.y, b.z, v, curve);
  if (hn === Infinity || typeof hn === 'number') break;
  if (hn.y - COURT.ballRadius >= netHeight(hn.x) + margin) break;
  dur *= 1.07; v = solveLaunch(b.x, b.y, b.z, {tx, tz, dur, spin, curve, margin});
 }
 if (netMiss) {
  // re-aim the launch so it meets the tape a hand's width low
  const tn = -b.z / v.vz;
  if (tn > .05) v.vy = (netHeight(tx * .5) - .12 - rand(s) * .3 - b.y + .5 * v.g * tn * tn) / tn;
 }
 // apply
 b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.spin = spin; b.curve = curve;
 b.inPlay = true; b.held = false; b.lastHitter = hitterIdx; b.lastTeam = p.team; b.bounces = 0; b.bounceSide = -1;
 b.kind = special ? 'special' : kind; b.special = special; b.specialOwner = special ? hitterIdx : -1;
 b.target = {x: tx, z: tz, t: dur}; b.flightT = 0; b.flightDur = dur;
 b.zigAmp = zig; b.zigOff = 0; b.warped = false; b.decoy = decoy; b.netted = false; b.age = 0;
 b.speedKmh = Math.round(Math.hypot(v.vx, v.vy, v.vz) * 3.6);
 if (kind !== 'serve') b.serve = false;
 s.match.rally++;
 p.stats2.hits++;
 p.swingKind = kind; p.anim = kind === 'smash' ? 'smash' : kind === 'dive' ? 'dive' : 'swing'; p.animT = 0;
 p.swingSide = (b.x - p.x) * (p.team === 0 ? 1 : -1) >= 0 ? 1 : -1;
 // meter
 p.meter = clamp(p.meter + (special ? -1 : quality > .85 ? .14 : .06) + charge * .06, 0, 1);
 if (quality > .85 && !special && kind !== 'block' && kind !== 'dive') { p.stats2.perfects++; p.score += 4; emit(s, 'perfect', hitterIdx, b.x, b.y, b.z, kind); say(p, 'PERFECT'); }
 if (special) { p.stats2.specials++; p.score += 8; emit(s, 'special', hitterIdx, b.x, b.y, b.z, special); say(p, tennisSpecialFor(p.character).name.toUpperCase()); }
 emit(s, 'hit', hitterIdx, b.x, b.y, b.z, `${b.kind}|${Math.round(charge * 100)}|${quality.toFixed(2)}`);
}

// ---------------------------------------------------------------- prediction (AI + markers)
/** Simulate the ball forward. Returns samples every `dt` until the second bounce or `maxT`. */
export function predictBall(s: TennisState, maxT = 2.6, dt = 1 / 60): {t: number; x: number; y: number; z: number; bounces: number}[] {
 const b = s.ball;
 const out: {t: number; x: number; y: number; z: number; bounces: number}[] = [];
 let x = b.x - b.zigOff, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, bounces = b.bounces;
 const ven = venueById(s.venue);
 const g = GRAVITY + b.spin * SPIN_G;
 for (let t = 0; t < maxT; t += dt) {
  vx += b.curve * dt; vy -= g * dt;
  x += vx * dt; y += vy * dt; z += vz * dt;
  if (y <= COURT.ballRadius && vy < 0) {
   y = COURT.ballRadius; bounces++;
   const r = bounceResponse(ven, b.spin, b.special);
   vy = -vy * r.vy; vx *= r.h; vz *= r.h;
   if (bounces >= 2) { out.push({t, x, y, z, bounces}); break; }
  }
  out.push({t, x, y, z, bounces});
 }
 return out;
}

function bounceResponse(v: Venue, spin: number, special: TennisSpecialId | null) {
 let vy = v.restitution, h = v.friction;
 if (spin > 0) { vy *= 1 + Math.min(.35, spin * .14); h *= 1 + spin * .03; }
 if (spin < 0) { vy *= Math.max(.35, 1 + spin * .38 * v.skid); h *= Math.min(1.1, 1 + (-spin) * .06 * v.skid); }
 if (special === 'glacier-slice') { vy *= .45; h *= 1.08; }
 if (special === 'gear-lob') { vy *= .7; h *= 1.55; }
 if (special === 'bass-drop') { vy *= .55; }
 return {vy, h};
}

// ---------------------------------------------------------------- step
export function stepTennis(s: TennisState, inputs: TennisInput[], dt: number) {
 s.time += dt;
 s.phaseT += dt;
 for (const p of s.players) { p.animT += dt; p.feedbackT = Math.max(0, p.feedbackT - dt); }
 if (s.match.callT > 0) s.match.callT = Math.max(0, s.match.callT - dt);
 if (s.phase === 'intro') {
  if (s.time >= 0) { s.phase = 'serve'; s.phaseT = 0; }
  idlePlayers(s, dt);
  return;
 }
 if (s.phase === 'finished') { idlePlayers(s, dt); return; }
 if (s.phase === 'point') {
  idlePlayers(s, dt);
  stepBallFree(s, dt);
  if (s.phaseT >= POINT_PAUSE) {
   if (s.match.winner !== null) { s.phase = 'finished'; s.phaseT = 0; return; }
   s.phase = 'serve'; s.phaseT = 0; setupServe(s);
  }
  return;
 }
 // humans + AI
 const humanIdx = s.players.map((p, i) => p.human ? i : -1).filter(i => i >= 0);
 s.players.forEach((p, i) => {
  const hi = humanIdx.indexOf(i);
  const inp = p.human ? (inputs[hi] || emptyTennisInput()) : aiInput(s, i, dt);
  stepPlayer(s, i, inp, dt);
 });
 if (s.phase === 'serve') stepServe(s, dt);
 else stepBall(s, dt);
}

function idlePlayers(s: TennisState, dt: number) {
 for (const p of s.players) {
  p.vx *= Math.exp(-dt * 8); p.vz *= Math.exp(-dt * 8);
  p.x += p.vx * dt; p.z += p.vz * dt;
  if (p.y > 0 || p.vy) { p.vy -= 22 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.vy = 0; }
  if ((p.anim === 'celebrate' && s.phase !== 'point' && s.phase !== 'finished') || (p.anim === 'swing' && p.animT > .6)) p.anim = 'idle';
 }
}

// ---- players
function stepPlayer(s: TennisState, i: number, inp: TennisInput, dt: number) {
 const p = s.players[i], b = s.ball, ven = venueById(s.venue);
 const isServer = s.phase === 'serve' && i === serverIndex(s);
 p.stun = Math.max(0, p.stun - dt); p.frozen = Math.max(0, p.frozen - dt); p.slow = Math.max(0, p.slow - dt);
 // ---- buttons (edge + held)
 const topEdge = inp.topspin && !p.lastTop, sliceEdge = inp.slice && !p.lastSlice, specEdge = inp.special && !p.lastSpecial;
 const lobEdge = !!inp.lob && !(p as any)._lastLob;
 (p as any)._lastLob = !!inp.lob;
 p.lastTop = inp.topspin; p.lastSlice = inp.slice; p.lastSpecial = inp.special;
 // aim follows the stick the whole time (screen-relative for x; depth = toward the opponent)
 p.aimX = clamp(inp.x, -1, 1);
 p.aimDepth = clamp(p.team === 0 ? -inp.y : inp.y, -1, 1);
 if (specEdge && p.meter >= 1 && !isServer) { p.armed = !p.armed; if (p.armed) say(p, 'SPECIAL READY'); }

 if (isServer) { serverControl(s, i, inp, topEdge || sliceEdge || lobEdge, dt); return; }

 // ---- queue strokes (Mario-style: press early to charge, second button changes the stroke)
 const receiving = b.inPlay && b.lastTeam !== p.team;
 if (s.phase === 'rally' && p.down <= 0 && p.diveT <= 0 && p.frozen <= 0) {
  if (topEdge || sliceEdge || lobEdge) {
   if (p.pending && p.firstButton && ((topEdge && p.firstButton === 'slice') || (sliceEdge && p.firstButton === 'topspin'))) {
    p.pending = p.firstButton === 'topspin' ? 'lob' : 'drop';
   } else if (!p.pending) {
    p.pending = lobEdge ? 'lob' : topEdge ? 'topspin' : 'slice'; p.pendingT = 0; p.firstButton = lobEdge ? null : topEdge ? 'topspin' : 'slice';
    // out of reach? try a dive
    if (receiving) tryDive(s, i);
   }
  }
 }
 if (p.pending) {
  p.pendingT += dt;
  p.charge = clamp((p.pendingT - .22) / .85, 0, 1);
  // a held stroke on a ball that is not coming yet simply expires
  if (!receiving && p.pendingT > 1.2) { p.pending = null; p.charge = 0; p.firstButton = null; }
  // still out of reach at the last moment: launch into a dive
  else if (receiving && p.pending !== 'dive' && p.diveT <= 0 && p.down <= 0) tryDive(s, i);
 }

 // ---- movement
 if (p.diveT > 0) {
  p.diveT -= dt;
  p.x += p.diveVX * dt; p.z += p.diveVZ * dt;
  if (p.diveT <= 0) { p.down = .75; p.anim = 'down'; p.animT = 0; }
  tryHit(s, i, dt);
  clampPlayer(s, p);
  return;
 }
 if (p.down > 0) { p.down -= dt; p.vx *= Math.exp(-dt * 10); p.vz *= Math.exp(-dt * 10); clampPlayer(s, p); if (p.down <= 0) p.anim = 'idle'; tryHit(s, i, dt); return; }
 let mx = inp.x, mz = inp.y; // screen-relative: +y = toward the camera = +z
 const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
 let top = p.stats.speed * (p.human ? 1 : AI_LEVEL[s.difficulty].speed);
 if (p.pending) top *= .42 + (1 - p.charge) * .18; // planted while charging
 if (p.slow > 0) top *= .45;
 if (p.frozen > 0 || p.stun > 0) top = 0;
 const acc = p.stats.accel * ven.grip;
 const tvx = mx * top, tvz = mz * top;
 const k = 1 - Math.exp(-dt * acc / Math.max(1, top) * (len > .05 ? 1 : 1.6) * (ven.grip < .6 ? .6 : 1));
 p.vx += (tvx - p.vx) * k; p.vz += (tvz - p.vz) * k;
 p.x += p.vx * dt; p.z += p.vz * dt;
 clampPlayer(s, p);
 const sp = Math.hypot(p.vx, p.vz);
 if (p.y > 0 || p.vy) { p.vy -= 22 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.vy = 0; }
 // face the ball when it's live, otherwise the run direction
 const want = b.inPlay ? Math.atan2(b.x - p.x, b.z - p.z) : sp > .5 ? Math.atan2(p.vx, p.vz) : (p.team === 0 ? Math.PI : 0);
 let d = want - p.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
 p.facing += d * Math.min(1, dt * 10);
 const busy = (p.anim === 'swing' || p.anim === 'smash') && p.animT < .45;
 if (p.frozen > 0) p.anim = 'frozen';
 else if (p.stun > 0) p.anim = 'stunned';
 else if (!busy && p.anim !== 'celebrate' && p.anim !== 'sad') p.anim = p.pending ? 'charge' : sp > .8 ? 'run' : 'idle';
 else if ((p.anim === 'celebrate' || p.anim === 'sad') && s.phase === 'rally') p.anim = 'idle';
 tryHit(s, i, dt);
}

function clampPlayer(s: TennisState, p: TennisPlayer) {
 const lim = halfWidth(s) + 3.2;
 p.x = clamp(p.x, -lim, lim);
 if (p.team === 0) p.z = clamp(p.z, .55, 16.5); else p.z = clamp(p.z, -16.5, -.55);
}

function tryDive(s: TennisState, i: number) {
 const p = s.players[i];
 const reach = p.stats.reach;
 const path = predictBall(s, 1.1, 1 / 60);
 let best: {t: number; x: number; z: number; d: number} | null = null;
 for (const q of path) {
  if (sideOf(q.z) !== p.team || q.y > 2 || q.bounces >= 2) continue;
  const d = Math.hypot(q.x - p.x, q.z - p.z);
  if (!best || d < best.d) best = {t: q.t, x: q.x, z: q.z, d};
 }
 if (!best || best.d <= reach + .25 || best.d > reach + 2.6 || best.t > .42) return;
 const dur = Math.max(.18, Math.min(.4, best.t));
 p.diveT = dur; p.diveVX = (best.x - p.x) / dur * .85; p.diveVZ = (best.z - p.z) / dur * .85;
 p.pending = 'dive'; p.anim = 'dive'; p.animT = 0; p.stats2.dives++;
 emit(s, 'dive', i, p.x, 0, p.z);
 say(p, 'DIVE!');
}

/** Contact check: a stroke fires at the ball's closest approach inside the hitting zone. */
function tryHit(s: TennisState, i: number, _dt: number) {
 const p = s.players[i], b = s.ball;
 if (!b.inPlay || b.lastTeam === p.team || s.phase !== 'rally') return;
 if (sideOf(b.z) !== p.team) return;
 if (b.serve && b.bounces === 0) return; // the serve must bounce
 if (b.bounces >= 2 || b.netted) return;
 if (p.frozen > 0 || p.stun > 0 || p.down > 0) return;
 // in doubles only one of a team strikes; whoever connects first
 const reach = p.stats.reach + (p.diveT > 0 ? .5 : 0) + (p.pending ? .08 : 0);
 const dx = b.x - p.x, dz = b.z - p.z;
 const d = Math.hypot(dx, dz);
 const h = b.y - p.y;
 const highBall = h > 1.95;
 const smashOK = highBall && h < 3.5 && d < reach + .25;
 if (!smashOK && (h > 2.25 || h < .04)) return;
 if (d > reach) return;
 // closest approach: next frame further away, or already well inside
 const nx = b.x + b.vx / 120 - p.x, nz = b.z + b.vz / 120 - p.z;
 const closing = Math.hypot(nx, nz) < d - 1e-4;
 const ideal = .82;
 const autoBlock = !p.pending && p.human;
 if (closing && d > ideal && !(p.diveT > 0)) return;
 if (!p.pending && !autoBlock) return;
 if (autoBlock && d > .95) return;
 // ---- timing quality
 const lead = p.pendingT;
 let qt = p.pending ? (lead < .05 ? .5 : lead < .12 ? .78 : lead < .45 ? 1 : .93) : .55;
 const qp = 1 - clamp(Math.abs(d - .8) / 1.1, 0, 1) * .45 - clamp(Math.abs(h - 1) / 1.7, 0, 1) * .3;
 let quality = p.human ? clamp(qt * qp, .15, 1) : clamp(AI_LEVEL[s.difficulty].quality * (.85 + qp * .15) + gauss(s) * .13, .15, .97);
 if (p.diveT > 0 || p.pending === 'dive') quality = Math.min(quality, .5);
 // receiving a special
 if (b.special === 'inferno-drive' && quality < .9) { quality *= .55; p.stun = .35; emit(s, 'knock', i, p.x, 1, p.z, 'inferno'); say(p, 'RACKET KNOCKED!'); }
 if (b.special === 'boulder-smash' && p.charge < .5) { quality *= .55; p.stun = .45; p.vz += (p.team === 0 ? 1 : -1) * 6; emit(s, 'knock', i, p.x, 1, p.z, 'boulder'); say(p, 'SHOVED BACK!'); }
 let kind: ShotKind = p.pending && p.pending !== 'dive' ? p.pending : p.diveT > 0 || p.pending === 'dive' ? 'dive' : 'block';
 const atNet = Math.abs(p.z) < 5.2;
 if (smashOK && kind !== 'dive' && kind !== 'block') kind = 'smash';
 else if (b.bounces === 0 && atNet && (kind === 'topspin' || kind === 'slice')) kind = 'volley';
 const charge = kind === 'block' || kind === 'dive' ? 0 : p.charge;
 const special = p.armed && p.meter >= 1 && kind !== 'block' && kind !== 'dive' ? tennisSpecialFor(p.character).id : null;
 if (b.lastTeam !== p.team && !b.touchedByReceiver && b.serve) b.touchedByReceiver = true;
 b.serve = false;
 const aimX = p.human ? p.aimX || (p.x > 0 ? -.35 : .35) : p.ai.aimX;
 const aimD = p.human ? p.aimDepth : p.ai.aimDepth;
 if (kind === 'smash') { p.vy = 5.5; }
 launch(s, i, kind, quality, aimX, aimD, charge, special);
 if (special) p.armed = false;
 p.pending = null; p.pendingT = 0; p.charge = 0; p.firstButton = null;
 if (s.doubles) s.players.forEach(o => { if (o !== p && o.team === p.team) { o.pending = null; o.charge = 0; } });
}

// ---- serve
function serverControl(s: TennisState, i: number, inp: TennisInput, press: boolean, dt: number) {
 const p = s.players[i], b = s.ball, m = s.match;
 const deuce = m.pointsInGame % 2 === 0;
 const right = p.team === 0 ? 1 : -1;
 const sideSign = (deuce ? 1 : -1) * right;
 if (s.serveState === 'ready') {
  // shuffle along the baseline on your half
  const tx = clamp(p.x + inp.x * 3.2 * dt, sideSign > 0 ? .25 : -halfWidth(s) + .3, sideSign > 0 ? halfWidth(s) - .3 : -.25);
  p.x = tx; p.vx = 0; p.vz = 0; p.anim = 'idle';
  b.x = p.x + .35 * right; b.z = p.z + .15 * teamDir(p.team); b.y = 1.05;
  if (press && s.phaseT > .45) {
   s.serveState = 'toss'; b.held = false; b.vy = 4.9; b.vx = 0; b.vz = 0; b.y = 1.25; p.anim = 'toss'; p.animT = 0;
   emit(s, 'toss', i, b.x, b.y, b.z);
  }
  return;
 }
 if (s.serveState === 'toss') {
  p.aimX = clamp(inp.x, -1, 1);
  if (press) {
   // timing: hit near the top of the toss
   const apexY = 1.25 + 4.9 * 4.9 / (2 * GRAVITY);
   const qt = 1 - clamp(Math.abs(b.y - (apexY - .06)) / .55, 0, 1) * .7 - (b.vy < -1.6 ? .25 : 0);
   serveStrike(s, i, clamp(qt, .2, 1));
  }
 }
}

function stepServe(s: TennisState, dt: number) {
 const b = s.ball, si = serverIndex(s), p = s.players[si];
 if (s.serveState === 'ready') {
  // bots serve after a beat
  if (!p.human && s.phaseT > .9) { s.serveState = 'toss'; b.held = false; b.vy = 4.9; b.y = 1.25; p.anim = 'toss'; p.animT = 0; p.ai.pressAt = .38 + rand(s) * .14; emit(s, 'toss', si, b.x, b.y, b.z); }
  return;
 }
 if (s.serveState === 'toss') {
  b.vy -= GRAVITY * dt; b.y += b.vy * dt;
  if (!p.human && p.animT >= p.ai.pressAt) {
   const lvl = AI_LEVEL[s.difficulty];
   p.aimX = (rand(s) - .5) * 2;
   serveStrike(s, si, clamp(lvl.quality + (rand(s) - .5) * .25, .3, 1));
   return;
  }
  if (b.y < .85) { // let it drop: re-toss
   s.serveState = 'ready'; s.phaseT = 0; b.held = true; b.vy = 0; b.y = 1.05; p.anim = 'idle';
  }
 }
}

function serveStrike(s: TennisState, i: number, quality: number) {
 const p = s.players[i], b = s.ball, m = s.match;
 const deuce = m.pointsInGame % 2 === 0;
 const dir = teamDir(p.team);
 const recvRight = p.team === 0 ? -1 : 1; // receiver's right-hand x sign
 const boxSign = (deuce ? 1 : -1) * recvRight;
 const hw = COURT.singlesHalfWidth;
 // aim: -1 = down the T, +1 = out wide
 const aim = clamp(p.aimX * boxSign, -1, 1);
 const second = m.serveNumber === 2;
 const errMul = (second ? .45 : 1) * p.stats.control;
 let tx = boxSign * lerp(.45, hw - .35, (aim + 1) / 2);
 let tz = dir * lerp(4.9, COURT.serviceLine - .35, .7);
 tx += gauss(s) * (1.05 - quality) * .9 * errMul;
 tz += dir * gauss(s) * (1.05 - quality) * 1.1 * errMul;
 const speed = (second ? 20 : 24 + quality * 13) * p.stats.power;
 const spin = second ? 1.2 : .25;
 b.held = false;
 b.y = Math.max(b.y, 2.2);
 const dist = Math.hypot(tx - b.x, tz - b.z);
 let dur = clamp(dist / speed, .42, 1.3);
 const margin = (second ? .3 : .12) - (1 - quality) * .5;
 let v = solveLaunch(b.x, b.y, b.z, {tx, tz, dur, spin, curve: 0, margin});
 for (let k = 0; k < 20; k++) {
  const hn = heightAtNet(b.x, b.y, b.z, v, 0);
  if (hn === Infinity || typeof hn === 'number') break;
  if (hn.y - COURT.ballRadius >= netHeight(hn.x) + margin) break;
  dur *= 1.06; v = solveLaunch(b.x, b.y, b.z, {tx, tz, dur, spin, curve: 0, margin});
 }
 Object.assign(b, {vx: v.vx, vy: v.vy, vz: v.vz, spin, curve: 0, inPlay: true, held: false, lastHitter: i, lastTeam: p.team, bounces: 0, bounceSide: -1,
  serve: true, serveLet: false, touchedByReceiver: false, kind: 'serve', special: null, specialOwner: -1, target: {x: tx, z: tz, t: dur}, flightT: 0, flightDur: dur,
  zigAmp: 0, zigOff: 0, warped: false, decoy: false, netted: false, age: 0, speedKmh: Math.round(Math.hypot(v.vx, v.vy, v.vz) * 3.6)});
 s.serveState = 'struck';
 s.phase = 'rally'; s.phaseT = 0;
 m.rally = 0;
 p.anim = 'serve'; p.animT = 0; p.swingKind = 'serve';
 if (quality > .88) { emit(s, 'perfect', i, b.x, b.y, b.z, 'serve'); say(p, `PERFECT SERVE ${b.speedKmh} KM/H`); p.stats2.perfects++; p.meter = Math.min(1, p.meter + .1); }
 emit(s, 'hit', i, b.x, b.y, b.z, `serve|0|${quality.toFixed(2)}`);
}

function fault(s: TennisState, why: string) {
 const m = s.match, si = serverIndex(s), p = s.players[si];
 emit(s, 'fault', si, s.ball.x, s.ball.y, s.ball.z, why);
 p.stats2.faults++;
 if (m.serveNumber === 1) {
  m.serveNumber = 2; m.call = `FAULT · ${why}`; m.callT = 1.3;
  s.phase = 'serve'; s.phaseT = -.6;
  const keep = {...m};
  setupServe(s);
  Object.assign(m, {serveNumber: keep.serveNumber, call: keep.call, callT: keep.callT});
 } else {
  awardPoint(s, (1 - m.servingTeam) as 0 | 1, 'DOUBLE FAULT');
 }
}

// ---- ball
function stepBallFree(s: TennisState, dt: number) {
 const b = s.ball;
 if (b.held) return;
 b.vy -= GRAVITY * dt;
 b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
 if (b.y < COURT.ballRadius) { b.y = COURT.ballRadius; b.vy = Math.abs(b.vy) * .55; b.vx *= .8; b.vz *= .8; }
 b.vx *= Math.exp(-dt * .3); b.vz *= Math.exp(-dt * .3);
}

function stepBall(s: TennisState, dt: number) {
 const b = s.ball, ven = venueById(s.venue);
 if (!b.inPlay) { stepBallFree(s, dt); return; }
 b.age += dt; b.flightT += dt;
 const g = GRAVITY + b.spin * SPIN_G;
 const prevZ = b.z, prevY = b.y, prevX = b.x;
 b.vx += b.curve * dt; b.vy -= g * dt;
 // base trajectory carries the zig offset separately so the landing stays solved
 const baseX = b.x - b.zigOff;
 const nbx = baseX + b.vx * dt;
 b.y += b.vy * dt; b.z += b.vz * dt;
 if (b.zigAmp > 0 && b.bounces === 0) {
  const u = clamp(b.flightT / b.flightDur, 0, 1);
  b.zigOff = b.zigAmp * Math.sin(u * Math.PI * 4) * (1 - u);
 } else b.zigOff *= Math.exp(-dt * 12);
 b.x = nbx + b.zigOff;
 // Moon Warp: blink across halfway through the flight
 if (b.special === 'moon-warp' && !b.warped && b.bounces === 0 && b.flightT > b.flightDur * .5) {
  b.warped = true;
  const hw = halfWidth(s) - .5;
  const nx = clamp(-Math.sign(b.target?.x || 1) * hw * .8, -hw, hw);
  const rem = Math.max(.15, b.flightDur - b.flightT);
  const shift = nx - (b.target?.x ?? b.x);
  emit(s, 'warp', b.specialOwner, b.x, b.y, b.z);
  b.x += shift * .55; b.vx = ((b.target?.x ?? b.x) + shift - b.x) / rem - .5 * b.curve * rem;
  if (b.target) b.target.x = nx;
  emit(s, 'warp', b.specialOwner, b.x, b.y, b.z, 'arrive');
 }
 // ---- net
 if (Math.sign(prevZ) !== Math.sign(b.z) && prevZ !== 0) {
  const u = prevZ / (prevZ - b.z);
  const nx = prevX + (b.x - prevX) * u, ny = prevY + (b.y - prevY) * u;
  const nh = netHeight(nx);
  if (Math.abs(nx) < COURT.netPostX + .2) {
   if (ny - COURT.ballRadius < nh - .05) {
    // into the net
    b.z = prevZ; b.vz *= -.12; b.vx *= .3; b.vy = Math.min(b.vy, 0) * .3; b.netted = true;
    emit(s, 'net', b.lastHitter, nx, ny, 0);
   } else if (ny - COURT.ballRadius < nh + .02) {
    // clips the tape
    b.vz *= .4; b.vy = Math.abs(b.vy) * .25 + 1.2; b.vx *= .7;
    if (b.serve) b.serveLet = true;
    b.target = null;
    emit(s, 'netcord', b.lastHitter, nx, ny, 0);
   }
  }
 }
 // ---- bounce
 if (b.y <= COURT.ballRadius && b.vy < 0) {
  b.y = COURT.ballRadius;
  const side = sideOf(b.z);
  const r = bounceResponse(ven, b.spin, b.special);
  const impact = Math.abs(b.vy);
  b.vy = impact * r.vy; b.vx *= r.h; b.vz *= r.h;
  emit(s, 'bounce', b.lastHitter, b.x, 0, b.z, `${side}|${b.special || b.kind}|${impact.toFixed(1)}`);
  const hw = halfWidth(s) + .03, inLength = Math.abs(b.z) <= COURT.halfLength + .03;
  if (b.serve && (b.netted || side === b.lastTeam)) { fault(s, 'NET'); return; }
  if (b.netted || side === b.lastTeam) {
   awardPoint(s, (1 - b.lastTeam) as 0 | 1, b.netted ? 'NET' : 'OUT');
   return;
  }
  b.bounces++;
  if (b.bounces === 1) {
   if (b.serve) {
    const recvRight = b.lastTeam === 0 ? -1 : 1;
    const deuce = s.match.pointsInGame % 2 === 0;
    const boxSign = (deuce ? 1 : -1) * recvRight;
    const inBox = Math.abs(b.z) <= COURT.serviceLine + .03 && b.x * boxSign >= -.03 && Math.abs(b.x) <= COURT.singlesHalfWidth + .03;
    if (!inBox) { fault(s, Math.abs(b.z) > COURT.serviceLine ? 'LONG' : 'WIDE'); return; }
    if (b.serveLet) {
     emit(s, 'let', b.lastHitter, b.x, 0, b.z);
     const m = s.match, keep = m.serveNumber; m.call = 'LET · FIRST SERVE'.replace('FIRST', keep === 1 ? 'FIRST' : 'SECOND'); m.callT = 1.2;
     s.phase = 'serve'; s.phaseT = -.4; setupServe(s); m.serveNumber = keep; return;
    }
   } else if (Math.abs(b.x) > hw || !inLength) {
    emit(s, 'out', b.lastHitter, b.x, 0, b.z);
    awardPoint(s, side, 'OUT');
    return;
   }
   b.bounceSide = side;
   // special bounce effects
   if (b.special) bounceSpecial(s, side);
   b.target = null;
  } else {
   awardPoint(s, b.lastTeam, b.serve || (s.match.rally <= 1 && !b.touchedByReceiver) ? 'ACE' : 'WINNER');
   return;
  }
 }
 // ---- left the arena
 if (Math.abs(b.z) > 24 || Math.abs(b.x) > 17) {
  if (b.serve && b.bounces === 0) { fault(s, 'LONG'); return; }
  if (b.bounces === 0 && !b.netted) { emit(s, 'out', b.lastHitter, b.x, b.y, b.z); awardPoint(s, (1 - b.lastTeam) as 0 | 1, 'OUT'); }
  else awardPoint(s, b.lastTeam, b.serve ? 'ACE' : 'WINNER');
 }
 // netted balls that roll to a stop
 if (b.netted && b.age > 3 && s.phase === 'rally') { if (b.serve) fault(s, 'NET'); else awardPoint(s, (1 - b.lastTeam) as 0 | 1, 'NET'); }
}

function bounceSpecial(s: TennisState, side: 0 | 1) {
 const b = s.ball;
 const near = s.players.map((p, i) => ({p, i, d: Math.hypot(p.x - b.x, p.z - b.z)})).filter(o => o.p.team === side).sort((a, c) => a.d - c.d)[0];
 switch (b.special) {
  case 'bramble-kick': {
   const away = near ? -Math.sign(near.p.x - b.x || 1) : 1;
   b.vx += away * 7.5; b.vz *= .75; break;
  }
  case 'bass-drop':
   emit(s, 'shock', b.specialOwner, b.x, 0, b.z);
   s.players.forEach(p => { if (p.team === side && Math.hypot(p.x - b.x, p.z - b.z) < 3.6) { p.slow = .9; say(p, 'SLOWED!'); } });
   break;
  case 'glacier-slice':
   if (near && near.d < 3.2) { near.p.frozen = .65; emit(s, 'freeze', near.i, near.p.x, 1, near.p.z); say(near.p, 'FROZEN!'); }
   break;
 }
 b.decoy = false;
}

// ---------------------------------------------------------------- AI
function aiInput(s: TennisState, i: number, dt: number): TennisInput {
 const p = s.players[i], b = s.ball, lvl = AI_LEVEL[s.difficulty];
 const inp = emptyTennisInput();
 const dir = p.team === 0 ? 1 : -1;
 if (s.phase === 'serve') return inp; // serving handled in stepServe; others hold position
 p.ai.think -= dt;
 const receiving = b.inPlay && b.lastTeam !== p.team && !b.netted;
 // doubles: who takes it?
 let mine = receiving;
 let tx = p.slot === 1 && s.doubles ? (p.x > 0 ? 1.6 : -1.6) : 0;
 let tz = dir * (s.doubles && p.slot === 1 ? 3.6 : 11.8);
 if (receiving && b.age < lvl.react * (b.serve ? 1.6 : 1)) {
  // still reading the shot: keep drifting toward the last plan
  tx = p.ai.tx; tz = p.ai.tz;
 } else if (receiving) {
  const path = predictBall(s, 2.4, 1 / 60);
  // best contact: on our side, after the bounce (or volley if at the net), comfortable height
  let pick: {t: number; x: number; z: number; y: number} | null = null, pickScore = Infinity;
  for (const q of path) {
   if (sideOf(q.z) !== p.team || q.bounces >= 2) continue;
   if (b.serve && q.bounces === 0) continue;
   if (q.y < .25 || q.y > 2.2) continue;
   const reachT = Math.max(0, Math.hypot(q.x - p.x, q.z - p.z) - p.stats.reach * .8) / (p.stats.speed * lvl.speed);
   const late = reachT - q.t;
   const score = (late > 0 ? 6 + late * 10 : 0) + Math.abs(q.y - 1.05) * 1.2 + (q.bounces === 0 && Math.abs(q.z) > 5 ? 2.5 : 0) + q.t * .3;
   if (score < pickScore) { pickScore = score; pick = q; }
  }
  if (s.doubles) {
   const mate = s.players.find(o => o !== p && o.team === p.team)!;
   if (pick) {
    const dMe = Math.hypot(pick.x - p.x, pick.z - p.z), dMate = Math.hypot(pick.x - mate.x, pick.z - mate.z);
    mine = mate.human ? dMe + .9 < dMate : dMe <= dMate + (p.slot === 0 ? .1 : -.1);
   }
  }
  if (mine && pick) {
   // stand beside the ball so it arrives at forehand distance
   const side = (pick.x >= 0 ? -1 : 1) * (p.ai.think > 0 ? 1 : 1);
   tx = pick.x + side * .72; tz = pick.z + dir * .25;
   p.ai.tx = tx; p.ai.tz = tz;
   // decide the stroke once the ball is close
   const tcontact = pick.t;
   if (!p.ai.shot && tcontact < .55 + rand(s) * .02) chooseAiShot(s, i, pick);
   if (p.ai.shot && tcontact < p.ai.pressAt && !p.pending) {
    if (p.ai.shot === 'topspin') inp.topspin = true;
    else if (p.ai.shot === 'slice') inp.slice = true;
    else if (p.ai.shot === 'lob') inp.lob = true;
    else if (p.ai.shot === 'drop') { inp.slice = true; p.ai.shot = 'drop2' as ShotKind; }
   }
   if ((p.ai.shot as string) === 'drop2' && p.pending === 'slice') inp.topspin = true;
   if (p.ai.useSpecial && p.meter >= 1 && !p.armed) inp.special = true;
  }
  if (!pick && receiving) {
   // nothing reachable: chase the bounce anyway
   const t = b.target; if (t) { tx = t.x; tz = t.z + dir * 1.5; }
  }
 } else {
  p.ai.shot = null;
  // recover: singles to the centre of the possible angles, doubles to formation
  if (b.inPlay && b.lastTeam === p.team) {
   const o = s.players.filter(q => q.team !== p.team);
   const ox = o.reduce((a, q) => a + q.x, 0) / Math.max(1, o.length);
   tx = (s.doubles ? (p.slot === 1 ? 1.8 : -1.8) * Math.sign(ox || 1) * -1 + ox * .25 : ox * .32);
   if (!s.doubles) {
    const target = b.target;
    // after a deep approach, ace bots follow it in
    if (s.difficulty === 'ace' && target && Math.abs(target.z) > 9.5 && b.kind !== 'lob' && rand(s) < .004) tz = dir * 4.5;
   }
  }
 }
 const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
 const slowIn = dist < .35 ? 0 : Math.min(1, dist / .9);
 if (dist > .05) { inp.x = dx / dist * slowIn; inp.y = dz / dist * slowIn; }
 // aim: away from the opponent, risk by level
 const opps = s.players.filter(q => q.team !== p.team);
 const ox = opps.reduce((a, q) => a + q.x, 0) / Math.max(1, opps.length);
 if (p.ai.think <= 0) {
  p.ai.think = .25;
  p.ai.aimX = clamp(-Math.sign(ox || (rand(s) - .5)) * (.45 + rand(s) * .55) * lvl.aimRisk, -1, 1);
  p.ai.aimDepth = rand(s) * 2 - 1;
 }
 return inp;
}

function chooseAiShot(s: TennisState, i: number, contact: {x: number; z: number; y: number; t: number}) {
 const p = s.players[i], lvl = AI_LEVEL[s.difficulty];
 const opps = s.players.filter(q => q.team !== p.team);
 const oppAtNet = opps.some(o => Math.abs(o.z) < 5);
 const oppDeep = opps.every(o => Math.abs(o.z) > 10.5);
 const r = rand(s);
 let shot: ShotKind = r < .62 ? 'topspin' : 'slice';
 if (oppAtNet && r < .35) shot = 'lob';
 else if (oppDeep && Math.abs(contact.z) < 7 && r < .22 + (s.difficulty === 'ace' ? .1 : 0)) shot = 'drop';
 p.ai.shot = shot;
 p.ai.pressAt = clamp(.32 + rand(s) * .2 - (1 - lvl.quality) * .25, .06, .5);
 p.ai.useSpecial = p.meter >= 1 && rand(s) < lvl.special * .7;
}

// ---------------------------------------------------------------- results
export function tennisStandings(s: TennisState) {
 return s.players.map((p, index) => ({...p, index})).sort((a, b) => (s.match.winner !== null ? (b.team === s.match.winner ? 1 : 0) - (a.team === s.match.winner ? 1 : 0) : 0) || b.score - a.score);
}
