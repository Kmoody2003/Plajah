/**
 * Legal description reader — turns assessor-roll prose into survey calls.
 *
 * Detroit's roll mixes three kinds of description, often in one field:
 *
 *   1. Platted lot   "N NEBRASKA 6 JULIUS PORATH SUB L26 P74 PLATS, W C R 10/63 30 X 110"
 *                    → side of street, lot number(s), subdivision, plat liber/page, and
 *                      the assessor's frontage × depth (or "30 IRREG").
 *   2. Aliquot part  "E 140 FT OF N 495 FT OF … NW 1/4 SEC 9 T 1 S R 12 E"
 *                    → PLSS section/township/range.
 *   3. Metes and bounds "BEG AT … TH N 30 DEG 07'44" W 260.28 FT; TH … TO P.O.B."
 *                    → the calls a surveyor closes.
 *
 * For (3) the reader separates TIE calls (commencement — "COM AT … TO POB", or a
 * "distant … FROM" clause) from BOUNDARY courses, and reads circular curves in
 * the usual record forms (radius / arc / delta / chord bearing & chord / concave
 * direction or left/right).
 *
 * Bearings are tolerated in every abbreviation seen on the roll:
 *   N 59 DEGRS 52MIN 1SEC E · S 63 DEG 50'47" W · N39 DEG 12'43" E · N 30D 06M W · N 30°07'44" W
 */

import { dmsToDeg, compassToAzimuth, type Bearing } from './cogo';

export interface LineCall {
  kind: 'line';
  bearing: Bearing;
  distance: number;
  /** Verbatim slice of the description this call was read from. */
  source: string;
}

export interface CurveCall {
  kind: 'curve';
  radius?: number;
  arc?: number;
  /** Central angle, decimal degrees. */
  delta?: number;
  chordBearing?: Bearing;
  chord?: number;
  /** Which way the curve turns, walking the course. */
  turn?: 'left' | 'right';
  /** Azimuth toward the centre, from "CONCAVE TO THE NE". */
  concaveAz?: number;
  source: string;
}

export type SurveyCall = LineCall | CurveCall;

export interface PlatRef {
  /** Side of street the assessor lists the lot on (N/S/E/W). */
  streetSide?: string;
  street?: string;
  lots?: string;
  subdivision?: string;
  liber?: string;
  page?: string;
}

export interface ParsedLegalDescription {
  raw: string;
  /** Normalised upper-case text the calls were read from. */
  text: string;
  /** Commencement / tie calls — locate the POB, NOT part of the boundary. */
  ties: SurveyCall[];
  /** Boundary courses from the POB around and back. */
  courses: SurveyCall[];
  hasMetesAndBounds: boolean;
  /** Assessor dimensions at the tail: "30 X 110" or "30 IRREG". */
  lotDims?: { frontage: number; depth?: number; irregular: boolean };
  /** Area as written in the record (sq ft). */
  recordAreaSqFt?: number;
  recordAcres?: number;
  plat?: PlatRef;
  plss?: { quarter?: string; section?: string; township?: string; range?: string };
  /** Things the reader saw but could not resolve (curves without enough data, EXC clauses…). */
  notes: string[];
}

// ─── Normalisation ───────────────────────────────────────────────────────────

