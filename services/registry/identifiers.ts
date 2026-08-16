/**
 * Plajah Identifier Registry — format and check-digit validation (Phase 0).
 *
 * Pure functions, no I/O, no Firestore. Every identifier that enters the registry passes
 * through `validateId` first, so a bad ISRC is caught at ingest instead of surfacing as a
 * rejected DDEX delivery three weeks later.
 *
 * Normalisation rule: strip separators and whitespace, upper-case. Store the normalised
 * form in `ExternalId.value`; format for display with `formatId`.
 */

import type { IdScheme } from './types';

export interface IdValidation {
  valid: boolean;
  /** Normalised value when valid (or best-effort when not). */
  normalized: string;
  /** Human-readable reason when invalid. */
  reason?: string;
  /** True when only the shape was checked because the scheme has no check digit, or
   *  because Plajah does not yet implement its checksum (see notes below). */
  checksumChecked: boolean;
}

const ok = (normalized: string, checksumChecked = true): IdValidation =>
  ({ valid: true, normalized, checksumChecked });
const bad = (normalized: string, reason: string, checksumChecked = false): IdValidation =>
  ({ valid: false, normalized, reason, checksumChecked });

/** Strip separators/whitespace and upper-case. Safe for every scheme handled here. */
export function normalizeId(raw: string): string {
  return (raw || '').replace(/[\s\-–—.·:/]/g, '').toUpperCase();
}

// ─── Check-digit primitives ───────────────────────────────────────────────────

/** GS1 mod-10 (GTIN-8/12/13/14, ISBN-13, ISSN-13). Weights alternate 3,1 from the right. */
function gs1Mod10Valid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  // Weight 3 applies to the digit immediately left of the check digit, then alternates.
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(digits[i]) * w;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[digits.length - 1]);
}

/** ISO 7064 MOD 11-2 — used by ISNI (and ISBN-10). Check char may be 'X'. */
function mod112Valid(body: string, check: string): boolean {
  if (!/^\d+$/.test(body)) return false;
  let r = 0;
  for (const d of body) r = (r + Number(d)) * 2 % 11;
  const computed = (12 - r) % 11;
  return (computed === 10 ? 'X' : String(computed)) === check.toUpperCase();
}

// ─── Per-scheme validators ────────────────────────────────────────────────────

/**
 * ISRC — CC (ISO 3166 country or 'QM'/'ZZ' style pools) + 3-char alphanumeric registrant +
 * 2-digit year + 5-digit designation. No check digit exists; format is all that can be
 * verified offline. Duplicate detection across the catalogue is done by the ingest service,
 * not here — duplicate ISRCs are the #1 rejection cause at major-DSP ingestion.
 */
export function validateIsrc(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(v)) {
    return bad(v, 'ISRC must be 2 letters, 3 alphanumerics, 2-digit year, 5-digit designation');
  }
  return ok(v, false);
}

/**
 * ISWC — 'T' + 9 digits + 1 check digit.
 * Check = (10 − ((1 + Σ i·dᵢ) mod 10)) mod 10, i = 1…9.
 * Verified against T-034.524.680-1 → 1. ✔
 */
export function validateIswc(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^T\d{10}$/.test(v)) return bad(v, "ISWC must be 'T' followed by 10 digits");
  let sum = 1;
  for (let i = 0; i < 9; i++) sum += (i + 1) * Number(v[i + 1]);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(v[10]) ? ok(v) : bad(v, 'ISWC check digit does not match');
}

/** ISBN-13 (and ISBN-A/GTIN-13 for books). ISBN-10 is normalised separately on ingest. */
export function validateIsbn13(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^\d{13}$/.test(v)) return bad(v, 'ISBN-13 must be 13 digits');
  if (!/^97[89]/.test(v)) return bad(v, 'ISBN-13 must start with 978 or 979');
  return gs1Mod10Valid(v) ? ok(v) : bad(v, 'ISBN-13 check digit does not match');
}

