import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  FlaskConical, Atom, BookOpen, GraduationCap, MessageCircle,
  TrendingUp, Newspaper, Globe, Microscope, Calculator,
  Cpu, Leaf, Star, ChevronRight, Search, Users, Brain,
  Binary, Dna, Network, Gauge, Telescope, ExternalLink, Radio,
  Landmark, Building2,
} from 'lucide-react';
import { UserProfile, AppView } from '../types';
import { SCIENCE_STREAMS, SCIENCE_CATEGORIES, ScienceCategory, ScienceStream } from './scienceStreams';
import LabsDisciplineView from './LabsDisciplineView';
import LabsNotebook from './LabsNotebook';
import LabsCitationManager from './LabsCitationManager';
import LabsFormulaEditor from './LabsFormulaEditor';
import LabsGrantTracker from './LabsGrantTracker';
import LabsTeamSpaces from './LabsTeamSpaces';
import type { LabsDisciplineId } from '../services/labsApiService';

interface PlajahLabsViewProps {
  currentUser: UserProfile | null;
  onNavigate: (view: AppView) => void;
  onVisitUser?: (uid: string) => void;
}

const DISCIPLINES = [
  { id: 'physics',     label: 'Physics',          icon: Atom,        color: '#00B4D8', desc: 'Quantum to cosmic' },
  { id: 'chemistry',   label: 'Chemistry',         icon: FlaskConical,color: '#06D6A0', desc: 'Molecules & reactions' },
  { id: 'biology',     label: 'Biology',           icon: Dna,         color: '#40C057', desc: 'Life & organisms' },
  { id: 'cs',          label: 'Computer Science',  icon: Binary,      color: '#748FFC', desc: 'Code & algorithms' },
  { id: 'engineering', label: 'Engineering',       icon: Cpu,         color: '#FFA94D', desc: 'Systems & design' },
  { id: 'mathematics', label: 'Mathematics',       icon: Calculator,  color: '#F06595', desc: 'Numbers & proofs' },
  { id: 'neuroscience',label: 'Neuroscience',      icon: Brain,       color: '#DA77F2', desc: 'Brain & cognition' },
  { id: 'earth',       label: 'Earth Science',     icon: Globe,       color: '#4CAF50', desc: 'Geology & climate' },
  { id: 'astronomy',   label: 'Astronomy',         icon: Telescope,   color: '#9775FA', desc: 'Stars & galaxies' },
  { id: 'data',        label: 'Data Science',      icon: TrendingUp,  color: '#63E6BE', desc: 'ML & analytics' },
  { id: 'environment', label: 'Environment',       icon: Leaf,        color: '#8BCE89', desc: 'Ecology & climate' },
  { id: 'networks',    label: 'Networks',          icon: Network,     color: '#74C0FC', desc: 'Systems & protocols' },
  { id: 'history',     label: 'World History',     icon: Landmark,    color: '#E8590C', desc: 'Civilizations & eras' },
  { id: 'architecture',label: 'Architecture',      icon: Building2,   color: '#B08968', desc: 'The built environment' },
];

const PLATFORM_CONNECTIONS = [
  { id: 'BOOKS' as AppView,      icon: BookOpen,      label: 'Science Bookshelf',   desc: 'Textbooks, papers & journals',    color: '#D2691E' },
  { id: 'CLASSROOMS' as AppView, icon: GraduationCap, label: 'Plajah Academia',     desc: 'Expert-led courses & tutorials',  color: '#1DB954' },
  { id: 'DISCUSSION' as AppView, icon: MessageCircle, label: 'Academic Forums',     desc: 'Peer review & open discussion',   color: '#748FFC' },
  { id: 'ARTICLES' as AppView,   icon: Newspaper,     label: 'Research Articles',   desc: 'Papers, preprints & discoveries', color: '#00B4D8' },
];

const TOOLS = [
  {
    title: 'Research Hub',
    desc: 'Access peer-reviewed papers, journals, and academic articles. Annotate, share, and discuss findings with the community.',
    icon: Microscope,
    color: '#00B4D8',
    navigate: 'ARTICLES' as AppView,
    cta: 'Browse Research',
  },
  {
    title: 'Plajah Academia',
    desc: 'Learn from engineers, scientists, and academics. From beginner courses to advanced postgraduate material.',
    icon: GraduationCap,
    color: '#1DB954',
    navigate: 'CLASSROOMS' as AppView,
    cta: 'Find Courses',
  },
  {
    title: 'Peer Discussion',
    desc: 'Connect with a global community of researchers and engineers. Ask questions, review work, and collaborate openly.',
    icon: Users,
    color: '#748FFC',
    navigate: 'DISCUSSION' as AppView,
    cta: 'Join Forums',
  },
];

