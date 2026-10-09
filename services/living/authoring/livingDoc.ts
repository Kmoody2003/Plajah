// Pure helpers for editing TelaDoc.living: used by the SET_LIVING_PAGE op, the Behaviours panel and the tests.
import type { Behavior, LivingBook, LivingPage } from '../contracts';
import { LIVING_SCHEMA_VERSION, emptyLivingPage } from '../contracts';

/** A page with nothing alive on it carries no data (keeps documents small and the flat export identical). */
export function isEmptyLivingPage(p: LivingPage): boolean {
  return !p.behaviors.length && !p.goals?.length && !p.music && !p.ambience && !p.narration && !p.a11y && !Object.keys(p.vars ?? {}).length && !Object.keys(p.groups ?? {}).length;
}

export const emptyBook = (bookId: string): LivingBook => ({ version: LIVING_SCHEMA_VERSION, bookId, pages: [], scores: {} });

/** Insert / replace / remove (when empty) one page, keeping pages sorted. Never mutates; returns undefined when nothing is left at all. */
export function setLivingPage(living: LivingBook | undefined, page: LivingPage, bookId: string): LivingBook | undefined {
  const book = living ?? emptyBook(bookId);
  const rest = book.pages.filter(p => p.page !== page.page);
  const pages = isEmptyLivingPage(page) ? rest : [...rest, page].sort((a, b) => a.page - b.page);
  if (!pages.length && !Object.keys(book.scores).length && !book.authorNotes && !book.defaults) return undefined;
  return { ...book, pages };
}

export const getLivingPage = (living: LivingBook | undefined, page: number): LivingPage => living?.pages.find(p => p.page === page) ?? emptyLivingPage(page);

/** Replace one behaviour by id (or append). */
export function upsertBehavior(page: LivingPage, b: Behavior): LivingPage {
  const i = page.behaviors.findIndex(x => x.id === b.id);
  return { ...page, behaviors: i < 0 ? [...page.behaviors, b] : page.behaviors.map(x => (x.id === b.id ? b : x)) };
}
export const removeBehavior = (page: LivingPage, id: string): LivingPage => ({ ...page, behaviors: page.behaviors.filter(b => b.id !== id) });

export function duplicateBehavior(page: LivingPage, id: string): LivingPage {
  const b = page.behaviors.find(x => x.id === id); if (!b) return page;
  const used = new Set(page.behaviors.map(x => x.id)); let n = 2; let nid = `${b.id}-copy`;
  while (used.has(nid)) nid = `${b.id}-copy${n++}`;
  const copy: Behavior = JSON.parse(JSON.stringify({ ...b, id: nid, label: b.label ? `${b.label} (copy)` : undefined }));
  const i = page.behaviors.findIndex(x => x.id === id);
  return { ...page, behaviors: [...page.behaviors.slice(0, i + 1), copy, ...page.behaviors.slice(i + 1)] };
}

/** Disabled behaviours are kept in the data but never run: stored as an `off:` prefix on the id would break references, so we keep a flag. */
export const DISABLED_KEY = 'disabled';
export const isDisabled = (b: Behavior) => (b as Behavior & { [DISABLED_KEY]?: boolean })[DISABLED_KEY] === true;
export function setDisabled(page: LivingPage, id: string, off: boolean): LivingPage {
  return { ...page, behaviors: page.behaviors.map(b => { if (b.id !== id) return b; const c = { ...b } as Behavior & { [DISABLED_KEY]?: boolean }; if (off) c[DISABLED_KEY] = true; else delete c[DISABLED_KEY]; return c; }) };
}

/** What the runtime should actually run: disabled behaviours stripped. */
export function runnablePage(page: LivingPage): LivingPage {
  return page.behaviors.some(isDisabled) ? { ...page, behaviors: page.behaviors.filter(b => !isDisabled(b)) } : page;
}

/** Parse the JSON view. Returns the page or a readable error. */
export function parseLivingPageJson(text: string, pageNumber: number): { ok: true; page: LivingPage } | { ok: false; error: string } {
  let v: unknown;
  try { v = JSON.parse(text); } catch (e) { return { ok: false, error: `Not valid JSON: ${(e as Error).message}` }; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'Expected an object like { "behaviors": [...] }.' };
  const o = v as Partial<LivingPage>;
  if (!Array.isArray(o.behaviors)) return { ok: false, error: '"behaviors" must be an array.' };
  for (const [i, b] of o.behaviors.entries()) {
    if (!b || typeof b !== 'object' || typeof (b as Behavior).id !== 'string' || !(b as Behavior).on || typeof (b as Behavior).on.type !== 'string' || !Array.isArray((b as Behavior).do) || !(b as Behavior).target) return { ok: false, error: `Behaviour ${i + 1} needs "id", "target", "on" and a "do" array.` };
  }
  return { ok: true, page: { ...o, page: pageNumber, behaviors: o.behaviors as Behavior[] } as LivingPage };
}
