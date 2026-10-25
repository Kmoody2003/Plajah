// Two Halloween-vault shelves:
//   • MoonbreakerSoundtrackSection — Brian James Gage's "Pumpkin Patch: Moonbreaker" soundtrack,
//     played inline through the site's own persistent player (GlobalPlayer → __plajah_audio__ and
//     Chora's HLS streams), so it keeps playing as you browse and resumes like any Chora album.
//   • HalloweenBookshelf — the Lorea classics tagged Horror, Gothic fiction or Ghost stories, each
//     opening in the Lorea reader. Pulled from the catalog (data/classicBooks.ts), never invented.

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Music2, Pause, Play, Shuffle } from 'lucide-react';
import type { Album, Track } from '../../types';
import { fetchAlbumById } from '../../services/backendService';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { CLASSIC_BOOKS } from '../../data/classicBooks';
import { openClassicInLorea } from '../../services/loreaOpen';

export const MOONBREAKER_ALBUM_ID = 'album_pumpkin-patch-moonbreaker';
const PHONE_TRACKS = 8;

const mmss = (sec?: number) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const MoonbreakerSoundtrackSection: React.FC = () => {
  const [album, setAlbum] = useState<Album | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { currentTrack, currentAlbum, isPlaying, playTrack, togglePlay } = useGlobalPlayerState();

  useEffect(() => {
    let alive = true;
    fetchAlbumById(MOONBREAKER_ALBUM_ID).then(a => { if (alive) { setAlbum(a); setFailed(!a); } }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  const tracks: Track[] = useMemo(
    () => ((album?.tracks || []) as Track[]).slice().sort((a: any, b: any) => (Number(a.trackNo) || 0) - (Number(b.trackNo) || 0)),
    [album],
  );
  const albumIsLoaded = !!album && currentAlbum?.id === album.id;
  const totalSec = tracks.reduce((a, t) => a + (Number(t.duration) || 0), 0);
  const playable = album ? ({ ...album, tracks } as Album) : null;

  const playAt = (t: Track) => {
    if (!playable) return;
    if (albumIsLoaded && currentTrack?.id === t.id) { togglePlay(); return; }
    playTrack(t, playable, 'LIBRARY');
  };
  const shuffle = () => tracks.length && playAt(tracks[Math.floor(Math.random() * tracks.length)]);

  if (failed) return null; // nothing to show rather than a broken card

  return (
    <section aria-labelledby="moonbreaker-heading" className="rounded-3xl overflow-hidden border border-orange-500/30 bg-gradient-to-br from-[#1b0d06] via-[#120a16] to-[#0b0510]">
      <div className="p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8">
        {/* Album art + actions */}
        <div className="lg:col-span-4 flex lg:flex-col gap-4 items-center lg:items-start">
          <div className="w-28 sm:w-40 lg:w-full shrink-0 aspect-square rounded-2xl overflow-hidden border border-orange-400/40 bg-black/50 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
            {album?.coverImage
              ? <img src={(album as any).coverThumb || album.coverImage} alt="Pumpkin Patch: Moonbreaker soundtrack cover" className="w-full h-full object-cover" />
              : <div className="w-full h-full animate-pulse bg-white/5" />}
          </div>
          <div className="min-w-0 space-y-1.5 lg:w-full">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-300 flex items-center gap-1.5"><Music2 size={12} /> Official Soundtrack</p>
            <h2 id="moonbreaker-heading" className="text-xl sm:text-3xl font-black uppercase tracking-tight leading-[1.05] text-white">
              Pumpkin Patch: <span className="text-orange-400">Moonbreaker</span>
            </h2>
            <p className="text-[12px] sm:text-sm font-bold text-[#FFB68D]">Brian James Gage</p>
            <p className="text-[11px] text-white/50">
              {tracks.length ? `${tracks.length} tracks · ${Math.round(totalSec / 60)} min` : 'Loading…'}
            </p>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-3 min-w-0">
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              type="button"
              disabled={!tracks.length}
              onClick={() => (albumIsLoaded ? togglePlay() : tracks[0] && playAt(tracks[0]))}
              className="h-12 px-6 rounded-full bg-orange-500 hover:bg-orange-400 text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
            >
              {albumIsLoaded && isPlaying ? <><Pause size={16} fill="currentColor" /> Pause</> : <><Play size={16} fill="currentColor" /> {albumIsLoaded ? 'Resume' : 'Play'}</>}
            </button>
            <button
              type="button"
              disabled={!tracks.length}
              onClick={shuffle}
              className="h-12 px-6 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
            >
              <Shuffle size={15} /> Shuffle
            </button>
          </div>

          {/* Track list: a short list on phones (expand for all), a scrolling column on desktop. */}
          <ol className="rounded-2xl border border-white/10 bg-black/30 divide-y divide-white/5 lg:max-h-[440px] lg:overflow-y-auto">
            {tracks.map((t, i) => {
              const active = albumIsLoaded && currentTrack?.id === t.id;
              const hiddenOnPhone = !showAll && i >= PHONE_TRACKS;
              return (
                <li key={t.id} className={hiddenOnPhone ? 'hidden lg:block' : ''}>
                  <button
                    type="button"
                    onClick={() => playAt(t)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full min-h-[52px] flex items-center gap-3 px-3 sm:px-4 py-2 text-left transition-colors cursor-pointer ${active ? 'bg-orange-500/15' : 'hover:bg-white/[0.04]'}`}
                  >
                    <span className="w-6 shrink-0 text-center">
                      {active && isPlaying
                        ? <Pause size={14} className="mx-auto text-orange-300" fill="currentColor" />
                        : active
                          ? <Play size={14} className="mx-auto text-orange-300" fill="currentColor" />
                          : <span className="text-[12px] tabular-nums text-white/40">{i + 1}</span>}
                    </span>
                    <span className={`flex-1 min-w-0 text-[13px] sm:text-sm font-bold truncate ${active ? 'text-orange-200' : 'text-white'}`}>{t.title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-white/45">{mmss(t.duration)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {tracks.length > PHONE_TRACKS && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="lg:hidden w-full h-11 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/75 flex items-center justify-center gap-1.5"
            >
              {showAll ? 'Show fewer' : `Show all ${tracks.length} tracks`}
              <ChevronDown size={14} className={showAll ? 'rotate-180' : ''} />
            </button>
          )}
          <p className="text-[11px] text-white/40">Keeps playing while you browse the vault — control it from the player bar.</p>
        </div>
      </div>
    </section>
  );
};

/** "Shelley, Mary Wollstonecraft" → "Mary Wollstonecraft Shelley" */
const displayAuthor = (a?: string) => {
  if (!a) return '';
  const [last, first] = a.split(',').map(s => s.trim());
  return first ? `${first} ${last}` : last;
};

const THEME = /horror|gothic|ghost/i;
// Out-and-out horror first, then the gothic romances and ghost stories.
const rank = (subjects: string[]) => (subjects.some(s => /horror/i.test(s)) ? 0 : subjects.some(s => /ghost/i.test(s)) ? 1 : 2);

export const HalloweenBookshelf: React.FC = () => {
  const books = useMemo(
    () => CLASSIC_BOOKS
      .filter(b => b.subjects.some(s => THEME.test(s)))
      .sort((a, b) => rank(a.subjects) - rank(b.subjects) || b.download_count - a.download_count),
    [],
  );
  if (!books.length) return null;

  return (
    <section aria-labelledby="halloween-books-heading">
      <div className="flex items-end justify-between mb-5 gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1.5 flex items-center gap-1.5"><BookOpen size={12} /> From the Lorea Library</p>
          <h2 id="halloween-books-heading" className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">Gothic &amp; Horror Classics to Read</h2>
          <p className="text-xs text-white/45 mt-1">Free to read in Lorea, with notes, highlights and read-aloud.</p>
        </div>
      </div>
      {/* Phone: a swipeable rail of covers; md+: a grid. */}
      <div className="flex overflow-x-auto snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 no-scrollbar gap-3 -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 md:grid md:grid-cols-4 lg:grid-cols-8 md:gap-4 md:overflow-visible">
        {books.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => openClassicInLorea({ id: b.id, title: b.title, authors: b.authors, cover: b.coverImage, desc: b.description })}
            className="group w-[38%] sm:w-[28%] shrink-0 snap-start md:w-auto text-left cursor-pointer"
          >
            <span className="block aspect-[2/3] rounded-xl overflow-hidden border border-white/10 group-hover:border-orange-400/50 bg-white/5 shadow-lg">
              {b.coverImage && <img src={b.coverImage} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
            </span>
            <span className="block mt-2 text-[12px] font-black leading-snug text-white line-clamp-2">{b.title}</span>
            <span className="block text-[11px] text-white/50 truncate">{displayAuthor(b.authors[0])}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-orange-300"><BookOpen size={11} /> Read in Lorea</span>
          </button>
        ))}
      </div>
    </section>
  );
};