const DISC_ID_MAP: Record<string, LabsDisciplineId> = {
  astronomy: 'astronomy', physics: 'physics', chemistry: 'chemistry',
  biology: 'biology', cs: 'cs', engineering: 'engineering',
  mathematics: 'mathematics', neuroscience: 'neuroscience', earth: 'earth',
  data: 'data', environment: 'environment', medicine: 'medicine',
  networks: 'networks', archaeology: 'archaeology', linguistics: 'linguistics',
  history: 'history', architecture: 'architecture',
};

const PlajahLabsView: React.FC<PlajahLabsViewProps> = ({ currentUser, onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDisc, setActiveDisc] = useState<string | null>(null);
  const [activeLivesCat, setActiveLivesCat] = useState<ScienceCategory | 'ALL'>('ALL');
  const [fullScreenStream, setFullScreenStream] = useState<ScienceStream | null>(null);
  const [openDiscipline, setOpenDiscipline] = useState<LabsDisciplineId | null>(null);
  type LabsTool = 'notebook' | 'citations' | 'formula' | 'grants' | 'teams' | null;
  const [openTool, setOpenTool] = useState<LabsTool>(null);

  // Discipline view
  if (openDiscipline) {
    return (
      <LabsDisciplineView
        disciplineId={openDiscipline}
        onBack={() => setOpenDiscipline(null)}
        currentUser={currentUser}
      />
    );
  }

  // Lab tool views
  if (openTool === 'notebook')  return <LabsNotebook currentUser={currentUser} context="labs" storageKeyOverride={`labsNotebook_${currentUser?.uid ?? 'guest'}`} onBack={() => setOpenTool(null)} />;
  if (openTool === 'citations') return <LabsCitationManager currentUser={currentUser} onBack={() => setOpenTool(null)} />;
  if (openTool === 'formula')   return <LabsFormulaEditor currentUser={currentUser} onBack={() => setOpenTool(null)} />;
  if (openTool === 'grants')    return <LabsGrantTracker currentUser={currentUser} onBack={() => setOpenTool(null)} />;
  if (openTool === 'teams')     return <LabsTeamSpaces currentUser={currentUser} onBack={() => setOpenTool(null)} />;

  return (
    <div className="min-h-screen text-white">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-60px] left-[10%] w-[500px] h-[500px] bg-[#00B4D8]/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-80px] right-[5%] w-[400px] h-[400px] bg-[#0077B6]/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative px-6 pt-10 pb-8 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00B4D8]/10 border border-[#00B4D8]/25 mb-6"
          >
            <FlaskConical size={11} className="text-[#00B4D8]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-[#00B4D8]">Plajah Labs</span>
            <span className="px-1.5 py-0.5 bg-[#00B4D8]/20 rounded-full text-[7px] font-black uppercase text-[#00B4D8]">Beta</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07 }}
            className="text-5xl lg:text-[7rem] font-black uppercase tracking-tighter leading-[0.85] mb-5"
          >
            <span className="text-white">Plajah</span>{' '}
            <span className="bg-gradient-to-r from-[#00B4D8] to-[#90E0EF] bg-clip-text text-transparent">Labs</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.13 }}
            className="text-white/45 max-w-2xl text-sm lg:text-base leading-relaxed mb-8"
          >
            A dedicated landing board for the scientific, engineering, and academic communities.
            Discover research, connect with peers, explore STEM content, and build on the shoulders of giants.
          </motion.p>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-8 mb-8">
            {[
              { label: 'Research Threads', value: '2.4K+' },
              { label: 'STEM Classrooms',  value: '340+'  },
              { label: 'Science Books',    value: '1.8K+' },
              { label: 'Researchers',      value: '12K+'  },
            ].map(s => (
              <div key={s.label}>
                <p className="text-2xl lg:text-3xl font-black" style={{ color: '#00B4D8' }}>{s.value}</p>
                <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative max-w-xl">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              type="text"
              placeholder="Search research, papers, courses, disciplines…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00B4D8]/35 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* ── Connected Resources ──────────────────────────────────────────── */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">Connected Resources</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PLATFORM_CONNECTIONS.map(conn => {
            const Icon = conn.icon;
            return (
              <button
                key={conn.id}
                onClick={() => onNavigate(conn.id)}
                className="group p-4 bg-white/[0.04] border border-white/8 rounded-2xl text-left hover:border-white/18 hover:bg-white/[0.06] transition-all"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${conn.color}18`, border: `1px solid ${conn.color}30` }}
                >
                  <Icon size={16} style={{ color: conn.color }} />
                </div>
                <p className="text-xs font-black text-white mb-0.5">{conn.label}</p>
                <p className="text-[10px] text-white/30 leading-tight">{conn.desc}</p>
                <ChevronRight size={11} className="mt-2 text-white/20 group-hover:text-white/45 group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Science Live Hub ─────────────────────────────────────────────── */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <Radio size={14} className="text-[#00B4D8]" />
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Science Live Hub</p>
          <div className="h-px flex-1 bg-white/5" />
          <button
            onClick={() => onNavigate('LIVE_HUB' as AppView)}
            className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-[#00B4D8] hover:opacity-70 transition-opacity"
          >
            See all <ChevronRight size={10} />
          </button>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setActiveLivesCat('ALL')}
            className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${activeLivesCat === 'ALL' ? 'bg-[#00B4D8] text-white' : 'bg-white/5 text-white/30 hover:text-white border border-white/8'}`}
          >
            All
          </button>
          {SCIENCE_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveLivesCat(cat.id)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${activeLivesCat === cat.id ? 'text-white' : 'bg-white/5 text-white/30 hover:text-white border border-white/8'}`}
              style={activeLivesCat === cat.id ? { backgroundColor: cat.accent } : {}}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {/* Stream cards — horizontal scroll row */}
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {SCIENCE_STREAMS
            .filter(s => activeLivesCat === 'ALL' || s.category === activeLivesCat)
            .map(stream => (
              <div
                key={stream.id}
                onClick={() => {
                  if (stream.isEmbeddable) {
                    setFullScreenStream(stream);
                  } else {
                    window.open(stream.directUrl, '_blank', 'noopener');
                  }
                }}
                className="group flex-shrink-0 w-64 bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden cursor-pointer hover:border-white/18 hover:bg-white/[0.06] transition-all"
              >
                {/* Color swatch / preview placeholder */}
                <div className="relative h-36 flex items-center justify-center"
                     style={{ background: `linear-gradient(135deg, ${stream.accent}25, ${stream.accent}08)` }}>
                  <span className="text-4xl">{stream.emoji}</span>
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[7px] font-black uppercase text-white"
                       style={{ backgroundColor: stream.isLive ? '#dc2626' : `${stream.accent}cc` }}>
                    {stream.isLive && <span className="w-1 h-1 rounded-full bg-white animate-ping mr-0.5" />}
                    {stream.isLive ? 'Live 24/7' : 'Event'}
                  </div>
                  {!stream.isEmbeddable && (
                    <div className="absolute top-2 right-2 p-1 bg-black/40 rounded-full">
                      <ExternalLink size={10} className="text-white/50" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[7px] font-black uppercase tracking-widest mb-0.5" style={{ color: stream.accent }}>{stream.source}</p>
                  <p className="text-[11px] font-black text-white leading-tight mb-1">{stream.title}</p>
                  <p className="text-[9px] text-white/30 leading-relaxed line-clamp-2">{stream.description}</p>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Fullscreen stream overlay */}
      {fullScreenStream && (
        <div className="fixed inset-0 z-[500] bg-black flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur border-b border-white/8 shrink-0">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-[#00B4D8]">{fullScreenStream.source}</p>
              <p className="text-sm font-black text-white">{fullScreenStream.title}</p>
            </div>
            <div className="flex items-center gap-3">
              <a href={fullScreenStream.directUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-white/8 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-colors">
                <ExternalLink size={11} /> Open Source
              </a>
              <button onClick={() => setFullScreenStream(null)}
                className="p-2 bg-white/8 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                ✕
              </button>
            </div>
          </div>
          <div className="flex-1">
            <iframe
              src={fullScreenStream.embedUrl}
              className="w-full h-full border-none"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* ── Disciplines grid ─────────────────────────────────────────────── */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">Explore Disciplines</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {DISCIPLINES.map(disc => {
            const Icon = disc.icon;
            const isActive = activeDisc === disc.id;
            const mappedId = DISC_ID_MAP[disc.id];
            return (
              <button
                key={disc.id}
                onClick={() => mappedId ? setOpenDiscipline(mappedId) : setActiveDisc(isActive ? null : disc.id)}
                className="group p-3 rounded-xl text-center border transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: isActive ? `${disc.color}12` : 'rgba(255,255,255,0.025)',
                  borderColor: isActive ? `${disc.color}40` : 'rgba(255,255,255,0.06)',
                }}
              >
                <Icon size={20} className="mx-auto mb-2" style={{ color: disc.color }} />
                <p className="text-[9px] font-black text-white uppercase tracking-wide leading-tight">{disc.label}</p>
                <p className="text-[8px] text-white/22 mt-0.5 hidden sm:block">{disc.desc}</p>
                {mappedId && (
                  <p className="text-[7px] text-white/15 mt-1 hidden sm:block uppercase tracking-widest">Explore →</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Labs Toolkit ─────────────────────────────────────────────────── */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">Labs Toolkit</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <motion.div
                key={tool.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => onNavigate(tool.navigate)}
                className="p-6 rounded-[1.5rem] border border-white/8 bg-white/[0.04] hover:border-white/16 hover:bg-white/[0.06] transition-all group cursor-pointer"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `${tool.color}14`, border: `1px solid ${tool.color}25` }}
                >
                  <Icon size={22} style={{ color: tool.color }} />
                </div>
                <h3 className="text-base font-black text-white mb-2">{tool.title}</h3>
                <p className="text-xs text-white/35 leading-relaxed mb-5">{tool.desc}</p>
                <div
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all group-hover:gap-3"
                  style={{ color: tool.color }}
                >
                  {tool.cta}
                  <ChevronRight size={11} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Research Manifesto CTA — admin only ─────────────────────────── */}
      {(currentUser?.role === 'admin' || currentUser?.email === 'kmoody2003@gmail.com') && (
      <div className="px-6 pb-8 max-w-7xl mx-auto">
        <div
          className="group p-6 lg:p-8 rounded-[2rem] border border-[#3DFFC0]/15 cursor-pointer hover:border-[#3DFFC0]/30 transition-all bg-gradient-to-br from-[#3DFFC0]/4 to-transparent"
          onClick={() => onNavigate('RESEARCH_MANIFESTO' as any)}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#3DFFC0] mb-2">Plajah Platform Strategy · Research Layer</p>
              <h3 className="text-xl lg:text-2xl font-black text-white mb-2 leading-tight">
                What researchers can do on Plajah<br />
                <span className="text-[#3DFFC0] italic">that they can't do anywhere else.</span>
              </h3>
              <p className="text-xs text-white/35 leading-relaxed max-w-xl">
                5-section deep dive: the platform transformation, 12 research superpowers, real researcher scenarios, codebase integration hooks, and a head-to-head comparison with every major platform.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['The Transformation', '12 Superpowers', 'Real Scenarios', 'Codebase Hooks', 'Why Nowhere Else'].map(s => (
                  <span key={s} className="px-2.5 py-1 bg-[#3DFFC0]/8 border border-[#3DFFC0]/15 rounded-full text-[8px] font-black uppercase tracking-widest text-[#3DFFC0]/70">{s}</span>
                ))}
              </div>
            </div>
            <ChevronRight size={22} className="text-[#3DFFC0]/40 group-hover:text-[#3DFFC0] group-hover:translate-x-1 transition-all shrink-0 mt-1" />
          </div>
        </div>
      </div>
      )}

      {/* ── Labs Researcher Toolkit — live tools ─────────────────────────── */}
      <div className="px-6 pb-16 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <FlaskConical size={14} className="text-[#00B4D8]" />
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Researcher Toolkit</p>
          <div className="h-px flex-1 bg-white/5" />
          <span className="px-2 py-0.5 bg-[#34d399]/15 text-[#34d399] border border-[#34d399]/25 rounded-full text-[7px] font-black uppercase tracking-widest">All Live</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              key: 'notebook' as const,
              icon: BookOpen,
              color: '#60a5fa',
              label: 'Lab Notebook',
              sublabel: 'Notes · Experiments · Hypotheses · Data',
              desc: 'A personal research journal. Write structured experiment logs with hypothesis, method, results, and conclusion. Tag by discipline. Export to markdown.',
              badge: 'New',
            },
            {
              key: 'citations' as const,
              icon: Star,
              color: '#fbbf24',
              label: 'Citation Manager',
              sublabel: 'DOI · arXiv · BibTeX · APA · MLA',
              desc: 'Paste a DOI or arXiv ID — we auto-import the full reference. Export your library in BibTeX, APA, MLA, or Chicago with one click.',
              badge: 'New',
            },
            {
              key: 'formula' as const,
              icon: Calculator,
              color: '#a78bfa',
              label: 'Formula Editor',
              sublabel: 'LaTeX · KaTeX · 60+ symbols',
              desc: 'Write LaTeX formulas with a live KaTeX preview. Choose from 60+ symbols, Greek letters, and templates. Copy as inline or display format.',
              badge: 'New',
            },
            {
              key: 'grants' as const,
              icon: TrendingUp,
              color: '#34d399',
              label: 'Grant Tracker',
              sublabel: 'Deadlines · Pipeline · Success rate',
              desc: 'Track every grant application through the full pipeline — Drafting → Submitted → Under Review → Awarded. Deadline alerts, funding totals, success rate.',
              badge: 'New',
            },
            {
              key: 'teams' as const,
              icon: Users,
              color: '#06D6A0',
              label: 'Lab Team Spaces',
              sublabel: 'Shared boards · Invite codes · Posts',
              desc: 'Create a collaborative workspace for your research group. Share findings, pin important updates, and invite collaborators via a 6-character code.',
              badge: 'New',
            },
          ].map(tool => {
            const Icon = tool.icon;
            return (
              <motion.button
                key={tool.key}
                onClick={() => setOpenTool(tool.key)}
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="group p-5 bg-white/[0.04] border border-white/8 rounded-[2rem] text-left hover:border-white/18 hover:bg-white/[0.06] transition-all relative overflow-hidden"
              >
                {/* Background glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-[2rem]"
                  style={{ background: `radial-gradient(ellipse at 20% 30%, ${tool.color}10 0%, transparent 60%)` }} />

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${tool.color}15`, border: `1px solid ${tool.color}25` }}>
                      <Icon size={20} style={{ color: tool.color }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest" style={{ background: `${tool.color}15`, color: tool.color }}>{tool.badge}</span>
                      <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>

                  <p className="text-base font-black text-white mb-0.5">{tool.label}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-3" style={{ color: tool.color }}>{tool.sublabel}</p>
                  <p className="text-[10px] text-white/35 leading-relaxed">{tool.desc}</p>
                </div>
              </motion.button>
            );
          })}

          {/* Data Visualizer card — opens discipline view */}
          <motion.button
            onClick={() => setOpenDiscipline('earth')}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="group p-5 bg-white/[0.04] border border-white/8 rounded-[2rem] text-left hover:border-white/18 hover:bg-white/[0.06] transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-[2rem]"
              style={{ background: 'radial-gradient(ellipse at 20% 30%, rgba(76,175,80,0.08) 0%, transparent 60%)' }} />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#4CAF50]/15 border border-[#4CAF50]/25">
                  <Globe size={20} className="text-[#4CAF50]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="relative flex w-1.5 h-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" /><span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" /></span>
                  <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
              <p className="text-base font-black text-white mb-0.5">Data Visualizer</p>
              <p className="text-[8px] font-black uppercase tracking-widest mb-3 text-[#4CAF50]">Maps · Charts · Live Feeds</p>
              <p className="text-[10px] text-white/35 leading-relaxed">Live earthquake maps, arXiv submission trends, NASA NEO data, and more — one per discipline. All shareable to the Plajah feed.</p>
            </div>
          </motion.button>
        </div>

        {/* arXiv + OpenStax live call-out */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white/[0.02] border border-white/6 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#B31B1B]/10 border border-[#B31B1B]/20 flex items-center justify-center shrink-0 text-base">📄</div>
            <div>
              <p className="text-xs font-black text-white">arXiv Integration — Live</p>
              <p className="text-[9px] text-white/35 mt-0.5">Search and read the latest preprints across 15 disciplines. New papers every day, directly in Plajah Labs.</p>
            </div>
            <button onClick={() => setOpenDiscipline('physics')} className="shrink-0 flex items-center gap-1 px-3 py-2 bg-[#B31B1B]/15 border border-[#B31B1B]/25 rounded-xl text-[8px] font-black text-white/60 hover:text-white transition-all uppercase">Browse <ChevronRight size={9} /></button>
          </div>
          <div className="p-4 bg-white/[0.02] border border-white/6 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#6D9700]/10 border border-[#6D9700]/20 flex items-center justify-center shrink-0 text-base">📚</div>
            <div>
              <p className="text-xs font-black text-white">OpenStax Textbooks — Native Reader</p>
              <p className="text-[9px] text-white/35 mt-0.5">14 peer-reviewed open-access textbooks. Read in Plajah's e-reader — notes, bookmarks, text-to-speech, all included.</p>
            </div>
            <button onClick={() => setOpenDiscipline('biology')} className="shrink-0 flex items-center gap-1 px-3 py-2 bg-[#6D9700]/15 border border-[#6D9700]/25 rounded-xl text-[8px] font-black text-white/60 hover:text-white transition-all uppercase">Read <ChevronRight size={9} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlajahLabsView;
