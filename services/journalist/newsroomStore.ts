// Firestore access for the journalist toolset. One thin generic layer so every tool (desk, pitches,
// sources, claims, interviews, publications, credentials) shares the same rules: owner-scoped,
// optionally org-scoped, no undefined writes, client-side sort (no composite indexes needed).
//
// Collections (see firestore.rules, UNDEPLOYED):
//   newsroom_stories, newsroom_pitches, newsroom_claims     owner or org-staff
//   newsroom_sources, newsroom_source_log, newsroom_interviews   OWNER ONLY (never org-shared: source protection)
//   publications                                             public read; owner / org-staff write
//   press_credentials                                        owner; reviewStatus changed by Plajah staff only
//   journalist_badges/{uid}                                  public read; Plajah staff write (the verified badge)

import { collection, deleteDoc, doc as fsDoc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../backendService';
import type {
  Claim, InterviewRecord, NewsroomStory, Pitch, PressCredential, Publication, SourceContact, SourceLogEntry, StoryStage,
} from './types';

export type NewsroomCollection =
  | 'newsroom_stories' | 'newsroom_pitches' | 'newsroom_claims' | 'newsroom_sources' | 'newsroom_source_log'
  | 'newsroom_interviews' | 'publications' | 'press_credentials';

const clean = <T extends Record<string, any>>(o: T): T => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? clean(x) : x)) : v && typeof v === 'object' && !(v instanceof Date) ? clean(v) : v;
  }
  return out as T;
};

export const newId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const uid = () => auth.currentUser?.uid || '';

export async function listOwned<T extends { id: string }>(col: NewsroomCollection, ownerId = uid()): Promise<T[]> {
  if (!ownerId) return [];
  const snap = await getDocs(query(collection(db, col), where('ownerId', '==', ownerId)));
  return snap.docs.map(d => ({ ...(d.data() as any), id: d.id }) as T);
}

export async function listForOrg<T extends { id: string }>(col: Exclude<NewsroomCollection, 'newsroom_sources' | 'newsroom_source_log' | 'newsroom_interviews'>, orgId: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, col), where('orgId', '==', orgId)));
  return snap.docs.map(d => ({ ...(d.data() as any), id: d.id }) as T);
}

export async function listWhere<T extends { id: string }>(col: NewsroomCollection, field: string, value: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, col), where(field, '==', value), where('ownerId', '==', uid())));
  return snap.docs.map(d => ({ ...(d.data() as any), id: d.id }) as T);
}

export async function saveItem<T extends { id: string }>(col: NewsroomCollection, item: T): Promise<T> {
  if (!uid()) throw new Error('Sign in first.');
  const next = clean({ ...item, ownerId: (item as any).ownerId || uid(), updatedAt: Date.now() } as any) as T;
  await setDoc(fsDoc(db, col, item.id), next, { merge: false });
  return next;
}

export async function removeItem(col: NewsroomCollection, id: string): Promise<void> {
  await deleteDoc(fsDoc(db, col, id));
}

// ── typed helpers ─────────────────────────────────────────────────────────────

export const newStory = (slug: string, stage: StoryStage = 'PITCH', extra: Partial<NewsroomStory> = {}): NewsroomStory => ({
  id: newId('story'), ownerId: uid(), slug, stage, createdAt: Date.now(), updatedAt: Date.now(), ...extra,
});
export const newPitch = (headline: string, angle: string, extra: Partial<Pitch> = {}): Pitch => ({
  id: newId('pitch'), ownerId: uid(), headline, angle, status: 'DRAFT', createdAt: Date.now(), updatedAt: Date.now(), ...extra,
});
export const newSource = (name: string, extra: Partial<SourceContact> = {}): SourceContact => ({
  id: newId('src'), ownerId: uid(), name, attribution: 'ON_RECORD', confidential: false, createdAt: Date.now(), updatedAt: Date.now(), ...extra,
});
export const newLogEntry = (sourceId: string, e: Partial<SourceLogEntry> & Pick<SourceLogEntry, 'summary'>): SourceLogEntry => ({
  id: newId('log'), ownerId: uid(), sourceId, at: Date.now(), kind: 'INTERVIEW', attribution: 'ON_RECORD', ...e,
});
export const newPublication = (name: string, slug: string, extra: Partial<Publication> = {}): Publication => ({
  id: newId('pub'), ownerId: uid(), name, slug, sections: ['News'], editors: [], access: 'FREE', createdAt: Date.now(), updatedAt: Date.now(), ...extra,
});
export const newCredential = (issuer: string, kind: PressCredential['kind'], extra: Partial<PressCredential> = {}): PressCredential => ({
  id: newId('cred'), ownerId: uid(), issuer, kind, reviewStatus: 'SELF_ASSERTED', createdAt: Date.now(), ...extra,
});
export const newInterview = (title: string, extra: Partial<InterviewRecord> = {}): InterviewRecord => ({
  id: newId('int'), ownerId: uid(), title, recordedAt: Date.now(), durationSec: 0, segments: [], transcriptEngine: 'none', ...extra,
});

export async function publicationBySlug(slug: string): Promise<Publication | null> {
  const snap = await getDocs(query(collection(db, 'publications'), where('slug', '==', slug)));
  return snap.empty ? null : ({ ...(snap.docs[0].data() as any), id: snap.docs[0].id } as Publication);
}

/** Public: the verified-journalist badge, set only by Plajah staff after reviewing a press credential. */
export async function getJournalistBadge(userId: string): Promise<{ verified: boolean; outlet?: string; since?: number } | null> {
  try {
    const s = await getDoc(fsDoc(db, 'journalist_badges', userId));
    return s.exists() ? (s.data() as any) : null;
  } catch { return null; }
}

export type { Claim };
