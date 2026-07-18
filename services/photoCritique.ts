// photoCritique — Part 3C of the Experience Expansion: opt-in structured feedback on a photo.
//
// Modelled on the Labs peer-review `ReviewData` shape: rather than a like or a free-text
// comment, a critique is three 1–5 scores on the axes photographers actually argue about —
// composition, light and story — plus a written note. The aggregate gives a photographer a
// read on *which* axis is landing, which a like count never can.
//
// Storage: photoCritiques/{photoId}/entries/{critiqueId}
//   One entry per critic per photo (the doc id IS the critic's uid), so re-submitting
//   updates rather than duplicating.
//
// Every function is non-throwing — a Firestore outage must never break the photo detail
// view — and payloads are built key-by-key so `undefined` is never written (see
// docs/plajah-firestore-gotchas: undefined field writes throw).

import {
  collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, limit as qLimit,
} from 'firebase/firestore';
import { db, auth } from './backendService';

// ── Model ─────────────────────────────────────────────────────────────────────

/** The three axes. Kept deliberately short — more axes means fewer critiques. */
export const CRITIQUE_AXES = [
  { id: 'composition', label: 'Composition', hint: 'Framing, balance, where the eye goes.' },
  { id: 'light', label: 'Light', hint: 'Quality, direction, exposure, how form is modelled.' },
  { id: 'story', label: 'Story', hint: 'Does it say something? Does it hold you?' },
] as const;

export type CritiqueAxis = typeof CRITIQUE_AXES[number]['id'];

export interface PhotoCritique {
  id: string;
  photoId: string;
  critiqueId: string;      // author uid
  authorName: string;
  composition: number;     // 1–5
  light: number;           // 1–5
  story: number;           // 1–5
  comment: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CritiqueAggregate {
  count: number;
  composition: number;     // mean, 1 decimal place; 0 when there are no critiques
  light: number;
  story: number;
  overall: number;
  /** The weakest axis by mean — the most useful single thing to tell a photographer. */
  weakestAxis: CritiqueAxis | null;
  strongestAxis: CritiqueAxis | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const clampScore = (n: unknown): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.min(5, Math.max(1, v));
};

const entriesRef = (photoId: string) => collection(db, 'photoCritiques', photoId, 'entries');

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Read ──────────────────────────────────────────────────────────────────────

/** All critiques for a photo, newest first. Returns [] on any failure. */
export async function fetchCritiques(photoId: string, max = 60): Promise<PhotoCritique[]> {
  if (!photoId) return [];
  try {
    const snap = await getDocs(query(entriesRef(photoId), orderBy('createdAt', 'desc'), qLimit(max)));
    return snap.docs.map(d => {
      const data = d.data() as Partial<PhotoCritique>;
      return {
        id: d.id,
        photoId,
        critiqueId: data.critiqueId || d.id,
        authorName: data.authorName || 'Anonymous critic',
        composition: clampScore(data.composition),
        light: clampScore(data.light),
        story: clampScore(data.story),
        comment: data.comment || '',
        createdAt: data.createdAt || 0,
        ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
      } as PhotoCritique;
    });
  } catch (err) {
    console.warn('[photoCritique] fetchCritiques failed:', err);
    return [];
  }
}

/** Mean per axis across a critique list. Pure — safe to call during render. */
export function aggregateCritiques(list: PhotoCritique[]): CritiqueAggregate {
  const count = list.length;
  if (!count) {
    return { count: 0, composition: 0, light: 0, story: 0, overall: 0, weakestAxis: null, strongestAxis: null };
  }
  const mean = (k: CritiqueAxis) => round1(list.reduce((s, c) => s + c[k], 0) / count);
  const composition = mean('composition');
  const light = mean('light');
  const story = mean('story');
  const pairs: [CritiqueAxis, number][] = [['composition', composition], ['light', light], ['story', story]];
  const sorted = [...pairs].sort((a, b) => a[1] - b[1]);
  return {
    count,
    composition,
    light,
    story,
    overall: round1((composition + light + story) / 3),
    weakestAxis: sorted[0][0],
    strongestAxis: sorted[sorted.length - 1][0],
  };
}

/** The signed-in user's own critique, if they have left one. */
export function findMyCritique(list: PhotoCritique[]): PhotoCritique | null {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  return list.find(c => c.critiqueId === uid) || null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface CritiqueInput {
  composition: number;
  light: number;
  story: number;
  comment: string;
  /** Falls back to the auth display name. */
  authorName?: string;
}

/**
 * Submit (or replace) the signed-in user's critique of a photo.
 * Returns the stored critique, or null if not signed in / the write failed.
 */
export async function submitCritique(photoId: string, input: CritiqueInput): Promise<PhotoCritique | null> {
  const user = auth.currentUser;
  if (!user || !photoId) return null;

  const now = Date.now();
  const authorName = (input.authorName || user.displayName || 'Anonymous critic').slice(0, 80);
  const comment = (input.comment || '').trim().slice(0, 2000);

  // Field-complete payload — no key is ever assigned `undefined`.
  const payload: Record<string, unknown> = {
    photoId,
    critiqueId: user.uid,
    authorName,
    composition: clampScore(input.composition),
    light: clampScore(input.light),
    story: clampScore(input.story),
    comment,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(entriesRef(photoId), user.uid), payload, { merge: true });
    return { id: user.uid, ...(payload as unknown as Omit<PhotoCritique, 'id'>) };
  } catch (err) {
    console.warn('[photoCritique] submitCritique failed:', err);
    return null;
  }
}

/** Withdraw the signed-in user's critique. Resolves false on failure. */
export async function deleteMyCritique(photoId: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !photoId) return false;
  try {
    await deleteDoc(doc(entriesRef(photoId), uid));
    return true;
  } catch (err) {
    console.warn('[photoCritique] deleteMyCritique failed:', err);
    return false;
  }
}

/**
 * Firestore rules needed (add to firestore.rules — not edited here by design):
 *
 *   match /photoCritiques/{photoId}/entries/{critiqueId} {
 *     allow read: if true;
 *     allow create, update: if request.auth != null
 *                           && request.auth.uid == critiqueId
 *                           && request.resource.data.critiqueId == request.auth.uid
 *                           && request.resource.data.composition is int
 *                           && request.resource.data.composition >= 1
 *                           && request.resource.data.composition <= 5
 *                           && request.resource.data.light is int
 *                           && request.resource.data.light >= 1
 *                           && request.resource.data.light <= 5
 *                           && request.resource.data.story is int
 *                           && request.resource.data.story >= 1
 *                           && request.resource.data.story <= 5
 *                           && request.resource.data.comment.size() <= 2000;
 *     allow delete: if request.auth != null && request.auth.uid == critiqueId;
 *   }
 */
