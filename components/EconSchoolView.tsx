/**
 * EconSchoolView — the School of Economics.
 *
 * Chassis shell; curriculum in data/econCurriculum.ts. The header leads with the differentiator:
 * this course is taught on live public data series rather than stale textbook charts.
 */
import React from 'react';
import { ArrowLeft, LineChart, GraduationCap, ShieldCheck } from 'lucide-react';
import SchoolView from './school/SchoolView';
import { ECON_SCHOOL } from '../data/econCurriculum';

const ACCENT = '#3B82F6';

const EconSchoolView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const lessons = ECON_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);
  return (
    <div className="min-h-full bg-[#08070c] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.14] p-6 sm:p-8"
          style={{ background: 'linear-gradient(120deg, rgba(59,130,246,0.20), rgba(107,0,153,0.15) 60%, transparent)' }}>
          <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: ACCENT }}>
            Plajah Academia · Economics
          </p>
          <h1 className="mt-3 text-4xl font-black italic uppercase leading-[0.95] tracking-tight sm:text-5xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
            School of Economics
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">{ECON_SCHOOL.blurb}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: <GraduationCap size={12} />, label: `${ECON_SCHOOL.tracks.length} strands · ${lessons} lessons` },
              { icon: <LineChart size={12} />, label: 'Taught on live FRED / BLS / BEA series' },
              { icon: <ShieldCheck size={12} />, label: 'Aligned to the CEE national standards' },
            ].map(c => (
              <span key={c.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70">
                {c.icon}{c.label}
              </span>
            ))}
          </div>
          <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/35">
            Where the profession is genuinely divided — on minimum wages, trade, stimulus, inequality —
            this course teaches the mechanisms and the evidence rather than picking a side, and says so.
            Data sources are public domain; standards are cited, never reproduced.
          </p>
        </div>
        <div className="mt-8"><SchoolView curriculum={ECON_SCHOOL} embedded /></div>
      </div>
    </div>
  );
};

export default EconSchoolView;
