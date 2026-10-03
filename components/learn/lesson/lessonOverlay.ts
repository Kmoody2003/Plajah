/**
 * Teacher versions of a lesson ("overlays"). The built lesson is the BASE MODEL and is never modified. A teacher's changes are a
 * separate record that points at the base lesson, belongs to the teacher, applies only to the classes they choose, and carries
 * their name as credit. A teacher can share a version so other teachers can adopt it; an adopted copy is the adopter's own and
 * keeps a visible "adapted from" chain, so credit travels with the work.
 *
 * Integrity: a teacher's version is NOT covered by Plajah's accuracy checks. It is labelled that way everywhere it is shown, it
 * records the base text it was made from so a later change to the base lesson is noticed, and it never alters the practice
 * questions, which stay tied to the base lesson.
 */
import { parseFolio, seedOf } from './folioParse';
import { checkExpr } from './exprParser';
import type { Figure } from './figures';

export interface LessonOverlay {
  id: string; baseLessonId: string; courseId: string;
  /** Hash of the base lesson text this version was made from. */
  baseHash: string;
  authorUid: string; authorName: string; schoolName?: string;
  title?: string;
  /** The full lesson text for this version: paragraphs split on blank lines; callouts use the usual "Why it matters:" prefixes. */
  body: string;
  /** Ids of base figures this version hides. */
  hideFigures: string[];
  /** Figures this version adds. Graphs use a typed formula (`expr`), never code. */
  addFigures: Figure[];
  classIds: string[];
  visibility: 'class' | 'shared';
  /** "Why I changed this", shown to the class and to teachers who browse it. */
  note?: string;
  forkedFrom?: { overlayId: string; authorName: string };
  createdAt: number; updatedAt: number;
}

export const LIMITS = { classes: 5, bodyChars: 24000, figures: 8, timelineEvents: 14, chartPoints: 60, noteChars: 400, titleChars: 140 };

export const hashBody = (body: string): string => seedOf((body || '').replace(/\s+/g, ' ').trim()).toString(16);

export interface Base { title: string; body: string; figures: Figure[] }
export interface Applied { title: string; body: string; figures: Figure[]; /** indexes of text blocks that are new or changed */ changed: Set<number>; removed: number; added: number; stale: boolean }

