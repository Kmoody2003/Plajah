// Browser -> POST /api/books/submit. The server re-runs preflight + automated review (routes/bookSubmissions.ts).

import type { BookDraft } from './types';
import type { ReviewResult } from './review';
import { computeA11y } from './accessibility';

export interface SubmitOutcome extends ReviewResult { id: string }

export async function submitBook(d: BookDraft): Promise<SubmitOutcome> {
  const { auth } = await import('../firebase');
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in to submit your book.');
  const chapters = (d.manuscript?.chapters ?? []).map(c => ({ id: c.id, title: c.title, text: c.text, wordCount: c.wordCount, kind: c.kind ?? 'chapter', included: c.included }));
  const res = await fetch('/api/books/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      draftId: d.id, format: d.format, metadata: d.metadata, pricing: d.pricing, cover: d.cover, chapters,
      epubFindings: d.epubFindings, accessibilityScore: computeA11y(d).score, acks: d.acks,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Submission failed (${res.status}). Your draft is safe — try again.`);
  return body as SubmitOutcome;
}
