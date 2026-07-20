import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music2, Radio as RadioIcon, Library, Users, Disc3, Sparkles, Archive, Mic2, BookOpen, ListMusic, GraduationCap, Crown, Play } from 'lucide-react';
import type { Album, UserProfile } from '../../types';
import { fetchAllPublicAlbums, fetchUpcomingAlbums, searchUsers } from '../../services/backendService';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { useTvGrid, isFocused } from '../../hooks/useTvGrid';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';

/**
 * Chora for television — built for the ten-foot view, not adapted to it.
 *
 * Structure follows Apple Music and Amazon Music on TV, which converged on the same shape for
 * good reason: a fixed vertical rail of sections on the left, horizontal content rails on the
 * right, and a showcase at the top. Nothing is hidden behind a menu, so the shortest path to any
 * section is "left, then up or down" — two presses, always the same two.
 *
 * NAVIGATION IS DECLARED, NOT INFERRED. The screen tells useTvGrid its row lengths and the hook
 * moves an index. The generic spatial layer guesses from geometry, which is what made the old
 * screen jump around: overlapping rails and re-rendering cards changed the answer between
 * identical presses. Here the same press always does the same thing.
 *
 * No banners: the promos and the moment-in-history card that used to stack above the content are
 * folded into the showcase, which is the one place a TV viewer looks first.
 */

