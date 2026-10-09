/**
 * creatorCourses — the creator-taught course layer on top of the Academia classroom stack.
 *
 * A creator course IS a `classrooms/{id}` doc with `track: 'CREATOR'`, so it inherits everything
 * the academic side already runs on: lessons, assignments, the gradebook, live sessions, the
 * class group chat (ensureClassroomRoom) and enrollment. This file adds only what a creator
 * needs on top: starter templates, an AI outline, a launch-readiness score, earnings maths and
 * the ready-to-send promotion kit (social posts, email, evite fields, billboard copy).
 *
 * Pure helpers live at the top (unit-testable, no Firebase); Firestore calls are at the bottom.
 */
import type { Classroom, Lesson, Assignment } from '../types';
import { chalkOverlayInner } from './creatorArt';

/** Direct-sale platform cut (user-confirmed 2026-10-08: 5%, not the older 10%). */
export const PLATFORM_CUT = 0.05;

// ── Categories / levels / formats ────────────────────────────────────────────

export const COURSE_CATEGORIES: Array<{ id: string; emoji: string; accent: string }> = [
  { id: 'Music', emoji: '🎵', accent: '#8B5CF6' },
  { id: 'Art', emoji: '🎨', accent: '#EC4899' },
  { id: 'Film', emoji: '🎬', accent: '#EF4444' },
  { id: 'Writing', emoji: '✍️', accent: '#F59E0B' },
  { id: 'Technology', emoji: '💻', accent: '#06B6D4' },
  { id: 'Business', emoji: '🚀', accent: '#10B981' },
  { id: 'Science', emoji: '🧪', accent: '#3B82F6' },
  { id: 'Health', emoji: '🧘', accent: '#14B8A6' },
  { id: 'Language', emoji: '🗣️', accent: '#F97316' },
  { id: 'Other', emoji: '✨', accent: '#A78BFA' },
];

export const categoryMeta = (id?: string) => COURSE_CATEGORIES.find(c => c.id === id) || COURSE_CATEGORIES[COURSE_CATEGORIES.length - 1];

export type CourseFormat = NonNullable<Classroom['format']>;
export type CourseLevel = NonNullable<Classroom['level']>;

export const FORMATS: Array<{ id: CourseFormat; emoji: string; label: string; blurb: string }> = [
  { id: 'SELF_PACED', emoji: '🎧', label: 'Self-paced', blurb: 'Learners go at their own speed. Set it up once, earn while you sleep.' },
  { id: 'COHORT', emoji: '👥', label: 'Cohort', blurb: 'Everyone starts together on a date. Community, deadlines, momentum.' },
  { id: 'LIVE', emoji: '📡', label: 'Live series', blurb: 'You teach live every session, with replays for anyone who misses it.' },
];

