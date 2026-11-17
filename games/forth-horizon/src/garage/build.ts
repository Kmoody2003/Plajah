// Turns an owned car (stock car + fitted parts + tune) into the physics spec the game drives with, and into the numbers the garage shows.
import type { CarSpec } from '../manufacturers';
import { CAR_BY_ID, classFor, classLabel, stockSpec, type ClassLetter } from './catalog';
import { PART_BY_ID, SLOTS, slotAvailable, stockPart, type Fx, type PartDef, type SlotId } from './parts';
import { applyTune, defaultTune, type Tune } from './tuning';

export interface OwnedCar {
  uid: string;
  carId: string;
  parts: Partial<Record<SlotId, string>>;   // fitted part per slot; a missing slot is stock
  tune: Tune;
  nickname?: string;
  paint?: string;                           // css colour
  odometerKm: number;
  wins: number;
  acquired: number;                         // ms epoch
}

export function newOwnedCar(carId: string, uid: string, now = Date.now()): OwnedCar {
  const def = CAR_BY_ID[carId], spec = stockSpec(def);
  return { uid, carId, parts: {}, tune: defaultTune(spec.massKg, spec.drivetrain), odometerKm: 0, wins: 0, acquired: now };
}

/** every slot's fitted part, stock included, for slots this car's powertrain has */
export function fittedParts(c: OwnedCar): PartDef[] {
  const pt = CAR_BY_ID[c.carId].powertrain, out: PartDef[] = [];
  for (const s of SLOTS) {
    if (!slotAvailable(s.id, pt)) continue;
    const id = c.parts[s.id];
    const p = id ? PART_BY_ID[id] : undefined;
    out.push(p && (!p.only || p.only === pt) ? p : stockPart(s.id, pt));
  }
  return out;
}

export function carPi(c: OwnedCar): number {
  const def = CAR_BY_ID[c.carId];
  return Math.min(999, Math.max(100, def.pi + fittedParts(c).reduce((n, p) => n + p.pi, 0)));
}

function mergeFx(parts: PartDef[]): Required<{ [K in keyof Fx]: number }> {
  const m = { power: 1, lowTorque: 0, redline: 1, mass: 0, grip: 0, offroadGrip: 0, wetSens: 1, aero: 0, topSpeed: 1, finalDrive: 1, spring: 1, damper: 1, antiRoll: 1, ride: 0, travel: 1, brakeTorque: 1, brakeCool: 1, steer: 1, pitch: 1 };
  for (const p of parts) {
    const f = p.fx;
    m.power *= f.power ?? 1; m.lowTorque += f.lowTorque ?? 0; m.redline *= f.redline ?? 1; m.mass += f.mass ?? 0; m.grip += f.grip ?? 0; m.offroadGrip += f.offroadGrip ?? 0;
    m.wetSens *= f.wetSens ?? 1; m.aero += f.aero ?? 0; m.topSpeed *= f.topSpeed ?? 1; m.finalDrive *= f.finalDrive ?? 1; m.spring *= f.spring ?? 1; m.damper *= f.damper ?? 1;
    m.antiRoll *= f.antiRoll ?? 1; m.ride += f.ride ?? 0; m.travel *= f.travel ?? 1; m.brakeTorque *= f.brakeTorque ?? 1; m.brakeCool *= f.brakeCool ?? 1; m.steer *= f.steer ?? 1; m.pitch *= f.pitch ?? 1;
  }
  return m;
}

