// sermonService — Aria turns sermons into editable articles, and articles into a
// book (Part 3, Phase 3). Transcript → AI article draft (staff edits) → saved
// church article → compiled into a BOOK for the church's library / Lorea reader.
//
// Ownership note: articles/albums rules require authorId/ownerId == the signed-in
// uid, so the staff user OWNS these docs; they're ATTRIBUTED to the church via the
// display name + a `church:<id>` tag (how the church library finds them).

import { db, auth } from './firebase';
import { doc, collection, setDoc, getDocs, query, where } from 'firebase/firestore';
import { callGemini } from './geminiService';
import type { Organization } from '../types';

export interface SermonDraft { title: string; subtitle: string; body: string }

/** Transcript (or notes) → a structured article draft, via Aria (Gemini). */
export async function generateSermonArticle(transcript: string, hint?: string): Promise<SermonDraft> {
  const prompt =
    `You are a church editorial assistant. Turn the following sermon ${hint ? `titled "${hint}" ` : ''}` +
    `transcript or notes into a clear, faithful ARTICLE for the congregation to read. ` +
    `Return STRICT JSON: {"title": "...", "subtitle": "...", "body": "..."} where "body" is well-structured ` +
    `markdown (section headings, short paragraphs, and any scripture references preserved verbatim). ` +
    `Keep the speaker's meaning and doctrine; do not invent or embellish theology.\n\nSERMON:\n${transcript.slice(0, 12000)}`;
  const raw = await callGemini(prompt, { responseMimeType: 'application/json' });
  const text = typeof raw === 'string' ? raw : '';
  try {
    const j = JSON.parse(text || '{}');
    return { title: j.title || hint || 'Sermon', subtitle: j.subtitle || '', body: j.body || transcript };
  } catch {
    return { title: hint || 'Sermon', subtitle: '', body: text || transcript };
  }
}

/** Save an edited draft as a church-tagged Article. Returns the new id. */
export async function saveSermonArticle(church: Organization, draft: SermonDraft): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const id = `sermon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const blocks: any[] = [];
  if (draft.subtitle) blocks.push({ id: 'sub', type: 'HEADING', content: draft.subtitle });
  blocks.push({ id: 'body', type: 'TEXT', content: draft.body });
  await setDoc(doc(db, 'articles', id), {
    id,
    authorId: uid,
    authorName: church.name,
    authorPhoto: church.logoUrl || '',
    title: draft.title || 'Sermon',
    subtitle: draft.subtitle || '',
    blocks,
    content: draft.body,
    tags: ['sermon', `church:${church.id}`],
    category: 'Sermon',
    isPublic: true,
    likesCount: 0,
    commentsCount: 0,
    timestamp: Date.now(),
  });
  return id;
}

export interface SermonArticle { id: string; title: string; content: string; timestamp: number }

/** All sermon articles saved for a church, oldest first (chapter order). */
export async function fetchChurchSermonArticles(churchId: string): Promise<SermonArticle[]> {
  try {
    const snap = await getDocs(query(collection(db, 'articles'), where('tags', 'array-contains', `church:${churchId}`)));
    return snap.docs
      .map(d => { const x = d.data() as any; return { id: d.id, title: x.title || 'Untitled', content: x.content || '', timestamp: x.timestamp || 0 }; })
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch { return []; }
}

/** Compile chosen sermon articles into a BOOK album (chapters) for the library. */
export async function compileSermonsIntoBook(
  church: Organization,
  articles: SermonArticle[],
  opts: { title: string; description?: string },
): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid || articles.length === 0) return null;
  const id = `sermonbook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const bookChapters = articles.map((a, i) => ({ id: `ch_${i}`, title: a.title, content: a.content }));
  await setDoc(doc(db, 'albums', id), {
    id,
    title: opts.title || `${church.name} — Sermon Collection`,
    artist: church.name,
    type: 'BOOK',
    subType: 'NOVEL',
    coverImage: church.coverUrl || church.logoUrl || '',
    bookChapters,
    tracks: [],
    genre: 'Faith',
    description: opts.description || `A collection of sermons from ${church.name}.`,
    ownerId: uid,
    isPublic: true,
    createdAt: Date.now(),
    tags: ['sermon-book', `church:${church.id}`],
  });
  return id;
}
