// dates — Excel 1900 date-serial system, including the Lotus 1900 leap-year bug.
//
// Serial 1 = 1900-01-01, serial 60 = the fictional 1900-02-29, serial 61 =
// 1900-03-01. Fractions are time of day. WEEKDAY follows Excel's fake calendar
// (serial 1 is a Sunday), which keeps every modern date correct.

const MS_DAY = 86400000;
const EPOCH_1899_12_30 = Date.UTC(1899, 11, 30);
const EPOCH_1899_12_31 = Date.UTC(1899, 11, 31);

export interface YMD { y: number; m: number; d: number }

/** Excel DATE(y, m, d) with overflow normalization; returns NaN when out of range. */
export function dateToSerial(y: number, m: number, d: number): number {
  y = Math.trunc(y); m = Math.trunc(m); d = Math.trunc(d);
  if (y < 0 || y >= 10000) return NaN;
  if (y < 1900) y += 1900;
  // Normalize month first so DATE(1900, 2, 29) can be recognised as the bug day.
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  if (yy === 1900 && mm === 2 && d === 29) return 60;
  const utc = Date.UTC(yy, mm - 1, 1) + (d - 1) * MS_DAY;
  let serial = Math.round((utc - EPOCH_1899_12_30) / MS_DAY);
  if (serial < 61) serial -= 1;
  if (serial < 0 || serial > 2958465) return NaN;
  return serial;
}

export function serialToYMD(serial: number): YMD {
  const s = Math.floor(serial);
  if (s === 60) return { y: 1900, m: 2, d: 29 };
  if (s === 0) return { y: 1900, m: 1, d: 0 };
  const base = s < 60 ? EPOCH_1899_12_31 : EPOCH_1899_12_30;
  const dt = new Date(base + s * MS_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** 0 = Sunday … 6 = Saturday (Excel's calendar). */
export const weekday0 = (serial: number) => ((Math.floor(serial) % 7) + 6) % 7;

export interface HMS { h: number; mi: number; s: number; ms: number }
export function serialToHMS(serial: number): HMS {
  const frac = serial - Math.floor(serial);
  let ms = Math.round(frac * MS_DAY);
  if (ms >= MS_DAY) ms = MS_DAY - 1;
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const mi = Math.floor(ms / 60000); ms -= mi * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  return { h, mi, s, ms };
}

export const timeToSerial = (h: number, m: number, s: number) => (h * 3600 + m * 60 + s) / 86400;

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) => (m === 2 ? (isLeapYear(y) ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);

/** JS Date (local wall clock) → serial, used by TODAY()/NOW(). */
export function jsDateToSerial(d: Date): number {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  let serial = (utc - EPOCH_1899_12_30) / MS_DAY;
  if (serial < 61) serial -= 1;
  return serial;
}

export function serialToJsDate(serial: number): Date {
  const { y, m, d } = serialToYMD(serial);
  const t = serialToHMS(serial);
  return new Date(y, m - 1, d, t.h, t.mi, t.s, t.ms);
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Parse date/time text the way DATEVALUE / typed input does. Returns the serial
 * (date part + time fraction) or null. Accepts ISO (2026-03-04[ 10:30]), US
 * m/d/y, "4-Mar-2026", "March 4, 2026", "Mar 4", and times "10:30", "10:30:15",
 * "10:30 PM".
 */
export function parseDateTime(text: string): { serial: number; hasDate: boolean; hasTime: boolean; kind: string } | null {
  let s = text.trim();
  if (!s) return null;
  let time = 0, hasTime = false, timeKind = '';
  const tm = /(?:^|\s|T)(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?\s*([AaPp][Mm]?)?\s*$/.exec(s) ?? /(?:^|\s)(\d{1,2})()()\s*([AaPp][Mm])\s*$/.exec(s);
  if (tm) {
    let h = Number(tm[1]);
    const mi = tm[2] ? Number(tm[2]) : 0;
    const sec = tm[3] ? Number(tm[3]) : 0;
    const ap = tm[4]?.toUpperCase();
    if (ap) { if (h > 12) return null; if (ap.startsWith('P') && h < 12) h += 12; if (ap.startsWith('A') && h === 12) h = 0; }
    if (mi > 59 || sec >= 60) return null;
    if (!ap && h > 9999) return null;
    time = timeToSerial(h, mi, sec);
    hasTime = true;
    timeKind = ap ? (tm[3] ? 'h:mm:ss AM/PM' : 'h:mm AM/PM') : tm[3] ? 'h:mm:ss' : 'h:mm';
    s = s.slice(0, tm.index).trim();
  }
  if (!s) return hasTime ? { serial: time, hasDate: false, hasTime, kind: timeKind } : null;
  const monthIdx = (w: string) => { const i = MONTHS.findIndex(mn => mn.toLowerCase().startsWith(w.toLowerCase().slice(0, 3)) && w.length >= 3 && mn.toLowerCase().startsWith(w.toLowerCase())); return i; };
  const curYear = new Date().getFullYear();
  const fixYear = (y: string) => { const n = Number(y); return y.length <= 2 ? (n < 30 ? 2000 + n : 1900 + n) : n; };
  let m: RegExpExecArray | null;
  let serial = NaN, kind = '';
  // Calendar-checked DATE: "2026-02-29" is not a date (Excel says #VALUE!).
  const strictDate = (y: number, mo: number, d: number) => (mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y < 100 ? y + 1900 : y, mo) ? dateToSerial(y, mo, d) : NaN);
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { serial = strictDate(+m[1], +m[2], +m[3]); kind = 'yyyy-mm-dd'; if (+m[2] > 12 || +m[3] > 31) return null; }
  else if ((m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s))) { serial = strictDate(+m[1], +m[2], +m[3]); kind = 'yyyy/m/d'; if (+m[2] > 12 || +m[3] > 31) return null; }
  else if ((m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/.exec(s))) {
    if (+m[1] > 12 || +m[1] < 1 || +m[2] > 31 || +m[2] < 1) return null;
    serial = strictDate(fixYear(m[3]), +m[1], +m[2]); kind = 'm/d/yyyy';
    if (serialToYMD(serial).d !== +m[2]) return null;
  }
  else if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(s))) {
    if (+m[1] > 12 || +m[1] < 1 || +m[2] > 31 || +m[2] < 1) return null;
    serial = strictDate(curYear, +m[1], +m[2]); kind = 'd-mmm';
  }
  else if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2}|\d{4})?$/.exec(s))) {
    const mi = monthIdx(m[2]); if (mi < 0) return null;
    serial = strictDate(m[3] ? fixYear(m[3]) : curYear, mi + 1, +m[1]); kind = m[3] ? 'd-mmm-yy' : 'd-mmm';
  }
  else if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2}|\d{4})?$/.exec(s))) {
    const mi = monthIdx(m[1]); if (mi < 0) return null;
    serial = strictDate(m[3] ? fixYear(m[3]) : curYear, mi + 1, +m[2]); kind = m[3] ? 'mmmm d, yyyy' : 'd-mmm';
  }
  else if ((m = /^([A-Za-z]{3,9})[-\s](\d{4})$/.exec(s))) {
    const mi = monthIdx(m[1]); if (mi < 0) return null;
    serial = dateToSerial(+m[2], mi + 1, 1); kind = 'mmm-yy';
  }
  else return null;
  if (!Number.isFinite(serial)) return null;
  return { serial: serial + time, hasDate: true, hasTime, kind: hasTime ? `${kind} ${timeKind}` : kind };
}
