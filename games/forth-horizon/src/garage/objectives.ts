// Objectives and achievements. An objective is a counter with a target; when it fills the reward is paid on the spot (credits, XP, a part, or a whole car).
import { MEDALS, type Medal } from './parts';
import type { GarageSave } from './types';
import { levelOf } from './types';

export interface Reward { credits?: number; xp?: number; part?: string; car?: string }
export type StatKey =
  | 'runs' | 'laps' | 'cleanRuns' | 'rainRuns' | 'distanceKm' | 'topMph' | 'driftPoints' | 'deliveries' | 'deliveryChainBest' | 'deliveryEarnings' | 'passengers' | 'food' | 'packages'
  | 'golds' | 'silvers' | 'elohims' | 'eventsDone' | 'carsOwned' | 'upgrades' | 'level' | 'creditsEarned';

export interface Objective { id: string; title: string; desc: string; group: 'Racing' | 'Driving' | 'Delivery' | 'Garage' | 'Career'; stat: StatKey; target: number; reward: Reward }

export const EVENT_IDS = ['ironport_grand_circuit', 'great_lakes_cliff_raceway', 'pinewood_rally_stage'] as const;
export const EVENT_NAMES: Record<string, string> = {
  ironport_grand_circuit: 'Ironport Grand Circuit', great_lakes_cliff_raceway: 'Great Lakes Cliff Raceway', pinewood_rally_stage: 'Pinewood Rally Stage',
  delivery_rookie: 'Courier: Rookie shift', delivery_pro: 'Courier: Pro shift', delivery_legend: 'Courier: Legend shift',
};

const rank = (m: Medal | undefined): number => (m ? MEDALS.indexOf(m) + 1 : 0);
export const medalAtLeast = (have: Medal | undefined, need: Medal): boolean => rank(have) >= rank(need) && have !== undefined;

export function statValue(s: GarageSave, k: StatKey): number {
  const st = s.stats;
  const medals = Object.entries(s.medals).filter(([id]) => (EVENT_IDS as readonly string[]).includes(id)).map(([, m]) => m);
  switch (k) {
    case 'golds': return medals.filter((m) => rank(m) >= 3).length;
    case 'silvers': return medals.filter((m) => rank(m) >= 2).length;
    case 'elohims': return medals.filter((m) => rank(m) >= 4).length;
    case 'eventsDone': return medals.length;
    case 'carsOwned': return s.cars.length;
    case 'upgrades': return s.cars.reduce((n, c) => n + Object.values(c.parts).filter((id) => id && !id.endsWith('.0') && !id.endsWith('.0.ev')).length, 0);
    case 'level': return levelOf(s.xp);
    case 'creditsEarned': return st.creditsEarned;
    default: return st[k] as number;
  }
}

