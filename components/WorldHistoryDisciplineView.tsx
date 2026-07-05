import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Globe, Landmark, MessageSquare, Compass,
  ExternalLink, FileText, ChevronRight, Boxes, ScrollText, Clock, Users, Library, BookOpen,
} from 'lucide-react';
import MuseumHall, { fetchWiki } from './MuseumHall';
import ArtifactBrowser from './ArtifactBrowser';
import AssetActions from './AssetActions';
import {
  HISTORY_FIGURE_HALLS, HISTORY_FIGURES,
  CIVILIZATIONS, HISTORY_ERAS, PRIMARY_SOURCES, ARTIFACT_COLLECTIONS,
  type Civilization,
} from '../data/worldHistoryData';
import { searchArxiv, OPENSTAX_BOOKS, textbookToAlbum, type ArxivPaper } from '../services/labsApiService';
import { listenToGlobalPosts, createPost, auth, uploadFile } from '../services/backendService';
import { Post, Album } from '../types';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';

const BookReader = lazy(() => import('./BookReader'));

const ACCENT = '#E8590C';
const ACCENT_2 = '#B24608';

const HISTORY_BOOKS = OPENSTAX_BOOKS.filter(b => b.subject === 'history');

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'figures' | 'civilizations' | 'timeline' | 'artifacts' | 'sources' | 'library' | 'feed';
type IconC = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
const TABS: { id: Tab; label: string; icon: IconC }[] = [
  { id: 'overview',      label: 'Overview',        icon: Compass },
  { id: 'figures',       label: 'Figures',         icon: Users },
  { id: 'civilizations', label: 'Civilizations',   icon: Landmark },
  { id: 'timeline',      label: 'Timeline',        icon: Clock },
  { id: 'artifacts',     label: 'Artifacts',       icon: Boxes },
  { id: 'sources',       label: 'Primary Sources', icon: ScrollText },
  { id: 'library',       label: 'Library',         icon: FileText },
  { id: 'feed',          label: 'Feed',            icon: MessageSquare },
];

