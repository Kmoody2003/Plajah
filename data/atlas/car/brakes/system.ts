// Brakes system definition: connections, scenarios, fault registry, S0 explainers.
import type { Connection, FaultDef, PortKind, Scenario, System } from '../../../../services/machineAtlas/types';
import { HYDRAULIC_PARTS } from './parts-hydraulics';
import { DISC_PARTS } from './parts-disc';
import { ABS_PARTS } from './parts-abs';
import { DRUM_PARTS } from './parts-drum';
import { FLUID_PARTS } from './parts-fluids';

export const BRAKE_PART_IDS = [...HYDRAULIC_PARTS, ...DISC_PARTS, ...ABS_PARTS, ...DRUM_PARTS, ...FLUID_PARTS].map(p => p.id);

const c = (a: string, b: string, kind: PortKind): Connection => {
  const [fp, fport] = a.split('.'), [tp, tport] = b.split('.');
  return { from: { part: fp, port: fport }, to: { part: tp, port: tport }, kind };
};

export const BRAKE_CONNECTIONS: Connection[] = [
  c('brake_pedal.rod', 'pushrod.in', 'mech'), c('pushrod.out', 'brake_booster.rod', 'mech'), c('brake_booster.out', 'master_cylinder.rod', 'mech'),
  c('brake_pedal.switch', 'brake_light_switch.plunger', 'mech'),
  c('brake_fluid.fill', 'master_cylinder.res', 'hydraulic'), c('fluid_reservoir.feed1', 'master_cylinder.res', 'hydraulic'),
  c('master_cylinder.p1', 'brake_line.a', 'hydraulic'), c('brake_line.b', 'abs_hcu.in1', 'hydraulic'),
  c('abs_hcu.out1', 'flex_hose.chassis', 'hydraulic'), c('flex_hose.caliper', 'caliper.hose', 'hydraulic'),
  c('caliper.bleed', 'bleeder_screw.fluid', 'hydraulic'), c('caliper.bore', 'caliper_piston.fluid', 'hydraulic'),
  c('piston_seal.seal', 'caliper_piston.fluid', 'hydraulic'),
  c('caliper_piston.push', 'brake_pads.clamp', 'mech'), c('brake_pads.friction', 'rotor.friction', 'mech'),
  c('brake_pads.heat', 'rotor.heat', 'thermal'), c('pad_wear_indicator.tab', 'rotor.friction', 'mech'),
  c('caliper.clamp', 'slide_pins.slide', 'mech'), c('slide_pins.slide', 'caliper_bracket.torque', 'mech'),
  c('rotor.torque', 'hub.mount', 'mech'), c('hub.ring', 'tone_ring.rot', 'mech'), c('tone_ring.mag', 'wheel_speed_sensor.ring', 'signal'),
  c('wheel_speed_sensor.sig', 'abs_ecu.wss', 'signal'), c('abs_ecu.valves', 'abs_hcu.cmd', 'signal'),
  c('master_cylinder.p2', 'proportioning_valve.in', 'hydraulic'), c('proportioning_valve.out', 'wheel_cylinder.fluid', 'hydraulic'),
  c('wheel_cylinder.push', 'brake_shoes.push', 'mech'), c('parking_brake_cable.shoe', 'brake_shoes.push', 'mech'),
  c('return_springs.spring', 'brake_shoes.push', 'mech'), c('shoe_adjuster.adj', 'return_springs.spring', 'mech'),
  c('brake_shoes.friction', 'drum.friction', 'mech'), c('brake_shoes.heat', 'drum.heat', 'thermal'), c('drum.torque', 'hub.mount', 'mech'),
];

export const BRAKE_FAULTS: FaultDef[] = [
  { id: 'worn_pads', label: 'Worn pads', partIds: ['brake_pads', 'pad_wear_indicator'] },
  { id: 'stuck_slide_pin', label: 'Stuck slide pin', partIds: ['slide_pins', 'caliper'] },
  { id: 'air_in_lines', label: 'Air in the lines', partIds: ['brake_line', 'bleeder_screw'] },
  { id: 'vacuum_loss', label: 'Loss of vacuum assist', partIds: ['brake_booster'] },
  { id: 'seized_piston', label: 'Seized caliper piston', partIds: ['caliper_piston', 'caliper'] },
  { id: 'glazed_pads', label: 'Glazed pads / rotor', partIds: ['brake_pads', 'rotor'] },
  { id: 'warped_rotor', label: 'Thickness variation (warped) rotor', partIds: ['rotor', 'hub'] },
  { id: 'contaminated_fluid', label: 'Wet / contaminated fluid', partIds: ['brake_fluid', 'caliper'] },
  { id: 'wheel_speed_sensor_failure', label: 'Failed wheel speed sensor', partIds: ['wheel_speed_sensor', 'abs_ecu'] },
  { id: 'drum_adjuster_failure', label: 'Drum adjuster failure', partIds: ['shoe_adjuster', 'brake_shoes'] },
];

/** Geometry parameter overrides when a fault is active (partId -> generator params). */
export const FAULT_GEOMETRY: Record<string, Record<string, Record<string, number>>> = {
  worn_pads: { brake_pads: { wear: 0.92 } },
  warped_rotor: { rotor: { wear: 0.35 } },
  drum_adjuster_failure: { brake_shoes: { wear: 0.5 } },
};

