/**
 * footballWardrobe.ts — Pro American Football uniform & protective gear builder
 * for Plajah Character Forge (services/argilla/creature/).
 *
 * Fits real 3D pro football equipment directly over an anatomical HumanAnatomy
 * body field (human.ts + humanFinish.ts), modeled from the Project Firstlight
 * character asset turnaround sheets and uniform gear kit:
 * - Sculpted cantilevered shoulder pads beneath a fitted athletic game jersey
 *   with crisp planar front/back UV atlas for dynamic numbers & nameplates
 * - Cuffed jersey sleeves with dual team stripes & V-neck collar trim
 * - Stretch-woven game pants with sculpted multi-ribbed thigh pads, molded knee
 *   pad domes, waist belt + D-buckle, and vertical side stripes
 * - Mid-calf crew socks, white ankle & wrist athletic tape, receiver/lineman gloves
 * - Sculpted mid-top cleats with dual-density traction sole & studs
 * - Archetype accessories: QB play-call wristband, compression arm sleeves,
 *   hip towel, lineman neck roll, elbow sleeves, and dual-strap knee braces
 * - Rigid Head-mounted modern composite helmet: aerodynamic shell with ear flaps,
 *   center stripe, curved multi-bar tubular steel facemask, tinted visor, and
 *   contoured 4-point chinstrap
 */

import type { Vec3 } from '../engine';
import type { HumanAnatomy, HumanJoint, HumanTune } from './human';
import {
  MeshBuilder,
  orientTo,
  reach,
  sheet,
  tube,
  trunkSection,
  limbSection,
  quatFromBasis,
  type Field,
} from './wardrobe';

export type FootballArchetypeId = 'qb' | 'skill' | 'power' | 'lineman';

export interface FootballArchetypeSpec {
  id: FootballArchetypeId;
  label: string;
  tune: HumanTune;
  shoulderPadBulk: number;
  shoulderLift: number;
  facemaskStyle: 'SKILL' | 'POWER' | 'LINEMAN';
  hasVisor: boolean;
  hasWristband: boolean;
  hasLeftSleeve: boolean;
  hasRightSleeve: boolean;
  hasTowel: boolean;
  hasNeckRoll: boolean;
  hasElbowSleeves: boolean;
  hasKneeBraces: boolean;
}

export const FOOTBALL_ARCHETYPES: Record<FootballArchetypeId, FootballArchetypeSpec> = {
  qb: {
    id: 'qb',
    label: 'Quarterback',
    tune: { height: 1.91, build: 1.08, musculature: 0.78, weight: 0.17, age: 25 },
    shoulderPadBulk: 0.048,
    shoulderLift: 0.024,
    facemaskStyle: 'SKILL',
    hasVisor: true,
    hasWristband: true,
    hasLeftSleeve: false,
    hasRightSleeve: false,
    hasTowel: true,
    hasNeckRoll: false,
    hasElbowSleeves: false,
    hasKneeBraces: false,
  },
  skill: {
    id: 'skill',
    label: 'Skill (WR / DB / RB / K)',
    tune: { height: 1.86, build: 1.06, musculature: 0.85, weight: 0.14, age: 24 },
    shoulderPadBulk: 0.044,
    shoulderLift: 0.022,
    facemaskStyle: 'SKILL',
    hasVisor: true,
    hasWristband: false,
    hasLeftSleeve: true,
    hasRightSleeve: false,
    hasTowel: false,
    hasNeckRoll: false,
    hasElbowSleeves: false,
    hasKneeBraces: false,
  },
  power: {
    id: 'power',
    label: 'Power (LB / EDGE / TE)',
    tune: { height: 1.93, build: 1.18, musculature: 0.92, weight: 0.28, age: 26 },
    shoulderPadBulk: 0.062,
    shoulderLift: 0.032,
    facemaskStyle: 'POWER',
    hasVisor: true,
    hasWristband: false,
    hasLeftSleeve: true,
    hasRightSleeve: true,
    hasTowel: true,
    hasNeckRoll: false,
    hasElbowSleeves: false,
    hasKneeBraces: false,
  },
  lineman: {
    id: 'lineman',
    label: 'Lineman (OL / DL)',
    tune: { height: 1.98, build: 1.32, musculature: 0.94, weight: 0.64, age: 28 },
    shoulderPadBulk: 0.074,
    shoulderLift: 0.038,
    facemaskStyle: 'LINEMAN',
    hasVisor: false,
    hasWristband: false,
    hasLeftSleeve: false,
    hasRightSleeve: false,
    hasTowel: true,
    hasNeckRoll: true,
    hasElbowSleeves: true,
    hasKneeBraces: true,
  },
};