// ── Civilization card + modal (live Wikipedia) ────────────────────────────────
const CivCard: React.FC<{ civ: Civilization; onOpen: () => void }> = ({ civ, onOpen }) => {
  const [thumb, setThumb] = useState('');
  useEffect(() => { let a = true; fetchWiki(civ.wikiSlug).then(d => a && setThumb(d.thumb)); return () => { a = false; }; }, [civ.wikiSlug]);
  return (
    <button onClick={onOpen} className="group text-left rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all"
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${ACCENT}66`)} onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <div className="aspect-[4/3] bg-gradient-to-b from-white/5 to-black/40 relative overflow-hidden">
        {thumb
          ? <img src={thumb} alt={civ.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center"><Landmark size={28} className="text-white/10" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute bottom-2.5 left-3 right-3">
          <p className="text-[13px] font-black uppercase tracking-tight text-white leading-none line-clamp-1">{civ.name}</p>
          <p className="text-[8px] font-bold uppercase tracking-widest mt-1" style={{ color: ACCENT }}>{civ.span}</p>
        </div>
      </div>
    </button>
  );
};

const CivModal: React.FC<{ civ: Civilization; onClose: () => void }> = ({ civ, onClose }) => {
  const [d, setD] = useState<{ thumb: string; extract: string }>({ thumb: '', extract: '' });
  useEffect(() => { let a = true; fetchWiki(civ.wikiSlug).then(x => a && setD(x)); return () => { a = false; }; }, [civ.wikiSlug]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[88vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center hover:bg-black/70"><span className="text-lg leading-none">×</span></button>
        <div className="aspect-[16/10] bg-white/5 relative">
          {d.thumb && <img src={d.thumb} alt={civ.name} className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d12] via-transparent to-transparent" />
        </div>
        <div className="p-5 -mt-10 relative">
          <h2 className="text-2xl font-black uppercase tracking-tight">{civ.name}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase" style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}>{civ.span}</span>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{civ.region}</span>
          </div>
          <p className="mt-3 text-sm text-white/60 leading-relaxed">{civ.blurb}</p>
          {d.extract && <p className="mt-3 text-sm text-white/45 leading-relaxed">{d.extract}</p>}
          <div className="mt-4">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-2">Hallmarks</p>
            <div className="flex flex-wrap gap-1.5">
              {civ.hallmarks.map(h => <span key={h} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/70">{h}</span>)}
            </div>
          </div>
          <a href={`https://en.wikipedia.org/wiki/${civ.wikiSlug}`} target="_blank" rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">
            Read more <ExternalLink size={11} />
          </a>
          <div className="mt-4 pt-4 border-t border-white/8">
            <AssetActions accent={ACCENT} asset={{
              kind: 'civilization', title: civ.name,
              subtitle: [civ.span, civ.region].filter(Boolean).join(' · '),
              description: civ.blurb, imageUrl: d.thumb,
              sourceUrl: `https://en.wikipedia.org/wiki/${civ.wikiSlug}`,
              discipline: 'World History', interests: [civ.region].filter(Boolean) as string[],
            }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main view ─────────────────────────────────────────────────────────────────
interface Props { onBack: () => void; currentUser?: any }

const WorldHistoryDisciplineView: React.FC<Props> = ({ onBack, currentUser }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [openCiv, setOpenCiv] = useState<Civilization | null>(null);
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [readerBook, setReaderBook] = useState<Album | null>(null);

  // Papers (arXiv physics.hist-ph — history of physics/science) — lazy on Library open
  useEffect(() => {
    if (tab !== 'library' || papers.length || papersLoading) return;
    setPapersLoading(true);
    searchArxiv('history of science philosophy', 'physics.hist-ph', 12)
      .then(setPapers).finally(() => setPapersLoading(false));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dedicated world-history feed — only posts tagged 'history'
  useEffect(() => {
    if (tab !== 'feed') return;
    return listenToGlobalPosts(setPosts);
  }, [tab]);
  const historyPosts = useMemo(() => posts.filter(p => p.tags?.includes('history')), [posts]);

  // Free OpenStax textbooks open in the native Lorea reader.
  if (readerBook) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white/30">Opening reader…</div>}>
        <BookReader book={readerBook} onBack={() => setReaderBook(null)} currentUser={currentUser} />
      </Suspense>
    );
  }

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
          <p className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Plajah Academia · World History</p>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter mt-1 flex items-center gap-3">
            <Globe size={40} style={{ color: ACCENT }} /> World History
          </h1>
          <p className="text-sm text-white/45 mt-2 max-w-2xl">The best place to learn world history online — the people who shaped it, the civilisations that rose and fell, the eras that connect them, the artifacts they left behind, and the open archives where the primary record still lives.</p>
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
                { label: 'Figures', value: HISTORY_FIGURES.length, icon: Users, to: 'figures' as Tab },
                { label: 'Civilizations', value: CIVILIZATIONS.length, icon: Landmark, to: 'civilizations' as Tab },
                { label: 'Eras', value: HISTORY_ERAS.length, icon: Clock, to: 'timeline' as Tab },
                { label: 'Open Archives', value: PRIMARY_SOURCES.length, icon: ScrollText, to: 'sources' as Tab },
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
                { t: 'The People', d: 'From Hammurabi to Mandela — the rulers, thinkers, explorers and revolutionaries who bent the arc of history, each with a live biography.', icon: Users, to: 'figures' as Tab },
                { t: 'Civilizations', d: 'Mesopotamia to the Ottomans — read every great civilisation through its hallmarks, span and living Wikipedia record.', icon: Landmark, to: 'civilizations' as Tab },
                { t: 'The Timeline', d: 'Prehistory to the present in nine eras — the developments and turning points that link one age to the next.', icon: Clock, to: 'timeline' as Tab },
                { t: 'Artifacts', d: 'A live wall of objects from the world’s great museums — Egyptian, classical, Islamic, Mesoamerican and more.', icon: Boxes, to: 'artifacts' as Tab },
                { t: 'Primary Sources', d: 'The open archives and free APIs where the raw record of history lives — from the Library of Congress to Europeana.', icon: ScrollText, to: 'sources' as Tab },
                { t: 'The Library', d: 'Free, complete world-history textbooks plus the latest open research on the history of science.', icon: Library, to: 'library' as Tab },
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

        {/* FIGURES */}
        {tab === 'figures' && (
          <MuseumHall eyebrow="The Makers of History" title="Figures Who Shaped the World"
            intro="The rulers, thinkers, explorers and revolutionaries who changed the course of human events — enrich each with a live biography and portrait."
            halls={HISTORY_FIGURE_HALLS} figures={HISTORY_FIGURES} accent={ACCENT} icon={Landmark} shareDiscipline="World History" />
        )}

        {/* CIVILIZATIONS */}
        {tab === 'civilizations' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {CIVILIZATIONS.map(c => <CivCard key={c.id} civ={c} onOpen={() => setOpenCiv(c)} />)}
          </div>
        )}

        {/* TIMELINE */}
        {tab === 'timeline' && (
          <div className="space-y-3">
            {HISTORY_ERAS.map((era, i) => (
              <motion.div key={era.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h3 className="text-xl font-black uppercase tracking-tight">{era.title}</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: ACCENT }}>{era.span}</span>
                </div>
                <p className="text-[13px] text-white/55 leading-relaxed mt-2">{era.essay}</p>
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">Developments</p>
                    <ul className="space-y-1">{era.developments.map(b => <li key={b} className="text-[12px] text-white/55 flex gap-2"><span style={{ color: ACCENT }}>·</span>{b}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">Turning Points</p>
                    <ul className="space-y-1">{era.turningPoints.map(b => <li key={b} className="text-[12px] text-white/55 flex gap-2"><span style={{ color: ACCENT }}>·</span>{b}</li>)}</ul>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ARTIFACTS */}
        {tab === 'artifacts' && (
          <ArtifactBrowser collections={ARTIFACT_COLLECTIONS} accent={ACCENT} discipline="World History"
            intro="A live wall of objects from the world’s great museums. Browse a civilisation or free-search the collections of the Met and beyond." />
        )}

        {/* PRIMARY SOURCES */}
        {tab === 'sources' && (
          <div className="space-y-4">
            <p className="text-[13px] text-white/50 leading-relaxed max-w-2xl">The raw record of history — digitised and open. Every archive below is free to explore, and most expose a public API you can build on.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRIMARY_SOURCES.map(s => (
                <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all block">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><ScrollText size={14} style={{ color: ACCENT }} /><p className="text-[13px] font-black text-white">{s.name}</p></div>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[7px] font-black uppercase tracking-widest text-white/45 shrink-0">{s.access}</span>
                  </div>
                  <p className="text-[10px] text-white/35 mt-0.5">{s.org}</p>
                  <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">{s.desc}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* LIBRARY — textbooks + papers */}
        {tab === 'library' && (
          <div className="space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Free Textbooks · OpenStax</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {HISTORY_BOOKS.map(b => (
                  <div key={b.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-black text-white leading-tight">{b.title}</p>
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[7px] font-black uppercase text-emerald-400 shrink-0">Free</span>
                    </div>
                    {b.description && <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed">{b.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {b.epubUrl && (
                        <button onClick={() => setReaderBook(textbookToAlbum(b))} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest" style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>
                          Read in Lorea <BookOpen size={10} />
                        </button>
                      )}
                      <a href={b.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/8 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
                        Read online <ExternalLink size={10} />
                      </a>
                      {b.pdfLink && (
                        <a href={b.pdfLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/8 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
                          PDF <FileText size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Latest Research · arXiv · History &amp; Philosophy of Science</p>
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

        {/* FEED — dedicated world-history feed */}
        {tab === 'feed' && (
          <div className="space-y-4">
            {auth.currentUser && (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                placeholder="Share a figure, a civilisation, an artifact, or an idea about world history…"
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
                    text: `#WorldHistory ${data.text}`,
                    isPublic: true,
                    tags: ['history'],
                    ...(data.theme && data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                    ...(media.length > 0 ? { media } : {}),
                  } as any);
                }}
              />
            )}
            {historyPosts.length > 0 ? (
              <div className="space-y-3">{historyPosts.map(p => <PostCard key={p.id} post={p} />)}</div>
            ) : (
              <div className="py-16 text-center">
                <MessageSquare size={32} className="text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No World History posts yet</p>
                <p className="text-[10px] text-white/15 mt-1">Be the first to share something about world history</p>
              </div>
            )}
          </div>
        )}
      </div>

      {openCiv && <CivModal civ={openCiv} onClose={() => setOpenCiv(null)} />}
    </div>
  );
};

export default WorldHistoryDisciplineView;
