/**
 * Provenance: the Provenance Slate text and the compile-time honesty gates.
 *
 * The label gate is the build's refusal to be dishonest: a direct cut from an archive plate to a reconstruction
 * does not compile. Other gates keep the grammar the Council set: reconstructions never open or close a room, at most
 * one is full-bleed, every plate carries its slate, printed pages are held, lower thirds are rare and never on faces.
 */
import type { CouncilFilm, CouncilShot, PlateSpec, Slate, TransitionName } from './councilTypes';

export class CouncilGateError extends Error {
  constructor(readonly issues: string[]) {
    super(`Council film refused to compile:\n - ${issues.join('\n - ')}`);
    this.name = 'CouncilGateError';
  }
}

export const STAMP_TEXT = 'RECONSTRUCTION';

/** The two slate lines for a plate. Archive: what it is, then ARCHIVE + source, year, licence. */
export function slateLines(p: PlateSpec): { stamp: boolean; line1: string; line2: string } {
  const s = p.slate;
  if (p.kind === 'reconstruction') return { stamp: true, line1: STAMP_TEXT, line2: s.evidence ?? '' };
  return { stamp: false, line1: s.title ?? '', line2: archiveLine(s) };
}

export function archiveLine(s: Slate): string {
  return ['ARCHIVE', s.source, s.year, s.licence].filter(Boolean).join(' · ');
}

/** Archive slate completeness: institution/author, year and licence, plus what the plate is. */
export function slateComplete(p: PlateSpec): boolean {
  if (p.kind === 'reconstruction') return !!p.slate.evidence && p.slate.evidence.trim().length > 20;
  const s = p.slate;
  return !!(s.title && s.source && s.year && s.licence);
}

const isArchive = (s: CouncilShot) => (s.plates ?? []).length > 0 && (s.plates ?? []).every(p => p.kind === 'archive');
const hasRecon = (s: CouncilShot) => (s.plates ?? []).some(p => p.kind === 'reconstruction');

/**
 * Runs the structural gates on the shot list (before timing). Returns issues; the compiler throws if any.
 * `titleIsArchive`: the title sequence's plate is an archive photograph, so shot 0 follows an archive plate.
 */
export function labelGate(film: CouncilFilm): string[] {
  const issues: string[] = [];
  const shots = film.shots;
  let fullBleed = 0;
  shots.forEach((s, i) => {
    const prev = i === 0 ? undefined : shots[i - 1];
    const prevArchive = i === 0 ? film.titlePlate.kind === 'archive' : !!prev && isArchive(prev);
    const tr: TransitionName = s.transition ?? 'breath';
    if (hasRecon(s)) {
      if (prevArchive && tr !== 'reconGate') issues.push(`label gate: ${s.id} cuts from an archive plate straight to a reconstruction (transition '${tr}'); it must enter through the Reconstruction Gate`);
      const first = shots.findIndex(x => x.room === s.room), last = shots.map(x => x.room).lastIndexOf(s.room);
      if (i === first) issues.push(`${s.id}: a reconstruction never opens a room`);
      if (i === last) issues.push(`${s.id}: a reconstruction never closes a room`);
      for (const p of s.plates ?? []) {
        if (p.kind === 'reconstruction' && !slateComplete(p)) issues.push(`${s.id}: reconstruction ${p.asset} lacks its stamp evidence line`);
        if (p.fullBleed) fullBleed++;
      }
      if ((s.plates ?? []).some(p => p.kind === 'archive')) issues.push(`${s.id}: an archive plate and a reconstruction share a shot; the plate must be shown beside or immediately after, in its own shot`);
    } else if (tr === 'reconGate') {
      issues.push(`${s.id}: Reconstruction Gate used on a shot with no reconstruction`);
    }
    for (const p of s.plates ?? []) {
      if (p.kind === 'archive' && !slateComplete(p)) issues.push(`${s.id}: archive plate ${p.asset} lacks title, source, year or licence in its slate`);
      if (p.fullBleed && p.kind !== 'reconstruction') issues.push(`${s.id}: only a reconstruction may be full-bleed`);
    }
    if (tr === 'silenceHold' && s.kind !== 'card') issues.push(`${s.id}: Silence Hold must be a content card`);
    if (s.kind === 'card' && !s.card?.lines.length) issues.push(`${s.id}: card has no text`);
    if (s.kind !== 'card' && s.kind !== 'animatedPainting' && s.kind !== 'graphic' && !(s.plates?.length)) issues.push(`${s.id}: shot has no plate`);
    if (s.kind === 'graphic' && !s.graphic) issues.push(`${s.id}: graphic shot has no graphic`);
    for (const p of s.plates ?? []) if (p.treatment && !/isolat/i.test(p.slate.title ?? '')) issues.push(`${s.id}: a colour-isolated plate must say so in its slate title`);
    if (tr === 'stampSlam' && !s.stamp) issues.push(`${s.id}: Stamp Slam needs the spoken year or number it lands on`);
  });
  if (fullBleed > 1) issues.push(`${fullBleed} full-bleed reconstructions; the owner allows exactly one per film`);
  if (!slateComplete(film.titlePlate)) issues.push('title plate lacks its slate');
  return issues;
}


/** Runs of non-Latin script (Syriac, Arabic/Urdu, Devanagari, Gurmukhi and the other Indic scripts, CJK, Hangul). */
const NON_LATIN = /[\u0590-\u08FF\u0900-\u0DFF\u2E80-\u9FFF\uA000-\uFDFF\uFE70-\uFEFF]+/g;

const collectStrings = (v: unknown, out: string[], skip: Set<string>) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => collectStrings(x, out, skip));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!skip.has(k)) collectStrings(x, out, skip);
};

/**
 * Non-Latin gate: the film may set only the non-Latin strings the exhibit's own data or theme carries (film.allowedScripts, each
 * naming its source file). Anything else, in any caption, card, slate or end-card string, refuses to compile: a wrong
 * Urdu, Devanagari, Gurmukhi, Syriac or Chinese string shipped unproofed is worse than none.
 */
export function nonLatinGate(film: CouncilFilm): string[] {
  const allowed = (film.allowedScripts ?? []).map(a => a.text);
  const strings: string[] = [];
  collectStrings(film, strings, new Set(['allowedScripts', 'titleScripts', 'theme']));
  const issues: string[] = [];
  for (const t of strings) for (const run of t.match(NON_LATIN) ?? []) {
    if (!allowed.some(a => a.includes(run))) issues.push(`non-Latin gate: "${run}" is not one of the exhibit's own strings (film.allowedScripts)`);
  }
  for (const a of film.titleScripts ?? []) if (!allowed.includes(a.text)) issues.push(`non-Latin gate: title string "${a.text}" is not in allowedScripts`);
  return issues;
}
