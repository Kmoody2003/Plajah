// Pre-publish gate: image rights, disclosures, fact-check state, embargo, silent-edit guard.
// Pure. The UI renders blockers/warnings; the publish service refuses when blockers exist.

import type { ArticleDisclosures, ArticleNotice, Claim, ImageRights } from './types';
import { checkHeadline } from './styleChecker';
import { silentEditProblem } from './correctionLog';
import { isTrulyVerified } from './factCheck';

export interface GateInput {
  title: string;
  bodyText: string;
  imageRefs: string[];                       // 'cover' + IMAGE block ids that carry a picture
  rights: ReadonlyArray<ImageRights>;
  disclosures: ArticleDisclosures;
  /** True if Aria (or any AI tool) wrote or rewrote text in this session. */
  aiUsedInEditor?: boolean;
  claims: ReadonlyArray<Claim>;
  embargoUntil?: number;
  now?: number;
  /** When re-publishing an already-published article: */
  publishedText?: string;
  priorNotices?: ReadonlyArray<ArticleNotice>;
  nextNotices?: ReadonlyArray<ArticleNotice>;
}

export interface GateResult {
  canPublish: boolean;
  /** 'SCHEDULE' when an embargo is in the future: the article is held, not published. */
  action: 'PUBLISH' | 'SCHEDULE';
  blockers: string[];
  warnings: string[];
}

export function evaluatePublishGate(i: GateInput): GateResult {
  const now = i.now ?? Date.now();
  const blockers: string[] = []; const warnings: string[] = [];

  if (!i.title.trim()) blockers.push('Add a headline.');
  if (i.bodyText.trim().split(/\s+/).filter(Boolean).length < 30) warnings.push('The story is very short (under 30 words).');
  for (const h of checkHeadline(i.title)) if (h.severity === 'error' && i.title.trim()) blockers.push(`Headline: ${h.message}`);

  for (const ref of i.imageRefs) {
    const r = i.rights.find(x => x.ref === ref);
    const label = ref === 'cover' ? 'the cover image' : 'an inline image';
    if (!r || !r.credit.trim()) blockers.push(`Add a credit line for ${label}.`);
    else if (!r.license) blockers.push(`Choose a license / rights basis for ${label}.`);
    else {
      if (r.license === 'FAIR_USE_CLAIMED' && !r.sourceUrl) warnings.push(`Fair use is a legal defense, not a license. Note the source for ${label} and get counsel's view if unsure.`);
      if ((r.license === 'CC_BY' || r.license === 'CC_BY_SA' || r.license === 'LICENSED' || r.license === 'EDITORIAL_USE') && !r.sourceUrl) warnings.push(`Link the license or source for ${label} so the terms can be checked.`);
    }
  }

  const d = i.disclosures;
  if (d.aiAssisted && !(d.aiNote || '').trim()) blockers.push('AI disclosure is on: say how AI was used.');
  if (!d.aiAssisted && i.aiUsedInEditor) warnings.push('Aria / AI tools were used in this draft but the AI disclosure is off. Check your newsroom policy.');
  if (d.sponsored && !(d.sponsorName || '').trim()) blockers.push('Sponsored content needs the sponsor named.');
  if (d.conflictOfInterest && !(d.conflictNote || '').trim()) blockers.push('Describe the conflict of interest you are disclosing.');

  const disputed = i.claims.filter(c => c.status === 'DISPUTED').length;
  const unverified = i.claims.filter(c => !isTrulyVerified(c) && c.status !== 'DISPUTED').length;
  if (disputed) blockers.push(`${disputed} claim${disputed > 1 ? 's are' : ' is'} marked DISPUTED. Resolve, soften, or remove before publishing.`);
  if (unverified) warnings.push(`${unverified} claim${unverified > 1 ? 's' : ''} not yet verified in the fact-check workbench.`);

  if (i.publishedText !== undefined) {
    const p = silentEditProblem(i.publishedText, i.bodyText, i.priorNotices, i.nextNotices);
    if (p) blockers.push(p);
  }

  const embargoed = !!i.embargoUntil && i.embargoUntil > now;
  if (embargoed) warnings.push(`Embargoed until ${new Date(i.embargoUntil!).toISOString().replace('T', ' ').slice(0, 16)} UTC. It will be held, not published.`);
  return { canPublish: blockers.length === 0, action: embargoed ? 'SCHEDULE' : 'PUBLISH', blockers, warnings };
}
