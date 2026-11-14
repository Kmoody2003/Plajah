// What a look's gallery thumbnail shows at a moment in time. It runs the preset through the same
// lookFromPreset and applyEffects the stage uses, on a small virtual rig, so a tile moves the way
// the look really moves. The one difference is on purpose: flashing is slowed for the thumbnails,
// because a screen full of them must stay under the 3 flashes a second accessibility limit.

import { BUILTIN_PROFILES } from './fixtureProfiles';
import { addFixtures, applyEffects, clamp01, emptyShow, lerpLook, previewColor, type Effect, type Look, type PatchedFixture } from './boardCore';
import { lookFromPreset, type LookCategory, type LookPreset } from './looks';

export const MAX_PREVIEW_FLASH_RATE = 120;   // cycles a minute: 2 a second
const FLASHING = new Set(['flicker', 'strobe', 'twinkle', 'chase']);
const HOLD_S = 3.5;
const FADE_OUT_S = 0.4;

const RIG_SIZE: Record<LookCategory, number> = { Concert: 7, Effects: 7, Worship: 7, Theatre: 7, Broadcast: 7, Architecture: 6, Christmas: 14, Home: 2 };

const washHead = BUILTIN_PROFILES.find((p) => p.id === 'wash-15')!;
const rigs = new Map<number, PatchedFixture[]>();
const rigOf = (size: number) => {
  let rig = rigs.get(size);
  if (!rig) { rig = addFixtures(emptyShow(), washHead, size).fixtures; rigs.set(size, rig); }
  return rig;
};

export interface PreviewFixture {
  css: string;
  /** 0..1 brightness. */
  on: number;
  /** Beam direction: across the stage, down, towards the viewer. */
  x: number;
  y: number;
  z: number;
}

interface Baked { look: Look; effects: Effect[]; rig: PatchedFixture[]; offset: number; period: number; fade: number }
const baked = new Map<string, Baked>();

function bake(preset: LookPreset): Baked {
  let b = baked.get(preset.id);
  if (!b) {
    const rig = rigOf(RIG_SIZE[preset.category]);
    const { look, effects } = lookFromPreset(preset, rig, []);
    const fade = Math.min(2.5, Math.max(0.15, preset.fade));
    let hash = 0;
    for (const ch of preset.id) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
    b = {
      look, rig, fade,
      effects: effects.map((e) => (FLASHING.has(e.kind) ? { ...e, rate: Math.min(e.rate, MAX_PREVIEW_FLASH_RATE) } : e)),
      // Tiles start at different points so the shelf doesn't pulse in unison.
      offset: (hash / 997) * 6,
      period: fade + HOLD_S + FADE_OUT_S,
    };
    baked.set(preset.id, b);
  }
  return b;
}

/** Fade the look up at its own fade time, hold it, drop out, repeat. */
export function previewEnvelope(seconds: number, fade: number, period: number): number {
  const t = ((seconds % period) + period) % period;
  if (t < fade) return t / fade;
  return clamp01((period - t) / FADE_OUT_S);
}

export function previewFrame(preset: LookPreset, seconds: number): PreviewFixture[] {
  const b = bake(preset);
  const clock = seconds + b.offset;
  const up = previewEnvelope(clock, b.fade, b.period);
  const look = applyEffects(lerpLook({}, b.look, up), b.effects, b.rig, [], clock);
  return b.rig.map((f, i) => {
    const levels = look[f.id];
    const { css, on } = previewColor(levels, washHead);
    const tilt = ((levels?.tilt ?? 0.5) - 0.5) * (270 * Math.PI / 180);
    const pan = ((levels?.pan ?? 0.5) - 0.5) * (540 * Math.PI / 180);
    // Haze drifting through the beam, so a held look still feels alive.
    const drift = 0.93 + 0.07 * Math.sin(clock * 1.7 + i * 1.3);
    return { css, on: on * drift, x: Math.sin(tilt) * Math.cos(pan), y: Math.cos(tilt), z: Math.sin(tilt) * Math.sin(pan) };
  });
}

/** A frame with the look fully up, for people who've asked for reduced motion. */
export const restingFrame = (preset: LookPreset) => {
  const b = bake(preset);
  return previewFrame(preset, b.fade + 1 - b.offset);
};