const APPLY_FAULTS = ['vacuum_loss', 'air_in_lines', 'worn_pads', 'seized_piston', 'stuck_slide_pin', 'warped_rotor', 'drum_adjuster_failure'];
const drill = (id: string, name: string, desc: string, run: 'apply' | 'heat' | 'abs', fault: string, tier: 'S1' | 'S2'): Scenario =>
  ({ id: `fault_${id}`, name, description: desc, tier, faults: [fault], setup: { run, faulted: true } });

export const BRAKE_SCENARIOS: Scenario[] = [
  { id: 'apply', name: 'Brake apply: pedal to rotor torque', tier: 'S1', faults: APPLY_FAULTS, setup: { run: 'apply', faulted: false, pedalN: 180 },
    description: 'Pedal force becomes booster assist, master cylinder pressure, line pressure, caliper clamp force and finally rotor torque.' },
  { id: 'heat', name: 'Repeated hard stops: heat, fade and fluid boil', tier: 'S2', faults: ['contaminated_fluid', 'glazed_pads', 'stuck_slide_pin'], setup: { run: 'heat', faulted: false, stops: 10 },
    description: 'Ten hard stops heat the rotor, pads, caliper and fluid. Watch pad friction fade and the fluid temperature approach its boiling point.' },
  { id: 'abs', name: 'ABS panic stop on a low-friction surface', tier: 'S1', faults: ['wheel_speed_sensor_failure', 'glazed_pads'], setup: { run: 'abs', faulted: false, surface: 'snow' },
    description: 'A full-pedal stop on packed snow, with and without ABS. The modulator cycles apply, hold and release to keep the wheel near its best slip.' },
  drill('stuck_slide_pin', 'Fault drill: stuck slide pin', 'One pad clamps poorly and the other drags: pulling, uneven wear and heat.', 'heat', 'stuck_slide_pin', 'S2'),
  drill('air_in_lines', 'Fault drill: air in the lines', 'A trapped bubble absorbs pedal travel: a spongy, sinking pedal.', 'apply', 'air_in_lines', 'S1'),
  drill('vacuum_loss', 'Fault drill: loss of vacuum assist', 'No assist: the same pedal force makes far less pressure.', 'apply', 'vacuum_loss', 'S1'),
  drill('worn_pads', 'Fault drill: worn pads', 'Thin lining: wear-indicator squeal and a lower, longer pedal.', 'apply', 'worn_pads', 'S1'),
  drill('seized_piston', 'Fault drill: seized caliper piston', 'The corner cannot clamp and the car pulls to the other side.', 'apply', 'seized_piston', 'S1'),
  drill('warped_rotor', 'Fault drill: warped rotor (thickness variation)', 'Rotor thickness variation pushes the piston back each turn: pedal pulsation.', 'apply', 'warped_rotor', 'S1'),
  drill('glazed_pads', 'Fault drill: glazed pads', 'Friction down by about 40 percent: long stops and more heat per stop.', 'heat', 'glazed_pads', 'S2'),
  drill('contaminated_fluid', 'Fault drill: contaminated fluid / boil', 'Water-laden fluid boils at a much lower temperature and the pedal goes soft after hard use.', 'heat', 'contaminated_fluid', 'S2'),
  drill('wheel_speed_sensor', 'Fault drill: failed wheel speed sensor', 'ABS light on and ABS disabled: the panic stop behaves like a non-ABS stop.', 'abs', 'wheel_speed_sensor_failure', 'S1'),
  drill('drum_adjuster', 'Fault drill: drum adjuster failure', 'Excess shoe gap: a longer pedal and weak rear braking.', 'apply', 'drum_adjuster_failure', 'S1'),
  { id: 'compare', name: 'Disc vs drum', tier: 'S0', faults: [], setup: { run: 's0-compare' },
    description: 'The same job done two ways: how self-energising shoes differ from a clamped disc.' },
  { id: 'parking', name: 'How the parking brake works', tier: 'S0', faults: [], setup: { run: 's0-parking' },
    description: 'A cable mechanically applies the rear brake with no hydraulic pressure.' },
];

export const BRAKES_SYSTEM: System = { id: 'brakes', name: 'Brakes (disc, drum, ABS)', partIds: BRAKE_PART_IDS, connections: BRAKE_CONNECTIONS, scenarios: BRAKE_SCENARIOS };

export const PARKING_BRAKE_STEPS: string[] = [
  'The driver pulls the lever or presses the pedal; an equalizer splits the pull between the left and right cables.',
  'Each cable pulls a lever pivoted on the rear shoe (drum) or turns a small actuator in the caliper (disc).',
  'In a drum, the lever pushes the primary shoe against the drum and, through a strut, the secondary shoe on the other side: both shoes expand mechanically.',
  'A ratchet holds the lever so no hydraulic pressure is needed. Cable stretch, shoe wear and a failed adjuster all show up as extra lever travel.',
  'Used regularly, the parking brake motion also turns the star-wheel adjuster so the shoes stay close to the drum.',
];
