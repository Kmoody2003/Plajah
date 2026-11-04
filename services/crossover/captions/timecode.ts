// SMPTE timecode, exact to the frame. Every broadcast rate is carried as a rational so that a
// long programme never drifts: 29.97 is 30000/1001, not 29.97.

export interface FrameRate {
  id: string;
  label: string;
  num: number;
  den: number;
  /** Frames counted per timecode second (30 for 29.97). */
  base: number;
  drop: boolean;
  /** The value of "Time Code Rate=" in an MCC header. */
  mccRate: string;
  /** cdp_frame_rate code from SMPTE 334-2. */
  cdpCode: number;
  /** cc_count carried by each CDP at this rate (CEA-708 table). */
  ccCount: number;
}

const r = (id: string, label: string, num: number, den: number, base: number, drop: boolean, mccRate: string, cdpCode: number, ccCount: number): FrameRate =>
  ({ id, label, num, den, base, drop, mccRate, cdpCode, ccCount });

export const FRAME_RATES: FrameRate[] = [
  r('23.976', '23.976 fps', 24000, 1001, 24, false, '24', 1, 25),
  r('24', '24 fps', 24, 1, 24, false, '24', 2, 25),
  r('25', '25 fps', 25, 1, 25, false, '25', 3, 24),
  r('29.97df', '29.97 fps drop-frame', 30000, 1001, 30, true, '30DF', 4, 20),
  r('29.97ndf', '29.97 fps non-drop', 30000, 1001, 30, false, '30', 4, 20),
  r('30', '30 fps', 30, 1, 30, false, '30', 5, 20),
  r('50', '50 fps', 50, 1, 50, false, '50', 6, 12),
  r('59.94df', '59.94 fps drop-frame', 60000, 1001, 60, true, '60DF', 7, 10),
  r('59.94ndf', '59.94 fps non-drop', 60000, 1001, 60, false, '60', 7, 10),
  r('60', '60 fps', 60, 1, 60, false, '60', 8, 10),
];

export const rateById = (id: string): FrameRate => FRAME_RATES.find(f => f.id === id) || FRAME_RATES[3];

/** The closest broadcast rate to a measured fps. Drop-frame is the US default at 29.97/59.94. */
export function rateFromFps(fps: number | undefined): FrameRate {
  if (!fps || !isFinite(fps)) return rateById('29.97df');
  let best = FRAME_RATES[3];
  let dist = Infinity;
  for (const f of FRAME_RATES) {
    if (f.id.endsWith('ndf')) continue;
    const d = Math.abs(f.num / f.den - fps);
    if (d < dist) { dist = d; best = f; }
  }
  return best;
}

export const fpsOf = (rate: FrameRate) => rate.num / rate.den;
export const frameToSec = (frame: number, rate: FrameRate) => (frame * rate.den) / rate.num;
export const secToFrame = (sec: number, rate: FrameRate) => Math.round((sec * rate.num) / rate.den);

// Drop-frame skips the first 2 frame numbers (4 at 60) each minute, except every tenth minute.
const dropCount = (rate: FrameRate) => (rate.base === 60 ? 4 : 2);

export function frameToTc(frame: number, rate: FrameRate, separator?: string): string {
  let n = Math.max(0, Math.round(frame));
  if (rate.drop) {
    const d = dropCount(rate);
    const per10 = rate.base * 600 - d * 9;
    const perMin = rate.base * 60 - d;
    const tens = Math.floor(n / per10);
    const rem = n % per10;
    n += d * 9 * tens;
    if (rem >= d) n += d * Math.floor((rem - d) / perMin);
  }
  const ff = n % rate.base;
  const totalSec = Math.floor(n / rate.base);
  const pad = (v: number) => String(v).padStart(2, '0');
  const sep = separator ?? (rate.drop ? ';' : ':');
  return `${pad(Math.floor(totalSec / 3600) % 24)}:${pad(Math.floor(totalSec / 60) % 60)}:${pad(totalSec % 60)}${sep}${pad(ff)}`;
}

/** Parse HH:MM:SS:FF, HH:MM:SS;FF or HH:MM:SS.FF into a frame count. Null when it isn't timecode. */
export function tcToFrame(tc: string, rate: FrameRate): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})[:;.,](\d{1,3})/.exec(tc.trim());
  if (!m) return null;
  const hh = +m[1], mm = +m[2], ss = +m[3], ff = +m[4];
  const total = (hh * 3600 + mm * 60 + ss) * rate.base + ff;
  if (!rate.drop) return total;
  const minutes = hh * 60 + mm;
  return total - dropCount(rate) * (minutes - Math.floor(minutes / 10));
}

export function formatClock(sec: number, comma = false, hours = true): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const pad = (v: number, n = 2) => String(v).padStart(n, '0');
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor(ms / 60000) % 60;
  const ss = Math.floor(ms / 1000) % 60;
  return `${hours || hh ? pad(hh) + ':' : ''}${pad(mm)}:${pad(ss)}${comma ? ',' : '.'}${pad(ms % 1000, 3)}`;
}
