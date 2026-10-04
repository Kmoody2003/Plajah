/** Helpers shared by the Machine Atlas courses (atlas-brakes-*). */
import type { LessonAnchor } from '../../services/schoolChassis';

/** Machine Atlas part ids that the 3D viewer shares. A typo here fails the part-id check in validateAtlasCourses. */
export const ATLAS_BRAKE_PARTS = [
  'brake_pedal', 'pushrod', 'brake_booster', 'master_cylinder', 'fluid_reservoir', 'brake_line', 'flex_hose', 'proportioning_valve',
  'abs_hcu', 'abs_ecu', 'wheel_speed_sensor', 'tone_ring', 'caliper', 'caliper_piston', 'piston_seal', 'caliper_bracket', 'slide_pins',
  'brake_pads', 'pad_wear_indicator', 'rotor', 'hub', 'drum', 'wheel_cylinder', 'brake_shoes', 'return_springs', 'shoe_adjuster',
  'parking_brake_cable', 'brake_light_switch', 'bleeder_screw', 'brake_fluid',
] as const;
export const ATLAS_BRAKE_SCENARIOS = ['apply', 'heat', 'abs', 'fault-worn-pads', 'fault-stuck-slide-pin', 'fault-air-in-lines', 'fault-vacuum-loss', 'fault-glazed', 'fault-warped-rotor', 'fault-fluid-boil', 'fault-wss', 'fault-drum-adjuster'] as const;

/** Anchor a lesson to Machine Atlas part ids (kind 'concept', ref = the exact part id). */
export const parts = (...ids: (typeof ATLAS_BRAKE_PARTS)[number][]): LessonAnchor[] => ids.map(ref => ({ kind: 'concept', ref, note: 'Machine Atlas part' }));
export type AtlasScenario = (typeof ATLAS_BRAKE_SCENARIOS)[number];
