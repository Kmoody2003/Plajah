/**
 * Kenne's hero shots (D:\plajah game assets deign from promtps\racer\industrial districts and ...\civic riverfront): every shot is a real place in the game
 * with a camera spot (docs/apex-elohim/east-bank-masterplan.md). A spot is written against what it shows, not fixed coordinates, so it follows the
 * world: a point on a circuit's built line (near a map point, `ahead` samples on, the camera `h` up, looking `look` samples on), or a landmark the civic
 * riverfront placed (its position, the camera `back` metres toward the river and `h` up).
 * The civic race shots ride the Civic Riverfront Street Circuit (tools/plan_civic_circuit.py): the riverwalk leg, the boulevard leg, its chicanes and hairpins.
 */
export type HeroSpot =
  | { course: string; near: [number, number]; ahead: number; h: number; look: number }
  | { landmark: string; back: number; h: number; side?: number };
export interface HeroScene { id: string; files: string[]; what: string; spot: HeroSpot }

const IW = 'ironworks_industrial_circuit', HB = 'harbor_district_circuit', CV = 'civic_riverfront_circuit';
/** where the circuits' features are (their plan files): the Ironworks bridge and underpass crossings, a point on each sector */
export const HERO_SCENES: HeroScene[] = [
  // ---- industrial districts: the new Ironworks ----
  { id: 'iw-finish', files: ['Race_cars_crossing_finish_line_aedfedc7', 'Race_cars_crossing_finish_line_efec2096'], what: 'the start/finish straight through the warehouse district', spot: { course: IW, near: [3261.2, -181.0], ahead: 12, h: 1.4, look: 12 } },
  { id: 'iw-straight', files: ['Race_cars_driving_down_straightaway_655987f4', 'Race_cars_driving_down_straightaway_96e8eab0'], what: 'down the start straight', spot: { course: IW, near: [3261.2, -181.0], ahead: 30, h: 1.6, look: 20 } },
  { id: 'iw-bridge', files: ['Race_cars_crossing_bridge_ccbaadbb', 'Race_cars_crossing_bridge_fb13ecf1'], what: 'the bridge over the freight yard', spot: { course: IW, near: [3379.8, 718.5], ahead: -6, h: 1.6, look: 10 } },
  { id: 'iw-underpass-in', files: ['Race_cars_entering_subterranean_…_25a3a507', 'Race_cars_enter_tunnel_9a71dbf9'], what: 'diving into the underpass under the Port Branch', spot: { course: IW, near: [3139.2, -190.2], ahead: -14, h: 1.4, look: 10 } },
  { id: 'iw-underpass-out', files: ['Race_cars_exiting_underpass_baed9655', 'Race_cars_exiting_underpass_db6f9225'], what: 'out of the underpass', spot: { course: IW, near: [3139.2, -190.2], ahead: 4, h: 1.4, look: 10 } },
  { id: 'iw-refinery', files: ['Race_cars_speeding_through_refinery_58fd323f', 'Race_cars_speeding_through_refinery_84e77aa6'], what: 'through the refinery sweepers', spot: { course: IW, near: [3361.0, 893.0], ahead: 0, h: 1.6, look: 10 } },
  { id: 'iw-silos', files: ['Race_car_drifting_past_silos_d70a835f', 'Race_car_drifting_past_silos_f5255c88'], what: 'past the bulk warehouses and their silos in the esses', spot: { course: IW, near: [3607.3, 335.4], ahead: 0, h: 1.4, look: 8 } },
  { id: 'iw-warehouse', files: ['Race_car_bursting_through_warehouse_54ae63a5', 'Race_car_bursting_through_warehouse_85980d18'], what: 'between the logistics centres', spot: { course: IW, near: [3812.1, 202.3], ahead: 0, h: 1.4, look: 8 } },
  { id: 'iw-harbour', files: ['Race_cars_driving_at_harbor_86ef54cc', 'Race_car_harbor_side-by-side_battle_eded523f', 'Race_cars_battling_along_harbor_ef3156a0'], what: 'the container terminal straight on the river quay', spot: { course: IW, near: [4150.9, 928.5], ahead: -10, h: 1.6, look: 12 } },
  // ---- industrial districts: the Harbor District Street Circuit ----
  { id: 'hb-cranes', files: ['Race_cars_speeding_past_cranes_b1cec5dc', 'Race_cars_speeding_past_cranes_c4dd6aa2'], what: 'along the pier past the quay cranes', spot: { course: HB, near: [7337.7, -3716.0], ahead: 0, h: 1.6, look: 12 } },
  { id: 'hb-containers', files: ['Race_cars_navigating_shipping_co…_67169dd5', 'Race_cars_drifting_in_canyon_abd564e9', 'Race_cars_drifting_through_canyon_841e8a69'], what: 'the canyon between the container stacks', spot: { course: HB, near: [6948.9, -2661.3], ahead: 0, h: 1.4, look: 8 } },
  // ---- civic riverfront: scenery (the landmarks the riverfront placed) ----
  { id: 'cv-opera', files: ['Grand_opera_house_illuminated_c2b4f87a', 'Grand_opera_house_illuminated_e1efdc86'], what: 'the opera hall from the river', spot: { landmark: 'opera hall', back: 170, h: 22 } },
  { id: 'cv-marina', files: ['Yachts_moored_at_marina_915315cb', 'Yachts_moored_in_marina_7710eabf'], what: 'the marina and its yachts', spot: { landmark: 'marina', back: 90, h: 12 } },
  { id: 'cv-museum', files: ['Glass_art_museum_near_waterfront_555ab988', 'Glass_art_museum_on_waterfront_a5671325'], what: 'the glass museum pavilions on the waterfront', spot: { landmark: 'glass museum', back: 170, h: 18 } },
  { id: 'cv-fountain', files: ['Water_fountain_in_plaza_001609f9', 'Water_fountain_in_plaza_78bf0837'], what: 'the plaza fountain', spot: { landmark: 'plaza fountain', back: 22, h: 3 } },
  { id: 'cv-amphitheatre', files: ['Music_festival_amphitheater_by_r…_b097071e', 'Empty_music_festival_amphitheate…_355dd5bb'], what: 'the amphitheatre and its stage', spot: { landmark: 'amphitheatre', back: 90, h: 24 } },
  { id: 'cv-beach', files: ['City_beach_along_riverfront_ff9cd048', 'Urban_riverfront_beach_with_arch…_fe7ecdb4'], what: 'the urban beach and its pier', spot: { landmark: 'beach', back: 120, h: 10 } },
  { id: 'cv-promenade', files: ['Mediterranean_stone_promenade_wi…_0f8f4e63', 'Mediterranean_stone_promenade_wi…_ce168d0c', 'Pedestrians_strolling_along_rive…_1e287ecc', 'Pedestrians_strolling_along_rive…_e3ea4c06', 'Riverfront_promenade_at_twilight_b2cce28b', 'City_lights_along_riverfront_pro…_a2eaeb77', 'Riverfront_at_dawn_with_fog_21a48551', 'Riverfront_at_dawn_with_fog_cf0942b3'], what: 'along the stone promenade and its palms', spot: { landmark: 'museum of science and art', back: 70, h: 2, side: 80 } },
  { id: 'cv-park', files: ['People_relaxing_in_park_6d90e3a5', 'People_relaxing_in_park_ee0b5434', 'Palm_boulevard_near_flower_plaza_b2a75b13', 'Palm_boulevard_near_terraced_plazas_45495582'], what: 'the civic parklands: monument, flower beds, fountains', spot: { landmark: 'civic monument', back: 50, h: 4, side: 30 } },
  // ---- civic riverfront: racing on the Civic Riverfront Street Circuit ----
  { id: 'cv-race-finish', files: ['Race_cars_crossing_finish_line_c2582c1a', 'Race_cars_crossing_finish_line_cc8647c2'], what: 'the start/finish on the riverwalk', spot: { course: CV, near: [6010.5, -1823.3], ahead: 8, h: 1.4, look: 12 } },
  { id: 'cv-race-riverwalk', files: ['Race_cars_battling_along_riverwalk_54206bbb', 'Race_cars_battling_along_riverwalk_908cf775', 'Race_cars_driving_down_promenade_acea01fd', 'Race_cars_speeding_along_promenade_4981ffec', 'Race_cars_speeding_on_promenade_692f9f55', 'Race_cars_driving_fast_803bc67e'], what: 'down the riverwalk beside the promenade and its palms', spot: { course: CV, near: [5690, -1000], ahead: 0, h: 1.4, look: 14 } },
  { id: 'cv-race-museum', files: ['Race_cars_speeding_past_museum_695db399', 'Race_cars_speeding_past_museum_6ea3af5a'], what: 'past the museum quarter', spot: { course: CV, near: [5992, -1447], ahead: -4, h: 1.5, look: 10 } },
  { id: 'cv-race-stage', files: ['Race_cars_drifting_near_stage_18a8413f', 'Race_cars_drifting_past_stage_25884bae'], what: 'past the festival stage and the amphitheatre', spot: { course: CV, near: [5454, -607], ahead: -4, h: 1.5, look: 10 } },
  { id: 'cv-race-chicane', files: ['Race_cars_navigating_chicane_248efe30', 'Race_cars_navigating_chicane_807e0619'], what: 'the boulevard chicane by the museum', spot: { course: CV, near: [6140, -1450], ahead: -8, h: 1.6, look: 10 } },
  { id: 'cv-race-boulevard', files: ['Race_cars_weaving_through_boulevard_19e1cb31', 'Race_cars_weaving_through_boulevard_c304d862', 'Race_cars_accelerating_along_bou…_8e056e25', 'Race_cars_accelerating_along_bou…_f4147d1b'], what: 'up the boulevard', spot: { course: CV, near: [5940, -1000], ahead: 0, h: 1.4, look: 14 } },
  { id: 'cv-race-park', files: ['Race_cars_passing_green_park_7d11538b', 'Race_cars_passing_park_06dee168'], what: 'round the parklands hairpin', spot: { course: CV, near: [5170, 130], ahead: -6, h: 1.6, look: 8 } },
  { id: 'cv-race-drift', files: ['Race_car_drifting_turn_47ba3425', 'Race_car_drifting_turn_f71bc363'], what: 'drifting the opera hairpin', spot: { course: CV, near: [6050, -1880], ahead: -6, h: 1.6, look: 8 } },

];
