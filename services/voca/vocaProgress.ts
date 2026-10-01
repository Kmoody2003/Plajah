/**
 * Voca progression — pure rules (tested) + persistence + Learner Ledger write.
 *
 * Advancement is built on instructional-level research (Betts; Gickling & Armstrong; Treptow et al.):
 *   mastery      ≥ 98% first-try accuracy
 *   learning zone 93–97%   ← where most growth happens
 *   frustration  < 90%
 * A reader moves UP after 2 mastery sessions or 3 learning-zone sessions at the level — and only when they
 * also answered the comprehension check (understanding is part of reading) and, from grade 1 on, reached at
 * least 60% of the level's fluency target. Two frustration sessions in a row step DOWN one level so practice
 * stays in the zone. Noisy sessions (the room drowned the reader out) never count against anyone.
 * Missed and coached words return in a Leitner spaced-review queue (1 · 3 · 7 · 14 days).
 */
import { MAX_LEVEL, levelInfo, passagesForLevel, type VocaPassage } from '../../data/vocaPassages';

export interface VocaSession {
  passageId: string; level: number; accuracy: number; wcpm: number; comebacks: number; words: number;
  understood: boolean | null; noisy: boolean; at: number; seconds: number;
}
export interface ReviewItem { box: number; due: number }
export interface VocaProgress {
  level: number;
  sessions: VocaSession[];
  completed: Record<string, { stars: number; bestAccuracy: number; bestWcpm: number }>;
  review: Record<string, ReviewItem>;
  streak: { count: number; lastDay: string };
  totals: { sessions: number; words: number; comebacks: number };
  updatedAt: number;
}
export type LevelChange = { change: 'up' | 'down' | 'stay'; reason: string };

export const ZONE = { mastery: 0.98, learning: 0.93, frustration: 0.9 } as const;
const DAY = 86_400_000;
const BOX_DAYS = [0, 1, 3, 7, 14];

export function defaultProgress(level = 1): VocaProgress {
  return { level, sessions: [], completed: {}, review: {}, streak: { count: 0, lastDay: '' }, totals: { sessions: 0, words: 0, comebacks: 0 }, updatedAt: Date.now() };
}

/** Starting level from age or grade (a teacher/parent can override). */
export function startLevelFor(profile: any): number {
  const by = Number(profile?.birthYear);
  if (by > 1900) {
    const age = new Date().getFullYear() - by;
    if (age <= 4) return 1; if (age === 5) return 2; if (age === 6) return 3; if (age === 7) return 5;
    if (age === 8) return 6; if (age === 9) return 7; if (age === 10) return 8; if (age <= 13) return 9; return 10;
  }
  return profile?.accountType === 'CHILD' ? 3 : 4;
}

