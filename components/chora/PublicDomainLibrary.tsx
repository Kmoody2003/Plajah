// ─────────────────────────────────────────────────────────────────────────────
// PublicDomainLibrary — a real, listenable shelf of public domain recordings
// streaming straight from the Internet Archive, rendered as a tab inside
// <ChoraConservatory>.
//
// Playback deliberately reuses the platform's existing global player
// (`useGlobalPlayer().playTrack`) rather than introducing a second audio engine —
// so a Chopin ballade lands in the same transport, queue, media session and
// lock-screen controls as everything else in Chora.
//
// Every item shows its source link and the rights line the service derived from
// the item's own metadata, including whether that line is a declared licence or
// an inference from the recording's date.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Play, Loader2, ExternalLink, ScrollText, Disc3, ChevronLeft,
  ShieldCheck, Info, Radio, AudioLines,
} from 'lucide-react';
import {
  searchPlayableItems, resolveItems, type PDItem, type PDTrack, type PDRights,
} from '../../services/publicDomainMusic';
import { PD_SHELVES, PD_SEARCH_SCOPE, type PDShelf } from '../../data/pdMusicCollections';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
import type { Track, Album } from '../../types';

const ACCENT = '#E0A458';

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtDuration = (s?: number): string => {
  if (!s || !isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

/** Map an archive item + its files onto the platform's Track/Album shapes so the
 *  existing global player can drive them with no special-casing. */
const toAlbum = (item: PDItem): Album => ({
  id: `pd-${item.identifier}`,
  title: item.title,
  artist: item.creator,
  coverImage: item.coverUrl,
  description: item.description,
  createdAt: 0,
  themeColor: ACCENT,
  genre: item.subjects[0] || 'Public Domain',
  tracks: item.tracks.map(toTrack(item)),
});

const toTrack = (item: PDItem) => (t: PDTrack, i: number): Track => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  url: t.url,
  duration: t.durationSec,
  images: [item.coverUrl],
  albumId: `pd-${item.identifier}`,
  albumTitle: item.title,
  albumCover: item.coverUrl,
  trackNo: i + 1,
  mediaKind: 'AUDIO',
});

// ── rights line ──────────────────────────────────────────────────────────────