export interface FootballWardrobeOut {
  /** Skinned garment/gear meshes keyed by semantic material name. */
  skinned: Record<string, MeshBuilder>;
  /** Rigid Head-mounted helmet meshes keyed by semantic material name. */
  helmet: Record<string, MeshBuilder>;
  /** Hand sockets for holding the football cleanly on RightHand / LeftHand. */
  sockets: { name: string; bone: HumanJoint; at: Vec3; rotation: [number, number, number, number] }[];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth01 = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

function limbBasis(a: Vec3, b: Vec3): { dir: Vec3; e1: Vec3; e2: Vec3 } {
  const dir = norm(sub(b, a));
  const ref: Vec3 = Math.abs(dir[2]) < 0.85 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(ref, dir));
  const e2 = norm(cross(dir, e1));
  return { dir, e1, e2 };
}

/** Build a smooth limb wrap tube fitted around the anatomical body field from t0..t1 along joint a->b. */
function buildLimbWrap(
  mb: MeshBuilder,
  field: Field,
  a: Vec3,
  b: Vec3,
  t0: number,
  t1: number,
  clear: number | ((t: number, angle: number) => number),
  bone: string,
  nu = 20,
  nv = 10,
  maxR = 0.16,
  uvScale: [number, number] = [1, 1]
): void {
  const { e1, e2 } = limbBasis(a, b);
  const secs: ((ang: number) => number)[] = [];
  const centers: Vec3[] = [];
  for (let j = 0; j <= nv; j++) {
    const t = t0 + (t1 - t0) * (j / nv);
    const c = lerp(a, b, t);
    centers.push(c);
    secs.push(limbSection(field, c, e1, e2, 32, maxR));
  }

  sheet(
    mb,
    nu,
    nv,
    (u, v) => {
      const ang = u * Math.PI * 2;
      const vf = v * nv;
      const j0 = Math.min(nv, Math.floor(vf));
      const j1 = Math.min(nv, j0 + 1);
      const frac = vf - j0;
      const c = lerp(centers[j0], centers[j1], frac);
      const r0 = secs[j0](ang);
      const r1 = secs[j1](ang);
      const rBase = r0 + (r1 - r0) * frac;
      const extra = typeof clear === 'number' ? clear : clear(v, ang);
      const r = rBase + extra;
      return add(c, add(mul(e1, Math.cos(ang) * r), mul(e2, Math.sin(ang) * r)));
    },
    bone,
    uvScale,
    false,
    true
  );
}

