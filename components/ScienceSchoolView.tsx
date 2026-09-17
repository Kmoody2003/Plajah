/**
 * ScienceSchoolView — The Science & Discovery Discipline Landing Page.
 *
 * Provides a dedicated, rich academic home for Natural Sciences, Physics, Chemistry,
 * Biology, Astronomy, Earth Science, and interactive 3D simulations.
 *
 * Resolves the issue where clicking Science thumbnails or 3D modules (Human Body,
 * Solar System, Plant Biology) went to wrong pages or straight into uncontextualized leaf tools.
 *
 * Features:
 *  - "My Science Desk": Top apron featuring the student's active science coursework,
 *    lab reports due, and completed NGSS standards.
 *  - Interactive 3D Simulations: Direct one-tap launch into The Human Body (3D anatomy),
 *    The Solar System (orbital mechanics), and Plant Biology (botanical studio).
 *  - Core Disciplines & Subtopics: Biology, Chemistry, Physics, Earth & Space Sciences.
 *  - Quests & Lab Studios: Science Quest (NGSS practices) and 12 Museion scientific disciplines.
 *  - Touch-First Mobile: Horizontal snap-carousels, prominent 3D preview cards, and bottom quick-action bar.
 */
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, FlaskConical, Sparkles, BookOpen, Trophy, Zap, Clock,
  ChevronRight, CheckCircle2, ShieldCheck, Play, Award, Layers,
  Compass, Eye, Globe, Atom, Orbit, Dna, Leaf, HeartPulse
} from 'lucide-react';
import { fetchStudentDueWork, type DueItem } from '../services/assignmentTemplateService';

interface Props {
  onBack: () => void;
  onNavigate: (view: string) => void;
  onOpenModule?: (moduleUrl: string) => void;
  user?: any;
  profile?: any;
}

type Tab = '3D_MODULES' | 'DISCIPLINES' | 'QUESTS' | 'TEXTBOOKS';

interface ScienceDiscipline {
  id: string;
  title: string;
  blurb: string;
  badge: string;
  accent: string;
  icon: any;
  topics: { name: string; desc: string; standard?: string }[];
}

const DISCIPLINES: ScienceDiscipline[] = [
  {
    id: 'biology',
    title: 'Biology & Life Sciences',
    blurb: 'The living world: cellular engines, DNA, genetics, physiology, evolutionary biology, and ecological balance.',
    badge: 'Life Sciences',
    accent: '#06D6A0',
    icon: Dna,
    topics: [
      { name: 'Cellular Architecture & Mitosis', desc: 'Organelles, membrane transport, ATP energy cycle, and cellular division.' },
      { name: 'Genetics, DNA & Heredity', desc: 'Mendelian inheritance, transcription, translation, and genetic variation.' },
      { name: 'Human Anatomy & Organ Systems', desc: 'Circulatory, respiratory, nervous, digestive, muscular, and skeletal systems.' },
      { name: 'Ecology & Nutrient Cycles', desc: 'Trophic cascades, carbon and nitrogen cycles, and biomes.' },
    ],
  },
  {
    id: 'chemistry',
    title: 'Chemistry & Molecular Matter',
    blurb: 'The molecular building blocks: atomic structure, periodic trends, chemical bonds, thermodynamics, and reactions.',
    badge: 'Physical Sciences',
    accent: '#8B5CF6',
    icon: Atom,
    topics: [
      { name: 'Atomic Structure & Periodic Trends', desc: 'Protons, neutrons, electrons, orbitals, ionization energy, and electronegativity.' },
      { name: 'Chemical Bonds & Intermolecular Forces', desc: 'Ionic, covalent, metallic bonding, polar molecules, and hydrogen bonds.' },
      { name: 'Stoichiometry & Reaction Kinetics', desc: 'Balancing chemical equations, the mole concept, limiting reactants, and rates.' },
      { name: 'Acids, Bases & Equilibrium', desc: 'pH scales, Le Chatelier’s principle, buffer systems, and titrations.' },
    ],
  },
  {
    id: 'physics',
    title: 'Physics, Energy & Mechanics',
    blurb: 'The universal laws of reality: Newtonian mechanics, electromagnetism, wave optics, thermodynamics, and relativity.',
    badge: 'Physics',
    accent: '#3B82F6',
    icon: Zap,
    topics: [
      { name: 'Kinematics & Newton’s Laws of Motion', desc: 'Velocity, acceleration, vectors, gravity, normal force, and friction.' },
      { name: 'Work, Energy & Conservation Laws', desc: 'Kinetic vs potential energy, work-energy theorem, and momentum collisions.' },
      { name: 'Electricity & Magnetism', desc: 'Coulomb’s law, electric circuits, magnetic flux, and induction.' },
      { name: 'Waves, Sound & Light', desc: 'Wave interference, Doppler effect, refraction, diffraction, and electromagnetic spectrum.' },
    ],
  },
  {
    id: 'space',
    title: 'Astronomy & Earth Systems',
    blurb: 'The cosmos and our planet: stellar nucleosynthesis, planetary formation, plate tectonics, climate systems, and deep time.',
    badge: 'Earth & Space',
    accent: '#00DAF3',
    icon: Orbit,
    topics: [
      { name: 'The Solar System & Kepler’s Laws', desc: 'Planetary orbits, gravitational tides, moons, asteroids, and orbital mechanics.' },
      { name: 'Stellar Evolution & Black Holes', desc: 'From nebulae to main sequence stars, supernovae, neutron stars, and event horizons.' },
      { name: 'Plate Tectonics & Earth Geology', desc: 'Continental drift, fault lines, volcanic systems, and the rock cycle.' },
      { name: 'Atmospheric Systems & Climate Science', desc: 'Greenhouse effect, ocean currents, tropospheric circulation, and climate models.' },
    ],
  },
];

