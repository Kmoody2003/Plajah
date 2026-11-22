// Delivery specs a caption file is checked against. Each profile is the set of numbers a network,
// platform or standard publishes; qcCaptions() applies them. Values are the commonly published
// figures for adult programming — a profile is a starting point the editor can tighten.

import type { CaptionFormat } from './model';

export interface CaptionProfile {
  id: string;
  label: string;
  /** Who publishes it / what it covers, shown under the picker. */
  note: string;
  maxCols: number;
  maxRows: number;
  maxCps: number;
  minDurationSec: number;
  maxDurationSec: number;
  /** Frames to leave between captions when they don't touch (0 = no rule). */
  minGapFrames: number;
  /** Text must be carriable by the CEA-608 character set. */
  check608Chars: boolean;
  /** The deliverable this profile is usually paired with. */
  deliver: CaptionFormat[];
}

export const CAPTION_PROFILES: CaptionProfile[] = [
  {
    id: 'cea608', label: 'US broadcast · CEA-608/708', note: 'FCC closed captions (47 CFR 79.1). 32 columns, pop-on up to 4 rows, line 21 character set.',
    maxCols: 32, maxRows: 3, maxCps: 20, minDurationSec: 1, maxDurationSec: 8, minGapFrames: 0, check608Chars: true, deliver: ['scc', 'mcc'],
  },
  {
    id: 'dcmp', label: 'DCMP educational', note: 'Described and Captioned Media Program: 2 lines, 32 characters, readable pace for students.',
    maxCols: 32, maxRows: 2, maxCps: 15, minDurationSec: 1.5, maxDurationSec: 6, minGapFrames: 0, check608Chars: true, deliver: ['scc', 'mcc', 'srt'],
  },
  {
    id: 'netflix', label: 'Streaming · Netflix-style', note: 'Timed-text style guide figures: 42 characters, 2 lines, 20 cps, 5/6 s minimum, 2-frame gaps.',
    maxCols: 42, maxRows: 2, maxCps: 20, minDurationSec: 5 / 6, maxDurationSec: 7, minGapFrames: 2, check608Chars: false, deliver: ['ttml', 'vtt', 'srt'],
  },
  {
    id: 'bbc', label: 'UK broadcast · BBC', note: 'BBC subtitle guidelines: 37 characters, 2 lines, about 160-180 words a minute.',
    maxCols: 37, maxRows: 2, maxCps: 17, minDurationSec: 1, maxDurationSec: 7, minGapFrames: 0, check608Chars: false, deliver: ['ttml', 'stl'],
  },
  {
    id: 'ebu', label: 'European broadcast · EBU', note: 'EBU Tech 3264 STL / EBU-TT-D: up to 40 characters, Teletext-safe 2 lines.',
    maxCols: 40, maxRows: 2, maxCps: 17, minDurationSec: 1, maxDurationSec: 7, minGapFrames: 0, check608Chars: false, deliver: ['stl', 'ttml'],
  },
  {
    id: 'web', label: 'Web · YouTube / social', note: 'Web players: 42 characters, 2 lines, a faster 25 cps ceiling.',
    maxCols: 42, maxRows: 2, maxCps: 25, minDurationSec: 0.7, maxDurationSec: 8, minGapFrames: 0, check608Chars: false, deliver: ['vtt', 'srt', 'sbv'],
  },
];

export const profileById = (id: string | undefined): CaptionProfile => CAPTION_PROFILES.find((p) => p.id === id) || CAPTION_PROFILES[0];