const paras = (s: string) => (s || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Which paragraphs of `body` are not in `base` (new or reworded), and how many base paragraphs are gone. */
export function diffParagraphs(baseBody: string, body: string): { changed: Set<number>; removed: number; added: number } {
  const b = paras(baseBody).map(norm), n = paras(body), seen = new Set(b), now = new Set(n.map(norm));
  const changed = new Set<number>(); n.forEach((p, i) => { if (!seen.has(norm(p))) changed.add(i); });
  return { changed, removed: b.filter(p => !now.has(p)).length, added: n.filter(p => !seen.has(norm(p))).length };
}

export function applyOverlay(base: Base, o: LessonOverlay | null | undefined): Applied {
  if (!o) return { title: base.title, body: base.body, figures: base.figures, changed: new Set(), removed: 0, added: 0, stale: false };
  const d = diffParagraphs(base.body, o.body);
  const hidden = new Set(o.hideFigures || []);
  return { title: o.title?.trim() || base.title, body: o.body, figures: [...base.figures.filter(f => !hidden.has(f.id)), ...(o.addFigures || [])], changed: d.changed, removed: d.removed, added: d.added, stale: o.baseHash !== hashBody(base.body) };
}

/** Index of the text block (not callout) each changed paragraph becomes, so the page can mark it. */
export function changedBlockIndexes(body: string, changedParas: Set<number>): Set<number> {
  const { blocks } = parseFolio(body); const out = new Set<number>();
  blocks.forEach(b => { if (changedParas.has(b.index)) out.add(b.index); });
  return out;
}

export const creditLine = (o: LessonOverlay): string => `Customized by ${o.authorName}${o.schoolName ? `, ${o.schoolName}` : ''}`;
export const adaptedLine = (o: LessonOverlay): string | null => (o.forkedFrom ? `Adapted from ${o.forkedFrom.authorName}'s version` : null);

export function newOverlay(base: { id: string; courseId: string; title: string; body: string }, me: { uid: string; name: string; school?: string }, classIds: string[]): LessonOverlay {
  const now = Date.now();
  return { id: `${base.id}__${me.uid}__${now.toString(36)}`, baseLessonId: base.id, courseId: base.courseId, baseHash: hashBody(base.body), authorUid: me.uid, authorName: me.name, ...(me.school ? { schoolName: me.school } : {}), body: base.body, hideFigures: [], addFigures: [], classIds, visibility: 'class', createdAt: now, updatedAt: now };
}

/** An adopter's own copy of a shared version: new id and owner, scoped to their classes, with the credit chain intact. */
export function adoptOverlay(src: LessonOverlay, me: { uid: string; name: string; school?: string }, classIds: string[]): LessonOverlay {
  const now = Date.now();
  const { schoolName: _s, forkedFrom: _f, ...rest } = src;
  return { ...rest, id: `${src.baseLessonId}__${me.uid}__${now.toString(36)}`, authorUid: me.uid, authorName: me.name, ...(me.school ? { schoolName: me.school } : {}), classIds, visibility: 'class', forkedFrom: { overlayId: src.id, authorName: src.authorName }, createdAt: now, updatedAt: now };
}

/** Problems that stop a version being saved. An empty list means it is valid. */
export function validateOverlay(o: LessonOverlay): string[] {
  const e: string[] = [];
  if (!paras(o.body).length) e.push('The lesson text cannot be empty.');
  if (o.body.length > LIMITS.bodyChars) e.push(`The lesson text is longer than ${LIMITS.bodyChars.toLocaleString()} characters.`);
  if ((o.title || '').length > LIMITS.titleChars) e.push('The title is too long.');
  if ((o.note || '').length > LIMITS.noteChars) e.push(`The note is longer than ${LIMITS.noteChars} characters.`);
  if (!o.classIds.length && o.visibility === 'class') e.push('Choose at least one class for this version.');
  if (o.classIds.length > LIMITS.classes) e.push(`A version can be used by at most ${LIMITS.classes} classes.`);
  if ((o.addFigures || []).length > LIMITS.figures) e.push(`A version can add at most ${LIMITS.figures} figures.`);
  for (const f of o.addFigures || []) {
    if (!f.caption || f.caption.trim().length < 8) e.push(`Figure "${f.id}" needs a caption that says what to notice.`);
    if (f.type === 'graph') { const m = f.expr ? checkExpr(f.expr) : 'A graph needs a formula.'; if (m) e.push(`Graph formula: ${m}`); if (!(f.domain[0] < f.domain[1])) e.push('Graph range must go from a smaller to a larger number.'); }
    if (f.type === 'chart') { if (!f.series.length || f.series.some(s => !s.points.length || s.points.length > LIMITS.chartPoints || s.points.some(p => !isFinite(p[0]) || !isFinite(p[1])))) e.push('Chart numbers must be valid and at most ' + LIMITS.chartPoints + ' per line.'); }
    if (f.type === 'timeline' && (!f.events.length || f.events.length > LIMITS.timelineEvents || f.events.some(ev => !ev.when.trim() || !ev.label.trim()))) e.push('Each timeline entry needs a date and a label.');
    if (f.type === 'video' && !/^https:\/\//i.test(f.url)) e.push('A video link must start with https://.');
    if (f.type === 'diagram') { const ids = new Set(f.nodes.map(n => n.id)); if (f.edges.some(([a, b]) => !ids.has(a) || !ids.has(b))) e.push('A diagram arrow points at something that is not in the diagram.'); }
  }
  return e;
}

/** What a student or another teacher should read about a version, in plain words. */
export const INTEGRITY_NOTE = 'A teacher changed this lesson for their class. The changes have not been checked by Plajah. The original lesson, and the practice questions, have not changed.';
