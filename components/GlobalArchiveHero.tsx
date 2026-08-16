/**
 * GlobalArchiveHero — the redesigned Global Archive landing hero.
 *
 * Composition (picked from the "Front Row" pitch):
 *  - Panorama wall: independent columns cycling through new releases, creator
 *    spotlights and platform capabilities. Hover widens a column, pauses its
 *    rotation and unmutes it via the promo fallback chain.
 *  - Atrium issue line: dated "Issue Nº" caption fed by real release counts.
 *  - Signal ticker: only rendered while something is actually live.
 *  - Premiere rails (exported separately as ArchiveRails): per-service
 *    new-release strips rendered beneath the wall.
 *
 * Hover media fallback chain (per pane):
 *  promoKit.teaserLoopUrl → promoKit.trailerUrl → promoKit.audioSampleUrl over
 *  key art → first audio track → key art with a slow drift.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Play, Radio } from 'lucide-react';
import type { Album, LiveFeed } from '../types';
import { fetchClassicBooks, type ArchiveBook } from '../services/archiveContentService';
import { searchArtifacts, type Artifact } from '../services/artifactsService';
import { EDU_FACTOIDS, factoidAt, type EduFactoid } from '../data/eduFactoids';

/* Shared hover-audio singleton lives in services/hoverPreview (one sample
   audible at a time, platform-wide — Chora Next uses the same instance). */
import { playHoverPreview as playHoverAudio, stopHoverPreview as stopHoverAudio } from '../services/hoverPreview';

/* ── pane model ──────────────────────────────────────────────────────────── */
type Pane =
  | { kind: 'RELEASE'; album: Album }
  | { kind: 'CREATOR'; artist: string; image: string; works: number; newest: Album }
  | { kind: 'CAPABILITY'; title: string; desc: string; view: string; grad: string }
  | { kind: 'CLASSIC'; book: ArchiveBook }
  | { kind: 'LIVE'; feed: LiveFeed }
  | { kind: 'FACTOID'; f: EduFactoid }
  | { kind: 'MUSEUM'; a: Artifact };

/** Gradient per factoid subject so text panes still feel branded. */
const FACTOID_GRAD: Record<string, string> = {
  Music: 'var(--pj-grad-brand)', Film: 'var(--pj-grad-spatial)', Art: 'var(--pj-grad-ethereal)',
  History: 'var(--pj-grad-warm)', Science: 'var(--pj-grad-spatial)', Language: 'var(--pj-grad-ember)',
};

/** Daily-rotating museum search so the wall's museum panes stay fresh. */
const MUSEUM_QUERIES = ['ancient egypt', 'greek sculpture', 'samurai armor', 'impressionism', 'islamic art', 'renaissance portrait', 'african mask'];

const CAPABILITIES: Pane[] = [
  { kind: 'CAPABILITY', title: 'Sync Parties', desc: 'Watch, read & listen together — host any release live for your people.', view: 'LIVE_HUB', grad: 'var(--pj-grad-spatial)' },
  { kind: 'CAPABILITY', title: 'Worlds', desc: 'Build story universes that connect your music, films & books.', view: 'WORLDS', grad: 'var(--pj-grad-ethereal)' },
  { kind: 'CAPABILITY', title: 'Go Live Tonight', desc: 'Stream with studio-grade looks, VTuber mode & live translation.', view: 'LIVE_HUB', grad: 'var(--pj-grad-ember)' },
  { kind: 'CAPABILITY', title: 'Academia', desc: 'Learn anything — history, art & science — inside the archive.', view: 'CLASSROOMS', grad: 'var(--pj-grad-brand)' },
  { kind: 'CAPABILITY', title: 'Clubs', desc: 'Gather your people around the work you love.', view: 'CLUBS', grad: 'var(--pj-grad-warm)' },
  { kind: 'CAPABILITY', title: 'Games', desc: 'Play & publish indie games and interactive media.', view: 'GAMES', grad: 'var(--pj-grad-spatial)' },
];

const TYPE_KICKER: Record<string, string> = {
  MUSIC: 'New on Chora', VIDEO: 'New on Taleo & Reello', BOOK: 'New on Lorea',
  PHOTO: 'New in Photos', GAME: 'New in Games',
};

