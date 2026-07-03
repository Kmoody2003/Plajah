import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Building2, Landmark, Ruler, Sigma, Boxes, Wrench,
  BookOpen, MessageSquare, Compass, ExternalLink, X, FileText,
  Cpu, Globe, Star, ChevronRight, Grid3x3,
} from 'lucide-react';
import MuseumHall, { fetchWiki } from './MuseumHall';
import AssetActions from './AssetActions';
import {
  ARCHITECT_HALLS, ARCHITECT_FIGURES,
  ARCH_STYLES, ARCH_HISTORY, ARCH_FORMULAS, ARCH_CODES,
  ARCH_SOFTWARE, ARCH_APIS, ARCH_TEXTBOOKS,
  type ArchStyle, type ArchFormula,
} from '../data/architectureData';
import { searchArxiv, type ArxivPaper } from '../services/labsApiService';
import { listenToGlobalPosts, createPost, auth, uploadFile } from '../services/backendService';
import { Post } from '../types';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';

const ArchitectureStudio = lazy(() => import('./architecture/ArchitectureStudio'));

const ACCENT = '#B08968';
const ACCENT_2 = '#8A6A4F';

// ── KaTeX (CDN, shared with LabsFormulaEditor's approach) ─────────────────────
let katexLoaded = false, katexLoading = false;
const katexCbs: (() => void)[] = [];
function loadKaTeX(): Promise<void> {
  return new Promise(resolve => {
    if (katexLoaded) { resolve(); return; }
    katexCbs.push(resolve);
    if (katexLoading) return;
    katexLoading = true;
    if (typeof document === 'undefined') { resolve(); return; }
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css'; link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    s.onload = () => { katexLoaded = true; katexCbs.forEach(cb => cb()); katexCbs.length = 0; };
    s.onerror = () => { katexCbs.forEach(cb => cb()); katexCbs.length = 0; };
    document.head.appendChild(s);
  });
}
function renderKaTeX(latex: string): string {
  try {
    const katex = (window as any).katex;
    if (!katex) return '';
    return katex.renderToString(latex, { displayMode: true, throwOnError: false, output: 'html' });
  } catch { return `<code style="color:#f87171">${latex}</code>`; }
}
const Katex: React.FC<{ latex: string }> = ({ latex }) => {
  const [html, setHtml] = useState('');
  useEffect(() => { let a = true; loadKaTeX().then(() => a && setHtml(renderKaTeX(latex))); return () => { a = false; }; }, [latex]);
  return html
    ? <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />
    : <code className="text-[12px] text-white/50 font-mono">{latex}</code>;
};

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'architects' | 'styles' | 'history' | 'formulas' | 'simulate' | 'toolbox' | 'library' | 'feed';
type IconC = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
const TABS: { id: Tab; label: string; icon: IconC }[] = [
  { id: 'overview',   label: 'Overview',   icon: Compass },
  { id: 'architects', label: 'Architects', icon: Landmark },
  { id: 'styles',     label: 'Styles',     icon: Grid3x3 },
  { id: 'history',    label: 'History',    icon: BookOpen },
  { id: 'formulas',   label: 'Formulas',   icon: Sigma },
  { id: 'simulate',   label: 'Simulate',   icon: Ruler },
  { id: 'toolbox',    label: 'Software & APIs', icon: Wrench },
  { id: 'library',    label: 'Library',    icon: FileText },
  { id: 'feed',       label: 'Feed',       icon: MessageSquare },
];

