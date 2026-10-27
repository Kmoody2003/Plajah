// components/elevate/vellum.tsx
// Elevate · Vellum — shared tokens and primitives for the org page, member hub,
// staff ops and volunteer surfaces. One violet for acting, gold only for the Word,
// ember only for "live"; Vellum paper sheets wherever Scripture or the Sunday
// order of service appears, so Lectio and Ambo read as the same material.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import '../../styles/elevate-vellum.css';

export const EV = {
  chrome: '#0E0C13',
  panel: '#18141F',
  raised: '#221D2B',
  line: 'rgba(255,255,255,0.08)',
  ink: '#F2EEF6',
  ink2: '#D8D2E2',
  muted: '#A49CB2',
  violet: '#7A1FC0',
  violetText: '#D0BCFF',
  violetWash: 'rgba(122,31,192,0.14)',
  // Plajah brand: purple → magenta for primary actions, warm sweep (→ orange) for hairlines.
  brand: 'linear-gradient(135deg, #6B0099 0%, #D40055 100%)',
  brandWarm: 'linear-gradient(90deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
  gold: '#E2C27E',
  ember: '#FF8C00',
  vellum: '#F4EEE2',
  vellumInk: '#221C14',
  vellumMuted: '#6B5F4E',
  vellumGold: '#7A5C22',
  success: '#7FD8B0',
  warn: '#FF9F5A',
} as const;

export const EV_FONT = {
  display: "'Bricolage Grotesque', Inter, system-ui, sans-serif",
  scripture: "Newsreader, 'Iowan Old Style', Palatino, Georgia, serif",
  ui: 'Inter, system-ui, sans-serif',
} as const;

/** Deep-link into Lectio at a getbible ref id ("43.8.12" = John 8:12). */
export const openLectio = (refId?: string) =>
  window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: refId ? { refId } : {} }));

/** Ask Unsplash-hosted covers for a hero-sized crop; other hosts pass through. */
export const heroImage = (url?: string) =>
  url && url.includes('images.unsplash.com') ? url.replace(/([?&])w=\d+&h=\d+/, '$1w=2000&h=840') : url;

/** Root of every Elevate surface: sets tokens, voice and the label/size floor. */
export const EvScope: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div className={`ev-scope ${className}`} {...rest} />
);

/**
 * Calls `onShow` once `el` scrolls into view. IntersectionObserver first; a capture-phase scroll check
 * covers environments where observer callbacks are throttled; and a timer guarantees the content is
 * revealed regardless — motion is decoration, never a condition for seeing the page.
 */
function watchReveal(el: HTMLElement, onShow: () => void, fallbackMs = 1800): () => void {
  let done = false;
  const show = () => { if (done) return; done = true; cleanup(); onShow(); };
  const inView = () => {
    const r = el.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    return r.top < h * 0.94 && r.bottom > 0;
  };
  const onScroll = () => { if (inView()) show(); };
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) show(); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 })
    : null;
  const timer = window.setTimeout(show, fallbackMs);
  function cleanup() {
    io?.disconnect();
    window.removeEventListener('scroll', onScroll, true);
    window.clearTimeout(timer);
  }
  if (inView()) { show(); return cleanup; }
  io?.observe(el);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return cleanup;
}

/** Rises into view the first time it scrolls on screen (staggered with `delay`). Respects reduced motion via CSS. */
export const EvReveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties; as?: 'div' | 'section' }> = ({ children, delay = 0, className = '', style, as = 'div' }) => {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return watchReveal(el, () => setShown(true));
  }, []);
  const Tag = as as any;
  return (
    <Tag ref={ref} className={`ev-reveal ${shown ? 'ev-in' : ''} ${className}`} style={{ ...style, ['--ev-delay' as any]: `${delay}ms` }}>
      {children}
    </Tag>
  );
};

