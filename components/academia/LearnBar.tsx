import React from 'react';
import { ArrowLeft, Compass, Home } from 'lucide-react';

/**
 * One consistent way out of every learning screen. The old schools and quests each drew their own
 * back button and header, so getting from Civics to Math meant retracing steps through the global nav.
 * This slim bar sits above them all: back, where you are, the Learn map, and your Academia home.
 * It never replaces a screen's own content, so nothing inside the schools changed.
 */
export const LEARN_VIEW_TITLES: Record<string, string> = {
  CIVICS_HALL: 'Civics Hall', MONEY_SCHOOL: 'School of Money', ECON_SCHOOL: 'Economics', PHILOSOPHY_SCHOOL: 'Philosophy',
  REAL_ESTATE_SCHOOL: 'Real Estate', BUSINESS_SCHOOL: 'Business School', FILM_SCHOOL: 'Film School', MATH_SCHOOL: 'Math',
  MATH_CLASSROOM: 'Math practice', SCIENCE_SCHOOL: 'Science', SCIENCE_QUEST: 'Science Quest', HISTORY_QUEST: 'History Quest',
  LANGUAGE_ARTS_SCHOOL: 'Language Arts', READING_QUEST: 'Reading Quest', LANGUAGE_QUEST: 'Languages', VOCA: 'Voca',
  HANDWRITING_WORKSHOP: 'Penna', KIDS_LIBRARY: 'Kids Library', COMIC_MUSEUM: 'Comic & Manga Museum', LEARNER_LEDGER: 'Learning record',
};

const LearnBar: React.FC<{ view: string; onBack: () => void; onNavigate: (v: string) => void; homeView: string }> = ({ view, onBack, onNavigate, homeView }) => (
  <nav aria-label="Learning navigation" className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 bg-[#0a0a0f]/90 backdrop-blur border-b border-white/8 text-white">
    <button type="button" onClick={onBack} aria-label="Back" className="w-8 h-8 rounded-full grid place-items-center hover:bg-white/10"><ArrowLeft size={16} /></button>
    <p className="text-[12px] text-white/50 truncate min-w-0">
      <button type="button" onClick={() => onNavigate('LEARN')} className="hover:text-white font-bold">Learn</button>
      <span className="mx-1.5 text-white/25">›</span>
      <span className="text-white font-black">{LEARN_VIEW_TITLES[view] || 'Course'}</span>
    </p>
    <span className="flex-1" />
    <button type="button" onClick={() => onNavigate('LEARN')} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10 inline-flex items-center gap-1.5"><Compass size={12} /> All courses</button>
    <button type="button" onClick={() => onNavigate(homeView)} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10 inline-flex items-center gap-1.5"><Home size={12} /> Home</button>
  </nav>
);

export default LearnBar;
