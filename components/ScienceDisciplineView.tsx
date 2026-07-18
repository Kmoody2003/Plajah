// ScienceDisciplineView — one rich studio that renders ANY science discipline from a
// ScienceDisciplineData module. Mirrors the bespoke World History / Architecture studios
// (live-Wikipedia pioneers, concepts, era timeline, KaTeX laws, interactive simulators,
// tools & APIs, free-textbook + arXiv library, tag-filtered feed) but is fully data-driven.

import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Compass, Users, Lightbulb, Clock, Sigma, FlaskConical, Wrench, FileText,
  MessageSquare, ChevronRight, ExternalLink, BookOpen, Boxes, Library, Play,
  Atom, Dna, Binary, Cpu, Brain, Globe, Telescope, TrendingUp, Leaf, Network,
} from 'lucide-react';
import MuseumHall, { fetchWiki } from './MuseumHall';
import AssetActions from './AssetActions';
import { resolveSimulators } from './labs/Simulators';
import { searchArxiv, OPENSTAX_BOOKS, textbookToAlbum, type ArxivPaper } from '../services/labsApiService';
import { listenToGlobalPosts, createPost, auth, uploadFile } from '../services/backendService';
import type { ScienceDisciplineData, Concept } from '../data/scienceDisciplines/types';
import { Post, Album } from '../types';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';

const BookReader = lazy(() => import('./BookReader'));
// The existing generic discipline view — embedded here so the rich studio keeps ALL of its
// live-data features (arXiv/PubMed papers + AI explain, HF models, datasets, NASA/USGS/CERN
// live data, textbooks, social) on top of the new curated content.
const LabsDisciplineView = lazy(() => import('./LabsDisciplineView'));
const ConceptDetail = lazy(() => import('./labs/ConceptDetail'));
import YouTubeEmbed from './labs/YouTubeEmbed';

// Icon name → component (discipline hero + concepts). Falls back to Compass.
const ICONS: Record<string, React.ComponentType<any>> = {
  Atom, FlaskConical, Dna, Binary, Cpu, Sigma, Brain, Globe, Telescope, TrendingUp, Leaf, Network, Lightbulb, Compass,
};

// ── KaTeX (CDN, shared with LabsFormulaEditor / ArchitectureDisciplineView) ──────
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
const Katex: React.FC<{ latex: string }> = ({ latex }) => {
  const [html, setHtml] = useState('');
  useEffect(() => { let a = true; loadKaTeX().then(() => { const k = (window as any).katex; if (a && k) try { setHtml(k.renderToString(latex, { displayMode: true, throwOnError: false, output: 'html' })); } catch { /* */ } }); return () => { a = false; }; }, [latex]);
  return html
    ? <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />
    : <code className="text-[12px] text-white/50 font-mono">{latex}</code>;
};

type Tab = 'overview' | 'pioneers' | 'concepts' | 'timeline' | 'laws' | 'simulate' | 'watch' | 'toolbox' | 'research' | 'feed';
type IconC = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;

// ── Concept card + modal (optional live Wikipedia) ───────────────────────────────
const ConceptCard: React.FC<{ concept: Concept; accent: string; onOpen: () => void }> = ({ concept, accent, onOpen }) => {
  const [thumb, setThumb] = useState('');
  useEffect(() => { if (!concept.wikiSlug) return; let a = true; fetchWiki(concept.wikiSlug).then(d => a && setThumb(d.thumb)); return () => { a = false; }; }, [concept.wikiSlug]);
  return (
    <button onClick={onOpen} className="group text-left rounded-2xl overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all flex flex-col">
      {concept.wikiSlug && (
        <div className="aspect-[16/9] bg-gradient-to-b from-white/5 to-black/40 relative overflow-hidden">
          {thumb
            ? <img src={thumb} alt={concept.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            : <div className="w-full h-full flex items-center justify-center"><Lightbulb size={24} className="text-white/10" /></div>}
        </div>
      )}
      <div className="p-4">
        <p className="text-[13px] font-black text-white leading-tight flex items-center gap-1.5">{concept.name} <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: accent }} /></p>
        <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed line-clamp-3">{concept.blurb}</p>
      </div>
    </button>
  );
};

