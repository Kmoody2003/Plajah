/**
 * Lorea Projects Service
 * ----------------------
 * Lists a user's real Lorea writing work so it can auto-populate the Writer
 * section of the Artist Manager. Books live in `studio_books` (owner field
 * `userId`) and screenplays in `scripts` (owner field `ownerId`); chapters are
 * embedded (book `pages[]`, script `elements[]`). Word counts are derived.
 *
 * where(...) is used WITHOUT orderBy to avoid a composite-index requirement
 * (Firestore gotcha) — results are sorted client-side.
 */

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './backendService';

export interface WritingChapter {
  id: string;
  projectId: string;
  order: number;
  title: string;
  wordCount: number;
  status: 'OUTLINE' | 'DRAFTING' | 'REVISION' | 'FINAL';
}

export interface WritingProject {
  id: string;
  kind: 'BOOK' | 'SCRIPT';
  title: string;
  type: 'BOOK' | 'SCRIPT';
  status: 'DRAFTING' | 'PUBLISHED' | 'EDITING' | 'ACTIVE';
  genre: string;
  logline: string;
  coverImageUrl?: string;
  wordCountCurrent: number;
  wordCountTarget: number;
  chapterCount: number;
  updatedAt: number;
  createdAt: number;
  source: 'lorea';
}

const stripHtml = (html?: string) => (html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
const countWords = (s: string) => { const t = (s || '').trim(); return t ? t.split(/\s+/).length : 0; };
function tsToMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') { try { return v.toMillis(); } catch { /* noop */ } }
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  return 0;
}

function mapBook(d: any): { project: WritingProject; chapters: WritingChapter[] } {
  const pages: any[] = Array.isArray(d.pages) ? d.pages : [];
  const ordered = [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const chapters: WritingChapter[] = ordered
    .filter(p => p.type !== 'COVER')
    .map((p, i) => {
      const wc = countWords(stripHtml(p.richText));
      return {
        id: p.id || `${d.id}_p${i}`,
        projectId: d.id,
        order: p.order ?? i + 1,
        title: p.chapterTitle || (p.type === 'CHAPTER_BREAK' ? 'Chapter Break' : `Page ${i + 1}`),
        wordCount: wc,
        status: (wc > 0 ? 'DRAFTING' : 'OUTLINE') as WritingChapter['status'],
      };
    });
  const wordCountCurrent = chapters.reduce((s, c) => s + c.wordCount, 0);
  return {
    project: {
      id: d.id, kind: 'BOOK', title: d.title || 'Untitled Book', type: 'BOOK',
      status: d.publishedAlbumId ? 'PUBLISHED' : 'DRAFTING',
      genre: d.genre || d.format || 'Prose', logline: d.synopsis || '',
      coverImageUrl: d.coverImageUrl,
      wordCountCurrent, wordCountTarget: d.format === 'NOVEL' ? 80000 : 0,
      chapterCount: chapters.length, updatedAt: tsToMs(d.updatedAt) || tsToMs(d.savedAt), createdAt: tsToMs(d.createdAt), source: 'lorea',
    },
    chapters,
  };
}

function mapScript(d: any): { project: WritingProject; chapters: WritingChapter[] } {
  const elements: any[] = Array.isArray(d.elements) ? d.elements : [];
  const chapters: WritingChapter[] = [];
  let cur: WritingChapter | null = null;
  let order = 0;
  for (const el of elements) {
    if (el.type === 'SCENE_HEADING') {
      order += 1;
      cur = { id: el.id || `${d.id}_s${order}`, projectId: d.id, order, title: (el.text || `Scene ${order}`).trim(), wordCount: 0, status: 'DRAFTING' };
      chapters.push(cur);
    } else if (cur) {
      cur.wordCount += countWords(el.text || '');
    }
  }
  const wordCountCurrent = elements.reduce((s, e) => s + countWords(e.text || ''), 0);
  const title = d.titlePage?.title || d.logline || 'Untitled Script';
  return {
    project: {
      id: d.id, kind: 'SCRIPT', title, type: 'SCRIPT',
      status: (d.currentRevisionColor && d.currentRevisionColor !== 'WHITE') ? 'EDITING' : 'DRAFTING',
      genre: d.genre || d.format || 'Screenplay', logline: d.logline || d.synopsis || '',
      wordCountCurrent, wordCountTarget: 0, chapterCount: chapters.length,
      updatedAt: tsToMs(d.updatedAt), createdAt: tsToMs(d.createdAt), source: 'lorea',
    },
    chapters,
  };
}

/** Fetch the signed-in user's real Lorea books + screenplays, normalized. */
export async function listWritingProjects(uid: string): Promise<{ projects: WritingProject[]; chapters: WritingChapter[] }> {
  if (!uid) return { projects: [], chapters: [] };
  const projects: WritingProject[] = [];
  const chapters: WritingChapter[] = [];
  try {
    const [books, scripts] = await Promise.all([
      getDocs(query(collection(db, 'studio_books'), where('userId', '==', uid))).catch(() => null),
      getDocs(query(collection(db, 'scripts'), where('ownerId', '==', uid))).catch(() => null),
    ]);
    books?.docs.forEach(doc => { const { project, chapters: ch } = mapBook({ id: doc.id, ...doc.data() }); projects.push(project); chapters.push(...ch); });
    scripts?.docs.forEach(doc => { const { project, chapters: ch } = mapScript({ id: doc.id, ...doc.data() }); projects.push(project); chapters.push(...ch); });
  } catch { /* offline / signed-out — return whatever we have */ }
  projects.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  return { projects, chapters };
}

/**
 * Fetch a screenplay's scenes as { heading, text } blocks — the full page text
 * of each scene, for generating real production sides. Text is the readable
 * lines (action + character + dialogue) under each SCENE_HEADING.
 */
export async function fetchScriptScenes(scriptId: string): Promise<{ heading: string; text: string }[]> {
  if (!scriptId) return [];
  try {
    const snap = await getDoc(doc(db, 'scripts', scriptId));
    if (!snap.exists()) return [];
    const elements: any[] = (snap.data() as any)?.elements || [];
    const blocks: { heading: string; text: string }[] = [];
    let cur: { heading: string; text: string } | null = null;
    for (const el of elements) {
      const text = (el.text || '').trim();
      if (el.type === 'SCENE_HEADING') {
        cur = { heading: text, text: '' };
        blocks.push(cur);
      } else if (cur && text) {
        const line = el.type === 'CHARACTER' ? `\n${text.toUpperCase()}`
          : el.type === 'PARENTHETICAL' ? `  ${text}`
          : el.type === 'DIALOGUE' ? `  ${text}`
          : el.type === 'TRANSITION' ? `\n${text}` : `\n${text}`;
        cur.text += line + '\n';
      }
    }
    return blocks;
  } catch { return []; }
}
