/**
 * Master Clock — the production day, timed.
 * ------------------------------------------
 * One clock the whole shooting day runs against. Everything here is derived from
 * data the Film Hub already holds — the call sheet's scheduled times, each scene's
 * page count, the Daily Production Report's actuals, and the crew's day rates — so
 * "34 minutes behind · $2,180 lost" is computed, never invented.
 *
 * Two pure engines + a small Firestore-backed timer log:
 *   buildDayClock()          — scheduled vs. projected day, drift, meal/OT thresholds
 *   estimateLostTimeCost()   — the dollar cost of the drift (OT + meal penalties)
 *   timerEntries subcollection — role stopwatches (setup/take/relight/move) logged to the day
 */

import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { CallSheet, DailyProductionReport, ProductionMember, ProductionScene } from './filmProductionService';

// ─── Role timers ─────────────────────────────────────────────────────────────

export type TimerKind =
  | 'SETUP' | 'BLOCKING' | 'REHEARSAL' | 'SHOOT' | 'TAKE'
  | 'RESET' | 'RELIGHT' | 'COMPANY_MOVE' | 'TURNAROUND' | 'OTHER';

export const TIMER_KINDS: { kind: TimerKind; label: string }[] = [
  { kind: 'SETUP', label: 'Setup' }, { kind: 'BLOCKING', label: 'Blocking' }, { kind: 'REHEARSAL', label: 'Rehearsal' },
  { kind: 'SHOOT', label: 'Shoot' }, { kind: 'TAKE', label: 'Take' }, { kind: 'RESET', label: 'Reset' },
  { kind: 'RELIGHT', label: 'Relight' }, { kind: 'COMPANY_MOVE', label: 'Company move' }, { kind: 'TURNAROUND', label: 'Turnaround' },
  { kind: 'OTHER', label: 'Other' },
];

export interface TimerEntry {
  id: string;
  kind: TimerKind;
  shootDay?: number;
  sceneId?: string;
  sceneNum?: string;
  byMemberId?: string;
  byName?: string;
  byRole?: string;
  startedAt: number;         // ms
  endedAt?: number;          // ms — absent while running
  durationSec?: number;      // set on stop
  note?: string;
}

// ─── Day clock ───────────────────────────────────────────────────────────────

export interface DayClock {
  hasCall: boolean;
  date: string;
  generalCall: string;       // "07:00"
  callTs?: number;           // absolute ms of general call, when date is known
  nowMin: number;            // minutes since general call (>= 0)
  firstShotSchedMin: number;
  firstShotActualMin?: number;
  wrapSchedMin: number;      // scheduled wrap, minutes from call
  projectedWrapMin: number;  // now + remaining work + remaining meal
  driftMin: number;          // projectedWrap - scheduledWrap; + = behind
  remainingMin: number;      // estimated minutes of unshot scenes
  scenesRemaining: number;
  scenesDone: number;
  mealDueMin: number;        // 6h meal-penalty threshold from call
  minsToMeal: number;        // + = time left, - = past due
  mealTaken: boolean;
  mealPenalty: boolean;
  otThresholdMin: number;    // 12h from call
  otMin: number;             // projected minutes into overtime
  nowPct: number;            // 0..1 position of now across the scheduled day
}

const MEAL_PENALTY_MIN = 6 * 60;
const OT_THRESHOLD_MIN = 12 * 60;
const DEFAULT_DAY_MIN = 12 * 60;

/** Minutes from a "HH:MM" clock time to another, handling a wrap past midnight. */
export function hhmmToMinutes(hhmm?: string): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
/** Minutes from `call` to `time`, adding a day when `time` is earlier (a shoot wrapping past midnight). */
function minutesFromCall(call: string, time?: string): number | null {
  const c = hhmmToMinutes(call); const t = hhmmToMinutes(time);
  if (c == null || t == null) return null;
  let diff = t - c;
  if (diff < 0) diff += 1440;
  return diff;
}
const estSceneMinutes = (scene: ProductionScene) => Math.max(30, Math.round((scene.pages || 1) * 55));