// ── Style card + modal (live Wikipedia) ───────────────────────────────────────
const StyleCard: React.FC<{ style: ArchStyle; onOpen: () => void }> = ({ style, onOpen }) => {
  const [thumb, setThumb] = useState('');
  useEffect(() => { let a = true; fetchWiki(style.wikiSlug).then(d => a && setThumb(d.thumb)); return () => { a = false; }; }, [style.wikiSlug]);
  return (
    <button onClick={onOpen} className="group text-left rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all"
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${ACCENT}66`)} onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <div className="aspect-[4/3] bg-gradient-to-b from-white/5 to-black/40 relative overflow-hidden">
        {thumb
          ? <img src={thumb} alt={style.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center"><Building2 size={28} className="text-white/10" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute bottom-2.5 left-3 right-3">
          <p className="text-[13px] font-black uppercase tracking-tight text-white leading-none">{style.name}</p>
          <p className="text-[8px] font-bold uppercase tracking-widest mt-1" style={{ color: ACCENT }}>{style.era}{style.region ? ` · ${style.region}` : ''}</p>
        </div>
      </div>
    </button>
  );
};

const StyleModal: React.FC<{ style: ArchStyle; onClose: () => void }> = ({ style, onClose }) => {
  const [d, setD] = useState<{ thumb: string; extract: string }>({ thumb: '', extract: '' });
  useEffect(() => { let a = true; fetchWiki(style.wikiSlug).then(x => a && setD(x)); return () => { a = false; }; }, [style.wikiSlug]);
  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[88vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center hover:bg-black/70"><X size={14} /></button>
        <div className="aspect-[16/10] bg-white/5 relative">
          {d.thumb && <img src={d.thumb} alt={style.name} className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d12] via-transparent to-transparent" />
        </div>
        <div className="p-5 -mt-10 relative">
          <h2 className="text-2xl font-black uppercase tracking-tight">{style.name}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}>{style.era}</span>
            {style.region && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{style.region}</span>}
          </div>
          <p className="mt-3 text-sm text-white/60 leading-relaxed">{style.blurb}</p>
          {d.extract && <p className="mt-3 text-sm text-white/45 leading-relaxed">{d.extract}</p>}
          <div className="mt-4">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-2">Hallmarks</p>
            <div className="flex flex-wrap gap-1.5">
              {style.hallmarks.map(h => <span key={h} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/70">{h}</span>)}
            </div>
          </div>
          <a href={`https://en.wikipedia.org/wiki/${style.wikiSlug}`} target="_blank" rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">
            Read more <ExternalLink size={11} />
          </a>
          <div className="mt-4 pt-4 border-t border-white/8">
            <AssetActions accent={ACCENT} asset={{
              kind: 'style', title: style.name,
              subtitle: [style.era, style.region].filter(Boolean).join(' · '),
              description: style.blurb, imageUrl: d.thumb,
              sourceUrl: `https://en.wikipedia.org/wiki/${style.wikiSlug}`,
              discipline: 'Architecture', interests: [style.era].filter(Boolean) as string[],
            }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

// ── Formula card ──────────────────────────────────────────────────────────────
const FormulaCard: React.FC<{ f: ArchFormula }> = ({ f }) => (
  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[13px] font-black text-white">{f.name}</p>
      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[7px] font-black uppercase tracking-widest text-white/40 shrink-0">{f.category}</span>
    </div>
    <div className="my-3 px-3 py-2 rounded-xl bg-black/40 border border-white/6"><Katex latex={f.latex} /></div>
    <p className="text-[12px] text-white/50 leading-relaxed">{f.description}</p>
    {f.variables?.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {f.variables.map(v => (
          <span key={v.sym} className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[10px] text-white/60">
            <span className="font-mono font-bold" style={{ color: ACCENT }}>{v.sym}</span> {v.name}{v.unit ? ` (${v.unit})` : ''}
          </span>
        ))}
      </div>
    )}
    {f.reference && <p className="mt-2 text-[10px] text-white/25">Ref: {f.reference}</p>}
  </div>
);

// ── Main view ─────────────────────────────────────────────────────────────────
interface Props { onBack: () => void; currentUser?: any }

const ArchitectureDisciplineView: React.FC<Props> = ({ onBack, currentUser }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [openStyle, setOpenStyle] = useState<ArchStyle | null>(null);
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);

  // Papers (arXiv cs.CE) — lazy on first Library open
  useEffect(() => {
    if (tab !== 'library' || papers.length || papersLoading) return;
    setPapersLoading(true);
    searchArxiv('structural engineering building design construction', 'cs.CE', 12)
      .then(setPapers).finally(() => setPapersLoading(false));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dedicated architecture feed — only posts tagged 'architecture'
  useEffect(() => {
    if (tab !== 'feed') return;
    return listenToGlobalPosts(setPosts);
  }, [tab]);
  const archPosts = useMemo(() => posts.filter(p => p.tags?.includes('architecture')), [posts]);

  const softwareByCat = useMemo(() => {
    const m: Record<string, typeof ARCH_SOFTWARE> = {};
    for (const s of ARCH_SOFTWARE) (m[s.category] ||= []).push(s);
    return m;
  }, []);

  return (
    <div className="min-h-screen text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-60px] left-[8%] w-[460px] h-[460px] rounded-full blur-[120px]" style={{ background: `${ACCENT}18` }} />
          <div className="absolute bottom-[-80px] right-[4%] w-[380px] h-[380px] rounded-full blur-[100px]" style={{ background: `${ACCENT_2}18` }} />
        </div>
        <div className="relative px-5 sm:px-6 pt-8 pb-4 max-w-7xl mx-auto">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-5">
            <ArrowLeft size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Back</span>
          </button>
          <p className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Plajah Academia · Architecture</p>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter mt-1 flex items-center gap-3">
            <Building2 size={40} style={{ color: ACCENT }} /> Architecture
          </h1>
          <p className="text-sm text-white/45 mt-2 max-w-2xl">The complete studio for the built environment — the masters and their movements, the history and the styles, the mathematics that holds buildings up, live structural tools, and the open software and data that power modern practice.</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-black/40 border-y border-white/8">
        <div className="max-w-7xl mx-auto px-3 flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map(t => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="shrink-0 flex items-center gap-2 px-4 py-3.5 text-[9px] font-black uppercase tracking-widest transition-all border-b-2"
                style={active ? { color: ACCENT, borderColor: ACCENT } : { color: 'rgba(255,255,255,0.4)', borderColor: 'transparent' }}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-6">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Architects', value: ARCHITECT_FIGURES.length, icon: Landmark, to: 'architects' as Tab },
                { label: 'Styles', value: ARCH_STYLES.length, icon: Grid3x3, to: 'styles' as Tab },
                { label: 'Formulas', value: ARCH_FORMULAS.length, icon: Sigma, to: 'formulas' as Tab },
                { label: 'Tools & APIs', value: ARCH_SOFTWARE.length + ARCH_APIS.length, icon: Wrench, to: 'toolbox' as Tab },
              ].map(s => (
                <button key={s.label} onClick={() => setTab(s.to)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left hover:bg-white/[0.06] transition-all">
                  <s.icon size={18} style={{ color: ACCENT }} />
                  <p className="text-2xl font-black mt-2 tabular-nums">{s.value}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{s.label}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { t: 'The Architects', d: 'From Imhotep to Zaha Hadid — the masters, their masterworks, and the ideas they gave the world.', icon: Landmark, to: 'architects' as Tab },
                { t: 'Styles & Movements', d: 'Gothic to Parametric — read every style through its own hallmarks and living examples.', icon: Grid3x3, to: 'styles' as Tab },
                { t: 'A History of Building', d: 'The arch, the dome, the flying buttress, the steel frame, reinforced concrete — how we learned to build.', icon: BookOpen, to: 'history' as Tab },
                { t: 'The Mathematics', d: 'The structural formulas that hold buildings up — statics, beams, columns, loads and materials.', icon: Sigma, to: 'formulas' as Tab },
                { t: 'Structural Studio', d: 'Run real beam & column calculations, upload and inspect a 3D model, and connect to simulation engines.', icon: Ruler, to: 'simulate' as Tab },
                { t: 'Software & APIs', d: 'The open-source toolchain and open data APIs of modern architecture and structural engineering.', icon: Wrench, to: 'toolbox' as Tab },
              ].map(c => (
                <button key={c.t} onClick={() => setTab(c.to)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-left hover:bg-white/[0.06] transition-all group">
                  <c.icon size={22} style={{ color: ACCENT }} />
                  <p className="text-[15px] font-black mt-3 flex items-center gap-1.5">{c.t} <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" /></p>
                  <p className="text-[12px] text-white/45 leading-relaxed mt-1">{c.d}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ARCHITECTS */}
        {tab === 'architects' && (
          <MuseumHall eyebrow="The Architects" title="Masters of the Built World"
            intro="The people who shaped how we live — enrich each with a live biography and portrait."
            halls={ARCHITECT_HALLS} figures={ARCHITECT_FIGURES} accent={ACCENT} icon={Landmark} shareDiscipline="Architecture" />
        )}

        {/* STYLES */}
        {tab === 'styles' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {ARCH_STYLES.map(s => <StyleCard key={s.id} style={s} onOpen={() => setOpenStyle(s)} />)}
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          <div className="space-y-3">
            {ARCH_HISTORY.map((era, i) => (
              <motion.div key={era.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h3 className="text-xl font-black uppercase tracking-tight">{era.title}</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: ACCENT }}>{era.span}</span>
                </div>
                <p className="text-[13px] text-white/55 leading-relaxed mt-2">{era.essay}</p>
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">Key Buildings</p>
                    <ul className="space-y-1">{era.keyBuildings.map(b => <li key={b} className="text-[12px] text-white/55 flex gap-2"><span style={{ color: ACCENT }}>·</span>{b}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">Developments</p>
                    <ul className="space-y-1">{era.developments.map(b => <li key={b} className="text-[12px] text-white/55 flex gap-2"><span style={{ color: ACCENT }}>·</span>{b}</li>)}</ul>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* FORMULAS */}
        {tab === 'formulas' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ARCH_FORMULAS.map(f => <FormulaCard key={f.id} f={f} />)}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Building Codes &amp; Standards</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ARCH_CODES.map(c => (
                  <a key={c.name} href={c.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-black text-white">{c.name}</p>
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/35 shrink-0">{c.org}</span>
                    </div>
                    <p className="text-[11px] text-white/45 mt-1">{c.scope}</p>
                    {c.note && <p className="text-[10px] text-white/25 mt-1">{c.note}</p>}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SIMULATE */}
        {tab === 'simulate' && (
          <Suspense fallback={<div className="py-24 text-center"><div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: `${ACCENT}33`, borderTopColor: ACCENT }} /><p className="text-[10px] font-black uppercase tracking-widest text-white/30 mt-3">Loading the studio…</p></div>}>
            <ArchitectureStudio accent={ACCENT} />
          </Suspense>
        )}

        {/* TOOLBOX — software + APIs */}
        {tab === 'toolbox' && (
          <div className="space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Open-Source &amp; Industry Software</p>
              {Object.entries(softwareByCat).map(([cat, list]) => (
                <div key={cat} className="mb-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: ACCENT }}>{cat}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {list.map(s => (
                      <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                        <div className="flex items-center gap-2">
                          <Cpu size={14} style={{ color: ACCENT }} />
                          <p className="text-[13px] font-black text-white">{s.name}</p>
                          {s.oss && <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[7px] font-black uppercase text-emerald-400">OSS</span>}
                        </div>
                        <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">{s.desc}</p>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Open Data &amp; APIs</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ARCH_APIS.map(a => (
                  <a key={a.name} href={a.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><Globe size={14} style={{ color: ACCENT }} /><p className="text-[13px] font-black text-white">{a.name}</p></div>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[7px] font-black uppercase tracking-widest text-white/45 shrink-0">{a.auth}</span>
                    </div>
                    <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">{a.desc}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LIBRARY — textbooks + papers */}
        {tab === 'library' && (
          <div className="space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Textbooks &amp; Foundational Texts</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ARCH_TEXTBOOKS.map(b => (
                  <a key={b.id} href={b.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-black text-white leading-tight">{b.title}</p>
                      {b.free && <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[7px] font-black uppercase text-emerald-400 shrink-0">Free</span>}
                    </div>
                    <p className="text-[10px] text-white/40 mt-0.5">{b.authors.join(', ')}{b.year ? ` · ${b.year}` : ''}</p>
                    <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">{b.desc}</p>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Latest Research · arXiv</p>
              {papersLoading && <div className="py-10 text-center text-white/30 text-sm">Fetching preprints…</div>}
              {!papersLoading && papers.length === 0 && <p className="text-white/25 text-[12px]">No papers loaded — arXiv may be unavailable.</p>}
              <div className="space-y-2.5">
                {papers.map(p => (
                  <a key={p.id} href={p.pdfLink || p.link} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                    <p className="text-[13px] font-bold text-white leading-snug">{p.title}</p>
                    <p className="text-[10px] text-white/40 mt-1">{p.authors.slice(0, 4).join(', ')}{p.authors.length > 4 ? ' et al.' : ''} · {p.published}</p>
                    <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed line-clamp-3">{p.abstract}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* FEED — dedicated architecture feed */}
        {tab === 'feed' && (
          <div className="space-y-4">
            {auth.currentUser && (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                placeholder="Share a building, a detail, a drawing, or an idea about architecture…"
                avatarUrl={auth.currentUser.photoURL || undefined}
                onPost={async (data: any) => {
                  const media = (await Promise.all((data.attachments || []).map(async (att: any) => {
                    if (att.file && att.url?.startsWith('blob:')) {
                      try { const url = await uploadFile(`posts/${auth.currentUser!.uid}/${Date.now()}_${att.file.name}`, att.file); return { type: att.type, url, title: att.title }; }
                      catch { return null; }
                    }
                    return { type: att.type, url: att.url, title: att.title };
                  }))).filter(Boolean) as { type: 'PHOTO' | 'VIDEO' | 'AUDIO'; url: string; title?: string }[];
                  await createPost({
                    text: `#Architecture ${data.text}`,
                    isPublic: true,
                    tags: ['architecture'],
                    ...(data.theme && data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                    ...(media.length > 0 ? { media } : {}),
                  } as any);
                }}
              />
            )}
            {archPosts.length > 0 ? (
              <div className="space-y-3">{archPosts.map(p => <PostCard key={p.id} post={p} />)}</div>
            ) : (
              <div className="py-16 text-center">
                <MessageSquare size={32} className="text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No Architecture posts yet</p>
                <p className="text-[10px] text-white/15 mt-1">Be the first to share something about Architecture</p>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openStyle && <StyleModal style={openStyle} onClose={() => setOpenStyle(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default ArchitectureDisciplineView;
