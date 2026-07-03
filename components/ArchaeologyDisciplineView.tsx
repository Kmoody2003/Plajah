import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Shovel, Landmark, MapPin, Boxes, Wrench,
  BookOpen, MessageSquare, Compass, ExternalLink, X, FileText,
  Cpu, Globe, ChevronRight, Grid3x3, Clock, Layers, Scan,
} from 'lucide-react';
import MuseumHall, { fetchWiki } from './MuseumHall';
import ArtifactBrowser from './ArtifactBrowser';
import {
  ARCHAEOLOGIST_HALLS, ARCHAEOLOGIST_FIGURES,
  ARCH_SITES, DATING_METHODS, FIELD_METHODS,
  ARCH_TOOLS, ARCH_DATA_APIS, ARCH_BOOKS, ARTIFACT_COLLECTIONS,
  type ArchSite,
} from '../data/archaeologyData';
import { searchArxiv, type ArxivPaper } from '../services/labsApiService';
import { listenToGlobalPosts, createPost, auth, uploadFile } from '../services/backendService';
import { Post } from '../types';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';

const ModelViewer = lazy(() => import('./architecture/ModelViewer'));

const ACCENT = '#D4A017';
const ACCENT_2 = '#9C7314';

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'archaeologists' | 'sites' | 'artifacts' | 'methods' | 'tools' | 'library' | 'feed';
type IconC = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
const TABS: { id: Tab; label: string; icon: IconC }[] = [
  { id: 'overview',       label: 'Overview',       icon: Compass },
  { id: 'archaeologists', label: 'Archaeologists', icon: Landmark },
  { id: 'sites',          label: 'Sites',          icon: MapPin },
  { id: 'artifacts',      label: 'Artifacts',      icon: Boxes },
  { id: 'methods',        label: 'Methods',        icon: Clock },
  { id: 'tools',          label: '3D & Tools',     icon: Wrench },
  { id: 'library',        label: 'Library',        icon: FileText },
  { id: 'feed',           label: 'Feed',           icon: MessageSquare },
];

