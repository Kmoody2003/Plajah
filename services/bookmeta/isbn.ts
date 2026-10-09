// ISBN helpers for the author flow. Pure. (Plajah's wider identifier registry lives in services/registry/*;
// this is a small self-contained copy of the ISBN rules so the submission code has no import chain.)

export interface IsbnCheck {
  valid: boolean;
  normalized: string;       // digits (+ trailing X for ISBN-10)
  kind: 'ISBN-13' | 'ISBN-10' | null;
  isbn13?: string;          // canonical 13-digit form when valid
  reason?: string;
}

export const normalizeIsbn = (raw: string): string => (raw || '').replace(/^isbn(?:-1[03])?:?/i, '').replace(/[\s\-–—.]/g, '').toUpperCase();

function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return c === 10 ? 'X' : String(c);
}

export function isbn10To13(isbn10: string): string | null {
  const v = normalizeIsbn(isbn10);
  if (!/^\d{9}[\dX]$/.test(v) || isbn10CheckDigit(v.slice(0, 9)) !== v[9]) return null;
  const body = '978' + v.slice(0, 9);
  return body + isbn13CheckDigit(body);
}

export function checkIsbn(raw: string): IsbnCheck {
  const v = normalizeIsbn(raw);
  if (!v) return { valid: false, normalized: v, kind: null, reason: 'Enter an ISBN, or choose "no ISBN".' };
  if (/^\d{13}$/.test(v)) {
    if (!/^97[89]/.test(v)) return { valid: false, normalized: v, kind: 'ISBN-13', reason: 'ISBN-13 must start with 978 or 979.' };
    if (isbn13CheckDigit(v.slice(0, 12)) !== Number(v[12]))
      return { valid: false, normalized: v, kind: 'ISBN-13', reason: `Check digit is wrong (expected ${isbn13CheckDigit(v.slice(0, 12))}). Re-check for a typo or transposed digits.` };
    return { valid: true, normalized: v, kind: 'ISBN-13', isbn13: v };
  }
  if (/^\d{9}[\dX]$/.test(v)) {
    const as13 = isbn10To13(v);
    if (!as13) return { valid: false, normalized: v, kind: 'ISBN-10', reason: `ISBN-10 check character is wrong (expected ${isbn10CheckDigit(v.slice(0, 9))}).` };
    return { valid: true, normalized: v, kind: 'ISBN-10', isbn13: as13 };
  }
  return { valid: false, normalized: v, kind: null, reason: 'An ISBN has 13 digits (or 10 for older books).' };
}

/** Honest, provider-neutral guidance shown next to the ISBN field. Store policies change — verify before relying. */
export const ISBN_GUIDANCE = {
  headline: 'You do not need an ISBN to sell an ebook on Plajah.',
  points: [
    'Plajah identifies your book with its own permanent identifier, so an ISBN is optional here.',
    'An ISBN belongs to the publisher of record. If you supply your own, you stay the publisher and can carry that number to any other store.',
    'ISBNs are sold per country agency (for example Bowker in the US, Nielsen in the UK); a few national agencies issue them free to residents (Library and Archives Canada does). A free ISBN issued by a retailer or distributor generally lists that company as the publisher and may only be usable on their channel.',
    'Print editions usually need an ISBN; one ISBN per format (ebook, paperback, hardcover are three numbers).',
    'Policies change — check your national agency and each store before relying on this summary.',
  ],
};
