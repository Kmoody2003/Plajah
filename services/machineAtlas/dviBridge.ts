// Maps Machine Atlas brake part ids to digital-vehicle-inspection (DVI) item ids in services/inspectionCore.ts
// (AUTO_DVI_TEMPLATE, 'auto_multipoint_v1'). Keys listed here are VERIFIED against the template by tests/machineAtlas.test.ts.
// Pure data: the viewer uses it to open the right 3D part from a failed DVI item (and the reverse).

export const ATLAS_PART_TO_INSPECTION_KEYS: Record<string, string[]> = {
  brake_pads: ['brk_front', 'brk_rear'],
  pad_wear_indicator: ['brk_front', 'brk_rear'],
  caliper: ['brk_front', 'brk_rear'],
  caliper_piston: ['brk_front', 'brk_rear'],
  piston_seal: ['brk_front', 'brk_rear'],
  slide_pins: ['brk_front', 'brk_rear'],
  caliper_bracket: ['brk_front', 'brk_rear'],
  brake_shoes: ['brk_rear'],
  wheel_cylinder: ['brk_rear'],
  return_springs: ['brk_rear'],
  shoe_adjuster: ['brk_rear'],
  rotor: ['brk_rotors'],
  drum: ['brk_rotors'],
  brake_fluid: ['brk_fluid'],
  master_cylinder: ['brk_fluid'],
  fluid_reservoir: ['brk_fluid'],
  bleeder_screw: ['brk_fluid'],
  brake_line: ['brk_lines'],
  flex_hose: ['brk_lines'],
  brake_light_switch: ['lt_brake'],
};

/** Atlas parts with NO item in the current template. Descriptive keys a future template revision could add (not yet in inspectionCore). */
export const ATLAS_PART_FUTURE_INSPECTION_KEYS: Record<string, string> = {
  brake_pedal: 'brk_pedal_feel', brake_booster: 'brk_booster', pushrod: 'brk_pedal_feel', proportioning_valve: 'brk_bias',
  abs_hcu: 'brk_abs_system', abs_ecu: 'brk_abs_system', wheel_speed_sensor: 'brk_abs_system', tone_ring: 'brk_abs_system',
  hub: 'whl_bearing', parking_brake_cable: 'brk_parking',
};

export const partsForInspectionKey = (key: string): string[] =>
  Object.entries(ATLAS_PART_TO_INSPECTION_KEYS).filter(([, ks]) => ks.includes(key)).map(([id]) => id);

/** Best single part to open in the viewer for a failed DVI item. */
export const PRIMARY_PART_FOR_KEY: Record<string, string> = {
  brk_front: 'brake_pads', brk_rear: 'brake_shoes', brk_rotors: 'rotor', brk_fluid: 'brake_fluid', brk_lines: 'flex_hose', lt_brake: 'brake_light_switch',
};

export const inspectionKeysForPart = (partId: string): string[] => ATLAS_PART_TO_INSPECTION_KEYS[partId] || [];
