/**
 * Learning support: the IEP / 504 / neurodiversity layer of Academia.
 *
 * One record per learner (`supportPlans/{learnerUid}`) holds three things:
 *   about      who the learner is in their own (or their family's) words: strengths, interests, what helps,
 *              how they communicate, how they want to be described. Strengths come first, always.
 *   supports   concrete accommodations that change how Academia behaves for them (easier-to-read type,
 *              read-aloud, calm visuals, chunked lessons, break reminders, untimed checks, ...).
 *   plan       the formal layer when there is one: IEP, 504 or a learning plan, measurable goals with
 *              progress entries, review dates and the team (teachers the family has chosen to share with).
 *
 * Principles:
 *  - No diagnosis needed. Every support works for any learner who turns it on (universal design). Labels
 *    are optional, self- or family-described, and never gate anything.
 *  - Private by default. Only the learner, their guardians and the teachers the family adds to the team
 *    can read the plan; it never appears to classmates, in feeds or on profiles (firestore.rules).
 *  - The learner's voice. Learners edit their own "about me" and supports; for a child account the guardian
 *    decides who is on the team.
 *  - Supports follow the learner, not the device: the record is mirrored to localStorage so lessons can read
 *    it synchronously, and refreshed from the cloud on sign-in.
 */
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, auth } from './firebase';

// ── Model ────────────────────────────────────────────────────────────────────────────────

export type PlanType = 'none' | 'learning-plan' | '504' | 'iep';
export const PLAN_TYPES: Array<{ id: PlanType; label: string; blurb: string }> = [
  { id: 'none', label: 'No formal plan', blurb: 'Supports only. Nothing formal is needed to use any of them.' },
  { id: 'learning-plan', label: 'Learning plan', blurb: 'An informal plan agreed between family and teachers, or a homeschool plan.' },
  { id: '504', label: '504 plan', blurb: 'US: accommodations under Section 504 so a learner can access school on equal terms.' },
  { id: 'iep', label: 'IEP', blurb: 'US: an Individualized Education Program under IDEA, with specially designed instruction and goals.' },
];

/** Optional, self- or family-described. Shown only to the people the plan is shared with. */
export type Identity = 'autistic' | 'adhd' | 'dyslexic' | 'dyscalculic' | 'dyspraxic' | 'dysgraphic' | 'tourette' | 'sensory' | 'anxiety' | 'speech-language' | 'gifted' | 'deaf-hoh' | 'blind-low-vision' | 'physical' | 'other';
export const IDENTITIES: Array<{ id: Identity; label: string }> = [
  { id: 'autistic', label: 'Autistic' }, { id: 'adhd', label: 'ADHD' }, { id: 'dyslexic', label: 'Dyslexic' },
  { id: 'dyscalculic', label: 'Dyscalculia' }, { id: 'dysgraphic', label: 'Dysgraphia' }, { id: 'dyspraxic', label: 'Dyspraxia / DCD' },
  { id: 'tourette', label: 'Tourette / tics' }, { id: 'sensory', label: 'Sensory processing' }, { id: 'anxiety', label: 'Anxiety' },
  { id: 'speech-language', label: 'Speech & language' }, { id: 'gifted', label: 'Gifted / 2e' }, { id: 'deaf-hoh', label: 'Deaf / hard of hearing' },
  { id: 'blind-low-vision', label: 'Blind / low vision' }, { id: 'physical', label: 'Physical disability' }, { id: 'other', label: 'Something else' },
];

export type LanguagePref = 'identity-first' | 'person-first' | 'no-label';
export const LANGUAGE_PREFS: Array<{ id: LanguagePref; label: string; example: string }> = [
  { id: 'identity-first', label: 'Identity-first', example: '"an autistic learner"' },
  { id: 'person-first', label: 'Person-first', example: '"a learner with autism"' },
  { id: 'no-label', label: 'No label please', example: 'Just describe what helps' },
];

