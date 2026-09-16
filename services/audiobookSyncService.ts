/** Recording-specific alignment. Literary text is a reference, never a timing source. */
import type { ArchiveTrack } from './archiveContentService';
import type { Album } from '../types';
import { validAlignment } from './vaultAccuracy';
export interface TimestampedPassage { id: string; chapterIndex: number; start: number; end: number; heading?: string; text: string; timed?: boolean }
export interface SynchronizedWord { word: string; globalIdx: number; start: number; end: number; passageIdx: number }
export const generateCalibratedPassages = (text: string, _duration: number, chapterIndex = 0): TimestampedPassage[] =>
  (text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map((text, i) => ({ id: `reference-${i}`, chapterIndex, start: 0, end: 0, text, timed: false }));
export const getPassagesForAudiobook = (track: ArchiveTrack, album: Album | null | undefined, chapterIdx: number, duration: number, dynamicChapterText?: string | null, _chapterTitle?: string): TimestampedPassage[] => {
  const audioUrl = track.chapters?.[chapterIdx]?.url || (chapterIdx === 0 ? track.url : '');
  const alignment = track.audioAlignment;
  if (validAlignment(alignment, audioUrl, chapterIdx)) return alignment.cues.map((c, i) => ({ ...c, id: `aligned-${i}`, chapterIndex: chapterIdx, timed: true }));
  // Only text explicitly matched by the reader or carried on this chapter is eligible.
  const text = dynamicChapterText || (track.chapters?.[chapterIdx] as any)?.content || '';
  return generateCalibratedPassages(text, duration, chapterIdx);
};
export const tokenizePassagesToWords = (passages: TimestampedPassage[]): SynchronizedWord[] => {
  const result: SynchronizedWord[] = [];
  passages.forEach((p, passageIdx) => p.text.split(/\s+/).filter(Boolean).forEach(word => {
    // A phrase cue does not establish individual word timing. Highlight the phrase together.
    result.push({ word, globalIdx: result.length, start: p.start, end: p.end, passageIdx });
  }));
  return result;
};
export const getActiveWordIndex = (words: SynchronizedWord[], time: number) => words.findIndex(w => time >= w.start && time < w.end);