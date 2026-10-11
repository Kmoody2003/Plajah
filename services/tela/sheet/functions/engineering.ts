// engineering — base conversions (10-digit two's complement like Excel),
// bitwise ops, ERF/ERFC, DELTA/GESTEP, and CONVERT for common units.

import { ERR, type Value, isErr, type CellError } from '../values';
import { IO, N, NO, S, firstErr, omitted } from './helpers';
import { def } from './registry';
import { erf, erfc } from './statcore';

const L = { lift: 'all' as const };

function toBaseStr(n: number, radix: number, places: Value, limit: number): string | CellError {
  if (!Number.isFinite(n) || n < -limit || n > limit - 1) return ERR.NUM;
  n = Math.trunc(n);
  let s: string;
  if (n < 0) s = (Math.pow(radix, 10) + n).toString(radix).toUpperCase();
  else {
    s = n.toString(radix).toUpperCase();
    if (!omitted(places)) {
      const p = N(places); if (isErr(p)) return p;
      const pl = Math.trunc(p);
      if (pl < 1 || pl > 10 || s.length > pl) return ERR.NUM;
      s = s.padStart(pl, '0');
    }
  }
  return s;
}
function fromBaseStr(t: string, radix: number): number | CellError {
  t = t.trim();
  if (t.length > 10 || !t.length) return t.length ? ERR.NUM : 0;
  const valid = radix === 2 ? /^[01]+$/ : radix === 8 ? /^[0-7]+$/ : /^[0-9A-Fa-f]+$/;
  if (!valid.test(t)) return ERR.NUM;
  const v = parseInt(t, radix);
  return t.length === 10 && v >= Math.pow(radix, 10) / 2 ? v - Math.pow(radix, 10) : v;
}
const LIMIT: Record<number, number> = { 2: 512, 8: 536870912, 16: 549755813888 };
const NAMES: Record<number, string> = { 2: 'BIN', 8: 'OCT', 10: 'DEC', 16: 'HEX' };
for (const from of [2, 8, 10, 16]) for (const to of [2, 8, 10, 16]) {
  if (from === to) continue;
  const name = `${NAMES[from]}2${NAMES[to]}`;
  def(name, 'engineering', 1, to === 10 ? 1 : 2, to === 10 ? 'number' : 'number, [places]', `Convert ${NAMES[from].toLowerCase()} to ${NAMES[to].toLowerCase()}.`, a => {
    let n: number | CellError;
    if (from === 10) { n = N(a[0]); }
    else { const t = S(a[0]); if (isErr(t)) return t; n = fromBaseStr(t, from); }
    if (isErr(n)) return n;
    if (to === 10) return n;
    return toBaseStr(n, to, a[1] ?? undefined as unknown as Value, LIMIT[to]);
  }, L);
}

