/**
 * CourseEntryCard — the "Teach a course" entry point for the Creator Hub (and anywhere else a
 * creator should be able to jump into creator courses). One tap opens the CREATOR_COURSES view,
 * which already handles sign-in, the builder and the dashboard.
 *
 * Shows a live summary (courses, learners, drafts) once the signed-in creator teaches; for
 * everyone else it is a clear invitation. Its chalk art honours the in-app Motion switch.
 */
import React, { useEffect, useState } from 'react';
import { ArrowRight, GraduationCap, Plus } from 'lucide-react';
import { chalkBoard } from '../../../services/creatorArt';
import { courseStats, fetchMyCourses } from '../../../services/creatorCourses';
import { useMotion } from './useMotion';

interface Props {
  uid?: string;
  onNavigate: (view: string) => void;
  /** Extra classes for placement, e.g. grid spans. */
  className?: string;
}

export default function CourseEntryCard({ uid, onNavigate, className = '' }: Props) {
  useMotion(); // re-render when the Motion switch changes
  const [summary, setSummary] = useState<{ courses: number; learners: number; drafts: number } | null>(null);

  useEffect(() => {
    if (!uid) { setSummary(null); return; }
    let alive = true;
    fetchMyCourses(uid).then(list => {
      if (!alive) return;
      setSummary({
        courses: list.length,
        learners: list.reduce((n, c) => n + courseStats(c).learners, 0),
        drafts: list.filter(c => c.status === 'DRAFT').length,
      });
    }).catch(() => { if (alive) setSummary(null); });
    return () => { alive = false; };
  }, [uid]);

  const teaching = !!summary && summary.courses > 0;

  return (
    <section aria-label="Teach a course" className={`relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0d0b14] ${className}`}>
      {/* Phones: the drawing gets its own strip above the copy so it is actually seen. Wider screens: full-bleed behind the copy. */}
      <div className="sm:hidden h-28 bg-cover bg-[position:80%_28%]" style={{ backgroundImage: `url("${chalkBoard('masterclass', { tint: '#2a1346', strength: 0.8, ink: '#ffd98a' })}")` }} aria-hidden="true" />
      <div className="hidden sm:block absolute inset-0 bg-cover bg-right opacity-70" style={{ backgroundImage: `url("${chalkBoard('masterclass', { tint: '#2a1346', strength: 0.6, ink: '#ffd98a' })}")` }} aria-hidden="true" />
      <div className="hidden sm:block absolute inset-0 bg-gradient-to-r from-[#07070c]/90 via-[#07070c]/65 to-transparent" aria-hidden="true" />
      <div className="relative p-6 sm:p-8 max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-white">
          <GraduationCap size={13} /> Plajah Academia
        </div>
        <h3 className="mt-4 font-display text-2xl sm:text-3xl font-black tracking-tight text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.55)]">
          {teaching ? 'Your courses' : 'Teach a course'}
        </h3>
        <p className="mt-2 text-sm sm:text-base text-white/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
          {teaching
            ? `${summary!.courses} course${summary!.courses === 1 ? '' : 's'} · ${summary!.learners} learner${summary!.learners === 1 ? '' : 's'}${summary!.drafts ? ` · ${summary!.drafts} draft${summary!.drafts === 1 ? '' : 's'} to finish` : ''}. Open your studio to grade, go live and promote.`
            : 'Turn what you know into a course in minutes. Run it with a gradebook, live classes and class chat, then fill it with invites, social posts and email. You keep 95%.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => onNavigate('CREATOR_COURSES')} className="min-h-[44px] rounded-2xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] px-5 text-sm font-black text-white flex items-center gap-2">
            {teaching ? <ArrowRight size={16} /> : <Plus size={16} />} {teaching ? 'Open my studio' : 'Create a course'}
          </button>
          {teaching && (
            <button type="button" onClick={() => onNavigate('CREATOR_COURSES')} className="min-h-[44px] rounded-2xl bg-white/15 px-5 text-sm font-bold text-white hover:bg-white/25 flex items-center gap-2">
              <Plus size={16} /> New course
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
