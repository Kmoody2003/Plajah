/**
 * Basic spam heuristic for posts. Pure; the composer owner calls
 * `assessPostSpam(text, recentOwnTexts, { newAccount })` before publishing and
 * either blocks (`block`) or asks the user to confirm (`warn`).
 */

export interface SpamOptions {
  newAccount?: boolean;
  /** Max links allowed; default 3 (1 for new accounts). */
  maxLinks?: number;
  maxMentions?: number;
}

export type SpamReason = 'duplicate' | 'too_many_links' | 'repeated_link' | 'too_many_mentions' | 'char_flood';

export interface SpamAssessment {
  /** True when the post should be blocked outright. */
  block: boolean;
  /** True when the post is suspicious enough to warn/confirm. */
  warn: boolean;
  reasons: SpamReason[];
}

const URL_SRC = 'https?:\\/\\/[^\\s<>"\')]+|www\\.[^\\s<>"\')]+';

export const extractLinks = (text: string): string[] => text.match(new RegExp(URL_SRC, 'gi')) ?? [];

export const normalizeForDup = (text: string): string =>
  text.toLowerCase().replace(new RegExp(URL_SRC, 'gi'), ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const linkKey = (l: string) => l.toLowerCase().replace(/\/+$/, '');

export function assessPostSpam(text: string, recentTexts: readonly string[] = [], opts: SpamOptions = {}): SpamAssessment {
  const reasons: SpamReason[] = [];
  const maxLinks = opts.maxLinks ?? (opts.newAccount ? 1 : 3);
  const maxMentions = opts.maxMentions ?? (opts.newAccount ? 3 : 8);

  const links = extractLinks(text);
  if (links.length > maxLinks) reasons.push('too_many_links');
  const uniqueLinks = new Set(links.map(linkKey));
  if (links.length >= 2 && uniqueLinks.size < links.length) reasons.push('repeated_link');

  const mentions = (text.match(/(^|\s)@[\w.]{2,}/g) ?? []).length;
  if (mentions > maxMentions) reasons.push('too_many_mentions');

  if (/(.)\1{14,}/u.test(text)) reasons.push('char_flood');

  const norm = normalizeForDup(text);
  let duplicate = false;
  if (norm.length >= 8) {
    // Identical text (ignoring links/punctuation/case) already posted recently.
    duplicate = recentTexts.some(t => normalizeForDup(t) === norm);
  } else if (uniqueLinks.size > 0) {
    // (Nearly) link-only posts: compare the link set.
    const mine = [...uniqueLinks].sort().join(' ');
    duplicate = recentTexts.some(t => [...new Set(extractLinks(t).map(linkKey))].sort().join(' ') === mine);
  }
  if (duplicate) reasons.push('duplicate');

  const block = duplicate || reasons.includes('char_flood') || (reasons.includes('too_many_links') && !!opts.newAccount);
  return { block, warn: reasons.length > 0, reasons };
}

export const SPAM_REASON_COPY: Record<SpamReason, string> = {
  duplicate: 'You already posted this recently.',
  too_many_links: 'This post has a lot of links.',
  repeated_link: 'The same link appears more than once.',
  too_many_mentions: 'This post mentions a lot of people.',
  char_flood: 'This post has a long run of repeated characters.',
};
