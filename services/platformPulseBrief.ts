import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db } from './backendService';
import { assembleRhythm } from './oraRhythm';
import { assembleWorkbench, loose } from './oraWorkbench';
import { getCheckin, getProfile, listGoals, listRituals, today } from './oraService';

export type PulseBriefKind = 'SCHEDULE' | 'ASSIGNMENT' | 'TASK' | 'PROJECT' | 'WELLNESS' | 'INSIGHT';

export interface PulseBriefItem {
  id: string;
  kind: PulseBriefKind;
  eyebrow: string;
  title: string;
  detail?: string;
  at?: number;
  urgent?: boolean;
}

export interface PlatformPulseBrief {
  greeting: string;
  summary: string;
  items: PulseBriefItem[];
  oraEnabled: boolean;
  needsCheckin: boolean;
  partial: boolean;
}

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Owner-only, read-only daily brief assembled from records Plajah already has. */
export async function assemblePlatformPulseBrief(accountType?: string): Promise<PlatformPulseBrief> {
  const uid = auth.currentUser?.uid;
  const now = Date.now();
  const endToday = startOfDay() + 86_400_000;
  const items: PulseBriefItem[] = [];
  let partial = false;

  const [profile, checkin, rhythm, workbench, goals, rituals] = await Promise.all([
    getProfile().catch(() => null),
    getCheckin(today()).catch(() => null),
    assembleRhythm(14).catch(() => ({ entries: [], partial: true })),
    assembleWorkbench().catch(() => ({ projects: [], itemCount: 0, partial: true })),
    listGoals().catch(() => []),
    listRituals().catch(() => []),
  ]);
  partial ||= rhythm.partial || workbench.partial;

  for (const entry of rhythm.entries.filter((e) => e.at < endToday).slice(0, 3)) {
    items.push({ id: entry.id, kind: 'SCHEDULE', eyebrow: entry.label, title: entry.title, detail: entry.subtitle, at: entry.at });
  }

  // Academic Pulse is deliberately restricted to classrooms this user is enrolled in.
  if (uid && ['STUDENT', 'ACADEMIA'].includes(String(accountType || '').toUpperCase())) {
    try {
      const snap = await getDocs(query(collection(db, 'classrooms'), where('enrolledStudents', 'array-contains', uid), limit(20)));
      for (const row of snap.docs) {
        const classroom = row.data() as any;
        for (const assignment of (classroom.assignments || [])) {
          const due = Number(assignment.dueDate) || 0;
          if (due >= startOfDay() && due < now + 7 * 86_400_000) {
            items.push({
              id: `assignment_${row.id}_${assignment.id}`,
              kind: 'ASSIGNMENT', eyebrow: classroom.title || 'Classwork',
              title: assignment.title || 'Assignment', at: due,
              urgent: due < endToday,
            });
          }
        }
      }
    } catch { partial = true; }
  }

  for (const end of loose(workbench).slice(0, 2)) {
    items.push({ id: `task_${end.item.id}`, kind: 'TASK', eyebrow: `${end.label} · To do`, title: end.item.title, detail: end.item.needs });
  }
  for (const project of workbench.projects.slice(0, 2)) {
    items.push({ id: `project_${project.id}`, kind: 'PROJECT', eyebrow: `${project.label} · Recent project`, title: project.title, detail: project.state });
  }

  const activeGoal = goals.find((goal) => goal.status === 'ACTIVE');
  if (activeGoal) {
    const progress = activeGoal.target ? `${activeGoal.progress} of ${activeGoal.target}${activeGoal.unit ? ` ${activeGoal.unit}` : ''}` : undefined;
    items.push({ id: `goal_${activeGoal.id}`, kind: 'INSIGHT', eyebrow: 'Productivity insight', title: activeGoal.title, detail: progress });
  }

  const oraEnabled = !!profile?.enabled;
  if (oraEnabled && !checkin) {
    const ritual = rituals.find((r) => r.active && (!r.days.length || r.days.includes(new Date().getDay())));
    items.push({ id: 'ora_checkin', kind: 'WELLNESS', eyebrow: 'Wellness nudge', title: 'How is your energy right now?', detail: ritual ? `${ritual.name} is ready when you are.` : 'A five-second check-in can shape the rest of your day.' });
  } else if (oraEnabled && checkin?.energy && checkin.energy <= 2) {
    items.push({ id: 'ora_energy', kind: 'WELLNESS', eyebrow: 'Wellness insight', title: 'Keep the next block light', detail: 'Your energy check-in was low. Protect some recovery time.' });
  }

  const dueToday = items.filter((item) => item.urgent).length;
  const scheduledToday = items.filter((item) => item.kind === 'SCHEDULE').length;
  const summary = dueToday
    ? `${dueToday} item${dueToday === 1 ? '' : 's'} due today${scheduledToday ? ` · ${scheduledToday} scheduled` : ''}.`
    : scheduledToday
      ? `${scheduledToday} scheduled item${scheduledToday === 1 ? '' : 's'} today.`
      : items.length ? 'Here is what deserves your attention next.' : 'Your day is open right now.';

  return { greeting: greetingFor(new Date().getHours()), summary, items, oraEnabled, needsCheckin: oraEnabled && !checkin, partial };
}