export type CommMode = 'speaking' | 'writing' | 'typing' | 'aac' | 'sign' | 'pictures' | 'gestures';
export const COMM_MODES: Array<{ id: CommMode; label: string }> = [
  { id: 'speaking', label: 'Speaking' }, { id: 'writing', label: 'Writing' }, { id: 'typing', label: 'Typing' },
  { id: 'aac', label: 'AAC device or app' }, { id: 'sign', label: 'Sign language' }, { id: 'pictures', label: 'Pictures / symbols' }, { id: 'gestures', label: 'Gestures' },
];

export interface AboutMe {
  preferredName?: string;
  identities: Identity[];
  languagePref: LanguagePref;
  strengths: string[];
  interests: string[];
  helps: string[];       // "What helps me"
  hard: string[];        // "What's hard for me"
  calming: string[];     // "What calms me"
  communication: CommMode[];
  commNotes?: string;    // e.g. "Give me 10 seconds to answer"
}

/** Every support is a plain switch or a small number. Each one changes something real in Academia. */
export interface Supports {
  // reading
  easyRead: boolean;          // Atkinson Hyperlegible, no drop caps, extra spacing
  textSize: 0 | 1 | 2;        // smaller / normal / larger
  lineFocus: boolean;         // reading ruler that follows the pointer or keyboard
  readAloud: boolean;         // a Listen button on every lesson, question and text
  readRate: number;           // speech rate 0.6–1.2
  // sensory
  calm: boolean;              // no motion, glow or autoplay
  lowSound: boolean;          // no sound effects
  mutedColor: boolean;        // softer, lower-contrast saturation
  // pacing & structure
  chunk: boolean;             // one part of a lesson at a time
  schedule: boolean;          // "first this, then that" plan at the top of each lesson
  breakEveryMin: number;      // 0 = off
  transitionWarning: boolean; // a heads-up before something changes or ends
  // checks & assessment
  untimed: boolean;           // no timers on checks and practice
  extraTime: 1 | 1.5 | 2;     // multiplier where something is timed
  fewerChoices: boolean;      // one wrong answer removed from multiple choice
  retryFree: boolean;         // retries never count against the learner
  readQuestions: boolean;     // questions read aloud automatically
}

export const DEFAULT_SUPPORTS: Supports = {
  easyRead: false, textSize: 1, lineFocus: false, readAloud: false, readRate: 0.95,
  calm: false, lowSound: false, mutedColor: false,
  chunk: false, schedule: false, breakEveryMin: 0, transitionWarning: false,
  untimed: false, extraTime: 1, fewerChoices: false, retryFree: true, readQuestions: false,
};

export type GoalArea = 'reading' | 'writing' | 'math' | 'communication' | 'social' | 'self-regulation' | 'executive-function' | 'motor' | 'independence' | 'other';
export const GOAL_AREAS: Array<{ id: GoalArea; label: string; color: string }> = [
  { id: 'reading', label: 'Reading', color: '#00DAF3' }, { id: 'writing', label: 'Writing', color: '#c4b5fd' },
  { id: 'math', label: 'Math', color: '#F5B83D' }, { id: 'communication', label: 'Communication', color: '#FF6FA8' },
  { id: 'social', label: 'Social', color: '#06D6A0' }, { id: 'self-regulation', label: 'Self-regulation', color: '#60A5FA' },
  { id: 'executive-function', label: 'Executive function', color: '#FFB266' }, { id: 'motor', label: 'Motor', color: '#a78bfa' },
  { id: 'independence', label: 'Independence', color: '#5ff0c6' }, { id: 'other', label: 'Other', color: '#e9e4da' },
];

export interface GoalEntry { at: number; value: number; note?: string; by?: string; byName?: string }
export interface SupportGoal {
  id: string;
  area: GoalArea;
  statement: string;   // "Given a grade-level passage, Sam will ..."
  baseline?: string;
  target: number;      // 0–100, e.g. 80 (%)
  unit: string;        // "% accuracy", "of 5 trials", ...
  entries: GoalEntry[];
  status: 'active' | 'met' | 'paused';
  createdAt: number;
}

export interface TeamMember { uid: string; name: string; role: 'teacher' | 'case-manager' | 'therapist' | 'aide' | 'other' }

