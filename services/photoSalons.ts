// photoSalons — Part 3C of the Experience Expansion: weekly themed challenges with a
// community exhibition. The photographic equivalent of Reello trends.
//
// Design decision: the *salon itself* is derived, not stored. A salon's identity is a
// deterministic function of the ISO week (`salon-2026-W29`) and its theme is picked from a
// fixed rotation of evergreen photographic prompts below. That means:
//
//   • no admin tooling is required to keep a salon running — one opens every Monday forever;
//   • the theme is identical for every client without a read;
//   • nothing can 404 or drift, and there are no invented external references.
//
// Only *entries* touch Firestore:
//
//   photoSalons/{salonId}/entries/{uid}
//
// One entry per photographer per salon (the doc id IS their uid), so re-submitting swaps
// their pick rather than flooding the exhibition. Reads are single-field ordered
// (`createdAt`) inside one subcollection, so no composite index is ever needed
// (see docs/plajah-firestore-gotchas).
//
// Every function is non-throwing and payloads are built key-by-key so `undefined` is never
// written. The whole module degrades to "no entries yet" if Firestore is unreachable.

import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc,
  query, orderBy, limit as qLimit, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db, auth } from './backendService';

// ── Themes ────────────────────────────────────────────────────────────────────

export interface SalonTheme {
  /** Stable slug — used in the salon id so a theme's history is traceable. */
  slug: string;
  title: string;
  /** One line shown on the salon card. */
  brief: string;
  /** Three concrete things to try — the difference between a prompt and a lesson. */
  prompts: string[];
  /** The critique axis this theme is really training. */
  focus: 'light' | 'composition' | 'story';
}

/**
 * Evergreen themes — deliberately technique-first so a salon is a teaching week, not a
 * popularity contest. These are original prompts written for Plajah; nothing here points
 * at an external collection or id.
 */
export const SALON_THEMES: SalonTheme[] = [
  {
    slug: 'shadow',
    title: 'Shadow',
    brief: 'Let the dark do the describing. Shape the frame with what you withhold.',
    prompts: [
      'Expose for the highlight and let the rest fall away.',
      'Find a shadow with a harder edge than its subject.',
      'Make the shadow the subject — the caster can stay out of frame.',
    ],
    focus: 'light',
  },
  {
    slug: 'blue-hour',
    title: 'Blue Hour',
    brief: 'The twenty minutes after sunset when the sky and the streetlights are equally bright.',
    prompts: [
      'Balance artificial light against the remaining daylight.',
      'Hold the shutter open long enough for motion to appear.',
      'Keep one warm source in a cold frame.',
    ],
    focus: 'light',
  },
  {
    slug: 'negative-space',
    title: 'Negative Space',
    brief: 'Give the subject somewhere to be. Most of the frame should be empty.',
    prompts: [
      'Place the subject on an edge and leave the middle alone.',
      'Use a flat wall, sky, or water as the field.',
      'Crop nothing after the fact — solve it in the viewfinder.',
    ],
    focus: 'composition',
  },
  {
    slug: 'hands',
    title: 'Hands',
    brief: 'A portrait that never shows a face. Hands carry age, work, and nerves.',
    prompts: [
      'Photograph someone mid-task, not posed.',
      'Get close enough that texture reads.',
      'Let the background say where you are.',
    ],
    focus: 'story',
  },
  {
    slug: 'reflection',
    title: 'Reflection',
    brief: 'Two worlds, one frame. Puddles, glass, chrome, screens.',
    prompts: [
      'Shoot the reflection sharp and the real thing soft.',
      'Find a reflection that contradicts its surroundings.',
      'Try one frame where you cannot tell which half is real.',
    ],
    focus: 'composition',
  },
  {
    slug: 'rain',
    title: 'Rain',
    brief: 'Weather is free production design. Go out in the bad stuff.',
    prompts: [
      'Backlight the drops so they read as light, not noise.',
      'Photograph what rain does to people, not just to surfaces.',
      'Use a wet ground plane as a second frame.',
    ],
    focus: 'light',
  },
  {
    slug: 'one-lens',
    title: 'One Lens',
    brief: 'A whole week at a single focal length. Constraint is a teacher.',
    prompts: [
      'Pick the length and do not change it.',
      'Move your feet where you would normally zoom.',
      'Submit the frame that only that lens could have made.',
    ],
    focus: 'composition',
  },
  {
    slug: 'strangers',
    title: 'Strangers',
    brief: 'Ask first. A picture made with consent looks different, and it does.',
    prompts: [
      'Talk to them before you raise the camera.',
      'Shoot where they already are — no relocation.',
      'Write their first name in the caption if they said yes to that too.',
    ],
    focus: 'story',
  },
  {
    slug: 'motion',
    title: 'Motion',
    brief: 'Photography is a time medium pretending not to be. Show the time.',
    prompts: [
      'Drag the shutter and pan with the subject.',
      'Freeze something the eye cannot resolve on its own.',
      'Let one element blur while another stays locked.',
    ],
    focus: 'composition',
  },
  {
    slug: 'home',
    title: 'Home',
    brief: 'The hardest assignment: photograph the place you have stopped seeing.',
    prompts: [
      'Shoot one room at three different hours.',
      'Find the object nobody else would notice.',
      'No wide establishing shot — details only.',
    ],
    focus: 'story',
  },
  {
    slug: 'monochrome',
    title: 'Monochrome',
    brief: 'Remove colour and you are left with light, shape, and nerve.',
    prompts: [
      'Choose a scene that fails in colour and works without it.',
      'Watch your tonal separation — two greys are not a contrast.',
      'Convert deliberately; do not just desaturate.',
    ],
    focus: 'light',
  },
  {
    slug: 'golden-hour',
    title: 'Golden Hour',
    brief: 'The easiest light in the world. Now do something interesting with it.',
    prompts: [
      'Shoot into the sun and control the flare.',
      'Use the long shadows as lines, not decoration.',
      'Avoid the obvious silhouette — find a second idea.',
    ],
    focus: 'light',
  },
];

