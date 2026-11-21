import {
  DefensePlayType,
  DriveState,
  OffensiveFormation,
  PlayCategory,
  PlayType,
  Player3D,
  TeamInfo,
} from '../types';
import { PHYSICS } from './constants';

export interface PlayDiagramPath {
  from: [number, number]; // SVG normalized 0..100
  points: [number, number][];
  color: string;
  dashed?: boolean;
  isBlock?: boolean;
}

export interface OffensivePlayDefinition {
  id: PlayType;
  name: string;
  shortName: string;
  formation: OffensiveFormation;
  formationLabel: string;
  category: PlayCategory;
  description: string;
  coachTip: string;
  idealSituation: string;
  runTargetGapX?: number;
  handoffType?: 'DIVE' | 'SWEEP_RIGHT' | 'COUNTER_LEFT' | 'OPTION_READ' | 'JET_SWEEP';
  isPlayAction?: boolean;
  diagram: PlayDiagramPath[];
}

export interface DefensivePlayDefinition {
  id: DefensePlayType;
  name: string;
  shortName: string;
  shellLabel: string;
  category: 'ZONE' | 'MAN' | 'BLITZ' | 'GOAL_LINE';
  description: string;
  coachTip: string;
  diagram: PlayDiagramPath[];
}

export const OFFENSIVE_PLAYBOOK: OffensivePlayDefinition[] = [
  {
    id: 'PASS_SLANTS',
    name: 'Quick Slants',
    shortName: 'Slants',
    formation: 'SHOTGUN_SPREAD',
    formationLabel: 'Shotgun Spread',
    category: 'PASS',
    description: 'Fast inside slants paired with a seam streak and RB flat outlet.',
    coachTip: 'Beats blitzes fast! Hit target [1] right as they break inside.',
    idealSituation: '1st & 10 · Beats Blitz',
    diagram: [
      { from: [15, 76], points: [[15, 58], [42, 34]], color: '#38bdf8' },
      { from: [34, 76], points: [[34, 48], [46, 16]], color: '#fbbf24' },
      { from: [85, 76], points: [[85, 56], [96, 52]], color: '#f472b6' },
      { from: [44, 88], points: [[28, 78], [14, 62]], color: '#34d399', dashed: true },
    ],
  },
  {
    id: 'PASS_POST_OUT',
    name: 'Post & Speed Out',
    shortName: 'Post / Out',
    formation: 'SHOTGUN_SPREAD',
    formationLabel: 'Shotgun Spread',
    category: 'PASS',
    description: 'Deep post splits safeties while outside receivers attack sideline windows.',
    coachTip: 'Watch the deep safety: if they bite inside, throw the [3] sideline out!',
    idealSituation: '2nd & Medium · Sideline',
    diagram: [
      { from: [15, 76], points: [[15, 42], [44, 14]], color: '#38bdf8' },
      { from: [36, 76], points: [[36, 58], [64, 54]], color: '#fbbf24' },
      { from: [85, 76], points: [[85, 44], [97, 38]], color: '#f472b6' },
      { from: [44, 88], points: [[24, 72], [18, 56]], color: '#34d399', dashed: true },
    ],
  },
  {
    id: 'PASS_VERTS',
    name: 'Four Verticals',
    shortName: '4 Verts',
    formation: 'EMPTY_TRIPS',
    formationLabel: 'Shotgun Verticals',
    category: 'PASS',
    description: 'Four vertical seams stretch the deep secondary down the field.',
    coachTip: 'Wait 1.5s for the slot [2] to clear linebackers, or loft a deep Touch Lob!',
    idealSituation: '3rd & Long · Deep Shot',
    diagram: [
      { from: [14, 76], points: [[14, 14]], color: '#38bdf8' },
      { from: [36, 76], points: [[38, 16]], color: '#fbbf24' },
      { from: [86, 76], points: [[86, 14]], color: '#f472b6' },
      { from: [60, 88], points: [[64, 52], [62, 18]], color: '#34d399' },
    ],
  },
  {
    id: 'PASS_MESH',
    name: 'Mesh Traffic',
    shortName: 'Mesh',
    formation: 'SHOTGUN_SPREAD',
    formationLabel: 'Shotgun Trips',
    category: 'PASS',
    description: 'Crossing drags create natural traffic picks against Man coverage.',
    coachTip: 'Against Man-to-Man, [1] and [2] cross underneath and shake defenders free.',
    idealSituation: '3rd & Short · Beats Man',
    diagram: [
      { from: [18, 76], points: [[18, 60], [72, 56]], color: '#38bdf8' },
      { from: [66, 76], points: [[66, 62], [24, 56]], color: '#fbbf24' },
      { from: [86, 76], points: [[86, 36], [70, 18]], color: '#f472b6' },
      { from: [44, 88], points: [[74, 76], [88, 56]], color: '#34d399', dashed: true },
    ],
  },
  {
    id: 'PASS_FLOOD',
    name: 'Tri-Level Flood',
    shortName: 'Flood Right',
    formation: 'SINGLEBACK_ACE',
    formationLabel: 'Singleback Ace',
    category: 'PASS',
    description: 'Overloads the right sideline at three depths: flat, corner, and clear-out go.',
    coachTip: 'Read high-to-low on the right side: deep [3], corner [2], or RB flat [4].',
    idealSituation: 'Beats Zone Coverage',
    diagram: [
      { from: [14, 76], points: [[14, 52], [44, 48]], color: '#38bdf8' },
      { from: [68, 76], points: [[68, 48], [92, 26]], color: '#fbbf24' },
      { from: [86, 76], points: [[86, 16]], color: '#f472b6' },
      { from: [50, 88], points: [[72, 74], [92, 62]], color: '#34d399', dashed: true },
    ],
  },
  {
    id: 'PASS_SCREEN',
    name: 'RB Slip Screen',
    shortName: 'HB Screen',
    formation: 'SHOTGUN_SPREAD',
    formationLabel: 'Shotgun Spread',
    category: 'PASS',
    description: 'Receivers clear out deep while RB slips wide behind a wall of blockers.',
    coachTip: 'Let the rush get close, then tap [4] for easy open-field yards!',
    idealSituation: 'Counter Heavy Rush',
    diagram: [
      { from: [16, 76], points: [[16, 20]], color: '#38bdf8' },
      { from: [36, 76], points: [[36, 24]], color: '#fbbf24' },
      { from: [84, 76], points: [[84, 24]], color: '#f472b6' },
      { from: [42, 88], points: [[22, 84], [14, 62]], color: '#34d399' },
    ],
  },
  {
    id: 'PASS_PA_DAGGER',
    name: 'PA Deep Dagger',
    shortName: 'PA Dagger',
    formation: 'I_FORM_PRO',
    formationLabel: 'I-Form Pro',
    category: 'PLAY_ACTION',
    description: 'Play-action fake freezes linebackers before firing deep over the middle.',
    coachTip: 'Great after running the ball! [2] cuts behind the frozen linebackers.',
    idealSituation: '1st & 10 · Big Gain',
    isPlayAction: true,
    diagram: [
      { from: [14, 76], points: [[14, 22]], color: '#38bdf8' },
      { from: [84, 76], points: [[84, 46], [42, 28]], color: '#fbbf24' },
      { from: [65, 76], points: [[65, 58], [88, 52]], color: '#f472b6' },
      { from: [50, 90], points: [[50, 78]], color: '#f97316', dashed: true },
    ],
  },
  {
    id: 'PASS_GOAL_FADE',
    name: 'Red Zone Fade & Corner',
    shortName: 'Goal Fade',
    formation: 'GOAL_LINE',
    formationLabel: 'Red Zone Ace',
    category: 'PASS',
    description: 'High-point fade to the back pylon plus tight end corner & drag.',
    coachTip: 'Use Touch Lob on [1] or [3] near the end-zone corner pylon!',
    idealSituation: 'Red Zone / Goal Line',
    diagram: [
      { from: [14, 76], points: [[10, 22]], color: '#38bdf8' },
      { from: [36, 76], points: [[36, 62], [68, 56]], color: '#fbbf24' },
      { from: [86, 76], points: [[92, 24]], color: '#f472b6' },
      { from: [50, 88], points: [[28, 72], [14, 58]], color: '#34d399' },
    ],
  },
  {
    id: 'PASS_HAIL_MARY',
    name: 'SOL Hail Mary',
    shortName: 'Hail Mary',
    formation: 'EMPTY_TRIPS',
    formationLabel: 'Empty Trips',
    category: 'PASS',
    description: 'All receivers flood the deep end zone for an all-or-nothing heave.',
    coachTip: 'Roll out to buy time, then loft a Touch Lob toward the end zone!',
    idealSituation: 'Desperation · Deep Bomb',
    diagram: [
      { from: [14, 76], points: [[26, 12]], color: '#38bdf8' },
      { from: [34, 76], points: [[46, 12]], color: '#fbbf24' },
      { from: [86, 76], points: [[64, 12]], color: '#f472b6' },
      { from: [68, 76], points: [[78, 14]], color: '#34d399' },
    ],
  },
  {
    id: 'RUN_HB_DIVE',
    name: 'HB Inside Dive',
    shortName: 'HB Dive',
    formation: 'I_FORM_PRO',
    formationLabel: 'I-Form Pro',
    category: 'RUN',
    description: 'Quick downhill handoff behind the guard and center into the A-gap.',
    coachTip: 'Follow your center and truck [F] or juke [Space] past the linebacker!',
    idealSituation: 'Short Yardage · Safe',
    handoffType: 'DIVE',
    runTargetGapX: 1.0,
    diagram: [
      { from: [50, 90], points: [[50, 78], [54, 42]], color: '#ff8c00' },
      { from: [46, 76], points: [[42, 62]], color: '#94a3b8', isBlock: true },
      { from: [54, 76], points: [[58, 62]], color: '#94a3b8', isBlock: true },
    ],
  },
  {
    id: 'RUN_HB_SWEEP',
    name: 'HB Toss Sweep',
    shortName: 'HB Sweep',
    formation: 'SINGLEBACK_ACE',
    formationLabel: 'Singleback Ace',
    category: 'RUN',
    description: 'Outside pitch to the speedy RB racing around the right edge.',
    coachTip: 'Sprint [Shift] to the right corner before cutting upfield!',
    idealSituation: '1st & 10 · Speed Edge',
    handoffType: 'SWEEP_RIGHT',
    runTargetGapX: 11.0,
    diagram: [
      { from: [50, 88], points: [[78, 76], [88, 34]], color: '#ff8c00' },
      { from: [66, 76], points: [[78, 62]], color: '#94a3b8', isBlock: true },
      { from: [86, 76], points: [[86, 48]], color: '#38bdf8', dashed: true },
    ],
  },
  {
    id: 'RUN_COUNTER',
    name: 'Counter Trap',
    shortName: 'Counter',
    formation: 'SINGLEBACK_ACE',
    formationLabel: 'Singleback',
    category: 'RUN',
    description: 'Misdirection step right before slashing hard back through the left B-gap.',
    coachTip: 'Wait half a beat for the pulling guard, then hit the left crease!',
    idealSituation: '2nd & Short · Misdirection',
    handoffType: 'COUNTER_LEFT',
    runTargetGapX: -4.5,
    diagram: [
      { from: [50, 88], points: [[58, 82], [38, 66], [30, 32]], color: '#ff8c00' },
      { from: [36, 76], points: [[30, 62]], color: '#94a3b8', isBlock: true },
    ],
  },
  {
    id: 'RUN_READ_OPTION',
    name: 'QB Read Option',
    shortName: 'QB Option',
    formation: 'SHOTGUN_SPREAD',
    formationLabel: 'Shotgun',
    category: 'RUN',
    description: 'Quick-hitting QB keeper/option with wide spacing and spin lanes.',
    coachTip: 'Steer around the unblocked end and fire upfield with Sprint [Shift]!',
    idealSituation: 'Mobile QB · Surprise',
    handoffType: 'OPTION_READ',
    runTargetGapX: -7.0,
    diagram: [
      { from: [50, 84], points: [[34, 72], [24, 30]], color: '#ff8c00' },
      { from: [42, 84], points: [[64, 70], [74, 48]], color: '#34d399', dashed: true },
    ],
  },
  {
    id: 'RUN_JET_SWEEP',
    name: 'WR Jet Sweep',
    shortName: 'Jet Sweep',
    formation: 'SHOTGUN_SPREAD',
    formationLabel: 'Shotgun Jet',
    category: 'RUN',
    description: 'Explosive handoff to your fastest receiver streaking across the formation.',
    coachTip: 'Use your receiver speed on the perimeter — save Juke [Space] for the safety!',
    idealSituation: '1st & 10 · Explosive',
    handoffType: 'JET_SWEEP',
    runTargetGapX: 13.0,
    diagram: [
      { from: [18, 76], points: [[50, 80], [84, 68], [90, 26]], color: '#ff8c00' },
      { from: [86, 76], points: [[80, 56]], color: '#94a3b8', isBlock: true },
    ],
  },
  {
    id: 'ST_FIELD_GOAL',
    name: 'Field Goal Unit',
    shortName: 'Field Goal',
    formation: 'SPECIAL_TEAMS',
    formationLabel: 'Special Teams',
    category: 'SPECIAL',
    description: 'Line up for a 3-point Field Goal using the precision Kick Meter.',
    coachTip: 'Stop the meter near the top for max power, then hit the green center zone!',
    idealSituation: '4th Down · Inside Opp 40',
    diagram: [
      { from: [50, 86], points: [[50, 14]], color: '#fbbf24' },
    ],
  },
  {
    id: 'ST_PUNT',
    name: 'Punt Unit',
    shortName: 'Punt',
    formation: 'SPECIAL_TEAMS',
    formationLabel: 'Special Teams',
    category: 'SPECIAL',
    description: 'Flip field position and pin the opponent deep in their own territory.',
    coachTip: 'Smart tactical play on 4th down outside Field Goal range.',
    idealSituation: '4th Down · Own Side',
    diagram: [
      { from: [50, 88], points: [[50, 18]], color: '#00daf3', dashed: true },
    ],
  },
];