const MAX_BIT = Math.pow(2, 48);
function bitArgs(a: Value[]): [number, number] | CellError {
  const x = N(a[0]), y = N(a[1]); const e = firstErr(x, y); if (e) return e;
  const p = x as number, q = y as number;
  if (p < 0 || q < 0 || p >= MAX_BIT || q >= MAX_BIT || !Number.isInteger(p) || !Number.isInteger(q)) return ERR.NUM;
  return [p, q];
}
const big = (n: number) => BigInt(n);
def('BITAND', 'engineering', 2, 2, 'number1, number2', 'Bitwise AND.', a => { const v = bitArgs(a); return isErr(v) ? v : Number(big(v[0]) & big(v[1])); }, { ...L, future: true });
def('BITOR', 'engineering', 2, 2, 'number1, number2', 'Bitwise OR.', a => { const v = bitArgs(a); return isErr(v) ? v : Number(big(v[0]) | big(v[1])); }, { ...L, future: true });
def('BITXOR', 'engineering', 2, 2, 'number1, number2', 'Bitwise XOR.', a => { const v = bitArgs(a); return isErr(v) ? v : Number(big(v[0]) ^ big(v[1])); }, { ...L, future: true });
def('BITLSHIFT', 'engineering', 2, 2, 'number, shift_amount', 'Shift bits left.', a => {
  const x = N(a[0]), s = N(a[1]); const e = firstErr(x, s); if (e) return e;
  if ((x as number) < 0 || (x as number) >= MAX_BIT || Math.abs(s as number) > 53) return ERR.NUM;
  const r = (s as number) >= 0 ? (x as number) * Math.pow(2, Math.trunc(s as number)) : Math.floor((x as number) / Math.pow(2, -Math.trunc(s as number)));
  return r >= MAX_BIT ? ERR.NUM : r;
}, { ...L, future: true });
def('BITRSHIFT', 'engineering', 2, 2, 'number, shift_amount', 'Shift bits right.', a => {
  const x = N(a[0]), s = N(a[1]); const e = firstErr(x, s); if (e) return e;
  if ((x as number) < 0 || (x as number) >= MAX_BIT || Math.abs(s as number) > 53) return ERR.NUM;
  const k = Math.trunc(s as number);
  const r = k >= 0 ? Math.floor((x as number) / Math.pow(2, k)) : (x as number) * Math.pow(2, -k);
  return r >= MAX_BIT ? ERR.NUM : r;
}, { ...L, future: true });
def('DELTA', 'engineering', 1, 2, 'number1, [number2]', '1 if two numbers are equal.', a => { const x = N(a[0]), y = NO(a[1], 0); const e = firstErr(x, y); return e ?? (x === y ? 1 : 0); }, L);
def('GESTEP', 'engineering', 1, 2, 'number, [step]', '1 if number ≥ step.', a => { const x = N(a[0]), y = NO(a[1], 0); const e = firstErr(x, y); return e ?? ((x as number) >= (y as number) ? 1 : 0); }, L);
def('ERF', 'engineering', 1, 2, 'lower_limit, [upper_limit]', 'Error function.', a => {
  const lo = N(a[0]); if (isErr(lo)) return lo;
  if (omitted(a[1])) return erf(lo);
  const hi = N(a[1]); if (isErr(hi)) return hi;
  return erf(hi) - erf(lo);
}, L);
def('ERF.PRECISE', 'engineering', 1, 1, 'x', 'Error function.', a => { const x = N(a[0]); return isErr(x) ? x : erf(x); }, { ...L, future: true });
def('ERFC', 'engineering', 1, 1, 'x', 'Complementary error function.', a => { const x = N(a[0]); return isErr(x) ? x : erfc(x); }, L);
def('ERFC.PRECISE', 'engineering', 1, 1, 'x', 'Complementary error function.', a => { const x = N(a[0]); return isErr(x) ? x : erfc(x); }, { ...L, future: true });

