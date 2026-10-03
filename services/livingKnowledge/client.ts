/**
 * Browser-side reads of the living-knowledge layer. Best-effort: if the collections are empty, the
 * rules are not deployed yet, or the learner is offline, this returns [] and the course simply
 * shows no developments. Items are public records; nothing here is personal.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../backendService';
import type { Impact } from './types';

const cache = new Map<string, { at: number; rows: Impact[] }>();

export async function loadOpenImpacts(courseId: string): Promise<Impact[]> {
  const hit = cache.get(courseId); if (hit && Date.now() - hit.at < 5 * 60_000) return hit.rows;
  try {
    const snap = await getDocs(query(collection(db, 'knowledge_impacts'), where('courseId', '==', courseId), limit(300)));
    const rows = snap.docs.map(d => d.data() as Impact).filter(i => i.state === 'open').sort((a, b) => (b.itemDate || '').localeCompare(a.itemDate || ''));
    cache.set(courseId, { at: Date.now(), rows });
    return rows;
  } catch { return []; }
}

export const byLesson = (rows: Impact[]): Record<string, Impact[]> => {
  const out: Record<string, Impact[]> = {};
  for (const r of rows) (out[r.lessonId] ||= []).push(r);
  return out;
};