/** the spec with parts fitted but no tune: what the garage compares against */
export function specWithParts(c: OwnedCar): CarSpec {
  const def = CAR_BY_ID[c.carId], s = stockSpec(def), f = mergeFx(fittedParts(c));
  s.engine.peakHp = Math.round(s.engine.peakHp * f.power);
  s.engine.peakTorqueNm = Math.round(s.engine.peakTorqueNm * f.power);
  s.engine.redlineRpm = Math.round(s.engine.redlineRpm * f.redline / 50) * 50;
  s.engine.pitchBaseHz *= f.pitch;
  const tc = s.engine.torqueCurve; tc[0] = Math.min(1, tc[0] + f.lowTorque); tc[1] = Math.min(1, tc[1] + f.lowTorque * 0.8); tc[2] = Math.min(1, tc[2] + f.lowTorque * 0.4);
  s.massKg = Math.max(600, s.massKg + f.mass);
  s.corneringGrip += f.grip;
  s.offroadGrip = (s.offroadGrip ?? 0) + f.offroadGrip;
  s.wetSensitivity = (s.wetSensitivity ?? 1) * f.wetSens;
  s.aeroDownforce += f.aero;
  s.topSpeedMps *= f.topSpeed;
  // more power lifts the top speed with a cube-root law (drag grows with the cube of speed)
  s.topSpeedMps *= Math.cbrt(f.power);
  s.finalDrive *= f.finalDrive;
  s.suspension.springRateNm *= f.spring; s.suspension.damperNsM *= f.damper; s.suspension.antiRollFactor *= f.antiRoll;
  s.suspension.rideHeightM = Math.max(0.05, s.suspension.rideHeightM + f.ride); s.suspension.travelM *= f.travel;
  s.brakes.maxTorqueNm *= f.brakeTorque; s.brakes.coolingRate *= f.brakeCool;
  s.steerMaxRad *= f.steer;
  const pi = carPi(c);
  s.classLabel = classLabel(pi);
  const fitted = fittedParts(c).filter((p) => p.tier > 0).map((p) => p.name);
  s.suspension.architecture = fitted.length ? `${s.suspension.architecture === 'Stock' ? 'Tuned' : s.suspension.architecture}` : s.suspension.architecture;
  return s;
}

export interface BuiltCar {
  spec: CarSpec;
  pi: number;
  cls: ClassLetter;
  label: string;
  ratings: Ratings;
}

export function buildCar(c: OwnedCar): BuiltCar {
  const stockMass = stockSpec(CAR_BY_ID[c.carId]).massKg;
  const spec = applyTune(specWithParts(c), c.tune, stockMass);
  const pi = carPi(c);
  return { spec, pi, cls: classFor(pi), label: classLabel(pi), ratings: ratings(spec) };
}

export interface Ratings { speed: number; acceleration: number; handling: number; braking: number; offroad: number; launch: number; zeroTo100: number; topKmh: number; powerHp: number; massKg: number; powerToWeight: number }
const clamp10 = (v: number): number => Math.min(10, Math.max(0, v));
export function ratings(s: CarSpec): Ratings {
  const kgPerHp = s.massKg / s.engine.peakHp;
  const awd = s.drivetrain === 'AWD' ? 0.92 : 1;
  const ev = s.engine.aspiration === 'Electric' ? 0.95 : 1;
  const zeroTo100 = Math.max(1.6, (0.4 + 1.55 * kgPerHp) * awd * ev / (1 + (s.corneringGrip - 1) * 0.35) * (s.finalDrive / 3.4) ** -0.18);
  const brakeG = Math.min(1.7, (s.brakes.maxTorqueNm / s.wheelRadius * 4 / (s.massKg * 9.81)) * 0.5 + s.corneringGrip * 0.45);
  return {
    speed: clamp10((s.topSpeedMps - 48) / 4.2),
    acceleration: clamp10((8.5 - zeroTo100) * 1.5),
    handling: clamp10((s.corneringGrip - 0.75) * 13 + s.aeroDownforce * 0.35),
    braking: clamp10((brakeG - 0.8) * 8),
    offroad: clamp10(((s.suspension.travelM - 0.1) * 24) + (s.offroadGrip ?? 0) * 14 + (s.vehicleClass === 'truck' || s.vehicleClass === 'rally' || s.vehicleClass === 'buggy' ? 1.5 : 0)),
    launch: clamp10((s.drivetrain === 'AWD' ? 2 : 0) + s.corneringGrip * 3 + (s.engine.peakTorqueNm / s.massKg) * 2.2 - 3),
    zeroTo100, topKmh: s.topSpeedMps * 3.6, powerHp: s.engine.peakHp, massKg: s.massKg, powerToWeight: s.engine.peakHp / s.massKg * 1000,
  };
}
