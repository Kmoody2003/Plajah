import { TeamInfo } from '../types';

export const TEAMS: Record<string, TeamInfo> = {
  AURORA: {
    id: 'AURORA',
    name: 'Aurora',
    city: 'Solaris',
    primaryColor: '#8b2fc9', // Rich purple
    secondaryColor: '#ea580c', // Fiery orange accent
    accentColor: '#c084fc',
    textColor: '#ffffff',
    helmetColor: '#6b21a8',
    visorColor: '#fbbf24',
    score: 0,
  },
  CURRENT: {
    id: 'CURRENT',
    name: 'Current',
    city: 'Cascade',
    primaryColor: '#06b6d4', // Cyan
    secondaryColor: '#0284c7', // Ocean blue
    accentColor: '#67e8f9',
    textColor: '#ffffff',
    helmetColor: '#0891b2',
    visorColor: '#22d3ee',
    score: 0,
  },
  VALIANT: {
    id: 'VALIANT',
    name: 'Valiant',
    city: 'Metro',
    primaryColor: '#e11d48', // Crimson
    secondaryColor: '#f59e0b', // Amber gold
    accentColor: '#fda4af',
    textColor: '#ffffff',
    helmetColor: '#be123c',
    visorColor: '#fcd34d',
    score: 0,
  },
  TITAN: {
    id: 'TITAN',
    name: 'Titan',
    city: 'Forge',
    primaryColor: '#334155', // Slate obsidian
    secondaryColor: '#10b981', // Emerald green
    accentColor: '#94a3b8',
    textColor: '#ffffff',
    helmetColor: '#1e293b',
    visorColor: '#34d399',
    score: 0,
  },
};

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
  BULLET_PASS_SPEED: 30.0, // yards/sec
  LOB_PASS_SPEED: 21.0,
  PASS_ARC_BULLET: 2.2,
  PASS_ARC_LOB: 7.5,
  POCKET_TIME_LIMIT: 6.5, // seconds before pocket collapses
  QB_SCRAMBLE_SPEED: 6.5,
  RECEIVER_SPEED: 7.8,
  DEFENDER_SPEED: 7.5,
};