const ConceptModal: React.FC<{ concept: Concept; accent: string; discipline: string; onClose: () => void }> = ({ concept, accent, discipline, onClose }) => {
  const [d, setD] = useState<{ thumb: string; extract: string }>({ thumb: '', extract: '' });
  useEffect(() => { if (!concept.wikiSlug) return; let a = true; fetchWiki(concept.wikiSlug).then(x => a && setD(x)); return () => { a = false; }; }, [concept.wikiSlug]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[88vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} className="absolute z-10 w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center hover:bg-black/70" style={{ top: '0.75rem', right: '0.75rem' }}><span className="text-lg leading-none">×</span></button>
        {d.thumb && <div className="aspect-[16/10] bg-white/5 relative"><img src={d.thumb} alt={concept.name} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#0d0d12] via-transparent to-transparent" /></div>}
        <div className={`p-5 relative ${d.thumb ? '-mt-10' : ''}`}>
          <h2 className="text-2xl font-black tracking-tight">{concept.name}</h2>
          <p className="mt-3 text-sm text-white/60 leading-relaxed">{concept.blurb}</p>
          {d.extract && <p className="mt-3 text-sm text-white/45 leading-relaxed">{d.extract}</p>}
          {concept.tags?.length ? <div className="flex flex-wrap gap-1.5 mt-4">{concept.tags.map(t => <span key={t} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/60">{t}</span>)}</div> : null}
          {concept.wikiSlug && <a href={`https://en.wikipedia.org/wiki/${concept.wikiSlug}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Read more <ExternalLink size={11} /></a>}
          <div className="mt-4 pt-4 border-t border-white/8">
            <AssetActions accent={accent} asset={{ kind: 'concept', title: concept.name, subtitle: discipline, description: concept.blurb, imageUrl: d.thumb, sourceUrl: concept.wikiSlug ? `https://en.wikipedia.org/wiki/${concept.wikiSlug}` : undefined, discipline, interests: concept.tags || [] }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

interface Props { data: ScienceDisciplineData; onBack: () => void; currentUser?: any }

const ScienceDisciplineView: React.FC<Props> = ({ data, onBack, currentUser }) => {
  const { accent, accent2, id, label } = data;
  const HeroIcon = ICONS[data.icon] || Compass;
  const sims = useMemo(() => resolveSimulators(data.simulators), [data.simulators]);
  const lawCategories = useMemo(() => Array.from(new Set(data.laws.map(l => l.category))), [data.laws]);

  const ALL_TABS: { id: Tab; label: string; icon: React.ComponentType<any>; show: boolean }[] = [
    { id: 'overview',  label: 'Overview',  icon: Compass,       show: true },
    { id: 'pioneers',  label: 'Pioneers',  icon: Users,         show: data.figures.length > 0 },
    { id: 'concepts',  label: 'Concepts',  icon: Lightbulb,     show: data.concepts.length > 0 },
    { id: 'timeline',  label: 'Timeline',  icon: Clock,         show: data.eras.length > 0 },
    { id: 'laws',      label: 'Laws & Formulas', icon: Sigma,   show: data.laws.length > 0 },
    { id: 'simulate',  label: 'Simulate',  icon: FlaskConical,  show: sims.length > 0 },
    { id: 'watch',     label: 'Watch',     icon: Play,          show: (data.videos?.length || 0) > 0 },
    { id: 'toolbox',   label: 'Tools & APIs', icon: Wrench,     show: data.tools.length > 0 },
    { id: 'research',  label: 'Research & Live Data', icon: FileText, show: true },
    { id: 'feed',      label: 'Feed',      icon: MessageSquare, show: true },
  ];
  const TABS = ALL_TABS.filter(t => t.show);

  const [tab, setTab] = useState<Tab>('overview');
  const [openConcept, setOpenConcept] = useState<Concept | null>(null);
  const [lawCat, setLawCat] = useState<string>('all');
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => { setTab('overview'); }, [id]);

  // Dedicated discipline feed — only posts tagged with this discipline id
  useEffect(() => { if (tab !== 'feed') return; return listenToGlobalPosts(setPosts); }, [tab]);
  const discPosts = useMemo(() => posts.filter(p => p.tags?.includes(id)), [posts, id]);

  // Opening a concept opens a full-page deep dive (big readable text, the experiment, the math,
  // the evidence, video and Findings) instead of the cramped modal.
  if (openConcept) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white/30 text-sm">Opening deep dive…</div>}>
        <ConceptDetail concept={openConcept} data={data} onBack={() => setOpenConcept(null)} currentUser={currentUser} />
      </Suspense>
    );
  }

  const shownLaws = lawCat === 'all' ? data.laws : data.laws.filter(l => l.category === lawCat);

  return (
    <div className="min-h-screen text-white bg-black/40 backdrop-blur-2xl">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-60px] left-[8%] w-[460px] h-[460px] rounded-full blur-[120px]" style={{ background: `${accent}18` }} />
          <div className="absolute bottom-[-80px] right-[4%] w-[380px] h-[380px] rounded-full blur-[100px]" style={{ background: `${accent2}18` }} />
        </div>
        <div className="relative px-5 sm:px-6 pt-8 pb-4 max-w-7xl mx-auto">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-5">
            <ArrowLeft size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Back</span>
          </button>
          <p className={`${TYPE.labelSm} font-black tracking-[0.4em]`} style={{ color: accent }}>Plajah Academia · {label}</p>
          <h1 className="font-black uppercase tracking-tighter mt-1 flex items-center gap-3" style={{ fontSize: 'clamp(2.25rem, 8vw, 3rem)' }}>
            <HeroIcon size={40} style={{ color: accent }} /> {label}
          </h1>
          <p className="text-sm text-white/45 mt-2 max-w-2xl">{data.heroBlurb}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-black/40 border-y border-white/8">
        <div className="max-w-7xl mx-auto px-3 flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map(t => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-3.5 ${TYPE.labelSm} font-black transition-all border-b-2`}
                style={active ? { color: accent, borderColor: accent } : { color: 'rgba(255,255,255,0.4)', borderColor: 'transparent' }}>
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
                { label: 'Pioneers', value: data.figures.length, icon: Users, to: 'pioneers' as Tab },
                { label: 'Concepts', value: data.concepts.length, icon: Lightbulb, to: 'concepts' as Tab },
                { label: 'Laws', value: data.laws.length, icon: Sigma, to: 'laws' as Tab },
                { label: sims.length ? 'Simulators' : 'Tools', value: sims.length || data.tools.length, icon: sims.length ? FlaskConical : Wrench, to: (sims.length ? 'simulate' : 'toolbox') as Tab },
              ].map(s => (
                <button key={s.label} onClick={() => setTab(s.to)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left hover:bg-white/[0.06] transition-all">
                  <s.icon size={18} style={{ color: accent }} />
                  <p className="text-2xl font-black mt-2 tabular-nums">{s.value}</p>
                  <p className={`${TYPE.labelSm} font-black text-white/40`}>{s.label}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { t: 'The Pioneers', d: 'The people who built the field — each with a live biography and portrait.', icon: Users, to: 'pioneers' as Tab },
                { t: 'Core Concepts', d: 'The big ideas that define the discipline, explained clearly.', icon: Lightbulb, to: 'concepts' as Tab },
                { t: 'The Timeline', d: 'How the field developed, era by era, with its turning points.', icon: Clock, to: 'timeline' as Tab },
                ...(data.laws.length ? [{ t: 'Laws & Formulas', d: 'The equations that govern it, beautifully typeset.', icon: Sigma, to: 'laws' as Tab }] : []),
                ...(sims.length ? [{ t: 'Simulate', d: 'Interactive, hands-on models you can play with right now.', icon: FlaskConical, to: 'simulate' as Tab }] : []),
                { t: 'Research & Live Data', d: 'Live papers, models, datasets and real-time feeds (arXiv, NASA, USGS, Hugging Face) plus free textbooks.', icon: Library, to: 'research' as Tab },
              ].map(c => (
                <button key={c.t} onClick={() => setTab(c.to)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-left hover:bg-white/[0.06] transition-all group">
                  <c.icon size={22} style={{ color: accent }} />
                  <p className="text-[15px] font-black mt-3 flex items-center gap-1.5">{c.t} <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" /></p>
                  <p className="text-[12px] text-white/45 leading-relaxed mt-1">{c.d}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PIONEERS */}
        {tab === 'pioneers' && (
          <MuseumHall eyebrow={`The Makers of ${label}`} title={`Pioneers of ${label}`}
            intro="The thinkers and builders who shaped the field — each enriched with a live biography and portrait."
            halls={data.figureHalls} figures={data.figures} accent={accent} icon={HeroIcon} shareDiscipline={label} disciplineId={id} />
        )}

        {/* CONCEPTS */}
        {tab === 'concepts' && (
          <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="0.75rem">
            {data.concepts.map(c => <ConceptCard key={c.id} concept={c} accent={accent} onOpen={() => setOpenConcept(c)} />)}
          </AdaptiveGrid>
        )}

        {/* TIMELINE */}
        {tab === 'timeline' && (
          <div className="space-y-3">
            {data.eras.map((era, i) => (
              <motion.div key={era.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h3 className="type-title-lg font-black uppercase tracking-tight">{era.title}</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>{era.span}</span>
                </div>
                <p className="type-body-md text-white/55 leading-relaxed mt-2">{era.essay}</p>
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">Developments</p>
                    <ul className="space-y-1">{era.developments.map(b => <li key={b} className="text-[12px] text-white/55 flex gap-2"><span style={{ color: accent }}>·</span>{b}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">Turning Points</p>
                    <ul className="space-y-1">{era.turningPoints.map(b => <li key={b} className="text-[12px] text-white/55 flex gap-2"><span style={{ color: accent }}>·</span>{b}</li>)}</ul>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* LAWS & FORMULAS */}
        {tab === 'laws' && (
          <div className="space-y-4">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
              {['all', ...lawCategories].map(c => (
                <button key={c} onClick={() => setLawCat(c)} className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                  style={lawCat === c ? { background: accent, color: '#000' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>{c}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {shownLaws.map(l => (
                <div key={l.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-black text-white">{l.name}</p>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/45 shrink-0">{l.category}</span>
                  </div>
                  <div className="my-3 p-3 rounded-xl bg-black/40 border border-white/8"><Katex latex={l.latex} /></div>
                  <p className="text-[12px] text-white/50 leading-relaxed">{l.description}</p>
                  {l.variables.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {l.variables.map(v => <span key={v.sym} className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[10px] text-white/55"><b style={{ color: accent }}>{v.sym}</b> — {v.name}{v.unit ? ` (${v.unit})` : ''}</span>)}
                    </div>
                  )}
                  {l.reference && <p className="text-[9px] text-white/25 mt-2 italic">{l.reference}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SIMULATE */}
        {tab === 'simulate' && (
          <div className="space-y-4">
            <p className="type-body-md text-white/50 leading-relaxed max-w-2xl">Hands-on, offline models — change the inputs and watch the science respond in real time.</p>
            {sims.map(({ id: sid, entry }) => <entry.Component key={sid} accent={accent} />)}
          </div>
        )}

        {/* TOOLS & APIS */}
        {tab === 'toolbox' && (
          <div className="space-y-4">
            <p className="type-body-md text-white/50 leading-relaxed max-w-2xl">The real, free software, open APIs and datasets that working {label.toLowerCase()} depends on.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {data.tools.map(t => (
                <a key={t.name} href={t.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Wrench size={13} style={{ color: accent }} /><p className="type-body-md font-black text-white">{t.name}</p></div>
                    {t.access && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/45 shrink-0">{t.access}</span>}
                  </div>
                  {t.org && <p className="text-[10px] text-white/35 mt-0.5">{t.org}</p>}
                  <p className="type-body-sm text-white/45 mt-1.5 leading-relaxed">{t.desc}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* WATCH — curated YouTube library, grouped by topic (robust facade embeds) */}
        {tab === 'watch' && data.videos && (
          <div className="space-y-8">
            <p className="type-body-md text-white/50 leading-relaxed max-w-2xl">A hand-picked library of the best lectures and explainers on {label.toLowerCase()} — click to play inline. Every card falls back to a YouTube search, so nothing is a dead end.</p>
            {Array.from(new Set(data.videos.map(v => v.topic || 'Featured'))).map(topic => (
              <div key={topic}>
                <p className={`${TYPE.labelSm} font-black tracking-[0.3em] text-white/40 mb-3`}>{topic}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.videos!.filter(v => (v.topic || 'Featured') === topic).map(v => (
                    <YouTubeEmbed key={v.id} id={v.id} title={v.title} channel={v.channel} query={v.query} blurb={v.blurb} accent={accent} compact />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RESEARCH & LIVE DATA — the full generic Labs studio embedded, so nothing is lost:
            live papers (+ AI explain), HF models, datasets, NASA/USGS/CERN feeds, textbooks, social. */}
        {tab === 'research' && (
          <Suspense fallback={<div className="py-16 text-center text-white/30 text-sm">Loading live research data…</div>}>
            <LabsDisciplineView disciplineId={id as any} embedded onBack={onBack} currentUser={currentUser} />
          </Suspense>
        )}

        {/* FEED — dedicated discipline feed (posts tagged with this discipline id) */}
        {tab === 'feed' && (
          <div className="space-y-4">
            {auth.currentUser && (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                placeholder={`Share a pioneer, a concept, or an idea about ${label.toLowerCase()}…`}
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
                    text: `#${label.replace(/\s+/g, '')} ${data.text}`,
                    isPublic: true,
                    tags: [id],
                    ...(data.theme && data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                    ...(media.length > 0 ? { media } : {}),
                  } as any);
                }}
              />
            )}
            {discPosts.length > 0
              ? <div className="space-y-3">{discPosts.map(p => <PostCard key={p.id} post={p} />)}</div>
              : <div className="py-16 text-center border-2 border-dashed border-white/8 rounded-3xl"><MessageSquare size={28} className="mx-auto text-white/12 mb-3" /><p className="text-[11px] font-black uppercase tracking-widest text-white/25">Be the first to post in {label}</p></div>}
          </div>
        )}
      </div>

    </div>
  );
};

export default ScienceDisciplineView;
