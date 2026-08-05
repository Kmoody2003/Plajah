// soccerLearn.ts — content for the interactive "New to Soccer" onboarding:
// the basics, positions & formations (rendered on an SVG pitch), the key rules,
// the culture, a glossary, and a trivia quiz.

export interface Basic { icon: string; title: string; body: string; }
export const BASICS: Basic[] = [
  { icon: '🎯', title: 'The Goal', body: 'Two teams of 11 try to kick the ball into the other team\'s net. Most goals wins. That\'s it — the rest is detail.' },
  { icon: '⏱️', title: '90 Minutes', body: 'Two 45-minute halves. The clock counts UP and never stops — the referee adds "stoppage time" at the end of each half.' },
  { icon: '🥅', title: 'Scoring', body: 'The whole ball must cross the whole goal line. Scores are low — a 2–1 game is normal, and 0–0 draws happen.' },
  { icon: '✋', title: 'No Hands', body: 'Only the goalkeeper may use hands, and only inside their box. Everyone else uses feet, head, chest — anything but arms.' },
  { icon: '🔁', title: 'Flow', body: 'Play barely stops. There are no timeouts; substitutions (up to 5) happen on the run. It\'s constant, flowing motion.' },
  { icon: '🏆', title: 'Winning a Cup', body: 'Leagues reward the best over a season. Knockout cups like the World Cup are win-or-go-home — where legends are made.' },
];

export interface Role { code: string; name: string; job: string; }
export const ROLES: Record<string, Role> = {
  GK: { code: 'GK', name: 'Goalkeeper', job: 'Last line of defense — the only player allowed to use their hands (inside the box). Shot-stopper and organizer.' },
  CB: { code: 'CB', name: 'Centre-Back', job: 'Central defender. Wins headers, blocks shots, marks strikers, starts attacks from the back.' },
  LB: { code: 'LB', name: 'Left-Back', job: 'Defends the left flank and overlaps forward to support attacks and deliver crosses.' },
  RB: { code: 'RB', name: 'Right-Back', job: 'Mirror of the left-back on the right — defend wide, then bomb forward.' },
  WB: { code: 'WB', name: 'Wing-Back', job: 'A full-back with license to attack — covers the entire flank, end to end, all game.' },
  DM: { code: 'DM', name: 'Defensive Mid', job: 'Shields the defense, breaks up attacks, and recycles possession. The "anchor" or "pivot".' },
  CM: { code: 'CM', name: 'Central Mid', job: 'The engine — links defense and attack, covers huge ground, dictates tempo.' },
  AM: { code: 'AM', name: 'Attacking Mid', job: 'The creator (the "No. 10") — plays between the lines, threads the killer pass, scores.' },
  LW: { code: 'LW', name: 'Left Winger', job: 'Wide attacker — beats defenders 1v1, cuts inside to shoot or whips in crosses.' },
  RW: { code: 'RW', name: 'Right Winger', job: 'Wide attacker on the right — pace, dribbling and end product.' },
  ST: { code: 'ST', name: 'Striker', job: 'The finisher — leads the line, holds the ball up, and puts chances in the net.' },
};

export interface FormationSlot { role: string; x: number; y: number; }   // % on a vertical pitch
export interface Formation { name: string; nickname: string; slots: FormationSlot[]; }
export const FORMATIONS: Formation[] = [
  { name: '4-3-3', nickname: 'Attacking width & a front three', slots: [
    { role: 'GK', x: 50, y: 92 },
    { role: 'LB', x: 16, y: 74 }, { role: 'CB', x: 38, y: 78 }, { role: 'CB', x: 62, y: 78 }, { role: 'RB', x: 84, y: 74 },
    { role: 'DM', x: 50, y: 60 }, { role: 'CM', x: 32, y: 50 }, { role: 'CM', x: 68, y: 50 },
    { role: 'LW', x: 20, y: 26 }, { role: 'ST', x: 50, y: 18 }, { role: 'RW', x: 80, y: 26 },
  ] },
  { name: '4-4-2', nickname: 'The classic — two banks of four', slots: [
    { role: 'GK', x: 50, y: 92 },
    { role: 'LB', x: 16, y: 74 }, { role: 'CB', x: 38, y: 78 }, { role: 'CB', x: 62, y: 78 }, { role: 'RB', x: 84, y: 74 },
    { role: 'LW', x: 16, y: 48 }, { role: 'CM', x: 38, y: 52 }, { role: 'CM', x: 62, y: 52 }, { role: 'RW', x: 84, y: 48 },
    { role: 'ST', x: 38, y: 22 }, { role: 'ST', x: 62, y: 22 },
  ] },
  { name: '3-5-2', nickname: 'Wing-backs and a packed midfield', slots: [
    { role: 'GK', x: 50, y: 92 },
    { role: 'CB', x: 30, y: 78 }, { role: 'CB', x: 50, y: 80 }, { role: 'CB', x: 70, y: 78 },
    { role: 'WB', x: 12, y: 56 }, { role: 'CM', x: 34, y: 56 }, { role: 'DM', x: 50, y: 62 }, { role: 'CM', x: 66, y: 56 }, { role: 'WB', x: 88, y: 56 },
    { role: 'ST', x: 38, y: 22 }, { role: 'ST', x: 62, y: 22 },
  ] },
];