// ── Site card + modal (live Wikipedia) ────────────────────────────────────────
const SiteCard: React.FC<{ site: ArchSite; onOpen: () => void }> = ({ site, onOpen }) => {
  const [thumb, setThumb] = useState('');
  useEffect(() => { let a = true; fetchWiki(site.wikiSlug).then(d => a && setThumb(d.thumb)); return () => { a = false; }; }, [site.wikiSlug]);
  return (
    <button onClick={onOpen} className="group text-left rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all"
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${ACCENT}66`)} onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <div className="aspect-[4/3] bg-gradient-to-b from-white/5 to-black/40 relative overflow-hidden">
        {thumb
          ? <img src={thumb} alt={site.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center"><MapPin size={28} className="text-white/10" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute bottom-2.5 left-3 right-3">
          <p className="text-[13px] font-black uppercase tracking-tight text-white leading-none">{site.name}</p>
          <p className="text-[8px] font-bold uppercase tracking-widest mt-1" style={{ color: ACCENT }}>{site.region} · {site.period}</p>
        </div>
      </div>
    </button>
  );
};

const SiteModal: React.FC<{ site: ArchSite; onClose: () => void }> = ({ site, onClose }) => {
  const [d, setD] = useState<{ thumb: string; extract: string }>({ thumb: '', extract: '' });
  useEffect(() => { let a = true; fetchWiki(site.wikiSlug).then(x => a && setD(x)); return () => { a = false; }; }, [site.wikiSlug]);
  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[88vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center hover:bg-black/70"><X size={14} /></button>
        <div className="aspect-[16/10] bg-white/5 relative">
          {d.thumb && <img src={d.thumb} alt={site.name} className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d12] via-transparent to-transparent" />
        </div>
        <div className="p-5 -mt-10 relative">
          <h2 className="text-2xl font-black uppercase tracking-tight">{site.name}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}>{site.region}</span>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{site.period}</span>
          </div>
          <p className="mt-3 text-sm text-white/60 leading-relaxed">{site.blurb}</p>
          {d.extract && <p className="mt-3 text-sm text-white/45 leading-relaxed">{d.extract}</p>}
          <div className="mt-4">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-2">Highlights</p>
            <div className="flex flex-wrap gap-1.5">
              {site.highlights.map(h => <span key={h} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/70">{h}</span>)}
            </div>
          </div>
          <a href={`https://en.wikipedia.org/wiki/${site.wikiSlug}`} target="_blank" rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">
            Read more <ExternalLink size={11} />
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

// ── Main view ─────────────────────────────────────────────────────────────────
interface Props { onBack: () => void; currentUser?: any }

const ArchaeologyDisciplineView: React.FC<Props> = ({ onBack, currentUser }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [openSite, setOpenSite] = useState<ArchSite | null>(null);
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);

  // Papers (arXiv physics.hist-ph) — lazy on first Library open
  useEffect(() => {
    if (tab !== 'library' || papers.length || papersLoading) return;
    setPapersLoading(true);
    searchArxiv('archaeology archaeometry dating provenance', 'physics.hist-ph', 12)
      .then(setPapers).finally(() => setPapersLoading(false));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dedicated archaeology feed — only posts tagged 'archaeology'
  useEffect(() => {
    if (tab !== 'feed') return;
    return listenToGlobalPosts(setPosts);
  }, [tab]);
  const archPosts = useMemo(() => posts.filter(p => p.tags?.includes('archaeology')), [posts]);

  const toolsByCat = useMemo(() => {
    const m: Record<string, typeof ARCH_TOOLS> = {};
    for (const t of ARCH_TOOLS) (m[t.category] ||= []).push(t);
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
          <p className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Plajah Academia · Archaeology</p>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter mt-1 flex items-center gap-3">
            <Shovel size={40} style={{ color: ACCENT }} /> Archaeology
          </h1>
          <p className="text-sm text-white/45 mt-2 max-w-2xl">The field studio for the human past — the pioneers who invented the discipline, the world’s great sites, tens of thousands of artifacts live from open-access collections, the science of dating and digging, and the open tools, data and books that power modern practice.</p>
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
                { label: 'Archaeologists', value: ARCHAEOLOGIST_FIGURES.length, icon: Landmark, to: 'archaeologists' as Tab },
                { label: 'Great Sites', value: ARCH_SITES.length, icon: MapPin, to: 'sites' as Tab },
                { label: 'Dating Methods', value: DATING_METHODS.length, icon: Clock, to: 'methods' as Tab },
                { label: 'Tools & APIs', value: ARCH_TOOLS.length + ARCH_DATA_APIS.length, icon: Wrench, to: 'tools' as Tab },
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
                { t: 'The Archaeologists', d: 'From Schliemann and Petrie to the Leakeys and Hodder — the people who built the discipline and read the human past.', icon: Landmark, to: 'archaeologists' as Tab },
                { t: 'The Great Sites', d: 'Giza, Pompeii, Göbekli Tepe, Machu Picchu, Olduvai — the places that rewrote what we know, enriched live from Wikipedia.', icon: MapPin, to: 'sites' as Tab },
                { t: 'Browse the Artifacts', d: 'Tens of thousands of objects live from The Met, Art Institute of Chicago, Cleveland and Open Context field data.', icon: Boxes, to: 'artifacts' as Tab },
                { t: 'Dating & Field Methods', d: 'Radiocarbon to OSL, stratigraphy to the Harris Matrix, LiDAR to flotation — the science of how we date and dig.', icon: Clock, to: 'methods' as Tab },
                { t: '3D & the Toolkit', d: 'Inspect an uploaded 3D scan, and reach the open-source tools and open-data APIs of modern archaeology.', icon: Scan, to: 'tools' as Tab },
                { t: 'Library & Research', d: 'Public-domain classics on archive.org, standard references, and the latest archaeometry preprints from arXiv.', icon: BookOpen, to: 'library' as Tab },
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

        {/* ARCHAEOLOGISTS */}
        {tab === 'archaeologists' && (
          <MuseumHall eyebrow="The Archaeologists" title="Masters of the Human Past"
            intro="The people who invented the discipline — enrich each with a live biography and portrait."
            halls={ARCHAEOLOGIST_HALLS} figures={ARCHAEOLOGIST_FIGURES} accent={ACCENT} icon={Landmark} />
        )}

        {/* SITES */}
        {tab === 'sites' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {ARCH_SITES.map(s => <SiteCard key={s.id} site={s} onOpen={() => setOpenSite(s)} />)}
          </div>
        )}

        {/* ARTIFACTS — the centrepiece */}
        {tab === 'artifacts' && (
          <ArtifactBrowser
            collections={ARTIFACT_COLLECTIONS}
            accent={ACCENT}
            sources={['met', 'artic', 'cleveland']}
            intro="Browse tens of thousands of objects, live from the world's open-access collections."
          />
        )}

        {/* METHODS — dating table + field methods */}
        {tab === 'methods' && (
          <div className="space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Dating Methods</p>
              <div className="rounded-2xl border border-white/8 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/[0.04]">
                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/40">Method</th>
                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/40">Range</th>
                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/40">Basis</th>
                        <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/40">Used for</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DATING_METHODS.map(m => (
                        <tr key={m.id} className="border-t border-white/6 hover:bg-white/[0.02]">
                          <td className="px-4 py-3 align-top"><span className="text-[13px] font-black text-white">{m.name}</span></td>
                          <td className="px-4 py-3 align-top"><span className="text-[11px] font-bold whitespace-nowrap" style={{ color: ACCENT }}>{m.range}</span></td>
                          <td className="px-4 py-3 align-top"><span className="text-[11px] text-white/50 leading-relaxed">{m.basis}</span></td>
                          <td className="px-4 py-3 align-top"><span className="text-[11px] text-white/55 leading-relaxed">{m.useFor}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Field Methods</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {FIELD_METHODS.map((f, i) => (
                  <motion.div key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2">
                      <Layers size={14} style={{ color: ACCENT }} />
                      <p className="text-[13px] font-black text-white">{f.name}</p>
                    </div>
                    <p className="text-[11px] text-white/50 mt-1.5 leading-relaxed">{f.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3D & TOOLS — model viewer + tools + APIs */}
        {tab === 'tools' && (
          <div className="space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">3D Artifact Inspector</p>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
                <Suspense fallback={<div className="py-24 text-center"><div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: `${ACCENT}33`, borderTopColor: ACCENT }} /><p className="text-[10px] font-black uppercase tracking-widest text-white/30 mt-3">Loading the inspector…</p></div>}>
                  <ModelViewer accent={ACCENT} />
                </Suspense>
              </div>
              <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
                Upload a .glb / .gltf / .obj / .stl scan of an artifact to inspect it in 3D. Thousands of ready-made scans are freely
                downloadable from{' '}
                <a href="https://sketchfab.com/3d-models/categories/cultural-heritage-history" target="_blank" rel="noreferrer" className="underline hover:text-white" style={{ color: ACCENT }}>Sketchfab Cultural Heritage</a>{' '}
                and the{' '}
                <a href="https://3d.si.edu/" target="_blank" rel="noreferrer" className="underline hover:text-white" style={{ color: ACCENT }}>Smithsonian 3D</a> collection.
              </p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Tools of the Trade</p>
              {Object.entries(toolsByCat).map(([cat, list]) => (
                <div key={cat} className="mb-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: ACCENT }}>{cat}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {list.map(t => (
                      <a key={t.name} href={t.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                        <div className="flex items-center gap-2">
                          <Cpu size={14} style={{ color: ACCENT }} />
                          <p className="text-[13px] font-black text-white">{t.name}</p>
                          {t.oss && <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[7px] font-black uppercase text-emerald-400">OSS</span>}
                        </div>
                        <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">{t.desc}</p>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Open Data &amp; APIs</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ARCH_DATA_APIS.map(a => (
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

        {/* LIBRARY — books + papers */}
        {tab === 'library' && (
          <div className="space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Books &amp; Foundational Texts</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ARCH_BOOKS.map(b => (
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

        {/* FEED — dedicated archaeology feed */}
        {tab === 'feed' && (
          <div className="space-y-4">
            {auth.currentUser && (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                placeholder="Share a dig, a find, a paper, or a question for the field…"
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
                    text: `#Archaeology ${data.text}`,
                    isPublic: true,
                    tags: ['archaeology'],
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
                <p className="text-sm text-white/30">No Archaeology posts yet</p>
                <p className="text-[10px] text-white/15 mt-1">Be the first to share something about Archaeology</p>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openSite && <SiteModal site={openSite} onClose={() => setOpenSite(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default ArchaeologyDisciplineView;
