import React, { Suspense, useEffect, useState } from 'react';
import { Link2, FlaskConical, ChevronRight } from 'lucide-react';
import { linksFor, KIND_LABEL, SIM_DISCIPLINE, type ResolvedLink } from '../../data/connections';

/**
 * "Connected ideas": where this lesson's idea shows up in other subjects, and in the Plajah Labs.
 * Lesson links open that lesson. A Labs simulator link opens the real simulator right here, so a
 * student can try the idea (a pendulum, a wave, an orbit) without leaving the lesson.
 */
const SimEmbed = React.lazy(async () => {
  const m = await import('../labs/Simulators');
  const Wrap: React.FC<{ id: string }> = ({ id }) => { const e = m.SIMULATORS[id]; return e ? <e.Component accent="#00DAF3" /> : null; };
  return { default: Wrap };
});

interface Props {
  courseId: string; lessonId: string;
  resolve: (courseId: string, lessonId: string) => { title: string; course: string } | null;
  onOpenLesson: (courseId: string, lessonId: string) => void;
  onOpenLabs: (disciplineId: string) => void;
}

const ConnectedIdeas: React.FC<Props> = ({ courseId, lessonId, resolve, onOpenLesson, onOpenLabs }) => {
  const [links, setLinks] = useState<ResolvedLink[] | null>(null);
  const [openSim, setOpenSim] = useState<string | null>(null);
  useEffect(() => { let a = true; setLinks(null); setOpenSim(null); linksFor(courseId, lessonId).then(l => a && setLinks(l)).catch(() => a && setLinks([])); return () => { a = false; }; }, [courseId, lessonId]);

  const shown = (links || []).filter(l => l.target.type !== 'lesson' || resolve(l.target.courseId, l.target.lessonId));
  if (!shown.length) return null;
  return (
    <section className="mt-6" aria-label="Connected ideas">
      <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-white/45 mb-2 flex items-center gap-1.5"><Link2 size={13} /> Connected ideas</h3>
      <div className="grid gap-2">
        {shown.map((l, i) => {
          const t = l.target;
          if (t.type === 'sim') {
            const open = openSim === t.id;
            return (
              <div key={i} className="rounded-2xl border border-[#00DAF3]/30 bg-[#00DAF3]/[0.05]">
                <button type="button" onClick={() => setOpenSim(open ? null : t.id)} aria-expanded={open} className="w-full text-left px-4 py-3 flex items-start gap-3">
                  <FlaskConical size={16} className="text-[#00DAF3] mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block text-[11px] font-black uppercase tracking-wider text-[#00DAF3]">Try it · Plajah Labs simulator</span><span className="block text-[13px] text-white/80 leading-snug mt-0.5">{l.why}</span></span>
                  <ChevronRight size={15} className={`text-white/40 mt-1 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                {open && (
                  <div className="px-3 pb-3">
                    <Suspense fallback={<p className="text-[12px] text-white/45 p-3">Loading the simulator…</p>}><SimEmbed id={t.id} /></Suspense>
                    {SIM_DISCIPLINE[t.id] && <button type="button" onClick={() => onOpenLabs(SIM_DISCIPLINE[t.id])} className="mt-2 text-[11px] font-black text-white/55 hover:text-white underline underline-offset-2">Open the full {SIM_DISCIPLINE[t.id]} studio in the Labs</button>}
                  </div>
                )}
              </div>
            );
          }
          if (t.type === 'labs') return (
            <button key={i} type="button" onClick={() => onOpenLabs(t.id)} className="text-left rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] px-4 py-3 flex items-start gap-3 transition-colors">
              <FlaskConical size={16} className="text-[#06D6A0] mt-0.5 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-[11px] font-black uppercase tracking-wider text-[#06D6A0]">Explore in the Labs · {t.id}</span><span className="block text-[13px] text-white/80 leading-snug mt-0.5">{l.why}</span></span><ChevronRight size={15} className="text-white/40 mt-1" /></button>
          );
          const r = resolve(t.courseId, t.lessonId)!;
          return (
            <button key={i} type="button" onClick={() => onOpenLesson(t.courseId, t.lessonId)} className="text-left rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] px-4 py-3 flex items-start gap-3 transition-colors">
              <Link2 size={16} className="text-[#FF8C00] mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-black uppercase tracking-wider text-white/45">{KIND_LABEL[l.kind]} · {r.course}</span><span className="block text-[14px] font-black leading-tight mt-0.5">{r.title}</span><span className="block text-[12px] text-white/65 leading-snug mt-1">{l.why}</span></span>
              <ChevronRight size={15} className="text-white/40 mt-1" />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default ConnectedIdeas;