// CONVERT: unit → [group, factor to base]. Temperatures are special-cased.
const U: Record<string, [string, number]> = {
  // mass (g)
  g: ['m', 1], kg: ['m', 1000], mg: ['m', 1e-3], lbm: ['m', 453.59237], ozm: ['m', 28.349523125], stone: ['m', 6350.29318], ton: ['m', 907184.74], uk_ton: ['m', 1016046.9088], u: ['m', 1.66053906660e-24], grain: ['m', 0.06479891],
  // distance (m)
  m: ['d', 1], km: ['d', 1000], cm: ['d', 0.01], mm: ['d', 0.001], um: ['d', 1e-6], nm: ['d', 1e-9], mi: ['d', 1609.344], Nmi: ['d', 1852], in: ['d', 0.0254], ft: ['d', 0.3048], yd: ['d', 0.9144], ang: ['d', 1e-10], ell: ['d', 1.143], ly: ['d', 9460730472580800], pica: ['d', 0.0254 / 6], Pica: ['d', 0.0254 / 72], survey_mi: ['d', 1609.3472186944373],
  // time (s)
  yr: ['t', 31557600], day: ['t', 86400], d: ['t', 86400], hr: ['t', 3600], mn: ['t', 60], min: ['t', 60], sec: ['t', 1], s: ['t', 1], ms: ['t', 0.001],
  // pressure (Pa)
  Pa: ['p', 1], p: ['p', 1], kPa: ['p', 1000], atm: ['p', 101325], at: ['p', 101325], mmHg: ['p', 133.322], psi: ['p', 6894.757293168361], Torr: ['p', 133.32236842105263], bar: ['p', 100000],
  // force (N)
  N: ['f', 1], dyn: ['f', 1e-5], dy: ['f', 1e-5], lbf: ['f', 4.4482216152605], pond: ['f', 0.00980665],
  // energy (J)
  J: ['e', 1], kJ: ['e', 1000], e: ['e', 1e-7], c: ['e', 4.184], cal: ['e', 4.1868], eV: ['e', 1.602176634e-19], ev: ['e', 1.602176634e-19], HPh: ['e', 2684519.537696172792], hh: ['e', 2684519.537696172792], Wh: ['e', 3600], wh: ['e', 3600], kWh: ['e', 3600000], flb: ['e', 0.0421401100938048], BTU: ['e', 1055.05585262], btu: ['e', 1055.05585262],
  // power (W)
  W: ['w', 1], w: ['w', 1], kW: ['w', 1000], HP: ['w', 745.69987158227022], h: ['w', 745.69987158227022], PS: ['w', 735.49875],
  // magnetism
  T: ['g', 1], ga: ['g', 1e-4],
  // volume (l)
  l: ['v', 1], L: ['v', 1], lt: ['v', 1], ml: ['v', 0.001], mL: ['v', 0.001], tsp: ['v', 0.00492892159375], tbs: ['v', 0.01478676478125], oz: ['v', 0.0295735295625], cup: ['v', 0.2365882365], pt: ['v', 0.473176473], us_pt: ['v', 0.473176473], uk_pt: ['v', 0.56826125], qt: ['v', 0.946352946], uk_qt: ['v', 1.1365225], gal: ['v', 3.785411784], uk_gal: ['v', 4.54609], m3: ['v', 1000], ft3: ['v', 28.316846592], in3: ['v', 0.016387064], barrel: ['v', 158.987294928],
  // area (m2)
  m2: ['a', 1], km2: ['a', 1e6], ft2: ['a', 0.09290304], in2: ['a', 0.00064516], yd2: ['a', 0.83612736], mi2: ['a', 2589988.110336], ha: ['a', 10000], uk_acre: ['a', 4046.8564224], us_acre: ['a', 4046.8726098742], ar: ['a', 100],
  // information (bit)
  bit: ['i', 1], byte: ['i', 8],
  // speed (m/s)
  'm/s': ['s', 1], 'm/sec': ['s', 1], 'm/h': ['s', 1 / 3600], 'm/hr': ['s', 1 / 3600], mph: ['s', 0.44704], kn: ['s', 1852 / 3600], admkn: ['s', 0.514773333],
};
function tempToK(v: number, u: string): number | null {
  switch (u) { case 'C': case 'cel': return v + 273.15; case 'F': case 'fah': return (v - 32) * 5 / 9 + 273.15; case 'K': case 'kel': return v; case 'Rank': return v * 5 / 9; case 'Reau': return v * 1.25 + 273.15; default: return null; }
}
function kToTemp(k: number, u: string): number | null {
  switch (u) { case 'C': case 'cel': return k - 273.15; case 'F': case 'fah': return (k - 273.15) * 9 / 5 + 32; case 'K': case 'kel': return k; case 'Rank': return k * 9 / 5; case 'Reau': return (k - 273.15) * 0.8; default: return null; }
}
def('CONVERT', 'engineering', 3, 3, 'number, from_unit, to_unit', 'Convert between measurement units.', a => {
  const x = N(a[0]), fu = S(a[1]), tu = S(a[2]); const e = firstErr(x, fu, tu); if (e) return e;
  const k = tempToK(x as number, fu as string);
  if (k !== null) { const r = kToTemp(k, tu as string); return r === null ? ERR.NA : Number(r.toPrecision(15)); }
  const f = U[fu as string], t = U[tu as string];
  if (!f || !t || f[0] !== t[0]) return ERR.NA;
  return Number((((x as number) * f[1]) / t[1]).toPrecision(15));
}, L);

export { IO };
