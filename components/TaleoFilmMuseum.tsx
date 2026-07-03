import React from 'react';
import { ArrowLeft, Clapperboard } from 'lucide-react';
import MuseumHall from './MuseumHall';
import { FILM_MUSEUM_HALLS, FILM_MUSEUM_FIGURES } from '../data/filmMuseum';

// ─────────────────────────────────────────────────────────────────────────────
// TaleoFilmMuseum — the Film Museum destination inside Taleo.
//
// Renders the shared <MuseumHall> engine with the curated Film Museum seed
// (data/filmMuseum.ts). Portraits + biographies auto-load live from Wikipedia;
// we supply the halls, figures, accent, and icon. Styled to match Taleo's
// dark / #D0BCFF palette with a back-button header.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

const ACCENT = '#D0BCFF';

const TaleoFilmMuseum: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#131314] text-white pb-32">
      {/* Header */}
      <div className="sticky top-16 z-30 bg-[#131314]/90 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-black text-white leading-none">The Film Museum</h1>
            <p className="text-[9px] text-white/40 font-black uppercase tracking-widest mt-1">
              Taleo — Masters of Cinema
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <MuseumHall
          eyebrow="The Film Museum"
          title="Masters of Cinema"
          intro="A living hall of the artists who built the art form — directors, writers, producers, cinematographers, editors, and composers. Portraits and biographies load live from Wikipedia; the curated craft notes are ours."
          halls={FILM_MUSEUM_HALLS}
          figures={FILM_MUSEUM_FIGURES}
          accent={ACCENT}
          icon={Clapperboard}
          shareDiscipline="Cinema"
        />
      </div>
    </div>
  );
};

export default TaleoFilmMuseum;
