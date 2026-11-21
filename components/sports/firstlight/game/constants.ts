import { SOL_TEAMS } from './leagueData';

export const TEAMS = SOL_TEAMS;

export const FIELD = {
  LENGTH: 120, // 100 yards + 2 * 10-yard end zones
  WIDTH: 53.33,
  PLAYING_LENGTH: 100,
  END_ZONE_DEPTH: 10,
  HASH_OFFSET: 3.0,
  YARD_TO_UNITS: 1.0, // 1 yard = 1 Three.js unit
};

export const PHYSICS = {
  GRAVITY: -10.725, // 9.80665 m/s² in yard-based world units
  BULLET_PASS_SPEED: 31.0, // yards/sec
  LOB_PASS_SPEED: 20.5,
  PASS_ARC_BULLET: 2.2,
  PASS_ARC_LOB: 7.5,
  POCKET_TIME_LIMIT: 6.5, // default pocket window (scaled by SkillConfig)
  QB_SCRAMBLE_SPEED: 6.8,
  RECEIVER_SPEED: 8.2,
  DEFENDER_SPEED: 7.8,
};
