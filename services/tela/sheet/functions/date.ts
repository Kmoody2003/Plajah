// date — Date & time functions over 1900-system serials.

import { scalarOf, toMatrix, type Frame } from '../coerce';
import { dateToSerial, daysInMonth, isLeapYear, parseDateTime, serialToHMS, serialToYMD, timeToSerial, weekday0 } from '../dates';
import { CellError, ERR, type Value, isErr } from '../values';
import { I, IO, N, NO, S, firstErr, omitted, nums } from './helpers';
import { def } from './registry';

const L = { lift: 'all' as const };
const MAX_SERIAL = 2958465;
const okSerial = (s: number) => s >= 0 && s <= MAX_SERIAL + 0.99999999;

/** Date argument: number or coercible text, validated and floored. */
function D(v: Value): number | CellError {
  const n = N(v); if (isErr(n)) return n;
  return okSerial(n) ? n : ERR.NUM;
}

def('DATE', 'date', 3, 3, 'year, month, day', 'Serial number of a date.', a => {
  const y = I(a[0]), m = I(a[1]), d = I(a[2]); const e = firstErr(y, m, d); if (e) return e;
  const s = dateToSerial(y as number, m as number, d as number);
  return Number.isNaN(s) ? ERR.NUM : s;
}, L);
def('TIME', 'date', 3, 3, 'hour, minute, second', 'Time as a day fraction.', a => {
  const h = I(a[0]), m = I(a[1]), s = I(a[2]); const e = firstErr(h, m, s); if (e) return e;
  const t = timeToSerial(h as number, m as number, s as number);
  if (t < 0) return ERR.NUM;
  return t - Math.floor(t);
}, L);
def('TODAY', 'date', 0, 0, '', "Today's date.", (_a, f) => Math.floor(f.e.now()), { volatile: true });
def('NOW', 'date', 0, 0, '', 'Current date and time.', (_a, f) => f.e.now(), { volatile: true });
def('YEAR', 'date', 1, 1, 'serial_number', 'Year of a date.', a => { const s = D(a[0]); return isErr(s) ? s : serialToYMD(s).y; }, L);
def('MONTH', 'date', 1, 1, 'serial_number', 'Month of a date.', a => { const s = D(a[0]); return isErr(s) ? s : serialToYMD(s).m; }, L);
def('DAY', 'date', 1, 1, 'serial_number', 'Day of the month.', a => { const s = D(a[0]); return isErr(s) ? s : serialToYMD(s).d; }, L);
/** Time parts after rounding to the nearest whole second (Excel's behaviour). */
const hms = (s: number) => serialToHMS(Math.round(s * 86400) / 86400);
def('HOUR', 'date', 1, 1, 'serial_number', 'Hour (0–23).', a => { const s = D(a[0]); return isErr(s) ? s : hms(s).h; }, L);
def('MINUTE', 'date', 1, 1, 'serial_number', 'Minute (0–59).', a => { const s = D(a[0]); return isErr(s) ? s : hms(s).mi; }, L);
def('SECOND', 'date', 1, 1, 'serial_number', 'Second (0–59).', a => { const s = D(a[0]); return isErr(s) ? s : hms(s).s; }, L);

def('WEEKDAY', 'date', 1, 2, 'serial_number, [return_type]', 'Day of the week as a number.', a => {
  const s = D(a[0]), t = IO(a[1], 1); const e = firstErr(s, t); if (e) return e;
  const w = weekday0(s as number); // 0 = Sunday
  switch (t) {
    case 1: case 17: return w + 1;
    case 2: case 11: return ((w + 6) % 7) + 1;
    case 3: return (w + 6) % 7;
    case 12: return ((w + 5) % 7) + 1;
    case 13: return ((w + 4) % 7) + 1;
    case 14: return ((w + 3) % 7) + 1;
    case 15: return ((w + 2) % 7) + 1;
    case 16: return ((w + 1) % 7) + 1;
    default: return ERR.NUM;
  }
}, L);

