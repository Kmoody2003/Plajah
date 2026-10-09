// Headline tester. Pure functions: variant generation (rule-based, no invented facts), length
// scoring, and search/social preview geometry. An AI variant generator can be layered on top in
// the UI; nothing here calls a model.

import { checkHeadline, HEADLINE_SOFT_MAX, type StyleIssue } from './styleChecker';

export interface HeadlineVariant { id: string; label: string; text: string; note: string }
export interface HeadlineScore { chars: number; words: number; issues: StyleIssue[]; score: number; searchFits: boolean; socialFits: boolean }

export const SEARCH_TITLE_MAX = 60;   // roughly 580px in a SERP
export const SOCIAL_TITLE_MAX = 70;   // og:title is typically cut near here
export const META_DESCRIPTION_MAX = 155;

const FILLER = /\b(?:very|really|just|quite|rather|actually|basically|literally|somewhat)\s+/gi;

const sentenceCase = (s: string): string => {
  const t = s.trim();
  if (!t) return t;
  // keep acronyms / interior capitals; only lower words that are Title Cased and not the first
  const words = t.split(/\s+/);
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : /^[A-Z][a-z]+$/.test(w) && !/^(?:I|The)$/.test(w) && words.length >= 5 && words.filter(x => /^[A-Z]/.test(x)).length / words.length > 0.8 ? w.toLowerCase() : w)).join(' ');
};

/** Cut at the last natural boundary under `max` without leaving a dangling word. */
export function tightenTo(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const clause = t.split(/\s[:—–|-]\s|:\s/)[0];
  if (clause.length >= 20 && clause.length <= max) return clause;
  const cut = t.slice(0, max + 1);
  const trimmed = cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : max).replace(/[\s,;:—–-]+$/, '');
  return trimmed.replace(/\b(?:and|or|of|the|a|an|to|in|on|for|with|by)$/i, '').trim();
}

export function scoreHeadline(h: string): HeadlineScore {
  const t = h.trim();
  const issues = checkHeadline(t);
  const penalty = issues.reduce((p, i) => p + (i.severity === 'error' ? 40 : i.severity === 'warn' ? 15 : 5), 0);
  return {
    chars: t.length, words: t ? t.split(/\s+/).length : 0, issues,
    score: Math.max(0, 100 - penalty),
    searchFits: t.length > 0 && t.length <= SEARCH_TITLE_MAX, socialFits: t.length > 0 && t.length <= SOCIAL_TITLE_MAX,
  };
}

export function makeVariants(headline: string, opts: { subtitle?: string; sectionLabel?: string } = {}): HeadlineVariant[] {
  const h = headline.trim().replace(/\s+/g, ' ');
  if (!h) return [];
  const out: HeadlineVariant[] = [{ id: 'original', label: 'Original', text: h, note: 'As written.' }];
  const add = (id: string, label: string, text: string, note: string) => {
    const t = text.trim();
    if (t && !out.some(v => v.text === t)) out.push({ id, label, text: t, note });
  };
  add('plain', 'Sentence case, no filler', sentenceCase(h.replace(FILLER, '').replace(/\.$/, '')), 'AP-style case; filler words removed.');
  if (h.length > SEARCH_TITLE_MAX) add('search', 'Search-length', tightenTo(h.replace(FILLER, ''), SEARCH_TITLE_MAX), `Fits ${SEARCH_TITLE_MAX} characters for search results.`);
  if (h.length > SOCIAL_TITLE_MAX) add('social', 'Social-length', tightenTo(h.replace(FILLER, ''), SOCIAL_TITLE_MAX), `Fits ${SOCIAL_TITLE_MAX} characters for share cards.`);
  const colon = h.split(/:\s/);
  if (colon.length === 2 && colon[1].length >= 15) add('after-colon', 'Lead with the news', sentenceCase(colon[1]), 'Drops the label before the colon and leads with the substance.');
  if (opts.subtitle && h.length + opts.subtitle.length < 140) add('with-deck', 'Headline + deck', `${h}: ${opts.subtitle}`.replace(/\.$/, ''), 'Merges the deck into the headline (long; best for newsletters).');
  if (/^(?:how|why|what|who|when|where|can|will|should|is|are|does|do)\b/i.test(h)) add('declarative', 'Declarative', h.replace(/\?$/, ''), 'Question headlines can underperform and invite "no"; answer it if you can.');
  return out.slice(0, 6).map(v => ({ ...v, id: v.id }));
}

export interface SearchPreview { title: string; url: string; description: string; titleTruncated: boolean; descriptionTruncated: boolean }
export function searchPreview(title: string, url: string, description: string): SearchPreview {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
  return { title: clip(title, SEARCH_TITLE_MAX), url, description: clip(description, META_DESCRIPTION_MAX), titleTruncated: title.length > SEARCH_TITLE_MAX, descriptionTruncated: description.length > META_DESCRIPTION_MAX };
}
export interface SocialPreview { title: string; description: string; site: string; titleTruncated: boolean }
export function socialPreview(title: string, description: string, site = 'plajah.com'): SocialPreview {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
  return { title: clip(title, SOCIAL_TITLE_MAX), description: clip(description, 110), site, titleTruncated: title.length > SOCIAL_TITLE_MAX };
}
export { HEADLINE_SOFT_MAX };
