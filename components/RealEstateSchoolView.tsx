/**
 * RealEstateSchoolView — the Real Estate School.
 *
 * A thin shell over the shared School chassis; the curriculum lives in
 * data/realEstateCurriculum.ts and <SchoolView> handles progress and the ledger writes.
 *
 * The header carries the two claims that make this course unusual: there is no comprehensive open
 * real-estate curriculum anywhere else, and the homework runs on Terra's live parcel data rather
 * than invented examples. It also states the disclaimers up front, because this subject genuinely
 * needs them.
 */
import React from 'react';
import { ArrowLeft, MapPin, GraduationCap, ShieldCheck } from 'lucide-react';
import SchoolView from './school/SchoolView';
import { REAL_ESTATE_SCHOOL } from '../data/realEstateCurriculum';

const ACCENT = '#06D6A0';

const RealEstateSchoolView: React.FC<{ onBack: () => void; onNavigate?: (view: string) => void }> = ({ onBack, onNavigate }) => {
  const lessons = REAL_ESTATE_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);

  return (
    <div className="min-h-full bg-[#08070c] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>

        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.14] p-6 sm:p-8"
          style={{ background: 'linear-gradient(120deg, rgba(6,214,160,0.20), rgba(59,130,246,0.14) 60%, transparent)' }}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: ACCENT }}>
            Plajah Academia · Real Estate
          </p>
          <h1 className="mt-3 text-4xl font-black italic uppercase leading-[0.95] tracking-tight sm:text-5xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Real Estate School
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">{REAL_ESTATE_SCHOOL.blurb}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: <GraduationCap size={12} />, label: `${REAL_ESTATE_SCHOOL.tracks.length} strands · ${lessons} lessons` },
              { icon: <MapPin size={12} />, label: 'Homework runs on live Detroit parcels' },
              { icon: <ShieldCheck size={12} />, label: 'MIT OCW · federal public domain · open casebooks' },
            ].map(chip => (
              <span key={chip.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70">
                {chip.icon}{chip.label}
              </span>
            ))}
          </div>

          {onNavigate && (
            <button
              onClick={() => onNavigate('TERRA')}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-black uppercase tracking-wider text-[#04231b]"
              style={{ background: ACCENT }}
            >
              <MapPin size={14} /> Open Terra — adopt a parcel
            </button>
          )}

          <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/35">
            Education only. Nothing here is legal advice, an appraisal, a zoning determination, or
            investment advice. USPAP is taught about, never reproduced — it is a copyrighted
            professional standard. Licensure content is mapped to published exam outlines; all
            practice questions are authored in-house.
          </p>
        </div>

        <div className="mt-8">
          <SchoolView curriculum={REAL_ESTATE_SCHOOL} embedded />
        </div>
      </div>
    </div>
  );
};

export default RealEstateSchoolView;
