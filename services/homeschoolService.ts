/**
 * Homeschool records: the weekly plan, the hours log and the portfolio for a family. One document
 * per parent (`homeschool/{parentUid}`), mirrored to this device so it works offline and for
 * families who are not signed in yet. These are the records many states ask homeschoolers to keep,
 * so they are exportable (see HomeschoolHub); Plajah does not decide what a state requires.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export interface HoursEntry { id: string; childUid: string; date: string; subject: string; minutes: number; note?: string }
export interface PortfolioItem { id: string; childUid: string; date: string; subject: string; title: string; note?: string; link?: string }
/** plan[childUid][weekKey][subject] = array of 7 booleans (Mon..Sun). */
export type WeekPlan = Record<string, Record<string, Record<string, boolean[]>>>;

export interface HomeschoolDoc {
  subjects: Record<string, string[]>;   // childUid -> chosen subjects
  plan: WeekPlan;
  hours: HoursEntry[];
  portfolio: PortfolioItem[];
  updatedAt: number;
}

export const DEFAULT_SUBJECTS = ['Math', 'Reading & Language', 'Science', 'History & Civics', 'Arts & Music', 'Money & Business'];
export const emptyDoc = (): HomeschoolDoc => ({ subjects: {}, plan: {}, hours: [], portfolio: [], updatedAt: 0 });

const lsKey = (uid: string) => `plajah:homeschool:${uid}`;
const readLocal = (uid: string): HomeschoolDoc | null => { try { const r = localStorage.getItem(lsKey(uid)); return r ? JSON.parse(r) : null; } catch { return null; } };

export async function loadHomeschool(uid?: string): Promise<HomeschoolDoc> {
  const id = uid || auth.currentUser?.uid;
  if (!id) return readLocal('anon') || emptyDoc();
  const local = readLocal(id);
  try {
    const snap = await getDoc(doc(db, 'homeschool', id));
    if (snap.exists()) {
      const remote = { ...emptyDoc(), ...(snap.data() as Partial<HomeschoolDoc>) };
      return (local && local.updatedAt > remote.updatedAt) ? local : remote;
    }
  } catch { /* offline or rules */ }
  return local || emptyDoc();
}

export async function saveHomeschool(d: HomeschoolDoc, uid?: string): Promise<boolean> {
  const id = uid || auth.currentUser?.uid || 'anon';
  const next = { ...d, updatedAt: Date.now() };
  try { localStorage.setItem(lsKey(id), JSON.stringify(next)); } catch { /* private mode */ }
  if (id === 'anon') return false;
  try { await setDoc(doc(db, 'homeschool', id), JSON.parse(JSON.stringify(next))); return true; } catch { return false; }
}

/** ISO week key like 2026-W40 (Monday-based), stable for storing a plan. */
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

export const totalMinutesBySubject = (hours: HoursEntry[], childUid: string): Record<string, number> =>
  hours.filter(h => h.childUid === childUid).reduce((m, h) => { m[h.subject] = (m[h.subject] || 0) + h.minutes; return m; }, {} as Record<string, number>);

/** CSV for a state report or a co-op. Quotes every field. */
export function hoursCsv(hours: HoursEntry[], childName: string, childUid: string): string {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = hours.filter(h => h.childUid === childUid).sort((a, b) => a.date.localeCompare(b.date));
  return [['Student', 'Date', 'Subject', 'Minutes', 'Notes'].map(q).join(','), ...rows.map(r => [childName, r.date, r.subject, r.minutes, r.note || ''].map(q).join(','))].join('\n');
}