export const DEFENSIVE_PLAYBOOK: DefensivePlayDefinition[] = [
  {
    id: 'DEF_COVER_2',
    name: 'Cover 2 Zone',
    shortName: 'Cover 2',
    shellLabel: 'Nickel 4-2-5',
    category: 'ZONE',
    description: 'Two deep safeties split the deep field while LBs & corners blanket underneath.',
    coachTip: 'Balanced zone defense: limits big plays while watching short flats.',
    diagram: [
      { from: [20, 68], points: [[16, 48]], color: '#38bdf8' },
      { from: [80, 68], points: [[84, 48]], color: '#38bdf8' },
      { from: [36, 40], points: [[28, 16]], color: '#a855f7' },
      { from: [64, 40], points: [[72, 16]], color: '#a855f7' },
      { from: [50, 64], points: [[50, 48]], color: '#fbbf24' },
    ],
  },
  {
    id: 'DEF_COVER_3',
    name: 'Cover 3 Sky',
    shortName: 'Cover 3',
    shellLabel: '4-3 Base',
    category: 'ZONE',
    description: 'Three deep defenders guard thirds while strong safety drops into run support.',
    coachTip: 'Great against both deep vertical passes and outside sweeps.',
    diagram: [
      { from: [16, 62], points: [[16, 18]], color: '#38bdf8' },
      { from: [50, 32], points: [[50, 14]], color: '#38bdf8' },
      { from: [84, 62], points: [[84, 18]], color: '#38bdf8' },
      { from: [66, 46], points: [[72, 58]], color: '#fbbf24' },
    ],
  },
  {
    id: 'DEF_COVER_1_MAN',
    name: 'Cover 1 Man Press',
    shortName: 'Cover 1 Man',
    shellLabel: 'Man Lock',
    category: 'MAN',
    description: 'Tight man-to-man coverage across all receivers with one high free safety.',
    coachTip: 'Suffocates quick slants & outs — user the linebacker over the middle!',
    diagram: [
      { from: [16, 68], points: [[18, 42]], color: '#f472b6' },
      { from: [36, 68], points: [[38, 44]], color: '#f472b6' },
      { from: [84, 68], points: [[82, 42]], color: '#f472b6' },
      { from: [50, 34], points: [[50, 16]], color: '#38bdf8' },
    ],
  },
  {
    id: 'DEF_BLITZ_ZERO',
    name: 'SOL A-Gap Blitz',
    shortName: 'Zero Blitz',
    shellLabel: 'All-Out Blitz',
    category: 'BLITZ',
    description: 'Send 6 rushers after the QB to force a sack or rushed throw.',
    coachTip: 'High risk, high reward! Great on 3rd & Long or pinned near their goal line.',
    diagram: [
      { from: [40, 72], points: [[46, 92]], color: '#ef4444' },
      { from: [60, 72], points: [[54, 92]], color: '#ef4444' },
      { from: [36, 64], points: [[44, 90]], color: '#ef4444' },
      { from: [64, 64], points: [[56, 90]], color: '#ef4444' },
    ],
  },
  {
    id: 'DEF_GOAL_LINE',
    name: 'Goal Line Stuff',
    shortName: 'Goal Line',
    shellLabel: 'Heavy Front',
    category: 'GOAL_LINE',
    description: 'Stacked box shuts down inside dives and short-yardage power runs.',
    coachTip: 'Call this inside the 10 or on 3rd/4th & 1 to stonewall the run!',
    diagram: [
      { from: [32, 74], points: [[34, 86]], color: '#ef4444' },
      { from: [44, 74], points: [[46, 86]], color: '#ef4444' },
      { from: [56, 74], points: [[54, 86]], color: '#ef4444' },
      { from: [68, 74], points: [[66, 86]], color: '#ef4444' },
    ],
  },
  {
    id: 'DEF_PREVENT',
    name: 'Deep Prevent',
    shortName: 'Prevent',
    shellLabel: '3 Deep Shell',
    category: 'ZONE',
    description: 'Deep umbrella coverage keeps everything in front to prevent late bombs.',
    coachTip: 'Protects a late lead against Hail Mary and Four Verticals.',
    diagram: [
      { from: [18, 42], points: [[18, 12]], color: '#38bdf8' },
      { from: [50, 26], points: [[50, 10]], color: '#38bdf8' },
      { from: [82, 42], points: [[82, 12]], color: '#38bdf8' },
    ],
  },
];