const MODULES_3D = [
  {
    id: 'human-body',
    title: 'The Human Body Experience',
    subtitle: 'Interactive 3D Anatomy Scanner',
    desc: 'Explore all 7 major anatomical systems in medically accurate 3D: cardiovascular, skeletal, muscular, nervous, respiratory, digestive, and lymphatic.',
    accent: '#8B5CF6',
    badge: '3D Simulation',
    icon: HeartPulse,
    route: 'HUMAN_BODY',
  },
  {
    id: 'solar-system',
    title: 'The Solar System Explorer',
    subtitle: 'Orbital Mechanics & Planetary Physics',
    desc: 'Fly through an accurate physical simulation of our planetary neighborhood. Inspect planetary axes, orbital periods, moons, and NASA probe trajectories.',
    accent: '#3B82F6',
    badge: 'Physics Sandbox',
    icon: Orbit,
    route: 'SOLAR_SYSTEM',
  },
  {
    id: 'plant-biology',
    title: 'Plant Biology & Botany Studio',
    subtitle: 'Cellular Engines & Photosynthesis',
    desc: 'Microscopic and macro exploration of plant cellular engines, chloroplasts, stomata gas exchange, and botanical taxonomy.',
    accent: '#06D6A0',
    badge: 'Botany Studio',
    icon: Leaf,
    route: 'PLANT_BIOLOGY',
  },
  {
    id: 'combat-atlas',
    title: 'Combat Atlas: Biomechanics',
    subtitle: 'Real Motion Capture Physics',
    desc: 'High-speed motion capture museum examining kinetic energy transfer, center of mass, angular velocity, and human biomechanics.',
    accent: '#D40055',
    badge: 'Biomechanics Museum',
    icon: Zap,
    route: 'PLAJAH_LABS',
  },
];

