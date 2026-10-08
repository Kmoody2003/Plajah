// templateLibrary — saved, shareable copies of platform templates.
//
// A saved template never forks the designer code: it records which platform
// designer it customises (Ambo slide template or scripture look) plus the
// user's field values and theme overrides (palette accents, motion styles and
// timing). Every surface that can draw the platform designer — Ambo outputs,
// the gallery, the Universal Library, Tela/Fabula via the slide-template
// renderer — can therefore draw the saved one too.
//
// Firestore: `templateLibrary/{id}` (rules: owner writes; readable when public,
// shared with you, or yours). Guests keep templates in localStorage only.
import {
  collection, doc, getDocs, limit, query, setDoc, deleteDoc, where, updateDoc, increment,
} from 'firebase/firestore';
import { db, auth } from '../backendService';
import type { ThemeOverrides } from './slideTemplates/types';

export type TemplateKind = 'ambo-slide' | 'scripture-look' | 'tela-motion';
export type TemplateVisibility = 'private' | 'shared' | 'public';

export interface SavedTemplate {
  id: string;
  ownerUid: string;
  ownerName?: string;
  kind: TemplateKind;
  name: string;
  description?: string;
  visibility: TemplateVisibility;
  sharedWith: string[];
  /** Ambo slide: platform template id + theme id. */
  baseTemplateId?: string;
  theme?: string;
  fields?: Record<string, string>;
  overrides?: ThemeOverrides;
  /** Scripture look: layout + transitions + accent + blend. */
  look?: { layoutId: string; transition?: string; verseTransition?: string; accent?: string; bgBlend?: string; bgOpacity?: number };
  /** Small WebP/JPEG data URL for the library tile. */
  thumb?: string;
  tags?: string[];
  uses?: number;
  createdAt: number;
  updatedAt: number;
}

const COL = 'templateLibrary';
const LOCAL_KEY = 'plajah_template_library_local_v1';

/** Firestore rejects undefined — drop it recursively. */
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as any;
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v as any)) if (x !== undefined) o[k] = clean(x);
    return o;
  }
  return v;
}

function localAll(): SavedTemplate[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function localWrite(list: SavedTemplate[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 200))); } catch { /* quota */ }
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* */ } });
export function subscribeTemplateLibrary(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function newTemplateId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create or update a saved template. Signed-in → Firestore; guest → this browser. */
export async function saveTemplate(t: Omit<SavedTemplate, 'ownerUid' | 'createdAt' | 'updatedAt' | 'id'> & { id?: string; createdAt?: number }): Promise<SavedTemplate> {
  const user = auth.currentUser;
  const now = Date.now();
  const rec: SavedTemplate = clean({
    ...t,
    id: t.id || newTemplateId(),
    ownerUid: user?.uid || 'local',
    ownerName: t.ownerName || user?.displayName || undefined,
    sharedWith: t.visibility === 'shared' ? (t.sharedWith || []).slice(0, 200) : t.visibility === 'public' ? (t.sharedWith || []) : [],
    createdAt: t.createdAt || now,
    updatedAt: now,
    uses: t.uses || 0,
  });
  if (!user) {
    const list = localAll().filter(x => x.id !== rec.id);
    localWrite([rec, ...list]);
  } else {
    await setDoc(doc(db, COL, rec.id), rec);
  }
  emit();
  return rec;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!auth.currentUser) localWrite(localAll().filter(x => x.id !== id));
  else await deleteDoc(doc(db, COL, id));
  emit();
}

export async function shareTemplate(t: SavedTemplate, uids: string[], visibility: TemplateVisibility = 'shared'): Promise<SavedTemplate> {
  const sharedWith = Array.from(new Set([...(t.sharedWith || []), ...uids])).filter(u => u && u !== t.ownerUid);
  return saveTemplate({ ...t, sharedWith, visibility });
}

function rows(snap: any): SavedTemplate[] { return snap.docs.map((d: any) => ({ ...(d.data() as SavedTemplate), id: d.id })); }

/** My templates (newest first). */
export async function listMyTemplates(kind?: TemplateKind): Promise<SavedTemplate[]> {
  const user = auth.currentUser;
  if (!user) return localAll().filter(t => !kind || t.kind === kind);
  const snap = await getDocs(query(collection(db, COL), where('ownerUid', '==', user.uid), limit(200)));
  return rows(snap).filter(t => !kind || t.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Templates other people shared with me. */
export async function listSharedWithMe(kind?: TemplateKind): Promise<SavedTemplate[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(collection(db, COL), where('sharedWith', 'array-contains', user.uid), limit(200)));
  return rows(snap).filter(t => !kind || t.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Community: public templates, most used first (client-sorted so no composite index is needed). */
export async function listCommunityTemplates(kind?: TemplateKind): Promise<SavedTemplate[]> {
  const snap = await getDocs(query(collection(db, COL), where('visibility', '==', 'public'), limit(300)));
  return rows(snap).filter(t => !kind || t.kind === kind).sort((a, b) => (b.uses || 0) - (a.uses || 0) || b.updatedAt - a.updatedAt);
}

/** Count a use (insert into a show). Best-effort; never throws. */
export async function noteTemplateUse(t: SavedTemplate): Promise<void> {
  if (!auth.currentUser || t.ownerUid === 'local') return;
  try { await updateDoc(doc(db, COL, t.id), { uses: increment(1) }); } catch { /* not allowed / offline */ }
}

/** Find people to share with (display name / username / handle). */
export async function findPeople(term: string): Promise<Array<{ uid: string; name: string; handle?: string; avatar?: string }>> {
  if (!term.trim()) return [];
  const { searchUsers } = await import('../backendService');
  const me = auth.currentUser?.uid;
  const users = await searchUsers(term);
  return users
    .map((u: any) => ({ uid: u.uid || u.id, name: u.displayName || u.username || 'Plajah user', handle: u.username || u.handle, avatar: u.photoURL || u.avatarUrl }))
    .filter(u => u.uid && u.uid !== me)
    .slice(0, 12);
}

/** Render-ready fields for a saved Ambo slide: overrides travel inside the reserved __theme field. */
export function slideFieldsFor(t: SavedTemplate): Record<string, string> {
  const f = { ...(t.fields || {}) };
  if (t.overrides && Object.keys(t.overrides).length) f.__theme = JSON.stringify(t.overrides);
  return f;
}

/** Downscaled thumbnail data URL from a canvas (kept small for Firestore). */
export function thumbFromCanvas(src: HTMLCanvasElement, maxW = 480): string {
  const k = Math.min(1, maxW / src.width);
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/webp', 0.78);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.78);
  return url;
}