export function getOffensivePlayDef(id: PlayType): OffensivePlayDefinition {
  return OFFENSIVE_PLAYBOOK.find((p) => p.id === id) || OFFENSIVE_PLAYBOOK[0];
}

export function getDefensivePlayDef(id: DefensePlayType): DefensivePlayDefinition {
  return DEFENSIVE_PLAYBOOK.find((p) => p.id === id) || DEFENSIVE_PLAYBOOK[0];
}

export function recommendCoachPlay(drive: DriveState): PlayType {
  if (drive.down === 4) {
    if (drive.ballYardLine >= 63) return 'ST_FIELD_GOAL';
    if (drive.quarter >= 4 && drive.offenseTeam.score < drive.defenseTeam.score) {
      return drive.yardsToGo <= 4 ? 'PASS_SLANTS' : 'PASS_POST_OUT';
    }
    return 'ST_PUNT';
  }
  if (drive.ballYardLine >= 88) {
    return drive.down === 1 ? 'RUN_HB_DIVE' : 'PASS_GOAL_FADE';
  }
  if (drive.yardsToGo <= 3) {
    return drive.down % 2 === 1 ? 'RUN_HB_DIVE' : 'PASS_MESH';
  }
  if (drive.yardsToGo >= 9) {
    return drive.down === 3 ? 'PASS_POST_OUT' : 'PASS_VERTS';
  }
  if (drive.down === 1) return 'RUN_HB_SWEEP';
  return 'PASS_SLANTS';
}

