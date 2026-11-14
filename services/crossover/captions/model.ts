// One caption model every format reads into and writes out of. Text keeps \n line breaks and <i>
// markup; times are seconds from the start of the video (a file's start timecode is removed on read).

export interface CaptionCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

export type CaptionFormat = 'srt' | 'vtt' | 'scc' | 'mcc' | 'ttml' | 'sbv' | 'ass' | 'txt';

export interface CaptionDoc {
  cues: CaptionCue[];
  sourceFormat?: CaptionFormat;
  /** What the reader noticed that the user should know about (bad parity, other channels...). */
  warnings: string[];
  /** The rate stated by a broadcast file. */
  rateId?: string;
  /** Start timecode found in a broadcast file, in seconds, before it was removed. */
  firstTimecodeSec?: number;
}

let seq = 0;
export const newCueId = () => `cue${Date.now().toString(36)}_${++seq}`;

export const stripMarkup = (text: string) => text.replace(/<[^>]+>/g, '');

/** Compare text the way a viewer would read it: same words, regardless of wrapping or markup. */
export const normalizeForCompare = (text: string) => stripMarkup(text)
  // The broadcast character sets have no en/em dash or curly apostrophe in every layer.
  .replace(/[—–]/g, '-').replace(/’/g, "'").replace(/…/g, '...')
  .replace(/\s+/g, ' ').trim();

export function sortCues(cues: CaptionCue[]): CaptionCue[] {
  return [...cues].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
}

/** The cue showing at a moment. Later cues win when two overlap. */
export function cueAt(cues: CaptionCue[], sec: number): CaptionCue | null {
  for (let i = cues.length - 1; i >= 0; i--) {
    if (sec >= cues[i].startSec && sec < cues[i].endSec) return cues[i];
  }
  return null;
}
