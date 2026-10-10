import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Download, Highlighter, List, MessageSquare, Rows3, Settings2, Trash2 } from 'lucide-react';
import type { Album, TelaDoc, TelaFrame } from '../../types';
import TelaEmbed from '../tela/TelaEmbed';
import type { BookTelaBundle } from '../../services/bookTela/upgrade';
import { bookFromBundle } from '../../services/bookTela/upgrade';
import { parseFrameId } from '../../services/bookTela/bookToTela';
import { ENHANCEMENTS, resolveStrategy } from '../../services/bookTela/enhancements';
import { stripTags } from '../../services/bookTela/html';
import { decideExportRights } from '../../services/bookTela/export/rights';
import type { ContentLicense } from '../../services/contentLicense';
import type { EnhancementInstance } from '../../services/bookTela/types';
import TelaLivePage, { type TelaLivePageHandle } from '../living/TelaLivePage';
import { LivingReaderBar, useLivingPrefs } from '../living/LivingReaderBar';
import { frameObjects, frameSize, hasLiving, livingPageFor } from '../../services/living/runtime/objects';
import { loadBookAudio } from '../../services/living/runtime/audioProvider';
import type { BookAudioApi } from '../../services/living/contracts';
import { isChildrensBook } from '../../services/living/audio/audience';
import PageTurn from '../lorea/PageTurn';
import PageTurnSettings from '../lorea/PageTurnSettings';
import { usePageTurn } from '../lorea/usePageTurn';
import { dirForArrowKey, dirForTapSide, inferBookKind, sanitizeAuthorPageTurn } from '../../services/lorea/pageTransitions';

const ExportDialog = lazy(() => import('./ExportDialog'));

interface Props {
  album: Album;
  bundle: BookTelaBundle;
  pin: 'follow-latest' | 'pinned';
  uid?: string;
  isOwner: boolean;
  isPaid: boolean;
  license: ContentLicense | null;
  onBack: () => void;
}

// Position: same key + shape as the classic reader ({chapter, page}) so switching readers keeps your place.
const POS_KEY = (id: string) => `lorea_pos_${id}`;
const MARK_KEY = (id: string) => `plajah-bookmarks-${id}`;
const NOTE_KEY = (id: string) => `plajah-tela-notes-${id}`;
const LAYOUT_KEY = 'lorea_tela_layout';

interface Mark { id: string; frameId: string; blockId: string; start: number; end: number; text: string; note?: string; createdAt: number }
const readJson = <T,>(k: string, d: T): T => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) as T : d; } catch { return d; } };
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

/** One frame as its own tiny doc, so a 300-page book does not rebuild render maps for every frame. */
function slice(doc: TelaDoc, f: TelaFrame): TelaDoc {
  const devices: TelaDoc['devices'] = {}; for (const id of f.deviceIds) if (doc.devices[id]) devices[id] = doc.devices[id];
  return { ...doc, frames: [f], devices };
}

function LazyFrame({ eager, height, children }: { eager: boolean; height: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(eager);
  useEffect(() => {
    if (on || !ref.current || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: '1400px 0px' });
    io.observe(ref.current); return () => io.disconnect();
  }, [on]);
  return <div ref={ref} style={on ? undefined : { minHeight: height }}>{on ? children : null}</div>;
}