function isoWeek(serial: number): number {
  const { y } = serialToYMD(serial);
  const wd = (weekday0(serial) + 6) % 7; // Monday = 0
  const thursday = Math.floor(serial) - wd + 3;
  const ty = serialToYMD(thursday).y;
  const jan1 = dateToSerial(ty, 1, 1);
  void y;
  return Math.floor((thursday - jan1) / 7) + 1;
}
def('ISOWEEKNUM', 'date', 1, 1, 'date', 'ISO-8601 week number.', a => { const s = D(a[0]); return isErr(s) ? s : isoWeek(s); }, { ...L, future: true });
def('WEEKNUM', 'date', 1, 2, 'serial_number, [return_type]', 'Week number of the year.', a => {
  const s = D(a[0]), t = IO(a[1], 1); const e = firstErr(s, t); if (e) return e;
  if (t === 21) return isoWeek(s as number);
  const startDay: Record<number, number> = { 1: 0, 17: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6 };
  const sd = startDay[t as number]; if (sd === undefined) return ERR.NUM;
  const { y } = serialToYMD(s as number);
  const jan1 = dateToSerial(y, 1, 1);
  const off = (weekday0(jan1) - sd + 7) % 7;
  return Math.floor((Math.floor(s as number) - jan1 + off) / 7) + 1;
}, L);

function addMonths(serial: number, months: number, eom: boolean): number {
  const { y, m, d } = serialToYMD(serial);
  const total = y * 12 + (m - 1) + Math.trunc(months);
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const dim = daysInMonth(ny, nm);
  return dateToSerial(ny, nm, eom ? dim : Math.min(d, dim));
}
def('EDATE', 'date', 2, 2, 'start_date, months', 'Date a number of months away.', a => {
  const s = D(a[0]), m = N(a[1]); const e = firstErr(s, m); if (e) return e;
  const r = addMonths(s as number, m as number, false); return okSerial(r) ? r : ERR.NUM;
}, L);
def('EOMONTH', 'date', 2, 2, 'start_date, months', 'Last day of a month a number of months away.', a => {
  const s = D(a[0]), m = N(a[1]); const e = firstErr(s, m); if (e) return e;
  const r = addMonths(s as number, m as number, true); return okSerial(r) ? r : ERR.NUM;
}, L);
def('DAYS', 'date', 2, 2, 'end_date, start_date', 'Days between two dates.', a => {
  const e1 = D(a[0]), s1 = D(a[1]); const e = firstErr(e1, s1); if (e) return e;
  return Math.floor(e1 as number) - Math.floor(s1 as number);
}, { ...L, future: true });
def('DAYS360', 'date', 2, 3, 'start_date, end_date, [method]', 'Days between dates on a 360-day year.', a => {
  const s = D(a[0]), en = D(a[1]); const e = firstErr(s, en); if (e) return e;
  const eu = omitted(a[2]) ? false : !!N(a[2]);
  const p = serialToYMD(s as number), q = serialToYMD(en as number);
  let d1 = p.d, d2 = q.d;
  if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; }
  else {
    const lastFeb = (x: { y: number; m: number; d: number }) => x.m === 2 && x.d === daysInMonth(x.y, 2);
    if (lastFeb(p)) { if (lastFeb(q)) d2 = 30; d1 = 30; }
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
  }
  return (q.y - p.y) * 360 + (q.m - p.m) * 30 + (d2 - d1);
}, L);
def('DATEDIF', 'date', 3, 3, 'start_date, end_date, unit', 'Difference between dates in Y/M/D/MD/YM/YD.', a => {
  const s = D(a[0]), en = D(a[1]), u = S(a[2]); const e = firstErr(s, en, u); if (e) return e;
  const sd = Math.floor(s as number), ed = Math.floor(en as number);
  if (sd > ed) return ERR.NUM;
  const p = serialToYMD(sd), q = serialToYMD(ed);
  let months = (q.y - p.y) * 12 + (q.m - p.m);
  if (q.d < p.d) months--;
  switch ((u as string).toUpperCase()) {
    case 'Y': return Math.floor(months / 12);
    case 'M': return months;
    case 'D': return ed - sd;
    case 'MD': { let d = q.d - p.d; if (d < 0) { const pm = q.m === 1 ? 12 : q.m - 1, py = q.m === 1 ? q.y - 1 : q.y; d += daysInMonth(py, pm); } return d; }
    case 'YM': return ((months % 12) + 12) % 12;
    case 'YD': {
      let anchor = dateToSerial(q.y, p.m, p.d);
      if (anchor > ed) anchor = dateToSerial(q.y - 1, p.m, p.d);
      return ed - anchor;
    }
    default: return ERR.NUM;
  }
}, L);

