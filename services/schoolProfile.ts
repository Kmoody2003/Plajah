/**
 * School profile: how a school or family learns, so Academia can fit it.
 *
 * Deliberately COMPOSABLE rather than a flat list of school "types": a Catholic classical
 * homeschool, a secular charter, a Muslim day school and a Montessori co-op are all just different
 * combinations of four independent questions:
 *
 *   setting    who runs it       public / charter / private / homeschool / co-op / online
 *   tradition  faith framing     secular / catholic / protestant / orthodox / jewish / islamic / other
 *   approach   how it teaches    standard / classical / montessori / waldorf / charlotte-mason / unschooling
 *   scripture  integrate texts?  on/off + translation (only when the school wants it)
 *
 * Principles:
 *  - Additive, never substitutive. A tradition layer ADDS perspective-labelled connections (scripture
 *    echoes, church history, devotional reading). It never changes the facts of a lesson: science,
 *    history and math content is the same for every school.
 *  - Opt-in. Nothing religious appears unless the school or family turned it on.
 *  - The school decides. Students inherit their school's (or their parent's) profile; they cannot change it.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export type Setting = 'public' | 'charter' | 'private' | 'homeschool' | 'coop' | 'online';
export type Tradition = 'secular' | 'catholic' | 'protestant' | 'orthodox' | 'jewish' | 'islamic' | 'other';
export type Approach = 'standard' | 'classical' | 'montessori' | 'waldorf' | 'charlotte-mason' | 'unschooling';

export interface SchoolProfile {
  setting: Setting;
  tradition: Tradition;
  approach: Approach;
  /** Scripture integration in reading and history. Off unless the school asks for it. */
  scripture: { enabled: boolean; translation: string };
  /** Free-text name shown in the hub, e.g. "St. Brigid's Academy" or "The Okafor Family School". */
  name?: string;
  /** Country / state, used only to point families at the right requirements. */
  region?: string;
  updatedAt?: number;
}

export const DEFAULT_PROFILE: SchoolProfile = { setting: 'public', tradition: 'secular', approach: 'standard', scripture: { enabled: false, translation: 'kjv' } };

export const SETTINGS: Array<{ id: Setting; label: string; blurb: string }> = [
  { id: 'public', label: 'Public school or district', blurb: 'Standards-aligned classes, rosters and reporting for a district school.' },
  { id: 'charter', label: 'Charter school', blurb: 'Public funding with its own mission, schedule and reporting.' },
  { id: 'private', label: 'Private or independent school', blurb: 'Your own curriculum choices, calendar and community.' },
  { id: 'homeschool', label: 'Homeschool family', blurb: 'You are the teacher: plan by child, log hours, keep a portfolio and a transcript.' },
  { id: 'coop', label: 'Co-op or microschool', blurb: 'Several families or a small learning pod sharing teachers and classes.' },
  { id: 'online', label: 'Online or hybrid school', blurb: 'Mostly remote, with flexible pacing.' },
];

export const TRADITIONS: Array<{ id: Tradition; label: string; blurb: string; hasScripture: boolean; texts: string }> = [
  { id: 'secular', label: 'No faith framing', blurb: 'Keep everything non-religious.', hasScripture: false, texts: '' },
  { id: 'catholic', label: 'Catholic', blurb: 'Scripture and Church history alongside reading and history; the faith taught as faith.', hasScripture: true, texts: 'Bible, lives of the saints, Church history' },
  { id: 'protestant', label: 'Christian (Protestant / evangelical)', blurb: 'Scripture connected to literature, history and civics.', hasScripture: true, texts: 'Bible, Christian classics' },
  { id: 'orthodox', label: 'Eastern Orthodox', blurb: 'Scripture and patristic reading in the Orthodox tradition.', hasScripture: true, texts: 'Bible (Septuagint), the Fathers' },
  { id: 'jewish', label: 'Jewish', blurb: 'Tanakh and Jewish history alongside the standard curriculum.', hasScripture: false, texts: 'Tanakh (coming soon)' },
  { id: 'islamic', label: 'Islamic', blurb: 'Islamic history and civilization alongside the standard curriculum.', hasScripture: false, texts: 'Quran (coming soon)' },
  { id: 'other', label: 'Another tradition', blurb: 'Tell us what matters to you; world-faith libraries are available as study resources.', hasScripture: false, texts: 'Sacred Library' },
];