const RightsLine: React.FC<{ rights: PDRights; compact?: boolean }> = ({ rights, compact }) => {
  const declared = rights.basis === 'ITEM_LICENCE' || rights.basis === 'ITEM_RIGHTS_FIELD';
  const Icon = declared ? ShieldCheck : Info;
  const tone = declared ? ACCENT : 'rgba(255,255,255,0.42)';
  return (
    <div className={compact ? 'flex items-start gap-1.5' : 'flex items-start gap-2'}>
      <Icon size={compact ? 10 : 13} style={{ color: tone, marginTop: 2, flexShrink: 0 }} />
      <div className="min-w-0">
        <p
          className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest leading-snug`}
          style={{ color: tone }}
        >
          {rights.label}
        </p>
        {!compact && (
          <p className="text-[11px] text-white/35 leading-relaxed mt-1">
            {rights.detail}
            {rights.licenseUrl && (
              <>
                {' '}
                <a
                  href={rights.licenseUrl} target="_blank" rel="noreferrer"
                  className="underline underline-offset-2 hover:text-white/70 transition-colors"
                >
                  View licence
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

// ── item card ────────────────────────────────────────────────────────────────

const ItemCard: React.FC<{
  item: PDItem;
  index: number;
  onOpen: (item: PDItem) => void;
  onPlay: (item: PDItem) => void;
}> = ({ item, index, onOpen, onPlay }) => (
  <motion.article
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-30px' }}
    transition={{ duration: 0.3, delay: (index % 4) * 0.04 }}
    className="rounded-3xl border border-white/8 bg-white/[0.03] overflow-hidden hover:bg-white/[0.05] transition-colors flex flex-col group"
  >
    {/* Two sibling controls rather than a nested one — open on the artwork, play on the badge. */}
    <div className="relative aspect-square w-full overflow-hidden">
      <button
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.title}`}
        className="absolute inset-0 w-full h-full"
      >
        <img
          src={item.coverUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
        />
      </button>
      <button
        onClick={() => onPlay(item)}
        aria-label={`Play ${item.title}`}
        className="absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all"
        style={{ background: ACCENT, color: '#000' }}
      >
        <Play size={16} fill="#000" />
      </button>
    </div>

    <div className="p-4 flex flex-col flex-1">
      <p className="text-[9px] font-black uppercase tracking-[0.28em] truncate" style={{ color: ACCENT }}>
        {item.creator || 'Unknown performer'}
      </p>
      <button onClick={() => onOpen(item)} className="text-left">
        <h3 className="text-[14px] font-black tracking-tight leading-snug mt-1 line-clamp-2 hover:text-white transition-colors">
          {item.title}
        </h3>
      </button>

      <div className="flex items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-widest text-white/30">
        {item.year && <span>{item.year.slice(0, 4)}</span>}
        <span className="flex items-center gap-1"><AudioLines size={10} /> {item.tracks.length}</span>
      </div>

      <div className="mt-auto pt-3">
        <RightsLine rights={item.rights} compact />
      </div>
    </div>
  </motion.article>
);

// ── item detail (track list) ─────────────────────────────────────────────────

const ItemDetail: React.FC<{
  item: PDItem;
  onBack: () => void;
  onPlayTrack: (item: PDItem, index: number) => void;
  currentTrackId?: string | null;
}> = ({ item, onBack, onPlayTrack, currentTrackId }) => (
  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
    >
      <ChevronLeft size={13} /> Back to the library
    </button>

    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-5">
        <img
          src={item.coverUrl}
          alt=""
          className="w-full sm:w-44 h-44 object-cover rounded-2xl border border-white/10 shrink-0"
          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: ACCENT }}>
            {item.creator}
          </p>
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight mt-1">{item.title}</h2>

          <div className="flex items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-widest text-white/30 flex-wrap">
            {item.year && <span>{item.year}</span>}
            {item.publisher && <span>{item.publisher}</span>}
            <span>{item.tracks.length} {item.tracks.length === 1 ? 'recording' : 'recordings'}</span>
          </div>

          {item.description && (
            <p className="text-[12px] text-white/45 leading-relaxed mt-3 line-clamp-4">{item.description}</p>
          )}

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onPlayTrack(item, 0)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest"
              style={{ background: ACCENT, color: '#000' }}
            >
              <Play size={12} fill="#000" /> Play
            </button>
            <a
              href={item.itemUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors"
            >
              Source item on archive.org <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-white/8">
        <RightsLine rights={item.rights} />
      </div>
    </div>

    <div className="rounded-3xl border border-white/8 bg-white/[0.02] overflow-hidden">
      {item.tracks.map((t, i) => {
        const active = currentTrackId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onPlayTrack(item, i)}
            className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/[0.04] transition-colors text-left"
            style={active ? { background: `${ACCENT}12` } : undefined}
          >
            <span
              className="w-7 text-[10px] font-black tabular-nums shrink-0"
              style={{ color: active ? ACCENT : 'rgba(255,255,255,0.25)' }}
            >
              {active ? <Radio size={12} /> : String(i + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[13px] font-bold leading-snug truncate"
                style={{ color: active ? ACCENT : undefined }}
              >
                {t.title}
              </span>
              <span className="block text-[10px] text-white/30 truncate mt-0.5">{t.artist}</span>
            </span>
            <span className="text-[10px] font-bold tabular-nums text-white/25 shrink-0">
              {fmtDuration(t.durationSec)}
            </span>
          </button>
        );
      })}
    </div>
  </motion.div>
);

// ── shelf loading ────────────────────────────────────────────────────────────

/** Resolve a shelf: verified featured identifiers first, then the live query,
 *  de-duplicated. Anything that doesn't actually stream is silently dropped by
 *  the service, so a shelf can only ever render playable material. */
async function loadShelf(shelf: PDShelf): Promise<PDItem[]> {
  const featured = await resolveItems(shelf.featured);
  if (!shelf.query) return featured;
  const found = await searchPlayableItems(shelf.query, 12);
  const seen = new Set(featured.map(i => i.identifier));
  return [...featured, ...found.filter(i => !seen.has(i.identifier))];
}

// ── main ─────────────────────────────────────────────────────────────────────

