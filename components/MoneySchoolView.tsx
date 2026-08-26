/**
 * MoneySchoolView — the School of Money (financial literacy), Academia's flagship
 * money program. A thin shell over the shared School chassis: the curriculum lives in
 * data/finlitCurriculum.ts and <SchoolView> handles progress, the lesson reader, and the
 * Learner Ledger writes.
 *
 * The header states the two things a teacher needs to know in the first five seconds:
 * it is aligned to the standards their state legislates against, and the source spine is
 * public domain — so it is free, printable, and never paywalled.
 */
import React from 'react';
import { ArrowLeft, ShieldCheck, Printer, GraduationCap } from 'lucide-react';
import SchoolView from './school/SchoolView';
import { MONEY_SCHOOL } from '../data/finlitCurriculum';

const MoneySchoolView: React.FC<{ onBack: () => void; onNavigate?: (view: string) => void }> = ({ onBack, onNavigate }) => {
  const lessons = MONEY_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);

  return (
    <div className="min-h-full bg-[#08070c] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header — the educator pitch, stated plainly */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.14] p-6 sm:p-8"
          style={{ background: 'linear-gradient(120deg, rgba(245,158,11,0.20), rgba(107,0,153,0.16) 60%, transparent)' }}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#F59E0B]">
            Plajah Academia · Financial Literacy
          </p>
          <h1
            className="mt-3 text-4xl font-black italic uppercase leading-[0.95] tracking-tight sm:text-5xl"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            School of Money
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            {MONEY_SCHOOL.blurb}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: <GraduationCap size={12} />, label: `${MONEY_SCHOOL.tracks.length} strands · ${lessons} lessons` },
              { icon: <ShieldCheck size={12} />, label: 'Aligned to CEE + Jump$tart national standards' },
              { icon: <Printer size={12} />, label: 'Public-domain spine — free & printable' },
            ].map(chip => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70"
              >
                {chip.icon}
                {chip.label}
              </span>
            ))}
          </div>

          {onNavigate && (
            <button
              onClick={() => onNavigate('PAPER_TRADING')}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-black uppercase tracking-wider text-[#231604]"
              style={{ background: '#F59E0B' }}
            >
              Open the practice portfolio
            </button>
          )}

          <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/35">
            Financial education, not advice. Sources: FDIC Money Smart, the CFPB youth and adult
            toolkits, SEC Investor.gov and FTC consumer publications — all US Government works in the
            public domain. Standards are cited and aligned to, never reproduced.
          </p>
        </div>

        <div className="mt-8">
          <SchoolView curriculum={MONEY_SCHOOL} embedded />
        </div>
      </div>
    </div>
  );
};

export default MoneySchoolView;