// ── Salon identity (derived, never stored) ────────────────────────────────────

export interface Salon {
  id: string;                // 'salon-2026-W29'
  theme: SalonTheme;
  /** Monday 00:00 local, ms. */
  opensAt: number;
  /** The following Monday 00:00 local, ms. */
  closesAt: number;
  isoYear: number;
  isoWeek: number;
  status: 'OPEN' | 'CLOSED' | 'UPCOMING';
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** ISO-8601 week number + week-based year for a date. */
function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO weeks start Monday; shift so Thursday determines the year.
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / WEEK_MS);
  return { year: d.getUTCFullYear(), week };
}

/** Local Monday 00:00 of the week containing `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dayNum);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Absolute week index since the ISO epoch Monday, used to pick a theme. Using an absolute
 * index (rather than `week % length`) means the rotation never jumps at a year boundary.
 */
function absoluteWeekIndex(monday: Date): number {
  // 1970-01-05 was a Monday.
  const epochMonday = Date.UTC(1970, 0, 5);
  return Math.floor((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - epochMonday) / WEEK_MS);
}

/** The salon for the week containing `when` (default: now). Pure — safe in render. */
export function salonForDate(when: Date | number = Date.now()): Salon {
  const date = typeof when === 'number' ? new Date(when) : when;
  const monday = mondayOf(date);
  const { year, week } = isoWeekOf(monday);
  const theme = SALON_THEMES[((absoluteWeekIndex(monday) % SALON_THEMES.length) + SALON_THEMES.length) % SALON_THEMES.length];
  const opensAt = monday.getTime();
  const closesAt = opensAt + WEEK_MS;
  const now = Date.now();
  return {
    id: `salon-${year}-W${String(week).padStart(2, '0')}-${theme.slug}`,
    theme,
    opensAt,
    closesAt,
    isoYear: year,
    isoWeek: week,
    status: now < opensAt ? 'UPCOMING' : now >= closesAt ? 'CLOSED' : 'OPEN',
  };
}

/** This week's salon. */
export const currentSalon = (): Salon => salonForDate(Date.now());

/** The `count` most recent salons, newest first (index 0 is the live one). */
export function recentSalons(count = 8): Salon[] {
  const out: Salon[] = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    out.push(salonForDate(Date.now() - i * WEEK_MS));
  }
  return out;
}

/** ms remaining in an open salon; 0 once closed. */
export function timeLeft(salon: Salon): number {
  return Math.max(0, salon.closesAt - Date.now());
}

/** '3d 04h' / '04h 12m' / '12m' — for the countdown chip. */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'Closed';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = mins % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

// ── Entries ───────────────────────────────────────────────────────────────────

export interface SalonEntry {
  id: string;              // === ownerId
  salonId: string;
  photoId: string;
  photoUrl: string;
  ownerId: string;
  ownerName: string;
  title: string;
  note: string;            // the photographer's one-line intent
  createdAt: number;
  /** uids who marked this as a standout. Kept as an array — the exhibition is small. */
  applause: string[];
}

const entriesRef = (salonId: string) => collection(db, 'photoSalons', salonId, 'entries');

/** Every entry in a salon, newest first. Returns [] on any failure. */
export async function fetchSalonEntries(salonId: string, max = 120): Promise<SalonEntry[]> {
  if (!salonId) return [];
  try {
    const snap = await getDocs(query(entriesRef(salonId), orderBy('createdAt', 'desc'), qLimit(max)));
    return snap.docs.map(d => {
      const data = d.data() as Partial<SalonEntry>;
      return {
        id: d.id,
        salonId,
        photoId: data.photoId || '',
        photoUrl: data.photoUrl || '',
        ownerId: data.ownerId || d.id,
        ownerName: data.ownerName || 'Anonymous',
        title: data.title || '',
        note: data.note || '',
        createdAt: data.createdAt || 0,
        applause: Array.isArray(data.applause) ? data.applause : [],
      } as SalonEntry;
    }).filter(e => !!e.photoUrl);
  } catch (err) {
    console.warn('[photoSalons] fetchSalonEntries failed:', err);
    return [];
  }
}