const SCIENCE_QUESTS = [
  {
    id: 'science-quest-ngss',
    title: 'Science Quest (NGSS Cartridge)',
    desc: 'Gamified exploration through Next Generation Science Standards: form hypotheses, collect empirical evidence, and model systems.',
    accent: '#8B5CF6',
    emoji: '🧪',
    route: 'SCIENCE_QUEST',
    points: '150 pts',
  },
  {
    id: 'anatomy-quiz',
    title: 'Cardiovascular 3D Circuit Run',
    desc: 'Trace a red blood cell from the right atrium through the pulmonary circuit and systemic capillaries in 3D.',
    accent: '#D40055',
    emoji: '🫀',
    route: 'HUMAN_BODY',
    points: '120 pts',
  },
  {
    id: 'orbit-challenge',
    title: 'Hohmann Transfer Orbit Sim',
    desc: 'Calculate the delta-v and launch window required to send a probe from Earth orbit to Mars rendezvous.',
    accent: '#3B82F6',
    emoji: '🚀',
    route: 'SOLAR_SYSTEM',
    points: '180 pts',
  },
  {
    id: 'science-studios',
    title: '12 Museion Discipline Studios',
    desc: 'Hands-on laboratory simulations across biochemistry, geology, fluid dynamics, and thermodynamics.',
    accent: '#00DAF3',
    emoji: '🔬',
    route: 'PLAJAH_LABS',
    points: '200 pts',
  },
];