export interface SupportPlan {
  learnerUid: string;
  learnerName?: string;
  guardianUid?: string | null;
  about: AboutMe;
  supports: Supports;
  planType: PlanType;
  goals: SupportGoal[];
  team: TeamMember[];
  teamUids: string[];        // mirror of team[].uid for the array-contains query and the rules
  reviewDate?: string;       // yyyy-mm-dd, next plan review
  reevalDate?: string;       // yyyy-mm-dd, next re-evaluation
  teamNotes?: string;        // shared working notes for the team
  updatedAt: number;
  updatedBy?: string;
}

export const emptyAbout = (): AboutMe => ({ identities: [], languagePref: 'identity-first', strengths: [], interests: [], helps: [], hard: [], calming: [], communication: [] });
export const emptyPlan = (learnerUid: string, learnerName?: string, guardianUid?: string | null): SupportPlan => ({
  learnerUid, learnerName, guardianUid: guardianUid ?? null, about: emptyAbout(), supports: { ...DEFAULT_SUPPORTS },
  planType: 'none', goals: [], team: [], teamUids: [], updatedAt: 0,
});

/** Fill any missing fields from older records so callers never see undefined. */
export function normalizePlan(raw: any, learnerUid: string): SupportPlan {
  const base = emptyPlan(learnerUid);
  const p = { ...base, ...(raw || {}) } as SupportPlan;
  p.about = { ...base.about, ...(raw?.about || {}) };
  p.supports = { ...DEFAULT_SUPPORTS, ...(raw?.supports || {}) };
  p.goals = Array.isArray(raw?.goals) ? raw.goals.map((g: any) => ({ entries: [], status: 'active', unit: '%', target: 80, ...g })) : [];
  p.team = Array.isArray(raw?.team) ? raw.team : [];
  p.teamUids = p.team.map(t => t.uid);
  return p;
}

// ── What a teacher should actually do, in plain words ───────────────────────────────────

/** The plan's supports turned into short, plain classroom actions for the team. */
export function supportActions(s: Supports, about?: AboutMe): string[] {
  const out: string[] = [];
  if (s.easyRead || s.textSize === 2) out.push('Give text in a clear sans-serif font, larger size, with extra line spacing.');
  if (s.readAloud) out.push('Offer read-aloud for any text, including directions and test questions (unless reading itself is being assessed).');
  if (s.readQuestions) out.push('Read questions aloud by default.');
  if (s.lineFocus) out.push('Allow a reading guide or ruler; keep one task per page.');
  if (s.calm) out.push('Keep visuals calm: no flashing, autoplay or busy animation.');
  if (s.lowSound) out.push('Keep sound low; allow headphones or ear defenders.');
  if (s.chunk) out.push('Break work into short parts and check in after each one.');
  if (s.schedule) out.push('Show a visual "first, then" schedule at the start of each activity.');
  if (s.transitionWarning) out.push('Give a warning before transitions (e.g. "5 minutes, then we switch").');
  if (s.breakEveryMin) out.push(`Offer a movement or sensory break about every ${s.breakEveryMin} minutes.`);
  if (s.untimed) out.push('No timed checks; remove time pressure.');
  else if (s.extraTime > 1) out.push(`Extended time: ${s.extraTime}× on timed work and tests.`);
  if (s.fewerChoices) out.push('Reduce answer choices on multiple-choice questions.');
  if (s.retryFree) out.push('Let retries count; grade the best attempt.');
  if (about?.communication?.includes('aac')) out.push('Presume competence: wait for and honour AAC responses as full answers.');
  if (about?.commNotes) out.push(about.commNotes);
  return out;
}

export const activeSupportCount = (s: Supports) => supportActions(s).length;

export function latestValue(g: SupportGoal): number | null {
  if (!g.entries.length) return null;
  return [...g.entries].sort((a, b) => b.at - a.at)[0].value;
}

// ── Local mirror (what lessons read synchronously) ──────────────────────────────────────

const lsKey = (uid: string) => `plajah:support:${uid}`;
const ACTIVE_KEY = 'plajah:support:active';
export const SUPPORT_EVENT = 'plajah:support';

function emit() { try { window.dispatchEvent(new Event(SUPPORT_EVENT)); } catch { /* SSR */ } }