/** The signed-in user's entry in a salon, or null. */
export async function fetchMyEntry(salonId: string): Promise<SalonEntry | null> {
  const uid = auth.currentUser?.uid;
  if (!uid || !salonId) return null;
  try {
    const snap = await getDoc(doc(entriesRef(salonId), uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<SalonEntry>;
    return {
      id: uid,
      salonId,
      photoId: data.photoId || '',
      photoUrl: data.photoUrl || '',
      ownerId: uid,
      ownerName: data.ownerName || 'Anonymous',
      title: data.title || '',
      note: data.note || '',
      createdAt: data.createdAt || 0,
      applause: Array.isArray(data.applause) ? data.applause : [],
    };
  } catch (err) {
    console.warn('[photoSalons] fetchMyEntry failed:', err);
    return null;
  }
}

export interface SalonSubmission {
  photoId: string;
  photoUrl: string;
  title?: string;
  note?: string;
  ownerName?: string;
}

/**
 * Submit (or replace) the signed-in user's entry. Closed salons reject client-side; the
 * rule below enforces it properly. Returns the stored entry, or null.
 */
export async function submitToSalon(salon: Salon, input: SalonSubmission): Promise<SalonEntry | null> {
  const user = auth.currentUser;
  if (!user || !salon?.id || !input?.photoUrl) return null;
  // Re-check the clock rather than trusting `status`, which was frozen when the Salon
  // object was constructed and may be stale in a long-lived session.
  if (Date.now() < salon.opensAt || Date.now() >= salon.closesAt) return null;

  const now = Date.now();
  // Field-complete payload — no key is ever assigned `undefined`.
  const payload: Record<string, unknown> = {
    salonId: salon.id,
    photoId: input.photoId || '',
    photoUrl: input.photoUrl,
    ownerId: user.uid,
    ownerName: (input.ownerName || user.displayName || 'Anonymous').slice(0, 80),
    title: (input.title || '').trim().slice(0, 140),
    note: (input.note || '').trim().slice(0, 400),
    createdAt: now,
  };

  try {
    // merge:true preserves any applause already collected if they swap their pick.
    await setDoc(doc(entriesRef(salon.id), user.uid), payload, { merge: true });
    return { id: user.uid, applause: [], ...(payload as unknown as Omit<SalonEntry, 'id' | 'applause'>) };
  } catch (err) {
    console.warn('[photoSalons] submitToSalon failed:', err);
    return null;
  }
}

/** Withdraw the signed-in user's entry. Resolves false on failure. */
export async function withdrawFromSalon(salonId: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !salonId) return false;
  try {
    await deleteDoc(doc(entriesRef(salonId), uid));
    return true;
  } catch (err) {
    console.warn('[photoSalons] withdrawFromSalon failed:', err);
    return false;
  }
}

/** Toggle the signed-in user's applause on someone's entry. Resolves the new state. */
export async function toggleApplause(salonId: string, entryId: string, on: boolean): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !salonId || !entryId) return !on;
  try {
    await updateDoc(doc(entriesRef(salonId), entryId), {
      applause: on ? arrayUnion(uid) : arrayRemove(uid),
    });
    return on;
  } catch (err) {
    console.warn('[photoSalons] toggleApplause failed:', err);
    return !on;
  }
}

/** Exhibition order: most applauded first, then newest. Pure. */
export function rankEntries(entries: SalonEntry[]): SalonEntry[] {
  return [...entries].sort((a, b) => {
    const d = (b.applause?.length || 0) - (a.applause?.length || 0);
    return d !== 0 ? d : b.createdAt - a.createdAt;
  });
}

/**
 * Firestore rules needed (add to firestore.rules — not edited here by design):
 *
 *   match /photoSalons/{salonId}/entries/{entryId} {
 *     allow read: if true;
 *     allow create, update: if request.auth != null
 *                           && request.auth.uid == entryId
 *                           && request.resource.data.ownerId == request.auth.uid
 *                           && request.resource.data.photoUrl is string
 *                           && request.resource.data.photoUrl.size() > 0
 *                           && request.resource.data.note.size() <= 400
 *                           && request.resource.data.title.size() <= 140;
 *     allow delete: if request.auth != null && request.auth.uid == entryId;
 *   }
 *
 *   // Applause is a cross-user write to someone else's entry doc, so it needs its own
 *   // allowance: only the `applause` field may change, and only by the toggling user.
 *   match /photoSalons/{salonId}/entries/{entryId} {
 *     allow update: if request.auth != null
 *                   && request.resource.data.diff(resource.data).affectedKeys()
 *                        .hasOnly(['applause']);
 *   }
 */
