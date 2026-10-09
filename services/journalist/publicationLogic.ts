// Pure publication (masthead) rules.

import type { Publication } from './types';

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'publication';
}

/** Things a reader or a platform reviewer would expect on a real masthead. Advice, not a blocker. */
export function mastheadProblems(p: Pick<Publication, 'name' | 'editors' | 'correctionsPolicy' | 'sections' | 'slug'>): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push('Add a name.');
  if (!p.editors.length) out.push('List at least one editor so readers know who is accountable.');
  if (!(p.correctionsPolicy || '').trim()) out.push('Add a corrections policy; readers and the platform look for one.');
  if (!p.sections.length) out.push('Add at least one section.');
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(p.slug)) out.push('The URL slug should be lowercase letters, numbers and dashes.');
  return out;
}

/** Selling paid issues requires an accountable masthead. */
export function canSellIssues(p: Pick<Publication, 'name' | 'editors' | 'correctionsPolicy'>): boolean {
  return !!p.name.trim() && p.editors.length > 0 && !!(p.correctionsPolicy || '').trim();
}

export type ReaderAccess = 'FULL' | 'SUMMARY_ONLY';

/**
 * What a reader may see of an article. Soft paywall: this decides what the UI renders and what
 * feeds emit; it is NOT database-level access control.
 */
export function readerAccess(
  articleAccess: 'FREE' | 'SUBSCRIBERS' | 'PAID' | undefined,
  viewer: { uid?: string; isAuthor?: boolean; subscribed?: boolean; owns?: boolean },
): ReaderAccess {
  if (!articleAccess || articleAccess === 'FREE') return 'FULL';
  if (viewer.isAuthor) return 'FULL';
  if (articleAccess === 'SUBSCRIBERS') return viewer.subscribed ? 'FULL' : 'SUMMARY_ONLY';
  return viewer.owns ? 'FULL' : 'SUMMARY_ONLY';
}
