// Lightweight AUTOMATED review. No human queue is required: the outcome is decided by the same preflight the
// author already saw, plus a few policy rules. Anything that merits a human glance goes to IN_REVIEW and shows up
// in the admin-visible bookSubmissions collection. Pure so the server route and the tests share one implementation.

import { runPreflight, type PreflightInput } from './preflight';
import type { SubmissionStatus } from './types';

export interface ReviewReason { code: string; message: string; fix?: string }
export interface ReviewResult {
  status: Exclude<SubmissionStatus, 'DRAFT'>;
  reasons: ReviewReason[];
  score: number;
  /** Human-readable one-liner for the author. */
  summary: string;
}

export interface ReviewInput extends PreflightInput {
  acks: { contentPolicy: boolean; rights: boolean };
}

export function automatedReview(inp: ReviewInput): ReviewResult {
  const pf = runPreflight(inp);
  const reasons: ReviewReason[] = [];

  if (!inp.acks?.contentPolicy) reasons.push({ code: 'ack.policy', message: 'The content policy acknowledgement is required.', fix: 'Tick the content-policy box on the Review step.' });
  if (!inp.acks?.rights) reasons.push({ code: 'ack.rights', message: 'The rights confirmation is required.', fix: 'Tick the rights box on the Review step.' });
  for (const b of pf.blocking) reasons.push({ code: b.code, message: b.message, fix: b.fix });

  if (reasons.length) {
    return { status: 'REJECTED', reasons, score: pf.score, summary: `Not published yet: ${reasons.length} thing${reasons.length > 1 ? 's' : ''} to fix, then resubmit. Nothing is lost.` };
  }

  const m = inp.metadata;
  const flags: ReviewReason[] = [];
  if (m.publicDomain) flags.push({ code: 'review.public_domain', message: 'Public-domain work — checked for added value.' });
  if (m.ai.text === 'generated') flags.push({ code: 'review.ai_text', message: 'AI-generated text disclosed — spot check.' });
  if (m.matureContent || m.audience.adult) flags.push({ code: 'review.mature', message: 'Mature content — confirming it is labelled and age-gated.' });
  if (pf.score < 70) flags.push({ code: 'review.low_score', message: `Preflight score ${pf.score}/100 — quality spot check.` });
  if (Object.values(inp.pricing.prices).some(v => v > 49.99)) flags.push({ code: 'review.high_price', message: 'Unusually high price — confirming it is intentional.' });

  if (flags.length) return { status: 'IN_REVIEW', reasons: flags, score: pf.score, summary: 'Submitted. A quick spot check is needed before it goes live; you will be notified.' };
  return { status: 'LIVE', reasons: [], score: pf.score, summary: 'Approved. Your book is cleared for the store.' };
}
