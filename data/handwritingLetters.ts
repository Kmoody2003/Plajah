// handwritingLetters — the reference letter models for Penna, in the normalized 100 × 140 box
// used by handwritingFormEngine (guide lines: cap y=15, midline y=75, baseline y=125).
//
// Ordered developmentally, following the Handwriting Without Tears sequence: pre-writing strokes
// first, then capitals (which all start at the top), then lowercase. Each stroke's point order
// encodes the taught direction. This is the Phase-1 curated set; the full A–Z + digits extend it.

import { line, arc, type LetterModel, type StrokeModel, type Pt } from '../services/handwritingFormEngine';

/** A hand-authored stroke from explicit points (for humps/loops line+arc can't express). */
const s = (points: Pt[]): StrokeModel => ({ points });

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

  // ── lowercase — x-height 75→125, ascenders to 22, descenders to ~150.
  // Approximate but plausible strokes (Story Mode is forgiving; harden geometry on real strokes). ──
  { key: 'c', glyph: 'c', category: 'lowercase', strokes: [arc(52, 100, 24, 305, -250, 40)] },
  { key: 'o', glyph: 'o', category: 'lowercase', strokes: [arc(50, 100, 24, 270, -360, 44)] },
  { key: 'a', glyph: 'a', category: 'lowercase', strokes: [arc(50, 101, 23, 300, -360, 44), line(73, 80, 73, 125)] },
  { key: 'e', glyph: 'e', category: 'lowercase', strokes: [s([{ x: 40, y: 102 }, { x: 62, y: 101 }]), arc(51, 101, 23, 0, -300, 36)] },
  { key: 'i', glyph: 'i', category: 'lowercase', strokes: [line(50, 80, 50, 125)] },
  { key: 'l', glyph: 'l', category: 'lowercase', strokes: [line(50, 22, 50, 125)] },
  { key: 't', glyph: 't', category: 'lowercase', strokes: [line(50, 45, 50, 125), s([{ x: 38, y: 78 }, { x: 62, y: 78 }])] },
  { key: 'n', glyph: 'n', category: 'lowercase', strokes: [line(40, 78, 40, 125), s([{ x: 40, y: 90 }, { x: 45, y: 80 }, { x: 54, y: 79 }, { x: 61, y: 86 }, { x: 63, y: 96 }, { x: 63, y: 125 }])] },
  { key: 'm', glyph: 'm', category: 'lowercase', strokes: [line(32, 78, 32, 125), s([{ x: 32, y: 90 }, { x: 37, y: 80 }, { x: 45, y: 80 }, { x: 50, y: 88 }, { x: 50, y: 125 }]), s([{ x: 50, y: 90 }, { x: 55, y: 80 }, { x: 63, y: 80 }, { x: 68, y: 88 }, { x: 68, y: 125 }])] },
  { key: 'r', glyph: 'r', category: 'lowercase', strokes: [line(40, 78, 40, 125), s([{ x: 40, y: 90 }, { x: 46, y: 81 }, { x: 57, y: 79 }, { x: 64, y: 81 }])] },
  { key: 'u', glyph: 'u', category: 'lowercase', strokes: [s([{ x: 38, y: 78 }, { x: 38, y: 112 }, { x: 42, y: 121 }, { x: 50, y: 123 }, { x: 58, y: 119 }, { x: 62, y: 110 }, { x: 62, y: 78 }]), line(62, 78, 62, 125)] },
  { key: 'w', glyph: 'w', category: 'lowercase', strokes: [s([{ x: 32, y: 78 }, { x: 42, y: 124 }, { x: 50, y: 92 }, { x: 58, y: 124 }, { x: 68, y: 78 }])] },
  { key: 's', glyph: 's', category: 'lowercase', strokes: [s([{ x: 62, y: 86 }, { x: 52, y: 79 }, { x: 42, y: 82 }, { x: 42, y: 92 }, { x: 52, y: 99 }, { x: 58, y: 106 }, { x: 56, y: 117 }, { x: 46, y: 121 }, { x: 36, y: 116 }])] },
  { key: 'h', glyph: 'h', category: 'lowercase', strokes: [line(38, 22, 38, 125), s([{ x: 38, y: 92 }, { x: 44, y: 81 }, { x: 54, y: 80 }, { x: 61, y: 86 }, { x: 63, y: 96 }, { x: 63, y: 125 }])] },
  { key: 'd', glyph: 'd', category: 'lowercase', strokes: [arc(50, 101, 23, 300, -360, 40), line(73, 22, 73, 125)] },
  { key: 'g', glyph: 'g', category: 'lowercase', strokes: [arc(50, 101, 23, 300, -360, 40), s([{ x: 73, y: 80 }, { x: 73, y: 140 }, { x: 68, y: 149 }, { x: 59, y: 150 }, { x: 52, y: 146 }])] },
];

export const letterByKey = (key: string): LetterModel | undefined =>
  HANDWRITING_LETTERS.find(l => l.key === key);
