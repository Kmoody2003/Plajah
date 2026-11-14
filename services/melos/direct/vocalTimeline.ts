// Chora Direct — Phase 3 Vocal Track timeline helpers.
//
// Thin, pure state-transition and summary helpers wrapping `vocalScore.ts` for the
// Timeline vocal track panel and guide-MIDI bounce/preview workflows.

import type { SongBrief } from './songBrief';
import {
  editNote,
  layoutVocal,
  movePhrase,
  regenRequest,
  retextPhrase,
  setDelivery,
  splitPhrase,
  staleRegions,
  vocalGuideNotes,
  type VocalLayer,
  type VocalNote,
  type VocalRegenRequest,
  type VocalRegion,
  type VocalVoice,
} from './vocalScore';

export interface VocalStaleSummary {
  staleRegions: VocalRegion[];
  requests: VocalRegenRequest[];
  stalePhraseIds: Set<string>;
  guideNotes: ReturnType<typeof vocalGuideNotes>;
}

export interface MidiClipNote {
  id: string;
  startBeats: number;
  lengthBeats: number;
  key: number;
  vel: number;
}

/**
 * Returns `existing` when it is a valid VocalLayer with at least one phrase;
 * otherwise lays out a fresh VocalLayer from `brief`.
 */
export function ensureVocalLayer(
  brief: SongBrief,
  existing?: VocalLayer | null,
  voice?: VocalVoice,
): VocalLayer {
  if (
    existing &&
    existing.voice &&
    Array.isArray(existing.phrases) &&
    existing.phrases.length > 0
  ) {
    return existing;
  }
  return layoutVocal(brief, voice);
}

/** Retype a phrase's lyrics inline on the timeline, preserving melody shape. */
export function applyVocalPhraseRetext(
  layer: VocalLayer,
  phraseId: string,
  text: string,
): VocalLayer {
  return retextPhrase(layer, phraseId, text);
}

/** Slide a phrase in time by `deltaBeats` (clamped so it never starts before beat 0). */
export function applyVocalPhraseMove(
  layer: VocalLayer,
  phraseId: string,
  deltaBeats: number,
): VocalLayer {
  const target = layer.phrases.find((p) => p.id === phraseId);
  if (!target || deltaBeats === 0) return layer;
  const clampedDelta = Math.max(-target.startBeats, deltaBeats);
  if (clampedDelta === 0) return layer;
  return movePhrase(layer, phraseId, clampedDelta);
}

/** Split a phrase into two independent phrases before `noteId`. */
export function applyVocalPhraseSplit(
  layer: VocalLayer,
  phraseId: string,
  noteId: string,
): VocalLayer {
  return splitPhrase(layer, phraseId, noteId);
}

/** Update delivery tags ("whispered", "belted", "falsetto", etc.) on a phrase. */
export function applyVocalPhraseDelivery(
  layer: VocalLayer,
  phraseId: string,
  delivery: string[],
): VocalLayer {
  return setDelivery(layer, phraseId, delivery);
}

/** Edit a single note's pitch, timing, velocity, marks, or syllable. */
export function applyVocalNoteEdit(
  layer: VocalLayer,
  phraseId: string,
  noteId: string,
  patch: Partial<Pick<VocalNote, 'key' | 'startBeats' | 'lengthBeats' | 'vel' | 'marks' | 'syllable'>>,
): VocalLayer {
  return editNote(layer, phraseId, noteId, patch);
}

/**
 * Compute all dirty/unrendered vocal regions, their engine regeneration requests,
 * the set of stale/unrendered phrase IDs, and the flattened guide melody notes.
 */
export function getVocalStaleSummary(
  layer: VocalLayer,
  brief: SongBrief,
): VocalStaleSummary {
  const regions = staleRegions(layer);
  const requests = regions.map((region) => regenRequest(layer, region, brief));
  const stalePhraseIds = new Set<string>(regions.flatMap((r) => r.phraseIds));
  const guideNotes = vocalGuideNotes(layer);
  return {
    staleRegions: regions,
    requests,
    stalePhraseIds,
    guideNotes,
  };
}

/**
 * Convert the vocal layer's guide melody into MIDI clip notes suitable for
 * guide-melody preview or bouncing onto any `GrooveDoc` instrument track.
 */
export function vocalNotesToMidiClipNotes(layer: VocalLayer): MidiClipNote[] {
  return vocalGuideNotes(layer).map((note, index) => ({
    id: `vn_${index}_${Math.round(note.startBeats * 1000)}`,
    startBeats: note.startBeats,
    lengthBeats: note.lengthBeats,
    key: note.key,
    vel: note.vel,
  }));
}