export const LEVELS: Array<{ id: CourseLevel; label: string }> = [
  { id: 'all', label: 'All levels' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

// ── Starter templates ────────────────────────────────────────────────────────

export interface CourseTemplate {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  format: CourseFormat;
  /** Section names; each gets `lessonsPerSection` lessons. */
  sections: string[];
  lessonsPerSection: number;
  suggestedPrice: number;
  /** Assignment titles, one per section (or fewer). */
  assignments: string[];
}

export const COURSE_TEMPLATES: CourseTemplate[] = [
  {
    id: 'masterclass', emoji: '🎓', name: 'Masterclass series', format: 'SELF_PACED',
    blurb: 'Cinematic, polished, 6 chapters. Teach one big idea beautifully.',
    sections: ['The big idea', 'Foundations', 'Technique', 'Craft', 'Putting it together', 'Your next level'],
    lessonsPerSection: 2, suggestedPrice: 49, assignments: ['First attempt', 'Technique drill', 'Final piece'],
  },
  {
    id: 'workshop', emoji: '🛠️', name: '4-week workshop', format: 'COHORT',
    blurb: 'A weekly rhythm with a project at the end. Ideal for a cohort.',
    sections: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    lessonsPerSection: 2, suggestedPrice: 79, assignments: ['Week 1 exercise', 'Week 2 exercise', 'Week 3 exercise', 'Final project'],
  },
  {
    id: 'challenge', emoji: '⚡', name: '7-day challenge', format: 'COHORT',
    blurb: 'One short lesson a day. Low price, high energy, great for audience building.',
    sections: ['Day 1–2', 'Day 3–4', 'Day 5–7'],
    lessonsPerSection: 2, suggestedPrice: 0, assignments: ['Day 3 check-in', 'Day 7 showcase'],
  },
  {
    id: 'live-series', emoji: '📡', name: 'Live class series', format: 'LIVE',
    blurb: 'Weekly live sessions with replays and homework.',
    sections: ['Session 1', 'Session 2', 'Session 3', 'Session 4', 'Session 5', 'Session 6'],
    lessonsPerSection: 1, suggestedPrice: 99, assignments: ['Homework 1', 'Homework 2', 'Homework 3'],
  },
  {
    id: 'mini', emoji: '🍿', name: 'Mini-course', format: 'SELF_PACED',
    blurb: 'Three quick lessons. The fastest way to launch and test an idea.',
    sections: ['Start here', 'The technique', 'Do it'],
    lessonsPerSection: 1, suggestedPrice: 15, assignments: ['Show your result'],
  },
  {
    id: 'blank', emoji: '📝', name: 'Start from scratch', format: 'SELF_PACED',
    blurb: 'An empty canvas. You decide every lesson.',
    sections: ['Module 1'], lessonsPerSection: 1, suggestedPrice: 0, assignments: [],
  },
];

export const templateById = (id: string) => COURSE_TEMPLATES.find(t => t.id === id) || COURSE_TEMPLATES[COURSE_TEMPLATES.length - 1];

export interface CourseDraft {
  title: string;
  tagline: string;
  description: string;
  category: string;
  level: CourseLevel;
  format: CourseFormat;
  startDate?: number;
  capacity: number;
  price: number;
  thumbnailUrl: string;
  accent: string;
  outcomes: string[];
  syllabus: string;
  lessons: Lesson[];
  assignments: Assignment[];
}

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

const DAY = 86_400_000;

/** A fresh, never-empty skeleton for a template, so the creator edits instead of starting blank. */
export function skeletonFor(template: CourseTemplate, topic: string): Pick<CourseDraft, 'lessons' | 'assignments' | 'syllabus'> {
  const t = topic.trim() || 'your craft';
  const lessons: Lesson[] = [];
  let order = 1;
  template.sections.forEach((section, si) => {
    for (let i = 0; i < template.lessonsPerSection; i++) {
      const first = si === 0 && i === 0;
      lessons.push({
        id: uid('l'),
        title: first ? `Welcome: what you will make in ${t}` : `${section}: lesson ${i + 1}`,
        description: first ? 'Set the stage, share the promise of the course and how to get the most from it.' : '',
        type: 'VIDEO',
        order: order++,
        section,
        preview: first,
      });
    }
  });
  const assignments: Assignment[] = template.assignments.map((title, i) => ({
    id: uid('a'), title, description: '', dueDate: Date.now() + (i + 1) * 7 * DAY, maxPoints: 100,
  }));
  return { lessons, assignments, syllabus: syllabusFrom(lessons) };
}

/** Plain-text syllabus built from the sections, so the legacy syllabus tab stays in sync. */
export function syllabusFrom(lessons: Lesson[]): string {
  const bySection = new Map<string, Lesson[]>();
  [...lessons].sort((a, b) => a.order - b.order).forEach(l => {
    const k = l.section || 'Lessons';
    bySection.set(k, [...(bySection.get(k) || []), l]);
  });
  return [...bySection.entries()]
    .map(([sec, ls]) => `${sec}\n${ls.map(l => `• ${l.title}`).join('\n')}`)
    .join('\n\n');
}

export const emptyDraft = (): CourseDraft => ({
  title: '', tagline: '', description: '', category: 'Music', level: 'all', format: 'SELF_PACED',
  capacity: 0, price: 0, thumbnailUrl: '', accent: categoryMeta('Music').accent, outcomes: [],
  syllabus: '', lessons: [], assignments: [],
});

// ── Cover art (no upload required: gorgeous generated covers) ────────────────

export const COVER_STYLES: Array<{ id: string; name: string; a: string; b: string }> = [
  { id: 'aurora', name: 'Aurora', a: '#6B0099', b: '#00DAF3' },
  { id: 'ember', name: 'Ember', a: '#D40055', b: '#FF8C00' },
  { id: 'ocean', name: 'Ocean', a: '#0B3D91', b: '#06D6A0' },
  { id: 'dusk', name: 'Dusk', a: '#1E1B4B', b: '#EC4899' },
  { id: 'forest', name: 'Forest', a: '#064E3B', b: '#A3E635' },
  { id: 'gold', name: 'Gold', a: '#451A03', b: '#FBBF24' },
];

/** An inline SVG data URI cover: stays crisp, needs no hosting, and survives in share cards. */
export function generatedCover(title: string, emoji: string, styleId: string, category?: string, animated = false): string {
  const s = COVER_STYLES.find(c => c.id === styleId) || COVER_STYLES[0];
  const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
  const words = (title || 'Your course').trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 16 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 4);
  const tspans = shown.map((l, i) => `<tspan x="60" dy="${i === 0 ? 0 : 74}">${esc(l)}</tspan>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.a}"/><stop offset="1" stop-color="${s.b}"/></linearGradient><radialGradient id="r" cx=".85" cy=".15" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="800" height="450" fill="url(#g)"/><rect width="800" height="450" fill="url(#r)"/><circle cx="680" cy="90" r="150" fill="#fff" fill-opacity=".07"/><circle cx="740" cy="400" r="210" fill="#000" fill-opacity=".12"/>${chalkOverlayInner(category, 0.2, animated)}<text x="690" y="130" font-size="96" text-anchor="middle">${emoji}</text><text x="60" y="${190 - (shown.length - 1) * 22}" font-family="Inter,Arial,sans-serif" font-weight="900" font-size="64" fill="#fff">${tspans}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ── AI outline ───────────────────────────────────────────────────────────────

export interface AiOutline {
  tagline: string;
  description: string;
  outcomes: string[];
  sections: Array<{ name: string; lessons: Array<{ title: string; description: string }> }>;
  assignments: Array<{ title: string; description: string }>;
}

const stripFence = (t: string) => t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

/**
 * Ask Aria to outline a course. Returns null on ANY failure (offline, not signed in, bad JSON):
 * the wizard then keeps the template skeleton, so the creator is never blocked on AI.
 */
export async function generateOutline(input: { topic: string; audience: string; category: string; level: CourseLevel; sections: number }): Promise<AiOutline | null> {
  try {
    const { callGeminiDetailed } = await import('./geminiService');
    const prompt =
      `You are a course designer for creator-taught online courses. Design a course.\n` +
      `Topic: ${input.topic}\nAudience: ${input.audience || 'curious beginners'}\nCategory: ${input.category}\nLevel: ${input.level}\n` +
      `Use exactly ${input.sections} sections, 2 lessons each. Lesson titles are concrete and action-led (never "Introduction to X"). ` +
      `Return ONLY JSON, no prose, with this shape: ` +
      `{"tagline":string (max 90 chars),"description":string (2 short paragraphs),"outcomes":[4 strings starting with a verb],` +
      `"sections":[{"name":string,"lessons":[{"title":string,"description":string (1 sentence)}]}],` +
      `"assignments":[{"title":string,"description":string}] (one per two sections, hands-on, producing something shareable)}`;
    const res = await callGeminiDetailed(prompt, { responseMimeType: 'application/json' });
    if (!res.ok) return null;
    const j = JSON.parse(stripFence(res.text));
    if (!Array.isArray(j?.sections) || j.sections.length === 0) return null;
    return {
      tagline: String(j.tagline || '').slice(0, 120),
      description: String(j.description || ''),
      outcomes: Array.isArray(j.outcomes) ? j.outcomes.map(String).slice(0, 6) : [],
      sections: j.sections.slice(0, 12).map((s: any) => ({
        name: String(s?.name || 'Module'),
        lessons: Array.isArray(s?.lessons) ? s.lessons.slice(0, 6).map((l: any) => ({ title: String(l?.title || 'Lesson'), description: String(l?.description || '') })) : [],
      })),
      assignments: Array.isArray(j.assignments) ? j.assignments.slice(0, 8).map((a: any) => ({ title: String(a?.title || 'Assignment'), description: String(a?.description || '') })) : [],
    };
  } catch {
    return null;
  }
}

/** Fold an AI outline into editable lessons/assignments. */
export function applyOutline(o: AiOutline): Pick<CourseDraft, 'lessons' | 'assignments' | 'syllabus' | 'tagline' | 'description' | 'outcomes'> {
  const lessons: Lesson[] = [];
  let order = 1;
  o.sections.forEach((s, si) => s.lessons.forEach((l, li) => {
    lessons.push({ id: uid('l'), title: l.title, description: l.description, type: 'VIDEO', order: order++, section: s.name, preview: si === 0 && li === 0 });
  }));
  const assignments: Assignment[] = o.assignments.map((a, i) => ({
    id: uid('a'), title: a.title, description: a.description, dueDate: Date.now() + (i + 1) * 7 * DAY, maxPoints: 100,
  }));
  return { lessons, assignments, syllabus: syllabusFrom(lessons), tagline: o.tagline, description: o.description, outcomes: o.outcomes };
}

// ── Readiness (what is still missing before launch) ──────────────────────────

export interface ReadinessItem { id: string; label: string; done: boolean; hint: string; weight: number; }

export function readiness(c: Pick<Classroom, 'title' | 'description' | 'thumbnailUrl' | 'lessons' | 'assignments' | 'tagline' | 'outcomes' | 'price' | 'format' | 'startDate'>): { items: ReadinessItem[]; score: number; ready: boolean } {
  const lessonsWithContent = c.lessons.filter(l => (l.contentUrl && l.contentUrl.trim()) || (l.textContent && l.textContent.trim())).length;
  const items: ReadinessItem[] = [
    { id: 'title', label: 'A title that sells', done: (c.title || '').trim().length >= 6, hint: 'Say what people will be able to do.', weight: 10 },
    { id: 'tagline', label: 'One-line promise', done: (c.tagline || '').trim().length >= 10, hint: 'The sentence under the title on your course page.', weight: 10 },
    { id: 'desc', label: 'Description', done: (c.description || '').trim().length >= 60, hint: 'Two short paragraphs: who it is for and what changes.', weight: 10 },
    { id: 'outcomes', label: '3+ outcomes', done: (c.outcomes || []).filter(o => o.trim()).length >= 3, hint: '"By the end you will…" bullets convert best.', weight: 10 },
    { id: 'lessons', label: '3+ lessons', done: c.lessons.length >= 3, hint: 'Even a mini-course needs a start, a middle and a finish.', weight: 15 },
    { id: 'content', label: 'Lesson content added', done: lessonsWithContent >= Math.min(3, Math.max(1, c.lessons.length)), hint: 'Paste a video link or write the lesson text.', weight: 20 },
    { id: 'cover', label: 'Cover image', done: !!(c.thumbnailUrl || '').trim(), hint: 'Pick a generated cover or paste an image link.', weight: 5 },
    { id: 'assign', label: 'A hands-on assignment', done: c.assignments.length >= 1, hint: 'Assignments are what make a course feel like a class.', weight: 10 },
    { id: 'when', label: c.format === 'SELF_PACED' ? 'Pricing decided' : 'Start date set', done: c.format === 'SELF_PACED' || c.format === undefined ? c.price >= 0 : !!c.startDate, hint: c.format === 'SELF_PACED' ? 'Free is fine. You can change it later.' : 'Cohorts and live series need a date.', weight: 10 },
  ];
  const total = items.reduce((s, i) => s + i.weight, 0);
  const score = Math.round((items.filter(i => i.done).reduce((s, i) => s + i.weight, 0) / total) * 100);
  // Content is the one hard gate: do not publish a shell. Everything else is advice.
  const ready = items.find(i => i.id === 'title')!.done && items.find(i => i.id === 'lessons')!.done && items.find(i => i.id === 'content')!.done;
  return { items, score, ready };
}

// ── Earnings ─────────────────────────────────────────────────────────────────

export interface CourseStats {
  learners: number;
  gross: number;
  fee: number;
  net: number;
  seatsLeft: number | null;
}

/** Gross is price x learners. Free courses and the owner's own enrollment never count as revenue. */
export function courseStats(c: Pick<Classroom, 'price' | 'enrolledStudents' | 'capacity' | 'ownerId'>): CourseStats {
  const learners = (c.enrolledStudents || []).filter(u => u !== c.ownerId).length;
  const gross = Math.round(c.price * learners * 100) / 100;
  const fee = Math.round(gross * PLATFORM_CUT * 100) / 100;
  return { learners, gross, fee, net: Math.round((gross - fee) * 100) / 100, seatsLeft: c.capacity && c.capacity > 0 ? Math.max(0, c.capacity - learners) : null };
}

export const money = (n: number) => n === 0 ? 'Free' : `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ── Promotion kit ────────────────────────────────────────────────────────────

export interface PromoKit {
  url: string;
  headline: string;
  social: Array<{ network: string; text: string }>;
  emailSubject: string;
  emailBody: string;
  billboard: { headline: string; sub: string; cta: string };
  evite: { headline: string; details: string; startsAt?: number; hostName: string };
}

const fmtDate = (ms?: number) => ms ? new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : '';

/** Everything a creator needs to announce the course in one click each. Never invents claims. */
export function buildPromoKit(c: Pick<Classroom, 'title' | 'tagline' | 'description' | 'price' | 'format' | 'startDate' | 'outcomes' | 'ownerName' | 'capacity'>, url: string): PromoKit {
  const tag = (c.tagline || c.description || '').split(/\n/)[0].slice(0, 140);
  const price = c.price > 0 ? money(c.price) : 'free';
  const when = c.format && c.format !== 'SELF_PACED' && c.startDate ? ` Starts ${fmtDate(c.startDate)}.` : '';
  const seats = c.capacity && c.capacity > 0 ? ` Only ${c.capacity} seats.` : '';
  const bullets = (c.outcomes || []).filter(Boolean).slice(0, 3);
  const bulletBlock = bullets.map(b => `✓ ${b}`).join('\n');
  const tags = '#learnontheplajah #onlinecourse';
  return {
    url,
    headline: c.title,
    social: [
      { network: 'Short post', text: `New course: ${c.title}. ${tag}${when}${seats} ${price === 'free' ? 'Free to join' : price} → ${url}` },
      { network: 'Instagram / TikTok caption', text: `${c.title} is open 🎓\n\n${tag}\n${bulletBlock ? '\n' + bulletBlock + '\n' : ''}\nLink in bio → ${url}\n\n${tags}` },
      { network: 'LinkedIn', text: `I'm teaching a new course: ${c.title}.\n\n${tag}\n${bulletBlock ? '\nWhat you'+"'"+'ll get:\n' + bulletBlock + '\n' : ''}\n${when.trim()}${seats}\nEnroll here: ${url}` },
      { network: 'Community post', text: `Hey everyone, I built a course called "${c.title}". ${tag} I'd love for you to be in the first class. ${url}` },
    ],
    emailSubject: `${c.title}: you're invited`,
    emailBody: `Hi {{first_name}},\n\nI'm opening a new course: ${c.title}.\n\n${tag}\n${bulletBlock ? '\nYou will:\n' + bulletBlock + '\n' : ''}\n${when.trim()}${seats}\n\nEnroll (${price}): ${url}\n\n${c.ownerName || 'Your instructor'}`,
    billboard: { headline: c.title, sub: tag || 'Learn it from someone who does it.', cta: c.price > 0 ? `Enroll · ${money(c.price)}` : 'Join free' },
    evite: {
      headline: c.format === 'SELF_PACED' || !c.format ? `${c.title}: launch party` : `${c.title}: kickoff`,
      details: `${tag}\n\nJoin ${c.ownerName || 'your instructor'} for the opening of ${c.title}. Enroll here: ${url}`,
      startsAt: c.startDate,
      hostName: c.ownerName || '',
    },
  };
}

// ── Firestore ────────────────────────────────────────────────────────────────

/** Strip undefined (Firestore throws on it) from a patch. */
const clean = <T extends Record<string, any>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export async function fetchMyCourses(ownerId: string): Promise<Classroom[]> {
  const [{ db }, fs] = await Promise.all([import('./firebase'), import('firebase/firestore')]);
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'classrooms'), fs.where('ownerId', '==', ownerId)));
  return snap.docs.map(d => d.data() as Classroom).filter(c => (c.track || 'CREATOR') === 'CREATOR')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** The public directory: published creator courses only. */
export async function fetchPublicCourses(): Promise<Classroom[]> {
  const { fetchClassrooms } = await import('./backendService');
  const all = await fetchClassrooms();
  return (all || []).filter(c => (c.track || 'CREATOR') === 'CREATOR' && c.status !== 'DRAFT' && c.id !== 'demo_music_production_101');
}

export async function fetchCourse(id: string): Promise<Classroom | null> {
  const [{ db }, fs] = await Promise.all([import('./firebase'), import('firebase/firestore')]);
  const snap = await fs.getDoc(fs.doc(db, 'classrooms', id));
  return snap.exists() ? (snap.data() as Classroom) : null;
}

export async function updateCourse(id: string, patch: Partial<Classroom>): Promise<void> {
  const [{ db }, fs] = await Promise.all([import('./firebase'), import('firebase/firestore')]);
  await fs.updateDoc(fs.doc(db, 'classrooms', id), clean(patch as any));
}

export async function publishCourse(id: string): Promise<void> {
  await updateCourse(id, { status: 'PUBLISHED', publishedAt: Date.now() });
}

export async function unpublishCourse(id: string): Promise<void> {
  await updateCourse(id, { status: 'DRAFT' });
}

/** Creates the course as a DRAFT (so a half-built course never appears in the directory). */
export async function createCourseFromDraft(d: CourseDraft, opts: { publish: boolean }): Promise<Classroom | null> {
  const { createClassroom } = await import('./backendService');
  const cls = await createClassroom({
    title: d.title.trim(),
    description: d.description.trim(),
    category: d.category,
    track: 'CREATOR',
    price: d.price,
    thumbnailUrl: d.thumbnailUrl || generatedCover(d.title, categoryMeta(d.category).emoji, 'aurora', d.category),
    syllabus: d.syllabus || syllabusFrom(d.lessons),
    lessons: d.lessons,
    assignments: d.assignments,
    status: opts.publish ? 'PUBLISHED' : 'DRAFT',
    tagline: d.tagline.trim() || undefined,
    outcomes: Array.from(d.outcomes, o => (o || '').trim()).filter(Boolean),
    level: d.level,
    format: d.format,
    startDate: d.format === 'SELF_PACED' ? undefined : d.startDate,
    capacity: d.capacity > 0 ? d.capacity : undefined,
    accent: d.accent,
    publishedAt: opts.publish ? Date.now() : undefined,
  });
  return cls || null;
}

export function courseUrl(id: string): string {
  const origin = (typeof window !== 'undefined' ? (((import.meta as any).env?.VITE_APP_URL as string | undefined) || window.location.origin) : 'https://plajah.com').replace(/\/$/, '');
  return `${origin}/?course=${encodeURIComponent(id)}`;
}

/**
 * Start Stripe Checkout for a PAID course. Enrollment must only ever be granted server-side after
 * payment, so this never touches Firestore: it asks the server for a session and redirects.
 * Throws a plain-English error when checkout is unavailable (callers show it as-is).
 */
export async function startCourseCheckout(courseId: string): Promise<void> {
  const { auth } = await import('./firebase');
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to enroll.');
  let res: Response;
  try {
    res = await fetch('/api/stripe/course-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ courseId }),
    });
  } catch {
    throw new Error('Could not reach checkout. Check your connection and try again.');
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error('Paid enrollment is not switched on yet. Please check back soon.');
    const { error } = await res.json().catch(() => ({ error: '' }));
    throw new Error(error || 'Checkout could not be started.');
  }
  const { url } = await res.json();
  if (!url) throw new Error('Checkout did not return a payment page.');
  window.location.href = url;
}