const SECTIONS = [
  { id: 'NEW',         label: 'New',         icon: Sparkles },
  { id: 'FOR_YOU',     label: 'For You',     icon: Music2 },
  { id: 'RADIO',       label: 'Radio',       icon: RadioIcon },
  { id: 'MY_LIBRARY',  label: 'My Library',  icon: Library },
  { id: 'ARTISTS',     label: 'Artists',     icon: Users },
  { id: 'ALBUMS',      label: 'Albums',      icon: Disc3 },
  { id: 'GENRES',      label: 'Genres',      icon: ListMusic },
  { id: 'VAULT',       label: 'The Vault',   icon: Archive },
  { id: 'PODCASTS',    label: 'Podcasts',    icon: Mic2 },
  { id: 'AUDIO_BOOKS', label: 'Audiobooks',  icon: BookOpen },
  { id: 'PLAYLISTS',   label: 'Playlists',   icon: ListMusic },
  { id: 'CONSERVATORY',label: 'Conservatory',icon: GraduationCap },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

const ACCENT = '#22D3AA';           // Chora's teal, from the platform's service palette
const ACCENT_WARM = '#FF8C00';      // Plajah orange, used for the focus ring
// The house gradient. Used at low opacity as atmosphere, and at full strength only on the two
// things that should pull the eye: the wordmark and the Plajah+ entry. Spending it anywhere
// else would make everything shout and nothing read.
const BRAND = 'linear-gradient(135deg, #FF8C00 0%, #D40055 52%, #6B0099 100%)';

interface Rail { id: string; title: string; items: Album[]; }

const ChoraTvView: React.FC<{
  userProfile: UserProfile | null;
  onSelectAlbum: (album: Album) => void;
  onOpenSection?: (id: SectionId) => void;
  onOpenPlus?: () => void;
}> = ({ userProfile, onSelectAlbum, onOpenSection, onOpenPlus }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [upcoming, setUpcoming] = useState<Album[]>([]);
  const [artists, setArtists] = useState<UserProfile[]>([]);
  const [section, setSection] = useState<SectionId>('NEW');
  const [loading, setLoading] = useState(true);
  const { currentAlbum, isPlaying } = useGlobalPlayer();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [all, up, people] = await Promise.all([
        fetchAllPublicAlbums().catch(() => [] as Album[]),
        fetchUpcomingAlbums().catch(() => [] as Album[]),
        searchUsers('').catch(() => [] as UserProfile[]),
      ]);
      if (!alive) return;
      setAlbums((all || []).filter(a => a.type === 'MUSIC'));
      setUpcoming(up || []);
      setArtists((people || []).filter(u => (u as any).isArtist).slice(0, 20));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // The showcase carries what the banners used to: what's coming, what just landed, who to hear.
  const showcase = useMemo(() => [...upcoming.slice(0, 4), ...albums.slice(0, 6)].slice(0, 8), [upcoming, albums]);

  const rails: Rail[] = useMemo(() => {
    const recent = [...albums].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const byPlays = [...albums].sort((a, b) => ((b as any).playCount || 0) - ((a as any).playCount || 0));
    return [
      { id: 'recent',  title: 'Just Added',      items: recent.slice(0, 20) },
      { id: 'charts',  title: 'Charts',          items: byPlays.slice(0, 20) },
      { id: 'trending',title: 'Trending Now',    items: byPlays.slice(0, 20).reverse() },
    ].filter(r => r.items.length > 0);
  }, [albums]);

  // Rows the grid navigates: showcase first, then each rail. Declared, so nothing is guessed.
  const rows = useMemo(() => [
    { id: 'showcase', count: showcase.length },
    ...rails.map(r => ({ id: r.id, count: r.items.length })),
  ], [showcase.length, rails]);

  const { pos, zone, panelIndex, setPanelIndex, setZone } = useTvGrid({
    rows,
    panelCount: SECTIONS.length + 1,        // + the Plajah+ entry pinned at the bottom
    onSelect: (p, rowId) => {
      if (rowId === 'PANEL') {
        if (p.col === SECTIONS.length) { onOpenPlus?.(); return; }   // the pinned entry
        const s = SECTIONS[p.col];
        setSection(s.id);
        onOpenSection?.(s.id);
        setZone('CONTENT');
        return;
      }
      const item = rowId === 'showcase' ? showcase[p.col] : rails.find(r => r.id === rowId)?.items[p.col];
      if (item) onSelectAlbum(item);
    },
  });

  // Keep the focused card on screen. Scrolls the RAIL horizontally and the page vertically,
  // rather than relying on the browser to guess which axis mattered.
  const cellRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (zone !== 'CONTENT') return;
    const el = cellRefs.current[`${pos.row}:${pos.col}`];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [pos, zone]);

  const panelRefs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    if (zone !== 'PANEL') return;
    panelRefs.current[panelIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [panelIndex, zone]);

  const Card: React.FC<{ album: Album; focused: boolean; large?: boolean; refKey: string }> = ({ album, focused, large, refKey }) => {
    const playing = !!currentAlbum && (currentAlbum as any).id === album.id;
    return (
    <div
      ref={el => { cellRefs.current[refKey] = el; }}
      className={`shrink-0 transition-transform duration-150 ${large ? 'w-64' : 'w-40'} ${focused ? 'scale-105' : ''}`}
    >
      <div
        className="relative rounded-2xl overflow-hidden bg-white/[0.05]"
        style={{
          aspectRatio: '1',
          // The ring is drawn INSIDE the card, not as an outline. An outline with an offset gets
          // clipped by the rail's overflow and disappears exactly when you need it.
          // Focus outranks the playing ring: you always need to see where you are more than you
          // need to see what is playing.
          boxShadow: focused
            ? `inset 0 0 0 4px ${ACCENT_WARM}, 0 12px 32px rgba(0,0,0,0.55)`
            : playing ? `inset 0 0 0 3px ${ACCENT}` : 'none',
        }}
      >
        {album.coverImage
          ? <img src={thumb(album.coverImage, large ? THUMB.card : THUMB.small)} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full grid place-items-center"><Music2 size={28} className="text-white/20" /></div>}
        {focused && (
          <span className="absolute bottom-2 right-2 w-9 h-9 rounded-full grid place-items-center" style={{ background: ACCENT_WARM }}>
            <Play size={16} className="text-black ml-0.5" fill="black" />
          </span>
        )}
        {playing && !focused && (
          // Three bars rather than a label: at ten feet the shape reads before any word does.
          <span className="absolute bottom-2 left-2 flex items-end gap-[3px] h-6 px-2 rounded-full bg-black/70">
            {[0, 1, 2].map(b => (
              <span
                key={b}
                className="w-[3px] rounded-full self-center"
                style={{
                  background: ACCENT,
                  height: isPlaying ? undefined : '5px',
                  animation: isPlaying ? `choraTvBar 0.9s ease-in-out ${b * 0.18}s infinite alternate` : 'none',
                }}
              />
            ))}
          </span>
        )}
      </div>
      <p className={`mt-2 font-bold truncate ${focused ? 'text-white' : 'text-white/65'} ${large ? 'text-sm' : 'text-xs'}`}>
        {album.title || 'Untitled'}
      </p>
      <p className="text-[11px] text-white/40 truncate">{album.artist || ''}</p>
    </div>
    );
  };

  // A short rule under each section title, tinted with the brand gradient. It gives the rails a
  // spine without adding another box, and it is the one place the full gradient repeats.
  const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mb-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">{children}</h2>
      <span className="block mt-1.5 h-[2px] w-11 rounded-full" style={{ background: BRAND }} />
    </div>
  );

  return (
    // data-tv-capture tells the global spatial layer to keep its hands off: this screen owns
    // its arrows, and two navigation systems acting on one press is how the old one broke.
    <div className="relative flex h-full bg-[#07070a]" data-tv-capture>
      <style>{`@keyframes choraTvBar { from { height: 4px } to { height: 14px } }`}</style>
      {/* Brand atmosphere: one wide bloom behind the content, well under the type. On an OLED panel
          a flat black field reads as switched-off; this gives it depth without competing. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: 'radial-gradient(90% 55% at 62% -8%, rgba(212,0,85,0.16) 0%, rgba(107,0,153,0.10) 42%, transparent 72%)' }}
      />
      {/* ── Sections rail ── */}
      <aside className="relative w-60 shrink-0 border-r border-white/[0.07] flex flex-col py-6 bg-black/40">
        <div className="px-6 mb-7">
          <p
            className="text-2xl font-black italic tracking-tighter leading-none"
            style={{ background: BRAND, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >CHORA</p>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-1" style={{ color: ACCENT }}>Music</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            const focused = zone === 'PANEL' && panelIndex === i;
            const active = section === s.id;
            return (
              <div
                key={s.id}
                ref={el => { panelRefs.current[i] = el; }}
                onClick={() => { setPanelIndex(i); setSection(s.id); onOpenSection?.(s.id); }}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-colors ${
                  focused ? 'bg-white text-black' : active ? 'bg-white/[0.08] text-white' : 'text-white/50'
                }`}
              >
                {/* The active section keeps a gradient tick even while focus is elsewhere, so the
                    viewer never loses track of which section the content on the right belongs to. */}
                {active && !focused && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full" style={{ background: BRAND }} />
                )}
                <Icon size={16} style={active && !focused ? { color: ACCENT } : undefined} />
                <span className="text-[13px] font-bold">{s.label}</span>
              </div>
            );
          })}
        </nav>

        {/* Plajah+ lives here rather than as a banner over the content — reachable, not in the way. */}
        <div
          ref={el => { panelRefs.current[SECTIONS.length] = el; }}
          onClick={onOpenPlus}
          className={`mx-3 mt-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
            zone === 'PANEL' && panelIndex === SECTIONS.length
              ? 'bg-white text-black'
              : 'text-white'
          }`}
          style={zone === 'PANEL' && panelIndex === SECTIONS.length ? undefined : { background: BRAND }}
        >
          <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
            <Crown size={14} /> Plajah+
          </span>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="relative flex-1 overflow-y-auto px-10 py-7">
        {loading ? (
          <div className="h-full grid place-items-center text-white/30 text-xs font-black uppercase tracking-[0.3em]">Loading…</div>
        ) : (
          <>
            <section className="mb-9">
              <SectionHeading>Featured</SectionHeading>
              <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
                {showcase.map((a, i) => (
                  <Card key={a.id} album={a} large refKey={`0:${i}`}
                        focused={zone === 'CONTENT' && isFocused(pos, 0, i)} />
                ))}
              </div>
            </section>

            {rails.map((rail, rIdx) => (
              <section key={rail.id} className="mb-8">
                <SectionHeading>{rail.title}</SectionHeading>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {rail.items.map((a, i) => (
                    <Card key={a.id} album={a} refKey={`${rIdx + 1}:${i}`}
                          focused={zone === 'CONTENT' && isFocused(pos, rIdx + 1, i)} />
                  ))}
                </div>
              </section>
            ))}

            {rails.length === 0 && (
              <p className="text-white/35 text-sm">Nothing here yet.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default ChoraTvView;
