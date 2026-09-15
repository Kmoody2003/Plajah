import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Play, BookOpen, Film, Globe, ArrowLeft,
  ChevronRight, Award, MessageSquare, Compass, History,
  Info, ExternalLink, Clapperboard, Flame, Check
} from 'lucide-react';
import { ArchiveVideo, CURATED_EUROPEANA_FILMS, CURATED_KOFA_FILMS } from '../services/archiveContentService';

interface TaleoFilmCuratorProps {
  onSelectArchiveItem: (item: ArchiveVideo) => void;
  onSelectMovie?: (item: any) => void;
  onBack?: () => void;
}

interface DoubleFeature {
  title: string;
  theme: string;
  description: string;
  filmA: ArchiveVideo;
  filmB: ArchiveVideo;
}

const HISTORIAN_FAQS = [
  {
    q: 'Why is "The Housemaid" (1960) considered the ancestor of Bong Joon-ho’s "Parasite"?',
    a: 'Director Kim Ki-young pioneered the claustrophobic Korean domestic thriller. In "The Housemaid", an affluent modern two-story home becomes a microcosm of class warfare, sexual guilt, and social climbing. Bong Joon-ho has repeatedly stated that "The Housemaid" was the foundational creative blueprint for "Parasite", directly inspiring its vertical architecture of class division and escalating panic.',
  },
  {
    q: 'How did "Nosferatu" (1922) survive when all prints were ordered destroyed?',
    a: 'Bram Stoker’s widow, Florence Stoker, sued the German production company Prana Film for unauthorized adaptation of "Dracula" and won a court order demanding every existing negative and positive print be burned. However, pirate copies and foreign release prints had already traveled across borders to France, the UK, and private collector societies, ensuring F.W. Murnau’s masterpiece survived to become the cornerstone of vampire cinema.',
  },
  {
    q: 'What is German Expressionism and how did it influence American Film Noir?',
    a: 'Following World War I, German filmmakers developed an aesthetic of angular painted sets, skewed geometry, deep diagonal shadows (chiaroscuro), and psychological delirium to externalize mental trauma. When German and Austrian Jewish filmmakers fled Nazi persecution in the 1930s (including Fritz Lang, Billy Wilder, and Robert Siodmak), they brought these precise techniques to Hollywood, directly creating American Film Noir.',
  },
  {
    q: 'How was "Sweet Dream" (1936) discovered after being lost for decades?',
    a: 'As the oldest surviving Korean sound film, "Sweet Dream" (미몽) was thought permanently lost during the chaos of the Korean War. In 2005, the Korean Film Archive (KOFA) located a pristine 35mm nitrate positive print preserved in Beijing at the China Film Archive. After extensive diplomatic repatriation and digital restoration, KOFA unveiled it to the world as an invaluable window into 1930s colonial Seoul.',
  },
  {
    q: 'Why did Dziga Vertov refuse to use intertitles in "Man with a Movie Camera" (1929)?',
    a: 'Vertov believed cinema was a revolutionary international language that should liberate itself from theatrical scripts and literary intertitles. By using montage, double exposures, variable speeds, and split screens, Vertov created a "pure visual symphony" of modern human life that could be understood by anyone across the world without reading a single written word.',
  },
];

