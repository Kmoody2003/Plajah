/**
 * Holistic Ora Wellbeing & Affective Pacing Engine for Academia Games.
 *
 * Mirrors Plajah's core Ora privacy contract (services/oraEdu.ts):
 *  - A learner's "Weather Inside You" check-in stays strictly private (never sent to teachers/parents).
 *  - Non-invasive interaction rhythm (gentle retry count — zero webcam/biometric surveillance) triggers
 *    an invitational "Tea-House Pause" (Ma Moment) instead of red error flashes or lost lives.
 *  - Age-calibrated Dusk Bell pacing protects attention, eyes, and sleep instead of endless-scroll addiction.
 */

import type { AtmospherePreset, GradeBand, OraMood } from './contracts';

export interface MoodOption {
  mood: OraMood;
  label: string;
  weatherWord: string;
  atmosphere: AtmospherePreset;
  /** Gentle pacing multiplier (>1 means slower, calmer animation and extra breathing room). */
  calmFactor: number;
  note: string;
}

export const ORA_MOOD_OPTIONS: readonly MoodOption[] = [
  { mood: 1, label: 'Stormy', weatherWord: 'Heavy sky', atmosphere: 'rain', calmFactor: 1.35, note: 'Soft lantern glow & unhurried rain conservatory pacing.' },
  { mood: 2, label: 'Rainy', weatherWord: 'Quiet mist', atmosphere: 'rain', calmFactor: 1.2, note: 'Cozy rain patter and gentle step-by-step hints.' },
  { mood: 3, label: 'Cloudy', weatherWord: 'Soft clouds', atmosphere: 'dusk', calmFactor: 1.1, note: 'Warm twilight calm with steady focus rhythm.' },
  { mood: 4, label: 'Fair', weatherWord: 'Clear breeze', atmosphere: 'sunlit', calmFactor: 1.0, note: 'Sunlit meadow warmth and open curiosity.' },
  { mood: 5, label: 'Sunny', weatherWord: 'Bright morning', atmosphere: 'sunlit', calmFactor: 0.95, note: 'Crisp sunlit morning energy across the valley.' },
];

export const moodOptionFor = (mood: OraMood): MoodOption =>
  ORA_MOOD_OPTIONS.find(m => m.mood === mood) ?? ORA_MOOD_OPTIONS[3];

/** Age-calibrated healthy deep-focus session length (minutes) before the Dusk Bell gently chimes. */
export const DUSK_BELL_MINUTES: Record<GradeBand, number> = {
  prek2: 12,
  g35: 20,
  g68: 25,
  g912: 30,
};

export interface PacingState {
  struggleStreak: number;
  lastMissAt: number;
  maMomentSuggested: boolean;
  maMomentsTaken: number;
  sessionStartedAt: number;
  duskBellDismissed: boolean;
}

export function createPacingState(now = Date.now()): PacingState {
  return {
    struggleStreak: 0,
    lastMissAt: 0,
    maMomentSuggested: false,
    maMomentsTaken: 0,
    sessionStartedAt: now,
    duskBellDismissed: false,
  };
}

/**
 * Record an exploratory miss. Never docks lives or scores; after 3 consecutive stumbles
 * (or 2 rapid stumbles when learner checked in Stormy/Rainy), softly suggests a Tea-House Pause.
 */
export function recordStruggle(state: PacingState, mood: OraMood | null, now = Date.now()): PacingState {
  const threshold = mood !== null && mood <= 2 ? 2 : 3;
  const nextStreak = state.struggleStreak + 1;
  return {
    ...state,
    struggleStreak: nextStreak,
    lastMissAt: now,
    maMomentSuggested: state.maMomentSuggested || nextStreak >= threshold,
  };
}

export function recordMastery(state: PacingState): PacingState {
  return { ...state, struggleStreak: 0, maMomentSuggested: false };
}

export function completeMaMoment(state: PacingState): PacingState {
  return { ...state, struggleStreak: 0, maMomentSuggested: false, maMomentsTaken: state.maMomentsTaken + 1 };
}

export function isDuskBellDue(state: PacingState, band: GradeBand, now = Date.now()): boolean {
  if (state.duskBellDismissed) return false;
  const elapsedMin = (now - state.sessionStartedAt) / 60_000;
  return elapsedMin >= DUSK_BELL_MINUTES[band];
}

export interface BreathFrame {
  phase: 'inhale' | 'hold' | 'exhale';
  label: string;
  /** 0..1 expansion ratio for the golden firefly ring. */
  expansion: number;
}

/** Smooth 4s inhale -> 2s gentle hold -> 4s exhale breathing curve (10s cycle). */
export function breathFrameAt(elapsedSec: number): BreathFrame {
  const cyc = ((elapsedSec % 10) + 10) % 10;
  if (cyc < 4) {
    const u = cyc / 4;
    return { phase: 'inhale', label: 'Inhale slowly…', expansion: 0.5 - 0.5 * Math.cos(u * Math.PI) };
  }
  if (cyc < 6) {
    return { phase: 'hold', label: 'Rest gently…', expansion: 1 };
  }
  const u = (cyc - 6) / 4;
  return { phase: 'exhale', label: 'Exhale softly…', expansion: 1 - (0.5 - 0.5 * Math.cos(u * Math.PI)) };
}
