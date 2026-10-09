// EAN-13 / ISBN-13 barcode encoding (implemented from the public GS1 EAN-13 spec; no dependency).
// An ISBN-13 is an EAN-13 whose prefix is 978 or 979 ("Bookland").

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
// Parity of the left 6 digits chosen by the first digit.
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('need 12 digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function normalizeIsbn13(input: string): string | null {
  const d = String(input || '').replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(d)) return null;
  if (!/^97[89]/.test(d)) return null;
  return ean13CheckDigit(d.slice(0, 12)) === Number(d[12]) ? d : null;
}

/** 95-module string of '0'/'1' for an EAN-13 (13 digits, check digit validated). */
export function ean13Modules(digits: string): string {
  if (!/^\d{13}$/.test(digits)) throw new Error('EAN-13 needs 13 digits');
  if (ean13CheckDigit(digits.slice(0, 12)) !== Number(digits[12])) throw new Error('bad EAN-13 check digit');
  const parity = PARITY[Number(digits[0])];
  let out = '101';
  for (let i = 0; i < 6; i++) { const d = Number(digits[i + 1]); out += parity[i] === 'L' ? L[d] : G[d]; }
  out += '01010';
  for (let i = 0; i < 6; i++) out += R[Number(digits[i + 7])];
  return out + '101';
}