export const APPROACHES: Array<{ id: Approach; label: string; blurb: string }> = [
  { id: 'standard', label: 'Standards-based', blurb: 'Grade levels and standards guide the plan.' },
  { id: 'classical', label: 'Classical', blurb: 'Grammar, logic and rhetoric stages; great books and Latin-friendly reading.' },
  { id: 'montessori', label: 'Montessori', blurb: 'Child-led, hands-on work with long uninterrupted blocks.' },
  { id: 'waldorf', label: 'Waldorf', blurb: 'Arts-integrated, rhythm-based learning.' },
  { id: 'charlotte-mason', label: 'Charlotte Mason', blurb: 'Living books, short lessons, narration and nature study.' },
  { id: 'unschooling', label: 'Interest-led', blurb: 'Learning follows the child; the record is built from what they do.' },
];

/** Translations Plajah can show with scripture today (all public domain; licensed translations are not available). */
export const SCRIPTURE_TRANSLATIONS: Array<{ slug: string; label: string; note?: string }> = [
  { slug: 'kjv', label: 'King James Version' },
  { slug: 'vulgate', label: 'Latin Vulgate', note: 'The Church\'s historic Latin text.' },
  { slug: 'lxx', label: 'Septuagint (Greek OT)', note: 'Old Testament only.' },
];

export function isHomeschool(p?: SchoolProfile | null): boolean { return p?.setting === 'homeschool'; }
export function usesScripture(p?: SchoolProfile | null): boolean { return !!p?.scripture?.enabled && TRADITIONS.find(t => t.id === p.tradition)?.hasScripture === true; }

/** Sensible defaults when a family picks a combination. */
export function profileFor(setting: Setting, tradition: Tradition, approach: Approach, extra: Partial<SchoolProfile> = {}): SchoolProfile {
  const hasScripture = TRADITIONS.find(t => t.id === tradition)?.hasScripture === true;
  return { setting, tradition, approach, scripture: { enabled: hasScripture, translation: tradition === 'orthodox' ? 'lxx' : tradition === 'catholic' ? 'kjv' : 'kjv' }, ...extra };
}

/** Human summary, e.g. "Catholic homeschool, classical". */
export function describeProfile(p: SchoolProfile): string {
  const s = SETTINGS.find(x => x.id === p.setting)?.label.split(' ')[0] || '';
  const t = TRADITIONS.find(x => x.id === p.tradition);
  const a = APPROACHES.find(x => x.id === p.approach);
  return [t && t.id !== 'secular' ? t.label.split(' ')[0] : '', p.setting === 'homeschool' ? 'homeschool' : s.toLowerCase(), a && a.id !== 'standard' ? `, ${a.label.toLowerCase()}` : ''].filter(Boolean).join(' ').replace(' ,', ',');
}

// ── Storage ──────────────────────────────────────────────────────────────────────────────
const lsKey = (uid: string) => `plajah:schoolProfile:${uid}`;

export function readLocalProfile(uid?: string): SchoolProfile | null {
  try { const raw = localStorage.getItem(lsKey(uid || 'anon')); return raw ? (JSON.parse(raw) as SchoolProfile) : null; } catch { return null; }
}

/** The profile stored on a user doc (cloud) or, failing that, this device. */
export async function loadSchoolProfile(uid?: string): Promise<SchoolProfile | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const p = snap.exists() ? (snap.data() as any).schoolProfile : null;
    if (p) return p as SchoolProfile;
  } catch { /* offline / rules */ }
  return readLocalProfile(uid);
}

export async function saveSchoolProfile(p: SchoolProfile, uid?: string): Promise<boolean> {
  const id = uid || auth.currentUser?.uid; if (!id) return false;
  const clean: SchoolProfile = { ...p, name: p.name?.trim() || undefined, region: p.region?.trim() || undefined, updatedAt: Date.now() };
  // Firestore rejects undefined, so drop empty optionals.
  const payload = JSON.parse(JSON.stringify(clean));
  try { localStorage.setItem(lsKey(id), JSON.stringify(payload)); } catch { /* private mode */ }
  try { await setDoc(doc(db, 'users', id), { schoolProfile: payload }, { merge: true }); return true; } catch { return false; }
}

/**
 * The profile that applies to a learner: their own if set, otherwise their guardian's, otherwise
 * their teacher's. Students never set it themselves.
 */
export async function effectiveSchoolProfile(profile: any, fallbackUids: Array<string | undefined> = []): Promise<SchoolProfile> {
  if (profile?.schoolProfile) return profile.schoolProfile as SchoolProfile;
  for (const u of [profile?.guardianUid, ...fallbackUids]) {
    if (!u) continue;
    const p = await loadSchoolProfile(u);
    if (p) return p;
  }
  return readLocalProfile(profile?.uid) || DEFAULT_PROFILE;
}
