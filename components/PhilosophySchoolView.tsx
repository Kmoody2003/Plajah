/**
 * PhilosophySchoolView — the School of Philosophy.
 *
 * Chassis shell; curriculum in data/philosophyCurriculum.ts. The header states the ladder (age 4 to
 * seminar) and the licence claim that makes it possible: every primary text is public domain.
 */
import React from 'react';
import { ArrowLeft, Feather, GraduationCap, BookOpen } from 'lucide-react';
import SchoolView from './school/SchoolView';
import { PHILOSOPHY_SCHOOL } from '../data/philosophyCurriculum';

const ACCENT = '#A78BFA';

const PhilosophySchoolView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const lessons = PHILOSOPHY_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);
  return (
    <div className="min-h-full bg-[#08070c] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.14] p-6 sm:p-8"
          style={{ background: 'linear-gradient(120deg, rgba(167,139,250,0.22), rgba(107,0,153,0.16) 60%, transparent)' }}>
          <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: ACCENT }}>
            Plajah Academia · Philosophy
          </p>
          <h1 className="mt-3 text-4xl font-black italic uppercase leading-[0.95] tracking-tight sm:text-5xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
            School of Philosophy
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">{PHILOSOPHY_SCHOOL.blurb}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: <GraduationCap size={12} />, label: `${PHILOSOPHY_SCHOOL.tracks.length} strands · ${lessons} lessons` },
              { icon: <Feather size={12} />, label: 'Wonder circles at 4 → seminars at 20' },
              { icon: <BookOpen size={12} />, label: 'Public-domain primary texts throughout' },
            ].map(c => (
              <span key={c.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70">
                {c.icon}{c.label}
              </span>
            ))}
          </div>
          <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/35">
            No lesson here resolves a live philosophical question for you. Each presents the positions at
            their strongest and asks for your reasons. Translations are public domain or the modernised
            Early Modern Texts editions used with permission; modern scholarly translations are cited,
            never reproduced.
          </p>
        </div>
        <div className="mt-8"><SchoolView curriculum={PHILOSOPHY_SCHOOL} embedded /></div>
      </div>
    </div>
  );
};

export default PhilosophySchoolView;