export function buildDayClock(
  callSheet: CallSheet | null | undefined,
  dayScenes: ProductionScene[],
  dpr: DailyProductionReport | null | undefined,
  nowMs: number,
): DayClock {
  const generalCall = callSheet?.generalCall || '07:00';
  const date = callSheet?.date || '';
  const callTs = date ? Date.parse(`${date}T${generalCall}:00`) : undefined;
  const nowMin = callTs != null && !Number.isNaN(callTs) ? Math.max(0, Math.round((nowMs - callTs) / 60000)) : 0;

  const firstShotSchedMin = minutesFromCall(generalCall, callSheet?.shootingCall) ?? 30;
  const firstShotActualMin = dpr?.firstShotActual ? (minutesFromCall(generalCall, dpr.firstShotActual) ?? undefined) : undefined;
  const wrapSchedMin = minutesFromCall(generalCall, callSheet?.estWrap) ?? DEFAULT_DAY_MIN;

  // Which of the day's scenes are already in the can (DPR first, scene status as fallback).
  const doneByNum = new Map((dpr?.sceneRows || []).map(row => [row.sceneNum, row.status === 'COMPLETED']));
  const isDone = (scene: ProductionScene) => doneByNum.get(scene.sceneNum) ?? scene.status === 'SHOT';
  const remaining = dayScenes.filter(scene => scene.status !== 'OMIT' && !isDone(scene));
  const scenesDone = dayScenes.filter(scene => scene.status !== 'OMIT' && isDone(scene)).length;
  const remainingMin = remaining.reduce((sum, scene) => sum + estSceneMinutes(scene), 0);

  const mealTaken = !!dpr?.lunchOut;
  const remainingMealMin = mealTaken || nowMin >= wrapSchedMin ? 0 : 60;
  const projectedWrapMin = nowMin + remainingMin + remainingMealMin;
  const driftMin = Math.round(projectedWrapMin - wrapSchedMin);

  const minsToMeal = MEAL_PENALTY_MIN - nowMin;
  const mealPenalty = !mealTaken && nowMin > MEAL_PENALTY_MIN;
  const otMin = Math.max(0, projectedWrapMin - OT_THRESHOLD_MIN);
  const nowPct = wrapSchedMin > 0 ? Math.max(0, Math.min(1, nowMin / wrapSchedMin)) : 0;

  return {
    hasCall: !!callSheet, date, generalCall, callTs: callTs != null && !Number.isNaN(callTs) ? callTs : undefined,
    nowMin, firstShotSchedMin, firstShotActualMin, wrapSchedMin, projectedWrapMin, driftMin,
    remainingMin, scenesRemaining: remaining.length, scenesDone,
    mealDueMin: MEAL_PENALTY_MIN, minsToMeal, mealTaken, mealPenalty,
    otThresholdMin: OT_THRESHOLD_MIN, otMin, nowPct,
  };
}

// ─── Cost of lost time ───────────────────────────────────────────────────────

export interface LostTimeCost {
  overtime: number;
  mealPenalty: number;
  overage: number;
  total: number;
  calledCount: number;
  blendedHourly: number;
}

const MEAL_PENALTY_PER_INTERVAL = 25; // $ per person per half-hour past the meal deadline

/** Parse a rate string ("$1,100/day", "$26/head", "flat") to an approximate hourly rate; null when not chargeable for OT. */
function parseHourlyRate(rate?: string): number | null {
  if (!rate) return null;
  const amount = parseFloat(rate.replace(/[^0-9.]/g, ''));
  if (!amount || Number.isNaN(amount)) return null;
  const r = rate.toLowerCase();
  if (/hr|hour/.test(r)) return amount;
  if (/wk|week/.test(r)) return amount / 50;   // ~50-hour week
  if (/day/.test(r)) return amount / 12;        // ~12-hour day
  return null;                                   // flat / head / unknown → not OT-chargeable
}

/** Estimate the dollar cost of the day's drift: projected overtime + meal-penalty exposure. */
export function estimateLostTimeCost(clock: DayClock, members: ProductionMember[], overage = 0): LostTimeCost {
  const active = members.filter(member => member.status === 'ACTIVE');
  const calledCount = active.length;
  const hourlies = active.map(member => parseHourlyRate(member.rate)).filter((value): value is number => value != null);
  const blendedHourly = hourlies.length ? hourlies.reduce((sum, value) => sum + value, 0) / hourlies.length : 0;

  const overtime = clock.otMin > 0 ? (clock.otMin / 60) * calledCount * blendedHourly * 1.5 : 0;
  const intervals = clock.mealPenalty ? Math.ceil((clock.nowMin - clock.mealDueMin) / 30) : 0;
  const mealPenalty = intervals * calledCount * MEAL_PENALTY_PER_INTERVAL;

  return {
    overtime: Math.round(overtime), mealPenalty: Math.round(mealPenalty), overage: Math.round(overage),
    total: Math.round(overtime + mealPenalty + overage), calledCount, blendedHourly: Math.round(blendedHourly),
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
export function fmtDriftLabel(driftMin: number): string {
  if (Math.abs(driftMin) < 5) return 'On schedule';
  const mins = Math.abs(driftMin);
  const span = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  return driftMin > 0 ? `${span} behind` : `${span} ahead`;
}

// ─── Firestore: the day's timer log ──────────────────────────────────────────

export function subTimerEntries(prodId: string, cb: (rows: TimerEntry[]) => void): () => void {
  try {
    return onSnapshot(collection(db, 'productions', prodId, 'timerEntries'),
      snap => cb(snap.docs.map(d => d.data() as TimerEntry)),
      () => { /* offline — leave last known */ });
  } catch { return () => {}; }
}
const strip = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? undefined : v)));
export async function putTimerEntry(prodId: string, entry: TimerEntry): Promise<void> {
  try { await setDoc(doc(db, 'productions', prodId, 'timerEntries', entry.id), strip(entry)); } catch { /* optimistic */ }
}
export async function stopTimerEntry(prodId: string, entry: TimerEntry, endedAt: number): Promise<void> {
  try { await updateDoc(doc(db, 'productions', prodId, 'timerEntries', entry.id), { endedAt, durationSec: Math.round((endedAt - entry.startedAt) / 1000) }); } catch {}
}
export async function removeTimerEntry(prodId: string, id: string): Promise<void> {
  try { await deleteDoc(doc(db, 'productions', prodId, 'timerEntries', id)); } catch {}
}

export function newTimerId() { return `tmr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
