// TelaTemplateGallery — ONE gallery for every Tela template family.
//
// Cards are the real template (TelaStaticSvg of page 1 — never a CSS
// approximation), built lazily as they scroll into view. Selecting a card
// opens a detail rail with every page, the design lesson + history, "Use this
// template", "Add to my interests" and "Learn more on Plajah".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Compass, Heart, Layers, Search, Sparkles, X, ArrowRight, Clapperboard } from 'lucide-react';
import type { TelaVectorObject } from '../../types';
import { TelaStaticSvg } from './TelaVector';
import { TELA_TEMPLATE_GALLERY, GALLERY_COLLECTIONS, type TelaDesignTemplate } from '../../services/tela/telaTemplateRegistry';
import type { GalleryCollection } from '../../services/tela/designs/types';
import { ensureFontsForObjects } from '../../services/tela/telaFonts';
import { addDesignInterest, hasDesignInterest, openDesignHistory } from '../../services/designInterests';

const pageCache = new Map<string, TelaVectorObject[]>();
function buildPage(t: TelaDesignTemplate, i: number): TelaVectorObject[] {
  const key = `${t.id}#${i}`;
  let v = pageCache.get(key);
  if (!v) { try { v = t.pages[i]?.build() || []; } catch { v = []; } pageCache.set(key, v); ensureFontsForObjects(v); }
  return v;
}

/** Lazy thumbnail: builds the page only once the card is near the viewport. */
const Thumb: React.FC<{ t: TelaDesignTemplate; page?: number; className?: string }> = ({ t, page = 0, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(el); return () => io.disconnect();
  }, [near]);
  const objects = near ? buildPage(t, page) : null;
  return <div ref={ref} className={className} style={{ aspectRatio: `${t.width}/${t.height}`, background: t.palette[0], overflow: 'hidden' }}>
    {objects && <TelaStaticSvg objects={objects} width={t.width} height={t.height} />}
  </div>;
};

export interface TelaTemplateGalleryProps {
  onUse: (template: TelaDesignTemplate) => void;
  initialCollection?: GalleryCollection | 'ALL';
  /** Hide collections that don't apply in this context (e.g. lower thirds inside a paper doc). */
  collections?: GalleryCollection[];
  compact?: boolean;
  title?: string;
}