export default function TelaBookReader({ album, bundle, pin, uid, isOwner, isPaid, license, onBack }: Props) {
  const doc = bundle.doc;
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [viewH, setViewH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  const [showTOC, setShowTOC] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCommentary, setShowCommentary] = useState(false);
  const [marks, setMarks] = useState<Mark[]>(() => readJson(NOTE_KEY(album.id), []));
  const [sel, setSel] = useState<{ x: number; y: number; mark: Omit<Mark, 'id' | 'createdAt'> } | null>(null);

  // ── living pages (docs/LIVING_RUNTIME.md): pages with `doc.living` data render live; everything else is the static device
  const living = doc.living;
  const hasLive = !!living && living.pages.some(p => hasLiving(living, p.page));
  const lp = useLivingPrefs(living?.defaults ? { narrate: living.defaults.narrate } : undefined);
  const [audio, setAudio] = useState<BookAudioApi | null>(null);
  const liveRef = useRef<TelaLivePageHandle>(null);
  const [turnBusy, setTurnBusy] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    if (!hasLive) return; let on = true;
    void loadBookAudio(living!.scores).then(a => { if (on) setAudio(a); });
    return () => { on = false; };
  }, [hasLive, living]);
  useEffect(() => { if (!audio) return; audio.setGains({ music: living?.defaults?.musicGain, sfx: living?.defaults?.sfxGain }); }, [audio, living]);
  useEffect(() => { if (audio) audio.setMuted(!lp.soundOn); }, [audio, lp.soundOn]);
  // Children's books get the children's narration voice (steadier delivery + pronunciation/tone pass); everything else keeps Aria's default.
  useEffect(() => { (audio as { setAudience?: (a: 'children' | 'general') => void } | null)?.setAudience?.(isChildrensBook(album) ? 'children' : 'general'); }, [audio, album]);
  useEffect(() => () => { audio?.stopAll(); }, [audio]);

  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return;
    const measure = () => { setWidth(Math.max(280, Math.min(el.clientWidth - 32, 560))); setViewH(el.clientHeight || window.innerHeight); };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);

  const frames = doc.frames;
  const slices = useMemo(() => frames.map(f => slice(doc, f)), [doc, frames]);
  const enhs = bundle.enhancements;
  const frameOfBlock = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of frames) for (const id of f.deviceIds) { const d = doc.devices[id]; if (d?.type === 'WRITER') for (const b of d.blocks) m.set(b.id, f.id); }
    return m;
  }, [doc, frames]);
  const extrasByFrame = useMemo(() => {
    const m = new Map<string, EnhancementInstance[]>();
    for (const e of enhs) {
      if (ENHANCEMENTS[e.type]?.placement !== 'text' || resolveStrategy(e).strategy === 'omit-note') continue;
      let fid = e.afterBlockId && e.afterBlockId !== 'start' ? frameOfBlock.get(e.afterBlockId) : undefined;
      if (!fid) { const last = [...frames].reverse().find(f => { const r = parseFrameId(doc.id, f.id); return r.role === 'writer' && r.chapterId === e.chapterId; }); fid = last?.id; }
      if (fid) m.set(fid, [...(m.get(fid) || []), e]);
    }
    return m;
  }, [enhs, frames, frameOfBlock, doc.id]);

  // ── position: restore + save (chapter index + frame index inside the chapter, same shape as the classic reader)
  const chapters = bundle.toc;
  const frameChapter = useMemo(() => frames.map(f => { const r = parseFrameId(doc.id, f.id); return 'chapterId' in r ? r.chapterId : '' }), [frames, doc.id]);
  const posFor = useCallback((frameIdx: number) => { const cid = frameChapter[frameIdx]; const ci = Math.max(0, chapters.findIndex(c => c.chapterId === cid)); const first = frameChapter.indexOf(cid); return { chapter: ci, page: Math.max(0, frameIdx - first) }; }, [frameChapter, chapters]);
  // ── paged mode (page turns). Scroll mode is the original reader and stays the default unless the author chose a page turn.
  const rtl = (album as { readingDir?: string }).readingDir === 'rtl';
  const author = useMemo(() => sanitizeAuthorPageTurn(bundle.pageTurn), [bundle.pageTurn]);
  const bookKind = inferBookKind({ visualLed: bundle.book.visualLed, rtl });
  const [layout, setLayout] = useState<'scroll' | 'paged'>(() => {
    const saved = readJson<string>(LAYOUT_KEY, '');
    if (saved === 'scroll' || saved === 'paged') return saved;
    return (author?.style && author.style !== 'auto' && author.style !== 'none') || bundle.book.visualLed ? 'paged' : 'scroll';
  });
  const paged = layout === 'paged';
  const [pageIdx, setPageIdx] = useState(() => {
    const saved = readJson<{ chapter: number; page: number }>(POS_KEY(album.id), { chapter: 0, page: 0 });
    const cid = chapters[saved.chapter]?.chapterId; const base = cid ? frameChapter.indexOf(cid) : -1;
    return base < 0 ? 0 : Math.min(frames.length - 1, base + Math.max(0, saved.page));
  });
  const topFrame = useRef(0);
  const goTo = useCallback((i: number) => setPageIdx(Math.max(0, Math.min(frames.length - 1, i))), [frames.length]);
  const pt = usePageTurn({ kind: bookKind, author, chapterId: frameChapter[pageIdx], pageId: frames[pageIdx]?.id });
  const [showAnim, setShowAnim] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const setLayoutPersist = (l: 'scroll' | 'paged') => {
    if (l === 'paged') setPageIdx(Math.max(0, Math.min(frames.length - 1, topFrame.current)));
    else setTimeout(() => document.getElementById(`tbr-f-${pageIdx}`)?.scrollIntoView({ block: 'start' }), 60);
    setLayout(l); writeJson(LAYOUT_KEY, l);
  };
  useEffect(() => { if (paged) writeJson(POS_KEY(album.id), posFor(pageIdx)); }, [paged, pageIdx, album.id, posFor]);
  useEffect(() => {
    if (!paged) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const d = dirForArrowKey(e.key, rtl); if (d) goTo(pageIdx + d);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [paged, rtl, pageIdx, goTo]);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return; restored.current = true;
    if (paged) return;                 // paged mode starts on the saved page directly
    const saved = readJson<{ chapter: number; page: number }>(POS_KEY(album.id), { chapter: 0, page: 0 });
    const cid = chapters[saved.chapter]?.chapterId; if (!cid || (saved.chapter === 0 && saved.page === 0)) return;
    const idx = frameChapter.indexOf(cid) + saved.page;
    setTimeout(() => document.getElementById(`tbr-f-${Math.min(idx, frames.length - 1)}`)?.scrollIntoView({ block: 'start' }), 80);
  }, [album.id, chapters, frameChapter, frames.length]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<number, number>();
    const io = new IntersectionObserver(es => {
      for (const e of es) { const i = Number((e.target as HTMLElement).dataset.fi); if (e.isIntersecting) seen.set(i, e.intersectionRatio); else seen.delete(i); }
      if (!seen.size) return; const top = Math.min(...seen.keys()); topFrame.current = top; if (!paged) { writeJson(POS_KEY(album.id), posFor(top)); setScrollTop(top); }
    }, { threshold: [0, 0.25, 0.6] });
    document.querySelectorAll('[data-fi]').forEach(n => io.observe(n)); return () => io.disconnect();
  }, [album.id, posFor, slices.length, paged]);

  const jumpToChapter = (cid: string) => { const i = frameChapter.indexOf(cid); setShowTOC(false); if (paged) { goTo(i); return; } document.getElementById(`tbr-f-${i}`)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };

  // ── highlights: capture a selection inside a Writer block, paint with the CSS Custom Highlight API where it exists
  useEffect(() => { writeJson(NOTE_KEY(album.id), marks); }, [marks, album.id]);
  const onSelectEnd = useCallback(() => {
    const s = window.getSelection(); if (!s || s.isCollapsed || !s.rangeCount) { setSel(null); return; }
    const r = s.getRangeAt(0); const startEl = (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer as HTMLElement)?.closest('[data-block-id]') as HTMLElement | null;
    const endEl = (r.endContainer.nodeType === 3 ? r.endContainer.parentElement : r.endContainer as HTMLElement)?.closest('[data-block-id]') as HTMLElement | null;
    if (!startEl || startEl !== endEl) { setSel(null); return; }
    const pre = document.createRange(); pre.selectNodeContents(startEl); pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length; const text = r.toString(); if (!text.trim()) { setSel(null); return; }
    const frameEl = startEl.closest('[data-frame-id]') as HTMLElement | null;
    const box = r.getBoundingClientRect();
    setSel({ x: box.left + box.width / 2, y: box.top, mark: { frameId: frameEl?.dataset.frameId || '', blockId: startEl.dataset.blockId || '', start, end: start + text.length, text: text.slice(0, 400) } });
  }, []);
  useEffect(() => {
    const CSSAny = (window as any).CSS; const HL = (window as any).Highlight; if (!CSSAny?.highlights || !HL) return;
    const ranges: Range[] = [];
    for (const m of marks) {
      const el = document.querySelector(`[data-block-id="${CSS.escape(m.blockId)}"]`); if (!el) continue;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let pos = 0; let n: Node | null; const rg = document.createRange(); let a = false;
      while ((n = w.nextNode())) { const len = (n.textContent || '').length; if (!a && m.start < pos + len) { rg.setStart(n, m.start - pos); a = true; } if (a && m.end <= pos + len) { rg.setEnd(n, m.end - pos); ranges.push(rg); break; } pos += len; }
    }
    CSSAny.highlights.set('pj-user-hl', new HL(...ranges));
  });

  /** One page: the live runtime when this page has living data, the static Tela device otherwise (also the fallback). */
  const renderPage = (i: number, active: boolean, w: number) => {
    const f = frames[i];
    if (hasLive && hasLiving(living, i + 1)) {
      const objs = frameObjects(doc, f);
      if (objs.length) {
        const size = frameSize(doc, f);
        return (
          <div key={f.id} style={{ width: w, margin: "0 auto" }} data-living-page-frame={i + 1}>
            <TelaLivePage ref={active ? liveRef : undefined} objects={objs} width={size.width} height={size.height} living={livingPageFor(living, i + 1)!}
              audio={audio} reducedMotion={lp.reduced} soundEnabled={lp.soundOn} active={active} autoNarrate={lp.narrate === 'auto'} hints={lp.hints} label={f.label || undefined}
              onGoto={p => goTo(p === 'next' ? i + 1 : p === 'prev' ? i - 1 : p - 1)}
              onGoal={(pg, id) => { const k = `plajah-living-goals-${album.id}`; writeJson(k, { ...readJson<Record<string, number>>(k, {}), [`${pg}:${id}`]: Date.now() }); }} />
          </div>
        );
      }
    }
    return <TelaEmbed snapshot={slices[i]} docId={doc.id} frameId={f.id} mode={pin === 'pinned' ? 'pinned' : 'follow-latest'} width={w} versionLabel={bundle.label} />;
  };

  // ── export rights: pinned bundle, same decision function as the author flow
  const rights = decideExportRights({ isOwner, signedIn: !!uid, isPaid, license: license ? { grant: license.grant, delivery: license.delivery, issuedAt: license.issuedAt, expiresAt: license.expiresAt, watermarkTag: license.watermarkTag } : null, bookLicense: album.bookDistribution?.license, watermarkOn: album.bookDistribution?.watermark });
  const bookForExport = useMemo(() => ({ ...bookFromBundle(bundle), ownerId: album.ownerId }), [bundle, album.ownerId]);

  return (
    <div ref={rootRef} className="pj-tela-reader fixed inset-0 z-[80] overflow-y-auto bg-[#0A0A0A] text-white" onMouseUp={onSelectEnd} onTouchEnd={() => setTimeout(onSelectEnd, 0)}
      onPointerDownCapture={hasLive ? () => { lp.markGesture(); void audio?.unlock(); } : undefined} onKeyDownCapture={hasLive ? (e => { if (e.key === 'Enter' || e.key === ' ') { lp.markGesture(); void audio?.unlock(); } }) : undefined}>
      <style>{`::highlight(pj-user-hl){background:rgba(255,200,0,.38);color:inherit}@media (prefers-reduced-motion: reduce){.pj-tela-reader *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`}</style>
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-[#0A0A0A]/90 backdrop-blur border-b border-white/10">
        <button onClick={onBack} aria-label="Back" className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><ChevronLeft size={20} /></button>
        <div className="min-w-0 flex-1"><p className="text-sm font-black truncate">{album.title}</p><p className="text-[10px] text-white/40">{pin === 'pinned' ? 'Tela edition, the version you bought' : 'Tela edition'}</p></div>
        <button onClick={() => setShowTOC(v => !v)} aria-expanded={showTOC} aria-label="Contents" className="h-11 w-11 rounded-full hover:bg-white/10 flex items-center justify-center"><List size={18} /></button>
        <button onClick={() => setShowNotes(v => !v)} aria-expanded={showNotes} aria-label="Highlights and notes" className="h-11 w-11 rounded-full hover:bg-white/10 flex items-center justify-center"><Highlighter size={18} /></button>
        <button onClick={() => setLayoutPersist(paged ? 'scroll' : 'paged')} aria-pressed={paged} aria-label={paged ? 'Switch to continuous scroll' : 'Switch to turning pages'} title={paged ? 'Pages (tap for scroll)' : 'Scroll (tap for pages)'} className={`h-11 w-11 rounded-full flex items-center justify-center ${paged ? 'bg-white/15' : 'hover:bg-white/10'}`}>{paged ? <BookOpen size={18} /> : <Rows3 size={18} />}</button>
        {paged && <button onClick={() => setShowAnim(v => !v)} aria-expanded={showAnim} aria-label="Page animation" className="h-11 w-11 rounded-full hover:bg-white/10 flex items-center justify-center"><Settings2 size={18} /></button>}
        {enhs.some(e => e.type === 'COMMENTARY') && <button onClick={() => setShowCommentary(v => !v)} aria-pressed={showCommentary} aria-label="Author commentary" className={`h-11 w-11 rounded-full flex items-center justify-center ${showCommentary ? 'bg-amber-400 text-black' : 'hover:bg-white/10'}`}><MessageSquare size={18} /></button>}
        {rights.allowed && <button onClick={() => setShowExport(true)} aria-label="Download EPUB or PDF" className="h-11 w-11 rounded-full hover:bg-white/10 flex items-center justify-center"><Download size={18} /></button>}
      </header>
      {hasLive && <LivingReaderBar prefs={lp} onReplay={() => liveRef.current?.replay()} onReadNow={() => liveRef.current?.narrate()} />}

      {showTOC && (
        <nav aria-label="Contents" className="max-w-[592px] mx-auto m-4 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          <ol>{chapters.map((c, i) => <li key={c.chapterId}><button onClick={() => jumpToChapter(c.chapterId)} className="w-full text-left px-3 py-3 min-h-[44px] rounded-xl hover:bg-white/10 text-sm">{i + 1}. {c.title}</button></li>)}</ol>
        </nav>
      )}
      {showNotes && (
        <aside aria-label="Highlights and notes" className="max-w-[592px] mx-auto m-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          {marks.length === 0 ? <p className="text-sm text-white/45">Select some text to highlight it and add a note. Highlights stay on this device.</p> : (
            <ul className="space-y-2">{marks.map(m => (
              <li key={m.id} className="rounded-xl bg-white/[0.04] p-2.5 text-sm">
                <button className="text-left w-full" onClick={() => { const fi = frames.findIndex(f => f.id === m.frameId); if (paged) goTo(fi); else document.getElementById(`tbr-f-${fi}`)?.scrollIntoView({ block: 'start' }); }}>“{m.text}”</button>
                <label className="sr-only" htmlFor={`n-${m.id}`}>Note</label>
                <input id={`n-${m.id}`} value={m.note || ''} placeholder="Add a note" onChange={e => setMarks(ms => ms.map(x => x.id === m.id ? { ...x, note: e.target.value } : x))} className="mt-1 w-full bg-transparent border-b border-white/15 text-[13px] py-1 outline-none" />
                <button aria-label="Delete highlight" className="mt-1 text-white/35 hover:text-red-300" onClick={() => setMarks(ms => ms.filter(x => x.id !== m.id))}><Trash2 size={14} /></button>
              </li>))}</ul>)}
        </aside>
      )}

      {showAnim && paged && (
        <aside aria-label="Page animation" className="max-w-[592px] mx-auto m-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <PageTurnSettings pref={pt.prefs.animation} onPref={pt.setAnimation} sound={pt.prefs.sound} onSound={pt.setSound} resolved={pt.turn} reducedMotion={pt.reducedMotion} cardClass="bg-white/10" activeClass="bg-amber-400 text-black" />
        </aside>
      )}

      {paged ? (() => {
        const fitW = (i: number) => { const f = frames[i]; return Math.max(240, Math.min(width, Math.floor(((viewH - 170) * f.w) / Math.max(1, f.h)))); };
        const renderFrame = (i: number, live: boolean) => {
          const f = frames[i]; const extras = extrasByFrame.get(f.id) || [];
          return (
            <section {...(live ? { id: `tbr-f-${i}`, 'data-fi': i, 'data-frame-id': f.id } : {})} aria-label={f.label || undefined} className="w-full">
              {renderPage(i, live && i === pageIdx && !turnBusy, fitW(i))}
              {extras.filter(e => e.type !== 'COMMENTARY' || showCommentary).map(e => <ReaderExtra key={e.id} e={e} book={bundle} onGo={jumpToChapter} />)}
            </section>
          );
        };
        const fw = fitW(pageIdx);
        return (
          <main ref={mainRef} className="mx-auto px-4 pb-24 pt-4 flex flex-col items-center" style={{ maxWidth: width + 32 }}>
            <PageTurn pageKey={frames[pageIdx].id} order={pageIdx} turn={pt.turn} rtl={rtl} heavy
              renderNeighbor={d => (pageIdx + d >= 0 && pageIdx + d < frames.length ? renderFrame(pageIdx + d, false) : null)}
              canTurn={d => pageIdx + d >= 0 && pageIdx + d < frames.length}
              onTurn={d => goTo(pageIdx + d)} gestureRef={mainRef as React.RefObject<HTMLElement>} sound={pt.soundOn}
              paper="#e9e4d6" radius="12px" style={{ width: fw }} onBusyChange={setTurnBusy}>
              {renderFrame(pageIdx, true)}
            </PageTurn>
            <nav aria-label="Page navigation" className="mt-4 flex items-center gap-3">
              <button onClick={() => goTo(pageIdx + dirForTapSide('left', rtl))} disabled={pageIdx + dirForTapSide('left', rtl) < 0 || pageIdx + dirForTapSide('left', rtl) >= frames.length} aria-label={rtl ? 'Next page' : 'Previous page'} className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"><ChevronLeft size={20} /></button>
              <span className="text-[11px] font-black uppercase tracking-widest text-white/50 min-w-[96px] text-center" aria-live="polite">Page {pageIdx + 1} of {frames.length}</span>
              <button onClick={() => goTo(pageIdx + dirForTapSide('right', rtl))} disabled={pageIdx + dirForTapSide('right', rtl) < 0 || pageIdx + dirForTapSide('right', rtl) >= frames.length} aria-label={rtl ? 'Previous page' : 'Next page'} className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"><ChevronRight size={20} /></button>
            </nav>
          </main>
        );
      })() : (
      <main className="mx-auto px-4 pb-24 pt-4" style={{ maxWidth: width + 32 }}>
        {frames.map((f, i) => {
          const extras = extrasByFrame.get(f.id) || [];
          return (
            <section key={f.id} id={`tbr-f-${i}`} data-fi={i} data-frame-id={f.id} aria-label={f.label || undefined} className="mb-3">
              <LazyFrame eager={frames.length <= 60 || i < 8} height={f.h * (width / f.w)}>
                {renderPage(i, i === scrollTop, width)}
              </LazyFrame>
              {extras.filter(e => e.type !== 'COMMENTARY' || showCommentary).map(e => <ReaderExtra key={e.id} e={e} book={bundle} onGo={jumpToChapter} />)}
            </section>
          );
        })}
      </main>
      )}

      {sel && (
        <div className="fixed z-20 -translate-x-1/2 -translate-y-full" style={{ left: Math.max(90, Math.min(sel.x, window.innerWidth - 90)), top: Math.max(56, sel.y - 8) }}>
          <button className="px-4 py-2 min-h-[44px] rounded-full bg-amber-400 text-black text-[11px] font-black uppercase tracking-widest shadow-xl"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setMarks(ms => [...ms, { ...sel.mark, id: `m_${Date.now().toString(36)}`, createdAt: Date.now() }]); window.getSelection()?.removeAllRanges(); setSel(null); setShowNotes(true); }}>Highlight</button>
        </div>
      )}

      {showExport && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/70" onClick={() => setShowExport(false)}>
          <div role="dialog" aria-modal="true" aria-label="Download" onClick={e => e.stopPropagation()} className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0e0b14] border border-white/10 p-4 sm:p-6">
            <Suspense fallback={null}><ExportDialog book={bookForExport} source={{ doc, enhancements: enhs, versionId: bundle.versionId }} rights={rights} onClose={() => setShowExport(false)} /></Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