export const TaleoFilmCurator: React.FC<TaleoFilmCuratorProps> = ({
  onSelectArchiveItem,
  onSelectMovie,
  onBack,
}) => {
  const allCurated: ArchiveVideo[] = [...CURATED_KOFA_FILMS, ...CURATED_EUROPEANA_FILMS];

  const [selectedFilm, setSelectedFilm] = useState<ArchiveVideo>(CURATED_KOFA_FILMS[0]);
  const [activeTab, setActiveTab] = useState<'SPOTLIGHT' | 'MOVEMENTS' | 'DOUBLE_FEATURE' | 'INQUIRY'>('SPOTLIGHT');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [userQuery, setUserQuery] = useState('');
  const [inquiryResponse, setInquiryResponse] = useState<string | null>(null);

  // Double feature pairings
  const doubleFeatures: DoubleFeature[] = [
    {
      title: 'Architects of Class Anxiety & Dystopia',
      theme: 'Social Hierarchy, Domestic Enclosure & Industrialization',
      description: 'Pair Fritz Lang’s monumental class-stratified city with Kim Ki-young’s claustrophobic domestic masterwork.',
      filmA: CURATED_EUROPEANA_FILMS[1], // Metropolis
      filmB: CURATED_KOFA_FILMS[0],       // The Housemaid
    },
    {
      title: 'Post-War Wounds: Neo-Realism on the Edge',
      theme: 'Trauma, Urban Decay & Survival in the Ruins',
      description: 'Experience how post-war Seoul wrestled with destruction and modernization through raw street photography.',
      filmA: CURATED_KOFA_FILMS[1],       // Aimless Bullet
      filmB: CURATED_KOFA_FILMS[4],       // A Flower in Hell
    },
    {
      title: 'The Silent Screen Nightmare',
      theme: 'Weimar Shadowplay, Expressionist Sets & Gothic Dread',
      description: 'Witness the birth of cinematic horror: painted delirium in Caligari paired with Murnau’s naturalistic vampire terror.',
      filmA: CURATED_EUROPEANA_FILMS[3], // The Cabinet of Dr. Caligari
      filmB: CURATED_EUROPEANA_FILMS[2], // Nosferatu
    },
    {
      title: 'Visions of the New Century: 1902 to 1929',
      theme: 'From Glass-House Illusion to the Cinematic Eye',
      description: 'Trace the astonishing 27-year leap from Méliès’ theatrical trick film to Vertov’s revolutionary Soviet montage.',
      filmA: CURATED_EUROPEANA_FILMS[0], // A Trip to the Moon
      filmB: CURATED_EUROPEANA_FILMS[4], // Man with a Movie Camera
    },
  ];

  const handleAskHistorian = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim()) return;

    const q = userQuery.toLowerCase();
    let reply = '';
    if (q.includes('housemaid') || q.includes('parasite') || q.includes('kim ki-young')) {
      reply = '"The Housemaid" (1960) remains Kim Ki-young’s crowning achievement. Kim employed expressionist lighting and staircase symbolism to portray post-war Korean middle-class fragility. If you enjoy modern Korean cinema like Bong Joon-ho or Park Chan-wook, you will see its direct DNA here.';
    } else if (q.includes('metropolis') || q.includes('lang') || q.includes('sci-fi')) {
      reply = 'Fritz Lang’s "Metropolis" (1927) codified the visual language of futuristic cinema. Lang’s use of the Schüfftan process (mirror-based in-camera optical illusions) allowed monumental scale without digital tools. It is widely considered the mother of all science fiction cinema.';
    } else if (q.includes('korean') || q.includes('kofa') || q.includes('golden age')) {
      reply = 'The 1950s–1960s represented the Golden Age of Korean Cinema. Emerging from the devastation of the Korean War, auteurs like Yu Hyun-mok, Han Hyung-mo, and Kim Ki-young channeled national trauma, rapid Westernization, and moral ambiguity into cinema that rivaled Italian Neo-Realism in emotional intensity.';
    } else if (q.includes('silent') || q.includes('expressionism') || q.includes('horror')) {
      reply = 'Silent cinema was not an incomplete art form awaiting sound — it was a visual medium at its zenith. German Expressionism (1919–1926) broke reality into jagged angles and deep shadows to depict interior madness, creating techniques that every great horror filmmaker still uses today.';
    } else {
      reply = `Thank you for exploring cinema heritage. The title "${selectedFilm.title}" (${selectedFilm.year}) represents ${selectedFilm.movement || 'landmark cinema'}, directed by ${selectedFilm.director || 'master filmmakers'}. Its preservation by ${selectedFilm.dataProvider || 'international archives'} ensures this irreplaceable human story remains accessible for generations.`;
    }
    setInquiryResponse(reply);
  };

  return (
    <div className="min-h-screen bg-[#131314] text-white pb-32">
      {/* Sticky Header */}
      <div className="sticky top-16 z-30 bg-[#131314]/90 backdrop-blur-xl border-b border-white/5 px-4 sm:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all shrink-0"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[#D0BCFF]" />
                <h1 className="text-base font-black text-white leading-none uppercase tracking-tight">The Film Historian & Curator</h1>
                <span className="px-2 py-0.5 rounded-full bg-[#D0BCFF]/10 text-[#D0BCFF] text-[8px] font-black uppercase tracking-widest border border-[#D0BCFF]/20">Taleo Curated</span>
              </div>
              <p className="text-[9px] text-white/40 font-black uppercase tracking-widest mt-1">
                Preservation Insights · Cultural Context · Curated Pairings
              </p>
            </div>
          </div>

          {/* Navigation Pill Tabs */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest">
            <button
              onClick={() => setActiveTab('SPOTLIGHT')}
              className={`px-3 py-1.5 rounded-full transition-all ${activeTab === 'SPOTLIGHT' ? 'bg-[#D0BCFF] text-[#1C1B1F] shadow' : 'text-white/60 hover:text-white'}`}
            >
              Spotlight
            </button>
            <button
              onClick={() => setActiveTab('MOVEMENTS')}
              className={`px-3 py-1.5 rounded-full transition-all ${activeTab === 'MOVEMENTS' ? 'bg-[#D0BCFF] text-[#1C1B1F] shadow' : 'text-white/60 hover:text-white'}`}
            >
              Movements
            </button>
            <button
              onClick={() => setActiveTab('DOUBLE_FEATURE')}
              className={`px-3 py-1.5 rounded-full transition-all ${activeTab === 'DOUBLE_FEATURE' ? 'bg-[#D0BCFF] text-[#1C1B1F] shadow' : 'text-white/60 hover:text-white'}`}
            >
              Pairings
            </button>
            <button
              onClick={() => setActiveTab('INQUIRY')}
              className={`px-3 py-1.5 rounded-full transition-all ${activeTab === 'INQUIRY' ? 'bg-[#D0BCFF] text-[#1C1B1F] shadow' : 'text-white/60 hover:text-white'}`}
            >
              Historian Q&A
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 pt-8 space-y-12">
        {/* ── 1. SPOTLIGHT VIEW ── */}
        {activeTab === 'SPOTLIGHT' && (
          <div className="space-y-10">
            {/* Hero Card */}
            <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#1C1B2E] to-[#131314] shadow-2xl">
              <div className="relative aspect-[16/8] md:aspect-[21/9] w-full overflow-hidden">
                <img
                  src={selectedFilm.thumbnailUrl}
                  alt={selectedFilm.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-35 scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#131314] via-[#131314]/70 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#131314] via-[#131314]/50 to-transparent" />

                <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 md:p-14 max-w-3xl space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-[#D0BCFF]/20 text-[#D0BCFF] text-[9px] font-black uppercase tracking-[0.2em] rounded-lg border border-[#D0BCFF]/30">
                      {selectedFilm.source === 'KOFA' ? 'Korean Film Archive Landmark' : 'Europeana Film Heritage'}
                    </span>
                    {selectedFilm.movement && (
                      <span className="px-3 py-1 bg-white/10 text-white/80 text-[9px] font-black uppercase tracking-[0.2em] rounded-lg border border-white/10">
                        {selectedFilm.movement}
                      </span>
                    )}
                    <span className="text-white/40 text-[10px] font-black uppercase tracking-widest">
                      {selectedFilm.year} · {selectedFilm.runtime}
                    </span>
                  </div>

                  <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-white leading-[0.9]">
                    {selectedFilm.title}
                  </h2>

                  {selectedFilm.director && (
                    <p className="text-sm font-bold text-[#FFB68D] uppercase tracking-widest">
                      Directed by {selectedFilm.director}
                    </p>
                  )}

                  <p className="text-white/70 text-sm sm:text-base leading-relaxed line-clamp-3">
                    {selectedFilm.curatorNote || selectedFilm.description}
                  </p>

                  <div className="flex items-center gap-4 pt-2">
                    <button
                      onClick={() => onSelectArchiveItem(selectedFilm)}
                      className="h-12 px-8 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-3 transition-all hover:scale-105 shadow-xl cursor-pointer"
                    >
                      <Play fill="currentColor" size={18} /> Watch Masterpiece
                    </button>
                    {selectedFilm.sourceUrl && (
                      <a
                        href={selectedFilm.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-12 px-6 bg-white/10 hover:bg-white/20 border border-white/15 text-white font-black text-xs uppercase tracking-widest rounded-full flex items-center gap-2 transition-all"
                      >
                        <ExternalLink size={14} /> Archival Record
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Historical Deep Dive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 sm:p-10 border-t border-white/10 bg-white/[0.02]">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#D0BCFF]">
                    <History size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Historical Context</h3>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    {selectedFilm.historicalContext || selectedFilm.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#FFB68D]">
                    <Compass size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Movement & Style</h3>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    {selectedFilm.curatorNote || 'Landmark stylistic achievement demonstrating unique directorial vision.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Award size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Preservation & Restoration</h3>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    {selectedFilm.restorationInfo || `Preserved in national cultural heritage collections by ${selectedFilm.dataProvider || 'international film institutes'}.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Title Selector Strip */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <Clapperboard size={18} className="text-[#D0BCFF]" /> Select a Film for Historical Notes
                </h3>
                <span className="text-[10px] text-white/40 font-black uppercase tracking-widest">{allCurated.length} Preserved Classics</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {allCurated.map(film => {
                  const isSelected = selectedFilm.identifier === film.identifier;
                  return (
                    <motion.div
                      key={film.identifier}
                      whileHover={{ y: -4 }}
                      onClick={() => setSelectedFilm(film)}
                      className={`cursor-pointer rounded-2xl overflow-hidden border transition-all p-2 bg-white/5 ${isSelected ? 'border-[#D0BCFF] ring-2 ring-[#D0BCFF]/40 bg-white/10' : 'border-white/10 hover:border-white/30'}`}
                    >
                      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black/40 relative mb-2">
                        <img
                          src={film.thumbnailUrl}
                          alt={film.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#D0BCFF] text-[#1C1B1F] flex items-center justify-center shadow">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <h4 className="text-[11px] font-black uppercase text-white truncate">{film.title}</h4>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{film.year} · {film.source === 'KOFA' ? 'KOFA' : 'Europeana'}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── 2. MOVEMENTS VIEW ── */}
        {activeTab === 'MOVEMENTS' && (
          <div className="space-y-10">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1">Cinema History</p>
              <h2 className="text-3xl font-black uppercase tracking-tight text-white">Landmark Movements on Platform</h2>
              <p className="text-sm text-white/50 max-w-2xl mt-1">Explore preserved motion pictures through the key historical movements that transformed cinema from a fairground novelty into humanity's most potent art form.</p>
            </div>

            {/* Movement 1: Korean Golden Age */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-[#2A1B1F] via-[#1A1520] to-[#131314] border border-white/10 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-[8px] font-black uppercase tracking-widest border border-rose-500/30">1955–1972</span>
                  <h3 className="text-2xl font-black uppercase text-white mt-2">The Golden Age of Korean Cinema</h3>
                  <p className="text-xs text-white/60 max-w-3xl mt-1 leading-relaxed">
                    Following the armistice of the Korean War, South Korea experienced a brief period of democratic revitalization and artistic explosion. Auteurs turned away from propagandistic cinema to confront family disintegration, Westernization, and psychological guilt in masterpieces preserved by the Korean Film Archive.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {CURATED_KOFA_FILMS.slice(0, 3).map(film => (
                  <div key={film.identifier} className="p-4 rounded-2xl bg-black/40 border border-white/10 flex gap-4 items-center">
                    <img src={film.thumbnailUrl} alt={film.title} referrerPolicy="no-referrer" className="w-16 h-20 object-cover rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-black uppercase text-white truncate">{film.title}</h4>
                      <p className="text-[10px] text-[#FFB68D] font-bold mt-0.5">{film.director}</p>
                      <p className="text-[9px] text-white/40 mt-1 line-clamp-2 leading-relaxed">{film.curatorNote}</p>
                      <button
                        onClick={() => onSelectArchiveItem(film)}
                        className="mt-2 text-[9px] font-black uppercase text-[#D0BCFF] hover:underline flex items-center gap-1"
                      >
                        <Play size={10} fill="currentColor" /> Watch Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Movement 2: German Expressionism */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-[#1C1F2E] via-[#141724] to-[#131314] border border-white/10 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[8px] font-black uppercase tracking-widest border border-indigo-500/30">1919–1927</span>
                  <h3 className="text-2xl font-black uppercase text-white mt-2">German Expressionism & Weimar Cinema</h3>
                  <p className="text-xs text-white/60 max-w-3xl mt-1 leading-relaxed">
                    Born from the psychological shock of World War I in Weimar Germany, Expressionist cinema rejected realism. Directors used painted geometric shadows, warped sets, and gothic imagery to portray internal psychological crisis, paranoia, and dystopian industrial power.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {CURATED_EUROPEANA_FILMS.filter(f => f.genre === 'Sci-Fi' || f.genre === 'Horror').slice(0, 3).map(film => (
                  <div key={film.identifier} className="p-4 rounded-2xl bg-black/40 border border-white/10 flex gap-4 items-center">
                    <img src={film.thumbnailUrl} alt={film.title} referrerPolicy="no-referrer" className="w-16 h-20 object-cover rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-black uppercase text-white truncate">{film.title}</h4>
                      <p className="text-[10px] text-[#D0BCFF] font-bold mt-0.5">{film.director}</p>
                      <p className="text-[9px] text-white/40 mt-1 line-clamp-2 leading-relaxed">{film.curatorNote}</p>
                      <button
                        onClick={() => onSelectArchiveItem(film)}
                        className="mt-2 text-[9px] font-black uppercase text-[#D0BCFF] hover:underline flex items-center gap-1"
                      >
                        <Play size={10} fill="currentColor" /> Watch Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 3. DOUBLE FEATURES VIEW ── */}
        {activeTab === 'DOUBLE_FEATURE' && (
          <div className="space-y-8">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1">Curator's Matchmaker</p>
              <h2 className="text-3xl font-black uppercase tracking-tight text-white">Recommended Double Features</h2>
              <p className="text-sm text-white/50 max-w-2xl mt-1">Carefully curated pairings connecting Korean masterworks, European silent avant-garde, and early cinematic innovators.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {doubleFeatures.map((df, idx) => (
                <div key={idx} className="p-8 rounded-3xl bg-white/[0.03] border border-white/10 space-y-6 hover:border-white/20 transition-all">
                  <div>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#FFB68D] mb-1">
                      <Flame size={12} /> Double Feature #{idx + 1}
                    </div>
                    <h3 className="text-xl font-black uppercase text-white">{df.title}</h3>
                    <p className="text-xs font-bold text-[#D0BCFF] mt-0.5">{df.theme}</p>
                    <p className="text-xs text-white/50 mt-2 leading-relaxed">{df.description}</p>
                  </div>

                  {/* Dual Poster Row */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Film A */}
                    <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2 group">
                      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black relative">
                        <img src={df.filmA.thumbnailUrl} alt={df.filmA.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[8px] font-black uppercase text-white">Part I</div>
                      </div>
                      <h4 className="text-xs font-black uppercase text-white truncate">{df.filmA.title}</h4>
                      <p className="text-[9px] text-white/40">{df.filmA.year} · {df.filmA.director}</p>
                      <button
                        onClick={() => onSelectArchiveItem(df.filmA)}
                        className="w-full py-2 bg-white/10 hover:bg-[#D0BCFF] hover:text-black rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play size={10} fill="currentColor" /> Play Part 1
                      </button>
                    </div>

                    {/* Film B */}
                    <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2 group">
                      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black relative">
                        <img src={df.filmB.thumbnailUrl} alt={df.filmB.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[8px] font-black uppercase text-white">Part II</div>
                      </div>
                      <h4 className="text-xs font-black uppercase text-white truncate">{df.filmB.title}</h4>
                      <p className="text-[9px] text-white/40">{df.filmB.year} · {df.filmB.director}</p>
                      <button
                        onClick={() => onSelectArchiveItem(df.filmB)}
                        className="w-full py-2 bg-white/10 hover:bg-[#D0BCFF] hover:text-black rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play size={10} fill="currentColor" /> Play Part 2
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. HISTORIAN INQUIRY Q&A ── */}
        {activeTab === 'INQUIRY' && (
          <div className="space-y-10">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">Knowledge Archive</p>
              <h2 className="text-3xl font-black uppercase tracking-tight text-white">Ask the Virtual Film Historian</h2>
              <p className="text-sm text-white/50 max-w-2xl mt-1">Have a question about film preservation, director intent, historical censorship, or why a certain film matters? Ask our resident archive intelligence.</p>
            </div>

            {/* Interactive Query Form */}
            <form onSubmit={handleAskHistorian} className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  placeholder="Ask about a director, title, movement, or restoration (e.g. 'Why did Bong Joon-ho praise The Housemaid?')..."
                  className="flex-1 bg-black/50 border border-white/15 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#D0BCFF] transition-all"
                />
                <button
                  type="submit"
                  className="px-6 py-3.5 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] font-black text-xs uppercase tracking-widest rounded-2xl flex items-center gap-2 transition-all cursor-pointer shrink-0"
                >
                  <Sparkles size={14} /> Inquire
                </button>
              </div>

              {inquiryResponse && (
                <div className="p-5 rounded-2xl bg-[#D0BCFF]/10 border border-[#D0BCFF]/20 space-y-2">
                  <div className="flex items-center gap-2 text-[#D0BCFF] text-[9px] font-black uppercase tracking-widest">
                    <Sparkles size={12} /> Curator Response
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">{inquiryResponse}</p>
                </div>
              )}
            </form>

            {/* Frequently Asked Curatorial Questions */}
            <div className="space-y-4">
              <h3 className="text-base font-black uppercase tracking-widest text-white/80">Curated Historical Briefs</h3>
              <div className="space-y-3">
                {HISTORIAN_FAQS.map((faq, i) => {
                  const isOpen = expandedFaq === i;
                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden transition-all"
                    >
                      <button
                        onClick={() => setExpandedFaq(isOpen ? null : i)}
                        className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                      >
                        <span className="text-sm font-bold text-white">{faq.q}</span>
                        <ChevronRight
                          size={16}
                          className={`text-white/40 transition-transform ${isOpen ? 'rotate-90 text-[#D0BCFF]' : ''}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-5 text-xs text-white/70 leading-relaxed border-t border-white/5 pt-3">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaleoFilmCurator;