// Workdays
function weekendMask(v: Value | undefined, f: Frame): boolean[] | CellError {
  if (omitted(v)) return [true, false, false, false, false, false, true]; // Sun..Sat
  const s = scalarOf(v as Value, f);
  if (s instanceof CellError) return s;
  if (typeof s === 'string') {
    if (!/^[01]{7}$/.test(s) || s === '1111111') return ERR.VALUE;
    // String is Monday..Sunday.
    const m = s.split('').map(c => c === '1');
    return [m[6], ...m.slice(0, 6)];
  }
  const n = Math.trunc(Number(s));
  const pairs: Record<number, [number, number]> = { 1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6] };
  const mask = new Array(7).fill(false);
  if (pairs[n]) { mask[pairs[n][0]] = true; mask[pairs[n][1]] = true; return mask; }
  if (n >= 11 && n <= 17) { mask[n - 11] = true; return mask; } // 11 = Sunday … 17 = Saturday
  return ERR.NUM;
}
function holidaySet(v: Value | undefined, f: Frame): Set<number> | CellError {
  if (omitted(v)) return new Set();
  const xs = nums([v as Value], f); if (isErr(xs)) return xs;
  return new Set(xs.map(Math.floor));
}
function networkdays(a: Value[], f: Frame, intl: boolean): Value {
  const s = D(scalarOf(a[0], f)), en = D(scalarOf(a[1], f)); const e = firstErr(s, en); if (e) return e;
  const wk = intl ? weekendMask(a[2], f) : weekendMask(undefined, f); if (isErr(wk)) return wk;
  const hol = holidaySet(intl ? a[3] : a[2], f); if (isErr(hol)) return hol;
  let a0 = Math.floor(s as number), b0 = Math.floor(en as number), sign = 1;
  if (a0 > b0) { [a0, b0] = [b0, a0]; sign = -1; }
  let n = 0;
  for (let d = a0; d <= b0; d++) if (!wk[weekday0(d)] && !hol.has(d)) n++;
  return sign * n;
}
def('NETWORKDAYS', 'date', 2, 3, 'start_date, end_date, [holidays]', 'Working days between dates.', (a, f) => networkdays(a, f, false));
def('NETWORKDAYS.INTL', 'date', 2, 4, 'start_date, end_date, [weekend], [holidays]', 'Working days with custom weekends.', (a, f) => networkdays(a, f, true), { future: true });
function workday(a: Value[], f: Frame, intl: boolean): Value {
  const s = D(scalarOf(a[0], f)), n = N(scalarOf(a[1], f)); const e = firstErr(s, n); if (e) return e;
  const wk = intl ? weekendMask(a[2], f) : weekendMask(undefined, f); if (isErr(wk)) return wk;
  if (wk.every(Boolean)) return ERR.VALUE;
  const hol = holidaySet(intl ? a[3] : a[2], f); if (isErr(hol)) return hol;
  let d = Math.floor(s as number), left = Math.trunc(n as number);
  const step = left < 0 ? -1 : 1;
  while (left !== 0) { d += step; if (!wk[weekday0(d)] && !hol.has(d)) left -= step; if (!okSerial(d)) return ERR.NUM; }
  return d;
}
def('WORKDAY', 'date', 2, 3, 'start_date, days, [holidays]', 'Date a number of working days away.', (a, f) => workday(a, f, false));
def('WORKDAY.INTL', 'date', 2, 4, 'start_date, days, [weekend], [holidays]', 'Workday with custom weekends.', (a, f) => workday(a, f, true), { future: true });

