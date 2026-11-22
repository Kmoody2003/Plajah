// One caption model every format reads into and writes out of. Text keeps \n line breaks and <i>
// markup; times are seconds from the start of the video (a file's start timecode is removed on read).

export type CaptionMode = 'popon' | 'rollup' | 'painton';
export type CaptionAlign = 'left' | 'center' | 'right';

export interface CaptionCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  /** Broadcast (CEA-608) presentation. Text formats ignore it. Default pop-on. */
  mode?: CaptionMode;
  /** Roll-up depth: 2, 3 or 4 rows on screen. */
  rollRows?: 2 | 3 | 4;
  /** Bottom row of the caption block, 1-15 (15 = bottom of the safe area). */
  row?: number;
  align?: CaptionAlign;
  /** Speaker name; written as a leading ">> NAME:" only when the text doesn't already carry it. */
  speaker?: string;
}

export type CaptionFormat = 'srt' | 'vtt' | 'scc' | 'mcc' | 'ttml' | 'sbv' | 'ass' | 'txt' | 'smi' | 'stl';

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