export function normaliseLegal(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\r?\n/g, ' ')
    .replace(/[‘’′´`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/''/g, '"')
    .replace(/º/g, '°')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Bearing / distance grammar ──────────────────────────────────────────────

const NUM = String.raw`\d+(?:\.\d+)?`;
const DEG_U = String.raw`(?:°|\s*DEG(?:REE|R)?S?\.?|\s*D(?![A-Z]))`;
const MIN_U = String.raw`(?:'|\s*MIN(?:UTE)?S?\.?|\s*M(?![A-Z]))`;
const SEC_U = String.raw`(?:"|\s*SEC(?:OND)?S?\.?|\s*S(?=\s*[EW]\b))`;
/** Quadrant bearing. Groups: ns, deg, min, sec, ew. */
const BEARING_SRC = String.raw`\b([NS])\s*\.?\s*(${NUM})${DEG_U}\s*(?:(${NUM})${MIN_U}\s*)?(?:(${NUM})${SEC_U}\s*)?[,.]?\s*([EW])\b`;
const DIST_RE = new RegExp(String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|${NUM})\s*(?:FT\b|FEET\b|FT\.)`, 'g');
const POB_RE = /P\.?\s*O\.?\s*B\b|POINT OF BEGINNING|PO?I?N?TE? OF BEG(?:INNING)?\b|PL(?:ACE)? OF BEG/;

export function parseBearing(s: string): Bearing | null {
  const m = new RegExp(BEARING_SRC).exec(normaliseLegal(s));
  return m ? bearingFromMatch(m) : null;
}

function bearingFromMatch(m: RegExpExecArray): Bearing | null {
  const deg = dmsToDeg(parseFloat(m[2]), m[3] ? parseFloat(m[3]) : 0, m[4] ? parseFloat(m[4]) : 0);
  if (!(deg >= 0 && deg <= 90)) return null;
  return { ns: m[1] as 'N' | 'S', ew: m[5] as 'E' | 'W', deg };
}

const num = (s: string) => parseFloat(s.replace(/,/g, ''));

/** First distance in `s` that is not a street/alley width ("60 FT WD"). */
function firstDistance(s: string): { value: number; end: number } | null {
  DIST_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIST_RE.exec(s))) {
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (/^\s*(?:WD|WIDE|WIDTH)\b/.test(after)) continue;
    const before = s.slice(Math.max(0, m.index - 12), m.index);
    if (/\bRAD(?:IUS)?\.?\s*(?:OF\s*)?$|\bARC\b[^0-9]*$|CHORD|CHD/.test(before)) continue;
    return { value: num(m[1]), end: m.index + m[0].length };
  }
  return null;
}

// ─── Curves ──────────────────────────────────────────────────────────────────

const CURVE_HINT = /\bCURVE\b|\bCUR\b|\bCURV\b|\bARC\b|\bRAD(?:IUS)?\b/;

function parseCurve(seg: string): CurveCall | null {
  const radius = /\bRAD(?:IUS)?\.?\s*(?:OF\s*)?(?:=\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:FT|FEET|')?/.exec(seg);
  const arc = /\bARC\s*(?:DIST(?:ANCE)?|LENGTH|LEN)?\.?\s*(?:OF\s*)?(?:=\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:FT|FEET)/.exec(seg)
    ?? /(\d[\d,]*(?:\.\d+)?)\s*(?:FT|FEET)\s*(?:ALONG|ALG)\s*(?:THE\s*)?(?:SAID\s*)?ARC/.exec(seg);
  const deltaM = new RegExp(String.raw`(?:DELTA|CENTRAL ANGLE|CENT\.? ANG(?:LE)?)\s*(?:OF\s*)?(?:=\s*)?(${NUM})${DEG_U}\s*(?:(${NUM})${MIN_U}\s*)?(?:(${NUM})(?:"|\s*SEC(?:OND)?S?)\s*)?`).exec(seg);
  const chordM = new RegExp(String.raw`(?:CH(?:OR)?D\.?|LONG CHORD)\s*(?:BRG|BEARING|BEARS|BRGS)?S?\.?\s*(?:OF\s*)?(?:IS\s*)?` + BEARING_SRC + String.raw`[,\s]*(?:A\s*(?:DIST(?:ANCE)?\s*)?(?:OF\s*)?)?(\d[\d,]*(?:\.\d+)?)?\s*(?:FT|FEET)?`).exec(seg);
  const concave = /CONCAVE\s*(?:TO\s*)?(?:THE\s*)?(NORTH\s*EAST|NORTH\s*WEST|SOUTH\s*EAST|SOUTH\s*WEST|NORTHEASTERLY|NORTHWESTERLY|SOUTHEASTERLY|SOUTHWESTERLY|NORTHERLY|SOUTHERLY|EASTERLY|WESTERLY|NORTH|SOUTH|EAST|WEST|NE|NW|SE|SW|N|S|E|W)\b/.exec(seg);
  const lr = /(?:CURVE|ARC|DEFLECT\w*)\s*(?:TO\s*)?(?:THE\s*)?(LEFT|RIGHT)\b|\b(LEFT|RIGHT)\s*(?:HAND\s*)?CURVE/.exec(seg);

  if (!radius && !arc && !deltaM && !chordM) return null;
  const call: CurveCall = { kind: 'curve', source: seg.trim() };
  if (radius) call.radius = num(radius[1]);
  if (arc) call.arc = num(arc[1]);
  if (deltaM) call.delta = dmsToDeg(parseFloat(deltaM[1]), deltaM[2] ? parseFloat(deltaM[2]) : 0, deltaM[3] ? parseFloat(deltaM[3]) : 0);
  if (chordM) {
    const b = bearingFromMatch(chordM);
    if (b) call.chordBearing = b;
    if (chordM[6]) call.chord = num(chordM[6]);
  }
  if (concave) {
    const az = compassToAzimuth(concave[1].replace(/\s+/g, ''));
    if (az !== null) call.concaveAz = az;
  }
  if (lr) call.turn = (lr[1] || lr[2]) === 'LEFT' ? 'left' : 'right';
  return call;
}

// ─── Plat / PLSS / dims ──────────────────────────────────────────────────────

function parsePlat(text: string): PlatRef | undefined {
  const lp = /\bL(?:IBER)?\.?\s*(\d+)\s*,?\s*P(?:AGE|G)?S?\.?\s*(\d+(?:-\d+)?)/.exec(text);
  const head = /^(?:.*?\.\s+)?([NSEW])\s+([A-Z0-9 .']+?)\s+((?:(?:PT OF |PART OF |[NSEW]\s*[\d.]+\s*FT(?: OF)?\s*)*(?:LOTS?\s*)?\d+[A-Z]?(?:\s*(?:THRU|TO|-|&|AND|,)\s*\d+[A-Z]?)*))\s+(.+?(?:SUB(?:DIVISION)?|PLAT|ADDITION|ADD|PLAN|PARK|HEIGHTS|GARDENS|MANOR|FARMS?)\b[^L]*?)\s+L\.?\s*\d+/.exec(text);
  if (!lp && !head) return undefined;
  const ref: PlatRef = {};
  if (lp) { ref.liber = lp[1]; ref.page = lp[2]; }
  // The head pattern is greedy on long metes-and-bounds prose — keep only
  // values that look like a street, a lot list and a subdivision name.
  if (head && head[2].length <= 30 && head[3].length <= 40 && head[4].length <= 60 && !/\d{2,}FT|DESC|THRU .* THRU/.test(head[4])) {
    ref.streetSide = head[1];
    ref.street = head[2].trim();
    ref.lots = head[3].trim();
    ref.subdivision = head[4].trim().replace(/^(?:[NSEW]\s*[\d.]+\s*FT\s*(?:OF\s*)?\d+[A-Z]?\s*)+/, '');
  }
  return ref;
}

function parsePlss(text: string) {
  const m = /(?:((?:[NSEW]{1,2}\s*1\/[24]\s*(?:OF\s*)?)+)\s*)?SEC(?:TION)?\.?\s*(\d+)\s*,?\s*T(?:OWN(?:SHIP)?)?\.?\s*(\d+\s*[NS])\s*,?\s*R(?:ANGE)?\.?\s*(\d+\s*[EW])/.exec(text);
  if (!m) return undefined;
  return { quarter: m[1]?.trim(), section: m[2], township: m[3].replace(/\s+/g, ' '), range: m[4].replace(/\s+/g, ' ') };
}

function parseDims(text: string) {
  const tail = text.replace(/SPLIT.*$/, '').trim();
  const x = /(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*(?:IRREG)?\s*$/.exec(tail);
  if (x) return { frontage: parseFloat(x[1]), depth: parseFloat(x[2]), irregular: /IRREG\s*$/.test(tail) };
  const irr = /(\d+(?:\.\d+)?)\s*IRREG\s*$/.exec(tail);
  if (irr) return { frontage: parseFloat(irr[1]), irregular: true };
  return undefined;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface FoundCall { call: SurveyCall; start: number; end: number }

export function parseLegalDescription(raw: string | undefined | null): ParsedLegalDescription {
  const text = normaliseLegal(raw || '');
  const out: ParsedLegalDescription = { raw: raw || '', text, ties: [], courses: [], hasMetesAndBounds: false, notes: [] };
  if (!text) return out;

  out.lotDims = parseDims(text);
  out.plat = parsePlat(text);
  out.plss = parsePlss(text);
  const areaM = [...text.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:SQ\.?\s*FT|SQUARE FEET|S\.?F\.?)\b/g)];
  if (areaM.length) out.recordAreaSqFt = num(areaM[areaM.length - 1][1]);
  const acM = /(\d*\.\d+|\d+(?:\.\d+)?)\s*(?:AC(?:RES?)?)\b\.?/.exec(text);
  if (acM) out.recordAcres = parseFloat(acM[1]);
  if (/\bEXC(?:EPT)?\b/.test(text)) out.notes.push('Description has an EXCEPT clause — the excepted part is not subtracted here.');

  // Segment at THENCE / TH / ; — each segment is one or more calls.
  const segRe = /\bTHENCE\b|\bTHEN\b|\bTH\b|;/g;
  const cuts: number[] = [0];
  let sm: RegExpExecArray | null;
  while ((sm = segRe.exec(text))) cuts.push(sm.index);
  cuts.push(text.length);

  const found: FoundCall[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const s0 = cuts[i], s1 = cuts[i + 1];
    const seg = text.slice(s0, s1);
    if (CURVE_HINT.test(seg) && /\bRAD|\bARC|DELTA|CHORD|CHD/.test(seg)) {
      const c = parseCurve(seg);
      if (c) { found.push({ call: c, start: s0, end: s1 }); continue; }
    }
    const bre = new RegExp(BEARING_SRC, 'g');
    let bm: RegExpExecArray | null;
    while ((bm = bre.exec(seg))) {
      const b = bearingFromMatch(bm);
      if (!b) continue;
      const rest = seg.slice(bm.index + bm[0].length);
      // Distance must come before the next bearing in this segment.
      const nextB = new RegExp(BEARING_SRC).exec(rest);
      const window = nextB ? rest.slice(0, nextB.index) : rest;
      const d = firstDistance(window);
      if (!d) continue;
      const absStart = s0 + bm.index;
      const absEnd = s0 + bm.index + bm[0].length + d.end;
      found.push({ call: { kind: 'line', bearing: b, distance: d.value, source: text.slice(absStart, absEnd) }, start: absStart, end: absEnd });
      bre.lastIndex = bm.index + bm[0].length + d.end;
    }
  }
  if (!found.length) return out;

  // Classify ties vs boundary.
  const afterText = found.map((f, i) => text.slice(f.end, i + 1 < found.length ? found[i + 1].start : text.length));
  let firstBoundary = 0;
  const pobIdx = afterText.findIndex((t, i) => i < found.length - 1 && POB_RE.test(t.slice(0, 160)));
  if (pobIdx >= 0) firstBoundary = pobIdx + 1;
  else if (/\bFROM\b/.test(afterText[0].split(/\bTHENCE\b|\bTH\b|;/)[0])) firstBoundary = 1;

  out.ties = found.slice(0, firstBoundary).map(f => f.call);
  out.courses = found.slice(firstBoundary).map(f => f.call);
  out.hasMetesAndBounds = out.courses.length >= 2;
  for (const c of out.courses) {
    if (c.kind === 'curve' && !(c.chordBearing || c.turn || c.concaveAz !== undefined)) {
      out.notes.push('A curve has no chord bearing or direction — assumed tangent to the previous course.');
    }
  }
  return out;
}
