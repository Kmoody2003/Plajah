// Independent-author ebook submission — the SERVER side of components/bookSubmit.
//
// Why a server route at all: status transitions (DRAFT -> IN_REVIEW / LIVE / REJECTED) must not be client-writable.
// firestore.rules lets the owner read bookSubmissions/{id} but never write it; only this route (service account,
// via firebaseAdminRest) writes it, and it runs the SAME pure preflight + automated review the browser showed, so the
// author never sees a green checklist that the server then contradicts.
//
// Mounted in server.ts as:  app.use('/api/books', express.json({ limit: '14mb' }), bookSubmissionsRouter)
//
//   POST /api/books/submit   { draftId, format, metadata, pricing, cover, chapters[{id,title,text,wordCount,kind,included}],
//                              epubFindings?, accessibilityScore?, acks }  ->  { status, reasons[], score, summary, id }
//
// The chapter TEXT is used for the check and then discarded: the submission record keeps only an index (title +
// word count), because Firestore docs cap at 1 MiB. The full book stays in the author's draft (Storage) and is
// published through the normal AlbumCreator path.

import { Router, Request, Response } from 'express';
import { verifyIdToken, fsGet, fsSet } from '../services/firebaseAdminRest';
import { automatedReview } from '../services/bookmeta/review';
import { stripUndefinedDeep } from '../services/bookmeta/util';
import type { BookMetadata, BookPricing, CoverInfo, Finding } from '../services/bookmeta/types';

export const bookSubmissionsRouter = Router();

const MAX_CHAPTERS = 2000;
const MAX_TEXT_CHARS = 12_000_000;
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

bookSubmissionsRouter.post('/submit', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in to submit a book.' });

  const b = req.body || {};
  const draftId = str(b.draftId, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(draftId)) return res.status(400).json({ error: 'Missing or invalid draftId.' });
  const metadata = b.metadata as BookMetadata | undefined;
  const pricing = b.pricing as BookPricing | undefined;
  const chapters = Array.isArray(b.chapters) ? b.chapters : null;
  if (!metadata || typeof metadata !== 'object' || !pricing || typeof pricing !== 'object' || !chapters)
    return res.status(400).json({ error: 'metadata, pricing and chapters are required.' });
  if (chapters.length > MAX_CHAPTERS) return res.status(413).json({ error: `Too many chapters (max ${MAX_CHAPTERS}).` });
  let chars = 0;
  const cleanChapters = chapters.map((c: any, i: number) => {
    const text = str(c?.text, MAX_TEXT_CHARS);
    chars += text.length;
    return {
      id: str(c?.id, 60) || `c${i}`, title: str(c?.title, 200), text,
      wordCount: Number.isFinite(c?.wordCount) ? Math.max(0, Math.floor(c.wordCount)) : 0,
      kind: ['chapter', 'front', 'back', 'toc'].includes(c?.kind) ? c.kind : 'chapter', included: c?.included !== false,
    };
  });
  if (chars > MAX_TEXT_CHARS) return res.status(413).json({ error: 'Manuscript text is too large for one submission.' });

  const id = `${uid}_${draftId}`;
  const existing = await fsGet(`bookSubmissions/${id}`);
  if (existing && (existing.status === 'LIVE' || existing.status === 'IN_REVIEW'))
    return res.status(409).json({ error: existing.status === 'LIVE' ? 'This book is already live.' : 'This book is already in review.', status: existing.status });

  const cover = (b.cover && typeof b.cover === 'object' ? b.cover : null) as CoverInfo | null;
  const result = automatedReview({
    metadata, pricing, cover, chapters: cleanChapters,
    epubFindings: Array.isArray(b.epubFindings) ? (b.epubFindings as Finding[]).slice(0, 200) : [],
    accessibilityScore: Number.isFinite(b.accessibilityScore) ? b.accessibilityScore : null,
    acks: { contentPolicy: b.acks?.contentPolicy === true, rights: b.acks?.rights === true },
  });

  const now = Date.now();
  const history = [...(Array.isArray(existing?.history) ? existing!.history : []).slice(-19), { status: result.status, at: now, by: 'auto', score: result.score }];
  const story = cleanChapters.filter(c => c.included && c.kind === 'chapter');
  const record = stripUndefinedDeep({
    id, ownerId: uid, draftId, format: str(b.format, 30),
    status: result.status,
    review: { reasons: result.reasons, score: result.score, summary: result.summary, reviewedAt: now, reviewer: 'auto' },
    title: str(metadata.title, 220), subtitle: str(metadata.subtitle, 220),
    authorName: str(metadata.penName || metadata.contributors?.find(c => c.role === 'author')?.name, 120),
    genre: str(metadata.genre, 60), language: str(metadata.language, 12), bisac: (metadata.bisac || []).slice(0, 3).map(x => str(x, 12)),
    publicDomain: !!metadata.publicDomain, aiText: str(metadata.ai?.text, 12), aiImages: str(metadata.ai?.images, 12), matureContent: !!metadata.matureContent,
    wordCount: story.reduce((s, c) => s + c.wordCount, 0), chapterCount: story.length,
    chapterIndex: cleanChapters.slice(0, 300).map(c => ({ id: c.id, title: c.title, wordCount: c.wordCount, kind: c.kind, included: c.included })),
    pricing: { model: pricing.model, prices: pricing.prices, delivery: pricing.delivery, preorder: !!pricing.preorder?.enabled },
    cover: cover ? { width: cover.width, height: cover.height, bytes: cover.bytes, mime: cover.mime, url: cover.url } : null,
    submittedAt: existing?.submittedAt ?? now, updatedAt: now, revision: (existing?.revision ?? 0) + 1, history,
  }) as Record<string, unknown>;

  if (!(await fsSet(`bookSubmissions/${id}`, record))) return res.status(502).json({ error: 'Could not record the submission. Nothing was lost; try again.' });
  return res.json({ id, status: result.status, reasons: result.reasons, score: result.score, summary: result.summary });
});