/** ISBN-10 (legacy) — mod 11-2 with an 'X' check character. Convert to ISBN-13 on ingest. */
export function validateIsbn10(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^\d{9}[\dX]$/.test(v)) return bad(v, 'ISBN-10 must be 9 digits plus a check character');
  // ISBN-10 uses weighted mod 11 (weights 10…2), not the ISNI recurrence.
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(v[i]);
  const check = (11 - (sum % 11)) % 11;
  const expected = check === 10 ? 'X' : String(check);
  return expected === v[9] ? ok(v) : bad(v, 'ISBN-10 check digit does not match');
}

/** Convert a valid ISBN-10 to its ISBN-13 form. Returns null when the input is invalid. */
export function isbn10To13(raw: string): string | null {
  if (!validateIsbn10(raw).valid) return null;
  const body = '978' + normalizeId(raw).slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
}

/** GTIN-8/12/13/14 — UPC-12 and EAN-13 both normalise into this. */
export function validateGtin(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^\d{8}$|^\d{12,14}$/.test(v)) return bad(v, 'GTIN must be 8, 12, 13 or 14 digits');
  return gs1Mod10Valid(v) ? ok(v) : bad(v, 'GTIN check digit does not match');
}

/** ISNI / ORCID — 16 characters, last may be 'X', ISO 7064 MOD 11-2. */
export function validateIsni(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^\d{15}[\dX]$/.test(v)) return bad(v, 'ISNI must be 15 digits plus a check character');
  return mod112Valid(v.slice(0, 15), v[15]) ? ok(v) : bad(v, 'ISNI check digit does not match');
}

/**
 * IPI Name Number — 11 digits. The CISAC check-digit algorithm is not public, so this is a
 * shape check only; a wrong IPI surfaces when the PRO rejects the CWR registration.
 */
export function validateIpi(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^\d{9,11}$/.test(v)) return bad(v, 'IPI name number must be 9–11 digits');
  return ok(v.padStart(11, '0'), false);
}

/** GRid — 'A1' scheme prefix + 5-char issuer + 10-char release + 1 check character. */
export function validateGrid(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^A1[A-Z0-9]{15}[A-Z0-9]$/.test(v)) return bad(v, "GRid must be 'A1' plus 16 alphanumerics");
  return ok(v, false);
}

/**
 * EIDR — a DOI under the 10.5240 prefix: 5 groups of 4 hex digits plus an ISO 7064 MOD 37,36
 * check character. Shape-checked only; the checksum is deliberately not implemented rather
 * than implemented wrongly. Verify against the EIDR API when membership exists.
 */
export function validateEidr(raw: string): IdValidation {
  const v = (raw || '').trim().toUpperCase();
  if (!/^10\.5240\/([0-9A-F]{4}-){5}[0-9A-Z]$/.test(v)) {
    return bad(v, 'EIDR must be 10.5240/XXXX-XXXX-XXXX-XXXX-XXXX-C');
  }
  return ok(v, false);
}

/** ISAN — 24 hex digits (root+episode+version), optionally with check characters. */
export function validateIsan(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^[0-9A-F]{24}([0-9A-Z][0-9A-F]{8}[0-9A-Z])?$/.test(v)) {
    return bad(v, 'ISAN must be 24 hex digits (root) or the full 36-character versioned form');
  }
  return ok(v, false);
}

/**
 * ASIN — Amazon's own identifier. 10 characters: modern ones start 'B0…', legacy book ASINs
 * are the ISBN-10. This is what a KDP ebook is actually identified by; no ISBN is involved.
 */
export function validateAsin(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^[A-Z0-9]{10}$/.test(v)) return bad(v, 'ASIN must be 10 alphanumeric characters');
  return ok(v, false);
}

/** Open Library id — OL<digits><M|W|A> (edition / work / author). Free catalogue presence. */
export function validateOlid(raw: string): IdValidation {
  const v = normalizeId(raw);
  if (!/^OL\d+[MWA]$/.test(v)) return bad(v, 'Open Library id must look like OL12345M');
  return ok(v, false);
}

/**
 * ARK — `ark:/<NAAN>/<name>`. Separators are meaningful here, so this one is NOT run through
 * `normalizeId`. Check-character verification lives in registry/ark.ts (`verifyArk`).
 */
export function validateArk(raw: string): IdValidation {
  const v = (raw || '').trim().toLowerCase();
  if (!/^ark:\/?[0-9]{5,9}\/[a-z0-9._~/-]+$/.test(v)) {
    return bad(v, 'ARK must look like ark:/12345/name');
  }
  return ok(v, false);
}