export default function TelaTemplateGallery({ onUse, initialCollection = 'ALL', collections, compact, title }: TelaTemplateGalleryProps) {
  const [collection, setCollection] = useState<GalleryCollection | 'ALL'>(initialCollection);
  const [group, setGroup] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<TelaDesignTemplate | null>(null);
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState<'idle' | 'added' | 'exists' | 'signin' | 'failed'>('idle');
  const cols = useMemo(() => GALLERY_COLLECTIONS.filter(c => !collections || collections.includes(c.id)), [collections]);
  const all = useMemo(() => TELA_TEMPLATE_GALLERY.filter(t => !collections || collections.includes(t.collection)), [collections]);
  const groups = useMemo(() => [...new Set(all.filter(t => collection === 'ALL' || t.collection === collection).map(t => t.group))], [all, collection]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(t => (collection === 'ALL' || t.collection === collection) && (group === 'ALL' || t.group === group) && (!needle || `${t.name} ${t.tagline} ${t.description} ${t.group} ${t.tags.join(' ')} ${t.lesson.interestTag}`.toLowerCase().includes(needle)));
  }, [all, collection, group, q]);
  useEffect(() => { setGroup('ALL'); }, [collection]);
  useEffect(() => { setPage(0); setSaved('idle'); }, [sel?.id]);

  const interest = sel ? hasDesignInterest(sel.lesson.interestTag) : false;
  const save = async () => { if (!sel) return; const r = await addDesignInterest(sel.lesson.interestTag, sel.lesson.related); setSaved(r); };

  return <section className="overflow-hidden rounded-[20px]" style={{ background: 'radial-gradient(circle at 12% 0%,rgba(140,44,183,.2),transparent 32%),linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.02))', border: '1px solid rgba(255,255,255,.12)' }}>
    <div className="p-4 sm:p-5" style={{ borderBottom: '1px solid rgba(255,255,255,.09)' }}>
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="mr-auto">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.18em] text-fuchsia-200/70"><Sparkles size={13} /> TEMPLATE GALLERY</div>
          <h3 className="mt-1 font-display italic text-[1.35rem] text-white">{title || 'Designed starting points, each with its lesson'}</h3>
          <p className="mt-1 max-w-2xl text-[.7rem] leading-relaxed text-white/45">{all.length} templates across documents, publications, posters, social, presentations and Fabula lower thirds — every page fully editable, every style with a short history and the option to keep learning on Plajah.</p>
        </div>
        <label className="h-10 min-w-[260px] flex items-center gap-2 px-3 rounded-[11px] bg-black/20 border border-white/10"><Search size={14} className="text-white/35" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Bauhaus, magazine, punk, newsletter…" className="flex-1 bg-transparent outline-none text-[.72rem] text-white placeholder:text-white/25" /></label>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        <button onClick={() => setCollection('ALL')} className="shrink-0 h-7 px-3 rounded-full text-[8px] font-black tracking-[.08em]" style={{ background: collection === 'ALL' ? '#fff' : 'rgba(255,255,255,.05)', color: collection === 'ALL' ? '#211427' : 'rgba(255,255,255,.5)' }}>ALL · {all.length}</button>
        {cols.map(c => { const n = all.filter(t => t.collection === c.id).length; if (!n) return null; return <button key={c.id} title={c.blurb} onClick={() => setCollection(c.id)} className="shrink-0 h-7 px-3 rounded-full text-[8px] font-black tracking-[.08em]" style={{ background: collection === c.id ? 'linear-gradient(135deg,#6B0099,#D40055)' : 'rgba(255,255,255,.05)', color: collection === c.id ? '#fff' : 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.07)' }}>{c.label.toUpperCase()} · {n}</button>; })}
      </div>
      {groups.length > 1 && <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
        <button onClick={() => setGroup('ALL')} className="shrink-0 h-6 px-2.5 rounded-[7px] text-[8px] font-extrabold" style={{ color: group === 'ALL' ? '#fff' : 'rgba(255,255,255,.42)', background: group === 'ALL' ? 'rgba(107,0,153,.55)' : 'rgba(255,255,255,.04)' }}>EVERYTHING</button>
        {groups.map(g => <button key={g} onClick={() => setGroup(g)} className="shrink-0 h-6 px-2.5 rounded-[7px] text-[8px] font-extrabold" style={{ color: group === g ? '#fff' : 'rgba(255,255,255,.42)', background: group === g ? 'rgba(107,0,153,.55)' : 'rgba(255,255,255,.04)' }}>{g}</button>)}
      </div>}
    </div>

    <div className="flex flex-col lg:flex-row">
      <div className={`flex-1 min-w-0 p-4 sm:p-5 grid gap-3 ${compact ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'}`} style={{ alignContent: 'start' }}>
        {rows.map(t => {
          const active = sel?.id === t.id;
          return <button key={t.id} onClick={() => setSel(active ? null : t)} onDoubleClick={() => onUse(t)} className="group overflow-hidden rounded-[14px] text-left transition-transform hover:-translate-y-0.5" style={{ background: 'rgba(0,0,0,.22)', border: `1px solid ${active ? 'rgba(216,93,255,.8)' : 'rgba(255,255,255,.1)'}`, boxShadow: active ? '0 0 0 2px rgba(140,44,183,.22),0 18px 45px rgba(0,0,0,.3)' : undefined }}>
            <div className="relative p-2.5 pb-0"><div className="rounded-[6px] overflow-hidden" style={{ boxShadow: '0 6px 18px rgba(0,0,0,.45)' }}><Thumb t={t} /></div>
              {t.collection === 'LOWER_THIRD' && <span className="absolute top-4 right-4 grid place-items-center w-6 h-6 rounded-full text-white" style={{ background: 'rgba(0,0,0,.55)' }} title="Motion template for Fabula"><Clapperboard size={12} /></span>}
              {active && <span className="absolute top-4 left-4 grid place-items-center w-6 h-6 rounded-full text-white" style={{ background: '#8C2CB7' }}><Check size={13} /></span>}
            </div>
            <div className="p-3"><div className="flex items-baseline gap-2"><strong className="text-[11.5px] text-white/90 leading-tight">{t.name}</strong><span className="ml-auto text-[7.5px] font-black tracking-[.1em] text-white/35 shrink-0">{t.group}</span></div>
              <p className="mt-1 text-[9.5px] leading-snug text-white/45 line-clamp-2">{t.tagline}</p>
              <div className="mt-2 flex items-center gap-1">{t.palette.slice(0, 4).map((c, i) => <span key={i} className="w-3 h-3 rounded-full border border-white/15" style={{ background: c }} />)}<span className="ml-auto text-[7.5px] text-white/30">{t.pages.length > 1 ? `${t.pages.length} pages` : `${t.width}×${t.height}`}</span></div>
            </div>
          </button>;
        })}
        {!rows.length && <div className="col-span-full py-14 text-center text-white/35 text-sm">Nothing matches. Try a movement, a format, or a mood.</div>}
      </div>

      {sel && <aside className="lg:w-[380px] shrink-0 p-4 sm:p-5 lg:border-l border-t lg:border-t-0" style={{ borderColor: 'rgba(255,255,255,.1)', background: 'rgba(10,7,14,.55)' }}>
        <div className="sticky top-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0"><div className="text-[8px] font-black tracking-[.16em] text-fuchsia-200/60">{GALLERY_COLLECTIONS.find(c => c.id === sel.collection)?.label.toUpperCase()} · {sel.group}</div><h4 className="mt-0.5 text-[1.05rem] font-extrabold text-white leading-tight">{sel.name}</h4><p className="mt-1 text-[.68rem] leading-relaxed text-white/55">{sel.tagline}</p>{sel.audience && <p className="mt-1 text-[.62rem] text-amber-200/70">{sel.audience}</p>}</div>
            <button onClick={() => setSel(null)} className="ml-auto grid place-items-center w-8 h-8 rounded-[9px] text-white/55 bg-white/[.06] shrink-0"><X size={14} /></button>
          </div>
          <div className="mt-3 rounded-[10px] overflow-hidden" style={{ boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}><Thumb t={sel} page={page} /></div>
          {sel.pages.length > 1 && <div className="mt-2 flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">{sel.pages.map((p, i) => <button key={i} onClick={() => setPage(i)} className="shrink-0 w-[54px] rounded-[5px] overflow-hidden" style={{ border: `1px solid ${page === i ? 'rgba(216,93,255,.9)' : 'rgba(255,255,255,.12)'}` }} title={p.label}><Thumb t={sel} page={i} /></button>)}</div>}
          <div className="mt-1 text-[8px] text-white/35">{sel.pages[page]?.label} · {sel.width}×{sel.height}</div>
          <button onClick={() => onUse(sel)} className="mt-3 w-full h-10 rounded-[11px] text-[.68rem] font-black text-white flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 8px 24px rgba(140,44,183,.3)' }}><Layers size={13} />{sel.collection === 'LOWER_THIRD' ? 'OPEN DESIGN IN TELA' : `USE THIS TEMPLATE${sel.pages.length > 1 ? ` · ${sel.pages.length} PAGES` : ''}`}<ArrowRight size={12} /></button>
          {sel.collection === 'LOWER_THIRD' && <p className="mt-1.5 text-[.6rem] text-white/40">To add it with motion, open Fabula → timeline → <b>+ LOWER THIRD</b>.</p>}
          <div className="mt-4 p-3 rounded-[12px]" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <div className="flex items-center gap-2 text-[8px] font-black tracking-[.16em] text-fuchsia-200/65"><BookOpen size={11} /> DESIGN LESSON</div>
            <p className="mt-1.5 text-[.7rem] leading-relaxed text-white/85">{sel.lesson.principle}</p>
            <div className="mt-3 text-[8px] font-black tracking-[.16em] text-white/35">A LITTLE HISTORY</div>
            <p className="mt-1 text-[.66rem] leading-relaxed text-white/60">{sel.lesson.history}</p>
            <div className="mt-3 text-[8px] font-black tracking-[.16em] text-white/35">TRY THIS</div>
            <p className="mt-1 text-[.66rem] leading-relaxed text-white/60">{sel.lesson.tryThis}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="flex-1 h-9 rounded-[10px] text-[.62rem] font-extrabold flex items-center justify-center gap-1.5" style={{ background: interest || saved === 'added' || saved === 'exists' ? 'rgba(212,0,85,.22)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff' }}><Heart size={12} fill={interest || saved === 'added' || saved === 'exists' ? '#FF76A8' : 'none'} />{saved === 'added' ? 'Added to interests' : saved === 'exists' || interest ? `${sel.lesson.interestTag} · saved` : `Add “${sel.lesson.interestTag}” to interests`}</button>
            <button onClick={() => openDesignHistory(sel.lesson.interestTag, sel.family)} className="h-9 px-3 rounded-[10px] text-[.62rem] font-extrabold flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff' }} title="Keep learning about this style in the Plajah Art Museum"><Compass size={12} />Learn more</button>
          </div>
          {saved === 'signin' && <p className="mt-1.5 text-[.6rem] text-amber-200/70">Saved on this device — sign in to keep it on your profile.</p>}
          {saved === 'failed' && <p className="mt-1.5 text-[.6rem] text-rose-300/80">Couldn’t save right now. Try again in a moment.</p>}
        </div>
      </aside>}
    </div>
  </section>;
}