export function starsFor(s: Pick<VocaSession, 'accuracy' | 'understood'>): number {
  if (s.accuracy >= ZONE.mastery && s.understood !== false) return 3;
  if (s.accuracy >= ZONE.learning) return 2;
  return 1;
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function applySession(prev: VocaProgress, s: VocaSession, reached: { practice: string[]; comebacks: string[] }): { progress: VocaProgress; level: LevelChange } {
  const p: VocaProgress = JSON.parse(JSON.stringify(prev));
  p.sessions = [...p.sessions, s].slice(-60);
  p.totals.sessions++; p.totals.words += s.words; p.totals.comebacks += s.comebacks;
  const c = p.completed[s.passageId] ?? { stars: 0, bestAccuracy: 0, bestWcpm: 0 };
  p.completed[s.passageId] = { stars: Math.max(c.stars, starsFor(s)), bestAccuracy: Math.max(c.bestAccuracy, s.accuracy), bestWcpm: Math.max(c.bestWcpm, s.wcpm) };
  // streak (consecutive days)
  const today = dayKey(s.at), yesterday = dayKey(s.at - DAY);
  p.streak = p.streak.lastDay === today ? p.streak : { count: p.streak.lastDay === yesterday ? p.streak.count + 1 : 1, lastDay: today };
  // spaced review: practice words go to box 1 (due now-ish); comebacks are half-learned (box 2)
  for (const w of reached.practice) p.review[w] = { box: 1, due: s.at + BOX_DAYS[1] * DAY };
  for (const w of reached.comebacks) p.review[w] = { box: 2, due: s.at + BOX_DAYS[2] * DAY };
  const level = decideLevel(p, s);
  if (level.change === 'up') p.level = Math.min(MAX_LEVEL, p.level + 1);
  if (level.change === 'down') p.level = Math.max(1, p.level - 1);
  p.updatedAt = s.at;
  return { progress: p, level };
}

export function decideLevel(p: VocaProgress, s: VocaSession): LevelChange {
  if (s.noisy) return { change: 'stay', reason: 'It was noisy, so this read only counts for effort.' };
  const atLevel = p.sessions.filter(x => x.level === p.level && !x.noisy);
  const last = (n: number) => atLevel.slice(-n);
  const info = levelInfo(p.level);
  const fluentEnough = (x: VocaSession) => info.targetWcpm == null || x.wcpm >= info.targetWcpm * 0.6;
  const understood = (x: VocaSession) => x.understood !== false;
  if (p.level < MAX_LEVEL) {
    const m2 = last(2); if (m2.length === 2 && m2.every(x => x.accuracy >= ZONE.mastery && understood(x) && fluentEnough(x)))
      return { change: 'up', reason: 'Two near-perfect reads in a row. Time for a new challenge!' };
    const z3 = last(3); if (z3.length === 3 && z3.every(x => x.accuracy >= ZONE.learning && understood(x) && fluentEnough(x)))
      return { change: 'up', reason: 'Three strong reads at this level. You leveled up!' };
  }
  const f2 = last(2); if (p.level > 1 && f2.length === 2 && f2.every(x => x.accuracy < ZONE.frustration))
    return { change: 'down', reason: 'Let\'s practice on slightly easier stories for a bit. That\'s how reading muscles grow.' };
  if (s.accuracy >= ZONE.learning && !understood(s)) return { change: 'stay', reason: 'Great reading! Next time, think about what the story means as you read.' };
  if (s.accuracy >= ZONE.learning && !fluentEnough(s)) return { change: 'stay', reason: 'Very accurate! Reading it again will make it smoother and faster.' };
  if (s.accuracy >= ZONE.mastery) return { change: 'stay', reason: 'Near-perfect! One more read like that and you level up.' };
  return { change: 'stay', reason: s.accuracy >= ZONE.learning ? 'Right in the learning zone. Keep going!' : 'Every try makes the words easier. Let\'s keep practicing.' };
}

/** Words due for a quick warm-up before the next read. */
export function dueReview(p: VocaProgress, now = Date.now(), max = 5): string[] {
  return Object.entries(p.review).filter(([, r]) => r.due <= now).sort((a, b) => a[1].box - b[1].box).slice(0, max).map(([w]) => w);
}
/** A reviewed word read correctly moves up a box; a miss goes back to box 1. */
export function reviewResult(p: VocaProgress, word: string, correct: boolean, now = Date.now()): VocaProgress {
  const q = { ...p, review: { ...p.review } };
  const r = q.review[word] ?? { box: 1, due: now };
  const box = correct ? r.box + 1 : 1;
  if (box >= BOX_DAYS.length) delete q.review[word]; else q.review[word] = { box, due: now + BOX_DAYS[box] * DAY };
  return q;
}

/** Next passage at the reader's level: unread first, then lowest stars, then oldest. */
export function nextPassage(p: VocaProgress, level = p.level): VocaPassage {
  const list = passagesForLevel(level);
  const scored = list.map(x => ({ x, stars: p.completed[x.id]?.stars ?? -1, last: Math.max(0, ...p.sessions.filter(s => s.passageId === x.id).map(s => s.at)) }));
  scored.sort((a, b) => a.stars - b.stars || a.last - b.last);
  return scored[0]?.x ?? list[0];
}

/** Ledger mastery for the level's fluency standard: EWMA of accuracy-weighted reads (0..100). */
export function masteryAfter(before: number, s: VocaSession): number {
  const score = Math.round(100 * Math.min(1, s.accuracy) * (s.understood === false ? 0.85 : 1));
  return Math.round(before * 0.6 + score * 0.4);
}

// ------------------------------------------------------------------ persistence (browser)
const KEY = (uid?: string | null) => `voca_progress_v1:${uid || 'guest'}`;
export function loadLocal(uid?: string | null): VocaProgress | null {
  try { const raw = localStorage.getItem(KEY(uid)); return raw ? JSON.parse(raw) as VocaProgress : null; } catch { return null; }
}
export function saveLocal(p: VocaProgress, uid?: string | null) {
  try { localStorage.setItem(KEY(uid), JSON.stringify(p)); } catch { /* storage full / private mode — progress stays in memory */ }
}
