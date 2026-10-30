// Sending a lesson to a live class: key-free, in pieces small enough for the data channel.

import type { IngestedCurriculumUnit } from './curriculumIngestionService';
import { withoutKeys } from './christianEdSync';

export interface LessonChunk { id: string; i: number; n: number; data: string }

// One data-channel message stays well under the ~256 KB SCTP drop; browsers are safest at 16 KB.
const CHUNK_CHARS = 16_000;

/** What a student's device receives: never an answer key, nor the teacher's copy of the raw source. */
export function liveLessonCopy(unit: IngestedCurriculumUnit): IngestedCurriculumUnit {
  const { rawCurriculumText: _raw, sacredLibrarySupplements: _deeper, ...rest } = withoutKeys(unit);
  return rest as IngestedCurriculumUnit;
}

export function lessonChunks(unit: IngestedCurriculumUnit): LessonChunk[] {
  const json = JSON.stringify(liveLessonCopy(unit));
  const n = Math.max(1, Math.ceil(json.length / CHUNK_CHARS));
  return Array.from({ length: n }, (_, i) => ({ id: unit.id, i, n, data: json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) }));
}

/** Rebuilds a lesson from its chunks; returns it once the last one is in. */
export function lessonAssembler() {
  let id = '';
  let parts: string[] = [];
  return (c: LessonChunk): IngestedCurriculumUnit | null => {
    if (!c || typeof c.data !== 'string' || !(c.n > 0) || c.i < 0 || c.i >= c.n) return null;
    if (c.id !== id || parts.length !== c.n) { id = c.id; parts = new Array(c.n).fill(''); }
    parts[c.i] = c.data;
    if (parts.some(p => !p)) return null;
    try { return JSON.parse(parts.join('')) as IngestedCurriculumUnit; } catch { parts = []; return null; }
  };
}
