import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Brain, ExternalLink, Download, BookOpen,
  Cpu, RefreshCw, ChevronDown, ChevronUp, Search,
  Activity, Globe, Zap, Star, Copy, Check,
  FileText, Database, Package, Users, Clock,
  Telescope, FlaskConical, Dna, Binary, Atom, Calculator,
  AlertCircle, TrendingUp, Microscope, Leaf, MessageSquare,
  Landmark, Building2, Swords,
} from 'lucide-react';
import { motion as m } from 'motion/react';
import {
  LabsDisciplineId, DISCIPLINE_CONFIG, DisciplineData,
  fetchDisciplineData, museExplainPaper,
  ArxivPaper, PubMedPaper, HFModel, NASAApodEntry,
  USGSQuake, CERNRecord, OpenStaxBook, SciencePaper,
  PapersWithCodePaper, OPENSTAX_BOOKS, textbookToAlbum,
} from '../services/labsApiService';
import { Album, Post } from '../types';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';
import { listenToGlobalPosts, createPost, auth } from '../services/backendService';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';
import BookReader from './BookReader';
import { DisciplineVizPanel, SharedVizPayload } from './LabsDataVisualizer';

// ── Discipline metadata ───────────────────────────────────────────────────────

interface DisciplineMeta {
  label: string;
  color: string;
  secondaryColor: string;
  description: string;
  icon: React.ElementType;
  keywords: string[];
}

const DISC_META: Record<LabsDisciplineId, DisciplineMeta> = {
  astronomy:    { label: 'Astronomy',        color: '#9775FA', secondaryColor: '#6B4CDB', description: 'Stars, galaxies, cosmology, and the observable universe', icon: Telescope, keywords: ['astrophysics', 'cosmology', 'exoplanets', 'black holes'] },
  physics:      { label: 'Physics',          color: '#00B4D8', secondaryColor: '#0077B6', description: 'Quantum mechanics, relativity, particle physics, condensed matter', icon: Atom, keywords: ['quantum', 'particle', 'relativity', 'condensed matter'] },
  chemistry:    { label: 'Chemistry',        color: '#06D6A0', secondaryColor: '#04A380', description: 'Molecular reactions, synthesis, materials, and chemical biology', icon: FlaskConical, keywords: ['synthesis', 'molecular', 'reaction', 'organic'] },
  biology:      { label: 'Biology',          color: '#40C057', secondaryColor: '#2F9E44', description: 'Life sciences, genetics, evolution, cell biology, and ecology', icon: Dna, keywords: ['genomics', 'cell', 'evolution', 'ecology'] },
  cs:           { label: 'Computer Science', color: '#748FFC', secondaryColor: '#4C6EF5', description: 'Algorithms, AI, machine learning, systems, and theory of computation', icon: Binary, keywords: ['machine learning', 'LLM', 'algorithms', 'systems'] },
  engineering:  { label: 'Engineering',      color: '#FFA94D', secondaryColor: '#F76707', description: 'Systems design, robotics, signal processing, and control theory', icon: Cpu, keywords: ['systems', 'robotics', 'control', 'signal'] },
  mathematics:  { label: 'Mathematics',      color: '#F06595', secondaryColor: '#E64980', description: 'Pure and applied mathematics — topology, algebra, analysis, number theory', icon: Calculator, keywords: ['topology', 'algebra', 'theorem', 'proof'] },
  neuroscience: { label: 'Neuroscience',     color: '#DA77F2', secondaryColor: '#BE4BDB', description: 'Brain function, cognition, neural circuits, and consciousness', icon: Brain, keywords: ['neural', 'cognition', 'fMRI', 'synapses'] },
  earth:        { label: 'Earth Science',    color: '#4CAF50', secondaryColor: '#2E7D32', description: 'Geology, seismology, climate, and planetary systems', icon: Globe, keywords: ['geology', 'climate', 'seismic', 'tectonic'] },
  data:         { label: 'Data Science',     color: '#63E6BE', secondaryColor: '#20C997', description: 'Statistics, machine learning, analytics, and information science', icon: TrendingUp, keywords: ['statistics', 'inference', 'ML', 'analytics'] },
  environment:  { label: 'Environment',      color: '#8BCE89', secondaryColor: '#51CF66', description: 'Ecology, climate change, conservation, and environmental systems', icon: Leaf, keywords: ['climate', 'ecology', 'conservation', 'atmosphere'] },
  medicine:     { label: 'Medicine',         color: '#FF6B6B', secondaryColor: '#FA5252', description: 'Clinical research, therapeutics, diagnostics, and public health', icon: Microscope, keywords: ['clinical', 'therapeutics', 'diagnosis', 'trial'] },
  networks:     { label: 'Networks',         color: '#74C0FC', secondaryColor: '#339AF0', description: 'Distributed systems, protocols, graph theory, and network science', icon: Zap, keywords: ['protocol', 'distributed', 'graph', 'topology'] },
  archaeology:  { label: 'Archaeology',      color: '#D4A017', secondaryColor: '#A07800', description: 'Human origins, material culture, dating methods, and ancient societies', icon: Globe, keywords: ['excavation', 'dating', 'ancient', 'anthropology'] },
  linguistics:  { label: 'Linguistics',      color: '#94D82D', secondaryColor: '#74B816', description: 'Language structure, semantics, computational linguistics, and NLP', icon: Binary, keywords: ['syntax', 'morphology', 'NLP', 'language'] },
  history:      { label: 'World History',    color: '#E8590C', secondaryColor: '#A63E08', description: 'Civilizations, empires, revolutions, and the forces that shaped the modern world', icon: Landmark, keywords: ['civilization', 'empire', 'revolution', 'ancient'] },
  architecture: { label: 'Architecture',     color: '#B08968', secondaryColor: '#8A6A4F', description: 'Building design, structural engineering, construction, codes, and the built environment', icon: Building2, keywords: ['structural', 'building', 'urbanism', 'construction'] },
  combat:       { label: 'Combat Atlas',     color: '#C1440E', secondaryColor: '#8A2F09', description: 'World martial arts — technique, lineage, iconography, and motion capture', icon: Swords, keywords: ['martial arts', 'wrestling', 'biomechanics', 'lineage'] },
};

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; color: string }> = {
  arxiv:          { label: 'arXiv',          color: '#B31B1B' },
  pubmed:         { label: 'PubMed',         color: '#336699' },
  huggingface:    { label: 'Hugging Face',   color: '#FF9A00' },
  nasa_apod:      { label: 'NASA',           color: '#0B3D91' },
  usgs:           { label: 'USGS',           color: '#1C7D3B' },
  cern:           { label: 'CERN',           color: '#006EAF' },
  paperswithcode: { label: 'Papers w/ Code', color: '#21CBCE' },
  openstax:       { label: 'OpenStax',       color: '#6D9700' },
};

