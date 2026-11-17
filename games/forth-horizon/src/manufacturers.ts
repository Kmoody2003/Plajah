// Fictional Legends of Elohim automotive manufacturers, engines, suspension & brake systems.

export type CarId = 'kestrel' | 'aurelia';

export type VehicleClass = 'gt' | 'track' | 'muscle' | 'rally' | 'buggy' | 'truck' | 'ev';

export interface EngineSpec {
  code: string;
  name: string;
  layout: string;
  displacementL: number;
  aspiration: 'Supercharged' | 'Naturally Aspirated' | 'Twin-Turbo' | 'Electric';
  peakHp: number;
  peakTorqueNm: number;
  idleRpm: number;
  redlineRpm: number;
  // Normalized torque multiplier at [0%, 25%, 50%, 75%, 90%, 100%] of RPM band
  torqueCurve: [number, number, number, number, number, number];
  pitchBaseHz: number;
}

export interface SuspensionSpec {
  architecture: string;
  rideHeightM: number;
  travelM: number;
  springRateNm: number;
  damperNsM: number;
  antiRollFactor: number;
}

export interface BrakeSpec {
  systemName: string;
  rotorDiameterMm: number;
  maxTorqueNm: number;
  frontBias: number; // 0.5..0.75
  coolingRate: number;
}

export interface CarSpec {
  id: string;
  /** extra grip off the tarmac (rally tyres, long-travel setups); the physics adds it to the off-road bonus */
  offroadGrip?: number;
  /** how much a wet road costs this tyre (1 = the usual 24%; slicks lose more, wet-weather rubber less) */
  wetSensitivity?: number;
  manufacturer: string;
  model: string;
  origin: string;
  tagline: string;
  classLabel: string;
  paintHex: number;
  accentHex: number;
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  trackWidth: number;
  wheelRadius: number;
  massKg: number;
  cgHeightM?: number;
  vehicleClass?: VehicleClass;
  drivetrain: 'RWD' | 'AWD' | 'FWD';
  topSpeedMps: number;
  corneringGrip: number;
  aeroDownforce: number;
  steerMaxRad: number;
  gearRatios: number[];
  finalDrive: number;
  engine: EngineSpec;
  suspension: SuspensionSpec;
  brakes: BrakeSpec;
}

export const CARS: Record<CarId, CarSpec> = {
  kestrel: {
    id: 'kestrel',
    manufacturer: 'Kestrel Motors',
    model: 'Sovereign GT-R',
    origin: 'Ironport, Forth America',
    tagline: 'Supercharged V8 grand tourer forged in the Ironport foundry.',
    classLabel: 'S1 · 840',
    paintHex: 0xd9381e,
    accentHex: 0xffb703,
    length: 4.68,
    width: 1.96,
    height: 1.28,
    wheelbase: 2.74,
    trackWidth: 1.66,
    wheelRadius: 0.35,
    massKg: 1480,
    drivetrain: 'RWD',
    topSpeedMps: 81.5, // ~182 mph
    corneringGrip: 1.08,
    aeroDownforce: 3.4,
    steerMaxRad: 0.54,
    gearRatios: [3.2, 2.15, 1.56, 1.21, 0.98, 0.82],
    finalDrive: 3.42,
    engine: {
      code: 'KM-620SC',
      name: '6.2L Ironport Foundry V8',
      layout: 'Front-Mid V8',
      displacementL: 6.2,
      aspiration: 'Supercharged',
      peakHp: 760,
      peakTorqueNm: 890,
      idleRpm: 900,
      redlineRpm: 7600,
      torqueCurve: [0.68, 0.88, 0.98, 1.0, 0.94, 0.82],
      pitchBaseHz: 46,
    },
    suspension: {
      architecture: 'Double-Wishbone Pushrod (Front & Rear)',
      rideHeightM: 0.12,
      travelM: 0.14,
      springRateNm: 68000,
      damperNsM: 4600,
      antiRollFactor: 0.85,
    },
    brakes: {
      systemName: 'Ironport Forge 6-Piston Carbon-Iron',
      rotorDiameterMm: 400,
      maxTorqueNm: 4800,
      frontBias: 0.64,
      coolingRate: 0.35,
    },
  },
  aurelia: {
    id: 'aurelia',
    manufacturer: 'Aurelia Works',
    model: 'Zephyr Apex',
    origin: 'Solari Coast, Forth America',
    tagline: 'Carbon-monocoque V10 track weapon tuned for Great Lakes switchbacks.',
    classLabel: 'S2 · 920',
    paintHex: 0x168aad,
    accentHex: 0x90e0ef,
    length: 4.54,
    width: 1.98,
    height: 1.18,
    wheelbase: 2.68,
    trackWidth: 1.7,
    wheelRadius: 0.34,
    massKg: 1260,
    drivetrain: 'AWD',
    topSpeedMps: 86.0, // ~192 mph
    corneringGrip: 1.24,
    aeroDownforce: 5.2,
    steerMaxRad: 0.56,
    gearRatios: [3.4, 2.3, 1.68, 1.28, 1.02, 0.84],
    finalDrive: 3.73,
    engine: {
      code: 'AW-520V10',
      name: '5.2L Solari High-Rev V10',
      layout: 'Mid-Rear V10',
      displacementL: 5.2,
      aspiration: 'Naturally Aspirated',
      peakHp: 820,
      peakTorqueNm: 690,
      idleRpm: 1050,
      redlineRpm: 8800,
      torqueCurve: [0.54, 0.72, 0.86, 0.96, 1.0, 0.93],
      pitchBaseHz: 58,
    },
    suspension: {
      architecture: 'Active Aero Multi-Link Coilover',
      rideHeightM: 0.095,
      travelM: 0.11,
      springRateNm: 84000,
      damperNsM: 5400,
      antiRollFactor: 0.95,
    },
    brakes: {
      systemName: 'Aurelia Ceramic-Matrix 8-Piston',
      rotorDiameterMm: 420,
      maxTorqueNm: 5400,
      frontBias: 0.62,
      coolingRate: 0.44,
    },
  },
};

export const RIVAL_PAINTS = [0xf4a261, 0x2a9d8f, 0xe9c46a, 0x9b5de5];