/**
 * After returning from checkout (or whenever a learner opens a course): ask the server to make sure a
 * PAID seat has been granted. Safe to call for anyone; returns false when there is no paid claim.
 * Polls briefly because the Stripe webhook can land a few seconds after the redirect.
 */
export async function confirmPaidEnrollment(courseId: string, attempts = 6): Promise<boolean> {
  const { auth } = await import('./firebase');
  for (let i = 0; i < attempts; i++) {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return false;
      const res = await fetch('/api/courses/enrollment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ courseId }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.enrolled) return true;
        if (!j.paid && i >= 1) return false; // no payment on record after a couple of looks
      }
    } catch { /* network blip: try again */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

// ── Lesson media + completion ────────────────────────────────────────────────

export type LessonMedia =
  | { kind: 'iframe'; src: string }
  | { kind: 'video'; src: string }
  | { kind: 'link'; src: string }
  | { kind: 'none' };

/**
 * Turn whatever a creator pasted into something safely playable. Only https URLs are ever used;
 * YouTube/Vimeo become their official embed URLs, direct video files play natively, and anything
 * else is offered as a plain link rather than being embedded blindly.
 */
export function lessonMedia(raw?: string): LessonMedia {
  const v = (raw || '').trim();
  if (!v) return { kind: 'none' };
  let u: URL;
  try { u = new URL(v); } catch { return { kind: 'none' }; }
  if (u.protocol !== 'https:') return { kind: 'none' };
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const yt = (id: string | null | undefined) => (id && /^[\w-]{6,15}$/.test(id) ? { kind: 'iframe' as const, src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : null);
  if (host === 'youtu.be') return yt(u.pathname.slice(1)) || { kind: 'link', src: v };
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return yt(u.searchParams.get('v')) || { kind: 'link', src: v };
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/);
    if (m) return yt(m[1]) || { kind: 'link', src: v };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(\d{5,})/);
    if (m) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: 'video', src: v };
  return { kind: 'link', src: v };
}

/** Which lessons are done, and whether the course is finished (every lesson, at least one). */
export function completion(lessonIds: string[], done: string[] | undefined): { done: number; total: number; pct: number; complete: boolean } {
  const set = new Set(done || []);
  const d = lessonIds.filter(id => set.has(id)).length;
  return { done: d, total: lessonIds.length, pct: lessonIds.length ? Math.round((d / lessonIds.length) * 100) : 0, complete: lessonIds.length > 0 && d === lessonIds.length };
}