/** ISCC — ISO 24138. 'ISCC:' scheme prefix plus a base32 body; computed, never typed. */
export function validateIscc(raw: string): IdValidation {
  const v = (raw || '').trim().toUpperCase().replace(/^ISCC:/, '');
  if (!/^[A-Z2-7]{10,120}$/.test(v)) return bad(`ISCC:${v}`, 'ISCC body must be base32 (RFC 4648, no padding)');
  return ok(`ISCC:${v}`, false);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Validate any supported scheme. Schemes with no offline validation (catalogue numbers,
 * SKUs, IMDb/TMDB ids, DIDs) pass a shape check and report `checksumChecked: false`.
 */
export function validateId(scheme: IdScheme, raw: string): IdValidation {
  switch (scheme) {
    case 'ISRC':   return validateIsrc(raw);
    case 'ISWC':   return validateIswc(raw);
    case 'ISBN13': return validateIsbn13(raw);
    case 'ISBN10': return validateIsbn10(raw);
    case 'GTIN':   return validateGtin(raw);
    case 'ISNI':
    case 'ORCID':  return validateIsni(raw);
    case 'IPI':    return validateIpi(raw);
    case 'GRID':   return validateGrid(raw);
    case 'EIDR':   return validateEidr(raw);
    case 'ISAN':   return validateIsan(raw);
    case 'ISCC':   return validateIscc(raw);
    case 'ASIN':   return validateAsin(raw);
    case 'OLID':   return validateOlid(raw);
    case 'ARK':    return validateArk(raw);
    case 'DID': {
      const v = (raw || '').trim();
      return /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(v) ? ok(v, false) : bad(v, 'Not a valid DID');
    }
    default: {
      const v = (raw || '').trim();
      return v ? ok(v, false) : bad(v, 'Empty identifier');
    }
  }
}

// ─── Display formatting ───────────────────────────────────────────────────────

/** Render a normalised identifier in its conventional human-readable form. */
export function formatId(scheme: IdScheme, normalized: string): string {
  const v = normalized || '';
  switch (scheme) {
    case 'ISRC':
      return v.length === 12 ? `${v.slice(0, 2)}-${v.slice(2, 5)}-${v.slice(5, 7)}-${v.slice(7)}` : v;
    case 'ISWC':
      return v.length === 11 ? `T-${v.slice(1, 4)}.${v.slice(4, 7)}.${v.slice(7, 10)}-${v[10]}` : v;
    case 'ISBN13':
      return v.length === 13 ? `${v.slice(0, 3)}-${v.slice(3, 4)}-${v.slice(4, 8)}-${v.slice(8, 12)}-${v[12]}` : v;
    case 'ISNI':
    case 'ORCID':
      return v.length === 16 ? `${v.slice(0, 4)} ${v.slice(4, 8)} ${v.slice(8, 12)} ${v.slice(12)}` : v;
    case 'GRID':
      return v.length === 18 ? `${v.slice(0, 2)}-${v.slice(2, 7)}-${v.slice(7, 17)}-${v[17]}` : v;
    default:
      return v;
  }
}

/**
 * Build the country/registrant portion of an ISRC from Plajah's own registrant code, and
 * assign the 5-digit designation. Callers own the sequence (one registrant code allows
 * 100,000 designations per year, so the counter must be per-year and collision-checked).
 */
export function buildIsrc(countryCode: string, registrantCode: string, year: number, designation: number): string {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const rc = registrantCode.toUpperCase().slice(0, 3);
  const yy = String(year % 100).padStart(2, '0');
  const nn = String(designation).padStart(5, '0');
  if (designation < 0 || designation > 99999) throw new Error('ISRC designation must be 0–99999');
  return `${cc}${rc}${yy}${nn}`;
}

/** Append the GS1 mod-10 check digit to a GTIN body (company prefix + item reference). */
export function appendGtinCheckDigit(body: string): string {
  if (!/^\d+$/.test(body)) throw new Error('GTIN body must be digits');
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return body + String((10 - (sum % 10)) % 10);
}
