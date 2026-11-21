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
  /** Boundary courses from the POB around and back (the first figure). */
  courses: SurveyCall[];
  /**
   * Every closed figure in the description. Most have one; "...TO POB; ALSO BEG..."
   * descriptions have several. courses === figures[0].
   */
  figures: SurveyCall[][];
  /** What the calls describe: the parcel, or the part EXCEPTED from it. */
  describes: 'parcel' | 'exception';
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
    // "(RECORDED AS 80.93 FT)" / "(MEAS ...)" - record-vs-measured notes, not extra calls.
    .replace(/\((?:AS\s+)?(?:RECORDED|REC'?D|RECORD|MEAS(?:URED)?|DEED|PLAT|CALC(?:ULATED)?)\b[^)]*?(?:\)|(?=\s+TO\s)|(?=\s+TH(?:ENCE)?\b)|$)/g, ' ')
    // "THN 26D" -> "TH N 26D"; "BG AT" -> "BEG AT"
    // "SURVEYED AS N 59D 36M 30S W 92.58 FT" - a measured alternate, not another call.
    .replace(/\b(?:SURVEYED|MEASURED|MEAS|ACTUAL)\s+AS\s+[NS][^;]{0,40}?\d[\d,.]*\s*(?:FT|FEET)\b/g, ' ')
    .replace(/\bT H\b/g, 'TH')
    // "07M E180.46 FT" -> "07M E 180.46 FT"
    .replace(/([\d'"MS]\s?[EW])(?=\d)/g, '$1 ')
    .replace(/\bTH(?=[NS]\s?\d)/g, 'TH ')
    .replace(/\bBG\b/g, 'BEG')
    .replace(/\b([NS])\s?(\d{1,2})M\s+(\d{1,2})M\b/g, '$1 $2D $3M')
    // Letter O typed for zero inside a bearing: "0D O9M"
    .replace(/(\d\s?(?:D|DEG|°)\s?)O(?=\d)/g, '$10')
    .replace(/[‘’′´`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/''/g, '"')
    .replace(/º/g, '°')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Bearing / distance grammar ──────────────────────────────────────────────

const NUM = String.raw`\d+(?:\.\d+)?`;
const DEG_U = String.raw`(?:°|\s*DEG(?:REE|R)?S?\.?|\s*D(?![A-Z])|-(?=\d))`;
const MIN_U = String.raw`(?:'|\s*MIN(?:UTE)?S?\.?|\s*M(?![A-Z])|-(?=\d))`;
const SEC_U = String.raw`(?:"|\s*SEC(?:OND)?S?\.?|\s*S(?=\s*[EW]\b)|(?=\s*[EW]\b))`;
/** Quadrant bearing. Groups: ns, deg, min, sec, ew. */
const BEARING_SRC = String.raw`\b([NS])\s*\.?\s*(${NUM})${DEG_U}\s*(?:(${NUM})${MIN_U}\s*)?(?:(${NUM})${SEC_U}\s*)?[,.]?\s*([EW])\b`;
/** Due-direction call with no angle: "TH S ALG E LINE WARD AVE S 22.77 FT". */
const CARDINAL_CALL = /^\W*(?:THENCE|TH)\b[^0-9;]{0,80}?\b([NSEW])\s+(\d[\d,]*(?:\.\d+)?)\s*(?:FT\b|FEET\b)(?!\s*(?:WD|WIDE))/;
const CARDINAL_LEAD = /^\W*(?:THENCE|TH)\s+(?:CONT\s+)?([NSEW])\s+(?:ALG|ALONG)\b[^;]{0,90}?\s(\d[\d,]*(?:\.\d+)?)\s*(?:FT\b|FEET\b)(?!\s*(?:WD|WIDE))/;
const CARDINAL: Record<string, Bearing> = { N: { ns: 'N', ew: 'E', deg: 0 }, S: { ns: 'S', ew: 'E', deg: 0 }, E: { ns: 'N', ew: 'E', deg: 90 }, W: { ns: 'N', ew: 'W', deg: 90 } };
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
  const radius = /\bRAD(?:IUS)?\.?\s*(?:OF\s*)?(?:=\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:FT|FEET|')?/.exec(seg)
    ?? /(\d[\d,]*(?:\.\d+)?)\s*(?:FT|FEET|')\s*RAD(?:IUS)?\b/.exec(seg);
  const arc = /\bARC\s*(?:DIST(?:ANCE)?|LENGTH|LEN)?\.?\s*(?:OF\s*)?(?:=\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:FT|FEET)/.exec(seg)
    ?? /(\d[\d,]*(?:\.\d+)?)\s*(?:FT|FEET)\s*(?:ALONG|ALG)\s*(?:THE\s*)?(?:SAID\s*)?ARC/.exec(seg);
  const deltaM = new RegExp(String.raw`(?:DELTA|CENTRAL ANGLE|CENT\.? ANG(?:LE)?)\s*(?:OF\s*)?(?:=\s*)?(${NUM})${DEG_U}\s*(?:(${NUM})${MIN_U}\s*)?(?:(${NUM})(?:"|\s*SEC(?:OND)?S?|\s*S\b)\s*)?`).exec(seg);
  const chordM = new RegExp(String.raw`(?:LONG\s+)?\bCH(?:ORD|RD|D|R)?\b\.?\s*(?:BRG|BEARING|BEARS|BRGS)?S?\.?[A-Z&\s]{0,24}?(?:OF\s*)?(?:IS\s*)?` + BEARING_SRC + String.raw`[,\s]*(?:A\s*(?:DIST(?:ANCE)?\s*)?(?:OF\s*)?)?(\d[\d,]*(?:\.\d+)?)?\s*(?:FT|FEET)?`).exec(seg);
  const concave = /CONCAVE\s*(?:TO\s*)?(?:THE\s*)?(NORTH\s*EAST|NORTH\s*WEST|SOUTH\s*EAST|SOUTH\s*WEST|NORTHEASTERLY|NORTHWESTERLY|SOUTHEASTERLY|SOUTHWESTERLY|NORTHERLY|SOUTHERLY|EASTERLY|WESTERLY|NORTH|SOUTH|EAST|WEST|NE|NW|SE|SW|N|S|E|W)\b/.exec(seg);
  const lr = /\b(?:CURVE|CURV|CUR|ARC|DEFLECT\w*)\b[^;]{0,40}?\bTO\s*(?:THE\s*)?(LEFT|RIGHT|L|R)\b|\b(LEFT|RIGHT)\s*(?:HAND\s*)?CURVE/.exec(seg);

  if (!radius && !arc && !deltaM && !chordM) return null;
  const call: CurveCall = { kind: 'curve', source: seg.trim() };
  if (radius) call.radius = num(radius[1]);
  if (arc) call.arc = num(arc[1]);
  else {
    // "ON CURVE TO R 19.46 FT RAD 369.98 FT": the arc is the distance that is
    // not the radius, not the chord and not a street width.
    const chordAt = chordM ? chordM.index : Infinity;
    const radAt = radius ? radius.index : -1;
    const radEnd = radius ? radius.index + radius[0].length : -1;
    const re = /(\d[\d,]*(?:\.\d+)?)\s*(?:FT\b|FEET\b)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg))) {
      if (m.index >= chordAt) break;
      if (m.index >= radAt && m.index < radEnd) continue;
      if (/^\s*(?:WD|WIDE|RAD)/.test(seg.slice(m.index + m[0].length, m.index + m[0].length + 6))) continue;
      call.arc = num(m[1]);
      break;
    }
  }
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
  if (lr) call.turn = (lr[1] || lr[2]).startsWith('L') ? 'left' : 'right';
  if (!call.chordBearing && !call.radius && call.delta === undefined) {
    const bm = new RegExp(BEARING_SRC).exec(seg);
    const b = bm && bearingFromMatch(bm);
    if (b) {
      const d = /(\d[\d,]*(?:\.\d+)?)\s*(?:FT\b|FEET\b)/.exec(seg.slice(bm!.index + bm![0].length));
      if (d) { call.chordBearing = b; call.chord = num(d[1]); call.arc = undefined; }
    }
  }
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
  const out: ParsedLegalDescription = { raw: raw || '', text, ties: [], courses: [], figures: [], describes: 'parcel', hasMetesAndBounds: false, notes: [] };
  if (!text) return out;

  out.lotDims = parseDims(text);
  out.plat = parsePlat(text);
  out.plss = parsePlss(text);
  const areaM = [...text.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:SQ\.?\s*FT|SQUARE FEET|S\.?F\.?)\b/g)];
  if (areaM.length) out.recordAreaSqFt = num(areaM[areaM.length - 1][1]);
  const acM = /(\d*\.\d+|\d+(?:\.\d+)?)\s*(?:AC(?:RES?)?)\b\.?/.exec(text);
  if (acM) out.recordAcres = parseFloat(acM[1]);
  if (/\bEXC(?:EPT)?\b/.test(text)) out.notes.push('Description has an EXCEPT clause - check the excepted part against the drawing.');

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
    if (/\b(?:CURVE|CURV|CUR)\b/.test(seg) && !new RegExp(BEARING_SRC).test(seg)) {
      // A curve call without radius, delta or chord cannot be computed - say so.
      const lr = /\bTO\s*(?:THE\s*)?(LEFT|RIGHT|L|R)\b/.exec(seg);
      const d = /(\d[\d,]*(?:\.\d+)?)\s*(?:FT\b|FEET\b)/.exec(seg);
      found.push({ call: { kind: 'curve', arc: d ? num(d[1]) : undefined, turn: lr ? (lr[1].startsWith('L') ? 'left' : 'right') : undefined, source: seg.trim() }, start: s0, end: s1 });
      out.notes.push(`A curve gives no radius, central angle or chord ("${seg.trim().slice(0, 60)}..."), so it cannot be computed.`);
      continue;
    }
    if (!new RegExp(BEARING_SRC).test(seg)) {
      const cm = CARDINAL_CALL.exec(seg) ?? CARDINAL_LEAD.exec(seg);
      if (cm) {
        found.push({ call: { kind: 'line', bearing: { ...CARDINAL[cm[1]] }, distance: num(cm[2]), source: cm[0].trim() }, start: s0 + cm.index, end: s0 + cm.index + cm[0].length });
        continue;
      }
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
  // Bearings that are written but impossible ("N 898D 21M W") - say so, never drop silently.
  for (const m of text.matchAll(/\b([NS])\s*(\d{1,4}(?:\.\d+)?)\s*(?:°|DEG\w*|D(?![A-Z]))[\d\sMS'".]{0,20}?([EW])\b/g)) {
    if (parseFloat(m[2]) > 90) out.notes.push(`Unreadable bearing "${m[0].trim()}" (more than 90°) - that call is missing from the traverse.`);
  }
  for (const m of text.matchAll(/\b(?:THENCE|TH)\s+(\d{1,2}(?:D|DEG\w*|°)\s*\d{1,2}(?:M|')[^;]{0,14}?[EW])\b/g)) {
    out.notes.push(`Bearing "${m[1].trim()}" has no N or S in the record - that call is missing from the traverse.`);
  }
  if (!found.length) return out;
  found.sort((a, b) => a.start - b.start);

  // ── Ties vs boundary ──
  const n = found.length;
  const afterText = found.map((f, i) => text.slice(f.end, i + 1 < n ? found[i + 1].start : text.length));
  const firstCallAt = found[0].start;
  const lead = text.slice(0, firstCallAt);
  let firstBoundary = 0;
  // (a) "COM AT ... TO POB": everything up to the first POB is the tie.
  const commences = /\bCOM(?:M|MENCING|MENCE)?\b/.test(text.slice(0, found[Math.min(1, n - 1)].start));
  const pobIdx = afterText.findIndex((t, i) => i < n - 1 && POB_RE.test(t.slice(0, 160)));
  if (pobIdx >= 0 && (commences || (!/\bALSO\b|\bBEG/.test(afterText[pobIdx]) && n - (pobIdx + 1) >= 3))) firstBoundary = pobIdx + 1;
  // (b) "... N 59 52 01 E 472.8 FT FROM the E line of Woodward ...": a located-from call.
  for (let i = 0; i < n - 2; i++) {
    if (/\bFROM\b/.test(afterText[i].slice(0, 150)) && !POB_RE.test(afterText[i].slice(0, 40)) && n - (i + 1) >= 3) firstBoundary = Math.max(firstBoundary, i + 1);
    else if (i >= firstBoundary + 2) break;
  }
  // (c) "BEG FROM INTSEC ... N 26D W 602.46 & N 59D E 183 FT TH ...": calls in the BEG clause after FROM.
  const begAt = lead.search(/\bBEG(?:INNING|INNG|IN)?\b/);
  if (begAt >= 0 && /\bFROM\b/.test(lead.slice(begAt)) && !/\bTHENCE\b|\bTH\b|;/.test(lead.slice(begAt))) {
    const firstTh = text.slice(firstCallAt).search(/\bTHENCE\b|\bTH\b|;/);
    if (firstTh >= 0) {
      const k = found.filter(f => f.start < firstCallAt + firstTh).length;
      if (n - k >= 3) firstBoundary = Math.max(firstBoundary, k);
    }
  }

  // ── Figures: "...TO POB; ALSO BEG..." splits into separate closed parts ──
  const figures: FoundCall[][] = [[]];
  for (let i = firstBoundary; i < n; i++) {
    figures[figures.length - 1].push(found[i]);
    const closes = i < n - 1 && POB_RE.test(afterText[i].slice(0, 160));
    if (closes && figures[figures.length - 1].length >= 2) figures.push([]);
  }
  const figs = figures.filter(f => f.length >= 2).map(f => f.map(x => x.call));

  // ── Exception: "EXC THAT PT DESC AS BEG ..." describes what is taken OUT ──
  const firstCourseAt = found[firstBoundary]?.start ?? text.length;
  const exc = /\bEXC(?:EPT|EPTING)?\b/.exec(text);
  if (exc && exc.index < firstCourseAt && /\bEXC(?:EPT|EPTING)?\s+(?:THE\s+)?(?:THAT\s+)?(?:PT|PART|PORTION|PARCEL)\b[\s\S]*?\b(?:DESC|BEG|COM)/.test(text.slice(exc.index, firstCourseAt))) {
    out.describes = 'exception';
    out.notes.push('The bearings and distances describe the part EXCEPTED from this parcel, not the parcel itself - no deed line is drawn for it.');
  }

  out.ties = found.slice(0, firstBoundary).map(f => f.call);
  out.figures = figs;
  out.courses = figs[0] ?? found.slice(firstBoundary).map(f => f.call);
  out.hasMetesAndBounds = out.courses.length >= 2;
  if (figs.length > 1) out.notes.push(`The description has ${figs.length} separate parts; each is run as its own boundary.`);
  for (const c of out.courses) {
    if (c.kind === 'curve' && !(c.chordBearing || c.turn || c.concaveAz !== undefined)) {
      out.notes.push('A curve has no chord bearing or direction — assumed tangent to the previous course.');
    }
  }
  return out;
}
