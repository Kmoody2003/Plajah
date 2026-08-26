// handwritingLetters — the reference letter models for Penna, in the normalized 100 × 140 box
// used by handwritingFormEngine (guide lines: cap y=15, midline y=75, baseline y=125).
//
// Ordered developmentally, following the Handwriting Without Tears sequence: pre-writing strokes
// first, then capitals (which all start at the top), then lowercase. Each stroke's point order
// encodes the taught direction. This is the Phase-1 curated set; the full A–Z + digits extend it.

import { line, arc, type LetterModel } from '../services/handwritingFormEngine';

export const HANDWRITING_LETTERS: LetterModel[] = [
  // ── pre-writing strokes (the five that precede letters) ──
  { key: 'down',   glyph: '｜', category: 'prewriting', strokes: [line(50, 15, 50, 125)] },
  { key: 'across', glyph: '—',  category: 'prewriting', strokes: [line(14, 72, 86, 72)] },
  { key: 'circle', glyph: '◯',  category: 'prewriting', strokes: [arc(50, 70, 42, 270, -360, 48)] },
  { key: 'cross',  glyph: '＋', category: 'prewriting', strokes: [line(50, 20, 50, 120), line(18, 70, 82, 70)] },
  { key: 'slant',  glyph: '／', category: 'prewriting', strokes: [line(78, 20, 26, 120)] },

  // ── capitals (top-start, straight-line first) ──
  { key: 'L', glyph: 'L', category: 'capital', strokes: [line(32, 15, 32, 125), line(32, 125, 74, 125)] },
  { key: 'T', glyph: 'T', category: 'capital', strokes: [line(50, 15, 50, 125), line(18, 15, 82, 15)] },
  { key: 'I', glyph: 'I', category: 'capital', strokes: [line(50, 15, 50, 125)] },
  { key: 'A', glyph: 'A', category: 'capital', strokes: [line(50, 15, 24, 125), line(50, 15, 76, 125), line(34, 82, 66, 82)] },
  { key: 'H', glyph: 'H', category: 'capital', strokes: [line(26, 15, 26, 125), line(74, 15, 74, 125), line(26, 70, 74, 70)] },

  // ── curves ──
  { key: 'C', glyph: 'C', category: 'capital', strokes: [arc(52, 70, 42, 305, -250, 44)] },
  { key: 'O', glyph: 'O', category: 'capital', strokes: [arc(50, 70, 42, 270, -360, 48)] },

  // ── lowercase (magic-c family) ──
  { key: 'c', glyph: 'c', category: 'lowercase', strokes: [arc(52, 88, 30, 305, -250, 40)] },
  { key: 'o', glyph: 'o', category: 'lowercase', strokes: [arc(50, 88, 30, 270, -360, 44)] },
  { key: 'a', glyph: 'a', category: 'lowercase', strokes: [arc(56, 90, 30, 300, -360, 46), line(86, 62, 86, 125)] },
];

export const letterByKey = (key: string): LetterModel | undefined =>
  HANDWRITING_LETTERS.find(l => l.key === key);