export function recommendDefensePlay(drive: DriveState): DefensePlayType {
  if (drive.ballYardLine >= 90 || drive.yardsToGo <= 2) return 'DEF_GOAL_LINE';
  if (drive.yardsToGo >= 12) return 'DEF_COVER_3';
  if (drive.down === 3 && drive.yardsToGo >= 6) return 'DEF_BLITZ_ZERO';
  return 'DEF_COVER_2';
}

export function chooseCpuOffensePlay(drive: DriveState): PlayType {
  if (drive.down === 4) {
    if (drive.ballYardLine >= 64) return 'ST_FIELD_GOAL';
    if (drive.quarter >= 4 && drive.offenseTeam.score < drive.defenseTeam.score && (drive.gameClockSeconds ?? 120) < 150) {
      return 'PASS_POST_OUT';
    }
    return 'ST_PUNT';
  }
  const pool: PlayType[] =
    drive.ballYardLine >= 88
      ? ['RUN_HB_DIVE', 'PASS_GOAL_FADE', 'PASS_SLANTS', 'RUN_READ_OPTION']
      : drive.yardsToGo <= 3
      ? ['RUN_HB_DIVE', 'RUN_COUNTER', 'PASS_SLANTS', 'PASS_MESH']
      : drive.yardsToGo >= 9
      ? ['PASS_POST_OUT', 'PASS_VERTS', 'PASS_FLOOD', 'PASS_PA_DAGGER']
      : ['PASS_SLANTS', 'RUN_HB_SWEEP', 'PASS_FLOOD', 'PASS_PA_DAGGER', 'RUN_READ_OPTION', 'PASS_SCREEN'];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function chooseCpuDefensePlay(drive: DriveState): DefensePlayType {
  if (drive.ballYardLine >= 92 || drive.yardsToGo <= 2) {
    return Math.random() < 0.7 ? 'DEF_GOAL_LINE' : 'DEF_COVER_1_MAN';
  }
  if (drive.yardsToGo >= 14) {
    return Math.random() < 0.4 ? 'DEF_PREVENT' : 'DEF_COVER_3';
  }
  const pool: DefensePlayType[] = ['DEF_COVER_2', 'DEF_COVER_3', 'DEF_COVER_1_MAN', 'DEF_BLITZ_ZERO'];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function buildOffenseRosterForPlay(
  playType: PlayType,
  losZ: number,
  team: TeamInfo,
  speedScale: number = 1.0
): { players: Player3D[]; isUnderCenter: boolean } {
  const stars = team.starPlayers;
  const qbName = stars?.qb.name || 'V. Vance';
  const qbNum = stars?.qb.number ?? 7;
  const qbSpeed = (stars?.qb.speed ?? PHYSICS.QB_SCRAMBLE_SPEED) * speedScale;
  const rbName = stars?.rb.name || 'M. Hayes';
  const rbNum = stars?.rb.number ?? 22;
  const rbSpeed = (stars?.rb.speed ?? 8.9) * speedScale;
  const wr1Name = stars?.wr1.name || 'D. Cross';
  const wr1Num = stars?.wr1.number ?? 84;
  const wr1Speed = (stars?.wr1.speed ?? 9.2) * speedScale;
  const wr2Name = stars?.wr2.name || 'K. Mercer';
  const wr2Num = stars?.wr2.number ?? 11;
  const wr2Speed = (stars?.wr2.speed ?? 9.0) * speedScale;
  const teName = stars?.te.name || 'J. Banks';
  const teNum = stars?.te.number ?? 88;
  const teSpeed = (stars?.te.speed ?? 8.2) * speedScale;

  const def = getOffensivePlayDef(playType);
  const isUnderCenter =
    def.formation === 'I_FORM_PRO' ||
    def.formation === 'SINGLEBACK_ACE' ||
    def.formation === 'GOAL_LINE';

  const players: Player3D[] = [];

  const qbZ = isUnderCenter ? losZ - 2.0 : losZ - 4.8;
  players.push({
    id: 'QB_1',
    team: 'OFFENSE',
    role: 'QB',
    number: qbNum,
    name: qbName,
    x: 0,
    y: 0,
    z: qbZ,
    targetX: 0,
    targetZ: qbZ,
    vx: 0,
    vz: 0,
    speed: qbSpeed,
    heading: 0,
    state: 'STANCE',
    hasBall: true,
    rating: stars?.qb.rating ?? 88,
    bulkScale: 0.96,
    heightScale: 1.01,
  });

  const oLineSpacing = [-3.8, -1.9, 0, 1.9, 3.8];
  const oLineLabels = ['LT', 'LG', 'C', 'RG', 'RT'];
  oLineSpacing.forEach((xOffset, idx) => {
    players.push({
      id: `OL_${idx}`,
      team: 'OFFENSE',
      role: 'OL',
      number: 62 + idx * 3,
      name: `${oLineLabels[idx]} #${62 + idx * 3}`,
      x: xOffset,
      y: 0,
      z: losZ - 0.7,
      targetX: xOffset,
      targetZ: losZ - 0.7,
      vx: 0,
      vz: 0,
      speed: 4.1 * speedScale,
      heading: 0,
      state: 'STANCE',
      bulkScale: 1.28,
      heightScale: 1.04,
      rating: team.ratings?.off ?? 86,
    });
  });

  const addTarget = (
    id: string,
    role: 'WR' | 'TE' | 'RB',
    number: number,
    name: string,
    x: number,
    z: number,
    speed: number,
    position: NonNullable<Player3D['route']>['position'],
    targetKey: '1' | '2' | '3' | '4',
    waypoints: { x: number; z: number; speed: number }[],
    bulkScale = 0.94
  ) => {
    players.push({
      id,
      team: 'OFFENSE',
      role,
      number,
      name,
      x,
      y: 0,
      z,
      targetX: x,
      targetZ: z,
      vx: 0,
      vz: 0,
      speed,
      heading: 0,
      state: 'STANCE',
      bulkScale,
      heightScale: role === 'TE' ? 1.04 : 0.99,
      route: {
        id: `ROUTE_${targetKey}`,
        number,
        name,
        label: `Pass ${targetKey} · ${name}`,
        position,
        targetKey,
        waypoints,
        currentWaypointIdx: 0,
        separation: 0.7,
        isOpen: false,
        isCovered: false,
        contestedChance: 0.25,
      },
    });
  };

  const rbX = isUnderCenter ? 0 : -2.6;
  const rbZ = isUnderCenter ? losZ - 6.2 : losZ - 4.8;

  switch (playType) {
    case 'PASS_SLANTS': {
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -18.5, losZ - 0.2, wr1Speed, 'WR_LEFT', '1', [
        { x: -18.5, z: losZ + 3.2, speed: wr1Speed },
        { x: -4.5, z: losZ + 8.5, speed: wr1Speed * 1.04 },
        { x: 5.0, z: losZ + 14.0, speed: wr1Speed },
      ]);
      addTarget('WR_2', 'WR', wr2Num, wr2Name, -6.0, losZ - 0.5, wr2Speed, 'SLOT_MID', '2', [
        { x: -5.0, z: losZ + 7.0, speed: wr2Speed },
        { x: -1.5, z: losZ + 17.0, speed: wr2Speed * 1.06 },
        { x: 0.5, z: losZ + 28.0, speed: wr2Speed * 1.08 },
      ]);
      addTarget('WR_3', 'TE', teNum, teName, 17.5, losZ - 0.2, teSpeed, 'WR_RIGHT', '3', [
        { x: 17.5, z: losZ + 5.5, speed: teSpeed },
        { x: 23.5, z: losZ + 6.5, speed: teSpeed * 1.05 },
      ], 1.06);
      addTarget('RB_1', 'RB', rbNum, rbName, rbX, rbZ, rbSpeed, 'RB', '4', [
        { x: -6.5, z: losZ - 1.0, speed: rbSpeed * 0.85 },
        { x: -14.5, z: losZ + 2.5, speed: rbSpeed },
        { x: -16.0, z: losZ + 9.0, speed: rbSpeed },
      ], 1.02);
      break;
    }

    case 'PASS_POST_OUT': {
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -18.5, losZ - 0.2, wr1Speed, 'WR_LEFT', '1', [
        { x: -18.5, z: losZ + 11.0, speed: wr1Speed },
        { x: -2.0, z: losZ + 26.0, speed: wr1Speed * 1.08 },
      ]);
      addTarget('WR_2', 'WR', wr2Num, wr2Name, -5.0, losZ - 0.5, wr2Speed, 'SLOT_MID', '2', [
        { x: -5.0, z: losZ + 5.0, speed: wr2Speed },
        { x: 7.5, z: losZ + 6.5, speed: wr2Speed },
      ]);
      addTarget('WR_3', 'TE', teNum, teName, 17.5, losZ - 0.2, teSpeed, 'WR_RIGHT', '3', [
        { x: 17.5, z: losZ + 10.5, speed: teSpeed },
        { x: 24.2, z: losZ + 12.5, speed: teSpeed * 1.06 },
      ], 1.06);
      addTarget('RB_1', 'RB', rbNum, rbName, rbX, rbZ, rbSpeed, 'RB', '4', [
        { x: -6.0, z: losZ + 1.0, speed: rbSpeed * 0.88 },
        { x: -13.0, z: losZ + 4.5, speed: rbSpeed },
      ], 1.02);
      break;
    }

    case 'PASS_VERTS':
    case 'PASS_HAIL_MARY': {
      const deepDist = playType === 'PASS_HAIL_MARY' ? 48.0 : 34.0;
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -19.0, losZ - 0.2, wr1Speed * 1.05, 'WR_LEFT', '1', [
        { x: playType === 'PASS_HAIL_MARY' ? -8.0 : -19.0, z: losZ + deepDist, speed: wr1Speed * 1.08 },
      ]);
      addTarget('WR_2', 'WR', wr2Num, wr2Name, -6.5, losZ - 0.5, wr2Speed * 1.04, 'SLOT_MID', '2', [
        { x: -3.5, z: losZ + deepDist - 2, speed: wr2Speed * 1.06 },
      ]);
      addTarget('WR_3', 'TE', teNum, teName, 18.5, losZ - 0.2, teSpeed, 'WR_RIGHT', '3', [
        { x: playType === 'PASS_HAIL_MARY' ? 8.0 : 18.5, z: losZ + deepDist, speed: teSpeed * 1.05 },
      ], 1.06);
      addTarget('RB_1', 'RB', rbNum, rbName, 4.5, losZ - 1.2, rbSpeed, 'RB', '4', [
        { x: 5.5, z: losZ + 8.0, speed: rbSpeed },
        { x: playType === 'PASS_HAIL_MARY' ? 2.5 : 5.5, z: losZ + (playType === 'PASS_HAIL_MARY' ? 44 : 26), speed: rbSpeed },
      ], 1.02);
      break;
    }

    case 'PASS_MESH': {
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -16.5, losZ - 0.2, wr1Speed, 'WR_LEFT', '1', [
        { x: -12.0, z: losZ + 4.5, speed: wr1Speed },
        { x: 10.0, z: losZ + 6.0, speed: wr1Speed * 1.06 },
      ]);
      addTarget('WR_2', 'WR', wr2Num, wr2Name, 7.5, losZ - 0.5, wr2Speed, 'SLOT_MID', '2', [
        { x: 6.0, z: losZ + 4.0, speed: wr2Speed },
        { x: -13.0, z: losZ + 5.8, speed: wr2Speed * 1.05 },
      ]);
      addTarget('WR_3', 'TE', teNum, teName, 18.0, losZ - 0.2, teSpeed, 'WR_RIGHT', '3', [
        { x: 18.0, z: losZ + 12.0, speed: teSpeed },
        { x: 8.5, z: losZ + 22.0, speed: teSpeed * 1.05 },
      ], 1.06);
      addTarget('RB_1', 'RB', rbNum, rbName, rbX, rbZ, rbSpeed, 'RB', '4', [
        { x: 6.5, z: losZ + 0.5, speed: rbSpeed },
        { x: 16.5, z: losZ + 4.0, speed: rbSpeed },
      ], 1.02);
      break;
    }

    case 'PASS_FLOOD': {
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -18.0, losZ - 0.2, wr1Speed, 'WR_LEFT', '1', [
        { x: -18.0, z: losZ + 6.5, speed: wr1Speed },
        { x: -2.0, z: losZ + 8.5, speed: wr1Speed },
      ]);
      addTarget('WR_2', 'TE', teNum, teName, 6.2, losZ - 0.4, teSpeed, 'TE', '2', [
        { x: 6.5, z: losZ + 10.0, speed: teSpeed },
        { x: 22.0, z: losZ + 19.0, speed: teSpeed * 1.04 },
      ], 1.06);
      addTarget('WR_3', 'WR', wr2Num, wr2Name, 18.5, losZ - 0.2, wr2Speed, 'WR_RIGHT', '3', [
        { x: 18.5, z: losZ + 30.0, speed: wr2Speed * 1.06 },
      ]);
      addTarget('RB_1', 'RB', rbNum, rbName, rbX, rbZ, rbSpeed, 'RB', '4', [
        { x: 8.0, z: losZ + 1.5, speed: rbSpeed },
        { x: 20.0, z: losZ + 4.5, speed: rbSpeed },
      ], 1.02);
      break;
    }

    case 'PASS_SCREEN': {
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -17.5, losZ - 0.2, wr1Speed, 'WR_LEFT', '1', [
        { x: -17.5, z: losZ + 22.0, speed: wr1Speed },
      ]);
      addTarget('WR_2', 'WR', wr2Num, wr2Name, -6.0, losZ - 0.5, wr2Speed, 'SLOT_MID', '2', [
        { x: -4.0, z: losZ + 18.0, speed: wr2Speed },
      ]);
      addTarget('WR_3', 'TE', teNum, teName, 17.0, losZ - 0.2, teSpeed, 'WR_RIGHT', '3', [
        { x: 17.0, z: losZ + 20.0, speed: teSpeed },
      ], 1.06);
      addTarget('RB_1', 'RB', rbNum, rbName, -3.5, losZ - 4.2, rbSpeed, 'RB', '4', [
        { x: -11.5, z: losZ - 2.0, speed: rbSpeed * 0.9 },
        { x: -15.5, z: losZ + 2.5, speed: rbSpeed * 1.05 },
        { x: -17.5, z: losZ + 12.0, speed: rbSpeed * 1.08 },
      ], 1.02);
      break;
    }

    case 'PASS_PA_DAGGER': {
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -18.5, losZ - 0.2, wr1Speed, 'WR_LEFT', '1', [
        { x: -18.5, z: losZ + 28.0, speed: wr1Speed * 1.06 },
      ]);
      addTarget('WR_2', 'WR', wr2Num, wr2Name, 16.0, losZ - 0.4, wr2Speed, 'SLOT_MID', '2', [
        { x: 16.0, z: losZ + 11.5, speed: wr2Speed },
        { x: -4.0, z: losZ + 21.0, speed: wr2Speed * 1.08 },
      ]);
      addTarget('WR_3', 'TE', teNum, teName, 5.8, losZ - 0.6, teSpeed, 'TE', '3', [
        { x: 6.5, z: losZ + 5.0, speed: teSpeed },
        { x: 18.0, z: losZ + 7.5, speed: teSpeed },
      ], 1.08);
      addTarget('RB_1', 'RB', rbNum, rbName, 0, losZ - 6.0, rbSpeed, 'RB', '4', [
        { x: -2.0, z: losZ - 1.5, speed: rbSpeed * 0.85 },
        { x: -10.5, z: losZ + 4.5, speed: rbSpeed },
      ], 1.02);
      break;
    }

    case 'PASS_GOAL_FADE': {
      addTarget('WR_1', 'WR', wr1Num, wr1Name, -18.0, losZ - 0.2, wr1Speed, 'WR_LEFT', '1', [
        { x: -21.5, z: losZ + 14.0, speed: wr1Speed * 1.05 },
      ]);
      addTarget('WR_2', 'WR', wr2Num, wr2Name, -5.5, losZ - 0.5, wr2Speed, 'SLOT_MID', '2', [
        { x: -5.0, z: losZ + 4.0, speed: wr2Speed },
        { x: 8.5, z: losZ + 6.5, speed: wr2Speed },
      ]);
      addTarget('WR_3', 'TE', teNum, teName, 17.5, losZ - 0.2, teSpeed, 'WR_RIGHT', '3', [
        { x: 21.5, z: losZ + 14.0, speed: teSpeed * 1.04 },
      ], 1.08);
      addTarget('RB_1', 'RB', rbNum, rbName, 0, losZ - 5.5, rbSpeed, 'RB', '4', [
        { x: -8.0, z: losZ + 1.5, speed: rbSpeed },
        { x: -14.0, z: losZ + 4.5, speed: rbSpeed },
      ], 1.02);
      break;
    }

    case 'RUN_HB_DIVE':
    case 'RUN_HB_SWEEP':
    case 'RUN_COUNTER':
    case 'RUN_READ_OPTION':
    case 'RUN_JET_SWEEP': {
      const jetStart = playType === 'RUN_JET_SWEEP';
      addTarget(
        'WR_1',
        'WR',
        wr1Num,
        wr1Name,
        jetStart ? -11.0 : -17.5,
        jetStart ? losZ - 1.6 : losZ - 0.2,
        wr1Speed * (jetStart ? 1.08 : 0.95),
        'WR_LEFT',
        '1',
        jetStart
          ? [
              { x: 4.0, z: losZ - 1.5, speed: wr1Speed * 1.08 },
              { x: 15.0, z: losZ + 4.0, speed: wr1Speed * 1.1 },
              { x: 17.0, z: losZ + 22.0, speed: wr1Speed * 1.1 },
            ]
          : [{ x: -16.5, z: losZ + 10.0, speed: wr1Speed * 0.9 }]
      );
      addTarget('WR_2', 'TE', teNum, teName, 5.8, losZ - 0.5, teSpeed * 0.9, 'TE', '2', [
        { x: 7.5, z: losZ + 5.5, speed: teSpeed * 0.9 },
      ], 1.08);
      addTarget('WR_3', 'WR', wr2Num, wr2Name, 17.5, losZ - 0.2, wr2Speed * 0.95, 'WR_RIGHT', '3', [
        { x: 16.0, z: losZ + 10.0, speed: wr2Speed * 0.9 },
      ]);
      addTarget(
        'RB_1',
        'RB',
        rbNum,
        rbName,
        rbX,
        rbZ,
        rbSpeed * 1.04,
        'RB',
        '4',
        playType === 'RUN_HB_SWEEP'
          ? [
              { x: 8.5, z: losZ - 2.0, speed: rbSpeed * 1.05 },
              { x: 14.5, z: losZ + 6.0, speed: rbSpeed * 1.08 },
            ]
          : playType === 'RUN_COUNTER'
          ? [
              { x: 2.2, z: losZ - 4.0, speed: rbSpeed * 0.95 },
              { x: -4.2, z: losZ + 1.5, speed: rbSpeed * 1.06 },
              { x: -6.0, z: losZ + 14.0, speed: rbSpeed * 1.08 },
            ]
          : playType === 'RUN_READ_OPTION'
          ? [
              { x: 4.5, z: losZ - 1.5, speed: rbSpeed },
              { x: 8.0, z: losZ + 10.0, speed: rbSpeed },
            ]
          : [
              { x: 1.0, z: losZ + 0.5, speed: rbSpeed * 1.05 },
              { x: 1.5, z: losZ + 14.0, speed: rbSpeed * 1.08 },
            ],
        1.04
      );
      break;
    }

    case 'ST_FIELD_GOAL':
    case 'ST_PUNT': {
      const isPunt = playType === 'ST_PUNT';
      const kStar = stars?.k;
      players[0].z = losZ - (isPunt ? 13.5 : 7.5);
      players[0].targetZ = players[0].z;
      players[0].role = 'K';
      players[0].number = kStar?.number ?? 3;
      players[0].name = kStar?.name || 'S. Solis';
      addTarget('WR_1', 'TE', teNum, teName, -5.8, losZ - 0.9, teSpeed, 'TE', '1', [
        { x: -5.8, z: losZ + (isPunt ? 25 : 2), speed: teSpeed },
      ], 1.1);
      addTarget('WR_2', 'WR', wr1Num, wr1Name, -11.5, losZ - 0.5, wr1Speed, 'WR_LEFT', '2', [
        { x: -11.5, z: losZ + (isPunt ? 28 : 2), speed: wr1Speed },
      ]);
      addTarget('WR_3', 'WR', wr2Num, wr2Name, 5.8, losZ - 0.9, wr2Speed, 'TE', '3', [
        { x: 5.8, z: losZ + (isPunt ? 25 : 2), speed: wr2Speed },
      ], 1.1);
      addTarget('RB_1', 'RB', rbNum, rbName, 2.2, losZ - 5.5, rbSpeed, 'RB', '4', [
        { x: 2.2, z: losZ + (isPunt ? 18 : -5.5), speed: rbSpeed },
      ], 1.05);
      break;
    }
  }

  return { players, isUnderCenter };
}

