// childActivityService.ts — Real-time activity & screen-time tracking for CHILD accounts,
// readable by their parent/guardian in the Family & Parental Controls suite.
//
// Combines:
//  1. Live view/navigation & category time tracking recorded on `users/{childUid}`
//     (`childActivityLog` and `screenTimeSummary`) + localStorage cache
//  2. Real learning & academic events (Voca read-aloud sessions, Penna handwriting,
//     Reading Quest, Language Quest, submitted assignments)
//  3. Child social posts (`posts` authored by the child)

import { doc, getDoc, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile, ChildActivityEntry, ChildScreenTimeSummary } from '../types';
import { categoryForView } from './contentSafety';
import { loadHandwritingProgress } from './handwritingProgressService';
import { loadReadingProgress } from './readingQuestService';
import { loadLanguageProgress } from './languageQuestService';
import { loadLocal as loadLocalVoca, loadCloudSafe as loadCloudVoca } from './voca/vocaStats';
import { fetchChildWork } from './assignmentTemplateService';

const MAX_LOG_ITEMS = 120;
const LOCAL_LOG_KEY = (uid: string) => `plajah_child_activity_log_${uid}`;
const LOCAL_SUMMARY_KEY = (uid: string, date: string) => `plajah_child_screentime_${uid}_${date}`;

export const todayDateKey = (): string => new Date().toISOString().slice(0, 10);

const VIEW_LABELS: Record<string, { title: string; detail: string }> = {
  STUDENT_HOME: { title: 'Opened Homeroom', detail: 'Student dashboard & daily assignments' },
  ACADEMIA_HOME: { title: 'Opened Academia Hub', detail: 'School portal & learning hub' },
  ACADEMIA_LANDING: { title: 'Visited Academia Front Row', detail: 'Browsed school doors & courses' },
  CLASSROOMS: { title: 'Visited Academia Front Row', detail: 'Browsed school doors & courses' },
  ACADEMIA_COURSES: { title: 'Browsed Academia Courses', detail: 'Course catalog & interactive modules' },
  LEARN: { title: 'Practiced on the Learn Map', detail: 'Standards-aligned skill practice' },
  VOCA: { title: 'Voca · Read Aloud with Chora', detail: 'Reading fluency & pronunciation practice' },
  HANDWRITING_WORKSHOP: { title: 'Penna · Handwriting Workshop', detail: 'Letter tracing & story writing' },
  READING_QUEST: { title: 'Reading Quest', detail: 'Phonics & reading comprehension adventure' },
  LANGUAGE_QUEST: { title: 'Language Quest', detail: 'World languages vocabulary & conversation' },
  LEARNER_LEDGER: { title: 'Viewed Academic Passport', detail: 'Mastery & standards ledger' },
  MATH_SCHOOL: { title: 'Visited School of Mathematics', detail: 'Arithmetic, algebra & geometry' },
  MATH_CLASSROOM: { title: 'Entered Math Classroom', detail: 'Interactive math problem solving' },
  SCIENCE_SCHOOL: { title: 'Visited School of Science', detail: 'Biology, chemistry, physics & 3D labs' },
  LANGUAGE_ARTS_SCHOOL: { title: 'Visited School of Language Arts', detail: 'Reading, grammar & writing' },
  HISTORY_QUEST: { title: 'Visited History Quest', detail: 'World & U.S. history exploration' },
  CIVICS_HALL: { title: 'Visited Civics Hall', detail: 'Government, constitution & civics' },
  MONEY_SCHOOL: { title: 'Visited Money School', detail: 'Financial literacy & money skills' },
  ECON_SCHOOL: { title: 'Visited Economics School', detail: 'Markets, trade & economics' },
  PHILOSOPHY_SCHOOL: { title: 'Visited Philosophy School', detail: 'Logic, ethics & critical thinking' },
  STUDENT_ASSIGNMENT: { title: 'Worked on Class Worksheet', detail: 'Teacher-assigned digital worksheet' },
  STUDENT_LESSON: { title: 'Worked on Assigned Lesson', detail: 'Teacher-assigned structured lesson' },
  BOOKS: { title: 'Opened Lorea Library', detail: 'Browsed books, picture books & comics' },
  KIDS_LIBRARY: { title: 'Opened Kids Reading Library', detail: 'Kid-safe picture books & stories' },
  BOOK_READER: { title: 'Read a Book in Lorea', detail: 'Interactive book reader' },
  COMIC_MUSEUM: { title: 'Visited Comic & Graphic Novel Museum', detail: 'Comics & visual storytelling' },
  MUSIC: { title: 'Opened Chora Music & Audio', detail: 'Listened to music, audiobooks & podcasts' },
  PLAYER: { title: 'Played Album / Audio Track', detail: 'Chora audio player' },
  RADIO: { title: 'Listened to Plajah Radio', detail: 'Curated radio station' },
  MOVIES_TV: { title: 'Opened Cinema Movies & TV', detail: 'Browsed films, animation & series' },
  MOVIE_UX: { title: 'Watched a Film / Show on Cinema', detail: 'Cinema & TV player' },
  VIDEOS: { title: 'Opened Reello Videos', detail: 'Watched creator videos & clips' },
  RELLO: { title: 'Watched Reello Vertical Videos', detail: 'Short-form video feed' },
  GAMES: { title: 'Opened Plajah Arcade & Games', detail: 'Browsed games' },
  GAME_PLAYER: { title: 'Played a Game in Arcade', detail: 'Active gameplay session' },
  PLAJAH_FSE: { title: 'Launched Plajah Console (FSE)', detail: 'Full-screen gaming experience' },
  EDU_SOCIAL: { title: 'Visited School Community Feed', detail: 'Safe school social feed' },
  FEED: { title: 'Visited Social Feed', detail: 'Community posts & updates' },
  CHAT: { title: 'Opened Messages & Class Chat', detail: 'Classmate & teacher messaging' },
  CLUBS: { title: 'Visited School & Community Clubs', detail: 'Club rooms & activities' },
  CLASSROOM_CLUB: { title: 'Visited Classroom Club', detail: 'Student club activities' },
  LIVE_HUB: { title: 'Opened Live TV+ & Streams', detail: 'Live channels & broadcasts' },
  WORLDS: { title: 'Explored 3D Worlds', detail: 'Interactive 3D virtual worlds' },
  TELA: { title: 'Opened Tela Creative Canvas', detail: 'Drawing, design & document studio' },
  AVATAR_STUDIO: { title: 'Customized Avatar in Studio', detail: 'Character & avatar creator' },
  ORA: { title: 'Visited Ora Calm & Wellbeing', detail: 'Mindfulness, breathing & reflection' },
};