/** Build the complete fitted Pro Football uniform & helmet on a Character Forge HumanAnatomy. */
export function buildFootballWardrobe(
  anatomy: HumanAnatomy,
  field: Field,
  spec: FootballArchetypeSpec
): FootballWardrobeOut {
  const skinned: Record<string, MeshBuilder> = {};
  const helmet: Record<string, MeshBuilder> = {};
  const S = (mat: string) => (skinned[mat] ??= new MeshBuilder());
  const H = (mat: string) => (helmet[mat] ??= new MeshBuilder());

  const J = (name: HumanJoint): Vec3 => anatomy.byName[name].at;
  const k = anatomy.tune.height / 1.74;

  orientTo(field);

  // Cache horizontal trunk cross-sections for jersey & pants fitting
  const secCache = new Map<number, ReturnType<typeof trunkSection>>();
  const sec = (y: number, ignoreArms = true) => {
    const key = Math.round(y * 200) * 2 + (ignoreArms ? 1 : 0);
    let s = secCache.get(key);
    if (!s) {
      s = trunkSection(field, y, 56, ignoreArms);
      secCache.set(key, s);
    }
    return s;
  };

  // =========================================================================
  // 1. GAME JERSEY OVER CANTILEVERED SHOULDER PADS (Skinned: jersey & jerseyStripe)
  // =========================================================================
  const yWaist = J('Hips')[1] + 0.015 * k;
  const yNeck = J('Neck')[1] + 0.01 * k;
  const yShoulder = J('LeftArm')[1];
  const padBulk = spec.shoulderPadBulk * k;
  const padLift = spec.shoulderLift * k;

  // Build front and back jersey shells separately so UV layout is 100% planar:
  // Front shell: u in [0.02, 0.48], Back shell: u in [0.52, 0.98]
  // v = 0 at waist bottom, v = 1 at shoulder top (canvas V flipped nicely in loader)
  const buildTorsoHalf = (isFront: boolean) => {
    const mb = S('jersey');
    const nu = 26;
    const nv = 18;
    const base = mb.count;

    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const yBase = yWaist + (yNeck - yWaist) * v;
      const s = sec(Math.min(yBase, yShoulder + 0.03 * k), true);

      // Shoulder pad profile swells sharply above mid-chest (v > 0.56)
      const padRamp = smooth01((v - 0.52) / 0.42);
      const collarDip = isFront ? smooth01((v - 0.84) / 0.16) * 0.055 * k : 0;

      for (let i = 0; i <= nu; i++) {
        const uHalf = i / nu; // 0 = right flank (-x), 1 = left flank (+x)
        // Angle in trunk plane: front runs from PI (-x) through PI/2 (+z) to 0 (+x)
        // Back runs from 0 (+x) through -PI/2 (-z) to -PI (-x)
        const a = isFront ? Math.PI * (1 - uHalf) : -Math.PI * uHalf;
        const sideFactor = Math.abs(Math.cos(a)); // 1 at shoulders/sides, 0 at sternum/spine
        const frontBackFactor = Math.abs(Math.sin(a)); // 1 at chest/back center

        // Broad athletic V-taper + cantilevered shoulder pad arch at upper chest/shoulders
        const rBody = s.radius(a);
        const padSideExpand = padRamp * padBulk * (0.45 + 0.88 * sideFactor);
        const padChestArch = padRamp * padBulk * 0.55 * frontBackFactor;
        const waistSnug = 0.011 * k;
        const r = rBody + waistSnug + padSideExpand + padChestArch;

        // V-neck cutout at top front center, flat high collar in back
        const centerV = Math.max(0, 1 - Math.abs(uHalf - 0.5) * 3.8);
        const yPadLift = padRamp * padLift * (0.3 + 0.7 * sideFactor);
        const y = yBase + yPadLift - collarDip * centerV;

        const x = Math.cos(a) * r;
        const z = s.cz + Math.sin(a) * r;
        const n = norm([Math.cos(a), padRamp * 0.28, Math.sin(a)]);

        // Planar UV atlas: Front occupies left half [0.02..0.48], Back occupies right half [0.52..0.98]
        const uvU = isFront ? 0.02 + uHalf * 0.46 : 0.52 + uHalf * 0.46;
        const uvV = 0.04 + (1 - v) * 0.92;
        const bone = v < 0.25 ? 'Spine' : v < 0.62 ? 'Spine1' : 'Spine2';
        mb.vert([x, y, z], n, uvU, uvV, bone);
      }
    }

    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1;
        const c = a + nu + 2;
        const d = a + nu + 1;
        // Outward-facing winding for both front and back halves
        mb.quad(a, b, c, d);
      }
    }
  };
  buildTorsoHalf(true);
  buildTorsoHalf(false);

  // V-Neck Collar Ribbing Trim (`jerseyStripe`)
  {
    const collarPts: Vec3[] = [];
    const sTop = sec(yShoulder + 0.025 * k, true);
    const collarCount = 32;
    for (let i = 0; i <= collarCount; i++) {
      const a = (i / collarCount) * Math.PI * 2;
      const isFrontSide = Math.sin(a) > 0;
      const frontCenter = Math.max(0, Math.sin(a));
      const r = sTop.radius(a) + 0.018 * k + padBulk * 0.35 * Math.abs(Math.cos(a));
      const vDrop = isFrontSide ? Math.pow(frontCenter, 2.2) * 0.062 * k : 0;
      collarPts.push([
        Math.cos(a) * r * 0.62,
        yNeck + padLift * 0.35 - vDrop,
        sTop.cz + Math.sin(a) * r * 0.68,
      ]);
    }
    tube(S('jerseyStripe'), collarPts, 0.011 * k, 8, 'Spine2');
  }

  // Sculpted Cantilevered Shoulder Pad Epaulets + Cuffed Jersey Sleeves + Sleeve Stripes
  for (const side of ['Left', 'Right'] as const) {
    const sx = side === 'Left' ? 1 : -1;
    const armAt = J(`${side}Arm` as HumanJoint);
    const elbowAt = J(`${side}ForeArm` as HumanJoint);
    const shAt = J(`${side}Shoulder` as HumanJoint);
    const boneArm = `${side}Arm`;

    // Sculpted over-shoulder dome cap covering the cantilevered pad arch smoothly into the sleeve
    const capCenter: Vec3 = [
      armAt[0] + sx * (0.015 * k + padBulk * 0.25),
      armAt[1] + 0.025 * k + padLift * 0.4,
      armAt[2],
    ];
    const capRx = 0.092 * k + padBulk * 0.68;
    const capRy = 0.078 * k + padLift * 0.65;
    const capRz = 0.112 * k + padBulk * 0.62;

    sheet(
      S('jersey'),
      20,
      10,
      (u, v) => {
        // u goes around azimuth, v goes from inner collar crest (0) over deltoid cap down to mid-bicep cuff (1)
        const az = (u - 0.5) * Math.PI * 1.9;
        const elev = (1 - v) * (Math.PI * 0.56) - 0.16;
        const outX = sx * (Math.cos(elev) * 0.55 + Math.cos(az) * Math.cos(elev) * 0.52);
        const outY = Math.sin(elev);
        const outZ = Math.sin(az) * Math.cos(elev);
        return [
          capCenter[0] + outX * capRx,
          capCenter[1] + outY * capRy,
          capCenter[2] + outZ * capRz,
        ];
      },
      boneArm,
      [0.06, 0.06],
      false,
      false
    );

    // Fitted sleeve barrel wrapping upper arm from shoulder joint to upper bicep (0.0 -> 0.44)
    buildLimbWrap(
      S('jersey'),
      field,
      armAt,
      elbowAt,
      -0.04,
      0.42,
      (v) => 0.016 * k + (1 - v) * padBulk * 0.45,
      boneArm,
      18,
      6,
      0.16,
      [0.08, 0.08]
    );

    // Dual crisp athletic sleeve stripes around the outer sleeve cuff (modeled on Carter #12 / Davis #31 / Jackson #54)
    buildLimbWrap(
      S('jerseyStripe'),
      field,
      armAt,
      elbowAt,
      0.24,
      0.38,
      (v) => 0.020 * k + (1 - v) * padBulk * 0.25,
      boneArm,
      18,
      4,
      0.16,
      [1, 1]
    );

    // Tight elastic jersey sleeve cuff hem
    const { e1, e2 } = limbBasis(armAt, elbowAt);
    const cuffCenter = lerp(armAt, elbowAt, 0.42);
    const cuffSec = limbSection(field, cuffCenter, e1, e2, 24, 0.15);
    const cuffPts: Vec3[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = cuffSec(a) + 0.015 * k;
      cuffPts.push(add(cuffCenter, add(mul(e1, Math.cos(a) * r), mul(e2, Math.sin(a) * r))));
    }
    tube(S('jerseyStripe'), cuffPts, 0.006 * k, 6, boneArm);
    void shAt;
  }

  // =========================================================================
  // 2. GAME PANTS + INTEGRATED THIGH/KNEE PADS + BELT + SIDE STRIPES
  // =========================================================================
  // Pelvis / Shorts trunk section from mid-hip down to upper thigh crease
  const yBelt = J('Hips')[1] + 0.022 * k;
  const yCrotch = J('LeftUpLeg')[1] - 0.11 * k;
  {
    const nu = 32;
    const nv = 8;
    sheet(
      S('pants'),
      nu,
      nv,
      (u, v) => {
        const a = u * Math.PI * 2;
        const y = yCrotch + (yBelt - yCrotch) * v;
        const s = sec(y, true);
        // Hip pad reinforcement subtly widens outer hips near the belt
        const hipPad = smooth01(v) * Math.pow(Math.abs(Math.cos(a)), 2) * 0.014 * k;
        const r = s.radius(a) + 0.012 * k + hipPad;
        return [Math.cos(a) * r, y, s.cz + Math.sin(a) * r];
      },
      'Hips',
      [1, 1],
      false,
      true
    );

    // Waist belt strap (`belt`)
    const sBelt = sec(yBelt, true);
    const beltPts: Vec3[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = sBelt.radius(a) + 0.020 * k;
      beltPts.push([Math.cos(a) * r, yBelt, sBelt.cz + Math.sin(a) * r]);
    }
    tube(S('belt'), beltPts, 0.013 * k, 8, 'Hips', 0.48);
  }

  // Fitted Football Pant Legs + Sculpted Ribbed Thigh Pads + Molded Knee Pads + Side Stripes
  for (const side of ['Left', 'Right'] as const) {
    const sx = side === 'Left' ? 1 : -1;
    const hipAt = J(`${side}UpLeg` as HumanJoint);
    const kneeAt = J(`${side}Leg` as HumanJoint);
    const ankleAt = J(`${side}Foot` as HumanJoint);
    const toeAt = J(`${side}ToeBase` as HumanJoint);
    const toeTip = anatomy.byName[`${side}ToeBase` as HumanJoint].tip;

    // Upper thigh pants with sculpted horizontal ribbed thigh pad bulge on front-outer quad
    const { e1: te1, e2: te2 } = limbBasis(hipAt, kneeAt);
    buildLimbWrap(
      S('pants'),
      field,
      hipAt,
      kneeAt,
      -0.06,
      1.05,
      (v, ang) => {
        // Compute world direction of this radial sample to locate front (+z) and outer (sx*x)
        const d = add(mul(te1, Math.cos(ang)), mul(te2, Math.sin(ang)));
        const frontFace = Math.max(0, d[2]);
        const outerFace = Math.max(0, d[0] * sx);
        // Molded ribbed thigh pad on mid-thigh (v in 0.22..0.72)
        const thighWindow = Math.sin(Math.PI * Math.max(0, Math.min(1, (v - 0.18) / 0.56)));
        const ribRipple = 1 + 0.18 * Math.sin(v * 34);
        const thighPad =
          thighWindow *
          Math.pow(frontFace * 0.78 + outerFace * 0.35, 1.8) *
          0.022 *
          k *
          ribRipple;
        // Molded knee pad dome around v in 0.80..1.02
        const kneeWindow = Math.sin(Math.PI * Math.max(0, Math.min(1, (v - 0.76) / 0.28)));
        const kneePad = kneeWindow * Math.pow(frontFace, 2.0) * 0.020 * k;
        return 0.011 * k + thighPad + kneePad;
      },
      `${side}UpLeg`,
      22,
      14,
      0.19
    );

    // Lower knee pants overlap cleanly down past the kneecap (0.0 -> 0.16 of shin)
    buildLimbWrap(
      S('pants'),
      field,
      kneeAt,
      ankleAt,
      -0.04,
      0.16,
      0.012 * k,
      `${side}Leg`,
      18,
      4,
      0.14
    );

    // Vertical Team Pant Side Stripe running from hip down outer thigh to knee
    const stripePts: Vec3[] = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      const c = lerp(hipAt, kneeAt, t);
      const r = reach(field, c, [sx, 0, 0], 0.22) + 0.015 * k;
      stripePts.push([c[0] + sx * r, c[1], c[2]]);
    }
    tube(S('pantsStripe'), stripePts, 0.014 * k, 6, `${side}UpLeg`, 0.32);

    // =========================================================================
    // 3. MID-CALF CREW SOCKS + ANKLE TAPE + ELITE DUAL-DENSITY CLEATS
    // =========================================================================
    // Team-colored compression crew sock from below knee down to ankle
    buildLimbWrap(
      S('socks'),
      field,
      kneeAt,
      ankleAt,
      0.14,
      0.86,
      0.007 * k,
      `${side}Leg`,
      16,
      8,
      0.12
    );

    // White athletic ankle tape / spat wrap around lower ankle
    buildLimbWrap(
      S('tape'),
      field,
      kneeAt,
      ankleAt,
      0.82,
      1.04,
      0.009 * k,
      `${side}Foot`,
      16,
      4,
      0.10
    );

    // Sculpted Mid-Top Football Cleat Upper + Dual-Density Traction Sole Plate
    const footX = (ankleAt[0] + toeAt[0]) * 0.5;
    const zHeel = ankleAt[2] - 0.068 * k;
    const zToe = toeTip[2] + 0.022 * k;
    const cleatLen = zToe - zHeel;
    const cleatH = ankleAt[1] + 0.032 * k;

    sheet(
      S('cleats'),
      18,
      10,
      (u, v) => {
        const z = zHeel + cleatLen * v;
        // Width tapers smoothly toward heel and toe box
        const wProfile = Math.sqrt(Math.max(0.18, Math.sin(Math.PI * Math.min(0.98, 0.08 + v * 0.88))));
        const halfW = 0.052 * k * wProfile;
        // Upper collar is higher at ankle/heel (v < 0.38) and slopes cleanly over instep to toe cap
        const hProfile =
          v < 0.32
            ? cleatH * (0.94 + 0.06 * Math.sin((v / 0.32) * Math.PI))
            : cleatH * (0.96 - smooth01((v - 0.28) / 0.72) * 0.62);
        const ang = u * Math.PI; // 0 = right sole edge, PI/2 = top laces, PI = left sole edge
        const lx = Math.cos(ang) * halfW;
        const ly = 0.014 * k + Math.sin(ang) * Math.max(0.022 * k, hProfile - 0.014 * k);
        return [footX + lx, ly, z];
      },
      `${side}Foot`,
      [1, 1],
      false,
      false
    );

    // Cleat Traction Sole Plate + Molded Cleat Studs (`cleatSole`)
    sheet(
      S('cleatSole'),
      14,
      8,
      (u, v) => {
        const z = zHeel + cleatLen * v;
        const wProfile = Math.sqrt(Math.max(0.2, Math.sin(Math.PI * Math.min(0.98, 0.08 + v * 0.88))));
        const halfW = 0.054 * k * wProfile;
        const lx = (u - 0.5) * 2 * halfW;
        const edgeLift = Math.abs(u - 0.5) > 0.44 ? 0.014 * k : 0.002 * k;
        return [footX + lx, edgeLift, z];
      },
      `${side}Foot`,
      [1, 1],
      false,
      false
    );

    // Lineman Hinged Knee Braces (`hasKneeBraces`)
    if (spec.hasKneeBraces) {
      buildLimbWrap(
        S('accessory'),
        field,
        kneeAt,
        ankleAt,
        0.04,
        0.22,
        0.017 * k,
        `${side}Leg`,
        16,
        4,
        0.13
      );
      buildLimbWrap(
        S('accessory'),
        field,
        hipAt,
        kneeAt,
        0.84,
        0.96,
        0.019 * k,
        `${side}UpLeg`,
        16,
        3,
        0.15
      );
    }
  }

  // =========================================================================
  // 4. GLOVES, WRIST TAPE, SLEEVES, QB WRISTBAND, ELBOW SLEEVES, NECK ROLL, TOWEL
  // =========================================================================
  for (const side of ['Left', 'Right'] as const) {
    const armAt = J(`${side}Arm` as HumanJoint);
    const elbowAt = J(`${side}ForeArm` as HumanJoint);
    const wristAt = J(`${side}Hand` as HumanJoint);
    const handTip = anatomy.byName[`${side}Hand` as HumanJoint].tip;

    // White athletic wrist tape wrap on both wrists
    buildLimbWrap(
      S('tape'),
      field,
      elbowAt,
      wristAt,
      0.78,
      1.0,
      0.008 * k,
      `${side}ForeArm`,
      14,
      4,
      0.09
    );

    // Fitted Performance Receiver / Lineman Gloves wrapping palm & knuckles
    buildLimbWrap(
      S('gloves'),
      field,
      wristAt,
      handTip,
      -0.05,
      1.12,
      0.007 * k,
      `${side}Hand`,
      14,
      6,
      0.09
    );

    // Compression Arm Sleeve (Skill left arm, Power both arms)
    const wearSleeve = side === 'Left' ? spec.hasLeftSleeve : spec.hasRightSleeve;
    if (wearSleeve) {
      buildLimbWrap(
        S('accessory'),
        field,
        armAt,
        elbowAt,
        0.52,
        1.0,
        0.005 * k,
        `${side}Arm`,
        16,
        5,
        0.12
      );
      buildLimbWrap(
        S('accessory'),
        field,
        elbowAt,
        wristAt,
        0.0,
        0.78,
        0.005 * k,
        `${side}ForeArm`,
        16,
        6,
        0.10
      );
    }

    // Lineman Protective Elbow Sleeves
    if (spec.hasElbowSleeves) {
      buildLimbWrap(
        S('accessory'),
        field,
        armAt,
        elbowAt,
        0.72,
        1.02,
        0.009 * k,
        `${side}Arm`,
        16,
        4,
        0.14
      );
      buildLimbWrap(
        S('accessory'),
        field,
        elbowAt,
        wristAt,
        0.0,
        0.34,
        0.009 * k,
        `${side}ForeArm`,
        16,
        4,
        0.12
      );
    }

    // QB Left Forearm Play-Call Wristband (modeled on Carter #12 sheet!)
    if (spec.hasWristband && side === 'Left') {
      buildLimbWrap(
        S('tape'),
        field,
        elbowAt,
        wristAt,
        0.44,
        0.82,
        0.011 * k,
        'LeftForeArm',
        16,
        4,
        0.10
      );
    }
  }

  // Lineman Heavy Cowboy Neck Roll (`hasNeckRoll`)
  if (spec.hasNeckRoll) {
    const neckAt = J('Neck');
    const rollPts: Vec3[] = [];
    for (let i = 0; i <= 20; i++) {
      // Horseshoe behind & along sides of neck
      const a = Math.PI * 0.18 + (i / 20) * Math.PI * 1.64;
      rollPts.push([
        Math.cos(a) * 0.125 * k,
        neckAt[1] + 0.015 * k - Math.sin(a) * 0.015 * k,
        neckAt[2] - 0.02 * k - Math.abs(Math.sin(a)) * 0.03 * k + Math.sin(a) * 0.06 * k,
      ]);
    }
    tube(S('accessory'), rollPts, 0.032 * k, 10, 'Spine2');
  }

  // Hanging Hip Towel tucked at right waist (`hasTowel` — Carter #12, Jackson #54, Mack #75)
  if (spec.hasTowel) {
    const sHip = sec(yBelt, true);
    const ang = -0.35; // right front-side hip
    const anchorR = sHip.radius(ang) + 0.022 * k;
    const tx = -Math.cos(ang) * anchorR;
    const tz = sHip.cz + Math.sin(ang) * anchorR + 0.03 * k;
    sheet(
      S('towel'),
      6,
      8,
      (u, v) => {
        const w = (u - 0.5) * 0.085 * k;
        const drop = v * 0.29 * k;
        const wave = Math.sin(v * Math.PI * 1.5) * 0.008 * k;
        return [tx - 0.012 * k * v + wave, yBelt - drop, tz + w];
      },
      'Hips',
      [1, 1],
      false,
      false
    );
  }

  // =========================================================================
  // 5. PRO COMPOSITE FOOTBALL HELMET (Rigid on Head Bone — zero stretching!)
  // =========================================================================
  {
    const headBase = J('Head');
    const headTip = anatomy.byName.Head.tip;
    const hCenter: Vec3 = [
      0,
      (headBase[1] + headTip[1]) * 0.5 + 0.012 * k,
      headBase[2] + 0.004 * k,
    ];
    const rx = 0.116 * k;
    const ry = 0.122 * k;
    const rz = 0.132 * k;

    // 5a. Aerodynamic Modern Composite Helmet Shell with sculpted front face opening & lower ear/jaw flaps
    sheet(
      H('helmetShell'),
      36,
      20,
      (u, v) => {
        // u wraps azimuthally from front-right around back to front-left; leave crisp arched face opening in front
        // v = 0 crown top, v = 1 lower shell rim
        const az = (u - 0.5) * Math.PI * 2; // 0 = front (+z), ±PI = back (-z)
        const absAz = Math.abs(az);

        // Front brow stays high over eyes (face opening), sweeps down cleanly into protective jaw/cheek flaps on sides
        const faceCutout = smooth01((0.92 - absAz) / 0.55); // 1 directly in front, 0 at sides/back
        const maxPolar =
          Math.PI * 0.72 -
          faceCutout * Math.PI * 0.34 +
          (absAz > 1.0 && absAz < 2.2 ? 0.10 : 0); // deeper ear/cheek flap

        const polar = 0.02 + v * maxPolar;
        const sinP = Math.sin(polar);
        const cosP = Math.cos(polar);

        // Subtle modern SpeedFlex top flex-vent crease & flared rear nape
        const ventDip =
          polar > 0.18 && polar < 0.72 && absAz > 0.16 && absAz < 0.65 ? -0.0035 * k : 0;
        const rearFlare = absAz > 2.1 && v > 0.65 ? (v - 0.65) * 0.022 * k : 0;

        const x = Math.sin(az) * sinP * (rx + ventDip);
        const y = cosP * (ry + ventDip);
        const z = Math.cos(az) * sinP * (rz + rearFlare);
        return [hCenter[0] + x, hCenter[1] + y, hCenter[2] + z];
      },
      'Head',
      [1, 1],
      false,
      false
    );

    // 5b. Center Metallic Helmet Stripe running from front brow bumper over crown to rear bumper
    sheet(
      H('helmetStripe'),
      6,
      22,
      (u, v) => {
        const w = (u - 0.5) * 0.028 * k;
        // Sweep from front brow (polar = 0.38*PI, az = 0) over top (polar = 0) down back (polar = 0.68*PI, az = PI)
        const arc = -0.37 * Math.PI + v * 1.05 * Math.PI;
        const y = Math.cos(arc) * (ry + 0.0025 * k);
        const z = -Math.sin(arc) * (rz + 0.0025 * k);
        return [hCenter[0] + w, hCenter[1] + y, hCenter[2] + z];
      },
      'Head',
      [1, 1],
      false,
      false
    );

    // 5c. Multi-Bar Curved Tubular Steel Facemask Cage (`facemask`)
    const barR = (spec.facemaskStyle === 'LINEMAN' ? 0.0062 : 0.0052) * k;
    const cageArc = (yOff: number, zOut: number, halfAngle: number, radiusX: number, segs = 14): Vec3[] => {
      const pts: Vec3[] = [];
      for (let i = 0; i <= segs; i++) {
        const a = -halfAngle + (i / segs) * (halfAngle * 2);
        pts.push([
          hCenter[0] + Math.sin(a) * radiusX,
          hCenter[1] + yOff - Math.cos(a) * 0.006 * k,
          hCenter[2] + Math.cos(a) * zOut,
        ]);
      }
      return pts;
    };

    // Upper brow bar, main eye-line bar, lower mouth bar, and chin guard bar
    tube(H('facemask'), cageArc(0.036 * k, rz * 1.18, 0.92, rx * 1.06), barR, 7, 'Head');
    tube(H('facemask'), cageArc(-0.012 * k, rz * 1.28, 1.02, rx * 1.12), barR, 7, 'Head');
    tube(H('facemask'), cageArc(-0.048 * k, rz * 1.24, 0.96, rx * 1.08), barR, 7, 'Head');
    tube(H('facemask'), cageArc(-0.082 * k, rz * 1.12, 0.82, rx * 0.98), barR, 7, 'Head');

    // Outer perimeter side struts connecting brow bar down through chin bar back to helmet cheek flaps
    for (const sx of [-1, 1]) {
      tube(
        H('facemask'),
        [
          [hCenter[0] + sx * rx * 0.92, hCenter[1] + 0.032 * k, hCenter[2] + rz * 0.56],
          [hCenter[0] + sx * rx * 1.04, hCenter[1] - 0.012 * k, hCenter[2] + rz * 0.72],
          [hCenter[0] + sx * rx * 0.98, hCenter[1] - 0.052 * k, hCenter[2] + rz * 0.66],
          [hCenter[0] + sx * rx * 0.78, hCenter[1] - 0.084 * k, hCenter[2] + rz * 0.78],
        ],
        barR,
        7,
        'Head'
      );
    }

    // Vertical nose / jaw reinforcement struts by archetype
    const vertXs =
      spec.facemaskStyle === 'LINEMAN'
        ? [-0.056, -0.022, 0.022, 0.056]
        : spec.facemaskStyle === 'POWER'
        ? [-0.048, 0, 0.048]
        : [-0.044, 0.044];
    for (const vx of vertXs) {
      const ang = Math.asin(Math.max(-0.9, Math.min(0.9, (vx * k) / (rx * 1.12))));
      tube(
        H('facemask'),
        [
          [hCenter[0] + vx * k, hCenter[1] + 0.032 * k, hCenter[2] + Math.cos(ang) * rz * 1.18],
          [hCenter[0] + vx * k, hCenter[1] - 0.012 * k, hCenter[2] + Math.cos(ang) * rz * 1.28],
          [hCenter[0] + vx * k, hCenter[1] - 0.048 * k, hCenter[2] + Math.cos(ang) * rz * 1.24],
          [hCenter[0] + vx * k, hCenter[1] - 0.082 * k, hCenter[2] + Math.cos(ang) * rz * 1.12],
        ],
        barR * 0.9,
        6,
        'Head'
      );
    }

    // Extra mid-grill horizontal bar for Power/Lineman masks
    if (spec.facemaskStyle !== 'SKILL') {
      tube(H('facemask'), cageArc(-0.030 * k, rz * 1.26, 0.88, rx * 1.09), barR * 0.88, 6, 'Head');
    }

    // 5d. Curved Tinted Polycarbonate Eye Visor (`visor`)
    if (spec.hasVisor) {
      sheet(
        H('visor'),
        16,
        6,
        (u, v) => {
          const a = (u - 0.5) * 1.48;
          const y = hCenter[1] + 0.032 * k - v * 0.046 * k;
          const radX = rx * 0.98;
          const radZ = rz * 1.08 + v * 0.008 * k;
          return [hCenter[0] + Math.sin(a) * radX, y, hCenter[2] + Math.cos(a) * radZ];
        },
        'Head',
        [1, 1],
        false,
        false
      );
    }

    // 5e. Contoured Padded Chinstrap Cup & 4 Tension Straps (`chinstrap`)
    sheet(
      H('chinstrap'),
      12,
      5,
      (u, v) => {
        const a = (u - 0.5) * 1.25;
        const y = hCenter[1] - 0.072 * k - v * 0.034 * k;
        const z = hCenter[2] + Math.cos(a) * (rz * 0.92 - v * 0.014 * k);
        return [hCenter[0] + Math.sin(a) * (rx * 0.72), y, z];
      },
      'Head',
      [1, 1],
      false,
      false
    );
    for (const sx of [-1, 1]) {
      // Lower cheek strap
      tube(
        H('chinstrap'),
        [
          [hCenter[0] + sx * rx * 0.56, hCenter[1] - 0.088 * k, hCenter[2] + rz * 0.74],
          [hCenter[0] + sx * rx * 0.98, hCenter[1] - 0.056 * k, hCenter[2] + rz * 0.34],
        ],
        0.0042 * k,
        5,
        'Head'
      );
      // Upper temple buckle strap
      tube(
        H('chinstrap'),
        [
          [hCenter[0] + sx * rx * 0.54, hCenter[1] - 0.074 * k, hCenter[2] + rz * 0.76],
          [hCenter[0] + sx * rx * 1.01, hCenter[1] + 0.015 * k, hCenter[2] + rz * 0.25],
        ],
        0.0040 * k,
        5,
        'Head'
      );
    }
  }

  // =========================================================================
  // 6. HAND GRIP SOCKETS (for attaching the football directly to Right/Left Hand)
  // =========================================================================
  const sockets: FootballWardrobeOut['sockets'] = [];
  for (const side of ['Right', 'Left'] as const) {
    const g = anatomy.grip[side];
    const handAlong = norm(
      sub(anatomy.byName[`${side}Hand` as HumanJoint].tip, anatomy.byName[`${side}Hand` as HumanJoint].at)
    );
    const xAxis = norm(sub(handAlong, mul(g.axis, dot(handAlong, g.axis))));
    const yAxis = norm(g.axis);
    const zAxis = norm(cross(xAxis, yAxis));
    sockets.push({
      name: side === 'Right' ? 'socket_hand_R' : 'socket_hand_L',
      bone: `${side}Hand` as HumanJoint,
      at: g.at,
      rotation: quatFromBasis(xAxis, yAxis, zAxis),
    });
  }

  orientTo(null);
  return { skinned, helmet, sockets };
}