export function buildDefenseRosterForPlay(
  defPlay: DefensePlayType,
  losZ: number,
  offensePlayers: Player3D[],
  team: TeamInfo,
  speedScale: number = 1.0
): Player3D[] {
  const stars = team.starPlayers;
  const edgeSpeed = (stars?.edge.speed ?? 8.0) * speedScale;
  const mlbSpeed = (stars?.mlb.speed ?? 8.3) * speedScale;
  const cbSpeed = (stars?.cb1.speed ?? 9.2) * speedScale;
  const fsSpeed = (stars?.fs.speed ?? 8.9) * speedScale;
  const defRating = team.ratings?.def ?? 87;

  const defenders: Player3D[] = [];
  const wrs = offensePlayers.filter((p) => p.role === 'WR' || p.role === 'TE');

  const dLineX = [-4.1, -1.5, 1.5, 4.1];
  const dlLabels = ['RE', 'DT', 'NT', 'LE'];
  dLineX.forEach((x, idx) => {
    defenders.push({
      id: `DL_${idx}`,
      team: 'DEFENSE',
      role: 'DL',
      number: idx === 0 ? (stars?.edge.number ?? 99) : 91 + idx * 2,
      name: idx === 0 ? (stars?.edge.name || 'RE #99') : `${dlLabels[idx]} #${91 + idx * 2}`,
      x,
      y: 0,
      z: losZ + 1.05,
      targetX: x,
      targetZ: losZ + 1.05,
      vx: 0,
      vz: 0,
      speed: idx === 0 || idx === 3 ? edgeSpeed : 6.4 * speedScale,
      heading: Math.PI,
      state: 'STANCE',
      bulkScale: idx === 1 || idx === 2 ? 1.3 : 1.15,
      heightScale: 1.04,
      rating: defRating,
      assignmentType: 'RUSH',
      isBlitzer: true,
    });
  });

  const lbDepth = defPlay === 'DEF_GOAL_LINE' ? 2.6 : defPlay === 'DEF_PREVENT' ? 7.5 : 4.4;
  defenders.push({
    id: 'LB_1',
    team: 'DEFENSE',
    role: 'LB',
    number: stars?.mlb.number ?? 54,
    name: stars?.mlb.name || 'MLB #54',
    x: -1.5,
    y: 0,
    z: losZ + lbDepth,
    targetX: -1.5,
    targetZ: losZ + lbDepth,
    vx: 0,
    vz: 0,
    speed: mlbSpeed,
    heading: Math.PI,
    state: 'STANCE',
    bulkScale: 1.1,
    heightScale: 1.02,
    rating: stars?.mlb.rating ?? defRating,
    isBlitzer: defPlay === 'DEF_BLITZ_ZERO',
    assignmentType: defPlay === 'DEF_BLITZ_ZERO' ? 'RUSH' : 'ZONE_HOOK',
    zoneAnchor: { x: -2.0, zOffset: defPlay === 'DEF_PREVENT' ? 11.0 : 5.5 },
  });

  defenders.push({
    id: 'LB_2',
    team: 'DEFENSE',
    role: 'LB',
    number: 58,
    name: 'WLB #58',
    x: 3.4,
    y: 0,
    z: losZ + lbDepth,
    targetX: 3.4,
    targetZ: losZ + lbDepth,
    vx: 0,
    vz: 0,
    speed: mlbSpeed * 0.98,
    heading: Math.PI,
    state: 'STANCE',
    bulkScale: 1.08,
    heightScale: 1.01,
    rating: defRating - 2,
    isBlitzer: defPlay === 'DEF_BLITZ_ZERO' || defPlay === 'DEF_GOAL_LINE',
    assignmentType: defPlay === 'DEF_BLITZ_ZERO' ? 'RUSH' : 'ZONE_HOOK',
    zoneAnchor: { x: 4.5, zOffset: defPlay === 'DEF_PREVENT' ? 11.0 : 6.0 },
  });

  const cushion =
    defPlay === 'DEF_COVER_1_MAN' || defPlay === 'DEF_BLITZ_ZERO'
      ? 3.2
      : defPlay === 'DEF_GOAL_LINE'
      ? 2.8
      : defPlay === 'DEF_PREVENT'
      ? 11.5
      : 5.5;

  wrs.slice(0, 3).forEach((wr, idx) => {
    const isMan =
      defPlay === 'DEF_COVER_1_MAN' ||
      defPlay === 'DEF_BLITZ_ZERO' ||
      defPlay === 'DEF_GOAL_LINE';
    const isDeepThird = defPlay === 'DEF_COVER_3' || defPlay === 'DEF_PREVENT';

    defenders.push({
      id: `CB_${idx}`,
      team: 'DEFENSE',
      role: 'CB',
      number: idx === 0 ? (stars?.cb1.number ?? 21) : 24 + idx * 3,
      name: idx === 0 ? (stars?.cb1.name || 'CB #21') : `CB #${24 + idx * 3}`,
      x: wr.x,
      y: 0,
      z: losZ + cushion,
      targetX: wr.x,
      targetZ: losZ + cushion,
      vx: 0,
      vz: 0,
      speed: cbSpeed,
      heading: Math.PI,
      state: 'STANCE',
      bulkScale: 0.92,
      heightScale: 0.99,
      rating: stars?.cb1.rating ?? defRating,
      assignedDefenderId: wr.id,
      assignmentType: isMan ? 'MAN' : isDeepThird && idx !== 1 ? 'ZONE_DEEP' : 'ZONE_FLAT',
      zoneAnchor: {
        x: idx === 0 ? -15 : idx === 2 ? 15 : 0,
        zOffset: isDeepThird && idx !== 1 ? 19.0 : 5.5,
      },
    });
  });

  const fsDepth = defPlay === 'DEF_PREVENT' ? 24.0 : defPlay === 'DEF_GOAL_LINE' ? 7.5 : 16.0;
  defenders.push({
    id: 'FS_1',
    team: 'DEFENSE',
    role: 'S',
    number: stars?.fs.number ?? 31,
    name: stars?.fs.name || 'FS #31',
    x: defPlay === 'DEF_COVER_2' ? -9.5 : 0,
    y: 0,
    z: losZ + fsDepth,
    targetX: defPlay === 'DEF_COVER_2' ? -9.5 : 0,
    targetZ: losZ + fsDepth,
    vx: 0,
    vz: 0,
    speed: fsSpeed,
    heading: Math.PI,
    state: 'STANCE',
    bulkScale: 0.96,
    heightScale: 1.0,
    rating: stars?.fs.rating ?? defRating,
    assignmentType: 'ZONE_DEEP',
    zoneAnchor: {
      x: defPlay === 'DEF_COVER_2' ? -11.0 : 0,
      zOffset: defPlay === 'DEF_PREVENT' ? 30.0 : 21.0,
    },
  });

  const ssDepth =
    defPlay === 'DEF_COVER_2' ? 16.0 : defPlay === 'DEF_PREVENT' ? 22.0 : defPlay === 'DEF_GOAL_LINE' ? 6.0 : 9.5;
  const rb = offensePlayers.find((p) => p.role === 'RB');
  defenders.push({
    id: 'SS_1',
    team: 'DEFENSE',
    role: 'S',
    number: 33,
    name: 'SS #33',
    x: defPlay === 'DEF_COVER_2' ? 9.5 : 5.5,
    y: 0,
    z: losZ + ssDepth,
    targetX: defPlay === 'DEF_COVER_2' ? 9.5 : 5.5,
    targetZ: losZ + ssDepth,
    vx: 0,
    vz: 0,
    speed: fsSpeed * 0.98,
    heading: Math.PI,
    state: 'STANCE',
    bulkScale: 1.0,
    heightScale: 1.0,
    rating: defRating - 1,
    assignedDefenderId: defPlay === 'DEF_BLITZ_ZERO' && rb ? rb.id : undefined,
    assignmentType:
      defPlay === 'DEF_BLITZ_ZERO'
        ? 'MAN'
        : defPlay === 'DEF_COVER_2' || defPlay === 'DEF_PREVENT'
        ? 'ZONE_DEEP'
        : 'ZONE_HOOK',
    zoneAnchor: {
      x: defPlay === 'DEF_COVER_2' ? 11.0 : 7.0,
      zOffset: defPlay === 'DEF_COVER_2' ? 20.0 : defPlay === 'DEF_PREVENT' ? 26.0 : 9.0,
    },
  });

  return defenders;
}
