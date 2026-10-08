import type { Curriculum } from '../schoolChassis';
import type { Domain, WatchTarget } from './types';

export const domainOfCourse = (courseId: string): Domain | null =>
  courseId.startsWith('law-') ? 'law' : courseId.startsWith('med-') ? 'medicine' : null;

/** Collapse every lesson anchor in the given curricula into one target per distinct anchor. */
export function buildWatchlist(curricula: Curriculum[]): WatchTarget[] {
  const byKey = new Map<string, WatchTarget>();
  for (const cur of curricula) {
    const domain = domainOfCourse(cur.id);
    if (!domain) continue;
    for (const t of cur.tracks) for (const l of t.lessons) for (const a of l.anchors || []) {
      const ref = a.ref.trim(); if (!ref) continue;
      const key = `${a.kind}:${ref.toLowerCase()}`;
      let tg = byKey.get(key);
      if (!tg) { tg = { key, kind: a.kind, ref, domain, lessons: [] }; byKey.set(key, tg); }
      if (!tg.lessons.some(x => x.lessonId === l.id)) tg.lessons.push({ courseId: cur.id, lessonId: l.id });
    }
  }
  return [...byKey.values()];
}

/** Parse a case anchor "Name|year|court". */
export function parseCaseRef(ref: string): { name: string; year?: number; court?: string } {
  const [name, year, court] = ref.split('|').map(s => s.trim());
  const y = Number(year);
  return { name, year: Number.isFinite(y) && y > 0 ? y : undefined, court };
}
