// Catalogues of everything the runtime understands (drives the authoring UI dropdowns and validation).
// Audio catalogues (sfx ids, instruments, ambience beds) belong to services/living/audio; we feature-detect them so this
// file works before that module lands.
import type { Action, AnimPreset, BurstKind, HapticPattern, Trigger } from '../contracts';
import { ALL_PRESETS } from './anim';
import { BURST_KINDS } from './particles';

export const ANIM_PRESET_LIST: AnimPreset[] = ALL_PRESETS;
export const BURST_KIND_LIST: BurstKind[] = BURST_KINDS;
export const HAPTIC_LIST: HapticPattern[] = ['tap', 'tug', 'soft', 'success', 'knock'];
export const TRIGGER_TYPES: Array<Trigger['type']> = ['enter', 'exit', 'idle', 'tap', 'doubleTap', 'press', 'release', 'drag', 'hover', 'proximity', 'tilt', 'timer', 'when', 'event', 'key'];
export const ACTION_TYPES: Array<Action['do']> = ['animate', 'stop', 'set', 'show', 'hide', 'toggle', 'sfx', 'note', 'music', 'musicStop', 'musicTempo', 'duck', 'ambience', 'depth', 'narrate', 'var', 'goto', 'burst', 'trail', 'follow', 'haptic', 'emit', 'wait', 'if', 'celebrate'];
/** Triggers a person can operate: each needs a `hint` (accessible name). */
export const INTERACTIVE_TRIGGERS: Array<Trigger['type']> = ['tap', 'doubleTap', 'press', 'drag', 'proximity', 'hover', 'tilt'];

export const FALLBACK_SFX = ['beep', 'honk', 'pop', 'boing', 'chime', 'whoosh', 'click', 'knock', 'crunch', 'rustle', 'sparkle', 'celebrate'];
export const FALLBACK_INSTRUMENTS = ['musicbox', 'marimba', 'felt-piano', 'harp', 'pluck', 'flute', 'whistle', 'pad', 'bass', 'kalimba', 'bell', 'glass', 'kazoo', 'drum', 'shaker', 'click', 'choir'];
export const FALLBACK_AMBIENCE = ['night-crickets', 'forest-wind', 'ocean-hum', 'city-murmur', 'room-tone', 'space-drone', 'wind'];

export interface AudioCatalogue { sfx: string[]; instruments: string[]; ambience: string[]; fromAudioModule: boolean }

type Loader = () => Promise<Record<string, unknown> | undefined>;

/** Pull sfx / instrument / ambience id lists out of whatever services/living/audio/catalog exports (arrays, or objects keyed by id). */
export function parseAudioCatalogue(m: Record<string, unknown> | undefined): AudioCatalogue {
  const arr = (v: unknown): string[] | null => Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : (x as { id?: string })?.id).filter((x): x is string => !!x) : (v && typeof v === 'object' ? Object.keys(v as object) : null);
  if (m) {
    const sfx = arr(m.SFX_IDS ?? m.SFX_CATALOG ?? m.sfxIds ?? m.sfxCatalog ?? m.SFX);
    const ins = arr(m.INSTRUMENT_IDS ?? m.INSTRUMENTS ?? m.instrumentIds ?? m.instruments);
    const amb = arr(m.AMBIENCE_IDS ?? m.AMBIENCE_BEDS ?? m.AMBIENCE ?? m.ambienceIds);
    if (sfx || ins || amb) return { sfx: sfx ?? FALLBACK_SFX, instruments: ins ?? FALLBACK_INSTRUMENTS, ambience: amb ?? FALLBACK_AMBIENCE, fromAudioModule: true };
  }
  return { sfx: FALLBACK_SFX, instruments: FALLBACK_INSTRUMENTS, ambience: FALLBACK_AMBIENCE, fromAudioModule: false };
}

/** Feature-detected: pass the browser loader from catalogGlob.ts; without it (node tests) the fallback lists are used. Never throws. */
export async function loadAudioCatalogue(loader?: Loader): Promise<AudioCatalogue> {
  try { return parseAudioCatalogue(loader ? await loader() : undefined); } catch { return parseAudioCatalogue(undefined); }
}
