/**
 * Warm Acoustic Chamber Audio Engine for Plajah Academia & Elevate Games (Phase 0).
 *
 * Strictly gesture-gated WebAudio synthesizer designed around Kenne's sonic standard from Kith Quest:
 *  - Warm felt piano, plucked harp/kora, wooden marimba, and soft filtered meadow wind.
 *  - ZERO harsh metallic bells, arcade buzzers, or fatiguing high-frequency sheen.
 *  - Clean adapter seam so full Chora Studio LYRA/TONOS orchestral stems can replace synth voices later.
 */

import { childrensSpeechText } from '../aria/childrensSpeech';

let audioCtx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Play a single warm plucked wooden-harp / felt-piano tone (low-pass mellow envelope). */
export function playWarmPluck(freq: number, enabled: boolean, opts?: { duration?: number; volume?: number }): void {
  if (!enabled) return;
  const ctx = ensureContext();
  if (!ctx) return;

  const dur = opts?.duration ?? 1.15;
  const vol = opts?.volume ?? 0.085;
  const now = ctx.currentTime;

  const body = ctx.createOscillator();
  const warmSub = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  body.type = 'triangle';
  warmSub.type = 'sine';
  body.frequency.setValueAtTime(freq, now);
  warmSub.frequency.setValueAtTime(freq * 0.5, now);

  // Soft felt low-pass rolloff avoids any glassy/metallic overtones
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1020, now);
  filter.frequency.exponentialRampToValueAtTime(280, now + dur);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.028);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  body.connect(filter);
  warmSub.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  body.start(now);
  warmSub.start(now);
  body.stop(now + dur + 0.06);
  warmSub.stop(now + dur + 0.06);
}

/** Soft pentatonic wooden chord when a learner solves a quest or completes a discovery. */
export function playDiscoveryCadence(enabled: boolean): void {
  if (!enabled) return;
  const notes = [261.63, 329.63, 392.0, 523.25]; // C4 · E4 · G4 · C5
  notes.forEach((f, idx) => {
    setTimeout(() => playWarmPluck(f, true, { duration: 1.45, volume: 0.07 }), idx * 115);
  });
}

/** Gentle warm woodblock tap for wooden letter tiles & brass detents. */
export function playWoodTap(enabled: boolean, pitchOffset = 0): void {
  playWarmPluck(220 + pitchOffset * 28, enabled, { duration: 0.35, volume: 0.06 });
}

/** Soft sustained low-warm pad note for the Ora Tea-House breathing circle. */
export function playBreathSwell(enabled: boolean, phase: 'inhale' | 'hold' | 'exhale'): void {
  if (!enabled) return;
  const freq = phase === 'inhale' ? 196.0 : phase === 'hold' ? 246.94 : 164.81;
  playWarmPluck(freq, true, { duration: 2.6, volume: 0.05 });
}

/**
 * Warm storybook read-aloud using Plajah's childrensSpeech pronunciation & tone cleaner
 * with browser Web Speech synthesis (zero silent cloud TTS calls).
 */
export function speakStorybookLine(raw: string, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const clean = childrensSpeechText(raw);
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.88;
    u.pitch = 1.02;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech synthesis unavailable */
  }
}