/** Text-level extras shown under the page they belong to. Real HTML (keyboard + screen-reader friendly), no popovers needed. */
function ReaderExtra({ e, book, onGo }: { e: EnhancementInstance; book: BookTelaBundle; onGo: (chapterId: string) => void }) {
  const c = e.config || {};
  if (e.type === 'READER_NOTE') return <aside className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/75"><span className="text-[10px] font-black uppercase tracking-widest text-white/35">Note </span>{String(c.text)}</aside>;
  if (e.type === 'COMMENTARY') return <aside className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[13px] text-white/80"><span className="text-[10px] font-black uppercase tracking-widest text-amber-300">Author commentary </span>{String(c.text)}</aside>;
  if (e.type === 'GLOSSARY') return <details className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px]"><summary className="cursor-pointer min-h-[32px] text-white/80">{String(c.term)}<span className="sr-only"> (glossary)</span></summary><p className="text-white/65 mt-1">{String(c.definition)}</p></details>;
  if (e.type === 'BRANCHING') return (
    <div role="group" aria-label={String(c.prompt || 'Choices')} className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      {c.prompt && <p className="text-sm font-bold mb-2">{String(c.prompt)}</p>}
      <div className="flex flex-col gap-2">{(c.choices || []).map((x: any) => <button key={x.label} onClick={() => onGo(x.targetChapterId)} className="text-left px-4 py-3 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-sm" title={book.toc.find(t => t.chapterId === x.targetChapterId)?.title}>{x.label}</button>)}</div>
    </div>
  );
  void stripTags;
  return null;
}