export const OBJECTIVES: Objective[] = [
  // racing
  { id: 'obj_first_event', title: 'Take the flag', desc: 'Finish any event with a medal.', group: 'Racing', stat: 'eventsDone', target: 1, reward: { credits: 2500, xp: 150 } },
  { id: 'obj_all_events', title: 'Three tracks, three medals', desc: 'Earn a medal on all three events.', group: 'Racing', stat: 'eventsDone', target: 3, reward: { credits: 8000, xp: 600, part: 'tires.2' } },
  { id: 'obj_gold_1', title: 'Win something', desc: 'Earn a gold medal.', group: 'Racing', stat: 'golds', target: 1, reward: { credits: 5000, xp: 400, part: 'suspension.2' } },
  { id: 'obj_gold_3', title: 'Clean sweep', desc: 'Gold on all three events.', group: 'Racing', stat: 'golds', target: 3, reward: { credits: 25000, xp: 1500, part: 'engine.3' } },
  { id: 'obj_elohim_1', title: 'Beyond the ideal line', desc: 'Earn an Elohim medal on any event.', group: 'Racing', stat: 'elohims', target: 1, reward: { credits: 40000, xp: 2500, part: 'ecu.3' } },
  { id: 'obj_laps_25', title: 'Regular', desc: 'Complete 25 laps.', group: 'Racing', stat: 'laps', target: 25, reward: { credits: 6000, xp: 500 } },
  { id: 'obj_laps_100', title: 'Lap machine', desc: 'Complete 100 laps.', group: 'Racing', stat: 'laps', target: 100, reward: { credits: 20000, xp: 2000, part: 'brakes.3' } },
  { id: 'obj_clean_5', title: 'Clean hands', desc: 'Finish 5 runs without touching a wall or a building.', group: 'Racing', stat: 'cleanRuns', target: 5, reward: { credits: 7000, xp: 600 } },
  { id: 'obj_rain_3', title: 'Rain man', desc: 'Finish 3 runs in the rain.', group: 'Racing', stat: 'rainRuns', target: 3, reward: { credits: 6000, xp: 500, part: 'tires.3.wet' } },
  // driving
  { id: 'obj_150_mph', title: '150 MPH Club', desc: 'Reach 150 mph.', group: 'Driving', stat: 'topMph', target: 150, reward: { credits: 8000, xp: 700 } },
  { id: 'obj_200_mph', title: 'Two hundred', desc: 'Reach 200 mph.', group: 'Driving', stat: 'topMph', target: 200, reward: { credits: 30000, xp: 2000 } },
  { id: 'obj_drift_10k', title: 'Sideways', desc: 'Score 10,000 drift points.', group: 'Driving', stat: 'driftPoints', target: 10000, reward: { credits: 5000, xp: 400 } },
  { id: 'obj_drift_50k', title: 'Tyre killer', desc: 'Score 50,000 drift points.', group: 'Driving', stat: 'driftPoints', target: 50000, reward: { credits: 18000, xp: 1500 } },
  { id: 'obj_dist_100', title: 'Road tripper', desc: 'Drive 100 km.', group: 'Driving', stat: 'distanceKm', target: 100, reward: { credits: 10000, xp: 800 } },
  { id: 'obj_dist_300', title: 'Odometer', desc: 'Drive 300 km.', group: 'Driving', stat: 'distanceKm', target: 300, reward: { credits: 25000, xp: 2000 } },
  // delivery
  { id: 'obj_deliv_1', title: 'First drop', desc: 'Complete a delivery.', group: 'Delivery', stat: 'deliveries', target: 1, reward: { credits: 1500, xp: 120 } },
  { id: 'obj_deliv_25', title: 'On the clock', desc: 'Complete 25 deliveries.', group: 'Delivery', stat: 'deliveries', target: 25, reward: { credits: 9000, xp: 700 } },
  { id: 'obj_deliv_100', title: 'Courier of the year', desc: 'Complete 100 deliveries.', group: 'Delivery', stat: 'deliveries', target: 100, reward: { credits: 30000, xp: 2500, part: 'weight.3' } },
  { id: 'obj_deliv_chain_4', title: 'Hot streak', desc: 'Beat the clock on 4 deliveries in a row.', group: 'Delivery', stat: 'deliveryChainBest', target: 4, reward: { credits: 6000, xp: 500 } },
  { id: 'obj_deliv_chain_8', title: 'Unstoppable', desc: 'Beat the clock on 8 deliveries in a row.', group: 'Delivery', stat: 'deliveryChainBest', target: 8, reward: { credits: 20000, xp: 1800 } },
  { id: 'obj_pax_20', title: 'Five-star driver', desc: 'Deliver 20 passengers.', group: 'Delivery', stat: 'passengers', target: 20, reward: { credits: 8000, xp: 600 } },
  { id: 'obj_food_20', title: 'Hot and fast', desc: 'Deliver 20 food orders.', group: 'Delivery', stat: 'food', target: 20, reward: { credits: 8000, xp: 600 } },
  { id: 'obj_pkg_20', title: 'Signed for', desc: 'Deliver 20 packages.', group: 'Delivery', stat: 'packages', target: 20, reward: { credits: 8000, xp: 600 } },
  { id: 'obj_deliv_earn_50k', title: 'Tips are good', desc: 'Earn 50,000 credits from deliveries.', group: 'Delivery', stat: 'deliveryEarnings', target: 50000, reward: { credits: 15000, xp: 1200 } },
  // garage
  { id: 'obj_own_3', title: 'Three in the garage', desc: 'Own 3 cars.', group: 'Garage', stat: 'carsOwned', target: 3, reward: { credits: 5000, xp: 400 } },
  { id: 'obj_own_5', title: 'Collector', desc: 'Own 5 cars.', group: 'Garage', stat: 'carsOwned', target: 5, reward: { credits: 15000, xp: 1200 } },
  { id: 'obj_upg_5', title: 'Wrenching', desc: 'Fit 5 upgrades.', group: 'Garage', stat: 'upgrades', target: 5, reward: { credits: 4000, xp: 300 } },
  { id: 'obj_upg_20', title: 'Full build', desc: 'Fit 20 upgrades across your cars.', group: 'Garage', stat: 'upgrades', target: 20, reward: { credits: 20000, xp: 1500 } },
  // career
  { id: 'obj_level_10', title: 'Veteran', desc: 'Reach level 10.', group: 'Career', stat: 'level', target: 10, reward: { credits: 20000, xp: 0 } },
  { id: 'obj_level_25', title: 'Legend of the lakes', desc: 'Reach level 25.', group: 'Career', stat: 'level', target: 25, reward: { credits: 100000, xp: 0 } },
  { id: 'obj_earn_250k', title: 'Self-made', desc: 'Earn 250,000 credits in total.', group: 'Career', stat: 'creditsEarned', target: 250000, reward: { credits: 25000, xp: 2000 } },
];
export const OBJECTIVE_BY_ID: Record<string, Objective> = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));

export function objectiveProgress(s: GarageSave, o: Objective): { value: number; done: boolean; frac: number } {
  const value = statValue(s, o.stat);
  return { value, done: s.completed.includes(o.id), frac: Math.min(1, value / o.target) };
}

/** achievements the platform shows; the first four ids are the ones the Plajah Games bridge already knows */
export interface AchievementDef { id: string; title: string; test: (s: GarageSave) => boolean }
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'forth_first_lap', title: 'Ironport Circuit: First Lap', test: (s) => s.stats.laps >= 1 },
  { id: 'forth_race_win', title: 'King of the Great Lakes', test: (s) => statValue(s, 'golds') >= 1 },
  { id: 'forth_150_mph', title: '150 MPH Club', test: (s) => s.stats.topMph >= 150 },
  { id: 'forth_coastal_explorer', title: 'West Coast Explorer', test: (s) => !!s.medals.great_lakes_cliff_raceway || !!s.medals.pinewood_rally_stage },
  { id: 'forth_first_delivery', title: 'First Drop', test: (s) => s.stats.deliveries >= 1 },
  { id: 'forth_courier_streak', title: 'Hot Streak', test: (s) => s.stats.deliveryChainBest >= 5 },
  { id: 'forth_full_garage', title: 'Collector', test: (s) => s.cars.length >= 5 },
];