const PublicDomainLibrary: React.FC = () => {
  const { playTrack, currentTrack } = useGlobalPlayer();

  const [shelfId, setShelfId] = useState(PD_SHELVES[0].id);
  const [items, setItems] = useState<PDItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<PDItem | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PDItem[] | null>(null);
  /** Guards against a slow shelf resolving after the user has moved on. */
  const reqRef = useRef(0);

  const shelf = PD_SHELVES.find(s => s.id === shelfId) ?? PD_SHELVES[0];

  useEffect(() => {
    const req = ++reqRef.current;
    setLoading(true);
    setOpen(null);
    setSearchResults(null);
    loadShelf(shelf)
      .then(res => { if (reqRef.current === req) { setItems(res); setLoading(false); } })
      .catch(() => { if (reqRef.current === req) { setItems([]); setLoading(false); } });
  }, [shelfId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) { setSearchResults(null); return; }
    const req = ++reqRef.current;
    setSearching(true);
    setOpen(null);
    // Scope the free-text search to the same pre-1929 window the shelves use, so a
    // search can't surface material whose public domain status we can't stand behind.
    const res = await searchPlayableItems(`${PD_SEARCH_SCOPE} AND (${q})`, 18);
    if (reqRef.current === req) { setSearchResults(res); setSearching(false); }
  }, [query]);

  const handlePlay = useCallback((item: PDItem, index = 0) => {
    const album = toAlbum(item);
    const track = album.tracks[index];
    if (track) playTrack(track, album, 'LIBRARY');
  }, [playTrack]);

  const visible = searchResults ?? items;
  const busy = searchResults ? searching : loading;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><Disc3 size={140} className="text-white" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>
          The Public Domain Library
        </p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Free To Listen, Forever</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-2xl">
          Real recordings streaming live from the Internet Archive — the Great 78 Project's shellac transfers and
          Musopen's public domain studio sessions. Everything plays in Chora's own player.
        </p>

        <div className="mt-4 flex items-center gap-2 max-w-lg">
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.05] border border-white/10">
            <Search size={13} className="text-white/30 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Search the archive — Caruso, ragtime, Bach…"
              className="bg-transparent outline-none text-[13px] w-full placeholder:text-white/25"
            />
          </div>
          <button
            onClick={runSearch}
            className="px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0"
            style={{ background: ACCENT, color: '#000' }}
          >
            Search
          </button>
          {searchResults && (
            <button
              onClick={() => { setSearchResults(null); setQuery(''); }}
              className="px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Shelf switch */}
      {!searchResults && (
        <div className="flex gap-2 flex-wrap">
          {PD_SHELVES.map(s => {
            const active = s.id === shelfId;
            return (
              <button
                key={s.id}
                onClick={() => setShelfId(s.id)}
                className="px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
                style={active
                  ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                  : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        {open ? (
          <ItemDetail
            key={`detail-${open.identifier}`}
            item={open}
            onBack={() => setOpen(null)}
            onPlayTrack={handlePlay}
            currentTrackId={currentTrack?.id}
          />
        ) : (
          <motion.div key={`grid-${shelfId}-${searchResults ? 'search' : 'shelf'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Shelf intro + rights basis */}
            {!searchResults && (
              <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: ACCENT }}>{shelf.eyebrow}</p>
                <h2 className="text-lg font-black uppercase tracking-tight mt-1">{shelf.label}</h2>
                <p className="text-[13px] text-white/50 leading-relaxed mt-2">{shelf.blurb}</p>
                <div className="mt-3 pt-3 border-t border-white/8 flex items-start gap-2">
                  <ScrollText size={13} style={{ color: ACCENT, marginTop: 2 }} className="shrink-0" />
                  <p className="text-[11px] text-white/35 leading-relaxed">{shelf.rightsNote}</p>
                </div>
              </div>
            )}

            {busy ? (
              <div className="flex items-center justify-center gap-2 py-20 text-white/35">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {searchResults ? 'Searching the archive' : 'Verifying recordings'}
                </span>
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-10 text-center">
                <Disc3 size={28} className="mx-auto text-white/15" />
                <p className="text-[11px] font-black uppercase tracking-widest text-white/35 mt-3">
                  Nothing playable found
                </p>
                <p className="text-[12px] text-white/25 mt-1.5 max-w-sm mx-auto">
                  The Internet Archive returned no streamable recordings for this. Try another shelf or search term.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {visible.map((item, i) => (
                  <ItemCard
                    key={item.identifier}
                    item={item}
                    index={i}
                    onOpen={setOpen}
                    onPlay={it => handlePlay(it, 0)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PublicDomainLibrary;
