// Brakes scene layout: views, placements (which part appears where), explode vectors and simulation visual bindings.
// Corner parts are authored in the disc/drum corner frame (axis +Z, outboard +Z), so corner placements are mostly identity.
import type { Placement, SystemLayout, V3, ViewDef, VisualBinding } from '../../../../services/machineAtlas/types';

const lineA = JSON.stringify([[-3.75, 0.4, 0.1], [-2.6, -0.4, 0.5], [-1.2, 0.4, 0.8], [0.0, 0.35, 0.8]]);
const lineFront = JSON.stringify([[0.4, 0.3, 0.7], [1.5, -1.0, 0.9], [4.2, -0.6, 0.6], [6.4, 0.9, 0.0]]);
const lineHcu = JSON.stringify([[3.3, 0.35, 0.1], [4.2, -0.2, 0.3], [5.5, 0.3, 0.2], [6.4, 0.9, 0.0]]);
const lineRear = JSON.stringify([[0.4, 0.3, 0.7], [2.0, -1.9, -1.8], [6.0, -1.9, -5.0], [7.9, 0.45, -7.15]]);
const hoseCirc = JSON.stringify([[6.4, 0.9, 0.0], [7.0, 1.7, -0.2], [7.85, 0.84, -0.28]]);
const hoseDisc = JSON.stringify([[-0.28, 1.5, -0.5], [-0.7, 2.1, -0.8], [-1.6, 2.2, -1.2]]);
const lineDisc = JSON.stringify([[-1.6, 2.2, -1.2], [-2.4, 2.1, -1.6], [-3.4, 1.4, -2.2]]);
const lineDrum = JSON.stringify([[0, 0.98, -0.5], [-0.6, 1.5, -0.9], [-1.5, 1.8, -1.4], [-2.6, 1.4, -2.0]]);
const cableCirc = JSON.stringify([[-9.6, -0.5, 0.4], [-5, -2.3, -1], [2, -2.5, -4.2], [7.7, -0.3, -7.2]]);
const cableDrum = JSON.stringify([[0.0, -0.8, -0.5], [0.4, -1.4, -0.9], [1.2, -1.8, -1.8], [2.2, -2.0, -2.6]]);

const DISC_PARTS = ['rotor', 'hub', 'caliper', 'caliper_piston', 'piston_seal', 'caliper_bracket', 'slide_pins', 'brake_pads', 'pad_wear_indicator', 'tone_ring', 'wheel_speed_sensor', 'bleeder_screw'];
const DRUM_PARTS = ['drum', 'brake_shoes', 'wheel_cylinder', 'return_springs', 'shoe_adjuster'];

const corner = (parts: string[], views: string[], pos: V3, scale: number, extra: Partial<Placement> = {}): Placement[] =>
  parts.map(part => ({ part, views, pos, scale, ...extra }));

const placements: Placement[] = [
  // ---- disc corner close-up ----
  ...corner(DISC_PARTS, ['disc'], [0, 0, 0], 1),
  { part: 'flex_hose', views: ['disc'], params: { pts: hoseDisc, r: 0.07 } },
  { part: 'brake_line', views: ['disc'], params: { pts: lineDisc, r: 0.045 } },
  // ---- drum corner close-up ----
  ...corner(DRUM_PARTS, ['drum'], [0, 0, 0], 1),
  { part: 'brake_line', views: ['drum'], params: { pts: lineDrum, r: 0.045 } },
  { part: 'parking_brake_cable', views: ['drum'], params: { pts: cableDrum } },
  // ---- compare: disc left, drum right ----
  ...corner(DISC_PARTS.filter(p => !['bleeder_screw', 'wheel_speed_sensor', 'tone_ring', 'pad_wear_indicator', 'piston_seal'].includes(p)), ['compare'], [-3.1, 0, 0], 0.8),
  ...corner(DRUM_PARTS, ['compare'], [3.1, 0, 0], 0.8),
  { part: 'parking_brake_cable', views: ['compare'], pos: [3.1, 0, 0], scale: 0.8, params: { pts: cableDrum } },
  // ---- full circuit ----
  { part: 'brake_pedal', views: ['circuit'], pos: [-10, 0.6, 0] },
  { part: 'brake_light_switch', views: ['circuit'], pos: [-9.6, 1.9, 0.35] },
  { part: 'pushrod', views: ['circuit'], pos: [-8.7, 0.6, 0] },
  { part: 'brake_booster', views: ['circuit'], pos: [-6.6, 0.6, 0], rot: [0, Math.PI / 2, 0] },
  { part: 'master_cylinder', views: ['circuit'], pos: [-5.0, 0.6, 0], rot: [0, Math.PI / 2, 0] },
  { part: 'fluid_reservoir', views: ['circuit'], pos: [-4.5, 1.65, 0], rot: [0, Math.PI / 2, 0] },
  { part: 'brake_fluid', views: ['circuit'], pos: [-2.6, 2.2, 1.1] },
  { part: 'brake_line', views: ['circuit'], params: { pts: lineA, r: 0.05 } },
  { part: 'proportioning_valve', views: ['circuit'], pos: [0.4, 0.3, 0.8] },
  { part: 'abs_hcu', views: ['circuit'], pos: [2.4, 0.5, 0] },
  { part: 'abs_ecu', views: ['circuit'], pos: [2.4, 1.3, 0] },
  { part: 'brake_line', views: ['circuit'], params: { pts: lineHcu, r: 0.05 } },
  { part: 'brake_line', views: ['circuit'], params: { pts: lineRear, r: 0.05 } },
  { part: 'flex_hose', views: ['circuit'], params: { pts: hoseCirc, r: 0.07 } },
  { part: 'parking_brake_cable', views: ['circuit'], params: { pts: cableCirc } },
  ...corner(DISC_PARTS.filter(p => !['pad_wear_indicator', 'piston_seal', 'bleeder_screw'].includes(p)), ['circuit'], [8, 0, 0], 0.55),
  ...corner(DRUM_PARTS, ['circuit'], [8, 0, -7], 0.55),
];