def('YEARFRAC', 'date', 2, 3, 'start_date, end_date, [basis]', 'Fraction of a year between dates.', a => {
  const s = D(a[0]), en = D(a[1]), b = IO(a[2], 0); const e = firstErr(s, en, b); if (e) return e;
  return yearFrac(Math.floor(s as number), Math.floor(en as number), b as number);
}, L);
export function yearFrac(s: number, e: number, basis: number): number | CellError {
  if (basis < 0 || basis > 4) return ERR.NUM;
  if (s > e) [s, e] = [e, s];
  const p = serialToYMD(s), q = serialToYMD(e);
  switch (basis) {
    case 0: {
      let d1 = p.d, d2 = q.d;
      const lastFeb = (x: { y: number; m: number; d: number }) => x.m === 2 && x.d === daysInMonth(x.y, 2);
      if (d1 === 31 && d2 === 31) { d1 = 30; d2 = 30; }
      else if (d1 === 31) d1 = 30;
      else if (d1 === 30 && d2 === 31) d2 = 30;
      else if (lastFeb(p) && lastFeb(q)) { d1 = 30; d2 = 30; }
      else if (lastFeb(p)) d1 = 30;
      return ((q.y - p.y) * 360 + (q.m - p.m) * 30 + (d2 - d1)) / 360;
    }
    case 1: {
      // Actual/actual (Excel's algorithm).
      const sameOrWithinYear = q.y === p.y || (q.y === p.y + 1 && (p.m > q.m || (p.m === q.m && p.d >= q.d)));
      if (sameOrWithinYear) {
        let yearLen = 365;
        if (p.y === q.y && isLeapYear(p.y)) yearLen = 366;
        else if (feb29Between(s, e) || (q.m === 2 && q.d === 29)) yearLen = 366;
        return (e - s) / yearLen;
      }
      const years = q.y - p.y + 1;
      const days = dateToSerial(q.y + 1, 1, 1) - dateToSerial(p.y, 1, 1);
      return (e - s) / (days / years);
    }
    case 2: return (e - s) / 360;
    case 3: return (e - s) / 365;
    default: {
      const d1 = Math.min(p.d, 30), d2 = Math.min(q.d, 30);
      return ((q.y - p.y) * 360 + (q.m - p.m) * 30 + (d2 - d1)) / 360;
    }
  }
}
function feb29Between(s: number, e: number): boolean {
  const p = serialToYMD(s), q = serialToYMD(e);
  for (let y = p.y; y <= q.y; y++) if (isLeapYear(y)) { const f29 = dateToSerial(y, 2, 29); if (f29 >= s && f29 <= e) return true; }
  return false;
}

def('DATEVALUE', 'date', 1, 1, 'date_text', 'Serial number from date text.', a => {
  const s = S(a[0]); if (isErr(s)) return s;
  const d = parseDateTime(s); if (!d || !d.hasDate) return ERR.VALUE;
  return Math.floor(d.serial);
}, L);
def('TIMEVALUE', 'date', 1, 1, 'time_text', 'Day fraction from time text.', a => {
  const s = S(a[0]); if (isErr(s)) return s;
  const d = parseDateTime(s); if (!d || !d.hasTime) return ERR.VALUE;
  return d.serial - Math.floor(d.serial);
}, L);

export { toMatrix, NO };