const ScienceSchoolView: React.FC<Props> = ({ onBack, onNavigate, onOpenModule, user, profile }) => {
  const [tab, setTab] = useState<Tab>('3D_MODULES');
  const [dueItems, setDueItems] = useState<DueItem[]>([]);

  useEffect(() => {
    if (user?.uid) {
      fetchStudentDueWork(user.uid)
        .then(items => setDueItems(items.filter(i => i.title.toLowerCase().includes('science') || i.title.toLowerCase().includes('lab'))))
        .catch(() => {});
    }
  }, [user?.uid]);

  const launchModule = (route: string) => {
    if (onOpenModule && (route === 'HUMAN_BODY' || route === 'SOLAR_SYSTEM' || route === 'PLANT_BIOLOGY')) {
      onOpenModule(route);
    } else {
      onNavigate(route);
    }
  };

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-24 selection:bg-[#06D6A0]/30">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Back Nav & School Badge */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all min-h-[44px]"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#06D6A0]/30 bg-[#06D6A0]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#34D399]">
              <FlaskConical size={13} /> Science & Discovery
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              NGSS Aligned · 3D Simulations
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(6,214,160,0.20) 0%, rgba(10,61,48,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#34D399] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>Discipline Center</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Science & Discovery
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              Explore the natural laws that shape our universe. Step into real-time 3D anatomical simulations,
              orbital celestial mechanics, botanical biology, and Next Generation Science Standards.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => launchModule('HUMAN_BODY')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#06D6A0] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-[#04231b] shadow-[0_0_30px_rgba(6,214,160,0.4)] hover:bg-[#10e2ac] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px]"
              >
                <Eye size={18} /> Launch 3D Anatomy Scanner ▶
              </button>
              <button
                onClick={() => setTab('3D_MODULES')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all min-h-[48px]"
              >
                <Orbit size={16} /> View All 3D Simulations
              </button>
            </div>
          </div>

          <div
            aria-hidden
            className="absolute -right-12 -bottom-16 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-30"
            style={{ background: 'radial-gradient(circle, #06D6A0, transparent)' }}
          />
        </div>

        {/* ── [MY DESK]: Personalized Signed-In Context ─────────────────────── */}
        <section className="mb-8" aria-label="My Science Desk">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#06D6A0]/20 border border-[#06D6A0]/40 flex items-center justify-center text-[#34D399]">
                  <Award size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">My Science Desk</h2>
                  <p className="text-xs text-white/50">Your active lab reports, experiments & assignments</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white/40">Standards:</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#06D6A0]/40 bg-[#06D6A0]/10 text-[#34D399]">
                  NGSS Science Practices
                </span>
              </div>
            </div>

            {/* Context Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Active Lab Assignment */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Active Lab Work</span>
                    <span className="text-[#06D6A0] uppercase font-black tracking-wider">
                      {dueItems.length > 0 ? `${dueItems.length} Due` : 'Ready to Explore'}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white truncate">
                    {dueItems.length > 0 ? dueItems[0].title : 'Lab 4: Cardiovascular Flow Model'}
                  </h3>
                  <p className="text-xs text-white/60 mt-1 line-clamp-2">
                    {dueItems.length > 0
                      ? 'Submit your observations and data tables to receive teacher feedback.'
                      : 'Explore systolic pressure and cardiac output in the 3D heart model.'}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Life Science Track</span>
                  <button
                    onClick={() => launchModule('HUMAN_BODY')}
                    className="text-xs font-black uppercase tracking-wider text-[#34D399] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Open Lab <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 2: Science Quest */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Featured Quest</span>
                    <span className="text-[#8B5CF6] font-bold">150 XP</span>
                  </div>
                  <h3 className="text-base font-black text-white">Science Quest: NGSS Challenge</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Collect data, construct scientific explanations, and test hypotheses in an interactive simulation.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Est. 20 min</span>
                  <button
                    onClick={() => onNavigate('SCIENCE_QUEST')}
                    className="text-xs font-black uppercase tracking-wider text-[#A78BFA] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Start Quest <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 3: Academic Passport */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Scientific Record</span>
                    <span className="text-[#3B82F6] font-bold">NGSS Evidence</span>
                  </div>
                  <h3 className="text-base font-black text-white">My Academic Passport</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Lab simulations and science quest completions write verifiable competency assertions to your ledger.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Portable Ledger</span>
                  <button
                    onClick={() => onNavigate('LEARNER_LEDGER')}
                    className="text-xs font-black uppercase tracking-wider text-[#60A5FA] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    View Record <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Navigation Tabs (Touch-First Pills) ───────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {[
            { key: '3D_MODULES', label: 'Interactive 3D Simulations', icon: Orbit },
            { key: 'DISCIPLINES', label: 'Science Disciplines', icon: FlaskConical },
            { key: 'QUESTS', label: 'Quests & Laboratories', icon: Zap },
            { key: 'TEXTBOOKS', label: 'Open Textbooks', icon: BookOpen },
          ].map(t => {
            const Icon = t.icon;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as Tab)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all min-h-[48px] ${
                  on
                    ? 'bg-white text-black shadow-lg shadow-white/10 scale-[1.02]'
                    : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white border border-white/10'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: INTERACTIVE 3D MODULES ─────────────────────────────────── */}
        {tab === '3D_MODULES' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Live Interactive Museion Labs</h2>
                <p className="text-xs text-white/50">Real-time WebGL simulations — observe, rotate, and investigate</p>
              </div>
              <span className="text-xs text-white/40 font-mono">4 Live Simulations</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {MODULES_3D.map(mod => {
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                          style={{
                            borderColor: `${mod.accent}55`,
                            backgroundColor: `${mod.accent}15`,
                            color: mod.accent,
                          }}
                        >
                          {mod.badge}
                        </span>
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${mod.accent}20`, color: mod.accent }}
                        >
                          <Icon size={18} />
                        </div>
                      </div>

                      <h3 className="text-xl font-black text-white mb-1">{mod.title}</h3>
                      <p className="text-xs font-bold text-white/50 mb-3">{mod.subtitle}</p>
                      <p className="text-xs text-white/60 leading-relaxed mb-6">{mod.desc}</p>
                    </div>

                    <button
                      onClick={() => launchModule(mod.route)}
                      className="w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 min-h-[48px]"
                      style={{ backgroundColor: mod.accent }}
                    >
                      <Play size={14} fill="currentColor" /> Enter Simulation
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: DISCIPLINES & SUBTOPICS ────────────────────────────────── */}
        {tab === 'DISCIPLINES' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Natural Science Disciplines</h2>
                <p className="text-xs text-white/50">Comprehensive sequences from elementary observation to college mechanics</p>
              </div>
              <span className="text-xs text-white/40 font-mono">4 Major Disciplines</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {DISCIPLINES.map(disc => {
                const Icon = disc.icon;
                return (
                  <div
                    key={disc.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                          style={{
                            borderColor: `${disc.accent}55`,
                            backgroundColor: `${disc.accent}15`,
                            color: disc.accent,
                          }}
                        >
                          {disc.badge}
                        </span>
                        <Icon size={18} style={{ color: disc.accent }} />
                      </div>

                      <h3 className="text-lg font-black text-white mb-2 leading-tight">{disc.title}</h3>
                      <p className="text-xs text-white/60 leading-relaxed mb-5">{disc.blurb}</p>

                      <div className="space-y-2.5 pt-4 border-t border-white/5">
                        {disc.topics.map(topic => (
                          <div key={topic.name} className="group/item">
                            <div className="text-xs font-bold text-white/85 group-hover/item:text-white flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: disc.accent }} />
                              {topic.name}
                            </div>
                            <p className="text-[11px] text-white/45 ml-3 mt-0.5 leading-normal">{topic.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigate('SCIENCE_QUEST')}
                      className="mt-6 w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white/80 hover:text-white transition-all min-h-[44px]"
                    >
                      Explore Science Quest & Lessons →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 3: QUESTS & LABS ──────────────────────────────────────────── */}
        {tab === 'QUESTS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Scientific Quests & Challenges</h2>
                <p className="text-xs text-white/50">Simulated lab experiments, anatomical runs, and orbital missions</p>
              </div>
              <span className="text-xs text-white/40">4 Available Quests</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {SCIENCE_QUESTS.map(quest => (
                <div
                  key={quest.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="text-3xl">{quest.emoji}</span>
                      <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-white/60">
                        {quest.points}
                      </span>
                    </div>

                    <h3 className="text-lg font-black text-white mb-1.5">{quest.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-4">{quest.desc}</p>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-xs text-white/40">Instant Simulation</span>
                    <button
                      onClick={() => launchModule(quest.route)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-black transition-all min-h-[44px]"
                      style={{ backgroundColor: quest.accent }}
                    >
                      Start Quest ▶
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 4: OPEN TEXTBOOKS ─────────────────────────────────────────── */}
        {tab === 'TEXTBOOKS' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider text-white">Peer-Reviewed OpenStax Textbooks</h2>
              <p className="text-xs text-white/50">Full-length, standards-aligned science textbooks available to every learner</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  title: 'Biology 2e (for AP & College)',
                  authors: 'OpenStax · Mary Ann Clark et al.',
                  desc: 'Comprehensive coverage of the chemistry of life, cellular structure, genetics, evolutionary processes, biological diversity, and ecology.',
                  badge: 'AP / College',
                  accent: '#06D6A0',
                },
                {
                  title: 'Chemistry 2e',
                  authors: 'OpenStax · Paul Flowers et al.',
                  desc: 'Atoms, molecules, stoichiometry, chemical reactions, thermochemistry, periodic properties, chemical bonding, and equilibria.',
                  badge: 'General Chemistry',
                  accent: '#8B5CF6',
                },
                {
                  title: 'University Physics (Vol 1–3)',
                  authors: 'OpenStax · Samuel J. Ling et al.',
                  desc: 'Calculus-based physics: mechanics, waves, acoustics, thermodynamics, electricity, magnetism, optics, and modern physics.',
                  badge: 'Calculus-Based Physics',
                  accent: '#3B82F6',
                },
              ].map(book => (
                <div
                  key={book.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:bg-white/[0.05] transition-all"
                >
                  <div>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border mb-3 inline-block"
                      style={{
                        borderColor: `${book.accent}55`,
                        backgroundColor: `${book.accent}15`,
                        color: book.accent,
                      }}
                    >
                      {book.badge}
                    </span>
                    <h3 className="text-lg font-black text-white mb-1">{book.title}</h3>
                    <p className="text-[11px] text-white/40 mb-3">{book.authors}</p>
                    <p className="text-xs text-white/60 leading-relaxed">{book.desc}</p>
                  </div>

                  <button
                    onClick={() => onNavigate('ACADEMIA_COURSES')}
                    className="mt-6 w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white transition-all min-h-[44px]"
                  >
                    Open in Book Reader →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Touch-First Sticky Quick Action Bar ──────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-30 p-3 bg-black/80 backdrop-blur-xl border-t border-white/10 sm:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => launchModule('HUMAN_BODY')}
            className="flex-1 py-3.5 px-4 rounded-2xl bg-[#06D6A0] text-[#04231b] text-xs font-black uppercase tracking-wider text-center shadow-lg shadow-[#06D6A0]/30 flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Eye size={16} /> Open 3D Anatomy Scanner
          </button>
          <button
            onClick={onBack}
            className="px-4 py-3.5 rounded-2xl border border-white/15 bg-white/5 text-white/70 text-xs font-bold min-h-[48px]"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScienceSchoolView;