const paneImage = (p: Pane): string => {
  if (p.kind === 'RELEASE') return p.album.promoKit?.keyArtUrl || p.album.coverImage || p.album.coverThumb || '';
  if (p.kind === 'CREATOR') return p.image;
  if (p.kind === 'CLASSIC') return p.book.coverImage || '';
  if (p.kind === 'LIVE') return p.feed.ownerPhoto || '';
  if (p.kind === 'MUSEUM') return p.a.imageUrl || p.a.thumbUrl || '';
  return '';
};

const paneBackground = (p: Pane): string => {
  if (p.kind === 'CAPABILITY') return p.grad;
  if (p.kind === 'FACTOID') return FACTOID_GRAD[p.f.subject] || 'var(--pj-grad-ember)';
  if (p.kind === 'LIVE') return 'var(--pj-grad-ember)';
  return 'var(--pj-grad-brand)';
};

/** Resolve the hover-unmute media for a pane via the promo fallback chain. */
const paneHoverMedia = (p: Pane): { kind: 'video'; url: string; loop: boolean } | { kind: 'audio'; url: string } | null => {
  const album = p.kind === 'RELEASE' ? p.album : p.kind === 'CREATOR' ? p.newest : null;
  if (!album) return null;
  const kit = album.promoKit;
  if (kit?.teaserLoopUrl) return { kind: 'video', url: kit.teaserLoopUrl, loop: true };
  if (kit?.trailerUrl) return { kind: 'video', url: kit.trailerUrl, loop: false };
  if (kit?.audioSampleUrl) return { kind: 'audio', url: kit.audioSampleUrl };
  if (album.movieMetadata?.trailerUrl) return { kind: 'video', url: album.movieMetadata.trailerUrl, loop: false };
  const t = (album.tracks || []).find(tr => tr?.url && tr.mediaKind !== 'VIDEO');
  if ((album.type || 'MUSIC') === 'MUSIC' && t?.url) return { kind: 'audio', url: t.url };
  return null;
};