/** The supports that apply on this device right now: the signed-in learner's, or a guest's own choices. */
export function getActiveSupports(): Supports {
  try { const raw = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); return raw?.supports ? { ...DEFAULT_SUPPORTS, ...raw.supports } : DEFAULT_SUPPORTS; } catch { return DEFAULT_SUPPORTS; }
}
function activeOwner(): string | null { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null')?.owner ?? null; } catch { return null; } }
export function setActiveSupports(s: Supports, owner: string | null = auth.currentUser?.uid ?? null) {
  try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ owner, supports: s })); } catch { /* private mode */ }
  emit();
}
export function readLocalPlan(uid: string): SupportPlan | null {
  try { const raw = localStorage.getItem(lsKey(uid)); return raw ? normalizePlan(JSON.parse(raw), uid) : null; } catch { return null; }
}
function writeLocalPlan(p: SupportPlan) { try { localStorage.setItem(lsKey(p.learnerUid), JSON.stringify(p)); } catch { /* private mode */ } }

// ── Cloud ────────────────────────────────────────────────────────────────────────────────

const ref = (uid: string) => doc(db, 'supportPlans', uid);
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)); // Firestore rejects undefined

export async function loadPlan(learnerUid: string): Promise<SupportPlan | null> {
  try {
    const snap = await getDoc(ref(learnerUid));
    if (snap.exists()) { const p = normalizePlan(snap.data(), learnerUid); writeLocalPlan(p); return p; }
    return null;
  } catch { return readLocalPlan(learnerUid); }
}

export async function savePlan(p: SupportPlan): Promise<boolean> {
  const me = auth.currentUser?.uid;
  const next: SupportPlan = { ...p, teamUids: p.team.map(t => t.uid), updatedAt: Date.now(), updatedBy: me };
  writeLocalPlan(next);
  if (me && me === p.learnerUid) setActiveSupports(next.supports);
  try { await setDoc(ref(p.learnerUid), clean(next)); return true; } catch { return false; }
}

/** Team members (teachers) may only touch goals and the shared notes; the rules enforce the same. */
export async function saveTeamFields(learnerUid: string, fields: Pick<SupportPlan, 'goals'> & { teamNotes?: string }): Promise<boolean> {
  try { await updateDoc(ref(learnerUid), clean({ ...fields, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid })); return true; } catch { return false; }
}

/** Plans a family or learner has shared with this teacher. */
export async function listSharedPlans(teacherUid: string): Promise<SupportPlan[]> {
  try {
    const snap = await getDocs(query(collection(db, 'supportPlans'), where('teamUids', 'array-contains', teacherUid)));
    return snap.docs.map(d => normalizePlan(d.data(), d.id));
  } catch { return []; }
}

/** On sign-in: pull the learner's own plan so lessons on this device follow it. Another person's supports
 *  left on a shared device are cleared; a guest's own choices carry over into a first plan. */
export async function syncOwnSupports(uid?: string | null) {
  if (!uid) return;
  const p = await loadPlan(uid);
  if (p) { setActiveSupports(p.supports, uid); return; }
  const owner = activeOwner();
  if (owner && owner !== uid) setActiveSupports(DEFAULT_SUPPORTS, uid);
}

/** A quick toggle from the support dock: applies at once, and saves into the learner's own plan when signed in. */
export async function updateMySupports(patch: Partial<Supports>) {
  const next = { ...getActiveSupports(), ...patch };
  setActiveSupports(next);
  const uid = auth.currentUser?.uid; if (!uid) return;
  const plan = readLocalPlan(uid) || (await loadPlan(uid)) || emptyPlan(uid, auth.currentUser?.displayName || undefined);
  await savePlan({ ...plan, supports: next });
}

export type SupportTab = 'supports' | 'about' | 'plan' | 'resources' | 'community';
/** Open Learning Support (ACADEMIA_SUPPORT), optionally on a tab and a child's plan. */
export function openSupportCenter(onNavigate: (v: string) => void, opts: { tab?: SupportTab; learner?: string } = {}) {
  try { sessionStorage.setItem('plajah:support', JSON.stringify(opts)); } catch { /* private mode */ }
  onNavigate('ACADEMIA_SUPPORT');
}

export const newGoalId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