// The drum is selectable but drawn translucent so the shoes inside stay visible.
const finalPlacements = placements.map(p => (p.part === 'drum' ? { ...p, opacity: p.views.includes('circuit') ? 0.4 : 0.3 } : p));

const views: ViewDef[] = [
  { id: 'circuit', label: 'Whole system', description: 'Pedal to wheels: the force and fluid path.', camera: { pos: [-1, 9, 31], target: [-1, 0, -3] } },
  { id: 'disc', label: 'Disc brake', description: 'Front disc corner: rotor, caliper, pads.', camera: { pos: [3.6, 3.2, 5.4], target: [0, 0.5, 0] } },
  { id: 'drum', label: 'Drum brake', description: 'Rear drum corner. The drum is shown translucent.', camera: { pos: [3.2, 2.4, 5.6], target: [0, 0, -0.2] } },
  { id: 'compare', label: 'Disc vs drum', description: 'The same job done two ways.', camera: { pos: [0, 3.5, 9.5], target: [0, 0.3, 0] } },
];

// Explode vectors at explode = 1 (world units, before the placement scale is applied).
const explode: Record<string, V3> = {
  rotor: [0, 0, 1.4], hub: [0, 0, -0.5], caliper: [0, 1.5, -0.3], caliper_piston: [0, 0.7, -1.0], piston_seal: [0, 0.5, -1.4],
  caliper_bracket: [0, 0.4, -1.5], slide_pins: [0, 0.2, -1.8], brake_pads: [0, 0.9, 0.6], pad_wear_indicator: [0.6, 0.7, -0.2],
  tone_ring: [0, 0, -1.5], wheel_speed_sensor: [0.9, 0, -0.9], bleeder_screw: [0, 1.0, 0],
  drum: [0, 0, 1.6], brake_shoes: [0, 0, 0.5], wheel_cylinder: [0, 0.8, 0], return_springs: [0, 0, -0.6], shoe_adjuster: [0, -0.7, 0.3],
  parking_brake_cable: [0.5, -0.6, -0.5],
  brake_pedal: [-1.5, 0, 0], pushrod: [-0.8, 0.6, 0], brake_booster: [0, 0.2, 0], master_cylinder: [0.8, 0.4, 0], fluid_reservoir: [0, 1.0, 0],
  brake_fluid: [0, 1.0, 0], proportioning_valve: [0, 0.8, 0.5], abs_hcu: [0.4, 0, 0], abs_ecu: [0, 1.2, 0], brake_light_switch: [0, 0.8, 0.5],
  brake_line: [0, 0, 0.6], flex_hose: [0, 0.6, 0.4],
};

const T = (part: string, channel: string, lo: number, hi: number): VisualBinding => ({ part, channel, kind: 'heat', lo, hi });
const Pr = (part: string, channel: string, lo: number, hi: number): VisualBinding => ({ part, channel, kind: 'pressure', lo, hi });
const visuals: Record<string, VisualBinding[]> = {
  apply: [
    ...['master_cylinder', 'brake_line', 'flex_hose', 'proportioning_valve', 'abs_hcu', 'caliper', 'wheel_cylinder'].map(p => Pr(p, 'p_line', 0, 90)),
    { part: 'brake_pedal', channel: 'pedal_travel', kind: 'state', lo: 0, hi: 130 },
    { part: 'brake_pads', channel: 'clamp', kind: 'glow', lo: 0, hi: 22 },
    { part: 'rotor', channel: 'torque', kind: 'glow', lo: 0, hi: 1000 },
  ],
  heat: [
    T('rotor', 'T_rotor', 25, 700), T('brake_pads', 'T_pad', 25, 650), T('caliper', 'T_caliper', 25, 260), T('caliper_piston', 'T_caliper', 25, 260),
    T('brake_line', 'T_fluid', 25, 230), T('flex_hose', 'T_fluid', 25, 230), T('brake_fluid', 'T_fluid', 25, 230), T('drum', 'T_rotor', 25, 700),
    { part: 'rotor', channel: 'speed', kind: 'spin', lo: 0, hi: 34 },
  ],
  abs: [
    { part: 'rotor', channel: 'wheel', kind: 'spin', lo: 0, hi: 26 },
    { part: 'tone_ring', channel: 'wheel', kind: 'spin', lo: 0, hi: 26 },
    { part: 'hub', channel: 'wheel', kind: 'spin', lo: 0, hi: 26 },
    { part: 'abs_hcu', channel: 'abs_state', kind: 'state', lo: 0, hi: 2 },
    { part: 'abs_ecu', channel: 'abs_state', kind: 'state', lo: 0, hi: 2 },
    Pr('caliper', 'p_wheel', 0, 90), Pr('brake_line', 'p_wheel', 0, 90), Pr('flex_hose', 'p_wheel', 0, 90),
    { part: 'brake_pads', channel: 'p_wheel', kind: 'glow', lo: 0, hi: 90 },
  ],
};

export const BRAKES_LAYOUT: SystemLayout = { views, placements: finalPlacements, explode, visuals };
