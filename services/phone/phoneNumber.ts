// services/phone/phoneNumber.ts — small, dependency-free phone number helpers for the PhoneHub.
//
// Not a full libphonenumber: enough to (a) match the same number written different ways
// ("(313) 555-0142", "+1 313 555 0142", "3135550142") and (b) show numbers nicely. NANP (US/CA)
// gets real formatting; everything else keeps its digits grouped as typed.

/** Keep a leading + and digits; keypad symbols (* #) survive so USSD codes still dial. */
export function cleanDial(input: string): string {
  const s = (input || '').trim();
  const plus = s.startsWith('+') ? '+' : '';
  return plus + s.replace(/[^\d*#]/g, '');
}

/**
 * Canonical key for matching. NANP numbers collapse to +1XXXXXXXXXX; other numbers keep their
 * + and digits; short codes (≤ 6 digits) stay as-is. `defaultCountry` only matters for
 * national numbers without a +.
 */
export function phoneKey(input: string, defaultCountry: 'US' | 'OTHER' = 'US'): string {
  const c = cleanDial(input);
  if (!c || /[*#]/.test(c)) return c;
  const digits = c.replace(/\D/g, '');
  if (digits.length <= 6) return digits; // short code
  if (c.startsWith('+')) return '+' + digits;
  if (c.startsWith('00')) return '+' + digits.slice(2);
  if (c.startsWith('011')) return '+' + digits.slice(3);
  if (defaultCountry === 'US') {
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  }
  return digits;
}

/** Two numbers are the same line if their keys match, or their last 10 digits do (carrier formats vary). */
export function samePhone(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  if (ka && ka === kb) return true;
  const da = ka.replace(/\D/g, '');
  const db = kb.replace(/\D/g, '');
  return da.length >= 10 && db.length >= 10 && da.slice(-10) === db.slice(-10);
}

/** Display format: (313) 555-0142 for NANP, else + and groups of 3–4. Partial input formats as typed. */
export function formatPhone(input: string): string {
  const c = cleanDial(input);
  if (!c) return '';
  if (/[*#]/.test(c)) return c;
  const digits = c.replace(/\D/g, '');
  const nanp = (c.startsWith('+1') && digits.length <= 11) || (!c.startsWith('+') && (digits.length <= 10 || (digits.length === 11 && digits.startsWith('1'))));
  if (nanp) {
    const hasOne = digits.length === 11 && digits.startsWith('1') || c.startsWith('+1');
    const d = hasOne ? digits.slice(1) : digits;
    const prefix = c.startsWith('+') ? '+1 ' : hasOne ? '1 ' : '';
    if (d.length <= 3) return prefix + d;
    if (d.length <= 6) return `${prefix}(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `${prefix}(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }
  const groups = digits.match(/.{1,3}/g) || [];
  return (c.startsWith('+') ? '+' : '') + groups.join(' ');
}

/** Keypad letters, for T9-style contact search (2=ABC … 9=WXYZ). */
const T9: Record<string, string> = { a: '2', b: '2', c: '2', d: '3', e: '3', f: '3', g: '4', h: '4', i: '4', j: '5', k: '5', l: '5', m: '6', n: '6', o: '6', p: '7', q: '7', r: '7', s: '7', t: '8', u: '8', v: '8', w: '9', x: '9', y: '9', z: '9' };

export function t9Digits(name: string): string {
  return (name || '').toLowerCase().split('').map(ch => T9[ch] ?? (/\d/.test(ch) ? ch : ' ')).join('');
}

/** Does a typed keypad string match this name (word start, T9) or number (substring)? */
export function keypadMatches(typed: string, name: string, numbers: string[]): boolean {
  const q = typed.replace(/\D/g, '');
  if (!q) return false;
  if (numbers.some(n => n.replace(/\D/g, '').includes(q))) return true;
  return t9Digits(name).split(' ').some(word => word.startsWith(q)) || t9Digits(name).replace(/ /g, '').startsWith(q);
}

/** For stored numbers (threads, recents): short codes like 22395 stay as-is; the rest as formatPhone. */
export function displayPhone(input: string): string {
  const c = cleanDial(input);
  const digits = c.replace(/\D/g, '');
  if (!c.startsWith('+') && digits.length > 0 && digits.length <= 6) return digits;
  return formatPhone(input);
}