export interface Rule { icon: string; title: string; body: string; tip?: string; }
export const RULES: Rule[] = [
  { icon: '🚩', title: 'Offside', body: 'When the ball is played to you, you must not be nearer the goal than the second-last defender (usually the last outfielder). You can\'t just camp by the goal waiting.', tip: 'Timing beats position: stay level, then sprint as the pass is played.' },
  { icon: '🟨', title: 'Fouls, Yellow & Red', body: 'Kicking, tripping or shoving concedes a free kick. A yellow card is a warning; two yellows = a red. A straight red for a serious foul means you\'re OFF and your team plays a man down.', tip: 'A red card can swing an entire match.' },
  { icon: '⚪', title: 'Penalty Kick', body: 'A foul inside your own box gives the other team a free shot from 12 yards, keeper vs taker. It\'s a near-certain goal — and pure drama.' },
  { icon: '📐', title: 'Set Pieces', body: 'Restarts from a stoppage: corner kicks (ball out off a defender), free kicks (after a foul), and throw-ins (ball out on the side — the only time hands are used).' },
  { icon: '🖥️', title: 'VAR', body: 'Video Assistant Referee reviews goals, penalties, red cards and mistaken identity. It steps in only for "clear and obvious" errors.' },
  { icon: '⏳', title: 'Extra Time & Penalties', body: 'In knockout games a draw goes to two 15-minute periods of extra time. Still level? A penalty shootout decides it — five kicks each, then sudden death. Nerves of steel required.' },
];

export interface CultureItem { emoji: string; title: string; body: string; }
export const CULTURE: CultureItem[] = [
  { emoji: '🎶', title: 'The Songs', body: 'Fans sing for 90 straight minutes — anthems like "You\'ll Never Walk Alone" turn stadiums into a wall of sound. The crowd is the 12th player.' },
  { emoji: '⚔️', title: 'Derbies & Rivalries', body: 'Some games mean everything: Argentina–Brazil, England–Germany, Barcelona–Real Madrid ("El Clásico"). History, pride and bragging rights on the line.' },
  { emoji: '🧣', title: 'Colours & Scarves', body: 'You wear your club or country. Scarves held aloft, flares, tifos (giant fan-made banners) — identity you inherit and never change.' },
  { emoji: '🌍', title: 'The World\'s Game', body: 'Half the planet watched the last World Cup final. In most countries football isn\'t a sport, it\'s the culture — a shared language across every border.' },
  { emoji: '💫', title: 'Magic Moments', body: 'A last-minute winner, an impossible goal, an underdog run — football delivers collective, unscripted joy (and heartbreak) like nothing else.' },
];

export interface GlossaryTerm { term: string; def: string; }
export const GLOSSARY: GlossaryTerm[] = [
  { term: 'Brace', def: 'Two goals by one player in a game. Three is a "hat-trick".' },
  { term: 'Clean sheet', def: 'Conceding zero goals — a shutout for the goalkeeper and defense.' },
  { term: 'Nutmeg', def: 'Playing the ball through an opponent\'s legs. Deeply humiliating; deeply satisfying.' },
  { term: 'Derby', def: 'A match between two local rivals.' },
  { term: 'Pitch', def: 'The field of play.' },
  { term: 'Box', def: 'The penalty area — the big rectangle in front of goal.' },
  { term: 'Cross', def: 'A pass whipped in from a wide area toward the box.' },
  { term: 'Tackle', def: 'Winning the ball from an opponent with your feet.' },
  { term: 'Injury / Stoppage time', def: 'Extra minutes added at the end of a half for time lost.' },
  { term: 'Equalizer', def: 'A goal that levels the score.' },
  { term: 'Away goals / Aggregate', def: 'In two-leg ties, the combined score across both games.' },
  { term: 'Man-marking', def: 'Assigning a defender to shadow one specific opponent.' },
];

export interface QuizQ { q: string; options: string[]; answer: number; explain: string; }
export const QUIZ: QuizQ[] = [
  { q: 'How many players are on the pitch per team?', options: ['9', '10', '11', '12'], answer: 2, explain: '11 per side, including the goalkeeper.' },
  { q: 'Who can use their hands during open play?', options: ['The captain', 'The goalkeeper', 'Anyone in the box', 'Nobody'], answer: 1, explain: 'Only the goalkeeper, and only inside their own penalty area.' },
  { q: 'What does a red card mean?', options: ['A warning', 'A free kick', 'The player is sent off', 'A goal is disallowed'], answer: 2, explain: 'The player leaves and their team continues with 10 men.' },
  { q: 'Three goals by one player is called a…', options: ['Brace', 'Hat-trick', 'Treble', 'Nutmeg'], answer: 1, explain: 'A hat-trick. (A "treble" is winning three trophies in a season.)' },
  { q: 'How is a knockout game decided if still level after extra time?', options: ['A coin toss', 'Replay next day', 'Penalty shootout', 'Golden goal only'], answer: 2, explain: 'A penalty shootout: five kicks each, then sudden death.' },
  { q: 'The offside rule stops attackers from…', options: ['Passing backward', 'Camping by the goal', 'Tackling hard', 'Scoring headers'], answer: 1, explain: 'You can\'t get behind the last defender before the ball is played to you.' },
  { q: 'How many teams play in the 2026 World Cup?', options: ['32', '40', '48', '64'], answer: 2, explain: '48 teams — the biggest ever, hosted by the USA, Canada and Mexico.' },
  { q: 'A "clean sheet" means a team…', options: ['Won the game', 'Scored first', 'Conceded no goals', 'Had no fouls'], answer: 2, explain: 'They kept the opponent from scoring.' },
];