export function describeViewActivity(view: string): {
  title: string;
  detail: string;
  category: ChildActivityEntry['category'];
} {
  const known = VIEW_LABELS[view];
  const category = categoryForView(view);
  if (known) return { ...known, category };
  const pretty = view
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return {
    title: `Visited ${pretty}`,
    detail: `Navigated to ${pretty}`,
    category,
  };
}

export function getLocalActivityLog(childUid: string): ChildActivityEntry[] {
  if (!childUid || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_LOG_KEY(childUid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalActivityLog(childUid: string, entries: ChildActivityEntry[]): void {
  if (!childUid || typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_LOG_KEY(childUid), JSON.stringify(entries.slice(0, MAX_LOG_ITEMS)));
  } catch { /* ignore quota */ }
}

export function getLocalScreenTimeSummary(childUid: string, date = todayDateKey()): ChildScreenTimeSummary {
  const fallback: ChildScreenTimeSummary = {
    date,
    totalMins: 0,
    byCategory: { learning: 0, games: 0, videos: 0, movies: 0, social: 0, music: 0, other: 0 },
    updatedAt: Date.now(),
  };
  if (!childUid || typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(LOCAL_SUMMARY_KEY(childUid, date));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      date,
      totalMins: Number(parsed?.totalMins || 0),
      byCategory: { ...fallback.byCategory, ...(parsed?.byCategory || {}) },
      updatedAt: Number(parsed?.updatedAt || Date.now()),
    };
  } catch {
    return fallback;
  }
}

export async function recordChildScreenTimeTick(
  childUid: string,
  view: string,
  deltaMins = 0.5
): Promise<ChildScreenTimeSummary> {
  const date = todayDateKey();
  const cat = categoryForView(view);
  const current = getLocalScreenTimeSummary(childUid, date);
  const next: ChildScreenTimeSummary = {
    date,
    totalMins: Math.round((current.totalMins + deltaMins) * 10) / 10,
    byCategory: {
      ...current.byCategory,
      [cat]: Math.round(((current.byCategory[cat] || 0) + deltaMins) * 10) / 10,
    },
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(LOCAL_SUMMARY_KEY(childUid, date), JSON.stringify(next));
  } catch { /* ignore */ }

  // Also keep the legacy `kids_time_${uid}_${date}` key in sync for KidsSessionGuard
  try {
    localStorage.setItem(`kids_time_${childUid}_${date}`, String(next.totalMins));
  } catch { /* ignore */ }

  // Sync to Firestore so the parent can view live screen time from their own device/session
  try {
    await updateDoc(doc(db, 'users', childUid), {
      screenTimeSummary: next,
    });
  } catch { /* best-effort if offline */ }

  return next;
}

export async function recordChildActivityEvent(
  childUid: string,
  event: {
    view: string;
    title?: string;
    detail?: string;
    category?: ChildActivityEntry['category'];
    status?: ChildActivityEntry['status'];
    durationSec?: number;
  }
): Promise<void> {
  if (!childUid) return;
  const desc = describeViewActivity(event.view);
  const now = Date.now();
  const local = getLocalActivityLog(childUid);

  // Deduplicate rapid consecutive hits to the same view within 60 seconds
  const head = local[0];
  if (
    head &&
    head.view === event.view &&
    head.status === (event.status || 'viewed') &&
    now - head.at < 60_000
  ) {
    head.durationSec = (head.durationSec || 0) + (event.durationSec || 0);
    saveLocalActivityLog(childUid, local);
    return;
  }

  const entry: ChildActivityEntry = {
    id: `act_${now}_${Math.random().toString(36).slice(2, 7)}`,
    at: now,
    view: event.view,
    title: event.title || desc.title,
    detail: event.detail || desc.detail,
    category: event.category || desc.category,
    status: event.status || 'viewed',
    ...(event.durationSec ? { durationSec: event.durationSec } : {}),
  };

  const nextLog = [entry, ...local].slice(0, MAX_LOG_ITEMS);
  saveLocalActivityLog(childUid, nextLog);

  try {
    const snap = await getDoc(doc(db, 'users', childUid));
    const remoteLog: ChildActivityEntry[] = Array.isArray(snap.data()?.childActivityLog)
      ? snap.data()!.childActivityLog
      : [];
    const mergedById = new Map<string, ChildActivityEntry>();
    for (const item of [entry, ...nextLog, ...remoteLog]) {
      if (item && item.id && !mergedById.has(item.id)) {
        mergedById.set(item.id, item);
      }
    }
    const merged = [...mergedById.values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_LOG_ITEMS);
    await updateDoc(doc(db, 'users', childUid), {
      childActivityLog: merged,
    });
  } catch { /* best-effort */ }
}

export interface FullChildActivityReport {
  screenTime: ChildScreenTimeSummary;
  entries: ChildActivityEntry[];
}

export async function loadChildActivityReport(
  guardianUid: string,
  child: UserProfile
): Promise<FullChildActivityReport> {
  const childUid = child.uid;
  const today = todayDateKey();

  // 1. Read freshest child user doc
  let freshChild: UserProfile = child;
  try {
    const snap = await getDoc(doc(db, 'users', childUid));
    if (snap.exists()) {
      freshChild = { uid: snap.id, ...(snap.data() as any) } as UserProfile;
    }
  } catch { /* fallback to passed child */ }

  const localSummary = getLocalScreenTimeSummary(childUid, today);
  const remoteSummary = freshChild.screenTimeSummary;
  const screenTime: ChildScreenTimeSummary =
    remoteSummary && remoteSummary.date === today && remoteSummary.totalMins >= localSummary.totalMins
      ? remoteSummary
      : localSummary;

  const entriesMap = new Map<string, ChildActivityEntry>();
  const addEntry = (e: ChildActivityEntry) => {
    if (e && e.id && !entriesMap.has(e.id)) {
      entriesMap.set(e.id, e);
    }
  };

  for (const e of freshChild.childActivityLog || []) addEntry(e);
  for (const e of getLocalActivityLog(childUid)) addEntry(e);

  // 2. Synthesize real learning & platform activity events so the parent sees a complete history
  const [vocaCloud, vocaLocal, penna, reading, lang, work, childPostsSnap] = await Promise.all([
    loadCloudVoca(childUid).catch(() => null),
    Promise.resolve(loadLocalVoca(childUid)).catch(() => null),
    loadHandwritingProgress(childUid).catch(() => null),
    loadReadingProgress(childUid).catch(() => null),
    loadLanguageProgress(childUid).catch(() => null),
    guardianUid ? fetchChildWork(guardianUid, childUid).catch(() => null) : Promise.resolve(null),
    getDocs(query(collection(db, 'posts'), where('authorId', '==', childUid), limit(25))).catch(() => null),
  ]);

  const voca = vocaCloud ?? vocaLocal;
  if (voca?.sessions?.length) {
    for (const s of voca.sessions.slice(-20)) {
      const ts = typeof (s as any).timestamp === 'number' ? (s as any).timestamp : typeof (s as any).at === 'number' ? (s as any).at : Date.now() - 3600_000;
      addEntry({
        id: `voca_${ts}_${Math.round(s.wcpm || 0)}`,
        at: ts,
        view: 'VOCA',
        title: `Read aloud in Voca${(s as any).storyTitle ? `: ${(s as any).storyTitle}` : ''}`,
        detail: `${Math.round(s.wcpm || 0)} WCPM · ${Math.round((s.accuracy || 0) * 100)}% accuracy`,
        category: 'learning',
        status: 'completed',
      });
    }
  }

  if (penna && (penna.masteredLetters?.length || penna.xp)) {
    const ts = (penna as any).updatedAt || freshChild.createdAt || Date.now() - 7200_000;
    addEntry({
      id: `penna_summary_${penna.masteredLetters?.length || 0}_${penna.xp || 0}`,
      at: ts,
      view: 'HANDWRITING_WORKSHOP',
      title: `Practiced Handwriting in Penna`,
      detail: `${penna.masteredLetters?.length || 0} letters mastered · ${penna.booksCompleted?.length || 0} stories · ${penna.xp || 0} XP`,
      category: 'learning',
      status: 'completed',
    });
  }

  if (reading && (reading.completedQuests?.length || reading.xp)) {
    const ts = (reading as any).updatedAt || freshChild.createdAt || Date.now() - 5400_000;
    addEntry({
      id: `reading_summary_${reading.completedQuests?.length || 0}_${reading.xp || 0}`,
      at: ts,
      view: 'READING_QUEST',
      title: `Completed ${reading.completedQuests?.length || 0} Reading Quests`,
      detail: `Earned ${reading.xp || 0} XP across phonics & comprehension`,
      category: 'learning',
      status: 'completed',
    });
  }

  if (lang && (lang.xp || lang.streak)) {
    const ts = (lang as any).updatedAt || freshChild.createdAt || Date.now() - 4800_000;
    addEntry({
      id: `lang_summary_${lang.xp || 0}`,
      at: ts,
      view: 'LANGUAGE_QUEST',
      title: `Practiced World Languages`,
      detail: `${lang.streak || 0}-day streak · ${lang.xp || 0} XP · ${Object.keys(lang.srs || {}).length} vocabulary cards`,
      category: 'learning',
      status: 'completed',
    });
  }

  if (work?.submissions?.length) {
    for (const sub of work.submissions) {
      const ts = (sub as any).submittedAt || (sub as any).updatedAt || Date.now() - 3600_000;
      addEntry({
        id: `sub_${sub.id}`,
        at: ts,
        view: 'STUDENT_LESSON',
        title: `Handed in assignment: ${sub.title}`,
        detail: sub.grade
          ? `Graded: ${sub.grade.total}/${sub.grade.max} (${sub.grade.masteryPercent}%)`
          : 'Submitted to teacher · awaiting grade',
        category: 'learning',
        status: 'completed',
      });
    }
  }

  if (childPostsSnap && !childPostsSnap.empty) {
    for (const d of childPostsSnap.docs) {
      const p = d.data() as any;
      const ts = Number(p.createdAt || p.timestamp || Date.now());
      addEntry({
        id: `post_${d.id}`,
        at: ts,
        view: 'EDU_SOCIAL',
        title: 'Shared a post in the School Community Feed',
        detail: String(p.text || p.content || 'Shared media post').slice(0, 120),
        category: 'social',
        status: 'completed',
      });
    }
  }

  const entries = [...entriesMap.values()].sort((a, b) => b.at - a.at);
  return { screenTime, entries };
}

export async function clearChildActivityHistory(childUid: string): Promise<void> {
  if (!childUid) return;
  try {
    localStorage.removeItem(LOCAL_LOG_KEY(childUid));
  } catch { /* ignore */ }
  try {
    await updateDoc(doc(db, 'users', childUid), {
      childActivityLog: [],
    });
  } catch { /* ignore */ }
}
