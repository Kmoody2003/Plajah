import type { OwnedCar } from './build';
import type { Medal } from './parts';
import type { Home } from './sites';

export interface Stats {
  runs: number; laps: number; cleanRuns: number; rainRuns: number;
  distanceKm: number; topMph: number; driftPoints: number;
  deliveries: number; deliveryChainBest: number; deliveryEarnings: number; passengers: number; food: number; packages: number; deliveryShifts: number;
  creditsEarned: number; creditsSpent: number;
}

export interface LogEntry { t: number; text: string }

export interface GarageSave {
  v: 1;
  credits: number;
  xp: number;
  cars: OwnedCar[];
  activeUid: string | null;
  nextUid: number;
  starterClaimed: boolean;
  home: Home;                                 // where the player's garage stands: a city shop unit or a farm barn
  inventory: Record<string, number>;          // spare parts by id
  completed: string[];                        // finished objective ids (their rewards are paid)
  achievements: string[];
  medals: Record<string, Medal>;              // best medal per event id (circuits, delivery tiers)
  bestTimes: Record<string, number>;          // seconds, best per event id
  seenUnlocks: string[];                      // part and car ids the player has already been told about
  stats: Stats;
  log: LogEntry[];
  /** Chora Fest progression (src/garage/fest.ts); absent in saves from before it */
  fest?: import('./fest').FestSave;
}

export const emptyStats = (): Stats => ({
  runs: 0, laps: 0, cleanRuns: 0, rainRuns: 0, distanceKm: 0, topMph: 0, driftPoints: 0,
  deliveries: 0, deliveryChainBest: 0, deliveryEarnings: 0, passengers: 0, food: 0, packages: 0, deliveryShifts: 0, creditsEarned: 0, creditsSpent: 0,
});

export const emptySave = (): GarageSave => ({
  v: 1, credits: 5000, xp: 0, cars: [], activeUid: null, nextUid: 1, starterClaimed: false, home: 'city', inventory: {}, completed: [], achievements: [], medals: {}, bestTimes: {}, seenUnlocks: [], stats: emptyStats(), log: [],
});

/** level n needs this much XP in total */
export const xpToReach = (level: number): number => Math.round(300 * Math.pow(Math.max(0, level - 1), 1.7));
export const MAX_LEVEL = 50;
export function levelOf(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpToReach(l + 1)) l++;
  return l;
}
export const levelUpCredits = (level: number): number => 1000 + 250 * level;
