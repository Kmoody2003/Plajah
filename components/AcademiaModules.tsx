// AcademiaModules — the shared "Modules" gallery, used on BOTH Academia interfaces (the
// education portal AcademiaHomeView and the public AcademiaLandingView). Modules get their own
// section rendered as a card-gallery: rich accent-gradient cover cards with a large icon
// watermark, title, blurb, and a Start affordance. Each card deep-links to its live module.

import React from 'react';
import {
  Languages, Landmark, Atom, BookOpen, Palette, Music, GraduationCap, ChevronRight,
} from 'lucide-react';

export interface AcademiaModule {
  key: string; label: string; desc: string; icon: React.ElementType; accent: string; view: string;
}

export const ACADEMIA_MODULES: AcademiaModule[] = [
  { key: 'lang',    label: 'Languages',     desc: 'Learn a language, Duolingo-style — vocab, listening & streaks.', icon: Languages, accent: '#7a2bd6', view: 'LANGUAGE_QUEST' },
  { key: 'history', label: 'History',       desc: 'Nano-lessons and deep dives across world history.',             icon: Landmark,  accent: '#FF8C00', view: 'HISTORY_QUEST' },
  { key: 'science', label: 'Science',       desc: 'Interactive science quests and simulators.',                    icon: Atom,      accent: '#36c5f0', view: 'SCIENCE_QUEST' },
  { key: 'reading', label: 'Reading',       desc: 'Gamified reading practice and a leveled library.',              icon: BookOpen,  accent: '#2bd67a', view: 'READING_QUEST' },
  { key: 'art',     label: 'Art Masters',   desc: 'Open-access masterworks from the Met, AIC and more.',           icon: Palette,   accent: '#e23b6d', view: 'ART_GALLERY' },
  { key: 'music',   label: 'Music History', desc: 'The Chora Vault — the story of recorded sound.',                icon: Music,     accent: '#FFD24A', view: 'MUSIC' },
];

const GalleryCard: React.FC<{ m: AcademiaModule; onNavigate: (v: string) => void }> = ({ m, onNavigate }) => {
  const Icon = m.icon;
  return (
    <button
      onClick={() => onNavigate(m.view)}
      className="group relative aspect-[4/5] rounded-3xl overflow-hidden border border-white/10 text-left hover:-translate-y-1 hover:border-white/25 transition-all"
      style={{ background: `linear-gradient(155deg, ${m.accent}2e 0%, #0b0b12 62%)` }}
    >
      {/* Large icon watermark */}
      <div className="absolute -right-6 -top-6 opacity-15 group-hover:opacity-25 transition-opacity" style={{ color: m.accent }}>
        <Icon size={150} strokeWidth={1.25} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      <div className="absolute inset-0 p-5 flex flex-col justify-end">
        <div className="w-11 h-11 rounded-xl grid place-items-center mb-3" style={{ background: `${m.accent}26`, color: m.accent }}>
          <Icon size={22} />
        </div>
        <p className="text-[17px] font-black leading-none">{m.label}</p>
        <p className="text-[12px] text-white/55 leading-snug mt-1.5 line-clamp-2">{m.desc}</p>
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-3 group-hover:gap-2 transition-all" style={{ color: m.accent }}>
          Start <ChevronRight size={12} />
        </span>
      </div>
    </button>
  );
};

const AcademiaModules: React.FC<{ onNavigate: (view: string) => void; heading?: boolean }> = ({ onNavigate, heading = true }) => {
  return (
    <section>
      {heading && (
        <div className="mb-5">
          <div className="flex items-center gap-2 text-[#3FB98E] mb-1"><GraduationCap size={16} /><span className="text-[10px] font-black uppercase tracking-[0.3em]">Learning Modules</span></div>
          <h2 className="text-2xl font-black">Structured, self-paced tracks</h2>
          <p className="text-white/45 text-[13px] mt-1">Pick a track and go — each one is a full, gamified module.</p>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {ACADEMIA_MODULES.map(m => <GalleryCard key={m.key} m={m} onNavigate={onNavigate} />)}
      </div>
    </section>
  );
};

export default AcademiaModules;