const SourceBadge: React.FC<{ source: string; className?: string }> = ({ source, className = '' }) => {
  const meta = SOURCE_META[source] ?? { label: source, color: '#94a3b8' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${TYPE.labelSm} ${className}`}
      style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}30` }}>
      {meta.label}
    </span>
  );
};

// ── Aria Explain Button + Popover ─────────────────────────────────────────────

const MuseExplain: React.FC<{ title: string; abstract: string; color: string }> = ({ title, abstract, color }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const explain = async () => {
    if (text) { setOpen(v => !v); return; }
    setOpen(true);
    setLoading(true);
    const result = await museExplainPaper(title, abstract);
    setText(result || 'Aria couldn\'t reach the server right now. Try again.');
    setLoading(false);
  };

  return (
    <div className="relative">
      <button onClick={explain}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-[9px] font-black uppercase tracking-widest"
        style={open
          ? { background: `${color}18`, borderColor: `${color}40`, color }
          : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
        {loading ? <RefreshCw size={10} className="animate-spin" /> : <Brain size={10} />}
        Aria
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute z-20 bottom-full mb-2 left-0 w-72 p-4 bg-[#111] border border-white/10 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center shrink-0">
                <Brain size={9} className="text-white" />
              </div>
              <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Aria explains</p>
            </div>
            {loading
              ? <div className="flex items-center gap-2"><RefreshCw size={12} className="text-white/30 animate-spin" /><p className="text-xs text-white/30">Thinking…</p></div>
              : <p className="text-xs text-white/70 leading-relaxed">{text}</p>
            }
            <button onClick={() => setOpen(false)} className="absolute top-2 right-2 text-white/20 hover:text-white/50 transition-colors text-xs">✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Paper Card ────────────────────────────────────────────────────────────────

const PaperCard: React.FC<{
  paper: SciencePaper;
  color: string;
  index: number;
}> = ({ paper, color, index }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const title = 'title' in paper ? paper.title : '';
  const abstract = ('abstract' in paper ? paper.abstract : undefined) ?? '';
  const authors = paper.authors ?? [];
  const source = paper.source;
  const link = (paper as any).link ?? '';

  const dateStr = (() => {
    if (paper.source === 'arxiv') return (paper as ArxivPaper).published;
    if (paper.source === 'pubmed') return (paper as PubMedPaper).publishedDate;
    if (paper.source === 'paperswithcode') return (paper as PapersWithCodePaper).published;
    return '';
  })();

  const displayAuthors = authors.length <= 3
    ? authors.join(', ')
    : `${authors.slice(0, 2).join(', ')} et al.`;

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group relative bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden hover:border-white/16 hover:bg-white/[0.05] transition-all"
    >
      {/* Discipline color left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full" style={{ background: color }} />

      <div className="px-5 py-4 pl-7">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={source} />
            {dateStr && <span className="text-[8px] text-white/20 font-mono">{dateStr}</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={copyLink} className="tap p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-white/30 hover:text-white">
              {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            </button>
            <a href={link} target="_blank" rel="noreferrer"
              className="tap p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-white/30 hover:text-white">
              <ExternalLink size={10} />
            </a>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-white leading-snug mb-1.5 cursor-pointer hover:text-opacity-80 transition-opacity"
          onClick={() => setExpanded(e => !e)}>
          {title}
        </h3>

        {/* Authors */}
        {displayAuthors && (
          <p className="text-[10px] text-white/35 mb-3 font-medium">{displayAuthors}</p>
        )}

        {/* Abstract — collapsed/expanded */}
        {abstract && (
          <div className="mb-3">
            <p className={`text-xs text-white/55 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
              {abstract}
            </p>
            {abstract.length > 200 && (
              <button onClick={() => setExpanded(e => !e)}
                className="mt-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors">
                {expanded ? <><ChevronUp size={9} />Show less</> : <><ChevronDown size={9} />Read more</>}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {abstract && <MuseExplain title={title} abstract={abstract} color={color} />}
          {paper.source === 'arxiv' && (paper as ArxivPaper).pdfLink && (
            <a href={(paper as ArxivPaper).pdfLink} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/20 transition-all">
              <Download size={9} /> PDF
            </a>
          )}
        </div>
      </div>
    </motion.article>
  );
};

// ── Live Data Strip cards ─────────────────────────────────────────────────────

const StatChip: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  color: string;
  live?: boolean;
  sub?: string;
  onClick?: () => void;
}> = ({ label, value, unit, color, live, sub, onClick }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    onClick={onClick}
    className={`flex-shrink-0 p-4 bg-white/[0.04] border border-white/8 rounded-2xl min-w-[120px] sm:min-w-[140px] ${onClick ? 'cursor-pointer hover:border-white/20 transition-all' : ''}`}
  >
    <div className="flex items-center gap-1.5 mb-2">
      {live && (
        <span className="relative flex w-1.5 h-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" />
        </span>
      )}
      <p className={`${TYPE.labelSm} text-white/30`}>{label}</p>
    </div>
    <p className="text-2xl font-black leading-none" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
      {value}{unit && <span className="text-sm ml-1 text-white/30 font-mono">{unit}</span>}
    </p>
    {sub && <p className="text-[9px] text-white/30 mt-1 leading-tight">{sub}</p>}
  </motion.div>
);

// ── APOD Card ─────────────────────────────────────────────────────────────────

const APODCard: React.FC<{ entry: NASAApodEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-shrink-0 w-64 bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden group"
    >
      {entry.media_type === 'image' && entry.url && (
        <a href={entry.hdurl ?? entry.url} target="_blank" rel="noreferrer">
          <div className="relative h-36 overflow-hidden">
            <img src={entry.url} alt={entry.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#0B3D91]/80 text-white text-[7px] font-black rounded-full">NASA APOD</span>
          </div>
        </a>
      )}
      <div className="p-3">
        <p className="text-xs font-bold text-white line-clamp-2 leading-tight mb-1">{entry.title}</p>
        <p className="text-[8px] text-white/30 font-mono mb-2">{entry.date}</p>
        <p className={`text-[10px] text-white/50 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{entry.explanation}</p>
        <button onClick={() => setExpanded(e => !e)} className="text-[8px] text-white/20 hover:text-white/40 transition-colors mt-1">
          {expanded ? 'Less' : 'More'}
        </button>
      </div>
    </motion.div>
  );
};

// ── HF Model Card ─────────────────────────────────────────────────────────────

const ModelCard: React.FC<{ model: HFModel; color: string; index: number }> = ({ model, color, index }) => (
  <motion.a
    href={model.link} target="_blank" rel="noreferrer"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
    className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-2xl hover:border-white/18 hover:bg-white/[0.05] transition-all group"
  >
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base" style={{ background: `${color}15` }}>
      🤗
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-white group-hover:text-opacity-80 truncate leading-snug">{model.modelId}</p>
      <div className="flex items-center gap-3 mt-1">
        {model.task && <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{model.task.replace(/-/g, ' ')}</span>}
        <span className="text-[8px] text-white/20 font-mono">↓ {model.downloads.toLocaleString()}</span>
        {model.likes > 0 && <span className="text-[8px] text-white/20 font-mono">♥ {model.likes.toLocaleString()}</span>}
      </div>
    </div>
    <ExternalLink size={11} className="text-white/20 shrink-0 mt-0.5" />
  </motion.a>
);

// ── Earthquake Row ────────────────────────────────────────────────────────────

const QuakeRow: React.FC<{ quake: USGSQuake; index: number }> = ({ quake, index }) => {
  const mag = quake.magnitude;
  const magColor = mag >= 6 ? '#FF4757' : mag >= 5 ? '#FF6B35' : mag >= 4 ? '#FFA94D' : '#63E6BE';
  return (
    <motion.a href={quake.url} target="_blank" rel="noreferrer"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-all group px-2 rounded-xl">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm" style={{ background: `${magColor}15`, color: magColor }}>
        {mag.toFixed(1)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white/80 truncate">{quake.place}</p>
        <p className="text-[8px] text-white/30 font-mono">{new Date(quake.time).toLocaleString()} · depth {quake.depth.toFixed(1)} km</p>
      </div>
      <ExternalLink size={10} className="text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
    </motion.a>
  );
};

// ── Textbook Card ─────────────────────────────────────────────────────────────

const TextbookCard: React.FC<{
  book: OpenStaxBook;
  color: string;
  index: number;
  onOpen: (book: OpenStaxBook) => void;
}> = ({ book, color, index, onOpen }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
    className="flex items-start gap-4 p-4 bg-white/[0.03] border border-white/8 rounded-2xl hover:border-white/14 hover:bg-white/[0.05] transition-all group"
  >
    {/* Cover */}
    {book.cover ? (
      <img src={book.cover} alt={book.title}
        className="w-14 h-16 object-cover rounded-xl shrink-0 shadow-lg group-hover:shadow-xl transition-shadow" />
    ) : (
      <div className="w-14 h-16 rounded-xl shrink-0 flex items-center justify-center" style={{ background: `${color}18` }}>
        <BookOpen size={20} style={{ color }} />
      </div>
    )}

    {/* Info */}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-white leading-snug mb-1">{book.title}</p>
      <p className="text-[9px] text-white/35 mb-1">{book.authors.join(', ')}</p>
      {book.description && (
        <p className="text-[9px] text-white/25 leading-relaxed line-clamp-2 mb-2">{book.description}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {book.studentsCount && (
          <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">{book.studentsCount} students</span>
        )}
        <span className="text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest"
          style={{ background: '#6D9700' + '20', color: '#6D9700' }}>CC BY</span>
        {book.epubUrl && (
          <span className="text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest"
            style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>EPUB</span>
        )}
        {book.pdfLink && (
          <span className="text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest"
            style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>PDF</span>
        )}
      </div>
    </div>

    {/* Actions */}
    <div className="flex flex-col gap-1.5 shrink-0">
      {/* Primary: open in reader */}
      {(book.epubUrl || book.pdfLink) && (
        <button
          onClick={() => onOpen(book)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white hover:brightness-110 transition-all whitespace-nowrap"
          style={{ background: color }}
        >
          <BookOpen size={10} /> Read
        </button>
      )}
      {/* Secondary: external link */}
      <a href={book.link} target="_blank" rel="noreferrer"
        className="flex items-center gap-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/40 bg-white/5 border border-white/8 hover:text-white hover:border-white/20 transition-all whitespace-nowrap">
        <ExternalLink size={9} /> Web
      </a>
    </div>
  </motion.div>
);

// ── CERN Record Card ──────────────────────────────────────────────────────────

const CERNCard: React.FC<{ record: CERNRecord; index: number }> = ({ record, index }) => (
  <motion.a href={record.link} target="_blank" rel="noreferrer"
    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
    className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-2xl hover:border-white/18 transition-all group">
    <div className="w-8 h-8 rounded-xl bg-[#006EAF]/15 flex items-center justify-center shrink-0 text-sm">⚛️</div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-white/80 leading-snug line-clamp-2">{record.title}</p>
      <div className="flex items-center gap-2 mt-1">
        {record.type && <span className="text-[8px] text-[#006EAF] font-black uppercase">{record.type}</span>}
        {record.year && <span className="text-[8px] text-white/20 font-mono">{record.year}</span>}
      </div>
    </div>
    <ExternalLink size={10} className="text-white/15 group-hover:text-white/40 shrink-0 mt-0.5" />
  </motion.a>
);

// ── Search bar ────────────────────────────────────────────────────────────────

const SearchBar: React.FC<{
  value: string;
  onChange: (v: string) => void;
  color: string;
  onSearch: () => void;
}> = ({ value, onChange, color, onSearch }) => (
  <div className="relative flex-1 max-w-lg">
    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && onSearch()}
      placeholder="Search papers, authors, keywords…"
      className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
      style={{ '--tw-ring-color': color } as any}
    />
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

type ContentTab = 'papers' | 'datasets' | 'models' | 'textbooks' | 'visualize' | 'social' | 'plajah_social';

interface LabsDisciplineViewProps {
  disciplineId: LabsDisciplineId;
  onBack: () => void;
  currentUser?: any;
  /** Embedded inside a parent studio (e.g. ScienceDisciplineView's "Research & Live Data" tab):
   *  drop the full-screen hero/back chrome and render just the search + live data + content tabs. */
  embedded?: boolean;
}

const LabsDisciplineView: React.FC<LabsDisciplineViewProps> = ({ disciplineId, onBack, currentUser, embedded }) => {
  const meta = DISC_META[disciplineId];
  const cfg = DISCIPLINE_CONFIG[disciplineId];
  const Icon = meta.icon as any;

  const [data, setData] = useState<DisciplineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>('papers');
  const [search, setSearch] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<SciencePaper[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedTextbook, setSelectedTextbook] = useState<Album | null>(null);
  const [globalPosts, setGlobalPosts] = useState<Post[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);

  // Open a textbook in the native reader
  const openTextbook = useCallback((book: OpenStaxBook) => {
    setSelectedTextbook(textbookToAlbum(book));
  }, []);

  // Initial data load
  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchDisciplineData(disciplineId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [disciplineId]);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) { setSearchActive(false); return; }
    setSearchActive(true);
    setSearchLoading(true);
    const { searchArxiv } = await import('../services/labsApiService');
    const results = await searchArxiv(search, cfg.arXivCategory, 12);
    setSearchResults(results);
    setSearchLoading(false);
  }, [search, cfg.arXivCategory]);

  const clearSearch = () => { setSearch(''); setSearchActive(false); setSearchResults([]); };

  useEffect(() => {
    if (contentTab !== 'social' && contentTab !== 'plajah_social') return;
    return listenToGlobalPosts(setGlobalPosts);
  }, [contentTab]);

  const displayedPapers = searchActive ? searchResults : (data?.papers ?? []);

  // A discipline's feed is its own dedicated feed — only posts explicitly
  // published to this discipline (tagged with its id by the composer below).
  // We intentionally do NOT keyword-match the global social feed, which pulled
  // in unrelated older posts (e.g. any post mentioning "building").
  const disciplinePosts = globalPosts.filter(p => p.tags?.includes(disciplineId));

  const ALL_CONTENT_TABS: { key: ContentTab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'papers',        label: 'Papers',         icon: FileText,      count: displayedPapers.length },
    { key: 'visualize',     label: 'Visualize',      icon: Activity },
    { key: 'datasets',      label: 'Datasets',       icon: Database,      count: (data?.cernRecords?.length ?? 0) + (data?.quakes?.length ?? 0) },
    { key: 'models',        label: 'Models',         icon: Package,       count: data?.hfModels?.length },
    { key: 'textbooks',     label: 'Textbooks',      icon: BookOpen,      count: data?.textbooks?.length ?? OPENSTAX_BOOKS.filter(b => b.subject === disciplineId).length },
    { key: 'social',        label: meta.label + ' Feed', icon: MessageSquare, count: disciplinePosts.length || undefined },
    { key: 'plajah_social', label: 'Plajah Social',  icon: Globe,         count: globalPosts.length || undefined },
  ];
  const CONTENT_TABS = ALL_CONTENT_TABS.filter(t => {
    if (t.key === 'models' && !cfg.hfTasks?.length) return false;
    return true;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  // Native e-reader — full screen, back returns to discipline view
  if (selectedTextbook) {
    return (
      <BookReader
        book={selectedTextbook}
        onBack={() => setSelectedTextbook(null)}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className={embedded ? 'text-white' : 'min-h-screen text-white'}>

      {/* ── HERO ── */}
      <div className="relative overflow-hidden">
        {/* Background atmospheric glow */}
        {!embedded && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-[120px] opacity-20"
              style={{ background: meta.color }} />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full blur-[100px] opacity-10"
              style={{ background: meta.secondaryColor }} />
          </div>
        )}

        <div className={`relative z-10 max-w-5xl mx-auto ${embedded ? 'px-0 pt-0 pb-4' : 'px-6 pt-8 pb-12'}`}>
          {/* Back + breadcrumb — hidden when embedded (the parent studio owns navigation) */}
          {!embedded && (
            <button onClick={onBack}
              className="flex items-center gap-2 mb-8 text-white/30 hover:text-white transition-colors group">
              <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest">Plajah Labs</span>
            </button>
          )}

          {!embedded && (
            <>
              <div className="flex items-end gap-6 mb-6">
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center shrink-0 shadow-2xl"
                  style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}30` }}>
                  <Icon size={28} style={{ color: meta.color }} />
                </div>
                <div>
                  <p className={`${TYPE.labelSm} tracking-[0.3em] mb-1`} style={{ color: meta.color }}>
                    Plajah Labs · {meta.label}
                  </p>
                  <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight text-white leading-none">
                    {meta.label}
                  </h1>
                </div>
              </div>
              <p className="text-sm text-white/50 leading-relaxed max-w-lg mb-6">{meta.description}</p>
            </>
          )}

          {/* Keywords */}
          <div className="flex flex-wrap gap-2 mb-8">
            {meta.keywords.map(k => (
              <button key={k} onClick={() => { setSearch(k); }}
                className={`tap px-3 py-1 rounded-full ${TYPE.labelSm} transition-all`}
                style={{ background: `${meta.color}12`, color: meta.color, border: `1px solid ${meta.color}25` }}>
                {k}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-3">
            <SearchBar value={search} onChange={setSearch} color={meta.color} onSearch={handleSearch} />
            {searchActive
              ? <button onClick={clearSearch} className="px-4 py-2.5 bg-white/8 border border-white/12 text-white/50 rounded-xl text-xs font-black uppercase hover:text-white transition-all">Clear</button>
              : <button onClick={handleSearch} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase text-black hover:brightness-110 transition-all" style={{ background: meta.color }}>Search</button>
            }
          </div>
        </div>
      </div>

      {/* ── LIVE DATA STRIP ── */}
      {!loading && data && (
        <div className="px-6 pb-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex w-1.5 h-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" />
            </span>
            <p className={`${TYPE.labelSm} text-white/30`}>Live Data</p>
            <span className="text-[8px] text-white/15 font-mono">Updated {new Date(data.fetchedAt).toLocaleTimeString()}</span>
          </div>
          <div ref={stripRef} className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {/* Papers count */}
            <StatChip label="Papers today" value={data.papers.length} color={meta.color} live unit="new" sub={`${cfg.arXivCategory} · arXiv`} />

            {/* NASA */}
            {data.apod && data.apod.length > 0 && (
              <StatChip label="NASA APOD" value={data.apod[0].date} color="#0B3D91" live sub={data.apod[0].title.slice(0, 35) + '…'} />
            )}
            {data.neoCount !== undefined && (
              <StatChip label="Near-Earth Objects" value={data.neoCount} color="#FF4757" live unit="today" sub="Tracked by NASA" />
            )}

            {/* USGS */}
            {data.quakes && data.quakes.length > 0 && (
              <StatChip
                label="Seismic Activity"
                value={data.quakes[0].magnitude.toFixed(1)}
                unit="M"
                color="#FFA94D"
                live
                sub={`${data.quakes.length} quakes tracked · ${data.quakes[0].place.slice(0, 30)}`}
              />
            )}

            {/* HF Models */}
            {data.hfModels && data.hfModels.length > 0 && (
              <StatChip label="Top HF Model" value={data.hfModels[0].downloads.toLocaleString()} unit="↓" color="#FF9A00" sub={data.hfModels[0].modelId.split('/').pop()?.slice(0, 20)} />
            )}

            {/* CERN */}
            {data.cernRecords && data.cernRecords.length > 0 && (
              <StatChip label="CERN Records" value={data.cernRecords.length} color="#006EAF" sub="Open data portal" />
            )}

            {/* Textbooks */}
            <StatChip label="Open Textbooks" value={data.textbooks.length || OPENSTAX_BOOKS.filter(b => b.subject === disciplineId).length} color="#6D9700" sub="Free · CC Licensed" />

            {/* APOD cards in strip */}
            {data.apod?.slice(0, 3).map(entry => (
              <APODCard key={entry.date} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div className="px-6 max-w-5xl mx-auto">
          <AdaptiveGrid phone={2} tablet={2} desktop={4} gap="0.75rem" className="mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-white/[0.04] border border-white/6 rounded-2xl animate-pulse" />
            ))}
          </AdaptiveGrid>
        </div>
      )}

      {/* ── ERROR ── */}
      {error && (
        <div className="px-6 max-w-5xl mx-auto mb-8">
          <div className="flex items-center gap-3 p-4 bg-red-500/8 border border-red-500/20 rounded-2xl">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-black text-white">Couldn't reach some data sources</p>
              <p className="text-[9px] text-white/40">API calls may have timed out. Showing partial results.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENT TABS ── */}
      <div className={`${embedded ? '' : 'sticky top-0'} z-10 bg-[#080808]/90 backdrop-blur-xl border-b border-white/6 ${embedded ? 'px-0' : 'px-6'} rounded-2xl`}>
        <div className={`${embedded ? '' : 'max-w-5xl'} mx-auto flex gap-1 py-2 overflow-x-auto no-scrollbar`}>
          {CONTENT_TABS.map(t => {
            const TIcon = t.icon as any;
            return (
              <button key={t.key} onClick={() => setContentTab(t.key)}
                className={`tap flex items-center gap-2 px-4 py-2.5 rounded-xl ${TYPE.labelSm} whitespace-nowrap transition-all shrink-0 ${contentTab === t.key ? 'text-black' : 'text-white/30 hover:text-white'}`}
                style={contentTab === t.key ? { background: meta.color } : {}}>
                <TIcon size={11} />{t.label}
                {t.count ? <span className={`text-[8px] ${contentTab === t.key ? 'text-black/50' : 'text-white/20'}`}>{t.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONTENT AREA ── */}
      <div className="px-6 py-8 max-w-5xl mx-auto">

        {/* PAPERS */}
        {contentTab === 'papers' && (
          <div>
            {searchActive && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-white/[0.03] border border-white/6 rounded-xl">
                <Search size={12} className="text-white/30" />
                <p className="text-xs text-white/50">
                  {searchLoading ? 'Searching arXiv…' : `${searchResults.length} results for "${search}"`}
                </p>
                {searchLoading && <RefreshCw size={11} className="text-white/30 animate-spin ml-auto" />}
              </div>
            )}

            {(loading || searchLoading) && !displayedPapers.length ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-32 bg-white/[0.03] border border-white/6 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : displayedPapers.length > 0 ? (
              <div className="space-y-3">
                {displayedPapers.map((paper, i) => (
                  <PaperCard key={('id' in paper ? paper.id : '') + i} paper={paper} color={meta.color} index={i} />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <FileText size={32} className="text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No papers loaded</p>
                <p className="text-[10px] text-white/15 mt-1">arXiv may be temporarily unavailable</p>
              </div>
            )}
          </div>
        )}

        {/* VISUALIZE */}
        {contentTab === 'visualize' && (
          <div>
            <div className="mb-5">
              <p className={`${TYPE.labelSm} text-white/30 mb-1`}>Live Data Visualizations</p>
              <p className="text-[9px] text-white/20 leading-relaxed">
                Real-time charts and maps pulled from {meta.label} data sources. All shareable to the Plajah community feed.
              </p>
            </div>
            <DisciplineVizPanel
              disciplineId={disciplineId}
              color={meta.color}
              onShare={(payload: SharedVizPayload) => {
                const text = `📊 ${payload.title} — ${payload.source}\n${payload.description ?? ''}\nSource: ${payload.sourceUrl ?? 'Plajah Labs'}\nShared from Plajah Labs`;
                navigator.clipboard.writeText(text);
              }}
            />
          </div>
        )}

        {/* DATASETS */}
        {contentTab === 'datasets' && (
          <div className="space-y-8">
            {/* Earthquakes */}
            {data?.quakes && data.quakes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="relative flex w-1.5 h-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" /><span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" /></span>
                    <p className={`${TYPE.labelSm} text-white/40`}>Live Seismic Activity · USGS</p>
                  </div>
                  <a href="https://earthquake.usgs.gov/earthquakes/map/" target="_blank" rel="noreferrer"
                    className="text-[8px] text-white/20 hover:text-white/40 font-black uppercase tracking-widest flex items-center gap-1">
                    Full Map <ExternalLink size={9} />
                  </a>
                </div>
                <div className="bg-white/[0.03] border border-white/6 rounded-2xl px-2 py-1">
                  {data.quakes.map((q, i) => <QuakeRow key={q.time} quake={q} index={i} />)}
                </div>
              </div>
            )}

            {/* CERN */}
            {data?.cernRecords && data.cernRecords.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className={`${TYPE.labelSm} text-white/40`}>CERN Open Data Portal</p>
                  <a href="https://opendata.cern.ch" target="_blank" rel="noreferrer"
                    className="text-[8px] text-white/20 hover:text-white/40 font-black uppercase tracking-widest flex items-center gap-1">
                    Browse all <ExternalLink size={9} />
                  </a>
                </div>
                <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">
                  {data.cernRecords.map((r, i) => <CERNCard key={r.id} record={r} index={i} />)}
                </AdaptiveGrid>
              </div>
            )}

            {/* No datasets message */}
            {(!data?.quakes?.length && !data?.cernRecords?.length) && (
              <div className="py-20 text-center">
                <Database size={32} className="text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No live datasets for this discipline</p>
                <p className="text-[10px] text-white/15 mt-1">Try Astronomy or Earth Science for live NASA/USGS data</p>
              </div>
            )}
          </div>
        )}

        {/* MODELS */}
        {contentTab === 'models' && (
          <div>
            {data?.hfModels && data.hfModels.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className={`${TYPE.labelSm} text-white/40`}>
                    Hugging Face · {cfg.hfTasks?.[0]?.replace(/-/g, ' ') ?? 'Top Models'} · Sorted by Downloads
                  </p>
                  <a href={`https://huggingface.co/models?pipeline_tag=${cfg.hfTasks?.[0]}&sort=downloads`} target="_blank" rel="noreferrer"
                    className="text-[8px] text-white/20 hover:text-white/40 font-black uppercase tracking-widest flex items-center gap-1">
                    All models <ExternalLink size={9} />
                  </a>
                </div>
                <div className="space-y-2">
                  {data.hfModels.map((m, i) => <ModelCard key={m.id} model={m} color={meta.color} index={i} />)}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center">
                <Package size={32} className="text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No models for this discipline</p>
              </div>
            )}
          </div>
        )}

        {/* TEXTBOOKS */}
        {contentTab === 'textbooks' && (() => {
          const books = data?.textbooks?.length ? data.textbooks : OPENSTAX_BOOKS.filter(b => b.subject === disciplineId || b.subject === cfg.openStaxSubject);
          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className={`${TYPE.labelSm} text-white/40`}>Open Access Textbooks · OpenStax</p>
                  <p className="text-[8px] text-white/20 mt-0.5">Peer-reviewed · Free forever · CC licensed · Used by 223M+ students</p>
                </div>
                <a href="https://openstax.org/subjects" target="_blank" rel="noreferrer"
                  className="text-[8px] text-white/20 hover:text-white/40 font-black uppercase tracking-widest flex items-center gap-1">
                  All books <ExternalLink size={9} />
                </a>
              </div>
              {books.length > 0 ? (
                <div className="space-y-3">
                  {books.map((b, i) => <TextbookCard key={b.id} book={b} color={meta.color} index={i} onOpen={openTextbook} />)}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <BookOpen size={32} className="text-white/10 mx-auto mb-3" />
                  <p className="text-sm text-white/30">No textbooks indexed for this discipline yet</p>
                  <a href="https://openstax.org/subjects" target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-white/50 hover:text-white transition-all">
                    Browse OpenStax <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>
          );
        })()}

        {/* DISCIPLINE SOCIAL FEED */}
        {contentTab === 'social' && (
          <div className="space-y-4">
            {auth.currentUser && (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                placeholder={`Share your ${meta.label} research or insights...`}
                avatarUrl={auth.currentUser.photoURL || undefined}
                onPost={async (data) => {
                  const resolvedMedia = (await Promise.all(
                    data.attachments.map(async (att) => {
                      if (att.file && att.url.startsWith('blob:')) {
                        try {
                          const { uploadFile } = await import('../services/backendService');
                          const url = await uploadFile(`posts/${auth.currentUser!.uid}/${Date.now()}_${att.file.name}`, att.file);
                          return { type: att.type, url, title: att.title };
                        } catch { return null; }
                      }
                      return { type: att.type, url: att.url, title: att.title };
                    })
                  )).filter(Boolean) as { type: 'PHOTO' | 'VIDEO' | 'AUDIO'; url: string; title?: string }[];
                  await createPost({
                    text: `#${meta.label.replace(/\s+/g, '')} ${data.text}`,
                    isPublic: true,
                    tags: [disciplineId],
                    ...(data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                    ...(resolvedMedia.length > 0 ? { media: resolvedMedia } : {}),
                  });
                }}
              />
            )}
            {disciplinePosts.length > 0 ? (
              <div className="space-y-3">
                {disciplinePosts.map(post => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : globalPosts.length > 0 ? (
              <div className="py-16 text-center">
                <MessageSquare size={32} className="text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No {meta.label} posts yet</p>
                <p className="text-[10px] text-white/15 mt-1">Be the first to share something about {meta.label}</p>
              </div>
            ) : (
              <div className="py-12 space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-white/[0.03] border border-white/6 rounded-2xl animate-pulse" />)}
              </div>
            )}
          </div>
        )}

        {/* PLAJAH SOCIAL FEED */}
        {contentTab === 'plajah_social' && (
          <div className="space-y-4">
            {auth.currentUser && (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                placeholder="What's on your mind?"
                avatarUrl={auth.currentUser.photoURL || undefined}
                onPost={async (data) => {
                  const resolvedMedia = (await Promise.all(
                    data.attachments.map(async (att) => {
                      if (att.file && att.url.startsWith('blob:')) {
                        try {
                          const { uploadFile } = await import('../services/backendService');
                          const url = await uploadFile(`posts/${auth.currentUser!.uid}/${Date.now()}_${att.file.name}`, att.file);
                          return { type: att.type, url, title: att.title };
                        } catch { return null; }
                      }
                      return { type: att.type, url: att.url, title: att.title };
                    })
                  )).filter(Boolean) as { type: 'PHOTO' | 'VIDEO' | 'AUDIO'; url: string; title?: string }[];
                  await createPost({
                    text: data.text,
                    isPublic: true,
                    ...(data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                    ...(resolvedMedia.length > 0 ? { media: resolvedMedia } : {}),
                  });
                }}
              />
            )}
            {globalPosts.length > 0 ? (
              <div className="space-y-3">
                {globalPosts.map(post => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="py-12 space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-white/[0.03] border border-white/6 rounded-2xl animate-pulse" />)}
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
};

export default LabsDisciplineView;