/** For pages that mark sections with the `ev-reveal` class directly: reveal each once it scrolls in. */
export function useEvRevealAll(deps: React.DependencyList = []) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.ev-reveal:not(.ev-in)'));
    const stops = els.map(el => watchReveal(el, () => el.classList.add('ev-in'), 2400));
    return () => stops.forEach(stop => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export interface EvAlbum { id: string; title: string; photos: string[] }

/** Photo albums: a feature image beside a tight grid, per album; tiles lift and slowly zoom on hover. */
export const EvGallery: React.FC<{ albums: EvAlbum[]; onOpen?: (album: EvAlbum, index: number) => void; perAlbum?: number }> = ({ albums, onOpen, perAlbum = 5 }) => (
  <div className="space-y-12">
    {albums.filter(a => a.photos.length > 0).map((a, ai) => {
      const [feature, ...rest] = a.photos.slice(0, perAlbum);
      return (
        <EvReveal key={a.id} delay={ai * 80} as="section">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h3 className="m-0 ev-title text-[22px] text-white">{a.title}</h3>
            <span className="ev-num text-sm text-[#A49CB2]">{a.photos.length} photos</span>
          </div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
            <button type="button" onClick={() => onOpen?.(a, 0)} aria-label={`Open ${a.title}`} className="ev-zoom ev-lift rounded-[18px] block" style={{ gridRow: 'span 2', background: EV.panel, minHeight: 300 }}>
              <img src={feature} alt="" loading="lazy" className="ev-img-in w-full h-full object-cover" />
            </button>
            {rest.map((ph, i) => (
              <button key={i} type="button" onClick={() => onOpen?.(a, i + 1)} aria-label={`Open photo ${i + 2} of ${a.title}`} className="ev-zoom ev-lift rounded-[14px] block aspect-[4/3]" style={{ background: EV.panel }}>
                <img src={ph} alt="" loading="lazy" className="ev-img-in w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </EvReveal>
      );
    })}
  </div>
);

export const EvLabel: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className = '', style }) => (
  <div className={`ev-label ${className}`} style={style}>{children}</div>
);

/** The Plajah chevron in its brand sweep, beside the Elevate name. */
export const EvPlajahMark: React.FC<{ label?: string }> = ({ label = 'Elevate' }) => {
  const id = `pj-mark-${React.useId().replace(/:/g, '')}`;
  return (
    <span className="inline-flex items-center gap-2 py-3" aria-label={`Plajah ${label}`}>
      <svg width="16" height="16" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6B0099" /><stop offset="50%" stopColor="#D40055" /><stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>
        </defs>
        <path d="M30 20 L70 50 L30 80" stroke={`url(#${id})`} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="ev-title text-[15px] text-white" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>{label}</span>
    </span>
  );
};

/** Sticky top bar: back, the Public / Member / Staff switch, and page actions. */
export const EvModeBar: React.FC<{
  modes: { k: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  onBack?: () => void;
  trailing?: React.ReactNode;
}> = ({ modes, value, onChange, onBack, trailing }) => (
  <div className="sticky top-0 z-40 border-b" style={{ background: 'rgba(14,12,19,0.92)', borderColor: EV.line, backdropFilter: 'blur(16px)' }}>
    <div className="ev-brand-rule" />
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 flex flex-wrap items-center gap-x-6 gap-y-1">
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="flex items-center py-3 text-[#A49CB2] hover:text-white transition-colors">
          <ChevronLeft size={18} />
        </button>
      )}
      <EvPlajahMark />
      <span aria-hidden="true" className="h-4 w-px" style={{ background: EV.line }} />
      <nav aria-label="Page view" className="flex flex-wrap gap-x-6 flex-1 min-w-0">
        {modes.map(m => (
          <button key={m.k} onClick={() => onChange(m.k)} className="ev-tab" aria-current={value === m.k ? 'page' : undefined}>
            {m.label}
          </button>
        ))}
      </nav>
      {trailing && <div className="flex items-center gap-2 py-2">{trailing}</div>}
    </div>
  </div>
);

/** Org hero: wordmark, display tagline, gatherings and actions, then a wide photograph. */
export const EvHero: React.FC<{
  name: string;
  logoUrl?: string;
  tagline: string;
  intro?: string;
  meta?: React.ReactNode;
  times?: { id: string; label: string; day?: string; time: string }[];
  actions?: React.ReactNode;
  coverUrl?: string;
  onUploadCover?: (file: File) => void;
  onUploadLogo?: (file: File) => void;
  uploadingCover?: boolean;
  uploadingLogo?: boolean;
}> = ({ name, logoUrl, tagline, intro, meta, times, actions, coverUrl, onUploadCover, onUploadLogo, uploadingCover, uploadingLogo }) => (
  <section className="max-w-[1240px] mx-auto px-4 sm:px-8 pt-10 sm:pt-14">
    <div className="flex items-center gap-3 mb-8 ev-rise">
      {onUploadLogo ? (
        <label className="relative w-11 h-11 rounded-xl overflow-hidden cursor-pointer group shrink-0 border border-white/15" style={{ background: EV.panel }} title="Change organization logo">
          {logoUrl
            ? <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            : <span className="w-full h-full grid place-items-center ev-title text-lg" style={{ color: EV.gold }}>{name.slice(0, 1)}</span>}
          <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-white transition-opacity">
            {uploadingLogo ? '…' : 'Edit'}
          </span>
          <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={e => { const f = e.target.files?.[0]; if (f) onUploadLogo(f); e.target.value = ''; }} />
        </label>
      ) : logoUrl ? (
        <img src={logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
      ) : (
        <span className="w-10 h-10 rounded-xl grid place-items-center ev-title text-lg" style={{ background: EV.panel, color: EV.gold }}>{name.slice(0, 1)}</span>
      )}
      <span className="ev-title text-xl text-white" style={{ fontWeight: 700, letterSpacing: '-0.03em' }}>{name}</span>
      {meta && <span className="text-sm text-[#A49CB2] hidden sm:inline">{meta}</span>}
    </div>
    <div className="flex flex-wrap items-end gap-x-12 gap-y-8">
      <h1 className="ev-display text-white m-0 ev-rise" style={{ flex: '999 1 560px', minWidth: 0, fontSize: 'clamp(3rem, 8vw, 7.5rem)', ['--ev-delay' as any]: '80ms' }}>{tagline}</h1>
      <div className="flex flex-col gap-5 pb-2 ev-rise" style={{ flex: '1 1 300px', minWidth: 0, ['--ev-delay' as any]: '220ms' }}>
        {intro && <p className="m-0 text-[17px] leading-relaxed text-[#D8D2E2]">{intro}</p>}
        {times && times.length > 0 && (
          <div className="grid gap-x-5 gap-y-2 items-baseline" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
            {times.map(t => (
              <React.Fragment key={t.id}>
                <span className="ev-num text-lg text-white">{t.day ? `${t.day} ${t.time}` : t.time}</span>
                <span className="text-sm text-[#A49CB2]">{t.label}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
      </div>
    </div>
    {(coverUrl || onUploadCover) && (
      <div className="relative mt-12 rounded-[20px] overflow-hidden ev-zoom group" style={{ background: EV.panel }}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className="ev-hero-photo w-full h-[260px] sm:h-[420px] object-cover" />
        ) : (
          <div className="w-full h-[220px] sm:h-[320px] flex flex-col items-center justify-center gap-2 text-center p-6" style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.22) 0%, rgba(212,0,85,0.14) 55%, rgba(24,20,31,0.95) 100%)' }}>
            <span className="ev-title text-lg text-white">Add a hero cover image for {name}</span>
            <span className="text-xs text-[#A49CB2]">Recommended wide landscape image (1600×680 or higher)</span>
          </div>
        )}
        {onUploadCover && (
          <label className="absolute top-4 right-4 z-10 cursor-pointer px-4 py-2 rounded-full text-xs font-bold text-white flex items-center gap-2 shadow-xl transition-all hover:brightness-110"
            style={{ background: 'rgba(14,12,19,0.82)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(12px)' }}>
            <span>{uploadingCover ? 'Uploading cover…' : coverUrl ? '📷 Change Cover Image' : '📷 Upload Cover Image'}</span>
            <input type="file" accept="image/*" className="hidden" disabled={uploadingCover} onChange={e => { const f = e.target.files?.[0]; if (f) onUploadCover(f); e.target.value = ''; }} />
          </label>
        )}
      </div>
    )}
  </section>
);

/** Section tabs under the hero. */
export const EvTabs: React.FC<{
  tabs: { k: string; label: string }[];
  value: string | null;
  onChange: (k: string) => void;
  top?: number;
}> = ({ tabs, value, onChange, top = 0 }) => (
  <div className="sticky z-30 border-b mt-10" style={{ top, background: 'rgba(14,12,19,0.92)', borderColor: EV.line, backdropFilter: 'blur(16px)' }}>
    <nav aria-label="Sections" className="max-w-[1240px] mx-auto px-4 sm:px-8 flex gap-6 overflow-x-auto scrollbar-hide">
      {tabs.map(t => (
        <button key={t.k} onClick={() => onChange(t.k)} className="ev-tab" aria-current={value === t.k ? 'page' : undefined}>{t.label}</button>
      ))}
    </nav>
  </div>
);

export interface EvSermon { id: string; n?: string; title: string; meta: string; len?: string; onClick?: () => void }

/** "This Sunday" Vellum sheet: the message, its key verse, and the way into Rello and Lectio. */
export const EvSundaySheet: React.FC<{
  eyebrow: string;
  title: string;
  byline: string;
  verse?: { n?: number | string; text: string; ref: string };
  onWatch?: () => void;
  onRead?: () => void;
  readLabel?: string;
  earlier?: EvSermon[];
}> = ({ eyebrow, title, byline, verse, onWatch, onRead, readLabel = 'Read along in Verse', earlier }) => (
  <section className="ev-sheet p-7 sm:p-14 flex flex-wrap gap-12 ev-rise">
    <div className="flex flex-col gap-4" style={{ flex: '1 1 420px', minWidth: 0 }}>
      <EvLabel>{eyebrow}</EvLabel>
      <h2 className="m-0 ev-display" style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)', lineHeight: 1 }}>{title}</h2>
      <div className="text-[15px] ev-muted">{byline}</div>
      {verse && (
        <blockquote className="m-0 mt-3 pt-5 ev-scripture text-[22px] sm:text-[26px] leading-[1.5]" style={{ borderTop: '1px solid rgba(34,28,20,0.14)' }}>
          {verse.n != null && <sup className="ev-verse" style={{ paddingLeft: 0 }}>{verse.n}</sup>}“{verse.text}”
          <footer className="mt-2 text-[13px] ev-muted" style={{ fontFamily: EV_FONT.ui }}>{verse.ref}</footer>
        </blockquote>
      )}
      <div className="flex flex-wrap gap-2.5 pt-2">
        {onWatch && <button onClick={onWatch} className="ev-btn ev-btn-ink">Watch on Reello</button>}
        {onRead && <button onClick={onRead} className="ev-btn ev-btn-paper">{readLabel}</button>}
      </div>
    </div>
    {earlier && earlier.length > 0 && (
      <div className="flex flex-col" style={{ flex: '1 1 360px', minWidth: 0 }}>
        <EvLabel className="pb-2" style={{ color: EV.vellumMuted }}>Earlier in the series</EvLabel>
        <div className="ev-rule" style={{ borderTop: '1px solid rgba(34,28,20,0.12)' }}>
          {earlier.map(s => (
            <button key={s.id} onClick={s.onClick} className="ev-row-link w-full text-left grid gap-3.5 items-baseline py-4 px-1" style={{ gridTemplateColumns: '36px minmax(0,1fr) auto', color: EV.vellumInk }}>
              <span className="ev-num text-[15px]" style={{ color: EV.vellumMuted }}>{s.n || '—'}</span>
              <span className="min-w-0"><span className="block text-base font-medium truncate">{s.title}</span><span className="block text-[13px] pt-0.5" style={{ color: EV.vellumMuted }}>{s.meta}</span></span>
              {s.len && <span className="text-[13px] tabular-nums" style={{ color: EV.vellumMuted }}>{s.len}</span>}
            </button>
          ))}
        </div>
      </div>
    )}
  </section>
);

/** Numbered index of ministries / departments. */
export const EvIndexList: React.FC<{ items: { id: string; name: string; when?: string; onClick?: () => void }[] }> = ({ items }) => (
  <div className="grid gap-x-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
    {items.map((m, i) => (
      <button key={m.id} onClick={m.onClick} className="ev-row-link ev-rise text-left grid gap-3 items-baseline py-5 px-1" style={{ gridTemplateColumns: '44px minmax(0,1fr) auto', borderTop: `1px solid ${EV.line}`, ['--ev-delay' as any]: `${Math.min(i, 10) * 45}ms` }}>
        <span className="ev-num text-[15px] text-[#A49CB2]">{String(i + 1).padStart(2, '0')}</span>
        <span className="ev-title text-[22px] sm:text-2xl text-white truncate">{m.name}</span>
        {m.when && <span className="text-[13px] text-[#A49CB2] text-right">{m.when}</span>}
      </button>
    ))}
  </div>
);

export const EvSectionHead: React.FC<{ title: string; action?: React.ReactNode; size?: 'lg' | 'md' }> = ({ title, action, size = 'lg' }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
    <h2 className="m-0 ev-display text-white" style={{ fontSize: size === 'lg' ? 'clamp(2rem, 4vw, 3rem)' : 'clamp(1.5rem, 3vw, 2rem)', lineHeight: 1.05 }}>{title}</h2>
    {action}
  </div>
);

export interface EvVerse { n: number; text: string; highlight?: boolean }
export interface EvMarginNote { src: string; text: string }

/** Lectio on the member home: today's passage on Vellum with Sunday's Ambo cues in the margin. */
export const EvLectioSheet: React.FC<{
  planLabel: string;
  progressLabel?: string;
  reference: string;
  verses: EvVerse[];
  notes?: EvMarginNote[];
  onContinue: () => void;
  onAddNote?: () => void;
  footnote?: string;
}> = ({ planLabel, progressLabel, reference, verses, notes, onContinue, onAddNote, footnote }) => (
  <section aria-label="Verse — today's reading" className="ev-sheet ev-rise p-7 sm:p-12 flex flex-col gap-5">
    <div className="flex flex-wrap justify-between gap-2">
      <EvLabel>{planLabel}</EvLabel>
      {progressLabel && <EvLabel style={{ color: EV.vellumMuted }}>{progressLabel}</EvLabel>}
    </div>
    <h2 className="m-0 ev-display" style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', lineHeight: 1 }}>{reference}</h2>
    <div className="flex flex-wrap gap-7">
      <div className="ev-scripture text-[20px] sm:text-[22px] leading-[1.7]" style={{ flex: '999 1 360px', minWidth: 0 }}>
        {verses.map(v => (
          <React.Fragment key={v.n}>
            <sup className="ev-verse">{v.n}</sup>
            {v.highlight
              ? <span style={{ background: 'rgba(122,92,34,0.14)', borderRadius: 3, padding: '0 2px' }}>{v.text}</span>
              : v.text}{' '}
          </React.Fragment>
        ))}
      </div>
      {notes && notes.length > 0 && (
        <aside aria-label="Margin notes" className="flex flex-col gap-4 pl-5" style={{ flex: '1 1 200px', minWidth: 0, borderLeft: '1px solid rgba(34,28,20,0.16)' }}>
          <EvLabel style={{ color: EV.vellumMuted }}>In the margin</EvLabel>
          {notes.map((n, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="text-xs font-semibold" style={{ color: EV.vellumGold }}>{n.src}</div>
              <div className="text-sm leading-relaxed" style={{ color: '#3A3125' }}>{n.text}</div>
            </div>
          ))}
        </aside>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-2.5 pt-5" style={{ borderTop: '1px solid rgba(34,28,20,0.12)' }}>
      <button onClick={onContinue} className="ev-btn ev-btn-ink">Continue in Verse</button>
      {onAddNote && <button onClick={onAddNote} className="ev-btn" style={{ color: '#6B0099', paddingLeft: 6, paddingRight: 6, fontWeight: 500 }}>Add a note</button>}
      {footnote && <span className="text-[13px] ml-auto" style={{ color: EV.vellumMuted }}>{footnote}</span>}
    </div>
  </section>
);

export interface EvCue { t: string; what: string; ref?: string; owner: string; status: string; tone: 'ready' | 'due' | 'idle' }

/** Staff "Sunday sheet": the Ambo run of show as a printed order of service. */
export const EvRunSheet: React.FC<{ title: string; subtitle?: string; cues: EvCue[]; action?: React.ReactNode }> = ({ title, subtitle, cues, action }) => {
  const toneColor = { ready: '#2E7D5B', due: '#A6501A', idle: EV.vellumMuted } as const;
  return (
    <section aria-label={title} className="ev-sheet ev-rise p-6 sm:p-9 flex flex-col">
      <div className="flex flex-wrap justify-between items-baseline gap-2 pb-3.5">
        <h2 className="m-0 ev-display text-[28px]" style={{ letterSpacing: '-0.03em' }}>{title}</h2>
        <div className="flex items-center gap-3">
          {subtitle && <span className="text-[13px] ev-muted">{subtitle}</span>}
          {action}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          {cues.map((c, i) => (
            <div key={i} className="grid gap-3.5 items-baseline py-3 text-sm" style={{ gridTemplateColumns: '58px minmax(0,1fr) 130px 104px', borderTop: '1px solid rgba(34,28,20,0.12)' }}>
              <span className="ev-num">{c.t}</span>
              <span className="font-medium">{c.what}{c.ref && <span className="block ev-scripture italic font-normal text-sm" style={{ color: EV.vellumGold }}>{c.ref}</span>}</span>
              <span className="ev-muted">{c.owner}</span>
              <span className="font-medium text-right" style={{ color: toneColor[c.tone] }}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/** KPI strip: big tabular numerals between hairlines, no boxes. */
export const EvKpiStrip: React.FC<{ items: { label: string; value: string; note?: string; tone?: 'up' | 'warn' | 'flat' }[] }> = ({ items }) => (
  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', borderTop: `1px solid ${EV.line}`, borderBottom: `1px solid ${EV.line}` }}>
    {items.map(k => (
      <div key={k.label} className="py-5 pr-4 flex flex-col gap-1">
        <div className="text-[13px] text-[#A49CB2]">{k.label}</div>
        <div className="ev-num text-white leading-[1.1]" style={{ fontSize: 'clamp(2rem, 3.4vw, 2.75rem)' }}>{k.value}</div>
        {k.note && <div className="text-[13px]" style={{ color: k.tone === 'up' ? EV.success : k.tone === 'warn' ? EV.warn : EV.muted }}>{k.note}</div>}
      </div>
    ))}
  </div>
);
