import type { AtlasDataset } from '../../../../services/machineAtlas/types';
import { HYDRAULIC_PARTS } from './parts-hydraulics';
import { DISC_PARTS } from './parts-disc';
import { ABS_PARTS } from './parts-abs';
import { DRUM_PARTS } from './parts-drum';
import { FLUID_PARTS } from './parts-fluids';
import { BRAKES_SYSTEM, BRAKE_FAULTS } from './system';
import { BRAKES_LAYOUT } from './layout';

export const BRAKES_PARTS = [...HYDRAULIC_PARTS, ...DISC_PARTS, ...ABS_PARTS, ...DRUM_PARTS, ...FLUID_PARTS];
export const BRAKES_DATASET: AtlasDataset = { classId: 'car', systems: [BRAKES_SYSTEM], parts: BRAKES_PARTS, faults: BRAKE_FAULTS };
export { BRAKES_LAYOUT, BRAKES_SYSTEM, BRAKE_FAULTS };
export { FAULT_GEOMETRY, PARKING_BRAKE_STEPS } from './system';

/** Canonical part ids shared with the curriculum. */
export const CANONICAL_BRAKE_PART_IDS = [
  'brake_pedal', 'pushrod', 'brake_booster', 'master_cylinder', 'fluid_reservoir', 'brake_line', 'flex_hose', 'proportioning_valve', 'abs_hcu', 'abs_ecu',
  'wheel_speed_sensor', 'tone_ring', 'caliper', 'caliper_piston', 'piston_seal', 'caliper_bracket', 'slide_pins', 'brake_pads', 'pad_wear_indicator', 'rotor',
  'hub', 'drum', 'wheel_cylinder', 'brake_shoes', 'return_springs', 'shoe_adjuster', 'parking_brake_cable', 'brake_light_switch', 'bleeder_screw', 'brake_fluid',
];