/* ── one panorama column ─────────────────────────────────────────────────── */
const PanoramaColumn: React.FC<{
  deck: Pane[];
  offsetMs: number;
  reducedMotion: boolean;
  onSelectItem: (album: Album) => void;
  onNavigate: (view: string) => void;
}> = ({ deck, offsetMs, reducedMotion, onSelectItem, onNavigate }) => {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [media, setMedia] = useState<{ kind: 'video'; url: string; loop: boolean } | null>(null);
  const hoveredRef = useRef(false);
  const intentRef = useRef<number | null>(null);

  const pane = deck[idx % deck.length];

  useEffect(() => {
    if (deck.length < 2) return;
    // ~15s hold per pane; per-column offset staggers the rotation cadence across
    // the pillars. Reduced motion still rotates content (instant swap) — the
    // preference is about animation, not about freezing the page.
    const timer = window.setInterval(() => {
      if (hoveredRef.current) return;
      if (reducedMotion) {
        setIdx(i => (i + 1) % deck.length);
        return;
      }
      setFading(true);
      window.setTimeout(() => {
        setIdx(i => (i + 1) % deck.length);
        setFading(false);
      }, 420);
    }, 15000 + offsetMs);
    return () => window.clearInterval(timer);
  }, [deck.length, offsetMs, reducedMotion]);

  // Stop everything if the column unmounts mid-hover.
  useEffect(() => () => { stopHoverAudio(); if (intentRef.current) window.clearTimeout(intentRef.current); }, []);

  const enter = () => {
    hoveredRef.current = true;
    setHovered(true);
    if (intentRef.current) window.clearTimeout(intentRef.current);
    // Hover-intent delay so a cursor sweep doesn't start five streams.
    intentRef.current = window.setTimeout(() => {
      if (!hoveredRef.current) return;
      const m = paneHoverMedia(pane);
      if (!m) return;
      if (m.kind === 'audio') playHoverAudio(m.url);
      else setMedia(m);
    }, 320);
  };
  const leave = () => {
    hoveredRef.current = false;
    setHovered(false);
    if (intentRef.current) window.clearTimeout(intentRef.current);
    stopHoverAudio();
    setMedia(null);
  };
  const open = () => {
    switch (pane.kind) {
      case 'CAPABILITY': onNavigate(pane.view); break;
      case 'CLASSIC': onNavigate('BOOKS'); break;
      case 'LIVE': onNavigate('LIVE_HUB'); break;
      case 'FACTOID': onNavigate('CLASSROOMS'); break;
      case 'MUSEUM': onNavigate('CLASSROOMS'); break;
      case 'CREATOR': onSelectItem(pane.newest); break;
      default: onSelectItem(pane.album);
    }
  };

  const img = paneImage(pane);
  const meta = (() => {
    switch (pane.kind) {
      case 'RELEASE': {
        const a = pane.album;
        const kicker = a.type === 'VIDEO'
          ? (a.subType === 'UGC' ? 'New on Reello' : 'New on Taleo')
          : TYPE_KICKER[a.type || 'MUSIC'] || 'New release';
        return { kicker, title: a.title, by: a.artist, desc: a.description || '', cta: 'Open' };
      }
      case 'CREATOR': return {
        kicker: 'Creator spotlight', title: pane.artist,
        by: `${pane.works} ${pane.works === 1 ? 'release' : 'releases'} in the archive`,
        desc: `Explore everything ${pane.artist} has published.`, cta: 'Explore works',
      };
      case 'CLASSIC': return {
        kicker: 'Lorea Classics', title: pane.book.title,
        by: (pane.book.authors || []).join(', ') || 'Public domain',
        desc: 'From the open library — the classics, free forever in the Lorea reader.', cta: 'Read free',
      };
      case 'LIVE': return {
        kicker: 'Live now', title: pane.feed.title || `${pane.feed.ownerName} is live`,
        by: pane.feed.ownerName,
        desc: 'On air right now — drop into the room.', cta: 'Watch live',
      };
      case 'FACTOID': return {
        kicker: `${pane.f.subject} pulse`, title: pane.f.text,
        by: pane.f.source,
        desc: '', cta: 'Learn more',
      };
      case 'MUSEUM': return {
        kicker: 'From the Museums', title: pane.a.title,
        by: [pane.a.culture, pane.a.date].filter(Boolean).join(' · '),
        desc: pane.a.medium || 'From the world’s open museum collections.', cta: 'Visit the museums',
      };
      default: return { kicker: 'On Plajah', title: pane.title, by: pane.desc, desc: pane.desc, cta: 'Explore' };
    }
  })();
  const { kicker, title, by, desc, cta } = meta;
  const isFactoid = pane.kind === 'FACTOID';
  const hasSound = !!paneHoverMedia(pane);

  return (
    <button
      type="button"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      onClick={open}
      className="group relative min-w-0 shrink-0 snap-start basis-[46%] sm:basis-0 sm:shrink sm:grow overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-small-orange transition-[flex-grow] duration-500"
      style={{ flexGrow: hovered ? 2.4 : 1, transitionTimingFunction: 'cubic-bezier(0.2,0,0,1)' }}
    >
      {/* artwork / gradient ground */}
      <div
        className={`absolute inset-0 bg-cover bg-center transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'} ${!reducedMotion ? 'group-hover:scale-[1.06] transition-transform duration-[6000ms] ease-linear' : ''}`}
        style={img ? { backgroundImage: `url(${img})` } : { backgroundImage: paneBackground(pane) }}
      />
      {pane.kind === 'FACTOID' && (
        <span aria-hidden="true" className={`absolute inset-0 flex items-center justify-center text-7xl opacity-25 select-none transition-opacity duration-500 ${fading ? 'opacity-0' : ''}`}>{pane.f.emoji}</span>
      )}
      {media && (
        <video
          key={media.url}
          src={media.url}
          loop={media.loop}
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          ref={el => {
            if (!el) return;
            el.muted = false;
            el.volume = 0.8;
            el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
          }}
        />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35), transparent 30%, transparent 52%, rgba(0,0,0,0.88))' }} />

      {/* top row: service chip + sound state */}
      <div className={`absolute top-3 left-3 right-3 flex items-center justify-between gap-2 transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}>
        <span className="px-2.5 py-1 rounded-full bg-black/45 border border-white/20 text-[8px] font-black uppercase tracking-[0.18em] text-white/85 backdrop-blur-sm whitespace-nowrap overflow-hidden text-ellipsis">
          {kicker}
        </span>
        {hasSound && (
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 border backdrop-blur-sm text-[8px] font-black uppercase tracking-[0.14em] whitespace-nowrap transition-colors ${hovered ? 'border-small-orange/70 text-white' : 'border-white/15 text-white/50'}`}>
            <span className="flex items-end gap-[2px] h-[10px]">
              {[0, 1, 2, 3].map(i => (
                <i key={i} className={`w-[2.5px] rounded-sm ${hovered ? 'bg-small-orange pj-eq-bar' : 'bg-white/35'}`} style={{ height: hovered ? undefined : '30%', animationDelay: `${i * 0.11}s` }} />
              ))}
            </span>
            {hovered ? 'Playing' : 'Muted'}
          </span>
        )}
      </div>

      {/* meta */}
      <div className={`absolute left-3.5 right-3.5 bottom-3.5 transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}>
        <h3 className={`text-white tracking-tight [text-wrap:balance] drop-shadow-lg ${isFactoid ? 'text-sm lg:text-base font-bold leading-snug' : 'font-black italic leading-[1.05] text-base lg:text-xl'}`}>{title}</h3>
        <p className="text-white/70 text-[11px] mt-1 line-clamp-1">{by}</p>
        <div className={`grid transition-[grid-template-rows,opacity] duration-500 ${hovered ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            {desc && <p className="text-white/80 text-[11px] leading-relaxed mt-2 line-clamp-3 max-w-[36ch]">{desc}</p>}
            <span className="inline-flex items-center gap-1.5 mt-2.5 px-4 h-8 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest">
              <Play size={10} fill="currentColor" /> {cta}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

/* ── the hero ────────────────────────────────────────────────────────────── */
interface GlobalArchiveHeroProps {
  albums: Album[];
  liveCount: number;
  liveFeeds?: LiveFeed[];
  onSelectItem: (album: Album) => void;
  onOpenCreator: () => void;
  onNavigate: (view: string) => void;
  isPublicView?: boolean;
}

const GlobalArchiveHero: React.FC<GlobalArchiveHeroProps> = ({ albums, liveCount, liveFeeds = [], onSelectItem, onOpenCreator, onNavigate, isPublicView }) => {
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  // Narrow screens keep all panes and scroll-snap horizontally instead of shrinking them.
  const colCount = 6;

  // Lorea classics — the same Gutendex source the Books page uses (1h-cached in
  // archiveContentService), so the wall always has literature to cycle through
  // even before creators publish books.
  const [classics, setClassics] = useState<ArchiveBook[]>([]);
  useEffect(() => {
    let alive = true;
    fetchClassicBooks('').then(books => {
      if (alive) setClassics(books.filter(b => b.coverImage).slice(0, 10));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Museum pieces — keyless open-collection APIs (Met/ARTIC/Cleveland), cached
  // in artifactsService; the query rotates daily so the wall stays fresh.
  const [museum, setMuseum] = useState<Artifact[]>([]);
  useEffect(() => {
    let alive = true;
    const day = Math.floor(Date.now() / 86_400_000);
    searchArtifacts(MUSEUM_QUERIES[day % MUSEUM_QUERIES.length], { limit: 8, sources: ['met', 'artic', 'cleveland'] })
      .then(items => { if (alive) setMuseum(items.filter(a => a.imageUrl || a.thumbUrl).slice(0, 6)); });
    return () => { alive = false; };
  }, []);

  const { decks, todayCount, weekCount, newest } = useMemo(() => {
    const now = Date.now();
    // Newest releases PER SERVICE so the wall spans all of Plajah, not just
    // whichever service published most recently.
    const perType = (type: string, n: number) => albums
      .filter(a => (a.type || 'MUSIC') === type && a.coverImage && !a.isDraft)
      .slice(0, n);
    const releases = [
      ...perType('MUSIC', 6), ...perType('VIDEO', 6), ...perType('BOOK', 5),
      ...perType('PHOTO', 3), ...perType('GAME', 3),
    ].map<Pane>(a => ({ kind: 'RELEASE', album: a }));

    const byArtist = new Map<string, { artist: string; image: string; works: number; newest: Album }>();
    for (const a of albums) {
      if (!a.artist || a.artist === 'Unknown Artist') continue;
      const cur = byArtist.get(a.artist);
      if (cur) { cur.works++; if ((a.createdAt || 0) > (cur.newest.createdAt || 0)) cur.newest = a; }
      else byArtist.set(a.artist, { artist: a.artist, image: a.artistImage || a.coverImage, works: 1, newest: a });
    }
    const creators = [...byArtist.values()]
      .sort((x, y) => (y.newest.createdAt || 0) - (x.newest.createdAt || 0))
      .slice(0, 4)
      .map<Pane>(c => ({ kind: 'CREATOR', ...c }));

    const classicPanes = classics.map<Pane>(book => ({ kind: 'CLASSIC', book }));
    const livePanes = liveFeeds.slice(0, 6).map<Pane>(feed => ({ kind: 'LIVE', feed }));
    // Daily-rotating slice of the education factoids ("the pulse").
    const day = Math.floor(now / 86_400_000);
    const factoidPanes = Array.from({ length: Math.min(6, EDU_FACTOIDS.length) }, (_, i): Pane => ({ kind: 'FACTOID', f: factoidAt(day + i) }));
    const museumPanes = museum.map<Pane>(a => ({ kind: 'MUSEUM', a }));

    // Releases lead, then live channels, creators, capabilities, factoids,
    // museum pieces and the Lorea classics season the rotation — round-robin
    // spreads each group across all columns.
    const pool: Pane[] = [...releases, ...livePanes, ...creators, ...CAPABILITIES, ...factoidPanes, ...museumPanes, ...classicPanes];
    const decks: Pane[][] = Array.from({ length: colCount }, () => []);
    pool.forEach((p, i) => decks[i % colCount].push(p));
    decks.forEach((d, i) => { if (d.length === 0) d.push(CAPABILITIES[i % CAPABILITIES.length]); });
    // Stagger each column's starting depth so the opening wall mixes kinds
    // (releases, creators, capabilities, classics) instead of six alike panes.
    decks.forEach((d, i) => { const k = i % d.length; d.push(...d.splice(0, k)); });

    return {
      decks,
      todayCount: albums.filter(a => now - (a.createdAt || 0) < 86_400_000).length,
      weekCount: albums.filter(a => now - (a.createdAt || 0) < 7 * 86_400_000).length,
      newest: albums.slice(0, 3),
    };
  }, [albums, classics, liveFeeds, museum, colCount]);

  const issueNo = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 86_400_000) + 1;
  const issueDate = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const freshLine = todayCount > 0 ? `${todayCount} new today` : weekCount > 0 ? `${weekCount} new this week` : `${albums.length} works preserved`;

  const tickerText = liveCount > 0
    ? [`${liveCount} live now`, freshLine, ...newest.map(a => `NEW — ${a.title} by ${a.artist}`)].join('  ·  ') + '  ·  '
    : '';

  return (
    <div className="mb-10">
      {/* pane EQ animation (scoped, respects reduced motion via the class only being applied on hover) */}
      <style>{`
        @keyframes pjEq { from { height: 22%; } to { height: 100%; } }
        .pj-eq-bar { animation: pjEq 0.7s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) { .pj-eq-bar { animation: none; height: 60%; } }
      `}</style>

      {/* masthead row */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-5">
        <div className="min-w-0">
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white leading-[0.85] italic select-none">
            Plajah <span className="pj-text-ember">Global Archive</span>
          </h1>
          {/* Atrium issue line — real numbers, refreshed daily */}
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.28em] text-white/40 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Issue Nº {issueNo}</span><span aria-hidden="true">·</span>
            <span>{issueDate}</span><span aria-hidden="true">·</span>
            <span className="text-small-orange">{freshLine}</span>
          </p>
        </div>
        {!isPublicView && (
          <div className="relative inline-flex items-center justify-center self-start lg:self-auto shrink-0">
            <span className="absolute inset-0 rounded-full bg-small-orange opacity-25 animate-ping" style={{ animationDuration: '2s' }} />
            <button
              onClick={onOpenCreator}
              className="relative inline-flex items-center gap-2 px-6 py-3 bg-small-orange text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-lg shadow-small-orange/40"
            >
              <Upload size={13} /> Creators Upload Here
            </button>
          </div>
        )}
      </div>

      {/* Signal ticker — only while the platform is actually live */}
      {tickerText && (
        <div className="flex items-stretch mb-3 rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]">
          <span className="flex items-center gap-2 px-4 text-[9px] font-black uppercase tracking-[0.24em] text-white shrink-0" style={{ background: 'var(--pj-grad-ember)' }}>
            <Radio size={11} className={reducedMotion ? '' : 'animate-pulse'} /> On Air
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className={`whitespace-nowrap py-2 font-mono text-[11px] text-white/60 ${reducedMotion ? '' : 'pj-ticker'}`}>
              {tickerText}{tickerText}
            </div>
            <style>{`
              @keyframes pjTick { from { transform: translateX(0); } to { transform: translateX(-50%); } }
              .pj-ticker { display: inline-block; animation: pjTick 38s linear infinite; }
            `}</style>
          </div>
        </div>
      )}

      {/* the panorama wall */}
      <div
        className="flex gap-[3px] rounded-[1.75rem] overflow-hidden border border-white/10 bg-black/40 overflow-x-auto sm:overflow-x-hidden snap-x snap-mandatory sm:snap-none no-scrollbar"
        style={{ height: 'clamp(360px, 52vh, 560px)' }}
      >
        {decks.map((deck, i) => (
          <PanoramaColumn
            key={i}
            deck={deck}
            offsetMs={i * 2400}
            reducedMotion={reducedMotion}
            onSelectItem={onSelectItem}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <p className="mt-2 text-right text-[9px] font-black uppercase tracking-[0.24em] text-white/25 select-none">
        Hover a pane to unmute · every door is open
      </p>
    </div>
  );
};

/* ── Premiere rails — per-service new-release strips ─────────────────────── */
export const ArchiveRails: React.FC<{
  albums: Album[];
  onSelectItem: (album: Album) => void;
  onOpenBooks?: () => void;
}> = ({ albums, onSelectItem, onOpenBooks }) => {
  // Same cached Gutendex source as the hero + Books page.
  const [classics, setClassics] = useState<ArchiveBook[]>([]);
  useEffect(() => {
    let alive = true;
    fetchClassicBooks('').then(books => {
      if (alive) setClassics(books.filter(b => b.coverImage).slice(0, 12));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const rails = useMemo(() => {
    const byType = (types: string[]) => albums.filter(a => types.includes(a.type || 'MUSIC') && a.coverImage && !a.isDraft).slice(0, 12);
    return [
      { title: 'Fresh on Chora', sub: 'Music', items: byType(['MUSIC']) },
      { title: 'New on Taleo & Reello', sub: 'Film · TV · Video', items: byType(['VIDEO']) },
      { title: 'Just published on Lorea', sub: 'Books · Comics', items: byType(['BOOK']) },
    ].filter(r => r.items.length > 0);
  }, [albums]);

  if (rails.length === 0 && classics.length === 0) return null;

  return (
    <div className="mb-12 space-y-7">
      {rails.map(rail => (
        <div key={rail.title}>
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className="text-base font-black italic tracking-tight text-white">{rail.title}</h3>
            <span className="text-[9px] font-black uppercase tracking-[0.24em] text-white/30">{rail.sub}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {rail.items.map(album => (
              <button
                key={album.id}
                type="button"
                onClick={() => onSelectItem(album)}
                className="group relative shrink-0 w-[150px] text-left outline-none focus-visible:ring-2 focus-visible:ring-small-orange rounded-xl"
              >
                <div className="relative w-[150px] h-[150px] rounded-xl overflow-hidden border border-white/10 group-hover:border-white/25 transition-all group-hover:-translate-y-1 duration-300">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${album.promoKit?.keyArtUrl || album.coverThumb || album.coverImage})` }}
                  />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.65), transparent 55%)' }} />
                </div>
                <p className="mt-2 text-[11px] font-bold text-white/85 leading-tight line-clamp-2">{album.title}</p>
                <p className="text-[10px] text-white/40 line-clamp-1">{album.artist}</p>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Lorea classics — the open library, always stocked */}
      {classics.length > 0 && (
        <div>
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className="text-base font-black italic tracking-tight text-white">Classics on Lorea</h3>
            <span className="text-[9px] font-black uppercase tracking-[0.24em] text-white/30">Open library · read free</span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {classics.map(book => (
              <button
                key={book.id}
                type="button"
                onClick={onOpenBooks}
                className="group relative shrink-0 w-[118px] text-left outline-none focus-visible:ring-2 focus-visible:ring-small-orange rounded-xl"
              >
                <div className="relative w-[118px] h-[168px] rounded-xl overflow-hidden border border-white/10 group-hover:border-white/25 transition-all group-hover:-translate-y-1 duration-300">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${book.coverImage})` }}
                  />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.6), transparent 50%)' }} />
                </div>
                <p className="mt-2 text-[11px] font-bold text-white/85 leading-tight line-clamp-2">{book.title}</p>
                <p className="text-[10px] text-white/40 line-clamp-1">{(book.authors || []).join(', ')}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalArchiveHero;
